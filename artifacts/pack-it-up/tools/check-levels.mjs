// Verify every level is solvable and report how hard it is.
//   node tools/check-levels.mjs            all levels
//   node tools/check-levels.mjs closet     levels whose id contains "closet"
import { LEVELS } from "../src/game/data/levels.js";
import { levelItems, levelBoxes } from "../src/game/data/build.js";
import { solve, solveAny, parBoxes, rotations, cellsAt } from "../src/game/engine.js";

const filter = process.argv[2];
let failed = 0;

for (const [n, level] of LEVELS.entries()) {
  if (filter && !level.id.includes(filter)) continue;
  const items = levelItems(level);
  const boxes = levelBoxes(level);
  const cap = boxes.reduce((s, b) => s + b.w * b.h, 0);
  const need = items.reduce((s, it) => s + it.shape.cells.length, 0);
  const wt = items.reduce((s, it) => s + it.weight, 0);
  const wcap = boxes.every((b) => b.maxWeight != null) ? boxes.reduce((s, b) => s + b.maxWeight, 0) : null;

  const t0 = Date.now();
  // count solutions where that's cheap; always confirm solvability via the fast path
  const counted = solve(boxes, items, { countTo: 300, maxNodes: 2e6 });
  const res = counted.solutions.length ? counted : solveAny(boxes, items, { maxNodes: 8e6 });
  const ms = Date.now() - t0;
  const par = res.status === "solved" ? parBoxes(boxes, items) : null;
  let fixedRot = "";
  if (level.teach === "drag" || level.teach === "rotate") {
    const r0 = solve(boxes, items, { noRotate: true });
    fixedRot = `  no-rotate:${r0.status}`;
  }
  if (res.status !== "solved") failed++;

  const count = res.solutions.length >= 300 ? "300+" : res.solutions.length;
  console.log(
    `\n${String(n + 1).padStart(2)}. ${level.id.padEnd(18)} ${res.status.toUpperCase()}  sols:${count}  nodes:${res.nodes}  ${ms}ms  par:${par}/${boxes.length}${fixedRot}`,
  );
  console.log(
    `    cells ${need}/${cap} (slack ${cap - need})  items ${items.length}` +
      (wcap != null ? `  weight ${wt}/${wcap}` : "") +
      `  rules:[${(level.rules || []).join(",")}]  cat:${level.cat ? level.cat : "-"}`,
  );
  if (res.solutions[0]) printSolution(boxes, items, res.solutions[0]);
}

function printSolution(boxes, items, sol) {
  const glyph = (i) => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"[i];
  const grids = boxes.map((b) => Array.from({ length: b.h }, () => Array(b.w).fill("·")));
  for (const [idx, p] of sol) {
    for (const [x, y] of cellsAt(rotations(items[idx].shape)[p.rot], p.x, p.y)) grids[p.box][y][x] = glyph(idx);
  }
  const rows = Math.max(...boxes.map((b) => b.h));
  for (let y = 0; y < rows; y++) {
    console.log("    " + grids.map((g, i) => (g[y] ? g[y].join("") : " ".repeat(boxes[i].w))).join("   "));
  }
  console.log(
    "    " + items.map((it, i) => `${glyph(i)}=${it.id}${it.weight >= 3 ? "!" : ""}${it.fragile ? "*" : ""}`).join(" "),
  );
}

if (failed) {
  console.error(`\n${failed} level(s) not solvable`);
  process.exit(1);
}
