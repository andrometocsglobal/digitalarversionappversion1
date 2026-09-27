// AR element registration: integrity + ECDSA P-256 signature + validity window.
// Runs unchanged in the browser and in Node (both expose globalThis.crypto.subtle).
//
// ar-register.json shape:
// {
//   "schema": "omni-ar-register/1",
//   "keyId": "...",
//   "issuedAt": ISO, "expiresAt": ISO,
//   "element": { id, name, version, capabilities[], ... },
//   "integrity": "sha256-<base64>"          // digest of canonical(element)
//   "signature": { "alg": "ES256", "value": "<base64url r||s>" }
// }
// The signature covers canonical({schema, keyId, issuedAt, expiresAt, element, integrity}).

export const SCHEMA = 'omni-ar-register/1';

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

const enc = new TextEncoder();

function toBase64(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}
export const toBase64Url = (bytes) => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function integrityOf(element) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(canonicalize(element)));
  return `sha256-${toBase64(digest)}`;
}

export function signedPayload(reg) {
  const { schema, keyId, issuedAt, expiresAt, element, integrity } = reg;
  return enc.encode(canonicalize({ schema, keyId, issuedAt, expiresAt, element, integrity }));
}

const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

export async function signRegistration(unsigned, privateJwk) {
  const key = await crypto.subtle.importKey('jwk', privateJwk, ECDSA, false, ['sign']);
  const integrity = await integrityOf(unsigned.element);
  const reg = { ...unsigned, schema: SCHEMA, integrity };
  const sig = await crypto.subtle.sign(SIGN, key, signedPayload(reg));
  return { ...reg, signature: { alg: 'ES256', value: toBase64Url(sig) } };
}

/**
 * Verify a registration against a map of trusted public JWKs keyed by keyId.
 * Never throws: returns { ok, reason, checks, element }.
 */
export async function verifyRegistration(reg, trustedKeys, now = new Date()) {
  const checks = { schema: false, trustedKey: false, integrity: false, signature: false, validity: false };
  const fail = (reason) => ({ ok: false, reason, checks, element: null });
  try {
    if (!reg || typeof reg !== 'object') return fail('registration is not an object');
    if (reg.schema !== SCHEMA) return fail(`unexpected schema "${reg.schema}"`);
    checks.schema = true;

    const jwk = trustedKeys?.[reg.keyId];
    if (!jwk) return fail(`untrusted signing key "${reg.keyId}"`);
    checks.trustedKey = true;

    const el = reg.element;
    if (!el || typeof el.id !== 'string' || typeof el.version !== 'string' || !Array.isArray(el.capabilities)) {
      return fail('element must have id, version and capabilities');
    }
    if ((await integrityOf(el)) !== reg.integrity) return fail('integrity digest mismatch (element was modified)');
    checks.integrity = true;

    if (reg.signature?.alg !== 'ES256' || typeof reg.signature.value !== 'string') {
      return fail('missing ES256 signature');
    }
    const key = await crypto.subtle.importKey('jwk', jwk, ECDSA, false, ['verify']);
    const good = await crypto.subtle.verify(SIGN, key, fromBase64Url(reg.signature.value), signedPayload(reg));
    if (!good) return fail('signature does not verify');
    checks.signature = true;

    const t = now.getTime();
    const from = Date.parse(reg.issuedAt);
    const to = Date.parse(reg.expiresAt);
    if (!(from <= t)) return fail('registration is not valid yet');
    if (!(t < to)) return fail('registration has expired');
    checks.validity = true;

    return { ok: true, reason: 'verified', checks, element: el };
  } catch (err) {
    return fail(`verification error: ${err.message}`);
  }
}

/** True when the verified element grants the capability. */
export const hasCapability = (element, cap) => !!element?.capabilities?.includes(cap);
