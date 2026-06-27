// ============================================================================
// rts/input.js — pointer + keyboard input routing for the RTS layer.
// The ONLY W2-RTS file that touches three (indirectly, via scene.pick /
// scene.pickGround). It translates raw DOM events into selection changes,
// orders, and clicker resolutions. (CONTRACTS §14 "W2-RTS — input.js".)
//
// Coexistence with main.js camera controls: main.js owns middle-drag pan,
// wheel zoom, WASD/arrow pan, and Q/E yaw. This module only handles LEFT-click
// (select / click-resolve / box-select), RIGHT-click (orders), and the `A`
// (attack-move) / `S` (stop) RTS keys. It never touches the middle button,
// wheel, or camera keys.
//
// Routing per the contract:
//   LEFT-click (no drag):
//     hit.kind 'tile'         -> enforce clickCooldown, resolveClick(target,
//       playerStats); show fx + playSfx by result type. (Harvesting only — the
//       cursor no longer attacks: clicking an ENEMY is inert. Enemies are killed
//       by units, ordered via right-click.)
//     hit.kind 'unit'         -> selection.select([id]).
//     (A-mode armed) -> next LEFT-click issues commands.attackMove to the tile.
//   LEFT-drag -> box-select: record start, on release build a world rect via
//     pickGround at both corners -> selection.boxSelect(rect).
//   RIGHT-click:
//     hit on a unit/enemy -> commands.attack(selection, id)
//     else                -> commands.move(selection, hit.tile)
//   Keys: A -> arm attack-move for the next left-click; S -> commands.stop.
//
// Placement suppression: while a building placement is active (between
// 'placement-begin' and 'placement-end'), LEFT-click selection/click-resolve is
// suppressed so the placement ghost owns the pointer. RIGHT-click is also
// suppressed (place.js uses right-click/Esc to cancel placement).
// ============================================================================

import { pick, pickGround } from "../render/scene.js";
import { state, on, emit } from "../state.js";
import { resolveClick } from "../combat/clicker.js";
import * as fx from "../render/fx.js";
import { playSfx } from "../audio/sfx.js";
import * as selection from "./selection.js";
import * as commands from "./commands.js";

// --- Module-local input state -----------------------------------------------

// True between 'placement-begin' and 'placement-end' (a card is being placed).
let placementActive = false;

// True after pressing `A`: the next left-click becomes an attack-move order
// (RTS convention). Cleared once consumed or cancelled.
let attackMoveArmed = false;

// Timestamp (performance.now-ms) of the last *counted* tile/enemy click, used
// to enforce state.playerStats.clickCooldown.
let lastClickAt = -Infinity;

// Drag tracking for box-select. We record the pointerdown event and only treat
// it as a drag once the pointer moves past a small pixel threshold.
const DRAG_THRESHOLD_PX = 5;
let down = null; // { event, x, y, dragging } | null

