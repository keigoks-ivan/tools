import * as THREE from 'three';

// District centres in WGS84 / UTM 47N. The street grid is compressed independently of the distant valley.
// Source: Copernicus Sentinel-2 L2A, S2B_47NQD_20200124_1_L2A (TCI), 24 January 2020.
// DEM: Mapzen Terrain Tiles / AWS Open Data, Terrarium z10. North-up samples, 200 m spacing.
const west=787200,north=360400,span=22400;
const centres={
  brickfields:[798329,346234,1040,570],market:[799581,348041,1020,330],merdeka:[799380,348394,980,250],
  kampung:[800188,349956,640,790],bintang:[801227,348178,330,940],titiwangsa:[800818,351662,220,-940],
  klcc:[801402,349440,80,80],
};
const frames={};
for(const [key,[e,n,x,z]] of Object.entries(centres)){
  const [te,tn]=centres.klcc;
  const angle=key==='klcc'?Math.PI:Math.atan2(te-e,tn-n)+Math.atan2(x,z);
  const sn=Math.sin(angle),cs=Math.cos(angle),scale=2.45;
  frames[key]={east:[-cs*scale,sn*scale,e-west],south:[-sn*scale,-cs*scale,north-n],bearing:angle*180/Math.PI,twins:[x,z]};
}
export function valleyFrame(district){return frames[district]||frames.brickfields;}
export async function loadValley(){
  const response=await fetch(new URL('./valley.bin',import.meta.url));
  if(!response.ok)throw Error('吉隆坡高程載入失敗');
  const data=new DataView(await response.arrayBuffer());
  if(data.byteLength!==113*113*2)throw Error('吉隆坡高程格式錯誤');
  const sample=(x,y)=>data.getInt16(2*(y*113+x),true);
  return (x,z,district)=>{
    const f=valleyFrame(district);
    const coord=row=>Math.max(0,Math.min(111.9999,(row[0]*x+row[1]*z+row[2])/200));
    const u=coord(f.east),v=coord(f.south),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
    return Math.max(0,(sample(i,j)*(1-a)+sample(i+1,j)*a)*(1-b)+(sample(i,j+1)*(1-a)+sample(i+1,j+1)*a)*b-32)*.71;
  };
}
export function valleySurface(A){
  const texture=new THREE.TextureLoader(new THREE.LoadingManager()).load(new URL('./klang-valley.webp',import.meta.url).href);
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  const mat=new THREE.MeshStandardMaterial({roughness:.95,map:A.grassD});
  const east={value:new THREE.Vector3()},south={value:new THREE.Vector3()};
  mat.userData.setDistrict=f=>{east.value.fromArray(f.east);south.value.fromArray(f.south);};
  mat.userData.setDistrict(frames.brickfields);
  mat.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{valley:{value:texture},east,south});
    shader.vertexShader='varying vec2 groundXZ;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ngroundXZ=position.xz;');
    shader.fragmentShader='varying vec2 groundXZ;uniform sampler2D valley;uniform vec3 east,south;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      vec3 p=vec3(groundXZ,1.);
      vec2 uv=vec2(dot(p,east),dot(p,south))/${span}.;
      vec3 region=texture2D(valley,vec2(uv.x,1.-uv.y)).rgb;
      float border=smoothstep(.445,.50,max(abs(uv.x-.5),abs(uv.y-.5)));
      vec3 turf=texture2D(map,vMapUv).rgb;
      vec3 canopy=mix(vec3(.036,.080,.049),vec3(.082,.138,.074),turf.g);
      region=mix(region,canopy,max(border,smoothstep(.64,.95,min(region.r,min(region.g,region.b)))));
      float transition=smoothstep(615.,860.,max(abs(groundXZ.x),abs(groundXZ.y)));
      diffuseColor.rgb*=mix(turf*vec3(.77,.86,.66),region*1.32,transition);
    `);
  };
  return mat;
}
