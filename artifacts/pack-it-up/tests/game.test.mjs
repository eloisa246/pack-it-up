// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rotate, rotations, distinctRotations, makeBoard, put, lift, fits, boxWeight,
  fragileConflicts, overweightBoxes, isSolved, solve, solveAny, parBoxes,
  heightAt, itemsOnTop, packedValue, bestHaul,
} from "../src/game/engine.js";
import { LEVELS } from "../src/game/data/levels.js";
import { ITEMS } from "../src/game/data/items.js";
import SHAPES from "../src/game/data/shapes.js";
import { levelItems, levelBoxes } from "../src/game/data/build.js";
import { decodePng } from "../tools/png.mjs";
import { deriveShape } from "../tools/derive.mjs";

const one = { w: 1, h: 1, cells: [[0, 0]] };
const L = { w: 2, h: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] };

test("four quarter turns bring a shape back", () => {
  let s = L;
  for (let i = 0; i < 4; i++) s = rotate(s);
  assert.deepEqual(s, rotations(L)[0]);
  assert.equal(distinctRotations(L).length, 4);
  assert.equal(distinctRotations({ w: 2, h: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }).length, 1);
});

test("placement, lifting and overlap", () => {
  const items = [{ shape: L, weight: 1 }, { shape: one, weight: 1 }];
  const b = makeBoard([{ w: 3, h: 3 }], items);
  assert.ok(fits(b, 0, 0, 0, 0, 0));
  put(b, 0, 0, 0, 0, 0);
  assert.equal(fits(b, 1, 0, 0, 0, 0), false, "can't overlap");
  assert.ok(fits(b, 1, 0, 1, 0, 0));
  assert.equal(fits(b, 1, 0, 3, 0, 0), false, "can't leave the box");
  lift(b, 0);
  assert.ok(fits(b, 1, 0, 0, 0, 0));
});

test("weight and fragile rules are reported, not blocked", () => {
  const items = [
    { shape: one, weight: 3 },
    { shape: one, weight: 1, fragile: true },
  ];
  const b = makeBoard([{ w: 3, h: 1, maxWeight: 3 }], items);
  put(b, 0, 0, 0, 0, 0);
  put(b, 1, 0, 1, 0, 0);
  assert.equal(boxWeight(b, 0), 4);
  assert.deepEqual(overweightBoxes(b), [0]);
  assert.equal(fragileConflicts(b).length, 1);
  assert.equal(isSolved(b), false);
});

test("solver respects every rule", () => {
  const heavy = { shape: one, weight: 3 }, glass = { shape: one, weight: 1, fragile: true };
  assert.equal(solve([{ w: 2, h: 1 }], [heavy, glass]).status, "unsolvable");
  assert.equal(solve([{ w: 3, h: 1 }], [heavy, glass]).status, "solved");
  assert.equal(solve([{ w: 2, h: 1, maxWeight: 3 }], [heavy, heavy]).status, "unsolvable");
});

test("stacking needs something solid underneath", () => {
  const bar = { w: 2, h: 1, cells: [[0, 0], [1, 0]] };
  const items = [{ shape: bar, weight: 1 }, { shape: one, weight: 1 }, { shape: one, weight: 1 }];
  const b = makeBoard([{ w: 2, h: 1, layers: 2 }], items);
  assert.equal(fits(b, 1, 0, 0, 0, 0, 1), false, "can't float on an empty floor");
  put(b, 0, 0, 0, 0, 0, 0);
  assert.ok(fits(b, 1, 0, 0, 0, 0, 1));
  assert.equal(fits(b, 1, 0, 0, 0, 0, 2), false, "only two layers");
  put(b, 1, 0, 1, 0, 0, 1);
  assert.equal(heightAt(b, 0, 1, 0), 2);
  assert.equal(heightAt(b, 0, 0, 0), 1);
  assert.deepEqual(itemsOnTop(b, 0), [1]);
  assert.deepEqual(itemsOnTop(b, 1), []);
  // single-layer boxes stay single-layer
  const flat = makeBoard([{ w: 2, h: 1 }], items);
  put(flat, 0, 0, 0, 0, 0, 0);
  assert.equal(fits(flat, 1, 0, 0, 0, 0, 1), false);
});

test("heavy things crush fragile ones from above", () => {
  const items = [{ shape: one, weight: 1, fragile: true }, { shape: one, weight: 3 }, { shape: one, weight: 1 }];
  const b = makeBoard([{ w: 1, h: 1, layers: 2 }], items);
  put(b, 0, 0, 0, 0, 0, 0);
  put(b, 1, 0, 0, 0, 0, 1);
  assert.equal(fragileConflicts(b)[0].kind, "crush");
  lift(b, 1); // swap the heavy thing for a light one
  put(b, 2, 0, 0, 0, 0, 1);
  assert.equal(fragileConflicts(b).length, 0);
  // the solver finds the safe order: heavy on the bottom, glass on top
  assert.equal(solve([{ w: 1, h: 1, layers: 2 }], items.slice(0, 2)).status, "solved");
});

