// Catalogs verification (Wave 1) — asserts the v1 card/unit/enemy catalogs are
// complete, in scope, and referentially consistent.
// Run: `node games/clicky_empire/test/catalogs.test.mjs`

import assert from "node:assert/strict";

import { CARDS, getCard, cardsAtOrBelowTier } from "../src/cards/catalog.js";
import { UNITS, getUnitDef } from "../src/units/catalog.js";
import { ENEMIES, getEnemyDef } from "../src/enemies/catalog.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// --- expected v1 id sets (from prompt.md V1 includes + DEV_PLAN §8) ---
const EXPECTED_CARDS = [
  // Tier 1
  "lumber_camp", "hamlet", "wheat_field", "militia_camp", "watchtower", "palisade",
  "sharpened_tools", "keen_eye", "war_drums",
  "supply_wagon", "tax_collection", "forage_run",
  "militia",
  // Tier 2 subset
  "sawmill", "mine", "barracks", "stone_wall", "ballista_tower",
  "spearman", "archer_band",
  "masonry", "fletching",
  "rally", "volley",
];
const EXPECTED_UNITS = ["militia", "spearman", "archer_band"];
const EXPECTED_ENEMIES = ["raider", "wolf", "skirmisher", "sapper", "warlord"];

// --- counts ---
assert.equal(Object.keys(CARDS).length, EXPECTED_CARDS.length, "card count matches expected set");
assert.equal(Object.keys(CARDS).length, 24, "card count is exactly 24");
assert.equal(Object.keys(UNITS).length, 3, "unit count = 3");
assert.equal(Object.keys(ENEMIES).length, 5, "enemy count = 5");
ok(`counts: cards=${Object.keys(CARDS).length}, units=3, enemies=5`);

// --- exact id membership (no extras, none missing) ---
assert.deepEqual(Object.keys(CARDS).sort(), [...EXPECTED_CARDS].sort(), "card ids match v1 set");
assert.deepEqual(Object.keys(UNITS).sort(), [...EXPECTED_UNITS].sort(), "unit ids match v1 set");
assert.deepEqual(Object.keys(ENEMIES).sort(), [...EXPECTED_ENEMIES].sort(), "enemy ids match v1 set");
ok("exact id membership for cards/units/enemies");

// --- id field matches map key ---
for (const [k, c] of Object.entries(CARDS)) assert.equal(c.id, k, `card key/id match: ${k}`);
for (const [k, u] of Object.entries(UNITS)) assert.equal(u.id, k, `unit key/id match: ${k}`);
for (const [k, e] of Object.entries(ENEMIES)) assert.equal(e.id, k, `enemy key/id match: ${k}`);
ok("every entry's id equals its map key");

// --- card schema shape ---
const TYPES = new Set(["building", "unit", "upgrade", "action"]);
const RARITIES = new Set(["common", "rare", "epic", "legendary"]);
const RES = new Set(["gold", "wood", "iron", "food"]);
for (const c of Object.values(CARDS)) {
  assert.ok(typeof c.name === "string" && c.name.length, `${c.id} has name`);
  assert.ok(TYPES.has(c.type), `${c.id} valid type`);
  assert.ok([1, 2, 3].includes(c.tier), `${c.id} valid tier`);
  assert.ok(RARITIES.has(c.rarity), `${c.id} valid rarity`);
  assert.ok(c.cost && typeof c.cost === "object", `${c.id} has cost`);
  for (const r of Object.keys(c.cost)) {
    assert.ok(RES.has(r), `${c.id} cost uses valid resource: ${r}`);
    assert.ok(c.cost[r] > 0, `${c.id} cost.${r} positive`);
  }
  assert.ok(c.effect && typeof c.effect === "object", `${c.id} has effect`);
  assert.ok(typeof c.effect !== "function", `${c.id} effect is declarative (not fn)`);
}
ok("card schema shape valid");

