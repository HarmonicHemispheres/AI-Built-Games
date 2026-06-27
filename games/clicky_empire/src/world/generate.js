// ============================================================================
// world/generate.js — seeded procedural map generation. PURE LOGIC.
//
// No three, no DOM. Imports only from ../util/* , ../state.js , ./tiles.js .
// Node-runnable.
//
// Goal: a map that reads like a real-world landscape rather than scattered
// biome blobs — winding rivers with bends, mountain ranges, forest stands, and
// fertile farmland (berry patches) along the riverbanks, with open grass plains
// (fields) filling the rest.
//
// Everything is derived deterministically from the run seed, and — critically —
// `rollTileType(col,row,rng)` is a PURE function of (col,row,seed): it never
// consumes a mutable stream, so it returns the same type no matter what order
// tiles are queried. That property is what lets fog expansion (expand.js) roll
// newly-revealed tiles with the exact same world.
//
// How each feature is produced:
//   - Rivers: the level-set (contour) of a domain-warped value-noise field. The
//     domain warp bends the contour into natural meanders; normalizing the
//     contour distance by the local gradient keeps the river a roughly constant
//     width instead of ballooning into lakes on flat ground. Disconnected
//     contour loops read as tributaries/streams.
//   - Mountains: high cores of an elevation field — the fractal noise links them
//     into ridge-like ranges. A river is allowed to cut through (a gorge / pass).
//   - Lakes: rare standing water where it's very wet and very low.
//   - Farmland (berry): clusters on the fertile banks just outside a river and
//     in lush lowland — i.e. floodplains.
//   - Forest: stands where moisture is moderately high.
//   - Fields: the default open grass plains.
// ============================================================================

import { tileKey, clamp01 } from "../util/math.js";
import { makeRng } from "../util/rng.js";
import { state } from "../state.js";
import { TILE, getTileType } from "./tiles.js";

// How far the generated (but possibly still fogged) world extends from center.
// Generous enough to expand into for a long run, and to host the larger starting
// maps (up to 12×12) plus their immediate frontier. Square [-GEN..+GEN].
const GEN_RADIUS = 16;

// Coarse cell size (in tiles) for the value-noise lattice. Larger => smoother,
// bigger landforms.
const NOISE_CELL = 4;

// River tuning. RIVER_LEVEL is the contour we trace; RIVER_HALF_WIDTH is the
// half-width in tiles (after gradient normalization), so ~1.2-tile rivers. The
// river field is deliberately LOW frequency (RIVER_CELL) so the contour crosses
// the map only a few times — a handful of long, winding rivers, not a flood.
const RIVER_LEVEL = 0.5;
const RIVER_HALF_WIDTH = 0.62;
const RIVER_WARP = 6; // how far the domain warp bends the river (tiles)
const RIVER_CELL = NOISE_CELL * 3; // low-frequency lattice => few, major rivers

// ---------------------------------------------------------------------------
// Value noise
// ---------------------------------------------------------------------------

// Deterministic hash of a lattice point -> float in [0,1). The `salt` gives each
// noise field its own independent stream off the run seed.
//
// Memoized: neighbouring tiles and the river's gradient sampling hit the same
// lattice points repeatedly, and the value is a pure function of its key, so the
// cache is just a speedup — it never changes a result. The key includes the
// seed, so different seeds never collide.
const _latticeCache = new Map();
function latticeValue(rng, salt, gx, gy) {
  const key = `${rng.seed}:${salt}:${gx},${gy}`;
  let v = _latticeCache.get(key);
  if (v === undefined) {
    // Fold the coords + salt into a single string seed; makeRng hashes it.
    v = makeRng(key).next();
    _latticeCache.set(key, v);
  }
  return v;
}

const smooth = (t) => t * t * (3 - 2 * t); // smoothstep for nicer interpolation

// One octave of bilinearly-interpolated value noise at (col,row). col/row may be
// fractional (the river field samples warped, non-integer coordinates).
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
// Rivers — domain-warped contour of a smooth field
// ---------------------------------------------------------------------------

