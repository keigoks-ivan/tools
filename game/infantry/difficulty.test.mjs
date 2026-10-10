import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, DIFFICULTIES, Mission, missionPressurePreview } from './scenarios.mjs';
import { operationFor } from './operations.mjs';
import { replayPlan } from './replay.mjs';

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
  assert.equal(DIFFICULTIES.regular.damage,1.25);assert.equal(DIFFICULTIES.regular.count,1.55);assert.equal(DIFFICULTIES.veteran.damage,1.55);assert.equal(DIFFICULTIES.veteran.count,1.95);assert.equal(DIFFICULTIES.veteran.integrityRepair,0);
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

test('all three levels schedule substantially denser defense than the prior profiles without adding stages',()=>{
  const recruit=clear(make('defend','recruit')),regular=clear(make('defend','regular')),veteran=clear(make('defend','veteran'));
  assert.deepEqual(recruit.counts,[7,11,15,19]);assert.equal(recruit.total,52);
  assert.deepEqual(regular.counts,[11,16,22,28]);assert.equal(regular.total,77);
  assert.deepEqual(veteran.counts,[14,20,27,35]);assert.equal(veteran.total,96);
});

test('compared with the previous release, density, arrival frequency, damage and resource attrition all increase',()=>{
  // Previous shipped behavior is the comparison fixture, not a second set of
  // playable rules. Exercise real Mission arrivals and integrity, not just keys.
  const previous={
    recruit:{count:.9,damage:.8,spawn:1,reinforce:1,heal:100,cooldown:28,delay:4.8,rate:26},
    regular:{count:1.25,damage:1.15,spawn:.84,reinforce:.8,heal:45,cooldown:40,delay:6.5,rate:17},
    veteran:{count:1.6,damage:1.5,spawn:.68,reinforce:.62,heal:30,cooldown:55,delay:8,rate:11},
  };
  for(const level of levels){
    const old=previous[level],current=make('defend',level),legacy=make('defend',level),profile=DIFFICULTIES[level];
    legacy.rules.count=old.count;legacy.rules.damage=old.damage;legacy.baseSpawnInterval=1.15*old.spawn;
    enterWave(current);enterWave(legacy);
    assert(current.pending>legacy.pending,level+' first-wave density');
    let currentArrivals=0,oldArrivals=0;
    for(let frame=0;frame<60;frame++){
      if(current.update(.1,{alive:2}).includes('spawn')){current.spawned();currentArrivals++;}
      if(legacy.update(.1,{alive:2}).includes('spawn')){legacy.spawned();oldArrivals++;}
    }
    assert(currentArrivals>oldArrivals,level+' physical arrivals in six seconds');
    current.integrity=legacy.integrity=100;
    current.update(.1,{alive:2,pressure:2});legacy.update(.1,{alive:2,pressure:2});
    assert(current.integrity<legacy.integrity,level+' real line damage');
    assert(profile.supplyHeal/profile.supplyCooldown<old.heal/old.cooldown,level+' sustainable healing');
    assert(profile.shieldDelay>old.delay&&profile.shieldRate<old.rate,level+' cover recovery');
    assert(profile.reinforceMultiplier<old.reinforce,level+' finite reinforcements arrive sooner');
  }
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

test('every plan and difficulty can exhaust all three sectors of finite reinforcements and still seal cleanup',()=>{
  let runs=0;
  for(const scene of SCENARIOS)for(let variant=0;variant<3;variant++)for(const difficulty of levels){
    const operation=operationFor(scene.id,20261010,variant),m=new Mission({scene:scene.id,mode:'assault',difficulty,operation});
    let totalArrivals=0;
    for(let sector=0;sector<3;sector++){
      m.update(0);totalArrivals+=drainQueue(m,6);
      const budget=m.rules.reinforcementBatches;
      for(let batch=0;batch<budget;batch++){
        let spawned=false;
        for(let frame=0;frame<700&&!spawned;frame++)spawned=m.update(.1,{alive:6}).includes('reinforce');
        assert(spawned,`${scene.id}/${variant}/${difficulty}: allocated batch must arrive`);
        const queued=m.pending;assert(queued>0);assert.equal(m.reinforcementsLeft,budget-batch-1);
        totalArrivals+=drainQueue(m,6);
      }
      assert.equal(m.pending,0);assert.equal(m.reinforcementsLeft,0);
      const cleanup=m.update(.1,{alive:2});assert(!cleanup.includes('reinforce'));assert(m.reinforcementsClosed);
      for(let frame=0;frame<Math.ceil(m.reinforceInterval*1.1/.1);frame++){
        assert(!m.update(.1,{alive:frame%2?1:2}).includes('reinforce'));assert.equal(m.pending,0);
      }
      for(let frame=0;frame<Math.ceil(m.rules.capture/.1)+3&&m.objective===sector;frame++)m.update(.1,{alive:0,near:true,interact:true});
      assert.equal(m.objective,sector+1);
    }
    assert.equal(m.status,'won');assert(totalArrivals>30);assert(m.time<1200,'fully exhausted finite reinforcement plans must end');runs++;
  }
  assert.equal(runs,63);
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

test('pressure preview matches actual wave and sector scheduling for every authored and remix plan',()=>{
  const source=JSON.stringify(DIFFICULTIES);let runs=0;
  for(const scene of SCENARIOS)for(let variant=0;variant<3;variant++)for(const difficulty of levels)for(const mode of ['defend','assault'])for(const kind of ['normal','remix']){
    const plan=replayPlan({scene:scene.id,mode,difficulty,kind,variant,seed:20261010}),preview=missionPressurePreview(plan.choice,plan.operation);
    const m=new Mission({...plan.choice,operation:plan.operation});
    let actualInitial=0,actualMaxReinforcements=0;
    assert.equal(preview.stages.length,mode==='defend'?4:3);
    for(const stage of preview.stages){
      if(mode==='defend')enterWave(m);else m.update(0);
      assert.equal(m.pending,stage.initial);assert.equal(m.spawnInterval,stage.spawnInterval);
      actualInitial+=m.pending;assert.equal(drainQueue(m,6),stage.initial);
      if(mode==='defend'){
        assert.equal(stage.reinforcementInterval,null);assert.equal(stage.reinforcementBatch,0);assert.equal(stage.maxBatches,0);
        m.update(0,{alive:0});
      }else{
        assert.equal(m.reinforceInterval,stage.reinforcementInterval);assert.equal(m.reinforcementsLeft,stage.maxBatches);
        m.reinforceIn=0;
        assert(m.update(0,{alive:6}).includes('reinforce'));
        assert.equal(m.pending,stage.reinforcementBatch);assert.equal(m.reinforcementsLeft,stage.maxBatches-1);
        actualMaxReinforcements+=m.pending*stage.maxBatches;
        drainQueue(m,6);m.update(0,{alive:2});assert(m.reinforcementsClosed);
        // The displayed bound does not require every batch to actually spawn.
        assert.equal(m.reinforcementsLeft,0);m.capture=m.rules.capture-.05;
        m.update(.1,{alive:0,near:true,interact:true});
      }
      assert(stage.initial>0&&stage.spawnInterval>0);
      assert(Number.isFinite(stage.maxReinforcements));
    }
    assert.deepEqual(preview.initialCounts,preview.stages.map(stage=>stage.initial));
    assert.equal(preview.totalInitial,actualInitial);assert.equal(preview.maxReinforcements,actualMaxReinforcements);
    assert.equal(preview.totalMaximum,actualInitial+actualMaxReinforcements);assert.equal(m.status,'won');runs++;
  }
  assert.equal(runs,252);assert.equal(JSON.stringify(DIFFICULTIES),source,'preview never mutates shared rules');
});

test('preview and runtime share finite fallback values for missing or invalid operation parameters',()=>{
  const choice={mode:'assault',difficulty:'regular'},invalid={countMultiplier:Infinity,captureMultiplier:-1,spawnInterval:NaN,reinforceInterval:0};
  const preview=missionPressurePreview(choice,invalid),fallback=missionPressurePreview(choice),m=new Mission({...choice,operation:invalid});
  assert.deepEqual(preview,fallback);m.update(0);
  assert.equal(m.pending,preview.stages[0].initial);assert.equal(m.spawnInterval,preview.stages[0].spawnInterval);
  assert.equal(m.reinforceInterval,preview.stages[0].reinforcementInterval);
  assert.deepEqual(missionPressurePreview(null,null),missionPressurePreview());
  assert.deepEqual(preview.stages.map(stage=>stage.stage),[1,2,3]);
});
