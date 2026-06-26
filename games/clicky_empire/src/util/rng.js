// Seedable, shareable RNG. Deterministic: same string seed -> same stream.
// Node-safe (no DOM / three). Used for map gen, drafts, wave composition.
//
// Implementation: xmur3 string hash -> mulberry32 PRNG.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Returns an RNG object with helpers. Pass a string seed.
export function makeRng(seed) {
  const seedFn = xmur3(String(seed));
  let next = mulberry32(seedFn());

  const api = {
    seed: String(seed),
    // float in [0,1)
    next: () => next(),
    // float in [min,max)
    range: (min, max) => min + next() * (max - min),
    // int in [min,max] inclusive
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    // true with probability p
    chance: (p) => next() < p,
    // random element
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    // weighted pick: items [{...}], weightFn -> number
    weighted: (items, weightFn) => {
      let total = 0;
      for (const it of items) total += Math.max(0, weightFn(it));
      let r = next() * total;
      for (const it of items) {
        r -= Math.max(0, weightFn(it));
        if (r <= 0) return it;
      }
      return items[items.length - 1];
    },
    // in-place Fisher-Yates shuffle
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    // fork a deterministic sub-stream (e.g. per-tile noise)
    fork: (tag) => makeRng(`${seed}:${tag}`),
  };
  return api;
}

// A short, human-friendly shareable seed string.
export function randSeedString(rng) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // If no rng provided, fall back to a time/perf based seed (browser only).
  const src =
    rng?.next ??
    (() => (typeof performance !== "undefined" ? performance.now() % 1 : 0.5));
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(src() * alphabet.length)];
  return s;
}
