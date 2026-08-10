# Pack It Up

A React + HTML-canvas pixel-art moving/productivity game.

---

## ⚠️ This repo is a scaffold, not the project

The actual project files are **not here yet**. This is an empty structure
created to give the restored files a place to land.

**If you are here to restore the backup, read [RESTORE.md](RESTORE.md) first.**

Everything in this repo right now was generated as a placeholder. No game
code, art, audio, or real documentation has been recovered. The orientation
files at the root (`AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `DEVLOG.md`,
`FINISH_PLAN.md`) are **empty stubs** — they carry none of the original
content and must not be treated as authoritative.

## Layout

```
.
├── RESTORE.md            ← start here
├── AGENTS.md             stub — architecture + hard rules
├── CLAUDE.md             stub
├── HANDOFF.md            stub
├── DEVLOG.md             stub
├── FINISH_PLAN.md        stub — the task queue
├── _incoming/            drop zone for recovered files
├── artifacts/
│   └── pack-it-up/       the app itself goes here
├── docs/
└── plans/
```

This layout is reconstructed from notes, not from the original repo. Treat
directory names below the root as a best guess — if the recovered project
disagrees, the recovered project wins.

## Running it (once restored)

pnpm only — npm is blocked.

```bash
pnpm install
cd artifacts/pack-it-up
PORT=5173 BASE_PATH=/ pnpm dev
```

`PORT` and `BASE_PATH` are **required**; `vite.config.ts` throws without them.

## Deploying

```bash
npx vercel --prod
```

Deploys to the existing Vercel project and keeps the same URL. Keeping the
URL matters: save data lives in browser `localStorage` under the key
`pack-it-up-save`, scoped to that exact origin. A different URL means the app
looks brand new. If the URL must change, export first via
Settings → "Copy canonical mobile save", then use
Settings → "Import / restore save..." at the new address.
