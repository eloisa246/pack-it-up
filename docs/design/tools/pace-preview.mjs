/**
 * pace-preview — prototype of the pace-driven hand.
 *
 * Spec: `docs/design/2026-07-25-pace-driven-hand.md`. This is a read-only
 * prototype so the design can be judged on real output before anyone writes it
 * into the game. It never touches the save or the repo.
 *
 * What it does:
 *   1. Reserves fixtures (exact-date events, "attend" appointments) on their day.
 *      You cannot decline your flight, so it is never budget and never cut.
 *   2. Level-loads everything else: finds the smallest daily effort C at which
 *      the work still fits before its own deadlines. That C is the pace.
 *   3. Today's hand = what lands on today at capacity C, most urgent first.
 *   4. If it does not fit at a humane capacity, it cuts — criticalPath last,
 *      then criticality, then urgency — and shows you what it cut.
 *
 * Usage, from the repo root:
 *   node docs/design/tools/pace-preview.mjs                       # seed data
 *   node docs/design/tools/pace-preview.mjs my-save.json          # your save
 *   node docs/design/tools/pace-preview.mjs my-save.json 8        # cap at 8 effort/day
 *   node docs/design/tools/pace-preview.mjs my-save.json 8 2026-07-25
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SRC = path.resolve(import.meta.dirname, "../../../artifacts/pack-it-up/src");
const load = (f) => import(pathToFileURL(path.join(SRC, f)).href);
const [T, S, MP, SAVE] = await Promise.all([
  load("tasks.js"), load("schedule.js"), load("movePhase.js"), load("save.js"),
]);

const [savePath, capArg, dateArg] = process.argv.slice(2);
const CEILING = Number(capArg) || 8;                 // humane daily effort ceiling
const today = dateArg ? new Date(`${dateArg}T12:00:00`) : new Date();
const todayK = MP.dateKey(today);
const MOVE = MP.MOVE_DATE;
const add = S.addDaysISO;
const eff = (t) => Math.min(3, Math.max(1, Number(t.effort) || 1));

let tasks = T.INITIAL_TASKS;
let source = "seed INITIAL_TASKS (fresh install)";
if (savePath) {
  const raw = JSON.parse(fs.readFileSync(savePath, "utf8"));
  const blob = Array.isArray(raw?.tasks) ? raw : (raw?.save ?? raw?.data ?? raw);
  if (!Array.isArray(blob?.tasks)) {
    console.error(`No .tasks array in ${savePath} — expected the Settings save export.`);
    process.exit(1);
  }
  tasks = SAVE.mergeTasks(T.INITIAL_TASKS, blob.tasks);
  source = `${path.basename(savePath)} (${blob.tasks.length} saved cards)`;
}

const open = S.normalizeTasks(tasks).filter(T.isOpen);
// A fixture is an event, not work: it happens at a time whether you like it or not.
const isFixture = (t) => !!(t.exactDate || t.kind === "attend");
const fixtures = open.filter(isFixture);
const work = open.filter((t) => !isFixture(t));

/** Place `list` as late as possible at capacity C. Fixtures pre-reserve their day. */
function place(list, C) {
  const cap = {};
  for (let d = todayK, g = 0; d && d <= MOVE && g < 400; d = add(d, 1), g++) cap[d] = C;
  const placed = {};
  for (const f of fixtures) {
    const d = f.exactDate || f.latestDate || f.targetDate;
    if (!d || d < todayK || d > MOVE) continue;
    cap[d] = (cap[d] ?? 0) - eff(f);
    placed[f.id] = d;
  }
  const cut = [];
  for (const t of list) {
    const earliest = [todayK, t.availableFrom].filter(Boolean).sort().pop();
    let latest = t.latestDate || t.targetDate || MOVE;
    if (latest > MOVE) latest = MOVE;
    if (latest < earliest) latest = earliest;
    const e = eff(t);
    let day = null;
    for (let d = latest, g = 0; d && d >= earliest && g < 400; d = add(d, -1), g++) {
      if ((cap[d] ?? -1) >= e) { day = d; break; }
    }
    if (!day) { cut.push(t); continue; }
    cap[day] -= e;
    placed[t.id] = day;
  }
  return { placed, cut };
}

