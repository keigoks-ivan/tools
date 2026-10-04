// 續作獨立港區：實際可通行的海關、冷藏場、修船棚與貨運碼頭。
// 共用掃描材質；靜態結構按材質合併，海面不建立反射攝影機。
import * as THREE from 'three';
import { Builder } from '../zero/kit.js';
import { car, carMaterials } from '../zero/props.js';
import { JAPANESE_FONT, PORT_LABELS, civicMaterial, shopMaterial, harborWater, streetGlassMaterial } from '../urban.js';
import { japaneseBuilder } from '../japan.js';
import { kobeStreetDetails, kobeBlockStreets } from '../kobe-street.mjs';
import { buildAutumnTrees } from '../kobe-autumn.js';
import { KOBE_RELIEF, kobeCityHeight } from '../kobe-relief.mjs';
import { kobeHarborScenery, harborWindow } from '../kobe-harbor.mjs';
import { ENCOUNTERS } from './script.js';
import { kitanoBuilder, kitanoSignMaterial, kitanoSignUV } from '../kobe-kitano.js';
import { kitanoGardenMaterial } from '../kobe-garden.mjs';
import { kitanoHeritageMaterial } from '../kobe-heritage.mjs';

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
        float roadV=portLine(abs(vPort.x-360.0),12.0)*portRange(vPort.y,-372.0,120.0);
        float roadNorth=portLine(abs(vPort.y+360.0),12.0)*portRange(vPort.x,348.0,612.0);
        float roadExit=portLine(abs(vPort.x-600.0),12.0)*portRange(vPort.y,-580.0,290.0);
        float roadCross=portLine(abs(vPort.y-120.0),12.0)*portRange(vPort.x,348.0,612.0);
        float roadOld=portLine(abs(vPort.y+240.0),6.0)*portRange(vPort.x,-234.0,-144.0);
        float portRoad=max(roadOld,max(roadNorth,max(max(roadH,roadV),max(roadExit,roadCross))));
        vec2 panel=mod(vPort+vec2(2.0,3.0),vec2(6.0,8.0));
        float joint=max(portLine(min(panel.x,6.0-panel.x),.018),portLine(min(panel.y,8.0-panel.y),.018))*(1.0-portRoad);
        vec3 asphalt=mix(texture2D(portAsphalt,vPort/2.8).rgb*.62,vec3(.075,.078,.079),.28);
        vec3 pavement=mix(sampledDiffuseColor.rgb,asphalt,portRoad);
        float oldWalk=portRange(vPort.x,-234.0,-144.0)*portRange(abs(vPort.y+240.0),6.0,8.2);
        float customsApron=portRange(vPort.x,-218.0,-146.0)*portRange(vPort.y,-234.0,-205.5)*(1.0-portRoad);
        float warehouseWalk=portRange(vPort.x,-218.0,-146.0)*portRange(vPort.y,-234.0,-229.5);
        float promenade=portRange(vPort.x,514.0,678.0)*portRange(vPort.y,314.0,477.0);
        float footPaving=max(oldWalk,max(warehouseWalk,promenade));
        vec2 paver=vec2(vPort.x+mod(floor(vPort.y/.3),2.0)*.3,vPort.y),cell=mod(paver,vec2(.6,.3));
        float seam=max(portLine(min(cell.x,.6-cell.x),.004),portLine(min(cell.y,.3-cell.y),.004));
        float stoneTone=fract(sin(dot(floor(paver/vec2(.6,.3)),vec2(127.1,311.7)))*43758.5453);
        vec3 stone=vec3(.24,.235,.21)*(.86+stoneTone*.23)*(1.0-seam*.23);
        stone*=mix(1.0,.62,warehouseWalk);
        pavement=mix(pavement,sampledDiffuseColor.rgb*.27,customsApron);
        pavement=mix(pavement,stone,footPaving);joint*=1.0-footPaving;
        diffuseColor.rgb/=max(sampledDiffuseColor.rgb,vec3(.005));
        float replacedSurface=max(customsApron,max(portRoad,footPaving));
        diffuseColor.rgb/=mix(vec3(1.0),max(diffuse,vec3(.01)),replacedSurface);
        diffuseColor.rgb*=pavement*(1.0-joint*.38);
        float tyre=max(roadH*portLine(abs(abs(vPort.y+120.0)-3.2),.55),roadV*portLine(abs(abs(vPort.x-360.0)-3.2),.55));
        tyre=max(tyre,max(roadExit*portLine(abs(abs(vPort.x-600.0)-3.2),.55),roadCross*portLine(abs(abs(vPort.y-120.0)-3.2),.55)));
        diffuseColor.rgb*=1.0-tyre*.16;
        // 岸邊長排水溝與鋼格柵；以實際尺寸繪製，遠處由導數抗鋸齒。
        float drain=portLine(abs(vPort.x-623.0),.22);
        float grate=portLine(abs(mod(vPort.y,.32)-.16),.025);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.025,.032,.034),drain*(1.0-grate*.65));
        float edge=max(roadOld*portLine(abs(abs(vPort.y+240.0)-5.45),.06),max(roadExit*portLine(abs(abs(vPort.x-600.0)-10.8),.09),roadH*portLine(abs(abs(vPort.y+120.0)-10.8),.09)));
        vec2 bay=mod(vPort-vec2(215.0,-66.0),vec2(20.0,26.0));
        float loading=portRange(vPort.x,215.0,525.0)*portRange(vPort.y,-66.0,64.0)*(1.0-portRoad);
        float paint=max(edge,loading*max(portLine(min(bay.x,20.0-bay.x),.07),portLine(min(bay.y,26.0-bay.y),.07)));
        diffuseColor.rgb=mix(diffuseColor.rgb,mix(vec3(.43,.30,.07),vec3(.51,.52,.47),roadOld),paint*.75);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor=mix(roughnessFactor,.91,portRoad);
        roughnessFactor=mix(roughnessFactor,.83,footPaving);
        roughnessFactor=mix(roughnessFactor,.82,paint);`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        mapN=mix(mapN,(texture2D(portAsphaltN,vPort/2.8).xyz*2.0-1.0)*vec3(.2,.2,1.0),portRoad);mapN.xy*=mix(1.0,.14,footPaving);`);
  };
  ground.customProgramCacheKey = () => 'harbor-ground-v4';
  mats = { ...mats, portGround: ground, portGlass: streetGlassMaterial() };
  // 貨櫃、起重機與屋面是塗裝鋼材：漆面使用非金屬反射，保留原掃描與風化。
  for (const key of ['metal', 'corr', 'rust']) {
    const original = mats[key], painted = original.clone();
    painted.onBeforeCompile = original.onBeforeCompile;
    painted.metalnessMap = null; painted.metalness = key === 'rust' ? .18 : .08;
    painted.color.set(0xe1e2df); mats[key] = painted;
  }
  mats.civic = civicMaterial();
  mats.sign = shopMaterial();
  mats.landmarkPaint = new THREE.MeshStandardMaterial({ color: 0xffffff, normalMap: mats.concrete.normalMap, normalScale: new THREE.Vector2(.12, .12), roughness: .78, metalness: 0, vertexColors: true });
  mats.landmarkPaint.userData.tile = 2;
  mats.kitanoSigns=kitanoSignMaterial();
  mats.kitanoGarden=kitanoGardenMaterial();
  mats.kitanoHeritage=kitanoHeritageMaterial();
  const b = new Builder(mats, solid);
  const portMat=col=>col[4]===8?'portGround':col[4]===7?'brick':col[4]===4?'portGlass':col[4]===1?'concrete':col[4]===3?'corr':col[4]===5?'rust':col[4]===2?'metal':'landmarkPaint';
  const portArt={face:(a,c,d,e,col)=>{
    const n=new THREE.Vector3().subVectors(new THREE.Vector3(...c),new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d),new THREE.Vector3(...a))).normalize().toArray();
    b.B[portMat(col)].quad(a,c,d,e,n,[1,1,1,1],null,col.slice(0,3));
  }};
  const M = { b, lights: [], zones: {}, marks: {}, targets: {}, items: {}, operationProps: {}, cars: [], layout: 'harbor-v1' };
  const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
  const metal = [0.54, 0.6, 0.64], paint = [0.3, 0.44, 0.49];
  const box = (mat, x0, x1, y0, y1, z0, z1, o = {}) => b.block(mat, x0, x1, y0, y1, z0, z1, { ground: Math.min(0, y0), skip: y0 <= .05 ? 'ny' : '', ...o });
  // 置中的高幾何不能套用 Builder 的底部原點明暗，否則下半部會出現負值顏色。
  const mesh = (mat, g, x, y, z, ry = 0, o = {}) => b.mesh(mat, g, x, y, z, ry, { shade: () => 1, ...o });
  const beam = (a, c, r = .08, mat = 'metal', tint = metal) => {
    const p = new THREE.Vector3(...a), q = new THREE.Vector3(...c), d = q.clone().sub(p);
    const g = new THREE.CylinderGeometry(r, r, d.length(), r <= .07 ? 4 : 6, 1, true);
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
  function shed(x0, x1, z0, z1, h, doors = 'z', rise = 3, masonry = false) {
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
        box(masonry ? 'brick' : 'wall', x0, midX - door, 0, h, z, z + .4); box(masonry ? 'brick' : 'wall', midX + door, x1, 0, h, z, z + .4);
        box('metal', midX - door, midX + door, Math.min(4.8,h-.4), h, z, z + .4);
      }
    } else {
      box('wall', x0, x1, 0, h, z0, z0 + .4); box('wall', x0, x1, 0, h, z1 - .4, z1);
      for (const x of [x0, x1 - .4]) {
        box('brick', x, x + .4, 0, h, z0, midZ - door); box('brick', x, x + .4, 0, h, midZ + door, z1);
        box('metal', x, x + .4, Math.min(4.8,h-.4), h, midZ - door, midZ + door);
      }
    }
    if (masonry) {
      // 神戶港舊倉庫的紅磚山牆、深色雙坡屋面與磚造扶壁；門口仍沿用原貨運通道。
      for(const [a,c,ya,yc] of [[x0-.7,midX,h,h+rise],[midX,x1+.7,h+rise,h]]) {
        const n=new THREE.Vector3(ya-yc,c-a,0).normalize().toArray();
        b.B.corr.quad([a,ya,z0-.6],[a,ya,z1+.6],[c,yc,z1+.6],[c,yc,z0-.6],n,[1,1,1,1],null,[.28,.31,.32]);
        b.B.corr.quad([c,yc-.12,z0-.6],[c,yc-.12,z1+.6],[a,ya-.12,z1+.6],[a,ya-.12,z0-.6],n.map(v=>-v),[1,1,1,1],null,[.28,.31,.32]);
      }
      for(const [z,n] of [[z0,-1],[z1,1]]) {
        const p=[[x0,h,z],[x1,h,z],[midX,h+rise,z],[midX,h+rise,z]];if(n<0)p.reverse();
        b.B.brick.quad(...p,[0,0,n],[1,1,1,1]);
        for(let x=x0+2;x<x1;x+=6)if(Math.abs(x-midX)>door+.3) {
          box('brick',x-.18,x+.18,0,h,z-.18,z+.18,{solid:false});
          box('concrete',x-.22,x+.22,h-.22,h,z-.24,z+.24,{solid:false});
        }
      }
    } else roof(x0 - .7, x1 + .7, z0 - .6, z1 + .6, h, rise);
    for (let z = z0 + 2; z < z1; z += 6) for (const x of [x0 + .7, x1 - .7]) {
      box('metal', x - .13, x + .13, 0, h, z - .16, z + .16, { tint: metal });
      beam([x, h - .8, z], [x < midX ? x + 3 : x - 3, h - .15, z], .075);
    }
    box('floor', x0, x1, -.2, 0, z0, z1, { solid: false });
    // 挑簷、排水管與混凝土踢腳，尺寸以公尺計。
    for (const x of [x0, x1]) {
      if(doors==='x')for(const [a,c] of [[z0,midZ-door],[midZ+door,z1]])box('concrete',x-.16,x+.16,0,.55,a,c);
      else box('concrete', x - .16, x + .16, 0, .55, z0, z1);
      beam([x, h, z0], [x, h, z1], .12, 'rust'); pipe(x, 0, z0 + 1, .08, h, 'rust');
    }
    // 工業高窗、窗框與窗台；玻璃共用一個材質，不用住宅立面貼圖。
    const wy = h * .55, wh = Math.min(2.2, h * .22);
    for (const z of [z0 - .012, z1 + .012]) for (let x = x0 + 3; x < x1 - 4; x += 6) {
      if (doors === 'z' && Math.abs(x + 2 - midX) < door + 1 && wy < 5) continue;
      if(masonry) {
        harborWindow(portArt,x+2,z,{ry:z<midZ?Math.PI:0,base:wy-.2,spring:wy+1.1,radius:1.1});
        continue;
      }
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
    box('corr', x - 1.22, x + 1.22, y, y + 2.6, z - length / 2, z + length / 2, { tint, skip:'ny' });
    for (const dx of [-1.19, 1.19]) for (const dz of [-length / 2, length / 2])
      box('metal', x + dx - .045, x + dx + .045, y, y + 2.64, z + dz - .08, z + dz + .08, { tint: metal, skip: 'ny ' + (dx < 0 ? 'px' : 'nx') + ' ' + (dz < 0 ? 'pz' : 'nz') });
    // 門鎖用四面鋼條，省下小圓柱端蓋與背面，把幾何留給近景作業設備。
    for (const dx of [-.7, .7]) b.deco('metal', x + dx - .025, x + dx + .025, y + .2, y + 2.4, z + length / 2 + .01, z + length / 2 + .06, { tint: metal, skip: 'nz ny py' });
    box('metal', x - 1.2, x + 1.2, y + 2.55, y + 2.65, z - length / 2, z - length / 2 + .12, { tint: metal, skip: 'ny' });
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
  function civilianCar(x, z, ry = 0) {
    const g = car(1, false), materials = carMaterials(), group = new THREE.Group(), meshes = [];
    for (const [key, mat] of [['body', 'carPaint'], ['dark', 'carDark'], ['metal', 'carMetal'], ['glass', 'carGlass'], ['lights', 'carLights']]) if (g[key]) {
      const m = new THREE.Mesh(g[key], materials[mat]); m.name = 'civilian-car-' + key;
      m.castShadow = !materials[mat].userData.noCast; m.receiveShadow = true; group.add(m); meshes.push(m);
    }
    group.position.set(x, 0, z); group.rotation.y = ry; group.updateMatrix(); group.matrixAutoUpdate = false; scene.add(group);
    const bb = new THREE.Box3();
    for (const m of meshes) { m.geometry.computeBoundingBox(); bb.union(m.geometry.boundingBox); }
    bb.applyMatrix4(group.matrix);
    const box = solid.add({ x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: bb.max.y, z0: bb.min.z, z1: bb.max.z, mat: 'metal' });
    if (PL.reg) PL.reg.push({ name: 'covered_car', h: { mat: group.matrix, geometries: meshes.map(mesh => mesh.geometry), hide() { group.visible = false; box.dead = true; } }, box });
    const triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3, 0);
    M.cars.push({ x, y: 0, z, ry, profile: g.profile, meshes, triangles });
  }
  // 任務道具寫進既有材質桶；只在拿取／重玩時更新自己的頂點範圍，不依賴掃描模型下載。
  function visual(draw) {
    const buckets = [b.B.landmarkPaint, b.B.metal], starts = buckets.map(bucket => bucket.p.length);
    draw();
    const ranges = buckets.map((bucket, i) => ({ bucket, start: starts[i], positions: bucket.p.slice(starts[i]), colors: bucket.c.slice(starts[i]) })).filter(r => r.positions.length);
    const bounds=new THREE.Box3();for(const r of ranges)for(let i=0;i<r.positions.length;i+=3)bounds.expandByPoint(new THREE.Vector3(...r.positions.slice(i,i+3)));
    let visible = true;
    const write = (r, attr, values) => {
      const target = r.bucket.mesh?.geometry.attributes[attr];
      if (target) { target.array.set(values, r.start); target.needsUpdate = true; }
      else { const a = attr === 'position' ? r.bucket.p : r.bucket.c; for (let i = 0; i < values.length; i++) a[r.start + i] = values[i]; }
    };
    return {
      ranges, bounds, triangles: ranges.reduce((n, r) => n + r.positions.length / 9, 0),
      get visible() { return visible; }, set visible(value) { value ? this.show() : this.hide(); },
      hide() { if (!visible) return; visible = false; for (const r of ranges) write(r, 'position', new Float32Array(r.positions.length)); },
      show() { if (visible) return; visible = true; for (const r of ranges) write(r, 'position', r.positions); },
      tint(color) { for (const r of ranges) write(r, 'color', r.colors.map((v, i) => color[i % 3])); },
      resetTint() { for (const r of ranges) write(r, 'color', r.colors); },
      reset() { this.show();this.resetTint(); },
    };
  }
  const enamel = [.42,.49,.46], darkPanel = [.065,.085,.085], paper = [.8,.79,.68], brass = [.57,.4,.15];
  const detail = (x,y,z,w,h,d,tint=enamel) => b.deco('landmarkPaint',x-w/2,x+w/2,y,y+h,z-d/2,z+d/2,{tint,skip:'ny'});
  function cylinder(x,y,z,r,h,tint,axis='y') {
    const g = new THREE.CylinderGeometry(r,r,h,8);
    if(axis==='z')g.rotateX(Math.PI/2);
    mesh('landmarkPaint',g,x,y,z,0,{tint});g.dispose();
  }
  function table(x,z,y=.76,w=1.1,d=.7) {
    detail(x,y-.05,z,w,.05,d,[.36,.39,.36]);
    for(const dx of [-w*.39,w*.39])detail(x+dx,0,z,.045,y-.05,d*.75,[.26,.29,.28]);
  }
  function documents(x,y,z,map=false) {
    detail(x,y,z,.56,.025,.43,map?[.63,.68,.55]:[.28,.38,.42]);
    detail(x+.02,y+.026,z,.49,.009,.36,paper);
    if(map) {
      detail(x-.06,y+.037,z,.025,.006,.29,[.39,.47,.48]);
      detail(x,y+.037,z+.025,.39,.006,.018,[.39,.47,.48]);
      detail(x+.15,y+.044,z+.025,.1,.006,.025,[.63,.25,.17]);
    } else for(let i=0;i<3;i++)detail(x+.025,y+.037,z-.08+i*.07,.33-i*.045,.006,.012,[.28,.32,.31]);
    detail(x-.19,y+.041,z-.17,.12,.012,.025,brass);
  }
  function radio(x,y,z) {
    detail(x,y,z,.54,.3,.3,[.24,.32,.26]);
    detail(x-.13,y+.09,z+.156,.18,.13,.015,darkPanel);
    for(const dx of [.055,.125,.195])detail(x+dx,y+.065,z+.16,.023,.16,.016,[.1,.13,.11]);
    detail(x+.18,y+.3,z-.1,.015,.49,.015,darkPanel);
  }
  function cartridge(x,y,z,axis='z') {
    cylinder(x,y+.1,z,.07,.36,[.78,.79,.7],axis);
    for(const d of [-.17,.17])cylinder(x,y+.1+(axis==='y'?d:0),z+(axis==='z'?d:0),.08,.045,brass,axis);
  }
  function item(id, name, x, z, y = 0) {
    if(name === null) { M.items[id]={h:null,p:V(x,z,y)};return; }
    if(id==='fuse') {
      detail(x,.04,z,.78,.27,.54,[.39,.3,.18]);detail(x,.315,z,.66,.025,.43,darkPanel);
      detail(x,.32,z-.29,.78,.35,.055,[.39,.3,.18]);
      for(const dx of [-.19,.19])detail(x+dx,.34,z,.11,.05,.38,brass);
    } else table(x,z,y-.035);
    const h=visual(()=>id==='radio'?radio(x,y,z):id==='fuse'?cartridge(x,.34,z):documents(x,y,z,id==='smap'));
    if(id==='radio') {
      const signal=visual(()=>detail(x-.16,y+.21,z+.168,.06,.025,.012,[.64,.34,.12])),show=h.show.bind(h),hide=h.hide.bind(h);
      let connected=false;Object.defineProperty(h,'installed',{get:()=>connected});
      h.signal=signal;h.triangles+=signal.triangles;
      h.show=()=>{show();signal.show();};h.hide=()=>{hide();signal.hide();};
      h.install=()=>{connected=true;h.show();signal.tint([.18,.65,.32]);};h.reset=()=>{connected=false;h.show();signal.resetTint();};
    }
    M.items[id]={h,p:V(x,z,y),pin:h.bounds.getCenter(new THREE.Vector3()),persistent:id==='radio',kind:id==='radio'?'radio':id==='fuse'?'fuse':id==='smap'?'map':'documents'};
  }
  function operationProp(point,kind) {
    const x=point[0],z=point[1]+.8;
    const body=visual(()=>{
      if(['terminal','manifest','relay','medicine'].includes(kind)) {
        table(x,z);
        if(kind==='medicine') {
          detail(x,.77,z,.65,.2,.42,[.53,.25,.2]);detail(x,.98,z-.235,.65,.29,.035,[.53,.25,.2]);
          detail(x,.99,z-.25,.04,.2,.018,paper);detail(x,.99+.08,z-.25,.2,.04,.019,paper);
          for(const dx of [-.16,.16]) { detail(x+dx,.98,z,.08,.17,.08,paper);detail(x+dx,1.15,z,.07,.035,.07,[.24,.43,.35]); }
        } else {
          detail(x,.78,z+.1,.57,.035,.19,darkPanel);
          detail(x,1,z-.1,.65,.43,.055,[.25,.3,.3]);detail(x,1.04,z-.065,.55,.31,.016,darkPanel);
          detail(x,.92,z-.1,.045,.14,.09,[.25,.3,.3]);
          if(kind==='manifest')documents(x+.35,.78,z);
          if(kind==='relay')detail(x+.4,.77,z-.15,.018,.88,.018,darkPanel);
        }
      } else if(kind==='oxygen') {
        detail(x,.06,z,.55,.09,.46,darkPanel);cylinder(x,.68,z,.17,1.08,[.28,.43,.34]);
        cylinder(x,1.25,z,.095,.1,brass);detail(x,1.29,z,.28,.045,.045,brass);
        detail(x+.16,1.2,z-.1,.18,.16,.08,[.72,.73,.62]);detail(x+.16,1.23,z-.145,.12,.1,.016,darkPanel);
        detail(x+.25,.3,z-.1,.023,.9,.023,darkPanel);
      } else if(kind==='pump') {
        detail(x,.05,z,1.05,.13,.55,enamel);cylinder(x,.48,z,.22,.55,[.33,.4,.4],'z');
        cylinder(x-.32,.38,z,.08,.7,brass);detail(x+.33,.18,z,.22,.73,.27,enamel);
        detail(x+.33,.64,z-.145,.15,.17,.025,darkPanel);
      } else {
        const lock=kind==='lock',crane=kind==='crane';
        detail(x,0,z,.72,.12,.43,darkPanel);
        detail(x,.12,z,lock?.12:crane?.28:.62,lock?.85:crane?.73:.46,.23,enamel);
        detail(x,lock?.97:crane?.85:.58,z,lock?.38:crane?.75:.88,lock?.48:crane?.25:1.05,.27,enamel);
        const faceY=lock?1.08:crane?.88:.81;
        detail(x,faceY,z-.145,lock?.28:crane?.64:.72,lock?.25:crane?.16:.55,.023,darkPanel);
        if(crane)for(const dx of [-.2,.2]) { detail(x+dx,.97,z-.07,.025,.25,.025,[.32,.35,.33]);detail(x+dx,1.2,z-.07,.09,.06,.07,[.53,.25,.17]); }
        else for(const dx of [-.18,0,.18])detail(x+dx,lock?1.13:.93,z-.165,lock?.035:.075,lock?.12:.18,.035,brass);
        if(kind==='fuse')for(const dx of [-.12,.12])detail(x+dx,.95,z-.18,.06,.05,.15,[.68,.69,.59]);
      }
    });
    const lampY=['terminal','manifest','relay'].includes(kind)?1.38:kind==='medicine'?1.12:kind==='oxygen'?1.35:kind==='pump'?.85:kind==='lock'?1.4:kind==='crane'?1.04:1.5;
    const lamp=visual(()=>detail(x+(kind==='lock'?.1:kind==='pump'?.33:kind==='oxygen'?.16:.2),lampY,z-(kind==='medicine'?.26:.17),.075,.04,.035,[.64,.34,.12]));
    const installed=kind==='fuse'?visual(()=>cartridge(x,1,z-.185,'y')):null;
    installed?.hide();let complete=false;
    const h={p:V(point[0],point[1]),pin:body.bounds.getCenter(new THREE.Vector3()),kind,body,lamp,installedPart:installed,get installed(){return complete;},
      install(){complete=true;body.show();lamp.show();lamp.tint([.18,.65,.32]);installed?.show();},
      reset(){complete=false;body.show();lamp.show();lamp.resetTint();installed?.hide();},
      hide(){body.hide();lamp.hide();installed?.hide();},show(){body.show();lamp.show();if(complete)installed?.show();},
      triangles:body.triangles+lamp.triangles+(installed?.triangles||0)};
    return h;
  }
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
    const height = A.relief ? (x,z)=>kobeCityHeight(A.relief,-z+KOBE_RELIEF.anchorX,x-SHORE+KOBE_RELIEF.anchorZ) : world.terrain.source;
    const source = (x,z)=>height(x,z)*coast(x,z)*(A.relief?1:.68);
    world.terrain.source=source;
    const T=world.terrain;
    for(let j=0;j<=T.seg;j++)for(let i=0;i<=T.seg;i++)T.h[j*(T.seg+1)+i]=source(-T.size/2+i*T.cell,-T.size/2+j*T.cell);
    world.height = (x, z) => x > SHORE ? -10 : world.terrain.height(x,z);
    for (const mesh of [world.terrainMesh, world.mountainMesh]) {
      const p = mesh.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setY(i,source(p.getX(i),p.getZ(i)));
      p.needsUpdate = true; mesh.geometry.computeVertexNormals(); mesh.geometry.computeBoundingSphere();
    }
    const floor = solid.floorAt.bind(solid);
    solid.floorAt = (x, z, ...args) => { const y = floor(x, z, ...args); return x > SHORE && y === 0 ? -10 : y; };
    const material = world.terrainMesh.material, compile = material.onBeforeCompile;
    material.onBeforeCompile = sh => {
      compile(sh);
      sh.fragmentShader = sh.fragmentShader.replace('vec2 cityP=', `if(vTW.x > ${SHORE.toFixed(1)}) discard;\n        vec2 cityP=`);
    };
    material.customProgramCacheKey = () => 'lastline-coast-v2'; material.needsUpdate = true;
    scene.fog.color.setRGB(.39, .47, .52); scene.fog.density = .0003;
    world.sun.color.setRGB(1, .95, .86); world.sun.intensity = 3.1;
    world.hemi.color.setRGB(.48, .56, .65); world.hemi.intensity = .38;
    scene.environmentIntensity = .7;
    world.skyDome.material.uniforms.fogCol.value.copy(scene.fog.color);
    world.buildKobeBackdrop({harbor:true});
  }
  b.B.portGround.quad([-250,.025,320], [SHORE,.025,320], [SHORE,.025,-590], [-250,.025,-590], [0,1,0]);
  // 海堤有厚度與潮痕，沒有穿越海面的隱形地板。
  box('concrete', SHORE - 1.2, SHORE, -4, .85, -590, 320, { tint: [.48, .53, .54] });
  const water = harborWater('x', SHORE);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(5600, 9000).rotateX(-Math.PI / 2), water);
  const uv = sea.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 600, uv.getY(i) * 900);
  sea.onBeforeRender = () => { water.userData.seaTime.value = performance.now() * .001; };
  sea.position.set(SHORE + 2800, -1, 0); sea.name = 'lastline-sea'; sea.receiveShadow = true; scene.add(sea);

  // 第 1 章：不是住宅後巷，而是貨運鐵道、海關倉庫與通訊室。
  M.marks.start = V(-180, -232); M.marks.ch2 = V(-105, -100); M.marks.ch3 = V(0, 5);
  for (const x of [-228, -226.5]) beam([x, .04, -320], [x, .04, 280], .065, 'rust');
  for (let z = -315; z < 280; z += 1.2) b.deco('rust', -229, -225.5, .025, .08, z, z + .15, {skip:'ny nx px nz pz'});
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
  shed(-208, -152, -205, -130, 8, 'z', 3, true);
  shed(-149, -113, -122, -78, 6.2, 'x', 1.8);
  // 西翼拘留室與臨時救護站有自己的門路，任務不靠站在空地上讀文字。
  shed(-222,-210,-184,-153,5.2,'z',1.6);
  shed(-140,-116,-56,-34,3.6,'z',.8);
  prop('metal_office_desk',-135,-38);prop('metal_office_desk',-122,-38);
  prop('metal_jerrycan_green',-136,-49);prop('propane_tank',-137,-48);
  for(const x of [-131,-128.8,-126.6]) {
    box('metal',x-.36,x+.36,.67,.72,-42,-40.1,{tint:metal});
    box('wall',x-.33,x+.33,.72,.8,-41.97,-40.13,{tint:[.78,.8,.75]});
    for(const dx of [-.29,.29])for(const z of [-41.8,-40.3])box('metal',x+dx-.025,x+dx+.025,0,.67,z-.025,z+.025,{tint:metal});
    b.deco('wall',x-.28,x+.28,.8,.9,-41.92,-41.6,{tint:[.86,.87,.81]});
  }
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
  for (const z of [-190,-174,-158,-142]) {
    for(const zz of [z-5.5,z,z+5.5])for(const x of [-205,-201]) {
      box('metal',x-.08,x+.08,0,5.2,zz-.08,zz+.08,{tint:[.52,.43,.28]});
      beam([x,.4,zz],[x,4.85,zz+1.2],.035);
    }
    for(const y of [.4,1.95,3.5]) {
      for(const x of [-205,-201]) b.deco('metal',x-.09,x+.09,y,y+.13,z-5.5,z+5.5,{tint:[.68,.4,.22]});
      b.deco('metal',-205,-201,y+.13,y+.18,z-5.5,z+5.5,{tint:metal});
      for(let i=0;i<4;i++) {
        const zz=z-4.6+i*2.6;
        b.deco('wall',-204.65,-201.4,y+.18,y+1.25,zz-.8,zz+.8,{tint:[.68,.58,.41]});
        for(const x of [-204.0,-202.0]) b.deco('metal',x-.025,x+.025,y+.18,y+1.27,zz-.82,zz+.82,{tint:[.22,.25,.26]});
      }
    }
    solid.add({x0:-205.1,x1:-200.9,y0:0,y1:5.2,z0:z-5.6,z1:z+5.6,mat:'metal'});
  }
  prop('concrete_road_barrier_02', -177, -216); civilianCar(-158, -225, .2);
  for (const [x, z] of [[-203, -192], [-156, -182], [-204, -143], [-90, -122], [-46, -92], [65, 56]]) {
    prop('barrel_03', x, z); prop('Barrel_01', x + 1.2, z + .2); prop('old_tyre', x + .4, z + 1.6, 0, .3);
  }
  prop('metal_office_desk', -133, -108); prop('utility_box_02', -143, -117, 0, 0, { noBreak: true });
  item('radio', 'metal_jerrycan_green', -135, -106, .8); item('codes', 'cardboard_box_01', -130, -106, .8); item('smap', 'cardboard_box_01', -125, -106, .8);
  // 第 2 章：冷藏貨運站的鋼屋架、儲槽與低掩體。
  shed(-95, -40, -128, -80, 8, 'x', 4);
  for (const x of [-90, -75, -55]) { prop('plastic_crate_02', x, -117); prop('steel_frame_shelves_01', x, -88, 0, 0, { scale: .14 }); }
  for (const [x, z, c] of [[-95, -50, [.55, .38, .3]], [-60, -52, paint], [-20, -74, [.63, .58, .4]], [30, -85, paint]]) container(x, z, c);
  for (const [x, z] of [[-78, -64], [-42, -59], [-8, -63], [22, -58], [0, 24], [29, 35]]) prop('concrete_road_barrier_02', x, z, 0, Math.PI / 2);
  target('jam1', -71, -71); target('jam2', -38, -71); target('jam3', -4, -71);
  shed(10, 36, -51, -23, 5.2, 'z', 1.4);
  prop('metal_office_desk', 25, -31); item('rec_a', 'cardboard_box_01', 20, -31, .8);
  item('rec_b', 'cardboard_box_01', 25, -31, .8); item('rec_c', 'cardboard_box_01', 30, -31, .8);
  M.marks.key = V(25, -37, .8);
  table(25,-37,.76,.8,.6);
  M.keyMesh = M.keyHandle = visual(()=>{
    detail(25,.8,-37,.33,.035,.2,[.58,.68,.66]);detail(25,.837,-37,.28,.007,.16,darkPanel);
    for(let i=0;i<4;i++)detail(24.9+i*.065,.845,-36.945,.035,.006,.055,brass);
    detail(25,.845,-37.025,.16,.009,.06,[.58,.68,.66]);
  });
  // 第 3 章：修船棚的圓拱輪廓與機體維修架，樓梯可從地面一路走到胸前。
  shed(10, 70, 52, 112, 24, 'z', 7);
  box('brick', 70, 120, 0, 11, 76, 112); roof(70, 120, 76, 112, 11, 4);
  M.marks.mech = V(40, 103); M.marks.hatch = V(40, 99.8, 12.4);
  M.marks.mechPath = [V(134, -45), V(134, 40), V(134, 130)];
  stairs(2, 6, 60, 74, 0, 7); deck(2, 6, 74, 90, 7); stairs(2, 6, 90, 102, 7, 12.4);
  deck(2, 32, 102, 107, 12.4); deck(30, 34, 98, 107, 12.4); deck(32, 43, 98, 101.5, 12.4);
  for (const x of [2, 6]) beam([x, 8, 74], [x, 8, 90], .035);
  beam([2, 13.4, 107], [32, 13.4, 107], .035);
  prop('tool_cart', 20, 86); prop('steel_frame_shelves_01', 60, 98, 0, 0, { scale: .14 }); prop('propane_tank', 57, 58);
  item('fuse', 'old_military_crate', 19, 40); item('panel1', null, 18, 62); item('panel2', null, 62, 62);
  prop('utility_box_02', 18, 61, 0, 0, { noBreak: true }); prop('utility_box_02', 62, 61, 0, 0, { noBreak: true });
  target('tow1', 58, 90); target('tow2', 23, 91);
  target('override',64,82);
  const operationKinds={B3:['alarm','alarm'],B4:['lock'],C4:['terminal','terminal'],C6:['oxygen','medicine'],C7:['manifest'],
    D2:['power','lock'],D2C:['relay'],KEY2:['terminal','terminal'],F3:['crane','crane'],G3:['fuse','fuse','pump']};
  for(const E of ENCOUNTERS)if(E.operation?.kind==='console')
    M.operationProps[E.id]=E.operation.points.map((point,i)=>operationProp(point,operationKinds[E.id]?.[i]||'terminal'));
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
  // 岸邊轉運棚：坡屋面、裝卸月台、斜撐與通風百葉形成不同於堆場的輪廓。
  // x=600 的撤離車道與敵機落點保留；設備只在既有碼頭的作業帶內。
  for (const [z0, z1] of [[-168, -135], [-20, 10], [82, 103]]) {
    box('concrete', 625, 666, 0, 1.2, z0, z1, { tint: [.67,.65,.59] });
    box('brick', 647, 666, 1.2, 8.6, z0, z1);
    for (const z of [z0-.12, z1+.12]) {
      box('metal', 647, 666, 8.6, 9, z-.15, z+.15, { tint: [.61,.65,.65] });
      for (let x=649; x<665; x+=3) {
        b.deco('portGlass', x,x+2,5.8,7.2,z-.025,z+.025);
        for (const y of [5.8,6.5,7.2]) b.deco('metal',x,x+2,y-.035,y+.035,z-.06,z+.06,{tint:metal});
      }
    }
    b.B.corr.quad([624,7.4,z1+.8],[666.7,9.2,z1+.8],[666.7,9.2,z0-.8],[624,7.4,z0-.8],[-.042,.999,0],[1,1,1,1],null,[.65,.68,.65]);
    b.B.corr.quad([624,7.34,z0-.8],[666.7,9.14,z0-.8],[666.7,9.14,z1+.8],[624,7.34,z1+.8],[.042,-.999,0],[.7,.7,.7,.7],null,[.65,.68,.65]);
    for (const z of [z0+1,z1-1]) {
      box('metal',625,625.22,1.2,7.45,z-.11,z+.11,{tint:metal});
      beam([625,5.9,z],[628.5,7.6,z],.08);
      beam([624,7.4,z],[666.7,9.2,z],.1); pipe(666.3,0,z,.12,9,'rust');
    }
    for (let z=z0+4; z<z1-2; z+=8) {
      b.deco('corr',646.88,646.98,1.2,5.7,z,z+5,{tint:[.46,.55,.57]});
      for (const zz of [z,z+5]) b.deco('metal',646.72,647,1.2,5.9,zz-.1,zz+.1,{tint:metal});
      box('metal',626,628,1.2,1.4,z,z+4,{tint:[.25,.27,.26],solid:false});
      for (const zz of [z+.7,z+3.3]) b.deco('metal',624.85,625.04,.35,.95,zz-.4,zz+.4,{tint:[.12,.14,.15]});
    }
    for (let z=z0+2; z<z1-2; z+=6) {
      box('metal',664.9,665.7,9.2,9.5,z,z+3,{tint:[.52,.57,.56],solid:false});
      for (let k=0;k<4;k++) b.deco('metal',664.75,665.85,9.5+k*.13,9.55+k*.13,z,z+3,{tint:metal});
    }
  }
  // 管線支架和閥件；不是一排沒有接頭的巨型方塊。
  for (const z0 of [-302, 132]) {
    for (const y of [2.2,3.2]) beam([626,y,z0],[626,y,z0+34],.23,'metal',[.56,.61,.58]);
    for (let z=z0;z<=z0+34;z+=8) {
      box('concrete',624.8,627.2,0,.5,z-.55,z+.55);
      beam([626,0,z],[626,3.4,z],.12); beam([624.9,2,z],[627.1,2,z],.08);
    }
    for (const z of [z0+4,z0+27]) {
      pipe(626,3.2,z,.12,.65,'metal');
      const g=new THREE.TorusGeometry(.36,.045,4,12).rotateX(Math.PI/2);
      mesh('metal',g,626,3.87,z,0,{tint:[.58,.28,.18]});g.dispose();
    }
  }
  function forklift(x,z) {
    const base=1.2;
    const ochre=[.78,.49,.14], rubber=[.14,.16,.17];
    box('metal',x-1,x+1,.6+base,1.3+base,z-1.5,z+1.3,{tint:ochre});
    box('metal',x-.95,x+.95,1.3+base,1.7+base,z-.9,z-.3,{tint:ochre});
    b.deco('metal',x-.43,x+.43,1.25+base,1.4+base,z-.25,z+.4,{tint:rubber});
    b.deco('metal',x-.43,x+.43,1.4+base,2.05+base,z-.3,z-.15,{tint:rubber});
    for(const dx of [-1,1])for(const dz of [-.95,.9]) {
      const g=new THREE.CylinderGeometry(.48,.48,.27,12).rotateZ(Math.PI/2);
      mesh('metal',g,x+dx,.5+base,z+dz,0,{tint:rubber});g.dispose();
    }
    for(const dx of [-.82,.82])for(const dz of [-.55,.85])beam([x+dx,1.3+base,z+dz],[x+dx,2.85+base,z+dz],.055);
    box('metal',x-.93,x+.93,2.85+base,2.97+base,z-.7,z+1,{tint:ochre,solid:false});
    for(const dx of [-.55,.55]) {
      box('metal',x+dx-.09,x+dx+.09,.3+base,3.3+base,z+1.45,z+1.6,{tint:metal});
      b.deco('metal',x+dx-.12,x+dx+.12,.28+base,.37+base,z+1.5,z+3.15,{tint:metal});
    }
    beam([x-.65,.65+base,z+1.56],[x+.65,.65+base,z+1.56],.08);
  }
  forklift(634,-143);forklift(633,92);
  for(const [x,z] of [[637,-158],[632,-6],[640,87]]) {
    for(const y of [1.2,2.35]) {
      for(let i=0;i<4;i++)b.deco('rust',x-1.3,x+1.3,y,y+.12,z-.9+i*.5,z-.62+i*.5,{tint:[.72,.59,.4]});
      for(const dx of [-.95,.95])b.deco('rust',x+dx-.12,x+dx+.12,y-.18,y,z-.9,z+1,{tint:[.66,.5,.32]});
    }
    box('corr',x-1.15,x+1.15,1.32,2.3,z-.8,z+.85,{tint:[.65,.62,.51]});
  }
  // 港務辦公樓：磚構、逐層玻璃與屋頂水箱，不用住宅樓體輪廓。
  box('brick', 500, 546, 0, 20, 240, 278);
  for (const z of [239.95, 278.05]) for (const y of [3, 7.5, 12, 16.5]) for (let x = 503; x < 542; x += 6) {
    const back=z<250?'pz':'nz';
    b.deco('portGlass', x, x + 3.4, y, y + 2.1, z - .025, z + .025,{skip:'px nx py ny '+back});
    for (const xx of [x, x + 1.7, x + 3.4]) b.deco('metal', xx - .035, xx + .035, y - .05, y + 2.15, z - .06, z + .06,{skip:'py ny '+back});
    b.deco('concrete', x - .15, x + 3.55, y - .18, y - .06, z - .2, z + .2,{skip:'ny '+back});
  }
  // 辦公樓的側面同樣有窗台、豎梃與分層線；石質牆腳、入口雨庇和排水管具有實際厚度。
  for(const x of [499.95,546.05])for(const y of [3,7.5,12,16.5])for(let z=243;z<273;z+=6) {
    const back=x<520?'px':'nx';
    b.deco('portGlass',x-.025,x+.025,y,y+2.1,z,z+3.4,{skip:'pz nz py ny '+back});
    for(const zz of [z,z+1.7,z+3.4])b.deco('metal',x-.06,x+.06,y-.05,y+2.15,zz-.035,zz+.035,{skip:'py ny '+back});
    b.deco('concrete',x-.2,x+.2,y-.18,y-.06,z-.15,z+3.55,{skip:'ny '+back});
  }
  b.deco('concrete',499.8,546.2,.025,.65,239.8,278.2,{skip:'py ny',tint:[.69,.67,.59]});
  for(const x of [500,546])for(const z of [240,278]) {
    b.deco('concrete',x-.16,x+.16,.65,20,z-.16,z+.16,{skip:'py ny',tint:[.7,.69,.63]});
    pipe(x+1,0,z,.055,20,'metal');
  }
  b.deco('portGlass',520.9,525.1,.65,3.1,239.82,239.84,{skip:'px nx py ny pz'});
  for(const x of [520.9,523,525.1])b.deco('metal',x-.04,x+.04,.65,3.12,239.75,239.87,{skip:'py ny pz'});
  b.deco('metal',519.8,526.2,3.15,3.27,238.1,240,{tint:paint,skip:'pz'});
  for(const x of [520,526])beam([x,2.7,239.8],[x,3.18,238.3],.045);
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
  const hullG = new THREE.ExtrudeGeometry(hull, { depth: 9, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 1, bevelThickness: 1, curveSegments: 8 }).rotateX(-Math.PI / 2).rotateY(Math.PI);
  mesh('rust', hullG, 735, -4, 45, 0, { tint: [.37, .3, .27], solid: true }); hullG.dispose();
  box('metal', 722, 748, 5, 5.4, -13, 80, { tint: metal, solid: false });
  for (let level = 0; level < 3; level++) box('wall', 722 + level, 748 - level, 5 + level * 4, 9 + level * 4, -17 + level, 6 - level, { tint: [.73, .78, .77], solid: false });
  for (let i = 0; i < 12; i++) container(728 + (i % 3) * 5, 23 + Math.floor(i / 3) * 16, colors[i % 4], 5.5);
  for (const x of [718.8,751.2]) {
    b.deco('metal',x-.08,x+.08,2.8,3.2,-17,80,{tint:[.73,.73,.64]});
    for(const z of [0,12,24,36,48,60,72]) {
      const ring=new THREE.TorusGeometry(.35,.065,4,10).rotateY(Math.PI/2);
      mesh('metal',ring,x,1.8,z,0,{tint:[.12,.15,.17]});ring.dispose();
    }
  }
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
  for (const [x,z] of [[574,-290],[573,145],[620,-380],[620,240]]) {
    pipe(x,0,z,.2,18,'metal',[.66,.68,.65]);
    box('concrete',x-.65,x+.65,0,.7,z-.65,z+.65);
    beam([x-2,18,z],[x+2,18,z],.09);
    for(const dx of [-1.5,-.5,.5,1.5]) {
      b.deco('metal',x+dx-.35,x+dx+.35,17.8,18.3,z-.4,z+.35,{tint:metal});
      b.deco('portGlass',x+dx-.28,x+dx+.28,17.88,18.23,z+.351,z+.36,{tint:[1.3,1.4,1.25]});
    }
  }
  // 海堤的分段壓頂與潮線，遠看也能區分乾燥作業坪和濕潤岸壁。
  for(let z=-585;z<315;z+=8) {
    b.deco('concrete',678.6,680.2,.82,1.02,z,z+7.92,{tint:[.69,.7,.64]});
    b.deco('concrete',679.99,680.02,-1.8,-.35,z,z+7.92,{tint:[.31,.38,.33],shade:()=>1});
  }
  // 神戶港客船泊位與岸壁附件。留在 x=680 海側，不侵入 x=600 的撤離車道。
  kobeHarborScenery(portArt,{launches:[[694,-430,0,1.1]],quays:[[SHORE,-270,384,Math.PI/2]],
    moorings:[[[679,.85,-459],[689,1.4,-442]],[[679,.85,-395],[689,1.4,-418]]],
  });
  for (const [x, z] of [[560, -340], [640, -320], [540, -130], [558, 132], [555, -420]]) {
    const g = new THREE.CylinderGeometry(1, 1.8, 3.4, 6); mesh('concrete', g, x, 1.7, z, 0, { tint: [.68, .66, .6] }); g.dispose();
    solid.add({ x0: x - 1.8, x1: x + 1.8, y0: 0, y1: 3.4, z0: z - 1.8, z1: z + 1.8, mat: 'concrete' });
  }
  for (const z of [-360, -335, -295]) for (const x of (z===-360?[650]:[550,650])) {
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
    const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace; texture.name = 'port-signs';
    document.fonts?.load('bold 48px "Noto Sans JP"', PORT_LABELS.join('')).then(() => { draw(); texture.needsUpdate = true; }).catch(() => {});
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: .8 });
    const g = new THREE.PlaneGeometry(10, 5);
    for (const [x, y, z, ry] of [[-180, 6.8, -205.45, Math.PI], [190, 7, -142, 0], [600, 9, -406, 0]]) {
      const sign = new THREE.Mesh(g, mat); sign.position.set(x, y, z); sign.rotation.y = ry; scene.add(sign);
    }
  }
  M.japanSites = { tower: [640, 400, 1, 0], maritime: [570, 405, 1, 0], waterfront: [514,SHORE,320,477], shrine: [-243, -275, .75, 0], streets: [
    [-211,-208,Math.PI,0,4],[-211,-130,Math.PI/2,0,0],[-111,-124,0,0,6],
    [-111,-72,0,0,5],[9,-5,0,0,1],[176,-135,0,0,4],
    [344,-138,Math.PI/2,0,0],[344,-200,Math.PI/2,0,6],[344,-265,Math.PI/2,0,4],
    [614,138,0,0,7],[614,66,0,0,6],[614,-8,0,0,5],
  ], shops: [[-216,-162,-251,1]], crossings: [[360,-143,0,22],[600,143,Math.PI,22]] };
  japaneseBuilder(b, M.japanSites);
  kobeStreetDetails(portArt,[[-190,-240,0,40,12],[566,320,0,72,12],[600,250,Math.PI/2,56,24,0,false]]);
  M.streetSites={frontages:[
    {x:-189,z:-251,ry:0,length:54,depth:5,ground:.12,kind:'shopping'},
    {x:-200,z:-205,ry:Math.PI,length:16,depth:2.1,ground:.12,kind:'service'},
    {x:-160,z:-205,ry:Math.PI,length:16,depth:2.1,ground:.12,kind:'service'},
    {x:-113,z:-100,ry:Math.PI/2,length:34,depth:1.3,kind:'service',gaps:[[-7,7]]},
    {x:-40,z:-100,ry:Math.PI/2,length:40,depth:1.2,kind:'service',gaps:[[-7,7]]},
    {x:36,z:-37,ry:Math.PI/2,length:22,depth:1.3,kind:'service'},
    {x:70,z:66,ry:Math.PI/2,length:20,depth:1.2,kind:'service'},
    {x:523,z:239.8,ry:Math.PI,length:46,depth:2.4,ground:.12,gaps:[[-4,4]]},
    {x:523,z:278.2,ry:0,length:46,depth:2.2,ground:.12,kind:'residential'},
    {x:615,z:-225,ry:-Math.PI/2,length:170,depth:3.5,kind:'service'},
    {x:615,z:35,ry:-Math.PI/2,length:140,depth:3.5,kind:'service'},
    {x:565,z:316,ry:0,length:94,depth:2.8,ground:.08,kind:'shopping'},
  ],parking:[{x:-159.5,z:-227.5,ry:0,stalls:3,bayWidth:2.8},{x:548,z:244,ry:Math.PI/2,stalls:4}],
  service:[{x:-182,z:-209,ry:Math.PI,length:12,width:4.4},{x:-98,z:-100,ry:-Math.PI/2,length:17,width:3},
    {x:380,z:-180,length:26,width:4.2},{x:566,z:-305,length:30,width:4},{x:640,z:142,length:26,width:4}],
  bicycles:[{x:-213,z:-250.4,count:2,ground:.12},{x:510,z:239.1,ry:Math.PI,count:2,ground:.12}],
  planters:[{x:-201,z:-250.25,length:2},{x:-183,z:-250.25,length:2},{x:-164,z:-250.25,length:1.7},
    {x:506,z:238.8,length:2.2},{x:540,z:238.8,length:2.2},{x:536,z:317.5,length:2.4},{x:603,z:317.5,length:2.4}],
  utilities:[{x:-208.3,z:-197,ry:-Math.PI/2,kind:'power'},{x:-96,z:-119,ry:-Math.PI/2,kind:'power'},
    {x:36,z:-47,ry:Math.PI/2},{x:546.2,z:264,ry:Math.PI/2,kind:'power'},{x:647,z:-162,ry:-Math.PI/2,kind:'power'}]};
  M.streetscape=kobeBlockStreets(portArt,M.streetSites);
  M.baseColliders=solid.list.length;
  const kitanoStart=[...new Set(Object.values(b.B))].reduce((n,bucket)=>n+bucket.p.length/9,0);
  M.kitano=kitanoBuilder(b,{x:-169,z:-278,yaw:Math.PI,ground:0,detail:true});
  M.kitano.triangles=[...new Set(Object.values(b.B))].reduce((n,bucket)=>n+bucket.p.length/9,0)-kitanoStart;
  const connectorStart=b.B.landmarkPaint.p.length,signStart=b.B.kitanoSigns.p.length;
  for(const [x0,x1,z0,z1]of [[-154,-146,-272,-237],[-173,-154,-272,-264],[-173,-165,-278,-272]])
    b.deco('landmarkPaint',x0,x1,.026,.04,z0,z1,{tint:[.36,.37,.34],skip:'ny nx px nz pz'});
  b.deco('landmarkPaint',-154.1,-154,.04,2.7,-241,-240.9,{tint:[.22,.26,.23],skip:'ny'});
  b.B.kitanoSigns.quad([-157,2,-240.8],[-153.8,2,-240.8],[-153.8,2.8,-240.8],[-157,2.8,-240.8],[0,0,1],[1,1,1,1],kitanoSignUV(0));
  M.kitanoConnector={route:[[-150,0,-240],[-150,.04,-268],[-169,.04,-268],[-169,.035,-278]],triangles:(b.B.landmarkPaint.p.length-connectorStart+b.B.kitanoSigns.p.length-signStart)/9};
  M.autumn=buildAutumnTrees(scene,[[-216,-232,.76],[-200,-232,.73],[-180,-232,.81],[-166,-232,.72],
    [-238,-270,.7],[-249,-263,.76],[530,313,.82],[554,313,.83],[578,313,.79],[603,313,.86],
    [626,313,.8],[626,350,.86],[626,385,.81],[626,432,.8],[626,465,.82],...M.kitano.treePoints],
    (x,z)=>x>=M.kitano.bounds.x0&&x<=M.kitano.bounds.x1&&z>=M.kitano.bounds.z0&&z<=M.kitano.bounds.z1?(M.kitano.heightAt?.(x,z)??solid.floorAt(x,z,40)):0);
  const meshes = b.build(scene); M.meshes = meshes;
  M.triangles = meshes.reduce((sum, mesh) => sum + (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3, 0);
  M.carTriangles = M.cars.reduce((sum, car) => sum + car.triangles, 0);
  M.totalTriangles = M.triangles + M.carTriangles; M.totalMeshes = M.meshes.length + M.cars.reduce((sum, car) => sum + car.meshes.length, 0);
  M.baseTriangles=M.totalTriangles-M.kitano.triangles-M.kitanoConnector.triangles;
  scene.userData.lastlineLayout = M.layout;
  return M;
}
