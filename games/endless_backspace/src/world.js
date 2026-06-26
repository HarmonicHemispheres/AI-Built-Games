import * as THREE from "three";
import { CHUNK_TYPES, CHUNK_SIZE, neighborCoord, oppositeSocket } from "./chunks.js";
import { chunkRng, weightedPick } from "./rng.js";
import { findableMesh } from "./findables.js";

// World owns:
//   - Per-level chunk planning + streaming
//   - Collision + raycast against the active level's loaded chunks
//   - Level transitions (up/down stairs)
//
// Chunks live on a 2D integer grid (cx, cz) per level. Multi-cell rooms occupy a contiguous
// footprint of cells but expose external sockets only on the entry cell (others are interior).
// `chunkPlan` entries are tagged:
//   { kind: "origin", typeId, ocx, ocz, footprint, entryCell, sockets }
//   { kind: "claim",  ocx, ocz }   // non-origin cell of a multi-cell room; ocx/ocz point to origin

const STARTER_TYPE_PER_LEVEL = (level) => (level === 0 ? "start_cubicle" : "stairwell_n");

export class World {
  constructor(scene, seed, opts = {}) {
    this.scene = scene;
    this.seed = seed;
    this.loadRadius = opts.loadRadius ?? 3;
    this.unloadRadius = opts.unloadRadius ?? 5;
    this.foundIds = opts.foundIds ?? new Set();
    this.onChunkLoaded = opts.onChunkLoaded ?? (() => {});
    this.onLevelChanged = opts.onLevelChanged ?? (() => {});

    this.levels = new Map(); // level (number) -> LevelData
    this.currentLevel = 0;
    this._ensureLevel(0);
  }

  // ---------- level management ----------

  _ensureLevel(level) {
    if (this.levels.has(level)) return this.levels.get(level);
    const data = {
      level,
      chunkPlan: new Map(),
      loaded: new Map(),
      frontier: [],
    };
    // Plant the starter chunk for this level.
    const typeId = STARTER_TYPE_PER_LEVEL(level);
    const def = CHUNK_TYPES[typeId];
    data.chunkPlan.set(this.key(0, 0), {
      kind: "origin",
      typeId,
      ocx: 0, ocz: 0,
      footprint: def.footprint,
      entryCell: def.entryCell,
      sockets: def.sockets.slice(),
    });
    for (const side of def.sockets) {
      data.frontier.push({ fromCx: 0, fromCz: 0, side });
    }
    this.levels.set(level, data);
    return data;
  }

  _level() {
    return this.levels.get(this.currentLevel);
  }

  get loaded() { return this._level().loaded; }
  get chunkPlan() { return this._level().chunkPlan; }
  get frontier() { return this._level().frontier; }

  // Unload all of the current level's chunks from the scene, switch to a new level (creating
  // it if needed), and immediately stream around the player's target position so the first
  // frame on the new level has geometry.
  switchToLevel(newLevel, playerTargetCx, playerTargetCz) {
    if (newLevel === this.currentLevel) return;
    // Unload current level's geometry
    for (const [, entry] of this._level().loaded) {
      entry.group.traverse((o) => o.geometry?.dispose?.());
      this.scene.remove(entry.group);
    }
    this._level().loaded.clear();

    this.currentLevel = newLevel;
    this._ensureLevel(newLevel);

    if (playerTargetCx !== undefined && playerTargetCz !== undefined) {
      this.planUntilContains(playerTargetCx, playerTargetCz);
      this.update(playerTargetCx, playerTargetCz);
    }
    this.onLevelChanged(newLevel);
  }

  key(cx, cz) { return `${cx},${cz}`; }

  // ---------- chunk placement / planning ----------

