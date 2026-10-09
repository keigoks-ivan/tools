// Replayable authored operations. This module has no renderer, clock or global RNG.
// wave is 1-based (assault: sector + 1); index is 0-based within that wave.
// spawnSide: 0 = left approach, 1 = centre, 2 = right approach.
// supplyMultiplier scales the supply-station cooldown: lower means faster resupply.
// The renderer must keep its own 14 living-enemy cap; these plans never raise it.
const MAX_ACTORS = 14;
const TYPES = new Set(['line', 'flank', 'support', 'sniper', 'heavy']);
const words = (zh, en) => ({ zh, en });
const BONUS_GOALS = {
  squad: words('三名隊友全部生還通關', 'Finish with all three squadmates alive'),
  frontline: words('防線完整度至少 80% 通關', 'Finish defense with at least 80% line integrity'),
  precision: words('至少射擊 10 發且命中率至少 45% 通關', 'Finish with at least 10 shots fired and at least 45% accuracy'),
  resource: words('不使用補給站完成作戰', 'Finish without using a supply station'),
  grenadier: words('用手榴彈擊倒至少 5 名敵軍', 'Defeat at least five enemies with grenades'),
};

// Each doctrine has two real compositions, rather than a single uniform roster.
// Special weapons are interleaved with ordinary infantry; the opening is further
// protected by enemyType below. The mirrored approaches are still physical spawns.
const DOCTRINES = {
  roadblock: { rosters: [['line','support','line','heavy','line','sniper','support','line'], ['line','line','support','line','heavy','flank','line','support']], sides: [1,1,0,1,2,1,1,0] },
  mountainPincer: { rosters: [['flank','line','flank','support','flank','line','sniper','flank'], ['line','flank','line','flank','support','flank','line','heavy']], sides: [0,2,0,2,1,0,2,1] },
  convoyRush: { rosters: [['line','flank','line','line','support','line','heavy','line','flank'], ['line','line','line','flank','line','support','line','flank','line']], sides: [1,1,1,0,1,2,1,1,2] },
  cityCrossfire: { rosters: [['support','line','flank','line','sniper','support','flank','line'], ['line','support','flank','support','line','flank','sniper','line']], sides: [0,2,1,2,0,1,0,2] },
  alleySweep: { rosters: [['flank','line','flank','heavy','line','flank','support','line','flank'], ['line','flank','support','flank','line','heavy','flank','line','flank']], sides: [0,0,1,2,2,1,0,2] },
  clinicEvac: { rosters: [['line','support','line','sniper','line','support','line','flank','line'], ['line','line','support','line','support','sniper','line','line','heavy']], sides: [1,0,1,1,2,1,0,1] },
  forestInfiltration: { rosters: [['flank','flank','line','sniper','flank','line','support','flank','line'], ['flank','line','flank','line','flank','sniper','line','support','flank']], sides: [0,2,2,0,2,0,1,2,0] },
  woodlandWatch: { rosters: [['line','sniper','support','line','sniper','flank','support','line','sniper'], ['support','line','sniper','line','support','sniper','line','flank','sniper']], sides: [0,0,2,1,2,2,0,1] },
  trenchAssault: { rosters: [['line','line','flank','heavy','line','flank','support','line','heavy','line'], ['line','flank','line','support','line','heavy','flank','line','line','flank']], sides: [1,0,1,2,1,0,1,2,1] },
  damHighground: { rosters: [['support','line','sniper','support','line','heavy','line','sniper','support'], ['line','support','sniper','line','support','heavy','line','sniper','line']], sides: [0,1,2,0,2,1,2,0] },
  rampContest: { rosters: [['flank','line','support','flank','heavy','line','flank','support','line'], ['line','flank','line','heavy','flank','support','line','flank','line']], sides: [1,2,1,0,0,1,2,1,2] },
  emergencyGate: { rosters: [['line','heavy','support','line','heavy','line','support','flank','line'], ['support','line','heavy','line','support','line','heavy','line','flank']], sides: [1,1,2,1,0,1,2,1,0] },
  apronSuppression: { rosters: [['support','line','sniper','line','support','flank','sniper','line','support','line'], ['line','support','line','sniper','support','line','sniper','flank','line','support']], sides: [0,2,1,0,2,1,2,0,1] },
  hangarBreach: { rosters: [['flank','line','heavy','flank','line','support','flank','line'], ['line','flank','support','line','flank','heavy','line','flank']], sides: [0,0,2,2,1,0,2,1,2] },
  lastDeparture: { rosters: [['line','flank','line','support','line','line','flank','line','sniper','line'], ['line','line','flank','line','support','line','flank','heavy','line','line']], sides: [1,1,0,2,1,1,2,0,1,1] },
  isolationDefense: { rosters: [['heavy','line','support','line','heavy','line','support','line','line'], ['line','support','heavy','line','line','support','line','heavy','line']], sides: [1,0,1,1,2,1,0,1,2] },
  machinerySweep: { rosters: [['flank','line','flank','line','heavy','support','line','flank','line','flank'], ['line','flank','line','support','flank','heavy','line','flank','flank','line']], sides: [0,1,2,2,1,0,0,1,2] },
  rationedInfiltration: { rosters: [['line','support','line','flank','line','line','support','flank','line'], ['line','line','flank','support','line','flank','line','support','line']], sides: [0,1,1,2,1,0,1,2,1] },
  armoredFreight: { rosters: [['heavy','support','line','heavy','line','support','line','sniper','line'], ['line','heavy','support','line','heavy','line','support','line','flank']], sides: [0,1,0,2,1,2,0,1,2] },
  platformPincer: { rosters: [['flank','line','flank','support','line','flank','sniper','line','flank','line'], ['line','flank','support','flank','line','flank','line','heavy','flank','line']], sides: [0,2,0,2,0,1,2,0,2,1] },
  ammunitionTransfer: { rosters: [['support','line','heavy','line','flank','support','line','heavy','line','support'], ['line','support','flank','line','heavy','support','line','flank','line','support']], sides: [1,2,1,0,2,1,0,1,2,0] },
};

