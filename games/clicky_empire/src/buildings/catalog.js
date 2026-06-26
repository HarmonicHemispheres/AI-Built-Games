// ============================================================================
// buildings/catalog.js — building runtime definitions. PURE DATA (no logic,
// no three, no DOM). Node-safe.
//
// `BUILDINGS` is keyed by defId — the same id that card.effect.defId points at
// (cards/catalog.js). The economy / defense / placement systems read these defs
// to drive idle yields, adjacency bonuses, auto-fire towers, spawner buildings,
// and base HP.
//
// Schema (CONTRACTS §14 "W2-Buildings"):
//   {
//     id,                          // defId (== key)
//     name,                        // display name
//     kind,                        // 'castle' | 'economy' | 'defense' | 'wall' | 'spawner'
//     hp,                          // base hit points (figure count for render)
//     yields?:   { res: perTick }, // economy: resources accrued each tickRate
//     tickRate?:  seconds,         // economy: seconds between yield accruals
//     adjacency?:{ hint: bonusMult},// economy: +bonusMult yield when next to a
//                                  //   tile whose tile.adjacency === hint, or
//                                  //   built on such a tile (see economy.js)
//     attack?:   { damage, range, attackSpeed }, // defense: auto-fire stats
//     spawns?:   { unitId, interval, cap },       // spawner: free-unit timer
//     color,                       // mesh tint hint (render may refine)
//   }
//
// Numbers follow prompt.md "Cards" as guidance; kept tunable in one place.
// ============================================================================

export const BUILDINGS = {
  // ---------------------------------------------------------------------------
  // The castle — the lose condition. High HP; no yields/attack here (the keep is
  // a v2 reprieve and is intentionally omitted).
  // ---------------------------------------------------------------------------
  castle: {
    id: "castle",
    name: "Castle",
    kind: "castle",
    hp: 30, // high HP centerpiece (CONTRACTS §14 "high hp e.g. 30")
    color: 0xb7bcc4,
  },

  // ---------------------------------------------------------------------------
  // Tier 1 — economy
  // ---------------------------------------------------------------------------
  lumber_camp: {
    id: "lumber_camp",
    name: "Lumber Camp",
    kind: "economy",
    hp: 4,
    yields: { wood: 0.5 }, // wood per tick
    tickRate: 1, // seconds per tick
    adjacency: { forest: 0.5 }, // +50% next to a forest tile
    color: 0x8a6a3c,
  },
  hamlet: {
    id: "hamlet",
    name: "Hamlet",
    kind: "economy",
    hp: 5,
    yields: { gold: 0.4 }, // gold (rent) per tick
    tickRate: 1,
    color: 0xcaa06a,
  },
  wheat_field: {
    id: "wheat_field",
    name: "Wheat Field",
    kind: "economy",
    hp: 3,
    yields: { food: 0.5 }, // food per tick
    tickRate: 1,
    // +50% on grass / berry (grasslands tiles have no adjacency hint, so we key
    // on the berry hint; economy.js also grants the grass bonus — see note there)
    adjacency: { berry: 0.5, grass: 0.5 },
    color: 0xe0c34c,
  },

  // ---------------------------------------------------------------------------
  // Tier 1 — spawner
  // ---------------------------------------------------------------------------
  militia_camp: {
    id: "militia_camp",
    name: "Militia Camp",
    kind: "spawner",
    hp: 5,
    spawns: { unitId: "militia", interval: 8, cap: 3 }, // free militia, up to 3/camp
    color: 0x7d8a5a,
  },

  // ---------------------------------------------------------------------------
  // Tier 1 — defense / wall
  // ---------------------------------------------------------------------------
  watchtower: {
    id: "watchtower",
    name: "Watchtower",
    kind: "defense",
    hp: 6,
    attack: { damage: 2, range: 3, attackSpeed: 1.0 }, // short range, low dmg
    color: 0x9aa0a8,
  },
  palisade: {
    id: "palisade",
    name: "Palisade",
    kind: "wall",
    hp: 6, // low HP wall segment
    color: 0x7a5630,
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — economy
  // ---------------------------------------------------------------------------
  sawmill: {
    id: "sawmill",
    name: "Sawmill",
    kind: "economy",
    hp: 6,
    yields: { wood: 1.2 }, // big wood yield
    tickRate: 1,
    adjacency: { forest: 1.0 }, // counts forest adjacency double (+100%)
    color: 0x8a6a3c,
  },
  mine: {
    id: "mine",
    name: "Mine",
    kind: "economy",
    hp: 6,
    yields: { iron: 0.8 }, // iron per tick
    tickRate: 1,
    // +100% adjacent to mountain or on an ore vein
    adjacency: { mountain: 1.0, ore: 1.0 },
    color: 0x6f7480,
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — spawner
  // ---------------------------------------------------------------------------
  barracks: {
    id: "barracks",
    name: "Barracks",
    kind: "spawner",
    hp: 8,
    spawns: { unitId: "spearman", interval: 12, cap: 2 }, // periodically spawns a spearman
    color: 0x8a8f96,
  },

  // ---------------------------------------------------------------------------
  // Tier 2 — defense / wall
  // ---------------------------------------------------------------------------
  stone_wall: {
    id: "stone_wall",
    name: "Stone Wall",
    kind: "wall",
    hp: 14, // high-HP wall segment, upgrade over palisade
    color: 0x9b9ea3,
  },
  ballista_tower: {
    id: "ballista_tower",
    name: "Ballista Tower",
    kind: "defense",
    hp: 8,
    attack: { damage: 5, range: 6, attackSpeed: 0.4 }, // long range, slow, heavy
    color: 0x8a949e,
  },
};

export function getBuildingDef(defId) {
  return BUILDINGS[defId] ?? null;
}
