"""
retarget_vroid.py

Offline Mixamo -> VRoid retarget pipeline.
Run with: /Applications/Blender.app/Contents/MacOS/Blender -b --python retarget_vroid.py

Method: world-space rotation-delta transfer per bone, processed parent-before-child,
using each armature's own rest pose (bone.matrix_local) as reference. Hips gets an
additional scaled world-space translation. See task write-up / final report for the
full derivation of the matrix_basis formulas used below.
"""
import os as _os
_REPO = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..'))  # repo root

import bpy, mathutils, math, os, sys
from mathutils import Matrix, Quaternion, Vector

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SOURCE_GLB = _os.path.join(_REPO, 'game/assets/heroes/rumi-v2.glb')
TARGET_VRM = _os.path.join(_REPO, 'game/design/vroid-swordswoman-base-v3.vrm')
OUT_DIR = os.environ.get("VROID_V4_WORK", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "work"))
os.makedirs(OUT_DIR, exist_ok=True)
TEST_GLB = os.path.join(OUT_DIR, "vroid_retarget_test.glb")
COMBINED_BLEND = os.path.join(OUT_DIR, "retarget_combined.blend")

CLIP_NAMES = ["idle", "run", "slash1", "slash2", "slash3", "slash4",
              "heavy", "heavyfin", "hurt", "death", "jump", "win", "roll"]

SRC_HIPS = "mixamorigHips"
TGT_HIPS = "J_Bip_C_Hips"


# ---------------------------------------------------------------------------
# Mapping table (Mixamo -> VRoid), listed in a valid topological order
# (every bone's target-armature parent appears earlier in the list, or is an
#  un-mapped ancestor such as "Root" that is simply left at rest).
# ---------------------------------------------------------------------------
def build_mapping():
    core = [
        ("mixamorigHips", "J_Bip_C_Hips"),
        ("mixamorigSpine", "J_Bip_C_Spine"),
        ("mixamorigSpine1", "J_Bip_C_Chest"),
        ("mixamorigSpine2", "J_Bip_C_UpperChest"),
        ("mixamorigNeck", "J_Bip_C_Neck"),
        ("mixamorigHead", "J_Bip_C_Head"),
    ]
    finger_map = [("Thumb", "Thumb"), ("Index", "Index"), ("Middle", "Middle"),
                  ("Ring", "Ring"), ("Pinky", "Little")]
    mapping = list(core)
    for side_src, side_tgt in [("Left", "L"), ("Right", "R")]:
        mapping += [
            (f"mixamorig{side_src}Shoulder", f"J_Bip_{side_tgt}_Shoulder"),
            (f"mixamorig{side_src}Arm", f"J_Bip_{side_tgt}_UpperArm"),
            (f"mixamorig{side_src}ForeArm", f"J_Bip_{side_tgt}_LowerArm"),
            (f"mixamorig{side_src}Hand", f"J_Bip_{side_tgt}_Hand"),
        ]
        for msrc, mtgt in finger_map:
            for seg in (1, 2, 3):
                mapping.append((f"mixamorig{side_src}Hand{msrc}{seg}",
                                 f"J_Bip_{side_tgt}_{mtgt}{seg}"))
    for side_src, side_tgt in [("Left", "L"), ("Right", "R")]:
        mapping += [
            (f"mixamorig{side_src}UpLeg", f"J_Bip_{side_tgt}_UpperLeg"),
            (f"mixamorig{side_src}Leg", f"J_Bip_{side_tgt}_LowerLeg"),
            (f"mixamorig{side_src}Foot", f"J_Bip_{side_tgt}_Foot"),
            (f"mixamorig{side_src}ToeBase", f"J_Bip_{side_tgt}_ToeBase"),
        ]
    return mapping


MAPPING = build_mapping()


# ---------------------------------------------------------------------------
# Scene setup
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_source():
    bpy.ops.import_scene.gltf(filepath=SOURCE_GLB)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    arm.name = "SRC_Armature"
    arm.data.name = "SRC_ArmatureData"
    ico = bpy.data.objects.get("Icosphere")
    if ico is not None:
        bpy.data.objects.remove(ico, do_unlink=True)
    assert arm.matrix_world == Matrix.Identity(4), f"source armature not at identity: {arm.matrix_world}"
    return arm


