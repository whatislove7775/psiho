// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/schema.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, migrateLegacy, normalizeAvatar, randomAvatar, toneOf } from "../schema.ts";
import { CATALOG, headzOptions, headzOptionsAll, headzPart, resolvePart } from "../headz/catalog.ts";

const LEGACY = {
  version: 1,
  skin: { tone: "#5E3826", blush: 0.3, freckles: "none", mole: "none", age: "adult" },
  head: { shape: "oval", chin: "soft", cheeks: 0.4 },
  hair: { style: "long-wavy", color: "#3A2A20", highlight: null },
  eyes: { shape: "almond", color: "#3E6FA6", lashes: "natural", shadow: null, size: 0.5 },
  facialHair: { style: "none", color: "#3A2A20" },
  eyewear: { style: "round", frameColor: "#111114", lensColor: "#3A6DF0", tint: 0 },
  headwear: { style: "none", color: "#3A6DF0" },
};

test("catalogue: every base has a face and at least one hair option", () => {
  assert.ok(CATALOG.bases.length >= 6);
  for (const b of CATALOG.bases) {
    assert.match(b.face, /^\/avatar\/headz\/.+\/face\.glb$/);
    assert.ok(headzOptions(b.id, "hair").length > 0, b.id);
  }
});

test("v1 configs migrate to the closest HEADZ character", () => {
  const c = normalizeAvatar(LEGACY);
  assert.equal(c.version, 4);
  assert.equal(c.base, "woman-dark"); // long hair + dark skin
  assert.equal(c.hairColor, "#3A2A20");
  assert.equal(c.eyeColor, "#3E6FA6");
  assert.notEqual(c.eyewear, "none");
  assert.ok(headzPart(c.base, "eyewear", c.eyewear));
  const bearded = migrateLegacy({ ...LEGACY, hair: { style: "crew" }, facialHair: { style: "full-beard" }, skin: { tone: "#FDE7D6" } });
  assert.equal(bearded.base, "man-light");
  assert.notEqual(bearded.beard, "none");
  const senior = migrateLegacy({ ...LEGACY, skin: { tone: "#BF8055", age: "senior" } });
  assert.equal(senior.base, "oldwoman-medium");
});

test("tones from legacy skin colours", () => {
  assert.equal(toneOf("#FDE7D6"), "light");
  assert.equal(toneOf("#A96D46"), "medium");
  assert.equal(toneOf("#452A1D"), "dark");
});

test("normalize repairs unknown options and colours, keeps valid v3 values", () => {
  const good = { ...DEFAULT_AVATAR, hairColor: "#aabbcc" };
  assert.deepEqual(normalizeAvatar(good), { ...good, hairColor: "#AABBCC" });
  const bad = normalizeAvatar({ ...DEFAULT_AVATAR, hair: "nope", eyewear: 7, eyeColor: "blue", skin: "#12" });
  assert.equal(bad.hair, CATALOG.bases.find((b) => b.id === bad.base).defaults.hair);
  assert.equal(bad.eyewear, "none");
  assert.equal(bad.eyeColor, null);
  assert.equal(bad.skin, null);
  assert.deepEqual(normalizeAvatar(null), DEFAULT_AVATAR);
});

test("v3 configs migrate to v4 with defaults", () => {
  const v3 = { version: 3, base: "man-light", hair: headzOptions("man-light", "hair")[0].id, beard: "none", eyewear: "none",
    headwear: "none", earrings: "none", hairColor: "#3A2A20", eyeColor: null, skin: "#aa7755" };
  const c = normalizeAvatar(v3);
  assert.equal(c.version, 4);
  assert.equal(c.hair, v3.hair);
  assert.equal(c.skin, "#AA7755");
  assert.equal(c.mask, "none");
  assert.deepEqual(c.face, {});
  assert.deepEqual(c.eyes, { style: "natural", lashes: 0 });
  assert.deepEqual(c.acc.piercings, []);
});

test("v4 values are clamped and filtered", () => {
  const c = normalizeAvatar({
    ...DEFAULT_AVATAR,
    face: { jaw: 3, chin: -0.5, bogus: 1, eyeSize: 0 },
    skinFx: { blush: -1, freckles: 0.5, moles: 7, age: "x" },
    eyes: { style: "laser", lashes: 0.4 },
    brows: { style: "arched", thickness: 2, color: "#abcdef" },
    acc: { piercings: ["nose", "tongue", "nose"], frame: "#000000" },
  });
  assert.deepEqual(c.face, { jaw: 1, chin: -0.5 });
  assert.deepEqual(c.skinFx, { blush: 0, freckles: 0.5, moles: 3, age: 0 });
  assert.deepEqual(c.eyes, { style: "natural", lashes: 0.4 });
  assert.deepEqual(c.brows, { style: "arched", thickness: 1, color: "#ABCDEF" });
  assert.deepEqual(c.acc.piercings, ["nose"]);
  assert.equal(c.acc.frame, "#000000");
});

test("parts of any group resolve on any base (cross-group ids)", () => {
  const all = headzOptionsAll("woman-light", "hair");
  const foreign = all.find((o) => o.group === "man");
  assert.ok(foreign && foreign.qid.startsWith("man."));
  const c = normalizeAvatar({ ...DEFAULT_AVATAR, base: "woman-light", hair: foreign.qid, beard: "oldman.beard" });
  assert.equal(c.hair, foreign.qid);
  const r = resolvePart("woman-light", "hair", foreign.qid);
  assert.ok(r && r.src.startsWith("man-") && r.url.endsWith(".glb"));
  const fallback = CATALOG.bases.find((b) => b.id === DEFAULT_AVATAR.base).defaults.hair;
  assert.equal(normalizeAvatar({ ...DEFAULT_AVATAR, hair: "nope.001" }).hair, fallback);
});

test("the default avatar is neutral: no beard, make-up or accessories", () => {
  const d = DEFAULT_AVATAR;
  assert.deepEqual(normalizeAvatar(d), d);
  for (const k of ["beard", "eyewear", "headwear", "earrings", "mask"]) assert.equal(d[k], "none");
  assert.equal(d.makeup.lip, null);
  assert.deepEqual(d.face, {});
  assert.deepEqual(d.acc.piercings, []);
});

test("randomAvatar is deterministic and always valid", () => {
  assert.deepEqual(randomAvatar("seed-1"), randomAvatar("seed-1"));
  for (let i = 0; i < 50; i++) {
    const c = randomAvatar(i, i % 2 === 0);
    assert.deepEqual(normalizeAvatar(c), c);
    assert.ok(!c.base.startsWith("boy") && !c.base.startsWith("girl"));
  }
});
