import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCockpit({ mobile = false } = {}) {
  const group = new THREE.Group(); group.name = 'driver-cockpit'; group.visible = false;
  const materials = new Set(), textures = new Set(), geometries = new Set();
  const material = (Type, options) => { const value = new Type(options); materials.add(value); return value; };
  function grainTexture(normal = false) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const c = canvas.getContext('2d'), data = c.createImageData(128, 128);
    let seed = 814;
    for (let i = 0; i < 128 * 128; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const n = seed / 4294967296, k = i * 4;
      data.data[k] = normal ? 128 + (n - .5) * 45 : 190 + n * 35;
      data.data[k + 1] = normal ? 128 + ((seed >>> 8) / 16777216 - .5) * 45 : data.data[k];
      data.data[k + 2] = normal ? 250 : data.data[k]; data.data[k + 3] = 255;
    }
    c.putImageData(data, 0, 0); const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(7, 3);
    texture.colorSpace = normal ? THREE.NoColorSpace : THREE.SRGBColorSpace; textures.add(texture); return texture;
  }
  const leather = material(THREE.MeshStandardMaterial, { color: '#465055', map: grainTexture(), normalMap: grainTexture(true), normalScale: new THREE.Vector2(.28, .28), roughness: .73 });
  const rubber = material(THREE.MeshStandardMaterial, { color: '#0d1011', roughness: .94 });
  const metal = material(THREE.MeshStandardMaterial, { color: '#697578', metalness: .85, roughness: .28 });
  const trim = material(THREE.MeshStandardMaterial, { color: '#c5d1ce', metalness: .6, roughness: .32 });
  const hoodPaint = material(THREE.MeshPhysicalMaterial, { color: '#c93324', metalness: .55, roughness: .24, clearcoat: 1 });
  const stitch = material(THREE.MeshBasicMaterial, { color: '#6a7374' });
  const accent = material(THREE.MeshStandardMaterial, { color: '#83968f', metalness: .65, roughness: .37 });
  const ambient = material(THREE.MeshBasicMaterial, { color: '#c7a672', toneMapped: false });
  const glove = material(THREE.MeshStandardMaterial, { color: '#b4babc', map: leather.map, normalMap: leather.normalMap, normalScale: new THREE.Vector2(.18, .18), roughness: .9 });
  function mesh(geometry, mat, parent = group) {
    geometries.add(geometry); const object = new THREE.Mesh(geometry, mat);
    object.frustumCulled = false; parent.add(object); return object;
  }
  function box(w, h, d, mat, x, y, z, parent = group) {
    const object = mesh(new THREE.BoxGeometry(w, h, d), mat, parent); object.position.set(x, y, z); return object;
  }
  function beam(a, b, thickness, mat, parent = group) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const object = mesh(new THREE.CylinderGeometry(thickness / 2, thickness / 2, delta.length(), 8), mat, parent);
    object.position.copy(start.add(end).multiplyScalar(.5)); object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); return object;
  }
  function roundedBox(w, h, depth, radius, mat, x, y, z, parent = group) {
    const s = new THREE.Shape(), left = -w / 2, right = w / 2, bottom = -h / 2, top = h / 2;
    s.moveTo(left + radius, bottom); s.lineTo(right - radius, bottom); s.quadraticCurveTo(right, bottom, right, bottom + radius);
    s.lineTo(right, top - radius); s.quadraticCurveTo(right, top, right - radius, top);
    s.lineTo(left + radius, top); s.quadraticCurveTo(left, top, left, top - radius);
    s.lineTo(left, bottom + radius); s.quadraticCurveTo(left, bottom, left + radius, bottom);
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .003, bevelThickness: .003, curveSegments: mobile ? 4 : 7 });
    g.translate(0, 0, -depth / 2); const object = mesh(g, mat, parent); object.position.set(x, y, z); return object;
  }
  const dashboard = new THREE.BoxGeometry(2.20, .34, .49, 32, 2, 6), dashPositions = dashboard.attributes.position;
  for (let i = 0; i < dashPositions.count; i++) {
    const x = dashPositions.getX(i), z = dashPositions.getZ(i);
    dashPositions.setY(i, dashPositions.getY(i) + .025 * Math.cos(x * 2.5) - Math.abs(x) ** 3 * .045 + .02 * z);
    dashPositions.setZ(i, z - .07 * x * x);
  }
  dashboard.computeVertexNormals(); const dash = mesh(dashboard, leather); dash.position.set(0, -.53, -1.02);
  roundedBox(1.93, .12, .035, .035, rubber, 0, -.405, -.755);
  roundedBox(1.87, .028, .042, .011, accent, 0, -.421, -.733);
  box(1.78, .003, .005, ambient, 0, -.405, -.703);
  const stitchPoints = Array.from({ length: 31 }, (_, i) => { const x = -.94 + i / 30 * 1.88; return [x, -.336 + .022 * Math.cos(x * 2.5) - Math.abs(x) ** 3 * .045, -.802 - .07 * x * x]; });
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stitchPoints.map(p => new THREE.Vector3(...p))), 36, .0013, 4, false), stitch);
  roundedBox(.64, .23, .16, .055, rubber, -.17, -.160, -.92);
  for (const side of [-1, 1]) {
    const pillar = beam([side * 1.06, -.64, -.84], [side * .75, .52, -1.20], .090, leather);
    pillar.geometry.scale(1, 1, .42);
    beam([side * 1.035, -.46, -.89], [side * .737, .50, -1.198], .0024, stitch);
    roundedBox(.20, .065, .045, .016, metal, side * .76, -.359, -.770);
    roundedBox(.174, .048, .047, .012, rubber, side * .76, -.359, -.761);
    for (let i = 0; i < 6; i++) box(.006, .038, .010, accent, side * .76 + (i - 2.5) * .026, -.359, -.732);
    roundedBox(.03, .014, .012, .005, trim, side * .76, -.359, -.720);
  }
  const bonnet = roundedBox(1.66, .045, 1.28, .022, hoodPaint, 0, -.51, -1.87); bonnet.rotation.x = -.055;
  for (const side of [-1, 1]) beam([side * .49, -.485, -1.36], [side * .39, -.46, -2.45], .006, hoodPaint);
  const wheelPivot = new THREE.Group(); wheelPivot.position.set(-.17, -.285, -.68); wheelPivot.rotation.x = -.12; group.add(wheelPivot);
  const wheel = new THREE.Group(); wheelPivot.add(wheel);
  const roundRim = mesh(new THREE.TorusGeometry(.168, .019, 10, mobile ? 48 : 72), leather, wheel);
  const wheelSeam = mesh(new THREE.TorusGeometry(.158, .0014, 4, 48), stitch, wheel);
  const flatPoints = Array.from({ length: 64 }, (_, i) => { const a = i / 64 * Math.PI * 2; return new THREE.Vector3(Math.sin(a) * .168, Math.max(-.137, Math.cos(a) * .168), 0); });
  const flatRim = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(flatPoints, true), 80, .019, 10, true), leather, wheel); flatRim.visible = false;
  const marker = box(.010, .036, .039, ambient, 0, .167, .002, wheel);
  const hub = mesh(new THREE.SphereGeometry(1, 24, 12), rubber, wheel); hub.scale.set(.063, .057, .027); hub.position.set(0, -.005, .010);
  for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI]) {
    const spoke = roundedBox(.031, .127, .019, .010, metal, Math.sin(angle) * .105, Math.cos(angle) * .105, .003, wheel); spoke.rotation.z = -angle;
  }
  box(.09, .021, .014, leather, 0, -.13, .012, wheel);
  for (const side of [-1, 1]) {
    roundedBox(.030, .098, .008, .009, metal, side * .119, 0, -.027, wheel);
    roundedBox(.038, .022, .008, .008, rubber, side * .086, 0, .020, wheel);
    for (let i = -1; i <= 1; i++) box(.005, .006, .004, trim, side * .087, i * .008, .027, wheel);
    const hand = new THREE.Group(); hand.position.set(side * .158, -.003, .033); hand.rotation.z = -side * .10; wheel.add(hand);
    const palm = mesh(new THREE.SphereGeometry(1, 16, 10), glove, hand); palm.scale.set(.034, .057, .028);
    for (let finger = 0; finger < 4; finger++) beam([side * -.022, -.031 + finger * .019, .026], [side * .021, -.035 + finger * .019, .023], .003, stitch, hand);
    beam([side * -.030, -.036, .015], [side * -.008, -.006, .031], .016, glove, hand);
    roundedBox(.064, .044, .028, .012, rubber, 0, -.060, 0, hand);
    beam([0, -.076, -.002], [-side * .015, -.19, .035], .045, leather, hand);
  }
  function screen(width, height, x, y, z, parent = group) {
    const canvas = document.createElement('canvas'); canvas.width = mobile ? 512 : 768; canvas.height = Math.round(canvas.width * height / width);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = material(THREE.MeshBasicMaterial, { map: texture, toneMapped: false });
    const display = mesh(new THREE.PlaneGeometry(width, height), mat, parent); display.position.set(x, y, z);
    roundedBox(width + .019, height + .019, .012, Math.min(.012, height / 4), rubber, x, y, z - .010, parent);
    return { canvas, texture, context: canvas.getContext('2d') };
  }
  const instruments = screen(.58, .177, -.17, -.142, -.828);
  const navigation = screen(.31, .184, .39, -.218, -.771);
  const curvedDisplay = roundedBox(1.07, .233, .018, .016, rubber, .095, -.181, -.860); curvedDisplay.visible = false;
  const porscheControls = new THREE.Group(); porscheControls.name = 'Porsche-style mode controls'; wheel.add(porscheControls);
  for (const [x, y, color] of [[-.092, -.052, '#cb3940'], [.092, -.052, '#d7dfe0'], [-.061, -.099, '#92aaba'], [.061, -.099, '#c1ba82']]) {
    const knob = mesh(new THREE.CylinderGeometry(.011, .011, .012, 16), rubber, porscheControls); knob.rotation.x = Math.PI / 2; knob.position.set(x, y, .024);
    const ring = mesh(new THREE.TorusGeometry(.009, .0015, 4, 20), material(THREE.MeshBasicMaterial, { color }), porscheControls); ring.position.set(x, y, .031);
  }
  const badge = screen(.050, .027, 0, -.005, .041, wheel);
  const mirror = roundedBox(.23, .064, .030, .018, rubber, .07, .365, -.90);
  const mirrorFace = roundedBox(.209, .044, .008, .011, metal, .07, .365, -.879);
  beam([.07, .398, -.915], [.07, .475, -.99], .017, rubber);
  roundedBox(.38, .044, .078, .009, rubber, .39, -.387, -.734);
  for (let i = 0; i < 8; i++) box(.026, .025, .002, accent, .39 + (i - 3.5) * .043, -.387, -.692);
  const movingParts = new Set([roundRim, wheelSeam, flatRim, curvedDisplay, mirror, mirrorFace, bonnet]);
  function batch(parent, excludedGroups = new Set()) {
    group.updateMatrixWorld(true); const inverse = parent.matrixWorld.clone().invert(), batches = new Map();
    parent.traverse(node => {
      if (!node.isMesh || movingParts.has(node)) return;
      for (let ancestor = node.parent; ancestor && ancestor !== parent; ancestor = ancestor.parent) if (excludedGroups.has(ancestor)) return;
      const geometry = node.geometry.clone().applyMatrix4(inverse.clone().multiply(node.matrixWorld));
      if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
      if (!batches.has(node.material)) batches.set(node.material, []); batches.get(node.material).push({ node, geometry });
    });
    for (const [mat, parts] of batches) {
      if (parts.length > 1) {
        const merged = mergeGeometries(parts.map(p => p.geometry));
        if (!merged) throw new Error('Cockpit details could not be batched');
        mesh(merged, mat, parent);
        for (const { node } of parts) { node.removeFromParent(); node.geometry.dispose(); geometries.delete(node.geometry); }
      }
      for (const { geometry } of parts) geometry.dispose();
    }
  }
  batch(group, new Set([wheelPivot])); batch(wheel, new Set([porscheControls])); batch(porscheControls);
  let lastReadout = '', lastVehicle = '', steering = 0, disposed = false;
  function drawInstruments(state, vehicle) {
    const { canvas, context: c, texture } = instruments, w = canvas.width, h = canvas.height;
    const background = c.createLinearGradient(0, 0, 0, h); background.addColorStop(0, '#17232e'); background.addColorStop(1, '#070d12');
    c.fillStyle = background; c.fillRect(0, 0, w, h);
    const rpm = THREE.MathUtils.clamp((state.rpm || 0) / vehicle.redline, 0, 1);
    function dial(cx, fraction, max, unit) {
      const cy = h * .53, r = h * .35, start = Math.PI * .78, sweep = Math.PI * 1.44;
      c.strokeStyle = '#34454f'; c.lineWidth = h * .024; c.beginPath(); c.arc(cx, cy, r, start, start + sweep); c.stroke();
      c.strokeStyle = unit === 'RPM' ? '#cfb27c' : '#9cc4d3'; c.beginPath(); c.arc(cx, cy, r, start, start + sweep * Math.max(.012, fraction)); c.stroke();
      for (let i = 0; i <= 10; i++) { const a = start + sweep * i / 10; c.strokeStyle = i > 8 && unit === 'RPM' ? '#e86e4a' : '#acb8bd'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * r * .85, cy + Math.sin(a) * r * .85); c.lineTo(cx + Math.cos(a) * r * .96, cy + Math.sin(a) * r * .96); c.stroke(); }
      c.textAlign = 'center'; c.fillStyle = '#91a4b0'; c.font = `${h * .055}px Arial`; c.fillText(unit, cx, cy + r * .63);
      c.fillStyle = '#d4dce0'; c.font = `500 ${h * .16}px Arial`; c.fillText(String(Math.round(max * fraction)), cx, cy + h * .025);
    }
    if (vehicle.id === 'bmwX3') {
      for (const side of [-1, 1]) {
        const cx = w * (side < 0 ? .20 : .80), cy = h * .52, r = h * .34;
        c.strokeStyle = side < 0 ? '#63a6d0' : '#d65e65'; c.lineWidth = h * .026; c.beginPath();
        for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i * Math.PI / 3; const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.closePath(); c.stroke();
        c.fillStyle = '#d6e6ed'; c.textAlign = 'center'; c.font = `500 ${h * .16}px Arial`; c.fillText(side < 0 ? String(Math.round(state.speed * 3.6)) : (state.rpm / 1000).toFixed(1), cx, cy + h * .04);
        c.font = `${h * .057}px Arial`; c.fillStyle = '#8aa6b8'; c.fillText(side < 0 ? 'km/h' : 'RPM x1000', cx, cy + h * .20);
      }
    } else if (vehicle.id.startsWith('porsche')) {
      dial(w * .50, rpm, vehicle.redline / 1000, 'RPM');
      c.fillStyle = '#d6e6ed'; c.font = `500 ${h * .20}px Arial`; c.textAlign = 'center'; c.fillText(String(Math.round(state.speed * 3.6)), w * .18, h * .53);
      c.fillStyle = '#9badad'; c.font = `${h * .065}px Arial`; c.fillText('km/h', w * .18, h * .68); c.fillText('TRACK', w * .83, h * .38); c.fillText('TYRES   OK', w * .83, h * .55);
    } else { dial(w * .20, Math.min(1, (state.speed || 0) * 3.6 / 350), 350, 'km/h'); dial(w * .80, rpm, vehicle.redline / 1000, 'RPM'); }
    if (!vehicle.id.startsWith('porsche')) {
      c.fillStyle = '#edf2f1'; c.font = `500 ${h * .25}px Arial`; c.textAlign = 'center'; c.fillText(String(Math.round((state.speed || 0) * 3.6)), w * .50, h * .31);
      c.fillStyle = '#9badad'; c.font = `${h * .060}px Arial`; c.fillText('km/h', w * .50, h * .40);
    }
    c.fillStyle = '#d8b16c'; c.font = `600 ${h * .13}px Arial`; c.textAlign = 'right'; c.fillText(String(state.gear || 1), w * .92, h * .24);
    c.textAlign = 'left'; c.font = `${h * .065}px Arial`; c.fillText(vehicle.shortName || vehicle.name, w * .04, h * .95);
    c.textAlign = 'right'; c.fillStyle = '#bfaa80'; c.fillText('SPORT  /  TIME ATTACK', w * .96, h * .95); texture.needsUpdate = true;
  }
  function drawNavigation(track) {
    const { canvas, context: c, texture } = navigation, w = canvas.width, h = canvas.height;
    c.fillStyle = '#14212a'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#233742'; c.lineWidth = 1;
    for (let i = 1; i < 8; i++) { c.beginPath(); c.moveTo(i * w / 8, 0); c.lineTo(i * w / 8, h); c.stroke(); c.beginPath(); c.moveTo(0, i * h / 8); c.lineTo(w, i * h / 8); c.stroke(); }
    c.strokeStyle = '#c8b383'; c.lineWidth = 4;
    const bounds = track.bounds, scale = Math.min(w * .78 / (bounds.maxX - bounds.minX), h * .53 / (bounds.maxZ - bounds.minZ));
    c.beginPath(); track.samples.forEach((p, i) => { const x = w / 2 + (p.x - (bounds.minX + bounds.maxX) / 2) * scale, y = h * .43 - (p.z - (bounds.minZ + bounds.maxZ) / 2) * scale; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); c.stroke();
    c.textAlign = 'center'; c.fillStyle = '#dce7e5'; c.font = `600 ${h * .082}px Arial`; c.fillText(track.name, w / 2, h * .82); c.fillStyle = '#8eaaaa'; c.font = `${h * .065}px Arial`; c.fillText('TIME ATTACK', w / 2, h * .94); texture.needsUpdate = true;
  }
  return {
    group,
    setPaint(color) { hoodPaint.color.set(color); },
    update(state, vehicle, track, dt = 0) {
      if (!group.visible || disposed) return;
      steering = THREE.MathUtils.damp(steering, -(state.steeringAngle || 0) * 2.6, 12, dt); wheel.rotation.z = steering;
      const key = `${Math.round(state.speed * 3.6)}:${state.gear}:${Math.floor(state.rpm / 150)}:${vehicle.id}`;
      if (key !== lastReadout) { drawInstruments(state, vehicle); lastReadout = key; }
      if (lastVehicle !== `${vehicle.id}:${track.id}`) {
        drawNavigation(track); const c = badge.context, canvas = badge.canvas;
        c.fillStyle = '#151c20'; c.fillRect(0, 0, canvas.width, canvas.height); c.fillStyle = '#dedfd8'; c.textAlign = 'center';
        c.font = `600 ${canvas.height * .43}px Arial`; c.fillText(vehicle.name.split(' ')[0].toUpperCase(), canvas.width / 2, canvas.height * .68, canvas.width * .92); badge.texture.needsUpdate = true;
        const suv = vehicle.id === 'bmwX3'; mirror.position.y = mirrorFace.position.y = suv ? .42 : .365; bonnet.scale.x = suv ? 1.1 : 1; lastVehicle = `${vehicle.id}:${track.id}`;
        flatRim.visible = curvedDisplay.visible = suv; roundRim.visible = wheelSeam.visible = !suv;
        porscheControls.visible = vehicle.id.startsWith('porsche'); ambient.color.set(suv ? '#e55565' : vehicle.id.startsWith('porsche') ? '#dfc660' : '#c7a672');
      }
    },
    dispose() { if (disposed) return; disposed = true; geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
  };
}
