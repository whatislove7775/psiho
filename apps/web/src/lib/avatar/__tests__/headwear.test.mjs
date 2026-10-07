import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { resolvePart } from '../headz/catalog.ts';
import { placePart } from '../headz/deform.ts';
import { headwearEnvelope, tuckHair } from '../headz/headwearFit.ts';
import { faceOf, loadMeshes } from '../../../../scripts/headz-fit.mjs';

async function parts(base, slot, qid) {
  const res = resolvePart(base, slot, qid), dst = await faceOf(base), src = await faceOf(res.src);
  return (await loadMeshes(res.url)).map(m => {
    const pos = m.pos.slice();
    placePart(pos, slot, res.src === base ? null : src.map, dst.map, () => dst.surface);
    return { pos, index: m.index };
  });
}
for (const [base, hat, hair] of [
  ['man-medium','boy.cap','002'], ['man-dark','boy.cap','005'],
  ['woman-medium','hat','005'], ['oldwoman-medium','hat-grey','1'],
  ['boy-medium','cap','6'], ['oldman-light','cap-green-white','4'],
]) test(`${base} ${hat}: hair remains behind the real hat surface`, async () => {
  const hats = await parts(base, 'headwear', hat), hairs = await parts(base, 'hair', hair);
  const envelope = headwearEnvelope(hats), group = new THREE.Group();
  for (const h of hats) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(h.pos,3));
    if(h.index) g.setIndex(Array.from(h.index));
    group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
  }
  group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), direction = new THREE.Vector3(); let checked = 0, leaks = 0;
  for (const h of hairs) {
    tuckHair(h.pos, envelope);
    for (let i = 0; i < h.pos.length; i += 3) {
      direction.fromArray(h.pos,i); const r = direction.length(); direction.normalize();
      ray.set(new THREE.Vector3(),direction);
      const hit = ray.intersectObjects(group.children,false)[0];
      if (!hit) continue;
      checked++;
      if(r > hit.distance - 0.005) leaks++;
    }
  }
  assert.ok(checked > 20);
  assert.equal(leaks, 0, `${leaks}/${checked} sampled strands cross the actual hat`);
});
