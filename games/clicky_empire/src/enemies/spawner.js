// ============================================================================
// enemies/spawner.js — wave composition + timed spawning. PURE LOGIC.
//
// No three, no DOM. Imports only Wave-1/Stage-0 merged files + own siblings
// (behavior.js). Node-runnable.
//
// (CONTRACTS §14 "W2-Enemies", prompt.md "Enemies" / "Rounds & Progression"):
//   - buildWave(round) -> { total, groups:[{enemyId,count}], edges }
//       composition shifts by round: early rounds are raiders/wolves; skirmisher
//       & sapper enter ~round 4; a WARLORD is FORCED when round === 5 (on top of a
//       base wave). Size grows ~ base + round*k. Seeded deterministically by
//       makeRng(`${state.run.seed}:wave:${round}`) so a seed+round reproduces it.
//   - startWave(plan): flatten groups into a spawn queue, choose random revealed
//       map-EDGE tiles to spawn from, store the schedule.
//   - updateSpawner(dt) -> bool: spawn queued enemies over time (small interval),
//       return true once the queue is empty (all enemies spawned).
//
// Enemies spawn at random VISIBLE-map edges and path toward the castle (the
// pathing/AI lives in behavior.js).
// ============================================================================

import { state } from "../state.js";
import { makeRng } from "../util/rng.js";
import { N8, tileKey, parseTileKey } from "../util/math.js";
import { createEnemy } from "./behavior.js";

// --- Tuning knobs -----------------------------------------------------------

const BASE_COUNT = 4; // base wave size at round 0
const PER_ROUND = 2; // +k enemies per round (size ~ base + round*k)
const SPAWN_INTERVAL = 0.4; // seconds between individual spawns
const SKIRM_SAPPER_ROUND = 4; // skirmisher & sapper enter at this round
const WARLORD_ROUND = 5; // warlord forced on this milestone round

// Number of distinct spawn edges to use, growing slightly with round (more
// directions of attack later). Bounded so small maps don't run out of edges.
function edgeCountFor(round) {
  return Math.min(6, 1 + Math.floor(round / 2));
}

// ---------------------------------------------------------------------------
// Wave composition
// ---------------------------------------------------------------------------

// Deterministic wave plan for `round`. Same seed + round -> identical plan.
// Returns { total, groups:[{enemyId,count}], edges } where `edges` is the count
// of spawn directions (startWave resolves the actual tiles against the live map).
export function buildWave(round) {
  const seed = `${state.run?.seed ?? "noseed"}:wave:${round}`;
  const rng = makeRng(seed);

  // Total grows linearly with round (with a small deterministic jitter).
  const baseTotal = BASE_COUNT + round * PER_ROUND;
  const jitter = rng.int(0, Math.max(0, Math.floor(round / 2))); // 0..round/2
  let total = baseTotal + jitter;

  const counts = {};
  const add = (id, n) => {
    if (n <= 0) return;
    counts[id] = (counts[id] || 0) + n;
  };

  // Warlord is FORCED on the milestone round, on TOP of a base wave (it does not
  // consume the regular budget — the round-5 wave is a base wave + 1 warlord).
  if (round === WARLORD_ROUND) {
    add("warlord", 1);
  }

  // Distribute the `total` budget across the round-appropriate roster using
  // weighted rolls. Early rounds skew raider with a few wolves; skirmisher and
  // sapper appear from round 4 on.
  const roster = [
    { id: "raider", weight: () => 5 }, // the workhorse, always present
    { id: "wolf", weight: (r) => (r >= 1 ? 2 : 0) }, // some wolves from the start
    { id: "skirmisher", weight: (r) => (r >= SKIRM_SAPPER_ROUND ? 2.5 : 0) },
    { id: "sapper", weight: (r) => (r >= SKIRM_SAPPER_ROUND ? 2 : 0) },
  ];
  const pool = roster
    .map((e) => ({ id: e.id, weight: Math.max(0, e.weight(round)) }))
    .filter((e) => e.weight > 0);

  // Guarantee at least one raider so a wave is never empty/degenerate.
  let budget = Math.max(1, total);
  add("raider", 1);
  budget -= 1;

  for (let i = 0; i < budget; i++) {
    const pick = rng.weighted(pool, (e) => e.weight);
    add(pick.id, 1);
  }

  // Build the canonical groups array in a stable roster order so the plan is
  // deterministic regardless of insertion order.
  const order = ["raider", "wolf", "skirmisher", "sapper", "warlord"];
  const groups = [];
  let grandTotal = 0;
  for (const id of order) {
    if (counts[id]) {
      groups.push({ enemyId: id, count: counts[id] });
      grandTotal += counts[id];
    }
  }

  return { total: grandTotal, groups, edges: edgeCountFor(round) };
}

