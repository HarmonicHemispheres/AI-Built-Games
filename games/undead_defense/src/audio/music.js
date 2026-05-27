// V1: very simple ambient drone via Web Audio. Real layered music is v2.

import { state } from "../state.js";

let ac = null, master = null, oscA = null, oscB = null;

export function startMusic() {
  if (oscA) return;
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = state.meta.settings.music * 0.18;
    master.connect(ac.destination);
    oscA = ac.createOscillator(); oscA.type = "sine"; oscA.frequency.value = 73;
    oscB = ac.createOscillator(); oscB.type = "sine"; oscB.frequency.value = 110;
    const gA = ac.createGain(); gA.gain.value = 0.6;
    const gB = ac.createGain(); gB.gain.value = 0.4;
    oscA.connect(gA); gA.connect(master);
    oscB.connect(gB); gB.connect(master);
    // slow LFO on B for a "drone" feel
    const lfo = ac.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.08;
    const lfoGain = ac.createGain(); lfoGain.gain.value = 8;
    lfo.connect(lfoGain); lfoGain.connect(oscB.frequency);
    oscA.start(); oscB.start(); lfo.start();
  } catch {}
}

export function setMusicVolume(v) {
  if (master) master.gain.value = v * 0.18;
}
