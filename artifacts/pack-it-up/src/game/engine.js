// Packing rules + solver. Pure functions, no DOM — shared by the game client
// and the level-verification tools in /tools.
//
// A shape is { w, h, cells: [[x, y], ...] }. Boxes are grids with an optional
// weight limit. Rules:
//   fit      — items can't overlap or leave the box            (hard)
//   weight   — a box's items can't exceed its maxWeight          (soft in play)
//   fragile  — fragile items can't share an edge with HEAVY ones (soft in play)
// "Soft" means the player may make the placement, sees the problem, and the
// room can't be finished until it's fixed. The solver treats every rule as hard.

export const HEAVY = 3;

export function rotate(shape) {
  // 90° clockwise: (x, y) -> (h-1-y, x)
  const cells = shape.cells.map(([x, y]) => [shape.h - 1 - y, x]);
  return normalize({ w: shape.h, h: shape.w, cells });
}

function normalize(shape) {
  const cells = shape.cells.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  return { w: shape.w, h: shape.h, cells };
}

export function shapeKey(s) {
  return `${s.w}x${s.h}:` + s.cells.map((c) => c.join(",")).join(";");
}

/** All four rotations, index = number of clockwise quarter turns. */
export function rotations(shape) {
  const out = [normalize(shape)];
  for (let i = 1; i < 4; i++) out.push(rotate(out[i - 1]));
  return out;
}

