// Convert retargeted Mixamo actions (armature-only GLBs from design/vroid-v4/scripts/export_mocap_actions.py)
// into 3d-next/mocap-data.js. Only J_Bip body bones and the hips position ship; rest poses must match the hero GLB.
// node --experimental-default-type=module --loader ./game/tests/three-loader.mjs game/scripts/import_mocap.mjs gs_sel.glb lb_sel.glb
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile, writeFile } from 'node:fs/promises';
globalThis.ProgressEvent = class {};
// Bones only: meshes, skins, materials and textures are dropped before parsing.
const parse = async path => {
  const bytes = await readFile(path), size = bytes.readUInt32LE(12), json = JSON.parse(bytes.subarray(20, 20 + size));
  for (const key of ['meshes', 'materials', 'textures', 'images', 'samplers', 'skins']) delete json[key];
  json.nodes.forEach(n => { delete n.mesh; delete n.skin; });
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + size).toString('base64')}`;
  return new GLTFLoader().parseAsync(JSON.stringify(json), '');
};
const hero = await parse(new URL('../assets/heroes/swordswoman-v4.glb', import.meta.url).pathname);
const clips = {};
for (const path of process.argv.slice(2)) {
  const gltf = await parse(path);
  // The retarget writes local rotations against the hero's own rest pose; refuse a mismatched skeleton.
  gltf.scene.traverse(node => {
    if (!/^J_Bip_/.test(node.name)) return;
    const target = hero.scene.getObjectByName(node.name);
    if (!target || target.quaternion.angleTo(node.quaternion) > 1e-3 || target.position.distanceTo(node.position) > 1e-3) throw Error(`Rest pose differs: ${node.name}`);
  });
  for (const clip of gltf.animations) {
    const tracks = clip.tracks.filter(t => /^J_Bip_[^.]+\.quaternion$/.test(t.name) || t.name === 'J_Bip_C_Hips.position');
    for (const track of tracks) track.values = Float32Array.from(track.values, v => Math.round(v * 1e4) / 1e4);
    const out = new T.AnimationClip(clip.name, clip.duration, tracks).optimize();
    clips[clip.name] = T.AnimationClip.toJSON(out); delete clips[clip.name].uuid;
  }
}
const text = '// Mixamo motion capture retargeted to the VRoid hero rig. See assets/animations/README.md.\nexport const MOCAP = ' +
  JSON.stringify(clips, (_k, v) => typeof v === 'number' ? Number(v.toFixed(4)) : v) + ';\n';
await writeFile(new URL('../3d-next/mocap-data.js', import.meta.url), text);
console.log(Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { duration: Number(c.duration.toFixed(3)), tracks: c.tracks.length }])), (text.length / 1024).toFixed(0) + ' KB');
