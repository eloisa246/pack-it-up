import { useEffect, useRef, useState } from "react";
import { LEVELS } from "./data/levels.js";
import { paintRoom, FONT_MARKER } from "./draw.js";
import { loadCatSheet, loadCarrier } from "./assets.js";
import { CAT_ANIM, drawCatFrame } from "./cat.js";
import { audio, TRACKS } from "./audio.js";

// Moving day. The empty apartment, every box you packed stacked by the door,
// and one last thing to put in its carrier.
const LINES = [
  { at: 1.2, text: "Everything's in boxes." },
  { at: 4.6, text: "The apartment echoes now." },
  { at: 8.2, text: (n) => `${n} boxes. Every one of them yours.` },
  { at: 12.6, text: "And one very unimpressed cat." },
];

export function Ending({ save, onDone }) {
  const ref = useRef(null);
  const [t, setT] = useState(0);
  const total = LEVELS.reduce((s, l) => s + (save.levels[l.id]?.bestBoxes || l.boxes.length), 0);

  useEffect(() => {
    audio.setMusic(TRACKS.title);
    let raf, size, alive = true;
    Promise.all([loadCatSheet(), loadCarrier()]).then(([sheet, carrier]) => {
      if (!alive) return;
      const cv = ref.current;
      const ctx = cv.getContext("2d");
      const cb = alphaBox(carrier);
      let W = 0, H = 0, bg = null, dpr = 1;
      size = () => {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = cv.clientWidth;
        H = cv.clientHeight;
        cv.width = W * dpr;
        cv.height = H * dpr;
        bg = paintRoom("living", W, H, H * 0.46, null);
      };
      size();
      window.addEventListener("resize", size);
      const boxes = stackBoxes(total);
      const t0 = performance.now();
      let lastT = 0;
      const loop = (now) => {
        const T = (now - t0) / 1000;
        if (Math.floor(T * 4) !== Math.floor(lastT * 4)) setT(T);
        lastT = T;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bg, 0, 0, bg.width * 3, bg.height * 3);

        const floorY = H * 0.8;
        const unit = Math.min(W / 11, H / 9);
        // the stack of boxes
        for (const b of boxes) drawClosedBox(ctx, W * 0.08 + b.col * unit * 1.08, floorY - (b.row + 1) * unit * 0.86, unit, unit * 0.86, b.label, b.tilt);

        // carrier by the door
        const cw = unit * 2.3, ch = cw * (cb.h / cb.w);
        const cx = W * 0.78, cy = floorY - ch;
        const S = unit / 13;
        const cat = catAt(T, W, floorY, cx + cw * 0.35, S);
        const behind = cat.x > cx - cw * 0.1;
        if (behind) drawCat(ctx, sheet, cat, S);
        ctx.fillStyle = "rgba(30,15,5,0.25)";
        ctx.beginPath();
        ctx.ellipse(cx + cw / 2, floorY, cw * 0.48, unit * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        const wig = T > 12.2 && T < 13.2 ? Math.sin(T * 40) * 0.03 : 0;
        ctx.save();
        ctx.translate(cx + cw / 2, floorY);
        ctx.rotate(wig);
        ctx.drawImage(carrier, cb.x, cb.y, cb.w, cb.h, -cw / 2, -ch, cw, ch);
        ctx.restore();
        if (!behind) drawCat(ctx, sheet, cat, S);

        // morning light fading up
        const k = Math.min(1, T / 16);
        ctx.fillStyle = `rgba(255,240,205,${0.1 * k})`;
        ctx.fillRect(0, 0, W, H);
        if (alive) raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      if (size) window.removeEventListener("resize", size);
    };
  }, [total]);

  const showCredits = t > 16;
  return (
    <div className="screen ending" onClick={() => showCredits && onDone()}>
      <canvas ref={ref} className="ending-canvas" />
      <div className="ending-lines">
        {LINES.map((l, i) => (
          <p key={i} className={`ending-line ${t >= l.at ? "in" : ""} ${showCredits ? "out" : ""}`}>
            {typeof l.text === "function" ? l.text(total) : l.text}
          </p>
        ))}
      </div>
      {showCredits && (
        <div className="credits">
          <h1>Pack It Up</h1>
          <p>Thanks for playing.</p>
          <p className="dedication">For Stretchy, who hated every box he wasn't sitting in.</p>
          <button className="btn big" onClick={onDone}>Back to the start</button>
        </div>
      )}
    </div>
  );
}

/** Where the cat is at time T: walks in, sits and looks at you, then goes in. */
function catAt(T, W, floorY, doorX, S) {
  const startX = -20 * S, midX = W * 0.45;
  if (T < 2) return { x: startX, y: floorY, anim: "walk", f: T, dir: 1, a: 0 };
  if (T < 6.5) {
    const k = Math.min(1, (T - 2) / 4.2);
    return { x: startX + (midX - startX) * k, y: floorY, anim: k < 1 ? "walk" : "sit", f: T, dir: 1, a: 1 };
  }
  if (T < 9.5) return { x: midX, y: floorY, anim: T < 7.2 ? "sitDown" : "happy", f: T - 6.5, dir: 1, a: 1 };
  if (T < 12) {
    const k = (T - 9.5) / 2.5;
    return { x: midX + (doorX - midX) * k, y: floorY, anim: "walk", f: T, dir: 1, a: 1 };
  }
  return { x: doorX, y: floorY, anim: "walk", f: T, dir: 1, a: Math.max(0, 1 - (T - 12) * 2.5) };
}

function drawCat(ctx, sheet, c, S) {
  if (c.a <= 0) return;
  const a = CAT_ANIM[c.anim];
  const fr = a.once ? Math.min(a.n - 1, Math.floor(c.f * a.fps)) : Math.floor(c.f * a.fps) % a.n;
  ctx.save();
  ctx.globalAlpha = c.a;
  ctx.translate(c.x, c.y);
  if (c.dir < 0) ctx.scale(-1, 1);
  drawCatFrame(ctx, sheet, a, fr, S);
  ctx.restore();
}

function stackBoxes(n) {
  const labels = [...new Set(LEVELS.flatMap((l) => l.boxes.map((b) => b.label)))];
  const out = [];
  const cols = Math.min(6, Math.max(3, Math.ceil(n / 4)));
  for (let i = 0; i < Math.min(n, cols * 5); i++) {
    const col = i % cols, row = Math.floor(i / cols);
    out.push({ col, row, label: labels[(i * 7) % labels.length], tilt: ((i * 37) % 7 - 3) * 0.006 });
  }
  return out;
}

function drawClosedBox(ctx, x, y, w, h, label, tilt) {
  ctx.save();
  ctx.translate(x + w / 2, y + h);
  ctx.rotate(tilt);
  ctx.translate(-w / 2, -h);
  ctx.fillStyle = "rgba(30,15,5,0.25)";
  ctx.fillRect(4, h - 3, w, 5);
  ctx.fillStyle = "#c6915a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d8a86e";
  ctx.fillRect(0, 0, w, h * 0.14);
  ctx.fillStyle = "rgba(90,50,20,0.35)";
  ctx.fillRect(0, h * 0.14, w, 2);
  ctx.fillRect(0, 0, 2, h);
  ctx.fillStyle = "rgba(210,185,135,0.95)";
  ctx.fillRect(w * 0.44, 0, w * 0.12, h * 0.42);
  const fs = Math.max(8, w * 0.16);
  ctx.font = `${fs}px ${FONT_MARKER}`;
  ctx.fillStyle = "#2b2622";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h * 0.68, w * 0.9);
  ctx.restore();
}

/** Opaque bounding box of an image (sprites sit inside transparent padding). */
function alphaBox(img) {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const x = c.getContext("2d");
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
  for (let y = 0; y < c.height; y++)
    for (let i = 0; i < c.width; i++)
      if (d[(y * c.width + i) * 4 + 3] > 40) {
        x0 = Math.min(x0, i);
        x1 = Math.max(x1, i);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return x1 >= x0 ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : { x: 0, y: 0, w: c.width, h: c.height };
}
