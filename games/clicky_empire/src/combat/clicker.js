// ============================================================================
// combat/clicker.js — resolve a single player click. PURE LOGIC (no three/DOM).
//
// The cursor is both a weapon and a tool:
//   - clicking a TILE  -> roll harvestChance; on success add the tile's resource
//                         (scaled by harvestYield) and return { type:'harvest' }.
//   - clicking an ENEMY-> roll attackChance; miss -> { type:'miss' }; on a hit
//                         roll critChance (×3 damage) and applyDamage, returning
//                         { type:'attack' } or { type:'crit' }.
//
// This module does NOT enforce clickCooldown — the input/HUD caller does that
// (CONTRACTS §9/§13). Rolls use Math.random(): clicks are real-time player input,
// not part of the seeded, reproducible map/world logic.
//
// playerStats shape (state.playerStats / BASE_STATS):
//   { attackChance, attackDamage, critChance, harvestChance, harvestYield, clickCooldown }
// ============================================================================

import { state, addResource } from "../state.js";
import { applyDamage } from "./damage.js";

// Injectable RNG for deterministic tests (defaults to Math.random).
let _rng = Math.random;
export function _setRng(fn) {
  _rng = typeof fn === "function" ? fn : Math.random;
}

const chance = (p) => _rng() < (Number.isFinite(p) ? p : 0);

// Is this click target a resource tile (vs a combat entity)?
// A tile instance carries a `type` string and a `clickYield` field
// (see world/tiles.js). Combat entities carry `hp`/`def` instead.
function isTile(target) {
  return !!target && typeof target.type === "string" && "clickYield" in target;
}

// Pick the concrete { resource, amount } from a tile's clickYield, which may be
// null, a single { resource, amount, chance? }, or a weighted array of options.
function pickYield(clickYield) {
  if (!clickYield) return null;
  if (Array.isArray(clickYield)) {
    if (clickYield.length === 0) return null;
    const total = clickYield.reduce((s, o) => s + (o.weight ?? o.chance ?? 1), 0);
    let r = _rng() * (total > 0 ? total : clickYield.length);
    for (const opt of clickYield) {
      r -= opt.weight ?? opt.chance ?? 1;
      if (r <= 0) return opt;
    }
    return clickYield[clickYield.length - 1];
  }
  return clickYield;
}

// Resolve a player click against `target` using `playerStats` (defaults to
// state.playerStats). Returns { type, amount, killed? }.
export function resolveClick(target, playerStats = state.playerStats) {
  const stats = playerStats || state.playerStats;

  // --- Resource tile: harvest ---
  if (isTile(target)) {
    if (!chance(stats.harvestChance)) {
      return { type: "miss", amount: 0 };
    }
    const yld = pickYield(target.clickYield);
    if (!yld || !yld.resource) {
      // Buildable-but-yieldless tile (e.g. grasslands): a "successful" harvest
      // that produced nothing. Still a harvest action, zero gained.
      return { type: "harvest", amount: 0 };
    }
    const base = Number.isFinite(yld.amount) ? yld.amount : 1;
    const yieldMult = Number.isFinite(stats.harvestYield) ? stats.harvestYield : 1;
    const amount = base * yieldMult;
    addResource(yld.resource, amount);
    return { type: "harvest", amount, resource: yld.resource };
  }

  // --- Combat entity: attack ---
  if (target && typeof target.hp === "number") {
    if (!chance(stats.attackChance)) {
      return { type: "miss", amount: 0 };
    }
    const crit = chance(stats.critChance);
    const baseDmg = Number.isFinite(stats.attackDamage) ? stats.attackDamage : 1;
    const amount = crit ? baseDmg * 3 : baseDmg;
    const { killed } = applyDamage(target, amount, { crit, source: "click" });
    return { type: crit ? "crit" : "attack", amount, killed };
  }

  // Unknown / non-interactable target.
  return { type: "miss", amount: 0 };
}
