import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateService, recordService, serviceSummary, migrateLegacyService, SERVICE_CHALLENGES } from './service-record.mjs';
import { CareerBook } from './career-ui.js';
const mission = {scene:'pass',mode:'defend',difficulty:'regular',status:'won',time:150,kills:40,integrity:85};
const telemetry = {shots:40,hits:25,grenadeKills:5,supplyUses:0,supportUses:0,sideCompleted:1,
  alliesAlive:3,weaponKills:{rifle:8,pistol:3,smg:8},damageTaken:40};
const plan = {sortieId:'sortie-1',kind:'normal',seed:123,variantIndex:0};
const award = {score:8000,medal:'gold',bonus:true};
const report = (m={},t={},p={},a={}) => evaluateService({...mission,...m},{...telemetry,...t},{...plan,...p},{...award,...a});

test('only a settled real victory can award service challenges and mastery', () => {
  assert.throws(()=>report({status:'playing'}),/settled/);
  const lost=report({status:'lost'}, {}, {}, {won:true});
  assert.equal(lost.won,false);assert.deepEqual(lost.challengeIds,[]);assert.equal(lost.medal,null);
  const records=recordService({},lost),summary=serviceSummary(records);
  assert.equal(records.totals.sorties,1);assert.equal(records.totals.losses,1);assert.equal(records.totals.kills,40);
  assert.equal(records.totals.grenadeKills,5);assert.equal(summary.clearedFields,0);assert.equal(summary.earnedCount,0);
  assert.equal(records.entries[lost.key].best,null);assert.equal(summary.titles.length,0);
});

test('real successful telemetry earns distinct weapon, side task, accuracy and zero-use badges', () => {
  const r=report({difficulty:'veteran'});
  assert.deepEqual(new Set(r.challengeIds),new Set(['squad','bonus','side','rifle','pistol','smg','grenadier','no_supply','no_support','precision','veteran']));
  const records=recordService({},r);
  assert.equal(records.mastery.pass.variants[0],1);assert.equal(records.mastery.pass.modes.defend,1);
  assert.equal(records.totals.shots,40);assert.equal(records.totals.hits,25);assert.equal(records.totals.sideCompleted,1);
});

test('missing counters and a single accurate round cannot unlock unmeasured completion badges', () => {
  const r=evaluateService(mission,{shots:1,hits:1},plan,{score:100});
  assert.equal(r.accuracy,1);assert.equal(r.telemetry.supplyUses,null);assert.equal(r.ending,'unverified');
  assert.deepEqual(r.challengeIds,[]);
  assert.ok(!report({}, {shots:9,hits:9}).challengeIds.includes('precision'));
  assert.ok(report({}, {shots:10,hits:6}).challengeIds.includes('precision'));
  assert.ok(!report({}, {shots:10,hits:5}).challengeIds.includes('precision'));
  assert.ok(!report({}, {supplyUses:1,supportUses:1}).challengeIds.includes('no_supply'));
  assert.ok(!report({}, {supplyUses:1,supportUses:1}).challengeIds.includes('no_support'));
});

test('reopening a result is idempotent and recording never mutates the input', () => {
  const first=recordService({},report()),saved=JSON.stringify(first);
  const duplicate=recordService(first,report());
  assert.equal(JSON.stringify(first),saved);assert.deepEqual(duplicate,first);
  const retry=recordService(first,report({}, {}, {sortieId:'sortie-2'}));
  assert.equal(first.totals.sorties,1);assert.equal(retry.totals.sorties,2);assert.equal(retry.totals.wins,2);
  assert.equal(Object.keys(retry.challenges).length,Object.keys(first.challenges).length);
});

