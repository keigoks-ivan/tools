import * as THREE from 'three';

// GSI orthoimagery, seamlessphoto z13 x7275..7278 / y3225..3228, assembled 2026-11-27.
// https://maps.gsi.go.jp/development/ichiran.html#seamlessphoto
// Approximate the geographic position of each compressed district on one shared image.
const origins={
  lock:[7277.545,3225.788],tsukuda:[7276.863,3226.172],toyosu:[7277.067,3226.564],
  rail:[7277.841,3226.788],wakasu:[7277.978,3227.572],aomi:[7276.931,3227.6]
};
let aerial;
export function aerialGround(group,district){
  if(typeof document==='undefined')return;
  if(!aerial){
    aerial=new THREE.TextureLoader().load(new URL('./tokyo-bay-ground.webp',import.meta.url).href);
    aerial.colorSpace=THREE.SRGBColorSpace;aerial.anisotropy=4;
  }
  const [cx,cy]=origins[district],tileMeters=3280;
  const g=new THREE.PlaneGeometry(13000,13000,64,70).rotateX(-Math.PI/2);
  const p=g.attributes.position,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),z=p.getZ(i);
    uv.setXY(i,(cx-7275+x/tileMeters)/4,1-(cy-3225+z/tileMeters)/4);
    p.setY(i,z>116?-2.55:.06);
  }
  const material=new THREE.MeshBasicMaterial({map:aerial,color:0xa3a9ab});
  // Keep the low-resolution aerial image well beyond all walkable surfaces. The stippled
  // boundary fades into the original ground without coplanar layers bleeding through water.
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vAerialGround;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvAerialGround=position.xz;');
    const bank=district==='lock'?169:district==='tsukuda'?390:1450;
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vAerialGround;')
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 q=vAerialGround;
        if(q.y>110. && q.y<${bank.toFixed(1)} && abs(q.x)<2900.)discard;
        float outside=smoothstep(700.,1100.,abs(q.x))+smoothstep(600.,990.,-q.y)+smoothstep(${bank.toFixed(1)},${(bank+220).toFixed(1)},q.y);
        float dither=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));
        if(outside<dither || min(min(vMapUv.x,vMapUv.y),min(1.-vMapUv.x,1.-vMapUv.y))<.001)discard;`);
  };
  material.customProgramCacheKey=()=> 'distant-aerial-'+district;
  const mesh=new THREE.Mesh(g,material);mesh.name='東京湾・空中写真';mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;
  group.add(mesh);
}

// Faraway blocks follow distinct residential and port silhouettes. Their façades share the
// same fibre of windows as nearby structures. At this distance geometry only needs four sides.
export function distantCity({tower,box,beam,ground,rand,district}){
  const urban=district==='lock'||district==='tsukuda',harbor=district==='aomi'||district==='rail';
  const bay=district==='wakasu'||district==='toyosu'||harbor;
  const pale=[0xaab9bb,0xb0bbb9,0x9daeb2,0xc0beb1,0xb1b6ae];
  function skyline(x,z,h,w,d,j){
    tower(x,z,w,d,h,j%3);
    box(x,h+.22,z,w+.1,.48,d+.15,pale[j%5]);
    if(h>45){
      tower(x-w*.07,z,w*.7,d*.78,h*.13,(j+1)%2,h);
      if(j%4===0)beam([x,h*1.13,z],[x,h*1.13+7,z],.52,0x838e8f);
    }
  }
  // The northern urban hinterland runs behind the playable blocks in every district.
  for(let row=0;row<4;row++){
    const z=-740-row*244;
    for(let j=0;j<28;j++){
      const x=-1660+j*121+(rand()-.5)*38;
      const cluster=.5+.5*Math.cos(x/260+row+district.length);
      skyline(x,z+(rand()-.5)*114,10+rand()*(urban?51:28)+(row===2?cluster**4*67:0),27+rand()*43,24+rand()*39,j+row);
    }
  }
  // Blocks extend around both ends of the near grid to avoid abrupt ends at street level.
  for(const side of [-1,1])for(let j=0;j<44;j++){
    const x=side*(825+Math.floor(j/11)*173)+(rand()-.5)*54;
    const z=-656+(j%11)*71+(rand()-.5)*23;
    const h=9+rand()*(urban?37:22)+(j%13===0?29:0);
    skyline(x,z,h,29+rand()*46,28+rand()*28,j);
  }
  if(urban){
    const bank=district==='lock'?170:390;
    for(let row=0;row<3;row++)for(let j=0;j<26;j++){
      const x=-1040+j*85+(rand()-.5)*30,z=bank+110+row*157+(rand()-.5)*67;
      const h=13+rand()*(row===2?42:26)+(district==='tsukuda'&&j%6===2?66:0);
      skyline(x,z,h,22+rand()*29,23+rand()*23,row+j);
    }
  }
  if(district==='toyosu'||district==='rail'){
    // Across the Toyosu inlet the Shibaura/Shinonome skyline is visible from the old dock.
    // Leave the central entrance to the harbour open, with towers on separate fingers of reclaimed land.
    const offsets=district==='toyosu'?[-585,385,973]:[-720,560];
    for(const [n,cx] of offsets.entries()){
      const cz=520+135*(n%2);
      ground(cx,cz,464,127);box(cx,1.01,cz-62,464,2.4,3,0x909b95);
      for(let j=0;j<9;j++){
        const x=cx-192+j*47,z=cz+((j*23)%72)-30;
        const tall=district==='toyosu'&&(j%3===0||j===5);
        skyline(x,z,tall?67+rand()*82:16+rand()*25,23+rand()*17,21+rand()*22,j+n);
      }
    }
  }
  if(bay){
    // Working islands across the bay form a low broken waterline. The southwest line to Fuji stays clear.
    for(const [x,z,w,d] of [[-930,1120,660,156],[-145,1085,860,142],[800,945,750,220],[1490,1150,990,260]]){
      ground(x,z,w,d);
      box(x,.15,z-d/2,w,3.7,3.2,0x8a948d);
      for(let j=0;j<7;j++){
        const xx=x-w*.39+j*(w*.12),zz=z+(rand()-.43)*d*.56;
        skyline(xx,zz,7+rand()*12,36+rand()*33,21+rand()*26,j);
      }
      for(let j=0;j<3;j++){
        const xx=x-w*.28+j*w*.26,zz=z-d*.42;
        for(const s of [-1,1]){
          beam([xx+s*8,2,zz-5],[xx+s*6,26,zz],1.3,0x9f7064);
          beam([xx+s*6,26,zz-9],[xx+s*6,26,zz+23],1.3,0xa78775);
          beam([xx+s*6,26,zz],[xx+s*6,39,zz],1.12,0xb6a49a);
          beam([xx+s*6,39,zz],[xx+s*6,26,zz+19],.46,0xa3968a);
        }
        box(xx,27,zz,14,2.8,5,0xb8b3a7);
      }
    }
  }
}
