# Pack It Up — Plan

**State (2026-09-25):** rebuilt from the retired productivity app into a
standalone packing puzzle. 13 rooms, all solver-verified, playable start to
finish on phone and desktop. The plan-of-record for the old app lives in git
history (before commit "Rebuild Pack It Up as a packing puzzle").

## Next

- [ ] **A human playtest.** Everything so far was verified by a solver, a
      naive-player simulation, and a headless browser driving real input — none
      of which has taste. Watch someone play rooms 1–7 cold. The Closet (room 5)
      is the first real spike (4 solutions, naive player wins 1%); confirm it
      reads as an "aha", not a wall.
- [ ] **Real devices.** iOS Safari touch + audio unlock, Android Chrome, a
      small phone (≤ 360px wide). Only headless Chromium has been tested.
- [ ] **Listen to it.** Mix levels for the synthesized effects (thud, tape,
      tink, strain) were set by reading, not by ear.
- [ ] **Colour-independent ghost.** Valid/invalid/warning placement is
      green/red/amber; add a pattern or icon so it doesn't rely on colour.

## Ideas

- **Endless / daily room.** The pieces exist: pick items from a room theme,
  solve, keep the set if `tools/naive.mjs` puts it in a target difficulty band.
- **More rooms** from unused sprites: the garden (planters, bench, folding
  chair), the toolbox (drill, hammer, pliers), the sewing kit, the carry-on
  suitcase (a suitcase-shaped "box").
- **Bubble wrap:** wrap a fragile item to make it safe, at the cost of a
  one-cell border.
- **Photo mode** on the result card — the sealed boxes, the cat on top.
