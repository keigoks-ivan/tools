import {sprites} from './food-sprites.js?v=7';
const tau=Math.PI*2;
function ellipse(c,x,y,rx,ry,fill,stroke,width=2){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,tau);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function rect(c,x,y,w,h,r,fill,stroke,width=2){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=3){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function radial(c,x,y,r,a,b){const g=c.createRadialGradient(x-r*.25,y-r*.3,2,x,y,r);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function shadow(c,x,y,rx,ry){ellipse(c,x,y,rx,ry,'#69543b22');}
export function whole(c,atlas,id,x,y,size){
  shadow(c,x,y+size*.33,size*.33,size*.08);
  if(atlas?.complete&&atlas.naturalWidth){const [sx,sy,sw,sh]=sprites[id].frame,k=size/Math.max(sw,sh);c.drawImage(atlas,sx,sy,sw,sh,x-sw*k/2,y-sh*k/2,sw*k,sh*k);}
  else if(id==='tomato'){ellipse(c,x,y,size*.4,size*.36,radial(c,x,y,size*.45,'#ff9270','#cf3328'));line(c,[[x-25,y-size*.32],[x,y-size*.4],[x+30,y-size*.31]],'#4f8151',9);}
  else ellipse(c,x,y,size*.3,size*.4,radial(c,x,y,size*.43,'#fff2da','#bc926f'));
}
export function tomato(c,p,x,y,k=1,cooked=0,atlas){
  c.save();c.translate(x,y);c.scale(k,k);
  if(!p.cut){whole(c,atlas,'tomato',p.ox,p.oy,310);c.restore();return;}
  c.beginPath();p.poly.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.closePath();c.fillStyle='#be3427';c.shadowColor='#642e1c35';c.shadowBlur=8;c.shadowOffsetY=7;c.fill();c.shadowColor='transparent';c.clip();
  const ox=p.ox,oy=p.oy;
  ellipse(c,ox,oy,140,112,radial(c,ox,oy,145,cooked>.5?'#ed9470':'#fa8660',cooked>.5?'#c7462b':'#e34b32'));
  ellipse(c,ox,oy,123,96,'#ef7452');
  for(let i=0;i<5;i++){
    c.save();c.translate(ox,oy);c.rotate(i*tau/5-.4);c.beginPath();c.moveTo(12,0);c.bezierCurveTo(52,-37,104,-30,112,0);c.bezierCurveTo(105,32,53,39,12,0);c.fillStyle=cooked>.5?'#ca4d32':'#c6432d';c.fill();
    ellipse(c,78,0,28,13,'#ec9e5366');
    for(let j=0;j<4;j++){c.save();c.translate(44+j*15,(j%2?1:-1)*12);c.rotate((j-2)*.4);ellipse(c,0,0,7,3.5,'#ffd98b');c.restore();}c.restore();
  }
  ellipse(c,ox,oy,19,15,'#f6b185');line(c,[[ox-108,oy-40],[ox-95,oy-56]],'#ffc9a255',7);c.restore();
}
export function board(c,x,y,rx,ry){
  shadow(c,x,y+ry,rx*.93,21);rect(c,x-rx,y-ry+12,rx*2,ry*2,35,'#b48556');
  const g=c.createLinearGradient(x-rx,y-ry,x+rx,y+ry);g.addColorStop(0,'#f2d5a2');g.addColorStop(.5,'#e8c08a');g.addColorStop(1,'#dbad72');rect(c,x-rx,y-ry,rx*2,ry*2,35,g,'#d1a06b',3);
  c.save();c.beginPath();c.roundRect(x-rx+6,y-ry+6,rx*2-12,ry*2-12,30);c.clip();
  for(let i=0;i<13;i++){const yy=y-ry+18+i*ry*2/13;c.beginPath();c.moveTo(x-rx,yy);c.bezierCurveTo(x-rx*.3,yy+Math.sin(i)*10,x+rx*.4,yy-5,x+rx,yy+7);c.strokeStyle=i%3?'#c6955f44':'#fff2cb66';c.lineWidth=i%3?2:4;c.stroke();}c.restore();
  ellipse(c,x+rx-32,y-ry+31,10,10,'#b18352');ellipse(c,x+rx-32,y-ry+30,6,6,'#906945');
}
export function bowl(c,x,y,r,mix=0,filled=true,angle=0,time=0){
  c.save();c.translate(x,y);c.rotate(angle);shadow(c,0,r*.55,r*.8,r*.12);
  c.beginPath();c.moveTo(-r,-r*.1);c.bezierCurveTo(-r*.83,r*.84,r*.83,r*.84,r,-r*.1);c.closePath();c.fillStyle=radial(c,0,0,r,'#d0e5de','#729d92');c.fill();
  ellipse(c,0,-r*.08,r,r*.6,'#eff1d8','#85aaa0',6);ellipse(c,0,-r*.08,r*.88,r*.49,filled?mix<.8?'#f5e3a4':'#f7c744':'#d2ded2');
  if(filled){
    c.save();c.beginPath();c.ellipse(0,-r*.08,r*.86,r*.47,0,0,tau);c.clip();
    if(mix<.9){c.globalAlpha=1-mix;ellipse(c,-r*.15,-r*.13,r*.55,r*.28,'#fff8d8aa');ellipse(c,r*.15,-r*.08,r*.25,r*.23,radial(c,r*.15,-r*.08,r*.28,'#ffda45','#f2a320'));ellipse(c,r*.08,-r*.17,r*.09,r*.04,'#fff3a7aa');c.globalAlpha=1;}
    if(mix>0)for(let i=0;i<4;i++){c.beginPath();c.ellipse(0,-r*.08,r*(.2+i*.15),r*(.10+i*.065),time*2+i*.3,0,Math.PI*1.35);c.strokeStyle=i%2?'#fff0a788':'#dea43066';c.lineWidth=6;c.stroke();}c.restore();
  }
  line(c,[[-r*.68,r*.26],[-r*.5,r*.43]],'#e6f0df99',9);c.restore();
}
export function knife(c,x,y,angle=0){
  c.save();c.translate(x,y);c.rotate(angle);c.shadowColor='#503f3533';c.shadowBlur=9;c.shadowOffsetY=7;
  const g=c.createLinearGradient(-95,-22,-95,40);g.addColorStop(0,'#9aaeb0');g.addColorStop(.45,'#edf2ed');g.addColorStop(1,'#b9c9c6');
  c.beginPath();c.moveTo(-112,-23);c.lineTo(38,-23);c.lineTo(38,43);c.lineTo(-78,43);c.quadraticCurveTo(-112,40,-112,-23);c.fillStyle=g;c.fill();c.shadowColor='transparent';line(c,[[-77,37],[36,37]],'#fffef0',4);rect(c,29,-28,104,34,12,'#936446','#704630',2);ellipse(c,48,-11,4,4,'#ddc5a2');ellipse(c,110,-11,4,4,'#ddc5a2');c.restore();
}
export function spoon(c,x,y,angle=0,whisk=false){
  c.save();c.translate(x,y);c.rotate(angle);line(c,[[0,0],[87,-115]],whisk?'#709189':'#a67948',17);line(c,[[8,-10],[86,-112]],whisk?'#cadcd1':'#e0b775',8);
  if(whisk){for(let i=0;i<4;i++){c.beginPath();c.ellipse(-3,7,16+i*7,41,-.65,0,tau);c.strokeStyle=i%2?'#91ada4':'#dde7db';c.lineWidth=4;c.stroke();}}
  else{c.save();c.rotate(.65);rect(c,-29,-11,58,70,10,'#dab276','#ab7d48',3);line(c,[[-13,5],[-13,42]],'#ab7d48',4);line(c,[[4,5],[4,42]],'#ab7d48',4);c.restore();}c.restore();
}
export function pan(c,x,y,r,heat=false,time=0,onStove=true){
  shadow(c,x,y+r*.55,r*1.13,r*.16);if(onStove)rect(c,x-r*1.23,y-r*.75,r*2.46,r*1.65,30,'#c7d1c8','#aab6ab',4);
  if(heat){ellipse(c,x,y+8,r*1.02,r*.69,'#e9984388');for(let i=0;i<11;i++){const a=i*tau/11;ellipse(c,x+Math.cos(a)*r*.87,y+Math.sin(a)*r*.59+8,9,18+Math.sin(time*9+i)*4,'#ffcf71');}}
  c.save();c.translate(x,y);c.rotate(-.34);rect(c,r*.75,-14,r*.68,46,16,'#3c514c','#2e403b',4);line(c,[[r*.91,0],[r*1.31,0]],'#7b9182',6);c.restore();
  ellipse(c,x,y+10,r,r*.72,'#354841','#273d35',5);ellipse(c,x,y,r*.98,r*.69,radial(c,x,y,r,'#687466','#364b40'),'#93a093',7);
  ellipse(c,x,y+3,r*.84,r*.56,'#d7b15c22');
}
function curd(c,p,x,y,k,cooked){
  c.save();c.translate(x,y);c.rotate(p.angle);c.scale(k,k);c.beginPath();c.moveTo(-p.size,-5);c.bezierCurveTo(-p.size-5,-20,5,-24,p.size,-12);c.bezierCurveTo(p.size+10,5,10,18,-3,16);c.bezierCurveTo(-17,24,-p.size-4,11,-p.size,-5);c.fillStyle=radial(c,0,0,40,'#ffe78d',cooked>.8?'#e8ac36':'#f4c65b');c.shadowColor='#a4692033';c.shadowBlur=3;c.shadowOffsetY=3;c.fill();c.shadowColor='transparent';line(c,[[-p.size+5,-4],[-2,-10],[9,-7]],'#fff0ad88',3);c.restore();
}
export function contents(c,s,x,y,r,atlas,time=0,portion=1,plated=false){
  const k=r/210;
  if(!plated&&s.poured.egg){const solid=s.cooked;c.globalAlpha=1-solid;ellipse(c,x,y,r*.75,r*.47,radial(c,x,y,r,'#ffdf77',solid>.7?'#eeb942':'#f3cb5688'));if(solid<.8){ellipse(c,x-35*k,y-15*k,r*.43,r*.2,'#fff5b344');for(let i=0;i<8;i++)ellipse(c,x+Math.cos(i*2.4+time)*r*.63,y+Math.sin(i*2.4+time)*r*.38,3+Math.sin(time*4+i)*1.5,2,'#fff5ca99');}c.globalAlpha=1;}
  const eggs=s.food.filter(p=>p.kind==='egg'),tomatoes=s.food.filter(p=>p.kind==='tomato');
  if(s.cooked>.2||plated)eggs.slice(0,Math.ceil(eggs.length*portion)).forEach(p=>{c.globalAlpha=plated?1:Math.min(1,(s.cooked-.2)*2);curd(c,p,x+p.x*k,y+p.y*k,k,s.cooked);});c.globalAlpha=1;
  tomatoes.slice(0,Math.ceil(tomatoes.length*portion)).forEach(p=>{c.save();c.translate(x+p.x*k,y+p.y*k);c.rotate(p.angle);tomato(c,p.piece,0,0,k*.43,s.cooked,atlas);c.restore();});
}
export function plateDish(c,x,y,r,s=null,atlas=null,portion=1){
  shadow(c,x,y+r*.57,r*.94,r*.13);ellipse(c,x,y+9,r,r*.66,'#d6dfce');ellipse(c,x,y,r,r*.65,radial(c,x,y,r,'#fffef1','#e9eddb'),'#a5bbae',5);ellipse(c,x,y,r*.83,r*.52,'#fffbea','#d1dcc8',3);
  line(c,[[x-r*.78,y-r*.16],[x-r*.62,y-r*.33]],'#fff',7);
  if(s)contents(c,s,x,y,r*.78,atlas,0,portion,true);
  else{const eggs=Array.from({length:12},(_,i)=>({kind:'egg',x:Math.cos(i*2.4)*(30+i%3*25),y:Math.sin(i*2.4)*(20+i%3*18),angle:i,size:23}));const p={poly:[{x:-62,y:-50},{x:78,y:-24},{x:25,y:80}],x:0,y:0,ox:0,oy:0,cut:true};contents(c,{cooked:1,food:[...eggs,...Array.from({length:5},(_,i)=>({kind:'tomato',piece:p,x:Math.cos(i*2.4)*92,y:Math.sin(i*2.4)*53,angle:i}))],poured:{egg:true}},x,y,r*.8,atlas,0,1,true);}
}
export function guest(c,x,y,r,{chew=0,bites=0,near=false,time=0,customer=0}={}){
  const bunny=customer%2===1;shadow(c,x,y+r*1.02,r*.66,r*.12);
  const fur=bunny?'#ddd7c3':'#b98054',light=bunny?'#fff7df':'#e8bd87';
  if(bunny){ellipse(c,x-r*.38,y-r*.82,r*.23,r*.7,fur);ellipse(c,x+r*.38,y-r*.82,r*.23,r*.7,fur);ellipse(c,x-r*.38,y-r*.83,r*.1,r*.46,'#e6aaa0');ellipse(c,x+r*.38,y-r*.83,r*.1,r*.46,'#e6aaa0');}
  else{ellipse(c,x-r*.7,y-r*.54,r*.35,r*.35,fur);ellipse(c,x+r*.7,y-r*.54,r*.35,r*.35,fur);ellipse(c,x-r*.7,y-r*.54,r*.19,r*.19,'#e0ad7c');ellipse(c,x+r*.7,y-r*.54,r*.19,r*.19,'#e0ad7c');}
  ellipse(c,x,y+r*.79,r*.68,r*.5,'#789e8b');rect(c,x-r*.45,y+r*.45,r*.9,r*.8,20,'#fff2d9');line(c,[[x-r*.28,y+r*.59],[x+r*.28,y+r*.59]],'#d0bd97',4);
  ellipse(c,x,y,r,r*.88,radial(c,x,y,r,light,fur));ellipse(c,x,y+r*.27,r*.55,r*.38,bunny?'#fff9e8':'#f2d3a5');
  const happy=bites===3||chew>0;
  for(const sign of [-1,1]){const ex=x+sign*r*.37,ey=y-r*.13;
    if(happy){c.beginPath();c.arc(ex,ey+6,r*.11,Math.PI,0);c.strokeStyle='#443c30';c.lineWidth=7;c.lineCap='round';c.stroke();}
    else{ellipse(c,ex,ey,r*.095,r*.125,'#453d32');ellipse(c,ex-r*.025,ey-r*.035,r*.027,r*.032,'#fff9e9');}
    ellipse(c,x+sign*r*.6,y+r*.22,r*.13,r*.07,'#e68a7388');
  }
  ellipse(c,x,y+r*.16,r*.10,r*.075,'#6c4e3b');
  if(near){ellipse(c,x,y+r*.43,r*.24,r*.23,'#50392e');ellipse(c,x,y+r*.54,r*.16,r*.06,'#e8a49b');}
  else if(chew>0){ellipse(c,x,y+r*.42,r*(.10+Math.sin(time*15)*.025),r*.07,'#7f4938');ellipse(c,x+r*.49,y+r*.28,r*(.07+Math.sin(time*15)*.03),r*.10,light);}
  else{c.beginPath();c.arc(x,y+r*.3,r*.18,0,Math.PI);c.strokeStyle='#765040';c.lineWidth=5;c.stroke();}
  if(bites>0){c.font=`${r*.27}px serif`;c.fillText('♥',x+r*.76,y-r*.5-Math.sin(time*2)*8);}
}
export function layout(w,h){
  const wide=w/h>1.35,r=Math.min(w*.30,h*.38),cx=w*.5,cy=h*.50;
  return {wide,w,h,board:{x:cx,y:cy,rx:Math.min(w*.43,400),ry:Math.min(h*.31,235)},cutScale:Math.min(w/720,h/560)*1.18,bowl:{x:cx,y:h*.57,r:Math.min(w*.35,h*.32)},egg:{x:cx,y:h*.23,size:Math.min(w*.28,h*.30)},pan:{x:cx,y:wide?h*.45:h*.61,r},tomatoSource:{x:wide?w*.16:w*.23,y:wide?h*.38:h*.22,r:Math.min(w*.15,h*.19)},eggSource:{x:wide?w*.84:w*.77,y:wide?h*.38:h*.22,r:Math.min(w*.16,h*.18)},dial:{x:cx+r*.95,y:(wide?h*.45:h*.61)+r*.76,r:34},plate:{x:cx,y:h*.65,r:Math.min(w*.35,h*.28)},friend:{x:wide?w*.75:cx,y:wide?h*.38:h*.27,r:Math.min(w*.21,h*.18)},meal:{x:wide?w*.30:cx,y:wide?h*.62:h*.70,r:Math.min(w*.27,h*.22)},selectFoods:{tomato:{x:w*.27,y:h*.28},egg:{x:w*.73,y:h*.28}},basket:{x:cx,y:h*.72,rx:w*.39,ry:Math.min(h*.18,130)}};
}
function arrow(c,a,b,time=0){c.save();c.globalAlpha=.65+Math.sin(time*3)*.15;line(c,[[a.x,a.y],[b.x,b.y]],'#fff8e6',9);const angle=Math.atan2(b.y-a.y,b.x-a.x);line(c,[[b.x-Math.cos(angle-.65)*22,b.y-Math.sin(angle-.65)*22],[b.x,b.y],[b.x-Math.cos(angle+.65)*22,b.y-Math.sin(angle+.65)*22]],'#fff8e6',9);c.restore();}
function hand(c,x,y,scale=1){c.save();c.translate(x,y);c.scale(scale,scale);c.shadowColor='#76675155';c.shadowBlur=8;c.font='52px serif';c.fillText('👆',-20,25);c.restore();}
export function drawScene(c,w,h,s,atlas,{time=0,gesture=null,hint=false,customer=0}={}){
  const l=layout(w,h);c.clearRect(0,0,w,h);
  const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#dce8df');bg.addColorStop(1,'#c8d8ce');c.fillStyle=bg;c.fillRect(0,0,w,h);
  c.strokeStyle='#eef3e855';c.lineWidth=2;for(let x=0;x<w;x+=90)line(c,[[x,0],[x,h*.23]],'#f0f4e94d',2);for(let y=0;y<h*.23;y+=65)line(c,[[0,y],[w,y]],'#f0f4e94d',2);
  rect(c,w*.04,12,w*.22,h*.16,16,'#fbf7e6');rect(c,w*.04+7,19,w*.22-14,h*.16-14,12,'#b9d5d0');line(c,[[w*.15,20],[w*.15,h*.16+8]],'#fbf7e6',7);ellipse(c,w*.09,h*.07,14,14,'#f8df98');
  const counter=c.createLinearGradient(0,h*.2,0,h);counter.addColorStop(0,'#e8d4b2');counter.addColorStop(1,'#d7b68c');rect(c,-5,h*.20,w+10,h*.80,28,counter);
  for(let i=0;i<10;i++)line(c,[[0,h*.22+i*h*.09],[w,h*.235+i*h*.09]],'#c39d701a',2);
  if(s.stage!=='feed'&&s.stage!=='done'){const r=Math.min(53,h*.10);plateDish(c,w-r-22,r*.73+12,r);}
  const g=gesture,p=g?.point;
  if(s.stage==='choose'){
    const b=l.basket;board(c,b.x,b.y,b.rx,b.ry);
    for(const id of ['tomato','egg']){const q=l.selectFoods[id];if(!s.picked[id]&&g?.kind!==id){rect(c,q.x-w*.18,q.y-h*.16,w*.36,h*.32,24,'#eff2db99','#93b2a088',3);whole(c,atlas,id,q.x,q.y,Math.min(w*.34,h*.32));}else if(s.picked[id])whole(c,atlas,id,b.x+(id==='tomato'?-b.rx*.43:b.rx*.43),b.y,Math.min(w*.28,b.ry*1.7));else whole(c,atlas,id,p.x,p.y,Math.min(w*.34,h*.32));}
    if(hint){const id=s.picked.tomato?'egg':'tomato',q=l.selectFoods[id],t=(Math.sin(time*2)+1)/2;arrow(c,{x:q.x,y:q.y+55},{x:b.x,y:b.y-45},time);hand(c,q.x+(b.x-q.x)*t,q.y+(b.y-q.y)*t);}
  }
  if(s.stage==='chop'){
    const b=l.board;board(c,b.x,b.y,b.rx,b.ry);s.pieces.forEach(q=>tomato(c,q,b.x+q.x*l.cutScale,b.y+q.y*l.cutScale,l.cutScale,0,atlas));
    knife(c,p?.x??b.x+b.rx*.68,p?.y??b.y-b.ry*.34,p?-.55:-.8);
    if(hint){const yy=b.y+Math.sin(time*2)*90*l.cutScale;line(c,[[b.x,b.y-b.ry*.65],[b.x,b.y+b.ry*.65]],'#fff5dbaa',6);hand(c,b.x,yy);}
  }
  if(s.stage==='crack'){
    const b=l.bowl;bowl(c,b.x,b.y,b.r,0,s.cracked,0,time);
    if(!s.cracked)whole(c,atlas,'egg',p?.x??l.egg.x,p?.y??l.egg.y,l.egg.size);
    else{const t=s.crackAge??0,spread=Math.min(1,t*2)*70;for(const sign of [-1,1]){c.save();c.translate(l.egg.x+sign*spread,l.egg.y+Math.min(60,t*45));c.rotate(sign*t*.4);c.beginPath();c.ellipse(0,0,44,58,0,sign<0?Math.PI/2:-Math.PI/2,sign<0?Math.PI*1.5:Math.PI/2);c.closePath();c.fillStyle=radial(c,0,0,65,'#fff0d5','#cda984');c.fill();c.restore();}if(t<.8)line(c,[[l.egg.x,l.egg.y+40],[b.x,b.y]],'#fff4b8aa',14);}
    if(hint&&!s.cracked){arrow(c,{x:l.egg.x,y:l.egg.y+45},{x:b.x+b.r*.45,y:b.y-b.r*.4},time);hand(c,l.egg.x+Math.sin(time*2)*40,l.egg.y+55);}
  }
  if(s.stage==='whisk'){
    const b={...l.bowl,y:h*.5};bowl(c,b.x,b.y,b.r,s.mix,true,0,time);spoon(c,p?.x??b.x+b.r*.35,p?.y??b.y+b.r*.15,-.25,true);
    if(hint)hand(c,b.x+Math.cos(time*2)*b.r*.5,b.y+Math.sin(time*2)*b.r*.25);
  }
  if(s.stage==='pour'||s.stage==='cook'){
    const q=l.pan;pan(c,q.x,q.y,q.r,s.heat,time);contents(c,s,q.x,q.y,q.r,atlas,time);
    if(s.stage==='pour'){
      const ts=l.tomatoSource,es=l.eggSource;
      if(!s.poured.tomato){const at=g?.kind==='tomato'?p:ts;board(c,at.x,at.y,ts.r,ts.r*.65);s.pieces.forEach(v=>tomato(c,v,at.x+v.x*.42,at.y+v.y*.42,.42,0,atlas));}
      if(!s.poured.egg){const at=g?.kind==='egg'?p:es;bowl(c,at.x,at.y,es.r,1,true,g?.kind==='egg'?.22:0,time);}
      if(s.transfer){const from=s.transfer.id==='egg'?es:ts,t=s.transfer.t;arrow(c,from,{x:q.x,y:q.y},time);if(t<.75&&s.transfer.id==='egg')line(c,[[from.x,from.y],[q.x,q.y]],'#fbd668',14*(1-t));}
      if(hint&&!s.transfer){const from=s.poured.tomato?es:ts,t=(Math.sin(time*2)+1)/2;arrow(c,from,{x:q.x,y:q.y},time);hand(c,from.x+(q.x-from.x)*t,from.y+(q.y-from.y)*t);}
    }else{
      const d=l.dial;ellipse(c,d.x,d.y,d.r+7,d.r+7,'#e6e7d5','#9baba0',3);ellipse(c,d.x,d.y,d.r,d.r,s.heat?'#f1be67':'#d1dcc8');line(c,[[d.x,d.y],[d.x+(s.heat?20:-19),d.y-18]],'#6d7f6b',7);c.font='25px serif';c.fillText(s.heat?'🔥':'○',d.x-12,d.y+d.r+33);
      spoon(c,p?.x??q.x+q.r*.48,p?.y??q.y+q.r*.23,.1);
      if(s.heat)for(let i=0;i<4;i++){const t=(time*.48+i*.23)%1;c.globalAlpha=(1-t)*.4;line(c,[[q.x+(i-1.5)*q.r*.34,q.y-q.r*.24-t*70],[q.x+(i-1.5)*q.r*.34+Math.sin(t*8+i)*10,q.y-q.r*.34-t*95]],'#fff9e6',8);}c.globalAlpha=1;
      if(hint){if(!s.heat)hand(c,d.x,d.y);else hand(c,q.x+Math.cos(time*2)*q.r*.4,q.y+Math.sin(time*2)*q.r*.25);}
    }
  }
  if(s.stage==='plate'){
    const q={...l.pan,y:h*.25,r:Math.min(w*.28,h*.21)},b=l.plate;plateDish(c,b.x,b.y,b.r,s.plated&&!s.transfer?s:{food:[],cooked:1,poured:{}},atlas);
    if(!s.plated||s.transfer){const t=s.transfer?.t??0,at=p??{x:q.x+(b.x-q.x)*t,y:q.y+(b.y-q.y)*t};c.save();c.translate(at.x,at.y);c.rotate(g?.kind==='pan'?.20:t*.28);pan(c,0,0,q.r,false,time,false);contents(c,s,0,0,q.r,atlas,time,Math.max(0,1-t));c.restore();}
    if(s.transfer){const t=s.transfer.t;contents(c,s,b.x,b.y,b.r*.78,atlas,time,Math.min(1,t),true);}
    if(hint&&!s.plated){arrow(c,{x:q.x,y:q.y+55},{x:b.x,y:b.y-55},time);const t=(Math.sin(time*2)+1)/2;hand(c,q.x+(b.x-q.x)*t,q.y+(b.y-q.y)*t);}
  }
  if(s.stage==='feed'||s.stage==='done'){
    const q=l.friend,b=l.meal,mouth={x:q.x,y:q.y+q.r*.43},near=p&&Math.hypot(p.x-mouth.x,p.y-mouth.y)<q.r*.75;guest(c,q.x,q.y,q.r,{...s,near,time,customer});plateDish(c,b.x,b.y,b.r,s,atlas,1-s.bites/3);
    if(g?.kind==='bite'){spoon(c,p.x,p.y,.8);curd(c,{size:21,angle:.3},p.x,p.y,1.25,1);const piece=s.pieces[0];if(piece)tomato(c,piece,p.x-18,p.y-8,.18,1,atlas);}
    if(hint&&s.stage==='feed'&&!s.chew){arrow(c,{x:b.x,y:b.y-b.r*.2},mouth,time);const t=(Math.sin(time*2)+1)/2;hand(c,b.x+(mouth.x-b.x)*t,b.y+(mouth.y-b.y)*t);}
    if(s.stage==='done'){for(let i=0;i<8;i++){const a=i*tau/8;c.font='27px serif';c.fillText(i%2?'✦':'♥',q.x+Math.cos(a)*(q.r*1.2),q.y+Math.sin(a)*(q.r*.93)-18);}}
  }
  return l;
}
