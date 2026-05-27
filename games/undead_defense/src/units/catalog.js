// Static unit data. Pure data — easy to balance without touching logic.
// Tags drive upgrade interactions: LAND / FLYING / MELEE / RANGED / SUPPORT / TRAP / STRUCTURE.

export const UNITS = {
  sentry: {
    id: "sentry",
    name: "Sentry",
    rarity: "common",
    tags: ["LAND", "RANGED"],
    hp: 110, dmg: 14, range: 5.5, fireRate: 1.2, moveSpeed: 2.8,
    projectile: { kind: "tracer", color: "#7ad6b3", speed: 18 },
    desc: "Balanced ground turret. Workhorse early-act unit.",
  },
  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    rarity: "common",
    tags: ["LAND", "MELEE"],
    hp: 420, dmg: 9, range: 1.0, fireRate: 0.8, moveSpeed: 1.5,
    desc: "Heavy walker. Soaks hits and blocks paths.",
  },
  scrapper: {
    id: "scrapper",
    name: "Scrapper",
    rarity: "common",
    tags: ["LAND", "MELEE"],
    hp: 90, dmg: 26, range: 1.0, fireRate: 1.5, moveSpeed: 4.6,
    desc: "Fast melee brawler. Chases down stragglers.",
  },
  lancer: {
    id: "lancer",
    name: "Lancer",
    rarity: "rare",
    tags: ["LAND", "RANGED"],
    hp: 70, dmg: 90, range: 10.0, fireRate: 0.35, moveSpeed: 2.2,
    projectile: { kind: "beam", color: "#dceaff", speed: 32 },
    desc: "Long-range single-target sniper. Shines vs elites.",
  },
  bolter: {
    id: "bolter",
    name: "Bolter",
    rarity: "common",
    tags: ["FLYING", "RANGED"],
    hp: 55, dmg: 9, range: 4.5, fireRate: 1.3, moveSpeed: 3.8,
    projectile: { kind: "tracer", color: "#c3a9e6", speed: 16 },
    desc: "Simple flying drone. Fast harasser.",
  },
  hornet: {
    id: "hornet",
    name: "Hornet",
    rarity: "common",
    tags: ["FLYING", "RANGED"],
    hp: 65, dmg: 13, range: 5.0, fireRate: 2.2, moveSpeed: 4.8,
    projectile: { kind: "tracer", color: "#f0a04b", speed: 22 },
    desc: "Strafing flier. High attack speed, low HP.",
  },
  wall: {
    id: "wall",
    name: "Wall",
    rarity: "common",
    tags: ["LAND", "STRUCTURE"],
    hp: 340, dmg: 0, range: 0, fireRate: 0, moveSpeed: 0,
    immobile: true,
    desc: "Blocks land paths. No attack. Forces re-route.",
  },
  spike_trap: {
    id: "spike_trap",
    name: "Spike Trap",
    rarity: "common",
    tags: ["LAND", "TRAP"],
    hp: 1, dmg: 180, range: 1.0, fireRate: 0, moveSpeed: 0,
    immobile: true,
    oneShot: true,
    desc: "Place on a path. One-time massive DMG to first zombie that crosses.",
  },
};

export const UNIT_IDS = Object.keys(UNITS);
