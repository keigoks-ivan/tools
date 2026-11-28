import * as THREE from 'three';
import {quarryWater,quarryPines} from './quarry-landscape.mjs';
import {haulTruck,crusherWorks,reclaimer,metalFinish} from './quarry-works.mjs';

const {clamp,smoothstep}=THREE.MathUtils;
const half=800,step=10,n=half*2/step;
export const HAUL=[[0,-369,98],[-16,-287,82],[-112,-245,70],[-228,-146,52],[-201,-40,41],[-106,2,24],[-51,93,10],[22,136,7]];
const haulLength=[0];
for(let i=1;i<HAUL.length;i++)haulLength.push(haulLength[i-1]+Math.hypot(HAUL[i][0]-HAUL[i-1][0],HAUL[i][1]-HAUL[i-1][1]));
const stockpiles=[[-101,204,35,19,15],[-55,203,26,21,10],[184,-66,26,33,14],[217,-60,20,27,11],[227,154,37,19,16]];
function surface(x,z){
  // Unequal benches follow several intersecting cut planes. A remnant spur splits the east face.
  const a=Math.atan2(z,x),r=Math.max(Math.abs(x*.69+z*.17),Math.abs(z*.91-x*.12),Math.abs(x*.47-z*.70));
  const strike=14*Math.sin(a*3+.5)+8*Math.sin(x*.023+z*.012)+4*Math.sin(x*.069-z*.051);
  let h=4;
  for(const [edge,rise,width] of [[112,19,13],[170,28,9],[232,16,11],[283,32,10],[357,24,15]]){
    const cut=edge+strike+16*Math.cos(a*3+edge*.019)+10*Math.sin(a*5+edge*.013);
    h+=rise*smoothstep(r,cut,cut+width);
  }
  const spur=Math.max(Math.abs((x-136)*.80+(z-254)*.24),Math.abs((z-254)*1.12-(x-136)*.18));
  h+=37*(1-smoothstep(spur,96,120))+22*(1-smoothstep(spur,66,89));
  h+=2.7*Math.sin(x*.034)*Math.cos(z*.052)+1.2*Math.sin(z*.074+x*.036);
  h+=smoothstep(r,394,590)*(18+18*Math.sin(a*4+.2)+12*Math.cos(a*9));
  const pond=Math.hypot((x-108)/66,(z-48)/45)+.09*Math.sin(z*.068)+.10*Math.cos(x*.059+z*.028);
  h=h*smoothstep(pond,.77,1.14)-(3.4-2.8*smoothstep(pond,.18,1.03))*(1-smoothstep(pond,.7,1.08));
  for(const [px,pz,w,d,top] of stockpiles)h+=top*Math.max(0,1-Math.hypot((x-px)/w,(z-pz)/d));
  // Leave level working shelves at the two sentry stations as the neighbouring faces fall away.
  h=THREE.MathUtils.lerp(h,17,1-smoothstep(Math.hypot(x+125,z-34),14,39));
  h=THREE.MathUtils.lerp(h,22,1-smoothstep(Math.hypot(x-94,z+128),12,34));
  let best=Infinity,roadY=0,lateral=0,chainage=0;
  for(let i=1;i<HAUL.length;i++){
    const [ax,az,ay]=HAUL[i-1],[bx,bz,by]=HAUL[i],dx=bx-ax,dz=bz-az;
    const t=clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
    const dist=Math.hypot(x-ax-t*dx,z-az-t*dz);
    if(dist<best){
      best=dist;roadY=ay+t*(by-ay);
      const length=haulLength[i]-haulLength[i-1];
      lateral=((x-ax)*dz-(z-az)*dx)/length;chainage=haulLength[i-1]+t*length;
    }
  }
  const road=1-smoothstep(best,14,33);
  h=THREE.MathUtils.lerp(h,roadY,road);
  // The rim loading apron carries the truck sideways without lifting its wheels off the road.
  const apron=1-smoothstep(Math.max(Math.abs(x-3)/76,Math.abs(z+287)/29),.81,1.33);
  return {h:THREE.MathUtils.lerp(h,82,apron),road:Math.max(road,apron),lateral,chainage};
}
function bedrock(root,A,bindTexture,sun){
  const heights=new Float32Array((n+1)**2),positions=[],road=[],tracks=[],indices=[],exposure=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const x=i*step-half,z=j*step-half,k=j*(n+1)+i,s=surface(x,z);
    heights[k]=s.h;positions.push(x,s.h,z);road.push(s.road);tracks.push(s.lateral,s.chainage);
    if(i<n&&j<n)indices.push(k,k+n+1,k+1,k+1,k+n+1,k+n+2);
  }
  // Bake how much of the sky is hidden by the next quarry bench.
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
    const k=j*(n+1)+i;
    const bank=Math.max(heights[j*(n+1)+Math.max(0,i-3)],heights[j*(n+1)+Math.min(n,i+3)],heights[Math.max(0,j-3)*(n+1)+i],heights[Math.min(n,j+3)*(n+1)+i])-heights[k];
    let skyline=0;
    for(const d of [2,5,10,18]){
      const u=clamp(i+Math.round(sun.x*d),0,n),v=clamp(j+Math.round(sun.z*d),0,n);
      skyline=Math.max(skyline,(heights[v*(n+1)+u]-heights[k])/(step*d)-sun.y);
    }
    exposure.push((1-.36*smoothstep(bank,2,18))*(1-.48*smoothstep(skyline,.01,.34)));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('quarryLight',new THREE.Float32BufferAttribute(exposure,1));g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('trackCoord',new THREE.Float32BufferAttribute(tracks,2));
  g.setAttribute('quarryRoad',new THREE.Float32BufferAttribute(road,1));g.setIndex(indices);g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:0xdfd6c2,roughness:.88});
  const faceMap={value:A?.rockD||null};
  bindTexture(mat,'./quarry-limestone.webp',true,t=>{faceMap.value=t;});
  mat.onBeforeCompile=s=>{
    Object.assign(s.uniforms,{grit:{value:A?.rubD||null},faceMap,roadbed:{value:A?.asphD||null},grass:{value:A?.grassD||null}});
    const vary='varying vec2 vTrack; varying vec3 vRock,vFacet; varying float vRoute,vLight;\n';
    s.vertexShader='attribute vec2 trackCoord; attribute float quarryRoad,quarryLight;'+vary+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrack=trackCoord;vRock=position;vRoute=quarryRoad;vLight=quarryLight;vFacet=normal;');
    s.fragmentShader='uniform sampler2D grit,faceMap,roadbed,grass;'+vary+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 geom=abs(normalize(cross(dFdx(vRock),dFdy(vRock))));
      float cliff=1.-smoothstep(.52,.94,min(geom.y,abs(normalize(vFacet).y)));
      float aspect=smoothstep(.26,.76,geom.x);
      float vein=.12*sin(vRock.x*.022+vRock.z*.032);
      vec2 elev=vec2(vRock.y/26.+vein,0.);
      vec3 face=mix(texture2D(faceMap,vec2(vRock.x/45.,elev.x)).rgb,texture2D(faceMap,vec2(vRock.z/45.+.32,elev.x)).rgb,aspect);
      vec3 gravel=texture2D(grit,vRock.xz/15.).rgb;
      vec3 macro=texture2D(faceMap,vRock.xz/115.+.37).rgb;
      float fines=smoothstep(.08,.58,macro.r+vein);
      vec3 dust=mix(vec3(.16,.145,.124),vec3(.29,.265,.22),fines)+gravel*(.23+.18*fines);
      vec3 stone=mix(dust,face*1.04+.006,cliff);
      float rim=smoothstep(340.,477.,max(abs(vRock.x*.73+vRock.z*.18),abs(vRock.z*.93-vRock.x*.09))+vein*80.);
      stone=mix(stone,(texture2D(grass,vRock.xz/38.).rgb*vec3(.22,.35,.25)+vec3(.023,.044,.032)),rim*(1.-cliff));
      vec3 gritRoad=texture2D(roadbed,vRock.xz/18.).rgb;
      float ruts=1.-smoothstep(.7,2.2,abs(abs(vTrack.x+sin(vTrack.y*.033)*.65)-4.));
      vec3 track=(vec3(.085,.060,.040)+gritRoad*.50+gravel*.19)*(1.-ruts*(.12+.19*smoothstep(.1,.54,gritRoad.r)));
      diffuseColor.rgb=mix(stone,track,vRoute)*vLight*(.61+.39*smoothstep(.55,4.6,vRock.y));`);
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
export function quarry(root,site,batch,A,bindTexture,sun=new THREE.Vector3(-.53,.54,-.65)){
  const floor=site.heightAt=bedrock(root,A,bindTexture,sun),p=batch(root,'礦場破碎篩分線',A,true);
  const solid=(x,y,z,w,h,d)=>({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,bottom:y,top:y+h});
  quarryWater(root,site,bindTexture,sun);
  quarryPines(root,floor,bindTexture);
  // A floating intake and a segmented pipe give the shoreline a visible scale.
  for(const x of [139,146])p.add(drum,x,1.1,64,2.6,12,2.6,0x435354,false,Math.PI/2);
  p.box(142.5,2.05,64,9,.68,10,0x8c8776,'car-deck');
  p.box(142.5,3.6,63,4.5,2.7,5,0x7c7d69);
  for(const x of [138.5,146.5]){
    for(const z of [59.6,64,68.4])p.box(x,3.1,z,.18,2,.18,yellow);
    p.box(x,4.15,64,.18,.18,9.3,yellow);
  }
  p.strut([143,2,65],[177,floor(177,82)+.8,82],1.6,1.6,steel);
  crusherWorks(p,floor,solid,site.boxes);
  reclaimer(p,floor,solid,site.boxes);
  for(const [x,z] of [[174,-120],[225,98]]){
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
  const truck=new THREE.Group();root.add(truck);haulTruck(truck,batch,A);
  const box=solid(0,82,-287,29,18.7,17);site.mobile=[box];
  site.moveTruck=f=>{
    const x=4+45*f,y=floor(x,-287);
    truck.position.set(x,y,-287);Object.assign(box,solid(x,y,-287,29,18.7,17));
  };
  site.moveTruck(0);
  // Excavator shoulder armour is built once per course. It detaches from the actor on retry.
  const rig=new THREE.Group();root.add(rig);const armor=batch(rig,'噬嶽・採掘外裝');
  for(const s of [-1,1]){
    armor.box(s*3.4,2.9,-.7,2.5,2.2,4,yellow,false,-.19);
    for(const dz of [-1.8,-.7,.4])armor.box(s*4.7,3.1,dz,.28,1.8,.62,steel);
    armor.strut([s*2,1.6,-2.3],[s*4.1,5,-2.8],.67,.7,steel);
    armor.box(s*4.1,5,-2.8,1.7,2.6,2.2,yellow);
    armor.box(s*2.1,2.9,1,1.2,.62,.27,0xffdf93,true);
  }
  // Folded ripping boom over one shoulder, with exposed hydraulic rods and worn teeth.
  for(const side of [-.65,.65]){
    const x=3.8+side;
    armor.strut([x,2.2,-2.6],[x,6.8,-1.6],.64,.7,0x8e673c);
    armor.strut([x,6.8,-1.6],[x,5.4,1.7],.60,.65,yellow);
    armor.strut([x,2.6,-1.4],[x,5.9,-1.15],.32,.36,0x9da59d);
    armor.add(drum,x,6.7,-1.6,.82,.33,.82,steel,false,0,0,Math.PI/2);
  }
  armor.box(3.8,5.35,1.83,2.5,.57,1.1,0x665342,false,.23);
  for(const x of [2.91,3.8,4.69])armor.strut([x,5.55,1.9],[x,4.8,2.45],.32,.36,0xc4b392);
  armor.finish();metalFinish(rig,A);rig.visible=false;
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
