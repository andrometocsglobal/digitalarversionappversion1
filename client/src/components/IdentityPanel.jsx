import { useState } from 'react';
import { fromBase64Url } from '@shared/security/arVerify.js';
import { verifyPassport } from '@shared/identity/omniId.js';

/** A unique visual signature derived from the identity's key thumbprint. */
export function SignatureGlyph({ id, color, size = 96 }) {
  const bytes = id ? fromBase64Url(id) : new Uint8Array(32);
  const c = size / 2;
  const petals = 16;
  const pts = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const r = c * (0.35 + (bytes[i] / 255) * 0.6);
    pts.push(`${(c + Math.cos(a) * r).toFixed(1)},${(c + Math.sin(a) * r).toFixed(1)}`);
  }
  const inner = [];
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const r = c * (0.15 + (bytes[16 + i] / 255) * 0.3);
    inner.push(`${(c + Math.cos(a) * r).toFixed(1)},${(c + Math.sin(a) * r).toFixed(1)}`);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Omni ID signature" className="glyph">
      <circle cx={c} cy={c} r={c - 1} fill="none" stroke={color} strokeOpacity="0.35" />
      <polygon points={pts.join(' ')} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" />
      <polygon points={inner.join(' ')} fill="#eab308" fillOpacity="0.5" stroke="#eab308" />
    </svg>
  );
}

export default function IdentityPanel({ idState, prefs, initialBundle = '' }) {
  const { identity, status, create, refreshProfile, proveOwnership, backup, restore, forget, setStatus } = idState;
  const [pass, setPass] = useState('');
  const [bundleText, setBundleText] = useState(initialBundle);
  const [busy, setBusy] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [checkText, setCheckText] = useState('');
  const [checkResult, setCheckResult] = useState('');

  const run = (fn) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setStatus({ state: identity ? 'ready' : 'none', message: err.message });
    } finally {
      setBusy(false);
    }
  };

  const download = (obj, kind = 'backup') => {
    const id = obj.passport?.id ?? obj.id;
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = kind === 'passport' ? `omni-passport-${id.slice(0, 8)}.json` : `omni-id-${id.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="panel" aria-labelledby="id-h">
      <h2 id="id-h">Omni ID — one person, one AR twin</h2>
      <p className="muted">
        Create your signed AR identity once, then carry it to any device with an encrypted JSON backup. Everything happens on this device — no
        server. Your private key never leaves it unencrypted.
      </p>

      {status.state === 'loading' && <p>Loading…</p>}

      {status.state === 'none' && (
        <button className="primary" disabled={busy} onClick={run(() => create(prefs))} data-testid="create-id">
          Create my Omni ID
        </button>
      )}

      {identity && (
        <div className="id-card" data-testid="id-card">
          <SignatureGlyph id={identity.passport.id} color={identity.passport.profile.twinColor} />
          <div>
            <div><b>{identity.passport.profile.displayName}</b> with twin <b>{identity.passport.profile.twinName}</b></div>
            <code className="id-code" data-testid="id-value" title={identity.passport.id}>{identity.passport.id}</code>
            <small className="muted">Created {new Date(identity.passport.createdAt).toLocaleString()}</small>
          </div>
        </div>
      )}

      {identity && (
        <div className="button-row">
          <button disabled={busy} onClick={run(() => refreshProfile(prefs))}>Update from preferences</button>
          <button disabled={busy} onClick={run(proveOwnership)} data-testid="prove-id">Prove ownership</button>
        </div>
      )}

      {status.message && <p className="notice" data-testid="id-status">{status.message}</p>}

      {identity && (
        <>
          <h3>Use it anywhere</h3>
          <div className="form">
            <label>Backup passphrase (8+ characters)
              <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="new-password" data-testid="id-pass" />
            </label>
          </div>
          <button
            disabled={busy || pass.length < 8}
            onClick={run(async () => {
              const bundle = await backup(pass);
              setBundleText(JSON.stringify(bundle, null, 2));
              download(bundle);
              setStatus({ state: 'ready', message: 'Encrypted backup created. Keep the passphrase safe — it cannot be recovered.' });
            })}
            data-testid="export-id"
          >
            Export encrypted backup
          </button>
        </>
      )}

      {identity && (
        <>
          <h3>Share your public passport</h3>
          <p className="muted">Anyone can verify it offline — it contains no private key.</p>
          <button onClick={() => download(identity.passport, 'passport')} data-testid="export-passport">Export passport JSON</button>
        </>
      )}

      <h3>Verify a passport</h3>
      <div className="form">
        <label>Passport JSON
          <textarea rows={3} value={checkText} onChange={(e) => setCheckText(e.target.value)} placeholder='{"schema":"omni-id-passport/1", …}' data-testid="verify-passport-input" />
        </label>
      </div>
      <button
        disabled={!checkText}
        onClick={async () => {
          try {
            const p = JSON.parse(checkText);
            const v = await verifyPassport(p);
            setCheckResult(v.ok ? `✅ Valid passport of ${p.profile.displayName} (twin ${p.profile.twinName}), id ${p.id.slice(0, 12)}…` : `❌ Invalid: ${v.reason}`);
          } catch {
            setCheckResult('❌ Not valid JSON');
          }
        }}
        data-testid="verify-passport"
      >
        Verify
      </button>
      {checkResult && <p className="notice" data-testid="verify-passport-result">{checkResult}</p>}

      <h3>Import on this device</h3>
      <div className="form">
        <label>Backup JSON
          <textarea rows={4} value={bundleText} onChange={(e) => setBundleText(e.target.value)} placeholder='{"schema":"omni-id-bundle/1", …}' data-testid="id-bundle" />
        </label>
        <label>Or choose a file
          <input type="file" accept="application/json,.json" onChange={async (e) => setBundleText(await e.target.files[0]?.text())} />
        </label>
        <label>Passphrase<input type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" /></label>
      </div>
      <button disabled={busy || !bundleText || pass.length < 8} onClick={run(() => restore(bundleText, pass))} data-testid="import-id">
        Import identity
      </button>

      {identity && (
        <div className="danger">
          {confirmForget ? (
            <>
              <span>Remove the identity from this device? Without a backup it is gone for good.</span>
              <button className="danger-btn" onClick={run(async () => { await forget(); setConfirmForget(false); })}>Remove</button>
              <button className="ghost" onClick={() => setConfirmForget(false)}>Keep</button>
            </>
          ) : (
            <button className="ghost" onClick={() => setConfirmForget(true)}>Remove from this device…</button>
          )}
        </div>
      )}
    </section>
  );
}
