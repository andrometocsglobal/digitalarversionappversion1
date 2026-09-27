// Exhaustive closed-form vs brute-force checks, as in the Omni deck:
// every (F, L) with 1 <= F <= L <= maxL, across powers 1..maxPower.

import {
  apRangePowerSum,
  apPowerSumBrute,
  gpPowerSum,
  gpPowerSumBrute,
  hpPowerSum,
  hpPowerSumExact,
} from './engine.js';

export function verifyAP({ maxL = 20, maxPower = 10 } = {}) {
  let cases = 0;
  const failures = [];
  for (let p = 1; p <= maxPower; p++) {
    for (let F = 1; F <= maxL; F++) {
      for (let L = F; L <= maxL; L++) {
        cases++;
        const a = apRangePowerSum(F, L, p);
        const b = apPowerSumBrute(F, 1, L - F + 1, p);
        if (!a.eq(b)) failures.push({ F, L, p, got: a.toString(), want: b.toString() });
      }
    }
  }
  return { family: 'AP', cases, failures, exact: true };
}

export function verifyGP({ maxN = 12, maxPower = 6, ratios = [-3, -2, '1/2', 1, 2, 3] } = {}) {
  let cases = 0;
  const failures = [];
  for (const r of ratios) {
    for (let s = 1; s <= maxPower; s++) {
      for (let n = 0; n <= maxN; n++) {
        cases++;
        const a = gpPowerSum(3, r, n, s);
        const b = gpPowerSumBrute(3, r, n, s);
        if (!a.eq(b)) failures.push({ r, s, n, got: a.toString(), want: b.toString() });
      }
    }
  }
  return { family: 'GP', cases, failures, exact: true };
}

/** HP is compared to the exact rational within a relative tolerance. */
export function verifyHP({ maxL = 30, maxPower = 10, tol = 1e-13 } = {}) {
  let cases = 0;
  let worst = 0;
  const failures = [];
  for (let s = 1; s <= maxPower; s++) {
    for (let F = 1; F <= maxL; F++) {
      for (let L = F; L <= maxL; L++) {
        cases++;
        const fast = hpPowerSum(F, L, s);
        const exact = hpPowerSumExact(F, L, s).toNumber();
        const rel = Math.abs(fast - exact) / exact;
        worst = Math.max(worst, rel);
        if (!(rel <= tol)) failures.push({ F, L, s, fast, exact, rel });
      }
    }
  }
  return { family: 'HP', cases, failures, exact: false, worstRelativeError: worst, tolerance: tol };
}

export function verifyAll(opts = {}) {
  const results = [verifyAP(opts.ap), verifyGP(opts.gp), verifyHP(opts.hp)];
  return {
    results,
    cases: results.reduce((n, r) => n + r.cases, 0),
    failures: results.reduce((n, r) => n + r.failures.length, 0),
  };
}
