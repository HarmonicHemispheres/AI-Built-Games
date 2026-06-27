// Cards subsystem verification (W2-Cards). Pure-logic, deterministic asserts.
// Run: `node games/clicky_empire/test/cards.test.mjs`
//
// Covers cards/hand.js (drawStarting/draw/consume/playCard + initHand listener)
// and cards/draft.js (rollDraft determinism/pool/tier gating + chooseDraft).

import assert from "node:assert/strict";

import { on, emit, clearAll } from "../src/util/events.js";
import {
  state,
  SCENE,
  PHASE,
  HAND_CAP,
  BASE_STATS,
  newRun,
  addResource,
  setScene,
} from "../src/state.js";
import { getCard, buildingCardsForTier } from "../src/cards/catalog.js";
import {
  drawStarting,
  draw,
  consume,
  playCard,
  initHand,
} from "../src/cards/hand.js";
import { rollDraft, chooseDraft, initDraft } from "../src/cards/draft.js";

let passed = 0;
const ok = (label) => {
  passed++;
  console.log(`  ✓ ${label}`);
};

// Helper: fully reset to a clean run.
function freshRun(seed = "CARDSEED", mapSize = 5) {
  clearAll();
  newRun({ seed, mapSize });
  state.map.castle = { col: 2, row: 2 };
  setScene(SCENE.RUN);
}

// ---------------------------------------------------------------------------
// drawStarting: 5 tier-1 cards, hand cap respected
// ---------------------------------------------------------------------------
freshRun();
let handChanged = 0;
on("hand-changed", () => handChanged++);
drawStarting();
assert.equal(state.hand.length, 5, "drawStarting puts 5 cards in hand");
assert.ok(state.hand.every((c) => c.tier === 1), "all starting cards are tier 1");
assert.equal(handChanged, 1, "drawStarting emits hand-changed once");
ok("drawStarting: 5 tier-1 cards + single hand-changed");

// Determinism: same seed -> same starting hand.
freshRun("CARDSEED");
drawStarting();
const handA = state.hand.map((c) => c.id);
freshRun("CARDSEED");
drawStarting();
const handB = state.hand.map((c) => c.id);
assert.deepEqual(handA, handB, "starting hand is deterministic for a fixed seed");
ok("drawStarting: deterministic by seed");

// Hand cap respected: pre-fill near the cap, drawStarting must not overflow.
freshRun();
const filler = getCard("militia");
for (let i = 0; i < HAND_CAP - 2; i++) state.hand.push(filler); // 5 already in hand
drawStarting();
assert.equal(state.hand.length, HAND_CAP, "hand never exceeds HAND_CAP");
ok("drawStarting: hand cap respected");

// draw(n) also respects the cap.
freshRun();
draw(20);
assert.equal(state.hand.length, HAND_CAP, "draw(n) caps at HAND_CAP");
ok("draw(n): hand cap respected");

// ---------------------------------------------------------------------------
// playCard: unaffordable is a no-op
// ---------------------------------------------------------------------------
freshRun();
state.hand = [getCard("sharpened_tools")]; // cost { gold: 20 }
// No resources -> unaffordable.
let played = 0;
on("card-played", () => played++);
const goldBefore = state.resources.gold;
const res = playCard("sharpened_tools");
assert.deepEqual(res, { pending: false }, "unaffordable playCard returns {pending:false}");
assert.equal(state.hand.length, 1, "unaffordable playCard does not consume");
assert.equal(state.resources.gold, goldBefore, "unaffordable playCard does not spend");
assert.equal(state.playerStats.harvestYield, BASE_STATS.harvestYield, "no stat change");
assert.equal(played, 0, "unaffordable playCard does not emit card-played");
ok("playCard: unaffordable is a no-op");

// ---------------------------------------------------------------------------
// playCard: affordable upgrade mutates the right playerStats + consumes
// ---------------------------------------------------------------------------
freshRun();
state.hand = [getCard("sharpened_tools")]; // {stat:'harvestYield', add:1}, cost gold 20
addResource("gold", 20);
const yieldBefore = state.playerStats.harvestYield;
const upRes = playCard("sharpened_tools");
assert.deepEqual(upRes, { pending: false });
assert.equal(state.playerStats.harvestYield, yieldBefore + 1, "harvestYield += 1");
assert.equal(state.resources.gold, 0, "upgrade cost spent");
assert.equal(state.hand.length, 0, "upgrade card consumed");
ok("playCard: affordable upgrade mutates playerStats + spends + consumes");

