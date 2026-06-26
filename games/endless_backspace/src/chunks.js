import * as THREE from "three";

// Each chunk is CHUNK_SIZE x CHUNK_SIZE units on the XZ plane.
// Walls are stored as world-axis-aligned rectangles in chunk-local coords (0..CHUNK_SIZE).
// The streamer offsets walls and meshes by (cx*CHUNK_SIZE, 0, cz*CHUNK_SIZE).

export const CHUNK_SIZE = 8;
export const WALL_HEIGHT = 3;
export const WALL_THICKNESS = 0.2;
export const DOOR_HALF = 1.0; // door is 2.0 units wide

// ---------- materials ----------
const mats = {
  floor:       new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.95, metalness: 0.0 }),
  floorTile:   new THREE.MeshStandardMaterial({ color: 0x9a958a, roughness: 0.55 }),
  floorLab:    new THREE.MeshStandardMaterial({ color: 0x6e7682, roughness: 0.5 }),
  floorConcrete: new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.85 }),
  ceiling:     new THREE.MeshStandardMaterial({ color: 0xe8e4dd, roughness: 0.9 }),
  wall:        new THREE.MeshStandardMaterial({ color: 0xc9b896, roughness: 0.85 }),
  wallTrim:    new THREE.MeshStandardMaterial({ color: 0x5a4a30, roughness: 0.6 }),
  door:        new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.7 }),
  doorSealed:  new THREE.MeshStandardMaterial({ color: 0x2c2a26, roughness: 0.4, metalness: 0.55, emissive: 0x080705, emissiveIntensity: 0.4 }),
  desk:        new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.6 }),
  chair:       new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5 }),
  partition:   new THREE.MeshStandardMaterial({ color: 0x6b6b5a, roughness: 0.95 }),
  paper:       new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.6, emissive: 0x100c00, emissiveIntensity: 0.05 }),
  battery:     new THREE.MeshStandardMaterial({ color: 0xcc8a30, roughness: 0.4, metalness: 0.6, emissive: 0x553200, emissiveIntensity: 0.4 }),
  tape:        new THREE.MeshStandardMaterial({ color: 0x202024, roughness: 0.5, metalness: 0.1 }),
  polaroid:    new THREE.MeshStandardMaterial({ color: 0xe6dfc8, roughness: 0.5 }),
  column:      new THREE.MeshStandardMaterial({ color: 0xb6a684, roughness: 0.85 }),
  seal:        new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.7, emissive: 0x1a1408, emissiveIntensity: 0.1 }),
  shelf:       new THREE.MeshStandardMaterial({ color: 0x4a3820, roughness: 0.7 }),
  steel:       new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.35, metalness: 0.55 }),
  steelDark:   new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.45, metalness: 0.55 }),
  glassware:   new THREE.MeshStandardMaterial({ color: 0xa6c8d8, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.45 }),
  reception:   new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.55 }),
  receptionTop: new THREE.MeshStandardMaterial({ color: 0x7a6a4a, roughness: 0.45 }),
  velvet:      new THREE.MeshStandardMaterial({ color: 0x4a2018, roughness: 0.8 }),
  rail:        new THREE.MeshStandardMaterial({ color: 0x303236, roughness: 0.5, metalness: 0.5 }),
  signRed:     new THREE.MeshStandardMaterial({ color: 0x331010, roughness: 0.7, emissive: 0xaa3020, emissiveIntensity: 0.5 }),
};

// ---------- helpers ----------

function addBox(group, mat, x, y, z, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x + w / 2, y + h / 2, z + d / 2);
  group.add(m);
  return m;
}

function buildFloorCeiling(group, opts = {}) {
  const floorMat = opts.floorMat ?? mats.floor;
  const ceilMat = opts.ceilMat ?? mats.ceiling;
  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CHUNK_SIZE / 2, 0, CHUNK_SIZE / 2);
  group.add(floor);
  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(CHUNK_SIZE / 2, WALL_HEIGHT, CHUNK_SIZE / 2);
  group.add(ceil);
}

