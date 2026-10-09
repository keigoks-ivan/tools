import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, DIFFICULTIES, Mission } from './scenarios.mjs';
import { operationFor } from './operations.mjs';

const levels=['recruit','regular','veteran'];
const make=(mode='defend',difficulty='regular',operation)=>new Mission({mode,difficulty,operation});
function enterWave(m){for(let i=0;i<150&&m.phase==='prepare';i++)m.update(.1);assert.equal(m.phase,'battle');}
function drainQueue(m,alive=2){
  let spawned=0;
  for(let steps=0;steps<1500&&m.pending>0;steps++){
    const events=m.update(.1,{alive:Math.min(alive,spawned)});
    if(events.includes('spawn')){m.spawned();spawned++;}
  }
  assert.equal(m.pending,0,'a finite arrival queue must drain');return spawned;
}
function clear(m){
  const counts=[],paces=[];
  if(m.mode==='defend'){
    for(let w=1;w<=4;w++){
      enterWave(m);assert.equal(m.wave,w);const initial=m.pending;counts.push(initial);paces.push(m.spawnInterval);assert.equal(drainQueue(m),initial);
      for(let i=0;i<30;i++){m.update(.1,{alive:i<15?2:1});assert.equal(m.phase,'battle');assert.equal(m.status,'playing','the final one or two cannot be forgotten');}
      m.update(.1,{alive:0});assert.equal(m.status,w===4?'won':'playing');
    }
  }else{
    for(let sector=0;sector<3;sector++){
      m.update(0);assert.equal(m.objective,sector);const initial=m.pending;counts.push(initial);paces.push(m.spawnInterval);assert.equal(drainQueue(m),initial);
      for(let i=0;i<Math.ceil(m.reinforceInterval*2/.1);i++){
        const events=m.update(.1,{alive:2});assert(!events.includes('reinforce'));assert.equal(m.pending,0,'tracking the last two must never restart incoming troops');assert.equal(m.objective,sector);
      }
      assert(m.reinforcementsClosed);assert.equal(m.reinforcementsLeft,0);
      const limit=Math.ceil(m.rules.capture/.1)+3;
      for(let i=0;i<limit&&m.objective===sector;i++)m.update(.1,{alive:0,near:true,contested:false,interact:true});
      assert.equal(m.objective,sector+1);
    }
    assert.equal(m.status,'won');
  }
  assert(m.time<500,'an efficient clear must remain finite');return {counts,paces,total:counts.reduce((a,b)=>a+b,0)};
}

test('difficulty profiles raise pressure and restrict recovery while retaining a readable learning option',()=>{
  const keys=['damage','count','capture','spawnMultiplier','reinforceMultiplier','integrityRepair','supplyCooldown','supplyUseTime','supplyHeal','supplyShield','shieldDelay','shieldRate','healthFloor','healthRate','fieldHeal','fieldShield','reinforcementBatches','reaction','accuracy','burstRest','planInterval','tacticalTempo'];
  for(const level of levels){const p=DIFFICULTIES[level];for(const key of keys)assert(Number.isFinite(p[key])&&p[key]>=0,level+'/'+key);for(const lang of ['zh','en'])assert(p.brief[lang].length>40);assert(!Object.hasOwn(p,'hp'));assert(!Object.hasOwn(p,'healthMultiplier'));}
  for(const key of ['damage','count','capture','supplyCooldown','supplyUseTime','shieldDelay','reinforcementBatches','tacticalTempo'])assert(DIFFICULTIES.recruit[key]<DIFFICULTIES.regular[key]&&DIFFICULTIES.regular[key]<DIFFICULTIES.veteran[key],key);
  for(const key of ['spawnMultiplier','reinforceMultiplier','integrityRepair','supplyHeal','supplyShield','shieldRate','healthFloor','healthRate','fieldHeal','fieldShield','reaction','accuracy','burstRest','planInterval'])assert(DIFFICULTIES.recruit[key]>DIFFICULTIES.regular[key]&&DIFFICULTIES.regular[key]>DIFFICULTIES.veteran[key],key);
  assert.equal(DIFFICULTIES.regular.damage,1.15);assert.equal(DIFFICULTIES.regular.count,1.25);assert.equal(DIFFICULTIES.veteran.damage,1.5);assert.equal(DIFFICULTIES.veteran.count,1.6);assert.equal(DIFFICULTIES.veteran.integrityRepair,0);
});

test('all seven battlefields, 21 operation plans and three difficulties have finite four-wave and three-sector clears',()=>{
  const original=JSON.stringify(DIFFICULTIES);let runs=0;
  for(const scene of SCENARIOS)for(let variant=0;variant<3;variant++)for(const mode of ['defend','assault']){
    const totals=[];
    for(const level of levels){
      const operation=operationFor(scene.id,20261009,variant),m=new Mission({scene:scene.id,mode,difficulty:level,operation}),stats=clear(m);
      assert.equal(m.waveCount,4);assert.equal(m.scenario.targets.length,3);assert(stats.counts.every((count,i)=>i===0||count>stats.counts[i-1]));assert(stats.paces.every((pace,i)=>i===0||pace<stats.paces[i-1]));totals.push(stats.total);runs++;
    }
    assert(totals[0]<totals[1]&&totals[1]<totals[2],scene.id+'/'+variant+'/'+mode);
  }
  assert.equal(runs,126);assert.equal(JSON.stringify(DIFFICULTIES),original,'effective operation modifiers cannot mutate shared profiles');
});

