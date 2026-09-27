// Express backend: AR registration, Omni O(1) compute API, MediaPipe assets,
// and the built React client. createApp() is exported so tests can mount it.

import express from 'express';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { solve, verifyAll, apFormula } from '../shared/omni/index.js';
import { verifyRegistration } from '../shared/security/arVerify.js';
import { TRUSTED_KEYS } from '../shared/security/trustedKeys.js';
import { verifyPassport, verifyChallenge } from '../shared/identity/omniId.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

export const MODEL_SOURCES = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'blaze_face_short_range.tflite':
    'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
};

/** Fixed-size map: oldest entries fall out, so memory is bounded. */
class BoundedMap extends Map {
  constructor(limit) {
    super();
    this.limit = limit;
  }
  set(k, v) {
    super.delete(k);
    super.set(k, v);
    if (this.size > this.limit) super.delete(this.keys().next().value);
    return this;
  }
}

function rateLimiter({ windowMs, max }) {
  const hits = new BoundedMap(10_000);
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? 'anon';
    const h = hits.get(key);
    const fresh = !h || now - h.start > windowMs;
    const entry = fresh ? { start: now, count: 1 } : { ...h, count: h.count + 1 };
    hits.set(key, entry);
    if (entry.count > max) return res.status(429).json({ error: 'too many requests' });
    next();
  };
}

function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: mediastream:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}

