// One room of the game: layout, input, rules feedback, the cat, and the
// seal-and-stamp finish. Pure canvas; React only wraps it with the HUD.
import {
  makeBoard, put, lift, fits, rotations, boxWeight, fragileConflicts, overweightBoxes,
  isSolved, solveAny, parBoxes, cellsAt, heightAt, itemsOnTop, layersOf, packedValue, valueOf, HEAVY,
} from "./engine.js";
import { levelItems, levelBoxes } from "./data/build.js";
import {
  paintRoom, drawBoxBase, drawBoxSeal, drawWeight, drawBadge, drawCrack,
  flapSize, FONT_UI, easeOut,
} from "./draw.js";
import { Cat } from "./cat.js";
import { audio } from "./audio.js";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Stretchy's nap footprint, in cells. */
const CAT_W = 3, CAT_H = 2;
const cssVar = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;

export class Play {
  constructor(canvas, level, { sprites, catSheet, onEvent, rng = Math.random }) {
    this.cv = canvas;
    this.ctx = canvas.getContext("2d");
    this.level = level;
    this.items = levelItems(level);
    this.boxes = levelBoxes(level);
    this.board = makeBoard(this.boxes, this.items);
    this.sprites = sprites;
    this.emit = onEvent || (() => {});
    this.rng = rng;
    this.weightOn = this.boxes.some((b) => b.maxWeight != null);
    this.fragileOn = !!level.rules?.includes("fragile");
    // keep-or-let-go rooms: items are optional, the room needs a value target
    this.keep = level.keep || null;
    this.par = this.keep ? this.boxes.length : parBoxes(this.boxes, this.items) ?? this.boxes.length;
    this.solution = solveAny(this.boxes, this.items, { minValue: this.keep?.target || 0 }).solutions[0] || null;

    this.vis = this.items.map((it, i) => ({
      rot: 0, x: 0, y: 0, s: 20, tx: 0, ty: 0, ts: 20, ang: 0, tAng: 0,
      squash: 0, wob: 0, where: "tray", delay: 0.15 + i * 0.05, alpha: 0,
    }));
    this.undoStack = [];
    this.particles = [];
    this.drag = null;
    this.press = null;
    this.hintFx = null;
    this.boxFx = this.boxes.map(() => ({ shake: 0, glow: 0 }));
    this.seenMemory = new Set();
    this.warned = {};
    this.t = 0;
    this.startTime = performance.now();
    this.done = false;
    this.celebration = null;
    this.moves = 0;
    this.hints = 0;
    this.tutorial = level.teach === "drag" ? "drag" : level.teach === "rotate" ? "rotate" : null;
    this.cat = null;
    this.motes = [];
    this.paused = false;

    this.loop = this.loop.bind(this);
    this.bindInput();
    this.resize();
    if (level.cat) {
      this.cat = new Cat(catSheet, level.cat === "roam" ? null : level.cat, this.catWorld());
      this.cat.setScale(this.C);
    }
    for (const v of this.vis) {
      v.x = v.tx;
      v.y = v.ty - 26;
      v.s = v.ts;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.emitState();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.unbind?.();
  }

  // ── layout ─────────────────────────────────────────────────────────────────

  resize() {
    const rect = this.cv.getBoundingClientRect();
    const W = Math.max(280, rect.width), H = Math.max(360, rect.height);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.dpr = dpr;
    this.W = W;
    this.H = H;

    const top = 64 + cssVar("--sat");
    // keep rooms reserve a strip at the bottom for the "Seal the boxes" button
    const bottom = (this.keep ? 70 : 16) + cssVar("--sab");
    const m = 12;
    const portrait = H >= W * 0.9;
    this.portrait = portrait;
    let best = null;

    if (portrait) {
      const A = H - top - bottom;
      for (let f = 0.7; f >= 0.42; f -= 0.02) {
        const trayH = A * (1 - f);
        const fb = this.fitBoxes({ x: m, y: top + trayH, w: W - 2 * m, h: A * f });
        const tray = { x: m, y: top + 4, w: W - 2 * m, h: trayH - 8 };
        const Ct = this.fitTray(tray, fb.C);
        const score = Math.min(fb.C, Ct / 0.6);
        if (!best || score > best.score + 0.01) best = { score, fb, tray, Ct };
      }
    } else {
      const A = W - 2 * m;
      for (let f = 0.66; f >= 0.4; f -= 0.02) {
        const trayW = A * (1 - f);
        const fb = this.fitBoxes({ x: m + trayW + m, y: top, w: A * f - m, h: H - top - bottom });
        const tray = { x: m, y: top + (H - top) * 0.1, w: trayW, h: H - top - bottom - (H - top) * 0.1 };
        const Ct = this.fitTray(tray, fb.C);
        const score = Math.min(fb.C, Ct / 0.6);
        if (!best || score > best.score + 0.01) best = { score, fb, tray, Ct };
      }
    }
    this.C = best.fb.C;
    this.Ct = best.Ct;
    this.flap = flapSize(this.C);

    // compose: share the leftover space so neither the floor nor the boxes
    // float in a sea of empty room
    const dims = this.items.map((it, i) => {
      const s = rotations(it.shape)[this.vis[i].rot];
      return [s.w, s.h];
    });
    const trayH = shelfPack(dims, best.tray, this.Ct)?.height ?? best.tray.h;
    if (portrait) {
      const A = H - top - bottom;
      const blockH = best.fb.blockH;
      const left = Math.max(0, A - trayH - blockH - 8);
      this.trayArea = { x: m, y: top + 8 + left * 0.14, w: W - 2 * m, h: trayH + left * 0.3 };
      this.geo = this.fitBoxes({ x: m, y: H - bottom - blockH - left * 0.22, w: W - 2 * m, h: blockH }).geo;
    } else {
      const A = H - top - bottom;
      this.trayArea = { ...best.tray, y: top + 8 + Math.max(0, A - trayH) * 0.12 };
      this.geo = best.fb.geo;
    }

    this.trayRows = null;
    this.layoutTray();
    const firstRowBottom = this.trayRows?.[0]?.bottom ?? this.trayArea.y + this.Ct * 2;
    this.wallY = Math.max(top + 30, firstRowBottom - this.Ct * 0.45);
    this.floorRect = {
      x0: 16, x1: W - 16,
      y0: Math.min(H - 60, this.wallY + 26),
      y1: H - 18 - cssVar("--sab"),
    };

    // rug under the boxes (rooms that have one)
    const gx0 = Math.min(...this.geo.map((g) => g.x)) - this.C * 0.8;
    const gx1 = Math.max(...this.geo.map((g) => g.x + g.w * this.C)) + this.C * 0.8;
    const gy0 = Math.min(...this.geo.map((g) => g.y)) - this.C * 0.5;
    const gy1 = Math.max(...this.geo.map((g) => g.y + g.h * this.C)) + this.C;
    this.bg = paintRoom(this.level.room, W, H, this.wallY, { x: gx0, y: gy0, w: gx1 - gx0, h: gy1 - gy0 }, 3, top);

    for (const [i, p] of this.board.place) {
      const v = this.vis[i];
      const g = this.geo[p.box];
      v.tx = g.x + p.x * this.C;
      v.ty = g.y + p.y * this.C;
      v.ts = this.C;
      v.x = v.tx;
      v.y = v.ty;
      v.s = v.ts;
    }
    if (this.cat) {
      this.cat.setScale(this.C);
      if (this.cat.spot) {
        const s = this.cat.spot, g = this.geo[s.box];
        Object.assign(s, this.spotGeo(s.box, s.x, s.y, g));
        if (this.cat.napping) {
          this.cat.x = s.px;
          this.cat.y = s.py + this.cat.S * 4.5;
        }
      }
    }
  }

  /** Arrange boxes in rows to maximise cell size inside `area`. */
  fitBoxes(area) {
    const bs = this.boxes;
    const exW = 0.36 * 2 + 0.3, exT = 0.42, exB = 0.62 + (this.weightOn ? 0.75 : 0.1);
    const gapX = 0.5, gapY = 0.25;
    const splits = rowSplits(bs.length);
    let best = null;
    for (const rows of splits) {
      const rowW = rows.map((r) => r.reduce((s, i) => s + bs[i].w + exW, 0) + gapX * (r.length - 1));
      const rowH = rows.map((r) => Math.max(...r.map((i) => bs[i].h)) + exT + exB);
      const totW = Math.max(...rowW);
      const totH = rowH.reduce((a, b) => a + b, 0) + gapY * (rows.length - 1);
      let C = Math.min(area.w / totW, area.h / totH, 104);
      C = Math.floor(C);
      if (!best || C > best.C) best = { C, rows, rowW, rowH, totH };
    }
    const { C, rows, rowW, rowH, totH } = best;
    const geo = new Array(bs.length);
    let y = area.y + (area.h - totH * C) / 2;
    rows.forEach((r, ri) => {
      let x = area.x + (area.w - rowW[ri] * C) / 2;
      for (const i of r) {
        const b = bs[i];
        const gx = x + (0.36 + 0.15) * C;
        const gy = y + exT * C + (rowH[ri] - exT - exB - b.h) * C;
        geo[i] = { x: Math.round(gx), y: Math.round(gy), w: b.w, h: b.h, label: b.label };
        x += (b.w + exW + gapX) * C;
      }
      y += (rowH[ri] + gapY) * C;
    });
    return { C, geo, blockH: totH * C };
  }

  /** Largest tray cell size at which every item fits on the floor. */
  fitTray(area, C) {
    const dims = this.items.map((it, i) => {
      const s = rotations(it.shape)[this.vis[i].rot];
      return [s.w, s.h];
    });
    for (let Ct = Math.floor(C * 0.82); Ct >= Math.max(10, C * 0.3); Ct = Math.floor(Ct * 0.94)) {
      if (shelfPack(dims, area, Ct)) return Ct;
    }
    return Math.max(10, Math.floor(C * 0.3));
  }

  /** Put every unpacked item on the floor, in a stable order. */
  layoutTray() {
    const idx = this.vis.map((v, i) => i).filter((i) => this.vis[i].where === "tray");
    idx.sort((a, b) => this.items[b].shape.cells.length - this.items[a].shape.cells.length || a - b);
    const dims = idx.map((i) => {
      const s = rotations(this.items[i].shape)[this.vis[i].rot];
      return [s.w, s.h];
    });
    let Ct = this.Ct, packed = null;
    while (!(packed = shelfPack(dims, this.trayArea, Ct)) && Ct > 8) Ct = Math.floor(Ct * 0.92);
    if (!packed) packed = { pos: dims.map(() => [this.trayArea.x, this.trayArea.y]), rows: [] };
    if (!this.trayRows) this.trayRows = packed.rows;
    // whatever is left always stands on the same floor line against the wall
    const shift = packed.rows.length && this.trayRows.length ? this.trayRows[0].bottom - packed.rows[0].bottom : 0;
    idx.forEach((i, k) => {
      const v = this.vis[i];
      v.tx = packed.pos[k][0];
      v.ty = packed.pos[k][1] + shift;
      v.ts = Ct;
    });
  }

  // ── input ──────────────────────────────────────────────────────────────────

  bindInput() {
    const cv = this.cv;
    const down = (e) => this.onDown(e);
    const move = (e) => this.onMove(e);
    const up = (e) => this.onUp(e);
    const cancel = (e) => this.onCancel(e);
    const ctx = (e) => e.preventDefault();
    const wheel = (e) => {
      if (this.drag) {
        e.preventDefault();
        this.rotateDragged();
      }
    };
    const key = (e) => this.onKey(e);
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    cv.addEventListener("contextmenu", ctx);
    cv.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", key);
    this.unbind = () => {
      cv.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      cv.removeEventListener("contextmenu", ctx);
      cv.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", key);
    };
  }

  pt(e) {
    const r = this.cv.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  onDown(e) {
    audio.unlock();
    if (this.done) return;
    const p = this.pt(e);
    if (this.drag) {
      if (e.pointerId !== this.drag.pid) this.rotateDragged();
      return;
    }
    const hit = this.hitTest(p.x, p.y);
    if (!hit) return;
    e.preventDefault();
    try { this.cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (hit.kind === "item" && e.button === 2) {
      this.rotateItem(hit.i);
      return;
    }
    this.press = { pid: e.pointerId, x: p.x, y: p.y, hit, touch: e.pointerType === "touch" };
  }

  onMove(e) {
    const p = this.pt(e);
    this.pointer = p;
    if (this.drag && e.pointerId === this.drag.pid) {
      this.drag.px = p.x;
      this.drag.py = p.y;
      return;
    }
    const pr = this.press;
    if (pr && e.pointerId === pr.pid && pr.hit.kind === "item" && Math.hypot(p.x - pr.x, p.y - pr.y) > 7) {
      this.startDrag(pr, p);
    }
  }

  onUp(e) {
    if (this.drag && e.pointerId === this.drag.pid) {
      this.drop();
      return;
    }
    const pr = this.press;
    if (!pr || e.pointerId !== pr.pid) return;
    this.press = null;
    if (this.done) return;
    if (pr.hit.kind === "item") this.rotateItem(pr.hit.i);
    else if (pr.hit.kind === "cat") this.cat.tap();
  }

  onCancel(e) {
    if (this.drag && e.pointerId === this.drag.pid) {
      this.drag.snap = null;
      this.drop();
    }
    this.press = null;
  }

  onKey(e) {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this.undo();
    } else if (e.key === "r" || e.key === "R" || e.key === " ") {
      if (this.drag) {
        e.preventDefault();
        this.rotateDragged();
      }
    } else if (e.key === "Escape" && this.drag) {
      this.drag.snap = null;
      this.drop();
    }
  }

  hitTest(x, y) {
    // napping cat sits on top of box contents
    if (this.cat?.inBox && this.cat.hit(x, y)) return { kind: "cat" };
    // packed items: exact cell lookup
    for (let b = 0; b < this.geo.length; b++) {
      const g = this.geo[b];
      const cx = Math.floor((x - g.x) / this.C), cy = Math.floor((y - g.y) / this.C);
      if (cx >= 0 && cy >= 0 && cx < g.w && cy < g.h) {
        const A = g.w * g.h;
        for (let l = layersOf(this.boxes[b]) - 1; l >= 0; l--) {
          const v = this.board.grids[b][l * A + cy * g.w + cx];
          if (v >= 0) return { kind: "item", i: v };
          if (v === -2 && this.cat) return { kind: "cat" };
        }
      }
    }
    // floor items: generous rectangle, topmost first
    const order = this.drawOrderTray().reverse();
    for (const i of order) {
      const v = this.vis[i];
      const s = rotations(this.items[i].shape)[v.rot];
      const pad = Math.max(4, v.s * 0.12);
      if (x >= v.x - pad && y >= v.y - pad && x <= v.x + s.w * v.s + pad && y <= v.y + s.h * v.s + pad) return { kind: "item", i };
    }
    if (this.cat && this.cat.hit(x, y)) return { kind: "cat" };
    return null;
  }

  // ── actions ────────────────────────────────────────────────────────────────

  snapshot() {
    this.undoStack.push({ place: new Map(this.board.place), rots: this.vis.map((v) => v.rot) });
    if (this.undoStack.length > 120) this.undoStack.shift();
  }

  startDrag(pr, p) {
    const i = pr.hit.i;
    const v = this.vis[i];
    const fromBox = v.where === "box";
    if (fromBox && itemsOnTop(this.board, i).length) {
      this.press = null;
      this.refuseUnder(i);
      return;
    }
    if (fromBox) {
      this.snapshot();
      lift(this.board, i);
    }
    v.where = "drag";
    this.drag = {
      i, pid: pr.pid, px: p.x, py: p.y, fromBox,
      gu: (pr.x - v.x) / v.s, gv: (pr.y - v.y) / v.s,
      lift: pr.touch ? Math.min(30, this.C * 0.6) : 0,
      liftNow: 0, snap: null,
    };
    this.press = null;
    audio.pickup();
    if (this.hintFx?.i !== i) this.hintFx = null;
    this.layoutTray();
    this.emitState();
  }

  refuseUnder(i) {
    this.vis[i].wob = 1;
    for (const j of itemsOnTop(this.board, i)) this.vis[j].wob = 0.6;
    audio.bonk();
    this.toastOnce("under", "Something's resting on it. Take that off first.");
  }

  rotateDragged() {
    const d = this.drag;
    if (!d) return;
    const v = this.vis[d.i];
    const s = rotations(this.items[d.i].shape)[v.rot];
    // keep the grab point under the finger through the turn
    const gu = d.gu, gv = d.gv;
    d.gu = s.h - gv;
    d.gv = gu;
    v.rot = (v.rot + 1) % 4;
    v.tAng += 90;
    audio.turn();
    this.tutorialDone("rotate");
  }

  rotateItem(i) {
    const v = this.vis[i];
    if (v.where === "tray") {
      v.rot = (v.rot + 1) % 4;
      v.tAng += 90;
      audio.turn();
      this.layoutTray();
      this.tutorialDone("rotate");
      return;
    }
    if (v.where !== "box") return;
    if (itemsOnTop(this.board, i).length) return this.refuseUnder(i);
    const p = this.board.place.get(i);
    const from = rotations(this.items[i].shape)[p.rot];
    const to = rotations(this.items[i].shape)[(p.rot + 1) % 4];
    const cx = p.x + from.w / 2, cy = p.y + from.h / 2;
    const bx = Math.round(cx - to.w / 2), by = Math.round(cy - to.h / 2);
    const tries = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (const [dx, dy] of tries) {
      if (fits(this.board, i, p.box, bx + dx, by + dy, (p.rot + 1) % 4, p.layer)) {
        this.snapshot();
        put(this.board, i, p.box, bx + dx, by + dy, (p.rot + 1) % 4, p.layer);
        v.rot = (p.rot + 1) % 4;
        v.tAng += 90;
        const g = this.geo[p.box];
        v.tx = g.x + (bx + dx) * this.C;
        v.ty = g.y + (by + dy) * this.C;
        audio.turn();
        this.tutorialDone("rotate");
        this.afterChange(i, p.box);
        return;
      }
    }
    v.wob = 1;
    audio.bonk();
    this.toastOnce("turn", "No room to turn it there — drag it out first.");
  }

  drop() {
    const d = this.drag;
    this.drag = null;
    const i = d.i;
    const v = this.vis[i];
    const snap = d.snap;
    if (snap && snap.ok) {
      // picking up from a box already saved an undo step; from the floor, save one now
      if (!d.fromBox) this.snapshot();
      if (this.hintFx?.i === i) this.hintFx = null;
      put(this.board, i, snap.box, snap.x, snap.y, v.rot, snap.layer);
      v.where = "box";
      v.layer = snap.layer;
      const g = this.geo[snap.box];
      v.tx = g.x + snap.x * this.C;
      v.ty = g.y + snap.y * this.C;
      v.ts = this.C;
      v.squash = 1;
      this.moves++;
      const cells = this.items[i].shape.cells.length;
      audio.thud(cells);
      const sh = rotations(this.items[i].shape)[v.rot];
      this.spawnDust(v.tx, v.ty, sh.w * this.C, sh.h * this.C);
      this.tutorialDone("drag");
      this.afterChange(i, snap.box);
    } else {
      if (snap && !snap.ok) {
        audio.bonk();
        if (this.cat?.napping && this.cellsHitCat(i, snap)) this.toastOnce("cat", "Stretchy's in the way. Tap him to shoo him out.");
        else if (snap.uneven) this.toastOnce("uneven", "Not level. To stack it, everything underneath has to be the same height.");
      }
      v.where = "tray";
      this.layoutTray();
      this.emitState();
    }
  }

  cellsHitCat(i, snap) {
    const sh = rotations(this.items[i].shape)[this.vis[i].rot];
    const g = this.geo[snap.box], A = g.w * g.h, grid = this.board.grids[snap.box];
    return cellsAt(sh, snap.x, snap.y).some(([x, y]) => {
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) return false;
      for (let l = 0; l < layersOf(this.boxes[snap.box]); l++) if (grid[l * A + y * g.w + x] === -2) return true;
      return false;
    });
  }

  afterChange(i, box) {
    const it = this.items[i];
    // weight
    if (this.weightOn) {
      const over = overweightBoxes(this.board);
      if (over.includes(box)) {
        this.boxFx[box].shake = 1;
        audio.strain();
        this.toastOnce("weight", `Too heavy — the bottom will fall out. This box holds ${this.boxes[box].maxWeight}.`);
      }
    }
    // fragile
    if (this.fragileOn) {
      const bad = fragileConflicts(this.board).filter((c) => c.fragile === i || c.heavy === i);
      if (bad.length) {
        audio.tink();
        for (const c of bad) this.vis[c.fragile].wob = 1;
        if (bad.some((c) => c.kind === "crush")) this.toastOnce("crush", "Crunch. Nothing heavy on top of something fragile.");
        else this.toastOnce("fragile", "Fragile! Glass can't touch heavy things. Pad it with something light.");
      }
    }
    // a memory, the first time it goes in a box
    if (it.memory && !this.seenMemory.has(it.id)) {
      this.seenMemory.add(it.id);
      audio.memory();
      const v = this.vis[i];
      const s = rotations(it.shape)[v.rot];
      for (let k = 0; k < 10; k++) this.spawn("spark", v.tx + this.rng() * s.w * this.C, v.ty + this.rng() * s.h * this.C);
      this.emit("memory", { name: it.name, text: it.memory });
    }
    this.emitState();
    if (this.keep) {
      // with everything packed there's nothing left to decide
      if (this.board.place.size === this.items.length && isSolved(this.board, this.keep)) this.finish();
      else if (isSolved(this.board, this.keep)) this.toastOnce("seal", "That's enough to move with. Seal the boxes whenever you're ready, or keep packing for more.");
    } else if (isSolved(this.board)) this.finish();
  }

  /** Keep-or-let-go rooms: finish now; whatever's left on the floor is donated. */
  seal() {
    if (!this.done && this.keep && isSolved(this.board, this.keep)) this.finish();
  }

  undo() {
    if (this.done || this.drag || !this.undoStack.length) return;
    const s = this.undoStack.pop();
    this.restore(s);
    audio.click();
  }

  restart() {
    if (this.done) return;
    if (this.drag) {
      this.drag.snap = null;
      this.drop();
    }
    if (!this.board.place.size) return;
    this.snapshot();
    this.restore({ place: new Map(), rots: this.vis.map((v) => v.rot) });
    audio.flap();
  }

  restore(s) {
    // the cat can't be sleeping where something is about to reappear
    const spot = this.cat?.spot;
    if (spot) {
      const clash = [...s.place.entries()].some(([i, p]) => {
        const sh = rotations(this.items[i].shape)[p.rot];
        return p.box === spot.box && cellsAt(sh, p.x, p.y).some(([x, y]) => x >= spot.x && x < spot.x + CAT_W && y >= spot.y && y < spot.y + CAT_H);
      });
      if (clash) this.cat.evict(true);
    }
    for (const i of [...this.board.place.keys()]) lift(this.board, i);
    s.rots.forEach((r, i) => {
      if (this.vis[i].rot !== r) this.vis[i].tAng += ((r - this.vis[i].rot + 4) % 4) * 90;
      this.vis[i].rot = r;
    });
    this.vis.forEach((v) => (v.where = "tray"));
    for (const [i, p] of s.place) {
      put(this.board, i, p.box, p.x, p.y, p.rot, p.layer || 0);
      const v = this.vis[i];
      const g = this.geo[p.box];
      v.where = "box";
      v.layer = p.layer || 0;
      v.tx = g.x + p.x * this.C;
      v.ty = g.y + p.y * this.C;
      v.ts = this.C;
    }
    this.layoutTray();
    this.emitState();
  }

  /** Point at the next useful move, or at whatever is making the room impossible. */
  hint() {
    if (this.done || this.drag) return;
    this.hints++;
    audio.pop();
    const over = overweightBoxes(this.board);
    const frag = this.fragileOn ? fragileConflicts(this.board) : [];
    if (over.length || frag.length) {
      const target = frag.length ? frag[0].fragile : [...this.board.place].find(([, p]) => p.box === over[0])[0];
      this.hintFx = { kind: "move", i: target, t: 0 };
      this.emit("toast", { text: frag.length ? "Something fragile is touching something heavy." : "That box is too heavy. Move something out.", kind: "hint" });
      return;
    }
    if (this.keep && isSolved(this.board, this.keep)) {
      this.emit("toast", { text: "You've kept enough. Seal the boxes, or try to fit more hearts.", kind: "hint" });
      if (packedValue(this.board) >= (this.keep.best ?? Infinity)) return;
    }
    const fixed = new Map(this.board.place);
    const minValue = this.keep ? Math.max(this.keep.target, packedValue(this.board) + 1) : 0;
    let res = solveAny(this.boxes, this.items, { fixed, maxNodes: 900000, minValue });
    if (this.keep && res.status !== "solved") res = solveAny(this.boxes, this.items, { fixed, maxNodes: 600000, minValue: this.keep.target });
    if (res.status === "solved") {
      const sol = res.solutions[0];
      const free = [...sol.keys()].filter((i) => !fixed.has(i));
      free.sort((a, b) => this.items[b].shape.cells.length - this.items[a].shape.cells.length);
      const i = free[0];
      this.hintFx = { kind: "place", i, target: sol.get(i), t: 0 };
      const p = sol.get(i);
      if (this.cat?.spot && p.box === this.cat.spot.box) {
        const sh = rotations(this.items[i].shape)[p.rot];
        const b = this.boxes[p.box], off = (p.layer || 0) * b.w * b.h;
        if (cellsAt(sh, p.x, p.y).some(([x, y]) => this.board.grids[p.box][off + y * b.w + x] === -2)) {
          this.emit("toast", { text: "Stretchy is sleeping where that goes. Tap him.", kind: "hint" });
        }
      }
      return;
    }
    // stuck: find a placed item whose removal makes it solvable again
    const placed = [...fixed.keys()].sort((a, b) => this.items[b].shape.cells.length - this.items[a].shape.cells.length);
    for (const j of placed) {
      const f2 = new Map(fixed);
      f2.delete(j);
      if (solveAny(this.boxes, this.items, { fixed: f2, maxNodes: 150000, minValue: this.keep?.target || 0 }).status === "solved") {
        this.hintFx = { kind: "move", i: j, t: 0 };
        this.emit("toast", { text: "This one's in the way. Try it somewhere else.", kind: "hint" });
        return;
      }
    }
    this.emit("toast", { text: "Hmm. This might need a fresh start — try restarting the room.", kind: "hint" });
  }

  tutorialDone(kind) {
    if (this.tutorial === kind) {
      this.tutorial = null;
      this.emit("tutorial-done", kind);
    }
  }

  toastOnce(key, text) {
    if (this.warned[key]) return;
    this.warned[key] = true;
    this.emit("toast", { text, kind: "warn" });
  }

  emitState() {
    const used = new Set([...this.board.place.values()].map((p) => p.box)).size;
    this.emit("state", {
      canUndo: this.undoStack.length > 0 && !this.done,
      placed: this.board.place.size,
      total: this.items.length,
      used,
      boxes: this.boxes.length,
      par: this.par,
      keep: this.keep ? { value: packedValue(this.board), target: this.keep.target, best: this.keep.best } : null,
      canSeal: !!this.keep && !this.done && isSolved(this.board, this.keep),
    });
  }

  // ── finish ─────────────────────────────────────────────────────────────────

  finish() {
    this.done = true;
    this.press = null;
    this.hintFx = null;
    this.cat?.retire();
    const usedSet = new Set([...this.board.place.values()].map((p) => p.box));
    let t = 0.5;
    const seq = this.geo.map((g, b) => {
      const s = { b, start: t, spare: !usedSet.has(b), fired: {} };
      t += s.spare ? 0.55 : 0.9;
      return s;
    });
    const used = usedSet.size;
    const value = packedValue(this.board);
    // anything still on the floor goes to the donation pile
    this.vis.forEach((v, i) => {
      if (v.where !== "tray") return;
      v.where = "donated";
      v.tx = this.W + 80;
      v.ty = this.H * 0.55 + this.rng() * 60;
      v.delay = 0.1 + this.rng() * 0.4;
    });
    this.stats = {
      boxes: used,
      total: this.boxes.length,
      par: this.par,
      keep: this.keep ? { value, target: this.keep.target, best: this.keep.best, donated: this.items.length - this.board.place.size } : null,
      pro: this.keep ? value >= this.keep.best : this.par < this.boxes.length && used <= this.par,
      ms: performance.now() - this.startTime,
      moves: this.moves,
      hints: this.hints,
    };
    this.celebration = { t: 0, seq, end: t + 0.2, fired: {} };
    this.emitState();
  }

  updateCelebration(dt) {
    const c = this.celebration;
    c.t += dt;
    for (const s of c.seq) {
      const L = c.t - s.start;
      const fire = (k, fn) => { if (L >= k && !s.fired[k]) { s.fired[k] = true; fn(); } };
      fire(0, () => audio.flap());
      if (!s.spare) fire(0.36, () => audio.tape());
      fire(s.spare ? 0.34 : 0.78, () => {
        audio.play("stamp", { vol: s.spare ? 0.5 : 0.9, rate: s.spare ? 1.1 : 1 });
        const g = this.geo[s.b];
        this.spawnDust(g.x, g.y, g.w * this.C, g.h * this.C, 10);
      });
    }
    if (c.t >= c.end && !c.fired.confetti) {
      c.fired.confetti = true;
      audio.play("chime", { vol: 0.8 });
      for (let k = 0; k < 90; k++) this.spawn("peanut", this.rng() * this.W, -20 - this.rng() * this.H * 0.4);
    }
    if (c.t >= c.end + 1.1 && !c.fired.done) {
      c.fired.done = true;
      this.emit("solved", this.stats);
    }
  }

  // ── cat world ──────────────────────────────────────────────────────────────

  catWorld() {
    return {
      floor: () => this.walkable(),
      approach: (spot) => this.approach(spot),
      // among the floor items he's drawn at their scale; by the boxes, at box scale
      depth: (y) => {
        const near = this.Ct / this.C;
        const trayBottom = Math.max(...(this.trayRows || []).map((r) => r.bottom), this.wallY + 20);
        const boxTop = Math.max(trayBottom + 30, Math.min(...this.geo.map((g) => g.y)) + this.C);
        return near + (1 - near) * clamp((y - trayBottom) / (boxTop - trayBottom), 0, 1);
      },
      napSpots: () => this.napSpots(),
      block: (s) => this.setBlock(s, true),
      unblock: (s) => this.setBlock(s, false),
      spawn: (k, x, y) => this.spawn(k, x, y),
      busy: () => !!this.drag || this.done,
      // mood rooms
      mood: !!this.level.mood,
      dragging: () => (this.drag && !this.done ? { x: this.drag.px, y: this.drag.py } : null),
      pounced: () => this.pounced(),
      swatTarget: (x, y) => this.swatTarget(x, y),
      stillSwattable: (i) => this.swattable(i),
      knock: (i, dir) => this.knock(i, dir),
      mischief: () => this.toastOnce("mischief", "Stretchy's had enough of being ignored. Tap him to pet him — or catch him in the act."),
    };
  }

  /** Packed, nothing on top, and not under a sleeping cat. */
  swattable(i) {
    const v = this.vis[i];
    if (this.done || v.where !== "box" || itemsOnTop(this.board, i).length) return false;
    return !this.cat?.spot || this.board.place.get(i).box !== this.cat.spot.box || !this.cellsHitCat(i, this.board.place.get(i));
  }

  /** Something he could knock out, preferring what's close. */
  swatTarget(x, y) {
    const cands = [...this.board.place.keys()].filter((i) => this.swattable(i)).map((i) => {
      const v = this.vis[i], s = rotations(this.items[i].shape)[v.rot];
      const px = v.tx + (s.w * this.C) / 2, py = v.ty + (s.h * this.C) / 2;
      return { i, px, py, d: Math.hypot(px - x, py - y) + this.rng() * this.C * 4 };
    });
    cands.sort((a, b) => a.d - b.d);
    return cands[0] || null;
  }

  /** The cat swatted item i out of its box, back onto the floor. */
  knock(i, dir = 1) {
    const v = this.vis[i];
    lift(this.board, i);
    v.where = "tray";
    v.wob = 1;
    v.tAng += dir * 360;
    audio.bonk();
    this.spawn("puff", v.x, v.y);
    this.layoutTray();
    this.toastOnce("knock", `Stretchy knocked the ${this.items[i].name.toLowerCase()} out. Keep him happy!`);
    this.emitState();
  }

  /** He leapt at the thing in your hand: you drop it, and it goes back where it was. */
  pounced() {
    const d = this.drag;
    if (!d) return;
    d.snap = null;
    this.drop();
    this.vis[d.i].wob = 1;
    this.toastOnce("pounce", "Pounced! Stretchy wants attention more than you want that.");
  }

  /**
   * The open floor Stretchy wanders: the lane between the things on the floor
   * and the boxes (portrait), or beside the boxes (landscape). He never walks
   * across an open box — he hops in.
   */
  walkable() {
    const C = this.C, f = this.flap;
    const bx0 = Math.min(...this.geo.map((g) => g.x)) - f.side;
    const by0 = Math.min(...this.geo.map((g) => g.y)) - f.top;
    const y0 = this.wallY + 14;
    const above = { x0: 16 + C, x1: this.W - 16 - C, y0, y1: Math.max(y0 + 16, by0 - 8) };
    const beside = { x0: 16 + C, x1: Math.max(16 + C + 20, bx0 - C * 1.2), y0, y1: this.floorRect.y1 };
    const area = (r) => (r.x1 - r.x0) * (r.y1 - r.y0);
    return area(beside) > area(above) * 1.2 ? beside : above;
  }

  /** Where to stand before hopping into (or after hopping out of) a spot. */
  approach(spot) {
    const r = this.walkable();
    return { x: clamp(spot.px, r.x0, r.x1), y: clamp(spot.py, r.y0, r.y1) };
  }

  spotGeo(box, x, y, g = this.geo[box]) {
    return {
      px: g.x + (x + CAT_W / 2) * this.C,
      py: g.y + (y + CAT_H / 2) * this.C,
      size: CAT_W * this.C,
      boxBottom: g.y + g.h * this.C + this.flap.bottom,
    };
  }

  napSpots() {
    const out = [];
    if (this.done) return out;
    this.geo.forEach((g, b) => {
      const grid = this.board.grids[b], A = g.w * g.h, L = layersOf(this.boxes[b]);
      // a flat surface: all empty floor, or (in a two-layer box) all tops of things
      const all = (x, y, test) => {
        for (let dy = 0; dy < CAT_H; dy++) for (let dx = 0; dx < CAT_W; dx++) if (!test((y + dy) * g.w + x + dx)) return false;
        return true;
      };
      for (let y = 0; y + CAT_H <= g.h; y++)
        for (let x = 0; x + CAT_W <= g.w; x++) {
          if (all(x, y, (k) => grid[k] === -1)) out.push({ box: b, x, y, layer: 0, ...this.spotGeo(b, x, y, g) });
          else if (L > 1 && all(x, y, (k) => grid[k] >= 0 && grid[A + k] === -1)) out.push({ box: b, x, y, layer: 1, ...this.spotGeo(b, x, y, g) });
        }
    });
    return out;
  }

  setBlock(s, on) {
    if (!s) return;
    const g = this.geo[s.box];
    const grid = this.board.grids[s.box];
    const off = (s.layer || 0) * g.w * g.h;
    for (let dy = 0; dy < CAT_H; dy++)
      for (let dx = 0; dx < CAT_W; dx++) {
        const k = off + (s.y + dy) * g.w + s.x + dx;
        if (on && grid[k] === -1) grid[k] = -2;
        else if (!on && grid[k] === -2) grid[k] = -1;
      }
    if (on) this.toastOnce("cat-first", "Stretchy found a box. Tap him to shoo him out.");
  }

  // ── particles ──────────────────────────────────────────────────────────────

  spawn(kind, x, y) {
    const r = this.rng;
    const p = { kind, x, y, t: 0, life: 1, vx: 0, vy: 0, rot: 0, vr: 0 };
    if (kind === "puff") {
      for (let k = 0; k < 7; k++) {
        const a = r() * Math.PI * 2;
        this.particles.push({ ...p, vx: Math.cos(a) * 60, vy: Math.sin(a) * 30 - 20, life: 0.5, size: 3 + r() * 4 });
      }
      return;
    }
    if (kind === "z") Object.assign(p, { vx: 12, vy: -22, life: 2.2 });
    if (kind === "heart") Object.assign(p, { vx: (r() - 0.5) * 20, vy: -40, life: 1.3 });
    if (kind === "bang") Object.assign(p, { vy: -14, life: 1.5 });
    if (kind === "spark") Object.assign(p, { vx: (r() - 0.5) * 40, vy: -30 - r() * 40, life: 0.9 + r() * 0.5 });
    if (kind === "peanut") Object.assign(p, { vx: (r() - 0.5) * 60, vy: 60 + r() * 120, life: 4, rot: r() * 6, vr: (r() - 0.5) * 8, hue: r() });
    this.particles.push(p);
  }

  spawnDust(x, y, w, h, n = 8) {
    for (let k = 0; k < n; k++) {
      const edge = this.rng() < 0.5;
      const px = x + this.rng() * w, py = edge ? y + h : y + this.rng() * h;
      const a = this.rng() * Math.PI * 2;
      this.particles.push({ kind: "dust", x: px, y: py, t: 0, life: 0.45, vx: Math.cos(a) * 50, vy: Math.sin(a) * 25 - 10, size: 2 + this.rng() * 3 });
    }
  }

  // ── frame ──────────────────────────────────────────────────────────────────

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Start the room (items drop in, the clock and the cat start). */
  begin() {
    this.paused = false;
    this.startTime = performance.now();
  }

  update(dt) {
    this.t += dt;
    this.updateMotes(dt);
    if (this.paused) return;
    const k = 1 - Math.exp(-dt * 16);
    const kd = 1 - Math.exp(-dt * 34);

    if (this.drag) {
      const d = this.drag;
      const v = this.vis[d.i];
      d.liftNow += (d.lift - d.liftNow) * k;
      v.tx = d.px - d.gu * v.s;
      v.ty = d.py - d.gv * v.s - d.liftNow;
      // snap preview uses the item at full box scale
      const left = d.px - d.gu * this.C, top = d.py - d.gv * this.C - d.liftNow;
      d.snap = this.snapFor(d.i, left, top);
    }

    this.vis.forEach((v, i) => {
      if (v.delay > 0) {
        v.delay -= dt;
        return;
      }
      v.alpha = Math.min(1, v.alpha + dt * 5);
      const kk = this.drag?.i === i ? kd : k;
      v.x += (v.tx - v.x) * kk;
      v.y += (v.ty - v.y) * kk;
      v.s += (v.ts - v.s) * kk;
      v.ang += (v.tAng - v.ang) * (1 - Math.exp(-dt * 20));
      v.squash = Math.max(0, v.squash - dt * 5);
      v.wob = Math.max(0, v.wob - dt * 2.2);
      if (v.where === "donated") v.alpha = Math.max(0, v.alpha - dt * 0.8);
    });
    this.boxFx.forEach((f) => {
      f.shake = Math.max(0, f.shake - dt * 2.5);
    });

    this.cat?.update(dt);
    if (this.cat?.moodOn) {
      const m = Math.round(this.cat.mood * 40) / 40;
      if (m !== this.moodShown) {
        this.moodShown = m;
        this.emit("mood", m);
      }
    } else if (this.moodShown != null) {
      this.moodShown = null;
      this.emit("mood", null);
    }

    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === "peanut") {
        p.vx += Math.sin(this.t * 2 + p.hue * 10) * 20 * dt;
      } else if (p.kind === "dust" || p.kind === "puff") {
        p.vx *= 1 - dt * 4;
        p.vy *= 1 - dt * 4;
      }
    }
    this.particles = this.particles.filter((p) => p.t < p.life);

