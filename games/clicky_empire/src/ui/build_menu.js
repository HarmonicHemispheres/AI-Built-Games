// ============================================================================
// ui/build_menu.js — the tier-gated BUILD menu. W3-UI owns this.
//
// Buildings are no longer drafted/drawn as random cards. Instead a BUILD button
// in the bottom bar opens this panel, which lists every building available at
// the run's current tier. Clicking one the player can afford starts the normal
// ghost-placement handshake (place.js owns the actual placement + spend), so a
// building is constructed "as soon as they have resources for it".
//
// It only READS state and calls documented control APIs:
//   hand.playCard(buildingId) — building cards emit 'placement-begin', which
//                               place.js turns into ghost-placement. playCard
//                               does not require the card to be in hand, so this
//                               works for menu-built (handless) buildings; the
//                               post-placement 'hand-consume' is a harmless no-op.
// See CONTRACTS §15 (cards_ui.js) — this is its sibling.
// ============================================================================

import { state, SCENE, canAfford, on } from "../state.js";
import { playCard } from "../cards/hand.js";
import { buildingCardsForTier } from "../cards/catalog.js";
import { makeCardEl } from "./cards_render.js";

function $(id) {
  return document.getElementById(id);
}

let nodes = null;
let open = false;
// Card element ↔ card for the current list, so frequent resource-changed events
// flip affordability classes in place WITHOUT rebuilding the DOM (a rebuild would
// also rebuild every card's live 3D preview — wasteful every harvest tick).
let listEls = [];
let listTier = -1;

function cacheNodes() {
  nodes = {
    btn: $("btn-build"),
    panel: $("build-panel"),
    list: $("build-list"),
    tier: $("build-tier"),
    close: $("btn-build-close"),
  };
}

// Build the available-buildings grid for the current tier (full DOM rebuild).
// Only called when the panel opens or the tier changes — NOT on resource ticks.
function renderList() {
  if (!nodes?.list || !state.run) return;
  const tier = state.run.tier ?? 1;
  if (nodes.tier) nodes.tier.textContent = String(tier);

  nodes.list.innerHTML = "";
  listEls = [];
  listTier = tier;
  const buildings = buildingCardsForTier(tier).sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
  );
  for (const card of buildings) {
    const affordable = canAfford(card.cost);
    const el = makeCardEl(card, { compact: true, affordable, markCost: true });
    el.title = `${card.name} — build for ${formatCost(card.cost)}`;
    el.addEventListener("click", () => {
      if (!canAfford(card.cost)) return; // unaffordable: ignore (place.js no-ops too)
      // Starts ghost placement; close the panel so the ghost owns the pointer
      // and the map is unobstructed while the player picks a tile.
      playCard(card.id);
      setOpen(false);
    });
    nodes.list.appendChild(el);
    listEls.push({ el, card });
  }
}

// Cheap in-place affordability refresh (mirrors cards_ui.js) — no DOM rebuild.
function refreshAffordability() {
  for (const { el, card } of listEls) {
    el.classList.toggle("unaffordable", !canAfford(card.cost));
    for (const chip of el.querySelectorAll(".cost-chip")) {
      const res = chip.classList[1]; // "cost-chip <res>"
      const amt = card.cost?.[res] || 0;
      chip.classList.toggle("unmet", (state.resources[res] || 0) < amt);
    }
  }
}

function formatCost(cost) {
  if (!cost) return "free";
  return Object.entries(cost)
    .map(([res, amt]) => `${amt} ${res}`)
    .join(", ");
}

function setOpen(next) {
  open = next && state.scene === SCENE.RUN && !!state.run;
  if (nodes?.panel) nodes.panel.classList.toggle("hidden", !open);
  if (nodes?.btn) nodes.btn.classList.toggle("active", open);
  // Rebuild only if the tier changed since the list was last built; otherwise
  // just refresh affordability so the existing 3D previews are kept alive.
  if (open) {
    if ((state.run?.tier ?? 1) !== listTier) renderList();
    else refreshAffordability();
  }
}

// --- Init -------------------------------------------------------------------

export function initBuildMenu() {
  cacheNodes();

  nodes.btn?.addEventListener("click", () => setOpen(!open));
  nodes.close?.addEventListener("click", () => setOpen(false));

  // Keep affordability fresh while open (resources change every harvest tick) —
  // in place, so the live 3D previews aren't torn down and rebuilt each tick.
  on("resource-changed", () => {
    if (open) refreshAffordability();
  });
  // A new tier unlocks new buildings — rebuild the list (new cards) if showing.
  on("tier-unlocked", () => {
    listTier = -1; // force a rebuild on next open
    if (open) renderList();
  });
  // Leaving the run (or any scene change) closes the menu.
  on("scene-changed", ({ scene }) => {
    if (scene !== SCENE.RUN) setOpen(false);
  });
  // If another placement starts (e.g. via a different path) the ghost owns the
  // pointer; make sure the panel isn't covering the map.
  on("placement-begin", () => setOpen(false));
}
