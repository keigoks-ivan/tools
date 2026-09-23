import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Authored in the existing animation rig's centimetre-scale bind space.
// All garments, facial features and hair are genuine skinned geometry. Each
// character uses four merged surfaces, one rig, vertex colour and no textures.
export const HERO_LOOKS = {
  rumi: { skin: '#f2c7b0', hair: '#68449b', highlight: '#8363b1', cloth: '#eee7d9', dark: '#29243e', accent: '#8a68be', metal: '#dbb86c', eye: '#79509b' },
  mira: { skin: '#f1c4b1', hair: '#b73b60', highlight: '#cf5f7e', cloth: '#2b293d', dark: '#171c2a', accent: '#a44e74', metal: '#c5c8df', eye: '#869bae' },
  zoey: { skin: '#e9bd9e', hair: '#242738', highlight: '#515878', cloth: '#35948b', dark: '#202536', accent: '#e1b353', metal: '#dbc37d', eye: '#745548' },
};

export function buildAnimeHero(root, key) {
  const look = HERO_LOOKS[key];
  if (!look) throw new Error(`Unknown hero: ${key}`);
  root.updateMatrixWorld(true);
  const oldMeshes = [];
  root.traverse(o => { if (o.isMesh) oldMeshes.push(o); });
  const sourceSword = oldMeshes.find(o => /sword/i.test(o.name) && o.isSkinnedMesh);
  if (!sourceSword) throw new Error('The animated Maria sword rig is required');
  const bones = sourceSword.skeleton.bones;
  const skeleton = new THREE.Skeleton(bones);
  skeleton.calculateInverses();
  const boneIndex = new Map(bones.map((b, i) => [b.name.replace(/^mixamorig/, ''), i]));
  const joint = name => {
    const index = boneIndex.get(name);
    if (index === undefined) throw new Error(`Missing hero joint ${name}`);
    return bones[index].getWorldPosition(new THREE.Vector3());
  };
  const rigid = name => [[boneIndex.get(name), 1]];
  const blend = (a, b, t) => [[boneIndex.get(a), 1 - t], [boneIndex.get(b), t]];
  const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
  const torsoWeights = p => {
    if (p.y < 111) return blend('Hips', 'Spine', smooth(103, 111, p.y));
    if (p.y < 124) return blend('Spine', 'Spine1', smooth(111, 124, p.y));
    return blend('Spine1', 'Spine2', smooth(124, 135, p.y));
  };
  const buckets = { body: [], hair: [], detail: [], sword: [] };
  const colour = new THREE.Color();
  function add(geometry, hex, weights, bucket = 'body') {
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    const pos = geometry.attributes.position, colours = [], indices = [], values = [];
    if (typeof hex !== 'function') colour.set(hex);
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      if (typeof hex === 'function') colour.set(hex(p));
      const skin = typeof weights === 'function' ? weights(p) : weights;
      colours.push(colour.r, colour.g, colour.b);
      for (let j = 0; j < 4; j++) {
        indices.push(skin[j]?.[0] ?? 0);
        values.push(skin[j]?.[1] ?? 0);
      }
    }
    geometry.deleteAttribute('uv');
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(values, 4));
    buckets[bucket].push(geometry);
  }
  function oval(center, size, hex, weights, bucket = 'body', rotation = 0, segments = 20) {
    const g = new THREE.SphereGeometry(1, segments, 12);
    g.scale(...size); g.rotateZ(rotation); g.translate(...center);
    add(g, hex, weights, bucket);
  }
  // A closed cross-section garment, with independently authored widths/depths.
  function loft(rings, hex, weights, bucket = 'body', segments = 24) {
    const positions = [], index = [];
    for (const [y, rx, rz, x = 0, z = 0] of rings) {
      for (let i = 0; i <= segments; i++) {
        const a = i / segments * Math.PI * 2;
        positions.push(x + Math.sin(a) * rx, y, z + Math.cos(a) * rz);
      }
    }
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segments; i++) {
        const a = r * (segments + 1) + i, b = a + segments + 1;
        index.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index); g.computeVertexNormals();
    const normals = g.attributes.normal;
    for (let r = 0; r < rings.length; r++) {
      const first = r * (segments + 1), last = first + segments;
      const normal = new THREE.Vector3().fromBufferAttribute(normals, first)
        .add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
      normals.setXYZ(first, normal.x, normal.y, normal.z);
      normals.setXYZ(last, normal.x, normal.y, normal.z);
    }
    add(g, hex, weights, bucket);
  }
  function strand(points, radii, hex, weights, bucket = 'hair', sides = 8, steps = 16, flat = 1) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const g = new THREE.TubeGeometry(curve, steps, 1, sides, false);
    const frames = curve.computeFrenetFrames(steps, false);
    const positions = g.attributes.position, p = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPointAt(t);
      const rf = t * (radii.length - 1), ri = Math.min(radii.length - 2, Math.floor(rf));
      const radius = THREE.MathUtils.lerp(radii[ri], radii[ri + 1], rf - ri);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * Math.PI * 2;
        p.copy(center).addScaledVector(frames.normals[i], -Math.cos(a) * radius)
          .addScaledVector(frames.binormals[i], Math.sin(a) * radius * flat);
        positions.setXYZ(i * (sides + 1) + j, p.x, p.y, p.z);
      }
    }
    g.computeVertexNormals(); add(g, hex, weights, bucket);
  }
  function panel(points, hex, weights, bucket = 'detail', project = null) {
    if (project) {
      const vertices = [], indices = [], divisions = 6;
      const a = new THREE.Vector3(...points[0]);
      for (let triangle = 1; triangle < points.length - 1; triangle++) {
        const b = new THREE.Vector3(...points[triangle]), c = new THREE.Vector3(...points[triangle + 1]);
        const row = [];
        for (let i = 0; i <= divisions; i++) {
          row[i] = [];
          for (let j = 0; j <= divisions - i; j++) {
            const p = a.clone().multiplyScalar(1 - (i + j) / divisions)
              .addScaledVector(b, i / divisions).addScaledVector(c, j / divisions);
            project(p); row[i][j] = vertices.length / 3; vertices.push(p.x, p.y, p.z);
          }
        }
        for (let i = 0; i < divisions; i++) for (let j = 0; j < divisions - i; j++) {
          indices.push(row[i][j], row[i + 1][j], row[i][j + 1]);
          if (j < divisions - i - 1) indices.push(row[i + 1][j], row[i + 1][j + 1], row[i][j + 1]);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals(); add(geometry, hex, weights, bucket);
      return;
    }
    const v = points.flat();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const indices = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    g.setIndex(indices); g.computeVertexNormals(); add(g, hex, weights, bucket);
  }

  // Fitted torso and separate collar: contemporary stagewear, no plated armour.
  const torso = [[99, 15, 8, 0, 1], [105, 16, 9, 0, 1], [113, 11.9, 7.2, 0, 1],
    [122, 12.2, 7.5, 0, 1], [133, 15.6, 9.4, 0, .5], [140, 16.2, 8.5, 0, -.3],
    [145, 11.5, 6, 0, -1.5], [148, 4.4, 4, 0, -2.7]];
  loft(torso, look.dark, torsoWeights);
  loft([[147, 4, 3.7, 0, -2], [153, 3.8, 3.4, 0, -.8], [158, 4.4, 3.8, 0, 0]], look.skin,
    p => blend('Neck', 'Head', smooth(150, 158, p.y)));

  // A short structured jacket for Rumi/Zoey, a long tailored vest for Mira.
  const hem = key === 'mira' ? 106 : key === 'zoey' ? 122 : 117;
  const jacket = [[hem, key === 'mira' ? 16.8 : 13.4, 8.7, 0, .4],
    [126, 14.3, 9.4, 0, .4], [137, 17.1, 11.1, 0, -.2], [143, 17, 9.5, 0, -1.5], [147, 5.8, 4.8, 0, -2.6]];
  loft(jacket, p => p.z > 3 && Math.abs(p.x) < 4.7 ? look.dark : look.cloth, torsoWeights, 'body', 48);
  const coatSurface = (p, side = 1) => {
    const y = THREE.MathUtils.clamp(p.y, hem, 147);
    let row = 0;
    while (row < jacket.length - 2 && jacket[row + 1][0] < y) row++;
    const a = jacket[row], b = jacket[row + 1], t = (y - a[0]) / (b[0] - a[0]);
    const rx = THREE.MathUtils.lerp(a[1], b[1], t), rz = THREE.MathUtils.lerp(a[2], b[2], t);
    const z = THREE.MathUtils.lerp(a[4], b[4], t);
    p.z = z + side * (rz * Math.sqrt(Math.max(0, 1 - (p.x / rx) ** 2)) + .28);
  };
  // Open dark placket and angular lapels establish a recognisable silhouette.
  for (const s of [-1, 1]) {
    const lapel = [[s * 1.8, 143.8, 5.7], [s * 6.9, 145.3, 5.4], [s * 10.0, 136.7, 9.3], [s * 4.5, 128.8, 10.2]];
    if (s < 0) lapel.reverse();
    panel(lapel, key === 'mira' ? look.accent : look.metal, torsoWeights, 'detail', coatSurface);
    strand([[s * 13.1, hem + 1, 5.5], [s * 14, 129, 6], [s * 14.8, 138, 5]], [.35, .35], look.accent, torsoWeights, 'detail', 5, 8);
  }
  loft([[106, 16.4, 9.6, 0, 1], [109, 14.3, 9.0, 0, 1]], look.metal, rigid('Hips'), 'detail');
  oval([0, 107.5, 10.4], [2.4, 1.6, .5], look.dark, rigid('Hips'), 'detail');
  panel([[0, 109, 11], [1.4, 107.5, 11], [0, 106, 11], [-1.4, 107.5, 11]], look.metal, rigid('Hips'));
  // Small back insignia and stitched chevrons read from the gameplay camera.
  panel([[-4.5, 137, -10], [0, 132.5, -10], [4.5, 137, -10], [0, 135, -10.1]], look.accent, torsoWeights, 'detail', p => coatSurface(p, -1));
  for (const s of [-1, 1]) strand([[s * 1.6, 139, -10], [s * 4.8, 135, -10], [s * 7, 136, -9]], [.4, .4], look.metal, torsoWeights, 'detail', 5, 6);

  for (const side of ['Left', 'Right']) {
    const sign = side === 'Left' ? 1 : -1;
    const arm = joint(`${side}Arm`), elbow = joint(`${side}ForeArm`), wrist = joint(`${side}Hand`);
    const armWeights = p => {
      const d = Math.abs(p.x);
      return d < Math.abs(elbow.x) - 5 ? rigid(`${side}Arm`)
        : blend(`${side}Arm`, `${side}ForeArm`, smooth(Math.abs(elbow.x) - 5, Math.abs(elbow.x) + 5, d));
    };
    const shoulder = arm.clone(); shoulder.x -= sign * 2;
    oval(arm.toArray(), [7.1, 6.8, 6.5], look.cloth, rigid(`${side}Arm`));
    const sleeveEnd = elbow.clone().lerp(wrist, key === 'mira' ? -.42 : .28);
    strand([shoulder.toArray(), arm.clone().lerp(elbow, .45).toArray(), sleeveEnd.toArray()],
      key === 'mira' ? [5.7, 5.2, 4.3] : [6.8, 6.1, 4.6], look.cloth, armWeights, 'body', 16, 12);
    strand([arm.toArray(), elbow.toArray(), wrist.toArray()], [5.2, 3.7, 2.6], look.skin, armWeights, 'body', 16, 18);
    const cuff = elbow.clone().lerp(wrist, .65), cuffEnd = elbow.clone().lerp(wrist, .91);
    strand([cuff.toArray(), cuffEnd.toArray()], [3.1, 2.8], look.dark, rigid(`${side}ForeArm`), 'body', 12, 3);
    strand([cuff.toArray(), cuff.clone().lerp(cuffEnd, .13).toArray()], [3.22, 3.2], look.metal, rigid(`${side}ForeArm`), 'detail', 12, 2);
    // Individual articulated fingers, driven by the existing hand rig.
    const middle = joint(`${side}HandMiddle1`);
    const palm = wrist.clone().lerp(middle, .48);
    oval(palm.toArray(), [4.2, 2.0, 3.6], look.dark, rigid(`${side}Hand`));
    for (const digit of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      for (let n = 1; n <= 3; n++) {
        const name = `${side}Hand${digit}${n}`, next = `${side}Hand${digit}${n + 1}`;
        const a = joint(name), b = joint(next);
        strand([a.toArray(), b.toArray()], [digit === 'Thumb' ? 1.05 : .8, .65], n === 1 ? look.dark : look.skin,
          rigid(name), 'body', 8, 2);
      }
    }
    const hip = joint(`${side}UpLeg`), knee = joint(`${side}Leg`), ankle = joint(`${side}Foot`);
    const legWeights = p => p.y > ankle.y + 7 ? blend(`${side}UpLeg`, `${side}Leg`, 1 - smooth(knee.y - 5, knee.y + 7, p.y))
      : blend(`${side}Leg`, `${side}Foot`, 1 - smooth(ankle.y - 2, ankle.y + 7, p.y));
    const bootTop = key === 'rumi' ? 57 : key === 'mira' ? 40 : 49;
    const legRings = [[ankle.y - 3, 3.8, 4.3, ankle.x, ankle.z], [30, 5, 5, ankle.x, -.8],
      [43, 5.6, 5.9, knee.x, .5], [knee.y, 5, 5.4, knee.x, knee.z], [69, 6.4, 6.5, hip.x, .8],
      [85, 8.0, 7.8, hip.x, .7], [98, 8.7, 8.5, hip.x, .5], [103, 6.5, 6.7, hip.x, .7]];
    // Omit hidden skin inside boots/shorts so two independently interpolated
    // surfaces cannot cross through each other during an ankle/knee bend.
    const visibleLeg = [[bootTop, 5.6, 6, knee.x, knee.z],
      ...legRings.filter(ring => ring[0] > bootTop && (key === 'mira' || ring[0] < 86))];
    if (key !== 'mira') visibleLeg.push([86, 8.05, 7.95, hip.x, .7]);
    loft(visibleLeg, key === 'mira' ? look.dark : look.skin, legWeights, 'body', 20);
    // High-waist shorts / fitted trousers and shaped high boots.
    if (key !== 'mira') loft([[83, 8.4, 8.4, hip.x, .5], [94, 9.1, 9.3, hip.x, .5], [103, 8, 8.5, hip.x, .7]], look.dark, rigid(`${side}UpLeg`), 'body', 20);
    loft([[10, 4.7, 5, ankle.x, ankle.z], [23, 4.6, 5.5, ankle.x, -.8], [35, 6.4, 7.0, knee.x, .5],
      [bootTop, 6.2, 6.7, knee.x, knee.z]], look.dark, legWeights, 'body', 20);
    loft([[bootTop - 2, 6.3, 6.8, knee.x, knee.z], [bootTop + .2, 6.4, 6.9, knee.x, knee.z]], look.accent, legWeights, 'detail', 20);
    oval([ankle.x, 6.3, 5.4], [5.1, 6, 13.4], look.dark, rigid(`${side}Foot`));
    oval([ankle.x, 2.3, 6], [5.2, 2, 13.6], '#121623', rigid(`${side}Foot`));
    for (let i = 0; i < 3; i++) strand([[ankle.x - 3.3, 13 + i * 4.2, 4.2], [ankle.x + 3.3, 13 + i * 4.2, 4.2]], [.3, .3], look.metal, legWeights, 'detail', 5, 2);
    if (key === 'zoey') loft([[67, 6.6, 6.8, hip.x, .8], [73, 7.1, 7.2, hip.x, .8]], look.accent, rigid(`${side}UpLeg`), 'detail', 20);
  }
  // Asymmetric waist ribbons, tapered and skinned to hips rather than dozens
  // of independently rendered boxes. Mira has a long, split coat silhouette.
  for (const s of [-1, 1]) {
    const length = key === 'mira' ? 49 : key === 'rumi' ? 31 : 16;
    strand([[s * 14.8, 106, -4], [s * 18, 94, -6], [s * 19, 106 - length, -9]],
      [key === 'mira' ? 5.3 : 2, 3, .18], look.accent, rigid('Hips'), 'body', 8, 12, .16);
  }

  // Sculpted face: tapered chin, cheeks, brow and crown, with modelled eyes.
  const headWeights = rigid('Head');
  const longHairWeights = p => p.y >= 135
    ? blend('Spine2', 'Head', smooth(135, 157, p.y))
    : blend('Hips', 'Spine2', smooth(106, 135, p.y));
  loft([[153.5, .5, 1.5, 0, 3], [155, 4.5, 4.6, 0, 1.6], [157, 6.5, 5.8, 0, 1.2], [159, 7.8, 6.8, 0, .7],
    [161.5, 9, 7.8, 0, .2], [164, 9.7, 8.4, 0, 0], [170, 9.7, 8.1, 0, -.4], [175, 8.0, 6.9, 0, -.6], [178.5, .3, .4, 0, -.8]],
  look.skin, headWeights, 'body', 32);
  for (const s of [-1, 1]) {
    oval([s * 9.2, 163.5, -.5], [1.8, 3.0, 1.9], look.skin, headWeights);
    oval([s * 10.2, 161, .7], [.75, 1.75, .65], look.metal, headWeights, 'detail', 0, 12);
    oval([s * 4.2, 166.7, 7.65], [2.85, 1.55, .5], '#252239', headWeights, 'detail', s * .1);
    oval([s * 4.2, 166.55, 7.97], [2.5, 1.13, .3], '#fff4e8', headWeights, 'detail', s * .1);
    oval([s * 4.0, 166.6, 8.24], [.95, 1.12, .2], look.eye, headWeights, 'detail');
    oval([s * 4.0, 166.7, 8.43], [.43, .79, .11], '#181c31', headWeights, 'detail', 0, 12);
    oval([s * 4 - .3, 167.18, 8.55], [.3, .36, .08], '#ffffff', headWeights, 'detail', 0, 10);
    strand([[s * 1.8, 169.7, 7.5], [s * 4.2, 170.2, 7.35], [s * 6.5, 169.65, 6.8]], [.24, .36, .08], look.hair, headWeights, 'detail', 6, 8);
    strand([[s * 6.1, 167.4, 7.9], [s * 7.2, 168.1, 7.35]], [.32, .05], '#252239', headWeights, 'detail', 5, 3);
  }
  oval([0, 163.45, 8.15], [.85, 1.4, 1.1], look.skin, headWeights);
  strand([[-1.6, 159.55, 7.15], [0, 159.35, 7.65], [1.6, 159.55, 7.15]], [.13, .2, .13], '#bc767b', headWeights, 'detail', 6, 8);

  // Continuous hair cap with a higher hairline at the face and a low nape.
  const capPositions = [], capIndex = [], around = 32, vertical = 12;
  for (let row = 0; row <= vertical; row++) {
    for (let col = 0; col <= around; col++) {
      const a = col / around * Math.PI * 2;
      const front = Math.max(0, Math.cos(a));
      const theta = row / vertical * (2.05 - .88 * front);
      capPositions.push(Math.sin(theta) * Math.sin(a) * 10.7,
        167 + Math.cos(theta) * 13, -1 + Math.sin(theta) * Math.cos(a) * 10.0);
    }
  }
  for (let r = 0; r < vertical; r++) for (let i = 0; i < around; i++) {
    const a = r * (around + 1) + i, b = a + around + 1;
    capIndex.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(capPositions, 3)); cap.setIndex(capIndex); cap.computeVertexNormals();
  add(cap, look.hair, headWeights, 'hair');
  // Swept, tapered fringe and temple locks. No spherical bead-chain hair.
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 2.7;
    const sweep = key === 'rumi' ? 3.5 : key === 'mira' ? -2.6 : .6;
    strand([[x * .45, 179, 2], [x * .8 + sweep * .4, 175, 7.5], [x + sweep, 169.3 + Math.abs(i - 3) * .25, 8.9 - Math.abs(x) * .13]],
      [1.8, 2.35, .03], i % 3 === 0 ? look.highlight : look.hair, headWeights, 'hair', 8, 12, .55);
  }
  for (const s of [-1, 1]) strand([[s * 9.2, 173, 1], [s * 10.3, 165, 2], [s * 9.2, key === 'mira' ? 146 : 157, 3.5]],
    [2.2, 2.0, .05], look.hair, headWeights, 'hair', 8, 14, .55);
  if (key === 'rumi') {
    strand([[0, 178, -6], [1, 177, -13], [3, 165, -14]], [3.3, 4.2, 3.8], look.hair, headWeights, 'hair', 10, 12);
    // Three interleaved tapered strands form a single long braid.
    for (let n = 0; n < 3; n++) {
      const points = [], radii = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, a = t * Math.PI * 8 + n * Math.PI * 2 / 3;
        points.push([3 + t * 6 + Math.cos(a) * (2.4 - t * .9), 164 - t * 59, -14 - t * 2 + Math.sin(a) * 1.5]);
        radii.push(1.8 * (1 - t * .65));
      }
      strand(points, radii, n === 1 ? look.highlight : look.hair, longHairWeights, 'hair', 8, 56);
    }
    oval([9, 105, -16], [2.6, 1.7, 2], look.metal, longHairWeights, 'detail');
    strand([[9, 104, -16], [11, 99, -16], [12, 96, -15]], [2, 1.4, .02], look.hair, longHairWeights, 'hair', 8, 8);
  } else if (key === 'mira') {
    for (let n = 0; n < 9; n++) {
      const x = (n - 4) * 2.35;
      strand([[x * .7, 173, -8], [x, 155, -14.5], [x * 1.13 + 3, 126, -17], [x * .9 + 5, 106 + Math.abs(n - 4) * 2.5, -15.5]],
        [2.0, 2.4, 1.6, .04], n % 3 === 1 ? look.highlight : look.hair, longHairWeights, 'hair', 8, 24, .55);
    }
  } else {
    for (const s of [-1, 1]) {
      oval([s * 9.6, 176.6, -5.4], [4.4, 4.4, 3.8], look.hair, headWeights, 'hair', s * .25, 20);
      for (let n = 0; n < 3; n++) strand([[s * (8 + n), 180, -5], [s * (12 + n * .2), 178, -3.5], [s * (12 - n), 174, -5]],
        [.22, .3, .12], look.highlight, headWeights, 'hair', 5, 10);
      strand([[s * 10, 173.5, -6], [s * 12, 166, -8], [s * 12.7, 160, -7]], [1.1, 1, .02], look.hair, headWeights, 'hair', 8, 12);
      strand([[s * 12.5, 174, -4], [s * 15.5, 175, -5], [s * 14, 171, -6]], [.7, 1.2, .08], look.accent, headWeights, 'detail', 6, 6, .3);
    }
  }

  // New weapon follows the exact original blade direction and hand socket.
  sourceSword.geometry.computeBoundingBox();
  const bb = sourceSword.geometry.boundingBox, size = bb.getSize(new THREE.Vector3());
  const axis = size.x > size.y ? (size.x > size.z ? 'x' : 'z') : (size.y > size.z ? 'y' : 'z');
  const a = bb.getCenter(new THREE.Vector3()), b = a.clone(); a[axis] = bb.min[axis]; b[axis] = bb.max[axis];
  sourceSword.localToWorld(a); sourceSword.localToWorld(b);
  const hand = joint('RightHand');
  const start = a.distanceTo(hand) < b.distanceTo(hand) ? a : b;
  const end = start === a ? b : a;
  const direction = end.clone().sub(start).normalize();
  const length = start.distanceTo(end) * (key === 'mira' ? 1.23 : key === 'zoey' ? .74 : 1);
  // Place the grip centre in the palm, rather than copying the old mesh's pommel.
  start.copy(hand).lerp(joint('RightHandMiddle1'), .55).addScaledVector(direction, -length * .075);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const weapon = (g, hex) => { g.applyQuaternion(rotation); g.translate(start.x, start.y, start.z); add(g, hex, rigid('RightHand'), 'sword'); };
  const width = key === 'mira' ? 5.5 : key === 'zoey' ? 2.0 : 2.8;
  const blade = new THREE.CylinderGeometry(0, width, length * .78, 4, 1);
  blade.scale(1, 1, .24); blade.rotateY(Math.PI / 4); blade.translate(0, length * .59, 0); weapon(blade, '#d7def1');
  const spine = new THREE.BoxGeometry(width * .24, length * .65, 1.1); spine.translate(0, length * .55, 0); weapon(spine, look.accent);
  const guard = new THREE.BoxGeometry(width * 3.5, 2.6, 2.3); guard.translate(0, length * .18, 0); weapon(guard, look.metal);
  const grip = new THREE.CylinderGeometry(1.4, 1.6, length * .17, 10); grip.translate(0, length * .075, 0); weapon(grip, look.dark);

  for (const mesh of oldMeshes) mesh.removeFromParent();
  const names = { body: 'HeroSurface', hair: 'HeroHair', detail: 'HeroDetails', sword: 'HeroSword' };
  let triangles = 0, vertices = 0;
  for (const [bucket, geometries] of Object.entries(buckets)) {
    const geometry = mergeGeometries(geometries);
    if (!geometry) throw new Error(`Could not merge hero ${bucket}`);
    const material = bucket === 'detail'
      ? new THREE.MeshBasicMaterial({ vertexColors: true, name: names[bucket], side: THREE.DoubleSide })
      : new THREE.MeshStandardMaterial({ vertexColors: true, name: names[bucket], roughness: .75 });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = bucket === 'sword' ? 'Hero_sword' : `${key}_${bucket}`;
    mesh.userData.heroPart = bucket;
    if (bucket === 'detail') mesh.userData.noOutline = true;
    mesh.castShadow = bucket !== 'detail';
    mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(skeleton, new THREE.Matrix4());
    vertices += geometry.attributes.position.count;
    triangles += geometry.index.count / 3;
    for (const part of geometries) part.dispose();
  }
  root.userData.heroModel = key;
  root.userData.heroHeight = 180;
  return { key, meshes: 4, vertices, triangles };
}