    if (this.hintFx) {
      this.hintFx.t += dt;
      if (this.hintFx.t > 4.5) this.hintFx = null;
    }
    if (this.celebration) this.updateCelebration(dt);
  }

  /** Ambient dust drifting in the window light. */
  updateMotes(dt) {
    if (this.motes.length < 14 && this.rng() < dt * 3) {
      this.motes.push({ x: this.W * (0.45 + this.rng() * 0.5), y: this.wallY * (0.3 + this.rng() * 0.8), t: 0, life: 5 + this.rng() * 4, vx: -4 - this.rng() * 5, vy: 3 + this.rng() * 4 });
    }
    for (const m of this.motes) {
      m.t += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
    }
    this.motes = this.motes.filter((m) => m.t < m.life);
  }

  snapFor(i, left, top) {
    const v = this.vis[i];
    const sh = rotations(this.items[i].shape)[v.rot];
    const C = this.C;
    let best = null;
    this.geo.forEach((g, b) => {
      const fx = (left - g.x) / C, fy = (top - g.y) / C;
      const gx = Math.round(fx), gy = Math.round(fy);
      let inside = 0;
      for (const [cx, cy] of sh.cells) {
        const x = gx + cx, y = gy + cy;
        if (x >= 0 && y >= 0 && x < g.w && y < g.h) inside++;
      }
      const score = inside / sh.cells.length;
      if (inside && (!best || score > best.score)) best = { b, fx, fy, gx, gy, score };
    });
    if (!best || best.score < 0.5) return null;
    const cands = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = best.gx + dx, y = best.gy + dy;
        const dist = Math.hypot(x - best.fx, y - best.fy);
        if (dist <= 0.9) cands.push({ x, y, dist });
      }
    cands.sort((a, b) => a.dist - b.dist);
    let uneven = false;
    for (const c of cands) {
      const layer = this.levelFor(best.b, sh, c.x, c.y);
      if (layer === -1) uneven = true;
      if (layer >= 0 && fits(this.board, i, best.b, c.x, c.y, v.rot, layer)) {
        return { box: best.b, x: c.x, y: c.y, layer, ok: true, soft: this.softCheck(i, best.b, c.x, c.y, v.rot, layer) };
      }
    }
    const layer = Math.max(0, this.levelFor(best.b, sh, best.gx, best.gy));
    return { box: best.b, x: best.gx, y: best.gy, layer, ok: false, uneven };
  }

  /**
   * Which layer a shape would rest on here: 0 on the floor of the box, 1 on
   * top of things (two-layer boxes). -1 if the surface isn't level, -2 if it
   * doesn't fit inside the box at all.
   */
  levelFor(box, sh, x, y) {
    const b = this.boxes[box];
    let h = null;
    for (const [cx, cy] of cellsAt(sh, x, y)) {
      if (cx < 0 || cy < 0 || cx >= b.w || cy >= b.h) return -2;
      const hh = heightAt(this.board, box, cx, cy);
      if (h === null) h = hh;
      else if (hh !== h) return -1;
    }
    return h < layersOf(b) ? h : -2;
  }

  /** What would go wrong (but still be allowed) if item i went here. */
  softCheck(i, box, x, y, rot, layer = 0) {
    const it = this.items[i];
    const out = { heavy: false, touch: [] };
    const b = this.boxes[box];
    if (b.maxWeight != null) out.heavy = boxWeight(this.board, box) + it.weight > b.maxWeight;
    if (this.fragileOn && (it.fragile || it.weight >= HEAVY)) {
      const g = this.board.grids[box];
      const A = b.w * b.h, off = layer * A;
      const sh = rotations(it.shape)[rot];
      if (layer > 0 && it.weight >= HEAVY)
        for (const [cx, cy] of cellsAt(sh, x, y)) {
          const u = g[off - A + cy * b.w + cx];
          if (u >= 0 && this.items[u].fragile && !out.touch.includes(u)) out.touch.push(u);
        }
      for (const [cx, cy] of cellsAt(sh, x, y))
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= b.w || ny >= b.h) continue;
          const o = g[off + ny * b.w + nx];
          if (o < 0 || o === i) continue;
          const other = this.items[o];
          if ((it.fragile && other.weight >= HEAVY) || (it.weight >= HEAVY && other.fragile)) {
            if (!out.touch.includes(o)) out.touch.push(o);
          }
        }
    }
    out.any = out.heavy || out.touch.length > 0;
    return out;
  }

  // ── drawing ────────────────────────────────────────────────────────────────

  drawOrderTray() {
    return this.vis
      .map((v, i) => i)
      .filter((i) => this.vis[i].where === "tray")
      .sort((a, b) => this.vis[a].ty + this.vis[a].ts * 3 - (this.vis[b].ty + this.vis[b].ts * 3));
  }

  render() {
    const { ctx, dpr, C } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0, this.bg.width * 3, this.bg.height * 3);

    // motes
    for (const m of this.motes) {
      const a = Math.sin((m.t / m.life) * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(255,248,220,${a})`;
      ctx.fillRect(m.x, m.y, 2, 2);
    }

    const over = this.weightOn ? overweightBoxes(this.board) : [];
    const cracks = this.fragileOn ? fragileConflicts(this.board) : [];
    const cel = this.celebration;

    // boxes
    this.geo.forEach((g, b) => {
      const fx = this.boxFx[b];
      const shake = fx.shake ? Math.sin(this.t * 60) * 4 * fx.shake : 0;
      const hot = this.drag?.snap?.box === b ? 1 : 0;
      drawBoxBase(ctx, g, C, { warn: over.includes(b) ? 1 : 0, glow: hot, shake });
      if (layersOf(this.boxes[b]) > 1 && !this.celebration) this.drawLayerMark(g);
    });

    // packed items, bottom layer first; things on top sit a little higher
    const packed = [...this.board.place.keys()].sort(
      (a, b) => (this.vis[a].layer || 0) - (this.vis[b].layer || 0) || this.vis[a].ty - this.vis[b].ty,
    );
    for (const l of [0, 1]) {
      const here = packed.filter((i) => (this.vis[i].layer || 0) === l);
      if (l === 1) {
        // what's underneath sinks into shade, so the top layer reads as on top
        ctx.fillStyle = "rgba(40,20,6,0.26)";
        this.geo.forEach((g, b) => {
          if (layersOf(this.boxes[b]) < 2) return;
          const grid = this.board.grids[b], A = g.w * g.h;
          for (let k = 0; k < A; k++) if (grid[A + k] >= 0 && grid[k] >= 0) ctx.fillRect(g.x + (k % g.w) * C, g.y + ((k / g.w) | 0) * C, C, C);
        });
        for (const i of here) this.drawStackShadow(i);
      }
      for (const i of here) this.drawFootprint(i);
      for (const i of here) this.drawItem(i);
    }

    // fragile problems: cracks along shared edges, and crushes
    for (const c of cracks) {
      const g = this.geo[c.box];
      const lz = c.layer ? -this.stackLift() : 0;
      if (c.kind === "crush") {
        const X = g.x + c.x * C, Y = g.y + c.y * C + lz;
        drawCrack(ctx, X + 4, Y + 4, X + C - 4, Y + C - 4, this.t);
        drawCrack(ctx, X + C - 4, Y + 4, X + 4, Y + C - 4, this.t);
        continue;
      }
      const x0 = g.x + (c.x + c.dx) * C, y0 = g.y + (c.y + c.dy) * C + lz;
      if (c.dx) drawCrack(ctx, x0, y0 + 4, x0, y0 + C - 4, this.t);
      else drawCrack(ctx, x0 + 4, y0, x0 + C - 4, y0, this.t);
    }

    // napping cat sits in the box, above the contents
    if (this.cat?.inBox) this.cat.draw(ctx);

    // weight meters
    if (this.weightOn) {
      this.geo.forEach((g, b) => {
        const max = this.boxes[b].maxWeight;
        let w = boxWeight(this.board, b);
        let preview = 0;
        const snap = this.drag?.snap;
        if (snap && snap.ok && snap.box === b) preview = this.items[this.drag.i].weight;
        drawWeight(ctx, g, C, w, max, this.t, preview);
      });
    }

    // seal animation
    if (cel) {
      for (const s of cel.seq) {
        const L = cel.t - s.start;
        if (L <= 0) continue;
        const g = this.geo[s.b];
        drawBoxSeal(ctx, g, C, {
          seal: L / 0.32,
          tape: s.spare ? 0 : (L - 0.36) / 0.38,
          stamp: (L - (s.spare ? 0.34 : 0.78)) / 0.16,
          stampText: s.spare ? "SPARE" : "PACKED",
          spare: s.spare,
        });
      }
    }

    // floor items, and anything on its way to the donation pile
    for (const i of this.drawOrderTray()) this.drawItem(i, true);
    this.vis.forEach((v, i) => { if (v.where === "donated" && v.alpha > 0) this.drawItem(i, true); });

    // walking cat
    if (this.cat && !this.cat.inBox) this.cat.draw(ctx);

    // hints
    if (this.hintFx) this.drawHint();

    // tutorial pointers
    if (this.tutorial && !this.drag && this.t > 0.8) this.drawTutorial();

    // ghost + the item in hand
    if (this.drag) {
      const d = this.drag;
      if (d.snap) this.drawGhost(d.i, d.snap);
      this.drawItem(d.i, false, true);
    }

    this.drawParticles();
  }

  /** How far a top-layer item is drawn above its cells. */
  stackLift() {
    return Math.round(this.C * 0.12);
  }

  liftOf(i) {
    const v = this.vis[i];
    return v.where === "box" && v.layer === 1 ? this.stackLift() : 0;
  }

  drawStackShadow(i) {
    const { ctx } = this;
    const v = this.vis[i];
    const sh = rotations(this.items[i].shape)[v.rot];
    ctx.fillStyle = "rgba(30,14,4,0.30)";
    for (const [x, y] of sh.cells) ctx.fillRect(v.x + x * v.s + 3, v.y + y * v.s + 4, v.s, v.s);
  }

  /** Little "2 LAYERS" tag on the back flap of a stackable box. */
  drawLayerMark(g) {
    const { ctx, C } = this;
    const fs = Math.max(9, Math.round(C * 0.2));
    const x = g.x + g.w * C - fs * 0.4, y = g.y - this.flap.top * 0.55;
    ctx.save();
    ctx.font = `700 ${fs}px ${FONT_UI}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const label = "2 LAYERS";
    const tw = ctx.measureText(label).width;
    const u = fs * 0.45;
    ctx.fillStyle = "rgba(60,32,10,0.75)";
    ctx.fillRect(x - tw - u * 3.2, y - u * 0.9, u * 1.6, u * 1.1);
    ctx.fillRect(x - tw - u * 2.6, y - u * 0.2, u * 1.6, u * 1.1);
    ctx.fillText(label, x, y + 1);
    ctx.restore();
  }

  drawFootprint(i) {
    const { ctx } = this;
    const v = this.vis[i];
    const sh = rotations(this.items[i].shape)[v.rot];
    const s = v.s;
    const lz = this.liftOf(i);
    const set = new Set(sh.cells.map(([x, y]) => x + "," + y));
    ctx.fillStyle = lz ? "rgba(255,238,205,0.22)" : "rgba(255,238,205,0.13)";
    for (const [x, y] of sh.cells) ctx.fillRect(v.x + x * s + 1, v.y + y * s + 1 - lz, s - 2, s - 2);
    ctx.fillStyle = "rgba(70,38,12,0.30)";
    for (const [x, y] of sh.cells) {
      const X = v.x + x * s, Y = v.y + y * s - lz;
      if (!set.has(`${x},${y - 1}`)) ctx.fillRect(X, Y, s, 2);
      if (!set.has(`${x},${y + 1}`)) ctx.fillRect(X, Y + s - 2, s, 2);
      if (!set.has(`${x - 1},${y}`)) ctx.fillRect(X, Y, 2, s);
      if (!set.has(`${x + 1},${y}`)) ctx.fillRect(X + s - 2, Y, 2, s);
    }
  }

  drawItem(i, onFloor = false, held = false) {
    const { ctx } = this;
    const it = this.items[i];
    const v = this.vis[i];
    if (v.delay > 0) return;
    const img = this.sprites.get(it.file);
    const sh = rotations(it.shape)[v.rot];
    const base = it.shape;
    const s = v.s;
    const w = sh.w * s, h = sh.h * s;
    const cx = v.x + w / 2, cy = v.y + h / 2 - this.liftOf(i);

    // shadows
    if (held) {
      ctx.fillStyle = "rgba(35,18,5,0.28)";
      for (const [x, y] of sh.cells) ctx.fillRect(v.x + x * s + 7, v.y + y * s + 12, s, s);
    } else if (onFloor) {
      ctx.fillStyle = "rgba(35,18,5,0.22)";
      ctx.beginPath();
      ctx.ellipse(cx, v.y + h - s * 0.08, w * 0.42, Math.max(3, s * 0.16), 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const [bx, by, bw, bh] = it.bbox;
    const k = Math.min((base.w * s * 0.96) / bw, (base.h * s * 0.96) / bh);
    const wob = v.wob ? Math.sin(v.wob * 26) * v.wob * 0.12 : 0;
    const sq = v.squash ? Math.sin(v.squash * Math.PI) * 0.1 : 0;
    const lift = held ? 1.06 : 1;
    ctx.save();
    ctx.globalAlpha = v.alpha;
    ctx.translate(cx, cy + (held ? -2 : 0));
    ctx.rotate((v.ang * Math.PI) / 180 + wob);
    ctx.scale(lift * (1 + sq), lift * (1 - sq));
    ctx.imageSmoothingEnabled = k < 1;
    ctx.drawImage(img, bx, by, bw, bh, (-bw * k) / 2, (-bh * k) / 2, bw * k, bh * k);
    ctx.restore();

    // what it's worth, in keep-or-let-go rooms
    if (this.keep && v.where !== "donated" && !(this.done && v.where === "box")) {
      const val = valueOf(it);
      const u = Math.max(1.5, s * 0.06);
      const hx = cx - ((val - 1) * u * 9) / 2, hy = v.y + h - u * 5 - this.liftOf(i);
      for (let k = 0; k < val; k++) drawHeart(ctx, hx + k * u * 9, hy, u, "rgba(232,92,120,0.95)");
    }

    // rule badges
    if (this.done && v.where === "box") return;
    const badge = Math.max(15, Math.round(s * 0.4));
    if (this.fragileOn && it.fragile) drawBadge(ctx, "fragile", v.x + w - badge * 0.8, v.y - badge * 0.2, badge);
    else if ((this.fragileOn || this.weightOn) && it.weight >= HEAVY) drawBadge(ctx, "heavy", v.x + w - badge * 0.8, v.y - badge * 0.2, badge);
  }

  drawGhost(i, snap) {
    const { ctx, C } = this;
    const g0 = this.geo[snap.box];
    const g = snap.layer ? { ...g0, y: g0.y - this.stackLift() } : g0;
    const sh = rotations(this.items[i].shape)[this.vis[i].rot];
    const warn = snap.ok && snap.soft?.any;
    ctx.fillStyle = !snap.ok ? "rgba(220,70,55,0.34)" : warn ? "rgba(235,160,50,0.40)" : "rgba(130,210,120,0.40)";
    const edge = !snap.ok ? "rgba(200,50,40,0.8)" : warn ? "rgba(220,130,30,0.9)" : "rgba(80,170,80,0.9)";
    const set = new Set(sh.cells.map(([x, y]) => x + "," + y));
    for (const [cx, cy] of sh.cells) {
      const x = snap.x + cx, y = snap.y + cy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      ctx.fillRect(g.x + x * C + 1, g.y + y * C + 1, C - 2, C - 2);
    }
    ctx.fillStyle = edge;
    for (const [cx, cy] of sh.cells) {
      const x = snap.x + cx, y = snap.y + cy;
      if (x < 0 || y < 0 || x >= g.w || y >= g.h) continue;
      const X = g.x + x * C, Y = g.y + y * C;
      if (!set.has(`${cx},${cy - 1}`)) ctx.fillRect(X, Y, C, 2);
      if (!set.has(`${cx},${cy + 1}`)) ctx.fillRect(X, Y + C - 2, C, 2);
      if (!set.has(`${cx - 1},${cy}`)) ctx.fillRect(X, Y, 2, C);
      if (!set.has(`${cx + 1},${cy}`)) ctx.fillRect(X + C - 2, Y, 2, C);
    }
    if (snap.ok && snap.layer) {
      const fs = Math.max(11, Math.round(C * 0.26));
      const [cx0, cy0] = sh.cells[0];
      ctx.font = `700 ${fs}px ${FONT_UI}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(20,10,4,0.6)";
      ctx.fillText("on top", g.x + (snap.x + cx0) * C + 3, g.y + (snap.y + cy0) * C - 1);
      ctx.fillStyle = "#fff6dc";
      ctx.fillText("on top", g.x + (snap.x + cx0) * C + 2, g.y + (snap.y + cy0) * C - 2);
    }
    if (warn && snap.soft.touch.length) {
      for (const o of snap.soft.touch) {
        const v = this.vis[o];
        const os = rotations(this.items[o].shape)[v.rot];
        ctx.strokeStyle = `rgba(214,58,42,${0.6 + 0.3 * Math.sin(this.t * 12)})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(v.x + 1, v.y + 1, os.w * C - 2, os.h * C - 2);
      }
    }
  }

  drawHint() {
    const { ctx, C } = this;
    const h = this.hintFx;
    const pulse = 0.55 + 0.45 * Math.sin(h.t * 6);
    const fade = Math.min(1, (4.5 - h.t) * 2);
    const v = this.vis[h.i];
    const sh = rotations(this.items[h.i].shape)[v.rot];
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = `rgba(255,214,90,${0.12 + 0.12 * pulse})`;
    ctx.fillRect(v.x - 6, v.y - 6, sh.w * v.s + 12, sh.h * v.s + 12);
    ctx.strokeStyle = `rgba(255,200,60,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 4;
    ctx.strokeRect(v.x - 6, v.y - 6, sh.w * v.s + 12, sh.h * v.s + 12);
    if (h.kind === "place") {
      const p = h.target;
      const g = this.geo[p.box];
      const lz = p.layer ? this.stackLift() : 0;
      const ts = rotations(this.items[h.i].shape)[p.rot];
      ctx.fillStyle = `rgba(255,214,90,${0.25 + 0.2 * pulse})`;
      for (const [x, y] of cellsAt(ts, p.x, p.y)) ctx.fillRect(g.x + x * C + 2, g.y + y * C + 2 - lz, C - 4, C - 4);
      if (p.layer) {
        const [x, y] = cellsAt(ts, p.x, p.y)[0];
        ctx.font = `700 ${Math.max(11, C * 0.26)}px ${FONT_UI}`;
        ctx.fillStyle = "#fff4cf";
        ctx.textAlign = "left";
        ctx.fillText("on top", g.x + x * C + 2, g.y + y * C - lz - 3);
      }
      if (p.rot !== v.rot) {
        ctx.font = `600 ${Math.max(12, C * 0.28)}px ${FONT_UI}`;
        ctx.fillStyle = "#fff4cf";
        ctx.textAlign = "center";
        ctx.fillText("turn it", v.x + (sh.w * v.s) / 2, v.y - 10);
      }
    }
    ctx.restore();
  }

  drawTutorial() {
    const { ctx } = this;
    if (this.tutorial === "drag") {
      const i = this.vis.findIndex((v) => v.where === "tray");
      if (i < 0 || !this.solution) return;
      const v = this.vis[i];
      const sh = rotations(this.items[i].shape)[v.rot];
      const p = this.solution.get(i);
      const g = this.geo[p.box];
      const from = { x: v.x + (sh.w * v.s) / 2, y: v.y + (sh.h * v.s) / 2 };
      const ts = rotations(this.items[i].shape)[p.rot];
      const to = { x: g.x + (p.x + ts.w / 2) * this.C, y: g.y + (p.y + ts.h / 2) * this.C };
      const cyc = (this.t % 2.4) / 2.4;
      const k = easeOut(clamp((cyc - 0.15) / 0.55, 0, 1));
      const x = from.x + (to.x - from.x) * k, y = from.y + (to.y - from.y) * k;
      const a = cyc < 0.1 ? cyc / 0.1 : cyc > 0.85 ? (1 - cyc) / 0.15 : 1;
      drawFinger(ctx, x, y, a, cyc > 0.1 && cyc < 0.75);
    } else if (this.tutorial === "rotate") {
      // point at something the solution has lying down that's standing up now
      const i = this.vis.findIndex((v, k) => v.where === "tray" && this.solution && this.solution.get(k).rot % 2 !== v.rot % 2);
      if (i < 0) return;
      const v = this.vis[i];
      const sh = rotations(this.items[i].shape)[v.rot];
      const x = v.x + (sh.w * v.s) / 2, y = v.y + (sh.h * v.s) / 2;
      const cyc = (this.t % 1.6) / 1.6;
      drawFinger(ctx, x, y, 1, cyc < 0.25);
      ctx.font = `600 ${Math.max(13, this.C * 0.3)}px ${FONT_UI}`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(20,10,4,0.55)";
      ctx.fillText("tap to turn", x + 1, v.y - 7);
      ctx.fillStyle = "#fff8e6";
      ctx.fillText("tap to turn", x, v.y - 8);
    }
  }

  drawParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      const k = p.t / p.life;
      const a = 1 - k;
      if (p.kind === "dust" || p.kind === "puff") {
        ctx.fillStyle = `rgba(236,214,176,${a * 0.9})`;
        const s = p.size * (1 + k);
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.kind === "z") {
        ctx.font = `600 ${12 + k * 8}px ${FONT_UI}`;
        ctx.fillStyle = `rgba(255,250,235,${a})`;
        ctx.textAlign = "center";
        ctx.fillText("z", p.x + Math.sin(p.t * 3) * 4, p.y);
      } else if (p.kind === "heart") {
        drawHeart(ctx, p.x, p.y, 3, `rgba(232,92,120,${a})`);
      } else if (p.kind === "bang") {
        // a little speech bubble with a "!"
        const pop = Math.min(1, p.t * 6);
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.translate(p.x, p.y);
        ctx.scale(pop, pop);
        ctx.fillStyle = "#fffaf0";
        ctx.strokeStyle = "#2b1d14";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 10, 0, 0, Math.PI * 2);
        ctx.moveTo(-3, 9);
        ctx.lineTo(-6, 16);
        ctx.lineTo(3, 9);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#b3362b";
        ctx.font = `700 14px ${FONT_UI}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("!", 0, 1);
        ctx.restore();
      } else if (p.kind === "spark") {
        const s = 3 + Math.sin(k * Math.PI) * 3;
        ctx.fillStyle = `rgba(255,232,150,${a})`;
        ctx.fillRect(p.x - s / 2, p.y - 0.5, s, 1.5);
        ctx.fillRect(p.x - 0.5, p.y - s / 2, 1.5, s);
      } else if (p.kind === "peanut") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, (p.life - p.t) * 2);
        ctx.fillStyle = p.hue < 0.8 ? "#f6efdf" : "#f2d9a0";
        ctx.fillRect(-5, -2.5, 10, 5);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(-5, 1, 10, 1.5);
        ctx.restore();
      }
    }
  }
}

