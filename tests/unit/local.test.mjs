// Single static app: local receipts, one-file JSON backup/restore, and the
// static hosting configs (Netlify, Render, Vite CSP meta) staying in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createReceipt, verifyReceipt } from '../../shared/local/receipt.js';
import { buildBackup, parseBackup, sanitizeStats, sanitizeHistory, BACKUP_SCHEMA } from '../../shared/local/backup.js';
import { createIdentity, exportBundle, importBundle, signRecord, verifyRecord } from '../../shared/identity/omniId.js';
import { TRUSTED_KEYS } from '../../shared/security/trustedKeys.js';
import { DEFAULT_PREFS } from '../../shared/prefs.js';
import { CSP_META, CSP_HEADER, MODEL_URLS } from '../../shared/platform.js';

const root = new URL('../../', import.meta.url);
const text = (p) => readFile(new URL(p, root), 'utf8');
const registry = JSON.parse(await text('ar/ar-register.json'));

test('signRecord / verifyRecord round-trip and detect edits', async () => {
  const me = await createIdentity({});
  const rec = { a: 1, b: ['x'] };
  const sig = await signRecord(me.keyPair.privateKey, rec);
  assert.equal(await verifyRecord(me.passport.publicKey, { b: ['x'], a: 1 }, sig), true, 'key order does not matter');
  assert.equal(await verifyRecord(me.passport.publicKey, { a: 2, b: ['x'] }, sig), false);
});

test('local receipt: unsigned without an identity, signed by the holder with one', async () => {
  const plain = await createReceipt({ registry, device: { platform: 'Win32', screen: '1920x1080' } });
  assert.equal(plain.holder, null);
  assert.equal((await verifyReceipt(plain, { registry })).ok, true);

  const me = await createIdentity({ displayName: 'Holder' });
  const signed = await createReceipt({ registry, identity: me });
  assert.equal(signed.holder, me.passport.id);
  assert.equal((await verifyReceipt(signed, { registry, passport: me.passport })).ok, true);
  assert.match((await verifyReceipt({ ...signed, version: '9.9.9' }, { registry })).reason, /different AR element/);
  assert.match((await verifyReceipt({ ...signed, registeredAt: '2000-01-01T00:00:00Z' }, { registry, passport: me.passport })).reason, /signature invalid/);
  const other = await createIdentity({});
  assert.equal((await verifyReceipt(signed, { registry, passport: other.passport })).ok, false);
});

test('app backup round-trips prefs, stats, history, registration, receipt and encrypted identity', async () => {
  const me = await createIdentity({ displayName: 'Traveller', twinName: 'Nova' });
  const bundle = await exportBundle(me, 'a long passphrase', { iterations: 1000 });
  const receipt = await createReceipt({ registry, identity: me });
  const backup = buildBackup({
    prefs: { ...DEFAULT_PREFS, twinName: 'Nova', twinShape: 'bot', arMode: '2d', bulbLevel: 77 },
    stats: { date: '2026-09-27', tasksDone: 3, glasses: 2, detoxMs: 60000, breaths: 4 },
    history: [{ templateId: 'hydrate', finishedAt: 1, title: 'x', icon: 'y' }, { templateId: 'nope', finishedAt: 2 }],
    registry,
    receipt,
    passport: me.passport,
    identityBundle: bundle,
  });
  assert.equal(backup.schema, BACKUP_SCHEMA);
  assert.equal(JSON.stringify(backup).includes('"d":'), false, 'no private key in clear');

  const r = await parseBackup(JSON.stringify(backup), { trustedKeys: TRUSTED_KEYS });
  assert.deepEqual(r.warnings, []);
  assert.equal(r.prefs.twinName, 'Nova');
  assert.equal(r.prefs.arMode, '2d');
  assert.equal(r.prefs.bulbLevel, 77);
  assert.equal(r.stats.tasksDone, 3);
  assert.deepEqual(r.history.map((h) => h.templateId), ['hydrate'], 'unknown tasks dropped');
  assert.equal(r.registry.integrity, registry.integrity);
  assert.equal(r.receipt.registrationId, receipt.registrationId);
  // "Another device": the identity comes back only with the passphrase.
  const restored = await importBundle(r.identityBundle, 'a long passphrase');
  assert.equal(restored.passport.id, me.passport.id);
});

