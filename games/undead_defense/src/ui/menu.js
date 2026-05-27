import { state, SCENE, setScene } from "../state.js";
import { UNITS } from "../units/catalog.js";
import { saveMeta, wipeSave } from "../persistence.js";
import { playSfx } from "../audio/sfx.js";
import { renderCard } from "./card-art.js";

const $ = (sel) => document.querySelector(sel);

export function initMenu({ onNewRun }) {
  $("#btn-new-run").onclick = () => { playSfx("click"); onNewRun(); };
  $("#btn-cards").onclick = () => { playSfx("click"); showCollection(); };
  $("#btn-settings").onclick = () => { playSfx("click"); showSettings(); };
  $("#btn-cards-back").onclick = () => { playSfx("click"); hideOverlays(); };
  $("#btn-settings-back").onclick = () => { playSfx("click"); saveMeta(); hideOverlays(); };
  $("#btn-wipe-save").onclick = () => {
    if (confirm("Wipe all save data?")) { wipeSave(); location.reload(); }
  };
  // Settings inputs
  const sfx = $("#set-sfx"), shake = $("#set-shake");
  sfx.value = state.meta.settings.sfx;
  shake.checked = state.meta.settings.screenShake;
  sfx.oninput = () => { state.meta.settings.sfx = parseFloat(sfx.value); };
  shake.onchange = () => { state.meta.settings.screenShake = shake.checked; };
}

export function renderMenu() {
  $("#menu-scene").classList.toggle("hidden", state.scene !== SCENE.MENU);
  $("#best-round").textContent = state.meta.bestRound;
  $("#cards-unlocked").textContent = state.meta.unlockedCards.length;
}

function hideOverlays() {
  $("#cards-scene").classList.add("hidden");
  $("#settings-scene").classList.add("hidden");
  setScene(SCENE.MENU);
}

function showCollection() {
  $("#cards-scene").classList.remove("hidden");
  const list = $("#cards-list");
  list.innerHTML = "";
  const unlocked = new Set(state.meta.unlockedCards);
  for (const id of Object.keys(UNITS)) {
    const u = UNITS[id];
    const isUnlocked = unlocked.has(id);
    list.appendChild(renderCard({ kind: "unit", unit: u, size: "lg", locked: !isUnlocked }));
  }
}
function showSettings() {
  $("#settings-scene").classList.remove("hidden");
}
