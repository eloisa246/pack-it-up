# Latest handoff

**2026-09-25 — Claude Code (Opus 5.5): Pack It Up rebuilt as a game.**

The productivity app is gone; `main` is now a packing puzzle. Start with
`AGENTS.md`.

- **Shipped:** 13 rooms; item shapes derived from sprite silhouettes; rules for
  rotation, multiple boxes, weight, fragile/heavy; Stretchy as a cat who naps
  in open box space; Pro goals; solver-backed hints; memories on keepsakes; a
  moving-day ending.
- **Verified:** `pnpm test` (21 tests: engine rules, every room solvable,
  tutorials teach what they claim, shapes in sync with the catalog);
  `node tools/check-levels.mjs`; `node tools/difficulty.mjs`; a headless-browser
  bot that plays all 13 rooms through real mouse drags (0 failed drops) and
  screenshots every screen at 390×844, 844×390 and 1440×900.
- **Not verified:** real phones, audio by ear, a human playing it. See
  `FINISH_PLAN.md`.
- **Deploy:** the old Vercel project's 404 was a project-config issue, not the
  build. A fresh Vercel project pointed at this repo (Root Directory = repo
  root, no env vars) builds it via `vercel.json`. Old save data doesn't carry
  over (the new game uses `pack-it-up/v2`), so the URL no longer matters.
