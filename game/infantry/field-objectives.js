import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palettes = {
  pass: { body: 0x657466, trim: 0xb7a580, case: 0x73735d, industrial: false },
  city: { body: 0x79817d, trim: 0xc2bba3, case: 0x948879, industrial: false },
  forest: { body: 0x52654b, trim: 0xaba789, case: 0x68694f, industrial: false },
  dam: { body: 0x777e78, trim: 0xc7a556, case: 0x918567, industrial: true },
  airfield: { body: 0x667b84, trim: 0xd0bb87, case: 0x858e82, industrial: false },
  underground: { body: 0x727a76, trim: 0xcb9157, case: 0x8b8271, industrial: true },
  rail: { body: 0x827a67, trim: 0xb8a470, case: 0x7c7660, industrial: true },
};

/** Small, weathered equipment. No collision boxes, shared-resource disposal, or gameplay rewards. */
export function buildFieldObjective(map, task) {
  if (!map?.root?.isObject3D || !task?.site || !palettes[task.scene] || !['intel', 'cache', 'relay'].includes(task.kind)) throw new TypeError('Invalid field objective visual');
  const { x, y, z } = task.site, palette = palettes[task.scene];
  const root = new THREE.Group();
  root.name = `field-${task.scene}-${task.kind}`;
  root.position.set(x, y, z);
  root.userData.fieldKind = task.kind;
  const body = new THREE.Group();
  body.name = 'field-equipment';
  body.userData.fieldPhysical = true;
  // Both starting areas approach from the rear of the battlefield.
  const facing = Math.atan2(-x, -35.5 - z);
  body.rotation.y = facing;
  root.add(body);
  map.root.add(root);
  const materials = new Set(), geometries = new Set(), groups = new Map();
  let disposed = false, time = 0;

  const coat = (source, color, roughness = .8, metalness = .28) => {
    const base = map.artMaterials?.[source];
    const material = base?.clone ? base.clone() : new THREE.MeshStandardMaterial();
    material.vertexColors = false;
    material.color.setHex(color);
    material.roughness = roughness;
    material.metalness = metalness;
    if (base) { material.onBeforeCompile = base.onBeforeCompile; material.customProgramCacheKey = base.customProgramCacheKey; }
    materials.add(material);
    return material;
  };
  const shell = coat('metal', task.kind === 'cache' ? palette.case : palette.body);
  const edge = coat('metal', 0xa6aca6, .67, .36);
  const trim = coat('rust', palette.trim, .87, .14);
  const rubber = coat(null, 0x242c29, .96, .02);
  const fabric = coat('fabric', 0x69694f, .98, 0);
  const dark = coat('metal', 0x39443e, .82, .24);
  const scar = coat('rust', 0x665c4f, .94, .09);
  const red = coat(null, 0xaa7163, .82, .06);
  const screen = new THREE.MeshStandardMaterial({ color: 0x1f362f, emissive: 0x315c47, emissiveIntensity: .35, roughness: .4, metalness: .12 });
  const signal = new THREE.MeshStandardMaterial({ color: 0xe8be78, emissive: 0xd89b45, emissiveIntensity: .7, roughness: .45, metalness: .12 });
  materials.add(screen); materials.add(signal);

  const place = (geometry, material, px, py, pz, rotation = [0, 0, 0]) => {
    if (geometry.index) { const original = geometry; geometry = original.toNonIndexed(); original.dispose(); }
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    geometry.applyMatrix4(transform);
    if (!groups.has(material)) groups.set(material, []);
    groups.get(material).push(geometry);
  };
  const box = (material, w, h, d, px, py, pz, rounded = true, rotation) => place(rounded ? new RoundedBoxGeometry(w, h, d, 2, Math.min(.018, w * .15, h * .15, d * .15)) : new THREE.BoxGeometry(w, h, d), material, px, py, pz, rotation);
  const cylinder = (material, r, h, px, py, pz, rotation = [0, 0, 0]) => place(new THREE.CylinderGeometry(r, r, h, 8), material, px, py, pz, rotation);
  const cable = (points, r = .008) => place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 16, r, 6, false), rubber, 0, 0, 0);
  const bolts = (width, top, bottom, front) => {
    for (const px of [-width / 2 + .03, width / 2 - .03]) for (const py of [bottom + .035, top - .035]) {
      cylinder(edge, .012, .012, px, py, front, [Math.PI / 2, 0, 0]);
      box(dark, .013, .003, .002, px, py, front + .007, false);
    }
  };

  // Four adjustable feet meet the actual terrain even on the mountain/ramp maps.
  const halfWidth = task.kind === 'cache' ? .255 : .22;
  for (const px of [-halfWidth, halfWidth]) for (const pz of [-.16, .16]) {
    const wx = x + Math.cos(facing) * px + Math.sin(facing) * pz;
    const wz = z - Math.sin(facing) * px + Math.cos(facing) * pz;
    const bottom = map.ground(wx, wz) - y + .004;
    const top = task.kind === 'cache' ? .15 : .21;
    box(rubber, .08, .028, .08, px, bottom + .014, pz);
    cylinder(edge, .023, Math.max(.02, top - bottom - .028), px, (top + bottom + .028) / 2, pz);
  }

  if (task.kind === 'cache') {
    box(shell, .65, .34, .46, 0, .315, 0);
    box(dark, .655, .035, .465, 0, .486, 0);
    box(shell, .66, .095, .475, 0, .545, 0);
    // Reinforced corners, lid ribs, carry handle, hinges and two working catches.
    for (const px of [-.293, .293]) for (const pz of [-.204, .204]) box(edge, .045, .34, .045, px, .32, pz);
    for (const px of [-.23, 0, .23]) box(trim, .027, .015, .43, px, .6, 0);
    for (const px of [-.22, .22]) {
      box(edge, .065, .07, .025, px, .478, .245);
      box(dark, .041, .025, .014, px, .492, .262);
      cylinder(edge, .017, .085, px, .488, -.25, [0, 0, Math.PI / 2]);
      box(fabric, .052, .23, .014, px, .3, -.24);
    }
    box(rubber, .185, .03, .036, 0, .376, .273);
    for (const px of [-.094, .094]) box(edge, .025, .085, .027, px, .345, .258);
    box(trim, .12, .085, .006, 0, .279, .236);
    box(red, .018, .057, .008, 0, .279, .241, false);
    box(red, .067, .018, .008, 0, .279, .242, false);
    // Restrained shipping wear, rather than clean toy-like edges.
    for (const [px, py] of [[-.25,.22],[.27,.37],[-.095,.17]]) box(scar, .035, .006, .004, px, py, .234, false);
  } else if (task.kind === 'intel') {
    box(shell, .53, .48, .38, 0, .448, .03);
    box(edge, .555, .037, .4, 0, .217, .03);
    box(dark, .56, .09, .42, 0, .716, -.008, true, [-.25, 0, 0]);
    box(trim, .49, .04, .36, 0, .778, -.01, true, [-.25, 0, 0]);
    box(rubber, .4, .028, .235, 0, .801, -.025, true, [-.25, 0, 0]);
    box(screen, .359, .012, .195, 0, .819, -.028, false, [-.25, 0, 0]);
    // Narrow diagnostic rows, tactile keypad and connector panel.
    for (let i = 0; i < 5; i++) box(edge, .019 + (i % 3) * .025, .004, .006, -.12 + i * .055, .834 + i * .001, -.01 + i * .016, false, [-.25, 0, 0]);
    for (let row = 0; row < 2; row++) for (let col = 0; col < 5; col++) box(rubber, .048, .011, .024, -.13 + col * .065, .799 - row * .01, .093 + row * .035, false, [-.25, 0, 0]);
    for (let i = 0; i < 5; i++) box(dark, .031, .16, .005, -.15 + i * .075, .444, .223, false);
    bolts(.53, .678, .244, .225);
    box(trim, .11, .045, .008, .14, .296, .225);
    cylinder(dark, .026, .017, -.18, .64, .228, [Math.PI / 2, 0, 0]);
    cable([[-.18,.64,.25],[-.27,.57,.25],[-.27,.3,.21],[-.19,.28,.224]]);
    box(scar, .052, .008, .004, .17, .565, .226, false);
  } else {
    box(shell, .55, .75, .38, 0, .578, .025);
    box(edge, .575, .045, .408, 0, .223, .025);
    box(trim, .575, .05, .409, 0, .965, .025);
    box(dark, .433, .025, .27, 0, .709, .231, true, [Math.PI / 2, 0, 0]);
    box(screen, .344, .012, .18, 0, .754, .248, false, [Math.PI / 2, 0, 0]);
    for (const px of [-.095, 0, .095]) {
      cylinder(rubber, .021, .014, px, .532, .221, [Math.PI / 2, 0, 0]);
      cylinder(edge, .012, .035, px, .533, .24, [Math.PI / 2 - .27, 0, 0]);
    }
    for (let i = 0; i < 5; i++) box(dark, .228, .012, .006, -.039, .354 + i * .026, .219, false);
    bolts(.55, .926, .25, .223);
    box(trim, .054, .11, .008, .215, .386, .222);
    for (let i = 0; i < 3; i++) box(dark, .054, .014, .002, .215, .35 + i * .028, .227, false, [0, 0, -.55]);
    cylinder(rubber, .019, .025, -.185, .865, .227, [Math.PI / 2, 0, 0]);
    cable([[-.185,.865,.25],[-.254,.781,.255],[-.265,.491,.252],[-.18,.248,.205]]);
    if (palette.industrial) {
      // Low-profile industrial junction box and insulated conduit.
      box(dark, .145, .075, .105, .155, 1.028, .065);
      cable([[.18,1.04,.12],[.24,1.09,.07],[.225,1.05,-.16],[.12,.96,-.19]], .01);
    } else {
      // Practical whip antenna, kept entirely inside the reserved footprint.
      cylinder(rubber, .04, .06, -.2, 1.028, .1);
      cylinder(edge, .006, .36, -.2, 1.238, .1);
      cylinder(rubber, .009, .021, -.2, 1.428, .1);
    }
    box(scar, .056, .006, .003, .124, .906, .22, false);
  }

  // Static geometry is merged per material to keep the extra draw cost bounded.
  for (const [material, parts] of groups) {
    const geometry = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = material !== screen;
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  const lensGeometry = new THREE.SphereGeometry(.025, 12, 8);
  geometries.add(lensGeometry);
  const lens = new THREE.Mesh(lensGeometry, signal);
  lens.position.set(task.kind === 'cache' ? .26 : .18, task.kind === 'cache' ? .547 : task.kind === 'intel' ? .668 : .875, task.kind === 'cache' ? .249 : .232);
  body.add(lens);

  const row = new THREE.Group(), progressSegments = [];
  row.position.set(0, task.kind === 'cache' ? .565 : task.kind === 'intel' ? .617 : .617, task.kind === 'cache' ? .245 : .232);
  for (let i = 0; i < 6; i++) {
    const geometry = new THREE.BoxGeometry(.02, .008, .005);
    geometries.add(geometry);
    const segment = new THREE.Mesh(geometry, signal);
    segment.position.x = -.065 + i * .026;
    progressSegments.push(segment); row.add(segment);
  }
  body.add(row);

  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xd2ac69, transparent: true, opacity: .21, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
  materials.add(haloMaterial);
  const haloGeometry = new THREE.RingGeometry(.54, .568, 48);
  haloGeometry.rotateX(-Math.PI / 2);
  const vertices = haloGeometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) vertices.setY(i, map.ground(x + vertices.getX(i), z + vertices.getZ(i)) - y + .012);
  haloGeometry.computeVertexNormals();
  geometries.add(haloGeometry);
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  halo.name = 'field-ground-indicator';
  halo.userData.fieldPhysical = false;
  halo.renderOrder = 1;
  root.add(halo);

  function update(dt) {
    if (disposed) return;
    time += Number.isFinite(dt) ? Math.max(0, Math.min(.25, dt)) : 0;
    const done = !!task.completed;
    root.userData.completed = done;
    signal.color.setHex(done ? 0x83ddd5 : 0xe8be78);
    signal.emissive.setHex(done ? 0x45bcb4 : 0xd89b45);
    signal.emissiveIntensity = done ? .55 : .62 + Math.sin(time * 2.4) * .08;
    haloMaterial.color.setHex(done ? 0x5ebeb7 : 0xd2ac69);
    haloMaterial.opacity = done ? .16 : .2 + Math.sin(time * 2) * .025;
    const progress = Number.isFinite(task.ratio) ? task.ratio : 0;
    for (let i = 0; i < progressSegments.length; i++) progressSegments[i].visible = done || progress > i / progressSegments.length;
  }
  update(0);
  return {
    root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.clear(); materials.clear(); root.clear();
    },
  };
}
