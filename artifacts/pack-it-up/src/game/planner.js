// A player who plans like a person does: awkward pieces first, each one put
// where it hugs the walls and its neighbours without leaving pockets nothing
// can fill — and never somewhere that leaves a remaining piece with nowhere
// to go. A little randomness stands in for taste. No undo.
//
// Calibrated against a human playthrough (2026-09-25): rooms 1–12 of the
// first campaign felt easy, the finale felt hard. This player agrees; a
// naive random-order player didn't. Used by tools/difficulty.mjs and to pick
// the daily room.
import { makeBoard, put, fits, rotations, boxWeight, heightAt, layersOf, packedValue, valueOf, HEAVY } from "./engine.js";

/**
 * keep = { target } for keep-or-let-go rooms: the player packs the most
 * valuable things first (value per cell), skips what won't fit, and wins by
 * reaching the target (or keep.need, e.g. the best haul, for Pro).
 */
export function plannerWinRate(boxes, items, trials = 200, maxBoxes = Infinity, seed = 11, keep = null) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let wins = 0;
  for (let t = 0; t < trials; t++) if (playOnce(boxes, items, rand, maxBoxes, keep)) wins++;
  return wins / trials;
}

function playOnce(boxes, items, rand, maxBoxes, keep) {
  const board = makeBoard(boxes, items);
  // awkwardness: area, plus a bonus for shapes that don't fill their bounding
  // box; when boxes have weight limits, heavy things go first (a person reads
  // the room's tip and packs the constrained stuff before the easy stuff)
  const weighted = boxes.some((b) => b.maxWeight != null);
  const awk = (it) =>
    it.shape.cells.length + (1 - it.shape.cells.length / (it.shape.w * it.shape.h)) * 4 +
    (it.weight >= HEAVY ? (weighted ? 20 : 1) : it.fragile ? 1 : 0);
  let left = items
    .map((_, i) => i)
    .sort((a, b) => awk(items[b]) - awk(items[a]) + (rand() - 0.5) * 1.5);
  if (keep) {
    // pick a wish list by hearts per cell until the boxes are about full,
    // pack that biggest-first, then try the rest in the gaps
    const cap = boxes.reduce((s, b) => s + b.w * b.h * layersOf(b), 0);
    const dens = (i) => valueOf(items[i]) / items[i].shape.cells.length + (rand() - 0.5) * 0.35;
    const byWorth = items.map((_, i) => i).sort((a, b) => dens(b) - dens(a));
    const wish = new Set();
    let used = 0;
    for (const i of byWorth) {
      if (used + items[i].shape.cells.length > cap) continue;
      wish.add(i);
      used += items[i].shape.cells.length;
    }
    left = [...left.filter((i) => wish.has(i)), ...byWorth.filter((i) => !wish.has(i))];
  }
  while (left.length) {
    const i = left.shift();
    let best = null;
    for (const [box, x, y, rot, layer] of candidates(board, i, maxBoxes)) {
      put(board, i, box, x, y, rot, layer);
      // gaps nothing can fill only hurt once they eat into the spare room
      const waste = deadCells(board, left);
      const over = Math.max(0, waste - spareCells(board, left, maxBoxes));
      let score = contact(board, i, box) * 2 - over * 3 - waste * 0.3 + (rand() - 0.5) * 2.5;
      // "heavy things go in small boxes": prefer the box rated for the most weight per cell
      const bx = board.boxes[box];
      if (items[i].weight >= HEAVY && bx.maxWeight != null) score += (bx.maxWeight / (bx.w * bx.h)) * 6;
      if (!keep && !everyoneFits(board, left, maxBoxes)) score -= 1000;
      board.place.delete(i);
      clear(board, i, box);
      if (!best || score > best.score) best = { score, box, x, y, rot, layer };
    }
    if (!best || best.score < -500) {
      if (keep) continue; // let it go
      return false;
    }
    put(board, i, best.box, best.x, best.y, best.rot, best.layer);
  }
  return keep ? packedValue(board) >= (keep.need ?? keep.target) : true;
}

function* candidates(board, i, maxBoxes) {
  const used = new Set([...board.place.values()].map((p) => p.box));
  for (let box = 0; box < board.boxes.length; box++) {
    if (!used.has(box) && used.size >= maxBoxes) continue;
    const b = board.boxes[box];
    const seen = new Set();
    for (let rot = 0; rot < 4; rot++) {
      const sh = rotations(board.items[i].shape)[rot];
      const key = sh.w + "x" + sh.h + ":" + sh.cells.join(";");
      if (seen.has(key)) continue;
      seen.add(key);
      for (let y = 0; y + sh.h <= b.h; y++)
        for (let x = 0; x + sh.w <= b.w; x++) {
          const layer = restingLayer(board, box, sh, x, y);
          if (layer >= 0 && legal(board, i, box, x, y, rot, layer)) yield [box, x, y, rot, layer];
        }
    }
  }
}

