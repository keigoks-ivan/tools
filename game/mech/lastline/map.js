// 續作獨立港區：實際可通行的海關、冷藏場、修船棚與貨運碼頭。
// 共用掃描材質；靜態結構按材質合併，海面不建立反射攝影機。
import * as THREE from 'three';
import { Builder } from '../zero/kit.js';
import { JAPANESE_FONT, PORT_LABELS } from '../urban.js';

export const SHORE = 680;
export function buildMap(scene, mats, solid, PL, A, world) {
  // 港區地坪共用既有掃描圖；道路、排水與標線在同一個材質內，沒有反射攝影機。
  const ground = mats.floor.clone(), compileFloor = mats.floor.onBeforeCompile;
  ground.name = 'harbor-ground'; ground.userData.tile = mats.floor.userData.tile || 4;
  ground.onBeforeCompile = sh => {
    compileFloor(sh);
    Object.assign(sh.uniforms, { portAsphalt: { value: A.asphD }, portAsphaltN: { value: A.asphN } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vPort;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPort=(modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vPort; uniform sampler2D portAsphalt, portAsphaltN;
      float portLine(float d, float width) { float aa=max(fwidth(d),.001); return 1.0-smoothstep(width-aa,width+aa,d); }
      float portRange(float x, float a, float b) { return smoothstep(a-.3,a+.3,x)*(1.0-smoothstep(b-.3,b+.3,x)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float roadH=portLine(abs(vPort.y+120.0),12.0)*portRange(vPort.x,174.0,612.0);
        float roadV=portLine(abs(vPort.x-360.0),12.0)*portRange(vPort.y,-120.0,120.0);
        float roadExit=portLine(abs(vPort.x-600.0),12.0)*portRange(vPort.y,-580.0,290.0);
        float roadCross=portLine(abs(vPort.y-120.0),12.0)*portRange(vPort.x,348.0,612.0);
        float portRoad=max(max(roadH,roadV),max(roadExit,roadCross));
        vec2 panel=mod(vPort+vec2(2.0,3.0),vec2(6.0,8.0));
        float joint=max(portLine(min(panel.x,6.0-panel.x),.018),portLine(min(panel.y,8.0-panel.y),.018))*(1.0-portRoad);
        vec3 pavement=mix(sampledDiffuseColor.rgb,texture2D(portAsphalt,vPort/7.0).rgb*vec3(.62,.65,.68),portRoad);
        diffuseColor.rgb/=max(sampledDiffuseColor.rgb,vec3(.005));
        diffuseColor.rgb*=pavement*(1.0-joint*.38);
        float tyre=max(roadH*portLine(abs(abs(vPort.y+120.0)-3.2),.55),roadV*portLine(abs(abs(vPort.x-360.0)-3.2),.55));
        tyre=max(tyre,max(roadExit*portLine(abs(abs(vPort.x-600.0)-3.2),.55),roadCross*portLine(abs(abs(vPort.y-120.0)-3.2),.55)));
        diffuseColor.rgb*=1.0-tyre*.16;
        // 岸邊長排水溝與鋼格柵；以實際尺寸繪製，遠處由導數抗鋸齒。
        float drain=portLine(abs(vPort.x-623.0),.22);
        float grate=portLine(abs(mod(vPort.y,.32)-.16),.025);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.032,.034),drain*(1.0-grate*.65));
        float edge=max(roadExit*portLine(abs(abs(vPort.x-600.0)-10.8),.09),roadH*portLine(abs(abs(vPort.y+120.0)-10.8),.09));
        vec2 bay=mod(vPort-vec2(215.0,-66.0),vec2(20.0,26.0));
        float loading=portRange(vPort.x,215.0,525.0)*portRange(vPort.y,-66.0,64.0)*(1.0-portRoad);
        float paint=max(edge,loading*max(portLine(min(bay.x,20.0-bay.x),.07),portLine(min(bay.y,26.0-bay.y),.07)));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.43,.30,.07),paint*.75);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.91,portRoad);
        roughnessFactor=mix(roughnessFactor,.82,paint);`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        mapN=mix(mapN,texture2D(portAsphaltN,vPort/7.0).xyz*2.0-1.0,portRoad);`);
  };
  ground.customProgramCacheKey = () => 'harbor-ground-v1';
  mats = { ...mats, portGround: ground, portGlass: new THREE.MeshStandardMaterial({ color: 0x263c43, roughness: .26, metalness: .18, vertexColors: true }) };
  const b = new Builder(mats, solid);
  const M = { b, lights: [], zones: {}, marks: {}, targets: {}, items: {}, layout: 'harbor-v1' };
  const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
  const metal = [0.54, 0.6, 0.64], paint = [0.3, 0.44, 0.49];
  const box = (mat, x0, x1, y0, y1, z0, z1, o = {}) => b.block(mat, x0, x1, y0, y1, z0, z1, { ground: Math.min(0, y0), ...o });
  // 置中的高幾何不能套用 Builder 的底部原點明暗，否則下半部會出現負值顏色。
  const mesh = (mat, g, x, y, z, ry = 0, o = {}) => b.mesh(mat, g, x, y, z, ry, { shade: () => 1, ...o });
  const beam = (a, c, r = .08, mat = 'metal', tint = metal) => {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...c), d = q.clone().sub(p);
    const g = new THREE.CylinderGeometry(r, r, d.length(), 6);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    mesh(mat, g, ...p.add(q).multiplyScalar(.5).toArray(), 0, { tint }); g.dispose();
  };
  const pipe = (x, y, z, r, h, mat = 'metal', tint = metal) => {
    const g = new THREE.CylinderGeometry(r, r, h, 16);
    mesh(mat, g, x, y + h / 2, z, 0, { tint }); g.dispose();
  };
  function roof(x0, x1, z0, z1, h, rise, segments = 12) {
    const mid = (x0 + x1) / 2, radius = (x1 - x0) / 2;
    for (let j = 0; j < segments; j++) {
      const a = Math.PI * j / segments, c = Math.PI * (j + 1) / segments;
      const xa = mid - radius * Math.cos(a), xb = mid - radius * Math.cos(c);
      const ya = h + rise * Math.sin(a), yb = h + rise * Math.sin(c);
      b.B.corr.quad([xa, ya, z0], [xa, ya, z1], [xb, yb, z1], [xb, yb, z0],
        [Math.sin((a + c) / 2 - Math.PI / 2), Math.sin((a + c) / 2), 0], [1, 1, 1, 1], null, metal);
      b.B.corr.quad([xb, yb - .12, z0], [xb, yb - .12, z1], [xa, ya - .12, z1], [xa, ya - .12, z0],
        [-Math.sin((a + c) / 2 - Math.PI / 2), -Math.sin((a + c) / 2), 0], [.7, .7, .7, .7], null, metal);
      for (const [z, n] of [[z0, -1], [z1, 1]]) {
        const pts = [[xa, h, z], [xb, h, z], [xb, yb, z], [xa, ya, z]];
        if (n < 0) pts.reverse();
        b.B.corr.quad(...pts, [0, 0, n], [1, 1, 1, 1], null, metal);
      }
      for (const z of [z0, z1]) beam([xa, ya - .15, z], [xb, yb - .15, z], .12);
    }
  }
  function shed(x0, x1, z0, z1, h, doors = 'z', rise = 3) {
    const door = 6, midX = (x0 + x1) / 2, midZ = (z0 + z1) / 2;
    if (doors === 'z') {
      if (x0 === 10 && z0 === 52) {
        box('brick', x0, x0 + .45, 0, h, z0, 102);
        box('brick', x0, x0 + .45, 0, h, 107, z1);
        box('brick', x0, x0 + .45, 0, 12.25, 102, 107);
        box('brick', x0, x0 + .45, 14.8, h, 102, 107);
      } else box('brick', x0, x0 + .45, 0, h, z0, z1);
      box('brick', x1 - .45, x1, 0, h, z0, z1);
      for (const z of [z0, z1 - .4]) {
        box('wall', x0, midX - door, 0, h, z, z + .4); box('wall', midX + door, x1, 0, h, z, z + .4);
        box('metal', midX - door, midX + door, 4.8, h, z, z + .4);
      }
    } else {
      box('wall', x0, x1, 0, h, z0, z0 + .4); box('wall', x0, x1, 0, h, z1 - .4, z1);
      for (const x of [x0, x1 - .4]) {
        box('brick', x, x + .4, 0, h, z0, midZ - door); box('brick', x, x + .4, 0, h, midZ + door, z1);
        box('metal', x, x + .4, 4.8, h, midZ - door, midZ + door);
      }
    }
    roof(x0 - .7, x1 + .7, z0 - .6, z1 + .6, h, rise);
    for (let z = z0 + 2; z < z1; z += 6) for (const x of [x0 + .7, x1 - .7]) {
      box('metal', x - .13, x + .13, 0, h, z - .16, z + .16, { tint: metal });
      beam([x, h - .8, z], [x < midX ? x + 3 : x - 3, h - .15, z], .075);
    }
    box('floor', x0, x1, -.2, 0, z0, z1, { solid: false });
    // 挑簷、排水管與混凝土踢腳，尺寸以公尺計。
    for (const x of [x0, x1]) {
      box('concrete', x - .16, x + .16, 0, .55, z0, z1);
      beam([x, h, z0], [x, h, z1], .12, 'rust'); pipe(x, 0, z0 + 1, .08, h, 'rust');
    }
    // 工業高窗、窗框與窗台；玻璃共用一個材質，不用住宅立面貼圖。
    const wy = h * .55, wh = Math.min(2.2, h * .22);
    for (const z of [z0 - .012, z1 + .012]) for (let x = x0 + 3; x < x1 - 4; x += 6) {
      if (doors === 'z' && Math.abs(x + 2 - midX) < door + 1 && wy < 5) continue;
      b.deco('portGlass', x, x + 4, wy, wy + wh, z - .025, z + .025);
      for (const xx of [x, x + 2, x + 4]) b.deco('metal', xx - .05, xx + .05, wy - .07, wy + wh + .07, z - .06, z + .06, { tint: metal });
      for (const y of [wy, wy + wh / 2, wy + wh]) b.deco('metal', x - .07, x + 4.07, y - .05, y + .05, z - .06, z + .06, { tint: metal });
      b.deco('concrete', x - .12, x + 4.12, wy - .12, wy - .04, z - .16, z + .16);
    }
    for (let z = z0 + 4; z < z1 - 4; z += 8) {
      const x = midX, y = h + rise;
      b.deco('portGlass', x - 3, x + 3, y + .015, y + .025, z, z + 2);
      for (const xx of [x - 3, x, x + 3]) b.deco('metal', xx - .06, xx + .06, y + .02, y + .1, z - .1, z + 2.1, { tint: metal });
    }
  }
  function container(x, z, tint, y = 0, length = 12.2) {
    box('corr', x - 1.22, x + 1.22, y, y + 2.6, z - length / 2, z + length / 2, { tint });
    for (const dx of [-1.19, 1.19]) for (const dz of [-length / 2, length / 2])
      box('metal', x + dx - .045, x + dx + .045, y, y + 2.64, z + dz - .08, z + dz + .08, { tint: metal });
    for (const dx of [-.7, .7]) beam([x + dx, y + .2, z + length / 2 + .02], [x + dx, y + 2.4, z + length / 2 + .02], .035);
    box('metal', x - 1.2, x + 1.2, y + 2.55, y + 2.65, z - length / 2, z - length / 2 + .12, { tint: metal });
  }
  function stairs(x0, x1, z0, z1, y0, y1) {
    const n = Math.ceil((y1 - y0) / .18);
    for (let i = 0; i < n; i++) b.deco('metal', x0, x1, y0 + (y1 - y0) * (i + 1) / n - .06,
      y0 + (y1 - y0) * (i + 1) / n, z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n, { tint: metal });
    solid.add({ x0, x1, z0, z1, y0, y1, mat: 'metal', ramp: { axis: 'z', dir: 1 } });
    for (const x of [x0, x1]) {
      beam([x, y0 - .05, z0], [x, y1 - .05, z1], .1);
      beam([x, y0 + 1, z0], [x, y1 + 1, z1], .035);
      for (let i = 0; i <= 4; i++) {
        const y = y0 + (y1 - y0) * i / 4, z = z0 + (z1 - z0) * i / 4;
        beam([x, y, z], [x, y + 1, z], .025);
      }
    }
  }
  function deck(x0, x1, z0, z1, y) {
    box('metal', x0, x1, y - .15, y, z0, z1, { tint: metal });
    for (const x of [x0, x1]) for (const z of [z0, z1]) pipe(x, 0, z, .12, y);
  }
  function prop(name, x, z, y = 0, ry = 0, extra = {}) { return PL.add(name, x, y, z, ry, { solid: true, ...extra }); }
  function item(id, name, x, z, y = 0) { M.items[id] = { h: name ? prop(name, x, z, y, 0, { solid: false, noBreak: true }) : null, p: V(x, z, y) }; }
  function target(id, x, z) {
    const h = prop('portable_generator', x, z);
    M.targets[id] = { h, hp: 80, kind: 'generator' };
  }

  // 港區地面取代住宅道路網；海側地形裁掉，露出同一片海面。
  if (world) {
    world.battlefield = 'harbor'; world.terrainMesh.material.userData.battlefield.value = 6;
    const coast = (x, z) => {
      // 遠方山麓逐步伸向海岸；不能把數公里外的整座山壓在 500 m 內，形成直立切面。
      const start = 180 - 1800 * THREE.MathUtils.smoothstep(Math.abs(z), 650, 2100);
      const t = THREE.MathUtils.clamp((x - start) / (SHORE - start), 0, 1);
      return 1 - t * t * (3 - 2 * t);
    };
    const height = world.height.bind(world);
    world.height = (x, z) => x > SHORE ? -10 : height(x, z) * coast(x, z) * .68;
    for (const mesh of [world.terrainMesh, world.mountainMesh]) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * coast(p.getX(i), p.getZ(i)) * .68);
      p.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    }
    const floor = solid.floorAt.bind(solid);
    solid.floorAt = (x, z, ...args) => { const y = floor(x, z, ...args); return x > SHORE && y === 0 ? -10 : y; };
    const material = world.terrainMesh.material, compile = material.onBeforeCompile;
    material.onBeforeCompile = sh => {
      compile(sh);
      sh.fragmentShader = sh.fragmentShader.replace('vec4 G = battlefield', `if(vTW.x > ${SHORE.toFixed(1)}) discard;\n        vec4 G = battlefield`);
    };
    material.customProgramCacheKey = () => 'lastline-coast-v1'; material.needsUpdate = true;
    scene.fog.color.setRGB(.39, .47, .52); scene.fog.density = .0015;
    world.sun.color.setRGB(1, .94, .84); world.sun.intensity = 3.4;
    world.hemi.color.setRGB(.44, .58, .73); world.hemi.intensity = .36;
    scene.environmentIntensity = .48;
    world.skyDome.material.uniforms.fogCol.value.copy(scene.fog.color);
  }
  b.B.portGround.quad([-250,.025,320], [SHORE,.025,320], [SHORE,.025,-590], [-250,.025,-590], [0,1,0]);
  // 海堤有厚度與潮痕，沒有穿越海面的隱形地板。
  box('concrete', SHORE - 1.2, SHORE, -4, .85, -590, 320, { tint: [.48, .53, .54] });
  const water = new THREE.MeshStandardMaterial({ color: 0x274a59, roughness: .32, metalness: .28,
    normalMap: A.rockN, normalScale: new THREE.Vector2(.22, .22), envMapIntensity: .8 });
  const seaTime = { value: 0 };
  water.onBeforeCompile = sh => {
    sh.uniforms.seaTime = seaTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSea;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea=(modelMatrix*vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSea; uniform float seaTime;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal=normalize(normal+vec3(sin(vSea.x*.23+vSea.z*.13+seaTime*.7)*.10,cos(vSea.z*.29-seaTime*.45)*.08,0.0));');
  };
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5600, 9000).rotateX(-Math.PI / 2), water);
  const uv = sea.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 600, uv.getY(i) * 900);
  sea.onBeforeRender = () => { seaTime.value = performance.now() * .001; };
  sea.position.set(SHORE + 2800, -1, 0); sea.name = 'lastline-sea'; sea.receiveShadow = true; scene.add(sea);

  // 第 1 章：不是住宅後巷，而是貨運鐵道、海關倉庫與通訊室。
  M.marks.start = V(-180, -232); M.marks.ch2 = V(-105, -100); M.marks.ch3 = V(0, 5);
  for (const x of [-228, -226.5]) beam([x, .04, -320], [x, .04, 280], .065, 'rust');
  for (let z = -315; z < 280; z += 1.2) b.deco('rust', -229, -225.5, -.03, .02, z, z + .15);
  for (const z of [-96, -80, 24, 40]) {
    box('metal', -229.8, -224.2, .7, 1.2, z - 6.7, z + 6.7, { tint: metal });
    // 漏斗車傾斜側壁與下部卸料口，有別於貨櫃的平直輪廓。
    for (const x of [-229.7, -224.3]) {
      const inner = x < -227 ? x + 1.1 : x - 1.1, n = x < -227 ? -1 : 1;
      const pts = [[inner, 1.3, z - 6], [x, 4.2, z - 6], [x, 4.2, z + 6], [inner, 1.3, z + 6]];
      if (n < 0) pts.reverse();
      b.B.rust.quad(...pts, [n, -.35, 0], [1, 1, 1, 1], null, [.65, .55, .43]);
      for (let zz = z - 5; zz < z + 6; zz += 2) beam([inner, 1.3, zz], [x, 4.2, zz], .06, 'rust');
    }
    for (const zz of [z - 6, z + 6]) box('rust', -229.7, -224.3, 1.3, 4.2, zz - .12, zz + .12);
    for (const zz of [z - 4.8, z - 3, z + 3, z + 4.8]) for (const x of [-228.8, -225.2]) {
      const g = new THREE.CylinderGeometry(.45, .45, .3, 12).rotateZ(Math.PI / 2);
      mesh('metal', g, x, .45, zz, 0, { tint: [.22, .25, .26] }); g.dispose();
    }
    solid.add({ x0: -229.8, x1: -224.2, z0: z - 6.7, z1: z + 6.7, y0: 0, y1: 4.2, mat: 'metal' });
  }
  shed(-208, -152, -205, -130, 8, 'z', 3);
  shed(-149, -113, -122, -78, 6.2, 'x', 1.8);
  for (const [x, z] of [[-197, -182], [-163, -170], [-195, -149], [-140, -89], [-197, -176], [-197, -170], [-162, -158], [-162, -149]]) {
    // 掃描貨架原始高度 21.4 m，縮成 3 m；箱底對齊四層承板，避免穿屋頂與懸空。
    prop('steel_frame_shelves_01', x, z, 0, 0, { scale: .14 });
    for (const dx of [-.47, 0, .47]) for (const y of [.16, .87, 1.58, 2.29])
      prop('cardboard_box_01', x + dx, z, y, .1 * dx, { solid: false, scale: .92 + ((y * 100 + x) % 3 + 3) % 3 * .06 });
    prop('wooden_military_crate', x + 2, z + 3); prop('hand_truck', x + 3, z - 1);
  }
  for (const z of [-191, -179, -167, -155, -143]) {
    beam([-207,7.7,z],[-153,7.7,z],.11);
    beam([-207,7.7,z],[-180,10.7,z],.07); beam([-180,10.7,z],[-153,7.7,z],.07);
    for (const x of [-194,-166]) {
      beam([x,7.7,z],[x,6.9,z],.018);
      b.deco('metal',x-.65,x+.65,6.79,6.93,z-.11,z+.11,{tint:[.65,.67,.63]});
      b.B.portGlass.quad([x-.6,6.78,z-.08],[x+.6,6.78,z-.08],[x+.6,6.78,z+.08],[x-.6,6.78,z+.08],[0,-1,0],[1,1,1,1],null,[1.8,1.9,1.7]);
    }
  }
  prop('concrete_road_barrier_02', -177, -216); prop('covered_car', -158, -225, 0, .2);
  for (const [x, z] of [[-203, -192], [-156, -182], [-204, -143], [-90, -122], [-46, -92], [65, 56]]) {
    prop('barrel_03', x, z); prop('Barrel_01', x + 1.2, z + .2); prop('old_tyre', x + .4, z + 1.6, 0, .3);
  }
  prop('metal_office_desk', -133, -108); prop('utility_box_02', -143, -117, 0, 0, { noBreak: true });
  item('radio', 'metal_jerrycan_green', -135, -106, .8); item('codes', 'cardboard_box_01', -130, -106, .8); item('smap', 'cardboard_box_01', -125, -106, .8);
  // 第 2 章：冷藏貨運站的鋼屋架、儲槽與低掩體。
  shed(-95, -40, -128, -80, 8, 'x', 4);
  for (const x of [-90, -75, -55]) { prop('plastic_crate_02', x, -117); prop('steel_frame_shelves_01', x, -88); }
  for (const [x, z, c] of [[-95, -50, [.55, .38, .3]], [-60, -52, paint], [-20, -74, [.63, .58, .4]], [30, -85, paint]]) container(x, z, c);
  for (const [x, z] of [[-78, -64], [-42, -59], [-8, -63], [22, -58], [0, 24], [29, 35]]) prop('concrete_road_barrier_02', x, z, 0, Math.PI / 2);
  target('jam1', -71, -71); target('jam2', -38, -71); target('jam3', -4, -71);
  shed(10, 36, -51, -23, 5.2, 'z', 1.4);
  prop('metal_office_desk', 25, -31); item('rec_a', 'cardboard_box_01', 20, -31, .8);
  item('rec_b', 'cardboard_box_01', 25, -31, .8); item('rec_c', 'cardboard_box_01', 30, -31, .8);
  M.marks.key = V(25, -37, .8);
  M.keyMesh = new THREE.Mesh(new THREE.BoxGeometry(.22, .04, .12), new THREE.MeshStandardMaterial({ color: 0x82cad3, roughness: .28, metalness: .7 }));
  M.keyMesh.position.copy(M.marks.key); scene.add(M.keyMesh);
  // 第 3 章：修船棚的圓拱輪廓與機體維修架，樓梯可從地面一路走到胸前。
  shed(10, 70, 52, 112, 24, 'z', 7);
  box('brick', 70, 120, 0, 11, 76, 112); roof(70, 120, 76, 112, 11, 4);
  M.marks.mech = V(40, 103); M.marks.hatch = V(40, 99.8, 12.4);
  M.marks.mechPath = [V(134, -45), V(134, 40), V(134, 130)];
  stairs(2, 6, 60, 74, 0, 7); deck(2, 6, 74, 90, 7); stairs(2, 6, 90, 102, 7, 12.4);
  deck(2, 32, 102, 107, 12.4); deck(30, 34, 98, 107, 12.4); deck(32, 43, 98, 101.5, 12.4);
  for (const x of [2, 6]) beam([x, 8, 74], [x, 8, 90], .035);
  beam([2, 13.4, 107], [32, 13.4, 107], .035);
  prop('tool_cart', 20, 86); prop('steel_frame_shelves_01', 60, 98); prop('propane_tank', 57, 58);
  item('fuse', 'old_military_crate', 19, 40); item('panel1', null, 18, 62); item('panel2', null, 62, 62);
  prop('utility_box_02', 18, 61, 0, 0, { noBreak: true }); prop('utility_box_02', 62, 61, 0, 0, { noBreak: true });
  target('tow1', 58, 90); target('tow2', 23, 91);
  for (const z of [57, 70, 84, 98]) {
    beam([11, 22, z], [69, 22, z], .17); beam([11, 23.5, z], [69, 23.5, z], .14);
    for (let x = 11; x < 68; x += 6) beam([x, 22, z], [x + 6, 23.5, z], .075);
  }
  // 導向線和機位邊框直接併入幾何，不新增貼圖。
  for (const x of [28, 52]) b.deco('metal', x, x + .1, .03, .035, 72, 108, { tint: [.9, .64, .15] });
  for (const [x, z] of [[-180, -163], [-130, -99], [-70, -100], [40, 75], [40, 95]])
    M.lights.push({ p: V(x, z, x === 40 ? 20 : 5), c: 0xc6dce3, i: x === 40 ? 300 : 45, d: x === 40 ? 38 : 13 });

  // 後兩章的尺度重新設計：貨櫃堆場、散裝筒倉、門式起重機、海船與出口。
  shed(214, 325, -267, -175, 18, 'x', 8); shed(407, 534, -275, -180, 16, 'x', 5);
  for (const x of [155, 183, 211]) {
    pipe(x, 0, 195, 10, 31, 'metal', [.68, .7, .66]);
    const g = new THREE.ConeGeometry(10, 6, 16); mesh('metal', g, x, 34, 195, 0, { tint: [.64, .66, .61] }); g.dispose();
    for (const y of [2, 8, 16, 24, 30]) {
      const ring = new THREE.TorusGeometry(10.07, .08, 4, 16).rotateX(Math.PI / 2);
      mesh('rust', ring, x, y, 195, 0); ring.dispose();
    }
    beam([x, 30, 195], [x, 30, 236], .45);
    solid.add({ x0: x - 10, x1: x + 10, y0: 0, y1: 37, z0: 185, z1: 205, mat: 'metal' });
  }
  const colors = [paint, [.53, .28, .22], [.52, .53, .43], [.27, .35, .44]];
  for (const x0 of [230, 420]) for (let row = 0; row < 5; row++) for (let col = 0; col < 18; col++) {
    const x = x0 + col * 5, z = -53 + row * 26;
    for (let level = 0; level < 1 + (row + col) % 3; level++) container(x, z, colors[(row + col) % colors.length], level * 2.6);
  }
  for (const z of [-210, -60, 15, 75, 175]) for (let j = 0; j < 4; j++) {
    container(555 + j * 5, z, colors[j], 0); if (j % 2) container(555 + j * 5, z, colors[j], 2.6);
  }
  // 港務辦公樓：磚構、逐層玻璃與屋頂水箱，不用住宅樓體輪廓。
  box('brick', 500, 546, 0, 20, 240, 278);
  for (const z of [239.95, 278.05]) for (const y of [3, 7.5, 12, 16.5]) for (let x = 503; x < 542; x += 6) {
    b.deco('portGlass', x, x + 3.4, y, y + 2.1, z - .025, z + .025);
    for (const xx of [x, x + 1.7, x + 3.4]) b.deco('metal', xx - .035, xx + .035, y - .05, y + 2.15, z - .06, z + .06);
    b.deco('concrete', x - .15, x + 3.55, y - .18, y - .06, z - .2, z + .2);
  }
  for (const y of [4.5, 9, 13.5, 20]) b.deco('concrete', 499.8, 546.2, y, y + .18, 239.8, 278.2, { skip: 'py ny', tint: [.72, .73, .7] });
  box('concrete', 499.5, 546.5, 20, 20.3, 239.5, 278.5); pipe(519, 20.3, 262, 3, 4, 'metal');
  roof(498.5, 547.5, 238.5, 243, 22, 1.2);
  // 補修路面、行車磨耗與裝卸泊位線直接合併進既有材質。
  for (let i = 0; i < 58; i++) {
    const x = -220 + ((i * 137) % 860), z = -560 + ((i * 233) % 820);
    b.deco('floor', x, x + 2 + i % 7, .031, .034, z, z + 1 + i % 4, { tint: [.65, .68, .69] });
  }
  for (const z of [-148, -92, 96, 144]) for (let x = 180; x < 580; x += 35) {
    b.deco('floor', x, x + 22, .033, .036, z, z + .12, { tint: [.71, .58, .32] });
    b.deco('floor', x, x + .12, .033, .036, z, z + 8, { tint: [.71, .58, .32] });
  }
  for (const z of [-240, -60, 210]) {
    // 兩腿落在道路外側，橫樑與斜拉桁架跨過岸邊。
    for (const x of [637, 672]) for (const dz of [-12, 12]) {
      beam([x, 0, z + dz], [x + 4, 52, z + dz], .65, 'metal', paint);
      beam([x, 2, z + dz], [x + 4, 24, z - dz], .28, 'metal', paint);
      box('metal', x - 2, x + 3, 0, 2, z + dz - 4, z + dz + 4, { tint: paint });
      solid.add({ x0: x - 1, x1: x + 5, z0: z + dz - 1, z1: z + dz + 1, y0: 0, y1: 52, mat: 'metal' });
    }
    for (const dz of [-3.5, 3.5]) {
      box('metal', 637, 781, 51.2, 52.8, z + dz - .6, z + dz + .6, { tint: paint, solid: false });
      beam([637, 54, z + dz], [781, 54, z + dz], .05);
      for (let x = 637; x < 781; x += 9) beam([x, 52.8, z + dz], [x, 54, z + dz], .045);
    }
    for (let x = 637; x < 781; x += 9) beam([x, 51.8, z - 3.5], [x + 9, 51.8, z + 3.5], .11, 'metal', paint);
    box('metal', 713, 719, 50, 51.2, z - 4.8, z + 4.8, { tint: metal, solid: false });
    beam([637, 62, z], [748, 54, z], .26, 'metal', paint);
    for (let x = 640; x < 780; x += 12) beam([x, 51, z], [x + 12, 54, z], .14, 'metal', paint);
    for (const dz of [-8, 8]) beam([715, 52, z + dz], [715, 5, z + dz], .035, 'rust');
    box('metal', 636, 679, 49, 51, z - 3, z + 3, { tint: paint });
    box('corr', 645, 651, 44, 49, z + 2, z + 7, { tint: [.62, .68, .68] });
    b.deco('portGlass', 645.3, 650.7, 46, 48.6, z + 7.01, z + 7.03);
    for (const x of [638, 639]) beam([x, 2, z - 12], [x, 49, z - 12], .04);
    for (let y = 2; y < 49; y += .6) beam([638, y, z - 12], [639, y, z - 12], .025);
  }
  // 船體以輪廓拉伸，有收尖船首、船舷和多層艦橋，避免另一個巨大方盒。
  const hull = new THREE.Shape(); hull.moveTo(-16, -65); hull.lineTo(16, -65); hull.lineTo(16, 38); hull.quadraticCurveTo(15, 60, 0, 73); hull.quadraticCurveTo(-15, 60, -16, 38); hull.closePath();
  const hullG = new THREE.ExtrudeGeometry(hull, { depth: 9, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 1, bevelThickness: 1, curveSegments: 8 }).rotateX(-Math.PI / 2);
  mesh('rust', hullG, 735, -4, 45, 0, { tint: [.37, .3, .27], solid: true }); hullG.dispose();
  box('metal', 722, 748, 5, 5.4, -13, 80, { tint: metal, solid: false });
  for (let level = 0; level < 3; level++) box('wall', 722 + level, 748 - level, 5 + level * 4, 9 + level * 4, -17 + level, 6 - level, { tint: [.73, .78, .77], solid: false });
  for (let i = 0; i < 5; i++) container(728 + (i % 2) * 7, 30 + Math.floor(i / 2) * 16, colors[i % 4], 5.5);
  beam([734, 17, -10], [734, 33, -10], .14); beam([724, 28, -10], [745, 28, -10], .07);
  for (const x of [723, 747]) for (let z = 8; z < 88; z += 5) {
    beam([x, 5.5, z], [x, 6.6, z], .035);
    beam([x, 6.6, z], [x, 6.6, z + 5], .035);
  }
  for (const z of [-17.05, 6.05]) for (let x = 724; x < 746; x += 3) b.deco('portGlass', x, x + 2.2, 14.4, 16.2, z - .02, z + .02);
  for (const x of [724.95, 745.05]) for (const z of [-11, -6, -1]) b.deco('portGlass', x - .02, x + .02, 14.4, 16.2, z, z + 3);
  pipe(735, 17, -6, 1.8, 7, 'rust', [.42, .37, .32]); pipe(728, 5.5, 93, .45, 5, 'metal');
  for (const z of [-50, 15, 80]) {
    // 錨樁、纜繩與船舷護胎均是合併低面數幾何。
    pipe(677, 0, z, .3, 1, 'rust'); beam([677, .5, z], [719, 4.6, z + 7], .04, 'rust');
    const g = new THREE.TorusGeometry(.8, .22, 5, 12).rotateY(Math.PI / 2);
    mesh('metal', g, 717.6, 2, z + 4, 0, { tint: [.18, .19, .2] }); g.dispose();
  }

  // 疏散路保留寬度給兩輛車；標線、岸邊護柱與防波堤消波塊都是共用材質。
  for (let x = 190; x < 585; x += 14) b.deco('floor', x, x + 7, .03, .035, -120.06, -119.94, { tint: [.7, .72, .65] });
  for (let z = -570; z < 280; z += 14) b.deco('floor', 599.94, 600.06, .03, .035, z, z + 7, { tint: [.7, .72, .65] });
  for (let z = -570; z < 280; z += 18) {
    pipe(676, 0, z, .3, .8, 'rust');
    const g = new THREE.CylinderGeometry(.6, 1.3, 5, 5).rotateZ(.8);
    mesh('concrete', g, 684, -1.2, z, 0, { tint: [.64, .67, .66] });
    g.rotateX(Math.PI / 2); mesh('concrete', g, 684, -1.2, z, 0, { tint: [.62, .65, .64] }); g.dispose();
  }
  for (const [x, z] of [[560, -340], [640, -320], [540, -130], [558, 132], [555, -420]]) {
    const g = new THREE.CylinderGeometry(1, 1.8, 3.4, 6); mesh('concrete', g, x, 1.7, z, 0, { tint: [.68, .66, .6] }); g.dispose();
    solid.add({ x0: x - 1.8, x1: x + 1.8, y0: 0, y1: 3.4, z0: z - 1.8, z1: z + 1.8, mat: 'concrete' });
  }
  for (const z of [-360, -335, -295]) for (const x of [550, 650]) {
    box('concrete', x - 4, x + 4, 0, 2.4, z - 1.2, z + 1.2, { tint: [.63, .65, .6] });
    beam([x - 2, 0, z - 1], [x + 2, 3, z + 1], .23, 'rust'); beam([x + 2, 0, z - 1], [x - 2, 3, z + 1], .23, 'rust');
  }
  pipe(650, 0, -510, 3.5, 25, 'wall', [.75, .77, .7]); pipe(650, 25, -510, 4, 2, 'metal');
  for (const x of [646.5, 653.5]) beam([x, 27, -510], [x, 30, -510], .15);
  box('portGlass', 646.5, 653.5, 27, 30, -513.5, -506.5, { solid: false });
  const cap = new THREE.ConeGeometry(5, 3, 16); mesh('metal', cap, 650, 31.5, -510, 0, { tint: [.46, .4, .32] }); cap.dispose();
  // 一張 512×256 指示牌共用到三處；遠景仍能辨識港口而非住宅城。
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    const cx = cv.getContext('2d'); cx.fillStyle = '#233a40'; cx.fillRect(0, 0, 512, 256);
    cx.strokeStyle = '#97aeb0'; cx.lineWidth = 6; cx.strokeRect(8, 8, 496, 240);
    const draw = () => {
      cx.fillStyle = '#233a40'; cx.fillRect(0, 0, 512, 256); cx.strokeStyle = '#97aeb0'; cx.lineWidth = 6; cx.strokeRect(8, 8, 496, 240);
      cx.textAlign = 'center'; cx.fillStyle = '#dfdfc8'; cx.font = 'bold 48px ' + JAPANESE_FONT; cx.fillText(PORT_LABELS[0], 256, 90);
      cx.font = '32px ' + JAPANESE_FONT; cx.fillText(PORT_LABELS[1], 256, 155);
      cx.font = '24px ' + JAPANESE_FONT; cx.fillText(PORT_LABELS[2], 256, 212);
    }; draw();
    const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
    document.fonts?.load('bold 48px "Noto Sans JP"', PORT_LABELS.join('')).then(() => { draw(); texture.needsUpdate = true; }).catch(() => {});
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: .8 });
    const g = new THREE.PlaneGeometry(10, 5);
    for (const [x, y, z, ry] of [[-180, 6.8, -205.45, Math.PI], [190, 7, -142, 0], [600, 9, -406, 0]]) {
      const sign = new THREE.Mesh(g, mat); sign.position.set(x, y, z); sign.rotation.y = ry; scene.add(sign);
    }
  }
  const meshes = b.build(scene); M.meshes = meshes;
  M.triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3, 0);
  scene.userData.lastlineLayout = M.layout;
  return M;
}
