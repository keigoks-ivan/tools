// Original low-poly airport world. The traffic is a sampled illustration;
// the deterministic economic model remains the only source of accounts.
import { AIRCRAFT } from './data.mjs?v=20';
import { tr, pick } from './ui-util.js?v=20';

export function createAirport(box, { hubId = 'TPE', onSelect = () => {}, preview = false, still = false } = {}) {
  let dead = false, live = null, current = {}, time = { elapsed: 0, speed: 0 };
  const world = document.createElement('div'); world.className = 'airport-world'; box.prepend(world);
  const loading = document.createElement('div'); loading.className = 'world-loading';
  loading.textContent = tr('正在準備你的機場…', 'Preparing your airport…'); world.append(loading);
  function fallback() {
    if(dead)return;
    live?.destroy();
    world.innerHTML = `<picture class="airport-fallback"><source media="(max-width:700px)" srcset="./art/v3/airport-dusk-mobile.webp?v=20"><img src="./art/v3/airport-dusk.webp?v=20" alt="${tr('天青航空機場場景','Skyglaze airport scene')}"></picture><p class="world-fallback-note">${tr('輕量機場 · 所有操作都能使用','Lightweight airport · all controls available')}</p>`;
    const labels = [['terminal', '✈', '安排航線', 'Plan routes', 47, 41], ['fleet', '◒', '查看機隊', 'Fleet', 40, 70], ['depot', '⚒', '維修庫', 'Maintenance', 23, 52], ['lounge', '★', '貴賓室', 'Lounge', 66, 46], ['tank', '◉', '儲油槽', 'Fuel tanks', 81, 57], ['tower', '⚑', '任務塔台', 'Dispatch', 27, 28]];
    if(!preview)for (const [id, icon, zh, en, x, y] of labels) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'world-hotspot fallback-hotspot'; b.dataset.world = id;
      b.style.left = `${x}%`; b.style.top = `${y}%`; b.innerHTML = `<i>${icon}</i><span>${tr(zh, en)}</span>`; b.onclick = () => onSelect(id); world.append(b);
    }
    live = { update() {}, setTime() {}, destroy() {}, stats: () => ({ kind: 'airport', fallback: true }) };
    loading.remove();
  }
  world.addEventListener('airport-context-lost',fallback,{once:true});
  const ready = import('/game/lib/three.module.js').then(THREE => {
    if (dead) return;
    live = airportWorld(THREE, world, { hubId, onSelect, preview, still });
    live.update(current); live.setTime(time); loading.remove();
  }).catch(fallback);

  return {
    ready, update(next) { current = { ...current, ...next }; live?.update(current); },
    setTime(next) { time = next; live?.setTime(next); }, zoomBy(f) { live?.zoomBy?.(f); },
    recenter() { live?.recenter?.(); }, focus(id) { live?.select?.(id); },
    destroy() { dead = true; live?.destroy(); world.remove(); },
    stats() { return live?.stats() || { kind: 'airport', loading: true }; },
  };
}