// ---------------------------------------------------------------------------
// Spawn-edge selection
// ---------------------------------------------------------------------------

// A tile is a "spawn edge" if it is REVEALED + walkable and has at least one
// neighbour that is NOT revealed (i.e. it borders the fog / map edge) — that is
// where enemies emerge from the surrounding darkness.
function isRevealedEdge(col, row) {
  const key = tileKey(col, row);
  if (!state.map.revealed.has(key)) return false;
  const tile = state.map.tiles.get(key);
  if (!tile || !tile.walkable) return false;
  for (const { dc, dr } of N8) {
    if (!state.map.revealed.has(tileKey(col + dc, row + dr))) return true;
  }
  return false;
}

// Collect every revealed-edge walkable tile on the current map.
function collectEdgeTiles() {
  const out = [];
  for (const key of state.map.revealed) {
    const { col, row } = parseTileKey(key);
    if (isRevealedEdge(col, row)) out.push({ col, row });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Spawn schedule (module-private, rebuilt each startWave)
// ---------------------------------------------------------------------------

let schedule = null; // { queue:[{enemyId,col,row}], timer }

// Flatten a plan into a timed spawn queue, assigning each enemy a random
// revealed-edge spawn tile. Stored privately; updateSpawner drains it.
export function startWave(plan) {
  const rng = makeRng(`${state.run?.seed ?? "noseed"}:spawn:${state.run?.round ?? 0}`);

  const edges = collectEdgeTiles();
  // Choose up to `plan.edges` distinct spawn tiles to use this wave. Fall back to
  // ALL revealed walkable tiles if the map has no clear edge (tiny/odd maps), and
  // ultimately to the castle tile so we never crash.
  let candidates = edges;
  if (candidates.length === 0) {
    candidates = [];
    for (const key of state.map.revealed) {
      const { col, row } = parseTileKey(key);
      const tile = state.map.tiles.get(key);
      if (tile && tile.walkable) candidates.push({ col, row });
    }
  }
  if (candidates.length === 0 && state.map.castle) {
    candidates = [{ col: state.map.castle.col, row: state.map.castle.row }];
  }

  // Pick the working set of spawn edges (shuffled, capped at plan.edges).
  const shuffled = rng.shuffle([...candidates]);
  const wantEdges = Math.max(1, Math.min(plan?.edges ?? 1, shuffled.length || 1));
  const chosen = shuffled.slice(0, wantEdges);

  // Flatten groups -> a flat list of enemyIds, then assign a spawn tile to each
  // (round-robin across chosen edges, jittered by the rng so it isn't perfectly
  // striped).
  const flat = [];
  for (const g of plan?.groups ?? []) {
    for (let i = 0; i < g.count; i++) flat.push(g.enemyId);
  }
  rng.shuffle(flat);

  const queue = flat.map((enemyId, i) => {
    const edge = chosen.length ? chosen[(i + rng.int(0, chosen.length)) % chosen.length] : null;
    const col = edge ? edge.col : (state.map.castle?.col ?? 0);
    const row = edge ? edge.row : (state.map.castle?.row ?? 0);
    return { enemyId, col, row };
  });

  schedule = { queue, timer: 0 };
  return schedule;
}

// Advance spawning by `dt` seconds; spawn at most as many as the elapsed time
// allows. Returns true once the queue is fully drained (all enemies spawned).
export function updateSpawner(dt) {
  if (!schedule) return true;
  if (schedule.queue.length === 0) return true;

  schedule.timer -= dt;
  // Spawn while the accumulated time allows (handles big dt / fast-forward).
  let guard = schedule.queue.length + 1;
  while (schedule.timer <= 0 && schedule.queue.length > 0 && guard-- > 0) {
    const next = schedule.queue.shift();
    createEnemy(next.enemyId, next.col, next.row);
    schedule.timer += SPAWN_INTERVAL;
  }

  return schedule.queue.length === 0;
}

// Test/utility: peek at the current schedule (read-only).
export function _getSchedule() {
  return schedule;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

import { registerSystems } from "../run.js";

export function initSpawner() {
  registerSystems({ buildWave, startWave, updateSpawner });
}
