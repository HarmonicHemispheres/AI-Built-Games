// ============================================================================
// render/fx.js — visual juice for Clicky Empire (W1-Render).
//
// Owns the lightweight, self-retiring effects (CONTRACTS §13):
//   - floatingNumber(worldPos, text, colorHex) — "+5" / damage pops as sprites
//   - harvestPop(worldPos, resourceType)        — colored sprite + a little burst
//   - toppleFigure(group, figureIndex)          — tip a cluster figure over & sink
//   - placePop(group)                           — scale-pop a freshly placed mesh
//   - screenShake(amount)                        — briefly nudge the iso camera
//   - initFx()                                   — register the per-frame updater
//
// All effects register into a single active-effect list advanced by one
// loop.onRender callback. fx attaches its sprites to layers.fx and only READS
// state — it never mutates game state (render is one-way, CONTRACTS §0).
// ============================================================================

import * as THREE from "three";
import { layers, cameraApi } from "./scene.js";
import { onRender } from "../loop.js";
import { easeOutCubic, easeOutBack, clamp01 } from "../util/math.js";

// ---------------------------------------------------------------------------
// Active-effect registry. Each effect is { t, dur, update(dt,k), done }.
// update() runs each frame with elapsed-normalized k = t/dur in [0,1].
// When t >= dur (or effect requests it) the effect's cleanup runs and it is
// removed. Effects pool nothing fancy; counts are small (tens at peak).
// ---------------------------------------------------------------------------

const effects = [];
let initialized = false;

// initFx() — register the single per-frame updater. Idempotent.
export function initFx() {
  if (initialized) return;
  initialized = true;
  onRender(update);
}

function update(dt) {
  // Guard against pathological dt (tab refocus) so animations don't jump.
  const d = Math.min(dt || 0, 0.1);

  // Advance camera shake first (it owns its own state, below).
  updateShake(d);

  for (let i = effects.length - 1; i >= 0; i--) {
    const fx = effects[i];
    fx.t += d;
    const k = fx.dur > 0 ? clamp01(fx.t / fx.dur) : 1;
    let keep = true;
    try {
      keep = fx.update(d, k) !== false && fx.t < fx.dur;
    } catch (_e) {
      keep = false; // never let a broken effect wedge the loop
    }
    if (!keep) {
      fx.cleanup?.();
      effects.splice(i, 1);
    }
  }
}

function push(fx) {
  fx.t = 0;
  effects.push(fx);
  return fx;
}

// ---------------------------------------------------------------------------
// Floating numbers — canvas-textured sprites that rise + fade.
// ---------------------------------------------------------------------------

// Cache textures by "text|color" so repeated identical pops don't re-rasterize.
const _textTexCache = new Map();
const TEX_CACHE_CAP = 64;

function makeTextTexture(text, colorHex) {
  const key = `${text}|${colorHex}`;
  const cached = _textTexCache.get(key);
  if (cached) return cached;

  const cvs = document.createElement("canvas");
  cvs.width = 256;
  cvs.height = 128;
  const ctx = cvs.getContext("2d");
  const css = "#" + (colorHex >>> 0).toString(16).padStart(6, "0").slice(-6);

  ctx.clearRect(0, 0, cvs.width, cvs.height);
  ctx.font = "bold 86px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(20,24,30,0.9)"; // dark outline for legibility
  ctx.strokeText(text, 128, 64);
  ctx.fillStyle = css;
  ctx.fillText(text, 128, 64);

  const tex = new THREE.CanvasTexture(cvs);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  if (_textTexCache.size >= TEX_CACHE_CAP) {
    // drop the oldest entry (its texture may still be referenced by a live
    // sprite; the sprite owns disposal via its own cleanup, so just evict).
    const firstKey = _textTexCache.keys().next().value;
    _textTexCache.delete(firstKey);
  }
  _textTexCache.set(key, tex);
  return tex;
}

// floatingNumber(worldPos, text, colorHex) — a sprite that floats up and fades.
// worldPos: {x,y,z}; text: string; colorHex: number (e.g. 0xffffff white,
// 0xffd24a gold-crit). Returns the sprite (mostly for tests).
export function floatingNumber(worldPos, text, colorHex = 0xffffff) {
  const tex = makeTextTexture(String(text), colorHex);
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  mat.userData = { __shared: false };
  const sprite = new THREE.Sprite(mat);
  const base = 0.7;
  sprite.scale.set(base * 2, base, 1); // 2:1 to match the 256x128 canvas
  sprite.position.set(worldPos.x, (worldPos.y ?? 0) + 0.6, worldPos.z);
  sprite.renderOrder = 999;
  layers.fx.add(sprite);

  const startY = sprite.position.y;
  push({
    dur: 1.1,
    update: (_d, k) => {
      sprite.position.y = startY + easeOutCubic(k) * 1.1;
      const pop = k < 0.18 ? easeOutBack(k / 0.18) : 1; // little pop-in
      sprite.scale.set(base * 2 * pop, base * pop, 1);
      mat.opacity = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
    },
    cleanup: () => {
      layers.fx.remove(sprite);
      mat.dispose(); // texture is shared/cached — leave it
    },
  });
  return sprite;
}

