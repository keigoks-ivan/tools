import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from './scenarios.mjs';
import { OPERATION_RULES, operationFor } from './operations.mjs';

const TYPES = new Set(['line','flank','support','sniper','heavy']);
const BONUS_IDS = new Set(['squad','frontline','speed','precision','resource','grenadier']);
const sample = (operation, mode = 'defend') => Array.from({length:4},(_,w) => Array.from({length:14},(_,i) => [operation.enemyType(w+1,i,mode),operation.spawnSide(w+1,i,mode)]));

test('all seven battlefields offer three distinct bilingual unlocked operations with bounded real gameplay modifiers', () => {
  assert.deepEqual(Object.keys(OPERATION_RULES).sort(),SCENARIOS.map(s=>s.id).sort());
  const ids = new Set();
  for (const s of SCENARIOS) {
    const rules = OPERATION_RULES[s.id]; assert.equal(rules.variants.length,3);
    for (let v=0;v<3;v++) {
      const op=operationFor(s.id,90,v);
      assert.equal(op.variantIndex,v); assert.equal(op.waveCount,4); assert.equal(op.maxActors,14);
      assert(!ids.has(op.variantId)); ids.add(op.variantId);
      for (const [text,minimum] of [[op.name,2],[op.brief,30],[op.bonusGoal,8]]) for (const lang of ['zh','en']) assert(typeof text[lang]==='string'&&text[lang].length>minimum,`${s.id}/${v}/${lang}`);
      for (const [key,low,high] of [['countMultiplier',.9,1.15],['spawnInterval',.9,1.5],['reinforceInterval',24,38],['supplyMultiplier',.7,1.2],['pressureMultiplier',.9,1.15],['captureMultiplier',.8,1.2]]) assert(Number.isFinite(op[key])&&op[key]>=low&&op[key]<=high,`${s.id}/${v}/${key}`);
      assert(BONUS_IDS.has(op.bonusId)); assert.equal(op.locked,undefined);
    }
    assert.equal(new Set(rules.variants.map(v=>v.doctrine)).size,3);
  }
  assert.equal(ids.size,21);
});

test('seeded enemy rosters and approach directions are reproducible independent of call order or other battles', () => {
  for (const s of SCENARIOS) for (let v=0;v<3;v++) for (const mode of ['defend','assault']) {
    const first=operationFor(s.id,125011,v),again=operationFor(s.id,125011,v),expected=sample(first,mode);
    operationFor('rail',843,v).enemyType(3,10,mode);
    for(let w=4;w>0;w--)for(let i=13;i>=0;i--){assert.equal(again.enemyType(w,i,mode),expected[w-1][i][0]);assert.equal(again.spawnSide(w,i,mode),expected[w-1][i][1]);}
    assert.deepEqual(sample(first,mode),expected);
  }
});

test('explicit operation selection is independent of seed; defaults follow seed modulo three', () => {
  for(const seed of [0,1,2,3,16,999,0xffffffff]){
    assert.equal(operationFor('pass',seed).variantIndex,(seed>>>0)%3);
    for(let v=0;v<3;v++)assert.equal(operationFor('pass',seed,v).variantIndex,v);
  }
  assert.deepEqual(sample(operationFor('forest','operation-2026',2)),sample(operationFor('forest','operation-2026',2)));
  assert.notEqual(operationFor('forest','operation-2026',2).seed,operationFor('forest','operation-2027',2).seed);
});

test('each battlefield has real changes in wave pacing, roster and approach rather than cosmetic operation names', () => {
  const signatures=[];
  for(const s of SCENARIOS){
    const operations=Array.from({length:3},(_,v)=>operationFor(s.id,20261009,v));
    assert.equal(new Set(operations.map(op=>JSON.stringify(sample(op)))).size,3,`${s.id}: variants must change attackers`);
    assert.equal(new Set(operations.map(op=>op.spawnInterval)).size,3,`${s.id}: deployment pace differs`);
    assert.equal(new Set(operations.map(op=>op.reinforceInterval)).size,3,`${s.id}: reinforcement pace differs`);
    signatures.push(JSON.stringify(operations.map(op=>({wave:sample(op),spawn:op.spawnInterval,reinforce:op.reinforceInterval,capture:op.captureMultiplier}))));
  }
  assert.equal(new Set(signatures).size,7,'maps have different combat signatures');
  for(const s of SCENARIOS)for(let v=0;v<3;v++){
    const waves=Array.from({length:8},(_,seed)=>JSON.stringify(sample(operationFor(s.id,seed,v))));
    assert(new Set(waves).size>4,`${s.id}/${v}: seeds need different wave plans`);
  }
});

