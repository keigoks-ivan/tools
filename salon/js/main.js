import {HairSystem,setHairTexture,setHairPlate} from './hair.js';
import {guest,palette} from './data.js';
import {createCut} from './tools/cut.js';
import {createGrow} from './tools/grow.js';
import {createColor} from './tools/color.js';
import {createComb} from './tools/comb.js';
const canvas=document.getElementById('scene'),box=document.getElementById('game'),ctx=canvas.getContext('2d',{alpha:false});
canvas.width=390;canvas.height=844;ctx.fillStyle='#fff2db';ctx.fillRect(0,0,390,844);ctx.fillStyle='#efadc0';for(let i=0;i<5;i++){let a=i*Math.PI*2/5;ctx.beginPath();ctx.arc(195+Math.cos(a)*14,422+Math.sin(a)*14,11,0,Math.PI*2);ctx.fill()}ctx.fillStyle='#f9d37b';ctx.beginPath();ctx.arc(195,422,8,0,Math.PI*2);ctx.fill();
const art={};
await Promise.all(Object.entries(guest.art).map(([name,url])=>new Promise(resolve=>{const img=new Image();img.onload=()=>{art[name]=img;resolve()};img.onerror=()=>resolve();img.src=url})));
const textureImage=new Image();textureImage.onload=()=>setHairTexture(textureImage);textureImage.src='./assets/art/hair-texture.png';
const paintedHair=new Image();await new Promise(resolve=>{paintedHair.onload=()=>{setHairPlate(paintedHair);resolve()};paintedHair.onerror=resolve;paintedHair.src='./assets/art/hair-plate.png'});
const env={hair:new HairSystem(),H:844,colorIndex:0,react,drawTool};
const tools={cut:createCut(env),grow:createGrow(env),color:createColor(env),comb:createComb(env)};
const names=['cut','grow','color','comb','reset'],buttons=[{x:42,y:676},{x:119,y:676},{x:197,y:676},{x:275,y:676},{x:353,y:676}],wells=[42,103,167,230,293,354];
let selected='cut',pointer=null,expression='normal',reactionUntil=0,nextExpression=null,blinkAt=performance.now()+4200,blinkUntil=0,last=performance.now(),popAt=0,headDx=0;
function react(type){expression=type;reactionUntil=performance.now()+(type==='surprise'?500:1200);nextExpression=type==='surprise'?'happy':null}
function size(){let r=box.getBoundingClientRect(),d=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);ctx.setTransform(canvas.width/390,0,0,canvas.height/844,0,0)}
new ResizeObserver(size).observe(box);size();
function pos(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*390/r.width,y:(e.clientY-r.top)*844/r.height}}
function uiDown(p){for(let i=0;i<6;i++)if(Math.hypot(p.x-wells[i],p.y-753)<28){selected='color';env.colorIndex=i;popAt=performance.now();return true}
 for(let i=0;i<5;i++)if(Math.hypot(p.x-buttons[i].x,p.y-buttons[i].y)<38){if(i===4){env.hair.reset();react('happy')}else selected=names[i];popAt=performance.now();return true}return p.y>611}
