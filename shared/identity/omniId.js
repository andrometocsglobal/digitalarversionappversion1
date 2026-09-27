// Omni ID — one person, one AR element, one signature. Create once, use anywhere.
//
// Each person gets an ECDSA P-256 key pair. Their AR element (twin name, look,
// preferences) is published as a self-signed "passport":
//
//   { schema, id, publicKey, profile, createdAt, signature }
//
// id = base64url(SHA-256(RFC 7638 JWK thumbprint input)), so the id is bound to
// the key and cannot be claimed by anyone else. Any server or device verifies a
// passport with no shared secret, and a challenge-response proves the holder
// owns the private key. To move to another device, export a backup bundle: the
// private key encrypted with AES-GCM under a PBKDF2-derived passphrase key.
//
// Works in browsers and Node (globalThis.crypto.subtle).

import { canonicalize, toBase64Url, fromBase64Url } from '../security/arVerify.js';

export const PASSPORT_SCHEMA = 'omni-id-passport/1';
export const BUNDLE_SCHEMA = 'omni-id-bundle/1';
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const PBKDF2_ITERATIONS = 210_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const publicJwkOf = ({ kty, crv, x, y }) => ({ kty, crv, x, y });

/** RFC 7638 thumbprint of an EC public key, base64url. */
export async function thumbprint(jwk) {
  const { crv, kty, x, y } = jwk;
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(JSON.stringify({ crv, kty, x, y })));
  return toBase64Url(digest);
}

/** Only these profile fields travel with the passport; everything is length-capped. */
export function sanitizeProfile(p = {}) {
  const str = (v, n, d = '') => (typeof v === 'string' ? v.slice(0, n) : d);
  return {
    displayName: str(p.displayName, 40, 'Me'),
    twinName: str(p.twinName, 24, 'Omni'),
    twinColor: /^#[0-9a-f]{6}$/i.test(p.twinColor ?? '') ? p.twinColor.toLowerCase() : '#22d3ee',
    twinShape: ['orb', 'bot', 'spark'].includes(p.twinShape) ? p.twinShape : 'orb',
    motto: str(p.motto, 80, 'Digital detox, healthy habits.'),
  };
}

const passportPayload = ({ schema, id, publicKey, profile, createdAt }) =>
  enc.encode(canonicalize({ schema, id, publicKey, profile, createdAt }));

async function signBytes(privateKey, bytes) {
  return toBase64Url(await crypto.subtle.sign(SIGN, privateKey, bytes));
}

/** Create a brand-new identity. Returns { keyPair, passport }. */
export async function createIdentity(profile, { extractable = true, now = new Date() } = {}) {
  const keyPair = await crypto.subtle.generateKey(ECDSA, extractable, ['sign', 'verify']);
  const publicKey = publicJwkOf(await crypto.subtle.exportKey('jwk', keyPair.publicKey));
  const passport = await signPassport({ publicKey, profile, createdAt: now.toISOString() }, keyPair.privateKey);
  return { keyPair, passport };
}

/** (Re)sign a passport, e.g. after the person edits their twin's profile. */
export async function signPassport({ publicKey, profile, createdAt }, privateKey) {
  const body = {
    schema: PASSPORT_SCHEMA,
    id: await thumbprint(publicKey),
    publicKey: publicJwkOf(publicKey),
    profile: sanitizeProfile(profile),
    createdAt,
  };
  return { ...body, signature: await signBytes(privateKey, passportPayload(body)) };
}

/** Never throws. Returns { ok, reason }. */
export async function verifyPassport(passport) {
  try {
    if (!passport || passport.schema !== PASSPORT_SCHEMA) return { ok: false, reason: 'not an Omni ID passport' };
    const { publicKey, id, signature, profile } = passport;
    if (publicKey?.kty !== 'EC' || publicKey?.crv !== 'P-256') return { ok: false, reason: 'unsupported key' };
    if ((await thumbprint(publicKey)) !== id) return { ok: false, reason: 'id does not match key' };
    const clean = sanitizeProfile(profile);
    if (canonicalize(clean) !== canonicalize(profile)) return { ok: false, reason: 'profile is not canonical' };
    const key = await crypto.subtle.importKey('jwk', { ...publicKey, ext: true }, ECDSA, false, ['verify']);
    const good = await crypto.subtle.verify(SIGN, key, fromBase64Url(String(signature)), passportPayload(passport));
    return good ? { ok: true, reason: 'verified' } : { ok: false, reason: 'signature does not verify' };
  } catch (err) {
    return { ok: false, reason: `verification error: ${err.message}` };
  }
}

// ---------------------------------------------------------- challenge / proof

export const challengeMessage = (id, nonce) => enc.encode(`omni-id-login:${id}:${nonce}`);

export async function signChallenge(privateKey, id, nonce) {
  return signBytes(privateKey, challengeMessage(id, nonce));
}

export async function verifyChallenge(publicKey, id, nonce, signature) {
  try {
    const key = await crypto.subtle.importKey('jwk', { ...publicJwkOf(publicKey), ext: true }, ECDSA, false, ['verify']);
    return await crypto.subtle.verify(SIGN, key, fromBase64Url(String(signature)), challengeMessage(id, nonce));
  } catch {
    return false;
  }
}

// ------------------------------------------------ portable encrypted backup

async function passphraseKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Export passport + private key, encrypted under a passphrase (min 8 chars). */
export async function exportBundle({ keyPair, passport }, passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length < 8) throw new RangeError('passphrase must be at least 8 characters');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await passphraseKey(passphrase, salt, iterations);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(passport.id) },
    key,
    enc.encode(JSON.stringify(privateJwk)),
  );
  return {
    schema: BUNDLE_SCHEMA,
    passport,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64Url(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64Url(iv), data: toBase64Url(sealed) },
  };
}

/** Import a bundle on any device. Throws on a wrong passphrase or tampering. */
export async function importBundle(bundle, passphrase, { extractable = true } = {}) {
  if (bundle?.schema !== BUNDLE_SCHEMA) throw new Error('not an Omni ID backup bundle');
  const check = await verifyPassport(bundle.passport);
  if (!check.ok) throw new Error(`passport invalid: ${check.reason}`);
  const key = await passphraseKey(passphrase, fromBase64Url(bundle.kdf.salt), Number(bundle.kdf.iterations));
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(bundle.cipher.iv), additionalData: enc.encode(bundle.passport.id) },
      key,
      fromBase64Url(bundle.cipher.data),
    );
  } catch {
    throw new Error('wrong passphrase or corrupted bundle');
  }
  const privateJwk = JSON.parse(dec.decode(plain));
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, ECDSA, extractable, ['sign']);
  const publicKey = await crypto.subtle.importKey('jwk', { ...bundle.passport.publicKey, ext: true }, ECDSA, true, ['verify']);
  // Prove the decrypted key really belongs to this passport.
  const probe = crypto.getRandomValues(new Uint8Array(16));
  const sig = await crypto.subtle.sign(SIGN, privateKey, probe);
  if (!(await crypto.subtle.verify(SIGN, publicKey, sig, probe))) throw new Error('key does not match passport');
  return { keyPair: { privateKey, publicKey }, passport: bundle.passport };
}
