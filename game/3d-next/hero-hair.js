import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { indexGeometry } from './index-geometry.js?v=20261002c';

// Rounded, tapered locks follow the head; a small shader sway moves loose tips.
export function createHairKit(T, source, id, strandTexture = null) {
  const colors = { violet: [0x281731, 0x33203c, 0x3e2948], azure: [0x172932, 0x23353e, 0x2d404a], amber: [0x362218, 0x453023, 0x543b2a], jade:[0x1c3027,0x294338,0x365248] }[id];
  const clock = { value: 0 };
  const materials = colors.map(color => {
    const m = new T.MeshPhysicalMaterial({ color, map: strandTexture, alphaTest: strandTexture ? 0.28 : 0, side: T.DoubleSide, roughness: 0.79, metalness: 0, sheen: 0.12, sheenColor: new T.Color(color).multiplyScalar(1.4), sheenRoughness: 0.65, anisotropy: 0.45, envMapIntensity: 0.28 });
    m.onBeforeCompile = shader => {
      shader.uniforms.uHairTime = clock;
      shader.vertexShader = 'uniform float uHairTime;\nvarying vec2 hairUv;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'hairUv = uv;\n#include <begin_vertex>\nfloat fall = clamp((1.61-position.y)/0.6,0.0,1.0) * step(position.z,-0.12);\ntransformed.x += sin(uHairTime*2.1 + fall*2.0)*0.014*fall;\ntransformed.z += cos(uHairTime*1.7 + fall)*0.008*fall;');
      shader.fragmentShader = 'varying vec2 hairUv;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\nvec4 hairSample = texture2D(map,vMapUv);\nfloat hairValue = dot(hairSample.rgb,vec3(0.299,0.587,0.114));\ndiffuseColor *= vec4(vec3(0.4+0.6*sqrt(hairValue)),hairSample.a);\n#endif');
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat strand = 0.94 + 0.06 * sin(hairUv.x * 320.0 + sin(hairUv.y * 9.0));\ndiffuseColor.rgb *= strand * (0.86 + 0.14 * sin(hairUv.y * 3.14159));');
    };
    m.customProgramCacheKey = () => 'atelier-hair-strands-v1';
    return m;
  });
  const geometries = [[], [], []], center = new T.Vector3(0, 1.595, -0.025);
  const headIndex = source.skeleton.bones.findIndex(b => b.name === 'J_Bip_C_Head');
  source.updateMatrixWorld(true);
  function skin(g) {
    const position = g.attributes.position, indices = [], weights = [];
    for (let i = 0; i < position.count; i++) {
      indices.push(headIndex, 0, 0, 0); weights.push(1, 0, 0, 0);
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(indices, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(weights, 4));
    return g.toNonIndexed();
  }
  function lock(points, width, shade, tail = false) {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p))), rows = 16, sides = 4;
    const positions = [], uvs = [], indices = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows, p = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
      const normal = p.clone().sub(center).normalize(); normal.addScaledVector(tangent, -normal.dot(tangent)).normalize();
      if (normal.lengthSq() < 0.1) normal.set(0, 0, 1);
      const side = new T.Vector3().crossVectors(tangent, normal).normalize();
      const radius = width * (0.85 + 0.15 * Math.sin(t * Math.PI)) * Math.max(0.035, Math.pow(1 - t, 0.5));
      for (let s = 0; s <= sides; s++) {
        const angle = s / sides * Math.PI;
        const v = p.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius * 0.08);
        positions.push(...v.toArray()); uvs.push(s / sides, 1 - t);
        if (r < rows && s < sides) { const n = r * (sides + 1) + s; indices.push(n, n + sides + 1, n + 1, n + 1, n + sides + 1, n + sides + 2); }
      }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(indices); g.computeVertexNormals(); geometries[shade].push(skin(g, tail));
  }
  const scalp = new T.SphereGeometry(1, 40, 28); scalp.scale(0.108, 0.133, 0.092); scalp.translate(0, 1.591, -0.025);
  const scalpIds = [], scalpPos = scalp.attributes.position;
  for (let i = 0; i < scalp.index.count; i += 3) {
    const ids = [scalp.index.getX(i), scalp.index.getX(i + 1), scalp.index.getX(i + 2)];
    const y = ids.reduce((v, index) => v + scalpPos.getY(index), 0) / 3;
    const z = ids.reduce((v, index) => v + scalpPos.getZ(index), 0) / 3;
    if (y > (z > 0.005 ? 1.645 : 1.485)) scalpIds.push(...ids);
  }
  scalp.setIndex(scalpIds);
  const foundation = skin(scalp); scalp.dispose();
  // Crown strands run from the parting across the skull; the forehead remains open.
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    const front = Math.cos(a) > 0.25;
    const endY = front ? 1.6 : 1.475;
    lock([[(id === 'violet' ? -0.035 : 0.015) + Math.sin(a) * 0.023, 1.718 + Math.sin(i * 1.4) * 0.003, -0.025 + Math.cos(a) * 0.018], [Math.sin(a) * 0.084, 1.698, Math.cos(a) * 0.061 - 0.025], [Math.sin(a) * 0.113, 1.605, Math.cos(a) * 0.088 - 0.025], [Math.sin(a) * 0.097, endY + Math.sin(i * 1.9) * 0.008, Math.cos(a) * 0.079 - 0.023]], 0.012 + Math.sin(i * 2.3) * 0.0015, i % 3);
  }
  // Side-swept, overlapping fringe: separate tapered ends, no straight helmet rim.
  const fringeCount = id === 'amber' ? 22 : id === 'azure' ? 18 : 28;
  for (let i = 0; i < fringeCount; i++) {
    const x = -0.096 + i / (fringeCount - 1) * 0.193;
    const endY = id === 'azure' ? 1.594 + Math.abs(x) * 0.32 : id === 'amber' ? 1.573 + Math.sin(i * 2.3) * 0.018 : 1.554 + Math.abs(i - 13) * 0.0028 + Math.sin(i * 1.7) * 0.008;
    lock([[x * 0.5, 1.715, 0.032], [x, 1.668, 0.074], [x + 0.015, 1.626, 0.097], [x + (id === 'azure' ? 0.045 : 0.03), endY, 0.081]], 0.009, i % 3);
  }
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    lock([[side * 0.082, 1.685, 0.032], [side * (0.111 + i * 0.002), 1.602, 0.051], [side * 0.105, 1.501, 0.017], [side * (0.09 + i * 0.005), 1.449 - i * 0.018, 0.035]], 0.009, i);
  }
  if (id === 'azure') {
    // Coiled bun is made from winding locks with a visible part, not a sphere.
    for (let i = 0; i < 15; i++) {
      const a = i / 15 * Math.PI * 2;
      lock([[0, 1.68, -0.095], [Math.cos(a) * 0.05, 1.702 + Math.sin(a) * 0.025, -0.132], [Math.cos(a + 1.5) * 0.053, 1.687 + Math.sin(a + 1.5) * 0.034, -0.174], [Math.cos(a + 3) * 0.026, 1.659, -0.12]], 0.024, i % 3);
    }
  } else {
    const length = id === 'violet' ? 0.64 : 0.34;
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2, x = Math.cos(a) * 0.039, z = Math.sin(a) * 0.027;
      lock([[x * 0.6, 1.673, -0.144 + z], [x, 1.57, -0.236 + z], [x * 1.1, 1.673 - length * 0.6, -0.26 + z], [x * 0.65 + 0.02, 1.673 - length - (i % 4) * 0.016, -0.177 + z]], 0.008, i % 3, true);
    }
  }
  const group = new T.Group(); group.name = `${id}_atelier_hair`;
  group.userData.updateHair = seconds => { clock.value = seconds; };
  for (let i = 0; i < 3; i++) {
    const merged = mergeGeometries(geometries[i]), geometry = indexGeometry(merged); if (geometry !== merged) merged.dispose();
    const mesh = new T.SkinnedMesh(geometry, materials[i]); mesh.name = `${id}_hair_locks_${i}`;
    mesh.applyMatrix4(source.matrix); mesh.bind(source.skeleton, source.bindMatrix.clone()); mesh.frustumCulled = false; group.add(mesh);
    geometries[i].forEach(g => g.dispose());
  }
  const indexedFoundation = indexGeometry(foundation); if (indexedFoundation !== foundation) foundation.dispose();
  const base = new T.SkinnedMesh(indexedFoundation, new T.MeshStandardMaterial({ color: colors[0], roughness: 0.91 }));
  base.name = `${id}_hair_foundation`; base.applyMatrix4(source.matrix); base.bind(source.skeleton, source.bindMatrix.clone()); base.frustumCulled = false; group.add(base);
  return group;
}

export function createHeroEnvironment(T, renderer) {
  const studio = new T.Scene(); studio.background = new T.Color(0x30313b);
  const panels = [[0, 5, 0, 4, 1, 5], [-4, 1, 1, 1, 4, 2], [4, 2, -1, 1, 3, 2], [0, 1, -5, 5, 3, 1], [-2, 2.5, 4, 1.5, 4, 0.3], [2, 1.2, 5, 0.7, 2, 0.3]];
  for (const [x, y, z, sx, sy, sz] of panels) {
    const mesh = new T.Mesh(new T.BoxGeometry(sx, sy, sz), new T.MeshBasicMaterial({ color: 0xd5dde3 })); mesh.position.set(x, y, z); studio.add(mesh);
  }
  const pmrem = new T.PMREMGenerator(renderer), target = pmrem.fromScene(studio, 0.02);
  pmrem.dispose(); studio.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return target;
}
