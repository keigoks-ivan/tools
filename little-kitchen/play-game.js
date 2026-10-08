import {foods,fresh,restore} from './model.js?v=7';
import {createNarrator} from './voice.js?v=7';
import {hitPiece,tossFood,addLiquid} from './simulation.js?v=11';
import {createPlay,shelves,friends,ingredients,chop,moveBoard,pour,season,stir,tick,describe,feed,clearPlace} from './play-state.js?v=11';
import {createArt,asset,view,toFood,onFood} from './play-art.js?v=11';
const root=document.getElementById('play'),s=createPlay(),icon=body=>`<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const icons={chef:icon('<path d="M9 30V16a7 7 0 0 1 2-13 8 8 0 0 1 15 0 7 7 0 0 1 4 13v14zM9 26h21M12 34h15"/>'),hand:icon('<path d="M13 20V9q0-5 5-4 3 1 3 5v9q5-3 6 2 5-1 6 4v5q-1 7-10 7h-5q-8-4-12-13-2-5 2-5l5 5"/>'),sound:icon('<path d="M5 15h7l9-8v26l-9-8H5zM27 14q7 6 0 12M31 8q12 12 0 24"/>'),mute:icon('<path d="M5 15h7l9-8v26l-9-8H5zM28 15l8 10m0-10-8 10"/>'),gear:icon('<circle cx="20" cy="20" r="6"/><path d="M15 5h10l2 5 5 2 4 8-4 5-2 7-10 4-5-4-7-2-4-10 4-5 2-7z"/>'),clear:icon('<path d="M9 10h22M16 6h8M12 10l2 25h12l2-25M18 16v12m5-12v12"/>')};
const spiceIcon=key=>key==='lemon'?'<svg viewBox="0 0 70 90" aria-hidden="true"><path d="M12 66q3-37 34-43l15 22q-12 31-41 29Z" fill="#efcf57" stroke="#c5a548" stroke-width="3"/><path d="M17 62q6-23 28-32l11 16q-13 21-34 23Z" fill="#ffe79a"/><path d="M21 59l25-26m-20 30 23-22" stroke="#fff5ce" stroke-width="3"/></svg>':`<svg viewBox="0 0 70 90" aria-hidden="true"><path d="M21 26h29l9 52H12Z" fill="${key==='salt'?'#fff3dc':'#b9875b'}" stroke="#9c8465" stroke-width="3"/><path d="M21 26V17q15-14 29 0v9Z" fill="#afbeb1" stroke="#788e7c" stroke-width="3"/><circle cx="28" cy="18" r="2" fill="#fff5df"/><circle cx="42" cy="18" r="2" fill="#fff5df"/><path d="M29 54h13" stroke="${key==='salt'?'#b9ae8a':'#654a35'}" stroke-width="4"/></svg>`;
root.innerHTML=`<header class="play-head"><div class="play-brand">${icons.chef}小小料理家</div><div class="tools"><button id="playHint" aria-label="看小手示範">${icons.hand}</button><button id="playSound" aria-label="開關聲音" aria-pressed="true">${icons.sound}</button><button id="playParents" aria-label="大人說明">${icons.gear}</button></div></header><nav class="play-nav" aria-label="自由選擇工作台">${[['board','砧板'],['pan','平底鍋'],['pot','湯鍋'],['blender','果汁機'],['serve','餐桌']].map(([id,name])=>`<button class="place" data-place="${id}" aria-label="${name}" aria-pressed="${id==='board'}"><img src="${asset(id==='serve'?'plate':id)}" alt=""></button>`).join('')}</nav><section class="play-world"><canvas id="playCanvas" tabindex="0" role="application" aria-label="自由料理操作區" aria-describedby="playStatus"></canvas><div class="play-cue" aria-hidden="true"><img id="playCueImage" alt=""><span id="playCue"></span></div><button class="play-clear" id="playClear" aria-label="清空目前工作台">${icons.clear}</button><div class="play-season" id="playSeason" hidden>${['salt','pepper','lemon'].map((id,i)=>`<button data-spice="${id}" aria-label="${['撒鹽','撒胡椒','擠檸檬'][i]}">${spiceIcon(id)}</button>`).join('')}<button id="playLiquid" aria-label="加水"><svg viewBox="0 0 70 90" aria-hidden="true"><path d="M12 23h41l-4 53H17Z" fill="#e7f1d8" stroke="#8eac94" stroke-width="3"/><path d="M53 32q24-1 12 27H51" fill="none" stroke="#8eac94" stroke-width="5"/><path data-liquid d="M18 45h30l-3 26H21Z" fill="#86bed0"/></svg></button></div><div class="play-friends" id="playFriends" hidden>${friends.map((f,i)=>`<button data-friend="${i}" aria-label="請${f.name}試吃" aria-pressed="${i===0}"><img src="${asset(f.id)}" alt=""></button>`).join('')}</div><div class="play-loading" id="playLoading">正在打開廚房…</div></section><section class="play-fridge" aria-label="隨時拿食材"><div class="shelf-pages" id="playPages">${shelves.map((ids,i)=>`<button data-page="${i}" aria-label="${['蔬菜與蛋','水果','肉類與豆腐','牛奶與主食'][i]}" aria-pressed="${i===0}"><img data-food-image="${ids[0]}" alt=""></button>`).join('')}</div><div class="food-shelf" id="playShelf"></div><div class="shelf-arrows"><button id="playPrev" aria-label="上一層食材">‹</button><button id="playNext" aria-label="下一層食材">›</button></div></section><p class="play-status" id="playStatus" aria-live="polite"></p><dialog class="play-guide" id="playGuide"><button class="close" id="playClose" aria-label="關閉說明">×</button><h2>孩子自己決定怎麼煮</h2><p>下方冰箱每層六樣食材，共 24 種。點食材拿到目前的砧板、鍋子或盤子；也能直接拖到上方任何工作台。隨時都可以加料。</p><p>砧板上直接點或滑過食材切開，蛋會敲開。把切塊拖到右下方小鍋，或點小鍋一次倒入。切菜不用先選刀或手。</p><p>上方圖片可自由切換砧板、平底鍋、湯鍋、果汁機與餐桌，每個容器都會保留自己的材料。在爐台點右下旋鈕開火，再點能調大或關火；也可拖旋鈕調整。直接在鍋內滑動翻炒，拖鍋柄可以拋鍋。果汁機按住圓鈕才會轉，放開就停。</p><p>點右下盤子盛盤，直接拖料理到朋友嘴邊，或點盤子／朋友餵一口。可以回去繼續煮、加新食材，再盛到同一盤。撒鹽、胡椒和擠檸檬會改變試吃表情。小熊偏愛水果、牛奶和鬆餅，小兔偏愛蔬菜與蘋果。沒有分數、倒數或過關。</p><p>蛋少攪會煎成荷包蛋，攪散會形成炒蛋；麵粉和牛奶下平底鍋會形成鬆餅，起司會融化，水果加牛奶打成奶昔。煎太久會逐漸變深色。右上垃圾桶只清空目前容器。</p><p>鍵盤：Tab 選食材與工具；砧板 Enter／空白切菜，右方向鍵下鍋。爐台 Enter／空白開火並翻炒，右方向鍵盛盤；果汁機按住空白開轉、放開停止。餐桌 Enter／空白餵食。聲音與招待次數存在此裝置，這次食物保留到重新整理。</p><a href="?mode=recipe">跟著做一次番茄炒蛋</a></dialog>`;
const $=id=>document.getElementById(id),canvas=$('playCanvas');let prefs=fresh();try{prefs=restore(localStorage.getItem('little-bloom-v3'));}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')prefs.sound=false;
let art=null,page=0,gesture=null,foodGesture=null,pointer=null,last=null,time=0,interacted=0,forceHint=0,l=null,w=0,h=0,audio=null,soundLoop=null,loopKind='';
const narrator=createNarrator({allowed:()=>prefs.sound&&!document.hidden&&!$('playGuide').open,getAudioContext:context});
function context(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify({...prefs,scene:'kitchen',ingredients:[],method:null}));}catch{}}
function tone(kind='cut'){
  if(!prefs.sound||document.hidden||$('playGuide').open)return;
  try{const c=context();c.resume();const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(kind==='cut'?160:kind==='taste'?620:360,c.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='taste'?420:75,c.currentTime+.18);g.gain.setValueAtTime(.035,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.22);o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(c.currentTime+.23);}catch{}
}
function stopSound(){try{soundLoop?.stop();soundLoop?.disconnect();}catch{}soundLoop=null;loopKind='';}
function sound(){
  const kind=prefs.sound&&!document.hidden&&!$('playGuide').open&&s.station==='stove'&&s.vessels[s.method].length?(s.blending?'blender':s.heat[s.method]?s.method:''):'';
  if(kind===loopKind)return;stopSound();if(!kind)return;
  try{const c=context();c.resume();const g=c.createGain();g.gain.value=.016;g.connect(c.destination);
    if(kind==='blender'){const o=c.createOscillator();o.type='sawtooth';o.frequency.value=75;o.connect(g);o.onended=()=>g.disconnect();o.start();soundLoop=o;}
    else{const source=c.createBufferSource(),buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.24;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=kind==='pot'?600:1900;source.buffer=buffer;source.loop=true;source.connect(filter);filter.connect(g);source.onended=()=>{filter.disconnect();g.disconnect();};source.start();soundLoop=source;}loopKind=kind;
  }catch{}
}
function active(){return s.station==='board'?'board':s.station==='serve'?'serve':s.method;}
function render(){
  for(const b of root.querySelectorAll('[data-place]')){const id=b.dataset.place;b.setAttribute('aria-pressed',String(active()===id));b.classList.toggle('has-food',!!(id==='board'?s.board.length:id==='serve'?s.plate.length:s.vessels[id].length));}
  $('playSound').innerHTML=prefs.sound?icons.sound:icons.mute;$('playSound').setAttribute('aria-pressed',String(prefs.sound));
  $('playSeason').hidden=s.station==='board';$('playFriends').hidden=s.station!=='serve';$('playLiquid').hidden=s.station!=='stove'||s.method==='blender';$('playLiquid').setAttribute('aria-label',s.method==='pot'?'加水':'加油');$('playLiquid').querySelector('[data-liquid]')?.setAttribute('fill',s.method==='pan'?'#e5bc5c':'#86bed0');
  for(const b of root.querySelectorAll('[data-friend]'))b.setAttribute('aria-pressed',String(Number(b.dataset.friend)===s.friend));
  const names={board:'拿來切，也能直接下鍋',pan:'自己煎・自己炒',pot:'加水煮一鍋湯',blender:'按住開關打果汁',serve:'請朋友吃一口'};
  const reaction={love:'好喜歡！',yum:'好吃！',spicy:'辣辣辣！',sour:'酸酸的！',salty:'鹹鹹的！',surprise:'咦？這是什麼味道！',smoky:'煎得香香黑黑的！'};
  $('playCue').textContent=s.station==='serve'&&s.reaction?reaction[s.reaction]:names[active()];$('playCueImage').src=asset(s.station==='serve'?friends[s.friend].id:active());
  const list=s.station==='board'?s.board:s.station==='stove'?s.vessels[s.method]:s.plate,d=describe(list,s.station==='board'?'raw':s.station==='stove'?s.method:s.plateMethod,s.station==='serve'?s.plateSpices:s.spices[s.method]);
  canvas.dataset.station=s.station;canvas.dataset.method=s.method;canvas.dataset.board=String(s.board.length);canvas.dataset.pan=String(s.vessels.pan.length);canvas.dataset.pot=String(s.vessels.pot.length);canvas.dataset.blender=String(s.vessels.blender.length);canvas.dataset.plate=String(s.plate.length);canvas.dataset.dish=d?.kind||'';canvas.dataset.reaction=s.reaction||'';canvas.dataset.friend=String(s.friend);canvas.dataset.bites=String(s.bites);canvas.dataset.heat=String(s.heat[s.method]||0);
  $('playStatus').textContent=`${names[active()]}。${[...new Set(list.map(p=>foods[p.id][1]))].join('、')}${s.reaction?'。'+reaction[s.reaction]:''}`;sound();
}
function shelf(){
  $('playShelf').innerHTML=shelves[page].map(id=>`<button class="food-item" data-food="${id}" aria-label="拿${foods[id][1]}"><img src="${art.foodImage(id)}" alt=""></button>`).join('');
  for(const b of root.querySelectorAll('[data-page]'))b.setAttribute('aria-pressed',String(Number(b.dataset.page)===page));$('playPrev').disabled=page===0;$('playNext').disabled=page===shelves.length-1;
}
function touch(){interacted=time;forceHint=0;}
function pick(id,target){touch();if(ingredients(s,id,target)){if(target){if(target==='board'||target==='plate')s.station=target==='plate'?'serve':'board';else{s.station='stove';s.method=target;}}tone('pour');narrator.speak(`word-${id}`,foods[id][2]);render();}}
function change(id){cancel();touch();s.blending=false;s.plateOffset=null;if(id==='board'||id==='serve')s.station=id;else{s.station='stove';s.method=id;}render();}
function serveBite(){touch();const reaction=feed(s);if(!reaction)return;tone('taste');prefs.served++;save();render();}
function client(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
const inside=(p,q,rx,ry=rx)=>((p.x-q.x)/rx)**2+((p.y-q.y)/ry)**2<=1;
function dropTarget(p){
  const target=document.elementFromPoint(p.x,p.y)?.closest('[data-place]');if(target)return target.dataset.place==='serve'?'plate':target.dataset.place;
  const r=canvas.getBoundingClientRect();if(p.x<r.left||p.x>r.right||p.y<r.top||p.y>r.bottom)return null;
  const q={x:p.x-r.left,y:p.y-r.top};if(s.station==='board'&&inside(q,l.transfer,l.transfer.r*1.4,l.transfer.r))return s.method;
  return s.station==='stove'?s.method:s.station==='serve'?'plate':'board';
}
root.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!art)return;
  if(b.dataset.place)change(b.dataset.place);
  else if(b.dataset.page){touch();page=Number(b.dataset.page);shelf();}
  else if(b.dataset.spice){touch();if(season(s,b.dataset.spice)){tone('pour');s.effect={kind:b.dataset.spice,until:time+.9};render();}}
  else if(b.dataset.friend){touch();s.friend=Number(b.dataset.friend);s.reaction=null;render();}
  else if(b.dataset.food&&e.detail===0)pick(b.dataset.food);
});
$('playPrev').onclick=()=>{touch();page=Math.max(0,page-1);shelf();};$('playNext').onclick=()=>{touch();page=Math.min(shelves.length-1,page+1);shelf();};
$('playShelf').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-food]');if(!b||!art||gesture||foodGesture||e.isPrimary===false||e.button>0)return;touch();foodGesture={id:e.pointerId,food:b.dataset.food,start:{x:e.clientX,y:e.clientY},moved:false,button:b};b.setPointerCapture(e.pointerId);});
$('playShelf').addEventListener('pointermove',e=>{if(!foodGesture||foodGesture.id!==e.pointerId)return;const g=foodGesture;if(Math.hypot(e.clientX-g.start.x,e.clientY-g.start.y)>12)g.moved=true;if(g.moved)pointer={...client(e),ingredient:g.food};});
function endFood(e,cancelled=false){if(!foodGesture||foodGesture.id!==e.pointerId)return;const g=foodGesture;foodGesture=null;pointer=null;if(g.button.hasPointerCapture(e.pointerId))g.button.releasePointerCapture(e.pointerId);if(cancelled)return;const target=g.moved?dropTarget({x:e.clientX,y:e.clientY}):undefined;if(g.moved&&!target)return;pick(g.food,target);}
$('playShelf').addEventListener('pointerup',e=>endFood(e));$('playShelf').addEventListener('pointercancel',e=>endFood(e,true));$('playShelf').addEventListener('lostpointercapture',()=>{if(foodGesture){foodGesture=null;pointer=null;}});
function down(e){
  if(!art||gesture||foodGesture||$('playGuide').open||e.isPrimary===false||e.button>0)return;touch();const p=client(e);canvas.setPointerCapture(e.pointerId);const g={id:e.pointerId,start:p,last:p,distance:0,mode:'',station:s.station};gesture=g;
  if(s.station==='board'){
    if(inside(p,l.transfer,l.transfer.r*1.4,l.transfer.r))g.mode='transfer';
    else if(!s.board.length&&inside(p,l.board,l.board.rx*.55,l.board.ry*.75))g.mode='take-demo';
    else{g.mode='cut';g.piece=hitPiece(s.board,toFood(p,l));}
  }else if(s.station==='stove'){
    if(inside(p,l.transfer,l.transfer.r*1.4,l.transfer.r))g.mode='plate';
    else if(s.board.length&&inside(p,l.source,l.source.r*1.3,l.source.r))g.mode='add-board';
    else if(s.method==='blender'&&inside(p,l.motor,l.motor.r*1.6)){g.mode='motor';s.blending=true;sound();}
    else if(s.method!=='blender'&&inside(p,l.dial,l.dial.r*1.5)){g.mode='dial';g.angle=Math.atan2(p.y-l.dial.y,p.x-l.dial.x);}
    else if(s.method==='pan'&&p.x>l.center.x+l.r*.9&&Math.abs(p.y-l.center.y)<l.r*.6)g.mode='toss';
    else g.mode='stir';
  }else if(s.plate.length&&(inside(p,l.food,l.food.r*1.2,l.food.r)||inside(p,l.guest,l.guest.r,l.guest.r*1.4)))g.mode='feed';
  pointer={...p,mode:g.mode};
}
function move(e){
  if(!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=client(e);g.distance=Math.max(g.distance,Math.hypot(p.x-g.start.x,p.y-g.start.y));
  if(g.mode==='cut'){pointer={...p,mode:'cut'};if(g.piece&&inside(p,l.transfer,l.transfer.r*1.5,l.transfer.r*1.1))pointer={...p,ingredient:g.piece.id};}
  else if(g.mode==='stir'){stir(s,toFood(g.last,l,'stove'),toFood(p,l,'stove'));pointer={...p,mode:'stir'};}
  else if(g.mode==='dial'&&g.distance>10){const a=Math.atan2(p.y-l.dial.y,p.x-l.dial.x),delta=Math.atan2(Math.sin(a-g.angle),Math.cos(a-g.angle));s.heat[s.method]=Math.max(0,Math.min(1,s.heat[s.method]+delta/(Math.PI*1.5)));g.angle=a;sound();}
  else if(g.mode==='toss'&&g.last.y-p.y>8)tossFood(s,Math.min(1.2,(g.last.y-p.y)/35));
  else if(g.mode==='feed'&&g.distance>10){s.plateOffset={x:p.x-g.start.x,y:p.y-g.start.y};pointer={...p,mode:'feed'};}
  g.last=p;
}
function up(e,cancelled=false){
  if(!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=client(e);gesture=null;pointer=null;s.plateOffset=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);s.blending=false;
  if(cancelled){sound();return;}
  if(g.mode==='cut'){
    const target=dropTarget({x:e.clientX,y:e.clientY});
    if(g.piece&&g.distance>18&&target&&target!=='board'){if(moveBoard(s,target,g.piece.uid)){tone('pour');if(target==='plate')s.station='serve';else{s.method=target;s.station='stove';}}}
    else{const a=toFood(g.start,l),b=toFood(p,l);if(g.distance<18&&g.piece){a.x=g.piece.x-130;a.y=g.piece.y;b.x=g.piece.x+130;b.y=g.piece.y;}if(chop(s,a,b))tone('cut');}
  }else if(g.mode==='take-demo'&&g.distance<18)pick('tomato','board');
  else if(g.mode==='transfer'){if(moveBoard(s,s.method)){tone('pour');s.station='stove';}}
  else if(g.mode==='add-board'){if(moveBoard(s,s.method))tone('pour');}
  else if(g.mode==='plate'){if(pour(s)){tone('pour');}}
  else if(g.mode==='dial'&&g.distance<12){s.heat[s.method]=s.heat[s.method]===0?.65:s.heat[s.method]<.9?1:0;tone('wood');}
  else if(g.mode==='toss'&&g.distance<12)tossFood(s);
  else if(g.mode==='stir'&&g.distance<12){stir(s,{x:230,y:230},{x:350,y:245});tossFood(s,.25);tone('wood');}
  else if(g.mode==='feed'&&(g.distance<18||inside(p,l.guest,l.guest.r*1.3,l.guest.r*1.6)))serveBite();
  render();
}
function cancel(){gesture=null;foodGesture=null;pointer=null;s.plateOffset=null;s.blending=false;sound();}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',e=>up(e));canvas.addEventListener('pointercancel',e=>up(e,true));canvas.addEventListener('lostpointercapture',()=>{if(gesture)cancel();});
canvas.addEventListener('keydown',e=>{
  if(!art||$('playGuide').open||!['Enter',' ','ArrowRight'].includes(e.key))return;e.preventDefault();touch();
  if(s.station==='board'){if(e.key==='ArrowRight'){if(moveBoard(s,s.method))s.station='stove';}else if(s.board.length){const p=s.board[0];chop(s,{x:p.x-140,y:p.y},{x:p.x+140,y:p.y});}}
  else if(s.station==='stove'){
    if(e.key==='ArrowRight')pour(s);
    else if(s.method==='blender')s.blending=true;
    else{s.heat[s.method]=s.heat[s.method]||.65;stir(s,{x:235,y:245},{x:350,y:245});tossFood(s,.3);}
  }else serveBite();render();
});
function stopMotor(){s.blending=false;sound();}canvas.addEventListener('keyup',stopMotor);canvas.addEventListener('blur',()=>{gesture=null;s.plateOffset=null;if(!foodGesture)pointer=null;stopMotor();});
$('playClear').onclick=()=>{cancel();touch();clearPlace(s);render();};$('playHint').onclick=()=>{interacted=time;forceHint=time+7;};
$('playLiquid').onclick=()=>{touch();if(addLiquid(s,s.method==='pan'?'oil':'water')){tone('pour');s.effect={kind:'water',until:time+.7};render();}};
$('playSound').onclick=()=>{prefs.sound=!prefs.sound;if(!prefs.sound){narrator.stop();stopSound();}save();render();};
$('playParents').onclick=()=>{cancel();narrator.stop();stopSound();$('playGuide').showModal();};$('playClose').onclick=()=>$('playGuide').close();$('playGuide').addEventListener('close',()=>{last=null;sound();});
document.addEventListener('visibilitychange',()=>{last=null;if(document.hidden){cancel();narrator.stop();stopSound();audio?.suspend();}else sound();});
function frame(now){
  if(!document.hidden&&!$('playGuide').open&&art){const dt=last===null?0:Math.min(.05,(now-last)/1000);time+=dt;tick(s,dt);
    const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);w=r.width;h=r.height;if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    l=art.draw(s,time,pointer,time<forceHint||time-interacted>7,w,h);
    canvas.dataset.cooked=String((s.vessels[s.method].reduce((n,p)=>n+p.cooked,0)/Math.max(1,s.vessels[s.method].length)).toFixed(2));canvas.dataset.blend=s.blend.toFixed(2);canvas.dataset.mixed=(s.vessels[s.method].filter(p=>p.id==='egg').reduce((n,p)=>n+p.mixed,0)).toFixed(2);canvas.dataset.chew=s.chew.toFixed(2);
    if(s.station==='board'&&!s.board.length)for(const b of $('playShelf').querySelectorAll('[data-food]'))b.classList.toggle('highlight',b=== $('playShelf').firstElementChild&&time-interacted>4);
    last=now;
  }else last=null;requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);createArt(canvas).then(result=>{art=result;for(const im of root.querySelectorAll('[data-food-image]'))im.src=art.foodImage(im.dataset.foodImage);shelf();$('playLoading').hidden=true;canvas.dataset.ready='true';}).catch(()=>{$('playLoading').textContent='圖片載入失敗，請重新整理。';});
