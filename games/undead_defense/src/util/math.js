export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.hypot(dx, dy);
}
export function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function angle(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

export function moveToward(x, y, tx, ty, step) {
  const d = dist(x, y, tx, ty);
  if (d <= step || d === 0) return { x: tx, y: ty, arrived: true };
  const k = step / d;
  return { x: x + (tx - x) * k, y: y + (ty - y) * k, arrived: false };
}

export function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
