import { Vector3 } from 'three';

export const LESSONS = {
  move: { number: 1, title: '移動機甲', desktop: 'W A S D　移動', touch: '左側搖桿　移動', goal: '走到前方的青色光圈。' },
  rifle: { number: 2, title: '光束步槍', desktop: '滑鼠瞄準 → 左鍵射擊', touch: '右側拖曳瞄準 → 點「射擊」', goal: '把準心移到訓練靶上，打掉它。' },
  missile: { number: 3, title: '鎖定飛彈', desktop: '按住右鍵 → 鎖定後放開', touch: '按住「飛彈」→ 鎖定後放開', goal: '對準第二個靶，出現鎖定框後再發射。' },
  shield: { number: 4, title: '開啟防護罩', desktop: '按 F　展開防護罩', touch: '點「防護罩」　展開護盾', goal: '護盾張開時可以短暫吸收傷害。' },
  done: { number: 4, title: '教學完成', desktop: '沿青色光柱前進', touch: '沿青色光柱前進', goal: '蒼焰準備完成，正式出擊。' },
};

export class MechTutorial {
  constructor(combat, points) {
    this.C = combat;
    this.points = points;
    const { x, z } = points[0];
    this.marker = new Vector3(x, combat.world.height(x, z) + 10, z);
    this.step = 'move';
    this.target = null;
    this.stats = { ...combat.stats };
  }

  startTarget(step, point) {
    const { C } = this, { x, z } = point;
    const tank = C.spawn('tank', 0, 1, { x, z, tx: C.player.pos.x, tz: C.player.pos.z });
    Object.assign(tank, { speed: 0, ap: 220, apMax: 220, label: '訓練靶', training: true });
    this.target = tank;
    this.marker = null;
    this.step = step;
    C.audio.ui('confirm');
  }

  update(dt) {
    const { C } = this;
    if (this.step === 'move') {
      const p = C.player.pos, { x, z } = this.marker;
      if (Math.hypot(p.x - x, p.z - z) <= 7) this.startTarget('rifle', this.points[1]);
    } else if (this.step === 'rifle' && this.target.dead) {
      this.startTarget('missile', this.points[2]);
    } else if (this.step === 'missile' && this.target.dead) {
      this.clearSalvo();
      this.step = 'shield'; C.audio.ui('confirm');
    } else if (this.step === 'shield' && C.shield.active) {
      this.step = 'done'; this.confirmLeft = 1.35; C.audio.ui('confirm');
    } else if (this.step === 'done') {
      return (this.confirmLeft -= dt) <= 0;
    }
    return false;
  }

  clearSalvo() {
    const { C } = this;
    C.events.length = 0;
    for (const m of C.missiles) C.fx.missileEnd(m.h);
    C.missiles.length = 0;
  }

  finish() {
    const { C } = this;
    this.clearSalvo();
    C.vehicles.dispose();
    C.enemies.length = 0;
    C.lockTarget = C.soft = null;
    Object.assign(C.stats, this.stats);
    Object.assign(C.rifle, { ammo: C.rifle.mag, reload: -1, cd: 0 });
    Object.assign(C.msl, { cd: 1, locking: false, locks: [] });
    C.stopShield(); C.shield.cooldown = 0;
    C.od.gauge = 0;
    C.notes.length = 0;
  }
}
