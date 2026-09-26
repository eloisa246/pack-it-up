# Pack It Up

A cozy packing puzzle about leaving home.

Sixteen corners of an apartment — the medicine cabinet, the sewing tin, the
bar cart, the guitar — and a stack of empty boxes. Every object's shape comes from
its own pixel-art silhouette, so a guitar packs like a guitar and a skillet's
handle gets in the way. Heavy things strain the box. Glass can't touch cast
iron. Deep boxes stack two layers. Some rooms hold more than you can take,
so you choose what matters. And Stretchy the cat will climb into any space
you leave open — and if you ignore him, he'll knock things back out.

- 16 rooms, each introducing one new idea, each verified solvable by a built-in solver
- A **daily box**, generated from the date, the same for everyone
- Optional **Pro** goals: a box to spare, or the best possible haul
- Hints that know where things go — or what's in the way
- Plays on phones (touch) and desktop (mouse, `R` / right-click / wheel to turn)

```bash
pnpm install
cd artifacts/pack-it-up
PORT=5173 BASE_PATH=/ pnpm dev
```

See `AGENTS.md` for how it's built and how to add rooms.

*For Stretchy, who hated every box he wasn't sitting in.*
