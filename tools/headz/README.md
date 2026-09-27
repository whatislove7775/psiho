# HEADZ avatars pipeline

Turns the purchased **HEADZ 2.0** characters (ThreeDee) into the web runtime assets used by
`apps/web/src/lib/avatar/headz/HeadzRenderer.ts`.

**Licence:** using/modifying the models in a commercial website is allowed; redistributing the
source files is not. So the `.blend`/`.psd`/texture sources are **never** copied into the repo or
`public/` — the scripts read them from an external folder (`HEADZ_SRC`) and only the derived,
optimised GLBs (like a game would ship) are committed. `.gitignore` blocks `*.blend`, `*.psd` and
local source folders.

```
# 1) Blender 4.2 as a Python module (pip install bpy==4.2.*), sources unzipped:
#    $HEADZ_SRC/male/Source files/{White,Brown,Black}.blend
#    $HEADZ_SRC/female/Female - Source files/{White,Brown,Black}.blend
#    $HEADZ_SRC/kids/Kids - Blender source files/{White,Brown,Black}_{Boy,Girl}.blend
#    $HEADZ_SRC/elders/Elderz - Blender Source files/{White,Brown,Black} Older {Male,Female}.blend
HEADZ_SRC=/path/to/sources python export.py /tmp/headz-out            # all 18 bases (or pass base ids / groups)
# 2) compress (gltfpack, meshopt) + catalogue
node build.mjs /tmp/headz-out    # → apps/web/public/avatar/headz/**, apps/web/src/lib/avatar/headz/catalog.gen.ts
```

`export.py`, per base (`man|woman|boy|girl|oldman|oldwoman` × `light|medium|dark`):

- finds the collection with the shape-keyed face, evaluates every mesh with all modifiers in the
  rig's **rest** pose and re-samples each ARKit key as `evaluated(key=1) − evaluated(basis)` (so keys on
  meshes with subsurf/mask modifiers survive); names are canonicalised (`eyeLookSquintLeft` →
  `eyeSquintLeft`, `browOuterUpleft` → `browOuterUpLeft`), zero keys dropped, missing eye-look keys of
  one eye mirrored from the other;
- keeps only the head (floating hands/body islands removed), normalises to one head space
  (chin → crown = 2 units, head centre at the origin, glTF +Y up / +Z front);
- rebuilds materials as plain PBR named by role (`skin`, `iris`, `hair`, …); procedural iris shaders
  are baked (Cycles) to small greyscale textures so the eye colour can be changed at runtime;
- exports hair / beards / glasses / hats / earrings as separate GLBs (render-quality subdivision,
  decimated to ≤ 8k triangles), plus `face-lod.glb` (static, ~6k tris) for list thumbnails.

`build.mjs` packs everything with `gltfpack -cc -kn -km`, de-duplicates identical parts across the
skin variants of a group and writes the catalogue (bases, options per group/slot, authored colours,
hat rims used to clip hair under hats).
