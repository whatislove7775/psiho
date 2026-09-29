// Fit pass of the HEADZ parts: for every (base, part) pair — hair, beards, glasses, hats of every
// group — place the part exactly like the renderer does (deform.ts placePart) and measure the fit
// (lib/avatar/headz/fit.ts: eyes covered, face covered, skin poking through, lens offset).
// Writes the parts each base may offer to src/lib/avatar/headz/compat.gen.ts.
//   node --import ./src/lib/avatar/__tests__/register.mjs scripts/headz-fit.mjs [--json out.json]
// Run from apps/web after tools/headz/build.mjs (the test src/lib/avatar/__tests__/fit.test.mjs
// re-measures every offered pair).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { CATALOG, headzBase, resolvePart } from "../src/lib/avatar/headz/catalog.ts";
import { frameOf, placePart, radiusMap } from "../src/lib/avatar/headz/deform.ts";
import { fitOk, fitWhy, measureFit } from "../src/lib/avatar/headz/fit.ts";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(WEB, "public");
/** slots whose cross-group options are checked (earrings / masks are offered as they are) */
export const FIT_SLOTS = ["hair", "beard", "eyewear", "headwear"];
const GROUPS = ["woman", "man", "girl", "boy", "oldwoman", "oldman"];

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);

/** GLB without its textures (no images in Node; only geometry is needed). */
function geometryOnly(buf) {
  const len = buf.readUInt32LE(12);
  const j = JSON.parse(buf.subarray(20, 20 + len).toString());
  delete j.textures;
  delete j.images;
  delete j.samplers;
  for (const m of j.materials ?? []) {
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
  }
  j.extensionsUsed = (j.extensionsUsed ?? []).filter((e) => !/texture/i.test(e));
  if (j.extensionsRequired) j.extensionsRequired = j.extensionsRequired.filter((e) => !/texture/i.test(e));
  let js = Buffer.from(JSON.stringify(j));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const rest = buf.subarray(20 + len);
  const out = Buffer.alloc(20 + js.length + rest.length);
  buf.copy(out, 0, 0, 12);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(js.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  js.copy(out, 20);
  rest.copy(out, 20 + js.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

const glbCache = new Map();
/** Meshes of a GLB in head space: { role, pos, nrm, index } (roles as the renderer names them). */
export function loadMeshes(url) {
  let p = glbCache.get(url);
  if (!p) {
    p = loader.parseAsync(geometryOnly(readFileSync(join(PUBLIC, url))), "").then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const out = [];
      const v = new THREE.Vector3();
      const m3 = new THREE.Matrix3();
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const role = (mat?.name || "").replace(/\.\d+$/, "");
        if (role === "cloth" || role === "eyeLens") return;
        const g = o.geometry;
        const a = g.attributes.position, na = g.attributes.normal;
        const pos = new Float32Array(a.count * 3), nrm = new Float32Array(a.count * 3);
        m3.getNormalMatrix(o.matrixWorld);
        for (let i = 0; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
          pos.set([v.x, v.y, v.z], i * 3);
          if (na) {
            v.fromBufferAttribute(na, i).applyMatrix3(m3).normalize();
            nrm.set([v.x, v.y, v.z], i * 3);
          }
        }
        out.push({ role, pos, nrm, index: g.index ? g.index.array : null });
      });
      return out;
    });
    glbCache.set(url, p);
  }
  return p;
}

