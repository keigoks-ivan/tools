'use strict';
/* =========================================================
   畫面：Three.js
   ========================================================= */
const canvas=document.getElementById('game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=0.98;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8cc8f0);
scene.fog=new THREE.Fog(0x9fd0f0,700,1600);
const camera=new THREE.PerspectiveCamera(10,1,1,4000);
{ const pm=new THREE.PMREMGenerator(renderer); scene.environment=pm.fromScene(new X3.RoomEnvironment(),0.04).texture; scene.environmentIntensity=0.4; }
scene.add(new THREE.HemisphereLight(0xc8e2ff,0x80614a,0.85));
const sun=new THREE.DirectionalLight(0xffd9a3,2.5);
sun.position.set(-65,75,-95); sun.target.position.set(0,0,-28); scene.add(sun); scene.add(sun.target);
sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.radius=4;
Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:10,far:260}); sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02;
const fill=new THREE.DirectionalLight(0xdfefff,0.6); fill.position.set(40,30,80); scene.add(fill);
const rim=new THREE.DirectionalLight(0xcbe6ff,1.2); rim.position.set(25,50,40); scene.add(rim);
// 後製：景深（背景模糊）
const composer=new X3.EffectComposer(renderer,new THREE.WebGLRenderTarget(1,1,{samples:4,type:THREE.HalfFloatType}));
composer.addPass(new X3.RenderPass(scene,camera));
const bokeh=new X3.BokehPass(scene,camera,{focus:215,aperture:0.00012,maxblur:0.006});
composer.addPass(bokeh); composer.addPass(new X3.OutputPass());
const lam=c=>new THREE.MeshLambertMaterial({color:c});
const shiny=c=>new THREE.MeshPhongMaterial({color:c,shininess:60,specular:0x555555});
const lamS=c=>{const m=lam(c);m.receiveShadow=true;return m;};
function canvasTex(w,h,draw){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return t;}
function noise(g,w,h,n,cols,rmax){for(let i=0;i<n;i++){g.fillStyle=cols[(Math.random()*cols.length)|0];g.fillRect(Math.random()*w,Math.random()*h,1+Math.random()*rmax,1+Math.random()*rmax);}}

buildStadium();

/* =========================================================
   實況野球式角色：圓角方頭，投打角色使用可彎曲的四肢
   零件來自 Blender（tools/build_pawa.py → assets/pawa_parts.glb，內嵌在 pawa_parts.js）
   ========================================================= */
