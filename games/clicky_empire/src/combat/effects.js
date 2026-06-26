// ============================================================================
// combat/effects.js — area damage, heals, and buffs. PURE LOGIC (no three/DOM).
//
// These back the Action cards / tower abilities (volley, ballista line, rally,
// cathedral aura, etc.) and any radial AOE. All distance maths use distXZ from
// util/math.js against an entity's planar `pos:{x,y,z}`.
//
// See CONTRACTS §9 / §13.
// ============================================================================

import { state } from "../state.js";
import { distXZ } from "../util/math.js";
import { applyDamage } from "./damage.js";

// Damage every live enemy whose center lies within `radius` of `center` (XZ
// plane). `center` is {x,z} (y ignored). Optional `filter(enemy) -> boolean`
// narrows the targets (e.g. only fast enemies). Returns the number of enemies
// hit (a kill still counts as a hit).
export function areaDamage(center, radius, amount, filter) {
  if (!center || !Array.isArray(state.enemies)) return 0;
  const cx = center.x ?? 0;
  const cz = center.z ?? 0;
  const c = { x: cx, z: cz };
  const r = Number.isFinite(radius) ? radius : 0;

  let hitCount = 0;
  // Snapshot: applyDamage emits enemy-killed; a listener that splices
  // state.enemies mid-iteration would otherwise corrupt the loop.
  for (const enemy of [...state.enemies]) {
    if (!enemy || !enemy.pos) continue;
    if (typeof filter === "function" && !filter(enemy)) continue;
    if (distXZ(c, enemy.pos) <= r) {
      applyDamage(enemy, amount, { source: "area" });
      hitCount++;
    }
  }
  return hitCount;
}

// Heal a target by `amt`, never exceeding maxHp (when known). Restoring a downed
// (hp<=0) entity is intentionally NOT supported here — revives are a separate
// concern. Returns the actual amount healed.
export function heal(target, amt) {
  if (!target || typeof target.hp !== "number") return 0;
  if (target.hp <= 0) return 0;
  const add = Number.isFinite(amt) ? Math.max(0, amt) : 0;
  const before = target.hp;
  const cap = Number.isFinite(target.maxHp) ? target.maxHp : Infinity;
  target.hp = Math.min(cap, before + add);
  return target.hp - before;
}

// Attach a timed buff to a target. Buffs are stored on `target.buffs[]` (created
// lazily) for behavior/render systems to read and tick down; this module only
// records them — it does not own a per-frame ticker. Returns the stored buff.
//   buff: { id?, stat?, mult?, add?, duration?, ... }  (declarative descriptor)
export function applyBuff(target, buff) {
  if (!target || !buff) return null;
  if (!Array.isArray(target.buffs)) target.buffs = [];
  const stored = { ...buff };
  target.buffs.push(stored);
  return stored;
}