// Build a perimeter around the union of footprint cells, with a door opening on each
// (cellOffset, side) listed in `sockets`. Skips any wall segment that's internal to the
// footprint (between two cells of the same room). Coordinates are room-local: cell [dx, dz]
// covers world-local (dx*CHUNK_SIZE..(dx+1)*CHUNK_SIZE, dz*CHUNK_SIZE..(dz+1)*CHUNK_SIZE).
function buildFootprintPerimeter(group, footprint, sockets) {
  const cellSet = new Set(footprint.map(([dx, dz]) => `${dx},${dz}`));
  const walls = [];

  function addWallBox(x, z, w, d) {
    walls.push({ x, z, w, d });
    addBox(group, mats.wall, x, 0, z, w, WALL_HEIGHT, d);
    const trimOut = 0.012;
    addBox(group, mats.wallTrim, x - trimOut, 0, z - trimOut, w + trimOut * 2, 0.18, d + trimOut * 2);
  }
  function addLintel(x, y, z, w, h, d) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall);
    lintel.position.set(x + w / 2, y + h / 2, z + d / 2);
    group.add(lintel);
  }
  const hasSocket = (dx, dz, side) =>
    sockets.some((s) => s.cell[0] === dx && s.cell[1] === dz && s.side === side);

  // Per-cell perimeter: for each cell, examine each side; if the neighbor cell is part of the
  // footprint, skip the wall (it's interior). Otherwise build a wall (with optional door cut).
  for (const [dx, dz] of footprint) {
    const cx0 = dx * CHUNK_SIZE;
    const cz0 = dz * CHUNK_SIZE;
    const cx1 = cx0 + CHUNK_SIZE;
    const cz1 = cz0 + CHUNK_SIZE;

    // North side (z = cz0)
    if (!cellSet.has(`${dx},${dz - 1}`)) {
      if (hasSocket(dx, dz, "N")) {
        const seg = CHUNK_SIZE / 2 - DOOR_HALF;
        addWallBox(cx0, cz0, seg, WALL_THICKNESS);
        addWallBox(cx0 + CHUNK_SIZE / 2 + DOOR_HALF, cz0, seg, WALL_THICKNESS);
        addLintel(cx0 + CHUNK_SIZE / 2 - DOOR_HALF, WALL_HEIGHT - 0.5, cz0, DOOR_HALF * 2, 0.5, WALL_THICKNESS);
      } else {
        addWallBox(cx0, cz0, CHUNK_SIZE, WALL_THICKNESS);
      }
    }
    // South side (z = cz1 - WALL_THICKNESS)
    if (!cellSet.has(`${dx},${dz + 1}`)) {
      if (hasSocket(dx, dz, "S")) {
        const seg = CHUNK_SIZE / 2 - DOOR_HALF;
        addWallBox(cx0, cz1 - WALL_THICKNESS, seg, WALL_THICKNESS);
        addWallBox(cx0 + CHUNK_SIZE / 2 + DOOR_HALF, cz1 - WALL_THICKNESS, seg, WALL_THICKNESS);
        addLintel(cx0 + CHUNK_SIZE / 2 - DOOR_HALF, WALL_HEIGHT - 0.5, cz1 - WALL_THICKNESS, DOOR_HALF * 2, 0.5, WALL_THICKNESS);
      } else {
        addWallBox(cx0, cz1 - WALL_THICKNESS, CHUNK_SIZE, WALL_THICKNESS);
      }
    }
    // East side (x = cx1 - WALL_THICKNESS)
    if (!cellSet.has(`${dx + 1},${dz}`)) {
      if (hasSocket(dx, dz, "E")) {
        const seg = CHUNK_SIZE / 2 - DOOR_HALF;
        addWallBox(cx1 - WALL_THICKNESS, cz0, WALL_THICKNESS, seg);
        addWallBox(cx1 - WALL_THICKNESS, cz0 + CHUNK_SIZE / 2 + DOOR_HALF, WALL_THICKNESS, seg);
        addLintel(cx1 - WALL_THICKNESS, WALL_HEIGHT - 0.5, cz0 + CHUNK_SIZE / 2 - DOOR_HALF, WALL_THICKNESS, 0.5, DOOR_HALF * 2);
      } else {
        addWallBox(cx1 - WALL_THICKNESS, cz0, WALL_THICKNESS, CHUNK_SIZE);
      }
    }
    // West side (x = cx0)
    if (!cellSet.has(`${dx - 1},${dz}`)) {
      if (hasSocket(dx, dz, "W")) {
        const seg = CHUNK_SIZE / 2 - DOOR_HALF;
        addWallBox(cx0, cz0, WALL_THICKNESS, seg);
        addWallBox(cx0, cz0 + CHUNK_SIZE / 2 + DOOR_HALF, WALL_THICKNESS, seg);
        addLintel(cx0, WALL_HEIGHT - 0.5, cz0 + CHUNK_SIZE / 2 - DOOR_HALF, WALL_THICKNESS, 0.5, DOOR_HALF * 2);
      } else {
        addWallBox(cx0, cz0, WALL_THICKNESS, CHUNK_SIZE);
      }
    }
  }

  return { walls };
}

// Build floor + ceiling planes for every cell in the footprint.
function buildFootprintFloorCeiling(group, footprint, opts = {}) {
  const floorMat = opts.floorMat ?? mats.floor;
  const ceilMat = opts.ceilMat ?? mats.ceiling;
  for (const [dx, dz] of footprint) {
    const cx = dx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const cz = dz * CHUNK_SIZE + CHUNK_SIZE / 2;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE), ceilMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, WALL_HEIGHT, cz);
    group.add(ceil);
  }
}

// Single-cell perimeter (preserved for compatibility with existing builders).
function buildPerimeter(group, sockets) {
  const walls = [];

  function addWallBox(x, z, w, d) {
    walls.push({ x, z, w, d });
    addBox(group, mats.wall, x, 0, z, w, WALL_HEIGHT, d);
    // Baseboard trim — expanded outward so its faces don't co-plane with the wall and z-fight.
    const trimOut = 0.012;
    addBox(group, mats.wallTrim, x - trimOut, 0, z - trimOut, w + trimOut * 2, 0.18, d + trimOut * 2);
  }
  function addLintel(x, y, z, w, h, d) {
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.wall);
    lintel.position.set(x + w / 2, y + h / 2, z + d / 2);
    group.add(lintel);
  }

  // North wall (z=0)
  if (sockets.includes("N")) {
    const seg = CHUNK_SIZE / 2 - DOOR_HALF;
    addWallBox(0, 0, seg, WALL_THICKNESS);
    addWallBox(CHUNK_SIZE / 2 + DOOR_HALF, 0, seg, WALL_THICKNESS);
    addLintel(CHUNK_SIZE / 2 - DOOR_HALF, WALL_HEIGHT - 0.5, 0, DOOR_HALF * 2, 0.5, WALL_THICKNESS);
  } else {
    addWallBox(0, 0, CHUNK_SIZE, WALL_THICKNESS);
  }
  // South wall (z=CHUNK_SIZE - WALL_THICKNESS)
  if (sockets.includes("S")) {
    const seg = CHUNK_SIZE / 2 - DOOR_HALF;
    addWallBox(0, CHUNK_SIZE - WALL_THICKNESS, seg, WALL_THICKNESS);
    addWallBox(CHUNK_SIZE / 2 + DOOR_HALF, CHUNK_SIZE - WALL_THICKNESS, seg, WALL_THICKNESS);
    addLintel(CHUNK_SIZE / 2 - DOOR_HALF, WALL_HEIGHT - 0.5, CHUNK_SIZE - WALL_THICKNESS, DOOR_HALF * 2, 0.5, WALL_THICKNESS);
  } else {
    addWallBox(0, CHUNK_SIZE - WALL_THICKNESS, CHUNK_SIZE, WALL_THICKNESS);
  }
  // East wall (x=CHUNK_SIZE - WALL_THICKNESS)
  if (sockets.includes("E")) {
    const seg = CHUNK_SIZE / 2 - DOOR_HALF;
    addWallBox(CHUNK_SIZE - WALL_THICKNESS, 0, WALL_THICKNESS, seg);
    addWallBox(CHUNK_SIZE - WALL_THICKNESS, CHUNK_SIZE / 2 + DOOR_HALF, WALL_THICKNESS, seg);
    addLintel(CHUNK_SIZE - WALL_THICKNESS, WALL_HEIGHT - 0.5, CHUNK_SIZE / 2 - DOOR_HALF, WALL_THICKNESS, 0.5, DOOR_HALF * 2);
  } else {
    addWallBox(CHUNK_SIZE - WALL_THICKNESS, 0, WALL_THICKNESS, CHUNK_SIZE);
  }
  // West wall (x=0)
  if (sockets.includes("W")) {
    const seg = CHUNK_SIZE / 2 - DOOR_HALF;
    addWallBox(0, 0, WALL_THICKNESS, seg);
    addWallBox(0, CHUNK_SIZE / 2 + DOOR_HALF, WALL_THICKNESS, seg);
    addLintel(0, WALL_HEIGHT - 0.5, CHUNK_SIZE / 2 - DOOR_HALF, WALL_THICKNESS, 0.5, DOOR_HALF * 2);
  } else {
    addWallBox(0, 0, WALL_THICKNESS, CHUNK_SIZE);
  }

  return { walls };
}

