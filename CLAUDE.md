# Pack It Up — Claude instructions

Read **`AGENTS.md`** — it has the architecture, the design rules (proportions,
difficulty targets), and the content workflow. This file adds nothing
Claude-specific beyond:

- Before claiming a content change is done, run `pnpm test`,
  `node tools/check-levels.mjs` and `node tools/difficulty.mjs` in
  `artifacts/pack-it-up/`.
- To see the game, build and serve it, then drive it headlessly — `?debug`
  exposes `window.__play` (the room's solver plan is `window.__play.solution`).
- The old multi-agent process files (`docs/ai-team/`, the agent ledger) belong
  to the retired productivity app. Ignore them.
