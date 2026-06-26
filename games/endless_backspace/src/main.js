import * as THREE from "three";
import { createState, defaultRunState } from "./state.js";
import { loadSave, writeSave, writeSettingsOnly, clearRun, hasResumableRun } from "./persistence.js";
import { randomSeedString } from "./rng.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Flashlight } from "./flashlight.js";
import { InteractSystem } from "./interact.js";
import { Journal } from "./findables.js";
import { Hud } from "./hud.js";
import { PauseUi } from "./pause.js";

// ---------- DOM cache ----------
const els = {
  view: document.getElementById("view"),
  mainMenu: document.getElementById("main-menu"),
  clickResume: document.getElementById("click-resume"),
  hud: document.getElementById("hud"),
  reticle: document.getElementById("reticle"),
  interactPrompt: document.getElementById("interact-prompt"),
  interactVerb: document.getElementById("interact-verb"),
  flashlightIndicator: document.getElementById("flashlight-indicator"),
  flashlightBar: document.getElementById("flashlight-bar"),
  toast: document.getElementById("toast"),
  vignette: document.getElementById("vignette"),
  grain: document.getElementById("grain"),
  pause: document.getElementById("pause"),
  btnNew: document.getElementById("btn-new"),
  btnContinue: document.getElementById("btn-continue"),
  btnSettingsMenu: document.getElementById("btn-settings-menu"),
  btnCredits: document.getElementById("btn-credits"),
  btnResume: document.getElementById("btn-resume"),
  btnJournal: document.getElementById("btn-journal"),
  btnMap: document.getElementById("btn-map"),
  btnSettings: document.getElementById("btn-settings"),
  btnSaveQuit: document.getElementById("btn-save-quit"),
  seedDisplay: document.getElementById("seed-display"),
  setSens: document.getElementById("set-sens"),
  setFov: document.getElementById("set-fov"),
  setBrightness: document.getElementById("set-brightness"),
  setMaster: document.getElementById("set-master"),
  setHeadbob: document.getElementById("set-headbob"),
  setGrain: document.getElementById("set-grain"),
  journalList: document.getElementById("journal-list"),
  journalReader: document.getElementById("journal-reader"),
  tabBtns: document.querySelectorAll(".tab-btn"),
  readerOverlay: document.getElementById("reader"),
  readerTitle: document.getElementById("reader-title"),
  readerBody: document.getElementById("reader-body"),
  credits: document.getElementById("credits"),
};

// ---------- engine ----------
const state = createState();

// Apply persisted settings + foundFindables if present
{
  const saved = loadSave();
  if (saved) {
    Object.assign(state.settings, saved.settings ?? {});
    Object.assign(state.completionFlags, saved.completion_flags ?? {});
    state.foundFindables = Array.isArray(saved.found_findables) ? saved.found_findables.slice() : [];
    if (saved.current_run) {
      els.btnContinue.disabled = false;
    }
  }
}

const renderer = new THREE.WebGLRenderer({ canvas: els.view, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07070a);
scene.fog = new THREE.FogExp2(0x080706, 0.085);

const camera = new THREE.PerspectiveCamera(state.settings.fov, window.innerWidth / window.innerHeight, 0.05, 80);
camera.position.set(4, 1.6, 4);
scene.add(camera);

// Soft ambient + a very low hemisphere for fallback. Most lighting comes from chunk ceiling lights.
const ambient = new THREE.AmbientLight(0xc8b89c, 0.06);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xa89878, 0x0a0806, 0.10);
scene.add(hemi);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- runtime references (set when a run starts) ----------
let world = null;
let player = null;
let flashlight = null;
let interactSys = null;
let journal = null;
let hud = null;
let pauseUi = null;

const clock = new THREE.Clock();
let running = false;

// ---------- menu / lifecycle ----------

function showMainMenu() {
  els.mainMenu.classList.remove("hidden");
  els.hud.classList.add("hidden");
  els.pause.classList.add("hidden");
  els.clickResume.classList.add("hidden");
  document.exitPointerLock?.();
  running = false;
}

function startNewRun() {
  const seed = randomSeedString();
  state.run = defaultRunState(seed);
  enterRun();
}

function continueRun() {
  const saved = loadSave();
  if (!saved?.current_run) {
    startNewRun();
    return;
  }
  state.run = saved.current_run;
  // Defensive: ensure journal arrays exist
  state.run.journal ??= { documents: [], tapes: [], polaroids: [] };
  state.run.inventory ??= { batteries: 0, saveTokens: 1 };
  state.run.flashlight ??= { on: false, battery: 1.0 };
  state.run.player ??= { pos: { x: 4, y: 1.6, z: 4 }, yaw: 0, pitch: 0 };
  enterRun();
}

