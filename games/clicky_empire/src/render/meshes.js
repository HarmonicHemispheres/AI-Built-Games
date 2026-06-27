// ============================================================================
// render/meshes.js — low-poly mesh builders for Clicky Empire (W1-Render).
//
// Every builder returns a THREE.Object3D positioned via tileToWorld and tagged
// with userData = { kind, id } on the TOP object so render/scene.js#pick can
// route clicks (CONTRACTS §6, §13).
//
// Look reference (unit_style.png): chunky low-poly soldiers in blue/silver
// clustered around a tall banner pole+flag on saturated grass. Geometry stays
// blocky (boxes / cones / cylinders / icosahedrons) with flat, low-roughness
// MeshStandardMaterial. Shared geometries/materials are cached and reused.
//
// This module reads catalogs only as ARGUMENTS (tile / unitDef / enemyDef /
// building opts). It never imports catalog logic and never mutates state.
// ============================================================================

import * as THREE from "three";
import { tileToWorld, tileKey } from "../util/math.js";

// ---------------------------------------------------------------------------
// Shared resource caches. Geometries/materials that recur across many objects
// are built once and reused (per CONTRACTS: "reuse shared geometries/materials
// where sensible"). disposeMesh() never frees these shared resources — only the
// per-object geometries/materials it can prove are unique.
// ---------------------------------------------------------------------------

const _geoCache = new Map();
const _matCache = new Map();

function sharedGeo(key, make) {
  let g = _geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.__shared = true;
    _geoCache.set(key, g);
  }
  return g;
}

// Cache a flat-ish standard material by color+roughness. Materials are tinted by
// def color, so we key on the rounded hex + roughness to share across siblings.
function sharedMat(colorHex, roughness = 0.85, extra = "") {
  const key = `${colorHex}|${roughness}|${extra}`;
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness,
      metalness: 0.0,
      flatShading: true,
    });
    m.userData.__shared = true;
    _matCache.set(key, m);
  }
  return m;
}

// Small palette helpers ------------------------------------------------------

function shade(hex, factor) {
  // Multiply each channel by `factor` (clamped 0..1) for cheap light/dark tints.
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c.getHex();
}

function mix(hexA, hexB, t) {
  const c = new THREE.Color(hexA).clone();
  c.lerp(new THREE.Color(hexB), t);
  return c.getHex();
}

const SILVER = 0xc9d4e0; // helms / blades — the "silver" half of blue/silver
const POLE = 0x6b4a2a; // banner pole (wood)
const FLAG_BLUE = 0x4169e1; // royal blue — the PLAYER banner
const FLAG_RED = 0xb83a2a; // enemy banner accent

// ---------------------------------------------------------------------------
// Shared primitive geometries (unit cube / cone / etc) — referenced by many
// figures. Built lazily through sharedGeo so a single import incurs no cost.
// ---------------------------------------------------------------------------

const G = {
  // Generic 1x1x1 box, scaled per use.
  unitBox: () => sharedGeo("box1", () => new THREE.BoxGeometry(1, 1, 1)),
  // Low-poly cone (4-sided => pyramid-ish; 6 reads rounder). For helms/roofs.
  cone6: () => sharedGeo("cone6", () => new THREE.ConeGeometry(0.5, 1, 6)),
  cone4: () => sharedGeo("cone4", () => new THREE.ConeGeometry(0.5, 1, 4)),
  cyl6: () => sharedGeo("cyl6", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6)),
  cyl8: () => sharedGeo("cyl8", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 8)),
  ico: () => sharedGeo("ico", () => new THREE.IcosahedronGeometry(0.5, 0)),
  plane: () => sharedGeo("plane1", () => new THREE.PlaneGeometry(1, 1)),
  tileBox: () => sharedGeo("tilebox", () => new THREE.BoxGeometry(0.96, 1, 0.96)),
};

