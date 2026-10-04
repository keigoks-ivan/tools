import test from 'node:test';
import assert from 'node:assert/strict';
import { frontageProfile, frontageDetails, streetfront } from '../streetfront.js';
import { SHOP_LABELS, shopUV } from '../urban.js';

test('店面變體穩定、使用既有正確日文招牌，完整落在六公尺開間與淺人行道範圍',()=>{
  const families=new Set(),signs=new Set(),silhouettes=new Set();
  for(let seed=0;seed<80;seed++) {
    const p=frontageProfile(seed);assert.deepEqual(frontageProfile(seed),p);families.add(p.type);signs.add(p.sign);
    assert(SHOP_LABELS[p.sign]);assert(p.frame.slice(0,3).every(v=>v>=0&&v<=1));
    let boxes=0,faces=0;const silhouette=[];
    const point=([a,y,d])=>{assert([a,y,d].every(Number.isFinite));assert(a>=0&&a<=6&&y>=0&&y<3.2&&d>=-.32&&d<=.8);};
    frontageDetails((a,b,y0,y1,d0,d1,col)=>{
      assert(b>a&&y1>y0&&d1>d0);point([a,y0,d0]);point([b,y1,d1]);assert(col.every(Number.isFinite));
      boxes++;silhouette.push([a,b,y0,y1,d0,d1]);
    },{center:3,seed,face:(points,col)=>{
      points.forEach(point);assert(col.every(Number.isFinite));
      const [a,b,c]=points,u=b.map((v,i)=>v-a[i]),v=c.map((x,i)=>x-a[i]);
      assert(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-6);
      faces++;silhouette.push(points);
    }});
    assert(boxes*12+faces*2<140,'一間店不能耗掉過多靜態幾何');silhouettes.add(JSON.stringify(silhouette));
  }
  assert.equal(families.size,4);assert.equal(signs.size,8);assert(silhouettes.size>=4,'不同商店只有顏色差異而沒有輪廓變化');
});

test('商店街保留連續店前通路，四參數舊呼叫仍有效，拱棚不增加販賣機',()=>{
  for(let seed=0;seed<40;seed++) {
    const boxes=[];streetfront(0,18,true,(...args)=>boxes.push(args),{seed,arcade:true});
    assert(boxes.length);assert(boxes.every(([a,b,y0,y1,d0,d1])=>a>=0&&b<2&&y1<=1.1&&d1<=.6));
    assert(boxes.length*12<160);
  }
  const old=[];streetfront(0,18,true,(...a)=>old.push(a));assert(old.length);
  streetfront(0,5,true,()=>assert.fail('窄店面不放額外設備'));
});

test('食堂和薬局橫式門楣採樣橫排字，直式招牌裁切維持正常字形比例',()=>{
  for(const id of [4,5]) {
    const horizontal=shopUV(id,true),vertical=shopUV(id),existing=shopUV(id-4);
    const aspect=uv=>(uv[1][0]-uv[0][0])*1024/((uv[2][1]-uv[0][1])*512);
    assert(aspect(horizontal)>4.5&&aspect(horizontal)<4.8);assert(aspect(vertical)>.30&&aspect(vertical)<.34);
    assert(horizontal[0][1]>existing[2][1],'橫排備用字不能覆蓋原有パン屋／喫茶店門楣');
    assert(horizontal.flat().every(v=>v>0&&v<1));
  }
});
