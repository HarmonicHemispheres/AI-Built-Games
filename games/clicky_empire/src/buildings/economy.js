// ============================================================================
// buildings/economy.js — idle resource ticks + spawner buildings. PURE LOGIC.
//
// No three, no DOM. Node-runnable. Imports only Wave-1/Stage-0 merged files and
// its OWN sibling (catalog.js). Cross-Wave-2 coupling is via the event bus:
//   - emit('spawn-unit', {unitId, col, row})  — units/behavior.js listens and
//     calls createUnit (we never import units modules; CONTRACTS §14
//     "Cross-module decoupling").
//
// Responsibilities:
//   - placeBuilding(defId, col, row) -> building | null
//       validate tile (buildable & unoccupied), create the runtime instance per
//       §10, normalize forest -> grasslands under the footprint, push to
//       state.placed.
//   - tickEconomy(dt)
//       accrue yields * adjacencyMult per tickRate (addResource); advance spawner
//       timers and emit 'spawn-unit' near the building while below its cap.
//   - initEconomy() -> registerSystems({ tickEconomy }).
// ============================================================================

import { state, addResource, nextId, canAfford, spend } from "../state.js";
import { emit } from "../util/events.js";
import { registerSystems } from "../run.js";
import { N4, N8, tileToWorld, worldToTile, tileKey } from "../util/math.js";
import { tileAt } from "../world/generate.js";
import { TILE, getTileType } from "../world/tiles.js";
import { getBuildingDef } from "./catalog.js";

// ---------------------------------------------------------------------------
// Placement (LOGIC)
// ---------------------------------------------------------------------------

// True when no building in state.placed already sits on (col,row).
function isOccupied(col, row) {
  return state.placed.some((b) => b.col === col && b.row === row);
}

// placeBuilding(defId, col, row) -> building | null
//   - Rejects unknown defs, non-buildable tiles, and occupied tiles.
//   - On a forest tile, normalizes the tile type to grasslands (it "clears to
//     grass when built on", prompt.md "Tile Types") — done BEFORE reading
//     adjacency so the cleared tile no longer counts itself as forest.
//   - Creates the runtime instance per CONTRACTS §10 and pushes to state.placed.
export function placeBuilding(defId, col, row) {
  const def = getBuildingDef(defId);
  if (!def) return null;

  const tile = tileAt(col, row);
  if (!tile || !tile.buildable) return null;
  if (isOccupied(col, row)) return null;
  // Terrain gate (checked BEFORE the forest->grass normalize below, so a lumber
  // camp may sit ON a lone forest tile): lumber/sawmill need forest, mine ore.
  if (!placementRequirementMet(def, col, row)) return null;

  // Forest clears to grass when built on. Mutate the live tile instance in place
  // (it spreads the type def, so refresh those fields too).
  if (tile.type === TILE.FOREST) {
    Object.assign(tile, { type: TILE.GRASS, ...getTileType(TILE.GRASS) });
  }

  const w = tileToWorld(col, row, 0);
  const building = {
    id: nextId("b"),
    defId,
    col,
    row,
    pos: { x: w.x, y: w.y, z: w.z },
    hp: def.hp,
    maxHp: def.hp,
    group: null, // render reconciler (place.js) builds the mesh
    cd: 0, // accrual / spawn timer (seconds)
  };
  state.placed.push(building);
  return building;
}

// ---------------------------------------------------------------------------
// In-place upgrades (hamlet -> village -> city, etc.)
// ---------------------------------------------------------------------------

// upgradeOption(building) -> { defId, def, cost, tierReq, tierMet } | null
//   Describes the next tier a building can grow into, if any. A def opts in via
//   `upgradesTo` (the next defId) + `upgradeCost`. The target def may carry an
//   `unlockTier` gate (you can't grow a hamlet into a Tier-2 village until the run
//   reaches Tier 2). The UI reads this to render the upgrade button + its state.
export function upgradeOption(building) {
  if (!building) return null;
  const def = getBuildingDef(building.defId);
  if (!def || !def.upgradesTo) return null;
  const nextDef = getBuildingDef(def.upgradesTo);
  if (!nextDef) return null;
  const tierReq = nextDef.unlockTier || 1;
  const tierMet = (state.run?.tier ?? 1) >= tierReq;
  return { defId: def.upgradesTo, def: nextDef, cost: def.upgradeCost || {}, tierReq, tierMet };
}

