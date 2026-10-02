import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createArrowGeometry } from './hero-bow.js?v=20261002w';

// Character silhouettes and soft ribbons share a bounded, reusable mesh pool.
// No full-screen postprocessing or per-frame geometry/texture allocation.
export function createHeroSpecialFx(T, scene, groundAt, { capacity = 96 } = {}) {
  const ring = new T.RingGeometry(.86, 1, 72);
  function ribbon(turn, width) {
    const positions = [], uv = [], indices = [];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, a = t * turn, w = width * Math.sin(Math.PI * t);
      for (const r of [1 - w, 1]) { positions.push(Math.cos(a) * r, Math.sin(a) * r, 0); uv.push(t, r === 1 ? 1 : 0); }
      if (i < 64) { const j = i * 2; indices.push(j,j+1,j+2,j+1,j+3,j+2); }
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(positions,3)); g.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); g.setIndex(indices); g.computeVertexNormals(); return g;
  }
  const arc = ribbon(Math.PI * 1.55, .16), coreArc = ribbon(Math.PI * 1.55, .025), wing = ribbon(Math.PI * .85, .27);
  const shard = new T.OctahedronGeometry(1), beam = new T.PlaneGeometry(1,1);
  const arrow = createArrowGeometry(T);
  // A coiling body, crest, snout and swept horns give the dragon a silhouette.
  const body = new T.CatmullRomCurve3(Array.from({length:33},(_,i) => { const t=i/32,a=t*Math.PI*2.4; return new T.Vector3(Math.cos(a)*(1-t*.35),t*2.2,Math.sin(a)*(1-t*.35)); }));
  const head = body.getPoint(1), parts = [new T.TubeGeometry(body,72,.085,8,false)];
  const skull = new T.SphereGeometry(.22,12,8); skull.scale(1.3,.65,.7); skull.translate(head.x+.08,head.y,head.z); parts.push(skull);
  for (const side of [-1,1]) {
    const horn = new T.ConeGeometry(.055,.4,5); horn.rotateZ(-.55); horn.translate(head.x-.05,head.y+.17,head.z+side*.12); parts.push(horn);
    const whisker = new T.TubeGeometry(new T.CatmullRomCurve3([head.clone(),head.clone().add(new T.Vector3(.3,-.08,side*.18)),head.clone().add(new T.Vector3(.5,.1,side*.4))]),12,.012,4,false); parts.push(whisker);
  }
  for (let i=3;i<30;i+=3) { const point=body.getPoint(i/32), fin=new T.ConeGeometry(.065,.23,3); fin.translate(point.x,point.y+.10,point.z); parts.push(fin); }
  const dragon = mergeGeometries(parts); parts.forEach(g => g.dispose());
  const birdShape = new T.Shape();
  const outline = [[0,.08],[-.26,.28],[-1,.58],[-.62,.16],[-.88,.18],[-.48,-.02],[-.63,-.1],[-.23,-.14],[-.12,-.28],[0,-.5],[.12,-.28],[.23,-.14],[.63,-.1],[.48,-.02],[.88,.18],[.62,.16],[1,.58],[.26,.28],[.07,.18],[.05,.30],[0,.37],[-.05,.30]];
  birdShape.moveTo(...outline[0]); outline.slice(1).forEach(p => birdShape.lineTo(...p)); birdShape.closePath();
  const bird = new T.ShapeGeometry(birdShape);
  const featherShape=new T.Shape();featherShape.moveTo(0,-.5);featherShape.quadraticCurveTo(-.28,.05,0,.65);featherShape.quadraticCurveTo(.22,.05,0,-.5);
  const feather=new T.ShapeGeometry(featherShape);
  const items = Array.from({ length: capacity }, () => {
    const material = new T.MeshBasicMaterial({ transparent:true, opacity:0, side:T.DoubleSide, depthWrite:false, blending:T.AdditiveBlending, toneMapped:false });
    const softMask = { value: 0 };
    material.onBeforeCompile = shader => {
      shader.uniforms.softMask = softMask;
      shader.fragmentShader = 'uniform float softMask;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n#ifdef USE_UV\ndiffuseColor.a *= mix(1.0, smoothstep(0.0,0.12,vUv.y) * smoothstep(1.0,0.72,vUv.y), softMask);\n#endif');
    };
    // UVs are used by the feathered ribbon shader even without a bitmap map.
    material.defines = { USE_UV: '' }; material.customProgramCacheKey = () => 'hero-soft-ribbon-v1';
    const bodyMaterial = new T.MeshStandardMaterial({ color:0x20516b, emissive:0x32bddb, emissiveIntensity:.8, roughness:.35, metalness:.3, transparent:true, opacity:0, depthWrite:false });
    const mesh = new T.Mesh(ring,material); mesh.visible=false; scene.add(mesh);
    return { mesh, material, bodyMaterial, softMask, age:0, life:0, growth:0, spin:0, vy:0, gravity:0, fade:.85, drift:new T.Vector3(), base:new T.Vector3() };
  });
  let index=0, style='violet';
  const palettes = {
    violet: { main:0xcd96ff, rim:0xf1dfff, shade:0x7a409f },
    azure: { main:0x66ddff, rim:0xddf9ff, shade:0x3687a3 },
    amber: { main:0xffce68, rim:0xfff1c2, shade:0xd87532 },
    jade: { main:0x91e5b6, rim:0xf2ffdf, shade:0x35956a },
  };
  const up = new T.Vector3(0,1,0), rotation = new T.Quaternion();
  function emit(geometry,pos,scale,life,options={}) {
    const item=items[index++ % items.length];
    Object.assign(item,{age:0,life,growth:0,spin:0,vy:0,gravity:0,fade:.85},options);
    item.drift.set(...(options.velocity || [0,0,0])); item.base.set(...scale);
    item.softMask.value = geometry === arc || geometry === coreArc || geometry === wing || geometry === beam ? 1 : 0;
    item.mesh.material = geometry === dragon ? item.bodyMaterial : item.material;
    item.mesh.geometry=geometry; item.mesh.position.copy(pos); item.mesh.rotation.set(...(options.rotation || [0,0,0])); item.mesh.scale.copy(item.base);
    if (geometry !== dragon) item.mesh.material.color.setHex(options.color ?? palettes[style].main).multiplyScalar(.7); item.mesh.material.opacity=item.fade; item.mesh.visible=true;
    return item.mesh;
  }
  const at = (pos,y) => new T.Vector3(pos.x,pos.y+y,pos.z);
  function groundHalo(pos,radius,life=.65,finish=false) {
    for (let i=0;i<3;i++) emit(ring,at(pos,.04+i*.015),[radius*(.3+i*.14),radius*(.3+i*.14),1],life+i*.1,{rotation:[-Math.PI/2,0,i*.3],growth:finish?1:.6,color:i===1?palettes[style].rim:palettes[style].main,fade:i===1?.6:.4});
  }
  function sparks(pos,count,radius,finish=false) {
    for (let i=0;i<count;i++) {
      const a=i/count*Math.PI*2;
      emit(shard,new T.Vector3(pos.x+Math.cos(a)*radius*.45,pos.y+.15,pos.z+Math.sin(a)*radius*.45),[.025,finish?.22:.10,.025],.65+i%3*.08,{vy:finish?2.8:1.5,gravity:4,velocity:[Math.cos(a)*.8,0,Math.sin(a)*.8],spin:i%2?3:-3,color:i%3?palettes[style].main:palettes[style].rim});
    }
  }
  function slash(pos,radius,facing,tilt,life=.5) {
    for (let i=0;i<3;i++) emit(i===1?coreArc:arc,at(pos,.55+i*.08),[radius*(1-i*.04),radius*(1-i*.04),1],life,{rotation:[-Math.PI/2+tilt,Math.PI/2-facing,i*.08],growth:.2,spin:tilt>0?1:-1,color:i===1?palettes[style].rim:i===2?palettes[style].shade:palettes[style].main,fade:i===1?.85:.6});
  }
  function wings(pos,size,facing,life=.65) {
    const symbol=emit(bird,at(pos,1.3),[size,size,1],life,{rotation:[0,Math.PI/2-facing,0],growth:.35,vy:.45,color:palettes.amber.rim,fade:.5});
    symbol.position.z-=.45;
    for (const side of [-1,1]) emit(wing,at(pos,1.0),[size*side,size*.7,1],life,{rotation:[-.3,Math.PI/2-facing,side*.25],spin:side*.7,growth:.25,color:palettes.amber.main,fade:.55});
    return symbol;
  }
  return {
    setStyle(id) { style=palettes[id]?id:'violet'; this.reset(); },
    warm(renderer,camera) {
      const a=items[0].mesh,b=items[1].mesh;
      a.geometry=arc; a.material=items[0].material; a.material.opacity=0;
      b.geometry=dragon; b.material=items[1].bodyMaterial; b.material.opacity=0;
      a.visible=b.visible=true;
      try { renderer.compile(scene,camera); } finally { a.visible=b.visible=false; }
    },
    onEvent(event,pos) {
      if (style==='violet') return;
      const facing=event.facing || 0, radius=(event.radius || event.finishRadius || 240)/60;
      if (style==='jade') {
        if(event.type==='arrow' || event.type==='arrowImpact') {
          const impact=event.type==='arrowImpact',tier=Math.min(5,event.fxTier||1),x=(event.x-640)/60,z=(event.y-500)/60;
          const centre=new T.Vector3(x,groundAt(x,z)+1.30+(event.height||0),z),yaw=Math.PI/2-facing;
          emit(ring,centre,[impact?.18+tier*.045:.14+tier*.025,impact?.18+tier*.045:.14+tier*.025,1],impact?.25:.16,{rotation:[0,yaw,0],growth:impact?1.2:.6,color:palettes.jade.rim,fade:impact?.70:.40});
          const count=impact?4+tier:2;
          for(let i=0;i<count;i++) {
            const angle=(i/count)*Math.PI*2,spread=impact?.8+tier*.12:.35;
            emit(feather,centre,[.10+tier*.018,.20+tier*.04,1],impact?.38:.22,{rotation:[0,yaw,angle],velocity:[Math.cos(angle)*spread,Math.sin(angle)*spread,impact?0:.8],spin:i%2?1.5:-1.5,color:i%3===0?0xffedbc:palettes.jade.main,fade:impact?.70:.40});
          }
          emit(shard,centre,[impact?.08:.04,impact?.08:.04,impact?.08:.04],.14,{color:palettes.jade.rim,growth:1.1,fade:.85});
          return;
        }
        if(event.type==='musouStart') {
          groundHalo(pos,2.2,1.0);
          for(let i=0;i<3;i++) emit(ring,at(pos,1.3+i*.2),[.7+i*.25,.7+i*.25,1],.85,{rotation:[0,Math.PI/2-facing,i*.25],spin:i%2?1:-1,color:palettes.jade.rim,fade:.5});
          emit(beam,at(pos,2.4),[.12,3.2,1],.7,{color:palettes.jade.rim,vy:5,fade:.5});
        }
        if(event.type==='swing' && event.flurry || event.type==='musouFinish') {
          const finish=event.type==='musouFinish', count=capacity<64 ? finish?18:9 : finish?36:18;
          for(let i=0;i<count;i++) {
            const a=i/count*Math.PI*2+(event.index || 0)*.55,r=radius*(.25+.65*((i*7)%count)/count);
            emit(arrow,new T.Vector3(pos.x+Math.cos(a)*r,pos.y+2.3+(i%3)*.35,pos.z+Math.sin(a)*r),[finish?1.8:1,finish?1.8:1,finish?1.8:1],.25+(i%3)*.04,{rotation:[Math.PI/2,0,a],velocity:[0,-12,0],color:i%3?palettes.jade.main:palettes.jade.rim,fade:.95});
          }
          groundHalo(pos,radius,finish?.85:.35,finish);sparks(pos,finish?12:6,radius,finish);
        }
        return;
      }
      if (event.type==='musouStart') {
        groundHalo(pos,2.4,1.0);
        sparks(pos,capacity<64?6:12,1.3);
        if (style==='azure') {
          emit(dragon,at(pos,.15),[1.15,1.15,1.15],1.25,{rotation:[0,Math.PI/2-facing,0],spin:.6,growth:.25,vy:.45,fade:.55});
          for (let i=0;i<3;i++) slash(pos,1.5+i*.3,facing,i*.4-.4,.85);
        } else wings(pos,1.65,facing,1.0);
      }
      if (event.type==='swing' && event.flurry && style==='azure') {
        groundHalo(pos,radius,.70);
        slash(pos,radius*.82,facing,(event.index%2?-.25:.25),.6);
        emit(dragon,at(pos,.08),[radius*.38,.72,radius*.38],.85,{rotation:[0,Math.PI/2-facing+event.index*.6,0],growth:.35,vy:.65,fade:.45});
        for (let i=0;i<8;i++) {
          const a=i*Math.PI/4;
          emit(beam,new T.Vector3(pos.x+Math.cos(a)*radius*.4,pos.y+.07,pos.z+Math.sin(a)*radius*.4),[.06,radius*.85,1],.65,{rotation:[-Math.PI/2,0,a],growth:.35,color:palettes.azure.rim,fade:.5});
        }
        sparks(pos,capacity<64?6:12,radius);
      }
      if (event.type==='swing' && event.flurry && style==='amber') {
        if (event.from) {
          const from=new T.Vector3((event.from.x-640)/60,pos.y+.75,(event.from.y-500)/60), end=at(pos,.75), direction=end.clone().sub(from), length=direction.length();
          if (length>.01) {
            rotation.setFromUnitVectors(up,direction.normalize());
            for (let i=0;i<3;i++) {
              const trail=emit(beam,from.clone().lerp(end,.5),[i===1?.045:.20,length,1],.4,{color:i===1?palettes.amber.rim:i===2?palettes.amber.shade:palettes.amber.main,fade:i===1?.95:.4});
              trail.quaternion.copy(rotation);
            }
          }
        }
        slash(pos,1.5,facing,event.index%2?-.7:.7,.38);
        if (event.index%2===0) wings(pos,.85,facing,.4);
        sparks(pos,capacity<64?3:5,.8);
      }
      if (event.type==='musouFinish') {
        groundHalo(pos,radius,.85,true);
        sparks(pos,capacity<64?12:24,radius,true);
        if (style==='azure') {
          emit(dragon,at(pos,.05),[radius*.32,1.45,radius*.32],1.1,{rotation:[0,Math.PI/2-facing,0],vy:1.8,growth:.35,fade:.75});
          for (let i=0;i<3;i++) slash(pos,radius*(.40+i*.08),facing,i*.3-.3,.9);
          for (let i=0;i<8;i++) { const a=i*Math.PI/4; emit(beam,new T.Vector3(pos.x+Math.cos(a)*radius*.65,pos.y+.65,pos.z+Math.sin(a)*radius*.65),[.075,1.3,1],.75,{rotation:[0,a,0],growth:.5,vy:.7,color:palettes.azure.rim,fade:.4}); }
        } else {
          wings(pos,2.7,facing,.9);
          for (const tilt of [-.8,.8]) slash(pos,radius*.62,facing,tilt,.7);
          for (let i=0;i<8;i++) emit(wing,at(pos,.2+i*.1),[radius*.65,radius*.65,1],.8,{rotation:[-Math.PI/2,i*.15,i*Math.PI/4],growth:.5,spin:i%2?1.4:-1.4,color:i%2?palettes.amber.shade:palettes.amber.main,fade:.4});
        }
      }
    },
    update(dt) {
      for (const item of items) {
        if (!item.mesh.visible) continue;
        item.age+=dt; if (item.age>=item.life) { item.mesh.visible=false; continue; }
        const p=item.age/item.life;
        item.mesh.material.opacity=item.fade*Math.pow(1-p,1.3);
        item.mesh.scale.copy(item.base).multiplyScalar(1+item.growth*p);
        item.mesh.rotation.z+=item.spin*dt;
        item.mesh.position.addScaledVector(item.drift,dt); item.vy-=item.gravity*dt; item.mesh.position.y+=item.vy*dt;
        item.mesh.position.y=Math.max(groundAt(item.mesh.position.x,item.mesh.position.z)+.025,item.mesh.position.y);
      }
    },
    reset() { for (const item of items) item.mesh.visible=false; },
    dispose() { for (const item of items) { scene.remove(item.mesh); item.material.dispose(); item.bodyMaterial.dispose(); } for (const g of [ring,shard,arc,coreArc,wing,beam,dragon,bird,feather,arrow]) g.dispose(); },
    stats() { return {active:items.filter(item=>item.mesh.visible).length,capacity:items.length}; },
  };
}
