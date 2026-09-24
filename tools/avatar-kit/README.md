# Avatar kit

Procedural sculpting pipeline for the Memoji-style avatar kit served from `apps/web/public/avatar-kit/`.

Shapes are built as signed distance fields (numpy), meshed with marching cubes, then cleaned up in Blender (`bpy`):
decimate, smooth, bake AO into vertex colours, add shape keys (identity warps + 52 ARKit blendshapes), export glTF,
and compress with `gltfpack -cc -kv -kn`.

```
pip install bpy==4.2.* numpy scikit-image   # Python 3.11
python build.py head
python build.py brows all | lashes all | hair <style|all>
python build.py beard|headwear|eyewear|earrings|piercing <style|all>
```

`build.py head` must run first: parts inherit the head's identity warps from `.cache/head.npz`.
