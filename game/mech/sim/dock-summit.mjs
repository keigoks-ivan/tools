import * as THREE from 'three';
import {DOCK_GATES,SUMMIT_TOWER,SUMMIT_APPROACHES} from './campaign.mjs';

const drum=new THREE.CylinderGeometry(.5,.5,1,24);
const cap=new THREE.SphereGeometry(.5,32,12,0,Math.PI*2,0,Math.PI/2);
const rim=new THREE.TorusGeometry(1,.032,5,40);
const steel=0x465965,iron=0xa85e40,cream=0xe4dbcb,safety=0xf1af51;

function bulkhead(site,p,x,z,w,h,d,tint){
  p.box(x,h/2,z,w,h,d,tint,'ceramic');
  site.boxes.push({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,bottom:0,top:h});
}
function freighter(p,site,x,z){
  // Vary both beam and freeboard along the keel; the bow flares above the waterline.
  const sections=[[-138,.08,19],[-116,.68,18],[-80,1,15],[60,1,15],[103,.94,16],[125,.7,17]];
  for(let i=1;i<sections.length;i++){
    const [a,w1,h1]=sections[i-1],[b,w2,h2]=sections[i],w=(w1+w2)*10;
    site.boxes.push({x0:x-w,x1:x+w,z0:z+a,z1:z+b,bottom:0,top:2+(h1+h2)/2});
  }
  const v=[],uv=[],ix=[];
  for(const [station,beam,height] of sections){
    for(const [half,y] of [[-20,height],[-18,2],[-12,-6],[12,-6],[18,2],[20,height]]){
      v.push(half*beam,y,station);uv.push(half/15,station/22);
    }
  }
  for(let j=0;j<sections.length-1;j++)for(let k=0;k<6;k++){
    const a=j*6+k,b=j*6+(k+1)%6;ix.push(a,b,b+6,a,b+6,a+6);
  }
  const l=v.length/3-6;
  for(let k=1;k<5;k++)ix.push(l,l+k,l+k+1,0,k+1,k);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
  p.add(g,x,2,z,1,1,1,0x77473f,'car-deck');g.dispose();
  for(let j=0;j<5;j++){
    p.box(x,17.5,z-66+j*25,29,2.4,20,0x536774,'car-deck');
    for(const dx of [-13,13])p.box(x+dx,19,z-66+j*25,.65,1.3,20,cream);
  }
  for(let j=0;j<3;j++){
    p.box(x,21+j*6,z+79,33-j*3,6,30-j*3,cream,'ceramic');
    p.box(x,23+j*6,z+63.9+j*1.5,29-j*3,2.2,.5,0x354f5c);
  }
  // Deck furniture follows the taper of the foredeck and shows the ship's scale from above.
  for(const side of [-1,1]){
    for(let j=0;j<8;j++){
      const dz=-78+j*24,rail=x+side*18.7;
      p.box(rail,19.6,z+dz,.36,2.8,.36,cream);
      if(j<7)p.box(rail,20.85,z+dz+12,.26,.28,24,cream);
    }
    p.strut([x+side*4,23,z-111],[x+side*15,18,z-76],.40,.40,steel);
  }
  p.add(drum,x,27,z-88,1.8,19,1.8,cream);p.box(x,32,z-88,16,.9,1.2,cream);
  p.add(drum,x,32,z+104,7,22,9,iron);p.add(drum,x,43,z+104,7.2,2.4,9.2,steel);
}
function crane(p,x,z,side){
  for(const dz of [-11,11]){
    for(const dx of [-8,8])p.strut([x+dx,0,z+dz],[x+dx*.65,52,z+dz*.75],2.6,2.6,iron);
    p.strut([x-8,9,z+dz],[x+5,46,z+dz*.75],1.15,1.15,safety);
  }
  p.box(x,51,z,16,5,23,iron,'car-deck');
  p.box(x-side*9,53,z-4,6,6,8,cream);p.box(x-side*12.1,54,z-4,.4,3.8,6.8,steel);
  const tip=x-side*57;
  for(const dz of [-2.8,2.8]){
    p.strut([x,55,z+dz],[tip,68,z+dz],1.7,1.7,iron);
    p.strut([x,63,z+dz],[tip,70,z+dz],1.2,1.2,iron);
    for(let i=0;i<8;i++){
      const f=i/8,t=(i+1)/8;
      p.strut([x-side*57*f,55+13*f,z+dz],[x-side*57*t,63+7*t,z+dz],.8,.8,safety);
    }
    p.strut([tip,68,z+dz],[tip,32,z+dz],.32,.32,steel);
  }
  p.box(tip,31,z,3,2.5,7,safety);
  // A-frame, counterweight and dual stays connect the jib to the crane chassis.
  p.strut([x+side*7,52,z],[x+side*9,74,z],2.4,2.9,iron);
  p.strut([x-side*5,54,z],[x+side*9,74,z],1.8,2.2,iron);
  for(const dz of [-2.5,2.5])p.strut([x+side*9,74,z],[tip+side*8,68,z+dz],.38,.38,steel);
  p.box(x+side*13,55,z,10,6.6,17,0x7e827b,'ceramic');
  for(const dx of [-5,5])p.box(tip+dx,29.2,z,1.8,2.1,7.4,safety);
  p.box(tip,29.7,z,13,1.8,5.4,iron);
}
export function dock(root,site,batch){
  const p=batch(root,'潮汐乾塢',null,true),wall=0xb3a899;
  p.box(0,-2,36,184,4,820,0xb8b0a0,'paving');
  for(const side of [-1,1]){
    for(let i=0;i<4;i++)p.box(side*(92+i*3),-1+i,36,4,5+i,820,wall,'ceramic');
    // Crane rails are embedded in the apron, their dark recesses visible in the cockpit.
    for(const rx of [54,73]){
      p.box(side*rx,.052,36,1.5,.10,810,0x444d50);
      p.box(side*rx,.14,36,.46,.14,810,0xa8aaa2);
    }
    for(let z=-315;z<415;z+=22){
      p.box(side*79,.1,z,1.2,.15,13,safety);
      p.add(drum,side*89,1.4,z,2.4,2.8,2.4,steel);
    }
    for(const z of [-160,8,196,346]){
      const az=z+(side<0?24:0);
      p.box(side*108,-1.1,az,38,6,39,wall,'ceramic');
      site.boxes.push({x0:side*108-19,x1:side*108+19,z0:az-19,z1:az+19,bottom:-4,top:1.9});
      crane(p,side*116,az,side);
    }
    for(const z of [-290,-65,170,372]){
      p.box(side*228,6,z,98,15,130,wall,'ceramic');
      p.box(side*235,24,z,75,21,83,0x879ba0,'glazing');
      p.box(side*235,35,z,78,2,86,cream,'car-deck');
      for(let k=-1;k<=1;k++){
        const cz=z+k*27;
        p.box(side*235,39.4,cz,75,1.5,25,0x899b99,'car-deck',-.25);
        p.box(side*235,38,cz+12,74,5.6,1.8,0x526a70,'glazing');
        p.box(side*197,17.1,cz,1.2,7,19,0x556164);
      }
    }
  }
  freighter(p,site,152,20);freighter(p,site,-151,209);
  for(const [x,z,w] of [[-57,-82,66],[57,-82,66],[-78,100,24],[0,100,44],[78,100,24]]){
    bulkhead(site,p,x,z,w,24,9,wall);
    p.box(x,24.5,z,w+1.4,1,10,safety,'car-deck');
    for(let dx=-w/2+3;dx<w/2;dx+=9){
      p.box(x+dx,25.8,z-3.8,.43,2.6,.43,steel);
      p.box(x+dx,12,z-4.7,.85,23,.75,0x9c9d92);
    }
    p.box(x,27.1,z-3.8,w,.39,.4,steel);
  }
  for(const [x,z] of [[-45,-129],[52,20],[-58,181]]){
    bulkhead(site,p,x,z,20,9,19,0xa99d8e);p.box(x,9.3,z,21,.6,20,steel);
  }
  site.gates=DOCK_GATES.map(({x,z})=>{
    const group=new THREE.Group();root.add(group);group.position.set(x,0,z);
    const leaf=batch(group,'塢門扇');
    leaf.box(0,12,0,44,24,4.2,0x59757a,'car-deck');
    for(const sign of [-1,1])for(const side of [-1,1])
      leaf.panel(side*10.8,12,sign*2.14,21.4,23.4,'caisson',0,sign<0?Math.PI:0);
    for(let j=-20;j<=20;j+=5)leaf.box(j,12,-2.35,.86,23,.9,0x334750);
    for(const y of [2,12,22])leaf.box(0,y,-2.6,44,1,1,cream);
    for(let j=-20;j<=20;j+=4)leaf.box(j,2,-3.2,2.6,1.1,.3,safety);
    leaf.finish();
    for(const side of [-1,1]){
      p.box(x+side*23,26,z,3.4,52,8,steel,'car-deck');
      p.add(drum,x+side*23,52,z,5,4,5,safety);
    }
    p.box(x,51,z,50,3,7,iron,'car-deck');
    return {group,box:{x0:x-22,x1:x+22,z0:z-2.6,z1:z+2.6,bottom:0,top:24}};
  });
  site.lift=(i,height)=>{
    const {group,box}=site.gates[i];group.position.y=height;box.bottom=height;box.top=height+24;
  };
  p.finish();
}