/** The layer a shape would rest on (level surface), or -1. */
function restingLayer(board, box, sh, x, y) {
  let h = null;
  for (const [cx, cy] of sh.cells) {
    const hh = heightAt(board, box, x + cx, y + cy);
    if (h === null) h = hh;
    else if (hh !== h) return -1;
  }
  return h < layersOf(board.boxes[box]) ? h : -1;
}

function legal(board, i, box, x, y, rot, layer = 0) {
  if (!fits(board, i, box, x, y, rot, layer)) return false;
  const b = board.boxes[box], it = board.items[i];
  if (b.maxWeight != null && boxWeight(board, box) + it.weight > b.maxWeight) return false;
  if (!it.fragile && it.weight < HEAVY) return true;
  const g = board.grids[box];
  const A = b.w * b.h, off = layer * A;
  for (const [cx, cy] of rotations(it.shape)[rot].cells) {
    if (layer > 0 && it.weight >= HEAVY) {
      const u = g[off - A + (y + cy) * b.w + x + cx];
      if (u >= 0 && board.items[u].fragile) return false;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + cx + dx, ny = y + cy + dy;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
      const o = g[off + ny * b.w + nx];
      if (o < 0 || o === i) continue;
      const other = board.items[o];
      if ((it.fragile && other.weight >= HEAVY) || (it.weight >= HEAVY && other.fragile)) return false;
    }
  }
  return true;
}

function clear(board, i, box) {
  const g = board.grids[box];
  for (let k = 0; k < g.length; k++) if (g[k] === i) g[k] = -1;
}

/** Edges of item i that touch a wall or another item (in its own layer). */
function contact(board, i, box) {
  const b = board.boxes[box], g = board.grids[box], A = b.w * b.h;
  let n = 0;
  for (let k = 0; k < g.length; k++) {
    if (g[k] !== i) continue;
    const off = k - (k % A), r = k % A, x = r % b.w, y = (r / b.w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) n++;
      else if (g[off + ny * b.w + nx] >= 0 && g[off + ny * b.w + nx] !== i) n++;
    }
  }
  return n;
}

/** Empty cells in pockets too small for the smallest piece still to place. */
function deadCells(board, left) {
  if (!left.length) return 0;
  const minA = Math.min(...left.map((i) => board.items[i].shape.cells.length));
  let dead = 0;
  board.boxes.forEach((b, box) => {
    const g = board.grids[box];
    const A = b.w * b.h; // bottom layer only: the top layer is a bonus, not a must
    const seen = new Uint8Array(A);
    for (let k = 0; k < A; k++) {
      if (g[k] !== -1 || seen[k]) continue;
      let size = 0;
      const st = [k];
      seen[k] = 1;
      while (st.length) {
        const j = st.pop();
        size++;
        const x = j % b.w, y = (j / b.w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
          const m = ny * b.w + nx;
          if (g[m] === -1 && !seen[m]) { seen[m] = 1; st.push(m); }
        }
      }
      // a pocket that's already used by a box with no items is fine: ignore empty boxes
      if (size < minA) dead += size;
    }
  });
  return dead;
}

/** Free cells beyond what the remaining pieces need (in boxes still allowed). */
function spareCells(board, left, maxBoxes) {
  const used = new Set([...board.place.values()].map((p) => p.box));
  // free floor, plus free top-layer cells that already have something under them
  const freeIn = (k) => {
    const b = board.boxes[k], g = board.grids[k], A = b.w * b.h;
    let n = 0;
    for (let c = 0; c < g.length; c++) if (g[c] === -1 && (c < A || g[c - A] >= 0)) n++;
    return n;
  };
  const open = board.boxes
    .map((b, k) => ({ k, free: freeIn(k) }))
    .sort((a, b) => (used.has(b.k) ? 1 : 0) - (used.has(a.k) ? 1 : 0) || b.free - a.free);
  let free = 0, n = 0;
  for (const o of open) {
    if (!used.has(o.k) && used.size + n >= maxBoxes) continue;
    if (!used.has(o.k)) n++;
    free += o.free;
  }
  return free - left.reduce((s, j) => s + board.items[j].shape.cells.length, 0);
}

function everyoneFits(board, left, maxBoxes) {
  // weight: can what's left still be spread over the room the boxes have left?
  const caps = board.boxes.map((b, i) => (b.maxWeight == null ? Infinity : b.maxWeight - boxWeight(board, i))).sort((a, b) => b - a);
  for (const w of left.map((j) => board.items[j].weight).sort((a, b) => b - a)) {
    const k = caps.findIndex((c) => c >= w);
    if (k < 0) return false;
    caps[k] -= w;
    caps.sort((a, b) => b - a);
  }
  for (const j of left) {
    let ok = false;
    for (const _ of candidates(board, j, maxBoxes)) { ok = true; break; }
    if (!ok) return false;
  }
  return true;
}