test('a lower scoring replay cannot overwrite the coherent winning best', () => {
  const high=report(),first=recordService({},high);
  const low=report({time:100,integrity:60},{alliesAlive:1},{sortieId:'sortie-2'},{score:5000,medal:'bronze',bonus:false});
  const second=recordService(first,low);
  assert.equal(second.entries[high.key].best.score,8000);assert.equal(second.entries[high.key].best.time,150);
  assert.equal(second.entries[high.key].best.medal,'gold');assert.equal(second.entries[high.key].best.sortieId,'sortie-1');
  const failure=recordService(second,report({status:'lost'}, {}, {sortieId:'sortie-3'}, {score:90000}));
  assert.equal(failure.entries[high.key].best.score,8000);assert.equal(failure.entries[high.key].wins,2);
});

test('normal, remix and daily scores are separate even with the same mission and seed', () => {
  let records={};
  for(const [index,kind] of ['normal','remix','daily'].entries())records=recordService(records,report({}, {},
    {kind,sortieId:`kind-${index}`,dailyKey:'2026-10-10',remixId:'fog-low-ammo'}));
  assert.equal(Object.keys(records.entries).length,3);assert.ok(records.entries['daily:2026-10-10']);
  assert.equal(records.totals.sorties,3);assert.equal(serviceSummary(records).completedDays,1);
  const remix=recordService(records,report({}, {}, {kind:'remix',remixId:'no-support',sortieId:'other-remix'}));
  assert.equal(Object.keys(remix.entries).length,4);
});

test('daily failures pin seed and context without completing the day; legitimate retries retain one best', () => {
  const daily={kind:'daily',dailyKey:'2026-10-10',sortieId:'daily-loss',seed:42};
  const lost=report({status:'lost'}, {}, daily);
  let records=recordService({},lost);
  assert.equal(records.daily['2026-10-10'].seed,42);assert.equal(records.daily['2026-10-10'].completed,false);
  assert.equal(serviceSummary(records).completedDays,0);
  const afterSpoof=recordService(records,report({}, {}, {...daily,sortieId:'bad-seed',seed:43}));
  assert.deepEqual(afterSpoof,records);
  assert.deepEqual(recordService(records,report({difficulty:'recruit'}, {}, {...daily,sortieId:'bad-difficulty'})),records);
  records=recordService(records,report({}, {}, {...daily,sortieId:'daily-win'}));
  records=recordService(records,report({}, {}, {...daily,sortieId:'daily-low'}, {score:1,medal:'bronze'}));
  assert.equal(records.totals.sorties,3);assert.equal(records.daily['2026-10-10'].completed,true);
  assert.equal(records.entries['daily:2026-10-10'].best.seed,42);assert.equal(records.entries['daily:2026-10-10'].best.score,8000);
  assert.equal(serviceSummary(records).daily.length,1);assert.equal(serviceSummary(records).completedDays,1);
  assert.throws(()=>report({}, {}, {...daily,seed:undefined}),/actual uint32/);
  assert.throws(()=>report({}, {}, {...daily,dailyKey:'2026-02-30'}),/date key/);
});

test('costly success is supported both by low defense integrity and by squad losses, with no forced casualty', () => {
  const lowLine=report({integrity:74},{alliesAlive:3});
  assert.equal(lowLine.ending,'costly');assert.ok(lowLine.challengeIds.includes('costly'));assert.ok(lowLine.challengeIds.includes('squad'));
  assert.equal(report({integrity:75},{alliesAlive:3}).ending,'win');
  assert.equal(report({mode:'assault'},{alliesAlive:2}).ending,'costly');
  assert.equal(report({mode:'assault',integrity:0},{alliesAlive:3}).ending,'win');
  assert.ok(!report({status:'lost',integrity:0},{alliesAlive:0}).challengeIds.includes('costly'));
});