function variant(id, name, brief, doctrine, parameters, bonusId, extra = {}) {
  const value = { id, name, brief, doctrine, waveCount: 4, ...parameters, bonusId, ...extra };
  value.bonusGoal = bonusId === 'speed'
    ? words(`守衛戰 ${extra.bonusTime.defend} 秒內／衝鋒戰 ${extra.bonusTime.assault} 秒內通關`, `Clear defense within ${extra.bonusTime.defend}s / assault within ${extra.bonusTime.assault}s`)
    : BONUS_GOALS[bonusId];
  if (bonusId === 'frontline') {
    const assaultBonus = extra.assaultBonus || 'squad';
    value.bonusIdByMode = { defend: 'frontline', assault: assaultBonus };
    value.bonusGoalByMode = { defend: BONUS_GOALS.frontline, assault: BONUS_GOALS[assaultBonus] };
    delete value.assaultBonus;
  }
  return value;
}
const parameters = (countMultiplier, spawnInterval, reinforceInterval, supplyMultiplier, pressureMultiplier, captureMultiplier) =>
  ({ countMultiplier, spawnInterval, reinforceInterval, supplyMultiplier, pressureMultiplier, captureMultiplier });

const rules = {
  pass: { name: words('關隘作戰', 'Pass operations'), variants: [
    variant('tunnel-blockade', words('隧道封鎖', 'Tunnel blockade'), words('主路步兵與後續重裝兵交替推進；補給稍快，防線承受更大壓力，佔領稍慢。', 'Road infantry alternate with later armored troops. Resupply is slightly faster; line pressure and capture time increase.'), 'roadblock', parameters(1.02,1.2,32,.92,1.10,1.10), 'frontline'),
    variant('mountain-pincer', words('山徑包抄', 'Mountain pincer'), words('敵軍偏重兩翼包抄與狙擊；總兵力較少，但增援更頻繁、補給較慢，佔領稍快。', 'Flankers and snipers favor the side trails. Fewer troops arrive, but reinforcements are more frequent and resupply slower; capture is slightly faster.'), 'mountainPincer', parameters(.95,1.05,26,1.08,1,.94), 'squad'),
    variant('convoy-sprint', words('車隊急行', 'Convoy sprint'), words('中央密集步兵短間隔衝鋒，兵力增加；補給與佔領加快，但防線壓力更高。', 'Larger infantry pushes arrive rapidly down the center. Resupply and capture are faster, with higher line pressure.'), 'convoyRush', parameters(1.10,.95,24,.85,1.07,.86), 'speed', { bonusTime: { defend: 180, assault: 150 } }),
  ] },
  city: { name: words('街區作戰', 'District operations'), variants: [
    variant('crossfire', words('街口交叉火力', 'Intersection crossfire'), words('支援兵與包抄兵輪流從三條街道進攻；敵軍稍多、佔領較慢，防線壓力略低。', 'Support troops and flankers alternate among three streets. Enemy numbers and capture time increase slightly; line pressure is lower.'), 'cityCrossfire', parameters(1.05,1.15,28,1,.96,1.08), 'precision'),
    variant('alley-sweep', words('巷道清剿', 'Alley sweep'), words('近距離包抄與重裝兵沿左右巷道交替突破，沒有狙擊兵；兵力更密集，補給與佔領加快。', 'Flankers and heavy infantry alternate through the alleys, without snipers. Denser attacks are balanced by faster resupply and capture.'), 'alleySweep', parameters(1.12,.98,24,.90,1.03,.90), 'grenadier'),
    variant('clinic-evacuation', words('醫療站撤離', 'Clinic evacuation'), words('較少敵軍緩慢接近主路，但每名闖入者對防線傷害更高；補給明顯加快，佔領稍慢。', 'Fewer enemies approach the main road slowly, but each breach damages the line more. Resupply is much faster; capture is slightly slower.'), 'clinicEvac', parameters(.90,1.50,38,.75,1.15,1.05), 'frontline'),
  ] },
  forest: { name: words('林地作戰', 'Woodland operations'), variants: [
    variant('forest-infiltration', words('林間滲透', 'Forest infiltration'), words('包抄兵居多，左右林徑攻勢不規則交替；增援較頻繁、補給較慢，佔領稍快。', 'Flankers dominate, switching irregularly between forest trails. Reinforcements are more frequent and resupply slower; capture is slightly faster.'), 'forestInfiltration', parameters(1,1.20,26,1.12,1,.96), 'squad'),
    variant('watchpost-hunt', words('觀測哨獵殺', 'Watchpost hunt'), words('狙擊兵與支援兵從林間兩側分批進場；敵軍較少、節奏較慢，但佔領需要更久。', 'Snipers and support troops enter in spaced groups from either side. Enemy numbers and pace are lower, but capture takes longer.'), 'woodlandWatch', parameters(.90,1.50,34,1,.94,1.12), 'precision'),
    variant('trench-storm', words('戰壕突擊', 'Trench storm'), words('沒有狙擊兵；更多步兵、包抄與後續重裝兵密集衝擊戰壕，補給與佔領加快。', 'There are no snipers. Larger infantry, flanker and later heavy pushes storm the trenches, with faster resupply and capture.'), 'trenchAssault', parameters(1.14,1,24,.88,1.06,.90), 'grenadier'),
  ] },
  dam: { name: words('水壩作戰', 'Dam operations'), variants: [
    variant('crest-blockade', words('壩頂封鎖', 'Crest blockade'), words('狙擊兵與支援兵沿壩頂慢速分批部署，後續加入重裝兵；敵軍較少、壓力較低，補給與佔領較慢。', 'Snipers and support troops deploy slowly along the crest, followed by heavy infantry. Fewer attackers exert less line pressure; resupply and capture are slower.'), 'damHighground', parameters(.95,1.40,36,1.15,.90,1.18), 'precision'),
    variant('ramp-contest', words('維修坡道爭奪', 'Maintenance ramp contest'), words('包抄兵沿兩側繞行，再由中央步兵接力；兵力與頻率增加，補給與佔領加快。', 'Flankers circle the sides while infantry follow up through the center. Larger, more frequent attacks meet faster resupply and capture.'), 'rampContest', parameters(1.10,1.05,26,.90,1.03,.92), 'squad'),
    variant('emergency-gate', words('緊急啟閘', 'Emergency gate release'), words('重裝與支援兵偏重中央通路，增援更頻繁且防線壓力更高；補給與佔領顯著加快。', 'Heavy and support troops favor the central approach. More frequent reinforcements exert higher line pressure; resupply and capture are much faster.'), 'emergencyGate', parameters(1,1.15,24,.80,1.12,.85), 'speed', { bonusTime: { defend: 180, assault: 145 } }),
  ] },
  airfield: { name: words('機場作戰', 'Airfield operations'), variants: [
    variant('apron-suppression', words('停機坪壓制', 'Apron suppression'), words('支援兵與狙擊兵從開闊側翼輪流壓制；進場較慢，增援、補給與佔領間隔稍長。', 'Support troops and snipers alternate on the open flanks. Deployment is slower, with longer reinforcement, resupply and capture intervals.'), 'apronSuppression', parameters(1,1.30,32,1.05,1,1.10), 'precision'),
    variant('hangar-breach', words('機庫突破', 'Hangar breach'), words('包抄兵與後續重裝兵從機庫兩側成組突破，沒有狙擊兵；敵軍增加，補給與佔領加快。', 'Flankers and later heavy infantry breach in groups from the hangars, without snipers. More attackers are balanced by faster resupply and capture.'), 'hangarBreach', parameters(1.10,1,25,.85,1.05,.88), 'grenadier'),
    variant('last-flight', words('最後班機', 'Last flight'), words('大量步兵與包抄兵快速切換中央、兩翼進攻；防線壓力上升，補給與佔領最快。', 'Large infantry and flanker pushes rapidly switch between center and sides. Line pressure rises, while resupply and capture are fastest.'), 'lastDeparture', parameters(1.13,.90,24,.80,1.10,.84), 'speed', { bonusTime: { defend: 170, assault: 140 } }),
  ] },
  underground: { name: words('地下工廠作戰', 'Underground operations'), variants: [
    variant('isolation-lockdown', words('隔離門守衛', 'Isolation lockdown'), words('近距離重裝兵與支援兵緩慢交替進場，沒有狙擊兵；兵力略少，但壓力更高，補給與佔領較慢。', 'Close-range heavy and support troops enter slowly, without snipers. Slightly fewer attackers exert greater pressure; resupply and capture are slower.'), 'isolationDefense', parameters(.95,1.45,36,1.10,1.06,1.10), 'frontline'),
    variant('machinery-sweep', words('動力區掃蕩', 'Machinery sweep'), words('包抄兵透過交會通道快速成組進場，沒有狙擊兵；兵力增加，補給與佔領加快。', 'Flankers enter rapidly in groups through intersecting passages, without snipers. More enemies are balanced by faster resupply and capture.'), 'machinerySweep', parameters(1.10,.95,25,.86,1,.88), 'squad'),
    variant('rationed-infiltration', words('低補給滲透', 'Rationed infiltration'), words('只出現步兵、包抄與支援兵，兵力及增援頻率較低；補給最慢、佔領稍慢，挑戰不使用補給站。', 'Only infantry, flankers and support troops appear, with fewer and less frequent reinforcements. Resupply is slowest and capture slightly slower; try to clear without supply stations.'), 'rationedInfiltration', parameters(.90,1.30,38,1.20,.92,1.05), 'resource'),
  ] },
  rail: { name: words('貨運站作戰', 'Freight yard operations'), variants: [
    variant('armored-freight', words('裝甲列車護衛', 'Armored freight escort'), words('後續重裝與支援兵沿軌道兩側接力推進；進場與增援較慢，但防線壓力更高、佔領較慢。', 'Later heavy and support troops advance along both tracks. Deployment and reinforcements are slower, but line pressure and capture time increase.'), 'armoredFreight', parameters(1,1.40,35,1,1.10,1.12), 'frontline'),
    variant('platform-pincer', words('月台兩翼突擊', 'Platform pincer'), words('包抄兵沿月台兩側反覆切換攻勢，支援兵跟進；敵軍與頻率增加，補給與佔領加快。', 'Flankers repeatedly switch between platform sides, followed by support troops. Larger, more frequent attacks meet faster resupply and capture.'), 'platformPincer', parameters(1.10,1,26,.90,.98,.90), 'squad'),
    variant('ammunition-transfer', words('彈藥轉運', 'Ammunition transfer'), words('支援兵、包抄與後續重裝兵交錯進場；敵軍稍多，補給最快，鼓勵用手榴彈守住裝卸區。', 'Support troops, flankers and later heavy infantry enter in mixed groups. Enemy numbers rise slightly; very fast resupply rewards grenade use around the loading zone.'), 'ammunitionTransfer', parameters(1.05,1.15,30,.72,1.04,1), 'grenadier'),
  ] },
};

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) freezeTree(entry);
    Object.freeze(value);
  }
  return value;
}
freezeTree(DOCTRINES);
export const OPERATION_RULES = freezeTree(rules);

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.codePointAt(0); hash = Math.imul(hash,16777619); }
  return hash >>> 0;
}
function normalizeSeed(seed) {
  return typeof seed === 'number' ? Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 1 : typeof seed === 'string' ? hashText(seed) : 1;
}
function mix(value) {
  value = Math.imul(value ^ value >>> 16,0x7feb352d);
  value = Math.imul(value ^ value >>> 15,0x846ca68b);
  return (value ^ value >>> 16) >>> 0;
}
const whole = (value, fallback, minimum) => Number.isFinite(value) ? Math.max(minimum,Math.floor(value)) : fallback;

