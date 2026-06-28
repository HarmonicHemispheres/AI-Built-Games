// ============================================================================
// app.js — application/run-flow controller. Integrator-owned. The UI layer
// (ui/*) calls these to drive the game: menu → config → run → draft → over →
// menu. Kept separate from main.js so ui modules can import it without a cycle
// (ui → app; main → ui + app; app imports neither ui nor main).
// ============================================================================

import { state, SCENE, setScene, newRun } from "./state.js";
import { cameraApi, layers } from "./render/scene.js";
import { generateMap } from "./world/generate.js";
import { frontier } from "./world/expand.js";
import { buildTileMesh, buildFogMesh, disposeMesh } from "./render/meshes.js";
import { collectAmbient, clearAmbient } from "./render/ambient.js";
import { placeBuilding } from "./buildings/economy.js";
import { drawStarting } from "./cards/hand.js";
import { startBuildPhase } from "./run.js";
import { makeRng, randSeedString } from "./util/rng.js";

// Start a fresh run from a config form. `seed` blank → random.
export function startRun({ mapSize = 9, seed = "" } = {}) {
  const finalSeed = (seed && String(seed).trim()) || randSeedString(makeRng(String(performance.now())));

  clearWorldMeshes();
  newRun({ seed: finalSeed, mapSize });
  state.run.startedAt = Date.now();
  state.speed = 1; // every run starts at 1x (clears any leftover pause/fast speed)

  generateMap(finalSeed, mapSize);
  buildWorldMeshes();

  // The castle is the lose condition; its mesh is built by the placement
  // reconciler. Unit/enemy/building meshes are reconciled from state each frame.
  const c = state.map.castle ?? { col: 0, row: 0 };
  placeBuilding("castle", c.col, c.row);

  drawStarting();
  cameraApi.centerOn(c.col, c.row);
  setScene(SCENE.RUN);
  startBuildPhase();
  return state.run;
}

export function returnToMenu() {
  // Drop the run; reconcilers dispose unit/enemy/building meshes when their
  // state arrays empty on the next frame. World (tile/fog) meshes are manual.
  state.run = null;
  state.units.length = 0;
  state.enemies.length = 0;
  state.placed.length = 0;
  state.selection.length = 0;
  state.hand.length = 0;
  clearWorldMeshes();
  setScene(SCENE.MENU);
}

export function setSpeed(n) {
  state.speed = n;
}

// --- Pause (the in-run menu modal) ------------------------------------------
// Pausing freezes the run by zeroing the time multiplier — the loop scales dt by
// state.speed, so every gameplay/render-fx tick gets dt=0 while the modal is up.
// We stash the pre-pause speed so resume restores 1x/2x/3x exactly.
let _prePauseSpeed = 1;

export function pauseRun() {
  if (state.speed === 0) return; // already paused
  _prePauseSpeed = state.speed || 1;
  state.speed = 0;
}

export function resumeRun() {
  if (state.speed !== 0) return; // not paused
  state.speed = _prePauseSpeed || 1;
}

export function isPaused() {
  return state.speed === 0;
}

// Rebuild tile + fog meshes from current revealed/frontier state. Called after
// a fog-of-war expansion reveals a new tile (integrator wires it to
// `tile-revealed`). Buildings/units/enemies have their own reconcilers.
export function refreshWorldMeshes() {
  clearWorldMeshes();
  buildWorldMeshes();
}

// --- World mesh management (tiles + fog are built manually here) -------------

function buildWorldMeshes() {
  for (const key of state.map.revealed) {
    const tile = state.map.tiles.get(key);
    if (tile) layers.tiles.add(buildTileMesh(tile));
  }
  for (const f of frontier()) {
    layers.fog.add(buildFogMesh(f.col, f.row));
  }
  // Register swaying trees (tile layer) and drifting cloud caps (fog layer) with
  // the ambient animator. Water flows off the shared material, so it needs no
  // collection.
  collectAmbient(layers.tiles);
  collectAmbient(layers.fog);
}

function clearWorldMeshes() {
  // Drop ambient sway refs before the meshes they point at are disposed.
  clearAmbient();
  for (const layer of [layers.tiles, layers.fog]) {
    for (const child of [...layer.children]) {
      layer.remove(child);
      disposeMesh(child);
    }
  }
}
