import { createConvoy, createEvacGate } from '../lastline/convoy.js';
import { Escort } from '../lastline/escort.mjs';
import { companionSpawn, MechCompanion } from '../mech-companion.mjs?v=3';
import { applyRoute } from './script.mjs';

export function createMission({ scene, world, camera, player, config, combat, zhud, input, readSave, writeSave, resumeSave }) {
  const saved = resumeSave && readSave('checkpoint');
  let route = saved?.chapter === 2 && applyRoute(config, saved.route) ? saved.route : null;
  let checkpoint = saved?.chapter === 2 && (saved.wave === 1 || (route && saved.wave === 2)) ? saved.wave : 0;
  let wave = checkpoint, choosing = false, defeated = false, finished = false, won = false;
  let stranded = null, nextJoin = 0, gateLift = 0, roadOpen = checkpoint === 2;
  const road = new Escort([[289,-120],[323,-120],[352,-120],[390,-120]]);
  if (roadOpen) { road.index = 1; road.pos = [...road.route[1]]; }
  const trucks = createConvoy(scene), terrain = (x,z) => world.height(x,z);
  const gate = createEvacGate(scene, 350,-120,terrain(350,-120)); gate.root.rotation.y = Math.PI/2;
  const drawTrucks = () => trucks.update(road.pos, Math.PI/2, terrain, i => road.pose(i*16));
  drawTrucks();
  const panel = document.createElement('section');
  panel.className = 'campaign-panel'; panel.hidden = true;
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
  document.body.append(panel);
  const save = () => writeSave('checkpoint', { chapter: 2, wave: checkpoint, route });
  const resumeControls = () => { panel.hidden = true; input.reset(); if (!input.touch.on) input.lock(); };
  function show(heading, copy, buttons) {
    panel.innerHTML = '<div class="campaign-card"><h2 id="sortie-heading"></h2><p></p><div class="row"></div></div>';
    panel.setAttribute('aria-labelledby','sortie-heading');
    panel.querySelector('h2').textContent = heading;
    panel.querySelector('p').textContent = copy;
    const row = panel.querySelector('.row');
    for (const [text, action] of buttons) {
      const link = typeof action === 'string';
      const el = document.createElement(link ? 'a' : 'button');
      el.className = 'btn'; el.textContent = text;
      if (link) el.href = action;
      else { el.type='button'; el.onclick = action; }
      row.append(el);
    }
    panel.hidden = false; input.reset(); input.unlock(); row.firstElementChild.focus({ preventScroll: true });
  }
  function choose(value) {
    if (!choosing) return;
    applyRoute(config,value); route=value; checkpoint=1; choosing=false; save(); resumeControls();
  }
  function callWingman(dt) {
    const c = combat();
    if (!roadOpen || route !== 'pier' || c.companion || c.dead || won) return;
    nextJoin -= dt; if (nextJoin > 0) return;
    nextJoin = .6;
    if (!stranded) {
      const spawn = companionSpawn(world,player);
      if (!spawn) return;
      stranded = new MechCompanion(c,{ name:'斑鳩', aggressors:true, supportBoss:true },spawn);
    }
    c.companion = stranded; stranded = null;
    c.companion.update(0); zhud.say('斑鳩','我在你的翼側。你看住指揮機，我替你分擔火力。',3.5,true);
  }
  return {
    panel, startWave: checkpoint,
    get blocked() { return choosing || defeated || finished; },
    get waveComplete() { return true; },
    ready(k, W) {
      if (k === 1 && !route) {
        if (!choosing) {
          choosing=true; checkpoint=1; save();
          show('兩道求救訊號', '攔截機正飛向閘門，斑鳩則被困在貨運道。米拉問，你先往哪邊？', [
            ['飛越吊車・截斷空援',()=>choose('sky')], ['沿碼頭・救出僚機',()=>choose('pier')],
          ]);
        }
        return false;
      }
      if (k === 2 && !roadOpen) { roadOpen=true; checkpoint=k; save(); }
      return Math.hypot(player.pos.x-W.go[0],player.pos.z-W.go[1]) < W.go[2]
        && (!W.altitude || player.pos.y-terrain(player.pos.x,player.pos.z) >= W.altitude);
    },
    onWave(k) {
      wave=checkpoint=k; save();
      if (k === 1 && route === 'pier' && !stranded) {
        const position = player.pos.clone().set(177, terrain(177,-120), -120);
        const spawn = companionSpawn(world, { pos:position, yaw:Math.PI/2 });
        if (spawn) {
          stranded = new MechCompanion(combat(), {name:'斑鳩', aggressors:true, supportBoss:true}, spawn);
          stranded.mech.animate(0, { ...stranded.pose, grounded:true, torsoYaw:Math.PI/2, pitch:-.12, lean:.14 });
        }
      }
    },
    restart() {
      if (stranded) { stranded.dispose(); stranded=null; }
      defeated=false; wave=checkpoint; return checkpoint;
    },
    tick(dt) {
      callWingman(dt);
      if (!won && roadOpen && road.index === 0) { road.step(dt,true,road.pos); drawTrucks(); }
    },
    draw(hud) {
      if (won || defeated || !route || wave > 1 || route !== 'sky') return;
      const height = Math.round(player.pos.y-terrain(player.pos.x,player.pos.z));
      if (height < 25 && !combat().enemies.some(e=>!e.dead)) hud.text(
        (input.touch.on?'點「飛行」再按「上升」':'T 切換飛行・空白鍵爬升') + '　' + height + ' / 25 m',
        hud.w/2,hud.h*.69,16,'cy',1,'center',700);
    },
    onEnd(ok) {
      if (ok) { won = true; return; }
      defeated=true;
      show('蒼焰失去動力','可以從本段接戰點重新出擊。', [['從接戰點再試',()=>{
        resumeControls(); combat().missionRetry();
      }]]);
    },
    cinematic(dt) {
      if (!won) return;
      gateLift=Math.min(1,gateLift+dt*.7); gate.open(gateLift);
      if (gateLift>.45) { road.step(dt,true,road.pos); drawTrucks(); }
      const [x,z]=road.pos, y=terrain(x,z);
      camera.position.set(x+16,y+8.8,z+21);camera.lookAt(x-2,y+2.0,z);
    },
    finish() {
      finished=true; writeSave('checkpoint',null);
      const suffix = new URLSearchParams(location.search).has('mute') ? '?mute' : '';
      show('兩輛車，都出港了。', route==='pier'
        ? '斑鳩把最後一盞藍燈留在隊尾。你從貨運道帶回來的僚機，陪二號車走過了閘門。'
        : '二號車的孩子一直望著天。你在吊車上空截下的兩架攔截機，始終沒有飛到這裡。', [
        ['再試另一條路','../demo/'+suffix],['進入機甲本篇','../'+suffix],['步兵前傳','../zero/'+suffix],['失落防線','../lastline/'+suffix],
      ]);
    },
  };
}
