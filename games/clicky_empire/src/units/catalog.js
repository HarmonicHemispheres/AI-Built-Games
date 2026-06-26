// ============================================================================
// units/catalog.js — player unit definitions. PURE DATA (no logic).
// Stage 0 ships the schema + one example; the Wave 1 Catalogs agent fills the
// v1 set (militia, spearman, archer band). hp = number of figures in the group.
//
// Schema:
//   { id, name, hp, damage, range, attackSpeed, moveSpeed, tags, foodCost, color }
//   range:       tiles (melee ~0.9, ranged > 1)
//   attackSpeed: attacks per second
//   moveSpeed:   tiles per second
//   tags:        ['MELEE'|'RANGED'|'SIEGE'|'CHARGE'|'SUPPORT']
//   foodCost:    upkeep consumed each round
// ============================================================================

export const UNITS = {
  militia: {
    id: "militia",
    name: "Militia",
    hp: 4, // 4 standing figures
    damage: 1,
    range: 0.9,
    attackSpeed: 1.0,
    moveSpeed: 2.2,
    tags: ["MELEE"],
    foodCost: 1,
    color: 0x5b8def,
  },
  spearman: {
    id: "spearman",
    name: "Spearman",
    hp: 5, // 5 standing figures — medium HP, holds a line
    damage: 2,
    range: 1.1, // slightly longer reach (spears); anti-charge
    attackSpeed: 0.9,
    moveSpeed: 2.0,
    tags: ["MELEE", "CHARGE"], // bonus damage vs FAST enemies
    foodCost: 2,
    color: 0x4a6fb5,
  },
  archer_band: {
    id: "archer_band",
    name: "Archer Band",
    hp: 3, // 3 standing figures — fragile if reached
    damage: 2,
    range: 4.0, // ranged group, fires from a distance
    attackSpeed: 1.1,
    moveSpeed: 2.1,
    tags: ["RANGED"],
    foodCost: 2,
    color: 0x6fb56f,
  },
};

export function getUnitDef(id) {
  return UNITS[id] ?? null;
}
