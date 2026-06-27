// ============================================================================
// world/expand.js — fog-of-war reveal + expansion cost scaling. PURE LOGIC.
//
// No three, no DOM. Imports only ../util/*, ../state.js, ./tiles.js, ./generate.js.
// Node-runnable.
//
// Fog tiles 4-adjacent to a revealed tile may be purchased with gold to reveal
// them. Cost scales with how much you've already revealed, so each tile is a
// little pricier than the last. A newly revealed tile's type is rolled from the
// SAME biome weighting as initial generation (rollTileType), so revealing toward
// a known resource cluster is a deliberate push.
// ============================================================================

import { N4, tileKey, parseTileKey, chebyshev } from "../util/math.js";
import { makeRng } from "../util/rng.js";
import { state, spend, emit } from "../state.js";
import { getTileType } from "./tiles.js";
import { rollTileType } from "./generate.js";

// Gold per tile of distance from the starting castle. The expansion cost is a
// LINEAR function of how far the target tile sits from the castle, so nearby
// frontier stays cheap no matter how much you've already revealed, and pushing
// out toward a distant gem vein costs proportionally more.
export const EXPAND_GOLD_PER_TILE = 2;

// Cost (in gold) to reveal a SPECIFIC fog tile, scaled by its Chebyshev (king-
// move) distance from the player's starting castle. The castle always sits at the
// grid origin (0,0); `castle` defaults to the live run's castle, falling back to
// the origin so callers/tests can omit it. Distance — not how many tiles you've
// bought — drives the price, so expansion no longer balloons with map size.
export function tileExpansionCost(col, row, castle = state.map?.castle) {
  const cc = castle || { col: 0, row: 0 };
  const dist = chebyshev({ col, row }, cc);
  return Math.ceil(EXPAND_GOLD_PER_TILE * dist);
}

// Is a tile currently revealed?
function isRevealed(col, row) {
  return state.map.revealed.has(tileKey(col, row));
}

// All fog tiles (not yet revealed) that are 4-adjacent to a revealed tile, each
// annotated with its OWN expansion cost (cost grows with the tile's distance
// from the castle, so a frontier tile far out costs more than one near home).
export function frontier() {
  const seen = new Set();
  const out = [];
  for (const key of state.map.revealed) {
    const { col, row } = parseTileKey(key);
    for (const { dc, dr } of N4) {
      const c = col + dc;
      const r = row + dr;
      const k = tileKey(c, r);
      if (state.map.revealed.has(k)) continue; // already revealed
      if (seen.has(k)) continue; // dedupe frontier tile reachable from many
      seen.add(k);
      out.push({ col: c, row: r, cost: tileExpansionCost(c, r) });
    }
  }
  return out;
}

// Is (col,row) a fog tile on the frontier AND affordable in gold right now?
export function canExpandTo(col, row) {
  const key = tileKey(col, row);
  if (state.map.revealed.has(key)) return false; // already revealed
  // Must be 4-adjacent to at least one revealed tile.
  let adjacent = false;
  for (const { dc, dr } of N4) {
    if (state.map.revealed.has(tileKey(col + dc, row + dr))) {
      adjacent = true;
      break;
    }
  }
  if (!adjacent) return false;
  return (state.resources.gold || 0) >= tileExpansionCost(col, row);
}

// Purchase and reveal a frontier tile. Spends gold, rolls/ensures the tile type,
// adds it to tiles + revealed, updates bounds and run.revealedCount, and emits
// 'tile-revealed'. Returns true on success, false if invalid/unaffordable.
export function expandTo(col, row) {
  if (!canExpandTo(col, row)) return false;

  const cost = tileExpansionCost(col, row);
  if (!spend({ gold: cost })) return false; // unaffordable (race-safe no-op)

  const key = tileKey(col, row);

  // Reuse the pre-generated tile if it exists (keeps the world consistent with
  // initial gen); otherwise roll a fresh type from the same biome weighting.
  let tile = state.map.tiles.get(key);
  if (!tile) {
    const rng = makeRng(state.map.seed);
    const type = rollTileType(col, row, rng);
    tile = { col, row, type, ...getTileType(type) };
    state.map.tiles.set(key, tile);
  }

  state.map.revealed.add(key);

  // Grow revealed bounds.
  const b = state.map.bounds;
  if (col < b.minCol) b.minCol = col;
  if (col > b.maxCol) b.maxCol = col;
  if (row < b.minRow) b.minRow = row;
  if (row > b.maxRow) b.maxRow = row;

  if (state.run) state.run.revealedCount = state.map.revealed.size;

  emit("tile-revealed", { col, row });
  return true;
}
