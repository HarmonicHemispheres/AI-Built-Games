// Wave 2 headless integration test — drives the REAL run.js phase machine
// through every pure-logic subsystem (world, buildings, units, enemies, cards),
// exactly as main.js wires them, minus the three/DOM render+input+audio layer.
// This is the end-to-end logic smoke for the full game loop.
//
// Run: node games/clicky_empire/test/integration.test.mjs

import assert from "node:assert/strict";

import {
  state,
  SCENE,
  PHASE,
  newRun,
  addResource,
  setScene,
  emit,
} from "../src/state.js";
import {
  registerSystems,
  updateRun,
  startBuildPhase,
} from "../src/run.js";
import { generateMap } from "../src/world/generate.js";
import { placeBuilding, initEconomy } from "../src/buildings/economy.js";
import { initDefense } from "../src/buildings/defense.js";
import { initUnitsLogic } from "../src/units/behavior.js";
import { initUpkeep } from "../src/units/upkeep.js";
import { initEnemiesLogic } from "../src/enemies/behavior.js";
import { initSpawner } from "../src/enemies/spawner.js";
import { initHand, drawStarting } from "../src/cards/hand.js";
import { initDraft, rollDraft, chooseDraft } from "../src/cards/draft.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };

// Integrator-owned round systems (mirrors main.js).
function roundPayout(round) {
  addResource("gold", 10 + round * 5);
  addResource("wood", 8 + round * 3);
  addResource("food", 5 + round * 2);
  addResource("iron", round * 2);
  state.run.xp += round * 10;
}
function recomputeTier() {
  return state.run.round >= 8 ? 3 : state.run.round >= 4 ? 2 : 1;
}

function bootRun(seed) {
  newRun({ seed, mapSize: 5 });
  generateMap(seed, state.run.mapSize);
  const c = state.map.castle;
  placeBuilding("castle", c.col, c.row);
  // Register every logic subsystem (the same set main.js registers, sans render).
  initEconomy();
  initDefense();
  initUnitsLogic();
  initUpkeep();
  initEnemiesLogic();
  initSpawner();
  initHand();
  initDraft();
  registerSystems({ roundPayout, recomputeTier, save: () => {} });
  drawStarting();
  setScene(SCENE.RUN);
  startBuildPhase();
  return c;
}

// --- 1. Settle ---------------------------------------------------------------
const castle = bootRun("INTEG1");
assert.equal(state.hand.length, 5, "opening hand of 5");
assert.ok(state.placed.find((b) => b.defId === "castle"), "castle placed");
assert.equal(state.run.phase, PHASE.BUILD);
ok("settle: map + castle + 5-card hand + build phase");

// --- 2. Build: spawn-unit event path (buildings/cards -> units listener) -----
const unitsBefore = state.units.length;
emit("spawn-unit", { unitId: "militia", col: castle.col + 1, row: castle.row });
assert.equal(state.units.length, unitsBefore + 1, "spawn-unit created a militia");
assert.equal(state.units[0].unitId, "militia");
ok("build: spawn-unit event creates a unit via the units listener");

// Make the castle effectively invulnerable so we can test the CLEAR path.
const castleInst = state.placed.find((b) => b.defId === "castle");
castleInst.hp = castleInst.maxHp = 1e9;

// --- 3. Build -> Attack transition -------------------------------------------
state.run.timer = 0.1;
updateRun(0.2); // times out the build phase
assert.equal(state.run.phase, PHASE.ATTACK, "attack phase started");
ok("phase machine: build timer triggers attack phase + wave built");

// --- 4. Attack: spawner spawns enemies over time -----------------------------
let maxEnemies = 0;
for (let i = 0; i < 80; i++) {
  updateRun(0.2);
  maxEnemies = Math.max(maxEnemies, state.enemies.length);
  if (state.scene !== SCENE.RUN) break; // safety
}
assert.ok(maxEnemies > 0, "the wave spawned enemies");
ok(`attack: spawner produced enemies (peak ${maxEnemies})`);

// --- 5. Clear the round (simulate the wave being destroyed) ------------------
const goldBefore = state.resources.gold;
const xpBefore = state.run.xp;
state.enemies.length = 0; // all enemies destroyed
updateRun(0.2); // allSpawned && no enemies -> clearRound
assert.ok(state.resources.gold > goldBefore, "round payout added gold");
assert.ok(state.run.xp > xpBefore, "round payout added xp");
assert.equal(state.scene, SCENE.DRAFT, "draft offered after clear");
assert.ok(state.draftOptions.length > 0 && state.draftOptions.length <= 3, "3-card draft");
ok("clear: payout (gold+xp) + draft scene with options");

// --- 6. Draft choice advances to the next round ------------------------------
const pick = state.draftOptions[0].id;
const handBefore = state.hand.length;
chooseDraft(pick);
assert.equal(state.run.round, 2, "advanced to round 2");
assert.equal(state.run.phase, PHASE.BUILD, "back to build phase");
assert.equal(state.scene, SCENE.RUN, "back to run scene");
assert.ok(state.meta.unlockedCards.includes(pick), "drafted card permanently unlocked");
assert.equal(state.hand.length, handBefore + 1, "drafted card added to hand");
ok("draft: choose -> unlock + hand += 1 + round 2 build phase");

// --- 7. Draft pool respects tier gating --------------------------------------
state.run.tier = 1;
const pool = rollDraft();
assert.ok(pool.every((c) => c.tier <= 1), "tier-1 run only drafts tier-1 cards");
ok("draft pool respects tier gate");

// --- 8. Loss path: castle down -> game over ----------------------------------
bootRun("INTEG2");
setScene(SCENE.RUN);
state.run.phase = PHASE.ATTACK;
state.run.castleDown = true;
updateRun(0.1);
assert.equal(state.scene, SCENE.OVER, "castle down triggers game over");
ok("loss: castleDown -> game over scene");

console.log(`\nIntegration: ${passed} checks passed.`);
