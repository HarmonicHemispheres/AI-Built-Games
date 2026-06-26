// ============================================================================
// render/scene.js — the shared Three.js scene, lights, ground, the iso orbit
// camera rig, and the raycaster picking entry point. Integrator-owned base that
// every other render module attaches meshes to.
//
// Exposes: scene, renderer, camera, the camera-control API, render(), pick().
// (See CONTRACTS.md "Render base" + "Picking".)
// ============================================================================

import * as THREE from "three";
import { worldToTile, clamp } from "../util/math.js";

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ad0e8); // soft sky

export let renderer = null;
export let camera = null;

// Groups other render code can attach to, so layering is predictable.
export const layers = {
  ground: new THREE.Group(),
  tiles: new THREE.Group(),
  buildings: new THREE.Group(),
  units: new THREE.Group(),
  enemies: new THREE.Group(),
  fx: new THREE.Group(),
  fog: new THREE.Group(),
};
for (const g of Object.values(layers)) scene.add(g);

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let canvasEl = null;

// --- Camera rig -------------------------------------------------------------
// Spherical orbit around a ground pivot. Fixed pitch (~45° down-angle), yaw
// snaps in 90° steps, wheel zoom, WASD/drag pan.

const rig = {
  pivot: new THREE.Vector3(0, 0, 0),
  phi: Math.PI / 4, // polar from +Y → 45° = a 45° down-angle
  theta: Math.PI / 4, // yaw, snaps by 90°; start corner-on (diagonal iso)
  radius: 16, // zoom distance
  minRadius: 7,
  maxRadius: 34,
};

function applyCamera() {
  const { pivot, phi, theta, radius } = rig;
  const sinPhi = Math.sin(phi);
  camera.position.set(
    pivot.x + radius * sinPhi * Math.sin(theta),
    pivot.y + radius * Math.cos(phi),
    pivot.z + radius * sinPhi * Math.cos(theta),
  );
  camera.lookAt(pivot);
}

// Camera-space forward/right on the ground plane (for yaw-relative panning).
function groundBasis() {
  const fwd = new THREE.Vector3(-Math.sin(rig.theta), 0, -Math.cos(rig.theta));
  const right = new THREE.Vector3(Math.cos(rig.theta), 0, -Math.sin(rig.theta));
  return { fwd, right };
}

export const cameraApi = {
  centerOn(col, row) {
    rig.pivot.set(col, 0, row);
    applyCamera();
  },
  setTarget(x, z) {
    rig.pivot.set(x, 0, z);
    applyCamera();
  },
  // Pan in screen-relative units (dx = right, dy = forward).
  panBy(dx, dy) {
    const { fwd, right } = groundBasis();
    rig.pivot.addScaledVector(right, dx);
    rig.pivot.addScaledVector(fwd, dy);
    applyCamera();
  },
  zoomBy(delta) {
    rig.radius = clamp(rig.radius + delta, rig.minRadius, rig.maxRadius);
    applyCamera();
  },
  // Snap-rotate yaw by ±90°.
  rotateYaw(dir) {
    rig.theta += (dir >= 0 ? 1 : -1) * (Math.PI / 2);
    applyCamera();
  },
  get state() {
    return { ...rig, pivot: rig.pivot.clone() };
  },
};

// --- Init / resize ----------------------------------------------------------

export function initScene(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);

  // Lights: one warm directional "sun" + soft ambient (prompt.md).
  const sun = new THREE.DirectionalLight(0xfff2d6, 2.1);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 24;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 60 });
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd8ff, 0.65));
  scene.add(new THREE.HemisphereLight(0xcfeaff, 0x4a6b3a, 0.5));

  // A large grass-green ground plane so Stage 0 has something to orbit over.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x5aa84b, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.userData = { kind: "ground" };
  layers.ground.add(ground);

  onResize();
  window.addEventListener("resize", onResize);
  applyCamera();
  return { renderer, scene, camera };
}

function onResize() {
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

export function render() {
  renderer.render(scene, camera);
}

// --- Picking ----------------------------------------------------------------
// Raycast a pointer event into the scene. Returns the nearest object carrying a
// userData.kind tag (walking up parents), plus the ground tile under the hit.
// Shape: { kind, id, object, point:{x,y,z}, tile:{col,row} } or null.

export function pick(event, opts = {}) {
  if (!camera || !canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);

  const roots = opts.roots ?? Object.values(layers);
  const hits = raycaster.intersectObjects(roots, true);
  for (const hit of hits) {
    const tagged = findTagged(hit.object);
    if (!tagged) continue;
    const p = hit.point;
    return {
      kind: tagged.userData.kind,
      id: tagged.userData.id ?? null,
      object: tagged,
      point: { x: p.x, y: p.y, z: p.z },
      tile: worldToTile(p.x, p.z),
    };
  }
  return null;
}

function findTagged(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.kind) return o;
    o = o.parent;
  }
  return null;
}

// Convenience: project a pointer event onto the ground plane (y=0) → {col,row}.
export function pickGround(event) {
  if (!camera || !canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const out = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(plane, out)) return null;
  return { point: { x: out.x, y: 0, z: out.z }, tile: worldToTile(out.x, out.z) };
}
