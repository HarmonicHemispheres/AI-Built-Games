// ============================================================================
// world/tiles.js — tile type definitions. PURE DATA (no logic).
// Stage 0 ships the schema + a few examples; the Wave 1 World agent completes
// the v1 set: grasslands, forest, water, mountain, ore_vein, berry_patch.
// (v1 defers gem_vein, desert, marsh — keep them out for now.)
//
// Schema per type:
//   { type, buildable, walkable, clickYield, adjacency, color }
//   clickYield: null | { resource, amount, chance? } | array of weighted options
//   adjacency:  optional hint string consumed by buildings/economy.js
//   color:      base mesh tint (render/meshes.js may refine)
// ============================================================================

export const TILE = Object.freeze({
  GRASS: "grasslands",
  FOREST: "forest",
  WATER: "water",
  MOUNTAIN: "mountain",
  ORE: "ore_vein",
  BERRY: "berry_patch",
});

export const TILE_TYPES = {
  [TILE.GRASS]: {
    type: TILE.GRASS,
    buildable: true,
    walkable: true,
    clickYield: null,
    adjacency: null,
    color: 0x5aa84b,
  },
  [TILE.FOREST]: {
    type: TILE.FOREST,
    buildable: true, // clears to grass when built on
    walkable: true,
    clickYield: { resource: "wood", amount: 1 },
    adjacency: "forest",
    color: 0x2f6b34,
  },
  [TILE.WATER]: {
    type: TILE.WATER,
    buildable: false,
    walkable: false,
    clickYield: null,
    adjacency: null,
    color: 0x3a78c2,
  },
  // --- Wave 1 World agent: complete MOUNTAIN, ORE, BERRY below to this schema.
};

export function getTileType(type) {
  return TILE_TYPES[type] ?? TILE_TYPES[TILE.GRASS];
}