function buildCeilingLight(group, x, z, color = 0xfff2cc, intensity = 1.6, flicker = false) {
  // Visible fixture
  const fix = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.06, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xeeeae0, emissive: color, emissiveIntensity: 1.4 }),
  );
  fix.position.set(x, WALL_HEIGHT - 0.08, z);
  group.add(fix);

  // Light source
  const light = new THREE.PointLight(color, intensity, 9, 1.4);
  light.position.set(x, WALL_HEIGHT - 0.2, z);
  group.add(light);

  if (flicker) {
    light.userData.flicker = {
      base: intensity,
      phase: Math.random() * Math.PI * 2,
      nextEventAt: 0,
      offDuration: 0,
    };
    fix.userData.flickerFixture = true;
  }
  return { light, fixture: fix };
}

// ---------- chunk builders ----------

function buildStartCubicle(rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, ["S"]);

  // Half-height cubicle partition near the south door — forces the player around it.
  addBox(group, mats.partition, 0.8, 0, 5.4, 3.6, 1.4, 0.10);
  walls.push({ x: 0.8, z: 5.4, w: 3.6, d: 0.10 });

  // Desk along east side
  addBox(group, mats.desk, 5.3, 0.78, 1.4, 2.3, 0.05, 2.2);
  addBox(group, mats.desk, 5.35, 0, 1.45, 0.1, 0.78, 0.1);
  addBox(group, mats.desk, 7.45, 0, 1.45, 0.1, 0.78, 0.1);
  addBox(group, mats.desk, 5.35, 0, 3.45, 0.1, 0.78, 0.1);
  addBox(group, mats.desk, 7.45, 0, 3.45, 0.1, 0.78, 0.1);

  // Chair
  addBox(group, mats.chair, 4.2, 0.5, 2.2, 0.7, 0.06, 0.7);
  addBox(group, mats.chair, 4.2, 0.5, 2.86, 0.7, 0.78, 0.06);

  // One flickering fluorescent overhead.
  buildCeilingLight(group, 4.0, 4.0, 0xfff2cc, 1.6, true);

  const interactables = [
    { type: "document", id: "doc_welcome", x: 6.0, y: 0.85, z: 2.0 },
    { type: "battery", id: `battery_${Math.floor(rng() * 1e9).toString(36)}`, x: 6.8, y: 0.85, z: 2.6 },
  ];
  return { group, walls, interactables, kind: "start_cubicle" };
}

function buildCorridorStraight(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, sockets);
  // Single central light — flashlight + ambience handles the rest.
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xfff2cc, 1.4, rng() < 0.25);
  return { group, walls, interactables: [], kind: "corridor" };
}

function buildCorridorT(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, sockets);
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xfff2cc, 1.6, rng() < 0.2);
  return { group, walls, interactables: [], kind: "corridor_t" };
}

function buildOffice(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, sockets);

  const corner = pickCorner(rng);
  const dx = corner.x;
  const dz = corner.z;
  addBox(group, mats.desk, dx, 0.78, dz, 2.0, 0.05, 1.2);
  addBox(group, mats.desk, dx + 0.05, 0, dz + 0.05, 0.08, 0.78, 0.08);
  addBox(group, mats.desk, dx + 1.87, 0, dz + 0.05, 0.08, 0.78, 0.08);
  addBox(group, mats.desk, dx + 0.05, 0, dz + 1.07, 0.08, 0.78, 0.08);
  addBox(group, mats.desk, dx + 1.87, 0, dz + 1.07, 0.08, 0.78, 0.08);
  const chairZ = dz < CHUNK_SIZE / 2 ? dz + 1.4 : dz - 1.0;
  addBox(group, mats.chair, dx + 0.7, 0.5, chairZ, 0.6, 0.06, 0.6);
  const opp = oppositeCorner(corner);
  addBox(group, mats.shelf, opp.x, 0, opp.z, 1.6, 2.1, 0.4);
  walls.push({ x: opp.x, z: opp.z, w: 1.6, d: 0.4 });

  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xfff2cc, 1.4, rng() < 0.15);

  const interactables = [];
  if (rng() < 0.45) {
    const type = rng() < 0.7 ? "document" : (rng() < 0.5 ? "tape" : "polaroid");
    interactables.push({
      type,
      id: `${type}_${Math.floor(rng() * 1e9).toString(36)}`,
      x: dx + 0.7 + rng() * 0.6, y: 0.85, z: dz + 0.4 + rng() * 0.4,
    });
  }
  if (rng() < 0.18) {
    interactables.push({
      type: "battery",
      id: `battery_${Math.floor(rng() * 1e9).toString(36)}`,
      x: dx + 1.1 + rng() * 0.4, y: 0.85, z: dz + 0.7,
    });
  }
  return { group, walls, interactables, kind: "office" };
}

