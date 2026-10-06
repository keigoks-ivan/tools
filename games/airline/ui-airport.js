// Original miniature airport world. The traffic is a sampled illustration;
// the deterministic economic model remains the only source of accounts.
import { AIRCRAFT } from './data.mjs?v=21';
import { tr, pick } from './ui-util.js?v=21';
import { buildAirportArt, aircraftGeometry } from './ui-airport-art.js?v=21';

export function createAirport(box, { hubId = 'TPE', onSelect = () => {}, preview = false, still = false } = {}) {
  let dead = false, live = null, current = {}, time = { elapsed: 0, speed: 0 };
  const world = document.createElement('div'); world.className = 'airport-world'; box.prepend(world);
  const loading = document.createElement('div'); loading.className = 'world-loading';
  loading.textContent = tr('正在準備你的機場…', 'Preparing your airport…'); world.append(loading);
  function fallback() {
    if(dead)return;
    live?.destroy();
    world.innerHTML = `<picture class="airport-fallback"><source media="(max-width:700px)" srcset="./art/v3/airport-dusk-mobile.webp?v=21"><img src="./art/v3/airport-dusk.webp?v=21" alt="${tr('天青航空機場場景','Skyglaze airport scene')}"></picture><p class="world-fallback-note">${tr('輕量機場 · 所有操作都能使用','Lightweight airport · all controls available')}</p>`;
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
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = innerWidth >= 900; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  box.append(renderer.domElement);
  renderer.domElement.className = 'airport-canvas'; renderer.domElement.setAttribute('aria-hidden', 'true');
  const scene = new T.Scene(), camera = new T.OrthographicCamera(-23, 23, 16, -16, .1, 200);
  scene.add(new T.HemisphereLight(0xd8efff, 0x788f79, 1.7));
  const sun = new T.DirectionalLight(0xffe4b7, 3.4); sun.position.set(-16, 28, 15); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:70});
  sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04; scene.add(sun);
  const fill = new T.DirectionalLight(0xa6dfff,.65); fill.position.set(20,12,-10); scene.add(fill);
  const compact = innerWidth<900;
  const geometries = { box: new T.BoxGeometry(1, 1, 1), ball: new T.SphereGeometry(1, compact?12:16, compact?8:10), cylinder: new T.CylinderGeometry(1, 1, 1, compact?12:16), cone: new T.ConeGeometry(1, 1, 10) };
  const materials = new Map(), batches = new Map(), meshes = [], dynamic = new T.Group(); scene.add(dynamic);
  const glazing = new Set(['#4c94a8','#5c91ad','#4d8c9e','#80b8b6','#9aced2']);
  const mat = color => { if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({ color, roughness: glazing.has(color) ? .26 : .64, metalness: glazing.has(color) ? .25 : .06 })); return materials.get(color); }; mat.extra = [];
  const transform = new T.Object3D();
  function part(shape, color, x, y, z, sx, sy, sz, ry = 0, rz = 0, parent = null) {
    if (parent) {
      const m = new T.Mesh(geometries[shape], mat(color)); m.castShadow = true; m.receiveShadow = true; m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(0, ry, rz); parent.add(m); return m;
    }
    const key = `${shape}|${color}`; if (!batches.has(key)) batches.set(key, []);
    transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, ry, rz); transform.updateMatrix(); batches.get(key).push(transform.matrix.clone());
  }
  function batchGroup(g) {
    const groups=new Map();
    for(const m of [...g.children]) { if(!m.isMesh)continue; const key=m.geometry.uuid+'/'+m.material.uuid; if(!groups.has(key))groups.set(key,[]); m.updateMatrix();groups.get(key).push(m);g.remove(m); }
    for(const parts of groups.values()){ const first=parts[0],batch=new T.InstancedMesh(first.geometry,first.material,parts.length);parts.forEach((m,i)=>batch.setMatrixAt(i,m.matrix));batch.castShadow=!first.material.transparent&&!first.material.isMeshBasicMaterial;batch.receiveShadow=true;g.add(batch); }
  }
  const cube = (color, x, y, z, sx, sy, sz, ry = 0, parent = null) => part('box', color, x, y, z, sx, sy, sz, ry, 0, parent);
  const ball = (color, x, y, z, sx, sy, sz, parent = null) => part('ball', color, x, y, z, sx, sy, sz, 0, 0, parent);
  const cyl = (color, x, y, z, sx, sy, sz, parent = null) => part('cylinder', color, x, y, z, sx, sy, sz, 0, 0, parent);
  function rounded(color,x,y,z,sx,sy,sz,r){
    const shape=new T.Shape(),left=-sx/2,right=sx/2,bottom=-sz/2,top=sz/2;
    shape.moveTo(left+r,bottom);shape.lineTo(right-r,bottom);shape.quadraticCurveTo(right,bottom,right,bottom+r);shape.lineTo(right,top-r);shape.quadraticCurveTo(right,top,right-r,top);shape.lineTo(left+r,top);shape.quadraticCurveTo(left,top,left,top-r);shape.lineTo(left,bottom+r);shape.quadraticCurveTo(left,bottom,left+r,bottom);
    const geometry=new T.ExtrudeGeometry(shape,{depth:sy,bevelEnabled:true,bevelSize:Math.min(.08,sy/5),bevelThickness:Math.min(.08,sy/5),bevelSegments:2,steps:1,curveSegments:5});geometry.rotateX(-Math.PI/2);geometry.translate(x,y-sy/2,z);geometries['rounded'+Object.keys(geometries).length]=geometry;const m = new T.Mesh(geometry,mat(color)); m.receiveShadow=true;scene.add(m);
  }
  const art = buildAirportArt(T,{scene,geometries,mat,cube,ball,cyl,part,rounded,batchGroup,hubId});
  const {facilities,plots,sites} = art;
  aircraftGeometry(T,geometries);
  for (const [key, matrices] of batches) {
    const [shape, color] = key.split('|'), mesh = new T.InstancedMesh(geometries[shape], mat(color), matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m)); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); meshes.push(mesh);
  }
  // Aircraft use a shared miniature shape with recognisable size/propeller differences.
  function airplane(type) {
    const g = new T.Group(), wide = ['MQ-350','MQ-400'].includes(type), turbo = type === 'MQ-72';
    const [length,radius,span] = ({'MQ-72':[2.4,.18,2.7],'MQ-190':[2.8,.19,2.4],'MQ-320':[3.1,.21,2.9],'MQ-321':[3.6,.21,2.9],'MQ-350':[4.1,.27,3.8],'MQ-400':[4.55,.29,3.8]})[type] || [3.1,.21,2.9];
    ball('#dceef0', 0, .5, 0, radius, radius, length/2, g); ball('#264e6a', 0, .57, -length*.4, radius*.8, radius*.4, .19, g);
    // Swept tapered wings and a tapered fin replace rectangular blocks.
    part('wing','#b4d7de',0,turbo?.66:.42,0,span/2.24,1,wide?1.3:1,0,0,g);
    part('wing','#76adc2',0,.53,length*.36,.49,1,.45,0,0,g);
    part('fin','#659bb9',0,.55,length*.35,1,turbo?.68:1,.63,0,0,g);
    for(const x of [-span*.48,span*.48]){const tip=cube('#5494b3',x,turbo?.68:.53,.2,.08,.21,.18,0,g);tip.rotation.z=x<0?-.18:.18;}
    for(const x of [-span*.27,span*.27]){
      const engine = cyl('#cee3e2',x,.34,.02,wide?.2:.14,.66,wide?.2:.14,g);engine.rotation.x=Math.PI/2;
      ball('#24485d',x,.34,-.325,wide?.165:.11,wide?.165:.11,.024,g);ball('#81b3c5',x,.34,-.357,.04,.04,.025,g);
      if(turbo){for(const a of [0,Math.PI/3,Math.PI*2/3])part('box','#284e66',x,.36,-.36,.045,.64,.035,0,a,g);}
    }
    for(let z=-length*.23;z<length*.26;z+=.17)for(const x of [-radius,radius])cube('#386d8f',x,.55,z,.014,.052,.055,0,g);
    for(const x of [-radius,radius]){cube('#95c8d6',x,.46,0,.013,.045,length*.61,0,g);cube('#c0dce1',x,.55,-length*.28,.014,.15,.08,0,g);}
    for(const x of [-.17,.17]){cyl('#557684',x,.29,.5,.024,.23,.024,g);ball('#294653',x,.18,.5,.08,.08,.09,g);}
    cyl('#557684',0,.26,-length*.31,.025,.15,.025,g);ball('#294653',0,.18,-length*.31,.07,.07,.08,g);
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
    const g = new T.Group(), bus = i>0;
    art.bevel(bus?'#c8e0dd':'#e9c783',0,.4,0,.6,.43,bus?1.55:1.1,.08,g);
    art.bevel('#47768c',0,.68,bus?.04:-.15,.51,.24,bus?1.34:.5,.045,g);
    cube('#b4d6d5',0,.83,0,.58,.045,bus?1.48:1.03,0,g);
    if(bus)for(const x of [-.26,.26])for(let z=-.4;z<.6;z+=.29)cube('#b8d9d3',x,.68,z,.024,.24,.024,0,g);
    for (const x of [-.3,.3]) for (const z of [-.4,.4]){ball('#2c4857',x,.21,z,.11,.11,.11,g);ball('#8dabb1',x*1.04,.21,z,.055,.055,.055,g);}
    for(const x of [-.18,.18])ball('#f4dfa0',x,.38,-(bus?.79:.56),.045,.035,.025,g);
    if(i===2)for(const z of [1.3,2]){cube('#8daaaa',0,.25,z,.56,.12,.49,0,g);cube('#d6bb88',0,.45,z,.43,.3,.32,0,g);cube('#658794',0,.22,z-.45,.035,.035,.35,0,g);for(const x of [-.25,.25])ball('#2c4857',x,.15,z,.07,.07,.07,g);}
    batchGroup(g);dynamic.add(g); vehicles.push(g);
  }
  for (let i = 0; i < 16; i++) {
    const g = new T.Group(); cube(['#e9c68a','#5f9fba','#a883af'][i%3], 0, .25, 0, .13, .28, .13, 0, g); ball('#f0d8b7', 0, .48, 0, .09, .1, .09, g);ball('#42657a',0,.54,.025,.085,.048,.08,g);cube('#5b7e8c',.14,.16,0,.11,.2,.08,0,g);dynamic.add(g); people.push(g);
  }
  const labels = [], positions = { terminal: [-1, 3.9, -3.6], fleet: [-5, .45, 4.4], depot: [-12, 3.2, -.5], lounge: [9, 3, -3.1], tank: [13.8, 2.5, -.8], tower: [-10.8, 6, -5.8] };
  const names = [['terminal','✈','開航線','Plan routes'],['fleet','◒','機隊','Fleet'],['depot','⚒','維修庫','Maintenance'],['lounge','★','貴賓室','Lounge'],['tank','◉','儲油槽','Fuel tanks'],['tower','⚑','任務塔台','Dispatch']];
  if (!preview) for (const [id, icon, zh, en] of names) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'world-hotspot'; b.dataset.world = id;
    b.innerHTML = `<i aria-hidden="true">${icon}</i><span>${tr(zh, en)}</span><small></small>`;
    b.setAttribute('aria-label', tr(zh, en)); b.onclick = () => { select(id); onSelect(id, planes[0]?.type); }; box.append(b);
    labels.push({ id, b, pos: new T.Vector3(...positions[id]) });
  }
  const ring = new T.Mesh(new T.RingGeometry(.9, 1, 36), new T.MeshBasicMaterial({ color: 0xffe6a2, side: T.DoubleSide })); ring.rotation.x = -Math.PI/2; ring.position.y = .32; ring.visible = false; scene.add(ring);
  let routes = [], running = false, elapsed = 0, speed = 0, angle = -.28, zoom = 1, width = 1, height = 1, dirty = true, previous = 0, ambient = 0, frame = 0, frames = 0, renderMs = 0, selected = '', pinch = null, pinched = false, slowFrames = 0, light = false;
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
      const built = !!next.facilities?.[id], queued = next.queued?.includes(id); g.visible = built; plots[id].visible = !built; sites[id].visible = !built && !!queued; renderer.shadowMap.needsUpdate = true;
      const label = labels.find(l => l.id === id); if (label) { label.pos.y = built ? positions[id][1] : queued ? 4.25 : 1.25; label.b.classList.toggle('built', built); label.b.classList.toggle('queued', !!queued); label.b.querySelector('small').textContent = built ? tr('營運中','Active') : queued ? tr('已排定','Planned') : tr('可興建','Build'); }
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
    // Sustained slow rendering reduces canvas cost; the DOM controls stay sharp.
    if(moving && frames>25 && !light){
      slowFrames=dt>.055?slowFrames+1:Math.max(0,slowFrames-1);
      if(slowFrames>=18){light=true;renderer.setPixelRatio(.75);renderer.setSize(width,height,false);renderer.shadowMap.enabled=false;materials.forEach(m=>{m.needsUpdate=true;});dirty=true;}
    }
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
      let landmark=hit.object;while(landmark&&!landmark.userData.world)landmark=landmark.parent;const facility=landmark?.userData.world;if(facility){select(facility);onSelect(facility);return;}
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
    stats() { return { kind: 'airport', fallback: false, frames, art: 'miniature-v21', shadows: renderer.shadowMap.enabled, pixelRatio: renderer.getPixelRatio(), light, meanPaintMs: frames ? renderMs/frames : 0, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, planes: planes.length, angle, zoom, reducedMotion: reduced.matches, active: running, speed }; },
    destroy() { cancelAnimationFrame(frame); observer.disconnect(); reduced.removeEventListener('change', onMotion); renderer.domElement.removeEventListener('webglcontextlost', lost); scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();}); geometries && Object.values(geometries).forEach(g => g.dispose()); materials.forEach(m => m.dispose()); mat.extra.forEach(m=>m.dispose()); art.textures.forEach(t=>t.dispose()); ring.geometry.dispose(); ring.material.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.forceContextLoss(); box.replaceChildren(); },
  };
}
