// ============================================================================
// state.js — THE single source of truth (see CONTRACTS.md "State shape").
//
// FROZEN SHAPE. Subsystem modules READ this and DISPATCH mutations through the
// helpers here; they do NOT add new top-level fields. Need a new field? Request
// it in CONTRACTS.md and the integrator adds it here at a wave boundary.
//
// Node-safe: imports only events/util. No three, no DOM.
// ============================================================================

import { emit } from "./util/events.js";

// --- Enums ------------------------------------------------------------------

export const SCENE = Object.freeze({
  MENU: "menu",
  CONFIG: "config",
  RUN: "run",
  DRAFT: "draft",
  OVER: "over",
  CARDS: "cards",
  STATS: "stats",
  SETTINGS: "settings",
});

export const PHASE = Object.freeze({
  BUILD: "build",
  ATTACK: "attack",
});

// Default clicker stats (from prompt.md "Game Rules").
export const BASE_STATS = Object.freeze({
  attackChance: 0.5, // % chance a click lands an attack
  attackDamage: 1, // damage on a landed click
  critChance: 0.05, // chance a landed attack crits (x3)
  harvestChance: 0.6, // chance a click harvests a resource
  harvestYield: 1, // amount per successful harvest
  clickCooldown: 120, // ms between counted clicks
});

export const BUILD_PHASE_SECONDS = 60;
export const HAND_CAP = 7;
export const SCHEMA_VERSION = 1;

// --- The state object -------------------------------------------------------

export const state = {
  scene: SCENE.MENU,
  speed: 1, // 1 / 2 / 3 time multiplier

  // Per-run data (null between runs; populated by newRun()).
  run: null,

  // Live resources for the active run.
  resources: { gold: 0, wood: 0, iron: 0, food: 0 },

  // Clicker stats for the active run (base + run upgrades + meta).
  playerStats: { ...BASE_STATS },

  // Map: tiles keyed "col,row"; revealed is a Set of keys; castle {col,row}.
  map: {
    size: 3,
    seed: "",
    tiles: new Map(), // key -> tile (see world/tiles.js schema)
    revealed: new Set(), // keys currently visible
    castle: null, // {col,row}
    bounds: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 }, // revealed extent
  },

  // Runtime entity lists (instances, not defs).
  placed: [], // buildings: { id, defId, col, row, hp, maxHp, ... }
  units: [], // player units (figure-cluster groups)
  enemies: [], // enemy groups
  projectiles: [], // tower/ranged shots in flight
  fx: [], // transient visual effects queue (render drains this)

  // Cards.
  hand: [], // card instances in hand
  draftOptions: [], // current 3-card draft, when scene === DRAFT

  // Selection (RTS).
  selection: [], // selected unit ids

  // Persistent meta (survives runs; loaded by persistence.js).
  meta: {
    unlockedCards: [], // card ids ever drafted
    renown: 0,
    throneUpgrades: [],
    settings: {
      sfxVolume: 0.8,
      musicVolume: 0.6,
      screenShake: true,
      cameraInvert: false,
      colorBlindMode: false,
    },
  },

  // Lifetime records.
  records: {
    bestRound: 0,
    totalRuns: 0,
    totalKills: 0,
    totalRenownEarned: 0,
    last10: [], // [{ seed, roundsSurvived, score, duration }]
  },
};

// --- Run lifecycle ----------------------------------------------------------

// Fresh per-run sub-state. Map/tiles are filled by world/generate.js.
export function newRun({ seed, mapSize }) {
  state.run = {
    seed,
    mapSize,
    round: 1,
    phase: PHASE.BUILD,
    timer: BUILD_PHASE_SECONDS, // seconds remaining in build phase
    xp: 0,
    tier: 1,
    kills: 0,
    startedAt: 0, // stamped by caller (Date.now unavailable in pure logic)
    revealedCount: 0,
    reprieveUsed: false, // keep one-time castle reprieve
  };
  state.resources = { gold: 0, wood: 0, iron: 0, food: 0 };
  state.playerStats = { ...BASE_STATS };
  state.map = {
    size: mapSize,
    seed,
    tiles: new Map(),
    revealed: new Set(),
    castle: null,
    bounds: { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 },
  };
  state.placed = [];
  state.units = [];
  state.enemies = [];
  state.projectiles = [];
  state.fx = [];
  state.hand = [];
  state.draftOptions = [];
  state.selection = [];
  return state.run;
}

// --- Mutations (dispatch helpers) -------------------------------------------

export function setScene(scene) {
  if (state.scene === scene) return;
  state.scene = scene;
  emit("scene-changed", { scene });
}

export function setPhase(phase) {
  if (!state.run || state.run.phase === phase) return;
  state.run.phase = phase;
  emit("phase-changed", { phase, round: state.run.round });
}

export function addResource(type, amount) {
  if (!(type in state.resources)) return;
  state.resources[type] += amount;
  emit("resource-changed", { type, amount, total: state.resources[type] });
}

export function canAfford(cost) {
  if (!cost) return true;
  for (const k in cost) if ((state.resources[k] || 0) < cost[k]) return false;
  return true;
}

// Spend a cost object { gold, wood, ... }. Returns false (no-op) if unaffordable.
export function spend(cost) {
  if (!canAfford(cost)) return false;
  for (const k in cost) addResource(k, -cost[k]);
  return true;
}

// Convenience id generator for runtime instances (deterministic-free; ok for
// instance identity, not for seeded logic).
let _idSeq = 1;
export const nextId = (prefix = "e") => `${prefix}${_idSeq++}`;

// Re-export for listeners that prefer importing from state.
export { on, off, once, emit } from "./util/events.js";