function pickCorner(rng) {
  const options = [
    { x: 0.6, z: 0.6 },
    { x: CHUNK_SIZE - 2.6, z: 0.6 },
    { x: 0.6, z: CHUNK_SIZE - 2.0 },
    { x: CHUNK_SIZE - 2.6, z: CHUNK_SIZE - 2.0 },
  ];
  return options[Math.floor(rng() * options.length)];
}
function oppositeCorner(c) {
  const cx = c.x < CHUNK_SIZE / 2 ? CHUNK_SIZE - 2.0 : 0.4;
  const cz = c.z < CHUNK_SIZE / 2 ? CHUNK_SIZE - 0.6 : 0.4;
  return { x: cx, z: cz };
}

function buildCubicleFarm(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, sockets);

  const cubicleSize = 2.6;
  const startX = 1.2;
  const startZ = 1.4;
  const interactables = [];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = startX + i * (cubicleSize + 0.2);
      const cz = startZ + j * (cubicleSize + 0.2);
      addBox(group, mats.partition, cx, 0, cz, cubicleSize, 1.3, 0.06);
      addBox(group, mats.partition, cx, 0, cz, 0.06, 1.3, cubicleSize);
      walls.push({ x: cx, z: cz, w: cubicleSize, d: 0.06 });
      walls.push({ x: cx, z: cz, w: 0.06, d: cubicleSize });
      addBox(group, mats.desk, cx + 0.4, 0.78, cz + 1.6, 1.6, 0.04, 0.7);
      if (rng() < 0.30) {
        interactables.push({
          type: "document",
          id: `doc_${Math.floor(rng() * 1e9).toString(36)}`,
          x: cx + 0.8 + rng() * 0.4, y: 0.85, z: cz + 1.7,
        });
      }
    }
  }
  // Single central light
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xfff2cc, 1.4, rng() < 0.3);
  return { group, walls, interactables, kind: "cubicle_farm" };
}

function buildFoyer(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group, { floorMat: mats.floorTile });
  const { walls } = buildPerimeter(group, sockets);

  // Government seal on the floor
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.04, 36), mats.seal);
  seal.position.set(CHUNK_SIZE / 2, 0.02, CHUNK_SIZE / 2);
  group.add(seal);

  // Central column
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, WALL_HEIGHT, 16), mats.column);
  col.position.set(CHUNK_SIZE / 2, WALL_HEIGHT / 2, CHUNK_SIZE / 2);
  group.add(col);
  walls.push({ x: CHUNK_SIZE / 2 - 0.5, z: CHUNK_SIZE / 2 - 0.5, w: 1.0, d: 1.0 });

  // Two ceiling lights — bigger room earns extra illumination.
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2 - 2.2, 0xfff6dc, 1.8, false);
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2 + 2.2, 0xfff6dc, 1.8, false);
  return { group, walls, interactables: [], kind: "foyer" };
}

// Lobby / check-in: 4-socket, large open feel, reception counter + columns + lounge chairs.
function buildLobby(rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group, { floorMat: mats.floorTile });
  const { walls } = buildPerimeter(group, ["N", "S", "E", "W"]);

  // Reception counter against one of the two walls perpendicular to door axes — pick by rng
  const side = rng() < 0.5 ? "north" : "east";
  if (side === "north") {
    // Counter L-shape near the north interior corner (away from doors which are centered).
    addBox(group, mats.reception, 1.2, 0, 1.4, 3.4, 1.05, 0.6);
    addBox(group, mats.receptionTop, 1.2, 1.05, 1.4, 3.4, 0.05, 0.6);
    addBox(group, mats.reception, 4.6, 0, 1.4, 0.6, 1.05, 1.6);
    addBox(group, mats.receptionTop, 4.6, 1.05, 1.4, 0.6, 0.05, 1.6);
    walls.push({ x: 1.2, z: 1.4, w: 3.4, d: 0.6 });
    walls.push({ x: 4.6, z: 1.4, w: 0.6, d: 1.6 });
  } else {
    addBox(group, mats.reception, 1.4, 0, 1.2, 0.6, 1.05, 3.4);
    addBox(group, mats.receptionTop, 1.4, 1.05, 1.2, 0.6, 0.05, 3.4);
    addBox(group, mats.reception, 1.4, 0, 4.6, 1.6, 1.05, 0.6);
    addBox(group, mats.receptionTop, 1.4, 1.05, 4.6, 1.6, 0.05, 0.6);
    walls.push({ x: 1.4, z: 1.2, w: 0.6, d: 3.4 });
    walls.push({ x: 1.4, z: 4.6, w: 1.6, d: 0.6 });
  }

  // Two columns, symmetric, for that institutional feel
  for (const [px, pz] of [[2.6, 5.6], [5.4, 5.6]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, WALL_HEIGHT, 14), mats.column);
    col.position.set(px, WALL_HEIGHT / 2, pz);
    group.add(col);
    walls.push({ x: px - 0.32, z: pz - 0.32, w: 0.64, d: 0.64 });
  }

  // A trio of lounge chairs facing the center
  for (let i = 0; i < 3; i++) {
    const cx = 3.4 + i * 0.8;
    addBox(group, mats.velvet, cx, 0.4, 3.6, 0.6, 0.06, 0.6); // seat
    addBox(group, mats.velvet, cx, 0.4, 4.2, 0.6, 0.5, 0.06); // backrest
  }

  buildCeilingLight(group, CHUNK_SIZE / 2 - 1.4, CHUNK_SIZE / 2, 0xfff6dc, 1.8, false);
  buildCeilingLight(group, CHUNK_SIZE / 2 + 1.4, CHUNK_SIZE / 2, 0xfff6dc, 1.8, false);

  const interactables = [];
  if (rng() < 0.5) {
    // A document on the reception counter
    const x = side === "north" ? 2.0 + rng() * 1.6 : 1.5;
    const z = side === "north" ? 1.6 : 2.0 + rng() * 1.6;
    interactables.push({
      type: "document",
      id: `doc_${Math.floor(rng() * 1e9).toString(36)}`,
      x, y: 1.12, z,
    });
  }
  return { group, walls, interactables, kind: "lobby" };
}

