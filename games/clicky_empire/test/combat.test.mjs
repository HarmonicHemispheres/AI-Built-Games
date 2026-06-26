// Combat verification (W1-Combat) — node, deterministic asserts.
// Run: node games/clicky_empire/test/combat.test.mjs
//
// Covers CONTRACTS §9/§13:
//   - applyDamage reduces hp, clamps at 0, sets killed correctly.
//   - resolveClick crit deals ×3 (critChance=1, attackChance=1 -> type 'crit',
//     amount = attackDamage*3).
//   - harvest (harvestChance=1) adds the resource + scaled yield to resources.
//   - areaDamage only hits enemies within radius.

import assert from "node:assert/strict";

import { state } from "../src/state.js";
import { on, clearAll } from "../src/util/events.js";
import { applyDamage, resolveHit } from "../src/combat/damage.js";
import { resolveClick, _setRng } from "../src/combat/clicker.js";
import { areaDamage, heal, applyBuff } from "../src/combat/effects.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// Helpers to build minimal fixtures.
const mkEnemy = (hp, x = 0, z = 0, extra = {}) => ({
  id: "E" + Math.random().toString(36).slice(2, 7),
  enemyId: "raider",
  def: { id: "raider", damage: 1 },
  hp,
  maxHp: hp,
  pos: { x, y: 0, z },
  ...extra,
});
const mkTile = (clickYield, type = "forest") => ({
  type,
  buildable: true,
  walkable: true,
  clickYield,
});

// Reset run-ish state between groups.
function resetState() {
  state.enemies = [];
  state.resources = { gold: 0, wood: 0, iron: 0, food: 0 };
  state.playerStats = {
    attackChance: 0.5,
    attackDamage: 1,
    critChance: 0.05,
    harvestChance: 0.6,
    harvestYield: 1,
    clickCooldown: 120,
  };
  clearAll();
}

// ---------------------------------------------------------------------------
// applyDamage: reduces hp, clamps at 0, sets killed; emits enemy-killed.
// ---------------------------------------------------------------------------
resetState();
{
  const e = mkEnemy(5);
  state.enemies = [e];

  let r = applyDamage(e, 2);
  assert.equal(e.hp, 3, "hp reduced by exact amount");
  assert.deepEqual(r, { dealt: 2, killed: false });

  // Overkill clamps to 0 and reports killed; dealt never exceeds remaining hp.
  let killEvents = 0;
  on("enemy-killed", () => killEvents++);
  r = applyDamage(e, 99);
  assert.equal(e.hp, 0, "hp clamped at 0 (no negatives)");
  assert.equal(r.dealt, 3, "dealt clamped to remaining hp");
  assert.equal(r.killed, true, "killed when hp hits 0");
  assert.equal(killEvents, 1, "enemy-killed emitted once on death");

  // Hitting an already-dead target is a no-op (no second death event).
  r = applyDamage(e, 5);
  assert.deepEqual(r, { dealt: 0, killed: false }, "no-op on already-dead target");
  assert.equal(killEvents, 1, "no duplicate enemy-killed");
}
ok("applyDamage reduces / clamps / killed / emits");

// resolveHit uses attacker.def.damage and never crits.
resetState();
{
  const e = mkEnemy(10);
  state.enemies = [e];
  const attacker = { def: { damage: 4 } };
  const r = resolveHit(attacker, e);
  assert.equal(e.hp, 6, "resolveHit applied def.damage");
  assert.deepEqual(r, { dealt: 4, killed: false, crit: false });
}
ok("resolveHit applies attacker.def.damage (no crit)");

// ---------------------------------------------------------------------------
// resolveClick — crit path: critChance=1 & attackChance=1 -> 'crit', ×3.
// ---------------------------------------------------------------------------
resetState();
{
  state.playerStats.attackChance = 1;
  state.playerStats.critChance = 1;
  state.playerStats.attackDamage = 2;
  const e = mkEnemy(20);
  state.enemies = [e];

  _setRng(() => 0); // every chance() roll succeeds
  const r = resolveClick(e, state.playerStats);
  _setRng();
  assert.equal(r.type, "crit", "crit when attack+crit guaranteed");
  assert.equal(r.amount, 6, "crit amount = attackDamage * 3");
  assert.equal(e.hp, 14, "enemy hp reduced by crit amount");
}
ok("resolveClick crit deals x3");

