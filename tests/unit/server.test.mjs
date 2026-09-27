import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../server/app.js';
import { createIdentity, signChallenge } from '../../shared/identity/omniId.js';

let server;
let base;
let tmp;

async function listen(app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
}

const get = (p) => fetch(base + p).then(async (r) => ({ status: r.status, body: await r.json(), headers: r.headers }));
const post = (p, data) =>
  fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(async (r) => ({
    status: r.status,
    body: await r.json(),
  }));

before(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'omni-test-'));
  const fakeModel = async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  server = await listen(createApp({ dataDir: join(tmp, 'data'), modelCacheDir: join(tmp, '.cache', 'models'), clientDir: join(tmp, 'no-client'), fetchImpl: fakeModel }));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server?.close();
  await rm(tmp, { recursive: true, force: true });
});

test('health and security headers', async () => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('AR registry is served and registration issues a receipt', async () => {
  const { body: registry } = await get('/api/ar/registry');
  assert.equal(registry.element.id, 'omni-digital-twin');
  const ok = await post('/api/ar/register', { elementId: registry.element.id, version: registry.element.version, integrity: registry.integrity, device: { platform: 'test' } });
  assert.equal(ok.status, 201);
  assert.match(ok.body.registrationId, /^[0-9a-f-]{36}$/);
  assert.ok(ok.body.capabilities.includes('twin'));
  const again = await get(`/api/ar/registrations/${ok.body.registrationId}`);
  assert.equal(again.body.elementId, 'omni-digital-twin');

  const wrongVersion = await post('/api/ar/register', { elementId: registry.element.id, version: '9.9.9', integrity: registry.integrity });
  assert.equal(wrongVersion.status, 409);
  const bad = await post('/api/ar/register', { elementId: 1 });
  assert.equal(bad.status, 400);
});

test('a tampered server registry is refused', async () => {
  const path = join(tmp, 'reg.json');
  const reg = JSON.parse(await readFile(new URL('../../server/ar/ar-register.json', import.meta.url), 'utf8'));
  reg.element.capabilities.push('everything');
  await writeFile(path, JSON.stringify(reg));
  const s = await listen(createApp({ registryPath: path, dataDir: null }));
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/ar/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ elementId: reg.element.id, version: reg.element.version, integrity: reg.integrity }),
    });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /integrity/);
  } finally {
    s.close();
  }
});

test('Omni API: AP, GP, HP, lattice, formula and verification', async () => {
  assert.equal((await get('/api/omni/ap?F=3&L=7&p=3')).body.value, '775');
  assert.equal((await get('/api/omni/gp?a=1&r=2&n=5&s=3')).body.value, '4681');
  const hp = await get('/api/omni/hp?F=3&L=7&s=3');
  assert.equal(Number(hp.body.decimal).toFixed(8), '0.06820712');
  const big = await get('/api/omni/ap?F=1&L=1000000000000000000000000000000&p=10');
  assert.equal(big.status, 200);
  assert.equal(big.body.terms, '1000000000000000000000000000000');
  const lat = await post('/api/omni/lattice', { dims: [{ F: 1, L: 3, p: 1 }, { F: 1, L: 3, p: 1 }] });
  assert.equal(lat.body.value, '36');
  assert.equal((await get('/api/omni/formula/3')).body.formula, 'X·M·[M^2 + 3·μ2]');
  assert.equal((await get('/api/omni/ap?F=1&L=5&p=9999')).status, 400);
  assert.equal((await get('/api/omni/ap?F=abc&L=5&p=1')).status, 400);
  const v = await get('/api/omni/verify');
  assert.equal(v.body.failures, 0);
  assert.ok(v.body.cases > 5000);
});

test('Omni ID: register, challenge, prove ownership, persist across restarts', async () => {
  const me = await createIdentity({ displayName: 'Tester', twinName: 'Nova' });
  const reg = await post('/api/identity/register', { passport: me.passport });
  assert.equal(reg.status, 201);
  assert.equal((await post('/api/identity/register', { passport: me.passport })).status, 200, 'idempotent');
  assert.equal((await post('/api/identity/register', { passport: { ...me.passport, signature: 'AAAA' } })).status, 400);

  const { body: ch } = await post('/api/identity/challenge', { id: me.passport.id });
  const signature = await signChallenge(me.keyPair.privateKey, me.passport.id, ch.nonce);
  const ok = await post('/api/identity/verify', { id: me.passport.id, nonce: ch.nonce, signature });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.profile.twinName, 'Nova');
  assert.equal((await post('/api/identity/verify', { id: me.passport.id, nonce: ch.nonce, signature })).status, 400, 'nonce is single-use');

  const imposter = await createIdentity({});
  const { body: ch2 } = await post('/api/identity/challenge', { id: me.passport.id });
  const forged = await signChallenge(imposter.keyPair.privateKey, me.passport.id, ch2.nonce);
  assert.equal((await post('/api/identity/verify', { id: me.passport.id, nonce: ch2.nonce, signature: forged })).status, 401);

  // Restart with the same data dir: the identity is still known.
  await new Promise((r) => setTimeout(r, 100));
  const s = await listen(createApp({ dataDir: join(tmp, 'data') }));
  try {
    const r = await fetch(`http://127.0.0.1:${s.address().port}/api/identity/${encodeURIComponent(me.passport.id)}`);
    assert.equal(r.status, 200);
  } finally {
    s.close();
  }
});

test('model proxy only serves whitelisted models and caches them', async () => {
  const r = await fetch(`${base}/models/hand_landmarker.task`);
  assert.equal(r.status, 200);
  assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [1, 2, 3]);
  assert.equal((await fetch(`${base}/models/..%2Fsecret`)).status, 404);
  assert.equal((await fetch(`${base}/models/evil.bin`)).status, 404);
  assert.equal((await fetch(`${base}/mediapipe/wasm/vision_wasm_internal.js`)).status, 200);
});

test('unknown API routes are JSON 404s', async () => {
  const r = await get('/api/nope');
  assert.equal(r.status, 404);
});