// upgradeBuilding(building) -> boolean
//   Grow a building into its next tier in place: keep the same instance/tile/id,
//   pay the upgrade cost, swap the defId, and reset hp/timer to the new def. The
//   render reconciler (place.js) notices the defId changed and rebuilds the mesh
//   (and its production bar) with a placement pop. Returns false (no spend) if
//   there's no upgrade, the tier gate isn't met, or it's unaffordable.
export function upgradeBuilding(building) {
  const opt = upgradeOption(building);
  if (!opt || !opt.tierMet) return false;
  if (!canAfford(opt.cost)) return false;

  spend(opt.cost);
  building.defId = opt.defId;
  building.maxHp = opt.def.hp;
  building.hp = opt.def.hp; // a fresh, fully-built structure
  building.cd = 0; // restart its production timer
  emit("building-upgraded", { id: building.id, defId: building.defId });
  return true;
}

// ---------------------------------------------------------------------------
// Adjacency
// ---------------------------------------------------------------------------

// Total adjacency multiplier for a building at (col,row): 1 + sum of matching
// hint bonuses. A def's adjacency map is `{ tileHint: bonusMult }` where the
// hint is matched against neighbouring tiles' `adjacency` field (forest/mountain
// /ore/berry) OR — special case — the building's OWN tile (mines "on an ore
// vein", farms "on grass/berry"). We count BOTH the footprint tile and the 8
// neighbours so "on" and "next to" both satisfy a hint.
function adjacencyMult(def, col, row) {
  const adj = def.adjacency;
  if (!adj) return 1;

  let mult = 1;
  for (const hint in adj) {
    const bonus = adj[hint];
    if (hintMatchesAround(hint, col, row)) mult += bonus;
  }
  return mult;
}

// Does any tile in the footprint+neighbourhood satisfy `hint`? `grass` is a
// pseudo-hint (grasslands tiles carry adjacency=null) handled by type check.
function hintMatchesAround(hint, col, row) {
  // Check the building's own tile first (covers "on an ore vein"/"on grass").
  if (tileHasHint(tileAt(col, row), hint)) return true;
  for (const { dc, dr } of N8) {
    if (tileHasHint(tileAt(col + dc, row + dr), hint)) return true;
  }
  return false;
}

function tileHasHint(tile, hint) {
  if (!tile) return false;
  if (hint === "grass") return tile.type === TILE.GRASS;
  return tile.adjacency === hint;
}

// ---------------------------------------------------------------------------
// Placement terrain requirement
// ---------------------------------------------------------------------------

// Some buildings can only be built on/next to a particular terrain: lumber camp
// & sawmill need a 'forest' tile, the mine needs an 'ore' vein, within their
// footprint+8-neighbourhood. `def.requiresNear` is a hint string or array of
// hints (matched exactly like adjacency hints). No requirement => always met.
export function placementRequirementMet(def, col, row) {
  if (!def || def.requiresNear == null) return true;
  const hints = Array.isArray(def.requiresNear) ? def.requiresNear : [def.requiresNear];
  return hints.some((h) => hintMatchesAround(h, col, row));
}

// ---------------------------------------------------------------------------
// Spawner cap counting
// ---------------------------------------------------------------------------

// Count this spawner's OWN living units (PER-camp cap). Units carry the id of the
// building that spawned them (`spawnerId`, stamped by units/behavior.createUnit),
// so two militia camps each track their own roster independently. A unit is
// "living" if hp>0.
function livingFromSpawner(buildingId) {
  let n = 0;
  for (const u of state.units) {
    if (u && u.spawnerId === buildingId && (u.hp == null || u.hp > 0)) n++;
  }
  return n;
}

