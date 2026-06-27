// ============================================================================
// units/behavior.js — player unit creation + per-tick AI. PURE LOGIC.
//
// No three, no DOM. Imports only Wave-1/Stage-0 merged files (state, run,
// events, catalog, pathfind, math) and never a sibling-wave module (enemies /
// buildings / cards). Cross-module coupling is via the event bus (CONTRACTS §14
// "Cross-module decoupling"): `spawn-unit` is listened to here and resolved
// into `createUnit`.
//
// Unit instance (CONTRACTS §10 + §14 "Unit / order protocol"):
//   { id, unitId, def, pos:{x,y,z}, hp, maxHp, stance:'defensive',
//     order:null|Order, attackCd:0, group:null }
//   Order = {type:'move', tile:{col,row}}
//         | {type:'attack', targetId}
//         | {type:'attackMove', tile:{col,row}}
//         | {type:'stop'}
//
// W2-RTS sets `unit.order`; this module reads it, moves via findPath, attacks
// via combat.resolveHit, clears `order` on completion, then falls back to the
// default defensive stance (engage the nearest enemy within ~range, but do not
// chase far past a leash).
// ============================================================================

import { state, nextId, emit, on } from "../state.js";
import { registerSystems } from "../run.js";
import { getUnitDef } from "./catalog.js";
import { resolveHit } from "../combat/damage.js";
import { findPath, isWalkable, nearestWalkableToward } from "../world/pathfind.js";
import { tileToWorld, worldToTile, distXZ, N4, tileKey, manhattan } from "../util/math.js";

// Defensive-stance leash: how far (in world units) past its range a unit will
// chase a target it engaged on its own before giving up and returning to idle.
const DEFENSIVE_LEASH = 3.0;

// How close (world units) to a path waypoint's center counts as "arrived" at it.
const WAYPOINT_EPS = 0.05;

// ---------------------------------------------------------------------------
// createUnit — build the logic instance, push to state.units, return it.
// ---------------------------------------------------------------------------
export function createUnit(unitId, col, row, sourceId = null) {
  const def = getUnitDef(unitId);
  if (!def) return null;
  const unit = {
    id: nextId("u"),
    unitId,
    def,
    pos: tileToWorld(col, row),
    hp: def.hp,
    maxHp: def.hp,
    stance: "defensive",
    order: null,
    attackCd: 0,
    group: null,
    // id of the spawner building that produced this unit (null for card/hand
    // units). Spawner buildings count their own roster by this for a per-camp cap.
    spawnerId: sourceId,
  };
  state.units.push(unit);
  return unit;
}

// ---------------------------------------------------------------------------
// updateUnits — per-tick AI for every living unit.
// ---------------------------------------------------------------------------
export function updateUnits(dt) {
  const units = state.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u || u.hp <= 0) continue;

    // Cool down the attack timer (seconds).
    if (u.attackCd > 0) u.attackCd = Math.max(0, u.attackCd - dt);

    // Reset the per-unit leash anchor on a fresh autonomous engagement.
    runUnit(u, dt);
  }

  // Reap the dead (hp<=0). Render reconciler disposes the mesh on removal.
  for (let i = units.length - 1; i >= 0; i--) {
    if (units[i].hp <= 0) units.splice(i, 1);
  }
}

// Drive a single unit: an explicit order takes priority; otherwise stance AI.
function runUnit(u, dt) {
  const order = u.order;
  if (order) {
    switch (order.type) {
      case "stop":
        u.order = null;
        return;
      case "move":
        if (stepTowardTile(u, order.tile, dt)) u.order = null;
        return;
      case "attack": {
        const target = findEntityById(order.targetId);
        if (!target || target.hp <= 0) {
          u.order = null; // target gone — clear and fall back to stance below
          break;
        }
        engage(u, target, dt);
        return;
      }
      case "attackMove": {
        // Engage anything in range while marching; otherwise keep moving.
        const target = nearestEnemyInRange(u);
        if (target) {
          engage(u, target, dt);
          return;
        }
        if (stepTowardTile(u, order.tile, dt)) u.order = null;
        return;
      }
      default:
        u.order = null;
    }
  }

  // --- Stance fallback (defensive) ---
  // Engage the nearest enemy within reach, but do not chase far: only pursue a
  // target whose distance is within range + leash so units hold a defensive
  // line instead of running off the map.
  const enemy = nearestEnemyWithinLeash(u);
  if (enemy) engage(u, enemy, dt);
}

// Move `u` one tick toward the center of `tile`. Returns true on arrival.
// Uses findPath over revealed/walkable tiles; falls back to a greedy step when
// no full path exists (e.g. partially blocked grid).
function stepTowardTile(u, tile, dt) {
  if (!tile) return true;
  const goalWorld = tileToWorld(tile.col, tile.row);
  // Already there?
  if (distXZ(u.pos, goalWorld) <= WAYPOINT_EPS) {
    u.pos.x = goalWorld.x;
    u.pos.z = goalWorld.z;
    return true;
  }

  const from = worldToTile(u.pos.x, u.pos.z);
  let nextTile = null;
  const path = findPath(from, tile);
  if (path && path.length > 0) {
    // path[0] is the current tile; advance to the next waypoint (or goal).
    nextTile = path.length > 1 ? path[1] : path[0];
  } else if (isWalkable(from.col, from.row)) {
    // No full path to the goal (a river/mountain blocks it). Head for the
    // nearest REACHABLE tile toward the goal so the unit navigates around the
    // barrier instead of freezing. Forests are walkable, so this never routes
    // around trees — only true obstacles. Cache the subgoal to avoid BFSing
    // every tick.
    const goalKey = tileKey(tile.col, tile.row);
    if (u._navGoalKey !== goalKey || !u._navSub || !isWalkable(u._navSub.col, u._navSub.row)) {
      u._navGoalKey = goalKey;
      u._navSub = nearestReachableTile(from, tile);
    }
    const sub = u._navSub;
    if (sub && (sub.col !== from.col || sub.row !== from.row)) {
      const sp = findPath(from, sub);
      nextTile = sp && sp.length > 1 ? sp[1] : nearestWalkableToward(from, tile);
    } else {
      nextTile = nearestWalkableToward(from, tile);
    }
  } else {
    // Standing on a non-revealed/non-walkable tile (e.g. spawned pre-map): aim
    // straight at the goal so movement still works in tests/edge cases.
    nextTile = tile;
  }

  return stepToward(u, tileToWorld(nextTile.col, nextTile.row), dt, goalWorld);
}

