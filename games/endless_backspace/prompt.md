[OVERVIEW]
Endless BackSpace is a first-person 3D exploration game set inside an ever-expanding, procedurally generated facility that resembles a massive, decommissioned CIA research laboratory. the player wanders deeper and deeper, with each region revealing different "departments" — administrative wings, wet labs, observation chambers, machine halls, server rooms, lecture theaters, brutalist foyers, and stairwells that don't quite go where they should.

inspiration: Control (architecture-as-character, oldest house shifts), Alan Wake (oppressive mood, narrative fragments, light vs dark), The Backrooms (liminal vibe, "this place should not exist this large", impossible scale, signs you've been somewhere before but not really).

its a browser-based 3D game using three.js (loaded from CDN, no build step). vanilla html / css / js loaded directly via `index.html`. all rooms and layouts are generated at runtime as the player approaches them, and "collapse" (despawn) once far enough behind so memory stays bounded.

[GAME-FLOW]
no levels, no scores in the traditional sense. the loop is exploration → discovery → unease → push deeper.

- 1) intro / wake-up... player wakes up in a small unremarkable office cubicle. a flickering overhead light, a dial phone that is ringing once then silent, a half-open door. tutorial prompts fade in for movement / look / interact.
- 2) explore... player walks out into the corridor. from here the facility procedurally builds itself in chunks (see [PROCEDURAL FACILITY]). every doorway leads somewhere new but plausibly connected.
- 3) discover... scattered through the facility are findables: redacted documents, audio tapes, polaroid photos, scrawled notes on whiteboards, dead terminals, occasional anomalies (rooms that don't obey physics, "echoes" of figures that vanish if observed directly).
- 4) progression... a soft progression system: the deeper you go (distance from origin and number of "thresholds" crossed) the stranger architecture and anomalies become. progression is gated by finding key cards / sigils / elevator codes that unlock new wing types.
- 5) lore drip... every collected document/tape feeds a "Journal" panel. the journal slowly assembles a fragmented narrative about Project [REDACTED].
- 6) no fail state in v1... player cannot die in v1. instead, anomalies can disorient (vision warp, audio cue, lights cut). later versions can add hostile entities (see [V2+ HOOKS]).
- 7) save points... typewriters / dim landlines act as save anchors. interacting saves player position, journal, inventory, and seed state to localStorage.

[MAIN-MENU]
- new descent
- continue (only if a save exists)
- journal viewer (browse already-collected lore)
- settings
- credits

[PLAYER ABILITIES]
- walk (WASD) / run (shift)
- look (mouse, pointer lock on canvas)
- jump (space) — short jump, mostly for clearing debris
- crouch (ctrl) — for ducking under collapsed shelving / vent crawls
- interact (E) — pick up items, read documents, flip switches, open doors, ride elevators
- flashlight (F) — toggle. has battery; batteries are findables. flashlight reveals hidden writing on certain walls.
- camera / photograph (Q) — instant polaroid snapshot. some anomalies only resolve in photos.
- journal (TAB) — open the collected lore panel.
- map (M) — opens a "you've-been-here" trace map of explored chunks; intentionally incomplete (some areas refuse to map).
- sprint stamina is not modeled in v1 — stamina/breath system is a v2 hook.

[PROCEDURAL FACILITY]
the facility is built from a streaming chunk system. each chunk is a single "room" or "corridor segment" placed against the previous chunk's open portal sockets.