test('standard and veteran schedule substantially more enemies than the previous forty-enemy defense',()=>{
  const regular=clear(make('defend','regular')),veteran=clear(make('defend','veteran'));
  assert.deepEqual(regular.counts,[9,13,18,23]);assert.deepEqual(veteran.counts,[11,16,22,29]);assert(regular.total>=60);assert(veteran.total>=75);
});

test('the hard fourteen-actor cap blocks arrivals without deleting or multiplying the queued enemies',()=>{
  for(const mode of ['defend','assault'])for(const difficulty of levels){
    const m=make(mode,difficulty);if(mode==='defend')enterWave(m);else m.update(0);
    const pending=m.pending,batches=m.reinforcementsLeft;
    for(let i=0;i<800;i++){const events=m.update(.1,{alive:14,near:true,interact:true});assert(!events.includes('spawn'));assert(!events.includes('reinforce'));assert.equal(m.pending,pending);assert.equal(m.capture,0);}
    assert.equal(m.reinforcementsLeft,batches);const events=m.update(.1,{alive:13});assert(events.includes('spawn'));m.spawned();assert.equal(m.pending,pending-1);
  }
});

test('assault reinforcement budgets are finite, denser on later sectors and cannot stack over an unfinished queue',()=>{
  for(const level of levels){
    const m=make('assault',level),batchSizes=[],intervals=[];
    for(let sector=0;sector<3;sector++){
      m.update(0);drainQueue(m,6);intervals.push(m.reinforceInterval);const batches=m.rules.reinforcementBatches;let arrivals=0;
      for(let batch=0;batch<batches;batch++){
        let reinforced=false;
        for(let i=0;i<500&&!reinforced;i++)reinforced=m.update(.1,{alive:6}).includes('reinforce');
        assert(reinforced);const size=m.pending;arrivals++;if(batch===0)batchSizes.push(size);
        m.reinforceIn=0;const blocked=m.update(.1,{alive:6});assert(!blocked.includes('reinforce'));assert.equal(m.pending,size,'an unspawned queue must not grow');
        drainQueue(m,6);
      }
      assert.equal(arrivals,batches);assert.equal(m.reinforcementsLeft,0);
      for(let i=0;i<800;i++){assert(!m.update(.1,{alive:6}).includes('reinforce'));assert.equal(m.pending,0);}
      for(let i=0;i<120&&m.objective===sector;i++)m.update(.1,{alive:0,near:true,interact:true});assert.equal(m.objective,sector+1);
    }
    assert(batchSizes[0]<batchSizes[1]&&batchSizes[1]<batchSizes[2]);assert(intervals[0]>intervals[1]&&intervals[1]>intervals[2]);assert.equal(m.status,'won');
  }
});

test('an arriving final soldier is not cleanup, while the last two after the queue seal future reinforcements',()=>{
  for(const level of levels){
    const m=make('assault',level);m.update(0);while(m.pending>1)m.spawned();m.reinforceIn=0;
    m.update(.1,{alive:1});assert(!m.reinforcementsClosed);assert.equal(m.pending,1);
    m.spawned();m.reinforceIn=0;assert(!m.update(.1,{alive:2}).includes('reinforce'));assert(m.reinforcementsClosed);assert.equal(m.reinforcementsLeft,0);
    for(let i=0;i<1000;i++){assert.equal(m.pending,0);assert(!m.update(.1,{alive:i%2?1:2}).includes('reinforce'));}assert.equal(m.status,'playing');
  }
});

test('capture waits for all arrivals, loses progress under contest or retreat, and permits an uncontested sector without full annihilation',()=>{
  const m=make('assault');m.update(0);
  for(let i=0;i<100;i++)m.update(.1,{alive:14,near:true,interact:true});assert.equal(m.capture,0);
  while(m.pending)m.spawned();m.capture=2;m.update(.1,{alive:6,near:true,interact:true,contested:true});assert(Math.abs(m.capture-1.95)<1e-9);
  m.capture=2;m.update(.1,{alive:6,near:false});assert(Math.abs(m.capture-1.9)<1e-9);
  m.capture=2;m.update(.1,{alive:6,near:true,interact:false});assert.equal(m.capture,2);
  for(let i=0;i<100&&m.objective===0;i++)m.update(.1,{alive:6,near:true,interact:true,contested:false});assert.equal(m.objective,1,'guards outside the contested area do not force total annihilation');
});

test('wave integrity carries damage forward with profile-specific repair and defeat remains immediate',()=>{
  for(const level of levels){
    const m=make('defend',level);enterWave(m);while(m.pending)m.spawned();m.integrity=50;m.update(.1,{alive:0});assert.equal(m.integrity,50+DIFFICULTIES[level].integrityRepair);
    const defeated=make('defend',level);defeated.integrity=1;assert.deepEqual(defeated.update(.1,{pressure:10}),['lost']);assert.equal(defeated.status,'lost');
    const dead=make('assault',level);assert.deepEqual(dead.update(.1,{dead:true}),['lost']);assert.equal(dead.status,'lost');
  }
});