function enterRun() {
  els.mainMenu.classList.add("hidden");
  els.hud.classList.remove("hidden");
  hud?.setGrain?.(state.settings.filmGrain) ?? (els.grain.style.display = state.settings.filmGrain ? "block" : "none");

  // Build world. Load radius decides how far the facility is generated around the player;
  // a per-frame light-culling pass keeps the active light count bounded regardless of radius.
  world = new World(scene, state.run.seed, {
    foundIds: new Set(state.foundFindables),
    loadRadius: 3,
    unloadRadius: 5,
  });

  // If the player resumed away from the origin, walk the frontier up to their chunk
  // before the first frame so streaming has plan data immediately.
  {
    const px = state.run.player.pos.x;
    const pz = state.run.player.pos.z;
    const pcx = Math.floor(px / 8);
    const pcz = Math.floor(pz / 8);
    if (pcx !== 0 || pcz !== 0) {
      world.planUntilContains(pcx, pcz);
    }
  }

  // Player
  camera.fov = state.settings.fov;
  camera.updateProjectionMatrix();
  player = new Player(camera, els.view, world, state);
  player.setOnLockChange((locked) => {
    if (state.scene === "playing") {
      els.clickResume.classList.toggle("hidden", locked);
    }
  });

  flashlight = new Flashlight(camera, state);

  // HUD + Journal
  hud = new Hud(els, state);
  hud.show();
  hud.setGrain(state.settings.filmGrain);

  journal = new Journal(
    state,
    els.journalList,
    els.journalReader,
    els.tabBtns,
    document.getElementById("journal"),
    els.readerOverlay,
    els.readerTitle,
    els.readerBody,
  );
  journal.render();

  interactSys = new InteractSystem(player, world, state, hud, journal, flashlight, {
    onLevelTransition: () => {
      // Toggle between level 0 (ground) and level 1 (subsector B) for V1.
      const targetLevel = world.currentLevel === 0 ? 1 : 0;
      // Drop player back at origin of the target level. For level 0 it's the start cubicle.
      // For level 1 it's the stairwell_arrival chunk at (0,0). Position the player a couple
      // of meters in from the door so they're not clipped into a wall.
      world.switchToLevel(targetLevel, 0, 0);
      const entry = world.loaded.get("0,0");
      if (entry) {
        // Drop at the chunk's center.
        const cx = entry.ocx * 8 + 4;
        const cz = entry.ocz * 8 + 4;
        player.position.set(cx, 1.6, cz);
        state.run.player.pos.x = cx;
        state.run.player.pos.y = 1.6;
        state.run.player.pos.z = cz;
        state.run.player.yaw = 0;
        state.run.player.pitch = 0;
        player.yaw = 0;
        player.pitch = 0;
      }
      hud.toast(targetLevel === 0 ? "Subsector A" : "Subsector B");
    },
  });

  pauseUi = new PauseUi(els, state, {
    onResume: () => resumeFromPause(),
    onSaveQuit: () => saveAndQuit(),
    onFovChange: () => {
      camera.fov = state.settings.fov;
      camera.updateProjectionMatrix();
    },
    onBrightnessChange: () => {
      renderer.toneMappingExposure = state.settings.brightness;
    },
    onGrainChange: (on) => hud.setGrain(on),
  });

  renderer.toneMappingExposure = state.settings.brightness;

  state.scene = "playing";
  running = true;
  clock.start();

  // Player should click the canvas to enter pointer lock.
  els.clickResume.classList.remove("hidden");
}

function resumeFromPause() {
  pauseUi.hide();
  state.scene = "playing";
  player.requestLock();
  els.clickResume.classList.toggle("hidden", document.pointerLockElement === els.view);
}

function pauseRun() {
  state.scene = "paused";
  player.releaseLock();
  pauseUi.show();
}

function saveAndQuit() {
  writeSave(state);
  // Hard-clean: dispose world + remove player/system
  state.run = null;
  interactSys?.dispose();
  player?.dispose();
  // Remove all chunks from scene
  if (world) {
    for (const [k, entry] of world.loaded) {
      entry.group.traverse((o) => o.geometry?.dispose?.());
      scene.remove(entry.group);
    }
  }
  world = null;
  player = null;
  flashlight = null;
  interactSys = null;
  journal = null;
  pauseUi.hide();
  els.btnContinue.disabled = !hasResumableRun();
  showMainMenu();
  state.scene = "menu";
}

// ---------- input glue ----------

document.addEventListener("keydown", (e) => {
  if (state.scene !== "playing" && state.scene !== "paused") return;
  if (e.code === "Escape") {
    if (state.scene === "playing") {
      pauseRun();
    } else {
      // closing a panel takes priority over resuming
      const anyPanelOpen = ["journal", "map-panel", "settings-panel", "reader", "credits"]
        .some((id) => !document.getElementById(id).classList.contains("hidden"));
      if (anyPanelOpen) {
        pauseUi.closeAllPanels();
      } else {
        resumeFromPause();
      }
    }
  } else if (e.code === "Tab") {
    e.preventDefault();
    if (state.scene === "playing") {
      pauseRun();
      pauseUi.openPanel("journal");
      journal.render();
    } else {
      pauseUi.openPanel("journal");
      journal.render();
    }
  } else if (e.code === "KeyM") {
    if (state.scene === "playing") {
      pauseRun();
      pauseUi.openPanel("map-panel");
    }
  }
});