// ── layout helpers ───────────────────────────────────────────────────────────

/** All ways to split boxes (in order) into up to 3 rows. */
function rowSplits(n) {
  const idx = [...Array(n).keys()];
  const out = [[idx]];
  for (let a = 1; a < n; a++) {
    out.push([idx.slice(0, a), idx.slice(a)]);
    for (let b = a + 1; b < n; b++) out.push([idx.slice(0, a), idx.slice(a, b), idx.slice(b)]);
  }
  return out;
}

/**
 * Shelf packing: place rects (w×h cells at scale Ct) left-to-right in rows,
 * bottom-aligned so things stand on the floor. Returns positions or null.
 */
function shelfPack(dims, area, Ct) {
  const gap = Math.max(6, Ct * 0.3);
  const rows = [];
  let row = { items: [], w: 0, h: 0 };
  dims.forEach(([w, h], k) => {
    const pw = w * Ct, ph = h * Ct;
    if (row.items.length && row.w + gap + pw > area.w) {
      rows.push(row);
      row = { items: [], w: 0, h: 0 };
    }
    row.items.push({ k, pw, ph });
    row.w += (row.items.length > 1 ? gap : 0) + pw;
    row.h = Math.max(row.h, ph);
  });
  if (row.items.length) rows.push(row);
  const totH = rows.reduce((s, r) => s + r.h, 0) + gap * Math.max(0, rows.length - 1);
  if (totH > area.h || rows.some((r) => r.w > area.w)) return null;
  const pos = new Array(dims.length);
  const outRows = [];
  let y = area.y; // top-aligned: things stay against the wall as the floor empties
  for (const r of rows) {
    let x = area.x + (area.w - r.w) / 2;
    for (const it of r.items) {
      pos[it.k] = [Math.round(x), Math.round(y + r.h - it.ph)];
      x += it.pw + gap;
    }
    outRows.push({ top: y, bottom: y + r.h });
    y += r.h + gap;
  }
  return { pos, rows: outRows, height: totH };
}

function drawFinger(ctx, x, y, a, pressed) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.strokeStyle = "rgba(40,20,5,0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, pressed ? 11 : 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (pressed) {
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHeart(ctx, x, y, u, color) {
  ctx.fillStyle = color;
  const px = [[1, 0], [2, 0], [4, 0], [5, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [2, 4], [3, 4], [4, 4], [3, 5]];
  for (const [a, b] of px) ctx.fillRect(x + (a - 3.5) * u, y + b * u, u, u);
}
