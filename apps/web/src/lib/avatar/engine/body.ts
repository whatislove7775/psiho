/**
 * Memoji-style "floating head": only a short neck under the head — no
 * shoulders or clothing (outfit settings stay in the schema, not rendered).
 */
import * as THREE from "three";
import type { AvatarConfig } from "../schema";

export const NECK_TOP = -0.5;
export const NECK_BASE = -1.12;

export function buildBody(_cfg: AvatarConfig, skin: THREE.Material): { group: THREE.Group; materials: THREE.Material[] } {
  const g = new THREE.Group();
  const profile = [
    new THREE.Vector2(0.0, NECK_BASE - 0.04),
    new THREE.Vector2(0.22, NECK_BASE - 0.035),
    new THREE.Vector2(0.33, NECK_BASE - 0.01),
    new THREE.Vector2(0.36, NECK_BASE + 0.05),
    new THREE.Vector2(0.35, (NECK_TOP + NECK_BASE) / 2),
    new THREE.Vector2(0.38, NECK_TOP),
    new THREE.Vector2(0.42, NECK_TOP + 0.25),
  ];
  const neck = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), skin);
  neck.scale.z = 0.88;
  neck.position.z = -0.1;
  g.add(neck);
  return { group: g, materials: [] };
}
