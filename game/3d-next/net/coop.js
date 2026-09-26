/**
 * 三人連線與戰場的接點。只有 game/trio/boot.js 會建立它並以 createBattle(canvas, { coop }) 傳入；
 * battle.js 在主角模型與動作片段建好後呼叫 coop.attach(ctx)，每一格呼叫回傳物件的 update(realDt)。
 * 單人頁不傳 coop，battle.js 的掛鉤全部是 `coop?.` / `coopView?.`，不會執行。
 */
import { SEND_HZ } from './protocol.js';
import { createTeammates } from './teammates.js';
import { createEnemySync } from './enemy-sync.js';
import { WORLD_HZ } from './world.js';

const IDLE_SEND_MS = 500;   // 站著不動時改成 2 Hz，省免費額度

/** 本機狀態是否與上一筆「看起來一樣」（位置、朝向、動作名稱；單次動作播放中一律算有變化） */
export function sameState(a, b) {
  if (!a || !b) return false;
  return a.anim === b.anim && a.loop !== false && b.loop !== false
    && Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3 && Math.abs(a.z - b.z) < 1e-3
    && Math.abs(a.yaw - b.yaw) < 1e-3 && Math.abs((a.lift || 0) - (b.lift || 0)) < 1e-3;
}

/**
 * @param {{ client: import('./client.js').CoopClient, now?: () => number }} options
 */
export function createCoop({ client, now = () => performance.now() }) {
  let view = null, active = false, timer = 0, worldTimer = 0, lastSent = null, lastSentAt = -Infinity, local = null;
  const slots = new Map();   // 隊友 id → 色調槽（先到先拿，離開後空出）
  // 第二階段：隊友最新位置（世界座標）與是否還活著，給房主分配仇恨、判斷交棒對象
  const peers = new Map();
  const enemies = createEnemySync({ client, now, peers: () => peers });

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

  client.on('welcome', syncMembers);
  client.on('join', member => addPeer(member));
  client.on('leave', id => { removePeer(id); peers.delete(id); });
  client.on('state', (id, snap, at) => {
    view?.push(id, snap, at);
    peers.set(id, { x: snap.x, z: snap.z, alive: snap.anim !== 'death', at });
  });

  function tick() {
    if (!active || !local) return;
    const state = local();
    const t = now();
    if (sameState(state, lastSent) && t - lastSentAt < IDLE_SEND_MS) return;
    if (client.sendState(state)) { lastSent = state; lastSentAt = t; }
  }

  return {
    /** battle.js 呼叫：ctx = { THREE, scene, heroModel, clips, cloneSkinned, local } */
    attach(ctx) {
      local = ctx.local;
      view = createTeammates({ THREE: ctx.THREE, scene: ctx.scene, template: ctx.heroModel, clips: ctx.clips, cloneSkinned: ctx.cloneSkinned });
      syncMembers();
      return {
        update(dt) { view.update(dt, now()); },
        /** battle.js 在行軍關建好後呼叫：{ march, arena, level }（level＝march.js 模組） */
        bindLevel(level) { enemies.bind(level); },
      };
    },
    /** 開戰後才開始送自己的狀態（載入畫面期間不浪費額度） */
    setActive(value) {
      active = value;
      if (active && !timer) timer = setInterval(tick, Math.round(1000 / SEND_HZ));
      if (active && !worldTimer) worldTimer = setInterval(() => enemies.tick(), Math.round(1000 / WORLD_HZ));
      if (!active && timer) { clearInterval(timer); timer = 0; }
      if (!active && worldTimer) { clearInterval(worldTimer); worldTimer = 0; }
    },
    dispose() { this.setActive(false); view?.dispose(); view = null; slots.clear(); },
    get teammates() { return view; },
    get enemies() { return enemies; },
  };
}
