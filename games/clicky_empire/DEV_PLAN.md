# Clicky Empire — Build Dev Plan (V1 Vertical Slice)

This is the orchestration playbook for building the **V1 vertical slice** from
[prompt.md](prompt.md) using multiple subagents working in parallel **git worktrees**,
merged back into `main`. It is scoped to the v1 includes/defers list in the design doc — nothing beyond it.

The whole plan is organized around one hard rule:

> **No two concurrently-running agents may write the same file.**

Clean merges are guaranteed by *disjoint file ownership*, not by careful diffing. The central
wiring files are owned by the **integrator** (the orchestrating session) and only ever edited
between fan-out waves, never during one.

---

## 1. Architecture Invariants (every agent must obey)

These are non-negotiable so independently-built modules compose without rework:

1. **`state.js` is the single source of truth.** Its shape is frozen in Stage 0. Subsystem modules
   **read** state and **dispatch** mutations; they do **not** add fields to the state object. Need a
   new field? Request it in `CONTRACTS.md` — the integrator adds it in Stage 0 or a wave boundary.
2. **Render is one-way.** `input → commands → state` then `render reads state every frame`. Render
   code never mutates game state.
3. **Pure-data catalogs** (`cards/catalog.js`, `units/catalog.js`, `enemies/catalog.js`, `world/tiles.js`)
   contain **data only**, no logic. Balance lives here; behavior lives elsewhere.
4. **Pure-logic modules import neither `three` nor the DOM** at module top level. Map gen, pathfinding,
   combat math, economy, card/draft, upkeep, RNG, and math must be **node-runnable** so they can be
   unit-tested headlessly. (Render/camera/input/ui/audio are allowed to touch `three`/DOM.)
5. **Modules export `init(ctx)` / `update(dt)` (and optionally `render(...)`)** rather than reaching
   into globals. The integrator wires them into the loop. A subsystem **never edits `main.js`,
   `run.js`, `state.js`, `render/scene.js`, or `index.html`** — those are integrator-owned.
6. **Coordinate system + picking tags are fixed in Stage 0** (grid↔world conversion, `userData` tag
   schema). Everyone uses the shared helpers; nobody invents their own.
7. **One concern = one folder = one owner.** Files stay small. New files go only in your owned folder(s).

---

## 2. Stage 0 — Foundation & Contracts (integrator solo, merges to `main` FIRST)

Nothing fans out until this is on `main`. Stage 0 establishes the stable interfaces every parallel
agent codes against. Deliverables:

**Shell & wiring**
- `index.html` — canvas, HUD root containers (empty mount points), `importmap` pinning Three.js, `<script type="module" src="src/main.js">`.
- `meta.yaml` — catalog metadata (mirror `undead_defense/meta.yaml`: slug `clicky-empire`, built_with model `Claude Opus 4.8`, entry `index.html`).
- `src/main.js` — bootstrap skeleton: renderer, RAF loop, scene-switch (MENU/RUN/OVER) stubs, an empty **subsystem registry** the integrator fills in later.
- `src/run.js` — the **BUILD↔ATTACK phase state machine** skeleton (round timer, DEFEND hook, payout/draft/XP hooks as stubs). Integrator-owned glue.
- `src/state.js` — the **full frozen state shape** (see §3), getters, `dispatch`/mutation API, `subscribe`.
- `src/persistence.js` — localStorage read/write + `schema_version` skeleton (key `clicky_empire_save_v1`).

**Shared leaf utilities (depended on by everyone)**
- `src/util/events.js` — pub/sub (`on`/`off`/`emit`).
- `src/util/rng.js` — seedable, shareable RNG (string seed → deterministic stream).
- `src/util/math.js` — vec/lerp/clamp/easings + **grid↔world iso helpers** (`tileToWorld`, `worldToTile`).

**Render base (the shared scene other render code attaches to)**
- `src/render/scene.js` — renderer, sun + ambient light, ground plane, the **iso orbit camera rig**, and the **raycaster + `userData` routing** entry point. Exposes `scene`, `camera`, `pick(event)`.

**Schema-locked stubs (headers only, filled in parallel later)**
- `src/cards/catalog.js`, `src/units/catalog.js`, `src/enemies/catalog.js`, `src/world/tiles.js` — each exports the agreed schema with 1 example entry, so downstream agents can import the shape immediately.

**The contract document**
- `CONTRACTS.md` — the locked interface surface (§3 below, expanded): state shape, event names, every
  module's exported signatures, the four data schemas, coordinate system, `userData` tag schema, the
  pinned Three.js CDN version. **This file is the source of truth for cross-module APIs.**

✅ **Stage 0 done when:** `index.html` opens to a black scene with the ground plane + orbit camera
(pan/zoom/snap-rotate) working, and `CONTRACTS.md` fully specifies every interface in §3.

