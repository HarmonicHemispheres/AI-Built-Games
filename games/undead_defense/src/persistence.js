import { state } from "./state.js";

const KEY = "undead_defense_save_v1";
const SCHEMA = 1;

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const obj = JSON.parse(raw);
    if (!obj || obj.schema_version !== SCHEMA) return;
    if (obj.meta) {
      state.meta.unlockedCards = obj.meta.unlockedCards ?? state.meta.unlockedCards;
      state.meta.bestRound = obj.meta.bestRound ?? 0;
      state.meta.totalKills = obj.meta.totalKills ?? 0;
      state.meta.settings = { ...state.meta.settings, ...(obj.meta.settings || {}) };
    }
  } catch (e) {
    console.warn("[persistence] load failed", e);
  }
}

export function saveMeta() {
  try {
    const payload = {
      schema_version: SCHEMA,
      meta: state.meta,
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("[persistence] save failed", e);
  }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch {}
}
