// Enemies verification — spawner (wave composition + timed spawning) and
// behavior (createEnemy, AI movement toward castle, sapper building-priority,
// death reward/kills/removal). Pure-logic, deterministic.
// Run: `node games/clicky_empire/test/enemies.test.mjs`

import assert from "node:assert/strict";

import { state, newRun } from "../src/state.js";
import { clearAll, on } from "../src/util/events.js";
import { generateMap } from "../src/world/generate.js";
import { getEnemyDef } from "../src/enemies/catalog.js";
import { tileToWorld, distXZ, worldToTile } from "../src/util/math.js";
import { createEnemy, updateEnemies } from "../src/enemies/behavior.js";
import { buildWave, startWave, updateSpawner, _getSchedule } from "../src/enemies/spawner.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// Helper: fresh run + map so pathfind has a board. Returns the castle tile.
function freshRun(seed = "ENEMYSEED", size = 5) {
  newRun({ seed, mapSize: size });
  generateMap(seed, size);
  return state.map.castle;
}

// ---------------------------------------------------------------------------
// createEnemy: pushes a correct instance (CONTRACTS §10 shape)
// ---------------------------------------------------------------------------
{
  freshRun();
  const before = state.enemies.length;
  const e = createEnemy("raider", 2, 1);
  assert.equal(state.enemies.length, before + 1, "createEnemy pushes to state.enemies");
  assert.equal(state.enemies[state.enemies.length - 1], e, "returned instance is the pushed one");
  assert.equal(e.enemyId, "raider");
  assert.equal(e.def, getEnemyDef("raider"));
  assert.deepEqual(e.pos, tileToWorld(2, 1), "pos = tileToWorld(col,row)");
  assert.equal(e.hp, getEnemyDef("raider").hp);
  assert.equal(e.maxHp, getEnemyDef("raider").hp);
  assert.equal(e.path, null);
  assert.equal(e.target, null);
  assert.equal(e.attackCd, 0);
  assert.equal(e.group, null, "group is null (render attaches mesh)");
  assert.match(e.id, /^e\d+$/, "id has the 'e' prefix");
  ok("createEnemy builds a correct §10 instance and pushes it");
}

