import { state, SCENE, MAP_W, MAP_H } from "../state.js";
import { screenToWorld, panCamera, zoomCamera } from "./camera.js";
import { clamp } from "../util/math.js";
import { boxSelect, selectUnit, unitAtWorld, clearSelection } from "./selection.js";
import { commandMove, commandAttack, commandAttackMove, commandStop, cycleStance } from "./commands.js";
import { isValidPlacement, placeUnit } from "../units/placement.js";
import { playSfx } from "../audio/sfx.js";
import { emit } from "../util/events.js";

const keys = new Set();
let canvas = null;
let mouseScreen = { x: 0, y: 0 };
let middlePan = null; // { startSx, startSy, startCamX, startCamY }

export function initInput(canvasEl) {
  canvas = canvasEl;
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

function getCanvasMouse(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = (e.clientX - rect.left) * (state.canvasSize.w / rect.width);
  const sy = (e.clientY - rect.top) * (state.canvasSize.h / rect.height);
  return { sx, sy };
}

function onMouseMove(e) {
  if (!isGameplayScene()) return;
  const { sx, sy } = getCanvasMouse(e);
  mouseScreen = { x: sx, y: sy };

  // Middle-mouse pan: convert screen-pixel delta to world-tile delta and shift
  // the camera in the opposite direction (so the world feels dragged).
  if (middlePan) {
    const dxPx = sx - middlePan.startSx;
    const dyPx = sy - middlePan.startSy;
    const tilesPerPx = 1 / (36 * state.camera.zoom);
    state.camera.x = clamp(middlePan.startCamX - dxPx * tilesPerPx, 1, MAP_W - 1);
    state.camera.y = clamp(middlePan.startCamY - dyPx * tilesPerPx, 1, MAP_H - 1);
    return;
  }

  const w = screenToWorld(sx, sy);
  state.hoveredTile = { x: Math.floor(w.x), y: Math.floor(w.y), wx: w.x, wy: w.y };

  // Drag placement ghost.
  if (state.dragPlacementCard) {
    const ix = state.hoveredTile.x, iy = state.hoveredTile.y;
    state.dragGhost = { x: ix, y: iy, valid: isValidPlacement(state.dragPlacementCard, ix, iy) };
  }

  // Box select drag.
  if (state.boxSelect) {
    state.boxSelect.x = w.x;
    state.boxSelect.y = w.y;
  }
}

function onMouseDown(e) {
  if (!isGameplayScene()) return;
  const { sx, sy } = getCanvasMouse(e);
  const w = screenToWorld(sx, sy);

  // Middle-click: start camera pan drag.
  if (e.button === 1) {
    e.preventDefault();
    middlePan = { startSx: sx, startSy: sy, startCamX: state.camera.x, startCamY: state.camera.y };
    canvas.style.cursor = "grabbing";
    return;
  }

  // Cancel placement on right-click.
  if (e.button === 2 && state.dragPlacementCard) {
    state.dragPlacementCard = null;
    state.dragGhost = null;
    emit("hand-changed");
    return;
  }

  // Place card on left-click.
  if (e.button === 0 && state.dragPlacementCard) {
    const ix = Math.floor(w.x), iy = Math.floor(w.y);
    const u = placeUnit(state.dragPlacementCard, ix, iy);
    if (u) {
      playSfx("place");
      // Continue placing same card if still in hand and not depleted? In v1
      // each hand-card can be placed once per prep.
      state.dragPlacementCard = null;
      state.dragGhost = null;
      emit("hand-changed");
    }
    return;
  }

  if (e.button === 0) {
    // Attack-move if armed.
    if (state.attackMoveArmed) {
      commandAttackMove(w.x, w.y);
      state.attackMoveArmed = false;
      return;
    }
    const u = unitAtWorld(w.x, w.y);
    if (u) {
      selectUnit(u, e.shiftKey);
    } else {
      state.boxSelect = { startX: w.x, startY: w.y, x: w.x, y: w.y, shift: e.shiftKey };
    }
  } else if (e.button === 2) {
    // Right-click: attack or move.
    const targetZ = zombieAtWorld(w.x, w.y);
    if (targetZ) commandAttack(targetZ);
    else commandMove(w.x, w.y);
  }
}

function onMouseUp(e) {
  if (e.button === 1 && middlePan) {
    middlePan = null;
    canvas.style.cursor = "default";
    return;
  }
  if (e.button === 0 && state.boxSelect) {
    const b = state.boxSelect;
    const dx = Math.abs(b.x - b.startX), dy = Math.abs(b.y - b.startY);
    if (dx > 0.2 || dy > 0.2) boxSelect(b.startX, b.startY, b.x, b.y, b.shift);
    state.boxSelect = null;
  }
}

function onWheel(e) {
  if (!isGameplayScene()) return;
  e.preventDefault();
  zoomCamera(e.deltaY);
}

function zombieAtWorld(wx, wy, radius = 0.5) {
  for (const z of state.zombies) {
    if (z.dead) continue;
    const dx = z.x - wx, dy = z.y - wy;
    if (dx*dx + dy*dy <= radius * radius) return z;
  }
  return null;
}

function onKeyDown(e) {
  keys.add(e.key.toLowerCase());
  if (!isGameplayScene()) return;
  const k = e.key.toLowerCase();
  if (k === "a") state.attackMoveArmed = true;
  if (k === "s") commandStop();
  if (k === "x") cycleStance();
  if (k === " ") { state.paused = !state.paused; e.preventDefault(); }
  if (k === "1") state.speed = 1;
  if (k === "2") state.speed = 2;
  if (k === "escape") {
    state.attackMoveArmed = false;
    if (state.dragPlacementCard) { state.dragPlacementCard = null; state.dragGhost = null; emit("hand-changed"); }
    clearSelection();
  }
}

function onKeyUp(e) {
  keys.delete(e.key.toLowerCase());
}

export function tickInput(dt) {
  if (!isGameplayScene()) return;
  const panSpeed = 12 * dt / state.camera.zoom;
  // Arrow keys always pan. WASD pans only when no units are selected (so A/S
  // remain free for attack-move / stop when controlling drones).
  if (keys.has("arrowup")) panCamera(0, -panSpeed);
  if (keys.has("arrowdown")) panCamera(0, panSpeed);
  if (keys.has("arrowleft")) panCamera(-panSpeed, 0);
  if (keys.has("arrowright")) panCamera(panSpeed, 0);
  if (state.selection.size === 0) {
    if (keys.has("w")) panCamera(0, -panSpeed);
    if (keys.has("s")) panCamera(0, panSpeed);
    if (keys.has("a")) panCamera(-panSpeed, 0);
    if (keys.has("d")) panCamera(panSpeed, 0);
  } else {
    if (keys.has("w")) panCamera(0, -panSpeed);
    if (keys.has("d")) panCamera(panSpeed, 0);
  }
}

function isGameplayScene() {
  return state.scene === SCENE.PREP || state.scene === SCENE.COMBAT;
}

export function getMouseScreen() { return mouseScreen; }
