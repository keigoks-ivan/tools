import * as THREE from 'three';

// 只加強反射，不放大街景反射圖提供的漫射補光。
export function carReflectionShader(fragmentShader, strength) {
  return fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
    #if defined(USE_ENVMAP) && defined(RE_IndirectSpecular)
      radiance *= ${strength};
      #ifdef USE_CLEARCOAT
        clearcoatRadiance *= ${strength};
      #endif
    #endif`);
}

// 機甲街景把五種表面合在同一個實例批次；只有烤漆接受車色。
export function instancedCarMaterial(dirtMap = null, { finishAttribute = false, burned = false } = {}) {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .24, metalness: .24, clearcoat: burned ? 0 : 1, clearcoatRoughness: .07, envMapIntensity: 1.15 });
  material.userData.carSurface = true;
  if (finishAttribute) material.defines.CAR_FINISH_ATTRIBUTE = 1;
  material.onBeforeCompile = sh => {
    sh.uniforms.carDirt = { value: dirtMap }; sh.uniforms.carDirtEnabled = { value: dirtMap ? 1 : 0 };
    sh.uniforms.carFinish = { value: burned ? 0 : 1 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float carPart; varying float vCarPart, vCarFinish; varying vec3 vCarWorld;
      uniform float carFinish;
      #ifdef CAR_FINISH_ATTRIBUTE
        attribute float instanceFinish;
      #endif`)
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), step(.5, carPart));'))
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 carP = vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          carP = instanceMatrix * carP;
        #endif
        vCarWorld = (modelMatrix * carP).xyz; vCarPart = carPart; vCarFinish = carFinish;
        #ifdef CAR_FINISH_ATTRIBUTE
          vCarFinish = instanceFinish;
        #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D carDirt; uniform float carDirtEnabled; varying float vCarPart, vCarFinish; varying vec3 vCarWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float carPaint = 1.0-step(.5,vCarPart);
        float carGlass = step(2.5,vCarPart)*(1.0-step(3.5,vCarPart));
        float carDust = smoothstep(.35,.75,texture2D(carDirt,vCarWorld.xz/3.0+vCarWorld.y*.1).g)*carDirtEnabled;
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.18,.16,.14),carDust*.12*carPaint);
        diffuseColor.rgb *= mix(vec3(1.0),vec3(.20,.235,.25),carGlass);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(.88,.24+carDust*.12,vCarFinish);
        if(vCarPart>.5)roughnessFactor=.91;
        if(vCarPart>1.5)roughnessFactor=.29;
        if(vCarPart>2.5)roughnessFactor=mix(.88,.045,vCarFinish);
        if(vCarPart>3.5)roughnessFactor=mix(.78,.18,vCarFinish);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = mix(.18,.24,vCarFinish);
        if(vCarPart>.5)metalnessFactor=0.0;
        if(vCarPart>1.5)metalnessFactor=.72;
        if(vCarPart>2.5)metalnessFactor=0.0;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        #ifdef USE_CLEARCOAT
          material.clearcoat = (carPaint+carGlass)*vCarFinish*(1.0-carDust*.18*carPaint);
          material.clearcoatRoughness = min(1.0,max(.0525,mix(.07+carDust*.08,.035,carGlass))+geometryRoughness);
        #endif`);
    sh.fragmentShader = carReflectionShader(sh.fragmentShader, '(1.0+(.25*carPaint+.4*carGlass)*vCarFinish)');
  };
  material.customProgramCacheKey = () => `japanese-car-surfaces-v2:${finishAttribute}:${burned}`;
  return material;
}
