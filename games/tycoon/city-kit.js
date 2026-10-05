// 創業之城：素材載入與材質補丁（Kenney CC0 GLB 以 instancing 合併繪製）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 各建築實測尺寸 [半寬, 半深, 高]（由 GLB bounding box 量得）
export const BB = {
  'building-a': [0.44, 0.47, 1.29], 'building-b': [0.49, 0.47, 1.29], 'building-c': [0.44, 0.55, 0.89], 'building-d': [0.42, 0.45, 1.29],
  'building-e': [0.82, 0.5, 0.89], 'building-f': [0.42, 0.52, 1.69], 'building-g': [0.49, 0.46, 1.69], 'building-h': [0.44, 0.5, 1.29],
  'building-i': [0.62, 0.65, 1.68], 'building-j': [1.04, 0.67, 1.69], 'building-k': [1.04, 0.47, 1.47], 'building-l': [0.69, 0.7, 2.27],
  'building-m': [0.62, 0.62, 3.15], 'building-n': [1.16, 0.91, 2.48],
  'building-skyscraper-a': [0.68, 0.68, 2.88], 'building-skyscraper-b': [0.68, 0.68, 4.48], 'building-skyscraper-c': [0.64, 0.69, 4.08],
  'building-skyscraper-d': [0.64, 0.69, 5.47], 'building-skyscraper-e': [0.65, 0.62, 4.08],
  'building-type-a': [0.65, 0.51, 0.83], 'building-type-b': [0.91, 0.57, 1.14], 'building-type-c': [0.64, 0.51, 1.03], 'building-type-d': [0.88, 0.51, 1.24],
  'building-type-e': [0.65, 0.51, 1.14], 'building-type-f': [0.71, 0.7, 1.14], 'building-type-g': [0.73, 0.59, 0.77], 'building-type-h': [0.65, 0.46, 0.74],
  'building-type-i': [0.64, 0.51, 0.74], 'building-type-j': [0.69, 0.46, 1.04], 'building-type-k': [0.46, 0.51, 1.15], 'building-type-l': [0.52, 0.51, 1.05],
};
export const FLOOR_H = 0.32;   // 一層樓的高度（用來換算樓層數）

// 共用的 uniform：夜間燈光強度、雨天濕度
export const U = { uWin: { value: 1 }, uWet: { value: 0 } };

const WET_FRAG = `
  diffuseColor.rgb *= 1.0 - 0.34 * uWet;`;
const WET_ROUGH = `
  roughnessFactor = mix(roughnessFactor, 0.16, uWet * smoothstep(0.7, 0.95, vWN.y));`;

// 世界座標／法線 varying（支援 instancing）
function worldVaryings(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
    .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      #ifdef USE_INSTANCING
        vWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
      #else
        vWN = normalize(mat3(modelMatrix) * objectNormal);
      #endif`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nuniform float uWin;\nuniform float uWet;\nuniform float uHue;');
}

const HUE = `
  { float cs = cos(uHue), sn = sin(uHue);
    mat3 T = mat3(0.299,0.596,0.211, 0.587,-0.274,-0.523, 0.114,-0.322,0.312);
    mat3 Ti = mat3(1.0,1.0,1.0, 0.956,-0.272,-1.106, 0.621,-0.647,1.703);
    vec3 yiq = T * diffuseColor.rgb; yiq.yz = mat2(cs,-sn,sn,cs) * yiq.yz;
    diffuseColor.rgb = mix(max(Ti * yiq, 0.0), diffuseColor.rgb, winM); }`;

// 加上「濕地」效果的一般材質（地面、底座等）
export function wetStd(color, rough = 0.95, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, ...extra });
  m.customProgramCacheKey = () => 'tycoon-wet';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = U.uWet; sh.uniforms.uWin = U.uWin; sh.uniforms.uHue = { value: 0 };
    worldVaryings(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>' + WET_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + WET_ROUGH);
  };
  return m;
}