  // Pick a chunk type to satisfy an incoming socket at cell (cx, cz). Considers:
  //   - existing planned neighbors (avoid one-sided doorways)
  //   - multi-cell candidates (their footprint cells must all be unplanned)
  // Returns an object describing the placement: { typeId, originCx, originCz } or null.
  _pickPlacement(cx, cz, requiredSocket) {
    const lvl = this._level();
    const rng = chunkRng(`${this.seed}|L${this.currentLevel}`, cx, cz);
    const must = new Set([requiredSocket]);
    const forbidden = new Set();
    for (const side of ["N", "S", "E", "W"]) {
      if (side === requiredSocket) continue;
      const [ncx, ncz] = neighborCoord(cx, cz, side);
      const neighborPlan = lvl.chunkPlan.get(this.key(ncx, ncz));
      if (!neighborPlan) continue;
      // Resolve to the origin chunk's sockets on its entry cell
      let originPlan = neighborPlan;
      if (neighborPlan.kind === "claim") {
        originPlan = lvl.chunkPlan.get(this.key(neighborPlan.ocx, neighborPlan.ocz));
      }
      // Check whether the neighbor's perimeter cell facing back has a matching socket.
      // For single-cell neighbors this is just `originPlan.sockets.includes(opposite)`.
      // For multi-cell neighbors, the socket has to be on the cell at (ncx, ncz). The neighbor
      // exposes sockets only on its entry cell — so a multi-cell neighbor at a non-entry cell
      // is always sealed on its outer perimeter.
      const neighborEntryGlobal = [
        originPlan.ocx + (originPlan.entryCell?.[0] ?? 0),
        originPlan.ocz + (originPlan.entryCell?.[1] ?? 0),
      ];
      const neighborSocketAtThisCell =
        neighborEntryGlobal[0] === ncx &&
        neighborEntryGlobal[1] === ncz &&
        (originPlan.sockets ?? []).includes(oppositeSocket(side));
      if (neighborSocketAtThisCell) must.add(side);
      else forbidden.add(side);
    }

    // Build candidate (type, origin) pairs.
    const candidates = [];
    for (const [id, def] of Object.entries(CHUNK_TYPES)) {
      if (id === "start_cubicle" || id === "dead_end") continue;
      if (def.weight <= 0) continue;
      if (!def.sockets.includes(requiredSocket)) continue;

      // Multi-cell: origin is offset by entryCell so the entry cell aligns with (cx, cz)
      const ox = cx - def.entryCell[0];
      const oz = cz - def.entryCell[1];

      // All footprint cells must be unplanned on this level
      const footprintFree = def.footprint.every(([dx, dz]) =>
        !lvl.chunkPlan.has(this.key(ox + dx, oz + dz)),
      );
      if (!footprintFree) continue;

      // Entry-cell socket constraints (must / forbidden) — only applies to the entry cell
      // (other footprint cells are interior). For sockets that are required by an already-
      // planned neighbor of the ENTRY cell, our entry cell must have them; for forbidden,
      // must not have them.
      let ok = true;
      for (const s of must) if (!def.sockets.includes(s)) { ok = false; break; }
      if (!ok) continue;
      for (const s of forbidden) if (def.sockets.includes(s)) { ok = false; break; }
      if (!ok) continue;

      candidates.push([{ typeId: id, originCx: ox, originCz: oz }, def.weight]);
    }
    if (candidates.length > 0) return weightedPick(rng, candidates);

    // Relaxed: drop forbidden, accept one-sided doorways
    const relaxed = [];
    for (const [id, def] of Object.entries(CHUNK_TYPES)) {
      if (id === "start_cubicle" || id === "dead_end") continue;
      if (def.weight <= 0) continue;
      if (!def.sockets.includes(requiredSocket)) continue;
      const ox = cx - def.entryCell[0];
      const oz = cz - def.entryCell[1];
      const footprintFree = def.footprint.every(([dx, dz]) =>
        !lvl.chunkPlan.has(this.key(ox + dx, oz + dz)),
      );
      if (!footprintFree) continue;
      let ok = true;
      for (const s of must) if (!def.sockets.includes(s)) { ok = false; break; }
      if (ok) relaxed.push([{ typeId: id, originCx: ox, originCz: oz }, def.weight]);
    }
    if (relaxed.length > 0) return weightedPick(rng, relaxed);

    return { typeId: "dead_end", originCx: cx, originCz: cz };
  }