// Click canvas to enter pointer lock when running
els.view.addEventListener("click", () => {
  if (state.scene === "playing" && !player?.locked) {
    player.requestLock();
  }
});
// Click-resume overlay also re-enters pointer lock.
els.clickResume.addEventListener("click", () => {
  if (state.scene === "playing" && !player?.locked) {
    player.requestLock();
  }
});

// ---------- main menu wiring ----------

els.btnNew.addEventListener("click", () => {
  clearRun(); // start fresh
  startNewRun();
});
els.btnContinue.addEventListener("click", () => {
  if (els.btnContinue.disabled) return;
  continueRun();
});
els.btnSettingsMenu.addEventListener("click", () => {
  // Show settings without an active run. We reuse the settings panel by
  // creating a temporary PauseUi or by opening the panel directly.
  document.getElementById("settings-panel").classList.remove("hidden");
  // Bind controls one-time
  if (!els.setSens.dataset.boundMenu) {
    els.setSens.dataset.boundMenu = "1";
    els.setSens.value = String(state.settings.mouseSensitivity);
    els.setFov.value = String(state.settings.fov);
    els.setBrightness.value = String(state.settings.brightness);
    els.setMaster.value = String(state.settings.masterVolume);
    els.setHeadbob.checked = !!state.settings.headBob;
    els.setGrain.checked = !!state.settings.filmGrain;
    els.setSens.addEventListener("input", () => { state.settings.mouseSensitivity = parseFloat(els.setSens.value); writeSettingsOnly(state); });
    els.setFov.addEventListener("input", () => { state.settings.fov = parseInt(els.setFov.value, 10); writeSettingsOnly(state); });
    els.setBrightness.addEventListener("input", () => {
      state.settings.brightness = parseFloat(els.setBrightness.value);
      renderer.toneMappingExposure = state.settings.brightness;
      writeSettingsOnly(state);
    });
    els.setMaster.addEventListener("input", () => { state.settings.masterVolume = parseFloat(els.setMaster.value); writeSettingsOnly(state); });
    els.setHeadbob.addEventListener("change", () => { state.settings.headBob = els.setHeadbob.checked; writeSettingsOnly(state); });
    els.setGrain.addEventListener("change", () => {
      state.settings.filmGrain = els.setGrain.checked;
      els.grain.style.display = state.settings.filmGrain ? "block" : "none";
      writeSettingsOnly(state);
    });
  }
});
els.btnCredits.addEventListener("click", () => {
  els.credits.classList.remove("hidden");
});

// Make panel close buttons work even from the main menu
for (const btn of document.querySelectorAll(".panel-close")) {
  btn.addEventListener("click", () => {
    const id = btn.dataset.close;
    document.getElementById(id)?.classList.add("hidden");
  });
}

// Set initial film grain visibility
els.grain.style.display = state.settings.filmGrain ? "block" : "none";

// ---------- main loop ----------
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!running || !player || !world) {
    renderer.render(scene, camera);
    return;
  }

  if (state.scene === "playing") {
    player.update(dt);
    flashlight.update(dt);

    // Streaming around the player chunk
    const [pcx, pcz] = world.chunkOf(player.position.x, player.position.z);
    world.update(pcx, pcz);

    // Per-frame light pass: cull lights in chunks more than LIGHT_RADIUS away from the player.
    // For multi-cell rooms (e.g. 2x2 grand lobby), use the nearest footprint cell so a light
    // in the back of a big room still activates when the player is in the front.
    const LIGHT_RADIUS = 1;
    const now = performance.now() * 0.001;
    for (const entry of world.loaded.values()) {
      const fp = entry.footprint ?? [[0, 0]];
      let cd = Infinity;
      for (const [dx, dz] of fp) {
        const d = Math.max(Math.abs(entry.ocx + dx - pcx), Math.abs(entry.ocz + dz - pcz));
        if (d < cd) cd = d;
      }
      const active = cd <= LIGHT_RADIUS;
      entry.group.traverse((obj) => {
        if (!obj.isPointLight) return;
        obj.visible = active;
        if (!active || !obj.userData.flicker) return;
        const f = obj.userData.flicker;
        if (now > f.nextEventAt) {
          f.nextEventAt = now + 0.4 + Math.random() * 4;
          f.offDuration = Math.random() < 0.3 ? 0.06 + Math.random() * 0.18 : 0;
        }
        if (f.offDuration > 0) {
          obj.intensity = 0.05;
          f.offDuration -= dt;
        } else {
          obj.intensity = f.base * (0.9 + Math.sin(now * 30 + f.phase) * 0.05 + (Math.random() - 0.5) * 0.04);
        }
      });
    }

    interactSys.update();
    hud.update();
  }

  renderer.render(scene, camera);
}

showMainMenu();
tick();
