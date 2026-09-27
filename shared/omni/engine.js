// The Omni midpoint engine — AP, GP and HP power sums from one expansion.
//
// Recentre a sum on its midpoint M = (F+L)/2 and expand in symmetric offsets.
// Odd terms cancel; what survives are the central-moment blocks mu_2m(X):
//
//     sum_{k=F..L} f(k) = X * sum_m f^(2m)(M)/(2m)! * mu_2m(X)
//
//   AP  f(k) = k^d       the series terminates  -> exact integer, O(d^2) ops
//   GP  f(k) = (a r^k)^s native closed form     -> exact, O(1) ops
//   HP  f(k) = k^-s      never terminates       -> zeta/polygamma or
//                                                  constant-time asymptotics
//
// "O(1)" throughout means independent of the number of terms X: cost depends
// only on the power, and memory is a bounded cache. Exact results are BigInt
// Fractions; the HP fast path is IEEE double with ~1e-15 relative error.

import { Fraction, ZERO, ONE } from './fraction.js';

const F = (x) => Fraction.from(x);
const big = (x) => {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x);
  if (typeof x === 'string' && /^[+-]?\d+$/.test(x.trim())) return BigInt(x.trim());
  throw new TypeError(`expected an integer, got ${x}`);
};

/** Tiny bounded LRU so memo tables can never grow without limit (O(1) space). */
class BoundedCache {
  constructor(limit) {
    this.limit = limit;
    this.map = new Map();
  }
  get(k) {
    if (!this.map.has(k)) return undefined;
    const v = this.map.get(k);
    this.map.delete(k);
    this.map.set(k, v);
    return v;
  }
  set(k, v) {
    this.map.set(k, v);
    if (this.map.size > this.limit) this.map.delete(this.map.keys().next().value);
    return v;
  }
}

// ---------------------------------------------------------------- combinatorics

const binomRows = [[1n]];
/** C(n, k) as BigInt via a cached Pascal triangle (rows kept up to n). */
export function binom(n, k) {
  n = Number(n);
  k = Number(k);
  if (k < 0 || k > n) return 0n;
  if (n > 2000) {
    // Outside the cached triangle: multiplicative formula.
    let r = 1n;
    k = Math.min(k, n - k);
    for (let i = 1; i <= k; i++) r = (r * BigInt(n - k + i)) / BigInt(i);
    return r;
  }
  while (binomRows.length <= n) {
    const prev = binomRows[binomRows.length - 1];
    const row = [1n];
    for (let i = 1; i < prev.length; i++) row.push(prev[i - 1] + prev[i]);
    row.push(1n);
    binomRows.push(row);
  }
  return binomRows[n][k];
}

