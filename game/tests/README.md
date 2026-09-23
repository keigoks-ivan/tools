# Game regression checks

Run from the repository root with Node.js 20 or newer. The Node suite uses the vendored Three.js loader; no package install, browser, GPU or audio device is required. The Python asset checks need Pillow with WebP support.

```sh
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs --test game/tests/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s game/tests -p 'test_runtime_assets.py'
node --check game/boot.js
node --check game/main.js
node --check game/encounter-policy.js
node --check game/skeleton-sharing.js
git diff --check
```

The Node tests execute game functions in a VM with controlled browser/audio dependencies and use vendored Three.js for geometry and cloned-skeleton checks. They cover input buffering, spawn limits and wave order, loading, rendering helpers and resource ownership; they do not replace visual or device testing.

Frame pacing tests use synthetic 60/120 Hz callbacks, jitter and stalls. The skinned-asset test parses all five actual runtime enemy GLBs with the vendored loader, omitting image references only in an in-memory copy to avoid browser image APIs. It checks merged buffers and animated vertex positions, then validates cloned poses. The original files are never rewritten; framebuffer appearance still needs browser testing.

Startup checks run the actual lightweight entry with a stubbed dynamic import, and extracted loading functions with controlled dependencies. They cover no engine load before a user action, duplicate requests, mute handoff, per-stage dependencies, caching and failed-stage retry. They never import the full game engine or create WebGL.

## Runtime GLB packaging

Original GLBs stay in `game/assets/`. Rebuild only their runtime copies after changing source models or `E_ANIMS`:

```sh
python3 game/scripts/prepare_runtime_assets.py
python3 game/scripts/prepare_runtime_assets.py --check
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s game/tests -p 'test_runtime_assets.py'
```

The packer drops unreachable animation data and the Maria normal map that `toonify()` discards. The two Python asset tests cover the enemy GLBs and Maria GLB. Maria's base-color images are encoded as lossless WebP; the checks compare decoded pixels exactly with the source, alongside geometry, skeletons and animation data. Pillow must include WebP support for generation and these tests. They inspect files without loading the game or using a GPU. Bump `RUNTIME_ASSET_VERSION` in main.js when publishing regenerated GLBs.
