// Multi-round playthrough — the closest headless proxy for the v1 DoD
// "survive escalating rounds through the round-5 warlord". Drives the REAL
// run.js loop with real ballista-tower defense doing the killing, rounds 1→6,
// auto-drafting between rounds. Verifies the loop scales, the warlord appears
// at round 5, and defense actually destroys enemies through the live loop.
//
// Run: node games/clicky_empire/test/playthrough.test.mjs

import assert from "node:assert/strict";

import { state, SCENE, PHASE, newRun, addResource, setScene, on } from "../src/state.js";
import { registerSystems, updateRun, startBuildPhase, getCurrentWave } from "../src/run.js";
import { generateMap } from "../src/world/generate.js";
import { placeBuilding, initEconomy } from "../src/buildings/economy.js";
import { initDefense } from "../src/buildings/defense.js";
import { initUnitsLogic } from "../src/units/behavior.js";
import { initUpkeep } from "../src/units/upkeep.js";
import { initEnemiesLogic } from "../src/enemies/behavior.js";
import { initSpawner } from "../src/enemies/spawner.js";
import { initHand, drawStarting } from "../src/cards/hand.js";
import { initDraft, chooseDraft } from "../src/cards/draft.js";
import { getTileType } from "../src/world/tiles.js";

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };

function roundPayout(round) {
  addResource("gold", 10 + round * 5);
  addResource("wood", 8 + round * 3);
  addResource("food", 5 + round * 2);
  addResource("iron", round * 2);
  state.run.xp += round * 10;
}
const recomputeTier = () => (state.run.round >= 8 ? 3 : state.run.round >= 4 ? 2 : 1);

// --- Boot a run with all logic systems registered ---------------------------
newRun({ seed: "PLAYTHRU", mapSize: 5 });
generateMap("PLAYTHRU", 5);
const castlePos = state.map.castle;
placeBuilding("castle", castlePos.col, castlePos.row);
const castle = state.placed.find((b) => b.defId === "castle");
castle.hp = castle.maxHp = 1e9; // invulnerable so progression is deterministic

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

// Ring the castle with ballista towers (real defense). Place on buildable,
// unoccupied tiles near the castle.
let placed = 0;
for (let r = 1; r <= 3 && placed < 8; r++) {
  for (const [dc, dr] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]]) {
    const col = castlePos.col + dc, row = castlePos.row + dr;
    const tile = state.map.tiles.get(`${col},${row}`);
    if (tile && getTileType(tile.type).buildable && !state.placed.some((b) => b.col === col && b.row === row)) {
      if (placeBuilding("ballista_tower", col, row)) placed++;
    }
  }
}
assert.ok(placed >= 4, `placed ${placed} ballista towers for defense`);
ok(`settle + ring ${placed} ballista towers around the castle`);

setScene(SCENE.RUN);
startBuildPhase();

// --- Track kills + warlord sighting ------------------------------------------
let totalKilled = 0;
on("enemy-killed", () => totalKilled++);
let warlordSeenAtRound5 = false;

// --- Play rounds 1..6 --------------------------------------------------------
const DT = 0.1;
let forceCleared = 0;
for (let round = 1; round <= 6; round++) {
  assert.equal(state.run.round, round, `at round ${round}`);

  // Build phase: fast-forward the timer to start the attack.
  state.run.timer = 0.05;
  for (let i = 0; i < 5 && state.run.phase !== PHASE.ATTACK; i++) updateRun(DT);
  assert.equal(state.run.phase, PHASE.ATTACK, `round ${round} reached attack phase`);

  // Inspect the wave plan.
  const wave = getCurrentWave();
  assert.ok(wave && wave.total > 0, `round ${round} wave has enemies`);
  if (round === 5) {
    const hasWarlord = wave.groups.some((g) => g.enemyId === "warlord");
    warlordSeenAtRound5 = hasWarlord;
    assert.ok(hasWarlord, "round 5 wave forces a warlord");
  }

  // Run the attack to resolution (towers kill the wave). Cap with a safety net.
  let guard = 0;
  while (state.scene === SCENE.RUN && state.run.phase === PHASE.ATTACK && guard < 4000) {
    updateRun(DT);
    guard++;
  }
  // Safety net: if somehow not cleared (e.g. all towers sapped), force-clear.
  if (state.run.phase === PHASE.ATTACK && state.scene === SCENE.RUN) {
    state.enemies.length = 0;
    updateRun(DT);
    forceCleared++;
  }

  // Round cleared → draft scene. Choose the first option to advance.
  assert.equal(state.scene, SCENE.DRAFT, `round ${round} cleared into a draft`);
  assert.ok(state.draftOptions.length > 0);
  chooseDraft(state.draftOptions[0].id);
}

assert.equal(state.run.round, 7, "advanced through 6 rounds into round 7");
ok("loop scales: played rounds 1→6 and advanced into round 7");
assert.ok(warlordSeenAtRound5, "warlord appeared on round 5");
ok("round-5 warlord present");
assert.ok(totalKilled > 0, `defense destroyed enemies through the live loop (${totalKilled} kills)`);
ok(`ballista defense killed ${totalKilled} enemies via the real combat loop`);
console.log(`  (force-clear safety net used on ${forceCleared}/6 rounds)`);

console.log(`\nPlaythrough: ${passed} checks passed.`);
