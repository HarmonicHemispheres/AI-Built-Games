// ============================================================================
// main.js — bootstrap, the RAF game loop, scene switching, and camera controls.
// Integrator-owned. Subsystems are wired in here at wave boundaries; fan-out
// agents never edit this file.
// ============================================================================

import { state, SCENE, setScene, newRun, addResource } from "./state.js";
import { initScene, render, cameraApi, layers } from "./render/scene.js";
import { updateRun, registerSystems } from "./run.js";
import { runUpdaters, runRenderers } from "./loop.js";
import { loadSave, saveMeta } from "./persistence.js";
import { makeRng, randSeedString } from "./util/rng.js";
import { on } from "./util/events.js";
// Wave 1 subsystems wired by the integrator.
import { generateMap } from "./world/generate.js";
import { frontier } from "./world/expand.js";
import { buildTileMesh, buildFogMesh } from "./render/meshes.js";
import { initFx, floatingNumber } from "./render/fx.js";
import { initAudio, playSfx } from "./audio/sfx.js";
import { initMusic, setMusicPhase } from "./audio/music.js";
// Wave 2 subsystems.
import { initHand, drawStarting } from "./cards/hand.js";
import { initDraft } from "./cards/draft.js";
import { initEconomy, placeBuilding } from "./buildings/economy.js";
import { initDefense } from "./buildings/defense.js";
import { initPlacement } from "./buildings/place.js";
import { initUnitsLogic } from "./units/behavior.js";
import { initUnitsRender } from "./units/group.js";
import { initUpkeep } from "./units/upkeep.js";
import { initEnemiesLogic } from "./enemies/behavior.js";
import { initSpawner } from "./enemies/spawner.js";
import { initInput } from "./rts/input.js";

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

  // Integrator-owned round systems: payout + tier from round number.
  registerSystems({ roundPayout, recomputeTier, save: saveMeta });

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

  // Stage 1 has no menu UI yet (Wave 3). Boot straight into a demo run so the
  // full systems loop is exercisable. Wave 3 replaces this with the real
  // menu → config → run flow.
  bootDemoRun();

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

// Temporary Stage-1 entry: generate a seeded map, build its meshes, drop the
// castle, and center the camera. Verifies World + Render + scene together.
// Wave 3 replaces this with the menu/config flow.
function bootDemoRun() {
  const seed = randSeedString(makeRng(String(performance.now())));
  newRun({ seed, mapSize: 5 });
  state.run.startedAt = Date.now();

  generateMap(seed, state.run.mapSize);
  buildMapMeshes();

  // The castle is a real building instance (lose condition). The placement
  // reconciler (buildings/place.js) builds its mesh on the next frame.
  const c = state.map.castle ?? { col: 0, row: 0 };
  placeBuilding("castle", c.col, c.row);

  // Deal the opening hand of 5 tier-1 cards.
  drawStarting();

  cameraApi.centerOn(c.col, c.row);
  setScene(SCENE.RUN);
}

// Build meshes for every revealed tile and the frontier fog. Buildings/units/
// enemies are rendered by their own reconcilers; the castle is created as a
// logic instance in bootDemoRun.
function buildMapMeshes() {
  for (const key of state.map.revealed) {
    const tile = state.map.tiles.get(key);
    if (tile) layers.tiles.add(buildTileMesh(tile));
  }
  for (const f of frontier()) {
    layers.fog.add(buildFogMesh(f.col, f.row));
  }
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
