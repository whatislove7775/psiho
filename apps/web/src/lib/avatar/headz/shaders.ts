/**
 * Material patches for the HEADZ runtime (onBeforeCompile on MeshPhysicalMaterial).
 * All patterns are computed in head space from the UNMORPHED vertex position (`aHead`),
 * so they stick to the surface while the face moves.
 *
 *  - eye:  procedural sclera / iris / pupil for every base (the sources mix
 *          textured, flat and black cartoon eyes); wet clearcoat on top.
 *  - skin: blush, freckles, moles, age lines, lipstick, eyeshadow, lash line,
 *          a soft contact shadow under close-fitting hair. Regions come from a per-vertex
 *          `aFx` attribute derived from the face's own morph targets.
 *  - fade: soft alpha fade by height (the neck).
 *  - hair: two-tone tips / streak highlights from a per-vertex `aTip`.
 */
import * as THREE from "three";

type Uniforms = Record<string, THREE.IUniform>;

// every patched mesh carries \`aHead\`: its unmorphed position in head space (set by the renderer)
const VARY_HEAD = /* glsl */ `
attribute vec3 aHead;
varying vec3 vHeadP;
`;

function patchHeadPos(shader: THREE.WebGLProgramParametersWithUniforms, extraDecl = "", extraMain = "") {
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${VARY_HEAD}\n${extraDecl}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n vHeadP = aHead;\n${extraMain}`);
}

// Surface detail is anchored to rest-pose head space, not screen coordinates or time.
// Screen-space derivatives fade subpixel detail out in thumbnails and perturb the
// deformed surface normal (including expressions), without changing the silhouette.
const SURFACE_FRAG = /* glsl */ `
float surfaceHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float surfaceNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(surfaceHash(i), surfaceHash(i + vec3(1,0,0)), f.x),
        mix(surfaceHash(i + vec3(0,1,0)), surfaceHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(surfaceHash(i + vec3(0,0,1)), surfaceHash(i + vec3(1,0,1)), f.x),
        mix(surfaceHash(i + vec3(0,1,1)), surfaceHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float surfaceDetail(vec3 p, float frequency) {
  float footprint = max(length(dFdx(p)), length(dFdy(p))) * frequency;
  return 1.0 - smoothstep(0.35, 1.4, footprint);
}
vec3 surfaceNormal(vec3 n, float height) {
  vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float det = dot(dx, rx);
  vec3 gradient = sign(det) * (dFdx(height) * rx + dFdy(height) * ry);
  return normalize(max(abs(det), 1e-10) * n - gradient);
}
`;

// ── eyes ──────────────────────────────────────────────────────────────────

export interface EyeUniforms {
  uEyeC: { value: THREE.Vector3[] };
  uEyeAxis: { value: THREE.Vector3[] };
  /** [iris angle, pupil angle] in radians, per eye */
  uEyeAng: { value: THREE.Vector2[] };
  uIrisColor: { value: THREE.Color };
  uIrisStyle: { value: number };
  uDilate: { value: number };
}

export function eyeUniforms(): EyeUniforms {
  return {
    uEyeC: { value: [new THREE.Vector3(0.29, -0.09, 0.4), new THREE.Vector3(-0.29, -0.09, 0.4)] },
    uEyeAxis: { value: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 1)] },
    uEyeAng: { value: [new THREE.Vector2(0.6, 0.26), new THREE.Vector2(0.6, 0.26)] },
    uIrisColor: { value: new THREE.Color("#5C3B22") },
    uIrisStyle: { value: 0 },
    uDilate: { value: 0 },
  };
}

const EYE_FRAG = /* glsl */ `
uniform vec3 uEyeC[2];
uniform vec3 uEyeAxis[2];
uniform vec2 uEyeAng[2];
uniform vec3 uIrisColor;
uniform float uIrisStyle;
uniform float uDilate;
varying vec3 vHeadP;
float eyeHash(float n) { return fract(sin(n) * 43758.5453); }
vec3 eyeColor(out float irisMask) {
  int e = vHeadP.x > 0.0 ? 0 : 1;
  vec3 c = e == 0 ? uEyeC[0] : uEyeC[1];
  vec3 ax = normalize(e == 0 ? uEyeAxis[0] : uEyeAxis[1]);
  vec2 ang = e == 0 ? uEyeAng[0] : uEyeAng[1];
  vec3 d = normalize(vHeadP - c);
  float th = acos(clamp(dot(d, ax), -1.0, 1.0));
  vec3 u = normalize(cross(ax, vec3(0.0, 1.0, 0.0)));
  vec3 w = cross(u, ax);
  float phi = atan(dot(d, w), dot(d, u));
  float t = th / ang.x;
  float tp = ang.y * (1.0 + uDilate) / ang.x;
  // sclera: warm white, pinkish toward the corners, never black at the back
  vec3 sclera = mix(vec3(0.94, 0.925, 0.9), vec3(0.9, 0.74, 0.72), smoothstep(1.5, 3.2, t));
  sclera *= mix(1.0, 0.8, smoothstep(2.6, 4.5, t));
  // iris
  float f1 = 0.5 + 0.5 * sin(phi * 29.0 + sin(phi * 7.0) * 2.3 + t * 3.0);
  float f2 = 0.5 + 0.5 * sin(phi * 61.0 + eyeHash(floor(phi * 9.0)) * 6.0);
  float fib = mix(f1, f2, 0.45);
  vec3 base = uIrisColor;
  vec3 light = mix(base, vec3(1.0, 0.86, 0.55), 0.35) * 1.35;
  vec3 iris;
  if (uIrisStyle < 0.5) {          // natural: fibres, warm collarette, dark limbus
    iris = base * (0.62 + 0.62 * fib * (0.55 + 0.45 * t));
    iris = mix(iris, light, smoothstep(tp + 0.28, tp, t) * 0.55);
    iris *= mix(1.0, 0.32, smoothstep(0.72, 1.0, t));
  } else if (uIrisStyle < 1.5) {   // ring: soft gradient, bold ring
    iris = mix(base * 1.35, base * 0.75, smoothstep(tp, 0.95, t));
    iris *= mix(1.0, 0.18, smoothstep(0.8, 0.95, t));
  } else if (uIrisStyle < 2.5) {   // cartoon: flat colour, big glossy pupil
    iris = base * mix(1.15, 0.8, t);
    tp = max(tp, 0.52);
  } else {                         // bright: starburst, light centre
    float star = 0.5 + 0.5 * sin(phi * 18.0);
    iris = mix(base * 0.7, mix(base, vec3(1.0), 0.45), star * smoothstep(1.0, 0.25, t));
    iris *= mix(1.0, 0.4, smoothstep(0.85, 1.0, t));
  }
  // depth: the cornea/lid shade the upper iris a little
  iris *= 0.82 + 0.18 * smoothstep(0.6, -0.6, dot(d, w));
  float pupil = smoothstep(tp + 0.035, tp - 0.035, t);
  iris = mix(iris, vec3(0.012), pupil);
  irisMask = smoothstep(1.04, 0.97, t);
  return mix(sclera, iris, irisMask);
}
`;

export function patchEye(mat: THREE.MeshPhysicalMaterial, u: EyeUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u as unknown as Uniforms);
    patchHeadPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${EYE_FRAG}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n float irisMask; diffuseColor.rgb = eyeColor(irisMask);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n roughnessFactor = mix(0.32, 0.45, irisMask);`);
  };
  mat.customProgramCacheKey = () => "headz-eye";
}

