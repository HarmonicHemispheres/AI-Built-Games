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
  // --- Wave 1 Catalogs agent: add spearman, archer_band (v1) here.
};

export function getUnitDef(id) {
  return UNITS[id] ?? null;
}
