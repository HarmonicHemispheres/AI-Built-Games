// RTS verification (W2-RTS) — pure-logic node tests for selection.js +
// commands.js. input.js touches three and is exercised in rts_harness.html,
// not here. Run: `node games/clicky_empire/test/rts.test.mjs`

import assert from "node:assert/strict";

import { state } from "../src/state.js";
import { on, clearAll } from "../src/util/events.js";
import {
  select,
  addToSelection,
  clearSelection,
  boxSelect,
} from "../src/rts/selection.js";
import { move, attack, attackMove, stop } from "../src/rts/commands.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// Seed a small army at known world positions. (Unit shape per CONTRACTS §10/§14;
// only the fields these modules read are required.)
function seedUnits() {
  state.units = [
    { id: "u1", unitId: "militia", pos: { x: 0, y: 0, z: 0 }, order: null },
    { id: "u2", unitId: "militia", pos: { x: 2, y: 0, z: 1 }, order: null },
    { id: "u3", unitId: "spearman", pos: { x: 5, y: 0, z: 5 }, order: null },
    { id: "u4", unitId: "archer", pos: { x: -3, y: 0, z: -2 }, order: null },
  ];
  state.enemies = [{ id: "e1", enemyId: "raider", pos: { x: 4, y: 0, z: 4 } }];
  state.selection = [];
}

// --- select() updates state.selection + emits unit-selected -----------------
{
  clearAll();
  seedUnits();
  let emitted = null;
  on("unit-selected", (p) => (emitted = p));

  select(["u1", "u3"]);
  assert.deepEqual(state.selection, ["u1", "u3"], "select sets selection in order");
  assert.deepEqual(emitted, { ids: ["u1", "u3"] }, "select emits unit-selected {ids}");

  // Unknown ids are filtered; duplicates de-duped.
  select(["u2", "u2", "nope"]);
  assert.deepEqual(state.selection, ["u2"], "select filters stale + dupes");

  ok("select updates state.selection + emits");
}

// --- addToSelection merges; clearSelection empties + emits -------------------
{
  clearAll();
  seedUnits();
  select(["u1"]);
  addToSelection(["u3", "u1"]); // u1 already present -> no dupe
  assert.deepEqual(state.selection, ["u1", "u3"], "addToSelection merges without dupes");

  let cleared = null;
  on("unit-selected", (p) => (cleared = p));
  clearSelection();
  assert.deepEqual(state.selection, [], "clearSelection empties selection");
  assert.deepEqual(cleared, { ids: [] }, "clearSelection emits empty ids");

  ok("addToSelection merges + clearSelection empties/emits");
}

// --- boxSelect picks units inside a world rect, excludes outside ------------
{
  clearAll();
  seedUnits();
  let emitted = null;
  on("unit-selected", (p) => (emitted = p));

  // Rect covering x[-1..3], z[-1..2] => contains u1(0,0) and u2(2,1) only.
  boxSelect({ minX: -1, maxX: 3, minZ: -1, maxZ: 2 });
  assert.deepEqual(state.selection, ["u1", "u2"], "boxSelect includes inside, excludes outside");
  assert.deepEqual(emitted, { ids: ["u1", "u2"] }, "boxSelect emits selected ids");

  // Reversed corners (raw drag) normalize to the same result.
  boxSelect({ minX: 3, maxX: -1, minZ: 2, maxZ: -1 });
  assert.deepEqual(state.selection, ["u1", "u2"], "boxSelect normalizes reversed corners");

  // Inclusive boundary: u3 at (5,5) sits exactly on the max edge.
  boxSelect({ minX: 5, maxX: 6, minZ: 5, maxZ: 6 });
  assert.deepEqual(state.selection, ["u3"], "boxSelect boundary is inclusive");

  // Empty rect far away selects nothing.
  boxSelect({ minX: 100, maxX: 101, minZ: 100, maxZ: 101 });
  assert.deepEqual(state.selection, [], "boxSelect over empty area selects nothing");

  // Additive (shift-drag) merges box hits into the current selection.
  select(["u3"]);
  boxSelect({ minX: -1, maxX: 3, minZ: -1, maxZ: 2 }, { additive: true });
  assert.deepEqual(state.selection, ["u1", "u2", "u3"], "additive boxSelect merges with current selection");
  // A non-additive box replaces it.
  boxSelect({ minX: -1, maxX: 3, minZ: -1, maxZ: 2 });
  assert.deepEqual(state.selection, ["u1", "u2"], "non-additive boxSelect replaces selection");

  ok("boxSelect picks inside / excludes outside / inclusive bounds / additive merges");
}

// --- move/attack/attackMove/stop set the correct order ----------------------
{
  clearAll();
  seedUnits();
  select(["u1", "u2"]);

  const tile = { col: 7, row: 8 };
  move(state.selection, tile);
  const u1 = state.units.find((u) => u.id === "u1");
  const u2 = state.units.find((u) => u.id === "u2");
  const u3 = state.units.find((u) => u.id === "u3");
  assert.deepEqual(u1.order, { type: "move", tile }, "move sets {type:'move',tile} on u1");
  assert.deepEqual(u2.order, { type: "move", tile }, "move sets order on u2");
  assert.equal(u3.order, null, "move leaves unselected unit untouched");
  // Per-unit fresh order objects (mutating one must not affect the other).
  assert.notStrictEqual(u1.order, u2.order, "each unit gets its own order object");

  attack(state.selection, "e1");
  assert.deepEqual(u1.order, { type: "attack", targetId: "e1" }, "attack sets {type:'attack',targetId}");

  const am = { col: 2, row: 2 };
  attackMove(state.selection, am);
  assert.deepEqual(u1.order, { type: "attackMove", tile: am }, "attackMove sets {type:'attackMove',tile}");

  stop(state.selection);
  assert.deepEqual(u1.order, { type: "stop" }, "stop sets {type:'stop'}");
  assert.deepEqual(u2.order, { type: "stop" }, "stop applies to whole selection");

  // Empty ids is a safe no-op.
  const before = u3.order;
  move([], { col: 0, row: 0 });
  assert.equal(u3.order, before, "command with empty ids is a no-op");

  ok("move/attack/attackMove/stop set correct order on selected units");
}

clearAll();
console.log(`\nRTS: ${passed} checks passed.`);
