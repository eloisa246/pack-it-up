# Pack It Up

A cozy packing puzzle about leaving home.

Thirteen corners of an apartment — the medicine cabinet, the closet, the bar
cart, the guitar — and a stack of empty boxes. Every object's shape comes from
its own pixel-art silhouette, so a guitar packs like a guitar and a skillet's
handle gets in the way. Heavy things strain the box. Glass can't touch cast
iron. And Stretchy the cat will climb into any space you leave open.

- 13 rooms, each verified solvable by a built-in solver
- Optional **Pro** goals: fit it all with a box to spare
- Hints that know where things go — or what's in the way
- Plays on phones (touch) and desktop (mouse, `R` / right-click / wheel to turn)

```bash
pnpm install
cd artifacts/pack-it-up
PORT=5173 BASE_PATH=/ pnpm dev
```

See `AGENTS.md` for how it's built and how to add rooms.

*For Stretchy, who hated every box he wasn't sitting in.*
