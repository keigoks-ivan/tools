// 《鋼鐵黃昏 零》音效：步行第一人稱射擊。繼承機體版 Audio 的合成積木、混音鏈、配樂與世界音效。
// 匯流排調整：
//   world：拿掉座艙隔音低通（人在外面），改接 focusLP（屏息瞄準時暫時變悶）。
//   gun  ：自己的武器，乾、有衝擊、略亮；送一點城市殘響，另外每發各自送回音（槍聲在大樓間迴盪）。
//   body ：自己的身體（腳步、呼吸、裝備、心跳），近、乾。
//   cab  ：沿用為頭盔 HUD（命中提示、無線電、嗶聲）。
// 沿用父類：music、explosion、impact、debris、ui、enemyStep（巨型敵機）、setPaused、setVolume、setIntensity、setDanger。

import { Audio } from '../audio.js';

const SOS = 343;
const E = 0.0001;
const BAR = [1, 2.756, 5.404, 8.933];
const PLATE = [1, 1.59, 2.14, 2.83, 3.6];
const DRONE_CAP = 4;      // 同時運作的無人機循環上限

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// 持續音（循環）：同父類 Rig（父類未匯出，這裡複製一份）
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

export class ZeroAudio extends Audio {
  constructor() {
    super();
    this.dn = new Map();       // 無人機循環（id → Rig）
    this.hb = null;            // 低血量心跳循環
    this.al = null;            // 基地警報循環
    this._hbWant = false;
    this._alWant = false;
    this._brNext = 0;          // 下一次喘氣時間
    this._foot = 0;            // 左右腳交替
  }

  // ───────────────────────── 自己的武器 ─────────────────────────

