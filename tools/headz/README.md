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

Also per base (`info.json → fit`, written by `build.mjs` into the catalogue + `<base>/fit.bin`):
eyeball spheres / gaze axis / iris + pupil angles, face landmarks (nose, mouth corners, chin, jaw,
temples, ears) and a 32×64 uint8 spherical radius map of the head. The runtime uses them for the
procedural eyes, the face-shape sliders, and to seat any part (hair, beards, hats…) on any base.
Morphs for beards / masks, make-up regions and the neck are derived at runtime (no extra bytes).
`python export.py --measure <out_dir> [ids]` re-measures already exported faces without the sources.

## Part fit check (which hair / beards / glasses / hats each base offers)

Any part can be worn by any base (re-seated at runtime), but some misfit — e.g. a woman's bob
over an elder man's eyes. After `build.mjs`, from `apps/web`:

```
node --import ./src/lib/avatar/__tests__/register.mjs scripts/headz-fit.mjs [--json report.json]
```

places every (base, part) pair exactly like the renderer (`deform.ts placePart`) and measures it
(`lib/avatar/headz/fit.ts`: share of the eye openings / brows / central face hidden, skin poking
through the part, lens offset from the eyes — compared with the part on its own base). Passing parts
are written to `src/lib/avatar/headz/compat.gen.ts`; the studio offers only those (own group first),
saved configs with a part that no longer fits fall back to the base's default, and
`src/lib/avatar/__tests__/fit.test.mjs` re-measures every offered pair. Grid check:
`/dev/headz-lab?mode=fit&base=oldman-medium&slot=hair[&all=1]`.

## Floating hands

```
HEADZ_SRC=/path/to/sources python export_hands.py   # → apps/web/public/avatar/hands/<group>.glb (+ manifest.gen.ts)
```

`export_hands.py` takes the Memoji-style floating hand islands of each group's White source, bakes
them (rest pose, 1× subdivision, ≤ 3.2k tris per hand) onto a minimal 21-bone skeleton that maps 1:1
to MediaPipe's hand landmarks (`wrist`, `<finger>0‥3` + zero-weight `<finger>Tip` markers; weights
remapped from the Rigify `DEF-hand/palm/f_*/thumb` bones) and packs both hands of a group into one
GLB with gltfpack (~57 KB). One untextured `skin` material — the runtime tints it with the avatar's
skin tone. Identical groups are de-duplicated; the girl source has no floating hands and uses the
boy's. Hands live outside `public/avatar/headz/` on purpose: `build.mjs` wipes that folder.
Runtime: `apps/web/src/lib/avatar/headz/hands/*` (solver tests: `node --test src/lib/avatar/headz/hands/__tests__/*.test.mjs`).
