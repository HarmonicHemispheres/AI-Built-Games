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
import { onUpdate } from "../loop.js";

// Post-processing + image-based lighting come from three/addons (mapped in
// index.html's importmap, so this needs NO build step). The composer is built
// inside a try/catch in initScene so a load/runtime failure degrades gracefully
// to a plain forward render — the game never breaks if a pass is unavailable.
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

// ---------------------------------------------------------------------------
// "Diorama in the clouds" palette. An OVERCAST sky gradient (soft blue-grey up,
// pale cloud-white low) plus cloud-colored fog pulled in fairly close, so the
// surrounding ground plane dissolves into cloud cover instead of stretching out
// as a flat green field. The board reads as an island emerging from the mist.
// ---------------------------------------------------------------------------
const SKY_TOP = "#bccad6"; // soft overcast blue-grey
const SKY_HORIZON = "#d8e1e8"; // pale cloud-white near the horizon
const FOG_COLOR = 0xd2dde5; // cloud-white — distant geometry fades to this

function makeSkyTexture(topCss, bottomCss) {
  const cvs = document.createElement("canvas");
  cvs.width = 4;
  cvs.height = 256;
  const ctx = cvs.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, topCss);
  g.addColorStop(1, bottomCss);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export const scene = new THREE.Scene();
scene.background = makeSkyTexture(SKY_TOP, SKY_HORIZON);
// Atmospheric depth: pulled in close so the big ground plane just beyond the
// board melts into cloud cover rather than reading as an endless green field.
scene.fog = new THREE.Fog(FOG_COLOR, 20, 56);

export let renderer = null;
export let camera = null;
let composer = null; // EffectComposer when post-processing is active; else null
let tiltPass = null; // tilt-shift + cloud-vignette ShaderPass (needs resize updates)

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

// `rig` is what's actually rendered; `goal` is where the player's input wants it.
// Each frame we ease rig → goal (updateCameraSmoothing) so pans/zooms/yaw turns
// glide instead of snapping. minRadius/maxRadius are shared limits.
const LIMITS = { minRadius: 7, maxRadius: 34 };
const rig = {
  pivot: new THREE.Vector3(0, 0, 0),
  phi: Math.PI / 4, // polar from +Y → 45° = a 45° down-angle
  theta: Math.PI / 4, // yaw; turns in 90° steps, eased; start corner-on
  radius: 16, // zoom distance
};
const goal = {
  pivot: rig.pivot.clone(),
  phi: rig.phi,
  theta: rig.theta,
  radius: rig.radius,
};
// Transient screen-shake offset on the look pivot (set by fx via setShakeOffset).
// Kept separate from rig/goal so shake never fights the easing or accumulates.
let shakeX = 0;
let shakeZ = 0;
// How fast the camera chases its goal (higher = snappier). Used as 1-e^(-dt*k)
// so the feel is identical at any frame rate.
const CAM_SMOOTH = 12;

function applyCamera() {
  if (!camera) return;
  const { phi, theta, radius } = rig;
  const px = rig.pivot.x + shakeX;
  const py = rig.pivot.y;
  const pz = rig.pivot.z + shakeZ;
  const sinPhi = Math.sin(phi);
  camera.position.set(
    px + radius * sinPhi * Math.sin(theta),
    py + radius * Math.cos(phi),
    pz + radius * sinPhi * Math.cos(theta),
  );
  camera.lookAt(px, py, pz);
}

// Per-frame easing toward `goal` (registered on the update loop in initScene).
function updateCameraSmoothing(dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) * CAM_SMOOTH);
  rig.radius += (goal.radius - rig.radius) * k;
  rig.theta += (goal.theta - rig.theta) * k;
  rig.phi += (goal.phi - rig.phi) * k;
  rig.pivot.lerp(goal.pivot, k);
  applyCamera();
}

// Camera-space forward/right on the ground plane (for yaw-relative panning).
// Uses the GOAL yaw so panning direction matches where the camera is heading.
function groundBasis() {
  const fwd = new THREE.Vector3(-Math.sin(goal.theta), 0, -Math.cos(goal.theta));
  const right = new THREE.Vector3(Math.cos(goal.theta), 0, -Math.sin(goal.theta));
  return { fwd, right };
}

