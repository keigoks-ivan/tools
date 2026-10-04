import * as THREE from 'three';

// 機甲街景把五種表面合在同一個實例批次；只有烤漆接受車色。
export function instancedCarMaterial(dirtMap = null) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .34, metalness: .08, envMapIntensity: 1.15 });
  material.onBeforeCompile = sh => {
    sh.uniforms.carDirt = { value: dirtMap }; sh.uniforms.carDirtEnabled = { value: dirtMap ? 1 : 0 };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float carPart; varying float vCarPart; varying vec3 vCarWorld;')
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), step(.5, carPart));'))
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 carP = vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          carP = instanceMatrix * carP;
        #endif
        vCarWorld = (modelMatrix * carP).xyz; vCarPart = carPart;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D carDirt; uniform float carDirtEnabled; varying float vCarPart; varying vec3 vCarWorld;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float carPaint = 1.0-step(.5,vCarPart);
        float carDust = smoothstep(.35,.75,texture2D(carDirt,vCarWorld.xz/3.0+vCarWorld.y*.1).g)*carDirtEnabled;
        diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.18,.16,.14),carDust*.12*carPaint);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = .34+carDust*.16;
        if(vCarPart>.5)roughnessFactor=.91;
        if(vCarPart>1.5)roughnessFactor=.29;
        if(vCarPart>2.5)roughnessFactor=.15;
        if(vCarPart>3.5)roughnessFactor=.27;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = .06;
        if(vCarPart>.5)metalnessFactor=0.0;
        if(vCarPart>1.5)metalnessFactor=.72;
        if(vCarPart>2.5)metalnessFactor=0.0;`);
  };
  material.customProgramCacheKey = () => 'japanese-car-surfaces-v1';
  return material;
}
