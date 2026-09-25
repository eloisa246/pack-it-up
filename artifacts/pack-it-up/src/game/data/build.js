// Turns a level definition into engine inputs (items with shapes + boxes),
// applying which rules the level has switched on. Shared by client and tools.
import { ITEMS } from "./items.js";
import SHAPES from "./shapes.js";

export function levelItems(level) {
  const fragileOn = level.rules?.includes("fragile");
  return level.items.map((id, i) => {
    const it = ITEMS[id];
    if (!it) throw new Error(`level ${level.id}: unknown item "${id}"`);
    const s = SHAPES[id];
    return {
      key: `${id}#${i}`,
      id,
      name: it.name,
      file: it.file,
      shape: { w: s.w, h: s.h, cells: s.cells },
      bbox: s.bbox,
      weight: it.weight,
      fragile: fragileOn && !!it.fragile,
      memory: it.memory || null,
      // keep-or-let-go: everything is optional and worth some hearts
      optional: !!level.keep,
      value: level.love?.[id] ?? it.love ?? (it.memory ? 3 : 1),
    };
  });
}

export function levelBoxes(level) {
  const weightOn = level.rules?.includes("weight");
  return level.boxes.map((b) => ({ ...b, maxWeight: weightOn ? b.maxWeight : undefined }));
}
