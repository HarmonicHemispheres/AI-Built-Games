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
- `tileExpansionCost(col,row,castle?) -> number` — `Math.ceil(EXPAND_GOLD_PER_TILE * chebyshev({col,row}, castle))`.
  Gold cost to reveal a tile, scaling LINEARLY with its Chebyshev distance from the starting castle (origin).
  Distance-based — not reveal-count-based — so nearby frontier stays cheap no matter how much you've expanded.
- `frontier() -> [{col,row,cost}]` — fog tiles 4-adjacent to a revealed tile, each with its own per-tile cost.
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

---

## 14. Wave 2 module exports + cross-module protocol (locked)

Wave 2 has real coupling. It is resolved with: (a) the **init pattern** — each module self-registers its
systems in an `init*()` the integrator calls; agents never edit `main.js`/`run.js`. (b) explicit **events**
for cards↔placement and placement↔RTS. (c) shared **logic constructors** so render stays decoupled from logic.

### Init pattern (every Wave 2 module)
Export an `init*()` that registers via `run.registerSystems({...})` and/or `loop.onUpdate/onRender`. The
integrator calls all inits once at Wave-2 wiring. **Logic** systems (move/attack/economy/upkeep/spawner)
register through `run.registerSystems` (run only during a run, gated by phase). **Render reconcilers** register
through `loop.onRender`.

