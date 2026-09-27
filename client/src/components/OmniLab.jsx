import { useState } from 'react';
import { solve, apFormula } from '@shared/omni/index.js';
import { getJSON, postJSON } from '../lib/api.js';

const FIELDS = {
  ap: [['F', '3'], ['L', '7'], ['p', '3']],
  gp: [['a', '1'], ['r', '2'], ['n', '5'], ['s', '3']],
  hp: [['F', '3'], ['L', '7'], ['s', '3']],
};
const TITLES = { ap: 'AP  Σ kᵖ', gp: 'GP  Σ (a·rⁱ)ˢ', hp: 'HP  Σ k⁻ˢ', lattice: 'Lattice (3-D box)' };

function shorten(v) {
  return v.length > 80 ? `${v.slice(0, 38)}…${v.slice(-38)} (${v.replace('-', '').length} digits)` : v;
}

/** Brute-force loop in doubles, capped, to show the O(X) cost the formula avoids. */
function bruteMs(kind, p) {
  const t0 = performance.now();
  let s = 0;
  if (kind === 'ap') for (let k = Number(p.F); k <= Number(p.L); k++) s += k ** Number(p.p);
  if (kind === 'hp') for (let k = Number(p.F); k <= Number(p.L); k++) s += k ** -Number(p.s);
  return { ms: performance.now() - t0, s };
}

export default function OmniLab({ lastVoiceResult }) {
  const [kind, setKind] = useState('ap');
  const [vals, setVals] = useState(() => Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, Object.fromEntries(f)])));
  const [dims, setDims] = useState('1..1000000:2, 1..1000000:1, 1..1000:0');
  const [result, setResult] = useState(null);
  const [brute, setBrute] = useState(null);
  const [verify, setVerify] = useState(null);
  const [error, setError] = useState(null);

  const parsedDims = () =>
    dims.split(',').map((d) => {
      const m = /^\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*(?::\s*(\d+))?\s*$/.exec(d);
      if (!m) throw new Error(`bad dimension "${d.trim()}" — use F..L:p`);
      return { F: m[1], L: m[2], p: Number(m[3] ?? 0) };
    });

  const compute = async (where) => {
    setError(null);
    setBrute(null);
    try {
      let r;
      if (kind === 'lattice') {
        const body = { dims: parsedDims() };
        r = where === 'server' ? await postJSON('/api/omni/lattice', body) : solve('lattice', body);
      } else {
        const p = vals[kind];
        r = where === 'server' ? await getJSON(`/api/omni/${kind}?${new URLSearchParams(p)}`) : solve(kind, p);
        const X = BigInt(p.L ?? 0) - BigInt(p.F ?? 0) + 1n;
        if (kind !== 'gp' && X > 0n && X <= 20_000_000n) setBrute(bruteMs(kind, p));
      }
      setResult({ ...r, where });
    } catch (err) {
      setError(err.message);
    }
  };

  const shown = lastVoiceResult && !result ? lastVoiceResult : result;

  return (
    <section className="panel" aria-labelledby="lab-h">
      <h2 id="lab-h">Omni Lab — O(1) progression engine</h2>
      <p className="muted">One midpoint expansion Σf(k) = X·Σ f⁽²ᵐ⁾(M)/(2m)!·μ₂ₘ(X) powers AP, GP and HP. Cost depends on the power, never on the number of terms.</p>
      <div className="seg" role="tablist">
        {Object.keys(TITLES).map((k) => (
          <button key={k} className={kind === k ? 'on' : ''} aria-pressed={kind === k} onClick={() => setKind(k)} data-testid={`lab-${k}`}>
            {TITLES[k]}
          </button>
        ))}
      </div>

      <div className="form inline">
        {kind === 'lattice' ? (
          <label className="wide">Dimensions (F..L:power, comma separated)
            <input value={dims} onChange={(e) => setDims(e.target.value)} data-testid="lab-dims" />
          </label>
        ) : (
          FIELDS[kind].map(([f]) => (
            <label key={f}>{f}
              <input
                value={vals[kind][f]}
                onChange={(e) => setVals((v) => ({ ...v, [kind]: { ...v[kind], [f]: e.target.value } }))}
                data-testid={`lab-${kind}-${f}`}
              />
            </label>
          ))
        )}
      </div>
      {kind === 'ap' && /^\d+$/.test(vals.ap.p) && Number(vals.ap.p) <= 60 && (
        <p className="formula">D<sup>{vals.ap.p}</sup> = {apFormula(Number(vals.ap.p))}</p>
      )}
      <div className="button-row">
        <button className="primary" onClick={() => compute('browser')} data-testid="lab-run">Compute in browser</button>
        <button onClick={() => compute('server')} data-testid="lab-run-server">Compute on server</button>
        <button className="ghost" onClick={async () => setVerify(await getJSON('/api/omni/verify').catch((e) => ({ error: e.message })))} data-testid="lab-verify">
          Run verification suite
        </button>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {shown && (
        <div className="result" data-testid="lab-result">
          <div className="big" data-testid="lab-value">{shorten(shown.decimal ?? shown.value)}</div>
          <dl>
            <dt>Algorithm</dt><dd>{shown.algorithm}</dd>
            <dt>Time</dt><dd>{shown.time}</dd>
            <dt>Space</dt><dd>{shown.space}</dd>
            <dt>Terms</dt><dd>{shorten(shown.terms)}</dd>
            <dt>Exact</dt><dd>{shown.exact ? 'yes (BigInt rational)' : 'no — double, ~1e-15 relative'}</dd>
            <dt>Took</dt><dd>{shown.ms} ms {shown.where ? `(${shown.where})` : ''}</dd>
            {brute && (<><dt>Brute force</dt><dd>{brute.ms.toFixed(2)} ms looping in doubles</dd></>)}
          </dl>
        </div>
      )}
      {verify && (
        <div className="result" data-testid="lab-verify-result">
          {verify.error ? (
            <p className="error">{verify.error}</p>
          ) : (
            <p>
              <b>{verify.cases.toLocaleString()}</b> closed-form vs brute-force cases, <b data-testid="lab-failures">{verify.failures}</b> failures ({verify.ms} ms).{' '}
              {verify.results.map((r) => `${r.family}: ${r.cases}${r.worstRelativeError != null ? ` (worst rel. err ${r.worstRelativeError.toExponential(1)})` : ''}`).join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
