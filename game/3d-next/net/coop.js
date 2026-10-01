/**
 * 三人連線與戰場的接點。只有 game/trio/boot.js 會建立它並以 createBattle(canvas, { coop }) 傳入；
 * battle.js 在主角模型與動作片段建好後呼叫 coop.attach(ctx)，每一格呼叫回傳物件的 update(realDt)。
 * 單人頁不傳 coop，battle.js 的掛鉤全部是 `coop?.` / `coopView?.`，不會執行。
 */
import { SEND_HZ } from './protocol.js?v=20261002b';
import { createTeammates } from './teammates.js?v=20261002b';
import { createEnemySync } from './enemy-sync.js?v=20261002b';
import { WORLD_HZ } from './world.js';
import { readStatus, statusBits } from './team.js';
import { createTeamFx } from './team-fx.js';
import { playerColor } from './colors.js';
import { PING_COOLDOWN_MS, STATS_EVERY_MS } from './scores.js';

const IDLE_SEND_MS = 500;   // 站著不動時改成 2 Hz，省免費額度

/** 本機狀態是否與上一筆「看起來一樣」（位置、朝向、動作名稱；單次動作播放中一律算有變化） */
export function sameState(a, b) {
  if (!a || !b) return false;
  return a.anim === b.anim && a.loop !== false && b.loop !== false
    && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3
    && Math.abs(a.yaw - b.yaw) < 1e-3 && Math.abs((a.lift || 0) - (b.lift || 0)) < 1e-3 && (a.st || 0) === (b.st || 0) && a.character === b.character;
}

/**
 * @param {{ client: import('./client.js').CoopClient, now?: () => number, doc?: Document }} options
 */
