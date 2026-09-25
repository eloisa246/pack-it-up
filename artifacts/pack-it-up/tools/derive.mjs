// Turn a sprite's alpha silhouette into a grid polyomino.
//
// The sprite's opaque bounding box is divided into `size` cells along its
// longer side (the item's real-world size, assigned by hand in items.js).
// A cell is solid when enough of it is covered by art. We then keep the
// largest 4-connected piece and fill enclosed holes, so every item is one
// solid, fair shape that still reads as its silhouette.
import { decodePng } from "./png.mjs";

export function spriteBBox({ width, height, alpha }, cutoff = 40) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[y * width + x] > cutoff) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function deriveShape(img, size, threshold = 0.34) {
  const bb = spriteBBox(img);
  const cellPx = Math.max(bb.w, bb.h) / size;
  const cols = Math.max(1, Math.round(bb.w / cellPx));
  const rows = Math.max(1, Math.round(bb.h / cellPx));
  const cov = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px0 = Math.floor(bb.x + (c * bb.w) / cols), px1 = Math.floor(bb.x + ((c + 1) * bb.w) / cols);
      const py0 = Math.floor(bb.y + (r * bb.h) / rows), py1 = Math.floor(bb.y + ((r + 1) * bb.h) / rows);
      let on = 0, n = 0;
      for (let y = py0; y < py1; y++)
        for (let x = px0; x < px1; x++, n++) if (img.alpha[y * img.width + x] > 40) on++;
      cov.push(n ? on / n : 0);
    }
  }
  let solid = cov.map((v) => v >= threshold);
  if (!solid.some(Boolean)) solid[cov.indexOf(Math.max(...cov))] = true;
  solid = largestComponent(solid, cols, rows);
  solid = fillHoles(solid, cols, rows);
  let cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (solid[r * cols + c]) cells.push([c, r]);
  // trim empty edge rows/columns
  const minX = Math.min(...cells.map((c) => c[0])), minY = Math.min(...cells.map((c) => c[1]));
  cells = cells.map(([x, y]) => [x - minX, y - minY]);
  const w = Math.max(...cells.map((c) => c[0])) + 1, h = Math.max(...cells.map((c) => c[1])) + 1;
  return { w, h, cells, bbox: [bb.x, bb.y, bb.w, bb.h] };
}

function largestComponent(solid, cols, rows) {
  const seen = new Array(solid.length).fill(-1);
  let best = -1, bestSize = 0, id = 0;
  for (let i = 0; i < solid.length; i++) {
    if (!solid[i] || seen[i] >= 0) continue;
    let size = 0;
    const stack = [i];
    seen[i] = id;
    while (stack.length) {
      const j = stack.pop();
      size++;
      const x = j % cols, y = (j / cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const k = ny * cols + nx;
        if (solid[k] && seen[k] < 0) { seen[k] = id; stack.push(k); }
      }
    }
    if (size > bestSize) { bestSize = size; best = id; }
    id++;
  }
  return solid.map((_, i) => seen[i] === best);
}

function fillHoles(solid, cols, rows) {
  // flood the outside through empty cells; anything empty and unreached is a hole
  const outside = new Array(solid.length).fill(false);
  const stack = [];
  for (let x = 0; x < cols; x++) stack.push([x, 0], [x, rows - 1]);
  for (let y = 0; y < rows; y++) stack.push([0, y], [cols - 1, y]);
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const k = y * cols + x;
    if (solid[k] || outside[k]) continue;
    outside[k] = true;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return solid.map((s, i) => s || !outside[i]);
}

export function shapeFromFile(path, size, threshold) {
  return deriveShape(decodePng(path), size, threshold);
}

export function ascii(shape) {
  const g = Array.from({ length: shape.h }, () => Array(shape.w).fill("·"));
  for (const [x, y] of shape.cells) g[y][x] = "█";
  return g.map((r) => r.join("")).join("\n");
}
