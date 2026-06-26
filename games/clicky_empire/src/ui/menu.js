// ============================================================================
// ui/menu.js — main menu, pregame config, cards collection, stats, settings.
//
// W3-UI owns this. Scene show/hide is handled by main.js; this module only fills
// the containers and changes scenes via the documented APIs:
//   setScene(SCENE.*)            — navigate between menu scenes
//   app.startRun({mapSize,seed}) — begin a run from the config form
//   persistence.saveMeta()       — persist settings
//   persistence.wipeSave()       — wipe + reload
//   catalog.CARDS / getCard      — collection screen
// See CONTRACTS §15 (menu.js).
// ============================================================================

import { state, SCENE, setScene, on } from "../state.js";
import { startRun } from "../app.js";
import { saveMeta, wipeSave } from "../persistence.js";
import { CARDS } from "../cards/catalog.js";
import { makeCardEl } from "./cards_render.js";

function $(id) {
  return document.getElementById(id);
}

// Config form local selection (defaults: 4x4, random seed).
let selectedSize = 4;

function isUnlocked(card) {
  if (!card) return false;
  if (card.tier === 1) return true; // tier-1 pool is always available
  return (state.meta?.unlockedCards || []).includes(card.id);
}

// --- Main menu --------------------------------------------------------------

function refreshMenuMeta() {
  const best = $("menu-best");
  const count = $("menu-cards-count");
  const renown = $("menu-renown");
  if (best) best.textContent = String(state.records?.bestRound ?? 0);
  if (renown) renown.textContent = String(state.meta?.renown ?? 0);
  if (count) {
    // Count distinct unlocked cards across the whole catalog.
    const unlocked = Object.values(CARDS).filter(isUnlocked).length;
    count.textContent = String(unlocked);
  }
}

function wireMenu() {
  $("btn-play")?.addEventListener("click", () => setScene(SCENE.CONFIG));
  $("btn-cards")?.addEventListener("click", () => setScene(SCENE.CARDS));
  $("btn-stats")?.addEventListener("click", () => setScene(SCENE.STATS));
  $("btn-settings")?.addEventListener("click", () => setScene(SCENE.SETTINGS));
}

// --- Config form ------------------------------------------------------------

function wireConfig() {
  const sizes = $("config-sizes");
  if (sizes) {
    sizes.addEventListener("click", (e) => {
      const btn = e.target.closest(".seg-btn");
      if (!btn) return;
      selectedSize = Number(btn.dataset.size) || 4;
      for (const b of sizes.querySelectorAll(".seg-btn")) {
        b.classList.toggle("active", b === btn);
      }
    });
  }
  $("btn-config-back")?.addEventListener("click", () => setScene(SCENE.MENU));
  $("btn-config-start")?.addEventListener("click", () => {
    const seedInput = $("config-seed");
    const seed = seedInput ? seedInput.value.trim() : "";
    startRun({ mapSize: selectedSize, seed });
  });
}

// --- Cards collection -------------------------------------------------------

function renderCollection() {
  const list = $("cards-list");
  if (!list) return;
  list.innerHTML = "";
  const all = Object.values(CARDS);
  let unlocked = 0;
  // Sort by tier then type for a readable grid.
  const sorted = [...all].sort(
    (a, b) => a.tier - b.tier || String(a.type).localeCompare(String(b.type)),
  );
  for (const card of sorted) {
    const open = isUnlocked(card);
    if (open) unlocked += 1;
    list.appendChild(makeCardEl(card, { locked: !open, affordable: true }));
  }
  const prog = $("cards-progress");
  if (prog) prog.textContent = `${unlocked} / ${all.length} unlocked`;
}

function wireCards() {
  $("btn-cards-back")?.addEventListener("click", () => setScene(SCENE.MENU));
}

// --- Stats ------------------------------------------------------------------

function renderStats() {
  const rec = state.records || {};
  const set = (id, v) => {
    const el = $(id);
    if (el) el.textContent = String(v ?? 0);
  };
  set("stat-best", rec.bestRound);
  set("stat-runs", rec.totalRuns);
  set("stat-kills", rec.totalKills);
  set("stat-renown", rec.totalRenownEarned);
  set("stat-cards", Object.values(CARDS).filter(isUnlocked).length);
}

function wireStats() {
  $("btn-stats-back")?.addEventListener("click", () => setScene(SCENE.MENU));
}

// --- Settings ---------------------------------------------------------------

function syncSettingsInputs() {
  const s = state.meta?.settings || {};
  const sfx = $("set-sfx");
  const music = $("set-music");
  if (sfx) sfx.value = String(s.sfxVolume ?? 0.8);
  if (music) music.value = String(s.musicVolume ?? 0.6);
}

function wireSettings() {
  const sfx = $("set-sfx");
  const music = $("set-music");
  if (sfx) {
    sfx.addEventListener("input", () => {
      state.meta.settings.sfxVolume = Number(sfx.value);
      saveMeta();
    });
  }
  if (music) {
    music.addEventListener("input", () => {
      state.meta.settings.musicVolume = Number(music.value);
      saveMeta();
    });
  }
  $("btn-settings-back")?.addEventListener("click", () => setScene(SCENE.MENU));
  $("btn-wipe-save")?.addEventListener("click", () => {
    wipeSave();
    // Reload to re-hydrate state from the freshly blanked save.
    try {
      window.location.reload();
    } catch {
      // Fallback if reload is unavailable: refresh the menu in place.
      refreshMenuMeta();
      setScene(SCENE.MENU);
    }
  });
}

// --- Init -------------------------------------------------------------------

export function initMenu() {
  wireMenu();
  wireConfig();
  wireCards();
  wireStats();
  wireSettings();

  // Populate scenes when they become visible (records/settings/unlocks may
  // change between visits).
  on("scene-changed", ({ scene }) => {
    if (scene === SCENE.MENU) refreshMenuMeta();
    else if (scene === SCENE.CARDS) renderCollection();
    else if (scene === SCENE.STATS) renderStats();
    else if (scene === SCENE.SETTINGS) syncSettingsInputs();
  });

  // Initial paint (boot lands on the menu).
  refreshMenuMeta();
  syncSettingsInputs();
}
