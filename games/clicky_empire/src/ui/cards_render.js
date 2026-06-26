// ============================================================================
// ui/cards_render.js — shared card-element builder used by both the in-run hand
// / draft (cards_ui.js) and the collection screen (menu.js). Pure DOM, no logic.
//
// W3-UI owns this. It only reads state (for affordability hints) and builds a
// card <div>; click wiring is the caller's job. See CONTRACTS §15.
// ============================================================================

import { state } from "../state.js";

const TYPE_ICON = {
  building: "\u{1F3DB}", // classical building
  unit: "⚔", // crossed swords
  upgrade: "↑", // up arrow
  action: "✨", // sparkles
};

// Build a single card element.
//   opts.compact      → small hand-sized card
//   opts.locked       → collection silhouette (hidden name/cost, ❓ art)
//   opts.affordable   → false dims the card (in-run unaffordable)
//   opts.markCost     → outline individual cost chips the player can't pay
export function makeCardEl(card, opts = {}) {
  const el = document.createElement("div");
  el.className = "ce-card";
  el.classList.add("kind-" + (card.type || "action"));
  el.classList.add("rarity-" + (card.rarity || "common"));
  if (opts.compact) el.classList.add("sm");
  if (opts.locked) el.classList.add("locked");
  if (opts.affordable === false && !opts.locked) el.classList.add("unaffordable");

  const top = document.createElement("div");
  top.className = "ce-card-top";
  const type = document.createElement("span");
  type.className = "ce-card-type";
  type.textContent = card.type || "";
  const tier = document.createElement("span");
  tier.className = "ce-card-tier";
  tier.textContent = "T" + (card.tier || 1);
  top.appendChild(type);
  top.appendChild(tier);

  const art = document.createElement("div");
  art.className = "ce-card-art";
  art.textContent = opts.locked ? "❓" : TYPE_ICON[card.type] || "✨";

  const name = document.createElement("div");
  name.className = "ce-card-name";
  name.textContent = opts.locked ? "LOCKED" : card.name || card.id;

  const cost = document.createElement("div");
  cost.className = "ce-card-cost";
  if (!opts.locked && card.cost) {
    for (const res of ["gold", "wood", "iron", "food"]) {
      const amt = card.cost[res];
      if (!amt) continue;
      const chip = document.createElement("span");
      chip.className = "cost-chip " + res;
      if (opts.markCost && (state.resources[res] || 0) < amt) chip.classList.add("unmet");
      chip.textContent = amt + " " + res[0].toUpperCase();
      cost.appendChild(chip);
    }
  }

  el.appendChild(top);
  el.appendChild(art);
  el.appendChild(name);
  el.appendChild(cost);
  return el;
}
