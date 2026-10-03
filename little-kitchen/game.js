import {foods,guests,fresh,restore} from './model.js?v=3';
import {createNarrator} from './voice.js?v=3';
import {foodSVG,utensil,boardArt,cookwareArt,plateArt} from './art.js?v=5';
import {createWorkshop,addFood,cutFood,hitPiece,transferToCooker,addLiquid,pushFood,tossFood,plateFood,stepWorkshop} from './simulation.js?v=6';
import {createRenderer} from './renderer.js?v=6';
const $=id=>document.getElementById(id),s=createWorkshop();
let prefs=fresh();try{prefs=restore(localStorage.getItem('little-bloom-v3'),localStorage.getItem('little-bloom-v2')||localStorage.getItem('little-bloom-v1'));}catch{}
if(new URLSearchParams(location.search).get('muted')==='1')prefs.sound=false;
let started=false,page=0,activeTool='knife',gesture=null,pointer=null,selected=null,renderer=null,lastTime=null,time=0,celebrating=false,transferTimer=null,logicalHeight=540;
let audio,loop=null,loopKind='',hintUntil=0;
const canvas=$('worktop'),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function save(){try{localStorage.setItem('little-bloom-v3',JSON.stringify({...prefs,scene:'kitchen',ingredients:[],method:null}));}catch{}}
function getAudioContext(){audio??=new(window.AudioContext||window.webkitAudioContext)();return audio;}
const narrator=createNarrator({allowed:()=>started&&prefs.sound&&!document.hidden&&!$('guide').open,getAudioContext});
function tone(kind='cut'){
  if(!started||!prefs.sound||document.hidden||$('guide').open)return;
  try{const c=getAudioContext();c.resume();const o=c.createOscillator(),g=c.createGain();o.type='triangle';o.frequency.setValueAtTime(kind==='cut'?175:kind==='pour'?390:240,c.currentTime);o.frequency.exponentialRampToValueAtTime(70,c.currentTime+.12);g.gain.setValueAtTime(.045,c.currentTime);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.16);o.connect(g);g.connect(c.destination);o.onended=()=>{o.disconnect();g.disconnect();};o.start();o.stop(c.currentTime+.17);}catch{}
}
function stopSound(){try{loop?.stop();loop?.disconnect();}catch{}loop=null;loopKind='';}
function updateSound(){
  const kind=started&&prefs.sound&&!document.hidden&&!$('guide').open&&s.station==='stove'&&s.vessels[s.method].length?(s.blending?'blender':s.heat[s.method]?s.method:''):'';
  if(kind===loopKind)return;stopSound();if(!kind)return;
  try{const c=getAudioContext();c.resume();const g=c.createGain();g.gain.value=.025;g.connect(c.destination);
    if(kind==='blender'){const o=c.createOscillator();o.type='sawtooth';o.frequency.value=80;o.connect(g);o.onended=()=>g.disconnect();o.start();loop=o;}
    else{const buffer=c.createBuffer(1,c.sampleRate,c.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*.25;const source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=buffer;source.loop=true;filter.type='lowpass';filter.frequency.value=kind==='pan'?2100:650;source.connect(filter);filter.connect(g);source.onended=()=>{filter.disconnect();g.disconnect();};source.start();loop=source;}loopKind=kind;
  }catch{}
}
const fridgeIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="21" y="9" width="60" height="84" rx="10" fill="#a7cbbb" stroke="#609589" stroke-width="5"/><path d="M23 40h56" stroke="#609589" stroke-width="5"/><path d="M31 22v10m0 19v20" stroke="#fff3d6" stroke-width="6" stroke-linecap="round"/><path d="M35 93v5m32-5v5" stroke="#609589" stroke-width="6"/></svg>';
const handIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M28 53V32q0-11 9-9 7 1 7 13V17q0-14 11-10 5 2 5 17v15-18q0-9 10-6 5 3 5 13v16-10q0-8 8-5 6 2 6 14v26q-2 22-23 25H49q-14-4-21-17L12 57q-6-9 3-12 7-2 13 8" fill="#edbb86" stroke="#b88959" stroke-width="4"/></svg>';
const waterIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M22 24h51l-4 64H28Z" fill="#cde7df" stroke="#709f9e" stroke-width="4"/><path d="M74 31q35 0 15 38H71" fill="none" stroke="#709f9e" stroke-width="6"/><path d="M27 48h42l-4 34H31Z" fill="#88c8db"/><path d="M35 29v29" stroke="#fffce8" stroke-width="6"/></svg>';
const oilIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M39 20h24v15l15 22v33H24V57l15-22Z" fill="#dce5b7" stroke="#8ea36b" stroke-width="4"/><path d="M29 60h44v26H29Z" fill="#e7ba4f"/><rect x="36" y="9" width="30" height="13" rx="4" fill="#78986c"/><path d="M49 64q-18 22 3 22 21 0 3-22" fill="#ffe395"/></svg>';
const saltIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 36h42l7 53H23Z" fill="#faf0d8" stroke="#b3a17c" stroke-width="4"/><path d="M28 36v-8q21-17 45 0v8Z" fill="#9caaa4" stroke="#718a82" stroke-width="4"/><g fill="#edf2df"><circle cx="40" cy="28" r="3"/><circle cx="51" cy="24" r="3"/><circle cx="62" cy="28" r="3"/></g><path d="M37 64h25m-22 9h20" stroke="#d8c6a0" stroke-width="5"/></svg>';
const washIcon='<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M13 74V29q0-16 17-16h28q18 0 18 17v12H60V29H31v45" fill="#acccc1" stroke="#7aa297" stroke-width="5"/><path d="M64 48v12m12-12v20m-7 1v15" stroke="#89c7db" stroke-width="6" stroke-linecap="round"/></svg>';
function icon(kind){return kind==='fridge'?fridgeIcon:kind==='board'?boardArt('carrot',0):kind==='stove'?cookwareArt(s.method,[],{loaded:false}):kind==='serve'?plateArt([], 'pan',0):kind==='hand'?handIcon:kind==='water'?waterIcon:kind==='oil'?oilIcon:kind==='salt'?saltIcon:kind==='wash'?washIcon:utensil(kind);}
function button(content,label,action,cls='',extra=''){return `<button class="toy-button ${cls}" data-action="${action}" aria-label="${label}" ${extra}>${content}</button>`;}
function currentFoodNames(pieces){return [...new Set(pieces.map(p=>foods[p.id][1]))].join('、');}
function render(){
  $('world').dataset.station=s.station;$('world').dataset.method=s.method;$('game').dataset.station=s.station;
  canvas.dataset.pieces=String(s.station==='board'?s.board.length:s.station==='stove'?s.vessels[s.method].length:s.plate.length);
  $('voice').textContent=prefs.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(prefs.sound));
  $('stations').innerHTML=['fridge','board','stove','serve'].map((id,i)=>button(icon(id),['打開冰箱選食材','回到砧板','回到爐台','到餐桌'][i],`station:${id}`,`station-button ${s.station===id?'active':''}`,`aria-pressed="${s.station===id}"`)).join('');
  $('fridge').hidden=s.station!=='fridge';canvas.hidden=s.station==='fridge';$('cookers').hidden=s.station!=='stove';$('dropCooker').hidden=s.station!=='board';$('friend').hidden=s.station!=='serve';
  if(s.station==='fridge'){
    $('foodShelf').dataset.page=String(page);
    $('foodShelf').innerHTML=Object.entries(foods).slice(page*6,page*6+6).map(([id,f])=>button(foodSVG(id),f[1],`food:${id}`,'fridge-food')).join('');
    $('tray').innerHTML=button('‹','冰箱上一層','page:0','page-button',page===0?'disabled':'')+'<span class="shelf-indicator" aria-hidden="true">'+(page===0?'● ○':'○ ●')+'</span>'+button('›','冰箱下一層','page:1','page-button',page===1?'disabled':'');
    $('liveStatus').textContent='打開冰箱，拿一樣食材到砧板。';
  }else if(s.station==='board'){
    $('tray').innerHTML=button(icon('knife'),'拿刀切食材','tool:knife',activeTool==='knife'?'selected':'')+button(icon('hand'),'用手搬食材','tool:hand',activeTool==='hand'?'selected':'')+button(icon('wash'),'沖洗砧板上的食材','wash')+button(icon('stove')+'<span class="transfer-arrow">↘</span>','把砧板食材倒進鍋裡','transfer','pour-button',s.board.length?'':'disabled');
    $('dropCooker').innerHTML=icon('stove')+'<span class="drop-arrow" aria-hidden="true">↓</span>';
    $('liveStatus').textContent=activeTool==='knife'?'滑過食材才會切開，在哪裡切就分成哪裡的兩塊。':'用手搬食材，可以逐塊放進右下角的鍋子。';
  }else if(s.station==='stove'){
    $('cookers').innerHTML=['pan','pot','blender'].map((id,i)=>button(cookwareArt(id,[],{loaded:false}),['平底鍋','湯鍋','果汁機'][i],`method:${id}`,s.method===id?'selected':'',`aria-pressed="${s.method===id}"`)).join('');
    const heat=s.heat[s.method]||0;
    $('tray').innerHTML=(s.method==='blender'?button('<span class="motor-symbol">▶</span>','按住果汁機開關','motor','motor-button'):button(`<span class="dial" style="--dial:${heat*250}deg"><i></i></span><span class="fire-symbol">${heat?'🔥':'○'}</span>`,'轉動爐火開關','heat','heat-button',`aria-pressed="${heat>0}"`))+button(icon(s.method==='pan'?'oil':'water'),s.method==='pan'?'倒油進鍋':'倒水進鍋',s.method==='pan'?'liquid:oil':'liquid:water')+button(icon('salt'),'撒一點鹽','salt')+button(icon('serve')+'<span class="transfer-arrow">↘</span>','把鍋裡的料理倒進盤子','plate','pour-button',s.vessels[s.method].length?'':'disabled');
    $('liveStatus').textContent=s.method==='blender'?'按住果汁機，放開就停，想打多細由自己決定。':'移動鍋鏟推食材，拖動鍋柄翻炒。火力會持續把食材煮熟，可隨時關火和加料。';
  }else{
    $('tray').innerHTML=button(icon('board'),'再拿食材來料理','station:fridge')+button('<span class="feed-picture">🍽️ → 😋</span>','把盤子給朋友吃','feed','feed-button',s.plate.length&&!celebrating?'':'disabled');
    $('liveStatus').textContent=celebrating?'朋友正在品嚐你做的料理。':'把盤子拖給朋友，或點朋友餵一口。';
  }
  $('friend').innerHTML=`<button data-action="feed" aria-label="餵朋友" class="guest-button" ${!s.plate.length||celebrating?'disabled':''}><span class="guest-art" style="background-position:${prefs.customer*100/3}% center"></span></button><span class="guest-bubble" aria-hidden="true">${celebrating?s.reaction:'😊'}</span>`;
  $('cue').innerHTML=s.station==='fridge'?'<span>👆</span><span>🥕</span>':s.station==='board'?`<span>${activeTool==='knife'?'🔪':'✋'}</span><b>↔</b><span>🥕</span>`:s.station==='stove'?`<span>${s.method==='blender'?'👆':'🥄'}</span><b>${s.method==='blender'?'↓':'↻'}</b><span>${s.method==='blender'?'🌀':'🍳'}</span>`:'<span>🍽️</span><b>→</b><span>😋</span>';
  $('worktop').setAttribute('aria-label',s.station==='board'?'砧板：滑動刀子切食材，或用手搬食材':s.station==='stove'?'料理台：攪拌食材、操作鍋柄或果汁機':'料理盤：把料理給朋友');
  $('foodDescription').textContent=currentFoodNames(s.station==='stove'?s.vessels[s.method]:s.station==='serve'?s.plate:s.board);updateSound();
}
function cancelGesture(){if(gesture&&canvas.hasPointerCapture(gesture.id))canvas.releasePointerCapture(gesture.id);gesture=null;pointer=null;s.plateOffset=null;s.blending=false;updateSound();}
function effect(kind){s.effect={kind,until:time+1};}
function changeStation(id){if(!['fridge','board','stove','serve'].includes(id))return;cancelGesture();s.station=id;selected=null;render();}
function act(action){
  if(!started||$('guide').open||celebrating||transferTimer)return;
  const [type,id]=action.split(':');
  if(type==='station')changeStation(id);
  else if(type==='page'){page=id==='1'?1:0;render();}
  else if(type==='food'){if(addFood(s,id)){activeTool='knife';render();narrator.speak(`word-${id}`,`${foods[id][2]}. ${foods[id][2]}.`);}}
  else if(type==='tool'){activeTool=id==='hand'?'hand':'knife';pointer=null;render();}
  else if(type==='wash'){effect('wash');tone('pour');}
  else if(type==='method'&&Object.hasOwn(s.vessels,id)){cancelGesture();s.method=id;render();}
  else if(type==='liquid'){if(addLiquid(s,id)){effect('pour');tone('pour');}}
  else if(type==='salt'){s.seasoning=Math.min(3,s.seasoning+.25);effect('salt');tone('pour');}
  else if(type==='heat'&&s.method!=='blender'){s.heat[s.method]=s.heat[s.method]===0?.55:s.heat[s.method]<1?1:0;render();}
  else if(type==='motor'&&s.method==='blender'){s.blending=true;updateSound();setTimeout(()=>{s.blending=false;updateSound();},450);}
  else if(type==='transfer'&&s.board.length){
    cancelGesture();$('world').classList.add('transferring');tone('pour');
    transferTimer=setTimeout(()=>{transferToCooker(s);transferTimer=null;$('world').classList.remove('transferring');changeStation('stove');},reduced?0:480);
  }else if(type==='plate'){if(plateFood(s)){tone('pour');render();}}
  else if(type==='feed'&&s.plate.length){
    cancelGesture();s.reaction=s.plate.some(p=>p.id==='strawberry')?'😍':s.plate.some(p=>p.id==='fish'&&p.cooked<.3)?'😮':s.seasoning>1?'😆':'😋';celebrating=true;prefs.served++;s.served++;save();render();$('friend').classList.add('tasting');narrator.speak('thanks','Yummy! Thank you!');
    setTimeout(()=>{s.plate=[];prefs.customer=(prefs.customer+1)%guests.length;s.plateBlend=0;s.juice=false;s.blend=0;celebrating=false;s.seasoning=0;save();$('friend').classList.remove('tasting');changeStation('fridge');},1800);
  }
}
$('game').addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target&&target.dataset.action!=='motor')act(target.dataset.action);});
function point(e){const r=canvas.getBoundingClientRect(),scale=r.width/720,zoom=s.station==='stove'?1.25:1,x=(e.clientX-r.left)/scale,y=(e.clientY-r.top)/scale-(logicalHeight-540)/2;return {x:360+(x-360)/zoom,y:270+(y-270)/zoom};}
function down(e){
  if(!started||$('guide').open||celebrating||transferTimer||gesture||e.isPrimary===false||e.button>0)return;
  const p=point(e);gesture={id:e.pointerId,start:p,last:p,trail:[p],moved:false,station:s.station};pointer={...p,trail:gesture.trail};canvas.setPointerCapture(e.pointerId);
  if(s.station==='board'&&activeTool==='hand'){gesture.piece=hitPiece(s.board,p);selected=gesture.piece?.uid||null;if(gesture.piece){gesture.original={x:gesture.piece.x,y:gesture.piece.y};gesture.offset={x:gesture.piece.x-p.x,y:gesture.piece.y-p.y};}}
  else if(s.station==='stove'){
    if(s.method==='blender'&&Math.hypot(p.x-356,p.y-423)<70){gesture.motor=true;s.blending=true;updateSound();}
    else if(s.method!=='blender'&&Math.hypot(p.x-563,p.y-446)<50){gesture.dial=true;gesture.dialAngle=Math.atan2(p.y-446,p.x-563);}
    else if(s.method==='pan'&&p.x>515&&p.y>280&&p.y<385)gesture.handle=true;
  }else if(s.station==='serve')gesture.feed=!!hitPiece(s.plate.map(p=>({...p,x:p.x-40})),p)||s.plateMethod==='blender';
}
function move(e){
  if(!gesture||gesture.id!==e.pointerId)return;const p=point(e),g=gesture;
  if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>12)g.moved=true;
  if(g.station==='board'&&g.piece){g.piece.x+=p.x-g.last.x;g.piece.y+=p.y-g.last.y;g.piece.vx=0;g.piece.vy=0;}
  else if(g.station==='board'&&activeTool==='knife'&&!g.sliced&&g.moved&&!hitPiece(s.board,p)&&Math.hypot(p.x-g.start.x,p.y-g.start.y)>70){const cuts=cutFood(s,g.start,p);if(cuts){g.sliced=true;tone('cut');canvas.dataset.pieces=String(s.board.length);$('liveStatus').textContent=`砧板上有 ${s.board.length} 塊食材。`;}}
  else if(g.station==='stove'){
    if(g.dial){const angle=Math.atan2(p.y-446,p.x-563),delta=Math.atan2(Math.sin(angle-g.dialAngle),Math.cos(angle-g.dialAngle));s.heat[s.method]=Math.max(0,Math.min(1,s.heat[s.method]+delta/(Math.PI*1.4)));g.dialAngle=angle;updateSound();}
    else if(g.handle){tossFood(s,Math.min(1,Math.abs(p.y-g.last.y)/70));}
    else if(s.method!=='blender')pushFood(s,g.last,p);
  }
  else if(g.station==='serve'&&g.feed)s.plateOffset={x:p.x-g.start.x,y:p.y-g.start.y};
  g.last=p;g.trail.push(p);if(g.trail.length>60)g.trail.shift();pointer={...p,trail:g.trail};
}
function up(e,cancelled=false){
  if(!gesture||gesture.id!==e.pointerId)return;const g=gesture,p=point(e);gesture=null;s.blending=false;s.plateOffset=null;pointer=null;
  if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);
  if(cancelled){if(g.piece){g.piece.x=g.original.x;g.piece.y=g.original.y;}updateSound();return;}
  if(g.station==='board'){
    if(activeTool==='knife'){
      const hit=hitPiece(s.board,p),cuts=g.sliced?0:g.moved?cutFood(s,g.start,p):hit?cutFood(s,{x:p.x-170,y:p.y},{x:p.x+170,y:p.y}):0;
      if(cuts){tone('cut');canvas.dataset.pieces=String(s.board.length);$('liveStatus').textContent=`切開了 ${cuts} 樣食材，砧板上有 ${s.board.length} 塊食材。`;}
    }else if(g.piece){
      const drop=$('dropCooker').getBoundingClientRect(),fridge=$('stations').querySelector('[data-action="station:fridge"]')?.getBoundingClientRect();if(e.clientX>=drop.left-25&&e.clientX<=drop.right+25&&e.clientY>=drop.top-25&&e.clientY<=drop.bottom+25){transferToCooker(s,g.piece.uid);tone('pour');render();}
      else if(fridge&&e.clientX>=fridge.left&&e.clientX<=fridge.right&&e.clientY>=fridge.top&&e.clientY<=fridge.bottom){s.board=s.board.filter(p=>p.uid!==g.piece.uid);selected=null;render();}
      else if(!g.moved&&selected){g.piece.vx=20;}
    }
  }else if(g.station==='stove'&&g.dial){if(!g.moved)act('heat');else render();}
  else if(g.station==='stove'&&g.handle&&!g.moved){tossFood(s);tone('wood');}
  else if(g.station==='serve'&&g.feed&&!g.moved)act('feed');
  else if(g.station==='serve'&&g.feed&&g.moved){const r=$('friend').getBoundingClientRect();if(e.clientX>=r.left-35&&e.clientX<=r.right+35&&e.clientY>=r.top-35&&e.clientY<=r.bottom+35)act('feed');}
  updateSound();
}
canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',e=>up(e));canvas.addEventListener('pointercancel',e=>up(e,true));canvas.addEventListener('lostpointercapture',()=>{if(gesture){gesture=null;pointer=null;s.plateOffset=null;s.blending=false;updateSound();}});
canvas.addEventListener('keydown',e=>{
  if(!started||$('guide').open||celebrating||transferTimer)return;
  if(!['Enter',' '].includes(e.key))return;e.preventDefault();
  if(s.station==='board'&&activeTool==='knife'&&s.board.length){const p=s.board.find(p=>p.uid===selected)||s.board[0];if(cutFood(s,{x:p.x-180,y:p.y},{x:p.x+180,y:p.y}))tone('cut');}
  else if(s.station==='stove')s.method==='blender'?act('motor'):tossFood(s);
  else if(s.station==='serve')act('feed');
});
// The physical motor stops as soon as the held button loses its pointer.
$('tray').addEventListener('pointerdown',e=>{if(e.target.closest('[data-action="motor"]')&&started&&!celebrating&&!$('guide').open&&e.isPrimary!==false){s.blending=true;$('tray').setPointerCapture(e.pointerId);$('tray').classList.add('motor-on');updateSound();}});
function stopMotor(){s.blending=false;$('tray').classList.remove('motor-on');updateSound();}
$('tray').addEventListener('pointerup',stopMotor);$('tray').addEventListener('pointercancel',stopMotor);$('tray').addEventListener('lostpointercapture',stopMotor);
$('tray').addEventListener('keydown',e=>{if(e.target.closest('[data-action="motor"]')&&['Enter',' '].includes(e.key)){e.preventDefault();s.blending=true;updateSound();}});$('tray').addEventListener('keyup',stopMotor);$('tray').addEventListener('focusout',stopMotor);
$('dropCooker').onclick=()=>{if(activeTool==='hand'&&selected&&s.board.some(p=>p.uid===selected)){transferToCooker(s,selected);selected=null;render();}else act('transfer');};
$('start').onclick=()=>{started=true;$('welcome').hidden=true;render();};
$('voice').onclick=()=>{prefs.sound=!prefs.sound;if(!prefs.sound){narrator.stop();stopSound();}else updateSound();save();$('voice').textContent=prefs.sound?'🔊':'🔇';$('voice').setAttribute('aria-pressed',String(prefs.sound));};
$('help').onclick=()=>{hintUntil=time+4;$('world').classList.add('show-hint');setTimeout(()=>$('world').classList.remove('show-hint'),4000);};
$('parents').onclick=()=>{cancelGesture();stopMotor();$('guide').showModal();narrator.stop();stopSound();};$('closeGuide').onclick=()=>$('guide').close();$('guide').addEventListener('close',updateSound);
document.addEventListener('visibilitychange',()=>{lastTime=null;if(document.hidden){cancelGesture();stopMotor();narrator.stop();stopSound();audio?.suspend();}else updateSound();});
function frame(now){
  if(!document.hidden&&!$('guide').open){const dt=lastTime===null?0:(now-lastTime)/1000;time+=Math.min(dt,.05);if(started&&!celebrating){stepWorkshop(s,dt);if(gesture?.piece){gesture.piece.x=gesture.last.x+gesture.offset.x;gesture.piece.y=gesture.last.y+gesture.offset.y;}}
    if(!canvas.hidden){const r=canvas.getBoundingClientRect();logicalHeight=Math.max(400,Math.round(r.height/r.width*720));if(canvas.height!==logicalHeight*2)canvas.height=logicalHeight*2;s.boardBounds={top:95-(logicalHeight-540)/2,bottom:logicalHeight-100-(logicalHeight-540)/2};}
    renderer?.draw(s,time,pointer,activeTool,logicalHeight);const contents=s.vessels[s.method],ready=contents.length&&contents.every(p=>p.cooked>.8);canvas.dataset.cooked=(contents.length?contents.reduce((n,p)=>n+p.cooked,0)/contents.length:0).toFixed(2);canvas.dataset.blend=s.blend.toFixed(2);$('aroma').hidden=s.station!=='stove'||!ready||s.method==='blender';
    if(hintUntil>time)$('cue').classList.add('demonstrating');else $('cue').classList.remove('demonstrating');lastTime=now;
  }else lastTime=null;
  requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);
createRenderer(canvas).then(result=>{renderer=result;$('start').disabled=false;$('loading').hidden=true;}).catch(()=>{$('loading').textContent='圖片載入失敗，請重新整理。';});
