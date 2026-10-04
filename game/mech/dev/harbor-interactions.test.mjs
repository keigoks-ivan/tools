import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Solid, SURFACES } from '../zero/kit.js';
import { buildMap } from '../lastline/map.js';
import { ENCOUNTERS } from '../lastline/script.js';

function harbor() {
  const scene=new THREE.Scene(),solid=new Solid();
  const mats=Object.fromEntries(SURFACES.map(k=>[k,new THREE.MeshStandardMaterial({vertexColors:true})]));
  const map=buildMap(scene,mats,solid,{add:()=>null},{rockN:null});
  return {scene,solid,map};
}
const current=r=>Array.from(r.bucket.mesh.geometry.attributes.position.array.slice(r.start,r.start+r.positions.length));
test('所有港區 E 拿取與控制站即使沒有掃描資產也有對應實體，站點和預算保留',()=>{
  const {solid,map}=harbor();let stations=0;
  for(const E of ENCOUNTERS) {
    for(const P of E.pickups||[]) {
      const item=map.items[P.id];assert(item?.h?.triangles>0,`${P.id} 只有提示點`);
      assert(item.h.visible);assert(item.h.bounds.distanceToPoint(item.p)<.65,`${P.id} 道具偏離拿取點`);
    }
    if(E.operation?.kind!=='console')continue;
    assert.equal(map.operationProps[E.id]?.length,E.operation.points.length,E.id);
    for(const [i,point] of E.operation.points.entries()) {
      const h=map.operationProps[E.id][i];stations++;
      assert.deepEqual(h.p.toArray(),[point[0],0,point[1]]);
      assert(h.pin.toArray().every(Number.isFinite));assert(h.body.bounds.containsPoint(h.pin));
      assert(h.body.triangles>0);assert(h.body.bounds.distanceToPoint(h.p)<1.35);
      assert(h.body.bounds.min.z>point[1]+.35,'控制站不可佔住玩家站點');
      const p=h.p.clone();solid.pushOut(p,.35,0,1.7,.45);assert(p.distanceTo(h.p)<.01,E.id+' 站點不可通行');
    }
  }
  assert.equal(stations,18);assert(map.keyHandle.triangles>0);
  assert.equal(map.meshes.length,15);assert.equal(map.totalMeshes,20);assert(map.baseTriangles<130000);assert(map.kitano.triangles<44000);
  assert.equal(map.baseColliders,2887,'道具不新增碰撞');
});
test('拿取與安裝可重設，操作只更新道具本身，不更動其他合併幾何',()=>{
  const {map}=harbor(),item=map.items.codes.h,peer=map.items.smap.h;
  const original=item.ranges.map(current),outside=peer.ranges.map(current);
  item.hide();item.hide();assert(item.ranges.every(r=>current(r).every(v=>v===0)));
  assert.deepEqual(peer.ranges.map(current),outside);
  item.reset();item.show();assert.deepEqual(item.ranges.map(current),original);
  map.keyMesh.visible=false;assert(!map.keyHandle.visible);map.keyMesh.visible=true;assert(map.keyHandle.visible);
  const radio=map.items.radio;assert(radio.persistent);radio.h.install();assert(radio.h.visible&&radio.h.installed);
  radio.h.hide();radio.h.reset();assert(radio.h.visible&&radio.h.signal.visible&&!radio.h.installed);
  for(const handles of Object.values(map.operationProps))for(const h of handles) {
    const originalColor=h.lamp.ranges.map(r=>Array.from(r.bucket.mesh.geometry.attributes.color.array.slice(r.start,r.start+r.colors.length)));
    assert(!h.installed);if(h.installedPart)assert(!h.installedPart.visible);
    h.install();h.install();assert(h.installed);if(h.installedPart)assert(h.installedPart.visible);
    assert(h.lamp.ranges.every(r=>r.bucket.mesh.geometry.attributes.color.getY(r.start/3)>.6));
    h.reset();h.reset();assert(!h.installed);if(h.installedPart)assert(!h.installedPart.visible);
    assert.deepEqual(h.lamp.ranges.map(r=>Array.from(r.bucket.mesh.geometry.attributes.color.array.slice(r.start,r.start+r.colors.length))),originalColor);
  }
});
