# Redesign review (mechanical + aesthetic) — session summary
**Date:** 2026-07-25
**Harness / model:** [Claude Code / **Opus 5**] — new model, first session on this project
**Branch:** `claude/game-redesign-recommendations-flsc1o` (merged to main: **no** — pushed only;
docs-only diff, merge is Eloisa's call since this is a first read by an unfamiliar model)

### ⚠ Correction landed in this same session — read first
Eloisa flagged it: **the measurements ran against a fresh install, not her save.** A headless
browser has empty `localStorage`, so the build I walked was a day-one game seeded from
`INITIAL_TASKS`. Her device has a curated ledger (things done, dates edited, cards archived), and
`mergeTasks` treats saved membership as canonical (`save.js:136`) — so her list may not even hold
the same 180 cards. All magnitudes below describe the seed and are almost certainly high.

Fixed in-session rather than caveated away:
- **`docs/design/tools/hand-audit.mjs`** — re-runs every measurement through the game's own boot
  path (`mergeTasks(INITIAL_TASKS, save.tasks)`) against a real save export. One command.
- **Part 0** of the review now splits *code facts that hold for any dataset* from *seed-conditioned
  magnitudes that need re-running* — with the reason for each.
- FINISH_PLAN / HANDOFF / DEVLOG all carry the provenance warning.

The structural findings survive; the numbers need her data.

### Done
- Full familiarization pass: `AGENTS.md` → `FINISH_PLAN.md` → `HANDOFF.md` → engine
  (`schedule.js`, `tasks.js`, `session.js`, `movePhase.js`) → live build walked at 390×844.
- **`docs/design/2026-07-25-opus5-redesign-review.md`** — 6 mechanical + 8 aesthetic findings,
  each verified against the running scheduler or the live build, with a ranked 12-item ticket table.
- Three evidence screenshots in `docs/design/screens/` (1× phone, ~200KB each).
- Headline finding, measured: **a Fumes day on Jul 25 deals 69 bound cards / 103 effort**
  against a design budget of 3, growing to **127 cards on flight day**. Energy tier does not
  change the bound hand at all — Fumes, Steady and Full are byte-identical in what they force.
- Second: **both fan renderers break at real card counts.** Apartment fan spans ~1351px on a
  390px screen (card width clamps to 40px, step does not) and collides with the Sal widget in
  every room; the Board hand clips its own tail behind `overflow: hidden`, so most cards in the
  hand cannot be tapped.
- Third: `taskPressure` returns **3 on every day from Jul 12 to Jul 31** against this dataset —
  the Jul 13 fix changed the mechanism, not the outcome.
- Also confirmed dead: `buildMinimumSchedule` (exported, never called), `branchOptions` and
  `nextTaskOnComplete` (normalized, never read — so both sides of every keep/donate decision
  sit live in the deck at once).

### Still broken / unfinished (do next)
- Nothing was fixed — this session is **advisory only, zero game-code edits**.
- Tickets 1–3 in the review (cap the hand · fix the fan math · make energy real) are the ones
  that matter before the flight. All three live in `schedule.js` + the fan math in
  `BedroomSlice.jsx:3388` / `Screens.jsx:1239`, all three are small, and together they turn the
  last six days from the app's worst experience into its best.
- The review's ticket table has **not** been folded into `FINISH_PLAN.md` beyond a pointer —
  deliberately: Eloisa (or Fable) should choose which of the 12 enter the plan rather than
  having a new model reorder the queue on its own authority.

### Do not
- Do not treat this as a mandate to redesign the rooms, the calendar, the Body Board, or the
  audio. Those are the strongest parts of the project and the review says so explicitly.
- Do not start the U-Box capacity model, the two-deck split, or portrait room authoring before
  the move. They are listed post-move for a reason.
- Do not "fix" the pressure meter by widening the thresholds — the fix is to measure today
  against today's capacity so the bar can fall.

### Quick verify
```bash
cd artifacts/pack-it-up/src && node -e "
Promise.all([import('./tasks.js'),import('./schedule.js')]).then(([T,S])=>{
  for (const d of [5,12,19,25,29,31]) {
    const h = S.dealDailyHand(T.INITIAL_TASKS,'fumes',new Date(2026,6,d));
    console.log('Jul',d,'→',h.boundTotal,'cards /',h.boundEffort,'effort (budget: 3)');
  }});"
```
For the visuals: `PORT=5199 BASE_PATH=/ pnpm dev` in `artifacts/pack-it-up`, then open
`/?uiPreview=board` at 390×844 and tap FUMES.

### Suggested next-session order
1. Eloisa reads the review and picks which tickets enter `FINISH_PLAN.md` → Open next.
2. [cursor] Tickets 2 then 1 then 3 — fan math first because it is pure layout and cannot
   regress the scheduler; then the hand cap; then energy.
3. [cursor] Ticket 4 (pressure falls) — small, and it makes Stretchy's mood mean something.
4. [fable/eloisa] Ticket 7, six icons in the room palette — the cheapest visible win here.

### Ledger note
Claimed the `claude_opus` slot, which the ledger describes as Opus 4.8. **I am Opus 5** —
a different model. Advisory risk, no locks held, set back to IDLE at close. Eloisa may want a
separate ledger key for this model.
