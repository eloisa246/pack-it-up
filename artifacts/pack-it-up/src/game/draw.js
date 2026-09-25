// Procedural art: rooms, cardboard boxes, badges. Backgrounds are painted at
// low resolution and scaled up with smoothing off, so they share the chunky
// pixel look of the item sprites.

export const FONT_UI = "'Pixelify Sans', ui-rounded, system-ui, sans-serif";
export const FONT_MARKER = "'Permanent Marker', 'Marker Felt', 'Arial Black', sans-serif";

export const ROOMS = {
  bathroom: { wall: "#bcd6cc", wall2: "#abcabe", trim: "#f3efe4", floorA: "#e6e1d5", floorB: "#d3cdbf", floor: "tile", accent: "#6f9b8c", light: "#fffbe8" },
  kitchen:  { wall: "#eddcb8", wall2: "#e2cea4", trim: "#fff7e3", floorA: "#d8cdbd", floorB: "#9e8f7c", floor: "checker", accent: "#c0563f", light: "#fff4d6" },
  bedroom:  { wall: "#e5c8bf", wall2: "#d9b4a8", trim: "#f6ece5", floorA: "#b98b5f", floorB: "#a67b51", floor: "planks", accent: "#8c4b54", light: "#ffe9d2", rug: "#c98f7a" },
  living:   { wall: "#c7d2b2", wall2: "#b5c19c", trim: "#f0eee0", floorA: "#a97c53", floorB: "#936946", floor: "planks", accent: "#5b7949", light: "#fbf3d5", rug: "#8a9a6e" },
  office:   { wall: "#b8c2d4", wall2: "#a4b0c5", trim: "#eceff4", floorA: "#9d7651", floorB: "#8a6646", floor: "planks", accent: "#40598a", light: "#eef3ff" },
  dining:   { wall: "#e0b898", wall2: "#d4a585", trim: "#f7ebdf", floorA: "#a67751", floorB: "#8f6444", floor: "planks", accent: "#a0482f", light: "#fff0da", rug: "#b86b50" },
};

// deterministic noise so rooms don't flicker between redraws
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Paint a room into an offscreen canvas.
 *   wallY    where the wall meets the floor (css px)
 *   rugRect  optional {x,y,w,h} in css px to lay a rug under the boxes
 */
