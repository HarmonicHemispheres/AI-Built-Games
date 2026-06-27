// ============================================================================
// ui/card_preview.js — live 3D model thumbnails for building / unit cards.
//
// Instead of a flat vector glyph, building and unit cards show the actual
// low-poly model, gently turning so it reads as 3D. To stay cheap we use ONE
// shared offscreen WebGL renderer (a single GL context, not one per card): each
// frame we drop the next card's model into a tiny scene, render it, and blit the
// result onto that card's 2D <canvas>. Models are framed to fit and slowly spin.
//
// W3-UI owns this. It reads catalogs only as arguments and never touches game
// state. cards_render.js calls mountCardPreview() while building a card element;
// previews self-dispose when their canvas leaves the DOM.
// ============================================================================

import * as THREE from "three";
import { onRender } from "../loop.js";
import { buildBuildingMesh, buildUnitGroup, disposeMesh } from "../render/meshes.js";
import { getUnitDef } from "../units/catalog.js";

// Offscreen render buffer size (device px). Small — these are thumbnails.
const PREV = 220;
// Throttle the preview render loop (the main game runs at full rate regardless).
const FPS = 30;
const SPIN = 0.55; // radians/sec — a gentle turntable

let renderer = null;
let pscene = null;
let pcamera = null;
let holder = null;
let webglFailed = false;

// Active previews: { canvas, ctx, pivot, mesh }.
const previews = [];
let acc = 0;

function ensureRenderer() {
  if (renderer || webglFailed) return !webglFailed;
  try {
    // preserveDrawingBuffer so we can drawImage() the WebGL canvas onto each
    // card's 2D canvas reliably across browsers (the buffer survives the blit).
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(PREV, PREV, false);
    renderer.setClearColor(0x000000, 0); // transparent — the card art shows behind

    pscene = new THREE.Scene();
    pcamera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);

    // Bright, even lighting so the toy-like models read clearly at thumbnail size.
    pscene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.7);
    sun.position.set(3, 6, 4);
    pscene.add(sun);
    pscene.add(new THREE.HemisphereLight(0xcfeaff, 0x4a6b3a, 0.55));

    holder = new THREE.Group();
    pscene.add(holder);

    onRender(tick);
    return true;
  } catch (_e) {
    webglFailed = true;
    renderer = null;
    return false;
  }
}

// Build the model for a card (building defId or unit unitId). Returns a pivot
// Group recentred on the origin and scaled/known so the camera frames it.
function buildPivot(card) {
  let mesh = null;
  if (card.type === "building") {
    mesh = buildBuildingMesh(card.effect?.defId ?? card.id);
  } else if (card.type === "unit") {
    const def = getUnitDef(card.effect?.unitId ?? card.id);
    if (def) mesh = buildUnitGroup(def, def.hp);
  }
  if (!mesh) return null;

  // Recenter so the model's bounding-box center sits at the origin, then wrap in
  // a pivot we can spin. fitRadius drives the camera distance.
  const box = new THREE.Box3().setFromObject(mesh);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  mesh.position.set(-center.x, -center.y, -center.z);

  const pivot = new THREE.Group();
  pivot.add(mesh);
  pivot.userData.mesh = mesh;
  pivot.userData.fitRadius = 0.5 * Math.hypot(size.x, size.y, size.z) || 1;
  // Start each card at a different angle so a grid of cards isn't in lockstep.
  pivot.rotation.y = hashAngle(card.id);
  return pivot;
}

// Deterministic per-card starting angle (so spins are varied but stable).
function hashAngle(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 360) * (Math.PI / 180);
}

// Frame the camera to fit a pivot's model, viewed from a slight iso down-angle.
function frameCamera(pivot) {
  const r = pivot.userData.fitRadius;
  const fov = (pcamera.fov * Math.PI) / 180;
  const dist = (r / Math.sin(fov / 2)) * 1.12;
  pcamera.position.set(0, dist * 0.52, dist * 0.92);
  pcamera.lookAt(0, 0, 0);
  pcamera.updateProjectionMatrix();
}

// mountCardPreview(artEl, card) — attach a spinning 3D thumbnail to a card's art
// slot. Returns true if a preview was mounted (building/unit + WebGL available),
// false otherwise so the caller can fall back to the vector glyph.
export function mountCardPreview(artEl, card) {
  if (!card || (card.type !== "building" && card.type !== "unit")) return false;
  if (!ensureRenderer()) return false;

  const pivot = buildPivot(card);
  if (!pivot) return false;

  const canvas = document.createElement("canvas");
  canvas.className = "ce-card-3d";
  canvas.width = PREV;
  canvas.height = PREV;
  artEl.appendChild(canvas);

  previews.push({ canvas, ctx: canvas.getContext("2d"), pivot, mesh: pivot.userData.mesh });
  return true;
}

function tick(dt) {
  if (!renderer || previews.length === 0) return;

  // Drop previews whose canvas left the DOM (hand re-render, scene swap, etc.).
  for (let i = previews.length - 1; i >= 0; i--) {
    if (!previews[i].canvas.isConnected) {
      disposeMesh(previews[i].mesh);
      previews.splice(i, 1);
    }
  }
  if (previews.length === 0) return;

  acc += dt || 0;
  if (acc < 1 / FPS) return;
  const step = Math.min(acc, 0.1);
  acc = 0;

  for (const p of previews) {
    // Skip cards hidden by a display:none ancestor (collapsed panel / other scene).
    if (p.canvas.offsetParent === null) continue;
    p.pivot.rotation.y += step * SPIN;

    holder.clear();
    holder.add(p.pivot);
    frameCamera(p.pivot);
    renderer.render(pscene, pcamera);

    p.ctx.clearRect(0, 0, p.canvas.width, p.canvas.height);
    p.ctx.drawImage(renderer.domElement, 0, 0, p.canvas.width, p.canvas.height);
  }
}
