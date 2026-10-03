'use strict';
/* =========================================================
   畫面：Three.js
   ========================================================= */
const canvas=document.getElementById('game');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
const scene=new THREE.Scene();
scene.background=new THREE.Color(0x8cc8f0);
scene.fog=new THREE.Fog(0x9fd0f0,700,1600);
const camera=new THREE.PerspectiveCamera(10,1,1,4000);
{ const pm=new THREE.PMREMGenerator(renderer); scene.environment=pm.fromScene(new X3.RoomEnvironment(),0.04).texture; scene.environmentIntensity=0.55; }
scene.add(new THREE.HemisphereLight(0xdff0ff,0x7a6a50,1.1));
const sun=new THREE.DirectionalLight(0xfff3e0,2.6);
sun.position.set(-35,90,-70); sun.target.position.set(0,0,-28); scene.add(sun); scene.add(sun.target);
sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.radius=4;
Object.assign(sun.shadow.camera,{left:-48,right:48,top:48,bottom:-48,near:10,far:260}); sun.shadow.bias=-0.0004; sun.shadow.normalBias=0.02;
const fill=new THREE.DirectionalLight(0xdfefff,0.6); fill.position.set(40,30,80); scene.add(fill);
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
   實況野球式角色：圓角方頭、沒有手臂和腿、浮空的手和鞋
   零件來自 Blender（tools/build_pawa.py → assets/pawa_parts.glb，內嵌在 pawa_parts.js）
   ========================================================= */