// ── skin ──────────────────────────────────────────────────────────────────

export interface SkinUniforms {
  uBlush: { value: THREE.Vector4 };
  uFreckles: { value: number };
  uMoles: { value: THREE.Vector4[] };
  uAge: { value: number };
  uLip: { value: THREE.Vector4 };
  uShadow: { value: THREE.Vector4 };
  uLiner: { value: THREE.Vector4 };
  /** eye centres (for age lines) + nose tip (freckles) */
  uEyeC: { value: THREE.Vector3[] };
  uNose: { value: THREE.Vector3 };
  uMouth: { value: THREE.Vector4 };
}

export function skinUniforms(): SkinUniforms {
  return {
    uBlush: { value: new THREE.Vector4(0.9, 0.45, 0.45, 0) },
    uFreckles: { value: 0 },
    uMoles: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
    uAge: { value: 0 },
    uLip: { value: new THREE.Vector4(0.7, 0.2, 0.25, 0) },
    uShadow: { value: new THREE.Vector4(0.5, 0.4, 0.6, 0) },
    uLiner: { value: new THREE.Vector4(0.12, 0.08, 0.07, 0.3) },
    uEyeC: { value: [new THREE.Vector3(0.29, -0.09, 0.4), new THREE.Vector3(-0.29, -0.09, 0.4)] },
    uNose: { value: new THREE.Vector3(0, -0.42, 0.89) },
    uMouth: { value: new THREE.Vector4(0, -0.64, 0.57, 0.26) },
  };
}

