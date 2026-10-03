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
    if(impact.visible){ impact.quaternion.copy(camera.quaternion); impact.scale.setScalar(1+impactT*17); ringMat.opacity=(1-impactT/0.24)*0.75; }
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
  return {update,drawTrail,hit,dust,reset,resetTrail};
}