export const cameraApi = {
  // Snap instantly (used at run start so the board doesn't fly in from origin).
  centerOn(col, row) {
    goal.pivot.set(col, 0, row);
    rig.pivot.copy(goal.pivot);
    applyCamera();
  },
  // Eased recenter (e.g. focus a selection): set the goal, let smoothing glide.
  setTarget(x, z) {
    goal.pivot.set(x, 0, z);
  },
  // Pan in screen-relative units (dx = right, dy = forward).
  panBy(dx, dy) {
    const { fwd, right } = groundBasis();
    goal.pivot.addScaledVector(right, dx);
    goal.pivot.addScaledVector(fwd, dy);
  },
  zoomBy(delta) {
    goal.radius = clamp(goal.radius + delta, LIMITS.minRadius, LIMITS.maxRadius);
  },
  // Rotate yaw by ±90° (eased into place by the smoothing).
  rotateYaw(dir) {
    goal.theta += (dir >= 0 ? 1 : -1) * (Math.PI / 2);
  },
  // fx.screenShake feeds a transient look-pivot offset here; decoupled from the
  // easing so a hit-shake reads correctly and self-clears.
  setShakeOffset(x, z) {
    shakeX = x;
    shakeZ = z;
    applyCamera();
  },
  get state() {
    return { ...rig, ...LIMITS, pivot: rig.pivot.clone() };
  },
};

// --- Init / resize ----------------------------------------------------------

export function initScene(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Filmic grade: ACES tone mapping lifts the whole scene out of "flat linear"
  // into a graded, golden-hour look. Exposure nudged just above 1 to keep the
  // saturated low-poly colors from going muddy.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);

  // Image-based lighting: a neutral indoor "room" baked to a PMREM env map gives
  // every PBR surface subtle ambient + reflections (silver helms/blades glint,
  // stone reads less flat) without a heavy HDR download. Falls back silently.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.traverse?.((o) => o.geometry?.dispose?.());
    pmrem.dispose();
  } catch (_e) {
    /* no env map — direct lights still light the scene */
  }

  // Lights: a low, warm "golden-hour" sun for long raking shadows, plus a gentle
  // sky/ground hemi + a little ambient (the env map now carries most of the fill,
  // so ambient is dialed back from the old flat setup).
  const sun = new THREE.DirectionalLight(0xffe7c0, 2.5);
  sun.position.set(13, 10, 7); // lower angle than before → longer shadows
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  const s = 26;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 70 });
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd2f0, 0.2));
  scene.add(new THREE.HemisphereLight(0xdfe2f2, 0x4a6b3a, 0.24));

  // A large ground plane under the board. Slightly deeper/desaturated than the
  // tiles so the play area reads as the hero; fog melts its far edge into the sky.
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x4f9a45, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  ground.userData = { kind: "ground" };
  layers.ground.add(ground);

  onResize();
  buildComposer();
  // Ease the camera toward its goal every frame (pan/zoom/yaw glide).
  onUpdate(updateCameraSmoothing);
  window.addEventListener("resize", onResize);
  applyCamera();
  return { renderer, scene, camera };
}