canvas.addEventListener('pointerdown',e=>{e.preventDefault();if(pointer)return;const p=pos(e);canvas.setPointerCapture(e.pointerId);pointer={id:e.pointerId,ui:uiDown(p)};if(!pointer.ui)tools[selected].onDown(p)});
canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId||pointer.ui)return;e.preventDefault();const events=e.getCoalescedEvents?.()||[e];for(const q of events)tools[selected].onMove(pos(q))});
function end(e){if(!pointer||pointer.id!==e.pointerId)return;if(!pointer.ui)tools[selected].onUp(pos(e));pointer=null}
canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
function plate(img=art.normal){if(img)ctx.drawImage(img,0,0,390,844)}
function head(img){ctx.save();ctx.translate(headDx,0);ctx.beginPath();ctx.moveTo(194,184);ctx.bezierCurveTo(149,180,119,222,128,282);ctx.bezierCurveTo(110,276,118,315,143,326);ctx.quadraticCurveTo(157,347,182,353);ctx.lineTo(180,373);ctx.quadraticCurveTo(202,385,223,376);ctx.lineTo(221,350);ctx.quadraticCurveTo(246,337,254,312);ctx.bezierCurveTo(275,311,279,266,261,271);ctx.bezierCurveTo(264,223,239,181,194,184);ctx.closePath();ctx.clip();plate(img||art.normal);ctx.restore()}
function drawTool(context,type,x,y,size=44){const b=buttons[names.indexOf(type)]||buttons[0],r=36;context.save();context.beginPath();context.arc(x,y,size/2,0,Math.PI*2);context.clip();const im=art.normal;if(im)context.drawImage(im,(b.x-r)/390*im.width,(b.y-r)/844*im.height,r*2/390*im.width,r*2/844*im.height,x-size/2,y-size/2,size,size);context.restore()}
function drawUI(now){
 // The illustrated buttons are real hit targets; the selected sprite lifts above its well.
 const index=names.indexOf(selected),b=buttons[index],age=(now-popAt)/360,scale=1.03+(age>=0&&age<1?Math.sin(age*Math.PI)*.075:0);
 ctx.save();ctx.shadowColor='#97605665';ctx.shadowBlur=8;ctx.shadowOffsetY=3;drawTool(ctx,selected,b.x,b.y-2,72*scale);ctx.restore();
 ctx.beginPath();ctx.arc(b.x,b.y-2,37*scale,0,Math.PI*2);ctx.strokeStyle='#fff8df';ctx.lineWidth=2.2;ctx.stroke();
 for(let i=0;i<6;i++){let x=wells[i],y=753,r=23,c=palette[i],gradient=ctx.createLinearGradient(x-16,y-18,x+16,y+20);gradient.addColorStop(0,`rgb(${c.map(v=>Math.round(v+(255-v)*.32)).join(',')})`);gradient.addColorStop(.45,`rgb(${c.join(',')})`);gradient.addColorStop(1,`rgb(${c.map(v=>Math.round(v*.79)).join(',')})`);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle='#a4766870';ctx.lineWidth=1;ctx.stroke();ctx.save();ctx.translate(x-7,y-9);ctx.rotate(-.6);ctx.beginPath();ctx.ellipse(0,0,8,3.6,0,0,Math.PI*2);ctx.fillStyle='#ffffffaa';ctx.fill();ctx.restore();if(selected==='color'&&env.colorIndex===i){ctx.beginPath();ctx.arc(x,y,28,0,Math.PI*2);ctx.strokeStyle='#fff8e7';ctx.lineWidth=3;ctx.stroke();}}
}
let frameCount=0,lastReport=performance.now();
function render(now){const rawDt=(now-last)/1000,dt=Math.min(.034,rawDt);last=now;
 frameCount++; if(now-lastReport>1000){canvas.dataset.stats=JSON.stringify({...env.hair.stats(),selected,colorIndex:env.colorIndex,fps:Math.round(frameCount*1000/(now-lastReport)),artReady:Object.keys(art).length});lastReport=now;frameCount=0;}
 if(now>reactionUntil){if(nextExpression){expression=nextExpression;nextExpression=null;reactionUntil=now+1100}else expression='normal'}
 if(now>blinkAt&&expression==='normal'){blinkUntil=now+150;blinkAt=now+3000+Math.random()*3000}
 const show=now<blinkUntil?'blink':expression;headDx=Math.sin(now*.0008)*.24;
 tools[selected].update?.(dt);env.hair.step(dt,844,headDx);
 ctx.setTransform(canvas.width/390,0,0,canvas.height/844,0,0);ctx.fillStyle='#b8d4c6';ctx.fillRect(0,0,390,844);plate();env.hair.draw(ctx,false);head(art[show]);env.hair.draw(ctx,true);env.hair.drawFallen(ctx);drawUI(now);tools[selected].drawOverlay(ctx);requestAnimationFrame(render)
}
requestAnimationFrame(render);
// Diagnostics are only exposed to local developer inspection; no text is drawn in the game.
window.__salon={hair:env.hair,stats:()=>env.hair.stats(),get selected(){return selected},artReady:Object.keys(art).length};