// Make a mesh from a shared geometry + a (shared) material, then scale/position.
function meshOf(geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ===========================================================================
// TILES
// ===========================================================================

// Slight per-type relief so the board isn't a flat sheet. Returns the visible
// top height (world units) of the tile slab.
function tileHeight(type) {
  switch (type) {
    case "water":
      return 0.12;
    case "mountain":
      return 0.6;
    case "forest":
      return 0.28;
    default:
      return 0.22;
  }
}

// buildTileMesh(tile) -> Object3D  (userData = { kind:'tile', id:tileKey })
// `tile` is a tile instance: { col, row, type, color, walkable, buildable, ... }
export function buildTileMesh(tile) {
  const { col, row } = tile;
  const type = tile.type ?? "grasslands";
  const baseColor = tile.color ?? 0x5aa84b;
  const h = tileHeight(type);

  const group = new THREE.Group();
  const w = tileToWorld(col, row, 0);
  group.position.set(w.x, 0, w.z);

  // The slab. A unit box scaled to a chunky tile with a little height.
  const slabMat = sharedMat(baseColor, type === "water" ? 0.35 : 1.0);
  const slab = meshOf(G.tileBox(), slabMat);
  slab.scale.set(1, h, 1);
  slab.position.y = h / 2;
  group.add(slab);

  // Per-type decoration. Decorations are NON-clickable visuals (they share the
  // group's userData tag via parent-walk in pick()).
  switch (type) {
    case "forest": {
      // 1–2 chunky conifers: brown trunk + green cone canopy.
      const trunkMat = sharedMat(POLE, 0.95);
      const leafMat = sharedMat(shade(baseColor, 1.15), 0.95);
      const spots = [
        { x: -0.18, z: -0.12, s: 1.0 },
        { x: 0.2, z: 0.18, s: 0.78 },
      ];
      for (const sp of spots) {
        const trunk = meshOf(G.cyl6(), trunkMat);
        trunk.scale.set(0.08, 0.22 * sp.s, 0.08);
        trunk.position.set(sp.x, h + 0.11 * sp.s, sp.z);
        group.add(trunk);
        const canopy = meshOf(G.cone6(), leafMat);
        canopy.scale.set(0.46 * sp.s, 0.62 * sp.s, 0.46 * sp.s);
        canopy.position.set(sp.x, h + 0.22 * sp.s + 0.31 * sp.s, sp.z);
        group.add(canopy);
      }
      break;
    }
    case "mountain": {
      // A jagged grey-blue peak (icosahedron stack).
      const rockMat = sharedMat(baseColor, 1.0);
      const peak = meshOf(G.ico(), rockMat);
      peak.scale.set(0.62, 0.7, 0.62);
      peak.position.y = h + 0.18;
      peak.rotation.y = 0.6;
      group.add(peak);
      const sub = meshOf(G.ico(), sharedMat(shade(baseColor, 0.85), 1.0));
      sub.scale.set(0.36, 0.4, 0.36);
      sub.position.set(0.24, h + 0.06, -0.2);
      group.add(sub);
      break;
    }
    case "ore_vein": {
      // Glinty ore nuggets on a grass slab.
      const oreMat = sharedMat(0xb89a5a, 0.5, "metal");
      for (const sp of [
        { x: -0.15, z: 0.1 },
        { x: 0.18, z: -0.15 },
        { x: 0.05, z: 0.22 },
      ]) {
        const nug = meshOf(G.ico(), oreMat);
        const s = 0.16 + Math.random() * 0.06;
        nug.scale.setScalar(s);
        nug.position.set(sp.x, h + s * 0.5, sp.z);
        group.add(nug);
      }
      break;
    }
    case "berry_patch": {
      // Low bush + red berry dots.
      const bushMat = sharedMat(shade(baseColor, 0.8), 0.95);
      const bush = meshOf(G.ico(), bushMat);
      bush.scale.set(0.34, 0.24, 0.34);
      bush.position.y = h + 0.1;
      group.add(bush);
      const berryMat = sharedMat(0xcf3b4a, 0.6);
      for (const sp of [
        { x: -0.1, z: 0.05 },
        { x: 0.12, z: -0.08 },
        { x: 0.0, z: 0.14 },
      ]) {
        const b = meshOf(G.ico(), berryMat);
        b.scale.setScalar(0.07);
        b.position.set(sp.x, h + 0.18, sp.z);
        group.add(b);
      }
      break;
    }
    case "water": {
      // Slightly translucent, shinier slab — handled by slab material above.
      slabMat.transparent = true;
      slabMat.opacity = 0.92;
      break;
    }
    default:
      break; // grasslands: bare slab
  }

  group.userData = { kind: "tile", id: tileKey(col, row), tileType: type };
  return group;
}

// ===========================================================================
// FOG
// ===========================================================================

// buildFogMesh(col,row) -> Object3D  (userData = { kind:'fog', id:tileKey })
// A puffy low-poly cloud cap that hovers over an unrevealed tile.
export function buildFogMesh(col, row) {
  const group = new THREE.Group();
  const w = tileToWorld(col, row, 0);
  group.position.set(w.x, 0, w.z);

  const cloudMat = sharedMat(0xeaf2fb, 1.0, "fog");
  // A few overlapping icosahedron puffs.
  const puffs = [
    { x: 0, z: 0, s: 0.62, y: 0.5 },
    { x: -0.26, z: 0.12, s: 0.4, y: 0.42 },
    { x: 0.28, z: -0.1, s: 0.44, y: 0.46 },
    { x: 0.05, z: -0.26, s: 0.36, y: 0.4 },
  ];
  for (const p of puffs) {
    const puff = meshOf(G.ico(), cloudMat);
    puff.scale.setScalar(p.s);
    puff.position.set(p.x, p.y, p.z);
    puff.castShadow = false; // clouds shouldn't cast hard shadows
    group.add(puff);
  }

  group.userData = { kind: "fog", id: tileKey(col, row) };
  return group;
}

// ===========================================================================
// BUILDINGS
// ===========================================================================

// Map known building defIds to a small builder. Unknown ids fall back to a
// generic hut so the game still renders something clickable.
//
// Tile slab tops stand ~0.22 world units tall (see tileHeight). Buildings are
// positioned at world y=0 by callers, so without this lift a building's base
// sinks INTO the slab and the bottom of the structure is hidden. We raise all
// builder geometry by this much so buildings sit ON the tile surface (matching
// how unit figures stand at STAND_Y).
const GROUND_Y = 0.22;

// buildBuildingMesh(defId, opts?) -> Object3D (userData = { kind:'building', id })
//   opts: { col?, row?, id?, color? }  (id => userData.id; col/row => position)
export function buildBuildingMesh(defId, opts = {}) {
  const group = new THREE.Group();
  // Inner content group lifted onto the tile top — callers set the OUTER group's
  // position to (worldX, 0, worldZ); the lift lives here so it can't be clobbered.
  const content = new THREE.Group();
  content.position.y = GROUND_Y;
  group.add(content);

  const builder = BUILDING_BUILDERS[defId] ?? buildGenericHut;
  builder(content, opts.color);

  if (opts.col != null && opts.row != null) {
    const w = tileToWorld(opts.col, opts.row, 0);
    group.position.set(w.x, 0, w.z);
  }

  group.userData = { kind: "building", id: opts.id ?? defId, defId };
  return group;
}

function addRoof(group, color, baseY, w, d, peak, sides = 4) {
  const roof = meshOf(sides === 4 ? G.cone4() : G.cone6(), sharedMat(color, 0.9));
  roof.scale.set(w, peak, d);
  roof.position.y = baseY + peak / 2;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  return roof;
}

function addBox(group, color, x, y, z, sx, sy, sz, rough = 0.9) {
  const m = meshOf(G.unitBox(), sharedMat(color, rough));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y + sy / 2, z);
  group.add(m);
  return m;
}

