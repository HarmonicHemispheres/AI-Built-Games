// Vector shape renderers per unit/zombie type. World coords; caller handles
// camera transform.

const TS = 36; // tile size in pixels at zoom 1

export function drawUnit(ctx, u, palette) {
  const t = u.type;
  ctx.save();
  ctx.translate(u.x * TS, u.y * TS);

  // Hit flash overlay (rendered via composite at end if needed).
  const flash = u.hitFlash > 0;
  const low = u.hp / u.maxHp < 0.3;

  if (t === "sentry") drawSentry(ctx, u, flash);
  else if (t === "bulwark") drawBulwark(ctx, u, flash);
  else if (t === "scrapper") drawScrapper(ctx, u, flash);
  else if (t === "lancer") drawLancer(ctx, u, flash);
  else if (t === "bolter") drawBolter(ctx, u, flash);
  else if (t === "hornet") drawHornet(ctx, u, flash);
  else if (t === "wall") drawWall(ctx, u, flash);
  else if (t === "spike_trap") drawSpikeTrap(ctx, u, flash);
  else drawGeneric(ctx, u, flash);

  // Low HP red pulse ring.
  if (low) {
    ctx.strokeStyle = "rgba(226,107,92,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSentry(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#9dd0e0";
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  // Barrel
  ctx.save(); ctx.rotate(u.facing || 0);
  ctx.fillStyle = "#0c1115";
  ctx.fillRect(6, -2, 12, 4);
  ctx.fillStyle = flash ? "#ffffff" : "#7ad6b3";
  ctx.fillRect(15, -3, 4, 6);
  ctx.restore();
}

function drawBulwark(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#7e9aa8";
  roundRect(ctx, -13, -13, 26, 26, 4); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#0c1115";
  roundRect(ctx, -8, -8, 16, 16, 2); ctx.fill();
  if (u.meleeSwing > 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawScrapper(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#b9d9c5";
  ctx.beginPath();
  ctx.moveTo(-8, -10); ctx.lineTo(11, 0); ctx.lineTo(-8, 10); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  if (u.meleeSwing > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath(); ctx.arc(8, 0, 6, 0, Math.PI * 2); ctx.fill();
  }
}

function drawLancer(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#dceaff";
  roundRect(ctx, -10, -8, 20, 16, 3); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  ctx.save(); ctx.rotate(u.facing || 0);
  ctx.fillStyle = "#0c1115"; ctx.fillRect(0, -1.5, 22, 3);
  ctx.fillStyle = flash ? "#ffffff" : "#dceaff"; ctx.fillRect(18, -2.5, 5, 5);
  ctx.restore();
}

function drawBolter(ctx, u, flash) {
  // Shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 8, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#c3a9e6";
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 6); ctx.lineTo(-8, 6); ctx.closePath();
  ctx.fill(); ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#0c1115"; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
}

function drawHornet(ctx, u, flash) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, 8, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = flash ? "#ffffff" : "#f0a04b";
  ctx.beginPath(); ctx.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = "#0c1115";
  ctx.fillRect(-10, -1, 4, 2); ctx.fillRect(6, -1, 4, 2);
}

function drawWall(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#b4a484";
  roundRect(ctx, -14, -14, 28, 28, 3); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.beginPath();
  ctx.moveTo(-14, 0); ctx.lineTo(14, 0);
  ctx.moveTo(0, -14); ctx.lineTo(0, 14);
  ctx.stroke();
}

function drawSpikeTrap(ctx, u, flash) {
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#e26b5c";
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
    ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
    ctx.stroke();
  }
}

function drawGeneric(ctx, u, flash) {
  ctx.fillStyle = flash ? "#ffffff" : "#9dd0e0";
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
}

export function drawZombie(ctx, z) {
  ctx.save();
  ctx.translate(z.x * TS, z.y * TS);
  const flash = z.hitFlash > 0;
  const size = (z.size || 0.5) * TS;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(0, size * 0.45, size * 0.6, size * 0.18, 0, 0, Math.PI * 2); ctx.fill();

  let color = "#7ea05a";
  if (z.type === "runner") color = "#b5c473";
  if (z.type === "brute") color = "#6c8649";
  if (z.type === "bloated_shambler") color = "#d05a4a";
  ctx.fillStyle = flash ? "#ffffff" : color;
  ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "#0c1115"; ctx.lineWidth = 1.5; ctx.stroke();
  // Eyes
  ctx.fillStyle = "#0c1115";
  ctx.beginPath(); ctx.arc(-size * 0.3, -size * 0.1, size * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(size * 0.3, -size * 0.1, size * 0.13, 0, Math.PI * 2); ctx.fill();

  // HP bar (above zombie) if damaged.
  if (z.hp < z.maxHp) {
    const bw = size * 1.6, bh = 3;
    const frac = Math.max(0, z.hp / z.maxHp);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(-bw / 2, -size - 8, bw, bh);
    ctx.fillStyle = frac > 0.5 ? "#6ddc9c" : frac > 0.25 ? "#e8c460" : "#e26b5c";
    ctx.fillRect(-bw / 2, -size - 8, bw * frac, bh);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export const TILE_PX = TS;
