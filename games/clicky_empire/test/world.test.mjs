// World subsystem verification — deterministic asserts for map gen, fog
// expansion, and pathfinding. Run:
//   node games/clicky_empire/test/world.test.mjs
// Pure logic: no three, no DOM. Node-runnable.

import assert from "node:assert/strict";

import { tileKey } from "../src/util/math.js";
import { state, newRun, addResource } from "../src/state.js";
import { clearAll, on } from "../src/util/events.js";
import { TILE, getTileType } from "../src/world/tiles.js";
import { generateMap, tileAt, rollTileType } from "../src/world/generate.js";
import { expansionCost, frontier, canExpandTo, expandTo } from "../src/world/expand.js";
import { isWalkable, findPath, nearestWalkableToward } from "../src/world/pathfind.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// Snapshot the live tiles map into a plain {key:type} object for comparison.
function typeSnapshot(map) {
  const out = {};
  for (const [k, t] of map.tiles) out[k] = t.type;
  return out;
}

// --- tiles.js v1 set complete ---
for (const t of [TILE.GRASS, TILE.FOREST, TILE.WATER, TILE.MOUNTAIN, TILE.ORE, TILE.BERRY]) {
  const def = getTileType(t);
  assert.equal(def.type, t, `tile def exists for ${t}`);
}
assert.equal(getTileType(TILE.MOUNTAIN).walkable, false);
assert.equal(getTileType(TILE.MOUNTAIN).buildable, false);
assert.equal(getTileType(TILE.BERRY).clickYield.resource, "food");
assert.ok(Array.isArray(getTileType(TILE.ORE).clickYield), "ore_vein clickYield is weighted[]");
const oreOpts = getTileType(TILE.ORE).clickYield.map((o) => o.resource).sort();
assert.deepEqual(oreOpts, ["gold", "iron"], "ore_vein yields gold or iron");
assert.equal(getTileType(TILE.ORE).clickYield[0].weight, getTileType(TILE.ORE).clickYield[1].weight, "ore 50/50");
// v1 must NOT add gem/desert/marsh.
assert.equal(getTileType("gem_vein").type, TILE.GRASS, "gem_vein not defined (falls back to grass)");
ok("tiles.js v1 set complete (mountain/ore/berry), gem/desert/marsh deferred");

// --- determinism: same seed -> identical tile type map ---
newRun({ seed: "SEEDX", mapSize: 5 });
generateMap("SEEDX", 5);
const snapA = typeSnapshot(state.map);
const revealedA = [...state.map.revealed].sort();

newRun({ seed: "SEEDX", mapSize: 5 });
generateMap("SEEDX", 5);
const snapB = typeSnapshot(state.map);
const revealedB = [...state.map.revealed].sort();

assert.deepEqual(snapB, snapA, "same seed => identical tile types");
assert.deepEqual(revealedB, revealedA, "same seed => identical revealed set");

// Different seed => (very likely) different map.
newRun({ seed: "SEEDY", mapSize: 5 });
generateMap("SEEDY", 5);
const snapC = typeSnapshot(state.map);
assert.notDeepEqual(snapC, snapA, "different seed => different map");
ok("determinism: generateMap('SEEDX',5) twice => identical maps; different seed differs");

// --- castle at center, normalized to grasslands; revealed block is size×size ---
newRun({ seed: "CASTLE1", mapSize: 5 });
generateMap("CASTLE1", 5);
assert.deepEqual(state.map.castle, { col: 0, row: 0 }, "castle at exact center (0,0)");
assert.equal(tileAt(0, 0).type, TILE.GRASS, "castle tile normalized to grasslands");
assert.equal(state.map.revealed.size, 25, "5x5 reveal => 25 tiles");
// Verify the revealed block is exactly the centered 5x5.
for (let r = -2; r <= 2; r++) {
  for (let c = -2; c <= 2; c++) {
    assert.ok(state.map.revealed.has(tileKey(c, r)), `(${c},${r}) revealed`);
  }
}
assert.ok(!state.map.revealed.has(tileKey(3, 0)), "(3,0) outside block is fog");
assert.deepEqual(
  state.map.bounds,
  { minCol: -2, maxCol: 2, minRow: -2, maxRow: 2 },
  "bounds match revealed block",
);
assert.equal(state.run.revealedCount, 25, "run.revealedCount synced");