// --- Generic hut (fallback) -------------------------------------------------
function buildGenericHut(group, color = 0xcaa472) {
  addBox(group, color, 0, 0, 0, 0.6, 0.42, 0.6);
  addRoof(group, shade(color, 0.7), 0.42, 0.78, 0.78, 0.42);
}

// --- Castle: the lose-condition centerpiece --------------------------------
function buildCastle(group, color = 0xb7bcc4) {
  const stone = color;
  // Keep block.
  addBox(group, stone, 0, 0, 0, 0.72, 0.7, 0.72, 1.0);
  // Crenellated top ring (4 corner merlons).
  const merlon = 0.16;
  for (const [dx, dz] of [
    [-0.28, -0.28],
    [0.28, -0.28],
    [-0.28, 0.28],
    [0.28, 0.28],
  ]) {
    addBox(group, shade(stone, 0.92), dx, 0.7, dz, merlon, 0.18, merlon, 1.0);
  }
  // Central tall tower with a blue conical roof + flag.
  addBox(group, shade(stone, 1.05), 0, 0.7, 0, 0.34, 0.46, 0.34, 1.0);
  addRoof(group, 0x3f63c8, 1.16, 0.46, 0.46, 0.42, 6);
  // Tiny flag on top.
  const pole = meshOf(G.cyl6(), sharedMat(SILVER, 0.6));
  pole.scale.set(0.025, 0.34, 0.025);
  pole.position.y = 1.16 + 0.42 + 0.17;
  group.add(pole);
  const flag = meshOf(G.plane(), sharedMat(0x3f63c8, 0.9, "flag"));
  flag.material.side = THREE.DoubleSide;
  flag.scale.set(0.22, 0.14, 1);
  flag.position.set(0.11, 1.16 + 0.42 + 0.28, 0);
  group.add(flag);
}

