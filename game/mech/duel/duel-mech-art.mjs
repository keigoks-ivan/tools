import * as THREE from '../../lib/three.module.js';

const model = new URL('./m07-cangyan-v8.glb', import.meta.url);
const jointNames = ['M07_Body','M07_Upper','M07_Rifle',
  ...['L','R'].flatMap(side => ['Thigh','Shin','Foot'].map(segment => `M07_${segment}_${side}`))];

export async function loadDuelMechArt() {
  const { GLTFLoader } = await import('../../lib/addons/loaders/GLTFLoader.js');
  const response = await fetch(model, {signal:AbortSignal.timeout(7000)});
  if (!response.ok) throw new Error(`M-07 GLB: HTTP ${response.status}`);
  const {scene} = await new GLTFLoader().parseAsync(await response.arrayBuffer(), model.href);
  if (jointNames.some(name => !scene.getObjectByName(name))) throw new Error('M-07 GLB: missing pivot');
  scene.traverse(mesh => {
    if (!mesh.isMesh) return;
    const {geometry} = mesh;
    const finish = geometry.getAttribute('uv');
    if (!finish || !geometry.getAttribute('color')) throw new Error('M-07 GLB: missing surface data');
    if (!mesh.name.endsWith('_optics') && (!geometry.getAttribute('uv1') || !mesh.material.map || !mesh.material.roughnessMap)) throw new Error('M-07 GLB: missing baked armor maps');
    geometry.setAttribute('armorFinish',finish);
  });
  return scene;
}

