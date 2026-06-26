// ============================================================================
// audio/sfx.js — pooled one-shot sound effects, fully SYNTHESIZED via WebAudio.
//
// v1 ships ZERO audio asset files: every sound is built from oscillators and
// noise buffers shaped by gain envelopes. No external fetches, no <audio>.
//
// INTEGRATION (read this):
//   - Call `initAudio()` ONCE at app startup (e.g. from main.js bootstrap).
//     It is cheap and side-effect-free w.r.t. the AudioContext: it only wires a
//     ONE-TIME `pointerdown`/`keydown` listener that creates + resumes the
//     AudioContext on the first user gesture (browsers block audio before that).
//   - After that, just call `playSfx(name)` from anywhere; if the context isn't
//     ready yet (no gesture seen) the call is a graceful no-op.
//   - If you already have a known user gesture and want to force-resume now, call
//     `resumeAudio()` (also returns a promise). Both paths are idempotent.
//
//   - Volume is read LIVE from `state.meta.settings.sfxVolume` (0..1) on every
//     play, so settings changes take effect immediately. A value of 0 mutes.
//
// NODE-SAFE: importing this module touches no WebAudio/DOM. Every access is
// guarded behind feature checks, so `node --check` and headless import succeed.
// ============================================================================

import { state } from "../state.js";

// --- Environment / feature detection (computed once, lazily) ----------------

const AudioCtx =
  typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext || null
    : null;

const HAS_AUDIO = !!AudioCtx;

// --- Module-private audio graph (created lazily on first gesture) -----------

let ctx = null; // AudioContext
let masterGain = null; // GainNode — everything routes through here
let noiseBuffer = null; // shared white-noise buffer for percussive/air sounds
let initialised = false; // initAudio() wired the gesture listeners
let activeVoices = 0; // count of currently-playing source nodes (for pooling)

const MAX_VOICES = 24; // hard cap on concurrent source nodes; drops excess

// --- Helpers ----------------------------------------------------------------

function sfxVolume() {
  // Read live; clamp defensively. Missing settings => sensible default.
  const v = state?.meta?.settings?.sfxVolume;
  if (typeof v !== "number" || Number.isNaN(v)) return 0.8;
  return Math.max(0, Math.min(1, v));
}

// Build (once) a 1s white-noise buffer we can reuse for percussive sounds.
function getNoiseBuffer() {
  if (noiseBuffer || !ctx) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 1.0);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return noiseBuffer;
}

// Lazily create the AudioContext + master bus. Safe to call repeatedly.
function ensureContext() {
  if (!HAS_AUDIO) return null;
  if (ctx) return ctx;
  try {
    ctx = new AudioCtx();
    masterGain = ctx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(ctx.destination);
  } catch {
    ctx = null; // creation can throw in locked-down environments
  }
  return ctx;
}

// Voice bookkeeping so we never stack an unbounded number of source nodes.
// Each oscillator / noise burst counts as one voice.
function acquireVoice() {
  if (activeVoices >= MAX_VOICES) return false;
  activeVoices++;
  return true;
}

// Reserve a slot + auto-release when the source ends. Returns false if full.
function trackSource(node) {
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    activeVoices = Math.max(0, activeVoices - 1);
    try {
      node.disconnect();
    } catch {
      /* already gone */
    }
  };
  node.onended = release;
}

// --- Synthesis primitives ----------------------------------------------------

// A short tone: oscillator -> gain envelope -> master, scaled by sfx volume.
// opts: { type, freq, freqTo?, dur, peak, attack?, delay? }
function tone(opts) {
  if (!ctx) return;
  const {
    type = "sine",
    freq = 440,
    freqTo = null,
    dur = 0.15,
    peak = 0.3,
    attack = 0.005,
    delay = 0,
  } = opts;

  if (!acquireVoice()) return; // pool full -> drop this voice

  const now = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (freqTo != null) {
    // exponential glides need strictly-positive targets
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), now + dur);
  }

  const amp = peak * sfxVolume();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(g).connect(masterGain);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  trackSource(osc);
}

// A noise burst (for impacts / air): noise -> bandpass -> gain -> master.
// opts: { dur, peak, freq, q?, delay? }
function noise(opts) {
  if (!ctx) return;
  const { dur = 0.12, peak = 0.3, freq = 1200, q = 1, delay = 0 } = opts;
  const buf = getNoiseBuffer();
  if (!buf) return;
  if (!acquireVoice()) return; // pool full -> drop this voice

  const now = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();

  src.buffer = buf;
  bp.type = "bandpass";
  bp.frequency.value = freq;
  bp.Q.value = q;

  const amp = peak * sfxVolume();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, amp), now + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  src.connect(bp).connect(g).connect(masterGain);
  src.start(now);
  src.stop(now + dur + 0.02);
  trackSource(src);
}

