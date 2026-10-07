import {createNarrator} from './voice.js?v=7';
import {createRecipe,ready,advance,continuationDelay,pick,chop,crack,stir,pour,push,plate,feed,stepRecipe} from './recipe-state.js?v=9';
import {drawScene,layout,loadArtwork,artURL} from './recipe-art.js?v=9';
const root=document.getElementById('recipe');
const icon=path=>`<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
const icons={
  chef:icon('<path d="M8 20V12a5 5 0 0 1-1-10 6 6 0 0 1 10 0 5 5 0 0 1 8 8v10z" transform="translate(1 4)"/><path d="M9 27h16M12 24v3M22 24v3"/>'),
  sound:icon('<path d="M5 12h6l7-6v20l-7-6H5zM23 11a8 8 0 0 1 0 10M26 7a13 13 0 0 1 0 18"/>'),
  mute:icon('<path d="M5 12h6l7-6v20l-7-6H5zM24 12l6 8m0-8-6 8"/>'),
  hand:icon('<path d="M12 16V7a3 3 0 0 1 6 0v9-3a3 3 0 0 1 5 0v2a3 3 0 0 1 5 1v5c0 6-5 9-10 9-4 0-6-2-9-5l-5-6a3 3 0 0 1 4-4z"/>'),
  gear:icon('<path d="m12 4 1-2h6l1 3 3 1 3-1 3 5-2 2v4l2 2-3 5-3-1-3 2-1 3h-6l-1-3-3-2-3 1-3-5 2-2v-4L3 9l3-5 3 1z" transform="translate(0 2) scale(.94)"/><circle cx="16" cy="16" r="5"/>'),
  replay:icon('<path d="M7 10A11 11 0 1 1 5 20M3 3v9h9"/>')
};
root.innerHTML=`<header class="recipe-header"><div class="recipe-brand">${icons.chef}<span>小小料理家</span></div><div class="recipe-steps" aria-label="拿食材、切菜、敲蛋、煮菜、盛盤、餵朋友">${Array.from({length:6},(_,i)=>`<i class="recipe-step" data-step="${i}" aria-hidden="true"></i>`).join('')}</div><div class="recipe-tools"><button id="recipeHint" aria-label="看小手示範">${icons.hand}</button><button id="recipeVoice" aria-label="開關聲音" aria-pressed="true">${icons.sound}</button><button id="recipeParents" aria-label="大人說明">${icons.gear}</button></div></header><section class="recipe-stage"><canvas id="recipeCanvas" tabindex="0" role="application" aria-label="料理操作區" aria-describedby="recipeStatus"></canvas><div class="recipe-task" aria-hidden="true"><img id="recipeTaskImage" alt=""><h1 id="recipeCue"></h1></div><button id="recipeNext" class="recipe-again" aria-label="再做一次番茄炒蛋" hidden>${icons.replay}<span>再煮一次</span></button></section><p id="recipeStatus" class="recipe-status" aria-live="polite"></p><dialog class="recipe-guide" id="recipeGuide"><button id="recipeClose" aria-label="關閉說明">×</button><h2>直接碰食材，親手做料理</h2><p>點一下番茄和蛋拿取，也可以拖到發光的砧板上。用手指滑過番茄切開；點番茄也能切一刀。切完停一下，就會自動接到下一步，繼續切則能保留在砧板。</p><p>把蛋拖到碗沿，或點蛋敲開。在蛋液裡畫圈；攪均勻後自然接續。食材一次只出現一份，拖進鍋裡或點它倒入。</p><p>點亮爐火旋鈕，用手指帶著鍋鏟翻炒。蛋液變成炒蛋後，把鍋拖向盤子盛菜，再將料理拖到朋友嘴邊。點按食材、鍋子和盤子也能完成相同動作。</p><p>沒有倒數、分數或失敗。亮起的輪廓提示可碰的東西；停住時小手帶著實際工具示範。孩子不用閱讀、選工具或按下一步。鍵盤用 Enter／空白鍵操作，右方向鍵接續已完成的步驟。</p><p>聲音偏好與招待次數保存在此裝置，這次料理狀態保留到重新整理。切割與食材移動為簡化二維互動。</p><button id="recipeReset" class="recipe-reset">↻ 重新做這道料理</button><a class="free-link" id="recipeFree" href="?mode=free">原本的自由廚房 · 24 種食材</a></dialog>`;
const $=id=>document.getElementById(id),canvas=$('recipeCanvas'),ctx=canvas.getContext('2d'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let s=createRecipe(),started=false,gesture=null,w=720,h=900,time=0,last=null,idle=0,hintUntil=0,audio=null,sizzle=null,lastTone=0,lastStage='',lastReady=null,lastCue='',lastTaskImage='',lastSound=null,completionAge=0,stageAge=0;
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

const labels={choose:'點或拖番茄和蛋到砧板上',chop:'手指滑過番茄切開，停一下自然繼續',crack:'點雞蛋，或拖到發光的碗沿敲開',whisk:'在碗裡畫圈，攪成均勻蛋液',pour:'把亮起的食材拖進鍋裡；也可以點它倒入',cook:'點旋鈕開火，用手指帶著鍋鏟翻炒',plate:'拖鍋子到發光的盤子上；也可以點鍋子盛菜',feed:'把盤裡的料理拖到朋友嘴邊；也可以點料理餵一口',done:'朋友吃飽了！點再煮一次重新開始'};
const titles={choose:'拿食材',chop:'切一切',crack:'敲開蛋',whisk:'攪一攪',pour:'倒進鍋',cook:'炒一炒',plate:'裝到盤子',feed:'餵朋友',done:'吃飽了！'};
const taskImages={choose:'tomato',chop:'knife',crack:'egg',whisk:'whisk',pour:'bowl',cook:'spatula',plate:'plate',feed:'bear',done:'bear'};
const clips={choose:['word-tomato','Tomato.'],chop:['step-chop','Chop.'],crack:['word-egg','Egg.'],whisk:['step-mix','Mix.'],pour:['step-heat','Cook.'],cook:['step-heat','Cook.'],plate:['step-plate','Put it on the plate.'],feed:['ready','Ready.'],done:['thanks','Thank you.']};
const art=loadArtwork();art.ready.then(ok=>{canvas.dataset.art=ok?'ready':'fallback';});
function begin(){if(started)return;started=true;narrator.speak(...clips[s.stage]);}
function sync(){
  const changed=s.stage!==lastStage,isReady=ready(s);
  if(changed){lastStage=s.stage;idle=0;stageAge=0;completionAge=0;hintUntil=time+2.8;const group={choose:0,chop:1,crack:2,whisk:2,pour:3,cook:3,plate:4,feed:5,done:5}[s.stage];root.querySelectorAll('.recipe-step').forEach((el,i)=>el.className=`recipe-step ${i===group?'active':i<group?'complete':''}`);if(started)narrator.speak(...clips[s.stage]);}
  const cue=s.stage==='cook'&&!s.heat?'開火囉':titles[s.stage];
  if(cue!==lastCue){lastCue=cue;$('recipeCue').textContent=cue;}
  const taskImage=s.stage==='pour'?(s.poured.tomato?'bowl':'board'):s.stage==='cook'&&!s.heat?'pan':taskImages[s.stage];if(taskImage!==lastTaskImage){lastTaskImage=taskImage;$('recipeTaskImage').src=artURL(taskImage);}
  $('recipeNext').hidden=s.stage!=='done';if(prefs.sound!==lastSound){lastSound=prefs.sound;$('recipeVoice').innerHTML=prefs.sound?icons.sound:icons.mute;$('recipeVoice').setAttribute('aria-pressed',String(prefs.sound));}
  if(changed||isReady!==lastReady){$('recipeStatus').textContent=labels[s.stage];if(isReady&&!lastReady&&!changed)sound('ready');}lastReady=isReady;
  canvas.dataset.stage=s.stage;canvas.dataset.mix=s.mix.toFixed(2);canvas.dataset.cooked=s.cooked.toFixed(2);canvas.dataset.pieces=String(s.pieces.length);canvas.dataset.bites=String(s.bites);canvas.dataset.heat=String(s.heat);updateSizzle();
}
function next(){if(s.stage==='done'){reset();return;}if(advance(s)){gesture=null;sync();}}
function reset(){s=createRecipe();gesture=null;lastStage='';lastReady=null;idle=0;completionAge=0;sync();}
function resize(){const b=canvas.getBoundingClientRect();if(!b.width||!b.height)return;w=b.width/b.height>1.35?1000:720;h=b.height/b.width*w;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);gesture=null;}
function point(e){const b=canvas.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*w,y:(e.clientY-b.top)/b.height*h};}
function inEllipse(p,q,rx,ry=rx){return ((p.x-q.x)/rx)**2+((p.y-q.y)/ry)**2<=1;}
function boardPoint(p,l){return {x:(p.x-l.board.x)/l.cutScale,y:(p.y-l.board.y)/l.cutScale};}
function panPoint(p,l){return {x:(p.x-l.pan.x)/(l.pan.r/210),y:(p.y-l.pan.y)/(l.pan.r/210)};}
function activity(){idle=0;hintUntil=0;completionAge=0;}
function cutStroke(g,p,l,tap=false,finish=false){
  if(g.cut&&!finish)return;const a=boardPoint(g.start,l),b=boardPoint(p,l);if(tap){a.y-=170;b.y+=170;}
  if(chop(s,a,b)){g.cut=true;s.cutFlash={a:g.start,b:p,age:0};sound('cut');}
}
canvas.addEventListener('pointerdown',e=>{
  if($('recipeGuide').open||!e.isPrimary||e.button!==0||gesture)return;
  const p=point(e),l=layout(w,h);let kind=null;
  if(s.stage==='choose')kind=['tomato','egg'].find(id=>!s.picked[id]&&inEllipse(p,l.selectFoods[id],l.selectSize*.63,l.selectSize*.70));
  if(s.stage==='chop'&&(inEllipse(p,l.board,Math.max(l.board.rx,155*l.cutScale),Math.max(l.board.ry,155*l.cutScale))||inEllipse(p,l.knife,135,85)))kind='knife';
  if(s.stage==='crack'&&!s.cracked&&inEllipse(p,l.egg,l.egg.size*.7,l.egg.size*.75))kind='shell';
  if(s.stage==='whisk'&&(inEllipse(p,l.bowl,l.bowl.r*1.1,l.bowl.r*.75)||inEllipse(p,l.whisk,80,100)))kind='whisk';
  if(s.stage==='pour'&&!s.transfer){const id=s.poured.tomato?'egg':'tomato',q=id==='tomato'?l.tomatoSource:l.eggSource;if(!s.poured[id]&&inEllipse(p,q,q.r*1.35,q.r))kind=id;}
  if(s.stage==='cook'){if(inEllipse(p,l.dial,l.dial.r*1.5))kind='heat';else if(s.heat&&(inEllipse(p,l.pan,l.pan.r*1.12,l.pan.r*.83)||inEllipse(p,l.spatula,85,105)))kind='spatula';}
  if(s.stage==='plate'&&!s.plated&&inEllipse(p,l.servingPan,l.servingPan.r*1.45,l.servingPan.r*.8))kind='pan';
  if(s.stage==='feed'&&!s.chew&&s.bites<3&&(inEllipse(p,l.meal,l.meal.r*1.2,l.meal.r*.85)||inEllipse(p,l.feedSpoon,85,95)))kind='bite';
  if(!kind)return;begin();activity();gesture={id:e.pointerId,kind,start:p,point:p,previous:p,distance:0,cut:false};canvas.setPointerCapture(e.pointerId);e.preventDefault();
});
canvas.addEventListener('pointermove',e=>{
  if(!gesture||gesture.id!==e.pointerId)return;const p=point(e),g=gesture,l=layout(w,h),distance=Math.hypot(p.x-g.previous.x,p.y-g.previous.y);g.distance+=distance;g.point=p;activity();
  if(g.kind==='knife'&&g.distance>32)cutStroke(g,p,l);
  if(g.kind==='whisk'&&inEllipse(p,l.bowl,l.bowl.r*1.1,l.bowl.r*.7)){stir(s,Math.min(distance,85)*210/l.bowl.r);sound('stir');}
  if(g.kind==='spatula'&&inEllipse(p,l.pan,l.pan.r,l.pan.r*.72)){push(s,panPoint(g.previous,l),panPoint(p,l));sound('stir');}
  g.previous=p;sync();e.preventDefault();
});
function finish(e,cancel=false){
  if(!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=point(e),l=layout(w,h),tap=g.distance<24;gesture=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  activity();if(cancel)return;
  if(s.stage==='choose'&&(tap||inEllipse(p,l.basket,l.basket.rx*1.2,l.basket.ry*1.4))&&pick(s,g.kind)){s.fly={id:g.kind,from:tap?l.selectFoods[g.kind]:p,t:0};sound('pour');}
  if(g.kind==='knife')cutStroke(g,p,l,tap,true);
  if(g.kind==='shell'&&(tap||inEllipse(p,l.bowl,l.bowl.r*1.3,l.bowl.r))&&crack(s)){sound('crack');s.crackAge=0;}
  if(g.kind==='whisk'&&tap){stir(s,250);sound('stir');}
  if(s.stage==='pour'&&(tap||inEllipse(p,l.pan,l.pan.r*1.4,l.pan.r))&&pour(s,g.kind)){s.transfer.from=tap?null:p;sound('pour');}
  if(g.kind==='heat'){s.heat=!s.heat;sound('ready');}
  if(g.kind==='spatula'&&tap){const at=panPoint(p,l);push(s,{x:at.x-80,y:at.y},{x:at.x+80,y:at.y});sound('stir');}
  if(g.kind==='pan'&&(tap||inEllipse(p,l.plate,l.plate.r*1.35,l.plate.r))&&plate(s)){s.transfer.from=tap?null:p;sound('pour');}
  const mouth={x:l.friend.x,y:l.friend.y+l.friend.r*.43};
  if(g.kind==='bite'&&(tap||inEllipse(p,mouth,l.friend.r*.85,l.friend.r*.65))&&feed(s)){s.biteFlight={from:tap?{x:l.meal.x,y:l.meal.y}:p,t:0};sound('bite');}
  sync();
}
canvas.addEventListener('pointerup',e=>finish(e));canvas.addEventListener('pointercancel',e=>finish(e,true));canvas.addEventListener('lostpointercapture',e=>{if(gesture?.id===e.pointerId){gesture=null;activity();}});
function accessibleAction(){
  begin();activity();
  if(s.stage==='choose'){pick(s,s.picked.tomato?'egg':'tomato');}
  else if(s.stage==='chop'){const p=s.pieces[0];if(chop(s,{x:p.x,y:p.y-180},{x:p.x,y:p.y+180}))sound('cut');}
  else if(s.stage==='crack'&&crack(s)){s.crackAge=0;sound('crack');}
  else if(s.stage==='whisk'){stir(s,250);sound('stir');}
  else if(s.stage==='pour')pour(s,s.poured.tomato?'egg':'tomato');
  else if(s.stage==='cook'){if(!s.heat)s.heat=true;else push(s,{x:-70,y:0},{x:95,y:0});}
  else if(s.stage==='plate')plate(s);
  else if(s.stage==='feed')feed(s);
  else if(s.stage==='done')reset();sync();
}
canvas.addEventListener('keydown',e=>{if($('recipeGuide').open||e.repeat)return;if(['Enter',' '].includes(e.key)){e.preventDefault();accessibleAction();}if(e.key==='ArrowRight'){e.preventDefault();next();}});
$('recipeNext').onclick=()=>{activity();reset();};
$('recipeHint').onclick=()=>{begin();idle=0;hintUntil=time+6;narrator.speak(...clips[s.stage]);};
$('recipeReset').onclick=()=>{reset();$('recipeGuide').close();};
$('recipeVoice').onclick=()=>{prefs.sound=!prefs.sound;narrator.stop();save();sync();};
$('recipeParents').onclick=()=>{gesture=null;completionAge=0;narrator.stop();$('recipeGuide').showModal();updateSizzle();};
$('recipeClose').onclick=()=>$('recipeGuide').close();$('recipeGuide').addEventListener('close',()=>{last=null;activity();hintUntil=time+3;updateSizzle();});
const freeURL=new URL(location.href);freeURL.searchParams.set('mode','free');$('recipeFree').href=freeURL.href;
document.addEventListener('visibilitychange',()=>{gesture=null;last=null;completionAge=0;if(document.hidden)narrator.stop();updateSizzle();});
window.addEventListener('blur',()=>{gesture=null;completionAge=0;});
window.addEventListener('pagehide',()=>{narrator.stop();if(sizzle){sizzle.stop();sizzle=null;}});
new ResizeObserver(resize).observe(canvas);resize();sync();
function frame(now){
  const dt=last===null?0:Math.min(.05,(now-last)/1000);last=now;
  if(!document.hidden&&!$('recipeGuide').open){time+=dt;idle+=dt;stageAge+=dt;
    if(started){stepRecipe(s,dt);if(s.fly){s.fly.t+=dt;if(s.fly.t>.5)s.fly=null;}if(s.cutFlash){s.cutFlash.age+=dt;if(s.cutFlash.age>.4)s.cutFlash=null;}if(s.biteFlight){s.biteFlight.t+=dt;if(s.biteFlight.t>.45)s.biteFlight=null;}
      if(s.stage==='crack'&&s.cracked)s.crackAge=(s.crackAge||0)+dt;
      const delay=continuationDelay(s);if(delay!==null&&!gesture){completionAge+=dt;if(completionAge>=delay){if(s.stage==='feed'){prefs.served++;prefs.customer=(prefs.customer+1)%4;save();}next();}}else completionAge=0;sync();
    }
  }
  drawScene(ctx,w,h,s,art,{time:reduced?0:time,stageAge:reduced?1:stageAge,gesture,hint:!gesture&&!ready(s)&&(time<hintUntil||idle>2.5),customer:s.stage==='done'?(prefs.customer+3)%4:prefs.customer});
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
