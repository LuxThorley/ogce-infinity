// μLux — deterministic PRNG (mulberry32). Not cryptographic; used for reproducible sampling only.
export function mulberry32(seed) {
  let a = seed >>> 0;
  const next32 = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  const rng = () => next32() / 4294967296;
  rng.u32 = next32;
  rng.choice = (arr) => arr[Math.floor(rng() * arr.length)];
  return rng;
}
export function popcount32(x) {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}