// target-scoped upgrade records into state.run.upgrades (no playerStats touch).
freshRun();
state.run.tier = 2;
state.hand = [getCard("masonry")]; // {target:'walls', stat:'hp', mult:1.5}, cost gold40 iron20
addResource("gold", 40);
addResource("iron", 20);
playCard("masonry");
assert.ok(Array.isArray(state.run.upgrades), "state.run.upgrades initialized");
assert.equal(state.run.upgrades.length, 1, "target-scoped upgrade recorded");
assert.equal(state.run.upgrades[0].target, "walls");
assert.equal(state.hand.length, 0, "masonry consumed");
ok("playCard: target-scoped upgrade -> state.run.upgrades");

// ---------------------------------------------------------------------------
// playCard: affordable action 'gain' adds the resource + consumes
// ---------------------------------------------------------------------------
freshRun();
state.hand = [getCard("supply_wagon")]; // gain 25 wood, cost gold 15
addResource("gold", 15);
const actRes = playCard("supply_wagon");
assert.deepEqual(actRes, { pending: false });
assert.equal(state.resources.wood, 25, "action 'gain' added 25 wood");
assert.equal(state.resources.gold, 0, "action cost spent");
assert.equal(state.hand.length, 0, "action card consumed");
ok("playCard: affordable action 'gain' adds resource + spends + consumes");

// ---------------------------------------------------------------------------
// playCard: building emits placement-begin and does NOT spend / consume
// ---------------------------------------------------------------------------
freshRun();
state.hand = [getCard("palisade")]; // building, cost wood 10
addResource("wood", 50);
let placementBegin = null;
on("placement-begin", (p) => (placementBegin = p));
const bRes = playCard("palisade");
assert.deepEqual(bRes, { pending: true }, "building playCard returns {pending:true}");
assert.deepEqual(placementBegin, { cardId: "palisade" }, "placement-begin emitted with cardId");
assert.equal(state.resources.wood, 50, "building playCard does NOT spend");
assert.equal(state.hand.length, 1, "building playCard does NOT consume");
ok("playCard: building -> placement-begin, no spend / no consume");

// initHand wires hand-consume: place.js emits it after placement.
initHand();
emit("hand-consume", { cardId: "palisade" });
assert.equal(state.hand.length, 0, "hand-consume listener removed the placed card");
ok("initHand: hand-consume listener consumes the card");

// ---------------------------------------------------------------------------
// playCard: unit emits spawn-unit near the castle + spends + consumes
// ---------------------------------------------------------------------------
freshRun();
state.hand = [getCard("militia")]; // unit, cost food 10
addResource("food", 10);
let spawn = null;
on("spawn-unit", (p) => (spawn = p));
playCard("militia");
assert.equal(spawn.unitId, "militia", "spawn-unit carries the unitId");
assert.equal(spawn.col, state.map.castle.col, "spawn near castle col");
assert.equal(spawn.row, state.map.castle.row, "spawn near castle row");
assert.equal(state.resources.food, 0, "unit cost spent");
assert.equal(state.hand.length, 0, "unit card consumed");
ok("playCard: unit -> spawn-unit near castle + spends + consumes");

// ---------------------------------------------------------------------------
// rollDraft: deterministic for fixed seed+round; never above current tier;
// only from unlocked UNION tier-1 pool
// ---------------------------------------------------------------------------
freshRun("DRAFTSEED");
state.run.round = 3;
state.run.tier = 1;
const draftA = rollDraft().map((c) => c.id);
const draftB = rollDraft().map((c) => c.id);
assert.deepEqual(draftA, draftB, "rollDraft is deterministic for fixed seed+round");
assert.ok(draftA.length > 0 && draftA.length <= 3, "rollDraft returns up to 3");
assert.equal(new Set(draftA).size, draftA.length, "rollDraft de-dupes");
for (const id of draftA) {
  assert.ok(getCard(id).tier <= 1, `${id} is at or below current tier`);
}
ok("rollDraft: deterministic, de-duped, <=3, tier-gated");

// Different round -> may differ; still deterministic per (seed,round).
state.run.round = 4;
const draftR4a = rollDraft().map((c) => c.id);
state.run.round = 4;
const draftR4b = rollDraft().map((c) => c.id);
assert.deepEqual(draftR4a, draftR4b, "rollDraft stable for a given round");
ok("rollDraft: stable per (seed, round)");

