// μLux — numerical helpers (stdlib only). FACT: standard algorithms; accuracy noted per function.
const SQRT2PI = Math.sqrt(2 * Math.PI);
export const normPdf = (x) => Math.exp(-0.5 * x * x) / SQRT2PI;

// Standard normal CDF. |x| < 5: power series (abs error ~1e-15); else continued fraction tail.
export function normCdf(x) {
  if (x === 0) return 0.5;
  if (Math.abs(x) < 5) {
    let term = x, sum = x;
    for (let n = 1; n < 500; n++) {
      term *= (x * x) / (2 * n + 1);
      sum += term;
      if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
    }
    return 0.5 + normPdf(x) * sum;
  }
  const ax = Math.abs(x);
  let cf = 0;
  for (let k = 120; k >= 1; k--) cf = k / (ax + cf);
  const tail = normPdf(ax) / (ax + cf);
  return x > 0 ? 1 - tail : tail;
}

// Inverse normal CDF: Acklam initial guess + Newton refinement on normCdf.
export function normPpf(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('p must be in (0,1)');
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  for (let i = 0; i < 4; i++) x -= (normCdf(x) - p) / normPdf(x);
  return x;
}

// Integer factorisation by trial division (fine up to ~1e12 for this app's registers).
export function factorint(n) {
  const out = [];
  let m = n;
  for (const p of [2, 3]) { let e = 0; while (m % p === 0) { m /= p; e++; } if (e) out.push([p, e]); }
  for (let p = 5; p * p <= m; p += 6) {
    for (const q of [p, p + 2]) { let e = 0; while (m % q === 0) { m /= q; e++; } if (e) out.push([q, e]); }
  }
  if (m > 1) out.push([m, 1]);
  return out;
}
export const factorString = (n) => factorint(n).map(([p, e]) => (e > 1 ? `${p}^${e}` : `${p}`)).join(' · ');
export const divisorCount = (n) => factorint(n).reduce((t, [, e]) => t * (e + 1), 1);
export const divisorSigma = (n) => factorint(n).reduce((t, [p, e]) => t * ((p ** (e + 1) - 1) / (p - 1)), 1);
export function numberInfo(n) {
  const s = divisorSigma(n);
  return { n, factors: factorString(n), tau: divisorCount(n), sigma: s, cls: s - n === n ? 'perfect' : s - n > n ? 'abundant' : 'deficient' };
}
export function primePi(n) {
  const sieve = new Uint8Array(n + 1); let count = 0;
  for (let i = 2; i <= n; i++) { if (!sieve[i]) { count++; for (let j = i * i; j <= n; j += i) sieve[j] = 1; } }
  return count;
}
export const isPrime = (n) => n > 1 && factorint(n).length === 1 && factorint(n)[0][1] === 1;
export const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return Math.abs(a); };

// Exact rationals with BigInt.
const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
export class Frac {
  constructor(n, d = 1n) {
    n = BigInt(n); d = BigInt(d);
    if (d === 0n) throw new RangeError('zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = bgcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static parse(s) { // decimal string such as "12.32"
    const [i, f = ''] = String(s).split('.');
    return new Frac(BigInt(i + f), 10n ** BigInt(f.length));
  }
  div(o) { return new Frac(this.n * o.d, this.d * o.n); }
  mul(o) { return new Frac(this.n * o.n, this.d * o.d); }
  sub(o) { return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  toNumber() { return Number(this.n) / Number(this.d); }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  // Decimal expansion with repetend detection, e.g. 365.2(597402)
  repeating(maxDigits = 60) {
    const ip = this.n / this.d; let r = this.n % this.d; const seen = new Map(); let digits = '';
    while (r !== 0n && !seen.has(r) && digits.length < maxDigits) { seen.set(r, digits.length); r *= 10n; digits += (r / this.d).toString(); r %= this.d; }
    if (r === 0n) return digits ? `${ip}.${digits}` : `${ip}`;
    if (seen.has(r)) { const k = seen.get(r); return `${ip}.${digits.slice(0, k)}(${digits.slice(k)})`; }
    return `${ip}.${digits}…`;
  }
}

// Minimal complex arithmetic as [re, im].
export const C = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const den = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / den, (a[1] * b[0] - a[0] * b[1]) / den]; },
  abs: (a) => Math.hypot(a[0], a[1]),
  exp_i: (t) => [Math.cos(t), Math.sin(t)],
  scale: (a, s) => [a[0] * s, a[1] * s],
};
