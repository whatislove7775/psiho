// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/schema.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_AVATAR, migrateLegacy, normalizeAvatar, randomAvatar, toneOf } from "../schema.ts";
import { CATALOG, headzOptions, headzPart } from "../headz/catalog.ts";

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
  assert.equal(c.version, 3);
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

test("randomAvatar is deterministic and always valid", () => {
  assert.deepEqual(randomAvatar("seed-1"), randomAvatar("seed-1"));
  for (let i = 0; i < 50; i++) {
    const c = randomAvatar(i);
    assert.deepEqual(normalizeAvatar(c), c);
    assert.ok(!c.base.startsWith("boy") && !c.base.startsWith("girl"));
  }
});
