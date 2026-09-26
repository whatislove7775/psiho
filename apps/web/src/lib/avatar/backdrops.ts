/**
 * Backgrounds behind the live avatar (camera check and calls).
 *
 * Two groups:
 *  - «Градиенты»: painted procedurally into a canvas (no image assets);
 *  - «Пейзажи»: calm landscape photos (public/backdrops/*.webp, 540×720,
 *    licences and authors in public/backdrops/CREDITS.txt).
 *
 * Either way the picture is handed to the renderer as the scene background,
 * so the avatar video that leaves the device already contains it. `css` is the
 * same look for pickers and the blurred ambient background of the call screen.
 * The choice is a per-device preference (localStorage).
 */

export type GradientBackdropId = "dusk" | "mint" | "peach" | "sky" | "lilac" | "night";
export type PhotoBackdropId = "lake" | "dunes" | "fern" | "sea" | "pier" | "evening";
export type BackdropId = GradientBackdropId | PhotoBackdropId;

interface Blob {
  x: number;
  y: number;
  r: number;
  color: string;
}

export interface Backdrop {
  id: BackdropId;
  label: string;
  kind: "gradient" | "photo";
  /** top → bottom gradient (for photos: the placeholder shown while the picture loads) */
  from: string;
  to: string;
  blobs: Blob[];
  /** CSS background with the same look (swatch) */
  css: string;
  /** CSS background for a large surface (the full photo) */
  cover: string;
  /** CSS background for the blurred ambient layer of the call screen */
  ambient: string;
  /** photos only */
  src?: string;
  credit?: string;
}

function layers(from: string, to: string, blobs: Blob[]) {
  const l = blobs.map((b) => `radial-gradient(circle at ${b.x * 100}% ${b.y * 100}%, ${b.color} 0, transparent ${b.r * 100}%)`);
  return [...l, `linear-gradient(180deg, ${from}, ${to})`].join(", ");
}

function def(id: GradientBackdropId, label: string, from: string, to: string, blobs: Blob[]): Backdrop {
  const css = layers(from, to, blobs);
  return { id, label, kind: "gradient", from, to, blobs, css, cover: css, ambient: css };
}

function photo(id: PhotoBackdropId, label: string, from: string, to: string, credit: string): Backdrop {
  const base = `/backdrops/${id}`;
  return {
    id,
    label,
    kind: "photo",
    from,
    to,
    blobs: [],
    css: `url(${base}-thumb.webp) center / cover no-repeat, linear-gradient(180deg, ${from}, ${to})`,
    cover: `url(${base}.webp) center / cover no-repeat, linear-gradient(180deg, ${from}, ${to})`,
    ambient: `url(${base}-ambient.webp) center / cover no-repeat, linear-gradient(180deg, ${from}, ${to})`,
    src: `${base}.webp`,
    credit,
  };
}

export const GRADIENT_BACKDROPS: Backdrop[] = [
  def("dusk", "Сумерки", "#2a2a3a", "#16161d", [
    { x: 0.2, y: 0.18, r: 0.55, color: "rgba(120,140,255,0.22)" },
    { x: 0.85, y: 0.75, r: 0.6, color: "rgba(255,160,200,0.14)" },
  ]),
  def("mint", "Мята", "#d7f3ea", "#a9dfcf", [
    { x: 0.8, y: 0.15, r: 0.5, color: "rgba(255,255,255,0.55)" },
    { x: 0.1, y: 0.85, r: 0.55, color: "rgba(120,200,180,0.45)" },
  ]),
  def("peach", "Персик", "#ffe3d2", "#f8c1a6", [
    { x: 0.2, y: 0.2, r: 0.5, color: "rgba(255,255,255,0.6)" },
    { x: 0.9, y: 0.8, r: 0.6, color: "rgba(255,170,150,0.45)" },
  ]),
  def("sky", "Небо", "#dcecff", "#a9cdf7", [
    { x: 0.75, y: 0.22, r: 0.45, color: "rgba(255,255,255,0.7)" },
    { x: 0.15, y: 0.7, r: 0.5, color: "rgba(255,255,255,0.35)" },
  ]),
  def("lilac", "Лаванда", "#ebe4ff", "#c8b9f7", [
    { x: 0.2, y: 0.25, r: 0.5, color: "rgba(255,255,255,0.55)" },
    { x: 0.85, y: 0.85, r: 0.55, color: "rgba(255,190,230,0.4)" },
  ]),
  def("night", "Ночь", "#101626", "#05070c", [
    { x: 0.5, y: 0.1, r: 0.6, color: "rgba(80,120,255,0.25)" },
    { x: 0.1, y: 0.9, r: 0.5, color: "rgba(60,200,180,0.12)" },
  ]),
];