test('three-plan and seven-field mastery come only from wins and survive JSON persistence', () => {
  let records=recordService({},report({}, {}, {variantIndex:0}));
  records=recordService(records,report({}, {}, {variantIndex:1,sortieId:'p1'}));
  records=recordService(records,report({status:'lost'}, {}, {variantIndex:2,sortieId:'p2-loss'}));
  assert.equal(serviceSummary(records).challenges.find(c=>c.id==='three_plans').progress,2);
  assert.ok(!records.challenges.three_plans);
  records=recordService(records,report({mode:'assault',difficulty:'recruit'}, {}, {variantIndex:2,sortieId:'p2-win'}));
  assert.ok(records.challenges.three_plans);
  for(const scene of ['city','forest','dam','airfield','underground','rail'])records=recordService(records,report({scene}, {}, {sortieId:`clear-${scene}`}));
  const summary=serviceSummary(JSON.parse(JSON.stringify(records)),'en');
  assert.equal(summary.clearedFields,7);assert.equal(summary.masteredFields,1);assert.ok(records.challenges.seven_fields);
  assert.equal(summary.challenges.find(c=>c.id==='seven_fields').progress,7);
  assert.equal(summary.nextGoal.sceneId,'city');assert.equal(summary.nextGoal.variantIndex,1);
  assert.ok(summary.titles.every(title=>typeof title.name==='string'));
});

test('completed challenge book still suggests missing plans and then an actual personal best', () => {
  let records={};
  for(const [field,scene] of ['pass','city','forest','dam','airfield','underground','rail'].entries())for(let variantIndex=0;variantIndex<3;variantIndex++){
    records=recordService(records,report({scene,difficulty:'veteran',integrity:field===0?65:90}, {}, {sortieId:`${scene}-${variantIndex}`,variantIndex}));
  }
  const summary=serviceSummary(records,'en');
  assert.equal(summary.earnedCount,14);assert.equal(summary.masteredFields,7);
  assert.equal(summary.nextGoal.id,'personal_best');assert.equal(summary.nextGoal.target,8100);
  assert.ok(summary.nextGoal.sceneId);assert.ok(summary.nextGoal.detail.includes('8100'));
});

test('bad saved shapes normalize safely and untrusted challenge lists cannot grant a medal', () => {
  assert.doesNotThrow(()=>serviceSummary({totals:{wins:Infinity},entries:{bad:[]},daily:{'bad-date':null},mastery:null}));
  const low=report({}, {weaponKills:{},grenadeKills:0,shots:0,hits:0,supplyUses:2,supportUses:2,sideCompleted:0,alliesAlive:1}, {}, {bonus:false});
  low.challengeIds=SERVICE_CHALLENGES.map(c=>c.id);
  const records=recordService({},low);
  assert.deepEqual(Object.keys(records.challenges),['costly']);assert.equal(serviceSummary(records).earnedCount,1);
  assert.throws(()=>evaluateService(mission,telemetry,{}),/sortieId/);
  assert.equal(SERVICE_CHALLENGES.length,14);
  for(const c of SERVICE_CHALLENGES)for(const property of ['name','detail','title'])for(const language of ['zh','en'])assert.ok(c[property][language]);
});