### Unit / order protocol (shared by W2-Units and W2-RTS)
- Unit instance (extends §10): `{ id, unitId, def, pos:{x,y,z}, hp, maxHp, stance:'defensive', order:null|Order, attackCd:0, group?:null }`.
- `Order = {type:'move', tile:{col,row}} | {type:'attack', targetId} | {type:'attackMove', tile} | {type:'stop'}`.
- **W2-RTS** sets `unit.order` (and `state.selection`); never moves units directly.
- **W2-Units** `updateUnits(dt)` reads `unit.order`, moves via `findPath`, attacks via `combat.resolveHit`,
  clears `order` when complete, then falls back to stance (defensive = engage enemy within range, don't chase far).

### W2-Units — `units/group.js` (three), `units/behavior.js` (logic), `units/upkeep.js` (logic)
- `behavior.js` (LOGIC, node-testable, no three): `createUnit(unitId, col, row) -> unit` (builds the logic
  instance, pushes to `state.units`, `group:null`), `updateUnits(dt)`, `initUnitsLogic()` → `registerSystems({updateUnits})`.
- `group.js` (THREE): `syncEntities()` — the render reconciler for **both** `state.units` and `state.enemies`:
  for any instance with `group==null` build it (`buildUnitGroup`/`buildEnemyGroup`) and add to the right layer;
  position `group` at `instance.pos`; on hp drop topple figures (`fx.toppleFigure`); on removal `disposeMesh`.
  `initUnitsRender()` → `loop.onRender(syncEntities)`.
- `upkeep.js` (LOGIC): `applyUpkeep()` — sum living units' `def.foodCost`; if `state.resources.food` can't
  cover, desert lowest-tier-first until balanced; deduct food. `initUpkeep()` → `registerSystems({applyUpkeep})`.

### W2-Enemies — `enemies/behavior.js` (logic), `enemies/spawner.js` (logic) — NO three (render handled by group.js)
- `behavior.js`: `createEnemy(enemyId, col, row) -> enemy` (instance per §10, `group:null`, pushes to
  `state.enemies`), `updateEnemies(dt)` (path toward castle via `findPath`; attack buildings/units/castle in
  range via `combat`; **SAPPER** trait targets nearest building/wall first; RANGED keeps distance; on death
  `disposeMesh` is handled by render — logic just removes from `state.enemies` and drops `reward`),
  `initEnemiesLogic()` → `registerSystems({updateEnemies})`.
- `spawner.js`: `buildWave(round) -> {total, groups:[{enemyId,count}], edges:[...]}` (composition per
  prompt.md: early raiders/wolves; skirmisher/sapper enter ~r4; warlord forced on round===5; seeded by
  `makeRng(`${state.run.seed}:wave:${round}`)`), `startWave(plan)`, `updateSpawner(dt) -> bool` (spawns over
  time at random **revealed-edge** tiles via `createEnemy`, returns true when all spawned),
  `initSpawner()` → `registerSystems({buildWave, startWave, updateSpawner})`.

### W2-Buildings — `buildings/catalog.js` (data), `buildings/economy.js` (logic), `buildings/defense.js` (logic+fx), `buildings/place.js` (three)
- `catalog.js` (DATA): `BUILDINGS` keyed by defId, `getBuildingDef(defId)`. Fields:
  `{ id, name, kind:'castle'|'economy'|'defense'|'wall'|'spawner', hp, yields?:{res:perTick}, tickRate?,
  adjacency?:{hint:bonusMult}, attack?:{damage,range,attackSpeed}, spawns?:{unitId,interval,cap}, color }`.
  Must include a `castle` def (high hp) and every v1 building defId referenced by cards
  (lumber_camp, hamlet, wheat_field, militia_camp, watchtower, palisade, sawmill, mine, barracks, stone_wall, ballista_tower).
- `economy.js` (LOGIC): `tickEconomy(dt)` (accrue `yields` per `tickRate` with adjacency bonuses by reading
  neighbour tile `adjacency` hints; spawner buildings like militia_camp/barracks call `createUnit` from
  `units/behavior.js` on their interval, respecting `cap`), `placeBuilding(defId, col, row) -> building`
  (LOGIC: validate buildable+empty, create instance into `state.placed`, normalize forest→grass under it),
  `initEconomy()` → `registerSystems({tickEconomy})`.
- `defense.js` (LOGIC+fx): `updateDefense(dt)` — each `kind:'defense'` building fires hitscan at nearest enemy
  in range on cooldown (`combat.applyDamage` + `fx` bolt/`screenShake` allowed), `initDefense()` →
  `registerSystems({updateCombat: updateDefense})`. Also handle building death: hp<=0 removes from `state.placed`;
  if the destroyed building is the castle, set `state.run.castleDown = true` (run.js triggers game over; a
  standing `keep` would reprieve — keep is v2, ignore).
- `place.js` (THREE): ghost-preview placement. Listens `placement-begin({cardId})`: enter ghost mode, follow
  `pickGround` hover, show validity tint; on valid click → `economy.placeBuilding`, `spend(card.cost)`, remove
  card from hand (`hand.consume(cardId)`), `fx.placePop`, `playSfx('place')`, `emit('card-played',{card})`,
  `emit('placement-end')`; on right-click/Esc → `emit('placement-end')` no spend. Also the **building mesh
  reconciler** via `loop.onRender`: build meshes for new `state.placed` entries lacking `group`, remove meshes
  for destroyed ones. `initPlacement()` wires listeners + reconciler.

### W2-Cards — `cards/hand.js` (logic), `cards/draft.js` (logic)
- `hand.js`: `drawStarting()` (5 tier-1 cards into hand), `draw(n)`, `consume(cardId)` (remove one from hand,
  `emit('hand-changed')`), `playCard(cardId) -> {pending?:bool}`: if `canAfford` fails → no-op; if card.type
  ==='building' → `emit('placement-begin',{cardId})`, return `{pending:true}` (place.js finishes it); else
  resolve now — unit→`createUnit` near castle + `spend` + `consume`; upgrade→apply to `state.playerStats` or
  run upgrades + `spend` + `consume`; action→effect (`gain`/`healAll`/`areaDamage`) + `spend` + `consume`; then
  `emit('card-played')`. `initHand()` if any per-frame need (likely none).
- `draft.js`: `rollDraft() -> card[3]` from the unlocked pool [all tier-1 cards ∪ `state.meta.unlockedCards`]
  filtered `tier<=state.run.tier`, seeded by `makeRng(`${state.run.seed}:draft:${state.run.round}`)`;
  `chooseDraft(cardId)` → add to hand (respect `HAND_CAP`), if new add to `state.meta.unlockedCards`
  (permanent unlock), then `advanceToNextRound()`. `initDraft()` → `registerSystems({rollDraft})`.

### W2-RTS — `rts/input.js`, `rts/selection.js`, `rts/commands.js` (three: uses `pick`/`pickGround`)
- `input.js`: pointer/keys → routes via `scene.pick`. LEFT-click: tile/enemy → `combat.resolveClick`
  (respect `state.playerStats.clickCooldown`; `fx`/`playSfx` on result), unit → select. Box-drag → box-select.
  RIGHT-click: issue order to selection (`commands.move`/`attack` based on `pick.kind`). Keys: `A` attack-move,
  `S` stop. Suppress selection/click while a placement is active (track via `placement-begin`/`placement-end`).
  `initInput(canvas)` attaches listeners.
- `selection.js`: `select(ids)`, `addToSelection`, `boxSelect(rectWorld)`, `clearSelection`, manage
  `state.selection`, `emit('unit-selected',{ids})`.
- `commands.js`: `move(ids, tile)`, `attack(ids, targetId)`, `attackMove(ids, tile)`, `stop(ids)` — set each
  unit's `order` per the protocol above.

### Cross-module decoupling (IMPORTANT — read before coding)
A Wave-2 agent's worktree contains ONLY its own new files + everything merged through Wave 1. It does
**NOT** contain sibling Wave-2 files. Therefore: **a module may only `import` from (a) Wave-1/Stage-0
merged files, or (b) its OWN sibling files.** All cross-Wave-2 coupling goes through the event bus, never
imports. Canonical Wave-2 events:
- `spawn-unit {unitId, col, row}` — emitted by `buildings/economy.js` (militia_camp/barracks) and
  `cards/hand.js` (unit card). **`units/behavior.js` listens** (in `initUnitsLogic`) and calls `createUnit`.
  (So economy/hand do NOT import units.)
- `placement-begin {cardId}` / `placement-end` — cards↔placement↔RTS handshake (place.js shows ghost; RTS
  suppresses selection between begin and end).
- `hand-consume {cardId}` — emitted by `place.js` after a successful building placement; **`cards/hand.js`
  listens** and removes the card. (place.js does `spend(getCard(cardId).cost)` itself using Wave-1 imports,
  then `economy.placeBuilding(...)` (its own sibling), then emits `hand-consume` + `card-played`.)
- `combat-hit {x, z, amount, crit}` — emitted by any logic damage-dealer (`defense.js`, optionally
  units/enemies behavior). The **integrator** wires `on('combat-hit', …)` → `fx.floatingNumber`. This keeps
  `defense.js` PURE (no `fx`/three import) and node-testable.

Consequence: `buildings/defense.js`, `cards/hand.js`, `cards/draft.js`, `buildings/economy.js`,
`units/behavior.js`, `units/upkeep.js`, `enemies/behavior.js`, `enemies/spawner.js`, `rts/commands.js`,
`rts/selection.js` are all PURE-LOGIC (no three/DOM) and must be node-tested. Only `units/group.js`,
`buildings/place.js`, `rts/input.js` touch three (harness-only). `rts/selection.boxSelect(worldRect)` takes a
world-space rect (computed by `input.js` via `pickGround` at the drag corners) so selection stays pure.

### Integrator owns (Wave-2 wiring, NOT agents)
`roundPayout(round)` (resources scaled by round + `xp`), `recomputeTier()` (round≥4 ⇒ tier 2 for v1),
creating the **castle** logic instance in `state.placed` at run start, calling every `init*()`,
`drawStarting()` at run start, and `on('combat-hit', …) → fx.floatingNumber`. `state.run.castleDown`
handling is already in run.js. **Done in Stage-2 integration** (`main.js` + `app.js`): all of the above,
plus the `app.js` run-flow controller. **Fog-of-war expansion clicks + tile-revealed mesh refresh are also
integrator-owned** (Wave-3 integration), NOT the UI agent.

---

## 15. Wave 3 — UI (solo agent: `W3-UI`)

One agent owns ALL of: `index.html` HUD/menu markup (fill the existing mount points), `styles/main.css`
(append component styles below the marked line), `styles/theme.css` (tokens only), and `src/ui/*`. No other
agent runs concurrently. Do NOT edit any `src/` file outside `src/ui/`, nor any central file.

### The app/control API the UI calls (already on `main`)
- `app.js`: `startRun({mapSize, seed})`, `returnToMenu()`, `setSpeed(n)`.
- `run.js`: `startAttackPhase()` (the DEFEND button).
- `cards/hand.js`: `playCard(cardId)` (building cards trigger ghost placement via place.js automatically).
- `cards/draft.js`: `chooseDraft(cardId)`.
- `cards/catalog.js`: `CARDS`, `getCard` (for the collection screen).
- `persistence.js`: `saveMeta()`, `wipeSave()`.
- `state.js`: `state`, `SCENE`, `PHASE`, `on`, `emit`, `HAND_CAP`. `loop.js`: `onRender`.

### Scene visibility is already handled
`main.js` toggles `#menu-scene/#config-scene/#draft-scene/#result-scene/#cards-scene/#stats-scene/
#settings-scene` and `#game-hud` based on `state.scene` (via `scene-changed`). The UI just FILLS those
containers and wires buttons; it must change scenes by calling `app.*`/`setScene` or by emitting events that
flip `state.scene` (e.g. menu PLAY → `setScene(SCENE.CONFIG)`; START → `app.startRun(...)`).

### `src/ui/index.js`
- Export `initUI()` that calls `initHud()`, `initMenu()`, `initCards()`, `initOverlays()`. The integrator calls
  `initUI()` once in `main.js`. (This is the single entry point — keep the name exact.)

### `src/ui/hud.js` — `initHud()`
- Top bar (`#top-bar`): the four resources (gold/wood/iron/food) with per-round delta, round #, XP/tier meter,
  seed (mono), build-phase timer. Castle HP banner (read `state.placed.find(b=>b.defId==='castle')` hp/maxHp;
  pulse red when low). Refresh via `loop.onRender` (cheap DOM writes; only touch nodes whose value changed).
- Bottom bar (`#bottom-bar`): hand container (delegate rendering to cards_ui), the **DEFEND** button
  (`onclick → startAttackPhase()`, only meaningful in BUILD phase), and speed buttons 1×/2×/3× (`→ setSpeed`).
- Selected-unit panel (`#selected-panel`): on `unit-selected`, show the first selected unit's name + figure-count
  HP + damage/range; hide when selection empty.

### `src/ui/cards_ui.js` — `initCards()`
- Render `state.hand` into the bottom-bar hand container on `hand-changed` (and once at run start). Each card
  shows name/type/cost; click (or drag onto the board) → `playCard(card.id)`. Dim/disable cards the player
  can't afford (compare `state.resources`).
- Draft screen (`#draft-scene`): on `scene-changed` to `SCENE.DRAFT`, render `state.draftOptions` as choosable
  cards; click → `chooseDraft(card.id)`.

### `src/ui/menu.js` — `initMenu()`
- Main menu (`#menu-scene`): title + PLAY / CARDS / STATS / SETTINGS. PLAY → `setScene(SCENE.CONFIG)`.
- Config (`#config-scene`): map size (3/4/5) + optional seed input; START → `app.startRun({mapSize, seed})`;
  BACK → `setScene(SCENE.MENU)`.
- Cards collection (`#cards-scene`): show all `CARDS` — unlocked (in `state.meta.unlockedCards` or tier 1) in
  full, locked as silhouettes. BACK → menu.
- Stats (`#stats-scene`): `state.records` (best round, total runs, kills, renown). BACK → menu.
- Settings (`#settings-scene`): sfx/music volume sliders → write `state.meta.settings` + `saveMeta()`; WIPE SAVE
  → `wipeSave()` then reload/refresh menu. BACK → menu.

### `src/ui/overlays.js` — `initOverlays()`
- `#overlay-root`: WAVE INCOMING banner on `wave-incoming`; tier-unlock toast on `tier-unlocked`.
- Result screen (`#result-scene`): on `game-over` show rounds survived + kills (from payload + `state.records`);
  MAIN MENU button → `app.returnToMenu()`.

### Verify
- `node --check` every `src/ui/*.js` file (must pass). Confirm every imported symbol resolves to a real export
  in the merged tree (grep the source modules). The UI is DOM+three-adjacent so it can't be node-unit-tested;
  do a careful self-review against this section and ensure `initUI()` and all button handlers reference only
  the documented APIs. Optionally add `ui_harness.html` notes, but the real smoke is the integrated `index.html`.
