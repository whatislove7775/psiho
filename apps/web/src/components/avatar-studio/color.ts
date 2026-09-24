/**
 * Colour maths for the studio's swatch + gradient slider (Apple-Memoji style):
 * a picked swatch defines a curve of shades; the slider walks that curve.
 */

export interface Hsl {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export type CurveMode = "default" | "skin";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return rgbToHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return rgbToHex(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255);
}

/**
 * Shade of `base` at position t∈[0,1]. t=0.5 is the base itself; lower is
 * darker (skin: also warmer), higher is lighter and slightly softer.
 */
export function shadeAt(base: string, t: number, mode: CurveMode = "default"): string {
  const { h, s, l } = hexToHsl(base);
  const span = mode === "skin" ? 0.13 : 0.3;
  const lo = clamp(l - span, 0.04, 0.96);
  const hi = clamp(l + span, 0.04, 0.96);
  const L = t < 0.5 ? lerp(lo, l, t / 0.5) : lerp(l, hi, (t - 0.5) / 0.5);
  const S = mode === "skin" ? s : t <= 0.5 ? s : s * (1 - 0.3 * (t - 0.5) * 2);
  const H = mode === "skin" ? h + (t - 0.5) * 8 : h;
  return hslToHex({ h: H, s: clamp(S, 0, 1), l: clamp(L, 0, 1) });
}

function dist(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}

/** Where on `base`'s curve `value` sits, and how far off the curve it is. */
export function locateOnCurve(base: string, value: string, mode: CurveMode = "default"): { t: number; off: number } {
  let best = { t: 0.5, off: Infinity };
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const d = dist(shadeAt(base, t, mode), value);
    if (d < best.off) best = { t, off: d };
  }
  return best;
}

/** Palette swatch whose curve passes through `value`, or null for a custom colour. */
export function findBase(palette: readonly string[], value: string, mode: CurveMode = "default"): string | null {
  const v = value.toUpperCase();
  const exact = palette.find((p) => p.toUpperCase() === v);
  if (exact) return exact;
  let best: { p: string; off: number } | null = null;
  for (const p of palette) {
    const { off } = locateOnCurve(p, v, mode);
    if (off < 7 && (!best || off < best.off)) best = { p, off };
  }
  return best?.p ?? null;
}

/** CSS gradient showing the whole curve for the slider track. */
export function curveGradient(base: string, mode: CurveMode = "default"): string {
  const stops: string[] = [];
  for (let i = 0; i <= 8; i++) stops.push(shadeAt(base, i / 8, mode));
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function sameColor(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").toUpperCase() === (b ?? "").toUpperCase();
}
