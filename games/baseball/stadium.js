'use strict';
/* =========================================================
   球場：草皮、內野、外野牆、本壘後方護牆、看台與觀眾、天空、燈塔、記分板
   由 game.js 在建好 scene／canvasTex／lam 之後呼叫 buildStadium()
   座標：本壘在原點、中外野往 -z；φ＝atan2(x,-z)（度），0＝中外野、+90＝一壘側、±180＝本壘後方
   判定用的牆在 fenceDist(φ)（全壘打牆）與 standDist(φ)（界外區牆），這裡只照著畫，不改形狀
   ========================================================= */
let boardMat=null, setBoardText=()=>{};
function buildStadium(){
  const D2R=Math.PI/180;
  const normPhi=p=>((p+180)%360+360)%360-180;
  const sd=p=>standDist(normPhi(p));                    // 界外區牆距離（φ 可超過 180）
  const smooth=(a,b,x)=>{ const t=Math.max(0,Math.min(1,(x-a)/(b-a))); return t*t*(3-2*t); };
  const rand=(()=>{ let s=12345; return ()=>((s=s*16807%2147483647)-1)/2147483646; })();
  const pickW=(list)=>{ let tot=0; for(const [,w] of list) tot+=w; let r=rand()*tot; for(const [v,w] of list){ if((r-=w)<=0) return v; } return list[0][0]; };
  const concrete=new THREE.MeshStandardMaterial({color:0xa7aba5,roughness:0.92});
  const steel=new THREE.MeshStandardMaterial({color:0x243a40,roughness:0.48,metalness:0.65});
  const trim=new THREE.MeshStandardMaterial({color:0xded7bf,roughness:0.65,metalness:0.15});
  const boxes=new Map(), beams=new Map(), dummy=new THREE.Object3D(), up=new THREE.Vector3(0,1,0);
  function box(w,h,d,x,y,z,yaw,mat){
    dummy.position.set(x,y,z); dummy.rotation.set(0,yaw,0); dummy.scale.set(w,h,d); dummy.updateMatrix();
    if(!boxes.has(mat)) boxes.set(mat,[]); boxes.get(mat).push(dummy.matrix.clone());
  }
  function beam(a,b,r,mat=steel){
    const delta=new THREE.Vector3().subVectors(b,a);
    dummy.position.copy(a).add(b).multiplyScalar(.5); dummy.quaternion.setFromUnitVectors(up,delta.clone().normalize()); dummy.scale.set(r,delta.length(),r); dummy.updateMatrix();
    if(!beams.has(mat)) beams.set(mat,[]); beams.get(mat).push(dummy.matrix.clone());
  }
  function detail(grass){
    const t=canvasTex(512,512,(g,w,h)=>{
      g.fillStyle=grass?'#929292':'#858585'; g.fillRect(0,0,w,h);
      for(let i=0;i<24000;i++){
        const v=(grass?85:55)+Math.floor(rand()*110); g.strokeStyle=`rgb(${v},${v},${v})`; g.fillStyle=g.strokeStyle;
        const x=rand()*w,y=rand()*h;
        if(grass){ g.lineWidth=.5+rand(); g.beginPath(); g.moveTo(x,y); g.lineTo(x+(rand()-.5)*2,y-2-rand()*5); g.stroke(); }
        else g.fillRect(x,y,.6+rand()*1.5,.6+rand()*1.5);
      }
    });
    t.colorSpace=THREE.NoColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; return t;
  }
  const turfDetail=detail(true); turfDetail.repeat.set(180,180);
  const clayDetail=detail(false); clayDetail.repeat.set(72,72);
  function surfaceScan(mat,url,mean,mask='1.0'){
    const ready={value:0}, scan=new THREE.TextureLoader().load(url,()=>ready.value=1);
    scan.colorSpace=THREE.NoColorSpace; scan.wrapS=scan.wrapT=THREE.RepeatWrapping; scan.anisotropy=8;
    mat.onBeforeCompile=shader=>{
      shader.uniforms.stadiumScan={value:scan}; shader.uniforms.stadiumScanReady=ready;
      shader.fragmentShader='uniform sampler2D stadiumScan;\nuniform float stadiumScanReady;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>\n float surfaceGrain=dot(texture2D(stadiumScan,vBumpMapUv).rgb,vec3(.299,.587,.114)); diffuseColor.rgb *= mix(1.0,clamp(surfaceGrain/${mean},.58,1.38),stadiumScanReady*(${mask}));`);
    };
    mat.customProgramCacheKey=()=>url+'|'+mask;
    return mat;
  }

  /* ---------- 傍晚天空：大氣漸層、落日光暈與高空薄雲 ---------- */
  {
    const tex=canvasTex(2048,1024,(g,W,H)=>{
      const gr=g.createLinearGradient(0,0,0,H*0.5);
      gr.addColorStop(0,'#182c53'); gr.addColorStop(0.36,'#315e8a'); gr.addColorStop(0.72,'#477ca3'); gr.addColorStop(0.91,'#628fae'); gr.addColorStop(1,'#abc1ca');
      g.fillStyle=gr; g.fillRect(0,0,W,H*0.5);
      g.fillStyle='#abc1ca'; g.fillRect(0,H*0.5,W,H*0.5);
      const glow=g.createRadialGradient(W*0.38,H*0.445,2,W*0.38,H*0.445,H*0.23);
      glow.addColorStop(0,'rgba(255,241,211,.9)'); glow.addColorStop(.18,'rgba(255,209,146,.45)'); glow.addColorStop(1,'rgba(255,210,155,0)'); g.fillStyle=glow; g.fillRect(0,0,W,H/2);
      for(let c=0;c<24;c++){
        const cx=rand()*W, cy=H*(0.18+rand()*0.25), n=5+Math.floor(rand()*8), s=10+rand()*25;
        for(let i=0;i<n;i++){
          const x=cx+(rand()-0.5)*s*4, y=cy+(rand()-0.5)*s*0.8, r=s*(0.6+rand()*0.8);
          const rg=g.createRadialGradient(x,y,0,x,y,r);
          rg.addColorStop(0,'rgba(255,232,208,.36)'); rg.addColorStop(0.6,'rgba(241,220,207,.1)'); rg.addColorStop(1,'rgba(255,255,255,0)');
          g.fillStyle=rg; g.beginPath(); g.ellipse(x,y,r*3.8,r*0.38,0,0,Math.PI*2); g.fill();
        }
      }
    });
    const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,48,24),new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false}));
    sky.renderOrder=-1; scene.add(sky);
    scene.background=new THREE.Color(0xc6b7aa);
    if(scene.fog){ scene.fog.color.set(0xc6b7aa); scene.fog.near=1050; scene.fog.far=2900; }
  }

  /* ---------- 地面：遠處的草 ---------- */
  {
    const t=canvasTex(256,256,(g,w,h)=>{ g.fillStyle='#406e30'; g.fillRect(0,0,w,h); noise(g,w,h,3000,['#3c682d','#457534','#3f6c2f'],2); });
    t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(60,60);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),new THREE.MeshLambertMaterial({map:t}));
    ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true; scene.add(ground);
  }

  /* ---------- 場地：割草條紋＋警戒區土帶（一張大貼圖，逐像素畫） ---------- */
  {
    const F={x0:-460,x1:460,z0:-860,z1:60}, W=2048, H=2048;
    const cv=document.createElement('canvas'); cv.width=W; cv.height=H; const g=cv.getContext('2d');
    const img=g.createImageData(W,H), d=img.data;
    const c1=[23,79,47], c2=[33,99,57], foul=[27,86,48], track=[116,82,58], track2=[106,73,51];
    const sq=30;
    for(let j=0;j<H;j++){
      const z=F.z0+(F.z1-F.z0)*(j+0.5)/H;
      for(let i=0;i<W;i++){
        const x=F.x0+(F.x1-F.x0)*(i+0.5)/W;
        const r=Math.hypot(x,z), phi=Math.atan2(x,-z)/D2R, a=Math.abs(phi);
        let col;
        const inFair=a<=45 && z<1;
        const tr = inFair ? (r>fenceDist(phi)-15) : (r>sd(phi)-12 && r>70);
        if(tr){ col=((i*7+j*13)%5)<2?track2:track; }
        else if(inFair){
          const k=Math.floor((x*.66-z*.75)/sq)&1;
          col=k?c1:c2;
        } else col=foul;
        const n=((i*92821+j*68917)%97)/97*5-2.5+Math.sin(x*.16+z*.12)*1.2;
        const o=(j*W+i)*4; d[o]=col[0]+n; d[o+1]=col[1]+n; d[o+2]=col[2]+n; d[o+3]=255;
      }
    }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8;
    const grassMat=surfaceScan(new THREE.MeshStandardMaterial({map:t,bumpMap:turfDetail,bumpScale:.14,roughness:.94}),'assets/materials/turf-v46.webp',.329,'step(sampledDiffuseColor.r*1.1,sampledDiffuseColor.g)');
    const m=new THREE.Mesh(new THREE.PlaneGeometry(F.x1-F.x0,F.z1-F.z0),grassMat);
    m.rotation.x=-Math.PI/2; m.position.set((F.x0+F.x1)/2,0,(F.z0+F.z1)/2); m.receiveShadow=true; scene.add(m);
  }

  /* ---------- 內野土、白線（透明處露出下面的草紋） ---------- */
  const DIRT='#986447';
  const IF={x0:-112,x1:112,z0:-172,z1:52,res:2048};
  {
    const infTex=canvasTex(IF.res,IF.res,(g,W,H)=>{
      const sx=W/(IF.x1-IF.x0), P=(x,z)=>[(x-IF.x0)*sx,(z-IF.z0)*sx], R=r=>r*sx;
      g.clearRect(0,0,W,H);
      g.save(); g.beginPath(); g.moveTo(...P(0,6)); g.lineTo(...P(-125,-119)); g.lineTo(...P(125,-119)); g.closePath(); g.clip();
      g.fillStyle=DIRT; g.beginPath(); g.arc(...P(0,-60.5),R(95),0,Math.PI*2); g.fill(); g.restore();
      g.lineCap='round'; g.strokeStyle=DIRT; g.lineWidth=R(7);
      g.beginPath(); g.moveTo(...P(0,0)); g.lineTo(...P(63.6,-63.6)); g.moveTo(...P(0,0)); g.lineTo(...P(-63.6,-63.6)); g.stroke();
      g.save(); g.globalCompositeOperation='destination-out'; g.beginPath(); const ins=10;
      g.moveTo(...P(0,-ins*1.6)); g.lineTo(...P(63.6-ins,-63.6)); g.lineTo(...P(0,-127.3+ins*1.4)); g.lineTo(...P(-63.6+ins,-63.6)); g.closePath(); g.fill(); g.restore();
      g.fillStyle=DIRT;
      g.beginPath(); g.arc(...P(0,0),R(14),0,Math.PI*2); g.fill();
      g.beginPath(); g.arc(...P(0,-60.5),R(9.5),0,Math.PI*2); g.fill();
      for(const b of [BASES.first,BASES.second,BASES.third]){ g.beginPath(); g.arc(...P(b.x,b.z),R(9),0,Math.PI*2); g.fill(); }
      g.save(); g.globalCompositeOperation='source-atop';
      g.globalAlpha=.12; noise(g,W,H,130000,['#82533c','#ac7c57','#956244','#b88a64'],1.5); g.globalAlpha=1;
      g.strokeStyle='rgba(246,210,166,.045)'; g.lineWidth=1;
      for(let r=20;r<95;r+=0.65){ g.beginPath(); g.arc(...P(0,-60.5),R(r),0,Math.PI*2); g.stroke(); }
      g.strokeStyle='rgba(76,44,27,.1)'; g.lineWidth=R(0.09);
      for(let i=0;i<170;i++){ const x=(rand()-0.5)*210,z=-rand()*160; g.beginPath(); g.moveTo(...P(x,z)); g.lineTo(...P(x+0.3+rand(),z+rand()*0.4)); g.stroke(); }
      const rg=g.createRadialGradient(...P(0,0),R(2),...P(0,0),R(13)); rg.addColorStop(0,'rgba(120,80,50,.35)'); rg.addColorStop(1,'rgba(120,80,50,0)');
      g.fillStyle=rg; g.beginPath(); g.arc(...P(0,0),R(13),0,Math.PI*2); g.fill();
      const mg=g.createRadialGradient(...P(0,-60.5),R(1),...P(0,-60.5),R(9)); mg.addColorStop(0,'rgba(130,90,60,.3)'); mg.addColorStop(1,'rgba(130,90,60,0)');
      g.fillStyle=mg; g.beginPath(); g.arc(...P(0,-60.5),R(9),0,Math.PI*2); g.fill();
      for(const s of [-1,1]) for(let i=0;i<36;i++){
        const x=s*(2+rand()*2),z=-1+rand()*4;
        g.strokeStyle='rgba(55,35,24,.18)'; g.lineWidth=R(.05+rand()*.09); g.beginPath(); g.ellipse(...P(x,z),R(.2+rand()*.3),R(.09),rand()*Math.PI,0,Math.PI*2); g.stroke();
      }
      g.restore();
      g.fillStyle='rgba(110,72,46,.28)'; for(const x0 of [1.25,-5.25]) g.fillRect(...P(x0+0.5,-2.5),R(3),R(5));
      g.strokeStyle='#f6f6f0'; g.lineWidth=R(0.33);
      g.beginPath(); g.moveTo(...P(0,0)); g.lineTo(...P(112,-112)); g.moveTo(...P(0,0)); g.lineTo(...P(-112,-112)); g.stroke();
      g.lineWidth=R(0.25);
      for(const x0 of [1.25,-5.25]) g.strokeRect(...P(x0,-3),R(4),R(6));
      g.beginPath(); g.moveTo(...P(-1.8,3)); g.lineTo(...P(-1.8,9)); g.lineTo(...P(1.8,9)); g.lineTo(...P(1.8,3)); g.stroke();
      g.beginPath(); g.moveTo(...P(33.3,-30.3)); g.lineTo(...P(66.6,-63.6)); g.stroke();
      g.fillStyle='#fafafa'; g.beginPath(); g.moveTo(...P(-0.708,-0.708)); g.lineTo(...P(0.708,-0.708)); g.lineTo(...P(0.708,0)); g.lineTo(...P(0,0.708)); g.lineTo(...P(-0.708,0)); g.closePath(); g.fill();
      for(const s of [-1,1]){ g.fillStyle='#b9775a'; g.beginPath(); g.arc(...P(s*38,14),R(2.6),0,Math.PI*2); g.fill(); g.strokeStyle='#f0f0ea'; g.lineWidth=R(0.2); g.stroke(); }
    });
    const dirtMat=surfaceScan(new THREE.MeshStandardMaterial({map:infTex,bumpMap:clayDetail,bumpScale:.065,roughness:1,transparent:true}),'assets/materials/clay-v46.webp',.414,'1.0-step(.68,min(sampledDiffuseColor.r,min(sampledDiffuseColor.g,sampledDiffuseColor.b)))');
    const infield=new THREE.Mesh(new THREE.PlaneGeometry(IF.x1-IF.x0,IF.z1-IF.z0),dirtMat);
    infield.rotation.x=-Math.PI/2; infield.position.set((IF.x0+IF.x1)/2,0.03,(IF.z0+IF.z1)/2); infield.receiveShadow=true; scene.add(infield);
  }
  for(const s of [-1,1]){
    const l=new THREE.Mesh(new THREE.PlaneGeometry(0.4,330-158),new THREE.MeshBasicMaterial({color:0xf4f4ef}));
    l.rotation.x=-Math.PI/2; l.rotation.z=-s*Math.PI/4; const mid=(158+330)/2/Math.SQRT2; l.position.set(s*mid,0.05,-mid); scene.add(l);
  }
  {
    const mt=canvasTex(512,512,(g,w,h)=>{ g.fillStyle=DIRT; g.fillRect(0,0,w,h); g.globalAlpha=.2; noise(g,w,h,22000,['#82533c','#ac7c57','#b88a64'],1.5); });
    const moundDetail=clayDetail.clone(); moundDetail.repeat.set(6,6); moundDetail.needsUpdate=true;
    const moundMat=surfaceScan(new THREE.MeshStandardMaterial({map:mt,bumpMap:moundDetail,bumpScale:.055,roughness:1}),'assets/materials/clay-v46.webp',.414);
    const mound=new THREE.Mesh(new THREE.CylinderGeometry(5.5,9.2,0.8,48),moundMat); mound.position.set(0,0.4,-60.5); mound.receiveShadow=true; scene.add(mound);
    const rubber=new THREE.Mesh(new THREE.BoxGeometry(2,0.12,0.5),lam(0xffffff)); rubber.position.set(0,0.83,-60.5); scene.add(rubber);
    for(const b of [BASES.first,BASES.second,BASES.third]){const m=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.3,1.4),lam(0xffffff));m.position.set(b.x,0.15,b.z);m.rotation.y=Math.PI/4;m.castShadow=true;scene.add(m);}
    const home=new THREE.Shape(); home.moveTo(-.708,.708); home.lineTo(.708,.708); home.lineTo(.708,0); home.lineTo(0,-.708); home.lineTo(-.708,0); home.closePath();
    const plate=new THREE.Mesh(new THREE.ExtrudeGeometry(home,{depth:.05,bevelEnabled:true,bevelSize:.015,bevelThickness:.015,bevelSegments:1,steps:1}),new THREE.MeshStandardMaterial({color:0xf4efe4,roughness:.8}));
    plate.rotation.x=-Math.PI/2; plate.position.y=.055; plate.receiveShadow=true; scene.add(plate);
  }

  /* ---------- 共用：沿著 φ 的環狀帶，u 依弧長 ---------- */
  function ring(f0,f1,steps,inner,outer,y0,y1,mat,uLen=0){
    const pos=[],uv=[],idx=[]; let arc=0, prev=null;
    for(let i=0;i<=steps;i++){
      const phi=f0+(f1-f0)*i/steps, a=phi*D2R, ri=inner(phi), ro=outer(phi);
      const p=[Math.sin(a)*ri,-Math.cos(a)*ri]; if(prev) arc+=Math.hypot(p[0]-prev[0],p[1]-prev[1]); prev=p;
      pos.push(p[0],y0(phi),p[1], Math.sin(a)*ro,y1(phi),-Math.cos(a)*ro);
      const u=uLen?arc/uLen:i/steps; uv.push(u,0,u,1);
      if(i<steps){const k=i*2; idx.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); g.setIndex(idx); g.computeVertexNormals();
    mat.side=THREE.DoubleSide; const m=new THREE.Mesh(g,mat); scene.add(m); return m;
  }
  const C=v=>()=>v;

  /* ---------- 廣告（虛構品牌） ---------- */
  const ADS=[['#173e43','#eee9db','PAWA COLA'],['#ded7bf','#213b40','STRIKE BANK'],['#2a4851','#f5e2ba','HOMERUN AIR'],['#142b33','#dac693','GRAND SLAM'],
             ['#b4a47e','#172f39','DIAMOND TV'],['#1e4c45','#eee9db','FASTBALL'],['#e2dac7','#233d43','實況野球風'],['#223d4a','#dae1db','NINE INNINGS'],
             ['#5f3434','#eee1ce','MLB 2026'],['#d4d2be','#315343','GREEN FIELD']];
  function adStrip(h=128,panels=ADS){
    const t=canvasTex(2048,h,(g,w,hh)=>{
      const pw=w/panels.length;
      panels.forEach((a,i)=>{ g.fillStyle=a[0]; g.fillRect(i*pw,0,pw,hh);
        g.fillStyle=a[1]; g.font=`900 ${Math.round(hh*0.32)}px "Noto Sans TC",Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(a[2],i*pw+pw/2,hh/2+3,pw*0.78);
        g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(i*pw+pw-3,0,3,hh); });
    });
    t.wrapS=THREE.RepeatWrapping; return t;
  }
  const adTex=adStrip();

  /* ---------- 外野全壘打牆：藍色軟墊＋白色廣告字＋距離 ---------- */
  {
    const t=canvasTex(2048,128,(g,w,h)=>{
      const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#254e43'); gr.addColorStop(0.18,'#183e36'); gr.addColorStop(1,'#102d29');
      g.fillStyle=gr; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(0,0,0,.18)'; for(let i=0;i<w;i+=w/48) g.fillRect(i,0,2,h);
      g.strokeStyle='rgba(255,255,255,.1)'; g.lineWidth=1; g.beginPath(); g.moveTo(0,4); g.lineTo(w,4); g.moveTo(0,h-4); g.lineTo(w,h-4); g.stroke();
      g.fillStyle='#ffffff'; g.textAlign='center'; g.textBaseline='middle';
      const words=['DIAMOND PARK','NINE INNINGS','PAWA BASEBALL','PLAY BALL'];
      for(let i=0;i<8;i++){ g.font='700 25px Arial,sans-serif'; g.fillText(words[i%4],(i+0.5)*w/8,h/2+2,w/8-52); }
    });
    ring(-45,45,120,fenceDist,fenceDist,C(0),C(FENCE_H),new THREE.MeshStandardMaterial({map:t,roughness:0.7}));
    ring(-45,45,120,fenceDist,p=>fenceDist(p)+0.8,C(FENCE_H),C(FENCE_H),new THREE.MeshBasicMaterial({color:0xffd23a}));
    // 距離數字：牆頂上的小白牌
    for(const p of [-45,-22,0,22,45]){ const n=String(Math.round(fenceDist(p))), a=p*D2R, r=fenceDist(p)-0.2;
      const nt=canvasTex(128,64,(g,w,h)=>{ g.fillStyle='#173e36'; g.fillRect(0,0,w,h); g.fillStyle='#f3e7c7'; g.font='900 46px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(n,w/2,h/2+2); });
      const m=new THREE.Mesh(new THREE.PlaneGeometry(10,5),new THREE.MeshBasicMaterial({map:nt})); m.position.set(Math.sin(a)*r,FENCE_H+3,-Math.cos(a)*r); m.rotation.y=-a; scene.add(m); }
  }
  for(const s of [-1,1]){ const d=fenceDist(45)+0.5;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,70,10),new THREE.MeshLambertMaterial({color:0xffd23a,emissive:0x332800})); m.position.set(s*d*Math.SQRT1_2,35,-d*Math.SQRT1_2); scene.add(m);
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(2.4,40),new THREE.MeshBasicMaterial({color:0xffd23a,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
    fl.position.set(s*(d*Math.SQRT1_2)+s*1.3,40,-d*Math.SQRT1_2+1.3); fl.rotation.y=s*Math.PI/4; scene.add(fl); }

  /* ---------- 界外區與本壘後方的護牆：藍色軟墊＋廣告 ---------- */
  const wallH=p=>{ const a=Math.abs(normPhi(p)); return 5+5*smooth(118,142,a); };
  {
    const pad=canvasTex(1024,128,(g,w,h)=>{ g.fillStyle='#153d36'; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(0,0,0,.28)'; for(let i=0;i<w;i+=64) g.fillRect(i,0,3,h);
      g.fillStyle='rgba(255,255,255,.08)'; for(let i=0;i<w;i+=64) g.fillRect(i+5,8,52,h-16); });
    pad.wrapS=THREE.RepeatWrapping;
    ring(45,315,240,sd,sd,C(0),p=>wallH(p)*0.45,new THREE.MeshLambertMaterial({map:pad}),36);
    ring(45,315,240,sd,sd,p=>wallH(p)*0.45,wallH,new THREE.MeshLambertMaterial({map:adTex}),300);
    ring(45,315,240,sd,p=>sd(p)+2.5,wallH,wallH,steel);
    const net=canvasTex(128,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle='rgba(25,30,40,.5)'; g.lineWidth=1.5;
      for(let i=0;i<=w;i+=12){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); } });
    net.wrapS=net.wrapT=THREE.RepeatWrapping; net.repeat.set(1,8);
    ring(138,222,80,p=>sd(p)-0.3,p=>sd(p)-0.3,wallH,C(46),new THREE.MeshBasicMaterial({map:net,transparent:true,depthWrite:false}),8);
    for(const p of [138,162,198,222]){ const a=p*D2R, r=sd(p)-0.3;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,46,6),lam(0x6a7280)); pole.position.set(Math.sin(a)*r,23,-Math.cos(a)*r); scene.add(pole); }
  }

  /* ---------- 休息區 ---------- */
  const wood=new THREE.MeshStandardMaterial({color:0x8d6543,roughness:.8});
  const dugoutSign=canvasTex(512,64,(g,w,h)=>{ g.fillStyle='#193c3a'; g.fillRect(0,0,w,h); g.fillStyle='#e3d6b5'; g.font='800 27px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('PAWA BASEBALL  /  THE CLUBHOUSE',w/2,h/2,w-28); });
  for(const s of [-1,1]){
    const p=s*112, a=p*D2R, r=sd(p)-4.5, x=Math.sin(a)*r, z=-Math.cos(a)*r;
    const yaw=Math.atan2(-x,-z), at=(xx,yy,zz)=>new THREE.Vector3(x+Math.cos(yaw)*xx+Math.sin(yaw)*zz,yy,z-Math.sin(yaw)*xx+Math.cos(yaw)*zz);
    const block=(w,h,d,xx,yy,zz,mat)=>{ const v=at(xx,yy,zz); box(w,h,d,v.x,v.y,v.z,yaw,mat); };
    block(45,7,.8,0,3.5,-4,steel); block(47,.7,10,0,7.1,0,steel); block(46,.35,9,0,.15,0,concrete);
    for(const xx of [-22.5,22.5]) block(.8,7,9,xx,3.5,0,steel);
    for(const zz of [-3.1,-2.6,-2.1]) block(39,.28,.42,0,1.2,zz,wood);
    for(const yy of [1.8,2.35]) block(39,.45,.2,0,yy,-3.7,wood);
    for(const xx of [-18,-9,0,9,18]) { block(.3,1.3,2,xx,.6,-2.6,steel); beam(at(xx,0,4),at(xx,3.5,4),.08,trim); }
    beam(at(-22,3.5,4),at(22,3.5,4),.11,trim);
    block(44,.15,.25,0,6.55,4.5,trim);
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(43,.9),new THREE.MeshBasicMaterial({map:dugoutSign})); sign.position.copy(at(0,7.05,5.05)); sign.rotation.y=yaw; scene.add(sign);
    for(let i=0;i<5;i++){ beam(at(-19+i*.6,.4,-3.3),at(-19+i*.6,3.3,-3.3),.08,wood); beam(at(-19+i*.6,2,-3.3),at(-19+i*.6,3.3,-3.3),.14,wood); }
  }

  /* ---------- 分區看台、走道、包廂與懸挑鋼構屋頂 ---------- */
  function mergeBoxes(list){
    const pos=[],nor=[];
    for(const [w,h,d,x,y,z] of list){ const b=new THREE.BoxGeometry(w,h,d).toNonIndexed(); b.translate(x,y,z);
      pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array); b.dispose(); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); return g;
  }
  const seatGeo=mergeBoxes([[1.7,0.25,1.3,0,0.95,0.05],[1.7,1.3,0.2,0,1.5,-0.6]]);
  const bodyGeo=new THREE.CylinderGeometry(0.52,0.62,1.6,6,1); bodyGeo.scale(1,1,0.75); bodyGeo.translate(0,1.55,0);
  const headGeo=new THREE.IcosahedronGeometry(0.43,0); headGeo.translate(0,2.8,0.05);
  const capGeo=new THREE.SphereGeometry(0.45,8,4,0,Math.PI*2,0,Math.PI/2); capGeo.translate(0,2.9,0.05);
  const SHIRT=[['#f3eee2',26],['#3066a0',16],['#20343d',10],['#c74843',10],['#91a5ae',8],['#292e31',9],['#deb661',4],['#82aab7',6],['#437861',3],['#c47b42',3],['#b17682',2]];
  const SKIN=[['#e7bb96',5],['#d7a17d',5],['#bc8057',3],['#935d3f',2],['#6e452c',1]];
  const seats=[], fans=[];
  const ROWS=18, DEPTH=2.9, RISE=1.38;
  const wallTop=p=>{ const a=Math.abs(normPhi(p)); return a<=45?FENCE_H+3:wallH(p)+1.2; };
  const deckR0=p=>{ const a=Math.abs(normPhi(p)); return a<=45?fenceDist(normPhi(p))+9:sd(p)+3; };
  const deckTop=p=>wallTop(p)+ROWS*RISE;
  const deckBack=p=>deckR0(p)+ROWS*DEPTH;
  const BEYE=8.5;
  const aisle=p=>Math.abs(((p+6)%12+12)%12-6);
  function deck(f0,f1,skip=()=>false){
    for(let row=0;row<ROWS;row++){
      let phi=f0;
      while(phi<f1){
        const r=deckR0(phi)+row*DEPTH, y=wallTop(phi)+row*RISE, a=phi*D2R;
        if(!skip(phi)&&aisle(phi)>2.4/r/D2R){
          const f=[Math.sin(a)*r,y,-Math.cos(a)*r,-a+(rand()-.5)*.1];
          seats.push(f); if(rand()<.79) fans.push(f);
        }
        phi+=2.2/r/D2R;
      }
    }
    const steps=Math.max(24,Math.round((f1-f0)*1.2));
    ring(f0,f1,steps,p=>deckR0(p)-1.5,deckBack,p=>wallTop(p)-.2,p=>deckTop(p)-.2,concrete);
    for(let phi=Math.ceil(f0/12)*12;phi<f1;phi+=12){
      if(skip(phi)) continue;
      const a=phi*D2R;
      for(let row=0;row<ROWS;row++){
        const r=deckR0(phi)+(row+.5)*DEPTH;
        box(4.5,.22,DEPTH,Math.sin(a)*r,wallTop(phi)+row*RISE+.05,-Math.cos(a)*r,-a,concrete);
      }
      for(const s of [-1,1]){
        const x=Math.sin(a)*(deckR0(phi)+4)+Math.cos(a)*s*2.4, z=-Math.cos(a)*(deckR0(phi)+4)+Math.sin(a)*s*2.4;
        beam(new THREE.Vector3(x,wallTop(phi)+1,z),new THREE.Vector3(Math.sin(a)*(deckBack(phi)-3)+Math.cos(a)*s*2.4,deckTop(phi)+1,-Math.cos(a)*(deckBack(phi)-3)+Math.sin(a)*s*2.4),.075,steel);
      }
    }
  }
  deck(-45,45,p=>Math.abs(p)<BEYE);
  deck(45,315);
  const brick=canvasTex(512,256,(g,w,h)=>{
    g.fillStyle='#836348'; g.fillRect(0,0,w,h);
    for(let y=0;y<h;y+=16) for(let x=-24;x<w;x+=48){
      const v=Math.floor(rand()*18); g.fillStyle=`rgb(${100+v},${63+v},${43+v})`; g.fillRect(x+(y%32?24:0)+1,y+1,46,14);
      g.fillStyle='rgba(225,181,130,.1)'; g.fillRect(x+(y%32?24:0)+2,y+2,44,1);
    }
  }); brick.wrapS=brick.wrapT=THREE.RepeatWrapping; brick.repeat.set(1,2);
  const brickMat=new THREE.MeshStandardMaterial({map:brick,roughness:.9});
  const glass=canvasTex(512,128,(g,w,h)=>{
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#648a97'); gr.addColorStop(.48,'#345662'); gr.addColorStop(.5,'#c6aa79'); gr.addColorStop(1,'#203d43'); g.fillStyle=gr; g.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=32){ g.fillStyle='#142b32'; g.fillRect(x,0,3,h); g.fillStyle='rgba(255,222,157,.38)'; if(rand()<.32) g.fillRect(x+5,30,22,70); }
    g.fillStyle='#293c40'; g.fillRect(0,h*.7,w,3);
  }); glass.wrapS=THREE.RepeatWrapping;
  const glassMat=new THREE.MeshStandardMaterial({map:glass,roughness:.28,metalness:.35,emissive:0x5d482b,emissiveIntensity:.14});
  const ribbon=canvasTex(2048,128,(g,w,h)=>{
    g.fillStyle='#101e28'; g.fillRect(0,0,w,h); g.fillStyle='#d8c79c'; g.fillRect(0,0,w,3); g.fillRect(0,h-3,w,3);
    g.font='800 34px Arial'; g.textBaseline='middle'; g.textAlign='center';
    for(let i=0;i<4;i++) { g.fillStyle=i%2?'#d6e2d9':'#e5be71'; g.fillText(['PAWA BASEBALL','NINE INNINGS','WELCOME TO THE BALLPARK','PLAY BALL 2026'][i],w*(i+.5)/4,h/2,w/4-40); }
    g.fillStyle='rgba(255,255,255,.025)'; for(let y=8;y<h;y+=4) g.fillRect(0,y,w,1);
  }); ribbon.wrapS=THREE.RepeatWrapping;
  const ledMat=new THREE.MeshBasicMaterial({map:ribbon,toneMapped:false});
  const roofMat=new THREE.MeshStandardMaterial({color:0xc4c0ad,roughness:.67,metalness:.3});
  const sections=[[-45,-BEYE-1],[BEYE+1,45],[51,136],[136,224],[224,309]];
  for(const [a,b] of sections){
    const steps=Math.ceil((b-a)*1.3), r=p=>deckBack(p)+7, y=p=>deckTop(p)+14;
    ring(a,b,steps,deckBack,deckBack,p=>wallTop(p),p=>deckTop(p)+3,brickMat,40);
    ring(a,b,steps,p=>deckBack(p)-1,p=>deckBack(p)-1,p=>deckTop(p)+1,p=>deckTop(p)+4,ledMat,190);
    ring(a,b,steps,r,r,p=>deckTop(p)+5,p=>deckTop(p)+12,glassMat,30);
    ring(a,b,steps,p=>r(p)-2,p=>r(p)+8,p=>deckTop(p)+12,p=>deckTop(p)+12,trim);
    ring(a,b,steps,p=>r(p)-2,p=>r(p)-2,p=>deckTop(p)+12,p=>deckTop(p)+13,trim);
    const upperRows=9;
    ring(a,b,steps,p=>r(p)+8,p=>r(p)+38,y,p=>y(p)+upperRows*1.85,concrete);
    for(let row=0;row<upperRows;row++){
      for(let phi=a;phi<b;){
        const radius=r(phi)+9+row*3.2, theta=phi*D2R;
        if(aisle(phi)>2.2/radius/D2R){ const f=[Math.sin(theta)*radius,y(phi)+row*1.85,-Math.cos(theta)*radius,-theta]; seats.push(f); if(rand()<.75) fans.push(f); }
        phi+=2.4/radius/D2R;
      }
    }
    for(let phi=Math.ceil(a/12)*12;phi<b;phi+=12){
      const theta=phi*D2R;
      for(let row=0;row<upperRows;row++){
        const radius=r(phi)+9+(row+.5)*3.2;
        box(4.5,.22,3.2,Math.sin(theta)*radius,y(phi)+row*1.85+.08,-Math.cos(theta)*radius,-theta,concrete);
      }
    }
    const roofY=p=>deckTop(p)+39;
    ring(a,b,steps,p=>r(p)-6,p=>r(p)+42,p=>roofY(p)-3,roofY,roofMat);
    ring(a,b,steps,p=>r(p)-6,p=>r(p)-6,p=>roofY(p)-3.8,p=>roofY(p)-3,steel);
    ring(a,b,steps,p=>r(p)-6.1,p=>r(p)-6.1,p=>roofY(p)-3.65,p=>roofY(p)-3.35,new THREE.MeshBasicMaterial({color:0xffdca4,toneMapped:false}));
    for(let phi=a+2;phi<b;phi+=7){
      const theta=phi*D2R, front=r(phi)-5, back=r(phi)+39, yy=roofY(phi);
      const at=(rr,hh)=>new THREE.Vector3(Math.sin(theta)*rr,hh,-Math.cos(theta)*rr);
      beam(at(back,y(phi)+8),at(back,yy),.36);
      beam(at(front,yy-3.7),at(back,yy-.5),.2);
      beam(at(front,yy-6),at(back,yy-3),.16);
      for(let i=0;i<5;i++){
        const r0=front+(back-front)*i/5,r1=front+(back-front)*(i+1)/5;
        beam(at(r0,yy-5.7+(r0-front)/(back-front)*2.5),at(r1,yy-3.7+(r1-front)/(back-front)*3.2),.09);
      }
      box(.8,8,1,Math.sin(theta)*r(phi),deckTop(phi)+8,-Math.cos(theta)*r(phi),-theta,trim);
    }
  }
  ring(-45,45,120,p=>fenceDist(p)+.8,p=>fenceDist(p)+9,C(FENCE_H),C(FENCE_H+3),steel);
  ring(45,315,240,p=>sd(p)+2.5,p=>sd(p)+2.5,wallH,p=>wallH(p)+.7,trim);
  {
    const dummy=new THREE.Object3D(), col=new THREE.Color();
    const seatMesh=new THREE.InstancedMesh(seatGeo,new THREE.MeshLambertMaterial(),seats.length);
    seats.forEach(([x,y,z,yaw],i)=>{ dummy.position.set(x,y,z); dummy.rotation.set(0,yaw,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); seatMesh.setMatrixAt(i,dummy.matrix);
      seatMesh.setColorAt(i,col.set(rand()<.85?'#244d49':'#3a625b')); });
    const n=fans.length;
    const bodyMesh=new THREE.InstancedMesh(bodyGeo,new THREE.MeshLambertMaterial(),n);
    const headMesh=new THREE.InstancedMesh(headGeo,new THREE.MeshLambertMaterial(),n);
    const capFans=fans.filter(()=>rand()<0.35);
    const capMesh=new THREE.InstancedMesh(capGeo,new THREE.MeshLambertMaterial(),capFans.length);
    const stands=new Map();
    fans.forEach((f,i)=>{ const [x,y,z,yaw]=f;
      const stand=rand()<0.12, s=0.92+rand()*0.16; stands.set(f,stand);
      dummy.position.set(x+(rand()-0.5)*0.3,y+(stand?0.5:0),z); dummy.rotation.set(0,yaw,0); dummy.scale.set(s,s*(stand?1.15:1),s); dummy.updateMatrix();
      bodyMesh.setMatrixAt(i,dummy.matrix); headMesh.setMatrixAt(i,dummy.matrix);
      bodyMesh.setColorAt(i,col.set(pickW(SHIRT))); headMesh.setColorAt(i,col.set(pickW(SKIN)));
    });
    capFans.forEach((f,i)=>{ const [x,y,z,yaw]=f, st=stands.get(f); dummy.position.set(x,y+(st?0.5:0),z); dummy.rotation.set(0,yaw,0); dummy.scale.set(1,st?1.15:1,1); dummy.updateMatrix(); capMesh.setMatrixAt(i,dummy.matrix);
      capMesh.setColorAt(i,col.set(pickW([['#244b63',5],['#22343e',3],['#963d39',2],['#262626',2],['#dfddcf',1]]))); });
    for(const m of [seatMesh,bodyMesh,headMesh,capMesh]){ m.instanceMatrix.needsUpdate=true; if(m.instanceColor) m.instanceColor.needsUpdate=true; scene.add(m); }
    console.log('[stadium] seats',seats.length,'fans',n);
  }

  /* ---------- 球場外的城市：玻璃帷幕大樓 ---------- */
  {
    const facade=(base,glass,frame)=>canvasTex(256,512,(g,w,h)=>{
      g.fillStyle=base; g.fillRect(0,0,w,h);
      for(let y=6;y<h;y+=16) for(let x=6;x<w;x+=16){
        const lit=rand(); g.fillStyle=lit<0.12?'#e8eef4':lit<0.55?glass:frame; g.fillRect(x,y,11,11); }
      const gr=g.createLinearGradient(0,0,w,0); gr.addColorStop(0,'rgba(255,255,255,.12)'); gr.addColorStop(0.5,'rgba(255,255,255,0)'); gr.addColorStop(1,'rgba(0,0,0,.12)');
      g.fillStyle=gr; g.fillRect(0,0,w,h);
    });
    const kinds=[facade('#6c7c8e','#8fa8c4','#56667a'),facade('#9aa6b2','#b4c6d8','#7c8896'),facade('#4a5a6e','#6f8cae','#3e4c5e'),facade('#c4c2bc','#9fb2c4','#a8a49c')];
    kinds.forEach(t=>{ t.wrapS=t.wrapT=THREE.RepeatWrapping; });
    const parts=kinds.map(()=>({pos:[],nor:[],uv:[]}));
    const addBox=(k,x,z,w,d,h,rot)=>{
      const b=new THREE.BoxGeometry(w,h,d).toNonIndexed(); b.rotateY(rot); b.translate(x,h/2-2,z);
      const uv=b.attributes.uv.array, nrm=b.attributes.normal.array;
      for(let i=0;i<uv.length/2;i++){ const ny=Math.abs(nrm[i*3+1]); const sx=ny>0.5?0:(Math.abs(nrm[i*3])>0.5?d:w);
        uv[i*2]*=ny>0.5?0:sx/60; uv[i*2+1]*=ny>0.5?0:h/120; }
      const P=parts[k]; P.pos.push(...b.attributes.position.array); P.nor.push(...nrm); P.uv.push(...uv);
    };
    const place=(f0,f1,count,r0,r1,h0,h1)=>{ for(let i=0;i<count;i++){
      const p=f0+(f1-f0)*rand(), r=r0+(r1-r0)*rand(), a=p*D2R, x=Math.sin(a)*r, z=-Math.cos(a)*r;
      const h=h0+(h1-h0)*Math.pow(rand(),1.6), w=40+rand()*70, d=40+rand()*60;
      addBox(Math.floor(rand()*kinds.length),x,z,w,d,h,rand()*Math.PI);
      if(rand()<0.35) addBox(Math.floor(rand()*kinds.length),x+(rand()-0.5)*20,z+(rand()-0.5)*20,w*0.6,d*0.6,h+30+rand()*60,rand()*Math.PI);
    } };
    place(-80,80,30,1500,2300,90,330);      // 外野方向（打擊視角的背景），稀疏、遠
    place(125,235,14,900,1500,60,240);      // 本壘後方（投球視角的背景）
    parts.forEach((P,k)=>{ if(!P.pos.length) return;
      const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(P.pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(P.nor,3)); g.setAttribute('uv',new THREE.Float32BufferAttribute(P.uv,2));
      const m=new THREE.Mesh(g,new THREE.MeshLambertMaterial({map:kinds[k]})); scene.add(m); });
  }

  /* ---------- 四組鋼構燈塔與矩陣 LED 燈組 ---------- */
  {
    const lamps=canvasTex(1024,384,(g,w,h)=>{
      g.fillStyle='#13262c'; g.fillRect(0,0,w,h);
      for(let y=0;y<4;y++) for(let x=0;x<12;x++){
        const xx=12+x*84,yy=10+y*94;
        g.fillStyle='#758084'; g.fillRect(xx,yy,72,80); g.fillStyle='#182b33'; g.fillRect(xx+3,yy+3,66,74);
        const gr=g.createLinearGradient(0,yy,0,yy+80); gr.addColorStop(0,'#b8d2db'); gr.addColorStop(.5,'#f9f1d5'); gr.addColorStop(1,'#dae7e3'); g.fillStyle=gr; g.fillRect(xx+8,yy+9,56,60);
        g.fillStyle='rgba(71,85,86,.35)'; for(let i=0;i<6;i++) g.fillRect(xx+8,yy+12+i*10,56,1);
        g.fillStyle='#d4dcce'; for(const dx of [4,65]) for(const dy of [4,73]) g.fillRect(xx+dx,yy+dy,2,2);
      }
    });
    const halo=canvasTex(128,128,(g,w,h)=>{ const r=g.createRadialGradient(w/2,h/2,0,w/2,h/2,w/2); r.addColorStop(0,'rgba(255,245,210,.2)'); r.addColorStop(.25,'rgba(242,223,177,.07)'); r.addColorStop(1,'rgba(255,245,210,0)'); g.fillStyle=r; g.fillRect(0,0,w,h); });
    for(const p of [-24,24,-122,122]){
      const r=deckBack(p)+58,a=p*D2R,x=Math.sin(a)*r,z=-Math.cos(a)*r,h=Math.abs(p)<90?70:118;
      const at=(dx,yy,dz)=>new THREE.Vector3(x+Math.cos(a)*dx+Math.sin(a)*dz,yy,z+Math.sin(a)*dx-Math.cos(a)*dz);
      for(const dx of [-5,5]) beam(at(dx,0,0),at(dx*.36,h,0),.32,trim);
      for(let y=3;y<h-6;y+=10){
        const half=5-(y/h)*3.2; beam(at(-half,y,0),at(half,y+10,0),.14); beam(at(half,y,0),at(-half,y+10,0),.14);
        beam(at(-half,y,0),at(half,y,0),.13);
      }
      for(const dx of [-21,21]) { beam(at(0,h-4,0),at(dx,h+14,0),.26); beam(at(dx,h+14,0),at(dx,h+24,-2),.2); }
      box(54,23,2.4,x,h+25,z,-a,steel);
      const panel=new THREE.Mesh(new THREE.PlaneGeometry(52,20),new THREE.MeshBasicMaterial({map:lamps,toneMapped:false}));
      panel.position.copy(at(0,h+25,-3)); panel.rotation.set(-.14,-a,0); scene.add(panel);
      const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:halo,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));
      glow.position.copy(at(0,h+25,-4.6)); glow.scale.set(86,48,1); scene.add(glow);
    }
  }

  /* ---------- 寬幅記分板：真實打序、即時比分與局數 ---------- */
  boardMat=new THREE.MeshBasicMaterial({toneMapped:false});
  const BOARD={a:'PLAY BALL',b:'2026',lu:null,score:null,key:''};
  function drawBoard(){
    if(!boardMat.map) boardMat.map=canvasTex(1600,600,()=>{});
    const cv=boardMat.map.image,g=cv.getContext('2d'),w=cv.width,h=cv.height;
    g.clearRect(0,0,w,h); g.fillStyle='#0a1821'; g.fillRect(0,0,w,h);
    const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#203c43'); gr.addColorStop(1,'#0b1822'); g.fillStyle=gr; g.fillRect(410,64,780,h-80);
    g.strokeStyle='#d8c295'; g.lineWidth=3; g.strokeRect(3,3,w-6,h-6);
    g.fillStyle='#d8c295'; g.fillRect(0,0,w,57); g.fillStyle='#142c32'; g.font='900 28px Arial'; g.textBaseline='middle'; g.textAlign='left'; g.fillText('PAWA  /  THE BALLPARK',28,29);
    g.textAlign='right'; g.font='700 24px Arial'; g.fillText('MAJOR LEAGUE BASEBALL  •  2026',w-28,29);
    if(BOARD.lu){
      [[BOARD.lu.at,BOARD.lu.an,28],[BOARD.lu.ht,BOARD.lu.hn,1202]].forEach(([t,names,x])=>{
        g.fillStyle=TEAM(t).colors[0]; g.fillRect(x,77,370,48); g.fillStyle='#fff'; g.textAlign='center'; g.font='900 30px Arial'; g.fillText(t+'  LINEUP',x+185,102);
        (names||[]).slice(0,9).forEach((n,i)=>{ const y=157+i*45;
          g.fillStyle=i%2?'#112630':'#172e37'; g.fillRect(x,y-20,370,42);
          g.textAlign='left'; g.fillStyle='#d9c295'; g.font='900 27px Arial'; g.fillText(String(i+1),x+14,y);
          g.fillStyle='#e6eee7'; g.font='700 28px "Noto Sans TC",Arial'; g.fillText(n,x+52,y,305);
        });
        g.fillStyle='#7f9c9c'; g.font='700 20px Arial'; g.textAlign='center'; g.fillText(x<400?'AWAY TEAM':'HOME TEAM',x+185,570);
      });
      const sc=BOARD.score;
      g.textAlign='center'; g.fillStyle='#e3e9e0'; g.font='900 42px Arial'; g.fillText(BOARD.lu.at,600,142); g.fillText(BOARD.lu.ht,1000,142);
      g.fillStyle='#f7e7ba'; g.font='900 156px "Rubik",Arial'; g.fillText(String(sc?sc.a:0),600,263); g.fillText(String(sc?sc.h:0),1000,263);
      g.fillStyle='#7f999a'; g.font='700 28px Arial'; g.fillText('VS',800,256);
      g.fillStyle='#d5dfd7'; g.font='900 32px "Noto Sans TC",Arial'; g.fillText(sc?`${sc.inning} ${sc.half==='top'?'▲ 局上':'▼ 局下'}`:'PLAY BALL',800,355);
      if(sc){
        g.font='700 23px Arial';
        [['B',sc.balls,3,568,'#8cb691'],['S',sc.strikes,2,780,'#e4c774'],['O',sc.outs,2,964,'#d38878']].forEach(([label,n,total,x,col])=>{
          g.fillStyle='#d5dfd7'; g.textAlign='left'; g.fillText(label,x,405);
          for(let i=0;i<total;i++){ g.fillStyle=i<n?col:'#304b52'; g.beginPath(); g.arc(x+38+i*27,405,8,0,Math.PI*2); g.fill(); }
        });
      }
    }else{ g.textAlign='center'; g.fillStyle='#ead3a1'; g.font='900 86px Arial'; g.fillText('PLAY BALL',800,270); }
    g.textAlign='center'; g.fillStyle='#d8c295'; g.font='900 41px "Noto Sans TC",Arial'; g.fillText(BOARD.a,800,482,700);
    g.fillStyle='#aec3be'; g.font='700 25px "Noto Sans TC",Arial'; g.fillText(BOARD.b,800,549,720);
    g.fillStyle='rgba(2,10,15,.13)'; for(let y=64;y<h;y+=3) g.fillRect(8,y,w-16,1);
    boardMat.map.needsUpdate=true;
  }
  setBoardText=function(a,b){ BOARD.a=a; BOARD.b=b; BOARD.lu=null; BOARD.score=null; BOARD.key=''; drawBoard(); };
  window.setBoardLineups=function(at,an,ht,hn){ BOARD.lu={at,an,ht,hn}; drawBoard(); };
  window.setStadiumScore=function(g){
    const s={a:g.away.runs,h:g.home.runs,inning:g.inning,half:g.half,balls:g.balls,strikes:g.strikes,outs:g.outs},key=Object.values(s).join('|');
    if(key===BOARD.key) return; BOARD.key=key; BOARD.score=s; drawBoard();
  };
  drawBoard();
  {
    const r=fenceDist(0)+9,top=deckTop(0),W=128,H=48,z=-(r+ROWS*DEPTH*.55),y=top+7+H/2;
    const eye=canvasTex(512,256,(g,w,h)=>{
      g.fillStyle='#0d2520'; g.fillRect(0,0,w,h); g.fillStyle='rgba(255,255,255,.045)';
      for(let xx=0;xx<w;xx+=16) g.fillRect(xx,0,2,h);
      g.fillStyle='rgba(0,0,0,.18)'; for(let xx=14;xx<w;xx+=16) g.fillRect(xx,0,2,h);
    }); eye.wrapS=eye.wrapT=THREE.RepeatWrapping; eye.repeat.set(1,2);
    const eyeMat=new THREE.MeshStandardMaterial({map:eye,roughness:1});
    ring(-BEYE,BEYE,32,p=>fenceDist(p)+8.5,p=>fenceDist(p)+8.5,C(FENCE_H),C(top+3),eyeMat);
    ring(-BEYE,BEYE,32,p=>fenceDist(p)+8.5,deckBack,C(top+3),C(top+3),steel);
    box(W+6,H+6,5,0,y,z-3,0,steel);
    for(const s of [-1,1]){
      box(9,y+H/2+5,11,s*(W/2+9),(y+H/2+5)/2,z-5,0,brickMat);
      box(11,1.6,13,s*(W/2+9),y+H/2+5,z-5,0,trim);
      for(const yy of [16,32,48,64]) box(9.3,.65,11.3,s*(W/2+9),yy,z-5,0,trim);
      beam(new THREE.Vector3(s*35,top+2,z-6),new THREE.Vector3(s*35,y+H/2,z-6),.42);
    }
    const b=new THREE.Mesh(new THREE.PlaneGeometry(W,H),boardMat); b.position.set(0,y,z); scene.add(b);
    for(const yy of [y-H/2-1.5,y+H/2+1.5]) box(W+4,.3,1,0,yy,z-.5,0,new THREE.MeshBasicMaterial({color:0xffdfab,toneMapped:false}));
    const flagTime={value:0}, flagTex=canvasTex(256,128,(g,w,h)=>{
      g.fillStyle='#e0d7bb'; g.fillRect(0,0,w,h); g.fillStyle='#21474a'; g.fillRect(0,0,w*.22,h); g.font='900 62px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('PAWA',w*.6,h/2,w*.7);
    });
    const flagMat=new THREE.MeshStandardMaterial({map:flagTex,side:THREE.DoubleSide,roughness:.9});
    flagMat.onBeforeCompile=shader=>{
      shader.uniforms.stadiumTime=flagTime;
      shader.vertexShader='uniform float stadiumTime;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.z += sin(position.x*.8-stadiumTime*2.4)*.7*uv.x; transformed.y += sin(position.x*.45-stadiumTime*1.8)*.15*uv.x;');
    };
    window.updateStadium=t=>flagTime.value=t;
    for(const x of [-40,0,40]){
      const yy=y+H/2+2;
      beam(new THREE.Vector3(x,yy,z-8),new THREE.Vector3(x,yy+24,z-8),.12,trim);
      const flag=new THREE.Mesh(new THREE.PlaneGeometry(12,6,12,3).translate(6,0,0),flagMat); flag.position.set(x,yy+20,z-8); scene.add(flag);
    }
  }
  for(const [geo,batches] of [[new THREE.BoxGeometry(1,1,1),boxes],[new THREE.CylinderGeometry(1,1,1,6),beams]]){
    for(const [mat,list] of batches){
      const m=new THREE.InstancedMesh(geo,mat,list.length); list.forEach((matrix,i)=>m.setMatrixAt(i,matrix)); m.instanceMatrix.needsUpdate=true; scene.add(m);
    }
  }
}
