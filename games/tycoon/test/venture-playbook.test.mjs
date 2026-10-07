import test from 'node:test';
import assert from 'node:assert/strict';
import { createManufacturing } from '../manufacturing.js';
import { createTechnology } from '../technology.js';
import { ventureJourney } from '../venture-playbook.js';

test('階段目標只觀察營運，不改存檔、現金或亂數', () => {
  for (const w of [createManufacturing(),createTechnology()]) {
    const before=JSON.stringify(w), j=ventureJourney(w);
    assert.equal(JSON.stringify(w),before);
    assert.equal(j.completed,0);
    assert.ok(j.steps.every(s=>!s.complete && s.progress>=0 && s.progress<1));
  }
});
test('獲利目標只承認已結月，不把營收、訂金或未結淨利當成果', () => {
  const w=createManufacturing();
  w.co.ledger.revenue=900000;
  assert.equal(ventureJourney(w).steps.at(-1).complete,false);
  w.co.history=[{revenue:900000,net:-100},{revenue:0,net:500}];
  assert.equal(ventureJourney(w).steps.at(-1).complete,false);
  w.co.history.push({revenue:900000,net:100});
  assert.equal(ventureJourney(w).steps.at(-1).complete,true);
});
test('科技目標按業態區分付費與活躍客群，服務目標須完整14日驗證', () => {
  for (const id of ['saas','marketplace','content']) {
    const w=createTechnology(id); w.users=6000; w.paying=id==='saas'?99:0;
    w.co.daily=Array.from({length:13},()=>({uptime:.999}));
    let j=ventureJourney(w,{supportLoad:.5});
    assert.equal(j.steps[1].complete,id!=='saas');
    assert.equal(j.steps[2].complete,false);
    w.co.daily.push({uptime:.999});
    assert.equal(ventureJourney(w,{supportLoad:.5}).steps[2].complete,true);
    w.co.daily[5].uptime=.9;
    assert.equal(ventureJourney(w,{supportLoad:.5}).steps[2].complete,false);
  }
});
test('舊存檔缺少研發次數仍可觀察新進度，客服超载不算達標', () => {
  const w=createTechnology(); delete w.capabilities; delete w.stats.projectsCompleted;
  assert.equal(ventureJourney(w).steps[0].value,0);
  w.stats.projectsCompleted=1; w.co.daily=Array.from({length:14},()=>({uptime:.999}));
  assert.equal(ventureJourney(w,{supportLoad:2}).steps[0].complete,true);
  assert.equal(ventureJourney(w,{supportLoad:2}).steps[2].complete,false);
});
