# Clicky Empire — CONTRACTS (locked interface surface)

This is the **source of truth for every cross-module API**. It is frozen at the end of Stage 0.
Fan-out agents code against the signatures here — including ones whose implementation hasn't
merged yet. If you need something not specified here, **stop and request it** (the integrator
amends this file at a wave boundary); do not invent a competing interface.

See [DEV_PLAN.md](DEV_PLAN.md) for waves, ownership, and the worktree/merge protocol.

---

## 0. Hard rules (repeat of the invariants)

1. `state.js` shape is frozen. Read state; dispatch via its helpers. Do **not** add top-level fields.
2. Render is one-way: `input → commands → state`, then render reads state. Render never mutates state.
3. Catalog files (`cards/`, `units/`, `enemies/`, `world/tiles.js`) are **pure data** — no logic, no imports of three/DOM.
4. **Pure-logic modules import neither `three` nor the DOM at top level**: `world/*`, `combat/*`,
   `cards/hand.js`, `cards/draft.js`, `buildings/economy.js`, `units/upkeep.js`, `util/*`. They must be node-runnable.
5. Modules export `init(ctx)` / `update(dt)` (+ optional render-sync) and register via the documented
   registries. They do **not** edit `main.js`, `run.js`, `state.js`, `render/scene.js`, `loop.js`, or `index.html`.
6. One concern = one folder = one owner. New files only in your owned folder(s).

---

## 1. Three.js (pinned)

Loaded via importmap in `index.html`:

```
three                -> https://unpkg.com/three@0.160.0/build/three.module.js
three/addons/...     -> https://unpkg.com/three@0.160.0/examples/jsm/...
```

Import as `import * as THREE from "three";`. Only render/camera/input/ui modules may import three.

---

## 2. Coordinate system (`util/math.js`)

- Tile grid is integer `(col, row)`. World is the Three.js **XZ plane**; **Y is up**. `TILE = 1` world unit per tile.
- `tileToWorld(col, row, y=0) -> {x,y,z}` and `worldToTile(x, z) -> {col,row}`. **Always use these.**
- Helpers: `N4`, `N8`, `tileKey(col,row)`, `parseTileKey(key)`, `manhattan`, `chebyshev`, `clamp`,
  `clamp01`, `lerp`, `remap`, `v3/add3/sub3/scale3/len3/norm3`, `distXZ`, easings, `approach`.

---

## 3. State (`state.js`)

`import { state, SCENE, PHASE, BASE_STATS, ... } from "../state.js";`

```
state = {
  scene, speed,
  run: { seed, mapSize, round, phase, timer, xp, tier, kills, startedAt,
         revealedCount, reprieveUsed, castleDown? } | null,
  resources: { gold, wood, iron, food },
  playerStats: { attackChance, attackDamage, critChance, harvestChance, harvestYield, clickCooldown },
  map: { size, seed, tiles:Map<key,tile>, revealed:Set<key>, castle:{col,row}, bounds },
  placed: [building], units: [unit], enemies: [enemy], projectiles: [], fx: [],
  hand: [card], draftOptions: [card], selection: [unitId],
  meta: { unlockedCards, renown, throneUpgrades, settings },
  records: { bestRound, totalRuns, totalKills, totalRenownEarned, last10 },
}
```

**Enums**: `SCENE = {MENU,CONFIG,RUN,DRAFT,OVER,CARDS,STATS,SETTINGS}`, `PHASE = {BUILD,ATTACK}`.
**Mutation helpers**: `setScene`, `setPhase`, `addResource(type,amt)`, `canAfford(cost)`, `spend(cost)`,
`newRun({seed,mapSize})`, `nextId(prefix)`. **Constants**: `BASE_STATS`, `BUILD_PHASE_SECONDS`, `HAND_CAP`, `SCHEMA_VERSION`.

---

## 4. Events (`util/events.js`)

`import { on, off, once, emit } from "../util/events.js";`

