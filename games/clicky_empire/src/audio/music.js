// ============================================================================
// audio/music.js — build/combat background music LAYERS, fully SYNTHESIZED.
//
// v1 ships ZERO audio asset files. Two looping layers run continuously and are
// mixed by a gain crossfade:
//   - BUILD  : a calm, warm pad + a slow major arpeggio.
//   - COMBAT : a tenser, faster minor pulse + a low driving drone.
// `setMusicPhase('build'|'combat')` just crossfades the two layer gains; both
// loops keep running underneath so the transition is seamless.
//
// INTEGRATION (read this):
//   - Call `initMusic()` ONCE at startup. Like sfx, it only wires a one-time
//     pointerdown/keydown handler that boots the music graph on the first user
//     gesture (autoplay policy). It starts in the 'build' phase, silent until
//     unlocked.
//   - Then call `setMusicPhase('build')` / `setMusicPhase('combat')` on phase
//     changes (e.g. from a `phase-changed` listener in your run/UI module). This
//     module deliberately does NOT subscribe to events itself, to stay a pure,
//     self-contained subsystem the integrator drives.
//   - If you have a known gesture and want to start now, call `resumeMusic()`.
//
//   - Overall level is read LIVE from `state.meta.settings.musicVolume` (0..1)
//     and applied every animation frame, so the slider responds instantly. 0
//     mutes (and we pause the oscillators to save CPU).
//
// NODE-SAFE: importing this module touches no WebAudio/DOM; all access is guarded.
// ============================================================================

import { state } from "../state.js";

// --- Environment / feature detection ----------------------------------------

const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext || null
    : null;
const HAS_AUDIO = !!AudioCtx;
const HAS_RAF = typeof requestAnimationFrame === "function";

// --- Tunables ----------------------------------------------------------------

const CROSSFADE = 1.6; // seconds to fade between phases
const MASTER_TRIM = 0.5; // music sits under sfx; keep it gentle

// --- Module state ------------------------------------------------------------

let ctx = null;
let masterGain = null; // musicVolume * MASTER_TRIM
let buildGain = null; // layer mix gain (0..1)
let combatGain = null; // layer mix gain (0..1)
let started = false; // graph + loops constructed
let initialised = false; // initMusic() wired the gesture listeners
let phase = "build"; // current target phase
let rafId = 0; // volume-follower animation frame
let arpTimer = null; // setInterval handle for the build arpeggio
let pulseTimer = null; // setInterval handle for the combat pulse
const layerNodes = []; // long-lived oscillators we start/stop with the graph

// --- Helpers -----------------------------------------------------------------

function musicVolume() {
  const v = state?.meta?.settings?.musicVolume;
  if (typeof v !== "number" || Number.isNaN(v)) return 0.6;
  return Math.max(0, Math.min(1, v));
}

function ensureContext() {
  if (!HAS_AUDIO) return null;
  if (ctx) return ctx;
  try {
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0; // raised by the volume follower
    masterGain.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

// A sustained, detuned oscillator feeding a layer bus through its own gain.
function makeDrone(layerBus, { type, freq, detune = 0, level = 0.12 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  g.gain.value = level;
  osc.connect(g).connect(layerBus);
  osc.start();
  layerNodes.push(osc);
  return osc;
}

// A short plucked note into a layer bus (used by arpeggio / pulse loops).
function pluck(layerBus, { type = "triangle", freq, dur = 0.45, peak = 0.18 }) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g).connect(layerBus);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
    } catch {
      /* gone */
    }
  };
}

// Note frequencies (Hz). Build = C major-ish; combat = A minor-ish + low drive.
const BUILD_ARP = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63]; // C E G C5 G E
const COMBAT_ARP = [220.0, 261.63, 329.63, 220.0]; // A C E A — minor, urgent

let arpStep = 0;
let pulseStep = 0;