function applySurface(material, slot, optics, surface) {
  const tint = new THREE.Vector3(...(slot === 1 ? [1.93,.78,.51] : [1,1,1]));
  const signal = new THREE.Vector3(...(slot === 1 ? [1.0,.34,.09] : [.138,.729,.863]));
  material.onBeforeCompile = shader => {
    shader.uniforms.armorTint = {value:tint};
    shader.uniforms.armorSignal = {value:signal};
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 armorFinish;
        varying vec2 vArmorFinish;
        varying float vArmorTeam;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vArmorTeam = step(0.5, armorFinish.x);
        vArmorFinish = vec2((armorFinish.x - vArmorTeam * 0.5) * 2.0, armorFinish.y);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 armorTint;
      uniform vec3 armorSignal;
      varying vec2 vArmorFinish;
      varying float vArmorTeam;`);
    if (optics) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, armorSignal, vArmorTeam);`);
    } else {
      shader.uniforms.armorGrain = {value:surface.grain};
      shader.uniforms.armorGrainStrength = surface.grainStrength;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vArmorGrain;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 axis = abs(normal);
          vec3 meters = position * 32.0;
          vArmorGrain = (axis.x > axis.y && axis.x > axis.z ? meters.zy :
            axis.y > axis.z ? meters.xz : meters.xy) / 2.6;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D armorGrain;
          uniform float armorGrainStrength;
          varying vec2 vArmorGrain;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 finishGrain = vec3(0.5);
          float grain = 0.0;
          if (armorGrainStrength > 0.0) {
            finishGrain = texture2D(armorGrain, vArmorGrain).rgb;
            grain = finishGrain.r - 0.5;
          }
          float steel = smoothstep(0.09, 0.60, vArmorFinish.y);
          diffuseColor.rgb *= mix(vec3(1.0), armorTint, vArmorTeam) * (1.0 + grain * steel * 0.18);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor + (finishGrain.g - 0.5) * 0.12, 0.13, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          if (armorGrainStrength > 0.0) {
            vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
            vec3 rx = cross(dy, normal), ry = cross(normal, dx);
            float det = dot(dx, rx);
            vec3 slope = dFdx(finishGrain.b) * rx + dFdy(finishGrain.b) * ry;
            normal = normalize(abs(det) * normal - sign(det) * slope * 0.0015);
          }`);
    }
  };
  material.customProgramCacheKey = () => optics ? 'm07-optics-v8' : 'm07-armor-v8';
}

export function instantiateDuelMechArt(art, slot, surface) {
  const model = art.clone(true);
  let source;
  art.traverse(mesh => { if (mesh.isMesh && mesh.material.map) source ??= mesh.material; });
  const armor = new THREE.MeshStandardMaterial({
    map:source.map, roughnessMap:source.roughnessMap, metalnessMap:source.roughnessMap,
    roughness:1, metalness:1, envMap:surface.environment, envMapIntensity:1.15,
  });
  const optics = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  applySurface(armor,slot,false,surface);
  applySurface(optics,slot,true,surface);
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const isOptic = mesh.name.endsWith('_optics');
    mesh.material = isOptic ? optics : armor;
    mesh.castShadow = !isOptic;
    mesh.receiveShadow = !isOptic;
  });
  return model;
}

// A small static reflection source for the armor. The convolution is shared by both pilots.
function createArmorEnvironment(renderer) {
  const w = 128, h = 64, data = new Float32Array(w*h*4);
  const spot = (u,v,x,y,sx,sy) => {
    const dx = Math.min(Math.abs(u-x),1-Math.abs(u-x))/sx;
    return Math.exp(-.5*(dx*dx+((v-y)/sy)**2));
  };
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    const u = x/(w-1), v = y/(h-1);
    const sky = Math.max(0,(v-.46)/.54);
    const horizon = Math.exp(-((v-.47)**2)*92);
    const cool = spot(u,v,.27,.78,.11,.14);
    const sun = spot(u,v,.73,.60,.047,.074);
    const water = spot(u,v,.28,.34,.17,.06);
    data.set([
      .085 + .35*sky + .32*horizon + .47*cool + 2.9*sun + .11*water,
      .097 + .48*sky + .31*horizon + .75*cool + 1.81*sun + .28*water,
      .111 + .61*sky + .29*horizon + .94*cool + 1.08*sun + .32*water,
      1,
    ],(y*w+x)*4);
  }
  const texture = new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  try { return pmrem.fromEquirectangular(texture); }
  finally { pmrem.dispose();texture.dispose(); }
}

function createArmorGrain() {
  // One small static map shared by both robots; RGB carries pigment, roughness
  // and shallow machining marks. Low quality bypasses the texture sampling.
  const width=256, data=new Uint8Array(width*width*4);
  const random=(x,y)=>{
    const n=Math.imul(x+29,0x21f0aaad)^Math.imul(y+47,0x735a2d97);
    return (Math.imul(n^(n>>>14),0x9e3779b9)>>>24)/255;
  };
  const noise=(x,y,span)=>{
    const gx=x/span,gy=y/span,ix=Math.floor(gx),iy=Math.floor(gy);
    let fx=gx-ix,fy=gy-iy;
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
    const a=random(ix,iy)*(1-fx)+random(ix+1,iy)*fx;
    const b=random(ix,iy+1)*(1-fx)+random(ix+1,iy+1)*fx;
    return a*(1-fy)+b*fy;
  };
  for(let y=0;y<width;y++)for(let x=0;x<width;x++){
    const patch=noise(x,y,32)-.5,grain=random(x,y)-.5,brush=random(x,1)-.5;
    data.set([
      Math.round((.50+.32*patch+.10*grain)*255),
      Math.round((.50+.34*patch+.10*brush)*255),
      Math.round((.50+.10*grain+.10*brush)*255),255,
    ],(y*width+x)*4);
  }
  for(let k=0;k<320;k++){
    const x=Math.floor(random(k,13)*255),y=Math.floor(random(k,17)*255);
    const length=2+Math.floor(random(k,21)*37),dark=random(k,41)<.62;
    for(let i=0;i<length;i++){
      const pos=(((y+i)%width)*width+(x+Math.floor(i*.06))%width)*4;
      const fade=Math.sin(Math.PI*(i+1)/(length+1));
      for(const [channel,amount] of [[0,dark?-.24:.22],[1,dark?.21:-.19],[2,-.20]])
        data[pos+channel]=Math.max(0,Math.min(255,data[pos+channel]+Math.round(amount*fade*255)));
    }
  }
  const texture=new THREE.DataTexture(data,width,width,THREE.RGBAFormat);
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}

export function createArmorSurface(renderer) {
  const target=createArmorEnvironment(renderer),grain=createArmorGrain();
  return {
    environment:target.texture,grain,grainStrength:{value:0},
    dispose(){target.dispose();grain.dispose();},
  };
}
