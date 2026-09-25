# Pack It Up — Agent Instructions

A cozy spatial packing puzzle about leaving home. Thirteen rooms of an
apartment, each a set of real objects to fit into cardboard boxes — while
Stretchy the cat climbs into whatever space you leave open.

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
    App.jsx               screens: title, rooms, play (HUD, cards, toasts), ending hand-off
    Ending.jsx            moving day
    play.js               one room: layout, input, rule feedback, hints, finish sequence
    engine.js             pure rules + solver (shared with tools/ and tests/)
    cat.js                Stretchy: animation table, wander/nap AI, sheet smoothing
    draw.js               procedural art: rooms, cardboard boxes, badges, weight meter
    audio.js              Web Audio sfx (sampled + synthesized), streamed music
    assets.js             image loading
    save.js               progress in localStorage (key pack-it-up/v2)
    data/items.js         THE CATALOG — every item's sprite, size, weight, flags, memory
    data/shapes.js        GENERATED from items.js — never edit by hand
    data/levels.js        the 13 rooms
    data/build.js         level → engine inputs (applies which rules are on)
  src/assets/             Cat-Sheet.png, splash.png, items/…/normalized/*.png (218 sprites)
  public/assets/audio/    music + sfx
  tools/                  build-shapes, check-levels, difficulty, naive player, PNG decoder
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
- **Rules** (turned on per room in `levels.js`): fit (hard), `weight` (box
  capacity), `fragile` (fragile can't share an edge with weight-3 items). Weight
  and fragile are *soft* in play — the player may break them, sees why, and
  can't finish until they fix it. The solver treats all rules as hard.
- **Stretchy** naps in any free 3×2 space (blocking it) on `cat: "boxes"` /
  `"chaos"` rooms; tap to shoo. He only walks on open floor, never across an
  open box. He's drawn at floor-item scale near the wall and box scale near the
  boxes. The sheet is compacted to the rows in use and smoothed with 2× Scale2x
  at load.
- **Par / Pro.** `parBoxes` = fewest boxes that can hold the room. When a room
  offers a spare box, packing into par boxes earns Pro.
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
node tools/difficulty.mjs            # naive-player win rate — the real difficulty signal
pnpm test
```

Difficulty targets: the naive player (biggest item first, random legal spot)
should win ~40% of a tutorial, 60–100% of an easy room, and ≤5% of a real
puzzle. Rooms alternate hard and easy; easy rooms carry an optional Pro goal
(naive Pro win ≈ 0%).

## Conventions

- Plain JS + React for screens; the play field is a single canvas. No UI
  libraries, no Tailwind.
- Every timer and animation runs off the `Play` frame loop — nothing leaks
  across rooms.
- `?debug` exposes `window.__play` for the headless-browser test driver.
- Art stays pixel: backgrounds paint at 1/3 resolution and upscale unsmoothed.
