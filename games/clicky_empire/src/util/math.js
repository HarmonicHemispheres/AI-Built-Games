// Math helpers + the grid<->world coordinate system. Node-safe (no three import;
// works on plain {x,y,z} objects). The single source of truth for how tile
// coordinates map to Three.js world space. Everyone uses these — nobody rolls
// their own conversion (see CONTRACTS.md "Coordinate system").

// World units per tile. The board lies on the XZ plane; Y is up.
export const TILE = 1;

// Tile (col,row) center -> world position {x,y,z}. y defaults to 0 (ground).
export function tileToWorld(col, row, y = 0) {
  return { x: col * TILE, y, z: row * TILE };
}

// World {x,z} -> nearest tile {col,row}.
export function worldToTile(x, z) {
  return { col: Math.round(x / TILE), row: Math.round(z / TILE) };
}

// 4-neighborhood (orthogonal) of a tile.
export const N4 = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
];

// 8-neighborhood (incl diagonals).
export const N8 = [
  ...N4,
  { dc: 1, dr: 1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: 1 },
  { dc: -1, dr: -1 },
];

// Stable string key for a tile coord (map indexing).
export const tileKey = (col, row) => `${col},${row}`;
export function parseTileKey(key) {
  const [col, row] = key.split(",").map(Number);
  return { col, row };
}

// Manhattan + Chebyshev grid distances.
export const manhattan = (a, b) => Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
export const chebyshev = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

// Scalars.
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const inverseLerp = (a, b, v) => (b === a ? 0 : clamp01((v - a) / (b - a)));
export const remap = (v, a, b, c, d) => lerp(c, d, inverseLerp(a, b, v));

// Vec3 (plain objects) helpers.
export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add3 = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a, s) => v3(a.x * s, a.y * s, a.z * s);
export const len3 = (a) => Math.hypot(a.x, a.y, a.z);
export function norm3(a) {
  const l = len3(a) || 1;
  return v3(a.x / l, a.y / l, a.z / l);
}
// Planar (XZ) distance — the one combat/movement usually wants.
export const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Easings.
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

// Move scalar `cur` toward `target` by at most `maxDelta`.
export function approach(cur, target, maxDelta) {
  if (Math.abs(target - cur) <= maxDelta) return target;
  return cur + Math.sign(target - cur) * maxDelta;
}