// Lab: 2-socket along one axis. Steel benches on the perpendicular walls + fume hood + glassware.
function buildLab(sockets, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group, { floorMat: mats.floorLab });
  const { walls } = buildPerimeter(group, sockets);

  const corridorIsNS = sockets.includes("N") && sockets.includes("S");
  const interactables = [];

  if (corridorIsNS) {
    // Two long benches on the east & west walls
    addBox(group, mats.steel, 0.4, 0,    1.2, 1.0, 0.85, 5.6); // west cabinet base
    addBox(group, mats.steel, 0.4, 0.85, 1.2, 1.1, 0.05, 5.6); // west bench top
    walls.push({ x: 0.4, z: 1.2, w: 1.1, d: 5.6 });
    addBox(group, mats.steel, 6.6, 0,    1.2, 1.0, 0.85, 5.6);
    addBox(group, mats.steel, 6.6, 0.85, 1.2, 1.1, 0.05, 5.6);
    walls.push({ x: 6.5, z: 1.2, w: 1.1, d: 5.6 });

    // Fume hood (tall steel cabinet) at north end on east wall
    addBox(group, mats.steelDark, 6.4, 0, 0.4, 1.3, 2.4, 0.8);
    walls.push({ x: 6.4, z: 0.4, w: 1.3, d: 0.8 });

    // Glassware decorations on benches
    for (let i = 0; i < 4; i++) {
      const gx = 0.85;
      const gz = 1.6 + i * 1.2;
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), mats.glassware);
      beaker.position.set(gx, 0.85 + 0.11, gz);
      group.add(beaker);
    }
  } else {
    // E/W lab: benches on north & south walls
    addBox(group, mats.steel, 1.2, 0,    0.4, 5.6, 0.85, 1.0);
    addBox(group, mats.steel, 1.2, 0.85, 0.4, 5.6, 0.05, 1.1);
    walls.push({ x: 1.2, z: 0.4, w: 5.6, d: 1.1 });
    addBox(group, mats.steel, 1.2, 0,    6.6, 5.6, 0.85, 1.0);
    addBox(group, mats.steel, 1.2, 0.85, 6.6, 5.6, 0.05, 1.1);
    walls.push({ x: 1.2, z: 6.5, w: 5.6, d: 1.1 });

    addBox(group, mats.steelDark, 0.4, 0, 6.4, 0.8, 2.4, 1.3);
    walls.push({ x: 0.4, z: 6.4, w: 0.8, d: 1.3 });

    for (let i = 0; i < 4; i++) {
      const gx = 1.6 + i * 1.2;
      const gz = 0.85;
      const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 10), mats.glassware);
      beaker.position.set(gx, 0.85 + 0.11, gz);
      group.add(beaker);
    }
  }

  // Findables: 60% chance for a clinical document, 25% for a tape (interview transcript vibe).
  if (rng() < 0.6) {
    const x = corridorIsNS ? 1.0 : 4.0;
    const z = corridorIsNS ? 4.0 : 1.0;
    interactables.push({
      type: "document",
      id: `doc_${Math.floor(rng() * 1e9).toString(36)}`,
      x, y: 0.92, z,
    });
  }
  if (rng() < 0.25) {
    const x = corridorIsNS ? 6.9 : 4.0;
    const z = corridorIsNS ? 4.0 : 6.9;
    interactables.push({
      type: "tape",
      id: `tape_${Math.floor(rng() * 1e9).toString(36)}`,
      x, y: 0.92, z,
    });
  }

  // Cool clinical light
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xddeeff, 1.5, rng() < 0.3);
  return { group, walls, interactables, kind: "lab" };
}

