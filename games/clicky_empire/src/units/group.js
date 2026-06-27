// ============================================================================
// units/group.js — figure-cluster render reconciler for BOTH player units and
// enemies. THREE module (the only Wave-2 Units file that touches three).
//
// One-way render (CONTRACTS §0): this reads state.units / state.enemies and
// builds / positions / topples / disposes their meshes. It NEVER mutates game
// state — hp lives in the logic instances; we only mirror it into the scene.
//
// Per frame (loop.onRender):
//   - any instance with group==null  -> build the cluster, add to its layer,
//     stamp instance.group, record shownHp.
//   - position the group at instance.pos.
//   - when instance.hp drops below the standing-figure count we last showed
//     (group.userData.shownHp), topple the lost figures (fx.toppleFigure).
//   - when an instance leaves its state array -> disposeMesh + forget it.
//
// Mesh builders already set group.userData = { kind, id, figures, banner, ...}
// (CONTRACTS §6 / render/meshes.js), so picking tags are handled for us.
// ============================================================================

import * as THREE from "three";
import { state } from "../state.js";
import { layers } from "../render/scene.js";
import { onRender } from "../loop.js";
import { buildUnitGroup, buildEnemyGroup, disposeMesh } from "../render/meshes.js";
import { toppleFigure, attackBob } from "../render/fx.js";

// A flat ground ring drawn under a unit while it is selected (RTS read).
function buildSelectionRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.44, 0.58, 28),
    new THREE.MeshBasicMaterial({
      color: 0x67f0b4,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2; // lay flat on the ground plane
  ring.position.y = 0.27; // just above the grass slab top
  ring.renderOrder = 3;
  ring.visible = false;
  return ring;
}

// id -> { group, instance, kind } for removal detection. We track both kinds in
// a single map keyed by the instance id (ids are globally unique via nextId).
const tracked = new Map();

let initialized = false;

// initUnitsRender() — register the per-frame reconciler. Idempotent.
export function initUnitsRender() {
  if (initialized) return;
  initialized = true;
  onRender(syncEntities);
}

// syncEntities() — reconcile both state arrays against the scene each frame.
export function syncEntities() {
  const seen = new Set();
  const selSet = new Set(state.selection);

  reconcileList(state.units, "unit", buildUnitGroup, layers.units, seen, selSet);
  reconcileList(state.enemies, "enemy", buildEnemyGroup, layers.enemies, seen, selSet);

  // Anything tracked but no longer present in either array has been removed
  // from logic (died / deserted). Dispose its mesh and forget it.
  for (const [id, rec] of tracked) {
    if (seen.has(id)) continue;
    disposeMesh(rec.group);
    if (rec.instance) rec.instance.group = null;
    tracked.delete(id);
  }
}

function reconcileList(list, kind, build, layer, seen, selSet) {
  if (!Array.isArray(list)) return;
  for (let i = 0; i < list.length; i++) {
    const inst = list[i];
    if (!inst || inst.id == null) continue;
    seen.add(inst.id);

    // Build a fresh cluster for any instance missing a group.
    if (inst.group == null) {
      const group = build(inst.def, inst.maxHp ?? inst.hp);
      // Ensure the picking tag carries the live instance id (builders default
      // id to def.id; logic ids are unique per instance — fix it here).
      group.userData.id = inst.id;
      group.userData.shownHp = countStanding(group);
      // Player units carry a selection ring (hidden until selected).
      if (kind === "unit") {
        const ring = buildSelectionRing();
        group.add(ring);
        group.userData.selRing = ring;
      }
      layer.add(group);
      inst.group = group;
      tracked.set(inst.id, { group, instance: inst, kind });
    }

    const group = inst.group;
    if (!group) continue;

    // Mirror position (logic owns pos; render only reads it).
    if (inst.pos) group.position.set(inst.pos.x, inst.pos.y ?? 0, inst.pos.z);

    // Show the selection ring while this unit is selected.
    if (group.userData.selRing) {
      group.userData.selRing.visible = !!(selSet && selSet.has(inst.id));
    }

    // Telegraph attacks: logic resets attackCd from ~0 up to the attack interval
    // the instant a hit lands, so a rise in attackCd since last frame means this
    // entity just swung — hop its figures. (Reads logic only; render stays
    // one-way and stores its own bookkeeping on the group.)
    const cd = inst.attackCd ?? 0;
    if (cd > (group.userData.lastAtkCd ?? cd) + 1e-3) attackBob(group);
    group.userData.lastAtkCd = cd;

    // Topple figures to reflect hp loss since the last frame we showed.
    reconcileHp(group, inst);

    // Keep the tracking record's instance fresh (array order can change).
    const rec = tracked.get(inst.id);
    if (rec) rec.instance = inst;
  }
}

// Number of figures still standing in a freshly built group.
function countStanding(group) {
  const figures = group?.userData?.figures;
  if (!figures) return 0;
  let n = 0;
  for (const f of figures) if (f && f.userData && f.userData.standing !== false) n++;
  return n;
}

// Topple figures so the regiment block visibly thins as the unit loses HP. The
// roster (figures.length) is cosmetic and usually larger than maxHp, so we map
// the remaining hp FRACTION onto the roster: standing = round(roster * hp/maxHp),
// and a living unit always keeps at least one soldier up. We topple the
// highest-indexed standing figures first (back rows fall first).
function reconcileHp(group, inst) {
  const figures = group.userData.figures;
  if (!figures || figures.length === 0) return;

  const hp = Math.max(0, inst.hp ?? 0);
  const maxHp = inst.maxHp ?? inst.hp ?? 1;
  let targetStanding;
  if (hp <= 0) {
    targetStanding = 0;
  } else {
    const frac = maxHp > 0 ? hp / maxHp : 1;
    targetStanding = Math.max(1, Math.min(figures.length, Math.round(figures.length * frac)));
  }

  let shown = group.userData.shownHp;
  if (shown == null) shown = countStanding(group);

  if (targetStanding >= shown) {
    // No loss (or hp went up via heal — we don't resurrect figures in v1).
    group.userData.shownHp = Math.min(shown, figures.length);
    return;
  }

  // Topple (shown - targetStanding) currently-standing figures, from the end.
  let toTopple = shown - targetStanding;
  for (let i = figures.length - 1; i >= 0 && toTopple > 0; i--) {
    const f = figures[i];
    if (!f || !f.userData || f.userData.toppled) continue;
    toppleFigure(group, i);
    toTopple--;
  }
  group.userData.shownHp = targetStanding;
}
