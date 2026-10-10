// Local, cosmetic progression. No storage, renderer, wall clock or combat buffs.
// Persist the returned records once after an actual sortie ends. Create sortieId
// at deployment and reuse it when reopening the result; retries need a new ID.
import { SCENARIOS, MODES, DIFFICULTIES } from './scenarios.mjs';
import { OPERATION_RULES } from './operations.mjs';

const words = (zh, en) => ({ zh, en });
const challenge = (id, name, detail, title, scope = 'sortie', target = 1) =>
  ({ id, name, detail, title, scope, target });
export const SERVICE_CHALLENGES = [
  challenge('squad', words('一個都帶回來','Bring everyone home'), words('完成一次作戰，三名隊友全部生還。','Complete an operation with all three squadmates alive.'), words('小隊守護者','Squad guardian')),
  challenge('bonus', words('命令之外','Beyond the orders'), words('完成作戰並達成所選方案的額外目標。','Complete an operation and its selected plan’s bonus objective.'), words('任務專家','Mission specialist')),
  challenge('side', words('多走一條路','The extra mile'), words('完成作戰，且至少完成一項戰場側任務。','Complete an operation and at least one battlefield side task.'), words('前線巡查員','Field scout')),
  challenge('rifle', words('步槍勤務','Rifle duty'), words('單場用步槍擊倒至少 8 名敵軍並完成作戰。','Defeat at least eight enemies with the rifle in one completed operation.'), words('步槍手','Rifleman')),
  challenge('pistol', words('最後一把槍','The last weapon'), words('單場用手槍擊倒至少 3 名敵軍並完成作戰。','Defeat at least three enemies with the pistol in one completed operation.'), words('近身衛士','Close protector')),
  challenge('smg', words('短距離突破','Close-range breakthrough'), words('單場用衝鋒槍擊倒至少 8 名敵軍並完成作戰。','Defeat at least eight enemies with the SMG in one completed operation.'), words('突擊手','Assaulter')),
  challenge('grenadier', words('破開火線','Break the firing line'), words('單場用手榴彈擊倒至少 5 名敵軍並完成作戰。','Defeat at least five enemies with grenades in one completed operation.'), words('擲彈兵','Grenadier')),
  challenge('no_supply', words('帶著現有物資','What we carried'), words('完成作戰，全程不使用補給站。波間整備不算使用補給站。','Complete an operation without using a supply station. Between-stage resupply does not count as a station use.'), words('野戰耐力','Field endurance')),
  challenge('no_support', words('靠這一個班','One squad is enough'), words('完成作戰，全程不呼叫戰場支援。','Complete an operation without calling battlefield support.'), words('獨立勤務','Independent duty')),
  challenge('precision', words('每一發有去處','Every round counts'), words('完成作戰，至少射擊 10 發且命中率達 60%。','Complete an operation with at least ten shots fired and at least 60% accuracy.'), words('穩定射手','Steady marksman')),
  challenge('veteran', words('老兵的責任','Veteran responsibility'), words('以老兵難度完成一次作戰。','Complete an operation on Veteran difficulty.'), words('灰線老兵','Greyline veteran')),
  challenge('costly', words('有代價，仍完成','Costly, but complete'), words('在苦勝結局下完成作戰：有人未生還，或守衛防線低於 75%。','Complete an operation with a costly ending: a squadmate did not survive, or defense integrity finished below 75%.'), words('最後守望','Last watch')),
  challenge('three_plans', words('一地三策','Three plans, one field'), words('同一戰場的三個作戰方案各通關一次；模式與難度可自由選擇。','Clear all three operation plans on one battlefield. Modes and difficulties may differ.'), words('戰場精通者','Battlefield master'), 'mastery', 3),
  challenge('seven_fields', words('七條灰線','Seven greylines'), words('七個戰場各通關一次；模式、方案與難度可自由選擇。','Clear each of the seven battlefields. Choose any mode, plan and difficulty.'), words('七線守望者','Keeper of seven lines'), 'mastery', 7),
];
const KINDS = new Set(['normal', 'remix', 'daily']);
const MEDALS = new Set(['bronze', 'silver', 'gold']);
const fields = SCENARIOS.map(scene => scene.id);
const has = (object, key) => Object.hasOwn(object || {}, key);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const number = (value, cap = 1e9) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(cap, value)) : 0;
const count = (value, cap = 1e9) => Math.floor(number(value, cap));
const measured = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const textId = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,180}$/.test(value) ? value : null;
const seedOf = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff ? value : null;
function dayKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value ? value : null;
}
function entryKey(report) {
  const context = `${report.sceneId}.${report.mode}.${report.difficulty}.${report.variantIndex}`;
  if (report.kind === 'daily') return `daily:${report.dailyKey}`;
  return `${report.kind}:${context}${report.kind === 'remix' ? `:${report.remixId}` : ''}`;
}
function qualified(report) {
  if (!report.won) return [];
  const t = report.telemetry;
  const checks = {
    squad: t.alliesAlive === 3, bonus: report.bonus, side: t.sideCompleted >= 1,
    rifle: t.weaponKills.rifle >= 8, pistol: t.weaponKills.pistol >= 3, smg: t.weaponKills.smg >= 8,
    grenadier: t.grenadeKills >= 5, no_supply: t.supplyUses === 0, no_support: t.supportUses === 0,
    precision: t.shots >= 10 && report.accuracy >= .6,
    veteran: report.difficulty === 'veteran', costly: report.ending === 'costly',
  };
  return SERVICE_CHALLENGES.filter(c => checks[c.id]).map(c => c.id);
}

