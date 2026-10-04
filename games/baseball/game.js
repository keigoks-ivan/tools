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
    for(let i=0;i<6;i++){ const x0=W*(0.32+0.36*i/6), x1=W*(0.32+0.36*(i+1)/6); g.quadraticCurveTo((x0+x1)/2,H*0.42,x1,H*0.335); }
    g.lineTo(W*0.68,H*0.3); g.closePath(); g.fill();
    g.strokeStyle='rgba(255,225,188,.12)'; g.lineWidth=1.5;
    for(let i=0;i<44;i++){ const x=W*(0.32+0.36*i/44); g.beginPath(); g.moveTo(x-8,H*.23); g.quadraticCurveTo(x+4,H*.3,x,H*(i%2?.385:.325)); g.stroke(); }
    const cx=W*0.5, ey=H*0.56;
    for(const side of [-1,1]){
      const x=cx+side*W*.078;
      const blush=g.createRadialGradient(x,ey+55,3,x,ey+55,42); blush.addColorStop(0,'rgba(190,91,70,.22)'); blush.addColorStop(1,'rgba(190,91,70,0)'); g.fillStyle=blush; g.fillRect(x-45,ey+18,90,78);
    }
    // 鬍渣、八字鬍、雀斑（位置對齊 faces.js 的嘴巴與臉頰）
    if(o.stubble||o.beard){ g.fillStyle=o.hair; g.globalAlpha=.16; for(let i=0;i<900;i++){ const a=Math.random()*Math.PI, rr=Math.sqrt(Math.random()); g.fillRect(512+Math.cos(a)*rr*118,338+Math.sin(a)*rr*92,1.3,1.3); } g.globalAlpha=1; }
    if(o.mustache){ g.fillStyle=o.hair; for(const sx of [-1,1]){ g.beginPath(); g.ellipse(512+sx*17,366,19,8,sx*.25,0,Math.PI*2); g.fill(); } }
    if(o.freckles){ g.fillStyle='rgba(150,80,50,.45)'; for(const sx of [-1,1]) for(let i=0;i<14;i++){ g.beginPath(); g.arc(512+sx*(70+Math.random()*40),330+Math.random()*30,1.8+Math.random()*1.2,0,Math.PI*2); g.fill(); } }
    if(o.beard){   // 修短的下巴鬍：清楚的形狀，不要整片髒污
      g.fillStyle=o.hair; g.globalAlpha=.85; g.beginPath(); g.ellipse(512,404,26,14,0,0,Math.PI*2); g.fill(); g.globalAlpha=1;
    }
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
const LEATHER_BUMP=(()=>{ const t=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#808080'; g.fillRect(0,0,w,h);
  for(let i=0;i<5200;i++){ const v=100+Math.random()*60|0; g.fillStyle=`rgb(${v},${v},${v})`; g.beginPath(); g.arc(Math.random()*w,Math.random()*h,0.6+Math.random()*1.4,0,7); g.fill(); } });
  t.colorSpace=THREE.NoColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(3,3); return t; })();