// Stairwell: 1-socket. Stairs going up to a sealed metal door (visual cue of "down to subsector").
function buildStairwell(socket, rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group, { floorMat: mats.floorConcrete });
  const { walls } = buildPerimeter(group, [socket]);

  // Position stairs against the wall opposite the door.
  // Stair dir = "the side we ascend toward" — opposite of the door.
  // Door is on `socket` side; opp side is where the staircase backs into.
  const opp = oppositeSocket(socket);

  // Stair geometry: 6 ascending boxes 2.0m wide, 0.4m deep, 0.18m rise each → top at y=1.08
  const STEP_W = 2.0;        // step span perpendicular to ascent direction
  const STEP_DEEP = 0.40;    // along ascent direction
  const STEP_RISE = 0.18;
  const STEPS = 6;
  const TOP_Y = STEPS * STEP_RISE;

  // Direction vector for ascent + position of the foot of the stair so the top step's far edge
  // is flush with the inner edge of the landing slab against the back wall.
  // For dirZ=+1 (opp=S):  landing at lz=CHUNK_SIZE-WALL_THICKNESS-1.0, foot baseZ = lz - STEPS*STEP_DEEP
  // For dirZ=-1 (opp=N):  landing at lz=WALL_THICKNESS, foot baseZ = lz + 1.0 + STEPS*STEP_DEEP
  let dirX = 0, dirZ = 0;
  let baseX = 0, baseZ = 0;
  const LANDING_DEPTH = 1.0;
  switch (opp) {
    case "S":
      dirZ = +1;
      baseX = CHUNK_SIZE / 2 - STEP_W / 2;
      baseZ = (CHUNK_SIZE - WALL_THICKNESS - LANDING_DEPTH) - STEPS * STEP_DEEP;
      break;
    case "N":
      dirZ = -1;
      baseX = CHUNK_SIZE / 2 - STEP_W / 2;
      baseZ = WALL_THICKNESS + LANDING_DEPTH + STEPS * STEP_DEEP;
      break;
    case "E":
      dirX = +1;
      baseX = (CHUNK_SIZE - WALL_THICKNESS - LANDING_DEPTH) - STEPS * STEP_DEEP;
      baseZ = CHUNK_SIZE / 2 - STEP_W / 2;
      break;
    case "W":
      dirX = -1;
      baseX = WALL_THICKNESS + LANDING_DEPTH + STEPS * STEP_DEEP;
      baseZ = CHUNK_SIZE / 2 - STEP_W / 2;
      break;
  }

  for (let i = 0; i < STEPS; i++) {
    const cumRise = (i + 1) * STEP_RISE;
    let sx, sz, sw, sd;
    if (dirZ !== 0) {
      sx = baseX;
      sz = baseZ + i * STEP_DEEP * dirZ - (dirZ < 0 ? STEP_DEEP : 0);
      sw = STEP_W;
      sd = STEP_DEEP;
    } else {
      sx = baseX + i * STEP_DEEP * dirX - (dirX < 0 ? STEP_DEEP : 0);
      sz = baseZ;
      sw = STEP_DEEP;
      sd = STEP_W;
    }
    addBox(group, mats.steel, sx, 0, sz, sw, cumRise, sd);
    walls.push({ x: sx, z: sz, w: sw, d: sd });
  }

  // Landing slab at TOP_Y, depth 1.0 against the back wall, width STEP_W.
  let lx, lz, lw, ld;
  if (opp === "N") { lx = CHUNK_SIZE / 2 - STEP_W / 2; lz = 0.2; lw = STEP_W; ld = 1.0; }
  else if (opp === "S") { lx = CHUNK_SIZE / 2 - STEP_W / 2; lz = CHUNK_SIZE - WALL_THICKNESS - 1.0; lw = STEP_W; ld = 1.0; }
  else if (opp === "E") { lx = CHUNK_SIZE - WALL_THICKNESS - 1.0; lz = CHUNK_SIZE / 2 - STEP_W / 2; lw = 1.0; ld = STEP_W; }
  else { lx = 0.2; lz = CHUNK_SIZE / 2 - STEP_W / 2; lw = 1.0; ld = STEP_W; }
  addBox(group, mats.steel, lx, 0, lz, lw, TOP_Y + 0.04, ld);
  walls.push({ x: lx, z: lz, w: lw, d: ld });

  // Sealed metal door mounted on the back wall above the landing.
  // Door panel sits flush against the inside face of the perimeter wall.
  // Door height + landing height + sign height must all fit under WALL_HEIGHT (3m).
  let doorX, doorZ, doorW, doorD;
  const doorH = 1.6;
  const doorThick = 0.08;
  if (opp === "N") {
    doorX = CHUNK_SIZE / 2 - 0.7; doorZ = WALL_THICKNESS + 0.001; doorW = 1.4; doorD = doorThick;
  } else if (opp === "S") {
    doorX = CHUNK_SIZE / 2 - 0.7; doorZ = CHUNK_SIZE - WALL_THICKNESS - doorThick - 0.001; doorW = 1.4; doorD = doorThick;
  } else if (opp === "E") {
    doorX = CHUNK_SIZE - WALL_THICKNESS - doorThick - 0.001; doorZ = CHUNK_SIZE / 2 - 0.7; doorW = doorThick; doorD = 1.4;
  } else {
    doorX = WALL_THICKNESS + 0.001; doorZ = CHUNK_SIZE / 2 - 0.7; doorW = doorThick; doorD = 1.4;
  }
  addBox(group, mats.doorSealed, doorX, TOP_Y + 0.04, doorZ, doorW, doorH, doorD);

  // "SUBSECTOR" sign panel above the door — slightly emissive red placard.
  const signH = 0.18;
  const signCenterY = (TOP_Y + 0.04 + doorH) + signH / 2 + 0.04;
  const signGeo = new THREE.BoxGeometry(doorW * 0.8, signH, doorD || doorThick);
  const sign = new THREE.Mesh(signGeo, mats.signRed);
  if (opp === "N" || opp === "S") {
    sign.position.set(doorX + doorW / 2, signCenterY, doorZ + doorThick / 2);
  } else {
    sign.position.set(doorX + doorThick / 2, signCenterY, doorZ + doorD / 2);
  }
  group.add(sign);

  // Handrail along the stair (thin rail box on the open side of the staircase)
  // Single rail bar for visual cue; collision optional. Skip collision to keep it simple.
  const railH = 0.95;
  if (dirZ !== 0) {
    const railLen = STEPS * STEP_DEEP;
    const railZStart = dirZ < 0 ? baseZ - STEP_DEEP * (STEPS - 1) : baseZ;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, railLen), mats.rail);
    rail.position.set(baseX + STEP_W + 0.03, railH, railZStart + railLen / 2);
    group.add(rail);
    const rail2 = rail.clone();
    rail2.position.x = baseX - 0.03;
    group.add(rail2);
  } else {
    const railLen = STEPS * STEP_DEEP;
    const railXStart = dirX < 0 ? baseX - STEP_DEEP * (STEPS - 1) : baseX;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(railLen, 0.04, 0.04), mats.rail);
    rail.position.set(railXStart + railLen / 2, railH, baseZ + STEP_W + 0.03);
    group.add(rail);
    const rail2 = rail.clone();
    rail2.position.z = baseZ - 0.03;
    group.add(rail2);
  }

  // Single overhead light — concrete echoes
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xfff0d8, 1.3, rng() < 0.2);

  // The staircase itself is the interactable trigger. Place the prompt point ~0.3m in front
  // of the foot of the stairs (on the player side), so when the player approaches the
  // staircase and looks at it, they get the "ascend / descend" prompt within the 2.4m
  // raycast range. Without this, the stairs block the player from getting close enough to
  // the visual door at the top.
  let promptX, promptZ;
  if (opp === "N") {
    promptX = baseX + STEP_W / 2;
    promptZ = baseZ + 0.3;            // baseZ is south edge of step 0 when ascending north
  } else if (opp === "S") {
    promptX = baseX + STEP_W / 2;
    promptZ = baseZ - 0.3;            // baseZ is north edge of step 0 when ascending south
  } else if (opp === "E") {
    promptX = baseX - 0.3;            // baseX is west edge of step 0 when ascending east
    promptZ = baseZ + STEP_W / 2;
  } else {
    promptX = baseX + 0.3;            // baseX is east edge of step 0 when ascending west
    promptZ = baseZ + STEP_W / 2;
  }

  const interactables = [{
    type: "door_up",
    id: `door_up`, // world streamer suffixes with chunk coords for uniqueness
    persistent: true,
    x: promptX, y: 1.5, z: promptZ,
  }];

  return { group, walls, interactables, kind: "stairwell" };
}

