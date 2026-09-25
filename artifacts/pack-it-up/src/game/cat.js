// Stretchy. Sheet: 8 cols × 51 rows of 32×32 frames, one animation per row,
// art faces right. He wanders the floor, grooms, and — on levels that allow
// it — climbs into any open 3×2 space in a box and falls asleep there, which
// blocks those cells until you tap him out.
//
// Scale: his sleeping loaf (23px of art) fills a 3×2 nap spot, so he's a
// little smaller than a bag of kibble and far bigger than his bowls. Away
// from the boxes he's drawn smaller, matching the floor's perspective.
import { audio } from "./audio.js";

export const CAT_ANIM = {
  walk:    { row: 4,  n: 8, fps: 11 },
  run:     { row: 8,  n: 3, fps: 14 },
  idle:    { row: 2,  n: 8, fps: 6 },
  groom:   { row: 3,  n: 8, fps: 7 },
  sit:     { row: 0,  n: 8, fps: 5 },
  sitDown: { row: 14, n: 4, fps: 9, once: true },
  lieDown: { row: 9,  n: 4, fps: 7, once: true },
  sleep:   { row: 11, n: 8, fps: 3 },
  stretch: { row: 17, n: 8, fps: 9, once: true },
  leap:    { row: 19, n: 4, fps: 10, once: true },
  land:    { row: 20, n: 4, fps: 12, once: true },
  happy:   { row: 28, n: 4, fps: 5 },
  look:    { row: 25, n: 4, fps: 5, once: true },
};

/**
 * Build a compact, smoothed copy of the sheet: only the rows we animate,
 * upscaled 4× with two passes of Scale2x (EPX). Edges come out rounder, so
 * the 32px cat sits better next to the more detailed item art — and the
 * compact sheet keeps memory small on phones.
 */
export function prepareCatSheet(img) {
  const rows = [...new Set(Object.values(CAT_ANIM).map((a) => a.row))].sort((a, b) => a - b);
  const src = document.createElement("canvas");
  src.width = 256;
  src.height = rows.length * 32;
  const sx = src.getContext("2d");
  rows.forEach((r, i) => sx.drawImage(img, 0, r * 32, 256, 32, 0, i * 32, 256, 32));
  let data = sx.getImageData(0, 0, src.width, src.height);
  data = scale2x(scale2x(data));
  const out = document.createElement("canvas");
  out.width = data.width;
  out.height = data.height;
  out.getContext("2d").putImageData(data, 0, 0);
  return { canvas: out, F: 128, row: new Map(rows.map((r, i) => [r, i])) };
}

function scale2x(im) {
  const { width: w, height: h } = im;
  const s = new Uint32Array(im.data.buffer.slice(0));
  const out = new ImageData(w * 2, h * 2);
  const d = new Uint32Array(out.data.buffer);
  const at = (x, y) => s[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const P = s[y * w + x], A = at(x, y - 1), B = at(x + 1, y), C = at(x - 1, y), D = at(x, y + 1);
      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;
      const o = y * 2 * w * 2 + x * 2;
      d[o] = p1;
      d[o + 1] = p2;
      d[o + w * 2] = p3;
      d[o + w * 2 + 1] = p4;
    }
  return out;
}

/** Draw one frame with feet at (0,0) in the current transform. */
export function drawCatFrame(ctx, sheet, anim, frame, S) {
  const F = sheet.F;
  ctx.drawImage(sheet.canvas, frame * F, sheet.row.get(anim.row) * F, F, F, -16 * S, -31.5 * S, 32 * S, 32 * S);
}

const MODES = {
  // [first nap after (s), cooldown between naps (s), nap length (s)]
  boxes: { first: [9, 14], cool: [16, 26], nap: [22, 34] },
  chaos: { first: [3, 5], cool: [5, 9], nap: [60, 90] },
};

const rand = (a, b) => a + Math.random() * (b - a);

export class Cat {
  /**
   * world: {
   *   floor(): {x0,x1,y0,y1}  walkable band (css px)
   *   napSpots(): [{box, x, y, px, py, size}]  free 2×2 spots, px/py = spot centre
   *   block(spot) / unblock(spot)
   *   spawn(kind, x, y)       particles ("z", "heart", "puff")
   *   busy()                   true while the player is dragging (he waits)
   * }
   */
  constructor(sheet, mode, world) {
    this.sheet = sheet;
    this.mode = mode;
    this.world = world;
    this.S = 3;
    const fl = world.floor();
    this.facing = Math.random() < 0.5 ? 1 : -1;
    this.x = this.facing > 0 ? fl.x0 - 60 : fl.x1 + 60;
    this.y = rand(fl.y0, fl.y1);
    this.state = "enter";
    this.anim = "walk";
    this.t = 0;
    this.timer = 0;
    this.target = { x: rand(fl.x0 + 40, fl.x1 - 40), y: rand(fl.y0, fl.y1) };
    const m = MODES[mode];
    this.napIn = m ? rand(...m.first) : Infinity;
    this.spot = null;
    this.hop = null;
    this.zT = 0;
    this.speed = 70;
  }

