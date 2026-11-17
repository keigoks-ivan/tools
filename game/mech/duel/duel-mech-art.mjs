import * as THREE from '../../lib/three.module.js';

const model = new URL('./m07-cangyan-v4.glb', import.meta.url);
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
          float grain = 0.0;
          if (armorGrainStrength > 0.0) {
            grain = texture2D(armorGrain, vArmorGrain).r - 0.5;
          }
          float steel = smoothstep(0.09, 0.60, vArmorFinish.y);
          diffuseColor.rgb *= mix(vec3(1.0), armorTint, vArmorTeam) * (1.0 + grain * steel * 0.64);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = clamp(roughnessFactor * vArmorFinish.x - grain * steel * 0.14, 0.13, 1.0);`)
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vArmorFinish.y;');
    }
  };
  material.customProgramCacheKey = () => optics ? 'm07-optics-v4' : 'm07-armor-v4';
}

export function instantiateDuelMechArt(art, slot, surface) {
  const model = art.clone(true);
  const armor = new THREE.MeshStandardMaterial({
    vertexColors:true, roughness:1, metalness:1, envMap:surface.environment, envMapIntensity:1.15,
  });
  const optics = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  applySurface(armor,slot,false,surface);
  applySurface(optics,slot,true,surface);
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const isOptic = mesh.name.endsWith('_optics');
    mesh.material = isOptic ? optics : armor;
    mesh.castShadow = !isOptic;
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
  const width=128, data=new Uint8Array(width*width);
  const random = (x,y) => {
    const n = Math.imul(x+29,0x21f0aaad) ^ Math.imul(y+47,0x735a2d97);
    return (Math.imul(n^(n>>>14),0x9e3779b9)>>>24)/255;
  };
  for(let y=0;y<width;y++) for(let x=0;x<width;x++) {
    data[y*width+x] = 106 + 37*random(x,1) + 15*random(x,y);
  }
  for(let n=0;n<89;n++){
    const x=Math.floor(random(n,2)*width), y=Math.floor(random(n,3)*width), length=4+Math.floor(random(n,4)*30);
    for(let i=0;i<length;i++){
      const pos=((y+i)%width)*width+(x+Math.floor(i*.12))%width;
      const abrasion=Math.sin(Math.PI*(i+1)/(length+1));
      data[pos]=Math.min(242,data[pos]+92*abrasion);
    }
  }
  const texture = new THREE.DataTexture(data,width,width,THREE.RedFormat);
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
