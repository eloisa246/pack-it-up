// A player who doesn't plan ahead: takes the biggest item left, puts it in a
// random place it fits (any rotation, any box, all rules respected), and
// gives up when something won't go. Returns the fraction of rooms finished.
//   maxBoxes: only count it a win if at most this many boxes were used
import { makeBoard, put, fits, rotations, boxWeight, HEAVY } from "../src/game/engine.js";

export function naiveWinRate(boxes, items, trials = 300, maxBoxes = Infinity, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const order = items.map((_, i) => i).sort((a, b) => items[b].shape.cells.length - items[a].shape.cells.length);
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    const board = makeBoard(boxes, items);
    let ok = true;
    for (const i of order) {
      const opts = [];
      boxes.forEach((b, box) => {
        for (let rot = 0; rot < 4; rot++) {
          const sh = rotations(items[i].shape)[rot];
          for (let y = 0; y + sh.h <= b.h; y++)
            for (let x = 0; x + sh.w <= b.w; x++) {
              if (!fits(board, i, box, x, y, rot)) continue;
              if (b.maxWeight != null && boxWeight(board, box) + items[i].weight > b.maxWeight) continue;
              if (touchesBad(board, i, box, x, y, rot)) continue;
              opts.push([box, x, y, rot]);
            }
        }
      });
      if (!opts.length) { ok = false; break; }
      const [box, x, y, rot] = opts[(rand() * opts.length) | 0];
      put(board, i, box, x, y, rot);
    }
    if (ok) {
      const used = new Set([...board.place.values()].map((p) => p.box)).size;
      if (used <= maxBoxes) wins++;
    }
  }
  return wins / trials;
}

function touchesBad(board, i, box, x, y, rot) {
  const it = board.items[i];
  if (!it.fragile && it.weight < HEAVY) return false;
  const b = board.boxes[box], g = board.grids[box];
  for (const [cx, cy] of rotations(it.shape)[rot].cells)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + cx + dx, ny = y + cy + dy;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
      const o = g[ny * b.w + nx];
      if (o < 0 || o === i) continue;
      const other = board.items[o];
      if ((it.fragile && other.weight >= HEAVY) || (it.weight >= HEAVY && other.fragile)) return true;
    }
  return false;
}