  _ensurePlanned(cx, cz, requiredSocket) {
    const lvl = this._level();
    const k = this.key(cx, cz);
    if (lvl.chunkPlan.has(k)) return lvl.chunkPlan.get(k);
    const placement = this._pickPlacement(cx, cz, requiredSocket);
    const def = CHUNK_TYPES[placement.typeId];
    const ocx = placement.originCx;
    const oz = placement.originCz;

    // Origin entry
    lvl.chunkPlan.set(this.key(ocx, oz), {
      kind: "origin",
      typeId: placement.typeId,
      ocx, ocz: oz,
      footprint: def.footprint,
      entryCell: def.entryCell,
      sockets: def.sockets.slice(),
    });
    // Claim non-origin footprint cells (for multi-cell rooms)
    for (const [dx, dz] of def.footprint) {
      if (dx === 0 && dz === 0) continue;
      const cellKey = this.key(ocx + dx, oz + dz);
      if (lvl.chunkPlan.has(cellKey)) continue; // shouldn't happen — we checked
      lvl.chunkPlan.set(cellKey, { kind: "claim", ocx, ocz: oz });
    }

    // Add unsatisfied sockets to frontier (only sockets on the entry cell, minus the side that
    // brought us here).
    const entryGlobalCx = ocx + def.entryCell[0];
    const entryGlobalCz = oz + def.entryCell[1];
    for (const side of def.sockets) {
      if (entryGlobalCx === cx && entryGlobalCz === cz && side === requiredSocket) continue;
      lvl.frontier.push({ fromCx: entryGlobalCx, fromCz: entryGlobalCz, side });
    }
    return lvl.chunkPlan.get(k);
  }

  // ---------- chunk loading ----------

  _loadOriginChunk(originPlan) {
    const lvl = this._level();
    const k = this.key(originPlan.ocx, originPlan.ocz);
    if (lvl.loaded.has(k)) return;
    const def = CHUNK_TYPES[originPlan.typeId];
    const rng = chunkRng(`${this.seed}|L${this.currentLevel}`, originPlan.ocx, originPlan.ocz);
    const built = def.build(rng);

    // Position the room so its local origin = world (ocx*CHUNK_SIZE, 0, ocz*CHUNK_SIZE).
    built.group.position.set(originPlan.ocx * CHUNK_SIZE, 0, originPlan.ocz * CHUNK_SIZE);
    this.scene.add(built.group);

    // World-coord walls
    const worldWalls = built.walls.map((w) => ({
      x: w.x + originPlan.ocx * CHUNK_SIZE,
      z: w.z + originPlan.ocz * CHUNK_SIZE,
      w: w.w,
      d: w.d,
    }));

    // Place interactable meshes (skip already-collected ones).
    // For multi-instance interactables that need a unique id per chunk (e.g. door_up), suffix
    // the id with the chunk's origin coords.
    const placedInteractables = [];
    for (const it of built.interactables) {
      const persistent = !!it.persistent;
      const baseId = it.id;
      const id = persistent ? `${baseId}@L${this.currentLevel}_${originPlan.ocx}_${originPlan.ocz}` : baseId;
      if (!persistent && this.foundIds.has(id)) continue;
      const mesh = findableMesh(it.type);
      mesh.position.set(it.x + originPlan.ocx * CHUNK_SIZE, it.y, it.z + originPlan.ocz * CHUNK_SIZE);
      mesh.userData = {
        interactable: { ...it, id, worldX: mesh.position.x, worldZ: mesh.position.z },
      };
      built.group.add(mesh);
      placedInteractables.push({
        ...it, id, mesh,
        worldX: mesh.position.x, worldZ: mesh.position.z,
      });
    }

    const entry = {
      group: built.group,
      walls: worldWalls,
      interactables: placedInteractables,
      typeId: originPlan.typeId,
      ocx: originPlan.ocx,
      ocz: originPlan.ocz,
      footprint: originPlan.footprint,
    };
    lvl.loaded.set(k, entry);
    this.onChunkLoaded(entry);
  }