// Intermediate foothills provide parallax in front of the photographic high peaks.
function mountainBowl(root,assets){
  const positions=[],uv=[],colors=[],indices=[],tint=new THREE.Color(),count=192,rows=7;
  for(let j=0;j<=count;j++){
    const a=2*Math.PI*(j%count)/count;
    const ridge=42+19*Math.sin(3*a)+24*Math.cos(7*a+.8*Math.sin(13*a))+12*Math.cos(17*a);
    for(let k=0;k<rows;k++){
      const t=k/(rows-1),r=448+270*t+15*Math.cos(13*a+3*t);
      const x=Math.sin(a)*r,z=Math.cos(a)*r,y=-12+t*ridge+9*Math.sin(a*23+2*t)*t;
      positions.push(x,y,z);uv.push(x/38,z/38);
      const cold=THREE.MathUtils.smoothstep(y+7*Math.sin(24*a),33,68);
      tint.setRGB(.33+cold*.48,.39+cold*.47,.34+cold*.56);
      colors.push(tint.r,tint.g,tint.b);
      if(j<count&&k<rows-1){const i=j*rows+k;indices.push(i,i+1,i+rows+1,i,i+rows+1,i+rows);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,map:assets?.rockD||null,roughness:.95}));
  mesh.userData.fieldMaterial=mesh.userData.fieldGeometry=true;root.add(mesh);
}
function observatory(p,x,z,r,h){
  p.add(drum,x,h/2,z,2*r,h,r*2,0xc9c8bd,'ceramic');
  p.add(drum,x,h-4,z,r*2.02,4,r*2.02,0x455665);
  p.add(drum,x,h-.5,z,r*2.12,2,r*2.12,cream);
  // Two shell halves leave a visible meridian slit around the recessed telescope.
  const gap=.24;
  for(const start of [gap,Math.PI+gap]){
    const shell=new THREE.SphereGeometry(.5,20,9,start,Math.PI-2*gap,0,Math.PI/2);
    // Each shutter is a curved metal skin with a track on each side of the opening.
    p.add(shell,x,h,z,2*r,2*r,2*r,0xf6f6f1,'shutter',0,1.08);shell.dispose();
  }
  // A pitched telescope barrel and segmented shutter tracks remain visible through the slit.
  const axis=1.08,cs=Math.cos(axis),sn=Math.sin(axis);
  for(const sign of [-1,1]){
    for(let k=0;k<9;k++){
      const a=k*Math.PI/18,b=(k+1)*Math.PI/18;
      const vx=Math.cos(.24)*cs+sign*Math.sin(.24)*sn,vz=-Math.cos(.24)*sn+sign*Math.sin(.24)*cs;
      p.strut([x+vx*r*Math.cos(a),h+r*Math.sin(a),z+vz*r*Math.cos(a)],
        [x+vx*r*Math.cos(b),h+r*Math.sin(b),z+vz*r*Math.cos(b)],.65,.72,0x8d9695);
    }
  }
  p.add(cap,x,h,z,1.45*r,1.45*r,1.45*r,0x35434c);
  const dir=new THREE.Vector3(cs*.66,.75,-sn*.66).normalize();
  const rotation=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),dir));
  for(const [offset,bore,length,tint] of [[.80,.32,.47,0x404f58],[1.01,.36,.10,0xb8bfc1],[1.067,.29,.012,0x204454]]){
    p.add(drum,x+r*offset*dir.x,h+r*offset*dir.y,z+r*offset*dir.z,r*bore,r*length,r*bore,tint,false,rotation.x,rotation.y,rotation.z);
  }
  p.add(drum,x,h*.19,z,r*2.03,.9,r*2.03,0x848d91);
  for(let j=0;j<12;j++){
    const a=j*Math.PI/6;
    if(j%2===0)p.panel(x+(r+.08)*Math.sin(a),h*.60,z+(r+.08)*Math.cos(a),r*.47,h*.57,'shutter',0,a);
    p.box(x+(r+.2)*Math.sin(a),h*.47,z+(r+.2)*Math.cos(a),r*.23,3,.55,steel,false,0,a);
  }
  const dx=x+r*.66,dz=z-r*.68;
  p.box(dx,4.2,dz,6.2,8.4,4.2,0x566976,false,0,-.72);
  p.box(dx,8.8,dz,8,.7,6.8,cream,false,0,-.72);
}
export function summit(root,site,batch,assets){
  mountainBowl(root,assets);
  const gravel=new THREE.PlaneGeometry(1570,1570,38,38);
  gravel.rotateX(-Math.PI/2);
  const {uv,position}=gravel.attributes,drift=[];
  for(let i=0;i<uv.count;i++){
    const x=position.getX(i),z=position.getZ(i);
    const wind=.46*Math.sin(x*.018+z*.009)+.31*Math.cos(z*.036-x*.007)+.18*Math.sin(x*.071+z*.044);
    const verge=THREE.MathUtils.smoothstep(Math.abs(x),24,56);
    drift.push(THREE.MathUtils.clamp(.46+.82*wind+.19*verge,0,1));
    uv.setXY(i,uv.getX(i)*76,uv.getY(i)*76);
  }
  gravel.setAttribute('drift',new THREE.Float32BufferAttribute(drift,1));
  const gravelMat=new THREE.MeshStandardMaterial({map:assets?.rockD||null,normalMap:assets?.rockN||null,normalScale:new THREE.Vector2(.36,.36),roughness:.95});
  gravelMat.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float drift;varying float vDrift;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvDrift=drift;');
    shader.fragmentShader='varying float vDrift;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float fissure=dot(diffuseColor.rgb,vec3(.21,.72,.07));
      float snow=smoothstep(.39,.70,vDrift+min(fissure,.62)*.49);
      vec3 moraine=diffuseColor.rgb*vec3(.76,.80,.83);
      diffuseColor.rgb=mix(moraine,vec3(.73,.82,.87)*(.92+.16*fissure),snow);`);
  };
  const apron=new THREE.Mesh(gravel,gravelMat);
  apron.position.y=-.08;apron.receiveShadow=true;apron.userData.fieldGeometry=apron.userData.fieldMaterial=true;root.add(apron);
  const p=batch(root,'高山光學觀測站',assets,true);
  // Glacial erratics break up the forecourt without blocking the marked flight approaches.
  const stone=new THREE.IcosahedronGeometry(1,0);
  stone.setIndex(Array.from({length:stone.attributes.position.count},(_,i)=>i));
  for(const side of [-1,1])for(let j=0;j<37;j++){
    const cx=side*(141+Math.abs(Math.sin(j*32.41))*201),cz=-335+j*19+13*Math.cos(j);
    const r=2.2+3.7*Math.sin(j*1.22)**2;
    p.add(stone,cx,r*.26,cz,r*1.8,r,r*1.36,j%3?0x75796e:0x989b91,false,.21,j*1.39,.13);
    site.boxes.push({x0:cx-r,x1:cx+r,z0:cz-r,z1:cz+r,bottom:0,top:r});
  }
  stone.dispose();
  p.box(0,-.34,22,56,1,720,0xb7b5a9,'paving');
  for(let z=-294;z<310;z+=22)for(const x of [-25,25])p.box(x,.27,z,.8,.14,13,cream);
  const {x,z}=SUMMIT_TOWER;
  // The flat maintenance terraces also serve as recharge landings.
  for(const side of [-1,1]){
    const ax=side*90,az=156;
    bulkhead(site,p,ax,az,54,35,62,0xa8ada7);
    p.box(ax,35,az,54,.24,62,0xc8c7b9,'paving');
    // A service gallery and braced apron turn the recharge deck into a mountain-side station.
    p.box(ax,27,az-31.2,52,7,.75,0x516370,'glazing');
    for(const dx of [-23,-14,-5,5,14,23]){
      p.strut([ax+dx,1,az-31],[ax+dx,23,az-32.6],1.1,1.4,steel);
      p.box(ax+dx,27,az-31.8,.66,7.7,1.1,cream);
    }
    for(const dx of [-21,21])p.box(ax+dx,35.3,az,1,.4,44,safety);
  }
  for(const [cx,cz,r,h] of [[x,z,31,56],[-111,-77,20,18],[127,-31,25,24],[-142,270,19,20],[104,310,16,17]]){
    observatory(p,cx,cz,r,h);
    // Stacked strips approximate the circular wall and shrinking roof for cover and landings.
    for(let j=-3;j<=3;j++){
      const dz=j*r*2/7,w=Math.sqrt(Math.max(0,r*r-dz*dz));
      site.boxes.push({x0:cx-w,x1:cx+w,z0:cz+dz-r/7,z1:cz+dz+r/7,bottom:0,top:h});
    }
    for(const f of [.86,.59,.32]){
      const a=r*f*.72;
      site.boxes.push({x0:cx-a,x1:cx+a,z0:cz-a,z1:cz+a,bottom:h,top:h+r*Math.sqrt(1-f*f)});
    }
  }
  for(const {x:ax,y:ay,z:az} of SUMMIT_APPROACHES){
    for(const dx of [-18,18]){
      const bx=ax+dx;
      p.strut([bx-4,0,az],[bx,ay,az],1.2,1.2,steel);p.strut([bx+4,0,az],[bx,ay,az],1.2,1.2,steel);
      p.box(bx,ay,az,2,8,2,0x65eff0,true);
    }
  }
  for(const [cx,cz] of [[-170,48],[180,156],[-189,220]]){
    p.add(drum,cx,8,cz,7,16,7,steel);
    // An open parabolic dish faces up and across the ridgeline.
    const a=-.62,pivot=new THREE.Group();pivot.position.set(cx,17,cz);pivot.rotation.z=a;root.add(pivot);
    const dish=batch(pivot,'電波望遠鏡'),profile=[];
    for(let j=0;j<=12;j++){const r=Math.max(.01,j*1.35);profile.push(new THREE.Vector2(r,r*r/42));}
    const g=new THREE.LatheGeometry(profile,28);dish.add(g,0,0,0,1,1,1,cream);
    const outer=new THREE.LatheGeometry(profile.slice().reverse(),28);dish.add(outer,0,-.24,0,1,1,1,0x889598);outer.dispose();g.dispose();
    dish.add(rim,0,6.3,0,16.3,16.3,16.3,cream,false,-Math.PI/2);
    for(let j=0;j<3;j++){const t=j*2*Math.PI/3;dish.strut([16*Math.sin(t),6,16*Math.cos(t)],[0,13,0],.48,.48,steel);}
    dish.add(drum,0,13,0,2,2,2,iron);dish.finish();
  }
  p.finish();
}
