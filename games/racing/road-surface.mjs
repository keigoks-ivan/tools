const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function extendMaterial(material, suffix, vertex, fragment, uniforms, map, roughness) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey.call(material);
  material.onBeforeCompile = function(shader, renderer) {
    previous.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${vertex}`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n${suffix}Meters = uv;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${fragment}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n${map}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${roughness}`);
  };
  material.customProgramCacheKey = () => `${key}-${suffix}-metres-v1`;
  material.needsUpdate = true;
}

// Original metre-scale repair and compaction fields supplement the licensed
// aggregate scan. They allocate no textures and retain the scan's normal map.
export function installAsphaltWear(material, { roadWidth = 16, lanesPerDirection = 1, trackLength = 1800, city = false } = {}) {
  const width = clamp(finite(roadWidth, 16), 6, 50), lanes = clamp(Math.round(finite(lanesPerDirection, 1)), 1, 3) * 2;
  const length = Math.max(100, finite(trackLength, 1800)), patchCount = Math.max(3, Math.round(length / 32));
  material.userData.asphaltWear = { width, lanes, laneWidth: width / lanes, length, patchCount, cityCompaction: city };
  extendMaterial(material, 'apexAsphalt', 'varying vec2 apexAsphaltMeters;', `
    varying vec2 apexAsphaltMeters;
    uniform vec4 apexAsphaltScale;
    uniform float apexAsphaltCompaction;
    float apexAsphaltHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float apexAsphaltBox(vec2 p,vec2 halfSize){return max(abs(p.x)-halfSize.x,abs(p.y)-halfSize.y);}
  `, {
    apexAsphaltScale: { value: [width, width / lanes, length, patchCount] },
    apexAsphaltCompaction: { value: city ? 1 : 0 },
  }, `
    vec2 apexRoad = apexAsphaltMeters;
    float apexLane = floor((apexRoad.x + apexAsphaltScale.x * .5) / apexAsphaltScale.y);
    float apexLaneX = apexRoad.x + apexAsphaltScale.x * .5 - (apexLane + .5) * apexAsphaltScale.y;
    float apexPeriod = apexAsphaltScale.z / apexAsphaltScale.w;
    vec2 apexCell = vec2(apexLane,mod(floor(apexRoad.y/apexPeriod),apexAsphaltScale.w));
    float apexSeed = apexAsphaltHash(apexCell);
    vec2 apexRepairCentre = vec2((apexAsphaltHash(apexCell+17.)-.5)*.9,
      apexPeriod*(.22+.53*apexAsphaltHash(apexCell+31.)));
    vec2 apexRepairSize = vec2(.28+.77*apexAsphaltHash(apexCell+7.),.9+2.1*apexAsphaltHash(apexCell+43.));
    vec2 apexRepairPoint = vec2(apexLaneX,mod(apexRoad.y,apexPeriod))-apexRepairCentre;
    apexRepairPoint.x += .025*sin(apexRoad.y*1.7+apexLane*2.);
    float apexRepairEdge = apexAsphaltBox(apexRepairPoint,apexRepairSize)
      +.025*sin(apexRepairPoint.y*4.3+apexSeed*13.)*sin(apexRepairPoint.x*9.7+apexSeed*5.)
      +.009*sin(apexRepairPoint.y*17.+apexRepairPoint.x*19.);
    float apexRepair = (1.-smoothstep(-.035,.035,apexRepairEdge))*step(.70,apexSeed);
    float apexTar = (1.-smoothstep(.015,.065,abs(apexRepairEdge)))*step(.70,apexSeed);
    float apexWave = apexRoad.y/apexAsphaltScale.z*6.28318530718;
    float apexCompactCycles = floor(apexAsphaltScale.z/18.+.5);
    float apexCompacted = smoothstep(.46,.80,.50+.29*sin(apexWave*apexCompactCycles+apexLane*1.31)
      +.21*sin(apexWave*(apexCompactCycles+3.)+apexLane*.7))*apexAsphaltCompaction;
    float apexTyres = (1.-smoothstep(.12,.28,abs(abs(apexLaneX)-.78)))*apexCompacted;
    float apexPacked = (1.-smoothstep(.90,1.27,abs(apexLaneX)))*apexCompacted;
    float apexRepairTint = mix(-.075,.035,apexAsphaltHash(apexCell+59.));
    diffuseColor.rgb *= 1.+apexRepair*apexRepairTint-apexTar*.035-apexTyres*.024-apexPacked*.011;
  `, `
    roughnessFactor = clamp(roughnessFactor*(1.-apexTyres*.025-apexPacked*.009)
      +apexRepair*.055-apexTar*.025,.06,1.);
  `);
  return material;
}

// Small mortar joints are shaded along the ribbon instead of adding thousands
// of curb blocks. Distance filtering prevents flickering subpixel stripes.
export function installCurbJoints(material, trackLength = 1800) {
  const length = Math.max(100, finite(trackLength, 1800)), units = Math.round(length / .914);
  material.userData.curbUnitLength = length / units;
  extendMaterial(material, 'apexCurb', 'varying vec2 apexCurbMeters;', `
    varying vec2 apexCurbMeters;
    uniform float apexCurbUnit;
  `, { apexCurbUnit: { value: length / units } }, `
    float apexJointDistance = abs(mod(apexCurbMeters.y+apexCurbUnit*.5,apexCurbUnit)-apexCurbUnit*.5);
    float apexJointFootprint = max(fwidth(apexCurbMeters.y),.003);
    float apexJoint = (1.-smoothstep(.005,.014+apexJointFootprint,apexJointDistance))
      *(1.-smoothstep(.06,.16,apexJointFootprint));
    diffuseColor.rgb *= 1.-apexJoint*.19;
  `, 'roughnessFactor = min(1.,roughnessFactor+apexJoint*.06);');
  return material;
}
