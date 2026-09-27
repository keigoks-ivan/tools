/**
 * 第二階段：大家打同一批敵人（房主權威）。
 *
 * 房主（host）：照單人版跑 march.js 的出兵、AI、血量、段落與守將，另外
 *   - 敵人分散追不同玩家（authority.js assignTargets）：追隊友的那一群在 Arena 裡暫時把「英雄」換成該隊友的替身，
 *     打中替身不扣房主的血，而是記一筆 dm 送給那位隊友，由他自己扣血（每個人擁有自己的血量）
 *   - 收隊友的命中申報，驗證後用 Arena 原本的 _damageEnemy 扣血（防禦、破防、擊倒全照原規則）
 *   - 每 100 ms 送一則 world 訊息（world.js）：敵人 delta、關卡進度、事件、dm
 *   - 依人數加成（scaling.js）
 * 隊友（guest）：march.update 換成 guestUpdate——不出兵、不跑敵人 AI；房主的敵人變成本機的「傀儡」
 *   （ai: 'puppet'、remote: true），位置用和隊友相同的快照插值。自己打中時火花、音效、定格立刻在本機發生，
 *   同時把命中申報給房主；血量與死亡以房主為準。
 * 換房主（房主離線、頁面停住）：新房主拿最後一份鏡像直接接手（promote），傀儡轉回真的敵人。
 * 第三階段（規則與常數在 team.js）：倒地與救援（房主計時裁定）、全滅才輸且任何人都能按重來、
 *   合體大招、補給由房主裁定、交出房主只交給看得到畫面的人（帶遲滯）。
 *
 * 全部靠包裝 march／arena 這兩個實例的方法完成；battle.js 只多一行 coopView?.bindLevel(...)。
 * 單人頁從不載入這個檔案；三人頁只有自己一個人時，包裝一律直接呼叫原方法，行為與單人版相同。
 */
import { SnapshotBuffer } from './interp.js';
import { applyCountScale, scaledHp, snapshotCounts } from './scaling.js';
import { BITS, FORWARD_EVENTS, MAX_EVENTS_PER_MESSAGE, WorldDecoder, WorldEncoder, compactEvent, decodeLevel, enemyType, fitWorld, isEmptyWorld, levelStatus, recipeFor } from './world.js';
import { CLAIM_LIMITS, ClaimMeter, SOURCES, TARGETING, assignTargets, validateClaimEntry } from './authority.js';
import { ComboWindow, HANDOFF, HandoffPolicy, ReviveTracker, TEAM, comboProfile, grantPickup, teamWiped } from './team.js';

export const LOCAL_ID = '\u0000self';
const FRESH_MS = 5000;          // 隊友狀態多久沒更新就不算在場（仇恨分配、交棒都略過他）
const WAIT_HINT_MS = 2500;
const LOCAL_HIT_HOLD = 0.3;     // 本機打中後保留受擊動作的秒數，不被下一則快照蓋掉
const PREDICT_MS = 700;         // 本機預測的血量保留多久（等房主確認）
const HURT_INVULNERABLE = 0.72; // 與 Arena._hurtHero 相同
const PICKUP_RETRY_MS = 1000;   // 補給申報沒回音時多久再申報一次
const PROGRESS_HOLD_MS = 400;   // 隊友端：救援進度多久沒更新就當作中斷
const NO_INPUT = Object.freeze({});

// TUNING 原始值：以 TUNING 物件為鍵只記一次（同一頁重建戰場、或測試裡兩個實例共用模組時都不會越乘越大）
const baselines = new WeakMap();

const enemyDamage = enemy => enemy.damage ?? (enemy.role === 'boss' ? 18 : enemy.role === 'elite' ? 12 : enemy.role === 'runner' ? 7 : 9);

/**
 * @param {{ client: import('./client.js').CoopClient, now?: () => number, peers: () => Map<string,{x:number,z:number,alive:boolean,at:number,downed?:boolean,hidden?:boolean}>, hidden?: () => boolean }} options
 *   peers() 回傳隊友最新的世界座標（公尺）、是否還站著、是否倒地／切到背景、收到時間（coop.js 從角色狀態封包整理）
 *   hidden() 本機頁面是否在背景（交棒判斷用）
 */
