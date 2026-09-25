// Packing rules + solver. Pure functions, no DOM — shared by the game client
// and the level-verification tools in /tools.
//
// A shape is { w, h, cells: [[x, y], ...] }. A box is a grid with an optional
// weight limit and 1 or 2 layers. Rules:
//   fit      — items can't overlap or leave the box                  (hard)
//   support  — a top-layer item needs something under every cell      (hard)
//   weight   — a box's items can't exceed its maxWeight               (soft in play)
//   fragile  — fragile items can't share an edge with HEAVY ones, and
//              nothing HEAVY may rest on top of something fragile     (soft in play)
//   keep     — in keep-or-let-go rooms, items are optional and carry a
//              value; the room needs a total value of at least `target`
// "Soft" means the player may make the placement, sees the problem, and the
// room can't be finished until it's fixed. The solver treats every rule as hard.
//
// Cells are indexed layer-major: k = layer * w * h + y * w + x.

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

const rotCache = new WeakMap();
/** All four rotations, index = number of clockwise quarter turns. */
export function rotations(shape) {
  let r = rotCache.get(shape);
  if (!r) {
    r = [normalize(shape)];
    for (let i = 1; i < 4; i++) r.push(rotate(r[i - 1]));
    rotCache.set(shape, r);
  }
  return r;
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

export const layersOf = (b) => b.layers || 1;
export const valueOf = (it) => (it.value == null ? 1 : it.value);

// ── board state ──────────────────────────────────────────────────────────────

/**
 * items:  [{ id, shape, weight, fragile, optional?, value? }]
 * boxes:  [{ w, h, maxWeight?, layers? }]
 * Returns a mutable board: per-box grids holding item index (-1 empty, -2 blocked).
 */
export function makeBoard(boxes, items) {
  return {
    boxes,
    items,
    grids: boxes.map((b) => new Int16Array(b.w * b.h * layersOf(b)).fill(-1)),
    place: new Map(), // itemIndex -> { box, x, y, rot, layer }
  };
}

export function cellsAt(shape, x, y) {
  return shape.cells.map(([cx, cy]) => [x + cx, y + cy]);
}

/** Hard check: in bounds, cells free (or already this item's), and supported. */
export function fits(board, idx, box, x, y, rot, layer = 0) {
  const b = board.boxes[box];
  if (layer >= layersOf(b)) return false;
  const shape = rotations(board.items[idx].shape)[rot];
  const g = board.grids[box];
  const A = b.w * b.h;
  for (const [cx, cy] of cellsAt(shape, x, y)) {
    if (cx < 0 || cy < 0 || cx >= b.w || cy >= b.h) return false;
    const k = layer * A + cy * b.w + cx;
    const v = g[k];
    if (v !== -1 && v !== idx) return false;
    if (layer > 0) {
      const under = g[k - A];
      if (under < 0 || under === idx) return false;
    }
  }
  return true;
}

export function put(board, idx, box, x, y, rot, layer = 0) {
  lift(board, idx);
  const b = board.boxes[box];
  const shape = rotations(board.items[idx].shape)[rot];
  const off = layer * b.w * b.h;
  for (const [cx, cy] of cellsAt(shape, x, y)) board.grids[box][off + cy * b.w + cx] = idx;
  board.place.set(idx, { box, x, y, rot, layer });
}

export function lift(board, idx) {
  const p = board.place.get(idx);
  if (!p) return;
  const g = board.grids[p.box];
  for (let i = 0; i < g.length; i++) if (g[i] === idx) g[i] = -1;
  board.place.delete(idx);
}

/** How many layers are filled at a cell (0 = empty floor of the box). */
export function heightAt(board, box, x, y) {
  const b = board.boxes[box];
  const A = b.w * b.h;
  let h = 0;
  for (let l = 0; l < layersOf(b); l++) if (board.grids[box][l * A + y * b.w + x] >= 0) h = l + 1;
  return h;
}

/** Items resting on top of item idx. */
export function itemsOnTop(board, idx) {
  const p = board.place.get(idx);
  if (!p) return [];
  const b = board.boxes[p.box];
  const A = b.w * b.h;
  if (p.layer + 1 >= layersOf(b)) return [];
  const g = board.grids[p.box];
  const out = new Set();
  for (let k = p.layer * A; k < (p.layer + 1) * A; k++) if (g[k] === idx && g[k + A] >= 0) out.add(g[k + A]);
  return [...out];
}

export function boxWeight(board, box) {
  let w = 0;
  for (const [idx, p] of board.place) if (p.box === box) w += board.items[idx].weight;
  return w;
}

/**
 * Fragile problems. Side-by-side touches carry {x, y, dx, dy, layer} for the
 * shared edge; crushes (heavy resting on fragile) carry {kind:"crush", x, y}.
 */
export function fragileConflicts(board) {
  const out = [];
  board.boxes.forEach((b, box) => {
    const g = board.grids[box];
    const A = b.w * b.h;
    for (let l = 0; l < layersOf(b); l++)
      for (let y = 0; y < b.h; y++)
        for (let x = 0; x < b.w; x++) {
          const a = g[l * A + y * b.w + x];
          if (a < 0) continue;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx >= b.w || ny >= b.h) continue;
            const c = g[l * A + ny * b.w + nx];
            if (c < 0 || c === a) continue;
            const P = board.items[a], Q = board.items[c];
            if (P.fragile && Q.weight >= HEAVY) out.push({ fragile: a, heavy: c, box, x, y, dx, dy, layer: l });
            else if (Q.fragile && P.weight >= HEAVY) out.push({ fragile: c, heavy: a, box, x, y, dx, dy, layer: l });
          }
          if (l > 0) {
            const under = g[(l - 1) * A + y * b.w + x];
            if (under >= 0 && board.items[under].fragile && board.items[a].weight >= HEAVY)
              out.push({ kind: "crush", fragile: under, heavy: a, box, x, y, layer: l });
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

export function packedValue(board) {
  let v = 0;
  for (const idx of board.place.keys()) v += valueOf(board.items[idx]);
  return v;
}

/**
 * Solved = every required item is packed, the value target (if any) is met,
 * and no rule is broken. keep = { target } for keep-or-let-go rooms.
 */
export function isSolved(board, keep = null) {
  const required = board.items.every((it, i) => it.optional || board.place.has(i));
  if (!required) return false;
  if (keep && packedValue(board) < keep.target) return false;
  return overweightBoxes(board).length === 0 && fragileConflicts(board).length === 0;
}

// ── solver ───────────────────────────────────────────────────────────────────

/**
 * Exact-cover-with-slack search. Walks cells box by box, bottom layer first,
 * in reading order; the first empty cell is either covered by an item anchored
 * there, or declared empty if there's slack left. Identical items are grouped
 * so the search never tries permutations of twins.
 *
 * Optional items (keep-or-let-go) may be skipped: they draw on the slack when
 * packed. A solution needs every required item plus a value ≥ minValue.
 *
 * opts.fixed      Map idx -> {box,x,y,rot,layer} placements to keep
 * opts.blocked    [{box, x, y, layer?}] cells that can't be used
 * opts.boxMask    array of booleans — which boxes may be used
 * opts.maxNodes   search budget (returns { status: "budget" } when exceeded)
 * opts.countTo    count solutions up to this many (default 1)
 * opts.minValue   value the packed items must reach (default 0)
 * opts.maximize   find the highest-value packing instead (returns bestValue)
 */
export function solve(boxes, items, opts = {}) {
  const {
    fixed = new Map(), blocked = [], boxMask = boxes.map(() => true), maxNodes = 2e6,
    countTo = 1, noRotate = false, minValue = 0, maximize = false,
  } = opts;

  const L = boxes.map(layersOf);
  const AR = boxes.map((b) => b.w * b.h);
  const grids = boxes.map((b, i) => new Int16Array(AR[i] * L[i]).fill(-1));
  const weights = boxes.map(() => 0);
  const itemOf = boxes.map((b, i) => new Int16Array(AR[i] * L[i]).fill(-1));
  boxes.forEach((b, i) => { if (!boxMask[i]) grids[i].fill(-2); });
  for (const c of blocked) grids[c.box][(c.layer || 0) * AR[c.box] + c.y * boxes[c.box].w + c.x] = -2;

  let value = 0;
  for (const [idx, p] of fixed) {
    const shape = rotations(items[idx].shape)[p.rot];
    const off = (p.layer || 0) * AR[p.box];
    for (const [cx, cy] of cellsAt(shape, p.x, p.y)) {
      grids[p.box][off + cy * boxes[p.box].w + cx] = 1;
      itemOf[p.box][off + cy * boxes[p.box].w + cx] = idx;
    }
    weights[p.box] += items[idx].weight;
    value += valueOf(items[idx]);
  }

  // group remaining items by identical (shape, weight, fragile, optional, value)
  const groups = [];
  const gIndex = new Map();
  items.forEach((it, idx) => {
    if (fixed.has(idx)) return;
    const opt = !!it.optional;
    const k = shapeKey(rotations(it.shape)[0]) + `|${it.weight}|${it.fragile ? 1 : 0}|${opt ? 1 : 0}|${valueOf(it)}`;
    if (!gIndex.has(k)) {
      gIndex.set(k, groups.length);
      const rots = noRotate ? [{ ...rotations(it.shape)[0], rot: 0 }] : distinctRotations(it.shape);
      groups.push({ members: [], rots, weight: it.weight, fragile: !!it.fragile, area: it.shape.cells.length, optional: opt, value: valueOf(it) });
    }
    groups[gIndex.get(k)].members.push(idx);
  });
  // required before optional; within each, big first; optional by value density
  groups.sort((a, b) => a.optional - b.optional || (a.optional ? b.value / b.area - a.value / a.area : 0) || b.area - a.area || b.weight - a.weight);
  const left = groups.map((g) => g.members.length);
  for (const g of groups) for (const r of g.rots) r.anchor = r.cells[0];

  let free = 0;
  grids.forEach((g) => g.forEach((v) => { if (v === -1) free++; }));
  let need = 0; // required area only
  groups.forEach((g, i) => { if (!g.optional) need += g.area * left[i]; });
  let slack = free - need;
  let optValueLeft = 0;
  groups.forEach((g, i) => { if (g.optional) optValueLeft += g.value * left[i]; });

  const cellList = [];
  boxes.forEach((b, box) => {
    for (let l = 0; l < L[box]; l++) for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) cellList.push([box, x, y, l]);
  });

  const solution = new Map(fixed);
  const solutions = [];
  let nodes = 0;
  let remaining = need;
  let bestValue = -1;
  if (slack < 0) return { status: "unsolvable", nodes, solutions };

  const heavyTouch = (box, x, y, l, fragile, weight) => {
    const b = boxes[box], A = AR[box], io = itemOf[box];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
      const o = io[l * A + ny * b.w + nx];
      if (o < 0) continue;
      if (fragile && items[o].weight >= HEAVY) return true;
      if (weight >= HEAVY && items[o].fragile) return true;
    }
    // resting on something fragile / something heavy resting on it
    if (l > 0 && weight >= HEAVY) {
      const u = io[(l - 1) * A + y * b.w + x];
      if (u >= 0 && items[u].fragile) return true;
    }
    return false;
  };

  // Dead-space prune: a pocket of empty cells (within one layer) smaller than
  // the smallest required item can only be filled by single-cell items or left
  // empty. If those pockets hold more cells than the singles left plus the
  // slack, this branch is dead. Also prune on weight.
  const seen = boxes.map((b, i) => new Uint8Array(AR[i] * L[i]));
  let stamp = 0;
  const stack = [];
  const weighted = boxes.every((b) => b.maxWeight != null);
  function deadSpaceExceedsSlack() {
    let minArea = Infinity, singles = 0, wLeft = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      if (!left[gi] || groups[gi].optional) continue;
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
      const b = boxes[box], g = grids[box], sn = seen[box], A = AR[box];
      for (let k = 0; k < g.length; k++) {
        if (g[k] !== -1 || sn[k] === stamp) continue;
        const base = k - (k % A);
        let size = 0;
        stack.push(k);
        sn[k] = stamp;
        while (stack.length) {
          const j = stack.pop();
          size++;
          const r = j - base, x = r % b.w, y = (r / b.w) | 0;
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

  // The biggest required thing left must still have somewhere to go (support
  // is ignored here — the bottom layer may not be built yet).
  function biggestHasRoom() {
    let gi = -1;
    for (let k = 0; k < groups.length; k++) if (left[k] && !groups[k].optional && (gi < 0 || groups[k].area > groups[gi].area)) gi = k;
    if (gi < 0 || groups[gi].area <= 2) return true;
    const g = groups[gi];
    for (let box = 0; box < boxes.length; box++) {
      if (!boxMask[box]) continue;
      const b = boxes[box], grid = grids[box];
      if (b.maxWeight != null && weights[box] + g.weight > b.maxWeight) continue;
      for (let l = 0; l < L[box]; l++) {
        const off = l * AR[box];
        for (const r of g.rots)
          for (let y = 0; y + r.h <= b.h; y++)
            for (let x = 0; x + r.w <= b.w; x++) {
              let ok = true;
              for (const [cx, cy] of r.cells) if (grid[off + (y + cy) * b.w + x + cx] !== -1) { ok = false; break; }
              if (ok) return true;
            }
      }
    }
    return false;
  }

  const record = () => {
    if (maximize) {
      if (value > bestValue) {
        bestValue = value;
        solutions.length = 0;
        solutions.push(new Map(solution));
      }
      return false;
    }
    solutions.push(new Map(solution));
    return solutions.length >= countTo;
  };

  function search(from) {
    if (++nodes > maxNodes) throw BUDGET;
    const doneReq = remaining === 0;
    if (doneReq && value >= minValue) {
      if (!maximize || !optValueLeft) {
        if (record()) return true;
        if (!maximize) return false;
        return false;
      }
      record();
    }
    if (maximize && value + optValueLeft <= bestValue) return false;
    if (!doneReq && (deadSpaceExceedsSlack() || !biggestHasRoom())) return false;
    if (doneReq && !maximize && value < minValue && value + optValueLeft < minValue) return false;
    if (!maximize && value + optValueLeft < minValue) return false;

    let k = from;
    while (k < cellList.length) {
      const [box, x, y, l] = cellList[k];
      if (grids[box][l * AR[box] + y * boxes[box].w + x] === -1) break;
      k++;
    }
    if (k >= cellList.length) return false;
    const [box, x, y, l] = cellList[k];
    const b = boxes[box], A = AR[box], off = l * A, grid = grids[box], io = itemOf[box];

    // an unsupported top-layer cell can only stay empty
    const supported = l === 0 || io[off - A + y * b.w + x] >= 0;
    if (supported) {
      for (let gi = 0; gi < groups.length; gi++) {
        if (!left[gi]) continue;
        const g = groups[gi];
        if (g.optional && g.area > slack) continue;
        if (b.maxWeight != null && weights[box] + g.weight > b.maxWeight) continue;
        for (const r of g.rots) {
          const ox = x - r.anchor[0], oy = y - r.anchor[1];
          let ok = true;
          for (const [cx, cy] of r.cells) {
            const px = ox + cx, py = oy + cy;
            if (px < 0 || py < 0 || px >= b.w || py >= b.h || grid[off + py * b.w + px] !== -1) { ok = false; break; }
            if (l > 0 && io[off - A + py * b.w + px] < 0) { ok = false; break; }
          }
          if (!ok) continue;
          if (g.fragile || g.weight >= HEAVY) {
            for (const [cx, cy] of r.cells) if (heavyTouch(box, ox + cx, oy + cy, l, g.fragile, g.weight)) { ok = false; break; }
            if (!ok) continue;
          }
          const idx = g.members[g.members.length - left[gi]];
          for (const [cx, cy] of r.cells) {
            grid[off + (oy + cy) * b.w + ox + cx] = 1;
            io[off + (oy + cy) * b.w + ox + cx] = idx;
          }
          weights[box] += g.weight;
          left[gi]--;
          if (g.optional) { slack -= g.area; optValueLeft -= g.value; } else remaining -= g.area;
          value += g.value;
          solution.set(idx, { box, x: ox, y: oy, rot: r.rot, layer: l });
          const done = search(k + 1);
          solution.delete(idx);
          value -= g.value;
          if (g.optional) { slack += g.area; optValueLeft += g.value; } else remaining += g.area;
          left[gi]++;
          weights[box] -= g.weight;
          for (const [cx, cy] of r.cells) {
            grid[off + (oy + cy) * b.w + ox + cx] = -1;
            io[off + (oy + cy) * b.w + ox + cx] = -1;
          }
          if (done) return true;
        }
      }
    }
    if (slack > 0) {
      slack--;
      grid[off + y * b.w + x] = -3;
      const done = search(k + 1);
      grid[off + y * b.w + x] = -1;
      slack++;
      if (done) return true;
    } else if (doneReq && value >= minValue && !maximize) {
      return record();
    }
    return false;
  }

  try {
    search(0);
  } catch (e) {
    if (e !== BUDGET) throw e;
    return { status: solutions.length ? "solved" : "budget", nodes, solutions, bestValue };
  }
  return { status: solutions.length ? "solved" : "unsolvable", nodes, solutions, bestValue };
}

const BUDGET = Symbol("budget");

const capOf = (b) => b.w * b.h * layersOf(b);

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
  const need = items.reduce((s, it, i) => s + (it.optional || fixed.has(i) ? 0 : it.shape.cells.length), 0);
  const masks = [];
  for (let m = 1; m < 1 << boxes.length; m++) {
    if (![...must].every((b) => m & (1 << b))) continue;
    const cap = boxes.reduce((s, b, i) => s + (m & (1 << i) ? capOf(b) : 0), 0) - fixedCells;
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
export function parBoxes(boxes, items, maxNodes = 3e6, extra = {}) {
  const n = boxes.length;
  let best = null;
  for (let size = 1; size <= n && best == null; size++) {
    for (let mask = 0; mask < 1 << n; mask++) {
      if (popcount(mask) !== size) continue;
      const boxMask = boxes.map((_, i) => !!(mask & (1 << i)));
      const res = solve(boxes, items, { ...extra, boxMask, maxNodes });
      if (res.status === "solved") { best = size; break; }
    }
  }
  return best;
}

/** Highest total value that can be packed (keep-or-let-go rooms). */
export function bestHaul(boxes, items, maxNodes = 2e7) {
  const r = solve(boxes, items, { maximize: true, maxNodes });
  return { value: r.bestValue, solution: r.solutions[0] || null, exact: r.status !== "budget" };
}

function popcount(m) { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; }
