#!/usr/bin/env node
/**
 * Step 2 of the HEADZ pipeline: compress the GLBs written by export.py with
 * gltfpack (meshopt, quantised; morph target names kept), de-duplicate parts
 * that are identical across the skin variants of a group, and write
 *   apps/web/public/avatar/headz/**            (runtime assets, committed)
 *   apps/web/src/lib/avatar/headz/catalog.gen.ts (catalogue for the app)
 *
 *   node build.mjs <export_dir>
 *
 * Only derived, optimised runtime assets end up in the repo — never the
 * purchased sources (see README.md).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const PUBLIC = path.join(ROOT, "apps/web/public");
const OUT = path.join(PUBLIC, "avatar/headz");
const GEN = path.join(ROOT, "apps/web/src/lib/avatar/headz/catalog.gen.ts");
const SRC = process.argv[2];
if (!SRC) {
  console.error("usage: node build.mjs <export_dir>");
  process.exit(1);
}
const GLTFPACK = process.env.GLTFPACK || "gltfpack";
const SLOTS = ["hair", "beard", "eyewear", "headwear", "earrings", "mask"];
const GROUP_ORDER = ["woman", "man", "girl", "boy", "oldwoman", "oldman"];
const TONE_ORDER = ["light", "medium", "dark"];

// Parts that don't sit on the head once exported (checked by eye) — excluded.
// man/hair-hair-10 floats ~0.3 above the scalp in the source (bone-parented, not on the rest pose).
const EXCLUDE = new Set(["man/hair-hair-10", ...(process.env.HEADZ_EXCLUDE || "").split(",").filter(Boolean)]);

function pack(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const args = ["-i", src, "-o", dst, "-cc", "-kn", "-km"];
  try {
    execFileSync(GLTFPACK, args, { stdio: "pipe" });
  } catch {
    execFileSync("npx", ["--yes", "gltfpack@0.22.0", ...args], { stdio: "pipe" });
  }
  return fs.statSync(dst).size;
}

const lin2srgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const hex = (rgb) =>
  "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, lin2srgb(c))) * 255).toString(16).padStart(2, "0")).join("");

const lum = (h) => {
  const n = parseInt(h.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};
const TONE_LUM = { medium: 0.45, dark: 0.28 };
const TONE_SKIN = { medium: "#b07550", dark: "#6e4330" };

const optionId = (slot, key) => key.replace(new RegExp(`^${slot}-`), "").replace(/^hair-/, "").replace(/[^a-z0-9-]/g, "") || slot;

fs.rmSync(OUT, { recursive: true, force: true });
const bases = [];
const options = {};
for (const dir of fs.readdirSync(SRC).sort()) {
  const infoPath = path.join(SRC, dir, "info.json");
  if (!fs.existsSync(infoPath)) continue;
  const info = JSON.parse(fs.readFileSync(infoPath, "utf8"));
  const { id, group } = info;
  const tone = id.split("-").pop();
  const faceDst = path.join(OUT, id, "face.glb");
  const faceBytes = pack(path.join(SRC, dir, "face.glb"), faceDst);
  const lodDst = path.join(OUT, id, "face-lod.glb");
  const hasLod = fs.existsSync(path.join(SRC, dir, "face-lod.glb"));
  if (hasLod) pack(path.join(SRC, dir, "face-lod.glb"), lodDst);
  const mat = (role) => info.materials.find((m) => m.role === role);
  const hairPart = info.parts.find((p) => p.slot === "hair" && p.visible) ?? info.parts.find((p) => p.slot === "hair");
  // elders' authored hair shader is a stylised ramp; silver reads better as the default
  const hairColor = group.startsWith("old") ? [0.62, 0.6, 0.57] : hairPart?.materials?.[0]?.color ?? mat("brows")?.color ?? [0.02, 0.015, 0.01];
  // spherical radius map of the head (uint8) — lets the runtime fit a part made for one base onto another
  let fit;
  if (info.fit?.radius) {
    const fitDst = path.join(OUT, id, "fit.bin");
    fs.writeFileSync(fitDst, Buffer.from(info.fit.radius, "base64"));
    fit = "/" + path.relative(PUBLIC, fitDst).split(path.sep).join("/");
  }
  let skin = hex(mat("skin")?.color ?? [0.5, 0.3, 0.2]);
  // a few sources carry a pale head material on darker bases (boys): use a tone-true default
  if (tone !== "light" && lum(skin) - TONE_LUM[tone] > 0.12) skin = TONE_SKIN[tone];
  const base = {
    id,
    group,
    tone,
    face: "/" + path.relative(PUBLIC, faceDst).split(path.sep).join("/"),
    lod: hasLod ? "/" + path.relative(PUBLIC, lodDst).split(path.sep).join("/") : undefined,
    bytes: faceBytes,
    tris: info.face.tris,
    skin,
    hair: hex(hairColor),
    iris: hex(mat("iris")?.color ?? [0.05, 0.03, 0.02]),
    defaults: {},
    ...(fit ? { fit, eyes: info.fit.eyes, lm: info.fit.lm } : {}),
  };
  bases.push(base);
  options[group] ??= Object.fromEntries(SLOTS.map((s) => [s, []]));
  for (const p of info.parts) {
    if (EXCLUDE.has(`${group}/${p.key}`)) continue;
    const oid = optionId(p.slot, p.key);
    const file = path.join(OUT, group, `${p.slot}-${oid}-${p.hash.slice(0, 8)}.glb`);
    const url = "/" + path.relative(PUBLIC, file).split(path.sep).join("/");
    const bytes = fs.existsSync(file) ? fs.statSync(file).size : pack(path.join(SRC, dir, p.key + ".glb"), file);
    const list = options[group][p.slot];
    let opt = list.find((o) => o.id === oid);
    if (!opt) {
      opt = { id: oid, files: {}, color: hex(p.materials?.[0]?.color ?? [0.5, 0.5, 0.5]), bytes, tris: p.tris };
      list.push(opt);
    }
    opt.files[id] = url;
    if (p.rim) (opt.rims ??= {})[id] = p.rim;
    if (p.visible && (p.slot === "hair" || p.slot === "beard") && !base.defaults[p.slot]) base.defaults[p.slot] = oid;
    opt.bytes = Math.max(opt.bytes, bytes);
  }
  console.log(`${id}: face ${(faceBytes / 1024).toFixed(0)} KB, ${info.parts.length} parts`);
}

bases.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone));
for (const g of Object.keys(options)) for (const s of SLOTS) options[g][s].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
for (const b of bases) {
  const hair = options[b.group].hair.find((o) => o.files[b.id]);
  if (hair && !b.defaults.hair) b.defaults.hair = hair.id;
}

const catalog = { version: createHash("sha1").update(JSON.stringify({ bases, options })).digest("hex").slice(0, 10), bases, options };
fs.writeFileSync(
  GEN,
  `/* eslint-disable */\n// Generated by tools/headz/build.mjs — do not edit.\nimport type { HeadzCatalog } from "./types";\n\nexport const CATALOG: HeadzCatalog = ${JSON.stringify(catalog, null, 1)};\n`,
);

let total = 0;
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : (total += fs.statSync(path.join(d, e.name)).size)));
walk(OUT);
console.log(`bases ${bases.length}, total ${(total / 1024 / 1024).toFixed(2)} MB → ${path.relative(ROOT, OUT)}`);
