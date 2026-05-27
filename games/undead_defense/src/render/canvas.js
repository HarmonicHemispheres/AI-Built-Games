import { state, SCENE } from "../state.js";
import { drawUnit, drawZombie, TILE_PX } from "./sprites.js";
import { UNITS } from "../units/catalog.js";

let ctx = null;
let canvas = null;

export function initCanvas(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
}

function resize() {
  // Logical size stays 1280x720 (set in HTML); CSS scales to viewport.
  state.canvasSize = { w: canvas.width, h: canvas.height };
}

function readVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

export function renderFrame() {
  if (!ctx) return;
  if (state.scene !== SCENE.PREP && state.scene !== SCENE.COMBAT) {
    // Still clear to background for menu scenes.
    ctx.fillStyle = readVar("--bg-0", "#0a0e10");
    ctx.fillRect(0, 0, state.canvasSize.w, state.canvasSize.h);
    return;
  }
  if (!state.map) return;

  const { canvasSize, camera } = state;
  // Background fill.
  ctx.fillStyle = readVar("--bg-0", "#0a0e10");
  ctx.fillRect(0, 0, canvasSize.w, canvasSize.h);

  // Apply camera (+ shake).
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake * 20 : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake * 20 : 0;
  ctx.save();
  ctx.translate(canvasSize.w / 2 + shakeX, canvasSize.h / 2 + shakeY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x * TILE_PX, -camera.y * TILE_PX);

  drawTiles();
  drawPathTrails();
  drawSpawnsAndExits();
  drawPlacementGhost();
  drawUnits();
  drawZombies();
  drawProjectiles();
  drawParticles();
  drawFloatingText();
  drawSelectionRings();
  drawBoxSelect();

  ctx.restore();

  drawHUDOverlays();

  if (state.shake > 0) state.shake = Math.max(0, state.shake - 0.04);
}