const mapCache = new Map();
function mapOf(b) {
  if (!b.fit) return null;
  let m = mapCache.get(b.id);
  if (!m) {
    const buf = readFileSync(join(PUBLIC, b.fit));
    m = radiusMap(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    mapCache.set(b.id, m);
  }
  return m;
}

const faceCache = new Map();
/** A base's face for the fit check + its skin surface (points + normals) for placePart. */
export async function faceOf(baseId) {
  let f = faceCache.get(baseId);
  if (!f) {
    const b = headzBase(baseId);
    const meshes = await loadMeshes(b.face);
    const skin = meshes.filter((m) => m.role === "skin" || m.role === "skinDetail" || m.role === "mouth");
    const n = skin.reduce((s, m) => s + m.pos.length, 0);
    const pos = new Float32Array(n), nrm = new Float32Array(n);
    let off = 0;
    for (const m of skin) {
      pos.set(m.pos, off);
      nrm.set(m.nrm, off);
      off += m.pos.length;
    }
    const fr = frameOf(b);
    f = {
      base: b,
      map: mapOf(b),
      surface: { pos, nrm },
      fit: {
        skin: skin.map((m) => ({ pos: m.pos, index: m.index })),
        brows: meshes.filter((m) => m.role === "brows").map((m) => ({ pos: m.pos, index: m.index })), eyes: [b.eyes?.L, b.eyes?.R].filter(Boolean), mouth: fr.mouth, chinY: fr.chin[1] },
    };
    faceCache.set(baseId, f);
  }
  return f;
}

async function measureFile(baseId, slot, url, srcId) {
  const face = await faceOf(baseId);
  const meshes = await loadMeshes(url);
  const srcMap = srcId !== baseId ? mapOf(headzBase(srcId)) : null;
  const part = meshes.map((m) => {
    const pos = m.pos.slice();
    placePart(pos, slot, srcMap, face.map, () => face.surface);
    return { pos, index: m.index };
  });
  return measureFit(slot, face.fit, part);
}

const refCache = new Map();
/**
 * Metrics of one option (qualified id) on a base, placed like the renderer places it,
 * and `ref`: the same file on the base it was made for (the authored fit).
 */
export async function measurePair(baseId, slot, qid) {
  const res = resolvePart(baseId, slot, qid);
  if (!res) return null;
  const key = `${slot}|${res.url}|${res.src}`;
  let ref = refCache.get(key);
  if (!ref) refCache.set(key, (ref = measureFile(res.src, slot, res.url, res.src)));
  const m = res.src === baseId ? await ref : await measureFile(baseId, slot, res.url, res.src);
  return { m, ref: await ref };
}

/** Every option of a slot as the base addresses it (plain id for its own group, "<group>.<id>" otherwise). */
export function allOptions(baseId, slot) {
  const own = headzBase(baseId).group;
  const groups = [own, ...GROUPS.filter((g) => g !== own)];
  const out = [];
  for (const g of groups) for (const o of CATALOG.options[g]?.[slot] ?? []) out.push({ qid: g === own ? o.id : `${g}.${o.id}`, own: g === own });
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonAt = args.indexOf("--json");
  const report = {};
  const compat = {};
  const t0 = performance.now();
  for (const b of CATALOG.bases) {
    compat[b.id] = {};
    report[b.id] = {};
    for (const slot of FIT_SLOTS) {
      const ok = [];
      for (const { qid, own } of allOptions(b.id, slot)) {
        const r = await measurePair(b.id, slot, qid);
        if (!r) continue;
        const why = fitWhy(slot, r.m, r.ref);
        report[b.id][`${slot}:${qid}`] = { ...r.m, ref: r.ref, own, pass: !why.length, why };
        if (!why.length) ok.push(qid);
        else if (own) console.warn(`own ${b.id} ${slot} ${qid}: ${why.join(", ")}`);
      }
      compat[b.id][slot] = ok;
    }
    const n = FIT_SLOTS.map((s) => `${s} ${compat[b.id][s].length}/${allOptions(b.id, s).length}`).join("  ");
    console.log(b.id.padEnd(16), n);
  }
  const body = JSON.stringify(compat, null, 1);
  writeFileSync(
    join(WEB, "src/lib/avatar/headz/compat.gen.ts"),
    `/* eslint-disable */\n// Generated by scripts/headz-fit.mjs — do not edit.\n// Parts each base may offer (qualified option ids) after the automatic fit check (lib/avatar/headz/fit.ts).\nimport type { HeadzSlot } from "./types";\n\nexport const COMPAT: Record<string, Partial<Record<HeadzSlot, string[]>>> = ${body};\n`,
  );
  if (jsonAt >= 0) writeFileSync(args[jsonAt + 1], JSON.stringify(report, null, 1));
  console.log(`done in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
