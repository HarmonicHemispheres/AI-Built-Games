// Zombies follow the pre-carved path waypoints. Placement validation also lives
// here. V1 keeps things simple: each zombie picks one path at spawn and walks
// its waypoints; if a wall is placed mid-path we just block local movement.

export function pickPathForSpawn(map, spawnPoint) {
  const candidates = map.paths.filter(p => p.start.x === spawnPoint.x && p.start.y === spawnPoint.y);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// True if placing a structure at (x,y) would block ALL paths from a spawn to
// its exit. For v1 we just disallow placing on path tiles; structures live
// only on `open`. That keeps things simple and never traps zombies.
export function canPlaceStructure(map, x, y) {
  const t = map.tiles[y * map.width + x];
  return t === "open";
}
