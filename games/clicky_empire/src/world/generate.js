// ============================================================================
// world/generate.js — seeded procedural map generation. PURE LOGIC.
//
// No three, no DOM. Imports only from ../util/* , ../state.js , ./tiles.js .
// Node-runnable.
//
// Strategy: a small set of independent value-noise fields (each a hash of the
// tile coordinate, smoothed by bilinear interpolation over a coarse grid and
// summed over a couple of octaves) drive biome assignment. Because the noise is
// derived deterministically from the run seed via makeRng().fork(...), the same
// seed reproduces the same map exactly. Different fields cluster different
// biomes: a "moisture" field carves lakes (water) and seeds forest patches; an
// "elevation" field raises mountain ridges; sparse per-tile rolls scatter the
// rarer ore and berry tiles. Weights drift slightly outward from center so the
// frontier feels a touch richer (more ore/berry) — see rollTileType.
// ============================================================================

import { tileKey, clamp01 } from "../util/math.js";
import { makeRng } from "../util/rng.js";
import { state } from "../state.js";
import { TILE, getTileType } from "./tiles.js";

// How far the generated (but possibly still fogged) world extends from center.
// Generous enough to expand into for a long run. Square [-GEN..+GEN].
const GEN_RADIUS = 12;

// Coarse cell size (in tiles) for the value-noise lattice. Larger => smoother,
// bigger biome blobs.
const NOISE_CELL = 4;

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------

// Deterministic hash of an integer lattice point -> float in [0,1). The `salt`
// gives each noise field its own independent stream off the run seed.
function latticeValue(rng, salt, gx, gy) {
  // Fold the coords + salt into a single string seed; makeRng hashes it.
  // This is a stable per-point pseudo-random value (a value-noise gradient slot).
  return makeRng(`${rng.seed}:${salt}:${gx},${gy}`).next();
}

const smooth = (t) => t * t * (3 - 2 * t); // smoothstep for nicer interpolation