// ---------------------------------------------------------------------------
// Harvest pop — a "+1" colored number plus a tiny burst of resource-colored
// chips. resourceType ∈ {gold, wood, iron, food} (anything else => neutral).
// ---------------------------------------------------------------------------

const RESOURCE_COLOR = {
  gold: 0xffcf3a,
  wood: 0x9c6b3a,
  iron: 0xc8d0d8,
  food: 0x8fd14a,
};

export function harvestPop(worldPos, resourceType) {
  const color = RESOURCE_COLOR[resourceType] ?? 0xffffff;

  // The number.
  floatingNumber(worldPos, "+1", color);

  // A short burst of a few low-cost chip sprites, tinted to the resource color.
  const tex = chipTexture();
  const n = 5;
  const chips = [];
  const vels = [];
  for (let i = 0; i < n; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      color, // tint the white chip to the resource hue
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(0.16);
    s.position.set(worldPos.x, (worldPos.y ?? 0) + 0.3, worldPos.z);
    s.renderOrder = 998;
    layers.fx.add(s);
    chips.push(s);
    const a = (i / n) * Math.PI * 2 + Math.random();
    const sp = 0.9 + Math.random() * 0.5;
    vels.push({ x: Math.cos(a) * sp, y: 1.6 + Math.random() * 0.8, z: Math.sin(a) * sp });
  }

  push({
    dur: 0.55,
    update: (d, k) => {
      for (let i = 0; i < chips.length; i++) {
        const v = vels[i];
        v.y -= 7 * d; // gravity
        chips[i].position.x += v.x * d;
        chips[i].position.y += v.y * d;
        chips[i].position.z += v.z * d;
        chips[i].material.opacity = 1 - k;
      }
    },
    cleanup: () => {
      for (const c of chips) {
        layers.fx.remove(c);
        c.material.dispose();
      }
    },
  });
}

