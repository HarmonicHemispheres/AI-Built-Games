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
    hp: 3, // basic melee workhorse
    damage: 1,
    range: 0.9,
    attackSpeed: 1.0,
    speed: 1.6,
    traits: ["MELEE"],
    reward: { gold: 1 },
    color: 0xd6533c,
  },
  wolf: {
    id: "wolf",
    name: "Wolf",
    hp: 1, // very low HP, very fast — slips past walls to the castle
    damage: 1,
    range: 0.8,
    attackSpeed: 1.2,
    speed: 3.4, // FAST
    traits: ["MELEE", "FAST"],
    reward: { gold: 1 },
    color: 0x8a8f99,
  },
  skirmisher: {
    id: "skirmisher",
    name: "Skirmisher",
    hp: 2, // low HP, hangs back and plinks units/buildings
    damage: 1,
    range: 3.5, // RANGED
    attackSpeed: 0.9,
    speed: 1.5,
    traits: ["RANGED"],
    reward: { gold: 2 },
    color: 0xc77f3a,
  },
  sapper: {
    id: "sapper",
    name: "Sapper",
    hp: 2, // targets buildings / walls first, ignores units when possible
    damage: 3, // heavy hits vs structures
    range: 0.9,
    attackSpeed: 0.7,
    speed: 1.4,
    traits: ["MELEE", "SAPPER"],
    reward: { gold: 2 },
    color: 0x9b5a2b,
  },
  warlord: {
    id: "warlord",
    name: "Warlord",
    hp: 16, // ELITE mini-boss (round 5) — high HP
    damage: 4,
    range: 1.0,
    attackSpeed: 0.8,
    speed: 1.3,
    traits: ["MELEE", "ELITE"], // buffs the wave
    reward: { gold: 50, renown: 5 }, // drops bonus gold + renown
    color: 0x7a1f1f,
  },
};

export function getEnemyDef(id) {
  return ENEMIES[id] ?? null;
}
