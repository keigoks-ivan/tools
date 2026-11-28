import * as THREE from 'three';

const {clamp,smoothstep}=THREE.MathUtils;
const half=800,step=10,n=half*2/step;
export const HAUL=[[0,-369,98],[-16,-287,82],[-112,-245,70],[-228,-146,52],[-201,-40,41],[-106,2,24],[-51,93,10],[22,136,7]];
const stockpiles=[[-101,204,35,19,15],[-55,203,26,21,10],[184,-66,26,33,14],[217,-60,20,27,11],[227,154,37,19,16]];
function surface(x,z){
  const a=Math.atan2(z,x),r=Math.hypot(x*.85,z)*(1+.052*Math.sin(3*a)+.029*Math.sin(7*a));
  let h=4;
  for(const edge of [152,216,275,338,414]){
    const cut=edge+10*Math.sin(4*a+edge*.034)+6*Math.cos(9*a-edge*.012);
    h+=22*smoothstep(r,cut,cut+16);
  }
  h+=1.6*Math.sin(x*.025)*Math.cos(z*.033)+.55*Math.sin(z*.041+x*.05);
  h+=smoothstep(r,435,620)*(29+24*Math.sin(a*7)+15*Math.cos(a*12));
  const pond=Math.hypot((x-108)/66,(z-48)/45)+.09*Math.sin(z*.068)+.10*Math.cos(x*.059+z*.028);
  h=h*smoothstep(pond,.77,1.14)-2*(1-smoothstep(pond,.7,1.08));
  for(const [px,pz,w,d,top] of stockpiles)h+=top*Math.max(0,1-Math.hypot((x-px)/w,(z-pz)/d));
  let best=Infinity,roadY=0;
  for(let i=1;i<HAUL.length;i++){
    const [ax,az,ay]=HAUL[i-1],[bx,bz,by]=HAUL[i],dx=bx-ax,dz=bz-az;
    const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    const dist=Math.hypot(x-ax-t*dx,z-az-t*dz);
    if(dist<best){best=dist;roadY=ay+t*(by-ay);}
  }
  const road=1-smoothstep(best,14,33);
  h=THREE.MathUtils.lerp(h,roadY,road);
  // The rim loading apron carries the truck sideways without lifting its wheels off the road.
  const apron=1-smoothstep(Math.max(Math.abs(x-3)/60,Math.abs(z+287)/29),.81,1.33);
  return {h:THREE.MathUtils.lerp(h,82,apron),road:Math.max(road,apron)};
}
function bedrock(root,A){
  const heights=new Float32Array((n+1)**2),positions=[],road=[],indices=[],exposure=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const x=i*step-half,z=j*step-half,k=j*(n+1)+i,s=surface(x,z);
    heights[k]=s.h;positions.push(x,s.h,z);road.push(s.road);
    if(i<n&&j<n)indices.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);
  }
  // Bake how much of the sky is hidden by the next quarry bench.
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const k=j*(n+1)+i;
    const bank=Math.max(heights[j*(n+1)+Math.max(0,i-3)],heights[j*(n+1)+Math.min(n,i+3)],heights[Math.max(0,j-3)*(n+1)+i],heights[Math.min(n,j+3)*(n+1)+i])-heights[k];
    exposure.push(1-.31*smoothstep(bank,2,18));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('quarryLight',new THREE.Float32BufferAttribute(exposure,1));g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('quarryRoad',new THREE.Float32BufferAttribute(road,1));g.setIndex(indices);g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:0xdfd6c2,roughness:.88});
  mat.onBeforeCompile=s=>{
    s.uniforms.grit={value:A?.rockD||null};s.uniforms.roadbed={value:A?.asphD||null};
    s.vertexShader='attribute float quarryRoad,quarryLight;varying float vRoute,vLight;varying vec3 vRock,vFacet;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRock=position;vRoute=quarryRoad;vLight=quarryLight;vFacet=normal;');
    s.fragmentShader='uniform sampler2D grit,roadbed;varying vec3 vRock,vFacet;varying float vRoute,vLight;\n'+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 n=abs(normalize(vFacet));float cliff=1.-smoothstep(.42,.89,n.y);
      vec2 wall=vec2(n.x>n.z?vRock.z:vRock.x,vRock.y);
      vec3 grain=mix(texture2D(grit,vRock.xz/24.).rgb,texture2D(grit,wall/22.).rgb,cliff);
      float seam=.5+.5*cos(vRock.y*1.28+.38*sin(wall.x*.07)+.013*wall.x);
      float fluting=pow(.5+.5*cos(wall.x*2.2+.12*vRock.y),5.);
      float veins=sin(vRock.x*.017+vRock.z*.013+.85*sin(vRock.z*.048));
      float seep=smoothstep(.17,.78,sin(wall.x*.081+.12*sin(vRock.y*.3))+.42*cos(wall.x*.19));
      vec3 stone=mix(vec3(.32,.29,.25),vec3(.52,.50,.44),smoothstep(-.7,.7,veins))*.63+grain*.77;
      stone*=1.-cliff*(.18*seam+.10*fluting+.24*seep);
      vec3 track=vec3(.16,.14,.115)+.58*texture2D(roadbed,vRock.xz/14.).rgb;
      float rim=smoothstep(365.,510.,length(vRock.xz*vec2(.86,1.))+30.*veins);
      stone=mix(stone,vec3(.10,.14,.086)+grain*.20,rim*(1.-cliff*.7));
      float wet=1.-smoothstep(.5,5.5,vRock.y);
      diffuseColor.rgb=mix(stone,track,vRoute*.92)*vLight*(1.-.32*wet);`);
  };
  const mesh=new THREE.Mesh(g,mat);
  mesh.receiveShadow=true;mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;root.add(mesh);
  // Use exactly the two triangles used by the renderer so every foot and ray agrees with the terraces.
  return (x,z)=>{
    const u=clamp((x+half)/step,0,n-.00001),v=clamp((z+half)/step,0,n-.00001);
    const i=Math.floor(u),j=Math.floor(v),k=j*(n+1)+i,dx=u-i,dz=v-j;
    const b=heights[k+1],c=heights[k+n+1];
    return dx+dz<=1?heights[k]+(b-heights[k])*dx+(c-heights[k])*dz
      :heights[k+n+2]+(c-heights[k+n+2])*(1-dx)+(b-heights[k+n+2])*(1-dz);
  };
}
const drum=new THREE.CylinderGeometry(.5,.5,1,16);
const hopper=new THREE.CylinderGeometry(.5,.17,1,10);
const chip=new THREE.CylinderGeometry(.31,.52,1,5);
const yellow=0xc79449,steel=0x5a6769,red=0x966645;
export function quarry(root,site,batch,A){
  const floor=site.heightAt=bedrock(root,A),p=batch(root,'礦場破碎篩分線',A,true);
  const solid=(x,y,z,w,h,d)=>({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,bottom:y,top:y+h});
  const water=new THREE.Mesh(new THREE.CircleGeometry(1,56),new THREE.MeshStandardMaterial({color:0x397f7d,metalness:.29,roughness:.21}));
  water.rotation.x=-Math.PI/2;water.scale.set(96,68,1);water.position.set(108,.55,48);
  water.userData.fieldGeometry=water.userData.fieldMaterial=true;root.add(water);
  for(const [x,z] of [[-99,154],[174,-120],[225,98]]){
    const y=floor(x,z);
    for(const sx of [-12,12])for(const sz of [-9,9]){
      p.box(x+sx,y+8,z+sz,2.4,16,2.4,steel);
      p.strut([x+sx,y+1,z+sz],[x-sx,y+13,z+sz],.8,.8,steel);
    }
    p.box(x,y+19,z,32,14,24,0xb2aaa0,'ceramic');
    p.box(x,y+27,z,35,2.1,27,red,'car-deck');
    p.box(x,y+21,z-12.2,26,4,.65,0x4f6369,'glazing');
    p.add(hopper,x,y+9,z,18,8,16,0x787369);
    for(let dx=-12;dx<=12;dx+=4)p.box(x+dx,y+21,z-12.6,.32,4.2,.42,steel);
    for(const dy of [16,24])p.box(x,y+dy,z-13.8,34,.6,3.2,steel);
    for(let dx=-15;dx<=15;dx+=5)p.box(x+dx,y+25,z-15,.24,2,.24,yellow);
    p.box(x,y+26,z-15,30,.22,.22,yellow);
    site.boxes.push(solid(x,y,z,32,27,24));
    const tx=x+62,tz=z+38,ey=floor(tx,tz)+8;
    for(const s of [-1,1]){
      p.strut([x,y+18,z+s*2.8],[tx,ey,tz+s*2.8],1.4,1.5,steel);
      p.strut([x,y+21,z+s*2.8],[tx,ey+3,tz+s*2.8],.6,.6,yellow);
    }
    p.strut([x,y+18,z],[tx,ey,tz],5,1,0x545650);
    for(let i=1;i<=5;i++){
      const t=i/5,px=x+62*t,pz=z+38*t,top=y+18+(ey-y-18)*t;
      for(const d of [-2.6,2.6])p.strut([px,floor(px,pz),pz+d],[px,top,pz+d],.7,.8,steel);
    }
  }
  // Buffer bins, their loading gallery and the return belt mark the far processing bank.
  for(const z of [73,91,109]){
    const x=261,y=floor(x,z);
    p.add(drum,x,y+17,z,15,23,15,0xa49c8b,'car-deck');
    p.add(hopper,x,y+4.8,z,15,6,15,steel);
    for(const dy of [8,18,27])p.add(drum,x,y+dy,z,15.5,.7,15.5,steel);
    p.add(hopper,x,y+29.8,z,15,3,15,0x797f7b,false,Math.PI);
    site.boxes.push(solid(x,y,z,14,31,14));
  }
  p.strut([225,floor(225,98)+25,98],[261,floor(261,91)+32,91],3,2.5,steel);
  for(let i=1;i<HAUL.length;i++){
    const [ax,az]=HAUL[i-1],[bx,bz]=HAUL[i],len=Math.hypot(bx-ax,bz-az);
    for(let dist=7;dist<len;dist+=22){
      const t=dist/len,x=ax+(bx-ax)*t-(bz-az)*17/len,z=az+(bz-az)*t+(bx-ax)*17/len,y=floor(x,z);
      p.box(x,y+.9,z,.8,1.8,.8,0xe6dfbf);p.box(x,y+1.5,z,.87,.5,.87,yellow);
    }
  }
  // Scatter shale at the foot of cut faces and batch it with the opaque plant geometry.
  let seed=41811;
  const sample=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<760;i++){
    const x=sample()*900-450,z=sample()*800-400,y=floor(x,z);
    if(y<2||Math.max(floor(x+13,z),floor(x-13,z),floor(x,z+13),floor(x,z-13))-y<7)continue;
    const size=.9+sample()*3.9;
    p.add(chip,x,y-.16,z,size*1.6,size*.45,size,0xa19888,false,sample()*.4,sample()*6,.13);
  }
  p.finish();
  const truck=new THREE.Group();root.add(truck);const t=batch(truck,'百噸級運礦車');
  t.box(0,6,0,24,5.8,12,steel);t.box(-3,12,0,20,6.6,13,yellow,'car-deck');
  t.box(-3,15.5,0,20,.8,11.5,0x746c5c);
  for(const s of [-1,1]){
    t.box(-3,16,s*6.3,22,3,1.1,yellow,false,0,0,.08);
    for(let x=-12;x<6;x+=3.5)t.box(x,12.7,s*6.7,.6,5.3,.55,0x7d674a);
    for(const x of [-8.8,8.8]){
      t.add(drum,x,4.6,s*6.5,9.2,3.3,9.2,0x353939,false,Math.PI/2);
      t.add(drum,x,4.6,s*8.3,4.8,.65,4.8,yellow,false,Math.PI/2);
    }
  }
  t.box(9,11,-1.5,8,6,8,yellow);t.box(9,14.7,-1.5,6.7,3.6,6.8,0x4e646b,'glazing');
  t.box(9,16.8,-1.5,8.3,.7,8,0xe8d4a4);
  t.box(11,9.2,-5.4,9,.7,4,steel);t.box(10.8,11,-7,9,.22,.22,yellow);
  for(const x of [6.8,10,14.8])t.box(x,10,-7,.24,2,.24,yellow);
  for(const x of [12.5,14.8])t.box(x,6.8,-7.1,.21,5.1,.24,steel);
  for(let y=4.7;y<=9;y+=.9)t.box(13.65,y,-7.1,2.5,.22,.3,steel);
  for(const z of [-3.4,3.4])t.box(13.25,11.2,z,.4,1.1,1.7,0xffe8bb,true);
  t.finish();
  const box=solid(0,82,-287,29,17.2,17);site.mobile=[box];
  site.moveTruck=f=>{
    const x=4+45*f,y=floor(x,-287);
    truck.position.set(x,y,-287);Object.assign(box,solid(x,y,-287,29,17.2,17));
  };
  site.moveTruck(0);
  // Excavator shoulder armour is built once per course. It detaches from the actor on retry.
  const rig=new THREE.Group();root.add(rig);const armor=batch(rig,'裂顎・採掘外裝');
  for(const s of [-1,1]){
    armor.box(s*3.4,2.9,-.7,2.5,2.2,4,yellow,false,-.19);
    for(const dz of [-1.8,-.7,.4])armor.box(s*4.7,3.1,dz,.28,1.8,.62,steel);
    armor.strut([s*2,1.6,-2.3],[s*4.1,5,-2.8],.67,.7,steel);
    armor.box(s*4.1,5,-2.8,1.7,2.6,2.2,yellow);
    armor.box(s*2.1,2.9,1,1.2,.62,.27,0xffdf93,true);
  }
  armor.finish();rig.visible=false;
  rig.matrixAutoUpdate=false;
  site.poseRig=e=>{const torso=e.m.bones.torso;torso.updateWorldMatrix(true,false);rig.matrix.copy(torso.matrixWorld);rig.matrixWorldNeedsUpdate=true;rig.visible=true;};
  site.parkRig=()=>{rig.visible=false;};
  const warning=new THREE.Mesh(new THREE.RingGeometry(.9,1,60),new THREE.MeshBasicMaterial({color:0xff7b42,side:THREE.DoubleSide,transparent:true,opacity:.82,depthWrite:false}));
  warning.frustumCulled=false;warning.visible=false;warning.userData.fieldMaterial=warning.userData.fieldGeometry=true;root.add(warning);
  // Drape the telegraph on the sampled rock, even when the selected impact straddles a bench.
  const vertices=warning.geometry.attributes.position,unit=vertices.clone();
  site.markStrike=(at,r)=>{
    warning.visible=!!at;if(!at)return;
    for(let i=0;i<unit.count;i++){const x=at.x+r*unit.getX(i),z=at.z+r*unit.getY(i);vertices.setXYZ(i,x,floor(x,z)+.55,z);}
    vertices.needsUpdate=true;
  };
}
