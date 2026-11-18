// 三部曲的原創蒼焰：沿用 Blender 造型，接到既有瞄準、近戰與登機骨架。
import * as THREE from 'three';
import { loadDuelMechArt, instantiateDuelMechArt, createArmorGrain } from './duel/duel-mech-art.mjs?v=11';

import { createCampaignSaber } from './campaign-saber.mjs?v=1';

let art, loading, surface;
export async function loadCampaignHero() {
  if (!loading) loading = loadDuelMechArt(new URL('./duel/m07-cangyan-campaign-v11.glb', import.meta.url), 30000)
    .then(model => {
      if (model.getObjectByName('M07_Upper').userData.campaignRig !== 1) throw new Error('蒼焰的劇情關節不完整');
      art = model;
      // 使用關卡現有的環境反射，不再渲染另一套動態反射。
      surface = { environment: null, grain: createArmorGrain(), grainStrength: { value: 0 } };
    }).catch(error => { loading = null; throw error; });
  await loading;
}
const V = (...p) => new THREE.Vector3(...p);
const down = V(0, -1, 0);
const frame = (a, b) => new THREE.Quaternion().setFromUnitVectors(down, b.clone().sub(a).normalize());

function seeThrough(material, see) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = shader => {
    previous(shader);
    Object.assign(shader.uniforms, { seeC: see.c, seeT: see.t, seeA: see.a, seeRes: see.res });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec4 seeC, seeT; uniform vec2 seeRes; uniform float seeA;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        vec2 q = gl_FragCoord.xy / seeRes.y;
        float k = max(seeA, max(seeC.w * (1.0 - smoothstep(0.45, 1.0, length(q - seeC.xy) / max(seeC.z, 1e-4))),
          seeT.w * (1.0 - smoothstep(0.45, 1.0, length(q - seeT.xy) / max(seeT.z, 1e-4)))));
        if (k > 0.0) {
          vec2 p = mod(floor(gl_FragCoord.xy), 4.0), a = mod(p, 2.0), b = floor(p * 0.5);
          float d = (4.0 * (2.0*a.x + 3.0*a.y - 4.0*a.x*a.y) + 2.0*b.x + 3.0*b.y - 4.0*b.x*b.y + 0.5) / 16.0;
          if (d < k) discard;
        }`);
  };
  material.customProgramCacheKey = () => key + '-campaign-see-v1';
}

export function buildCampaignHero(m, see) {
  if (!art) throw new Error('蒼焰模型尚未載入');
  const source = instantiateDuelMechArt(art, 0, surface);
  const body = source.getObjectByName('M07_Body'), upper = source.getObjectByName('M07_Upper');
  body.position.set(0, 0, 0);
  for (const side of ['L', 'R']) for (const segment of ['Thigh', 'Shin', 'Foot'])
    source.getObjectByName('M07_' + segment + '_' + side).quaternion.identity();
  source.updateMatrixWorld(true);
  const meshes = [];
  source.traverse(o => { if (o.isMesh) meshes.push({ mesh: o, joint: o.parent.name, world: o.matrixWorld.clone() }); });
  for (const material of new Set(meshes.map(o => o.mesh.material))) seeThrough(material, see);
  const at = name => source.getObjectByName(name).getWorldPosition(V());
  const hipR = at('M07_Thigh_L'), kneeR = at('M07_Shin_L'), ankleR = at('M07_Foot_L');
  const thighLength = hipR.distanceTo(kneeR), shinLength = kneeR.distanceTo(ankleR);
  const pelvisY = thighLength + shinLength + ankleR.y;
  const pelvisOrigin = V(0, hipR.y, 0), torsoOrigin = V(0, 11.30, 0);
  m.style = m.schemeKey = 'hero'; m.S = { wear: 'clean' };
  m.root = new THREE.Group(); m.root.name = 'M-07 蒼焰'; m.root.userData.originalCangyan = 'v11';
  m.root.userData.headProportions = upper.userData.headProportions.cangyan;
  m.parts = new Map(); m.bones = {}; m.meshes = []; m.glows = []; m.nozzles = [];
  const bone = (name, parent, position) => {
    const o = new THREE.Group(); o.name = name; o.position.copy(position); o.rotation.order = 'YXZ';
    parent.add(o); m.bones[name] = o; return o;
  };
  const b = m.bones;
  bone('pelvis', m.root, V(0, pelvisY, 0));
  bone('torso', b.pelvis, torsoOrigin.clone().sub(pelvisOrigin));
  bone('head', b.torso, V(0, 14.78, .50).sub(torsoOrigin));
  bone('back', b.torso, V());
  const mounts = new Map();
  const mount = (joint, target, origin, rotation = new THREE.Quaternion()) => {
    mounts.set(joint, { target, inverse: new THREE.Matrix4().compose(origin, rotation, V(1, 1, 1)).invert() });
  };
  mount('M07_Body', b.pelvis, pelvisOrigin);
  mount('M07_Upper', b.torso, torsoOrigin);
  mount('M07_Head', b.head, V(0, 14.78, .50));
  for (const [name, side] of [['R', 'L'], ['L', 'R']]) {
    const hip = at('M07_Thigh_' + side), knee = at('M07_Shin_' + side), ankle = at('M07_Foot_' + side);
    bone('hip' + name, b.pelvis, hip.clone().sub(pelvisOrigin));
    bone('knee' + name, b['hip' + name], V(0, -thighLength, 0));
    bone('ankle' + name, b['knee' + name], V(0, -shinLength, 0));
    // Canonical down-axis limbs let the existing planted-foot IK use the real joint lengths.
    mount('M07_Thigh_' + side, b['hip' + name], hip, frame(hip, knee));
    mount('M07_Shin_' + side, b['knee' + name], knee, frame(knee, ankle));
    mount('M07_Foot_' + side, b['ankle' + name], ankle);
  }
  for (const [name, sign] of [['R', 1], ['L', -1]]) {
    const shoulder = V(sign * 3.108, 13.9375, -.235), elbow = V(sign * 3.7464, 12.0174, .047);
    const wrist = name === 'R' ? V(elbow.x, elbow.y, 1.9186) : V(elbow.x, 10.2056, .047);
    bone('shoulder' + name, b.torso, shoulder.clone().sub(torsoOrigin));
    bone('elbow' + name, b['shoulder' + name], V(0, -shoulder.distanceTo(elbow), 0));
    bone('hand' + name, b['elbow' + name], V(0, -elbow.distanceTo(wrist), 0));
    mount('M07_Arm_' + name, b['shoulder' + name], shoulder, frame(shoulder, elbow));
    const forearmFrame = frame(elbow, wrist);
    mount(name === 'R' ? 'M07_Rifle' : 'M07_Forearm_L', b['elbow' + name], elbow, forearmFrame);
    if (name === 'R') {
      m.weapon = b.elbowR;
      m.muzzleLocal = V(3.7464, 12.7818, 6.5565).sub(elbow).applyQuaternion(forearmFrame.clone().invert());
    }
  }
  m.hatch = bone('hatch', b.torso, V(0, 14.6473, 1.598).sub(torsoOrigin));
  mount('M07_Hatch', m.hatch, V(0, 14.6473, 1.598));
  m.hatchAxis = -1.65;
  m.cockpitLocal = V(0, 13.58, 1.85).sub(torsoOrigin);
  m.cockpitGlow = null;
  for (const { mesh, joint, world } of meshes) {
    const target = mounts.get(joint);
    if (!target) throw new Error('未知的蒼焰關節：' + joint);
    target.target.add(mesh);
    new THREE.Matrix4().multiplyMatrices(target.inverse, world).decompose(mesh.position, mesh.quaternion, mesh.scale);
    if (mesh.name.endsWith('_optics')) { mesh.userData.noAO = true; m.glows.push(mesh); }
    else m.meshes.push(mesh);
  }
  m.mat = m.meshes.find(mesh => mesh.name.endsWith('_armor')).material;
  const saber = createCampaignSaber();
  m.saber = saber.group; m.meshes.push(...saber.solid); m.glows.push(...saber.glow); b.handL.add(m.saber);
  upper.userData.exhaustOrigins.forEach(pos => m.nozzles.push({ bone: b.back, pos: V(...pos).sub(torsoOrigin).toArray(), rot: [upper.userData.exhaustPitch + Math.PI, 0, 0], r: .83, len: 4.3 }));
  m.buildFlames();
  m.L = { pelvis: pelvisY }; m.height = 16.7; m.footToe = 2.0; m.footHeel = 1.25;
  m.stance = { w: 2.68, toe: .21, fwd: .15, bend: .04, knee: 0, chest: 0, armR: .07, armL: -.12 };
  m.wings = null; m.eye = null; m.unitMeshes = []; m.variants = new Map();
  m.root.updateMatrixWorld(true);
}