// The river field at (col,row), with the input coordinates domain-warped by a
// very low-frequency noise so the traced contour meanders into natural bends.
// The field itself is smooth (two low-frequency octaves) so it crosses the
// RIVER_LEVEL contour only a few times across the map. Pure in (col,row,seed).
function riverField(rng, col, row) {
  const wcell = NOISE_CELL * 4;
  const wx = (octave(rng, "rwarpx", col, row, wcell) - 0.5) * 2 * RIVER_WARP;
  const wy = (octave(rng, "rwarpy", col, row, wcell) - 0.5) * 2 * RIVER_WARP;
  const cx = col + wx;
  const cy = row + wy;
  const a = octave(rng, "river", cx, cy, RIVER_CELL);
  const b = octave(rng, "river#2", cx, cy, RIVER_CELL / 2);
  return clamp01(a * 0.72 + b * 0.28);
}

// Approximate distance (in tiles) from (col,row) to the RIVER_LEVEL contour of
// the river field, normalized by the local gradient so the river keeps a roughly
// constant width instead of flooding flat regions. Smaller => closer to water.
function riverDistance(rng, col, row) {
  const f = riverField(rng, col, row);
  // Central differences give the gradient magnitude (per tile).
  const dfdx = (riverField(rng, col + 1, row) - riverField(rng, col - 1, row)) * 0.5;
  const dfdy = (riverField(rng, col, row + 1) - riverField(rng, col, row - 1)) * 0.5;
  const grad = Math.hypot(dfdx, dfdy) + 1e-4;
  return Math.abs(f - RIVER_LEVEL) / grad;
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
  // Independent scatter field for the rarer resource tiles.
  const scatter = fractalNoise(rng, "scatter", col, row);
  const riverDist = riverDistance(rng, col, row);

  // --- Rivers: the gradient-normalized contour. Cuts through everything (incl.
  // a mountain range, forming a gorge/pass), so check it first. The riverbank is
  // the band just outside it — used below to seed fertile farmland.
  if (riverDist < RIVER_HALF_WIDTH) return TILE.WATER;
  const onRiverbank = riverDist < RIVER_HALF_WIDTH + 1.4;

  // --- Lakes: rare standing water where it's very wet and very low.
  if (moisture > 0.82 - 0.03 * outward && elevation < 0.3) return TILE.WATER;

  // --- Mountains: high elevation cores; the fractal links them into ranges. The
  // threshold eases slightly outward so ridges reach toward the frontier.
  if (elevation > 0.72 - 0.05 * outward) return TILE.MOUNTAIN;

  // --- Ore veins: scatter rolls in the rocky foothills near the ranges. A small
  // frontier richness bonus. Rare even where the terrain is right.
  const oreThresh = 0.84 - 0.06 * outward;
  if (elevation > 0.58 && scatter > oreThresh) return TILE.ORE;

  // --- Farmland (berry patches): fertile floodplains. Strongly favoured on the
  // riverbank, otherwise a sparser sprinkle in lush lowland. This is what makes
  // the land near rivers read as cultivated fields without paving everything.
  if (onRiverbank && moisture > 0.5 && scatter > 0.62) return TILE.BERRY;
  const berryThresh = 0.88 - 0.05 * outward;
  if (moisture > 0.55 && elevation < 0.5 && scatter > berryThresh) return TILE.BERRY;

  // --- Forest: stands where moisture is moderately high (and not waterlogged
  // flat which became lake). Patches, not a blanket.
  if (moisture > 0.58 - 0.03 * outward) return TILE.FOREST;

  // --- Default: open grass plains (fields).
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

// Force a small buildable clearing of grass around the castle so the run always
// starts on fair, workable ground even when a river or ridge runs nearby. Radius
// 1 (a 3×3 block) keeps the castle's neighbours walkable/buildable; the broader
// landscape (rivers, ranges) is left intact just outside it.
function carveCastleClearing(tiles, castle, radius = 1) {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const col = castle.col + dc;
      const row = castle.row + dr;
      tiles.set(tileKey(col, row), makeTile(col, row, TILE.GRASS));
    }
  }
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

  // Castle sits on the exact center tile (0,0). Normalize a small clearing around
  // it to grasslands so the castle always sits on buildable/walkable ground.
  const castle = { col: 0, row: 0 };
  carveCastleClearing(tiles, castle, 1);

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
  // Remember the size of the opening reveal so expansion cost scales with tiles
  // bought AFTERWARD (not with the whole starting block — that made the first
  // reveal absurdly expensive on larger starts).
  state.map.baseRevealed = revealed.size;

  // Keep the run's revealed counter in sync if a run is active.
  if (state.run) state.run.revealedCount = revealed.size;

  return state.map;
}
