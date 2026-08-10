# CLAUDE.md

> **⚠️ PLACEHOLDER — NOT THE ORIGINAL FILE.**
>
> The real `CLAUDE.md` carried this project's agent instructions. Its contents
> have not been recovered. Overwritten on restore — see
> [RESTORE.md](RESTORE.md).

## Current state of this repo

This repo is an empty scaffold awaiting a backup restore. There is no game
code here yet. Before doing any work, read [RESTORE.md](RESTORE.md) to
understand what is and isn't present.

## Known constraints

- **pnpm only** — npm is blocked.
- `pnpm install` at the repo root, then `cd artifacts/pack-it-up` to run.
- **`PORT` and `BASE_PATH` are required** — `vite.config.ts` throws without
  them: `PORT=5173 BASE_PATH=/ pnpm dev`.
- Deploys go to an existing Vercel project via `npx vercel --prod`. **Keep the
  URL stable** — save data is in `localStorage` under `pack-it-up-save`,
  scoped to that origin.
- No OpenRouter API key belongs in this repo. It lives in the app's Settings
  UI. Do not commit one.