// --- Towers (watchtower / ballista) ----------------------------------------
function buildWatchtower(group, color = 0x9aa0a8) {
  addBox(group, color, 0, 0, 0, 0.32, 0.9, 0.32, 1.0);
  // crenellated cap
  addBox(group, shade(color, 1.05), 0, 0.9, 0, 0.42, 0.12, 0.42, 1.0);
  addRoof(group, 0x8a3b2c, 1.02, 0.48, 0.48, 0.34, 6);
}

function buildBallista(group, color = 0x8a949e) {
  addBox(group, color, 0, 0, 0, 0.5, 0.5, 0.5, 1.0);
  // platform
  addBox(group, shade(color, 1.05), 0, 0.5, 0, 0.6, 0.08, 0.6, 1.0);
  // the bolt-thrower: a flat arm + a stubby bolt
  const arm = meshOf(G.unitBox(), sharedMat(POLE, 0.95));
  arm.scale.set(0.5, 0.06, 0.1);
  arm.position.set(0, 0.66, 0);
  arm.rotation.y = 0.4;
  group.add(arm);
  const bolt = meshOf(G.cone6(), sharedMat(SILVER, 0.5));
  bolt.scale.set(0.06, 0.3, 0.06);
  bolt.rotation.z = -Math.PI / 2;
  bolt.position.set(0.28, 0.66, 0);
  group.add(bolt);
}

// --- Walls (palisade / stone wall) -----------------------------------------
function buildPalisade(group, color = 0x7a5630) {
  // A row of pointed logs.
  for (let i = -1; i <= 1; i++) {
    const log = meshOf(G.cyl6(), sharedMat(color, 0.95));
    log.scale.set(0.12, 0.5, 0.12);
    log.position.set(i * 0.26, 0.25, 0);
    group.add(log);
    const tip = meshOf(G.cone6(), sharedMat(shade(color, 0.85), 0.95));
    tip.scale.set(0.12, 0.14, 0.12);
    tip.position.set(i * 0.26, 0.57, 0);
    group.add(tip);
  }
}

function buildStoneWall(group, color = 0x9b9ea3) {
  addBox(group, color, 0, 0, 0, 0.9, 0.5, 0.28, 1.0);
  // merlons
  for (let i = -1; i <= 1; i++) {
    addBox(group, shade(color, 0.95), i * 0.3, 0.5, 0, 0.18, 0.16, 0.28, 1.0);
  }
}

// --- Castle wall (Tier 3): a taller, thicker stone wall with more merlons -----
function buildCastleWall(group, color = 0xb4b7bc) {
  addBox(group, color, 0, 0, 0, 0.94, 0.72, 0.34, 1.0);
  // a banded course line for heft
  addBox(group, shade(color, 0.88), 0, 0.34, 0, 0.96, 0.06, 0.36, 1.0);
  // five chunky merlons
  for (let i = -2; i <= 2; i++) {
    addBox(group, shade(color, 0.96), i * 0.2, 0.72, 0, 0.14, 0.2, 0.34, 1.0);
  }
}

// --- Economy buildings ------------------------------------------------------
function buildLumberCamp(group, color = 0x8a6a3c) {
  addBox(group, color, 0, 0, 0, 0.55, 0.34, 0.55);
  addRoof(group, shade(color, 0.65), 0.34, 0.7, 0.7, 0.34);
  // stacked log pile beside it
  for (let i = 0; i < 2; i++) {
    const log = meshOf(G.cyl6(), sharedMat(shade(color, 1.2), 0.95));
    log.scale.set(0.1, 0.4, 0.1);
    log.rotation.z = Math.PI / 2;
    log.position.set(0.34, 0.1 + i * 0.12, -0.28 + i * 0.02);
    group.add(log);
  }
}

