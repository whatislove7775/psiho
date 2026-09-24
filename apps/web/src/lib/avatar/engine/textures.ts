/**
 * Procedural canvas textures: skin detail (multiplied over the skin colour),
 * iris, hair strand normals. Generated on the fly — no image assets.
 */
import * as THREE from "three";
import type { AvatarConfig } from "../schema";
import { EYE_X, EYE_Y, MOUTH_Y, dirFrom2D, dirToUV, type HeadParams } from "./head";
import { mulberry } from "./math";

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

function tex(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

const SKIN_W = 1024;
const SKIN_H = 512;

/** Pixel position on the skin texture of a 2D face point (unit-sphere x, y). */
function facePx(x: number, y: number): [number, number, number] {
  const d = dirFrom2D(x, y, [0, 0, 0]);
  const [u, v] = dirToUV(d[0], d[1], d[2]);
  // horizontal pixel scale shrinks with sin(theta) — return it for ellipse sizing
  const s = Math.max(0.3, Math.sqrt(1 - d[1] * d[1]));
  return [u * SKIN_W, v * SKIN_H, s];
}

/** Paint a soft radial blob at face coords (x, y) with face-space radius r. */
function blob(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, squashY = 1) {
  const [px, py, s] = facePx(x, y);
  const rx = (r / (Math.PI * 2 * s)) * SKIN_W;
  const ry = ((r * squashY) / Math.PI) * SKIN_H;
  g.save();
  g.translate(px, py);
  g.scale(1, ry / rx);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.globalAlpha = alpha;
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function stroke(g: CanvasRenderingContext2D, pts: [number, number][], width: number, color: string, alpha: number) {
  g.save();
  g.globalAlpha = alpha;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.filter = "blur(1.5px)";
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const [px, py] = facePx(x, y);
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.stroke();
  g.restore();
}

/**
 * Skin detail map, white = untouched skin. Multiplies with the skin colour,
 * so tints (blush, freckles, lines, stubble) are painted as colours < white.
 */
export function skinDetailTexture(cfg: AvatarConfig, P: HeadParams): THREE.CanvasTexture {
  const [c, g] = canvas(SKIN_W, SKIN_H);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, SKIN_W, SKIN_H);
  const rnd = mulberry(7);

  // Subtle warm/cool variation keeps skin from looking like plastic
  blob(g, 0, -0.1, 0.9, "#fff1ec", 0.8);
  blob(g, 0, MOUTH_Y, 0.2, "#f7d6cf", 0.35); // around lips
  blob(g, 0, P.nose.y, 0.12, "#f9dcd6", 0.35); // nose tip
  // nostrils
  for (const s of [-1, 1]) blob(g, s * P.nose.wingX * 0.55, P.nose.y - P.nose.ry * 0.95, 0.03, "#7a4a40", 0.6, 0.7);
  blob(g, 0, P.nose.y - P.nose.ry * 1.25, 0.1, "#d99b8c", 0.45, 0.45);
  for (const s of [-1, 1]) blob(g, s * 0.075, P.nose.y + 0.1, 0.06, "#e7b8aa", 0.3, 1.4);
  // eyelid crease shading
  for (const s of [-1, 1]) blob(g, s * EYE_X, EYE_Y + 0.12, 0.13, "#e8c7bf", 0.35, 0.5);

  // Blush
  if (cfg.skin.blush > 0.01) {
    for (const s of [-1, 1]) blob(g, s * 0.46, -0.26, 0.2, "#ff8f8f", 0.18 + 0.5 * cfg.skin.blush);
  }

  // Freckles
  const fr = { none: 0, light: 45, medium: 110, heavy: 220 }[cfg.skin.freckles];
  for (let i = 0; i < fr; i++) {
    const x = (rnd() * 2 - 1) * 0.62;
    const y = -0.08 - rnd() * 0.32 + Math.abs(x) * 0.12;
    if (Math.hypot(x / 0.62, (y + 0.2) / 0.3) > 1) continue;
    const [px, py] = facePx(x, y);
    g.globalAlpha = 0.25 + rnd() * 0.4;
    g.fillStyle = "#a0613f";
    g.beginPath();
    g.ellipse(px, py, 1.2 + rnd() * 1.6, 1 + rnd() * 1.4, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // Mole
  const mole = { none: null, cheek: [0.36, -0.3], lip: [0.13, MOUTH_Y + 0.08], eye: [0.5, -0.02] }[cfg.skin.mole];
  if (mole) {
    const [px, py] = facePx(mole[0], mole[1]);
    g.fillStyle = "#4a2a1e";
    g.beginPath();
    g.arc(px, py, 3.2, 0, Math.PI * 2);
    g.fill();
  }

  // Age lines
  const age = { young: 0, adult: 0, mature: 0.55, senior: 1 }[cfg.skin.age];
  if (age > 0) {
    const col = "#9b6a5a";
    for (const s of [-1, 1]) {
      // nasolabial folds
      stroke(g, [[s * 0.14, P.nose.y - 0.02], [s * 0.2, -0.36], [s * 0.25, -0.5]], 3, col, 0.22 * age);
      // crow's feet
      for (let k = -1; k <= 1; k++) stroke(g, [[s * 0.52, EYE_Y + k * 0.03], [s * 0.6, EYE_Y + k * 0.06]], 2, col, 0.2 * age);
      // under-eye
      stroke(g, [[s * 0.22, EYE_Y - 0.13], [s * 0.34, EYE_Y - 0.16], [s * 0.45, EYE_Y - 0.13]], 2.5, col, 0.14 * age);
    }
    // forehead
    for (let k = 0; k < (age > 0.7 ? 3 : 2); k++) {
      const y = 0.43 + k * 0.07;
      stroke(g, [[-0.28, y], [0, y + 0.015], [0.28, y]], 2.5, col, 0.16 * age);
    }
  }

  // Stubble (as skin shading)
  if (cfg.facialHair.style === "stubble") {
    const col = cfg.facialHair.color;
    for (let i = 0; i < 2600; i++) {
      const x = (rnd() * 2 - 1) * 0.7;
      const y = -0.33 - rnd() * 0.62;
      const inJaw = Math.hypot(x / 0.72, (y + 0.62) / 0.42) < 1;
      const inMouth = Math.hypot(x / 0.3, (y - MOUTH_Y) / 0.08) < 1;
      if (!inJaw || inMouth) continue;
      const [px, py] = facePx(x, y);
      g.globalAlpha = 0.25;
      g.fillStyle = col;
      g.fillRect(px, py, 1.6, 1.6);
    }
    blob(g, 0, -0.66, 0.5, col, 0.12);
    g.globalAlpha = 1;
  }

  return tex(c);
}

/** Planar-mapped eye texture: sclera, iris with fibres and limbus, pupil. */
export function irisTexture(color: string): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  const cx = S / 2;
  g.fillStyle = "#f6f3ef";
  g.fillRect(0, 0, S, S);
  // soft sclera shading towards the edges
  const sh = g.createRadialGradient(cx, cx, S * 0.25, cx, cx, S * 0.62);
  sh.addColorStop(0, "rgba(255,255,255,0)");
  sh.addColorStop(1, "rgba(215,200,195,0.9)");
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);

  const R = S * 0.33;
  const base = new THREE.Color(color);
  const light = base.clone().lerp(new THREE.Color("#ffffff"), 0.35).getStyle();
  const dark = base.clone().multiplyScalar(0.45).getStyle();
  const ir = g.createRadialGradient(cx, cx, R * 0.25, cx, cx, R);
  ir.addColorStop(0, light);
  ir.addColorStop(0.55, color);
  ir.addColorStop(0.9, dark);
  ir.addColorStop(1, "#1a1210");
  g.fillStyle = ir;
  g.beginPath();
  g.arc(cx, cx, R, 0, Math.PI * 2);
  g.fill();
  // fibres
  const rnd = mulberry(3);
  g.save();
  g.globalAlpha = 0.18;
  g.strokeStyle = "#ffffff";
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    const r0 = R * (0.3 + rnd() * 0.1);
    const r1 = R * (0.7 + rnd() * 0.25);
    g.lineWidth = 0.6 + rnd();
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0);
    g.lineTo(cx + Math.cos(a + 0.05) * r1, cx + Math.sin(a + 0.05) * r1);
    g.stroke();
  }
  g.restore();
  // pupil
  g.fillStyle = "#0b0908";
  g.beginPath();
  g.arc(cx, cx, R * 0.42, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

let hairNormalCache: THREE.CanvasTexture | null = null;

/** Tileable normal map of fine strands running along V. */
export function hairNormalTexture(): THREE.CanvasTexture {
  if (hairNormalCache) return hairNormalCache;
  const W = 256, H = 256;
  const height = new Float32Array(W * H);
  const rnd = mulberry(11);
  // columns of strands with slow variation along v
  const phase = Array.from({ length: 48 }, () => rnd() * Math.PI * 2);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      let h = 0;
      for (let k = 0; k < 6; k++) {
        const f = (k + 1) * 7;
        h += Math.sin((x / W) * Math.PI * 2 * f + phase[k * 7] + Math.sin((y / H) * Math.PI * 2 + phase[k]) * 0.6) / (k + 1);
      }
      height[y * W + x] = h;
    }
  }
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const l = height[y * W + ((x - 1 + W) % W)];
      const r = height[y * W + ((x + 1) % W)];
      const u = height[((y - 1 + H) % H) * W + x];
      const d = height[((y + 1) % H) * W + x];
      let nx = (l - r) * 0.9, ny = (u - d) * 0.25, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * W + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  hairNormalCache = t;
  return t;
}

/** Teeth strip texture (individual teeth, optional gap/braces). */
export function teethTexture(style: AvatarConfig["mouth"]["teeth"]): THREE.CanvasTexture {
  const W = 512, H = 64;
  const [c, g] = canvas(W, H);
  g.fillStyle = "#fbfaf7";
  g.fillRect(0, 0, W, H);
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W;
    g.fillStyle = "rgba(170,160,150,0.55)";
    g.fillRect(x - 1, 0, 2, H);
  }
  // gum-side shading
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, "rgba(200,190,180,0.6)");
  gr.addColorStop(0.3, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  if (style === "gap") {
    g.fillStyle = "#3a1015";
    g.fillRect(W / 2 - 6, 0, 12, H);
  }
  if (style === "braces") {
    g.fillStyle = "#b9c0c8";
    g.fillRect(0, H * 0.46, W, 5);
    for (let i = 0; i < n; i++) g.fillRect(((i + 0.5) / n) * W - 7, H * 0.36, 14, 16);
  }
  return tex(c);
}
