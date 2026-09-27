// Local AR registration receipt — no server. Created on the device once the
// signed AR element verifies, and signed by the person's Omni ID when they
// have one, so the receipt itself proves who registered which AR element.

import { signRecord, verifyRecord, verifyPassport } from '../identity/omniId.js';

export const RECEIPT_SCHEMA = 'omni-ar-receipt/1';

const str = (v, n) => String(v ?? '').slice(0, n);

export async function createReceipt({ registry, device = {}, identity = null, now = new Date() }) {
  const body = {
    schema: RECEIPT_SCHEMA,
    registrationId: crypto.randomUUID(),
    elementId: registry.element.id,
    version: registry.element.version,
    integrity: registry.integrity,
    keyId: registry.keyId,
    registeredAt: now.toISOString(),
    expiresAt: registry.expiresAt,
    device: { platform: str(device.platform, 64), screen: str(device.screen, 32) },
    holder: identity?.passport?.id ?? null,
  };
  if (!identity) return body;
  return { ...body, signature: await signRecord(identity.keyPair.privateKey, body) };
}

/** Never throws. Checks the receipt matches the registry and, if held, its signature. */
export async function verifyReceipt(receipt, { registry, passport = null } = {}) {
  if (!receipt || receipt.schema !== RECEIPT_SCHEMA) return { ok: false, reason: 'not an AR receipt' };
  if (registry && (receipt.elementId !== registry.element.id || receipt.version !== registry.element.version || receipt.integrity !== registry.integrity)) {
    return { ok: false, reason: 'receipt is for a different AR element' };
  }
  if (!receipt.holder) return { ok: true, reason: 'unsigned local receipt' };
  if (!passport || passport.id !== receipt.holder) return { ok: false, reason: 'holder passport required' };
  if (!(await verifyPassport(passport)).ok) return { ok: false, reason: 'holder passport invalid' };
  const { signature, ...body } = receipt;
  return (await verifyRecord(passport.publicKey, body, signature)) ? { ok: true, reason: 'signed by holder' } : { ok: false, reason: 'receipt signature invalid' };
}
