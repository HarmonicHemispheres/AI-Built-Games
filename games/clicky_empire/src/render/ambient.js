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
let time = 0;
let initialized = false;

// Gather every swaying object under `root` (the tile layer). Called after the
// tile meshes are (re)built so newly revealed forests start swaying too.
export function collectAmbient(root) {
  if (!root) return;
  root.traverse((node) => {
    const s = node.userData?.sway;
    if (s) sways.push({ obj: node, phase: s.phase || 0, amp: s.amp || 0.05 });
  });
}

// Drop all collected sway refs (the meshes are about to be disposed). The water
// material is shared/persistent, so it is never collected here — only its uTime
// is advanced, which is harmless when no water is on screen.
export function clearAmbient() {
  sways.length = 0;
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
  });
}
