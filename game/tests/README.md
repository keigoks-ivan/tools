# Game regression checks

Run from the repository root with Node.js 20 or newer. No package install, browser, GPU or audio device is required.

```sh
node --test game/tests/runtime.test.mjs
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs ./game/tests/scene-optimizer.test.mjs
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs ./game/tests/transient-resources.test.mjs
node --check game/main.js
node --check game/scene-optimizer.js
git diff --check
```

The runtime tests execute the game's actual functions in a VM with controlled browser/audio dependencies. The geometry tests use the vendored Three.js implementation. These checks cover lifecycle and resource ownership; they do not replace visual or device testing.