// --- referential integrity ---
for (const c of Object.values(CARDS)) {
  if (c.type === "building") {
    assert.ok(typeof c.effect.defId === "string" && c.effect.defId.length, `${c.id} has effect.defId`);
    assert.match(c.effect.defId, /^[a-z][a-z0-9_]*$/, `${c.id} defId is snake_case`);
  }
  if (c.type === "unit") {
    assert.ok(c.effect.unitId, `${c.id} has effect.unitId`);
    assert.ok(getUnitDef(c.effect.unitId), `${c.id} effect.unitId resolves: ${c.effect.unitId}`);
  }
  if (c.type === "upgrade") {
    // declarative stat descriptor: at least one of stat/mult/add/target
    const e = c.effect;
    assert.ok("stat" in e || "mult" in e || "add" in e || "target" in e, `${c.id} upgrade has a descriptor`);
  }
  if (c.type === "action") {
    assert.ok(typeof c.effect.action === "string", `${c.id} action has effect.action`);
  }
}
ok("referential integrity: building defId / unit unitId resolve");

// --- specific effect numbers from prompt.md ---
assert.deepEqual(getCard("sharpened_tools").effect, { stat: "harvestYield", add: 1 });
assert.deepEqual(getCard("keen_eye").effect, { stat: "harvestChance", add: 0.15 });
assert.deepEqual(getCard("war_drums").effect, { stat: "attackChance", add: 0.15 });
assert.equal(getCard("supply_wagon").effect.action, "gain");
assert.equal(getCard("supply_wagon").effect.resource, "wood");
assert.equal(getCard("supply_wagon").effect.amount, 25);
assert.equal(getCard("tax_collection").effect.resource, "gold");
assert.equal(getCard("forage_run").effect.resource, "food");
assert.equal(getCard("rally").effect.action, "healAll");
assert.equal(getCard("volley").effect.action, "areaDamage");
assert.equal(getCard("masonry").effect.target, "walls");
assert.equal(getCard("masonry").effect.mult, 1.5);
assert.equal(getCard("fletching").effect.target, "ranged");
ok("specific effect descriptors match prompt.md numbers");

// --- specific costs from prompt.md ---
assert.deepEqual(getCard("lumber_camp").cost, { wood: 20 });
assert.deepEqual(getCard("hamlet").cost, { wood: 30 });
assert.deepEqual(getCard("wheat_field").cost, { wood: 15, gold: 10 });
assert.deepEqual(getCard("militia_camp").cost, { wood: 25, gold: 15 });
assert.deepEqual(getCard("watchtower").cost, { wood: 30, iron: 10 });
assert.deepEqual(getCard("palisade").cost, { wood: 10 });
assert.deepEqual(getCard("militia").cost, { food: 10 });
assert.deepEqual(getCard("sawmill").cost, { wood: 40, iron: 20 });
assert.deepEqual(getCard("mine").cost, { wood: 30, iron: 30 });
assert.deepEqual(getCard("barracks").cost, { wood: 50, iron: 40 });
assert.deepEqual(getCard("stone_wall").cost, { wood: 20, iron: 30 });
assert.deepEqual(getCard("ballista_tower").cost, { wood: 40, iron: 50 });
assert.deepEqual(getCard("spearman").cost, { food: 15 });
assert.deepEqual(getCard("archer_band").cost, { food: 15, wood: 10 });
ok("card costs match prompt.md");

// --- out-of-scope ids absent (T3 + deferred T2) ---
const FORBIDDEN_CARDS = [
  "market", "granary", "knight", "forced_march", "bountiful_harvest", "gold_rush",
  "keep", "cathedral", "wizard_tower", "foundry", "castle_wall",
  "royal_decree", "enchanted_arms", "fortification", "master_tactician",
  "meteor", "reinforcements", "divine_intervention",
  "cavalry", "catapult", "paladin",
];
for (const id of FORBIDDEN_CARDS) assert.equal(getCard(id), null, `out-of-scope card absent: ${id}`);
const FORBIDDEN_UNITS = ["knight", "cavalry", "catapult", "paladin"];
for (const id of FORBIDDEN_UNITS) assert.equal(getUnitDef(id), null, `out-of-scope unit absent: ${id}`);
const FORBIDDEN_ENEMIES = ["brute", "shaman", "dragon"];
for (const id of FORBIDDEN_ENEMIES) assert.equal(getEnemyDef(id), null, `out-of-scope enemy absent: ${id}`);
ok("no out-of-scope ids present (no market/knight/dragon/etc.)");