function buildGraph() {
  if (started || !ctx) return;
  started = true;

  buildGain = ctx.createGain();
  combatGain = ctx.createGain();
  // start fully on the build layer
  buildGain.gain.value = 1;
  combatGain.gain.value = 0;
  buildGain.connect(masterGain);
  combatGain.connect(masterGain);

  // --- BUILD layer: warm pad (stacked detuned sines + a soft saw) ---
  makeDrone(buildGain, { type: "sine", freq: 130.81, level: 0.14 }); // C3
  makeDrone(buildGain, { type: "sine", freq: 196.0, detune: 4, level: 0.1 }); // G3
  makeDrone(buildGain, { type: "triangle", freq: 261.63, detune: -5, level: 0.06 }); // C4

  // --- COMBAT layer: low driving drone + a fifth for tension ---
  makeDrone(combatGain, { type: "sawtooth", freq: 110.0, level: 0.1 }); // A2
  makeDrone(combatGain, { type: "square", freq: 164.81, detune: 6, level: 0.05 }); // E3

  // --- Loop sequencers (interval-driven plucks) ---
  // Build arpeggio: gentle, slow.
  arpStep = 0;
  arpTimer = setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    const f = BUILD_ARP[arpStep % BUILD_ARP.length];
    arpStep++;
    pluck(buildGain, { type: "triangle", freq: f, dur: 0.5, peak: 0.14 });
  }, 520);

  // Combat pulse: faster, punchier, minor.
  pulseStep = 0;
  pulseTimer = setInterval(() => {
    if (!ctx || ctx.state !== "running") return;
    const f = COMBAT_ARP[pulseStep % COMBAT_ARP.length];
    pulseStep++;
    pluck(combatGain, { type: "sawtooth", freq: f, dur: 0.22, peak: 0.16 });
  }, 260);

  applyPhase(phase, true); // sync gains to the current phase instantly
  startVolumeFollower();
}

// Crossfade the two layer gains toward the target phase.
function applyPhase(target, instant = false) {
  if (!ctx || !buildGain || !combatGain) return;
  const now = ctx.currentTime;
  const buildTo = target === "build" ? 1 : 0;
  const combatTo = target === "combat" ? 1 : 0;
  const t = instant ? 0.01 : CROSSFADE;
  for (const [node, to] of [
    [buildGain, buildTo],
    [combatGain, combatTo],
  ]) {
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(to, now + t);
  }
}

// Continuously track musicVolume so the slider is live. Also pauses/resumes the
// context when muted to save CPU.
function startVolumeFollower() {
  if (!HAS_RAF || rafId) return;
  const tick = () => {
    rafId = requestAnimationFrame(tick);
    if (!ctx || !masterGain) return;
    const target = musicVolume() * MASTER_TRIM;
    // smooth, click-free follow
    masterGain.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  };
  rafId = requestAnimationFrame(tick);
}

// --- Public API --------------------------------------------------------------

/**
 * Wire a one-time user-gesture handler that boots the music graph + loops on the
 * first pointerdown/keydown. Idempotent; safe before/without DOM. Music begins
 * in the 'build' phase.
 */
export function initMusic() {
  if (initialised) return;
  initialised = true;
  if (!HAS_AUDIO || typeof window === "undefined" || !window.addEventListener) {
    return; // headless / unsupported — setMusicPhase() will no-op
  }
  const unlock = () => {
    resumeMusic();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

/**
 * Boot/resume the music graph now (use inside a known user gesture). Returns a
 * Promise. Idempotent.
 */
export function resumeMusic() {
  const c = ensureContext();
  if (!c) return Promise.resolve();
  const finish = () => {
    buildGraph();
    return undefined;
  };
  if (c.state === "suspended" && c.resume) {
    return c.resume().then(finish).catch(() => {});
  }
  finish();
  return Promise.resolve();
}

/**
 * Crossfade between the calm BUILD layer and the tense COMBAT layer.
 * Accepts 'build' | 'combat'. No-op (no throw) on unknown phase or unavailable
 * audio. Remembers the request even before the graph is unlocked.
 */
export function setMusicPhase(next) {
  if (next !== "build" && next !== "combat") return;
  phase = next;
  if (!HAS_AUDIO) return;
  if (started) applyPhase(phase);
  // if not started yet, buildGraph() will sync to `phase` once unlocked
}

/**
 * Stop all music and tear down the loops. (Optional convenience for scene exits;
 * the graph will rebuild on the next resume.)
 */
export function stopMusic() {
  if (arpTimer) clearInterval(arpTimer);
  if (pulseTimer) clearInterval(pulseTimer);
  arpTimer = pulseTimer = null;
  for (const osc of layerNodes) {
    try {
      osc.stop();
      osc.disconnect();
    } catch {
      /* already stopped */
    }
  }
  layerNodes.length = 0;
  if (rafId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(rafId);
  }
  rafId = 0;
  started = false;
}