export function factorial(n) {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

const bernoulliTable = [ONE];
/** Bernoulli numbers B_0..B_n as exact Fractions (B_1 = -1/2 convention). */
export function bernoulli(n) {
  for (let m = bernoulliTable.length; m <= n; m++) {
    let s = ZERO;
    for (let k = 0; k < m; k++) s = s.add(bernoulliTable[k].mul(binom(m + 1, k)));
    bernoulliTable.push(s.neg().div(m + 1));
  }
  return bernoulliTable.slice(0, n + 1);
}

// ------------------------------------------------------------------ Faulhaber

/** Exact 1^p + 2^p + ... + n^p. O(p^2) in the power, O(1) in n. */
export function powerSumClosed(n, p) {
  n = big(n);
  p = Number(p);
  if (n <= 0n) return ZERO;
  if (!Number.isInteger(p) || p < 0) throw new RangeError('powerSumClosed: integer p >= 0 required');
  if (p === 0) return new Fraction(n);
  const B = bernoulli(p);
  let total = ZERO;
  for (let j = 0; j <= p; j++) {
    total = total.add(B[j].mul(binom(p + 1, j)).mul(new Fraction(n ** BigInt(p + 1 - j))));
  }
  return total.div(p + 1).add(new Fraction(n ** BigInt(p)));
}

// -------------------------------------------------------------- moment blocks

const momentCache = new BoundedCache(4096);
/**
 * mu_2m(X): the (2m)-th central moment of {0, 1, ..., X-1}, exactly.
 *   mu_0 = 1,  mu_2 = (X^2-1)/12, ...
 * Built from Faulhaber sums, so it is exact for every m and costs nothing in X.
 */
export function centralMoment(m, X) {
  m = Number(m);
  X = big(X);
  if (X <= 0n) return ZERO;
  if (m === 0) return ONE;
  const key = `${m}:${X}`;
  const hit = momentCache.get(key);
  if (hit) return hit;
  const c = new Fraction(X - 1n, 2n);
  let total = ZERO;
  for (let j = 0; j <= 2 * m; j++) {
    const ps = j === 0 ? new Fraction(X) : powerSumClosed(X - 1n, j);
    total = total.add(c.neg().pow(2 * m - j).mul(binom(2 * m, j)).mul(ps));
  }
  return momentCache.set(key, total.div(new Fraction(X)));
}

/** Midpoint of an arithmetic run F, F+h, ..., F+(X-1)h. */
export function runMidpoint(Fst, h, X) {
  return F(Fst).add(new Fraction(big(X) - 1n, 2n).mul(F(h)));
}

// ------------------------------------------------------------------------ AP

/**
 * Exact sum_{i=0}^{X-1} (F + i*h)^p in midpoint form, O(p^2) and O(1) in X:
 *   X * sum_m C(p,2m) M^(p-2m) h^(2m) mu_2m(X)
 */
export function apPowerSum(Fst, h, X, p) {
  X = big(X);
  p = Number(p);
  if (X <= 0n) return ZERO;
  if (!Number.isInteger(p) || p < 0) throw new RangeError('apPowerSum: integer p >= 0 required');
  const M = runMidpoint(Fst, h, X);
  const hh = F(h);
  let total = ZERO;
  for (let m = 0; 2 * m <= p; m++) {
    total = total.add(
      M.pow(p - 2 * m).mul(hh.pow(2 * m)).mul(centralMoment(m, X)).mul(binom(p, 2 * m)),
    );
  }
  return total.mul(new Fraction(X));
}

/** D^d over the integer range k = F..L (the slide notation). */
export function apRangePowerSum(Fst, L, d) {
  const X = big(L) - big(Fst) + 1n;
  return apPowerSum(Fst, 1, X, d);
}

/** O(X) reference, for verification only. */
export function apPowerSumBrute(Fst, h, X, p) {
  let s = ZERO;
  const f = F(Fst);
  const hh = F(h);
  for (let i = 0n; i < big(X); i++) s = s.add(f.add(hh.mul(i)).pow(Number(p)));
  return s;
}

/** Symbolic midpoint formula for D^d, e.g. "X·M·[M^2 + 3μ2]". */
export function apFormula(d) {
  d = Number(d);
  if (d === 0) return 'X';
  if (d === 1) return 'X·M';
  const odd = d % 2 === 1;
  const parts = [];
  for (let m = 0; 2 * m <= d; m++) {
    const c = binom(d, 2 * m);
    const mp = d - 2 * m - (odd ? 1 : 0);
    const mTerm = mp === 0 ? '' : mp === 1 ? 'M' : `M^${mp}`;
    const muTerm = m === 0 ? '' : `μ${2 * m}`;
    const body = [mTerm, muTerm].filter(Boolean).join('·') || '1';
    parts.push(`${c === 1n ? '' : c + ''}${c !== 1n && body !== '1' ? '·' : ''}${body === '1' && c !== 1n ? '' : body}`);
  }
  return `X·${odd ? 'M·' : ''}[${parts.join(' + ')}]`;
}

// ------------------------------------------------------------------------ GP

/** Exact sum_{i=0}^{n-1} (a r^i)^s = a^s (r^(sn) - 1)/(r^s - 1); O(1) operations. */
export function gpPowerSum(a, r, n, s = 1) {
  n = big(n);
  s = Number(s);
  if (n <= 0n) return ZERO;
  const as = F(a).pow(s);
  const rs = F(r).pow(s);
  if (rs.eq(ONE)) return as.mul(new Fraction(n));
  return as.mul(rs.pow(Number(n)).sub(ONE)).div(rs.sub(ONE));
}

/** Infinite GP sum a^s / (1 - r^s), for |r^s| < 1. */
export function gpInfiniteSum(a, r, s = 1) {
  const rs = F(r).pow(Number(s));
  if (rs.cmp(ONE) >= 0 || rs.cmp(ONE.neg()) <= 0) throw new RangeError('gpInfiniteSum: needs |r^s| < 1');
  return F(a).pow(Number(s)).div(ONE.sub(rs));
}

/** Exact prod_{i=0}^{X-1} (a r^i)^w = a^(wX) r^(w X(X-1)/2). */
export function gpPowerProduct(a, r, X, w = 1) {
  X = big(X);
  w = BigInt(w);
  if (X <= 0n) return ONE;
  return F(a).pow(Number(w * X)).mul(F(r).pow(Number((w * X * (X - 1n)) / 2n)));
}

export function gpPowerSumBrute(a, r, n, s = 1) {
  let t = ZERO;
  for (let i = 0; i < Number(n); i++) t = t.add(F(a).mul(F(r).pow(i)).pow(Number(s)));
  return t;
}

// ------------------------------------------------------------------------ HP

/** Exact rational sum_{k=F..L} k^-s, O(X). Reference for verification. */
export function hpPowerSumExact(Fst, L, s) {
  let t = ZERO;
  for (let k = big(Fst); k <= big(L); k++) {
    if (k === 0n) throw new RangeError('hpPowerSumExact: range includes 0');
    t = t.add(new Fraction(1n, k ** BigInt(s)));
  }
  return t;
}

// Bernoulli B_2j / (2j)! as doubles, j = 1..10.
const EM = (() => {
  const B = bernoulli(20);
  const out = [];
  for (let j = 1; j <= 10; j++) out.push(B[2 * j].div(new Fraction(factorial(2 * j))).toNumber());
  return out;
})();

/** Euler–Maclaurin sum_{k=a}^{b} k^-s for real a >= shift, s > 0. Fixed cost. */
function emPowerSum(a, b, s) {
  // Integral term, written to avoid cancellation when b is close to a.
  const ratio = Math.log1p((b - a) / a); // ln(b/a)
  const integral = s === 1 ? ratio : (a ** (1 - s) * -Math.expm1((1 - s) * ratio)) / (s - 1);
  let total = integral + (a ** -s + b ** -s) / 2;
  // f^(2j-1)(x) = -(s)_(2j-1) x^(-s-2j+1)
  let rising = s; // (s)_1
  for (let j = 1; j <= EM.length; j++) {
    const k = 2 * j - 1;
    const dA = -rising * a ** (-s - k);
    const dB = b === Infinity ? 0 : -rising * b ** (-s - k);
    total += EM[j - 1] * (dB - dA);
    rising *= (s + k) * (s + k + 1); // advance to (s)_(2j+1)
  }
  return total;
}

/** How many leading terms to add directly so the asymptotic tail is sharp. */
const shiftFor = (s) => Math.max(12, Math.ceil(s) + 12);

/**
 * O(1) sum_{k=F..L} k^-s for real s > 0 and integer 1 <= F <= L (L may be huge).
 * Direct sum of a fixed number of leading terms (depends on s, not X), then
 * Euler–Maclaurin with ten Bernoulli correction blocks. Relative error ~1e-15.
 */
export function hpPowerSum(Fst, L, s = 1) {
  const f = Number(Fst);
  const l = Number(L);
  s = Number(s);
  if (!(f >= 1) || !(l >= f) || !(s > 0)) throw new RangeError('hpPowerSum: need 1 <= F <= L and s > 0');
  const shift = shiftFor(s);
  let total = 0;
  let k = f;
  const stop = Math.min(l, f + shift - 1);
  for (; k <= stop; k++) total += k ** -s;
  if (k > l) return total;
  return total + emPowerSum(k, l, s);
}

/** Hurwitz zeta ζ(s, a) = sum_{k>=0} (a+k)^-s, for s > 1, a > 0. O(1). */
export function hurwitzZeta(s, a) {
  s = Number(s);
  a = Number(a);
  if (!(s > 1) || !(a > 0)) throw new RangeError('hurwitzZeta: need s > 1, a > 0');
  const shift = shiftFor(s);
  let total = 0;
  for (let i = 0; i < shift; i++) total += (a + i) ** -s;
  const A = a + shift;
  // Tail sum_{k>=0} (A+k)^-s = A^(1-s)/(s-1) + A^-s/2 - sum_j EM_j f^(2j-1)(A)
  let tail = A ** (1 - s) / (s - 1) + A ** -s / 2;
  let rising = s;
  for (let j = 1; j <= EM.length; j++) {
    const k = 2 * j - 1;
    tail -= EM[j - 1] * (-rising * A ** (-s - k));
    rising *= (s + k) * (s + k + 1);
  }
  return total + tail;
}

/** Digamma ψ(x), x > 0: recurrence up to x >= 12 then the asymptotic series. */
export function digamma(x) {
  x = Number(x);
  if (!(x > 0)) throw new RangeError('digamma: x > 0 required');
  let r = 0;
  while (x < 12) r -= 1 / x++;
  const inv2 = 1 / (x * x);
  let series = Math.log(x) - 1 / (2 * x);
  let pw = inv2;
  for (let j = 1; j <= 8; j++) {
    series -= (EM[j - 1] * factorialNumber(2 * j) * pw) / (2 * j);
    pw *= inv2;
  }
  return r + series;
}

function factorialNumber(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** Polygamma ψ^(n)(x) for n >= 1: (-1)^(n+1) n! ζ(n+1, x). */
export function polygamma(n, x) {
  n = Number(n);
  if (n === 0) return digamma(x);
  return (n % 2 === 1 ? 1 : -1) * factorialNumber(n) * hurwitzZeta(n + 1, x);
}

/** HP[s] in the slide's polygamma form: (-1)^s/(s-1)! [ψ^(s-1)(F) - ψ^(s-1)(L+1)]. */
export function hpPolygammaForm(Fst, L, s) {
  s = Number(s);
  if (s === 1) return digamma(Number(L) + 1) - digamma(Number(Fst));
  const sign = s % 2 === 0 ? 1 : -1;
  return (sign / factorialNumber(s - 1)) * (polygamma(s - 1, Number(Fst)) - polygamma(s - 1, Number(L) + 1));
}

const rising = (p, k) => {
  let out = 1n;
  for (let t = 0; t < k; t++) out *= BigInt(p + t);
  return out;
};

/**
 * The midpoint moment-block expansion applied to HP, truncated at `order`:
 *   X * sum_{m=0}^{order} (p)_2m/(2m)! * h^2m * mu_2m(X) / M^(p+2m)
 * The same mu library as AP, reused verbatim. The series is exact; the
 * truncation is what approximates — report it as accuracy, never "zero error".
 */
export function hpMidpointApprox(Fst, h, X, p = 1, order = 3) {
  X = big(X);
  p = Number(p);
  if (X <= 0n) return ZERO;
  const M = runMidpoint(Fst, h, X);
  if (M.isZero()) throw new RangeError('hpMidpointApprox: midpoint is zero (run straddles a pole)');
  const hh = F(h);
  let total = ZERO;
  for (let m = 0; m <= order; m++) {
    const coef = new Fraction(rising(p, 2 * m), factorial(2 * m));
    total = total.add(coef.mul(hh.pow(2 * m)).mul(centralMoment(m, X)).div(M.pow(p + 2 * m)));
  }
  return total.mul(new Fraction(X));
}

// ------------------------------------------------------------ midpoint means

/** The flagship midpoint operator across the classical means. */
export function omniMidpoint(a, b, family = 'harmonic') {
  switch (family) {
    case 'harmonic': {
      const A = F(a);
      const B = F(b);
      if (A.add(B).isZero()) throw new RangeError('harmonic midpoint undefined for a + b = 0');
      return A.mul(B).mul(2).div(A.add(B));
    }
    case 'arithmetic':
      return F(a).add(F(b)).div(2);
    case 'geometric':
      return Math.sqrt(Number(a) * Number(b));
    case 'quadratic':
      return Math.sqrt((Number(a) ** 2 + Number(b) ** 2) / 2);
    default:
      throw new RangeError(`unknown family: ${family}`);
  }
}

/** Harmonic mean of a list in one pass, O(1) extra space. */
export function harmonicMean(values) {
  let n = 0;
  let inv = 0;
  for (const v of values) {
    if (!(v > 0)) continue;
    n++;
    inv += 1 / v;
  }
  return n ? n / inv : 0;
}

// ------------------------------------------------------ omnidimensional lattice

/**
 * sum over a D-dimensional box of prod_i k_i^{p_i} = prod_i D^{p_i}(F_i..L_i).
 * Separable, so D one-dimensional O(1) sums: O(D) total, exact.
 * dims: [{ F, L, p }]
 */
export function latticePowerSum(dims) {
  let total = ONE;
  for (const { F: f, L, p = 0 } of dims) total = total.mul(apRangePowerSum(f, L, p));
  return total;
}

/** Number of lattice points in the box — p = 0 in every dimension. */
export function latticeCount(dims) {
  return latticePowerSum(dims.map(({ F: f, L }) => ({ F: f, L, p: 0 })));
}