export function paintRoom(roomKey, W, H, wallY, rugRect, P = 3, hudH = 0) {
  const R = ROOMS[roomKey] || ROOMS.bedroom;
  const w = Math.ceil(W / P), h = Math.ceil(H / P), wy = Math.round(wallY / P);
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d");
  const rand = rng(roomKey.length * 977 + w * 31 + h);

  // wall
  c.fillStyle = R.wall;
  c.fillRect(0, 0, w, wy);
  if (roomKey === "bathroom") {
    // tiled wall
    c.fillStyle = R.wall2;
    for (let y = 0; y < wy; y += 7) c.fillRect(0, y, w, 1);
    for (let y = 0; y < wy; y += 7) for (let x = (y / 7) % 2 ? 0 : 4; x < w; x += 8) c.fillRect(x, y, 1, 7);
  } else if (roomKey === "kitchen") {
    // subway-tile backsplash band above the baseboard
    const top = Math.max(0, wy - 22);
    c.fillStyle = "#f6efe0";
    c.fillRect(0, top, w, wy - top);
    c.fillStyle = "#ddd0b6";
    for (let y = top; y < wy; y += 4) c.fillRect(0, y, w, 1);
    for (let y = top; y < wy; y += 4) for (let x = ((y - top) / 4) % 2 ? 0 : 5; x < w; x += 10) c.fillRect(x, y, 1, 4);
  } else {
    // soft wallpaper stripes
    c.fillStyle = R.wall2;
    for (let x = 0; x < w; x += 10) c.fillRect(x, 0, 2, wy);
  }

  // the window: morning light
  const hy = Math.round(hudH / P);
  const winW = Math.min(46, Math.round(w * 0.3)), winH = Math.min(Math.round((wy - hy) * 0.7), 44);
  const winX = Math.round(w * 0.64), winY = Math.max(3, hy + Math.round((wy - hy) * 0.1));
  if (winH > 10) {
    const g = c.createLinearGradient(0, winY, 0, winY + winH);
    g.addColorStop(0, "#9fc9e6");
    g.addColorStop(1, "#f5dcb8");
    c.fillStyle = R.trim;
    c.fillRect(winX - 2, winY - 2, winW + 4, winH + 5);
    c.fillStyle = g;
    c.fillRect(winX, winY, winW, winH);
    // far skyline, soft
    c.fillStyle = "rgba(120,140,170,0.35)";
    for (let x = 0; x < winW; x += 5) {
      const bh = 4 + ((rand() * 10) | 0);
      c.fillRect(winX + x, winY + winH - bh, 4, bh);
    }
    c.fillStyle = R.trim;
    c.fillRect(winX + (winW >> 1), winY, 1, winH);
    c.fillRect(winX, winY + (winH >> 1), winW, 1);
    c.fillStyle = "rgba(0,0,0,0.12)";
    c.fillRect(winX - 3, winY + winH + 3, winW + 6, 1);
  }

  // pale rectangles where frames used to hang — the room is already leaving
  const ghosts = [
    [0.1, 0.22, 16, 12],
    [0.28, 0.14, 11, 15],
    [0.43, 0.3, 13, 9],
  ];
  for (const [fx, fy, gw, gh] of ghosts) {
    const gx = Math.round(w * fx), gy = hy + Math.round((wy - hy) * fy);
    if (gy + gh > wy - 6 || gx + gw > winX - 4) continue;
    c.fillStyle = "rgba(255,255,255,0.22)";
    c.fillRect(gx, gy, gw, gh);
    c.fillStyle = "rgba(60,40,30,0.55)";
    c.fillRect(gx + (gw >> 1), gy - 2, 1, 1);
  }

  // baseboard
  c.fillStyle = R.trim;
  c.fillRect(0, wy - 3, w, 3);
  c.fillStyle = "rgba(0,0,0,0.12)";
  c.fillRect(0, wy, w, 1);

  // floor
  const fy = wy + 1;
  if (R.floor === "planks") {
    for (let y = fy, row = 0; y < h; y += 6, row++) {
      let x = -((row * 17) % 23);
      while (x < w) {
        const len = 20 + ((rand() * 18) | 0);
        c.fillStyle = rand() < 0.5 ? R.floorA : R.floorB;
        c.fillRect(x, y, len, 6);
        c.fillStyle = "rgba(0,0,0,0.12)";
        c.fillRect(x, y, 1, 6);
        if (rand() < 0.3) {
          c.fillStyle = "rgba(0,0,0,0.07)";
          c.fillRect(x + 4 + ((rand() * 10) | 0), y + 2 + ((rand() * 2) | 0), 3, 1);
        }
        x += len;
      }
      c.fillStyle = "rgba(0,0,0,0.16)";
      c.fillRect(0, y + 5, w, 1);
    }
  } else if (R.floor === "checker") {
    const s = 9;
    for (let y = fy, j = 0; y < h; y += s, j++)
      for (let x = 0, i = 0; x < w; x += s, i++) {
        c.fillStyle = (i + j) % 2 ? R.floorA : R.floorB;
        c.fillRect(x, y, s, s);
      }
  } else {
    const s = 6;
    c.fillStyle = R.floorA;
    c.fillRect(0, fy, w, h - fy);
    c.fillStyle = R.floorB;
    for (let y = fy; y < h; y += s) c.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += s) c.fillRect(x, fy, 1, h - fy);
  }

  // sunlight falling through the window onto the floor
  if (winH > 10) {
    c.fillStyle = "rgba(255,244,210,0.16)";
    const lx = winX - 6, lw = winW + 4;
    c.beginPath();
    c.moveTo(lx + 4, fy);
    c.lineTo(lx + lw + 4, fy);
    c.lineTo(lx + lw - 30, h);
    c.lineTo(lx - 38, h);
    c.closePath();
    c.fill();
  }

  // rug under the boxes
  if (rugRect && R.rug) {
    const rx = Math.round(rugRect.x / P), ry = Math.round(rugRect.y / P);
    const rw = Math.round(rugRect.w / P), rh = Math.round(rugRect.h / P);
    c.fillStyle = "rgba(0,0,0,0.1)";
    c.fillRect(rx + 1, ry + 2, rw, rh);
    c.fillStyle = R.rug;
    c.fillRect(rx, ry, rw, rh);
    c.fillStyle = "rgba(255,255,255,0.18)";
    c.fillRect(rx + 2, ry + 2, rw - 4, 1);
    c.fillRect(rx + 2, ry + rh - 3, rw - 4, 1);
    c.fillRect(rx + 2, ry + 2, 1, rh - 4);
    c.fillRect(rx + rw - 3, ry + 2, 1, rh - 4);
    c.fillStyle = "rgba(0,0,0,0.08)";
    for (let x = rx + 5; x < rx + rw - 5; x += 4) c.fillRect(x, ry + 5, 2, rh - 10);
  }

  // gentle vignette
  const vg = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.3, w / 2, h * 0.55, Math.max(w, h) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(30,15,5,0.28)");
  c.fillStyle = vg;
  c.fillRect(0, 0, w, h);
  return cv;
}

