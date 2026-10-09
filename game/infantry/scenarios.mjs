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
    brief: { zh: '適合熟悉掩體與小隊。脫離火力 4.8 秒後恢復護盾，補給站整備 {supply} 秒；後續波次仍會加強。', en: 'Learn cover and squad commands. Shield recovery begins after 4.8 seconds out of fire; supply stations need {supply} seconds to reset. Later waves still intensify.' },
    damage: .8, count: .9, capture: 4.5, spawnMultiplier: 1, reinforceMultiplier: 1,
    integrityRepair: 6, supplyCooldown: 28, supplyUseTime: 1.5, supplyHeal: 100, supplyShield: 60,
    healthFloor: 40, healthRate: 6,
    shieldDelay: 4.8, shieldRate: 26, fieldHeal: 18, fieldShield: 35, reinforcementBatches: 2,
    reaction: 1.2, accuracy: 1.15, burstRest: 1.2, planInterval: 1.12, tacticalTempo: .9,
  },
  regular: {
    name: { zh: '標準', en: 'Regular' },
    brief: { zh: '更密集的攻勢與有限補給。脫離火力 6.5 秒後恢復護盾，補給站整備 {supply} 秒；波間只修補少量防線。', en: 'Denser attacks and limited supplies. Shield recovery begins after 6.5 seconds out of fire; supply stations reset in {supply} seconds. Only a little line integrity returns between waves.' },
    damage: 1.15, count: 1.25, capture: 7, spawnMultiplier: .84, reinforceMultiplier: .8,
    integrityRepair: 3, supplyCooldown: 40, supplyUseTime: 2.2, supplyHeal: 45, supplyShield: 35,
    healthFloor: 30, healthRate: 4,
    shieldDelay: 6.5, shieldRate: 17, fieldHeal: 10, fieldShield: 20, reinforcementBatches: 3,
    reaction: .82, accuracy: .82, burstRest: .78, planInterval: .8, tacticalTempo: 1.12,
  },
  veteran: {
    name: { zh: '老兵', en: 'Veteran' },
    brief: { zh: '管控補給、側翼與隊友才能守住防線。脫離火力 8 秒後恢復護盾，補給站整備 {supply} 秒；防線不自動修復。', en: 'Manage supplies, flanks and your squad. Shield recovery begins after 8 seconds out of fire; supply stations need {supply} seconds to reset. Line integrity never repairs automatically.' },
    damage: 1.5, count: 1.6, capture: 9, spawnMultiplier: .68, reinforceMultiplier: .62,
    integrityRepair: 0, supplyCooldown: 55, supplyUseTime: 3, supplyHeal: 30, supplyShield: 20,
    healthFloor: 20, healthRate: 2,
    shieldDelay: 8, shieldRate: 11, fieldHeal: 5, fieldShield: 10, reinforcementBatches: 4,
    reaction: .68, accuracy: .66, burstRest: .58, planInterval: .62, tacticalTempo: 1.3,
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
export class Mission {
  constructor(options) {
    Object.assign(this, selection(options));
    this.operation = options.operation || {};
    this.rules = { ...DIFFICULTIES[this.difficulty] };
    this.rules.count *= this.operation.countMultiplier || 1;
    this.rules.capture *= this.operation.captureMultiplier || 1;
    this.waveCount = 4;
    this.baseSpawnInterval = (this.operation.spawnInterval || 1.15) * this.rules.spawnMultiplier;
    this.baseReinforceInterval = (this.operation.reinforceInterval || 28) * this.rules.reinforceMultiplier;
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
          this.wave++; this.phase = 'battle'; this.pending = Math.round(DEFENSE_COUNTS[this.wave-1]*this.rules.count);
          this.spawnInterval = this.baseSpawnInterval*DEFENSE_PACE[this.wave-1]; this.spawnIn = 0; events.push('wave');
        }
      } else if (this.pending === 0 && alive === 0) {
        if (this.wave >= this.waveCount) { this.status = 'won'; events.push('won'); }
        else { this.phase = 'prepare'; this.delay = 10; this.integrity = Math.min(100,this.integrity+this.rules.integrityRepair); events.push('resupply'); }
      }
    } else {
      if (!this.stageStarted) {
        this.pending = Math.round(ASSAULT_COUNTS[this.objective]*this.rules.count); this.stageStarted = true;
        this.spawnInterval = this.baseSpawnInterval*ASSAULT_PACE[this.objective]; this.spawnIn = 0;
        this.reinforceInterval = this.baseReinforceInterval*REINFORCEMENT_PACE[this.objective]; this.reinforceIn = this.reinforceInterval;
        this.reinforcementsLeft = this.rules.reinforcementBatches; this.reinforcementsClosed = false; events.push('objective');
      }
      // A cleared queue and the last two defenders are a stable cleanup phase.
      // Reinforcements never appear while the player is following their precise markers.
      if (this.pending === 0 && alive <= 2) { this.reinforcementsClosed = true; this.reinforcementsLeft = 0; }
      if (!this.reinforcementsClosed && this.reinforcementsLeft > 0) {
        this.reinforceIn -= dt;
        if (this.reinforceIn <= 0) {
          // Finish the previous queue first; crowded sectors cannot accumulate hidden armies.
          if (this.pending === 0 && alive < 10) {
            this.pending = Math.round(REINFORCEMENT_COUNTS[this.objective]*this.rules.count);
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
