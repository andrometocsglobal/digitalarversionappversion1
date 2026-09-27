// OmniChooser — picks the cheapest correct algorithm for a progression sum and
// says why. Every choice is O(1) in the number of terms; what changes is
// whether the answer is exact (BigInt rational) or a double.

import {
  apRangePowerSum,
  gpPowerSum,
  hpPowerSum,
  hpPowerSumExact,
  latticePowerSum,
} from './engine.js';

// Guard rails so an API caller cannot ask for a multi-gigabyte BigInt.
export const LIMITS = Object.freeze({
  maxPower: 200,
  maxDims: 64,
  maxGpBits: 2_000_000, // bits in r^(s n)
  exactHpTerms: 64, // below this, exact rational HP is cheaper than it is slow
});

const toBig = (v, name) => {
  if (typeof v === 'bigint') return v;
  const s = String(v).trim();
  if (!/^[+-]?\d+$/.test(s)) throw new RangeError(`${name} must be an integer`);
  return BigInt(s);
};

function assertPower(p, name = 'power') {
  const n = Number(p);
  if (!Number.isInteger(n) || n < 0 || n > LIMITS.maxPower) {
    throw new RangeError(`${name} must be an integer in 0..${LIMITS.maxPower}`);
  }
  return n;
}

function timed(fn) {
  const t0 = globalThis.performance?.now?.() ?? Date.now();
  const value = fn();
  const t1 = globalThis.performance?.now?.() ?? Date.now();
  return { value, ms: +(t1 - t0).toFixed(4) };
}

/**
 * Solve one request. kind: 'ap' | 'gp' | 'hp' | 'lattice'.
 * Returns { kind, algorithm, exact, time, space, terms, value, decimal, ms }.
 */
export function solve(kind, params = {}) {
  switch (kind) {
    case 'ap': {
      const F = toBig(params.F ?? 1, 'F');
      const L = toBig(params.L ?? 10, 'L');
      const p = assertPower(params.p ?? 1, 'p');
      if (L < F) throw new RangeError('need F <= L');
      const { value, ms } = timed(() => apRangePowerSum(F, L, p));
      return {
        kind,
        algorithm: 'midpoint moment blocks (terminating Pascal expansion)',
        exact: true,
        time: `O(p²) = O(${p}²), independent of X`,
        space: 'O(1) + bounded μ-cache',
        terms: (L - F + 1n).toString(),
        value: value.toString(),
        decimal: value.toDecimal(0),
        ms,
      };
    }
    case 'gp': {
      const a = params.a ?? 1;
      const r = params.r ?? 2;
      const n = toBig(params.n ?? 10, 'n');
      const s = assertPower(params.s ?? 1, 's');
      if (n < 0n) throw new RangeError('n must be >= 0');
      const bits = Math.log2(Math.abs(Number(r)) || 1) * s * Number(n);
      if (bits > LIMITS.maxGpBits) {
        throw new RangeError(`result would have ~${Math.round(bits)} bits; limit is ${LIMITS.maxGpBits}`);
      }
      const { value, ms } = timed(() => gpPowerSum(a, r, n, s));
      return {
        kind,
        algorithm: 'native geometric closed form a^s(r^(sn)-1)/(r^s-1)',
        exact: true,
        time: 'O(1) arithmetic operations (plus O(log n) squarings for r^(sn))',
        space: 'O(size of the answer)',
        terms: n.toString(),
        value: value.toString(),
        decimal: value.toDecimal(value.isInteger() ? 0 : 12),
        ms,
      };
    }
    case 'hp': {
      const F = toBig(params.F ?? 1, 'F');
      const L = toBig(params.L ?? 10, 'L');
      const s = Number(params.s ?? 1);
      if (!(s > 0) || s > LIMITS.maxPower) throw new RangeError(`s must be in (0, ${LIMITS.maxPower}]`);
      if (F < 1n || L < F) throw new RangeError('need 1 <= F <= L');
      const X = L - F + 1n;
      if (X <= BigInt(LIMITS.exactHpTerms) && Number.isInteger(s)) {
        const { value, ms } = timed(() => hpPowerSumExact(F, L, s));
        return {
          kind,
          algorithm: 'exact rational (range is small enough to sum directly)',
          exact: true,
          time: `O(X) with X = ${X} ≤ ${LIMITS.exactHpTerms}`,
          space: 'O(1)',
          terms: X.toString(),
          value: value.toString(),
          decimal: value.toDecimal(16),
          ms,
        };
      }
      const { value, ms } = timed(() => hpPowerSum(F, L, s));
      return {
        kind,
        algorithm: 'Euler–Maclaurin / ζ–ψ asymptotics with 10 Bernoulli blocks',
        exact: false,
        time: 'O(s), independent of X',
        space: 'O(1)',
        terms: X.toString(),
        value: String(value),
        decimal: value.toPrecision(16),
        ms,
      };
    }
    case 'lattice': {
      const dims = params.dims ?? [];
      if (!Array.isArray(dims) || dims.length === 0 || dims.length > LIMITS.maxDims) {
        throw new RangeError(`dims must be a list of 1..${LIMITS.maxDims} {F, L, p}`);
      }
      const parsed = dims.map((d, i) => {
        const F = toBig(d.F, `dims[${i}].F`);
        const L = toBig(d.L, `dims[${i}].L`);
        if (L < F) throw new RangeError(`dims[${i}]: need F <= L`);
        return { F, L, p: assertPower(d.p ?? 0, `dims[${i}].p`) };
      });
      const { value, ms } = timed(() => latticePowerSum(parsed));
      return {
        kind,
        algorithm: 'separable product of per-axis midpoint sums',
        exact: true,
        time: `O(D·p²) with D = ${parsed.length}, independent of lattice size`,
        space: 'O(1) + bounded μ-cache',
        terms: parsed.reduce((acc, d) => acc * (d.L - d.F + 1n), 1n).toString(),
        value: value.toString(),
        decimal: value.toDecimal(0),
        ms,
      };
    }
    default:
      throw new RangeError(`unknown kind "${kind}"`);
  }
}