function buildHamlet(group, color = 0xcaa06a) {
  addBox(group, color, -0.12, 0, 0, 0.4, 0.3, 0.4);
  addRoof(group, 0xa85a3c, 0.3, 0.52, 0.52, 0.26);
  addBox(group, shade(color, 0.92), 0.22, 0, 0.12, 0.28, 0.22, 0.28);
  addRoof(group, 0xa85a3c, 0.22, 0.38, 0.38, 0.2);
}

function buildWheatField(group, color = 0xe0c34c) {
  // low dirt plot + rows of wheat
  addBox(group, 0x7a5a36, 0, 0, 0, 0.74, 0.06, 0.74, 1.0);
  for (let i = -1; i <= 1; i++) {
    const row = meshOf(G.unitBox(), sharedMat(color, 0.95));
    row.scale.set(0.6, 0.18, 0.12);
    row.position.set(0, 0.06 + 0.09, i * 0.22);
    group.add(row);
  }
}

function buildMilitiaCamp(group, color = 0x7d8a5a) {
  // A tent.
  addRoof(group, color, 0.0, 0.7, 0.7, 0.5, 4);
  addBox(group, shade(color, 0.7), 0, 0, 0, 0.62, 0.06, 0.62, 1.0);
  // a little flag
  const pole = meshOf(G.cyl6(), sharedMat(POLE, 0.95));
  pole.scale.set(0.03, 0.7, 0.03);
  pole.position.set(0.28, 0.35, 0.28);
  group.add(pole);
  const flag = meshOf(G.plane(), sharedMat(0x5b8def, 0.9, "flag"));
  flag.material.side = THREE.DoubleSide;
  flag.scale.set(0.2, 0.12, 1);
  flag.position.set(0.39, 0.58, 0.28);
  group.add(flag);
}

function buildSawmill(group, color = 0x8a6a3c) {
  buildLumberCamp(group, color);
  // big saw blade
  const blade = meshOf(G.cyl8(), sharedMat(SILVER, 0.4, "metal"));
  blade.scale.set(0.26, 0.04, 0.26);
  blade.rotation.x = Math.PI / 2;
  blade.position.set(-0.3, 0.3, 0.25);
  group.add(blade);
}

function buildMarket(group, color = 0xd6b46a) {
  addBox(group, color, 0, 0, 0, 0.6, 0.3, 0.6);
  // striped awning roof (flat box, tilted plane)
  const awn = meshOf(G.unitBox(), sharedMat(0xcf5a4a, 0.9));
  awn.scale.set(0.8, 0.05, 0.8);
  awn.position.set(0, 0.36, 0);
  group.add(awn);
}

function buildMine(group, color = 0x6f7480) {
  // mountain-side entrance: a dark arch in a rock mound
  const mound = meshOf(G.ico(), sharedMat(color, 1.0));
  mound.scale.set(0.6, 0.5, 0.6);
  mound.position.y = 0.22;
  group.add(mound);
  addBox(group, 0x2a2d33, 0, 0, 0.26, 0.24, 0.3, 0.16, 1.0); // entrance
  // minecart hint
  addBox(group, 0x5a4a3a, 0.26, 0, 0.18, 0.16, 0.12, 0.12);
}

function buildGranary(group, color = 0xcaa06a) {
  // round silo
  const silo = meshOf(G.cyl8(), sharedMat(color, 0.95));
  silo.scale.set(0.5, 0.55, 0.5);
  silo.position.y = 0.275;
  group.add(silo);
  addRoof(group, shade(color, 0.65), 0.55, 0.6, 0.6, 0.3, 6);
}

function buildBarracks(group, color = 0x8a8f96) {
  addBox(group, color, 0, 0, 0, 0.8, 0.4, 0.5);
  addRoof(group, shade(color, 0.7), 0.4, 0.92, 0.62, 0.3);
  // crossed-swords hint over the door
  const sword = meshOf(G.unitBox(), sharedMat(SILVER, 0.4));
  sword.scale.set(0.04, 0.28, 0.04);
  sword.position.set(0, 0.5, 0.26);
  sword.rotation.z = 0.5;
  group.add(sword);
}

function buildKeep(group, color = 0xa9aeb6) {
  buildCastle(group, color);
  // a bit shorter / squatter than the castle — scale the whole group down.
  group.scale.setScalar(0.85);
}