test("the solver stacks, and never floats anything", () => {
  const bar = { w: 2, h: 1, cells: [[0, 0], [1, 0]] };
  const items = [{ shape: bar, weight: 1 }, { shape: one, weight: 1 }, { shape: one, weight: 1 }];
  const r = solve([{ w: 2, h: 1, layers: 2 }], items);
  assert.equal(r.status, "solved");
  const b = makeBoard([{ w: 2, h: 1, layers: 2 }], items);
  for (const [i, p] of [...r.solutions[0]].sort((a, c) => a[1].layer - c[1].layer)) {
    assert.ok(fits(b, i, p.box, p.x, p.y, p.rot, p.layer), "solution placement is legal in order");
    put(b, i, p.box, p.x, p.y, p.rot, p.layer);
  }
  assert.equal(solve([{ w: 2, h: 1, layers: 2 }], [items[1], items[2], items[1], items[2], items[1]]).status, "unsolvable");
});

test("keep rooms: optional items, value targets and the best haul", () => {
  const two = { w: 2, h: 1, cells: [[0, 0], [1, 0]] };
  const items = [
    { shape: two, weight: 1, optional: true, value: 3 },
    { shape: two, weight: 1, optional: true, value: 1 },
    { shape: one, weight: 1, optional: true, value: 2 },
    { shape: one, weight: 1, optional: true, value: 2 },
  ];
  const boxes = [{ w: 2, h: 2 }];
  const hl = bestHaul(boxes, items);
  assert.equal(hl.value, 7);
  assert.ok(hl.exact);
  assert.equal(solve(boxes, items, { minValue: 7 }).status, "solved");
  assert.equal(solve(boxes, items, { minValue: 8 }).status, "unsolvable");
  const b = makeBoard(boxes, items);
  assert.ok(!isSolved(b, { target: 3 }));
  put(b, 0, 0, 0, 0, 0);
  assert.equal(packedValue(b), 3);
  assert.ok(isSolved(b, { target: 3 }), "leaving things behind is allowed");
});

test("generated shapes are in sync with the item catalog", () => {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../src/assets/items/packitup_cropped_assets/normalized");
  for (const [id, it] of Object.entries(ITEMS)) {
    assert.ok(SHAPES[id], `${id} missing from shapes.js — run node tools/build-shapes.mjs`);
    if (it.shape) continue;
    const s = deriveShape(decodePng(join(dir, it.file + ".png")), it.size, it.t ?? 0.34);
    assert.deepEqual(SHAPES[id].cells, s.cells, `${id} is stale — run node tools/build-shapes.mjs`);
  }
});

test("every shape is one connected piece", () => {
  for (const [id, s] of Object.entries(SHAPES)) {
    const set = new Set(s.cells.map((c) => c.join()));
    const seen = new Set([s.cells[0].join()]);
    const q = [s.cells[0]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${x + dx},${y + dy}`;
        if (set.has(k) && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
    assert.equal(seen.size, s.cells.length, `${id} is in pieces`);
  }
});

for (const [n, level] of LEVELS.entries()) {
  test(`room ${n + 1} (${level.id}) can be packed`, () => {
    const items = levelItems(level), boxes = levelBoxes(level);
    assert.equal(solveAny(boxes, items, { maxNodes: 5e6, minValue: level.keep?.target || 0 }).status, "solved");
    if (level.keep) {
      const hl = bestHaul(boxes, items);
      assert.equal(hl.value, level.keep.best, `${level.id}: keep.best is stale (${hl.value})`);
      assert.ok(level.keep.target < level.keep.best, "the target leaves room for a better haul");
    }
  });
}

test("tutorials teach what they say", () => {
  for (const level of LEVELS.filter((l) => l.teach === "drag" || l.teach === "rotate")) {
    const r = solve(levelBoxes(level), levelItems(level), { noRotate: true });
    if (level.teach === "drag") assert.equal(r.status, "solved", `${level.id} shouldn't need rotation`);
    else assert.equal(r.status, "unsolvable", `${level.id} should require rotation`);
  }
  const par = LEVELS.find((l) => l.teach === "par");
  assert.ok(parBoxes(levelBoxes(par), levelItems(par)) < par.boxes.length, "the par lesson needs a spare box");
});

test("level ids are unique", () => {
  assert.equal(new Set(LEVELS.map((l) => l.id)).size, LEVELS.length);
});

test("the daily box is the same for everyone, and always packable", async () => {
  const { dailyLevel } = await import("../src/game/daily.js");
  for (const key of ["2026-01-01", "2026-06-15", "2026-12-31"]) {
    const a = dailyLevel(key), b = dailyLevel(key);
    assert.ok(a, `${key}: no room`);
    assert.deepEqual(a, b, `${key}: not deterministic`);
    assert.equal(solveAny(levelBoxes(a), levelItems(a), { maxNodes: 2e6 }).status, "solved", `${key}: unsolvable`);
  }
});
