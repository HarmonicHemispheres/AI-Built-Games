// ============================================================================
// buildings/defense.js — auto-firing towers + central building-death handling.
// PURE LOGIC: no three, no DOM, no fx import. Node-runnable.
//
// Towers don't draw their own bolts; they emit a `combat-hit` event and the
// integrator wires `on('combat-hit', …) -> fx.floatingNumber` (CONTRACTS §14
// "Cross-module decoupling"), keeping this file pure and node-testable.
//
// Responsibilities:
//   - updateDefense(dt): for each kind:'defense' building, tick its cooldown;
//     when ready, find the nearest enemy within attack.range, applyDamage,
//     reset cd by 1/attackSpeed, and emit 'combat-hit'.
//   - Central building death: any building with hp<=0 is removed from
//     state.placed; if it is the castle, set state.run.castleDown = true
//     (run.js then triggers game over).
//   - initDefense() -> registerSystems({ updateCombat: updateDefense }).
// ============================================================================

import { state } from "../state.js";
import { emit } from "../util/events.js";
import { registerSystems } from "../run.js";
import { distXZ } from "../util/math.js";
import { applyDamage } from "../combat/damage.js";
import { getBuildingDef } from "./catalog.js";

// Find the nearest living enemy within `range` (world XZ distance) of `pos`.
// Returns the enemy instance or null. Enemies with hp<=0 are skipped (a stale
// corpse this frame shouldn't soak a shot).
function nearestEnemyInRange(pos, range) {
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (!e || (e.hp != null && e.hp <= 0)) continue;
    const ep = e.pos;
    if (!ep) continue;
    const d = distXZ(pos, ep);
    if (d <= range && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

// updateDefense(dt) — auto-fire towers + sweep building deaths.
// dt is seconds (already speed-scaled by the run machine).
export function updateDefense(dt) {
  const d = Number.isFinite(dt) && dt > 0 ? dt : 0;

  for (const b of state.placed) {
    const def = getBuildingDef(b.defId);
    // Any building with an `attack` auto-fires — defense towers AND the castle
    // (its wall archers). Dead buildings (swept below) don't get a parting shot.
    if (!def || !def.attack) continue;
    if (b.hp != null && b.hp <= 0) continue;

    // Cooldown counts DOWN; ready to fire at <= 0.
    if (b.cd > 0) b.cd -= d;
    if (b.cd > 0) continue;

    const target = nearestEnemyInRange(b.pos, def.attack.range);
    if (!target) {
      // No target: stay "ready" (don't bank negative cd into a burst later).
      b.cd = 0;
      continue;
    }

    applyDamage(target, def.attack.damage, { source: b });
    // Reset cooldown by the inverse of attacks-per-second.
    const aps = def.attack.attackSpeed || 1;
    b.cd = 1 / aps;

    // Arrow visual: integrator wires 'projectile-fire' -> fx.shootArrow. Pure
    // (no three/fx here) — the bolt flies from the building to the target.
    if (b.pos) {
      emit("projectile-fire", {
        from: { x: b.pos.x, y: 0.7, z: b.pos.z },
        to: { x: target.pos.x, y: 0.45, z: target.pos.z },
      });
    }
    // Hitscan damage-number hook (integrator -> fx.floatingNumber).
    emit("combat-hit", {
      x: target.pos.x,
      z: target.pos.z,
      amount: def.attack.damage,
      crit: false,
    });
  }

  // --- Central building death --------------------------------------------
  // Sweep AFTER firing so a tower can fire on the same frame it dies elsewhere
  // is irrelevant (it's already removed), but a freshly-killed enemy stays in
  // state.enemies for the enemy system to clean up.
  sweepDeadBuildings();
}

// Remove dead buildings (hp<=0) from state.placed. If the castle dies, raise the
// run's castleDown flag (run.js triggers game over; keep reprieve is v2).
function sweepDeadBuildings() {
  const placed = state.placed;
  for (let i = placed.length - 1; i >= 0; i--) {
    const b = placed[i];
    if (b.hp != null && b.hp <= 0) {
      const def = getBuildingDef(b.defId);
      placed.splice(i, 1);
      if ((def && def.kind === "castle") || b.defId === "castle") {
        if (state.run) state.run.castleDown = true;
      }
    }
  }
}

// initDefense() — register as the combat updater. Note we register under
// `updateCombat` (CONTRACTS §7/§14): run.js calls it during the attack phase.
export function initDefense() {
  registerSystems({ updateCombat: updateDefense });
}
