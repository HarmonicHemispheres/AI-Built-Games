import { state } from "../state.js";

export function clearSelection() { state.selection.clear(); }

export function selectUnit(u, additive = false) {
  if (!u || u.dead) return;
  if (!additive) state.selection.clear();
  state.selection.add(u.id);
}

export function toggleUnit(u) {
  if (!u) return;
  if (state.selection.has(u.id)) state.selection.delete(u.id);
  else state.selection.add(u.id);
}

export function getSelectedUnits() {
  return state.units.filter(u => state.selection.has(u.id) && !u.dead);
}

export function boxSelect(x1, y1, x2, y2, additive = false) {
  if (!additive) state.selection.clear();
  const lx = Math.min(x1, x2), hx = Math.max(x1, x2);
  const ly = Math.min(y1, y2), hy = Math.max(y1, y2);
  for (const u of state.units) {
    if (u.dead) continue;
    if (u.isStructure || u.isTrap) continue; // RTS-control only "drone" units, not buildings
    if (u.x >= lx && u.x <= hx && u.y >= ly && u.y <= hy) {
      state.selection.add(u.id);
    }
  }
}

export function unitAtWorld(wx, wy, radius = 0.5) {
  for (const u of state.units) {
    if (u.dead) continue;
    const dx = u.x - wx, dy = u.y - wy;
    if (dx*dx + dy*dy <= radius * radius) return u;
  }
  return null;
}
