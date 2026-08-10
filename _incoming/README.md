# _incoming — drop zone

**Put recovered files here.**

This directory is not wired into the build, referenced by any config, or
imported by any code. Nothing here affects the app. That is the point: it is
a safe place to dump files you haven't sorted yet, without breaking anything
or having to decide where they belong first.

## How to use it

Copy anything you recover straight in — a Vercel source download, a folder
from another machine, a half-remembered export, loose art files. Structure
doesn't matter at this stage. Sorting comes after.

```bash
cp -R ~/Downloads/whatever-you-found/ _incoming/
```

Then commit it so it can't be lost again:

```bash
git add -A && git commit -m "Add recovered files to _incoming"
git push -u origin claude/restore-backup-github-1gq8v7
```

Getting the files into *any* committed state beats getting them into the
*right* state. Do that first.

## Before you commit

Check for oversized files — GitHub rejects any single file over 100 MB, and
one bad file fails the whole push:

```bash
find _incoming -type f -size +100M
```

Should print nothing. Note that `part-*` and `project.tar.gz` are gitignored
repo-wide, so the raw backup archive won't be committed even if it lands
here — extract it and commit the contents instead.

## If you have the full project tree

Don't use this directory. Copy it over the repo root and let it overwrite the
stub `.md` files. See [../RESTORE.md](../RESTORE.md), Case B.

## Cleanup

Once everything is sorted into its real home, delete this directory. It is
scaffolding, not part of the project.