  setScale(C) {
    // the sleeping loaf is 23px wide; make it fill a 3×2 spot
    this.base = Math.max(1.6, (2.9 * C) / 23);
    this.S = this.base;
  }

  /** Perspective: smaller near the wall, full size by the boxes. */
  get depth() {
    return this.napping || (this.state === "hop" && this.hop?.next === "settle") ? 1 : this.world.depth(this.y);
  }

  play(anim) {
    if (this.anim !== anim) {
      this.anim = anim;
      this.t = 0;
    }
  }

  get frame() {
    const a = CAT_ANIM[this.anim];
    const f = Math.floor(this.t * a.fps);
    return a.once ? Math.min(f, a.n - 1) : f % a.n;
  }

  get animDone() {
    const a = CAT_ANIM[this.anim];
    return a.once && this.t * a.fps >= a.n;
  }

  get napping() {
    return this.state === "nap" || this.state === "settle";
  }

  update(dt) {
    this.t += dt;
    this.timer -= dt;
    this.S = this.base * this.depth;
    this.speed = 26 * this.S;
    if (this.mode && MODES[this.mode] && !this.spot && this.state !== "hop") this.napIn -= dt;

    switch (this.state) {
      case "enter":
      case "wander":
        if (this.walkTo(this.target, dt)) {
          this.state = "rest";
          const r = Math.random();
          this.play(r < 0.3 ? "sitDown" : r < 0.55 ? "groom" : r < 0.75 ? "look" : "idle");
          this.timer = rand(2.5, 5.5);
        }
        break;
      case "rest":
        if (this.anim === "sitDown" && this.animDone) this.play("sit");
        if (this.anim === "look" && this.animDone) this.play("idle");
        if (this.napIn <= 0 && !this.world.busy() && this.tryNap()) break;
        if (this.timer <= 0) this.wander();
        break;
      case "toBox":
        if (!this.spotStillFree()) {
          this.spot = null;
          this.napIn = rand(3, 6);
          this.wander();
          break;
        }
        if (this.walkTo(this.approach, dt)) {
          this.world.block(this.spot);
          this.startHop(this.spot.px, this.spot.py + this.S * 4.5, "settle");
        }
        break;
      case "hop":
        this.hop.t += dt;
        {
          const k = Math.min(1, this.hop.t / this.hop.dur);
          this.x = this.hop.x0 + (this.hop.x1 - this.hop.x0) * k;
          this.y = this.hop.y0 + (this.hop.y1 - this.hop.y0) * k - Math.sin(k * Math.PI) * this.hop.h;
          this.anim = k < 0.5 ? "leap" : "land";
          this.t = k < 0.5 ? k * 0.8 : (k - 0.5) * 0.6;
          if (k >= 1) {
            this.world.spawn("puff", this.x, this.y);
            this.state = this.hop.next;
            if (this.state === "settle") this.play("lieDown");
            else {
              this.play("idle");
              this.timer = 0.4;
            }
          }
        }
        break;
      case "settle":
        if (this.animDone) {
          this.state = "nap";
          this.play("sleep");
          this.timer = rand(...MODES[this.mode].nap);
        }
        break;
      case "nap":
        this.zT -= dt;
        if (this.zT <= 0) {
          this.zT = 1.4;
          this.world.spawn("z", this.x + this.facing * this.S * 8, this.y - this.S * 11);
        }
        if (this.timer <= 0) this.wakeUp(false);
        break;
      case "stretch":
        if (this.animDone) this.leaveBox();
        break;
      case "happy":
        if (this.timer <= 0) this.wander();
        break;
      case "flee":
        if (this.walkTo(this.target, dt, 2.2)) {
          this.state = "rest";
          this.play("sitDown");
          this.timer = rand(2, 4);
        }
        break;
    }
  }