/** Distinct rotations only (for search), each tagged with its turn count. */
export function distinctRotations(shape) {
  const seen = new Set();
  return rotations(shape)
    .map((s, rot) => ({ ...s, rot }))
    .filter((s) => {
      const k = shapeKey(s);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

// ── board state ──────────────────────────────────────────────────────────────

/**
 * items:  [{ id, shape, weight, fragile }]
 * boxes:  [{ w, h, maxWeight? }]
 * Returns a mutable board: per-box grids holding item index (-1 empty, -2 blocked).
 */
export function makeBoard(boxes, items) {
  return {
    boxes,
    items,
    grids: boxes.map((b) => new Int16Array(b.w * b.h).fill(-1)),
    place: new Map(), // itemIndex -> { box, x, y, rot }
  };
}

export function cellsAt(shape, x, y) {
  return shape.cells.map(([cx, cy]) => [x + cx, y + cy]);
}

/** Hard check only: in bounds and every cell free (or already this item's). */
export function fits(board, idx, box, x, y, rot) {
  const b = board.boxes[box];
  const shape = rotations(board.items[idx].shape)[rot];
  const g = board.grids[box];
  for (const [cx, cy] of cellsAt(shape, x, y)) {
    if (cx < 0 || cy < 0 || cx >= b.w || cy >= b.h) return false;
    const v = g[cy * b.w + cx];
    if (v !== -1 && v !== idx) return false;
  }
  return true;
}

export function put(board, idx, box, x, y, rot) {
  lift(board, idx);
  const b = board.boxes[box];
  const shape = rotations(board.items[idx].shape)[rot];
  for (const [cx, cy] of cellsAt(shape, x, y)) board.grids[box][cy * b.w + cx] = idx;
  board.place.set(idx, { box, x, y, rot });
}

export function lift(board, idx) {
  const p = board.place.get(idx);
  if (!p) return;
  const g = board.grids[p.box];
  for (let i = 0; i < g.length; i++) if (g[i] === idx) g[i] = -1;
  board.place.delete(idx);
}

export function boxWeight(board, box) {
  let w = 0;
  for (const [idx, p] of board.place) if (p.box === box) w += board.items[idx].weight;
  return w;
}

/** Pairs of [fragileIdx, heavyIdx, box, edge] that currently touch. */
export function fragileConflicts(board) {
  const out = [];
  board.boxes.forEach((b, box) => {
    const g = board.grids[box];
    for (let y = 0; y < b.h; y++)
      for (let x = 0; x < b.w; x++) {
        const a = g[y * b.w + x];
        if (a < 0) continue;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= b.w || ny >= b.h) continue;
          const c = g[ny * b.w + nx];
          if (c < 0 || c === a) continue;
          const A = board.items[a], C = board.items[c];
          if (A.fragile && C.weight >= HEAVY) out.push({ fragile: a, heavy: c, box, x, y, dx, dy });
          else if (C.fragile && A.weight >= HEAVY) out.push({ fragile: c, heavy: a, box, x, y, dx, dy });
        }
      }
  });
  return out;
}

export function overweightBoxes(board) {
  return board.boxes
    .map((b, i) => (b.maxWeight != null && boxWeight(board, i) > b.maxWeight ? i : -1))
    .filter((i) => i >= 0);
}

export function isSolved(board) {
  return (
    board.place.size === board.items.length &&
    overweightBoxes(board).length === 0 &&
    fragileConflicts(board).length === 0
  );
}

// ── solver ───────────────────────────────────────────────────────────────────

/**
 * Exact-cover-with-slack search. Walks cells in reading order across boxes;
 * the first empty cell is either covered by some item anchored there, or
 * declared empty if there's slack left. Identical items are grouped so the
 * search never tries permutations of twins.
 *
 * opts.fixed      Map idx -> {box,x,y,rot} placements to keep
 * opts.blocked    [{box, x, y}] cells that can't be used
 * opts.boxMask    array of booleans — which boxes may be used
 * opts.maxNodes   search budget (returns { status: "budget" } when exceeded)
 * opts.countTo    count solutions up to this many (default 1)
 */
export function solve(boxes, items, opts = {}) {
  const { fixed = new Map(), blocked = [], boxMask = boxes.map(() => true), maxNodes = 2e6, countTo = 1, noRotate = false } = opts;

  const grids = boxes.map((b) => new Int16Array(b.w * b.h).fill(-1));
  const weights = boxes.map(() => 0);
  const itemOf = boxes.map((b) => new Int16Array(b.w * b.h).fill(-1));
  boxes.forEach((b, i) => { if (!boxMask[i]) grids[i].fill(-2); });
  for (const c of blocked) grids[c.box][c.y * boxes[c.box].w + c.x] = -2;

  for (const [idx, p] of fixed) {
    const shape = rotations(items[idx].shape)[p.rot];
    for (const [cx, cy] of cellsAt(shape, p.x, p.y)) {
      grids[p.box][cy * boxes[p.box].w + cx] = 1;
      itemOf[p.box][cy * boxes[p.box].w + cx] = idx;
    }
    weights[p.box] += items[idx].weight;
  }

  // group remaining items by identical (shape, weight, fragile)
  const groups = [];
  const gIndex = new Map();
  items.forEach((it, idx) => {
    if (fixed.has(idx)) return;
    const k = shapeKey(rotations(it.shape)[0]) + `|${it.weight}|${it.fragile ? 1 : 0}`;
    if (!gIndex.has(k)) {
      gIndex.set(k, groups.length);
      const rots = noRotate ? [{ ...rotations(it.shape)[0], rot: 0 }] : distinctRotations(it.shape);
      groups.push({ members: [], rots, weight: it.weight, fragile: !!it.fragile, area: it.shape.cells.length });
    }
    groups[gIndex.get(k)].members.push(idx);
  });
  groups.sort((a, b) => b.area - a.area || b.weight - a.weight);
  const left = groups.map((g) => g.members.length);

  // anchor offset: the shape's first cell in reading order sits on the target cell
  for (const g of groups) for (const r of g.rots) r.anchor = r.cells[0];

  let free = 0;
  grids.forEach((g) => g.forEach((v) => { if (v === -1) free++; }));
  let need = 0;
  groups.forEach((g, i) => (need += g.area * left[i]));
  let slack = free - need;

  const cellList = [];
  boxes.forEach((b, box) => { for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) cellList.push([box, x, y]); });

  const solution = new Map(fixed);
  const solutions = [];
  let nodes = 0;
  let remaining = need;
  if (slack < 0) return { status: "unsolvable", nodes, solutions };

  const heavyTouch = (box, x, y, fragile, weight) => {
    const b = boxes[box];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
      const o = itemOf[box][ny * b.w + nx];
      if (o < 0) continue;
      const other = items[o];
      if (fragile && other.weight >= HEAVY) return true;
      if (weight >= HEAVY && other.fragile) return true;
    }
    return false;
  };

  // Dead-space prune: a pocket of empty cells smaller than the smallest item
  // still to place can only be filled by single-cell items. If those pockets
  // hold more cells than the singles left plus the slack, this branch is dead.
  // Also prune on weight: what's left to place must fit what the boxes can hold.
  const seen = boxes.map((b) => new Uint8Array(b.w * b.h));
  let stamp = 0;
  const stack = [];
  const weighted = boxes.every((b) => b.maxWeight != null);
  function deadSpaceExceedsSlack() {
    let minArea = Infinity, singles = 0, wLeft = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      if (!left[gi]) continue;
      wLeft += groups[gi].weight * left[gi];
      if (groups[gi].area === 1) singles += left[gi];
      else if (groups[gi].area < minArea) minArea = groups[gi].area;
    }
    if (weighted) {
      let room = 0;
      boxes.forEach((b, i) => { if (boxMask[i]) room += b.maxWeight - weights[i]; });
      if (wLeft > room) return true;
    }
    if (minArea === Infinity) return false;
    const budget = slack + singles;
    stamp = (stamp + 1) & 255 || 1;
    let wasted = 0;
    for (let box = 0; box < boxes.length; box++) {
      const b = boxes[box], g = grids[box], sn = seen[box];
      for (let k = 0; k < g.length; k++) {
        if (g[k] !== -1 || sn[k] === stamp) continue;
        let size = 0;
        stack.push(k);
        sn[k] = stamp;
        while (stack.length) {
          const j = stack.pop();
          size++;
          const x = j % b.w, y = (j / b.w) | 0;
          if (x > 0 && g[j - 1] === -1 && sn[j - 1] !== stamp) { sn[j - 1] = stamp; stack.push(j - 1); }
          if (x < b.w - 1 && g[j + 1] === -1 && sn[j + 1] !== stamp) { sn[j + 1] = stamp; stack.push(j + 1); }
          if (y > 0 && g[j - b.w] === -1 && sn[j - b.w] !== stamp) { sn[j - b.w] = stamp; stack.push(j - b.w); }
          if (y < b.h - 1 && g[j + b.w] === -1 && sn[j + b.w] !== stamp) { sn[j + b.w] = stamp; stack.push(j + b.w); }
        }
        if (size < minArea && (wasted += size) > budget) return true;
      }
    }
    return false;
  }

  // The biggest thing left must still have somewhere to go.
  function biggestHasRoom() {
    let gi = -1;
    for (let k = 0; k < groups.length; k++) if (left[k] && (gi < 0 || groups[k].area > groups[gi].area)) gi = k;
    if (gi < 0 || groups[gi].area <= 2) return true;
    const g = groups[gi];
    for (let box = 0; box < boxes.length; box++) {
      if (!boxMask[box]) continue;
      const b = boxes[box], grid = grids[box];
      if (b.maxWeight != null && weights[box] + g.weight > b.maxWeight) continue;
      for (const r of g.rots) {
        for (let y = 0; y + r.h <= b.h; y++)
          for (let x = 0; x + r.w <= b.w; x++) {
            let ok = true;
            for (const [cx, cy] of r.cells) if (grid[(y + cy) * b.w + x + cx] !== -1) { ok = false; break; }
            if (ok) return true;
          }
      }
    }
    return false;
  }

  function search(from) {
    if (++nodes > maxNodes) throw BUDGET;
    if (remaining === 0) {
      solutions.push(new Map(solution));
      return solutions.length >= countTo;
    }
    if (deadSpaceExceedsSlack() || !biggestHasRoom()) return false;
    let k = from;
    while (k < cellList.length) {
      const [box, x, y] = cellList[k];
      if (grids[box][y * boxes[box].w + x] === -1) break;
      k++;
    }
    if (k >= cellList.length) return false;
    const [box, x, y] = cellList[k];
    const b = boxes[box];

    for (let gi = 0; gi < groups.length; gi++) {
      if (!left[gi]) continue;
      const g = groups[gi];
      if (b.maxWeight != null && weights[box] + g.weight > b.maxWeight) continue;
      for (const r of g.rots) {
        const ox = x - r.anchor[0], oy = y - r.anchor[1];
        let ok = true;
        for (const [cx, cy] of r.cells) {
          const px = ox + cx, py = oy + cy;
          if (px < 0 || py < 0 || px >= b.w || py >= b.h || grids[box][py * b.w + px] !== -1) { ok = false; break; }
        }
        if (!ok) continue;
        if (g.fragile || g.weight >= HEAVY) {
          for (const [cx, cy] of r.cells) if (heavyTouch(box, ox + cx, oy + cy, g.fragile, g.weight)) { ok = false; break; }
          if (!ok) continue;
        }
        const idx = g.members[g.members.length - left[gi]];
        for (const [cx, cy] of r.cells) {
          grids[box][(oy + cy) * b.w + ox + cx] = 1;
          itemOf[box][(oy + cy) * b.w + ox + cx] = idx;
        }
        weights[box] += g.weight;
        left[gi]--;
        remaining -= g.area;
        solution.set(idx, { box, x: ox, y: oy, rot: r.rot });
        const done = search(k + 1);
        solution.delete(idx);
        remaining += g.area;
        left[gi]++;
        weights[box] -= g.weight;
        for (const [cx, cy] of r.cells) {
          grids[box][(oy + cy) * b.w + ox + cx] = -1;
          itemOf[box][(oy + cy) * b.w + ox + cx] = -1;
        }
        if (done) return true;
      }
    }
    if (slack > 0) {
      slack--;
      grids[box][y * b.w + x] = -3;
      const done = search(k + 1);
      grids[box][y * b.w + x] = -1;
      slack++;
      if (done) return true;
    }
    return false;
  }

  try {
    search(0);
  } catch (e) {
    if (e !== BUDGET) throw e;
    return { status: solutions.length ? "solved" : "budget", nodes, solutions };
  }
  return { status: solutions.length ? "solved" : "unsolvable", nodes, solutions };
}

