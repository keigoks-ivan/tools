import {foods} from './model.js?v=7';
import {atlasURL,sprites} from './food-sprites.js?v=7';
import {board,pan,knife,spoon,loadArtwork} from './recipe-art.js?v=9';
import {describe} from './play-state.js?v=10';
const tau=Math.PI*2;
export const asset=id=>new URL(`./assets/${['pot','blender','bunny'].includes(id)?'play-v10':'recipe-v9'}/${id}.webp`,import.meta.url).href;
const ellipse=(c,x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,Math.max(.1,rx),Math.max(.1,ry),0,0,tau);c.fillStyle=color;c.fill();};
const rect=(c,x,y,w,h,r,color)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fillStyle=color;c.fill();};
function stroke(c,points,color,width=4){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.lineWidth=width;c.strokeStyle=color;c.lineCap='round';c.stroke();}
function fit(c,im,x,y,w,h){const k=Math.min(w/im.width,h/im.height);c.drawImage(im,x-im.width*k/2,y-im.height*k/2,im.width*k,im.height*k);}
export function view(w,h){
  const wide=w/h>1.45,f=Math.min(w/780,h/610),r=Math.min(w*.34,h*(wide?.37:.29)),cx=w*.48,cy=h*(wide?.41:.48);
  const b={x:w*.50,y:h*.45,rx:Math.min(w*.45,h*.57),ry:Math.min(h*.32,w*.42)};
  return {w,h,wide,f,board:b,center:{x:cx,y:cy},r,food:{x:wide?w*.31:w*.50,y:wide?h*.57:h*.72,r:Math.min(w*.37,h*(wide?.32:.23))},
    guest:{x:wide?w*.74:w*.50,y:wide?h*.42:h*.30,r:Math.min(w*.27,h*(wide?.29:.23))},
    dial:{x:cx+r*.73,y:cy+r*.95,r:Math.max(26,Math.min(42,r*.22))},
    motor:{x:cx-r*.10,y:cy+r*.82,r:Math.max(28,r*.24)},
    transfer:{x:w*.82,y:h*.88,r:Math.min(w*.14,h*.11)},
    scale:Math.min(b.rx/315,b.ry/210),
    source:wide?{x:w*.83,y:h*.22,r:Math.min(78,h*.11)}:{x:w*.86,y:h*.17,r:Math.min(42,w*.12)}};
}
export function toFood(p,l,station='board'){
  const q=station==='board'?{x:l.board.x,y:l.board.y,k:l.scale}:{x:l.center.x,y:l.center.y,k:l.r/175};
  return {x:350+(p.x-q.x)/q.k,y:245+(p.y-q.y)/q.k};
}
export function onFood(p,l,station='board'){
  const q=station==='board'?{x:l.board.x,y:l.board.y,k:l.scale}:{x:l.center.x,y:l.center.y,k:l.r/175};return {x:q.x+(p.x-350)*q.k,y:q.y+(p.y-245)*q.k};
}
export async function createArt(canvas){
  const c=canvas.getContext('2d'),images={},art=loadArtwork();
  const atlas=new Image();await new Promise((resolve,reject)=>{atlas.onload=resolve;atlas.onerror=reject;atlas.src=atlasURL;});
  for(const id of Object.keys(foods)){const [x,y,w,h]=sprites[id].frame,k=180/Math.max(w,h),im=document.createElement('canvas');im.width=im.height=200;im.getContext('2d').drawImage(atlas,x,y,w,h,100-w*k/2,100-h*k/2,w*k,h*k);images[id]=im;}
  await Promise.all(['pot','blender','bunny'].map(id=>new Promise((resolve,reject)=>{const im=new Image();images[id]=im;im.onload=resolve;im.onerror=reject;im.src=asset(id);})));await art.ready;
  function piece(p,k=1){
    c.save();c.translate(p.x,p.y);c.rotate(p.angle);const portion=Math.sqrt(p.remaining??1);c.scale(p.scale*k*portion,p.scale*k*portion);c.beginPath();p.poly.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();
    c.shadowColor='#55442a35';c.shadowBlur=8;c.shadowOffsetY=5;c.fillStyle='#967e3c18';c.fill();c.shadowColor='transparent';c.clip();
    if(p.id==='egg'&&p.cracked){
      if(p.mixed>.22){ellipse(c,0,0,79,59,p.cooked>.6?'#eeb641':'#fbd375');for(let i=0;i<9;i++){const x=Math.cos(i*2.4)*52,y=Math.sin(i*2.4)*35;ellipse(c,x,y,17,12,p.cooked>.6?'#ffe49a':'#ffedaa88');}}
      else{ellipse(c,0,0,80,61,p.cooked>.55?'#fffbec':'#fffae2aa');ellipse(c,6,-5,31,29,'#f2ab26');ellipse(c,-4,-15,9,4,'#fff2a8');}
    }else if(p.pancake){ellipse(c,0,0,68,50,p.cooked>.5?'#d9974d':'#f3deb0');ellipse(c,-5,-5,55,38,p.cooked>.5?'#e7b668':'#fae9ca');for(let i=0;i<12;i++)ellipse(c,Math.cos(i*2.4)*45,Math.sin(i*2.4)*31,2.5,2,'#b7803b55');}
    else if(p.poured&&p.id==='milk'){ellipse(c,0,0,75,58,'#fff8e7');}
    else if(p.poured&&p.id==='flour'){ellipse(c,0,0,75,58,'#f0e5d0');}
    else if(p.id==='cheese'&&p.cooked>.4){ellipse(c,0,0,84,65,'#f9d35d');ellipse(c,-6,-6,65,48,'#ffe598');}
    else{
      c.filter=p.cooked||p.browned?`saturate(${1-p.cooked*(p.id==='chicken'?.75:.14)}) sepia(${(p.browned||0)*.7}) brightness(${1+p.cooked*(p.id==='chicken'?.14:-.04)-(p.browned||0)*.30})`:'none';
      c.drawImage(images[p.id],p.tex.x,p.tex.y,200,200);c.filter='none';
      for(const edge of p.edges||[]){stroke(c,[[edge.a.x,edge.a.y],[edge.b.x,edge.b.y]],['tomato','strawberry'].includes(p.id)?'#ffa078':p.id==='cucumber'?'#cfe7a9':'#f9dfae',12);if(['tomato','cucumber','orange'].includes(p.id))for(let i=1;i<5;i++){const x=edge.a.x+(edge.b.x-edge.a.x)*i/5,y=edge.a.y+(edge.b.y-edge.a.y)*i/5;ellipse(c,x,y,3,2,'#fff0a4');}}
    }c.restore();
  }
  function pieces(list,q,k){c.save();c.translate(q.x,q.y);c.scale(k,k);c.translate(-350,-245);for(const p of list)piece(p);c.restore();}
  function ring(q,rx,ry,t){c.save();c.setLineDash([8,9]);c.lineDashOffset=-t*9;c.beginPath();c.ellipse(q.x,q.y,rx,ry,0,0,tau);c.strokeStyle='#fff8d8';c.lineWidth=4;c.shadowColor='#99734735';c.shadowBlur=8;c.stroke();c.restore();}
  function bubbles(q,r,t){for(let i=0;i<10;i++){const x=q.x+Math.cos(i*2.4)*r*.7,y=q.y+Math.sin(i*2.4)*r*.4,rr=2+(Math.sin(t*5+i)+1)*3;ellipse(c,x,y,rr,rr,'#fff1c677');}}
  function steam(q,r,t){c.save();c.globalAlpha=.55;for(let i=0;i<3;i++){const yy=q.y-r*.60-(t*28+i*28)%75;stroke(c,[[q.x+(i-1)*r*.5,yy],[q.x+(i-1)*r*.5+9,yy-20],[q.x+(i-1)*r*.5-5,yy-38]],'#fff8e6',6);}c.restore();}
  function pot(q,r,list,liquid,t,heat){fit(c,images.pot,q.x,q.y+r*.23,r*2.6,r*1.8);const at={x:q.x,y:q.y-r*.12};c.save();c.beginPath();c.ellipse(at.x,at.y,r*.80,r*.50,0,0,tau);c.clip();if(liquid)ellipse(c,at.x,at.y,r*.80,r*.50,'#eccb83');pieces(list,at,r/195);if(heat)bubbles(at,r,t);c.restore();}
  function mixer(s,l,t){
    const q=l.center,r=l.r,im=images.blender,h=r*2.8,w=h*im.width/im.height,left=q.x-w/2,top=q.y-h*.48;
    c.drawImage(im,left,top,w,h);c.save();c.beginPath();c.moveTo(left+w*.24,top+h*.29);c.lineTo(left+w*.73,top+h*.29);c.lineTo(left+w*.66,top+h*.64);c.lineTo(left+w*.31,top+h*.64);c.closePath();c.clip();
    const d=describe(s.vessels.blender,'blender'),list=s.vessels.blender;
    if(list.length){c.globalAlpha=.25+s.blend*.65;rect(c,left+w*.22,top+h*(.53-s.blend*.10),w*.55,h*.25,0,d.color);c.globalAlpha=1;for(const p of list){c.save();c.globalAlpha=1-p.blended*.95;pieces([p],{x:q.x-w*.02,y:top+h*.46},r/255*(1-p.blended*.6));c.restore();}if(s.blending)for(let i=0;i<4;i++){c.beginPath();c.ellipse(q.x-w*.03,top+h*.5,w*(.09+i*.035),h*.035,Math.sin(t*10+i)*.10,0,tau);c.strokeStyle='#fff8de88';c.lineWidth=3;c.stroke();}}
    c.restore();l.motor={x:left+w*.47,y:top+h*.807,r:Math.max(28,w*.09)};if(s.blending)ellipse(c,l.motor.x,l.motor.y,l.motor.r,l.motor.r,'#fff1b955');
  }
  function meal(s,q,r){
    const d=describe(s.plate,s.plateMethod,s.plateSpices);
    if(d&&['juice','smoothie'].includes(d.kind)){
      const portion=s.plate.reduce((n,p)=>n+(p.remaining??1),0)/s.plate.length;rect(c,q.x-r*.48,q.y-r*.7,r*.96,r*1.5,15,'#d4e7debb');rect(c,q.x-r*.40,q.y+r*.72-r*1.15*portion,r*.80,r*1.15*portion,12,d.color);stroke(c,[[q.x+r*.1,q.y+r*.5],[q.x+r*.33,q.y-r*.9],[q.x+r*.6,q.y-r*.9]],'#c4776b',9);stroke(c,[[q.x-r*.29,q.y-r*.4],[q.x-r*.29,q.y+r*.47]],'#fff4de99',6);return;
    }
    fit(c,art.plate,q.x,q.y,r*2.1,r*1.65);
    c.save();c.beginPath();c.ellipse(q.x,q.y,r*.79,r*.47,0,0,tau);c.clip();if(d?.kind==='soup')ellipse(c,q.x,q.y,r*.8,r*.47,'#efcf91');
    if(d?.kind==='sandwich'){fit(c,images.bread,q.x,q.y,r*1.7,r*1.15);pieces(s.plate.filter(p=>p.id!=='bread'),q,r/210);fit(c,images.bread,q.x+r*.11,q.y-r*.16,r*1.22,r*.82);}
    else pieces(s.plate,q,r/165);c.restore();
  }
  function guest(s,q,t,near=false){
    const im=s.friend===1?images.bunny:art.bear,r=q.r,hh=r*2.8,ww=hh*im.width/im.height;
    const shake=['sour','salty','surprise','smoky'].includes(s.reaction)&&s.chew>0?Math.sin(t*21)*r*.035:0;
    const left=q.x-ww/2+shake,top=q.y-hh/2;fit(c,im,q.x+shake,q.y,ww,hh);
    const mouth={x:q.x+shake,y:top+hh*(s.friend===1?.54:.495)},eyeY=top+hh*(s.friend===1?.473:.39),eyeX=ww*(s.friend===1?.14:.17);
    lguest=mouth;
    if(near||s.chew>0||s.reaction){
      ellipse(c,mouth.x,mouth.y,ww*.085,hh*.049,s.friend===1?'#f3e7d1':'#edd5b3');
      const open=near||s.reaction==='surprise'||s.reaction==='spicy';ellipse(c,mouth.x,mouth.y,ww*(open?.056:.045),hh*(open?.046:.017+Math.sin(t*12)*.004),'#65422f');
      if(s.reaction==='spicy'){ellipse(c,mouth.x,mouth.y+hh*.034,ww*.036,hh*.041,'#eaa69b');for(const sign of [-1,1]){ellipse(c,q.x+sign*ww*.24,eyeY+hh*.07,ww*.055,hh*.02,'#ee8f6888');stroke(c,[[q.x+sign*ww*.15,eyeY-hh*.055],[q.x+sign*ww*.25,eyeY-hh*.035]],'#6a4b37',5);}}
      if(['sour','salty'].includes(s.reaction))for(const sign of [-1,1]){ellipse(c,q.x+sign*eyeX,eyeY,ww*.076,hh*.034,s.friend===1?'#f3e7d1':'#ddb484');stroke(c,[[q.x+sign*eyeX-ww*.045,eyeY-hh*.02],[q.x+sign*eyeX+ww*.036,eyeY],[q.x+sign*eyeX-ww*.045,eyeY+hh*.02]],'#5d4937',5);}
    }
    if(s.reaction){
      const symbols={love:'♥',yum:'♪',spicy:'♨',sour:'✦',salty:'≈',surprise:'?',smoky:'☁'};
      c.font=`${r*.34}px serif`;c.textAlign='center';c.fillStyle=s.reaction==='love'?'#d97560':'#708f69';for(let i=0;i<3;i++)c.fillText(symbols[s.reaction],q.x+r*(.75+i*.18),q.y-r*(.6+i*.30)-Math.sin(t*2+i)*5);
    }return mouth;
  }
  let lguest=null;
  function hand(x,y,k=1){c.save();c.translate(x,y);c.scale(k,k);c.shadowColor='#5d604b33';c.shadowBlur=9;c.beginPath();c.moveTo(-9,10);c.lineTo(-9,-27);c.quadraticCurveTo(-8,-43,4,-36);c.lineTo(8,-5);c.quadraticCurveTo(21,-17,26,-1);c.quadraticCurveTo(42,-7,44,10);c.lineTo(40,42);c.quadraticCurveTo(17,57,-3,35);c.lineTo(-25,12);c.quadraticCurveTo(-32,-2,-18,0);c.closePath();c.fillStyle='#fffaf0';c.fill();c.strokeStyle='#9ba594';c.lineWidth=2;c.stroke();c.restore();}
  function draw(s,t,pointer,hint,w,h){
    const dpr=Math.min(devicePixelRatio||1,2);c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);const l=view(w,h);
    c.drawImage(art.kitchen,0,0,art.kitchen.width,art.kitchen.height,0,0,w,h);
    c.fillStyle='#fff5d00c';c.fillRect(0,0,w,h);
    if(s.station==='board'){
      board(c,l.board.x,l.board.y,l.board.rx,l.board.ry,false);pieces(s.board,l.board,l.scale);
      if(!s.board.length){c.globalAlpha=.35;fit(c,images.tomato,l.board.x,l.board.y,l.board.rx*.85,l.board.ry);c.globalAlpha=1;ring(l.board,l.board.rx*.42,l.board.ry*.6,t);}
      if(pointer?.mode==='cut'){c.save();c.translate(pointer.x,pointer.y);c.scale(Math.min(1,w/600),Math.min(1,w/600));knife(c,0,0,-.15);c.restore();}
      else if(s.board.length){c.save();c.translate(l.board.x+l.board.rx*.50,l.board.y-l.board.ry*.66);c.scale(Math.min(1,w/600),Math.min(1,w/600));knife(c,0,0,-.15);c.restore();}
      // The small real cooker is a direct drop/pour target, not a next-step button.
      c.save();ellipse(c,l.transfer.x,l.transfer.y,l.transfer.r*1.25,l.transfer.r*.95,'#fff9e8c9');if(s.method==='pan')pan(c,l.transfer.x,l.transfer.y,l.transfer.r*.70,false,t,false);else if(s.method==='pot')pot(l.transfer,l.transfer.r*.8,[],0,t,false);else fit(c,images.blender,l.transfer.x,l.transfer.y,l.transfer.r*1.3,l.transfer.r*1.7);if(s.board.length)ring(l.transfer,l.transfer.r*1.1,l.transfer.r*.82,t);c.restore();
      if(s.board.length&&s.vessels[s.method].length){c.font='bold 20px sans-serif';c.fillStyle='#638568';c.textAlign='center';c.fillText(String(s.vessels[s.method].length),l.transfer.x,l.transfer.y+l.transfer.r*.8);}
    }else if(s.station==='stove'){
      if(s.method==='blender')mixer(s,l,t);
      else{
        if(s.method==='pan'){pan(c,l.center.x,l.center.y,l.r,!!s.heat.pan,t);c.save();c.beginPath();c.ellipse(l.center.x,l.center.y,l.r*.79,l.r*.53,0,0,tau);c.clip();if(s.liquid.pan)ellipse(c,l.center.x,l.center.y,l.r*.78,l.r*.52,'#f1d87533');pieces(s.vessels.pan,l.center,l.r/175);if(s.heat.pan)bubbles(l.center,l.r,t);c.restore();}
        else{fit(c,art.stove,l.center.x,l.center.y+l.r*.51,l.r*2.7,l.r*1.65);pot(l.center,l.r,s.vessels.pot,s.liquid.pot,t,!!s.heat.pot);}
        if(s.heat[s.method])steam(l.center,l.r,t);
        ellipse(c,l.dial.x,l.dial.y,l.dial.r,l.dial.r,s.heat[s.method]?'#d88452':'#809c81');ellipse(c,l.dial.x,l.dial.y,l.dial.r*.79,l.dial.r*.79,'#f6eed6');const a=(s.heat[s.method]||0)*Math.PI*1.5;stroke(c,[[l.dial.x,l.dial.y],[l.dial.x+Math.sin(a)*l.dial.r*.57,l.dial.y-Math.cos(a)*l.dial.r*.57]],'#6c8162',6);
        c.save();c.translate(pointer?.mode==='stir'?pointer.x:l.center.x+l.r*.57,pointer?.mode==='stir'?pointer.y:l.center.y+l.r*.2);c.scale(Math.min(1,l.r/200),Math.min(1,l.r/200));spoon(c,0,0,-.4);c.restore();
      }
      fit(c,art.plate,l.transfer.x,l.transfer.y,l.transfer.r*2.2,l.transfer.r*1.8);if(s.vessels[s.method].length)ring(l.transfer,l.transfer.r*1.05,l.transfer.r*.75,t);
      if(s.board.length){board(c,l.source.x,l.source.y,l.source.r,l.source.r*.65);pieces(s.board,l.source,l.source.r/315);ring(l.source,l.source.r,l.source.r*.65,t);}
    }else{
      const mouth=guest(s,l.guest,t,!!pointer?.mode&&pointer.mode==='feed');l.mouth=mouth;
      const food=s.plateOffset?{...l.food,x:l.food.x+s.plateOffset.x,y:l.food.y+s.plateOffset.y}:l.food;meal(s,food,l.food.r);
      if(s.plate.length){ring(l.food,l.food.r*.88,l.food.r*.62,t);c.save();c.translate(l.food.x+l.food.r*.65,l.food.y+l.food.r*.25);c.scale(Math.min(1,l.food.r/200),Math.min(1,l.food.r/200));spoon(c,0,0,-.6,false,true);c.restore();}
      const id=s.friend===1?'carrot':'strawberry';ellipse(c,l.guest.x-l.guest.r*.89,l.guest.y-l.guest.r*.28,l.guest.r*.29,l.guest.r*.26,'#fff9e8ee');fit(c,images[id],l.guest.x-l.guest.r*.89,l.guest.y-l.guest.r*.28,l.guest.r*.44,l.guest.r*.44);
    }
    if(pointer?.ingredient)fit(c,images[pointer.ingredient],pointer.x,pointer.y,Math.min(w*.33,160),Math.min(w*.33,160));
    if(s.effect&&t<s.effect.until){for(let i=0;i<20;i++){const x=l.center.x+Math.sin(i*2.4)*l.r*.6,y=l.center.y-l.r*.55+((t*120+i*20)%150);ellipse(c,x,y,3,3,s.effect.kind==='pepper'?'#73574d':s.effect.kind==='lemon'?'#f0d154':'#fffae8');}}
    if(hint){
      const phase=(t%3)/3;
      if(s.station==='board'&&s.board.length){const p=onFood(s.board[0],l);if(t%6<3)hand(p.x-50+phase*100,p.y,Math.min(1,w/540));else hand(p.x+(l.transfer.x-p.x)*phase,p.y+(l.transfer.y-p.y)*phase,Math.min(1,w/540));}
      else if(s.station==='stove'){const q=s.method==='blender'?l.motor:s.heat[s.method]?{x:l.center.x+Math.sin(t*2)*l.r*.4,y:l.center.y+Math.cos(t*2)*l.r*.22}:l.dial;hand(q.x,q.y,Math.min(1,w/540));}
      else if(s.station==='serve'&&s.plate.length)hand(l.food.x+(l.guest.x-l.food.x)*phase,l.food.y+(l.guest.y-l.food.y)*phase,Math.min(1,w/540));
      else if(s.station==='board')hand(l.board.x,l.board.y,Math.min(1,w/540));
    }return l;
  }
  return {draw,foodImage:id=>images[id].toDataURL('image/png')};
}
