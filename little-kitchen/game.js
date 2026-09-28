import {foods,methods,guests,fresh,restore,toggleFood,cook,dish,serve} from './model.js?v=3';
import {createNarrator} from './voice.js?v=3';
const $=id=>document.getElementById(id);
let state=fresh();
try{state=restore(localStorage.getItem('little-bloom-v3'),localStorage.getItem('little-bloom-v2')||localStorage.getItem('little-bloom-v1'));}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')state.sound=false;
let started=false,busy=false,audio,timer,wordTimer,celebrating=false;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify(state));}catch{}}
function getAudioContext(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
const narration=createNarrator({allowed:()=>started&&state.sound&&!document.hidden&&!$('guide').open,getAudioContext,onStatus:mode=>{$('voice').dataset.playback=mode;}});
function speak(key,text){narration.speak(key,text);}
function hint(){
  if(state.scene==='market')speak('free-choose','Choose any food you like.');
  else if(!state.ingredients.length)speak('free-market','What would you like to make? Pick some food at the market.');
  else if(state.method)speak('free-ready','You made it! Share with a friend, or try another tool.');
  else speak('free-tools','You can make soup, cook in the pan, or use the blender.');
}
function chime(){
  if(!state.sound)return;
  try{const c=getAudioContext();if(c.state==='suspended')c.resume();const o=c.createOscillator(),g=c.createGain();o.frequency.value=659;g.gain.setValueAtTime(.012,c.currentTime);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.17);}catch{}
}
function button(content,label,action,cls='',extra=''){
  return `<button class="${cls}" data-action="${action}" aria-label="${label}" ${busy?'disabled':''} ${extra}>${content}</button>`;
}
function ingredientButtons(){return Object.entries(foods).map(([id,f])=>button(`${f[0]}<span class="food-word" lang="en">${f[2]}</span>${state.ingredients.includes(id)?'<span class="selected-check" aria-hidden="true">✓</span>':''}`,f[1],`food:${id}`,`play-food ${state.ingredients.includes(id)?'selected':''}`,`aria-pressed="${state.ingredients.includes(id)}"`)).join('');}
function dishArt(result){
  const bits=result.ingredients.map((id,i)=>`<text x="${28+(i%5)*30}" y="${72+Math.floor(i/5)*29}" font-size="23" text-anchor="middle">${foods[id][0]}</text>`).join('');
  if(result.method==='blender')return `<svg viewBox="0 0 180 150" aria-hidden="true"><path d="M50 23h82l-12 111H62z" fill="#fffcf3" stroke="#b39676" stroke-width="4"/><path d="M57 56h68l-8 72H65z" fill="${result.color}"/><path d="M98 73l12-66h21" fill="none" stroke="#d48691" stroke-width="7" stroke-linecap="round"/><path d="M72 65l4 46" stroke="#ffffff88" stroke-width="5" stroke-linecap="round"/><text x="94" y="109" font-size="36" text-anchor="middle">${foods[result.ingredients[0]][0]}</text></svg>`;
  if(result.method==='pan')return `<svg viewBox="0 0 180 150" aria-hidden="true"><ellipse cx="90" cy="104" rx="82" ry="34" fill="#fffaf0" stroke="#d9bd91" stroke-width="4"/><text x="90" y="105" font-size="91" text-anchor="middle">${result.icon}</text>${result.ingredients.slice(0,5).map((id,i)=>`<text x="${34+i*28}" y="139" font-size="20" text-anchor="middle">${foods[id][0]}</text>`).join('')}</svg>`;
  return `<svg viewBox="0 0 180 150" aria-hidden="true"><ellipse cx="90" cy="107" rx="85" ry="29" fill="#dab98e"/><path d="M8 67h164c-8 63-36 73-82 73S16 130 8 67" fill="${result.method==='pot'?'#fff2db':'#fff9ec'}" stroke="#cba77d" stroke-width="3"/><ellipse cx="90" cy="69" rx="81" ry="32" fill="${result.color}" stroke="#fff6df" stroke-width="5"/>${bits}<path d="M60 21q-10-9 0-16m30 16q-10-9 0-16m30 16q-10-9 0-16" stroke="#ffffffbb" fill="none" stroke-width="4" stroke-linecap="round"/></svg>`;
}
function render(){
  const result=dish(state),market=state.scene==='market';
  $('wordBubble')?.remove();
  $('world').className=`${market?'market':'kitchen'} free-play ${result?'has-dish':''}`;
  $('sceneTitle').innerHTML=`<i>${market?'🧺':'🍳'}</i><span>${market?'挑自己喜歡的':'我的小廚房'}</span>`;
  $('ticket').hidden=true;
  $('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));
  $('nav').innerHTML=button('🧺','去市場挑食材','scene:market',`play-place ${market?'active':''}`,`aria-pressed="${market}"`)+button('🍳','回我的小廚房','scene:kitchen',`play-place ${!market?'active':''}`,`aria-pressed="${!market}"`);
  if(market){
    $('scene').innerHTML=`<div class="free-market-shelf">${ingredientButtons()}</div>`;
    $('tray').innerHTML=`<div class="basket-label" aria-hidden="true">🧺</div><div class="chosen-foods">${state.ingredients.length?state.ingredients.map(id=>button(foods[id][0],`放回${foods[id][1]}`,`food:${id}`,'chosen-food')).join(''):'<span class="empty-basket" aria-hidden="true">♡</span>'}</div>${button('🍳 →','選好了，回廚房','scene:kitchen','kitchen-go')}`;
    $('liveStatus').textContent='想拿什麼就點什麼，再點一次可以放回。';
  }else{
    const customer=`<div class="customer ${celebrating?'happy':''}" style="background-position:${state.customer*100/3}% center" role="img" aria-label="${guests[state.customer]}"></div><div class="bubble">${celebrating?'💕':'😊'}</div>`;
    const counter=result?button(dishArt(result),`請朋友吃${result.name}`,'serve','made-food',`id="mainAction"`):`<div class="free-prep ${state.ingredients.length?'':'empty'}">${state.ingredients.length?state.ingredients.map(id=>`<span>${foods[id][0]}</span>`).join(''):'🍽️'}</div>`;
    $('scene').innerHTML=customer+counter+(result?`<div class="dish-label">${result.icon} ${result.name}</div>`:'');
    $('tray').innerHTML=`<div class="toy-tools">${Object.entries(methods).map(([id,m])=>button(`<span>${m[0]}</span>`,m[1],`cook:${id}`,`toy-tool ${state.method===id?'selected':''}`,`aria-pressed="${state.method===id}"`)).join('')}</div><div class="counter-foods">${state.ingredients.length?state.ingredients.map(id=>button(foods[id][0],`拿走${foods[id][1]}`,`food:${id}`,'counter-food')).join(''):button('🧺 ＋','去市場拿食材','scene:market','get-food')}${state.ingredients.length?button('＋ 🧺','再加別的食材','scene:market','add-food'):''}</div>`;
    $('liveStatus').textContent=result?'可以請朋友吃，也可以換工具試試。':'選喜歡的工具來煮，想加食材就去市場。';
  }
}
function animate(symbol='✨'){
  if(reduced)return;
  for(let i=0;i<5;i++){const el=document.createElement('span');el.className='particle';el.textContent=symbol;el.style.left=`${25+Math.random()*35}%`;el.style.top=`${55+Math.random()*15}%`;$('particles').append(el);setTimeout(()=>el.remove(),1150);}
}
function learnWord(id){
  const f=foods[id];
  speak(`word-${id}`,`${f[2]}. ${f[2]}.`);
  clearTimeout(wordTimer);
  $('wordBubble')?.remove();
  const el=document.createElement('div');el.id='wordBubble';el.className='word-bubble';
  el.innerHTML=`<span class="word-picture">${f[0]}</span><span lang="en">${f[2]}<small>${f[1]}</small></span>`;
  $('world').append(el);
  wordTimer=setTimeout(()=>el.remove(),2400);
}
function act(action){
  if(!started||busy||$('guide').open)return;
  const [type,id]=action.split(':');
  if(type==='scene'){
    if(!['market','kitchen'].includes(id))return;
    state.scene=id;celebrating=false;render();save();hint();return;
  }
  if(type==='food'){
    if(toggleFood(state,id)){celebrating=false;render();save();learnWord(id);}
    return;
  }
  if(type==='cook'){
    if(!cook(state,id)){
      speak('free-market','What would you like to make? Pick some food at the market.');
      $('nav').querySelector('[data-action="scene:market"]')?.classList.add('hint-replay');return;
    }
    celebrating=false;busy=true;save();render();
    $('world').classList.add('cooking-now');animate(id==='blender'?'🫧':'✨');chime();
    timer=setTimeout(()=>{busy=false;render();speak('free-ready','You made it! Share with a friend, or try another tool.');},reduced?350:750);
    return;
  }
  if(type==='serve'){
    const previousGuest=state.customer;
    if(!serve(state))return;
    save();busy=true;celebrating=true;
    // Briefly keep the friend who tasted the food, then welcome another friend.
    const nextGuest=state.customer;state.customer=previousGuest;render();state.customer=nextGuest;
    animate('💕');speak('thanks','Yummy! Thank you!');
    timer=setTimeout(()=>{busy=false;celebrating=false;render();},1600);
  }
}
$('game').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)act(b.dataset.action);});
$('start').onclick=()=>{started=true;$('welcome').classList.add('hidden');render();hint();};
$('voice').onclick=()=>{state.sound=!state.sound;if(!state.sound)narration.stop();$('voice').textContent=state.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(state.sound));save();if(state.sound&&!busy)hint();};
$('help').onclick=()=>{if(!busy)hint();};
$('parents').onclick=()=>{$('guide').showModal();narration.stop();};
$('closeGuide').onclick=()=>$('guide').close();
document.addEventListener('visibilitychange',()=>{if(document.hidden){narration.stop();audio?.suspend();}else if(state.sound)audio?.resume();});
render();$('start').disabled=false;
