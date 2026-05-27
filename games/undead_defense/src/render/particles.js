import { state } from "../state.js";

export function spawnParticles(wx, wy, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3;
    state.particles.push({
      x: wx, y: wy,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.4,
      maxLife: 0.9,
      color,
      size: 1.5 + Math.random() * 2,
    });
  }
}

export function spawnFloating(wx, wy, text, color) {
  state.floatingText.push({
    x: wx, y: wy,
    vy: -1.4,
    life: 0.7,
    maxLife: 0.7,
    text, color,
  });
}

export function updateParticles(dt) {
  for (const p of state.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.9;
    p.vy *= 0.9;
  }
  state.particles = state.particles.filter(p => p.life > 0);
  for (const f of state.floatingText) {
    f.life -= dt;
    f.y += f.vy * dt;
  }
  state.floatingText = state.floatingText.filter(f => f.life > 0);
}
