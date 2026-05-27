// Central game state. Single source of truth that other modules read/dispatch against.

export const defaultSettings = () => ({
  mouseSensitivity: 1.0,
  fov: 78,
  brightness: 1.0,
  masterVolume: 0.8,
  headBob: true,
  filmGrain: true,
});

export const defaultRunState = (seed) => ({
  seed,
  player: {
    pos: { x: 4.0, y: 1.6, z: 4.0 }, // center of start cubicle
    yaw: 0,
    pitch: 0,
  },
  flashlight: {
    on: false,
    battery: 1.0, // 0..1
  },
  inventory: {
    batteries: 0,
    saveTokens: 1,
  },
  journal: {
    documents: [], // ids
    tapes: [],
    polaroids: [],
  },
  knownChunks: [], // "cx,cz" strings — chunks the player has loaded at least once
  currentAct: 1,
});

export function createState() {
  return {
    scene: "menu", // "menu" | "playing" | "paused"
    settings: defaultSettings(),
    completionFlags: {
      reached_act_2: false,
      reached_act_3: false,
      reached_act_4: false,
      found_director_office: false,
    },
    foundFindables: [], // persists across runs — every id ever discovered
    run: null,          // RunState or null
    ui: {
      panelOpen: null,    // "journal" | "settings" | "map-panel" | "reader" | "credits" | null
      toastUntil: 0,
    },
    listeners: new Set(),
  };
}

export function subscribe(state, fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

export function emit(state, evt) {
  for (const fn of state.listeners) fn(evt);
}
