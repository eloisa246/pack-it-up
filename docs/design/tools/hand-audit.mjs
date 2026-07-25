/**
 * hand-audit — re-run the redesign review's measurements against a REAL save.
 *
 * The numbers in `docs/design/2026-07-25-opus5-redesign-review.md` were measured
 * against a fresh install (seed `INITIAL_TASKS`, no save). Eloisa's device has a
 * curated ledger: things marked done, dates edited, criticality overridden,
 * cards archived. Those numbers therefore describe the seed, not her game.
 *
 * This runs the *same* boot path the game runs — `mergeTasks(INITIAL_TASKS,
 * save.tasks)` — so the output is what her phone would actually deal.
 *
 * Usage, from the repo root:
 *   node docs/design/tools/hand-audit.mjs                    # seed data (review baseline)
 *   node docs/design/tools/hand-audit.mjs my-save.json       # her real save
 *   node docs/design/tools/hand-audit.mjs my-save.json 2026-07-25   # pin the date
 *
 * To get the save file: Settings → "Copy canonical mobile save", paste into a
 * .json file. Read-only — this never writes to the save or the repo.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(import.meta.dirname, "../../../artifacts/pack-it-up/src");
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);

const [savePath, dateArg] = process.argv.slice(2);
const today = dateArg ? new Date(`${dateArg}T12:00:00`) : new Date();

const [T, S, SE, MP] = await Promise.all([
  load("tasks.js"), load("schedule.js"), load("session.js"), load("movePhase.js"),
]);
const { mergeTasks } = await load("save.js");

let tasks = T.INITIAL_TASKS;
let source = "seed INITIAL_TASKS (fresh install — the review's baseline)";
if (savePath) {
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  // Accept either the raw save blob or a wrapper that contains one.
  const blob = Array.isArray(raw?.tasks) ? raw : (raw?.save ?? raw?.data ?? raw);
  if (!Array.isArray(blob?.tasks)) {
    console.error(`No .tasks array found in ${savePath}. Expected the save blob from Settings → "Copy canonical mobile save".`);
    process.exit(1);
  }
  tasks = mergeTasks(T.INITIAL_TASKS, blob.tasks);
  const saved = blob.savedAt ? new Date(blob.savedAt).toISOString().slice(0, 16).replace("T", " ") : "unknown";
  source = `${path.basename(savePath)} — ${blob.tasks.length} saved cards, v${blob.v ?? "?"}, saved ${saved}`;
}

const open = tasks.filter(T.isOpen);
const pad = (v, n) => String(v).padStart(n);

console.log(`\nSOURCE   ${source}`);
console.log(`DATE     ${MP.dateKey(today)}  (phase: ${MP.currentPhase(today).label})`);
console.log(`LEDGER   ${tasks.length} cards total · ${open.length} open · ${tasks.length - open.length} done/archived/dismissed\n`);

console.log("--- Today's hand, by energy (review finding M1/M2) ---");
console.log("energy   bound  effort   budget   offers   quota");
for (const e of ["fumes", "steady", "full"]) {
  const d = S.dealDailyHand(tasks, e, today);
  console.log(
    `${e.padEnd(8)}${pad(d.boundTotal, 5)}${pad(d.boundEffort, 8)}${pad(SE.ENERGY_BUDGET[e], 9)}`
    + `${pad(d.offerTaskIds.length, 9)}${pad(d.dailyQuota, 8)}`,
  );
}
console.log("\n  bound = cards you CANNOT decline. 'budget' is ENERGY_BUDGET, the design intent.");
console.log("  If bound is identical across all three rows, energy isn't changing your hand (M2).");

console.log("\n--- Deadline-status spread (review finding M3) ---");
const hist = {};
for (const t of open) {
  const s = S.taskStatus(t, today, tasks);
  hist[s] = (hist[s] || 0) + 1;
}
for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${v}`);
}
console.log(`  pressure meter reads ${T.taskPressure(tasks, today)} / 3  (${T.PRESSURE_LABELS[T.taskPressure(tasks, today)]})`);
console.log(`  Stretchy stress      ${T.stretchyStress(tasks, today)} / 2`);

console.log("\n--- Curve to the flight (review finding M1) ---");
console.log("date          fumes hand   effort");
for (const day of [25, 26, 27, 28, 29, 30, 31]) {
  const d0 = new Date(2026, 6, day, 12);
  if (MP.dateKey(d0) < MP.dateKey(today)) continue;
  const d = S.dealDailyHand(tasks, "fumes", d0);
  console.log(`Jul ${pad(day, 2)}       ${pad(d.boundTotal, 8)}${pad(d.boundEffort, 9)}`);
}

console.log("\n--- What the badges would say ---");
const byCat = {};
for (const t of open) byCat[t.category] = (byCat[t.category] || 0) + 1;
console.log(" ", Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join("  "));
const bound42 = tasks.filter((t) => t.binding).length;
console.log(`  world-bound cards: ${bound42} / ${tasks.length} (${Math.round(bound42 / tasks.length * 100)}%) — review finding M5`);
console.log();
