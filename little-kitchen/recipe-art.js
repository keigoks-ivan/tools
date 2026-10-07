const artwork={};
export const artURL=id=>new URL(`./assets/recipe-v9/${id}.webp`,import.meta.url).href;
export function loadArtwork(){
  const ids=['kitchen','tomato','egg','tomato-cut','curd','board','bowl','pan','plate','knife','whisk','spatula','bear','stove','spoon'];
  const art={ready:null};art.ready=Promise.all(ids.map(id=>new Promise(resolve=>{const im=new Image();artwork[id]=im;art[id]=im;im.onload=()=>resolve(true);im.onerror=()=>resolve(false);im.src=artURL(id);}))).then(ok=>ok.every(Boolean));return art;
}
function loaded(id){return artwork[id]?.complete&&artwork[id]?.naturalWidth>0;}
function image(c,id,x,y,w,h){c.drawImage(artwork[id],x-w/2,y-h/2,w,h);}
const tau=Math.PI*2;
function ellipse(c,x,y,rx,ry,fill,stroke,width=2){c.beginPath();c.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,tau);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function rect(c,x,y,w,h,r,fill,stroke,width=2){c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke();}}
function line(c,points,color,width=3){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
function radial(c,x,y,r,a,b){const g=c.createRadialGradient(x-r*.25,y-r*.3,2,x,y,r);g.addColorStop(0,a);g.addColorStop(1,b);return g;}
function shadow(c,x,y,rx,ry){ellipse(c,x,y,rx,ry,'#69543b22');}
export function whole(c,atlas,id,x,y,size){
  shadow(c,x,y+size*.33,size*.33,size*.08);
  if(loaded(id)){const im=artwork[id],k=size/Math.max(im.width,im.height);c.drawImage(im,x-im.width*k/2,y-im.height*k/2,im.width*k,im.height*k);}
  else if(id==='tomato'){ellipse(c,x,y,size*.4,size*.36,radial(c,x,y,size*.45,'#ff9270','#cf3328'));line(c,[[x-25,y-size*.32],[x,y-size*.4],[x+30,y-size*.31]],'#4f8151',9);}
  else ellipse(c,x,y,size*.3,size*.4,radial(c,x,y,size*.43,'#fff2da','#bc926f'));
}
export function tomato(c,p,x,y,k=1,cooked=0,atlas){
  c.save();c.translate(x,y);c.scale(k,k);
  if(!p.cut){whole(c,atlas,'tomato',p.ox,p.oy,310);c.restore();return;}
  c.beginPath();p.poly.forEach((q,i)=>i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y));c.closePath();c.fillStyle='#be3427';c.shadowColor='#642e1c35';c.shadowBlur=8;c.shadowOffsetY=7;c.fill();c.shadowColor='transparent';c.clip();
  const ox=p.ox,oy=p.oy;
  if(loaded('tomato-cut')){c.drawImage(artwork['tomato-cut'],ox-145,oy-117,290,234);c.restore();return;}
  ellipse(c,ox,oy,140,112,radial(c,ox,oy,145,cooked>.5?'#ed9470':'#fa8660',cooked>.5?'#c7462b':'#e34b32'));
  ellipse(c,ox,oy,123,96,'#ef7452');
  for(let i=0;i<5;i++){
    c.save();c.translate(ox,oy);c.rotate(i*tau/5-.4);c.beginPath();c.moveTo(12,0);c.bezierCurveTo(52,-37,104,-30,112,0);c.bezierCurveTo(105,32,53,39,12,0);c.fillStyle=cooked>.5?'#ca4d32':'#c6432d';c.fill();
    ellipse(c,78,0,28,13,'#ec9e5366');
    for(let j=0;j<4;j++){c.save();c.translate(44+j*15,(j%2?1:-1)*12);c.rotate((j-2)*.4);ellipse(c,0,0,7,3.5,'#ffd98b');c.restore();}c.restore();
  }
  ellipse(c,ox,oy,19,15,'#f6b185');line(c,[[ox-108,oy-40],[ox-95,oy-56]],'#ffc9a255',7);c.restore();
}
export function board(c,x,y,rx,ry,portrait=false){
  if(loaded('board')){shadow(c,x,y+ry*.85,rx*.95,ry*.16);c.save();c.translate(x,y);if(portrait){c.rotate(Math.PI/2);image(c,'board',0,0,ry*2,rx*2);}else image(c,'board',0,0,rx*2,ry*2);c.restore();return;}
  shadow(c,x,y+ry,rx*.93,21);rect(c,x-rx,y-ry+12,rx*2,ry*2,35,'#b48556');
  const g=c.createLinearGradient(x-rx,y-ry,x+rx,y+ry);g.addColorStop(0,'#f2d5a2');g.addColorStop(.5,'#e8c08a');g.addColorStop(1,'#dbad72');rect(c,x-rx,y-ry,rx*2,ry*2,35,g,'#d1a06b',3);
  c.save();c.beginPath();c.roundRect(x-rx+6,y-ry+6,rx*2-12,ry*2-12,30);c.clip();
  for(let i=0;i<13;i++){const yy=y-ry+18+i*ry*2/13;c.beginPath();c.moveTo(x-rx,yy);c.bezierCurveTo(x-rx*.3,yy+Math.sin(i)*10,x+rx*.4,yy-5,x+rx,yy+7);c.strokeStyle=i%3?'#c6955f44':'#fff2cb66';c.lineWidth=i%3?2:4;c.stroke();}c.restore();
  ellipse(c,x+rx-32,y-ry+31,10,10,'#b18352');ellipse(c,x+rx-32,y-ry+30,6,6,'#906945');
}
export function bowl(c,x,y,r,mix=0,filled=true,angle=0,time=0,fill=1){
  c.save();c.translate(x,y);c.rotate(angle);shadow(c,0,r*.80,r*.86,r*.15);
  if(loaded('bowl'))image(c,'bowl',0,r*.25,r*2,r*1.69);
  else{ellipse(c,0,r*.2,r,r*.75,'#8baea0');ellipse(c,0,0,r,r*.60,'#fff7e4','#b5cebe',6);}
  if(filled){
    c.save();c.beginPath();c.ellipse(0,0,r*.85,r*.49,0,0,tau);c.clip();
    const surface=radial(c,0,0,r,mix>.8?'#ffd350':'#fff5cd',mix>.8?'#efa52d':'#e8d58f');
    c.globalAlpha=fill;ellipse(c,0,0,r*.85,r*.49,surface);
    if(mix<.92){c.globalAlpha=fill*(1-mix);ellipse(c,-r*.12,-r*.10,r*.56,r*.29,'#fffbedaa');ellipse(c,r*.10,-r*.04,r*.29,r*.25,radial(c,r*.1,0,r*.30,'#ffe65d','#ed9c0f'));ellipse(c,r*.03,-r*.15,r*.10,r*.043,'#fff4bc99');}
    c.globalAlpha=fill;
    if(mix>0)for(let i=0;i<4;i++){c.beginPath();c.ellipse(0,0,r*(.18+i*.16),r*(.09+i*.09),Math.sin(time*2)*.12,0,Math.PI*1.5);c.strokeStyle=i%2?'#ffef9d88':'#e8a12466';c.lineWidth=7;c.stroke();}
    c.restore();
  }c.restore();
}
export function knife(c,x,y,angle=0){
  if(loaded('knife')){c.save();c.translate(x,y);c.rotate(angle);image(c,'knife',48,-29,280,73);c.restore();return;}
  c.save();c.translate(x,y);c.rotate(angle);c.shadowColor='#503f3533';c.shadowBlur=9;c.shadowOffsetY=7;
  const g=c.createLinearGradient(-95,-22,-95,40);g.addColorStop(0,'#9aaeb0');g.addColorStop(.45,'#edf2ed');g.addColorStop(1,'#b9c9c6');
  c.beginPath();c.moveTo(-112,-23);c.lineTo(38,-23);c.lineTo(38,43);c.lineTo(-78,43);c.quadraticCurveTo(-112,40,-112,-23);c.fillStyle=g;c.fill();c.shadowColor='transparent';line(c,[[-77,37],[36,37]],'#fffef0',4);rect(c,29,-28,104,34,12,'#936446','#704630',2);ellipse(c,48,-11,4,4,'#ddc5a2');ellipse(c,110,-11,4,4,'#ddc5a2');c.restore();
}
export function spoon(c,x,y,angle=0,whisk=false,feeding=false){
  const id=feeding?'spoon':whisk?'whisk':'spatula';if(loaded(id)){c.save();c.translate(x,y);c.rotate(angle);image(c,id,46,-58,178,166);c.restore();return;}
  c.save();c.translate(x,y);c.rotate(angle);line(c,[[0,0],[87,-115]],whisk||feeding?'#709189':'#a67948',17);line(c,[[8,-10],[86,-112]],whisk||feeding?'#cadcd1':'#e0b775',8);
  if(whisk){for(let i=0;i<4;i++){c.beginPath();c.ellipse(-3,7,16+i*7,41,-.65,0,tau);c.strokeStyle=i%2?'#91ada4':'#dde7db';c.lineWidth=4;c.stroke();}}
  else if(feeding)ellipse(c,-3,7,30,22,radial(c,-3,7,35,'#fffaf0','#9fafa7'),'#738c81',3);
  else{c.save();c.rotate(.65);rect(c,-29,-11,58,70,10,'#dab276','#ab7d48',3);line(c,[[-13,5],[-13,42]],'#ab7d48',4);line(c,[[4,5],[4,42]],'#ab7d48',4);c.restore();}c.restore();
}
export function pan(c,x,y,r,heat=false,time=0,onStove=true){
  if(onStove){
    shadow(c,x,y+r*.9,r*1.20,r*.2);
    if(loaded('stove')){const width=r*2.68,height=width*artwork.stove.height/artwork.stove.width;image(c,'stove',x,y+height*.22,width,height);}
    else{
    rect(c,x-r*1.22,y-r*.70,r*2.44,r*1.85,32,'#699a8a');
    rect(c,x-r*1.22,y-r*.78,r*2.44,r*1.85,32,radial(c,x,y,r*1.8,'#e9f0e1','#b9d1bb'),'#fff9dd',4);
    ellipse(c,x,y+4,r*.92,r*.66,'#719988');
    }
    if(heat){ellipse(c,x,y+6,r*1.01,r*.70,'#ffb340');for(let i=0;i<14;i++){const a=i*tau/14;ellipse(c,x+Math.cos(a)*r*.92,y+Math.sin(a)*r*.64+7,8,16+Math.sin(time*8+i)*3,'#fff0a0');}}
  }
  shadow(c,x,y+r*.62,r*.98,r*.13);
  if(loaded('pan'))image(c,'pan',x+r*.35,y+r*.06,r*2.84,r*1.70);
  else{rect(c,x+r*.8,y-10,r*.78,r*.20,14,'#383f39');ellipse(c,x,y,r,r*.7,'#484e43','#afb9a4',7);}
}
function curd(c,p,x,y,k,cooked){
  if(loaded('curd')){c.save();c.translate(x,y);c.rotate(p.angle);image(c,'curd',0,0,p.size*k*2.5,p.size*k*2.12);c.restore();return;}
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
  if(loaded('plate')){shadow(c,x,y+r*.59,r*.95,r*.12);image(c,'plate',x,y,r*2,r*1.70);if(s)contents(c,s,x,y,r*.78,atlas,0,portion,true);else contents(c,previewDish(),x,y,r*.78,atlas,0,portion,true);return;}
  shadow(c,x,y+r*.57,r*.94,r*.13);ellipse(c,x,y+9,r,r*.66,'#d6dfce');ellipse(c,x,y,r,r*.65,radial(c,x,y,r,'#fffef1','#e9eddb'),'#a5bbae',5);ellipse(c,x,y,r*.83,r*.52,'#fffbea','#d1dcc8',3);
  line(c,[[x-r*.78,y-r*.16],[x-r*.62,y-r*.33]],'#fff',7);
  if(s)contents(c,s,x,y,r*.78,atlas,0,portion,true);
  else{const eggs=Array.from({length:12},(_,i)=>({kind:'egg',x:Math.cos(i*2.4)*(30+i%3*25),y:Math.sin(i*2.4)*(20+i%3*18),angle:i,size:23}));const p={poly:[{x:-62,y:-50},{x:78,y:-24},{x:25,y:80}],x:0,y:0,ox:0,oy:0,cut:true};contents(c,{cooked:1,food:[...eggs,...Array.from({length:5},(_,i)=>({kind:'tomato',piece:p,x:Math.cos(i*2.4)*92,y:Math.sin(i*2.4)*53,angle:i}))],poured:{egg:true}},x,y,r*.8,atlas,0,1,true);}
}
function fallbackGuest(c,x,y,r,{chew=0,bites=0,near=false,time=0,customer=0}={}){
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

function previewDish(){
  const piece={poly:[{x:-62,y:-50},{x:78,y:-24},{x:25,y:80}],x:0,y:0,ox:0,oy:0,cut:true};
  return {cooked:1,poured:{egg:true},food:[...Array.from({length:12},(_,i)=>({kind:'egg',x:Math.cos(i*2.4)*(30+i%3*25),y:Math.sin(i*2.4)*(20+i%3*18),angle:i,size:23})),...Array.from({length:5},(_,i)=>({kind:'tomato',piece,x:Math.cos(i*2.4)*92,y:Math.sin(i*2.4)*53,angle:i}))]};
}
export function guest(c,x,y,r,options={}){
  if(!loaded('bear')){fallbackGuest(c,x,y,r,options);return;}
  const {chew=0,bites=0,near=false,time=0}=options;
  const bob=chew>0?Math.sin(time*13)*r*.022:Math.sin(time*1.7)*r*.01;
  c.save();c.translate(x,y+bob);shadow(c,0,r*1.71,r*.9,r*.15);image(c,'bear',0,r*.45,r*2.40,r*2.67);
  if(near||chew>0){ellipse(c,0,r*.43,r*.245,r*.185,radial(c,0,r*.4,r*.27,'#f5e0bc','#ead1a5'));ellipse(c,0,r*.45,r*(near ? .18 : .11+Math.sin(time*13)*.024),r*(near ? .17 : .055),'#563527');if(near)ellipse(c,0,r*.56,r*.12,r*.047,'#eeb29b');}
  if(bites>0){for(let i=0;i<3;i++){c.save();c.translate(r*(.9+i*.1),-r*(.25+i*.32)-Math.sin(time*2+i)*7);c.rotate(.15);heart(c,0,0,r*(i===1?.12:.08));c.restore();}}
  c.restore();
}
function heart(c,x,y,r){c.beginPath();c.moveTo(x,y+r);c.bezierCurveTo(x-r*1.8,y-r*.3,x-r*.7,y-r*1.3,x,y-r*.5);c.bezierCurveTo(x+r*.7,y-r*1.3,x+r*1.8,y-r*.3,x,y+r);c.fillStyle='#e88b6b';c.fill();}
export function layout(w,h){
  const wide=w/h>1.35,portrait=h/w>1.2,cx=w*.5;
  const board={x:cx,y:wide?h*.58:h*.57,rx:Math.min(w*.43,410),ry:wide?h*.28:Math.min(h*.29,w*.58),portrait};
  const r=Math.min(w*.29,h*.32),pan={x:wide?w*.61:w*.45,y:wide?h*.52:h*.61,r};
  const source={x:wide?w*.21:cx,y:wide?h*.52:h*.26,r:Math.min(w*.19,h*.18)};
  return {wide,portrait,w,h,board,cutScale:wide?Math.min(w/720,h/540)*1.20:Math.min(w/720,h/480)*1.56,knife:{x:board.x+board.rx*.56,y:board.y-board.ry*.48},
    bowl:{x:cx,y:wide?h*.49:h*.55,r:Math.min(w*.36,h*.32)},egg:{x:wide?w*.27:cx,y:wide?h*.33:h*.24,size:Math.min(w*.27,h*.30)},
    whisk:{x:cx+w*.20,y:wide?h*.66:h*.66},pan,tomatoSource:source,eggSource:source,
    dial:{x:pan.x+r*.70,y:pan.y+r*.96,r:Math.max(35,r*.22)},spatula:{x:pan.x+r*.56,y:pan.y+r*.43},
    servingPan:{x:wide?w*.25:cx,y:wide?h*.43:h*.28,r:Math.min(w*.25,h*.23)},
    plate:{x:wide?w*.73:cx,y:wide?h*.62:h*.74,r:Math.min(w*.30,h*.23)},
    friend:{x:wide?w*.75:cx,y:wide?h*.38:h*.26,r:Math.min(w*.21,h*.21)},
    meal:{x:wide?w*.29:cx,y:wide?h*.61:h*.79,r:Math.min(w*.29,h*.23)},
    feedSpoon:{x:wide?w*.42:w*.72,y:wide?h*.72:h*.87},
    selectFoods:{tomato:{x:w*.27,y:wide?h*.35:h*.31},egg:{x:w*.73,y:wide?h*.35:h*.31}},selectSize:Math.min(w*.33,h*.37),
    basket:{x:cx,y:wide?h*.77:h*.76,rx:w*.40,ry:Math.min(h*.18,w*.21)}
  };
}
function focusRing(c,q,rx,ry,time,active=false){
  c.save();c.strokeStyle=active?'#fff7c5':'#fff5d7';c.lineWidth=active?9:5;c.shadowColor='#5d76525c';c.shadowBlur=8;
  c.setLineDash([12,11]);c.lineDashOffset=-time*14;c.beginPath();c.ellipse(q.x,q.y,rx,ry,0,0,tau);c.stroke();c.setLineDash([]);c.restore();
}
function hand(c,x,y,k=1){
  c.save();c.translate(x,y+36*k);c.scale(k,k);c.shadowColor='#544e4555';c.shadowBlur=10;c.shadowOffsetY=4;
  c.beginPath();c.moveTo(-8,17);c.lineTo(-9,-26);c.quadraticCurveTo(-9,-40,1,-40);c.quadraticCurveTo(11,-40,11,-27);c.lineTo(11,-5);c.quadraticCurveTo(22,-14,27,-3);c.quadraticCurveTo(38,-9,41,1);c.quadraticCurveTo(54,0,54,12);c.lineTo(54,35);c.quadraticCurveTo(51,59,28,61);c.lineTo(5,61);c.quadraticCurveTo(-10,58,-22,40);c.lineTo(-34,23);c.quadraticCurveTo(-41,9,-30,6);c.quadraticCurveTo(-23,3,-8,17);c.fillStyle='#fffaf0';c.fill();c.strokeStyle='#789488';c.lineWidth=2.8;c.stroke();line(c,[[7,36],[15,44]],'#dfdccb',3);c.restore();
}
function path(c,a,b,time){
  c.save();c.strokeStyle='#fff4d4';c.lineWidth=5;c.setLineDash([3,14]);c.lineCap='round';c.lineDashOffset=-time*9;c.beginPath();c.moveTo(a.x,a.y);c.quadraticCurveTo((a.x+b.x)/2+22,(a.y+b.y)/2,b.x,b.y);c.stroke();c.restore();
}
function demo(c,a,b,time,k=1){const t=(time%3)/3,p=t<.23?0:t>.80?1:(t-.23)/.57;path(c,a,b,time);hand(c,a.x+(b.x-a.x)*p,a.y+(b.y-a.y)*p,k);}
function background(c,w,h){
  if(loaded('kitchen')){
    // Preserve the back wall strip when a portrait screen crops the wide room.
    const im=artwork.kitchen,split=190;
    const cover=(sy,sh,y,height)=>{const scale=Math.max(w/im.width,height/sh),sw=w/scale,cropHeight=height/scale;c.drawImage(im,(im.width-sw)*.40,sy+sh-cropHeight,sw,cropHeight,0,y,w,height);};
    cover(0,split,0,h*.20);cover(split,im.height-split,h*.20,h*.80);
    c.fillStyle='#fff6dc16';c.fillRect(0,h*.20,w,h*.80);return;
  }
  c.fillStyle='#d9e4d2';c.fillRect(0,0,w,h*.2);c.fillStyle='#eac58f';c.fillRect(0,h*.2,w,h*.8);
}
function shell(c,x,y,size,sign,spread){
  c.save();c.translate(x+sign*spread,y);c.rotate(sign*.25);c.beginPath();c.moveTo(sign*size,-size);c.lineTo(sign*size,size);c.lineTo(0,size);
  for(let i=0;i<=8;i++)c.lineTo((i%2?-1:1)*size*.06,size-i*size/4);c.closePath();c.clip();whole(c,null,'egg',0,0,size*2);c.restore();
}
function dial(c,q,heat,time){
  shadow(c,q.x,q.y+q.r*.85,q.r,q.r*.17);ellipse(c,q.x,q.y,q.r+6,q.r+6,'#7b9d8a');ellipse(c,q.x,q.y-3,q.r,q.r,radial(c,q.x,q.y,q.r,heat?'#ffd991':'#fffcdf',heat?'#e89b48':'#c8d6bd'));
  line(c,[[q.x,q.y-3],[q.x+(heat?1:-1)*q.r*.48,q.y-q.r*.44]],'#476254',q.r*.15);
  if(heat){c.save();c.translate(q.x,q.y+q.r*1.10);c.scale(.65,.65);c.beginPath();c.moveTo(0,-17);c.bezierCurveTo(13,-5,22,7,12,18);c.bezierCurveTo(1,27,-17,17,-12,4);c.bezierCurveTo(-6,9,-3,-5,0,-17);c.fillStyle='#ef973e';c.fill();c.restore();}
  else focusRing(c,q,q.r*1.35,q.r*1.35,time);
}
function source(c,s,l,id,point=null,angle=0){
  const q={...l.tomatoSource,...point};c.save();c.translate(q.x,q.y);c.rotate(angle);
  if(id==='tomato'){board(c,0,0,q.r,q.r*.58);const k=q.r/230;s.pieces.forEach(p=>tomato(c,p,p.x*k,p.y*k,k,0));}
  else bowl(c,0,0,q.r,1,true,0);c.restore();
}
function flyingBite(c,s,at){
  spoon(c,at.x,at.y,.2,false,true);curd(c,{size:24,angle:.2},at.x,at.y,1,1);const p=s.pieces[0];if(p)tomato(c,p,at.x-12,at.y-5,.21,1);
}
export function drawScene(c,w,h,s,art,{time=0,stageAge=1,gesture=null,hint=false,customer=0}={}){
  const l=layout(w,h),g=gesture,p=g?.point;c.clearRect(0,0,w,h);background(c,w,h);
  c.save();if(stageAge<.28){c.globalAlpha=.65+stageAge/.28*.35;c.translate((1-stageAge/.28)*18,0);}
  if(s.stage==='choose'){
    const b=l.basket;board(c,b.x,b.y,b.rx,b.ry);
    for(const id of ['tomato','egg']){
      const q=l.selectFoods[id],slot={x:b.x+(id==='tomato'?-b.rx*.43:b.rx*.43),y:b.y},size=l.selectSize;
      if(!s.picked[id]){if(g?.kind!==id){focusRing(c,q,size*.60,size*.63,time);whole(c,art,id,q.x,q.y,size);}else{focusRing(c,slot,size*.45,b.ry*.73,time,true);whole(c,art,id,p.x,p.y,size*1.09);}}
      if(s.picked[id]&&s.fly?.id!==id)whole(c,art,id,slot.x,slot.y,Math.min(size*.82,b.ry*1.8));
      if(!s.picked[id]){c.save();c.globalAlpha=.17;whole(c,art,id,slot.x,slot.y,Math.min(size*.82,b.ry*1.8));c.restore();}
      if(s.fly?.id===id){const t=Math.min(1,s.fly.t/.5),ease=1-(1-t)**3;whole(c,art,id,s.fly.from.x+(slot.x-s.fly.from.x)*ease,s.fly.from.y+(slot.y-s.fly.from.y)*ease-Math.sin(t*Math.PI)*35,size*(1-ease*.18));}
    }
    if(hint){const id=s.picked.tomato?'egg':'tomato',q=l.selectFoods[id],slot={x:b.x+(id==='tomato'?-b.rx*.43:b.rx*.43),y:b.y};focusRing(c,slot,l.selectSize*.45,b.ry*.73,time);demo(c,q,slot,time,.80);}
  }
  if(s.stage==='chop'){
    const b=l.board;board(c,b.x,b.y,b.rx,b.ry,b.portrait);
    s.pieces.forEach(q=>tomato(c,q,b.x+q.x*l.cutScale,b.y+q.y*l.cutScale,l.cutScale,0));
    if(!readyForCuts(s)){c.save();c.setLineDash([8,10]);line(c,[[b.x,b.y-130*l.cutScale],[b.x,b.y+130*l.cutScale]],'#fff5d7',4);c.restore();}
    let at=p??l.knife;
    if(hint){at={x:b.x,y:b.y-110*l.cutScale+(time%2.6)/2.6*220*l.cutScale};hand(c,at.x+140,at.y-33,.74);}
    knife(c,at.x,at.y,(p||hint)?0:-.56);
    if(s.cutFlash){const f=s.cutFlash;c.save();c.globalAlpha=1-f.age/.4;line(c,[[f.a.x,f.a.y],[f.b.x,f.b.y]],'#fff5c3',6);c.restore();}
  }
  if(s.stage==='crack'){
    const b=l.bowl,t=s.crackAge??0;bowl(c,b.x,b.y,b.r,0,s.cracked,0,time,Math.min(1,t*2));
    if(!s.cracked){const at=p??l.egg;whole(c,art,'egg',at.x,at.y,l.egg.size);focusRing(c,{x:b.x+b.r*.58,y:b.y-b.r*.38},b.r*.19,b.r*.15,time,!!p);if(hint)demo(c,l.egg,{x:b.x+b.r*.58,y:b.y-b.r*.38},time,.75);}
    else{const size=l.egg.size*.46,spread=Math.min(1,t*1.5)*size*.65;for(const sign of [-1,1])shell(c,l.egg.x,l.egg.y+Math.min(35,t*30),size,sign,spread);if(t<.95){c.save();c.globalAlpha=Math.max(0,1-t);line(c,[[l.egg.x,l.egg.y+size*.5],[b.x,b.y]],'#fff1bf',22);line(c,[[l.egg.x,l.egg.y+size*.8],[b.x,b.y]],'#ffcf42',10);c.restore();}}
  }
  if(s.stage==='whisk'){
    const b=l.bowl;bowl(c,b.x,b.y,b.r,s.mix,true,0,p?time*1.5:time*.3);
    const at=p??(hint?{x:b.x+Math.cos(time*2.8)*b.r*.44,y:b.y+Math.sin(time*2.8)*b.r*.25}:l.whisk);
    spoon(c,at.x,at.y,-.15,true);if(hint)hand(c,at.x+100,at.y-130,.75);
    if(!p&&!hint)focusRing(c,b,b.r*.81,b.r*.46,time);
  }
  if(s.stage==='pour'||s.stage==='cook'){
    const q=l.pan;pan(c,q.x,q.y,q.r,s.heat,time);
    const display=s.transfer&&s.transfer.id!=='plate'?{...s,food:s.food.filter(v=>v.kind!==s.transfer.id||s.food.filter(u=>u.kind===v.kind).indexOf(v)<Math.ceil(s.food.filter(u=>u.kind===v.kind).length*Math.min(1,s.transfer.t))),poured:{...s.poured,egg:s.poured.egg&&!(s.transfer.id==='egg'&&s.transfer.t<.28)}}:s;
    contents(c,display,q.x,q.y,q.r,null,time);
    if(s.stage==='pour'){
      const id=s.poured.tomato?'egg':'tomato',from=l.tomatoSource;
      if(!s.transfer&&!s.poured[id]){source(c,s,l,id,p);focusRing(c,p?q:from,p?q.r*.84:from.r*1.18,p?q.r*.58:from.r*.78,time,!!p);if(hint){focusRing(c,q,q.r*.84,q.r*.58,time);demo(c,from,q,time,.76);}}
      if(s.transfer){const t=Math.min(1,s.transfer.t/1.05),start=s.transfer.from??from,at={x:start.x+(q.x-start.x)*t*.6,y:start.y+(q.y-start.y)*t*.6};c.save();c.globalAlpha=1-t;source(c,s,l,s.transfer.id,{...at,r:from.r},t*.48);c.restore();if(s.transfer.id==='egg'){c.save();c.globalAlpha=Math.max(0,1-t);line(c,[[at.x+from.r*.45,at.y],[q.x,q.y]],'#ffd55c',Math.max(2,18*(1-t)));c.restore();}else s.pieces.forEach((piece,i)=>{const a=Math.min(1,Math.max(0,(t-i*.07)*1.7));if(a<1)tomato(c,piece,at.x+(q.x-at.x)*a,at.y+(q.y-at.y)*a,from.r/230*(1-a*.40),0);});}
    }else{
      dial(c,l.dial,s.heat,time);
      if(s.heat){const at=p??(hint?{x:q.x+Math.cos(time*2.5)*q.r*.36,y:q.y+Math.sin(time*2.5)*q.r*.25}:l.spatula);spoon(c,at.x,at.y,.05);if(hint)hand(c,at.x+97,at.y-119,.73);for(let i=0;i<4;i++){const t=(time*.40+i*.24)%1;c.save();c.globalAlpha=(1-t)*.5;line(c,[[q.x+(i-1.5)*q.r*.28,q.y-q.r*.29-t*55],[q.x+(i-1.5)*q.r*.28+Math.sin(t*8+i)*10,q.y-q.r*.37-t*105]],'#fff9e6',8);c.restore();}}
      else if(hint)hand(c,l.dial.x,l.dial.y,.8);
    }
  }
  if(s.stage==='plate'){
    const q=l.servingPan,b=l.plate;plateDish(c,b.x,b.y,b.r,{food:[],cooked:1,poured:{}});
    if(!s.plated||s.transfer){const t=s.transfer?.t??0,start=s.transfer?.from??q,at=p??{x:start.x+(b.x-start.x)*t*.7,y:start.y+(b.y-start.y)*t*.7};c.save();c.translate(at.x,at.y);c.rotate(p ? .16 : t*.35);pan(c,0,0,q.r,false,time,false);contents(c,s,0,0,q.r,null,time,Math.max(0,1-t));c.restore();}
    if(s.plated)contents(c,s,b.x,b.y,b.r*.78,null,time,Math.min(1,s.transfer?.t??1),true);
    if(!s.plated){focusRing(c,b,b.r*.96,b.r*.76,time,!!p);if(hint)demo(c,q,b,time,.8);}
  }
  if(s.stage==='feed'||s.stage==='done'){
    const q=l.friend,b=l.meal,mouth={x:q.x,y:q.y+q.r*.43},near=p&&Math.hypot(p.x-mouth.x,p.y-mouth.y)<q.r*.9;
    guest(c,q.x,q.y,q.r,{...s,near,time,customer});plateDish(c,b.x,b.y,b.r,s,null,1-s.bites/3);
    if(g?.kind==='bite'){focusRing(c,mouth,q.r*.32,q.r*.26,time,true);flyingBite(c,s,p);}
    else if(s.biteFlight){const t=Math.min(1,s.biteFlight.t/.45),start=s.biteFlight.from;flyingBite(c,s,{x:start.x+(mouth.x-start.x)*t,y:start.y+(mouth.y-start.y)*t});}
    else if(s.stage==='feed'&&!s.chew){const at=l.feedSpoon;spoon(c,at.x,at.y,.2,false,true);if(hint){focusRing(c,mouth,q.r*.32,q.r*.26,time);demo(c,b,mouth,time,.8);}}
    if(s.stage==='done')for(let i=0;i<8;i++){const a=i*tau/8,r=q.r*(1.05+(i%3)*.14);c.save();c.translate(q.x+Math.cos(a)*r,q.y+Math.sin(a)*r*.7);c.rotate(a);c.fillStyle=i%2?'#ffdc74':'#fdf5cb';rect(c,-4,-4,8,8,2,c.fillStyle);c.restore();}
  }
  c.restore();return l;
}
function readyForCuts(s){return s.pieces.some(p=>p.cut);}
