import * as THREE from 'three';
// Each row maps local x,z (metres in the mission) to east or north in the source image.
const frames={
  arcade:[[-4,0,-500],[0,4,-1200]],
  river:[[-1.68,-3.64,-4900],[3.64,-1.68,5600]],
  skyline:[[-4,0,4900],[0,4,-3850]],
};
// Mapzen Terrarium z10, NASA SRTM. Signed little-endian metres, south-to-north rows.
// Grid centred at 25.069 N, 121.515 E. 161 samples at 250 m cover a 40 km square.
export async function loadBasin(){
  const response=await fetch(new URL('./basin.bin',import.meta.url));
  if(!response.ok)throw Error('無法載入台北盆地高程');
  const data=new DataView(await response.arrayBuffer());
  if(data.byteLength!==161*161*2)throw Error('台北盆地高程格式錯誤');
  const get=(x,z)=>data.getInt16((z*161+x)*2,true);
  const sample = (x,z,district)=>{
    const [east,north]=frames[district] || frames.arcade;
    const coord=row=>Math.max(0,Math.min(159.999,80+(x*row[0]+z*row[1]+row[2])/250));
    const u=coord(east),v=coord(north),i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
    const elevation=(get(i,j)*(1-a)+get(i+1,j)*a)*(1-b)+(get(i,j+1)*(1-a)+get(i+1,j+1)*a)*b;
    return Math.max(0,elevation-5)*.66;
  };
  // Resolve each reference to the high point of its own summit neighbourhood on this grid.
  const peaks=[[121.553,25.171,'陽明山・七星山'],[121.52139,25.17611,'陽明山・大屯山']].map(([lon,lat,name])=>{
    const ci=Math.round(80+(lon-121.515)*100720/250),cj=Math.round(80+(lat-25.069)*111195/250);
    let hi=-Infinity,east,north;
    for(let j=cj-2;j<=cj+2;j++)for(let i=ci-2;i<=ci+2;i++)if(get(i,j)>hi){hi=get(i,j);east=(i-80)*250;north=(j-80)*250;}
    return {name,east,north};
  });
  sample.peaks=district=>peaks.map(({name,east,north})=>{
    const [e,n]=frames[district],det=e[0]*n[1]-e[1]*n[0];
    const dx=east-e[2],dz=north-n[2];
    const x=(dx*n[1]-dz*e[1])/det,z=(e[0]*dz-n[0]*dx)/det;
    return {name,p:new THREE.Vector3(x,sample(x,z,district)+8,z)};
  });
  return sample;
}

export function basinSurface(A){
  const material=new THREE.MeshStandardMaterial({map:A.grassD,roughness:.97});
  const imagery={value:null},east={value:new THREE.Vector3()},north={value:new THREE.Vector3()};
  material.userData.setBasinView=(district,texture)=>{
    const frame=frames[district];
    east.value.fromArray(frame[0]);north.value.fromArray(frame[1]);imagery.value=texture;
  };
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{crowns:A.forestCanopy,imagery,east,north});
    shader.vertexShader='varying vec3 basinPos; varying vec3 basinNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nbasinPos=position;basinNormal=normal;');
    shader.fragmentShader='uniform sampler2D crowns,imagery;uniform vec3 east,north;varying vec3 basinPos;varying vec3 basinNormal;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      vec2 p=basinPos.xz;
      float grove=texture2D(crowns,p/549.0).g;
      vec2 crownUv=p/146.0 + normalize(basinNormal).xz*.21 + vec2(grove*.24);
      vec3 clumps=texture2D(crowns,crownUv).rgb;
      float canopy=clamp(dot(clumps,vec3(.21,.61,.18))*2.8,.12,1.0);
      vec3 green=mix(vec3(.033,.077,.065),vec3(.12,.185,.112),canopy);
      green*=.72+.54*grove;
      vec3 field=texture2D(map,vMapUv*.39).rgb*.45+texture2D(map,mat2(.73,-.68,.68,.73)*vMapUv*.066).rgb*.55;
      field*=vec3(.57,.77,.59)*(.89+.24*grove);
      vec3 earth=mix(field,green,smoothstep(2.0,48.0,basinPos.y));
      vec3 local=vec3(p,1.0);
      vec2 geoUv=.5+vec2(dot(east,local),dot(north,local))/40000.0;
      float border=max(abs(geoUv.x-.5),abs(geoUv.y-.5));
      float extent=(1.0-smoothstep(.455,.50,border))*smoothstep(540.0,880.0,length(p));
      vec3 landcover=pow(texture2D(imagery,geoUv).rgb,vec3(.75))*1.16;
      earth=mix(earth,landcover*(.86+.26*canopy),extent*.95);
      diffuseColor.rgb*=earth;
    `).replace('#include <fog_fragment>',`#include <fog_fragment>
      float air=(1.0-exp(-max(0.0,length(basinPos-cameraPosition)-320.0)*.00020))*smoothstep(6.0,70.0,basinPos.y);
      gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.40,.53,.60),air*.76);
    `);
  };
  return material;
}