// 遠景／特殊方塊建築材質：程序生成窗格，夜間亮燈。instanceColor 作為牆色
export function windowStd(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.customProgramCacheKey = () => 'tycoon-win' + (opts.dense ? 'd' : '');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = U.uWet; sh.uniforms.uWin = U.uWin; sh.uniforms.uHue = { value: 0 };
    worldVaryings(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;\nattribute vec3 aTint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        diffuseColor.rgb *= vTint;
        float sideM = 1.0 - step(0.5, abs(vWN.y));
        float uAx = abs(vWN.x) > 0.5 ? vWP.z : vWP.x;
        float fu = fract(uAx * ${opts.dense ? '4.0' : '3.0'}), fv = fract(vWP.y * ${opts.dense ? '5.0' : '3.4'});
        float winMk = step(0.2, fu) * step(fu, 0.72) * step(0.22, fv) * step(fv, 0.74) * sideM * step(0.12, vWP.y);
        vec2 cellId = vec2(floor(uAx * ${opts.dense ? '4.0' : '3.0'}) + floor(vWP.y * 3.0) * 7.0, floor(vWP.y * ${opts.dense ? '5.0' : '3.4'}) + floor(vWP.x * 0.7));
        float hh = fract(sin(dot(cellId, vec2(12.9898, 78.233))) * 43758.5453);
        float lit = step(0.45, hh);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.09, 0.17), winMk * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.3, 0.1), winMk * lit * 0.8);` + WET_FRAG)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + WET_ROUGH)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.58, 0.24) * winMk * lit * (0.5 + 0.9 * hh) * uWin * 0.6;`);
  };
  return m;
}

export function createKit(root, renderer) {
  const loader = new GLTFLoader();
  const mats = new Map();
  const texCache = new Map();
  const gltfCache = new Map();
  function variantTex(kit, v) {
    const k = kit + v; if (!texCache.has(k)) { const t = new THREE.TextureLoader().load(`assets/${kit}/Textures/variation-${v}.png`); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.RepeatWrapping; texCache.set(k, t); }
    return texCache.get(k);
  }
  function litMaterial(src, kit, v) {
    const mk = v ? src.uuid + v : src;
    if (mats.has(mk)) return mats.get(mk);
    const m = src.clone();
    const [tv, hs] = v ? v.split('|') : ['', '0'];
    const hue = (+hs || 0) * Math.PI / 180;
    if (tv) m.map = variantTex(kit, tv);
    m.customProgramCacheKey = () => 'tycoon-lit';
    m.roughness = 0.88; m.metalness = 0;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWin = U.uWin; sh.uniforms.uWet = U.uWet; sh.uniforms.uHue = { value: hue };
      worldVaryings(sh);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
        float winM = smoothstep(0.38, 0.5, diffuseColor.b - diffuseColor.r) * step(0.5, diffuseColor.b) * (1.0 - step(0.45, abs(vWN.y)));
        vec3 cell = floor(vec3((vWP.x + vWP.z) * 4.0, vWP.y * 5.0, (vWP.x - vWP.z) * 1.5));
        float hh = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float lit = step(0.42, hh);
        ${HUE}
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.14), winM * (1.0 - lit) * 0.8);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.28, 0.08), winM * lit * 0.85);` + WET_FRAG)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>' + WET_ROUGH)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.55, 0.2) * winM * lit * (0.5 + 0.9 * hh) * uWin * 0.55;`);
    };
    mats.set(mk, m); return m;
  }

  // ---- instancing：put() 只登記位置，finalize() 時每種（素材×變體×部件）合成一個 InstancedMesh ----
  const groups = new Map();
  const _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
  function put(kit, name, x, z, rotY = 0, scale = 1, y = 0, v = null, sy = 1) {
    const key = kit + '/' + name + '/' + (v || '');
    if (!groups.has(key)) groups.set(key, { kit, name, v, list: [] });
    _q.setFromEuler(_e.set(0, rotY, 0)); _p.set(x, y, z); _s.set(scale, scale * sy, scale);
    groups.get(key).list.push(new THREE.Matrix4().compose(_p, _q, _s));
  }
  function loadGltf(kit, name) {
    const k = kit + '/' + name;
    if (!gltfCache.has(k)) gltfCache.set(k, loader.loadAsync(`assets/${kit}/${name}.glb`));
    return gltfCache.get(k);
  }
  let instCount = 0;
  async function finalize() {
    await Promise.all([...groups.values()].map(async (g) => {
      const gl = await loadGltf(g.kit, g.name);
      gl.scene.updateMatrixWorld(true);
      gl.scene.traverse(o => {
        if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, litMaterial(o.material, g.kit, g.v), g.list.length);
        const m = new THREE.Matrix4();
        g.list.forEach((pm, i) => { m.multiplyMatrices(pm, o.matrixWorld); im.setMatrixAt(i, m); });
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
        root.add(im); instCount++;
      });
    }));
  }
  // 一般載入（車子：每台獨立移動，數量少）
  async function clone(kit, name) {
    const gl = await loadGltf(kit, name);
    const o = gl.scene.clone(true);
    o.traverse(c => { if (c.isMesh) { c.material = litMaterial(c.material, kit, null); c.castShadow = true; c.receiveShadow = true; } });
    return o;
  }
  return { put, finalize, clone, litMaterial, stats: () => ({ instancedMeshes: instCount }) };
}