let _chipTexShared = null;
function chipTexture() {
  // A single soft white round chip, baked once. Each sprite tints it to the
  // resource color via SpriteMaterial.color.
  if (_chipTexShared) return _chipTexShared;
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 32;
  const ctx = cvs.getContext("2d");
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  _chipTexShared = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// Topple figure — the readable HP system. Tip a cluster figure over and sink
// it slightly into the ground, then hide it. Idempotent per figure.
// ---------------------------------------------------------------------------

// toppleFigure(group, figureIndex) — `group` is a unit/enemy group from
// meshes.buildUnitGroup/buildEnemyGroup carrying userData.figures.
export function toppleFigure(group, figureIndex) {
  const figures = group?.userData?.figures;
  if (!figures) return;
  const fig = figures[figureIndex];
  if (!fig || fig.userData.toppled) return;
  fig.userData.toppled = true;

  // Tip direction: away from the cluster center for a natural fan-out.
  const dirAngle = Math.atan2(fig.position.z || 0.001, fig.position.x || 0.001);
  const axisX = -Math.sin(dirAngle);
  const axisZ = Math.cos(dirAngle);
  const startRotX = fig.rotation.x;
  const startRotZ = fig.rotation.z;
  const startY = fig.position.y;

  push({
    dur: 0.6,
    update: (_d, k) => {
      const e = easeOutCubic(k);
      // rotate ~90° about the horizontal tip axis
      fig.rotation.x = startRotX + axisX * (Math.PI / 2) * e;
      fig.rotation.z = startRotZ + axisZ * (Math.PI / 2) * e;
      // sink into the ground over the back half
      const sink = k > 0.5 ? (k - 0.5) / 0.5 : 0;
      fig.position.y = startY - sink * 0.28;
    },
    cleanup: () => {
      fig.visible = false; // gone for good; HP = standing figures
      fig.userData.standing = false;
    },
  });

  // If the whole cluster is down, drop the flag for the "unit destroyed" read.
  const allDown = figures.every((f) => f.userData.toppled);
  if (allDown && group.userData.banner && !group.userData.bannerFell) {
    dropBanner(group);
  }
}

// attackBob(group) — telegraph an attack with a quick little hop of the standing
// figures. Cheap and self-retiring; skips toppled figures and won't stack on a
// figure already mid-hop. Animates each figure's LOCAL y (the group's world
// position is rewritten every frame from logic, so we never touch that).
export function attackBob(group) {
  const figures = group?.userData?.figures;
  if (!figures) return;
  for (let i = 0; i < figures.length; i++) {
    const fig = figures[i];
    if (!fig || fig.userData.toppled || fig.userData.bobbing) continue;
    fig.userData.bobbing = true;
    const baseY = fig.userData.homeY ?? fig.position.y;
    const hop = 0.09 + (i % 3) * 0.015; // slight per-figure stagger in height
    push({
      dur: 0.24,
      update: (_d, k) => {
        if (fig.userData.toppled) return false; // got killed mid-hop — bail
        fig.position.y = baseY + Math.sin(k * Math.PI) * hop;
      },
      cleanup: () => {
        if (!fig.userData.toppled) fig.position.y = baseY;
        fig.userData.bobbing = false;
      },
    });
  }
}

function dropBanner(group) {
  const banner = group.userData.banner;
  group.userData.bannerFell = true;
  const startRotZ = banner.rotation.z;
  const startY = banner.position.y;
  push({
    dur: 0.7,
    update: (_d, k) => {
      const e = easeOutCubic(k);
      banner.rotation.z = startRotZ - (Math.PI / 2) * e;
      banner.position.y = startY - e * 0.1;
    },
  });
}

// ---------------------------------------------------------------------------
// Place pop — scale a freshly placed building/mesh up from zero with a bounce.
// ---------------------------------------------------------------------------

export function placePop(group) {
  if (!group) return;
  // Preserve any intended final scale (e.g. keep's 0.85).
  const target = group.scale.clone();
  group.scale.set(target.x * 0.01, target.y * 0.01, target.z * 0.01);
  push({
    dur: 0.45,
    update: (_d, k) => {
      const e = easeOutBack(k);
      group.scale.set(target.x * e, target.y * e, target.z * e);
    },
    cleanup: () => {
      group.scale.copy(target); // land exactly on target
    },
  });
}

// ---------------------------------------------------------------------------
// Arrow projectile — a slim dart that flies from a shooter (tower / castle) to
// its target, then retires. Triggered by 'projectile-fire' (wired in main.js).
// ---------------------------------------------------------------------------

let _arrowGeo = null;
function arrowGeo() {
  if (_arrowGeo) return _arrowGeo;
  // A slim dart; rotate so the tip points toward +Z and we can aim it by dir.
  _arrowGeo = new THREE.ConeGeometry(0.05, 0.34, 6);
  _arrowGeo.rotateX(Math.PI / 2);
  _arrowGeo.userData.__shared = true;
  return _arrowGeo;
}

const _zAxis = new THREE.Vector3(0, 0, 1);

// shootArrow(from, to, colorHex) — from/to are {x,y?,z}. Returns the mesh.
export function shootArrow(from, to, colorHex = 0x4b3522) {
  const start = { x: from.x, y: from.y ?? 0.7, z: from.z };
  const end = { x: to.x, y: to.y ?? 0.45, z: to.z };
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const horiz = Math.hypot(dx, dz);

  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  const arrow = new THREE.Mesh(arrowGeo(), mat);
  const dir = new THREE.Vector3(dx, 0, dz).normalize();
  arrow.quaternion.setFromUnitVectors(_zAxis, dir.lengthSq() ? dir : _zAxis);
  arrow.position.set(start.x, start.y, start.z);
  arrow.renderOrder = 5;
  layers.fx.add(arrow);

  const dur = Math.min(0.32, 0.07 + horiz * 0.035);
  push({
    dur,
    update: (_d, k) => {
      arrow.position.set(
        start.x + dx * k,
        start.y + (end.y - start.y) * k + Math.sin(k * Math.PI) * 0.18, // slight arc
        start.z + dz * k,
      );
    },
    cleanup: () => {
      layers.fx.remove(arrow);
      mat.dispose(); // geometry is shared — keep it
    },
  });
  return arrow;
}

// ---------------------------------------------------------------------------
// Screen shake — briefly jitter the camera pivot, then settle. Reads/writes
// only via cameraApi (no direct camera mutation). Decays exponentially.
// ---------------------------------------------------------------------------

const shake = { amount: 0, decay: 6, offX: 0, offZ: 0 };

export function screenShake(amount = 0.4) {
  // Accumulate so back-to-back hits stack (capped).
  shake.amount = Math.min(shake.amount + amount, 1.5);
}

function updateShake(dt) {
  if (shake.amount <= 0.0001 && shake.offX === 0 && shake.offZ === 0) return;

  shake.amount = Math.max(0, shake.amount - shake.decay * dt * shake.amount);
  if (shake.amount < 0.01) {
    shake.amount = 0;
    shake.offX = 0;
    shake.offZ = 0;
    cameraApi.setShakeOffset(0, 0); // clear the transient offset
    return;
  }

  // Feed a fresh jittered offset to the camera rig. scene.js applies it on top of
  // the eased look-pivot, so shake never fights the camera smoothing or drifts.
  const mag = shake.amount * 0.25;
  shake.offX = (Math.random() * 2 - 1) * mag;
  shake.offZ = (Math.random() * 2 - 1) * mag;
  cameraApi.setShakeOffset(shake.offX, shake.offZ);
}

// ---------------------------------------------------------------------------
// Test/debug hook: how many effects are currently live.
// ---------------------------------------------------------------------------
export function _activeEffectCount() {
  return effects.length;
}
