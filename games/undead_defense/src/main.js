// Bootstrap, game loop, scene wiring.

import { state, SCENE, setScene, newRun, MAP_W, MAP_H } from "./state.js";
import { loadSave, saveMeta } from "./persistence.js";
import { randSeedString } from "./util/rng.js";
import { generateMap } from "./map/generate.js";
import { updateUnits } from "./units/behavior.js";
import { updateZombies } from "./zombies/behavior.js";
import { buildWavePlan, startWave, updateSpawner, waveComplete } from "./zombies/spawner.js";
import { updateProjectiles } from "./combat/projectiles.js";
import { updateParticles } from "./render/particles.js";
import { initCanvas, renderFrame } from "./render/canvas.js";
import { initInput, tickInput } from "./rts/input.js";
import { centerCamera } from "./rts/camera.js";
import { updateHUD, showWaveBanner } from "./ui/hud.js";
import { initMenu, renderMenu } from "./ui/menu.js";
import { showDeckSelect, renderHand, showDraft } from "./ui/cards.js";
import { showResult } from "./ui/overlays.js";
import { prepTimeBonus } from "./upgrades/apply.js";
import { resumeAudio, playSfx } from "./audio/sfx.js";
import { on } from "./util/events.js";

const $ = (sel) => document.querySelector(sel);

let lastT = 0;

function init() {
  loadSave();
  const canvas = document.getElementById("game-canvas");
  initCanvas(canvas);
  initInput(canvas);
  initMenu({ onNewRun: startNewRun });

  // Button wiring for in-game HUD.
  $("#btn-end-prep").onclick = () => {
    playSfx("click");
    if (state.scene === SCENE.PREP) startCombat();
  };
  $("#btn-speed").onclick = () => {
    state.speed = state.speed === 1 ? 2 : 1;
    $("#btn-speed").textContent = `${state.speed}x`;
  };

  // Audio bootstrap on first interaction (browser policy).
  document.addEventListener("pointerdown", () => { resumeAudio(); }, { once: true });

  // Re-render hand on state changes.
  on("hand-changed", () => renderHand());

  setScene(SCENE.MENU);
  renderMenu();
  requestAnimationFrame(loop);
}

function startNewRun() {
  showDeckSelect((deck) => {
    const seed = randSeedString();
    newRun(seed, deck);
    state.map = generateMap(seed, state.run.act);
    centerCamera();
    setScene(SCENE.PREP);
    state.prep.timeLeft = 30 + prepTimeBonus(state.run);
    renderHand();
    showWaveBanner(`ROUND ${state.run.round}`);
  });
}

function startCombat() {
  setScene(SCENE.COMBAT);
  const isBoss = state.run.round >= state.run.maxRounds;
  const plan = buildWavePlan(state.run.round, isBoss);
  startWave(plan);
  showWaveBanner("WAVE INCOMING");
  playSfx("wave");
}

function endRound(victory) {
  if (!victory) {
    // Containment lost mid-combat.
    finishRun(false);
    return;
  }
  // Persist best-round + unlock cards drawn.
  state.meta.bestRound = Math.max(state.meta.bestRound, state.run.round);
  for (const id of state.run.deck) {
    if (!state.meta.unlockedCards.includes(id)) state.meta.unlockedCards.push(id);
  }
  saveMeta();

  if (state.run.round >= state.run.maxRounds) {
    // Won the act!
    state.run.bossDefeated = true;
    finishRun(true);
    return;
  }

  // Offer an upgrade draft, then next round.
  setScene(SCENE.DRAFT);
  showDraft(() => {
    state.run.round++;
    // Reset hand for new prep.
    state.run.handUsed.clear();
    // Regenerate map for next round (procedural progression).
    state.map = generateMap(state.run.seed + "-r" + state.run.round, state.run.act);
    // Heal a tiny bit for surviving the round.
    state.run.containment = Math.min(150, state.run.containment + 5);
    setScene(SCENE.PREP);
    state.prep.timeLeft = 30 + prepTimeBonus(state.run);
    state.units = [];
    state.zombies = [];
    state.projectiles = [];
    state.selection.clear();
    centerCamera();
    renderHand();
    showWaveBanner(`ROUND ${state.run.round}`);
  });
}

function finishRun(victory) {
  setScene(SCENE.RESULT);
  saveMeta();
  showResult(victory, () => {
    state.run = null;
    state.map = null;
    state.units = [];
    state.zombies = [];
    state.projectiles = [];
    state.particles = [];
    state.floatingText = [];
    state.selection.clear();
    setScene(SCENE.MENU);
    renderMenu();
  });
}

function loop(t) {
  const dtRaw = Math.min(0.05, (t - lastT) / 1000) || 0;
  lastT = t;
  state.now += dtRaw;

  const speed = state.paused ? 0 : (state.scene === SCENE.COMBAT ? state.speed : 1);
  const dt = dtRaw * speed;

  tickInput(dtRaw);

  if (state.scene === SCENE.PREP) {
    state.prep.timeLeft -= dtRaw;
    if (state.prep.timeLeft <= 0) {
      startCombat();
    }
  }
  if (state.scene === SCENE.COMBAT) {
    updateSpawner(dt);
    updateUnits(dt);
    updateZombies(dt);
    updateProjectiles(dt);

    if (state.run.containment <= 0) {
      endRound(false);
    } else if (waveComplete()) {
      endRound(true);
    }
  }
  updateParticles(dtRaw);

  renderFrame();
  updateHUD();
  renderMenu();

  requestAnimationFrame(loop);
}

init();