export function createApp({
  registryPath = join(root, 'server', 'ar', 'ar-register.json'),
  trustedKeys = TRUSTED_KEYS,
  clientDir = join(root, 'dist'),
  modelCacheDir = join(here, '.cache', 'models'),
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  dataDir = join(here, 'data'), // null keeps identities in memory only
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(securityHeaders);
  app.use(express.json({ limit: '16kb' }));

  const registrations = new BoundedMap(1000);
  const loadRegistry = async () => JSON.parse(await readFile(registryPath, 'utf8'));

  // ------------------------------------------------------------------ health
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'digital-ar-omni-wellness', time: now().toISOString() }));

  // -------------------------------------------------------------- AR registry
  app.get('/api/ar/registry', async (_req, res, next) => {
    try {
      res.set('Cache-Control', 'no-cache').json(await loadRegistry());
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ar/register', rateLimiter({ windowMs: 60_000, max: 30 }), async (req, res, next) => {
    try {
      const { elementId, version, integrity, device = {} } = req.body ?? {};
      if (typeof elementId !== 'string' || typeof version !== 'string' || typeof integrity !== 'string') {
        return res.status(400).json({ error: 'elementId, version and integrity are required strings' });
      }
      const registry = await loadRegistry();
      const check = await verifyRegistration(registry, trustedKeys, now());
      if (!check.ok) return res.status(503).json({ error: `server registry invalid: ${check.reason}` });
      const el = check.element;
      if (el.id !== elementId || el.version !== version || registry.integrity !== integrity) {
        return res.status(409).json({ error: 'element does not match the signed registry', expected: { elementId: el.id, version: el.version } });
      }
      const receipt = {
        registrationId: randomUUID(),
        elementId: el.id,
        version: el.version,
        capabilities: el.capabilities,
        keyId: registry.keyId,
        registeredAt: now().toISOString(),
        expiresAt: registry.expiresAt,
        device: {
          platform: String(device.platform ?? '').slice(0, 64),
          screen: String(device.screen ?? '').slice(0, 32),
        },
      };
      registrations.set(receipt.registrationId, receipt);
      res.status(201).json(receipt);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ar/registrations/:id', (req, res) => {
    const r = registrations.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'unknown registration' });
    res.json(r);
  });

  // --------------------------------------------- Omni ID (one person, one AR element)
  const identities = new BoundedMap(5000);
  const identityFile = dataDir ? join(dataDir, 'identities.json') : null;
  if (identityFile && existsSync(identityFile)) {
    try {
      for (const r of JSON.parse(readFileSync(identityFile, 'utf8'))) identities.set(r.passport.id, r);
    } catch (err) {
      console.warn(`could not load ${identityFile}: ${err.message}`);
    }
  }
  let saving = Promise.resolve();
  const persistIdentities = () => {
    if (!identityFile) return;
    const snapshot = JSON.stringify([...identities.values()]);
    saving = saving
      .then(() => mkdir(dataDir, { recursive: true }))
      .then(() => writeFile(identityFile, snapshot))
      .catch((err) => console.warn(`could not save identities: ${err.message}`));
  };
  const nonces = new BoundedMap(5000);
  const NONCE_TTL_MS = 120_000;

  app.post('/api/identity/register', rateLimiter({ windowMs: 60_000, max: 30 }), async (req, res, next) => {
    try {
      const passport = req.body?.passport;
      const check = await verifyPassport(passport);
      if (!check.ok) return res.status(400).json({ error: check.reason });
      const prior = identities.get(passport.id);
      const record = { passport, registeredAt: prior?.registeredAt ?? now().toISOString(), updatedAt: now().toISOString() };
      identities.set(passport.id, record);
      persistIdentities();
      res.status(prior ? 200 : 201).json({ id: passport.id, profile: passport.profile, registeredAt: record.registeredAt, updatedAt: record.updatedAt });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/identity/:id', (req, res) => {
    const r = identities.get(req.params.id);
    if (!r) return res.status(404).json({ error: 'unknown identity' });
    res.json(r);
  });

  app.post('/api/identity/challenge', rateLimiter({ windowMs: 60_000, max: 60 }), (req, res) => {
    const id = req.body?.id;
    if (typeof id !== 'string' || !identities.has(id)) return res.status(404).json({ error: 'unknown identity' });
    const nonce = randomUUID();
    nonces.set(nonce, { id, expires: Date.now() + NONCE_TTL_MS });
    res.json({ nonce, expiresInMs: NONCE_TTL_MS });
  });

  app.post('/api/identity/verify', rateLimiter({ windowMs: 60_000, max: 60 }), async (req, res, next) => {
    try {
      const { id, nonce, signature } = req.body ?? {};
      const n = nonces.get(nonce);
      nonces.delete(nonce); // single use, whatever the outcome
      if (!n || n.id !== id || n.expires < Date.now()) return res.status(400).json({ error: 'invalid or expired challenge' });
      const r = identities.get(id);
      if (!r) return res.status(404).json({ error: 'unknown identity' });
      const ok = await verifyChallenge(r.passport.publicKey, id, nonce, signature);
      if (!ok) return res.status(401).json({ error: 'signature does not prove key ownership' });
      res.json({ ok: true, id, profile: r.passport.profile, verifiedAt: now().toISOString() });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------- Omni API
  const omni = (kind, params, res) => {
    try {
      res.json(solve(kind, params));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };
  app.get('/api/omni/ap', (req, res) => omni('ap', req.query, res));
  app.get('/api/omni/gp', (req, res) => omni('gp', req.query, res));
  app.get('/api/omni/hp', (req, res) => omni('hp', req.query, res));
  app.post('/api/omni/lattice', (req, res) => omni('lattice', req.body ?? {}, res));
  app.get('/api/omni/formula/:d', (req, res) => {
    const d = Number(req.params.d);
    if (!Number.isInteger(d) || d < 0 || d > 60) return res.status(400).json({ error: 'd must be an integer 0..60' });
    res.json({ d, formula: apFormula(d) });
  });

  let verifyCache = null;
  app.get('/api/omni/verify', (_req, res) => {
    verifyCache ??= (() => {
      const t0 = performance.now();
      const r = verifyAll({ ap: { maxL: 16, maxPower: 10 }, gp: {}, hp: { maxL: 24, maxPower: 12 } });
      return {
        ...r,
        ms: Math.round(performance.now() - t0),
        results: r.results.map(({ failures, ...rest }) => ({ ...rest, failures: failures.length })),
      };
    })();
    res.json(verifyCache);
  });

  // --------------------------------------------------- MediaPipe wasm + models
  app.use(
    '/mediapipe/wasm',
    express.static(join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm'), { maxAge: '7d', immutable: true }),
  );

  const inflight = new Map();
  app.get('/models/:name', async (req, res, next) => {
    const { name } = req.params;
    const source = MODEL_SOURCES[name];
    if (!source) return res.status(404).json({ error: 'unknown model' });
    const file = join(modelCacheDir, name);
    try {
      if (!existsSync(file) || (await stat(file)).size === 0) {
        if (!inflight.has(name)) {
          inflight.set(
            name,
            (async () => {
              const r = await fetchImpl(source);
              if (!r.ok) throw new Error(`model download failed: HTTP ${r.status}`);
              await mkdir(modelCacheDir, { recursive: true });
              await writeFile(file, Buffer.from(await r.arrayBuffer()));
            })().finally(() => inflight.delete(name)),
          );
        }
        await inflight.get(name);
      }
      // dotfiles: 'allow' — the cache lives under server/.cache, which send() would otherwise 404.
      res.set('Cache-Control', 'public, max-age=604800').sendFile(file, { dotfiles: 'allow' });
    } catch (err) {
      next(err);
    }
  });

  // ------------------------------------------------------------ React client
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(join(clientDir, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? err.statusCode ?? 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'internal error' : err.message });
  });

  return app;
}