Canonical events (payload in parens):
`scene-changed({scene})`, `phase-changed({phase,round})`, `wave-incoming({round,plan})`,
`round-cleared({round})`, `tier-unlocked({tier})`, `hand-changed()`, `resource-changed({type,amount,total})`,
`unit-selected({ids})`, `castle-damaged({hp,maxHp})`, `enemy-killed({enemy})`, `card-played({card})`,
`tile-revealed({col,row})`, `game-over({round,kills})`. Listeners must not throw.

---

## 5. Frame registries

- **Logic systems** → `run.registerSystems({...})` (see §7). Called inside the phase machine.
- **Per-frame render/update** → `loop.onRender(fn)` and `loop.onUpdate(fn)` from `src/loop.js`.
  Render-sync code (mesh ↔ state) registers with `onRender((dt)=>{})`. fx/particles too.

---

## 6. Render base (`render/scene.js`)

`import { scene, layers, camera, renderer, cameraApi, pick, pickGround } from "../render/scene.js";`

- `layers = { ground, tiles, buildings, units, enemies, fx, fog }` — Three.Groups; attach meshes to the right one.
- `cameraApi = { centerOn(col,row), setTarget(x,z), panBy(dx,dy), zoomBy(d), rotateYaw(dir), state }`.
- `pick(event, {roots?}) -> { kind, id, object, point:{x,y,z}, tile:{col,row} } | null` — raycast; walks
  up parents to the nearest object with `userData.kind`.
- `pickGround(event) -> { point, tile } | null` — projects the pointer onto the y=0 plane.

### Picking tags (`userData`)
Every clickable mesh/group carries `userData = { kind, id }` where
`kind ∈ {'tile','unit','enemy','fog','building','ground'}` and `id` is the instance id from state
(`unit.id`, `enemy.id`, `building.id`, or `tileKey` for tiles/fog). Set this on the **top group** of an entity.

---

## 7. Logic system registry (`run.registerSystems`)

Wave 2 modules call `registerSystems({...})` to plug in. Expected members (all optional; defaults are no-ops):

```
tickEconomy(dt)            // buildings/economy.js  — idle resource ticks
updateUnits(dt)            // units/behavior.js
updateEnemies(dt)          // enemies/behavior.js
updateCombat(dt)           // combat/* — projectiles, effects
buildWave(round) -> plan   // enemies/spawner.js
startWave(plan)            // enemies/spawner.js
updateSpawner(dt) -> bool  // enemies/spawner.js — true when all spawned
applyUpkeep()              // units/upkeep.js — food consumption + desertion (round end)
rollDraft() -> card[]      // cards/draft.js — 3 options (or [])
roundPayout(round)         // payout: resources + XP
recomputeTier() -> tier    // tier from XP (T2 ~round 4, T3 ~round 8)
save()                     // persistence autosave hook
```

Run-machine API other modules may call: `startBuildPhase()`, `startAttackPhase()`,
`advanceToNextRound()`, `gameOver()`, `getCurrentWave()`.

---

## 8. Data schemas (catalogs)

- **Card** (`cards/catalog.js`): `{ id, name, type:'building'|'unit'|'upgrade'|'action', tier:1|2|3,
  rarity:'common'|'rare'|'epic'|'legendary', cost:{gold?,wood?,iron?,food?}, effect }`. `effect` is a
  declarative descriptor: buildings `{defId}`, units `{unitId}`, upgrades `{stat?,mult?,add?,target?}`,
  actions `{action, amount?, target?}`. Helpers: `getCard(id)`, `cardsAtOrBelowTier(tier)`.
- **Tile** (`world/tiles.js`): `{ type, buildable, walkable, clickYield, adjacency, color }`. `clickYield`
  is `null | {resource,amount,chance?} | weighted[]`. Enum `TILE`, table `TILE_TYPES`, `getTileType(type)`.
- **UnitDef** (`units/catalog.js`): `{ id, name, hp, damage, range, attackSpeed, moveSpeed, tags[], foodCost, color }`. `getUnitDef(id)`.
- **EnemyDef** (`enemies/catalog.js`): `{ id, name, hp, damage, range, attackSpeed, speed, traits[], reward, color }`. `getEnemyDef(id)`.

