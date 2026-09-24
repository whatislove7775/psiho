/** Planar-mapped eye texture for the kit's runtime eyeballs. */
import * as THREE from "three";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
