/**
 * Backgrounds behind the live avatar (camera check and calls).
 *
 * Every backdrop is painted procedurally into a canvas (no image assets) and
 * handed to the renderer as the scene background, so the avatar video that
 * leaves the device already contains it. `css` is the same look for pickers.
 * The choice is a per-device preference (localStorage).
 */

export type BackdropId = "dusk" | "mint" | "peach" | "sky" | "lilac" | "night";

interface Blob {
  x: number;
  y: number;
  r: number;
  color: string;
}

export interface Backdrop {
  id: BackdropId;
  label: string;
  /** top → bottom gradient */
  from: string;
  to: string;
  blobs: Blob[];
  css: string;
}

function def(id: BackdropId, label: string, from: string, to: string, blobs: Blob[]): Backdrop {
  const layers = blobs.map((b) => `radial-gradient(circle at ${b.x * 100}% ${b.y * 100}%, ${b.color} 0, transparent ${b.r * 100}%)`);
  return { id, label, from, to, blobs, css: [...layers, `linear-gradient(180deg, ${from}, ${to})`].join(", ") };
}

export const BACKDROPS: Backdrop[] = [
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

export const DEFAULT_BACKDROP: BackdropId = "dusk";

export function getBackdrop(id: string | null | undefined): Backdrop {
  return BACKDROPS.find((b) => b.id === id) ?? BACKDROPS.find((b) => b.id === DEFAULT_BACKDROP)!;
}

/** Paint a backdrop into a canvas of the given size (used as a WebGL texture). */
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
