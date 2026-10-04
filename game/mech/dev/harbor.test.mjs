import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../zero/kit.js';
import { buildMap, SHORE } from '../lastline/map.js';
import * as S from '../lastline/script.js';
import { Pilot } from '../zero/player.js';

function harbor() {
  const scene = new THREE.Scene(), solid = new Solid();
  const mats = Object.fromEntries(SURFACES.map(k => [k, new THREE.MeshStandardMaterial({ vertexColors: true })]));
  const placer = { add: () => ({ hide() {} }) };
  const map = buildMap(scene, mats, solid, placer, { rockN: null });
  return { scene, solid, map };
}
const enemies = E => [...E.enemies, ...(E.pressure?.list||[]), ...(E.stealth?.reinforce || []), ...(E.hold?.waves.flat() || [])];
test('港區獨立地圖：所有章節入口、任務導引、敵人和互動都不在實體牆內', () => {
  const { solid, map } = harbor();
  const clear = (x, y, z, name) => {
    const p = new THREE.Vector3(x, y, z), original = p.clone();
    solid.pushOut(p, .35, y, y + 1.7, .45);
    assert(p.distanceTo(original) < .01, name + ' 被實體結構擋住');
  };
  for (const C of S.CHAPTERS.filter(c => !c.mech)) clear(...map.marks[C.start].toArray(), C.name);
  for (const E of S.ENCOUNTERS) {
    clear(E.guide[0], E.guide[2] || 0, E.guide[1], E.id + ' 導引');
    assert(E.after || E.trigger(new THREE.Vector3(E.guide[0], E.guide[2] || 0, E.guide[1])), E.id + ' 指示可觸發');
    for (const e of enemies(E)) clear(e.x, e.y || 0, e.z, E.id + ' ' + e.type);
    for (const p of E.pickups || []) { assert(map.items[p.id]); clear(...map.items[p.id].p.toArray(), p.id); }
    for (const id of E.targets || []) assert(map.targets[id]?.h, id + ' 缺少目標模型');
    if (E.pickup) assert(map.marks[E.pickup.at]);
    for(const p of E.operation?.points||[])clear(p[0],p.y||0,p[1],E.id+' 操作點');
    const route=E.operation?.route||[];
    for(let i=1;i<route.length;i++)for(let t=0;t<=1;t+=.02){const a=route[i-1],b=route[i];clear(a[0]+(b[0]-a[0])*t,0,a[1]+(b[1]-a[1])*t,E.id+' 護送路線');}
  }
});
test('車隊整條路線和後車延伸留有至少 12 公尺寬，敵機降落區不在屋內或海上', () => {
  const { solid } = harbor();
  for (const C of Object.values(S.MECH_CONFIGS)) {
    for (let j = 1; j < C.route.length; j++) {
      const a = C.route[j - 1], b = C.route[j], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let t = j === 1 ? -20 : 0; t <= d + (C.final && j === C.route.length - 1 ? 85 : 0); t += 2) {
        const x = a[0] + (b[0] - a[0]) * t / d, z = a[1] + (b[1] - a[1]) * t / d;
        assert(x < SHORE - 6, '車隊開到海上');
        for (const box of solid.list) if (!box.noMove && box.y1 > .5 && box.y0 < 5)
          assert(x < box.x0 - 6 || x > box.x1 + 6 || z < box.z0 - 6 || z > box.z1 + 6, `第 ${C.chapter} 章車隊 ${x},${z} 被結構擋住 ${JSON.stringify(box)}`);
      }
    }
    for (const W of C.waves) for (const [kind, x, z] of W.list) if (kind !== 'heli') {
      assert(x < SHORE - 4);
      for (const box of solid.list) if (!box.noMove && box.y1 > 3.35)
        assert(x < box.x0 - 3 || x > box.x1 + 3 || z < box.z0 - 3 || z > box.z1 + 3, kind + ' ' + x + ',' + z + ' 降落在結構內 ' + JSON.stringify(box));
    }
  }
});
test('登機引導的兩段樓梯與胸前平台有連續承重面；街區含汽車低於 13 萬三角形', () => {
  const { scene, solid, map } = harbor();
  for (let i = 1; i < S.HATCH_ROUTE.length; i++) {
    const a = S.HATCH_ROUTE[i - 1], b = S.HATCH_ROUTE[i];
    for (let t = 0; t <= 1; t += .02) {
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, y = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t;
      assert(Math.abs(solid.floorAt(x, z, y + .15) - y) < .17, `維修架懸空 ${x},${z}`);
    }
  }
  const pilot = new Pilot(solid); pilot.reset(new THREE.Vector3(4, 0, 60), 0);
  for (const [x, z, y = 0] of S.HATCH_ROUTE.slice(1)) {
    let n = 0;
    while (Math.hypot(pilot.pos.x - x, pilot.pos.z - z) > .16 && n++ < 1600) {
      pilot.yaw = Math.atan2(x - pilot.pos.x, z - pilot.pos.z);
      pilot.update(1 / 60, { mx: 0, my: 1, lookX: 0, lookY: 0 });
    }
    assert(n < 1600 && Math.abs(pilot.pos.y - y) < .2, '登機路被牆或階梯阻擋');
  }
  assert(map.totalTriangles < 130000, `港區含汽車 ${map.totalTriangles} 三角形`); assert(map.meshes.length <= 12 && map.totalMeshes <= 17);
  scene.traverse(o => {
    assert(!o.isLight, '地圖不另外增加光源');
    if (!o.isMesh) return;
    for (const a of Object.values(o.geometry.attributes)) assert([...a.array].every(Number.isFinite), '幾何含無效座標');
    if (o.geometry.attributes.color) assert([...o.geometry.attributes.color.array].every(v => v >= 0), '高柱與斜樑不能出現負值頂點顏色');
  });
});
