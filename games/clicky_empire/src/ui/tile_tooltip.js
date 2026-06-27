// ============================================================================
// ui/tile_tooltip.js — show a tile's name when the player idles the pointer over
// it. W3-UI. It only READS state and uses scene.pickGround to resolve the tile
// under the cursor; it never mutates game state.
//
// Behaviour: while the pointer moves the tooltip is hidden; after a short idle
// (the pointer holds still) over the board during the RUN scene, a small label
// appears next to the cursor naming the tile (and a hint at what it does).
// ============================================================================

import { state, SCENE, on } from "../state.js";
import { pickGround } from "../render/scene.js";
import { getTileName } from "../world/tiles.js";
import { expansionCost } from "../world/expand.js";
import { N4, worldToTile } from "../util/math.js";
import { getBuildingDef } from "../buildings/catalog.js";
import { getUnitDef } from "../units/catalog.js";

const IDLE_MS = 350;
const RES_LABEL = { gold: "gold", wood: "wood", iron: "iron", food: "food" };

let tip = null;
let canvas = null;
let idleTimer = 0;
let lastEvent = null;

function ensureTip() {
  if (tip) return tip;
  tip = document.createElement("div");
  tip.className = "tile-tooltip hidden";
  document.body.appendChild(tip);
  return tip;
}

function hide() {
  if (tip) tip.classList.add("hidden");
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = 0;
  }
}

// Buildings standing on tile (col,row), as a list of display names.
function buildingsOn(col, row) {
  const out = [];
  for (const b of state.placed) {
    if (b.col !== col || b.row !== row) continue;
    out.push(getBuildingDef(b.defId)?.name || b.defId);
  }
  return out;
}

// Living units standing on tile (col,row), summarized as "2 Militia, 1 Spearman".
function unitsOn(col, row) {
  const counts = new Map();
  for (const u of state.units) {
    if (!u || !u.pos || (u.hp != null && u.hp <= 0)) continue;
    const t = worldToTile(u.pos.x, u.pos.z);
    if (t.col !== col || t.row !== row) continue;
    const name = getUnitDef(u.unitId)?.name || u.unitId;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, n]) => (n > 1 ? `${n} ${name}` : name));
}

// Compose the tooltip text for a revealed tile instance. Line 1 is the tile's
// name + a movement/harvest hint; extra lines list any buildings and units that
// currently occupy the tile.
function labelForTile(t) {
  const name = getTileName(t.type);
  const parts = [];
  if (!t.walkable) parts.push("blocks movement");
  if (Array.isArray(t.clickYield)) {
    const res = [...new Set(t.clickYield.map((o) => RES_LABEL[o.resource] || o.resource))];
    parts.push(`click: ${res.join(" / ")}`);
  } else if (t.clickYield?.resource) {
    parts.push(`click: ${RES_LABEL[t.clickYield.resource] || t.clickYield.resource}`);
  }

  const lines = [parts.length ? `${name} · ${parts.join(" · ")}` : name];
  const builds = buildingsOn(t.col, t.row);
  if (builds.length) lines.push(`🏠 ${builds.join(", ")}`);
  const units = unitsOn(t.col, t.row);
  if (units.length) lines.push(`⚔️ ${units.join(", ")}`);
  return lines.join("\n");
}

function showFor(event) {
  if (!event || state.scene !== SCENE.RUN) return hide();
  const hit = pickGround(event);
  if (!hit) return hide();

  const { col, row } = hit.tile;
  const key = `${col},${row}`;
  let text;
  if (!state.map?.revealed?.has(key)) {
    // A cloud tile. If it borders the revealed map it can be revealed for gold;
    // show the cost (and whether the player can currently afford it).
    let onFrontier = false;
    for (const { dc, dr } of N4) {
      if (state.map?.revealed?.has(`${col + dc},${row + dr}`)) {
        onFrontier = true;
        break;
      }
    }
    if (onFrontier) {
      const cost = expansionCost(state.map.revealed.size, state.map.baseRevealed);
      const afford = (state.resources.gold || 0) >= cost;
      text = afford ? `Reveal · ${cost} gold` : `Reveal · ${cost} gold (need more)`;
    } else {
      text = "Unexplored";
    }
  } else {
    const t = state.map.tiles.get(key);
    text = t ? labelForTile(t) : "Land";
  }

  const el = ensureTip();
  el.textContent = text;
  el.style.left = `${event.clientX + 14}px`;
  el.style.top = `${event.clientY + 16}px`;
  el.classList.remove("hidden");
}

function onMove(e) {
  lastEvent = e;
  hide(); // moving → hide until the pointer settles again
  if (state.scene !== SCENE.RUN) return;
  idleTimer = setTimeout(() => showFor(lastEvent), IDLE_MS);
}

export function initTileTooltip() {
  canvas = document.getElementById("game-canvas");
  if (!canvas) return;
  ensureTip();
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", hide);
  canvas.addEventListener("pointerdown", hide);
  canvas.addEventListener("wheel", hide, { passive: true });
  on("scene-changed", hide);
}