// ---------------------------------------------------------------------------
// buildWave: deterministic per seed+round, grows with round, forces warlord @ r5
// ---------------------------------------------------------------------------
{
  freshRun("WAVESEED", 5);

  // Determinism: same seed + round -> identical plan.
  const a = buildWave(3);
  const b = buildWave(3);
  assert.deepEqual(a, b, "buildWave deterministic for a given seed+round");

  // Different seed -> (very likely) different plan; at minimum still valid.
  newRun({ seed: "OTHERSEED", mapSize: 5 });
  generateMap("OTHERSEED", 5);
  const c = buildWave(3);
  assert.ok(c.total >= 1 && Array.isArray(c.groups), "other seed yields a valid plan");

  // Grows with round: total at a high round > total at a low round (same seed).
  newRun({ seed: "GROW", mapSize: 5 });
  generateMap("GROW", 5);
  const r1 = buildWave(1);
  const r8 = buildWave(8);
  assert.ok(r8.total > r1.total, `wave grows with round (r1=${r1.total} < r8=${r8.total})`);

  // total equals the sum of group counts.
  const sum = (p) => p.groups.reduce((n, g) => n + g.count, 0);
  assert.equal(r1.total, sum(r1), "total matches summed group counts (r1)");
  assert.equal(r8.total, sum(r8), "total matches summed group counts (r8)");
  ok("buildWave is deterministic and grows with round");

  // Early rounds are mostly raiders/wolves; no skirmisher/sapper before round 4.
  const ids1 = new Set(r1.groups.map((g) => g.enemyId));
  assert.ok(ids1.has("raider"), "round 1 contains raiders");
  assert.ok(!ids1.has("skirmisher") && !ids1.has("sapper"), "no skirmisher/sapper at round 1");

  // Skirmisher & sapper become eligible at round 4 (check across the roster).
  newRun({ seed: "ROSTER", mapSize: 5 });
  generateMap("ROSTER", 5);
  const r4 = buildWave(4);
  const ids4 = new Set(r4.groups.map((g) => g.enemyId));
  // At least one of the new types should be permitted in the round-4 roster.
  // (Deterministic, but to keep the assertion robust we check the roster gate by
  // confirming r4 may include them while r1 cannot — sample a couple seeds.)
  let sawNewType = ids4.has("skirmisher") || ids4.has("sapper");
  if (!sawNewType) {
    for (const s of ["A", "B", "C", "D", "E"]) {
      newRun({ seed: s, mapSize: 5 });
      generateMap(s, 5);
      const w = buildWave(4);
      const ids = new Set(w.groups.map((g) => g.enemyId));
      if (ids.has("skirmisher") || ids.has("sapper")) {
        sawNewType = true;
        break;
      }
    }
  }
  assert.ok(sawNewType, "skirmisher/sapper enter from round 4");
  ok("composition shifts by round (raiders/wolves early; skirm/sapper ~r4)");

  // Warlord FORCED on round 5 (and not before).
  for (const s of ["X", "Y", "Z", "Q", "W"]) {
    newRun({ seed: s, mapSize: 5 });
    generateMap(s, 5);
    const w5 = buildWave(5);
    const ids5 = w5.groups.map((g) => g.enemyId);
    assert.ok(ids5.includes("warlord"), `round 5 forces a warlord (seed ${s})`);
    const wl = w5.groups.find((g) => g.enemyId === "warlord");
    assert.equal(wl.count, 1, "exactly one warlord on round 5");

    const w4 = buildWave(4);
    assert.ok(
      !w4.groups.some((g) => g.enemyId === "warlord"),
      `round 4 has no warlord (seed ${s})`,
    );
  }
  ok("warlord is FORCED on round 5 (and absent on round 4)");
}

// ---------------------------------------------------------------------------
// startWave + updateSpawner: spawns `total` enemies, returns true when drained
// ---------------------------------------------------------------------------
{
  freshRun("SPAWN", 5);
  const plan = buildWave(2);
  startWave(plan);

  const sched = _getSchedule();
  assert.ok(sched && Array.isArray(sched.queue), "startWave stores a schedule queue");
  assert.equal(sched.queue.length, plan.total, "queue length == plan.total");

  // Spawn tiles are revealed walkable edge tiles.
  for (const item of sched.queue) {
    const tile = state.map.tiles.get(`${item.col},${item.row}`);
    assert.ok(tile && tile.walkable, "spawn tile is walkable");
    assert.ok(state.map.revealed.has(`${item.col},${item.row}`), "spawn tile is revealed");
  }

  // Drain over time; should not finish on the first tiny tick (interval > 0),
  // and must eventually return true once all `total` are spawned.
  let done = false;
  let spawnedTotal = 0;
  const startCount = state.enemies.length;
  for (let i = 0; i < 500 && !done; i++) {
    done = updateSpawner(0.4);
  }
  spawnedTotal = state.enemies.length - startCount;
  assert.equal(done, true, "updateSpawner returns true once the queue is empty");
  assert.equal(spawnedTotal, plan.total, `spawned exactly plan.total (${plan.total}) enemies`);
  assert.equal(_getSchedule().queue.length, 0, "queue fully drained");
  ok("updateSpawner spawns total enemies over time then returns true");
}

// ---------------------------------------------------------------------------
// updateEnemies: moves an enemy toward the castle
// ---------------------------------------------------------------------------
{
  const castle = freshRun("MOVE", 5);
  // Place an enemy at an edge tile far from the castle.
  const startCol = castle.col + 2;
  const startRow = castle.row + 2;
  const e = createEnemy("raider", startCol, startRow);
  const castleWorld = tileToWorld(castle.col, castle.row);
  const dBefore = distXZ(e.pos, castleWorld);

  // No buildings/units present yet -> it should march toward the castle tile.
  for (let i = 0; i < 30; i++) updateEnemies(0.1);
  const dAfter = distXZ(e.pos, castleWorld);
  assert.ok(dAfter < dBefore, `enemy moved toward castle (${dBefore.toFixed(2)} -> ${dAfter.toFixed(2)})`);
  ok("updateEnemies moves an enemy toward the castle");
}

