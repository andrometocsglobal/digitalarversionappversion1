import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalize, signRegistration, verifyRegistration, hasCapability } from '../../shared/security/arVerify.js';
import { TRUSTED_KEYS } from '../../shared/security/trustedKeys.js';
import {
  createIdentity,
  verifyPassport,
  signPassport,
  signChallenge,
  verifyChallenge,
  exportBundle,
  importBundle,
  thumbprint,
} from '../../shared/identity/omniId.js';

const shipped = JSON.parse(await readFile(new URL('../../ar/ar-register.json', import.meta.url), 'utf8'));

async function freshKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { priv: await crypto.subtle.exportKey('jwk', pair.privateKey), pub: await crypto.subtle.exportKey('jwk', pair.publicKey) };
}

test('canonicalize sorts keys recursively and is order-independent', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }), '{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
  assert.equal(canonicalize({ x: 1, y: 2 }), canonicalize({ y: 2, x: 1 }));
});

test('the shipped AR registration verifies against the trusted key', async () => {
  const r = await verifyRegistration(shipped, TRUSTED_KEYS);
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.element.id, 'omni-digital-twin');
  for (const cap of ['camera', 'hands', 'voice', 'torch', 'digital-bulb', 'twin']) assert.ok(hasCapability(r.element, cap), cap);
  assert.equal(hasCapability(r.element, 'microphone-recording'), false);
});

test('tampering with the element, signature, schema or key is detected', async () => {
  const cases = [
    [{ ...shipped, element: { ...shipped.element, capabilities: [...shipped.element.capabilities, 'root'] } }, /integrity/],
    [{ ...shipped, expiresAt: '2099-01-01T00:00:00.000Z' }, /signature/],
    [{ ...shipped, signature: { ...shipped.signature, value: shipped.signature.value.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) } }, /signature/],
    [{ ...shipped, schema: 'other/1' }, /schema/],
    [{ ...shipped, keyId: 'attacker' }, /untrusted/],
    [null, /not an object/],
  ];
  for (const [reg, why] of cases) {
    const r = await verifyRegistration(reg, TRUSTED_KEYS);
    assert.equal(r.ok, false);
    assert.match(r.reason, why);
  }
});

test('validity window is enforced', async () => {
  const { priv, pub } = await freshKeys();
  const reg = await signRegistration(
    { keyId: 'k', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-06-01T00:00:00Z', element: { id: 'e', version: '1', capabilities: [] } },
    priv,
  );
  const keys = { k: pub };
  assert.equal((await verifyRegistration(reg, keys, new Date('2026-03-01'))).ok, true);
  assert.match((await verifyRegistration(reg, keys, new Date('2025-12-01'))).reason, /not valid yet/);
  assert.match((await verifyRegistration(reg, keys, new Date('2026-07-01'))).reason, /expired/);
  // A key that did not sign it must fail.
  const other = await freshKeys();
  assert.match((await verifyRegistration(reg, { k: other.pub }, new Date('2026-03-01'))).reason, /signature/);
});

test('Omni ID: create, verify, id is bound to the key', async () => {
  const { keyPair, passport } = await createIdentity({ displayName: 'Kumaran', twinName: 'Nova', twinColor: '#FF00AA', twinShape: 'bot' });
  assert.equal((await verifyPassport(passport)).ok, true);
  assert.equal(passport.id, await thumbprint(passport.publicKey));
  assert.equal(passport.profile.twinColor, '#ff00aa');
  // Someone else's key cannot claim this id.
  const other = await createIdentity({});
  assert.match((await verifyPassport({ ...passport, publicKey: other.passport.publicKey })).reason, /id does not match/);
  // Profile edits without re-signing are rejected; re-signing is accepted.
  assert.equal((await verifyPassport({ ...passport, profile: { ...passport.profile, twinName: 'Evil' } })).ok, false);
  const updated = await signPassport({ ...passport, profile: { ...passport.profile, twinName: 'Nova 2' } }, keyPair.privateKey);
  assert.equal((await verifyPassport(updated)).ok, true);
  assert.equal(updated.id, passport.id);
});

test('Omni ID: challenge-response proves key ownership', async () => {
  const me = await createIdentity({});
  const other = await createIdentity({});
  const sig = await signChallenge(me.keyPair.privateKey, me.passport.id, 'nonce-1');
  assert.equal(await verifyChallenge(me.passport.publicKey, me.passport.id, 'nonce-1', sig), true);
  assert.equal(await verifyChallenge(me.passport.publicKey, me.passport.id, 'nonce-2', sig), false);
  const forged = await signChallenge(other.keyPair.privateKey, me.passport.id, 'nonce-1');
  assert.equal(await verifyChallenge(me.passport.publicKey, me.passport.id, 'nonce-1', forged), false);
});

test('Omni ID: encrypted backup round-trips on another "device" and rejects wrong passphrases', async () => {
  const me = await createIdentity({ displayName: 'Traveller' });
  const bundle = await exportBundle(me, 'correct horse battery', { iterations: 1000 });
  assert.ok(!JSON.stringify(bundle).includes(me.passport.publicKey.x + '"d"'));
  assert.equal(JSON.stringify(bundle).includes('"d":'), false, 'private scalar must not appear in clear');
  const restored = await importBundle(JSON.parse(JSON.stringify(bundle)), 'correct horse battery');
  const sig = await signChallenge(restored.keyPair.privateKey, me.passport.id, 'n');
  assert.equal(await verifyChallenge(me.passport.publicKey, me.passport.id, 'n', sig), true);
  await assert.rejects(importBundle(bundle, 'wrong passphrase!'), /wrong passphrase/);
  await assert.rejects(exportBundle(me, 'short'), /at least 8/);
  const tampered = { ...bundle, passport: { ...bundle.passport, profile: { ...bundle.passport.profile, displayName: 'X' } } };
  await assert.rejects(importBundle(tampered, 'correct horse battery'), /passport invalid/);
});
