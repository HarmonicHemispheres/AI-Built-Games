// ============================================================================
// main.js — bootstrap, the RAF game loop, scene switching, and camera controls.
// Integrator-owned. Subsystems are wired in here at wave boundaries; fan-out
// agents never edit this file.
// ============================================================================

import { state, SCENE, addResource } from "./state.js";
import { initScene, render, cameraApi, pick } from "./render/scene.js";
import { updateRun, registerSystems } from "./run.js";
import { runUpdaters, runRenderers } from "./loop.js";
import { loadSave, saveMeta } from "./persistence.js";
import { on } from "./util/events.js";
import { returnToMenu, refreshWorldMeshes } from "./app.js";
import { expandTo, canExpandTo } from "./world/expand.js";
// Wave 1 render/audio subsystems.
import { initFx, floatingNumber } from "./render/fx.js";
import { initAudio, playSfx } from "./audio/sfx.js";
import { initMusic, setMusicPhase } from "./audio/music.js";
// Wave 2 subsystems.
import { initHand } from "./cards/hand.js";
import { initDraft } from "./cards/draft.js";
import { initEconomy } from "./buildings/economy.js";
import { initDefense } from "./buildings/defense.js";
import { initPlacement } from "./buildings/place.js";
import { initUnitsLogic } from "./units/behavior.js";
import { initUnitsRender } from "./units/group.js";
import { initUpkeep } from "./units/upkeep.js";
import { initEnemiesLogic } from "./enemies/behavior.js";
import { initSpawner } from "./enemies/spawner.js";
import { initInput } from "./rts/input.js";
// Wave 3 UI (ui/* owned by the UI agent; integrator just initializes it here).
import { initUI } from "./ui/index.js";

// Map of scene id -> DOM element id, for show/hide.
const SCENE_DOM = {
  [SCENE.MENU]: "menu-scene",
  [SCENE.CONFIG]: "config-scene",
  [SCENE.DRAFT]: "draft-scene",
  [SCENE.OVER]: "result-scene",
  [SCENE.CARDS]: "cards-scene",
  [SCENE.STATS]: "stats-scene",
  [SCENE.SETTINGS]: "settings-scene",
};

let lastT = 0;
const MAX_DT = 0.05; // clamp huge frame gaps (tab switch)

function init() {
  loadSave();

  const canvas = document.getElementById("game-canvas");
  initScene(canvas);
  setupCameraControls(canvas);

  // Wave 1 render/audio subsystems.
  initFx();
  initAudio();
  initMusic();

  // Wave 2 subsystems self-register their logic systems / render reconcilers.
  initEconomy();
  initDefense();
  initPlacement();
  initUnitsLogic();
  initUnitsRender();
  initUpkeep();
  initEnemiesLogic();
  initSpawner();
  initHand();
  initDraft();
  initInput(canvas);
  setupExpansionInput(canvas);

  // Wave 3 UI layer.
  initUI();

  // Integrator-owned round systems: payout + tier from round number.
  registerSystems({ roundPayout, recomputeTier, save: saveMeta });

  // Fog-of-war: rebuild tile/fog meshes whenever a tile is revealed.
  on("tile-revealed", () => refreshWorldMeshes());

  // Reflect scene changes onto the DOM overlays + in-run HUD.
  on("scene-changed", ({ scene }) => applySceneDom(scene));
  applySceneDom(state.scene);

  // Audio reactions to the phase machine.
  on("phase-changed", ({ phase }) => setMusicPhase(phase === "attack" ? "combat" : "build"));
  on("wave-incoming", () => playSfx("klaxon"));

  // Logic emits combat-hit; the integrator renders the floating damage number.
  on("combat-hit", ({ x, z, amount, crit }) =>
    floatingNumber({ x, y: 0.8, z }, String(Math.round(amount)), crit ? 0xffd24a : 0xffffff),
  );

  // Records + persistence on game over.
  on("game-over", ({ round, kills }) => {
    state.records.totalRuns += 1;
    state.records.totalKills += kills;
    if (round > state.records.bestRound) state.records.bestRound = round;
    saveMeta();
  });

  // Boot to the main menu. The UI layer (Wave 3) drives menu → config →
  // app.startRun → run; until ui/* is wired, the menu scene is an empty shell.
  returnToMenu();

  requestAnimationFrame(loop);
}

