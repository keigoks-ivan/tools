// SKYGLAZE globe: local NASA/Natural Earth textures; one WebGL draw on view changes,
// with sampled flight traffic painted on a lightweight 2D overlay.
import * as THREE from '/game/lib/three.module.js';
import { CITIES } from './data.mjs?v=18';
import { VERT, FRAG_PAPER } from './globe-shaders.js?v=18';
import { tr, pick, fmtUSD } from './ui-util.js?v=18';
const RAD = Math.PI / 180;
const ll = (lat, lon, r = 1) => new THREE.Vector3(r * Math.cos(lat * RAD) * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * Math.cos(lat * RAD) * Math.sin(lon * RAD));
const load = url => new Promise((resolve, reject) => new THREE.TextureLoader().load(url, resolve, undefined, reject));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function curve(a, b) {
  const va = ll(a.lat, a.lon), vb = ll(b.lat, b.lon), angle = va.angleTo(vb), sin = Math.sin(angle);
  return t => va.clone().multiplyScalar(Math.sin((1 - t) * angle) / sin).addScaledVector(vb, Math.sin(t * angle) / sin).normalize().multiplyScalar(1.006 + Math.sin(Math.PI * t) * Math.min(.2, angle * .08));
}
export async function createGlobe(box, { hubId, onCityClick, decorative = false }) {
  const mobile = box.clientWidth < 600 || matchMedia('(pointer:coarse)').matches;
  const canvas = document.createElement('canvas'); canvas.className = 'earth-canvas';
  const overlay = document.createElement('canvas'); overlay.className = 'traffic-canvas'; overlay.setAttribute('aria-hidden', 'true');
  const labels = document.createElement('div'); labels.className = 'airport-labels';
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !mobile, powerPreference: 'low-power' });
  renderer.setClearColor(0, 0); renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.25 : 1.5));
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(33, 1, .01, 20);
  const hub = CITIES[hubId], view = { lat: hub.lat + 5, lon: hub.lon - 5, radius: mobile ? 3.65 : 3.8 };
  let w = 1, h = 1, dirty = true, destroyed = false, frame = 0, lastFrame = 0, slow = 0, paintCount = 0, frameTotal = 0;
  let current = { routes: [], rivals: [], selected: null, metrics: {} }, time = { elapsed: 0, speed: 0 };
  let paths = [], projected = [], cities = [], receipts = [], cachedSignature = '';
  const sprite = new Image(); sprite.src = new URL('./art/v2/sprite.webp?v=18', import.meta.url).href;
  const [bm, mask] = await Promise.all([load(new URL(`./art/v2/earth-${mobile ? '2k' : '4k'}.webp?v=18`, import.meta.url).href), load(new URL(`./art/v2/land-${mobile ? '2k' : '4k'}.webp?v=18`, import.meta.url).href)]).catch(e => { renderer.dispose(); throw e; });
  bm.anisotropy = mask.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const camPos = { value: camera.position }, sun = { value: ll(35, hub.lon - 45) };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_PAPER, uniforms: { bm: { value: bm }, mask: { value: mask }, camPos, sun } });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, mobile ? 80 : 128, mobile ? 40 : 64), material); scene.add(globe);
  const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 32), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: `uniform vec3 camPos; varying vec3 vN; varying vec3 vW; void main(){float rim=pow(1.0-max(dot(normalize(vN),normalize(camPos-vW)),0.0),3.0);gl_FragColor=vec4(.65,.82,1.0,rim*.32);}`,
    uniforms: { camPos }, transparent: true, depthWrite: false,
  })); scene.add(atmosphere);
  box.prepend(canvas, overlay, labels);
  const ctx = overlay.getContext('2d');
  const buttons = {};
  if (!decorative) for (const c of Object.values(CITIES)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'airport'; b.dataset.city = c.id;
    b.setAttribute('aria-label', pick(c)); b.innerHTML = `<i></i><span>${c.id}<small>${pick(c)}</small></span>`;
    b.onclick = () => onCityClick(c.id); labels.append(b); buttons[c.id] = b;
  }
  function project(v) {
    const dir = v.clone().sub(camera.position), len = dir.length(); dir.divideScalar(len);
    const dot = camera.position.dot(dir), disc = dot * dot - camera.position.lengthSq() + 1;
    const near = disc > 0 ? -dot - Math.sqrt(disc) : Infinity;
    const p = v.clone().project(camera);
    return { x: (p.x + 1) * w / 2, y: (1 - p.y) * h / 2, visible: near >= len - .008 && p.z < 1 && p.x > -1.12 && p.x < 1.12 && p.y > -1.12 && p.y < 1.12 };
  }
  function rebuild() {
    camera.aspect = w / h; camera.position.copy(ll(view.lat, view.lon, view.radius));
    camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.render(scene, camera);
    projected = paths.map(p => ({ ...p, screen: Array.from({ length: 73 }, (_, i) => project(p.at(i / 72))) }));
    cities = Object.values(CITIES).map(c => ({ ...c, ...project(ll(c.lat, c.lon, 1.008)) }));
    const occupied = [];
    const mine = new Set(current.routes.map(r => r.city));
    for (const c of [...cities].sort((a,b) => (b.id === hubId ? 10000 : b.id === current.selected ? 9000 : mine.has(b.id) ? 5000 : b.pop) - (a.id === hubId ? 10000 : a.id === current.selected ? 9000 : mine.has(a.id) ? 5000 : a.pop))) {
      const b = buttons[c.id]; if (!b) continue;
      b.hidden = !c.visible; if (!c.visible) continue;
      b.style.left = `${c.x}px`; b.style.top = `${c.y}px`;
      b.classList.toggle('hub', c.id === hubId); b.classList.toggle('on', mine.has(c.id)); b.classList.toggle('selected', c.id === current.selected);
      const candidate = { x: c.x + 14, y: c.y - 15, w: 90, h: 32 };
      const collision = occupied.some(o => Math.abs(o.x - candidate.x) < 96 && Math.abs(o.y - candidate.y) < 34);
      const important = c.id === hubId || c.id === current.selected;
      const labelled = important || !collision && (mine.has(c.id) || c.pop >= 7);
      b.classList.toggle('unlabelled', !labelled); if (labelled) occupied.push(candidate);
      b.setAttribute('aria-label', `${pick(c)}${mine.has(c.id) ? tr('，已開航', ', route open') : ''}`);
    }
    dirty = false;
  }
  function path(pts) {
    ctx.beginPath(); let pen = false;
    for (const p of pts) { if (!p.visible) { pen = false; continue; } if (pen) ctx.lineTo(p.x,p.y); else { ctx.moveTo(p.x,p.y); pen = true; } }
  }
  function paint(now) {
    frame = requestAnimationFrame(paint);
    if (destroyed || document.hidden || now - lastFrame < (slow > 60 ? 32 : 15)) return;
    const started = performance.now(); lastFrame = now;
    if (!dirty && !time.speed && !receipts.length) return;
    if (dirty) rebuild();
    ctx.clearRect(0,0,w,h);
    let planeBudget = mobile ? 18 : 48;
    for (const p of projected) {
      const r = p.route, metric = current.metrics[r.city], loss = metric?.profit < 0;
      const color = p.rival ? '#687f99' : loss ? '#b5533c' : '#2f5d8c';
      ctx.strokeStyle = color; ctx.lineWidth = p.rival ? 1 : 1.4 + Math.min(2.6, r.weekly * .13); ctx.globalAlpha = p.rival ? .32 : .8;
      ctx.setLineDash(p.rival ? [4,6] : []); path(p.screen); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      if (p.rival || decorative) continue;
      const count = Math.min(planeBudget, slow > 60 ? 1 : mobile ? 2 : 3, Math.ceil(r.weekly / 5));
      planeBudget -= count;
      for (let i = 0; i < count; i++) {
        const trip = time.elapsed / (11 + p.index * 2.7) + i / count + p.index * .27;
        const part = trip % 1, forward = Math.floor(trip) % 2 === 0, t = forward ? part : 1 - part;
        const pos = project(p.at(t)), next = project(p.at(clamp(t + (forward ? .007 : -.007), 0, 1)));
        if (!pos.visible) continue;
        const heading = Math.atan2(next.y-pos.y,next.x-pos.x) + Math.PI / 2;
        ctx.save();ctx.translate(pos.x,pos.y);ctx.rotate(heading);
        ctx.strokeStyle = 'rgba(255,255,255,.8)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(0,34);ctx.stroke();
        if (sprite.complete && sprite.naturalWidth) { const size = mobile ? 32 : 43; ctx.drawImage(sprite,-size/2,-size/2,size,size); }
        else { ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(7,7);ctx.lineTo(0,4);ctx.lineTo(-7,7);ctx.closePath();ctx.fill(); }
        ctx.restore();
        const key = Math.floor(trip);
        if (p.arrivals[i] !== undefined && key > p.arrivals[i] && time.speed > 0 && metric) {
          const at = project(p.at(forward ? 0 : 1));
          if (at.visible) receipts.push({ ...at, born: now, value: metric.profit / Math.max(1, 2*r.weekly*current.weeks), loss });
        }
        p.arrivals[i] = key;
      }
    }
    if (!decorative) for (const color of [0,1]) {
      ctx.fillStyle=color?'#709ec6':'#1e3550';ctx.globalAlpha=.85;ctx.beginPath();
      for (const c of cities) {
        if (!c.visible || c.id === hubId) continue;
        const metric = current.metrics[c.id]; if (!metric) continue;
        const n = Math.min(16, Math.max(2, Math.ceil(metric.lf * 16))), phase = Math.floor(time.elapsed / 5) % 3;
        for (let i=0;i<n;i++) if(Number(!!(i%4))===color){const x=c.x-10+(i%4)*4.5,y=c.y+15+Math.floor(i/4)*4.5-phase;ctx.moveTo(x+1.4,y);ctx.arc(x,y,1.4,0,Math.PI*2);}
      }
      ctx.fill();ctx.globalAlpha=1;
    }
    receipts = receipts.filter(r => now-r.born < 2400).slice(-6);
    ctx.font='600 11px system-ui';ctx.textAlign='center';
    for (const r of receipts) { const age=(now-r.born)/2400, y=r.y-20-age*22, text=`${r.value>=0?'+':''}${fmtUSD(r.value)}`; const width=ctx.measureText(text).width+14;ctx.globalAlpha=Math.min(1,(1-age)*3);ctx.fillStyle=r.loss?'#a94b38':'#2f6c61';ctx.beginPath();ctx.roundRect(r.x-width/2,y-12,width,22,9);ctx.fill();ctx.fillStyle='#fff';ctx.fillText(text,r.x,y+3); } ctx.globalAlpha=1;
    const ms=performance.now()-started;frameTotal+=ms;paintCount++;if(ms>20)slow++;
  }
  function update(next) {
    current={...current,...next};
    const signature=JSON.stringify([current.routes,current.rivals]);
    if(signature!==cachedSignature){ cachedSignature=signature; paths=[];
      for(const [index,r] of current.routes.entries()) if(CITIES[r.city]) paths.push({route:r,at:curve(hub,CITIES[r.city]),index,arrivals:[]});
      for(const id of current.rivals||[]) if(CITIES[id]) paths.push({route:{city:id,weekly:1},at:curve(hub,CITIES[id]),rival:true});
    }
    dirty=true;
  }
  function resize(){const rect=box.getBoundingClientRect();w=Math.max(1,rect.width);h=Math.max(1,rect.height);renderer.setSize(w,h,false);const dpr=Math.min(devicePixelRatio,1.5);overlay.width=Math.round(w*dpr);overlay.height=Math.round(h*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);dirty=true;}
  const ro=new ResizeObserver(resize);ro.observe(box);resize();
  const pointers=new Map();let pinch=0;
  function down(e){if(e.target.closest('button'))return;canvas.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});}
  function move(e){const p=pointers.get(e.pointerId);if(!p)return;const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
    if(pointers.size===2){const[a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch)view.radius=clamp(view.radius*pinch/d,1.65,4.6);pinch=d;}else{view.lon-=dx*.16;view.lat=clamp(view.lat+dy*.13,-78,78);}dirty=true;}
  function up(e){pointers.delete(e.pointerId);pinch=0;}
  const wheel=e=>{e.preventDefault();view.radius=clamp(view.radius*Math.exp(e.deltaY*.001),1.65,4.6);dirty=true;};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
  const contextLost=e=>{e.preventDefault();canvas.classList.add('context-lost');};canvas.addEventListener('webglcontextlost',contextLost);
  const restore=()=>{dirty=true;};canvas.addEventListener('webglcontextrestored',restore);
  frame=requestAnimationFrame(paint);
  return {update,setTime(next){time=next;},zoomBy(f){view.radius=clamp(view.radius/f,1.65,4.6);dirty=true;},recenter(){view.lat=hub.lat+5;view.lon=hub.lon-5;view.radius=mobile?3.65:3.8;dirty=true;},focus(id){if(!CITIES[id])return;view.lat=(hub.lat+CITIES[id].lat)/2;view.lon=hub.lon+(((CITIES[id].lon-hub.lon+540)%360)-180)/2;dirty=true;},stats(){return{frames:paintCount,meanPaintMs:frameTotal/Math.max(1,paintCount),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,pixelRatio:renderer.getPixelRatio(),planes:current.routes.length};},destroy(){destroyed=true;cancelAnimationFrame(frame);ro.disconnect();for(const mesh of [globe,atmosphere]){mesh.geometry.dispose();mesh.material.dispose();}bm.dispose();mask.dispose();canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',restore);renderer.dispose();renderer.forceContextLoss();canvas.remove();overlay.remove();labels.remove();}};
}
