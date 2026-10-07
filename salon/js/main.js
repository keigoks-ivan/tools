import {StudioUI} from './studio.js?v=17';
import {drawRoom,drawBody,drawFallbackFace} from './studio-art.js?v=17';
import {guests,wishes} from './looks.js?v=17';
import {SalonMemory} from './memory.js?v=17';
import {ReplayUI} from './replay-ui.js?v=17';
import {ornament,createDecorate} from './ornaments.js?v=17';
import {createLayout,toWorld,inStage} from './layout.js?v=17';
import {HairSystem,setHairTexture,setHairPlate} from './hair.js?v=17';
import {guest,palette} from './data.js?v=17';
import {createCut} from './tools/cut.js?v=17';
import {createGrow} from './tools/grow.js?v=17';
import {createColor} from './tools/color.js?v=17';
import {createComb} from './tools/comb.js?v=17';
import {createTie} from './tools/tie.js?v=17';
import {checkWish} from './goals.js?v=17';
import {surpriseWish,restoreInspiration,earnedSticker} from './play.js?v=17';
import {FoamSystem} from './foam.js?v=17';
import {createWash,createShape} from './tools/care.js?v=17';
const canvas=document.getElementById('scene'),box=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
canvas.width=box.clientWidth;canvas.height=box.clientHeight;ctx.fillStyle='#fff2db';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#efadc0';for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(canvas.width/2+Math.cos(a)*14,canvas.height/2+Math.sin(a)*14,11,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#f9d37b';ctx.beginPath();ctx.arc(canvas.width/2,canvas.height/2,8,0,Math.PI*2);ctx.fill();
// Artwork never blocks play. Missing or slow files use the vector portrait.
const artSets=new Map(guests.map(g=>[g.id,{offsets:g.artOffsets||{}}]));let art=artSets.get('cocoa');
const loadImage=url=>new Promise(resolve=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src=url});
for(const [name,url] of Object.entries(guest.art))loadImage(url).then(im=>{if(im){artSets.get('cocoa')[name]=im;previews.clear();tieShots.clear()}});
for(const g of guests.filter(g=>g.atlas))loadImage(g.atlas).then(atlas=>{if(!atlas)return;const set=artSets.get(g.id);['normal','blink','happy','surprise'].forEach((name,i)=>{const cell=document.createElement('canvas');cell.width=Math.round(atlas.width/2);cell.height=Math.round(atlas.height/2);cell.getContext('2d').drawImage(atlas,(i%2)*atlas.width/2,Math.floor(i/2)*atlas.height/2,atlas.width/2,atlas.height/2,0,0,cell.width,cell.height);set[name]=cell});previews.clear();tieShots.clear()});
const memory=new SalonMemory(),memoryReady=memory.open();let touched=false;
let currentGuest=guests[0],wishIndex=0,inspiration=null;const ornaments=[],history=[],drafts={};let saveTimer;
const textureImage=new Image();textureImage.onload=()=>setHairTexture(textureImage);textureImage.src='./assets/art/hair-texture.webp';
loadImage('./assets/art/hair-plate.webp').then(im=>{if(im)setHairPlate(im)});
const env={hair:new HairSystem(),H:844,colorIndex:0,react};
env.foam=new FoamSystem(env.hair);
const tools={cut:createCut(env),grow:createGrow(env),color:createColor(env),comb:createComb(env),wash:createWash(env),rinse:createWash(env,true),curl:createShape(env),straight:createShape(env,false),tie:createTie(env),decorate:createDecorate(env,ornaments,save)};env.ornament='bow';

