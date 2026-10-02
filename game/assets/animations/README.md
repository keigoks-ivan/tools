# Hero motion capture (Mixamo)

蒼鋒 (great sword), 金燕 (dual blades) and 翠翎 (longbow) animate from Adobe Mixamo motion capture, retargeted offline to the VRoid hero rig and shipped as `3d-next/mocap-data.js` (bones only — no Mixamo character mesh or texture is included). Mixamo animations may be used royalty-free in games; the raw FBX files are not redistributed here.

| Source pack (downloaded 2026-10-02) | SHA-256 of the ZIP | Clips used |
|---|---|---|
| Great Sword Pack | `9669e1d09c4f15e45d996bd76adbc71d31aef41c4a0ab92709824783bc9f2502` | idle (2), run, slash (3), slide attack, casting, attack, power up, high spin attack, jump attack |
| Pro Longbow Pack | `b7dc6548ca8cc75f65d96a418cb6562d115859b4366a7389e494395d1b85aa33` | standing idle 01, standing run forward, standing draw arrow, standing aim recoil, standing dodge backward, fall a loop |

Single animations for 金燕 (Maria character, FBX without skin, 30 fps; SHA-256 of each FBX):

| Animation | SHA-256 |
|---|---|
| Dual Weapon Combo | `d4b13c17b648fe12588bd25f93d3131bf65dd045e5cfae7f0ffacfd380f5c8db` |
| One Hand Sword Combo | `c51c98512002ecb8c8502be6a296f42442f72c9ff4162cb6043f6897a20776e6` |
| Double Dagger Stab | `0f217b4002f71c4104538b0d4e818256860e2a6c5fe6643ce6f2944d66d4add8` |
| Flip Kick | `9243a4249241ed46bb53ca68a83633513ca4bc1863ea89473efee995e068c92f` |
| Front Twist Flip | `e9120d6f5d5eafdacd53273ccad51210d4caed4ed445b6cce1374791a6cb183c` |

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
$B -b --python $S/retarget_fbx.py -- game/design/vroid-swordswoman-v4.blend /tmp/am_rt.blend \
  am_dual_weapon_combo="Dual Weapon Combo.fbx" am_one_hand_sword_combo="One Hand Sword Combo.fbx" am_double_dagger_stab="Double Dagger Stab.fbx" \
  am_flip_kick="Flip Kick.fbx" am_front_twist_flip="Front Twist Flip.fbx"
# 2. Armature-only GLBs with just those actions.
$B -b /tmp/gs_rt.blend --python $S/export_mocap_actions.py -- /tmp/gs_sel.glb gs_idle_2 gs_run gs_slash_3 gs_slide_attack gs_casting gs_attack gs_power_up gs_high_spin_attack gs_jump_attack
$B -b /tmp/lb_rt.blend --python $S/export_mocap_actions.py -- /tmp/lb_sel.glb lb_standing_idle_01 lb_standing_run_forward lb_standing_draw_arrow lb_standing_aim_recoil lb_standing_dodge_backward lb_fall_a_loop
$B -b /tmp/am_rt.blend --python $S/export_mocap_actions.py -- /tmp/am_sel.glb am_dual_weapon_combo am_double_dagger_stab am_one_hand_sword_combo am_flip_kick am_front_twist_flip
# 3. Data module (refuses a skeleton whose rest pose differs from swordswoman-v4.glb).
node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/import_mocap.mjs /tmp/gs_sel.glb /tmp/lb_sel.glb /tmp/am_sel.glb
```

## How the game uses it

`3d-next/hero-motion.js` time-warps each capture so its fastest blade or release frame lands on the hit time in `heroes.js`, crossfades captures for chained and ultimate moves, damps the hips' floor travel (the combat code moves the hero), and lifts the hips if a crossfade would sink a foot below the floor. Every bone keeps its captured motion. `hero-equipment.js` settles 蒼鋒's left palm on the 34 cm grip; `hero-bow.js` pulls 翠翎's string by the captured draw length. These are human performances, played faster than real time where the combat clock requires it.
