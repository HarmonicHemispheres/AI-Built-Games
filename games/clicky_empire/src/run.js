// ============================================================================
// run.js — the BUILD <-> ATTACK phase state machine + round lifecycle.
// Integrator-owned glue. Subsystems plug into the `systems` registry via
// registerSystems(); run.js stays stable while implementations land.
//
// Phase loop (prompt.md "Gameloop"):
//   BUILD (timer counts down; DEFEND ends early) -> ATTACK (waves spawn, path to
//   castle) -> on clear: payout + XP + tier check + 3-card draft -> next BUILD.
//   Castle destroyed -> game over.
// ============================================================================

import {
  state,
  PHASE,
  SCENE,
  setPhase,
  setScene,
  BUILD_PHASE_SECONDS,
} from "./state.js";
import { emit } from "./util/events.js";

// Pluggable systems. Stage 0 ships no-op defaults; Wave 2 modules overwrite via
// registerSystems(). Keeping the surface here lets run.js compile/run alone.
const systems = {
  // economy: idle resource ticks during build phase
  tickEconomy: (_dt) => {},
  // units: per-tick AI (move/attack/idle)
  updateUnits: (_dt) => {},
  // enemies: per-tick AI
  updateEnemies: (_dt) => {},
  // projectiles / combat effects
  updateCombat: (_dt) => {},
  // spawner: build a wave plan for a round
  buildWave: (_round) => ({ total: 0 }),
  // spawner: begin spawning the planned wave
  startWave: (_plan) => {},
  // spawner: advance spawning; returns true when all enemies have spawned
  updateSpawner: (_dt) => true,
  // upkeep: food consumption + desertion at round end
  applyUpkeep: () => {},
  // cards: end-of-round draft generation (returns option list)
  rollDraft: () => [],
  // payout: resource bonus + XP for clearing a round
  roundPayout: (_round) => {},
  // tier: recompute tier from XP; returns new tier
  recomputeTier: () => state.run?.tier ?? 1,
  // autosave hook
  save: () => {},
};

export function registerSystems(partial) {
  Object.assign(systems, partial);
}

let currentWave = null;

// --- Phase transitions ------------------------------------------------------

export function startBuildPhase() {
  if (!state.run) return;
  state.run.phase = PHASE.BUILD;
  state.run.timer = BUILD_PHASE_SECONDS;
  setPhase(PHASE.BUILD);
  systems.save();
}

// Called by the DEFEND button or when the build timer hits zero.
export function startAttackPhase() {
  if (!state.run || state.run.phase === PHASE.ATTACK) return;
  currentWave = systems.buildWave(state.run.round);
  setPhase(PHASE.ATTACK);
  systems.startWave(currentWave);
  emit("wave-incoming", { round: state.run.round, plan: currentWave });
}

// Round cleared: pay out, XP, tier, draft, then next build phase (or draft scene).
function clearRound() {
  const r = state.run;
  systems.applyUpkeep();
  systems.roundPayout(r.round);
  const newTier = systems.recomputeTier();
  if (newTier !== r.tier) {
    r.tier = newTier;
    emit("tier-unlocked", { tier: newTier });
  }
  emit("round-cleared", { round: r.round });
  if (r.round > state.records.bestRound) state.records.bestRound = r.round;

  // Offer a draft; the draft UI calls advanceToNextRound() when done.
  state.draftOptions = systems.rollDraft();
  if (state.draftOptions.length > 0) {
    setScene(SCENE.DRAFT);
  } else {
    advanceToNextRound();
  }
}

export function advanceToNextRound() {
  if (!state.run) return;
  state.run.round += 1;
  state.draftOptions = [];
  if (state.scene !== SCENE.RUN) setScene(SCENE.RUN);
  startBuildPhase();
}

export function gameOver() {
  emit("game-over", {
    round: state.run?.round ?? 0,
    kills: state.run?.kills ?? 0,
  });
  setScene(SCENE.OVER);
}

// --- Per-frame update -------------------------------------------------------
// dt is in seconds, already scaled by state.speed by the caller (main loop).

export function updateRun(dt) {
  const r = state.run;
  if (!r || state.scene !== SCENE.RUN) return;

  if (r.phase === PHASE.BUILD) {
    systems.tickEconomy(dt);
    systems.updateUnits(dt);
    r.timer -= dt;
    if (r.timer <= 0) {
      r.timer = 0;
      startAttackPhase();
    }
  } else if (r.phase === PHASE.ATTACK) {
    systems.tickEconomy(dt); // economy keeps ticking during the fight
    systems.updateUnits(dt);
    systems.updateEnemies(dt);
    systems.updateCombat(dt);

    const allSpawned = systems.updateSpawner(dt);
    if (allSpawned && state.enemies.length === 0) {
      clearRound();
    }
  }

  // Lose condition: castle destroyed (and no keep reprieve). The building system
  // sets state.run.castleDown; reprieve handling lives there too.
  if (r.castleDown) {
    gameOver();
  }
}

export function getCurrentWave() {
  return currentWave;
}