// 2x2 grand lobby: single external entry on one side, big open 16×16 interior.
// Four variants generated by build-side: N / S / E / W. Footprint and entry cell are
// computed so the entry cell is on the corresponding edge of the 2×2 block.
function buildGrandLobby(entrySide, rng) {
  const group = new THREE.Group();

  // Footprint always [[0,0],[1,0],[0,1],[1,1]]. Entry cell MUST match the registry's
  // entryCell for this variant — the planner positions the room based on the registry.
  const footprint = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let entryCell;
  if (entrySide === "N") entryCell = [0, 0];
  else if (entrySide === "S") entryCell = [0, 1];
  else if (entrySide === "W") entryCell = [0, 0];
  else entryCell = [1, 0]; // E

  buildFootprintFloorCeiling(group, footprint, { floorMat: mats.floorTile });
  const sockets = [{ cell: entryCell, side: entrySide }];
  const { walls } = buildFootprintPerimeter(group, footprint, sockets);

  // Center the lobby visually around (CHUNK_SIZE, CHUNK_SIZE)
  const cx = CHUNK_SIZE;     // center x of the 2x2 block
  const cz = CHUNK_SIZE;     // center z

  // Government seal centered on the floor
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.04, 48), mats.seal);
  seal.position.set(cx, 0.02, cz);
  group.add(seal);

  // Four columns at the inner-corner positions
  for (const [px, pz] of [
    [cx - 3.6, cz - 3.6], [cx + 3.6, cz - 3.6],
    [cx - 3.6, cz + 3.6], [cx + 3.6, cz + 3.6],
  ]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, WALL_HEIGHT, 16), mats.column);
    col.position.set(px, WALL_HEIGHT / 2, pz);
    group.add(col);
    walls.push({ x: px - 0.42, z: pz - 0.42, w: 0.84, d: 0.84 });
  }

  // L-shaped reception counter against one wall (opposite the entry side)
  const counterMat = mats.reception;
  const topMat = mats.receptionTop;
  if (entrySide === "S" || entrySide === "N") {
    // counter on E wall
    addBox(group, counterMat, cx + 5.2, 0, cz - 2.4, 0.7, 1.05, 4.8);
    addBox(group, topMat, cx + 5.2, 1.05, cz - 2.4, 0.7, 0.05, 4.8);
    walls.push({ x: cx + 5.2, z: cz - 2.4, w: 0.7, d: 4.8 });
  } else {
    // counter on N wall
    addBox(group, counterMat, cx - 2.4, 0, cz - 5.0, 4.8, 1.05, 0.7);
    addBox(group, topMat, cx - 2.4, 1.05, cz - 5.0, 4.8, 0.05, 0.7);
    walls.push({ x: cx - 2.4, z: cz - 5.0, w: 4.8, d: 0.7 });
  }

  // Lounge cluster — six chairs in two rows around the seal
  for (let i = 0; i < 3; i++) {
    const cxi = cx - 1.6 + i * 1.6;
    addBox(group, mats.velvet, cxi, 0.4, cz - 3.2, 0.6, 0.06, 0.6);
    addBox(group, mats.velvet, cxi, 0.4, cz - 2.6, 0.6, 0.5, 0.06);
    addBox(group, mats.velvet, cxi, 0.4, cz + 2.6, 0.6, 0.06, 0.6);
    addBox(group, mats.velvet, cxi, 0.4, cz + 2.6, 0.6, 0.5, 0.06);
  }

  // Four ceiling lights — one per cell — for proper grand-lobby illumination
  for (const [dx, dz] of footprint) {
    buildCeilingLight(group, dx * CHUNK_SIZE + CHUNK_SIZE / 2, dz * CHUNK_SIZE + CHUNK_SIZE / 2,
      0xfff6dc, 1.6, false);
  }

  const interactables = [];
  if (rng() < 0.6) {
    interactables.push({
      type: "document",
      id: `doc_${Math.floor(rng() * 1e9).toString(36)}`,
      x: cx - 1.0, y: 1.12, z: cz - 4.8,
    });
  }
  return { group, walls, interactables, kind: "grand_lobby" };
}

function buildDeadEnd(rng) {
  const group = new THREE.Group();
  buildFloorCeiling(group);
  const { walls } = buildPerimeter(group, []);
  buildCeilingLight(group, CHUNK_SIZE / 2, CHUNK_SIZE / 2, 0xb89060, 0.7, false);
  return { group, walls, interactables: [], kind: "dead_end" };
}

