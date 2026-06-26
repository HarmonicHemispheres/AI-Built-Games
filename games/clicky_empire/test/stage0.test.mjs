// Stage 0 verification — imports every node-safe foundation module and asserts
// the core contracts hold. Run: `node games/clicky_empire/test/stage0.test.mjs`
// (Render modules scene.js/main.js need a browser and are smoke-tested there.)

import assert from "node:assert/strict";

import { on, emit, clearAll } from "../src/util/events.js";
import { makeRng, randSeedString } from "../src/util/rng.js";
import { tileToWorld, worldToTile, clamp, lerp, manhattan } from "../src/util/math.js";
import {
  state,
  SCENE,
  PHASE,
  BASE_STATS,
  newRun,
  addResource,
  canAfford,
  spend,
  setScene,
} from "../src/state.js";
import { registerSystems, updateRun, startBuildPhase } from "../src/run.js";
import { onRender, runRenderers } from "../src/loop.js";
import { getCard, cardsAtOrBelowTier } from "../src/cards/catalog.js";
import { getUnitDef } from "../src/units/catalog.js";
import { getEnemyDef } from "../src/enemies/catalog.js";
import { getTileType, TILE } from "../src/world/tiles.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// --- events ---
let got = null;
const offFn = on("resource-changed", (p) => (got = p));
emit("resource-changed", { type: "gold", amount: 5, total: 5 });
assert.deepEqual(got, { type: "gold", amount: 5, total: 5 });
offFn();
ok("events on/emit/off");

// --- rng determinism ---
const a = makeRng("SEED1");
const b = makeRng("SEED1");
const c = makeRng("SEED2");
const seqA = [a.next(), a.next(), a.next()];
const seqB = [b.next(), b.next(), b.next()];
assert.deepEqual(seqA, seqB, "same seed -> same stream");
assert.notDeepEqual(seqA, [c.next(), c.next(), c.next()], "diff seed -> diff stream");
assert.ok(seqA.every((x) => x >= 0 && x < 1));
ok("rng deterministic + bounded");

const seedStr = randSeedString(makeRng("S"));
assert.match(seedStr, /^[A-Z0-9]{6}$/);
ok("randSeedString format");

// --- math ---
const w = tileToWorld(3, 5);
assert.deepEqual(w, { x: 3, y: 0, z: 5 });
assert.deepEqual(worldToTile(3.1, 4.9), { col: 3, row: 5 });
assert.equal(clamp(12, 0, 10), 10);
assert.equal(lerp(0, 10, 0.5), 5);
assert.equal(manhattan({ col: 0, row: 0 }, { col: 2, row: 3 }), 5);
ok("math grid<->world + scalars");

// --- state lifecycle ---
newRun({ seed: "ABC123", mapSize: 5 });
assert.equal(state.run.round, 1);
assert.equal(state.run.phase, PHASE.BUILD);
assert.equal(state.run.mapSize, 5);
assert.deepEqual(state.playerStats, BASE_STATS);
addResource("gold", 30);
assert.equal(state.resources.gold, 30);
assert.equal(canAfford({ gold: 20 }), true);
assert.equal(canAfford({ gold: 99 }), false);
assert.equal(spend({ gold: 20 }), true);
assert.equal(state.resources.gold, 10);
assert.equal(spend({ gold: 999 }), false, "unaffordable spend is a no-op");
assert.equal(state.resources.gold, 10);
ok("state newRun + resources + spend");

// --- run phase machine (no-op systems shouldn't throw) ---
let economyTicks = 0;
registerSystems({ tickEconomy: () => economyTicks++ });
setScene(SCENE.RUN);
startBuildPhase();
const t0 = state.run.timer;
updateRun(0.5); // half a second of build phase
assert.ok(state.run.timer < t0, "build timer counts down");
assert.ok(economyTicks > 0, "economy ticked during build");
ok("run phase machine advances build timer");

// --- loop registry ---
let rendered = 0;
onRender(() => rendered++);
runRenderers(0.016);
assert.equal(rendered, 1);
ok("loop render registry");

// --- catalogs (Stage 0 seed entries) ---
assert.ok(getCard("lumber_camp"), "lumber_camp card exists");
assert.ok(cardsAtOrBelowTier(1).length >= 1);
assert.ok(getUnitDef("militia"), "militia unit exists");
assert.equal(getUnitDef("militia").hp, 4);
assert.ok(getEnemyDef("raider"), "raider enemy exists");
assert.equal(getTileType(TILE.WATER).walkable, false);
assert.equal(getTileType(TILE.GRASS).buildable, true);
ok("catalogs + tiles seed entries");

clearAll();
console.log(`\nStage 0: ${passed} checks passed.`);