- chunk types
  - corridor (straight) — long fluorescent hallway, mid-century institutional carpet, wood-paneled doors.
  - corridor (T / L / +) — branching variants. dead ends are allowed but rare.
  - office — desks, file cabinets, dead computers, occasional family photos.
  - cubicle farm — open-plan grid of partitions. fluorescent lighting, scattered paperwork.
  - wet lab — stainless steel benches, fume hoods, broken glassware, biohazard tape.
  - server room — humming racks, cold blue lights, raised tile floor, condensation.
  - lecture theater — tiered seating, chalkboard with half-erased equations, projector light.
  - observation chamber — one-way mirror onto another room; sometimes that room is impossible (looking at itself, looking at a forest, looking at the player from behind).
  - stairwell — concrete, echoing. always at least one descending option. some go up infinitely.
  - foyer (grand) — atrium with high ceilings, columns, government seal on the floor, dim natural-style skylight.
  - utility tunnel — pipes, low ceilings, occasional ankle-deep water plane.
  - storage — pallets, crates, cobwebs, occasional "DO NOT OPEN" markings.
  - elevator shaft (vertical chunk) — links horizontal layers; required to descend levels.
  - anomaly chunk (rare) — a chunk whose geometry breaks rules (mobius corridor, looping stairwell M.C. Escher style, room larger inside than outside).

- portal sockets
  - every chunk declares 1..4 portal sockets on its bounding box with a portal type tag (door / opening / vent / elevator / stairwell).
  - generator picks an unsatisfied socket on the frontier and snaps a compatible chunk to it. chunks that would overlap occupied space are rejected and retried with another chunk type.
  - on rejection N times, generator places a dead-end cap (locked door, collapsed wall, sealed bulkhead).

- streaming / decollapse
  - chunks load when within a configurable radius of the player (default ~3 chunks).
  - chunks fully unload when ~5 chunks away. when unloaded, their generated seed is remembered so re-entering rebuilds them identically.
  - explored chunks are tagged in the map; revisits never randomize them in the same run.

- seeding
  - every run has a master seed (shown on the pause screen, sharable). chunk seeds are derived deterministically from the master seed + chunk coordinate, so two players with the same seed get the same facility.

- "thresholds"
  - every N chunks of descent (vertical, via stairs/elevator) the player crosses a threshold. thresholds shift the facility's aesthetic act (see [ACTS / FACILITY ACTS]) and increase anomaly frequency.

[ACTS / FACILITY ACTS]
the facility has a soft progression of "moods" the deeper you go. crossing thresholds shifts the chunk weights and palette.

- act 1 — surface offices (calm dread)
  - 1960s/70s government interior. fluorescent strip lights, beige walls, wood doors, brown carpet.
  - chunk weights favor office / corridor / foyer. very rare anomalies.
