// ============================================================================
// enemies/catalog.js — enemy definitions. PURE DATA (no logic).
// Stage 0 ships the schema + one example; the Wave 1 Catalogs agent fills the
// v1 set (raider, wolf, skirmisher, sapper, + warlord mini-boss). hp = figures.
//
// Schema:
//   { id, name, hp, damage, range, attackSpeed, speed, traits, reward, color }
//   traits: ['MELEE'|'RANGED'|'FAST'|'ARMORED'|'SAPPER'|'SUPPORT'|'ELITE'|'BOSS']
//   reward: { gold?, renown? } dropped on death (elites/bosses)
//   speed:  tiles per second
// ============================================================================

export const ENEMIES = {
  raider: {
    id: "raider",
    name: "Raider",
    hp: 3,
    damage: 1,
    range: 0.9,
    attackSpeed: 1.0,
    speed: 1.6,
    traits: ["MELEE"],
    reward: { gold: 1 },
    color: 0xd6533c,
  },
  // --- Wave 1 Catalogs agent: add wolf, skirmisher, sapper, warlord here.
};

export function getEnemyDef(id) {
  return ENEMIES[id] ?? null;
}
