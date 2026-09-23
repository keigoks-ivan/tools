# Game regression checks

Run from the repository root with Node.js 20 or newer. No package install, browser, GPU or audio device is required.

```sh
node --test game/tests/runtime.test.mjs game/tests/startup.test.mjs
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs ./game/tests/scene-optimizer.test.mjs
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs ./game/tests/transient-resources.test.mjs
node --check game/boot.js
node --check game/main.js
node --check game/scene-optimizer.js
git diff --check
```

The runtime tests execute the game's actual functions in a VM with controlled browser/audio dependencies. The geometry tests use the vendored Three.js implementation. These checks cover lifecycle and resource ownership; they do not replace visual or device testing.

Startup checks run the actual lightweight entry with a stubbed dynamic import, and extracted loading functions with controlled dependencies. They cover no engine load before a user action, duplicate requests, mute handoff, per-stage dependencies, caching and failed-stage retry. They never import the full game engine or create WebGL.

## Runtime GLB packaging

Original GLBs stay in `game/assets/`. Rebuild only their runtime copies after changing source models or `E_ANIMS`:

```sh
python3 game/scripts/prepare_runtime_assets.py
python3 game/scripts/prepare_runtime_assets.py --check
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s game/tests -p 'test_runtime_assets.py'
```

The packer drops unreachable animation data and the Maria normal map that `toonify()` discards. It never resamples geometry, animation values, or image pixels. Asset checks compare retained payloads and metadata with the source GLBs without loading the game or using a GPU. Bump `RUNTIME_ASSET_VERSION` in main.js when publishing regenerated GLBs.
