// ============================================================================
// cards/hand.js — hand management + playing cards. PURE LOGIC (no three/DOM).
//
// Owns the player's hand: drawing the starting hand, drawing/consuming cards,
// and resolving a played card by type (building / unit / upgrade / action).
//
// Cross-module decoupling (CONTRACTS §14): hand.js NEVER imports the units /
// buildings / enemies modules. It talks to them via the event bus:
//   - building card -> emit('placement-begin', {cardId})   (place.js finishes it)
//   - unit card     -> emit('spawn-unit', {unitId, col, row}) (units/behavior listens)
//   - place.js, after a building is placed, emits hand-consume({cardId});
//     initHand() registers the listener that removes that card from hand.
//
// See CONTRACTS §3 (state), §4 (events), §8 (card schema), §14 (W2-Cards).
// ============================================================================

import {
  state,
  HAND_CAP,
  spend,
  canAfford,
  addResource,
  emit,
  on,
} from "../state.js";
import { getCard, cardsAtOrBelowTier, isDraftable } from "./catalog.js";
import { makeRng } from "../util/rng.js";
import { areaDamage, heal } from "../combat/effects.js";

// The Tier-1 random pool: tier-1 cards EXCLUDING buildings. Buildings are built
// from the tier-gated build menu, not drawn/drafted (see catalog.isDraftable).
function tier1Cards() {
  return cardsAtOrBelowTier(1).filter((c) => c.tier === 1 && isDraftable(c));
}

// Ensure the per-run upgrades list exists without adding a top-level state field.
function runUpgrades() {
  if (!state.run) return null;
  if (!Array.isArray(state.run.upgrades)) state.run.upgrades = [];
  return state.run.upgrades;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

// Put 5 random Tier-1 cards into state.hand (respecting HAND_CAP), emit once.
// Seeded by the run seed so the starting hand is reproducible.
export function drawStarting() {
  const pool = tier1Cards();
  if (pool.length === 0) return state.hand;
  const seed = state.run ? `${state.run.seed}:start` : "start";
  const rng = makeRng(seed);
  const shuffled = rng.shuffle([...pool]);
  const want = Math.min(5, HAND_CAP - state.hand.length);
  for (let i = 0; i < want && i < shuffled.length; i++) {
    state.hand.push(shuffled[i]);
  }
  emit("hand-changed");
  return state.hand;
}

// Draw n random Tier-1 cards (respecting HAND_CAP). Used for testing / refills.
export function draw(n = 1) {
  const pool = tier1Cards();
  if (pool.length === 0 || n <= 0) return state.hand;
  const seed = state.run
    ? `${state.run.seed}:draw:${state.hand.length}`
    : `draw:${state.hand.length}`;
  const rng = makeRng(seed);
  for (let i = 0; i < n; i++) {
    if (state.hand.length >= HAND_CAP) break;
    state.hand.push(rng.pick(pool));
  }
  emit("hand-changed");
  return state.hand;
}

// Remove ONE matching card from the hand (by id), emit hand-changed.
export function consume(cardId) {
  const idx = state.hand.findIndex((c) => c && c.id === cardId);
  if (idx === -1) return false;
  state.hand.splice(idx, 1);
  emit("hand-changed");
  return true;
}

// ---------------------------------------------------------------------------
// Playing a card
// ---------------------------------------------------------------------------

// Pick a free tile near the castle to drop a freshly summoned unit on.
function tileNearCastle() {
  const castle = state.map?.castle;
  if (castle) return { col: castle.col, row: castle.row };
  return { col: 0, row: 0 };
}

// Apply an upgrade card's effect.
//   - stat-scoped (e.g. {stat:'harvestYield', add:1}) mutates state.playerStats.
//     Supports `add` and `mult`.
//   - target-scoped (e.g. walls / ranged) records the descriptor into the
//     per-run upgrades list (state.run.upgrades) for the relevant system to read.
function applyUpgrade(card) {
  const eff = card.effect || {};
  if (eff.target) {
    const list = runUpgrades();
    if (list) list.push({ cardId: card.id, ...eff });
    return;
  }
  const stat = eff.stat;
  if (stat && stat in state.playerStats) {
    if (typeof eff.mult === "number") state.playerStats[stat] *= eff.mult;
    if (typeof eff.add === "number") state.playerStats[stat] += eff.add;
  }
}

// Resolve an action card's effect now.
function applyAction(card) {
  const eff = card.effect || {};
  switch (eff.action) {
    case "gain":
      if (eff.resource && typeof eff.amount === "number") {
        addResource(eff.resource, eff.amount);
      }
      break;
    case "healAll":
      for (const u of state.units) heal(u, u.maxHp ?? Infinity);
      break;
    case "areaDamage": {
      // v1: target the castle's footprint or the first enemy cluster.
      let center = null;
      if (state.enemies.length > 0 && state.enemies[0].pos) {
        center = { x: state.enemies[0].pos.x, z: state.enemies[0].pos.z };
      } else if (state.map?.castle) {
        center = { x: state.map.castle.col, z: state.map.castle.row };
      } else {
        center = { x: 0, z: 0 };
      }
      areaDamage(center, eff.radius ?? 2, eff.amount ?? 0);
      break;
    }
    default:
      break;
  }
}

// Play a card from the hand by id.
//   returns { pending: true }  when a building handshake was started (place.js
//            finishes the placement, spends, and consumes via hand-consume).
//   returns { pending: false } otherwise (resolved-now or no-op).
export function playCard(cardId) {
  const card = getCard(cardId);
  if (!card) return { pending: false };

  // Must be affordable; otherwise no-op (do not spend / consume / emit).
  if (!canAfford(card.cost)) return { pending: false };

  if (card.type === "building") {
    // Defer to placement: do NOT spend or consume here. place.js will spend the
    // cost, place the building, then emit hand-consume({cardId}) which we catch.
    emit("placement-begin", { cardId });
    return { pending: true };
  }

  if (card.type === "unit") {
    spend(card.cost);
    const { col, row } = tileNearCastle();
    emit("spawn-unit", { unitId: card.effect?.unitId, col, row });
    consume(cardId);
    emit("card-played", { card });
    return { pending: false };
  }

  if (card.type === "upgrade") {
    spend(card.cost);
    applyUpgrade(card);
    consume(cardId);
    emit("card-played", { card });
    return { pending: false };
  }

  if (card.type === "action") {
    spend(card.cost);
    applyAction(card);
    consume(cardId);
    emit("card-played", { card });
    return { pending: false };
  }

  return { pending: false };
}

// ---------------------------------------------------------------------------
// Init — wire the hand-consume listener (place.js -> remove placed building card)
// ---------------------------------------------------------------------------

let _wired = false;
export function initHand() {
  if (_wired) return;
  _wired = true;
  on("hand-consume", (payload) => {
    if (payload && payload.cardId != null) consume(payload.cardId);
  });
}
