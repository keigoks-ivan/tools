# Hero motion capture (Mixamo)

蒼鋒 (great sword) and 翠翎 (longbow) animate from Adobe Mixamo motion capture, retargeted offline to the VRoid hero rig and shipped as `3d-next/mocap-data.js` (bones only — no Mixamo character mesh or texture is included). Mixamo animations may be used royalty-free in games; the raw FBX files are not redistributed here.

| Source pack (downloaded 2026-10-02) | SHA-256 of the ZIP | Clips used |
|---|---|---|
| Great Sword Pack | `9669e1d09c4f15e45d996bd76adbc71d31aef41c4a0ab92709824783bc9f2502` | idle (2), run, slash (3), slide attack, casting, attack, power up, high spin attack, jump attack |
| Pro Longbow Pack | `b7dc6548ca8cc75f65d96a418cb6562d115859b4366a7389e494395d1b85aa33` | standing idle 01, standing run forward, standing draw arrow, standing aim recoil, standing dodge backward, fall a loop |

## Rebuild

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
S=game/design/vroid-v4/scripts
# 1. Retarget (world-rotation delta, same calibration as the existing hero clips).
#    Bow clips keep the captured right-hand fingers: list them in --free.
$B -b --python $S/retarget_fbx.py -- game/design/vroid-swordswoman-v4.blend /tmp/gs_rt.blend \
  gs_idle_2="great sword idle (2).fbx" gs_run="great sword run.fbx" gs_slash_3="great sword slash (3).fbx" \
  gs_slide_attack="great sword slide attack.fbx" gs_casting="great sword casting.fbx" gs_attack="great sword attack.fbx" \
  gs_power_up="great sword power up.fbx" gs_high_spin_attack="great sword high spin attack.fbx" gs_jump_attack="great sword jump attack.fbx"
$B -b --python $S/retarget_fbx.py -- game/design/vroid-swordswoman-v4.blend /tmp/lb_rt.blend \
  lb_standing_idle_01="standing idle 01.fbx" lb_standing_run_forward="standing run forward.fbx" lb_standing_draw_arrow="standing draw arrow.fbx" \
  lb_standing_aim_recoil="standing aim recoil.fbx" lb_standing_dodge_backward="standing dodge backward.fbx" lb_fall_a_loop="fall a loop.fbx" \
  --free=lb_standing_idle_01,lb_standing_run_forward,lb_standing_draw_arrow,lb_standing_aim_recoil,lb_standing_dodge_backward,lb_fall_a_loop
# 2. Armature-only GLBs with just those actions.
$B -b /tmp/gs_rt.blend --python $S/export_mocap_actions.py -- /tmp/gs_sel.glb gs_idle_2 gs_run gs_slash_3 gs_slide_attack gs_casting gs_attack gs_power_up gs_high_spin_attack gs_jump_attack
$B -b /tmp/lb_rt.blend --python $S/export_mocap_actions.py -- /tmp/lb_sel.glb lb_standing_idle_01 lb_standing_run_forward lb_standing_draw_arrow lb_standing_aim_recoil lb_standing_dodge_backward lb_fall_a_loop
# 3. Data module (refuses a skeleton whose rest pose differs from swordswoman-v4.glb).
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/import_mocap.mjs /tmp/gs_sel.glb /tmp/lb_sel.glb
```

## How the game uses it

`3d-next/hero-motion.js` time-warps each capture so its fastest blade or release frame lands on the hit time in `heroes.js`, crossfades captures for chained and ultimate moves, and damps the hips' floor travel (the combat code moves the hero). Every bone keeps its captured motion. `hero-equipment.js` settles 蒼鋒's left palm on the 34 cm grip; `hero-bow.js` pulls 翠翎's string by the captured draw length. These are human performances, played faster than real time where the combat clock requires it.
