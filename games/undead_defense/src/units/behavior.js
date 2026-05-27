import { state, freshId } from "../state.js";
import { UNITS } from "./catalog.js";
import { effectiveStats } from "../upgrades/apply.js";
import { dist, moveToward } from "../util/math.js";
import { fireProjectile } from "../combat/projectiles.js";
import { damageZombie, damageUnit } from "../combat/damage.js";
import { playSfx } from "../audio/sfx.js";

// Three stance modes per unit, surfaced as a sidebar mode-selector.
//   SEEK   - actively hunt the nearest zombie if not already engaged.
//   DEFEND - stay put until the user issues a move; engage targets in range.
//   SENTRY - once a target is acquired, follow it across the map until dead.
export const STANCE = { SEEK: "seek", DEFEND: "defend", SENTRY: "sentry" };

export function spawnUnit(typeId, x, y) {
  const base = UNITS[typeId];
  const stats = effectiveStats(typeId, state.run);
  const unit = {
    id: freshId(),
    type: typeId,
    tags: base.tags,
    x, y,
    hp: stats.hp, maxHp: stats.hp,
    dmg: stats.dmg, range: stats.range,
    fireRate: stats.fireRate, moveSpeed: stats.moveSpeed,
    projectile: base.projectile,
    cooldown: 0,
    stance: STANCE.DEFEND,
    anchor: { x, y },
    command: null,           // {type:'move'|'attack'|'attack-move', tx?,ty?, target?}
    target: null,
    sentryLock: null,        // locked target id when in SENTRY mode
    facing: 0,
    hitFlash: 0,
    immobile: !!base.immobile,
    oneShot: !!base.oneShot,
    isStructure: base.tags.includes("STRUCTURE"),
    isTrap: base.tags.includes("TRAP"),
    isFlying: base.tags.includes("FLYING"),
    isMelee: base.tags.includes("MELEE"),
    meleeSwing: 0,
    triggered: false,
  };
  state.units.push(unit);
  return unit;
}

export function updateUnits(dt) {
  for (const u of state.units) {
    if (u.dead) continue;
    u.hitFlash = Math.max(0, u.hitFlash - dt);
    if (u.meleeSwing > 0) u.meleeSwing -= dt;

    if (u.isTrap) {
      if (u.triggered) { u.dead = true; continue; }
      for (const z of state.zombies) {
        if (z.dead) continue;
        if (dist(u.x, u.y, z.x, z.y) <= u.range) {
          damageZombie(z, u.dmg);
          u.triggered = true;
          u.dead = true;
          playSfx("trap");
          break;
        }
      }
      continue;
    }

    if (u.isStructure) continue;

    // Validate existing target. SENTRY units never drop their lock unless the
    // target dies.
    if (u.target?.dead) { u.target = null; u.sentryLock = null; }
    if (u.target && u.stance !== STANCE.SENTRY && dist(u.x, u.y, u.target.x, u.target.y) > u.range * 1.8) {
      u.target = null;
    }

    // Player commands take priority over stance autopilot.
    let commandHandled = false;
    if (!u.immobile && u.command) {
      commandHandled = true;
      if (u.command.type === "move") {
        const r = moveToward(u.x, u.y, u.command.tx, u.command.ty, u.moveSpeed * dt);
        u.x = r.x; u.y = r.y;
        if (r.arrived) { u.command = null; u.anchor = { x: u.x, y: u.y }; }
      } else if (u.command.type === "attack" && u.command.target && !u.command.target.dead) {
        const t = u.command.target;
        u.target = t;
        u.sentryLock = u.stance === STANCE.SENTRY ? t : u.sentryLock;
        if (dist(u.x, u.y, t.x, t.y) > u.range * 0.9) {
          const r = moveToward(u.x, u.y, t.x, t.y, u.moveSpeed * dt);
          u.x = r.x; u.y = r.y;
        }
      } else if (u.command.type === "attack-move") {
        const nearest = nearestZombieInRange(u, u.range * 1.8);
        if (nearest) {
          u.target = nearest;
          if (dist(u.x, u.y, nearest.x, nearest.y) > u.range * 0.9) {
            const r = moveToward(u.x, u.y, nearest.x, nearest.y, u.moveSpeed * dt);
            u.x = r.x; u.y = r.y;
          }
        } else {
          const r = moveToward(u.x, u.y, u.command.tx, u.command.ty, u.moveSpeed * dt);
          u.x = r.x; u.y = r.y;
          if (r.arrived) { u.command = null; u.anchor = { x: u.x, y: u.y }; }
        }
      } else if (u.command.target?.dead) {
        u.command = null;
      }
    }

    // Stance autopilot (only when no explicit player command is active).
    if (!commandHandled) {
      if (u.stance === STANCE.SEEK) {
        // Always have a target; if none in big radius, walk toward the nearest
        // zombie on the map.
        if (!u.target) u.target = nearestZombieInRange(u, 999);
        if (u.target && !u.immobile) {
          if (dist(u.x, u.y, u.target.x, u.target.y) > u.range * 0.9) {
            const r = moveToward(u.x, u.y, u.target.x, u.target.y, u.moveSpeed * dt);
            u.x = r.x; u.y = r.y;
          }
        }
      } else if (u.stance === STANCE.DEFEND) {
        // Only acquire targets already in range; never wander off.
        if (!u.target) u.target = nearestZombieInRange(u, u.range);
      } else if (u.stance === STANCE.SENTRY) {
        // Lock onto first target in range; chase it forever until dead.
        if (!u.sentryLock || u.sentryLock.dead) {
          u.sentryLock = nearestZombieInRange(u, u.range * 1.5);
        }
        if (u.sentryLock && !u.sentryLock.dead) {
          u.target = u.sentryLock;
          if (!u.immobile && dist(u.x, u.y, u.target.x, u.target.y) > u.range * 0.9) {
            const r = moveToward(u.x, u.y, u.target.x, u.target.y, u.moveSpeed * dt);
            u.x = r.x; u.y = r.y;
          }
        }
      }
    }

    // Attack.
    u.cooldown = Math.max(0, u.cooldown - dt);
    if (u.target && !u.target.dead) {
      const d = dist(u.x, u.y, u.target.x, u.target.y);
      u.facing = Math.atan2(u.target.y - u.y, u.target.x - u.x);
      if (d <= u.range && u.cooldown <= 0) {
        if (u.isMelee) {
          damageZombie(u.target, u.dmg);
          u.meleeSwing = 0.18;
          playSfx("melee");
        } else if (u.projectile) {
          fireProjectile(u, u.target, u.dmg, u.projectile);
          playSfx("shoot");
        }
        u.cooldown = 1 / Math.max(0.05, u.fireRate);
      }
      // Melee + out of range chase, only if no other command/autopilot is moving us.
      if (u.isMelee && d > u.range && !u.immobile && !u.command && u.stance === STANCE.DEFEND) {
        // Defend stance shouldn't chase — leave it alone.
      }
    }
    // No anchor drift-back: DEFEND simply stays put after engaging.
  }
  state.units = state.units.filter(u => !u.dead);
}

function nearestZombieInRange(u, range) {
  let best = null, bestD = range * range;
  for (const z of state.zombies) {
    if (z.dead) continue;
    const dx = z.x - u.x, dy = z.y - u.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < bestD) { best = z; bestD = d2; }
  }
  return best;
}

export function setStance(u, stance) {
  u.stance = stance;
  u.sentryLock = null; // reset any previous sentry lock on switch
}
