/**
 * 第二階段：房主權威的敵人同步——封包格式（純函式，game/tests/coop-sync.test.mjs 驗證）。
 *
 * 房主每 100 ms 送一則 world 訊息 d：
 *   c   房主毫秒時鐘（插值用）          q  這一局的編號（房主重開一局就換，隊友據此清場）
 *   f   1＝關鍵幀（全部敵人都列出，沒列到的就是不在了）；每秒一次，新加入或換房主的人靠它對齊
 *   n   有變化的敵人 [id, 種類, x, y, 朝向×100, 動作, hp, maxHp, 旗標, 抬升×100, 索引]（尾端 0 省略）
 *   r   上一則之後消失的敵人 id（非關鍵幀才有）
 *   lv  關卡進度（段落、結界、打破的道具、敵將、段內計數；有變化或關鍵幀才送）
 *   v   這段時間的關卡事件（警示、擊倒、敵將現身、地面紅圈…），隊友照原樣重播成自己的特效與音效
 *   dm  敵人打到誰：[[玩家 id, 傷害, 可跳躍閃過, 來源敵人 id, 朝向×100], …]，只有被打的人會扣自己的血
 * 座標一律是 Arena 的 px（60 px＝1 m），取整數；只送變化的欄位（delta），一般一則 300–900 bytes。
 */

import { SPECIAL_ROLES, captainOptions, specialOptions } from '../specials.js';

export const WORLD_HZ = 10;
export const KEYFRAME_EVERY = 10;          // 每 10 則（約 1 秒）一則關鍵幀
export const WORLD_MAX_CHARS = 4096;       // 與 workers/coop-relay/src/logic.js MAX_WORLD_BYTES 一致
export const MAX_EVENTS_PER_MESSAGE = 48;

export const ACTIONS = ['chase', 'telegraph', 'attack', 'hit', 'dead', 'idle'];
/** 敵人種類碼：決定隊友那邊用什麼模型、什麼數值（recipeFor），也決定換房主時怎麼接手 AI */
export const TYPES = ['grunt', 'runner', 'raider:grunt', 'raider:runner', 'officer:market', 'officer:red', 'officer:shadow', 'boss',
  'breakable:crate', 'breakable:jar', 'breakable:barrel', 'lantern', 'elite',
  ...SPECIAL_ROLES, 'captain', 'officer:chase'];   // 只能往後加：種類碼是陣列索引，插在中間會讓新舊版本對不上
export const BITS = { intangible: 1, phase2: 2, broken: 4 };

/** 隊友重播的關卡事件。英雄自己的事件（揮刀、受傷、補血、無雙…）各自在本機產生，不轉送 */
export const FORWARD_EVENTS = new Set([
  'telegraph', 'enemyAttack', 'kill', 'guardBreak', 'segment', 'gateOpen', 'gateClose', 'hint', 'officer', 'officerDown', 'bossDown',
  'bossIntro', 'bossPhase', 'roar', 'bossJump', 'bossSlam', 'bossSweep', 'summon', 'stagger', 'lanternBroken', 'lanternSpawn',
  'breakableBroken', 'lampHit', 'lampBroken', 'lampRestored', 'lampSecured', 'group', 'flee', 'despawn', 'drop', 'pickupLost',
  'clear', 'groundTelegraph', 'arrow', 'bomberBlast', 'volley', 'beaconLit',
]);

export function enemyType(enemy) {
  let key;
  if (enemy.kind === 'raider') key = `raider:${enemy.role}`;
  else if (enemy.kind === 'officer' || enemy.role === 'officer') key = `officer:${enemy.variant || 'market'}`;
  else if (enemy.kind === 'breakable') key = `breakable:${enemy.breakType}`;
  else if (enemy.kind === 'lantern') key = 'lantern';
  else key = enemy.role;
  const index = TYPES.indexOf(key);
  return index < 0 ? 0 : index;
}

/**
 * 種類碼 → 與 march.js 生成時相同的欄位（不含位置與血量，血量以房主快照為準）。
 * @param {number} type @param {object} T march.js 的 TUNING @param {number} index 道具索引（木箱／妖燈）
 * @returns {{ role: string, options: object }}
 */
