import { state, freshId } from "../state.js";
import { ZOMBIES } from "./catalog.js";
import { dist, moveToward } from "../util/math.js";
import { damageUnit } from "../combat/damage.js";

export function spawnZombie(typeId, path) {
  const data = ZOMBIES[typeId];
  const start = path.points[0];
  const z = {
    id: freshId(),
    type: typeId,
    traits: data.traits,
    x: start.x + 0.5,
    y: start.y + 0.5,
    hp: data.hp,
    maxHp: data.hp,
    dmg: data.dmg,
    speed: data.speed,
    size: data.size,
    path,
    pathIdx: 0,
    hitFlash: 0,
    meleeCooldown: 0,
  };
  state.zombies.push(z);
  state.wave.alive++;
  return z;
}

export function updateZombies(dt) {
  for (const z of state.zombies) {
    if (z.dead) continue;
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    z.meleeCooldown = Math.max(0, z.meleeCooldown - dt);

    // Engage adjacent units (zombies attack any drone they bump into).
    let engaging = null;
    for (const u of state.units) {
      if (u.dead) continue;
      if (u.isFlying) continue; // ground zombies can't hit flying
      const d = dist(z.x, z.y, u.x, u.y);
      if (d < 0.8) { engaging = u; break; }
    }
    if (engaging) {
      if (z.meleeCooldown <= 0) {
        damageUnit(engaging, z.dmg);
        z.meleeCooldown = 0.7;
      }
      continue; // don't advance while engaging
    }

    // Walk path waypoints.
    const points = z.path.points;
    const next = points[z.pathIdx + 1];
    if (!next) {
      // Reached exit → containment damage.
      z.dead = true;
      state.run.containment = Math.max(0, state.run.containment - 4);
      if (state.meta.settings.screenShake) state.shake = Math.max(state.shake, 0.2);
      continue;
    }
    const target = { x: next.x + 0.5, y: next.y + 0.5 };
    const r = moveToward(z.x, z.y, target.x, target.y, z.speed * dt);
    z.x = r.x; z.y = r.y;
    if (r.arrived) z.pathIdx++;
  }
  // Cleanup
  const before = state.zombies.length;
  state.zombies = state.zombies.filter(z => !z.dead);
  state.wave.alive = state.zombies.length;
  // (kills are counted in damage.js)
  void before;
}
