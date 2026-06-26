// ============================================================================
// ui/cards_ui.js — renders the hand into the bottom bar and the draft screen.
//
// W3-UI owns this. It only READS state and calls the documented control APIs:
//   hand.playCard(cardId)     — click a card in hand (building cards trigger the
//                               ghost-placement handshake inside place.js)
//   draft.chooseDraft(cardId) — click a card on the draft screen
//   catalog.getCard           — (collection screen lives in menu.js)
// See CONTRACTS §15 (cards_ui.js).
// ============================================================================

import { state, SCENE, canAfford, on } from "../state.js";
import { playCard } from "../cards/hand.js";
import { chooseDraft } from "../cards/draft.js";
import { makeCardEl } from "./cards_render.js";

function $(id) {
  return document.getElementById(id);
}

// Card element ↔ card for the current hand, so affordability updates from the
// frequent `resource-changed` event can be applied in place without rebuilding
// the DOM every harvest tick.
let handEls = [];

// --- Hand (bottom bar) ------------------------------------------------------

// Full rebuild — only on hand-changed / run start (hand is at most HAND_CAP).
function renderHand() {
  const container = $("hand");
  if (!container) return;
  container.innerHTML = "";
  handEls = [];
  state.hand.forEach((card, idx) => {
    if (!card) return;
    const affordable = canAfford(card.cost);
    const el = makeCardEl(card, { compact: true, affordable, markCost: true });
    el.title = `${card.name} — ${card.type}`;
    el.addEventListener("click", () => {
      // Guard at click time; playCard is itself a no-op when unaffordable, and
      // building cards start the ghost-placement handshake inside place.js.
      if (!canAfford(card.cost)) return;
      playCard(card.id);
    });
    el.dataset.handIndex = String(idx);
    container.appendChild(el);
    handEls.push({ el, card });
  });
}

// Cheap in-place affordability refresh (no DOM rebuild) on resource changes.
function refreshHandAffordability() {
  for (const { el, card } of handEls) {
    const affordable = canAfford(card.cost);
    el.classList.toggle("unaffordable", !affordable);
    for (const chip of el.querySelectorAll(".cost-chip")) {
      const res = chip.classList[1]; // "cost-chip <res>"
      const amt = card.cost?.[res] || 0;
      chip.classList.toggle("unmet", (state.resources[res] || 0) < amt);
    }
  }
}

// --- Draft screen -----------------------------------------------------------

function renderDraft() {
  const container = $("draft-options");
  if (!container) return;
  container.innerHTML = "";
  for (const card of state.draftOptions) {
    if (!card) continue;
    const el = makeCardEl(card, { affordable: true });
    el.addEventListener("click", () => {
      // chooseDraft adds to hand, unlocks if new, and advances the round.
      chooseDraft(card.id);
    });
    container.appendChild(el);
  }
}

// --- Init -------------------------------------------------------------------

export function initCards() {
  // Hand re-renders whenever it changes and once when a run begins.
  on("hand-changed", renderHand);
  // Resource changes only flip affordability — update classes in place.
  on("resource-changed", refreshHandAffordability);
  on("scene-changed", ({ scene }) => {
    if (scene === SCENE.RUN) renderHand();
    if (scene === SCENE.DRAFT) renderDraft();
  });
}