def import_target():
    bpy.ops.import_scene.gltf(filepath=TARGET_VRM)
    arm = [o for o in bpy.data.objects if o.type == "ARMATURE"][0]
    arm.name = "TGT_Armature"
    arm.data.name = "TGT_ArmatureData"
    ico = bpy.data.objects.get("Icosphere")
    if ico is not None:
        bpy.data.objects.remove(ico, do_unlink=True)
    assert arm.matrix_world == Matrix.Identity(4), f"target armature not at identity: {arm.matrix_world}"
    return arm


# ---------------------------------------------------------------------------
# Rest-pose data
# ---------------------------------------------------------------------------
def get_all_rest_data(arm_obj):
    data = {}
    for b in arm_obj.data.bones:
        loc, rot, scale = b.matrix_local.decompose()
        if abs(scale.x - 1) > 1e-3 or abs(scale.y - 1) > 1e-3 or abs(scale.z - 1) > 1e-3:
            print(f"WARNING: bone {b.name} has non-unit rest scale {tuple(scale)}")
        data[b.name] = {
            "matrix": b.matrix_local.copy(),
            "rot": rot,
            "loc": loc,
            "parent": b.parent.name if b.parent else None,
        }
    return data


def ground_z(arm_obj, l_toe, r_toe):
    return (arm_obj.data.bones[l_toe].head_local.z + arm_obj.data.bones[r_toe].head_local.z) / 2.0


# ---------------------------------------------------------------------------
# Precompute rest-relative quantities needed for matrix_basis math
# ---------------------------------------------------------------------------
# Explicit rest-pose calibration for the central (spine/neck/head) and leg
# chains. Both rigs measure as T-pose overall (arms horizontal, see the
# elbow-angle check below), but a per-bone check of the *anatomical* rest
# direction (this bone's head -> its next joint's head, in world space)
# shows small but non-trivial and constant differences for the torso/neck
# and legs (Mixamo's rest chain has some natural forward lean baked in;
# VRoid's base stands closer to dead vertical). Direct measurement (see
# task report) found: Hips->Spine 10.7deg, Spine->Chest 5.2deg,
# Neck->Head 13.8deg, UpperLeg->LowerLeg 3.2deg, LowerLeg->Foot 2.6deg.
# Without calibration these show up as a constant per-bone offset in every
# clip (confirmed empirically: near-identical max/mean per clip). We
# calibrate these bones so the *target's calibrated rest* reproduces the
# *source's rest-pose direction* for that segment, per the task's required
# method step 2. Arms/hands/fingers measured ~0-2.5 deg naturally and are
# left uncalibrated (identity).
CALIBRATION_REFS = [
    # (target_bone, target_child_ref, source_bone, source_child_ref)
    ("J_Bip_C_Hips", "J_Bip_C_Spine", "mixamorigHips", "mixamorigSpine"),
    ("J_Bip_C_Spine", "J_Bip_C_Chest", "mixamorigSpine", "mixamorigSpine1"),
    ("J_Bip_C_Chest", "J_Bip_C_UpperChest", "mixamorigSpine1", "mixamorigSpine2"),
    ("J_Bip_C_UpperChest", "J_Bip_C_Neck", "mixamorigSpine2", "mixamorigNeck"),
    ("J_Bip_C_Neck", "J_Bip_C_Head", "mixamorigNeck", "mixamorigHead"),
    ("J_Bip_L_UpperLeg", "J_Bip_L_LowerLeg", "mixamorigLeftUpLeg", "mixamorigLeftLeg"),
    ("J_Bip_L_LowerLeg", "J_Bip_L_Foot", "mixamorigLeftLeg", "mixamorigLeftFoot"),
    ("J_Bip_L_Foot", "J_Bip_L_ToeBase", "mixamorigLeftFoot", "mixamorigLeftToeBase"),
    ("J_Bip_R_UpperLeg", "J_Bip_R_LowerLeg", "mixamorigRightUpLeg", "mixamorigRightLeg"),
    ("J_Bip_R_LowerLeg", "J_Bip_R_Foot", "mixamorigRightLeg", "mixamorigRightFoot"),
    ("J_Bip_R_Foot", "J_Bip_R_ToeBase", "mixamorigRightFoot", "mixamorigRightToeBase"),
    # hands: align to the middle-finger direction so the hand/sword-forward
    # axis matches the source as closely as possible (measured ~6-8deg
    # uncalibrated, partly rest offset).
    ("J_Bip_L_Hand", "J_Bip_L_Middle1", "mixamorigLeftHand", "mixamorigLeftHandMiddle1"),
    ("J_Bip_R_Hand", "J_Bip_R_Middle1", "mixamorigRightHand", "mixamorigRightHandMiddle1"),
]


