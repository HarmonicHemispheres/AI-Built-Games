// Central game state. Other modules read from this and mutate via helpers.
// One source of truth; render reads, never writes.

export const TILE_SIZE = 36;
export const MAP_W = 28;
export const MAP_H = 28;

export const SCENE = {
  MENU: "menu",
  DECK: "deck",
  PREP: "prep",
  COMBAT: "combat",
  DRAFT: "draft",
  RESULT: "result",
  CARDS: "cards",
  SETTINGS: "settings",
};

export const state = {
  scene: SCENE.MENU,
  prevScene: null,
  paused: false,
  speed: 1,
  now: 0,

  meta: {
    unlockedCards: ["sentry", "bulwark", "scrapper", "lancer", "bolter", "hornet", "wall", "spike_trap"],
    bestRound: 0,
    totalKills: 0,
    settings: {
      sfx: 0.6,
      music: 0.4,
      screenShake: true,
    },
  },

  run: null, // populated when a run starts

  map: null, // {width, height, tiles, toxicZone, spawnPoints, exits, paths}

  units: [],          // { id, type, x, y, hp, maxHp, cooldown, stance, target, command, anchor, hitFlash, ... }
  zombies: [],        // { id, type, x, y, hp, maxHp, pathIdx, pathProg, exitIdx, hitFlash }
  projectiles: [],    // { x, y, tx, ty, target, dmg, speed, kind, color, life }
  particles: [],      // { x, y, vx, vy, life, maxLife, color, size }
  floatingText: [],   // { x, y, text, color, life, maxLife }
  effects: [],        // status effects on zombies, keyed elsewhere

  selection: new Set(),
  hoveredTile: null,
  attackMoveArmed: false,
  dragPlacementCard: null,
  dragGhost: null,    // { x, y, valid }
  boxSelect: null,    // { startX, startY, x, y }

  camera: { x: 0, y: 0, zoom: 1 },
  canvasSize: { w: 1280, h: 720 },
  shake: 0,

  prep: { timeLeft: 0, maxTime: 30 },
  wave: { active: false, spawned: 0, total: 0, alive: 0, spawnTimer: 0, spawnInterval: 1.0, plan: [] },
  results: { kills: 0, goldEarned: 0 },
};

let nextId = 1;
export function freshId() { return nextId++; }

export function newRun(seed, deck) {
  state.run = {
    seed,
    act: 1,
    round: 1,
    maxRounds: 5,
    gold: 0,
    containment: 100,
    deck: [...deck],
    hand: [...deck],     // for v1: hand = deck (all cards placeable each prep)
    handUsed: new Set(), // ids placed this prep
    upgrades: [],
    bossDefeated: false,
  };
  state.units = [];
  state.zombies = [];
  state.projectiles = [];
  state.particles = [];
  state.floatingText = [];
  state.selection.clear();
  state.results = { kills: 0, goldEarned: 0 };
  state.prep.timeLeft = state.prep.maxTime;
  state.wave.active = false;
  state.shake = 0;
}

export function setScene(s) {
  state.prevScene = state.scene;
  state.scene = s;
}