// 3x3 and 4x4 sizes.
generateMap("CASTLE1", 3);
assert.equal(state.map.revealed.size, 9, "3x3 reveal => 9 tiles");
assert.equal(tileAt(0, 0).type, TILE.GRASS);
generateMap("CASTLE1", 4);
assert.equal(state.map.revealed.size, 16, "4x4 reveal => 16 tiles");
assert.ok(state.map.revealed.has(tileKey(0, 0)), "castle revealed in even-size block");
assert.equal(tileAt(0, 0).type, TILE.GRASS);
ok("castle centered + grasslands; reveal block is size×size for 3/4/5");

// --- rollTileType is consistent for both modules (order-independent) ---
{
  const { makeRng } = await import("../src/util/rng.js");
  const rng = makeRng("RT");
  const first = rollTileType(7, -3, rng);
  // call other coords in between; should not perturb the result for (7,-3).
  rollTileType(1, 1, rng);
  rollTileType(-5, 9, rng);
  const again = rollTileType(7, -3, rng);
  assert.equal(again, first, "rollTileType is a pure function of (col,row,seed)");
}
ok("rollTileType deterministic + order-independent");

// --- expansionCost strictly increasing ---
let prev = -Infinity;
for (let n = 1; n <= 300; n++) {
  const c = expansionCost(n);
  assert.ok(c > prev, `expansionCost(${n})=${c} > prev=${prev}`);
  assert.ok(Number.isInteger(c), "cost is an integer (ceil)");
  prev = c;
}
// First purchase past the baseline is cheap; cost ramps from there.
assert.equal(expansionCost(9, 9), 5, "first tile past the baseline costs 5");
assert.equal(expansionCost(25), Math.ceil(5 * 26 ** 1.1), "cost formula matches contract");
assert.ok(expansionCost(40, 30) < expansionCost(40, 9), "fewer tiles bought => cheaper");
ok("expansionCost strictly increasing (integer, 5*(bought+1)^1.1)");

// --- frontier + expand ---
newRun({ seed: "EXP", mapSize: 3 });
generateMap("EXP", 3);
const fr = frontier();
// A 3x3 block has 12 orthogonally-adjacent fog tiles (4 sides x 3, corners excluded by N4).
assert.equal(fr.length, 12, "3x3 frontier has 12 N4-adjacent fog tiles");
for (const f of fr) {
  assert.equal(
    f.cost,
    expansionCost(state.map.revealed.size, state.map.baseRevealed),
    "frontier cost = expansionCost(revealed, base)",
  );
  assert.ok(!state.map.revealed.has(tileKey(f.col, f.row)), "frontier tiles are fog");
}

// Cannot expand without gold.
const target = fr[0];
assert.equal(state.resources.gold, 0);
assert.equal(canExpandTo(target.col, target.row), false, "no gold => cannot expand");
assert.equal(expandTo(target.col, target.row), false, "expandTo fails without gold");
assert.ok(!state.map.revealed.has(tileKey(target.col, target.row)), "tile stays fog");

// Non-frontier (far away) tile is never expandable.
assert.equal(canExpandTo(50, 50), false, "non-adjacent tile not expandable");

// With gold, expand succeeds, spends, reveals, emits, grows bounds & count.
clearAll();
let emitted = null;
on("tile-revealed", (p) => (emitted = p));
addResource("gold", 1000);
const cost = expansionCost(state.map.revealed.size, state.map.baseRevealed);
const beforeCount = state.map.revealed.size;
const beforeGold = state.resources.gold;
assert.equal(canExpandTo(target.col, target.row), true, "with gold => can expand");
assert.equal(expandTo(target.col, target.row), true, "expandTo succeeds");
assert.equal(state.resources.gold, beforeGold - cost, "gold spent = cost");
assert.ok(state.map.revealed.has(tileKey(target.col, target.row)), "tile revealed");
assert.equal(state.map.revealed.size, beforeCount + 1, "revealed count grew by 1");
assert.equal(state.run.revealedCount, beforeCount + 1, "run.revealedCount synced");
assert.deepEqual(emitted, { col: target.col, row: target.row }, "tile-revealed emitted");
assert.equal(expandTo(target.col, target.row), false, "cannot re-expand an already-revealed tile");
clearAll();
ok("frontier + expandTo: cost/spend/reveal/emit/bounds/count all correct");

// --- pathfinding ---
// Build a controlled tiny map: a 5x5 all-grass revealed block (grass is walkable).
// To make a deterministic test we overwrite a known revealed map with grass and
// add a wall.
newRun({ seed: "PATH", mapSize: 5 });
generateMap("PATH", 5);
// Force the whole revealed 5x5 to grass (walkable) for a predictable test.
for (const key of state.map.revealed) {
  const { col, row } = { col: Number(key.split(",")[0]), row: Number(key.split(",")[1]) };
  state.map.tiles.set(key, { col, row, type: TILE.GRASS, ...getTileType(TILE.GRASS) });
}

