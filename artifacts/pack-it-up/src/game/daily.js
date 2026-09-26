// The daily box: a fresh room every day, the same for everyone, generated
// from the date. Candidates are checked by the solver (it must be packable)
// and by the simulated player (it should be a real challenge but not a wall).
import { solveAny } from "./engine.js";
import { plannerWinRate } from "./planner.js";
import { levelItems, levelBoxes } from "./data/build.js";
import { ITEMS } from "./data/items.js";
import SHAPES from "./data/shapes.js";

const THEMES = [
  { room: "kitchen", title: "Kitchen Odds & Ends", label: "KITCHEN", items: ["cereal", "pasta", "can", "sauce", "oil", "crackers", "chips", "pepper", "salt", "spatula", "whisk", "tongs", "wooden_spoon", "fork", "spoon", "knife", "skillet", "saucepan", "stock_pot", "pot_lid", "baking_sheet", "muffin_tin", "casserole", "plate", "bowl", "mug", "plate_stack", "tupperware", "tupper_stack", "bento"] },
  { room: "bathroom", title: "The Bathroom Shelf", label: "BATHROOM", items: ["pill_bottle", "blister", "pill_week", "curl_cream", "hair_oil", "mousse", "nail_polish", "remover", "nail_file", "nippers", "uv_lamp", "toothpaste", "deodorant", "soap", "razor", "lotion", "floss", "toiletry_bag"] },
  { room: "bedroom", title: "The Wardrobe", label: "BEDROOM", items: ["sweater", "jeans", "sweater_stack", "shirt", "dress", "pants", "cardigan", "winter_knit", "scarf", "boots", "tote", "satchel", "belt", "pouch", "zip_case", "lipstick", "blush", "eyeshadow", "mascara", "brush", "perfume", "earrings", "necklace", "claw_clip", "sheets"] },
  { room: "office", title: "The Home Office", label: "OFFICE", items: ["router", "laptop", "charger", "tablet", "earbuds", "power_bank", "green_books", "upright_books", "folders", "envelope", "certificate", "mail", "clipboard", "stapler", "tape_disp", "notebook", "pen_cup", "sticky", "binder_clip", "id_card"] },
  { room: "living", title: "The Living Room", label: "LIVING RM", items: ["book_nature", "book_flowers", "book_humans", "amp", "picks", "tuner", "cable", "console", "controller", "dock", "cards", "dice", "knight", "puzzle_box", "fabric_floral", "fabric_plaid", "fabric_roll", "candle", "ginger_jar", "vase_round", "bud_vase", "tapers", "incense", "prints", "rolled_print"] },
  { room: "dining", title: "The Sideboard", label: "DINING", items: ["wine", "liquor", "shaker", "jigger", "corkscrew", "opener", "wine_glass", "flute", "rocks_glass", "martini", "shot_glass", "matchbox", "jar_candle", "pillar_candle", "tapers", "vase_cream", "pitcher", "plate", "bowl", "vase_tall_bw"] },
  { room: "hall", title: "The Hall Closet", label: "HALL", items: ["drill", "hammer", "pliers", "tape_measure", "screwdriver", "flashlight", "batteries", "tape_roll", "gloves", "trash_bags", "spray", "sponge", "backpack", "neck_pillow", "luggage_tag", "harness", "poop_bags", "long_coat", "boots"] },
  { room: "kitchen", title: "Stretchy's Corner", label: "STRETCHY", items: ["kibble", "wet_food", "food_bowl", "water_bowl", "feather_wand", "mouse_toy", "fish_toy", "kicker", "string_wand", "travel_bowl", "harness", "poop_bags", "cat_meds", "cat_drops", "round_bed", "litter_box"] },
];

const BOXES = [[4, 3], [5, 3], [4, 4], [5, 4], [6, 4], [3, 3]];
const TRACKS = ["spaghetti", "dry", "nighttrain", "oldies", "eightbit", "rnb", "pop", "synthwave", "jazz"];

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hash(str) {
  let h = 2166136261;
  for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const area = (id) => SHAPES[id].cells.length;

function candidate(r, key) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const theme = pick(THEMES);
  const nBoxes = r() < 0.55 ? 2 : 1;
  const boxes = [];
  for (let b = 0; b < nBoxes; b++) {
    const [w, h] = pick(nBoxes === 1 ? BOXES.slice(1) : BOXES);
    boxes.push({ w, h, label: theme.label, ...(w * h <= 15 && r() < 0.4 ? { layers: 2 } : {}) });
  }
  const cap = boxes.reduce((s, b) => s + b.w * b.h * (b.layers || 1), 0);
  const slack = Math.floor(r() * 3);
  // fill toward the capacity, biggest pieces first, then small ones
  const pool = theme.items.filter((id) => area(id) <= Math.min(...boxes.map((b) => b.w * b.h)) || boxes.some((b) => SHAPES[id].w <= Math.max(b.w, b.h) && SHAPES[id].h <= Math.max(b.w, b.h)));
  const items = [];
  let left = cap - slack;
  for (let tries = 0; tries < 200 && left > 0; tries++) {
    const id = pick(pool);
    if (area(id) > left || items.filter((x) => x === id).length >= 2) continue;
    items.push(id);
    left -= area(id);
  }
  if (left > 2 || items.length < 4) return null;
  const hasFragile = items.some((id) => ITEMS[id].fragile);
  const hasHeavy = items.some((id) => ITEMS[id].weight >= 3);
  const weight = r() < 0.5 || hasHeavy;
  const rules = [];
  if (weight) {
    rules.push("weight");
    const total = items.reduce((s, id) => s + ITEMS[id].weight, 0);
    const bcap = (b) => b.w * b.h * (b.layers || 1);
    boxes.forEach((b) => (b.maxWeight = Math.max(4, Math.ceil(((total * bcap(b)) / cap) * (1.1 + r() * 0.25)))));
  }
  if (hasFragile && hasHeavy) rules.push("fragile");
  const note = [
    boxes.some((b) => b.layers) && "a deep box stacks two layers",
    weight && "boxes have weight limits",
    rules.includes("fragile") && "glass can't touch heavy things",
    "Stretchy wants attention",
  ].filter(Boolean);
  return {
    note: note.join(" · ").replace(/^./, (c) => c.toUpperCase()) + ".",
    id: `daily-${key}`,
    daily: key,
    room: theme.room,
    title: theme.title,
    intro: "Today's box. Same for everyone, new every day.",
    teach: null,
    rules,
    cat: "boxes",
    mood: true,
    music: pick(TRACKS),
    boxes,
    items,
  };
}

/**
 * The room for a date. Tries seeded candidates until one is packable and
 * lands in the challenge band; falls back to the closest packable one.
 */
export function dailyLevel(key = todayKey()) {
  const r = rng(hash("pack-it-up:" + key));
  let fallback = null;
  for (let n = 0; n < 60; n++) {
    const L = candidate(r, key);
    if (!L) continue;
    const items = levelItems(L), boxes = levelBoxes(L);
    if (solveAny(boxes, items, { maxNodes: 150000 }).status !== "solved") continue;
    const win = plannerWinRate(boxes, items, 24, Infinity, 5);
    const miss = Math.abs(win - 0.5);
    if (win >= 0.25 && win <= 0.75) return L;
    if (!fallback || miss < fallback.miss) fallback = { L, miss };
  }
  return fallback?.L || null;
}
