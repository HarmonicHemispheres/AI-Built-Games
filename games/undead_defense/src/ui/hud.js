import { state, SCENE } from "../state.js";
import { UNITS } from "../units/catalog.js";
import { setStanceForSelection } from "../rts/commands.js";

const $ = (sel) => document.querySelector(sel);

const MODE_INFO = {
  seek:   { label: "Seek",   desc: "Actively hunt the nearest zombie. Will leave its post." },
  defend: { label: "Defend", desc: "Hold position and engage targets only within range." },
  sentry: { label: "Sentry", desc: "Lock onto first target acquired and chase until eliminated." },
};

let modeButtonsWired = false;
function wireModeButtons() {
  if (modeButtonsWired) return;
  modeButtonsWired = true;
  const tooltip = $("#mode-tooltip");
  for (const btn of document.querySelectorAll("#sel-modes .mode-btn")) {
    btn.addEventListener("click", () => {
      setStanceForSelection(btn.dataset.mode);
    });
    btn.addEventListener("mouseenter", () => {
      const info = MODE_INFO[btn.dataset.mode];
      tooltip.textContent = info ? `${info.label}: ${info.desc}` : "";
      tooltip.classList.add("show");
    });
    btn.addEventListener("mouseleave", () => {
      tooltip.classList.remove("show");
    });
  }
}

export function updateHUD() {
  if (state.scene !== SCENE.PREP && state.scene !== SCENE.COMBAT) {
    $("#game-hud").classList.add("hidden");
    return;
  }
  $("#game-hud").classList.remove("hidden");
  $("#hud-containment").textContent = state.run.containment;
  $("#hud-gold").textContent = state.run.gold;
  $("#hud-act").textContent = state.run.act;
  $("#hud-round").textContent = `${state.run.round} / ${state.run.maxRounds}`;
  $("#hud-seed").textContent = state.run.seed;
  if (state.scene === SCENE.PREP) {
    $("#hud-phase").textContent = "PREP";
    const t = Math.max(0, Math.ceil(state.prep.timeLeft));
    $("#hud-timer").textContent = `${t}s`;
    $("#btn-end-prep").style.display = "";
  } else {
    $("#hud-phase").textContent = "COMBAT";
    $("#hud-timer").textContent = `${state.zombies.length} left`;
    $("#btn-end-prep").style.display = "none";
  }

  // Containment color cue.
  const cval = $("#hud-containment");
  cval.style.color = state.run.containment < 25 ? "var(--danger)" :
                     state.run.containment < 60 ? "var(--warn)" : "";

  // Selected unit panel.
  updateSelectedPanel();
}

function updateSelectedPanel() {
  wireModeButtons();
  const panel = $("#selected-panel");
  if (state.selection.size === 0) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  const ids = [...state.selection];
  const units = state.units.filter(u => ids.includes(u.id) && !u.dead);
  if (units.length === 0) { panel.classList.add("hidden"); return; }
  let activeStance = units[0].stance;
  if (units.length === 1) {
    const u = units[0];
    const cat = UNITS[u.type];
    $("#sel-name").textContent = cat.name;
    $("#sel-hp").textContent = `${Math.ceil(u.hp)} / ${Math.ceil(u.maxHp)}`;
    $("#sel-dmg").textContent = u.dmg.toFixed(0);
    $("#sel-range").textContent = u.range.toFixed(1);
    const frac = Math.max(0, u.hp / u.maxHp);
    const fill = $("#sel-hp-fill");
    fill.style.width = (frac * 100) + "%";
    fill.style.background = frac > 0.5 ? "var(--hp-good)" : frac > 0.25 ? "var(--hp-mid)" : "var(--hp-low)";
  } else {
    $("#sel-name").textContent = `${units.length} units selected`;
    const totalHp = units.reduce((s, u) => s + u.hp, 0);
    const totalMax = units.reduce((s, u) => s + u.maxHp, 0);
    $("#sel-hp").textContent = `${Math.ceil(totalHp)} / ${Math.ceil(totalMax)}`;
    $("#sel-dmg").textContent = "—";
    $("#sel-range").textContent = "—";
    $("#sel-hp-fill").style.width = ((totalHp / totalMax) * 100) + "%";
    activeStance = units.every(u => u.stance === activeStance) ? activeStance : null;
  }
  // Reflect active stance on mode buttons.
  for (const btn of document.querySelectorAll("#sel-modes .mode-btn")) {
    btn.classList.toggle("active", btn.dataset.mode === activeStance);
    // Structures/traps don't have stances.
    const showStance = units.some(u => !u.isStructure && !u.isTrap);
    btn.disabled = !showStance;
  }
}

export function showWaveBanner(text = "WAVE INCOMING") {
  const el = $("#wave-banner");
  el.textContent = text;
  el.classList.remove("hidden");
  // Restart animation
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  setTimeout(() => el.classList.add("hidden"), 1700);
}
