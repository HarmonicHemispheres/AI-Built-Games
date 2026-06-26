// ============================================================================
// ui/overlays.js — transient banners/toasts in #overlay-root and the game-over
// result screen.
//
// W3-UI owns this. It only READS state, listens to events, and calls one API:
//   app.returnToMenu() — the result screen's MAIN MENU button
//
// #overlay-root is click-through (pointer-events:none in CSS); the banners we
// add are also non-interactive, so the 3D board behind the HUD stays clickable
// during the RUN scene. See CONTRACTS §15 (overlays.js).
// ============================================================================

import { state, on } from "../state.js";
import { returnToMenu } from "../app.js";

function $(id) {
  return document.getElementById(id);
}

// Add a transient element to #overlay-root that removes itself after `ms`.
function flash(el, ms) {
  const root = $("overlay-root");
  if (!root) return;
  root.appendChild(el);
  setTimeout(() => {
    if (el.parentNode === root) root.removeChild(el);
  }, ms);
}

// --- WAVE INCOMING banner ---------------------------------------------------

function showWaveBanner(payload) {
  const round = payload?.round ?? state.run?.round ?? "";
  const banner = document.createElement("div");
  banner.className = "wave-banner";
  banner.innerHTML = `WAVE INCOMING<small>ROUND ${round}</small>`;
  flash(banner, 2000);
}

// --- Tier-unlock toast ------------------------------------------------------

function showTierToast(payload) {
  const tier = payload?.tier ?? state.run?.tier ?? "";
  const toast = document.createElement("div");
  toast.className = "tier-toast";
  toast.textContent = `TIER ${tier} UNLOCKED`;
  flash(toast, 2600);
}

// --- Game-over result screen ------------------------------------------------

function showResult(payload) {
  const rounds = payload?.round ?? state.run?.round ?? 0;
  const kills = payload?.kills ?? state.run?.kills ?? 0;
  const best = state.records?.bestRound ?? 0;
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = String(v);
  };
  // Note: main.js increments records on game-over too; bestRound already
  // reflects this run by the time the OVER scene paints.
  set("result-rounds", rounds);
  set("result-kills", kills);
  set("result-best", best);
}

function wireResult() {
  $("btn-result-menu")?.addEventListener("click", () => returnToMenu());
}

// --- Init -------------------------------------------------------------------

export function initOverlays() {
  wireResult();
  on("wave-incoming", showWaveBanner);
  on("tier-unlocked", showTierToast);
  on("game-over", showResult);
}