/** plan: {sortieId,kind,seed,variantIndex,remixId?,dailyKey?}. A daily key is YYYY-MM-DD.
 * Counters without measured telemetry remain null; absence cannot earn a zero-use badge.
 * award comes from evaluateSortie. Victory is always read from the real Mission status.
 */
export function evaluateService(mission, telemetry = {}, plan = {}, award = {}) {
  if (!textId(plan.sortieId || telemetry.sortieId)) throw new TypeError('Service records require a stable sortieId created at deployment.');
  if (!fields.includes(mission?.scene) || !has(MODES, mission.mode) || !has(DIFFICULTIES, mission.difficulty)) throw new TypeError('Unknown service mission.');
  if (!['won','lost'].includes(mission.status)) throw new TypeError('Only a settled sortie belongs in the service record.');
  const kind = KINDS.has(plan.kind) ? plan.kind : 'normal';
  const seed = seedOf(plan.seed ?? mission.operation?.seed);
  const dailyKey = kind === 'daily' ? dayKey(plan.dailyKey) : null;
  if (kind === 'daily' && (seed === null || !dailyKey)) throw new TypeError('Daily records require a date key and the actual uint32 mission seed.');
  const variantIndex = count(plan.variantIndex ?? mission.operation?.variantIndex, 2);
  const shots = count(telemetry.shots), hits = Math.min(shots, count(telemetry.hits));
  const alliesAlive = measured(telemetry.alliesAlive) ? count(telemetry.alliesAlive, 3) : null;
  const counter = key => measured(telemetry[key]) ? count(telemetry[key]) : null;
  const damageTaken = measured(telemetry.damageTaken) ? number(telemetry.damageTaken) : null;
  const won = mission.status === 'won';
  const integrity = number(mission.integrity, 100);
  const costly = (alliesAlive !== null && alliesAlive < 3) || (mission.mode === 'defend' && integrity < 75);
  const ending = won ? (costly ? 'costly' : alliesAlive === 3 ? 'win' : 'unverified') : 'loss';
  const report = {
    version: 1, sortieId: plan.sortieId || telemetry.sortieId, kind, sceneId: mission.scene,
    mode: mission.mode, difficulty: mission.difficulty, variantIndex,
    seed, dailyKey, remixId: textId(plan.remixId) || 'field-remix',
    won, status: won ? 'won' : 'lost', score: count(award.score), time: number(mission.time),
    kills: count(mission.kills), integrity, medal: won && MEDALS.has(award.medal) ? award.medal : null,
    bonus: won && award.bonus === true, ending, accuracy: shots ? hits / shots : 0,
    telemetry: { shots, hits, alliesAlive, grenadeKills: counter('grenadeKills'), supplyUses: counter('supplyUses'),
      supportUses: counter('supportUses'), sideCompleted: counter('sideCompleted'), damageTaken,
      weaponKills: Object.fromEntries(['rifle','pistol','smg'].map(weapon => [weapon,count(telemetry.weaponKills?.[weapon])])) },
  };
  report.key = entryKey(report); report.challengeIds = qualified(report);
  return report;
}

