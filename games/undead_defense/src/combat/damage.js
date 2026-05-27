import { state } from "../state.js";
import { ZOMBIES } from "../zombies/catalog.js";
import { spawnParticles, spawnFloating } from "../render/particles.js";
import { goldMult } from "../upgrades/apply.js";
import { emit } from "../util/events.js";
import { playSfx } from "../audio/sfx.js";

export function damageZombie(z, amount, source) {
  if (z.dead) return;
  z.hp -= amount;
  z.hitFlash = 0.12;
  spawnFloating(z.x, z.y - 0.4, Math.round(amount).toString(), "#ffffff");
  if (z.hp <= 0) {
    killZombie(z);
  }
}

export function damageUnit(u, amount) {
  if (u.dead) return;
  u.hp -= amount;
  u.hitFlash = 0.15;
  spawnFloating(u.x, u.y - 0.4, Math.round(amount).toString(), "#ff8a72");
  if (u.hp <= 0) {
    u.dead = true;
    spawnParticles(u.x, u.y, "#c0d2db", 14);
    if (state.meta.settings.screenShake) state.shake = Math.max(state.shake, 0.25);
    state.selection.delete(u.id);
    playSfx("unit_die");
    emit("unit-died", u);
  }
}

export function killZombie(z) {
  z.dead = true;
  const data = ZOMBIES[z.type];
  spawnParticles(z.x, z.y, data.color, data.traits.includes("BOSS") ? 40 : 10);
  if (state.meta.settings.screenShake) state.shake = Math.max(state.shake, data.traits.includes("BOSS") ? 0.6 : 0.15);
  const reward = Math.round((data.reward || 1) * goldMult(state.run));
  state.run.gold += reward;
  state.results.kills++;
  state.results.goldEarned += reward;
  state.meta.totalKills++;
  spawnFloating(z.x, z.y - 0.6, `+${reward}`, "#e8c460");
  playSfx(data.traits.includes("BOSS") ? "boss_die" : "zombie_die");

  // On-death effects (e.g. bloated boss explosion).
  if (data.onDeath?.type === "explode") {
    const { radius, dmg } = data.onDeath;
    for (const other of state.zombies) {
      if (other === z || other.dead) continue;
      const dx = other.x - z.x, dy = other.y - z.y;
      if (Math.hypot(dx, dy) <= radius) damageZombie(other, dmg);
    }
    for (const u of state.units) {
      if (u.dead) continue;
      const dx = u.x - z.x, dy = u.y - z.y;
      if (Math.hypot(dx, dy) <= radius) damageUnit(u, dmg);
    }
    spawnParticles(z.x, z.y, "#e2655a", 30);
    state.shake = Math.max(state.shake, 0.5);
  }
  emit("zombie-died", z);
}