// ---------------------------------------------------------------------------
// Tilt-shift + cloud-vignette shader. The signature "miniature diorama" effect:
// a sharp central focus that blurs toward the edges, and a LIGHT vignette that
// fades those blurred edges into cloud-white — so the surrounding green field
// dissolves into a clouded "edge of the known world" instead of a hard border.
// One pass does both (distance-from-center drives the blur amount AND the cloud
// mix). Operates on the final sRGB image, so colours are plain sRGB values.
// ---------------------------------------------------------------------------
const TiltShiftCloudShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBlurStrength: { value: 7.0 }, // max edge blur radius, in px
    uFocusRadius: { value: 0.26 }, // aspect-corrected radius kept sharp
    uFocusSoftness: { value: 0.42 }, // how far the blur ramps to full
    uCloudColor: { value: new THREE.Vector3(0.86, 0.9, 0.93) }, // sRGB cloud-white
    uCloudStart: { value: 0.4 }, // edge cloud fade begins
    uCloudEnd: { value: 0.72 }, // fully cloud by here (corners)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uBlurStrength;
    uniform float uFocusRadius;
    uniform float uFocusSoftness;
    uniform vec3 uCloudColor;
    uniform float uCloudStart;
    uniform float uCloudEnd;
    varying vec2 vUv;

    void main() {
      // Aspect-corrected distance from screen center (a true circle on screen).
      vec2 c = vUv - 0.5;
      c.x *= uResolution.x / uResolution.y;
      float d = length(c);

      // Tilt-shift: sharp center, blur ramps up toward the edges.
      float blur = smoothstep(uFocusRadius, uFocusRadius + uFocusSoftness, d);
      float radius = blur * uBlurStrength;

      vec4 col = texture2D(tDiffuse, vUv);
      if (radius > 0.5) {
        vec2 px = vec2(radius) / uResolution; // px radius -> UV step
        vec4 sum = col;
        sum += texture2D(tDiffuse, vUv + vec2( px.x, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2(-px.x, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2( 0.0,  px.y));
        sum += texture2D(tDiffuse, vUv + vec2( 0.0, -px.y));
        sum += texture2D(tDiffuse, vUv + vec2( 0.7 * px.x,  0.7 * px.y));
        sum += texture2D(tDiffuse, vUv + vec2(-0.7 * px.x,  0.7 * px.y));
        sum += texture2D(tDiffuse, vUv + vec2( 0.7 * px.x, -0.7 * px.y));
        sum += texture2D(tDiffuse, vUv + vec2(-0.7 * px.x, -0.7 * px.y));
        sum += texture2D(tDiffuse, vUv + vec2( 1.7 * px.x, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2(-1.7 * px.x, 0.0));
        sum += texture2D(tDiffuse, vUv + vec2( 0.0,  1.7 * px.y));
        sum += texture2D(tDiffuse, vUv + vec2( 0.0, -1.7 * px.y));
        col = sum / 13.0;
      }

      // Light cloud "vignette": fade the blurred edges into cloud-white so the
      // board reads as an island in a clouded fog of war.
      float cloud = smoothstep(uCloudStart, uCloudEnd, d);
      vec3 outc = mix(col.rgb, uCloudColor, cloud);

      gl_FragColor = vec4(outc, col.a);
    }
  `,
};

// Assemble the post-processing chain. Wrapped so any addon/runtime failure leaves
// `composer = null` and render() falls back to a plain forward render.
//   RenderPass → UnrealBloom → OutputPass → SMAA → TiltShift+CloudVignette
// (Ambient occlusion was dropped — see the NOTE below.)
function buildComposer() {
  try {
    const w = canvasEl.clientWidth || window.innerWidth;
    const h = canvasEl.clientHeight || window.innerHeight;
    // HDR (half-float) target so bloom has real headroom; SMAA does the AA.
    const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
    const c = new EffectComposer(renderer, target);
    c.setPixelRatio(renderer.getPixelRatio());
    c.setSize(w, h);

    c.addPass(new RenderPass(scene, camera));

    // NOTE: ambient occlusion (GTAOPass) was removed here. Its full-scene depth
    // prepass ignores `depthTest:false` and writes our camera-facing UI overlays
    // (production bars, floating "+1" pops, selection rings) into its depth at the
    // near plane, so it computed them as fully self-occluded and multiplied them
    // to solid BLACK panes. Grounding/AO can return later via baked AO or a pass
    // that excludes the fx/overlay layers — see the visual-polish roadmap.

    // Very gentle, high-threshold bloom: just a faint kiss of glow on the
    // genuinely bright emitters (wizard orb, gold pops). Kept tiny so it doesn't
    // veil the scene. UnrealBloomPass(resolution, strength, radius, threshold).
    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.08, 0.25, 0.95);
    c.addPass(bloom);

    // Tone mapping + sRGB conversion happen here (reads renderer.toneMapping).
    c.addPass(new OutputPass());
    // Anti-alias the sharp central image before the edges get blurred away.
    c.addPass(new SMAAPass(w, h));

    // Final pass: tilt-shift edge blur + cloud vignette (the miniature look).
    tiltPass = new ShaderPass(TiltShiftCloudShader);
    tiltPass.uniforms.uResolution.value.set(w, h);
    c.addPass(tiltPass);

    composer = c;
  } catch (_e) {
    composer = null; // graceful fallback to renderer.render in render()
  }
}

function onResize() {
  if (!renderer || !canvasEl) return;
  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (composer) {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h); // forwards to every pass (bloom/smaa/shader)
    if (tiltPass) tiltPass.uniforms.uResolution.value.set(w, h);
  }
}

export function render() {
  // Post-processed path when the composer is live; otherwise a plain forward
  // render (fallback if any addon failed to load).
  if (composer) composer.render();
  else renderer.render(scene, camera);
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