// ---------------------------------------------------------------------------
// Sapper prioritizes a building fixture over a unit
// ---------------------------------------------------------------------------
{
  const castle = freshRun("SAPPER", 7);

  // A building fixture (NOT the castle) and a unit fixture, both adjacent to the
  // sapper so it is immediately "in range" of whatever it targets.
  const bCol = castle.col + 1;
  const bRow = castle.row;
  const building = {
    id: "b_test",
    defId: "palisade",
    col: bCol,
    row: bRow,
    pos: tileToWorld(bCol, bRow),
    hp: 999, // tanky enough to survive the test window so it stays the target
    maxHp: 999,
    group: null,
  };
  const uCol = castle.col - 1;
  const uRow = castle.row;
  const unit = {
    id: "u_test",
    unitId: "militia",
    def: getUnitDefStub(),
    pos: tileToWorld(uCol, uRow),
    hp: 4,
    maxHp: 4,
    group: null,
  };
  state.placed.push(building);
  state.units.push(unit);

  // Sapper sits right next to BOTH (equidistant-ish); it must choose the building.
  const e = createEnemy("sapper", castle.col, castle.row);
  // Re-position the sapper exactly between them by placing it on the building tile
  // neighbour so the unit and building are both within range.
  e.pos = tileToWorld(bCol, bRow); // on top of building -> definitely in range
  const unitHpBefore = unit.hp;
  const buildingHpBefore = building.hp;

  // Tick enough for the cooldown to elapse and a hit to land.
  for (let i = 0; i < 20; i++) updateEnemies(0.2);

  assert.equal(e.target, building, "sapper targets the building, not the unit");
  assert.ok(building.hp < buildingHpBefore, "sapper damaged the building");
  assert.equal(unit.hp, unitHpBefore, "sapper ignored the unit while a building stood");
  ok("sapper prioritizes a building fixture over a unit");
}

// ---------------------------------------------------------------------------
// Enemy death drops reward (gold) + increments kills + removes from state
// ---------------------------------------------------------------------------
{
  freshRun("DEATH", 5);
  state.meta.renown = 0;

  // Warlord drops { gold:50, renown:5 } — covers both gold and renown paths.
  const wl = createEnemy("warlord", state.map.castle.col + 1, state.map.castle.row);
  const goldBefore = state.resources.gold;
  const renownBefore = state.meta.renown;
  const killsBefore = state.run.kills;

  let killedEvent = null;
  const off = on("enemy-killed", (p) => (killedEvent = p));

  // Drain its hp to 0, then let updateEnemies reap it (drops reward + removes).
  wl.hp = 0;
  updateEnemies(0.1);

  assert.equal(state.enemies.includes(wl), false, "dead enemy removed from state.enemies");
  assert.equal(state.resources.gold, goldBefore + 50, "gold reward dropped");
  assert.equal(state.meta.renown, renownBefore + 5, "renown reward dropped to state.meta");
  assert.equal(state.run.kills, killsBefore + 1, "state.run.kills incremented");
  off();
  void killedEvent; // enemy-killed is emitted by combat.applyDamage on the lethal hit
  ok("enemy death drops gold+renown, increments kills, removes from state");
}

// ---------------------------------------------------------------------------
// done
// ---------------------------------------------------------------------------
clearAll();
console.log(`\nEnemies: ${passed} checks passed.`);

// A minimal unit-def stub (we don't import units/catalog to keep this test from
// depending on it; behavior only reads target.hp/pos for units).
function getUnitDefStub() {
  return { id: "militia", name: "Militia", hp: 4, damage: 1, range: 1, attackSpeed: 1, moveSpeed: 1, tags: ["MELEE"], foodCost: 1, color: 0x4477cc };
}