---

## 3. The Contract Surface (locked in Stage 0)

Concrete enough that agents never have to guess. Final exact signatures live in `CONTRACTS.md`;
this is the outline:

- **State shape** (`state.js`): `scene`, `run { seed, mapSize, round, phase, timer, xp, tier }`,
  `resources { gold, wood, iron, food }`, `playerStats { attackChance, attackDamage, critChance, harvestChance, harvestYield, clickCooldown }`,
  `map { tiles, revealed, castle }`, `hand[]`, `placed[]` (buildings), `units[]`, `enemies[]`,
  `selection[]`, `meta { unlockedCards[], renown, throneUpgrades[], settings }`, `records {...}`.
- **Events** (`events.js`): `phase-changed`, `round-cleared`, `hand-changed`, `resource-changed`,
  `unit-selected`, `castle-damaged`, `enemy-killed`, `card-played`, `tile-revealed`, `game-over`.
- **Coordinate system**: tile grid is integer `(col,row)`; world is Three.js XZ plane via
  `tileToWorld(col,row)` / `worldToTile(x,z)` from `util/math.js`. Y is up.
- **Picking**: `render/scene.js`’s `pick(event)` raycasts and returns the hit object's
  `userData = { kind: 'tile'|'unit'|'enemy'|'fog'|'building', id }`. Input layer routes on `kind`.
- **Data schemas**: `card { id, name, type, tier, rarity, cost{}, effect }`,
  `tile { type, buildable, walkable, clickYield, adjacency }`,
  `unitDef { id, name, hp, damage, range, attackSpeed, moveSpeed, tags[], foodCost }`,
  `enemyDef { id, name, hp, damage, speed, traits[], reward{} }`.
- **Combat API** (so units/enemies code against it before it merges):
  `resolveHit(attacker, target) -> { dealt, killed, crit }`, `resolveClick(target, playerStats) -> {...}`.
- **Three.js**: pinned CDN (e.g. `three@0.160.0` module + `examples/jsm` addons) declared once in the importmap.

---

## 4. Build Waves (fan-out) — Disjoint File Ownership

Three waves. Within a wave, agents run **concurrently in separate worktrees**; each owns disjoint
files. Between waves, the integrator merges, wires into `main.js`/`run.js`, and smoke-tests before the
next wave branches off the updated `main`.

### Wave 1 — Leaf systems (zero cross-deps beyond Stage 0). Fully parallel.

| Agent | Owns (files) | Builds | Depends on |
|---|---|---|---|
| **W1-World** | `world/generate.js`, `world/expand.js`, `world/tiles.js`, `world/pathfind.js` | seeded biome map, castle-center, fog reveal + cost scaling, grid pathing | rng, math, state, tiles schema |
| **W1-Combat** | `combat/damage.js`, `combat/effects.js`, `combat/clicker.js` | hit resolution, crits, AOE/heal/buff, click→harvest/attack/crit | state, playerStats |
| **W1-Render** | `render/meshes.js`, `render/fx.js` | low-poly mesh builders (tile/building/unit/enemy), topple, floating numbers, screen-shake | scene.js, three, math |
| **W1-Catalogs** | `cards/catalog.js`, `units/catalog.js`, `enemies/catalog.js` (fill all v1 data) | all v1 card/unit/enemy data per the doc | data schemas only |
| **W1-Audio** | `audio/sfx.js`, `audio/music.js` | pooled one-shots, build/combat music crossfade | events |

### Wave 2 — Logic that consumes Wave 1. Parallel; branches off merged `main`.

| Agent | Owns (files) | Builds | Depends on (now merged) |
|---|---|---|---|
| **W2-Cards** | `cards/hand.js`, `cards/draft.js` | draw, hand cap 7, drag-to-play, 3-card end-round draft + first-time unlock | catalog, rng, state |
| **W2-Buildings** | `buildings/place.js`, `buildings/economy.js`, `buildings/defense.js` | ghost/footprint/validity placement, idle ticks + adjacency, auto-firing towers (watchtower/ballista) | tiles, meshes, combat, catalog |
| **W2-Units** | `units/group.js`, `units/behavior.js`, `units/upkeep.js` | figure-cluster group (instanced troops+flag, HP=standing figures, topple), per-tick AI, food upkeep + desertion | combat, pathfind, meshes, catalog |
| **W2-Enemies** | `enemies/spawner.js`, `enemies/behavior.js` | edge spawn, wave composition by round, scaling, pathing + sapper building-priority, warlord (r5) | combat, pathfind, catalog |
| **W2-RTS** | `rts/input.js`, `rts/selection.js`, `rts/commands.js` | raycast routing by `userData.kind`, select/box-select, right-click move/attack, A/S | scene pick, state, units |