// Adjacent walkable tiles => path of length 2.
const p1 = findPath({ col: 0, row: 0 }, { col: 1, row: 0 });
assert.ok(Array.isArray(p1), "path between adjacent walkable tiles exists");
assert.equal(p1.length, 2, "adjacent path has 2 nodes");
assert.deepEqual(p1[0], { col: 0, row: 0 });
assert.deepEqual(p1[p1.length - 1], { col: 1, row: 0 });

// Same tile => single-node path.
const pSame = findPath({ col: 0, row: 0 }, { col: 0, row: 0 });
assert.deepEqual(pSame, [{ col: 0, row: 0 }], "start==goal => single node");

// Longer path across the block, every step is N4-adjacent.
const pLong = findPath({ col: -2, row: -2 }, { col: 2, row: 2 });
assert.ok(pLong, "path across block exists");
assert.deepEqual(pLong[0], { col: -2, row: -2 });
assert.deepEqual(pLong[pLong.length - 1], { col: 2, row: 2 });
assert.equal(pLong.length, 9, "Manhattan-optimal length (8 steps => 9 nodes)");
for (let i = 1; i < pLong.length; i++) {
  const d = Math.abs(pLong[i].col - pLong[i - 1].col) + Math.abs(pLong[i].row - pLong[i - 1].row);
  assert.equal(d, 1, "each step is 4-adjacent");
}

// Unwalkable goal => null. Make (1,0) water (not walkable).
state.map.tiles.set(tileKey(1, 0), { col: 1, row: 0, type: TILE.WATER, ...getTileType(TILE.WATER) });
assert.equal(isWalkable(1, 0), false, "water is not walkable");
assert.equal(findPath({ col: 0, row: 0 }, { col: 1, row: 0 }), null, "path to unwalkable goal => null");

// Unrevealed goal => null (out of fog).
assert.equal(isWalkable(10, 10), false, "unrevealed tile not walkable");
assert.equal(findPath({ col: 0, row: 0 }, { col: 10, row: 10 }), null, "path to fogged goal => null");

// Unreachable goal: wall off (2,2) completely with water on its 4-neighbours,
// then it's an isolated walkable island => null from the rest of the block.
state.map.tiles.set(tileKey(1, 2), { col: 1, row: 2, type: TILE.WATER, ...getTileType(TILE.WATER) });
state.map.tiles.set(tileKey(2, 1), { col: 2, row: 1, type: TILE.WATER, ...getTileType(TILE.WATER) });
// (3,2) and (2,3) are outside the revealed 5x5 (already fog/unwalkable), so (2,2)
// is now fully isolated.
assert.equal(findPath({ col: 0, row: 0 }, { col: 2, row: 2 }), null, "isolated walkable goal => null (unreachable)");
ok("findPath: adjacent path, optimal length, null for unwalkable/fogged/unreachable goals");

// --- nearestWalkableToward ---
// From (0,0) toward (2,2): best step is (1,0) or (0,1) (both reduce distance).
// (1,0) is water now, so it should step to (0,1).
const step = nearestWalkableToward({ col: 0, row: 0 }, { col: 2, row: 2 });
assert.ok(
  (step.col === 0 && step.row === 1) || (step.col === 1 && step.row === 0),
  "nearestWalkableToward picks a distance-reducing walkable neighbour",
);
assert.equal(isWalkable(step.col, step.row), true, "the chosen step is walkable");
// Fully boxed-in start returns itself.
state.map.tiles.set(tileKey(-2, -2), { col: -2, row: -2, type: TILE.GRASS, ...getTileType(TILE.GRASS) });
state.map.tiles.set(tileKey(-1, -2), { col: -1, row: -2, type: TILE.WATER, ...getTileType(TILE.WATER) });
state.map.tiles.set(tileKey(-2, -1), { col: -2, row: -1, type: TILE.WATER, ...getTileType(TILE.WATER) });
// (-3,-2) and (-2,-3) are fog => not walkable. So (-2,-2) is boxed in.
const stuck = nearestWalkableToward({ col: -2, row: -2 }, { col: 2, row: 2 });
assert.deepEqual(stuck, { col: -2, row: -2 }, "boxed-in tile returns itself");
ok("nearestWalkableToward: steps toward goal, holds when stuck");

clearAll();
console.log(`\nWorld: ${passed} checks passed.`);
