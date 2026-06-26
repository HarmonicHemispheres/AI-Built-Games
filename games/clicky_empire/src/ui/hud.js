// ============================================================================
// ui/hud.js — in-run HUD: top bar (resources + round/tier/seed/timer), castle
// HP banner, bottom bar (hand + DEFEND + speed), and the selected-unit panel.
//
// W3-UI owns this. It only READS state and calls the documented control APIs:
//   run.startAttackPhase()  — the DEFEND button
//   app.setSpeed(n)         — speed buttons
// Refresh happens via loop.onRender, writing only nodes whose value changed.
// See CONTRACTS §15 (hud.js).
// ============================================================================

import { state, PHASE, on } from "../state.js";
import { onRender } from "../loop.js";
import { setSpeed } from "../app.js";
import { startAttackPhase } from "../run.js";
import { getUnitDef } from "../units/catalog.js";

// Tier thresholds for the XP meter progress (mirrors integrator's recomputeTier,
// which is round-based in v1: T2 ~round 4, T3 ~round 8). We can't read the
// integrator function, so derive a readable progress bar from round vs. the next
// tier's round milestone. Purely cosmetic.
const TIER_ROUND = { 1: 0, 2: 4, 3: 8 };

let nodes = null;
// Cached last-written values so we only touch the DOM when something changed.
const last = {};
// Per-round resource baseline for the delta read-out.
let roundBaseline = { gold: 0, wood: 0, iron: 0, food: 0 };

function $(id) {
  return document.getElementById(id);
}

function cacheNodes() {
  nodes = {
    resGold: $("res-gold"),
    resWood: $("res-wood"),
    resIron: $("res-iron"),
    resFood: $("res-food"),
    deltaGold: $("delta-gold"),
    deltaWood: $("delta-wood"),
    deltaIron: $("delta-iron"),
    deltaFood: $("delta-food"),
    round: $("hud-round"),
    tier: $("hud-tier"),
    xpFill: $("hud-xp-fill"),
    seed: $("hud-seed"),
    phase: $("hud-phase"),
    phaseCell: document.querySelector("#top-bar .phase-cell"),
    timer: $("hud-timer"),
    castleBanner: $("castle-banner"),
    castleFill: $("castle-hp-fill"),
    castleText: $("castle-hp-text"),
    defend: $("btn-defend"),
    speedGroup: $("speed-group"),
    selPanel: $("selected-panel"),
    selName: $("sel-name"),
    selHpFill: $("sel-hp-fill"),
    selHp: $("sel-hp"),
    selDmg: $("sel-dmg"),
    selRange: $("sel-range"),
    selTags: $("sel-tags"),
  };
}

// Write text only when it differs from the cached value (cheap DOM hygiene).
function setText(node, key, value) {
  if (!node) return;
  if (last[key] === value) return;
  last[key] = value;
  node.textContent = value;
}

function setWidth(node, key, pct) {
  if (!node) return;
  if (last[key] === pct) return;
  last[key] = pct;
  node.style.width = pct + "%";
}

function setDelta(node, key, amount) {
  if (!node) return;
  const txt = amount > 0 ? `+${amount}` : amount < 0 ? `${amount}` : "";
  if (last[key] !== txt) {
    last[key] = txt;
    node.textContent = txt;
  }
  const cls = amount > 0 ? "pos" : amount < 0 ? "neg" : "";
  if (last[key + "_cls"] !== cls) {
    last[key + "_cls"] = cls;
    node.classList.toggle("pos", cls === "pos");
    node.classList.toggle("neg", cls === "neg");
  }
}

// --- DEFEND + speed wiring --------------------------------------------------

function wireControls() {
  if (nodes.defend) {
    nodes.defend.addEventListener("click", () => {
      if (state.run && state.run.phase === PHASE.BUILD) startAttackPhase();
    });
  }
  if (nodes.speedGroup) {
    nodes.speedGroup.addEventListener("click", (e) => {
      const btn = e.target.closest(".speed-btn");
      if (!btn) return;
      const n = Number(btn.dataset.speed) || 1;
      setSpeed(n);
      for (const b of nodes.speedGroup.querySelectorAll(".speed-btn")) {
        b.classList.toggle("active", b === btn);
      }
    });
  }
}

// --- Selected-unit panel (event-driven) -------------------------------------