let selected='cut',pointer=null,expression='normal',reactionUntil=0,nextExpression=null,blinkAt=performance.now()+4200,blinkUntil=0,last=performance.now(),headDx=0;
function currentWish(){return inspiration||wishes[wishIndex]}
function state(){return {version:1,guest:currentGuest.id,hair:env.hair.snapshot(),foam:env.foam.snapshot(),ornaments:structuredClone(ornaments),wish:wishIndex,inspiration};}
function bookmark(){touched=true;history.push(state());if(history.length>8)history.shift()}
function save(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{drafts[currentGuest.id]=state();memory.draft({active:currentGuest.id,drafts})},350)}
function editKey(snapshot){return JSON.stringify([snapshot.hair.strands.map(s=>[s.rest,s.tie,s.nodes.map(p=>[p.homeX,p.homeY,p.c])]),snapshot.ornaments,snapshot.foam])}
function stop(cancel=true){if(pointer){const old=pointer;pointer=null;if(!old.ui){tools[old.tool].onUp({cancel});if(editKey(old.before)!==editKey(state())){touched=true;history.push(old.before);if(history.length>8)history.shift();save()}}if(old.target.hasPointerCapture(old.id))old.target.releasePointerCapture(old.id)}}
function restore(snapshot){
 const profile=guests.find(g=>g.id===snapshot?.guest);if(!profile)return false;
 stop();currentGuest=profile;art=artSets.get(profile.id)||artSets.get('cocoa');env.hair.reset(profile);
 if(!env.hair.restore(snapshot.hair))env.hair.reset(profile);
 env.foam.restore(snapshot.foam);
 ornaments.splice(0,ornaments.length,...(Array.isArray(snapshot.ornaments)?snapshot.ornaments.filter(a=>a&&['bow','flower','star','butterfly','heart','moon','crown','pearls'].includes(a.kind)&&Number.isFinite(a.x)&&Number.isFinite(a.y)&&Number.isFinite(a.angle)&&Number.isInteger(a.color)&&a.color>=0&&a.color<palette.length):[]));wishIndex=Number.isInteger(snapshot.wish)?Math.max(0,Math.min(wishes.length-1,snapshot.wish)):0;inspiration=restoreInspiration(snapshot.inspiration);save();return true;
}
function chooseGuest(id){
 if(id===currentGuest.id){stop();react('happy');return}
 touched=true;stop();drafts[currentGuest.id]=state();history.length=0;
 if(drafts[id])restore(drafts[id]);else{currentGuest=guests.find(g=>g.id===id)||guests[0];art=artSets.get(id)||artSets.get('cocoa');env.hair.reset(currentGuest);env.foam.restore([]);ornaments.length=0;wishIndex=(wishIndex+1)%wishes.length;inspiration=null;save()}
 react('happy');
}
function photoCanvas(hair=env.hair,set=art,items=ornaments,expression='happy'){
 const c=document.createElement('canvas');c.width=640;c.height=860;const p=c.getContext('2d');p.scale(640/390,640/390);p.translate(0,-86.5);p.fillStyle='#e4efe7';p.fillRect(0,86.5,390,525);paintGuest(p,hair,set,expression,items,0);if(hair===env.hair)env.foam.draw(p,performance.now());return c;
}
function capture(){const image=photoCanvas().toDataURL('image/jpeg',.88),wish=currentWish();return {id:globalThis.crypto?.randomUUID?.()||Date.now().toString(36),created:Date.now(),image,state:state(),sticker:earnedSticker(currentGuest.id,wish,checkWish(env.hair,ornaments,wish))}}
function newChallenge(options={}){stop();if(options.guest)chooseGuest(options.guest);else if(options.next)chooseGuest(guests[(guests.indexOf(currentGuest)+1+guests.length)%guests.length].id);const previous=currentWish();inspiration=surpriseWish(Math.random,previous,options.color);selected='color';env.colorIndex=inspiration.colors[0];touched=true;save();studio.free=false;studio.last=0;react('happy')}
const previews=new Map();
// 綁髮選單的預覽：拿目前這位客人現在的頭髮（長度、顏色都一樣）套上每一種綁法，拍一張頭部特寫。每格最多做一張，選單打開時重做。
const tieShots=new Map();let tieBudget=0;
function tiePreview(mode){
 if(tieShots.has(mode))return tieShots.get(mode);if(tieBudget<=0)return null;tieBudget--;
 const h=new HairSystem(currentGuest);if(!h.restore(env.hair.snapshot()))h.reset(currentGuest);
 if(mode==='loose')h.untie();else h.tie(mode,env.colorIndex);
 for(let i=0;i<30;i++)h.step(1/60,844,0);
 const c=document.createElement('canvas');c.width=560;c.height=860;const p=c.getContext('2d');p.scale(2,2);p.translate(-55,-92);p.fillStyle='#e4efe7';p.fillRect(55,92,280,430);
 paintGuest(p,h,art,'happy',[],0);tieShots.set(mode,c);return c;
}
const replay=new ReplayUI({memory,guests:guests.filter(g=>artSets.has(g.id)),stop,react,save,capture,restore:s=>{bookmark();restore(s)},
 guestId:()=>currentGuest.id,wish:()=>wishIndex,currentWish,newChallenge,selected:()=>selected,ornament:()=>env.ornament,color:()=>env.colorIndex,
 finishPhoto:photo=>photo.sticker?memory.collect(photo.sticker):false,
 chooseGuest,chooseWish:i=>{touched=true;wishIndex=i;inspiration=null;save();studio.free=false},chooseOrnament:kind=>{env.ornament=kind;selected='decorate'},chooseCare:kind=>{stop();selected=kind},
 tiePreview,clearTiePreviews:()=>tieShots.clear(),tieMode:()=>env.hair.tieMode(),
 tie:mode=>{bookmark();const count=mode==='loose'?(env.hair.untie(),0):env.hair.tie(mode,env.colorIndex);if(!count&&mode!=='loose'){selected='grow';studio.notify('頭髮有點短，先用生髮水長長再綁。')}react('happy');save()},
 canUndo:()=>history.length>0,undo:()=>{const previous=history.pop();if(previous)restore(previous)},
 reset:()=>{bookmark();env.hair.reset(currentGuest);env.foam.restore([]);ornaments.length=0;react('happy');save()},
 preview:id=>{if(!previews.has(id)){const profile=guests.find(g=>g.id===id);previews.set(id,photoCanvas(new HairSystem(profile),artSets.get(id),[],'normal'))}return previews.get(id)}
});
const studio=new StudioUI({replay,stop,selected:()=>selected,colorIndex:()=>env.colorIndex,wish:()=>wishIndex,currentWish,hair:()=>env.hair,items:()=>ornaments,canUndo:()=>history.length>0,problem:()=>memory.problem,guest:()=>currentGuest.id,celebrate:()=>{for(let i=0;i<60;i++)env.hair.particles.push({x:195,y:230,vx:(Math.random()-.5)*250,vy:-60-Math.random()*150,life:1+Math.random(),color:['#fff4ab','#eb9fb9','#a3c7b4'][i%3],size:2+Math.random()*3})},
 select:kind=>{stop();selected=kind;if(kind==='decorate')replay.open('accessories')},
 color:i=>{stop();env.colorIndex=i;if(selected!=='decorate'&&selected!=='tie')selected='color'},
 bindTieControl:(button,band=null)=>bindTieControl(button,band),
 editTie:(index,point)=>{stop();const band=index===null?{color:env.colorIndex}:env.hair.ties[index];if(!band)return;if(point&&!env.hair.freeTarget(point,index))return;bookmark();point?env.hair.tieAt(point,band.color,index):env.hair.releaseTie(index);react('happy');save()},
 untieAll:()=>{stop();if(!env.hair.activeTies().length)return;bookmark();env.hair.untie();react('happy');save()},
 undo:()=>{stop();const previous=history.pop();if(previous)restore(previous)},
 dyeAll:()=>{stop();bookmark();for(const strand of env.hair.strands){for(const node of strand.nodes)node.c=[...palette[env.colorIndex]];strand.textureDirty=true}react('happy');save();studio.notify('新髮色完成！也可以再加上局部挑染。')}
});
memoryReady.then(()=>{if(memory.current?.drafts){const saved=memory.current;for(const [id,draft] of Object.entries(saved.drafts))if(!drafts[id])drafts[id]=draft;if(!touched&&saved.active&&drafts[saved.active])restore(drafts[saved.active])}});
document.querySelector('.loading')?.remove();
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);drafts[currentGuest.id]=state();memory.draft({active:currentGuest.id,drafts})});
function react(type){expression=type;reactionUntil=performance.now()+(type==='surprise'?500:1200);nextExpression=type==='surprise'?'happy':null}
let layout;env.tieRadius=()=>32/layout.world.scale;env.tieFeedback=message=>studio.notify(message);
const coarsePointer=matchMedia('(pointer: coarse)');
function size(){
 const r=box.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
 if(r.width<1||r.height<1)return;
 if(layout&&layout.width===r.width&&layout.height===r.height&&canvas.width===Math.round(r.width*d))return;
 // A rotation ends the gesture, but never resets the haircut or color.
 stop();
 layout=createLayout(r.width,r.height,coarsePointer.matches);
 canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);
 ctx.setTransform(canvas.width/r.width,0,0,canvas.height/r.height,0,0);
 canvas.dataset.layout=JSON.stringify(layout);
 box.dataset.orientation=layout.landscape?'landscape':'portrait';
 studio.resize(layout);

}
new ResizeObserver(size).observe(box);
window.visualViewport?.addEventListener('resize',size);
window.addEventListener('resize',size);
coarsePointer.addEventListener('change',size);
size();
function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function uiDown(p){if(replay.hit(p))return true;return !inStage(p,layout)}
function begin(e,tool=selected,options=null){
 e.preventDefault();if(pointer)return;const p=pos(e);if(!options&&uiDown(p))return;
 const target=e.currentTarget;target.setPointerCapture(e.pointerId);pointer={id:e.pointerId,ui:false,tool,before:state(),target};touched=true;tools[tool].onDown(toWorld(p,layout),options||{});
}
function move(e){
 if(!pointer||pointer.id!==e.pointerId||pointer.ui)return;e.preventDefault();
 const coalesced=e.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[e];
 for(const q of events){const p=pos(q);if(!inStage(p,layout)&&pointer.tool!=='tie'){end(e);break}tools[pointer.tool].onMove(toWorld(p,layout))}
}
function end(e){if(!pointer||pointer.id!==e.pointerId)return;stop(e.type==='pointercancel'||e.type==='lostpointercapture')}
function bindPointer(target,down){target.addEventListener('pointerdown',down);target.addEventListener('pointermove',move);for(const type of ['pointerup','pointercancel','lostpointercapture'])target.addEventListener(type,end);}
bindPointer(canvas,e=>begin(e));
function bindTieControl(button,band=null){bindPointer(button,e=>begin(e,'tie',{spawn:band===null,band}));
 if(band===null)button.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();studio.api.editTie(null,{x:env.hair.tieHandles().some(b=>b.x<195)?285:105,y:300})}});
 if(band!==null)button.addEventListener('keydown',e=>{const b=env.hair.ties[band];if(!b)return;const delta={ArrowLeft:[-12,0],ArrowRight:[12,0],ArrowUp:[0,-12],ArrowDown:[0,12]}[e.key];if(delta){e.preventDefault();studio.api.editTie(band,{x:b.x+delta[0],y:b.y+delta[1]})}else if(['Enter',' ','Delete','Backspace'].includes(e.key)){e.preventDefault();studio.api.editTie(band,null)}});
}
function plate(target,img,dy=0){if(img)target.drawImage(img,0,0,img.width,img.height*611/844,0,dy,390,611)}
// 髮飾：每種樣子＋顏色只畫一次（陰影、漸層很花時間），之後直接貼上。髮飾數量不限，放幾百個也不會卡。
const ornamentSprites=new Map();
function ornamentSprite(target,kind,x,y,size,color,angle=0){
 const key=kind+':'+color;let c=ornamentSprites.get(key);
 if(!c){c=document.createElement('canvas');c.width=c.height=192;const x2=c.getContext('2d');ornament(x2,kind,96,96,120,color,0);ornamentSprites.set(key,c)}
 const S=size*192/120;target.save();target.translate(x,y);target.rotate(angle);target.drawImage(c,-S/2,-S/2,S,S);target.restore();
}
function headPath(target){target.beginPath();target.moveTo(194,176);target.bezierCurveTo(145,174,117,218,121,280);target.bezierCurveTo(109,275,111,319,141,330);target.quadraticCurveTo(157,348,180,355);target.lineTo(178,376);target.quadraticCurveTo(202,390,225,377);target.lineTo(224,350);target.quadraticCurveTo(249,339,260,314);target.bezierCurveTo(280,312,280,267,266,270);target.bezierCurveTo(269,221,242,175,194,176);target.closePath()}
function head(target,img,dx=0,dy=0){const sprite=headSprite(img,dy);if(sprite)target.drawImage(sprite,dx,0,390,611)}
// 頭像剪裁：headPath 只是大概的形狀，比耳朵、下巴大一圈，原圖在那裡畫的是粉紅椅背，會在頭髮前面露出一圈粉紅邊。
// 第一次用到某張圖時，照圖上耳朵、下巴的棕色輪廓線把那一圈修掉，做成一張剪好的頭像存起來；之後每格直接貼。
const HK=2,headSprites=new WeakMap();
function headSprite(img,dy){
 if(!img)return null;let byDy=headSprites.get(img);if(!byDy)headSprites.set(img,byDy=new Map());if(byDy.has(dy))return byDy.get(dy);
 const c=document.createElement('canvas');c.width=390*HK;c.height=611*HK;const x=c.getContext('2d',{willReadFrequently:true});
 x.save();x.scale(HK,HK);headPath(x);x.clip();plate(x,img,dy);x.restore();
 try{trimEars(x)}catch(e){console.warn('[salon] 耳朵修邊失敗，用原本的剪法',e)}
 byDy.set(dy,c);return c;
}
function trimEars(x){
 // 只看耳朵到脖子那一段（世界座標 x 95–295、y 226–380）
 const X0=95*HK,Y0=226*HK,w=200*HK,h=154*HK,d=x.getImageData(X0,Y0,w,h),p=d.data,max=30*HK;
 const at=(cx,cy)=>(cy*w+cx)*4,inside=i=>p[i+3]>160;
 const lum=i=>p[i]*.299+p[i+1]*.587+p[i+2]*.114,line=i=>lum(i)<150&&p[i+1]-p[i+2]>18&&p[i]>p[i+1];   // 深棕色輪廓線（粉紅椅背比較亮、也不夠棕）
 for(const side of [1,-1]){
  const start=[],dist=[];
  for(let cy=0;cy<h;cy++){
   let cx=side>0?0:w-1;while(cx>=0&&cx<w&&!inside(at(cx,cy)))cx+=side;
   start.push(cx);if(cx<0||cx>=w){dist.push(-1);continue}
   // 往臉的方向走：碰到「突然變暗」的棕色線就是輪廓線；如果突然變亮（已經走進皮膚、線太淡沒抓到），這一排不剪
   let n=0,xx=cx,avg=lum(at(cx,cy)),hit=-1;const stop=side>0?(185-95)*HK:(205-95)*HK;
   while(n<max&&xx>=0&&xx<w&&(side>0?xx<stop:xx>stop)&&inside(at(xx,cy))){
    const i=at(xx,cy),L=lum(i);
    if(line(i)||(L<avg-22&&p[i+1]-p[i+2]>8&&p[i]>p[i+1])){hit=n;break}
    if(L>avg+25)break;
    avg=avg*.7+L*.3;xx+=side;n++}
   dist.push(hit);
  }
  // 找到輪廓線的排就剪到線為止；沒找到的排用上下找得到的排內插（太遠就不動）
  const fill=dist.slice();
  for(let cy=0;cy<h;cy++)if(fill[cy]<0){let a=cy-1,b=cy+1;while(a>=0&&dist[a]<0)a--;while(b<h&&dist[b]<0)b++;
   fill[cy]=a>=0&&b<h&&b-a<=14*HK?Math.round(dist[a]+(dist[b]-dist[a])*(cy-a)/(b-a)):0}
  for(let cy=0;cy<h;cy++){
   const n=Math.min(fill[cy],max),s0=start[cy];if(s0<0||s0>=w)continue;
   for(let k=0;k<n;k++){const i=at(s0+side*k,cy);p[i+3]=0}
   // 剪裁邊緣外那幾格半透明的像素也是椅背，一起清掉（不然會留一條淡淡的點線）
   if(n>0)for(let k=1;k<=3;k++){const q=s0-side*k;if(q<0||q>=w)break;const i=at(q,cy);if(p[i+3]>160)break;p[i+3]=0}
   if(n>0){const i=at(s0+side*n,cy);if(!line(i))p[i+3]=p[i+3]>>1}}
 }
 x.putImageData(d,X0,Y0);
}
function paintGuest(target,hair,set,show='normal',items=[],dx=0){
 drawBody(target,hair.profile);hair.draw(target,false);
 if(set.normal)head(target,set[show]||set.normal,dx,set.offsets?.[show]||0);else drawFallbackFace(target,hair.profile,show,dx);
 hair.drawShadow(target,()=>{target.save();target.translate(dx,0);headPath(target);target.restore();target.clip()},dx);hair.drawCap(target,dx);hair.draw(target,true);hair.drawCrown(target,dx);
 for(const band of hair.activeTies())ornament(target,band.ring?'pearls':'bow',band.x+dx,band.y,band.size||29,band.color??0);
 for(const a of items)ornamentSprite(target,a.kind,a.x+dx,a.y,45,a.color,a.angle);
}
let frameCount=0,lastReport=performance.now();
document.addEventListener('visibilitychange',()=>{stop();last=performance.now()});
function render(now){const rawDt=(now-last)/1000,dt=Math.min(.034,rawDt);last=now;
 frameCount++; if(now-lastReport>1000){canvas.dataset.stats=JSON.stringify({...env.hair.stats(),guest:currentGuest.id,mode:replay.mode,photos:memory.photos.length,persistent:memory.persistent,ornaments:ornaments.length,ties:env.hair.activeTies().length,wish:wishIndex,selected,colorIndex:env.colorIndex,fps:Math.round(frameCount*1000/(now-lastReport)),artReady:Object.keys(art).length});lastReport=now;frameCount=0;}
 if(now>reactionUntil){if(nextExpression){expression=nextExpression;nextExpression=null;reactionUntil=now+1100}else expression='normal'}
 if(now>blinkAt&&expression==='normal'){blinkUntil=now+150;blinkAt=now+3000+Math.random()*3000}
 const show=now<blinkUntil?'blink':expression;headDx=Math.sin(now*.0008)*.24;
 tieBudget=1;if(!replay.mode){tools[selected].update?.(dt);env.hair.step(dt,844,headDx);}
 ctx.setTransform(canvas.width/layout.width,0,0,canvas.height/layout.height,0,0);drawRoom(ctx,layout);
 ctx.save();ctx.beginPath();ctx.rect(layout.stage.x,layout.stage.y,layout.stage.w,layout.stage.h);ctx.clip();
 ctx.translate(layout.world.x,layout.world.y);ctx.scale(layout.world.scale,layout.world.scale);
 paintGuest(ctx,env.hair,art,show,ornaments,headDx);
 env.foam.draw(ctx,now);
 if(!studio.free&&!replay.mode&&selected==='cut'&&!env.hair.activeTies().length){const y=128+440*currentWish().length*.92;ctx.save();ctx.strokeStyle='#fff9e9bb';ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(49,y);ctx.lineTo(341,y);ctx.stroke();ctx.fillStyle='#796483';ctx.font='9px system-ui';ctx.textAlign='center';ctx.fillText('✂',329,y-5);ctx.restore()}
 env.hair.drawFallen(ctx);if(!replay.mode)tools[selected].drawOverlay(ctx);ctx.restore();
 replay.draw(ctx,layout,now);studio.draw(now);requestAnimationFrame(render)
}
requestAnimationFrame(render);
// Diagnostics are only exposed to local developer inspection; no text is drawn in the game.
window.__salon={get hair(){return env.hair},stats:()=>env.hair.stats(),get selected(){return selected},artReady:Object.keys(art).length,choose:id=>chooseGuest(id),sprite:(name='normal')=>headSprite(art[name],art.offsets?.[name]||0)};
