import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Escort, ending } from '../lastline/escort.mjs';
const route = [[192, -120], [360, -120], [360, 120], [600, 120]];
test('車隊等清路和護衛，不越過戰鬥路口', () => {
 const e = new Escort(route); e.step(.1, false, e.pos); assert.deepEqual(e.pos, route[0]);
 e.step(.1, true, [0, 0]); assert.deepEqual(e.pos, route[0]);
 for(let i=0;i<500;i++) e.step(.1, true, e.pos);
 assert.equal(e.index, 2); assert(e.pos[0] <= 600); assert(e.pos[1] === 120);
 assert(!e.ready(3, route[3]));
 for(let i=0;i<200;i++) e.step(.1, true, e.pos);
 assert(e.ready(3, route[3])); assert(!e.ready(3, [0, 0]));
});
test('暫停、失去耐久、不合法時間不前進', () => {
 const e = new Escort(route), p = [...e.pos];
 for(const dt of [0, -1, NaN, Infinity]) e.step(dt, true, p);
 e.step(.1, true, p, true); assert.deepEqual(e.pos, p);
 assert.equal(e.time, 0); assert(e.damage(200)); e.step(.1, true, p); assert.deepEqual(e.pos, p);
});
test('只有一種選擇，維修不超過上限，砲台選擇不虛增耐久', () => {
 const e = new Escort(route, 50); assert(!e.choose('invalid')); assert(e.choose('rescue')); assert.equal(e.hp, 68); assert(!e.choose('artillery'));
 const full = new Escort(route); full.choose('rescue'); assert.equal(full.hp, 100);
 const gun = new Escort(route, 70); gun.choose('artillery'); assert.equal(gun.hp, 70);
 assert.notEqual(ending('rescue', 90).title, ending('artillery', 90).title);
});
test('檢查點恢復路線、損傷、選擇；損壞存檔不傳入遊戲', () => {
 const e = new Escort(route); e.choose('rescue'); for(let i=0;i<190;i++) e.step(.1,true,e.pos); e.damage(25);
 const s = JSON.parse(JSON.stringify(e.snapshot())), next = new Escort(route); assert(next.restore(s)); assert.deepEqual(next.snapshot(), s);
 e.damage(100); assert(next.ready(1, route[1]));
 for(const bad of [{...s,hp:0},{...s,index:4},{...s,pos:[NaN,3]},{...s,pos:[-10000,0]},{...s,choice:'bad'}]) assert(!next.restore(bad));
 assert.equal(next.hp,75);
});
test('大時間跳躍被限制，不會穿過下一個戰鬥路口', () => {
 const e = new Escort(route);e.step(100,true,e.pos);assert.equal(e.pos[0],193);assert.equal(e.index,0);
});
