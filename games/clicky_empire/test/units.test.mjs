// ============================================================================
// units.test.mjs — W2-Units verification (node, deterministic asserts).
// Run: node games/clicky_empire/test/units.test.mjs
//
// Covers:
//   - createUnit pushes a correct instance (CONTRACTS §10/§14).
//   - a `spawn-unit` event creates a unit after initUnitsLogic().
//   - updateUnits moves a unit toward a move order and stops on arrival.
//   - an attack order damages an in-range enemy fixture (seeded state.enemies).
//   - upkeep deducts food and deserts lowest-tier first when food is short.
//
// PURE-LOGIC only — no three (group.js is harness/browser-tested).
// ============================================================================

import assert from "node:assert/strict";

import { state, newRun, addResource } from "../src/state.js";
import { on, emit, clearAll } from "../src/util/events.js";
import { getUnitDef } from "../src/units/catalog.js";
import { tileToWorld, tileKey, distXZ } from "../src/util/math.js";
import { TILE_TYPES, TILE } from "../src/world/tiles.js";

import {
  createUnit,
  updateUnits,
  initUnitsLogic,
} from "../src/units/behavior.js";
import { applyUpkeep } from "../src/units/upkeep.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// --- Helpers ---------------------------------------------------------------

// Lay down a revealed grass square so findPath/isWalkable work for movement.
function seedGrassMap(minC, maxC, minR, maxR) {
  const grass = TILE_TYPES[TILE.GRASS];
  for (let c = minC; c <= maxC; c++) {
    for (let r = minR; r <= maxR; r++) {
      const key = tileKey(c, r);
      state.map.tiles.set(key, { col: c, row: r, ...grass });
      state.map.revealed.add(key);
    }
  }
}

function freshRun() {
  newRun({ seed: "UNITTEST", mapSize: 5 });
  clearAll();
}

// Minimal enemy fixture (membership in state.enemies marks it as an enemy so
// combat.applyDamage emits enemy-killed appropriately).
function mkEnemy(id, hp, col, row, def = { id: "raider", damage: 1 }) {
  return {
    id,
    enemyId: def.id,
    def,
    hp,
    maxHp: hp,
    pos: tileToWorld(col, row),
    group: null,
  };
}

// ---------------------------------------------------------------------------
// 1) createUnit pushes a correct instance.
// ---------------------------------------------------------------------------
freshRun();
seedGrassMap(-2, 2, -2, 2);
{
  const before = state.units.length;
  const u = createUnit("militia", 1, 1);
  const def = getUnitDef("militia");
  assert.ok(u, "createUnit returns the instance");
  assert.equal(state.units.length, before + 1, "pushed to state.units");
  assert.equal(state.units[state.units.length - 1], u, "pushed instance is the returned one");
  assert.equal(u.unitId, "militia");
  assert.equal(u.def, def, "def is the catalog def");
  assert.deepEqual(u.pos, tileToWorld(1, 1), "pos = tileToWorld(col,row)");
  assert.equal(u.hp, def.hp, "hp seeded from def.hp");
  assert.equal(u.maxHp, def.hp, "maxHp seeded from def.hp");
  assert.equal(u.stance, "defensive", "default stance");
  assert.equal(u.order, null, "no initial order");
  assert.equal(u.attackCd, 0, "attackCd starts at 0");
  assert.equal(u.group, null, "group starts null (render fills it)");
  assert.match(u.id, /^u\d+$/, "id has the 'u' prefix");
}
ok("createUnit pushes a correct instance");

// ---------------------------------------------------------------------------
// 2) a spawn-unit event creates a unit after initUnitsLogic().
// ---------------------------------------------------------------------------
freshRun();
seedGrassMap(-2, 2, -2, 2);
initUnitsLogic(); // registers updateUnits + listens for spawn-unit
{
  const before = state.units.length;
  emit("spawn-unit", { unitId: "spearman", col: 0, row: 0 });
  assert.equal(state.units.length, before + 1, "spawn-unit created a unit");
  const u = state.units[state.units.length - 1];
  assert.equal(u.unitId, "spearman");
  assert.deepEqual(u.pos, tileToWorld(0, 0));

  // An unknown unitId must be ignored (no crash, no phantom unit).
  emit("spawn-unit", { unitId: "does_not_exist", col: 0, row: 0 });
  assert.equal(state.units.length, before + 1, "unknown unitId ignored");
}
ok("spawn-unit event creates a unit (after initUnitsLogic)");

// ---------------------------------------------------------------------------
// 3) updateUnits moves a unit toward a move order and stops on arrival.
// ---------------------------------------------------------------------------
freshRun();
seedGrassMap(0, 6, 0, 0); // a straight 1-row corridor
{
  const u = createUnit("militia", 0, 0);
  const goal = { col: 5, row: 0 };
  u.order = { type: "move", tile: goal };
  const goalWorld = tileToWorld(goal.col, goal.row);

  const startDist = distXZ(u.pos, goalWorld);
  // One tick should move it strictly closer (moveSpeed > 0).
  updateUnits(0.1);
  assert.ok(distXZ(u.pos, goalWorld) < startDist, "moved closer after one tick");
  assert.ok(u.order, "order persists while en route");

  // Run enough ticks (dt large) to arrive. 6 tiles / 2.2 tiles/s ~= 2.7s.
  let guard = 0;
  while (u.order && guard < 1000) {
    updateUnits(0.1);
    guard++;
  }
  assert.equal(u.order, null, "order cleared on arrival");
  assert.ok(distXZ(u.pos, goalWorld) <= 0.05, "snapped to goal tile center");
  assert.ok(guard < 1000, "arrived in bounded ticks");
}
ok("updateUnits moves toward a move order and stops on arrival");

