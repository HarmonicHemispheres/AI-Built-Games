// ============================================================================
// buildings/place.js — ghost-preview placement + the building mesh reconciler.
// THE ONLY building module that touches three.
//
// Two jobs (CONTRACTS §14 "place.js (THREE)"):
//   1. Ghost placement. On `placement-begin {cardId}` enter ghost mode: a
//      translucent building mesh follows the pointer (pickGround), tinted by
//      validity (tile buildable && unoccupied). Left-click on a valid tile pays
//      the card cost, places the building (economy.placeBuilding), pops fx,
//      plays sfx, and tells cards/RTS via events. Right-click / Escape cancels.
//   2. Reconciler. Each render frame, build meshes for state.placed entries that
//      have no `.group` yet (add to layers.buildings) and dispose meshes for
//      buildings that were removed from state.placed.
//
// Cross-Wave-2 coupling is via events only (never import cards/RTS modules):
//   listens:  placement-begin {cardId}
//   emits:    hand-consume {cardId}, card-played {card}, placement-end
//
// We DO import our own sibling economy.js (placeBuilding) — that is allowed.
// ============================================================================

import * as THREE from "three";
import { state, canAfford, spend } from "../state.js";
import { on, emit } from "../util/events.js";
import { onRender } from "../loop.js";
import { layers, pickGround } from "../render/scene.js";
import { buildBuildingMesh, disposeMesh } from "../render/meshes.js";
import { placePop } from "../render/fx.js";
import { playSfx } from "../audio/sfx.js";
import { tileToWorld } from "../util/math.js";
import { getCard } from "../cards/catalog.js";
import { getTileType } from "../world/tiles.js";
import { tileAt } from "../world/generate.js";
import { placeBuilding } from "./economy.js";

// Validity tint colors for the ghost.
const VALID_TINT = 0x69d36e; // green-ish
const INVALID_TINT = 0xd35050; // red-ish

// --- Ghost-mode state -------------------------------------------------------

let canvasEl = null;
const ghost = {
  active: false,
  cardId: null,
  defId: null,
  mesh: null, // THREE.Object3D following the pointer
  tile: null, // { col, row } currently hovered (or null)
  valid: false,
};

// ---------------------------------------------------------------------------
// Ghost mesh helpers
// ---------------------------------------------------------------------------

// Build the translucent preview mesh for `defId`.
function makeGhostMesh(defId) {
  const mesh = buildBuildingMesh(defId);
  // Make every material translucent so it reads as a preview.
  mesh.traverse((node) => {
    if (node.isMesh && node.material) {
      // Clone so we never mutate the shared cached materials from meshes.js.
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      node.material = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 0.55;
        c.depthWrite = false;
        return c;
      });
      if (node.material.length === 1) node.material = node.material[0];
    }
    node.castShadow = false;
    node.receiveShadow = false;
  });
  mesh.userData = { ...mesh.userData, ghost: true };
  return mesh;
}

// Tint the ghost mesh by validity.
function tintGhost(mesh, valid) {
  const color = new THREE.Color(valid ? VALID_TINT : INVALID_TINT);
  mesh.traverse((node) => {
    if (node.isMesh && node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      for (const m of mats) if (m.color) m.color.copy(color);
    }
  });
}

