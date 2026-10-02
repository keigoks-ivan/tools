# Free combat animation sources

All imported animation data is **CC0**. No paid files or commercial-game animation assets are included.

- Creator: Kay Lousberg.
- Pack: [KayKit – Character Animations, Free 1.1](https://kaylousberg.itch.io/kaykit-character-animations).
- License: `KayKit-LICENSE.txt`, copied verbatim from the free download.
- Bow source: `Animations/gltf/Rig_Medium/Rig_Medium_CombatRanged.glb`, SHA-256 `7fef1fc0e7b0feafd34b8e12d23f514c8c1f9d068047a691b854b56f1774dff5`.
- Two-handed source: `Animations/gltf/Rig_Medium/Rig_Medium_CombatMelee.glb`, SHA-256 `c55e6ec1c79e83ae21d46fe1cd921c1b64be8b9a524a24517e51c6ba99231459`.

`game/scripts/import_free_motion.mjs` samples only the selected bow and two-handed clips at 30 Hz. It strips meshes/textures and emits bind-pose transforms and optimized animation tracks in `3d-next/free-motion-data.js`. Rebuild from the free ZIP with:

```sh
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/import_free_motion.mjs /path/Rig_Medium_CombatRanged.glb /path/Rig_Medium_CombatMelee.glb
```

`free-motion.js` retargets source world rotations through source and target bind poses. `hero-motion.js` bakes the result at 90 Hz into the existing animation clips. The bow keeps imported torso/head and drawing-wrist movement, with IK correction for the grip, cheek anchor, planted stance and release clock. The long weapon follows the imported weapon socket rotation and two-handed hand trajectories, with a rigid 40 cm grip, torso clearance and grounded footwork. `hero-equipment.js` corrects the supporting palm after crossfades. These are authored source animations, not motion capture.

Single-player, multiplayer teammates and the turntable use the same baked clips. The preview-only composite clips play the actual early-cancel sequence; they are never sent to the relay.
