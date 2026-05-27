import { state } from "../state.js";
import { spawnZombie } from "./behavior.js";

// Build a wave plan for the given round. Returns list of {typeId, delay}.
export function buildWavePlan(round, isBossRound) {
  const plan = [];
  if (isBossRound) {
    // Round 5: boss + supporting horde.
    let t = 0;
    for (let i = 0; i < 6; i++) { plan.push({ typeId: "shambler", delay: t }); t += 0.8; }
    for (let i = 0; i < 3; i++) { plan.push({ typeId: "runner", delay: t }); t += 0.6; }
    plan.push({ typeId: "bloated_shambler", delay: t + 1.0 });
    for (let i = 0; i < 4; i++) { plan.push({ typeId: "brute", delay: t + 2 + i * 1.2 }); }
    return plan;
  }
  // Normal rounds 1..4: scale shambler / runner / brute counts.
  const base = 8 + round * 3;
  let t = 0;
  for (let i = 0; i < base; i++) {
    const roll = Math.random();
    let typeId = "shambler";
    if (roll < 0.18 + round * 0.04) typeId = "runner";
    else if (roll > 0.85 - round * 0.05) typeId = "brute";
    plan.push({ typeId, delay: t });
    t += Math.max(0.45, 1.1 - round * 0.08);
  }
  return plan;
}

export function startWave(plan) {
  state.wave = {
    active: true,
    spawned: 0,
    total: plan.length,
    alive: 0,
    spawnTimer: 0,
    plan,
    started: state.now,
  };
}

export function updateSpawner(dt) {
  const w = state.wave;
  if (!w.active) return;
  w.spawnTimer += dt;
  while (w.spawned < w.total) {
    const next = w.plan[w.spawned];
    if (w.spawnTimer < next.delay) break;
    const spawnPoints = state.map.spawnPoints;
    const sp = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
    const candidates = state.map.paths.filter(p => p.start.x === sp.x && p.start.y === sp.y);
    if (candidates.length === 0) { w.spawned++; continue; }
    const path = candidates[Math.floor(Math.random() * candidates.length)];
    spawnZombie(next.typeId, path);
    w.spawned++;
  }
}

export function waveComplete() {
  return state.wave.active && state.wave.spawned >= state.wave.total && state.zombies.length === 0;
}