// Resource + XP payout when an attack round is cleared (scaled by round).
function roundPayout(round) {
  addResource("gold", 10 + round * 5);
  addResource("wood", 8 + round * 3);
  addResource("food", 5 + round * 2);
  addResource("iron", round * 2);
  state.run.xp += round * 10;
}

// v1: tier from round number (T2 ~round 4). T3 cards are out of v1 scope.
function recomputeTier() {
  return state.run.round >= 8 ? 3 : state.run.round >= 4 ? 2 : 1;
}

function applySceneDom(scene) {
  for (const [sc, domId] of Object.entries(SCENE_DOM)) {
    const el = document.getElementById(domId);
    if (el) el.classList.toggle("hidden", sc !== scene);
  }
  const hud = document.getElementById("game-hud");
  if (hud) hud.classList.toggle("hidden", scene !== SCENE.RUN);
}

// --- Fog-of-war expansion clicks (integrator-owned) -------------------------
// RTS input ignores 'fog' picks; the integrator handles them. A clean left
// click (no drag) on a frontier fog tile spends gold to reveal it. Suppressed
// during building placement so the ghost owns the pointer.
function setupExpansionInput(canvas) {
  let placing = false;
  on("placement-begin", () => (placing = true));
  on("placement-end", () => (placing = false));

  let downX = 0;
  let downY = 0;
  let isLeftDown = false;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 0) {
      isLeftDown = true;
      downX = e.clientX;
      downY = e.clientY;
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (e.button !== 0 || !isLeftDown) return;
    isLeftDown = false;
    if (placing || state.scene !== SCENE.RUN) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // a drag, not a click
    const hit = pick(e);
    if (!hit || hit.kind !== "fog") return;
    const { col, row } = hit.tile;
    if (canExpandTo(col, row) && expandTo(col, row)) {
      playSfx("coin");
    }
  });
}

// --- Camera controls (integrator-owned; stable across waves) ----------------
// WASD / arrows pan, wheel zooms, Q/E snap-rotate, middle-drag pans. RTS
// left/right-click handling lands in Wave 2 (rts/input.js) — different file.

function setupCameraControls(canvas) {
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key.toLowerCase() === "q") cameraApi.rotateYaw(-1);
    if (e.key.toLowerCase() === "e") cameraApi.rotateYaw(1);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      cameraApi.zoomBy(Math.sign(e.deltaY) * 1.4);
    },
    { passive: false },
  );

  // Middle-button drag to pan.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) * 0.02;
    const dy = (e.clientY - lastY) * 0.02;
    lastX = e.clientX;
    lastY = e.clientY;
    cameraApi.panBy(-dx, dy);
  });
  const endDrag = () => (dragging = false);
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  // Per-frame WASD / edge pan, registered on the render loop.
  state._cameraKeys = keys;
}

function tickCameraKeys(dt) {
  const keys = state._cameraKeys;
  if (!keys) return;
  const speed = 12 * dt;
  let dx = 0;
  let dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy += speed;
  if (keys.has("s") || keys.has("arrowdown")) dy -= speed;
  if (keys.has("a") || keys.has("arrowleft")) dx -= speed;
  if (keys.has("d") || keys.has("arrowright")) dx += speed;
  if (dx || dy) cameraApi.panBy(dx, dy);
}

// --- The loop ---------------------------------------------------------------

function loop(t) {
  const raw = (t - lastT) / 1000 || 0;
  lastT = t;
  const dt = Math.min(raw, MAX_DT) * state.speed;

  tickCameraKeys(dt);
  runUpdaters(dt);
  updateRun(dt); // phase machine + gameplay logic
  runRenderers(dt); // sync meshes to state, advance fx
  render();

  requestAnimationFrame(loop);
}

window.addEventListener("DOMContentLoaded", init);