export function createEnemySync({ client, now = () => performance.now(), peers = () => new Map(), hidden = () => !!globalThis.document?.hidden }) {
  let march = null, arena = null, level = null;
  let role = null;
  const orig = {};
  // 房主
  const encoder = new WorldEncoder();
  let outbox = [], dmBox = [], claimsIn = [];
  const proxies = new Map(), meters = new Map();
  let targets = new Map(), retargetAt = -Infinity, epochCount = 0, lastSimTime = -1, lastSimAt = 0;
  const stats = { claimsApplied: 0, claimsRejected: 0, worldSent: 0, damageSent: 0 };
  // 隊友
  const decoder = new WorldDecoder();
  const buffers = new Map();
  let inbox = [], claimsOut = [], pickupsOut = [], worldFrom = null, worldEpoch = null, lastWorldAt = -Infinity, waitingSince = null;
  // 第三階段：隊伍
  const reviver = new ReviveTracker(), policy = new HandoffPolicy(), combo = new ComboWindow();
  const revivedAt = new Map();          // 房主：剛救起的人 → 時間（忽略還沒更新的倒地封包）
  const pendingPickups = new Map();     // 隊友：已申報、等房主回覆的補給 → 申報時間
  let reviveProgress = new Map();       // 倒地者 → { pct, by, at }（房主算、隊友收 tm）
  let endEpoch = null, retryOut = false, controls = null;
  const fxListeners = new Set();

  const players = () => Math.max(1, client.members?.size || 1);
  const multi = () => role === 'host' && client.members?.size > 1;
  const T = () => level.TUNING;

  function withHero(hero, fn) {
    const saved = arena.hero;
    arena.hero = hero;
    try { return fn(); } finally { arena.hero = saved; }
  }

  // ---------------------------------------------------------------- 人數加成
  function applyScale() {
    if (!level?.TUNING) return;
    if (!baselines.has(level.TUNING)) baselines.set(level.TUNING, snapshotCounts(level.TUNING));
    applyCountScale(level.TUNING, baselines.get(level.TUNING), players());
  }

  // ---------------------------------------------------------------- 房主：替身與仇恨
  /** 隊友是否倒地：狀態封包的倒地位元（剛被救起的人在新封包到之前不算） */
  function peerDowned(id, p) { return !!p?.downed && !(now() - (revivedAt.get(id) ?? -Infinity) < TEAM.recentReviveMs); }
  /** 在場的隊友（狀態新鮮、還在房裡）；倒地的人也在內（仇恨降權、救援計時要用） */
  function presentPeers() {
    const t = now(), out = [];
    for (const [id, p] of peers()) {
      if (id === client.you || t - p.at >= FRESH_MS || !client.members?.has(id)) continue;
      const downed = peerDowned(id, p);
      if (!downed && p.alive === false) continue;
      const px = level.toPx(p.x, p.z);   // 隊友狀態是世界座標（公尺）→ Arena px
      out.push({ id, x: px.x, y: px.y, downed });
    }
    return out;
  }
  function refreshProxies(dt) {
    const live = new Set();
    for (const p of presentPeers()) {
      live.add(p.id);
      let proxy = proxies.get(p.id);
      if (!proxy) proxies.set(p.id, proxy = { id: p.id, remote: true, x: p.x, y: p.y, hp: 100, maxHp: 100, energy: 0, invulnerable: 0, dodgeCooldown: 0, height: 0, facing: 0, action: 'idle', actionTime: 0, combo: 0 });
      proxy.x = p.x; proxy.y = p.y;
      proxy.invulnerable = Math.max(0, proxy.invulnerable - dt);
      proxy.alive = true;
      proxy.downed = p.downed;
    }
    for (const [id, proxy] of proxies) if (!live.has(id)) proxy.alive = false;
  }
  function retarget(force = false) {
    const fighters = arena.enemies.filter(e => e.action !== 'dead' && !e.prop);
    if (!force && march.time < retargetAt && fighters.every(e => targets.has(e.id))) return;
    retargetAt = march.time + TARGETING.retargetEvery;
    // 倒地的人仍可能被追，但要多算一段距離：敵人優先追站著的人
    const penalty = downed => (downed ? TEAM.downedTargetPenalty : 0);
    const list = [{ id: LOCAL_ID, x: arena.hero.x, y: arena.hero.y, alive: arena.state === 'play', penalty: penalty(arena.hero.downed) }];
    for (const proxy of proxies.values()) if (proxy.alive) list.push({ id: proxy.id, x: proxy.x, y: proxy.y, penalty: penalty(proxy.downed) });
    targets = assignTargets(fighters, list, targets);
  }
  /** 這隻敵人要追的「英雄」：本機主角或某位隊友的替身 */
  function heroFor(enemy, real) {
    if (!multi()) return real;
    const id = targets.get(enemy.id);
    const proxy = id && id !== LOCAL_ID ? proxies.get(id) : null;
    return proxy?.alive ? proxy : real;
  }
  function queueDamage(proxy, damage, source = {}, ground = false) {
    if (proxy.downed) return;   // 倒地的人不再受傷
    dmBox.push([proxy.id, Math.round(damage * 10) / 10, ground ? 1 : 0, source.id | 0, Math.round((source.facing || 0) * 100)]);
    proxy.invulnerable = HURT_INVULNERABLE;
    stats.damageSent++;
  }

  // ---------------------------------------------------------------- 房主：命中申報
  function applyClaims() {
    if (!claimsIn.length) return;
    const list = claimsIn; claimsIn = [];
    const byId = new Map(arena.enemies.map(e => [e.id, e]));
    const mark = arena.events.length;
    for (const { from, d } of list) {
      if (!client.members.has(from)) continue;
      let proxy = proxies.get(from);
      if (!proxy) proxies.set(from, proxy = { id: from, remote: true, hp: 100, maxHp: 100, energy: 0, invulnerable: 0, height: 0, facing: 0, alive: true });
      if (Number.isFinite(d.x) && Number.isFinite(d.y)) { proxy.x = d.x; proxy.y = d.y; }
      if (!meters.has(from)) meters.set(from, new ClaimMeter());
      const meter = meters.get(from);
      for (const entry of (Array.isArray(d.h) ? d.h : []).slice(0, CLAIM_LIMITS.maxEntries)) {
        const enemy = byId.get(entry?.[0]);
        const check = validateClaimEntry(entry, enemy, Number.isFinite(proxy.x) ? proxy : null);
        if (!check.ok || !meter.allow(now())) { stats.claimsRejected++; continue; }
        stats.claimsApplied++;
        if (check.source === 'stun') {
          if (enemy.ai === 'external') enemy.stunUntil = Math.max(enemy.stunUntil ?? -Infinity, arena.time + check.amount);
          else arena.stagger(enemy, check.amount);
          continue;
        }
        // 隊友本機已經擲過閃避（跑者側閃），房主不再擲第二次
        const evade = enemy.evade;
        enemy.evade = undefined;
        try { withHero(proxy, () => orig._damageEnemy.call(arena, enemy, check.amount, check.source)); } finally { if (evade !== undefined) enemy.evade = evade; }
      }
      // 補給：房主裁定（先申報先得、距離合理、沒倒地），給了才由申報者自己回血
      if (Number.isInteger(d.p)) {
        const k = grantPickup(march.pickups, d.p, { x: proxy.x, y: proxy.y, downed: peerDowned(from, peers().get(from)) });
        if (k >= 0) {
          const [p] = march.pickups.splice(k, 1);
          march._emit('pickupLost', { pickupId: p.id, kind: p.kind, x: p.x, y: p.y, taken: true, to: from, amount: p.amount || 0, energy: p.energy || 0 });
        }
      }
    }
    // 隊友的命中：房主畫面不定格、不跳連擊，只保留擊倒與破防（屍體與破防特效）
    const added = arena.events.splice(mark);
    for (const event of added) if (event.type === 'kill' || event.type === 'guardBreak') arena.events.push({ ...event, remote: true });
  }

  // ---------------------------------------------------------------- 房主：分群推進敵人
  function groupedAdvance(dt) {
    const all = arena.enemies, real = arena.hero;
    const groups = new Map([[real, []]]);
    for (const enemy of all) {
      const hero = enemy.prop || enemy.ai === 'external' ? real : heroFor(enemy, real);
      if (!groups.has(hero)) groups.set(hero, []);
      groups.get(hero).push(enemy);
    }
    if (groups.size === 1) return orig._advanceEnemies.call(arena, dt);
    try {
      for (const [hero, list] of groups) { arena.hero = hero; arena.enemies = list; orig._advanceEnemies.call(arena, dt); }
    } finally { arena.hero = real; arena.enemies = all; }
    arena.attackerTokens = all.reduce((n, e) => n + (e.action === 'telegraph' || e.action === 'attack' || arena.warriorMode && e.engaged ? 1 : 0), 0);
    arena._separateEnemies();
  }

  /** 守將的跳砸／橫掃是範圍攻擊：目標以外、站在紅圈裡的玩家也要吃到 */
  function bossAoe(enemy, target, mark) {
    const b = T().boss;
    for (let i = mark; i < march.events.length; i++) {
      const event = march.events[i];
      if (event.enemyId !== enemy.id || (event.type !== 'bossSlam' && event.type !== 'bossSweep')) continue;
      const damage = event.type === 'bossSlam' ? b.slamDamage : b.sweepDamage;
      const source = { id: enemy.id, role: enemy.role, facing: enemy.facing, ground: true };
      const heroes = [arena.hero, ...[...proxies.values()].filter(p => p.alive && !p.downed)];
      for (const hero of heroes) {
        if (hero === target || Math.hypot(hero.x - event.x, hero.y - event.y) > event.radius) continue;
        if (hero.remote) { if (hero.invulnerable <= 0) queueDamage(hero, damage, source, true); }
        else arena.hurtHero(damage, source);
      }
    }
  }

  function hostCheckProgress() {
    const i = march.segmentIndex, LEVEL = level.LEVEL;
    if (i >= LEVEL.segments.length - 1 || !march.gates[i].open) return;
    // 任何一位玩家穿過結界都算進入下一段；落後的人由 _constrain／guest 端拉進新段落
    for (const hero of [arena.hero, ...[...proxies.values()].filter(p => p.alive && !p.downed)]) {
      if (hero.downed) continue;
      if (level.toWorld(hero.x, hero.y).z < march.gates[i].z - LEVEL.enterDepth) { march._startSegment(i + 1); return; }
    }
  }

  function hostUpdate(dt, input) {
    if (!multi()) {
      const r = orig.update.call(march, dt, input);
      noteSim();
      if (arena.hero.downed) hostTeam(dt);   // 隊友都離開了、只剩倒地的自己 → 全滅
      return r;
    }
    refreshProxies(Math.min(dt, 0.1));
    applyClaims();
    retarget();
    const r = orig.update.call(march, dt, input);
    noteSim();
    hostTeam(dt);
    return r;
  }
  function noteSim() { if (march.time !== lastSimTime) { lastSimTime = march.time; lastSimAt = now(); } }

  function captureEvents(list) {
    if (!multi()) return;
    for (const event of list) {
      if (FORWARD_EVENTS.has(event.type)) outbox.push(compactEvent(event));
      else if (event.type === 'pickup') outbox.push(compactEvent({ type: 'pickupLost', pickupId: event.pickupId, kind: event.kind, x: event.x, y: event.y, taken: true }));
    }
    if (outbox.length > MAX_EVENTS_PER_MESSAGE * 4) outbox.splice(0, outbox.length - MAX_EVENTS_PER_MESSAGE * 4);
  }

  function epoch() { return `${client.you || ''}:${epochCount}`; }

  function hostTick() {
    if (!march || role !== 'host' || !(client.members?.size > 1)) { outbox.length = 0; dmBox.length = 0; return; }
    const t = now();
    // 先把手上的東西送出去（擊倒、過關、剛剛打到隊友的傷害），再考慮交棒
    const events = outbox.splice(0, MAX_EVENTS_PER_MESSAGE);
    if (march.state !== 'play') {
      // 全滅或過關後：只送剩下的事件（全滅、過關通知），不再送凍住的敵人，等有人按重來
      if (events.length && client.send('e', { c: Math.round(t), q: epoch(), v: events })) stats.worldSent++;
      return;
    }
    const raw = encoder.encode({ enemies: arena.enemies, clock: t, epoch: epoch(), time: arena.time, level: levelStatus(march), events, dm: dmBox.splice(0) });
    const progress = [...reviveProgress].map(([id, p]) => [id, p.pct, p.by || '']);
    if (progress.length) raw.tm = progress;
    const { d, rest } = fitWorld(raw);
    if (rest.length) outbox.unshift(...rest);
    if (!isEmptyWorld(d) && client.send('e', d)) stats.worldSent++;
    // 畫面停住（切到背景、鎖屏）持續一段時間：交給看得到畫面的隊友，由他從鏡像接手（team.js HandoffPolicy）。
    // 沒有人看得到畫面就繼續當房主，等有人回來。倒地的房主照樣跑模擬，不交棒；過關或全滅後也不交棒
    const candidates = [];
    for (const id of client.members.keys()) {
      if (id === client.you) continue;
      const p = peers().get(id);
      const fresh = !!p && t - p.at < FRESH_MS;
      candidates.push({ id, present: fresh, visible: fresh && !p.hidden, downed: fresh && peerDowned(id, p) });
    }
    const heir = policy.decide(t, { hidden: hidden(), stalled: t - lastSimAt > HANDOFF.stallMs }, candidates);
    if (heir && client.send('y', { to: heir })) policy.yielded(t);
  }

  // ---------------------------------------------------------------- 第三階段：倒地、救援、全滅（每台裝置管自己的主角）
  const teamActive = () => client.members?.size > 1;
  function emitFx(event) { for (const fn of fxListeners) { try { fn(event); } catch (error) { console.error(error); } } }
  function netEvent(event) { if (role === 'host' && teamActive()) outbox.push(compactEvent(event)); }

  /** 本機主角血量歸零：連線中改成倒地（Arena 維持 play），不觸發單人版的陣亡 */
  function downLocal() {
    const hero = arena.hero;
    arena.state = 'play';
    Object.assign(hero, { hp: 0, downed: true, action: 'dead', actionTime: 0, invulnerable: 0, height: 0 });
    arena.attack = null;
    if (arena.air) arena.air = null;
    arena.inputBuffer = null;
    // Arena 發的「陣亡」事件改名，免得配樂當成輸了
    for (const event of arena.events) if (event.type === 'dead') event.type = 'downed';
    march._say('你倒下了！隊友靠近站著不動 3 秒就能把你扶起來', 4);
  }
  function reviveLocal() {
    const hero = arena.hero;
    if (!hero.downed) return;
    const hp = Math.max(1, Math.round(hero.maxHp * TEAM.reviveHp));
    Object.assign(hero, { downed: false, hp, action: 'idle', actionTime: 0, invulnerable: TEAM.reviveInvulnerable });
    march._emit('heal', { x: hero.x, y: hero.y, amount: hp });
    march._emit('revived', { x: hero.x, y: hero.y });
    march._say('隊友把你扶起來了！', 2.5);
  }
  function localId() { return client.you || LOCAL_ID; }

  /** 房主：救援計時與全滅判定（每一格） */
  function hostTeam(dt) {
    if (march.state !== 'play') return;
    const hero = arena.hero;
    const list = [{ id: localId(), x: hero.x, y: hero.y, downed: !!hero.downed, present: true }, ...presentPeers()];
    const { progress, revived } = reviver.update(Math.min(dt, 0.1), list);
    const t = now();
    reviveProgress = new Map(progress.map(([id, pct, by]) => [id, { pct, by, at: t }]));
    for (const id of revived) {
      if (id === localId()) reviveLocal(); else revivedAt.set(id, t);
      netEvent({ type: 'revive', id });
      emitFx({ type: 'revived', id });
    }
    // 全滅：房裡每一位都倒地（沒收到狀態的人算站著）
    const members = client.members?.size ? [...client.members.keys()] : [localId()];
    const everyone = members.map(id => id === client.you || !client.you ? { downed: !!hero.downed } : { downed: peerDowned(id, peers().get(id)) && now() - (peers().get(id)?.at ?? -Infinity) < FRESH_MS });
    if (hero.downed && teamWiped(everyone)) {
      endRun();
      netEvent({ type: 'wipe', segment: march.segmentIndex });
    }
  }
  /** 全滅：大家一起看結算畫面（battle.js 看到 arena.state 不是 play 就顯示「重新集結」） */
  function endRun() {
    if (march.state !== 'play') return;
    const hero = arena.hero;
    march.state = 'dead';
    arena.state = 'dead';
    march.result = { rank: null, time: march.time, maxCombo: march.maxCombo, hp: 0, maxHp: hero.maxHp, kills: arena.kills, segment: march.segmentIndex };
    march._emit('fail', { segment: march.segmentIndex, wipe: true });
    reviveProgress = new Map();
  }
  /** 重來：房主直接重開；battle.js 的 start() 由 boot.js 經 setControls 交給這裡（沒有時退回 march.reset） */
  function restart() {
    if (controls?.start) controls.start(); else march.reset();
  }
  function teamReset() {
    const hero = arena.hero;
    hero.downed = false;
    reviver.reset(); revivedAt.clear(); pendingPickups.clear(); combo.reset();
    reviveProgress = new Map();
  }

  // ---------------------------------------------------------------- 第三階段：合體大招
  function boostLocal(partners) {
    const attack = arena.attack;
    if (!attack?.flurry || attack.profile?.combo || arena.hero.action !== 'special' || arena.hero.actionTime >= attack.profile.impact) return false;
    attack.profile = comboProfile(attack.profile);
    march._emit('comboMusou', { x: arena.hero.x, y: arena.hero.y, partners: partners.length });
    march._say('合體大招！', 2);
    emitFx({ type: 'combo', ids: [localId(), ...partners] });
    return true;
  }
  function noteLocalMusou() {
    if (!teamActive()) return;
    const partners = combo.note(localId(), now());
    if (partners.length) boostLocal(partners);
  }
  /** coop.js：隊友的動作剛切到無雙亂舞 */
  function notePeerMusou(id) {
    const partners = combo.note(id, now());
    emitFx({ type: 'peerMusou', id });
    if (!partners.includes(localId())) { if (partners.length) emitFx({ type: 'combo', ids: [id, ...partners] }); return; }
    // 自己先放、隊友在視窗內跟上：自己這一招還沒到終結就補上加成
    if (!boostLocal([id])) emitFx({ type: 'combo', ids: [id, ...partners] });
  }

  // ---------------------------------------------------------------- 隊友：傀儡
  function makePuppet(u) {
    const recipe = recipeFor(u.type, T(), u.index);
    const puppet = {
      id: u.id, role: recipe.role, x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp,
      action: u.action, actionTime: 0, facing: u.facing, telegraph: 0, cooldown: 0, range: 74,
      attackResolved: true, hitStun: 0, engaged: false,
      ...recipe.options, netType: u.type, remote: true, ai: 'puppet', hostHp: u.hp, segment: march.segmentIndex,
    };
    delete puppet.evade;   // 跑者的側閃由房主決定；隊友這邊的命中一律送出申報
    puppet.hp = u.hp; puppet.maxHp = u.maxHp; puppet.action = u.action; puppet.lift = u.lift;
    arena.enemies.push(puppet);
    march.units.set(puppet.id, puppet);
    arena.nextEnemyId = Math.max(arena.nextEnemyId, puppet.id + 1);
    return puppet;
  }
  function updatePuppet(puppet, u) {
    if (puppet.netType !== u.type) {
      const recipe = recipeFor(u.type, T(), u.index);
      puppet.role = recipe.role;
      for (const key of ['kind', 'variant', 'name', 'guard', 'specialScale', 'breakType', 'breakIndex', 'lanternIndex', 'fixed', 'prop']) {
        if (key in recipe.options) puppet[key] = recipe.options[key]; else delete puppet[key];
      }
      puppet.netType = u.type;
    }
    puppet.hostHp = u.hp; puppet.maxHp = u.maxHp;
    puppet.intangible = !!(u.bits & BITS.intangible);
    puppet.phase = u.bits & BITS.phase2 ? 2 : 1;
    if (u.bits & BITS.broken) puppet.guardBrokenUntil = arena.time + 0.25;
  }
  function removePuppet(id) {
    const index = arena.enemies.findIndex(e => e.id === id);
    if (index >= 0) arena.enemies.splice(index, 1);
    march.units.delete(id);
    buffers.delete(id);
    march.hazards = march.hazards.filter(h => h.ownerId !== id);
  }
  function clearWorld() {
    for (const enemy of [...arena.enemies]) removePuppet(enemy.id);
    arena.enemies.length = 0;
    march.units.clear();
    march.hazards = [];
    march.pickups = [];
    march.brokenProps.clear();
    buffers.clear();
    decoder.reset();
  }
  function pushSample(puppet, clock) {
    let buffer = buffers.get(puppet.id);
    if (!buffer) buffers.set(puppet.id, buffer = new SnapshotBuffer({ interval: 1000 / 10, maxExtrapolate: 0 }));
    const u = decoder.known.get(puppet.id);
    if (u) buffer.push({ t: clock, x: u.x, y: 0, z: u.y, yaw: u.facing, lift: u.lift, action: u.action }, now());
  }
  function placePuppets(dt) {
    const t = now();
    for (const enemy of arena.enemies) {
      if (!enemy.remote) continue;
      const s = buffers.get(enemy.id)?.sample(t);
      if (s) {
        enemy.x = s.x; enemy.y = s.z; enemy.facing = s.yaw; enemy.lift = s.lift;
        if (enemy.localHold > 0) enemy.localHold -= dt;
        else if (s.action && s.action !== enemy.action) { enemy.action = s.action; enemy.actionTime = 0; }
      }
      enemy.actionTime += dt;
      enemy.hp = enemy.predict && t < enemy.predict.until ? Math.min(enemy.hostHp, enemy.predict.hp) : enemy.hostHp;
      if (enemy.predict && t >= enemy.predict.until) enemy.predict = null;
    }
  }

  // ---------------------------------------------------------------- 隊友：關卡鏡像
  function freshSeg(index) {
    const t = T();
    if (index === 0) return { kills: 0, spawned: 0, nextGroupAt: Infinity, hints: 0, officerAt: null, foeId: null };
    if (index === 1) return { broken: 0, lanternIds: [], nextSpawnAt: [], officerAt: null, foeId: null };
    if (index === 2) return { lamp: { hp: t.stairs.lampHp, maxHp: t.stairs.lampHp, down: 0 }, timer: t.stairs.holdSeconds, secured: false, nextWaveAt: Infinity, nextTopAt: Infinity, side: 'left', officerAt: null, foeId: null, breaks: 0 };
    return { foeId: null };
  }
  function enterSegment(index) {
    if (index === march.segmentIndex || !level.LEVEL.segments[index]) return;
    const LEVEL = level.LEVEL, hero = arena.hero;
    if (march.segmentIndex >= 0) march.stats.segmentTimes.push(march.time);
    if (index > 0 && march.gates[index - 1]?.open) march.gates[index - 1].open = false;
    march.segmentIndex = index;
    march.seg = freshSeg(index);
    march._applyRegion();
    const segment = LEVEL.segments[index];
    // 房主（或其他隊友）已經進下一段：落在結界後面的自己直接拉到新段落入口
    if (!level.insideSegment(segment, level.toWorld(hero.x, hero.y), 0)) {
      const p = level.toPx(segment.entry.x, segment.entry.z);
      Object.assign(hero, { x: p.x, y: p.y });
    }
    march.pickups = march.pickups.filter(p => level.insideSegment(segment, level.toWorld(p.x, p.y), 0.5));
    const heal = Math.min(T().segmentHeal, hero.maxHp - hero.hp);
    if (heal > 0 && arena.state === 'play') { hero.hp += heal; march._emit('heal', { x: hero.x, y: hero.y, amount: heal }); }
    march._emit('segment', { index, id: segment.id, name: segment.name, heal, x: hero.x, y: hero.y });
  }
  function applyLevel(lv) {
    const L = decodeLevel(lv);
    enterSegment(L.segment);
    let changed = false;
    march.gates.forEach((gate, k) => { if (gate.open !== L.gatesOpen[k]) { gate.open = L.gatesOpen[k]; changed = true; } });
    if (changed) march._applyRegion();
    march.brokenProps = new Set(L.brokenProps);
    arena.kills = L.kills;
    const seg = march.seg;
    seg.foeId = L.foeId;
    if (L.segment === 0) { seg.kills = L.segKills; seg.spawned = L.spawned; }
    else if (L.segment === 1) {
      seg.broken = L.broken;
      for (const enemy of arena.enemies) if (enemy.kind === 'lantern') seg.lanternIds[enemy.lanternIndex] = enemy.id;
    } else if (L.segment === 2) Object.assign(seg, { timer: L.timer, secured: L.secured, breaks: L.breaks, lamp: { ...seg.lamp, hp: L.lampHp, down: L.lampDown } });
  }
  function guestEvent(event) {
    const type = event.type;
    if (type === 'segment') { enterSegment(event.index); return; }
    if (type === 'gateOpen' || type === 'gateClose') {
      const gate = march.gates[event.index];
      if (gate) { gate.open = type === 'gateOpen'; march._applyRegion(); }
    } else if (type === 'groundTelegraph') {
      const { type: _, duration = 0.6, start, until, ...hazard } = event;
      march.hazards.push({ ...hazard, start: march.time, until: march.time + duration });
    } else if (type === 'drop') {
      march.pickups.push({ id: event.pickupId, kind: event.kind, x: event.x, y: event.y, amount: event.amount || 0, energy: event.energy || 0, until: march.time + T().pickupLife });
    } else if (type === 'pickupLost') {
      if (event.to === client.you && !arena.hero.downed && march.state === 'play') guestGranted(event);
      pendingPickups.delete(event.pickupId);
      march.pickups = march.pickups.filter(p => p.id !== event.pickupId);
    } else if (type === 'kill' || type === 'flee' || type === 'despawn') {
      removePuppet(event.enemyId);
      decoder.known.delete(event.enemyId);
    } else if (type === 'breakableBroken') march.brokenProps.add(event.index);
    else if (type === 'hint') { march.hint = event.text; march.hintUntil = march.time + (event.seconds || 4); }
    else if (type === 'bossPhase') { const boss = march.units.get(event.enemyId); if (boss) boss.phase = 2; }
    else if (type === 'clear') { guestClear(); return; }
    else if (type === 'revive') { if (event.id === client.you) reviveLocal(); reviveProgress.delete(event.id); emitFx({ type: 'revived', id: event.id }); }
    else if (type === 'wipe') { endEpoch = worldEpoch; endRun(); }
    const { type: _, ...values } = event;
    march._emit(type, { ...values, remote: true });
  }
  function guestClear() {
    if (march.state !== 'play') return;
    endEpoch = worldEpoch;
    for (const enemy of [...arena.enemies]) removePuppet(enemy.id);
    march.hazards = [];
    march.stats.segmentTimes.push(march.time);
    const hero = arena.hero;
    const rank = level.rankFor({ time: march.time, maxCombo: march.maxCombo, hp: hero.hp, maxHp: hero.maxHp });
    march.result = { ...rank, time: march.time, maxCombo: march.maxCombo, hp: hero.hp, maxHp: hero.maxHp, kills: arena.kills };
    march.state = 'clear';
    arena.win();
    march._collectArenaEvents();
    march._emit('clear', { ...march.result, x: hero.x, y: hero.y });
  }
  function processWorld(from, d) {
    // 自己已經按了重來、房主還沒重開：舊局的訊息不理
    if (endEpoch !== null && d.q === endEpoch && march.state === 'play') return;
    if (endEpoch !== null && d.q !== undefined && d.q !== endEpoch) endEpoch = null;
    if (Array.isArray(d.tm)) {
      const t = now();
      for (const entry of d.tm) if (Array.isArray(entry) && typeof entry[0] === 'string') reviveProgress.set(entry[0], { pct: +entry[1] || 0, by: entry[2] || null, at: t });
    }
    if (worldFrom === from && worldEpoch !== null && d.q !== worldEpoch) clearWorld();   // 房主重開一局
    worldFrom = from; worldEpoch = d.q;
    const { upserts, removed } = decoder.apply(d);
    for (const id of removed) removePuppet(id);
    const byId = new Map(arena.enemies.map(e => [e.id, e]));
    for (const u of upserts) {
      const existing = byId.get(u.id);
      if (existing && !existing.remote) { removePuppet(u.id); byId.delete(u.id); }   // 本機殘留的同 id 敵人（換手瞬間）
      const puppet = byId.get(u.id) || makePuppet(u);
      updatePuppet(puppet, u);
      byId.set(u.id, puppet);
    }
    for (const enemy of arena.enemies) if (enemy.remote) pushSample(enemy, d.c);
    if (Array.isArray(d.lv)) applyLevel(d.lv);
    for (const event of Array.isArray(d.v) ? d.v : []) if (event && typeof event.type === 'string') guestEvent(event);
    for (const hit of Array.isArray(d.dm) ? d.dm : []) {
      if (!Array.isArray(hit) || hit[0] !== client.you || arena.hero.downed) continue;
      arena.hurtHero(hit[1], { id: hit[3], role: 'scripted', facing: (hit[4] || 0) / 100, ground: !!hit[2] });
    }
  }
  /** 走到補給上：先申報給房主，房主給了（pickupLost.to＝自己）才回血，兩個人不會同時拿到同一個 */
  function guestPickups() {
    const hero = arena.hero, t = now();
    for (let i = march.pickups.length - 1; i >= 0; i--) {
      const pickup = march.pickups[i];
      if (march.time >= pickup.until) { march.pickups.splice(i, 1); pendingPickups.delete(pickup.id); continue; }
      if (hero.downed || Math.hypot(pickup.x - hero.x, pickup.y - hero.y) > 80) continue;
      if (t - (pendingPickups.get(pickup.id) ?? -Infinity) < PICKUP_RETRY_MS) continue;
      pendingPickups.set(pickup.id, t);
      if (!pickupsOut.includes(pickup.id)) pickupsOut.push(pickup.id);
    }
  }
  function guestGranted(event) {
    const hero = arena.hero;
    const pickup = march.pickups.find(p => p.id === event.pickupId) || event;
    const amount = Math.max(0, Math.min(pickup.amount || 0, hero.maxHp - hero.hp));
    const energy = Math.max(0, Math.min(pickup.energy || 0, 100 - hero.energy));
    hero.hp += amount; hero.energy += energy;
    march._emit('pickup', { pickupId: event.pickupId, kind: pickup.kind, x: pickup.x, y: pickup.y, amount, energy });
    if (amount > 0) march._emit('heal', { x: hero.x, y: hero.y, amount });
  }
  function guestUpdate(dt, input) {
    const queued = inbox; inbox = [];
    for (const { from, d } of queued) processWorld(from, d);
    if (march.state !== 'play') return march.hud();
    placePuppets(dt);
    const t0 = now();
    for (const [id, p] of reviveProgress) if (t0 - p.at > PROGRESS_HOLD_MS) reviveProgress.delete(id);
    const before = arena.time;
    arena.update(dt, input);
    const step = arena.time - before;
    march._collectArenaEvents();
    if (step > 0 && arena.state === 'play') {
      march.time += step;
      march._constrain();
      march.hazards = march.hazards.filter(h => h.until > march.time);
      guestPickups();
      if (march.combo > 0 && march.time - march.lastHitAt > T().comboWindow) march.combo = 0;
      const t = now();
      if (t - lastWorldAt > WAIT_HINT_MS) {
        waitingSince ??= t;
        if (march.time >= march.hintUntil) march._say('等待房主的戰場同步…', 2);
      } else waitingSince = null;
    }
    if (arena.state === 'dead' && march.state === 'play') {
      march.state = 'dead';
      march.result = { rank: null, time: march.time, maxCombo: march.maxCombo, hp: 0, maxHp: arena.hero.maxHp, kills: arena.kills, segment: march.segmentIndex };
      march._emit('fail', { segment: march.segmentIndex });
    }
    return march.hud();
  }
  /** 本機打中傀儡：特效照常，血量先用預測值，真正的扣血交給房主 */
  function guestHit(enemy, damage, source, push) {
    const before = enemy.hp, pad = 1e6;
    const mark = arena.events.length;
    enemy.hp = before + pad;
    orig._damageEnemy.call(arena, enemy, damage, source, push);
    const dealt = before + pad - enemy.hp;
    enemy.hp = dealt > 0 ? Math.max(Math.min(1, before), before - dealt) : before;
    let landed = false;
    for (let i = Math.min(mark, arena.events.length); i < arena.events.length; i++) {
      const event = arena.events[i];
      if (event.enemyId !== enemy.id) continue;
      if (event.type === 'hit' || event.type === 'guard') { landed = true; event.hp = enemy.hp; }
    }
    if (!landed) return;
    if (enemy.action === 'hit') enemy.localHold = LOCAL_HIT_HOLD;
    enemy.predict = { hp: enemy.hp, until: now() + PREDICT_MS };
    claimsOut.push([enemy.id, Math.round(damage * 100) / 100, SOURCES.indexOf(source) < 0 ? 0 : SOURCES.indexOf(source), arena.attackSerial | 0]);
  }
  function guestTick() {
    if (!march || role !== 'guest') { claimsOut.length = 0; pickupsOut.length = 0; retryOut = false; return; }
    if (!claimsOut.length && !pickupsOut.length && !retryOut) return;
    const d = { x: Math.round(arena.hero.x), y: Math.round(arena.hero.y), h: claimsOut.slice(0, CLAIM_LIMITS.maxEntries) };
    if (pickupsOut.length) d.p = pickupsOut[0];
    if (retryOut) d.r = 1;   // 全滅／過關後按了重來：請房主重開
    if (client.send('h', d)) { claimsOut.splice(0, d.h.length); if (d.p !== undefined) pickupsOut.shift(); retryOut = false; }
    else if (claimsOut.length > 200) claimsOut.splice(0, claimsOut.length - 200);
  }

  // ---------------------------------------------------------------- 換手
  /** 隊友 → 房主：用最後一份鏡像接手整個關卡 */
  function promote() {
    const t = T(), time = march.time;
    let maxId = 0;
    for (const e of arena.enemies) {
      maxId = Math.max(maxId, e.id);
      if (!e.remote) continue;
      const recipe = recipeFor(e.netType ?? 0, t, e.breakIndex ?? e.lanternIndex ?? 0);
      e.ai = recipe.options.ai ?? null;
      if (recipe.options.evade !== undefined) e.evade = recipe.options.evade;
      delete e.remote; delete e.hostHp; delete e.predict; delete e.localHold;
      e.hitStun = 0; e.attackResolved = true; e.telegraph = 0; e.engaged = false;
      e.cooldown = Math.max(e.cooldown || 0, 0.6);
      if (!e.prop) { e.action = 'chase'; e.actionTime = 0; }
      if (e.kind === 'officer' && e.variant === 'shadow') Object.assign(e, { mode: 'chase', modeTime: 0, lunges: 0 });
      if (e.kind === 'boss') Object.assign(e, { mode: 'chase', modeTime: 0, move: null, lift: 0, intangible: false, slam: null, resummonAt: time + t.boss.resummon.every });
      march.units.set(e.id, e);
    }
    arena.nextEnemyId = Math.max(arena.nextEnemyId, maxId + 1);
    const seg = march.seg, i = march.segmentIndex, gateOpen = march.gates[i]?.open;
    if (i === 0) {
      const alive = arena.enemies.filter(e => !e.prop && e.action !== 'dead').length;
      seg.spawned = Math.max(seg.spawned || 0, (seg.kills || 0) + alive);
      seg.nextGroupAt = time + 1.5;
      seg.hints = seg.kills >= 24 ? 3 : seg.kills >= 16 ? 2 : seg.kills >= 8 ? 1 : 0;
      seg.officerAt = seg.kills >= t.market.goal && !seg.foeId && !gateOpen && t.officers.market ? time + 1 : null;
    } else if (i === 1) {
      for (let k = 0; k < level.LEVEL.lanterns.length; k++) if (seg.lanternIds[k] === undefined) seg.lanternIds[k] = -1;
      seg.nextSpawnAt = seg.lanternIds.map((_, k) => time + 1.5 + k);
      seg.officerAt = seg.broken >= 3 && !seg.foeId && !gateOpen ? time + 1.2 : null;
    } else if (i === 2) {
      Object.assign(seg, { nextWaveAt: time + 1.5, nextTopAt: time + t.stairs.topGroupEvery, side: seg.side || 'left' });
      seg.officerAt = seg.secured && !seg.foeId && !gateOpen ? time + 1 : null;
    }
    buffers.clear(); decoder.reset();
    encoder.reset(); epochCount++;
    targets = new Map(); retargetAt = -Infinity; outbox = []; dmBox = [];
    lastSimAt = now(); policy.becameHost(now());
    reviver.reset(); revivedAt.clear(); reviveProgress = new Map();
  }
  /** 房主 → 隊友：自己的敵人全部轉成傀儡，等新房主的關鍵幀對齊 */
  function demote() {
    for (const e of arena.enemies) {
      e.remote = true; e.ai = 'puppet'; e.hostHp = e.hp;
      e.netType = enemyType(e);
    }
    decoder.reset();
    for (const e of arena.enemies) decoder.known.set(e.id, { id: e.id, type: e.netType, x: e.x, y: e.y, facing: e.facing, action: e.action, hp: e.hp, maxHp: e.maxHp, bits: 0, lift: e.lift || 0, index: e.breakIndex ?? e.lanternIndex ?? 0 });
    buffers.clear();
    worldFrom = null; worldEpoch = null; lastWorldAt = now();
    proxies.clear(); targets = new Map(); outbox = []; dmBox = []; claimsIn = [];
  }
  function syncRole() {
    const next = client.you && client.host && client.you !== client.host ? 'guest' : 'host';
    applyScale();
    if (next === role) return;
    const previous = role;
    role = next;
    if (!march) return;
    if (next === 'host' && previous === 'guest') promote();
    else if (next === 'guest') demote();
    else if (next === 'host') policy.becameHost(now());
  }

  client.on?.('welcome', syncRole);
  client.on?.('host', syncRole);
  client.on?.('join', syncRole);
  client.on?.('leave', id => { proxies.delete(id); meters.delete(id); syncRole(); });
  client.on?.('world', (d, at, from) => {
    if (role !== 'guest') return;
    lastWorldAt = now();
    if (march && march.state !== 'play') {
      // 結算畫面時畫面不跑（guestUpdate 不會被呼叫）：只看房主是不是已經重開（新的一局 epoch），是就跟著重來
      if (endEpoch === null || d.q === undefined || d.q === endEpoch) return;
      restart();
    }
    inbox.push({ from, d });
  });
  client.on?.('claim', (from, d) => {
    if (role !== 'host' || !d || typeof d !== 'object') return;
    // 隊友在結算畫面按了重來：房主重開（結算時畫面不跑，所以在這裡直接處理）
    if (d.r && march && march.state !== 'play') restart();
    claimsIn.push({ from, d });
  });

  return {
    /** battle.js：{ march, arena, level }（level＝march.js 模組）。沒有行軍關（march 為 null）時不做任何事 */
    bind(ctx) {
      if (!ctx?.march || !ctx.level) return;
      ({ march, arena, level } = ctx);
      // 第三階段：倒地（包在最裡層，下面 enemy-sync 的包裝呼叫到的「原方法」就是這些）
      const baseHurt = arena._hurtHero, baseUpdate = arena.update, baseTickPickups = march._tickPickups;
      arena._hurtHero = enemy => {
        if (arena.hero.downed) return;   // 倒地的人不再受傷
        baseHurt.call(arena, enemy);
        if (arena.state === 'dead' && teamActive()) downLocal();
      };
      arena.update = (dt, input) => {
        if (!arena.hero.downed) return baseUpdate.call(arena, dt, input);
        const snap = baseUpdate.call(arena, dt, NO_INPUT);   // 倒地：不能動、不能出招
        arena.hero.action = 'dead';
        return snap;
      };
      march._tickPickups = () => {
        if (!arena.hero.downed) return baseTickPickups.call(march);
        withHero({ x: Infinity, y: Infinity, hp: 0, maxHp: 0, energy: 100 }, () => baseTickPickups.call(march));   // 倒地時只讓補給照常過期
      };
      const keep = (object, name) => { orig[name] = object[name]; };
      for (const name of ['update', 'drainEvents', 'reset', '_spawnUnit', '_raider', '_lunger', '_boss', '_checkProgress']) keep(march, name);
      for (const name of ['_advanceEnemies', '_hurtHero', 'hurtHero', '_damageEnemy', 'stagger']) keep(arena, name);

      march.update = (dt, input) => role === 'guest' ? guestUpdate(dt, input) : hostUpdate(dt, input);
      march.drainEvents = () => {
        const list = orig.drainEvents.call(march);
        if (role === 'host') captureEvents(list);
        for (const event of list) if (event.type === 'musouStart' && !event.remote) noteLocalMusou();
        return list;
      };
      march.reset = () => {
        const hud = orig.reset.call(march);
        applyScale();
        teamReset();
        if (role === 'guest') {
          if (endEpoch !== null) retryOut = true;   // 結算後按重來：請房主一起重開
          clearWorld();
          worldFrom = null; worldEpoch = null; lastWorldAt = now();
          march.seg = freshSeg(0);
        } else { epochCount++; encoder.reset(); targets = new Map(); outbox = []; dmBox = []; lastSimAt = now(); }
        return hud;
      };
      march._spawnUnit = (unitRole, wx, wz, options = {}) => {
        if (role === 'host' && options.hp !== undefined && !options.prop) options = { ...options, hp: scaledHp(options.hp, players()) };
        return orig._spawnUnit.call(march, unitRole, wx, wz, options);
      };
      for (const name of ['_raider', '_lunger']) {
        march[name] = (enemy, dt) => withHero(heroFor(enemy, arena.hero), () => orig[name].call(march, enemy, dt));
      }
      march._boss = (enemy, dt) => {
        if (!multi()) return orig._boss.call(march, enemy, dt);
        const target = heroFor(enemy, arena.hero), mark = march.events.length;
        withHero(target, () => orig._boss.call(march, enemy, dt));
        bossAoe(enemy, target, mark);
      };
      march._checkProgress = () => multi() ? hostCheckProgress() : orig._checkProgress.call(march);

      arena._advanceEnemies = dt => {
        if (role === 'guest') return;   // 隊友不跑敵人 AI
        return multi() ? groupedAdvance(dt) : orig._advanceEnemies.call(arena, dt);
      };
      arena._hurtHero = enemy => {
        if (!arena.hero.remote) return orig._hurtHero.call(arena, enemy);
        queueDamage(arena.hero, enemyDamage(enemy), enemy, true);   // 近戰：跳起來可以閃過（與 Arena 相同）
      };
      arena.hurtHero = (damage, source = {}) => {
        if (!arena.hero.remote) return orig.hurtHero.call(arena, damage, source);
        if (arena.hero.invulnerable > 0) return false;
        queueDamage(arena.hero, damage, source, !!source.ground);
        return true;
      };
      arena._damageEnemy = (enemy, damage, source, push = null) => {
        if (role === 'guest' && enemy.remote) return guestHit(enemy, damage, source, push);
        return orig._damageEnemy.call(arena, enemy, damage, source, push);
      };
      arena.stagger = (enemy, seconds) => {
        if (role === 'guest' && enemy?.remote && !enemy.prop) {
          claimsOut.push([enemy.id, Math.min(CLAIM_LIMITS.maxStun, Math.round(seconds * 100) / 100), SOURCES.indexOf('stun'), arena.attackSerial | 0]);
          const done = orig.stagger.call(arena, enemy, seconds);
          if (done) enemy.localHold = seconds;
          return done;
        }
        return orig.stagger.call(arena, enemy, seconds);
      };
      role = null;
      lastSimAt = now();
      syncRole();
    },
    /** coop.js 以 WORLD_HZ 呼叫 */
    tick() { if (role === 'host') hostTick(); else guestTick(); },
    /** boot.js（經 coop.js）：{ start }＝battle.start，全滅／過關後同步重來用 */
    setControls(value) { controls = value || null; },
    notePeerMusou,
    /** team-fx.js 訂閱：{ type: 'combo'|'peerMusou'|'revived', … } */
    onFx(fn) { fxListeners.add(fn); return () => fxListeners.delete(fn); },
    /** 畫面用：本機是否倒地、各倒地者的救援進度（0–100） */
    get localDowned() { return !!arena?.hero?.downed; },
    get reviveProgress() { return reviveProgress; },
    get role() { return role; },
    get stats() { return { ...stats, proxies: proxies.size, targets: targets.size, puppets: arena ? arena.enemies.filter(e => e.remote).length : 0 }; },
    /** 測試用：直接看到內部狀態 */
    _debug: { proxies, policy, reviver, get endEpoch() { return endEpoch; }, restart: () => restart(), get targets() { return targets; }, retarget: force => retarget(force), refreshProxies: dt => refreshProxies(dt), promote: () => promote(), demote: () => demote(), processWorld: (from, d) => processWorld(from, d), hostTick: () => hostTick() },
  };
}

