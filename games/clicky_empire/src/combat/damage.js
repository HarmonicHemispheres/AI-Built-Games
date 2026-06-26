// ============================================================================
// combat/damage.js — hit resolution. PURE LOGIC (no three, no DOM; node-safe).
//
// Combat decrements `target.hp`, clamps it at 0, and reports `killed` when hp
// reaches 0. Enemy deaths emit `enemy-killed` so the rest of the game (kill
// counters, rewards, fx, audio) can react. Figure-toppling is a RENDER reaction
// to the hp change — it does not live here.
//
// Runtime instance shape (CONTRACTS §10): { id, hp, maxHp, pos:{x,y,z}, def }.
// We guard for missing fields so partially-built instances never throw.
//
// See CONTRACTS §9 / §13.
// ============================================================================

import { state, emit } from "../state.js";

// True when `target` is one of the live enemy instances. Membership in
// state.enemies is the authoritative signal (an instance may not yet carry a
// `group`, and `def` is shared with units). Falls back to the `enemyId` marker
// for detached test fixtures.
function isEnemy(target) {
  if (!target) return false;
  if (Array.isArray(state.enemies) && state.enemies.includes(target)) return true;
  return typeof target.enemyId === "string";
}

// Apply a flat `amount` of damage to a target instance.
//   opts: { crit?:boolean, source?:instance }  (informational; carried in events)
// Returns { dealt, killed }.
//   - `dealt`  = hp actually removed (never more than the target had).
//   - `killed` = true if this hit brought hp to <= 0 (and it was alive before).
export function applyDamage(target, amount, opts = {}) {
  if (!target || typeof target.hp !== "number") return { dealt: 0, killed: false };

  // Tolerate floats; reject NaN/Infinity/negatives by clamping to 0.
  const safeDmg = Number.isFinite(amount) ? Math.max(0, amount) : 0;

  const before = target.hp;
  if (before <= 0) {
    // Already dead — nothing to remove, no second death event.
    return { dealt: 0, killed: false };
  }

  const after = Math.max(0, before - safeDmg);
  target.hp = after;
  const dealt = before - after;
  const killed = after <= 0;

  if (killed && isEnemy(target)) {
    emit("enemy-killed", { enemy: target });
  }

  return { dealt, killed };
}

// Resolve an attacker→target hit using the attacker's definition damage.
// `attacker` is a runtime instance carrying `def` (unit/enemy/building def) with
// a numeric `damage`. Crit is not a per-unit stat (it is a clicker stat handled
// in clicker.js), so unit/tower hits never crit here — `crit` is always false.
// Returns { dealt, killed, crit }.
export function resolveHit(attacker, target) {
  const amount = attacker?.def?.damage ?? 0;
  const crit = false;
  const { dealt, killed } = applyDamage(target, amount, { crit, source: attacker });
  return { dealt, killed, crit };
}