export function recipeFor(type, T, index = 0) {
  const key = TYPES[type] || 'grunt';
  const u = T.units;
  const grunt = { hp: u.gruntHp, recover: u.recover.grunt };
  const runner = { hp: u.runnerHp, evade: u.runnerEvade, recover: u.recover.runner };
  if (key === 'grunt') return { role: 'grunt', options: { kind: 'grunt', ...grunt } };
  if (key === 'runner') return { role: 'runner', options: { kind: 'runner', ...runner } };
  if (key === 'raider:grunt') return { role: 'grunt', options: { kind: 'raider', ...grunt, ai: 'external', action: 'chase', cooldown: 0.4 } };
  if (key === 'raider:runner') return { role: 'runner', options: { kind: 'raider', ...runner, ai: 'external', action: 'chase', cooldown: 0.4 } };
  if (key === 'officer:shadow') {
    const o = T.officers.shadow;
    return { role: 'officer', options: { kind: 'officer', name: o.name, hp: o.hp, ai: 'external', fixed: true, specialScale: o.specialScale, guard: o.guard, guardRearm: o.guardRearm, variant: 'shadow', action: 'chase', mode: 'chase', modeTime: 0, cooldown: 1.2, range: 80 } };
  }
  if (key === 'officer:chase') {
    const c = T.market.chase || T.officers.red;
    return { role: 'officer', options: { kind: 'officer', chase: true, name: c.name, hp: c.hp, ai: 'external', fixed: true, specialScale: 0.5, guard: false, variant: 'chase', action: 'idle', mode: 'flee', modeTime: 0, cooldown: 1.5, range: 90, escapes: 0 } };
  }
  if (key.startsWith('officer:')) {
    const variant = key.slice(8), o = T.officers[variant];
    return { role: 'officer', options: { kind: 'officer', name: o.name, hp: o.hp, speed: o.speed, range: o.range, damage: o.damage, telegraphTime: o.telegraphTime, recover: o.recover, specialScale: o.specialScale, cooldown: o.cooldown, guard: o.guard, guardRearm: o.guardRearm, turnRate: o.turnRate, variant } };
  }
  if (key === 'boss') {
    const b = T.boss;
    return { role: 'boss', options: { hp: b.hp, ai: 'external', fixed: true, kind: 'boss', name: b.name, specialScale: b.specialScale, guard: b.guard, action: 'idle', range: 110, phase: 1, mode: 'chase', modeTime: 0, cooldown: 1, lift: 0 } };
  }
  if (key.startsWith('breakable:')) {
    const breakType = key.slice(10);
    return { role: 'breakable', options: { kind: 'breakable', breakType, breakIndex: index, hp: T.breakables.hp[breakType], ai: 'external', fixed: true, prop: true, action: 'idle', range: 0, cooldown: 0 } };
  }
  if (SPECIAL_ROLES.includes(key)) return { role: key, options: specialOptions(key) };
  if (key === 'captain') return { role: 'captain', options: captainOptions() };
  if (key === 'lantern') return { role: 'lantern', options: { hp: T.plaza.lanternHp, ai: 'external', fixed: true, prop: true, kind: 'lantern', lanternIndex: index, action: 'idle', range: 0, cooldown: 0 } };
  return { role: key, options: {} };
}

const hp10 = v => Math.round(v * 10) / 10;

/** 敵人 → 精簡陣列（尾端的 0 省略） */
export function encodeEnemy(enemy, time = 0) {
  let bits = 0;
  if (enemy.intangible) bits |= BITS.intangible;
  if (enemy.phase === 2) bits |= BITS.phase2;
  if ((enemy.guardBrokenUntil ?? -Infinity) > time || (enemy.stunUntil ?? -Infinity) > time) bits |= BITS.broken;
  const t = [enemy.id, enemyType(enemy), Math.round(enemy.x), Math.round(enemy.y), Math.round((enemy.facing || 0) * 100),
    Math.max(0, ACTIONS.indexOf(enemy.action)), hp10(enemy.hp), Math.ceil(enemy.maxHp ?? enemy.hp), bits,
    Math.round((enemy.lift || 0) * 100), enemy.breakIndex ?? enemy.lanternIndex ?? 0];
  while (t.length > 8 && t.at(-1) === 0) t.pop();
  return t;
}

export function decodeEnemy(t) {
  return {
    id: t[0], type: t[1], x: t[2], y: t[3], facing: t[4] / 100, action: ACTIONS[t[5]] || 'chase', hp: t[6], maxHp: t[7],
    bits: t[8] || 0, lift: (t[9] || 0) / 100, index: t[10] || 0,
  };
}

