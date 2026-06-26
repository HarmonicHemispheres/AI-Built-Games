// ============================================================================
// buildings.test.mjs — node verification for the Buildings subsystem (W2).
// Run: `node games/clicky_empire/test/buildings.test.mjs`
//
// Covers (CONTRACTS §14 "W2-Buildings" + the W2-Buildings task spec):
//   - catalog integrity: every building card defId resolves in BUILDINGS;
//     castle exists with high hp.
//   - placeBuilding validity: rejects non-buildable / occupied; forest tile
//     normalizes to grasslands under the footprint.
//   - tickEconomy: accrues yields, applies adjacency bonus, spawner emits
//     `spawn-unit` up to cap.
//   - updateDefense: damages the nearest in-range enemy on cooldown + emits
//     `combat-hit`; out-of-range enemies are untouched.
//   - building death: hp<=0 removes from state.placed; castle death sets
//     state.run.castleDown.
//
// PURE-LOGIC only — imports catalog.js / economy.js / defense.js (no three).
// ============================================================================

import assert from "node:assert/strict";

import { state, newRun, nextId } from "../src/state.js";
import { on, clearAll } from "../src/util/events.js";
import { tileKey } from "../src/util/math.js";
import { TILE, getTileType } from "../src/world/tiles.js";
import { CARDS } from "../src/cards/catalog.js";

import { BUILDINGS, getBuildingDef } from "../src/buildings/catalog.js";
import { placeBuilding, tickEconomy } from "../src/buildings/economy.js";
import { updateDefense } from "../src/buildings/defense.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// --- Test helpers -----------------------------------------------------------

// Put a tile of `type` at (col,row) into the live map (instance shape matches
// world/generate.js makeTile: spread the type def so callers read buildable/etc).
function setTile(col, row, type) {
  state.map.tiles.set(tileKey(col, row), { col, row, type, ...getTileType(type) });
}