// Cut order: criticalPath survives longest, then criticality, then deadline urgency.
const ranked = [...work].sort((a, b) =>
  (b.criticalPath ? 1 : 0) - (a.criticalPath ? 1 : 0)
  || (b.criticality || 1) - (a.criticality || 1)
  || S.compareTaskUrgency(a, b, today));

// The pace: smallest C at which everything still fits.
let pace = null;
for (let C = 1; C <= 60; C++) {
  if (place(ranked, C).cut.length === 0) { pace = C; break; }
}

const line = (t) => `  [${(t.category || "?").padEnd(7)}] e${eff(t)} c${t.criticality}${t.criticalPath ? "*" : " "} ${t.title.slice(0, 52)}`;

console.log(`\nSOURCE   ${source}`);
console.log(`DATE     ${todayK}  ·  phase: ${MP.currentPhase(today).label}  ·  ${MP.daysUntil(MOVE, today)} days to the flight`);
console.log(`LEDGER   ${open.length} open · ${work.length} work + ${fixtures.length} fixtures (events you can't decline)\n`);

if (pace && pace <= CEILING) {
  const { placed } = place(ranked, pace);
  const hand = ranked.filter((t) => placed[t.id] === todayK)
    .sort((a, b) => S.compareTaskUrgency(a, b, today));
  const todayFixtures = fixtures.filter((f) => (f.exactDate || f.latestDate || f.targetDate) === todayK);
  console.log(`PACE     ${pace} effort/day keeps everything on time. The plan fits.\n`);
  if (todayFixtures.length) {
    console.log("TODAY — fixed (happening whether or not you act):");
    todayFixtures.forEach((t) => console.log(line(t)));
    console.log();
  }
  console.log(`TODAY — ${hand.length} cards / ${hand.reduce((s, t) => s + eff(t), 0)} effort:`);
  hand.forEach((t) => console.log(line(t)));
} else {
  const { placed, cut } = place(ranked, CEILING);
  const hand = ranked.filter((t) => placed[t.id] === todayK)
    .sort((a, b) => S.compareTaskUrgency(a, b, today));
  const kept = ranked.filter((t) => placed[t.id]);
  const todayFixtures = fixtures.filter((f) => (f.exactDate || f.latestDate || f.targetDate) === todayK);

  console.log(`PACE     Everything fits only at ${pace ? `${pace} effort/day` : ">60 effort/day"} — that is not a day.`);
  console.log(`         Holding a humane ${CEILING}/day, ${kept.length} of ${work.length} cards fit before the flight.`);
  console.log(`         ${cut.length} do not. That is the real decision, and it is yours, not the app's.\n`);

  if (todayFixtures.length) {
    console.log("TODAY — fixed (happening whether or not you act):");
    todayFixtures.forEach((t) => console.log(line(t)));
    console.log();
  }
  console.log(`TODAY — ${hand.length} cards / ${hand.reduce((s, t) => s + eff(t), 0)} effort:`);
  hand.forEach((t) => console.log(line(t)));

  console.log(`\nNOT HAPPENING — ${cut.length} cards, by lane:`);
  const byCat = {};
  for (const t of cut) (byCat[t.category] ??= []).push(t);
  for (const [c, list] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${c.padEnd(8)} ${String(list.length).padStart(3)}  ${list.slice(0, 2).map((t) => t.title.slice(0, 30)).join(" · ")}`);
  }
  const cp = cut.filter((t) => t.criticalPath);
  if (cp.length) {
    console.log(`\n  ⚠ ${cp.length} of the cuts are marked CRITICAL PATH — the plan cannot hold them at ${CEILING}/day:`);
    cp.slice(0, 8).forEach((t) => console.log(line(t)));
    console.log(`  Raise the ceiling, get help, or move a date. Those are the only three levers.`);
  }
}
console.log();
