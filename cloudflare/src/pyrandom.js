// Bit-exact port of CPython's random.Random (MT19937) for the subset OGCE uses:
// seeding from a non-negative int, random(), randrange(n), choice(seq), getrandbits(k<=32).
export class PyRandom {
  constructor(seed = 0) { this.mt = new Uint32Array(624); this.mti = 625; this.seed(seed); }
  _initGenrand(s) {
    const mt = this.mt; mt[0] = s >>> 0;
    for (let i = 1; i < 624; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (Math.imul(1812433253, prev) + i) >>> 0;
    }
    this.mti = 624;
  }
  seed(n) {
    let big = BigInt(n); if (big < 0n) big = -big;
    const key = [];
    if (big === 0n) key.push(0);
    while (big > 0n) { key.push(Number(big & 0xffffffffn)); big >>= 32n; }
    this._initGenrand(19650218);
    const mt = this.mt; let i = 1, j = 0; const N = 624;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1664525)) + key[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ Math.imul(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }
  _uint32() {
    const mt = this.mt, N = 624, M = 397;
    if (this.mti >= N) {
      let kk = 0, y;
      const mag = (v) => (v & 1 ? 0x9908b0df : 0);
      for (; kk < N - M; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = (mt[kk + M] ^ (y >>> 1) ^ mag(y)) >>> 0; }
      for (; kk < N - 1; kk++) { y = (mt[kk] & 0x80000000) | (mt[kk + 1] & 0x7fffffff); mt[kk] = (mt[kk + (M - N)] ^ (y >>> 1) ^ mag(y)) >>> 0; }
      y = (mt[N - 1] & 0x80000000) | (mt[0] & 0x7fffffff); mt[N - 1] = (mt[M - 1] ^ (y >>> 1) ^ mag(y)) >>> 0;
      this.mti = 0;
    }
    let y = mt[this.mti++];
    y ^= y >>> 11; y = (y ^ ((y << 7) & 0x9d2c5680)) >>> 0; y = (y ^ ((y << 15) & 0xefc60000)) >>> 0; y ^= y >>> 18;
    return y >>> 0;
  }
  random() { const a = this._uint32() >>> 5, b = this._uint32() >>> 6; return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0); }
  getrandbits(k) { if (k <= 0 || k > 32) throw new RangeError('k must be 1..32'); return this._uint32() >>> (32 - k); }
  _randbelow(n) { if (n <= 0) throw new RangeError('empty range'); const k = n.toString(2).length; let r = this.getrandbits(k); while (r >= n) r = this.getrandbits(k); return r; }
  randrange(n) { return this._randbelow(n); }
  choice(seq) { if (!seq.length) throw new RangeError('Cannot choose from an empty sequence'); return seq[this._randbelow(seq.length)]; }
}