// Tier gating: a tier-2 unlocked card must NOT appear while tier is 1, but CAN
// appear once tier rises to 2. (Uses a tier-2 UNIT — buildings are never drafted.)
freshRun("POOLSEED");
state.run.tier = 1;
state.meta.unlockedCards = ["spearman"]; // tier 2 unit, unlocked
let appearsAtT1 = false;
for (let r = 0; r < 12; r++) {
  state.run.round = r;
  if (rollDraft().some((c) => c.id === "spearman")) appearsAtT1 = true;
}
assert.equal(appearsAtT1, false, "tier-2 unlock never drafts while tier 1");
state.run.tier = 2;
let appearsAtT2 = false;
for (let r = 0; r < 30; r++) {
  state.run.round = r;
  if (rollDraft().some((c) => c.id === "spearman")) appearsAtT2 = true;
}
assert.equal(appearsAtT2, true, "tier-2 unlock can draft once tier 2");
ok("rollDraft: only unlocked UNION tier-1, gated by current tier");

// Pool restriction: a tier-2 card that is NOT unlocked never appears even at T2.
freshRun("LOCKSEED");
state.run.tier = 2;
state.meta.unlockedCards = []; // nothing unlocked
let lockedAppeared = false;
for (let r = 0; r < 30; r++) {
  state.run.round = r;
  if (rollDraft().some((c) => c.tier === 2)) lockedAppeared = true;
}
assert.equal(lockedAppeared, false, "non-unlocked tier-2 card never drafts");
ok("rollDraft: locked (never-unlocked) tier-2 cards excluded");

// ---------------------------------------------------------------------------
// chooseDraft: adds to hand and unlocks a never-seen card, advances round
// ---------------------------------------------------------------------------
freshRun("CHOOSESEED");
initDraft(); // registers rollDraft into run.js (no throw)
state.run.round = 2;
state.meta.unlockedCards = [];
state.hand = [];
const beforeRound = state.run.round;
const chosen = chooseDraft("keen_eye"); // tier-1, never seen
assert.equal(chosen, true);
assert.ok(
  state.hand.some((c) => c.id === "keen_eye"),
  "chooseDraft added the card to hand"
);
assert.ok(
  state.meta.unlockedCards.includes("keen_eye"),
  "chooseDraft permanently unlocked the never-seen card"
);
assert.equal(state.run.round, beforeRound + 1, "chooseDraft advanced the round");
ok("chooseDraft: adds to hand + permanent unlock + advances round");

// Re-choosing an already-unlocked card does not duplicate the unlock.
freshRun("CHOOSESEED2");
state.meta.unlockedCards = ["war_drums"];
state.hand = [];
chooseDraft("war_drums");
assert.equal(
  state.meta.unlockedCards.filter((id) => id === "war_drums").length,
  1,
  "no duplicate unlock for an already-unlocked card"
);
ok("chooseDraft: no duplicate unlocks");

// chooseDraft respects HAND_CAP (card not added when full, still unlocks).
freshRun("CAPSEED");
state.hand = new Array(HAND_CAP).fill(getCard("militia"));
state.meta.unlockedCards = [];
chooseDraft("forage_run");
assert.equal(state.hand.length, HAND_CAP, "chooseDraft does not overflow hand cap");
assert.ok(state.meta.unlockedCards.includes("forage_run"), "still unlocked at cap");
ok("chooseDraft: respects HAND_CAP, still unlocks");

// ---------------------------------------------------------------------------
// Buildings are NOT part of the random pool: they're constructed from the
// tier-gated build menu, never drawn or drafted. Only units / upgrades /
// actions are random cards.
// ---------------------------------------------------------------------------
freshRun("NOBUILD");
drawStarting();
assert.ok(state.hand.length === 5, "starting hand still draws 5");
assert.ok(
  state.hand.every((c) => c.type !== "building"),
  "starting hand contains no building cards"
);
ok("drawStarting: excludes buildings (units/upgrades/actions only)");

freshRun("NOBUILD2");
state.run.tier = 2;
state.meta.unlockedCards = ["sawmill", "stone_wall", "ballista_tower"]; // unlocked T2 buildings
let buildingDrafted = false;
for (let r = 0; r < 40; r++) {
  state.run.round = r;
  if (rollDraft().some((c) => c.type === "building")) buildingDrafted = true;
}
assert.equal(buildingDrafted, false, "buildings never appear in the draft, even when unlocked");
ok("rollDraft: excludes buildings even when unlocked at the current tier");

// buildingCardsForTier feeds the build menu and is gated purely by tier.
assert.equal(buildingCardsForTier(1).length, 6, "6 tier-1 buildings available");
assert.ok(buildingCardsForTier(1).every((c) => c.type === "building" && c.tier <= 1));
assert.equal(buildingCardsForTier(2).length, 13, "13 buildings available by tier 2 (incl. village + archery range)");
assert.ok(buildingCardsForTier(2).every((c) => c.type === "building" && c.tier <= 2));
ok("buildingCardsForTier: tier-gated building list for the build menu");

clearAll();
console.log(`\nCards: ${passed} checks passed.`);
