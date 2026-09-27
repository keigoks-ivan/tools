import {createLayout,toWorld,inStage} from './layout.js';
import {HairSystem,setHairTexture,setHairPlate} from './hair.js';
import {guest,palette} from './data.js';
import {createCut} from './tools/cut.js';
import {createGrow} from './tools/grow.js';
import {createColor} from './tools/color.js';
import {createComb} from './tools/comb.js';
const canvas=document.getElementById('scene'),box=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
canvas.width=box.clientWidth;canvas.height=box.clientHeight;ctx.fillStyle='#fff2db';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#efadc0';for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(canvas.width/2+Math.cos(a)*14,canvas.height/2+Math.sin(a)*14,11,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#f9d37b';ctx.beginPath();ctx.arc(canvas.width/2,canvas.height/2,8,0,Math.PI*2);ctx.fill();
const art={};
await Promise.all(Object.entries(guest.art).map(([name,url])=>new Promise(resolve=>{const img=new Image();img.onload=()=>{art[name]=img;resolve()};img.onerror=()=>resolve();img.src=url})));
const textureImage=new Image();textureImage.onload=()=>setHairTexture(textureImage);textureImage.src='./assets/art/hair-texture.png';
const paintedHair=new Image();await new Promise(resolve=>{paintedHair.onload=()=>{setHairPlate(paintedHair);resolve()};paintedHair.onerror=resolve;paintedHair.src='./assets/art/hair-plate.png'});
const env={hair:new HairSystem(),H:844,colorIndex:0,react,drawTool};
const tools={cut:createCut(env),grow:createGrow(env),color:createColor(env),comb:createComb(env)};
const names=['cut','grow','color','comb','reset'],atlasButtons=[{x:42,y:676},{x:119,y:676},{x:197,y:676},{x:275,y:676},{x:353,y:676}];
let selected='cut',pointer=null,expression='normal',reactionUntil=0,nextExpression=null,blinkAt=performance.now()+4200,blinkUntil=0,last=performance.now(),popAt=0,headDx=0;
function react(type){expression=type;reactionUntil=performance.now()+(type==='surprise'?500:1200);nextExpression=type==='surprise'?'happy':null}
let layout, background;
const coarsePointer=matchMedia('(pointer: coarse)');
function size(){
 const r=box.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);
 if(r.width<1||r.height<1)return;
 if(layout&&layout.width===r.width&&layout.height===r.height&&canvas.width===Math.round(r.width*d))return;
 // A rotation ends the gesture, but never resets the haircut or color.
 if(pointer){const old=pointer;pointer=null;if(!old.ui)tools[selected].onUp();if(canvas.hasPointerCapture(old.id))canvas.releasePointerCapture(old.id)}
 layout=createLayout(r.width,r.height,coarsePointer.matches);
 canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);
 ctx.setTransform(canvas.width/r.width,0,0,canvas.height/r.height,0,0);
 canvas.dataset.layout=JSON.stringify(layout);
 box.dataset.orientation=layout.landscape?'landscape':'portrait';
 background=ctx.createLinearGradient(0,0,r.width,r.height);background.addColorStop(0,'#b5d0bc');background.addColorStop(.6,'#97b8a4');background.addColorStop(1,'#c3d6ba');
}
new ResizeObserver(size).observe(box);
window.visualViewport?.addEventListener('resize',size);
window.addEventListener('resize',size);
coarsePointer.addEventListener('change',size);
size();
function pos(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function uiDown(p){
 for(let i=0;i<6;i++){const c=layout.colors[i];if(Math.hypot(p.x-c.x,p.y-c.y)<c.r+5){selected='color';env.colorIndex=i;popAt=performance.now();return true}}
 for(let i=0;i<5;i++){const b=layout.buttons[i];if(Math.hypot(p.x-b.x,p.y-b.y)<b.r+4){if(i===4){env.hair.reset();react('happy')}else selected=names[i];popAt=performance.now();return true}}
 return !inStage(p,layout);
}
canvas.addEventListener('pointerdown',e=>{
 e.preventDefault();if(pointer)return;const p=pos(e);canvas.setPointerCapture(e.pointerId);
 pointer={id:e.pointerId,ui:uiDown(p)};if(!pointer.ui)tools[selected].onDown(toWorld(p,layout));
});
canvas.addEventListener('pointermove',e=>{
 if(!pointer||pointer.id!==e.pointerId||pointer.ui)return;e.preventDefault();
 const coalesced=e.getCoalescedEvents?.(),events=coalesced?.length?coalesced:[e];
 for(const q of events){const p=pos(q);if(!inStage(p,layout)){end(e);break}tools[selected].onMove(toWorld(p,layout))}
});
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.ui)tools[selected].onUp();pointer=null}
canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
function plate(img=art.normal){if(img)ctx.drawImage(img,0,0,img.width,img.height*611/844,0,0,390,611)}
function head(img){ctx.save();ctx.translate(headDx,0);ctx.beginPath();ctx.moveTo(194,184);ctx.bezierCurveTo(149,180,119,222,128,282);ctx.bezierCurveTo(110,276,118,315,143,326);ctx.quadraticCurveTo(157,347,182,353);ctx.lineTo(180,373);ctx.quadraticCurveTo(202,385,223,376);ctx.lineTo(221,350);ctx.quadraticCurveTo(246,337,254,312);ctx.bezierCurveTo(275,311,279,266,261,271);ctx.bezierCurveTo(264,223,239,181,194,184);ctx.closePath();ctx.clip();plate(img||art.normal);ctx.restore()}
function drawTool(context,type,x,y,size=44){const b=atlasButtons[names.indexOf(type)]||atlasButtons[0],r=36;context.save();context.beginPath();context.arc(x,y,size/2,0,Math.PI*2);context.clip();const im=art.normal;if(im)context.drawImage(im,(b.x-r)/390*im.width,(b.y-r)/844*im.height,r*2/390*im.width,r*2/844*im.height,x-size/2,y-size/2,size,size);context.restore()}
function drawBackdrop(){
 ctx.fillStyle=background;ctx.fillRect(0,0,layout.width,layout.height);
 // Quiet wall pattern fills the extra tablet/desktop room without stretching the guest.
 ctx.save();ctx.globalAlpha=.24;
 for(let y=35;y<layout.stage.h-40;y+=122)for(let x=35;x<layout.stage.w;x+=156){
  const px=x+(Math.round(y/122)%2)*35;ctx.fillStyle='#fff0cf';
  for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.ellipse(px+Math.cos(a)*7,y+Math.sin(a)*7,5,6,a,0,Math.PI*2);ctx.fill()}
  ctx.fillStyle='#e9b67d';ctx.beginPath();ctx.arc(px,y,3,0,Math.PI*2);ctx.fill();
 }ctx.restore();
}
function drawUI(now){
 const d=layout.dock,g=ctx.createLinearGradient(d.x,d.y,d.x+d.w,d.y+d.h);
 g.addColorStop(0,'#fff6e3');g.addColorStop(1,'#f2dfbd');
 ctx.save();ctx.shadowColor='#805e4b38';ctx.shadowBlur=18;ctx.shadowOffsetY=-3;
 ctx.beginPath();ctx.roundRect(d.x+1,d.y+1,d.w-2,d.h+28,28);ctx.fillStyle=g;ctx.fill();ctx.shadowBlur=0;
 ctx.strokeStyle='#fffaf0';ctx.lineWidth=3;ctx.stroke();ctx.restore();
 for(let i=0;i<5;i++){
  const b=layout.buttons[i],active=names[i]===selected,age=(now-popAt)/360;
  const lift=active?1.03+(age>=0&&age<1?Math.sin(age*Math.PI)*.045:0):1;
  ctx.save();ctx.shadowColor='#94674c44';ctx.shadowBlur=active?10:4;ctx.shadowOffsetY=active?4:2;
  drawTool(ctx,names[i],b.x,b.y-(active?2:0),b.r*2*lift);ctx.restore();
  if(active){ctx.beginPath();ctx.arc(b.x,b.y-2,b.r*lift+2,0,Math.PI*2);ctx.strokeStyle='#fffdf1';ctx.lineWidth=3;ctx.stroke()}
 }
 for(let i=0;i<6;i++){
  const {x,y,r}=layout.colors[i],c=palette[i],gradient=ctx.createLinearGradient(x-r,y-r,x+r,y+r);
  gradient.addColorStop(0,`rgb(${c.map(v=>Math.round(v+(255-v)*.32)).join(',')})`);gradient.addColorStop(.45,`rgb(${c.join(',')})`);gradient.addColorStop(1,`rgb(${c.map(v=>Math.round(v*.79)).join(',')})`);
  ctx.save();ctx.shadowColor='#90654944';ctx.shadowBlur=4;ctx.shadowOffsetY=2;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();ctx.restore();
  ctx.strokeStyle='#fffaf0';ctx.lineWidth=3;ctx.stroke();ctx.save();ctx.translate(x-r*.32,y-r*.4);ctx.rotate(-.6);ctx.beginPath();ctx.ellipse(0,0,r*.34,r*.15,0,0,Math.PI*2);ctx.fillStyle='#ffffffaa';ctx.fill();ctx.restore();
  if(selected==='color'&&env.colorIndex===i){ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.strokeStyle='#a76c91';ctx.lineWidth=2.5;ctx.stroke()}
 }
}
let frameCount=0,lastReport=performance.now();
function render(now){const rawDt=(now-last)/1000,dt=Math.min(.034,rawDt);last=now;
 frameCount++; if(now-lastReport>1000){canvas.dataset.stats=JSON.stringify({...env.hair.stats(),selected,colorIndex:env.colorIndex,fps:Math.round(frameCount*1000/(now-lastReport)),artReady:Object.keys(art).length});lastReport=now;frameCount=0;}
 if(now>reactionUntil){if(nextExpression){expression=nextExpression;nextExpression=null;reactionUntil=now+1100}else expression='normal'}
 if(now>blinkAt&&expression==='normal'){blinkUntil=now+150;blinkAt=now+3000+Math.random()*3000}
 const show=now<blinkUntil?'blink':expression;headDx=Math.sin(now*.0008)*.24;
 tools[selected].update?.(dt);env.hair.step(dt,844,headDx);
 ctx.setTransform(canvas.width/layout.width,0,0,canvas.height/layout.height,0,0);drawBackdrop();
 ctx.save();ctx.beginPath();ctx.rect(layout.stage.x,layout.stage.y,layout.stage.w,layout.stage.h);ctx.clip();
 ctx.translate(layout.world.x,layout.world.y);ctx.scale(layout.world.scale,layout.world.scale);
 plate();env.hair.draw(ctx,false);head(art[show]);env.hair.draw(ctx,true);env.hair.drawFallen(ctx);tools[selected].drawOverlay(ctx);ctx.restore();
 drawUI(now);requestAnimationFrame(render)
}
requestAnimationFrame(render);
// Diagnostics are only exposed to local developer inspection; no text is drawn in the game.
window.__salon={hair:env.hair,stats:()=>env.hair.stats(),get selected(){return selected},artReady:Object.keys(art).length};
