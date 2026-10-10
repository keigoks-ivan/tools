// The infantry spin-off has its own missions and records; controls and art come from Iron Dusk.
const point = (x, z, zh, en) => ({ x, z, name: { zh, en } });
export const SCENARIOS = [
  { id: 'pass', name: { zh: '山區公路關隘', en: 'Mountain Pass' }, code: '01 / RIDGELINE', color: '#d7b27b', sky: 0x9cacae, fog: 0xa4a9a4,
    brief: { zh: '最後一支車隊正在穿越隧道。守住公路，或沿兩翼山徑奪回關隘。', en: 'The last convoy is crossing the tunnel. Hold the road, or retake the pass through its side trails.' },
    hold: { zh: '隧道撤離口', en: 'Evacuation tunnel' }, targets: [point(0,-5,'公路路障','Roadblock'),point(-15,25,'山腰哨站','Hillside post'),point(0,51,'關隘通訊台','Pass relay')] },
  { id: 'city', name: { zh: '山城街區', en: 'Hillside District' }, code: '02 / OLD QUARTER', color: '#cfaa91', sky: 0xa6a7a8, fog: 0xafaaa0,
    brief: { zh: '廣場醫療站還有傷員。穿過巷道，在交叉火力中守住撤離線。', en: 'The square clinic still holds wounded civilians. Fight through alleys and intersecting firing lanes.' },
    hold: { zh: '廣場醫療站', en: 'Square clinic' }, targets: [point(0,-5,'街口路障','Street barricade'),point(15,25,'中央廣場','Central square'),point(0,51,'街區指揮所','District command')] },
  { id: 'forest', name: { zh: '森林前線', en: 'Forest Front' }, code: '03 / PINE BELT', color: '#aabd89', sky: 0x849d94, fog: 0x9cae9e,
    brief: { zh: '松林裡的戰壕連著最後一座通訊站。注意林間側翼，跟上友軍推進。', en: 'Trenches in the pines lead to the last relay. Watch the woodland flanks and advance with your squad.' },
    hold: { zh: '林間通訊站', en: 'Forest relay' }, targets: [point(0,-5,'前沿戰壕','Forward trench'),point(-15,25,'林間碉堡','Woodland bunker'),point(0,51,'通訊陣地','Relay position')] },
  { id: 'dam', name: { zh: '水壩與發電站', en: 'Dam & Power Station' }, code: '04 / SPILLWAY', color: '#8fbac7', sky: 0x9eafb8, fog: 0xaab9b9,
    brief: { zh: '壩頂閘門控制著整座城市的電力。沿維修坡道上行，奪回控制室。', en: 'The dam gates power the entire city. Climb the maintenance ramp and secure the control room.' },
    hold: { zh: '發電站入口', en: 'Power station entrance' }, targets: [point(0,-5,'維修閘口','Maintenance gate'),point(15,25,'壩頂平台','Dam platform'),point(0,51,'閘門控制室','Gate control room')] },
  { id: 'airfield', name: { zh: '機場外圍', en: 'Airfield Perimeter' }, code: '05 / LAST DEPARTURE', color: '#c5ba92', sky: 0xa4aab0, fog: 0xbbb8aa,
    brief: { zh: '運輸機正在整備。利用停機坪障礙與機庫掩護，替撤離爭取時間。', en: 'The transport is preparing to leave. Use apron barriers and hangars to buy time for evacuation.' },
    hold: { zh: '運輸機整備區', en: 'Transport staging area' }, targets: [point(0,-5,'停機坪防線','Apron line'),point(-15,25,'維修機庫','Service hangar'),point(0,51,'航管通訊台','Air traffic relay')] },
  { id: 'underground', name: { zh: '地下工廠', en: 'Underground Works' }, code: '06 / BELOW THE LINE', color: '#b8a0cf', sky: 0x141c26, fog: 0x1c2830,
    brief: { zh: '電力中斷，工廠只剩緊急照明。穿過機械區與交會通道，解除封鎖。', en: 'Only emergency lights remain. Push through machinery bays and intersecting corridors to lift the lockdown.' },
    hold: { zh: '升降機撤離廳', en: 'Evacuation lift hall' }, targets: [point(0,-5,'入口隔離門','Isolation door'),point(15,25,'動力機械區','Machinery bay'),point(0,51,'封鎖控制台','Lockdown console')] },
  { id: 'rail', name: { zh: '鐵路補給站', en: 'Rail Supply Depot' }, code: '07 / FREIGHT YARD', color: '#d4a476', sky: 0xa4a6a3, fog: 0xb2afa1,
    brief: { zh: '貨運站是前線最後的補給來源。穿梭月台與貨櫃，守住物資或奪回調度室。', en: 'The freight yard is the front’s last supply source. Fight between platforms and containers for the dispatch room.' },
    hold: { zh: '補給裝卸區', en: 'Supply loading zone' }, targets: [point(0,-5,'貨運入口','Freight entrance'),point(-15,25,'中央月台','Central platform'),point(0,51,'鐵路調度室','Dispatch room')] },
];
export const MODES = {
  defend: { zh: '守衛戰', en: 'Hold the Line' }, assault: { zh: '衝鋒戰', en: 'Breakthrough' },
};
export const DIFFICULTIES = {
  recruit: {
    name: { zh: '新兵', en: 'Recruit' },
    brief: { zh: '敵軍總數增加、進場更快，但掩體與小隊仍給你整備機會。脫離火力 5.2 秒後恢復護盾，補給站整備 {supply} 秒；補給可恢復 85 生命，波間只修補少量防線。', en: 'More enemies deploy faster, while cover and squad tactics still leave room to learn. Shield recovery begins after 5.2 seconds out of fire; supply stations reset in {supply} seconds and restore 85 health. Only a little line integrity returns between waves.' },
    damage: .9, count: 1.05, capture: 4.5, spawnMultiplier: .92, reinforceMultiplier: .94,
    integrityRepair: 4, supplyCooldown: 32, supplyUseTime: 1.8, supplyHeal: 85, supplyShield: 50,
    healthFloor: 35, healthRate: 5,
    shieldDelay: 5.2, shieldRate: 24, fieldHeal: 15, fieldShield: 30, reinforcementBatches: 2,
    reaction: 1.1, accuracy: 1.05, burstRest: 1.1, planInterval: 1, tacticalTempo: 1,
  },
  regular: {
    name: { zh: '標準', en: 'Regular' },
    brief: { zh: '更多敵軍從主路與側翼快速接續進攻，補給必須提前規劃。脫離火力 7.5 秒後恢復護盾，補給站整備 {supply} 秒；每次僅恢復 35 生命，波間防線只修補 1%。', en: 'More enemies rapidly follow up through the main approach and flanks; plan resupply early. Shield recovery begins after 7.5 seconds out of fire; stations reset in {supply} seconds and restore only 35 health. Just 1% line integrity returns between waves.' },
    damage: 1.25, count: 1.55, capture: 7, spawnMultiplier: .70, reinforceMultiplier: .67,
    integrityRepair: 1, supplyCooldown: 48, supplyUseTime: 2.6, supplyHeal: 35, supplyShield: 30,
    healthFloor: 25, healthRate: 3,
    shieldDelay: 7.5, shieldRate: 14, fieldHeal: 8, fieldShield: 16, reinforcementBatches: 3,
    reaction: .76, accuracy: .76, burstRest: .68, planInterval: .70, tacticalTempo: 1.25,
  },
  veteran: {
    name: { zh: '老兵', en: 'Veteran' },
    brief: { zh: '高密度攻勢與短暫火力空檔考驗掩體換位。脫離火力 9 秒後恢復護盾，補給站整備 {supply} 秒；每次僅恢復 22 生命，防線不自動修復。', en: 'Dense attacks and brief firing gaps demand cover changes. Shield recovery begins after 9 seconds out of fire; supply stations reset in {supply} seconds and restore only 22 health. Line integrity never repairs automatically.' },
    damage: 1.55, count: 1.95, capture: 9, spawnMultiplier: .56, reinforceMultiplier: .50,
    integrityRepair: 0, supplyCooldown: 65, supplyUseTime: 3.4, supplyHeal: 22, supplyShield: 15,
    healthFloor: 15, healthRate: 1.5,
    shieldDelay: 9, shieldRate: 9, fieldHeal: 4, fieldShield: 8, reinforcementBatches: 4,
    reaction: .62, accuracy: .60, burstRest: .50, planInterval: .54, tacticalTempo: 1.45,
  },
};
export function selection(raw = {}) {
  return { scene: SCENARIOS.some(s => s.id === raw.scene) ? raw.scene : 'pass',
    mode: Object.hasOwn(MODES, raw.mode) ? raw.mode : 'defend',
    difficulty: Object.hasOwn(DIFFICULTIES, raw.difficulty) ? raw.difficulty : 'regular' };
}

