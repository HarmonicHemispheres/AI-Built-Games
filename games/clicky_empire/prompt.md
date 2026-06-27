# Overview
In Clicky Empire you play as a brave lord who decides to settle a new land and grow their empire. It blends three loops: the **clicker** loop (tap resource tiles to harvest), the **city-management** loop (spend resources to place buildings and raise an economy), and the **roguelite** loop (survive escalating attack rounds, draft cards, unlock new ones permanently between runs). The single rule that ties it together: protect your **castle**. If it falls, the run ends. Enemies are fought by your **army**, not your cursor — click resolves to harvesting and selection, never combat damage.

# Tech & Rendering
- **Stack:** browser-based, **no build step**. Vanilla HTML / CSS / JS as ES modules, loaded directly via `index.html`. Matches the repo convention (see `undead_defense`).
- **3D:** rendered with **Three.js** loaded via CDN + `importmap` (no bundler). Low-poly meshes, flat/toon-ish materials, a single directional "sun" light + soft ambient. Target the look of `unit_style.png`: saturated grass-green ground, chunky low-poly props, banner-topped unit groups.
- **Camera:** fixed-pitch **top-down isometric orbit camera** (roughly 35–45° down-angle). Pan with WASD / edge-scroll / middle-drag, zoom with the wheel, and snap-rotate the yaw in 90° steps (Q / E) so the iso framing always reads cleanly.
- **Picking:** clicks are resolved with a Three.js **raycaster** against tile meshes, unit groups, and enemy groups. Every clickable carries a small userData tag (`{kind: 'tile'|'unit'|'enemy'|'fog', id}`) so the input layer can route the click without per-object handlers.
- **Performance:** use **InstancedMesh** for repeated geometry (grass tiles, trees, the little troop figures inside a unit group, enemy mobs). Keep the world to a few thousand instances; pool and recycle rather than allocating per frame.

# Game Style
- genres: clicker, rogue lite, city management
- styles: top-down isometric low poly (Three.js), bright and toy-like
- map gen: procedural / random, seed-based and shareable
- session shape: short, replayable runs ("settle, defend, expand until the castle falls")

# Gameloop
- user starts on the **main menu**: PLAY, CARDS, STATS, SETTINGS.
- user clicks PLAY and gets a **pregame config form**:
  - starting map size (5x5, 9x9, 12x12 tiles)
  - (optional) a seed field — blank rolls a random seed; the seed is always shown on the HUD so runs are shareable / repeatable.