test('career UI consumes persisted summary, translates all tabs and restores background/focus on close', () => {
  // DOM seam only: verify data binding and modal lifecycle, without a browser or
  // mocking layout. The parent checks the actual desktop/mobile rendering.
  const nodes=new Map(),events={},background={tagName:'MAIN',inert:false},script={tagName:'SCRIPT',inert:false};
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',attributes:{},focuses:0,scrollTop:10,
      setAttribute(name,value){this.attributes[name]=value;},focus(){this.focuses++;}});
    return nodes.get(selector);
  };
  const root={id:'career',hidden:false,attributes:{},classList:{add(){}},querySelector:node,
    setAttribute(name,value){this.attributes[name]=value;},addEventListener(type,handler){events[type]=handler;}};
  root.parentElement={children:[background,root,script]};
  const before={isConnected:true,focuses:0,focus(){this.focuses++;}},oldDocument=globalThis.document;
  globalThis.document={activeElement:before};
  try{
    let closes=0;const book=new CareerBook(root,{onClose(){closes++;}});
    let records=recordService({},report({}, {}, {kind:'daily',dailyKey:'2026-10-10',sortieId:'ui-daily',seed:42}));
    records=recordService(records,report({}, {}, {sortieId:'ui-normal'}));
    records=recordService(records,report({}, {}, {kind:'remix',remixId:'pincer.surge',sortieId:'ui-remix-1'}));
    records=recordService(records,report({}, {}, {kind:'remix',remixId:'overwatch.supply-delay',sortieId:'ui-remix-2'}));
    book.open({records,language:'en'});
    assert.equal(root.hidden,false);assert.equal(background.inert,true);assert.equal(script.inert,false);
    assert.equal(node('h2').textContent,'Greyline service book');
    assert.ok(node('[data-cb-tabs]').innerHTML.includes('Daily challenges'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Next greyline: Hillside District'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Standard operation'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Battlefield remix'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Daily challenge'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Flanking infiltration + Concentrated assault'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Overwatch positions + Delayed supplies'));
    book.render({language:'zh'});
    assert.ok(node('[data-cb-body]').innerHTML.includes('標準作戰'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('戰場變局'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('每日挑戰'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('雙翼滲透 + 集中突擊'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('遠程警戒 + 補給延誤'));
    book.select('challenges');assert.ok(node('[data-cb-body]').innerHTML.includes('每項打法挑戰'));
    book.render({language:'en'});
    book.select('daily');assert.ok(node('[data-cb-body]').innerHTML.includes('2026-10-10'));
    assert.ok(node('[data-cb-body]').innerHTML.includes('Seed 42'));assert.ok(node('[data-cb-body]').innerHTML.includes('8,000'));
    book.render({language:'zh'});assert.equal(node('h2').textContent,'灰線勤務簿');
    assert.ok(node('[data-cb-body]').innerHTML.includes('種子 42'));
    node('[data-cb-close]').onclick();assert.equal(root.hidden,true);assert.equal(background.inert,false);
    assert.equal(before.focuses,1);assert.equal(closes,1);
    book.close();assert.equal(before.focuses,1,'repeated close does not disturb restored focus');
  }finally{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;}
});

test('legacy migration retains actual wins, normal best and plan mastery without fabricating telemetry', () => {
  const legacy={
    'pass.defend.regular.0':{wins:4,score:12000,time:150,medal:'gold',bonus:true},
    'pass.assault.recruit.1':{wins:2,score:7000,time:130,medal:'silver'},
    'pass.defend.veteran.2':{wins:1,score:15000,time:210,medal:'gold'},
  },saved=JSON.stringify(legacy);
  const records=migrateLegacyService({},legacy),summary=serviceSummary(records);
  assert.equal(JSON.stringify(legacy),saved);assert.equal(records.legacyImported,true);
  assert.equal(records.totals.sorties,7);assert.equal(records.totals.wins,7);assert.equal(records.totals.losses,0);
  assert.equal(records.totals.kills,0);assert.equal(records.totals.shots,0);assert.equal(records.totals.grenadeKills,0);
  assert.equal(records.mastery.pass.wins,7);assert.deepEqual(records.mastery.pass.variants,[4,2,1]);
  assert.deepEqual(records.mastery.pass.modes,{defend:5,assault:2});
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.score,12000);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.time,150);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.medal,'gold');
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.seed,null);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.legacy,true);
  assert.deepEqual(Object.keys(records.challenges),['three_plans']);
  assert.equal(summary.masteredFields,1);assert.equal(summary.clearedFields,1);
  assert.deepEqual(records.daily,{});assert.deepEqual(records.seenSorties,{});
});