const SKIN_FRAG = /* glsl */ `
uniform vec4 uBlush;
uniform float uFreckles;
uniform vec4 uMoles[3];
uniform float uAge;
uniform vec4 uLip;
uniform vec4 uShadow;
uniform vec4 uLiner;
uniform vec3 uEyeC[2];
uniform vec3 uNose;
uniform vec4 uMouth;
varying vec3 vHeadP;
varying vec4 vFx;
varying float vCover;
${SURFACE_FRAG}
float skHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
vec3 skinFx(vec3 c) {
  vec3 P = vHeadP;
  float lips = smoothstep(0.28, 0.62, vFx.x);
  float lid = vFx.y;
  float cheek = smoothstep(0.2, 0.8, vFx.z);
  float front = smoothstep(0.0, 0.3, P.z);
  // Subtle warm/cool variation without changing the chosen skin tone.
  float tone = surfaceNoise(P * 7.0) - 0.5;
  c *= vec3(1.0 + tone * 0.045, 1.0 + tone * 0.026, 1.0 + tone * 0.02);
  // natural lips (a touch rosier than the skin) and the dark mouth cavity behind them
  c = mix(c, c * vec3(1.0, 0.72, 0.72), 0.5 * lips);
  float cav = smoothstep(uMouth.z - 0.1, uMouth.z - 0.2, P.z) * smoothstep(0.0, 0.12, P.z)
    * smoothstep(uMouth.w * 1.15, uMouth.w * 0.7, abs(P.x - uMouth.x))
    * smoothstep(0.16, 0.09, abs(P.y - uMouth.y));
  c = mix(c, vec3(0.3, 0.07, 0.08), cav);
  // blush
  c = mix(c, c * uBlush.rgb * 1.25, uBlush.a * cheek * 0.6);
  // freckles over cheeks and the nose bridge
  if (uFreckles > 0.0) {
    float region = clamp(cheek * 1.4 + exp(-pow(length((P - uNose - vec3(0.0, 0.12, -0.08)) * vec3(1.0, 1.3, 1.0)) / 0.2, 2.0)), 0.0, 1.0) * front;
    vec3 fp = P * 42.0;
    vec3 cell = floor(fp);
    vec3 fr = fract(fp) - 0.5 - (vec3(skHash(cell), skHash(cell + 7.1), skHash(cell + 3.7)) - 0.5) * 0.5;
    float spot = smoothstep(0.3, 0.12, length(fr)) * step(0.5, skHash(cell + 1.3));
    c = mix(c, c * vec3(0.66, 0.48, 0.38), spot * region * uFreckles * 0.75);
  }
  // moles
  for (int i = 0; i < 3; i++) {
    if (uMoles[i].w <= 0.0) continue;
    float m = smoothstep(uMoles[i].w, uMoles[i].w * 0.45, distance(P, uMoles[i].xyz));
    c = mix(c, c * vec3(0.38, 0.26, 0.22), m);
  }
  // age lines: forehead, crow's feet, nasolabial folds
  if (uAge > 0.0) {
    float ey = (uEyeC[0].y + uEyeC[1].y) * 0.5;
    float fh = smoothstep(ey + 0.3, ey + 0.42, P.y) * smoothstep(ey + 0.85, ey + 0.6, P.y) * smoothstep(0.5, 0.2, abs(P.x)) * front;
    float lines = pow(0.5 + 0.5 * sin(P.y * 75.0 + sin(P.x * 7.0) * 1.2), 10.0);
    float cf = 0.0;
    for (int i = 0; i < 2; i++) {
      vec3 e = uEyeC[i];
      vec3 q = P - (e + vec3(sign(e.x) * 0.27, -0.02, -0.12));
      float a = atan(q.y, abs(q.x));
      cf += exp(-dot(q, q) / 0.012) * pow(0.5 + 0.5 * sin(a * 11.0), 8.0);
    }
    float nl = 0.0;
    for (int s = -1; s <= 1; s += 2) {
      vec3 a = uNose + vec3(float(s) * 0.13, 0.03, -0.14);
      vec3 b = vec3(float(s) * (uMouth.w + 0.05), uMouth.y - 0.03, uMouth.z - 0.03);
      vec3 ab = b - a;
      float h = clamp(dot(P - a, ab) / dot(ab, ab), 0.0, 1.0);
      nl += exp(-pow(distance(P, a + ab * h) / 0.022, 2.0)) * (1.0 - h * 0.4);
    }
    c *= 1.0 - uAge * (0.2 * fh * lines + 0.28 * cf + 0.22 * nl);
  }
  // make-up
  c = mix(c, uLip.rgb, uLip.a * lips);
  c = mix(c, uShadow.rgb, uShadow.a * smoothstep(0.08, 0.55, lid) * (1.0 - smoothstep(0.8, 0.95, lid) * 0.5));
  c = mix(c, uLiner.rgb, uLiner.a * smoothstep(0.8, 0.97, lid));
  return c;
}
`;

