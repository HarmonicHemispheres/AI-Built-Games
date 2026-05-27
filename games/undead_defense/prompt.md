[OVERVIEW]
Undead Defense, is a tower defense game where the user controls units in an RTS style and must position them in the prep phase to defend against "zombies" that emerge from areas near the center of the map and try to make their way to procedurally generated areas along the edge of the map

its a small browser-based html game, structured across a few files for maintainability (see [FILE STRUCTURE]). no build step, no framework — vanilla html / css / js, loaded directly via `index.html`.

[GAME-FLOW]
inspired by rogue lite. the user iterates over maps and gains gold for zombies destroyed and extra gold for special things.

- 1) choose starting deck.... the player picks 5 cards from any they have unlocked. 
- 2) map gen.... a map of X by X size is procedurally generated with 1 zombie spawn point in the toxic zone (each act the player gets past sees more spawn points and wider toxic zones). map spawns spawn points and winding and curving paths outward. when zombies reach the edge of the map, the player loses "containment score" (defaults to 100)
- 3) prep time... player drags their card \ units from a card deck to the map. once placed clicking on the unit it becomes controlable like a traditional RTS unit. the user X amount of time of prep time but also has a button to skip prep when they have their units placed
- 4) game time... X zombines per round spawn and follow one of the procedurally generated roads from the spawn point to the exit points along the paths.
- 5) during game time the user can control their units (ie towers) to take on the zombie hord. 
- 6) round finish... if the user doesnt lose their units and defeats all zombies they move to the next round\map. if their containment score drops to zero they lose the round
- 7) next round card select... before a new map is procedurally generated the user is presented 3 random cards for that map level (each ACT has different cards that can randomly be drawn) if the user picks a card they have never seen before, then it is permenantly unlocked and can be used in a new run
- 8) the user goes back to prep time....


[MAIN-MENU]
- new run
- cards
- settings


[CARDS]
the units in this game are the towers in a traditional tower defense game. in this case they take the form drones: land and flying types. flying drones cannot be attacked by ground\land zombies. some zombies might have ability to target flying units. flyings units can also move over any terrain and walls or units (they are on another level above other units)

every unit card has: rarity (common / rare / epic / legendary), cost (deck slots or gold), HP, DMG, range, attack speed, move speed, and a tag list (LAND / FLYING / MELEE / RANGED / AOE / SUPPORT / TRAP). zombies and upgrades reference these tags.

- units (LAND)
  - sentry - common. cheap, balanced ground turret. medium HP, medium DMG, short-medium range. workhorse early-act unit.
  - bulwark - common. slow heavy walker. very high HP, low DMG, melee. used to block paths and soak hits.
  - scrapper - common. fast melee brawler. low-medium HP, high DMG up close, fast move. good for chasing stragglers.
  - lancer - rare. long-range single-target sniper. low HP, very high DMG, very slow attack speed. shines vs elites.
  - mortar - rare. lobbed AOE ground unit. medium HP, medium DMG splash, ignores low walls. weak vs fast targets.
  - tesla - rare. short-range chain lightning. medium HP, low per-hit DMG that arcs to 3 nearby zombies. great vs swarms.
  - frostpin - rare. slow-firing cryo turret. low DMG but applies SLOW debuff and brief freeze on crit.
  - warden - epic. aura support that buffs nearby LAND DMG and HP regen. low DMG itself.
  - reclaimer - epic. medic drone. repairs nearby drones over time. cannot attack zombies.
  - juggernaut - legendary. slow, massive walker. enormous HP, heavy melee cleave, knockback. one per deck cap.

