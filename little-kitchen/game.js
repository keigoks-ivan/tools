import {foods,recipes,steps,guests,fresh,restore,current,nextAction,advance} from './model.js?v=2';
import {createNarrator} from './voice.js?v=2';
const $=id=>document.getElementById(id);
let state=fresh();
try {state=restore(localStorage.getItem('little-bloom-v2'),localStorage.getItem('little-bloom-v1'));} catch {}
let started=false, busy=false, transitionTimer, celebrationTimer, audio;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){try{localStorage.setItem('little-bloom-v2',JSON.stringify(state));}catch{}}
function getAudioContext(){
  audio??=new(window.AudioContext||window.webkitAudioContext)();
  return audio;
}
const narration=createNarrator({
  allowed:()=>started&&state.sound&&!document.hidden&&!$('guide').open,
  getAudioContext,
  onStatus:mode=>{$('voice').dataset.playback=mode;}
});
function speak(key,text){narration.speak(key,text);}
function chime(happy=false){
  if(!state.sound)return;
  try {
    audio??=new(window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume();
    (happy?[0,.14,.28]:[0]).forEach((t,i)=>{
      const o=audio.createOscillator(),g=audio.createGain();
      o.type='sine'; o.frequency.value=[523,659,784][i];
      g.gain.setValueAtTime(.0001,audio.currentTime+t);
      g.gain.exponentialRampToValueAtTime(.012,audio.currentTime+t+.02);
      g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+t+.24);
      o.connect(g);g.connect(audio.destination);o.start(audio.currentTime+t);o.stop(audio.currentTime+t+.26);
    });
  }catch{}
}
function sceneName(){return state.phase==='market'?'market':state.phase==='cook'?'kitchen':'shop';}
function hint(){
  const r=current(state);
  switch(state.phase){
    case 'order': speak(`order-${state.recipe}`,`Let's make ${r.en}. Tap the basket.`);break;
    case 'market': speak(`food-${r.items[state.ingredient]}`,`Tap the ${foods[r.items[state.ingredient]][2]}.`);break;
    case 'cook': speak(`step-${r.steps[state.step]}`,steps[r.steps[state.step]][2]);break;
    case 'serve': speak('ready','All done! Tap the food.');break;
    case 'thanks': speak('thanks','Yummy! Thank you!');break;
  }
}
function actionButton(content,label,cls=''){
  return `<button id="mainAction" class="child-action ${cls}" data-action="${nextAction(state)}" aria-label="${label}" ${busy?'disabled':''}>${content}<span class="hint-hand" aria-hidden="true">👆</span></button>`;
}
function guest(){
  return `<div class="customer ${state.phase==='thanks'?'happy':''}" style="background-position:${state.customer*100/3}% center" role="img" aria-label="${guests[state.customer]}"></div>`;
}
function render(focus=false){
  const r=current(state),scene=sceneName();
  $('world').className=`${scene} simple ${state.phase}`;
  const title=state.phase==='order'?['🍽️','朋友來囉']:{market:['🧺','一起買菜'],kitchen:['🍳','一起做菜'],shop:['🍽️','請朋友吃']}[scene];
  $('sceneTitle').innerHTML=`<i>${title[0]}</i><span>${title[1]}</span>`;
  $('voice').textContent=state.sound?'🔊':'🔇';
  $('voice').setAttribute('aria-pressed',String(state.sound));
  $('ticket').innerHTML=state.phase==='market'?`<span class="ticket-dish">🧺</span><span class="ticket-items">${r.items.map((id,i)=>`<span class="need ${i<state.ingredient?'have':''}">${i<state.ingredient?foods[id][0]:'·'}</span>`).join('')}</span>`:'';
  $('ticket').hidden=state.phase!=='market';
  $('nav').innerHTML=['🧺','🍳','🍽️'].map((icon,i)=>`<span class="path-stop ${i===({order:0,market:0,cook:1,serve:2,thanks:2}[state.phase])?'active':''}" aria-label="${['買菜','料理','送餐'][i]}">${icon}</span>${i<2?'<span class="path-arrow" aria-hidden="true">›</span>':''}`).join('');
  let instruction='',cue='';
  if(state.phase==='order'){
    $('scene').innerHTML=guest()+`<div class="bubble">${r.icon}</div>`+actionButton('🧺','去買菜','basket-action');
    instruction='點籃子，一起去買菜';cue='👆 🧺';
  }else if(state.phase==='market'){
    const id=r.items[state.ingredient];
    $('scene').innerHTML=`<div class="market-focus">${actionButton(foods[id][0],`拿${foods[id][1]}`,'ingredient-action')}<div class="stall-awning" aria-hidden="true"></div></div><div class="basket-target" aria-hidden="true">🧺</div>`;
    instruction=`點${foods[id][1]}，放進籃子`;cue=`${foods[id][0]} <span>→</span> 🧺`;
  }else if(state.phase==='cook'){
    const step=r.steps[state.step];
    $('scene').innerHTML=`<div class="prep-food" aria-hidden="true">${r.items.map(id=>`<span>${foods[id][0]}</span>`).join('')}</div>`+actionButton(`<span class="single-tool">${steps[step][0]}</span>`,steps[step][1],`cooking-action ${step}`);
    instruction=`${steps[step][1]}，點一下就好`;cue=`👆 ${steps[step][0]}`;
  }else if(state.phase==='serve'){
    $('scene').innerHTML=guest()+`<div class="bubble">😋</div>`+actionButton(r.icon,'請朋友吃','dish-action');
    instruction='點料理，請朋友吃';cue=`${r.icon} <span>→</span> 💕`;
  }else{
    $('scene').innerHTML=guest()+`<div class="bubble">💕</div><div class="thank-you" aria-hidden="true">🌼 ✨ 🌼</div>`;
    instruction='謝謝你，好好吃！';cue='💕';
  }
  $('tray').innerHTML=`<div class="one-step-cue" aria-hidden="true">${cue}</div><p class="one-step-caption">${instruction}</p>`;
  $('liveStatus').textContent=instruction;
  if(focus)$('mainAction')?.focus({preventScroll:true});
}
function celebrate(){
  if(reduced)return;
  for(let i=0;i<7;i++){
    const el=document.createElement('span');el.className='particle';el.textContent=i%2?'🌼':'💕';
    el.style.left=`${35+Math.random()*40}%`;el.style.top=`${45+Math.random()*20}%`;
    $('particles').append(el);setTimeout(()=>el.remove(),1150);
  }
}
function scheduleNextGuest(){
  clearTimeout(celebrationTimer);
  if(!started||state.phase!=='thanks'||document.hidden||$('guide').open)return;
  celebrationTimer=setTimeout(()=>{
    if(document.hidden||$('guide').open)return;
    if(advance(state,'continue')){save();render();hint();}
  },2600);
}
function act(action){
  if(!started||busy||$('guide').open||action==='continue')return;
  const oldPhase=state.phase;
  if(!advance(state,action))return;
  // Persist immediately, while the old target animates and rejects repeat taps.
  busy=true;save();
  const target=$('mainAction');
  if(target){target.disabled=true;target.classList.add('working');}
  $('world').classList.add('doing-action');
  chime(oldPhase==='serve');
  if(oldPhase==='serve')celebrate();
  transitionTimer=setTimeout(()=>{
    busy=false;render(true);hint();
    if(state.phase==='thanks'){celebrate();scheduleNextGuest();}
  },reduced?450:900);
}
$('scene').addEventListener('click',e=>{
  const button=e.target.closest('[data-action]');
  if(button)act(button.dataset.action);
});
$('start').onclick=()=>{
  started=true;$('welcome').classList.add('hidden');
  render(true);hint();scheduleNextGuest();
};
$('voice').onclick=()=>{
  state.sound=!state.sound;
  if(!state.sound)narration.stop();
  $('voice').textContent=state.sound?'🔊':'🔇';
  $('voice').setAttribute('aria-pressed',String(state.sound));
  save();if(state.sound&&!busy)hint();
};
$('help').onclick=()=>{
  if(busy)return;hint();
  $('mainAction')?.classList.remove('hint-replay');
  requestAnimationFrame(()=>$('mainAction')?.classList.add('hint-replay'));
};
$('parents').onclick=()=>{
  $('guide').showModal();clearTimeout(celebrationTimer);
  narration.stop();
};
$('closeGuide').onclick=()=>$('guide').close();
$('guide').addEventListener('close',()=>{scheduleNextGuest();if(started&&!busy)hint();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    narration.stop();
    audio?.suspend();clearTimeout(celebrationTimer);
  }else{if(state.sound)audio?.resume();scheduleNextGuest();}
});
render();

$('start').disabled=false;
