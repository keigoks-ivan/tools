import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Escort, ending } from './escort.mjs';
import { createConvoy, createEvacGate } from './convoy.js';
import { Operation } from './operations.mjs';
const read = k => { try { return JSON.parse(localStorage.getItem('lastline.' + k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem('lastline.' + k, JSON.stringify(v)); } catch {} };
const page = new URL('./', import.meta.url);
export function createMission({ scene, world, player, fx, config, combat, zhud, input, G, fail, resumeSave, saveChapter }) {
  const breakout = config.breakout === true;
  const completed = config.support ?? read('operations') ?? {};
  const vehicleSupport = Array.isArray(completed.vehicleSupport) ? completed.vehicleSupport : [];
  const warningSeconds = Math.min(7, (completed.frequency ? 5 : 3.5)
    + (vehicleSupport.includes('channel-warning') ? 1.25 : 0) + (vehicleSupport.includes('quiet-channel') ? .75 : 0));
  const customsClue = config.chapter === 4 ? config.customsClue ?? null : null;
  const customsSupport = customsClue === 'shift-log' ? '值勤紀錄・海側轉運道'
    : customsClue === 'fax-copy' ? '傳真底聯・港務維修支援' : '';
  const convoy = breakout ? null : new Escort(config.route, config.chapter > 4 ? read('arrival')?.hp : 100);
  const truck = convoy ? createConvoy(scene) : null, P = new THREE.Vector3(), Q = new THREE.Vector3();
  const evacGate = convoy && config.final ? createEvacGate(scene, 600, -405, world.height(600, -405)) : null;
  let operation=null,pressure=0,salvo=null,salvoCd=10;
  const markers=new THREE.Group();scene.add(markers);
  // 現場控制箱有底座、立柱、切角外殼與按鍵；各站共用一個網格和材質。
  const parts=[],steel=[.62,.67,.65],dark=[.12,.19,.2];
  const part=(g,x,y,z,color)=>{if(g.index){const flat=g.toNonIndexed();g.dispose();g=flat;}g.translate(x,y,z);const colors=new Float32Array(g.attributes.position.count*3);for(let i=0;i<colors.length;i++)colors[i]=color[i%3];g.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(g);};
  part(new THREE.BoxGeometry(1.8,.25,1.2),0,.125,0,steel);
  part(new THREE.CylinderGeometry(.14,.18,1.3,8),0,.9,0,dark);
  part(new RoundedBoxGeometry(1.4,1.6,.8,1,.1),0,2.2,0,steel);
  part(new THREE.BoxGeometry(1.1,.9,.05),0,2.3,.41,dark);
  for(let i=0;i<3;i++)part(new THREE.BoxGeometry(.75,.04,.02),0,2.48-i*.12,.45,[.43,.76,.64]);
  for(let i=0;i<4;i++)part(new THREE.BoxGeometry(.09,.09,.045),-.3+i*.2,1.78,.44,i===3?[.73,.36,.15]:dark);
  part(new THREE.CylinderGeometry(.025,.025,.9,6),.53,3.42,0,dark);
  const beaconGeo=mergeGeometries(parts),beaconMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.75,metalness:.1});parts.forEach(g=>g.dispose());
  let warning = null;
  if (convoy) {
    const ringGeo=new THREE.RingGeometry(11.7,12,32).rotateX(-Math.PI/2),ringMat=new THREE.MeshBasicMaterial({color:0xff8054,transparent:true,opacity:.75,side:THREE.DoubleSide,depthWrite:false});
    warning=new THREE.Mesh(ringGeo,ringMat);warning.visible=false;warning.name='lastline-salvo-warning';scene.add(warning);
  }
  function setupOperation(k) {
    operation=config.waves[k]?.operation?new Operation(config.waves[k].operation):null;pressure=0;salvoCd=10;salvo=null;
    if (warning) warning.visible=false;
    markers.clear();
    for(const p of operation?.def.points||[]) {
      if (p.altitude) continue;
      const m=new THREE.Mesh(beaconGeo,beaconMat);m.position.set(p[0],world.height(p[0],p[1]),p[1]);m.castShadow=m.receiveShadow=true;markers.add(m);
    }
  }
  let exitTime = 0;
  let checkpoint = null, pending = null, cooldown = 3, finished = false, choosing = false, stopped = false, kills = 0, time = 0;
  if (config.chapter > 4) convoy.choice = ['rescue', 'artillery'].includes(read('choice')) ? read('choice') : 'artillery';
  if(config.bombardment&&convoy.choice==='artillery')config.start.lines[1]=['白鷺','反抗軍正在壓制主砲，但出口供電仍被敵方控制站鎖住。清除守軍，接通旁路。'];
  const saved = resumeSave ? read('checkpoint') : null;
  let startWave = 0;
  if (saved?.chapter === config.chapter && (saved.breakout === true) === breakout && Number.isInteger(saved.wave)
    && saved.wave >= 0 && saved.wave < config.waves.length && (breakout || convoy.restore(saved.convoy))) {
    startWave = saved.wave; kills = Number.isFinite(saved.kills) ? Math.max(0, saved.kills) : 0; time = Number.isFinite(saved.time) ? Math.max(0, saved.time) : 0; checkpoint = { ...saved, kills, time };
  }
  const terrain = (x, z) => world.height(x, z), trail = i => convoy.pose(i * 16);
  if (truck) truck.update(convoy.pos, 0, terrain, trail);
  const panel = document.createElement('section'); panel.className = 'campaign-panel'; panel.hidden = true; document.body.append(panel);
  function close() { panel.hidden = true; choosing = false; stopped = false; input.reset(); if (!input.touch.on) input.lock(); }
  function choose(choice) {
    if (!choosing || !convoy.choose(choice)) return;
    write('choice', choice); close();
    const text = choice === 'rescue' ? '橋頭小隊登車。醫療兵修復車輛，之後每個安全路口都會補修。' : '砲台座標已傳給反抗軍。敵方對車隊的遠程砲擊停止。';
    zhud.say('白鷺', text, 5, true);
    if (checkpoint) {
      // 選擇要保留，車隊位置、機甲出生點和現場作業仍須回到同一個安全路口。
      const retryConvoy = new Escort(config.route, checkpoint.convoy.hp);
      retryConvoy.choose(choice);
      checkpoint = { ...checkpoint, convoy: { ...checkpoint.convoy, choice, hp: retryConvoy.hp } };
      write('checkpoint', checkpoint);
    }
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
    if (convoy?.choice === 'rescue' && checkpoint?.wave !== wave) convoy.hp = Math.min(100, convoy.hp + (completed.medicine?9:6));
    checkpoint = { chapter: config.chapter, wave, ...(breakout ? { breakout: true } : { convoy: convoy.snapshot() }), kills, time, operation:operation?.snapshot()||null };
    if (config.chapter === 4) checkpoint.customsClue = customsClue;
    if (config.support) checkpoint.support = config.support;
    write('checkpoint', checkpoint); saveChapter(config.chapter);
  }
  function failPanel() {
    stopped = true; choosing = false; pending = null; panel.hidden = false; input.reset(); input.unlock();
    const title = breakout ? '船塢突圍中斷' : '撤離中斷';
    const heading = convoy?.hp <= 0 ? '車隊失去行動能力' : '蒼焰失去戰力';
    const retry = breakout ? '從目前的作戰區域再來。已完成的現場作業會保留。' : '從上一個安全路口再來。車隊耐久、波次、選擇與已接通的控制站一起恢復。';
    panel.innerHTML = `<div class="campaign-card"><small>${title}</small><h2>${heading}</h2><p>${retry}</p><button class="btn" data-retry>從檢查點繼續</button><a class="btn" href="${page.href}">回標題</a></div>`;
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
    cooldown = (convoy.choice === 'rescue' ? 5.5 : 7)+(completed.power?2:0);
    const enemy = C.enemies.find(e => !e.dead && !e.gone && !e.vehicle && Math.hypot(e.pos.x - convoy.pos[0], e.pos.z - convoy.pos[1]) < 230);
    if (enemy) { pending = { enemy, t: 2.8 }; zhud.say('米拉', '車隊被砲陣標定！先打掉正在瞄準的敵機！', 2, true); }
  }
  function drawOperation(h) {
    if (!operation || operation.done) return;
    const p=operation.point,ground=world.height(p[0],p[1]),goal=h.proj(Q.set(p[0],ground+(p.altitude??5),p[1]),{}),connect=input.touch.on?'按住接通':'按住 B';
    const label=operation.kind==='defend'?`${p.label} ${Math.ceil(p.seconds-operation.progress)} 秒`:`${Math.abs(player.pos.y-ground)>=4?'降落後':''}${connect}・${p.label} ${Math.round(operation.fraction*100)}%`;
    if(goal.front)h.text(label,goal.x,goal.y-25*h.s,14,'am',1,'center',700);else h.edgeMark(goal,'am',p.altitude?'空中作業':'現場作業',h.w,h.h,1);
  }
  return {
    convoy, truck, panel, evacGate, get operation(){return operation;},get waveComplete(){return !operation||operation.done;},get blocked() { return choosing || stopped || finished; }, get startWave() { return startWave; },
    get hasCheckpoint() { return checkpoint !== null; },
    ready(k, W) {
      if (breakout) return !this.blocked && Math.hypot(player.pos.x - W.go[0], player.pos.z - W.go[1]) < W.go[2];
      if (config.chapter === 4 && k > config.choiceAt && !convoy.choice) { if (!choosing) showChoice(); return false; }
      return !this.blocked && convoy.ready(k, [player.pos.x, player.pos.z], W.go[2]);
    },
    onWave(k) {
      cooldown = 7; pending = null; setupOperation(k);
      if (checkpoint?.wave === k) operation?.restore(checkpoint.operation);
      const connect = input.touch.on ? '按住接通' : '按住 B 接通';
      if (operation) {
        const altitude = operation.point?.altitude;
        const objective = altitude ? `升至離地 ${altitude} 公尺，在標記空域掩護作業。` : '留在指定區域保護作業，離開區域會停止進度。';
        zhud.say('白鷺', operation.kind === 'defend' ? objective
          : `前往現場控制站，${connect}。放開或受擊會中斷；已完成的控制站會保留。`, 5, true);
      }
      saveWave(k);
    },
    restart() {
      close(); pending = null; cooldown = 7; finished = false;setupOperation(checkpoint?.wave??0);
      if (checkpoint) { convoy?.restore(checkpoint.convoy); kills = checkpoint.kills; time = checkpoint.time; operation?.restore(checkpoint.operation); }
      // 恢復的安全波次已到達，可立刻重新開打。
      return checkpoint?.wave ?? 0;
    },
    tick(dt) {
      if (this.blocked) return;
      const C = combat(); if (C.dead || C.phase === 'done') return;
      time += dt;
      const clear = convoy && C.phase === 'fight' && !C.enemies.some(e => !e.gone) && !C.events.some(e => e.spawn);
      if(operation&&!operation.done&&C.phase==='fight') {
        const before=operation.index, p=operation.point;
        operation.step(dt,{player:[player.pos.x,player.pos.z],altitude:player.pos.y-world.height(p[0],p[1])-(p.altitude??0),held:input.keys.has('KeyB')||input.keys.has('Tsupport'),hurt:C.damageFx>.35});
        if(operation.index!==before) {
          C.note('現場作業完成','gr');
          if (convoy && operation.done && operation.def.convoyRepair) {
            const hp = convoy.hp, repair = operation.def.convoyRepair;
            convoy.hp = Math.min(100, hp + repair);
            checkpoint.convoy.hp = Math.min(100, checkpoint.convoy.hp + repair);
            const restored = Math.round(convoy.hp - hp);
            zhud.say('米拉', restored ? `港務維修隊交接完成。車隊耐久恢復 ${restored}%。` : '港務維修隊確認兩輛車都能正常行駛。車隊耐久全滿。', 4, true);
          }
          checkpoint.operation=operation.snapshot();write('checkpoint',checkpoint);
        }
        const due=Math.min(3,Math.floor(operation.time/8));
        if(!breakout&&!operation.done&&pressure<due&&(C.group!==1||!C.events.some(e=>e.spawn))&&C.enemies.filter(e=>!e.dead&&!e.gone).length+C.events.filter(e=>e.spawn).length<7){
          const source=config.waves[C.group-1]?.list.find(e=>e[0]==='grunt'||e[0]==='heavy');
          if(source){C.spawn('grunt',0,1,{x:source[1],z:source[2],ground:true,tx:player.pos.x,tz:player.pos.z});zhud.say('白鷺','敵方正在逼近作業區，掩護還沒有結束！',2,true);}pressure++;
        }
      }
      if (breakout) return;
      convoy.step(dt, clear&&this.waveComplete, [player.pos.x, player.pos.z]);
      truck.update(convoy.pos, 0, terrain, trail);
      if (!clear) fireAtConvoy(dt, C);
      if(config.bombardment&&!this.waveComplete&&convoy.choice!=='artillery') {
        salvoCd-=dt;
        if(!salvo&&salvoCd<=0){salvo={x:player.pos.x,z:player.pos.z,t:warningSeconds};warning.position.set(salvo.x,world.height(salvo.x,salvo.z)+.08,salvo.z);warning.visible=true;zhud.say('楠','砲擊落點已確認！離開紅色標記！',2,true);}
        if(salvo){salvo.t-=dt;warning.scale.setScalar(.95+.05*Math.sin(time*12));if(salvo.t<=0){const p=new THREE.Vector3(salvo.x,world.height(salvo.x,salvo.z)+1,salvo.z);fx.explosion(p,.7);C.audio.explosion(p,.7);if(player.pos.distanceTo(p)<12)C.hurt(player.apMax*.1,p);if(Math.hypot(convoy.pos[0]-salvo.x,convoy.pos[1]-salvo.z)<15)convoy.damage(6);salvo=null;warning.visible=false;salvoCd=12;}}
      } else {salvo=null;warning.visible=false;}
      if (convoy.hp <= 0) { C.dead = true; C.phase = 'done'; fail(false); }
    },
    cinematic(dt) {
      if (!finished || !evacGate) return;
      exitTime += dt; evacGate.open(Math.min(1, exitTime / 2));
      const distance = Math.min(85, Math.max(0, exitTime - 2) * 12);
      truck.update(convoy.pos, Math.PI, terrain, i => convoy.pose(i * 16, distance));
    },
    draw(h) {
      if (breakout) { drawOperation(h); return; }
      const X = h.x, w = h.w, s = Math.max(.85, h.s);
      X.save(); X.globalAlpha = 1; X.textAlign = 'left'; X.textBaseline = 'alphabetic';
      const x = 24 * s, y = 115 * s, width = 245 * s;
      X.fillStyle = 'rgba(5,13,18,.85)'; X.fillRect(x, y, width, (customsSupport ? 80 : 63) * s);
      X.fillStyle = '#b6c9ca'; X.font = `${Math.max(15, 16 * s)}px "Sortie Round",sans-serif`; X.fillText('撤離車隊  /  EVAC 02', x + 12 * s, y + 21 * s);
      X.fillStyle = '#23373e'; X.fillRect(x + 12 * s, y + 34 * s, width - 24 * s, 5 * s);
      X.fillStyle = convoy.hp < 30 ? '#ff6659' : '#a5d9ad'; X.fillRect(x + 12 * s, y + 34 * s, (width - 24 * s) * convoy.hp / 100, 5 * s);
      X.fillText(`${Math.ceil(convoy.hp)}%　${pending ? '⚠ 敵機標定中' : this.blocked ? '等待指令' : Math.hypot(player.pos.x - convoy.pos[0], player.pos.z - convoy.pos[1]) > 110 ? '等待護衛靠近' : '清路後前進'}`, x + 12 * s, y + 56 * s);
      if (customsSupport) { X.fillStyle = '#e6ae68'; X.fillText(customsSupport, x + 12 * s, y + 72 * s); }
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
      drawOperation(h);
      if(salvo){const p=h.proj(Q.set(salvo.x,world.height(salvo.x,salvo.z)+1,salvo.z),{});if(p.front)h.text(`砲擊落點 ${salvo.t.toFixed(1)} 秒`,p.x,p.y,16,'rd',1,'center',700);}
    },
    onEnd(ok) {
      if (!ok) { failPanel(); return; }
      if (finished) return;
      finished = true; pending = null; kills += combat().stats.kills;
      if (breakout) return;
      if (config.chapter === 5 && checkpoint?.wave === config.waves.length - 1 && operation?.kind === 'defend' && operation.done) {
        const broadcast = { evidence: completed.evidence === true, manifest: completed.manifest === true };
        write('operations', { ...read('operations'), broadcast });
      }
      if (!config.final) { write('arrival', { hp: convoy.hp }); write('choice', convoy.choice); }
      if (config.final) {
        const E = ending(convoy.choice, convoy.hp, completed.broadcast);
        config.end = [['米拉', '最後一輛車通過了。六十四個人，都在。'], ['白鷺', convoy.choice === 'rescue' ? '橋頭小隊也到了。醫療兵正在替孩子包紮。' : '砲陣沉默了。橋頭小隊最後回報：自行撤離。'], ['零號', E.delivery]];
        config.fin = [E.title, '全篇完　IRON DUSK · LAST LINE'];
      }
    },
    finish() {
      if (breakout) {
        saveChapter(config.chapter);
        write('checkpoint', { chapter: config.chapter, fromBreakout: true, customsClue, support: completed });
        location.href = new URL(`?ch=${config.chapter}&fromDrydock${new URLSearchParams(location.search).has('mute') ? '&mute' : ''}`, page).href;
        return;
      }
      if (config.next) { saveChapter(config.next); write('checkpoint', { chapter: config.next }); location.href = new URL('?ch='+config.next + (new URLSearchParams(location.search).has('mute') ? '&mute' : ''), page).href; return; }
      write('clear', 1); write('checkpoint', null); saveChapter(config.chapter);
      const E = ending(convoy.choice, convoy.hp, completed.broadcast); panel.hidden = false; input.reset(); input.unlock();
      panel.innerHTML = `<div class="campaign-card"><small>IRON DUSK · LAST LINE / 全篇完</small><h2>${E.title}</h2><p>${E.text}</p><div class="campaign-stats">六十四人撤離　車隊耐久 ${Math.ceil(convoy.hp)}%<br>最後防線擊倒 ${kills}　作戰 ${Math.floor(time / 60)} 分 ${Math.floor(time % 60)} 秒</div><p class="campaign-fine">製作：InvestMQuest · 神戶港場景獨立設計；機體、角色與掃描材質沿用系列素材。<br>感謝你走完這道防線。</p><div class="row"><a class="btn" href="${new URL('?ch=1', page).href}">重新開始</a><a class="btn" href="${page.href}">章節選擇</a><a class="btn" href="/games/">遊戲大廳</a></div></div>`;
    },
  };
}