def compute_calibration(source_rest, target_rest):
    """Returns {target_bone_name: Quaternion} world-space align rotation such
    that align_quat @ target_rest_rot[bone] reproduces the source's rest-pose
    anatomical direction for that bone's mapped segment. Bones not listed in
    CALIBRATION_REFS get identity (no change)."""
    calib = {}
    for tgt_name, tgt_child, src_name, src_child in CALIBRATION_REFS:
        t_h0 = target_rest[tgt_name]["loc"]
        t_h1 = target_rest[tgt_child]["loc"]
        s_h0 = source_rest[src_name]["loc"]
        s_h1 = source_rest[src_child]["loc"]
        t_dir = (t_h1 - t_h0)
        s_dir = (s_h1 - s_h0)
        if t_dir.length < 1e-9 or s_dir.length < 1e-9:
            continue
        t_dir.normalize()
        s_dir.normalize()
        calib[tgt_name] = t_dir.rotation_difference(s_dir)
    return calib


def precompute_target_rest_locals(target_rest):
    """rest_local_rot[name] = rotation of (parent_rest^-1 @ self_rest), for every bone."""
    rest_local_rot = {}
    for name, d in target_rest.items():
        parent = d["parent"]
        if parent is None:
            rest_local = d["matrix"]
        else:
            rest_local = target_rest[parent]["matrix"].inverted() @ d["matrix"]
        rest_local_rot[name] = rest_local.to_quaternion()
    return rest_local_rot