function refreshSelection(ids) {
  const panel = nodes.selPanel;
  if (!panel) return;
  const sel = ids && ids.length ? ids : state.selection;
  if (!sel || sel.length === 0) {
    panel.classList.add("hidden");
    return;
  }
  const unit = state.units.find((u) => u.id === sel[0]);
  if (!unit) {
    panel.classList.add("hidden");
    return;
  }
  const def = unit.def || getUnitDef(unit.unitId) || {};
  const hp = Math.max(0, unit.hp ?? 0);
  const maxHp = unit.maxHp ?? def.hp ?? hp;
  if (nodes.selName) nodes.selName.textContent = def.name || unit.unitId || "Unit";
  if (nodes.selHp) nodes.selHp.textContent = `${hp} / ${maxHp}`;
  if (nodes.selDmg) nodes.selDmg.textContent = def.damage ?? "-";
  if (nodes.selRange) nodes.selRange.textContent = def.range != null ? def.range : "-";
  if (nodes.selHpFill) {
    const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
    nodes.selHpFill.style.width = pct + "%";
  }
  if (nodes.selTags) {
    nodes.selTags.innerHTML = "";
    for (const t of def.tags || []) {
      const span = document.createElement("span");
      span.className = "sel-tag";
      span.textContent = t;
      nodes.selTags.appendChild(span);
    }
  }
  panel.classList.remove("hidden");
}

// --- Per-frame refresh ------------------------------------------------------

function refresh() {
  if (!nodes || state.scene !== "run" || !state.run) return;
  const r = state.run;
  const res = state.resources;

  // Resources + per-round delta.
  setText(nodes.resGold, "gold", String(res.gold));
  setText(nodes.resWood, "wood", String(res.wood));
  setText(nodes.resIron, "iron", String(res.iron));
  setText(nodes.resFood, "food", String(res.food));
  setDelta(nodes.deltaGold, "dgold", res.gold - roundBaseline.gold);
  setDelta(nodes.deltaWood, "dwood", res.wood - roundBaseline.wood);
  setDelta(nodes.deltaIron, "diron", res.iron - roundBaseline.iron);
  setDelta(nodes.deltaFood, "dfood", res.food - roundBaseline.food);

  // Round / tier / seed.
  setText(nodes.round, "round", String(r.round));
  setText(nodes.tier, "tier", String(r.tier));
  setText(nodes.seed, "seed", String(r.seed));

  // XP/tier progress bar: progress toward the next tier's round milestone.
  const next = r.tier < 3 ? TIER_ROUND[r.tier + 1] : null;
  const cur = TIER_ROUND[r.tier] || 0;
  let pct = 100;
  if (next != null) {
    const span = next - cur || 1;
    pct = Math.max(0, Math.min(100, Math.round(((r.round - cur) / span) * 100)));
  }
  setWidth(nodes.xpFill, "xp", pct);

  // Phase + build timer.
  const inBuild = r.phase === PHASE.BUILD;
  setText(nodes.phase, "phase", inBuild ? "BUILD" : "ATTACK");
  setText(nodes.timer, "timer", inBuild ? String(Math.max(0, Math.ceil(r.timer))) : "--");
  if (nodes.phaseCell && last.phaseAttack !== !inBuild) {
    last.phaseAttack = !inBuild;
    nodes.phaseCell.classList.toggle("attack", !inBuild);
  }
  // DEFEND is only meaningful during BUILD.
  if (nodes.defend && last.defendDisabled !== !inBuild) {
    last.defendDisabled = !inBuild;
    nodes.defend.disabled = !inBuild;
  }

  // Castle HP banner.
  refreshCastle();
}

function refreshCastle() {
  const banner = nodes.castleBanner;
  if (!banner) return;
  const castle = state.placed.find((b) => b.defId === "castle");
  if (!castle) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  const hp = Math.max(0, castle.hp ?? 0);
  const maxHp = castle.maxHp ?? (hp || 1);
  const pct = maxHp > 0 ? Math.round((hp / maxHp) * 100) : 0;
  setWidth(nodes.castleFill, "castleHp", pct);
  setText(nodes.castleText, "castleText", `${hp} / ${maxHp}`);
  const low = pct <= 30;
  if (last.castleLow !== low) {
    last.castleLow = low;
    banner.classList.toggle("low", low);
  }
}

// Reset the per-round resource baseline at the start of each build phase.
function resetBaseline() {
  roundBaseline = { ...state.resources };
}

// --- Init -------------------------------------------------------------------

export function initHud() {
  cacheNodes();
  wireControls();

  on("unit-selected", ({ ids }) => refreshSelection(ids));
  // New build phase / new round → reset the per-round resource delta baseline.
  on("phase-changed", ({ phase }) => {
    if (phase === PHASE.BUILD) resetBaseline();
  });
  on("scene-changed", ({ scene }) => {
    if (scene === "run") {
      resetBaseline();
      refreshSelection(state.selection);
    }
  });

  onRender(refresh);
}
