export const HARBOR_BOSS = '封港指揮機・夜鷺';

// 第 11 章使用正式戰鬥系統，波次由這裡管理，避免動到本篇原本關卡。
export class HarborAirBattle {
  constructor({ combat, player, world, relay }) {
    Object.assign(this, { combat, player, world });
    this.relay = relay ? { target: relay.clone(), state: 'intact', left: 0, progress: 0, probe: 0, salvos: 0 } : null;
    this.status = 'idle'; this.interceptors = []; this.boss = null;
  }

  get fighting() { return this.status === 'interceptors' || this.status === 'boss1' || this.status === 'boss2'; }
  get focus() { return this.boss || this.interceptors.find(e => !e.dead) || this.interceptors[0] || null; }
  get relayState() { return this.relay?.state || 'intact'; }
  get relaySeconds() { return this.relay?.left || 0; }
  get relayProgress() { return this.relay?.progress || 0; }

  spawn(kind, i, x, z, height, profile) {
    const ground = this.world.height(x, z), roof = this.world.support(x, z, 6, 1e4);
    const y = Math.min(ground + 245, Math.max(ground + height, roof + 18));
    const e = this.combat.spawn(kind, i, 2, { x, y, z, harborAir: profile });
    e.flankSide = profile.side;
    e.fireCd = 1.25 + i * .7; e.altCd = 3.7 + i * 2.4;
    e.airNavT = 0; e.airContact = 3;
    // 進場動畫可以在下一幀之前先拍到已定位的機身與推進火光。
    e.m.animate(0, { vel: e.vel, grounded: false, boost: 0, torsoYaw: e.face, pitch: 0, thrust: .65, aim: null, lean: 0, flight: 1, groundAt: e.groundAt });
    return e;
  }

  start() {
    if (this.status !== 'idle') return this.status;
    const C = this.combat;
    C.phase = 'harbor'; this.status = 'interceptors';
    this.interceptors = [
      this.spawn('grunt', 0, -14, 216, 58, { role: 'interceptor', side: -1, heightBias: 7, range: 72 }),
      this.spawn('grunt', 1, 16, 258, 79, { role: 'interceptor', side: 1, heightBias: 21, range: 111 }),
    ];
    this.interceptors.forEach((e, i) => { e.ap = e.apMax = i ? 2700 : 2300; e.label = i ? '攔截 02' : '攔截 01'; });
    C.say('空域遭攔截', '兩架機甲接近；飛行時按 Tab 換鎖定目標', 3.2, 'rd');
    C.audio.alert('lock');
    return this.status;
  }

  startBoss() {
    if (this.status !== 'idle' && this.status !== 'awaitingBoss') return this.boss;
    const C = this.combat;
    C.phase = 'harbor'; this.status = 'boss1';
    const e = this.spawn('ace', 0, 4, 274, 76, { role: 'boss', phase: 'beam', side: 1, warning: 0, exposed: 0, shiftT: 0, relay: this.relay });
    e.ap = e.apMax = 9900; e.bossName = HARBOR_BOSS; e.label = '夜鷺';
    C.boss = this.boss = e;
    C.say(HARBOR_BOSS, '第一階段・高空光束', 3.5, 'am');
    return e;
  }

  ceasefire() {
    const C = this.combat;
    C.phase = 'done';
    for (const m of C.missiles) C.fx.missileEnd(m.h);
    C.missiles.length = 0;
    C.lockTarget = C.soft = null;
    C.msl.locks.length = 0; C.msl.locking = false; C.snapT = 0;
    C.saber.phase = null; C.saber.win = 0; C.saber.target = null;
    C.hero.saber.visible = false; C.hero.swing = 0; C.audio.saberOff();
    C.cannon.phase = null; C.cannon.I = 0;
    this.player.dashT = 0;
  }

  update() {
    if (this.fighting && this.combat.dead) this.status = 'failed';
    else if (this.status === 'interceptors' && this.interceptors.every(e => e.dead)) {
      this.ceasefire(); this.status = 'awaitingBoss';
    } else if ((this.status === 'boss1' || this.status === 'boss2') && this.boss.dead) {
      this.ceasefire(); this.status = 'won';
    } else if (this.status === 'boss1' && this.boss.harborAir.phase === 'missiles') this.status = 'boss2';
    return this.status;
  }
}
