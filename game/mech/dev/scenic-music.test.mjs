import test from 'node:test';
import assert from 'node:assert/strict';
import { ScenicMusic } from '../scenic-music.mjs';
const bounds={x0:-225,x1:-113,z0:-558,z1:-278,y0:0,y1:45},inside={x:-170,y:10,z:-400};
test('北野探索音樂遇敵立即離開，停火八秒才恢復，避免反覆換曲',()=>{
  const cue=new ScenicMusic();assert(cue.update(1/60,inside,bounds,false));
  assert.equal(cue.update(1/60,inside,bounds,true),false);
  for(let i=0;i<7;i++)assert.equal(cue.update(1,inside,bounds,false),false);
  assert(cue.update(1.01,inside,bounds,false));
  cue.update(0,inside,bounds,true);cue.reset();assert(cue.update(0,inside,bounds,false));
});
test('離開街區、標題或切換無北野戰場不會選探索音樂',()=>{
  const cue=new ScenicMusic();assert.equal(cue.update(.1,inside,null,false),false);
  assert.equal(cue.update(.1,{...inside,x:0},bounds,false),false);
  assert.equal(cue.update(.1,{...inside,y:150},bounds,false),false);
  assert(cue.update(.1,{...inside,y:75},bounds,false),'機甲低空欣賞街區也能使用探索配樂');
});

test('入口邊界短暫來回不重啟兩首曲目，離開一段時間仍正常恢復',()=>{
  const cue=new ScenicMusic(),edge={...inside,x:bounds.x1+1};
  assert(cue.update(.1,inside,bounds,false));
  for(let i=0;i<5;i++){assert(cue.update(.1,edge,bounds,false));assert(cue.update(.1,inside,bounds,false));}
  assert(cue.update(1,edge,bounds,false));assert.equal(cue.update(.51,edge,bounds,false),false);
  assert(cue.update(.1,inside,bounds,false));assert.equal(cue.update(.1,edge,bounds,true),false);
});