const totalKeys = ['sorties','wins','losses','kills','grenadeKills','shots','hits','sideCompleted','supplyUses','supportUses','damageTaken'];
function emptyMastery() { return { wins: 0, modes: { defend: 0, assault: 0 }, variants: [0,0,0] }; }
function readRecords(raw) {
  const source = object(raw);
  const totals = Object.fromEntries(totalKeys.map(key => [key,number(source.totals?.[key])]));
  const mastery = Object.fromEntries(fields.map(id => {
    const old = object(source.mastery?.[id]);
    return [id,{ wins:count(old.wins), modes:{defend:count(old.modes?.defend),assault:count(old.modes?.assault)},
      variants:[0,1,2].map(index => count(old.variants?.[index])) }];
  }));
  const entries = {};
  for (const [key, entry] of Object.entries(object(source.entries))) {
    if (!/^(normal|remix|daily):[a-zA-Z0-9_.:-]+$/.test(key)) continue;
    const e = object(entry);
    if (!fields.includes(e.sceneId) || !has(MODES,e.mode) || !has(DIFFICULTIES,e.difficulty) || !KINDS.has(e.kind)) continue;
    const variantIndex=count(e.variantIndex,2), seed=seedOf(e.seed), dailyKey=dayKey(e.dailyKey);
    if (e.kind === 'daily' && (!dailyKey || seed === null)) continue;
    const best = object(e.best), bestScore=measured(best.score) ? count(best.score) : null;
    entries[key]={kind:e.kind,sceneId:e.sceneId,mode:e.mode,difficulty:e.difficulty,variantIndex,
      remixId:textId(e.remixId)||'field-remix',seed,dailyKey,sorties:count(e.sorties),wins:count(e.wins),
      best:bestScore===null?null:{score:bestScore,time:number(best.time),medal:MEDALS.has(best.medal)?best.medal:null,
        seed:seedOf(best.seed),sortieId:textId(best.sortieId),bonus:best.bonus===true,legacy:best.legacy===true,
        ending:['win','costly'].includes(best.ending)?best.ending:'unverified'} };
  }
  const daily = {};
  for (const [key, entry] of Object.entries(object(source.daily))) {
    const e=object(entry),seed=seedOf(e.seed);
    if (!dayKey(key) || seed===null || !fields.includes(e.sceneId) || !has(MODES,e.mode) || !has(DIFFICULTIES,e.difficulty)) continue;
    daily[key]={seed,sceneId:e.sceneId,mode:e.mode,difficulty:e.difficulty,variantIndex:count(e.variantIndex,2),
      remixId:textId(e.remixId)||'field-remix',completed:e.completed===true,key:`daily:${key}`};
  }
  const challenges = {};
  for (const c of SERVICE_CHALLENGES) {
    const old = object(source.challenges?.[c.id]);
    if (old.complete === true) challenges[c.id]={complete:true,sortieId:textId(old.sortieId)};
  }
  const seenSorties = {};
  for (const [id,value] of Object.entries(object(source.seenSorties))) if(textId(id)&&value===true)seenSorties[id]=true;
  return {version:1,legacyImported:source.legacyImported===true,totals,entries,daily,mastery,challenges,seenSorties};
}
function bestOf(report) { return {score:report.score,time:report.time,medal:report.medal,seed:report.seed,sortieId:report.sortieId,bonus:report.bonus,ending:report.ending,legacy:false}; }
const medalRank = value => ({bronze:1,silver:2,gold:3}[value] || 0);
function isBetter(report, old) {
  return !old || report.score>old.score || (report.score===old.score &&
    (medalRank(report.medal)>medalRank(old.medal) || (medalRank(report.medal)===medalRank(old.medal)&&report.time<old.time)));
}

/** Import greyline.records once, before recording any new-system sortie.
 * Legacy records establish wins, bests and plan mastery, but contain neither
 * measured telemetry nor individual sorties. Never infer kills, accuracy,
 * survival, side tasks or bonus challenge completion from their score/medal.
 * Legacy score/time may be independent old bests; mark that provenance instead
 * of pretending that we know a matching seed or an individual sortie ID.
 */
