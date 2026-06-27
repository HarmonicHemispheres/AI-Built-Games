// ============================================================================
// render/fog_cursor.js — the hover highlight for fog (cloud) tiles. When the
// pointer is over a revealable cloud, a flat colored plate sits on that tile —
// green if the player can afford to reveal it, red if not — so it's obvious the
// cloud is selectable and that revealing costs gold. Render-only; reads nothing
// from game state (the integrator drives it from the expansion input).
// ============================================================================

import * as THREE from "three";
import { layers } from "./scene.js";
import { tileToWorld } from "../util/math.js";

const AFFORD = 0x66e06a; // green — can afford to reveal
const DENY = 0xe05a5a; // red — not enough gold

let cursor = null;

function ensure() {
  if (cursor) return cursor;
  const mat = new THREE.MeshBasicMaterial({
    color: AFFORD,
    transparent: true,
    opacity: 0.45,
    depthTest: false, // draw over the cloud so the highlight always reads
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  cursor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), mat);
  cursor.rotation.x = -Math.PI / 2; // lie flat on the board
  cursor.renderOrder = 6;
  cursor.visible = false;
  layers.fx.add(cursor);
  return cursor;
}

// Highlight the cloud tile at (col,row), colored by affordability.
export function showFogHover(col, row, affordable) {
  const m = ensure();
  const w = tileToWorld(col, row, 0);
  m.position.set(w.x, 0.45, w.z); // float at cloud height
  m.material.color.set(affordable ? AFFORD : DENY);
  m.visible = true;
}

export function hideFogHover() {
  if (cursor) cursor.visible = false;
}
