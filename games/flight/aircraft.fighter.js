import { createAviationSurfaceKit } from './aviation-materials.js?v=20261005';

// MQ-16: original, unarmed F-16-class single-seat mesh. Metres, nose -Z.
// The wheel contact plane is -2 m, matching PROFILES.fighter.gearHeight.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const RAD = Math.PI / 180;
function disposeTree(root, textures = []) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}
function kit(THREE, root) {
  const mesh = (g, m, p = [0, 0, 0], parent = root) => { const o = new THREE.Mesh(g, m); o.position.set(...p); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const box = (size, m, p, parent) => mesh(new THREE.BoxGeometry(...size), m, p, parent);
  const rod = (a, b, r, m, parent) => {
    const av = new THREE.Vector3(...a), bv = new THREE.Vector3(...b), d = bv.clone().sub(av);
    const o = mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), m, av.clone().add(bv).multiplyScalar(.5).toArray(), parent);
    o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
  };
  const slab = (points, thickness, m, parent = root) => {
    const shape = new THREE.Shape(); points.forEach(([x, z], i) => i ? shape.lineTo(x, z) : shape.moveTo(x, z)); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: .025, bevelThickness: .015, bevelSegments: 1, steps: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, thickness / 2, 0); return mesh(g, m, [0, 0, 0], parent);
  };
  const loft = (rings, m) => {
    const pos = [], uv = [], indices = [], n = 48;
    rings.forEach(([z, rx, ry, cy], j) => {
      for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; pos.push(Math.sin(t) * rx, cy + Math.cos(t) * ry, z); uv.push(i / n, j / (rings.length - 1)); }
    });
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + n + 1; indices.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals();
    return mesh(g, m);
  };
  return { mesh, box, rod, slab, loft };
}
export function createFighterAircraft(THREE) {
  const group = new THREE.Group(); group.name = 'MQ-16 Peregrine';
  const K = kit(THREE, group), finish = createAviationSurfaceKit(THREE);
  const paint = finish.apply(new THREE.MeshStandardMaterial({ color: 0x899397, roughness: .56, metalness: .36 }), 'paint', { repeat: [3, 6], bumpScale: .009 });
  const lower = paint.clone(); lower.color.setHex(0xb0b5b4);
  const dark = new THREE.MeshStandardMaterial({ color: 0x20282b, roughness: .63, metalness: .3 });
  const metal = finish.apply(new THREE.MeshStandardMaterial({ color: 0x747e81, roughness: .34, metalness: .86 }), 'brushed', { bumpScale: .005 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101417, roughness: .95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x827d58, roughness: .06, metalness: .05, transparent: true, opacity: .34, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  // Radome, broad shoulder/chines and taper to the single exhaust.
  K.loft([[-7.53,.015,.015,0],[-6.8,.28,.30,0],[-5.9,.49,.45,0],[-5.15,.62,.53,0]], dark);
  K.loft([[-5.15,.62,.53,0],[-3.8,.74,.58,0],[-2,.82,.67,-.02],[0,.80,.66,-.02],[2.7,.72,.63,0],[5.3,.59,.54,0],[6.7,.53,.48,0],[6.9,.51,.46,0]], paint);
  // Narrow painted radome seam and pitot probe.
  K.rod([0,0,-7.53],[0,0,-7.83],.013,metal);
  const canopy = K.mesh(new THREE.SphereGeometry(1, 40, 24), glass, [0,.61,-3.25]); canopy.scale.set(.57,.65,1.43);
  for (const z of [-4.52,-1.98]) {
    const frame = K.mesh(new THREE.TorusGeometry(.56,.026,8,36,Math.PI), dark, [0,.58,z]); frame.scale.y = 1.1;
  }
  K.rod([-.56,.5,-4.5],[-.56,.5,-1.98],.027,dark); K.rod([.56,.5,-4.5],[.56,.5,-1.98],.027,dark);
  K.box([.40,.68,.50], dark, [0,.58,-2.95]); K.box([.30,.16,.32], rubber, [0,.96,-2.75]);
  const suit = finish.apply(new THREE.MeshStandardMaterial({color:0x505844,roughness:.94}), 'fabric');
  const helmetMaterial = new THREE.MeshStandardMaterial({color:0xb1b4a9,roughness:.51,metalness:.08});
  const visorMaterial = new THREE.MeshPhysicalMaterial({color:0x171f22,roughness:.14,metalness:.35,clearcoat:1});
  const torso=K.mesh(new THREE.SphereGeometry(1,18,14),suit,[0,.57,-3.19]);torso.scale.set(.24,.32,.19);
  const helmet=K.mesh(new THREE.SphereGeometry(1,24,18),helmetMaterial,[0,.97,-3.30]);helmet.scale.set(.16,.19,.17);
  const visor=K.mesh(new THREE.SphereGeometry(1,24,14),visorMaterial,[0,1.0,-3.435]);visor.scale.set(.135,.078,.065);
  const mask=K.mesh(new THREE.SphereGeometry(1,14,12),dark,[0,.91,-3.45]);mask.scale.set(.075,.055,.05);
  for(const sign of [-1,1]) { K.rod([sign*.18,.68,-3.13],[sign*.28,.45,-3.42],.064,suit);K.rod([sign*.11,.78,-3.33],[sign*.10,.35,-3.40],.019,dark); }
  K.rod([.025,.9,-3.48],[.11,.43,-3.48],.017,rubber);
  // Ventral intake: rim and recessed throat; inlet faces forward, not an external pod.
  const inlet = K.mesh(new THREE.TorusGeometry(.47,.085,12,40), lower, [0,-.63,-2.82]); inlet.scale.set(1.23,.84,1);
  const throat = K.mesh(new THREE.CircleGeometry(.47,40), dark, [0,-.63,-2.78]); throat.rotation.y = Math.PI; throat.scale.set(1.2,.8,1);
  const duct = K.mesh(new THREE.SphereGeometry(1,28,16), lower, [0,-.65,-.7]); duct.scale.set(.57,.40,2.0);
  const ailerons = [], stabilators = [];
  for (const sign of [-1,1]) {
    const wing = K.slab([[sign*.68,-1.65],[sign*4.86,1.48],[sign*4.86,2.58],[sign*.70,2.52]], .11, paint); wing.position.y = -.02;
    K.slab([[sign*.58,-4.8],[sign*1.42,-1.15],[sign*.82,.6]], .09, paint).position.y = .05;
    const hinge = new THREE.Group(); hinge.position.set(sign*3.15,-.015,2.35); group.add(hinge);
    K.slab([[sign*-1.20,-.1],[sign*1.45,-.05],[sign*1.35,.52],[sign*-1.15,.42]],.065,lower,hinge); ailerons.push({hinge,sign});
    const tail = new THREE.Group(); tail.position.set(sign*.56,.12,5.4); group.add(tail);
    K.slab([[0,-1.3],[sign*2.7,.0],[sign*2.4,1.18],[0,1.15]],.085,paint,tail); stabilators.push({tail,sign});
    const ventral = K.slab([[0,0],[.72,1.3],[0,1.65]], .06, dark); ventral.rotation.z = sign*1.25; ventral.position.set(sign*.5,-.4,4.4);
    // Wingtip rail and position lights; no weapon stores.
    K.rod([sign*4.87,-.01,1.2],[sign*4.87,-.01,2.95],.06,dark);
    const navMat = new THREE.MeshBasicMaterial({ color: sign < 0 ? 0xff3428 : 0x49ff98, toneMapped: false });
    K.mesh(new THREE.SphereGeometry(.05,8,8),navMat,[sign*4.92,.035,2.2]);
    // Panel lines and fasteners along the upper wing.
    K.rod([sign*1.12,.085,-.55],[sign*4.45,.085,1.78],.008,dark);
    K.rod([sign*1.1,.08,2.12],[sign*4.45,.08,2.22],.008,dark);
    for (let i=0;i<7;i++) K.mesh(new THREE.SphereGeometry(.012,6,4),metal,[sign*(1.3+i*.4),.09,.25+i*.2]);
  }
  const fin = K.slab([[0,0],[2.8,-1.0],[2.7,1.0],[.1,2.55]], .12, paint); fin.rotation.z = Math.PI/2; fin.position.set(0,.38,3.58);
  const markingTextures = [];
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width=256;canvas.height=384;
    const c=canvas.getContext('2d');
    if(c) { c.fillStyle='#29383a';c.textAlign='center';c.font='bold 72px ui-monospace, monospace';c.fillText('MQ',128,100);c.font='bold 64px ui-monospace, monospace';c.fillText('016',128,188);c.fillRect(36,215,184,5);c.font='20px ui-monospace, monospace';c.fillText('PEREGRINE',128,255);
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;markingTextures.push(texture);
      const label=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
      for(const sign of [-1,1]){const decal=K.mesh(new THREE.PlaneGeometry(1.0,1.45),label,[sign*.085,1.75,4.53]);decal.rotation.y=sign*Math.PI/2;decal.castShadow=false;}
    }
  }
  const rudder = K.box([.07,1.65,.36],lower,[0,1.45,5.52]); rudder.rotation.x = -.08;
  // Metallic nozzle petals, soot recess and a restrained two-layer afterburner flame.
  const nozzle = K.mesh(new THREE.CylinderGeometry(.48,.55,.62,40,1,true),metal,[0,0,7.08]); nozzle.rotation.x = Math.PI/2;
  const recess = K.mesh(new THREE.CircleGeometry(.45,40),dark,[0,0,6.72]);
  for (let i=0;i<18;i++) { const t=i/18*Math.PI*2; const petal=K.box([.065,.028,.60],metal,[Math.sin(t)*.50,Math.cos(t)*.50,7.02]); petal.rotation.z=-t; }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9432, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const flame = K.mesh(new THREE.ConeGeometry(.40,3.0,32,1,true),flameMat,[0,0,8.65]); flame.rotation.x = Math.PI/2; flame.castShadow=false;
  const coreMat = flameMat.clone(); coreMat.color.setHex(0xb8caff); coreMat.opacity=.65;
  const core = K.mesh(new THREE.ConeGeometry(.25,1.8,24,1,true),coreMat,[0,0,8.0]); core.rotation.x=Math.PI/2; core.castShadow=false;
  const gears = [];
  for (const [x,z,r] of [[0,-3.0,.24],[-1.1,.7,.34],[1.1,.7,.34]]) {
    const leg=new THREE.Group(); group.add(leg); gears.push(leg);
    K.rod([x*.45,-.40,z],[x,-1.60,z+.15],.055,metal,leg);
    K.rod([x*.45,-.60,z+.6],[x,-1.55,z+.15],.033,metal,leg);
    const wheel=K.mesh(new THREE.CylinderGeometry(r,r,.18,20),rubber,[x,-2+r,z+.15],leg); wheel.rotation.z=Math.PI/2;
    const hub=K.mesh(new THREE.CylinderGeometry(r*.45,r*.45,.19,16),metal,[x,-2+r,z+.15],leg); hub.rotation.z=Math.PI/2;
    K.box([.24,.62,.035],lower,[x,-.82,z+.2],leg);
  }
  const brakes=[];
  for(const sign of [-1,1]) { const p=new THREE.Group(); p.position.set(sign*.46,.30,5.85);group.add(p);K.box([.34,.055,.9],lower,[sign*.10,0,0],p);brakes.push({p,sign}); }
  function update(state = {}, data = {}) {
    const gear = clamp(state.gearPosition ?? 1,0,1); gears.forEach(g => { g.visible=gear>.02;g.scale.y=Math.max(.03,gear); });
    const roll=state.angularVelocity?.z||0, pitch=state.angularVelocity?.x||0;
    ailerons.forEach(({hinge,sign})=>{hinge.rotation.x=clamp(sign*roll*.18+(state.flapPosition||0)*.08,-.5,.5);});
    stabilators.forEach(({tail,sign})=>{tail.rotation.x=clamp(-pitch*.45+sign*roll*.05,-.4,.4);});
    rudder.rotation.y=clamp((state.angularVelocity?.y||0)*.7,-.35,.35);
    brakes.forEach(({p,sign})=>{p.rotation.z=state.spoilers?sign*.65:0;});
    const ab=state.afterburnerLevel||0, flicker=.96+.04*Math.sin((state.elapsed||0)*41);
    flame.visible=core.visible=ab>.03;flame.scale.y=core.scale.y=Math.max(.03,ab*flicker);
    flameMat.opacity=.38*ab;coreMat.opacity=.65*ab;
    recess.material=ab>.03?coreMat:dark;
  }
  update();return {group,update,dispose:()=>{disposeTree(group,markingTextures);finish.dispose();}};
}

// Cockpit is attached to the camera; HUD pitch ladder moves with world attitude,
// while its flight-path marker uses velocity in aircraft body coordinates.
export function createFighterCockpit(THREE, options = {}) {
  const group = new THREE.Group(); group.name='MQ-16 single-seat cockpit'; group.group=group;
  const K=kit(THREE,group),finish=createAviationSurfaceKit(THREE),textures=[];
  const panel=finish.apply(new THREE.MeshStandardMaterial({color:0x30393b,emissive:0x101718,emissiveIntensity:.8,roughness:.72,metalness:.18}),'paint',{bumpScale:.003});
  const metal=new THREE.MeshStandardMaterial({color:0x616c6e,roughness:.4,metalness:.8});
  const black=new THREE.MeshStandardMaterial({color:0x0e1517,emissive:0x060b0c,roughness:.85});
  const cloth=finish.apply(new THREE.MeshStandardMaterial({color:0x454b37,roughness:.95}),'fabric');
  K.box([1.12,.38,.45],panel,[0,-.58,-1.65]);
  K.box([.65,.10,.5],black,[0,-.40,-1.65]);
  for(const sign of [-1,1]) {
    K.box([.28,.3,1.55],panel,[sign*.57,-.95,.0]);
    K.rod([sign*.57,-.48,-1.45],[sign*.57,-.50,1.35],.022,panel);
    // The one-piece bubble canopy leaves the forward view free of pillars.
    K.rod([sign*.57,-.48,-1.45],[sign*.78,-.18,-.30],.020,panel);
    for(let i=0;i<7;i++) { K.box([.035,.03,.075],metal,[sign*.58,-.77,-.65+i*.15]); }
    for(let i=0;i<5;i++) K.mesh(new THREE.CylinderGeometry(.014,.014,.02,8),black,[sign*.42+i*sign*.033,-.635,-.91]);
  }
  K.box([.43,.70,.21],cloth,[0,-.48,.50]);K.box([.45,.10,.50],cloth,[0,-.98,.35]);
  K.box([.32,.18,.16],black,[0,-.02,.47]);
  for(const sign of [-1,1]) K.rod([sign*.15,-.1,.35],[sign*.10,-.85,.19],.018,black);
  const stick=K.rod([.54,-.76,.05],[.54,-.54,-.02],.028,black); K.box([.09,.11,.06],black,[.54,-.52,-.03]);
  const throttle=K.box([.10,.05,.10],metal,[-.57,-.75,-.20]);
  // HUD combiner has a lightly tinted edge and no opaque background.
  const combiner=K.mesh(new THREE.PlaneGeometry(.88,.70),new THREE.MeshBasicMaterial({color:0x69d7a6,transparent:true,opacity:.025,depthWrite:false,side:THREE.DoubleSide}),[0,.015,-1.33]);
  for(const sign of [-1,1]) K.rod([sign*.35,-.54,-1.0],[sign*.42,-.34,-1.34],.011,metal);
  function screen(width,height,w,h,x,y,z) {
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return null;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace; textures.push(texture);
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false});
    const plane=K.mesh(new THREE.PlaneGeometry(w,h),material,[x,y,z]);plane.castShadow=false;plane.receiveShadow=false;
    return {canvas,ctx,texture,plane};
  }
  const hud=screen(1024,768,.91,.68,0,.015,-1.32);
  const displays=[];
  for(const sign of [-1,1]) { K.box([.31,.29,.05],black,[sign*.33,-.61,-1.43]);const s=screen(384,384,.25,.23,sign*.33,-.61,-1.39);if(s)displays.push({s,sign}); }
  // MFD bezel keys and the small upfront control display remain physical cockpit parts.
  for(const sign of [-1,1]) {
    for(let i=0;i<4;i++) for(const edge of [-1,1]) K.box([.025,.018,.025],panel,[sign*.33-.10+i*.066,-.61+edge*.13,-1.38]);
    for(let i=0;i<3;i++) for(const edge of [-1,1]) K.box([.018,.025,.025],panel,[sign*.33+edge*.142,-.69+i*.08,-1.38]);
    for(const edge of [-1,1]) K.mesh(new THREE.SphereGeometry(.019,10,8),metal,[sign*.33+edge*.135,-.77,-1.39]);
  }
  K.box([.24,.20,.045],black,[0,-.62,-1.43]);
  const upfront=screen(384,256,.20,.15,0,-.62,-1.395);
  let lastDraw=-Infinity;
  function update(state={},data={}) {
    const hudWidth = clamp((data.cockpitAspect || 1.78) / .72, .45, 1);
    combiner.scale.x = hudWidth; if (hud) hud.plane.scale.x = hudWidth;
    const t=state.elapsed||0;stick.rotation.x=clamp((state.angularVelocity?.x||0)*.25,-.2,.2);throttle.position.z=-.05-(state.throttle||0)*.3;
    if(t>=lastDraw && t-lastDraw<1/15)return; lastDraw=t;
    if(hud) {
      const c=hud.ctx,w=1024,h=768;c.clearRect(0,0,w,h);c.strokeStyle=c.fillStyle='#8dffc3';c.lineWidth=2.2;c.font='25px ui-monospace, monospace';
      const text=(s,x,y,align='left')=>{c.textAlign=align;c.fillText(s,x,y);};const line=(x,y,a,b)=>{c.beginPath();c.moveTo(x,y);c.lineTo(a,b);c.stroke();};
      const pitch=data.pitch||0,roll=(data.roll||0)*RAD;
      // Fixed boresight and roll/pitch compensated ladder, clipped to the glass.
      line(479,370,500,370);line(524,370,545,370);line(512,354,512,366);
      c.save();c.translate(512,370);c.rotate(-roll);c.beginPath();c.rect(-270,-215,540,430);c.clip();
      for(let degrees=-90;degrees<=90;degrees+=5) {const y=(pitch-degrees)*11;if(Math.abs(y)>215)continue;c.setLineDash(degrees<0?[10,8]:[]);const outer=degrees===0?230:140,inner=45;line(-outer,y,-inner,y);line(inner,y,outer,y);c.setLineDash([]);if(degrees!==0){text(String(degrees),-outer-12,y+7,'right');text(String(degrees),outer+12,y+7);} }
      c.restore();
      const velocity=new THREE.Vector3(state.velocity?.x||0,state.velocity?.y||0,state.velocity?.z||0);
      const q=new THREE.Quaternion(state.quaternion?.x||0,state.quaternion?.y||0,state.quaternion?.z||0,state.quaternion?.w??1);velocity.applyQuaternion(q.invert());
      const front=-velocity.z;if(front>5){const x=512+clamp(Math.atan2(velocity.x,front)*630,-240,240),y=370-clamp(Math.atan2(velocity.y,front)*630,-195,195);c.beginPath();c.arc(x,y,12,0,Math.PI*2);c.stroke();line(x-31,y,x-12,y);line(x+12,y,x+31,y);line(x,y-12,x,y-27);}
      const speed=Math.round((data.indicatedAirspeed||0)*1.943844),alt=Math.round(((data.altitude||0)+(options.altitudeOffset||0))*3.28084);
      c.strokeRect(35,323,135,57);c.strokeRect(835,323,160,57);text(String(speed),102,363,'center');text(alt.toLocaleString('en-US'),915,363,'center');
      text('IAS',102,308,'center');text('FT',915,308,'center');text(`M ${(data.mach||0).toFixed(2)}`,35,442);text(`${(data.gLoad??1).toFixed(1)} G`,35,480);text(`AOA ${(data.aoa||0).toFixed(1)}`,35,518);
      text(`${Math.round((data.verticalSpeed||0)*196.85)} FPM`,990,442,'right');text(`RAD ${Math.round((data.agl||0)*3.28084)}`,990,480,'right');
      const heading=((data.heading||0)+(options.headingOffset||0)+360)%360;text(String(Math.round(heading)%360).padStart(3,'0'),512,92,'center');line(512,106,512,119);
      for(let d=-30;d<=30;d+=10){const x=512+d*7;line(x,124,x,138);text(String(Math.round((heading+d+360)%360)).padStart(3,'0'),x,164,'center');}
      text(data.landingAssist?'ASSIST · LAND':state.autopilot?.enabled?'AP · HDG / ALT':'NAV · MANUAL',512,647,'center');text(state.gear?'GEAR DN':'GEAR UP',35,605);
      text((state.afterburnerLevel||0)>.05?'AB LIT':state.afterburner?'AB ARMED':'MIL / DRY',990,605,'right');
      if(data.stallWarning||data.gLimitWarning){c.fillStyle='#ffbf70';text(data.stallWarning?'AOA / LOW SPEED':'G LIMIT',512,226,'center');}
      hud.texture.needsUpdate=true;
    }
    if(upfront) { const c=upfront.ctx;c.fillStyle='#06100e';c.fillRect(0,0,384,256);c.fillStyle='#c4d8b2';c.font='27px ui-monospace, monospace';c.fillText('UFC  /  NAV',22,40);c.fillText(`HDG ${String(Math.round(((data.heading||0)+(options.headingOffset||0)+360)%360)).padStart(3,'0')}`,22,95);c.fillText(`SPD ${Math.round((data.indicatedAirspeed||0)*1.943844)}`,22,145);c.fillText(data.landingAssist?'ASSIST LAND':state.autopilot?.enabled?'AP ENGAGED':'MANUAL',22,205);upfront.texture.needsUpdate=true; }
    for(const {s,sign} of displays){const c=s.ctx;c.fillStyle='#05100e';c.fillRect(0,0,384,384);c.strokeStyle=c.fillStyle='#8ac9a0';c.lineWidth=2;c.font='24px ui-monospace, monospace';
      c.strokeRect(8,8,368,368);c.fillText(sign<0?'NAV / ILS':'ENGINE / STATUS',25,45);
      if(sign<0){c.beginPath();c.moveTo(192,80);c.lineTo(192,325);c.moveTo(90,270);c.lineTo(295,270);c.stroke();const off=clamp((data.localizer||0)*22,-100,100);c.strokeRect(175+off,165,34,90);c.fillText(`LOC ${(data.localizer||0).toFixed(1)}`,25,352);}
      else{c.fillText(`N1 ${Math.round(data.engineN1||20)} %`,30,100);c.fillText(`FUEL ${Math.round(state.fuel||0)} KG`,30,150);c.fillText('UNARMED',30,205);c.fillText('FBW  +9 / -3 G',30,255);c.fillText('SPD BRK '+(state.spoilers?'EXT':'RET'),30,310);}s.texture.needsUpdate=true;
    }
  }
  group.update=update;group.dispose=()=>{disposeTree(group,textures);finish.dispose();};update();return group;
}
