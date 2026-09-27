import { useEffect, useRef } from 'react';
import { drawAvatar } from '../ar/twinRenderer.js';

const SAMPLES = [
  { shape: 'orb', title: 'Orb', blurb: 'Calm glowing companion' },
  { shape: 'bot', title: 'Bot', blurb: 'Task-focused helper' },
  { shape: 'spark', title: 'Spark', blurb: 'Energetic motivator' },
];
const COLORS = ['#22d3ee', '#a78bfa', '#34d399', '#f472b6', '#fbbf24', '#60a5fa'];

function SamplePreview({ shape, color }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    let raf = 0;
    const draw = (t) => {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      drawAvatar(ctx, c.width / 2, c.height / 2 + 6, 24, shape, color, t, Math.floor(t / 160) % 25 === 0);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [shape, color]);
  return <canvas ref={ref} width="84" height="84" aria-hidden />;
}

function Check({ state, label, detail, i }) {
  const icon = state === true ? '✅' : state === false ? '❌' : state === 'warn' ? '⚠️' : '⏳';
  return (
    <li className={`check-row ${state === false ? 'bad' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
      <span aria-hidden>{icon}</span>
      <span>
        <b>{label}</b>
        {detail && <small>{detail}</small>}
      </span>
    </li>
  );
}

export default function ArVerifyGate({ reg, camera, prefs, onChange, onStart, onSkip, webglOk }) {
  const c = reg.checks ?? {};
  const pending = reg.status === 'checking';
  const val = (k) => (pending ? null : !!c[k]);
  const r = reg.registry;
  const rows = [
    { label: 'Camera', state: camera.status === 'live' ? true : camera.status === 'starting' ? null : 'warn', detail: camera.status === 'live' ? `${camera.facingMode === 'user' ? 'Front' : 'Rear'} camera live` : camera.error ?? 'Starting…' },
    {
      label: 'Signed registration loaded',
      state: pending ? null : true,
      detail: pending ? 'Loading…' : reg.source === 'imported' ? 'Imported JSON file (verified)' : 'Built into the app — works offline, no server',
    },
    { label: 'Schema', state: val('schema'), detail: r?.schema },
    { label: 'Trusted signing key', state: val('trustedKey'), detail: r?.keyId },
    { label: 'Integrity (SHA-256)', state: val('integrity'), detail: r?.integrity ? `${r.integrity.slice(0, 22)}…` : null },
    { label: 'ECDSA P-256 signature', state: val('signature'), detail: 'Verified in your browser with WebCrypto' },
    { label: 'Validity window', state: val('validity'), detail: r?.expiresAt ? `Valid until ${new Date(r.expiresAt).toLocaleDateString()}` : null },
    {
      label: 'Local receipt',
      state: reg.receipt ? true : reg.status === 'failed' ? false : null,
      detail: reg.receipt
        ? `${reg.receipt.registrationId.slice(0, 8)} · ${reg.receipt.holder ? 'signed by your Omni ID' : 'unsigned (create an Omni ID to sign it)'}`
        : reg.status === 'failed'
          ? 'Not issued'
          : 'Issuing…',
    },
  ];

  return (
    <div className="gate" role="dialog" aria-modal="false" aria-labelledby="gate-h" data-testid="ar-gate">
      <div className="gate-card">
        <h2 id="gate-h">AR digital element verification</h2>
        <p className="muted">
          {reg.status === 'verified' && `${reg.element.name} v${reg.element.version} is authentic and unmodified.`}
          {reg.status === 'failed' && <span className="error" data-testid="gate-error">Verification failed: {reg.reason}. AR is disabled for your safety.</span>}
          {pending && 'Checking the signed AR element…'}
        </p>
        <ul className="checks" data-testid="gate-checks">
          {rows.map((row, i) => (
            <Check key={row.label} i={i} {...row} />
          ))}
        </ul>

        {reg.status !== 'failed' && (
          <>
            <h3>Choose your AR element</h3>
            <div className="samples" role="radiogroup" aria-label="AR element">
              {SAMPLES.map((s) => (
                <button
                  key={s.shape}
                  role="radio"
                  aria-checked={prefs.twinShape === s.shape}
                  className={`sample ${prefs.twinShape === s.shape ? 'on' : ''}`}
                  onClick={() => onChange({ twinShape: s.shape })}
                  data-testid={`ar-sample-${s.shape}`}
                >
                  <SamplePreview shape={s.shape} color={prefs.twinColor} />
                  <b>{s.title}</b>
                  <small>{s.blurb}</small>
                </button>
              ))}
            </div>
            <div className="swatches" role="radiogroup" aria-label="Colour">
              {COLORS.map((col) => (
                <button
                  key={col}
                  role="radio"
                  aria-checked={prefs.twinColor === col}
                  aria-label={col}
                  className={`swatch ${prefs.twinColor === col ? 'on' : ''}`}
                  style={{ background: col }}
                  onClick={() => onChange({ twinColor: col })}
                />
              ))}
              <label className="twin-name">
                Name
                <input value={prefs.twinName} maxLength={24} onChange={(e) => onChange({ twinName: e.target.value })} />
              </label>
            </div>
            <div className="seg mode" role="radiogroup" aria-label="AR mode">
              <button role="radio" aria-checked={prefs.arMode === '3d'} className={prefs.arMode === '3d' ? 'on' : ''} onClick={() => onChange({ arMode: '3d' })} data-testid="ar-mode-3d">
                3D Web AR {webglOk === false ? '(no WebGL here)' : '— works on laptops, PCs & phones'}
              </button>
              <button role="radio" aria-checked={prefs.arMode === '2d'} className={prefs.arMode === '2d' ? 'on' : ''} onClick={() => onChange({ arMode: '2d' })}>
                2D overlay (lightest)
              </button>
            </div>
          </>
        )}

        <div className="button-row">
          {reg.status === 'verified' && (
            <button className="primary" onClick={onStart} data-testid="ar-start">
              ▶ Start AR with {prefs.twinName}
            </button>
          )}
          {reg.status === 'failed' && (
            <button onClick={onSkip} data-testid="ar-skip">
              Continue without AR
            </button>
          )}
        </div>
        <small className="muted">Show an open palm and {prefs.twinName} stands on it · click or tap the video to place it · double-click to release.</small>
      </div>
    </div>
  );
}
