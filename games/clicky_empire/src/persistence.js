// ============================================================================
// persistence.js — localStorage read/write + schema migration.
// Stage 0 ships meta+records+settings persistence. Resumable mid-run saves are
// a v2 deferral (current_run is stubbed but not yet written each phase).
// ============================================================================

import { state, SCHEMA_VERSION } from "./state.js";

const KEY = "clicky_empire_save_v1";

function blankSave() {
  return {
    schema_version: SCHEMA_VERSION,
    meta: {
      unlocked_cards: [],
      renown: 0,
      throne_upgrades: [],
      settings: { ...state.meta.settings },
    },
    records: {
      best_round: 0,
      total_runs: 0,
      total_kills: 0,
      total_renown_earned: 0,
      last_10_runs: [],
    },
    current_run: null,
  };
}

export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return; // storage blocked; run in-memory
  }
  if (!raw) {
    writeSave(blankSave());
    return;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = blankSave();
  }
  data = migrate(data);

  // Hydrate state.meta + records from the save.
  state.meta.unlockedCards = data.meta.unlocked_cards ?? [];
  state.meta.renown = data.meta.renown ?? 0;
  state.meta.throneUpgrades = data.meta.throne_upgrades ?? [];
  Object.assign(state.meta.settings, data.meta.settings ?? {});
  state.records.bestRound = data.records.best_round ?? 0;
  state.records.totalRuns = data.records.total_runs ?? 0;
  state.records.totalKills = data.records.total_kills ?? 0;
  state.records.totalRenownEarned = data.records.total_renown_earned ?? 0;
  state.records.last10 = data.records.last_10_runs ?? [];
}

function migrate(data) {
  if (!data || typeof data !== "object") return blankSave();
  if (data.schema_version === SCHEMA_VERSION) return data;
  // Future migrations branch on version here. For now, merge onto a blank base.
  const base = blankSave();
  return {
    ...base,
    meta: { ...base.meta, ...(data.meta ?? {}) },
    records: { ...base.records, ...(data.records ?? {}) },
    schema_version: SCHEMA_VERSION,
  };
}

function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / disabled storage */
  }
}

// Persist meta + records (called after runs / on settings change).
export function saveMeta() {
  const data = {
    schema_version: SCHEMA_VERSION,
    meta: {
      unlocked_cards: state.meta.unlockedCards,
      renown: state.meta.renown,
      throne_upgrades: state.meta.throneUpgrades,
      settings: state.meta.settings,
    },
    records: {
      best_round: state.records.bestRound,
      total_runs: state.records.totalRuns,
      total_kills: state.records.totalKills,
      total_renown_earned: state.records.totalRenownEarned,
      last_10_runs: state.records.last10,
    },
    current_run: null,
  };
  writeSave(data);
}

export function wipeSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  writeSave(blankSave());
}
