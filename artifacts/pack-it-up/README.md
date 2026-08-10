# artifacts/pack-it-up — the app

**The Vite + React application belongs in this directory.** It is empty.

This path comes from the run instructions for the original project, which
call for installing at the repo root and then running from here:

```bash
pnpm install                          # at the repo root
cd artifacts/pack-it-up
PORT=5173 BASE_PATH=/ pnpm dev
```

`PORT` and `BASE_PATH` are **required**. `vite.config.ts` throws without them,
so a bare `pnpm dev` will fail — that's by design, not a bug to fix.

## What should land here

At minimum `package.json`, `vite.config.ts`, `index.html`, and `src/`, plus
the game code, pixel art, audio, and raw art sources.

No scaffold files (`package.json`, `vite.config.ts`, etc.) were generated
here on purpose. Inventing them would mean guessing at real config that the
restore will supply, and a wrong guess is worse than an empty directory —
it lingers, conflicts, and quietly breaks the build.

The root-level install plus a nested app directory implies a pnpm workspace,
which would mean a `pnpm-workspace.yaml` at the repo root. That file is also
absent for the same reason: it should arrive with the restore.

See [../../RESTORE.md](../../RESTORE.md).
