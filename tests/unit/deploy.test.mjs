// Netlify + Render compatibility: the serverless handler, the stateless Omni
// ID challenge across instances, and config files that must stay in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, CSP } from '../../server/app.js';
import { handler } from '../../netlify/functions/api.mjs';
import { copyWasm } from '../../scripts/copy-wasm.mjs';
import { createIdentity, signChallenge } from '../../shared/identity/omniId.js';

const root = new URL('../../', import.meta.url);
const text = (p) => readFile(new URL(p, root), 'utf8');

/** Minimal API Gateway v1 event, as Netlify Functions deliver them. */
const event = (method, path, body, query = {}) => ({
  httpMethod: method,
  path,
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
  multiValueHeaders: {},
  queryStringParameters: query,
  multiValueQueryStringParameters: Object.fromEntries(Object.entries(query).map(([k, v]) => [k, [v]])),
  body: body ? JSON.stringify(body) : null,
  isBase64Encoded: false,
});
const call = async (...args) => {
  const r = await handler(event(...args), {});
  return { status: r.statusCode, body: JSON.parse(r.body), headers: r.headers };
};

test('Netlify handler serves the API on both the rewritten and the direct path', async () => {
  const direct = await call('GET', '/.netlify/functions/api/health');
  assert.equal(direct.status, 200);
  assert.equal(direct.body.ok, true);
  assert.match(direct.headers['content-security-policy'], /default-src 'self'/);
  const rewritten = await call('GET', '/api/health');
  assert.equal(rewritten.status, 200);
  const ap = await call('GET', '/.netlify/functions/api/omni/ap', null, { F: '3', L: '7', p: '3' });
  assert.equal(ap.body.value, '775');
});

test('Netlify handler verifies and registers the bundled AR registry', async () => {
  const { body: reg } = await call('GET', '/api/ar/registry');
  const r = await call('POST', '/api/ar/register', { elementId: reg.element.id, version: reg.element.version, integrity: reg.integrity });
  assert.equal(r.status, 201);
});

test('Omni ID challenge is stateless: issued by one instance, proven at another', async () => {
  const listen = (app) => new Promise((ok) => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  const [a, b, c] = await Promise.all([
    listen(createApp({ dataDir: null, secret: 'shared-secret' })),
    listen(createApp({ dataDir: null, secret: 'shared-secret' })),
    listen(createApp({ dataDir: null, secret: 'other-secret' })),
  ]);
  const url = (s, p) => `http://127.0.0.1:${s.address().port}${p}`;
  const post = (s, p, d) => fetch(url(s, p), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
  try {
    const me = await createIdentity({ displayName: 'Roamer' });
    const { nonce } = await (await post(a, '/api/identity/challenge', { id: me.passport.id })).json();
    const signature = await signChallenge(me.keyPair.privateKey, me.passport.id, nonce);
    const proof = { id: me.passport.id, nonce, signature, passport: me.passport };

    assert.equal((await post(c, '/api/identity/verify', proof)).status, 400, 'different secret rejects');
    const ok = await post(b, '/api/identity/verify', proof);
    assert.equal(ok.status, 200, 'instance B never saw the identity or the nonce');
    assert.equal((await ok.json()).profile.displayName, 'Roamer');
    assert.equal((await post(b, '/api/identity/verify', proof)).status, 400, 'replay rejected');

    const { nonce: n2 } = await (await post(a, '/api/identity/challenge', { id: me.passport.id })).json();
    const sig2 = await signChallenge(me.keyPair.privateKey, me.passport.id, n2);
    assert.equal((await post(b, '/api/identity/verify', { id: me.passport.id, nonce: n2, signature: sig2 })).status, 404, 'no passport, unknown here');
    const forgedNonce = n2.replace(/.$/, (ch) => (ch === 'A' ? 'B' : 'A'));
    assert.equal((await post(b, '/api/identity/verify', { ...proof, nonce: forgedNonce })).status, 400);
    assert.equal((await post(a, '/api/identity/challenge', { id: 'not-an-id' })).status, 400);
  } finally {
    [a, b, c].forEach((s) => s.close());
  }
});

test('netlify.toml CSP matches the Express CSP exactly', async () => {
  const toml = await text('netlify.toml');
  const m = /Content-Security-Policy = "([^"]+)"/.exec(toml);
  assert.ok(m, 'CSP header missing from netlify.toml');
  assert.equal(m[1], CSP);
  assert.match(toml, /from = "\/api\/\*"\s+to = "\/\.netlify\/functions\/api\/:splat"/);
  assert.match(toml, /command = "npm run build:netlify"/);
});

test('Netlify model proxies point at the same sources the server uses', async () => {
  const toml = await text('netlify.toml');
  const { MODEL_SOURCES } = await import('../../server/app.js');
  for (const [name, src] of Object.entries(MODEL_SOURCES)) {
    assert.match(toml, new RegExp(`from = "/models/${name.replace('.', '\\.')}"\\s+to = "${src.replace(/[.?*+]/g, '\\$&')}"`));
  }
});

test('render.yaml binds 0.0.0.0, trusts one proxy and health-checks the API', async () => {
  const y = await text('render.yaml');
  for (const re of [/runtime: node/, /buildCommand: npm ci && npm run build/, /startCommand: npm start/, /healthCheckPath: \/api\/health/, /key: HOST\s+value: 0\.0\.0\.0/, /key: TRUST_PROXY\s+value: "1"/, /key: OMNI_SECRET\s+generateValue: true/]) {
    assert.match(y, re);
  }
  const pkg = JSON.parse(await text('package.json'));
  assert.equal(pkg.scripts.start, 'node server/index.js');
});

test('copy-wasm stages the MediaPipe runtime for static hosts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'omni-dist-'));
  try {
    const files = await copyWasm(dir);
    assert.ok(files.includes('vision_wasm_internal.wasm'));
    assert.ok((await readdir(join(dir, 'mediapipe', 'wasm'))).includes('vision_wasm_internal.js'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