*(`rts/camera.js` shipped in Stage 0 inside `render/scene.js`'s rig; W2-RTS extends input only.)*

### Wave 3 — Integration, UI, polish (integrator-led; UI agent owns its files solo).

| Agent | Owns (files) | Builds |
|---|---|---|
| **W3-UI** | `index.html` HUD markup, `styles/main.css`, `styles/theme.css`, `ui/hud.js`, `ui/cards_ui.js`, `ui/menu.js`, `ui/overlays.js` | top/bottom bars, timer, castle HP, hand render + drag, draft screen, main menu, game-over, wave banner, floating-number juice hooks |
| **Integrator** | `main.js`, `run.js`, `state.js`, `render/scene.js`, `persistence.js` | wire every subsystem into the loop + phase machine, full persistence, balance/playtest pass, definition-of-done verification |

> **index.html ownership:** Stage 0 lands the empty mount points; **only W3-UI** edits HUD markup
> afterward, and it runs alone in Wave 3. No concurrent writer ever touches `index.html`.

---

## 5. Worktree & Merge Protocol

1. **Branch per agent** off current `main`: `feat/ce-<wave>-<area>` (e.g. `feat/ce-w1-world`).
   Each agent runs in its own `git worktree` so working dirs never collide.
2. **Ownership is law.** An agent edits only its assigned files (+ new files in its owned folders).
   If it discovers it needs a central-file change, it **stops and reports** — the integrator makes
   that change at the wave boundary. (Prevents the only realistic source of conflicts.)
3. **Verify-in-isolation before merge.** Each agent ships a headless test or `__harness.html` proving
   its module works standalone (see §6). An agent's branch is not merged until its own checks pass.
4. **Merge order within a wave is irrelevant** (disjoint files ⇒ no conflicts). Integrator merges each
   branch, then runs the smoke test on `main`.
5. **Wave boundary = integration commit.** After merging a wave, the integrator wires the new
   subsystems into `main.js`/`run.js`, smoke-tests in-browser, commits, and only then branches Wave N+1.
6. **Worktree cleanup** after each successful merge (remove worktree, delete branch).

**Conflict hotspots & mitigation:** the only files multiple efforts could touch — `main.js`, `run.js`,
`state.js`, `render/scene.js`, `index.html`, `styles/*` — are all **integrator-owned and edited
sequentially**. Fan-out agents are structurally prevented from touching them. Expected merge conflicts: **none**.

---

## 6. Verification (no build step)

- **Pure-logic modules** (world, combat, cards/draft, economy, upkeep, rng, math): a tiny
  `test/<area>.test.mjs` runnable with `node` — deterministic seeded assertions (same seed → same map;
  expansion cost monotonic increasing; crit math; draft never offers locked cards; desertion lowest-tier-first).
- **Render/RTS/UI/audio modules**: a per-agent `__harness.html` that imports the module against a stub
  scene/state and exercises it visually (spawn a unit group and topple it; place a ghost building; route a click).
- **Integration gate (per wave):** open `index.html`, confirm the wave's features work in the real loop.
- **V1 definition-of-done** (from the doc): a full run plays menu → settle → survive escalating rounds
  through the **round-5 warlord** → castle falls → game-over score → back to menu, with unlocked cards,
  renown, and best round **persisted across reload**.

---

## 7. Execution Checklist (integrator-driven)

- [ ] **Stage 0**: shell, state shape, run/phase skeleton, util, scene+camera+picking, schema stubs, `CONTRACTS.md`. Merge to `main`. Smoke: orbit camera over ground plane.
- [ ] **Wave 1** (5 agents ∥): World, Combat, Render-meshes/fx, Catalogs, Audio. Verify-in-isolation → merge all → integrate → smoke.
- [ ] **Wave 2** (5 agents ∥): Cards-hand/draft, Buildings, Units, Enemies, RTS-input. Verify → merge → integrate (wire into phase machine) → smoke.
- [ ] **Wave 3**: UI agent (solo, owns index.html HUD + styles + ui/) ∥ integrator full wiring + persistence. Merge → integrate.
- [ ] **Balance & DoD pass**: playtest to round-5 warlord, tune scaling numbers, confirm persistence across reload. Update `meta.yaml` status → `prototype`.

---

## 8. Scope Guard

Build **only** the v1 includes list. Explicitly **out of scope for this build**: all Tier 3 cards,
dragon/brute/shaman, gem veins, desert/marsh penalties, market/granary specials, control groups,
Throne Room spending, resumable mid-run saves, adaptive 3-layer music, color-blind mode. These stay
documented in `prompt.md` as v2+ and are not implemented now.