# ---------------------------------------------------------------------------
# Main retarget
# ---------------------------------------------------------------------------
def main():
    clear_scene()
    src_arm = import_source()
    tgt_arm = import_target()

    scene = bpy.context.scene
    scene.render.fps = 24

    source_rest = get_all_rest_data(src_arm)
    target_rest = get_all_rest_data(tgt_arm)
    target_rest_local_rot = precompute_target_rest_locals(target_rest)
    calibration = compute_calibration(source_rest, target_rest)
    target_calibrated_rest_rot = {}
    for name, d in target_rest.items():
        offset = calibration.get(name)
        target_calibrated_rest_rot[name] = (offset @ d["rot"]) if offset is not None else d["rot"]
    print("CALIBRATION applied to:", sorted(calibration.keys()))
    for name, q in calibration.items():
        angle = math.degrees(2 * math.acos(max(-1.0, min(1.0, abs(q.w)))))
        print(f"  {name}: calibration rotation angle = {angle:.2f} deg")

    # sanity: confirm both rigs read T-pose-like (arms horizontal) using REAL
    # joint chain positions (child bone head, not this bone's own possibly-
    # synthetic tail), and report the measured angle.
    def elbow_angle_from_horizontal(arm_obj, upperarm_name, lowerarm_name):
        h = arm_obj.data.bones[upperarm_name].head_local
        t = arm_obj.data.bones[lowerarm_name].head_local
        v = (t - h)
        # angle from the horizontal (XY) plane
        horiz = math.sqrt(v.x ** 2 + v.y ** 2)
        return math.degrees(math.atan2(abs(v.z), horiz))

    src_angle = elbow_angle_from_horizontal(src_arm, "mixamorigRightArm", "mixamorigRightForeArm")
    tgt_angle = elbow_angle_from_horizontal(tgt_arm, "J_Bip_R_UpperArm", "J_Bip_R_LowerArm")
    print(f"REST POSE CHECK: source right-upper-arm angle from horizontal = {src_angle:.2f} deg "
          f"({'T-pose' if src_angle < 20 else 'A-pose or other'})")
    print(f"REST POSE CHECK: target right-upper-arm angle from horizontal = {tgt_angle:.2f} deg "
          f"({'T-pose' if tgt_angle < 20 else 'A-pose or other'})")

    # hip height / ground reference, for translation scaling
    src_ground = ground_z(src_arm, "mixamorigLeftToeBase", "mixamorigRightToeBase")
    tgt_ground = ground_z(tgt_arm, "J_Bip_L_ToeBase", "J_Bip_R_ToeBase")
    src_hip_h = src_arm.data.bones[SRC_HIPS].head_local.z - src_ground
    tgt_hip_h = tgt_arm.data.bones[TGT_HIPS].head_local.z - tgt_ground
    hip_ratio = tgt_hip_h / src_hip_h
    print(f"SCALE CHECK: source hip height={src_hip_h:.4f} (raw units), "
          f"target hip height={tgt_hip_h:.4f} (m), hip_ratio={hip_ratio:.6f}")

    # avoid action name collisions: source clip actions share the same names
    # we want to give the newly-baked target actions, so rename the source
    # ones out of the way up front. This does not affect retargeting math,
    # only which name shows up when we do src_arm.animation_data.action = X.
    for clip in CLIP_NAMES:
        act = bpy.data.actions.get(clip)
        if act is not None:
            act.name = f"SRC_{clip}"

    src_hips_rest_pos = source_rest[SRC_HIPS]["loc"].copy()
    tgt_hips_rest_pos = target_rest[TGT_HIPS]["loc"].copy()
    tgt_hips_parent = target_rest[TGT_HIPS]["parent"]
    Wp_static_hips = target_rest[tgt_hips_parent]["matrix"]
    rest_local_matrix_hips = Wp_static_hips.inverted() @ target_rest[TGT_HIPS]["matrix"]

    # set rotation mode for all target mapped bones
    for _, tgt_name in MAPPING:
        tgt_arm.pose.bones[tgt_name].rotation_mode = "QUATERNION"

    identity_q = Quaternion((1, 0, 0, 0))

    def compute_and_keyframe(frame_value):
        tgt_world_rot = {}
        for src_name, tgt_name in MAPPING:
            src_pb = src_arm.pose.bones[src_name]
            world_loc, world_rot, world_scale = src_pb.matrix.decompose()

            src_rest_rot = source_rest[src_name]["rot"]
            tgt_rest_rot = target_calibrated_rest_rot[tgt_name]

            delta = world_rot @ src_rest_rot.inverted()
            tgt_world_rot_bone = delta @ tgt_rest_rot
            tgt_world_rot_bone.normalize()
            tgt_world_rot[tgt_name] = tgt_world_rot_bone

            parent_name = target_rest[tgt_name]["parent"]
            if parent_name is None:
                Wp_rot = identity_q
            elif parent_name in tgt_world_rot:
                Wp_rot = tgt_world_rot[parent_name]
            else:
                Wp_rot = target_rest[parent_name]["rot"]

            rest_local_rot = target_rest_local_rot[tgt_name]
            matrix_basis_rot = rest_local_rot.inverted() @ Wp_rot.inverted() @ tgt_world_rot_bone
            matrix_basis_rot.normalize()

            for c in matrix_basis_rot:
                if not math.isfinite(c):
                    raise RuntimeError(f"NaN in computed rotation for {tgt_name} at frame {frame_value}")

            pb = tgt_arm.pose.bones[tgt_name]
            prev = prev_quats.get(tgt_name)
            if prev is not None and prev.dot(matrix_basis_rot) < 0:
                matrix_basis_rot = -matrix_basis_rot
            prev_quats[tgt_name] = matrix_basis_rot.copy()

            if tgt_name == TGT_HIPS:
                disp_world = (world_loc - src_hips_rest_pos) * hip_ratio
                desired_world_pos = tgt_hips_rest_pos + disp_world
                W_desired = Matrix.Translation(desired_world_pos) @ tgt_world_rot_bone.to_matrix().to_4x4()
                mb_full = rest_local_matrix_hips.inverted() @ Wp_static_hips.inverted() @ W_desired
                loc_part, rot_part, _ = mb_full.decompose()
                rot_part.normalize()
                if prev_quats.get(tgt_name + "__full") is not None and \
                        prev_quats[tgt_name + "__full"].dot(rot_part) < 0:
                    rot_part = -rot_part
                prev_quats[tgt_name + "__full"] = rot_part.copy()
                pb.rotation_quaternion = rot_part
                pb.location = loc_part
                pb.keyframe_insert(data_path="location", frame=frame_value)
            else:
                pb.rotation_quaternion = matrix_basis_rot

            pb.keyframe_insert(data_path="rotation_quaternion", frame=frame_value)

    def set_linear_interpolation(action):
        for layer in action.layers:
            for strip in layer.strips:
                if hasattr(strip, "channelbags"):
                    for cb in strip.channelbags:
                        for fc in cb.fcurves:
                            for kp in fc.keyframe_points:
                                kp.interpolation = "LINEAR"

    def scan_nans(action):
        bad = []
        for layer in action.layers:
            for strip in layer.strips:
                for cb in strip.channelbags:
                    for fc in cb.fcurves:
                        for kp in fc.keyframe_points:
                            if not math.isfinite(kp.co[1]):
                                bad.append((fc.data_path, fc.array_index, kp.co[0]))
        return bad

    if tgt_arm.animation_data is None:
        tgt_arm.animation_data_create()
    if src_arm.animation_data is None:
        src_arm.animation_data_create()

    clip_report = []
    for clip in CLIP_NAMES:
        src_action = bpy.data.actions.get(f"SRC_{clip}")
        if src_action is None:
            print(f"WARNING: source action '{clip}' not found, skipping")
            continue
        src_arm.animation_data.action = src_action

        fr = src_action.frame_range
        start_f, end_f = fr[0], fr[1]
        n_full = int(math.floor(end_f - start_f + 1e-6))
        frames = [start_f + i for i in range(n_full + 1)]
        if abs(frames[-1] - end_f) > 1e-4:
            frames.append(end_f)

        tgt_action = bpy.data.actions.new(clip)
        tgt_action.use_fake_user = True  # keep alive even while not the active action
        tgt_arm.animation_data.action = tgt_action

        global prev_quats
        prev_quats = {}

        for f in frames:
            int_f = int(math.floor(f))
            subf = f - int_f
            scene.frame_set(int_f, subframe=subf)
            bpy.context.view_layer.update()
            compute_and_keyframe(f)

        set_linear_interpolation(tgt_action)
        bad = scan_nans(tgt_action)
        fr2 = tgt_action.frame_range
        print(f"[{clip}] baked {len(frames)} frames -> target frame_range={tuple(fr2)} "
              f"(source was {tuple(fr)}), NaNs found: {len(bad)}")
        if bad:
            print(f"   NaN details (first 5): {bad[:5]}")
        clip_report.append((clip, len(frames), tuple(fr), tuple(fr2), len(bad)))

    # -----------------------------------------------------------------
    # Save combined blend (both rigs, source original anim + target baked anim)
    # -----------------------------------------------------------------
    tgt_arm.animation_data.action = bpy.data.actions.get("idle")
    src_arm.animation_data.action = bpy.data.actions.get("SRC_idle")
    scene.frame_set(0)
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=COMBINED_BLEND)
    print(f"Saved combined blend: {COMBINED_BLEND}")

    # -----------------------------------------------------------------
    # Export test GLB: target meshes + armature + 13 actions only.
    # Remove every source object/data-block first so the glTF exporter's
    # ACTIONS mode has nothing else in bpy.data to accidentally pick up
    # (it does not strictly filter actions by bone compatibility).
    # -----------------------------------------------------------------
    src_children = list(src_arm.children)
    src_action_names = [a.name for a in bpy.data.actions if a.name.startswith("SRC_")]
    bpy.data.objects.remove(src_arm, do_unlink=True)
    for c in src_children:
        bpy.data.objects.remove(c, do_unlink=True)
    for name in src_action_names:
        a = bpy.data.actions.get(name)
        if a is not None:
            bpy.data.actions.remove(a, do_unlink=True)

    remaining_actions = sorted(a.name for a in bpy.data.actions)
    print(f"Actions remaining before export: {remaining_actions}")
    assert remaining_actions == sorted(CLIP_NAMES), \
        f"unexpected action set before export: {remaining_actions}"

    bpy.ops.object.select_all(action="DESELECT")
    export_objs = [tgt_arm] + [c for c in tgt_arm.children if c.type == "MESH"]
    for o in export_objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = tgt_arm
    print(f"Exporting objects: {[o.name for o in export_objs]}")

    bpy.ops.export_scene.gltf(
        filepath=TEST_GLB,
        use_selection=True,
        export_format="GLB",
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_apply=False,
        export_yup=True,
        # NOTE: Blender's glTF exporter quantizes each keyframe's time to a
        # whole frame number regardless of export_optimize_animation_size
        # (verified empirically), so a clip whose source duration is
        # fractional (e.g. idle: 86.4 frames) will end up truncated to the
        # floor frame (86) in the exported GLB -- under 1 frame (<=42ms at
        # 24fps) of duration loss at the very end of the clip. The baked
        # Blender actions above (and retarget_combined.blend) keep the
        # exact fractional duration; only the exported GLB is affected.
        export_optimize_animation_size=False,
    )
    print(f"Exported test GLB: {TEST_GLB}")

    print("\n===== MAPPING TABLE =====")
    for s, t in MAPPING:
        print(f"  {s:35s} -> {t}")

    print("\n===== CLIP REPORT =====")
    for c in clip_report:
        print(" ", c)


if __name__ == "__main__":
    main()