function drawTiles() {
  const m = state.map;
  const c1 = readVar("--tile-open", "#1a2429");
  const c2 = readVar("--tile-open-2", "#1f2a30");
  const cp1 = readVar("--tile-path", "#3a322a");
  const cp2 = readVar("--tile-path-2", "#443a30");
  const cw = readVar("--tile-wall", "#2a3138");
  const ct1 = readVar("--tile-toxic", "#2b3a26");
  const ct2 = readVar("--tile-toxic-2", "#344726");
  const grid = readVar("--tile-grid", "#0c1115");
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const t = m.tiles[y * m.width + x];
      const checker = (x + y) % 2 === 0;
      let fill = checker ? c1 : c2;
      if (t === "path") fill = checker ? cp1 : cp2;
      else if (t === "wall") fill = cw;
      else if (t === "toxic") fill = checker ? ct1 : ct2;
      ctx.fillStyle = fill;
      ctx.fillRect(x * TILE_PX, y * TILE_PX, TILE_PX, TILE_PX);
      // Chunky 3D look for wall tiles.
      if (t === "wall") {
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fillRect(x * TILE_PX + 2, y * TILE_PX + 2, TILE_PX - 4, 4);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x * TILE_PX + 2, y * TILE_PX + TILE_PX - 6, TILE_PX - 4, 4);
        ctx.strokeStyle = "rgba(0,0,0,0.55)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x * TILE_PX + 1.5, y * TILE_PX + 1.5, TILE_PX - 3, TILE_PX - 3);
      }
    }
  }
  // Grid lines (subtle).
  ctx.strokeStyle = grid;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  for (let x = 0; x <= m.width; x++) {
    ctx.moveTo(x * TILE_PX, 0);
    ctx.lineTo(x * TILE_PX, m.height * TILE_PX);
  }
  for (let y = 0; y <= m.height; y++) {
    ctx.moveTo(0, y * TILE_PX);
    ctx.lineTo(m.width * TILE_PX, y * TILE_PX);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawPathTrails() {
  // Subtle highlight along paths to make routing readable.
  ctx.strokeStyle = "rgba(232,196,96,0.18)";
  ctx.lineWidth = 8;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const p of state.map.paths) {
    ctx.beginPath();
    for (let i = 0; i < p.points.length; i++) {
      const pt = p.points[i];
      const x = (pt.x + 0.5) * TILE_PX;
      const y = (pt.y + 0.5) * TILE_PX;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawSpawnsAndExits() {
  const m = state.map;
  for (const sp of m.spawnPoints) {
    const cx = (sp.x + 0.5) * TILE_PX, cy = (sp.y + 0.5) * TILE_PX;
    const pulse = 0.5 + 0.5 * Math.sin(state.now * 3);
    ctx.fillStyle = `rgba(226,107,92,${0.35 + 0.35 * pulse})`;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#e26b5c"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
  }
  for (const ex of m.exits) {
    const cx = (ex.x + 0.5) * TILE_PX, cy = (ex.y + 0.5) * TILE_PX;
    ctx.strokeStyle = "#7ad6b3"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "rgba(122,214,179,0.18)";
    ctx.fill();
  }
}

function drawPlacementGhost() {
  if (!state.dragGhost || !state.dragPlacementCard) return;
  const g = state.dragGhost;
  ctx.fillStyle = g.valid ? "rgba(122,214,179,0.25)" : "rgba(226,107,92,0.25)";
  ctx.fillRect(g.x * TILE_PX, g.y * TILE_PX, TILE_PX, TILE_PX);
  ctx.strokeStyle = g.valid ? "#7ad6b3" : "#e26b5c";
  ctx.lineWidth = 2;
  ctx.strokeRect(g.x * TILE_PX, g.y * TILE_PX, TILE_PX, TILE_PX);

  // Show range circle for the card type if it has a range.
  if (UNITS[state.dragPlacementCard]?.range > 0) {
    const cx = (g.x + 0.5) * TILE_PX, cy = (g.y + 0.5) * TILE_PX;
    ctx.strokeStyle = "rgba(122,214,179,0.5)";
    ctx.beginPath(); ctx.arc(cx, cy, UNITS[state.dragPlacementCard].range * TILE_PX, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawUnits() {
  // Ground first, then flying so flying renders above.
  const sorted = [...state.units].sort((a, b) => Number(!!a.isFlying) - Number(!!b.isFlying));
  for (const u of sorted) drawUnit(ctx, u);
}

function drawZombies() {
  for (const z of state.zombies) drawZombie(ctx, z);
}

function drawProjectiles() {
  for (const p of state.projectiles) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.kind === "beam" ? 3 : 2;
    ctx.shadowBlur = p.kind === "beam" ? 8 : 4;
    ctx.shadowColor = p.color;
    ctx.beginPath();
    ctx.moveTo(p.x * TILE_PX, p.y * TILE_PX);
    // Trailing tail in the direction of travel.
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = p.x - (dx / len) * 0.4;
    const ty = p.y - (dy / len) * 0.4;
    ctx.lineTo(tx * TILE_PX, ty * TILE_PX);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * TILE_PX, p.y * TILE_PX, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloatingText() {
  ctx.font = "bold 12px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const f of state.floatingText) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = f.color;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    const x = f.x * TILE_PX, y = f.y * TILE_PX;
    ctx.strokeText(f.text, x, y);
    ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function drawSelectionRings() {
  for (const id of state.selection) {
    const u = state.units.find(x => x.id === id);
    if (!u || u.dead) continue;
    ctx.strokeStyle = "#7ad6b3";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(u.x * TILE_PX, u.y * TILE_PX, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Range ring
    if (u.range > 0) {
      ctx.strokeStyle = "rgba(122,214,179,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(u.x * TILE_PX, u.y * TILE_PX, u.range * TILE_PX, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawBoxSelect() {
  const b = state.boxSelect;
  if (!b) return;
  const x1 = Math.min(b.x, b.startX) * TILE_PX;
  const y1 = Math.min(b.y, b.startY) * TILE_PX;
  const w = Math.abs(b.x - b.startX) * TILE_PX;
  const h = Math.abs(b.y - b.startY) * TILE_PX;
  ctx.fillStyle = "rgba(122,214,179,0.12)";
  ctx.fillRect(x1, y1, w, h);
  ctx.strokeStyle = "#7ad6b3";
  ctx.lineWidth = 1;
  ctx.strokeRect(x1, y1, w, h);
}

function drawHUDOverlays() {
  // Low containment vignette
  if (state.run && state.run.containment <= 25) {
    const pulse = 0.5 + 0.5 * Math.sin(state.now * 4);
    const grad = ctx.createRadialGradient(
      state.canvasSize.w / 2, state.canvasSize.h / 2, 200,
      state.canvasSize.w / 2, state.canvasSize.h / 2, 600
    );
    grad.addColorStop(0, "rgba(226,107,92,0)");
    grad.addColorStop(1, `rgba(226,107,92,${0.25 + 0.2 * pulse})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, state.canvasSize.w, state.canvasSize.h);
  }
}
