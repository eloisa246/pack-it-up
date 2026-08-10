# How to restore the project into this repo

Read this before dumping anything in. Which path you take depends on **what
form your recovered files are in** — the two cases behave very differently in
git, and picking the wrong one causes a rejected push.

---

## First: a warning about `main`

`main` on GitHub is still **completely empty** — zero commits. That is
deliberate, and worth preserving.

This scaffold lives on the branch `claude/restore-backup-github-1gq8v7`, *not*
on `main`. The reason: if you ever recover the original repository with its
62-commit history, you can still run

```bash
git push -u origin main
```

and it will succeed cleanly. Had the scaffold been committed to `main`, that
push would be rejected for unrelated histories and you would need
`--force` to fix it.

**So: do not merge this scaffold into `main` until you know you won't be
restoring the original git history.**

---

## Case A — you recovered the original git repository

This is the good case: a folder that contains its own `.git` directory, with
the 62 commits and `fd614e5` as the oldest.

Ignore this scaffold entirely. From that folder:

```bash
git remote -v                    # confirm origin → eloisa246/pack-it-up
git push -u origin main
```

Before pushing, check for oversized files — GitHub rejects any single file
over 100 MB and one bad file kills the entire push:

```bash
find . -type f -size +100M -not -path './.git/*'
```

If that prints nothing, you're clear. If it prints something, stop and ask —
it needs Git LFS or removal from history.

Expect the shallow-history warning, and expect `git fetch --unshallow` to
fail. Both are known and fine.

---

## Case B — you recovered loose files, with no git history

Files from a Vercel source download, an old export, a second machine —
anything without a usable `.git`.

1. Clone this branch:

   ```bash
   git clone -b claude/restore-backup-github-1gq8v7 \
     https://github.com/eloisa246/pack-it-up.git
   cd pack-it-up
   ```

2. Drop the files in.

   - If you have the **full project tree**, copy it over the repo root and
     let it overwrite the stub `.md` files. That is expected and correct.
   - If you have **loose or uncertain files**, put them in `_incoming/`
     first. Nothing in there is wired into the build, so it is safe to
     stage things you haven't sorted yet.

3. Sanity-check before committing:

   ```bash
   find . -type f -size +100M -not -path './.git/*'   # must print nothing
   git status
   ```

4. Commit and push:

   ```bash
   git add -A
   git commit -m "Restore project files"
   git push -u origin claude/restore-backup-github-1gq8v7
   ```

Once you're confident the restore is complete and you are *not* going to
recover the original history, promote it to `main`.

---

## What should be here when the restore is complete

From the description of the backup:

- ~1,100 files
- Game code and HTML-canvas rendering
- Pixel art, audio, and raw art sources
- All docs and plans
- Tests
- A save-data export
- Root orientation files: `AGENTS.md`, `FINISH_PLAN.md`, `CLAUDE.md`,
  `HANDOFF.md`, `DEVLOG.md`

Known gaps that are **expected, not errors**:

- History is shallow — 62 commits, oldest `fd614e5`. Older commits existed
  only on the suspended account. Every *file* is current and complete; only
  old history is missing.
- No OpenRouter API key in the repo. It lives in the app's Settings UI.

---

## A note on the backup archive

`.gitignore` deliberately excludes `part-*` and `project.tar.gz`. If you
reassemble the backup inside this folder, the archive itself will not be
committed — only its extracted contents should be. A 245 MB tarball would
blow past GitHub's 100 MB per-file limit and break the push.

To reassemble, from the folder holding the parts:

```bash
cat part-* > project.tar.gz
md5sum project.tar.gz        # expect 70d58eb263e4c93a0ddfb1f75114a4ec
tar -xzf project.tar.gz
cd moving-time
```

On macOS use `md5 project.tar.gz` instead.

---

## Recovery leads, if you're still looking for the files

- **Vercel** — the strongest lead. A live deployment means something survived
  outside any lost container. Check the deployment's **Source** tab at
  <https://vercel.com/dashboard>; even a build-only artifact may carry source
  maps.
- **The suspended GitHub account** (`9dpzmbpyym-crypto`) — suspension is not
  deletion. Appeal at <https://support.github.com/contact>. If reinstated,
  the original repo returns with full history.
- **Browser `localStorage`** — not code, but if you ever loaded the live app,
  your save may still sit under `pack-it-up-save` at that origin. Export it
  via Settings → "Copy canonical mobile save" before anything else changes.