function airportWorld(T, box, { hubId, onSelect, preview, still }) {
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.35 : 1.6));
  renderer.outputColorSpace = T.SRGBColorSpace; box.append(renderer.domElement);
  renderer.domElement.className = 'airport-canvas'; renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-23, 23, 16, -16, .1, 200);
  scene.add(new T.HemisphereLight(0xffffff, 0x618ba6, 2.4));
  const sun = new T.DirectionalLight(0xfff2d2, 2.1); sun.position.set(-20, 35, 18); scene.add(sun);
  const geometries = { box: new T.BoxGeometry(1, 1, 1), ball: new T.SphereGeometry(1, 10, 6), cylinder: new T.CylinderGeometry(1, 1, 1, 12), cone: new T.ConeGeometry(1, 1, 10) };
  const materials = new Map(), batches = new Map(), meshes = [], dynamic = new T.Group(); scene.add(dynamic);
  const mat = color => { if (!materials.has(color)) materials.set(color, new T.MeshLambertMaterial({ color })); return materials.get(color); };
  const transform = new T.Object3D();
  function part(shape, color, x, y, z, sx, sy, sz, ry = 0, rz = 0, parent = null) {
    if (parent) {
      const m = new T.Mesh(geometries[shape], mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(0, ry, rz); parent.add(m); return m;
    }
    const key = `${shape}/${color}`; if (!batches.has(key)) batches.set(key, []);
    transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, ry, rz); transform.updateMatrix(); batches.get(key).push(transform.matrix.clone());
  }
  function batchGroup(g) {
    const groups=new Map();
    for(const m of [...g.children]) { if(!m.isMesh)continue; const key=m.geometry.uuid+'/'+m.material.uuid; if(!groups.has(key))groups.set(key,[]); m.updateMatrix();groups.get(key).push(m);g.remove(m); }
    for(const parts of groups.values()){ const first=parts[0],batch=new T.InstancedMesh(first.geometry,first.material,parts.length);parts.forEach((m,i)=>batch.setMatrixAt(i,m.matrix));g.add(batch); }
  }
  const cube = (color, x, y, z, sx, sy, sz, ry = 0, parent = null) => part('box', color, x, y, z, sx, sy, sz, ry, 0, parent);
  const ball = (color, x, y, z, sx, sy, sz, parent = null) => part('ball', color, x, y, z, sx, sy, sz, 0, 0, parent);
  const cyl = (color, x, y, z, sx, sy, sz, parent = null) => part('cylinder', color, x, y, z, sx, sy, sz, 0, 0, parent);
  function rounded(color,x,y,z,sx,sy,sz,r){
    const shape=new T.Shape(),left=-sx/2,right=sx/2,bottom=-sz/2,top=sz/2;
    shape.moveTo(left+r,bottom);shape.lineTo(right-r,bottom);shape.quadraticCurveTo(right,bottom,right,bottom+r);shape.lineTo(right,top-r);shape.quadraticCurveTo(right,top,right-r,top);shape.lineTo(left+r,top);shape.quadraticCurveTo(left,top,left,top-r);shape.lineTo(left,bottom+r);shape.quadraticCurveTo(left,bottom,left+r,bottom);
    const geometry=new T.ExtrudeGeometry(shape,{depth:sy,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:2,steps:1,curveSegments:5});geometry.rotateX(-Math.PI/2);geometry.translate(x,y-sy/2,z);geometries['rounded'+Object.keys(geometries).length]=geometry;scene.add(new T.Mesh(geometry,mat(color)));
  }
  // A toy island: raised edge, warm aprons, runway and road painted into the world.
  rounded('#8dbcc4',0,-.8,0,36,1.5,26,1.2);
  rounded('#b5d3b1',0,.02,0,35.6,.2,25.6,1.05);
  cube('#e2dbca', -.4, .17, 1.6, 30, .1, 12.5);
  cube('#435e6e', 0, .22, 9.2, 33, .08, 3.8);
  cube('#708b91', 0, .2, 5.5, 32, .07, 1.25);
  for (let i = -14; i <= 14; i += 2) { cube('#fff1bf', i, .28, 9.2, 1, .03, .14); cube('#f0d9a6', i, .25, 5.5, .65, .02, .07); }
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) cube('#eef2e4', side * 14, .29, 7.9 + i * .45, 1.8, .03, .22);
  for (let i = -16; i <= 16; i += 1.4) for (const z of [7.2, 11.25]) cyl('#f8d998', i, .28, z, .08, .12, .08);
  for (let i = -11; i < 14; i += 4) {
    cube('#f2e4b8', i, .26, 3.1, .09, .02, 3.6); cube('#f2e4b8', i, .26, 1.25, 1.8, .02, .09);
    cyl('#b6bfaf', i, .235, 1.6, 1.9, .02, 1.5);
  }
  cube('#658687', 0, .19, -9, 33, .08, 1.3);
  for (let i = -15; i < 16; i += 2) cube('#e8e6bd', i, .26, -9, .9, .02, .08);
  // Terminal: curved canopy, teal glazing, jet bridges, rooftop skylights.
  cube('#748e98', -1, .36, -3.6, 13.8, .3, 5.9);
  cube('#e7ecdf', -1, 1.5, -3.6, 13, 2.4, 5.2);
  cube('#549eae', -1, 1.6, -.94, 12.5, 1.7, .14);
  cube('#3c7894', -1, 1.7, -6.25, 12.5, 1.5, .12);
  for (let i = -7; i <= 5; i += 1) cube('#d0e3df', i, 1.6, -.8, .09, 1.9, .15);
  cube('#a6c7cf', -1, 2.88, -3.6, 13.8, .28, 5.8);
  rounded('#f3eedb',-1,3.16,-3.6,13.9,.24,6,.4);
  for (let i = -6; i <= 4; i += 2) cube('#80b7bf', i, 3.45, -3.6, 1.2, .08, 2.8);
  for (let i = -5; i <= 3; i += 4) { cube('#d9e5df', i, 1.4, .4, .8, .65, 2.8); cube('#477b96', i, 1.35, 1.5, 1.5, .85, .7); }
  // Tower and a small administration building.
  cube('#e7d9bf', -10.8, 2, -5.8, 1.3, 3.8, 1.3);
  cube('#4e879f', -10.8, 4.5, -5.8, 2.4, 1.3, 2.4);
  cube('#d9e5de', -10.8, 5.3, -5.8, 2.8, .32, 2.8);
  cyl('#f6ca79', -10.8, 5.65, -5.8, .13, .45, .13);
  cube('#cadcd4', -10.8, .9, -7.4, 3.5, 1.4, 2);
  // Facilities are actual objects; inactive construction plots become solid buildings on settlement.
  const facilities = {};
  function facility(id, x, z) {
    const g = new T.Group(); g.position.set(x, .2, z); scene.add(g); facilities[id] = g;
    cube('#849c9c', 0, .12, 0, 4.4, .15, 4, 0, g);
    if (id === 'depot') {
      cube('#d0e0e4', 0, 1.3, 0, 4, 2.4, 3.5, 0, g); cube('#a9c9dc', 0, 2.65, 0, 4.5, .38, 3.9, 0, g);
      cube('#325a75', 0, 1.12, 1.8, 3.1, 1.9, .06, 0, g);
      for (let y = .4; y < 2; y += .3) cube('#688ca7', 0, y, 1.85, 3, .05, .07, 0, g);
      cube('#f4c879', -1.7, 1.3, 1.87, .15, 1.9, .13, 0, g); cube('#f4c879', 1.7, 1.3, 1.87, .15, 1.9, .13, 0, g);
    } else if (id === 'lounge') {
      cube('#dfdcc7', 0, 1.1, 0, 3.9, 1.9, 3.5, 0, g); cube('#62a9a5', 0, 1.2, 1.8, 3.5, 1.3, .08, 0, g);
      cube('#f4e6cc', 0, 2.2, 0, 4.4, .25, 3.9, 0, g); cube('#b7cd9b', 0, 2.38, 0, 3.9, .08, 3.4, 0, g);
      cyl('#e7c48d', .8, 2.65, .9, .65, .12, .65, g);
    } else {
      for (const x of [-.95, .95]) { cyl('#dfebdf', x, 1, 0, .8, 1.7, .8, g); cyl('#95b9c3', x, 1.93, 0, .85, .15, .85, g); cyl('#528392', x, 1.1, 0, .805, .22, .805, g); }
      cube('#659da9', 0, .3, 1.4, 3.2, .23, .22, 0, g);
    }
  }
  facility('depot', -12, -.5); facility('lounge', 9, -3.1); facility('tank', 13.8, -.8);Object.values(facilities).forEach(batchGroup);
  // Trees, terminal plazas, car park and little terminal lamps.
  for (const [x, z] of [[-16,-8],[-15,-6],[-16,-3],[-15,2],[14,-7],[16,-5],[15,-3],[10,-7],[8,-7],[-7,-10],[-4,-10],[3,-10],[6,-10]]) {
    cyl('#947f66', x, .7, z, .13, 1.2, .13); ball('#6dab91', x, 1.65, z, .8, .9, .8); ball('#95c59b', x-.2, 2.1, z, .5, .5, .5);
  }
  for (let x = -6; x < 7; x += 1.4) for (const z of [-7.3, -10.5]) {
    cube('#7c9694', x, .26, z, .85, .03, 1.2);
    cube(['#eac783','#85adbc','#d9dfd8'][Math.abs(Math.round(x))%3], x, .53, z, .62, .5, 1.02);
    cube('#527f91', x, .78, z-.05, .56, .12, .55);
  }
  for (const x of [-8, 6, 11, -13]) { cyl('#718c95', x, 1.5, -1, .04, 2.8, .04); ball('#ffe2a3', x, 2.95, -1, .16, .16, .16); }
  for(const [x,y,z] of [[-17,6,-11],[18,7,-9],[5,8,-16]]){ball('#ecf2e7',x,y,z,2.1,.65,.8);ball('#f5f6e9',x+.2,y+.55,z,1.05,.95,.75);ball('#e0eee6',x-1,y+.2,z,.9,.65,.7);}
  for (const [key, matrices] of batches) {
    const [shape, color] = key.split('/'), mesh = new T.InstancedMesh(geometries[shape], mat(color), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); scene.add(mesh); meshes.push(mesh);
  }
  // Aircraft use a shared miniature shape with recognisable size/propeller differences.
  function airplane(type) {
    const g = new T.Group(), wide = ['MQ-350','MQ-400'].includes(type), turbo = type === 'MQ-72', long = ['MQ-321','MQ-350','MQ-400'].includes(type);
    const length = turbo ? 2.4 : wide ? 4.1 : long ? 3.45 : 3, radius = wide ? .27 : .21, span = wide ? 3.8 : turbo ? 2.9 : 2.6;
    ball('#e4f1ec', 0, .47, 0, radius, radius, length/2, g); ball('#426b83', 0, .55, -length*.39, radius*.82, radius*.55, .25, g);
    const wing = cube('#a4d0db', 0, .4, .05, span, .07, .45, -.16, g); wing.rotation.z = -.015;
    cube('#82b7cc', 0, .49, length*.36, 1.1, .06, .35, .06, g);
    const tail = cube('#6ea9c6', 0, .89, length*.36, .07, .8, .45, 0, g); tail.rotation.x = -.27;
    cube('#d1ebe9', 0, 1.02, length*.38, .085, .06, .24, 0, g);
    for (const x of [-span*.27, span*.27]) {
      const engine = cyl('#335c78', x, .32, -.01, .15, .63, .15, g); engine.rotation.x = Math.PI/2;
      ball('#a8cbd0', x, .32, -.35, .15, .15, .06, g);
      if (turbo) cube('#244d63', x, .37, -.39, .06, .9, .05, 0, g);
    }
    for (let z = -length*.24; z < length*.25; z += .19) for (const x of [-radius, radius]) cube('#5c90a6', x, .52, z, .018, .065, .07, 0, g);
    for (const x of [-.17, .17]) cyl('#385064', x, .2, .5, .08, .1, .08, g);
    cyl('#385064', 0, .2, -length*.31, .07, .1, .07, g);
    batchGroup(g);dynamic.add(g); return g;
  }
  const planes = [], vehicles = [], people = [], movingPools = [], pooled = new T.Group(), composed = new T.Matrix4();scene.add(pooled);
  function rebuildMovingPools(){
    movingPools.forEach(p=>p.mesh.dispose());movingPools.length=0;pooled.clear();const groups=new Map();
    for(const root of dynamic.children){
      root.visible=false;
      for(const mesh of root.children){
        const key=mesh.geometry.uuid+'/'+mesh.material.uuid;if(!groups.has(key))groups.set(key,{geometry:mesh.geometry,material:mesh.material,items:[]});mesh.updateMatrix();
        for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++){const local=new T.Matrix4();if(mesh.isInstancedMesh)mesh.getMatrixAt(i,local);local.premultiply(mesh.matrix);groups.get(key).items.push({root,local});}
      }
    }
    for(const p of groups.values()){p.mesh=new T.InstancedMesh(p.geometry,p.material,p.items.length);p.mesh.frustumCulled=false;pooled.add(p.mesh);movingPools.push(p);}
  }
  function updateMovingPools(){
    dynamic.children.forEach(g=>g.updateMatrix());
    for(const p of movingPools){p.items.forEach((item,i)=>{composed.multiplyMatrices(item.root.matrix,item.local);p.mesh.setMatrixAt(i,composed);});p.mesh.instanceMatrix.needsUpdate=true;p.mesh.boundingSphere=null;}
  }
  for (let i = 0; i < 3; i++) {
    const g = new T.Group(); cube(i === 0 ? '#e9c783' : '#f1e4c7', 0, .36, 0, .55, .4, 1.1, 0, g); cube('#5f9bae', 0, .62, -.15, .5, .15, .5, 0, g);
    for (const x of [-.28, .28]) for (const z of [-.32, .32]) ball('#3c5968', x, .18, z, .1, .13, .13, g);
    batchGroup(g);dynamic.add(g); vehicles.push(g);
  }
  for (let i = 0; i < 16; i++) {
    const g = new T.Group(); cube(['#e9c68a','#5f9fba','#a883af'][i%3], 0, .25, 0, .13, .28, .13, 0, g); ball('#f0d8b7', 0, .48, 0, .09, .1, .09, g); dynamic.add(g); people.push(g);
  }
  const labels = [], positions = { terminal: [-1, 3.5, -3.6], fleet: [-5, .45, 4.4], depot: [-12, 3.2, -.5], lounge: [9, 3, -3.1], tank: [13.8, 2.5, -.8], tower: [-10.8, 6, -5.8] };
  const names = [['terminal','✈','開航線','Plan routes'],['fleet','◒','機隊','Fleet'],['depot','⚒','維修庫','Maintenance'],['lounge','★','貴賓室','Lounge'],['tank','◉','儲油槽','Fuel tanks'],['tower','⚑','任務塔台','Dispatch']];
  if (!preview) for (const [id, icon, zh, en] of names) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'world-hotspot'; b.dataset.world = id;
    b.innerHTML = `<i aria-hidden="true">${icon}</i><span>${tr(zh, en)}</span><small></small>`;
    b.setAttribute('aria-label', tr(zh, en)); b.onclick = () => { select(id); onSelect(id, planes[0]?.type); }; box.append(b);
    labels.push({ id, b, pos: new T.Vector3(...positions[id]) });
  }
  const ring = new T.Mesh(new T.RingGeometry(.9, 1, 36), new T.MeshBasicMaterial({ color: 0xffe6a2, side: T.DoubleSide })); ring.rotation.x = -Math.PI/2; ring.position.y = .32; ring.visible = false; scene.add(ring);
  let routes = [], running = false, elapsed = 0, speed = 0, angle = -.28, zoom = 1, width = 1, height = 1, dirty = true, previous = 0, ambient = 0, frame = 0, frames = 0, renderMs = 0, selected = '', pinch = null, pinched = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), pointers = new Map(), projected = new T.Vector3();
  function cameraPose() {
    const portrait = width < height * .8, view = portrait ? 21.5/(width/height) : 17.8, aspect = width/height;
    camera.left = -view*aspect/zoom; camera.right = view*aspect/zoom; camera.top = view/zoom; camera.bottom = -view/zoom;
    camera.position.set(34*Math.sin(angle+.55), 32, 34*Math.cos(angle+.55)); camera.lookAt(0, .4, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(); dirty = true;
  }
  function resize() { width = box.clientWidth || 1; height = box.clientHeight || 1; renderer.setSize(width, height, false); cameraPose(); }
  const observer = new ResizeObserver(resize); observer.observe(box); resize();
  function select(id) { selected = id; ring.visible = !!positions[id]; if (positions[id]) ring.position.set(positions[id][0], .32, positions[id][2]); labels.forEach(l => l.b.classList.toggle('selected', l.id === id)); dirty = true; }
  function update(next) {
    routes = next.routes || []; running = !!next.active;
    const types=(next.fleet||[]).slice(0,4).map(p=>p.type);for(const r of routes)if(!types.includes(r.type))types.push(r.type);
    const display = (types.length ? types : ['MQ-320']).slice(0, 6), signature = display.join(',');
    if (planes.map(p => p.type).join(',') !== signature) {
      planes.forEach(p => dynamic.remove(p.g)); planes.length = 0;
      display.forEach((type, i) => { const g = airplane(type); g.position.set(-5+i*4, .16, 2.1); g.rotation.y = Math.PI; planes.push({ g, type }); });rebuildMovingPools();
    }
    for (const [id, g] of Object.entries(facilities)) {
      const built = !!next.facilities?.[id], queued = next.queued?.includes(id); g.scale.y = built ? 1 : queued ? .65 : .25;
      const label = labels.find(l => l.id === id); if (label) { label.b.classList.toggle('built', built); label.b.classList.toggle('queued', !!queued); label.b.querySelector('small').textContent = built ? tr('營運中','Active') : queued ? tr('已排定','Planned') : tr('可興建','Build'); }
    }
    const planeLabel = labels.find(l => l.id === 'fleet'); if (planeLabel) { planeLabel.b.querySelector('small').textContent = pick(AIRCRAFT[display[0]]);planeLabel.b.setAttribute('aria-label',tr('查看飛機','Inspect aircraft')+' '+pick(AIRCRAFT[display[0]])); }
    dirty = true;
  }
  function setTime(next) { const e=next.elapsed||0,s=next.speed||0;if((!reduced.matches&&e!==elapsed)||s!==speed)dirty=true;elapsed=e;speed=s; }
  function move(t) {
    const route=routes[Math.floor(t/18)%Math.max(1,routes.length)],flying=Math.max(0,planes.findIndex(p=>p.type===route?.type));
    planes.forEach((p, i) => {
      if (i === flying && (running && routes.length || preview)) {
        const phase = (t % 18)/18;
        if (phase < .22) { p.g.position.set(-12+phase/.22*9, .16, 5.5); p.g.rotation.set(0, -Math.PI/2, 0); }
        else if (phase < .55) { const f = (phase-.22)/.33; p.g.position.set(-3+f*22, .16+Math.max(0,f-.55)*10, 9.2); p.g.rotation.set(0, -Math.PI/2, Math.max(0,f-.55)*.3); }
        else { const f = (phase-.55)/.45; p.g.position.set(-23+f*11, Math.max(.16, 5-f*7), 9.2); p.g.rotation.set(0, -Math.PI/2, -.03); }
      } else { p.g.position.set(-5+i*4, .16, 2.1); p.g.rotation.set(0, Math.PI, 0); }
    });
    vehicles.forEach((g, i) => { const f = ((t*.065+i/3)%1); g.position.set(-13+f*26, .25, i === 0 ? -8.9 : 4.5); g.rotation.y = -Math.PI/2; });
    people.forEach((g, i) => { const f = ((t*.08+i/16)%1); g.position.set(-5+Math.floor(i/8)*4, .24, -1.1+f*2.3); });
  }
  function paint(now) {
    frame = requestAnimationFrame(paint);
    if (document.hidden || !box.isConnected) { previous = now; return; }
    const dt = previous ? Math.min(.1, (now-previous)/1000) : 0; previous = now;
    const suspended = !document.querySelector('#overlay')?.hidden;
    const moving = !reduced.matches && !suspended && (preview && !still || speed > 0);
    if (moving) ambient += dt;
    if (!dirty && !moving) return;
    const started = performance.now();
    move(reduced.matches ? 0 : preview ? ambient : elapsed);
    if (preview && moving) { angle = -.28+Math.sin(ambient*.065)*.035; cameraPose(); }
    if (ring.visible) ring.scale.setScalar(reduced.matches ? 1 : 1+Math.sin(now*.003)*.04);
    updateMovingPools();renderer.render(scene, camera);
    labels.forEach(l => { projected.copy(l.pos).project(camera); const x = (projected.x+1)*width/2, y = (1-projected.y)*height/2; l.b.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`; });
    frames++; renderMs += performance.now()-started; dirty = false;
  }
  const raycaster=new T.Raycaster(),pointer=new T.Vector2();
  function tapWorld(e){
    if(preview)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    for(const hit of raycaster.intersectObjects(scene.children,true)){
      let object=hit.object,visible=true;while(object){if(!object.visible){visible=false;break;}object=object.parent;}if(!visible)continue;
      const pool=movingPools.find(p=>p.mesh===hit.object),plane=pool&&planes.find(p=>p.g===pool.items[hit.instanceId]?.root);
      if(plane){select('fleet');onSelect('fleet',plane.type);return;}
      const facility=Object.keys(facilities).find(id=>hit.object.parent===facilities[id]);if(facility){select(facility);onSelect(facility);return;}
      const {x,y,z}=hit.point;
      if(y>.6&&x>-8&&x<6&&z>-6.7&&z<1.8){select('terminal');onSelect('terminal');return;}
      if(y>.4&&x>-12.5&&x<-9&&z>-8.5&&z<-4.5){select('tower');onSelect('tower');return;}
    }
  }
  function pointerDown(e) { if (e.target !== renderer.domElement) return; if(!pointers.size)pinched=false;pointers.set(e.pointerId, { x: e.clientX, y: e.clientY,sx:e.clientX,sy:e.clientY }); renderer.domElement.setPointerCapture(e.pointerId); pinch = pointers.size === 2 ? distance() : null;if(pointers.size>1)pinched=true; }
  const distance = () => { const p = [...pointers.values()]; return p.length === 2 ? Math.hypot(p[0].x-p[1].x, p[0].y-p[1].y) : 0; };
  function pointerMove(e) { const p = pointers.get(e.pointerId); if (!p) return; const dx = e.clientX-p.x; pointers.set(e.pointerId, { ...p,x: e.clientX, y: e.clientY }); if (pointers.size === 2) { const d = distance(); if (pinch) zoom = Math.max(.8, Math.min(1.65, zoom*d/pinch)); pinch = d; } else angle -= dx*.005; cameraPose(); }
  function pointerUp(e) { const p=pointers.get(e.pointerId),tap=p&&pointers.size===1&&!pinched&&Math.hypot(e.clientX-p.sx,e.clientY-p.sy)<6;pointers.delete(e.pointerId);pinch=null;if(tap&&e.type!=='pointercancel')tapWorld(e); }
  function wheel(e) { e.preventDefault(); zoom = Math.max(.8, Math.min(1.65, zoom*Math.exp(-e.deltaY*.001))); cameraPose(); }
  renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointermove', pointerMove); renderer.domElement.addEventListener('pointerup', pointerUp); renderer.domElement.addEventListener('pointercancel', pointerUp); renderer.domElement.addEventListener('wheel', wheel, { passive: false });
  function lost(e) { e.preventDefault(); box.dispatchEvent(new CustomEvent('airport-context-lost', { bubbles: true })); }
  renderer.domElement.addEventListener('webglcontextlost', lost);
  const onMotion = () => { dirty = true; }; reduced.addEventListener('change', onMotion);
  frame = requestAnimationFrame(paint);
  return { update, setTime, select,
    zoomBy(f) { zoom = Math.max(.8, Math.min(1.65, zoom*f)); cameraPose(); },
    recenter() { angle = -.28; zoom = 1; select(''); cameraPose(); },
    stats() { return { kind: 'airport', fallback: false, frames, meanPaintMs: frames ? renderMs/frames : 0, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, planes: planes.length, angle, zoom, reducedMotion: reduced.matches, active: running, speed }; },
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); reduced.removeEventListener('change', onMotion); renderer.domElement.removeEventListener('webglcontextlost', lost); geometries && Object.values(geometries).forEach(g => g.dispose()); materials.forEach(m => m.dispose()); ring.geometry.dispose(); ring.material.dispose();movingPools.forEach(p=>p.mesh.dispose()); renderer.dispose(); renderer.forceContextLoss(); box.replaceChildren(); },
  };
}
