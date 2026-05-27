// V1 upgrades. Each has an `apply(run, units)` patcher; some are passive flags
// the run checks at the relevant moment (gold scaling, prep time, etc).

export const UPGRADES = {
  reinforced_plating: {
    id: "reinforced_plating",
    name: "Reinforced Plating",
    desc: "+20% HP to all LAND units.",
    tag: "LAND",
    kind: "stat",
    stat: "hp", mult: 1.2,
  },
  hollow_points: {
    id: "hollow_points",
    name: "Hollow Points",
    desc: "+25% DMG to all RANGED units.",
    tag: "RANGED",
    kind: "stat",
    stat: "dmg", mult: 1.25,
  },
  salvage_protocol: {
    id: "salvage_protocol",
    name: "Salvage Protocol",
    desc: "+25% gold from destroyed zombies.",
    kind: "flag",
    flag: "goldMult", value: 1.25,
  },
  prep_extension: {
    id: "prep_extension",
    name: "Prep Extension",
    desc: "+15s of prep time each round.",
    kind: "flag",
    flag: "prepBonus", value: 15,
  },
  containment_hardening: {
    id: "containment_hardening",
    name: "Containment Hardening",
    desc: "+25 starting containment (applied now).",
    kind: "instant",
    apply: (run) => { run.containment = Math.min(150, run.containment + 25); },
  },
  sentry_overclock: {
    id: "sentry_overclock",
    name: "Sentry Overclock",
    desc: "Sentry attack speed +40%, HP -10%.",
    kind: "specific",
    unitId: "sentry",
    patch: { fireRate: 1.4, hp: 0.9 },
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES);