// --- Wizard tower (Tier 3): a tall slim tower topped by a glowing arcane orb --
function buildWizardTower(group, color = 0x6b54a8) {
  // tapered stone shaft
  addBox(group, color, 0, 0, 0, 0.34, 0.5, 0.34, 1.0);
  addBox(group, shade(color, 1.1), 0, 0.5, 0, 0.28, 0.5, 0.28, 1.0);
  // pointed conical cap
  addRoof(group, shade(color, 0.7), 1.0, 0.5, 0.5, 0.42, 6);
  // floating arcane orb (emissive-ish bright icosahedron)
  const orb = meshOf(G.ico(), sharedMat(0x9fd4ff, 0.25, "orb"));
  orb.scale.setScalar(0.16);
  orb.position.y = 1.16;
  group.add(orb);
}

const BUILDING_BUILDERS = {
  castle: buildCastle,
  watchtower: buildWatchtower,
  ballista_tower: buildBallista,
  ballista: buildBallista,
  palisade: buildPalisade,
  stone_wall: buildStoneWall,
  lumber_camp: buildLumberCamp,
  hamlet: buildHamlet,
  wheat_field: buildWheatField,
  militia_camp: buildMilitiaCamp,
  sawmill: buildSawmill,
  market: buildMarket,
  mine: buildMine,
  granary: buildGranary,
  barracks: buildBarracks,
  keep: buildKeep,
  wizard_tower: buildWizardTower,
  castle_wall: buildCastleWall,
};

// ===========================================================================
// UNIT / ENEMY FIGURE CLUSTERS
// ===========================================================================

// A single low-poly soldier figure: small body + helm, tinted by team color.
// Returns a Group so fx can topple/sink the whole figure as one unit. Figures
// are deliberately SMALL (Total-War scale) — a unit reads as a tight block of
// many soldiers + a tall banner, not a few big ones.
function buildFigure(bodyColor, accentColor) {
  const fig = new THREE.Group();

  // Body: a small tapered box.
  const body = meshOf(G.unitBox(), sharedMat(bodyColor, 0.85));
  body.scale.set(0.1, 0.22, 0.09);
  body.position.y = 0.11;
  fig.add(body);

  // Head/helm: silver-ish, a small icosahedron.
  const head = meshOf(G.ico(), sharedMat(accentColor, 0.6));
  head.scale.setScalar(0.075);
  head.position.y = 0.26;
  fig.add(head);

  // A stubby weapon/shield hint: a thin silver box at the side.
  const arm = meshOf(G.unitBox(), sharedMat(accentColor, 0.5));
  arm.scale.set(0.03, 0.17, 0.03);
  arm.position.set(0.07, 0.14, 0.01);
  fig.add(arm);

  // NOTE: no userData.kind here on purpose. pick() (scene.js) walks UP to the
  // nearest tagged ancestor; tagging a figure would intercept clicks meant for
  // the unit/enemy group. fx reads `standing`/`toppled`, not `kind`.
  fig.userData = { standing: true };
  return fig;
}

// Lay figures out in a tidy rectangular block — a Total-War-style regiment that
// all faces the same way, front rows filled first. Deterministic given count so
// re-builds look stable. cols/rows are chosen ~square by the caller.
function gridOffsets(count, cols, rows, spacing) {
  const out = [];
  if (count <= 0) return out;
  const x0 = -((cols - 1) * spacing) / 2;
  const z0 = -((rows - 1) * spacing) / 2;
  let placed = 0;
  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < cols && placed < count; c++) {
      out.push({ x: x0 + c * spacing, z: z0 + r * spacing, yaw: 0 });
      placed++;
    }
  }
  return out;
}

// Build the shared center pole + flag for a group, tinted by team flag color.
function buildBannerPole(flagColor) {
  const banner = new THREE.Group();
  const pole = meshOf(G.cyl6(), sharedMat(POLE, 0.9));
  pole.scale.set(0.035, 0.9, 0.035);
  pole.position.y = 0.45;
  banner.add(pole);

  // Tall hanging banner (like the d20 flag in unit_style.png). It flies toward
  // the BACK of the formation (+z) — the cloth extends along the depth axis from
  // the pole, not across the front (which read as a sideways flag). Rotated so
  // the plane's width maps to world +z; offset by half its width so the near
  // edge sits at the pole and the cloth trails backward.
  const flag = meshOf(G.plane(), sharedMat(flagColor, 0.85, "flag"));
  flag.material.side = THREE.DoubleSide;
  flag.scale.set(0.34, 0.5, 1);
  flag.rotation.y = -Math.PI / 2;
  flag.position.set(0.0, 0.6, 0.17);
  banner.add(flag);

  // No userData.kind (see buildFigure): clicks on the banner should resolve to
  // the parent unit/enemy group via pick()'s ancestor walk.
  banner.userData = {};
  return banner;
}

