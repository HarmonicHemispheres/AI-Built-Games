// loop.js — frame-callback registries. Separated from main.js so subsystem
// modules can register render/update callbacks without importing main (avoids
// circular imports). Integrator-owned; the surface is stable.
//
// Logic systems plug into run.registerSystems(); these registries are for things
// that run every frame regardless of phase — render sync, fx, camera smoothing.

export const updaters = []; // [(dt) => void]  — gameplay-agnostic per-frame logic
export const renderers = []; // [(dt) => void]  — sync meshes to state / draw fx

export function onUpdate(fn) {
  updaters.push(fn);
  return fn;
}
export function onRender(fn) {
  renderers.push(fn);
  return fn;
}

export function runUpdaters(dt) {
  for (const fn of updaters) fn(dt);
}
export function runRenderers(dt) {
  for (const fn of renderers) fn(dt);
}
