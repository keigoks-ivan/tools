import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createHairKit } from './hero-hair.js?v=20261002h';
import { forgedBlade } from './hero-weapons.js?v=20261002b';
import { indexGeometry } from './index-geometry.js?v=20261002c';
import { createBowKit } from './hero-bow.js?v=20261002h';

// One GPU texture per asset across the local character and all teammates.
const textureCache = new Map();
function acquireTexture(T, url) {
  let entry = textureCache.get(url);
  if (!entry) {
    let resolve, reject;
    const ready = new Promise((yes, no) => { resolve = yes; reject = no; });
    const texture = new T.TextureLoader().load(url, resolve, undefined, reject);
    entry = { texture, ready, refs: 0 }; textureCache.set(url, entry);
  }
  entry.refs++;
  return entry;
}
function releaseTexture(url) {
  const entry = textureCache.get(url);
  if (entry && --entry.refs === 0) { textureCache.delete(url); entry.texture.dispose(); }
}

// Authored, bone-mounted geometry in the GLB's bind coordinates (metres, Y up).
// Each bone/material batch is merged once; selecting another hero reuses its kit.
export function createHeroArt(T, root, sword) {
  root.updateMatrixWorld(true);
  const kits = new Map(), originals = new Map(), shortened = new Map();
  const loading = [], textureUrls = [];
  function loadTexture(path) {
    if (typeof document === 'undefined') return null;
    const url = new URL(path, import.meta.url).href, entry = acquireTexture(T, url);
    textureUrls.push(url); loading.push(entry.ready); return entry.texture;
  }
  const atlas = loadTexture('../assets/heroes/atelier/material-atlas-v1.png');
  const faceSkin = loadTexture('../assets/heroes/atelier/face-skin-v1.png');
  const hairStrands = loadTexture('../assets/heroes/atelier/hair-strands-v1.png');
  for (const texture of [atlas, faceSkin]) if (texture) { texture.colorSpace = T.SRGBColorSpace; texture.flipY = false; texture.anisotropy = 4; }
  if (atlas) atlas.flipY = true;
  if (hairStrands) { hairStrands.colorSpace = T.SRGBColorSpace; hairStrands.flipY = true; hairStrands.anisotropy = 4; }
  const ready = Promise.all(loading);
  let activeId = 'violet';
  const bowFingerRest = root.getObjectByName('J_Bip_R_Index2').quaternion.clone();
  const styledHair = new Map();
  function textured(material, row, col, repeat = 1, strength = 0.45) {
    if (!atlas) return material;
    material.map = atlas;
    material.userData.atlasTile = `${row}:${col}`;
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP\nvec2 tileUv = fract(vMapUv * ${Number(repeat).toFixed(2)});\nvec2 atlasUv = vec2(${col}.0/4.0, ${2 - row}.0/3.0) + (vec2(0.004) + tileUv * 0.992) * vec2(0.25, 0.333333);\ndiffuseColor *= mix(vec4(1.0), texture2D(map, atlasUv), ${Number(strength).toFixed(2)});\n#endif`);
    };
    material.customProgramCacheKey = () => `hero-atlas:${row}:${col}:${repeat}:${strength}`;
    material.needsUpdate = true; return material;
  }
  const palette = {
    violet: { cloth: 0x8853ac, metal: 0xb3a1ce, trim: 0xdbb478, glow: 0xcd96ff, hair: 0x77549c },
    azure: { cloth: 0x407795, metal: 0x88a8bd, trim: 0xd5ddeb, glow: 0x66ddff, hair: 0x4b687c },
    amber: { cloth: 0xa96838, metal: 0x4a4650, trim: 0xe3b86d, glow: 0xffce68, hair: 0x946334 },
    jade: { cloth: 0x327555, metal: 0xe4dfcd, trim: 0xc8ae74, glow: 0x91e5b6, hair: 0x466455 },
  };
  const baseMeshes = [];
  root.traverse(o => { if (o.isMesh) baseMeshes.push(o); });
  const sourceGeometry = new Set(baseMeshes.map(mesh => mesh.geometry));
  const sourceMaterials = new Set(baseMeshes.flatMap(mesh => [].concat(mesh.material)));
  const oldHairGeometries = new Set(baseMeshes.filter(mesh => /^(Hair|Braid)/.test(mesh.name) || [].concat(mesh.material).some(m => /HairBack|Hair_00/.test(m.name))).map(mesh => mesh.geometry));
  for (const mesh of baseMeshes) {
    if ([].concat(mesh.material).some(m => /HairBack/.test(m.name))) {
      mesh.userData.hairFoundation = true;
      mesh.material = new T.MeshPhysicalMaterial({ name: 'Atelier hair foundation', color: 0x281731, roughness: 0.45, sheen: 0.6, sheenRoughness: 0.5 });
    }
    for (const m of [].concat(mesh.material)) if (!originals.has(m)) originals.set(m, m.color.clone());
    // Recolour the texture's value detail rather than multiplying blue over purple.
    for (const m of [].concat(mesh.material)) {
      if (!/Plum damask|HairBack|Hair_00/.test(m.name) || m.userData.heroDye) continue;
      m.userData.heroDye = true;
      m.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\nvec4 texel = texture2D(map, vMapUv);\nfloat value = dot(texel.rgb, vec3(0.299,0.587,0.114));\ndiffuseColor *= vec4(vec3(0.15 + sqrt(value) * 0.85), texel.a);\n#endif');
      };
      m.customProgramCacheKey = () => 'hero-dyed-fabric-v1';
      m.needsUpdate = true;
    }
    if ([].concat(mesh.material).some(m => /EyeIris/.test(m.name))) {
      const g = mesh.geometry.clone(), pos = g.attributes.position;
      for (const side of [-1, 1]) {
        const ids = Array.from({ length: pos.count }, (_, i) => i).filter(i => pos.getX(i) * side > 0);
        const center = ids.reduce((v, i) => v.add(new T.Vector3().fromBufferAttribute(pos, i)), new T.Vector3()).divideScalar(ids.length);
        for (const i of ids) { pos.setX(i, center.x + (pos.getX(i) - center.x) * 0.86); pos.setY(i, center.y + (pos.getY(i) - center.y) * 0.86); }
      }
      for (const attribute of g.morphAttributes.position || []) for (let i = 0; i < attribute.count; i++) { attribute.setX(i, attribute.getX(i) * 0.86); attribute.setY(i, attribute.getY(i) * 0.86); }
      g.computeBoundingBox(); g.computeBoundingSphere(); mesh.geometry = g;
    }
    if ([].concat(mesh.material).some(m => /Body_00_SKIN/.test(m.name))) {
      const source = mesh.material;
      mesh.material = new T.MeshStandardMaterial({ name: 'Atelier body skin', map: source.map, color: 0xf0d7ce, roughness: 0.82, side: source.side, alphaTest: source.alphaTest });
      originals.set(mesh.material, mesh.material.color.clone());
    }
    if (/Charcoal pinstripe|Black piping/.test([].concat(mesh.material).map(m => m.name).join(' '))) {
      const g = mesh.geometry, indices = g.index?.array || Array.from({ length: g.attributes.position.count }, (_, i) => i);
      const kept = [];
      for (let i = 0; i < indices.length; i += 3) {
        const ids = [indices[i], indices[i + 1], indices[i + 2]];
        const y = ids.reduce((n, v) => n + g.attributes.position.getY(v), 0) / 3;
        const x = ids.reduce((n, v) => n + Math.abs(g.attributes.position.getX(v)), 0) / 3;
        if (y >= 1.14 || x > 0.3 || y < 0.15) kept.push(...ids);
      }
      if (!shortened.has(g)) { const copy = g.clone(); copy.setIndex(kept); shortened.set(g, copy); }
      mesh.userData.fullCostumeGeometry = g;
    }
  }
  const longPanels = new Set(baseMeshes.filter(mesh => [].concat(mesh.material).some(m => /Plum damask|Lavender binding/.test(m.name))).map(mesh => mesh.geometry));
  for (const mesh of baseMeshes) if (shortened.has(mesh.geometry)) mesh.userData.fullCostumeGeometry = mesh.geometry;
  for (const mesh of baseMeshes) {
    if ([].concat(mesh.material).some(m => /Face_00_SKIN/.test(m.name)) && faceSkin) {
      const m = new T.MeshStandardMaterial({ name: 'Atelier face skin', map: faceSkin, roughness: 0.82, color: 0xf0d7ce });
      mesh.material = m; originals.set(m, m.color.clone());
    }
    if (mesh.name === 'Hair') {
      for (const id of ['azure', 'amber']) {
        const g = mesh.geometry.clone(), positions = g.attributes.position;
        const headIndex = mesh.skeleton.bones.findIndex(b => b.name === 'J_Bip_C_Head');
        for (let i = 0; i < positions.count; i++) if (positions.getZ(i) < -0.12 && positions.getY(i) < 1.61) {
          positions.setY(i, 1.64 + (positions.getY(i) - 1.64) * (id === 'azure' ? 0.18 : 0.45));
          if (headIndex >= 0) { g.attributes.skinIndex.setXYZW(i, headIndex, 0, 0, 0); g.attributes.skinWeight.setXYZW(i, 1, 0, 0, 0); }
        }
        g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
        styledHair.set(id, g);
      }
      mesh.userData.fullHairGeometry = mesh.geometry;
    }
  }
  const headBone = root.getObjectByName('J_Bip_C_Head');
  if (headBone) headBone.scale.multiplyScalar(0.86);
  const compact = geometry => { const indexed = indexGeometry(geometry); if (indexed !== geometry) geometry.dispose(); return indexed; };

  const shape = points => {
    const s = new T.Shape(); s.moveTo(...points[0]);
    for (const p of points.slice(1)) s.lineTo(...p);
    s.closePath(); return s;
  };
  const bevel = (points, depth = 0.014, edge = 0.003) => {
    const g = new T.ExtrudeGeometry(shape(points), { depth, bevelEnabled: true, bevelThickness: edge, bevelSize: edge, bevelSegments: 2, steps: 1, curveSegments: 8 });
    g.translate(0, 0, -depth / 2); return g;
  };
  function build(id) {
    const p = palette[id], groups = new Map(), batches = new Map();
    const row = id === 'jade' ? 1 : ['violet', 'azure', 'amber'].indexOf(id);
    const cloth = textured(new T.MeshStandardMaterial({ color: p.cloth, side: T.DoubleSide, roughness: 0.93 }), row, id === 'violet' ? 1 : 0, 1, 0.75);
    const dark = textured(new T.MeshStandardMaterial({ color: 0x171b25, roughness: 0.68, metalness: 0.05 }), row, id === 'violet' ? 3 : 1);
    const steel = textured(new T.MeshStandardMaterial({ color: p.metal, roughness: 0.42, metalness: 0.45 }), row, 2);
    const trim = textured(new T.MeshStandardMaterial({ color: p.trim, roughness: 0.4, metalness: 0.55 }), row, 2);
    const glow = new T.MeshStandardMaterial({ color: p.glow, emissive: p.glow, emissiveIntensity: 0.65, roughness: 0.22, metalness: 0.35 });
    const edge = new T.MeshStandardMaterial({ color: 0xe5ebf6, metalness: 0.85, roughness: 0.2 });
    const forgedSteel = new T.MeshStandardMaterial({ color: 0x7b848c, metalness: 0.86, roughness: 0.29 });
    forgedSteel.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec2 steelUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'steelUv = uv;\n#include <begin_vertex>');
      shader.fragmentShader = 'varying vec2 steelUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor += 0.035 * sin(steelUv.x*730.0 + sin(steelUv.y*16.0));');
    };
    forgedSteel.customProgramCacheKey = () => 'forged-steel-grain-v1';
    const leatherGrip = new T.MeshStandardMaterial({ color: id === 'violet' ? 0x342638 : 0x282423, roughness: 0.83 });
    const wood = new T.MeshStandardMaterial({ color: 0x382b26, roughness: 0.52, metalness: 0 });
    const hair = createHairKit(T, baseMeshes.find(mesh => mesh.name === 'Hair'), id, hairStrands); root.add(hair); groups.set('hair', hair);
    function group(boneName) {
      if (!groups.has(boneName)) {
        const bone = root.getObjectByName(boneName);
        const g = new T.Group(); g.name = `${id}_${boneName}_kit`;
        g.applyMatrix4(bone.matrixWorld.clone().invert().multiply(root.matrixWorld));
        bone.add(g); groups.set(boneName, g);
      }
      return groups.get(boneName);
    }
    function add(bone, geometry, material, pos = [0, 0, 0], rot = [0, 0, 0]) {
      const m = new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1));
      geometry.applyMatrix4(m);
      const key = `${bone}:${material.uuid}`;
      if (!batches.has(key)) batches.set(key, { bone, material, geometries: [] });
      batches.get(key).geometries.push(geometry.index ? geometry.toNonIndexed() : geometry);
    }
    function line(bone, points, material = trim, width = 0.0025) {
      add(bone, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(v => new T.Vector3(...v))), Math.max(4, points.length * 4), width, 5, false), material);
    }
    function plate(bone, points, pos, mat = steel, scale = 1) {
      const g = bevel(points.map(([x, y]) => [x * scale, y * scale]), 0.018, 0.004);
      const a = g.attributes.position;
      let half = Math.max(...points.map(([x]) => Math.abs(x))) * scale;
      for (let i = 0; i < a.count; i++) a.setZ(i, a.getZ(i) + 0.025 * (1 - Math.pow(a.getX(i) / Math.max(0.02, half), 2)));
      g.computeVertexNormals(); add(bone, g, mat, pos);
      line(bone, [...points, points[0]].map(([x, y]) => [pos[0] + x * scale, pos[1] + y * scale, pos[2] + 0.012 + 0.025 * (1 - Math.pow(x * scale / Math.max(0.02, half), 2))]));
    }
    function drape(bone, width, height, pos, material, back = false) {
      const nx = 12, ny = 18, positions = [], uvs = [], indices = [];
      for (let y = 0; y <= ny; y++) for (let x = 0; x <= nx; x++) {
        const u = x / nx, v = y / ny;
        positions.push((u - 0.5) * width * (0.8 + v * 0.2), -v * height, (back ? -1 : 1) * (0.015 * Math.cos(u * Math.PI * 8) * v + 0.035 * Math.sin(v * Math.PI)));
        uvs.push(u, v);
        if (x < nx && y < ny) { const n = y * (nx + 1) + x; indices.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); add(bone, g, material, pos);
      for (const side of [-1, 1]) line(bone, Array.from({ length: 12 }, (_, i) => { const v = i / 11; return [pos[0] + side * width * (0.8 + v * 0.2) / 2, pos[1] - v * height, pos[2] + (back ? -1 : 1) * (0.015 * v + 0.035 * Math.sin(v * Math.PI))]; }), trim, 0.0025);
    }
    function sleeve(side, short = false) {
      const upper = `J_Bip_${side < 0 ? 'R' : 'L'}_UpperArm`, lower = `J_Bip_${side < 0 ? 'R' : 'L'}_LowerArm`;
      for (const [bone, begin, end, radius] of [[upper, 0.13, short ? 0.23 : 0.34, 0.044], ...(!short ? [[lower, 0.35, 0.49, 0.034]] : [])]) {
        const g = new T.CylinderGeometry(radius * 0.9, radius, end - begin, 16, 6, true); g.rotateZ(-side * Math.PI / 2);
        add(bone, g, cloth, [side * (begin + end) / 2, 1.378, -0.025]);
        add(bone, new T.TorusGeometry(radius * 0.95, 0.003, 5, 16), trim, [side * end, 1.378, -0.025], [0, Math.PI / 2, 0]);
      }
    }
    const chest = 'J_Bip_C_UpperChest', hips = 'J_Bip_C_Hips', head = 'J_Bip_C_Head';
    const crest = [[0, 0.035], [0.021, 0], [0, -0.035], [-0.021, 0]];
    // Faceted clasp and joined brass seams remain readable at the gameplay camera.
    plate(chest, crest, [0, 1.32, 0.127], trim);
    add(chest, new T.OctahedronGeometry(0.016), glow, [0, 1.32, 0.149]);
    if (id === 'azure') {
      sleeve(-1); sleeve(1);
      drape(hips, 0.17, 0.44, [0, 1.02, 0.16], cloth);
      drape(chest, 0.32, 0.4, [0, 1.43, -0.13], cloth, true);
      for (let i = 0; i < 3; i++) line(head, [[-0.06, 1.69 + i * 0.015, -0.17], [0, 1.735 + i * 0.005, -0.2], [0.06, 1.69 + i * 0.015, -0.17]], trim, 0.003);
      plate(chest, [[-0.112, 0.1], [-0.055, 0.125], [0, 0.09], [0.055, 0.125], [0.112, 0.1], [0.105, -0.025], [0, -0.105], [-0.105, -0.025]], [0, 1.275, 0.117]);
      for (const s of [-1, 1]) {
        const arm = `J_Bip_${s < 0 ? 'R' : 'L'}_UpperArm`;
        for (let i = 0; i < 3; i++) {
          plate(arm, [[-0.056, 0.035], [0, 0.065], [0.062, 0.015], [0.048, -0.045], [-0.045, -0.04]], [s * (0.162 + i * 0.035), 1.42 - i * 0.025, 0.008], i === 0 ? steel : dark);
          const shell = new T.SphereGeometry(0.057, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2); shell.scale(1.1, 0.55, 1);
          add(arm, shell, steel, [s * (0.16 + i * 0.035), 1.402 - i * 0.025, -0.017]);
        }
        const leg = `J_Bip_${s < 0 ? 'R' : 'L'}_LowerLeg`;
        plate(leg, [[-0.038, 0.17], [0, 0.205], [0.038, 0.17], [0.025, -0.15], [0, -0.185], [-0.025, -0.15]], [s * 0.078, 0.34, 0.055]);
        plate(hips, [[-0.06, 0.055], [0.06, 0.055], [0.075, -0.16], [0, -0.24], [-0.075, -0.16]], [s * 0.145, 1.02, 0.046], dark);
      }
      plate(head, [[-0.075, 0], [-0.018, 0.015], [0, -0.018], [0.018, 0.015], [0.075, 0], [0.065, -0.022], [0, -0.035], [-0.065, -0.022]], [0, 1.617, 0.08], trim);
    } else if (id === 'violet') {
      sleeve(1);
      drape(chest, 0.3, 0.4, [0.07, 1.44, -0.13], cloth, true);
      // Asymmetric layered shoulder mantle, with a back panel and raised embroidery.
      plate('J_Bip_L_UpperArm', [[-0.045, 0.025], [0.065, 0.018], [0.077, -0.095], [0.005, -0.135], [-0.05, -0.075]], [0.16, 1.4, 0.005], dark);
      for (const s of [-1, 1]) {
        line(hips, [[s * 0.12, 1.045, 0.13], [s * 0.18, 0.86, 0.165], [s * 0.2, 0.73, 0.17]], trim, 0.003);
        plate(head, crest, [s * 0.105, 1.603, -0.009], trim, 0.6);
      }
      line(head, [[-0.065, 1.702, -0.09], [-0.065, 1.705, -0.19], [-0.065, 1.71, -0.26]], trim, 0.004);
    } else if (id === 'jade') {
      sleeve(-1, true); sleeve(1, true);
      drape(hips, .17, .27, [-.11,1.02,.14], cloth);
      drape(chest, .22, .31, [-.08,1.43,-.13], cloth, true);
      plate('J_Bip_L_UpperArm', [[-.04,.025],[.05,.035],[.06,-.055],[-.04,-.07]], [.15,1.41,.01], steel);
      plate('J_Bip_L_LowerArm', [[-.03,.09],[.035,.08],[.03,-.09],[-.03,-.10]], [.40,1.38,.015], dark);
      line(chest, [[-.10,1.39,.13],[.01,1.29,.15],[.13,1.14,.11]], dark,.014);
      // Angled leather quiver and visible shafts on the drawing-hand side.
      add(chest,new T.CylinderGeometry(.053,.043,.39,16,1,true),leatherGrip,[-.09,1.30,-.20],[0,0,-.30]);
      for(const y of [1.13,1.48]) add(chest,new T.TorusGeometry(.053,.005,5,16),trim,[-.09+(y-1.30)*.30,y,-.20],[Math.PI/2,0,-.30]);
      for(let i=0;i<7;i++) {
        const x=-.14+(i%3)*.025,z=-.21+Math.floor(i/3)*.018,y=1.48+(i%2)*.022;
        add(chest,new T.CylinderGeometry(.003,.003,.39,6),wood,[x,y-.03,z],[0,0,-.30]);
        add(chest,new T.BoxGeometry(.027,.07,.002),steel,[x-.045,y+.145,z],[0,0,-.30]);
      }
      for(const side of [-1,1]) plate(head,crest,[side*.07,1.67,-.13],trim,.5);
    } else {
      sleeve(-1, true); sleeve(1, true);
      drape(hips, 0.14, 0.19, [0.13, 1.01, -0.15], cloth, true);
      // Short jacket with outward lapels; no long plum skirt panels.
      for (const s of [-1, 1]) {
        plate(chest, [[-0.028, 0.13], [0.026, 0.12], [0.033, -0.085], [-0.025, -0.07]], [s * 0.075, 1.29, 0.119], cloth);
        plate(`J_Bip_${s < 0 ? 'R' : 'L'}_UpperArm`, [[-0.045, 0.026], [0.055, 0.012], [0.065, -0.045], [-0.04, -0.06]], [s * 0.15, 1.402, 0.01], cloth);
        const leg = `J_Bip_${s < 0 ? 'R' : 'L'}_UpperLeg`;
        for (let i = 0; i < 2; i++) add(leg, new T.TorusGeometry(0.065, 0.008, 5, 16), dark, [s * 0.088, 0.83 - i * 0.04, 0.008], [Math.PI / 2, 0, 0]);
        plate(hips, [[-0.024, 0.06], [0.024, 0.06], [0.029, -0.055], [-0.025, -0.08]], [s * 0.166, 0.96, 0.025], dark);
        line(head, [[s * 0.07, 1.66, -0.12], [s * 0.105, 1.71, -0.17], [s * 0.095, 1.62, -0.18]], trim, 0.003);
      }
      line(chest, [[-0.11, 1.36, 0.112], [0.02, 1.25, 0.143], [0.112, 1.16, 0.101]], dark, 0.012);
    }

    // +Y is the blade direction before mounting the wrapped grip in the hand.
    function weapon(hand, kind) {
      const bone = root.getObjectByName(hand), weapon = new T.Group(); weapon.name = `${id}_${hand}_weapon`;
      const bind = new T.Matrix4().makeBasis(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1), new T.Vector3(1, 0, 0));
      bind.setPosition(-0.045, -0.012, 0.025);
      weapon.applyMatrix4(bind); bone.add(weapon);
      const wm = new Map();
      const put = (g, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => {
        g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...pos), new T.Quaternion().setFromEuler(new T.Euler(...rot)), new T.Vector3(1, 1, 1)));
        if (!wm.has(mat)) wm.set(mat, []); wm.get(mat).push(g.index ? g.toNonIndexed() : g);
      };
      if (kind === 'glaive') {
        put(new T.CylinderGeometry(0.018, 0.022, 1.66, 16), wood, [0, 0.075, 0]);
        for (const y of [-0.68, -0.27, 0.11, 0.69]) put(new T.CylinderGeometry(0.023, 0.023, 0.035, 16), forgedSteel, [0, y, 0]);
        put(new T.CylinderGeometry(0.031, 0.022, 0.12, 16), trim, [0, 0.78, 0]);
        put(new T.TorusGeometry(0.038, 0.005, 6, 24), forgedSteel, [-0.01, 0.74, 0], [0, Math.PI / 2, 0]);
        put(new T.ConeGeometry(0.032, 0.16, 8), edge, [0, -0.83, 0], [0, 0, Math.PI]);
        for (let i = 0; i < 3; i++) {
          const ribbon = new T.PlaneGeometry(0.016, 0.23, 2, 10), positions = ribbon.attributes.position;
          for (let v = 0; v < positions.count; v++) { const fall = (0.115 - positions.getY(v)) / 0.23; positions.setX(v, positions.getX(v) + 0.025 * Math.sin(fall * 3 + i)); positions.setZ(v, 0.013 * Math.sin(fall * 5 + i) * fall); }
          ribbon.computeVertexNormals(); put(ribbon, cloth, [0.035 + i * 0.016, 0.635, 0]);
        }
      } else {
        put(new T.CylinderGeometry(0.013, 0.016, 0.19, 12), leatherGrip, [0, -0.018, 0]);
        put(new T.CylinderGeometry(0.017, 0.017, 0.009, 16), trim, [0, -0.122, 0]);
        put(new T.CylinderGeometry(0.02, 0.017, 0.025, 12), trim, [0, 0.12, 0]);
        if (kind === 'katana') {
          const guard = new T.CylinderGeometry(0.038, 0.038, 0.006, 24); guard.scale(1, 1, 0.82); put(guard, forgedSteel, [0, 0.094, 0]);
        } else put(bevel([[-0.055, -0.006], [-0.048, 0.006], [0.043, 0.01], [0.055, -0.012], [0.027, -0.016], [-0.028, -0.012]], 0.012, 0.003), forgedSteel, [0, 0.1, 0]);
      }
      const cord = Array.from({ length: 100 }, (_, i) => { const t = i / 99, a = t * Math.PI * 20; return new T.Vector3(Math.cos(a) * 0.016, -0.107 + t * 0.19, Math.sin(a) * 0.016); });
      put(new T.TubeGeometry(new T.CatmullRomCurve3(cord), 100, 0.0024, 4, false), leatherGrip);
      for (const part of forgedBlade(T, kind)) put(part.geometry, part.edge ? edge : forgedSteel);
      for (const [mat, geometries] of wm) { const mesh = new T.Mesh(compact(mergeGeometries(geometries)), mat); mesh.frustumCulled = false; weapon.add(mesh); geometries.forEach(g => g.dispose()); }
      groups.set(hand + '_weapon', weapon);
    }
    if (id === 'jade') groups.set('bow',createBowKit(T,root,bowFingerRest));
    else weapon('J_Bip_R_Hand', id === 'azure' ? 'glaive' : id === 'amber' ? 'dagger' : 'katana');
    if (id === 'amber') weapon('J_Bip_L_Hand', 'dagger');
    for (const { bone, material, geometries } of batches.values()) {
      const mesh = new T.Mesh(compact(mergeGeometries(geometries)), material); mesh.frustumCulled = false; group(bone).add(mesh);
      geometries.forEach(g => g.dispose());
    }
    return [...groups.values()];
  }
  // Retain the skinned blade as an invisible sampling rig for the existing trails.
  for (const mesh of baseMeshes) if (mesh.geometry === sword.geometry) mesh.visible = false;
  return {
    ready,
    update() {
      for (const group of kits.get(activeId) || []) { group.userData.updateHair?.(performance.now() / 1000); group.userData.updateBow?.(); }
    },
    apply(profile) {
      activeId = profile.id;
      const p = palette[profile.id] || palette.violet;
      if (!kits.has(profile.id)) kits.set(profile.id, build(profile.id));
      for (const [id, groups] of kits) for (const group of groups) group.visible = id === profile.id;
      for (const mesh of baseMeshes) {
        if (mesh.userData.fullCostumeGeometry) mesh.geometry = ['amber','jade'].includes(profile.id) ? shortened.get(mesh.userData.fullCostumeGeometry) : mesh.userData.fullCostumeGeometry;
        const materials = [].concat(mesh.material);
        if (longPanels.has(mesh.geometry)) mesh.visible = profile.id === 'violet';
        if (/^(Hair|Braid)/.test(mesh.name) || oldHairGeometries.has(mesh.geometry)) mesh.visible = false;
        if (mesh.userData.hairFoundation) { mesh.visible = true; mesh.material.color.setHex({ violet: 0x281731, azure: 0x172932, amber: 0x362218, jade:0x1c3027 }[profile.id]); }
        if (mesh.userData.fullHairGeometry) mesh.geometry = styledHair.get(profile.id) || mesh.userData.fullHairGeometry;
        for (const m of materials) {
          if (!m.color || m.side === T.BackSide) continue;
          if (m.name === 'Atelier hair foundation') continue;
          const row = profile.id === 'jade' ? 1 : ['violet', 'azure', 'amber'].indexOf(profile.id);
          if (/Charcoal pinstripe/.test(m.name)) { m.color.setHex(profile.id === 'azure' ? 0x243844 : 0x292630); textured(m, row, 0, 1, 0.22); }
          else if (/Bottoms_01|Black leather|Boot leather|Strap leather/.test(m.name)) { m.color.setHex(profile.id === 'amber' ? 0x40302a : 0x292b35); textured(m, row, profile.id === 'violet' ? 3 : 1, 1, 0.18); }
          else if (/Plum damask/.test(m.name)) { m.color.setHex(p.cloth); textured(m, row, profile.id === 'violet' ? 1 : 0, 1, 0.55); }
          else if (/Lavender binding|Brushed brass/.test(m.name)) m.color.setHex(p.trim);
          else if (/HairBack|Hair_00/.test(m.name)) m.color.setHex(p.hair);
          else if (/EyeIris/.test(m.name)) m.color.setHex(profile.tint);
          else if (originals.has(m)) m.color.copy(originals.get(m));
        }
        if (mesh.morphTargetDictionary) {
          const brow = mesh.morphTargetDictionary.Fcl_BRW_Angry;
          const eye = mesh.morphTargetDictionary.Fcl_EYE_Angry;
          if (brow !== undefined) mesh.morphTargetInfluences[brow] = profile.id === 'azure' ? 0.45 : profile.id === 'amber' ? 0.18 : 0.32;
          if (eye !== undefined) mesh.morphTargetInfluences[eye] = 0.32;
        }
      }
    },
    kits,
    dispose() {
      const geometries = new Set(), materials = new Set();
      for (const groups of kits.values()) for (const group of groups) {
        group.removeFromParent();
        group.traverse(mesh => { if (mesh.isMesh || mesh.isLine) { geometries.add(mesh.geometry); for (const m of [].concat(mesh.material)) materials.add(m); } });
      }
      for (const mesh of baseMeshes) if (!sourceGeometry.has(mesh.geometry)) geometries.add(mesh.geometry);
      for (const mesh of baseMeshes) for (const m of [].concat(mesh.material)) if (!sourceMaterials.has(m)) materials.add(m);
      for (const g of [...shortened.values(), ...styledHair.values()]) geometries.add(g);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const url of textureUrls) releaseTexture(url);
    },
  };
}
