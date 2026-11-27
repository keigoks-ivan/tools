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
}
export function dock(root,site,batch){
  const p=batch(root,'潮汐乾塢'),wall=0xb3a899;
  p.box(0,-2,36,184,4,820,0xb8b0a0,'paving');
  for(const side of [-1,1]){
    for(let i=0;i<4;i++)p.box(side*(92+i*3),-1+i,36,4,5+i,820,wall,'ceramic');
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
    }
  }
  freighter(p,site,152,20);freighter(p,site,-151,209);
  for(const [x,z,w] of [[-57,-82,66],[57,-82,66],[-78,100,24],[0,100,44],[78,100,24]]){
    bulkhead(site,p,x,z,w,24,9,wall);
    p.box(x,24.5,z,w+1.4,1,10,safety,'car-deck');
  }
  for(const [x,z] of [[-45,-129],[52,20],[-58,181]]){
    bulkhead(site,p,x,z,20,9,19,0xa99d8e);p.box(x,9.3,z,21,.6,20,steel);
  }
  site.gates=DOCK_GATES.map(({x,z})=>{
    const group=new THREE.Group();root.add(group);group.position.set(x,0,z);
    const leaf=batch(group,'塢門扇');
    leaf.box(0,12,0,44,24,4.2,0x59757a,'car-deck');
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

function mountainBowl(root){
  const v=[],colors=[],ix=[],c=new THREE.Color(),count=144;
  for(let band=0;band<2;band++){
    const start=v.length/3;
    for(let j=0;j<=count;j++){
      const a=2*Math.PI*(j%count)/count;
      const saw=Math.abs(Math.sin(a*7+band+.51*Math.sin(11*a)));
      const crest=128+74*Math.sin(3*a+band)+104*saw+35*Math.cos(19*a+band)+19*Math.sin(46*a);
      for(let k=0;k<5;k++){
        const t=k/4,r=(band?480:910)+(band?290:380)*t+22*Math.sin(17*a+k*.53);
        v.push(Math.sin(a)*r,crest*t**1.3*(band?.7:1.15)-34+Math.sin(23*a)*10*t,Math.cos(a)*r);
        const snowy=(crest*t>130+26*Math.sin(a*21+k)&&k>1);
        c.setHex(snowy?(band?0xd7dde0:0xe2e8e5):band?[0x596b63,0x64776a,0x7a847d,0x89918f,0x939da2][k]:0x939fae);
        c.multiplyScalar(.95+.08*Math.cos(23*a+k));colors.push(c.r,c.g,c.b);
        if(j<count&&k<4){const b=start+j*5+k;ix.push(b,b+1,b+6,b,b+6,b+5);}
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(ix);g.computeVertexNormals();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:true,roughness:.95}));
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
    p.add(shell,x,h,z,2*r,2*r,2*r,0xe4e5e0,false,0,1.08);shell.dispose();
  }
  p.add(cap,x,h,z,1.85*r,1.85*r,1.85*r,0x394954);
  p.add(drum,x,h*.19,z,r*2.03,.9,r*2.03,0x848d91);
  for(let j=0;j<12;j++){
    const a=j*Math.PI/6;
    p.box(x+(r+.2)*Math.sin(a),h*.47,z+(r+.2)*Math.cos(a),r*.23,3,.55,steel,false,0,a);
  }
  const dx=x+r*.66,dz=z-r*.68;
  p.box(dx,4.2,dz,6.2,8.4,4.2,0x566976,false,0,-.72);
  p.box(dx,8.8,dz,8,.7,6.8,cream,false,0,-.72);
}
export function summit(root,site,batch,assets){
  mountainBowl(root);
  const gravel=new THREE.PlaneGeometry(1570,1570);
  gravel.rotateX(-Math.PI/2);
  const uv=gravel.attributes.uv;
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*76,uv.getY(i)*76);
  const apron=new THREE.Mesh(gravel,new THREE.MeshStandardMaterial({map:assets?.rockD||null,normalMap:assets?.rockN||null,normalScale:new THREE.Vector2(.45,.45),color:0xc6c5bb,roughness:.95}));
  apron.position.y=-.08;apron.receiveShadow=true;apron.userData.fieldGeometry=apron.userData.fieldMaterial=true;root.add(apron);
  const p=batch(root,'高山光學觀測站');
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
