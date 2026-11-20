import { createConvoy, createEvacGate } from '../lastline/convoy.js';
import { Escort } from '../lastline/escort.mjs';
import { companionSpawn, MechCompanion } from '../mech-companion.mjs?v=3';
import { applyRoute, modules, readSortieCheckpoint, sections } from './script.mjs';
import { fieldKit } from './field-kit.mjs';

export function createMission({ scene, world, camera, player, config, combat, zhud, input, readSave, writeSave, resumeSave }) {
  const state=readSortieCheckpoint(resumeSave && readSave('checkpoint'));
  let { wave:checkpoint, route, module:loadout, recovered, corner }=state;
  if (route) applyRoute(config,route);
  let wave = checkpoint, active=false, choosing=false, defeated=false, finished=false, won=false;
  let stranded=null, nextJoin=0, gateLift=0, recorder=null, dropTime=0, racks=[], fitted=null;
  let command=null, withdrawn=false;
  const road = new Escort([[240,-45],[240,-120],[278,-120],[323,-120],[352,-120],[390,-120]]);
  const terrain=(x,z)=>world.height(x,z), trucks=createConvoy(scene);
  const gate=createEvacGate(scene,350,-120,terrain(350,-120)); gate.root.rotation.y=Math.PI/2;
  const drawTrucks=()=>trucks.update(road.pos,0,terrain,i=>road.pose(i*16));
  function resetTrucks() {
    road.index=checkpoint>=3 ? 3 : route==='pier' ? corner : 0;
    road.pos=[...road.route[road.index]]; drawTrucks();
  }
  resetTrucks();
  const marker=player.pos.clone(), screen={};
  const panel = document.createElement('section');
  panel.className = 'campaign-panel'; panel.hidden = true;
  panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
  document.body.append(panel);
  const save = () => writeSave('checkpoint', { chapter:2, wave:checkpoint, section:sections[checkpoint], route, module:loadout, recovered, corner });
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
    applyRoute(config,value); route=value; checkpoint=1; active=false; choosing=false; save(); resumeControls();
  }
  function callWingman(dt) {
    const c = combat();
    if (checkpoint < 2 || route !== 'pier' || c.companion || c.dead || won) return;
    nextJoin -= dt; if (nextJoin > 0) return;
    nextJoin = .6;
    if (!stranded) {
      const spawn = companionSpawn(world,player);
      if (!spawn) return;
      stranded = new MechCompanion(c,{ name:'斑鳩', aggressors:true, supportBoss:true },spawn);
    }
    c.companion = stranded; stranded = null;
    c.companion.update(0); zhud.say('斑鳩','看見你的尾燈了。我跟你走。',3.5,true);
  }
  function clearProps() {
    recorder?.dispose(); recorder=null;
    racks.forEach(r=>r.prop.dispose()); racks=[];
  }
  function placeFieldKit(kind,x,y,z) {
    const prop=fieldKit(scene,kind);
    prop.root.position.set(x,y,z);
    return prop;
  }
  function fitModule(dt) {
    const c=combat();
    if (loadout==='magazine' && fitted!==c) {
      fitted=c; c.rifle.mag=60; c.rifle.ammo=60; c.rifle.reload=-1;
    }
    if (loadout==='shield' && c.shield.cooldown>0)
      c.shield.cooldown=Math.max(0,c.shield.cooldown-dt*.5);
  }
  function updateRecovery(dt) {
    if (!recorder) return;
    dropTime+=dt;
    const t=Math.min(1,dropTime/20), p=recorder.root.position;
    const x=275-35*t, z=3*Math.sin(Math.PI*t*2);
    const floor=world.support(x,z,1,1e4);
    p.set(x,Math.max(floor,terrain(x,z)+72*(1-t)),z);
    recorder.canopy.visible=p.y>floor+.4;
    recorder.root.rotation.y=.2*Math.sin(dropTime*.8);
    if (Math.hypot(player.pos.x-p.x, player.pos.z-p.z, player.pos.y+9-p.y)>17) return;
    recorder.dispose(); recorder=null; recovered=true; save();
    combat().audio.ui('confirm');
    zhud.say('白鷺','讀到了。那幾架機體只聽一個呼號。等它開口，我就能標出領隊。',3.5,true);
  }
  function updateConvoy(dt) {
    if (road.index>=3 || checkpoint<2) return;
    if (route==='pier' && checkpoint===2) {
      if (!active || corner===2) return;
      const [x,z]=road.pos, [tx,tz]=road.route[road.index+1];
      const dx=player.pos.x-x, dz=player.pos.z-z, length=Math.hypot(tx-x,tz-z)||1;
      // The driver follows the pilot's lead and waits if the pilot falls behind or flies away.
      if ((dx*(tx-x)+dz*(tz-z))/length < -4 || Math.hypot(dx,dz)>85 || player.pos.y-terrain(x,z)>38) return;
    }
    const last=road.index; road.step(dt,true,road.pos); drawTrucks();
    if (route==='pier' && checkpoint===2 && road.index!==last && road.index<=2) {
      corner=road.index; save();
      zhud.say('米拉',corner===1?'看到你了。二號車，跟著我右轉。':'兩輛都出了彎道。前面那段我認得，你繼續走！',3,true);
    }
  }
  function updateAmbush() {
    const c=combat();
    if (!command) command=c.enemies.find(e=>e.kind==='heavy');
    if (!command?.dead) return;
    if (!withdrawn) {
      withdrawn=true; zhud.say('米拉','假訊號斷了。這次說話的真的是我。',3.3,true);
    }
    for (const e of c.enemies) if (e.kind==='grunt' && !e.dead) c.flee(e);
  }
  function mark(hud,x,y,z,text,color='cy') {
    marker.set(x,y,z); const p=hud.proj(marker,screen);
    if (!p.front || p.x<40 || p.x>hud.w-40 || p.y<38 || p.y>hud.h-48) {
      hud.edgeMark(p,color,text,hud.w,hud.h); return;
    }
    const r=7*hud.s, ctx=hud.x;
    ctx.beginPath(); ctx.moveTo(p.x,p.y-r); ctx.lineTo(p.x+r,p.y); ctx.lineTo(p.x,p.y+r); ctx.lineTo(p.x-r,p.y); ctx.closePath(); hud.sk(color,.95,1.6);
    hud.text(text,p.x,p.y-18*hud.s,13,color,1,'center',700);
  }
  return {
    panel, startWave: checkpoint,
    get blocked() { return choosing || defeated || finished; },
    get waveComplete() {
      if (!active) return true;
      if (wave===2) return route==='sky' ? recovered : corner===2;
      return wave!==3 || !!loadout;
    },
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
      if (checkpoint!==k) { checkpoint=k; active=false; save(); }
      return Math.hypot(player.pos.x-W.go[0],player.pos.z-W.go[1]) < W.go[2]
        && (!W.altitude || player.pos.y-terrain(player.pos.x,player.pos.z) >= W.altitude);
    },
    onWave(k) {
      clearProps(); wave=checkpoint=k; active=true; save();
      if (k===2 && route==='sky' && !recovered) {
        dropTime=0; recorder=placeFieldKit('recorder',275,terrain(275,0)+72,0);
      }
      if (k===3 && !loadout) racks=Object.entries(modules).map(([id,{point:[x,z]}])=>({
        id, prop:placeFieldKit(id,x,terrain(x,z),z),
      }));
      if (k===4) { command=null; withdrawn=false; }
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
      clearProps(); resetTrucks(); command=null; withdrawn=false; nextJoin=0;
      defeated=false; active=false; wave=checkpoint; return checkpoint;
    },
    tick(dt) {
      if (won || defeated || combat().dead) return;
      callWingman(dt); fitModule(dt); updateConvoy(dt);
      if (!active) return;
      if (wave===2) updateRecovery(dt);
      if (wave===3 && !loadout) {
        for (const { id, prop } of racks) {
          const p=prop.root.position;
          if (Math.hypot(player.pos.x-p.x,player.pos.z-p.z)>12 || Math.abs(player.pos.y-p.y)>12) continue;
          loadout=id; clearProps(); fitModule(0); save(); combat().audio.ui('confirm');
          zhud.say('零號',id==='shield'?'護盾電容接上了。下次展盾會更快。':'擴充彈匣就位，六十發滿裝。',3,true); break;
        }
      }
      if (wave===4) updateAmbush();
    },
    draw(hud) {
      if (won || defeated) return;
      const c=combat();
      if (active && c.enemies.some(e=>!e.dead && !e.gone)) {
        if (c.boss?.charge>0 && c.boss.harborAir?.phase==='beam') {
          hud.text(input.touch.on?'展開防護罩！':'F 展盾反射！',hud.w/2,hud.h*.6,19,'am',1,'center',700);
        } else if (c.pursuit.ready) {
          hud.text('追擊彈就緒　步槍命中即發',hud.w/2,hud.h*.6,13,'cy',.95,'center',700);
        }
      }
      if (!route) return;
      let hint='';
      const height=Math.round(player.pos.y-terrain(player.pos.x,player.pos.z));
      if (checkpoint===1 && route==='sky' && !active && height<25) {
        hint=(input.touch.on?'點「飛行」再按「上升」':'T 切換飛行・空白鍵爬升')+'　'+height+' / 25 m';
      } else if (active && recorder) {
        const p=recorder.root.position;
        mark(hud,p.x,p.y+2,p.z,'飛行記錄器','am');
        hint=recorder.canopy.visible?'靠近橘色傘包回收　高度 '+Math.round(p.y-terrain(p.x,p.z))+' m':'記錄器已落地　接近橘色箱體回收';
      } else if (active && wave===2 && route==='pier' && corner<2) {
        const lead=road.pose(0,22).pos, [x,z]=road.pos;
        mark(hud,lead[0],terrain(...lead)+3,lead[1],'領車位置');
        hint='帶車隊過彎　'+Math.round(Math.hypot(player.pos.x-x,player.pos.z-z))+' m 至頭車';
        if (height>38) hint+='　降低高度';
      } else if (active && racks.length) {
        for (const { id,prop } of racks) {
          const p=prop.root.position; mark(hud,p.x,p.y+6,p.z,modules[id].name,id==='shield'?'cy':'am');
        }
        hint='落地靠近一座補給架　橘：步槍 60 發　藍：護盾回充加快';
      } else if (active && wave===4 && command && !command.dead) {
        const p=command.pos;
        if (recovered || command.ap<command.apMax || player.pos.distanceToSquared(p)<85*85) {
          mark(hud,p.x,p.y+20,p.z,'假呼號來源','am');
        } else {
          hint='找出兩架護衛之間的重型機　接近或命中即可辨識';
        }
      }
      if (hint) hud.text(hint,hud.w/2,hud.h*.69,15,'cy',1,'center',700);
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
      const replay=new URLSearchParams(location.search);
      replay.delete('demo'); replay.set('replay',route==='sky'?'pier':'sky');
      show('兩輛車，都出港了。', route==='pier'
        ? '二號車的孩子在車窗上畫了個轉彎的箭頭。你帶回來的僚機斑鳩跟在車後，也朝他比了一次。'
        : '二號車的孩子趴在車窗上，拿手指追著你飛過的方向。原來你把攔截機帶走的時候，他全看見了。', [
        [route==='sky'?'改走碼頭・從分岔出擊':'改走空路・從分岔出擊','../demo/?'+replay],['進入機甲本篇','../'+suffix],['步兵前傳','../zero/'+suffix],['失落防線','../lastline/'+suffix],
      ]);
    },
  };
}