const BUDGET = Symbol("budget");

/**
 * Find any solution, trying the fewest boxes first. Spare boxes add slack, and
 * slack is what makes the search explode — so packing into as few boxes as
 * possible is both faster and closer to what a person does. Boxes that already
 * hold fixed items are always included.
 */
export function solveAny(boxes, items, opts = {}) {
  const { fixed = new Map(), maxNodes = 2e6 } = opts;
  const must = new Set([...fixed.values()].map((p) => p.box));
  const fixedCells = [...fixed.keys()].reduce((s, i) => s + items[i].shape.cells.length, 0);
  const need = items.reduce((s, it) => s + it.shape.cells.length, 0) - fixedCells;
  const masks = [];
  for (let m = 1; m < 1 << boxes.length; m++) {
    if (![...must].every((b) => m & (1 << b))) continue;
    const cap = boxes.reduce((s, b, i) => s + (m & (1 << i) ? b.w * b.h : 0), 0) - fixedCells;
    if (cap >= need) masks.push(m);
  }
  masks.sort((a, b) => popcount(a) - popcount(b));
  let spent = 0, ranOut = false;
  for (const m of masks) {
    const boxMask = boxes.map((_, i) => !!(m & (1 << i)));
    const r = solve(boxes, items, { ...opts, boxMask, maxNodes: Math.max(20000, maxNodes - spent) });
    spent += r.nodes;
    if (r.status === "solved") return { ...r, nodes: spent };
    if (r.status === "budget") ranOut = true;
    if (spent >= maxNodes) { ranOut = true; break; }
  }
  return { status: ranOut ? "budget" : "unsolvable", nodes: spent, solutions: [] };
}

/** Fewest boxes (by count, trying every subset) that still solve the room. */
export function parBoxes(boxes, items, maxNodes = 3e6) {
  const n = boxes.length;
  let best = null;
  for (let size = 1; size <= n && best == null; size++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      if (popcount(mask) !== size) continue;
      const boxMask = boxes.map((_, i) => !!(mask & (1 << i)));
      const res = solve(boxes, items, { boxMask, maxNodes });
      if (res.status === "solved") { best = size; break; }
    }
  }
  return best;
}

function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
