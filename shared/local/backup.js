// One-file app backup: everything the app keeps (including voice notes), as a single JSON document you
// can export on one device and import on another. No server involved.
//
// The private key is only ever included as an Omni ID bundle that is already
// AES-GCM encrypted under the person's passphrase.

import { sanitizePrefs } from '../prefs.js';
import { verifyRegistration } from '../security/arVerify.js';
import { verifyPassport, BUNDLE_SCHEMA } from '../identity/omniId.js';
import { TASK_TEMPLATES } from '../automation/tasks.js';
import { verifyReceipt, RECEIPT_SCHEMA } from './receipt.js';
import { sanitizeNotes } from '../notes/notes.js';

export const BACKUP_SCHEMA = 'omni-app-backup/1';
export const MAX_BACKUP_BYTES = 2_000_000;

const count = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.floor(Number(v)) : 0);

export function sanitizeStats(s = {}) {
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(s.date ?? '') ? s.date : '1970-01-01',
    tasksDone: count(s.tasksDone),
    glasses: count(s.glasses),
    detoxMs: count(s.detoxMs),
  };
}

export function sanitizeHistory(list = []) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d && TASK_TEMPLATES[d.templateId] && Number.isFinite(Number(d.finishedAt)))
    .slice(0, 50)
    .map((d, i) => {
      const t = TASK_TEMPLATES[d.templateId];
      return { templateId: d.templateId, title: t.title, icon: t.icon, finishedAt: Number(d.finishedAt), uid: `imported-${i}` };
    });
}

export function buildBackup({ prefs, stats, history = [], notes = [], registry = null, receipt = null, passport = null, identityBundle = null, now = new Date(), appVersion = '1.0.0' }) {
  return {
    schema: BACKUP_SCHEMA,
    app: 'omni-ar-twin',
    appVersion,
    exportedAt: now.toISOString(),
    prefs: sanitizePrefs(prefs),
    stats: sanitizeStats(stats),
    history: sanitizeHistory(history),
    notes: sanitizeNotes(notes),
    registration: registry ? { registry, receipt } : null,
    identity: passport ? { passport, bundle: identityBundle } : null,
  };
}

/**
 * Validate an imported backup. Throws only when the file is not a backup at all;
 * individual parts that fail verification are dropped and reported in `warnings`.
 */
export async function parseBackup(input, { trustedKeys }) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  if (text.length > MAX_BACKUP_BYTES) throw new Error('backup file is too large');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('backup is not valid JSON');
  }
  if (data?.schema !== BACKUP_SCHEMA) throw new Error('not an Omni app backup (schema mismatch)');

  const warnings = [];
  const out = {
    prefs: sanitizePrefs(data.prefs),
    stats: sanitizeStats(data.stats),
    history: sanitizeHistory(data.history),
    notes: sanitizeNotes(data.notes),
    registry: null,
    receipt: null,
    passport: null,
    identityBundle: null,
    warnings,
  };

  if (data.identity?.passport) {
    const v = await verifyPassport(data.identity.passport);
    if (v.ok) {
      out.passport = data.identity.passport;
      const b = data.identity.bundle;
      if (b?.schema === BUNDLE_SCHEMA && b.passport?.id === out.passport.id) out.identityBundle = b;
      else if (b) warnings.push('identity backup ignored: bundle does not match the passport');
    } else warnings.push(`identity ignored: ${v.reason}`);
  }

  if (data.registration?.registry) {
    const v = await verifyRegistration(data.registration.registry, trustedKeys);
    if (v.ok) {
      out.registry = data.registration.registry;
      const rc = data.registration.receipt;
      if (rc?.schema === RECEIPT_SCHEMA) {
        const rv = await verifyReceipt(rc, { registry: out.registry, passport: out.passport });
        if (rv.ok) out.receipt = rc;
        else warnings.push(`receipt ignored: ${rv.reason}`);
      }
    } else warnings.push(`AR registration ignored: ${v.reason}`);
  }
  return out;
}
