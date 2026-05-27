import { state, MAP_W, MAP_H } from "../state.js";
import { clamp } from "../util/math.js";

export function centerCamera() {
  state.camera.x = MAP_W / 2;
  state.camera.y = MAP_H / 2;
  state.camera.zoom = 1;
}

export function panCamera(dx, dy) {
  state.camera.x = clamp(state.camera.x + dx, 1, MAP_W - 1);
  state.camera.y = clamp(state.camera.y + dy, 1, MAP_H - 1);
}

export function zoomCamera(delta) {
  state.camera.zoom = clamp(state.camera.zoom * (delta > 0 ? 0.9 : 1.1), 0.6, 2.2);
}

export function worldToScreen(wx, wy) {
  const { camera, canvasSize } = state;
  const ts = 36;
  const sx = canvasSize.w / 2 + (wx - camera.x) * ts * camera.zoom;
  const sy = canvasSize.h / 2 + (wy - camera.y) * ts * camera.zoom;
  return { x: sx, y: sy };
}

export function screenToWorld(sx, sy) {
  const { camera, canvasSize } = state;
  const ts = 36;
  return {
    x: (sx - canvasSize.w / 2) / (ts * camera.zoom) + camera.x,
    y: (sy - canvasSize.h / 2) / (ts * camera.zoom) + camera.y,
  };
}