// Pure mission state. The renderer supplies actual living enemies and interaction state.
const DEFENSE_COUNTS = [7, 10, 14, 18];
const ASSAULT_COUNTS = [8, 11, 14];
const REINFORCEMENT_COUNTS = [3, 4, 5];
const DEFENSE_PACE = [1, .94, .88, .82];
const ASSAULT_PACE = [1, .88, .76];
const REINFORCEMENT_PACE = [1, .9, .82];
function effectiveMissionPlan(difficulty, operation = {}) {
  operation = operation && typeof operation === 'object' ? operation : {};
  const positive = (value,fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
  const rules = { ...DIFFICULTIES[difficulty] };
  rules.count *= positive(operation.countMultiplier,1);
  rules.capture *= positive(operation.captureMultiplier,1);
  return { rules,
    baseSpawnInterval: positive(operation.spawnInterval,1.15) * rules.spawnMultiplier,
    baseReinforceInterval: positive(operation.reinforceInterval,28) * rules.reinforceMultiplier,
  };
}
function stagePressure(mode, index, plan) {
  const defend = mode === 'defend';
  const reinforcementBatch = defend ? 0 : Math.round(REINFORCEMENT_COUNTS[index] * plan.rules.count);
  const maxBatches = defend ? 0 : plan.rules.reinforcementBatches;
  return { stage:index+1,
    initial:Math.round((defend ? DEFENSE_COUNTS : ASSAULT_COUNTS)[index] * plan.rules.count),
    spawnInterval:plan.baseSpawnInterval * (defend ? DEFENSE_PACE : ASSAULT_PACE)[index],
    reinforcementInterval:defend ? null : plan.baseReinforceInterval * REINFORCEMENT_PACE[index],
    reinforcementBatch,maxBatches,maxReinforcements:reinforcementBatch*maxBatches,
  };
}
// Initial forces are guaranteed arrival queues. Assault reinforcements are an
// upper bound, not promised arrivals: cleanup can close the remaining budget.
export function missionPressurePreview(choice = {}, operation = {}) {
  const selected = selection(choice || {}),plan = effectiveMissionPlan(selected.difficulty,operation);
  const stages = (selected.mode === 'defend' ? DEFENSE_COUNTS : ASSAULT_COUNTS).map((_,index)=>stagePressure(selected.mode,index,plan));
  const initialCounts = stages.map(stage=>stage.initial),totalInitial = initialCounts.reduce((a,b)=>a+b,0);
  const maxReinforcements = stages.reduce((sum,stage)=>sum+stage.maxReinforcements,0);
  return {mode:selected.mode,difficulty:selected.difficulty,initialCounts,totalInitial,maxReinforcements,
    totalMaximum:totalInitial+maxReinforcements,stages};
}
export class Mission {
  constructor(options) {
    Object.assign(this, selection(options));
    this.operation = options.operation || {};
    Object.assign(this, effectiveMissionPlan(this.difficulty,this.operation));
    this.waveCount = 4;
    this.spawnInterval = this.baseSpawnInterval; this.reinforceInterval = this.baseReinforceInterval;
    this.scenario = SCENARIOS.find(s => s.id === this.scene);
    this.time = 0; this.wave = 0; this.phase = 'prepare'; this.delay = 6;
    this.pending = 0; this.spawnIn = 0; this.integrity = 100;
    this.objective = 0; this.capture = 0; this.status = 'playing'; this.kills = 0;
    this.stageStarted = false; this.reinforceIn = this.reinforceInterval;
    this.reinforcementsLeft = this.rules.reinforcementBatches; this.reinforcementsClosed = false;
  }
  get target() { return this.mode === 'defend' ? { x:0,z:-39,name:this.scenario.hold } : this.scenario.targets[this.objective]; }
  update(dt, { alive = 0, pressure = 0, near = false, contested = false, interact = false, dead = false } = {}) {
    if (this.status !== 'playing') return [];
    dt = Math.max(0, Math.min(dt, .1)); this.time += dt;
    const events = [];
    if (dead) { this.status = 'lost'; return ['lost']; }
    if (this.mode === 'defend') {
      this.integrity = Math.max(0, this.integrity - pressure * dt * 3.5 * this.rules.damage * (this.operation.pressureMultiplier || 1));
      if (this.integrity <= 0) { this.status = 'lost'; return ['lost']; }
      if (this.phase === 'prepare') {
        this.delay -= dt;
        if (this.delay <= 0) {
          this.wave++; this.phase = 'battle'; const stage=stagePressure(this.mode,this.wave-1,this);
          this.pending=stage.initial;this.spawnInterval=stage.spawnInterval;this.spawnIn = 0; events.push('wave');
        }
      } else if (this.pending === 0 && alive === 0) {
        if (this.wave >= this.waveCount) { this.status = 'won'; events.push('won'); }
        else { this.phase = 'prepare'; this.delay = 10; this.integrity = Math.min(100,this.integrity+this.rules.integrityRepair); events.push('resupply'); }
      }
    } else {
      if (!this.stageStarted) {
        const stage=stagePressure(this.mode,this.objective,this);
        this.pending=stage.initial;this.stageStarted = true;
        this.spawnInterval=stage.spawnInterval;this.spawnIn = 0;
        this.reinforceInterval=stage.reinforcementInterval;this.reinforceIn = this.reinforceInterval;
        this.reinforcementsLeft=stage.maxBatches;this.reinforcementsClosed = false; events.push('objective');
      }
      // A cleared queue and the last two defenders are a stable cleanup phase.
      // Reinforcements never appear while the player is following their precise markers.
      if (this.pending === 0 && alive <= 2) { this.reinforcementsClosed = true; this.reinforcementsLeft = 0; }
      if (!this.reinforcementsClosed && this.reinforcementsLeft > 0) {
        this.reinforceIn -= dt;
        if (this.reinforceIn <= 0) {
          // Finish the previous queue first; crowded sectors cannot accumulate hidden armies.
          if (this.pending === 0 && alive < 10) {
            this.pending=stagePressure(this.mode,this.objective,this).reinforcementBatch;
            this.reinforcementsLeft--; events.push('reinforce');
          }
          this.reinforceIn = this.reinforceInterval;
        }
      }
      if (near && !contested && interact && this.pending === 0) this.capture += dt;
      else if (!near) this.capture = Math.max(0,this.capture-dt);
      else if (contested) this.capture = Math.max(0,this.capture-dt*.5);
      if (this.capture >= this.rules.capture) {
        this.objective++; this.capture = 0;
        if (this.objective >= this.scenario.targets.length) { this.status = 'won'; events.push('won'); }
        else { this.stageStarted = false; this.reinforceIn = this.reinforceInterval; this.pending = 0; events.push('resupply'); }
      }
    }
    this.spawnIn -= dt;
    if (this.status === 'playing' && this.pending > 0 && this.spawnIn <= 0 && alive < 14) events.push('spawn');
    return events;
  }
  spawned() { if (this.pending > 0) { this.pending--; this.spawnIn = this.spawnInterval; } }
}