/** 事件 → 可以放進 JSON 的精簡版：數字取整（小數留兩位），字串截短，巢狀物件丟掉 */
export function compactEvent(event) {
  const out = {};
  for (const [key, value] of Object.entries(event)) {
    if (typeof value === 'number') { if (Number.isFinite(value)) out[key] = Math.abs(value) >= 100 ? Math.round(value) : Math.round(value * 100) / 100; }
    else if (typeof value === 'string') out[key] = value.slice(0, 80);
    else if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** 關卡進度：[段落, 結界位元, 打破的道具位元, 敵將 id, 隊伍擊倒數, …段內計數] */
export function levelStatus(march) {
  const seg = march.seg || {}, i = march.segmentIndex;
  let gates = 0;
  march.gates.forEach((gate, k) => { if (gate.open) gates |= 1 << k; });
  let broken = 0;
  for (const k of march.brokenProps) broken += 2 ** k;
  const lv = [i, gates, broken, seg.foeId || 0, march.arena.kills];
  if (i === 0) lv.push(seg.kills | 0, seg.spawned | 0, seg.escapes | 0);
  else if (i === 1) lv.push(seg.broken | 0, ...(seg.beacons || []).map(b => Math.round(b.progress * 100)));
  else if (i === 2) lv.push(hp10(seg.lamp.hp), Math.round(seg.lamp.down * 10), Math.round(seg.timer * 10), seg.secured ? 1 : 0, seg.breaks | 0);
  return lv;
}

export function decodeLevel(lv) {
  const [segment, gates, broken, foeId, kills, a = 0, b = 0, c = 0, d = 0, e = 0] = lv;
  const brokenProps = [];
  for (let k = 0; k < 53 && 2 ** k <= broken; k++) if (Math.floor(broken / 2 ** k) % 2) brokenProps.push(k);
  const gatesOpen = [];
  for (let k = 0; k < 8; k++) gatesOpen.push(!!(gates & (1 << k)));
  const out = { segment, gatesOpen, brokenProps, foeId: foeId || null, kills };
  if (segment === 0) Object.assign(out, { segKills: a, spawned: b, escapes: c });
  else if (segment === 1) Object.assign(out, { broken: a, beacons: [b, c, d].map(v => v / 100) });
  else if (segment === 2) Object.assign(out, { lampHp: a, lampDown: b / 10, timer: c / 10, secured: !!d, breaks: e });
  return out;
}

/** 房主端：記住上一則送過的內容，只送變化 */
export class WorldEncoder {
  constructor({ keyframeEvery = KEYFRAME_EVERY } = {}) { this.keyframeEvery = keyframeEvery; this.reset(); }
  reset() { this.last = new Map(); this.count = 0; this.lastLevel = ''; }
  /**
   * @param {{ enemies: object[], clock: number, epoch: string|number, time?: number, level?: number[], events?: object[], dm?: any[] }} input
   */
  encode({ enemies, clock, epoch, time = 0, level = null, events = [], dm = [] }) {
    const full = this.count % this.keyframeEvery === 0;
    this.count++;
    const seen = new Set(), n = [];
    for (const enemy of enemies) {
      if (enemy.action === 'dead') continue;
      const t = encodeEnemy(enemy, time), key = t.join(',');
      seen.add(enemy.id);
      if (full || this.last.get(enemy.id) !== key) n.push(t);
      this.last.set(enemy.id, key);
    }
    const r = [];
    for (const id of [...this.last.keys()]) if (!seen.has(id)) { r.push(id); this.last.delete(id); }
    const d = { c: Math.round(clock), q: epoch };
    if (full) d.f = 1;
    if (n.length) d.n = n;
    if (r.length && !full) d.r = r;
    const levelKey = level ? level.join(',') : '';
    if (level && (full || levelKey !== this.lastLevel)) d.lv = level;
    this.lastLevel = levelKey;
    if (events.length) d.v = events;
    if (dm.length) d.dm = dm;
    return d;
  }
}

/** 沒有任何新內容的 world 訊息不必送（省免費額度） */
export function isEmptyWorld(d) {
  return !d.f && !d.n && !d.r && !d.lv && !d.v && !d.dm;
}

/**
 * 塞不進上限就把事件分到下一則：回傳 { d, rest }（rest 放回待送佇列最前面）。
 * 敵人本身（最多 18 隻 × 約 45 字）永遠放得下。
 */
export function fitWorld(d, limit = WORLD_MAX_CHARS) {
  let rest = [];
  while (d.v?.length && JSON.stringify(d).length > limit) {
    const keep = Math.floor(d.v.length / 2);
    rest = d.v.slice(keep).concat(rest);
    d.v = d.v.slice(0, keep);
    if (!d.v.length) delete d.v;
  }
  return { d, rest };
}

/** 隊友端：把 delta 還原成「目前有哪些敵人」 */
export class WorldDecoder {
  constructor() { this.reset(); }
  reset() { this.known = new Map(); }
  /** @returns {{ full: boolean, upserts: object[], removed: number[] }} */
  apply(d) {
    const upserts = (d.n || []).filter(Array.isArray).map(decodeEnemy);
    const removed = [];
    if (d.f) {
      const present = new Set(upserts.map(u => u.id));
      for (const id of this.known.keys()) if (!present.has(id)) removed.push(id);
    } else for (const id of d.r || []) if (this.known.has(id)) removed.push(id);
    for (const id of removed) this.known.delete(id);
    for (const u of upserts) this.known.set(u.id, u);
    return { full: !!d.f, upserts, removed };
  }
}
