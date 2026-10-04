'use strict';
/* =========================================================
   選手的臉：透明臉部圖層＋帽緣下的 3D 頭髮＋頭部小動作＋事件符號
   介面（game.js 照用）：create、update、react、portrait；另加 hair、pose（樣品頁用）
   臉部圖層蓋在頭的前方：貼圖 u 0.34～0.66、v 0.42～0.82 對到 512×384 畫布
   ========================================================= */
window.BaseballFaces=(()=>{
  const T=window.THREE, W=512, H=384, lim=(v,a,b)=>Math.max(a,Math.min(b,v));
  const CX=256, EY=170, EX=104, MY=290;          // 臉中心、眼睛高度與左右間距、嘴巴高度
  let geometry=null;
  // 表情參數：open 眼睛張開、lid 上眼皮壓低、brow 眉角（＋生氣、－擔心）、browY 眉毛高低、
  // smile 嘴角、mouth 張嘴、teeth 咬牙、round O 嘴、happy 笑瞇眼、wide 瞳孔縮小（驚訝）、smirk 歪嘴
  const BASE={open:1,lid:0,brow:0,browY:0,smile:0,mouth:0,teeth:0,round:0,happy:0,wide:0,smirk:0,blush:0,tri:0};
  // 預設是「認真專注」：堅定眉（內側往下壓）、小嘴抿成倒三角、眼神直視
  const moods={
    focus:     {open:1,lid:.2,brow:.75,browY:-.12,smile:-.08,tri:1},
    confident: {open:.95,lid:.24,brow:.45,browY:0,smile:.55,smirk:.55,blush:.2},
    effort:    {open:.7,lid:.4,brow:1,browY:-.25,smile:-.1,mouth:.38,teeth:1,blush:.4},
    joy:       {open:.95,happy:1,brow:-.3,browY:.4,smile:1,mouth:.85,blush:.8},
    frustrated:{open:.75,lid:.45,brow:.85,browY:-.2,smile:-.9,mouth:.12,blush:.35},
    concern:   {open:1.1,brow:-.85,browY:.4,smile:-.35,mouth:.28,round:.8,wide:.35,blush:.2},
    shock:     {open:1.2,brow:-.7,browY:.65,smile:-.1,mouth:.85,round:1,wide:.8,blush:.1}
  };
  const full=n=>({...BASE,...(moods[n]||moods.focus)});
  const ell=(g,x,y,rx,ry,c,rot=0)=>{g.fillStyle=c;g.beginPath();g.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),rot,0,Math.PI*2);g.fill();};

  /* ---------- 眼睛：大而圓，虹膜占大部分，高光明亮 ---------- */
  // 眼型（都偏圓）：round 圓、sharp 杏仁、droopy 垂、narrow 略扁、dot 豆形（直立橢圓，舊式實況野球）
  const EYE={round:{w:64,h:76,tilt:0,dip:0},sharp:{w:66,h:70,tilt:.12,dip:0},droopy:{w:64,h:72,tilt:-.1,dip:.08},narrow:{w:68,h:62,tilt:.04,dip:0},dot:{w:50,h:74,tilt:0,dip:0}};
  function eye(g,o,s,a){
    const t=EYE[o.eyeType]||EYE.round, x=CX+s*EX, y=EY, w=t.w, h=t.h;
    const open=lim(a.open*(1-a.blink),0,1.3), happy=a.happy*(1-a.blink);
    g.save(); g.translate(x,y); g.rotate(s*t.tilt);
    g.lineCap='round'; g.lineJoin='round';
    if(happy>.55){                                  // 笑瞇眼：圓圓的 ∩
      g.strokeStyle=o.lash; g.lineWidth=12;
      g.beginPath(); g.moveTo(-w*.75,h*.2); g.quadraticCurveTo(0,-h*.7,w*.75,h*.2); g.stroke();
      g.restore(); return;
    }
    if(open<.12){                                   // 閉眼：圓弧
      g.strokeStyle=o.lash; g.lineWidth=10;
      g.beginPath(); g.moveTo(-w*.8,-2); g.quadraticCurveTo(0,h*.32,w*.8,-2); g.stroke();
      g.restore(); return;
    }
    const hh=h*open, top=-hh*(1-a.lid*.4), bot=hh*.9, oy=hh*t.dip*s*0;
    const shape=()=>{ g.beginPath(); g.ellipse(0,(top+bot)/2,w,(bot-top)/2,0,0,Math.PI*2); };
    // 上眼皮壓低時把眼白上緣切平（認真的眼神）
    g.save(); g.beginPath(); g.rect(-w*1.3,top,w*2.6,bot-top+4); g.clip();
    shape(); g.fillStyle='#fffefa'; g.fill();
    g.save(); shape(); g.clip();
    // 虹膜：占眼睛大部分
    const cy=(top+bot)/2, ir=w*(.8-a.wide*.12), irH=(bot-top)*.52*(1-a.wide*.1), ix=a.gazeX*w*.2, iy=cy+hh*.06-a.gazeY*hh*.12;
    const grad=g.createLinearGradient(0,iy-irH,0,iy+irH); grad.addColorStop(0,'#120a06'); grad.addColorStop(.38,o.iris); grad.addColorStop(.8,o.irisLight); grad.addColorStop(1,o.irisLight);
    ell(g,ix,iy,ir,irH,grad);
    ell(g,ix,iy+irH*.05,ir*(.46-a.wide*.22),irH*(.5-a.wide*.22),'#0a0605');                // 瞳孔
    const glow=g.createRadialGradient(ix,iy+irH*.6,2,ix,iy+irH*.6,ir*.8); glow.addColorStop(0,'rgba(255,240,200,.55)'); glow.addColorStop(1,'rgba(255,240,200,0)'); g.fillStyle=glow; g.fillRect(ix-ir,iy,ir*2,irH*1.2);
    // 上緣陰影
    const sh=g.createLinearGradient(0,top,0,top+hh*.45); sh.addColorStop(0,'rgba(40,40,50,.18)'); sh.addColorStop(1,'rgba(40,30,40,0)'); g.fillStyle=sh; g.fillRect(-w*1.2,top-2,w*2.4,hh*.5);
    // 高光：大、亮
    ell(g,ix-s*ir*.34,iy-irH*.38,ir*.36,irH*.3,'#ffffff');
    ell(g,ix+s*ir*.38,iy+irH*.36,ir*.14,irH*.12,'#ffffff');
    ell(g,ix-s*ir*.02,iy-irH*.62,ir*.08,irH*.07,'rgba(255,255,255,.9)');
    g.restore(); g.restore();
    // 上眼線：圓潤、外側略粗，加一點圓圓的睫毛尾
    g.strokeStyle=o.lash; g.lineWidth=13;
    g.beginPath(); g.ellipse(0,(top+bot)/2,w*1.01,(bot-top)/2*1.01,0,Math.PI*1.1,Math.PI*1.9); g.stroke();
    g.restore();
  }
  /* ---------- 眉毛：圓潤粗線 ---------- */
  // 眉型：thick 粗、arch 彎、thin 細、bushy 濃、angled 天生堅定
  const BROW={thick:{t:17,arc:4},arch:{t:14,arc:9},thin:{t:11,arc:6},bushy:{t:20,arc:3},angled:{t:16,arc:2,slant:.18}};
  function brow(g,o,s,a){
    const b=BROW[o.browType]||BROW.thick, x=CX+s*(EX-4), y=EY-90-a.browY*24;
    const ang=-(lim(a.brow,-1,1.1)*.4+(b.slant||0))*s, len=34;
    g.save(); g.translate(x,y); g.rotate(ang);
    g.strokeStyle=o.hair; g.lineCap='round'; g.lineWidth=b.t;
    g.beginPath(); g.moveTo(-len,b.arc*.3); g.quadraticCurveTo(0,-b.arc,len,b.arc*.3); g.stroke();
    g.restore();
  }
  /* ---------- 嘴巴：小而圓潤 ---------- */
  function mouth(g,o,a){
    const base=(o.mouthW||46)*.5, w=base*(1+Math.max(0,a.smile)*.9+a.mouth*.5-a.round*.35), y=MY, sm=a.smile*14, sk=a.smirk*8;
    const open=a.mouth*48, lc=[CX-w,y-sm*.6+sk*.3], rc=[CX+w,y-sm*.6-sk];
    const lipC='#3a2a24';
    g.lineCap='round'; g.lineJoin='round';
    if(a.round>.6 && open>8){                       // 小 O 嘴
      ell(g,CX,y+open*.3,w*.5,open*.45,'#5a1f26'); ell(g,CX,y+open*.5,w*.32,open*.18,'#d06a76');
      g.strokeStyle=lipC; g.lineWidth=4; g.beginPath(); g.ellipse(CX,y+open*.3,w*.5,open*.45,0,0,Math.PI*2); g.stroke(); return;
    }
    if(open<6){
      if(a.tri>.5){                                 // 抿嘴倒三角
        const tw=22;
        g.strokeStyle=lipC; g.lineWidth=6; g.beginPath(); g.moveTo(CX-tw,y); g.quadraticCurveTo(CX,y-3,CX+tw,y); g.stroke();   // 認真：抿成一條深色線
        return;
      }
      g.strokeStyle=lipC; g.lineWidth=6;           // 小小的微笑或下垂（深色細線）
      g.beginPath(); g.moveTo(...lc); g.quadraticCurveTo(CX,y+sm*1.1,...rc); g.stroke();
      return;
    }
    const bottom=y+open*.75+Math.max(0,sm)*.9;
    g.beginPath(); g.moveTo(...lc); g.quadraticCurveTo(CX,y+sm*.6,...rc);
    g.bezierCurveTo(CX+w*.9,bottom,CX-w*.9,bottom,...lc); g.closePath();
    g.fillStyle='#5a1f26'; g.fill();
    g.save(); g.clip();
    ell(g,CX+2,bottom-2,w*.55,open*.28,'#d86e7a');                                   // 舌頭
    if(a.teeth>.5){ g.fillStyle='#fffaf0'; g.beginPath(); g.roundRect(CX-w,y-sm-6,w*2,open*.8+6,8); g.fill();
      g.strokeStyle='rgba(170,150,140,.6)'; g.lineWidth=2; g.beginPath(); g.moveTo(CX-w,y+open*.3); g.lineTo(CX+w,y+open*.3); g.stroke(); }
    else if(a.smile>.4){ g.fillStyle='#fffaf0'; g.fillRect(CX-w,y-sm-20,w*2,20+open*.18); }
    g.restore();
    g.strokeStyle=lipC; g.lineWidth=4;
    g.beginPath(); g.moveTo(...lc); g.quadraticCurveTo(CX,y+sm*.6,...rc); g.bezierCurveTo(CX+w*.9,bottom,CX-w*.9,bottom,...lc); g.stroke();
  }
  function draw(g,o,a){
    g.clearRect(0,0,W,H);
    // 臉頰淡淡紅暈
    const bl=lim(.22+(o.blush||0)*.1+a.blush*.35,0,1);
    for(const s of [-1,1]){ const x=CX+s*132, y=EY+78; const r=g.createRadialGradient(x,y,4,x,y,46);
      r.addColorStop(0,`rgba(230,130,110,${.32*bl})`); r.addColorStop(1,'rgba(230,130,110,0)'); g.fillStyle=r; g.fillRect(x-50,y-50,100,100);
      if(a.blush>.7){ g.strokeStyle=`rgba(230,95,105,${.6*(a.blush-.6)})`; g.lineWidth=3.5; g.lineCap='round'; for(let i=0;i<3;i++){ g.beginPath(); g.moveTo(x-16+i*13,y-7); g.lineTo(x-22+i*13,y+7); g.stroke(); } } }
    for(const s of [-1,1]){ brow(g,o,s,a); eye(g,o,s,a); }
    mouth(g,o,a);
  }
  // 沒經過 faceFor 的臉（裁判等）補上預設值
  function norm(o){ o.irisLight=o.irisLight||'#c48a4a'; o.lash=o.lash||'#1a0f0b'; o.iris=o.iris||'#4e2c18'; o.hair=o.hair||'#2e2016'; o.eyeType=o.eyeType||'round'; o.browType=o.browType||'thick'; return o; }
  function layer(o){
    norm(o);
    const canvas=document.createElement('canvas'); canvas.width=W; canvas.height=H;
    const ctx=canvas.getContext('2d'), a={...full('confident'),blink:0,gazeX:0,gazeY:0}; draw(ctx,o,a);
    return {canvas,ctx,a};
  }
  function create(head,base,o){
    if(!geometry){
      geometry=base.geometry.clone(); const uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++) uv.setXY(i,(uv.getX(i)-.34)/.32,(uv.getY(i)-.42)/.4);
    }
    const art=layer(o), texture=new T.CanvasTexture(art.canvas);
    texture.colorSpace=T.SRGBColorSpace; texture.flipY=false; texture.generateMipmaps=false; texture.minFilter=T.LinearFilter; texture.anisotropy=4;
    const material=new T.MeshPhysicalMaterial({map:texture,transparent:true,alphaTest:.02,depthWrite:false,roughness:.4,clearcoat:.35,clearcoatRoughness:.2,polygonOffset:true,polygonOffsetFactor:-2});
    const mesh=new T.Mesh(geometry,material); mesh.scale.setScalar(1.003); mesh.receiveShadow=true; head.add(mesh);
    const phase=((o.seed||1)*.61803398875)%1;
    return {...art,o,texture,mesh,head,look:new T.Vector3(),key:'',nextFrame:0,nextBlink:null,blinkAt:-100,phase,reaction:null,fx:[],glance:0,glanceAt:0,glanceEnd:0};
  }

  /* ---------- 帽緣下的 3D 頭髮 ---------- */
  // 跟 tools/build_pawa.py 的頭型一樣：超橢球（指數 .72，縮放 1.2／1.08／1.1，臉部壓平、下巴略寬）
  const sp=(v,e)=>Math.sign(v)*Math.pow(Math.abs(v),e);
  function headPt(th,ph,k=1){
    const dx=Math.sin(th)*Math.sin(ph), dy=Math.cos(th), dz=Math.sin(th)*Math.cos(ph);
    let x=sp(dx,.72)*1.2, yb=sp(-dz,.72)*1.08, z=sp(dy,.72)*1.1;
    if(z<0) x*=1+.05*Math.min(1,-z); if(yb<0) yb*=.93;
    return new T.Vector3(x*k,z*k,-yb*k);
  }
  // 帽子或頭盔下緣（three 座標）：帽子 y=0.06+0.17z；頭盔 y=-0.12+0.40z
  function edgeTheta(ph,kind){
    const edge=p=>kind==='helmet'?-.12+.4*p.z:.06+.17*p.z;
    let lo=.2, hi=2.6; for(let i=0;i<24;i++){ const m=(lo+hi)/2, p=headPt(m,ph); if(p.y>edge(p)) lo=m; else hi=m; }
    return lo;
  }
  const lockGeo=new T.SphereGeometry(.5,10,8); lockGeo.translate(0,.5,0);              // 圓潤的髮片：底在 0、末端在 +y
  const curlGeo=new T.IcosahedronGeometry(1,1);
  function addLock(list,root,dir,out,len,wid,thick,twist=0){
    const m=new T.Matrix4(), q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());
    const qt=new T.Quaternion().setFromAxisAngle(dir.clone().normalize(),twist); q.premultiply(qt);
    m.compose(root.clone().addScaledVector(out,.045).addScaledVector(dir,-.1),q,new T.Vector3(wid,len,thick)); list.push(lockGeo.clone().applyMatrix4(m));
  }
  function hair(head,o,kind){
    norm(o);
    if(kind==='catcher'||o.hairStyle==='buzz') return null;
    const list=[], r=(()=>{let s=(o.seed||7)%2147483647; return ()=>((s=s*16807%2147483647)-1)/2147483646;})();
    const style=o.hairStyle||'spiky';
    const lockAt=(phDeg,len,wid,sweep=0,dTh=0,bend=0)=>{
      const ph=phDeg*Math.PI/180, th=edgeTheta(ph,kind)+dTh, p=headPt(th,ph,1.0);
      const below=headPt(th+.25,ph,1.02).sub(p).normalize(), side=new T.Vector3(Math.cos(ph),0,-Math.sin(ph));
      const out=p.clone().normalize(); const dir=below.clone().addScaledVector(side,sweep).addScaledVector(out,bend).normalize();
      addLock(list,p,dir,out,len,wid,wid*.32,(r()-.5)*.2);
    };
    const flap=o.flapSide||0;                                  // 頭盔護耳那側不放鬢角
    if(style==='curly'){
      for(let row=0;row<2;row++) for(let d=-150;d<=150;d+=17){
        if(kind==='helmet'&&Math.abs(d)>110) continue; if(flap&&Math.sign(d)===flap&&Math.abs(d)>55&&Math.abs(d)<125) continue;
        const ph=d*Math.PI/180, th=edgeTheta(ph,kind)+.02+row*.12, p=headPt(th,ph,1.03), m=new T.Matrix4().compose(p,new T.Quaternion(),new T.Vector3(.14,.13,.12).multiplyScalar(.85+r()*.35));
        list.push(curlGeo.clone().applyMatrix4(m));
      }
    } else {
      // 瀏海：幾片寬而圓的髮片互相疊起來；旁分往一側掃，長髮比較長
      const n=style==='side'?9:11, span=style==='long'?62:56;
      for(let i=0;i<n;i++){ const d=-span+2*span*i/(n-1)+(r()-.5)*4;
        const len=(style==='spiky'?.34:style==='side'?.42:.38)*(.9+r()*.2)*(1-Math.abs(d)/span*.15);
        lockAt(d,len*(kind==='cap'?.72:.92),.3,style==='side'?.6:(r()-.5)*.12,.02,.03); }
      for(const s of [-1,1]){ if(flap===s) continue;                                   // 鬢角
        lockAt(s*84,style==='long'?.62:.46,.26,-s*.05,.02,.03); lockAt(s*70,style==='long'?.5:.36,.28,-s*.1,.02,.05); }
      if(kind!=='helmet'){ const nb=style==='long'?8:5;                                // 後腦髮尾
        for(let i=0;i<nb;i++){ const d=180-55+110*i/(nb-1); lockAt(d,style==='long'?.55:.34,.34,(r()-.5)*.2,.02,.1); } }
    }
    // 合成一個網格（每人一次繪製）
    let cnt=0; const flat=list.map(g=>g.index?g.toNonIndexed():g); for(const g of flat) cnt+=g.attributes.position.count;
    const pos=new Float32Array(cnt*3), nor=new Float32Array(cnt*3); let off=0;
    for(const g of flat){ pos.set(g.attributes.position.array,off*3); nor.set(g.attributes.normal.array,off*3); off+=g.attributes.position.count; }
    const geo=new T.BufferGeometry(); geo.setAttribute('position',new T.BufferAttribute(pos,3)); geo.setAttribute('normal',new T.BufferAttribute(nor,3));
    const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({color:o.hair,roughness:.45,metalness:.05}));
    mesh.castShadow=true; head.add(mesh); return mesh;
  }

  /* ---------- 事件符號（汗滴、星星、青筋、驚嘆號、淚光） ---------- */
  const SYM={};
  function symTex(name){
    if(SYM[name]) return SYM[name];
    const c=document.createElement('canvas'); c.width=c.height=128; const g=c.getContext('2d'); g.lineJoin='round'; g.lineCap='round';
    if(name==='sweat'){ g.fillStyle='#8fd6ff'; g.strokeStyle='#1d5f9a'; g.lineWidth=6; g.beginPath(); g.moveTo(64,10); g.bezierCurveTo(100,62,104,112,64,116); g.bezierCurveTo(24,112,28,62,64,10); g.fill(); g.stroke(); ell(g,52,80,9,15,'rgba(255,255,255,.85)'); }
    if(name==='star'){ g.fillStyle='#ffe14d'; g.strokeStyle='#b26b00'; g.lineWidth=6; g.beginPath(); for(let i=0;i<10;i++){ const r=i%2?22:56, a=-Math.PI/2+i*Math.PI/5; g.lineTo(64+Math.cos(a)*r,64+Math.sin(a)*r); } g.closePath(); g.fill(); g.stroke(); ell(g,50,46,8,8,'#fff'); }
    if(name==='vein'){ g.strokeStyle='#e8233a'; g.lineWidth=15; for(const [a,b] of [[0,0],[1,0],[0,1],[1,1]]){ const x=a?78:50, y=b?78:50; g.beginPath(); g.moveTo(x+(a?-4:4),y+(b?14:-14)); g.quadraticCurveTo(x,y,x+(a?14:-14),y+(b?-4:4)); g.stroke(); } }
    if(name==='bang'){ g.fillStyle='#ffef3a'; g.strokeStyle='#1b1b1b'; g.lineWidth=7; g.beginPath(); g.moveTo(48,8); g.lineTo(82,8); g.lineTo(72,82); g.lineTo(58,82); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.arc(65,104,13,0,Math.PI*2); g.fill(); g.stroke(); }
    if(name==='sparkle'){ g.fillStyle='#fff'; g.beginPath(); g.moveTo(64,6); g.quadraticCurveTo(70,58,122,64); g.quadraticCurveTo(70,70,64,122); g.quadraticCurveTo(58,70,6,64); g.quadraticCurveTo(58,58,64,6); g.fill(); }
    const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace; return SYM[name]=t;
  }
  const SET={joy:[['star',-1.7,.35,.55],['star',1.65,.2,.45],['star',-1.55,-.45,.34]],
             confident:[['sparkle',1.6,.35,.5]],
             frustrated:[['vein',1.6,-.15,.55],['sweat',-1.55,-.2,.42]],
             concern:[['sweat',1.3,.45,.45],['sweat',-1.25,.15,.34]],
             shock:[['bang',-1.8,-.45,.7],['sweat',1.5,-.1,.45]],
             tear:[['sparkle',.42,-.32,.28],['sparkle',-.42,-.32,.28]]};
  function spawn(f,name,t,dur){
    for(const [tx,x,y,s] of SET[name]||[]){
      const spr=new T.Sprite(new T.SpriteMaterial({map:symTex(tx),transparent:true,depthTest:false,depthWrite:false}));
      spr.renderOrder=20; spr.position.set(x,y,.45); spr.scale.setScalar(.01); f.head.add(spr);
      f.fx.push({sp:spr,t0:t,dur,size:s,base:spr.position.clone(),kind:tx});
    }
  }
  function tickFx(f,t){
    for(let i=f.fx.length-1;i>=0;i--){ const e=f.fx[i], u=(t-e.t0)/e.dur;
      if(u>=1||u<0){ f.head.remove(e.sp); e.sp.material.dispose(); f.fx.splice(i,1); continue; }
      const pop=u<.12?Math.sin(u/.12*Math.PI*.65)*1.25:1, fade=u>.75?1-(u-.75)/.25:1;
      e.sp.scale.setScalar(e.size*pop); e.sp.material.opacity=fade;
      e.sp.position.copy(e.base);
      if(e.kind==='sweat') e.sp.position.y-=u*.35;
      else if(e.kind==='vein') e.sp.scale.multiplyScalar(1+.12*Math.sin(t*18));
      else { e.sp.position.y+=Math.sin((t-e.t0)*7)*.05; e.sp.material.rotation=(t-e.t0)*1.5; }
    }
  }

  function react(c,name,t,duration=1.1){
    const f=c&&c.face; if(!f) return;
    f.reaction={name,t0:t,until:t+duration};
    const big=duration>2;                           // 打席結束這類大事件才加符號
    if(big||name==='shock') spawn(f,name,t,Math.min(2,duration));
    if(big&&name==='frustrated') spawn(f,'tear',t,1.8);
  }
  // 樣品頁用：立刻套用某個表情
  function pose(c,name,extra={}){
    const f=c&&c.face; if(!f) return; Object.assign(f.a,full(name),{blink:0,gazeX:0,gazeY:0},extra); draw(f.ctx,f.o,f.a); f.texture.needsUpdate=true; f.key='';
  }

  function update(c,t,dt,target,mood='focus',effort=0,lock=false){
    const f=c&&c.face; if(!f||!c.root.visible) return;
    if(f.upperY===undefined) f.upperY=c.upper.position.y;
    const R=f.reaction&&t<f.reaction.until?f.reaction:null, name=R?R.name:mood, want=full(name), a=f.a;
    c.head.updateWorldMatrix(true,false); f.look.copy(target); c.head.worldToLocal(f.look);
    const depth=Math.max(3,Math.abs(f.look.z)), k=1-Math.exp(-dt*14);
    // 偶爾往旁邊瞄一下
    if(!R&&!lock&&t>f.glanceAt){ f.glance=(Math.random()<.5?-1:1)*(.35+Math.random()*.4); f.glanceAt=t+2.5+Math.random()*4; f.glanceEnd=t+.5+Math.random()*.4; }
    const gl=t<f.glanceEnd?f.glance:0;
    a.gazeX+=(lim(f.look.x/depth,-1,1)*.8+gl-a.gazeX)*k;
    a.gazeY+=(lim(f.look.y/depth,-.7,.7)-a.gazeY)*k;
    for(const key in BASE) a[key]+=(want[key]-a[key])*k;
    a.brow+=effort*.2*k; a.open-=effort*.1*k;
    // 自然眨眼（偶爾連眨兩下）
    if(f.nextBlink===null) f.nextBlink=t+1.2+f.phase*2.5;
    if(t>=f.nextBlink&&!lock){ f.blinkAt=t; f.nextBlink=t+(Math.random()<.2?.28:2.2+Math.random()*3.2); }
    a.blink=lock?0:Math.max(0,1-Math.abs((t-f.blinkAt)/.075-1));
    // 頭部小動作：呼吸、微微點頭和歪頭；事件時加大
    const ph=f.phase*6.28, el=R?t-R.t0:0;
    let rx=Math.sin(t*1.6+ph)*.035, rz=Math.sin(t*.8+ph)*.05, hop=0;
    if(R){ const fade=lim(1-el/(R.until-R.t0),0,1);
      if(name==='joy'){ rz+=Math.sin(el*9)*.12*fade; rx-=.12*fade; hop=Math.abs(Math.sin(el*Math.PI*2.4))*.35*lim(1-el/1.2,0,1); }
      else if(name==='frustrated'){ rx+=.24*fade; rz+=Math.sin(el*20)*.07*lim(1-el/.8,0,1); }
      else if(name==='concern'||name==='shock'){ rz+=Math.sin(el*24)*.05*lim(1-el/.6,0,1); rx-=.08*fade; }
      else if(name==='confident'){ rx-=.13*fade; rz+=.06*fade; } }
    c.head.rotation.x=rx; c.head.rotation.z=rz; c.upper.position.y=f.upperY+hop;
    tickFx(f,t);
    // 只有表情真的改變時才重畫貼圖（最多每秒 30 次）
    if(t<f.nextFrame) return;
    const q=v=>Math.round(v*24);
    const key=[a.open,a.lid,a.brow,a.browY,a.smile,a.mouth,a.teeth,a.round,a.happy,a.wide,a.smirk,a.blush,a.blink,a.gazeX,a.gazeY].map(q).join(',');
    if(key===f.key) return;
    f.key=key; f.nextFrame=t+1/30; draw(f.ctx,f.o,a); f.texture.needsUpdate=true;
  }

  function portrait(o,base){
    const p=document.createElement('canvas'); p.width=p.height=256; const g=p.getContext('2d'), art=layer(o.face);
    const bg=g.createLinearGradient(0,0,256,256); bg.addColorStop(0,'#96cee4'); bg.addColorStop(.5,'#437ba2'); bg.addColorStop(1,'#142b4a'); g.fillStyle=bg; g.fillRect(0,0,256,256);
    g.fillStyle=o.uni.base; g.beginPath(); g.ellipse(128,273,101,67,0,0,Math.PI*2); g.fill();
    for(const x of [42,214]) ell(g,x,150,15,26,o.face.skin);
    g.save(); g.beginPath(); g.roundRect(50,60,156,170,50); g.clip(); g.drawImage(base.image,700,290,650,660,50,60,156,170);
    g.drawImage(art.canvas,49,96,157,105.5); g.restore();
    const cap=g.createLinearGradient(0,16,0,110); cap.addColorStop(0,o.cap.color); cap.addColorStop(1,'#10263e'); g.fillStyle=cap;
    g.beginPath(); g.moveTo(42,98); g.quadraticCurveTo(35,14,128,14); g.quadraticCurveTo(222,14,214,98); g.closePath(); g.fill();
    g.fillStyle=o.face.hair; if(o.face.hairStyle!=='buzz') for(let i=0;i<7;i++) ell(g,64+i*21,104,13,15,o.face.hair);
    ell(g,128,96,97,16,o.cap.color); g.strokeStyle='rgba(8,19,34,.5)'; g.beginPath(); g.ellipse(128,96,97,16,0,0,Math.PI); g.stroke();
    g.fillStyle=o.cap.ink||'#fff'; g.font='italic 900 44px Rubik,Arial'; g.textAlign='center'; g.fillText(o.cap.logo||'',128,73);
    return p.toDataURL('image/png');
  }
  return {create,update,react,portrait,hair,pose,moods:Object.keys(moods)};
})();
