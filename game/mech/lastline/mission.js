import * as THREE from 'three';
import { Escort, ending } from './escort.mjs';
import { createConvoy, createEvacGate } from './convoy.js';
const read = k => { try { return JSON.parse(localStorage.getItem('lastline.' + k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem('lastline.' + k, JSON.stringify(v)); } catch {} };
const page = new URL('./', import.meta.url);
export function createMission({ scene, world, player, fx, config, combat, zhud, input, G, fail, resumeSave, saveChapter }) {
  const convoy = new Escort(config.route, config.chapter === 5 ? read('arrival')?.hp : 100);
  const truck = createConvoy(scene), P = new THREE.Vector3(), Q = new THREE.Vector3();
  const evacGate = config.chapter === 5 ? createEvacGate(scene, 600, -405, world.height(600, -405)) : null;
  let exitTime = 0;
  let checkpoint = null, pending = null, cooldown = 3, finished = false, choosing = false, stopped = false, kills = 0, time = 0;
  if (config.chapter === 5) convoy.choice = ['rescue', 'artillery'].includes(read('choice')) ? read('choice') : 'artillery';
  const saved = resumeSave ? read('checkpoint') : null;
  let startWave = 0;
  if (saved?.chapter === config.chapter && Number.isInteger(saved.wave) && saved.wave >= 0 && saved.wave < config.waves.length && convoy.restore(saved.convoy)) {
    startWave = saved.wave; kills = Number.isFinite(saved.kills) ? Math.max(0, saved.kills) : 0; time = Number.isFinite(saved.time) ? Math.max(0, saved.time) : 0; checkpoint = { ...saved, kills, time };
  }
  const terrain = (x, z) => world.height(x, z), trail = i => convoy.pose(i * 16);
  truck.update(convoy.pos, 0, terrain, trail);
  const panel = document.createElement('section'); panel.className = 'campaign-panel'; panel.hidden = true; document.body.append(panel);
  function close() { panel.hidden = true; choosing = false; stopped = false; input.reset(); if (!input.touch.on) input.lock(); }
  function choose(choice) {
    if (!choosing || !convoy.choose(choice)) return;
    write('choice', choice); close();
    const text = choice === 'rescue' ? '橋頭小隊登車。醫療兵修復車輛，之後每個安全路口都會補修。' : '砲台座標已傳給反抗軍。敵方對車隊的遠程砲擊停止。';
    zhud.say('白鷺', text, 5, true);
    checkpoint = { ...checkpoint, convoy: convoy.snapshot() }; write('checkpoint', checkpoint);
  }
  function showChoice() {
    choosing = true; panel.hidden = false;
    panel.innerHTML = '<div class="campaign-card"><small>一份命令，兩種代價</small><h2>橋頭小隊還在等。</h2><p>救援小隊帶著醫療物資，但敵人的遠程砲陣還能追擊車隊。把中繼頻道交給反抗軍，能壓制砲陣；小隊只能自己撤離。</p><div class="row"><button class="btn" data-choice="rescue">1　接應小隊・修復車輛</button><button class="btn" data-choice="artillery">2　壓制砲陣・停止遠程砲擊</button></div><p class="campaign-fine">沒有倒數。這個選擇會留在存檔，影響最後的廣播。</p></div>';
    input.reset(); input.unlock();
  }
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-choice]'); if (b) choose(b.dataset.choice);
    if (e.target.closest('[data-retry]')) { close(); combat().missionRetry(); }
  });
  const keyChoice = e => { if (choosing && e.code === 'Digit1') choose('rescue'); else if (choosing && e.code === 'Digit2') choose('artillery'); };
  addEventListener('keydown', keyChoice);
  function saveWave(wave) {
    const C = combat();
    kills += C.stats.kills; C.stats.kills = 0;
    if (convoy.choice === 'rescue' && checkpoint?.wave !== wave) convoy.hp = Math.min(100, convoy.hp + 6);
    checkpoint = { chapter: config.chapter, wave, convoy: convoy.snapshot(), kills, time };
    write('checkpoint', checkpoint); saveChapter(config.chapter);
  }
  function failPanel() {
    stopped = true; choosing = false; pending = null; panel.hidden = false; input.reset(); input.unlock();
    panel.innerHTML = '<div class="campaign-card"><small>撤離中斷</small><h2>' + (convoy.hp <= 0 ? '車隊失去行動能力' : '蒼焰失去戰力') + '</h2><p>從上一個安全路口再來。車隊耐久、戰鬥波次和選擇一起恢復。</p><button class="btn" data-retry>從檢查點繼續</button><a class="btn" href="' + page.href + '">回標題</a></div>';
  }
  function fireAtConvoy(dt, C) {
    cooldown -= dt;
    if (pending) {
      pending.t -= dt;
      if (pending.t <= 0) {
        // 砲口預警期間打倒敵人，即可取消這一發；建築能阻擋射線。
        const e = pending.enemy; pending = null;
        if (!e.dead && !e.gone) {
          e.chest(P); Q.set(convoy.pos[0], world.height(...convoy.pos) + 2.8, convoy.pos[1]);
          if (world.raycast(P, Q) < 0) { fx.tracer(P.clone(), Q.clone()); fx.impact(Q.clone(), new THREE.Vector3(0, 1, 0), 'metal'); convoy.damage(e.kind === 'heavy' ? 5 : 3); }
        }
      }
    }
    if (cooldown > 0 || pending || convoy.choice === 'artillery') return;
    cooldown = convoy.choice === 'rescue' ? 5.5 : 7;
    const enemy = C.enemies.find(e => !e.dead && !e.gone && !e.vehicle && Math.hypot(e.pos.x - convoy.pos[0], e.pos.z - convoy.pos[1]) < 230);
    if (enemy) { pending = { enemy, t: 2.8 }; zhud.say('米拉', '車隊被砲陣標定！先打掉正在瞄準的敵機！', 2, true); }
  }
  return {
    convoy, truck, panel, evacGate, get blocked() { return choosing || stopped || finished; }, get startWave() { return startWave; },
    ready(k, W) {
      if (config.chapter === 4 && k > config.choiceAt && !convoy.choice) { if (!choosing) showChoice(); return false; }
      return !this.blocked && convoy.ready(k, [player.pos.x, player.pos.z], W.go[2]);
    },
    onWave(k) { cooldown = 7; pending = null; if (config.chapter === 5 && k === 1) { write('broadcast', true); zhud.say('白鷺', '城外收到簽章與名單了。現在他們無法銷毀證據。', 4, true); } saveWave(k); },
    restart() {
      close(); pending = null; cooldown = 7; finished = false;
      if (checkpoint) { convoy.restore(checkpoint.convoy); kills = checkpoint.kills; time = checkpoint.time; }
      // 恢復的安全波次已到達，可立刻重新開打。
      return checkpoint?.wave ?? 0;
    },
    tick(dt) {
      if (this.blocked) return;
      const C = combat(); if (C.dead || C.phase === 'done') return;
      time += dt;
      const clear = C.phase === 'fight' && !C.enemies.some(e => !e.gone) && !C.events.some(e => e.spawn);
      convoy.step(dt, clear, [player.pos.x, player.pos.z]);
      truck.update(convoy.pos, 0, terrain, trail);
      if (!clear) fireAtConvoy(dt, C);
      if (convoy.hp <= 0) { C.dead = true; C.phase = 'done'; fail(false); }
    },
    cinematic(dt) {
      if (!finished || !evacGate) return;
      exitTime += dt; evacGate.open(Math.min(1, exitTime / 2));
      const distance = Math.min(85, Math.max(0, exitTime - 2) * 12);
      truck.update(convoy.pos, Math.PI, terrain, i => convoy.pose(i * 16, distance));
    },
    draw(h) {
      const X = h.x, w = h.w, s = h.s;
      X.save(); X.globalAlpha = 1; X.textAlign = 'left'; X.textBaseline = 'alphabetic';
      const x = 24 * s, y = 115 * s, width = 245 * s;
      X.fillStyle = 'rgba(5,13,18,.85)'; X.fillRect(x, y, width, 63 * s);
      X.fillStyle = '#b6c9ca'; X.font = `${13 * s}px "Noto Sans TC",sans-serif`; X.fillText('撤離車隊  /  EVAC 02', x + 12 * s, y + 21 * s);
      X.fillStyle = '#23373e'; X.fillRect(x + 12 * s, y + 34 * s, width - 24 * s, 5 * s);
      X.fillStyle = convoy.hp < 30 ? '#ff6659' : '#a5d9ad'; X.fillRect(x + 12 * s, y + 34 * s, (width - 24 * s) * convoy.hp / 100, 5 * s);
      X.fillText(`${Math.ceil(convoy.hp)}%　${pending ? '⚠ 敵機標定中' : this.blocked ? '等待指令' : Math.hypot(player.pos.x - convoy.pos[0], player.pos.z - convoy.pos[1]) > 110 ? '等待護衛靠近' : '清路後前進'}`, x + 12 * s, y + 56 * s);
      // 車隊座標標記與距離，避免把車輛當成環境道具。
      const p = h.proj(Q.set(convoy.pos[0], world.height(...convoy.pos) + 7, convoy.pos[1]), {});
      if (p.front && p.x > 30 && p.x < w - 30 && p.y > 30 && p.y < h.h - 30) h.text('EVAC · ' + Math.round(Math.hypot(player.pos.x - convoy.pos[0], player.pos.z - convoy.pos[1])) + 'm', p.x, p.y, 12, 'gr', 1, 'center', 700);
      else h.edgeMark(p, 'gr', 'EVAC', w, h.h, 0.8);
      if (pending && !pending.enemy.dead) {
        const warning = h.proj(pending.enemy.chest(P), {});
        if (warning.front) h.text('車隊標定源 · 優先擊破', warning.x, warning.y - 26 * s, 13, 'rd', 1, 'center', 700);
        else h.edgeMark(warning, 'rd', '標定', w, h.h, 1);
      }
      X.restore(); h._f = null;
    },
    onEnd(ok) {
      if (!ok) { failPanel(); return; }
      finished = true; pending = null; kills += combat().stats.kills;
      if (config.chapter === 4) { write('arrival', { hp: convoy.hp }); write('choice', convoy.choice); }
      const E = ending(convoy.choice, convoy.hp);
      if (config.chapter === 5) {
        config.end = [['米拉', '最後一輛車通過了。六十四個人，都在。'], ['白鷺', convoy.choice === 'rescue' ? '橋頭小隊也到了。醫療兵正在替孩子包紮。' : '砲陣沉默了。橋頭小隊最後回報：自行撤離。'], ['零號', '把名單念出來。每一個名字。']];
        config.fin = [E.title, '全篇完　IRON DUSK · LAST LINE'];
      }
    },
    finish() {
      if (config.chapter === 4) { saveChapter(5); write('checkpoint', null); location.href = new URL('?ch=5' + (new URLSearchParams(location.search).has('mute') ? '&mute' : ''), page).href; return; }
      write('clear', 1); write('checkpoint', null); saveChapter(5);
      const E = ending(convoy.choice, convoy.hp); panel.hidden = false; input.reset(); input.unlock();
      panel.innerHTML = `<div class="campaign-card"><small>IRON DUSK · LAST LINE / 全篇完</small><h2>${E.title}</h2><p>${E.text}</p><div class="campaign-stats">六十四人撤離　車隊耐久 ${Math.ceil(convoy.hp)}%<br>最後防線擊倒 ${kills}　作戰 ${Math.floor(time / 60)} 分 ${Math.floor(time % 60)} 秒</div><p class="campaign-fine">製作：InvestMQuest · 城市、機體與角色沿用鋼鐵黃昏系列素材。<br>感謝你走完這道防線。</p><div class="row"><a class="btn" href="${new URL('?ch=1', page).href}">重新開始</a><a class="btn" href="${page.href}">章節選擇</a><a class="btn" href="/games/">遊戲大廳</a></div></div>`;
    },
  };
}