const GLOVE_COLORS=[[0x9a5426,0x3b1d0c,0xe8d8b0],[0x221d1a,0xc8a070,0xc8a070],[0xb8783e,0x5a2c10,0x5a2c10],[0x5a3418,0xd8b080,0xd8b080],[0x7a2a1a,0xe0c090,0xf0e0c0],[0xc9a06a,0x6b3a18,0x6b3a18]];
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
  const skull=part('head',new THREE.MeshStandardMaterial({map:headFace,roughness:0.55})); head.add(skull);
  const face=window.BaseballFaces.create(head,skull,o.face);
  head.add(part('ear_L',skin)); head.add(part('ear_R',skin));
  const nose=limbMesh(jointGeo,skin,head); nose.position.set(0,-.56,.99); nose.scale.set(.05,.045,.04);
  for(const s of [-1,1]){ const inner=limbMesh(jointGeo,std(0xb87860,.75),head); inner.position.set(s*1.223,-.08,.105); inner.scale.set(.055,.14,.055); }
  if(o.cap.helmet){ const m=gloss(o.cap.color); head.add(part('helmet_shell',m)); head.add(part('helmet_brim',m));
    const fl=part('helmet_flap',m); fl.scale.x=o.cap.helmet; head.add(fl); }
  else if(o.cap.catcher){ head.add(part('catcher_shell',gloss(o.cap.color))); head.add(part('mask_cage',std(o.cap.cage||0xb8c0c8,0.3,{metalness:0.8}))); }
  else { const m=std(o.cap.color,0.8); ['cap_crown','cap_brim','cap_button'].forEach(n=>head.add(part(n,m))); }
  window.BaseballFaces.hair(head,{...o.face,flapSide:o.cap.helmet||0},o.cap.helmet?'helmet':o.cap.catcher?'catcher':'cap');
  if(o.cap.logo){
    const badge=canvasTex(128,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.font='italic 900 66px Rubik,Arial'; g.textAlign='center'; g.textBaseline='middle'; g.lineWidth=5; g.strokeStyle='#ffffff'; g.strokeText(o.cap.logo,w/2,h/2); g.fillStyle=o.cap.ink||'#ffffff'; g.fillText(o.cap.logo,w/2,h/2); });
    const patch=new THREE.Mesh(capBadgeGeo,new THREE.MeshBasicMaterial({map:badge,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    patch.position.set(0,0.52,1.105); head.add(patch);
  }
  const handMat=o.batGlove?std(o.batGlove,0.6):skin;
  let glove=null;
  const mkGlove=()=>{
    // 皮革手套：本體、較深的網子和手腕帶、對比色綁繩、手背小標（零件見 tools/build_pawa.py）
    const col=new THREE.Color(o.glove), dark=col.clone().multiplyScalar(0.62);
    const leather=c=>new THREE.MeshPhysicalMaterial({color:c,roughness:0.55,clearcoat:0.35,clearcoatRoughness:0.35,bumpMap:LEATHER_BUMP,bumpScale:1.2});
    const g=new THREE.Group();
    g.add(part('glove',leather(col))); g.add(part('glove_web',leather(dark)));
    g.add(part('glove_lace',std(o.gloveLace||0x3a1a08,0.6))); g.add(part('glove_patch',std(o.glovePatch||0xd8c8a0,0.5)));
    g.scale.set(1.0*(o.gloveRight?-1:1),1.0,1.0); glove=g; return g;
  };
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
  const portrait=o.articulated?window.BaseballFaces.portrait(o,headFace):null;
  return {root,yaw,upper,head,hR,hL,feet,rig,portrait,face,glove,gloveHand:glove?(o.gloveRight?hR:hL):null};
}
function disposeModel(c){
  if(!c) return; c.root.parent&&c.root.parent.remove(c.root);
  c.root.traverse(m=>{ if(m.isMesh){ const mt=m.material; if(mt.map) mt.map.dispose(); mt.dispose(); } });
}
// 每位球員固定的外觀（用 id 當亂數種子）
function seeded(id){ let s=(+id||1)%2147483647; return ()=>((s=s*16807%2147483647)-1)/2147483646; }
const SKINS=['#f1bf96','#eab184','#dfa276','#cd8d60','#b5784f','#935e3e','#74482e'];
function faceFor(pid){
  // 每人固定一組長相：眼型、眉型、髮型、髮色、膚色、鬍子、雀斑（亞洲球員黑髮）
  const P=PLAYERS[pid]||{}, r=seeded(pid), pickW=(arr,w)=>{ let x=r()*w.reduce((p,q)=>p+q,0); for(let i=0;i<arr.length;i++){ if((x-=w[i])<=0) return arr[i]; } return arr[0]; };
  const asian=!!P.zh;
  const skin=asian?['#f1c099','#ebb68d','#e4ab80'][Math.floor(r()*3)]:SKINS[Math.min(SKINS.length-1,Math.floor(Math.pow(r(),1.25)*SKINS.length))];
  const dark=SKINS.indexOf(skin)>=4;
  const hair=asian?'#17110d':pickW(['#17110d','#2e2016','#4a3220','#6b4a2a','#a07a46','#c49a5a'],[3,3,2.4,1.6,.8,.4]);
  const iris=asian?pickW(['#3b2416','#4e2c18'],[1,1]):pickW(['#3b2416','#4e2c18','#6a3e24','#2f5f8f','#4f7a3e','#7a6a40'],[2,3,2,1.4,1,.6]);
  const light={'#3b2416':'#a8743c','#4e2c18':'#c48a4a','#6a3e24':'#d49a5a','#2f5f8f':'#8fd0ff','#4f7a3e':'#b8e07a','#7a6a40':'#e0c880'}[iris]||'#c48a4a';
  return {skin,hair,iris,irisLight:light,lash:'#1a0f0b',seed:+pid,
    eyeType:pickW(['round','sharp','droopy','narrow','dot'],[3,3,2,2,.8]),
    browType:pickW(['thick','arch','thin','bushy','angled'],[3,2,1.2,1.5,2]),
    hairStyle:pickW(['spiky','side','long','curly','buzz'],asian?[3,3,1.2,.4,1]:[2.5,2.5,1.4,dark?2.2:.8,1.5]),
    beard:r()<.07, stubble:false, mustache:r()<.05, freckles:false,
    mouthW:40+r()*16, eye:r(), blush:dark?.2:r(), sharp:false, brow:r(), smile:r()};
}
function teamLook(abbr,home){
  const T=TEAM(abbr), [p,s]=T.colors;
  return {uni:{base:home?'#f7f7f5':'#b9bdc3',trim:p,belt:p,numColor:p,numStroke:home?(s==='#000000'?'#ffffff':s):'#ffffff'},cap:p,shoe:p};
}
function playerModel(pid,abbr,home,kind){
  const L=teamLook(abbr,home), P=PLAYERS[pid]||{}, o={face:faceFor(pid),uni:{...L.uni,num:P.num||'',name:P.last||'',front:P.num||''},shoe:L.shoe,articulated:['pit','bat','run'].includes(kind)};
  if(kind==='bat'||kind==='run'){ const side=kind==='bat'?arguments[4]:1; o.cap={color:L.cap,helmet:side}; o.batGlove=TEAM(abbr).colors[1]; }
  else if(kind==='catch'){ o.cap={color:L.cap,catcher:true}; o.glove=0x3a2416; o.chestPad=L.cap; o.scale=1.3; }
  else { o.cap={color:L.cap}; { const gc=GLOVE_COLORS[(+pid||0)%GLOVE_COLORS.length]; o.glove=gc[0]; o.gloveLace=gc[1]; o.glovePatch=gc[2]; } if(kind==='pit' && P.throws==='L') o.gloveRight=true; if(kind==='field' && P.throws==='L') o.gloveRight=true; }
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
C.ump.root.position.set(1.0,0,6.6); C.ump.root.rotation.y=Math.PI; scene.add(C.ump.root);
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
      applyPose(c,mcSample('catcher',0,false),1); c.feet[0].position.x-=0.35; c.feet[1].position.x+=0.35;
      c.hL.position.copy(MITT_HOME); c.hR.position.set(-0.95,1.0,0.5); C.catcher=c; C.fielders.C=c; continue;
    }
    const c=playerModel(pid,f.abbr,home,'field'); c.root.position.set(p.x,0,p.z); c.root.lookAt(0,0,0); c.home={x:p.x,z:p.z}; c.m=handOf(pid); scene.add(c.root); C.fielders[p.k]=c; runPose(c,0,false,c.m);
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
/* ---------- 動作捕捉（assets/mocap.js，由 tools/bake_mocap.py 從 Mixamo 烘出） ----------
   每格 25 個數：0 hips、3 spine、6 head、9 左手、12 右手、15 左腳、18 右腳（x,y,z 公尺，角色面向 +Z）
   21 hips 朝向、22 spine 朝向、23 head 朝向、24 前傾（弧度）。
   二頭身沒有手臂和腿：只把人的手、腳、身體轉向／高低／前傾、頭轉向搬到浮空零件上。 */
const MC=window.MOCAP||{}, MC_N=25;
for(const k in MC){   // 每段找：手最快格（peakF）、之後手停下來那格（catchF＝接到）、手最低格（lowF＝撿球）
  const c=MC[k], f=c.f, sp=[0];
  for(let i=1;i<c.n;i++){ const a=f[i-1], b=f[i]; sp.push(Math.max(Math.hypot(b[9]-a[9],b[10]-a[10],b[11]-a[11]),Math.hypot(b[12]-a[12],b[13]-a[13],b[14]-a[14]))); }
  let pk=1; for(let i=1;i<c.n;i++) if(sp[i]>sp[pk]) pk=i;
  let ct=pk; while(ct<c.n-1 && sp[ct]>sp[pk]*0.3) ct++;
  let lo=0; for(let i=0;i<c.n;i++) if(Math.min(f[i][10],f[i][13])<Math.min(f[lo][10],f[lo][13])) lo=i;
  c.peakF=pk; c.catchF=ct; c.lowF=lo;
}
const wrapA=d=>d>Math.PI?d-2*Math.PI:d<-Math.PI?d+2*Math.PI:d;
function mcSample(name,t,loop,out){
  const c=MC[name]; out=out||new Float32Array(MC_N);
  let fr=t*c.fps;
  if(loop){ const L=c.n-1; fr=((fr%L)+L)%L; } else fr=clamp(fr,0,c.n-1);
  const i=Math.floor(fr), j=Math.min(i+1,c.n-1), u=fr-i, a=c.f[i], b=c.f[j];
  for(let k=0;k<MC_N;k++) out[k]=a[k]+(k>=21&&k<=23?wrapA(b[k]-a[k]):b[k]-a[k])*u;
  return out;
}
function mcMix(a,b,w,out){ for(let k=0;k<MC_N;k++) out[k]=a[k]+(k>=21&&k<=23?wrapA(b[k]-a[k]):b[k]-a[k])*w; return out; }
// 人體公尺 → 二頭身局部單位
const MK={hand:2.0, foot:2.3, body:2.0, drop:1.25};
// c：二頭身模型；P：姿勢；m：1 或 -1（左投、左打、左撇子野手鏡射）；noHands：手不動（打者的手掛在球棒上）
function applyPose(c,P,m,noHands){
  const hy=P[1], bx=P[0]*m*MK.body, bz=P[2]*MK.body, by=clamp((hy-0.95)*MK.drop,-0.9,0.4);
  const yaw=P[22]*m;
  c.yaw.position.set(bx,by,bz); c.yaw.rotation.y=yaw;
  c.upper.rotation.x=clamp(P[24],-0.4,0.9)*0.8;
  c.head.rotation.y=clamp(wrapA(P[23]-P[22])*m,-1.2,1.2);
  const cs=Math.cos(yaw), sn=Math.sin(yaw);
  if(!noHands){
    const place=(h,i)=>{
      const y=1.65+by+(P[i+1]-hy)*1.95;
      let rx=P[i]*m*MK.hand-bx, rz=P[i+2]*MK.hand-bz;
      // 大頭比例需要把手套留在身體外側；仍沿用捕捉動作的高度與前後位移。
      if(h===c.gloveHand && y>0.45+by && y<3.4+by && Math.abs(rz)<1.25 && Math.abs(rx)<1.3) rx=(h===c.hL?1:-1)*1.3;
      const d=Math.hypot(rx,rz), lim=y>2.55+by?1.45:(y>0.45+by?1.12:0);   // 手不要陷進身體或頭
      if(lim && d<lim){ if(d<1e-3){ rx=0; rz=lim; } else { rx*=lim/d; rz*=lim/d; } }
      h.position.set(rx*cs-rz*sn, y-by, rx*sn+rz*cs);
    };
    place(c.hR, m>0?12:9); place(c.hL, m>0?9:12);
    if(c.glove){ c.glove.rotation.set(-0.18,-yaw,0); }
  }
  const foot=(f,i)=>{ f.position.set(P[i]*m*MK.foot, 0.05+Math.max(0,P[i+1]-0.07)*1.6, P[i+2]*MK.foot); f.rotation.y=P[21]*m; };
  foot(c.feet[0], m>0?18:15); foot(c.feet[1], m>0?15:18);
}
const _pA=new Float32Array(MC_N), _pB=new Float32Array(MC_N), _pC=new Float32Array(MC_N);
const READY=mcSample('gkMid',0,false);          // 野手、跑者的預備姿勢
const RELEASE_T=1.15;
const throwHand=()=>PHAND>0?C.pitcher.hR:C.pitcher.hL;
// 投球：出手格對齊 RELEASE_T，出手前把整段揮臂壓進 RELEASE_T 秒，出手後照原速
function posePitcher(t){
  const pc=C.pitcher; if(!pc) return;
  const rel=MC.pitch.fast/30, ct=t<RELEASE_T?t*rel/RELEASE_T:rel+(t-RELEASE_T);
  applyPose(pc,mcSample('pitch',ct,false,_pA),PHAND);
}
// 打擊：身體、頭、腳跟著動作捕捉；球棒和兩隻手照原本的揮棒（判定時機不變），握把位置跟著人的雙手
const STANCE={yaw:-1.3,elev:1.2};
const _batHead=new THREE.Vector3(), _batDir=new THREE.Vector3(), _batNear=new THREE.Vector3(), _batPush=new THREE.Vector3();
function clearBatHead(c){
  c.root.updateMatrixWorld(true); c.head.getWorldPosition(_batHead); c.root.worldToLocal(_batHead);
  _batDir.set(0,0,1).applyEuler(swingElev.rotation).applyEuler(swingYaw.rotation);
  const radius=1.47*c.head.scale.x+.12;
  for(let i=0;i<4;i++){
    _batNear.copy(_batHead).sub(swingYaw.position);
    const along=clamp(_batNear.dot(_batDir),0,2.7);
    _batNear.copy(_batDir).multiplyScalar(along).add(swingYaw.position);
    _batPush.copy(_batNear).sub(_batHead); const d=_batPush.length();
    if(d>=radius) break;
    if(d<.001) _batPush.set(-C.batterM,0,1).normalize(); else _batPush.multiplyScalar(1/d);
    swingYaw.position.addScaledVector(_batPush,radius-d);
  }
}
function poseBatter(st,cy){
  const c=C.batter; if(!c) return; const m=C.batterM;
  const idle=mcSample('batIdle',G.t*0.8,true,_pA);
  let P=idle;
  if(st>=0){
    const clip=C.swingClip||'whiff', K=MC[clip].fast/30;
    mcSample(clip,st+K-0.13,false,_pB);
    P=st<0.06?mcMix(idle,_pB,st/0.06,_pC):_pB;
  }
  applyPose(c,P,m,true);
  let y,el;
  const contactElev=clamp((cy-2.7)*.45,-.5,.95);
  const readyElev=STANCE.elev;   // 兩種視角用同一個自然站姿：球棒斜架在後肩
  if(st<0){ y=STANCE.yaw; el=readyElev; }
  else if(st<0.13){ const u=st/0.13, e=u*u; y=lerp(STANCE.yaw,0,e); el=lerp(readyElev,contactElev,Math.min(1,u*1.3)); }
  else { const u=Math.min(1,(st-0.13)/0.22), e=1-(1-u)*(1-u); y=lerp(0,3.0,e); el=lerp(contactElev,0.95,e); }
  swingYaw.rotation.y=m*y; swingElev.rotation.x=-el;
  // 握把＝人的雙手中點（換到打者根座標）
  const hx=(P[9]+P[12])/2, hyy=(P[10]+P[13])/2, hz=(P[11]+P[14])/2, by=c.yaw.position.y;
  const held=st<0?1:1-ease(st/.13);
  const readyX=-.12, readyZ=.45;   // 握把收在後肩前方一點
  swingYaw.position.set(clamp(hx*MK.hand,-.7,.7)*m+m*readyX*held, clamp(1.65+by+(hyy-P[1])*1.95,1.6,2.9)+.3*held, clamp(hz*MK.hand,-.2,.9)+readyZ*held);
  // 擊球格讓棒身落在本壘；身體與收尾繼續使用 Mixamo，握把只做比例校正。
  const align=st<0?0:Math.max(0,1-Math.abs(st-.13)/.09), barrel=2.2, scale=c.root.scale.x;
  if(align){
    swingYaw.position.x=lerp(swingYaw.position.x,m*c.root.position.z/scale,align);
    swingYaw.position.y=lerp(swingYaw.position.y,cy/scale-Math.sin(contactElev)*barrel,align);
    swingYaw.position.z=lerp(swingYaw.position.z,Math.abs(c.root.position.x)/scale-Math.cos(contactElev)*barrel,align);
  }
  clearBatHead(c);
}
// 跑步（原地循環，根節點移動由呼叫端處理）或預備姿勢
function runPose(c,t,moving,m=1){ applyPose(c,moving?mcSample('run',t*1.35,true,_pA):READY,m); }
const handOf=pid=>(PLAYERS[pid]?.throws==='L')?-1:1;

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
  const dockLift=portrait?(name==='pitch'&&innerHeight<=700?4:0):name==='bat'?(innerHeight<=540?2.5:innerWidth<=940||innerHeight<=780?3:0):innerHeight<=540?2:0;
  camera.position.set(center?0:c.pos.x*fl*fb,c.pos.y,c.pos.z); camera.lookAt(center?0:c.look.x*fl*fb,c.look.y-dockLift,c.look.z);
  camera.fov=portrait?c.fovP:name==='bat'&&innerHeight<=540?44:c.fov; camera.updateProjectionMatrix();
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
  syncHudLayout();
}
function syncHudLayout(){ document.documentElement.style.setProperty('--panel-height',Math.ceil(document.querySelector('.panels').getBoundingClientRect().height)+'px'); }
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
$('heatExpand').onclick=()=>{ const open=$('heatPanel').classList.toggle('expanded'); $('heatExpand').setAttribute('aria-expanded',String(open)); };
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
  if(typeof abTags==='function'){ let e=$('bAbl'); if(!e){ e=document.createElement('div'); e.id='bAbl'; e.className='ss-abl ss-hud'; $('batStat').after(e); } e.innerHTML=abTags(br.ab); }
  const f=fielding(g), pid=f.pitcher, pr=pit(pid), pc=f.pc[pid]||0, left=clamp(100-pc/pr.limit*100,3,100);
  $('pNm').textContent=dispName(pid); const role=pid===f.T.rotation[0]||f.usedPen.length===0?'先發':pid===f.T.bullpen[0]?'終結':'中繼';
  $('pRole').textContent=(f.abbr===g.user?'我方':'對手')+'・'+role; $('pRole').title=f.T.zh+'投手';
  $('pitLine').innerHTML=`<span class="kmhv">${pr.kmh}<small>km/h</small></span><span>控球${gl(pr.control)}</span><span>體力${gl(pr.stamina)}</span>`;
  if(typeof abTags==='function'){ let e=$('pAbl'); if(!e){ e=document.createElement('div'); e.id='pAbl'; e.className='ss-abl ss-hud'; $('pitLine').after(e); } e.innerHTML=abTags(pr.ab); }
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
  document.body.classList.toggle('mode-pitch',m==='pitch');
  $('tAbtn').textContent=m==='pitch'?'投球':'揮棒'; $('tBbtn').style.display=m==='pitch'?'none':'';
  $('help').innerHTML = (m==='pitch'
    ? '選球種：<kbd>1</kbd>～<kbd>7</kbd>　瞄準：<kbd>滑鼠</kbd>／<kbd>方向鍵</kbd>　投球：<kbd>空白鍵</kbd>'
    : '游標：<kbd>滑鼠</kbd>／<kbd>方向鍵</kbd>　揮棒：<kbd>空白鍵</kbd>　強振：<kbd>X</kbd>')+'<br>跳過打席：<kbd>N</kbd>　模擬到換局：<kbd>M</kbd>';
  buildMenu();
}
function resetPlayers(){
  ball.visible=false; FX.reset(); $('contactReadout').classList.remove('show'); if(C.runner){ disposeModel(C.runner); C.runner=null; }
  if(C.batter) C.batter.root.visible=true;
  for(const k in C.fielders){ if(k==='P'||k==='C') continue; const f=C.fielders[k]; f.root.position.set(f.home.x,0,f.home.z); f.root.lookAt(0,0,0); runPose(f,0,false,f.m); }
  C.umpT=null; applyPose(C.ump,mcSample('ump',0,false,_pA),1); C.swingClip='whiff';
  posePitcher(0); poseBatter(-1,G.cur.y); if(C.catcher) C.catcher.hL.position.copy(MITT_HOME);
  setRunners();
  G.swing=null; G.decide=null; G.play=null;
}
// 開新的一場
function startGame(away,home,user,spA,spH,opts){
  SFX.unlock(); SFX.setActive(true); SFX.play('start');
  GM=newGame(away,home,user,spA,spH); GM.season=!!(opts&&opts.season);
  if(GM.season&&typeof restPen==='function') restPen(GM);
  if(typeof ACH!=='undefined') ACH.newGame(GM);
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
    say(`${TEAM(g.away.abbr).zh}對${TEAM(g.home.abbr).zh}，比賽開始！`); if(typeof TACTICS!=='undefined') TACTICS.beforePA(true); return; }
  G.camFixed=true; camSet(camMode);
  if(ch) { flashBanner(ch.next,true,2200); say(`換投：${nameOf(ch.next)}上場。`); }
  else flashBanner(curBatter(g),false);
  if(!ch) say(`第 ${(batting(g).idx%9)+1} 棒，${nameOf(curBatter(g))}。`);
  if(G.mode==='pitch'){ G.state='aim'; G.tgt={x:0.3,y:2.2}; } else { G.state='ready'; G.waitUntil=G.t+1.4; }
  if(typeof TACTICS!=='undefined') TACTICS.beforePA(false);
}
function afterCloseup(){
  $('banner').classList.remove('show'); document.body.classList.remove('cine'); G.camFixed=true; camSet(camMode);
  if(G.mode==='pitch'){ G.state='aim'; G.tgt={x:0.3,y:2.2}; } else { G.state='ready'; G.waitUntil=G.t+0.8; }
}
function startWindup(P){
  G.abN++; G.pitch=P; G.windT=0; G.state='windup'; G.swing=null; G.decide=null;
  G.planted=false; FX.resetTrail();
  const f=fielding(GM); f.pc[f.pitcher]=(f.pc[f.pitcher]||0)+1;
  if(typeof TACTICS!=='undefined') TACTICS.onWindup();
  $('banner').classList.remove('show'); $('plabel').classList.remove('show'); say(G.abN===1?`${nameOf(f.pitcher)}，投了！`:pick(['投了！',`第 ${G.abN} 球——`,'抬腿——']));
  setPanels();
}
const PLAYER_SWING_RATE=1.4;
function swingTime(){ return G.swing?(G.t-G.swing.t0)*(G.swing.mode==='ai'?1:PLAYER_SWING_RATE):-1; }
function swing(mode){
  if(G.mode!=='bat') return;
  if(!(G.state==='windup'||G.state==='pitch')||G.swing) return;
  G.swing={mode,t0:G.t,done:false};
}
function throwPitch(){
  if(G.mode!=='pitch'||G.state!=='aim') return;
  if(window.FEEL && !FEEL.meterPress()) return;
  const pr=pit(curPitcher(GM)), p=pr.pitches[G.sel]||pr.pitches[0], q=window.FEEL?FEEL.meterResult():{mph:0,control:0,mistake:false};
  const br=bat(curBatter(GM)), aim=q.mistake?{x:G.cur.x*0.25,y:(br.szTop+br.szBot)/2}:{x:G.cur.x,y:G.cur.y};   // 失投：滑向好球帶中間
  startWindup(buildPitch({...p,mph:p.mph+q.mph},{...pr,control:clamp(pr.control+q.control,1,100)},aim,fatigue(GM)));
}
function endPitch(kind){
  window.BaseballFaces.react(C.batter,kind==='ball'?'confident':kind==='foul'?'focus':'frustrated',G.t);
  window.BaseballFaces.react(C.pitcher,kind==='ball'?'frustrated':'confident',G.t);
  showPitchLabel(G.pitch);
  if(kind==='strike'||kind==='whiff') SFX.play('strike');
  if(kind==='ball'){ GM.balls++; if(GM.balls>=4){ finishPA({kind:'BB',text:'四壞球保送'}); return; } showCall('壞球','blue'); say(pick(['壞球。','偏掉了。','選掉了。'])); }
  else if(kind==='foul'){ if(GM.strikes<2) GM.strikes++; showCall('界外','blue'); say(pick(['界外！','打成界外球。'])); }
  else { if(kind==='strike') C.umpT=G.t;
    GM.strikes++; if(GM.strikes>=3){ finishPA({kind:'K',text:kind==='whiff'?'揮棒落空三振':'站著被三振'}); return; }
    showCall(kind==='whiff'?'揮空':'好球'); say(kind==='whiff'?pick(['揮空！','揮棒落空！']):pick(['好球！','進壘了！'])); }
  setCount(); G.state='between'; G.waitUntil=G.t+1.3;
}
// 打席結束
function finishPA(res,pre){
  const hit=['1B','2B','3B','HR'].includes(res.kind);
  window.BaseballFaces.react(C.batter,hit?'joy':res.kind==='BB'?'confident':'frustrated',G.t,2.7);
  window.BaseballFaces.react(C.runner,hit?'joy':'focus',G.t,2.7);
  window.BaseballFaces.react(C.pitcher,res.kind==='HR'?'shock':hit?'concern':res.kind==='BB'?'frustrated':'confident',G.t,2.7);
  const g=GM, inningBefore=g.inning, halfBefore=g.half;
  const runsBefore=batting(g).runs, basesBefore=g.bases.slice(), bid0=curBatter(g), pid0=curPitcher(g), live=G.abN>0;
  const userBat=live&&batting(g).abbr===g.user, userPit=live&&fielding(g).abbr===g.user;
  const text=applyResult(g,res,pre);
  if(typeof ME!=='undefined'){ ME.pa(res,pre||g.lastAdvance,userBat,userPit); ACH.onPA(g,res,pre||g.lastAdvance,userBat,userPit,basesBefore); }
  dispatchEvent(new CustomEvent('pa:end',{detail:{res,batter:bid0,pitcher:pid0,away:g.away.runs,home:g.home.runs,bases:g.bases.slice(),basesBefore,inning:inningBefore,half:halfBefore,outs:g.outs,userBat,userPit,text}}));
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
  if(typeof TACTICS!=='undefined') TACTICS.close(false);
  G.state='result';
  SFX.play('end'); SFX.setActive(false);
  $('rTitle').textContent=userWon?'勝利':'敗戰'; $('rTitle').className=userWon?'':'lose';
  $('rDet').innerHTML=`<span class="tn">${a.T.zh}</span>${chipHTML(a.abbr)}<span class="fs">${a.runs}<em>–</em>${h.runs}</span>${chipHTML(h.abbr)}<span class="tn">${h.T.zh}</span>${g.inning>9?`<span class="ex">延長到第 ${g.inning} 局</span>`:''}`;
  const sc=g.pbp.filter(p=>p.runs>0);
  $('rLog').innerHTML=lineScoreHTML()+`<div class="hl"><div class="hlT">得分過程</div>${sc.length?sc.map(p=>`<div class="e"><span class="in">${p.inning} 局${p.half==='top'?'上':'下'}</span><span>${nameOf(p.batter)}：${p.text.replace(/，得 \d+ 分/,'')}</span><span class="rn">+${p.runs}</span></div>`).join(''):'<div class="none">雙方都沒有得分。</div>'}</div>`;
  $('rTot').textContent=`安打：${a.T.zh} ${a.hits} 支，${h.T.zh} ${h.hits} 支`;
  if(typeof ACH!=='undefined') ACH.onGameEnd(g);
  if(g.season && typeof SEASON!=='undefined' && SEASON.st){ SEASON.finishUserGame(g,true); const st=SEASON.st;
    $('rTot').textContent+=`　｜　${st.phase==='regular'?`例行賽 ${st.day}／${st.games} 場，${st.rec[st.user].w} 勝 ${st.rec[st.user].l} 敗`:st.phase==='playoffs'?'季後賽進行中':'球季結束'}`; }
  $('again').textContent=g.season?'回球季':'同樣兩隊再一場';
  dispatchEvent(new CustomEvent('game:end',{detail:{away:a.abbr,home:h.abbr,awayRuns:a.runs,homeRuns:h.runs,user:g.user,season:g.season,inning:g.inning}}));
  $('result').classList.remove('hide');
}
// 跳過：電腦代打／代投
function skipPA(){
  if(!GM||!['aim','ready','between'].includes(G.state)) return;
  if(typeof TACTICS!=='undefined'){ TACTICS.skipping=true; setTimeout(()=>TACTICS.skipping=false,1700); }
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
function startPlay(bb,pt,tactic){
  const g=GM, br=bat(curBatter(g));
  const sim=simulateBall(pt,bb), shown=resolvePlay(sim,bb,br), res=tactic?{...shown,...tactic.res}:shown;
  if(tactic&&res.kind==='1B'){
    res.bases=1;
    // Keep the tactic's result; let the runner beat the animated throw to first.
    const frames=Math.max(0,Math.ceil((br.hp1b+.6-res.t-res.throwT)*120)), q=sim.pts[res.idx];
    sim.pts.splice(res.idx,0,...Array.from({length:frames},()=>({...q})));
    sim.pts.forEach((p,i)=>p.t=(i+1)/120); res.idx+=frames; res.t=sim.pts[res.idx].t;
  }
  const power=clamp((bb.ev-65)/45,0,1); SFX.play('hit',power); FX.hit(new THREE.Vector3(pt.x,pt.y,pt.z),power);
  if(res.kind==='FOUL'){
    ball.visible=false; G.play=null; FX.resetTrail(); $('contactReadout').classList.remove('show');
    endPitch('foul'); G.waitUntil=G.t+.65; return;
  }
  window.BaseballFaces.react(C.batter,'confident',G.t,.8);
  window.BaseballFaces.react(C.pitcher,'concern',G.t,.8);
  const pre=tactic?tactic.pre:advance(g.bases,g.outs,res,curBatter(g));
  G.play={sim,res,pre,t:0,bb,ended:false,look:null,br,gloved:false,bounced:false}; ball.visible=true;
  const readout=$('contactReadout'); readout.innerHTML=`<span>${bb.ev>=100?'強勁擊球':bb.la>45?'高飛球':'擊球'}</span><b>${Math.round(bb.ev*1.609)}<small> km/h</small></b><em>仰角 ${Math.round(bb.la)}°</em>`; readout.classList.add('show');
  const t=batting(g); C.runner=playerModel(curBatter(g),t.abbr,t===g.home,'run',1); scene.add(C.runner.root); C.runner.root.position.set(BSIDE*3,0,0.6); C.runner.root.visible=false;
  G.state='play'; G.camFixed=false; $('plabel').classList.remove('show');
  say(bb.ev>=100?'打到了！強勁的擊球——':bb.la>45?'高高飛起——':'打到了！');
}
function startBuntPlay(res,pre){
  const br=bat(curBatter(GM)), pt={x:0,y:(br.szTop+br.szBot)/2,z:0};
  G.swing={mode:'meet',t0:G.t-.13/PLAYER_SWING_RATE,cy:pt.y,done:true,sounded:true}; G.windT=2.2;
  poseBatter(.13,pt.y);
  startPlay({ev:42,la:-6,spray:-35,q:.55,dn:.4},pt,{res,pre});
}

const gloveHand=f=>f.gloveHand||((f===C.pitcher?PHAND:(f.m||1))>0?f.hL:f.hR);
// 負責接球的野手：跑向落點 → 接球（低／中／高、滾地球撿球、勉強時撲球）→ 傳球
function fielderAct(P,dt){
  const res=P.res, pts=P.sim.pts, hm=res.fielder, f=C.fielders[hm.k], m=f.m||1, tc=res.t;
  if(!(res.idx>=0) || !pts[res.idx]) return;     // 場地規則二壘安打等沒有接球點的情況
  if(!P.fx){
    const tg=pts[res.idx], prev=pts[Math.max(0,res.idx-60)];
    let face=Math.hypot(prev.x-tg.x,prev.z-tg.z)>2?Math.atan2(prev.x-tg.x,prev.z-tg.z):Math.atan2(-tg.x,-tg.z);   // 面向球來的方向
    const react=hm.inf?0.28:0.42, d=Math.hypot(tg.x-hm.x,tg.z-hm.z);
    let clip=tg.b?'pickup':(tg.y<2.5?'gkLow':tg.y<6.8?'gkMid':'gkHigh');
    const lat=(tg.x-hm.x)*Math.cos(face)-(tg.z-hm.z)*Math.sin(face);
    // 跑很遠才搆到（內野滾地球橫移超過 30 呎、外野接飛球橫移超過 75 呎）就撲球
    if((hm.inf&&tg.b&&Math.abs(lat)>30) || (!hm.inf&&!tg.b&&Math.abs(lat)>75)) clip=lat*m>0?'diveL':'diveR';
    if(clip==='gkHigh' && d>60 && !tg.b) clip='gkRunJump';
    const cf=(clip==='pickup'?MC[clip].lowF:MC[clip].catchF)/30;
    // 接球動作本身會帶著身體位移：根節點停在落點前面一點，讓手套剛好到球
    const cp=MC[clip].f[Math.round(cf*30)], lx=cp[0]*m*MK.body*1.35, lz=cp[2]*MK.body*1.35;
    const ox=lx*Math.cos(face)+lz*Math.sin(face), oz=-lx*Math.sin(face)+lz*Math.cos(face);
    P.fx={clip,cf,face,react,tx:tg.x-ox,tz:tg.z-oz,start:Math.max(react+0.05,tc-cf),hx:f.root.position.x,hz:f.root.position.z};
  }
  const X=P.fx, u=clamp((P.t-X.react)/Math.max(0.05,X.start-X.react),0,1), far=Math.hypot(X.tx-X.hx,X.tz-X.hz)>3;
  f.root.position.x=lerp(X.hx,X.tx,u); f.root.position.z=lerp(X.hz,X.tz,u);
  let pose;
  if(P.t<X.start){ if(u<1&&far){ f.root.lookAt(X.tx,0,X.tz); pose=mcSample('run',P.t*1.35,true,_pA); } else { f.root.rotation.set(0,X.face,0); pose=READY; } }
  else {
    f.root.rotation.set(0,X.face,0);
    pose=mcSample(X.clip,P.t-X.start,false,_pB);
    if(P.t-X.start<0.15) pose=mcMix(far?mcSample('run',P.t*1.35,true,_pA):READY,pose,(P.t-X.start)/0.15,_pC);
  }
  if(res.throwTo){
    const rel=tc+0.35, lead=0.45, F=MC.throw.fast/30;
    if(P.t>=rel-lead){
      const B=BASES[res.throwTo]; f.root.lookAt(B.x,0,B.z);
      const th=mcSample('throw',P.t-rel+F,false,_pA);
      const w=clamp((P.t-(rel-lead))/0.15,0,1);
      pose=w<1?mcMix(pose,th,w,_pC):th;
    }
  }
  applyPose(f,pose,m);
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
  if(res.fielder && C.fielders[res.fielder.k] && res.fielder.k!=='C' && res.fielder.k!=='P') fielderAct(P,dt);
  if(C.runner && !C.runner.root.visible && P.t>=0.4 && !P.foul){ C.batter.root.visible=false; C.runner.root.visible=true; }
  if(caught && res.fielder){
    const f=C.fielders[res.fielder.k], tc=pts[ci].t;
    if(res.throwTo && P.t>tc+0.35){
      if(!P.thrown){ P.thrown=true; SFX.play('throw'); }
      const B=BASES[res.throwTo], fr=pts[ci], u=clamp((P.t-tc-0.35)/Math.max(0.2,res.throwT-0.5),0,1);
      ball.position.set(lerp(fr.x,B.x,u),3+Math.sin(u*Math.PI)*6,lerp(fr.z,B.z,u));
      if(res.throwTo==='first' && res.fielder.k!=='1B'){ const fb=C.fielders['1B'], bx=BASES.first.x-1, bz=BASES.first.z+1, far=Math.hypot(fb.root.position.x-bx,fb.root.position.z-bz)>1.5; fb.root.position.x=lerp(fb.root.position.x,bx,0.1); fb.root.position.z=lerp(fb.root.position.z,bz,0.1); if(far) fb.root.lookAt(bx,0,bz); else fb.root.lookAt(res.fielder.x,0,res.fielder.z); runPose(fb,P.t,far,fb.m); }
      if(u>=1&&!P.ended){ P.ended=true; P.endAt=P.t+0.5; SFX.play('mitt'); }
    } else {
      const wp=new THREE.Vector3(); gloveHand(f).getWorldPosition(wp); ball.position.copy(wp);
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
  if(!window.__frozen) update(dt*(window.FEEL?FEEL.timeScale():1));
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
  const locked = G.mode==='bat' ? (G.swing && swingTime()<0.4) : (!['aim','closeup'].includes(G.state) || (window.FEEL&&FEEL.meterActive()));
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
    const st=swingTime(); poseBatter(st,G.swing.cy??(G.mode==='bat'?G.cur.y:G.pitch.end.y));
    if(st>=0.02&&!G.swing.sounded){ G.swing.sounded=true; SFX.play('swing'); }
    if(!G.swing.done && st>=0.13){
      G.swing.done=true;
      if(G.state==='pitch'){
        const bpos=pitchPos(G.pitch,1,G.rel);
        if(G.mode==='bat'){
          const bb=contact(br,BSIDE,{x:bpos.x,y:bpos.y},G.cur,G.t-(G.relT+G.pitch.T),G.swing.mode);
          window.FEEL&&FEEL.onSwing(bb,G.t-(G.relT+G.pitch.T),G.swing.mode,bpos);
          if(bb){ C.swingClip=G.swing.mode==='power'?'hitHR':'hitSingle'; startPlay(bb,{x:bpos.x,y:bpos.y,z:0}); }
        } else if(G.decide && !G.decide.whiff){
          const bb=G.decide.foul?{ev:rnd(55,85),la:rnd(-10,65),spray:(Math.random()<.5?-1:1)*rnd(52,115)}:G.decide.bb;
          C.swingClip=bb.ev>100?'hitHR':bb.ev>92?'hitDouble':'hitSingle';
          startPlay(bb,{x:bpos.x,y:bpos.y,z:0});
        }
      }
    }
  }
  if(G.state==='pitch'){
    const u=(G.t-G.relT)/G.pitch.T, end=pitchPos(G.pitch,1,G.rel);
    const p=pitchPos(G.pitch,Math.min(u,1.065),G.rel); ball.position.set(p.x,p.y,p.z);
    if(u>=0.8 && C.catcher){ const lp=C.catcher.root.worldToLocal(new THREE.Vector3(end.x,end.y,end.z+3.4)); lp.sub(C.catcher.yaw.position); lp.y-=0.4; C.catcher.hL.position.lerp(lp,0.3); }
    if(u>=1.065){
      SFX.play('mitt');
      if(!G.swing && window.FEEL) FEEL.edgeCall(br,end);
      if(G.swing) endPitch('whiff'); else endPitch(isStrikeFor(br,end.x,end.y)?'strike':'ball');
      if(G.state!=='done' && C.catcher){ const wp=new THREE.Vector3(); C.catcher.hL.getWorldPosition(wp); ball.visible=G.mode==='pitch'; ball.position.copy(wp); }
    }
  }
  if(C.umpT!=null){ const ut=G.t-C.umpT; applyPose(C.ump,mcSample('ump',ut,false,_pA),1); if(ut>MC.ump.n/30) C.umpT=null; }
  if(G.state==='play'||G.state==='settle') updatePlay(dt);
  FX.update(dt,G.state,swingTime(),G.swing?.mode==='power');
  window.FEEL&&FEEL.update(dt);
}
const faceAim=new THREE.Vector3(), facePitcherAim=new THREE.Vector3(), faceBatterAim=new THREE.Vector3();
let faceTime=0;
function updateFaces(){
  if(!GM) return;
  const dt=clamp(G.t-faceTime,0,.1); faceTime=G.t;
  const flying=['pitch','play','settle'].includes(G.state), hero=G.state==='closeup';
  facePitcherAim.copy(flying?ball.position:faceAim.set(G.cur.x,G.cur.y,0));
  faceBatterAim.copy(flying?ball.position:C.pitcher.root.position); faceBatterAim.y=flying?ball.position.y:5;
  const effort=G.state==='windup'?Math.sin(clamp(G.windT/RELEASE_T,0,1)*Math.PI):0;
  window.BaseballFaces.update(C.pitcher,G.t,dt,facePitcherAim,effort>.25?'effort':'focus',effort,G.state==='pitch');
  const st=swingTime(), swinging=G.swing&&st>=0&&st<.28;
  window.BaseballFaces.update(C.batter,G.t,dt,faceBatterAim,swinging?'effort':'focus',swinging?1:0,G.state==='pitch'||swinging);
  for(const c of [C.runner,...Object.values(C.runners),C.ump,...Object.values(C.fielders)]){
    if(!c||c===C.pitcher||camera.position.distanceTo(c.root.position)>145) continue;
    window.BaseballFaces.update(c,G.t,dt,facePitcherAim,'focus');
  }
}
function renderFrame(){
  [C.pitcher,C.batter,C.runner,...Object.values(C.runners)].forEach(c=>{ if(c&&c.root.visible) syncLimbs(c); });
  $('heatPanel').hidden=!GM||G.mode!=='pitch'||!['aim','windup','pitch','between'].includes(G.state);
  $('skipBtn').disabled=$('simBtn').disabled=!GM||!['aim','ready','between'].includes(G.state);
  $('tacBtn').disabled=typeof TACTICS==='undefined'||(!TACTICS.isOpen()&&!TACTICS.canOpen());
  $('tAbtn').disabled=G.mode==='pitch'?G.state!=='aim':!['windup','pitch'].includes(G.state)||!!G.swing;
  $('tBbtn').disabled=$('tAbtn').disabled;
  $('touch').classList.toggle('on',['aim','ready','windup','pitch','between'].includes(G.state));
  const batView=!['play','settle','done','result','closeup'].includes(G.state)&&G.mode==='bat';
  if(C.catcher) C.catcher.root.visible=!batView; C.ump.root.visible=!batView;
  updateFaces(); updateFocus(); window.FEEL&&FEEL.preRender(); composer.render(); window.FEEL&&FEEL.postRender();
  drawOverlay();
}
function updateFocus(){
  let tgt = G.state==='closeup' ? (G.closeWho==='P'?C.pitcher:C.batter).head.localToWorld(new THREE.Vector3(0,-.12,1.02))
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
  if(GM&&window.FEEL) FEEL.drawOverlay(og,project);
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
canvas.addEventListener('mousemove',e=>{ if(G.camFixed&&G.state!=='tactic') aimAt(e.clientX,e.clientY); });
canvas.addEventListener('mousedown',e=>{ if(G.mode==='pitch'){ if(e.button===0) throwPitch(); } else { if(e.button===0) swing('meet'); else if(e.button===2) swing('power'); } });
canvas.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('keydown',e=>{
  if(['SELECT','INPUT','TEXTAREA'].includes(e.target.tagName)||e.target.closest('.sound-controls,.heat-panel,.ss-tac')||!GM||['intro','result','tactic'].includes(G.state)) return;
  if((e.key===' '||e.key==='Enter')&&e.target.closest('button,a')) return;
  const k=e.key.length===1?e.key.toLowerCase():e.key; keys[k]=true;
  if(k.startsWith('Arrow')) e.preventDefault();
  if(e.repeat){ if(k===' ') e.preventDefault(); return; }
  if(k===' '){ e.preventDefault(); G.mode==='pitch'?throwPitch():swing('meet'); }
  if(k==='x'||k==='k') swing('power');
  if(k==='n') skipPA();
  if(k==='m') simHalf();
  const pi=PKEYS.indexOf(k); if(pi>=0 && G.mode==='pitch' && GM && pi<pit(curPitcher(GM)).pitches.length){ G.sel=pi; buildMenu(); }
});
addEventListener('keyup',e=>{ const k=e.key.length===1?e.key.toLowerCase():e.key; keys[k]=false; });
addEventListener('blur',()=>{ for(const k in keys) keys[k]=false; touchLast=null; });
let touchLast=null;
canvas.addEventListener('touchstart',e=>{ if(!G.camFixed||G.state==='tactic') return; const t=e.touches[0]; touchLast={x:t.clientX,y:t.clientY}; e.preventDefault(); },{passive:false});
canvas.addEventListener('touchmove',e=>{ if(!G.camFixed||G.state==='tactic') return; const t=e.touches[0]; if(touchLast){ const f=G.mode==='pitch'?-0.02:0.02; G.tgt.x+=(t.clientX-touchLast.x)*f; G.tgt.y-=(t.clientY-touchLast.y)*Math.abs(f); } touchLast={x:t.clientX,y:t.clientY}; e.preventDefault(); },{passive:false});
canvas.addEventListener('touchend',()=>touchLast=null);
canvas.addEventListener('touchcancel',()=>touchLast=null);
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
      `<span class="ps">防禦率 <em>${s.era||'-.--'}</em>・${pr.pitches.slice(0,4).map(p=>p.name).join('、')}</span>${pr.ab.length?`<span class="ss-abl">${abTags(pr.ab)}</span>`:''}</button>`;}).join('');
  $(id).querySelectorAll('.spc').forEach(b=>b.onclick=()=>{ SEL[key]=+b.dataset.p; spOptions(abbr,id); });
}
function lineupPreview(abbr){
  const T=TEAM(abbr), side={R:'右打',L:'左打',S:'兩打'};
  return T.lineup.map((l,i)=>{ const br=bat(l.id), m=grade(br.meet), p=grade(br.power);
    return `<div class="r"><span class="o">${i+1}</span><span class="p">${POS_ZH[l.pos]||l.pos}</span><span class="n">${nameOf(l.id)}<small>${side[br.bats]||''}</small></span><span class="gs"><span style="color:${gcol(m)}">${m}</span><span style="color:${gcol(p)}">${p}</span></span>${br.ab.length?`<span class="ss-abl ss-abl-lu">${abTags(br.ab)}</span>`:''}</div>`; }).join('');
}
function teamHead(abbr){ const T=TEAM(abbr); return `<span class="hdT">${chipHTML(abbr)}<span class="tname">${T.zh}</span><span class="venue">${T.venue}</span></span>`; }
function refreshSelect(){
  if(typeof SSUI!=='undefined' && !SSUI.inited) setTimeout(()=>SSUI.init(),0);
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
$('again').onclick=()=>{ $('result').classList.add('hide'); if(GM&&GM.season&&typeof SSUI!=='undefined'){ $('intro').classList.remove('hide'); G.state='intro'; SFX.setActive(false); FX.reset(); $('contactReadout').classList.remove('show'); SSUI.show('season'); return; } $('start').onclick(); };
$('toMenu').onclick=()=>{ $('result').classList.add('hide'); $('intro').classList.remove('hide'); G.state='intro'; SFX.setActive(false); FX.reset(); $('contactReadout').classList.remove('show'); if(typeof SSUI!=='undefined') SSUI.render(); };
document.querySelector('.tcard').addEventListener('click',e=>{ if(e.target.closest('button')&&e.target.closest('button').id!=='start') SFX.play('select'); });

refreshSelect(); camSet('pitch');
new ResizeObserver(syncHudLayout).observe(document.querySelector('.panels'));
addEventListener('resize',resize); resize();
requestAnimationFrame(tick);

// 測試用參數：?game=DET-LAD&skip=1
const QS=new URLSearchParams(location.search);
if(QS.has('game')){ const [a,h]=QS.get('game').split('-'); $('intro').classList.add('hide'); startGame(a,h,QS.get('user')||a); if(QS.has('skip')) G.closeT=99; }
window.__G=G; window.__GM=()=>GM;
// 臉部樣品頁：?facelab=1
if(QS.has('facelab')){ const s=document.createElement('script'); s.src='facelab.js?v=32'; document.body.appendChild(s); }
