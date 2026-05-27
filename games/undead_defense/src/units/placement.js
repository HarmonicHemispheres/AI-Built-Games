import { state } from "../state.js";
import { UNITS } from "./catalog.js";
import { isPlaceable } from "../map/generate.js";
import { spawnUnit } from "./behavior.js";

// Pixel coords (from input) → tile coords (in map space).
export function pixelToTile(px, py) {
  const { camera, canvasSize, map } = state;
  if (!map) return null;
  const ts = tileSize();
  const wx = (px - canvasSize.w / 2) / ts / camera.zoom + camera.x;
  const wy = (py - canvasSize.h / 2) / ts / camera.zoom + camera.y;
  return { tx: wx, ty: wy, ix: Math.floor(wx), iy: Math.floor(hyfix(wy)) };
}
function hyfix(v) { return v; }

export function tileSize() {
  return 36;
}

export function isValidPlacement(cardId, ix, iy) {
  const map = state.map;
  if (!map) return false;
  if (ix < 0 || iy < 0 || ix >= map.width || iy >= map.height) return false;
  const unit = UNITS[cardId];
  if (!unit) return false;
  if (!isPlaceable(map, ix, iy, unit.tags)) return false;
  // Don't stack units on the same tile (except flying may overlap path/toxic).
  for (const u of state.units) {
    if (u.dead) continue;
    if (Math.floor(u.x) === ix && Math.floor(u.y) === iy && !u.isFlying && !unit.tags.includes("FLYING")) {
      return false;
    }
  }
  return true;
}

export function placeUnit(cardId, ix, iy) {
  if (!isValidPlacement(cardId, ix, iy)) return null;
  const u = spawnUnit(cardId, ix + 0.5, iy + 0.5);
  state.run.handUsed.add(cardId);
  return u;
}
