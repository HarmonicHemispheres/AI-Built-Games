// ============================================================================
// render/ambient.js — "living world" ambient motion: wind-sway on trees and the
// flowing-water shader clock. Render-only; reads nothing from game state and
// mutates nothing (CONTRACTS §0 "render is one-way").
//
// Two cheap effects, advanced by a single loop.onRender callback:
//   - Tree sway: each forest conifer is built (render/meshes.js) as a pivot group
//     tagged `userData.sway = { phase, amp }`. We collect those after the world
//     meshes are (re)built and lean each one on a slow sine — the trunk base stays
//     planted, the canopy rocks in the wind.
//   - Water flow: the shared animated water material (meshes.waterMaterial) carries
//     a `uTime` uniform its vertex shader reads to undulate the surface. We bump it
//     every frame so every water tile flows as one continuous sheet.
//
// app.js calls collectAmbient(layers.tiles) after (re)building tile meshes and
// clearAmbient() before disposing them; main.js calls initAmbient() once.
// ============================================================================

import { onRender } from "../loop.js";
import { waterMaterial } from "./meshes.js";

// Collected sway entries: { obj, phase, amp }. Rebuilt whenever the world meshes
// are rebuilt (fog expansion / new run), so we never hold refs to disposed trees.
const sways = [];
// Collected cloud caps (fog meshes) + their individual puffs, animated so the
// fog of war reads as living, drifting cloud cover rather than a static cap.
const clouds = []; // { obj, phase, baseX, baseY, baseZ }
const puffs = []; // { obj, phase, baseY }
let time = 0;
let initialized = false;

// Gather every animated object under `root` — swaying trees (tile layer) and
// drifting cloud caps (fog layer). Called after those meshes are (re)built so
// newly revealed forests/frontier clouds start moving too.
export function collectAmbient(root) {
  if (!root) return;
  root.traverse((node) => {
    const s = node.userData?.sway;
    if (s) sways.push({ obj: node, phase: s.phase || 0, amp: s.amp || 0.05 });
    const c = node.userData?.cloud;
    if (c) {
      clouds.push({
        obj: node,
        phase: c.phase || 0,
        baseX: node.position.x,
        baseY: node.position.y,
        baseZ: node.position.z,
      });
    }
    const p = node.userData?.puff;
    if (p) puffs.push({ obj: node, phase: p.phase || 0, baseY: p.baseY ?? node.position.y });
  });
}

// Drop all collected refs (the meshes are about to be disposed). The water
// material is shared/persistent, so it is never collected here — only its uTime
// is advanced, which is harmless when no water is on screen.
export function clearAmbient() {
  sways.length = 0;
  clouds.length = 0;
  puffs.length = 0;
}

// initAmbient() — register the single per-frame ambient updater. Idempotent.
export function initAmbient() {
  if (initialized) return;
  initialized = true;
  const wmat = waterMaterial();

  onRender((dt) => {
    // Clamp pathological frame gaps (tab refocus) so motion never jumps.
    time += Math.min(Math.max(dt || 0, 0), 0.1);

    // Flowing water: advance the shared shader clock (compiled lazily on first
    // render — guard until the uniform exists).
    const sh = wmat.userData.shader;
    if (sh && sh.uniforms && sh.uniforms.uTime) sh.uniforms.uTime.value = time;

    // Wind sway: lean each tree on a slow, phase-offset sine. Rotating the pivot
    // group rocks the canopy while the trunk base stays rooted.
    for (let i = 0; i < sways.length; i++) {
      const s = sways[i];
      s.obj.rotation.z = Math.sin(time * 1.5 + s.phase) * s.amp;
      s.obj.rotation.x = Math.cos(time * 1.2 + s.phase * 1.3) * s.amp * 0.55;
    }

    // Cloud caps: the whole cap bobs, sways, and slowly churns (yaw) around its
    // tile, while each puff billows on its own phase — so the fog reads as living
    // cloud cover. Amplitudes stay small so a cap never drifts off its tile.
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.obj.position.x = c.baseX + Math.sin(time * 0.35 + c.phase * 1.7) * 0.05;
      c.obj.position.y = c.baseY + Math.sin(time * 0.6 + c.phase) * 0.06;
      c.obj.position.z = c.baseZ + Math.cos(time * 0.3 + c.phase * 1.3) * 0.05;
      c.obj.rotation.y = Math.sin(time * 0.18 + c.phase) * 0.22;
    }
    // Per-puff billow: a small independent vertical bob layered on the cap motion.
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      p.obj.position.y = p.baseY + Math.sin(time * 0.9 + p.phase) * 0.04;
    }
  });
}
