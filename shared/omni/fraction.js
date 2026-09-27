// Exact rational arithmetic on BigInt. Immutable, always normalised
// (gcd-reduced, positive denominator), so equality is structural.

const abs = (a) => (a < 0n ? -a : a);

export function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

function bitLength(a) {
  return a === 0n ? 0 : abs(a).toString(2).length;
}

export class Fraction {
  constructor(n, d = 1n) {
    n = BigInt(n);
    d = BigInt(d);
    if (d === 0n) throw new RangeError('Fraction: zero denominator');
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    this.n = g > 1n ? n / g : n;
    this.d = g > 1n ? d / g : d;
    Object.freeze(this);
  }

  /** Accepts Fraction | bigint | integer or decimal number | "a/b" | "1.25". */
  static from(x) {
    if (x instanceof Fraction) return x;
    if (typeof x === 'bigint') return new Fraction(x);
    if (typeof x === 'number') {
      if (!Number.isFinite(x)) throw new RangeError('Fraction: non-finite number');
      if (Number.isInteger(x)) return new Fraction(BigInt(x));
      return Fraction.from(String(x));
    }
    if (typeof x === 'string') {
      const s = x.trim();
      if (/^[+-]?\d+\/[+-]?\d+$/.test(s)) {
        const [a, b] = s.split('/');
        return new Fraction(BigInt(a), BigInt(b));
      }
      const m = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(s);
      if (!m || (m[2] === '' && (m[3] ?? '') === '')) throw new SyntaxError(`Fraction: cannot parse "${x}"`);
      const [, sign, whole, frac = '', exp = '0'] = m;
      let n = BigInt((whole || '0') + frac);
      let d = 10n ** BigInt(frac.length);
      const e = Number(exp);
      if (e > 0) n *= 10n ** BigInt(e);
      else if (e < 0) d *= 10n ** BigInt(-e);
      return new Fraction(sign === '-' ? -n : n, d);
    }
    throw new TypeError(`Fraction: unsupported value ${x}`);
  }

  add(o) {
    o = Fraction.from(o);
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o) {
    o = Fraction.from(o);
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o) {
    o = Fraction.from(o);
    return new Fraction(this.n * o.n, this.d * o.d);
  }
  div(o) {
    o = Fraction.from(o);
    if (o.n === 0n) throw new RangeError('Fraction: division by zero');
    return new Fraction(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Fraction(-this.n, this.d);
  }
  pow(k) {
    k = Number(k);
    if (!Number.isInteger(k)) throw new RangeError('Fraction.pow: integer exponent required');
    if (k >= 0) return new Fraction(this.n ** BigInt(k), this.d ** BigInt(k));
    if (this.n === 0n) throw new RangeError('Fraction.pow: zero to a negative power');
    return new Fraction(this.d ** BigInt(-k), this.n ** BigInt(-k));
  }
  cmp(o) {
    o = Fraction.from(o);
    const l = this.n * o.d;
    const r = o.n * this.d;
    return l < r ? -1 : l > r ? 1 : 0;
  }
  eq(o) {
    o = Fraction.from(o);
    return this.n === o.n && this.d === o.d;
  }
  isZero() {
    return this.n === 0n;
  }
  isInteger() {
    return this.d === 1n;
  }

  /** Nearest double, safe for numerators/denominators far beyond 2^1024 each. */
  toNumber() {
    if (this.n === 0n) return 0;
    const e = bitLength(this.n) - bitLength(this.d) - 64;
    const q = e >= 0 ? this.n / (this.d << BigInt(e)) : (this.n << BigInt(-e)) / this.d;
    return Number(q) * 2 ** e;
  }

  /** Decimal string truncated to `digits` places. */
  toDecimal(digits = 12) {
    const sign = this.n < 0n ? '-' : '';
    const n = abs(this.n);
    const scaled = (n * 10n ** BigInt(digits)) / this.d;
    const s = scaled.toString().padStart(digits + 1, '0');
    const whole = s.slice(0, s.length - digits);
    const frac = digits ? '.' + s.slice(s.length - digits) : '';
    return sign + whole + frac;
  }

  toString() {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }
  toJSON() {
    return this.toString();
  }
}

export const ZERO = new Fraction(0n);
export const ONE = new Fraction(1n);
