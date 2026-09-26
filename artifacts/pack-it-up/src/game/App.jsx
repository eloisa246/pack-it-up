import { useCallback, useEffect, useRef, useState } from "react";
import { LEVELS } from "./data/levels.js";
import { Play } from "./play.js";
import { loadSprites, loadCatSheet, loadSplash } from "./assets.js";
import { levelItems } from "./data/build.js";
import { audio, TRACKS } from "./audio.js";
import { loadSave, writeSave, recordLevel, recordDaily, dailyStreak } from "./save.js";
import { dailyLevel, todayKey } from "./daily.js";
import { Ending } from "./Ending.jsx";
import { CAT_ANIM, MOOD_LOW, drawCatFrame } from "./cat.js";

const TEACH = {
  drag: { icon: "✋", text: "Drag things into the box. Everything has to fit." },
  rotate: { icon: "↻", text: "Tap anything to turn it. While dragging: R, right-click, the scroll wheel, or a second finger." },
  boxes: { icon: "▦", text: "More than one box. Use whichever you like." },
  par: { icon: "★", text: "There's a spare box. Pros won't need it — can you fit it all in two?" },
  cat: { icon: "🐈", text: "Stretchy naps in any open space big enough for a cat. Tap him to shoo him out." },
  tight: { icon: "▣", text: "No wiggle room: every single square gets filled. Work out where the odd shapes go first." },
  weight: { icon: "⚖", text: "Each box can only hold so much weight. Watch the meter under it." },
  layers: { icon: "⧉", text: "Deep boxes hold two layers. Stack on a flat, even surface — then keep packing on top." },
  mood: { icon: "♡", text: "Stretchy wants attention. Watch his mood — pet him or toss him a toy before it runs out, or he'll make trouble." },
  fragile: { icon: "🍷", text: "Fragile things can't touch heavy things. Pad them with something light." },
  stackweight: { icon: "⚖", text: "Stacking saves space, not weight. Both layers count toward a box's limit." },
  crush: { icon: "⧉", text: "Glass can ride on top of a bottle. A bottle can't ride on glass." },
  keep: { icon: "♥", text: "It won't all fit. Pack what matters most (♥), then seal the boxes. The rest gets donated." },
  awkward: { icon: "🎸", text: "Big, awkward shapes. Place those first — the small things will find a gap." },
  keepsakes: { icon: "♥", text: "Choose what to keep, with every rule in play. The best haul is hard to find." },
  finale: { icon: "🐾", text: "Everything at once — and Stretchy at his worst. Keep him happy." },
};

// the daily box mixes every rule, so it opens once they've all been introduced
const DAILY_AFTER = "cookware";

const ROOM_NAMES = { bathroom: "Bathroom", kitchen: "Kitchen", bedroom: "Bedroom", living: "Living room", office: "Office", dining: "Dining room", hall: "Hallway" };

export default function App() {
  const [save, setSave] = useState(() => {
    const s = loadSave();
    audio.musicOn = s.settings.music;
    audio.sfxOn = s.settings.sfx;
    return s;
  });
  const [screen, setScreen] = useState({ name: "title" });

  useSafeAreaVars();

  useEffect(() => {
    audio.sfxOn = save.settings.sfx;
    audio.setMusicOn(save.settings.music);
  }, [save.settings.sfx, save.settings.music]);

  useEffect(() => writeSave(save), [save]);

  // first touch anywhere unlocks audio (iOS requires a gesture)
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener("pointerdown", unlock, { capture: true });
    return () => window.removeEventListener("pointerdown", unlock, { capture: true });
  }, []);

  const toggle = (key) => setSave((s) => ({ ...s, settings: { ...s.settings, [key]: !s.settings[key] } }));
  const nextIndex = LEVELS.findIndex((l) => !save.levels[l.id]?.done);

  const go = useCallback((name, extra = {}) => {
    audio.click();
    setScreen({ name, ...extra });
  }, []);

  if (screen.name === "title")
    return (
      <Title
        started={nextIndex !== 0}
        finished={nextIndex === -1}
        settings={save.settings}
        onToggle={toggle}
        onPlay={() => go("play", { index: nextIndex === -1 ? 0 : nextIndex })}
        onRooms={() => go("rooms")}
        daily={{ open: !!save.levels[DAILY_AFTER]?.done, done: !!save.daily?.[todayKey()]?.done, streak: dailyStreak(save) }}
        onDaily={() => go("daily", { key: todayKey() })}
      />
    );
  if (screen.name === "daily")
    return (
      <DailyScreen
        key={`${screen.key}-${screen.nonce || 0}`}
        dateKey={screen.key}
        save={save}
        settings={save.settings}
        onToggle={toggle}
        onSolved={(stats) => setSave((s) => recordDaily(s, screen.key, stats))}
        onBack={() => go("title")}
        onReplay={() => go("daily", { key: screen.key, nonce: (screen.nonce || 0) + 1 })}
      />
    );
  if (screen.name === "rooms")
    return <Rooms save={save} onPick={(index) => go("play", { index })} onBack={() => go("title")} onEnding={() => go("ending")} />;
  if (screen.name === "ending")
    return <Ending save={save} onDone={() => go("title")} />;
  return (
    <PlayScreen
      key={`${screen.index}-${screen.nonce || 0}`}
      level={LEVELS[screen.index]}
      num={`Room ${screen.index + 1}`}
      kicker={`Room ${screen.index + 1} of ${LEVELS.length} · ${ROOM_NAMES[LEVELS[screen.index].room]}`}
      nextLabel={screen.index === LEVELS.length - 1 ? "Moving day →" : "Next room →"}
      save={save}
      settings={save.settings}
      onToggle={toggle}
      onSolved={(stats) => setSave((s) => recordLevel(s, LEVELS[screen.index].id, stats))}
      onRooms={() => go("rooms")}
      onNext={() => (screen.index + 1 < LEVELS.length ? go("play", { index: screen.index + 1 }) : go("ending"))}
      onReplay={() => go("play", { index: screen.index, nonce: (screen.nonce || 0) + 1 })}
    />
  );
}