- act 2 — operations layer (clinical)
  - shifts to cold whites, linoleum, hospital-style signage. wet labs, observation chambers, server rooms appear.
  - anomalies still rare but more architectural (a stairwell that loops once before resolving, a hallway that's longer when walking back).
- act 3 — restricted (uncanny)
  - bare concrete, exposed wiring, emergency-amber lighting. far more anomaly chunks, "echoes" of researchers visible in your peripheral vision.
  - findables become more redacted and unsettling. audio bed gets droney.
- act 4 — beneath (impossible)
  - the facility stops obeying simple Euclidean rules. corridors fork into themselves, foyers contain other foyers, the floor sometimes is a ceiling. lighting tinted deep red / black.
  - this is the v1 "soft ending" zone; finding a specific anomaly chunk plays a credits-style reveal and saves a "you reached the bottom" flag.

[FINDABLES / LORE OBJECTS]
all findables are persistent in the journal; once read/heard they're permanently in the player's record.

- documents — single-page memos / reports. partially redacted. rendered as a styled overlay (typewriter font, scan grain). examples: facility safety memo, project budget addendum, an animal-testing acquisition report, a handwritten "I should not have signed".
- audio tapes — reel-to-reel cassettes. play in-game with VHS-like distortion. running speech from researchers, recordings of interviews, a single tape that's just static and breathing.
- polaroids — physical photos lying around. some show familiar rooms from impossible angles; some show *you* though the player has never posed.
- terminal logs — interactable dead CRT monitors that flicker to life when approached. show a fake command-line session with timestamped fragments.
- whiteboard notes — chalk/marker scribbles on walls. some are clues to elevator codes. some are warnings.
- key items — keycards (per-color tier), elevator override keys, "department" sigils. used to unlock doors and elevators to deeper acts.
- consumables — flashlight batteries, photo film for the camera, save-anchor "tokens" (rare, used at typewriters/landlines).

[ANOMALIES]
anomalies are the soul of the game. they appear in anomaly chunks AND occasionally overlay normal chunks. types:

- visual
  - mirror that lags slightly behind the player's movement.
  - room that's larger inside than outside.
  - corridor that lengthens when walking back toward your entry.
  - flickers of figures at the edge of vision that vanish on direct look.
  - lights that turn off behind you in a trailing pattern.
- audio
  - footsteps that don't quite match yours.
  - radio chatter on a dead intercom.
  - distant typewriter clacking.
  - breathing in an empty server room.
- spatial
  - opening a door takes you back to where you started even though you walked forward.
  - elevator stops at a floor that doesn't exist on the indicator.
  - polaroid taken in a room reveals an object that isn't there in real time.
- narrative
  - finding the same memo signed by the same person but dated 30 years apart.
  - a tape recording of *you* speaking, in your own (or any) voice, describing this exact moment.

anomalies do not damage the player in v1 — they exist to escalate mood and feed the lore drip.

[PROGRESSION GATES]
to keep the open-endedness from feeling shapeless, soft gates funnel the player downward:

- act 1 → act 2: find the blue keycard. it unlocks the first elevator down to "Operations".
- act 2 → act 3: find both the red sigil (in the wet labs) and the elevator override key (in a server room safe).
- act 3 → act 4: solve a multi-room puzzle that involves chasing an "echo" researcher who flickers across observation chambers and points you toward a hidden stair.
- act 4 ending: find the "Director's Office" anomaly chunk — guaranteed to spawn within N chunks of the act-4 threshold.

[HUD / UI]
intentionally minimal — most of the time the screen is bare.

- center: tiny dot reticle only when interacting; otherwise hidden.
- bottom-left: only appears when hovering an interactable — verb prompt ("[E] read", "[E] pick up", "[E] open door", "[E] save").
- bottom-right: flashlight indicator (battery %), camera film remaining. hides after 4s of inactivity.
- top-left (toast, transient): "Journal updated: <fragment name>", "Map updated", "New anomaly recorded".
- pause overlay: resume / journal / map / settings / save & quit / seed display.
- journal panel: tabbed by type (documents / tapes / polaroids / terminals / notes). reading any entry pauses the world.
- map panel: top-down breadcrumb of explored chunks with simple geometry shapes; unexplored areas are blank.
- settings: volume sliders (master / sfx / ambience / voice), mouse sensitivity, FOV, brightness, motion-blur toggle, head-bob toggle, color-blind toggle, language toggle (en only in v1).

[PERSISTENCE / LOCAL STORAGE]
state saves to localStorage under key `endless_backspace_save_v1`.

- meta
  - settings: { master_vol, sfx_vol, ambience_vol, voice_vol, mouse_sens, fov, brightness, motion_blur, head_bob, color_blind }
  - completion_flags: { reached_act_2, reached_act_3, reached_act_4, found_director_office }
- discovered (persists across runs)
  - found_findables: string[] (ids of every findable ever collected, so journal entries are remembered)
- current_run (resumable mid-run)
  - master_seed, player_pos, player_yaw_pitch, inventory, flashlight_battery, film_count, save_tokens, explored_chunk_ids, journal_entries_unlocked_this_run, current_act
  - autosaved on use of a save anchor; never autosaved silently (deliberate choice — death-of-progress is the wrong vibe, but the player still chooses when to commit).
- versioning: save object includes `schema_version`; mismatch triggers migration or clean-wipe with confirmation.

[VISUAL DIRECTION]
- aesthetic: liminal mid-century institutional + brutalist concrete + uncanny office. think a CIA black site as designed by the Oldest House.
- palette per act:
  - act 1: warm beige / brown / off-white / fluorescent green-tinged white.
  - act 2: cold white / hospital teal / industrial gray / cyan emergency lights.
  - act 3: concrete gray / amber emergency / dim sodium-orange / blood-red signage.
  - act 4: near-black / deep red / occasional blown-out white / unnatural cyan glow.
- rendering style: low-to-mid poly with PBR-lite materials. heavy use of baked-shadow look via vertex AO + soft point lights. light shafts where possible. mild film grain + chromatic aberration toggle.
- doors, signs, ductwork, ceiling tiles are the workhorses — they sell the "facility" feel more than rooms do.
- text on signs is procedurally generated from a small set of department-name fragments ("Sec. 4 / Subsector B / Wetlab 12C / Restricted").
- lighting is *the* gameplay-mood mechanic: most corridors are under-lit, the flashlight matters, anomalies often involve lights misbehaving.

[AUDIO DIRECTION]
- ambient bed per act (deep room tone, distant HVAC, occasional building creak). cross-fade on threshold crossings.
- footsteps with per-surface variants (carpet / linoleum / concrete / metal grate / water).
- diegetic sources: flickering fluorescents buzz, dead intercoms hiss, refrigeration units thrum, paper shuffles when picking up documents.
- anomaly stingers: short subtle sound design cues, not jump-scares — closer to a low sub-rumble + a half-whispered consonant.
- tape playback uses an audio chain with subtle highpass + warble + tape-hiss layer.
- master / sfx / ambience / voice sliders persisted via localStorage.

[CONTROLS SUMMARY]
- move: WASD
- run: shift
- jump: space
- crouch: ctrl
- look: mouse (pointer-lock on click)
- interact: E
- flashlight: F
- camera: Q
- journal: TAB
- map: M
- pause: ESC

[FILE STRUCTURE]
vanilla js modules (ES modules via `<script type="module">`), no bundler. three.js loaded from a CDN in `index.html`. one folder per concern; files stay under ~300 lines where possible.

```
games/endless_backspace/
  index.html              # shell: canvas, HUD overlay root, module entry, three.js cdn tag
  styles/
    main.css              # HUD overlays, pause/journal/map panels, prompts
    theme.css             # per-act CSS variables (palettes, vignettes, film-grain alpha)
  src/
    main.js               # bootstrap, game loop (renderer.setAnimationLoop), scene switching
    state.js              # central run state object + dispatch helpers (player, inventory, flags)
    persistence.js        # localStorage read/write, schema migrations
    world/
      generate.js         # facility generator: portal-socket placement + chunk picker
      chunks.js           # chunk catalog (corridor, office, foyer, lab, anomaly, ...)
      streaming.js        # load/unload chunks by distance, memo of seen chunk seeds
      portals.js          # portal socket types, snap logic, dead-end caps
      anomalies.js        # anomaly overlays + special anomaly chunks
    player/
      controller.js       # pointer-lock first-person controller (move, look, jump, crouch)
      camera.js           # FOV, head-bob, brightness, motion-blur toggle
      interact.js         # raycast for interactables, E-prompt
      flashlight.js       # spotlight attached to camera, battery model
      photo.js            # in-game polaroid capture
    findables/
      catalog.js          # static lore: documents, tapes, polaroids, terminals, notes
      placement.js        # chunk-aware findable spawn rules
      journal.js          # collected lore index + panel rendering
    progression/
      acts.js             # act thresholds, chunk-weight tables per act
      gates.js            # keycards / sigils / elevator codes / director-office hook
      events.js           # tiny pub/sub for cross-module signals (e.g., "act_changed")
    render/
      scene.js            # three.js scene, renderer, post-fx (film grain, vignette)
      materials.js        # per-act material palettes, signage text generator
      lighting.js         # baked-ish lighting per chunk + dynamic flicker / failure cues
      particles.js        # dust motes, paper drift, flashlight cone fog
    audio/
      ambience.js         # per-act ambient bed + cross-fade on threshold
      sfx.js              # one-shot sounds, pooled audio nodes, surface-aware footsteps
      tapes.js            # cassette playback chain (warble, hiss, highpass)
    ui/
      hud.js              # interact prompt, flashlight + film indicator, toasts
      pause.js            # pause overlay, save anchors, seed display
      journal.js          # tabbed journal panel
      map.js              # explored-chunk top-down trace
      settings.js         # settings panel, persist + apply on change
    util/
      rng.js              # seedable RNG (deterministic per chunk coord)
      math.js             # vec / lerp / clamp / easings
      ids.js              # stable chunk + findable ids
  assets/
    models/               # glb / gltf low-poly props (desks, chairs, ducts, doors)
    textures/             # tileable institutional textures (carpet, linoleum, concrete, ceiling tiles)
    audio/
      sfx/                # interact, footsteps, doors, intercom
      ambience/           # per-act ambient beds
      tapes/              # diegetic tape recordings (mp3/ogg)
  banner.png              # catalog banner
  meta.yaml               # game catalog metadata (matches other games in repo)
```

guidelines:
- state.js owns the single source of truth; other modules read from it and dispatch updates.
- catalog files (chunks, findables, anomalies) are pure data — easy to tune without touching logic.
- render is one-way: it reads state and draws; it never mutates state.
- the streaming system MUST cap loaded chunk count; never grow unbounded.

[V1 SCOPE]
ship a focused vertical slice. v1 = "the first 20 minutes are atmospheric and convince you to keep exploring."

v1 includes:
- act 1 only, with a single elevator that descends to a stubbed act-2 preview corridor (sealed door = "to be continued" sign for the prototype).
- 5 chunk types: corridor (straight), corridor (T), office, cubicle farm, foyer.
- portal-socket-based streaming generator with ~3-chunk load radius / ~5-chunk unload radius.
- first-person controller: WASD / shift run / mouse look (pointer lock) / jump / crouch.
- interact (E) with: doors, light switches, documents, a single audio tape, the elevator.
- flashlight (F) with battery + one battery pickup placed in the starting area.
- 6 findables: 4 documents, 1 audio tape, 1 polaroid.
- journal panel (TAB) showing collected findables; pauses world while open.
- pause menu (ESC) with resume / save & quit / settings / seed display.
- save anchor: 1 typewriter near the elevator. saves position + seed + journal + inventory.
- one save slot. localStorage persistence with schema_version.
- 2 anomalies for flavor: corridor-lengthens-when-walking-back, lights-trailing-off-behind-you. no death state.
- audio: 1 act-1 ambient bed, footstep variants for carpet + linoleum, door open/close, flashlight click, tape playback.
- visuals: act-1 palette only, low-poly props, fluorescent flicker shader, simple film grain + vignette.

v1 explicitly defers:
- acts 2 / 3 / 4 and their chunk types (labs, server rooms, observation chambers, brutalist concrete, anomaly chunks).
- gates (keycards, sigils, multi-room puzzles).
- hostile entities / fail state.
- map panel (M) — show the menu entry but display "MAPPING SYSTEM OFFLINE".
- photograph mechanic (Q).
- elevator descent beyond the stubbed preview corridor.
- procedural signage / department-name generator (use fixed signs in v1).
- color-blind mode, motion-blur toggle, language toggle.
- gltf/glb model pipeline beyond a small first set of props.

definition of done for v1:
- player can spawn in the starting cubicle, walk into the corridor, explore at least ~30 procedural chunks of act 1 in any direction without stutter, collect all 6 findables, use the typewriter save anchor, reload the page, "continue" the save, and be back where they were with their journal intact and the same facility layout regenerated.

[V2+ HOOKS]
- act 2/3/4 chunk types and palettes.
- progression gates (keycards, sigils, elevator codes).
- anomaly chunks and the wider anomaly catalog.
- hostile encounters (an "entity" that can be heard, then seen, then chase the player — the chase fades if you break line-of-sight).
- stamina/breath system tied to sprint and "panic" near anomalies.
- photo mechanic with polaroid-only-visible anomalies.
- procedural signage generator and per-room paperwork generator.
- multiple save anchors per chunk type.
- per-anomaly sound design pass.
