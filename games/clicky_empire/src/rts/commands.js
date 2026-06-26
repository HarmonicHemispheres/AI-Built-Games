// ============================================================================
// rts/commands.js — issue orders to selected units. PURE LOGIC (no three/DOM).
//
// W2-RTS only ever SETS `unit.order` (and selection, via selection.js); it
// never moves units directly. W2-Units' `updateUnits(dt)` reads `unit.order`,
// executes it (pathing/attack), and clears it on completion. (CONTRACTS §14
// "Unit / order protocol".)
//
// Order shapes (the locked protocol):
//   { type:'move',       tile:{col,row} }
//   { type:'attack',     targetId }
//   { type:'attackMove', tile:{col,row} }
//   { type:'stop' }
//
// Each command applies to the given unit ids (typically `state.selection`).
// Ids that don't resolve to a live unit are skipped silently.
// ============================================================================

import { state } from "../state.js";

// Resolve an id list to the live unit instances in state.units.
function unitsFor(ids) {
  if (!ids || ids.length === 0) return [];
  const want = new Set(ids);
  return state.units.filter((u) => want.has(u.id));
}

// Assign the same order object reference's *shape* to each unit. We build a
// fresh order per unit so unit-side mutation (e.g. clearing on completion)
// can't bleed across units.
function setOrder(ids, make) {
  const units = unitsFor(ids);
  for (const u of units) u.order = make();
  return units;
}

// Move the selected units to a tile.
export function move(ids, tile) {
  return setOrder(ids, () => ({ type: "move", tile }));
}

// Order the selected units to attack a specific target (unit/enemy/building id).
export function attack(ids, targetId) {
  return setOrder(ids, () => ({ type: "attack", targetId }));
}

// Attack-move toward a tile: advance to the tile but engage anything en route.
export function attackMove(ids, tile) {
  return setOrder(ids, () => ({ type: "attackMove", tile }));
}

// Halt the selected units (cancel current order, hold position).
export function stop(ids) {
  return setOrder(ids, () => ({ type: "stop" }));
}