export function migrateLegacyService(raw, legacyRecords) {
  const records=readRecords(raw);
  if(records.legacyImported)return records;
  records.legacyImported=true;
  for(const [legacyKey,value] of Object.entries(object(legacyRecords))) {
    const match=/^([a-z]+)\.(defend|assault)\.(recruit|regular|veteran)\.([012])$/.exec(legacyKey);
    if(!match||!fields.includes(match[1]))continue;
    const entry=object(value);
    if(!Number.isSafeInteger(entry.wins)||entry.wins<=0||entry.wins>1e9||!measured(entry.score)||!measured(entry.time))continue;
    const [,sceneId,mode,difficulty,variant]=match,variantIndex=Number(variant),key=`normal:${legacyKey}`;
    const wins=entry.wins,old=records.entries[key];
    const candidate={score:count(entry.score),time:number(entry.time),medal:MEDALS.has(entry.medal)?entry.medal:null,
      seed:null,sortieId:null,bonus:false,ending:'unverified',legacy:true};
    records.entries[key]={kind:'normal',sceneId,mode,difficulty,variantIndex,remixId:'field-remix',
      seed:old?.seed??null,dailyKey:null,sorties:(old?.sorties||0)+wins,wins:(old?.wins||0)+wins,
      best:isBetter(candidate,old?.best)?candidate:old.best};
    records.totals.sorties+=wins;records.totals.wins+=wins;
    const m=records.mastery[sceneId];m.wins+=wins;m.modes[mode]+=wins;m.variants[variantIndex]+=wins;
  }
  if(Object.values(records.mastery).some(m=>m.variants.every(count=>count>0)))records.challenges.three_plans||={complete:true,sortieId:null};
  if(fields.every(id=>records.mastery[id].wins>0))records.challenges.seven_fields||={complete:true,sortieId:null};
  return records;
}

/** Returns a new JSON-safe record. Duplicate settlement is a no-op. A daily date
 * pins seed AND mission context on its first actual sortie, including a failure.
 * Changing a daily seed/context cannot feed totals, challenges or mastery.
 */
export function recordService(raw, report) {
  const records=readRecords(raw);
  if (!report || !textId(report.sortieId) || records.seenSorties[report.sortieId]) return records;
  // Re-evaluate evidence rather than trusting externally supplied challenge IDs.
  let verified;
  try {
    verified=evaluateService({scene:report.sceneId,mode:report.mode,difficulty:report.difficulty,
      status:report.won===true?'won':'lost',time:report.time,kills:report.kills,integrity:report.integrity},report.telemetry,report,
      {score:report.score,medal:report.medal,bonus:report.bonus});
  } catch { return records; }
  const r=verified;
  if(r.kind==='daily') {
    const previous=records.daily[r.dailyKey];
    if(previous&&['seed','sceneId','mode','difficulty','variantIndex','remixId'].some(key=>previous[key]!==r[key]))return records;
    records.daily[r.dailyKey]={seed:r.seed,sceneId:r.sceneId,mode:r.mode,difficulty:r.difficulty,variantIndex:r.variantIndex,
      remixId:r.remixId,completed:!!previous?.completed||r.won,key:r.key};
  }
  records.seenSorties[r.sortieId]=true;
  const t=records.totals;t.sorties++;t[r.won?'wins':'losses']++;t.kills+=r.kills;
  for(const key of totalKeys.filter(key=>!['sorties','wins','losses','kills'].includes(key)))t[key]+=number(r.telemetry[key]);
  const old=records.entries[r.key];
  records.entries[r.key]={kind:r.kind,sceneId:r.sceneId,mode:r.mode,difficulty:r.difficulty,variantIndex:r.variantIndex,
    remixId:r.remixId,seed:r.seed,dailyKey:r.dailyKey,sorties:(old?.sorties||0)+1,wins:(old?.wins||0)+(r.won?1:0),
    best:r.won&&isBetter(r,old?.best)?bestOf(r):old?.best||null};
  if(r.won) {
    const m=records.mastery[r.sceneId]||emptyMastery();m.wins++;m.modes[r.mode]++;m.variants[r.variantIndex]++;
    records.mastery[r.sceneId]=m;
    for(const id of qualified(r))if(!records.challenges[id])records.challenges[id]={complete:true,sortieId:r.sortieId};
    if(Object.values(records.mastery).some(m=>m.variants.every(count=>count>0)))records.challenges.three_plans||={complete:true,sortieId:r.sortieId};
    if(fields.every(id=>records.mastery[id].wins>0))records.challenges.seven_fields||={complete:true,sortieId:r.sortieId};
  }
  return records;
}

