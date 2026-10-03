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

  /* ---------- 天空：漸層＋雲 ---------- */
  {
    const tex=canvasTex(2048,1024,(g,W,H)=>{
      const gr=g.createLinearGradient(0,0,0,H*0.5);
      gr.addColorStop(0,'#2a6fc8'); gr.addColorStop(0.65,'#5ea4e6'); gr.addColorStop(1,'#b9dcf5');
      g.fillStyle=gr; g.fillRect(0,0,W,H*0.5);
      g.fillStyle='#b9dcf5'; g.fillRect(0,H*0.5,W,H*0.5);
      for(let c=0;c<26;c++){
        const cx=rand()*W, cy=H*(0.16+rand()*0.26), n=5+Math.floor(rand()*8), s=16+rand()*36;
        for(let i=0;i<n;i++){
          const x=cx+(rand()-0.5)*s*4, y=cy+(rand()-0.5)*s*0.8, r=s*(0.6+rand()*0.8);
          const rg=g.createRadialGradient(x,y,0,x,y,r);
          rg.addColorStop(0,'rgba(255,255,255,0.75)'); rg.addColorStop(0.6,'rgba(250,252,255,0.3)'); rg.addColorStop(1,'rgba(255,255,255,0)');
          g.fillStyle=rg; g.beginPath(); g.ellipse(x,y,r*1.6,r*0.7,0,0,Math.PI*2); g.fill();
        }
      }
    });
    const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,48,24),new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false}));
    sky.renderOrder=-1; scene.add(sky);
    scene.background=new THREE.Color(0xa8d4f4);
    if(scene.fog){ scene.fog.color.set(0xb4daf5); scene.fog.near=900; scene.fog.far=4200; }
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
    const c1=[60,108,44], c2=[72,122,52], foul=[64,112,46], track=[170,98,70], track2=[158,90,64];
    const sq=24;
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
          const u=(x+z)/Math.SQRT2, v=(x-z)/Math.SQRT2;
          const k=(Math.floor(u/sq)+Math.floor(v/sq))&1;
          col=k?c1:c2; if(r>160 && (Math.floor(r/38)&1)) col=[col[0]+2,col[1]+4,col[2]+2];
        } else col=foul;
        const n=((i*92821+j*68917)%97)/97*8-4;
        const o=(j*W+i)*4; d[o]=col[0]+n; d[o+1]=col[1]+n; d[o+2]=col[2]+n; d[o+3]=255;
      }
    }
    g.putImageData(img,0,0);
    const t=new THREE.CanvasTexture(cv); t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=8;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(F.x1-F.x0,F.z1-F.z0),new THREE.MeshLambertMaterial({map:t}));
    m.rotation.x=-Math.PI/2; m.position.set((F.x0+F.x1)/2,0,(F.z0+F.z1)/2); m.receiveShadow=true; scene.add(m);
  }

  /* ---------- 內野土、白線（透明處露出下面的草紋） ---------- */
  const DIRT='#b46e4e';
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
      noise(g,W,H,90000,['#a96546','#bd7756','#b06b4b','#c27e5c'],2);
      const rg=g.createRadialGradient(...P(0,0),R(2),...P(0,0),R(13)); rg.addColorStop(0,'rgba(120,80,50,.35)'); rg.addColorStop(1,'rgba(120,80,50,0)');
      g.fillStyle=rg; g.beginPath(); g.arc(...P(0,0),R(13),0,Math.PI*2); g.fill();
      const mg=g.createRadialGradient(...P(0,-60.5),R(1),...P(0,-60.5),R(9)); mg.addColorStop(0,'rgba(130,90,60,.3)'); mg.addColorStop(1,'rgba(130,90,60,0)');
      g.fillStyle=mg; g.beginPath(); g.arc(...P(0,-60.5),R(9),0,Math.PI*2); g.fill();
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
    const infield=new THREE.Mesh(new THREE.PlaneGeometry(IF.x1-IF.x0,IF.z1-IF.z0),new THREE.MeshLambertMaterial({map:infTex,transparent:true}));
    infield.rotation.x=-Math.PI/2; infield.position.set((IF.x0+IF.x1)/2,0.03,(IF.z0+IF.z1)/2); infield.receiveShadow=true; scene.add(infield);
  }
  for(const s of [-1,1]){
    const l=new THREE.Mesh(new THREE.PlaneGeometry(0.4,330-158),new THREE.MeshBasicMaterial({color:0xf4f4ef}));
    l.rotation.x=-Math.PI/2; l.rotation.z=-s*Math.PI/4; const mid=(158+330)/2/Math.SQRT2; l.position.set(s*mid,0.05,-mid); scene.add(l);
  }
  {
    const mt=canvasTex(256,256,(g,w,h)=>{ g.fillStyle=DIRT; g.fillRect(0,0,w,h); noise(g,w,h,6000,['#a96546','#bd7756','#c27e5c'],2); });
    const mound=new THREE.Mesh(new THREE.CylinderGeometry(5.5,9.2,0.8,48),new THREE.MeshLambertMaterial({map:mt})); mound.position.set(0,0.4,-60.5); mound.receiveShadow=true; scene.add(mound);
    const rubber=new THREE.Mesh(new THREE.BoxGeometry(2,0.12,0.5),lam(0xffffff)); rubber.position.set(0,0.83,-60.5); scene.add(rubber);
    for(const b of [BASES.first,BASES.second,BASES.third]){const m=new THREE.Mesh(new THREE.BoxGeometry(1.4,0.3,1.4),lam(0xffffff));m.position.set(b.x,0.15,b.z);m.rotation.y=Math.PI/4;m.castShadow=true;scene.add(m);}
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
  const ADS=[['#1d4fa0','#ffffff','PAWA COLA'],['#ffffff','#d42020','STRIKE BANK'],['#e8401c','#ffffff','HOMERUN AIR'],['#14202e','#ffd23a','GRAND SLAM'],
             ['#ffd23a','#14202e','DIAMOND TV'],['#2fb84a','#ffffff','FASTBALL'],['#ffffff','#14365f','實況野球風'],['#0d6b8a','#ffffff','NINE INNINGS'],
             ['#c8102e','#ffffff','MLB 2026'],['#ffffff','#2a7a3a','GREEN FIELD']];
  function adStrip(h=128,panels=ADS){
    const t=canvasTex(2048,h,(g,w,hh)=>{
      const pw=w/panels.length;
      panels.forEach((a,i)=>{ g.fillStyle=a[0]; g.fillRect(i*pw,0,pw,hh);
        g.fillStyle=a[1]; g.font=`900 ${Math.round(hh*0.5)}px "Noto Sans TC",Arial,sans-serif`; g.textAlign='center'; g.textBaseline='middle'; g.fillText(a[2],i*pw+pw/2,hh/2+3,pw*0.9);
        g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(i*pw+pw-3,0,3,hh); });
    });
    t.wrapS=THREE.RepeatWrapping; return t;
  }
  const adTex=adStrip();

  /* ---------- 外野全壘打牆：藍色軟墊＋白色廣告字＋距離 ---------- */
  {
    const t=canvasTex(2048,128,(g,w,h)=>{
      const gr=g.createLinearGradient(0,0,0,h); gr.addColorStop(0,'#2475b8'); gr.addColorStop(1,'#1a5f9a');
      g.fillStyle=gr; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(0,0,0,.18)'; for(let i=0;i<w;i+=w/48) g.fillRect(i,0,2,h);
      g.fillStyle='#ffffff'; g.textAlign='center'; g.textBaseline='middle';
      const words=['PLAY BALL 2026','PAWA STADIUM','HOME RUN','NINE INNINGS'];
      for(let i=0;i<8;i++){ g.font='900 40px Arial,sans-serif'; g.fillText(words[i%4],(i+0.5)*w/8,h/2+2,w/8-40); }
    });
    ring(-45,45,120,fenceDist,fenceDist,C(0),C(FENCE_H),new THREE.MeshLambertMaterial({map:t}));
    ring(-45,45,120,fenceDist,p=>fenceDist(p)+0.8,C(FENCE_H),C(FENCE_H),new THREE.MeshBasicMaterial({color:0xffd23a}));
    // 距離數字：牆頂上的小白牌
    for(const p of [-45,-22,0,22,45]){ const n=String(Math.round(fenceDist(p))), a=p*D2R, r=fenceDist(p)-0.2;
      const nt=canvasTex(128,64,(g,w,h)=>{ g.fillStyle='#1a5f9a'; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.font='900 46px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText(n,w/2,h/2+2); });
      const m=new THREE.Mesh(new THREE.PlaneGeometry(10,5),new THREE.MeshBasicMaterial({map:nt})); m.position.set(Math.sin(a)*r,FENCE_H+3,-Math.cos(a)*r); m.rotation.y=-a; scene.add(m); }
  }
  for(const s of [-1,1]){ const d=fenceDist(45)+0.5;
    const m=new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.55,70,10),new THREE.MeshLambertMaterial({color:0xffd23a,emissive:0x332800})); m.position.set(s*d*Math.SQRT1_2,35,-d*Math.SQRT1_2); scene.add(m);
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(2.4,40),new THREE.MeshBasicMaterial({color:0xffd23a,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
    fl.position.set(s*(d*Math.SQRT1_2)+s*1.3,40,-d*Math.SQRT1_2+1.3); fl.rotation.y=s*Math.PI/4; scene.add(fl); }

  /* ---------- 界外區與本壘後方的護牆：藍色軟墊＋廣告 ---------- */
  const wallH=p=>{ const a=Math.abs(normPhi(p)); return 5+5*smooth(118,142,a); };
  {
    const pad=canvasTex(1024,128,(g,w,h)=>{ g.fillStyle='#1d4fa0'; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(0,0,0,.28)'; for(let i=0;i<w;i+=64) g.fillRect(i,0,3,h);
      g.fillStyle='rgba(255,255,255,.08)'; for(let i=0;i<w;i+=64) g.fillRect(i+5,8,52,h-16); });
    pad.wrapS=THREE.RepeatWrapping;
    ring(45,315,240,sd,sd,C(0),p=>wallH(p)*0.45,new THREE.MeshLambertMaterial({map:pad}),36);
    ring(45,315,240,sd,sd,p=>wallH(p)*0.45,wallH,new THREE.MeshLambertMaterial({map:adTex}),300);
    ring(45,315,240,sd,p=>sd(p)+2.5,wallH,wallH,new THREE.MeshLambertMaterial({color:0x173a6a}));
    const net=canvasTex(128,128,(g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle='rgba(25,30,40,.5)'; g.lineWidth=1.5;
      for(let i=0;i<=w;i+=12){ g.beginPath(); g.moveTo(i,0); g.lineTo(i,h); g.moveTo(0,i); g.lineTo(w,i); g.stroke(); } });
    net.wrapS=net.wrapT=THREE.RepeatWrapping; net.repeat.set(1,8);
    ring(138,222,80,p=>sd(p)-0.3,p=>sd(p)-0.3,wallH,C(46),new THREE.MeshBasicMaterial({map:net,transparent:true,depthWrite:false}),8);
    for(const p of [138,162,198,222]){ const a=p*D2R, r=sd(p)-0.3;
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.1,46,6),lam(0x6a7280)); pole.position.set(Math.sin(a)*r,23,-Math.cos(a)*r); scene.add(pole); }
  }

  /* ---------- 休息區 ---------- */
  for(const s of [-1,1]){
    const p=s*112, a=p*D2R, r=sd(p)-4.5, x=Math.sin(a)*r, z=-Math.cos(a)*r;
    const grp=new THREE.Group(); grp.position.set(x,0,z); grp.rotation.y=Math.atan2(-x,-z); scene.add(grp);
    const back=new THREE.Mesh(new THREE.BoxGeometry(44,7,1),lam(0x10182a)); back.position.set(0,3.5,-4); grp.add(back);
    const roof=new THREE.Mesh(new THREE.BoxGeometry(46,1,9),lam(0x1d4fa0)); roof.position.set(0,7,0); grp.add(roof);
    const rail=new THREE.Mesh(new THREE.BoxGeometry(46,0.3,0.3),lam(0xd8d8d8)); rail.position.set(0,3.6,4); grp.add(rail);
    for(const sx of [-22.5,22.5]){ const side=new THREE.Mesh(new THREE.BoxGeometry(1,7,9),lam(0x173a6a)); side.position.set(sx,3.5,0); grp.add(side); }
    const bench=new THREE.Mesh(new THREE.BoxGeometry(40,1.4,1.6),lam(0x6a5a48)); bench.position.set(0,0.7,-2.5); grp.add(bench);
  }

  /* ---------- 看台：單層、低矮、往外緩坡（座位與觀眾用 InstancedMesh） ---------- */
  function mergeBoxes(list){
    const pos=[],nor=[];
    for(const [w,h,d,x,y,z] of list){ const b=new THREE.BoxGeometry(w,h,d).toNonIndexed(); b.translate(x,y,z);
      pos.push(...b.attributes.position.array); nor.push(...b.attributes.normal.array); }
    const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3)); return g;
  }
  const seatGeo=mergeBoxes([[1.7,0.25,1.3,0,0.95,0.05],[1.7,1.3,0.2,0,1.5,-0.6]]);
  const bodyGeo=new THREE.CylinderGeometry(0.5,0.6,1.5,5,1); bodyGeo.scale(1,1,0.75); bodyGeo.translate(0,1.55,0);   // 低面數：觀眾很遠，看不出差別
  const headGeo=new THREE.IcosahedronGeometry(0.42,0); headGeo.translate(0,2.75,0.05);
  const capGeo=new THREE.SphereGeometry(0.45,8,4,0,Math.PI*2,0,Math.PI/2); capGeo.translate(0,2.86,0.05);
  const SHIRT=[['#f2f2f2',18],['#1d4fa0',14],['#22304f',8],['#c8322e',8],['#9aa3ad',7],['#262626',8],['#f2c43a',4],['#7fb6e8',6],['#3f8f4f',3],['#e8742a',3],['#e05a8a',2],['#5a3e8a',2]];
  const SKIN=[['#f1c7a0',5],['#e2b088',5],['#c98f62',3],['#9a6440',2],['#6e452c',1]];
  const seats=[], fans=[];
  const ROWS=15, DEPTH=2.9, RISE=1.15;
  const wallTop=p=>{ const a=Math.abs(normPhi(p)); return a<=45?FENCE_H+3:wallH(p)+1.2; };
  const deckR0=p=>{ const a=Math.abs(normPhi(p)); return a<=45?fenceDist(normPhi(p))+9:sd(p)+3; };
  const deckTop=p=>wallTop(p)+ROWS*RISE;
  const deckBack=p=>deckR0(p)+ROWS*DEPTH;
  const BEYE=7.5;   // 中外野記分板下方，不放觀眾
  function deck(f0,f1,skip=()=>false){
    for(let i=0;i<ROWS;i++){
      let phi=f0;
      while(phi<f1){
        const rr=deckR0(phi)+i*DEPTH, y=wallTop(phi)+i*RISE, a=phi*D2R, x=Math.sin(a)*rr, z=-Math.cos(a)*rr;
        if(!skip(phi)){ const yaw=Math.atan2(-x,-z)+(rand()-0.5)*0.15; (rand()<0.85?fans:seats).push([x,y,z,yaw]); }
        phi+=2.1/rr/D2R;
      }
    }
    const steps=Math.max(24,Math.round((f1-f0)*1.2));
    ring(f0,f1,steps,p=>deckR0(p)-1.5,deckBack,p=>wallTop(p)-0.2,p=>deckTop(p)-0.2,new THREE.MeshLambertMaterial({color:0x5b6472}));
  }
  deck(-45,45,p=>Math.abs(p)<BEYE);
  deck(45,315);
  ring(-45,45,120,p=>fenceDist(p)+0.8,p=>fenceDist(p)+9,C(FENCE_H),C(FENCE_H+3),new THREE.MeshLambertMaterial({color:0x2a3346}));
  // 看台最上緣：藍色廣告帶（一整圈）＋背後的牆
  {
    const band=adStrip(96,[['#1d4fa0','#ffffff','PAWA STADIUM'],['#1d4fa0','#ffffff','PLAY BALL 2026'],['#1d4fa0','#ffffff','NINE INNINGS'],['#1d4fa0','#ffffff','GRAND SLAM']]);
    const top=p=>deckTop(p)+0.5;
    ring(-315,45,360,deckBack,deckBack,top,p=>top(p)+5,new THREE.MeshLambertMaterial({map:band}),120);
    ring(-315,45,360,deckBack,deckBack,p=>wallTop(p),top,new THREE.MeshLambertMaterial({color:0x2a3346}));
    ring(-315,45,360,deckBack,p=>deckBack(p)+3,p=>top(p)+5,p=>top(p)+5,new THREE.MeshLambertMaterial({color:0x173a6a}));
  }
  {
    const dummy=new THREE.Object3D(), col=new THREE.Color();
    const seatMesh=new THREE.InstancedMesh(seatGeo,new THREE.MeshLambertMaterial(),seats.length);
    seats.forEach(([x,y,z,yaw],i)=>{ dummy.position.set(x,y,z); dummy.rotation.set(0,yaw,0); dummy.scale.set(1,1,1); dummy.updateMatrix(); seatMesh.setMatrixAt(i,dummy.matrix);
      seatMesh.setColorAt(i,col.set(rand()<0.9?'#2a5cb0':'#1d4588')); });
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
      capMesh.setColorAt(i,col.set(pickW([['#1d4fa0',5],['#22304f',3],['#c8322e',2],['#262626',2],['#f2f2f2',1]]))); });
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

  /* ---------- 燈塔：格子鋼架＋頂端大燈板 ---------- */
  {
    const lattice=canvasTex(128,256,(g,w,h)=>{ g.clearRect(0,0,w,h); g.strokeStyle='#d4d8de'; g.lineCap='square';
      g.lineWidth=10; g.beginPath(); g.moveTo(4,0); g.lineTo(4,h); g.moveTo(w-4,0); g.lineTo(w-4,h); g.stroke();
      g.lineWidth=5; g.beginPath(); for(let y=0;y<h;y+=w){ g.moveTo(4,y); g.lineTo(w-4,y+w); g.moveTo(w-4,y); g.lineTo(4,y+w); g.moveTo(4,y); g.lineTo(w-4,y); } g.stroke(); });
    lattice.wrapS=lattice.wrapT=THREE.RepeatWrapping;
    const lamps=canvasTex(512,256,(g,w,h)=>{ g.fillStyle='#3a404a'; g.fillRect(0,0,w,h);
      for(let y=0;y<6;y++) for(let x=0;x<12;x++){ const cx=22+x*40, cy=22+y*40, rg=g.createRadialGradient(cx,cy,1,cx,cy,17);
        rg.addColorStop(0,'#ffffff'); rg.addColorStop(0.55,'#f4f2e6'); rg.addColorStop(1,'#7c7e80'); g.fillStyle=rg; g.beginPath(); g.arc(cx,cy,16,0,Math.PI*2); g.fill(); } });
    const latMat=h=>{ const t=lattice.clone(); t.needsUpdate=true; t.repeat.set(4,h/24); return new THREE.MeshLambertMaterial({map:t,transparent:true,alphaTest:0.5,side:THREE.DoubleSide}); };
    for(const p of [-22,22,-128,128]){
      const r=Math.abs(p)<90 ? deckBack(p)+40 : deckBack(p)+25, a=p*D2R, x=Math.sin(a)*r, z=-Math.cos(a)*r, h=Math.abs(p)<90?52:120;
      const grp=new THREE.Group(); grp.position.set(x,0,z); grp.rotation.y=Math.atan2(-x,-z); scene.add(grp);
      const tower=new THREE.Mesh(new THREE.CylinderGeometry(4,11,h,4,1,true),latMat(h)); tower.rotation.y=Math.PI/4; tower.position.y=h/2; grp.add(tower);
      const crown=new THREE.Mesh(new THREE.CylinderGeometry(26,5,20,4,1,true),latMat(20)); crown.rotation.y=Math.PI/4; crown.position.y=h+10; grp.add(crown);
      const panel=new THREE.Mesh(new THREE.BoxGeometry(56,30,3),[lam(0x3a404a),lam(0x3a404a),lam(0x3a404a),lam(0x3a404a),new THREE.MeshBasicMaterial({map:lamps}),lam(0x3a404a)]);
      panel.position.set(0,h+30,0); panel.rotation.x=-0.2; grp.add(panel);
      const flag=new THREE.Mesh(new THREE.BoxGeometry(14,30,1),new THREE.MeshLambertMaterial({color:0x1d4fa0})); flag.position.set(0,h*0.55,9); grp.add(flag);
    }
  }

  /* ---------- 中外野電子記分板：上半兩隊打序、下半對戰 ---------- */
  boardMat=new THREE.MeshBasicMaterial({toneMapped:false});
  const BOARD={a:'PLAY BALL',b:'2026',lu:null};
  function drawBoard(){
    if(boardMat.map) boardMat.map.dispose();
    boardMat.map=canvasTex(1024,560,(g,w,h)=>{
      g.fillStyle='#0a0f1c'; g.fillRect(0,0,w,h);
      g.fillStyle='rgba(255,255,255,.035)'; for(let y=0;y<h;y+=4) g.fillRect(0,y,w,1);
      g.strokeStyle='#2b4f8a'; g.lineWidth=8; g.strokeRect(4,4,w-8,h-8);
      g.textBaseline='middle';
      const topH=BOARD.lu?370:0;
      if(BOARD.lu){
        const cols=[[BOARD.lu.at,BOARD.lu.an],[BOARD.lu.ht,BOARD.lu.hn]];
        cols.forEach(([t,names],c)=>{ const x0=30+c*w/2, cw=w/2-60;
          g.fillStyle='#1c3e78'; g.fillRect(x0,18,cw,38);
          g.fillStyle='#ffffff'; g.font='900 28px "Noto Sans TC",sans-serif'; g.textAlign='center'; g.fillText(t,x0+cw/2,38,cw-10);
          (names||[]).slice(0,9).forEach((n,i)=>{ const y=78+i*32;
            g.textAlign='left'; g.fillStyle='#ffd23a'; g.font='900 26px Arial,sans-serif'; g.fillText(String(i+1),x0+8,y);
            g.fillStyle='#e8f0ff'; g.font='700 26px "Noto Sans TC",Arial,sans-serif'; g.fillText(n,x0+44,y,cw-50); });
        });
        g.fillStyle='#2b4f8a'; g.fillRect(w/2-2,18,4,topH-28); g.fillRect(16,topH,w-32,4);
      }
      const cy=topH+(h-topH)/2;
      g.textAlign='center';
      g.shadowColor='#ffb000'; g.shadowBlur=14; g.fillStyle='#ffd23a';
      g.font=`900 ${BOARD.lu?66:104}px "Noto Sans TC",sans-serif`; g.fillText(BOARD.a,w/2,cy-(BOARD.lu?28:50),w-60);
      g.shadowColor='#3ac8ff'; g.fillStyle='#8fe0ff'; g.font=`700 ${BOARD.lu?36:56}px "Noto Sans TC",sans-serif`; g.fillText(BOARD.b,w/2,cy+(BOARD.lu?40:60),w-60);
      g.shadowBlur=0;
    });
    boardMat.needsUpdate=true;
  }
  setBoardText=function(a,b){ BOARD.a=a; BOARD.b=b; drawBoard(); };
  window.setBoardLineups=function(at,an,ht,hn){ BOARD.lu={at,an,ht,hn}; drawBoard(); };
  drawBoard();
  {
    const r=fenceDist(0)+9, top=deckTop(0), W=88, H=W*560/1024;
    // 記分板下方的深色基座（打者視線區）
    ring(-BEYE,BEYE,24,p=>fenceDist(p)+8.5,p=>fenceDist(p)+8.5,C(FENCE_H),C(top+2),new THREE.MeshLambertMaterial({color:0x182a3a}));
    ring(-BEYE,BEYE,24,p=>fenceDist(p)+8.5,deckBack,C(top+2),C(top+2),new THREE.MeshLambertMaterial({color:0x223246}));
    const z=-(r+ROWS*DEPTH*0.5), y=top+2+H/2+3;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(W+8,H+8,4),lam(0x1a2433)); frame.position.set(0,y,z-2.5); scene.add(frame);
    const b=new THREE.Mesh(new THREE.PlaneGeometry(W,H),boardMat); b.position.set(0,y,z); scene.add(b);
    const crown=new THREE.Mesh(new THREE.BoxGeometry(W+8,7,5),new THREE.MeshLambertMaterial({color:0x1d4fa0})); crown.position.set(0,y+H/2+7,z-2.5); scene.add(crown);
    const ct=canvasTex(512,64,(g,w,h)=>{ g.fillStyle='#1d4fa0'; g.fillRect(0,0,w,h); g.fillStyle='#fff'; g.font='900 40px Arial'; g.textAlign='center'; g.textBaseline='middle'; g.fillText('PAWA STADIUM',w/2,h/2+2); });
    const cl=new THREE.Mesh(new THREE.PlaneGeometry(W*0.6,6),new THREE.MeshBasicMaterial({map:ct})); cl.position.set(0,y+H/2+7,z+0.1); scene.add(cl);
  }
}
