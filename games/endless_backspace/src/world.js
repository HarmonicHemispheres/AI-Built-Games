import * as THREE from "three";
import { CHUNK_TYPES, CHUNK_SIZE, neighborCoord, oppositeSocket } from "./chunks.js";
import { chunkRng, weightedPick } from "./rng.js";
import { findableMesh } from "./findables.js";

// World owns the streaming + generator.
// - Chunks live on integer grid (cx, cz).
// - The start cubicle is (0, 0).
// - Chunks load when within `loadRadius` of player chunk, unload at `unloadRadius`.
// - Layout is deterministic from the master seed: a chunk's type is picked once from
//   the source socket that first brought us to it; we record `chunkPlan[key]` so re-entry
//   rebuilds identically without keeping geometry in memory.

export class World {
  constructor(scene, seed, opts = {}) {
    this.scene = scene;
    this.seed = seed;
    this.loadRadius = opts.loadRadius ?? 3;
    this.unloadRadius = opts.unloadRadius ?? 5;
    this.chunkPlan = new Map();   // "cx,cz" -> { typeId, sockets }
    this.loaded = new Map();      // "cx,cz" -> { group, walls, interactables, typeId, cx, cz }
    this.frontier = [];           // { fromCx, fromCz, side } — open sockets waiting on a neighbor
    this.foundIds = opts.foundIds ?? new Set(); // suppress already-collected interactables
    this.onChunkLoaded = opts.onChunkLoaded ?? (() => {});
    this._planStart();
  }

  key(cx, cz) { return `${cx},${cz}`; }

  _planStart() {
    // Pre-plan the start cubicle so layout is deterministic.
    const k = this.key(0, 0);
    this.chunkPlan.set(k, { typeId: "start_cubicle", sockets: CHUNK_TYPES.start_cubicle.sockets });
    for (const side of CHUNK_TYPES.start_cubicle.sockets) {
      this.frontier.push({ fromCx: 0, fromCz: 0, side });
    }
  }

  // Determine the type for a chunk based on which side it's being entered from AND on which
  // adjacent chunks are already planned. Constraints:
  //   - MUST have a socket on `requiredSocket` (matches the source that brought us here).
  //   - For every other side: if the neighbor is already planned, our socket on that side must
  //     match (both open or both sealed). Mismatches create one-sided doorways, so we filter
  //     them out at pick time.
  _pickChunkType(cx, cz, requiredSocket) {
    const rng = chunkRng(this.seed, cx, cz);
    const must = new Set([requiredSocket]);
    const forbidden = new Set();
    for (const side of ["N", "S", "E", "W"]) {
      if (side === requiredSocket) continue;
      const [ncx, ncz] = neighborCoord(cx, cz, side);
      const neighbor = this.chunkPlan.get(this.key(ncx, ncz));
      if (!neighbor) continue; // unconstrained — outer edge stays open for future expansion
      if (neighbor.sockets.includes(oppositeSocket(side))) must.add(side);
      else forbidden.add(side);
    }
    const fits = (def) => {
      for (const s of must) if (!def.sockets.includes(s)) return false;
      for (const s of forbidden) if (def.sockets.includes(s)) return false;
      return true;
    };
    const candidates = [];
    for (const [id, def] of Object.entries(CHUNK_TYPES)) {
      if (id === "start_cubicle" || id === "dead_end") continue;
      if (def.weight <= 0) continue;
      if (!fits(def)) continue;
      candidates.push([id, def.weight]);
    }
    if (candidates.length > 0) return weightedPick(rng, candidates);
    // Relaxed pass: drop the forbidden constraint (accept a one-sided doorway as the lesser
    // of two evils) but still respect required sockets so connectivity to source holds.
    const relaxed = [];
    for (const [id, def] of Object.entries(CHUNK_TYPES)) {
      if (id === "start_cubicle" || id === "dead_end") continue;
      if (def.weight <= 0) continue;
      let ok = true;
      for (const s of must) if (!def.sockets.includes(s)) { ok = false; break; }
      if (ok) relaxed.push([id, def.weight]);
    }
    if (relaxed.length > 0) return weightedPick(rng, relaxed);
    return "dead_end";
  }

  _ensurePlanned(cx, cz, requiredSocket) {
    const k = this.key(cx, cz);
    if (this.chunkPlan.has(k)) return this.chunkPlan.get(k);
    const typeId = this._pickChunkType(cx, cz, requiredSocket);
    const def = CHUNK_TYPES[typeId];
    const plan = { typeId, sockets: def.sockets.slice() };
    this.chunkPlan.set(k, plan);
    // Add its remaining sockets to frontier (excluding the side we came in on).
    for (const side of def.sockets) {
      if (side === requiredSocket) continue;
      this.frontier.push({ fromCx: cx, fromCz: cz, side });
    }
    return plan;
  }

