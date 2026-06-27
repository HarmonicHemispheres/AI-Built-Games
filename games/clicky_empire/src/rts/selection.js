// ============================================================================
// rts/selection.js — RTS selection state. PURE LOGIC (no three/DOM).
//
// Owns the player's current unit selection. The single writer of
// `state.selection` (an array of unit ids). Every mutation re-emits
// `unit-selected {ids}` so HUD/selected-unit-panel can react.
//
// World-space box-select lives here (not in input.js) so selection stays pure
// and node-testable: input.js computes a world-space rect via `pickGround` at
// the drag corners and hands it to `boxSelect(worldRect)`. (CONTRACTS §14
// "Cross-module decoupling" — selection.boxSelect takes a world rect.)
//
// A worldRect is { minX, maxX, minZ, maxZ }. A unit is "inside" when its
// `pos.{x,z}` falls within those bounds (inclusive).
// ============================================================================

import { state, emit } from "../state.js";

// Normalize an id list to a clean array of present unit ids (de-duped, only
// ids that actually exist in state.units). Keeps selection from holding stale
// or duplicate ids.
function validIds(ids) {
  const want = new Set(ids ?? []);
  const out = [];
  const seen = new Set();
  for (const u of state.units) {
    if (want.has(u.id) && !seen.has(u.id)) {
      seen.add(u.id);
      out.push(u.id);
    }
  }
  return out;
}

function commit(ids) {
  // Replace selection contents in place (state.selection identity is stable —
  // we never reassign a top-level state field, only mutate the array).
  state.selection.length = 0;
  for (const id of ids) state.selection.push(id);
  emit("unit-selected", { ids: [...state.selection] });
  return state.selection;
}

// Replace the selection with exactly these unit ids.
export function select(ids) {
  return commit(validIds(ids));
}

// Add the given unit ids to the current selection (shift-click / additive box).
export function addToSelection(ids) {
  const merged = [...state.selection, ...(ids ?? [])];
  return commit(validIds(merged));
}

// Clear the selection entirely.
export function clearSelection() {
  return commit([]);
}

// Select every unit whose world position falls inside the given world-space
// rect. worldRect = { minX, maxX, minZ, maxZ } (order-insensitive — we
// normalize min/max defensively in case a caller passes raw drag corners).
// opts.additive (shift-drag) merges the box hits into the current selection
// instead of replacing it.
export function boxSelect(worldRect, opts = {}) {
  if (!worldRect) return opts.additive ? state.selection : clearSelection();
  const minX = Math.min(worldRect.minX, worldRect.maxX);
  const maxX = Math.max(worldRect.minX, worldRect.maxX);
  const minZ = Math.min(worldRect.minZ, worldRect.maxZ);
  const maxZ = Math.max(worldRect.minZ, worldRect.maxZ);

  const hit = [];
  for (const u of state.units) {
    const p = u.pos;
    if (!p) continue;
    if (p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ) {
      hit.push(u.id);
    }
  }
  return commit(opts.additive ? validIds([...state.selection, ...hit]) : hit);
}