  // 雷射長步槍：線圈電容瞬間放電的「喀——嚓嗡」。
  //  ① 起音裂擊（空氣被電離的爆裂）② 能量放電：走音鋸齒下墜＋FM 掃頻＋線圈金屬鳴
  //  ③ 低頻重拳（肩膀吃到的後座）④ 長尾：粉紅雜訊＋左右滾動的城市隆隆＋遠樓回彈；最後散熱排氣
  //  ads＝瞄準鏡：聲場收窄、裂擊略前、尾巴略短
  rifle(ads) {
    if (!this._ok()) return;
    const v = this._voice(this.bus.gun, 2); if (!v) return;
    const c = this.ctx, t = this._now(), o = v.out, p = rnd(0.96, 1.04);
    const A = !!ads, w = A ? 0.28 : 0.5, tk = A ? 0.85 : 1;
    const tail = this._sub(v, o, this.echoIn, A ? 0.45 : 0.6);
    const body = this._sat(v, o, 2.4, 0.5);
    const zap = this._sat(v, tail, 3, 0.26);
    // ①
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.03, g: A ? 0.66 : 0.58, ft: 'highpass', f: 2600 });
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.012, g: 0.35, ft: 'bandpass', f: 6500, q: 0.8 });
    this._T(v, o, { t, type: 'square', f: 4200 * p, f1: 1500, gl: 0.02, a: 0.0004, d: 0.025, g: 0.08 });
    // ②
    for (const [m, det] of [[1, -14], [1, 12], [2, 6]]) {
      this._T(v, zap, { t, type: 'sawtooth', f: 640 * m * p, f1: 68 * m * p, gl: 0.32, det, a: 0.001, h: 0.03, d: 0.34, g: 0.13, ft: 'lowpass', ff: 7000, ff1: 600, fgl: 0.34, fq: 1.3 });
    }
    const car = this._T(v, o, { t, type: 'sawtooth', f: 3300 * p, f1: 150, gl: 0.22, a: 0.001, h: 0.02, d: 0.28, g: 0.1, ft: 'lowpass', ff: 8000, ff1: 900, fgl: 0.28, fq: 2 });
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(1150 * p, t);
    mod.frequency.exponentialRampToValueAtTime(60, t + 0.24);
    const md = v.add(c.createGain());
    md.gain.setValueAtTime(1700, t);
    md.gain.exponentialRampToValueAtTime(40, t + 0.24);
    mod.connect(md); md.connect(car.frequency);
    v.play(mod, t, t + 0.34);
    this._T(v, tail, { t, f: 5400 * p, f1: 2300, gl: 0.4, a: 0.002, d: 0.42, g: 0.018 });   // 線圈高鳴
    this._N(v, o, { t, b: 'w', a: 0.002, h: 0.03, d: 0.24, g: 0.13, ft: 'highpass', f: 4500, am: rnd(80, 100), amd: 0.55 });
    // ③
    this._thump(v, o, t, 125 * p, 34, 0.62, 0.42, 2.2);
    this._N(v, body, { t, b: 'b', a: 0.002, d: 0.45, g: 0.7, ft: 'lowpass', f: 720, f1: 120, q: 0.8 });
    this._N(v, body, { t, b: 'p', a: 0.001, d: 0.17, g: 0.42, ft: 'bandpass', f: 950 * p, f1: 260, q: 0.8 });
    // ④
    this._N(v, tail, { t, b: 'p', a: 0.003, d: 0.95 * tk, g: 0.27, ft: 'bandpass', f: 1300 * p, f1: 320, q: 0.9 });
    for (const [f, g] of [[520, 0.028], [781, 0.02], [1433, 0.01]]) this._T(v, tail, { t, f: f * p, a: 0.002, d: 0.9 * tk, g });
    for (const sd of [-w, w]) {
      this._N(v, this._pan(v, sd, tail), { t: t + 0.05 + rnd(0, 0.05), b: 'b', a: 0.08, h: 0.05, d: 1.3 * tk, g: 0.2 * tk, ft: 'lowpass', f: 380, f1: 110, q: 0.7 });
    }
    const ts = t + rnd(0.5, 0.7);                              // 遠樓回彈
    this._N(v, this._pan(v, rnd(-0.7, 0.7) * w * 2, o), { t: ts, b: 'p', a: 0.004, d: 0.35, g: 0.07 * tk, ft: 'bandpass', f: 650, q: 0.9 });
    this._N(v, this.bus.body, { t: t + 0.12, b: 'w', a: 0.02, h: 0.03, d: 0.3, g: 0.035, ft: 'bandpass', f: 3600, f1: 2000, q: 1.3 });   // 散熱排氣
    this._duck(2.5, t, 0.1);
    v.done();
  }

  // 雷射手槍：更緊、更高、更短
  pistol() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.gun, 2); if (!v) return;
    const c = this.ctx, t = this._now(), o = v.out, p = rnd(0.95, 1.05);
    const tail = this._sub(v, o, this.echoIn, 0.3);
    const body = this._sat(v, o, 2, 0.5);
    const zap = this._sat(v, tail, 2.6, 0.28);
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.02, g: 0.5, ft: 'highpass', f: 3200 });
    this._T(v, o, { t, type: 'square', f: 5200 * p, f1: 1900, gl: 0.015, a: 0.0004, d: 0.02, g: 0.06 });
    for (const det of [-12, 10]) {
      this._T(v, zap, { t, type: 'sawtooth', f: 1150 * p, f1: 190 * p, gl: 0.14, det, a: 0.001, h: 0.01, d: 0.15, g: 0.12, ft: 'lowpass', ff: 8000, ff1: 1200, fgl: 0.15, fq: 1.2 });
    }
    const car = this._T(v, o, { t, type: 'sawtooth', f: 4300 * p, f1: 520, gl: 0.1, a: 0.001, d: 0.12, g: 0.07, ft: 'lowpass', ff: 9000, ff1: 1500, fgl: 0.12, fq: 1.5 });
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(1500 * p, t);
    mod.frequency.exponentialRampToValueAtTime(200, t + 0.1);
    const md = v.add(c.createGain());
    md.gain.setValueAtTime(900, t);
    md.gain.exponentialRampToValueAtTime(50, t + 0.1);
    mod.connect(md); md.connect(car.frequency);
    v.play(mod, t, t + 0.16);
    this._N(v, o, { t, b: 'w', a: 0.001, d: 0.1, g: 0.1, ft: 'highpass', f: 5000, am: rnd(110, 130), amd: 0.5 });
    this._thump(v, o, t, 170 * p, 70, 0.38, 0.16, 1.8);
    this._N(v, body, { t, b: 'p', a: 0.001, d: 0.08, g: 0.35, ft: 'bandpass', f: 1400 * p, f1: 500, q: 0.9 });
    this._N(v, tail, { t, b: 'p', a: 0.002, d: 0.35, g: 0.13, ft: 'bandpass', f: 1800 * p, f1: 700, q: 1 });
    v.done();
  }

  // 空扳機：機械「喀」＋能量不足的下行小嗶
  dry() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 1); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.012, g: 0.3, ft: 'bandpass', f: rnd(2800, 3400), q: 2 });
    this._T(v, o, { t, type: 'triangle', f: 1900, f1: 1500, gl: 0.03, a: 0.0005, d: 0.03, g: 0.08 });
    this._T(v, this.bus.cab, { t: t + 0.03, type: 'square', f: 640, f1: 420, gl: 0.07, a: 0.002, h: 0.02, d: 0.05, g: 0.03, ft: 'lowpass', ff: 2500 });
    v.done();
  }

  // 換彈：weapon＝'rifle'|'pistol'；phase＝'out'｜'in'｜'charge'｜'ready'
  reload(weapon, phase) {
    if (!this._ok()) return;
    const q = weapon === 'pistol', pm = (q ? 1.35 : 1) * rnd(0.97, 1.03), gm = q ? 0.8 : 1;
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out;
    if (phase === 'out') {
      // 卡榫「喀」→ 彈匣滑出＋冷卻劑嘶聲 → 能量匣落地「匡啷」
      this._clank(v, o, t, 2100 * pm, 0.05 * gm, 0.05, BAR);
      this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.01, g: 0.14, ft: 'bandpass', f: 3000, q: 1.5 });
      this._thump(v, o, t + 0.03, 220 * pm, 110, 0.08 * gm, 0.06, 1.2);
      this._N(v, o, { t: t + 0.04, b: 'p', a: 0.015, d: 0.1, g: 0.1 * gm, ft: 'bandpass', f: 1600 * pm, f1: 900, q: 2.5 });
      this._N(v, o, { t: t + 0.02, b: 'w', a: 0.005, h: 0.05, d: 0.3, g: 0.05, ft: 'bandpass', f: 4200, f1: 2500, q: 1.2 });
      const tg = t + rnd(0.36, 0.42);
      this._clank(v, o, tg, rnd(900, 1200) * pm, 0.04 * gm, 0.12, BAR);
      this._thump(v, o, tg, 300, 150, 0.04 * gm, 0.05, 1);
      this._clank(v, o, tg + rnd(0.1, 0.14), rnd(1000, 1300) * pm, 0.018 * gm, 0.08, BAR);
    } else if (phase === 'in') {
      // 推入＋紮實的「喀鏘」＋鎖定小卡榫
      this._N(v, o, { t, b: 'p', a: 0.03, d: 0.05, g: 0.08 * gm, ft: 'bandpass', f: 900 * pm, f1: 1500 * pm, q: 2 });
      const ti = t + 0.07;
      this._clank(v, o, ti, 650 * pm, 0.1 * gm, 0.1, PLATE);
      this._N(v, o, { t: ti, b: 'w', a: 0.0003, d: 0.015, g: 0.24 * gm, ft: 'bandpass', f: 2200, q: 1.3 });
      this._thump(v, o, ti, 170 * pm, 85, 0.16 * gm, 0.09, 1.5);
      this._clank(v, o, ti + 0.05, 2400 * pm, 0.03, 0.04, BAR);
    } else if (phase === 'charge') {
      // 電容充能：嗚聲往上爬（約 0.5 秒；手槍較短較高）
      const dur = q ? 0.35 : 0.55;
      this._T(v, o, { t, f: 260 * pm, f1: 3000 * pm, gl: dur, a: dur * 0.9, h: 0.02, d: 0.06, g: 0.04 });
      this._T(v, o, { t, type: 'sawtooth', f: 130 * pm, f1: 1500 * pm, gl: dur, a: dur * 0.9, h: 0.02, d: 0.06, g: 0.03, ft: 'lowpass', ff: 900, ff1: 5000, fgl: dur, fq: 3 });
      this._N(v, o, { t, b: 'w', a: dur * 0.9, d: 0.05, g: 0.05, ft: 'bandpass', f: 1000, f1: 4000, gl: dur, q: 1.5, am: 60, amd: 0.5 });
    } else {
      // 就緒：槍機「喀鏘」＋HUD 上行兩聲
      this._N(v, o, { t, b: 'p', a: 0.01, d: 0.04, g: 0.07, ft: 'bandpass', f: 1400 * pm, q: 2 });
      const tb = t + 0.04;
      this._clank(v, o, tb, 520 * pm, 0.08 * gm, 0.1, PLATE);
      this._N(v, o, { t: tb, b: 'w', a: 0.0003, d: 0.02, g: 0.2 * gm, ft: 'bandpass', f: 2000, q: 1.3 });
      this._thump(v, o, tb, 150 * pm, 80, 0.12 * gm, 0.08, 1.4);
      this._T(v, this.bus.cab, { t: tb + 0.08, type: 'triangle', f: 1760, a: 0.002, h: 0.03, d: 0.04, g: 0.05 });
      this._T(v, this.bus.cab, { t: tb + 0.15, type: 'triangle', f: 2637, a: 0.002, h: 0.02, d: 0.1, g: 0.05 });
    }
    v.done();
  }

  // 切換武器：衣物摩擦＋裝備碰撞＋握把拍進手掌
  swap() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'p', a: 0.05, h: 0.03, d: 0.15, g: 0.09, ft: 'bandpass', f: 900, f1: 2200, gl: 0.2, q: 1.2 });
    this._gran(v, o, { t: t + 0.03, dur: 0.15, b: 'w', ft: 'bandpass', fr: [2200, 4600], q: 5, g: 0.04, gd: [0.002, 0.006], gap: [0.008, 0.025], fade: true });
    this._clank(v, o, t + 0.12, rnd(1300, 1600), 0.035, 0.1, BAR);
    this._N(v, o, { t: t + 0.2, b: 'p', a: 0.001, d: 0.04, g: 0.12, ft: 'bandpass', f: 700, q: 1 });
    this._thump(v, o, t + 0.2, 180, 90, 0.08, 0.07, 1.2);
    this._T(v, this.bus.cab, { t: t + 0.27, type: 'triangle', f: 1600, a: 0.002, d: 0.05, g: 0.025 });
    v.done();
  }

  // 瞄準鏡伺服變焦：小馬達嗚聲＋到位「喀」
  scope(on) {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 1); if (!v) return;
    const t = this._now(), o = v.out, up = !!on;
    this._T(v, o, { t, type: 'sawtooth', f: up ? 520 : 880, f1: up ? 880 : 520, gl: 0.13, a: 0.02, h: 0.06, d: 0.06, g: 0.045, ft: 'bandpass', ff: 1400, fq: 3 });
    this._T(v, o, { t, f: up ? 2600 : 3400, f1: up ? 3400 : 2600, gl: 0.13, a: 0.02, h: 0.05, d: 0.05, g: 0.008 });
    const tc = t + 0.14;
    this._N(v, o, { t: tc, b: 'w', a: 0.0003, d: 0.008, g: 0.13, ft: 'bandpass', f: 3500, q: 1.5 });
    this._T(v, o, { t: tc, type: 'triangle', f: up ? 2000 : 1700, a: 0.0005, d: 0.02, g: 0.035 });
    v.done();
  }

  // ───────────────────────── 自己的身體 ─────────────────────────

  // 腳步：surface＝'concrete'|'metal'|'gravel'|'glass'；speed 0..1（走→衝）。
  // 軍靴＋地面質感＋裝備碰撞；每步大量隨機化，音量刻意壓低（聽久不累）
  step(surface, speed) {
    if (!this._ok()) return;
    const s = clamp(num(speed, 0.5), 0, 1), k = 0.35 + 0.65 * s;
    const v = this._voice(this.bus.body, 1); if (!v) return;
    this._foot ^= 1;
    const t = this._now(), p = rnd(0.88, 1.12);
    const o = this._pan(v, (this._foot ? -1 : 1) * rnd(0.05, 0.14), v.out);
    // 鞋跟落地
    this._thump(v, o, t, rnd(85, 105) * p, 48, 0.17 * k, 0.09 + 0.05 * s, 1.4);
    this._N(v, o, { t, b: 'p', a: 0.001, d: rnd(0.04, 0.07), g: 0.15 * k, ft: 'lowpass', f: 650 * p, q: 0.7 });
    const tt = t + rnd(0.025, 0.05);   // 腳尖
    if (surface === 'metal') {
      this._clank(v, o, t + 0.003, rnd(260, 420) * p, 0.05 * k, rnd(0.18, 0.3), PLATE);
      this._T(v, o, { t, f: rnd(105, 140), a: 0.002, d: 0.15, g: 0.035 * k });
      this._N(v, o, { t: tt, b: 'p', a: 0.001, d: 0.03, g: 0.06 * k, ft: 'bandpass', f: rnd(900, 1300), q: 1.5 });
    } else if (surface === 'gravel') {
      this._gran(v, o, { t, dur: 0.09 + 0.06 * s, b: 'w', ft: 'bandpass', fr: [1400, 4200], q: 1.8, g: 0.08 * k, gd: [0.002, 0.008], gap: [0.001, 0.008], fade: true });
      this._gran(v, o, { t: t + 0.005, dur: 0.08, b: 'p', ft: 'bandpass', fr: [400, 1000], q: 1.2, g: 0.09 * k, gd: [0.004, 0.012], gap: [0.002, 0.01], fade: true });
    } else if (surface === 'glass') {
      this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.035, g: 0.08 * k, ft: 'bandpass', f: rnd(2200, 3000), q: 1.2 });
      this._gran(v, o, { t, dur: 0.1, b: 'w', ft: 'highpass', f: 4500, q: 0.7, g: 0.05 * k, gd: [0.002, 0.006], gap: [0.002, 0.01], fade: true });
      for (let i = 0, n = 2 + ((Math.random() * 3) | 0); i < n; i++) this._T(v, o, { t: t + rnd(0, 0.06), f: rnd(3200, 7500), a: 0.0005, d: rnd(0.03, 0.09), g: rnd(0.008, 0.02) * k });
    } else {
      this._N(v, o, { t: t + rnd(0.002, 0.008), b: 'p', a: 0.0006, d: rnd(0.025, 0.045), g: 0.1 * k, ft: 'bandpass', f: rnd(1100, 1700), q: 1.4 });
      this._N(v, o, { t: tt, b: 'p', a: 0.001, d: 0.03, g: 0.05 * k, ft: 'bandpass', f: rnd(1300, 2000), q: 1.4 });
      if (s > 0.5) this._N(v, o, { t: tt, b: 'w', a: 0.01, d: 0.06, g: 0.03 * s, ft: 'bandpass', f: rnd(2300, 3200), q: 1.5 });   // 衝刺時鞋底摩擦
    }
    // 裝備碰撞（彈匣、扣環），跑越快越常出現
    if (Math.random() < 0.3 + 0.6 * s) {
      this._gran(v, o, { t: t + rnd(0.01, 0.05), dur: 0.05 + 0.08 * s, b: 'w', ft: 'bandpass', fr: [2200, 4800], q: 5, g: 0.028 * k, gd: [0.002, 0.006], gap: [0.006, 0.025], fade: true });
      if (Math.random() < 0.4) this._clank(v, o, t + rnd(0.02, 0.06), rnd(1800, 2600), 0.012 * k, 0.05, BAR);
    }
    if (s > 0.3) this._N(v, o, { t, b: 'p', a: 0.02, d: 0.08, g: 0.025 * s, ft: 'bandpass', f: rnd(1300, 1900), q: 1 });   // 衣物
    v.done();
  }

  jump() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._thump(v, o, t, 110, 55, 0.12, 0.08, 1.3);
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.05, g: 0.12, ft: 'bandpass', f: 1300, q: 1.3 });
    this._N(v, o, { t: t + 0.02, b: 'p', a: 0.06, h: 0.03, d: 0.15, g: 0.09, ft: 'bandpass', f: 600, f1: 1500, gl: 0.2, q: 1 });
    this._gran(v, o, { t: t + 0.03, dur: 0.14, b: 'w', ft: 'bandpass', fr: [2200, 4600], q: 5, g: 0.04, gd: [0.002, 0.006], gap: [0.006, 0.02], fade: true });
    v.done();
  }

  land(strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 1.6), k = 0.75 * Math.min(s, 1.3);
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out;
    const body = this._sat(v, o, 1.8, 0.5);
    this._thump(v, o, t, rnd(80, 92), 38, 0.36 * k, 0.18 + 0.08 * s, 1.8);
    this._N(v, body, { t, b: 'b', a: 0.002, d: 0.2 + 0.1 * s, g: 0.35 * k, ft: 'lowpass', f: 450, f1: 150, q: 0.8 });
    this._N(v, o, { t, b: 'p', a: 0.0008, d: 0.05, g: 0.16 * k, ft: 'bandpass', f: rnd(900, 1400), q: 1.2 });
    this._clank(v, o, t + rnd(0.01, 0.03), rnd(900, 1300), 0.03 * k, 0.1, PLATE);
    this._gran(v, o, { t: t + 0.01, dur: 0.18 + 0.08 * s, b: 'w', ft: 'bandpass', fr: [2200, 4800], q: 5, g: 0.05 * k, gd: [0.002, 0.007], gap: [0.004, 0.02], fade: true });
    this._gran(v, o, { t, dur: 0.1, b: 'p', ft: 'bandpass', fr: [1200, 3000], q: 1.5, g: 0.05 * k, gd: [0.002, 0.008], gap: [0.002, 0.012], fade: true });
    if (s > 1) this._duck(1.5, t, 0.08);
    v.done();
  }

  // 喘氣：每幀呼叫 level 0..1；> 0.3 才偶爾吸吐一次，越累越密、越大聲（仍很輕）
  breath(level) {
    if (!this._ok()) return;
    const L = clamp(num(level, 0), 0, 1), now = this.ctx.currentTime;
    if (L <= 0.3 || now < this._brNext) return;
    const e = (L - 0.3) / 0.7, cyc = 2.6 - 1.3 * e;
    this._brNext = now + cyc * rnd(0.9, 1.12);
    const v = this._voice(this.bus.body, 1); if (!v) return;
    const t = this._now(), o = v.out, g = 0.035 + 0.045 * e, ia = 0.3 - 0.1 * e;
    // 吸：兩個共振帶往上滑
    this._N(v, o, { t, b: 'p', a: ia, h: 0.02, d: 0.08, g: g * 0.7, ft: 'bandpass', f: rnd(900, 1200), f1: rnd(1500, 1900), gl: ia, q: 1.6 });
    this._N(v, o, { t, b: 'w', a: ia, d: 0.06, g: g * 0.25, ft: 'bandpass', f: 3200, q: 1.5 });
    // 吐：較重，胸腔低頻
    const te = t + ia + rnd(0.06, 0.12);
    this._N(v, o, { t: te, b: 'p', a: 0.04, h: 0.06, d: 0.3, g, ft: 'bandpass', f: rnd(1300, 1600), f1: 700, q: 1.2 });
    this._N(v, o, { t: te, b: 'w', a: 0.03, h: 0.04, d: 0.22, g: g * 0.3, ft: 'bandpass', f: 2600, f1: 1800, q: 1.5 });
    this._N(v, o, { t: te, b: 'b', a: 0.04, h: 0.04, d: 0.25, g: g * 0.6, ft: 'lowpass', f: 500, q: 0.7 });
    v.done();
  }

  // 屏息（狙擊）：短促吸氣 → 外界變悶、配樂壓低，耳內兩下心跳（約 2 秒）
  holdBreath() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'p', a: 0.2, h: 0.03, d: 0.06, g: 0.06, ft: 'bandpass', f: 1000, f1: 1900, gl: 0.22, q: 1.6 });
    this._N(v, o, { t, b: 'w', a: 0.2, d: 0.05, g: 0.02, ft: 'bandpass', f: 3400, q: 1.5 });
    for (const tb of [t + 0.55, t + 1.4]) {
      this._thump(v, o, tb, 62, 38, 0.2, 0.16, 2);
      this._thump(v, o, tb + 0.24, 58, 36, 0.13, 0.14, 2);
      this._N(v, o, { t: tb, b: 'b', a: 0.01, d: 0.12, g: 0.12, ft: 'lowpass', f: 140, q: 0.8 });
    }
    const f = this.focusLP.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.setTargetAtTime(2200, t + 0.15, 0.12);
    f.setTargetAtTime(20000, t + 2.1, 0.25);
    this._duck(4, t + 0.15, 1.9);
    v.done();
  }

  // 被雷射打中：灼燒滋滋＋悶「咚」；strength > 0.6 加短暫耳鳴。dir＝-1（左）..1（右），可省略
  hurt(strength, dir) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 0.6), 0.1, 1.5), k = Math.min(s, 1.2), pd = clamp(num(dir, 0), -1, 1);
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = this._pan(v, pd * 0.6, v.out), p = rnd(0.92, 1.08);
    const body = this._sat(v, o, 2, 0.5);
    this._thump(v, o, t, 95 * p, 38, 0.42 * k, 0.28, 1.8);
    this._N(v, body, { t, b: 'b', a: 0.002, d: 0.3, g: 0.45 * k, ft: 'lowpass', f: 420, q: 0.8 });
    this._clank(v, o, t, rnd(700, 900) * p, 0.05 * k, 0.15, PLATE);   // 護甲
    this._N(v, o, { t, b: 'w', a: 0.001, h: 0.05, d: 0.25, g: 0.2 * k, ft: 'highpass', f: 3000, am: rnd(60, 90), amd: 0.6 });
    this._T(v, o, { t, type: 'sawtooth', f: 1600 * p, f1: 220, gl: 0.18, a: 0.001, d: 0.2, g: 0.08 * k, ft: 'bandpass', ff: 1400, fq: 2 });
    if (s > 0.6) {
      const fr = rnd(3800, 4300), rg = 0.012 + 0.02 * (Math.min(s, 1.2) - 0.6);
      this._T(v, v.out, { t: t + 0.03, f: fr, a: 0.03, h: 0.25, d: 1.1, g: rg });
      this._T(v, v.out, { t: t + 0.03, f: fr * 1.006, a: 0.03, h: 0.2, d: 0.9, g: rg * 0.6 });
    }
    this._duck(2 + 3 * k, t, 0.1 + 0.15 * k);
    v.done();
  }

  // 個人能量護盾崩潰：玻璃狀碎裂＋下墜電弧＋悶響＋不協和下滑雙音
  shieldBreak() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.body, 2); if (!v) return;
    const t = this._now(), o = v.out, C = this.bus.cab;
    this._thump(v, o, t, 120, 40, 0.35, 0.4, 1.8);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.04, g: 0.3, ft: 'highpass', f: 2500 });
    this._gran(v, o, { t, dur: 0.5, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.12, gd: [0.002, 0.008], gap: [0.002, 0.015], fade: true });
    this._T(v, o, { t, type: 'sawtooth', f: 2400, f1: 120, gl: 0.4, a: 0.001, h: 0.02, d: 0.4, g: 0.09, ft: 'lowpass', ff: 6000, ff1: 600, fgl: 0.4, fq: 2 });
    for (const [f, f1] of [[1400, 300], [1510, 330]]) this._T(v, C, { t: t + 0.02, type: 'triangle', f, f1, gl: 0.5, a: 0.003, h: 0.05, d: 0.45, g: 0.05 });
    this._N(v, o, { t, b: 'w', a: 0.001, h: 0.08, d: 0.3, g: 0.12, ft: 'bandpass', f: 3000, q: 1, am: 45, amd: 0.7 });
    this._duck(3, t, 0.2);
    v.done();
  }

  // 護盾開始回充：上行微光（約 0.8 秒）＋收尾小鐘
  shieldRecharge() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.cab, 1); if (!v) return;
    const t = this._now(), o = v.out;
    this._T(v, o, { t, type: 'triangle', f: 330, f1: 1320, gl: 0.55, a: 0.5, h: 0.03, d: 0.08, g: 0.05 });
    this._T(v, o, { t, f: 495, f1: 1980, gl: 0.55, a: 0.5, h: 0.03, d: 0.08, g: 0.035 });
    this._N(v, o, { t, b: 'w', a: 0.5, d: 0.08, g: 0.05, ft: 'bandpass', f: 800, f1: 4000, gl: 0.55, q: 2, am: 70, amd: 0.4 });
    for (const [f, g] of [[1760, 0.035], [2637, 0.02]]) this._T(v, o, { t: t + 0.58, f, a: 0.003, d: 0.4, g });
    v.done();
  }

  // 低血量心跳循環（淡入淡出）
  lowHealth(on) {
    on = !!on;
    this._hbWant = on;
    if (!this._ready || on === !!this.hb) return;
    if (on) { this.hb = this._heartLoop(); return; }
    this._fadeKill(this.hb, 0.6); this.hb = null;
  }

  // ───────────────────────── 外界（定位） ─────────────────────────

  // 敵方雷射槍：kind＝'rifle'｜'sniper'（大裂擊＋長回音、音速延遲）｜'heavy'（可連射）｜'drone'（小、電）
  enemyShot(pos, kind) {
    if (!this._ok()) return;
    const K = kind === 'sniper' || kind === 'heavy' || kind === 'drone' ? kind : 'rifle';
    const S = K === 'sniper' ? this._spat(pos, { ref: 45, rv: 0.55, prio: 2, delay: true, min: 0.002 })
      : K === 'heavy' ? this._spat(pos, { ref: 22, rv: 0.35, prio: 0, min: 0.005 })
      : K === 'drone' ? this._spat(pos, { ref: 12, rv: 0.2, prio: 0, min: 0.006 })
      : this._spat(pos, { ref: 18, rv: 0.3, prio: 1 });
    if (!S) return;
    const { v, o, t } = S, p = rnd(0.92, 1.08), att = v.out.gain.value;
    if (K === 'sniper') {
      const tail = this._sub(v, o, this.echoIn, 0.5 * Math.sqrt(att));
      this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.04, g: 0.7, ft: 'highpass', f: 2000 });
      this._T(v, o, { t, type: 'sawtooth', f: 3600 * p, f1: 180, gl: 0.3, a: 0.001, h: 0.02, d: 0.35, g: 0.14, ft: 'lowpass', ff: 8000, ff1: 800, fgl: 0.35, fq: 2 });
      for (const det of [-12, 12]) this._T(v, o, { t, type: 'sawtooth', f: 520 * p, f1: 60, gl: 0.35, det, a: 0.001, h: 0.02, d: 0.4, g: 0.1, ft: 'lowpass', ff: 5000, ff1: 500, fgl: 0.4, fq: 1.2 });
      this._thump(v, o, t, 110 * p, 34, 0.55, 0.45, 2);
      this._N(v, o, { t, b: 'w', a: 0.002, h: 0.04, d: 0.3, g: 0.16, ft: 'highpass', f: 4000, am: 85, amd: 0.5 });
      this._N(v, tail, { t, b: 'p', a: 0.003, d: 1.1, g: 0.3, ft: 'bandpass', f: 1100, f1: 280, q: 0.9 });
      this._N(v, tail, { t: t + 0.08, b: 'b', a: 0.1, h: 0.1, d: 1.6, g: 0.35, ft: 'lowpass', f: 320, f1: 100, q: 0.7 });
      this._duck(2, t, 0.1);
    } else if (K === 'heavy') {
      this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.03, g: 0.55, ft: 'highpass', f: 1800 });
      this._T(v, o, { t, type: 'sawtooth', f: 1400 * p, f1: 170, gl: 0.14, a: 0.001, d: 0.16, g: 0.18, ft: 'lowpass', ff: 5000, ff1: 700, fq: 1.5 });
      this._thump(v, o, t, 105 * p, 42, 0.45, 0.18, 1.8);
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.1, g: 0.45, ft: 'bandpass', f: 700 * p, q: 1 });
      this._N(v, o, { t, b: 'w', a: 0.001, d: 0.12, g: 0.1, ft: 'highpass', f: 4000, am: 70, amd: 0.5 });
    } else if (K === 'drone') {
      this._T(v, o, { t, type: 'square', f: 3000 * p, f1: 900, gl: 0.07, a: 0.0005, d: 0.08, g: 0.1, ft: 'lowpass', ff: 6000 });
      this._N(v, o, { t, b: 'w', a: 0.0005, h: 0.02, d: 0.08, g: 0.3, ft: 'highpass', f: 5000, am: 140, amd: 0.6 });
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.05, g: 0.25, ft: 'bandpass', f: 1500 * p, q: 1.2 });
    } else {
      this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.025, g: 0.5, ft: 'highpass', f: 2500 });
      this._T(v, o, { t, type: 'sawtooth', f: 2300 * p, f1: 300, gl: 0.15, a: 0.001, d: 0.18, g: 0.15, ft: 'lowpass', ff: 6000, ff1: 900, fq: 1.5 });
      this._thump(v, o, t, 130 * p, 50, 0.32, 0.15, 1.5);
      this._N(v, o, { t, b: 'w', a: 0.002, h: 0.02, d: 0.16, g: 0.13, ft: 'highpass', f: 3800, am: rnd(70, 95) });
    }
    v.done();
  }

  // 狙擊手即將開火：不祥的上升充能嗚聲（約 1.2 秒），開頭一聲瞄準鏡反光的細「叮」
  sniperGlint(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 35, rv: 0.3, prio: 2, min: 0.002 }); if (!S) return;
    const { v, o, t } = S, D = 1.2;
    this._T(v, o, { t, f: 5200, a: 0.002, d: 0.3, g: 0.03 });
    this._T(v, o, { t, f: 380, f1: 2600, gl: D, a: D * 0.92, h: 0.04, d: 0.06, g: 0.07 });
    for (const det of [-15, 15]) this._T(v, o, { t, type: 'sawtooth', f: 95, f1: 380, gl: D, det, a: D * 0.9, h: 0.05, d: 0.08, g: 0.06, ft: 'lowpass', ff: 300, ff1: 3200, fgl: D, fq: 5 });
    this._N(v, o, { t: t + 0.2, b: 'w', a: D * 0.75, d: 0.06, g: 0.09, ft: 'highpass', f: 2600, f1: 5000, gl: D, q: 0.7, am: 45, amd: 0.6 });
    this._T(v, o, { t: t + D - 0.08, f: 3400, a: 0.005, d: 0.12, g: 0.035 });
    v.done();
  }

  // 雷射彈從頭旁邊掠過：劈啪電弧嘶聲＋都卜勒下滑＋空氣電離「啪」
  whiz(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 10, rv: 0.08, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    this._N(v, o, { t, b: 'w', a: 0.0002, d: 0.012, g: 0.7, ft: 'highpass', f: 3000 });
    this._N(v, o, { t, b: 'w', a: 0.01, d: 0.2, g: 0.45, ft: 'highpass', f: 3000, am: rnd(80, 120), amd: 0.7 });
    this._T(v, o, { t, type: 'sawtooth', f: rnd(1700, 2100), f1: rnd(420, 560), gl: 0.18, a: 0.01, d: 0.2, g: 0.1, ft: 'bandpass', ff: 2200, ff1: 900, fq: 2 });
    this._N(v, o, { t, b: 'w', a: 0.008, d: 0.16, g: 0.35, ft: 'bandpass', f: rnd(3500, 4500), f1: rnd(1000, 1400), gl: 0.15, q: 3 });
    v.done();
  }

  // 我方命中：kind＝'armor'｜'body'｜'head'｜'concrete'｜'metal'｜'glass'
  hit(pos, kind) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t } = S, p = rnd(0.93, 1.07);
    const sizzle = (g, d) => this._N(v, o, { t, b: 'w', a: 0.001, h: 0.03, d, g, ft: 'highpass', f: 3200, am: rnd(60, 90), amd: 0.6 });
    if (kind === 'armor') {
      this._clank(v, o, t, rnd(500, 800) * p, 0.2, 0.4, PLATE);
      this._clank(v, o, t, rnd(1300, 1700), 0.07, 0.15);
      this._thump(v, o, t, 140, 60, 0.2, 0.1, 1.3);
      sizzle(0.25, 0.2);
      this._gran(v, o, { t: t + 0.01, dur: 0.18, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.1, gd: [0.002, 0.006], gap: [0.005, 0.03], fade: true });
    } else if (kind === 'body') {
      const body = this._sat(v, o, 1.8, 0.5);
      this._thump(v, o, t, 120 * p, 55, 0.4, 0.16, 1.8);
      this._N(v, body, { t, b: 'p', a: 0.001, d: 0.12, g: 0.5, ft: 'lowpass', f: 550, q: 0.8 });
      this._clank(v, o, t, rnd(300, 380) * p, 0.07, 0.2, PLATE);
      sizzle(0.2, 0.18);
    } else if (kind === 'head') {
      this._N(v, o, { t, b: 'w', a: 0.0002, d: 0.018, g: 0.8, ft: 'highpass', f: 2500 });
      this._clank(v, o, t, rnd(1700, 2000) * p, 0.14, 0.12, BAR);
      this._T(v, o, { t, f: 3200 * p, a: 0.0005, d: 0.12, g: 0.05 });
      this._thump(v, o, t, 160, 70, 0.22, 0.08, 1.3);
      sizzle(0.2, 0.15);
    } else if (kind === 'metal') {
      this._clank(v, o, t, rnd(350, 600) * p, 0.2, 0.7, PLATE);
      this._clank(v, o, t + 0.003, rnd(1100, 1500), 0.05, 0.3);
      sizzle(0.25, 0.25);
      this._gran(v, o, { t: t + 0.01, dur: 0.25, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.08, gd: [0.002, 0.006], gap: [0.006, 0.03], fade: true });
    } else if (kind === 'glass') {
      this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.04, g: 0.5, ft: 'bandpass', f: 2500, q: 0.8 });
      this._gran(v, o, { t, dur: 0.45, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.2, gd: [0.002, 0.01], gap: [0.002, 0.02], fade: true });
      for (let i = 0; i < 8; i++) this._T(v, o, { t: t + rnd(0.01, 0.4), f: rnd(3000, 7000), a: 0.0005, d: rnd(0.05, 0.15), g: rnd(0.02, 0.05) });
      sizzle(0.12, 0.1);
    } else {
      // 混凝土：碎裂＋灼痕嘶聲
      this._thump(v, o, t, 110, 50, 0.3, 0.16, 1.5);
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.09, g: 0.45, ft: 'bandpass', f: 1500 * p, q: 0.9 });
      this._gran(v, o, { t, dur: 0.28, b: 'w', ft: 'bandpass', fr: [900, 2800], q: 1.5, g: 0.2, gd: [0.004, 0.012], gap: [0.002, 0.02], fade: true });
      this._gran(v, o, { t: t + 0.1, dur: 0.35, b: 'p', ft: 'bandpass', fr: [2000, 4000], q: 2, g: 0.07, gd: [0.004, 0.012], gap: [0.02, 0.07], fade: true });
      sizzle(0.16, 0.15);
    }
    v.done();
  }

  // 命中回饋（不定位）：'hit' 輕點｜'head' 清脆高音「叮」｜'kill' 低沉「咚」＋點
  hitmark(kind) {
    if (!this._ok()) return;
    const K = kind === 'head' || kind === 'kill' ? kind : 'hit';
    const v = this._voice(this.bus.cab, K === 'hit' ? 1 : 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.012, g: 0.3, ft: 'highpass', f: 4200 });
    this._T(v, o, { t, type: 'triangle', f: rnd(2750, 2850), a: 0.0005, d: 0.03, g: 0.07 });
    if (K === 'head') {
      for (const [f, g, d] of [[1760, 0.07, 0.35], [2640, 0.045, 0.28], [3520, 0.03, 0.2], [4400, 0.015, 0.12]]) this._T(v, o, { t: t + 0.01, f, a: 0.001, d, g });
      this._N(v, o, { t, b: 'w', a: 0.0002, d: 0.008, g: 0.25, ft: 'bandpass', f: 6000, q: 1 });
    } else if (K === 'kill') {
      this._thump(v, this.bus.body, t, 170, 60, 0.2, 0.14, 1.8);
      this._N(v, this.bus.body, { t, b: 'p', a: 0.001, d: 0.06, g: 0.18, ft: 'lowpass', f: 700, q: 0.8 });
      this._T(v, o, { t: t + 0.06, type: 'triangle', f: 1400, a: 0.001, d: 0.08, g: 0.05 });
    }
    v.done();
  }

  // 裝甲步兵倒地：膝蓋觸地、裝甲板亂響、身體砸地、武器落地彈跳
  bodyFall(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 14, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    this._thump(v, o, t, 95, 45, 0.22, 0.16, 1.5);
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.1, g: 0.25, ft: 'lowpass', f: 500, q: 0.8 });
    for (let i = 0; i < 4; i++) this._clank(v, o, t + rnd(0, 0.28), rnd(350, 900), rnd(0.04, 0.07), 0.18, PLATE);
    const tb = t + rnd(0.25, 0.32);
    const body = this._sat(v, o, 1.8, 0.5);
    this._thump(v, o, tb, 78, 34, 0.42, 0.32, 1.8);
    this._N(v, body, { t: tb, b: 'b', a: 0.002, d: 0.3, g: 0.45, ft: 'lowpass', f: 420, q: 0.8 });
    this._gran(v, o, { t: tb, dur: 0.25, b: 'w', ft: 'bandpass', fr: [1500, 4000], q: 2, g: 0.07, gd: [0.003, 0.01], gap: [0.004, 0.03], fade: true });
    const tw = tb + rnd(0.12, 0.2);
    this._clank(v, o, tw, rnd(700, 900), 0.08, 0.25, BAR);
    this._thump(v, o, tw, 200, 100, 0.08, 0.06, 1.2);
    this._clank(v, o, tw + rnd(0.13, 0.18), rnd(750, 950), 0.035, 0.15, BAR);
    v.done();
  }

  // 步兵腳步（巨型敵機的腳步沿用父類 enemyStep）
  trooperStep(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 8, rv: 0.1, prio: 1, min: 0.01 }); if (!S) return;
    const { v, o, t } = S;
    this._thump(v, o, t, rnd(90, 105), 50, 0.14, 0.1, 1.4);
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.05, g: 0.16, ft: 'bandpass', f: rnd(1000, 1400), q: 1.2 });
    if (Math.random() < 0.5) this._clank(v, o, t + rnd(0.01, 0.05), rnd(1800, 2600), 0.02, 0.05, BAR);
    this._gran(v, o, { t, dur: 0.06, b: 'w', ft: 'bandpass', fr: [2000, 4200], q: 2, g: 0.03, gd: [0.002, 0.006], gap: [0.004, 0.015], fade: true });
    v.done();
  }

  // 無線電：'in'（來訊）｜'out'（結束）｜'enemy'（失真的敵方通話，約 0.6 秒；pos 可省略）
  radio(kind, pos) {
    if (!this._ok()) return;
    let v, o, t;
    if (kind === 'enemy' && pos) {
      const S = this._spat(pos, { ref: 10, rv: 0.15, prio: 1 }); if (!S) return;
      ({ v, o, t } = S);
    } else {
      v = this._voice(this.bus.cab, 2); if (!v) return;
      o = v.out; t = this._now();
    }
    const rc = this._radioChain(v, o);
    if (kind === 'out') {
      this._N(v, rc, { t, b: 'w', a: 0.002, d: 0.1, g: 0.14, ft: 'bandpass', f: 2600, q: 0.7 });
      this._N(v, o, { t: t + 0.1, b: 'w', a: 0.0003, d: 0.01, g: 0.12, ft: 'bandpass', f: 3000, q: 1.5 });
      this._T(v, o, { t: t + 0.12, type: 'triangle', f: 1300, f1: 950, gl: 0.08, a: 0.002, h: 0.03, d: 0.06, g: 0.06 });
    } else if (kind === 'enemy') {
      this._N(v, rc, { t, b: 'w', a: 0.002, d: 0.06, g: 0.16, ft: 'bandpass', f: 2600, q: 0.7 });
      this._chatter(v, rc, t + 0.05, rnd(0.5, 0.65));
      this._N(v, rc, { t: t + 0.05, b: 'w', a: 0.02, h: 0.5, d: 0.05, g: 0.035, ft: 'bandpass', f: 2400, q: 0.8 });
      this._N(v, rc, { t: t + 0.7, b: 'w', a: 0.002, d: 0.08, g: 0.14, ft: 'bandpass', f: 2600, q: 0.7 });
    } else {
      this._N(v, rc, { t, b: 'w', a: 0.002, d: 0.08, g: 0.14, ft: 'bandpass', f: 2600, q: 0.7, am: 40, amd: 0.5 });
      this._T(v, o, { t: t + 0.08, type: 'triangle', f: 1400, a: 0.002, h: 0.04, d: 0.03, g: 0.07 });
      this._T(v, o, { t: t + 0.16, type: 'triangle', f: 1900, a: 0.002, h: 0.05, d: 0.05, g: 0.07 });
    }
    v.done();
  }

  // 無人機懸停循環（每幀每台呼叫）：旋翼嗡聲＋離子嗡鳴＋氣流；0.5 秒沒更新自動收掉；最多 4 台（新的比最遠的近才替換）
  droneLoop(id, pos, level) {
    if (!this._ok()) return;
    const lv = clamp(num(level, 0.6), 0, 1), now = this.ctx.currentTime;
    const G = this._geo(pos, 14);
    let e = this.dn.get(id);
    if (!e) {
      if (G.att < 0.02) return;
      if (this.dn.size >= DRONE_CAP) {
        let fk = null, fe = null;
        for (const [k, x] of this.dn) if (!fe || x.d > fe.d) { fk = k; fe = x; }
        if (!fe || fe.d <= G.d) return;
        this._dnKill(fk, fe, true);
      }
      e = this._dnLoop();
      this.dn.set(id, e);
      e.dp = G.d;
    }
    const dt = now - e.tp;
    if (dt > 0.004 && dt < 0.5) {
      const vr = clamp((G.d - e.dp) / dt, -120, 120);
      e.vr += (vr - e.vr) * Math.min(1, dt / 0.12);
    }
    e.dp = G.d; e.tp = now; e.d = G.d; e.seen = now;
    const dop = clamp(SOS / (SOS + e.vr), 0.75, 1.3);
    this._st(e.g.gain, 0.4 * (0.5 + 0.5 * lv) * G.att, now, 0.08);
    this._st(e.sg.gain, 0.2 * Math.min(1, Math.sqrt(G.att) * 1.25), now, 0.1);
    if (e.pn.pan) this._st(e.pn.pan, G.pan, now, 0.08);
    this._st(e.lp.frequency, G.fc, now, 0.08);
    const f = (150 + 90 * lv) * dop;
    this._st(e.b1.frequency, f, now, 0.12);
    this._st(e.b2.frequency, f * 1.068, now, 0.12);
    this._st(e.bl.frequency, f * 0.2, now, 0.12);
    this._st(e.wh.frequency, (2200 + 900 * lv) * dop, now, 0.15);
  }

  droneStop(id) {
    if (!this._ready) return;
    const e = this.dn.get(id);
    if (e) this._dnKill(id, e, true);
  }

  // 基地警報（機庫）：慢速上揚的號笛，在大空間裡迴盪
  alarm(on) {
    on = !!on;
    this._alWant = on;
    if (!this._ready || on === !!this.al) return;
    if (on) { this.al = this._alarmLoop(); return; }
    this._fadeKill(this.al, 0.4); this.al = null;
  }

  // 機庫大門：啟動「匡」→ 馬達嗡鳴＋滾輪隆隆＋鋼材嘎吱（約 3 秒）→ 到底重重「碰」
  door(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 30, rv: 0.5, prio: 2, min: 0.002 }); if (!S) return;
    const { v, o, t } = S, D = 3;
    const body = this._sat(v, o, 1.8, 0.5);
    this._clank(v, o, t, 130, 0.14, 0.6, PLATE);
    this._thump(v, o, t, 75, 36, 0.35, 0.4, 1.6);
    this._N(v, o, { t: t + 0.05, b: 'w', a: 0.02, h: 0.15, d: 0.5, g: 0.07, ft: 'bandpass', f: 2600, f1: 1400, q: 1.3 });
    const m = this._T(v, body, { t: t + 0.1, type: 'sawtooth', f: 48, a: 0.4, h: D - 0.7, d: 0.4, g: 0.12, ft: 'lowpass', ff: 300, fq: 2 });
    m.frequency.linearRampToValueAtTime(62, t + 0.9);
    m.frequency.setValueAtTime(62, t + D - 0.3);
    m.frequency.linearRampToValueAtTime(40, t + D);
    this._T(v, o, { t: t + 0.1, type: 'square', f: 96, f1: 124, gl: 0.8, a: 0.4, h: D - 0.7, d: 0.4, g: 0.025, ft: 'bandpass', ff: 700, fq: 4 });
    this._N(v, body, { t: t + 0.1, b: 'b', a: 0.5, h: D - 0.8, d: 0.4, g: 0.55, ft: 'lowpass', f: 220, q: 0.8 });
    this._gran(v, o, { t: t + 0.3, dur: D - 0.5, b: 'p', ft: 'bandpass', fr: [300, 900], q: 2, g: 0.12, gd: [0.01, 0.03], gap: [0.01, 0.05] });
    this._creak(v, o, t + 0.5, 1.0, 0.07);
    this._creak(v, o, t + 1.8, 0.9, 0.06);
    const te = t + D;
    this._thump(v, o, te, 70, 30, 0.55, 0.7, 2);
    this._clank(v, o, te, 110, 0.2, 1.2, PLATE);
    this._N(v, body, { t: te, b: 'b', a: 0.004, d: 0.9, g: 0.6, ft: 'lowpass', f: 500, f1: 120, q: 0.8 });
    this._duck(3, te, 0.3);
    v.done();
  }

  // 終章：主角機甦醒（約 3 秒上升，3.0 秒「轟」地一聲）。
  //  ① 主繼電器「匡」＋液壓洩氣 ② 反應爐起轉：走音鋸齒與次低頻一路往上爬、進氣呼嘯、渦輪細鳴
  //  ③ 各關節伺服依序醒來（左右散開） ④ 電弧劈啪越來越密 ⑤ 上升和聲（D 小調往上推）
  //  ⑥ 2.65 秒起反向吸氣（倒吸一口） ⑦ THOOM：次低頻長下墜＋過飽和悶響＋裂擊，D 大三和弦光暈（眼睛亮起）與反應爐穩定低鳴
  mechBoot(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 40, rv: 0.55, prio: 2, min: 0.002 }); if (!S) return;
    const { v, o, t } = S, T = t + 3, att = v.out.gain.value;
    const tail = this._sub(v, o, this.echoIn, 0.35 * Math.sqrt(att));
    const body = this._sat(v, o, 2.4, 0.5);
    this._duck(3, t, 0.3);
    // ①
    this._clank(v, o, t, 140, 0.16, 0.5, PLATE);
    this._thump(v, o, t, 80, 40, 0.38, 0.35, 1.6);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.02, g: 0.2, ft: 'bandpass', f: 1800, q: 2 });
    this._N(v, o, { t: t + 0.08, b: 'w', a: 0.02, h: 0.15, d: 0.5, g: 0.07, ft: 'bandpass', f: 2600, f1: 1500, q: 1.2 });
    // ②
    for (const det of [-12, 0, 10]) {
      this._T(v, body, { t: t + 0.1, type: 'sawtooth', f: 28, f1: 190, gl: 2.85, det, a: 2.75, h: 0.03, d: 0.1, g: 0.08, ft: 'lowpass', ff: 120, ff1: 2600, fgl: 2.85, fq: 4 });
    }
    this._T(v, o, { t: t + 0.1, f: 26, f1: 58, gl: 2.85, a: 2.7, h: 0.05, d: 0.12, g: 0.3 });
    this._T(v, o, { t: t + 0.3, f: 300, f1: 4200, gl: 2.6, a: 2.5, h: 0.05, d: 0.08, g: 0.018 });
    this._T(v, o, { t: t + 0.3, f: 450, f1: 6300, gl: 2.6, a: 2.5, h: 0.05, d: 0.08, g: 0.007 });
    this._N(v, o, { t: t + 0.2, b: 'p', a: 2.55, h: 0.05, d: 0.1, g: 0.2, ft: 'bandpass', f: 300, f1: 3200, gl: 2.7, q: 1.2 });
    // ③
    for (const [dt, pn, f] of [[0.55, -0.6, 150], [0.95, 0.5, 175], [1.35, -0.3, 200], [1.75, 0.7, 230], [2.15, 0, 260]]) {
      const po = this._pan(v, pn, o), ts = t + dt;
      this._T(v, po, { t: ts, type: 'sawtooth', f, f1: f * 1.7, gl: 0.25, a: 0.03, h: 0.12, d: 0.12, g: 0.06, ft: 'bandpass', ff: 800, ff1: 1600, fgl: 0.25, fq: 3 });
      this._N(v, po, { t: ts, b: 'w', a: 0.02, d: 0.25, g: 0.03, ft: 'bandpass', f: 2800, q: 2 });
      this._clank(v, po, ts + 0.28, rnd(260, 380), 0.07, 0.3, PLATE);
    }
    // ④
    this._gran(v, o, { t: t + 1.2, dur: 0.9, b: 'w', ft: 'highpass', f: 3500, q: 0.7, g: 0.04, gd: [0.002, 0.006], gap: [0.03, 0.1] });
    this._gran(v, o, { t: t + 2.1, dur: 0.8, b: 'w', ft: 'highpass', f: 3500, q: 0.7, g: 0.08, gd: [0.002, 0.007], gap: [0.005, 0.03] });
    // ⑤
    for (const [f, g] of [[146.83, 0.035], [220, 0.03], [293.66, 0.028], [349.23, 0.02]]) {
      this._T(v, tail, { t: t + 0.6, type: 'sawtooth', f: f * 0.5, f1: f, gl: 2.3, a: 2.25, h: 0.02, d: 0.12, g, ft: 'lowpass', ff: 400, ff1: 3000, fgl: 2.3, fq: 1 });
    }
    // ⑥
    this._N(v, o, { t: T - 0.35, b: 'w', a: 0.34, d: 0.015, g: 0.14, ft: 'bandpass', f: 800, f1: 4000, gl: 0.35, q: 1 });
    this._N(v, o, { t: T - 0.35, b: 'b', a: 0.34, d: 0.015, g: 0.25, ft: 'lowpass', f: 300, q: 0.7 });
    // ⑦
    this._thump(v, o, T, 62, 20, 0.95, 2.2, 2.6);
    this._T(v, o, { t: T, f: 40, f1: 18, gl: 3, a: 0.01, d: 3, g: 0.42 });
    this._N(v, body, { t: T, b: 'b', a: 0.005, d: 2.6, g: 1.0, ft: 'lowpass', f: 800, f1: 110, gl: 1.6, q: 0.8 });
    this._N(v, o, { t: T, b: 'w', a: 0.0006, d: 0.07, g: 0.5, ft: 'highpass', f: 1200 });
    this._N(v, tail, { t: T, b: 'p', a: 0.003, d: 1.2, g: 0.4, ft: 'bandpass', f: 900, f1: 250, q: 0.8 });
    this._clank(v, o, T, 110, 0.2, 1.2, PLATE);
    for (const [f, g] of [[587.33, 0.03], [880, 0.028], [1174.66, 0.024], [1479.98, 0.016], [1760, 0.012], [1763, 0.01]]) {
      this._T(v, tail, { t: T + 0.02, f, a: 0.02, h: 0.3, d: 2.6, g });
    }
    for (const det of [-8, 8]) this._T(v, body, { t: T, type: 'sawtooth', f: 55, det, a: 0.4, h: 1.2, d: 2, g: 0.05, ft: 'lowpass', ff: 300, fq: 1 });
    this._T(v, o, { t: T + 0.2, f: 110, a: 0.5, h: 1, d: 2, g: 0.06 });
    this._duck(8, T, 1.2);
    v.done();
  }

  // 敵方手榴彈落地彈跳：幾聲越來越快越來越小的「叮」＋滾動（爆炸請另呼叫 explosion）
  grenade(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 10, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t } = S, f = rnd(1900, 2500);
    [[0, 1], [0.28, 0.7], [0.47, 0.5], [0.6, 0.35], [0.69, 0.25]].forEach(([dt, g]) => {
      const ti = t + dt * rnd(0.95, 1.05);
      this._clank(v, o, ti, f * rnd(0.97, 1.03), 0.09 * g, 0.12, BAR);
      this._thump(v, o, ti, 220, 110, 0.06 * g, 0.05, 1.2);
    });
    this._gran(v, o, { t: t + 0.75, dur: 0.35, b: 'w', ft: 'bandpass', fr: [1500, 3000], q: 4, g: 0.035, gd: [0.004, 0.01], gap: [0.008, 0.03], fade: true });
    v.done();
  }

  // ───────────────────────── 內部 ─────────────────────────

  _tick() {
    super._tick();
    const now = this.ctx.currentTime;
    for (const [id, e] of this.dn) if (now - e.seen > 0.5) this._dnKill(id, e);
  }

  // 無線電頻段：高通＋低通＋過飽和（小喇叭沙沙聲）；回傳輸入節點
  _radioChain(v, dest) {
    const hp = this._filt(v, 'highpass', 380, 0.7), lp = this._filt(v, 'lowpass', 3300, 0.9);
    hp.connect(lp); lp.connect(this._sat(v, dest, 2.2, 0.55));
    return hp;
  }

  // 失真的敵方通話：鋸齒聲帶 → 兩個跳動的共振峰 → 音節閘門 → 環形調變（機械感）
  _chatter(v, dest, t, dur) {
    const c = this.ctx, f0 = rnd(95, 125);
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const f1 = this._filt(v, 'bandpass', 600, 5), f2 = this._filt(v, 'bandpass', 1600, 6);
    const gate = v.add(c.createGain()); gate.gain.setValueAtTime(E, t);
    const rm = v.add(c.createGain()); rm.gain.value = 0.4;
    const lfo = c.createOscillator(); lfo.frequency.value = rnd(45, 60);
    const lg = v.add(c.createGain()); lg.gain.value = 0.6;
    lfo.connect(lg); lg.connect(rm.gain);
    osc.connect(f1); osc.connect(f2);
    const mixg = v.add(c.createGain()); mixg.gain.value = 1;
    f1.connect(mixg); f2.connect(mixg);
    mixg.connect(gate); gate.connect(rm); rm.connect(dest);
    let ts = t;
    const end = t + dur;
    osc.frequency.setValueAtTime(f0, t);
    while (ts < end - 0.05) {
      const sd = Math.min(rnd(0.06, 0.13), end - ts), g = rnd(0.25, 0.45);
      const [a1, a2] = pick([[700, 1200], [400, 2200], [550, 1800], [300, 900], [650, 1500]]);
      f1.frequency.setValueAtTime(a1, ts); f2.frequency.setValueAtTime(a2, ts);
      osc.frequency.setValueAtTime(f0 * rnd(0.9, 1.25), ts);
      osc.frequency.linearRampToValueAtTime(f0 * rnd(0.85, 1.1), ts + sd);
      gate.gain.setValueAtTime(E, ts);
      gate.gain.linearRampToValueAtTime(g, ts + 0.012);
      gate.gain.setValueAtTime(g, ts + sd * 0.7);
      gate.gain.exponentialRampToValueAtTime(E, ts + sd);
      if (Math.random() < 0.35) this._N(v, dest, { t: ts, b: 'w', a: 0.003, d: 0.03, g: 0.06, ft: 'bandpass', f: rnd(3000, 4500), q: 2 });
      ts += sd + rnd(0.015, 0.05);
    }
    v.play(lfo, t, end + 0.05);
    v.play(osc, t, end + 0.05);
  }

  // 循環音淡出後停止
  _fadeKill(R, sec) {
    if (!R) return;
    const t = this.ctx.currentTime, g = R.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + sec);
    R.kill(t + sec + 0.05);
  }

  // 心跳循環：鋸齒當相位斜坡 → 查表出「撲通」包絡 → 控制低頻正弦＋棕噪的音量與音高
  _heartLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const out = R.gain(0, this.bus.body);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.5, t + 1.2);
    const pre = R.gain(2);
    const sh2 = R.add(c.createWaveShaper()); sh2.curve = this.curves.soft;
    pre.connect(sh2); sh2.connect(R.gain(0.28, out));
    const ph = R.osc('sawtooth', 1.3, null, t);
    const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.heart;
    ph.connect(sh);
    const amp = R.gain(0, pre); sh.connect(amp.gain);
    const o1 = R.osc('sine', 46, R.gain(0.6, amp), t);
    const pg = R.gain(24); sh.connect(pg); pg.connect(o1.frequency);
    R.noise(nb.b, R.filt('lowpass', 120, 0.8, R.gain(1.2, amp)), t);
    R.out = out;
    return R;
  }

  // 警報號笛：同一支 LFO 同時開關閘門並推高音高（同父類 _klaxon 的做法，較慢、較低、送大量殘響）
  _alarmLoop() {
    const c = this.ctx, t = this._now(), R = new Rig(c);
    const out = R.gain(0, this.bus.world);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.14, t + 0.3);
    out.connect(R.gain(0.7, this.rvbIn));
    const lp = R.filt('lowpass', 1700, 0.9, out);
    const amp = R.gain(0, lp);
    const o1 = R.osc('sawtooth', 240, amp, t);
    const o2 = R.osc('square', 360, R.gain(0.3, amp), t);
    const lfo = R.osc('sine', 0.55, null, t);
    const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.gate;
    lfo.connect(sh); sh.connect(amp.gain);
    const p1 = R.gain(70), p2 = R.gain(105);
    lfo.connect(p1); p1.connect(o1.frequency);
    lfo.connect(p2); p2.connect(o2.frequency);
    R.out = out;
    return R;
  }

  // 無人機：兩支走音鋸齒（旋翼嗡聲，被葉片頻率調幅）＋離子嗡鳴＋氣流＋細鳴；距離低通 → 聲像 → 衰減＋殘響
  _dnLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const g = R.gain(0, this.bus.world), sg = R.gain(0, this.rvbIn);
    const pn = R.pan(g); pn.connect(sg);
    const lp = R.filt('lowpass', 8000, 0.5, pn);
    const buzz = R.gain(0.6, R.filt('bandpass', 900, 1.1, R.gain(0.5, lp)));
    const b1 = R.osc('sawtooth', 190, buzz, t), b2 = R.osc('sawtooth', 203, buzz, t);
    const bl = R.osc('sine', 38, null, t), blg = R.gain(0.35);
    bl.connect(blg); blg.connect(buzz.gain);
    R.osc('sine', 95, R.gain(0.18, lp), t);
    R.osc('triangle', 190, R.gain(0.05, lp), t);
    R.noise(nb.p, R.filt('bandpass', 1800, 0.8, R.gain(0.35, lp)), t);
    const wh = R.osc('sine', 2400, R.gain(0.012, lp), t);
    Object.assign(R, { g, sg, pn, lp, b1, b2, bl, wh, seen: t, tp: t, vr: 0, d: 0, dp: 0 });
    return R;
  }

  _dnKill(id, e, fast) {
    const now = this.ctx.currentTime, tc = fast ? 0.03 : 0.08;
    e.g.gain.cancelScheduledValues(now); e.g.gain.setTargetAtTime(0, now, tc);
    e.sg.gain.cancelScheduledValues(now); e.sg.gain.setTargetAtTime(0, now, tc);
    e.kill(now + tc * 6);
    this.dn.delete(id);
  }

  // 常駐環境音（戶外）：遠方風聲（慢陣風）＋結構縫隙的細哨＋極遠的城市／戰火低鳴。取代父類的座艙嗡聲
  _startAmbience() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const g = this.ambG;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.6, t + 3);
    const wind = R.gain(0.05, g);
    const wbp = R.filt('bandpass', 380, 0.9, wind);
    R.noise(nb.p, wbp, t);
    for (const [f, dpt] of [[0.067, 0.03], [0.14, 0.015]]) {
      const l = R.osc('sine', f, null, t), lg = R.gain(dpt);
      l.connect(lg); lg.connect(wind.gain);
    }
    const wl = R.osc('sine', 0.049, null, t), wlg = R.gain(150);
    wl.connect(wlg); wlg.connect(wbp.frequency);
    const ws = R.gain(0.004, g);
    const wsb = R.filt('bandpass', 1750, 7, ws);
    R.noise(nb.w, wsb, t);
    const sl = R.osc('sine', 0.09, null, t), slg = R.gain(0.004);
    sl.connect(slg); slg.connect(ws.gain);
    const rum = R.gain(0.08, g);
    R.noise(nb.b, R.filt('lowpass', 75, 0.8, rum), t);
    const rl = R.osc('sine', 0.037, null, t), rlg = R.gain(0.04);
    rl.connect(rlg); rlg.connect(rum.gain);
    this.amb = R;
    if (this._hbWant && !this.hb) this.hb = this._heartLoop();
    if (this._alWant && !this.al) this.al = this._alarmLoop();
  }

  _buildGraph() {
    super._buildGraph();
    const c = this.ctx;
    const G = (v, dest) => { const g = c.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const F = (type, f, q, dest) => {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      if (dest) b.connect(dest);
      return b;
    };
    // 步行：外界不再經過座艙隔音低通（原本 world → 7.6 kHz 低通 → mix），改走「專注」低通（平時全開）
    this.focusLP = F('lowpass', Math.min(20000, c.sampleRate * 0.45), 0.707, this.mix);
    this.bus.world.disconnect();
    this.bus.world.connect(this.focusLP);
    // 自己的武器：略亮（高架 +2 dB）、送城市殘響
    const gs = F('highshelf', 3500, 0.7, this.mix); gs.gain.value = 2;
    this.bus.gun = G(1, gs);
    this.bus.gun.connect(G(0.22, this.rvbIn));
    // 自己的身體：近、乾（只留極少殘響）
    this.bus.body = G(1, F('highpass', 40, 0.7, this.mix));
    this.bus.body.connect(G(0.035, this.rvbIn));
    // 心跳包絡表：輸入＝相位（-1..1），輸出＝「撲（強）—通（弱）」兩個高斯脈衝，兩端歸零
    const N = 1024, heart = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), gs1 = (u - 0.12) / 0.035, gs2 = (u - 0.34) / 0.04;
      const edge = Math.min(1, u / 0.03, (1 - u) / 0.03);
      heart[i] = (Math.exp(-gs1 * gs1) + 0.65 * Math.exp(-gs2 * gs2)) * Math.max(0, edge);
    }
    this.curves.heart = heart;
  }
}

// 任何音效錯誤都不能拖垮遊戲迴圈：子類公開方法一樣包 try／catch，只警告一次。
for (const k of [
  'rifle', 'pistol', 'dry', 'reload', 'swap', 'scope', 'step', 'jump', 'land', 'breath', 'holdBreath',
  'hurt', 'shieldBreak', 'shieldRecharge', 'lowHealth', 'enemyShot', 'sniperGlint', 'whiz', 'hit', 'hitmark',
  'bodyFall', 'trooperStep', 'radio', 'droneLoop', 'droneStop', 'alarm', 'door', 'mechBoot', 'grenade',
]) {
  const f = ZeroAudio.prototype[k];
  ZeroAudio.prototype[k] = function (...args) {
    try { return f.apply(this, args); } catch (e) {
      this.lastError = e;
      if (!this._warned) { this._warned = true; console.warn('[zero-audio] ' + k + ' 失敗：', e); }
    }
  };
}