// Ground clearance: tile slab tops sit at ~0.22 world units (grasslands) up to
// 0.28 (forest). Figures + banner are lifted by this so soldiers stand ON the
// ground rather than being half-buried in the slab (which made them nearly
// invisible on forest tiles). fx topple/bob animate relative to this homeY.
const STAND_Y = 0.24;
// Spacing between soldiers in the regiment block.
const FORM_SPACING = 0.16;

// Core builder shared by units and enemies. The number of soldiers in the block
// is the def's `figures` (cosmetic roster size) when present, else floor(hp) for
// enemies — see units/group.js for how the block thins with hp.
function buildCluster(kind, def, hp) {
  const group = new THREE.Group();
  const count = Math.max(0, Math.floor(def?.figures ?? hp ?? def?.hp ?? 1));
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));

  const teamColor = def?.color ?? (kind === "unit" ? 0x5b8def : 0xd6533c);
  // Units lean blue/silver; enemies lean warm/red. Accent = helms/blades.
  const accent = kind === "unit" ? SILVER : mix(teamColor, 0xffd9a0, 0.4);
  // Player banner is royal blue; enemy banner is red.
  const flagColor = kind === "unit" ? FLAG_BLUE : FLAG_RED;

  // Standard-bearer: planted at the BACK-LEFT corner of the block (never in
  // front of / overlapping the soldiers), lifted to the ground surface. The flag
  // hangs rightward along the back edge so it reads as aligned with the regiment.
  const halfW = ((cols - 1) / 2) * FORM_SPACING;
  const halfD = ((rows - 1) / 2) * FORM_SPACING;
  const banner = buildBannerPole(flagColor);
  banner.position.set(-halfW - 0.05, STAND_Y, halfD + 0.12);
  group.add(banner);
  group.userData = {}; // set below

  // Figures.
  const figures = [];
  const offsets = gridOffsets(count, cols, rows, FORM_SPACING);
  for (let i = 0; i < count; i++) {
    const off = offsets[i] ?? { x: 0, z: 0, yaw: 0 };
    const fig = buildFigure(teamColor, accent);
    fig.position.set(off.x, STAND_Y, off.z);
    fig.rotation.y = off.yaw;
    fig.userData.homeY = STAND_Y;
    fig.userData.standing = true;
    group.add(fig);
    figures.push(fig);
  }

  group.userData = {
    kind, // 'unit' | 'enemy'
    id: def?.id ?? null,
    defId: def?.id ?? null,
    figures, // fx topples these
    banner, // fx can drop the flag when empty
    teamColor,
  };
  return group;
}

// buildUnitGroup(unitDef, hp) -> Object3D  (userData = { kind:'unit', id, figures })
export function buildUnitGroup(unitDef, hp) {
  return buildCluster("unit", unitDef, hp);
}

// buildEnemyGroup(enemyDef, hp) -> Object3D (userData = { kind:'enemy', id, figures })
export function buildEnemyGroup(enemyDef, hp) {
  return buildCluster("enemy", enemyDef, hp);
}

// ===========================================================================
// DISPOSAL
// ===========================================================================

// disposeMesh(obj) — recursively free non-shared geometry/material and detach
// the object from its parent. Shared cached resources (G.* / sharedMat) are
// flagged with userData.__shared and are NEVER disposed here.
export function disposeMesh(obj) {
  if (!obj) return;
  obj.traverse((node) => {
    if (node.isMesh || node.isSprite) {
      const geo = node.geometry;
      if (geo && !geo.userData?.__shared) geo.dispose?.();
      const mat = node.material;
      if (Array.isArray(mat)) {
        for (const m of mat) disposeMaterial(m);
      } else {
        disposeMaterial(mat);
      }
    }
  });
  if (obj.parent) obj.parent.remove(obj);
}

function disposeMaterial(mat) {
  if (!mat || mat.userData?.__shared) return;
  // free any textures we created (floating-number sprites etc.)
  for (const key of ["map", "alphaMap", "emissiveMap"]) {
    if (mat[key]?.dispose) mat[key].dispose();
  }
  mat.dispose?.();
}