`hp` = number of low-poly figures in the group (HP is readable by counting standing figures).

---

## 9. Combat API (`combat/`) — code against these before they merge

```
// combat/damage.js
resolveHit(attacker, target) -> { dealt, killed:boolean, crit:boolean }
applyDamage(target, amount, { crit?, source? }) -> { dealt, killed }
// combat/clicker.js
resolveClick(target, playerStats) -> { type:'attack'|'harvest'|'crit'|'miss', amount, killed? }
// combat/effects.js
areaDamage(center:{x,z}, radius, amount, filter?) , heal(target, amt) , applyBuff(target, buff)
```

`attacker`/`target` are runtime instances (units/enemies/buildings) carrying at least
`{ id, hp, maxHp, pos:{x,y,z}, def }`. Combat decrements `hp`, sets `killed` when `hp<=0`, and emits
`enemy-killed` for enemy deaths. Figure-toppling is a **render** reaction to hp change (units/group.js + fx).

---

## 10. Runtime instance shapes (created by Wave 2; agreed here)

- **Building** (`state.placed[]`): `{ id, defId, col, row, pos, hp, maxHp, group?, cooldown? }`.
- **Unit** (`state.units[]`): `{ id, unitId, def, pos, target?, hp, maxHp, stance, order?, group? }`.
- **Enemy** (`state.enemies[]`): `{ id, enemyId, def, pos, path?, target?, hp, maxHp, group? }`.
  `group` is the Three.Object3D (set by render/units; logic never requires it to exist — guard with `?.`).

---

## 11. Verification expectations

- Pure-logic modules ship a `test/<area>.test.mjs` (node, deterministic asserts). Examples: same seed →
  identical map; expansion cost strictly increasing; crit triples damage; draft never includes locked
  cards; desertion removes lowest-tier first.
- Render/RTS/UI/audio ship a `__harness.html` exercising the module against a stub scene/state.
- Don't merge a branch until its own checks pass.

---

## 12. Ownership quick-reference (who writes what)

| Folder / file | Owner |
|---|---|
| `main.js`, `run.js`, `state.js`, `loop.js`, `persistence.js`, `render/scene.js`, `index.html`, `styles/*` (base) | Integrator (Stage 0 / wave boundaries) |
| `world/*` | W1-World |
| `combat/*` | W1-Combat |
| `render/meshes.js`, `render/fx.js` | W1-Render |
| `cards/catalog.js`, `units/catalog.js`, `enemies/catalog.js` (data) | W1-Catalogs |
| `audio/*` | W1-Audio |
| `cards/hand.js`, `cards/draft.js` | W2-Cards |
| `buildings/*` | W2-Buildings |
| `units/group.js`, `units/behavior.js`, `units/upkeep.js` | W2-Units |
| `enemies/spawner.js`, `enemies/behavior.js` | W2-Enemies |
| `rts/input.js`, `rts/selection.js`, `rts/commands.js` | W2-RTS |
| `ui/*`, `index.html` HUD markup, `styles/*` (components) | W3-UI (solo, Wave 3) |

---

## 13. Wave 1 module exports (locked signatures)

Implement exactly these names so integration glue and downstream waves resolve. Add private helpers
freely; keep the public surface as specified.

### `world/generate.js` (pure logic — no three/DOM)
- `generateMap(seed, size) -> map` — mutates and returns `state.map`. Fills `tiles:Map<key,tileInstance>`
  for a generous area, reveals the central `size×size` block, forces `castle` on the exact center tile
  (terrain normalized to grasslands), sets `bounds`. A tile instance is
  `{ col, row, type, ...getTileType(type) }` (spread the type def so callers read buildable/walkable/clickYield).
  Uses biome-weighted noise via `makeRng(seed)` so the same seed reproduces the same map.
- `tileAt(col,row) -> tileInstance | null` (reads `state.map.tiles`).
- `rollTileType(col, row, rng) -> typeString` — exported so `expand.js` reuses the same biome weighting.

