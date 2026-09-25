// How hard is each room, really? Solution counts overstate ease (swapping two
// little things counts as a "new" solution), so we also simulate a player who
// doesn't plan: biggest thing first, dropped in a random spot where it fits.
// If that player usually finishes, the room isn't asking you to think.
//
//   node tools/difficulty.mjs [filter]
import { LEVELS } from "../src/game/data/levels.js";
import { levelItems, levelBoxes } from "../src/game/data/build.js";
import { solve, solveAny, parBoxes } from "../src/game/engine.js";
import { naiveWinRate } from "./naive.mjs";

const filter = process.argv[2];
console.log("room                 sols   naive-win  par/boxes  pro-naive");
for (const [n, level] of LEVELS.entries()) {
  if (filter && !level.id.includes(filter)) continue;
  const items = levelItems(level), boxes = levelBoxes(level);
  const sols = solve(boxes, items, { countTo: 3000, maxNodes: 5e6 }).solutions.length;
  if (!sols && solveAny(boxes, items, { maxNodes: 8e6 }).status !== "solved") throw new Error(`${level.id} unsolvable`);
  const par = parBoxes(boxes, items);
  const win = naiveWinRate(boxes, items, 400);
  const pro = par < boxes.length ? naiveWinRate(boxes, items, 400, par) : null;
  console.log(
    `${String(n + 1).padStart(2)} ${level.id.padEnd(17)} ${String(sols >= 3000 ? "3000+" : sols).padStart(5)}   ${(win * 100).toFixed(0).padStart(5)}%     ${par}/${boxes.length}      ${pro == null ? "  -" : (pro * 100).toFixed(0).padStart(3) + "%"}`,
  );
}
