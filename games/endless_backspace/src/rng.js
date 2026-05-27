// Seedable RNG (mulberry32) and string -> seed hash.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seedString) {
  const seed = typeof seedString === "number" ? seedString : hashString(String(seedString));
  return mulberry32(seed);
}

export function chunkRng(masterSeedString, cx, cz) {
  const tag = `${masterSeedString}|${cx},${cz}`;
  return makeRng(tag);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function weightedPick(rng, entries) {
  // entries = [[item, weight], ...]
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r <= 0) return item;
  }
  return entries[entries.length - 1][0];
}

export function randomSeedString() {
  // 8-char base36 string, easy to share.
  const r = Math.floor(Math.random() * 0xffffffff).toString(36).padStart(7, "0");
  return r.slice(0, 8).toUpperCase();
}
