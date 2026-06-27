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
  assert.equal(BUILDINGS.militia_camp.spawns.cap, 2); // per-camp cap
  assert.ok(BUILDINGS.lumber_camp.yields.wood > 0, "lumber_camp yields wood");
  assert.ok(!BUILDINGS.palisade.attack && !BUILDINGS.palisade.yields, "palisade is an inert wall");
  assert.ok(BUILDINGS.stone_wall.hp > BUILDINGS.palisade.hp, "stone_wall tougher than palisade");

  // Terrain-gated economy buildings carry a requiresNear hint.
  assert.equal(BUILDINGS.lumber_camp.requiresNear, "forest", "lumber_camp gated to forest");
  assert.equal(BUILDINGS.sawmill.requiresNear, "forest", "sawmill gated to forest");
  assert.equal(BUILDINGS.mine.requiresNear, "ore", "mine gated to ore");

  // Tier-3 buildings are present and shaped right.
  for (const id of ["keep", "wizard_tower", "castle_wall"]) {
    assert.ok(BUILDINGS[id], `BUILDINGS includes T3 "${id}"`);
  }
  assert.notEqual(BUILDINGS.keep.kind, "castle", "keep is NOT kind:castle (its death must not end the run)");
  assert.ok(BUILDINGS.keep.attack && BUILDINGS.keep.hp >= 20, "keep is a high-HP auto-attacker");
  assert.ok(BUILDINGS.wizard_tower.attack && BUILDINGS.wizard_tower.attack.range >= 6, "wizard tower is long-range");
  assert.equal(BUILDINGS.castle_wall.kind, "wall", "castle_wall is a wall");
  assert.ok(BUILDINGS.castle_wall.hp > BUILDINGS.stone_wall.hp, "castle_wall tougher than stone_wall");
  ok("catalog integrity: card defIds resolve, castle + all v1 + T3 defs present");
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

// --- terrain placement requirements (lumber/sawmill near forest; mine near ore) ---
{
  freshRun();
  // A lone grass tile with no special terrain nearby.
  setTile(0, 0, TILE.GRASS);
  assert.equal(placeBuilding("lumber_camp", 0, 0), null, "lumber camp blocked with no forest near");
  assert.equal(placeBuilding("sawmill", 0, 0), null, "sawmill blocked with no forest near");
  assert.equal(placeBuilding("mine", 0, 0), null, "mine blocked with no ore vein near");

  // Add an adjacent forest -> lumber camp (and sawmill) become placeable.
  setTile(1, 0, TILE.FOREST);
  const lc = placeBuilding("lumber_camp", 0, 0);
  assert.ok(lc, "lumber camp allowed once a forest is adjacent");
  assert.equal(state.placed.length, 1);

  // Mine still needs ORE, not forest.
  freshRun();
  setTile(3, 3, TILE.GRASS);
  setTile(3, 4, TILE.FOREST);
  assert.equal(placeBuilding("mine", 3, 3), null, "mine still blocked next to forest (needs ore)");
  setTile(2, 3, TILE.ORE);
  assert.ok(placeBuilding("mine", 3, 3), "mine allowed once an ore vein is adjacent");

  // A building placed directly ON its required terrain also qualifies.
  freshRun();
  setTile(7, 7, TILE.ORE);
  assert.ok(placeBuilding("mine", 7, 7), "mine allowed when built ON an ore vein");
  ok("placement requirements: lumber/sawmill need forest, mine needs an ore vein");
}

