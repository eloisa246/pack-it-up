// Image loading. Item sprites are 96×96 PNGs; we only fetch the ones a level
// actually uses, and cache them for the session.
import catSheetUrl from "../assets/Cat-Sheet.png";
import splashUrl from "../assets/splash.png";
import { prepareCatSheet } from "./cat.js";
import carrierUrl from "../assets/items/packitup_cropped_assets/normalized/s4_r10_i04_cat_carrier.png";

const SPRITES = import.meta.glob("../assets/items/packitup_cropped_assets/normalized/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const cache = new Map();

export function loadImage(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`failed to load ${url}`));
        img.src = url;
      }),
    );
  }
  return cache.get(url);
}

export function spriteUrl(file) {
  const url = SPRITES[`../assets/items/packitup_cropped_assets/normalized/${file}.png`];
  if (!url) throw new Error(`no sprite for ${file}`);
  return url;
}

export async function loadSprites(files) {
  const unique = [...new Set(files)];
  const imgs = await Promise.all(unique.map((f) => loadImage(spriteUrl(f))));
  return new Map(unique.map((f, i) => [f, imgs[i]]));
}

let preparedCat = null;
/** The cat sheet, compacted and smoothed (see prepareCatSheet). */
export const loadCatSheet = () =>
  (preparedCat ||= loadImage(catSheetUrl).then((img) => prepareCatSheet(img)));
export const loadSplash = () => loadImage(splashUrl);
export const loadCarrier = () => loadImage(carrierUrl);
