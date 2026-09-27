import { useCallback, useEffect, useState } from 'react';
import {
  createIdentity,
  signPassport,
  exportBundle,
  importBundle,
  signChallenge,
} from '@shared/identity/omniId.js';
import { profileFromPrefs } from '@shared/prefs.js';
import { idbGet, idbSet, idbDelete } from '../lib/store.js';
import { postJSON } from '../lib/api.js';

const KEY = 'omni-id';

// One person, one AR element: the key pair lives in IndexedDB on this device;
// the signed passport is registered with the server; a passphrase-encrypted
// bundle carries the identity to any other device.
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
    try {
      await postJSON('/api/identity/register', { passport: next.passport });
      setStatus({ state: 'ready', message: message ?? 'Registered with the server.' });
    } catch (err) {
      setStatus({ state: 'ready', message: `Saved on this device; server registration failed: ${err.message}` });
    }
  };

  const create = useCallback(async (prefs) => {
    const next = await createIdentity(profileFromPrefs(prefs), { extractable: true });
    await persist(next, 'Omni ID created and registered.');
  }, []);

  const refreshProfile = useCallback(
    async (prefs) => {
      if (!identity) return;
      const passport = await signPassport({ ...identity.passport, profile: profileFromPrefs(prefs) }, identity.keyPair.privateKey);
      await persist({ ...identity, passport }, 'Passport re-signed with your latest twin profile.');
    },
    [identity],
  );

  const proveOwnership = useCallback(async () => {
    if (!identity) return null;
    const { nonce } = await postJSON('/api/identity/challenge', { id: identity.passport.id });
    const signature = await signChallenge(identity.keyPair.privateKey, identity.passport.id, nonce);
    const res = await postJSON('/api/identity/verify', { id: identity.passport.id, nonce, signature, passport: identity.passport });
    setStatus({ state: 'ready', message: `Ownership proven to the server at ${new Date(res.verifiedAt).toLocaleTimeString()}.` });
    return res;
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