// ===========================================================================
// 3. tickEconomy — yields + adjacency bonus
// ===========================================================================
{
  freshRun();
  // Plain grass: hamlet yields base gold (rent) at 0.4/tick, tickRate 1. We use
  // hamlet (not lumber_camp) for the BASE-rate check now that lumber_camp must be
  // built near a forest — which would also grant an adjacency bonus and muddy it.
  setTile(0, 0, TILE.GRASS);
  const plain = placeBuilding("hamlet", 0, 0);
  assert.ok(plain);

  tickEconomy(1); // exactly one tick
  const def = getBuildingDef("hamlet");
  assert.ok(approx(state.resources.gold, def.yields.gold), "base gold accrued one tick");

  // dt smaller than tickRate accrues nothing yet, then completes on the rest.
  const goldAfter1 = state.resources.gold;
  tickEconomy(0.4);
  assert.ok(approx(state.resources.gold, goldAfter1), "partial dt does not accrue mid-tick");
  tickEconomy(0.6);
  assert.ok(
    approx(state.resources.gold, goldAfter1 + def.yields.gold),
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
  // pushing a unit instance into state.units when the event fires, stamping the
  // spawner's id (sourceId) so the PER-camp cap actually clamps the count.
  on("spawn-unit", ({ unitId, col, row, sourceId }) => {
    state.units.push({ id: nextId("u"), unitId, spawnerId: sourceId, hp: 4, maxHp: 4, pos: { x: col, y: 0, z: row } });
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
  assert.equal(camp.cd, 0, "production timer frozen at 0 while at cap (bar stops loading)");

  // Killing a unit lets the camp top back up to cap on the next interval.
  state.units.pop(); // one militia dies
  tickEconomy(interval); // one more interval
  assert.equal(state.units.length, cap, "camp refills to cap after a death");
  ok("spawner emits spawn-unit up to cap, freezes timer at cap, refills after death");
}

// ===========================================================================
// 4b. spawner places units on a visible, building-free tile (never under the
//     building, even when every direct neighbour is built up)
// ===========================================================================
{
  freshRun();
  // A revealed 5x5 grass block around the camp.
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      setTile(c, r, TILE.GRASS);
      state.map.revealed.add(tileKey(c, r));
    }
  }
  const camp = placeBuilding("militia_camp", 0, 0);
  assert.ok(camp);
  // Wall off all four orthogonal neighbours so the old "first free N4" logic
  // would have fallen back to the camp's own (hidden) tile.
  for (const [c, r] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    assert.ok(placeBuilding("palisade", c, r), `palisade placed at ${c},${r}`);
  }

  const spawns = [];
  on("spawn-unit", (p) => {
    spawns.push(p);
    state.units.push({ id: nextId("u"), unitId: p.unitId, spawnerId: p.sourceId, hp: 4, maxHp: 4, pos: { x: p.col, y: 0, z: p.row } });
  });

  const { interval } = getBuildingDef("militia_camp").spawns;
  tickEconomy(interval * 3); // spawn a few

  assert.ok(spawns.length > 0, "the camp spawned at least one militia");
  for (const s of spawns) {
    assert.ok(!(s.col === 0 && s.row === 0), "never spawns on the camp's own tile");
    assert.ok(!state.placed.some((b) => b.col === s.col && b.row === s.row), "never spawns on a building");
    assert.ok(state.map.revealed.has(tileKey(s.col, s.row)), "spawns on a revealed (visible) tile");
    const t = state.map.tiles.get(tileKey(s.col, s.row));
    assert.ok(t && t.walkable, "spawns on a walkable tile");
  }
  ok("spawner finds a visible, walkable, building-free tile when neighbours are built up");
}

// ===========================================================================
// 4c. EACH spawner has its OWN per-building cap (not a shared global one)
// ===========================================================================
{
  freshRun();
  // Two militia camps far apart, each with revealed grass room around it.
  for (const cx of [0, 8]) {
    for (let r = -1; r <= 1; r++) {
      for (let c = -1; c <= 1; c++) {
        setTile(cx + c, r, TILE.GRASS);
        state.map.revealed.add(tileKey(cx + c, r));
      }
    }
  }
  const campA = placeBuilding("militia_camp", 0, 0);
  const campB = placeBuilding("militia_camp", 8, 0);
  assert.ok(campA && campB);

  // Mirror units/behavior: stamp each spawned unit with its source camp's id.
  on("spawn-unit", ({ unitId, col, row, sourceId }) => {
    state.units.push({ id: nextId("u"), unitId, spawnerId: sourceId, hp: 4, maxHp: 4, pos: { x: col, y: 0, z: row } });
  });

  const { cap, interval } = getBuildingDef("militia_camp").spawns;
  tickEconomy(interval * 10); // plenty of time for BOTH camps to fill

  const fromA = state.units.filter((u) => u.spawnerId === campA.id).length;
  const fromB = state.units.filter((u) => u.spawnerId === campB.id).length;
  assert.equal(fromA, cap, `camp A fielded its own cap (${cap})`);
  assert.equal(fromB, cap, `camp B fielded its own cap (${cap})`);
  assert.equal(state.units.length, cap * 2, "two camps => 2x cap total (independent counters)");
  ok("each spawner enforces its OWN per-building cap (two camps => cap each)");
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
  assert.notEqual(state.run.castleDown, true, "a wall death does not set castleDown (stays falsy)");

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

// ===========================================================================
// 7. Castle auto-fires (damage 1) like a defensive tower
// ===========================================================================
{
  freshRun();
  setTile(0, 0, TILE.GRASS);
  const castle = placeBuilding("castle", 0, 0);
  assert.ok(castle, "castle placed");
  const cdef = getBuildingDef("castle");
  assert.ok(cdef.attack && cdef.attack.damage === 1, "castle has an attack starting at damage 1");

  const enemy = { id: nextId("E"), enemyId: "raider", hp: 5, maxHp: 5, pos: { x: 2, y: 0, z: 0 } };
  state.enemies.push(enemy);

  let arrows = 0;
  let hits = 0;
  on("projectile-fire", () => arrows++);
  on("combat-hit", () => hits++);

  updateDefense(0.016); // cd starts at 0 → fires immediately
  assert.equal(enemy.hp, 5 - cdef.attack.damage, "castle shot the enemy for 1");
  assert.equal(arrows, 1, "castle emitted a projectile-fire (arrow)");
  assert.equal(hits, 1, "castle emitted a combat-hit");
  ok("castle auto-fires arrows at the nearest enemy (damage 1)");
}

clearAll();
console.log(`\nBuildings: ${passed} checks passed.`);
