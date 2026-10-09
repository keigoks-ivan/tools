import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSortie, recordSortie } from './medals.mjs';
const mission = { status:'won',mode:'defend',kills:30,integrity:85,time:300 };
test('bonus awards require victory and measured play, including ten fired rounds for accuracy', () => {
  assert.equal(evaluateSortie({...mission,status:'lost'}, {alliesAlive:3}, {bonusId:'squad'}).bonus,false);
  assert.equal(evaluateSortie(mission,{shots:0,hits:0},{bonusId:'precision'}).bonus,false);
  assert.equal(evaluateSortie(mission,{shots:10,hits:5,alliesAlive:3},{bonusId:'precision'}).medal,'gold');
  assert.equal(evaluateSortie(mission,{shots:10,hits:4},{bonusId:'precision'}).bonus,false);
  assert.equal(evaluateSortie({...mission,mode:'assault'},{alliesAlive:1},{bonusId:'frontline',bonusIdByMode:{assault:'squad'}}).bonus,false);
  assert.equal(evaluateSortie(mission,{supplyUses:1},{bonusId:'resource'}).bonus,false);
  assert.equal(evaluateSortie(mission,{grenadeKills:4},{bonusId:'grenadier'}).bonus,false);
  assert.equal(evaluateSortie({...mission,mode:'assault',integrity:100},{alliesAlive:0,supplyUses:1},{bonusId:'resource'}).medal,'bronze');
  assert.equal(evaluateSortie({...mission,mode:'assault'},{alliesAlive:2,supplyUses:1},{bonusId:'resource'}).medal,'silver');
});
test('a slower lower score replay preserves earned medal and previous bests without modifying its source', () => {
  const first=evaluateSortie(mission,{alliesAlive:3},{bonusId:'squad'});
  const records=recordSortie({},'pass.defend.regular.0',mission,first);
  const slower={...mission,time:400,integrity:45};
  const next=recordSortie(records,'pass.defend.regular.0',slower,evaluateSortie(slower,{alliesAlive:0},{bonusId:'squad'}));
  assert.equal(next['pass.defend.regular.0'].medal,'gold');
  assert.equal(next['pass.defend.regular.0'].time,300);
  assert.equal(next['pass.defend.regular.0'].score,first.score);
  assert.equal(records['pass.defend.regular.0'].wins,1);
  assert.equal(next['pass.defend.regular.0'].wins,2);
  assert.equal(recordSortie(next,'other',{...mission,status:'lost'},{won:false}),next);
});