  _unloadOriginChunk(originKey) {
    const lvl = this._level();
    const entry = lvl.loaded.get(originKey);
    if (!entry) return;
    entry.group.traverse((o) => o.geometry?.dispose?.());
    this.scene.remove(entry.group);
    lvl.loaded.delete(originKey);
  }

  // Plan-only expansion until a target cell is planned (used on resume + level switch).
  planUntilContains(targetCx, targetCz, maxIter = 5000) {
    const lvl = this._level();
    const target = this.key(targetCx, targetCz);
    let iter = 0;
    while (lvl.frontier.length > 0 && iter < maxIter) {
      if (lvl.chunkPlan.has(target)) return true;
      const f = lvl.frontier.shift();
      const [ncx, ncz] = neighborCoord(f.fromCx, f.fromCz, f.side);
      if (lvl.chunkPlan.has(this.key(ncx, ncz))) { iter++; continue; }
      this._ensurePlanned(ncx, ncz, oppositeSocket(f.side));
      iter++;
    }
    return lvl.chunkPlan.has(target);
  }

  // Streaming pass — called every frame.
  update(playerCx, playerCz) {
    const lvl = this._level();

    // 1) Expand frontier within load radius.
    const stillPending = [];
    for (const f of lvl.frontier) {
      const [ncx, ncz] = neighborCoord(f.fromCx, f.fromCz, f.side);
      const dist = Math.max(Math.abs(ncx - playerCx), Math.abs(ncz - playerCz));
      if (dist > this.loadRadius + 1) {
        stillPending.push(f);
        continue;
      }
      if (lvl.chunkPlan.has(this.key(ncx, ncz))) continue;
      this._ensurePlanned(ncx, ncz, oppositeSocket(f.side));
    }
    lvl.frontier = stillPending;

    // 2) Load every origin chunk whose footprint intersects the load radius.
    for (const [, plan] of lvl.chunkPlan) {
      if (plan.kind !== "origin") continue;
      const k = this.key(plan.ocx, plan.ocz);
      if (lvl.loaded.has(k)) continue;
      const minDist = this._minDistToFootprint(plan, playerCx, playerCz);
      if (minDist <= this.loadRadius) this._loadOriginChunk(plan);
    }

    // 3) Unload origin chunks whose entire footprint is beyond the unload radius.
    for (const [k, entry] of lvl.loaded) {
      const minDist = this._minDistToFootprint(entry, playerCx, playerCz);
      if (minDist > this.unloadRadius) this._unloadOriginChunk(k);
    }
  }

  _minDistToFootprint(originLike, playerCx, playerCz) {
    let best = Infinity;
    const fp = originLike.footprint ?? [[0, 0]];
    for (const [dx, dz] of fp) {
      const d = Math.max(Math.abs(originLike.ocx + dx - playerCx),
                         Math.abs(originLike.ocz + dz - playerCz));
      if (d < best) best = d;
    }
    return best;
  }

  // ---------- collision + raycast ----------

  isBlocked(x, z, radius = 0.3) {
    for (const entry of this._level().loaded.values()) {
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

  raycastInteractable(originX, originZ, dirX, dirZ, range = 2.0) {
    let best = null;
    let bestT = Infinity;
    for (const entry of this._level().loaded.values()) {
      for (const it of entry.interactables) {
        if (it.mesh.userData.collected) continue;
        const dx = it.worldX - originX;
        const dz = it.worldZ - originZ;
        const t = dx * dirX + dz * dirZ;
        if (t < 0 || t > range) continue;
        const px = dx - dirX * t;
        const pz = dz - dirZ * t;
        const perp2 = px * px + pz * pz;
        if (perp2 > 0.45 * 0.45) continue;
        if (t < bestT) {
          bestT = t;
          best = it;
        }
      }
    }
    return best;
  }

  chunkOf(x, z) {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  collectInteractable(it) {
    it.mesh.userData.collected = true;
    it.mesh.visible = false;
  }

  registerFound(id) {
    this.foundIds.add(id);
  }
}
