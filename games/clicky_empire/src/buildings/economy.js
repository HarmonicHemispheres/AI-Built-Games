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

import { state, addResource, nextId } from "../state.js";
import { emit } from "../util/events.js";
import { registerSystems } from "../run.js";
import { N4, N8, tileToWorld } from "../util/math.js";
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
// Spawner cap counting
// ---------------------------------------------------------------------------

// Count living units of `unitId` (for spawner cap). A unit is "living" if hp>0.
function livingUnitCount(unitId) {
  let n = 0;
  for (const u of state.units) {
    if (u.unitId === unitId && (u.hp == null || u.hp > 0)) n++;
  }
  return n;
}

// Pick a free-ish adjacent tile to spawn a unit on; falls back to the building's
// own tile. Keeps spawns "near the building" (CONTRACTS §14).
function spawnTileNear(col, row) {
  for (const { dc, dr } of N4) {
    const t = tileAt(col + dc, row + dr);
    if (t && t.walkable && !isOccupied(col + dc, row + dr)) {
      return { col: col + dc, row: row + dr };
    }
  }
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
      const { unitId, interval, cap } = def.spawns;
      b.cd += dt;
      const every = interval || 1;
      while (b.cd >= every) {
        b.cd -= every;
        if (livingUnitCount(unitId) < cap) {
          const { col, row } = spawnTileNear(b.col, b.row);
          // units/behavior.js listens and calls createUnit (no import).
          emit("spawn-unit", { unitId, col, row });
        }
        // If at cap we still consumed the timer (don't bank up a backlog of
        // free units to dump the instant one dies).
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
