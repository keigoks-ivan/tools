'use strict';
function createBaseballEffects(scene,camera,ball,batMesh){
  const N=96, data=new Float32Array(N*3), colors=new Float32Array(N*3), particles=Array.from({length:N},()=>({life:0}));
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.BufferAttribute(data,3)); geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const cv=document.createElement('canvas'); cv.width=cv.height=64;
  const g=cv.getContext('2d'), gr=g.createRadialGradient(32,32,1,32,32,30);
  gr.addColorStop(0,'#ffffff'); gr.addColorStop(0.25,'#ffffff'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,64,64);
  const pointMat=new THREE.PointsMaterial({map:new THREE.CanvasTexture(cv),size:0.65,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
  const points=new THREE.Points(geo,pointMat); points.frustumCulled=false; scene.add(points);
  function ribbon(count,color,opacity){
    const a=new Float32Array(count*6), idx=[];
    for(let i=0;i<count-1;i++){ const k=i*2; idx.push(k,k+1,k+2,k+1,k+3,k+2); }
    const geom=new THREE.BufferGeometry(); geom.setAttribute('position',new THREE.BufferAttribute(a,3)); geom.setIndex(idx);
    const mesh=new THREE.Mesh(geom,new THREE.MeshBasicMaterial({color,transparent:true,opacity,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));
    mesh.visible=false; mesh.frustumCulled=false; scene.add(mesh); return {mesh,a,history:[],count};
  }
  const trail=ribbon(96,0xbdefff,0.58), arc=ribbon(12,0xffda85,0.34);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:pointMat.map,color:0xdbf5ff,transparent:true,opacity:0.38,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.scale.set(1.1,1.1,1); glow.visible=false; ball.add(glow); let trailAge=1, trailState='', trailClock=0;
  const v=new THREE.Vector3(), tangent=new THREE.Vector3(), side=new THREE.Vector3(), view=new THREE.Vector3();
  function track(r,p,width){
    r.history.unshift(p.clone()); if(r.history.length>r.count) r.history.pop();
    if(r.history.length<2) return;
    const h=r.history;
    for(let i=0;i<r.count;i++){
      const pos=h[Math.min(i,h.length-1)], next=h[Math.min(i+1,h.length-1)], prev=h[Math.min(Math.max(0,i-1),h.length-1)];
      tangent.subVectors(prev,next); view.subVectors(camera.position,pos); side.crossVectors(tangent,view).normalize().multiplyScalar(width*(1-i/(r.count-1)));
      r.a.set([pos.x+side.x,pos.y+side.y,pos.z+side.z,pos.x-side.x,pos.y-side.y,pos.z-side.z],i*6);
    }
    r.mesh.geometry.attributes.position.needsUpdate=true; r.mesh.visible=true;
  }
  function burst(pos,count,color,speed,life){
    const col=new THREE.Color(color);
    for(let i=0;i<count;i++){
      const p=particles.find(p=>p.life<=0); if(!p) break;
      const a=Math.random()*Math.PI*2, s=speed*(0.4+Math.random()*0.6);
      Object.assign(p,{x:pos.x,y:pos.y,z:pos.z,vx:Math.cos(a)*s,vy:s*(0.4+Math.random()),vz:Math.sin(a)*s,life,max:life,col:col.clone()});
    }
  }
  const ringGeo=new THREE.RingGeometry(0.7,0.85,48), ringMat=new THREE.MeshBasicMaterial({color:0xffe6a1,transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const impact=new THREE.Mesh(ringGeo,ringMat); scene.add(impact); let impactT=1;
  function hit(pos,power){
    resetTrail(); burst(pos,30,0xffe8a8,8+power*5,0.32); impact.position.copy(pos); impactT=0;
  }
  function dust(pos){ burst(pos,14,0xd8a772,2.5,0.48); }
  function resetTrail(){ trail.history.length=0; trail.mesh.visible=false; trailAge=1; trailClock=0; }
  function reset(){ resetTrail(); arc.history.length=0; arc.mesh.visible=false; impactT=1; impact.visible=false; for(const p of particles) p.life=0; }
  function update(dt,state,swingT,power){
    glow.visible=ball.visible&&state==='pitch';
    if(ball.visible&&(state==='pitch'||state==='play')){
      trailAge=0; trailState=state; trail.mesh.material.opacity=0.58; trailClock+=dt;
      if(trailClock>=1/90||trail.history.length<2){ track(trail,ball.position,state==='pitch'?0.24:0.18); trailClock%=1/90; }
    } else {
      trailAge+=dt; trail.mesh.material.opacity=Math.max(0,1-trailAge/0.25)*0.58;
      if(trailAge>=0.25) resetTrail();
    }
    if(swingT>=0.035&&swingT<0.32&&batMesh.parent?.parent?.parent?.visible!==false){
      batMesh.localToWorld(v.set(0,0,2.65)); track(arc,v,power?0.26:0.16);
    } else { arc.history.length=0; arc.mesh.visible=false; }
    impactT+=dt; impact.visible=impactT<0.24;
    if(impact.visible){ impact.quaternion.copy(camera.quaternion); const near=Math.min(1,camera.position.distanceTo(impact.position)/60); impact.scale.setScalar(1+impactT*17*near); ringMat.opacity=(1-impactT/0.24)*0.75*(0.35+0.65*near); }   // 鏡頭很近時不要放大到蓋住畫面
    for(let i=0;i<N;i++){
      const p=particles[i]; p.life-=dt;
      if(p.life>0){ p.vy-=dt*18; p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt; data.set([p.x,p.y,p.z],i*3); const k=p.life/p.max; colors.set([p.col.r*k,p.col.g*k,p.col.b*k],i*3); }
      else { data.set([0,-100,0],i*3); colors.set([0,0,0],i*3); }
    }
    geo.attributes.position.needsUpdate=true; geo.attributes.color.needsUpdate=true;
    if(ball.visible){ ball.rotation.x+=dt*40; ball.rotation.z+=dt*12; }
  }
  function drawTrail(g,project){
    if(trailState!=='pitch'||!trail.mesh.visible||trail.history.length<2) return;
    const path=trail.history.map(p=>project(p.x,p.y,p.z)), first=path[0], last=path[path.length-1], alpha=Math.max(0,1-trailAge/0.25);
    const gradient=g.createLinearGradient(...first,...last); gradient.addColorStop(0,`rgba(240,253,255,${alpha*0.95})`); gradient.addColorStop(0.5,`rgba(140,224,255,${alpha*0.6})`); gradient.addColorStop(1,'rgba(120,210,255,0)');
    g.save(); g.strokeStyle=gradient; g.lineWidth=2.5; g.lineCap='round'; g.lineJoin='round'; g.shadowColor='#9bddff'; g.shadowBlur=7; g.beginPath();
    path.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p)); g.stroke();
    g.fillStyle=`rgba(255,255,245,${alpha})`; g.beginPath(); g.arc(...first,2.7,0,Math.PI*2); g.fill(); g.restore();
  }
  // ---------- 慶祝：彩帶、煙火（獨立粒子，不跟擊球粒子搶） ----------
  const CN=420, cpos=new Float32Array(CN*3), ccol=new Float32Array(CN*3), cp=Array.from({length:CN},()=>({life:0}));
  const cgeo=new THREE.BufferGeometry(); cgeo.setAttribute('position',new THREE.BufferAttribute(cpos,3)); cgeo.setAttribute('color',new THREE.BufferAttribute(ccol,3));
  const cmat=new THREE.PointsMaterial({size:1.6,vertexColors:true,transparent:true,depthWrite:false,map:pointMat.map,blending:THREE.AdditiveBlending,sizeAttenuation:true});
  const cpts=new THREE.Points(cgeo,cmat); cpts.frustumCulled=false; scene.add(cpts); let cAlive=0;
  const PALETTE=[0xffd23a,0xff5a7a,0x5ad1ff,0x8cff6a,0xffffff,0xff9a3a,0xc58cff];
  function spawn(x,y,z,vx,vy,vz,life,color,drag,grav){ const q=cp.find(q=>q.life<=0); if(!q) return; Object.assign(q,{x,y,z,vx,vy,vz,life,max:life,col:new THREE.Color(color),drag,grav}); cAlive++; }
  function firework(x,y,z,color){
    const c=color??PALETTE[(Math.random()*PALETTE.length)|0], n=60;
    for(let i=0;i<n;i++){ const u=Math.random()*2-1, a=Math.random()*Math.PI*2, r=Math.sqrt(1-u*u), sp=28+Math.random()*10;
      spawn(x,y,z,Math.cos(a)*r*sp,u*sp,Math.sin(a)*r*sp,1.3+Math.random()*0.5,c,0.9,12); }
  }
  function confetti(x,y,z,count=140,spread=14){
    for(let i=0;i<count;i++){ const a=Math.random()*Math.PI*2, s=Math.random()*spread;
      spawn(x+Math.cos(a)*s*0.3,y,z+Math.sin(a)*s*0.3,Math.cos(a)*s*0.6,10+Math.random()*12,Math.sin(a)*s*0.6,2.6+Math.random()*1.2,PALETTE[(Math.random()*PALETTE.length)|0],1.6,9); }
  }
  function updateCelebrate(dt){
    if(!cAlive) return; cAlive=0;
    for(let i=0;i<CN;i++){ const q=cp[i];
      if(q.life>0){ q.life-=dt; cAlive++; const d=Math.exp(-q.drag*dt); q.vx*=d; q.vz*=d; q.vy=q.vy*d-q.grav*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; q.z+=q.vz*dt;
        const k=Math.max(0,q.life/q.max); cpos.set([q.x,q.y,q.z],i*3); ccol.set([q.col.r*k,q.col.g*k,q.col.b*k],i*3); }
      else { cpos.set([0,-200,0],i*3); ccol.set([0,0,0],i*3); } }
    cgeo.attributes.position.needsUpdate=true; cgeo.attributes.color.needsUpdate=true;
  }
  // ---------- 畫面上的演出（DOM）：決勝特寫、小提示、閃光 ----------
  if(!document.getElementById('fx-style')){
    const st=document.createElement('style'); st.id='fx-style';
    st.textContent=`
.fx-cutin{position:fixed;inset:0;pointer-events:auto;z-index:60;overflow:hidden;cursor:pointer}
.fx-cutin .fx-band{position:absolute;left:-10%;right:-10%;top:30%;height:40%;transform:skewY(-8deg);background:linear-gradient(90deg,var(--c1),var(--c2));box-shadow:0 0 0 6px #fff,0 0 0 10px #14202e,0 18px 40px #0008}
.fx-cutin .fx-lines{position:absolute;inset:0;background:repeating-linear-gradient(100deg,transparent 0 38px,rgba(255,255,255,.14) 38px 41px);animation:fxLines .5s linear infinite}
.fx-cutin .fx-face{position:absolute;left:12%;top:50%;width:min(30vh,240px);height:min(30vh,240px);transform:translateY(-50%) skewY(8deg);border-radius:18px;border:5px solid #fff;background:#fff8 center/cover no-repeat;box-shadow:0 8px 24px #0007}
.fx-cutin .fx-txt{position:absolute;left:calc(12% + min(30vh,240px) + 28px);right:6%;top:50%;transform:translateY(-50%) skewY(8deg);color:#fff;font-weight:900}
.fx-cutin .fx-kind{display:inline-block;background:#14202e;color:#ffe25a;border-radius:6px;padding:2px 12px;font-size:clamp(14px,2vw,20px);letter-spacing:3px}
.fx-cutin .fx-name{font-size:clamp(34px,7vw,84px);font-style:italic;letter-spacing:4px;-webkit-text-stroke:3px #14202e;paint-order:stroke fill;text-shadow:0 5px 0 #14202e;line-height:1.1;margin:6px 0}
.fx-cutin .fx-sub{font-size:clamp(14px,2.2vw,22px);text-shadow:0 2px 0 #14202e}
@keyframes fxBandIn{to{transform:skewY(-8deg) translateX(0)}}
@keyframes fxBandOut{to{transform:skewY(-8deg) translateX(-115%)}}
@keyframes fxLines{to{background-position:82px 0}}
.fx-banner{position:fixed;left:50%;top:21%;transform:translate(-50%,-8px);z-index:55;pointer-events:none;font-weight:900;font-size:clamp(16px,2.4vw,24px);color:#fff;padding:6px 22px;border-radius:999px;border:3px solid #fff;background:var(--bc,#1f6cc8);box-shadow:0 6px 18px #0006;opacity:0;transition:opacity .18s,transform .18s;white-space:nowrap;letter-spacing:1px;text-shadow:0 1px 0 #0006}
.fx-banner.show{opacity:1;transform:translate(-50%,0)}
.fx-flash{position:fixed;inset:0;z-index:54;pointer-events:none;background:radial-gradient(ellipse 80% 70% at 50% 55%,rgba(255,255,255,.7),rgba(255,248,220,.3) 55%,rgba(255,255,255,.12));opacity:0}`;
    document.head.appendChild(st);
  }
  const flashEl=document.createElement('div'); flashEl.className='fx-flash'; document.body.appendChild(flashEl);
  function flash(){ flashEl.animate([{opacity:1},{opacity:0}],{duration:320,easing:'ease-out'}); }
  let bannerEl=null, bannerT=0;
  function banner(text,color){
    if(!bannerEl){ bannerEl=document.createElement('div'); bannerEl.className='fx-banner'; document.body.appendChild(bannerEl); }
    bannerEl.textContent=text; bannerEl.style.setProperty('--bc',color||'#1f6cc8');
    bannerEl.classList.remove('show'); void bannerEl.offsetWidth; bannerEl.classList.add('show');
    clearTimeout(bannerT); bannerT=setTimeout(()=>bannerEl.classList.remove('show'),1600);
  }
  // 實況野球式決勝特寫：斜切色帶＋頭像＋大字，約 1.2 秒，點一下或按任何鍵就跳過。回傳 Promise。
  let cutinEl=null;
  function cutin(o={}){
    return new Promise(done=>{
      if(cutinEl){ cutinEl.remove(); cutinEl=null; }
      const KIND={pitch:'決勝球',bat:'決勝打擊',ability:'特殊能力'}[o.kind]||'';
      const c1=o.teamColor||'#1f6cc8';
      let face=o.portrait||'';
      if(!face && o.pid!=null && typeof C!=='undefined'){ for(const m of [C.batter,C.pitcher,C.runner]) if(m&&m.pid==o.pid&&m.portrait){ face=m.portrait; break; }
        if(!face && typeof GM!=='undefined' && GM){ if(o.pid==curBatter(GM)) face=C.batter?.portrait||''; else if(o.pid==curPitcher(GM)) face=C.pitcher?.portrait||''; } }
      const el=document.createElement('div'); el.className='fx-cutin'; el.style.setProperty('--c1',c1); el.style.setProperty('--c2','#14202e');
      el.innerHTML=`<div class="fx-band"><div class="fx-lines"></div></div>${face?`<div class="fx-face" style="background-image:url('${face}')"></div>`:''}<div class="fx-txt">${KIND?`<span class="fx-kind">${KIND}</span>`:''}<div class="fx-name"></div><div class="fx-sub"></div></div>`;
      el.querySelector('.fx-name').textContent=o.name||''; el.querySelector('.fx-sub').textContent=o.subtitle||'';
      document.body.appendChild(el); cutinEl=el;
      const band=el.querySelector('.fx-band'), txt=el.querySelector('.fx-txt'), fc=el.querySelector('.fx-face');
      band.animate([{transform:'skewY(-8deg) translateX(110%)'},{transform:'skewY(-8deg) translateX(0)'}],{duration:220,easing:'cubic-bezier(.2,.9,.3,1)'});
      for(const n of [txt,fc]) if(n) n.animate([{opacity:0,translate:'60px 0'},{opacity:1,translate:'0 0'}],{duration:260,delay:90,easing:'ease-out',fill:'backwards'});
      let closed=false; const close=()=>{ if(closed) return; closed=true; el.animate([{opacity:1},{opacity:0,transform:'translateX(-12%)'}],{duration:200,easing:'ease-in',fill:'forwards'}); removeEventListener('keydown',close,true); setTimeout(()=>{ el.remove(); if(cutinEl===el) cutinEl=null; done(); },200); };
      el.addEventListener('click',close); setTimeout(()=>addEventListener('keydown',close,true),150);
      setTimeout(close,o.ms||1200);
    });
  }
  const baseUpdate=update;
  function update2(dt,state,swingT,power){ baseUpdate(dt,state,swingT,power); updateCelebrate(dt); }
  return {update:update2,drawTrail,hit,dust,reset,resetTrail,cutin,banner,flash,firework,confetti,burst};
}
