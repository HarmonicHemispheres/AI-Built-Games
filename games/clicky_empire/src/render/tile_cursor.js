// ============================================================================
// render/tile_cursor.js — a light-blue hover plate that sits on whatever
// revealed board tile the pointer is over, so it's always clear which tile the
// cursor is pointing at. Sibling of fog_cursor.js (which highlights revealable
// CLOUDS in green/red); this one highlights the already-revealed board.
//
// Render-only: it reads the tile type to sit at the right slab height but never
// mutates game state. The integrator drives it from the pointer-move handler.
// ============================================================================

import * as THREE from "three";
import { state } from "../state.js";
import { layers } from "./scene.js";
import { tileToWorld, tileKey } from "../util/math.js";

const HOVER_COLOR = 0x7ec8ff; // light blue — "you are pointing here"

// Visible top height of a tile slab by type (mirrors meshes.tileHeight so the
// plate floats just above the slab top rather than clipping into mountains).
function slabTop(type) {
  switch (type) {
    case "water":
      return 0.12;
    case "mountain":
      return 0.6;
    case "forest":
      return 0.28;
    default:
      return 0.22;
  }
}

let cursor = null;

function ensure() {
  if (cursor) return cursor;
  const mat = new THREE.MeshBasicMaterial({
    color: HOVER_COLOR,
    transparent: true,
    opacity: 0.34,
    // Respect depth so the plate reads as a decal ON the ground — units and
    // buildings standing on the tile naturally occlude it (it floats just above
    // the slab top, so it never z-fights the surface it sits on).
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.92), mat);
  cursor.rotation.x = -Math.PI / 2; // lie flat on the board
  cursor.renderOrder = 4;
  cursor.visible = false;
  layers.fx.add(cursor);
  return cursor;
}

// Highlight the revealed board tile at (col,row). No-op visuals if the tile
// isn't revealed (the caller already gates on this, but stay defensive).
export function showTileHover(col, row) {
  const tile = state.map?.tiles?.get(tileKey(col, row));
  const m = ensure();
  const w = tileToWorld(col, row, 0);
  m.position.set(w.x, slabTop(tile?.type) + 0.02, w.z);
  m.visible = true;
}

export function hideTileHover() {
  if (cursor) cursor.visible = false;
}
