import {atlasURL} from './food-sprites.js?v=7';
import {createNarrator} from './voice.js?v=7';
import {createRecipe,ready,advance,pick,chop,crack,stir,pour,push,plate,feed,stepRecipe} from './recipe-state.js?v=8';
import {drawScene,layout,plateDish} from './recipe-art.js?v=8';
const root=document.getElementById('recipe');
root.innerHTML=`<header class="recipe-header"><div class="recipe-brand"><span>✿</span><div>小小料理家<small>MY LITTLE KITCHEN</small></div></div><div><button id="recipeVoice" aria-label="開關聲音" aria-pressed="true">🔊</button><button id="recipeParents" aria-label="大人說明">⚙</button></div></header><div class="recipe-steps" aria-label="拿食材、切菜、敲蛋、煮菜、盛盤、餵朋友">${['🍅','🔪','🥚','🍳','🍽️','🐻'].map((icon,i)=>`<span class="recipe-step" data-step="${i}" aria-hidden="true">${icon}</span>`).join('')}</div><section class="recipe-stage"><canvas id="recipeCanvas" tabindex="0" role="application" aria-label="料理操作區" aria-describedby="recipeStatus"></canvas><button class="recipe-reset" id="recipeReset" aria-label="重新做這道料理" hidden>↻</button><div class="recipe-start" id="recipeWelcome"><div class="recipe-start-card"><canvas id="recipePreview" width="700" height="320" aria-label="番茄炒蛋"></canvas><h1>今天我來煮！</h1><button id="recipeStart" aria-label="開始做番茄炒蛋">▶</button><p>番茄炒蛋 · TOMATO & EGGS</p></div></div></section><footer class="recipe-footer"><button id="recipeHint" aria-label="看小手示範">👆</button><div id="recipeCue" class="recipe-cue" aria-hidden="true"></div><button id="recipeNext" aria-label="下一個料理步驟" hidden>➜</button></footer><p id="recipeStatus" class="recipe-status" aria-live="polite"></p><dialog class="recipe-guide" id="recipeGuide"><button id="recipeClose" aria-label="關閉說明">×</button><h2>親手做第一道料理</h2><p>把番茄和雞蛋拖到下方砧板；也可以點一下食材拿取。滑過番茄切開，切在哪裡，大小就不同。準備好時點綠色箭頭。</p><p>把雞蛋拖到碗沿或點蛋敲開，在碗裡畫圈攪拌。把砧板和蛋液碗拖到鍋裡；也可以點它們倒入。</p><p>點爐火旋鈕開火，用手指帶著鍋鏟翻炒，蛋液會慢慢凝固。把鍋拖向盤子盛菜，再把食物拖到朋友嘴邊餵一口。朋友會張嘴、咀嚼，吃完後可再做一次。</p><p>沒有倒數、分數或失敗。停下來時，小手會示範目前的動作。鍵盤可用 Enter／空白鍵操作目前食材或工具，用右方向鍵繼續。聲音設定沿用原廚房，進度只保留到重新整理。</p><a class="free-link" id="recipeFree" href="?mode=free">打開原本的自由廚房 · 24 種食材</a></dialog>`;
const $=id=>document.getElementById(id),canvas=$('recipeCanvas'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('recipeFree').before($('recipeReset'));$('recipeReset').textContent='↻ 重新做這道料理';
let s=createRecipe(),started=false,gesture=null,w=720,h=900,time=0,last=null,idle=0,hintUntil=0,audio=null,sizzle=null,lastTone=0,lastStage='',lastReady=null,announceTimer=null;
let prefs={sound:true,customer:0,served:0};try{const stored=JSON.parse(localStorage.getItem('little-bloom-v3'));if(typeof stored?.sound==='boolean')prefs.sound=stored.sound;if(Number.isInteger(stored?.customer))prefs.customer=stored.customer;if(Number.isInteger(stored?.served))prefs.served=stored.served;}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')prefs.sound=false;
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify({version:3,scene:'kitchen',ingredients:[],method:null,...prefs}));}catch{}}
function context(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
function allowed(){return started&&prefs.sound&&!document.hidden&&!$('recipeGuide').open;}
const narrator=createNarrator({allowed,getAudioContext:context});
function sound(kind){
  if(!allowed()||performance.now()-lastTone<75)return;lastTone=performance.now();
  try{const a=context();a.resume();const o=a.createOscillator(),g=a.createGain();o.type=kind==='cut'?'triangle':'sine';o.frequency.setValueAtTime({cut:190,crack:340,pour:290,stir:140,bite:500,ready:660}[kind]||300,a.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='ready'?880:70,a.currentTime+.12);g.gain.setValueAtTime(kind==='ready'?.07:.035,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.17);o.connect(g);g.connect(a.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(a.currentTime+.18);}catch{}
}
function updateSizzle(){
  const on=allowed()&&s.stage==='cook'&&s.heat;if(on===!!sizzle)return;
  if(sizzle){sizzle.stop();sizzle=null;}
  if(on)try{const a=context();a.resume();const source=a.createBufferSource(),filter=a.createBiquadFilter(),g=a.createGain(),buffer=a.createBuffer(1,a.sampleRate,a.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.22;source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=2200;g.gain.value=.045;source.connect(filter);filter.connect(g);g.connect(a.destination);source.onended=()=>{source.disconnect();filter.disconnect();g.disconnect();};source.start();sizzle=source;}catch{}
}
const labels={choose:'把番茄和雞蛋拿到砧板上',chop:'用手指滑過番茄切開',crack:'把雞蛋敲在碗沿，流出蛋液',whisk:'在碗裡畫圈攪拌蛋液',pour:'把番茄和蛋液倒進鍋裡',cook:'開火，用鍋鏟炒到蛋液凝固',plate:'把鍋裡的料理盛進盤子',feed:'把料理拖到朋友嘴邊餵一口',done:'朋友吃飽了！可以再做一次'};
const cues={choose:'🍅<b>＋</b>🥚',chop:'🔪<b>→</b>🍅',crack:'🥚<b>↓</b>🥣',whisk:'🥄<b>↻</b>🥣',pour:'🥣<b>↓</b>🍳',cook:'🔥<b>＋</b>🥄',plate:'🍳<b>→</b>🍽️',feed:'🍽️<b>→</b>🐻',done:'🐻<b>♥</b>🍽️'};
const clips={choose:['word-tomato','Tomato.'],chop:['step-chop','Chop.'],crack:['word-egg','Egg.'],whisk:['step-mix','Mix.'],pour:['step-heat','Cook.'],cook:['step-heat','Cook.'],plate:['step-plate','Put it on the plate.'],feed:['ready','Ready.'],done:['thanks','Thank you.']};
function sync(){
  const changed=s.stage!==lastStage,isReady=ready(s);
  if(changed){lastStage=s.stage;idle=0;hintUntil=time+2.5;$('recipeCue').innerHTML=cues[s.stage];const group={choose:0,chop:1,crack:2,whisk:2,pour:3,cook:3,plate:4,feed:5,done:5}[s.stage];root.querySelectorAll('.recipe-step').forEach((el,i)=>el.className=`recipe-step ${i===group?'active':i<group?'complete':''}`);if(started)narrator.speak(...clips[s.stage]);}
  $('recipeNext').hidden=!isReady||['crack','pour','plate','feed'].includes(s.stage);$('recipeNext').textContent=s.stage==='done'?'↻':'➜';$('recipeNext').setAttribute('aria-label',s.stage==='done'?'再做一次番茄炒蛋':'繼續下一個料理步驟');
  $('recipeReset').hidden=!started;$('recipeVoice').textContent=prefs.sound?'🔊':'🔇';$('recipeVoice').setAttribute('aria-pressed',String(prefs.sound));
  if(changed||isReady!==lastReady){$('recipeStatus').textContent=labels[s.stage]+(isReady&&!$('recipeNext').hidden&&s.stage!=='done'?'。準備好了，按綠色箭頭繼續。':'');if(isReady&&!lastReady&&!changed)sound('ready');}lastReady=isReady;
  canvas.dataset.stage=s.stage;canvas.dataset.mix=s.mix.toFixed(2);canvas.dataset.cooked=s.cooked.toFixed(2);canvas.dataset.pieces=String(s.pieces.length);canvas.dataset.bites=String(s.bites);updateSizzle();
}
function next(){if(s.stage==='done'){reset();return;}if(advance(s)){gesture=null;sync();}}
function reset(){s=createRecipe();gesture=null;lastStage='';lastReady=null;idle=0;sync();}
function resize(){const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return;w=bounds.width/bounds.height>1.35?1000:720;h=bounds.height/bounds.width*w;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(bounds.width*dpr);canvas.height=Math.round(bounds.height*dpr);ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);gesture=null;}
const atlas=new Image();atlas.src=atlasURL;atlas.onload=()=>preview();
function preview(){const c=$('recipePreview').getContext('2d');c.clearRect(0,0,700,320);plateDish(c,350,155,230,null,atlas);}
function point(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*w,y:(e.clientY-b.top)/b.height*h};}
function inEllipse(p,q,rx,ry=rx){return ((p.x-q.x)/rx)**2+((p.y-q.y)/ry)**2<=1;}
function boardPoint(p,l){return {x:(p.x-l.board.x)/l.cutScale,y:(p.y-l.board.y)/l.cutScale};}
function panPoint(p,l){return {x:(p.x-l.pan.x)/(l.pan.r/210),y:(p.y-l.pan.y)/(l.pan.r/210)};}
function activity(){idle=0;hintUntil=0;}
canvas.addEventListener('pointerdown',e=>{
  if(!started||$('recipeGuide').open||!e.isPrimary||e.button!==0||gesture)return;
  activity();const p=point(e),l=layout(w,h);let kind=null;
  if(s.stage==='choose')kind=['tomato','egg'].find(id=>!s.picked[id]&&inEllipse(p,l.selectFoods[id],w*.23,h*.20));
  if(s.stage==='chop'&&inEllipse(p,l.board,l.board.rx,l.board.ry))kind='knife';
  if(s.stage==='crack'&&!s.cracked&&inEllipse(p,l.egg,l.egg.size*.65,l.egg.size*.7))kind='shell';
  if(s.stage==='whisk'&&inEllipse(p,{...l.bowl,y:h*.5},l.bowl.r*1.15,l.bowl.r*.85))kind='whisk';
  if(s.stage==='pour'&&!s.transfer){if(!s.poured.tomato&&inEllipse(p,l.tomatoSource,l.tomatoSource.r*1.3))kind='tomato';else if(!s.poured.egg&&inEllipse(p,l.eggSource,l.eggSource.r*1.3))kind='egg';}
  if(s.stage==='cook'){if(inEllipse(p,l.dial,l.dial.r*1.8))kind='heat';else if(inEllipse(p,l.pan,l.pan.r*1.1,l.pan.r*.85))kind='spatula';}
  if(s.stage==='plate'&&!s.plated&&inEllipse(p,{x:w*.5,y:h*.25},Math.min(w*.28,h*.21)*1.6,Math.min(w*.28,h*.21)))kind='pan';
  if(s.stage==='feed'&&!s.chew&&s.bites<3&&inEllipse(p,l.meal,l.meal.r*1.2,l.meal.r*.85))kind='bite';
  if(!kind)return;gesture={id:e.pointerId,kind,start:p,point:p,previous:p,distance:0};canvas.setPointerCapture(e.pointerId);e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;const p=point(e),g=gesture,l=layout(w,h),distance=Math.hypot(p.x-g.previous.x,p.y-g.previous.y);g.distance+=distance;g.point=p;activity();
  if(g.kind==='whisk'&&inEllipse(p,{...l.bowl,y:h*.5},l.bowl.r*1.1,l.bowl.r*.8)){stir(s,Math.min(distance,70)*210/l.bowl.r);sound('stir');}
  if(g.kind==='spatula'&&inEllipse(p,l.pan,l.pan.r,l.pan.r*.75)){push(s,panPoint(g.previous,l),panPoint(p,l));sound('stir');}
  g.previous=p;sync();e.preventDefault();
});
function finish(e,cancel=false){
  if(!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=point(e),l=layout(w,h),tap=g.distance<24;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(cancel)return;
  if(s.stage==='choose'&&(tap||inEllipse(p,l.basket,l.basket.rx*1.2,l.basket.ry*1.5))){if(pick(s,g.kind))sound('pour');if(ready(s)){clearTimeout(announceTimer);announceTimer=setTimeout(()=>{if(s.stage==='choose')next();},650);}}
  if(g.kind==='knife'){const a=boardPoint(g.start,l),b=boardPoint(p,l);if(tap){a.y-=150;b.y+=150;}if(chop(s,a,b)){sound('cut');canvas.animate([{filter:'brightness(1.03)'},{filter:'brightness(1)'}],{duration:160});}}
  if(g.kind==='shell'&&(tap||inEllipse(p,l.bowl,l.bowl.r*1.2,l.bowl.r*.9))&&crack(s)){sound('crack');s.crackAge=0;}
  if(g.kind==='whisk'&&tap){stir(s,180);sound('stir');}
  if(s.stage==='pour'&&(tap||inEllipse(p,l.pan,l.pan.r*1.35,l.pan.r))&&pour(s,g.kind))sound('pour');
  if(g.kind==='heat'){s.heat=!s.heat;sound('ready');}
  if(g.kind==='pan'&&(tap||inEllipse(p,l.plate,l.plate.r*1.3,l.plate.r))&&plate(s))sound('pour');
  const mouth={x:l.friend.x,y:l.friend.y+l.friend.r*.43};
  if(g.kind==='bite'&&(tap||inEllipse(p,mouth,l.friend.r*.85,l.friend.r*.65))&&feed(s))sound('bite');
  sync();
}
canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId)gesture=null;});
function accessibleAction(){
  activity();const l=layout(w,h);
  if(s.stage==='choose'){pick(s,s.picked.tomato?'egg':'tomato');if(ready(s))next();}
  else if(s.stage==='chop'){const p=s.pieces[0];if(chop(s,{x:p.x,y:p.y-180},{x:p.x,y:p.y+180}))sound('cut');}
  else if(s.stage==='crack'&&crack(s)){s.crackAge=0;sound('crack');}
  else if(s.stage==='whisk'){stir(s,240);sound('stir');}
  else if(s.stage==='pour')pour(s,s.poured.tomato?'egg':'tomato');
  else if(s.stage==='cook'){s.heat=true;push(s,{x:-50,y:0},{x:65,y:20});}
  else if(s.stage==='plate')plate(s);
  else if(s.stage==='feed')feed(s);
  else if(s.stage==='done')reset();sync();
}
canvas.addEventListener('keydown',e=>{if(!started||$('recipeGuide').open||e.repeat)return;if(['Enter',' '].includes(e.key)){e.preventDefault();accessibleAction();}if(e.key==='ArrowRight'){e.preventDefault();next();}});
$('recipeNext').onclick=()=>{activity();next();};
$('recipeHint').onclick=()=>{idle=0;hintUntil=time+6;narrator.speak(...clips[s.stage]);};
$('recipeStart').onclick=()=>{started=true;$('recipeWelcome').hidden=true;idle=0;hintUntil=time+5;narrator.speak(...clips[s.stage]);sync();canvas.focus({preventScroll:true});};
$('recipeReset').onclick=()=>{clearTimeout(announceTimer);reset();$('recipeGuide').close();};
$('recipeVoice').onclick=()=>{prefs.sound=!prefs.sound;narrator.stop();save();sync();};
$('recipeParents').onclick=()=>{gesture=null;narrator.stop();$('recipeGuide').showModal();updateSizzle();};
$('recipeClose').onclick=()=>$('recipeGuide').close();$('recipeGuide').addEventListener('close',()=>{last=null;idle=0;updateSizzle();});
const freeURL=new URL(location.href);freeURL.searchParams.set('mode','free');$('recipeFree').href=freeURL.href;
document.addEventListener('visibilitychange',()=>{gesture=null;last=null;if(document.hidden){clearTimeout(announceTimer);narrator.stop();}updateSizzle();});
window.addEventListener('blur',()=>{gesture=null;});
window.addEventListener('pagehide',()=>{clearTimeout(announceTimer);narrator.stop();if(sizzle){sizzle.stop();sizzle=null;}});
new ResizeObserver(resize).observe(canvas);resize();preview();sync();
function frame(now){
  const dt=last===null?0:Math.min(.05,(now-last)/1000);last=now;
  if(started&&!document.hidden&&!$('recipeGuide').open){time+=dt;idle+=dt;stepRecipe(s,dt);
    if(s.stage==='crack'&&s.cracked){s.crackAge=(s.crackAge||0)+dt;if(s.crackAge>1.1)next();}
    if(['pour','plate','feed'].includes(s.stage)&&ready(s)){if(s.stage==='feed'){prefs.served++;prefs.customer=(prefs.customer+1)%4;save();}next();}
    sync();
  }
  drawScene(ctx,w,h,s,atlas,{time:reduced?0:time,gesture,hint:started&&!gesture&&!ready(s)&&(time<hintUntil||idle>4),customer:s.stage==='done'?(prefs.customer+3)%4:prefs.customer});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