- units (FLYING)
  - bolter - common. simplest flying unit. low HP, low DMG, can fly. fast scout / harasser.
  - hornet - common. fast strafing flier. low HP, medium DMG, high attack speed. great vs unarmored zombies.
  - skybomb - rare. flying AOE bomber. medium HP, slow attack, high splash DMG. weak vs flak-type zombies.
  - jammer - rare. flying EMP. no DMG but periodically stuns and disables special zombie abilities in an area.
  - seraph - epic. flying healer. heals other flying units and nearby LAND drones in pulses.
  - reaper - epic. high DMG flying sniper. fragile, long range, ignores cover.
  - swarmhive - legendary. spawns 3 mini drones that chase nearest zombie; respawns over time.
  - kamikaze - rare. one-shot flying suicide drone. very high single-target DMG, consumed on use.

- units (UTILITY / STRUCTURE)
  - wall - common. placed segment, blocks ground zombie path (forces re-route). no attack. limited HP.
  - spike trap - common. one-time trigger trap on a path tile. high DMG to first zombie that crosses.
  - oil slick - rare. ground hazard tile, slows zombies that walk through it.
  - radar pylon - rare. extends range and accuracy of nearby RANGED units; reveals stealth zombies.
  - shield generator - epic. projects a temporary damage-absorbing bubble around nearby drones.
  - gold extractor - epic. passive: generates extra gold per round if it survives. fragile, must be defended.

- upgrades (per-tag stat boosts — typical roguelite picks)
  - reinforced plating - +20% HP to all LAND units
  - turbofans - +15% move/attack speed to all FLYING units
  - hollow points - +25% DMG to all RANGED units
  - serrated edges - +25% DMG to all MELEE units
  - shrapnel rounds - +30% splash radius to all AOE units
  - field medics - SUPPORT units heal 50% faster
  - tripwire kit - TRAPs can trigger twice before breaking

- upgrades (specific unit perks)
  - bolter swarm tactics - bolter cost reduced, +1 deck copy allowed
  - sentry overclock - sentry attack speed +40%, but -10% HP
  - tesla forked coils - tesla chains to 5 targets instead of 3
  - mortar cluster shells - mortar shots split into 3 smaller impacts
  - juggernaut rage core - juggernaut gains +50% attack speed below 30% HP
  - reaper marked target - reaper crits deal +100% DMG to elites

- upgrades (economy / meta)
  - salvage protocol - +25% gold from destroyed zombies
  - bounty contracts - +100% gold from elite / boss zombies
  - prep extension - +15s of prep time each round
  - extra slot - +1 unit can be placed during prep
  - second wind - first drone destroyed each round respawns at 50% HP
  - containment hardening - starting containment score +25
  - card draft insight - see 4 cards instead of 3 in next-round draft

- upgrades (curse / drawback — high reward, downside)
  - overcharge reactor - +50% DMG to all units, but they take 1 DMG/s passively
  - blood pact - +100% gold this run, -25 containment score
  - glass cannons - +75% DMG to FLYING units, -50% HP to FLYING units


[ZOMBIES]
zombies are referenced by upgrades and progression. each zombie has: HP, DMG, speed, and traits (LAND / FLYING-TARGETER / ARMORED / STEALTH / ELITE / BOSS).

- shambler - basic. low HP, slow, melee. the workhorse zombie.
- runner - low HP, very fast, melee. tries to slip past defenses.
- brute - high HP, slow, medium DMG. soaks tower fire.
- spitter - ranged. spits acid that damages drones from a short distance.
- howler - aura support. nearby zombies move 20% faster.
- screecher (FLYING-TARGETER) - launches sonic bolts that can hit flying drones.
- crawler (STEALTH) - invisible to RANGED units unless a radar pylon is nearby.
- bloater - explodes on death, AOE DMG to nearby drones.
- juggerzomb (ARMORED, ELITE) - high HP and damage reduction vs non-AOE attacks.
- horde-mother (ELITE) - spawns 2 shamblers periodically until killed.
- act-boss - one per act finale. unique abilities scale per act (see [ACTS]).


[ACTS]
runs are organized into acts. acts gate which cards can appear in the draft pool and how aggressive the map/zombies become.