// resolveClick — attack (no crit) and miss paths.
resetState();
{
  state.playerStats.attackChance = 1;
  state.playerStats.critChance = 0;
  state.playerStats.attackDamage = 3;
  const e = mkEnemy(3);
  state.enemies = [e];

  _setRng(() => 0.9); // attack lands (1 > .9), crit fails (critChance 0)
  let r = resolveClick(e, state.playerStats);
  assert.equal(r.type, "attack", "non-crit attack");
  assert.equal(r.amount, 3, "attack amount = attackDamage");
  assert.equal(r.killed, true, "killed reported through resolveClick");
  assert.equal(e.hp, 0);

  // attackChance 0 -> always miss.
  state.playerStats.attackChance = 0;
  const e2 = mkEnemy(3);
  state.enemies = [e2];
  r = resolveClick(e2, state.playerStats);
  _setRng();
  assert.equal(r.type, "miss", "miss when attackChance 0");
  assert.equal(e2.hp, 3, "miss deals no damage");
}
ok("resolveClick attack + miss paths");

// ---------------------------------------------------------------------------
// resolveClick harvest: harvestChance=1 adds resource + scaled yield.
// ---------------------------------------------------------------------------
resetState();
{
  state.playerStats.harvestChance = 1;
  state.playerStats.harvestYield = 2; // scales the tile's base amount
  const tile = mkTile({ resource: "wood", amount: 1 }, "forest");

  _setRng(() => 0); // harvest roll succeeds
  const r = resolveClick(tile, state.playerStats);
  _setRng();
  assert.equal(r.type, "harvest", "tile click is a harvest");
  assert.equal(r.amount, 2, "amount = tile.amount(1) * harvestYield(2)");
  assert.equal(r.resource, "wood");
  assert.equal(state.resources.wood, 2, "resource added to state.resources");

  // Weighted-array clickYield (e.g. ore vein) resolves to one option + adds it.
  state.playerStats.harvestYield = 1;
  const ore = mkTile(
    [
      { resource: "gold", amount: 1, weight: 1 },
      { resource: "iron", amount: 1, weight: 1 },
    ],
    "ore_vein"
  );
  _setRng(() => 0); // first option (gold)
  const r2 = resolveClick(ore, state.playerStats);
  _setRng();
  assert.equal(r2.type, "harvest");
  assert.equal(r2.resource, "gold");
  assert.equal(state.resources.gold, 1, "weighted harvest credited gold");

  // harvestChance 0 -> miss, no resource gained.
  state.playerStats.harvestChance = 0;
  const before = state.resources.wood;
  const r3 = resolveClick(mkTile({ resource: "wood", amount: 1 }), state.playerStats);
  assert.equal(r3.type, "miss");
  assert.equal(state.resources.wood, before, "failed harvest adds nothing");
}
ok("resolveClick harvest adds scaled resource (+weighted)");

// ---------------------------------------------------------------------------
// areaDamage only hits enemies within radius (and honors filter).
// ---------------------------------------------------------------------------
resetState();
{
  const inA = mkEnemy(5, 0, 0); // dist 0
  const inB = mkEnemy(5, 1, 1); // dist ~1.41
  const out = mkEnemy(5, 5, 5); // dist ~7.07
  state.enemies = [inA, inB, out];

  const hits = areaDamage({ x: 0, z: 0 }, 2, 3);
  assert.equal(hits, 2, "only the two within radius 2 are hit");
  assert.equal(inA.hp, 2, "in-range enemy A took damage");
  assert.equal(inB.hp, 2, "in-range enemy B took damage");
  assert.equal(out.hp, 5, "out-of-range enemy untouched");

  // Filter narrows targets.
  const fast = mkEnemy(5, 0, 0, { def: { id: "wolf", damage: 1, traits: ["FAST"] } });
  const slow = mkEnemy(5, 0, 0, { def: { id: "raider", damage: 1, traits: ["MELEE"] } });
  state.enemies = [fast, slow];
  const fhits = areaDamage({ x: 0, z: 0 }, 1, 2, (e) => e.def?.traits?.includes("FAST"));
  assert.equal(fhits, 1, "filter limited to FAST");
  assert.equal(fast.hp, 3, "fast enemy hit");
  assert.equal(slow.hp, 5, "non-fast enemy skipped");
}
ok("areaDamage radius + filter");

// heal clamps to maxHp; won't revive the dead.
resetState();
{
  const e = mkEnemy(5);
  e.hp = 2;
  assert.equal(heal(e, 10), 3, "heal returns actual amount, capped at maxHp");
  assert.equal(e.hp, 5, "healed up to maxHp");
  e.hp = 0;
  assert.equal(heal(e, 5), 0, "heal won't revive the dead");
  assert.equal(e.hp, 0);
}
ok("heal clamps to maxHp / no revive");

// applyBuff records onto target.buffs.
resetState();
{
  const u = mkEnemy(5);
  const b = applyBuff(u, { id: "rage", stat: "attackDamage", mult: 1.5, duration: 5 });
  assert.ok(Array.isArray(u.buffs) && u.buffs.length === 1, "buff recorded");
  assert.equal(b.id, "rage");
  assert.equal(u.buffs[0].mult, 1.5);
}
ok("applyBuff records buff");

clearAll();
console.log(`\nCombat: ${passed} checks passed.`);