// One octave of bilinearly-interpolated value noise at tile (col,row).
function octave(rng, salt, col, row, cell) {
  const fx = col / cell;
  const fy = row / cell;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smooth(fx - x0);
  const ty = smooth(fy - y0);

  const v00 = latticeValue(rng, salt, x0, y0);
  const v10 = latticeValue(rng, salt, x0 + 1, y0);
  const v01 = latticeValue(rng, salt, x0, y0 + 1);
  const v11 = latticeValue(rng, salt, x0 + 1, y0 + 1);

  const top = v00 + (v10 - v00) * tx;
  const bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

// Multi-octave fractal value noise in [0,1]. Lower octaves dominate (big blobs)
// with finer octaves adding wobble so biomes don't tile too regularly.
function fractalNoise(rng, salt, col, row) {
  const o1 = octave(rng, salt, col, row, NOISE_CELL);
  const o2 = octave(rng, `${salt}#2`, col, row, NOISE_CELL / 2);
  const o3 = octave(rng, `${salt}#3`, col, row, Math.max(1, NOISE_CELL / 4));
  // weights 4:2:1 normalized
  return clamp01((o1 * 4 + o2 * 2 + o3 * 1) / 7);
}

// ---------------------------------------------------------------------------
// Biome assignment
// ---------------------------------------------------------------------------

// Decide a tile type for (col,row) using the seed-derived noise fields.
// Exported so expand.js rolls newly revealed tiles with the SAME weighting.
//
// `rng` must be the run rng (we read rng.seed to derive deterministic per-tile
// noise; we do NOT consume rng's mutable stream, so calling this in any order
// yields the same result — important for fog expansion).
export function rollTileType(col, row, rng) {
  // Distance from center, normalized — used to drift weights outward so the
  // frontier is a bit richer (more ore/berry) and a bit more "wild".
  const dist = Math.hypot(col, row);
  const outward = clamp01(dist / GEN_RADIUS);

  const elevation = fractalNoise(rng, "elev", col, row);
  const moisture = fractalNoise(rng, "moist", col, row);
  // Independent scatter field for rare resource tiles.
  const scatter = fractalNoise(rng, "scatter", col, row);

  // --- Mountains: ridges where elevation is high. Threshold eases slightly
  // outward so ridges extend toward the frontier.
  if (elevation > 0.78 - 0.06 * outward) return TILE.MOUNTAIN;

  // --- Water: lakes where moisture is high AND elevation is low.
  if (moisture > 0.74 - 0.04 * outward && elevation < 0.45) return TILE.WATER;

  // --- Rare scatter: ore on high-scatter near rocky (mid/high elevation),
  // berry on high-scatter near lush (high moisture). Rarer than terrain blobs.
  // Frontier gets a small richness bonus.
  const oreThresh = 0.86 - 0.05 * outward;
  const berryThresh = 0.86 - 0.05 * outward;
  if (scatter > oreThresh && elevation > 0.5) return TILE.ORE;
  if (scatter > berryThresh && moisture > 0.55) return TILE.BERRY;
  // A thin sprinkle of ore/berry even off the "right" terrain so they're not
  // strictly gated, keeping clusters but allowing surprises.
  if (scatter > 0.93) return elevation >= moisture ? TILE.ORE : TILE.BERRY;

  // --- Forest: patches where moisture is moderately high.
  if (moisture > 0.6 - 0.03 * outward) return TILE.FOREST;

  // --- Default canvas.
  return TILE.GRASS;
}

// Build a fresh tile instance: the live grid stores a flat object spreading the
// type def so callers read buildable/walkable/clickYield without a lookup.
function makeTile(col, row, type) {
  return { col, row, type, ...getTileType(type) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Read a tile instance from the live map (null if not generated).
export function tileAt(col, row) {
  return state.map.tiles.get(tileKey(col, row)) ?? null;
}

// Generate the map for `seed`, revealing the central size×size block.
// Mutates and returns state.map. Same seed => identical map.
export function generateMap(seed, size) {
  const rng = makeRng(seed);

  const tiles = new Map();
  const revealed = new Set();

  // Generate a generous square of tiles around center [-GEN_RADIUS..+GEN_RADIUS].
  for (let row = -GEN_RADIUS; row <= GEN_RADIUS; row++) {
    for (let col = -GEN_RADIUS; col <= GEN_RADIUS; col++) {
      const type = rollTileType(col, row, rng);
      tiles.set(tileKey(col, row), makeTile(col, row, type));
    }
  }

  // Castle sits on the exact center tile. The center for an even size lands
  // between tiles; we keep (0,0) as the castle and reveal a block centered on
  // it (biased so it stays symmetric for odd sizes, top-left-biased for even).
  const castle = { col: 0, row: 0 };

  // Normalize the castle tile (and ensure it exists) to grasslands so the
  // castle always sits on buildable/walkable ground.
  tiles.set(tileKey(castle.col, castle.row), makeTile(castle.col, castle.row, TILE.GRASS));

  // Reveal the central size×size block centered on the castle.
  const half = Math.floor(size / 2);
  const minCol = castle.col - half;
  const minRow = castle.row - half;
  const maxCol = minCol + size - 1;
  const maxRow = minRow + size - 1;
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const key = tileKey(col, row);
      // Ensure a tile exists even if the reveal block somehow exceeds the
      // generated radius (it won't for sane sizes, but be defensive).
      if (!tiles.has(key)) tiles.set(key, makeTile(col, row, rollTileType(col, row, rng)));
      revealed.add(key);
    }
  }

  state.map.size = size;
  state.map.seed = String(seed);
  state.map.tiles = tiles;
  state.map.revealed = revealed;
  state.map.castle = castle;
  state.map.bounds = { minCol, maxCol, minRow, maxRow };

  // Keep the run's revealed counter in sync if a run is active.
  if (state.run) state.run.revealedCount = revealed.size;

  return state.map;
}
