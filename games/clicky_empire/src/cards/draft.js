// ============================================================================
// cards/draft.js — end-of-round draft + first-time (permanent) unlocks.
// PURE LOGIC (no three/DOM). Node-testable.
//
// rollDraft() builds up to 3 deterministic options from the unlocked pool
// (all tier-1 cards UNION state.meta.unlockedCards), filtered to tier <=
// state.run.tier, de-duped. chooseDraft() adds the pick to the hand (respecting
// HAND_CAP), permanently unlocks it if never seen, then advances the round.
//
// See CONTRACTS §3 (state), §5/§7 (registries), §8 (card schema), §14 (W2-Cards),
// and prompt.md "Cards" / "Meta-Progression".
// ============================================================================

import { state, HAND_CAP } from "../state.js";
import { getCard, cardsAtOrBelowTier, CARDS } from "./catalog.js";
import { makeRng } from "../util/rng.js";
import { registerSystems, advanceToNextRound } from "../run.js";

// The draft pool: all Tier-1 cards UNION any permanently-unlocked cards,
// filtered to cards at or below the run's current tier, de-duped by id.
function draftPool() {
  const tier = state.run?.tier ?? 1;
  const ids = new Set();

  // All tier-1 cards (always available, gates nothing).
  for (const c of cardsAtOrBelowTier(1)) {
    if (c.tier === 1) ids.add(c.id);
  }
  // Plus everything the player has ever unlocked.
  for (const id of state.meta?.unlockedCards ?? []) {
    if (CARDS[id]) ids.add(id);
  }

  // Filter by current tier and resolve to card objects.
  const pool = [];
  for (const id of ids) {
    const card = getCard(id);
    if (card && card.tier <= tier) pool.push(card);
  }
  return pool;
}

// Roll up to 3 deterministic draft options, seeded by seed:draft:round.
export function rollDraft() {
  const pool = draftPool();
  if (pool.length === 0) return [];
  const seed = `${state.run?.seed ?? ""}:draft:${state.run?.round ?? 0}`;
  const rng = makeRng(seed);
  const shuffled = rng.shuffle([...pool]);
  return shuffled.slice(0, Math.min(3, shuffled.length));
}

// The player chose a card from the current draft. Add to hand (respect cap),
// permanently unlock it the first time it's ever seen, then start next round.
export function chooseDraft(cardId) {
  const card = getCard(cardId);
  if (!card) {
    advanceToNextRound();
    return false;
  }

  if (state.hand.length < HAND_CAP) {
    state.hand.push(card);
  }

  if (!Array.isArray(state.meta.unlockedCards)) state.meta.unlockedCards = [];
  if (!state.meta.unlockedCards.includes(cardId)) {
    state.meta.unlockedCards.push(cardId); // permanent unlock
  }

  advanceToNextRound();
  return true;
}

// Register rollDraft into the run-machine's system registry.
export function initDraft() {
  registerSystems({ rollDraft });
}
