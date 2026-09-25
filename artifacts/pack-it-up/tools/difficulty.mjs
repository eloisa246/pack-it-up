// How hard is each room? A simulated player who plans the way a person does
// (tools/planner.mjs) tries each room many times; its finish rate is the
// difficulty signal. Calibrated against a human playthrough: rooms that felt
// easy score 85–100%, the one that felt hard scored 30%.
//
// Targets: tutorials/early ~90%+, middle 60–80%, late 30–50%, finale < 25%.
// Pro goals (fewest boxes, or the best haul in keep rooms) should land
// around 20–50%.
//
//   node tools/difficulty.mjs [filter]
import { LEVELS } from "../src/game/data/levels.js";
import { levelItems, levelBoxes } from "../src/game/data/build.js";
import { solveAny, parBoxes } from "../src/game/engine.js";
import { plannerWinRate } from "./planner.mjs";

const filter = process.argv[2];
console.log("room                    planner   par/boxes   pro");
for (const [n, level] of LEVELS.entries()) {
  if (filter && !level.id.includes(filter)) continue;
  const items = levelItems(level), boxes = levelBoxes(level);
  const keep = level.keep || null;
  if (solveAny(boxes, items, { maxNodes: 8e6, minValue: keep?.target || 0 }).status !== "solved") throw new Error(`${level.id} unsolvable`);
  const pct = (v) => (v == null ? "   -" : `${Math.round(v * 100)}%`.padStart(4));
  const num = String(n + 1).padStart(2);
  if (keep) {
    const win = plannerWinRate(boxes, items, 150, Infinity, 11, keep);
    const pro = plannerWinRate(boxes, items, 150, Infinity, 11, { ...keep, need: keep.best });
    console.log(`${num} ${level.id.padEnd(20)} ${pct(win)}      ♥${keep.target}/${keep.best}      ${pct(pro)}`);
    continue;
  }
  const par = parBoxes(boxes, items);
  const win = plannerWinRate(boxes, items, 150);
  const pro = par < boxes.length ? plannerWinRate(boxes, items, 150, par) : null;
  console.log(`${num} ${level.id.padEnd(20)} ${pct(win)}      ${par}/${boxes.length}       ${pct(pro)}`);
}