- the **run starts**: the player sees the tiles of their starting map; everything beyond is covered in clouds (a fog-of-war effect).
- player starts with **no resources** and randomly draws **5 tier-1 cards** (units / upgrades / actions only — **buildings are never drawn or drafted**; they're constructed from the tier-gated **build menu**). cards can be played whenever the player can afford them. the player **ALWAYS** starts with the **castle already placed at the map center** — if this castle is ever destroyed, they lose the game.
- the loop alternates between two phases, separated by a timer:
  - **BUILD PHASE** (round timer counts down, default ~120s — long enough that the opening round is winnable): gather resources (click tiles + idle buildings), open the **build menu** to construct any unlocked building you can afford, play cards (units / upgrades / actions) to round out economy/defense, position units, and spend gold to expand the map into the fog. a **"DEFEND" button** lets the player end the build phase early when ready.
  - **ATTACK PHASE**: when the round timer runs out (or DEFEND is pressed), a semi-random number of enemy units spawn at random edges of the *visible* map and make their way toward the center (the castle), stopping to attack buildings and units along the way until destroyed. the player keeps clicking and microing units throughout.
- after the attack round ends, the **timer resets** and the player gains: leftover resources persist, a **resource payout**, **XP** (helps to unlock the next tier of cards), and a **draft of 3 new cards** out of all unlocked cards.
- the player's goal is to **survive as many attack rounds as possible**. each round the wave gets larger / meaner (see [Rounds & Progression]).

# Game Rules
- **units** : controlled RTS-style by the player. each unit is a multi-figure group with a single pole and flag in the center. when the unit takes a hit, one of the individual minimal low-poly troops falls over — the **number of standing figures = the unit's current health**. (full detail in [Units & Combat].)
- **map expansion (fog of war)** : edge-of-map fog tiles can be hovered (shows their cost) and **purchased** by the player to create an ever-expanding map. expanding the map costs **gold**, and the cost of a given fog tile scales **linearly with how many tiles it sits from your starting castle** — nearby frontier stays cheap no matter how much you've already revealed, while pushing far out toward a gem vein costs proportionally more (see [Map Generation]).
- **clicking** : the player can click on **resource tiles** to harvest them. the cursor is a **tool, not a weapon** — clicking an enemy does nothing; enemies are killed by your units (right-click to order an attack). click stats:
  - **harvest chance** : % : chance a click harvests a resource from a resource tile. *start: 60%*
  - **harvest yield** : number : amount gained per successful harvest. *start: 1*
  - **click cooldown** : ms : minimum time between counted clicks (pacing / anti-spam). *start: 120ms*
  - *(legacy combat click stats — attack chance / attack damage / crit chance — still exist in player stats and on the relevant upgrade cards, but no longer affect the cursor now that clicking deals no damage.)*
- these clicker stats scale through **Upgrade cards** and **meta-progression**, and are shown on the STATS screen. the cursor harvests; your **army** does the fighting.

# Resource Types
Each resource is earned **idly** (from buildings, each build-phase tick) and **actively** (by clicking the matching tile). Stored per-run; carries between rounds.
- **gold** : earn from hamlets / villages / cities (collect rent — upgrade them for more) or clicking on **ore veins**. the universal currency — pays for most cards and **all map expansion**.
- **wood** : earn from lumber camps / sawmills or clicking on **forest**. the early-game backbone of buildings and walls.
- **iron** : earn from mines or clicking on **ore veins**. gates mid/late military buildings and heavy units.
- **food** : earn from farms or clicking on **berry patches / farms**. food is what your empire **runs an army on**: it pays **upkeep** (every active unit eats food each round; run out and units start to desert — see [Units & Combat]) *and* it **fuels unit production** — playing a Unit card costs food, and every spawner building (militia camp, barracks, archery range) spends food each time it trains a unit (a starved spawner stalls until you have food again). No food, no army.
- **(meta) renown** : earned at the *end* of a run, not during it. spent in the menu's Throne Room (see [Meta-Progression]).

# Tile Types
Each tile has: whether it's **buildable**, whether it's **walkable** (for units/enemies), and what it yields **on click**. Some buildings get an **adjacency bonus** when placed on/next to a matching tile.
- **grasslands** — buildable, walkable. no click yield. the default canvas; farms thrive here.
- **forest** — buildable (clears to grass when built on), walkable. click → **wood**. lumber camps love adjacency.
- **water** — not buildable, **not walkable** (blocks pathing). click → nothing. shapes the map's natural chokepoints.
- **mountain** — not buildable, not walkable. backdrop and chokepoint. mines get an adjacency bonus next to it.
- **ore vein** — buildable, walkable. click → **gold or iron** (50/50). mines placed here yield iron faster.
- **gem vein** — buildable, walkable, **rare**. click → **gold (big)** and occasionally a chunk of **renown**. high-value tile worth defending / expanding toward.
- **berry patches** — buildable, walkable. click → **food**. farms / granaries get an adjacency bonus here.
- **desert** — buildable, walkable, **−25% building yields**. cheap to expand into but economically weak.
- **marsh / swamp** — buildable (penalty), walkable but **slows movement** (units *and* enemies move ~40% slower). natural defensive terrain.

# Map Generation & Fog of War
- **grid-based**, generated from the run **seed**. the starting NxN block (player's pick) is revealed; an "infinite" expanse of fog tiles surrounds it.
- **realistic layout:** the world is built to read like a real landscape rather than scattered blobs:
  - **rivers** are the gradient-normalized **contour of a domain-warped noise field** — a handful of long, winding water channels with natural **bends/meanders** (a roughly constant ~1-tile width, so they don't balloon into lakes on flat ground). a river will even cut a gorge/pass straight through a mountain range, making a natural chokepoint.
  - **mountain ranges** form along the high cores of an elevation field (linked into ridge-like ranges, not random peaks); **lakes** are rare standing water where it's very wet and very low.
  - **forests** grow as connected stands where moisture is moderately high; **fields** are the open grass plains that fill the rest.
  - **farmland** (berry patches) clusters on the fertile **riverbanks** (floodplains) and in lush lowland; **ore veins** scatter in the rocky foothills near the ranges. these resource tiles are rarer scatter, weighted a touch richer toward the frontier so expanding is risk/reward.
  - everything is a **pure function of (tile, seed)** and order-independent, so fog expansion reveals tiles seamlessly continuous with initial generation.
- the **castle** is forced onto the exact center tile at run start, and a small **3×3 clearing** around it is normalized to grasslands so the start is always on fair, buildable/walkable ground (rivers and ranges are left intact just outside it).
- **expansion (fog of war):** any fog tile **adjacent to a revealed tile** can be hovered (shows its gold cost) and **purchased** to reveal it.
  - **cost scaling:** a fog tile's gold cost scales **linearly with its distance from the starting castle** (Chebyshev / king-move rings) — `ceil(EXPAND_GOLD_PER_TILE × ringsFromCastle)`. Distance, not how many tiles you've already bought, sets the price, so the frontier nearest home stays cheap (a 5×5 start's first ring sits 3 tiles from center → `2 × 3 = 6` gold) no matter how much you've expanded elsewhere, while reaching toward a distant gem vein costs proportionally more. revealing far out is a deliberate risk/reward push.
  - a newly revealed tile's type is rolled from the biome weighting for its position. revealing **enlarges the perimeter enemies can spawn from**, so expansion is a tradeoff: more economy and room, but a longer wall to defend.

# Cards
Every card has: **name**, **type** (Building / Unit / Upgrade / Action), **tier** (1–3), **rarity** (common / rare / epic / legendary), **cost** (a mix of gold/wood/iron/food), and an **effect**. Units are *placed*; Upgrades are *permanent for the run*; Actions are *one-shot* and discarded. Drafting a Unit / Upgrade / Action you've **never seen before permanently unlocks it** for future runs (see [Meta-Progression]).

**Buildings are NOT part of the random card system.** Instead they're constructed from a dedicated **build menu** (a BUILD button on the bottom bar): it lists every building **unlocked by your current tier**, and you can build any of them the moment you can afford the resources — no draw / draft / luck involved. Picking a building starts the same ghost-placement flow (pick a buildable tile, pay the cost, place). This keeps the random draws focused on the consumable / persistent effects (units, upgrades, actions) while your economy and defenses are a deliberate, always-available choice gated only by tier and resources.

Hand & draft rules (Units / Upgrades / Actions only):
- start of run: draw **5 tier-1 cards** (no buildings). hand cap **7**.
- end of each round: draft **3 cards** from the pool of *unlocked* non-building cards at or below your current tier (XP-gated).
- buildings are gated purely by tier: reaching a new tier adds that tier's buildings to the build menu.

## Tier 1 - starting

### Buildings
- **lumber camp** : cost 20 wood. slowly yields wood each tick (+50% if adjacent to forest). **must be built on/next to a forest tile.**
- **hamlet** : cost 30 wood. slowly yields gold (rent). also raises the run's **unit food cap** slightly.
- **wheat field** : cost 15 wood, 10 gold. slowly yields food (+50% on grass / berry).
- **militia camp** : cost 25 wood, 15 gold. trains a **militia** unit on a timer (each costs **food** to raise), up to **2 living militia per camp** — each camp keeps its OWN count (build more camps for more militia). its floating **production bar is segmented** (one slot per cap) — filled slots = that camp's living militia, the next slot fills toward the one in training; at cap the bar stops, and it refills the instant one of its militia dies (provided you have food).
- **watchtower** : cost 30 wood, 10 iron. defensive building — auto-fires at the nearest enemy in short range for low damage. has HP; can be targeted.
- **palisade** : cost 10 wood. a 1-tile wall segment. blocks / forces re-route for enemies; low HP, no attack.

### Upgrades
- **sharpened tools** : common. +1 harvest yield (clicks gather more).
- **keen eye** : common. +15% harvest chance.
- **war drums** : common. +15% attack chance on clicks.

### Action Cards
- **supply wagon** : earn 25 wood.
- **tax collection** : earn 25 gold.
- **forage run** : earn 25 food.

### Units
- **militia** : cost 10 food. basic melee group, low HP, low damage. the starter body that buys you time. (also spawned free by militia camp.)

## Tier 2 — unlocks at tier 2 (~round 4)

### Buildings
- **sawmill** : rare. cost 40 wood, 20 iron. big wood yield; counts forest adjacency double. **must be built on/next to a forest tile.**
- **village** : rare. cost 65 wood, 35 gold. strong gold yield (~3× a hamlet). a **hamlet upgrades into it in place** (or build one fresh from the menu). *(BUILT.)*
- **market** : rare. cost 50 gold, 20 wood. strong gold yield; once per build phase you may **trade** one resource for another at a poor rate. *(deferred — needs a trade UI.)*
- **mine** : rare. cost 30 wood, 30 iron. yields iron each tick (+100% adjacent to mountain or on an ore vein). **must be built on/next to an ore vein.**
- **granary** : common. cost 30 wood. boosts nearby farm food and **raises hand cap by 2** (lets you bank cards). *(deferred.)*
- **barracks** : rare. cost 50 wood, 40 iron. periodically spawns a **spearman**; cheaper unit food cost while it stands.
- **archery range** : rare. cost 45 wood, 25 iron. periodically trains a free **archer band** (the reliable way to field archers). *(BUILT.)*
- **stone wall** : rare. cost 20 wood, 30 iron. high-HP wall segment, upgrade over palisade.
- **ballista tower** : epic. cost 40 wood, 50 iron. long-range tower firing piercing bolts (line AOE), slow fire rate.

### Upgrades
- **masonry** : rare. +50% HP to all walls / towers.
- **fletching** : rare. +25% damage and +1 range to all ranged units / towers.
- **forced march** : common. +20% unit move speed.
- **bountiful harvest** : rare. +30% to all idle building yields.

### Action Cards
- **rally** : heal all living units to full.
- **volley** : deal medium damage to all enemies in a chosen tile radius.
- **gold rush** : earn 100 gold.

### Units
- **spearman** : rare. cost 15 food. medium HP, anti-charge (bonus damage vs fast enemies). holds a line.
- **archer band** : rare. cost 15 food, 10 wood. ranged group, low HP, good damage; fragile if reached.
- **knight** : epic. cost 25 food, 15 iron. heavy melee, high HP and damage; the wall you *want* in front.

## Tier 3 — unlocks at tier 3 (~round 8)

### Buildings
- **city** : epic. cost 130 wood, 90 gold. the top gold tier (a **village upgrades into it** in place, or build fresh from the menu). *(BUILT.)*
- **keep** : epic. cost 100 wood, 80 iron. secondary stronghold, high HP + strong auto-attack. *(BUILT — the one-time castle-fall reprieve is still deferred; for now it's a powerful defensive keep.)*
- **wizard tower** : epic. cost 80 iron, 60 gold. long-range, slow, heavy-hitting arcane tower. *(BUILT — the true AOE "fireball" is approximated by big single-target damage for now.)*
- **castle wall** : epic. cost 40 wood, 60 iron. the toughest wall. *(BUILT.)*
- **cathedral** : epic. cost 120 gold, 60 iron. pulses healing to nearby units and grants a small attack-chance buff to clicks in its radius. *(deferred — needs a heal-pulse system.)*
- **foundry** : rare. cost 60 iron, 40 wood. consumes iron to grant a run-wide **+damage to all units** while it stands. *(deferred — needs a global-buff system.)*

### Upgrades
- **royal decree** : epic. +50% to ALL resource yields (idle and click).
- **enchanted arms** : epic. +30% damage to ALL units.
- **fortification** : epic. +50% HP to ALL buildings (castle included).
- **master tactician** : rare. draft 4 cards instead of 3 each round.

### Action Cards
- **meteor** : huge AOE damage at a chosen point.
- **reinforcements** : instantly spawn a free squad (2 spearmen + 1 knight).
- **divine intervention** : shield the castle from all damage for one full attack phase.

### Units
- **cavalry** : epic. cost 30 food, 20 iron. fast heavy melee; great for chasing ranged enemies and flanking.
- **catapult** : epic. cost 35 food, 30 iron. slow siege unit; lobbed AOE, devastating vs clusters, weak vs fast singles.
- **paladin** : legendary. cost 40 food, 40 iron. elite melee with a self-heal and a brief party shield aura. one per run cap.

# Units & Combat
- **unit = a group, not an individual.** each unit is a cluster of minimal low-poly troops gathered around a single pole-and-flag in the center (see `unit_style.png`). the **number of standing figures = the unit's current HP**. on a hit, one figure topples; when all are down the unit is destroyed and the flag falls. HP is readable at a glance with zero UI.
- **stats per unit / tower:** HP (figure count), damage, range, attack speed, move speed, and tags (MELEE / RANGED / SIEGE / CHARGE / SUPPORT). cards and enemies reference these tags.
- **food upkeep:** at each round's payout, total living units consume **food** equal to their upkeep. if food can't cover it, units **desert** (lowest-tier first) until the books balance — economy and army are coupled, so over-recruiting has a cost.
- **defensive buildings** (watchtower, ballista, wizard tower, cathedral, keep) auto-engage without micro; the **castle** itself has wall archers that auto-fire at the nearest enemy in range (starting at damage 1, scalable). **units** are RTS-controlled but also auto-engage anything in range when idle (defensive stance default); a selected unit shows a ring on the ground beneath it.

# Enemies
Enemies spawn at **random visible-map edges** each attack phase and path toward the **castle** at center, stopping to attack any building / unit / wall in the way. each enemy is also a low-poly group (figure count = HP). stats: HP, damage, speed, traits (MELEE / RANGED / FAST / ARMORED / SAPPER / SUPPORT / ELITE / BOSS).
- **raider** — basic melee. low HP, medium speed. the workhorse of every wave.
- **wolf** — FAST. very low HP, very fast; tries to slip past walls to the castle. punishes gaps.
- **brute** — high HP, slow, heavy hits. soaks tower fire; a wall-breaker if ignored.
- **skirmisher** — RANGED. low HP, hangs back and plinks your units / buildings.
- **sapper** — targets **buildings / walls first**, ignores your units when possible. the reason you can't turtle behind walls forever.
- **shaman** — SUPPORT. heals / speeds nearby enemies; high-priority kill (great click target).
- **warlord** — ELITE mini-boss. appears on milestone rounds (every ~5). high HP, buffs the wave, drops bonus gold + renown.
- **dragon** — BOSS. periodic finale enemy (e.g., round 10, 20…). flies (ignores walls / terrain), AOE breath, threatens the castle directly. scales each appearance.

Wave composition shifts by round: early rounds are raiders / wolves; skirmishers and sappers enter ~round 4; brutes and shamans ~round 6; warlords on milestones; dragons on finales.

# Rounds & Progression
- **wave scaling:** enemy count and difficulty rise with round number — roughly `enemies = base + round × k`, with per-enemy HP/damage given a gentle multiplier (`1 + 0.08 × round`). composition shifts as above.
- **round payout (on attack-phase clear):** resource bonus (scaled by round), **XP**, and a **3-card draft**. bonus gold / renown for elites and bosses.
- **XP & tiers:** XP accrues from surviving rounds and kills. crossing thresholds unlocks the next **card tier** for drafts and your hand: Tier 2 ~round 4, Tier 3 ~round 8.
- **escalation knobs per round:** number of spawn edges, wave size, enemy HP/damage multiplier, and chance of an elite. milestone rounds (×5) force a warlord; finale rounds (×10) force a dragon.
- **loss:** the **castle** is destroyed → run ends, score = rounds survived (+ bonuses). a standing **keep** grants a one-time reprieve.

# Meta-Progression (Between Runs)
The roguelite spine — progress that outlives a single run.
- **renown** (meta currency) is earned at run end, scaled by rounds survived + elites/bosses killed + gems mined.
- **card unlocks:** any card you **draft for the first time** during a run is permanently added to your collection and can appear in future drafts. fresh runs always include the unlocked tier-1 pool.
- **Throne Room** (menu screen) spends renown on permanent, run-spanning boosts:
  - unlock new **starter cards** (seed them into future tier-1 draws).
  - small permanent bumps to **base player stats** (attack/harvest chance, starting resources).
  - QoL: +1 starting hand size, start with a free lumber camp, reveal a slightly larger starting map, etc.
- **STATS / CARDS menu screens:** STATS shows lifetime records (best round, total kills, runs, renown). CARDS is a collection viewer — unlocked cards shown in full, locked ones as silhouettes.

# HUD / UI
- **top bar:** the four resources (gold / wood / iron / food), each with an **icon** and a per-round delta, current **round #**, **XP/tier** meter, **seed**, and the **round timer** (build-phase countdown). resource amounts are shown as **whole numbers** (floored) even though they accrue fractionally.
- **castle health:** prominent banner near the castle and mirrored in the top bar; pulses red when low.
- **bottom bar:** **hand of cards** (units / upgrades / actions — drag/click to play), the **BUILD** button (opens the tier-gated build menu of available buildings), the **DEFEND** (end-build-early) button, and **speed** buttons (1×/2×/3×).
- **right side:** collapsible **minimap** (revealed tiles, units, incoming enemies, spawn edges) + a **selected-unit panel** (figure-count HP bar, damage, range, stance toggle).
- **floating / juice:** "+N" resource pops on harvest, white damage numbers (gold on crit) on enemies, flying arrow projectiles from towers/castle to their targets, a "WAVE INCOMING" banner on the build→attack transition, a kill/streak counter, and toppling figures as the readable HP system.
- **selection + hover:** a selected unit shows a ring beneath it; **shift-click** (or shift-drag) adds units to the current selection. Idling the pointer over a tile shows a small tooltip naming it (and what it does), plus any **buildings and units** standing on that tile.

# Persistence / Local Storage
State saved to `localStorage` under key **`clicky_empire_save_v1`**.
- **meta**
  - `unlocked_cards: string[]` (every card id ever drafted)
  - `renown: number` (spendable in Throne Room)
  - `throne_upgrades: string[]` (purchased permanent boosts)
  - `settings: { sfx_volume, music_volume, screen_shake, camera_invert, color_blind_mode }`
- **records**
  - `best_round`, `total_runs`, `total_kills`, `total_renown_earned`, `last_10_runs: [{ seed, rounds_survived, score, duration }]`
- **current_run** (resumable mid-run): `seed, map_size, revealed_tiles, board_state, hand, resources, xp, tier, round, player_stats, run_upgrades`. autosaved at the start of each build phase and on round end.
- **versioning:** include `schema_version`; on mismatch, migrate or wipe-with-confirm.

# Visual & Audio Direction
- **vibe:** bright, toy-like medieval diorama. saturated grass-green ground, soft shadows, chunky low-poly props. readable silhouettes; the d20-banner unit aesthetic from `unit_style.png`.
- **palette:** grass-green base, with biome accents (sandy desert, murky marsh, grey-blue mountain, deep blue water). player units in blue/silver; enemies in a contrasting warm/red palette for instant friend-vs-foe reads.
- **animation:** each unit is a **Total-War-style block** of many small soldiers (militia 6, spearman 9, archer band 12) standing on the tile surface behind a tall banner, and they **hop** when they land an attack; the block **thins** as the unit loses HP — soldiers **topple** out in proportion to remaining health (cosmetic roster size is independent of the unit's HP); buildings rise with a little scale-pop when placed; fog tiles dissolve/lift like clouds when purchased; harvested tiles do a quick squash-and-bounce.
- **living world:** forest **trees sway** in the wind (each conifer leans on a slow, phase-offset sine, rooted at the trunk) and **water flows** — a shader-displaced water surface undulates as one continuous, drifting sheet so the sun and reflections shimmer across it. Both are render-only ambient motion (no gameplay cost), advanced by a single `render/ambient.js` updater.
- **card art:** building and unit cards show a **live, slowly-turning 3D model** of the actual low-poly mesh (rendered by a shared offscreen renderer and blitted to each card) rather than a flat icon; upgrade/action cards keep a vector glyph.
- **producer progress bars:** every building that produces on a timer (economy yields / spawner units) carries a small **billboarded progress bar** above it that fills toward its next payout, so the player can read production at a glance.
- **camera juice:** small screen-shake on big hits / boss arrival; brief zoom-nudge toward a dragon when it spawns.
- **lighting:** single warm directional sun + soft ambient; optional subtle day→dusk shift as rounds climb to raise tension.
- **audio:** distinct click sounds for harvest vs attack vs crit; per-unit-type attack/death sfx; coin/wood/iron/food pickup chimes; a "DEFEND" klaxon on phase change; calm build-phase music that swells into a combat layer during the attack phase, with a boss layer for dragons. master/sfx/music sliders, persisted.

# File Structure
ES modules via `<script type="module">` + an `importmap` for Three.js. No bundler. One folder per concern; files kept reasonably small.

```
games/clicky_empire/
  index.html             # shell: canvas, HUD root, importmap (three), module entry
  styles/
    main.css             # HUD, menus, cards, tooltips
    theme.css            # palette via CSS variables
  src/
    main.js              # bootstrap, Three.js renderer, game loop, scene switching (menu/run/over)
    state.js             # single source of truth + dispatch helpers
    persistence.js       # localStorage read/write, schema migration
    world/
      generate.js        # seeded procedural map (biomes, castle placement)
      expand.js          # fog-of-war reveal + expansion cost scaling
      tiles.js           # tile data: buildable/walkable/click-yield/adjacency
      pathfind.js        # enemy/unit pathing toward castle; placement validation
    cards/
      catalog.js         # static card data (all tiers, costs, effects) — pure data
      hand.js            # draw, hand cap, drag-to-play
      draft.js           # end-of-round 3-card draft + first-time unlocks
    buildings/
      place.js           # ghost preview, footprint/validity, placement
      economy.js         # idle resource ticks, adjacency bonuses
      defense.js         # auto-firing towers/keep/cathedral/wizard
    units/
      catalog.js         # static unit data (stats, tags, figure counts)
      group.js           # the figure-cluster unit (instanced troops + flag)
      behavior.js        # per-tick AI: target, move, attack, stance
      upkeep.js          # food consumption + desertion
    enemies/
      catalog.js         # static enemy data
      spawner.js         # edge selection, wave composition by round
      behavior.js        # pathing, building-priority (sapper), support auras
    combat/
      damage.js          # hit resolution, crits, armor, tags
      effects.js         # heals, buffs, AOE, status
      clicker.js         # resolve clicks: harvest vs attack vs crit
    rts/
      input.js           # mouse + keyboard, raycaster routing by userData.kind
      selection.js       # select / box-select / control groups
      commands.js        # move, attack, attack-move, stop, stance
      camera.js          # iso orbit: pan, zoom, 90° snap-rotate
    ui/
      hud.js             # top/bottom bars, timer, castle HP, resources
      cards_ui.js        # hand rendering, drag, draft screen
      menu.js            # main menu, throne room, stats, cards collection, settings
      overlays.js        # wave banner, boss intro, game over, tooltips
    render/
      scene.js           # lights, ground, instanced props, layering
      meshes.js          # low-poly mesh builders per tile/building/unit/enemy
      fx.js              # topple, particles, floating numbers, screen-shake
    audio/
      sfx.js             # pooled one-shots
      music.js           # build/combat/boss layer crossfade
    util/
      rng.js             # seedable RNG (shareable seeds)
      math.js            # vec, lerp, clamp, easings, iso helpers
      events.js          # tiny pub/sub for cross-module signals
  assets/
    sfx/                 # short clips
    music/               # build / combat / boss loops
  unit_style.png         # art reference
  meta.yaml              # game catalog metadata (matches other games in repo)
```
Guidelines:
- `state.js` owns the single source of truth; other modules read and dispatch. avoid module-level mutable globals.
- catalog files (cards, units, enemies) are **pure data** — balance without touching logic.
- render is one-way: it reads state and draws; it never mutates state. input → commands → state; render reads state every frame.

# V1 — Vertical Slice
Ship a focused, fun core first. Everything outside this list is v2+ in the doc above.

**v1 includes:**
- main menu → pregame config (map size 5x5 / 9x9 / 12x12 + seed) → run → game over → back to menu.
- procedural seeded map with realistic layout (winding rivers + bends, mountain ranges, forest stands, riverbank farmland, open fields) over the core tile types: grasslands, forest, water, mountain, ore vein, berry patches.
- fog-of-war reveal + gold-cost expansion with scaling.
- the two-phase loop: BUILD (timer + DEFEND button) ↔ ATTACK, with round payout + 3-card draft + XP→tier unlock (T1→T2).
- the four resources, earned idly and by clicking; the clicker stats (attack/harvest chance, attack damage, harvest yield, crit).
- **build menu**: tier-gated buildings constructed directly for resources (not drafted) — all of Tier 1, a handful of Tier 2 (sawmill, mine, barracks, stone wall, ballista), and the buildable Tier 3 set (keep, wizard tower, castle wall). some buildings are terrain-gated (lumber camp / sawmill near forest, mine near an ore vein).
- random cards: Tier 1 + Tier 2 units / upgrades / actions (spearman, archer band, plus masonry & fletching upgrades and rally/volley actions).
- the figure-cluster unit system (a soldier block that thins in proportion to HP, toppling on hit) for militia, spearman, archer band; basic RTS (select, box-select, right-click move/attack, A/S).
- enemies: raider, wolf, skirmisher, sapper, plus a round-5 **warlord** mini-boss.
- defensive buildings: watchtower, palisade, ballista, stone wall, plus the Tier 3 keep, wizard tower, and castle wall.
- castle as the lose condition; food upkeep + desertion.
- HUD (top resources/round/timer/seed, castle HP, bottom hand + BUILD menu + DEFEND + speed, minimap, selected-unit panel) and core juice (floating numbers, topple, wave banner).
- persistence: settings + unlocked_cards + renown + best_round (no resumable run yet).
- Three.js iso scene: low-poly ground/tiles/buildings/units, raycast picking. **Diorama rendering** — ACES tone mapping + exposure, image-based lighting (RoomEnvironment → PMREM), a low warm sun for long shadows, an overcast cloud-cover sky with cloud-colored fog pulled in close (so the board reads as an island emerging from mist rather than an endless green field), and an addon post-processing stack (RenderPass → UnrealBloom → OutputPass → SMAA → a custom tilt-shift + cloud-vignette ShaderPass) that degrades gracefully to a plain forward render if an addon fails to load. The tilt-shift pass keeps the center sharp and blurs the edges while fading them into cloud-white, for a **miniature-diorama** look where the board reads as an island in a clouded fog of war. (Ambient occlusion was dropped from the chain because GTAO's full-scene depth prepass turned the `depthTest:false` UI overlays — production bars, floating pops — into solid black panes; AO can return later via baked AO or an overlay-excluded pass.) The orbit camera **eases** pan/zoom/90°-yaw (glides, not snaps); screen-shake is a decoupled look-pivot offset.
- audio: harvest/attack/crit clicks, per-unit sfx, build vs combat music layer.

**v1 explicitly defers:**
- most of Tier 3: cathedral & foundry buildings (need new heal-pulse / global-buff systems), cavalry, catapult, paladin, and all T3 upgrades/actions. *(The keep, wizard tower, and castle wall buildings ARE now buildable; keep's castle-fall reprieve and the wizard tower's true AOE remain deferred.)*
- dragon boss, brute, shaman, gem veins, desert/marsh terrain penalties, day→dusk shift.
- market trading, granary hand-banking, control groups (ctrl+1..9), stance toggles beyond default.
- Throne Room meta-spending, run history screen, resumable mid-run saves, color-blind mode, adaptive 3-layer/boss music.

**definition of done for v1:**
- a full run plays from main menu → settle → survive escalating rounds (through at least the round-5 warlord) → castle falls → game-over score screen → back to menu, with unlocked cards, renown, and best round persisted across reloads.
