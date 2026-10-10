import test from 'node:test';
import assert from 'node:assert/strict';
import {TacticalSupport,fieldReward} from './support.mjs';

test('recon spends finite charges, respects cooldown and cannot refresh active intel',()=>{
  const s=new TacticalSupport('recon',2);
  assert.equal(s.activate().intel,25);assert.equal(s.charges,1);
  assert.equal(s.activate().reason,'cooldown');s.update(40);
  assert.equal(s.activate({intel:5}).reason,'active');assert.equal(s.charges,1);
  assert.equal(s.activate().ok,true);s.update(100);
  assert.equal(s.activate().reason,'empty');assert.equal(s.uses,2);
});
test('medicine restores only living squadmates within their actual HP limits',()=>{
  const s=new TacticalSupport('medic');
  const r=s.activate({hp:95,shield:55,allies:[{hp:85,hp0:90},{hp:0,hp0:100,dead:true},{hp:30,hp0:60}]});
  assert.deepEqual([r.hp,r.shield,...r.allies],[100,60,90,0,55]);
  s.update(45);assert.equal(s.activate({allies:[{hp:0,hp0:100,dead:true}]}).reason,'full');assert.equal(s.charges,1);
});
test('grenade packages cannot be wasted at capacity and do not regenerate between stages',()=>{
  const s=new TacticalSupport('grenadier');
  assert.equal(s.activate({nades:3}).reason,'full');assert.equal(s.charges,2);
  assert.equal(s.activate({nades:2}).nades,3);s.update(35);
  assert.equal(s.activate({nades:0}).nades,2);s.update(9999);
  assert.equal(s.charges,0);s.addCharge();assert.equal(s.charges,1);
  for(let i=0;i<5;i++)s.addCharge();assert.equal(s.charges,3);
});
test('side rewards give distinct bounded resources and only relay adds a support charge',()=>{
  assert.deepEqual(fieldReward('cache',{hp:95,shield:50,nades:3,intel:4}),{hp:100,shield:60,nades:3,intel:4,charge:0});
  assert.deepEqual(fieldReward('intel',{hp:90,shield:20,nades:1,intel:4}),{hp:90,shield:20,nades:1,intel:30,charge:0});
  assert.equal(fieldReward('relay').charge,1);assert.equal(fieldReward('relay').intel,0);
});
test('invalid time cannot alter cooldown or spend charges',()=>{
  const s=new TacticalSupport('recon');s.activate();s.update(-30);s.update(NaN);
  assert.equal(s.cooldown,40);assert.equal(s.charges,1);
});
