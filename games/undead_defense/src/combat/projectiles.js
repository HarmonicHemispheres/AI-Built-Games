import { state, freshId } from "../state.js";
import { dist, moveToward } from "../util/math.js";
import { damageZombie } from "./damage.js";

export function fireProjectile(from, target, dmg, projDef) {
  state.projectiles.push({
    id: freshId(),
    x: from.x, y: from.y,
    tx: target.x, ty: target.y,
    target,
    dmg,
    speed: projDef?.speed ?? 18,
    kind: projDef?.kind ?? "tracer",
    color: projDef?.color ?? "#7ad6b3",
    life: 2.0,
  });
}

export function updateProjectiles(dt) {
  for (const p of state.projectiles) {
    if (p.dead) continue;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    if (p.target && !p.target.dead) {
      p.tx = p.target.x; p.ty = p.target.y;
    }
    const r = moveToward(p.x, p.y, p.tx, p.ty, p.speed * dt);
    p.x = r.x; p.y = r.y;
    if (r.arrived || (p.target && !p.target.dead && dist(p.x, p.y, p.target.x, p.target.y) < 0.25)) {
      if (p.target && !p.target.dead) damageZombie(p.target, p.dmg);
      p.dead = true;
    }
  }
  state.projectiles = state.projectiles.filter(p => !p.dead);
}