// ── cardboard ────────────────────────────────────────────────────────────────

const CB = {
  flap: "#d9a867",
  flapDark: "#c89254",
  fold: "#a8723f",
  rim: "#8f5c30",
  inner: "#b3804b",
  innerDark: "#9f6d3d",
  grid: "rgba(70,38,12,0.20)",
  dot: "rgba(70,38,12,0.32)",
  hi: "rgba(255,236,200,0.35)",
};

/** Flap depth for a given cell size. Bottom flap is deeper — it holds the label. */
export function flapSize(C) {
  return { side: Math.round(C * 0.36), top: Math.round(C * 0.36), bottom: Math.round(C * 0.56) };
}

/**
 * Open box seen from above. b = { x, y, w, h (cells), label }.
 * seal: 0..1 flaps closing, tape: 0..1 tape drawn, glow: highlight strength.
 */
export function drawBoxBase(ctx, b, C, { warn = 0, glow = 0, shake = 0 } = {}) {
  const W = b.w * C, H = b.h * C;
  const f = flapSize(C);
  const x = Math.round(b.x + shake), y = Math.round(b.y);

  // shadow on the floor
  ctx.fillStyle = "rgba(40,20,5,0.28)";
  roundRect(ctx, x - f.side + 5, y - f.top + 9, W + f.side * 2, H + f.top + f.bottom, 6);
  ctx.fill();

  // outer flaps, splayed open
  const k = 0.55;
  poly(ctx, CB.flap, [[x - f.side * k, y - f.top], [x + W + f.side * k, y - f.top], [x + W, y], [x, y]]);
  poly(ctx, CB.flap, [[x, y + H], [x + W, y + H], [x + W + f.side * k, y + H + f.bottom], [x - f.side * k, y + H + f.bottom]]);
  poly(ctx, CB.flapDark, [[x - f.side, y - f.top * k], [x, y], [x, y + H], [x - f.side, y + H + f.top * k]]);
  poly(ctx, CB.flapDark, [[x + W, y], [x + W + f.side, y - f.top * k], [x + W + f.side, y + H + f.top * k], [x + W, y + H]]);
  // fold creases
  ctx.fillStyle = CB.fold;
  ctx.fillRect(x - 1, y - 1, W + 2, 2);
  ctx.fillRect(x - 1, y + H - 1, W + 2, 2);

  // rim + inside
  ctx.fillStyle = CB.rim;
  ctx.fillRect(x - 3, y - 3, W + 6, H + 6);
  const g = ctx.createLinearGradient(0, y, 0, y + H);
  g.addColorStop(0, CB.innerDark);
  g.addColorStop(0.18, CB.inner);
  g.addColorStop(1, CB.inner);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, W, H);
  ctx.fillStyle = "rgba(60,30,8,0.22)";
  ctx.fillRect(x, y, W, Math.max(2, C * 0.08));
  ctx.fillRect(x, y, Math.max(2, C * 0.06), H);

  // grid
  ctx.fillStyle = CB.grid;
  for (let i = 1; i < b.w; i++) ctx.fillRect(x + i * C, y + 2, 1, H - 4);
  for (let j = 1; j < b.h; j++) ctx.fillRect(x + 2, y + j * C, W - 4, 1);
  ctx.fillStyle = CB.dot;
  const d = Math.max(2, Math.round(C / 18));
  for (let i = 1; i < b.w; i++) for (let j = 1; j < b.h; j++) ctx.fillRect(x + i * C - (d >> 1), y + j * C - (d >> 1), d, d);

  // label on the front flap
  if (b.label) {
    const fs = Math.max(9, Math.round(C * 0.27));
    ctx.font = `${fs}px ${FONT_MARKER}`;
    const tw = ctx.measureText(b.label).width;
    const lw = tw + fs * 0.9, lh = fs * 1.25;
    const lx = x + W / 2 - lw / 2, ly = y + H + f.bottom * 0.5 - lh / 2 + 1;
    ctx.save();
    ctx.translate(lx + lw / 2, ly + lh / 2);
    ctx.rotate(-0.025);
    ctx.fillStyle = "rgba(255,252,240,0.92)";
    ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
    ctx.fillStyle = "#2b2622";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(b.label, 0, 1);
    ctx.restore();
  }

  if (warn > 0) {
    ctx.strokeStyle = `rgba(214,58,42,${0.5 + 0.4 * warn})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, y - 2, W + 4, H + 4);
  }
  if (glow > 0) {
    ctx.strokeStyle = `rgba(255,240,190,${0.55 * glow})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(x - 2, y - 2, W + 4, H + 4);
  }
}

