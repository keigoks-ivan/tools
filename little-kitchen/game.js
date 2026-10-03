import {foods,methods,guests,fresh,restore,toggleFood,cook,dish,serve} from './model.js?v=3';
import {createNarrator} from './voice.js?v=3';
const $=id=>document.getElementById(id);
let state=fresh();
try{state=restore(localStorage.getItem('little-bloom-v3'),localStorage.getItem('little-bloom-v2')||localStorage.getItem('little-bloom-v1'));}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')state.sound=false;
// Partial gestures are ephemeral: returning always shows a usable work surface.
state.scene='kitchen';
let stage=state.method?'serve':state.ingredients.length?'prep':'pick';
let started=false,prep=0,stirs=0,tool=null,audio,gesture=null,suppressClick=false,celebratingGuest=null;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify(state));}catch{}}
function getAudioContext(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
const narration=createNarrator({allowed:()=>started&&state.sound&&!document.hidden&&!$('guide').open,getAudioContext,onStatus:mode=>{$('voice').dataset.playback=mode;}});
function speak(key,text){narration.speak(key,text);}
function chime(high=false){
  if(!state.sound)return;
  try{const c=getAudioContext();if(c.state==='suspended')c.resume();const o=c.createOscillator(),g=c.createGain();o.frequency.value=high?784:523;g.gain.setValueAtTime(.025,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.13);o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(c.currentTime+.14);}catch{}
}
function button(content,label,action,cls='',extra=''){
  return `<button class="${cls}" data-action="${action}" aria-label="${label}" ${stage==='celebrate'?'disabled':''} ${extra}>${content}</button>`;
}
function hand(mode='tap'){return `<span class="demo-hand ${mode}">👆</span>`;}
function dots(done,total){return `<div class="action-dots" aria-hidden="true">${Array.from({length:total},(_,i)=>`<i class="${i<done?'done':''}"></i>`).join('')}</div>`;}
function foodArt(cut=false){
  return state.ingredients.map((id,i)=>{
    const f=foods[id],liquid=['milk','flour'].includes(id);
    return `<span class="board-food ${cut&&!liquid?'cut':''} ${cut&&liquid?'poured':''}" style="--food-color:${f[3]};--tilt:${i%2?9:-8}deg">${cut&&!liquid?Array.from({length:Math.min(prep+1,3)},()=>`<span>${f[0]}</span>`).join(''):f[0]}</span>`;
  }).join('');
}
function dishArt(result){
  const bits=result.ingredients.slice(0,6).map((id,i)=>`<text x="${44+(i%3)*46}" y="${76+Math.floor(i/3)*29}" font-size="28" text-anchor="middle">${foods[id][0]}</text>`).join('');
  if(result.method==='blender')return `<svg viewBox="0 0 180 150" aria-hidden="true"><path d="M50 23h82l-12 111H62z" fill="#fffcf3" stroke="#b39676" stroke-width="4"/><path d="M57 56h68l-8 72H65z" fill="${result.color}"/><path d="M98 73l12-66h21" fill="none" stroke="#d48691" stroke-width="7" stroke-linecap="round"/><path d="M72 65l4 46" stroke="#ffffff88" stroke-width="5" stroke-linecap="round"/><text x="94" y="109" font-size="36" text-anchor="middle">${foods[result.ingredients[0]][0]}</text></svg>`;
  if(result.method==='pan')return `<svg viewBox="0 0 180 150" aria-hidden="true"><ellipse cx="90" cy="104" rx="82" ry="34" fill="#fffaf0" stroke="#d9bd91" stroke-width="4"/><text x="90" y="105" font-size="91" text-anchor="middle">${result.icon}</text>${result.ingredients.slice(0,5).map((id,i)=>`<text x="${34+i*28}" y="139" font-size="20" text-anchor="middle">${foods[id][0]}</text>`).join('')}</svg>`;
  return `<svg viewBox="0 0 180 150" aria-hidden="true"><path d="M8 67h164c-8 63-36 73-82 73S16 130 8 67" fill="#fff2db" stroke="#cba77d" stroke-width="3"/><ellipse cx="90" cy="69" rx="81" ry="32" fill="${result.color}" stroke="#fff6df" stroke-width="5"/>${bits}<path d="M60 21q-10-9 0-16m30 16q-10-9 0-16m30 16q-10-9 0-16" stroke="#dbb588" fill="none" stroke-width="4" stroke-linecap="round"/></svg>`;
}
function render(){
  $('world').className=`stage-${stage}`;
  $('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));
  const step=['pick','prep','tools','cook','serve','celebrate'].indexOf(stage);
  $('journey').innerHTML=['🥕','🔪','🍲','🐰'].map((icon,i)=>`<span class="journey-stop ${i<(step<2?step:step<4?2:3)?'done':''} ${i===(step<2?step:step<4?2:3)?'current':''}" ${i===(step<2?step:step<4?2:3)?'aria-current="step"':''} aria-label="${['挑食材','準備食材','下廚','餵朋友'][i]}">${icon}</span>${i<3?'<span class="journey-arrow" aria-hidden="true">›</span>':''}`).join('');
  const guest=celebratingGuest??state.customer;
  $('friend').innerHTML=`${button(`<span class="guest-art" style="background-position:${guest*100/3}% center"></span>`,stage==='serve'?'餵朋友':guests[guest],stage==='serve'?'serve':'hello',`friend-button ${stage==='celebrate'?'happy':''}`,`id="guestTarget"`)}<span class="friend-bubble" aria-hidden="true">${stage==='celebrate'?'💕':stage==='serve'?'😋':stage==='cook'?'🤩':'😊'}</span>`;
  let work='',cue='',status='';
  if(stage==='pick'){
    work=`<div class="work-board empty" id="workTarget"><span class="board-outline" aria-hidden="true">🥕</span><span class="drop-plus" aria-hidden="true">＋</span></div>`;
    cue=`<span>🥕</span><b>↓</b><span>🪵</span>`;status='點一個食材，放到砧板上。';
  }else if(stage==='prep'||stage==='tools'){
    const cut=stage==='tools';
    work=button(`<span class="board-foods">${foodArt(cut||prep>0)}</span>${!cut?`<span class="prep-utensil" aria-hidden="true">${state.ingredients.every(id=>['milk','flour'].includes(id))?'🥣':'🔪'}</span>${hand('slice')}${dots(prep,3)}`:'<span class="board-sparkle" aria-hidden="true">✨</span>'}`,cut?'食材準備好了':'點或滑動砧板準備食材',cut?'hint':'prep',`work-board ${prep?'part-cut':''}`,`id="workTarget"`);
    cue=cut?'<span>🍲</span><span>🍳</span><span>🥤</span>':`<span>${state.ingredients.every(id=>['milk','flour'].includes(id))?'🥛':'🔪'}</span><b>↓</b><span>🥕</span>`;
    status=cut?'食材準備好了，選一個大工具。':`點砧板或在上面滑動，準備食材。已完成 ${prep} 下。`;
  }else if(stage==='cook'){
    work=button(`<span class="cooker cooker-${tool}" style="--progress:${stirs/5};--meal-color:${dish({...state,method:tool}).color}"><span class="cooker-body">${methods[tool][0]}</span><span class="cooker-foods">${state.ingredients.slice(0,4).map(id=>`<i>${foods[id][0]}</i>`).join('')}</span><span class="cooker-utensil" aria-hidden="true">${tool==='blender'?'🫧':'🥄'}</span></span>${hand(tool==='blender'?'tap':'stir')}${dots(stirs,5)}`,'點或滑動工具來料理','stir','cook-action',`id="workTarget"`);
    cue=`<span>${methods[tool][0]}</span><b>↻</b><span>✨</span>`;status=`點工具或滑動攪拌，已完成 ${stirs} 下。`;
  }else if(stage==='serve'){
    work=button(`${dishArt(dish(state))}<span class="serve-arrow" aria-hidden="true">➜</span>${hand('feed')}`,'點料理或把料理拖給朋友','serve','made-food',`id="workTarget"`);
    cue='<span>🍽️</span><b>→</b><span>😋</span>';status='料理好了！點料理或朋友，或把料理拖給朋友。';
  }else{
    work='<div class="meal-shared" aria-hidden="true">🍽️<span>💖</span></div>';
    cue='<span>💕</span><span>✨</span><span>💕</span>';status='朋友吃得好開心！下一位朋友要來了。';
  }
  $('scene').innerHTML=work;$('cue').innerHTML=cue;$('liveStatus').textContent=status;
  if(stage==='tools'){
    $('tray').innerHTML=`<div class="tool-choices">${Object.entries(methods).map(([id,m],i)=>button(`<span class="tool-picture">${m[0]}</span><span class="tool-preview" aria-hidden="true">${['🫧','🔥','🌀'][i]}</span>${i===0?hand():''}`,m[1],`tool:${id}`,'toy-tool')).join('')}</div>${button('🧺','換食材','ingredients','change-food')}`;
  }else if(stage==='cook'||stage==='serve'){
    $('tray').innerHTML=`<div class="ingredient-summary" aria-hidden="true">${state.ingredients.map(id=>`<span>${foods[id][0]}</span>`).join('')}</div>${button('🧺','換食材','ingredients','change-food')}`;
  }else{
    $('tray').innerHTML=`<div class="food-shelf">${Object.entries(foods).map(([id,f],i)=>button(`<span>${f[0]}</span>${state.ingredients.includes(id)?'<i class="selected-check" aria-hidden="true">✓</i>':''}${stage==='pick'&&i===0?hand():''}`,f[1],`food:${id}`,`play-food ${state.ingredients.includes(id)?'selected':''}`,`aria-pressed="${state.ingredients.includes(id)}"`)).join('')}</div>`;
  }
}
function animate(symbol='✨'){
  if(reduced)return;
  for(let i=0;i<7;i++){const el=document.createElement('span');el.className='particle';el.textContent=symbol;el.style.left=`${30+Math.random()*45}%`;el.style.top=`${30+Math.random()*30}%`;$('particles').append(el);setTimeout(()=>el.remove(),1000);}
}
function hint(){
  if(!started||$('guide').open)return;
  $('world').classList.remove('hint-replay');render();$('world').classList.add('hint-replay');
  if(stage==='pick')speak('free-choose','Choose any food you like.');
  else if(stage==='tools')speak('free-tools','You can make soup, cook in the pan, or use the blender.');
  else if(stage==='serve')speak('free-ready','You made it! Share with a friend, or try another tool.');
}
function act(action){
  if(!started||stage==='celebrate'||$('guide').open)return;
  const [type,id]=action.split(':');
  if(type==='food'){
    if(toggleFood(state,id)){
      prep=0;stirs=0;tool=null;stage=state.ingredients.length?'prep':'pick';render();save();
      speak(`word-${id}`,`${foods[id][2]}. ${foods[id][2]}.`);chime();
    }
  }else if(type==='prep'&&stage==='prep'){
    prep++;chime();if(prep>=3){stage='tools';animate();}render();
  }else if(type==='tool'&&stage==='tools'&&Object.hasOwn(methods,id)){
    tool=id;stirs=0;stage='cook';render();chime();
  }else if(type==='stir'&&stage==='cook'){
    stirs++;chime();if(stirs>=5){cook(state,tool);stage='serve';save();animate();speak('free-ready','You made it! Share with a friend, or try another tool.');}render();
  }else if(type==='serve'&&stage==='serve'){
    const customer=state.customer;if(!serve(state))return;
    save();celebratingGuest=customer;stage='celebrate';render();animate('💕');speak('thanks','Yummy! Thank you!');
    setTimeout(()=>{
      celebratingGuest=null;state.ingredients=[];state.method=null;prep=0;stirs=0;tool=null;stage='pick';save();render();
    },1800);
  }else if(type==='ingredients'){
    state.method=null;stage=state.ingredients.length?'prep':'pick';prep=0;stirs=0;tool=null;save();render();
  }else if(type==='hello'){
    $('friend').classList.remove('wave');void $('friend').offsetWidth;$('friend').classList.add('wave');chime(true);
  }else if(type==='hint')hint();
}
$('game').addEventListener('click',e=>{
  if(suppressClick&&e.detail!==0){suppressClick=false;return;}
  const b=e.target.closest('[data-action]');if(b)act(b.dataset.action);
});
// All gestures have a large tap equivalent. Track one pointer and never require a precise path.
$('game').addEventListener('pointerdown',e=>{
  suppressClick=false;
  if(!started||stage==='celebrate'||$('guide').open||e.isPrimary===false||e.button>0)return;
  const target=e.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action;
  if(!/^(food:|prep$|stir$|serve$)/.test(action))return;
  gesture={pointer:e.pointerId,action,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,distance:0,moved:false,activated:false,stage};
  $('game').setPointerCapture(e.pointerId);
});
$('game').addEventListener('pointermove',e=>{
  if(!gesture||e.pointerId!==gesture.pointer)return;
  const g=gesture,dx=e.clientX-g.lastX,dy=e.clientY-g.lastY;
  g.distance+=Math.hypot(dx,dy);g.lastX=e.clientX;g.lastY=e.clientY;
  if(Math.hypot(e.clientX-g.x,e.clientY-g.y)>14)g.moved=true;
  if(!g.moved)return;
  if(g.action.startsWith('food:')||g.action==='serve'){
    const ghost=$('dragFood');ghost.hidden=false;ghost.textContent=g.action==='serve'?dish(state)?.icon||'🍽️':foods[g.action.split(':')[1]][0];ghost.style.left=`${e.clientX}px`;ghost.style.top=`${e.clientY}px`;
  }else if(g.distance>=48&&stage===g.stage){
    g.distance=0;g.activated=true;act(g.action);
  }
});
function endGesture(e,cancelled=false){
  if(!gesture||e.pointerId!==gesture.pointer)return;
  const g=gesture;gesture=null;$('dragFood').hidden=true;
  if($('game').hasPointerCapture(e.pointerId))$('game').releasePointerCapture(e.pointerId);
  suppressClick=true;
  if(cancelled)return;
  if(!g.moved){act(g.action);return;}
  if(g.action.startsWith('food:')){
    const bounds=$('workTarget')?.getBoundingClientRect();
    if(bounds&&e.clientX>=bounds.left-30&&e.clientX<=bounds.right+30&&e.clientY>=bounds.top-30&&e.clientY<=bounds.bottom+30){
      // Dropping a selected food on the board should keep it there, not remove it.
      const id=g.action.split(':')[1];if(!state.ingredients.includes(id))act(g.action);
    }
  }else if(g.action==='serve'&&stage==='serve'){
    const bounds=$('guestTarget').getBoundingClientRect();
    if(e.clientX>=bounds.left-45&&e.clientX<=bounds.right+45&&e.clientY>=bounds.top-45&&e.clientY<=bounds.bottom+45)act('serve');
  }else if(!g.activated&&stage===g.stage){
    act(g.action);
  }
}
$('game').addEventListener('pointerup',e=>endGesture(e));
$('game').addEventListener('pointercancel',e=>endGesture(e,true));
$('game').addEventListener('lostpointercapture',()=>{gesture=null;$('dragFood').hidden=true;});
$('start').onclick=()=>{started=true;$('welcome').classList.add('hidden');render();hint();};
$('voice').onclick=()=>{state.sound=!state.sound;if(!state.sound)narration.stop();$('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));save();if(state.sound)hint();};
$('help').onclick=hint;
$('parents').onclick=()=>{$('guide').showModal();narration.stop();gesture=null;$('dragFood').hidden=true;};
$('closeGuide').onclick=()=>$('guide').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden){narration.stop();audio?.suspend();gesture=null;$('dragFood').hidden=true;}else if(state.sound)audio?.resume();});
render();$('start').disabled=false;
