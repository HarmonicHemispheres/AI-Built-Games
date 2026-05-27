// Procedural map generation: toxic zone + spawn + exits + winding paths.
//
// Tile kinds: 'open' (placeable for LAND), 'path' (zombies walk, not placeable),
// 'wall' (impassable for LAND, blocks placement), 'toxic' (visual, placement
// penalty for LAND — v1 just treats it as not-placeable so player keeps land
// drones outside).

import { createRng, hashSeed, rangeInt } from "../util/rng.js";
import { MAP_W, MAP_H } from "../state.js";

export function generateMap(seedString, act = 1) {
  const seed = hashSeed(seedString);
  const rng = createRng(seed);
  const w = MAP_W, h = MAP_H;
  const tiles = new Array(w * h).fill("open");
  const idx = (x, y) => y * w + x;

  // Toxic zone: roughly circular blob near center, radius scales with act.
  const cx = Math.floor(w / 2), cy = Math.floor(h / 2);
  const tox = act === 1 ? 2.5 : act === 2 ? 3.6 : 4.6;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const wob = (rng() - 0.5) * 1.2;
      if (d + wob < tox) tiles[idx(x, y)] = "toxic";
    }
  }

  // Spawn points (1 for act 1).
  const spawnCount = act === 1 ? 1 : act === 2 ? 2 : 3;
  const spawnPoints = [];
  for (let i = 0; i < spawnCount; i++) {
    const angle = (i / spawnCount) * Math.PI * 2 + rng() * 0.6;
    const r = tox * 0.4;
    const sx = Math.round(cx + Math.cos(angle) * r);
    const sy = Math.round(cy + Math.sin(angle) * r);
    spawnPoints.push({ x: sx, y: sy });
  }

  // Exit count scales: act 1 → 2, act 2 → 3, act 3 → 4.
  const exitCount = act === 1 ? 2 : act === 2 ? 3 : 4;
  const exits = [];
  const usedEdges = new Set();
  let attempts = 0;
  while (exits.length < exitCount && attempts < 40) {
    attempts++;
    const edge = rangeInt(rng, 0, 3); // 0=top 1=right 2=bottom 3=left
    let ex, ey;
    if (edge === 0) { ex = rangeInt(rng, 2, w - 3); ey = 0; }
    else if (edge === 1) { ex = w - 1; ey = rangeInt(rng, 2, h - 3); }
    else if (edge === 2) { ex = rangeInt(rng, 2, w - 3); ey = h - 1; }
    else { ex = 0; ey = rangeInt(rng, 2, h - 3); }
    const key = `${ex},${ey}`;
    if (usedEdges.has(key)) continue;
    // Reject if too close to an existing exit.
    let tooClose = false;
    for (const e of exits) if (Math.hypot(e.x - ex, e.y - ey) < 6) { tooClose = true; break; }
    if (tooClose) continue;
    usedEdges.add(key);
    exits.push({ x: ex, y: ey });
  }

  // Carve a winding path from each spawn to each exit.
  const paths = [];
  for (const sp of spawnPoints) {
    for (const ex of exits) {
      const path = carvePath(rng, tiles, sp.x, sp.y, ex.x, ex.y, w, h);
      for (const p of path) {
        const i = idx(p.x, p.y);
        if (tiles[i] === "open" || tiles[i] === "toxic") tiles[i] = "path";
      }
      paths.push({ start: sp, end: ex, points: path });
    }
  }

  // Scatter procedural wall clusters across open tiles. Walls block placement
  // and serve as terrain cover. Never overwrite path / spawn / exit tiles, and
  // never sit directly adjacent to a path (so paths stay readable).
  const wallClusterCount = 8 + Math.floor(rng() * 6) + act * 2;
  for (let c = 0; c < wallClusterCount; c++) {
    const cxw = rangeInt(rng, 2, w - 3);
    const cyw = rangeInt(rng, 2, h - 3);
    const clusterSize = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < clusterSize; k++) {
      const wx = cxw + (Math.floor(rng() * 3) - 1);
      const wy = cyw + (Math.floor(rng() * 3) - 1);
      if (wx < 1 || wy < 1 || wx >= w - 1 || wy >= h - 1) continue;
      const t = tiles[idx(wx, wy)];
      if (t !== "open") continue;
      // Keep walls 1 tile away from any path so paths read clearly.
      let adjacentPath = false;
      for (let dy = -1; dy <= 1 && !adjacentPath; dy++) {
        for (let dx = -1; dx <= 1 && !adjacentPath; dx++) {
          if (tiles[idx(wx + dx, wy + dy)] === "path") adjacentPath = true;
        }
      }
      if (adjacentPath) continue;
      tiles[idx(wx, wy)] = "wall";
    }
  }

  return { width: w, height: h, tiles, toxicZone: { cx, cy, r: tox }, spawnPoints, exits, paths, seed: seedString };
}

function carvePath(rng, tiles, sx, sy, ex, ey, w, h) {
  // Random walk biased toward the exit, with smoothing.
  const points = [];
  let x = sx, y = sy;
  let safety = 0;
  while ((x !== ex || y !== ey) && safety++ < w * h * 4) {
    points.push({ x, y });
    const dx = Math.sign(ex - x), dy = Math.sign(ey - y);
    // Pick a direction: biased toward exit but with random meander.
    const r = rng();
    let mx = 0, my = 0;
    if (r < 0.55) {
      // Step toward exit on the axis with greater distance.
      if (Math.abs(ex - x) > Math.abs(ey - y)) mx = dx; else my = dy;
    } else if (r < 0.78) {
      // Step toward exit on the other axis.
      if (Math.abs(ex - x) > Math.abs(ey - y)) my = dy || (rng() < 0.5 ? -1 : 1); else mx = dx || (rng() < 0.5 ? -1 : 1);
    } else {
      // Random perpendicular meander.
      if (rng() < 0.5) mx = rng() < 0.5 ? -1 : 1;
      else my = rng() < 0.5 ? -1 : 1;
    }
    const nx = Math.max(0, Math.min(w - 1, x + mx));
    const ny = Math.max(0, Math.min(h - 1, y + my));
    if (nx === x && ny === y) {
      x = Math.max(0, Math.min(w - 1, x + dx || 1));
      y = Math.max(0, Math.min(h - 1, y + dy || 0));
    } else {
      x = nx; y = ny;
    }
  }
  points.push({ x: ex, y: ey });
  return smoothPath(points);
}

function smoothPath(points) {
  // De-dup adjacent duplicates and remove obvious back-tracks.
  const out = [];
  const seen = new Set();
  for (const p of points) {
    const k = `${p.x},${p.y}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return "wall";
  return map.tiles[y * map.width + x];
}

export function isPlaceable(map, x, y, tags) {
  const t = tileAt(map, x, y);
  if (tags.includes("FLYING")) return t !== "wall"; // flying can sit over path/toxic too
  if (tags.includes("TRAP")) return t === "open" || t === "path"; // traps go on paths
  return t === "open";
}