/** Closing flaps, tape, stamp — drawn over the contents. */
export function drawBoxSeal(ctx, b, C, { seal = 0, tape = 0, stamp = 0, stampText = "PACKED", spare = false } = {}) {
  if (seal <= 0) return;
  const W = b.w * C, H = b.h * C;
  const x = Math.round(b.x), y = Math.round(b.y);
  const e = easeOut(seal);
  const half = (W / 2) * e;
  // two long flaps swinging in from the sides
  for (const side of [0, 1]) {
    const fx = side ? x + W - half : x;
    const g = ctx.createLinearGradient(fx, 0, fx + half, 0);
    g.addColorStop(side ? 0 : 1, "#caa06a");
    g.addColorStop(side ? 1 : 0, "#dcb078");
    ctx.fillStyle = g;
    ctx.fillRect(fx - (side ? 0 : 2), y - 2, half + 2, H + 4);
    ctx.fillStyle = "rgba(90,50,20,0.25)";
    ctx.fillRect(side ? fx : fx + half - 2, y - 2, 2, H + 4);
  }
  if (tape > 0) {
    const tw = Math.max(10, C * 0.42);
    const th = (H + 12) * easeOut(tape);
    ctx.fillStyle = "rgba(205,178,128,0.92)";
    ctx.fillRect(x + W / 2 - tw / 2, y - 6, tw, th);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + W / 2 - tw / 2 + 3, y - 6, 3, th);
  }
  if (stamp > 0) {
    const s = 1 + (1 - easeOut(Math.min(1, stamp))) * 1.4;
    const fs = Math.max(11, Math.round(C * (spare ? 0.34 : 0.4)));
    ctx.save();
    ctx.translate(x + W / 2, y + H / 2);
    ctx.rotate(-0.16);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, stamp * 1.6) * 0.9;
    ctx.font = `700 ${fs}px ${FONT_UI}`;
    const tw = ctx.measureText(stampText).width;
    ctx.strokeStyle = spare ? "#6b7f95" : "#b3362b";
    ctx.fillStyle = spare ? "#6b7f95" : "#b3362b";
    ctx.lineWidth = Math.max(2, fs * 0.12);
    ctx.strokeRect(-tw / 2 - fs * 0.35, -fs * 0.72, tw + fs * 0.7, fs * 1.44);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(stampText, 0, 1);
    ctx.restore();
  }
}

