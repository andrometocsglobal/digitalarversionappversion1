import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Fraction,
  apRangePowerSum,
  apPowerSum,
  apPowerSumBrute,
  apFormula,
  centralMoment,
  powerSumClosed,
  gpPowerSum,
  gpInfiniteSum,
  gpPowerProduct,
  hpPowerSum,
  hpPowerSumExact,
  hpPolygammaForm,
  hpMidpointApprox,
  hurwitzZeta,
  digamma,
  omniMidpoint,
  harmonicMean,
  latticePowerSum,
  latticeCount,
  solve,
  verifyAll,
} from '../../shared/omni/index.js';

// Values straight from the Omni AP·GP·HP deck.
const DECK_AP = [25, 135, 775, 4659, 28975, 184755, 1200175, 7907139, 52666255, 353814675];
const DECK_GP = [31, 341, 4681, 69905, 1082401, 17043521, 270549121, 4311810305, 68853957121, 1100586419201];
const DECK_HP = [1.09285714, 0.26179705, 0.06820712, 0.01904003, 0.00559989, 0.00170982, 0.00053587, 0.000171, 0.00005526, 0.00001801];

test('AP D^1..D^10 over k = 3..7 match the deck', () => {
  DECK_AP.forEach((v, i) => assert.equal(apRangePowerSum(3, 7, i + 1).toString(), String(v)));
});

test('GP s = 1..10 with a=1, r=2, n=5 match the deck', () => {
  DECK_GP.forEach((v, i) => assert.equal(gpPowerSum(1, 2, 5, i + 1).toString(), String(v)));
});

test('HP s = 1..10 over k = 3..7 match the deck (both forms)', () => {
  DECK_HP.forEach((v, i) => {
    assert.equal(hpPowerSum(3, 7, i + 1).toFixed(8), v.toFixed(8));
    assert.equal(hpPolygammaForm(3, 7, i + 1).toFixed(8), v.toFixed(8));
  });
});

test('midpoint formula printer reproduces the deck rows', () => {
  assert.equal(apFormula(1), 'X·M');
  assert.equal(apFormula(2), 'X·[M^2 + μ2]');
  assert.equal(apFormula(3), 'X·M·[M^2 + 3·μ2]');
  assert.equal(apFormula(4), 'X·[M^4 + 6·M^2·μ2 + μ4]');
});

test('central moments: mu_0 = 1, mu_2 = (X^2-1)/12, odd X and even X', () => {
  for (const X of [1, 2, 5, 10, 101]) {
    assert.ok(centralMoment(0, X).eq(1));
    assert.ok(centralMoment(1, X).eq(new Fraction(BigInt(X * X - 1), 12n)));
  }
});

test('Faulhaber closed form equals brute force', () => {
  for (let p = 0; p <= 12; p++) {
    for (const n of [1, 2, 7, 30]) {
      let s = 0n;
      for (let k = 1n; k <= BigInt(n); k++) s += k ** BigInt(p);
      assert.equal(powerSumClosed(n, p).toString(), s.toString());
    }
  }
});

test('AP with rational start and step (half-integer midpoints)', () => {
  for (const [F, h] of [['1/2', '1/3'], [-4, 3], ['2.5', '-0.5']]) {
    for (const X of [1, 2, 6, 9]) {
      for (let p = 0; p <= 7; p++) assert.ok(apPowerSum(F, h, X, p).eq(apPowerSumBrute(F, h, X, p)), `${F},${h},${X},${p}`);
    }
  }
});

test('AP is O(1) in the number of terms: D^30 over 10^30 terms is fast and exact', () => {
  const t0 = performance.now();
  const big = apRangePowerSum(1, 10n ** 30n, 30);
  assert.ok(performance.now() - t0 < 2000);
  assert.ok(big.isInteger());
  // Leading behaviour n^31/31: check the digit count.
  assert.equal(big.toString().length, 30 * 31 + 1 - 2);
});

test('GP edge cases: r = 1, negative and fractional ratios, infinite sum, product', () => {
  assert.equal(gpPowerSum(5, 1, 7, 2).toString(), '175');
  assert.equal(gpPowerSum(1, -1, 5, 1).toString(), '1');
  assert.equal(gpPowerSum(1, '1/2', 3, 1).toString(), '7/4');
  assert.equal(gpInfiniteSum(1, '1/2').toString(), '2');
  assert.throws(() => gpInfiniteSum(1, 2));
  assert.equal(gpPowerProduct(2, 3, 3).toString(), String(2 * 6 * 18));
});