// --- cardsAtOrBelowTier(1) returns only tier-1 cards ---
const t1 = cardsAtOrBelowTier(1);
assert.equal(t1.length, 13, "exactly 13 tier-1 cards");
assert.ok(t1.every((c) => c.tier === 1), "cardsAtOrBelowTier(1) is all tier 1");
assert.equal(cardsAtOrBelowTier(2).length, 24, "tier<=2 is the whole v1 set");
ok("cardsAtOrBelowTier(1) returns only tier-1 cards (13)");

// --- unit schema (hp = figure count; tags; foodCost; color) ---
const UTAGS = new Set(["MELEE", "RANGED", "SIEGE", "CHARGE", "SUPPORT"]);
for (const u of Object.values(UNITS)) {
  for (const f of ["hp", "damage", "range", "attackSpeed", "moveSpeed", "foodCost"]) {
    assert.ok(typeof u[f] === "number" && u[f] > 0, `${u.id}.${f} positive number`);
  }
  assert.ok(Array.isArray(u.tags) && u.tags.length, `${u.id} has tags`);
  for (const t of u.tags) assert.ok(UTAGS.has(t), `${u.id} valid tag ${t}`);
  assert.ok(typeof u.color === "number", `${u.id} has numeric color`);
}
assert.equal(getUnitDef("militia").hp, 4, "militia ~4 figures");
assert.equal(getUnitDef("spearman").hp, 5, "spearman ~5 figures");
assert.equal(getUnitDef("archer_band").hp, 3, "archer_band ~3 figures");
assert.ok(getUnitDef("archer_band").range > getUnitDef("militia").range, "archers out-range melee");
assert.ok(getUnitDef("spearman").tags.includes("CHARGE"), "spearman is anti-charge");
assert.ok(getUnitDef("archer_band").tags.includes("RANGED"), "archer_band is RANGED");
ok("unit schema + figure counts + tags");

// --- enemy schema (warlord is ELITE w/ higher hp + gold+renown reward) ---
const ETRAITS = new Set(["MELEE", "RANGED", "FAST", "ARMORED", "SAPPER", "SUPPORT", "ELITE", "BOSS"]);
for (const e of Object.values(ENEMIES)) {
  for (const f of ["hp", "damage", "range", "attackSpeed", "speed"]) {
    assert.ok(typeof e[f] === "number" && e[f] > 0, `${e.id}.${f} positive number`);
  }
  assert.ok(Array.isArray(e.traits) && e.traits.length, `${e.id} has traits`);
  for (const t of e.traits) assert.ok(ETRAITS.has(t), `${e.id} valid trait ${t}`);
  assert.ok(e.reward && typeof e.reward === "object", `${e.id} has reward`);
  assert.ok(typeof e.color === "number", `${e.id} has numeric color`);
}
const wl = getEnemyDef("warlord");
assert.ok(wl.traits.includes("ELITE"), "warlord is ELITE");
assert.ok(wl.hp > getEnemyDef("raider").hp, "warlord has higher hp than raider");
assert.ok(wl.reward.gold > 0 && wl.reward.renown > 0, "warlord drops gold + renown");
assert.ok(getEnemyDef("wolf").traits.includes("FAST"), "wolf is FAST");
assert.ok(getEnemyDef("wolf").speed > getEnemyDef("raider").speed, "wolf faster than raider");
assert.ok(getEnemyDef("skirmisher").traits.includes("RANGED"), "skirmisher is RANGED");
assert.ok(getEnemyDef("sapper").traits.includes("SAPPER"), "sapper has SAPPER trait");
ok("enemy schema + warlord elite reward + traits");

// --- lookup helpers return null on miss ---
assert.equal(getCard("nope"), null);
assert.equal(getUnitDef("nope"), null);
assert.equal(getEnemyDef("nope"), null);
ok("lookup helpers return null on miss");

console.log(`\nCatalogs: ${passed} checks passed.`);