function sortieProgress(id, records) {
  if(records.challenges[id]?.complete)return 1;
  // Partial progress is evidence from successful sorties only. Failed kills are
  // still in totals, but cannot imply that a completion challenge was almost won.
  if(id==='three_plans')return Math.max(...fields.map(field=>records.mastery[field].variants.filter(Boolean).length));
  if(id==='seven_fields')return fields.filter(field=>records.mastery[field].wins>0).length;
  return 0;
}
export function serviceSummary(raw, language='zh') {
  const lang=language==='en'?'en':'zh',records=readRecords(raw);
  const challenges=SERVICE_CHALLENGES.map(c=>({id:c.id,name:c.name[lang],detail:c.detail[lang],title:c.title[lang],
    scope:c.scope,target:c.target,progress:records.challenges[c.id]?.complete?c.target:sortieProgress(c.id,records),
    complete:records.challenges[c.id]?.complete===true}));
  const battlefields=SCENARIOS.map(scene=>{
    const m=records.mastery[scene.id],plans=OPERATION_RULES[scene.id].variants.map((plan,index)=>
      ({variantIndex:index,name:plan.name[lang],wins:m.variants[index],complete:m.variants[index]>0}));
    return {sceneId:scene.id,name:scene.name[lang],wins:m.wins,modes:{...m.modes},plans,
      progress:plans.filter(plan=>plan.complete).length,target:3,complete:plans.every(plan=>plan.complete)};
  });
  const daily=Object.entries(records.daily).sort(([a],[b])=>b.localeCompare(a)).map(([dailyKey,item])=>({
    dailyKey,...item,sceneName:SCENARIOS.find(scene=>scene.id===item.sceneId).name[lang],best:records.entries[item.key]?.best||null,
  }));
  const bests=Object.entries(records.entries).filter(([,entry])=>entry.best).map(([key,entry])=>({key,...entry,
    sceneName:SCENARIOS.find(scene=>scene.id===entry.sceneId).name[lang],modeName:MODES[entry.mode][lang],
    difficultyName:DIFFICULTIES[entry.difficulty].name[lang],planName:OPERATION_RULES[entry.sceneId].variants[entry.variantIndex].name[lang]}));
  const missingField=battlefields.find(field=>field.wins===0);
  const startedField=battlefields.filter(field=>field.progress>0&&!field.complete).sort((a,b)=>b.progress-a.progress)[0];
  let nextGoal;
  if(missingField)nextGoal={id:'seven_fields',name:lang==='zh'?`下一條灰線：${missingField.name}`:`Next greyline: ${missingField.name}`,
    detail:lang==='zh'?'選擇任一方案與難度通關，失敗不會推進七場精通。':'Clear any plan and difficulty. Failed sorties do not advance battlefield mastery.',
    progress:battlefields.filter(field=>field.wins>0).length,target:7,sceneId:missingField.sceneId,variantIndex:0};
  else if(startedField){const plan=startedField.plans.find(plan=>!plan.complete);nextGoal={id:'three_plans',
    name:lang==='zh'?`${startedField.name}：${plan.name}`:`${startedField.name}: ${plan.name}`,
    detail:lang==='zh'?'完成尚未通關的作戰方案，累積這個戰場的三策精通。':'Clear the missing operation plan to advance mastery on this battlefield.',
    progress:startedField.progress,target:3,sceneId:startedField.sceneId,variantIndex:plan.variantIndex};}
  else if(challenges.some(c=>!c.complete)){const c=challenges.find(c=>!c.complete);nextGoal={...c};}
  else if(battlefields.some(field=>!field.complete)){const field=battlefields.find(field=>!field.complete),plan=field.plans.find(p=>!p.complete);
    nextGoal={id:'all_plans',name:lang==='zh'?`精通 ${field.name}`:`Master ${field.name}`,detail:plan.name,
      progress:field.progress,target:3,sceneId:field.sceneId,variantIndex:plan.variantIndex};}
  else {const best=bests.filter(entry=>entry.kind==='normal').sort((a,b)=>a.best.score-b.best.score)[0]||bests[0];
    nextGoal={id:'personal_best',name:lang==='zh'?'下一次個人最佳':'Your next personal best',
      detail:best?(lang==='zh'?`${best.sceneName}・${best.planName}：挑戰 ${best.best.score+100} 分。`:`${best.sceneName} · ${best.planName}: aim for ${best.best.score+100} points.`)
        :(lang==='zh'?'完成下一次作戰，建立第一筆個人最佳。':'Complete your next operation to establish a personal best.'),
      progress:best?.best.score||0,target:(best?.best.score||0)+100,sceneId:best?.sceneId,variantIndex:best?.variantIndex,mode:best?.mode,difficulty:best?.difficulty};}
  return {version:1,language:lang,totals:{...records.totals},challenges,
    earnedCount:challenges.filter(c=>c.complete).length,totalChallenges:challenges.length,
    titles:challenges.filter(c=>c.complete).map(c=>({id:c.id,name:c.title})),
    battlefields,clearedFields:battlefields.filter(field=>field.wins>0).length,
    masteredFields:battlefields.filter(field=>field.complete).length,daily,
    completedDays:daily.filter(item=>item.completed).length,bests,nextGoal};
}
