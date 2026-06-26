// Persistence round-trip — verifies the v1 DoD persistence requirement:
// unlocked cards, renown, and best round survive a "reload". Stubs localStorage
// (absent in node) with a Map-backed shim, then exercises loadSave/saveMeta/wipe.
//
// Run: node games/clicky_empire/test/persistence.test.mjs

import assert from "node:assert/strict";

// Stub localStorage BEFORE importing persistence (dynamic import after setup).
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { state } = await import("../src/state.js");
const { loadSave, saveMeta, wipeSave } = await import("../src/persistence.js");

let passed = 0;
const ok = (l) => { passed++; console.log(`  ✓ ${l}`); };

// First load on a blank store seeds a fresh save.
loadSave();
assert.equal(state.records.bestRound, 0);
ok("blank load seeds defaults");

// Simulate a run's results, then persist.
state.records.bestRound = 7;
state.records.totalRuns = 3;
state.records.totalKills = 142;
state.meta.unlockedCards = ["sawmill", "ballista_tower", "knight_ignored"];
state.meta.renown = 42;
state.meta.settings.sfxVolume = 0.3;
saveMeta();
ok("saveMeta writes to storage");

// Wipe the in-memory state to prove load actually restores from storage.
state.records.bestRound = 0;
state.records.totalRuns = 0;
state.records.totalKills = 0;
state.meta.unlockedCards = [];
state.meta.renown = 0;
state.meta.settings.sfxVolume = 0.8;

// Reload (as on a fresh page load).
loadSave();
assert.equal(state.records.bestRound, 7, "best round persisted");
assert.equal(state.records.totalRuns, 3, "total runs persisted");
assert.equal(state.records.totalKills, 142, "total kills persisted");
assert.deepEqual(state.meta.unlockedCards, ["sawmill", "ballista_tower", "knight_ignored"], "unlocked cards persisted");
assert.equal(state.meta.renown, 42, "renown persisted");
assert.equal(state.meta.settings.sfxVolume, 0.3, "settings persisted");
ok("reload restores records + unlocked cards + renown + settings");

// Wipe clears everything back to a blank save.
wipeSave();
loadSave();
assert.equal(state.records.bestRound, 0, "wipe reset best round");
assert.deepEqual(state.meta.unlockedCards, [], "wipe reset unlocks");
assert.equal(state.meta.renown, 0, "wipe reset renown");
ok("wipeSave resets to blank");

console.log(`\nPersistence: ${passed} checks passed.`);
