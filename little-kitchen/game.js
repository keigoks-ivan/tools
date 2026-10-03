import {foods,methods,guests,fresh,restore,toggleFood,cook,dish,serve} from './model.js?v=3';
import {createNarrator} from './voice.js?v=3';
import {foodSVG,utensil,boardArt,bowlArt,cookwareArt,plateArt} from './art.js?v=5';
const $=id=>document.getElementById(id);
let state=fresh();
try{state=restore(localStorage.getItem('little-bloom-v3'),localStorage.getItem('little-bloom-v2')||localStorage.getItem('little-bloom-v1'));}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')state.sound=false;
state.scene='kitchen';
let stage=state.method?'serve':state.ingredients.length?'prep':'pick';
let started=false,prepared={},focusFood=state.ingredients[0]||null,stirs=0,tool=state.method,portions=0,page=0,liquid=false;
let audio,loopSound=null,gesture=null,suppressClick=false,celebratingGuest=null,holdTimer=null,holding=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify(state));}catch{}}
function getAudioContext(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
const narration=createNarrator({allowed:()=>started&&state.sound&&!document.hidden&&!$('guide').open,getAudioContext,onStatus:mode=>{$('voice').dataset.playback=mode;}});
function speak(key,text){narration.speak(key,text);}
function stopKitchenSound(){try{loopSound?.stop();loopSound?.disconnect();}catch{}loopSound=null;}
function kitchenSound(){
  stopKitchenSound();
  if(!started||!state.sound||document.hidden||$('guide').open||stage!=='cook'||(tool==='blender'&&!holding))return;
  try{
    const c=getAudioContext();if(c.state==='suspended')c.resume();const gain=c.createGain();gain.gain.value=tool==='blender'?.018:.035;gain.connect(c.destination);
    if(tool==='blender'){
      const oscillator=c.createOscillator();oscillator.type='sawtooth';oscillator.frequency.value=83;oscillator.connect(gain);oscillator.onended=()=>gain.disconnect();oscillator.start();loopSound=oscillator;
    }else{
      const buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*(Math.random()>.97?1:.12);
      const source=c.createBufferSource();source.buffer=buffer;source.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=tool==='pan'?2400:650;source.connect(filter);filter.connect(gain);source.onended=()=>{filter.disconnect();gain.disconnect();};source.start();loopSound=source;
    }
  }catch{}
}
function kitchenTap(kind='cut'){
  if(!started||!state.sound||document.hidden||$('guide').open)return;
  try{const c=getAudioContext();if(c.state==='suspended')c.resume();const o=c.createOscillator(),g=c.createGain();o.type=kind==='cut'?'triangle':'sine';o.frequency.setValueAtTime(kind==='cut'?210:kind==='pour'?430:245,c.currentTime);o.frequency.exponentialRampToValueAtTime(kind==='cut'?65:320,c.currentTime+.09);g.gain.setValueAtTime(.045,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.13);o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(c.currentTime+.14);}catch{}
}
function button(content,label,action,cls='',extra=''){return `<button class="${cls}" data-action="${action}" aria-label="${label}" ${stage==='celebrate'?'disabled':''} ${extra}>${content}</button>`;}
function hand(mode='tap'){return `<span class="demo-hand ${mode}" aria-hidden="true">👆</span>`;}
function dots(done,total){return `<span class="action-dots" aria-hidden="true">${Array.from({length:total},(_,i)=>`<i class="${i<done?'done':''}"></i>`).join('')}</span>`;}
function totalPrep(id){return ['milk','flour','rice'].includes(id)?2:3;}
function cookSteps(){return tool==='pot'?5:3;}
function prepIcon(){return ['milk','flour','rice'].includes(focusFood)?'🥣':'🔪';}
function toolArt(kind){return `<span class="moving-tool tool-${kind}" aria-hidden="true">${utensil(kind)}</span>`;}
function liquidArt(kind){return kind==='oil'?'<svg viewBox="0 0 120 150" aria-hidden="true"><path d="M42 24h36v24l16 22v63H25V70l17-22Z" fill="#e5e6bb" stroke="#8e9f7d" stroke-width="5"/><path d="M30 85h59v43H30Z" fill="#dab251"/><rect x="40" y="12" width="40" height="18" rx="4" fill="#809975"/><path d="M46 98q-15 18 5 23 20-5 5-23" fill="#ffdf77"/></svg>':'<svg viewBox="0 0 120 150" aria-hidden="true"><path d="M19 40h65l-5 92H29Z" fill="#d3e6e3" stroke="#7ba7ae" stroke-width="5"/><path d="M83 50q45-4 27 48l-30 8" fill="none" stroke="#7ba7ae" stroke-width="9"/><path d="M25 77h54l-4 49H32Z" fill="#94c9d4"/><path d="M35 47v48" stroke="#fffaf0" stroke-width="7" stroke-linecap="round"/></svg>';}
function render(){
  $('world').className=`stage-${stage} ${tool?'method-'+tool:''}`;
  $('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));
  const current=stage==='pick'?0:stage==='prep'?1:['plate','serve','celebrate'].includes(stage)?3:2;
  $('journey').innerHTML=['🥕','🔪','🍳','🍽️'].map((icon,i)=>`<span class="journey-stop ${i<current?'done':''} ${i===current?'current':''}" ${i===current?'aria-current="step"':''} aria-label="${['拿食材','準備食材','煮菜','盛盤與餵朋友'][i]}">${icon}</span>${i<3?'<span class="journey-arrow" aria-hidden="true">›</span>':''}`).join('');
  const guest=celebratingGuest??state.customer;
  $('friend').innerHTML=`${button(`<span class="guest-art" style="background-position:${guest*100/3}% center"></span>`,stage==='serve'?'餵朋友':guests[guest],stage==='serve'?'serve':'hello',`friend-button ${stage==='celebrate'?'happy':''}`,`id="guestTarget"`)}<span class="friend-bubble" aria-hidden="true">${stage==='celebrate'?'💕':stage==='serve'?'😋':'😊'}</span>`;
  let work='',cue='',status='';
  if(stage==='pick'){
    work=`<div class="work-surface empty-board" id="workTarget">${boardArt('carrot',0)}<span class="empty-food" aria-hidden="true">＋</span>${hand()}</div>`;cue='<span>🥕</span><b>↓</b><span>🔪</span>';status='從冰箱拿一樣大食材，放到砧板。';
  }else if(stage==='prep'){
    const count=prepared[focusFood]||0,pouring=totalPrep(focusFood)===2;
    work=button(`${pouring?bowlArt(state.ingredients.filter(id=>(prepared[id]||0)>0),1):boardArt(focusFood,count)}${pouring?`<span class="pour-ingredient ${count?'pouring':''}">${foodSVG(focusFood)}</span><span class="pour-stream" aria-hidden="true"></span>`:toolArt('knife')}${hand(pouring?'pour':'slice')}${dots(count,totalPrep(focusFood))}`,'點或滑動砧板準備食材','prep',`work-surface prep-surface ${count?'has-cuts':''}`,`id="workTarget"`);
    cue=`<span>${prepIcon()}</span><b>↓</b><span class="cue-food">${foodSVG(focusFood)}</span>`;status=`${foods[focusFood][1]}：${pouring?'把食材倒進碗裡':'讓刀子切過食材'}。`;
  }else if(stage==='tools'){
    work=`<div class="work-surface" id="workTarget">${bowlArt(state.ingredients)}<span class="board-sparkle" aria-hidden="true">✨</span></div>`;cue='<span>🍲</span><span>🍳</span><span>🥤</span>';status='食材準備好了，選要用的鍋子。';
  }else if(stage==='load'){
    work=button(`${cookwareArt(tool,[],{loaded:false})}<span class="ingredient-bowl">${bowlArt(state.ingredients)}</span><span class="load-arrow" aria-hidden="true">↘</span>${hand('pour')}`,'把食材倒入鍋子','load','work-surface load-surface',`id="workTarget"`);cue='<span>🥣</span><b>↘</b><span>🍳</span>';status='把切好的食材倒進鍋子。';
  }else if(stage==='heat'){
    work=`<div class="work-surface ${liquid?'liquid-added':''}" id="workTarget">${cookwareArt(tool,state.ingredients,{fluid:liquid})}${liquid?'<span class="liquid-stream" aria-hidden="true"></span>':''}</div>`;cue=tool==='blender'?'<span>▶</span><b>↓</b><span>🌀</span>':liquid?'<span>🔥</span><b>↑</b><span>🍳</span>':`<span>${tool==='pot'?'💧':'🫒'}</span><b>↓</b><span>🍳</span>`;status=tool==='blender'?'按大按鈕，開啟果汁機。':liquid?'轉開爐火，開始煮菜。':tool==='pot'?'把水倒進湯鍋。':'倒一點油，準備炒菜。';
  }else if(stage==='cook'){
    work=button(`${cookwareArt(tool,state.ingredients,{heat:true,progress:stirs/cookSteps()})}${tool==='blender'?'<span class="blend-control" aria-hidden="true">▶</span>':toolArt(tool==='pan'?'spatula':'spoon')}${hand(tool==='pan'?'flip':tool==='pot'?'stir':'tap')}${dots(stirs,cookSteps())}`,'點或滑動工具來料理','stir',`work-surface cooking-surface ${stirs?'cooking-active':''} ${holding?'holding':''}`,`id="workTarget"`);cue=tool==='pan'?'<span>🍳</span><b>↗</b><span>🔥</span>':tool==='pot'?'<span>🥄</span><b>↻</b><span>🍲</span>':'<span>👆</span><b>↓</b><span>🌀</span>';status=tool==='pan'?'用鍋鏟翻炒，食材會慢慢變金黃。':tool==='pot'?'拿湯匙攪拌，湯正在冒泡泡。':'按住或點大按鈕，把食材打成飲料。';
  }else if(stage==='plate'){
    work=button(`${cookwareArt(tool,state.ingredients,{progress:1,plating:true})}${tool==='blender'?'<span class="pour-arrow" aria-hidden="true">↘</span>':toolArt('ladle')}<span class="plate-preview">${plateArt(state.ingredients,tool,portions)}</span>${hand('pour')}${dots(portions,3)}`,'把料理盛到盤子裡','plate','work-surface plating-surface',`id="workTarget"`);cue=`<span>${tool==='blender'?'🥤':'🥄'}</span><b>→</b><span>🍽️</span>`;status='煮好了！自己把料理盛到盤子或杯子。';
  }else if(stage==='serve'){
    work=button(`${plateArt(state.ingredients,state.method)}<span class="serve-arrow" aria-hidden="true">➜</span>${hand('feed')}`,'點料理或把料理拖給朋友','serve','work-surface made-food',`id="workTarget"`);cue='<span>🍽️</span><b>→</b><span>😋</span>';status='把自己煮好的料理給朋友吃。';
  }else{
    work=`<div class="work-surface meal-shared">${plateArt([],tool,0)}<span>💖</span></div>`;cue='<span>💕</span><span>✨</span><span>💕</span>';status='朋友吃得好開心！下一位朋友要來了。';
  }
  $('scene').innerHTML=work;$('cue').innerHTML=cue;$('liveStatus').textContent=status;
  if(stage==='pick'||stage==='prep'||stage==='celebrate'){
    const entries=Object.entries(foods).slice(page*6,page*6+6);
    $('tray').innerHTML=`<div class="food-shelf ${page===1?'four-foods':''}">${entries.map(([id,f])=>button(`${foodSVG(id)}${state.ingredients.includes(id)?'<i class="selected-check" aria-hidden="true">✓</i>':''}`,f[1],`food:${id}`,`play-food ${state.ingredients.includes(id)?'selected':''}`,`aria-pressed="${state.ingredients.includes(id)}"`)).join('')}</div><div class="shelf-pages">${button('‹','前一層冰箱','page:0','shelf-arrow',page===0?'disabled':'')}<span aria-hidden="true">🧊 <i class="${page===0?'current':''}"></i><i class="${page===1?'current':''}"></i></span>${button('›','下一層冰箱','page:1','shelf-arrow',page===1?'disabled':'')}${stage==='prep'&&['carrot','broccoli','tomato','strawberry','fish'].includes(focusFood)?button('💧','洗洗食材','wash','wash-button'):''}</div>`;
  }else if(stage==='tools'){
    $('tray').innerHTML=`<div class="tool-choices">${Object.entries(methods).map(([id,m],i)=>button(cookwareArt(id,[],{loaded:false})+(i===0?hand():''),m[1],`tool:${id}`,'toy-tool')).join('')}</div>${button('🧺','換食材','ingredients','change-food')}`;
  }else{
    let control='';
    if(stage==='load')control=button(bowlArt(state.ingredients),'把食材倒入鍋子','load','action-control');
    else if(stage==='heat')control=button(tool==='blender'?'▶':liquid?'<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="47" fill="#efdfbf" stroke="#aa9270" stroke-width="7"/><circle cx="60" cy="60" r="30" fill="#a4b9ac" stroke="#7c978d" stroke-width="5"/><path d="M60 60l20-17" stroke="#fff8e6" stroke-width="10" stroke-linecap="round"/><path d="M20 56q0-27 28-37" fill="none" stroke="#cb825f" stroke-width="6"/><path d="M42 11l14 5-9 15" fill="none" stroke="#cb825f" stroke-width="6"/></svg>':liquidArt(tool==='pot'?'water':'oil'),tool==='blender'?'開啟果汁機':liquid?'開火':tool==='pot'?'加水':'加油',tool==='blender'||liquid?'heat':'liquid','action-control recommended');
    else if(stage==='cook')control=button(tool==='blender'?'▶':utensil(tool==='pan'?'spatula':'spoon'),'點或滑動料理工具', 'stir','action-control');
    else if(stage==='plate')control=button(tool==='blender'?liquidArt('water'):utensil('ladle'),'把料理盛到盤子裡','plate','action-control');
    $('tray').innerHTML=`<div class="ingredient-summary" aria-hidden="true">${state.ingredients.slice(0,4).map(id=>foodSVG(id,{piece:true})).join('')}</div>${control.replace('</button>',hand()+'</button>')}${button('🧺','換食材','ingredients','change-food')}`;
  }
}
function animate(symbol='✨'){
  if(reduced)return;
  for(let i=0;i<6;i++){const el=document.createElement('span');el.className='particle';el.textContent=symbol;el.style.left=`${30+Math.random()*40}%`;el.style.top=`${25+Math.random()*45}%`;$('particles').append(el);setTimeout(()=>el.remove(),900);}
}
function hint(){
  if(!started||$('guide').open)return;
  render();$('world').classList.add('hint-replay');
  if(stage==='pick')speak('free-choose','Choose any food you like.');
  else if(stage==='tools')speak('free-tools','You can make soup, cook in the pan, or use the blender.');
  else if(stage==='serve')speak('free-ready','You made it! Share with a friend, or try another tool.');
}
function advancePrep(){focusFood=state.ingredients.find(id=>(prepared[id]||0)<totalPrep(id))||null;stage=focusFood?'prep':'tools';}
function act(action){
  if(!started||stage==='celebrate'||$('guide').open)return;
  const [type,id]=action.split(':');
  if(type==='page'){page=id==='1'?1:0;render();return;}
  if(type==='food'){
    if(toggleFood(state,id)){
      stopKitchenSound();delete prepared[id];tool=null;stirs=0;portions=0;liquid=false;
      if(state.ingredients.includes(id))focusFood=id;else focusFood=state.ingredients.find(food=>(prepared[food]||0)<totalPrep(food))||null;
      stage=!state.ingredients.length?'pick':focusFood?'prep':'tools';render();save();speak(`word-${id}`,`${foods[id][2]}. ${foods[id][2]}.`);
    }
  }else if(type==='wash'&&stage==='prep'){
    $('world').classList.remove('washing');void $('world').offsetWidth;$('world').classList.add('washing');kitchenTap('pour');setTimeout(()=>$('world').classList.remove('washing'),1200);
  }else if(type==='prep'&&stage==='prep'){
    const active=focusFood;prepared[active]=(prepared[active]||0)+1;kitchenTap(totalPrep(active)===2?'pour':'cut');
    if(prepared[active]>=totalPrep(active))advancePrep();render();
  }else if(type==='tool'&&stage==='tools'&&Object.hasOwn(methods,id)){
    tool=id;stirs=0;portions=0;liquid=false;stage='load';render();
  }else if(type==='load'&&stage==='load'){
    stage='heat';render();$('scene').classList.add('just-loaded');kitchenTap('pour');
  }else if(type==='liquid'&&stage==='heat'&&tool!=='blender'){
    liquid=true;render();kitchenTap('pour');
  }else if(type==='heat'&&stage==='heat'&&(liquid||tool==='blender')){
    stage='cook';render();kitchenSound();
  }else if(type==='stir'&&stage==='cook'){
    stirs++;kitchenTap('stir');
    if(stirs>=cookSteps()){stopKitchenSound();stopHold();cook(state,tool);stage='plate';save();}render();
  }else if(type==='plate'&&stage==='plate'){
    portions++;kitchenTap('pour');if(portions>=3){stage='serve';animate();}render();
  }else if(type==='serve'&&stage==='serve'){
    const customer=state.customer;if(!serve(state))return;save();stopKitchenSound();celebratingGuest=customer;stage='celebrate';render();animate('💕');speak('thanks','Yummy! Thank you!');
    setTimeout(()=>{celebratingGuest=null;state.ingredients=[];state.method=null;prepared={};focusFood=null;stirs=0;portions=0;tool=null;liquid=false;stage='pick';save();render();},1800);
  }else if(type==='ingredients'){
    stopKitchenSound();stopHold();state.method=null;prepared={};focusFood=state.ingredients[0]||null;stage=focusFood?'prep':'pick';stirs=0;portions=0;tool=null;liquid=false;save();render();
  }else if(type==='hello'){
    $('friend').classList.remove('wave');void $('friend').offsetWidth;$('friend').classList.add('wave');kitchenTap('stir');
  }
}
function moveUtensil(e){
  const target=$('workTarget');if(!target)return;const bounds=target.getBoundingClientRect();
  const x=Math.max(10,Math.min(85,(e.clientX-bounds.left)/bounds.width*100)),y=Math.max(8,Math.min(75,(e.clientY-bounds.top)/bounds.height*100));
  target.style.setProperty('--tool-x',`${x}%`);target.style.setProperty('--tool-y',`${y}%`);
}
function stopHold(){clearTimeout(holdTimer);holdTimer=null;holding=false;$('world').classList.remove('motor-on');$('workTarget')?.classList.remove('holding');if(tool==='blender')stopKitchenSound();}
function holdBlend(){
  if(!holding||stage!=='cook'||tool!=='blender'||document.hidden||$('guide').open)return;
  if(gesture)gesture.activated=true;act('stir');if(holding)holdTimer=setTimeout(holdBlend,420);
}
$('game').addEventListener('click',e=>{if(suppressClick&&e.detail!==0){suppressClick=false;return;}const b=e.target.closest('[data-action]');if(b)act(b.dataset.action);});
$('game').addEventListener('pointerdown',e=>{
  suppressClick=false;if(!started||stage==='celebrate'||$('guide').open||e.isPrimary===false||e.button>0)return;
  const target=e.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;
  if(!/^(food:|prep$|stir$|plate$|load$|serve$)/.test(action))return;
  gesture={pointer:e.pointerId,action,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,distance:0,moved:false,activated:false,stage,focusFood};$('game').setPointerCapture(e.pointerId);if(!action.startsWith('food:'))moveUtensil(e);
  if(action==='stir'&&stage==='cook'&&tool==='blender'){holding=true;kitchenSound();holdTimer=setTimeout(holdBlend,420);$('world').classList.add('motor-on');}
});
$('game').addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;const g=gesture;g.distance+=Math.hypot(e.clientX-g.lastX,e.clientY-g.lastY);g.lastX=e.clientX;g.lastY=e.clientY;
  if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>14)g.moved=true;
  if(g.action.startsWith('food:')||g.action==='serve'){
    if(!g.moved)return;const ghost=$('dragFood');ghost.hidden=false;ghost.innerHTML=g.action==='serve'?plateArt(state.ingredients,state.method):foodSVG(g.action.split(':')[1]);ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;
  }else{
    moveUtensil(e);
    if(g.moved&&g.distance>=58&&stage===g.stage&&(g.action!=='prep'||focusFood===g.focusFood)&&!(tool==='blender'&&stage==='cook')){g.distance=0;g.activated=true;act(g.action);moveUtensil(e);}
  }
});
function endGesture(e,cancelled=false){
  if(!gesture||e.pointerId!==gesture.pointer)return;const g=gesture;gesture=null;stopHold();$('world').classList.remove('motor-on');$('dragFood').hidden=true;
  if($('game').hasPointerCapture(e.pointerId))$('game').releasePointerCapture(e.pointerId);suppressClick=true;if(cancelled)return;
  if(!g.moved){if(!g.activated)act(g.action);if(stage===g.stage&&!g.action.startsWith('food:'))moveUtensil(e);return;}
  if(g.action.startsWith('food:')){
    const bounds=$('workTarget')?.getBoundingClientRect();if(bounds&&e.clientX>=bounds.left-30&&e.clientX<=bounds.right+30&&e.clientY>=bounds.top-30&&e.clientY<=bounds.bottom+30){const id=g.action.split(':')[1];if(!state.ingredients.includes(id))act(g.action);}
  }else if(g.action==='serve'&&stage==='serve'){
    const bounds=$('guestTarget').getBoundingClientRect();if(e.clientX>=bounds.left-45&&e.clientX<=bounds.right+45&&e.clientY>=bounds.top-45&&e.clientY<=bounds.bottom+45)act('serve');
  }else if(!g.activated&&stage===g.stage&&(g.action!=='prep'||focusFood===g.focusFood))act(g.action);
}
$('game').addEventListener('pointerup',e=>endGesture(e));
$('game').addEventListener('pointercancel',e=>endGesture(e,true));
$('game').addEventListener('lostpointercapture',()=>{gesture=null;stopHold();$('dragFood').hidden=true;});
$('start').onclick=()=>{started=true;$('welcome').classList.add('hidden');render();hint();};
$('voice').onclick=()=>{state.sound=!state.sound;if(!state.sound){narration.stop();stopKitchenSound();}else kitchenSound();$('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));save();};
$('help').onclick=hint;
$('parents').onclick=()=>{$('guide').showModal();narration.stop();stopKitchenSound();stopHold();gesture=null;$('dragFood').hidden=true;};
$('closeGuide').onclick=()=>{$('guide').close();kitchenSound();};
$('guide').addEventListener('close',kitchenSound);
document.addEventListener('visibilitychange',()=>{if(document.hidden){narration.stop();stopKitchenSound();stopHold();audio?.suspend();gesture=null;$('dragFood').hidden=true;}else if(state.sound){audio?.resume();kitchenSound();}});
$('welcomeFood').innerHTML=foodSVG('carrot')+'<span>🍳</span><span>🐰</span><i>💕</i>';
render();$('start').disabled=false;
