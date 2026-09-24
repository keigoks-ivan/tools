# VRoid offline pipeline prototype

This prototype is isolated from the playable game. `vroid_offline_roundtrip.py`
imports the local VRM in Blender and exports an intermediate GLB. It is the
first asset-conversion step only; it does not edit `rumi-v2.glb`, runtime JS,
or the `.vroid` source.

## Rig and action findings

The current [VRM source](vroid-swordswoman-base.vrm) has no animation clips and uses
VRM humanoid bones named `J_Bip_C_*` (103 joints in its first skin). The source
`game/assets/heroes/rumi-v2.glb` has 13 clips (`idle`, `run`, `slash1`–`slash4`,
`heavy`, `heavyfin`, `hurt`, `death`, `jump`, `win`, `roll`), each animating 53
Mixamo-named bones on a 65-joint skin. A semantic mapping exists for the major
body joints, but copying clip tracks by renaming is not a valid retarget: the
two skeletons have different rest orientations, hierarchy details, bone
lengths, and joint sets. It would need a calibrated rest-pose retarget pass
(plus validation of all 13 actions) to avoid twisted limbs and drift.

The source GLB also contains a `Hero_sword` skinned mesh on that Mixamo rig.
Its vertex weights cannot simply be attached to the VRM rig. The sword must be
rebound to the target hand or retargeted with the source skeleton, and the
current game specifically looks up `Hero_sword` for its blade trail.

## Verification status

The input files were inspected directly: the VRM has 124 glTF nodes, 3 skins,
and no animation array; the game GLB has the 13 clips and `Hero_sword`. Blender
5.2.2 imported and exported the VRM locally after allowing the app to run
outside the filesystem sandbox (its macOS Metal initialization crashed inside
the sandbox). The output was an approximately 6 MB intermediate GLB with 3
character meshes and one armature after discarding an imported collider sphere;
it was not promoted to a game asset. This round-trip exports the
VRM character alone. It neither transfers the 13 clips nor rebinds the sword,
so the calibrated retarget and visual QA remain required.
