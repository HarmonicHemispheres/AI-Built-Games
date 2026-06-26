// ============================================================================
// enemies/behavior.js — enemy spawn constructor + per-tick AI. PURE LOGIC.
//
// No three, no DOM. Imports only Wave-1/Stage-0 merged files + own siblings.
// Node-runnable. (Enemy MESH rendering lives in units/group.js, NOT here — we
// only build logic instances with group:null; render attaches the group later.)
//
// Behaviour (CONTRACTS §14 "W2-Enemies", prompt.md "Enemies", "Gameloop"):
//   - Each enemy paths toward the castle (state.map.castle) via findPath, stepping
//     pos at def.speed (tiles/sec).
//   - If a building / unit / castle is within def.range, stop and attack it via
//     combat.applyDamage on a cooldown driven by def.attackSpeed (attacks/sec).
//   - SAPPER trait -> prefer the nearest building/wall (state.placed), ignoring
//     units when possible.
//   - RANGED (range > ~2) -> stop at range and fire from distance (don't close in).
//   - Reaching the castle -> attack the castle building (or flag castleDown).
//   - On death (hp<=0): drop def.reward (gold + renown to state.meta), increment
//     state.run.kills, remove from state.enemies. (Mesh disposal is render's job.)
//
// See CONTRACTS §9 (combat), §10 (instance shapes), §14.
// ============================================================================

import { state, nextId, addResource } from "../state.js";
import { emit } from "../util/events.js";
import { getEnemyDef } from "./catalog.js";
import { applyDamage } from "../combat/damage.js";
import { findPath, isWalkable, nearestWalkableToward } from "../world/pathfind.js";
import { tileToWorld, worldToTile, distXZ } from "../util/math.js";

// A range above this counts as "ranged" — the enemy fires from distance instead
// of closing to melee. Skirmisher (range 3.5) is ranged; melee (~0.8-1.0) is not.
const RANGED_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Spawn constructor
// ---------------------------------------------------------------------------

// Build an enemy LOGIC instance at tile (col,row), push to state.enemies, return
// it. Per CONTRACTS §10 the shape is
//   { id, enemyId, def, pos, hp, maxHp, path, target, attackCd, group }
// `group` is null — render (units/group.js) builds and attaches the mesh later.
export function createEnemy(enemyId, col, row) {
  const def = getEnemyDef(enemyId);
  // Defensive: unknown id => no instance (shouldn't happen for v1 ids).
  if (!def) return null;
  const enemy = {
    id: nextId("e"),
    enemyId,
    def,
    pos: tileToWorld(col, row),
    hp: def.hp,
    maxHp: def.hp,
    path: null, // [{col,row}...] cached route toward the castle
    target: null, // current attack target instance (building/unit/castle)
    attackCd: 0, // seconds until the next attack is ready
    group: null, // Three.Object3D set by render reconciler
  };
  state.enemies.push(enemy);
  return enemy;
}

// ---------------------------------------------------------------------------
// Target helpers
// ---------------------------------------------------------------------------

// World position of any instance — prefer its live `pos`, fall back to tile
// coords (buildings carry col/row; §10 says they also carry pos).
function instancePos(inst) {
  if (inst && inst.pos && typeof inst.pos.x === "number") return inst.pos;
  if (inst && typeof inst.col === "number" && typeof inst.row === "number") {
    return tileToWorld(inst.col, inst.row);
  }
  return null;
}

function isAlive(inst) {
  return inst && typeof inst.hp === "number" && inst.hp > 0;
}

// Nearest living instance from a list to the enemy's position (planar XZ).
function nearest(enemy, list) {
  let best = null;
  let bestD = Infinity;
  for (const inst of list) {
    if (!isAlive(inst)) continue;
    const p = instancePos(inst);
    if (!p) continue;
    const d = distXZ(enemy.pos, p);
    if (d < bestD) {
      bestD = d;
      best = inst;
    }
  }
  return best;
}

// Is `inst` the castle building? The castle is the placed building sitting on the
// castle tile (defId 'castle', or located on state.map.castle).
function isCastle(inst) {
  if (!inst) return false;
  if (inst.defId === "castle") return true;
  const c = state.map.castle;
  if (c && typeof inst.col === "number" && inst.col === c.col && inst.row === c.row) {
    return true;
  }
  return false;
}