const PARTS={}; window.PAWA.traverse(o=>{ if(o.isMesh) PARTS[o.name]=o; });
function part(name,mat){ const m=new THREE.Mesh(PARTS[name].geometry,mat); m.castShadow=true; m.receiveShadow=true; return m; }
const std=(c,r=0.6,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,...extra});
const gloss=(c,extra={})=>new THREE.MeshPhysicalMaterial({color:c,roughness:0.32,clearcoat:1,clearcoatRoughness:0.06,...extra});
function faceTex(o){
  const t=canvasTex(2048,1024,(g)=>{
    g.scale(2,2); const W=1024,H=512;
    g.fillStyle=o.skin; g.fillRect(0,0,W,H);
    const skinShade=g.createLinearGradient(0,H*0.3,0,H); skinShade.addColorStop(0,'rgba(255,232,203,.22)'); skinShade.addColorStop(0.6,'rgba(255,211,176,0)'); skinShade.addColorStop(1,'rgba(117,57,31,.17)');
    g.fillStyle=skinShade; g.fillRect(0,0,W,H);
    g.fillStyle=o.hair;
    g.fillRect(0,0,W,H*0.33);
    g.fillRect(W*0.25,0,W*0.11,H*0.45); g.fillRect(W*0.64,0,W*0.11,H*0.45);
    g.fillRect(0,0,W*0.3,H*0.64); g.fillRect(W*0.7,0,W*0.3,H*0.64);
    g.beginPath(); g.moveTo(W*0.32,H*0.3);
    for(let i=0;i<=12;i++){ g.lineTo(W*(0.32+0.36*i/12), H*(i%2?0.395:0.335)); }
    g.lineTo(W*0.68,H*0.3); g.closePath(); g.fill();
    g.strokeStyle='rgba(255,225,188,.12)'; g.lineWidth=1.5;
    for(let i=0;i<44;i++){ const x=W*(0.32+0.36*i/44); g.beginPath(); g.moveTo(x-8,H*.23); g.quadraticCurveTo(x+4,H*.3,x,H*(i%2?.385:.325)); g.stroke(); }
    const cx=W*0.5, ey=H*0.56, dx=W*0.056;
    for(const s of [-1,1]){
      const x=cx+s*dx;
      const blush=g.createRadialGradient(x+s*17,ey+55,3,x+s*17,ey+55,42); blush.addColorStop(0,'rgba(190,91,70,.20)'); blush.addColorStop(1,'rgba(190,91,70,0)'); g.fillStyle=blush; g.fillRect(x-45,ey+18,90,78);
      g.strokeStyle=o.hair; g.lineCap='round'; g.lineWidth=o.sharp?13:10;
      g.beginPath(); g.moveTo(x-s*18,ey-56+(o.sharp?6:0)); g.quadraticCurveTo(x+s*5,ey-67,x+s*29,ey-(o.sharp?66:61)); g.stroke();
      g.fillStyle='#80513e'; g.beginPath(); g.ellipse(x,ey+2,31,39,0,0,Math.PI*2); g.fill();
      const white=g.createLinearGradient(0,ey-34,0,ey+34); white.addColorStop(0,'#cbd5e1'); white.addColorStop(.38,'#fffefa'); white.addColorStop(1,'#f1e7d9');
      g.fillStyle=white; g.beginPath(); g.ellipse(x,ey+3,28,35,0,0,Math.PI*2); g.fill();
      const gr=g.createRadialGradient(x,ey+7,3,x,ey+2,34); gr.addColorStop(0,'#120804'); gr.addColorStop(0.55,o.iris); gr.addColorStop(.82,'#b68b55'); gr.addColorStop(1,'#1b1717');
      g.fillStyle=gr; g.beginPath(); g.ellipse(x,ey+2,o.sharp?21:23,o.sharp?29:33,0,0,Math.PI*2); g.fill();
      g.strokeStyle='rgba(242,209,150,.3)'; g.lineWidth=1;
      for(let i=0;i<26;i++){ const a=i/26*Math.PI*2; g.beginPath(); g.moveTo(x+Math.cos(a)*13,ey+3+Math.sin(a)*19); g.lineTo(x+Math.cos(a)*20,ey+3+Math.sin(a)*28); g.stroke(); }
      g.fillStyle='#080302'; g.beginPath(); g.ellipse(x,ey+4,10,15,0,0,Math.PI*2); g.fill();
      g.fillStyle='#fff'; g.beginPath(); g.ellipse(x+s*-6,ey-11,7.5,9,0,0,Math.PI*2); g.fill();
      g.beginPath(); g.ellipse(x+s*7,ey+16,3.5,3.5,0,0,Math.PI*2); g.fill();
      g.strokeStyle='#120a06'; g.lineWidth=o.sharp?12:9;
      g.beginPath(); g.ellipse(x,ey+(o.sharp?9:6),29,o.sharp?34:38,0,Math.PI*1.08,Math.PI*1.92); g.stroke();
      if(o.sharp){ g.fillStyle=o.skin; g.fillRect(x-36,ey-50,72,16); }
    }
    if(o.beard){ g.fillStyle=o.hair; g.globalAlpha=0.35; g.beginPath(); g.ellipse(cx,ey+92,70,34,0,0,Math.PI*2); g.fill();
      for(let i=0;i<90;i++){ const a=i*2.4,r=12+Math.sqrt(i/90)*52; g.fillRect(cx+Math.cos(a)*r,ey+94+Math.sin(a)*r*.42,1.5,3); } g.globalAlpha=1; }
    g.strokeStyle='#965741'; g.lineWidth=3; g.beginPath(); g.moveTo(cx-11,ey+74); g.quadraticCurveTo(cx,ey+79,cx+11,ey+74); g.stroke();
    g.strokeStyle='rgba(255,233,208,.6)'; g.lineWidth=2; g.beginPath(); g.moveTo(cx-8,ey+81); g.lineTo(cx+8,ey+81); g.stroke();
  });
  t.wrapS=THREE.RepeatWrapping; t.flipY=false; return t;
}
const BODY_Y0=0.62, BODY_Y1=2.5;
function uniformTex(o){
  const t=canvasTex(1024,512,(g,W,H)=>{
    const vy=y=>(1-(y-BODY_Y0)/(BODY_Y1-BODY_Y0))*H;
    g.fillStyle=o.base; g.fillRect(0,0,W,H);
    g.fillStyle='rgba(0,0,0,.035)'; for(let x=0;x<W;x+=4) g.fillRect(x,0,1,H);
    const shade=g.createLinearGradient(0,0,0,H); shade.addColorStop(0,'rgba(255,255,255,.12)'); shade.addColorStop(0.65,'rgba(0,0,0,0)'); shade.addColorStop(1,'rgba(0,0,0,.1)');
    g.fillStyle=shade; g.fillRect(0,0,W,H);
    g.fillStyle=o.trim; g.fillRect(0,0,5,vy(1.3)); g.fillRect(W-5,0,5,vy(1.3));
    g.fillRect(W*0.25-4,vy(1.15),8,H); g.fillRect(W*0.75-4,vy(1.15),8,H);
    g.fillRect(0,vy(2.42),W,5);
    g.strokeStyle='rgba(255,255,255,.5)'; g.lineWidth=2; g.setLineDash([3,5]);
    g.beginPath(); g.moveTo(W*0.25+8,0); g.lineTo(W*0.25+8,H); g.moveTo(W*0.75-8,0); g.lineTo(W*0.75-8,H); g.stroke(); g.setLineDash([]);
    g.fillStyle=o.trim; for(let y=vy(2.25);y<vy(1.35);y+=34){ g.beginPath(); g.arc(W*0.02,y,3,0,Math.PI*2); g.fill(); }
    const k=1.35;
    const txt=(t,x,y,size,fill,stroke)=>{ g.save(); g.translate(x,y); g.scale(1,k); g.font=`900 ${size}px "Noto Sans TC",Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle';
      if(stroke){g.lineWidth=size*0.14; g.strokeStyle=stroke; g.strokeText(t,0,0);} g.fillStyle=fill; g.fillText(t,0,0); g.restore(); };
    if(o.num!=='') txt(String(o.num),W*0.5,vy(1.74),128,o.numColor,o.numStroke);
    if(o.name) txt(o.name.toUpperCase(),W*0.5,vy(2.16),o.name.length>8?30:40,o.numColor,o.numStroke);
    if(o.front) txt(o.front,W*0.06,vy(1.98),40,o.numColor,o.numStroke);
  });
  t.wrapS=THREE.RepeatWrapping; t.flipY=false; return t;
}
const contactShadowGeo=new THREE.PlaneGeometry(3.5,2.6);
const capBadgeGeo=new THREE.PlaneGeometry(0.63,0.63);
const limbGeo=new THREE.CylinderGeometry(1,1,1,12), jointGeo=new THREE.SphereGeometry(1,12,8);
const LIMB_UP=new THREE.Vector3(0,1,0);
function limbMesh(geo,mat,parent){ const m=new THREE.Mesh(geo,mat); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
function limbSegment(mesh,a,b,r){ const d=new THREE.Vector3().subVectors(b,a); mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.scale.set(r,Math.max(.001,d.length()),r); mesh.quaternion.setFromUnitVectors(LIMB_UP,d.normalize()); }
function syncLimbs(c){
  if(!c.rig) return;
  c.root.updateMatrixWorld(true);
  const point=(parent,x,y,z)=>c.root.worldToLocal(parent.localToWorld(new THREE.Vector3(x,y,z)));
  c.rig.legs.forEach((l,i)=>{
    const hip=point(c.upper,i?0.44:-0.44,0.94,0), ankle=point(c.feet[i],0,0.22,-0.05);
    const knee=hip.clone().lerp(ankle,.52); knee.z+=.28+Math.max(0,ankle.y-.8)*.3; knee.y+=Math.max(0,ankle.y-hip.y)*.35;
    limbSegment(l.thigh,hip,knee,.23); limbSegment(l.shin,knee,ankle,.19);
    const cuff=ankle.clone().lerp(knee,.38); limbSegment(l.sock,ankle,cuff,.201);
    l.knee.position.copy(knee); l.knee.scale.setScalar(.235);
  });
  c.rig.arms.forEach((a,i)=>{
    const s=i?1:-1, shoulder=point(c.upper,s*.76,2.14,0), hand=point(i?c.hL:c.hR,0,0,0);
    const elbow=shoulder.clone().lerp(hand,.5); elbow.x+=s*.18; elbow.z-=.25;
    limbSegment(a.sleeve,shoulder,shoulder.clone().lerp(elbow,.6),.23);
    limbSegment(a.upper,shoulder,elbow,.17); limbSegment(a.forearm,elbow,hand,.145);
    a.elbow.position.copy(elbow); a.elbow.scale.setScalar(.17);
  });
}
function makePawa(o){
  const root=new THREE.Group(), yaw=new THREE.Group(), upper=new THREE.Group(); root.add(yaw); yaw.add(upper);
  const shadow=new THREE.Mesh(contactShadowGeo,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'varying vec2 vUv; void main(){float a=pow(max(0.0,1.0-length((vUv-0.5)*2.0)),1.5)*0.32;gl_FragColor=vec4(0.04,0.07,0.08,a);}'
  })); shadow.rotation.x=-Math.PI/2; shadow.position.y=0.045; root.add(shadow);
  const skin=std(o.face.skin,0.55);
  upper.add(part('body',new THREE.MeshStandardMaterial({map:uniformTex(o.uni),roughness:0.85})));
  upper.add(part('belt',std(o.uni.belt,0.5)));
  if(o.chestPad) upper.add(part('chest_pad',gloss(o.chestPad,{roughness:0.5,clearcoat:0.4})));
  const head=new THREE.Group(); head.position.y=3.32; upper.add(head);
  const headFace=faceTex(o.face);
  head.add(part('head',new THREE.MeshStandardMaterial({map:headFace,roughness:0.55})));
  head.add(part('ear_L',skin)); head.add(part('ear_R',skin));
  const nose=limbMesh(jointGeo,skin,head); nose.position.set(0,-.27,1.018); nose.scale.set(.1,.12,.075);
  for(const s of [-1,1]){ const inner=limbMesh(jointGeo,std(0xb87860,.75),head); inner.position.set(s*1.223,-.08,.105); inner.scale.set(.055,.14,.055); }
  if(o.cap.helmet){ const m=gloss(o.cap.color); head.add(part('helmet_shell',m)); head.add(part('helmet_brim',m));
    const fl=part('helmet_flap',m); fl.scale.x=o.cap.helmet; head.add(fl); }
  else if(o.cap.catcher){ head.add(part('catcher_shell',gloss(o.cap.color))); head.add(part('mask_cage',std(o.cap.cage||0xb8c0c8,0.3,{metalness:0.8}))); }
  else { const m=std(o.cap.color,0.8); ['cap_crown','cap_brim','cap_button'].forEach(n=>head.add(part(n,m))); }
  if(o.cap.logo){
    const badge=canvasTex(128,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.font='italic 900 66px Rubik,Arial'; g.textAlign='center'; g.textBaseline='middle'; g.lineWidth=5; g.strokeStyle='#ffffff'; g.strokeText(o.cap.logo,w/2,h/2); g.fillStyle=o.cap.ink||'#ffffff'; g.fillText(o.cap.logo,w/2,h/2); });
    const patch=new THREE.Mesh(capBadgeGeo,new THREE.MeshBasicMaterial({map:badge,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    patch.position.set(0,0.52,1.105); head.add(patch);
  }
  const handMat=o.batGlove?std(o.batGlove,0.6):skin;
  const mkGlove=()=>{ const g=new THREE.Group(); g.add(part('glove',gloss(o.glove,{roughness:0.55,clearcoat:0.35}))); g.add(part('glove_lace',std(0x3a1a08,0.6))); return g; };
  const hR=new THREE.Group(), hL=new THREE.Group();
  if(o.glove && o.gloveRight){ hR.add(mkGlove()); const h=part('hand',handMat); h.scale.x=-1; hL.add(h); }
  else { hR.add(part('hand',handMat)); if(o.glove) hL.add(mkGlove()); else { const h=part('hand',handMat); h.scale.x=-1; hL.add(h); } }
  hR.position.set(-1.0,1.45,0.2); hL.position.set(1.0,1.5,0.25);
  yaw.add(hR); yaw.add(hL);
  const shoeM=gloss(o.shoe,{roughness:0.4,clearcoat:0.7}), soleM=std(0xf2f2f2,0.6);
  const feet=[];
  for(const s of [-1,1]){ const f=new THREE.Group(); f.position.set(s*0.48,0.05,0.1); root.add(f); f.add(part('shoe_upper',shoeM)); f.add(part('shoe_sole',soleM)); feet.push(f); }
  let rig=null;
  if(o.articulated){
    upper.position.y=.65; head.position.y=3.15; head.scale.setScalar(.86);
    const cloth=std(o.uni.base,.86), sock=std(o.uni.trim,.82), sleeve=std(o.uni.base,.86);
    rig={legs:feet.map(()=>({thigh:limbMesh(limbGeo,cloth,root),shin:limbMesh(limbGeo,cloth,root),sock:limbMesh(limbGeo,sock,root),knee:limbMesh(jointGeo,cloth,root)})),
      arms:feet.map(()=>({sleeve:limbMesh(limbGeo,sleeve,root),upper:limbMesh(limbGeo,skin,root),forearm:limbMesh(limbGeo,skin,root),elbow:limbMesh(jointGeo,skin,root)}))};
    feet.forEach(f=>{ f.scale.set(1.15,1.1,1); });
  }
  root.scale.setScalar(o.scale||1.35);
  let portrait=null;
  if(o.articulated){
    const p=document.createElement('canvas'); p.width=p.height=128; const g=p.getContext('2d');
    const bg=g.createLinearGradient(0,0,128,128); bg.addColorStop(0,'#769ec2'); bg.addColorStop(1,'#182f4d'); g.fillStyle=bg; g.fillRect(0,0,128,128);
    g.fillStyle=o.face.skin; for(const x of [23,105]){ g.beginPath(); g.ellipse(x,72,8,13,0,0,Math.PI*2); g.fill(); }
    g.save(); g.beginPath(); g.roundRect(25,30,78,85,25); g.clip(); g.fillRect(25,30,78,85); g.drawImage(headFace.image,700,290,650,660,25,30,78,85); g.restore();
    const cap=g.createLinearGradient(0,10,0,48); cap.addColorStop(0,o.cap.color); cap.addColorStop(1,'#10263e'); g.fillStyle=cap;
    g.beginPath(); g.moveTo(21,48); g.quadraticCurveTo(19,8,64,8); g.quadraticCurveTo(109,8,107,48); g.closePath(); g.fill();
    g.fillStyle=o.cap.color; g.beginPath(); g.ellipse(64,47,48,9,0,0,Math.PI*2); g.fill();
    g.fillStyle=o.cap.ink||'#fff'; g.font='italic 900 24px Rubik,Arial'; g.textAlign='center'; g.fillText(o.cap.logo||'',64,36);
    g.strokeStyle='rgba(255,255,255,.3)'; g.lineWidth=2; g.beginPath(); g.moveTo(30,25); g.quadraticCurveTo(43,14,60,14); g.stroke();
    portrait=p.toDataURL('image/png');
  }
  return {root,yaw,upper,head,hR,hL,feet,rig,portrait};
}
function disposeModel(c){
  if(!c) return; c.root.parent&&c.root.parent.remove(c.root);
  c.root.traverse(m=>{ if(m.isMesh){ const mt=m.material; if(mt.map) mt.map.dispose(); mt.dispose(); } });
}
// 每位球員固定的外觀（用 id 當亂數種子）
function seeded(id){ let s=(+id||1)%2147483647; return ()=>((s=s*16807%2147483647)-1)/2147483646; }
const SKINS=['#f4cba3','#efc097','#e3ae84','#d29a6c','#b98057','#986441','#7a4f33'];
function faceFor(pid){
  const P=PLAYERS[pid]||{}, r=seeded(pid);
  if(P.zh) return {skin:'#f3c8a0',hair:'#1c1410',iris:'#4e2c18',sharp:r()<0.5};
  const sk=SKINS[Math.min(SKINS.length-1,Math.floor(Math.pow(r(),1.3)*SKINS.length))];
  const hairs=['#1c1410','#2e2016','#4a3220','#6b4a2a','#a07a46'];
  return {skin:sk,hair:hairs[Math.floor(Math.pow(r(),1.8)*hairs.length)],iris:['#4e2c18','#6a3e24','#3c5a7a','#5a6a3a'][Math.floor(r()*4)],sharp:r()<0.45,beard:r()<0.3};
}
function teamLook(abbr,home){
  const T=TEAM(abbr), [p,s]=T.colors;
  return {uni:{base:home?'#f7f7f5':'#b9bdc3',trim:p,belt:p,numColor:p,numStroke:home?(s==='#000000'?'#ffffff':s):'#ffffff'},cap:p,shoe:p};
}
function playerModel(pid,abbr,home,kind){
  const L=teamLook(abbr,home), P=PLAYERS[pid]||{}, o={face:faceFor(pid),uni:{...L.uni,num:P.num||'',name:P.last||'',front:P.num||''},shoe:L.shoe,articulated:['pit','bat','run'].includes(kind)};
  if(kind==='bat'||kind==='run'){ const side=kind==='bat'?arguments[4]:1; o.cap={color:L.cap,helmet:side}; o.batGlove=TEAM(abbr).colors[1]; }
  else if(kind==='catch'){ o.cap={color:L.cap,catcher:true}; o.glove=0x3a2416; o.chestPad=L.cap; o.scale=1.3; }
  else { o.cap={color:L.cap}; o.glove=0x8b4a1c; if(kind==='pit' && P.throws==='L') o.gloveRight=true; if(kind==='field' && P.throws==='L') o.gloveRight=true; }
  if(!o.cap.catcher){ o.cap.logo=abbr==='LAD'?'LA':abbr==='NYY'?'NY':abbr.slice(0,1); o.cap.ink=TEAM(abbr).colors[1]; }
  return makePawa(o);
}

/* ---------- 場上的人 ---------- */
const C={pitcher:null,batter:null,catcher:null,fielders:{},runners:{},runner:null,ump:null};
const swingYaw=new THREE.Group(), swingElev=new THREE.Group(); swingYaw.add(swingElev);
const woodTex=canvasTex(128,512,(g,w,h)=>{
  g.fillStyle='#c99150'; g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=3){ g.strokeStyle=x%2?'rgba(76,35,12,.25)':'rgba(255,225,165,.3)'; g.beginPath(); g.moveTo(x,0); g.bezierCurveTo(x+5,h*0.3,x-4,h*0.7,x,h); g.stroke(); }
  g.fillStyle='#272e39'; g.fillRect(0,0,w,h*0.23); g.strokeStyle='#636d7a'; for(let y=0;y<h*0.23;y+=8){ g.beginPath(); g.moveTo(0,y); g.lineTo(w,y+10); g.stroke(); }
});
const batMesh=part('bat',new THREE.MeshPhysicalMaterial({map:woodTex,roughness:0.4,clearcoat:0.45})); swingElev.add(batMesh);
C.ump=makePawa({face:{skin:'#e3ae84',hair:'#2e2016',iris:'#4e2c18'},uni:{base:'#1a2540',trim:'#1a2540',belt:'#111',numColor:'#1a2540',num:''},cap:{color:0x15161a,catcher:true,cage:0x222222},shoe:0x111111,scale:1.3});
C.ump.root.position.set(1.0,0,6.6); C.ump.root.rotation.y=Math.PI; C.ump.upper.position.y=-0.3; C.ump.upper.rotation.x=0.3; scene.add(C.ump.root);
const ballTex=canvasTex(512,256,(g,w,h)=>{
  g.fillStyle='#fffdf4'; g.fillRect(0,0,w,h); noise(g,w,h,3500,['#ece9de','#f6f3ea'],1);
  for(const offset of [0.25,0.75]){
    g.strokeStyle='#bf3336'; g.lineWidth=2; g.beginPath();
    for(let y=0;y<=h;y+=2){ const x=w*offset+Math.sin(y/h*Math.PI*2)*w*0.07; y?g.lineTo(x,y):g.moveTo(x,y); } g.stroke();
    for(let y=4;y<h;y+=10){ const x=w*offset+Math.sin(y/h*Math.PI*2)*w*0.07; g.beginPath(); g.moveTo(x-5,y-3); g.lineTo(x+5,y+3); g.stroke(); }
  }
});
const ball=new THREE.Mesh(new THREE.SphereGeometry(0.27,24,16),new THREE.MeshStandardMaterial({map:ballTex,roughness:0.72,emissive:0xfff4d5,emissiveIntensity:0.25}));
ball.castShadow=true; ball.visible=false; scene.add(ball);
const FX=createBaseballEffects(scene,camera,ball,batMesh), SFX=window.BaseballAudio;
const MITT_HOME=new THREE.Vector3(0.25,1.75,1.05);
let BSIDE=-1, PHAND=1;          // 打者站位（-1 右打站三壘側）、投手慣用手（1 右投）

function setBatter(pid){
  const g=GM, br=bat(pid), side=batSide(br,pit(curPitcher(g)))==='R'?-1:1; BSIDE=side;
  if(swingYaw.parent) swingYaw.parent.remove(swingYaw);
  while(swingElev.children.length>1){ const h=swingElev.children[1]; swingElev.remove(h); h.traverse(m=>{ if(m.isMesh) m.material.dispose(); }); }
  disposeModel(C.batter);
  const m=-side;   // 右打 m=1
  const c=playerModel(pid,batting(g).abbr,batting(g)===g.home,'bat',m);
  c.root.position.set(side*3.4,0,0.6); c.root.rotation.y=m*Math.PI/2; scene.add(c.root);
  c.head.rotation.y=m*1.2;
  c.yaw.remove(c.hR); c.yaw.remove(c.hL);
  c.hR.position.set(0,0,0.5); c.hL.position.set(0,0,0.2);
  swingElev.add(c.hR); swingElev.add(c.hL);
  swingYaw.position.set(0,2.0,0.35); c.root.add(swingYaw);
  c.feet[0].position.set(-m*0.92,0.2,m*.42); c.feet[1].position.set(m*0.92,0.2,-m*.42);
  c.feet.forEach(f=>f.rotation.y=-m*Math.PI/2);
  C.batter=c; C.batterM=m; poseBatter(-1,2.4);
}
function setPitcher(pid){
  disposeModel(C.pitcher);
  const f=fielding(GM); PHAND=(PLAYERS[pid]?.throws==='L')?-1:1;
  C.pitcher=playerModel(pid,f.abbr,f===GM.home,'pit');
  C.pitcher.root.position.set(0,0.8,-60.5); scene.add(C.pitcher.root); C.fielders.P=C.pitcher; posePitcher(0);
}
function setDefense(){
  const f=fielding(GM), home=f===GM.home;
  for(const k in C.fielders) if(k!=='P') disposeModel(C.fielders[k]); C.fielders={};
  disposeModel(C.catcher);
  const byPos={}; f.lineup.forEach(l=>byPos[l.pos]=l.id);
  for(const p of POS){
    if(p.k==='P') continue;
    const pid=byPos[p.k]||f.T.bench.find(i=>!Object.values(byPos).includes(i))||f.lineup[0].id;
    if(p.k==='C'){
      const c=playerModel(pid,f.abbr,home,'catch'); c.root.position.set(0,0,3.6); c.root.rotation.y=Math.PI; scene.add(c.root);
      c.upper.position.y=-0.62; c.feet[0].position.set(-0.95,0.2,0.1); c.feet[1].position.set(0.95,0.2,0.1);
      c.hL.position.copy(MITT_HOME); c.hR.position.set(-0.95,1.0,0.5); C.catcher=c; C.fielders.C=c; continue;
    }
    const c=playerModel(pid,f.abbr,home,'field'); c.root.position.set(p.x,0,p.z); c.root.lookAt(0,0,0); c.home={x:p.x,z:p.z}; scene.add(c.root); C.fielders[p.k]=c;
  }
  setPitcher(f.pitcher);
}
const BASE_SPOT=[null,{x:61,z:-60},{x:-2,z:-122},{x:-61,z:-60}];
function setRunners(){
  const g=GM, t=batting(g);
  for(const id in C.runners){ if(!g.bases.includes(+id) && !g.bases.includes(id)) { disposeModel(C.runners[id]); delete C.runners[id]; } }
  g.bases.forEach((id,i)=>{ if(!id) return;
    let c=C.runners[id]; if(!c){ c=playerModel(id,t.abbr,t===g.home,'run',1); scene.add(c.root); C.runners[id]=c; }
    const s=BASE_SPOT[i+1]; c.root.position.set(s.x,0,s.z); c.root.lookAt(0,0,0); runPose(c,0,false); c.root.visible=true; });
}

/* =========================================================
   動作
   ========================================================= */
const ease=t=>t<0?0:t>1?1:t*t*(3-2*t);
const lerp=(a,b,t)=>a+(b-a)*t;
const L3=(a,b,u)=>[lerp(a[0],b[0],u),lerp(a[1],b[1],u),lerp(a[2],b[2],u)];
// 投球關鍵格（右投；左投左右鏡射）：T＝投球手、Gl＝手套手、fS＝跨步腳、fP＝軸心腳
const PK=[
  {t:0.00,yaw:-1.45,lean:0.00,up:[0,0,0],       T:[0,2.0,0.75],     Gl:[0.05,2.1,0.9], fS:[0.55,0.2,0.65], fP:[-0.55,0.2,-0.6]},
  {t:0.28,yaw:-1.65,lean:-0.06,up:[0,0.12,-0.1],T:[0,2.5,0.7],      Gl:[0.05,2.6,0.8], fS:[0.6,1.25,0.3],fP:[-0.55,0.2,-0.6]},
  {t:0.56,yaw:-1.78,lean:-0.12,up:[0,0.25,-0.3],T:[0.1,2.7,0.6],    Gl:[0.1,2.75,0.8], fS:[0.7,2.05,0.2],fP:[-0.55,0.2,-0.6]},
  {t:0.78,yaw:-1.4,lean:0.02,up:[0,-0.1,0.45],  T:[-1.55,2.3,-0.7], Gl:[1.3,2.25,0.9], fS:[0.65,1.1,1.7],fP:[-0.55,0.2,-0.6]},
  {t:0.99,yaw:-0.6,lean:0.24,up:[0,-0.3,1.45],  T:[-1.0,3.5,-0.5],  Gl:[0.9,2,0.65],   fS:[0.6,0.2,2.85],fP:[-0.6,0.3,-0.3]},
  {t:1.08,yaw:-0.2,lean:0.36,up:[0,-0.45,1.8],  T:[-0.65,3.8,0.4],  Gl:[0.65,1.8,0.4], fS:[0.6,0.2,2.85],fP:[-0.65,0.4,-0.1]},
  {t:1.15,yaw:0.1,lean:0.48,up:[0,-0.5,2.0],    T:[-0.4,3.1,1.6],   Gl:[0.5,1.65,0.2], fS:[0.6,0.2,2.85],fP:[-0.65,0.65,0.1]},
  {t:1.34,yaw:0.5,lean:0.72,up:[0,-0.6,2.25],   T:[0.9,1.25,1.3],   Gl:[0.65,1.6,0.1], fS:[0.6,0.2,2.85],fP:[-0.8,1.6,0.9]},
  {t:1.68,yaw:0.3,lean:0.4,up:[0,-0.3,2.25],    T:[0.65,1.1,0.7],   Gl:[0.8,1.65,0.2], fS:[0.6,0.2,2.8],fP:[-0.8,0.65,2.4]},
  {t:2.20,yaw:0,lean:0.05,up:[0,0,2],           T:[-1,1.45,0.2],    Gl:[1,1.5,0.3],    fS:[0.6,0.2,2.5],fP:[-0.6,0.2,2.2]},
];
const RELEASE_T=1.15;
const throwHand=()=>PHAND>0?C.pitcher.hR:C.pitcher.hL;
function posePitcher(t){
  const pc=C.pitcher; if(!pc) return; const m=PHAND;
  let i=0; while(i<PK.length-2 && t>PK[i+1].t) i++;
  const a=PK[i], b=PK[i+1], u=ease((t-a.t)/(b.t-a.t)), mx=v=>[v[0]*m,v[1],v[2]];
  pc.yaw.rotation.y=m*lerp(a.yaw,b.yaw,u);
  pc.yaw.position.set(...L3(a.up,b.up,u));
  pc.upper.rotation.x=lerp(a.lean,b.lean,u);
  pc.head.rotation.y=m*clamp(-lerp(a.yaw,b.yaw,u),0,1.5)*0.92;
  const thr=m>0?pc.hR:pc.hL, glv=m>0?pc.hL:pc.hR, fS=m>0?pc.feet[1]:pc.feet[0], fP=m>0?pc.feet[0]:pc.feet[1];
  thr.position.set(...mx(L3(a.T,b.T,u))); glv.position.set(...mx(L3(a.Gl,b.Gl,u)));
  fS.position.set(...mx(L3(a.fS,b.fS,u))); fP.position.set(...mx(L3(a.fP,b.fP,u)));
  fS.rotation.y = t<0.9? -1.4*m : 0; fP.rotation.y = t<1.0? -1.4*m : 0;
  fS.rotation.x=t>0.55&&t<0.99?-0.35*Math.sin((t-0.55)/0.44*Math.PI):0;
  fP.rotation.x=t>1.1&&t<1.68?0.65*Math.sin((t-1.1)/0.58*Math.PI):0;
  thr.rotation.x=t>0.78?-0.5*Math.sin(clamp((t-0.78)/0.65,0,1)*Math.PI):0;
  pc.upper.rotation.z=-m*0.12*Math.sin(clamp(t/1.6,0,1)*Math.PI);
}
const STANCE={yaw:-1.2,elev:1.0};
function poseBatter(st,cy){
  const c=C.batter; if(!c) return; const m=C.batterM;
  let y,el,tw,stride=0,load=0,settle=0;
  const contactElev=-0.1-(cy-2.4)*0.3;
  const power=G.swing?.mode==='power';
  if(st<0){
    load=G.state==='windup'?ease((G.windT-0.65)/0.5):G.state==='pitch'?1:0;
    const breathe=Math.sin(G.t*2.6)*0.025;
    y=STANCE.yaw-load*0.18; el=STANCE.elev+load*0.12+breathe; tw=-load*0.15;
  }
  else if(st<0.13){ const u=st/0.13, e=u*u*u; y=lerp(STANCE.yaw-0.18,0,e); el=lerp(STANCE.elev+0.12,contactElev,ease(u*1.25)); tw=lerp(-0.15,0.75,ease(u)); stride=ease(u); load=1-u; }
  else if(st<0.42){ const u=clamp((st-0.13)/0.29,0,1), e=1-Math.pow(1-u,3); y=lerp(0,power?3.35:2.95,e); el=lerp(contactElev,power?1.15:0.95,e); tw=lerp(0.75,power?1.55:1.3,e); stride=1; }
  else { settle=ease((st-0.55)/0.45); y=lerp(power?3.35:2.95,STANCE.yaw,settle); el=lerp(power?1.15:0.95,STANCE.elev,settle); tw=lerp(power?1.55:1.3,0,settle); stride=1-settle; }
  swingYaw.rotation.y=m*y; swingElev.rotation.x=-el;
  c.yaw.rotation.y=m*tw*0.55;
  const held=st<0?1:st<.13?1-ease(st/.13):settle;
  swingYaw.position.set(-m*held*.6,2.0+held*.6+(st>=0&&st<0.2?(cy-2.4)*0.22:0),.35+held*.75);
  c.yaw.position.set(-m*load*0.14,-load*0.08,0); c.upper.rotation.z=m*(load*0.07-stride*0.1); c.upper.rotation.x=stride*0.1;
  const front=m>0?c.feet[1]:c.feet[0], rear=m>0?c.feet[0]:c.feet[1];
  front.position.set(m*(0.92+stride*0.48-load*0.1),0.2+load*0.28,-m*.42); rear.position.set(-m*.92,0.2,m*.42);
  front.rotation.y=-m*Math.PI/2+m*tw*0.2; rear.rotation.y=-m*Math.PI/2+m*tw*0.75; rear.rotation.x=stride*0.25;
  c.head.rotation.y=m*(1.2-tw*0.4);
}
function runPose(c,t,moving){
  const s=moving?Math.sin(t*15):0;
  c.feet[0].position.z=0.1+s*0.55; c.feet[1].position.z=0.1-s*0.55;
  c.feet[0].position.y=0.2+Math.max(0,s)*0.35; c.feet[1].position.y=0.2+Math.max(0,-s)*0.35;
  c.hR.position.z=0.2-s*0.5; c.hL.position.z=0.25+s*0.5;
  c.yaw.position.y=moving?Math.abs(Math.cos(t*15))*0.18:0;
}

/* =========================================================
   鏡頭
   ========================================================= */
const CAMS={
  pitch:{pos:new THREE.Vector3(-14,13,-212), look:new THREE.Vector3(-1.5,0.4,0), fov:6.4, fovP:12},
  bat:  {pos:new THREE.Vector3(1.4,6.2,24),  look:new THREE.Vector3(0.2,0.8,-60.5), fov:31, fovP:54},
};
let camMode='pitch';
function camSet(name){
  const c=CAMS[name], fl=name==='pitch'&&BSIDE>0?-1:1, fb=name==='bat'&&BSIDE>0?-1:1;     // 左打時鏡頭換邊
  const portrait=innerWidth/innerHeight<1, center=portrait&&name==='bat';
  camera.position.set(center?0:c.pos.x*fl*fb,c.pos.y,c.pos.z); camera.lookAt(center?0:c.look.x*fl*fb,c.look.y,c.look.z);
  camera.fov=portrait?c.fovP:c.fov; camera.updateProjectionMatrix();
}

/* =========================================================
   HUD
   ========================================================= */
const $=id=>document.getElementById(id);
const ov=$('overlay'), og=ov.getContext('2d');
function resize(){
  const w=innerWidth,h=innerHeight; renderer.setSize(w,h); composer.setSize(w,h); camera.aspect=w/h;
  const dpr=Math.min(devicePixelRatio,2); ov.width=w*dpr; ov.height=h*dpr; ov.style.width=w+'px'; ov.style.height=h+'px'; og.setTransform(dpr,0,0,dpr,0,0);
  if(G.camFixed) camSet(camMode); else camera.updateProjectionMatrix();
}
function project(x,y,z){const v=new THREE.Vector3(x,y,z).project(camera);return [(v.x+1)/2*innerWidth,(1-v.y)/2*innerHeight];}
const gcol=g=>getComputedStyle(document.documentElement).getPropertyValue('--g'+g);
const HEAT_COLORS={hot:'rgba(221,53,66,.50)',warm:'rgba(241,139,148,.42)',lukewarm:'rgba(238,240,249,.22)',cool:'rgba(122,175,255,.42)',cold:'rgba(33,111,238,.50)'};
let heatEnabled=true;
function heatZones(){ return window.BATTING_HOTZONES?.players[curBatter(GM)]||null; }
function setHeatPanel(){
  const data=window.BATTING_HOTZONES, zones=heatZones();
  $('heatName').textContent=dispName(curBatter(GM));
  $('heatGrid').innerHTML=zones?Array.from({length:9},(_,i)=>{
    const z=zones[Math.floor(i/3)*3+2-i%3];
    return `<span style="background:${z?(HEAT_COLORS[z[1]]||HEAT_COLORS.lukewarm):'rgba(255,255,255,.05)'}">${z?z[0].toFixed(3).replace(/^0/,''):'—'}</span>`;
  }).join(''):'<p>暫無熱區資料</p>';
  $('heatSource').textContent=`MLB・${data?.season||2026} 分區打擊率`;
  $('heatSource').href=`https://statsapi.mlb.com/api/v1/people/${curBatter(GM)}/stats?stats=hotColdZones&group=hitting&season=${data?.season||2026}`;
  $('heatSource').title=data?`資料取得：${data.retrieved.slice(0,10)}`:'';
}
$('heatToggle').onclick=()=>{
  heatEnabled=!heatEnabled; $('heatToggle').textContent='打擊熱區：'+(heatEnabled?'開':'關');
  $('heatToggle').setAttribute('aria-pressed',String(heatEnabled)); $('heatDetails').hidden=!heatEnabled;
};
const gl=v=>{const g=grade(v);return `<span class="g" style="color:${gcol(g)}">${g}</span>`};
// 隊色晶片：副色跟主色太接近時改用白字
function hexLum(h){ const n=parseInt(h.slice(1),16), c=[n>>16&255,n>>8&255,n&255].map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)}); return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
function chipText(T){ const [p,s]=T.colors, a=hexLum(p), b=hexLum(s), r=(Math.max(a,b)+.05)/(Math.min(a,b)+.05); return r>=2.6?s:(a>.4?'#10203a':'#ffffff'); }
const chipHTML=(abbr,big,id)=>{const T=TEAM(abbr);return `<span class="chip${big?' big':''}"${id?` id="${id}"`:''} style="background:linear-gradient(180deg,rgba(255,255,255,.28),rgba(255,255,255,0) 50%,rgba(0,0,0,.22)),${T.colors[0]};color:${chipText(T)}">${abbr}</span>`;};
const POS_ZH={P:'投',C:'捕','1B':'一','2B':'二','3B':'三',SS:'游',LF:'左',CF:'中',RF:'右',DH:'指'};
function dispName(pid){ const P=PLAYERS[pid]||{}; return P.zh?P.zh.split('').join(' '):(P.last||P.full||'?'); }
const fmt3=v=>(v||0).toFixed(3).replace(/^0/,'');
function setBanner(pid,isP){
  const P=PLAYERS[pid]||{}, team=isP?fielding(GM):batting(GM);
  $('bChip').outerHTML=chipHTML(team.abbr,true,'bChip');
  $('bNum').textContent=P.num||''; $('bName').textContent=dispName(pid);
  if(isP){ const s=P.p||{}; $('bannerStats').textContent=`防禦率 ${s.era||'-.--'}　${s.ip||0} 局　${s.k||0} 次三振　最快 ${pit(pid).kmh} km/h`; }
  else { const h=P.h||{}; $('bannerStats').textContent=h.pa?`打擊率 ${fmt3(h.avg)}　全壘打 ${h.hr}　長打率 ${fmt3(h.slg)}`:'本季沒有打擊紀錄'; }
}
let bannerTimer=0;
function flashBanner(pid,isP,ms=1800){ setBanner(pid,isP); const b=$('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); clearTimeout(bannerTimer); bannerTimer=setTimeout(()=>b.classList.remove('show'),ms); }
function setCount(){
  for(let i=1;i<=3;i++) $('b'+i).classList.toggle('on',GM.balls>=i);
  for(let i=1;i<=2;i++) $('s'+i).classList.toggle('on',GM.strikes>=i);
  for(let i=1;i<=2;i++) $('o'+i).classList.toggle('on',GM.outs>=i);
}
function setScore(){
  const g=GM, top=g.half==='top';
  $('innN').textContent=g.inning; $('innH').textContent=top?'▲':'▼'; $('innT').textContent=top?'局上':'局下';
  $('tA').className='tm'+(top?' atbat':''); $('tA').innerHTML=`<span class="ab">▶</span>${chipHTML(g.away.abbr)}<span class="pt">${g.away.runs}</span>`;
  $('tH').className='tm'+(top?'':' atbat'); $('tH').innerHTML=`<span class="ab">▶</span>${chipHTML(g.home.abbr)}<span class="pt">${g.home.runs}</span>`;
  ['b1','b2','b3'].forEach((c,i)=>document.querySelector('.dia .'+c).classList.toggle('on',!!g.bases[i]));
  setCount();
}
function setPanels(){
  const g=GM, bid=curBatter(g), br=bat(bid), t=batting(g), l=t.lineup[t.idx%9], h=(PLAYERS[bid]||{}).h||{};
  $('bOrd').textContent=(t.idx%9)+1; $('bNm').textContent=dispName(bid); $('bPos').textContent=POS_ZH[l.pos]||l.pos;
  $('batLine').innerHTML=`<span>彈道<span class="traj">${br.traj}</span></span><span>打擊${gl(br.meet)}</span><span>力量${gl(br.power)}</span><span>跑速${gl(br.speed)}</span>`;
  $('batStat').textContent=h.pa?`本季　打擊率 ${fmt3(h.avg)}　全壘打 ${h.hr}　上壘率 ${fmt3(h.obp)}`:'本季沒有打擊紀錄';
  const f=fielding(g), pid=f.pitcher, pr=pit(pid), pc=f.pc[pid]||0, left=clamp(100-pc/pr.limit*100,3,100);
  $('pNm').textContent=dispName(pid); const role=pid===f.T.rotation[0]||f.usedPen.length===0?'先發':pid===f.T.bullpen[0]?'終結':'中繼';
  $('pRole').textContent=(f.abbr===g.user?'我方':'對手')+'・'+role; $('pRole').title=f.T.zh+'投手';
  $('pitLine').innerHTML=`<span class="kmhv">${pr.kmh}<small>km/h</small></span><span>控球${gl(pr.control)}</span><span>體力${gl(pr.stamina)}</span>`;
  const st=$('stam'); st.style.width=left+'%'; st.className=left<25?'low':left<50?'mid':'';
  $('pcount').innerHTML=`${pc}<small>球</small>`;
  $('pFace').className='face '+(left>50?'happy':left<25?'tired':'');
  for(const [id,c] of [['bFace',C.batter],['pFace',C.pitcher]]){
    const el=$(id); el.classList.toggle('portrait',!!c?.portrait); el.style.backgroundImage=c?.portrait?`url("${c.portrait}")`:''; el.title=nameOf(id==='bFace'?bid:pid);
  }
  $('kTag').textContent=`${batting(g).T.zh}進攻中`;
  setHeatPanel();
}
function say(t){ $('subtitle').textContent=t; }
let callTimer=0;
function showCall(t,cls=''){ const c=$('call'); c.className='call'; void c.offsetWidth; c.innerHTML=`<span class="l1">${t}</span><span class="l2">${t}</span><span class="l3">${t}</span>`; c.className='call show '+cls; clearTimeout(callTimer); callTimer=setTimeout(()=>c.className='call',1200); }
function showPitchLabel(P){ $('pname').textContent=P.p.name+'・變化 '+P.level; $('kmh').textContent=P.kmh; $('plabel').classList.add('show'); }
const PKEYS=['1','2','3','4','5','6','7'];
// 變化方向小箭頭（投手背後看：往右＝往三壘側）
function breakArrow(p,fb,lv){
  if(!fb||p===fb) return `<svg class="ar" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2" fill="#fff"/></svg>`;
  let dx=-(p.px-fb.px), dy=-(p.pz-fb.pz); const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
  const len=4+lv*1.1, x2=12+dx*len, y2=12+dy*len, a=Math.atan2(dy,dx), hx=x2-Math.cos(a)*4, hy=y2-Math.sin(a)*4, nx=-Math.sin(a)*3.4, ny=Math.cos(a)*3.4;
  return `<svg class="ar" viewBox="0 0 24 24"><line x1="12" y1="12" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke="#fff" stroke-width="3" stroke-linecap="round"/><polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${(hx+nx).toFixed(1)},${(hy+ny).toFixed(1)} ${(hx-nx).toFixed(1)},${(hy-ny).toFixed(1)}" fill="#fff"/></svg>`;
}
function buildMenu(){
  if(!GM) return; const pr=pit(curPitcher(GM));
  if(G.sel>=pr.pitches.length) G.sel=0;
  const fb=pr.pitches.find(p=>!pr.brk.some(b=>b.t===p.t));
  const list=pr.pitches.slice(0,7);
  $('pmenu').innerHTML=`<div class="ph"><span>選擇球種</span><span>按 1～${list.length}</span></div>`+list.map((p,i)=>{const b=pr.brk.find(x=>x.t===p.t);
    return `<div class="it${i===G.sel?' on':''}" data-i="${i}" title="${p.name}・變化 ${pr.levels[p.t]}/7・${Math.round(p.mph*1.609)} km/h"><span class="k">${i+1}</span>${breakArrow(p,fb,b?b.lv:0)}${p.name}<span class="lv">${b?`<small>變化</small>${b.lv}`:`<small>球速・變${pr.levels[p.t]}</small>${Math.round(p.mph*1.609)}`}</span></div>`;}).join('');
  $('pmenu').querySelectorAll('.it').forEach(el=>el.onclick=e=>{ G.sel=+el.dataset.i; buildMenu(); e.stopPropagation(); });
}
function lineScoreHTML(){
  const g=GM, n=Math.max(9,g.inning);
  const cell=(t,i)=>{
    const v=t.line[i], cur=!g.over && t===batting(g) && i===g.inning-1;
    if(v!=null) return `<td${cur?' class="cur"':''}>${v}</td>`;
    if(t===g.home && g.over && i===g.inning-1 && g.half==='top') return '<td class="x">X</td>';
    return `<td${cur?' class="cur"':''}></td>`;
  };
  const row=t=>`<tr><th class="tn">${chipHTML(t.abbr)}${t.T.zh}</th>${Array.from({length:n},(_,i)=>cell(t,i)).join('')}<td class="r">${t.runs}</td><td class="h">${t.hits}</td></tr>`;
  return `<table class="ls"><tr><th></th>${Array.from({length:n},(_,i)=>`<th>${i+1}</th>`).join('')}<th class="rh">R</th><th class="rh">H</th></tr>${row(g.away)}${row(g.home)}</table>`;
}

/* =========================================================
   遊戲狀態
   ========================================================= */
let GM=null;
const G={mode:'pitch',state:'intro',t:0,cur:{x:0,y:2.35},tgt:{x:0,y:2.35},sel:0,
  pitch:null,windT:0,relT:0,rel:null,swing:null,decide:null,play:null,waitUntil:0,camFixed:true,abN:0};
const pick=a=>a[(Math.random()*a.length)|0];
function setMode(m){
  G.mode=m; camMode=m; document.body.classList.toggle('mode-bat',m==='bat'); $('pmenu').classList.toggle('show',m==='pitch'); $('touch').classList.toggle('on',true);
  $('tAbtn').textContent=m==='pitch'?'投球':'揮棒'; $('tBbtn').style.display=m==='pitch'?'none':'';
  $('help').innerHTML = (m==='pitch'
    ? '選球種：<kbd>1</kbd>～<kbd>7</kbd>　瞄準：<kbd>滑鼠</kbd>／<kbd>方向鍵</kbd>　投球：<kbd>空白鍵</kbd>'
    : '游標：<kbd>滑鼠</kbd>／<kbd>方向鍵</kbd>　揮棒：<kbd>空白鍵</kbd>　強振：<kbd>X</kbd>')+'<br>跳過打席：<kbd>N</kbd>　模擬到換局：<kbd>M</kbd>';
  buildMenu();
}
function resetPlayers(){
  ball.visible=false; FX.reset(); $('contactReadout').classList.remove('show'); if(C.runner){ disposeModel(C.runner); C.runner=null; }
  if(C.batter) C.batter.root.visible=true;
  for(const k in C.fielders){ if(k==='P'||k==='C') continue; const f=C.fielders[k]; f.root.position.set(f.home.x,0,f.home.z); f.root.lookAt(0,0,0); runPose(f,0,false); }
  posePitcher(0); poseBatter(-1,G.cur.y); if(C.catcher) C.catcher.hL.position.copy(MITT_HOME);
  setRunners();
  G.swing=null; G.decide=null; G.play=null;
}
// 開新的一場
function startGame(away,home,user,spA,spH){
  SFX.unlock(); SFX.setActive(true); SFX.play('start');
  GM=newGame(away,home,user,spA,spH);
  setBoardText(`${TEAM(away).zh} vs ${TEAM(home).zh}`, TEAM(home).venue);
  if(typeof setBoardLineups==='function') setBoardLineups(TEAM(away).abbr,GM.away.lineup.map(l=>nameOf(l.id)),TEAM(home).abbr,GM.home.lineup.map(l=>nameOf(l.id)));
  setDefense(); setupPA(true);
}
// 每個打席開始
function setupPA(first){
  const g=GM;
  const ch=maybeChangePitcher(g);
  if(ch){ setPitcher(ch.next); }
  setBatter(curBatter(g));
  setMode(batting(g).abbr===g.user?'bat':'pitch');
  G.abN=0; resetPlayers(); setScore(); setPanels(); $('plabel').classList.remove('show');
  if(first){ G.state='closeup'; G.closeT=0; G.closeWho=''; document.body.classList.add('cine');
    say(`${TEAM(g.away.abbr).zh}對${TEAM(g.home.abbr).zh}，比賽開始！`); return; }
  G.camFixed=true; camSet(camMode);
  if(ch) { flashBanner(ch.next,true,2200); say(`換投：${nameOf(ch.next)}上場。`); }
  else flashBanner(curBatter(g),false);
  if(!ch) say(`第 ${(batting(g).idx%9)+1} 棒，${nameOf(curBatter(g))}。`);
  if(G.mode==='pitch'){ G.state='aim'; G.tgt={x:0.3,y:2.2}; } else { G.state='ready'; G.waitUntil=G.t+1.4; }
}
function afterCloseup(){
  $('banner').classList.remove('show'); document.body.classList.remove('cine'); G.camFixed=true; camSet(camMode);
  if(G.mode==='pitch'){ G.state='aim'; G.tgt={x:0.3,y:2.2}; } else { G.state='ready'; G.waitUntil=G.t+0.8; }
}
function startWindup(P){
  G.abN++; G.pitch=P; G.windT=0; G.state='windup'; G.swing=null; G.decide=null;
  G.planted=false; FX.resetTrail();
  const f=fielding(GM); f.pc[f.pitcher]=(f.pc[f.pitcher]||0)+1;
  $('plabel').classList.remove('show'); say(G.abN===1?`${nameOf(f.pitcher)}，投了！`:pick(['投了！',`第 ${G.abN} 球——`,'抬腿——']));
  setPanels();
}
function swing(mode){
  if(G.mode!=='bat') return;
  if(!(G.state==='windup'||G.state==='pitch')||G.swing) return;
  G.swing={mode,t0:G.t,done:false};
}
function throwPitch(){
  if(G.mode!=='pitch'||G.state!=='aim') return;
  const pr=pit(curPitcher(GM)), p=pr.pitches[G.sel]||pr.pitches[0];
  startWindup(buildPitch(p,pr,{x:G.cur.x,y:G.cur.y},fatigue(GM)));
}
function endPitch(kind){
  showPitchLabel(G.pitch);
  if(kind==='strike'||kind==='whiff') SFX.play('strike');
  if(kind==='ball'){ GM.balls++; if(GM.balls>=4){ finishPA({kind:'BB',text:'四壞球保送'}); return; } showCall('壞球','blue'); say(pick(['壞球。','偏掉了。','選掉了。'])); }
  else if(kind==='foul'){ if(GM.strikes<2) GM.strikes++; showCall('界外','blue'); say(pick(['界外！','打成界外球。'])); }
  else { GM.strikes++; if(GM.strikes>=3){ finishPA({kind:'K',text:kind==='whiff'?'揮棒落空三振':'站著被三振'}); return; }
    showCall(kind==='whiff'?'揮空':'好球'); say(kind==='whiff'?pick(['揮空！','揮棒落空！']):pick(['好球！','進壘了！'])); }
  setCount(); G.state='between'; G.waitUntil=G.t+1.3;
}
// 打席結束
function finishPA(res,pre){
  const g=GM, inningBefore=g.inning, halfBefore=g.half;
  const runsBefore=batting(g).runs;
  const text=applyResult(g,res,pre);
  const scored=(halfBefore===g.half?batting(g):(halfBefore==='top'?g.away:g.home)).runs-runsBefore;
  G.state='done'; setScore();
  SFX.play(res.kind==='HR'?'homerun':['1B','2B','3B'].includes(res.kind)?'hitResult':['K','OUT'].includes(res.kind)?'out':'select');
  const big={HR:['全壘打','red'],'3B':['三壘安打',''],'2B':['二壘安打',''],'1B':['安打',''],K:['三振',''],OUT:['出局','blue'],BB:['保送','blue']}[res.kind]||['',''];
  if(big[0]) showCall(pre&&pre.note?pre.note:big[0],big[1]);
  say(text+(scored&&res.kind!=='HR'?'':''));
  setTimeout(()=>afterPA(), res.kind==='HR'?2600:1500);
}
function afterPA(){
  const g=GM;
  if(g.over){ endGame(); return; }
  if(g.halfChanged){ g.halfChanged=false; showLineScore(()=>{ setDefense(); setupPA(false); }); return; }
  setupPA(false);
}
function showLineScore(then){
  const g=GM, fin=g.half==='bottom'?[g.inning,'上']:[g.inning-1,'下'];
  $('lsBox').innerHTML=`<div class="lsTitle"><b>${fin[0]}</b> 局${fin[1]}結束<span>攻守交換</span></div>`+lineScoreHTML();
  $('linescore').classList.remove('hide'); G.state='linescore';
  setTimeout(()=>{ $('linescore').classList.add('hide'); then(); },2600);
}
function endGame(){
  const g=GM, a=g.away, h=g.home, win=a.runs>h.runs?a:h, userWon=win.abbr===g.user;
  G.state='result';
  SFX.play('end'); SFX.setActive(false);
  $('rTitle').textContent=userWon?'勝利':'敗戰'; $('rTitle').className=userWon?'':'lose';
  $('rDet').innerHTML=`<span class="tn">${a.T.zh}</span>${chipHTML(a.abbr)}<span class="fs">${a.runs}<em>–</em>${h.runs}</span>${chipHTML(h.abbr)}<span class="tn">${h.T.zh}</span>${g.inning>9?`<span class="ex">延長到第 ${g.inning} 局</span>`:''}`;
  const sc=g.pbp.filter(p=>p.runs>0);
  $('rLog').innerHTML=lineScoreHTML()+`<div class="hl"><div class="hlT">得分過程</div>${sc.length?sc.map(p=>`<div class="e"><span class="in">${p.inning} 局${p.half==='top'?'上':'下'}</span><span>${nameOf(p.batter)}：${p.text.replace(/，得 \d+ 分/,'')}</span><span class="rn">+${p.runs}</span></div>`).join(''):'<div class="none">雙方都沒有得分。</div>'}</div>`;
  $('rTot').textContent=`安打：${a.T.zh} ${a.hits} 支，${h.T.zh} ${h.hits} 支`;
  $('result').classList.remove('hide');
}
// 跳過：電腦代打／代投
function skipPA(){
  if(!GM||!['aim','ready','between'].includes(G.state)) return;
  const r=simPA(GM); G.pitch=r.P; finishPA(r.res);
}
function simHalf(){
  if(!GM||!['aim','ready','between'].includes(G.state)) return;
  const g=GM, inn=g.inning, half=g.half; const lines=[];
  while(!g.over && g.inning===inn && g.half===half){
    maybeChangePitcher(g);
    const bid=curBatter(g), r=simPA(g); lines.push(`${nameOf(bid)}：${applyResult(g,r.res)}`);
  }
  G.state='done'; setScore(); say(lines.slice(-2).join('　'));
  if(g.over){ setTimeout(endGame,600); return; }
  g.halfChanged=false; showLineScore(()=>{ setDefense(); setupPA(false); });
}

/* ---------- 打出去之後 ---------- */
function startPlay(bb,pt){
  const g=GM, br=bat(curBatter(g));
  const sim=simulateBall(pt,bb), res=resolvePlay(sim,bb,br);
  const power=clamp((bb.ev-65)/45,0,1); SFX.play('hit',power); FX.hit(new THREE.Vector3(pt.x,pt.y,pt.z),power);
  if(res.kind==='FOUL'){
    ball.visible=false; G.play=null; FX.resetTrail(); $('contactReadout').classList.remove('show');
    endPitch('foul'); G.waitUntil=G.t+.65; return;
  }
  const pre=advance(g.bases,g.outs,res,curBatter(g));
  G.play={sim,res,pre,t:0,bb,ended:false,look:null,br,gloved:false,bounced:false}; ball.visible=true;
  const readout=$('contactReadout'); readout.innerHTML=`<span>${bb.ev>=100?'強勁擊球':bb.la>45?'高飛球':'擊球'}</span><b>${Math.round(bb.ev*1.609)}<small> km/h</small></b><em>仰角 ${Math.round(bb.la)}°</em>`; readout.classList.add('show');
  const t=batting(g); C.runner=playerModel(curBatter(g),t.abbr,t===g.home,'run',1); scene.add(C.runner.root); C.runner.root.position.set(BSIDE*3,0,0.6); C.runner.root.visible=false;
  G.state='play'; G.camFixed=false; $('plabel').classList.remove('show');
  say(bb.ev>=100?'打到了！強勁的擊球——':bb.la>45?'高高飛起——':'打到了！');
}
const basePath=[BASES.home,BASES.first,BASES.second,BASES.third,BASES.home];
function pathAt(s){ s=clamp(s,0,4); const i=Math.min(Math.floor(s),3), u=s-i, a=basePath[i], b=basePath[i+1]; return {x:lerp(a.x,b.x,u),z:lerp(a.z,b.z,u),dir:Math.atan2(b.x-a.x,b.z-a.z)}; }
function updatePlay(dt){
  const P=G.play; P.t+=dt; const {sim,res}=P, pts=sim.pts, last=pts.length-1;
  if(C.runner){ C.runner.root.visible=P.t>0.34; C.batter.root.visible=P.t<=0.34; }
  const k=Math.min(last,Math.floor(P.t*120)), bp=pts[k];
  const ci=res.idx>=0?res.idx:Infinity, caught=k>=ci;
  if(caught&&res.fielder&&!P.gloved){ P.gloved=true; SFX.play('mitt'); FX.resetTrail(); }
  if(bp.y<0.35&&P.t>0.15&&!P.bounced){ P.bounced=true; SFX.play('bounce'); FX.dust(new THREE.Vector3(bp.x,0.15,bp.z)); }
  if(res.fielder && C.fielders[res.fielder.k] && res.fielder.k!=='C' && res.fielder.k!=='P'){
    const f=C.fielders[res.fielder.k], tg=pts[res.idx], hm=res.fielder;
    const react=hm.inf?0.28:0.42, d=Math.hypot(tg.x-hm.x,tg.z-hm.z), u=clamp((P.t-react)/Math.max(0.01,res.t-react),0,1);
    f.root.position.x=lerp(hm.x,tg.x,u); f.root.position.z=lerp(hm.z,tg.z,u);
    if(u<1&&d>3) f.root.lookAt(tg.x,0,tg.z); runPose(f,P.t,u<1&&d>3);
  }
  if(caught && res.fielder){
    const f=C.fielders[res.fielder.k], tc=pts[ci].t;
    if(res.throwTo && P.t>tc+0.35){
      const B=BASES[res.throwTo], fr=pts[ci], u=clamp((P.t-tc-0.35)/Math.max(0.2,res.throwT-0.5),0,1);
      ball.position.set(lerp(fr.x,B.x,u),3+Math.sin(u*Math.PI)*6,lerp(fr.z,B.z,u));
      if(res.throwTo==='first'){ const fb=C.fielders['1B']; fb.root.position.x=lerp(fb.root.position.x,BASES.first.x-1,0.1); fb.root.position.z=lerp(fb.root.position.z,BASES.first.z+1,0.1); }
      if(u>=1&&!P.ended){ P.ended=true; P.endAt=P.t+0.5; SFX.play('mitt'); }
    } else {
      const wp=new THREE.Vector3(); f.hL.getWorldPosition(wp); ball.position.copy(wp);
      if(!res.throwTo&&!P.ended){ P.ended=true; P.endAt=P.t+0.6; }
    }
  } else {
    ball.position.set(bp.x,Math.max(bp.y,0.2),bp.z);
    if(k>=last&&!P.ended){ P.ended=true; P.endAt=P.t+(res.kind==='HR'?1.2:0.5); }
  }
  // 跑者
  if(P.pre){
    const spd=90/27;
    for(const mv of P.pre.moves){
      const c = mv.from===0 ? C.runner : C.runners[mv.id]; if(!c) continue;
      const dur = mv.from===0 ? P.br.hp1b + Math.max(0,mv.to-1)*(90/P.br.sprint+0.5) : (mv.to-mv.from)*spd;
      const tt=clamp((P.t-0.15)/dur,0,1), s=mv.from+(mv.to-mv.from)*tt, q=pathAt(s);
      c.root.position.x=q.x; c.root.position.z=q.z; c.root.rotation.y=q.dir; runPose(c,P.t,tt<1);
    }
    if(C.runner && !P.pre.moves.some(m=>m.from===0)){ const tt=clamp((P.t-0.15)/P.br.hp1b,0,1), q=pathAt(tt*0.95); C.runner.root.position.x=q.x; C.runner.root.position.z=q.z; C.runner.root.rotation.y=q.dir; runPose(C.runner,P.t,tt<1); }
  }
  const look=new THREE.Vector3(ball.position.x*0.85,Math.min(ball.position.y,60)*0.6,ball.position.z*0.85-10);
  const dist=Math.hypot(ball.position.x,ball.position.z);
  const want=new THREE.Vector3(ball.position.x*0.3, 24+dist*0.12, 50+ball.position.z*0.12);
  camera.fov=lerp(camera.fov>30?40:camera.fov,40,0.08); camera.updateProjectionMatrix();
  camera.position.lerp(want,0.07); P.look=P.look?P.look.lerp(look,0.15):look.clone(); camera.lookAt(P.look);
  if(P.ended && P.t>=P.endAt){
    if(G.state==='play'){ G.state='settle'; finishPA(res,P.pre); }
  }
}

/* =========================================================
   主迴圈
   ========================================================= */
const keys={};
let lastT=performance.now();
const DT_CAP=location.search.includes('slowgpu')?0.25:0.05;
function tick(){
  const now=performance.now(), dt=clamp((now-lastT)/1000,0,DT_CAP); lastT=now;
  if(!window.__frozen) update(dt);
  renderFrame(); requestAnimationFrame(tick);
}
window.__advance=s=>{ window.__frozen=true; for(let i=0;i<Math.round(s*60);i++) update(1/60); renderFrame(); return G.state; };
function update(dt){
  G.t+=dt;
  if(!GM) return;
  const br=bat(curBatter(GM));
  const kx=(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0), ky=(keys.ArrowUp||keys.w?1:0)-(keys.ArrowDown||keys.s?1:0);
  const flip = G.mode==='pitch'?-1:1;
  const aimSpeed=G.mode==='bat'?8.5:4.5;
  G.tgt.x+=kx*flip*aimSpeed*dt; G.tgt.y+=ky*aimSpeed*dt;
  const mx=PLATE_HALF+0.75; G.tgt.x=clamp(G.tgt.x,-mx,mx); G.tgt.y=clamp(G.tgt.y,br.szBot-0.75,br.szTop+0.75);
  const sp=G.mode==='pitch'?14:18, dx=G.tgt.x-G.cur.x, dy=G.tgt.y-G.cur.y, dd=Math.hypot(dx,dy);
  const locked = G.mode==='bat' ? (G.swing && G.t-G.swing.t0<0.4) : !['aim','closeup'].includes(G.state);
  if(!locked){ if(dd>sp*dt){G.cur.x+=dx/dd*sp*dt; G.cur.y+=dy/dd*sp*dt;} else {G.cur.x=G.tgt.x; G.cur.y=G.tgt.y;} }

  if(G.state==='closeup'){
    G.closeT+=dt;
    const who=G.closeT<2.2?'P':'B', t=who==='P'?G.closeT:G.closeT-2.2;
    if(who!==G.closeWho){ G.closeWho=who; setBanner(who==='P'?curPitcher(GM):curBatter(GM),who==='P'); const b=$('banner'); b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }
    const hp=new THREE.Vector3(); (who==='P'?C.pitcher:C.batter).head.getWorldPosition(hp);
    camera.fov=26; camera.updateProjectionMatrix();
    if(who==='P'){ camera.position.set(hp.x-1.4+t*0.25, hp.y+0.3, hp.z+11.5); camera.lookAt(hp.x-0.8,hp.y-0.7,hp.z); }
    else { const s=BSIDE; camera.position.set(hp.x-s*1.2+s*t*0.25, hp.y+0.2, hp.z-11.5); camera.lookAt(hp.x-s*0.9,hp.y-0.6,hp.z); }
    if(G.closeT>4.6) afterCloseup();
  }
  if(G.state==='ready' && G.t>G.waitUntil) startWindup(makePitch(pit(curPitcher(GM)),br,GM.balls,GM.strikes,fatigue(GM)));
  if(G.state==='between' && G.t>G.waitUntil){ resetPlayers(); $('plabel').classList.remove('show');
    if(G.mode==='pitch') G.state='aim'; else { G.state='ready'; G.waitUntil=G.t+0.3; } }
  if(['windup','pitch','between','play','settle'].includes(G.state)||(G.state==='done'&&G.windT>=RELEASE_T&&G.windT<2.2)){ G.windT+=dt; posePitcher(Math.min(G.windT,2.2)); }
  else if(G.state==='aim'||G.state==='ready'){
    posePitcher(0); C.pitcher.yaw.position.y=Math.sin(G.t*2.3)*0.035;
  }
  if(!G.swing) poseBatter(-1,G.cur.y);
  if(G.windT>=0.99&&!G.planted&&G.state==='windup'){
    G.planted=true; const foot=PHAND>0?C.pitcher.feet[1]:C.pitcher.feet[0], wp=new THREE.Vector3(); foot.getWorldPosition(wp); FX.dust(wp); SFX.play('step');
  }
  if(G.state==='windup'){
    const wp=new THREE.Vector3(); throwHand().getWorldPosition(wp); ball.position.copy(wp); ball.visible=G.windT>0.2;
    if(G.windT>=RELEASE_T){
      G.state='pitch'; G.relT=G.t; G.rel={x:wp.x,y:wp.y,z:wp.z};
      SFX.play('pitch');
      if(G.mode==='pitch'){
        G.decide=batterDecide(G.pitch,br,pit(curPitcher(GM)),GM.balls,GM.strikes);
        if(G.decide.swing){ const jit=G.decide.whiff?(Math.random()<.5?-1:1)*rnd(0.05,0.12):gauss()*0.015; G.swing={mode:'ai',t0:G.relT+G.pitch.T-0.13+jit,done:false}; }
      }
    }
  }
  if(G.swing){
    const st=G.t-G.swing.t0; poseBatter(st,G.mode==='bat'?G.cur.y:G.pitch.end.y);
    if(st>=0.02&&!G.swing.sounded){ G.swing.sounded=true; SFX.play('swing'); }
    if(!G.swing.done && st>=0.13){
      G.swing.done=true;
      if(G.state==='pitch'){
        const bpos=pitchPos(G.pitch,1,G.rel);
        if(G.mode==='bat'){
          const bb=contact(br,BSIDE,{x:bpos.x,y:bpos.y},G.cur,G.t-(G.relT+G.pitch.T),G.swing.mode);
          if(bb) startPlay(bb,{x:bpos.x,y:bpos.y,z:0});
        } else if(G.decide && !G.decide.whiff){
          const bb=G.decide.foul?{ev:rnd(55,85),la:rnd(-10,65),spray:(Math.random()<.5?-1:1)*rnd(52,115)}:G.decide.bb;
          startPlay(bb,{x:bpos.x,y:bpos.y,z:0});
        }
      }
    }
  }
  if(G.state==='pitch'){
    const u=(G.t-G.relT)/G.pitch.T, end=pitchPos(G.pitch,1,G.rel);
    const p=pitchPos(G.pitch,Math.min(u,1.065),G.rel); ball.position.set(p.x,p.y,p.z);
    if(u>=0.8 && C.catcher){ const lp=C.catcher.root.worldToLocal(new THREE.Vector3(end.x,end.y,end.z+3.4)); lp.y-=0.4; C.catcher.hL.position.lerp(lp,0.3); }
    if(u>=1.065){
      SFX.play('mitt');
      if(G.swing) endPitch('whiff'); else endPitch(isStrikeFor(br,end.x,end.y)?'strike':'ball');
      if(G.state!=='done' && C.catcher){ const lp=C.catcher.hL.position; ball.visible=G.mode==='pitch'; ball.position.copy(C.catcher.root.localToWorld(lp.clone())); }
    }
  }
  if(G.state==='play'||G.state==='settle') updatePlay(dt);
  FX.update(dt,G.state,G.swing?G.t-G.swing.t0:-1,G.swing?.mode==='power');
}
function renderFrame(){
  [C.pitcher,C.batter,C.runner,...Object.values(C.runners)].forEach(c=>{ if(c&&c.root.visible) syncLimbs(c); });
  $('heatPanel').hidden=!GM||G.mode!=='pitch'||!['aim','windup','pitch','between'].includes(G.state);
  const batView=!['play','settle','done','result','closeup'].includes(G.state)&&G.mode==='bat';
  if(C.catcher) C.catcher.root.visible=!batView; C.ump.root.visible=!batView;
  updateFocus(); composer.render();
  drawOverlay();
}
function updateFocus(){
  let tgt = G.state==='closeup' ? (G.closeWho==='P'?C.pitcher:C.batter).head.getWorldPosition(new THREE.Vector3())
    : (G.state==='play'||G.state==='settle') ? ball.position
    : G.mode==='pitch' ? new THREE.Vector3(BSIDE*1.5,3,0.5) : new THREE.Vector3(0,3,-60);
  bokeh.uniforms.focus.value=camera.position.distanceTo(tgt);
  // 打擊視角幾乎不模糊，關掉景深可以少畫一次整個場景
  bokeh.enabled = !(G.mode==='bat' && !['closeup','play','settle'].includes(G.state));
  bokeh.uniforms.aperture.value = G.state==='closeup'?0.004 : camera.fov<12 ? 0.000018 : (G.state==='play'||G.state==='settle') ? 0.00003 : G.mode==='bat' ? 0.000012 : 0.00004;
}
function drawOverlay(){
  og.clearRect(0,0,innerWidth,innerHeight);
  if(GM) FX.drawTrail(og,project);
  if(!GM || !['ready','windup','pitch','between','aim'].includes(G.state)) return;
  const br=bat(curBatter(GM)), top=br.szTop, bot=br.szBot, hw=PLATE_HALF;
  const a=project(-hw,top,0), b=project(hw,bot,0);
  const L=Math.min(a[0],b[0]), T=Math.min(a[1],b[1]), Wd=Math.abs(b[0]-a[0]), Hd=Math.abs(b[1]-a[1]);
  const corners=(col,len,w)=>{ og.strokeStyle=col; og.lineWidth=w; og.lineCap='round';
    for(const [x,y,sx,sy] of [[L,T,1,1],[L+Wd,T,-1,1],[L,T+Hd,1,-1],[L+Wd,T+Hd,-1,-1]]){ og.beginPath(); og.moveTo(x+sx*len,y); og.lineTo(x,y); og.lineTo(x,y+sy*len); og.stroke(); } };
  if(G.mode==='bat'){
    // 好球帶：淡色 3×3 格＋白色角框
    og.fillStyle='rgba(255,255,255,.06)'; og.fillRect(L,T,Wd,Hd);
    og.strokeStyle='rgba(255,255,255,.28)'; og.lineWidth=1;
    for(let i=1;i<3;i++){ og.beginPath(); og.moveTo(L+Wd*i/3,T); og.lineTo(L+Wd*i/3,T+Hd); og.moveTo(L,T+Hd*i/3); og.lineTo(L+Wd,T+Hd*i/3); og.stroke(); }
    og.strokeStyle='rgba(255,255,255,.55)'; og.lineWidth=1.5; og.strokeRect(L,T,Wd,Hd);
    og.save(); og.shadowColor='rgba(0,0,0,.6)'; og.shadowBlur=4; corners('#fff',Math.min(Wd,Hd)*0.22,3); og.restore();
    // 游標：外圈深色描邊＋亮色環＋半透明面＋芯
    const mode=G.swing?G.swing.mode:(keys.x||keys.Shift)?'power':'meet';
    const cs=cursorSize(br,mode), c=project(G.cur.x,G.cur.y,0), ex=project(G.cur.x+cs.rx,G.cur.y,0), ey=project(G.cur.x,G.cur.y+cs.ry,0);
    const rx=Math.abs(ex[0]-c[0]), ry=Math.abs(ey[1]-c[1]), pw=mode==='power';
    og.save(); og.translate(c[0],c[1]);
    const gr=og.createRadialGradient(0,-ry*0.3,1,0,0,Math.max(rx,ry));
    gr.addColorStop(0,pw?'rgba(255,170,120,.55)':'rgba(255,245,170,.55)'); gr.addColorStop(1,pw?'rgba(255,80,30,.32)':'rgba(255,200,20,.3)');
    og.fillStyle=gr; og.beginPath(); og.ellipse(0,0,rx,ry,0,0,Math.PI*2); og.fill();
    og.lineWidth=5; og.strokeStyle='rgba(40,20,0,.55)'; og.stroke();
    og.lineWidth=2.5; og.strokeStyle=pw?'#ff6a2a':'#ffd21a'; og.stroke();
    og.beginPath(); og.ellipse(0,0,rx*0.3,ry*0.3,0,0,Math.PI*2); og.fillStyle=pw?'rgba(235,60,15,.85)':'rgba(255,150,0,.85)'; og.fill();
    og.lineWidth=1.5; og.strokeStyle='rgba(255,255,255,.85)'; og.stroke();
    og.restore();
  } else {
    const zones=heatEnabled?heatZones():null;
    if(zones){
      og.save();
      zones.forEach((z,i)=>{
        if(!z) return;
        const col=i%3,row=Math.floor(i/3), x=-hw+col*hw*2/3, y=top-row*(top-bot)/3;
        const p=[project(x,y,0),project(x+hw*2/3,y,0),project(x+hw*2/3,y-(top-bot)/3,0),project(x,y-(top-bot)/3,0)];
        og.fillStyle=HEAT_COLORS[z[1]]||HEAT_COLORS.lukewarm; og.beginPath(); og.moveTo(...p[0]); p.slice(1).forEach(v=>og.lineTo(...v)); og.closePath(); og.fill();
      });
      og.strokeStyle='rgba(255,255,255,.5)'; og.lineWidth=1;
      for(let i=1;i<3;i++){ og.beginPath(); og.moveTo(L+Wd*i/3,T); og.lineTo(L+Wd*i/3,T+Hd); og.moveTo(L,T+Hd*i/3); og.lineTo(L+Wd,T+Hd*i/3); og.stroke(); }
      og.restore();
    }
    og.save(); og.shadowColor='rgba(0,0,0,.5)'; og.shadowBlur=3;
    og.strokeStyle='rgba(255,110,210,.55)'; og.lineWidth=1.2; og.strokeRect(L,T,Wd,Hd);
    corners('#ff7fd8',Math.min(Wd,Hd)*0.25,2.2); og.restore();
    if(G.state==='aim'){
      const c=project(G.cur.x,G.cur.y,0), r=Math.max(6,Wd*0.12);
      og.save(); og.shadowColor='#ff4fc0'; og.shadowBlur=8;
      og.strokeStyle='#ff4fc0'; og.lineWidth=2.5; og.beginPath(); og.arc(c[0],c[1],r,0,Math.PI*2); og.stroke();
      og.restore();
      og.fillStyle='#ffe066'; og.beginPath(); og.arc(c[0],c[1],r*0.35,0,Math.PI*2); og.fill();
      og.strokeStyle='#fff'; og.lineWidth=1.5; og.beginPath(); og.moveTo(c[0]-r*1.7,c[1]); og.lineTo(c[0]-r*1.15,c[1]); og.moveTo(c[0]+r*1.15,c[1]); og.lineTo(c[0]+r*1.7,c[1]);
      og.moveTo(c[0],c[1]-r*1.7); og.lineTo(c[0],c[1]-r*1.15); og.moveTo(c[0],c[1]+r*1.15); og.lineTo(c[0],c[1]+r*1.7); og.stroke();
    }
  }
}

/* ---------- 輸入 ---------- */
const ray=new THREE.Raycaster(), plane=new THREE.Plane(new THREE.Vector3(0,0,1),0), hit=new THREE.Vector3();
function aimAt(cx,cy){ const m=new THREE.Vector2(cx/innerWidth*2-1,-(cy/innerHeight)*2+1); ray.setFromCamera(m,camera); if(ray.ray.intersectPlane(plane,hit)){ G.tgt.x=hit.x; G.tgt.y=hit.y; } }
addEventListener('mousemove',e=>{ if(G.camFixed) aimAt(e.clientX,e.clientY); });
canvas.addEventListener('mousedown',e=>{ if(G.mode==='pitch'){ if(e.button===0) throwPitch(); } else { if(e.button===0) swing('meet'); else if(e.button===2) swing('power'); } });
addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(['SELECT','INPUT'].includes(e.target.tagName)||e.target.closest('.sound-controls,.heat-panel')) return;
  const k=e.key.length===1?e.key.toLowerCase():e.key; keys[k]=true;
  if(k===' '){ e.preventDefault(); G.mode==='pitch'?throwPitch():swing('meet'); }
  if(k==='x'||k==='k') swing('power');
  if(k==='n') skipPA();
  if(k==='m') simHalf();
  const pi=PKEYS.indexOf(k); if(pi>=0 && G.mode==='pitch' && GM && pi<pit(curPitcher(GM)).pitches.length){ G.sel=pi; buildMenu(); }
});
addEventListener('keyup',e=>{ const k=e.key.length===1?e.key.toLowerCase():e.key; keys[k]=false; });
let touchLast=null;
canvas.addEventListener('touchstart',e=>{ const t=e.touches[0]; touchLast={x:t.clientX,y:t.clientY}; e.preventDefault(); },{passive:false});
canvas.addEventListener('touchmove',e=>{ const t=e.touches[0]; if(touchLast){ const f=G.mode==='pitch'?-0.02:0.02; G.tgt.x+=(t.clientX-touchLast.x)*f; G.tgt.y-=(t.clientY-touchLast.y)*Math.abs(f); } touchLast={x:t.clientX,y:t.clientY}; e.preventDefault(); },{passive:false});
const tap=(id,fn)=>{ $(id).addEventListener('touchstart',e=>{e.preventDefault();fn();}); $(id).addEventListener('click',fn); };
tap('tAbtn',()=>G.mode==='pitch'?throwPitch():swing('meet'));
tap('tBbtn',()=>swing('power'));
$('skipBtn').onclick=skipPA; $('simBtn').onclick=simHalf;

/* ---------- 選隊畫面 ---------- */
const SEL={user:'DET',opp:'LAD',userHome:false,spUser:null,spOpp:null};
function teamGrid(id,key){
  const el=$(id);
  el.innerHTML=TEAMS.slice().sort((a,b)=>a.zh.localeCompare(b.zh,'zh-Hant')).map(t=>`<button data-a="${t.abbr}" class="${SEL[key]===t.abbr?'on':''}" style="--tc:${t.colors[0]};--tc2:${chipText(t)}"><b>${t.abbr}</b>${t.zh}</button>`).join('');
  el.querySelectorAll('button').forEach(b=>b.onclick=()=>{ SEL[key]=b.dataset.a; if(SEL.user===SEL.opp){ SEL[key==='user'?'opp':'user']=TEAMS.find(t=>t.abbr!==SEL[key]).abbr; } refreshSelect(); });
}
function spOptions(abbr,id){
  const T=TEAM(abbr), key=id==='spUser'?'spUser':'spOpp';
  if(!T.rotation.includes(SEL[key])) SEL[key]=T.rotation[0];
  const gg=v=>`<span class="gg" style="color:${gcol(grade(v))}">${grade(v)}</span>`;
  $(id).innerHTML=T.rotation.map(pid=>{const pr=pit(pid), s=PLAYERS[pid]?.p||{};
    return `<button class="spc${SEL[key]===pid?' on':''}" data-p="${pid}"><span class="nm">${nameOf(pid)}<span class="hd">${pr.hand==='L'?'左投':'右投'}</span></span>`+
      `<span class="rt">${pr.kmh} km　控球${gg(pr.control)}體力${gg(pr.stamina)}</span>`+
      `<span class="ps">防禦率 <em>${s.era||'-.--'}</em>・${pr.pitches.slice(0,4).map(p=>p.name).join('、')}</span></button>`;}).join('');
  $(id).querySelectorAll('.spc').forEach(b=>b.onclick=()=>{ SEL[key]=+b.dataset.p; spOptions(abbr,id); });
}
function lineupPreview(abbr){
  const T=TEAM(abbr), side={R:'右打',L:'左打',S:'兩打'};
  return T.lineup.map((l,i)=>{ const br=bat(l.id), m=grade(br.meet), p=grade(br.power);
    return `<div class="r"><span class="o">${i+1}</span><span class="p">${POS_ZH[l.pos]||l.pos}</span><span class="n">${nameOf(l.id)}<small>${side[br.bats]||''}</small></span><span class="gs"><span style="color:${gcol(m)}">${m}</span><span style="color:${gcol(p)}">${p}</span></span></div>`; }).join('');
}
function teamHead(abbr){ const T=TEAM(abbr); return `<span class="hdT">${chipHTML(abbr)}<span class="tname">${T.zh}</span><span class="venue">${T.venue}</span></span>`; }
function refreshSelect(){
  teamGrid('gridUser','user'); teamGrid('gridOpp','opp');
  $('hdUser').innerHTML=teamHead(SEL.user); $('hdOpp').innerHTML=teamHead(SEL.opp);
  spOptions(SEL.user,'spUser'); spOptions(SEL.opp,'spOpp');
  $('luUser').innerHTML=lineupPreview(SEL.user); $('luOpp').innerHTML=lineupPreview(SEL.opp);
  $('homeSel').querySelectorAll('button').forEach(b=>b.classList.toggle('on',(b.dataset.h==='1')===SEL.userHome));
  $('dateNote').textContent=`打序取自兩隊最後一場例行賽（${TEAM(SEL.user).lineupDate.slice(5).replace('-','/')}、${TEAM(SEL.opp).lineupDate.slice(5).replace('-','/')}），名字右邊兩個字母是打擊和力量。`;
}
$('homeSel').querySelectorAll('button').forEach(b=>b.onclick=()=>{ SEL.userHome=b.dataset.h==='1'; refreshSelect(); });
document.querySelectorAll('#diffSel button').forEach(b=>b.onclick=()=>{ document.querySelectorAll('#diffSel button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); diff=DIFF[b.dataset.d]; });
$('start').onclick=()=>{
  $('start').blur();
  $('intro').classList.add('hide');
  const away=SEL.userHome?SEL.opp:SEL.user, home=SEL.userHome?SEL.user:SEL.opp;
  const spA=SEL.userHome?SEL.spOpp:SEL.spUser, spH=SEL.userHome?SEL.spUser:SEL.spOpp;
  startGame(away,home,SEL.user,spA,spH);
};
$('again').onclick=()=>{ $('result').classList.add('hide'); $('start').onclick(); };
$('toMenu').onclick=()=>{ $('result').classList.add('hide'); $('intro').classList.remove('hide'); G.state='intro'; SFX.setActive(false); FX.reset(); $('contactReadout').classList.remove('show'); };
document.querySelector('.tcard').addEventListener('click',e=>{ if(e.target.closest('button')&&e.target.closest('button').id!=='start') SFX.play('select'); });

refreshSelect(); camSet('pitch');
addEventListener('resize',resize); resize();
requestAnimationFrame(tick);

// 測試用參數：?game=DET-LAD&skip=1
const QS=new URLSearchParams(location.search);
if(QS.has('game')){ const [a,h]=QS.get('game').split('-'); $('intro').classList.add('hide'); startGame(a,h,QS.get('user')||a); if(QS.has('skip')) G.closeT=99; }
window.__G=G; window.__GM=()=>GM;
