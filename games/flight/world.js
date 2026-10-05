// Airport scenery: runway 14/32 with markings and lighting, the other two runways as flat surfaces, a few buildings.
// Everything place-specific comes from the airport config; the ground itself (imagery + terrain) is geoscenery.js.
const CLEAR_FOG = 0.000013;

export function createWorld(THREE, scene, options = {}) {
  const airport = options.airport;
  const length = airport.runway.lengthM, width = airport.runway.widthM;
  const near = length / 2, far = -length / 2, center = 0;
  // Runway 14's landing threshold is displaced from the pavement end (checked on the imagery), so markings and lights start there.
  const displaced = airport.runway.displacedNearM || 0, thresholdNear = near - displaced, aimpoint = thresholdNear - 310;
  const runway = { length, width, nearThreshold: thresholdNear, farThreshold: far, heading: 0, elevation: 0 };
  const root = new THREE.Group();
  root.name = `${airport.icao} airport`;
  scene.add(root);
  let target = root;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const geometry = value => { geometries.add(value); return value; };
  const material = value => { materials.add(value); return value; };
  const standard = (color, options = {}) => material(new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...options }));
  const basic = (color, options = {}) => material(new THREE.MeshBasicMaterial({ color, ...options }));
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const plane = geometry(new THREE.PlaneGeometry(1, 1));
  const dummy = new THREE.Object3D();
  function addMesh(shape, surface, x, y, z, sx = 1, sy = sx, sz = sx, parent = target) {
    const mesh = new THREE.Mesh(shape, surface);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  const box = (surface, x, y, z, w, h, d, parent) => addMesh(cube, surface, x, y, z, w, h, d, parent);
  function ground(surface, x, z, w, d, y = 0) {
    const mesh = addMesh(plane, surface, x, y, z, w, d, 1);
    mesh.rotation.x = -Math.PI / 2; return mesh;
  }
  function instances(shape, surface, items, colors) {
    const mesh = new THREE.InstancedMesh(shape, surface, items.length);
    items.forEach((item, i) => {
      dummy.position.set(item.x || 0, item.y || 0, item.z || 0);
      dummy.rotation.set(item.rx || 0, item.ry || 0, item.rz || 0);
      dummy.scale.set(item.w ?? 1, item.h ?? 1, item.d ?? 1);
      dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      if (colors) mesh.setColorAt(i, new THREE.Color(colors[i]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.receiveShadow = true; target.add(mesh); return mesh;
  }
  let seed = 73204;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function texture(width, height, draw) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4; textures.add(map); return map;
  }
  function surfaceTexture(base, variation, joints = false) {
    const map = texture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 12000; i++) {
        const alpha = random() * variation;
        ctx.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '0,0,0'},${alpha})`;
        const size = 0.5 + random() * 2; ctx.fillRect(random() * w, random() * h, size, size);
      }
      if (joints) {
        ctx.strokeStyle = 'rgba(53,61,65,.15)'; ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
          ctx.beginPath(); ctx.moveTo(i * 128, 0); ctx.lineTo(i * 128, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * 128); ctx.lineTo(w, i * 128); ctx.stroke();
        }
      }
    });
    map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
  }

  const previousFog = scene.fog, previousBackground = scene.background;
  const fog = new THREE.FogExp2(0xb8cbd4, CLEAR_FOG); // light enough that the Alps, 65-80 km away, stay visible
  scene.fog = fog; scene.background = new THREE.Color(0x9cbdd3);
  const skyMaterial = material(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: {
      zenith: { value: new THREE.Color(0x397aae) }, horizon: { value: new THREE.Color(0xc5d9de) },
      sunDirection: { value: new THREE.Vector3(-0.52, 0.54, -0.66).normalize() }, cloudiness: { value: 0 },
    },
    vertexShader: 'varying vec3 direction; void main(){ direction=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDirection; uniform float cloudiness;
      void main(){ vec3 d=normalize(direction); float h=max(d.y,0.0); vec3 col=mix(horizon,zenith,pow(h,0.46));
      float sun=max(dot(d,sunDirection),0.0); col+=vec3(1.0,0.8,0.5)*pow(sun,24.0)*0.16*(1.0-cloudiness);
      col+=vec3(1.0,0.93,0.78)*smoothstep(0.99996,0.999985,sun)*(1.0-cloudiness); gl_FragColor=vec4(col,1.0); }`,
  }));
  const sky = addMesh(geometry(new THREE.SphereGeometry(90000, 32, 16)), skyMaterial, 0, 0, 0);
  sky.renderOrder = -10;
  const hemisphere = new THREE.HemisphereLight(0xcde5f6, 0x77795d, 1.6); root.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xffeed0, 2.4);
  sunlight.position.set(-5200, 5400, -6600); root.add(sunlight);


  // Ground shown until the baked terrain is ready (and if it cannot be loaded): a plain meadow.
  const landscape = new THREE.Group(); landscape.name = 'Fallback ground'; root.add(landscape);
  target = landscape;
  const grassMap = surfaceTexture('#7d885c', 0.1); grassMap.repeat.set(2000, 2000);
  ground(standard(0xffffff, { map: grassMap }), 0, 0, 160000, 160000, -0.5);
  target = root;

  // Pavement is unlit and tinted like the aerial photo, so the 3D runways blend into the imagery below them.
  const asphaltMap = surfaceTexture('#8d8c86', 0.1); asphaltMap.repeat.set(3, 150);
  const asphalt = basic(0xffffff, { map: asphaltMap });
  const paint = standard(0xe6e6d5);
  const rubberMap = texture(128, 512, (ctx, w, h) => {
    for (let i = 0; i < 280; i++) {
      ctx.strokeStyle = `rgba(16,23,25,${random() * 0.13})`; ctx.lineWidth = random() * 2 + 0.3;
      const x = 12 + random() * (w - 24), z = random() * h;
      ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x + random() * 1.5, Math.min(h, z + random() * 160)); ctx.stroke();
    }
  });
  const rubber = basic(0xffffff, { map: rubberMap, transparent: true, depthWrite: false });
  function runwayNumber(label, z, reversed) {
    const map = texture(512, 768, (ctx, w, h) => {
      ctx.fillStyle = '#e9eadf'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const designation = label.match(/^(\d+)([LRC]?)$/);
      ctx.font = 'bold 430px Arial'; ctx.fillText(designation?.[1] || label, w / 2, designation?.[2] ? h * 0.36 : h / 2);
      if (designation?.[2]) { ctx.font = 'bold 195px Arial'; ctx.fillText(designation[2], w / 2, h * 0.82); }
    });
    const object = ground(basic(0xffffff, { map, transparent: true, depthWrite: false }), 0, z, 18, 31, 0.035);
    if (reversed) object.rotation.z = Math.PI;
  }
  // A runway built in its own frame: -z is the direction of travel from the first ident towards the second.
  // `at` places that frame in the world (centre x, z and the yaw that turns local -z towards the runway direction).
  function buildRunway(len, wid, labels, at, extras, displacedNear = 0) {
    const holder = new THREE.Group(); holder.position.set(at.x, 0, at.z); holder.rotation.y = at.yaw; root.add(holder);
    target = holder;
    const n = len / 2, f = -len / 2, thrNear = n - displacedNear;
    ground(asphalt, 0, 0, wid, len, 0);
    ground(basic(0x9a9a8c), 0, 0, wid + 18, len + 60, -0.04);
    const whiteItems = [];
    const marking = (x, z, w, d) => whiteItems.push({ x, y: 0.025, z, w, h: 0.009, d });
    for (let z = f + 130; z <= thrNear - 130; z += 60) marking(0, z, 0.9, 30);
    marking(-wid / 2 + 1.5, 0, 1.2, len); marking(wid / 2 - 1.5, 0, 1.2, len);
    for (const [threshold, direction] of [[thrNear, -1], [f, 1]]) {
      for (let i = 0; i < 8; i++) for (const side of [-1, 1]) marking(side * (4.3 + i * 3.1), threshold + direction * 20, 1.9, 30);
      for (const side of [-1, 1]) marking(side * 13, threshold + direction * 310, 6, 45);
      for (const [distance, count] of [[150, 3], [450, 2], [600, 1], [750, 1], [900, 1]]) {
        for (let i = 0; i < count; i++) for (const side of [-1, 1]) marking(side * (9 + i * 3.2), threshold + direction * distance, 1.8, 22.5);
      }
    }
    instances(cube, paint, whiteItems);
    runwayNumber(labels[0], thrNear - 56, false); runwayNumber(labels[1], f + 56, true);
    if (extras) { ground(rubber, 0, thrNear - 430, 15, 550, 0.029); ground(rubber, 0, f + 430, 15, 550, 0.029); }
    target = root; return holder;
  }
  buildRunway(length, width, [airport.runway.ident, airport.runway.reciprocal], { x: 0, z: 0, yaw: 0 }, true, displaced);
  for (const other of airport.otherRunways) {
    const dx = other.b[0] - other.a[0], dz = other.b[1] - other.a[1];
    buildRunway(Math.hypot(dx, dz), other.widthM, [other.from, other.to], { x: (other.a[0] + other.b[0]) / 2, z: (other.a[1] + other.b[1]) / 2, yaw: Math.atan2(-dx, -dz) });
  }

  // Runway 14 lighting: edge, threshold, centreline-coloured end lights, a 900 m approach lighting system and PAPI.
  const whiteLight = basic(0xfff4ce), redLight = basic(0xff463d), yellowLight = basic(0xffdd64), greenLight = basic(0x85ecaf);
  const lightBase = standard(0x30363a), edgeBases = [], edgeWhites = [], edgeReds = [], thresholdGreens = [], thresholdReds = [];
  const half = width / 2;
  for (let z = far + 10; z <= near - 10; z += 30) for (const x of [-half - 2, half + 2]) {
    edgeBases.push({ x, y: 0.18, z, w: 0.36, h: 0.36, d: 0.36 });
    (z < far + 600 ? edgeReds : edgeWhites).push({ x, y: 0.46, z, w: 0.3, h: 0.17, d: 0.3 });
  }
  for (let x = -half + 3; x <= half - 3; x += 3) {
    thresholdGreens.push({ x, y: 0.08, z: thresholdNear + 1, w: 0.52, h: 0.1, d: 0.55 });
    thresholdReds.push({ x, y: 0.08, z: far - 1, w: 0.52, h: 0.1, d: 0.55 });
  }
  instances(cube, lightBase, edgeBases); instances(sphere, whiteLight, edgeWhites); instances(sphere, yellowLight, edgeReds);
  instances(sphere, greenLight, thresholdGreens); instances(sphere, redLight, thresholdReds);
  const approachLights = [], approachPosts = [];
  for (let z = thresholdNear + 30; z <= thresholdNear + 900; z += 30) {
    approachPosts.push({ x: 0, y: 1, z, w: 0.18, h: 2, d: 0.18 });
    approachPosts.push({ x: 0, y: 2, z, w: 4.5, h: 0.12, d: 0.12 });
    for (const x of [-2, -1, 0, 1, 2]) approachLights.push({ x, y: 2.08, z, w: 0.25, h: 0.2, d: 0.25 });
    if (z === thresholdNear + 300) for (let x = -15; x <= 15; x += 1.5) approachLights.push({ x, y: 2.08, z, w: 0.25, h: 0.2, d: 0.25 });
  }
  instances(cube, standard(0xaab0a7), approachPosts); instances(sphere, whiteLight, approachLights);
  const papiLamps = [];
  for (let i = 0; i < 4; i++) {
    const x = -half - 30 - i * 9;
    box(standard(0xe4e4d4), x, 0.58, aimpoint, 1.5, 1.1, 1.2);
    box(lightBase, x, 0.64, aimpoint + 0.62, 1.28, 0.62, 0.04);
    papiLamps.push(addMesh(sphere, i < 2 ? whiteLight : redLight, x, 0.68, aimpoint + 0.69, 0.5, 0.23, 0.08));
  }
  function sign(text, x, y, z, w, h, options = {}, parent = target) {
    const map = texture(1024, 128, (ctx, cw, ch) => {
      ctx.fillStyle = options.background || '#19282f'; ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = options.color || '#f0e9c7'; ctx.font = '600 70px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, cw / 2, ch / 2);
    });
    return addMesh(plane, basic(0xffffff, { map, side: THREE.DoubleSide }), x, y, z, w, h, 1, parent);
  }

  // Buildings: boxes placed from end points measured (or estimated) on the imagery.
  const terminalWhite = standard(0xd4d7ce), terminalRoof = standard(0xb5beb8, { roughness: 0.55 });
  const glass = standard(0x375460, { roughness: 0.24, metalness: 0.25 }), structure = standard(0x87958f);
  for (const b of airport.buildings) {
    const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1], len = Math.hypot(dx, dz);
    const holder = new THREE.Group(); holder.position.set((b.a[0] + b.b[0]) / 2, 0, (b.a[1] + b.b[1]) / 2); holder.rotation.y = Math.atan2(-dx, -dz); root.add(holder);
    box(terminalWhite, 0, b.height / 2, 0, b.width, b.height, len, holder);
    box(terminalRoof, 0, b.height + 0.9, 0, b.width + 3, 1.8, len + 3, holder);
    for (const side of [-1, 1]) box(glass, side * (b.width / 2 + 0.05), b.height * 0.55, 0, 0.3, b.height * 0.5, len - 4, holder);
    if (b.id === 'terminal') sign(airport.name.en.replace(' ', '  '), 0, b.height * 0.55, -len / 2 - 0.1, 58, 5.5, {}, holder).rotation.y = Math.PI;
  }
  const t = airport.tower, towerGroup = new THREE.Group(); towerGroup.position.set(t.x, 0, t.z); towerGroup.scale.setScalar(t.height / 60); root.add(towerGroup);
  const towerConcrete = standard(0xc2ccc4);
  box(towerConcrete, 0, 24, 0, 11, 48, 13, towerGroup);
  box(structure, 0, 46, 0, 18, 3, 20, towerGroup);
  box(glass, 0, 50, 0, 21, 6, 23, towerGroup);
  box(terminalWhite, 0, 54, 0, 26, 1.8, 28, towerGroup);
  box(structure, 0, 57.6, 0, 0.8, 5, 0.8, towerGroup);
  addMesh(sphere, redLight, 0, 60.3, 0, 0.55, 0.55, 0.55, towerGroup);
  box(towerConcrete, 12, 4, 26, 46, 8, 31, towerGroup);

  const cloudMap = texture(512, 256, (ctx, w, h) => {
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 32; i++) {
      const x = 40 + random() * 420, y = 75 + random() * 100, r = 22 + random() * 51;
      const gradient = ctx.createRadialGradient(x, y, r * 0.03, x, y, r);
      const col = layer ? '252,253,245' : '202,218,225';
      gradient.addColorStop(0, `rgba(${col},.7)`); gradient.addColorStop(0.6, `rgba(${col},.32)`); gradient.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gradient; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
  const cloudMaterial = material(new THREE.SpriteMaterial({ map: cloudMap, transparent: true, opacity: 0.67, depthWrite: false, fog: true, color: 0xffffff }));
  const clouds = [];
  for (let i = 0; i < 24; i++) {
    const cloud = new THREE.Sprite(cloudMaterial), width = 1400 + random() * 3100;
    const x = -25000 + random() * 50000, z = -34000 + random() * 65000;
    cloud.position.set(x, 2400 + random() * 2200, z); cloud.scale.set(width, width * 0.37, 1);
    root.add(cloud); clouds.push({ object: cloud, x, z, width, altitude: cloud.position.y, speed: 2 + random() * 5 });
  }

  let currentWeather = '';
  function update(time, state, weather = 'clear') {
    const position = state?.position || state?.pos || state || { x: 0, y: 0, z: 0 };
    sky.position.set(position.x || 0, position.y || 0, position.z || 0);
    const type = typeof weather === 'string' ? weather : weather?.type || 'clear';
    if (type !== currentWeather) {
      currentWeather = type;
      const overcast = type === 'overcast';
      skyMaterial.uniforms.zenith.value.set(overcast ? 0x899ba5 : 0x397aae);
      skyMaterial.uniforms.horizon.value.set(overcast ? 0xb9c6c8 : 0xc5d9de);
      skyMaterial.uniforms.cloudiness.value = overcast ? 0.9 : 0;
      fog.color.set(overcast ? 0xb9c6c8 : 0xb8cbd4); fog.density = overcast ? 0.00006 : CLEAR_FOG;
      sunlight.intensity = overcast ? 0.6 : 2.4; hemisphere.intensity = overcast ? 1.9 : 1.6;
      cloudMaterial.opacity = overcast ? 0.94 : 0.67;
      for (const cloud of clouds) cloud.object.scale.set(cloud.width * (overcast ? 2.5 : 1), cloud.width * (overcast ? 0.5 : 0.37), 1);
    }
    const seconds = Number.isFinite(time) ? time : 0;
    for (const cloud of clouds) {
      cloud.object.position.x = cloud.x + Math.sin(seconds * 0.0006) * 100 + seconds * cloud.speed;
      cloud.object.position.y = cloud.altitude * (type === 'overcast' ? 0.64 : 1);
    }
    const distance = Math.max(1, (position.z || 0) - aimpoint);
    const angle = Math.atan2(Math.max(0, position.y || 0), distance) * 180 / Math.PI;
    const g = airport.ils.glideslopeDeg, transitions = [g - 0.3, g - 0.1, g + 0.1, g + 0.3];
    papiLamps.forEach((lamp, i) => { lamp.material = angle > transitions[i] ? whiteLight : redLight; });
  }
  update(0, { position: { x: 0, y: 4, z: near - 180 } });
  return { runway, update, setGeographic(enabled) { landscape.visible = !enabled; }, dispose() {
    scene.remove(root);
    if (scene.fog === fog) { scene.fog = previousFog; scene.background = previousBackground; }
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  } };
}
