// ============================================================================
// ui/building_panel.js — the building info + UPGRADE panel. W3-UI.
//
// Left-clicking one of your buildings (rts/input.js emits `building-clicked`)
// opens this small panel: the building's name, what it produces, and — when the
// def opts into an upgrade chain (hamlet → village → city) — an UPGRADE button
// that grows it in place for resources. The button reads the live upgrade option
// (cost, tier gate, affordability) and stays in sync as resources/tier change.
//
// It only READS state and calls one documented control API:
//   economy.upgradeBuilding(building) — pays + swaps the def in place; the render
//   reconciler rebuilds the mesh. We re-render the panel onto the upgraded form.
// ============================================================================

import { state, SCENE, on, canAfford } from "../state.js";
import { getBuildingDef } from "../buildings/catalog.js";
import { upgradeOption, upgradeBuilding, adjacencyMultFor } from "../buildings/economy.js";
import { getUnitDef } from "../units/catalog.js";
import { playSfx } from "../audio/sfx.js";

const RES_ORDER = ["gold", "wood", "iron", "food"];

let nodes = null;
let currentId = null; // id of the building the panel is showing (or null)

function $(id) {
  return document.getElementById(id);
}

function cacheNodes() {
  nodes = {
    panel: $("building-panel"),
    name: $("bp-name"),
    info: $("bp-info"),
    upgrade: $("bp-upgrade"),
  };
}

function buildingById(id) {
  return state.placed.find((b) => b.id === id) || null;
}

// A short "what it does" line for the panel header. Takes the live `building`
// so an economy producer can show its EFFECTIVE yield (base × terrain bonus),
// e.g. a lumber camp's wood/tick after the forests around it.
function productionLine(building, def) {
  if (def.yields) {
    const res = Object.keys(def.yields)[0];
    const base = def.yields[res];
    const mult = adjacencyMultFor(building);
    const amt = Math.round(base * mult * 100) / 100;
    let line = `${cap(res)} +${amt} / tick`;
    if (mult > 1.0001) line += ` (+${Math.round((mult - 1) * 100)}% terrain)`;
    return line;
  }
  if (def.spawns) {
    const u = getUnitDef(def.spawns.unitId);
    return `Trains ${u?.name || def.spawns.unitId}`;
  }
  if (def.attack) {
    return `DMG ${def.attack.damage} · RNG ${def.attack.range}`;
  }
  if (def.kind === "wall") return "Blocks enemies";
  if (def.kind === "bridge") return "Lets units cross water";
  return "";
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function formatCost(cost) {
  if (!cost) return "free";
  return RES_ORDER.filter((r) => cost[r]).map((r) => `${cost[r]} ${r}`).join(", ");
}

// Paint the panel for `building` (or hide it if gone). Called on open and after
// every state change while open, so the upgrade button reflects live affordability.
function render(building) {
  if (!nodes?.panel) return;
  if (!building || state.scene !== SCENE.RUN) return hide();

  const def = getBuildingDef(building.defId);
  if (!def) return hide();

  nodes.name.textContent = def.name;
  nodes.info.textContent = productionLine(building, def);

  const opt = upgradeOption(building);
  const btn = nodes.upgrade;
  if (!opt) {
    btn.classList.add("hidden");
  } else {
    btn.classList.remove("hidden");
    if (!opt.tierMet) {
      btn.disabled = true;
      btn.textContent = `▲ ${opt.def.name} — reach Tier ${opt.tierReq}`;
    } else {
      const afford = canAfford(opt.cost);
      btn.disabled = !afford;
      btn.textContent = `▲ Upgrade to ${opt.def.name} — ${formatCost(opt.cost)}`;
    }
  }

  nodes.panel.classList.remove("hidden");
}

function hide() {
  currentId = null;
  if (nodes?.panel) nodes.panel.classList.add("hidden");
}

// Re-render the currently-shown building (used by live state-change listeners).
function refresh() {
  if (currentId == null) return;
  const b = buildingById(currentId);
  if (!b) return hide(); // it was destroyed
  render(b);
}

function onUpgradeClick() {
  const b = buildingById(currentId);
  if (!b) return hide();
  if (upgradeBuilding(b)) {
    playSfx("place");
    render(b); // b.defId changed in place — show the upgraded form (+ its next tier)
  }
}

export function initBuildingPanel() {
  cacheNodes();
  if (!nodes.panel) return;

  nodes.upgrade?.addEventListener("click", onUpgradeClick);

  // Open on a building click; close when input signals a non-building click.
  on("building-clicked", ({ id }) => {
    if (id == null) return hide();
    const b = buildingById(id);
    if (!b) return hide();
    currentId = id;
    render(b);
  });

  // Selecting a unit, leaving the run, or this building being upgraded/destroyed
  // all need the panel kept in sync.
  on("unit-selected", ({ ids }) => {
    if (ids && ids.length) hide();
  });
  on("scene-changed", ({ scene }) => {
    if (scene !== SCENE.RUN) hide();
  });
  on("building-upgraded", refresh);
  on("resource-changed", refresh);
  on("tier-unlocked", refresh);
}
