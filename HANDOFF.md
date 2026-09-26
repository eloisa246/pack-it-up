# Latest handoff

**2026-09-26 — Claude Code (Opus 5.5): round two after the first playtest.**

Start with `AGENTS.md`.

- **Shipped:** two-layer boxes; keep-or-let-go rooms (hearts, target, best
  haul); Stretchy's mood and mischief; a 16-room campaign where each room adds
  one idea; a daily box; a loudness-normalized soundtrack per room; a
  simulated player (`src/game/planner.js`) calibrated to the playtest as the
  difficulty metric.
- **Verified:** `pnpm test` (29 tests, including stacking, crush, keep, best
  haul and the daily generator); `node tools/check-levels.mjs`;
  `node tools/difficulty.mjs`; a headless-browser bot that plays all 16 rooms
  and the daily box through real mouse input with no errors; swat, pounce and
  zoomies exercised in the browser.
- **Not verified:** real phones, audio by ear, a human playing the new rooms.
  See `FINISH_PLAN.md`.