// ---------------------------------------------------------------------------
// 4) an attack order damages an in-range enemy fixture.
// ---------------------------------------------------------------------------
freshRun();
seedGrassMap(-1, 3, -1, 1);
{
  // Militia at (0,0); enemy 0.5 tiles away (within militia range 0.9).
  const u = createUnit("militia", 0, 0);
  const enemy = mkEnemy("E1", 5, 0, 0);
  enemy.pos = { x: 0.5, y: 0, z: 0 }; // half a tile away -> in range
  state.enemies.push(enemy);

  u.order = { type: "attack", targetId: "E1" };

  const hpBefore = enemy.hp;
  // First tick: attackCd is 0, so it should land a hit immediately.
  let combatHit = null;
  on("combat-hit", (p) => (combatHit = p));

  updateUnits(0.1);
  assert.ok(enemy.hp < hpBefore, "in-range enemy took damage");
  assert.equal(hpBefore - enemy.hp, getUnitDef("militia").damage, "dealt def.damage");
  assert.ok(u.attackCd > 0, "attack cooldown set after a hit");
  assert.ok(combatHit && combatHit.amount === getUnitDef("militia").damage, "combat-hit emitted");

  // Cooldown gates the next hit: an immediate tiny tick deals no further damage.
  const hpMid = enemy.hp;
  updateUnits(0.01);
  assert.equal(enemy.hp, hpMid, "no second hit while on cooldown");

  // Kill it off and confirm the order clears (target gone).
  enemy.hp = 1;
  // advance enough time to clear cooldown then hit
  updateUnits(2.0);
  assert.ok(enemy.hp <= 0, "enemy killed");
  // Remove the dead enemy from the array (logic owner = enemies module; here we
  // simulate it) then tick: the attack order should clear since target is gone.
  state.enemies.length = 0;
  updateUnits(0.1);
  assert.equal(u.order, null, "attack order cleared when target is gone");
}
ok("attack order damages an in-range enemy");

// ---------------------------------------------------------------------------
// 5) upkeep deducts food and deserts lowest-tier first when food is short.
// ---------------------------------------------------------------------------

// 5a) Enough food: deducts total, no desertion.
freshRun();
{
  createUnit("militia", 0, 0); // foodCost 1
  createUnit("spearman", 0, 0); // foodCost 2
  addResource("food", 10);
  const r = applyUpkeep();
  assert.equal(r.deserted, 0, "no desertion when food covers upkeep");
  assert.equal(state.units.length, 2, "both units survive");
  assert.equal(state.resources.food, 10 - 3, "deducted total upkeep (1+2)");
}
ok("upkeep deducts food when affordable (no desertion)");

// 5b) Short food: desert lowest-tier (lowest foodCost) first until affordable.
freshRun();
{
  // 2 militia (foodCost 1 each, tier-1) + 1 spearman (foodCost 2, tier-2).
  // Total upkeep = 1 + 1 + 2 = 4. We give only 2 food.
  const m1 = createUnit("militia", 0, 0);
  const m2 = createUnit("militia", 0, 0);
  const sp = createUnit("spearman", 0, 0);
  addResource("food", 2);

  const r = applyUpkeep();

  // Lowest-tier (militia, foodCost 1) desert first. Removing both militia
  // (-2 upkeep) leaves the spearman alone (upkeep 2), which fits food=2.
  assert.ok(r.deserted >= 1, "at least one unit deserted");
  assert.ok(
    !state.units.includes(m1) || !state.units.includes(m2),
    "a militia (lowest tier) deserted before the spearman",
  );
  assert.ok(state.units.includes(sp), "the higher-tier spearman is kept");
  assert.equal(state.units.length, 1, "exactly the spearman remains");

  // Remaining upkeep (2) is deducted, food clamped >= 0.
  assert.equal(state.resources.food, 0, "food deducted to cover survivor upkeep");
  assert.ok(state.resources.food >= 0, "food never negative");
}
ok("upkeep deserts lowest-tier first when food is short");

// 5c) Even with zero food, desertion drives upkeep to what's affordable (0).
freshRun();
{
  createUnit("militia", 0, 0);
  createUnit("spearman", 0, 0);
  // food = 0
  const r = applyUpkeep();
  assert.equal(state.units.length, 0, "all units desert when there is no food");
  assert.equal(state.resources.food, 0, "food stays at 0");
  assert.equal(r.deducted, 0, "nothing to deduct after full desertion");
}
ok("upkeep deserts everyone when food is zero");

clearAll();
console.log(`\nUnits (W2): ${passed} checks passed.`);
