import { state, SCENE } from "../state.js";
import { UNITS } from "../units/catalog.js";
import { UPGRADES, UPGRADE_IDS } from "../upgrades/catalog.js";
import { applyUpgradeNow } from "../upgrades/apply.js";
import { playSfx } from "../audio/sfx.js";
import { renderCard } from "./card-art.js";

const $ = (sel) => document.querySelector(sel);

// --- DECK SELECT ---
let deckSelection = [];
const DECK_SIZE = 5;

export function showDeckSelect(onConfirm) {
  $("#deck-scene").classList.remove("hidden");
  deckSelection = [];
  renderDeckPool();
  updateDeckFooter();
  $("#btn-start-run").onclick = () => {
    if (deckSelection.length !== DECK_SIZE) return;
    $("#deck-scene").classList.add("hidden");
    onConfirm([...deckSelection]);
  };
  $("#btn-deck-back").onclick = () => {
    $("#deck-scene").classList.add("hidden");
    state.scene = SCENE.MENU;
    document.dispatchEvent(new CustomEvent("scene-change"));
  };
}

function renderDeckPool() {
  const pool = $("#deck-pool");
  pool.innerHTML = "";
  const unlocked = new Set(state.meta.unlockedCards);
  for (const id of Object.keys(UNITS)) {
    const u = UNITS[id];
    const isUnlocked = unlocked.has(id);
    const isSelected = deckSelection.includes(id);
    const card = renderCard({
      kind: "unit",
      unit: u,
      size: "lg",
      locked: !isUnlocked,
      selected: isSelected,
      onClick: isUnlocked ? () => {
        playSfx("click");
        const idx = deckSelection.indexOf(id);
        if (idx >= 0) deckSelection.splice(idx, 1);
        else if (deckSelection.length < DECK_SIZE) deckSelection.push(id);
        renderDeckPool();
        updateDeckFooter();
      } : null,
    });
    pool.appendChild(card);
  }
}
function updateDeckFooter() {
  $("#deck-count").textContent = deckSelection.length;
  $("#btn-start-run").disabled = deckSelection.length !== DECK_SIZE;
}

// --- HAND (during prep) ---
export function renderHand() {
  const hand = $("#hand");
  hand.innerHTML = "";
  if (!state.run) return;
  for (const id of state.run.hand) {
    const u = UNITS[id];
    const depleted = state.run.handUsed.has(id);
    const isSelected = state.dragPlacementCard === id;
    const card = renderCard({
      kind: "unit",
      unit: u,
      size: "sm",
      depleted,
      selected: isSelected,
      onClick: (!depleted && state.scene === SCENE.PREP) ? () => {
        if (state.dragPlacementCard === id) {
          state.dragPlacementCard = null;
          state.dragGhost = null;
        } else {
          state.dragPlacementCard = id;
          state.dragGhost = null;
          playSfx("click");
        }
        renderHand();
      } : null,
    });
    hand.appendChild(card);
  }
}

// --- DRAFT (post-round) — mix of upgrades and brand-new units ---
export function showDraft(onPicked) {
  const scene = $("#draft-scene");
  scene.classList.remove("hidden");
  const pool = $("#draft-options");
  pool.innerHTML = "";

  // Build a mixed pool: upgrades the player doesn't own + units NOT yet in
  // their deck. Pick 3 random across both pools, roughly 50/50 weight.
  const ownedUpgrades = new Set(state.run.upgrades);
  const deckSet = new Set(state.run.deck);
  const upgradeChoices = UPGRADE_IDS.filter(id => !ownedUpgrades.has(id)).map(id => ({ kind: "upgrade", id }));
  const unitChoices = Object.keys(UNITS).filter(id => !deckSet.has(id)).map(id => ({ kind: "unit", id }));

  // Weighted shuffle: prefer mix, but allow either pool to dominate if one is empty.
  const all = [];
  for (let i = 0; i < 3; i++) {
    const wantUnit = unitChoices.length > 0 && (upgradeChoices.length === 0 || Math.random() < 0.5);
    const src = wantUnit ? unitChoices : upgradeChoices;
    if (src.length === 0) continue;
    const idx = Math.floor(Math.random() * src.length);
    all.push(src.splice(idx, 1)[0]);
  }

  for (const pick of all) {
    if (pick.kind === "upgrade") {
      const up = UPGRADES[pick.id];
      const card = renderCard({
        kind: "upgrade",
        upgrade: up,
        size: "lg",
        onClick: () => {
          playSfx("click");
          applyUpgradeNow(state.run, pick.id);
          scene.classList.add("hidden");
          onPicked();
        },
      });
      pool.appendChild(card);
    } else {
      const u = UNITS[pick.id];
      const card = renderCard({
        kind: "unit",
        unit: u,
        size: "lg",
        onClick: () => {
          playSfx("click");
          // Add unit to run deck + permanently unlock it.
          state.run.deck.push(pick.id);
          state.run.hand.push(pick.id);
          if (!state.meta.unlockedCards.includes(pick.id)) state.meta.unlockedCards.push(pick.id);
          scene.classList.add("hidden");
          onPicked();
        },
      });
      pool.appendChild(card);
    }
  }
}
