# AGENTS.md

> **⚠️ PLACEHOLDER — NOT THE ORIGINAL FILE.**
>
> The real `AGENTS.md` held the project's architecture notes and hard rules.
> That content has not been recovered. This stub exists only to mark where it
> belongs.
>
> **Do not treat this file as authoritative.** An empty rules file is not the
> same as a project with no rules. If you are an agent working in this repo
> and the restore has not happened yet, assume the original constraints still
> apply and that you cannot see them — ask before making structural changes.
>
> When the backup is restored, this file is overwritten by the real one.
> See [RESTORE.md](RESTORE.md).

## Architecture

_Not recovered._

## Hard rules

_Not recovered._ Two constraints are known from external notes and are
believed to still hold:

- **pnpm only.** npm is blocked.
- **`PORT` and `BASE_PATH` are required env vars.** `vite.config.ts` throws
  without them.