// ---------- chunk type registry ----------
// Each entry supports two layouts:
//   - Single-cell (default): { sockets: ["N", "S"], weight, build }
//     Implicitly footprint = [[0,0]] and entry cell = [0, 0].
//   - Multi-cell: { footprint: [[dx,dz]...], entryCell: [dx,dz], sockets: ["N"], weight, build }
//     Sockets are ALL on the entry cell; perimeter walls on other cells are solid.

export const CHUNK_TYPES = {
  start_cubicle: { sockets: ["S"], weight: 0, build: (rng) => buildStartCubicle(rng) },

  // Connective backbone — most common.
  corridor_ns: { sockets: ["N", "S"], weight: 6, build: (rng) => buildCorridorStraight(["N", "S"], rng) },
  corridor_ew: { sockets: ["E", "W"], weight: 6, build: (rng) => buildCorridorStraight(["E", "W"], rng) },

  // Junctions — keep the network branching.
  corridor_t_n: { sockets: ["N", "E", "W"], weight: 2, build: (rng) => buildCorridorT(["N", "E", "W"], rng) },
  corridor_t_s: { sockets: ["S", "E", "W"], weight: 2, build: (rng) => buildCorridorT(["S", "E", "W"], rng) },
  corridor_t_e: { sockets: ["E", "N", "S"], weight: 2, build: (rng) => buildCorridorT(["E", "N", "S"], rng) },
  corridor_t_w: { sockets: ["W", "N", "S"], weight: 2, build: (rng) => buildCorridorT(["W", "N", "S"], rng) },

  // Single-socket terminations — kept rare so they don't choke exploration.
  office_n: { sockets: ["N"], weight: 0.6, build: (rng) => buildOffice(["N"], rng) },
  office_s: { sockets: ["S"], weight: 0.6, build: (rng) => buildOffice(["S"], rng) },
  office_e: { sockets: ["E"], weight: 0.6, build: (rng) => buildOffice(["E"], rng) },
  office_w: { sockets: ["W"], weight: 0.6, build: (rng) => buildOffice(["W"], rng) },

  // Cubicle farms — pass-through.
  cubicle_farm_ns: { sockets: ["N", "S"], weight: 1.2, build: (rng) => buildCubicleFarm(["N", "S"], rng) },
  cubicle_farm_ew: { sockets: ["E", "W"], weight: 1.2, build: (rng) => buildCubicleFarm(["E", "W"], rng) },

  // Large 1×1 rooms — sparse but present.
  foyer: { sockets: ["N", "S", "E", "W"], weight: 1.0, build: (rng) => buildFoyer(["N", "S", "E", "W"], rng) },
  lobby: { sockets: ["N", "S", "E", "W"], weight: 1.0, build: (rng) => buildLobby(rng) },

  // 2×2 GRAND LOBBY variants — entry on one side only, big 16x16 interior. Footprint covers
  // 4 cells; entryCell varies per variant so the door is on the appropriate edge.
  grand_lobby_n: { footprint: [[0,0],[1,0],[0,1],[1,1]], entryCell: [0,0], sockets: ["N"], weight: 0.5, build: (rng) => buildGrandLobby("N", rng) },
  grand_lobby_s: { footprint: [[0,0],[1,0],[0,1],[1,1]], entryCell: [0,1], sockets: ["S"], weight: 0.5, build: (rng) => buildGrandLobby("S", rng) },
  grand_lobby_w: { footprint: [[0,0],[1,0],[0,1],[1,1]], entryCell: [0,0], sockets: ["W"], weight: 0.5, build: (rng) => buildGrandLobby("W", rng) },
  grand_lobby_e: { footprint: [[0,0],[1,0],[0,1],[1,1]], entryCell: [1,0], sockets: ["E"], weight: 0.5, build: (rng) => buildGrandLobby("E", rng) },

  // Labs — 2-socket pass-throughs, distinct floor + props.
  lab_ns: { sockets: ["N", "S"], weight: 1.5, build: (rng) => buildLab(["N", "S"], rng) },
  lab_ew: { sockets: ["E", "W"], weight: 1.5, build: (rng) => buildLab(["E", "W"], rng) },

  // Stairwells — sealed door at top is an interactable that transitions levels.
  stairwell_n: { sockets: ["N"], weight: 0.8, build: (rng) => buildStairwell("N", rng) },
  stairwell_s: { sockets: ["S"], weight: 0.8, build: (rng) => buildStairwell("S", rng) },
  stairwell_e: { sockets: ["E"], weight: 0.8, build: (rng) => buildStairwell("E", rng) },
  stairwell_w: { sockets: ["W"], weight: 0.8, build: (rng) => buildStairwell("W", rng) },

  // Dead-end cap is only placed when no compatible chunk fits.
  dead_end: { sockets: [], weight: 0, build: (rng) => buildDeadEnd(rng) },
};

// Normalize chunk type metadata — single-cell shorthand fills in defaults.
for (const def of Object.values(CHUNK_TYPES)) {
  if (!def.footprint) def.footprint = [[0, 0]];
  if (!def.entryCell) def.entryCell = [0, 0];
}

// Get the maximum chunk distance from origin cell to any footprint cell — used by streamer
// to decide load/unload bounds for multi-cell rooms.
export function footprintCells(def) {
  return def.footprint ?? [[0, 0]];
}

export function oppositeSocket(side) {
  switch (side) {
    case "N": return "S";
    case "S": return "N";
    case "E": return "W";
    case "W": return "E";
    default: return null;
  }
}

export function neighborCoord(cx, cz, side) {
  switch (side) {
    case "N": return [cx, cz - 1];
    case "S": return [cx, cz + 1];
    case "E": return [cx + 1, cz];
    case "W": return [cx - 1, cz];
    default: return [cx, cz];
  }
}
