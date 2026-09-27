// 音效：全部用 Web Audio 即時合成（振盪器、雜訊、濾波、包絡、殘響），不需要任何音檔。
// 聲音分四條匯流排：
//   hull ：自機結構音（腳步、液壓、推進器、落地），在座艙裡聽到，低通＋低頻加強，悶而厚。
//   arm  ：自機武器（光束、飛彈、光劍），稍亮，帶一點城市回音。
//   cab  ：座艙內部（儀表嗶聲、警報、震動雜音），乾淨，只有極小的座艙殘響。
//   world：外界（敵機、爆炸、彈著），立體聲定位＋距離衰減＋距離低通＋座艙隔音低通＋城市回音；遠方爆炸有音速延遲。
// 全部 → 壓縮器 → 限幅器 → 軟削波 → 主音量 → 暫停閘 → 喇叭；大爆炸也不會爆音。

const SOS = 343;          // 音速（公尺／秒）
const MAX_DELAY = 1.5;    // 遠方爆炸最大延遲（秒）
const E = 0.0001;         // 包絡的「靜音」值（指數曲線不能到 0）
const BAR = [1, 2.756, 5.404, 8.933];    // 自由樑模態比例：金屬撞擊的不諧和泛音
const PLATE = [1, 1.59, 2.14, 2.83, 3.6]; // 厚板共振：裝甲被打中的沉重金屬聲
const MG_CAP = 24;        // 同時發聲超過這個數就丟掉機槍聲
const MINOR_CAP = 44;     // 次要聲音（腳步、彈著、碎片）上限
const HARD_CAP = 80;      // 絕對上限

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const rnd = (a, b) => a + Math.random() * (b - a);

// 城市殘響：開頭稀疏（大樓牆面的分離回音），之後才長出擴散尾巴，越晚越悶。
const CITY_IR = {
  sec: 2.4, pre: 0.018, rise: 0.16, diff: 0.35, decay: 3.1, fStart: 7000, fEnd: 800, dark: 1.8,
  taps: [[0.052, 0.8], [0.088, 1.0], [0.137, 0.7], [0.186, 0.8], [0.255, 0.5], [0.34, 0.4], [0.46, 0.28]],
};
// 座艙：小型金屬空間，極短。
const COCKPIT_IR = {
  sec: 0.25, pre: 0.002, rise: 0.004, diff: 1, decay: 30, fStart: 6000, fEnd: 2500, dark: 12,
  taps: [[0.0035, 0.5], [0.0081, 0.4], [0.0127, 0.3]],
};

// 一次性聲音：追蹤所有節點，最後一個音源結束時全部斷開，並釋放同時發聲數。
class Voice {
  constructor(au, dest) {
    this.au = au;
    this.nodes = [];
    this.last = null;
    this.end = 0;
    this.out = this.add(au.ctx.createGain());
    if (dest) this.out.connect(dest);
    au.voices++;
  }
  add(n) { this.nodes.push(n); return n; }
  play(s, t0, t1, off) {
    this.add(s);
    if (off) s.start(t0, off); else s.start(t0);
    s.stop(t1);
    if (t1 >= this.end) { this.end = t1; this.last = s; }
    return s;
  }
  done() {
    const nodes = this.nodes, au = this.au;
    const fin = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已斷開 */ } }
      au.voices = Math.max(0, au.voices - 1);
    };
    if (this.last) this.last.onended = fin; else fin();
  }
}

// 持續音（循環）：統一管理節點；kill() 排程停止，結束後斷開。
class Rig {
  constructor(c) { this.c = c; this.nodes = []; this.srcs = []; this.dead = false; }
  add(n) { this.nodes.push(n); return n; }
  gain(v, dest) { const g = this.add(this.c.createGain()); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filt(type, f, q, dest) {
    const b = this.add(this.c.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  pan(dest) {
    const c = this.c;
    const p = this.add(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    if (dest) p.connect(dest);
    return p;
  }
  osc(type, f, dest, t) {
    const o = this.add(this.c.createOscillator());
    o.type = type; o.frequency.value = f;
    if (dest) o.connect(dest);
    o.start(t); this.srcs.push(o);
    return o;
  }
  noise(buf, dest, t) {
    const s = this.add(this.c.createBufferSource());
    s.buffer = buf; s.loop = true;
    if (dest) s.connect(dest);
    s.start(t, Math.random() * (buf.duration - 0.5)); this.srcs.push(s);
    return s;
  }
  kill(at) {
    if (this.dead) return;
    this.dead = true;
    const nodes = this.nodes, srcs = this.srcs;
    for (const s of srcs) { try { s.stop(at); } catch (e) { /* 已停止 */ } }
    const fin = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已斷開 */ } } };
    if (srcs.length) srcs[srcs.length - 1].onended = fin; else fin();
  }
}

export class Audio {
  constructor() {
    this.ctx = null;             // 等使用者第一次操作才建立（瀏覽器自動播放規則）
    this._ready = false;
    this.vol = 0.8;
    this.paused = false;
    this.voices = 0;
    this.lastError = null;
    this.lis = { x: 0, y: 0, z: 0 };
    this.fx = 0; this.fz = -1;   // 水平前方
    this.rx = 1; this.rz = 0;    // 水平右方＝cross(fwd, up)
    this.bus = null;
    this.bl = null;              // 自機推進器循環
    this.sb = null;              // 光劍嗡鳴循環
    this.dz = null;              // 低裝甲警報循環
    this.eb = new Map();         // 敵機推進器循環（id → Rig）
    this._dangerWant = false;
    this._servoT = -9;
    this.lockNext = 0; this.lockLast = -9; this.lockAlt = 0;
    this._pauseTok = 0;
  }

  get ready() { return this._ready; }

  // ───────────────────────── 啟動與全域控制 ─────────────────────────

  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      let ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      this._attach(ctx, true);
    }
    if (this.ctx.state === 'suspended' && !this.paused && this.ctx.resume) {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // 接上任一 BaseAudioContext（測試頁可接 OfflineAudioContext 量音量）。
  _attach(ctx, live) {
    this.ctx = ctx;
    this._makeNoise();
    this._makeCurves();
    this._buildGraph();
    this._ready = true;
    if (live) {
      this._startAmbience();
      if (this._dangerWant) this.setDanger(true);
    }
  }

  setVolume(v) {
    this.vol = clamp(num(v, this.vol), 0, 1);
    if (this._ready) this.masterG.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.04);
  }

