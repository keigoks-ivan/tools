export function createWorld(THREE, scene, options = {}) {
  const length = options.runwayLength ?? 3000;
  const near = options.runwayNear ?? length / 2, far = options.runwayFar ?? near - length;
  const center = (near + far) / 2, aimpoint = near - 310;
  const runway = { length, width: 60, nearThreshold: near, farThreshold: far, heading: 0, elevation: 0 };
  const root = new THREE.Group();
  root.name = 'Coastal International Airport';
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
  const fog = new THREE.FogExp2(0xb8cbd4, 0.000026);
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

  const landscape = new THREE.Group(); landscape.name = 'Procedural scenery fallback'; root.add(landscape);
  landscape.visible = !options.geographic; target = landscape;
  const seaMap = texture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#407c91'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4200; i++) {
      const y = random() * h, x = random() * w;
      ctx.strokeStyle = `rgba(186,220,222,${0.02 + random() * 0.09})`; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 + random() * 22, y + random() * 1.3); ctx.stroke();
    }
  });
  seaMap.wrapS = seaMap.wrapT = THREE.RepeatWrapping; seaMap.repeat.set(230, 230);
  const seaMaterial = standard(0xa3d0d3, { map: seaMap, roughness: 0.38, metalness: 0.22 });
  ground(seaMaterial, -22000, 0, 140000, 140000, -3.5);
  const coast = [[-2100, -40000], [-1800, -23000], [-2200, -14000], [-1450, -7000], [-1000, -4000], [-850, -1500], [-1020, 900], [-1380, 3300], [-2200, 9000], [-2600, 18000], [-1900, 40000]];
  function coastalLand(offset, y, surface) {
    const shape = new THREE.Shape();
    shape.moveTo(coast[0][0] + offset, -coast[0][1]);
    for (let i = 1; i < coast.length; i++) shape.lineTo(coast[i][0] + offset, -coast[i][1]);
    shape.lineTo(65000, -40000); shape.lineTo(65000, 40000); shape.closePath();
    const land = addMesh(geometry(new THREE.ShapeGeometry(shape)), surface, 0, y, 0);
    land.rotation.x = -Math.PI / 2;
  }
  coastalLand(-70, -1.35, standard(0xc6be91));
  coastalLand(0, -0.32, standard(0x727d55));
  const grassMap = surfaceTexture('#7d885c', 0.1); grassMap.repeat.set(22, 60);
  ground(standard(0xffffff, { map: grassMap }), 360, 0, 1800, 4800, -0.12);

  const fieldItems = [], fieldColors = [];
  for (let x = 1600; x < 10000; x += 430) for (let z = -12000; z < 13000; z += 570) {
    const w = 360 + random() * 40, d = 450 + random() * 70;
    fieldItems.push({ x: x + random() * 70, y: -0.22, z: z + random() * 80, w, h: 0.04, d });
    fieldColors.push([0x7c8659, 0x87916a, 0x6b805b, 0x929067, 0x66784f, 0x8d895f][Math.floor(random() * 6)]);
  }
  instances(cube, standard(0xffffff), fieldItems, fieldColors);

  function terrain(cx, cz, width, depth, height, tint) {
    const geo = geometry(new THREE.PlaneGeometry(width, depth, 88, 96)); geo.rotateX(-Math.PI / 2);
    const points = geo.attributes.position, colorValues = new Float32Array(points.count * 3);
    const low = new THREE.Color(tint), high = new THREE.Color(0xa7afa5);
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i), z = points.getZ(i), u = x / (width * 0.5), v = z / (depth * 0.5);
      const edge = Math.max(0, (1 - u * u) * (1 - v * v));
      const ridge = 0.52 + Math.sin(x * 0.0008 + Math.sin(z * 0.0006) * 2) * 0.22 + Math.cos(z * 0.0011 - x * 0.0003) * 0.15;
      const detail = Math.sin(x * 0.003 + z * 0.0017) * Math.cos(z * 0.004) * 0.05;
      const y = Math.max(0, height * edge * edge * (ridge + detail)); points.setY(i, y - 0.2);
      const color = low.clone().lerp(high, Math.max(0, y / height - 0.26) * 0.9);
      const shade = 0.91 + random() * 0.12; color.multiplyScalar(shade);
      color.toArray(colorValues, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colorValues, 3)); geo.computeVertexNormals();
    addMesh(geo, standard(0xffffff, { vertexColors: true }), cx, 0, cz);
  }
  terrain(15300, -4500, 24000, 33000, 2900, 0x718978);
  terrain(8500, -20900, 15000, 19000, 2000, 0x84968b);
  const islandGeometry = geometry(new THREE.SphereGeometry(1, 48, 24));
  const islandPoints = islandGeometry.attributes.position;
  for (let i = 0; i < islandPoints.count; i++) {
    const x = islandPoints.getX(i), y = islandPoints.getY(i), z = islandPoints.getZ(i);
    const coastDetail = 1 + Math.sin(z * 9 + x * 4) * 0.08 + Math.cos(x * 13) * 0.045;
    islandPoints.setXYZ(i, x * coastDetail, y * (0.9 + Math.sin(x * 8 + z * 5) * 0.17), z * coastDetail);
  }
  islandGeometry.computeVertexNormals();
  addMesh(islandGeometry, standard(0x79928d), -18000, -190, -20500, 5500, 1400, 7500);
  target = root;

  const asphaltMap = surfaceTexture('#333c40', 0.22); asphaltMap.repeat.set(3, 150);
  const asphalt = standard(0xffffff, { map: asphaltMap, roughness: 0.98 });
  ground(standard(0x979780), 0, center, 78, length + 60, -0.04);
  ground(asphalt, 0, center, 60, length, 0);
  const concreteMap = surfaceTexture('#929999', 0.08, true); concreteMap.repeat.set(15, 58);
  const concrete = standard(0xffffff, { map: concreteMap });
  ground(concrete, 396, -260, 380, 1460, -0.005);
  const taxiMaterial = standard(0x505958);
  ground(taxiMaterial, 170, center, 26, length + 50, 0.003);
  const connectors = [far + 170, -850, -300, 300, 950, near - 170];
  for (const z of connectors) ground(taxiMaterial, 100, z, 200, 26, 0.006);
  ground(taxiMaterial, 204, -260, 42, 1460, 0.008);
  const paint = standard(0xe6e6d5), yellow = standard(0xddbd55);
  const whiteItems = [], yellowItems = [];
  const marking = (x, z, w, d) => whiteItems.push({ x, y: 0.025, z, w, h: 0.009, d });
  for (let z = far + 130; z <= near - 130; z += 60) marking(0, z, 0.9, 30);
  marking(-28.5, center, 1.2, length); marking(28.5, center, 1.2, length);
  for (const [threshold, direction] of [[near, -1], [far, 1]]) {
    for (let i = 0; i < 8; i++) for (const side of [-1, 1]) marking(side * (4.3 + i * 3.1), threshold + direction * 29, 1.9, 30);
    for (const side of [-1, 1]) marking(side * 13, threshold + direction * 310, 6, 45);
    for (const [distance, count] of [[150, 3], [450, 2], [600, 1], [750, 1], [900, 1]]) {
      for (let i = 0; i < count; i++) for (const side of [-1, 1]) marking(side * (9 + i * 3.2), threshold + direction * distance, 1.8, 22.5);
    }
  }
  instances(cube, paint, whiteItems);
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
  const labels = options.runwayLabels || ['36', '18'];
  runwayNumber(labels[0], near - 87, false); runwayNumber(labels[1], far + 87, true);
  const rubberMap = texture(128, 512, (ctx, w, h) => {
    for (let i = 0; i < 280; i++) {
      ctx.strokeStyle = `rgba(16,23,25,${random() * 0.13})`; ctx.lineWidth = random() * 2 + 0.3;
      const x = 12 + random() * (w - 24), z = random() * h;
      ctx.beginPath(); ctx.moveTo(x, z); ctx.lineTo(x + random() * 1.5, Math.min(h, z + random() * 160)); ctx.stroke();
    }
  });
  const rubber = basic(0xffffff, { map: rubberMap, transparent: true, depthWrite: false });
  ground(rubber, 0, near - 430, 15, 550, 0.029); ground(rubber, 0, far + 430, 15, 550, 0.029);
  for (let z = far; z < near; z += 60) yellowItems.push({ x: 170, y: 0.025, z, w: 0.3, h: 0.01, d: 55 });
  for (const z of connectors) {
    yellowItems.push({ x: 92, y: 0.032, z, w: 184, h: 0.009, d: 0.3 });
    for (const offset of [-1.2, -0.5, 0.5, 1.2]) yellowItems.push({ x: 67 + offset, y: 0.033, z, w: 0.18, h: 0.009, d: 26 });
  }
  for (let z = -820; z < 430; z += 170) {
    yellowItems.push({ x: 364, y: 0.032, z, w: 310, h: 0.009, d: 0.23 });
    yellowItems.push({ x: 494, y: 0.032, z, w: 0.23, h: 0.009, d: 50 });
    yellowItems.push({ x: 508, y: 0.032, z, w: 0.25, h: 0.009, d: 12 });
  }
  instances(cube, yellow, yellowItems);

  const whiteLight = basic(0xfff4ce), redLight = basic(0xff463d), yellowLight = basic(0xffdd64), greenLight = basic(0x85ecaf), blueLight = basic(0x519cfd);
  const lightBase = standard(0x30363a), edgeBases = [], edgeWhites = [], edgeReds = [], thresholdGreens = [], thresholdReds = [];
  for (let z = far + 10; z <= near - 10; z += 30) for (const x of [-32, 32]) {
    edgeBases.push({ x, y: 0.18, z, w: 0.36, h: 0.36, d: 0.36 });
    (z < far + 600 ? edgeReds : edgeWhites).push({ x, y: 0.46, z, w: 0.3, h: 0.17, d: 0.3 });
  }
  for (let x = -27; x <= 27; x += 3) {
    thresholdGreens.push({ x, y: 0.08, z: near + 1, w: 0.52, h: 0.1, d: 0.55 });
    thresholdReds.push({ x, y: 0.08, z: far - 1, w: 0.52, h: 0.1, d: 0.55 });
  }
  instances(cube, lightBase, edgeBases); instances(sphere, whiteLight, edgeWhites); instances(sphere, yellowLight, edgeReds);
  instances(sphere, greenLight, thresholdGreens); instances(sphere, redLight, thresholdReds);
  const taxiLights = [], centerLights = [], approachLights = [], approachPosts = [];
  for (let z = far + 10; z < near; z += 45) {
    for (const x of [156, 184]) taxiLights.push({ x, y: 0.22, z, w: 0.24, h: 0.2, d: 0.24 });
    centerLights.push({ x: 170, y: 0.055, z, w: 0.2, h: 0.04, d: 0.2 });
  }
  for (let z = near + 30; z <= near + 900; z += 30) {
    approachPosts.push({ x: 0, y: 1, z, w: 0.18, h: 2, d: 0.18 });
    approachPosts.push({ x: 0, y: 2, z, w: 4.5, h: 0.12, d: 0.12 });
    for (const x of [-2, -1, 0, 1, 2]) approachLights.push({ x, y: 2.08, z, w: 0.25, h: 0.2, d: 0.25 });
    if (z === near + 300) for (let x = -15; x <= 15; x += 1.5) approachLights.push({ x, y: 2.08, z, w: 0.25, h: 0.2, d: 0.25 });
  }
  instances(sphere, blueLight, taxiLights); instances(sphere, greenLight, centerLights);
  instances(cube, standard(0xaab0a7), approachPosts); instances(sphere, whiteLight, approachLights);
  const papiLamps = [];
  for (let i = 0; i < 4; i++) {
    const x = -60 - i * 9;
    box(standard(0xe4e4d4), x, 0.58, aimpoint, 1.5, 1.1, 1.2);
    box(lightBase, x, 0.64, aimpoint + 0.62, 1.28, 0.62, 0.04);
    papiLamps.push(addMesh(sphere, i < 2 ? whiteLight : redLight, x, 0.68, aimpoint + 0.69, 0.5, 0.23, 0.08));
  }
  function sign(text, x, y, z, width, height, options = {}) {
    const map = texture(1024, 128, (ctx, w, h) => {
      ctx.fillStyle = options.background || '#19282f'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = options.color || '#f0e9c7'; ctx.font = '600 70px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2);
    });
    return addMesh(plane, basic(0xffffff, { map, side: THREE.DoubleSide }), x, y, z, width, height, 1);
  }
  for (let i = 0; i < connectors.length; i++) {
    sign(`A${i + 1}  |  ${labels[0]}–${labels[1]}`, 78, 0.7, connectors[i] + 20, 5.6, 0.72, { background: '#302d1f', color: '#f2cb59' });
  }

  const terminalWhite = standard(0xd4d7ce), terminalRoof = standard(0xb5beb8, { roughness: 0.55 });
  const glass = standard(0x375460, { roughness: 0.24, metalness: 0.25 }), structure = standard(0x87958f);
  box(terminalWhite, 636, 8, -270, 96, 16, 1140);
  box(glass, 586.8, 10.5, -270, 0.4, 10, 1125);
  box(glass, 685.2, 10.5, -270, 0.4, 10, 1125);
  box(terminalRoof, 636, 18.1, -270, 115, 2.2, 1180);
  box(structure, 587, 6, -270, 0.6, 0.35, 1125); box(structure, 587, 11, -270, 0.6, 0.35, 1125);
  const pillars = [], roofs = [], jetBridges = [], supports = [];
  for (let z = -830; z < 300; z += 12) for (const x of [586.3, 685.8]) pillars.push({ x, y: 10.5, z, w: 0.45, h: 10.5, d: 0.45 });
  for (let z = -790; z < 330; z += 70) {
    roofs.push({ x: 636, y: 19.6, z, w: 73, h: 0.35, d: 41, ry: 0 });
    roofs.push({ x: 636, y: 20.5, z, w: 42, h: 1.4, d: 8 });
  }
  for (let z = -820; z < 430; z += 170) {
    jetBridges.push({ x: 544, y: 4.5, z, w: 84, h: 3, d: 4.6 });
    jetBridges.push({ x: 500, y: 4.5, z, w: 7, h: 3.8, d: 7 });
    supports.push({ x: 519, y: 1.8, z, w: 1.3, h: 3.6, d: 1.3 });
  }
  instances(cube, structure, pillars); instances(cube, glass, roofs); instances(cube, terminalWhite, jetBridges); instances(cube, structure, supports);
  const terminalName = sign(options.airportName || 'COASTAL  INTERNATIONAL', 586.4, 15, -268, 58, 5.5);
  terminalName.rotation.y = -Math.PI / 2;
  const towerConcrete = standard(0xc2ccc4);
  box(towerConcrete, 328, 24, 80, 11, 48, 13);
  box(structure, 328, 46, 80, 18, 3, 20);
  box(glass, 328, 50, 80, 21, 6, 23);
  box(terminalWhite, 328, 54, 80, 26, 1.8, 28);
  box(structure, 328, 57.6, 80, 0.8, 5, 0.8);
  addMesh(sphere, redLight, 328, 60.3, 80, 0.55);
  box(towerConcrete, 340, 4, 106, 46, 8, 31);
  const cabFrames = [];
  for (const side of [-1, 1]) for (let d = -10; d <= 10; d += 5) {
    cabFrames.push({ x: 328 + side * 10.6, y: 50, z: 80 + d, w: 0.38, h: 6.1, d: 0.38 });
    cabFrames.push({ x: 328 + d, y: 50, z: 80 + side * 11.6, w: 0.38, h: 6.1, d: 0.38 });
  }
  instances(cube, structure, cabFrames);
  const hangarMetal = standard(0xa8b6b2), hangarDoor = standard(0x708382);
  for (const [x, z] of [[925, 1050], [1140, 1050], [925, 1320]]) {
    box(hangarMetal, x, 17.5, z, 150, 35, 90);
    box(terminalRoof, x, 36, z, 158, 2.8, 98);
    box(hangarDoor, x, 14, z - 45.2, 130, 28, 0.4);
    ground(concrete, x, z - 120, 170, 145, 0.003);
  }
  ground(standard(0x4b5655), 764, -270, 35, 1780, 0.001);
  const carItems = [], carColors = [];
  ground(standard(0x7d8784), 885, -310, 192, 1020, 0.003);
  for (let z = -790; z <= 170; z += 13) for (const x of [813, 835, 869, 891, 925, 947]) {
    if (random() > 0.63) continue;
    carItems.push({ x, y: 0.9, z, w: 2.1, h: 1.65, d: 4.6 });
    carColors.push([0xcbd2cd, 0x3e525c, 0x6a7475, 0x8a6862, 0xa4a899][Math.floor(random() * 5)]);
  }
  instances(cube, standard(0xffffff, { roughness: 0.55 }), carItems, carColors);

  const jetWhite = standard(0xdde6e7, { roughness: 0.52 }), jetBlue = standard(0x31586d), jetMetal = standard(0x889a9f, { roughness: 0.44 });
  const fuselage = geometry(new THREE.CylinderGeometry(1.9, 1.9, 27, 16)); fuselage.rotateX(Math.PI / 2);
  const rearCone = geometry(new THREE.CylinderGeometry(0.4, 1.9, 9, 16)); rearCone.rotateX(Math.PI / 2);
  const engineGeo = geometry(new THREE.CylinderGeometry(1.12, 1.05, 4, 16)); engineGeo.rotateX(Math.PI / 2);
  const wingsShape = new THREE.Shape();
  wingsShape.moveTo(-1.6, 5); wingsShape.lineTo(-17, -5); wingsShape.lineTo(-17, -8); wingsShape.lineTo(-2, -3);
  wingsShape.lineTo(2, -3); wingsShape.lineTo(17, -8); wingsShape.lineTo(17, -5); wingsShape.lineTo(1.6, 5); wingsShape.closePath();
  const wingsGeo = geometry(new THREE.ShapeGeometry(wingsShape)); wingsGeo.rotateX(-Math.PI / 2);
  const wingsMat = standard(0xbacacf, { side: THREE.DoubleSide, roughness: 0.5 });
  const tailShape = new THREE.Shape(); tailShape.moveTo(-1, -11); tailShape.lineTo(-7, -15); tailShape.lineTo(-7, -17); tailShape.lineTo(7, -17); tailShape.lineTo(7, -15); tailShape.lineTo(1, -11); tailShape.closePath();
  const tailGeo = geometry(new THREE.ShapeGeometry(tailShape)); tailGeo.rotateX(-Math.PI / 2);
  const finGeo = geometry(new THREE.BufferGeometry());
  finGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 3.8, 10, 0, 9.3, 16, 0, 3.8, 18], 3)); finGeo.computeVertexNormals();
  const finMat = standard(0x31586d, { side: THREE.DoubleSide });
  const parkedParts = new Map();
  function parkedPart(shape, surface, standZ, x, y, z, w = 1, h = 1, d = 1) {
    const key = `${shape.uuid}:${surface.uuid}`;
    if (!parkedParts.has(key)) parkedParts.set(key, { shape, surface, items: [] });
    parkedParts.get(key).items.push({ x: 477 - z, y, z: standZ + x, w, h, d, ry: -Math.PI / 2 });
  }
  for (let z = -820; z < 430; z += 170) {
    parkedPart(fuselage, jetWhite, z, 0, 3.7, 0);
    parkedPart(sphere, jetWhite, z, 0, 3.7, -13.7, 1.9, 1.9, 3.4);
    parkedPart(rearCone, jetWhite, z, 0, 3.7, 18);
    parkedPart(wingsGeo, wingsMat, z, 0, 3.2, 0);
    parkedPart(tailGeo, wingsMat, z, 0, 4.4, 0);
    parkedPart(finGeo, finMat, z, 0, 0, 0);
    for (const side of [-1, 1]) {
      parkedPart(engineGeo, jetMetal, z, side * 5.8, 2.3, -1.5);
      parkedPart(sphere, lightBase, z, side * 5.8, 2.3, -3.55, 0.85, 0.85, 0.15);
      parkedPart(cube, jetBlue, z, side * 1.85, 3.7, -1, 0.05, 0.35, 22);
      parkedPart(cube, lightBase, z, side * 2.7, 0.62, 5, 0.7, 1.25, 1.5);
      for (let windowZ = -10; windowZ < 10; windowZ += 1.3) parkedPart(sphere, glass, z, side * 1.87, 4.4, windowZ, 0.08, 0.19, 0.13);
    }
    parkedPart(cube, glass, z, 0, 4.2, -15.8, 2.8, 0.65, 0.3);
    parkedPart(cube, lightBase, z, 0, 0.6, -11, 0.7, 1.2, 1);
  }
  for (const part of parkedParts.values()) instances(part.shape, part.surface, part.items);
  target = landscape;
  const distantBuildings = [], buildingColors = [], roadMat = standard(0x87948b);
  for (let i = 0; i < 360; i++) {
    const x = 2000 + random() * 4200, z = -7000 + random() * 14000;
    const height = 5 + Math.pow(random(), 4) * 105;
    distantBuildings.push({ x, y: height / 2, z, w: 18 + random() * 45, h: height, d: 18 + random() * 55 });
    buildingColors.push([0xa9b5ae, 0xb8c0b5, 0x8eaaa8, 0x9ba9a5][Math.floor(random() * 4)]);
  }
  instances(cube, standard(0xffffff), distantBuildings, buildingColors);
  for (const x of [1820, 2950, 4260, 5510]) ground(roadMat, x, 0, 20, 15500, -0.1);
  for (const z of [-6300, -3250, 3150, 6400]) ground(roadMat, 3920, z, 4800, 15, -0.09);
  const treeGeo = geometry(new THREE.ConeGeometry(1, 1, 7)), trees = [], treeColors = [];
  for (let i = 0; i < 1700; i++) {
    const x = -680 + random() * 8300, z = -9500 + random() * 19000;
    if (x < 1450 && z > -2450 && z < 2450) continue;
    const height = 7 + random() * 12;
    trees.push({ x, y: height / 2, z, w: height * 0.3, h: height, d: height * 0.3 });
    treeColors.push([0x425f49, 0x50684b, 0x607254, 0x3e6252][Math.floor(random() * 4)]);
  }
  instances(treeGeo, standard(0xffffff), trees, treeColors);
  target = root;

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
      fog.color.set(overcast ? 0xb9c6c8 : 0xb8cbd4); fog.density = overcast ? 0.00006 : 0.000026;
      sunlight.intensity = overcast ? 0.6 : 2.4; hemisphere.intensity = overcast ? 1.9 : 1.6;
      cloudMaterial.opacity = overcast ? 0.94 : 0.67;
      seaMaterial.color.set(overcast ? 0x8faab5 : 0xa3d0d3);
      for (const cloud of clouds) cloud.object.scale.set(cloud.width * (overcast ? 2.5 : 1), cloud.width * (overcast ? 0.5 : 0.37), 1);
    }
    const seconds = Number.isFinite(time) ? time : 0;
    seaMap.offset.set(seconds * 0.00007, seconds * 0.00002);
    for (const cloud of clouds) {
      cloud.object.position.x = cloud.x + Math.sin(seconds * 0.0006) * 100 + seconds * cloud.speed;
      cloud.object.position.y = cloud.altitude * (type === 'overcast' ? 0.64 : 1);
    }
    const distance = Math.max(1, (position.z || 0) - aimpoint);
    const angle = Math.atan2(Math.max(0, position.y || 0), distance) * 180 / Math.PI;
    const transitions = [2.7, 2.9, 3.1, 3.3];
    papiLamps.forEach((lamp, i) => { lamp.material = angle > transitions[i] ? whiteLight : redLight; });
  }
  update(0, { position: { x: 0, y: 4, z: near - 180 } });
  return { runway, update, setGeographic(enabled) { landscape.visible = !enabled; }, dispose() {
    scene.remove(root);
    if (scene.fog === fog) { scene.fog = previousFog; scene.background = previousBackground; }
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  } };
}