// Is (col,row) a legal placement target right now?
function tileValid(col, row) {
  const tile = tileAt(col, row);
  if (!tile) return false;
  const def = getTileType(tile.type);
  if (!def.buildable) return false;
  // Unoccupied check (mirror of economy.isOccupied; kept local to avoid leaking
  // internals across the import boundary).
  if (state.placed.some((b) => b.col === col && b.row === row)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Ghost lifecycle
// ---------------------------------------------------------------------------

function beginGhost(cardId) {
  const card = getCard(cardId);
  if (!card || card.type !== "building" || !card.effect?.defId) return;
  cancelGhost(false); // clear any previous ghost without emitting end twice

  ghost.active = true;
  ghost.cardId = cardId;
  ghost.defId = card.effect.defId;
  ghost.tile = null;
  ghost.valid = false;
  ghost.mesh = makeGhostMesh(ghost.defId);
  ghost.mesh.visible = false; // hidden until first hover positions it
  layers.buildings.add(ghost.mesh);
}

// Tear down the ghost mesh + state. When `emitEnd` is true, also broadcast
// placement-end (so RTS re-enables selection). `false` is used for the internal
// "replace previous ghost" path where we don't want a stray end.
function cancelGhost(emitEnd = true) {
  if (ghost.mesh) {
    layers.buildings.remove(ghost.mesh);
    disposeMesh(ghost.mesh);
  }
  const was = ghost.active;
  ghost.active = false;
  ghost.cardId = null;
  ghost.defId = null;
  ghost.mesh = null;
  ghost.tile = null;
  ghost.valid = false;
  if (emitEnd && was) emit("placement-end");
}

function onPointerMove(event) {
  if (!ghost.active || !ghost.mesh) return;
  const hit = pickGround(event);
  if (!hit) {
    ghost.mesh.visible = false;
    ghost.tile = null;
    ghost.valid = false;
    return;
  }
  const { col, row } = hit.tile;
  const w = tileToWorld(col, row, 0);
  ghost.mesh.position.set(w.x, 0, w.z);
  ghost.mesh.visible = true;
  ghost.tile = { col, row };
  ghost.valid = tileValid(col, row);
  tintGhost(ghost.mesh, ghost.valid);
}

function onPointerDown(event) {
  if (!ghost.active) return;

  // Right-click cancels (no spend).
  if (event.button === 2) {
    event.preventDefault?.();
    cancelGhost(true);
    return;
  }

  // Only the primary (left) button places.
  if (event.button !== 0) return;

  // Re-resolve the tile under the cursor at click time (don't trust a stale
  // hover on touch / synthetic events).
  const hit = pickGround(event);
  if (!hit) return;
  const { col, row } = hit.tile;
  if (!tileValid(col, row)) return; // invalid target: ignore the click

  const cardId = ghost.cardId;
  const card = getCard(cardId);
  if (!card || !canAfford(card.cost)) return; // can't pay: keep ghosting

  // Pay + place. place.js owns the spend (Wave-1 import) then delegates to its
  // own sibling economy.placeBuilding, then tells cards/hand to drop the card.
  spend(card.cost);
  const building = placeBuilding(card.effect.defId, col, row);
  if (!building) {
    // Placement failed after the validity check (race) — refund the spend.
    for (const k in card.cost) state.resources[k] += card.cost[k];
    return;
  }

  // Juice (the reconciler will build the real mesh next frame; pop it then).
  building._popOnBuild = true;
  playSfx("place");

  // Hand + RTS handshake.
  emit("hand-consume", { cardId });
  emit("card-played", { card });

  cancelGhost(true);
}

function onKeyDown(event) {
  if (!ghost.active) return;
  if (event.key === "Escape" || event.key === "Esc") {
    cancelGhost(true);
  }
}

// ---------------------------------------------------------------------------
// Building mesh reconciler (render-sync; reads state, never mutates gameplay)
// ---------------------------------------------------------------------------

// Track meshes we've built keyed by building id so we can dispose on removal.
const meshById = new Map(); // id -> THREE.Object3D

function reconcile() {
  const live = new Set();

  // Build meshes for new buildings.
  for (const b of state.placed) {
    live.add(b.id);
    if (b.group == null) {
      const mesh = buildBuildingMesh(b.defId, { col: b.col, row: b.row, id: b.id });
      const w = tileToWorld(b.col, b.row, 0);
      mesh.position.set(w.x, 0, w.z);
      layers.buildings.add(mesh);
      b.group = mesh;
      meshById.set(b.id, mesh);
      if (b._popOnBuild) {
        placePop(mesh);
        delete b._popOnBuild;
      }
    } else if (!meshById.has(b.id)) {
      // A group set elsewhere (e.g. castle created by integrator) — adopt it so
      // we can dispose it later if the building is removed.
      meshById.set(b.id, b.group);
      if (b.group.parent == null) layers.buildings.add(b.group);
    }
  }

  // Dispose meshes for buildings that no longer exist in state.placed.
  for (const [id, mesh] of meshById) {
    if (!live.has(id)) {
      layers.buildings.remove(mesh);
      disposeMesh(mesh);
      meshById.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// initPlacement(canvas?) — wire the placement listeners + the reconciler.
// `canvas` is the render canvas (for pointer events). If omitted we attach to
// window so the harness can drive it; pickGround uses scene.js's own canvas ref.
export function initPlacement(canvas) {
  canvasEl = canvas ?? (typeof window !== "undefined" ? window : null);

  on("placement-begin", ({ cardId }) => beginGhost(cardId));

  if (canvasEl && canvasEl.addEventListener) {
    canvasEl.addEventListener("pointermove", onPointerMove);
    canvasEl.addEventListener("pointerdown", onPointerDown);
    // Suppress the browser context menu so right-click can cancel cleanly.
    canvasEl.addEventListener("contextmenu", (e) => {
      if (ghost.active) e.preventDefault();
    });
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("keydown", onKeyDown);
  }

  onRender(reconcile);
}

// Test/debug introspection (not part of the contract surface).
export function _ghostState() {
  return { ...ghost };
}
