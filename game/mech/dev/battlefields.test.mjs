import test from 'node:test';
import assert from 'node:assert/strict';
import { BATTLEFIELDS, fieldHeight, fieldLayout, routeDistance } from '../battlefields.js';
import { STAGE_DATA } from '../stages.js';

test('六種戶外場地保留全部任務目標，路線與目標地面整平', () => {
  const types = new Set();
  for (const D of STAGE_DATA) {
    if (!D.battlefield) continue;
    types.add(D.battlefield);
    const L = fieldLayout(D.battlefield,D.route), R = {...D.route,pads:L.structures};
    assert.equal(L.structures.filter(s=>s.target).length,D.route.secs.flatMap(s=>s.targets||[]).length);
    for(let i=1;i<R.pts.length;i++) for(let j=0;j<=10;j++) {
      const a=R.pts[i-1],b=R.pts[i],x=a[0]+(b[0]-a[0])*j/10,z=a[1]+(b[1]-a[1])*j/10;
      assert.equal(fieldHeight(x,z,D.battlefield,R),0);
    }
    for(const S of L.structures) {
      assert.equal(fieldHeight(S.x,S.z,D.battlefield,R),0);
      if(!S.target) assert.ok(routeDistance(S.x,S.z,R.pts)>=42);
    }
  }
  assert.equal(types.size,6);
});

test('新地形接回原本遠山，不產生非有限值或邊界裂縫', () => {
  for(const D of STAGE_DATA.filter(d=>d.battlefield)) {
    let high=0;
    for(let x=-2500;x<=2500;x+=125) for(let z=-2500;z<=2500;z+=125) {
      const h=fieldHeight(x,z,D.battlefield,D.route,123);
      assert.ok(Number.isFinite(h)); high=Math.max(high,h);
      if(Math.max(Math.abs(x),Math.abs(z))>=5000) assert.equal(h,123);
    }
    assert.ok(high>=BATTLEFIELDS[D.battlefield].relief*0.35);
    for(const edge of [-5000,5000])for(let t=-5000;t<=5000;t+=500){assert.equal(fieldHeight(edge,t,D.battlefield,D.route,123),123);assert.equal(fieldHeight(t,edge,D.battlefield,D.route,123),123);}
  }
  assert.equal(fieldHeight(0,0,'city',{},17),17);
});

test('中央加密地形的座標與碰撞索引互為反函數，外圈仍接合原網格', async () => {
  const {fieldGridCoordinate:point,fieldGridIndex:index}=await import('../battlefields.js');
  for(const detail of [false,true])for(const seg of [80,160,320]) {
    let prev=-Infinity;
    for(let i=0;i<=seg;i++) {
      const x=point(i,seg,10000,detail);assert(x>prev);prev=x;
      assert(Math.abs(index(x,seg,10000,detail)-i)<1e-10);
    }
    assert.equal(point(0,seg,10000,detail),-5000);assert.equal(point(seg,seg,10000,detail),5000);
  }
  assert(point(81,160,10000,true)-point(80,160,10000,true)<30);
});
