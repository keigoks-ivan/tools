import test from 'node:test';
import assert from 'node:assert/strict';
import { kobeHarborScenery } from '../kobe-harbor.mjs';

const normal=(a,b,c)=>{
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
};
test('客船的水線、船舷玻璃與山牆朝外，地板朝上，旋轉後仍使用有限靜態幾何',()=>{
  const faces=[];
  kobeHarborScenery({face:(...a)=>faces.push(a)},{launches:[[0,0]],warehouses:[[0,80,88,16]],signal:[120,0],quays:[[0,-80,192,Math.PI/2]]});
  assert(faces.length*2<7500);
  for(const [a,b,c,d,col] of faces)assert([a,b,c,d,col].flat().every(Number.isFinite));
  const windows=faces.filter(([a,b,c,d,col])=>col[4]===4&&Math.abs(a[0])<4&&Math.abs(a[2])<14&&Math.abs(a[0]-b[0])<.001);
  assert(windows.length>10);
  for(const [a,b,c] of windows)assert(normal(a,b,c)[0]*a[0]>0,'客船側窗向內');
  const gables=faces.filter(([a,b,c,d,col])=>col[4]===7&&Math.abs(a[0])===44&&[a,b,c,d].every(p=>p[0]===a[0])&&Math.max(a[1],b[1],c[1],d[1])>6.7);
  assert(gables.length===2);
  for(const [a,b,c] of gables)assert(normal(a,b,c)[0]*a[0]>0,'紅磚山牆向內');
  const decks=faces.filter(([a,b,c,d,col])=>col[4]===5&&Math.abs(a[2])<30&&a[1]===1.35);
  assert(decks.length===20);
  for(const [a,b,c] of decks)assert(normal(a,b,c)[1]>0,'客船甲板朝下');
});
