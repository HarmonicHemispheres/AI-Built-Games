// ============================================================================
// main.js — bootstrap, the RAF game loop, scene switching, and camera controls.
// Integrator-owned. Subsystems are wired in here at wave boundaries; fan-out
// agents never edit this file.
// ============================================================================

import { state, SCENE, setScene, newRun } from "./state.js";
import { initScene, render, cameraApi } from "./render/scene.js";
import { updateRun } from "./run.js";
import { runUpdaters, runRenderers } from "./loop.js";
import { loadSave } from "./persistence.js";
import { makeRng, randSeedString } from "./util/rng.js";
import { on } from "./util/events.js";

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

  // Reflect scene changes onto the DOM overlays + in-run HUD.
  on("scene-changed", ({ scene }) => applySceneDom(scene));
  applySceneDom(state.scene);

  // Stage 0 has no menu UI yet (Wave 3). Boot straight into a demo run so the
  // 3D scene + camera are verifiable. Wave 3 replaces this with the real menu.
  bootDemoRun();

  requestAnimationFrame(loop);
}

function applySceneDom(scene) {
  for (const [sc, domId] of Object.entries(SCENE_DOM)) {
    const el = document.getElementById(domId);
    if (el) el.classList.toggle("hidden", sc !== scene);
  }
  const hud = document.getElementById("game-hud");
  if (hud) hud.classList.toggle("hidden", scene !== SCENE.RUN);
}

// Temporary Stage-0 entry: start a small run and center the camera so the
// orbit/pan/zoom/rotate controls are testable over the ground plane.
function bootDemoRun() {
  const seed = randSeedString(makeRng(String(performance.now())));
  newRun({ seed, mapSize: 5 });
  state.run.startedAt = Date.now();
  // World generation lands in Wave 1; for now center on origin.
  cameraApi.centerOn(2, 2);
  setScene(SCENE.RUN);
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