const PARTS={}; window.PAWA.traverse(o=>{ if(o.isMesh) PARTS[o.name]=o; });
function part(name,mat){ const m=new THREE.Mesh(PARTS[name].geometry,mat); m.castShadow=true; m.receiveShadow=true; return m; }
const std=(c,r=0.6,extra={})=>new THREE.MeshStandardMaterial({color:c,roughness:r,...extra});
const gloss=(c,extra={})=>new THREE.MeshPhysicalMaterial({color:c,roughness:0.32,clearcoat:1,clearcoatRoughness:0.06,...extra});
function faceTex(o){
  const t=canvasTex(1024,512,(g,W,H)=>{
    g.fillStyle=o.skin; g.fillRect(0,0,W,H);
    g.fillStyle=o.hair;
    g.fillRect(0,0,W,H*0.33);
    g.fillRect(W*0.25,0,W*0.11,H*0.45); g.fillRect(W*0.64,0,W*0.11,H*0.45);
    g.fillRect(0,0,W*0.3,H*0.64); g.fillRect(W*0.7,0,W*0.3,H*0.64);
    g.beginPath(); g.moveTo(W*0.32,H*0.3);
    for(let i=0;i<=12;i++){ g.lineTo(W*(0.32+0.36*i/12), H*(i%2?0.395:0.335)); }
    g.lineTo(W*0.68,H*0.3); g.closePath(); g.fill();
    const cx=W*0.5, ey=H*0.56, dx=W*0.05;
    for(const s of [-1,1]){
      const x=cx+s*dx;
      g.strokeStyle=o.hair; g.lineCap='round'; g.lineWidth=o.sharp?13:10;
      g.beginPath(); g.moveTo(x-s*18,ey-56+(o.sharp?6:0)); g.quadraticCurveTo(x+s*5,ey-67,x+s*29,ey-(o.sharp?66:61)); g.stroke();
      g.fillStyle='#fff'; g.beginPath(); g.ellipse(x,ey+1,27,35,0,0,Math.PI*2); g.fill();
      const gr=g.createLinearGradient(0,ey-34,0,ey+34); gr.addColorStop(0,'#120804'); gr.addColorStop(0.5,o.iris); gr.addColorStop(1,'#e0a874');
      g.fillStyle=gr; g.beginPath(); g.ellipse(x,ey+2,o.sharp?21:23,o.sharp?29:33,0,0,Math.PI*2); g.fill();
      g.fillStyle='#080302'; g.beginPath(); g.ellipse(x,ey+4,10,15,0,0,Math.PI*2); g.fill();
      g.fillStyle='#fff'; g.beginPath(); g.ellipse(x+s*-6,ey-11,7.5,9,0,0,Math.PI*2); g.fill();
      g.beginPath(); g.ellipse(x+s*7,ey+16,3.5,3.5,0,0,Math.PI*2); g.fill();
      g.strokeStyle='#120a06'; g.lineWidth=o.sharp?12:9;
      g.beginPath(); g.ellipse(x,ey+(o.sharp?9:6),29,o.sharp?34:38,0,Math.PI*1.08,Math.PI*1.92); g.stroke();
      if(o.sharp){ g.fillStyle=o.skin; g.fillRect(x-36,ey-50,72,16); }
    }
    if(o.beard){ g.fillStyle=o.hair; g.globalAlpha=0.55; g.beginPath(); g.ellipse(cx,ey+92,70,34,0,0,Math.PI*2); g.fill(); g.globalAlpha=1; }
    g.strokeStyle='#a0604a'; g.lineWidth=3; g.beginPath(); g.moveTo(cx-8,ey+74); g.quadraticCurveTo(cx,ey+76,cx+8,ey+74); g.stroke();
  });
  t.wrapS=THREE.RepeatWrapping; t.flipY=false; return t;
}
const BODY_Y0=0.62, BODY_Y1=2.5;
function uniformTex(o){
  const t=canvasTex(1024,512,(g,W,H)=>{
    const vy=y=>(1-(y-BODY_Y0)/(BODY_Y1-BODY_Y0))*H;
    g.fillStyle=o.base; g.fillRect(0,0,W,H);
    g.fillStyle=o.trim; g.fillRect(0,0,5,vy(1.3)); g.fillRect(W-5,0,5,vy(1.3));
    g.fillRect(W*0.25-4,vy(1.15),8,H); g.fillRect(W*0.75-4,vy(1.15),8,H);
    g.fillRect(0,vy(2.42),W,5);
    const k=1.35;
    const txt=(t,x,y,size,fill,stroke)=>{ g.save(); g.translate(x,y); g.scale(1,k); g.font=`900 ${size}px "Noto Sans TC",Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle';
      if(stroke){g.lineWidth=size*0.14; g.strokeStyle=stroke; g.strokeText(t,0,0);} g.fillStyle=fill; g.fillText(t,0,0); g.restore(); };
    if(o.num!=='') txt(String(o.num),W*0.5,vy(1.74),128,o.numColor,o.numStroke);
    if(o.name) txt(o.name.toUpperCase(),W*0.5,vy(2.16),o.name.length>8?30:40,o.numColor,o.numStroke);
    if(o.front) txt(o.front,W*0.06,vy(1.98),40,o.numColor,o.numStroke);
  });
  t.wrapS=THREE.RepeatWrapping; t.flipY=false; return t;
}
function makePawa(o){
  const root=new THREE.Group(), yaw=new THREE.Group(), upper=new THREE.Group(); root.add(yaw); yaw.add(upper);
  const skin=std(o.face.skin,0.55);
  upper.add(part('body',new THREE.MeshStandardMaterial({map:uniformTex(o.uni),roughness:0.85})));
  upper.add(part('belt',std(o.uni.belt,0.5)));
  if(o.chestPad) upper.add(part('chest_pad',gloss(o.chestPad,{roughness:0.5,clearcoat:0.4})));
  const head=new THREE.Group(); head.position.y=3.32; upper.add(head);
  head.add(part('head',new THREE.MeshStandardMaterial({map:faceTex(o.face),roughness:0.55})));
  head.add(part('ear_L',skin)); head.add(part('ear_R',skin));
  if(o.cap.helmet){ const m=gloss(o.cap.color); head.add(part('helmet_shell',m)); head.add(part('helmet_brim',m));
    const fl=part('helmet_flap',m); fl.scale.x=o.cap.helmet; head.add(fl); }
  else if(o.cap.catcher){ head.add(part('catcher_shell',gloss(o.cap.color))); head.add(part('mask_cage',std(o.cap.cage||0xb8c0c8,0.3,{metalness:0.8}))); }
  else { const m=std(o.cap.color,0.8); ['cap_crown','cap_brim','cap_button'].forEach(n=>head.add(part(n,m))); }
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
  root.scale.setScalar(o.scale||1.35);
  return {root,yaw,upper,head,hR,hL,feet};
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
  const L=teamLook(abbr,home), P=PLAYERS[pid]||{}, o={face:faceFor(pid),uni:{...L.uni,num:P.num||'',name:P.last||'',front:P.num||''},shoe:L.shoe};
  if(kind==='bat'||kind==='run'){ const side=kind==='bat'?arguments[4]:1; o.cap={color:L.cap,helmet:side}; o.batGlove=TEAM(abbr).colors[1]; }
  else if(kind==='catch'){ o.cap={color:L.cap,catcher:true}; o.glove=0x3a2416; o.chestPad=L.cap; o.scale=1.3; }
  else { o.cap={color:L.cap}; o.glove=0x8b4a1c; if(kind==='pit' && P.throws==='L') o.gloveRight=true; if(kind==='field' && P.throws==='L') o.gloveRight=true; }
  return makePawa(o);
}

/* ---------- 場上的人 ---------- */
const C={pitcher:null,batter:null,catcher:null,fielders:{},runners:{},runner:null,ump:null};
const swingYaw=new THREE.Group(), swingElev=new THREE.Group(); swingYaw.add(swingElev);
const batMesh=part('bat',gloss(0x2a1a10,{roughness:0.35})); swingElev.add(batMesh);
C.ump=makePawa({face:{skin:'#e3ae84',hair:'#2e2016',iris:'#4e2c18'},uni:{base:'#1a2540',trim:'#1a2540',belt:'#111',numColor:'#1a2540',num:''},cap:{color:0x15161a,catcher:true,cage:0x222222},shoe:0x111111,scale:1.3});
C.ump.root.position.set(1.0,0,6.6); C.ump.root.rotation.y=Math.PI; C.ump.upper.position.y=-0.3; C.ump.upper.rotation.x=0.3; scene.add(C.ump.root);
const ball=new THREE.Mesh(new THREE.SphereGeometry(0.27,16,12),new THREE.MeshBasicMaterial({color:0xffffff}));
ball.castShadow=true; ball.visible=false; scene.add(ball);
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
  c.feet[0].position.set(-m*0.85,0.2,0.15); c.feet[1].position.set(m*0.85,0.2,0.15);
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
  {t:0.00,yaw:-1.45,lean:0.00,up:[0,0,0],     T:[0,2.0,0.75],    Gl:[0.05,2.1,0.9],  fS:[0,0.2,0.65],  fP:[0,0.2,-0.6]},
  {t:0.45,yaw:-1.55,lean:-0.08,up:[0,0.1,-0.1],T:[0,2.35,0.6],    Gl:[0.05,2.45,0.75],fS:[0.15,1.55,0.15],fP:[0,0.2,-0.6]},
  {t:0.80,yaw:-1.25,lean:0.05,up:[0,-0.1,0.5], T:[-1.45,2.7,-0.4],Gl:[1.1,2.35,0.4],  fS:[0.1,0.7,1.7],  fP:[0,0.2,-0.6]},
  {t:1.02,yaw:-0.35,lean:0.30,up:[0,-0.45,1.6],T:[-0.9,3.4,0.0],  Gl:[0.85,1.95,0.6], fS:[0.2,0.2,2.7],  fP:[-0.3,0.2,-0.2]},
  {t:1.15,yaw: 0.05,lean:0.45,up:[0,-0.5,2.0], T:[-0.55,3.0,1.45],Gl:[0.6,1.75,0.4],  fS:[0.2,0.2,2.7],  fP:[-0.35,0.3,0.1]},
  {t:1.45,yaw: 0.40,lean:0.62,up:[0,-0.55,2.3],T:[0.8,1.15,1.0],  Gl:[0.7,1.6,0.2],   fS:[0.2,0.2,2.7],  fP:[-0.5,1.0,0.6]},
  {t:2.20,yaw: 0.00,lean:0.05,up:[0,0,2.0],    T:[-1.0,1.45,0.2], Gl:[1.0,1.5,0.3],   fS:[0.5,0.2,2.5],  fP:[-0.55,0.2,2.2]},
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
}
const STANCE={yaw:-2.05,elev:0.75};
function poseBatter(st,cy){
  const c=C.batter; if(!c) return; const m=C.batterM;
  let y,el,tw,stride=0;
  const contactElev=-0.1-(cy-2.4)*0.3;
  if(st<0){ y=STANCE.yaw; el=STANCE.elev; tw=0; }
  else if(st<0.13){ const u=st/0.13, e=u*u; y=lerp(STANCE.yaw,0,e); el=lerp(STANCE.elev,contactElev,Math.min(1,u*1.3)); tw=e*0.7; stride=u; }
  else { const u=Math.min(1,(st-0.13)/0.22), e=1-(1-u)*(1-u); y=lerp(0,3.0,e); el=lerp(contactElev,0.95,e); tw=lerp(0.7,1.3,e); stride=1; }
  swingYaw.rotation.y=m*y; swingElev.rotation.x=-el;
  c.yaw.rotation.y=m*tw*0.55;
  swingYaw.position.y=2.0+(st>=0&&st<0.2?(cy-2.4)*0.22:0);
  c.feet[1].position.x=m*(0.85+stride*0.4); c.feet[0].rotation.y=-m*Math.PI/2+m*tw*0.6;
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
  pitch:{pos:new THREE.Vector3(-14,13,-212), look:new THREE.Vector3(-1.5,1.6,0), fov:6.4, fovP:12},
  bat:  {pos:new THREE.Vector3(1.4,7.2,21),  look:new THREE.Vector3(0.2,1.0,-150), fov:34, fovP:56},
};
let camMode='pitch';
function camSet(name){
  const c=CAMS[name], fl=name==='pitch'&&BSIDE>0?-1:1, fb=name==='bat'&&BSIDE>0?-1:1;     // 左打時鏡頭換邊
  camera.position.set(c.pos.x*fl*fb,c.pos.y,c.pos.z); camera.lookAt(c.look.x*fl*fb,c.look.y,c.look.z);
  camera.fov=innerWidth/innerHeight<1?c.fovP:c.fov; camera.updateProjectionMatrix();
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
  $('pNm').textContent=dispName(pid); $('pRole').textContent=pid===f.T.rotation[0]||f.usedPen.length===0?'先發':pid===f.T.bullpen[0]?'終結':'中繼';
  $('pitLine').innerHTML=`<span class="kmhv">${pr.kmh}<small>km/h</small></span><span>控球${gl(pr.control)}</span><span>體力${gl(pr.stamina)}</span>`;
  const st=$('stam'); st.style.width=left+'%'; st.className=left<25?'low':left<50?'mid':'';
  $('pcount').innerHTML=`${pc}<small>球</small>`;
  $('pFace').className='face '+(left>50?'happy':left<25?'tired':'');
  $('kTag').textContent=`${batting(g).T.zh}進攻中`;
}
function say(t){ $('subtitle').textContent=t; }
let callTimer=0;
function showCall(t,cls=''){ const c=$('call'); c.className='call'; void c.offsetWidth; c.innerHTML=`<span class="l1">${t}</span><span class="l2">${t}</span><span class="l3">${t}</span>`; c.className='call show '+cls; clearTimeout(callTimer); callTimer=setTimeout(()=>c.className='call',1200); }
function showPitchLabel(P){ $('pname').textContent=P.p.name; $('kmh').textContent=P.kmh; $('plabel').classList.add('show'); }
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
    return `<div class="it${i===G.sel?' on':''}" data-i="${i}"><span class="k">${i+1}</span>${breakArrow(p,fb,b?b.lv:0)}${p.name}<span class="lv">${b?`<small>變化</small>${b.lv}`:`<small>球速</small>${Math.round(p.mph*1.609)}`}</span></div>`;}).join('');
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
  ball.visible=false; if(C.runner){ disposeModel(C.runner); C.runner=null; }
  if(C.batter) C.batter.root.visible=true;
  for(const k in C.fielders){ if(k==='P'||k==='C') continue; const f=C.fielders[k]; f.root.position.set(f.home.x,0,f.home.z); f.root.lookAt(0,0,0); runPose(f,0,false); }
  posePitcher(0); poseBatter(-1,G.cur.y); if(C.catcher) C.catcher.hL.position.copy(MITT_HOME);
  setRunners();
  G.swing=null; G.decide=null; G.play=null;
}
// 開新的一場
function startGame(away,home,user,spA,spH){
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
  const pre=res.kind==='FOUL'?null:advance(g.bases,g.outs,res,curBatter(g));
  G.play={sim,res,pre,t:0,bb,ended:false,look:null,br}; ball.visible=true;
  if(res.kind==='FOUL') G.play.foul=true;
  else { const t=batting(g); C.runner=playerModel(curBatter(g),t.abbr,t===g.home,'run',1); scene.add(C.runner.root); C.runner.root.position.set(BSIDE*3,0,0.6); C.batter.root.visible=false; }
  G.state='play'; G.camFixed=false; $('plabel').classList.remove('show');
  say(bb.ev>=100?'打到了！強勁的擊球——':bb.la>45?'高高飛起——':'打到了！');
}
const basePath=[BASES.home,BASES.first,BASES.second,BASES.third,BASES.home];
function pathAt(s){ s=clamp(s,0,4); const i=Math.min(Math.floor(s),3), u=s-i, a=basePath[i], b=basePath[i+1]; return {x:lerp(a.x,b.x,u),z:lerp(a.z,b.z,u),dir:Math.atan2(b.x-a.x,b.z-a.z)}; }
function updatePlay(dt){
  const P=G.play; P.t+=dt; const {sim,res}=P, pts=sim.pts, last=pts.length-1;
  const k=Math.min(last,Math.floor(P.t*120)), bp=pts[k];
  const ci=res.idx>=0?res.idx:Infinity, caught=k>=ci;
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
      if(u>=1&&!P.ended){ P.ended=true; P.endAt=P.t+0.5; }
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
    if(res.kind==='FOUL'){ resetPlayers(); G.camFixed=true; camSet(camMode); endPitch('foul'); return; }
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
  G.tgt.x+=kx*flip*4.5*dt; G.tgt.y+=ky*4.5*dt;
  const mx=PLATE_HALF+0.75; G.tgt.x=clamp(G.tgt.x,-mx,mx); G.tgt.y=clamp(G.tgt.y,br.szBot-0.75,br.szTop+0.75);
  const sp=G.mode==='pitch'?14:7.5, dx=G.tgt.x-G.cur.x, dy=G.tgt.y-G.cur.y, dd=Math.hypot(dx,dy);
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
  if(['windup','pitch','between','play','settle'].includes(G.state)){ G.windT+=dt; posePitcher(Math.min(G.windT,2.2)); }
  if(G.state==='windup'){
    const wp=new THREE.Vector3(); throwHand().getWorldPosition(wp); ball.position.copy(wp); ball.visible=G.windT>0.2;
    if(G.windT>=RELEASE_T){
      G.state='pitch'; G.relT=G.t; G.rel={x:wp.x,y:wp.y,z:wp.z};
      if(G.mode==='pitch'){
        G.decide=batterDecide(G.pitch,br,pit(curPitcher(GM)),GM.balls,GM.strikes);
        if(G.decide.swing){ const jit=G.decide.whiff?(Math.random()<.5?-1:1)*rnd(0.05,0.12):gauss()*0.015; G.swing={mode:'ai',t0:G.relT+G.pitch.T-0.13+jit,done:false}; }
      }
    }
  }
  if(G.swing){
    const st=G.t-G.swing.t0; poseBatter(st,G.mode==='bat'?G.cur.y:G.pitch.end.y);
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
      if(G.swing) endPitch('whiff'); else endPitch(isStrikeFor(br,end.x,end.y)?'strike':'ball');
      if(G.state!=='done' && C.catcher){ const lp=C.catcher.hL.position; ball.visible=G.mode==='pitch'; ball.position.copy(C.catcher.root.localToWorld(lp.clone())); }
    }
  }
  if(G.state==='play'||G.state==='settle') updatePlay(dt);
}
function renderFrame(){
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
  bokeh.uniforms.aperture.value = G.state==='closeup'?0.004 : camera.fov<12 ? 0.00006 : (G.state==='play'||G.state==='settle') ? 0.00003 : G.mode==='bat' ? 0.000012 : 0.00004;
}
function drawOverlay(){
  og.clearRect(0,0,innerWidth,innerHeight);
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
  if(e.target.tagName==='SELECT') return;
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
canvas.addEventListener('touchmove',e=>{ const t=e.touches[0]; if(touchLast){ const f=G.mode==='pitch'?-0.02:0.012; G.tgt.x+=(t.clientX-touchLast.x)*f; G.tgt.y-=(t.clientY-touchLast.y)*Math.abs(f); } touchLast={x:t.clientX,y:t.clientY}; e.preventDefault(); },{passive:false});
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
  $('intro').classList.add('hide');
  const away=SEL.userHome?SEL.opp:SEL.user, home=SEL.userHome?SEL.user:SEL.opp;
  const spA=SEL.userHome?SEL.spOpp:SEL.spUser, spH=SEL.userHome?SEL.spUser:SEL.spOpp;
  startGame(away,home,SEL.user,spA,spH);
};
$('again').onclick=()=>{ $('result').classList.add('hide'); $('start').onclick(); };
$('toMenu').onclick=()=>{ $('result').classList.add('hide'); $('intro').classList.remove('hide'); G.state='intro'; };

refreshSelect(); camSet('pitch');
addEventListener('resize',resize); resize();
requestAnimationFrame(tick);

// 測試用參數：?game=DET-LAD&skip=1
const QS=new URLSearchParams(location.search);
if(QS.has('game')){ const [a,h]=QS.get('game').split('-'); $('intro').classList.add('hide'); startGame(a,h,QS.get('user')||a); if(QS.has('skip')) G.closeT=99; }
window.__G=G; window.__GM=()=>GM;