- act 1 (intro) - 1 spawn point, narrow toxic zone, 5 rounds, simple zombies (shambler / runner / brute). boss: bloated-shambler.
- act 2 (escalation) - 2 spawn points, wider toxic zone, 7 rounds, adds spitter / howler / crawler. boss: horde-mother prime.
- act 3 (siege) - 3 spawn points, large toxic zone, 9 rounds, adds bloater / screecher / juggerzomb. boss: the harbinger.
- act 4+ (endless / heat) - procedurally remixes prior acts with stacking modifiers (more HP, more spawns, faster waves). cosmetic prestige tracker.

between acts: short "intermission" screen — pick 1 of 3 *act perks* (stronger than per-round upgrades), and heal containment score by 25.


[PROCEDURAL MAP]
- grid based, 20x20 default in act 1, scales to 30x30 by act 3.
- toxic zone = a roughly circular region near the map center; spawn points are placed inside it. tile color/particles mark it.
- exits = 2–6 procedurally generated wall-segment openings along the map edges. number scales with act.
- path gen: from each spawn point, carve a winding path to each exit using a random walk biased toward the exit (with smoothing pass so paths feel curvy, not jagged). paths may share segments and branch.
- terrain types: open (placeable), path (not placeable, zombies walk here), wall/rock (not placeable, blocks pathing), toxic (drones placed here take periodic DMG — only suitable for FLYING units).
- the toxic zone is purely visual + a placement penalty for LAND units; flying units can hover there safely.
- walls placed by player force a re-path; if a wall fully blocks all paths it auto-rejects placement.
- seeds: every map is generated from a seed string shown on the HUD so runs are shareable / repeatable.


[RTS CONTROLS]
- selection
  - left-click a unit to select it; selection ring drawn under unit.
  - left-click drag draws a selection box; selects all units inside.
  - shift+click adds/removes from selection.
  - double-click a unit selects all units of that type on screen.
  - ctrl+1..9 binds current selection to a control group; press 1..9 to reselect; double-tap to center camera on group.
