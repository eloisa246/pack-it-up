# Pack It Up — Plan

**State (2026-09-26):** a standalone packing puzzle. 16 rooms (layers, keep
rooms, Stretchy's mood), a daily box, a soundtrack per room. All
solver-verified, playable start to finish on phone and desktop. The plan-of-record for the old app lives in git
history (before commit "Rebuild Pack It Up as a packing puzzle").

## Next

- [x] **A human playtest** (2026-09-25): "mostly easy, the last one
      challenging, simple but sweet" → planner metric, new mechanics, retune.
- [ ] **Playtest round two.** Does the new curve feel right? Is Stretchy's
      mood fun pressure or a nag (drain rate lives in `MODES` in `cat.js`)?
      Is the bookshelf (room 7, ~50%) too sharp a spike right after the tutorials?
- [ ] **Real devices.** iOS Safari touch + audio unlock, Android Chrome, a
      small phone (≤ 360px wide). Only headless Chromium has been tested.
- [ ] **Listen to it.** Mix levels for the synthesized effects (thud, tape,
      tink, strain) were set by reading, not by ear.
- [ ] **Colour-independent ghost.** Valid/invalid/warning placement is
      green/red/amber; add a pattern or icon so it doesn't rely on colour.

## Ideas

- **More rooms** from unused sprites: the garden (planters, bench, folding
  chair); a suitcase-shaped box for the carry-on.
- **Toys for Stretchy:** drag one of his toys to him instead of petting.
- **Bubble wrap:** wrap a fragile item to make it safe, at the cost of a
  one-cell border.
- **Photo mode** on the result card — the sealed boxes, the cat on top.
