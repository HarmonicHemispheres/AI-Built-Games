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
  // ---------------------------------------------------------------------------
  // Tier 1 — starting pool
  // ---------------------------------------------------------------------------

  // --- Buildings ---
  lumber_camp: {
    id: "lumber_camp",
    name: "Lumber Camp",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 20 },
    effect: { defId: "lumber_camp" }, // slowly yields wood (+50% adj. forest)
  },
  hamlet: {
    id: "hamlet",
    name: "Hamlet",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 30 },
    effect: { defId: "hamlet" }, // yields gold (rent); raises unit food cap
  },
  wheat_field: {
    id: "wheat_field",
    name: "Wheat Field",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 15, gold: 10 },
    effect: { defId: "wheat_field" }, // yields food (+50% on grass/berry)
  },
  militia_camp: {
    id: "militia_camp",
    name: "Militia Camp",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 25, gold: 15 },
    effect: { defId: "militia_camp" }, // spawns free militia, up to 3 living/camp
  },
  watchtower: {
    id: "watchtower",
    name: "Watchtower",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 30, iron: 10 },
    effect: { defId: "watchtower" }, // auto-fires at nearest enemy, short range
  },
  palisade: {
    id: "palisade",
    name: "Palisade",
    type: "building",
    tier: 1,
    rarity: "common",
    cost: { wood: 10 },
    effect: { defId: "palisade" }, // 1-tile wall segment, low HP, no attack
  },

  // --- Upgrades ---
  sharpened_tools: {
    id: "sharpened_tools",
    name: "Sharpened Tools",
    type: "upgrade",
    tier: 1,
    rarity: "common",
    cost: { gold: 20 },
    effect: { stat: "harvestYield", add: 1 }, // +1 harvest yield
  },
  keen_eye: {
    id: "keen_eye",
    name: "Keen Eye",
    type: "upgrade",
    tier: 1,
    rarity: "common",
    cost: { gold: 20 },
    effect: { stat: "harvestChance", add: 0.15 }, // +15% harvest chance
  },
  war_drums: {
    id: "war_drums",
    name: "War Drums",
    type: "upgrade",
    tier: 1,
    rarity: "common",
    cost: { gold: 20 },
    effect: { stat: "attackChance", add: 0.15 }, // +15% attack chance on clicks
  },

  // --- Action Cards ---
  supply_wagon: {
    id: "supply_wagon",
    name: "Supply Wagon",
    type: "action",
    tier: 1,
    rarity: "common",
    cost: { gold: 15 },
    effect: { action: "gain", resource: "wood", amount: 25 }, // earn 25 wood
  },
  tax_collection: {
    id: "tax_collection",
    name: "Tax Collection",
    type: "action",
    tier: 1,
    rarity: "common",
    cost: { wood: 15 },
    effect: { action: "gain", resource: "gold", amount: 25 }, // earn 25 gold
  },
  forage_run: {
    id: "forage_run",
    name: "Forage Run",
    type: "action",
    tier: 1,
    rarity: "common",
    cost: { wood: 15 },
    effect: { action: "gain", resource: "food", amount: 25 }, // earn 25 food
  },

  // --- Units ---
  militia: {
    id: "militia",
    name: "Militia",
    type: "unit",
    tier: 1,
    rarity: "common",
    cost: { food: 10 },
    effect: { unitId: "militia" }, // basic melee group
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — v1 subset (unlocks ~round 4)
  // ---------------------------------------------------------------------------

  // --- Buildings ---
  sawmill: {
    id: "sawmill",
    name: "Sawmill",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 40, iron: 20 },
    effect: { defId: "sawmill" }, // big wood yield; forest adjacency double
  },
  mine: {
    id: "mine",
    name: "Mine",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 30, iron: 30 },
    effect: { defId: "mine" }, // yields iron (+100% adj. mountain / on ore vein)
  },
  village: {
    id: "village",
    name: "Village",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 65, gold: 35 },
    effect: { defId: "village" }, // strong gold yield; hamlets upgrade into it
  },
  barracks: {
    id: "barracks",
    name: "Barracks",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 50, iron: 40 },
    effect: { defId: "barracks" }, // periodically spawns a spearman
  },
  archery_range: {
    id: "archery_range",
    name: "Archery Range",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 45, iron: 25 },
    effect: { defId: "archery_range" }, // trains free archer bands on a timer
  },
  stone_wall: {
    id: "stone_wall",
    name: "Stone Wall",
    type: "building",
    tier: 2,
    rarity: "rare",
    cost: { wood: 20, iron: 30 },
    effect: { defId: "stone_wall" }, // high-HP wall segment, upgrade over palisade
  },
  ballista_tower: {
    id: "ballista_tower",
    name: "Ballista Tower",
    type: "building",
    tier: 2,
    rarity: "epic",
    cost: { wood: 40, iron: 50 },
    effect: { defId: "ballista_tower" }, // long-range piercing bolts (line AOE)
  },

  // --- Upgrades ---
  masonry: {
    id: "masonry",
    name: "Masonry",
    type: "upgrade",
    tier: 2,
    rarity: "rare",
    cost: { gold: 40, iron: 20 },
    effect: { target: "walls", stat: "hp", mult: 1.5 }, // +50% HP to walls/towers
  },
  fletching: {
    id: "fletching",
    name: "Fletching",
    type: "upgrade",
    tier: 2,
    rarity: "rare",
    cost: { gold: 40, wood: 20 },
    // +25% damage and +1 range to all ranged units / towers
    effect: { target: "ranged", stat: "damage", mult: 1.25, add: 1, addStat: "range" },
  },

  // --- Units ---
  spearman: {
    id: "spearman",
    name: "Spearman",
    type: "unit",
    tier: 2,
    rarity: "rare",
    cost: { food: 15 },
    effect: { unitId: "spearman" }, // anti-charge; holds a line
  },
  archer_band: {
    id: "archer_band",
    name: "Archer Band",
    type: "unit",
    tier: 2,
    rarity: "rare",
    cost: { food: 15, wood: 10 },
    effect: { unitId: "archer_band" }, // ranged, fragile if reached
  },

  // --- Action Cards ---
  rally: {
    id: "rally",
    name: "Rally",
    type: "action",
    tier: 2,
    rarity: "rare",
    cost: { gold: 30 },
    effect: { action: "healAll" }, // heal all living units to full
  },
  volley: {
    id: "volley",
    name: "Volley",
    type: "action",
    tier: 2,
    rarity: "rare",
    cost: { gold: 40 },
    // deal medium damage to all enemies in a chosen tile radius
    effect: { action: "areaDamage", amount: 4, radius: 2, target: "point" },
  },

  // ---------------------------------------------------------------------------
  // Tier 3 — buildings (unlocks at tier 3 / ~round 8). These are constructed
  // from the BUILD menu (not drafted). Cathedral/foundry are still deferred.
  // ---------------------------------------------------------------------------
  city: {
    id: "city",
    name: "City",
    type: "building",
    tier: 3,
    rarity: "epic",
    cost: { wood: 130, gold: 90 },
    effect: { defId: "city" }, // top gold tier; villages upgrade into it
  },
  keep: {
    id: "keep",
    name: "Keep",
    type: "building",
    tier: 3,
    rarity: "epic",
    cost: { wood: 100, iron: 80 },
    effect: { defId: "keep" }, // secondary stronghold: high HP + strong auto-attack
  },
  wizard_tower: {
    id: "wizard_tower",
    name: "Wizard Tower",
    type: "building",
    tier: 3,
    rarity: "epic",
    cost: { iron: 80, gold: 60 },
    effect: { defId: "wizard_tower" }, // long-range, heavy-hitting arcane tower
  },
  castle_wall: {
    id: "castle_wall",
    name: "Castle Wall",
    type: "building",
    tier: 3,
    rarity: "epic",
    cost: { wood: 40, iron: 60 },
    effect: { defId: "castle_wall" }, // the toughest wall segment
  },
};

export function getCard(id) {
  return CARDS[id] ?? null;
}

export function cardsAtOrBelowTier(tier) {
  return Object.values(CARDS).filter((c) => c.tier <= tier);
}

// Random draws/drafts exclude buildings: buildings are no longer drafted, they
// are constructed from the tier-gated build menu (see ui/build_menu.js). Units,
// upgrades, and actions remain the random-card pool. Keeping the filter in one
// place so hand.js and draft.js stay in sync.
export function isDraftable(card) {
  return !!card && card.type !== "building";
}

// All building cards available to construct at or below `tier`. The build menu
// reads this; buildings are gated purely by the run's current tier (not by the
// meta unlock system, which only governs the draftable pool).
export function buildingCardsForTier(tier) {
  return Object.values(CARDS).filter((c) => c.type === "building" && c.tier <= tier);
}
