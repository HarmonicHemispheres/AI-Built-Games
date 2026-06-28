// ============================================================================
// render/stack_badges.js — "N stacked units" count badges. THREE module.
//
// When several of the player's units pile onto the SAME tile their figure
// clusters overlap and you can't tell how many are there. This draws a small
// white disc with a black count over each such stack so the size is readable at
// a glance (a unit count, not HP — HP is still the standing-figure block).
//
// One-way render (CONTRACTS §0): reads state.units only; never mutates state.
// Runs once per frame off loop.onRender. Badges are camera-facing sprites with
// depthTest off so they always sit on top of the cluster they label.
// ============================================================================

import * as THREE from "three";
import { state, SCENE } from "../state.js";
import { layers } from "./scene.js";
import { onRender } from "../loop.js";
import { worldToTile, tileKey } from "../util/math.js";

// How high above the ground the badge floats (clear of the ~0.5-tall figures).
const BADGE_Y = 1.4;
// World-space size of the disc sprite. Perspective shrinks it with distance,
// which keeps it tied to "near them" rather than as a fixed-size HUD chip.
const BADGE_SIZE = 0.62;

// Rasterized disc textures, cached by label so a stack of N reuses one texture.
const texCache = new Map();
// A growable pool of badge sprites; we light up the first `k` each frame (one
// per stacked tile) and hide the rest. Stacks are few, so the pool stays tiny.
const pool = [];
// Scratch reused each frame: tileKey -> { sumX, sumZ, n }.
const clusters = new Map();

let initialized = false;

// initStackBadges() — register the per-frame badge updater. Idempotent.
export function initStackBadges() {
  if (initialized) return;
  initialized = true;
  onRender(update);
}

function badgeTexture(label) {
  const cached = texCache.get(label);
  if (cached) return cached;

  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 128;
  const ctx = cvs.getContext("2d");
  ctx.clearRect(0, 0, 128, 128);

  // White disc with a soft dark rim so it reads on bright grass and dark forest.
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(20,24,30,0.85)";
  ctx.stroke();

  // Black count, sized down a notch for the wider "N+" labels.
  ctx.fillStyle = "#14181e";
  ctx.font = `bold ${label.length > 2 ? 48 : 62}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 64, 68);

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  texCache.set(label, tex);
  return tex;
}

function makeBadge() {
  const mat = new THREE.SpriteMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false, // a UI chip — stay crisp white, don't tint toward distance fog
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(BADGE_SIZE, BADGE_SIZE, 1);
  sprite.renderOrder = 1000; // above figures, fx, and selection rings
  sprite.visible = false;
  layers.fx.add(sprite);
  const badge = { sprite, mat, label: null };
  pool.push(badge);
  return badge;
}

function countLabel(n) {
  return n > 99 ? "99+" : String(n);
}

function update() {
  // Only meaningful mid-run; outside it there are no units — hide everything.
  if (state.scene !== SCENE.RUN) {
    for (const b of pool) b.sprite.visible = false;
    return;
  }

  clusters.clear();

  // Group living player units by the tile under them.
  for (const u of state.units) {
    if (!u || !u.pos) continue;
    if (u.hp != null && u.hp <= 0) continue;
    const t = worldToTile(u.pos.x, u.pos.z);
    const key = tileKey(t.col, t.row);
    let c = clusters.get(key);
    if (!c) {
      c = { sumX: 0, sumZ: 0, n: 0 };
      clusters.set(key, c);
    }
    c.sumX += u.pos.x;
    c.sumZ += u.pos.z;
    c.n += 1;
  }

  // Light up one badge per stacked tile (n >= 2), centered on the cluster.
  let used = 0;
  for (const c of clusters.values()) {
    if (c.n < 2) continue;
    const badge = pool[used] || makeBadge();
    used += 1;
    const label = countLabel(c.n);
    if (badge.label !== label) {
      badge.mat.map = badgeTexture(label);
      badge.mat.needsUpdate = true;
      badge.label = label;
    }
    badge.sprite.position.set(c.sumX / c.n, BADGE_Y, c.sumZ / c.n);
    badge.sprite.visible = true;
  }

  // Hide any pooled badges not used this frame (a stack shrank or moved apart).
  for (let i = used; i < pool.length; i++) pool[i].sprite.visible = false;
}

// Test/debug hook: how many badges are currently visible.
export function _visibleBadgeCount() {
  let n = 0;
  for (const b of pool) if (b.sprite.visible) n++;
  return n;
}
