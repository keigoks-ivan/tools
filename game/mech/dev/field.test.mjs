import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { FieldOps } from '../zero/field.js';
import { ENCOUNTERS as ZERO, OUTPOSTS as ZPOSTS } from '../zero/script.js';
import { ENCOUNTERS as LAST, OUTPOSTS as LPOSTS } from '../lastline/script.js';
const input = key => ({ pressed: k => k === key });
function fixture() {
  const o = { id: 'FREE_TEST', name: '測試哨站', enemies: [{}, {}] }, rs = [{dead:false},{dead:false}];
  let refills=0, saves=0;
  const G = {fieldItems:{FREE_TEST:new T.Vector3(0,.4,0)},patrols:{group:()=>rs},player:{pos:new T.Vector3(),hp:40,dead:false},playerEye:new T.Vector3(0,1.6,0),solid:{sees:()=>true},scout:{active:false,destroyed:false,hp:10,ammo:1,battery:8,cooldown:0},vm:{refill:()=>refills++},nadeN:1,hud:{prompt:null,note(){}},onFieldClaim:()=>saves++};
  const F=new FieldOps(G,[o]);return {F,G,o,rs,get refills(){return refills;},get saves(){return saves;}};
}
test('outpost requires the complete resident group, including unloaded soldiers',()=>{
  const {F,G,o,rs}=fixture();assert(!F.secured(o));rs[0].dead=true;assert(!F.secured(o));rs[1].dead=true;assert(F.secured(o));
  G.patrols.group=()=>[];assert(!F.secured(o));G.patrols.group=()=>[rs[0]];assert(!F.secured(o));
});
test('supplies require a cleared post, a present living operator, visible access and E',()=>{
  const f=fixture(),{F,G,rs}=f;F.update(input('KeyE'));assert.equal(f.refills,0);rs.forEach(r=>r.dead=true);
  G.scout.active=true;F.update(input('KeyE'));assert.equal(f.refills,0);G.scout.active=false;
  G.player.dead=true;F.update(input('KeyE'));assert.equal(f.refills,0);G.player.dead=false;
  G.player.pos.x=3;F.update(input('KeyE'));assert.equal(f.refills,0);G.player.pos.x=0;
  G.solid.sees=()=>false;F.update(input('KeyE'));assert.equal(f.refills,0);G.solid.sees=()=>true;
  G.hud.prompt='主線互動';F.update(input('KeyE'));assert.equal(G.hud.prompt,'主線互動');G.hud.prompt=null;
  F.update(input(null));assert.equal(f.refills,0);G.hud.prompt=null;F.update(input('KeyE'));
  assert.equal(G.player.hp,75);assert.equal(G.nadeN,3);assert.equal(f.refills,1);assert.equal(f.saves,1);assert.equal(G.scout.ammo,30);
});
test('claims are one-time, capped, saved and backwards compatible',()=>{
  const f=fixture(),{F,G,rs}=f;rs.forEach(r=>r.dead=true);G.player.hp=90;G.nadeN=4;F.selected='FREE_TEST';F.update(input('Tlock'));
  assert.equal(G.player.hp,100);assert.equal(G.nadeN,5);assert.equal(F.selected,null);
  const saved=F.snapshot();F.reset({...saved,claimed:[...saved.claimed,'INVALID']});assert.deepEqual(F.snapshot(),saved);
  F.update(input('KeyE'));assert.equal(f.refills,1);F.reset();assert.deepEqual(F.snapshot(),{claimed:[]});F.reset({claimed:'broken'});assert.equal(F.claimed.size,0);
});
test('supplies do not bypass a destroyed drone cooldown',()=>{
  const {F,G,rs}=fixture();rs.forEach(r=>r.dead=true);Object.assign(G.scout,{destroyed:true,cooldown:30,hp:0,ammo:0,battery:0});F.update(input('KeyE'));
  assert.equal(G.scout.cooldown,30);assert.equal(G.scout.hp,0);assert.equal(G.scout.ammo,0);assert.equal(G.scout.battery,0);assert(G.scout.destroyed);
});
test('optional posts stay outside story gates and preserve stealth bypass routes',()=>{
  for(const [es,posts]of [[ZERO,ZPOSTS],[LAST,LPOSTS]]) {
    assert.equal(posts.length,3);assert.equal(posts.reduce((n,p)=>n+p.enemies.length,0),12);
    for(const p of posts){assert(!es.some(e=>e.id===p.id));assert(!p.after);assert(p.enemies.some(d=>d.patrol));}
  }
  assert.equal(ZERO.find(e=>e.id==='B2').enemies.length,3);assert.equal(ZERO.find(e=>e.id==='E0').enemies.length,3);
  assert.equal(LAST.find(e=>e.id==='B4').enemies.length,1);assert.equal(LAST.find(e=>e.id==='D2C').enemies.length,1);
});
