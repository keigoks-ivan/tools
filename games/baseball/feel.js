'use strict';
/* =========================================================
   手感回饋與臨場感（game.js 之後載入；只用 game.js 的全域，不改判定）
   - 打擊：時機「早了／晚了／剛好」、甜蜜點慢動作＋閃光＋震動＋清脆聲、擦棒聲、揮空聲
   - 投球：力道條（第一下開始、第二下停在綠區），只調整玩家投出的球速與控球
   - 擦邊好球／差一點的壞球提示
   - 觀眾：好球、安打、全壘打、三振的歡呼或嘆氣（主隊更熱烈）
   - 全壘打慢動作重播、煙火、再見彩帶
   - 播報：speechSynthesis 念關鍵句（預設關，右上角開關）
   對外：window.FEEL
   ========================================================= */
window.FEEL=(()=>{
  const pops=[];                    // 畫在 overlay 的浮動字
  let slowT=0, shakeT=0, shakeAmp=0;
  const camSave=new THREE.Vector3();
  const rawPlay=SFX.play.bind(SFX);

  /* ---------- 小工具 ---------- */
  function pop(text,color,x,y,z,ms=900,size=26,oy=0){ pops.push({text,color,x,y,z,t0:performance.now(),ms,size,oy}); }
  const homeFielding=()=>GM&&fielding(GM)===GM.home, homeBatting=()=>GM&&batting(GM)===GM.home;

  /* ---------- 播報（Web Speech） ---------- */
  let voiceOn=false; try{ voiceOn=localStorage.getItem('baseball-voice')==='on'; }catch(e){}
  let zhVoice=null;
  function pickVoice(){ const vs=speechSynthesis.getVoices(); zhVoice=vs.find(v=>/zh[-_]TW/i.test(v.lang))||vs.find(v=>/zh/i.test(v.lang))||null; }
  if('speechSynthesis' in window){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
  function speak(t){
    if(!voiceOn||!('speechSynthesis' in window)||!zhVoice) return;
    speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(t); u.voice=zhVoice; u.lang=zhVoice.lang; u.rate=1.08; u.pitch=1.05; speechSynthesis.speak(u);
  }
  (function voiceButton(){
    const host=document.querySelector('.sound-controls'); if(!host) return;
    const b=document.createElement('button'); b.type='button'; b.className='fx-voice';
    const paint=()=>{ b.textContent=voiceOn?'播報開':'播報關'; b.setAttribute('aria-pressed',String(voiceOn)); b.title='用電腦語音念出全壘打、三振、再見安打'; };
    b.onclick=()=>{ voiceOn=!voiceOn; try{ localStorage.setItem('baseball-voice',voiceOn?'on':'off'); }catch(e){} paint(); if(voiceOn) speak('播報開啟'); };
    paint(); host.appendChild(b);
    const st=document.createElement('style'); st.textContent=`.fx-voice{font:inherit;font-weight:900;font-size:12px;color:#fff;background:#0b2a56cc;border:1.5px solid #ffffff99;border-radius:999px;padding:3px 10px;margin-left:6px;cursor:pointer}.fx-voice[aria-pressed="true"]{background:#e8401c}
.fx-replay{position:fixed;left:50%;top:9%;transform:translateX(-50%);z-index:52;pointer-events:none;font-weight:900;font-style:italic;letter-spacing:4px;color:#fff;background:#d42020;border:3px solid #fff;border-radius:8px;padding:2px 16px;box-shadow:0 4px 12px #0007;display:none}
.fx-replay.show{display:block;animation:fxBlink 1s steps(2) infinite}
@keyframes fxBlink{50%{opacity:.55}}
body.fx-replaying .panels,body.fx-replaying .contact-readout,body.fx-replaying .pmenu,body.fx-replaying #heatPanel{opacity:0;transition:opacity .2s}
.fx-letter{position:fixed;left:0;right:0;height:0;background:#000;z-index:51;pointer-events:none;transition:height .25s}.fx-letter.top{top:0}.fx-letter.bot{bottom:0}.fx-letter.on{height:9vh}`;
    document.head.appendChild(st);
  })();
  const replayTag=document.createElement('div'); replayTag.className='fx-replay'; replayTag.textContent='重播'; document.body.appendChild(replayTag);
  const barT=document.createElement('div'), barB=document.createElement('div'); barT.className='fx-letter top'; barB.className='fx-letter bot'; document.body.append(barT,barB);

  /* ---------- 投球力道條 ---------- */
  const meter={active:false,t:0,pos:0,result:null};
  const SWEET=0.87;
  function meterPress(){
    if(meter.forced){ meter.forced=false; return true; }
    if(!meter.active){ meter.active=true; meter.t=0; meter.pos=0; meter.result=null; rawPlay('tip'); return false; }
    const d=Math.abs(meter.pos-SWEET);
    let r;
    if(d<=0.035) r={label:'完美！',color:'#ffe25a',mph:2.5,control:18,mistake:false};
    else if(d<=0.09) r={label:'漂亮',color:'#8cff6a',mph:1.2,control:8,mistake:false};
    else if(d<=0.2) r={label:'普通',color:'#ffffff',mph:0,control:0,mistake:false};
    else r={label:'失準',color:'#ff6a5a',mph:-1.5,control:-22,mistake:Math.random()<0.35};
    if(r.mistake) r.label='失投！';
    meter.active=false; meter.result=r;
    pop(r.label,r.color,G.cur.x,G.cur.y+0.9,0,900,30);
    return true;
  }
  const meterResult=()=>meter.result||{mph:0,control:0,mistake:false};
  function meterUpdate(dt){
    if(!meter.active) return;
    if(G.mode!=='pitch'||G.state!=='aim'){ meter.active=false; return; }
    const period=1.5*(diff===DIFF.easy?1.35:diff===DIFF.hard?0.8:1);
    meter.t+=dt; const u=(meter.t%period)/period; meter.pos=u<0.5?u*2:2-u*2;
    if(meter.t>period*3){ meter.pos=0.3; meterPress(); meter.forced=true; throwPitch(); }   // 一直不按就用弱的力道自動出手
  }
  function drawMeter(g){
    if(!(G.mode==='pitch'&&G.state==='aim')) return;
    const compact=innerWidth<=940||innerHeight<=780, portrait=innerWidth<=560;
    const panels=document.querySelector('.panels'), boxes=panels.querySelectorAll('.pl');
    const gap=compact&&!portrait?boxes[1].getBoundingClientRect().left-boxes[0].getBoundingClientRect().right-24:innerWidth-32;
    const W=Math.min(340,innerWidth*0.6,gap), H=16, x=(innerWidth-W)/2, y=portrait?panels.getBoundingClientRect().top-44:innerHeight-112;
    g.save();
    g.fillStyle='rgba(10,26,50,.78)'; roundRect(g,x-10,y-28,W+20,H+40,10); g.fill();
    g.fillStyle='#fff'; g.font='900 13px "Noto Sans TC",sans-serif'; g.textAlign='center';
    g.font=`900 ${compact?11:13}px "Noto Sans TC",sans-serif`;
    const label=compact?(meter.active?'再按投球：綠區出手':'按投球：開始蓄力'):(meter.active?'再按一次：停在綠色區出手':'空白鍵／點一下：開始蓄力');
    g.fillText(label,innerWidth/2,y-10,W+8);
    const grd=g.createLinearGradient(x,0,x+W,0); grd.addColorStop(0,'#3a6fd0'); grd.addColorStop(0.75,'#ffd23a'); grd.addColorStop(1,'#ff5a3a');
    g.fillStyle='#14202e'; roundRect(g,x,y,W,H,8); g.fill();
    g.fillStyle=grd; roundRect(g,x+2,y+2,(W-4)*(meter.active?meter.pos:0),H-4,6); g.fill();
    g.fillStyle='rgba(120,255,110,.85)'; g.fillRect(x+W*(SWEET-0.09),y,W*0.18,H);
    g.fillStyle='rgba(255,255,255,.95)'; g.fillRect(x+W*(SWEET-0.035),y,W*0.07,H);
    if(meter.active){ const px=x+W*meter.pos; g.fillStyle='#fff'; g.beginPath(); g.moveTo(px,y-4); g.lineTo(px-7,y-13); g.lineTo(px+7,y-13); g.closePath(); g.fill(); g.fillRect(px-1.5,y-2,3,H+4); }
    g.restore();
  }
  function roundRect(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

  /* ---------- 打擊回饋 ---------- */
  function onSwing(bb,dt,mode,ball){
    const win=diff.win, t=dt/win;
    if(!bb){
      rawPlay('whiff');
      if(dt<-win) pop('太早了','#9be7ff',ball.x,ball.y+0.7,0);
      else if(dt>win) pop('太晚了','#ffb27a',ball.x,ball.y+0.7,0);
      else pop('沒碰到','#ffffff',ball.x,ball.y+0.7,0);
      return;
    }
    const label=t<-0.45?['早了','#9be7ff']:t>0.45?['晚了','#ffb27a']:['剛好！','#ffe25a'];
    pop(label[0],label[1],ball.x,ball.y+0.75,0);
    if(Math.abs(bb.spray)>60) rawPlay('tip');
    if(bb.q>0.82&&bb.dn<0.42){                     // 甜蜜點
      slowT=0.42; shakeT=0.28; shakeAmp=mode==='power'?0.5:0.35;
      FX.flash(); rawPlay('sweet'); pop('甜蜜點','#ffffff',ball.x,ball.y+0.75,0,1000,32,-44);
      FX.burst&&FX.burst(new THREE.Vector3(ball.x,ball.y,0),26,0xfff3c0,14,0.45);
    }
  }
  // 擦邊好球／差一點的壞球
  function edgeCall(br,end){
    const ox=Math.abs(end.x)-(PLATE_HALF+BALL_R), oyTop=end.y-(br.szTop+BALL_R), oyBot=(br.szBot-BALL_R)-end.y;
    const out=Math.max(ox,oyTop,oyBot);
    if(out<=0 && out>-0.12){ pop('擦邊好球','#ffe25a',end.x,end.y+0.7,0); if(homeFielding()) rawPlay('crowdOoh'); }
    else if(out>0 && out<0.15){ pop('差一點','#9be7ff',end.x,end.y+0.7,0); rawPlay('crowdOoh'); }
  }

  /* ---------- 觀眾、播報、慶祝：從音效呼叫判斷發生了什麼 ---------- */
  function lastPbp(){ return GM&&GM.pbp.length?GM.pbp[GM.pbp.length-1]:null; }
  let seen=0, seenGM=null;
  function onSound(name,p){
    if(!GM) return;
    if(GM!==seenGM){ seenGM=GM; seen=0; walkoffDone=null; }
    if(['hitResult','out','select','homerun'].includes(name)){ if(GM.pbp.length<=seen) return; seen=GM.pbp.length; }
    if(name==='strike'){ if(homeFielding()) rawPlay('clap'); }
    if(name==='hitResult'){
      const home=lastPbp()?.half==='bottom';
      rawPlay(home?'crowdCheer':'crowdGroan',home?0.6:0.5);
      walkoff();
    }
    if(name==='out'){
      const e=lastPbp(); if(!e) return;
      const homeP=e.half==='top';                  // 上半局是主隊防守
      if(e.kind==='K'){ speak('三振！'); rawPlay(homeP?'crowdCheer':'crowdGroan',homeP?0.45:0.35); }
      else if(homeP) rawPlay('clap');
    }
    if(name==='select'){ const e=lastPbp(); if(e&&e.kind==='BB'&&e.half==='bottom') rawPlay('clap'); walkoff(); }
    if(name==='homerun'){
      const e=lastPbp(), home=e?.half==='bottom';
      if(!home) rawPlay('crowdGroan',0.8);
      speak(GM.over&&home?'再見全壘打！比賽結束！':'全壘打！');
      for(let i=0;i<5;i++) setTimeout(()=>FX.firework(rnd(-120,120),rnd(110,170),rnd(-470,-380)),300+i*260);
      startReplay();
      if(GM.over&&home) setTimeout(()=>FX.confetti(0,6,0,200,18),400);
    }
  }
  let walkoffDone=null;
  function walkoff(){
    const e=lastPbp(); if(!GM.over||!e||e.half!=='bottom'||e.runs<=0||walkoffDone===e) return;
    walkoffDone=e; speak('再見安打！比賽結束！'); rawPlay('crowdCheer',1);
    FX.banner('再見！','#e8401c'); FX.confetti(0,6,0,220,20);
    for(let i=0;i<4;i++) setTimeout(()=>FX.firework(rnd(-90,90),rnd(100,150),rnd(-450,-380)),200+i*300);
    jump=1.6;
  }
  let jump=0;
  // 包住音效，不必改到 finishPA 等其他人的函式
  SFX.play=(name,p)=>{ rawPlay(name,p); try{ onSound(name,p); }catch(e){ console.warn(e); } };

  /* ---------- 全壘打重播 ---------- */
  const R={on:false,t:0,sim:null,cy:2.5,side:-1,skip:null};
  function startReplay(){
    const P=G.play; if(!P||!P.sim||!C.batter) return;          // 跳過打席時沒有軌跡，就不重播
    R.on=true; R.t=0; R.sim=P.sim; R.side=BSIDE; R.cy=G.pitch?pitchPos(G.pitch,1,G.rel).y:2.5;
    C.batter.root.visible=true; if(C.runner) C.runner.root.visible=false;
    replayTag.classList.add('show'); barT.classList.add('on'); barB.classList.add('on'); document.body.classList.add('fx-replaying');
    R.skip=()=>endReplay(); setTimeout(()=>{ if(R.on){ addEventListener('keydown',R.skip,{once:true}); canvas.addEventListener('pointerdown',R.skip,{once:true}); } },120);
  }
  function endReplay(){
    if(!R.on) return; R.on=false;
    replayTag.classList.remove('show'); barT.classList.remove('on'); barB.classList.remove('on'); document.body.classList.remove('fx-replaying');
    if(C.catcher) C.catcher.root.visible=true; C.ump.root.visible=true;
    removeEventListener('keydown',R.skip); canvas.removeEventListener('pointerdown',R.skip);
    if(C.batter) C.batter.root.visible=false; if(C.runner) C.runner.root.visible=true;
  }
  const _v=new THREE.Vector3();
  function replayUpdate(dt){
    if(!R.on) return;
    if(G.state!=='done'){ endReplay(); return; }           // 下一個打席已經開始
    R.t+=dt;
    const pts=R.sim.pts, A=1.25;                             // 前 1.25 秒：擊球瞬間超慢動作；之後跟著球飛
    const st=R.t<A?0.06+R.t*0.11:0.06+A*0.11+(R.t-A)*0.9;
    poseBatter(Math.min(st,0.55),R.cy); if(C.catcher) C.catcher.root.visible=false; C.ump.root.visible=false;
    const s=Math.max(0,st-0.13), k=Math.min(pts.length-1,Math.floor(s*120)), b=pts[k];
    ball.visible=true; ball.position.set(b.x,Math.max(b.y,0.2),b.z);
    if(R.t<A){
      camera.fov=30; camera.updateProjectionMatrix();
      const bx=R.side*3.4; camera.position.set(bx-R.side*12.5,3.8,-5.5); camera.lookAt(bx-R.side*0.4,3.1,0.6);
    } else {
      camera.fov=lerp(camera.fov,38,0.06); camera.updateProjectionMatrix();
      _v.set(b.x*0.35,8+b.y*0.55,26+b.z*0.25); camera.position.lerp(_v,0.08); camera.lookAt(b.x,b.y*0.8,b.z);
    }
    if(R.t>2.35) endReplay();
  }

  /* ---------- 每格 ---------- */
  function timeScale(){ return slowT>0?(slowT>0.15?0.22:0.22+(0.15-slowT)/0.15*0.78):1; }
  function update(dt){
    const real=dt/timeScale();
    if(slowT>0) slowT=Math.max(0,slowT-real);
    if(shakeT>0) shakeT=Math.max(0,shakeT-real);
    meterUpdate(dt); replayUpdate(dt);
    if(jump>0 && C.runner){ jump=Math.max(0,jump-dt); C.runner.root.position.y=Math.abs(Math.sin(jump*9))*1.1*(jump/1.6); }
  }
  function preRender(){
    if(R.on){ if(C.catcher) C.catcher.root.visible=false; C.ump.root.visible=false; }
    camSave.copy(camera.position);
    if(shakeT>0){ const a=shakeAmp*(shakeT/0.28); camera.position.x+=(Math.random()-.5)*a; camera.position.y+=(Math.random()-.5)*a; }
  }
  function postRender(){ camera.position.copy(camSave); }
  function drawOverlay(g,project){
    drawMeter(g);
    const now=performance.now();
    for(let i=pops.length-1;i>=0;i--){
      const p=pops[i], u=(now-p.t0)/p.ms; if(u>=1){ pops.splice(i,1); continue; }
      let [x,y]=project(p.x,p.y+u*0.35,p.z); y=Math.min(y,innerHeight*0.6-u*30)+p.oy;   // 不要掉到下方面板後面
      const a=u<0.75?1:1-(u-0.75)/0.25, sc=u<0.12?0.6+u/0.12*0.4:1;
      g.save(); g.globalAlpha=a; g.translate(x,y); g.scale(sc,sc);
      g.font=`italic 900 ${p.size}px "Noto Sans TC",sans-serif`; g.textAlign='center'; g.textBaseline='middle';
      g.lineWidth=6; g.strokeStyle='rgba(20,32,46,.9)'; g.strokeText(p.text,0,0); g.fillStyle=p.color; g.fillText(p.text,0,0); g.restore();
    }
  }
  return {timeScale,update,preRender,postRender,drawOverlay,onSwing,edgeCall,meterPress,meterResult,meterActive:()=>meter.active,speak,get replaying(){return R.on;}};
})();