  _loadChunk(cx, cz) {
    const k = this.key(cx, cz);
    if (this.loaded.has(k)) return;
    const plan = this.chunkPlan.get(k);
    if (!plan) return; // not planned yet
    const def = CHUNK_TYPES[plan.typeId];
    const rng = chunkRng(this.seed, cx, cz);
    const built = def.build(rng);
    built.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.scene.add(built.group);

    // Offset walls into world coordinates
    const worldWalls = built.walls.map((w) => ({
      x: w.x + cx * CHUNK_SIZE,
      z: w.z + cz * CHUNK_SIZE,
      w: w.w,
      d: w.d,
    }));

    // Place interactable meshes (skip ones already collected)
    const placedInteractables = [];
    for (const it of built.interactables) {
      if (this.foundIds.has(it.id)) continue;
      const mesh = findableMesh(it.type);
      mesh.position.set(it.x + cx * CHUNK_SIZE, it.y, it.z + cz * CHUNK_SIZE);
      mesh.userData = { interactable: { ...it, worldX: mesh.position.x, worldZ: mesh.position.z } };
      built.group.add(mesh);
      placedInteractables.push({ ...it, mesh, worldX: mesh.position.x, worldZ: mesh.position.z });
    }

    const entry = {
      group: built.group,
      walls: worldWalls,
      interactables: placedInteractables,
      typeId: plan.typeId,
      cx, cz,
    };
    this.loaded.set(k, entry);
    this.onChunkLoaded(entry);
  }

  _unloadChunk(cx, cz) {
    const k = this.key(cx, cz);
    const entry = this.loaded.get(k);
    if (!entry) return;
    // Dispose geometry to avoid GPU leaks during long sessions
    entry.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
    });
    this.scene.remove(entry.group);
    this.loaded.delete(k);
  }

  // Plan-only (no mesh build) expansion until a target chunk is planned or the frontier dies.
  // Used on resume so the streamer has plan data ready before the first paint.
  planUntilContains(targetCx, targetCz, maxIter = 5000) {
    const target = this.key(targetCx, targetCz);
    let iter = 0;
    while (this.frontier.length > 0 && iter < maxIter) {
      if (this.chunkPlan.has(target)) return true;
      const f = this.frontier.shift();
      const [ncx, ncz] = neighborCoord(f.fromCx, f.fromCz, f.side);
      const k = this.key(ncx, ncz);
      if (this.chunkPlan.has(k)) { iter++; continue; }
      this._ensurePlanned(ncx, ncz, oppositeSocket(f.side));
      iter++;
    }
    return this.chunkPlan.has(target);
  }

  // Called every frame with current player chunk coord.
  update(playerCx, playerCz) {
    // 1) Expand the plan from frontier sockets within load radius.
    const stillPending = [];
    for (const f of this.frontier) {
      const [ncx, ncz] = neighborCoord(f.fromCx, f.fromCz, f.side);
      const dist = Math.max(Math.abs(ncx - playerCx), Math.abs(ncz - playerCz));
      if (dist > this.loadRadius + 1) {
        stillPending.push(f);
        continue;
      }
      const k = this.key(ncx, ncz);
      if (this.chunkPlan.has(k)) {
        // Already planned; just verify socket compatibility (if not compatible, leave a sealed
        // cap on this side by skipping placement — handled implicitly: walls stay closed).
        continue;
      }
      const required = oppositeSocket(f.side);
      this._ensurePlanned(ncx, ncz, required);
    }
    this.frontier = stillPending;

    // 2) Load every planned chunk within load radius.
    for (const [k, plan] of this.chunkPlan) {
      if (this.loaded.has(k)) continue;
      const [cx, cz] = k.split(",").map(Number);
      const dist = Math.max(Math.abs(cx - playerCx), Math.abs(cz - playerCz));
      if (dist <= this.loadRadius) {
        this._loadChunk(cx, cz);
      }
    }

    // 3) Unload chunks outside unload radius.
    for (const [k, entry] of this.loaded) {
      const dist = Math.max(Math.abs(entry.cx - playerCx), Math.abs(entry.cz - playerCz));
      if (dist > this.unloadRadius) {
        this._unloadChunk(entry.cx, entry.cz);
      }
    }
  }

  // Collision: returns true if a point with `radius` would overlap any wall in loaded chunks.
  isBlocked(x, z, radius = 0.3) {
    for (const entry of this.loaded.values()) {
      for (const w of entry.walls) {
        if (
          x + radius > w.x && x - radius < w.x + w.w &&
          z + radius > w.z && z - radius < w.z + w.d
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // Find the nearest interactable in front of the camera within `range`.
  raycastInteractable(originX, originZ, dirX, dirZ, range = 2.0) {
    let best = null;
    let bestT = Infinity;
    for (const entry of this.loaded.values()) {
      for (const it of entry.interactables) {
        if (it.mesh.userData.collected) continue;
        const dx = it.worldX - originX;
        const dz = it.worldZ - originZ;
        const t = dx * dirX + dz * dirZ; // distance along ray
        if (t < 0 || t > range) continue;
        // perpendicular distance from ray
        const px = dx - dirX * t;
        const pz = dz - dirZ * t;
        const perp2 = px * px + pz * pz;
        if (perp2 > 0.45 * 0.45) continue; // ~ radius around interactable
        if (t < bestT) {
          bestT = t;
          best = it;
        }
      }
    }
    return best;
  }

  // Player-chunk coord of a world position.
  chunkOf(x, z) {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  collectInteractable(it) {
    it.mesh.userData.collected = true;
    it.mesh.visible = false;
  }

  // Used on resume to mark all known foundIds as collected (suppresses re-spawn).
  registerFound(id) {
    this.foundIds.add(id);
  }
}
