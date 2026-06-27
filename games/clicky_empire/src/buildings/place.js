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
import { layers, pickGround, camera } from "../render/scene.js";
import { buildBuildingMesh, disposeMesh } from "../render/meshes.js";
import { placePop } from "../render/fx.js";
import { playSfx } from "../audio/sfx.js";
import { tileToWorld, clamp01 } from "../util/math.js";
import { getCard } from "../cards/catalog.js";
import { getBuildingDef } from "./catalog.js";
import { getTileType } from "../world/tiles.js";
import { tileAt } from "../world/generate.js";
import { placeBuilding, placementRequirementMet } from "./economy.js";

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
  // Terrain gate for the building being placed (lumber/sawmill near forest, mine
  // near ore) so the ghost reads red over ineligible ground.
  if (!placementRequirementMet(getBuildingDef(ghost.defId), col, row)) return false;
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
// Production progress bars — a small billboarded bar floating above any building
// that produces on a timer (economy yields / spawner units). It reads the live
// accrual timer (building.cd) vs. the def's tick/interval so the player can see
// each producer "filling up" toward its next payout. Render-only.
// ---------------------------------------------------------------------------

const BAR_W = 0.62;
const BAR_H = 0.12;
const BAR_Y = 1.05; // local height above the building footprint
const BAR_COLORS = {
  gold: 0xffcf3a,
  wood: 0xc89a5a,
  iron: 0xc8d0d8,
  food: 0x8fd14a,
  unit: 0x6fa8ff, // spawner buildings (produce units)
};

function barMaterial(colorHex, opacity) {
  return new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
    depthTest: false, // always readable over the model/terrain
    depthWrite: false,
  });
}

// What kind of progress bar (if any) a building should carry. Returns null for
// non-producers (castle / walls / towers). Economy producers get a single
// continuous fill; spawner buildings get a SEGMENTED bar — one segment per unit
// they can field (cap), filled = currently-living units, the next segment fills
// toward the unit being trained.
function barInfoFor(defId) {
  const def = getBuildingDef(defId);
  if (!def) return null;
  if (def.yields) {
    const res = Object.keys(def.yields)[0];
    return { kind: "economy", rate: def.tickRate || 1, color: BAR_COLORS[res] ?? BAR_COLORS.gold };
  }
  if (def.spawns) {
    return {
      kind: "spawner",
      rate: def.spawns.interval || 1,
      color: BAR_COLORS.unit,
      unitId: def.spawns.unitId,
      cap: def.spawns.cap || 1,
    };
  }
  return null;
}

// Count a spawner building's OWN living units (mirrors economy.livingFromSpawner;
// render-only read used to drive the spawner bar's filled-segment count). Units
// carry the spawning building's id, so each camp's bar fills from its own roster.
function livingFromSpawner(buildingId) {
  let n = 0;
  for (const u of state.units) {
    if (u && u.spawnerId === buildingId && (u.hp == null || u.hp > 0)) n++;
  }
  return n;
}

function makeProgressBar(info) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(BAR_W + 0.08, BAR_H + 0.08),
    barMaterial(0x0c120b, 0.78),
  );
  bg.renderOrder = 10;
  g.add(bg);

  if (info.kind === "spawner") {
    // One left-anchored segment per unit slot (cap), separated by thin gaps.
    const cap = Math.max(1, info.cap || 1);
    const gap = 0.03;
    const segW = (BAR_W - gap * (cap - 1)) / cap;
    const left = -BAR_W / 2;
    const segs = [];
    for (let i = 0; i < cap; i++) {
      const slotX = left + i * (segW + gap) + segW / 2;
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(segW, BAR_H), barMaterial(info.color, 0.96));
      seg.position.set(slotX, 0, 0.002);
      seg.renderOrder = 11;
      seg.userData = { slotX, slotW: segW };
      g.add(seg);
      segs.push(seg);
    }
    g.userData = { kind: "spawner", segs };
  } else {
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(BAR_W, BAR_H), barMaterial(info.color, 0.96));
    fill.position.z = 0.002;
    fill.renderOrder = 11;
    g.add(fill);
    g.userData = { kind: "economy", fill };
  }

  g.position.y = BAR_Y;
  return g;
}