// Bounded BFS over revealed, walkable tiles from `from`; returns the reachable
// tile with the smallest Manhattan distance to `goal`. Lets a unit blocked by a
// river/mountain still navigate to the closest point it CAN reach.
const NAV_BFS_CAP = 1500;
function nearestReachableTile(from, goal) {
  if (!isWalkable(from.col, from.row)) return null;
  const visited = new Set([tileKey(from.col, from.row)]);
  const queue = [from];
  let head = 0;
  let best = from;
  let bestD = manhattan(from, goal);
  while (head < queue.length && head < NAV_BFS_CAP) {
    const cur = queue[head++];
    for (const { dc, dr } of N4) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const k = tileKey(nc, nr);
      if (visited.has(k) || !isWalkable(nc, nr)) continue;
      visited.add(k);
      const node = { col: nc, row: nr };
      const d = manhattan(node, goal);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
      queue.push(node);
    }
  }
  return best;
}

// Step `u.pos` toward `waypoint` by def.moveSpeed*dt. If we reach the waypoint
// and it is the final goal, snap and report arrival. Returns true when the unit
// has arrived at `finalGoal`.
function stepToward(u, waypoint, dt, finalGoal) {
  const speed = u.def?.moveSpeed ?? 0;
  const maxStep = speed * dt;
  const dx = waypoint.x - u.pos.x;
  const dz = waypoint.z - u.pos.z;
  const dist = Math.hypot(dx, dz);

  if (dist <= maxStep || dist === 0) {
    u.pos.x = waypoint.x;
    u.pos.z = waypoint.z;
  } else {
    u.pos.x += (dx / dist) * maxStep;
    u.pos.z += (dz / dist) * maxStep;
  }

  return distXZ(u.pos, finalGoal) <= WAYPOINT_EPS;
}

// Engage a target: close to within `def.range`, then attack on cooldown.
function engage(u, target, dt) {
  const range = u.def?.range ?? 0.9;
  const d = distXZ(u.pos, target.pos);
  if (d > range) {
    // Move toward the target's tile until in range.
    const tt = worldToTile(target.pos.x, target.pos.z);
    stepTowardTile(u, tt, dt);
    return;
  }
  // In range — attack when the cooldown is ready.
  if (u.attackCd <= 0) {
    const { dealt, crit } = resolveHit(u, target);
    if (dealt > 0) {
      emit("combat-hit", {
        x: target.pos.x,
        z: target.pos.z,
        amount: dealt,
        crit,
      });
    }
    const aps = u.def?.attackSpeed ?? 1;
    u.attackCd = aps > 0 ? 1 / aps : 0;
  }
}

// ---------------------------------------------------------------------------
// Target selection helpers (read state.enemies directly per decoupling rules).
// ---------------------------------------------------------------------------

function nearestEnemy(u) {
  let best = null;
  let bestD = Infinity;
  const enemies = state.enemies;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || e.hp <= 0 || !e.pos) continue;
    const d = distXZ(u.pos, e.pos);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best ? { enemy: best, dist: bestD } : null;
}

function nearestEnemyInRange(u) {
  const found = nearestEnemy(u);
  if (!found) return null;
  const range = u.def?.range ?? 0.9;
  return found.dist <= range ? found.enemy : null;
}

// Defensive stance: engage the nearest enemy only if it is within range + a
// short leash, so the unit holds its ground rather than chasing across the map.
function nearestEnemyWithinLeash(u) {
  const found = nearestEnemy(u);
  if (!found) return null;
  const range = u.def?.range ?? 0.9;
  return found.dist <= range + DEFENSIVE_LEASH ? found.enemy : null;
}

// Resolve an order's targetId against the live entity arrays. Units may target
// enemies; we look there first, then buildings, then other units (for symmetry,
// though RTS only ever issues enemy targets in v1).
function findEntityById(id) {
  if (id == null) return null;
  for (const e of state.enemies) if (e && e.id === id) return e;
  for (const b of state.placed) if (b && b.id === id) return b;
  for (const u of state.units) if (u && u.id === id) return u;
  return null;
}

// ---------------------------------------------------------------------------
// init — register the per-tick system and listen for spawn requests.
// ---------------------------------------------------------------------------
export function initUnitsLogic() {
  registerSystems({ updateUnits });
  // Economy (militia_camp/barracks) and the unit card path emit `spawn-unit`
  // instead of importing this module (CONTRACTS §14). We own creation.
  on("spawn-unit", ({ unitId, col, row, sourceId = null } = {}) => {
    if (unitId == null) return;
    createUnit(unitId, col, row, sourceId);
  });
}
