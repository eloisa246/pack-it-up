// Progress + settings in localStorage. Every access is guarded: private mode,
// blocked storage, or a corrupt value must never stop the game from running.
const KEY = "pack-it-up/v2";

const blank = () => ({ levels: {}, daily: {}, settings: { music: true, sfx: true } });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    return { ...blank(), ...data, settings: { ...blank().settings, ...(data.settings || {}) } };
  } catch {
    return blank();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* storage unavailable — progress just won't persist */
  }
}

export function recordLevel(save, id, { boxes, pro, ms }) {
  const prev = save.levels[id] || {};
  const next = {
    done: true,
    pro: !!(prev.pro || pro),
    bestBoxes: prev.bestBoxes ? Math.min(prev.bestBoxes, boxes) : boxes,
    bestMs: prev.bestMs ? Math.min(prev.bestMs, ms) : ms,
  };
  return { ...save, levels: { ...save.levels, [id]: next } };
}

export function recordDaily(save, key, { pro, ms }) {
  const prev = save.daily?.[key] || {};
  const next = { done: true, pro: !!(prev.pro || pro), bestMs: prev.bestMs ? Math.min(prev.bestMs, ms) : ms };
  return { ...save, daily: { ...(save.daily || {}), [key]: next } };
}

/** Days in a row with the daily box packed, counting back from today (or yesterday). */
export function dailyStreak(save, now = new Date()) {
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const d = new Date(now);
  if (!save.daily?.[key(d)]?.done) d.setDate(d.getDate() - 1);
  let n = 0;
  while (save.daily?.[key(d)]?.done) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