export const PHOTO_BACKDROPS: Backdrop[] = [
  photo("lake", "Озеро в горах", "#5f93c9", "#5d7a3a", "Peter Thomas, Unsplash"),
  photo("dunes", "Дюны", "#c9cfd6", "#a39a8c", "David Emrich, Unsplash"),
  photo("fern", "Папоротник", "#16261c", "#23452c", "Unsplash"),
  photo("sea", "Море", "#1f6f9c", "#c9d3da", "Nattu Adnan, Unsplash"),
  photo("pier", "Закат у пирса", "#8a6f9e", "#3b4452", "Unsplash, CC0"),
  photo("evening", "Горы вечером", "#1c2a3f", "#141a1d", "Pexels"),
];

export const BACKDROPS: Backdrop[] = [...GRADIENT_BACKDROPS, ...PHOTO_BACKDROPS];

export const BACKDROP_GROUPS: { label: string; items: Backdrop[] }[] = [
  { label: "Градиенты", items: GRADIENT_BACKDROPS },
  { label: "Пейзажи", items: PHOTO_BACKDROPS },
];

export const DEFAULT_BACKDROP: BackdropId = "dusk";

export function getBackdrop(id: string | null | undefined): Backdrop {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS.find((b) => b.id === DEFAULT_BACKDROP)!;
}

/**
 * Paint a backdrop into a canvas of the given size (used as a WebGL texture).
 * For a photo this is the placeholder gradient; use `backdropCanvas()` to get
 * the photo itself once it has loaded.
 */
export function paintBackdrop(id: BackdropId, width = 540, height = 720): HTMLCanvasElement {
  const b = getBackdrop(id);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const g = c.getContext("2d");
  if (!g) return c;
  const lin = g.createLinearGradient(0, 0, 0, height);
  lin.addColorStop(0, b.from);
  lin.addColorStop(1, b.to);
  g.fillStyle = lin;
  g.fillRect(0, 0, width, height);
  const diag = Math.hypot(width, height);
  for (const blob of b.blobs) {
    const cx = blob.x * width;
    const cy = blob.y * height;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, blob.r * diag * 0.75);
    rg.addColorStop(0, blob.color);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, width, height);
  }
  return c;
}

const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`backdrop ${src} failed to load`));
      img.src = src;
    });
    p.catch(() => images.delete(src)); // allow a retry next time
    images.set(src, p);
  }
  return p;
}

/**
 * Deliver the backdrop canvas to `use`: at once for a gradient; for a photo
 * first the placeholder gradient, then (after loading) the photo, cropped to
 * fill the canvas. Returns a cancel function (call it when the choice changes).
 */
export function backdropCanvas(id: BackdropId, use: (c: HTMLCanvasElement) => void, width = 540, height = 720): () => void {
  let live = true;
  const b = getBackdrop(id);
  use(paintBackdrop(b.id, width, height));
  if (b.kind === "photo" && b.src) {
    loadImage(b.src)
      .then((img) => {
        if (!live) return;
        const c = document.createElement("canvas");
        c.width = width;
        c.height = height;
        const g = c.getContext("2d");
        if (!g) return;
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        g.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        use(c);
      })
      .catch(() => undefined); // the placeholder gradient stays
  }
  return () => {
    live = false;
  };
}

/** Warm the image cache (e.g. when the picker opens). */
export function preloadBackdrop(id: BackdropId) {
  const b = getBackdrop(id);
  if (b.src && typeof Image !== "undefined") loadImage(b.src).catch(() => undefined);
}

const KEY = "aprosop.backdrop";

export function loadBackdrop(): BackdropId {
  try {
    const v = localStorage.getItem(KEY);
    if (v && BACKDROPS.some((b) => b.id === v)) return v as BackdropId;
  } catch {
    /* private mode */
  }
  return DEFAULT_BACKDROP;
}

export function saveBackdrop(id: BackdropId) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode — the choice lasts for this page only */
  }
}

const AMBIENT_KEY = "aprosop.callAmbient";

/** Blurred landscape behind the call screen (per device, on by default). */
export function loadAmbient(): boolean {
  try {
    return localStorage.getItem(AMBIENT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function saveAmbient(on: boolean) {
  try {
    localStorage.setItem(AMBIENT_KEY, on ? "1" : "0");
  } catch {
    /* private mode */
  }
}