/** Segmented weight meter under a box. */
export function drawWeight(ctx, b, C, weight, max, pulse = 0, preview = 0) {
  const f = flapSize(C);
  const W = b.w * C;
  const y = b.y + b.h * C + f.bottom + Math.max(6, C * 0.14);
  const h = Math.max(7, Math.round(C * 0.2));
  const segs = max;
  const gap = 2;
  const iconW = h * 1.3;
  const barW = Math.min(W, Math.max(segs * 8, W * 0.8));
  const x0 = b.x + (W - barW) / 2 + iconW / 2;
  const sw = (barW - iconW - gap * (segs - 1)) / segs;
  const over = weight > max;
  drawKettlebell(ctx, x0 - iconW, y - 1, h + 2, over ? "#c0392b" : "#3a2a1f");
  const after = weight + preview;
  for (let i = 0; i < segs; i++) {
    const filled = i < weight;
    const ghost = !filled && i < after;
    ctx.fillStyle = filled
      ? over ? "#d64535" : weight >= max ? "#e0a13a" : "#6f9b58"
      : ghost
        ? after > max ? `rgba(214,69,53,${0.55 + 0.3 * Math.sin(pulse * 10)})` : `rgba(160,215,130,${0.55 + 0.3 * Math.sin(pulse * 10)})`
        : "rgba(40,24,12,0.35)";
    ctx.fillRect(Math.round(x0 + i * (sw + gap)), y, Math.max(2, Math.floor(sw)), h);
  }
  if (preview && after > max && !over) {
    const fs = Math.max(10, Math.round(C * 0.24));
    ctx.font = `700 ${fs}px ${FONT_UI}`;
    ctx.fillStyle = "rgba(214,58,42,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("TOO HEAVY", b.x + W / 2, y + h + 3);
  }
  if (over) {
    const fs = Math.max(10, Math.round(C * 0.26));
    ctx.font = `700 ${fs}px ${FONT_UI}`;
    ctx.fillStyle = `rgba(214,58,42,${0.75 + 0.25 * Math.sin(pulse * 8)})`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("TOO HEAVY", b.x + W / 2, y + h + 3);
  }
}

const KETTLEBELL = [
  "..####..",
  ".#....#.",
  ".#....#.",
  "..####..",
  ".######.",
  "########",
  "########",
  ".######.",
];
export function drawKettlebell(ctx, x, y, s, color = "#2e2622") {
  const u = s / 8;
  ctx.fillStyle = color;
  KETTLEBELL.forEach((row, j) => {
    for (let i = 0; i < 8; i++) if (row[i] === "#") ctx.fillRect(x + i * u, y + j * u, u + 0.3, u + 0.3);
  });
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(x + 2 * u, y + 5 * u, u, u);
}

export function drawGlass(ctx, x, y, s, color = "#c0392b") {
  const u = s / 8;
  ctx.fillStyle = color;
  ctx.fillRect(x + u, y, 6 * u, u);
  ctx.fillRect(x + u, y + u, u, 2 * u);
  ctx.fillRect(x + 6 * u, y + u, u, 2 * u);
  ctx.fillRect(x + 2 * u, y + 3 * u, 4 * u, u);
  ctx.fillRect(x + 3.5 * u, y + 4 * u, u, 3 * u);
  ctx.fillRect(x + 2 * u, y + 7 * u, 4 * u, u);
  ctx.fillStyle = "#fff";
  ctx.fillRect(x + 2 * u, y + u, 4 * u, 2 * u);
  ctx.fillStyle = color;
  ctx.fillRect(x + 3 * u, y + u, u, u);
  ctx.fillRect(x + 4 * u, y + 2 * u, u, u);
}

/** Round badge in an item's corner. */
export function drawBadge(ctx, kind, x, y, s) {
  ctx.fillStyle = kind === "heavy" ? "#f2e6d0" : "#fff3ee";
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = kind === "heavy" ? "#3a2a1f" : "#c0392b";
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.stroke();
  const p = s * 0.18;
  if (kind === "heavy") drawKettlebell(ctx, x + p, y + p, s - 2 * p);
  else drawGlass(ctx, x + p, y + p, s - 2 * p);
}

/** Jagged crack across a shared edge between a fragile and a heavy item. */
export function drawCrack(ctx, x0, y0, x1, y1, t) {
  ctx.save();
  ctx.strokeStyle = `rgba(214,48,36,${0.75 + 0.25 * Math.sin(t * 10)})`;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const px = x0 + (x1 - x0) * k, py = y0 + (y1 - y0) * k;
    const off = (i % 2 ? 1 : -1) * 4 * (i > 0 && i < n ? 1 : 0);
    const nx = y1 - y0 ? off : 0, ny = x1 - x0 ? off : 0;
    if (i === 0) ctx.moveTo(px + nx, py + ny);
    else ctx.lineTo(px + nx, py + ny);
  }
  ctx.stroke();
  ctx.restore();
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function poly(ctx, color, pts) {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.fill();
}

export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeOutBack = (t) => {
  t = Math.min(1, Math.max(0, t));
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
