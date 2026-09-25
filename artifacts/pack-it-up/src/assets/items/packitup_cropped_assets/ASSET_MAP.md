# Asset map

| Path | Used by |
|------|---------|
| `normalized/*.png` | every item sprite — loaded on demand by `src/game/assets.js` |
| `manifest.json` / `manifest.csv` | source metadata (label, room, category) for all 218 sprites — reference for picking items; the game's own catalog is `src/game/data/items.js` |

Source/intermediate art (contact sheets, raw crops, mockups) lives in
`artifacts/pack-it-up/asset-sources/` and is never imported.
