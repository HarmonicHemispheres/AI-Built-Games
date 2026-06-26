// ============================================================================
// world/pathfind.js — grid pathing over revealed, walkable tiles. PURE LOGIC.
//
// No three, no DOM. Imports only ../util/* and ../state.js. Node-runnable.
//
// A* over the 4-neighbourhood of revealed, walkable tiles (water/mountain block;
// unrevealed/missing tiles are treated as impassable for now). Used by enemy and
// unit movement toward the castle and by placement/movement validation.
// ============================================================================

import { N4, tileKey, parseTileKey, manhattan } from "../util/math.js";
import { state } from "../state.js";

// Is a tile walkable? Reads the tile's `walkable` flag. Unrevealed or missing
// tiles are NOT walkable (you can't path through the fog).
export function isWalkable(col, row) {
  const key = tileKey(col, row);
  if (!state.map.revealed.has(key)) return false;
  const tile = state.map.tiles.get(key);
  return !!(tile && tile.walkable);
}

// A* shortest path from `start` to `goal` over revealed walkable tiles,
// 4-neighbour movement, unit step cost. Returns an array of {col,row} from
// start to goal inclusive, or null if no path exists. If start === goal and it's
// walkable, returns [start].
//
// `start`/`goal` are {col,row}.
export function findPath(start, goal) {
  if (!isWalkable(start.col, start.row)) return null;
  if (!isWalkable(goal.col, goal.row)) return null;

  const startKey = tileKey(start.col, start.row);
  const goalKey = tileKey(goal.col, goal.row);
  if (startKey === goalKey) return [{ col: start.col, row: start.row }];

  // Open set as a flat array used as a simple priority queue (linear scan of the
  // best f). Map sizes here are small (hundreds of tiles), so this is plenty.
  const open = new Set([startKey]);
  const cameFrom = new Map();
  const gScore = new Map([[startKey, 0]]);
  const fScore = new Map([[startKey, manhattan(start, goal)]]);

  while (open.size) {
    // Pop the node with the lowest fScore.
    let currentKey = null;
    let best = Infinity;
    for (const k of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < best) {
        best = f;
        currentKey = k;
      }
    }

    if (currentKey === goalKey) return reconstruct(cameFrom, currentKey);

    open.delete(currentKey);
    const { col, row } = parseTileKey(currentKey);

    for (const { dc, dr } of N4) {
      const nc = col + dc;
      const nr = row + dr;
      if (!isWalkable(nc, nr)) continue;
      const nKey = tileKey(nc, nr);
      const tentative = (gScore.get(currentKey) ?? Infinity) + 1;
      if (tentative < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, currentKey);
        gScore.set(nKey, tentative);
        fScore.set(nKey, tentative + manhattan({ col: nc, row: nr }, goal));
        open.add(nKey);
      }
    }
  }

  return null; // exhausted open set without reaching goal
}

function reconstruct(cameFrom, currentKey) {
  const path = [parseTileKey(currentKey)];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey);
    path.push(parseTileKey(currentKey));
  }
  path.reverse();
  return path;
}

// Fallback when no full path exists: pick the walkable 4-neighbour of `from`
// that minimizes Manhattan distance to `goal`. Returns `from` unchanged if no
// walkable neighbour exists (caller can treat that as "stuck"). Useful for
// flying/wall-ignoring enemies or greedy steps when the grid is blocked.
export function nearestWalkableToward(from, goal) {
  let best = { col: from.col, row: from.row };
  // Distance baseline = staying put. We strictly improve, so a stuck unit holds.
  let bestDist = manhattan(from, goal);
  let moved = false;
  for (const { dc, dr } of N4) {
    const nc = from.col + dc;
    const nr = from.row + dr;
    if (!isWalkable(nc, nr)) continue;
    const d = manhattan({ col: nc, row: nr }, goal);
    if (d < bestDist || (!moved && d <= bestDist)) {
      // Prefer any walkable step that doesn't increase distance; among those,
      // the closest. This guarantees a move toward the goal when possible.
      if (d < bestDist) {
        bestDist = d;
        best = { col: nc, row: nr };
        moved = true;
      } else if (!moved) {
        best = { col: nc, row: nr };
        moved = true;
      }
    }
  }
  return best;
}
