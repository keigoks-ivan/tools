import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KOBE_RELIEF, decodeKobeRelief, kobeElevation, kobeCityHeight } from '../kobe-relief.mjs';

const bytes=readFileSync(new URL('../assets/kobe-relief-v1.bin',import.meta.url));
const data=decodeKobeRelief(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
test('神戶標高檔保留六甲山海拔與南側低平海岸，沒有生成一圈高峰',()=>{
  assert.equal(bytes.byteLength,132098);
  assert.equal(data.length,KOBE_RELIEF.size**2);
  const summit=Math.max(...data);
  assert(summit>900&&summit<950,'實際 DEM 最高點不能被放大');
  assert(kobeElevation(data,0,-5000)>450,'北側必須有真實六甲山山脊');
  for(const x of [0,2000,5000,8000,12000])assert(kobeElevation(data,x,1000)<8,'南側港灣不能變成高山');
  assert.equal(kobeElevation(data,12000,1000),data.at(-1));
});
test('街區整地只影響可遊玩範圍；山麓以後保持原始高度',()=>{
  for(const [x,z] of [[0,0],[-180,540],[580,-550],[0,-820]])assert.equal(kobeCityHeight(data,x,z),0);
  for(const [x,z] of [[0,-1400],[-4000,-6000],[3000,-6500]])assert.equal(kobeCityHeight(data,x,z),kobeElevation(data,x,z));
  for(let z=-820;z>=-1400;z-=10){
    const y=kobeCityHeight(data,0,z);
    assert(Number.isFinite(y)&&y>=0&&y<=kobeElevation(data,0,z));
    assert(Math.abs(y-kobeCityHeight(data,0,z-.01))<.02,'整地接縫不能突然跳高');
  }
});
test('拒絕截斷的地形檔，完整來源包含 GSI 編碼及地理座標',()=>{
  assert.throws(()=>decodeKobeRelief(new ArrayBuffer(bytes.byteLength-2)),/Invalid Kobe/);
  const source=JSON.parse(readFileSync(new URL('../assets/kobe-relief-v1.source.json',import.meta.url)));
  assert.deepEqual(source.size,[257,257]);assert.deepEqual(source.bounds,[KOBE_RELIEF.x0,KOBE_RELIEF.x1,KOBE_RELIEF.z0,KOBE_RELIEF.z1]);
  assert.equal(source.anchor.lat,34.6825);assert.equal(source.anchor.lon,135.1888);
  assert(source.tiles.length===8&&source.tiles.every(url=>url.startsWith('https://cyberjapandata.gsi.go.jp/xyz/dem_png/')));
});