// ── title ────────────────────────────────────────────────────────────────────

function Title({ started, finished, settings, onToggle, onPlay, onRooms, daily, onDaily }) {
  const logoRef = useRef(null);
  const catRef = useRef(null);

  useEffect(() => {
    audio.setMusic(TRACKS.title);
    let raf, alive = true;
    Promise.all([loadSplash(), loadCatSheet()]).then(([splash, sheet]) => {
      if (!alive) return;
      const lc = logoRef.current;
      const lctx = lc.getContext("2d");
      lc.width = 480;
      lc.height = 410;
      lctx.drawImage(splash, 184, 462, 480, 410, 0, 0, 480, 410);
      // the splash has a black backdrop; fade near-black to transparent
      const px = lctx.getImageData(0, 0, 480, 410);
      const d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const m = Math.max(d[i], d[i + 1], d[i + 2]);
        if (m < 28) d[i + 3] = Math.max(0, Math.round(((m - 14) / 14) * 255));
      }
      lctx.putImageData(px, 0, 0);
      // Stretchy pacing under the logo
      const cc = catRef.current;
      const cctx = cc.getContext("2d");
      let x = -40, dir = 1, t = 0, pause = 0, last = performance.now();
      const loop = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        t += dt;
        const W = (cc.width = cc.clientWidth * 2), H = (cc.height = cc.clientHeight * 2);
        cctx.imageSmoothingEnabled = false;
        const S = H / 32;
        let anim = CAT_ANIM.walk;
        if (pause > 0) {
          pause -= dt;
          anim = CAT_ANIM.sit;
        } else {
          x += dir * S * 22 * dt;
          if (x > W - 30 && dir > 0) { dir = -1; pause = 2.5; }
          if (x < 30 && dir < 0) { dir = 1; pause = 2.5; }
          if (Math.abs(x - W / 2) < 2 && Math.random() < 0.004) pause = 3;
        }
        const f = Math.floor(t * anim.fps) % anim.n;
        cctx.save();
        cctx.translate(x, H);
        if (dir < 0) cctx.scale(-1, 1);
        drawCatFrame(cctx, sheet, anim, f, S);
        cctx.restore();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="screen title">
      <div className="title-inner">
        <canvas ref={logoRef} className="logo" aria-label="Pack It Up" />
        <p className="tagline">a cozy packing puzzle about leaving home</p>
        <canvas ref={catRef} className="title-cat" aria-hidden />
        <div className="title-buttons">
          <button className="btn big" onClick={onPlay}>
            {finished ? "Play again" : started ? "Continue" : "Start packing"}
          </button>
          {started && (
            <button className="btn" onClick={onRooms}>
              Rooms
            </button>
          )}
          {started && daily.open && (
            <button className="btn daily-btn" onClick={onDaily}>
              {daily.done ? "✓ " : ""}Daily box
              {daily.streak > 1 && <span className="streak">🔥 {daily.streak}</span>}
            </button>
          )}
        </div>
        <div className="toggles">
          <button className={`chip ${settings.music ? "on" : ""}`} onClick={() => onToggle("music")}>♪ Music</button>
          <button className={`chip ${settings.sfx ? "on" : ""}`} onClick={() => onToggle("sfx")}>◉ Sound</button>
        </div>
      </div>
    </div>
  );
}

// ── rooms ────────────────────────────────────────────────────────────────────

function Rooms({ save, onPick, onBack, onEnding }) {
  const allDone = LEVELS.every((l) => save.levels[l.id]?.done);
  return (
    <div className="screen rooms">
      <header className="rooms-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back">‹</button>
        <h1>Rooms</h1>
        <span className="rooms-count">
          {LEVELS.filter((l) => save.levels[l.id]?.done).length}/{LEVELS.length}
        </span>
      </header>
      <div className="room-grid">
        {LEVELS.map((l, i) => {
          const rec = save.levels[l.id];
          const open = i === 0 || save.levels[LEVELS[i - 1].id]?.done;
          return (
            <button key={l.id} className={`room-card ${rec?.done ? "done" : ""} ${open ? "" : "locked"}`} disabled={!open} onClick={() => onPick(i)}>
              <span className="room-num">{i + 1}</span>
              <span className="room-title">{open ? l.title : "? ? ?"}</span>
              <span className="room-where">{ROOM_NAMES[l.room]}</span>
              {rec?.done && <span className="room-stamp">PACKED</span>}
              {rec?.pro && <span className="room-star" title="Pro packer">★</span>}
            </button>
          );
        })}
        {allDone && (
          <button className="room-card ending-card" onClick={onEnding}>
            <span className="room-title">Moving day</span>
            <span className="room-where">the end</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ── play ─────────────────────────────────────────────────────────────────────

/** The daily box: generated from the date (takes a moment, so it's built after first paint). */
function DailyScreen({ dateKey, onBack, ...rest }) {
  const [level, setLevel] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => setLevel(dailyLevel(dateKey) || false), 30);
    return () => clearTimeout(t);
  }, [dateKey]);
  if (!level)
    return (
      <div className="screen rooms">
        <p className="loading">{level === false ? "No box today. Try again tomorrow!" : "Taping up today's box…"}</p>
        {level === false && <button className="btn" onClick={onBack}>Back</button>}
      </div>
    );
  const d = new Date(dateKey + "T12:00:00");
  const when = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return (
    <PlayScreen
      level={level}
      num="Daily box"
      kicker={`Daily box · ${when}`}
      nextLabel="Done"
      onRooms={onBack}
      onNext={onBack}
      {...rest}
    />
  );
}

function PlayScreen({ level, num, kicker, nextLabel, save, settings, onToggle, onSolved, onRooms, onNext, onReplay }) {
  const canvasRef = useRef(null);
  const playRef = useRef(null);
  const [hud, setHud] = useState({ canUndo: false, placed: 0, total: 0, used: 0, boxes: level.boxes.length, par: level.boxes.length });
  const [intro, setIntro] = useState(true);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [memory, setMemory] = useState(null);
  const [result, setResult] = useState(null);
  const [mood, setMood] = useState(null);
  const toastTimer = useRef(0);
  const memTimer = useRef(0);

  const showToast = useCallback((t) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), t.kind === "hint" ? 3800 : 4200);
  }, []);

  useEffect(() => {
    audio.setMusic(TRACKS[level.music] || TRACKS.spaghetti);
    let alive = true;
    const files = levelItems(level).map((it) => it.file);
    Promise.all([loadSprites(files), loadCatSheet(), loadFonts()]).then(([sprites, catSheet]) => {
      if (!alive) return;
      playRef.current = new Play(canvasRef.current, level, {
        sprites,
        catSheet,
        onEvent: (type, data) => {
          if (type === "state") setHud(data);
          else if (type === "toast") showToast(data);
          else if (type === "mood") setMood(data);
          else if (type === "memory") {
            setToast(null);
            setMemory(data);
            audio.duck(true);
            clearTimeout(memTimer.current);
            memTimer.current = setTimeout(() => {
              setMemory(null);
              audio.duck(false);
            }, 5200);
          } else if (type === "solved") {
            onSolved(data);
            setResult(data);
          }
        },
      });
      playRef.current.paused = true;
      if (new URLSearchParams(location.search).has("debug")) window.__play = playRef.current; // test hook
      setReady(true);
    });
    const onResize = () => playRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      window.removeEventListener("resize", onResize);
      clearTimeout(toastTimer.current);
      clearTimeout(memTimer.current);
      audio.duck(false);
      playRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const begin = () => {
    if (!ready) return;
    audio.unlock();
    audio.play("room", { vol: 0.5 });
    setIntro(false);
    playRef.current.begin();
  };

  const teach = level.note ? { icon: "📦", text: level.note } : level.teach && TEACH[level.teach];
  const proGoal = hud.par < hud.boxes;

  return (
    <div className={`screen play ${mood != null && !result ? "with-mood" : ""}`}>
      <canvas ref={canvasRef} className="play-canvas" />

      <header className="hud">
        <button className="icon-btn" onClick={onRooms} aria-label="Rooms">☰</button>
        <div className="hud-title">
          <span className="hud-num">{num}</span>
          <span className="hud-name">{level.title}</span>
          <span className="hud-sub">
            {hud.keep
              ? `♥ ${hud.keep.value} of ${hud.keep.target} · best ${hud.keep.best}`
              : `${hud.placed}/${hud.total} packed${proGoal ? ` · pro: ${hud.par} boxes` : ""}`}
          </span>
        </div>
        <div className="hud-actions">
          <button className="icon-btn" disabled={!hud.canUndo} onClick={() => playRef.current?.undo()} aria-label="Undo">↶</button>
          <button className="icon-btn" disabled={!hud.placed || !!result} onClick={() => playRef.current?.restart()} aria-label="Restart room">⟲</button>
          <button className="icon-btn" disabled={!!result} onClick={() => playRef.current?.hint()} aria-label="Hint">?</button>
          <button className={`icon-btn ${settings.music ? "" : "off"}`} onClick={() => onToggle("music")} aria-label="Music">♪</button>
        </div>
      </header>

      {mood != null && !result && (
        <div className={`mood ${mood < MOOD_LOW ? "low" : ""}`} aria-label={`Stretchy's mood ${Math.round(mood * 100)}%`}>
          <span className="mood-face">{mood >= 0.6 ? "😺" : mood >= MOOD_LOW ? "🐱" : "😾"}</span>
          <span className="mood-bar">
            <span style={{ width: `${Math.round(mood * 100)}%` }} />
          </span>
        </div>
      )}

      {hud.canSeal && !result && (
        <button className="btn big seal-btn" onClick={() => playRef.current?.seal()}>
          Seal the boxes ✓
        </button>
      )}

      {toast && (
        <div className={`toast ${toast.kind}`} role="status">
          {toast.text}
        </div>
      )}

      {memory && (
        <div className="memory" role="status">
          <span className="memory-name">{memory.name}</span>
          <p>{memory.text}</p>
        </div>
      )}

      {intro && (
        <div className="overlay" onClick={begin}>
          <div className="card intro-card">
            <span className="card-kicker">{kicker}</span>
            <h2>{level.title}</h2>
            <p className="intro-text">{level.intro}</p>
            {teach && (
              <div className="teach">
                <span className="teach-icon">{teach.icon}</span>
                <span>{teach.text}</span>
              </div>
            )}
            <button className="btn big" onClick={begin} disabled={!ready}>
              {ready ? "Start" : "Unpacking…"}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className="overlay soft">
          <div className="card result-card">
            <span className="result-stamp">PACKED</span>
            <h2>{level.title}</h2>
            <dl className="stats">
              {result.keep ? (
                <div>
                  <dt>Kept</dt>
                  <dd>♥ {result.keep.value}</dd>
                </div>
              ) : (
                <div>
                  <dt>Boxes</dt>
                  <dd>
                    {result.boxes} of {result.total}
                  </dd>
                </div>
              )}
              <div>
                <dt>Time</dt>
                <dd>{fmtTime(result.ms)}</dd>
              </div>
            </dl>
            {result.keep ? (
              <>
                {result.keep.donated > 0 && (
                  <p className="donated">
                    {result.keep.donated} {result.keep.donated === 1 ? "thing" : "things"} went to the donation pile.
                  </p>
                )}
                {result.pro ? (
                  <p className="pro yes">★ Pro packer — the best haul there is.</p>
                ) : (
                  <p className="pro no">A pro could keep ♥ {result.keep.best}.</p>
                )}
              </>
            ) : result.pro ? (
              <p className="pro yes">★ Pro packer — only {result.boxes} {result.boxes === 1 ? "box" : "boxes"}.</p>
            ) : result.par < result.total ? (
              <p className="pro no">A pro could fit this in {result.par}.</p>
            ) : null}
            <div className="result-buttons">
              <button className="btn" onClick={onReplay}>Replay</button>
              <button className="btn big" onClick={onNext}>{nextLabel}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Canvas text needs its fonts loaded up front; give up after 2.5 s and use fallbacks. */
function loadFonts() {
  if (!document.fonts?.load) return Promise.resolve();
  const want = ["20px 'Permanent Marker'", "600 20px 'Pixelify Sans'", "700 20px 'Pixelify Sans'"];
  return Promise.race([
    Promise.all(want.map((f) => document.fonts.load(f).catch(() => null))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
}

function fmtTime(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Expose the device's safe-area insets as px custom properties the canvas can read. */
function useSafeAreaVars() {
  useEffect(() => {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const apply = () => {
      const cs = getComputedStyle(probe);
      document.documentElement.style.setProperty("--sat", cs.paddingTop);
      document.documentElement.style.setProperty("--sab", cs.paddingBottom);
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      probe.remove();
    };
  }, []);
}
