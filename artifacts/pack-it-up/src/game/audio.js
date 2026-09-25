// Sound. Effects run through Web Audio (sampled one-shots from /public plus a
// few synthesized ones); music streams through a plain <audio> element so the
// 3–7 MB tracks never have to be fully decoded into memory.
const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

const SAMPLES = {
  stamp: "sfx/ui/stamp_01.mp3",
  chime: "sfx/ui/sell_chime.mp3",
  room: "sfx/ui/room_switch_01.mp3",
  pack: "sfx/ui/packing_noise_01.mp3",
  flap: "sfx/containers/cabinet_close_01.mp3",
  happy1: "sfx/cat/stretchy_happy_content_meow_01.mp3",
  happy2: "sfx/cat/stretchy_happy_content_meow_02.mp3",
  happy3: "sfx/cat/stretchy_happy_content_meow_03.mp3",
  stretch: "sfx/cat/stretchy_happy_content_stretch_04.mp3",
  grumble1: "sfx/cat/stretchy_stressed_meow_01.mp3",
  grumble2: "sfx/cat/stretchy_stressed_meow_02.mp3",
  grumble3: "sfx/cat/stretchy_stressed_meow_03.mp3",
  grumble4: "sfx/cat/stretchy_stressed_meow_04.mp3",
  plead1: "sfx/cat/stretchy_desperate_meow_01.mp3",
  plead2: "sfx/cat/stretchy_desperate_meow_03.mp3",
};

export const TRACKS = {
  title: "music/main_cherry_blossom.mp3",
  play: ["music/library_spaghetti_on_the_island.mp3", "music/library_dry.mp3", "music/library_the_night_train.mp3"],
};

class Audio {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.sfxOn = true;
    this.musicOn = true;
    this.music = null;
    this.musicWant = null;
    this.musicVol = 0.32;
  }

  /** Must run inside a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      for (const name of Object.keys(SAMPLES)) this.load(name);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.musicWant && this.music?.paused && this.musicOn) this.music.play().catch(() => {});
  }

  async load(name) {
    try {
      const res = await fetch(BASE + SAMPLES[name]);
      const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
      this.buffers.set(name, buf);
    } catch {
      /* missing sample — that sound just stays silent */
    }
  }

  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    if (!this.sfxOn || !this.ctx) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(this.ctx.currentTime + delay);
  }

  pick(names, opts) {
    this.play(names[(Math.random() * names.length) | 0], opts);
  }

  // ── synthesized effects ────────────────────────────────────────────────────

  _osc(type, f0, f1, dur, vol, delay = 0) {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, { vol = 0.3, type = "bandpass", f0 = 1200, f1 = f0, q = 1, delay = 0, flutter = 0 } = {}) {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = flutter ? 0.6 + 0.4 * Math.sin(i / (this.ctx.sampleRate / flutter)) : 1;
      d[i] = (Math.random() * 2 - 1) * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  pickup() {
    this._osc("sine", 520, 880, 0.07, 0.12);
    this._noise(0.05, { vol: 0.08, f0: 3000, q: 0.8 });
  }
  /** Cardboard thud; bigger things land lower. */
  thud(cells = 2) {
    const f = 150 / Math.sqrt(Math.max(1, cells) / 2);
    this._osc("sine", f * 1.6, f * 0.7, 0.16, 0.35);
    this._noise(0.09, { vol: 0.22, type: "lowpass", f0: 900, f1: 200 });
  }
  turn() {
    this._noise(0.06, { vol: 0.12, f0: 2400, f1: 4200, q: 2 });
    this._osc("triangle", 700, 1050, 0.05, 0.05);
  }
  bonk() {
    this._osc("triangle", 240, 170, 0.12, 0.2);
    this._osc("triangle", 180, 120, 0.14, 0.14, 0.08);
  }
  tink() {
    this._osc("sine", 2600, 2500, 0.35, 0.09);
    this._osc("sine", 3900, 3850, 0.25, 0.05, 0.03);
  }
  strain() {
    this._osc("sawtooth", 90, 70, 0.3, 0.06);
    this._noise(0.25, { vol: 0.1, type: "lowpass", f0: 400, f1: 150 });
  }
  tape(delay = 0) {
    this._noise(0.42, { vol: 0.28, f0: 1800, f1: 5200, q: 1.4, delay, flutter: 55 });
  }
  flap(delay = 0) {
    this._noise(0.12, { vol: 0.2, type: "lowpass", f0: 1400, f1: 300, delay });
    this._osc("sine", 180, 110, 0.1, 0.18, delay);
  }
  click() {
    this._osc("square", 1200, 900, 0.03, 0.04);
  }
  memory() {
    [659, 784, 988].forEach((f, i) => this._osc("sine", f, f, 0.9, 0.06, i * 0.12));
  }
  pop() {
    this._osc("sine", 300, 900, 0.08, 0.1);
  }

  // ── music ──────────────────────────────────────────────────────────────────

  /** Crossfade to a track (path relative to /assets/audio). null = silence. */
  setMusic(path) {
    this.musicWant = path;
    if (this.music && this.music.dataset.path === path) {
      if (this.musicOn && this.music.paused) this.music.play().catch(() => {});
      return;
    }
    const old = this.music;
    if (old) this._fade(old, 0, 700, () => { old.pause(); old.removeAttribute("src"); old.load(); });
    this.music = null;
    if (!path || !this.musicOn) return;
    const el = new window.Audio(BASE + path);
    el.dataset.path = path;
    el.loop = true;
    el.volume = 0;
    el.preload = "auto";
    this.music = el;
    if (this.musicOn) {
      el.play().then(() => this._fade(el, this.musicVol, 1400)).catch(() => {});
    }
  }

  setMusicOn(on) {
    this.musicOn = on;
    if (!this.music) {
      if (on && this.musicWant) this.setMusic(this.musicWant);
      return;
    }
    if (on) this.music.play().then(() => this._fade(this.music, this.musicVol, 600)).catch(() => {});
    else this._fade(this.music, 0, 300, () => this.music?.pause());
  }

  /** Duck music under a moment (memories, the ending). */
  duck(on) {
    if (this.music && this.musicOn) this._fade(this.music, on ? this.musicVol * 0.35 : this.musicVol, 500);
  }

  _fade(el, to, ms, done) {
    const from = el.volume, t0 = performance.now();
    clearInterval(el._fade);
    el._fade = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { clearInterval(el._fade); done?.(); }
    }, 30);
  }
}

export const audio = new Audio();