// Choose what this enemy should be attacking, by trait:
//   - SAPPER: nearest building/wall in state.placed (ignore units when one exists);
//     only fall back to units if there are no living buildings at all.
//   - everyone else: nearest of {buildings, units} combined.
// The castle is just another building in state.placed, so it is included naturally
// (and remains the fallback goal of pathing when nothing else is in the way).
function pickTarget(enemy) {
  const sapper = enemy.def.traits?.includes("SAPPER");
  const buildings = Array.isArray(state.placed) ? state.placed : [];
  const units = Array.isArray(state.units) ? state.units : [];

  if (sapper) {
    const b = nearest(enemy, buildings);
    if (b) return b;
    return nearest(enemy, units); // no structures left — settle for units
  }

  // Non-sapper: pick the closest of all valid hostiles (buildings + units).
  const b = nearest(enemy, buildings);
  const u = nearest(enemy, units);
  if (!b) return u;
  if (!u) return b;
  return distXZ(enemy.pos, instancePos(b)) <= distXZ(enemy.pos, instancePos(u)) ? b : u;
}

// Find the castle building instance, if one is placed.
function castleBuilding() {
  const buildings = Array.isArray(state.placed) ? state.placed : [];
  for (const b of buildings) if (isCastle(b) && isAlive(b)) return b;
  return null;
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

// Step the enemy `dist` world-units along its tile path toward `goalTile`,
// (re)computing the path when needed. Mutates enemy.pos / enemy.path. Returns the
// remaining distance budget unused (0 if it kept moving).
function moveToward(enemy, goalTile, dist) {
  if (dist <= 0) return 0;
  const fromTile = worldToTile(enemy.pos.x, enemy.pos.z);

  // (Re)compute a path if we don't have a usable one. Cache it on the instance so
  // we don't run A* every tick.
  if (!enemy.path || enemy.path.length === 0) {
    enemy.path = findPath(fromTile, goalTile);
  }

  let remaining = dist;
  // Walk the cached waypoints, consuming the movement budget.
  while (remaining > 0 && enemy.path && enemy.path.length > 0) {
    const wp = enemy.path[0];
    const wpPos = tileToWorld(wp.col, wp.row);
    const d = distXZ(enemy.pos, wpPos);
    if (d <= remaining) {
      // Reach this waypoint exactly, then pop it and continue with leftover budget.
      enemy.pos = { x: wpPos.x, y: enemy.pos.y, z: wpPos.z };
      enemy.path.shift();
      remaining -= d;
      // If we've reached our current tile waypoint and it equals our start tile,
      // drop it so we make forward progress next iteration.
      if (enemy.path.length === 0) break;
    } else {
      // Partial step toward the waypoint.
      const t = remaining / d;
      enemy.pos = {
        x: enemy.pos.x + (wpPos.x - enemy.pos.x) * t,
        y: enemy.pos.y,
        z: enemy.pos.z + (wpPos.z - enemy.pos.z) * t,
      };
      remaining = 0;
    }
  }

  // No path (blocked / fog) — take a greedy walkable step toward the goal so the
  // enemy doesn't freeze. Wolves/etc. still grind forward through gaps.
  if (remaining > 0 && (!enemy.path || enemy.path.length === 0)) {
    const here = worldToTile(enemy.pos.x, enemy.pos.z);
    if (here.col === goalTile.col && here.row === goalTile.row) return remaining;
    const step = nearestWalkableToward(here, goalTile);
    if (step.col !== here.col || step.row !== here.row) {
      const sp = tileToWorld(step.col, step.row);
      const d = distXZ(enemy.pos, sp);
      const t = Math.min(1, remaining / (d || 1));
      enemy.pos = {
        x: enemy.pos.x + (sp.x - enemy.pos.x) * t,
        y: enemy.pos.y,
        z: enemy.pos.z + (sp.z - enemy.pos.z) * t,
      };
      remaining = Math.max(0, remaining - d);
      // Force a path recompute next tick now that we've nudged.
      enemy.path = null;
    } else {
      // Truly stuck.
      remaining = 0;
    }
  }

  return remaining;
}

// ---------------------------------------------------------------------------
// Attacking
// ---------------------------------------------------------------------------

// Resolve a single enemy's attack against `target` if its cooldown is ready.
// Drives attackCd by def.attackSpeed (attacks/sec). Emits an optional combat-hit
// for fx wiring. Removes a killed target from its owning list.
function tryAttack(enemy, target, dt) {
  enemy.attackCd -= dt;
  if (enemy.attackCd > 0) return;

  const { dealt, killed } = applyDamage(target, enemy.def.damage, { source: enemy });
  const interval = enemy.def.attackSpeed > 0 ? 1 / enemy.def.attackSpeed : 1;
  enemy.attackCd = interval;

  if (dealt > 0) {
    const p = instancePos(target) || enemy.pos;
    emit("combat-hit", { x: p.x, z: p.z, amount: dealt, crit: false });
  }

  // If the enemy just destroyed a building, mark castle loss / remove it from
  // state.placed. (Defense.js owns building death in the full game, but enemies
  // are the damage source here, so clean up structures we drop so pathing frees.)
  if (killed && target && typeof target.defId === "string") {
    if (isCastle(target)) {
      if (state.run) state.run.castleDown = true;
    }
    const idx = state.placed.indexOf(target);
    if (idx !== -1) state.placed.splice(idx, 1);
    enemy.target = null;
    enemy.path = null; // a removed wall may open a new route
  } else if (killed) {
    // Killed a unit — units/upkeep + render reconciler remove its mesh; we drop
    // it from state.units so it stops being a target. (enemy-killed is only for
    // enemies; unit removal here keeps logic consistent for our targeting.)
    const idx = state.units.indexOf(target);
    if (idx !== -1) state.units.splice(idx, 1);
    enemy.target = null;
  }
}

// ---------------------------------------------------------------------------
// Death / reward
// ---------------------------------------------------------------------------

// Drop an enemy's reward and remove it from state.enemies. Idempotent-ish: only
// acts on instances still present in the list.
function killEnemy(enemy) {
  const idx = state.enemies.indexOf(enemy);
  if (idx === -1) return; // already reaped
  state.enemies.splice(idx, 1);

  const reward = enemy.def.reward || {};
  if (reward.gold) addResource("gold", reward.gold);
  if (reward.renown && state.meta && typeof state.meta.renown === "number") {
    state.meta.renown += reward.renown;
  }
  if (state.run) state.run.kills = (state.run.kills || 0) + 1;
  // Note: combat.applyDamage already emitted `enemy-killed` when hp hit 0.
}

// ---------------------------------------------------------------------------
// Per-tick system
// ---------------------------------------------------------------------------

// dt is in seconds (already scaled by state.speed by run.js).
export function updateEnemies(dt) {
  const castle = state.map.castle;
  // Iterate over a snapshot; we may splice the live list on death.
  const list = [...state.enemies];

  for (const enemy of list) {
    // Reap dead enemies (hp drained by clicks / towers / units this frame).
    if (enemy.hp <= 0) {
      killEnemy(enemy);
      continue;
    }

    const def = enemy.def;
    const ranged = def.range > RANGED_THRESHOLD;

    // --- Pick / validate a target. -----------------------------------------
    if (!isAlive(enemy.target) || !instancePos(enemy.target)) enemy.target = null;
    let target = enemy.target || pickTarget(enemy);

    // Fall back to the castle building (or the castle tile) when nothing else is
    // a candidate, so the enemy always has somewhere to go.
    const cb = castleBuilding();
    if (!target) target = cb;

    enemy.target = target && isAlive(target) ? target : null;

    // --- Decide: attack in range, or move closer. --------------------------
    if (target && isAlive(target)) {
      const tp = instancePos(target);
      const d = tp ? distXZ(enemy.pos, tp) : Infinity;

      if (d <= def.range) {
        // In range — stop and attack (ranged enemies fire from here too).
        tryAttack(enemy, target, dt);
        continue;
      }

      // Out of range: ranged enemies still need to close to within `range`; both
      // melee and ranged path toward the target's tile.
      const goalTile = worldToTile(tp.x, tp.z);
      // Make sure the goal tile is walkable; if the target sits on an unwalkable
      // tile (e.g. a wall building on grass is walkable, but be safe), path to the
      // castle instead.
      const reachable = isWalkable(goalTile.col, goalTile.row)
        ? goalTile
        : castle || goalTile;

      const speedDist = def.speed * dt;
      // If a fresh path is needed (target changed), invalidate the cache.
      moveToward(enemy, reachable, speedDist);
      continue;
    }

    // --- No target at all: march toward the castle tile. -------------------
    if (castle) {
      const here = worldToTile(enemy.pos.x, enemy.pos.z);
      const dCastle = distXZ(enemy.pos, tileToWorld(castle.col, castle.row));
      if (dCastle <= def.range) {
        // Reached the castle's tile with no building present — nothing to hit;
        // flag castle loss defensively (castle should normally be a building).
        if (state.run) state.run.castleDown = true;
        continue;
      }
      void here;
      moveToward(enemy, castle, def.speed * dt);
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Registered by the integrator at Wave-2 wiring. We import run.registerSystems
// lazily-but-statically here (run.js is a Stage-0 merged file).
import { registerSystems } from "../run.js";

export function initEnemiesLogic() {
  registerSystems({ updateEnemies });
}