// Reset to a clean run with an empty map; caller seeds tiles as needed.
function freshRun() {
  clearAll();
  newRun({ seed: "TESTSEED", mapSize: 5 });
  state.map.tiles = new Map();
  state.placed = [];
  state.units = [];
  state.enemies = [];
  state.resources = { gold: 0, wood: 0, iron: 0, food: 0 };
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ===========================================================================
// 1. Catalog integrity
// ===========================================================================
{
  // Every building card's effect.defId must resolve in BUILDINGS.
  const buildingCards = Object.values(CARDS).filter((c) => c.type === "building");
  assert.ok(buildingCards.length > 0, "there are building cards to check");
  for (const card of buildingCards) {
    const defId = card.effect?.defId;
    assert.ok(defId, `card ${card.id} has effect.defId`);
    assert.ok(getBuildingDef(defId), `BUILDINGS has def for card defId "${defId}"`);
  }

  // Castle exists with high hp and the right kind.
  const castle = getBuildingDef("castle");
  assert.ok(castle, "castle def exists");
  assert.equal(castle.kind, "castle");
  assert.ok(castle.hp >= 20, "castle has high hp");

  // Every v1 defId named in the contract is present.
  const required = [
    "castle", "lumber_camp", "hamlet", "wheat_field", "militia_camp",
    "watchtower", "palisade", "sawmill", "mine", "barracks",
    "stone_wall", "ballista_tower",
  ];
  for (const id of required) {
    assert.ok(BUILDINGS[id], `BUILDINGS includes "${id}"`);
    assert.equal(BUILDINGS[id].id, id, `BUILDINGS["${id}"].id === "${id}"`);
  }

  // Field shape sanity: defense buildings have attack; spawners have spawns;
  // economy have yields; walls/castle have neither attack nor yields.
  assert.ok(BUILDINGS.watchtower.attack && BUILDINGS.ballista_tower.attack, "defense have attack");
  assert.equal(BUILDINGS.watchtower.kind, "defense");
  assert.ok(BUILDINGS.militia_camp.spawns && BUILDINGS.barracks.spawns, "spawners have spawns");
  assert.equal(BUILDINGS.militia_camp.spawns.unitId, "militia");
  assert.equal(BUILDINGS.militia_camp.spawns.cap, 3);
  assert.ok(BUILDINGS.lumber_camp.yields.wood > 0, "lumber_camp yields wood");
  assert.ok(!BUILDINGS.palisade.attack && !BUILDINGS.palisade.yields, "palisade is an inert wall");
  assert.ok(BUILDINGS.stone_wall.hp > BUILDINGS.palisade.hp, "stone_wall tougher than palisade");
  ok("catalog integrity: card defIds resolve, castle + all v1 defs present");
}

// ===========================================================================
// 2. placeBuilding validity
// ===========================================================================
{
  freshRun();
  setTile(0, 0, TILE.GRASS);
  setTile(1, 0, TILE.WATER); // not buildable
  // (no tile at 5,5 => off-map)

  // Unknown def -> null.
  assert.equal(placeBuilding("not_a_building", 0, 0), null, "unknown def rejected");

  // Off-map / missing tile -> null.
  assert.equal(placeBuilding("hamlet", 5, 5), null, "missing tile rejected");

  // Non-buildable tile -> null.
  assert.equal(placeBuilding("hamlet", 1, 0), null, "water (non-buildable) rejected");

  // Valid placement.
  const b = placeBuilding("hamlet", 0, 0);
  assert.ok(b, "valid placement returns a building");
  assert.equal(b.defId, "hamlet");
  assert.equal(b.col, 0);
  assert.equal(b.row, 0);
  assert.equal(b.hp, getBuildingDef("hamlet").hp);
  assert.equal(b.maxHp, getBuildingDef("hamlet").hp);
  assert.equal(b.group, null, "instance starts with group:null (render builds it)");
  assert.equal(b.cd, 0);
  assert.ok(b.pos && b.pos.x === 0 && b.pos.z === 0, "pos set from tileToWorld");
  assert.equal(state.placed.length, 1, "pushed to state.placed");

  // Occupied tile -> null.
  assert.equal(placeBuilding("lumber_camp", 0, 0), null, "occupied tile rejected");
  assert.equal(state.placed.length, 1, "occupied placement did not push");
  ok("placeBuilding rejects unknown/missing/non-buildable/occupied; valid pushes instance");
}

// --- forest normalizes to grasslands ---
{
  freshRun();
  setTile(2, 2, TILE.FOREST);
  const before = state.map.tiles.get(tileKey(2, 2));
  assert.equal(before.type, TILE.FOREST, "tile starts as forest");

  const b = placeBuilding("lumber_camp", 2, 2);
  assert.ok(b, "can build on forest");
  const after = state.map.tiles.get(tileKey(2, 2));
  assert.equal(after.type, TILE.GRASS, "forest tile normalized to grasslands");
  assert.equal(after.adjacency, null, "cleared tile no longer carries forest hint");
  assert.equal(after.buildable, true, "still buildable after clearing");
  ok("placeBuilding normalizes forest -> grasslands under the footprint");
}

// ===========================================================================
// 3. tickEconomy — yields + adjacency bonus
// ===========================================================================
{
  freshRun();
  // Plain grass: lumber_camp yields base wood (0.5/tick, tickRate 1).
  setTile(0, 0, TILE.GRASS);
  const plain = placeBuilding("lumber_camp", 0, 0);
  assert.ok(plain);

  tickEconomy(1); // exactly one tick
  const def = getBuildingDef("lumber_camp");
  assert.ok(approx(state.resources.wood, def.yields.wood), "base wood accrued one tick");

  // dt smaller than tickRate accrues nothing yet, then completes on the rest.
  const woodAfter1 = state.resources.wood;
  tickEconomy(0.4);
  assert.ok(approx(state.resources.wood, woodAfter1), "partial dt does not accrue mid-tick");
  tickEconomy(0.6);
  assert.ok(
    approx(state.resources.wood, woodAfter1 + def.yields.wood),
    "accrual completes once tickRate is reached",
  );
  ok("tickEconomy accrues base yields per tickRate (frame-rate independent)");
}

// --- adjacency bonus ---
{
  freshRun();
  // lumber_camp on grass NEXT TO a forest tile gets +50%.
  setTile(0, 0, TILE.GRASS);
  setTile(1, 0, TILE.FOREST); // 4-neighbour forest provides the adjacency hint
  const b = placeBuilding("lumber_camp", 0, 0);
  assert.ok(b);

  tickEconomy(1);
  const def = getBuildingDef("lumber_camp");
  const expected = def.yields.wood * (1 + def.adjacency.forest); // 0.5 * 1.5
  assert.ok(
    approx(state.resources.wood, expected),
    `adjacency bonus applied (got ${state.resources.wood}, want ${expected})`,
  );
  ok("tickEconomy applies adjacency multiplier (+50% next to forest)");
}

// ===========================================================================
// 4. tickEconomy — spawner emits spawn-unit up to cap
// ===========================================================================
{
  freshRun();
  setTile(0, 0, TILE.GRASS);
  setTile(1, 0, TILE.GRASS); // walkable neighbour to spawn onto
  const camp = placeBuilding("militia_camp", 0, 0);
  assert.ok(camp);

  const spawns = [];
  on("spawn-unit", (p) => spawns.push(p));

  const def = getBuildingDef("militia_camp");
  const { interval, cap, unitId } = def.spawns;

  // Drive enough time for many intervals to elapse. Each emitted spawn-unit
  // would (in the real game) create a unit; here we simulate units/behavior by
  // pushing a unit instance into state.units when the event fires, so the cap
  // actually clamps the count.
  on("spawn-unit", ({ unitId, col, row }) => {
    state.units.push({ id: nextId("u"), unitId, hp: 4, maxHp: 4, pos: { x: col, y: 0, z: row } });
  });

  tickEconomy(interval * 10); // way more than enough to hit the cap
  assert.equal(spawns.length, cap, `spawner emitted exactly cap (${cap}) spawn-unit events`);
  assert.ok(spawns.every((s) => s.unitId === unitId), "emitted the configured unitId");
  // Spawn near the building (its tile or a neighbour).
  for (const s of spawns) {
    const near = Math.abs(s.col - camp.col) <= 1 && Math.abs(s.row - camp.row) <= 1;
    assert.ok(near, "spawn position is adjacent/on the building");
  }
  assert.equal(state.units.length, cap, "living units clamped to cap");

  // Killing a unit lets the camp top back up to cap on the next interval.
  state.units.pop(); // one militia dies
  tickEconomy(interval); // one more interval
  assert.equal(state.units.length, cap, "camp refills to cap after a death");
  ok("spawner emits spawn-unit up to cap, respects living count, refills after death");
}

// ===========================================================================
// 5. updateDefense — damages nearest in-range enemy on cd + emits combat-hit
// ===========================================================================
{
  freshRun();
  setTile(0, 0, TILE.GRASS);
  const tower = placeBuilding("watchtower", 0, 0);
  assert.ok(tower);
  const def = getBuildingDef("watchtower");

  // Two enemies: one in range & close, one in range but farther, one out.
  const near = { id: nextId("E"), enemyId: "raider", hp: 10, maxHp: 10, pos: { x: 1, y: 0, z: 0 } };
  const far = { id: nextId("E"), enemyId: "raider", hp: 10, maxHp: 10, pos: { x: 2, y: 0, z: 0 } };
  const outOfRange = {
    id: nextId("E"), enemyId: "raider", hp: 10, maxHp: 10,
    pos: { x: 100, y: 0, z: 0 },
  };
  state.enemies.push(far, near, outOfRange); // order shouldn't matter

  const hits = [];
  on("combat-hit", (p) => hits.push(p));

  // First call: cd starts at 0 => fires immediately at the NEAREST in-range.
  updateDefense(0.016);
  assert.equal(near.hp, 10 - def.attack.damage, "nearest enemy took tower damage");
  assert.equal(far.hp, 10, "farther enemy untouched");
  assert.equal(outOfRange.hp, 10, "out-of-range enemy untouched");
  assert.equal(hits.length, 1, "one combat-hit emitted");
  assert.equal(hits[0].amount, def.attack.damage, "combat-hit carries damage");
  assert.equal(hits[0].crit, false, "tower hits are not crits");
  assert.ok(approx(hits[0].x, near.pos.x) && approx(hits[0].z, near.pos.z), "hit at target pos");

  // Immediately after firing the tower is on cooldown (1/attackSpeed) — a tiny
  // dt should NOT fire again.
  const hpAfterFirst = near.hp;
  updateDefense(0.016);
  assert.equal(near.hp, hpAfterFirst, "tower respects cooldown (no immediate refire)");
  assert.equal(hits.length, 1, "no extra combat-hit during cooldown");

  // After the full cooldown elapses it fires again.
  updateDefense(1 / def.attack.attackSpeed);
  assert.equal(near.hp, hpAfterFirst - def.attack.damage, "tower fires again after cooldown");
  assert.equal(hits.length, 2, "second combat-hit after cooldown");
  ok("updateDefense fires at nearest in-range enemy on cooldown + emits combat-hit");
}

// ===========================================================================
// 6. Building death — removal + castle sets castleDown
// ===========================================================================
{
  freshRun();
  setTile(0, 0, TILE.GRASS);
  setTile(1, 1, TILE.GRASS);

  // A normal building at 0 hp is swept on the next defense update.
  const wall = placeBuilding("palisade", 1, 1);
  assert.ok(wall);
  // Also place a tower so updateDefense has a defense building to iterate; the
  // sweep runs regardless, but this keeps the path realistic.
  const tower = placeBuilding("watchtower", 0, 0);
  assert.ok(tower);

  wall.hp = 0; // destroyed by some enemy
  assert.equal(state.placed.length, 2);
  updateDefense(0.016);
  assert.ok(!state.placed.includes(wall), "dead building removed from state.placed");
  assert.equal(state.run.castleDown, undefined, "a wall death does not set castleDown");

  // The castle dying sets state.run.castleDown. (0,0) is occupied above, so
  // start fresh and place the castle on its own tile.
  freshRun();
  setTile(0, 0, TILE.GRASS);
  const realCastle = placeBuilding("castle", 0, 0);
  assert.ok(realCastle, "castle placed");
  realCastle.hp = 0;
  assert.notEqual(state.run.castleDown, true, "castleDown not set before sweep");
  updateDefense(0.016);
  assert.ok(!state.placed.includes(realCastle), "destroyed castle removed");
  assert.equal(state.run.castleDown, true, "castle death sets state.run.castleDown");
  ok("building death removes from state.placed; castle death sets run.castleDown");
}

clearAll();
console.log(`\nBuildings: ${passed} checks passed.`);
