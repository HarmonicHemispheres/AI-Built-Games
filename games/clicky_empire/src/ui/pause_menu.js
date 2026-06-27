// ============================================================================
// ui/pause_menu.js — the in-run menu button (top-right) and the modal it opens.
//
// The modal PAUSES the run (app.pauseRun zeroes the time multiplier) and offers
// two tabs: MENU (resume / quit to menu) and SETTINGS (show-progress-bars,
// show-returns, and the volume sliders). Closing it resumes at the prior speed.
//
// W3-UI: only READS state, persists settings via saveMeta(), and drives the run
// via the documented app APIs (pauseRun / resumeRun / returnToMenu).
// ============================================================================

import { state, SCENE, on } from "../state.js";
import { pauseRun, resumeRun, returnToMenu } from "../app.js";
import { saveMeta } from "../persistence.js";

function $(id) {
  return document.getElementById(id);
}

let modal = null;

function isOpen() {
  return modal && !modal.classList.contains("hidden");
}

// Switch between the MENU and SETTINGS tabs.
function setTab(name) {
  if (!modal) return;
  for (const t of modal.querySelectorAll(".modal-tab")) {
    t.classList.toggle("active", t.dataset.tab === name);
  }
  $("tab-menu")?.classList.toggle("hidden", name !== "menu");
  $("tab-settings")?.classList.toggle("hidden", name !== "settings");
}

// Reflect current settings into the modal's inputs.
function syncInputs() {
  const s = state.meta?.settings || {};
  const bars = $("set-progress-bars");
  const ret = $("set-returns");
  const sfx = $("pm-set-sfx");
  const music = $("pm-set-music");
  if (bars) bars.checked = s.showProgressBars !== false;
  if (ret) ret.checked = !!s.showReturns;
  if (sfx) sfx.value = String(s.sfxVolume ?? 0.8);
  if (music) music.value = String(s.musicVolume ?? 0.6);
}

function open() {
  if (!modal || isOpen() || state.scene !== SCENE.RUN) return;
  syncInputs();
  setTab("menu");
  modal.classList.remove("hidden");
  pauseRun();
}

function close() {
  if (!isOpen()) return;
  modal.classList.add("hidden");
  resumeRun();
}

function quit() {
  modal?.classList.add("hidden");
  resumeRun(); // clear the paused flag; startRun resets speed to 1x next time
  returnToMenu();
}

function wire() {
  modal = $("pause-modal");
  if (!modal) return;

  $("btn-game-menu")?.addEventListener("click", open);
  $("btn-modal-close")?.addEventListener("click", close);
  $("btn-resume")?.addEventListener("click", close);
  $("btn-quit-menu")?.addEventListener("click", quit);

  for (const t of modal.querySelectorAll(".modal-tab")) {
    t.addEventListener("click", () => setTab(t.dataset.tab));
  }

  // A click on the dimmed backdrop (outside the card) resumes.
  modal.addEventListener("pointerdown", (e) => {
    if (e.target === modal) close();
  });

  // --- Settings inputs (persist immediately) ---
  const bars = $("set-progress-bars");
  const ret = $("set-returns");
  const sfx = $("pm-set-sfx");
  const music = $("pm-set-music");
  bars?.addEventListener("change", () => {
    state.meta.settings.showProgressBars = bars.checked;
    saveMeta();
  });
  ret?.addEventListener("change", () => {
    state.meta.settings.showReturns = ret.checked;
    saveMeta();
  });
  sfx?.addEventListener("input", () => {
    state.meta.settings.sfxVolume = Number(sfx.value);
    saveMeta();
  });
  music?.addEventListener("input", () => {
    state.meta.settings.musicVolume = Number(music.value);
    saveMeta();
  });

  // Esc closes the modal (resumes). Opening is button-only so Esc never fights
  // building-placement cancel (place.js owns Esc while a ghost is active).
  window.addEventListener("keydown", (e) => {
    if ((e.key === "Escape" || e.key === "Esc") && isOpen()) close();
  });

  // If the run ends some other way while the modal is up (e.g. game over),
  // force it closed without re-pausing the now-dead run.
  on("scene-changed", ({ scene }) => {
    if (scene !== SCENE.RUN && isOpen()) modal.classList.add("hidden");
  });
}

export function initPauseMenu() {
  wire();
}
