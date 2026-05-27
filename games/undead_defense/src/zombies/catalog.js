export const ZOMBIES = {
  shambler: {
    id: "shambler", name: "Shambler",
    hp: 60, dmg: 5, speed: 1.4, size: 0.45,
    color: "#7ea05a", reward: 4,
    traits: ["LAND"],
  },
  runner: {
    id: "runner", name: "Runner",
    hp: 32, dmg: 4, speed: 3.6, size: 0.35,
    color: "#b5c473", reward: 5,
    traits: ["LAND"],
  },
  brute: {
    id: "brute", name: "Brute",
    hp: 260, dmg: 14, speed: 1.0, size: 0.6,
    color: "#6c8649", reward: 10,
    traits: ["LAND"],
  },
  bloated_shambler: {
    id: "bloated_shambler", name: "Bloated Shambler",
    hp: 2200, dmg: 30, speed: 0.9, size: 0.95,
    color: "#d05a4a", reward: 60,
    traits: ["LAND", "ELITE", "BOSS"],
    onDeath: { type: "explode", radius: 2.5, dmg: 40 },
  },
};
