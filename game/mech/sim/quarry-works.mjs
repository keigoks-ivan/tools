import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const steel=0x56656a,rust=0x92543a,paint=0xd89731,dark=0x353d40;
const drum=new THREE.CylinderGeometry(.5,.5,1,20);

// XY cross sections are welded once, then stamped into the same indexed batches as the sheet steel.
function plate(points,depth){
  const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
  const raw=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false});
  raw.translate(0,0,-depth/2);
  const geometry=mergeVertices(raw);raw.dispose();return geometry;
}

// Shared wear maps supply the oxide, rubbed paint and pale dust caught on upward-facing panels.
export function metalFinish(group,A){
  if(!A?.wearM)return;
  for(const mesh of group.children){
    const m=mesh.material;if(!m?.isMeshStandardMaterial||m.map)continue;
    m.onBeforeCompile=s=>{
      s.uniforms.wear={value:A.wearM};s.uniforms.fines={value:A.rubD};
      const vary='varying vec3 localPoint,localFace;\n';
      s.vertexShader=vary+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nlocalPoint=position;localFace=normal;');
      s.fragmentShader='uniform sampler2D wear,fines;'+vary+s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 f=abs(normalize(localFace));vec2 coord=f.y>max(f.x,f.z)?localPoint.xz:f.x>f.z?localPoint.zy:localPoint.xy;
        vec3 stain=texture2D(wear,coord*.135).rgb;float soil=texture2D(fines,coord*.093).r;
        float painted=smoothstep(.018,.10,diffuseColor.r-diffuseColor.b);
        diffuseColor.rgb*=.73+.22*stain.g+soil*.25;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.095,.076,.059),painted*.58*smoothstep(.59,.83,stain.b));
        float settling=smoothstep(-.18,.92,normalize(localFace).y)*(.15+.33*soil);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.29,.248,.19),settling);
      `);
    };
  }
}

export function haulTruck(truck,batch,A){
  const t=batch(truck,'剛性運礦車・翻斗與底盤',A);
  const side=plate([[-14,14.6],[-13.4,16.1],[3.6,16.1],[6.1,18.6],[10.4,18.6],[9.8,17.5],[6.8,16.8],[2.2,9.2],[-8.4,9.2]],.65);
  const cab=plate([[-2.9,0],[3.4,0],[3.1,1.4],[2.25,4.45],[-2.35,4.45],[-2.9,3.4]],5.2);
  const glass=plate([[-2.28,1.35],[2.84,1.35],[2.02,4.0],[-1.95,4.0]],.08);
  const tyre=new THREE.LatheGeometry([[2.12,-1.54],[3.35,-1.72],[4.12,-1.53],[4.50,-1.03],[4.54,.98],[4.14,1.5],[3.36,1.72],[2.12,1.54],[2.12,-1.54]].map(p=>new THREE.Vector2(...p)),24);
  t.box(0,6.15,0,23.8,2.25,7,dark);
  for(const s of [-1,1]){
    t.add(side,0,0,s*6.5,1,1,1,paint);
    for(let i=0;i<6;i++){
      const x=-11.4+i*2.6,foot=Math.max(9.6,13-(x+11.4)*.84);
      t.strut([x+1.2,foot,s*6.88],[x,15.6,s*6.88],.44,.34,0xa87631);
    }
    t.box(-3.3,15.92,s*6.88,19.4,.16,.16,0xad9d7d);
    t.strut([-2.2,6.7,s*3.8],[3.9,12.6,s*3.8],.94,.94,0xc1bdb0);
    for(const x of [-8.6,8.45]){
      const z=s*6.45;
      t.add(tyre,x,4.55,z,1,1,1,0x303333,false,Math.PI/2);
      t.add(drum,x,4.55,z+s*1.27,4.8,.84,4.8,0x8b7855,false,Math.PI/2);
      t.add(drum,x,4.55,z+s*1.78,2.8,.44,2.8,0xecac51,false,Math.PI/2);
      for(let j=0;j<18;j++){
        const a=j*Math.PI/9,dx=Math.cos(a),dy=Math.sin(a);
        t.box(x+4.49*dx,4.55+4.49*dy,z,.30,.81,2.28,0x393b39,false,0,.15*s,a);
        if(j%2===0)t.add(drum,x+1.88*dx,4.55+1.88*dy,z+s*1.77,.39,.28,.39,dark,false,Math.PI/2);
      }
    }
  }
  // The bed is open at the tipping end. Its floor and the cab guard follow the bends in the side plates.
  t.box(-3,9.5,0,11.2,.65,12.8,0x827961);
  t.box(-11.18,12.14,0,7.75,.67,12.8,0x857e6e,false,0,0,-.76);
  t.box(4.45,13.05,0,8.9,.74,12.8,0x8c7d5d,false,0,0,1.04);
  t.box(8.22,18.1,0,4.5,.67,13.4,paint);
  t.box(9.25,9.8,.7,8.7,4.1,10.8,paint);
  t.add(cab,9.45,11.65,-3.55,1,1,1,0xdca444);
  t.add(glass,9.45,11.65,-6.19,1,1,1,0x344e59);
  t.box(9.12,14.28,-6.28,.18,2.65,.13,0x262e31);
  t.box(12.04,14.28,-3.55,.14,2.8,4.6,0x3c5560,false,0,0,.27);
  t.box(13.66,9.85,.8,.28,3.15,7.8,0x333a3a);
  for(let i=0;i<6;i++)t.box(13.86,8.69+i*.45,.8,.16,.13,7.45,0x687171);
  t.box(10.1,11.98,-6.72,8.32,.46,2.2,steel);
  for(const x of [6.2,9.6,14])t.box(x,12.82,-7.65,.18,1.8,.18,paint);
  t.box(10.1,13.72,-7.65,8,.18,.18,paint);
  for(const x of [11.6,13.72])t.strut([x-.9,5.1,-7.45],[x,12,-7.45],.19,.22,steel);
  for(let i=0;i<8;i++)t.box(11.8+i*.12,5.3+i*.86,-7.45,2.25,.18,.56,0xb6aa8e);
  for(const z of [-4.5,4.5])t.box(13.76,11.32,z,.28,.82,1.25,0xffdf9a,true);
  for(let j=0;j<6;j++)t.box(13.9,8.14,-3.1+j*1.28,.19,.53,.58,0xe2c797,false,.48);
  for(const z of [-5.7,5.7])t.box(-13.55,14.91,z,.3,.65,.86,0x9a3026);
  t.finish();metalFinish(truck,A);for(const g of [side,cab,glass,tyre])g.dispose();
}

export function crusherWorks(p,floor,solid,boxes){
  const x=-91,z=127,y=floor(x,z);
  const column=(cx,cz,top)=>{
    const base=floor(cx,cz);
    p.box(cx,base+.9,cz,4.4,2,4.4,0x96928a);
    p.box(cx,(base+top)/2,cz,1.25,top-base,1.25,steel);
  };
  const roof=plate([[-18,0],[2,4.4],[18,1.5],[18,.5],[2,3.4],[-18,-1]],21);
  for(const dx of [-15,15])for(const dz of [-9,9])column(x+dx,z+dz,y+30);
  for(const dz of [-9,9]){
    p.strut([x-15,y+3,z+dz],[x+15,y+23,z+dz],1,1,steel);
    p.strut([x+15,y+3,z+dz],[x-15,y+23,z+dz],1,1,steel);
  }
  p.box(x,y+34,z,33,24,20,0xb68164,'shutter');
  for(const c of [-1,1])p.panel(x,y+35,z+c*10.05,32.6,20,'shutter',0,c<0?Math.PI:0);
  p.add(roof,x,y+46,z,1,1,1,0x6b726c);roof.dispose();
  p.box(x-9,y+45,z-1,12,11,15,0x9a513b);
  p.box(x-9,y+50.7,z-1,14,1,17,0x686e6d);
  p.box(x-9,y+44.7,z-8.65,10,3.3,.42,0x394c53);
  p.box(x,y+23.8,z-11.5,36,.8,3.4,steel);
  for(let dx=-17;dx<=17;dx+=4)p.box(x+dx,y+25.2,z-13.1,.2,2.3,.2,paint);
  p.box(x,y+26.3,z-13.1,36,.23,.23,paint);
  boxes.push(solid(x,y,z,33,48,20));
  // The elevated gallery follows the material from its feed house into the separation tower.
  const start=[-235,floor(-235,58)+13,58],end=[x,y+39,z];
  const dx=end[0]-start[0],dz=end[2]-start[2],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  const at=(f,side,up)=>[start[0]+dx*f+nx*side,start[1]+(end[1]-start[1])*f+up,start[2]+dz*f+nz*side];
  p.strut(start,end,5.3,1.15,dark);
  for(const s of [-3,3]){
    for(const up of [0,4.4])p.strut(at(0,s,up),at(1,s,up),.84,.84,steel);
    for(let i=0;i<14;i++)p.strut(at(i/14,s,i%2?4.4:0),at((i+1)/14,s,i%2?0:4.4),.48,.48,rust);
    for(const f of [.13,.39,.66,.9]){
      const [bx,by,bz]=at(f,s,0);column(bx,bz,by);
    }
  }
  for(let i=0;i<15;i++)p.strut(at(i/14,-3,4.4),at(i/14,3,4.4),.44,.52,steel);
  for(const s of [-1,1]){
    const cx=start[0]+s*7,cz=start[2],cy=floor(cx,cz);
    p.add(drum,cx,cy+12,cz,11,21,11,0xafaa97);
    p.add(drum,cx,cy+22.8,cz,11.9,1.1,11.9,0x774f3e);
    boxes.push(solid(cx,cy,cz,10,23,10));
  }
}

// A parked bucket-wheel stacker on crawler tracks, between the crusher and the settling pond.
export function reclaimer(p,floor,solid,boxes){
  const x=95,z=-74,y=floor(x,z);
  for(const s of [-1,1]){
    p.box(x,y+2,z+s*7,23,3.6,4.4,dark);
    for(const dx of [-9,-6,-3,0,3,6,9])p.add(drum,x+dx,y+2,z+s*9.25,3.1,.57,3.1,0x68716d,false,Math.PI/2);
  }
  p.add(drum,x,y+5.2,z,17,3.1,17,steel);
  p.box(x-3,y+9.8,z,22,8,16,0xb6653d);
  p.box(x-4,y+14,z,23,1.1,17,0x736e63);
  p.panel(x-4,y+10,z-8.09,15,6,'radiator',0,Math.PI);
  p.box(x+6.5,y+16,z-6.2,8.3,6.3,6.6,0xcb8a51);
  p.box(x+6.6,y+16.5,z-9.6,7.45,3.7,.28,0x3a5059);
  boxes.push(solid(x-1,y,z,25,15,19));
  const deck=y+15,mast=y+34;
  for(const s of [-1,1]){
    const edge=z+s*4.1;
    p.strut([x-8,deck,edge],[x+4,mast,edge],1.1,1.2,rust);
    p.strut([x+11,deck,edge],[x+4,mast,edge],.95,1.05,rust);
    p.strut([x-25,deck+5,edge],[x+4,mast,edge],.35,.35,steel);
    p.strut([x+4,mast,edge],[x+53,deck+19,edge],.34,.34,steel);
    for(const lift of [0,3.6])p.strut([x-25,deck+5+lift,edge],[x+61,deck+21+lift,edge],1.02,1,rust);
    for(let i=0;i<12;i++){
      const start=-25+86*i/12,high=5+16*i/12,b=i%2*3.6;
      p.strut([x+start,deck+high+b,edge],[x+start+86/12,deck+high+16/12+(3.6-b),edge],.61,.61,steel);
    }
  }
  p.strut([x-25,deck+5.6,z],[x+61,deck+21.6,z],6.3,1.1,dark);
  p.box(x-22,deck+7,z,10,8.5,11.5,0x657270);
  p.strut([x+4,mast,z-4.1],[x+4,mast,z+4.1],1.3,1.3,steel);
  const cx=x+59,cy=deck+19,cz=z-5.2;
  const rim=new THREE.TorusGeometry(8.2,.66,6,24);
  p.add(rim,cx,cy,cz,1,1,1,0xaa653b);rim.dispose();
  p.add(drum,cx,cy,cz,4.3,6.5,4.3,steel,false,Math.PI/2);
  for(let i=0;i<10;i++){
    const a=i*Math.PI/5,dx=Math.cos(a),dy=Math.sin(a);
    p.strut([cx,cy,cz],[cx+8*dx,cy+8*dy,cz],.64,.74,steel);
    p.box(cx+8.48*dx,cy+8.48*dy,cz,2.2,3.05,4.1,0x685c4e,false,0,0,a+.45);
  }
}
