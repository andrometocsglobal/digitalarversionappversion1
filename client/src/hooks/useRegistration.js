import { useEffect, useState } from 'react';
import { verifyRegistration, hasCapability } from '@shared/security/arVerify.js';
import { TRUSTED_KEYS } from '@shared/security/trustedKeys.js';
import { getJSON, postJSON } from '../lib/api.js';
import { loadJSON, saveJSON } from '../lib/store.js';

// Verifies the signed AR element registry in the browser (WebCrypto), then
// registers this device with the server and keeps the receipt. AR features
// stay disabled unless verification passes.
export function useRegistration() {
  const [reg, setReg] = useState({ status: 'checking', reason: '', element: null, receipt: loadJSON('omni.receipt', null) });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const registry = await getJSON('/api/ar/registry');
        const check = await verifyRegistration(registry, TRUSTED_KEYS);
        if (cancelled) return;
        if (!check.ok) {
          setReg({ status: 'failed', reason: check.reason, element: null, receipt: null });
          return;
        }
        setReg((r) => ({ ...r, status: 'verified', reason: check.reason, element: check.element }));
        const prior = loadJSON('omni.receipt', null);
        if (prior?.version === check.element.version && prior?.elementId === check.element.id) return;
        const receipt = await postJSON('/api/ar/register', {
          elementId: check.element.id,
          version: check.element.version,
          integrity: registry.integrity,
          device: { platform: navigator.userAgentData?.platform ?? navigator.platform, screen: `${screen.width}x${screen.height}` },
        });
        saveJSON('omni.receipt', receipt);
        if (!cancelled) setReg((r) => ({ ...r, receipt }));
      } catch (err) {
        if (!cancelled) setReg((r) => (r.status === 'verified' ? { ...r, reason: `registered locally; server: ${err.message}` } : { status: 'failed', reason: err.message, element: null, receipt: null }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const can = (cap) => reg.status === 'verified' && hasCapability(reg.element, cap);
  return { ...reg, can };
}