// Update a building's bar, then face the camera so it's legible from any yaw.
//   - economy: a single fill toward the next tick (left-anchored).
//   - spawner: `cap` segments — full for each living unit, the next segment
//     filling toward the unit in training; once capped every segment is full and
//     the bar stops animating (logic holds b.cd at 0 while at cap).
function updateBar(b) {
  const bar = b._bar;
  // "Show building progress bars" setting — hide the bar entirely when off (it
  // stays attached so flipping the setting back on resumes updates next frame).
  const show = state.meta?.settings?.showProgressBars !== false;
  bar.visible = show;
  if (!show) return;
  const ud = bar.userData;
  if (ud.kind === "spawner") {
    const living = livingFromSpawner(b.id);
    const training = clamp01((b.cd || 0) / (b._barRate || 1));
    for (let i = 0; i < ud.segs.length; i++) {
      const seg = ud.segs[i];
      const pct = i < living ? 1 : i === living ? training : 0;
      seg.scale.x = Math.max(0.0001, pct);
      seg.position.x = seg.userData.slotX - (seg.userData.slotW * (1 - pct)) / 2;
    }
  } else {
    const fill = ud.fill;
    const pct = clamp01((b.cd || 0) / (b._barRate || 1));
    fill.scale.x = Math.max(0.0001, pct);
    fill.position.x = -(BAR_W * (1 - pct)) / 2;
  }
  if (camera) bar.quaternion.copy(camera.quaternion);
}

// ---------------------------------------------------------------------------
// Building mesh reconciler (render-sync; reads state, never mutates gameplay)
// ---------------------------------------------------------------------------

// Track meshes we've built keyed by building id so we can dispose on removal.
const meshById = new Map(); // id -> THREE.Object3D

// Walls auto-connect: a wall's mesh depends on which orthogonal neighbours are
// ALSO walls. We recompute that set each frame and rebuild a wall whenever it
// changes, so placing or losing a wall reshapes its neighbours' arms too.
function isWallDef(defId) {
  const d = getBuildingDef(defId);
  return !!(d && d.kind === "wall");
}

// Directions (in fixed N,S,E,W order for a stable signature) whose neighbour is
// a wall, given a position->building lookup for the current frame.
function wallConnections(b, byPos) {
  const dirs = [];
  const at = (col, row) => {
    const nb = byPos.get(`${col},${row}`);
    return nb && isWallDef(nb.defId);
  };
  if (at(b.col, b.row - 1)) dirs.push("N");
  if (at(b.col, b.row + 1)) dirs.push("S");
  if (at(b.col + 1, b.row)) dirs.push("E");
  if (at(b.col - 1, b.row)) dirs.push("W");
  return dirs;
}

function reconcile() {
  const live = new Set();

  // Position -> building lookup for this frame (wall-connection neighbour tests).
  const byPos = new Map();
  for (const b of state.placed) byPos.set(`${b.col},${b.row}`, b);

  // Build meshes for new buildings.
  for (const b of state.placed) {
    live.add(b.id);

    // Compute this wall's current connection set + signature (null for non-walls).
    const wallConn = isWallDef(b.defId) ? wallConnections(b, byPos) : null;
    const wallSig = wallConn ? wallConn.join("") : null;

    // In-place upgrade: the building's defId changed under an existing mesh
    // (hamlet -> village -> city). Drop the old mesh + its production bar so the
    // block below rebuilds the new structure (with a placement pop).
    if (b.group && b._meshDefId != null && b._meshDefId !== b.defId) {
      layers.buildings.remove(b.group);
      disposeMesh(b.group); // also frees the bar (a child of the group)
      meshById.delete(b.id);
      b.group = null;
      b._bar = null;
      b._barInit = false;
      b._popOnBuild = true;
    }

    // Wall connections changed (a neighbouring wall was placed/removed): rebuild
    // this wall's mesh so its arms match. No placement pop — it's a reshape, not
    // a fresh build.
    if (b.group && wallSig != null && b._wallSig !== wallSig) {
      layers.buildings.remove(b.group);
      disposeMesh(b.group);
      meshById.delete(b.id);
      b.group = null;
      b._bar = null;
      b._barInit = false;
    }

    if (b.group == null) {
      const mesh = buildBuildingMesh(b.defId, {
        col: b.col,
        row: b.row,
        id: b.id,
        connections: wallConn,
      });
      b._wallSig = wallSig;
      const w = tileToWorld(b.col, b.row, 0);
      mesh.position.set(w.x, 0, w.z);
      layers.buildings.add(mesh);
      b.group = mesh;
      b._meshDefId = b.defId;
      meshById.set(b.id, mesh);
      if (b._popOnBuild) {
        placePop(mesh);
        delete b._popOnBuild;
      }
    } else if (!meshById.has(b.id)) {
      // A group set elsewhere (e.g. castle created by integrator) — adopt it so
      // we can dispose it later if the building is removed.
      meshById.set(b.id, b.group);
      b._meshDefId = b.defId;
      if (b.group.parent == null) layers.buildings.add(b.group);
    }

    // Attach a production progress bar once the mesh exists (producers only).
    if (b.group && !b._barInit) {
      b._barInit = true;
      const info = barInfoFor(b.defId);
      if (info) {
        b._bar = makeProgressBar(info);
        b._barRate = info.rate;
        b.group.add(b._bar);
      }
    }
    if (b._bar) updateBar(b);
  }

  // Dispose meshes for buildings that no longer exist in state.placed (the bar
  // is a child of the group, so disposeMesh frees it too).
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