test('backup import rejects junk and drops tampered parts with warnings', async () => {
  await assert.rejects(parseBackup('not json', { trustedKeys: TRUSTED_KEYS }), /not valid JSON/);
  await assert.rejects(parseBackup({ schema: 'other' }, { trustedKeys: TRUSTED_KEYS }), /schema/);
  await assert.rejects(parseBackup('x'.repeat(2_000_001), { trustedKeys: TRUSTED_KEYS }), /too large/);

  const me = await createIdentity({ displayName: 'A' });
  const backup = buildBackup({
    prefs: { twinColor: 'javascript:alert(1)', bulbLevel: 9999 },
    stats: { tasksDone: -5, glasses: 'lots' },
    registry: { ...registry, element: { ...registry.element, capabilities: ['everything'] } },
    passport: { ...me.passport, profile: { ...me.passport.profile, displayName: 'Mallory' } },
  });
  const r = await parseBackup(backup, { trustedKeys: TRUSTED_KEYS });
  assert.equal(r.prefs.twinColor, DEFAULT_PREFS.twinColor);
  assert.equal(r.prefs.bulbLevel, 100);
  assert.equal(r.stats.tasksDone, 0);
  assert.equal(r.stats.glasses, 0);
  assert.equal(r.registry, null);
  assert.equal(r.passport, null);
  assert.equal(r.warnings.length, 2);
  assert.match(r.warnings.join(' '), /AR registration ignored: integrity/);
});

test('stats and history sanitisers', () => {
  assert.deepEqual(sanitizeStats({ date: 'bad', tasksDone: 2.7 }), { date: '1970-01-01', tasksDone: 2, glasses: 0, detoxMs: 0, breaths: 0 });
  assert.deepEqual(sanitizeHistory('nope'), []);
  assert.equal(sanitizeHistory(Array.from({ length: 80 }, (_, i) => ({ templateId: 'stretch', finishedAt: i }))).length, 50);
});

test('no server-side API remains: static app only', async () => {
  for (const gone of ['server/app.js', 'server/index.js', 'netlify/functions/api.mjs']) {
    assert.equal(existsSync(new URL(gone, root)), false, `${gone} should not exist`);
  }
  const pkg = JSON.parse(await text('package.json'));
  for (const dep of ['express', 'serverless-http']) assert.equal(pkg.dependencies[dep], undefined);
  const src = await Promise.all(
    ['client/src/App.jsx', 'client/src/hooks/useRegistration.js', 'client/src/hooks/useIdentity.js', 'client/src/components/OmniLab.jsx'].map(text),
  );
  for (const s of src) assert.equal(/['"`]\/api\//.test(s), false, 'client must not call /api');
});

test('Netlify, Render and the built page share one CSP', async () => {
  assert.equal(CSP_HEADER, `${CSP_META}; frame-ancestors 'none'`);
  const toml = await text('netlify.toml');
  assert.equal(/Content-Security-Policy = "([^"]+)"/.exec(toml)?.[1], CSP_HEADER);
  assert.doesNotMatch(toml, /^\s*functions\s*=|\[functions\]|\.netlify\/functions/m, 'no Netlify Functions');
  assert.match(toml, /publish = "dist"/);
  const yaml = await text('render.yaml');
  assert.equal(/name: Content-Security-Policy\s+value: "([^"]+)"/.exec(yaml)?.[1], CSP_HEADER);
  assert.match(yaml, /runtime: static/);
  assert.match(yaml, /staticPublishPath: dist/);
  for (const url of Object.values(MODEL_URLS)) assert.ok(url.startsWith('https://storage.googleapis.com/'), 'models load from an origin the CSP allows');
});