  setPaused(on) {
    on = !!on;
    if (on === this.paused) return;
    this.paused = on;
    if (!this._ready) return;
    const c = this.ctx, now = c.currentTime, g = this.pauseG.gain, tok = ++this._pauseTok;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (on) {
      // 先淡出，再暫停整個音訊時鐘（循環音一起凍結）
      g.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => {
        if (this._pauseTok === tok && this.paused && c.suspend) c.suspend().catch(() => {});
      }, 320);
    } else {
      if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
      g.linearRampToValueAtTime(1, now + 0.3);
    }
  }

  setListener(pos, fwd) {
    const L = this.lis;
    if (pos) { L.x = num(pos.x, L.x); L.y = num(pos.y, L.y); L.z = num(pos.z, L.z); }
    if (fwd) {
      const fx = num(fwd.x, 0), fz = num(fwd.z, 0), l = Math.sqrt(fx * fx + fz * fz);
      if (l > 1e-4) { this.fx = fx / l; this.fz = fz / l; this.rx = -this.fz; this.rz = this.fx; }
    }
    if (this._ok()) this._tick();
  }

  // ───────────────────────── 自機（座艙內，不定位） ─────────────────────────

  footstep(strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 1.6);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out;
    // 次低頻下墜：座椅感受到的「咚」
    this._thump(v, o, t, rnd(52, 63), rnd(29, 35), 0.3 * s, 0.45 + 0.15 * s, 1.8);
    this._T(v, o, { t, f: rnd(95, 115), f1: 48, gl: 0.12, a: 0.002, d: 0.22, g: 0.09 * s });
    // 低頻雜訊本體
    this._N(v, o, { t, b: 'b', a: 0.003, d: 0.36, g: 0.4 * s, ft: 'lowpass', f: 240, f1: 90, gl: 0.3, q: 0.9 });
    // 觸地瞬態
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.07, g: 0.22 * s, ft: 'bandpass', f: rnd(260, 380), q: 1.2 });
    // 回彈次撞（懸吊）
    this._thump(v, o, t + rnd(0.08, 0.11), rnd(44, 52), 30, 0.1 * s, 0.25, 1.2);
    // 關節金屬碰撞
    this._clank(v, o, t + rnd(0.03, 0.07), rnd(160, 240), 0.05 * s, rnd(0.25, 0.45));
    // 關節嘎吱（隨機）
    if (Math.random() < 0.55) this._creak(v, o, t + rnd(0.06, 0.14), rnd(0.2, 0.35), 0.035 * s);
    // 液壓洩氣（隨機）
    if (Math.random() < 0.4) {
      this._N(v, o, { t: t + rnd(0.1, 0.18), b: 'w', a: 0.02, d: 0.2, g: 0.035 * s, ft: 'bandpass', f: rnd(2200, 3200), f1: 1500, q: 1.5 });
    }
    v.done();
  }

  servo(amount) {
    if (!this._ok()) return;
    const now = this.ctx.currentTime;
    if (now - this._servoT < 0.12) return;
    this._servoT = now;
    const a = clamp(num(amount, 0.5), 0, 1);
    const v = this._voice(this.bus.hull, 1); if (!v) return;
    const t = this._now(), o = v.out, dur = 0.14 + 0.28 * a;
    const f0 = rnd(130, 170) * (1 + 0.5 * a), g = 0.05 + 0.1 * a;
    // 馬達嗚聲：音高先衝上去再回落
    const m = this._T(v, o, { t, type: 'sawtooth', f: f0, a: 0.03, h: dur * 0.5, d: dur * 0.6, g, ft: 'bandpass', ff: 900, ff1: 1700, fgl: dur * 0.6, fq: 4 });
    m.frequency.exponentialRampToValueAtTime(f0 * rnd(1.4, 1.8), t + dur * 0.6);
    m.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + dur * 1.1);
    // 齒輪低嗡
    this._T(v, o, { t, type: 'square', f: f0 * 0.5, a: 0.03, h: dur * 0.5, d: dur * 0.5, g: g * 0.5, ft: 'lowpass', ff: 420, fq: 1 });
    // 液壓嘶聲
    this._N(v, o, { t, b: 'w', a: 0.02, d: dur, g: 0.025 + 0.05 * a, ft: 'bandpass', f: rnd(2300, 3000), q: 2 });
    // 到位「喀」
    this._clank(v, o, t + dur * 0.9, rnd(300, 420), 0.03 + 0.05 * a, 0.2);
    v.done();
  }

  boost(level) {
    if (!this._ok()) return;
    this._boostSet(clamp(num(level, 0), 0, 1));
  }

  quickBoost() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, p = rnd(0.92, 1.08);
    // 點火爆裂
    this._N(v, o, { t, b: 'w', a: 0.0008, d: 0.06, g: 0.45, ft: 'highpass', f: 1800 });
    // 噴流轟聲：帶通由高掃低
    this._N(v, o, { t, b: 'p', a: 0.004, h: 0.05, d: 0.55, g: 0.65, ft: 'bandpass', f: 2400 * p, f1: 480, gl: 0.45, q: 0.8 });
    // 低頻衝擊
    this._thump(v, o, t, 88 * p, 32, 0.42, 0.5, 1.6);
    // 低頻氣團
    this._N(v, o, { t, b: 'b', a: 0.01, d: 0.7, g: 0.55, ft: 'lowpass', f: 420, f1: 120, q: 0.8 });
    // 噴口閥門金屬喀
    this._clank(v, o, t + 0.01, 520 * p, 0.04, 0.15);
    v.done();
  }

  jump() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out;
    // 液壓頂升
    this._T(v, o, { t, type: 'sawtooth', f: rnd(66, 76), f1: 44, gl: 0.25, a: 0.02, d: 0.35, g: 0.2, ft: 'lowpass', ff: 320, fq: 1.5 });
    this._thump(v, o, t, 62, 30, 0.45, 0.4, 1.5);
    this._N(v, o, { t, b: 'w', a: 0.02, d: 0.35, g: 0.07, ft: 'bandpass', f: 1900, f1: 900, q: 1.5 });
    // 推進器點火膨脹
    const ti = t + 0.05;
    this._N(v, o, { t: ti, b: 'w', a: 0.001, d: 0.04, g: 0.25, ft: 'highpass', f: 2000 });
    this._N(v, o, { t: ti, b: 'p', a: 0.08, h: 0.15, d: 0.7, g: 0.6, ft: 'bandpass', f: 350, f1: 1400, gl: 0.3, q: 0.9 });
    this._N(v, o, { t: ti, b: 'b', a: 0.06, h: 0.1, d: 0.8, g: 0.55, ft: 'lowpass', f: 260, q: 0.8 });
    v.done();
  }

  land(strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 2.2), k = Math.min(s, 1.4);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out;
    // 重砸
    this._thump(v, o, t, rnd(70, 80), 26, 0.45 * k, 0.6 + 0.3 * s, 2);
    this._T(v, o, { t, f: 125, f1: 45, gl: 0.2, a: 0.002, d: 0.3, g: 0.15 * k });
    this._N(v, o, { t, b: 'b', a: 0.003, d: 0.6 + 0.2 * s, g: 0.55 * k, ft: 'lowpass', f: 320, f1: 90, q: 0.9 });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.1, g: 0.33 * k, ft: 'bandpass', f: 450, q: 1 });
    // 懸吊壓縮嘶聲
    this._N(v, o, { t: t + 0.04, b: 'w', a: 0.03, h: 0.1, d: 0.5, g: 0.08 * k, ft: 'bandpass', f: 2600, f1: 1300, q: 1.2 });
    // 金屬呻吟（結構受力）
    const gf = rnd(48, 60);
    const gr = this._T(v, o, { t: t + 0.12, type: 'sawtooth', f: gf, a: 0.08, h: 0.3, d: 0.6, g: 0.1 * k, ft: 'bandpass', ff: 520, ff1: 300, fgl: 0.9, fq: 6 });
    gr.frequency.linearRampToValueAtTime(gf * 1.25, t + 0.4);
    gr.frequency.linearRampToValueAtTime(gf * 0.8, t + 1.0);
    this._clank(v, o, t + 0.02, rnd(140, 170), 0.1 * k, 0.5, PLATE);
    this._clank(v, o, t + rnd(0.08, 0.12), rnd(240, 290), 0.05 * k, 0.35);
    v.done();
  }

  beam() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const c = this.ctx, t = this._now(), o = v.out, p = rnd(0.94, 1.06);
    // 充能裂擊：極短高頻爆裂
    this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.035, g: 0.5, ft: 'highpass', f: 2800 });
    this._T(v, o, { t, type: 'square', f: 3600 * p, f1: 1300, gl: 0.025, a: 0.0005, d: 0.035, g: 0.08 });
    // 電漿掃頻：FM 鋸齒由高往低掃
    const car = this._T(v, o, { t, type: 'sawtooth', f: 2400 * p, f1: 130, gl: 0.24, a: 0.001, h: 0.02, d: 0.3, g: 0.17, ft: 'lowpass', ff: 7000, ff1: 900, fgl: 0.3, fq: 2 });
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(930 * p, t);
    mod.frequency.exponentialRampToValueAtTime(55, t + 0.25);
    const md = v.add(c.createGain());
    md.gain.setValueAtTime(1400, t);
    md.gain.exponentialRampToValueAtTime(40, t + 0.25);
    mod.connect(md); md.connect(car.frequency);
    v.play(mod, t, t + 0.36);
    // 滋滋電流
    this._N(v, o, { t, b: 'w', a: 0.002, h: 0.05, d: 0.32, g: 0.2, ft: 'highpass', f: 4200, am: rnd(70, 95), amd: 0.5 });
    // 低頻重拳
    this._thump(v, o, t, 125 * p, 42, 0.5, 0.3, 1.7);
    this._N(v, o, { t, b: 'p', a: 0.002, d: 0.26, g: 0.4, ft: 'lowpass', f: 1600, f1: 280, q: 0.8 });
    // 殘留高頻鳴
    this._T(v, o, { t: t + 0.01, f: 5400 * p, f1: 2600, a: 0.004, d: 0.35, g: 0.02 });
    // 座艙也感受到後座
    this._thump(v, this.bus.hull, t, 70, 36, 0.18, 0.2, 1.2);
    v.done();
  }

  missileLaunch(i) {
    if (!this._ok()) return;
    const n = Math.abs(num(i, 0) | 0);
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now();
    const p = (1 + 0.045 * ((n % 4) - 1.5)) * rnd(0.97, 1.03);
    const o = this._pan(v, (n % 2 ? 1 : -1) * rnd(0.2, 0.4), v.out);   // 左右肩的飛彈莢艙交替
    // 發射蓋「砰」
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.6, ft: 'bandpass', f: 1100 * p, q: 1.4 });
    this._thump(v, o, t, 110 * p, 50, 0.38, 0.18, 1.3);
    // 點火嘶吼：帶通由低往高掃（飛彈加速遠去）
    this._N(v, o, { t: t + 0.015, b: 'w', a: 0.02, h: 0.08, d: 0.55, g: 0.38, ft: 'bandpass', f: 600 * p, f1: 2800 * p, gl: 0.5, q: 1.2 });
    this._N(v, o, { t: t + 0.015, b: 'p', a: 0.01, d: 0.45, g: 0.45, ft: 'lowpass', f: 900, f1: 300, q: 0.7 });
    v.done();
  }

  reload() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now(), o = v.out, H = this.bus.hull;
    // 退出彈匣
    this._clank(v, o, t, rnd(850, 950), 0.1, 0.12, [1, 1.8, 3.1, 4.7]);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.03, g: 0.18, ft: 'bandpass', f: 2500, q: 2 });
    this._thump(v, H, t + 0.02, 180, 90, 0.12, 0.1, 1);
    // 滑軌摩擦
    this._N(v, o, { t: t + 0.08, b: 'p', a: 0.02, d: 0.15, g: 0.08, ft: 'bandpass', f: 1400, f1: 800, q: 3 });
    // 插入新彈匣
    const ti = t + 0.38;
    this._clank(v, o, ti, rnd(650, 750), 0.12, 0.15);
    this._thump(v, H, ti, 150, 80, 0.16, 0.12, 1);
    // 充能嗚聲
    const tc = t + 0.46;
    this._T(v, o, { t: tc, type: 'sawtooth', f: 180, f1: 1600, gl: 0.55, a: 0.1, h: 0.35, d: 0.12, g: 0.04, ft: 'lowpass', ff: 3000 });
    this._T(v, o, { t: tc, f: 360, f1: 3200, gl: 0.55, a: 0.1, h: 0.35, d: 0.12, g: 0.03 });
    // 座艙就緒提示
    this._T(v, this.bus.cab, { t: t + 1.02, type: 'triangle', f: 2350, a: 0.002, d: 0.14, g: 0.06 });
    v.done();
  }

  saberOn() {
    if (!this._ready || (this.sb && !this.sb.dead)) return;
    const c = this.ctx, t = this._now(), A = this.bus.arm;
    // 點燃：一次性掃頻＋嘶聲
    const v = this._voice(A, 2);
    if (v) {
      this._T(v, v.out, { t, type: 'sawtooth', f: 80, f1: 520, gl: 0.16, a: 0.005, d: 0.35, g: 0.15, ft: 'lowpass', ff: 2200, fq: 1.5 });
      this._N(v, v.out, { t, b: 'w', a: 0.003, d: 0.25, g: 0.13, ft: 'bandpass', f: 1200, f1: 3000, q: 2 });
      this._thump(v, v.out, t, 140, 60, 0.18, 0.2, 1.2);
      v.done();
    }
    // 持續嗡鳴：兩支略微走音的鋸齒（拍頻）＋八度正弦＋電嘶
    const R = new Rig(c);
    const out = R.gain(0, A);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.09, t + 0.25);
    const lp = R.filt('lowpass', 1100, 3, out);
    const o1 = R.osc('sawtooth', 92, lp, t);
    const o2 = R.osc('sawtooth', 93.4, lp, t);
    R.osc('sine', 184, R.gain(0.5, out), t);
    const lfo = R.osc('sine', 6.3, null, t);
    const lg = R.gain(2.2);
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    R.noise(this.nb.w, R.filt('bandpass', 3200, 3, R.gain(0.25, out)), t);
    R.out = out; R.o1 = o1; R.o2 = o2;
    this.sb = R;
  }

  saberOff() {
    if (!this._ready || !this.sb) return;
    const R = this.sb, t = this._now(), A = this.bus.arm;
    this.sb = null;
    const g = R.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.25);
    R.o1.frequency.setValueAtTime(92, t); R.o1.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    R.o2.frequency.setValueAtTime(93.4, t); R.o2.frequency.exponentialRampToValueAtTime(41, t + 0.25);
    R.kill(t + 0.32);
    // 熄滅音
    const v = this._voice(A, 2); if (!v) return;
    this._T(v, v.out, { t, type: 'sawtooth', f: 400, f1: 60, gl: 0.25, a: 0.004, d: 0.3, g: 0.1, ft: 'lowpass', ff: 1500 });
    this._N(v, v.out, { t, b: 'w', a: 0.003, d: 0.2, g: 0.07, ft: 'bandpass', f: 2500, f1: 600, q: 2 });
    v.done();
  }

  saberSwing() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now(), o = v.out, p = rnd(0.9, 1.1);
    // 風切「咻」：帶通先升後降
    this._N(v, o, { t, b: 'p', a: 0.07, h: 0.03, d: 0.3, g: 0.45, ft: 'bandpass', f: 350 * p, f1: 1800 * p, gl: 0.12, q: 2.2 });
    this._N(v, o, { t, b: 'w', a: 0.06, d: 0.28, g: 0.07, ft: 'bandpass', f: 2500 * p, f1: 5000, gl: 0.1, q: 3 });
    // 光刃嗡鳴的都卜勒
    const h = this._T(v, o, { t, type: 'sawtooth', f: 110 * p, f1: 260 * p, gl: 0.12, a: 0.06, d: 0.32, g: 0.07, ft: 'lowpass', ff: 900, fq: 2 });
    h.frequency.exponentialRampToValueAtTime(90 * p, t + 0.4);
    // 若光劍開著：嗡鳴本體也彎音
    if (this.sb) {
      for (const os of [this.sb.o1, this.sb.o2]) {
        const dt = os.detune;
        dt.cancelScheduledValues(t);
        dt.setValueAtTime(0, t);
        dt.linearRampToValueAtTime(700, t + 0.12);
        dt.linearRampToValueAtTime(-200, t + 0.3);
        dt.linearRampToValueAtTime(0, t + 0.45);
      }
    }
    v.done();
  }

  lockTick() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._T(v, o, { t, f: 2100, f1: 2900, gl: 0.03, a: 0.002, d: 0.08, g: 0.15 });
    this._T(v, o, { t, f: 4200, f1: 5800, gl: 0.03, a: 0.002, d: 0.05, g: 0.04 });
    v.done();
  }

  lockMulti(n) {
    if (!this._ok()) return;
    const k = clamp(num(n, 1) | 0, 1, 8);
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const t = this._now(), o = v.out, f = 780 * Math.pow(1.19, k - 1);
    this._T(v, o, { t, type: 'triangle', f, f1: f * 1.12, gl: 0.05, a: 0.002, h: 0.03, d: 0.07, g: 0.11 });
    this._T(v, o, { t, type: 'square', f: f * 2, a: 0.002, d: 0.05, g: 0.02, ft: 'lowpass', ff: 4000 });
    if (k >= 6) this._T(v, o, { t: t + 0.09, f: f * 1.5, a: 0.003, h: 0.05, d: 0.12, g: 0.09 });   // 滿鎖定
    v.done();
  }

  hitmarker() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.cab, 1); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.02, g: 0.42, ft: 'highpass', f: 4000 });
    this._T(v, o, { t, f: rnd(3300, 3500), a: 0.0005, d: 0.04, g: 0.1 });
    this._T(v, o, { t, type: 'triangle', f: 1700, a: 0.0005, d: 0.03, g: 0.055 });
    v.done();
  }

  hurt(strength, dir) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.1, 2), k = Math.min(s, 1.4), pd = clamp(num(dir, 0), -1, 1);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now();
    const o = this._pan(v, pd * 0.75, v.out);            // 結構傳來的撞擊
    const oc = this._pan(v, pd * 0.6, this.bus.cab);     // 座艙內的震動雜音
    // 裝甲受擊：沉重金屬撞擊
    this._clank(v, o, t, rnd(260, 420), 0.2 * k, 0.7, PLATE);
    this._clank(v, o, t + 0.005, rnd(600, 900), 0.08 * k, 0.4);
    this._thump(v, o, t, 95, 38, 0.45 * k, 0.35, 1.6);
    this._N(v, o, { t, b: 'p', a: 0.0008, d: 0.12, g: 0.5 * k, ft: 'bandpass', f: 1400, q: 0.9 });
    this._N(v, o, { t, b: 'b', a: 0.002, d: 0.35, g: 0.45 * k, ft: 'lowpass', f: 350, q: 0.8 });
    // 座艙震動：儀表、螺絲、面板亂響
    this._gran(v, oc, { t: t + 0.01, dur: 0.25 + 0.15 * s, b: 'w', ft: 'bandpass', fr: [2000, 4500], q: 6, g: 0.1 * k, gd: [0.006, 0.02], gap: [0.004, 0.035], fade: true });
    // 電路爆裂
    this._gran(v, oc, { t: t + 0.03, dur: 0.4, b: 'w', ft: 'highpass', f: 3000, q: 0.7, g: 0.07 * k, gd: [0.002, 0.008], gap: [0.01, 0.06], fade: true });
    v.done();
  }

  alert(kind) {
    if (!this._ok()) return;
    const t = this._now();
    if (kind === 'lock') { this._lockBeep(t, false); this._lockBeep(t + 0.16, false); }
    else if (kind === 'missile') { for (let i = 0; i < 3; i++) this._lockBeep(t + i * 0.1, true); }
    else if (kind === 'danger') {
      const v = this._voice(this.bus.cab, 2); if (!v) return;
      for (const dt of [0, 0.5]) {
        this._T(v, v.out, { t: t + dt, type: 'sawtooth', f: 320, f1: 380, gl: 0.35, a: 0.03, h: 0.3, d: 0.1, g: 0.13, ft: 'lowpass', ff: 1900 });
      }
      v.done();
    }
  }

  setLockAlert(level) {
    if (!this._ok()) return;
    const lv = clamp(num(level, 0), 0, 1);
    if (lv < 0.05) { this.lockNext = 0; return; }
    const now = this.ctx.currentTime, missile = lv >= 0.75;
    // 瞄準中：慢嗶；飛彈來襲：急促交替嗶
    const iv = missile ? 0.16 - 0.07 * (lv - 0.75) / 0.25 : 0.62 - 0.25 * (lv / 0.75);
    if (this.lockNext) this.lockNext = Math.min(this.lockNext, this.lockLast + iv);
    if (this.lockNext < now + 0.005) this.lockNext = Math.max(now + 0.01, this.lockLast + iv * 0.5);
    let guard = 0;
    while (this.lockNext < now + 0.1 && guard++ < 4) {
      this._lockBeep(this.lockNext, missile);
      this.lockLast = this.lockNext;
      this.lockNext += iv;
    }
  }

  setDanger(on) {
    on = !!on;
    this._dangerWant = on;
    if (!this._ready || on === !!this.dz) return;
    if (on) { this.dz = this._klaxon(); return; }
    const K = this.dz, t = this.ctx.currentTime;
    this.dz = null;
    K.out.gain.cancelScheduledValues(t);
    K.out.gain.setValueAtTime(K.out.gain.value, t);
    K.out.gain.linearRampToValueAtTime(0, t + 0.2);
    K.kill(t + 0.25);
  }

  overdrive() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, C = this.bus.cab, rise = 1.4;
    // 能量湧升：三層走音鋸齒一路往上，濾波同步打開
    for (const det of [-9, 0, 7]) {
      this._T(v, o, { t, type: 'sawtooth', f: 55, f1: 440, gl: rise, det, a: rise * 0.75, h: rise * 0.25, d: 0.35, g: 0.06, ft: 'lowpass', ff: 200, ff1: 4000, fgl: rise, fq: 4 });
    }
    this._T(v, o, { t, f: 32, f1: 64, gl: rise, a: rise * 0.85, h: 0.15, d: 0.45, g: 0.3 });
    this._N(v, o, { t, b: 'p', a: rise * 0.9, h: 0.1, d: 0.35, g: 0.22, ft: 'highpass', f: 400, f1: 3000, gl: rise, q: 0.7 });
    // 上升期間的電弧劈啪
    this._gran(v, C, { t: t + 0.3, dur: rise - 0.3, b: 'w', ft: 'highpass', f: 3500, q: 0.7, g: 0.05, gd: [0.002, 0.007], gap: [0.01, 0.07] });
    // 釋放衝擊
    const tr = t + rise + 0.05;
    this._thump(v, o, tr, 110, 34, 0.65, 0.9, 2);
    this._N(v, o, { t: tr, b: 'b', a: 0.005, d: 1.2, g: 0.9, ft: 'lowpass', f: 650, f1: 120, q: 0.8 });
    this._N(v, o, { t: tr, b: 'w', a: 0.001, d: 0.07, g: 0.35, ft: 'highpass', f: 1500 });
    // 高頻光暈（座艙儀表共鳴）
    for (const [f, g] of [[1320, 0.035], [1326, 0.03], [1980, 0.025], [2640, 0.018]]) {
      this._T(v, C, { t: tr, f, a: 0.01, d: 1.3, g });
    }
    v.done();
  }

  ui(kind) {
    if (!this._ok()) return;
    const t = this._now();
    if (kind === 'boot') return this._boot(t);
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out, H = this.bus.hull;
    if (kind === 'confirm') {
      this._T(v, o, { t, type: 'triangle', f: 1200, a: 0.002, d: 0.06, g: 0.09 });
      this._T(v, o, { t: t + 0.06, type: 'triangle', f: 1800, a: 0.002, d: 0.1, g: 0.09 });
    } else if (kind === 'wave') {
      // 戰鬥號角：兩聲低沉銅管
      const send = v.add(this.ctx.createGain()); send.gain.value = 0.6;
      o.connect(send); send.connect(this.rvbIn);
      for (const dt of [0, 0.9]) {
        const tt = t + dt;
        [[110, 0, 0.05], [110, 9, 0.05], [165, -5, 0.035], [220, 4, 0.03]].forEach(([f, det, g]) => {
          this._T(v, o, { t: tt, type: 'sawtooth', f, det, a: 0.1, h: 0.45, d: 0.35, g, ft: 'lowpass', ff: 280, ff1: 1300, fgl: 0.2, fq: 1.8 });
        });
        this._T(v, H, { t: tt, f: 55, a: 0.1, h: 0.45, d: 0.35, g: 0.16 });
      }
    } else if (kind === 'clear') {
      // 任務完成：大調琶音＋和聲墊
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const tt = t + i * 0.11;
        this._T(v, o, { t: tt, type: 'triangle', f, a: 0.005, d: 0.9, g: 0.16 });
        this._T(v, o, { t: tt, f: f * 2, a: 0.005, d: 0.5, g: 0.04 });
      });
      for (const f of [261.63, 392, 329.63]) {
        this._T(v, o, { t: t + 0.36, type: 'sawtooth', f, a: 0.3, h: 0.8, d: 1.2, g: 0.045, ft: 'lowpass', ff: 1200 });
      }
    } else if (kind === 'fail') {
      // 任務失敗：小調下行＋斷電
      [[392, 0], [349.23, 0.28], [311.13, 0.56], [261.63, 0.9]].forEach(([f, dt], i) => {
        this._T(v, o, { t: t + dt, type: 'sawtooth', f, a: 0.01, h: 0.12, d: i === 3 ? 1.4 : 0.4, g: 0.055, ft: 'lowpass', ff: 1400 });
        this._T(v, o, { t: t + dt, f: f / 2, a: 0.01, h: 0.12, d: i === 3 ? 1.4 : 0.4, g: 0.05 });
      });
      this._T(v, H, { t, f: 180, f1: 30, gl: 1.6, a: 0.05, h: 0.3, d: 1.3, g: 0.12 });
    } else {
      this._T(v, o, { t, type: 'triangle', f: 1000, a: 0.002, d: 0.05, g: 0.06 });
    }
    v.done();
  }

  // ───────────────────────── 外界（立體聲定位） ─────────────────────────

  enemyStep(pos, strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 2);
    const S = this._spat(pos, { ref: 18, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t, d } = S;
    this._thump(v, o, t, rnd(48, 58), 28, 0.4 * s, 0.45, 1.8);
    this._N(v, o, { t, b: 'b', a: 0.003, d: 0.4, g: 0.42 * s, ft: 'lowpass', f: 260, f1: 100, q: 0.8 });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.22 * s, ft: 'bandpass', f: rnd(280, 360), q: 1 });
    this._clank(v, o, t + rnd(0.02, 0.06), rnd(160, 230), 0.06 * s, 0.3);
    if (d < 60 && Math.random() < 0.4) this._creak(v, o, t + 0.08, 0.25, 0.04 * s);
    // 很近：地面傳進座艙的震動
    if (d < 45) this._thump(v, this.bus.hull, t, 50, 30, 0.22 * s * (1 - d / 45), 0.35, 1.3);
    v.done();
  }

  enemyBoost(id, pos, level) {
    if (!this._ok()) return;
    const lv = clamp(num(level, 0), 0, 1), now = this.ctx.currentTime;
    let e = this.eb.get(id);
    if (!e) {
      if (lv < 0.01 || this.eb.size >= 8) return;
      e = this._ebLoop();
      this.eb.set(id, e);
    }
    e.seen = now;
    const G = this._geo(pos, 25);
    this._st(e.g.gain, 0.45 * lv * G.att, now, 0.08);
    this._st(e.sg.gain, 0.2 * lv * Math.min(1, Math.sqrt(G.att) * 1.25), now, 0.08);
    if (e.pn.pan) this._st(e.pn.pan, G.pan, now, 0.08);
    this._st(e.lp.frequency, G.fc, now, 0.08);
    this._st(e.bp.frequency, 500 + 1100 * lv, now, 0.1);
    if (lv >= 0.01) e.on = now;
    else if (now - e.on > 0.6) this._ebKill(id, e);
  }

  enemyBeam(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 18, rv: 0.3, prio: 1 }); if (!S) return;
    const { v, o, t } = S, p = rnd(0.9, 1.1);
    this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.03, g: 0.4, ft: 'highpass', f: 2500 });
    this._T(v, o, { t, type: 'sawtooth', f: 2600 * p, f1: 280, gl: 0.2, a: 0.001, d: 0.25, g: 0.14, ft: 'lowpass', ff: 6000, ff1: 1000, fq: 1.5 });
    this._N(v, o, { t, b: 'w', a: 0.002, h: 0.03, d: 0.25, g: 0.14, ft: 'highpass', f: 3800, am: rnd(60, 90) });
    this._thump(v, o, t, 110 * p, 45, 0.3, 0.22, 1.4);
    v.done();
  }

  mg(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 20, rv: 0.35, prio: 0, min: 0.006 }); if (!S) return;
    const { v, o, t } = S;
    // 槍口爆裂（重口徑的尖銳裂聲）
    this._N(v, o, { t, b: 'w', a: 0.0004, d: rnd(0.025, 0.04), g: 0.7, ft: 'highpass', f: rnd(1500, 2200) });
    // 本體「砰」
    this._N(v, o, { t, b: 'p', a: 0.0008, d: rnd(0.07, 0.1), g: 0.78, ft: 'bandpass', f: rnd(500, 750), q: 1.1 });
    // 低頻
    this._thump(v, o, t, rnd(140, 170), 60, 0.42, 0.09, 1.4);
    v.done();
  }

  cannon(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 40, rv: 0.5, prio: 2, delay: true, min: 0.002 }); if (!S) return;
    const { v, o, t, d } = S, p = rnd(0.92, 1.08);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05, g: 0.7, ft: 'highpass', f: 1200 });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.35, g: 0.8, ft: 'bandpass', f: 700 * p, f1: 300, q: 0.8 });
    this._thump(v, o, t, 75 * p, 28, 0.8, 1.1, 2.2);
    this._N(v, o, { t, b: 'b', a: 0.004, d: 1.4, g: 1.0, ft: 'lowpass', f: 500, f1: 120, q: 0.8 });
    this._N(v, o, { t: t + 0.05, b: 'b', a: 0.1, d: 1.8, g: 0.35, ft: 'lowpass', f: 150, q: 0.7 });
    if (d < 60) this._thump(v, this.bus.hull, t, 60, 30, 0.25 * (1 - d / 60), 0.4, 1.3);
    v.done();
  }

  missileLaunch3d(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 20, rv: 0.3, prio: 1 }); if (!S) return;
    const { v, o, t } = S, p = rnd(0.92, 1.08);
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.62, ft: 'bandpass', f: 1000 * p, q: 1.3 });
    this._thump(v, o, t, 100 * p, 50, 0.35, 0.15, 1.3);
    this._N(v, o, { t, b: 'w', a: 0.02, h: 0.1, d: 0.6, g: 0.48, ft: 'bandpass', f: 700 * p, f1: 2600 * p, gl: 0.5, q: 1.2 });
    this._N(v, o, { t, b: 'p', a: 0.01, d: 0.5, g: 0.45, ft: 'lowpass', f: 900, f1: 300, q: 0.7 });
    v.done();
  }

  whiz(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 12, rv: 0.08, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    // 超音速彈頭的 N 波「啪」
    this._N(v, o, { t, b: 'w', a: 0.0002, d: 0.012, g: 1.1, ft: 'highpass', f: 2500 });
    // 掠過的「咻」：都卜勒下滑
    this._N(v, o, { t, b: 'w', a: 0.008, d: 0.18, g: 0.65, ft: 'bandpass', f: rnd(3500, 4500), f1: rnd(900, 1400), gl: 0.15, q: 3.5 });
    v.done();
  }

  impact(pos, kind) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.25, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    if (kind === 'armor') {
      // 金屬「鏘」＋火花劈啪
      this._clank(v, o, t, rnd(420, 650), 0.22, 0.5, PLATE);
      this._clank(v, o, t, rnd(1100, 1500), 0.09, 0.2);
      this._thump(v, o, t, 130, 60, 0.28, 0.15, 1.3);
      this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05, g: 0.3, ft: 'highpass', f: 3500 });
      this._gran(v, o, { t: t + 0.01, dur: 0.2, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.11, gd: [0.002, 0.006], gap: [0.005, 0.03], fade: true });
    } else if (kind === 'building') {
      // 混凝土碎裂
      this._thump(v, o, t, 95, 45, 0.38, 0.25, 1.5);
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.12, g: 0.5, ft: 'bandpass', f: 1500, q: 0.9 });
      this._gran(v, o, { t, dur: 0.35, b: 'w', ft: 'bandpass', fr: [900, 2600], q: 1.5, g: 0.28, gd: [0.004, 0.015], gap: [0.002, 0.02], fade: true });
      this._N(v, o, { t, b: 'b', a: 0.003, d: 0.4, g: 0.45, ft: 'lowpass', f: 350, q: 0.8 });
      this._gran(v, o, { t: t + 0.12, dur: 0.5, b: 'p', ft: 'bandpass', fr: [2000, 4000], q: 2, g: 0.1, gd: [0.005, 0.015], gap: [0.02, 0.08], fade: true });
    } else if (kind === 'beam') {
      // 光束灼燒：滋滋聲＋下滑電弧
      this._N(v, o, { t, b: 'w', a: 0.001, h: 0.08, d: 0.35, g: 0.5, ft: 'highpass', f: 3000, am: rnd(55, 80) });
      this._T(v, o, { t, type: 'sawtooth', f: 1400, f1: 200, gl: 0.2, a: 0.001, d: 0.25, g: 0.18, ft: 'bandpass', ff: 1200, fq: 2 });
      this._N(v, o, { t, b: 'p', a: 0.002, d: 0.2, g: 0.5, ft: 'lowpass', f: 800, q: 0.7 });
    } else {
      // 地面：泥土悶響＋噴濺＋碎石
      this._thump(v, o, t, 80, 38, 0.42, 0.3, 1.5);
      this._N(v, o, { t, b: 'b', a: 0.003, d: 0.35, g: 0.6, ft: 'lowpass', f: 400, f1: 150, q: 0.8 });
      this._N(v, o, { t: t + 0.01, b: 'p', a: 0.004, d: 0.25, g: 0.3, ft: 'bandpass', f: 900, q: 0.8 });
      this._gran(v, o, { t: t + 0.05, dur: 0.35, b: 'p', ft: 'bandpass', fr: [1500, 3500], q: 2, g: 0.11, gd: [0.004, 0.012], gap: [0.01, 0.05], fade: true });
    }
    v.done();
  }

  explosion(pos, size) {
    if (!this._ok()) return;
    const k = clamp(num(size, 1), 0.5, 3.5);
    const S = this._spat(pos, { ref: 25 + 22 * k, rv: 0.4 + 0.12 * k, delay: true, prio: 2, min: 0.0015 }); if (!S) return;
    const { v, o, t, d } = S, p = rnd(0.9, 1.1);
    // 起爆裂擊（瞬態）
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05 + 0.03 * k, g: 0.6, ft: 'highpass', f: 900 * p });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.25 + 0.12 * k, g: 0.7, ft: 'bandpass', f: 1400 * p, f1: 350, q: 0.7 });
    // 本體「轟」
    this._thump(v, o, t, (78 - 8 * k) * p, 22, 0.5 + 0.2 * k, 0.8 + 0.6 * k, 2.4);
    this._N(v, o, { t, b: 'b', a: 0.004, d: 1.0 + 0.8 * k, g: 0.8 + 0.3 * k, ft: 'lowpass', f: 900 * p, f1: 130, gl: 0.5 + 0.5 * k, q: 0.8 });
    this._N(v, o, { t, b: 'p', a: 0.002, d: 0.5 + 0.3 * k, g: 0.4, ft: 'lowpass', f: 2600, f1: 450, q: 0.6 });
    // 滾動尾音
    this._N(v, o, { t: t + 0.06, b: 'b', a: 0.2, h: 0.12 * k, d: 1.4 + 1.3 * k, g: 0.3 + 0.15 * k, ft: 'lowpass', f: 200, q: 0.7 });
    // 建築碎塊落下
    if (k >= 1.8) {
      this._gran(v, o, { t: t + 0.15, dur: 0.8 + 0.4 * k, b: 'p', ft: 'bandpass', fr: [700, 2500], q: 1.2, g: 0.16, gd: [0.006, 0.02], gap: [0.01, 0.06], fade: true });
    }
    // 機體殉爆：二次、三次爆炸＋火焰＋金屬碎片雨
    if (k >= 2.5) {
      for (const [dt, g] of [[0.18, 0.55], [0.47, 0.45]]) {
        const ts = t + dt * rnd(0.85, 1.15);
        this._thump(v, o, ts, 62, 22, g, 1.2, 2.2);
        this._N(v, o, { t: ts, b: 'b', a: 0.005, d: 1.5, g: g * 1.1, ft: 'lowpass', f: 550, f1: 140, q: 0.8 });
        this._N(v, o, { t: ts, b: 'w', a: 0.0005, d: 0.04, g: g * 0.7, ft: 'highpass', f: 1500 });
      }
      this._T(v, o, { t, f: 42, f1: 18, gl: 2.5, a: 0.01, d: 3.0, g: 0.5 });
      this._N(v, o, { t: t + 0.1, b: 'p', a: 0.3, h: 0.4, d: 1.8, g: 0.3, ft: 'bandpass', f: 500, f1: 250, q: 0.6 });
      this._gran(v, o, { t: t + 0.5, dur: 2.0, b: 'w', ft: 'bandpass', fr: [1500, 5000], q: 6, g: 0.11, gd: [0.008, 0.03], gap: [0.02, 0.12], fade: true });
      for (let i = 0; i < 5; i++) this._clank(v, o, t + rnd(0.5, 2.3), rnd(300, 1200), rnd(0.03, 0.08), 0.3);
    }
    // 近距離：衝擊波震動座艙
    if (d < 100) {
      const near = (1 - d / 100) * Math.min(1, k / 2);
      this._thump(v, this.bus.hull, t, 48, 24, 0.5 * near, 0.7 + 0.3 * k, 1.5);
      this._gran(v, this.bus.cab, { t: t + 0.02, dur: 0.3 + 0.15 * k, b: 'w', ft: 'bandpass', fr: [1800, 4500], q: 5, g: 0.09 * near, gd: [0.004, 0.015], gap: [0.004, 0.03], fade: true });
    }
    v.done();
  }

  debris(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.25, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    this._thump(v, o, t, 90, 45, 0.22, 0.2, 1.3);
    this._gran(v, o, { t, dur: rnd(0.6, 1.0), b: 'w', ft: 'bandpass', fr: [800, 4000], q: 4, g: 0.22, gd: [0.006, 0.025], gap: [0.015, 0.09], fade: true });
    this._gran(v, o, { t, dur: 0.5, b: 'p', ft: 'bandpass', fr: [300, 900], q: 1.5, g: 0.28, gd: [0.01, 0.04], gap: [0.03, 0.12], fade: true });
    for (let i = 0; i < 3; i++) this._clank(v, o, t + rnd(0, 0.7), rnd(400, 1400), rnd(0.03, 0.07), rnd(0.15, 0.35));
    v.done();
  }

  trample(pos, kind) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    if (kind === 'tree') {
      // 樹幹折斷「啪」＋木頭撕裂＋枝葉沙沙
      this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.04, g: 0.5, ft: 'bandpass', f: 2500, q: 0.8 });
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.12, g: 0.32, ft: 'bandpass', f: 900, q: 1.2 });
      this._gran(v, o, { t: t + 0.02, dur: 0.25, b: 'p', ft: 'bandpass', fr: [400, 1400], q: 3, g: 0.22, gd: [0.01, 0.03], gap: [0.005, 0.03], fade: true });
      this._gran(v, o, { t: t + 0.05, dur: 0.8, b: 'w', ft: 'highpass', fr: [2500, 5000], q: 0.7, g: 0.05, gd: [0.01, 0.04], gap: [0.001, 0.01], fade: true });
      this._thump(v, o, t + 0.35, 70, 40, 0.18, 0.3, 1.2);
    } else if (kind === 'lamp') {
      // 金屬桿被壓彎：撞擊、呻吟、倒地
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.08, g: 0.28, ft: 'bandpass', f: 1500, q: 1 });
      this._clank(v, o, t, rnd(600, 800), 0.16, 0.9);
      this._T(v, o, { t: t + 0.03, type: 'sawtooth', f: 85, f1: 55, gl: 0.6, a: 0.05, h: 0.2, d: 0.4, g: 0.1, ft: 'bandpass', ff: 600, fq: 7 });
      this._thump(v, o, t + 0.5, 80, 40, 0.18, 0.25, 1.2);
      this._clank(v, o, t + 0.5, rnd(380, 440), 0.08, 0.5);
    } else {
      // 汽車被踩扁：鈑金擠壓＋玻璃碎裂
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.15, g: 0.45, ft: 'bandpass', f: 700, q: 0.8 });
      this._thump(v, o, t, 70, 35, 0.32, 0.3, 1.4);
      this._gran(v, o, { t, dur: 0.35, b: 'w', ft: 'bandpass', fr: [600, 2200], q: 2.5, g: 0.3, gd: [0.005, 0.02], gap: [0.003, 0.02], fade: true });
      this._T(v, o, { t, type: 'sawtooth', f: 70, f1: 45, gl: 0.4, a: 0.02, d: 0.4, g: 0.12, ft: 'bandpass', ff: 500, fq: 5 });
      for (let i = 0; i < 6; i++) this._T(v, o, { t: t + rnd(0.01, 0.25), f: rnd(2800, 6500), a: 0.0005, d: rnd(0.05, 0.15), g: rnd(0.02, 0.045) });
      this._gran(v, o, { t: t + 0.02, dur: 0.3, b: 'w', ft: 'highpass', f: 5000, q: 0.7, g: 0.1, gd: [0.002, 0.008], gap: [0.005, 0.03], fade: true });
    }
    v.done();
  }

  // ───────────────────────── 內部：每幀維護 ─────────────────────────

  _ok() { return this._ready && !this.paused; }
  _now() { return this.ctx.currentTime + 0.005; }

  _tick() {
    const now = this.ctx.currentTime;
    // 主程式停止呼叫 boost() 時自動收掉推進器
    if (this.bl && now - this.bl.call > 0.3) this._boostSet(0);
    // 沒有更新的敵機推進器（被擊毀、離開）淡出
    for (const [id, e] of this.eb) if (now - e.seen > 0.5) this._ebKill(id, e);
  }

  _voice(dest, prio) {
    const cap = prio === 0 ? MG_CAP : prio === 1 ? MINOR_CAP : HARD_CAP;
    if (this.voices >= cap) return null;
    return new Voice(this, dest);
  }

  // 參數平滑追蹤；目標沒變就不重複排程（避免每幀堆積自動化事件）
  _st(param, v, now, tc) {
    const last = param._tgt;
    if (last !== undefined && Math.abs(last - v) <= Math.max(1e-4, Math.abs(v) * 0.02)) return;
    param.setTargetAtTime(v, now, tc);
    param._tgt = v;
  }

  // 聽者相對幾何：距離、衰減、左右聲像、距離低通（越遠越悶，背後再悶一點）
  _geo(pos, ref) {
    const L = this.lis;
    let dx = 0, dy = 0, dz = 0;
    if (pos) { dx = num(pos.x, L.x) - L.x; dy = num(pos.y, L.y) - L.y; dz = num(pos.z, L.z) - L.z; }
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const att = ref / (ref + Math.max(0, d - ref));
    const hz = Math.sqrt(dx * dx + dz * dz);
    let pan = 0, front = 1;
    if (hz > 0.01) {
      pan = (dx * this.rx + dz * this.rz) / hz;
      front = (dx * this.fx + dz * this.fz) / hz;
    }
    pan = clamp(pan * 0.85 * Math.min(1, hz / 8), -0.9, 0.9);
    let fc = 20000 / (1 + d / 90);
    if (front < 0) fc *= 1 + front * 0.35;
    return { d, att, pan, fc: clamp(fc, 450, 18000) };
  }

  // 建立一個定位聲音：來源 → 距離低通 → 聲像 → 衰減 → world；聲像後另送城市殘響（遠處殘響比例較高）
  _spat(pos, o) {
    const G = this._geo(pos, o.ref);
    if (G.att < (o.min ?? 0.004)) return null;
    const v = this._voice(this.bus.world, o.prio ?? 1); if (!v) return null;
    const c = this.ctx;
    const lp = this._filt(v, 'lowpass', G.fc, 0.5);
    const pn = this._pan(v, G.pan, v.out);
    lp.connect(pn);
    v.out.gain.value = G.att;
    const sg = v.add(c.createGain());
    sg.gain.value = (o.rv ?? 0.25) * Math.min(1, Math.sqrt(G.att) * 1.25);
    pn.connect(sg); sg.connect(this.rvbIn);
    let t = this._now();
    if (o.delay && G.d > 35) t += Math.min(MAX_DELAY, G.d / SOS);
    return { v, o: lp, t, d: G.d };
  }

  // ───────────────────────── 內部：合成積木 ─────────────────────────

  // 包絡：線性起音 → 保持 → 指數衰減；回傳結束時間
  _env(p, t, a, g, h, d) {
    g = Math.max(g, E * 2);
    p.setValueAtTime(E, t);
    p.linearRampToValueAtTime(g, t + a);
    if (h > 0) p.setValueAtTime(g, t + a + h);
    p.exponentialRampToValueAtTime(E, t + a + h + d);
    return t + a + h + d;
  }

  _filt(v, type, f, q) {
    const b = v.add(this.ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q ?? 0.707;
    return b;
  }

  _pan(v, val, dest) {
    const c = this.ctx;
    const p = v.add(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    if (p.pan) p.pan.value = clamp(val, -1, 1);
    if (dest) p.connect(dest);
    return p;
  }

  // 音調層：o = { t, type, f, f1, gl, det, a, h, d, g, ft, ff, ff1, fgl, fq }
  _T(v, dest, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.003, h = o.h ?? 0, d = o.d ?? 0.2;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.gl ?? a + h + d));
    if (o.det) osc.detune.value = o.det;
    let n = osc;
    if (o.ft) {
      const b = this._filt(v, o.ft, o.ff, o.fq);
      b.frequency.setValueAtTime(o.ff, t);
      if (o.ff1) b.frequency.exponentialRampToValueAtTime(o.ff1, t + (o.fgl ?? a + h + d));
      n.connect(b); n = b;
    }
    const g = v.add(c.createGain());
    const end = this._env(g.gain, t, a, o.g, h, d);
    n.connect(g); g.connect(dest);
    v.play(osc, t, end + 0.03);
    return osc;
  }

  // 雜訊層：o = { t, b:'w'|'p'|'b', rate, a, h, d, g, ft, f, f1, gl, q, am, amd }
  _N(v, dest, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.002, h = o.h ?? 0, d = o.d ?? 0.2;
    const buf = this.nb[o.b || 'w'];
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    let n = s;
    if (o.ft) {
      const b = this._filt(v, o.ft, o.f, o.q);
      b.frequency.setValueAtTime(o.f, t);
      if (o.f1) b.frequency.exponentialRampToValueAtTime(o.f1, t + (o.gl ?? a + h + d));
      n.connect(b); n = b;
    }
    const end = t + a + h + d;
    if (o.am) {
      // 方波調幅：電弧的「滋滋」顆粒感
      const depth = o.amd ?? 0.5;
      const m = v.add(c.createGain()); m.gain.value = 1 - depth;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = o.am;
      const lg = v.add(c.createGain()); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(m.gain);
      v.play(lfo, t, end + 0.03);
      n.connect(m); n = m;
    }
    const g = v.add(c.createGain());
    this._env(g.gain, t, a, o.g, h, d);
    n.connect(g); g.connect(dest);
    v.play(s, t, end + 0.03, Math.random() * (buf.duration - 0.5));
    return s;
  }

  // 次低頻下墜：正弦往下滑＋飽和（小喇叭也聽得到諧波）
  _thump(v, dest, t, f0, f1, g, d, drive) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
    const pre = v.add(c.createGain()); pre.gain.value = drive || 1;
    const sh = v.add(c.createWaveShaper()); sh.curve = this.curves.soft;
    const eg = v.add(c.createGain());
    const end = this._env(eg.gain, t, 0.004, g, 0, d);
    osc.connect(pre); pre.connect(sh); sh.connect(eg); eg.connect(dest);
    v.play(osc, t, end + 0.03);
  }

  // 金屬撞擊：不諧和泛音（高頻衰減較快）＋短促雜訊瞬態
  _clank(v, dest, t, f, g, d, ratios) {
    const R = ratios || BAR;
    for (let i = 0; i < R.length; i++) {
      const fi = f * R[i] * rnd(0.985, 1.015);
      if (fi > 16000) break;
      this._T(v, dest, { t, f: fi, a: 0.0015, d: d * rnd(0.7, 1) / (1 + i * 0.6), g: g / (1 + i * 0.7) });
    }
    this._N(v, dest, { t, b: 'w', a: 0.0005, d: 0.025, g: g * 1.2, ft: 'bandpass', f: Math.min(f * 4, 9000), q: 1.5 });
  }

  // 關節嘎吱：低頻鋸齒脈衝串通過共振帶通（摩擦黏滑）
  _creak(v, dest, t, dur, g) {
    const f = rnd(38, 70);
    const osc = this._T(v, dest, { t, type: 'sawtooth', f, a: dur * 0.25, h: dur * 0.35, d: dur * 0.4, g, ft: 'bandpass', ff: rnd(650, 1300), fq: 8 });
    osc.frequency.linearRampToValueAtTime(f * rnd(1.2, 1.6), t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(f * rnd(0.7, 0.95), t + dur);
  }

  // 顆粒層：同一條雜訊用一串短包絡切成碎響（碎裂、礫石、電弧、震動雜音）
  // o = { t, dur, b, ft, f, fr:[lo,hi], q, g, gd:[lo,hi], gap:[lo,hi], fade }
  _gran(v, dest, o) {
    const c = this.ctx, buf = this.nb[o.b || 'w'];
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    const b = this._filt(v, o.ft || 'bandpass', o.f || (o.fr ? o.fr[0] : 2000), o.q ?? 1);
    const g = v.add(c.createGain());
    const p = g.gain, t0 = o.t, t1 = o.t + o.dur;
    p.setValueAtTime(E, t0);
    let tk = t0 + rnd(0, o.gap[0]), n = 0;
    while (tk < t1 && n < 64) {
      const gd = rnd(o.gd[0], o.gd[1]);
      const k = o.fade ? 1 - 0.85 * (tk - t0) / o.dur : 1;
      if (o.fr) b.frequency.setValueAtTime(rnd(o.fr[0], o.fr[1]), tk);
      p.setValueAtTime(E, tk);
      p.linearRampToValueAtTime(Math.max(E * 2, o.g * k * rnd(0.35, 1)), tk + 0.0008);
      p.exponentialRampToValueAtTime(E, tk + 0.0008 + gd);
      tk += 0.0008 + gd + rnd(o.gap[0], o.gap[1]);
      n++;
    }
    s.connect(b); b.connect(g); g.connect(dest);
    v.play(s, t0, tk + 0.03, Math.random() * (buf.duration - 0.5));
  }

  // ───────────────────────── 內部：循環音 ─────────────────────────

  // 自機推進器：低頻轟鳴＋噴流吼聲＋高頻嘶聲＋次低頻＋渦輪鳴，燃燒抖動
  _boostLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const out = R.gain(0, this.bus.hull);
    const fl = R.gain(1, out);                 // 燃燒抖動
    const flo = R.osc('sine', 11.3, null, t);
    const flg = R.gain(0.12); flo.connect(flg); flg.connect(fl.gain);
    const lp = R.filt('lowpass', 150, 0.9, R.gain(1.1, fl));
    R.noise(nb.b, lp, t);
    const bp = R.filt('bandpass', 700, 0.9, R.gain(0.9, fl));
    R.noise(nb.p, bp, t);
    R.noise(nb.w, R.filt('highpass', 2600, 0.7, R.gain(0.16, fl)), t);
    R.osc('sine', 44, R.gain(0.22, fl), t);
    const tw = R.osc('sine', 700, R.gain(0.018, fl), t);
    Object.assign(R, { out, lp, bp, tw, call: t, on: t });
    return R;
  }

  _boostSet(lv) {
    const now = this.ctx.currentTime;
    if (!this.bl) {
      if (lv < 0.005) return;
      this.bl = this._boostLoop();
    }
    const B = this.bl;
    B.call = now;
    this._st(B.out.gain, 0.38 * Math.pow(lv, 0.8), now, 0.07);
    this._st(B.bp.frequency, 420 + 1200 * lv, now, 0.12);
    this._st(B.lp.frequency, 110 + 200 * lv, now, 0.12);
    this._st(B.tw.frequency, 700 + 900 * lv, now, 0.2);
    if (lv >= 0.005) B.on = now;
    else if (now - B.on > 1.0) { B.kill(now + 0.05); this.bl = null; }
  }

  // 敵機推進器：粉紅噪帶通＋棕噪低頻，外接距離低通、聲像、衰減、殘響
  _ebLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c);
    const g = R.gain(0, this.bus.world);
    const sg = R.gain(0, this.rvbIn);
    const pn = R.pan(g); pn.connect(sg);
    const lp = R.filt('lowpass', 8000, 0.5, pn);
    const bp = R.filt('bandpass', 900, 0.8, lp);
    R.noise(this.nb.p, bp, t);
    R.noise(this.nb.b, R.filt('lowpass', 200, 0.8, R.gain(1.2, lp)), t);
    Object.assign(R, { g, sg, pn, lp, bp, seen: t, on: t });
    return R;
  }

  _ebKill(id, e) {
    const now = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, now, 0.06);
    e.sg.gain.setTargetAtTime(0, now, 0.06);
    e.kill(now + 0.4);
    this.eb.delete(id);
  }

  // 低裝甲警報：同一支 LFO 同時控制「開關閘門」與「音高上揚」，完全在音訊圖內自走
  _klaxon() {
    const c = this.ctx, t = this._now(), R = new Rig(c);
    const out = R.gain(0, this.bus.cab);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.17, t + 0.15);
    const lp = R.filt('lowpass', 2000, 1, out);
    const amp = R.gain(0, lp);
    const o1 = R.osc('sawtooth', 330, amp, t);
    const o2 = R.osc('square', 495, R.gain(0.35, amp), t);
    const lfo = R.osc('sine', 1.3, null, t);
    const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.gate;
    lfo.connect(sh); sh.connect(amp.gain);
    const p1 = R.gain(28), p2 = R.gain(42);
    lfo.connect(p1); p1.connect(o1.frequency);
    lfo.connect(p2); p2.connect(o2.frequency);
    R.out = out;
    return R;
  }

  _lockBeep(t, missile) {
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out;
    if (missile) {
      this.lockAlt ^= 1;
      const f = this.lockAlt ? 2280 : 1860;
      this._T(v, o, { t, type: 'square', f, a: 0.002, h: 0.035, d: 0.03, g: 0.08, ft: 'lowpass', ff: 5000 });
      this._T(v, o, { t, f: f / 2, a: 0.002, h: 0.035, d: 0.03, g: 0.09 });
    } else {
      this._T(v, o, { t, type: 'triangle', f: 1180, a: 0.004, h: 0.05, d: 0.06, g: 0.16 });
      this._T(v, o, { t, f: 2360, a: 0.004, h: 0.05, d: 0.04, g: 0.032 });
    }
    v.done();
  }

  // 開機：繼電器、發電機起轉、自檢嗶聲、資料吱吱、完成和弦（約 2.5 秒）
  _boot(t) {
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out, H = this.bus.hull;
    this._clank(v, H, t, 150, 0.1, 0.25, PLATE);
    this._thump(v, H, t, 70, 40, 0.28, 0.3, 1.5);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.02, g: 0.22, ft: 'bandpass', f: 1800, q: 2 });
    this._N(v, o, { t: t + 0.13, b: 'w', a: 0.0005, d: 0.02, g: 0.16, ft: 'bandpass', f: 2400, q: 2 });
    this._T(v, H, { t: t + 0.1, type: 'sawtooth', f: 28, f1: 220, gl: 2.0, a: 0.6, h: 1.2, d: 0.6, g: 0.09, ft: 'lowpass', ff: 160, ff1: 1400, fgl: 2.0, fq: 2.5 });
    this._T(v, H, { t: t + 0.1, f: 36, f1: 72, gl: 2.0, a: 0.8, h: 1.0, d: 0.6, g: 0.16 });
    this._T(v, o, { t: t + 0.2, f: 700, f1: 3100, gl: 1.9, a: 0.7, h: 1.0, d: 0.5, g: 0.012 });
    [0.42, 0.58, 0.74, 0.9, 1.06, 1.22, 1.38].forEach((dt, i) => {
      this._T(v, o, { t: t + dt, type: 'triangle', f: 520 * Math.pow(2, i / 6), a: 0.003, h: 0.035, d: 0.06, g: 0.065 });
    });
    let tc = t + 1.5;
    for (let i = 0; i < 10; i++) {
      this._T(v, o, { t: tc, type: 'square', f: rnd(1400, 3600), a: 0.001, h: 0.012, d: 0.015, g: 0.018, ft: 'lowpass', ff: 6000 });
      tc += rnd(0.04, 0.07);
    }
    const tf = t + 2.2;
    for (const [f, g, type] of [[440, 0.05, 'triangle'], [880, 0.055, 'sine'], [1318.5, 0.04, 'sine'], [1760, 0.03, 'sine']]) {
      this._T(v, o, { t: tf, type, f, a: 0.008, d: 0.8, g });
    }
    v.done();
  }

  // 常駐環境音：座艙電氣嗡聲、反應爐低頻脈動、渦輪細鳴、空調氣流、外面的風
  _startAmbience() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const g = this.ambG;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.65, t + 2.5);
    // 電氣嗡聲
    const hum = R.gain(0.01, g);
    R.osc('sawtooth', 59.7, R.filt('lowpass', 380, 0.8, hum), t);
    R.osc('sine', 119.6, R.gain(0.4, hum), t);
    // 反應爐：低頻雜訊＋41 Hz，0.37 Hz 緩慢脈動
    const rx = R.gain(0.1, g);
    R.noise(nb.b, R.filt('lowpass', 95, 1.2, rx), t);
    R.osc('sine', 41, R.gain(0.35, rx), t);
    const th = R.osc('sine', 0.37, null, t), thg = R.gain(0.035);
    th.connect(thg); thg.connect(rx.gain);
    // 渦輪細鳴
    const wo = R.osc('sine', 2330, R.gain(0.0022, g), t);
    const vib = R.osc('sine', 0.23, null, t), vg = R.gain(6);
    vib.connect(vg); vg.connect(wo.frequency);
    // 空調氣流
    R.noise(nb.p, R.filt('bandpass', 1300, 0.6, R.gain(0.018, g)), t);
    // 外面的風：走 world 匯流排（被座艙隔音悶掉），兩支慢 LFO 做陣風
    const wf = R.gain(0, this.bus.world);
    wf.gain.setValueAtTime(0, t);
    wf.gain.linearRampToValueAtTime(1, t + 4);
    const wind = R.gain(0.05, wf);
    const wbp = R.filt('bandpass', 420, 0.9, wind);
    R.noise(nb.p, wbp, t);
    for (const [f, dpt] of [[0.071, 0.03], [0.13, 0.015]]) {
      const l = R.osc('sine', f, null, t), lg = R.gain(dpt);
      l.connect(lg); lg.connect(wind.gain);
    }
    const wl = R.osc('sine', 0.053, null, t), wlg = R.gain(160);
    wl.connect(wlg); wlg.connect(wbp.frequency);
    this.amb = R;
  }

  // ───────────────────────── 內部：建構 ─────────────────────────

  // 預先產生雜訊（白、粉紅、棕），各 2～3 秒，循環接縫交叉淡化，均方根統一為 0.3
  _makeNoise() {
    const c = this.ctx, sr = c.sampleRate, X = 2048;
    const mk = (sec, fill) => {
      const n = Math.floor(sr * sec), tmp = new Float32Array(n + X);
      fill(tmp);
      for (let i = 0; i < X; i++) { const w = i / X; tmp[i] = tmp[i] * w + tmp[n + i] * (1 - w); }
      let mean = 0; for (let i = 0; i < n; i++) mean += tmp[i];
      mean /= n;
      let ss = 0; for (let i = 0; i < n; i++) { const x = tmp[i] - mean; ss += x * x; }
      const k = 0.3 / Math.sqrt(ss / n || 1);
      const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (tmp[i] - mean) * k;
      return b;
    };
    const white = (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; };
    const pink = (a) => {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < a.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        a[i] = b0 + b1 + b2 + w * 0.1848;
      }
    };
    const brown = (a) => {
      let y = 0;
      for (let i = 0; i < a.length; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = y; }
    };
    this.nb = { w: mk(2, white), p: mk(3, pink), b: mk(3, brown) };
  }

  _makeCurves() {
    const N = 1024;
    const soft = new Float32Array(N), clip = new Float32Array(2048), gate = new Float32Array(N);
    const k = 1.6, tk = Math.tanh(k);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      soft[i] = Math.tanh(k * x) / tk;
      // 閘門：LFO 過了 -0.1 才開，平滑過渡（無爆音）
      const u = clamp((x + 0.1) / 0.4, 0, 1);
      gate[i] = u * u * (3 - 2 * u);
    }
    for (let i = 0; i < 2048; i++) {
      // 軟削波：0.8 以內完全線性，超過才柔和壓到 0.95 以內
      const x = (i / 2047) * 2 - 1, ax = Math.abs(x);
      const y = ax <= 0.8 ? ax : 0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2);
      clip[i] = x < 0 ? -y : y;
    }
    this.curves = { soft, clip, gate };
  }

  // 產生殘響脈衝響應：擴散尾巴（越晚越悶）＋離散早期反射
  _makeIR(P) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * P.sec);
    const ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = P.fEnd + (P.fStart - P.fEnd) * Math.exp(-t * P.dark);
        const a = Math.exp(-2 * Math.PI * fc / sr);
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        const on = t < P.pre ? 0 : Math.min(1, (t - P.pre) / P.rise);
        d[i] = y * on * P.diff * Math.exp(-t * P.decay);
      }
      for (const [tt, amp] of P.taps) {
        const i0 = Math.floor((tt * rnd(0.92, 1.08) + ch * rnd(0.002, 0.009)) * sr);
        const len = Math.floor(sr * 0.006);
        let z = 0;
        for (let j = 0; j < len && i0 + j < n; j++) {
          z = 0.55 * z + 0.45 * (Math.random() * 2 - 1);
          d[i0 + j] += amp * z * Math.exp(-j / (sr * 0.002));
        }
      }
    }
    return ir;
  }

  _buildGraph() {
    const c = this.ctx;
    const G = (v, dest) => { const g = c.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const F = (type, f, q, dest) => {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      if (dest) b.connect(dest);
      return b;
    };
    // 輸出段：混音 → 壓縮 → 限幅 → 軟削波 → 主音量 → 暫停閘 → 喇叭
    this.pauseG = G(this.paused ? 0 : 1, c.destination);
    this.masterG = G(this.vol, this.pauseG);
    const clip = c.createWaveShaper(); clip.curve = this.curves.clip; clip.connect(this.masterG);
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    lim.connect(clip);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.3;
    comp.connect(lim);
    this.mix = G(0.8, comp);

    // 城市殘響（world 與 arm 的回音），回授進座艙隔音低通
    const wLP = F('lowpass', 7600, 0.55, this.mix);
    this.rvbIn = G(1);
    const rv = c.createConvolver(); rv.normalize = true; rv.buffer = this._makeIR(CITY_IR);
    this.rvbIn.connect(F('highpass', 160, 0.7, rv));
    rv.connect(G(0.5, wLP));
    // 座艙小空間殘響
    const cv = c.createConvolver(); cv.normalize = true; cv.buffer = this._makeIR(COCKPIT_IR);
    this.cabVerb = G(1, cv);
    cv.connect(G(0.3, this.mix));

    const hShelf = F('lowshelf', 110, 0.7, F('lowpass', 4200, 0.6, this.mix));
    hShelf.gain.value = 5;
    this.bus = {
      hull: G(1, hShelf),                                  // 自機結構音：低通＋低頻加強
      arm: G(1, F('lowpass', 11000, 0.5, this.mix)),       // 自機武器
      cab: G(1, F('highpass', 130, 0.7, this.mix)),        // 座艙內部（小喇叭質感）
      world: G(1, wLP),                                    // 外界：座艙隔音低通
    };
    this.bus.hull.connect(G(0.1, this.cabVerb));
    this.bus.cab.connect(G(0.15, this.cabVerb));
    this.bus.arm.connect(G(0.3, this.rvbIn));
    this.ambG = G(0, this.mix);
  }
}

// 任何音效錯誤都不能拖垮遊戲迴圈：公開方法一律包 try／catch，只警告一次。
for (const k of [
  'unlock', 'setVolume', 'setPaused', 'setListener', 'footstep', 'servo', 'boost', 'quickBoost', 'jump', 'land',
  'beam', 'missileLaunch', 'reload', 'saberOn', 'saberOff', 'saberSwing', 'lockTick', 'lockMulti', 'hitmarker',
  'hurt', 'alert', 'setLockAlert', 'setDanger', 'overdrive', 'ui', 'enemyStep', 'enemyBoost', 'enemyBeam', 'mg',
  'cannon', 'missileLaunch3d', 'whiz', 'impact', 'explosion', 'debris', 'trample',
]) {
  const f = Audio.prototype[k];
  Audio.prototype[k] = function (...args) {
    try { return f.apply(this, args); } catch (e) {
      this.lastError = e;
      if (!this._warned) { this._warned = true; console.warn('[audio] ' + k + ' 失敗：', e); }
    }
  };
}
