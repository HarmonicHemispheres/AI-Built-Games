import { UPGRADES } from "./catalog.js";
import { UNITS } from "../units/catalog.js";

// Stat modifiers are computed at unit-spawn time by reading run.upgrades.
// This module exposes helpers used by units/behavior + run logic.

export function applyUpgradeNow(run, upgradeId) {
  const up = UPGRADES[upgradeId];
  if (!up) return;
  run.upgrades.push(upgradeId);
  if (up.kind === "instant" && typeof up.apply === "function") up.apply(run);
}

export function effectiveStats(unitId, run) {
  const base = UNITS[unitId];
  const stats = { hp: base.hp, dmg: base.dmg, range: base.range, fireRate: base.fireRate, moveSpeed: base.moveSpeed };
  if (!run) return stats;
  for (const upId of run.upgrades) {
    const up = UPGRADES[upId];
    if (!up) continue;
    if (up.kind === "stat" && base.tags.includes(up.tag)) {
      stats[up.stat] *= up.mult;
    } else if (up.kind === "specific" && up.unitId === unitId) {
      for (const [k, mult] of Object.entries(up.patch)) stats[k] *= mult;
    }
  }
  return stats;
}

export function goldMult(run) {
  let m = 1;
  for (const upId of run.upgrades) {
    const up = UPGRADES[upId];
    if (up && up.kind === "flag" && up.flag === "goldMult") m *= up.value;
  }
  return m;
}

export function prepTimeBonus(run) {
  let b = 0;
  for (const upId of run.upgrades) {
    const up = UPGRADES[upId];
    if (up && up.kind === "flag" && up.flag === "prepBonus") b += up.value;
  }
  return b;
}