  walkTo(p, dt, speedMul = 1) {
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) return true;
    const v = this.speed * speedMul * dt;
    this.x += (dx / d) * Math.min(v, d);
    this.y += (dy / d) * Math.min(v, d);
    if (Math.abs(dx) > 2) this.facing = dx > 0 ? 1 : -1;
    this.play(speedMul > 1.5 ? "run" : "walk");
    return false;
  }

  wander() {
    const fl = this.world.floor();
    this.target = { x: rand(fl.x0 + 30, fl.x1 - 30), y: rand(fl.y0, fl.y1) };
    this.state = "wander";
  }

  tryNap() {
    const spots = this.world.napSpots();
    if (!spots.length) {
      this.napIn = rand(4, 8);
      return false;
    }
    // prefer the nearest few, with a little randomness
    spots.sort((a, b) => Math.hypot(a.px - this.x, a.py - this.y) - Math.hypot(b.px - this.x, b.py - this.y));
    this.spot = spots[Math.floor(Math.random() * Math.min(3, spots.length))];
    this.approach = this.world.approach(this.spot);
    this.state = "toBox";
    return true;
  }

  spotStillFree() {
    return this.world.napSpots().some((s) => s.box === this.spot.box && s.x === this.spot.x && s.y === this.spot.y);
  }

  startHop(x1, y1, next) {
    this.facing = x1 >= this.x ? 1 : -1;
    this.hop = { x0: this.x, y0: this.y, x1, y1, t: 0, dur: 0.5, h: this.S * 22, next };
    this.state = "hop";
  }

  wakeUp(shooed) {
    if (shooed) {
      audio.pick(["grumble1", "grumble2", "grumble3", "grumble4"], { vol: 0.7 });
      this.leaveBox(true);
    } else {
      this.state = "stretch";
      this.play("stretch");
      audio.play("stretch", { vol: 0.55 });
    }
  }

  leaveBox(fast = false) {
    const fl = this.world.floor();
    const spot = this.spot;
    this.world.unblock(spot);
    this.spot = null;
    const m = MODES[this.mode];
    this.napIn = m ? rand(...m.cool) * (fast ? 1.2 : 1) : Infinity;
    const dir = this.x < (fl.x0 + fl.x1) / 2 ? -1 : 1;
    const out = this.world.approach(spot);
    const landX = Math.max(fl.x0, Math.min(fl.x1, out.x + dir * this.S * 10));
    this.startHop(landX, out.y, "rest");
    if (fast) {
      this.target = { x: dir < 0 ? fl.x0 + 20 : fl.x1 - 20, y: rand(fl.y0, fl.y1) };
      this.hop.next = "flee";
    }
  }

  /** Tap on the cat. Returns true if it was handled. */
  tap() {
    if (this.state === "nap" || this.state === "settle") {
      this.world.spawn("puff", this.x, this.y - this.S * 8);
      this.wakeUp(true);
      return true;
    }
    if (this.state === "hop" || this.state === "stretch" || this.state === "flee") return true;
    // a pet — also distracts him from whatever box he was heading for
    if (this.spot) {
      this.world.unblock(this.spot);
      this.spot = null;
      const m = MODES[this.mode];
      if (m) this.napIn = rand(...m.cool);
    }
    this.state = "happy";
    this.play("happy");
    this.timer = 2.4;
    audio.pick(["happy1", "happy2", "happy3"], { vol: 0.6 });
    for (let i = 0; i < 3; i++) this.world.spawn("heart", this.x + (i - 1) * this.S * 5, this.y - this.S * 17 - i * 6);
    return true;
  }

  /** Get out of whatever box you're in or headed for, right now. */
  evict(grumble = false) {
    if (!this.spot) return;
    if (this.napping || this.state === "stretch") {
      if (grumble) audio.pick(["grumble1", "grumble2", "grumble3", "grumble4"], { vol: 0.6 });
      this.leaveBox(grumble);
    } else {
      this.world.unblock(this.spot);
      this.spot = null;
      if (this.state === "hop") this.hop.next = "rest";
      else if (this.state === "toBox") this.wander();
    }
  }

  /** Called when the room is finished: out of the box, sit and watch. */
  retire() {
    this.evict(false);
    if (this.state === "hop") this.hop.next = "rest";
    this.mode = null;
    this.napIn = Infinity;
  }

  hit(px, py) {
    const S = this.S;
    return Math.abs(px - this.x) < 12 * S && py < this.y + 3 * S && py > this.y - 17 * S;
  }

  draw(ctx) {
    const S = this.S;
    const a = CAT_ANIM[this.anim];
    if (this.state !== "hop" && !this.napping) {
      ctx.fillStyle = "rgba(30,15,5,0.22)";
      ctx.beginPath();
      ctx.ellipse(this.x, this.y + S, 10 * S, 2.4 * S, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(Math.round(this.x), Math.round(this.y));
    if (this.facing < 0) ctx.scale(-1, 1);
    drawCatFrame(ctx, this.sheet, a, this.frame, S);
    ctx.restore();
  }
}
