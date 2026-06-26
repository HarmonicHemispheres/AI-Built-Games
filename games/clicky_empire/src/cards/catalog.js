// ============================================================================
// cards/catalog.js — all card definitions. PURE DATA (no logic).
// Stage 0 ships the schema + one example; the Wave 1 Catalogs agent fills the
// full v1 set (all Tier 1 + the v1 Tier 2 subset from prompt.md).
//
// Schema:
//   { id, name, type, tier, rarity, cost, effect }
//   type:   'building' | 'unit' | 'upgrade' | 'action'
//   tier:   1 | 2 | 3            (v1 = tiers 1 and a subset of 2)
//   rarity: 'common' | 'rare' | 'epic' | 'legendary'
//   cost:   { gold?, wood?, iron?, food? }
//   effect: a structured, data-only descriptor consumed by the relevant system.
//           Buildings -> { defId } into buildings/economy+defense; Units ->
//           { unitId } into units/catalog; Upgrades -> { stat/mult }; Actions ->
//           { action, amount/target }. Keep effects declarative, not functions.
// ============================================================================

export const CARDS = {
  lumber_camp: {
    id: "lumber_camp",
    name: "Lumber Camp",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 20 },
    effect: { defId: "lumber_camp" }, // see buildings catalog/economy
  },
  // --- Wave 1 Catalogs agent: fill the full v1 card set here, keyed by id.
};

export function getCard(id) {
  return CARDS[id] ?? null;
}

export function cardsAtOrBelowTier(tier) {
  return Object.values(CARDS).filter((c) => c.tier <= tier);
}
