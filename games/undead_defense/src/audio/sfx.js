// Procedural SFX via Web Audio API. No asset files needed for v1.
// Each sfx is a short tone burst with shape per kind.

import { state } from "../state.js";

let ac = null;
let master = null;

function ctx() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain();
      master.gain.value = 0.6;
      master.connect(ac.destination);
    } catch { return null; }
  }
  return ac;
}

export function setSfxVolume(v) {
  if (master) master.gain.value = v;
}

export function playSfx(kind) {
  const a = ctx();
  if (!a) return;
  const vol = state.meta.settings.sfx;
  if (vol <= 0) return;

  const recipes = {
    shoot:      { type: "square",   freq: 880, fall: 220, dur: 0.06, vol: 0.18 },
    melee:      { type: "triangle", freq: 220, fall: 120, dur: 0.08, vol: 0.22 },
    trap:       { type: "sawtooth", freq: 520, fall: 100, dur: 0.18, vol: 0.30 },
    place:      { type: "triangle", freq: 660, fall: 880, dur: 0.10, vol: 0.20 },
    click:      { type: "square",   freq: 740, fall: 740, dur: 0.04, vol: 0.18 },
    zombie_die: { type: "sawtooth", freq: 260, fall: 100, dur: 0.18, vol: 0.22 },
    unit_die:   { type: "sawtooth", freq: 180, fall: 60,  dur: 0.30, vol: 0.30 },
    boss_die:   { type: "sawtooth", freq: 110, fall: 40,  dur: 0.80, vol: 0.45 },
    wave:       { type: "square",   freq: 220, fall: 880, dur: 0.40, vol: 0.30 },
    win:        { type: "triangle", freq: 600, fall: 1200, dur: 0.50, vol: 0.35 },
    lose:       { type: "sawtooth", freq: 200, fall: 60,  dur: 0.80, vol: 0.40 },
  };
  const r = recipes[kind];
  if (!r) return;

  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = r.type;
  osc.frequency.setValueAtTime(r.freq, a.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, r.fall), a.currentTime + r.dur);
  g.gain.setValueAtTime(r.vol * vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + r.dur);
  osc.connect(g); g.connect(master);
  osc.start();
  osc.stop(a.currentTime + r.dur + 0.02);
}

export function resumeAudio() {
  const a = ctx(); if (a && a.state === "suspended") a.resume();
}