- commands
  - right-click empty tile = move (LAND uses pathfinding, FLYING goes direct).
  - right-click zombie = attack target (units chase until target dies or new order).
  - A then click = attack-move (advance and engage anything in range).
  - S = stop / hold position.
  - H = hold fire (won't auto-engage even in range).
  - Q / E = rotate facing (for arc-fire units like mortar).
- camera
  - WASD or arrow keys to pan; mouse wheel to zoom; middle-click drag to pan.
  - minimap in HUD corner; click to jump camera; right-click on minimap to issue move/attack to selection.
- stance (toggle per unit via HUD button or hotkey)
  - aggressive: chase targets in range.
  - defensive (default): engage in range but return to placement spot.
  - hold: do not move, only attack in range.
- speed
  - spacebar pauses (prep + combat). 1/2/3 = 1x / 2x / 3x game speed.
- placement (prep phase)
  - drag card from hand onto valid tile. invalid tiles flash red. ghost preview shows range circle.
  - right-click during placement cancels.
  - undo last placement = Z.


[HUD / UI]
- top bar: containment score, gold, current act/round, seed, run timer.
- bottom bar: hand of cards (drag to place), end-prep button, game-speed buttons.
- left side: control-group icons (1..9 with unit-type badges and counts).
- right side: collapsible minimap + selected-unit panel (HP bar, DMG, range, stance toggle, ability buttons).
- floating: damage numbers, healing numbers, debuff icons over units, wave counter ("Wave 3/5") that slides in.


[PERSISTENCE / LOCAL STORAGE]
state is saved to `localStorage` under the key `undead_defense_save_v1`. schema:

- meta
  - unlocked_cards: string[] (card ids the player has ever drafted)
  - meta_currency: number (earned at end of each run; spent in main-menu "vault" to permanently unlock starter slots or QoL)
  - settings: { sfx_volume, music_volume, screen_shake, particles_density, color_blind_mode }
- run_records
  - best_act_reached, best_round_reached, total_zombies_killed, total_runs, total_wins
  - last 10 runs: { seed, act_reached, score, duration, deck, win/loss }
- current_run (resumable mid-run)
  - deck, hand, gold, containment, act, round, seed, upgrades_picked, board_state
  - autosaved at the start of every prep phase and on round end.
- versioning: save object includes `schema_version`; on mismatch run a migration or wipe with confirmation.


[VISUAL / AUDIO DIRECTION]
overall vibe: grim biotech-meets-rusted-industrial. drones look clean and metallic; zombies are mutated, oozing, biological. high-contrast palette so silhouettes read at small sizes.

- art style: 2D top-down. crisp vector/canvas shapes with chunky outlines (not pixel art). low palette per act so each biome reads at a glance.
  - act 1: cold steel / pale ash green (lab outskirts)
  - act 2: rust orange / sickly yellow toxic haze (collapsed suburb)
  - act 3: deep red / black / bone (overrun citadel)
- animation principles
  - units idle-bob slightly when not acting; rotate smoothly to face targets.
  - hit-flash: target tints white for 80ms on every hit; tints red briefly when below 30% HP.
  - on death: small particle burst + brief screen shake scaled to unit/zombie size; gold pickup sprite flies toward HUD counter (arc + scale-pop).
  - projectiles: tracers for RANGED, arcs for AOE/mortar, chain-segments for tesla, beams for reaper.
  - status effects: ice cubes on slowed zombies, smoke on burning, lightning fizz on stunned.
  - card draws: cards slide in from off-screen with a slight overshoot; hover scales 1.05x and shows full tooltip.
  - placement: ghosted unit follows cursor, range circle pulses, tiles highlight green/red.
  - prep→combat transition: short klaxon, red HUD pulse, "WAVE INCOMING" banner sweeps across.
  - boss arrival: brief slow-mo, camera nudge toward boss, deeper music layer kicks in.
- juice
  - small numbers pop above hit targets (damage in white, crits in yellow, heals in green).
  - kill streak counter blooms in HUD corner; +1 gold popups per kill.
  - low-containment heartbeat vignette pulses on screen edges when score < 25.
- audio
  - 3 ambient music layers per act (base / combat / boss) that cross-fade based on game state.
  - SFX: distinct attack/death sound per unit-type and zombie-type; UI clicks; card-draw whoosh; coin pickup chime.
  - master + sfx + music sliders in settings; all clamped and persisted via localStorage.


[ECONOMY CLARIFICATIONS]
- cost model: cards cost **deck slots** at draft time (no in-game gold cost for placement). gold is the run-scoped resource.
- gold sinks during a run (between rounds, at a "supply drop" sub-screen):
  - reroll the 3-card upgrade draft (escalating cost).
  - banish a card from your run deck (one-time cost).
  - heal containment score (small chunk per purchase).
  - one-shot consumables (e.g., orbital strike, instant repair).
- meta currency (`scrap`) is earned at end of run regardless of win/loss, scaled by act reached. spent in main-menu vault for: extra starter deck slots, new starter cards, QoL toggles.
- containment score persists between rounds within an act; refilled +25 at act intermission; reset on new run.


[MAIN MENU — EXPANDED]
- new run
- continue run (only if a saved current_run exists)
- cards (collection viewer — shows unlocked cards, locked silhouettes for un-drafted)
- vault (spend meta scrap)
- run history (last 10 runs with seed + outcome)
- settings (volume, screen shake, particles, color-blind mode, wipe save with confirm)


[FILE STRUCTURE]
vanilla js modules (ES modules via `<script type="module">`), no bundler. one folder per concern, files stay under ~300 lines where possible.

```
games/undead_defense/
  index.html             # shell: canvas, HUD root, module entry
  styles/
    main.css             # HUD, menus, cards, tooltips
    theme.css            # per-act palettes via CSS variables
  src/
    main.js              # bootstrap, game loop, scene switching (menu / run / game-over)
    state.js             # central game state object + dispatch helpers
    persistence.js       # localStorage read/write, schema migrations
    map/
      generate.js        # procedural map gen (toxic zone, paths, exits, seed RNG)
      pathfind.js        # A* for LAND units / zombies; placement validation
    units/
      catalog.js         # static unit data (stats, tags, rarity)
      behavior.js        # per-tick AI: targeting, attacking, moving
      placement.js       # drag-to-place + ghost preview during prep
    zombies/
      catalog.js         # static zombie data
      spawner.js         # wave scheduling, spawn-point logic
      behavior.js        # path-following, special abilities
    combat/
      projectiles.js     # tracers, arcs, chains, beams
      effects.js         # status effects (slow, stun, burn, shield)
      damage.js          # damage resolution, crits, armor
    rts/
      input.js           # mouse + keyboard handlers
      selection.js       # select / box-select / control groups
      commands.js        # move, attack, attack-move, stop, stance
      camera.js          # pan, zoom, minimap nav
    ui/
      hud.js             # top/bottom bars, selected-unit panel
      cards.js           # hand rendering, drag, draft screen
      menu.js            # main menu, vault, run history, settings
      overlays.js        # wave banner, boss intro, game over
    render/
      canvas.js          # main canvas draw loop, layering (ground / units / fx / ui)
      sprites.js         # vector shape renderers per unit/zombie type
      particles.js       # death bursts, hit flashes, gold pops
    audio/
      sfx.js             # one-shot sounds, pooled audio nodes
      music.js           # 3-layer crossfade per act
    upgrades/
      catalog.js         # static upgrade data
      apply.js           # stat patching when an upgrade is picked
    util/
      rng.js             # seedable RNG (for shareable map seeds)
      math.js            # vec, lerp, clamp, easings
      events.js          # tiny pub/sub for cross-module signals
  assets/
    sfx/                 # .ogg / .mp3 short clips
    music/               # per-act loops + boss layers
  meta.yaml              # game catalog metadata (matches other games in repo)
```

guidelines:
- state.js owns the single source of truth; other modules read from it and dispatch updates. avoid module-level mutable globals.
- catalog files (units, zombies, upgrades) are pure data — easy to balance without touching logic.
- render is one-way: it reads state and draws; it never mutates state.
- input → commands → state; render reads state every frame.


[V1 SCOPE]
ship a focused vertical slice first. treat everything outside this list as v2+ in the doc above.

v1 includes:
- act 1 only (5 rounds, 1 spawn point, narrow toxic zone, 20x20 map)
- 8 units: sentry, bulwark, scrapper, lancer, bolter, hornet, wall, spike trap
- 4 zombies: shambler, runner, brute, bloated-shambler (act 1 boss)
- 6 upgrades: reinforced plating, hollow points, salvage protocol, prep extension, containment hardening, sentry overclock
- RTS basics: left-click select, box-select, right-click move, right-click target = attack, A = attack-move, S = stop, WASD camera, mouse-wheel zoom
- placement: drag card → ghost preview → place; Z to undo last
- HUD: top bar (containment, gold, round, seed), bottom bar (hand + end-prep + speed 1x/2x), selected-unit panel
- persistence: settings + unlocked_cards + best round reached (no resumable run, no run history yet)
- visuals: act 1 palette, hit-flash, on-death particle burst, gold-pop, damage numbers, range-circle preview
- audio: per-unit attack/death sfx, ui clicks, one act-1 music loop (no layering yet)

v1 explicitly defers:
- acts 2–4, boss variety beyond act 1
- flying-targeter / stealth / armored / elite zombies and the radar/jammer counters
- control groups (ctrl+1..9), stance toggles, hold-fire, patrol
- minimap, attack-move banner, slow-mo on boss
- supply-drop between-round shop, banish, reroll, consumables
- scrap meta currency, vault, run history, resumable runs
- adaptive 3-layer music, color-blind mode
- curse/drawback upgrades and specific-unit perks beyond sentry overclock

definition of done for v1:
- a full act-1 run can be played from main menu → 5 rounds → boss → win/loss screen → back to menu, with unlocks and best-round persisted across reloads.
