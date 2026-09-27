import { useCallback, useEffect, useState } from 'react';
import {
  createIdentity,
  signPassport,
  exportBundle,
  importBundle,
  signChallenge,
  verifyChallenge,
  verifyPassport,
} from '@shared/identity/omniId.js';
import { profileFromPrefs } from '@shared/prefs.js';
import { idbGet, idbSet, idbDelete } from '../lib/store.js';

const KEY = 'omni-id';

// One person, one AR twin — entirely on this device. The key pair lives in
// IndexedDB; the passport is self-certifying, so anyone can verify an exported
// passport JSON without a server; an encrypted bundle moves it between devices.
export function useIdentity() {
  const [identity, setIdentity] = useState(null); // { keyPair, passport }
  const [status, setStatus] = useState({ state: 'loading', message: '' });

  useEffect(() => {
    idbGet(KEY).then((stored) => {
      setIdentity(stored ?? null);
      setStatus({ state: stored ? 'ready' : 'none', message: '' });
    });
  }, []);

  const persist = async (next, message) => {
    await idbSet(KEY, next);
    setIdentity(next);
    setStatus({ state: 'ready', message });
  };

  const create = useCallback(async (prefs) => {
    const next = await createIdentity(profileFromPrefs(prefs), { extractable: true });
    await persist(next, 'Omni ID created and saved on this device.');
  }, []);

  const refreshProfile = useCallback(
    async (prefs) => {
      if (!identity) return;
      const passport = await signPassport({ ...identity.passport, profile: profileFromPrefs(prefs) }, identity.keyPair.privateKey);
      await persist({ ...identity, passport }, 'Passport re-signed with your latest twin profile.');
    },
    [identity],
  );

  /** Challenge-response against the passport's own public key, on-device. */
  const proveOwnership = useCallback(async () => {
    if (!identity) return false;
    const nonce = crypto.randomUUID();
    const sig = await signChallenge(identity.keyPair.privateKey, identity.passport.id, nonce);
    const ok = (await verifyPassport(identity.passport)).ok && (await verifyChallenge(identity.passport.publicKey, identity.passport.id, nonce, sig));
    setStatus({ state: 'ready', message: ok ? `Ownership proven: this device holds the key for ${identity.passport.id.slice(0, 10)}… (${new Date().toLocaleTimeString()}).` : 'Ownership check FAILED — the stored key does not match the passport.' });
    return ok;
  }, [identity]);

  const backup = useCallback(async (passphrase) => (identity ? exportBundle(identity, passphrase) : null), [identity]);

  const restore = useCallback(async (bundleText, passphrase) => {
    const bundle = typeof bundleText === 'string' ? JSON.parse(bundleText) : bundleText;
    const next = await importBundle(bundle, passphrase, { extractable: true });
    await persist(next, 'Omni ID restored on this device.');
    return next;
  }, []);

  const forget = useCallback(async () => {
    await idbDelete(KEY);
    setIdentity(null);
    setStatus({ state: 'none', message: 'Identity removed from this device.' });
  }, []);

  return { identity, status, setStatus, create, refreshProfile, proveOwnership, backup, restore, forget };
}
