# Runtime model assets

These GLBs are generated from the original files in `game/assets/` by
`game/scripts/prepare_runtime_assets.py`. The originals remain unchanged.

Maria's retained base-color texture is encoded as **lossless WebP** inside
`maria.glb`, referenced through the required glTF `EXT_texture_webp`
extension. The vendored Three.js GLTFLoader supports this extension. The
runtime model keeps the source image's dimensions and every decoded RGBA pixel;
the original PNG remains in `game/assets/maria.glb`.

Regeneration and `--check` require Pillow built with WebP support. The generated
WebP bytes are deterministic for a given Pillow/libwebp version; this asset was
generated with Pillow 11.3.0 and libwebp 1.5.0. To regenerate and verify:

```sh
python3 game/scripts/prepare_runtime_assets.py
python3 game/scripts/prepare_runtime_assets.py --check
```