function now() {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

// --- Click resolution (tiles only) ------------------------------------------
// The cursor harvests resource tiles; it does NOT damage enemies (enemy clicks
// are routed to an inert no-op in handleLeftClick).

function resolveTarget(hit) {
  if (hit.kind === "tile") {
    return state.map?.tiles?.get(hit.id) ?? null;
  }
  return null;
}

// fx + sfx feedback keyed by resolveClick result type.
function feedback(result, hit, target) {
  const wp = hit.point ?? { x: 0, y: 0, z: 0 };
  switch (result.type) {
    case "harvest": {
      const res = result.resource ?? target?.clickYield?.resource;
      // A "successful" harvest on a yieldless tile (grass / water / mountain)
      // gathers nothing — don't flash a "+1" or play the chime for a click that
      // produced no resource. Only celebrate an actual gain.
      if (!res || !(result.amount > 0)) break;
      fx.harvestPop({ x: wp.x, y: wp.y, z: wp.z }, res, result.amount);
      playSfx("harvest");
      break;
    }
    case "attack": {
      fx.floatingNumber({ x: wp.x, y: wp.y, z: wp.z }, String(result.amount ?? ""), 0xffffff);
      playSfx("attack");
      break;
    }
    case "crit": {
      // Gold number on crits for the "big hit" read.
      fx.floatingNumber({ x: wp.x, y: wp.y, z: wp.z }, String(result.amount ?? ""), 0xffd24a);
      playSfx("crit");
      break;
    }
    case "miss":
    default:
      // No fx/sfx on a miss — a miss should feel like nothing landed.
      break;
  }
}

// A counted tile click (harvest): enforce cooldown, resolve, give feedback.
function handleClickTarget(hit) {
  const stats = state.playerStats || {};
  const cooldown = Number.isFinite(stats.clickCooldown) ? stats.clickCooldown : 0;
  const t = now();
  if (t - lastClickAt < cooldown) return; // too fast — ignore (anti-spam)
  lastClickAt = t;

  const target = resolveTarget(hit);
  if (!target) return; // stale id / nothing to act on
  const result = resolveClick(target, state.playerStats);
  feedback(result, hit, target);
}

// --- Left click (after confirming it was a click, not a drag) ---------------

function handleLeftClick(event) {
  if (placementActive) return; // placement ghost owns the pointer

  const hit = pick(event);

  // Attack-move armed: the next left-click targets the ground tile.
  if (attackMoveArmed) {
    attackMoveArmed = false;
    const tile = hit?.tile ?? pickGround(event)?.tile;
    if (tile) commands.attackMove(state.selection, tile);
    return;
  }

  // A left-click on one of our buildings opens its info/upgrade panel (handled by
  // ui/building_panel.js). Anything else dismisses that panel (id:null).
  if (hit?.kind === "building") {
    emit("building-clicked", { id: hit.id });
    return;
  }
  emit("building-clicked", { id: null });

  if (!hit) {
    // Clicked empty ground -> clear selection.
    selection.clearSelection();
    return;
  }

  if (hit.kind === "tile") {
    handleClickTarget(hit);
    return;
  }

  if (hit.kind === "enemy") {
    // Clicking an enemy is inert — the cursor no longer deals click damage.
    // Enemies are fought with units (right-click to order an attack), not taps.
    // We do NOT clear the current selection so a stray click on a passing enemy
    // doesn't drop the units the player just box-selected.
    return;
  }

  if (hit.kind === "unit") {
    // Shift-click toggles the unit in/out of the current selection (multi-select);
    // a plain click selects just that unit.
    if (event.shiftKey) {
      const set = new Set(state.selection);
      if (set.has(hit.id)) set.delete(hit.id);
      else set.add(hit.id);
      selection.select([...set]);
    } else {
      selection.select([hit.id]);
    }
    return;
  }

  // Other kinds (building/fog/ground): a plain click deselects; a shift-click
  // keeps the current selection (so a stray shift-click doesn't clear it).
  if (!event.shiftKey) selection.clearSelection();
}

// --- Box-select on left-drag release ----------------------------------------

function handleBoxSelect(downEvent, upEvent) {
  if (placementActive) return;
  const a = pickGround(downEvent);
  const b = pickGround(upEvent);
  if (!a || !b) return;
  const rect = {
    minX: Math.min(a.point.x, b.point.x),
    maxX: Math.max(a.point.x, b.point.x),
    minZ: Math.min(a.point.z, b.point.z),
    maxZ: Math.max(a.point.z, b.point.z),
  };
  // Shift-drag adds the boxed units to the current selection.
  selection.boxSelect(rect, { additive: !!upEvent.shiftKey });
}

// --- Selection marquee (the visible drag rectangle) -------------------------
// A lightweight DOM overlay drawn from the pointer-down point to the current
// pointer position while the player box-selects. Purely cosmetic — the real
// selection is computed in world space on release (handleBoxSelect). Created
// lazily and styled inline so it needs no CSS and disappears when not dragging.
let marqueeEl = null;

function ensureMarquee() {
  if (marqueeEl || typeof document === "undefined") return marqueeEl;
  const el = document.createElement("div");
  el.id = "selection-marquee";
  Object.assign(el.style, {
    position: "fixed",
    pointerEvents: "none",
    border: "1px solid rgba(126, 206, 255, 0.95)",
    background: "rgba(126, 206, 255, 0.16)",
    borderRadius: "1px",
    zIndex: "60",
    left: "0px",
    top: "0px",
    width: "0px",
    height: "0px",
    display: "none",
  });
  document.body.appendChild(el);
  marqueeEl = el;
  return el;
}

function showMarquee(x0, y0, x1, y1) {
  const el = ensureMarquee();
  if (!el) return;
  el.style.left = `${Math.min(x0, x1)}px`;
  el.style.top = `${Math.min(y0, y1)}px`;
  el.style.width = `${Math.abs(x1 - x0)}px`;
  el.style.height = `${Math.abs(y1 - y0)}px`;
  el.style.display = "block";
}

function hideMarquee() {
  if (marqueeEl) marqueeEl.style.display = "none";
}

// --- Right click: issue an order to the current selection -------------------

function handleRightClick(event) {
  if (placementActive) return; // place.js handles right-click as "cancel"
  attackMoveArmed = false; // right-click cancels a pending attack-move
  if (!state.selection || state.selection.length === 0) return;

  const hit = pick(event);
  if (hit && (hit.kind === "unit" || hit.kind === "enemy")) {
    commands.attack(state.selection, hit.id);
  } else {
    const tile = hit?.tile ?? pickGround(event)?.tile;
    if (tile) commands.move(state.selection, tile);
  }
}

// --- Public entry point -----------------------------------------------------

// initInput(canvas) — attach pointer/keyboard listeners. Called once by the
// integrator at Wave-2 wiring (do NOT call from main.js). Idempotent guard.
let initialized = false;

export function initInput(canvas) {
  if (initialized || !canvas) return;
  initialized = true;

  // Track placement begin/end so left/right routing can be suppressed.
  on("placement-begin", () => {
    placementActive = true;
    attackMoveArmed = false;
  });
  on("placement-end", () => {
    placementActive = false;
  });

  // Pointer down: only the LEFT button starts a potential click/drag. Middle is
  // main.js's pan; we leave it alone. (Right button has no "down" behavior.)
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = { event: e, x: e.clientX, y: e.clientY, dragging: false };
  });

  // Pointer move: promote to a drag once past the pixel threshold, then keep the
  // selection marquee tracking the cursor for the rest of the drag.
  canvas.addEventListener("pointermove", (e) => {
    if (!down) return;
    if (!down.dragging && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_THRESHOLD_PX) {
      down.dragging = true;
    }
    if (down.dragging && !placementActive) {
      showMarquee(down.x, down.y, e.clientX, e.clientY);
    }
  });

  // Pointer up: resolve a left click vs a box-select.
  const finishLeft = (e) => {
    hideMarquee();
    if (!down) return;
    const start = down;
    down = null;
    if (e.button !== 0) return;
    if (start.dragging) {
      handleBoxSelect(start.event, e);
    } else {
      handleLeftClick(e);
    }
  };
  canvas.addEventListener("pointerup", finishLeft);
  canvas.addEventListener("pointercancel", () => {
    down = null;
    hideMarquee();
  });

  // Right-click: issue orders. Suppress the browser context menu so right-drag
  // commands feel native.
  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    handleRightClick(e);
  });

  // Keys: A arms attack-move; S stops the selection. We do NOT preventDefault
  // (main.js's WASD pan reads the same keys for the camera — both coexist).
  window.addEventListener("keydown", (e) => {
    if (placementActive) return;
    const k = e.key.toLowerCase();
    if (k === "a") {
      attackMoveArmed = true;
    } else if (k === "s") {
      if (state.selection && state.selection.length > 0) {
        commands.stop(state.selection);
      }
    }
  });
}

// Test/debug hooks (not part of the public contract).
export function _state() {
  return { placementActive, attackMoveArmed, lastClickAt };
}
