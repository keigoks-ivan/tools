// Standard-lit architectural glazing: actual environment reflections remain
// view-dependent; original procedural room interiors sit behind the panes.
export function configureCityGlazing(material) {
  material.roughness = .19; material.metalness = 0;
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 urbanPaneUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nurbanPaneUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 urbanPaneUv;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 room = urbanPaneUv;
        vec2 insetRoom = (room - .5) * .74 + .5;
        float roomSide = smoothstep(.04,.15,insetRoom.x) * (1. - smoothstep(.85,.96,insetRoom.x));
        float roomCeiling = smoothstep(.67,.91,insetRoom.y);
        float roomFloor = 1. - smoothstep(.12,.34,insetRoom.y);
        vec3 roomColor = mix(vec3(.065,.078,.080), vec3(.28,.25,.19), roomCeiling * .48 + roomFloor * .28);
        roomColor *= .57 + roomSide * .43;
        float interiorShelf = (1. - smoothstep(.015,.033,abs(room.y - .28))) * step(.16,room.x) * step(room.x,.72);
        roomColor = mix(roomColor, vec3(.28,.25,.19), interiorShelf * .55);
        diffuseColor.rgb = mix(diffuseColor.rgb, roomColor, .44);
      `);
  };
  material.customProgramCacheKey = () => 'urban-glazing-1';
}

export function configureCurtainWall(material, variant = 0) {
  material.roughness = .25; material.metalness = 0;
  material.onBeforeCompile = shader => {
    shader.uniforms.urbanFacadeVariant = { value: variant };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 urbanFacadeUv;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nurbanFacadeUv = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 urbanFacadeUv;
      uniform float urbanFacadeVariant;
      float urbanHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)) + urbanFacadeVariant * 17.) * 43758.5453); }
    `).replace('#include <map_fragment>', `#include <map_fragment>
      vec2 grid = urbanFacadeUv * vec2(8.,7.);
      vec2 pane = fract(grid), aa = max(fwidth(grid),vec2(.002));
      float glassMask = smoothstep(.035-aa.x,.035+aa.x,pane.x) * (1.-smoothstep(.965-aa.x,.965+aa.x,pane.x));
      glassMask *= smoothstep(.10-aa.y,.10+aa.y,pane.y) * (1.-smoothstep(.90-aa.y,.90+aa.y,pane.y));
      float roomSeed = urbanHash(floor(grid));
      vec3 glassTone = mix(vec3(.19,.30,.34),vec3(.39,.48,.49),roomSeed);
      glassTone *= .78 + smoothstep(.12,.85,pane.y) * .24;
      float blinds = step(.77,roomSeed) * step(.63,pane.y);
      glassTone = mix(glassTone,vec3(.53,.53,.45),blinds*.56);
      diffuseColor.rgb = mix(vec3(.38,.43,.43),glassTone,glassMask);
    `).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(.67,.16 + roomSeed * .12,glassMask);
    `);
  };
  material.customProgramCacheKey = () => `urban-curtain-wall-1-${variant}`;
}
