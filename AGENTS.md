# Pack It Up — Agent Instructions

A cozy spatial packing puzzle about leaving home. Sixteen rooms of an
apartment, each a set of real objects to fit into cardboard boxes — while
Stretchy the cat climbs into whatever space you leave open and, if you ignore
him, makes trouble. Plus a daily box generated from the date.

> **History:** until September 2026 this repo was a personal *productivity*
> app for a real cross-country move (task deck, scheduler, AI receptionist,
> multi-agent workflow). The move happened; the app was rebuilt from scratch
> as an actual game. The old code, its process docs (`docs/ai-team/`,
> `artifacts/agent_ledger.json`, `scripts/update-agent-ledger.js`) and its
> design notes (`docs/design/`, `docs/move-spine/`, `docs/sessions/`) are an
> archive. **None of their rules apply to the current game.**

## Running it

pnpm only — npm is blocked by a preinstall guard.

```bash
pnpm install
cd artifacts/pack-it-up
PORT=5173 BASE_PATH=/ pnpm dev      # PORT and BASE_PATH are required locally
pnpm test                           # engine + every room solvable + shapes in sync
```

On Vercel, `vite.config.ts` defaults `PORT`/`BASE_PATH` itself — don't set them
there. `vercel.json` at the repo root drives the build; the project's Root
Directory must be the repo root.

## Layout

```
artifacts/pack-it-up/
  src/main.tsx            mounts the game
  src/game/
    App.jsx               screens: title, rooms, play, daily (HUD, cards, toasts), ending hand-off
    Ending.jsx            moving day
    play.js               one room: layout, input, rule feedback, hints, finish sequence
    engine.js             pure rules + solver (shared with tools/ and tests/)
    cat.js                Stretchy: animation table, wander/nap/mood/mischief AI, sheet smoothing
    planner.js            the human-like simulated player (difficulty metric, daily room)
    daily.js              the daily box generator
    draw.js               procedural art: rooms, cardboard boxes, badges, weight meter
    audio.js              Web Audio sfx (sampled + synthesized), streamed music, TRACKS
    assets.js             image loading
    save.js               progress in localStorage (key pack-it-up/v2)
    data/items.js         THE CATALOG — every item's sprite, size, weight, flags, memory
    data/shapes.js        GENERATED from items.js — never edit by hand
    data/levels.js        the 16 rooms
    data/build.js         level → engine inputs (applies which rules are on)
  src/assets/             Cat-Sheet.png, splash.png, items/…/normalized/*.png (218 sprites)
  public/assets/audio/    music (loudness-normalized, see below) + sfx
  tools/                  build-shapes, check-levels, difficulty, PNG decoder
  tests/game.test.mjs
  asset-sources/          unimported source art, reference only
```

## How the game works

- **Grid.** 1 cell ≈ 10 cm. An item's grid shape is derived from its sprite's
  alpha silhouette at a hand-assigned `size` (cells along its longer side) —
  see `tools/derive.mjs`. Thin diagonal sprites that collapse get a hand-drawn
  `shape` override in `items.js`. **Overrides must match the art's aspect
  ratio**, or the sprite renders tiny inside its footprint.
- **Proportions are a design rule.** Sizes are honest relative to each other
  and to Stretchy: his nap takes a 3×2 space — far bigger than his bowls, a bit
  smaller than his 3×3 bag of kibble. Check a new item against those anchors.
- **Rules** (turned on per room in `levels.js`): fit (hard), support (hard: in
  a `layers: 2` box, a top-layer item needs something under every cell, all at
  the same height), `weight` (box capacity, both layers count), `fragile`
  (fragile can't share an edge with weight-3 items, and nothing weight-3 may
  rest on top of fragile). Weight and fragile are *soft* in play — the player
  may break them, sees why, and can't finish until they fix it. The solver
  treats all rules as hard.
- **Keep-or-let-go rooms** (`keep: { target, best }`): more than fits. Every
  item is optional and worth hearts (`love` in the level, else the catalog's
  `love`, else 3 with a memory / 1 without). Reach `target` to seal; `best`
  (the best possible haul, from `bestHaul`) earns Pro. Tests fail if `best`
  goes stale — `node tools/check-levels.mjs` prints the right value.
- **Stretchy** naps in any free 3×2 space (blocking it) on `cat: "boxes"` /
  `"chaos"` rooms; tap to shoo. He only walks on open floor, never across an
  open box. He's drawn at floor-item scale near the wall and box scale near the
  boxes. The sheet is compacted to the rows in use and smoothed with 2× Scale2x
  at load.
- **Stretchy's mood** (`mood: true` rooms): drains over ~42 s (30 s in
  `chaos`), refills a little while he naps and a lot when petted. Low, he
  begs (row 48) with a "!" bubble. Empty, he acts out: pounces at the item
  you're holding (it drops), hops into a box and swats something back onto
  the floor (row 42), or gets the zoomies. Tapping him mid-mischief stops it.
- **Par / Pro.** `parBoxes` = fewest boxes that can hold the room. When a room
  offers a spare box, packing into par boxes earns Pro.
- **Campaign shape.** Each room introduces exactly one new idea (its `teach`,
  which drives the intro card): drag, rotate, several boxes, spare box, cat,
  no wiggle room, weight, two layers, mood, fragile, stacked weight, crush,
  keep, awkward giants, keepsakes (keep with every rule), finale.
- **Daily box** (`daily.js`): seeded by the local date; candidates must be
  solvable and land at 25–75% for the planner. Opens after `cookware`.
- **Music.** One track per room (`music` in `levels.js`, keys in
  `audio.js` `TRACKS`). Every file is two-pass loudness-normalized to −14 LUFS
  and encoded at 128 kbps MP3 — do the same to any track you add, e.g.
  `ffmpeg -i in.mp3 -af loudnorm=I=-14:TP=-1.5:LRA=11:<measured values>:linear=true -b:a 128k out.mp3`.
- **Hints** run the solver from the player's current state (fewest boxes
  first). If the state is a dead end, they find the item that's in the way.

## Changing content

After editing `items.js`:

```bash
node tools/build-shapes.mjs --show   # regenerate shapes.js and eyeball them
```

After editing items or rooms:

```bash
node tools/check-levels.mjs          # every room solvable; par; a sample solution
node tools/difficulty.mjs            # simulated-player finish rate — the real difficulty signal
pnpm test
```

Difficulty comes from `planner.js`, a simulated player that packs like a
person (awkward pieces first, hugging walls, avoiding dead pockets; in keep
rooms, a wish list by hearts-per-cell packed biggest-first). It's calibrated
to a human playtest: rooms that felt easy scored 85–100%, the finale that
felt hard scored 30%. Targets: early rooms ~90%+, middle 55–80%, late
30–55%, finale ≤30%; Pro goals 20–60%. The curve is a sawtooth — the room
right after a new mechanic is allowed to be gentler.

## Conventions

- Plain JS + React for screens; the play field is a single canvas. No UI
  libraries, no Tailwind.
- Every timer and animation runs off the `Play` frame loop — nothing leaks
  across rooms.
- `?debug` exposes `window.__play` for the headless-browser test driver.
- Art stays pixel: backgrounds paint at 1/3 resolution and upscale unsmoothed.