// Is a living unit currently standing on tile (col,row)? Used to spread spawns
// out so several free units don't stack invisibly on one tile.
function unitOnTile(col, row) {
  for (const u of state.units) {
    if (!u || !u.pos) continue;
    if (u.hp != null && u.hp <= 0) continue;
    const t = worldToTile(u.pos.x, u.pos.z);
    if (t.col === col && t.row === row) return true;
  }
  return false;
}

// A tile is a valid spawn target if it's revealed (so the unit lands on visible
// ground, never under a fog cloud), walkable, and has no building on it.
function isSpawnable(col, row) {
  if (!state.map.revealed?.has(tileKey(col, row))) return false;
  const t = tileAt(col, row);
  return !!(t && t.walkable) && !isOccupied(col, row);
}

// Pick a free tile near the building to spawn a unit on. Searches outward in
// Chebyshev rings (radius 1..3) and prefers a tile with NO unit already on it,
// so spawned units never vanish under the building (when its own neighbours are
// all built up) and don't pile invisibly on a single tile. Falls back to any
// spawnable tile (possibly already holding a unit), and only as a last resort to
// the building's own tile. Keeps spawns "near the building" (CONTRACTS §14).
function spawnTileNear(col, row) {
  let firstSpawnable = null;
  for (let r = 1; r <= 3; r++) {
    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue; // ring shell only
        const c = col + dc;
        const rr = row + dr;
        if (!isSpawnable(c, rr)) continue;
        if (!firstSpawnable) firstSpawnable = { col: c, row: rr };
        if (!unitOnTile(c, rr)) return { col: c, row: rr }; // empty + visible
      }
    }
  }
  if (firstSpawnable) return firstSpawnable;
  return { col, row };
}

// ---------------------------------------------------------------------------
// Tick (LOGIC)
// ---------------------------------------------------------------------------

// tickEconomy(dt) — accrue economy yields and advance spawner timers.
// `dt` is seconds (already scaled by speed by the run machine).
export function tickEconomy(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;

  for (const b of state.placed) {
    const def = getBuildingDef(b.defId);
    if (!def) continue;

    // --- Economy yields -----------------------------------------------------
    if (def.yields) {
      const rate = def.tickRate || 1;
      b.cd += dt;
      // Emit one (or more, if dt is large) discrete ticks so accrual is stable
      // regardless of frame rate.
      while (b.cd >= rate) {
        b.cd -= rate;
        const mult = adjacencyMult(def, b.col, b.row);
        for (const res in def.yields) {
          addResource(res, def.yields[res] * mult);
        }
      }
    }

    // --- Spawner buildings --------------------------------------------------
    else if (def.spawns) {
      const { unitId, interval, cap, foodCost = 0 } = def.spawns;
      const every = interval || 1;

      // At cap: STOP loading. Hold the timer at 0 so the production bar freezes
      // (full: this camp's living == cap). The instant one of THIS camp's units
      // dies, its count drops below cap and the freed slot refills over a full
      // interval. The cap is per-building (each camp counts only units it spawned).
      if (livingFromSpawner(b.id) >= cap) {
        b.cd = 0;
        continue;
      }

      b.cd += dt;
      while (b.cd >= every) {
        if (livingFromSpawner(b.id) >= cap) {
          // Hit the cap mid-tick: stop draining the timer and don't bank a
          // backlog of free units to dump the instant one dies.
          b.cd = 0;
          break;
        }
        // Raising a unit costs food. If the larder can't cover it, pause with the
        // timer held full so the unit pops the instant food is harvested/earned
        // (rather than silently dropping the trained unit or draining the bar).
        if (foodCost > 0 && !spend({ food: foodCost })) {
          b.cd = every;
          break;
        }
        b.cd -= every;
        const { col, row } = spawnTileNear(b.col, b.row);
        // units/behavior.js listens and calls createUnit (no import). It stamps
        // the spawned unit with sourceId so this camp can count its own roster.
        emit("spawn-unit", { unitId, col, row, sourceId: b.id });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// initEconomy() — register the per-phase economy tick. Idempotent at the
// registry level (registerSystems just overwrites the member).
export function initEconomy() {
  registerSystems({ tickEconomy });
}
