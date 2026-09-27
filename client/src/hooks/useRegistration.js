import { useCallback, useEffect, useState } from 'react';
import { verifyRegistration, hasCapability } from '@shared/security/arVerify.js';
import { TRUSTED_KEYS } from '@shared/security/trustedKeys.js';
import { createReceipt } from '@shared/local/receipt.js';
import bundledRegistry from '../../../ar/ar-register.json';
import { loadJSON, saveJSON } from '../lib/store.js';

// Fully on-device AR element verification — no server.
//
// The signed registration is built into the app. A newer signed registration
// can be imported as JSON; it replaces the built-in one only if it verifies
// against the trusted key. The receipt is created locally (and signed by the
// person's Omni ID when they have one).

const OVERRIDE_KEY = 'omni.registry';
const RECEIPT_KEY = 'omni.receipt';

const device = () => ({
  platform: navigator.userAgentData?.platform ?? navigator.platform ?? '',
  screen: `${screen.width}x${screen.height}`,
});

export function useRegistration(identity) {
  const [reg, setReg] = useState({ status: 'checking', reason: '', element: null, checks: null, source: null, registry: null, receipt: null });

  const apply = useCallback(async (registry, source) => {
    const check = await verifyRegistration(registry, TRUSTED_KEYS);
    setReg((r) => ({
      ...r,
      status: check.ok ? 'verified' : 'failed',
      reason: check.reason,
      element: check.ok ? check.element : null,
      checks: check.checks,
      source,
      registry,
    }));
    return check;
  }, []);

  useEffect(() => {
    (async () => {
      const override = loadJSON(OVERRIDE_KEY, null);
      if (override) {
        const check = await verifyRegistration(override, TRUSTED_KEYS);
        if (check.ok) return apply(override, 'imported');
        saveJSON(OVERRIDE_KEY, null); // stale or expired import — fall back to the built-in copy
      }
      return apply(bundledRegistry, 'built-in');
    })();
  }, [apply]);

  // Issue (or re-issue) the local receipt once verified; sign it with Omni ID when available.
  useEffect(() => {
    if (reg.status !== 'verified') return;
    const prior = loadJSON(RECEIPT_KEY, null);
    const holder = identity?.passport?.id ?? null;
    if (prior && prior.integrity === reg.registry.integrity && prior.holder === holder) {
      if (reg.receipt?.registrationId !== prior.registrationId) setReg((r) => ({ ...r, receipt: prior }));
      return;
    }
    createReceipt({ registry: reg.registry, device: device(), identity }).then((receipt) => {
      saveJSON(RECEIPT_KEY, receipt);
      setReg((r) => ({ ...r, receipt }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reg.status, reg.registry, reg.receipt?.registrationId, identity]);

  /** Import a signed ar-register.json. Rejects anything that does not verify. */
  const importRegistry = useCallback(
    async (text) => {
      let registry;
      try {
        registry = typeof text === 'string' ? JSON.parse(text) : text;
      } catch {
        return { ok: false, reason: 'file is not valid JSON' };
      }
      const check = await verifyRegistration(registry, TRUSTED_KEYS);
      if (!check.ok) return check; // keep the current, verified registration
      saveJSON(OVERRIDE_KEY, registry);
      saveJSON(RECEIPT_KEY, null);
      setReg((r) => ({ ...r, receipt: null }));
      await apply(registry, 'imported');
      return check;
    },
    [apply],
  );

  const restoreReceipt = useCallback((receipt) => {
    saveJSON(RECEIPT_KEY, receipt);
    setReg((r) => ({ ...r, receipt }));
  }, []);

  const can = (cap) => reg.status === 'verified' && hasCapability(reg.element, cap);
  return { ...reg, can, importRegistry, restoreReceipt };
}
