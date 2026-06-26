// ============================================================================
// units/upkeep.js — food upkeep + desertion at round payout. PURE LOGIC.
//
// No three, no DOM. Imports only Wave-1/Stage-0 merged files (state). Runs at
// round end via run.registerSystems({ applyUpkeep }) (called inside clearRound).
//
// Rule (prompt.md "Units & Combat"): every living unit eats `def.foodCost` each
// round. If stored food can't cover the total, units DESERT lowest-tier-first
// until the books balance, then food is deducted (clamped at >= 0).
//
// We can't import the cards catalog (cross-Wave-2 decoupling), so unit "tier"
// is proxied by `def.foodCost`: cheaper units are lower-tier and desert first
// (militia foodCost 1 < spearman/archer foodCost 2). Ties break on creation
// order (later-created units desert first) so desertion is deterministic.
// ============================================================================

import { state, addResource } from "../state.js";
import { registerSystems } from "../run.js";

// Per-unit upkeep cost, defaulting to 1 when a def omits foodCost.
function foodCostOf(unit) {
  const c = unit?.def?.foodCost;
  return Number.isFinite(c) ? c : 1;
}

// Sum upkeep over the living units.
function totalUpkeep(units) {
  let total = 0;
  for (const u of units) {
    if (u && u.hp > 0) total += foodCostOf(u);
  }
  return total;
}

// applyUpkeep() — deduct food for all living units; desert lowest-tier-first
// (foodCost proxy) until the remaining army's upkeep fits the stored food.
export function applyUpkeep() {
  const food = state.resources?.food ?? 0;

  // Living units, ordered for desertion: lowest foodCost (lowest tier) first;
  // among equals, most-recently-created first (later index in state.units).
  const living = state.units
    .map((u, idx) => ({ u, idx }))
    .filter((e) => e.u && e.u.hp > 0)
    .sort((a, b) => {
      const fa = foodCostOf(a.u);
      const fb = foodCostOf(b.u);
      if (fa !== fb) return fa - fb; // cheaper / lower tier first
      return b.idx - a.idx; // tie: most-recent first
    });

  // Desert from the front of the ordered list until upkeep is affordable.
  let total = totalUpkeep(state.units);
  const deserters = new Set();
  for (const { u } of living) {
    if (total <= food) break;
    deserters.add(u);
    total -= foodCostOf(u);
  }

  if (deserters.size > 0) {
    for (let i = state.units.length - 1; i >= 0; i--) {
      if (deserters.has(state.units[i])) state.units.splice(i, 1);
    }
  }

  // Deduct the surviving army's upkeep, clamped so food never goes negative.
  const finalUpkeep = totalUpkeep(state.units);
  const deduct = Math.min(finalUpkeep, state.resources?.food ?? 0);
  if (deduct > 0) addResource("food", -deduct);

  return { upkeep: finalUpkeep, deserted: deserters.size, deducted: deduct };
}

export function initUpkeep() {
  registerSystems({ applyUpkeep });
}