// --- The sound bank (name -> synth recipe) ----------------------------------
// Each entry is a distinct, short sound. They intentionally differ in timbre so
// the player can tell harvest / attack / crit / coin etc. apart by ear.

const BANK = {
  // soft, woody pluck — gathering a resource off a tile
  harvest() {
    tone({ type: "triangle", freq: 520, freqTo: 360, dur: 0.14, peak: 0.28 });
  },

  // dull thud — a landed melee click on an enemy
  attack() {
    tone({ type: "square", freq: 180, freqTo: 90, dur: 0.1, peak: 0.22 });
    noise({ dur: 0.06, peak: 0.18, freq: 800, q: 0.7 });
  },

  // brighter, higher, two-blip sparkle — a critical hit
  crit() {
    tone({ type: "sawtooth", freq: 880, freqTo: 1320, dur: 0.09, peak: 0.26 });
    tone({ type: "square", freq: 1320, freqTo: 1760, dur: 0.12, peak: 0.2, delay: 0.05 });
  },

  // chunky low "thunk" with a little body — placing a building
  place() {
    tone({ type: "sine", freq: 240, freqTo: 120, dur: 0.18, peak: 0.3 });
    noise({ dur: 0.1, peak: 0.16, freq: 400, q: 0.5, delay: 0.01 });
  },

  // tiny tick — generic UI click
  click() {
    tone({ type: "square", freq: 660, dur: 0.04, peak: 0.16, attack: 0.001 });
  },

  // descending sad tone + noise — a unit/figure dying
  death() {
    tone({ type: "sawtooth", freq: 300, freqTo: 70, dur: 0.32, peak: 0.24 });
    noise({ dur: 0.18, peak: 0.14, freq: 500, q: 0.6, delay: 0.02 });
  },

  // quick bright two-note chime — coin / gold pickup
  coin() {
    tone({ type: "sine", freq: 988, dur: 0.08, peak: 0.24 }); // B5
    tone({ type: "sine", freq: 1319, dur: 0.14, peak: 0.22, delay: 0.06 }); // E6
  },

  // two-tone alarm — the build->attack ("DEFEND!") klaxon
  klaxon() {
    tone({ type: "sawtooth", freq: 440, dur: 0.22, peak: 0.3 });
    tone({ type: "sawtooth", freq: 330, dur: 0.26, peak: 0.3, delay: 0.22 });
    tone({ type: "sawtooth", freq: 440, dur: 0.22, peak: 0.3, delay: 0.48 });
  },
};

// --- Public API --------------------------------------------------------------

/**
 * Wire a one-time user-gesture handler that creates + resumes the AudioContext.
 * Browsers block audio until a gesture occurs, so the actual context comes alive
 * on the first pointerdown/keydown. Idempotent; safe to call before/without DOM.
 */
export function initAudio() {
  if (initialised) return;
  initialised = true;
  if (!HAS_AUDIO || typeof window === "undefined" || !window.addEventListener) {
    return; // headless / unsupported — playSfx() will simply no-op
  }
  const unlock = () => {
    resumeAudio();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

/**
 * Force-create and resume the AudioContext now (use inside a known user
 * gesture). Returns a Promise that resolves when resumed, or immediately when
 * audio is unavailable. Idempotent.
 */
export function resumeAudio() {
  const c = ensureContext();
  if (!c) return Promise.resolve();
  if (c.state === "suspended" && c.resume) {
    return c.resume().catch(() => {});
  }
  return Promise.resolve();
}

/**
 * Play a one-shot effect by name. Names:
 *   harvest | attack | crit | place | click | death | coin | klaxon
 * No-op (no throw) if audio is unavailable, the context isn't unlocked yet, the
 * name is unknown, sfxVolume is 0, or the voice pool is full.
 */
export function playSfx(name) {
  if (!HAS_AUDIO) return;
  const recipe = BANK[name];
  if (!recipe) return;
  if (sfxVolume() <= 0) return;

  const c = ensureContext();
  if (!c || c.state !== "running") return; // not unlocked yet -> silent

  try {
    recipe(); // each tone()/noise() inside manages its own voice slot
  } catch {
    /* synthesis failed; ignore so a bad play can't break callers */
  }
}