export function operationFor(sceneId, seed = 1, variantIndex = undefined) {
  const scene = Object.hasOwn(OPERATION_RULES,sceneId) ? sceneId : 'pass';
  const normalized = normalizeSeed(seed), entry = OPERATION_RULES[scene];
  const selected = Number.isInteger(variantIndex) && variantIndex >= 0 && variantIndex < entry.variants.length ? variantIndex : normalized % entry.variants.length;
  const spec = entry.variants[selected], doctrine = DOCTRINES[spec.doctrine];
  const random = (wave, mode, salt) => mix(normalized ^ hashText(scene) ^ Math.imul(selected+1,0x85ebca6b) ^ Math.imul(wave,0x9e3779b9) ^ (mode === 'assault' ? 0x243f6a88 : 0xb7e15162) ^ salt);
  return Object.freeze({
    ...spec, sceneId: scene, seed: normalized, variantIndex: selected, variantId: spec.id, maxActors: MAX_ACTORS,
    enemyType(wave, index, mode = 'defend') {
      wave = whole(wave,1,1); index = whole(index,0,0);
      const choice = random(wave,mode,0x51ed270b), roster = doctrine.rosters[choice % doctrine.rosters.length];
      const offset = (choice >>> 8) % roster.length;
      let role = roster[(index+offset) % roster.length];
      // A recognizable first rifleman, no special-weapon opening ambush, and no
      // heavy armor in the first defense wave / assault sector on any difficulty.
      if (index === 0) return 'line';
      if (role === 'heavy' && wave === 1) role = 'support';
      if (index < 3 && (role === 'sniper' || role === 'heavy')) role = mode === 'assault' ? 'flank' : 'support';
      return TYPES.has(role) ? role : 'line';
    },
    spawnSide(wave, index, mode = 'defend') {
      wave = whole(wave,1,1); index = whole(index,0,0);
      const choice = random(wave,mode,0xa54ff53a), offset = (choice >>> 8) % doctrine.sides.length;
      const side = doctrine.sides[(index+offset) % doctrine.sides.length];
      return choice & 1 ? 2-side : side;
    },
  });
}