export function createCoop({ client, now = () => performance.now(), doc = globalThis.document }) {
  let view = null, fx = null, active = false, timer = 0, worldTimer = 0, lastSent = null, lastSentAt = -Infinity, local = null;
  const slots = new Map();   // 隊友 id → 色調槽（先到先拿，離開後空出）
  // 第二階段：隊友最新位置（世界座標）與是否還活著，給房主分配仇恨、判斷交棒對象
  const peers = new Map();
  const hidden = () => !!doc?.hidden;
  const enemies = createEnemySync({ client, now, peers: () => peers, hidden });
  const lastAnim = new Map();   // 第三階段：隊友上一個動作（偵測剛放無雙 → 合體大招）

  // 三人頁：隊友送來的本局成績與喊話
  const board = new Map();   // id → { kills, revives, maxCombo }
  const pingListeners = new Set(), scoreListeners = new Set();
  let lastStats = '', lastStatsAt = -Infinity, lastPingAt = -Infinity;
  const fire = (set, value) => { for (const fn of set) { try { fn(value); } catch (error) { console.error(error); } } };

  function slotFor(id) {
    if (!slots.has(id)) {
      const used = new Set(slots.values());
      let slot = 0;
      while (used.has(slot)) slot++;
      slots.set(id, slot);
    }
    return slots.get(id);
  }
  function addPeer(member) {
    if (!view || member.id === client.you) return;
    view.add(member.id, member.name, slotFor(member.id));
  }
  function removePeer(id) { view?.remove(id); slots.delete(id); }
  function syncMembers() {
    if (!view) return;
    for (const id of [...view.peers.keys()]) if (!client.members.has(id)) removePeer(id);
    for (const member of client.members.values()) addPeer(member);
  }

  // 重連或有人加入 → 重送一次本局成績
  client.on('welcome', () => { lastStats = ''; syncMembers(); });
  client.on('join', member => { lastStats = ''; addPeer(member); });
  client.on('leave', id => { removePeer(id); peers.delete(id); lastAnim.delete(id); if (board.delete(id)) fire(scoreListeners, null); });
  client.on('signal', (id, d) => {
    if (d.p) fire(pingListeners, { id, kind: d.p, at: now() });
    if (Number.isInteger(d.k)) { board.set(id, { kills: d.k, revives: d.r | 0, maxCombo: d.c | 0 }); fire(scoreListeners, null); }
  });
  client.on('state', (id, snap, at) => {
    view?.push(id, snap, at);
    const { hidden: away, downed } = readStatus(snap.st);
    peers.set(id, { x: snap.x, z: snap.z, alive: snap.anim !== 'death' && !downed, downed, hidden: away, at, character: snap.character });
    const anim = snap.musou >= 0 ? 'musouFlurry' : snap.anim;
    if (anim === 'musouFlurry' && lastAnim.get(id) !== 'musouFlurry') enemies.notePeerMusou(id);
    lastAnim.set(id, anim);
  });
  const teamListeners = new Set();
  enemies.onFx(event => {
    fx?.onFx(event);
    for (const fn of teamListeners) { try { fn(event); } catch (error) { console.error(error); } }
  });

  /** 玩家代表色：依名字固定（colors.js），自己也有一個座位（排在隊友後面，不跟隊友搶色） */
  function colorOf(id) {
    const name = client.members?.get(id)?.name;
    return playerColor(name, id === client.you ? 3 : slotFor(id));
  }
  function playerIds() {
    const ids = client.members?.size ? [...client.members.keys()] : [];
    if (client.you && !ids.includes(client.you)) ids.unshift(client.you);
    return ids;
  }

  function tick() {
    if (!active || !local) return;
    // 第三階段：st＝切到背景／倒地（交棒與救援用）
    const state = { ...local(), st: statusBits({ hidden: hidden(), downed: enemies.localDowned }) };
    const t = now();
    if (sameState(state, lastSent) && t - lastSentAt < IDLE_SEND_MS) return;
    if (client.sendState(state)) { lastSent = state; lastSentAt = t; }
  }
  /** 本局成績有變就送（最多每秒一次）；只有自己一人時不送 */
  function sendStats() {
    if (!active || client.members.size < 2) return;
    const t = now();
    if (t - lastStatsAt < STATS_EVERY_MS && !enemies.ended) return;   // 結算時不等，最後成績馬上送
    const { kills, revives, maxCombo } = enemies.tally;
    const key = `${kills}/${revives}/${maxCombo}`;
    if (key === lastStats) return;
    if (client.send('x', { k: kills, r: revives, c: maxCombo })) { lastStats = key; lastStatsAt = t; fire(scoreListeners, null); }
  }
  function scoreboard() {
    return playerIds().map(id => {
      const mine = id === client.you;
      const row = mine ? enemies.tally : board.get(id);
      // missing＝從沒收到這位的成績（多半是他的頁面還是舊版，要重新整理）
      return { id, name: client.members.get(id)?.name || '隊友', color: colorOf(id), you: mine, missing: !row, kills: row?.kills | 0, revives: row?.revives | 0, maxCombo: row?.maxCombo | 0 };
    });
  }
  // 切到背景／回來：立刻送一筆，房主馬上知道誰看得到畫面（背景分頁的計時器會被瀏覽器放慢）
  doc?.addEventListener?.('visibilitychange', () => { lastSent = null; tick(); });

  /** 某位玩家（含自己）現在的世界座標；看不到就回 null */
  function positionOf(id) {
    if (id === client.you) { const s = local?.(); return s ? { x: s.x, y: s.y, z: s.z } : null; }
    const peer = view?.peers.get(id);
    return peer?.root.visible ? peer.root.position : null;
  }
  function downedIds() {
    const out = [];
    if (enemies.localDowned && client.you) out.push(client.you);
    const t = now();
    for (const [id, p] of peers) if (p.downed && t - p.at < 5000 && client.members.has(id)) out.push(id);
    return out;
  }

  return {
    /** battle.js 呼叫：ctx = { THREE, scene, heroModel, clips, cloneSkinned, local } */
    attach(ctx) {
      local = ctx.local;
      const mobile = !!globalThis.matchMedia?.('(pointer: coarse)').matches;
      const quality = mobile ? 'mobile' : 'desktop';
      view = createTeammates({ THREE: ctx.THREE, scene: ctx.scene, template: ctx.heroModel, clips: ctx.clips, cloneSkinned: ctx.cloneSkinned, quality, createEquipment: ctx.createEquipment, groundAt: ctx.groundAt });
      fx = createTeamFx({ THREE: ctx.THREE, scene: ctx.scene, quality, colorOf });
      syncMembers();
      return {
        update(dt) {
          view.update(dt, now());
          if (client.members.size > 1 || enemies.localDowned) fx.update(dt, { positionOf, players: playerIds(), downed: downedIds(), progress: enemies.reviveProgress });
        },
        /** battle.js 在行軍關建好後呼叫：{ march, arena, level }（level＝march.js 模組） */
        bindLevel(level) { enemies.bind(level); },
      };
    },
    /** 開戰後才開始送自己的狀態（載入畫面期間不浪費額度） */
    setActive(value) {
      active = value;
      if (active && !timer) timer = setInterval(() => { tick(); sendStats(); }, Math.round(1000 / SEND_HZ));
      if (active && !worldTimer) worldTimer = setInterval(() => enemies.tick(), Math.round(1000 / WORLD_HZ));
      if (!active && timer) { clearInterval(timer); timer = 0; }
      if (!active && worldTimer) { clearInterval(worldTimer); worldTimer = 0; }
    },
    /** boot.js：battle 物件（用它的 start）——全滅／過關後任何人按重來，大家一起重開 */
    setControls(controls) { enemies.setControls(controls); },
    /** boot.js：隊伍事件（wipe＝全滅、regroup＝全滅後重新開局、revived、combo…），三人頁用來播轉場畫面 */
    onTeamEvent(fn) { teamListeners.add(fn); return () => teamListeners.delete(fn); },
    /** 某位玩家的代表色（0xRRGGBB） */
    colorOf,
    /** 三人頁畫面用：玩家名單、世界座標、是否倒地 */
    playerIds,
    positionOf,
    isDowned: id => downedIds().includes(id),
    /** 快捷喊話：1＝救我、2＝這邊、3＝衝啊（太快連按會被擋下，回傳 false） */
    ping(kind) {
      const t = now();
      if (!active || !(kind >= 1 && kind <= 3) || t - lastPingAt < PING_COOLDOWN_MS) return false;
      lastPingAt = t;
      if (client.members.size > 1) client.send('x', { p: kind });
      fire(pingListeners, { id: client.you, kind, at: t });
      return true;
    },
    onPing(fn) { pingListeners.add(fn); return () => pingListeners.delete(fn); },
    /** 結算用：每人 { id, name, color, you, kills, revives, maxCombo } */
    scoreboard,
    onScores(fn) { scoreListeners.add(fn); return () => scoreListeners.delete(fn); },
    dispose() { this.setActive(false); view?.dispose(); view = null; fx?.dispose(); fx = null; slots.clear(); },
    get teammates() { return view; },
    get enemies() { return enemies; },
    isHost: () => !client.host || client.host === client.you,
  };
}