test('HP O(1) path stays within 1e-13 of the exact rational for large ranges and powers', () => {
  for (const [F, L, s] of [[1, 5000, 1], [7, 3000, 2], [1, 1000, 20], [100, 4000, 3.5]]) {
    const fast = hpPowerSum(F, L, s);
    let exact = 0;
    // Kahan-free reference: sum smallest terms first in doubles.
    for (let k = L; k >= F; k--) exact += k ** -s;
    assert.ok(Math.abs(fast - exact) / exact < 1e-13, `${F}..${L} s=${s}`);
  }
  const H = hpPowerSum(1, 1e15, 1);
  assert.ok(Math.abs(H - (Math.log(1e15) + 0.5772156649015329 + 5e-16)) < 1e-12);
});

test('zeta and digamma sanity values', () => {
  assert.ok(Math.abs(hurwitzZeta(2, 1) - Math.PI ** 2 / 6) < 1e-14);
  assert.ok(Math.abs(hurwitzZeta(4, 1) - Math.PI ** 4 / 90) < 1e-14);
  assert.ok(Math.abs(digamma(1) + 0.5772156649015329) < 1e-14);
});

test('HP midpoint moment-block expansion converges with order', () => {
  const exact = hpPowerSumExact(200, 260, 2).toNumber();
  const errs = [0, 1, 2, 4, 8].map((o) => Math.abs(hpMidpointApprox(200, 1, 61, 2, o).toNumber() - exact) / exact);
  for (let i = 1; i < errs.length; i++) assert.ok(errs[i] < errs[i - 1], `order error must shrink: ${errs}`);
  assert.ok(errs.at(-1) < 1e-14, `order 8 relative error ${errs.at(-1)}`);
});

test('midpoint means and harmonic mean', () => {
  assert.equal(omniMidpoint(3, 6).toString(), '4');
  assert.equal(omniMidpoint(3, 6, 'arithmetic').toString(), '9/2');
  assert.equal(omniMidpoint(4, 9, 'geometric'), 6);
  assert.equal(harmonicMean([1, 2, 4]), 3 / (1 + 0.5 + 0.25));
});

test('lattice sums are separable products', () => {
  const dims = [{ F: 1, L: 3, p: 1 }, { F: 2, L: 4, p: 2 }];
  let brute = 0;
  for (let a = 1; a <= 3; a++) for (let b = 2; b <= 4; b++) brute += a * b * b;
  assert.equal(latticePowerSum(dims).toString(), String(brute));
  assert.equal(latticeCount([{ F: 1, L: 10n ** 20n }, { F: 1, L: 10n ** 20n }]).toString(), (10n ** 40n).toString());
});

test('chooser picks exact HP for small ranges and asymptotic for large ones', () => {
  assert.equal(solve('hp', { F: 3, L: 7, s: 3 }).exact, true);
  const big = solve('hp', { F: 1, L: '1000000000', s: 2 });
  assert.equal(big.exact, false);
  assert.ok(Math.abs(Number(big.value) - (Math.PI ** 2 / 6 - 1e-9)) < 1e-12);
  assert.equal(solve('ap', { F: 3, L: 7, p: 3 }).value, '775');
  assert.throws(() => solve('ap', { F: 1, L: 5, p: 999 }), /power|p must/);
  assert.throws(() => solve('gp', { a: 1, r: 2, n: '100000000', s: 100 }), /bits/);
  assert.throws(() => solve('nope'));
});

test('exhaustive verification suite has zero failures', () => {
  const r = verifyAll({ ap: { maxL: 14, maxPower: 8 }, hp: { maxL: 24, maxPower: 20 } });
  assert.equal(r.failures, 0);
  assert.ok(r.cases > 5000);
});

test('Fraction basics', () => {
  assert.equal(Fraction.from('0.75').toString(), '3/4');
  assert.equal(Fraction.from('-6/8').toString(), '-3/4');
  assert.equal(Fraction.from('1.5e2').toString(), '150');
  assert.equal(new Fraction(1n, 3n).toDecimal(5), '0.33333');
  assert.equal(new Fraction(10n ** 400n + 1n, 10n ** 399n).toNumber(), 10);
  assert.throws(() => new Fraction(1n, 0n));
});