test('migration is idempotent through JSON reload and subsequent modern settlements', () => {
  const legacy={'pass.defend.regular.0':{wins:3,score:9000,time:120,medal:'silver'}};
  const first=migrateLegacyService({},legacy),saved=JSON.stringify(first);
  const twice=migrateLegacyService(JSON.parse(saved),legacy);
  assert.deepEqual(twice,first);assert.equal(JSON.stringify(first),saved);
  const modern=recordService(twice,report());assert.equal(modern.totals.wins,4);assert.equal(modern.legacyImported,true);
  const after=migrateLegacyService(modern,{...legacy,'city.defend.regular.0':{wins:8,score:10000,time:150,medal:'gold'}});
  assert.deepEqual(after,modern);assert.equal(after.totals.wins,4);
});

test('all seven old battlefield victories grant only the two mastery challenges', () => {
  const legacy={};
  for(const scene of ['pass','city','forest','dam','airfield','underground','rail'])for(let variant=0;variant<3;variant++)
    legacy[`${scene}.defend.veteran.${variant}`]={wins:1,score:14000,time:140,medal:'gold'};
  const records=migrateLegacyService({},legacy),summary=serviceSummary(records,'en');
  assert.equal(summary.clearedFields,7);assert.equal(summary.masteredFields,7);assert.equal(summary.earnedCount,2);
  assert.deepEqual(Object.keys(records.challenges).sort(),['seven_fields','three_plans']);
  assert.equal(summary.nextGoal.id,'squad','legacy gold and Veteran wins do not imply squad survival or new-system challenge telemetry');
  assert.equal(records.totals.sorties,21);assert.equal(records.totals.wins,21);
});

test('legacy import merges while protecting better modern bests, separate kinds and existing earned challenges', () => {
  const existing=recordService({},report()),before=JSON.stringify(existing);
  const records=migrateLegacyService(existing,{'pass.defend.regular.0':{wins:2,score:7000,time:110,medal:'silver'}});
  assert.equal(JSON.stringify(existing),before);assert.equal(records.totals.wins,3);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.score,8000);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.time,150);
  assert.equal(records.entries['normal:pass.defend.regular.0'].best.legacy,false);
  assert.equal(records.totals.shots,40);assert.equal(records.totals.kills,40);
  assert.ok(records.challenges.squad);assert.ok(records.challenges.bonus);
  const remix=recordService({},report({}, {}, {kind:'remix',remixId:'fog'}));
  const both=migrateLegacyService(remix,{'pass.defend.regular.0':{wins:1,score:9999,time:100,medal:'gold'}});
  assert.equal(Object.keys(both.entries).length,2);assert.equal(both.entries['remix:pass.defend.regular.0:fog'].best.score,8000);
  assert.equal(both.entries['normal:pass.defend.regular.0'].best.score,9999);
});

test('legacy malformed keys, non-wins and invalid numeric records cannot add progress', () => {
  const invalid={
    'bogus.defend.regular.0':{wins:3,score:1000,time:50},
    'pass.invalid.regular.0':{wins:3,score:1000,time:50},
    'pass.defend.constructor.0':{wins:3,score:1000,time:50},
    'pass.defend.regular.3':{wins:3,score:1000,time:50},
    'daily:2026-10-10':{wins:3,score:1000,time:50},
    'pass.defend.regular.0':{wins:0,score:1000,time:50},
    'pass.defend.regular.1':{wins:Infinity,score:1000,time:50},
    'pass.defend.regular.2':{wins:1,score:NaN,time:50},
    'city.assault.regular.0':{wins:1,score:1000,time:-1},
    'city.assault.regular.1':null,
    'city.assault.regular.2':{wins:1.5,score:1000,time:50},
    'forest.defend.regular.0':{wins:'4',score:1000,time:50},
  };
  const records=migrateLegacyService(null,invalid);
  assert.equal(records.totals.sorties,0);assert.equal(Object.keys(records.entries).length,0);
  assert.equal(Object.keys(records.challenges).length,0);assert.equal(records.legacyImported,true);
  assert.doesNotThrow(()=>JSON.stringify(records));assert.doesNotThrow(()=>migrateLegacyService({},[]));
});