export function patchSkin(mat: THREE.MeshPhysicalMaterial, u: SkinUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u as unknown as Uniforms);
    patchHeadPos(shader, "attribute vec4 aFx;\nattribute float aCover;\nvarying vec4 vFx;\nvarying float vCover;", " vFx = aFx; vCover = aCover;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SKIN_FRAG}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n diffuseColor.rgb = skinFx(diffuseColor.rgb);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
 float skinLip = smoothstep(0.28, 0.62, vFx.x);
 float skinOil = max(smoothstep(0.15, 0.55, vHeadP.z) * exp(-pow(vHeadP.x / 0.23, 2.0)), skinLip);
 roughnessFactor = clamp(roughnessFactor + (surfaceNoise(vHeadP * 32.0) - 0.5) * 0.09 - skinOil * 0.1, 0.38, 0.8);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
 float skinDetail = surfaceDetail(vHeadP, 140.0);
 float pores = surfaceNoise(vHeadP * 140.0);
 float skinHeight = (pores - 0.5) * 0.0007 * skinDetail * (1.0 - smoothstep(0.12, 0.55, vFx.y));
 normal = surfaceNormal(normal, skinHeight);`);
  };
  mat.customProgramCacheKey = () => "headz-skin-surface-v2";
}

// ── fade (neck) ───────────────────────────────────────────────────────────

export function patchFade(mat: THREE.MeshPhysicalMaterial, from: number, to: number) {
  const uniforms = { uFade: { value: new THREE.Vector2(from, to) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    patchHeadPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec2 uFade;\nvarying vec3 vHeadP;`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n diffuseColor.a *= smoothstep(uFade.y, uFade.x, vHeadP.y);`);
  };
  mat.customProgramCacheKey = () => "headz-fade";
  return uniforms;
}

// ── hair (two-tone / highlights) ──────────────────────────────────────────

export interface HairUniforms {
  uTip: { value: THREE.Vector4 };
  uStreak: { value: number };
  uHat: { value: number };
  uHatEnvelope: { value: THREE.Texture | null };
}

export function hairUniforms(): HairUniforms {
  return { uTip: { value: new THREE.Vector4(1, 1, 1, 0) }, uStreak: { value: 0 }, uHat: { value: 0 }, uHatEnvelope: { value: null } };
}

export function patchHair(mat: THREE.MeshPhysicalMaterial, u: HairUniforms) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u as unknown as Uniforms);
    patchHeadPos(shader, "attribute float aTip;\nvarying float vTip;", " vTip = aTip;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform vec4 uTip;\nuniform float uStreak;\nuniform float uHat;\nuniform sampler2D uHatEnvelope;\nvarying vec3 vHeadP;\nvarying float vTip;\n${SURFACE_FRAG}\nfloat hairFiber() {\n float flow = atan(vHeadP.x, vHeadP.z) * 115.0 + vHeadP.y * 32.0 + surfaceNoise(vHeadP * 5.0) * 3.0;\n float detail = 1.0 - smoothstep(0.6, 2.6, fwidth(flow));\n return (sin(flow) * 0.65 + sin(flow * 1.73 + 1.4) * 0.35) * detail;\n}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
 // Hide the hair volume covered by the actual hat; exposed ends remain visible.
 if (uHat > 0.5) {
   float r = max(length(vHeadP), 0.0001);
   vec2 uv = vec2(atan(vHeadP.x, vHeadP.z) / 6.2831853 + 0.5, asin(clamp(vHeadP.y / r, -1.0, 1.0)) / 3.14159265 + 0.5);
   float h = texture2D(uHatEnvelope, uv).r * 4.0;
   if (h > 0.0) discard;
 }
 float streak = uStreak > 0.5 ? smoothstep(0.35, 0.85, 0.5 + 0.5 * sin(atan(vHeadP.x, vHeadP.z) * 26.0 + vHeadP.y * 3.0)) * 0.85 : 0.0;
 float k = uStreak > 0.5 ? streak * smoothstep(0.0, 0.4, vTip + 0.25) : smoothstep(0.15, 0.85, vTip);
 diffuseColor.rgb = mix(diffuseColor.rgb, uTip.rgb, uTip.a * k);\n diffuseColor.rgb *= 1.0 + hairFiber() * 0.045;`,
      )
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + hairFiber() * 0.065, 0.45, 0.85);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n normal = surfaceNormal(normal, hairFiber() * 0.00045);`);
  };
  mat.customProgramCacheKey = () => "headz-hair-surface-v2";
}


/** Woven fabric for nonmetallic headwear and masks; source maps remain intact. */
export function patchFabric(mat: THREE.MeshPhysicalMaterial) {
  mat.onBeforeCompile = (shader) => {
    patchHeadPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n varying vec3 vHeadP;\n${SURFACE_FRAG}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
 float fabricDetail = surfaceDetail(vHeadP, 120.0);
 float weave = (sin(vHeadP.x * 750.0) * sin(vHeadP.y * 750.0) + sin(vHeadP.z * 750.0) * 0.3) * fabricDetail;
 diffuseColor.rgb *= 1.0 + (surfaceNoise(vHeadP * 38.0) - 0.5) * 0.05 + weave * 0.025;`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\n roughnessFactor = clamp(roughnessFactor + (surfaceNoise(vHeadP * 38.0) - 0.5) * 0.06, 0.68, 0.95);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>\n normal = surfaceNormal(normal, weave * 0.0003);`);
  };
  mat.customProgramCacheKey = () => "headz-fabric-surface-v1";
}