test('every seeded plan keeps finite roles, three physical approaches and a fair opening without first-wave armor', () => {
  for(const s of SCENARIOS)for(let v=0;v<3;v++)for(let seed=0;seed<24;seed++)for(const mode of ['defend','assault']){
    const op=operationFor(s.id,seed,v),directions=new Set();
    for(let wave=1;wave<=4;wave++)for(let index=0;index<28;index++){
      const role=op.enemyType(wave,index,mode),side=op.spawnSide(wave,index,mode);
      assert(TYPES.has(role));assert([0,1,2].includes(side));directions.add(side);
      if(index===0)assert.equal(role,'line');
      if(index<3)assert(!['heavy','sniper'].includes(role));
      if(wave===1)assert.notEqual(role,'heavy');
    }
    assert.equal(directions.size,3,`${s.id}/${v}: each approach gets used`);
    assert.equal(op.maxActors,14);
  }
});

test('close-quarter variants avoid snipers; rationed infiltration excludes armor; ranged variants actually field snipers', () => {
  for(const [scene,v]of [['city',1],['forest',2],['airfield',1],['underground',0],['underground',1],['underground',2]])for(let seed=0;seed<6;seed++)assert(!sample(operationFor(scene,seed,v)).flat().some(a=>a[0]==='sniper'));
  for(let seed=0;seed<6;seed++)assert(!sample(operationFor('underground',seed,2)).flat().some(a=>a[0]==='heavy'));
  for(const [scene,v]of [['forest',1],['dam',0],['airfield',0]])for(let seed=0;seed<6;seed++)assert(sample(operationFor(scene,seed,v)).flat().some(a=>a[0]==='sniper'));
});

test('bonus goals have measurable IDs, mode-appropriate frontline alternatives and concrete speed thresholds', () => {
  const seen=new Set();
  for(const s of SCENARIOS)for(let v=0;v<3;v++){
    const op=operationFor(s.id,1,v);seen.add(op.bonusId);
    if(op.bonusId==='frontline'){
      assert.equal(op.bonusIdByMode.defend,'frontline');assert.notEqual(op.bonusIdByMode.assault,'frontline');
      assert(BONUS_IDS.has(op.bonusIdByMode.assault));assert(op.bonusGoalByMode.assault.en.includes('squadmates'));
    }
    if(op.bonusId==='speed'){
      assert(op.bonusTime.defend>=150&&op.bonusTime.defend<=210);assert(op.bonusTime.assault>=120&&op.bonusTime.assault<=180);
      assert(op.bonusGoal.en.includes(String(op.bonusTime.defend)));assert(op.bonusGoal.en.includes(String(op.bonusTime.assault)));
    }
  }
  assert.deepEqual([...seen].sort(),[...BONUS_IDS].sort());
});

test('bad persisted options recover safely, and callers cannot mutate shared operation definitions', () => {
  const op=operationFor('__proto__',NaN,Infinity);
  assert.equal(op.sceneId,'pass');assert.equal(op.seed,1);assert.equal(op.variantIndex,1);
  assert(TYPES.has(op.enemyType(NaN,Infinity)));assert([0,1,2].includes(op.spawnSide(-3,-1)));
  assert(Object.isFrozen(OPERATION_RULES));assert(Object.isFrozen(OPERATION_RULES.pass.variants));assert(Object.isFrozen(op));assert(Object.isFrozen(op.name));
  assert.throws(()=>{OPERATION_RULES.pass.variants[0].captureMultiplier=0;},TypeError);
  assert.throws(()=>{op.name.zh='corrupt';},TypeError);
  assert.equal(operationFor('pass',1,0).captureMultiplier,1.1);
});