### `world/expand.js` (pure logic)
- `expansionCost(revealedCount) -> number` — `Math.ceil(5 * revealedCount ** 1.15)`. Strictly increasing.
- `frontier() -> [{col,row,cost}]` — fog tiles 4-adjacent to a revealed tile.
- `canExpandTo(col,row) -> boolean` — is frontier & affordable (gold).
- `expandTo(col,row) -> boolean` — if valid: `spend({gold:cost})`, roll type, add to `tiles`/`revealed`,
  update `bounds` and `state.run.revealedCount`, `emit('tile-revealed',{col,row})`. Returns success.

### `world/pathfind.js` (pure logic)
- `isWalkable(col,row) -> boolean` — from the tile's `walkable` (unrevealed/missing = false).
- `findPath(start, goal) -> [{col,row}...] | null` — A*/BFS over revealed walkable tiles, 4-neighbour.
- `nearestWalkableToward(from, goal) -> {col,row}` — fallback step when no full path.

### `combat/damage.js` (pure logic) — see §9
- `applyDamage(target, amount, opts={}) -> { dealt, killed }`, `resolveHit(attacker, target) -> { dealt, killed, crit }`.

### `combat/clicker.js` (pure logic) — see §9
- `resolveClick(target, playerStats) -> { type, amount, killed? }`. For tiles: rolls harvest chance/yield →
  `addResource`. For enemies: rolls attack chance, crit (×3), `applyDamage`. Respects nothing about cooldown
  (caller enforces `clickCooldown`).

### `combat/effects.js` (pure logic)
- `areaDamage(center, radius, amount, filter?) -> hitCount`, `heal(target, amt)`, `applyBuff(target, buff)`.

### `render/meshes.js` (three) — builders return `THREE.Object3D` with correct `userData`
- `buildTileMesh(tile) -> Object3D` (`userData={kind:'tile', id:tileKey(col,row)}`, positioned via `tileToWorld`).
- `buildFogMesh(col,row) -> Object3D` (`kind:'fog'`).
- `buildBuildingMesh(defId, opts?) -> Object3D` (`kind:'building'`).
- `buildUnitGroup(unitDef, hp) -> Object3D` (`kind:'unit'`; a cluster of `hp` low-poly figures + center pole/flag;
  expose per-figure children so fx can topple them, e.g. `group.userData.figures = [meshes]`).
- `buildEnemyGroup(enemyDef, hp) -> Object3D` (`kind:'enemy'`; same figure-cluster pattern).
- `disposeMesh(obj)` — free geometry/material and detach.

### `render/fx.js` (three)
- `initFx()` — registers an `onRender` updater for particles/shake/floating-number lifetimes.
- `floatingNumber(worldPos, text, colorHex)`, `harvestPop(worldPos, resourceType)`,
  `toppleFigure(unitOrEnemyGroup, figureIndex)`, `placePop(group)`, `screenShake(amount)`.

### `cards/catalog.js`, `units/catalog.js`, `enemies/catalog.js` (pure data)
- Fill the full **v1** sets from prompt.md keyed by id (see DEV_PLAN §8 scope guard). Keep `getCard`/
  `cardsAtOrBelowTier`/`getUnitDef`/`getEnemyDef` working. Building cards' `effect.defId` and unit cards'
  `effect.unitId` must reference real ids. Also add **building defs** the economy/defense systems read:
  export `BUILDINGS` from `cards/catalog.js`? No — put building runtime defs in a new file
  `buildings/catalog.js`? That's Wave 2. For Wave 1, just ensure card `effect` descriptors are complete.

### `audio/sfx.js`, `audio/music.js` (WebAudio; synthesize tones, NO external asset files for v1)
- `sfx.js`: `initAudio()`, `playSfx(name)` for names `harvest|attack|crit|place|click|death|coin|klaxon`.
  Lazy-resume the AudioContext on first user gesture. Respect `state.meta.settings.sfxVolume`.
- `music.js`: `initMusic()`, `setMusicPhase('build'|'combat')` with a short crossfade. Respect `musicVolume`.
  Degrade gracefully (no throw) if WebAudio is unavailable.
