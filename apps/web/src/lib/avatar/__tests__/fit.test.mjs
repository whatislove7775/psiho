// Run: node --import ./src/lib/avatar/__tests__/register.mjs --test src/lib/avatar/__tests__/fit.test.mjs
// Every part the studio offers on a base (own group + compatible cross-group parts) must pass the
// automatic fit check (lib/avatar/headz/fit.ts), re-measured here from the shipped GLBs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG, headzOptionsAll } from "../headz/catalog.ts";
import { fitWhy } from "../headz/fit.ts";
import { normalizeAvatar } from "../schema.ts";
import { FIT_SLOTS, measurePair } from "../../../../scripts/headz-fit.mjs";

for (const slot of FIT_SLOTS)
  test(`every offered ${slot} fits its base`, { timeout: 600000 }, async () => {
    const bad = [];
    for (const b of CATALOG.bases)
      for (const o of headzOptionsAll(b.id, slot)) {
        const r = await measurePair(b.id, slot, o.qid);
        assert.ok(r, `${b.id} ${slot} ${o.qid} resolves`);
        const why = fitWhy(slot, r.m, r.ref);
        if (why.length) bad.push(`${b.id} ${o.qid}: ${why.join(", ")}`);
      }
    assert.deepEqual(bad, []);
  });

test("the known misfit (woman's bob on an elder man) is not offered", () => {
  const offered = headzOptionsAll("oldman-medium", "hair").map((o) => o.qid);
  assert.ok(!offered.includes("woman.004"));
  // own group first
  assert.equal(offered[0], "1");
});

test("saved configs with a hair that doesn't fit fall back to the base's default", () => {
  const c = normalizeAvatar({ version: 4, base: "oldman-medium", hair: "woman.004" });
  assert.equal(c.hair, CATALOG.bases.find((b) => b.id === "oldman-medium").defaults.hair);
  // a fitting cross-group hair stays
  const ok = headzOptionsAll("oldman-medium", "hair").find((o) => o.qid.includes("."));
  assert.equal(normalizeAvatar({ version: 4, base: "oldman-medium", hair: ok.qid }).hair, ok.qid);
});
