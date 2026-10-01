// The room and cape are vector art, so they stay sharp at every screen size.
const TAU=Math.PI*2;
function ellipse(c,x,y,rx,ry,fill,angle=0){c.fillStyle=fill;c.beginPath();c.ellipse(x,y,rx,ry,angle,0,TAU);c.fill()}
function round(c,x,y,w,h,r,fill){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
export function drawRoom(c,l){
 const {stage:s}=l,w=s.w,h=s.h;
 c.fillStyle='#f7f3ed';c.fillRect(0,0,l.width,l.height);
 const wall=c.createLinearGradient(0,0,0,h);wall.addColorStop(0,'#f5ece9');wall.addColorStop(1,'#e8d9e4');c.fillStyle=wall;c.fillRect(0,0,w,h);
 c.strokeStyle='#ffffff64';c.lineWidth=1;for(let x=22;x<w;x+=44){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}
 const floor=h*.83;c.fillStyle='#dac6bb';c.fillRect(0,floor,w,h-floor);c.strokeStyle='#f5e8df';c.lineWidth=2;
 for(let x=-w;x<w*2;x+=100){c.beginPath();c.moveTo(w/2+(x-w/2)*.35,floor);c.lineTo(x,h);c.stroke()}
 round(c,0,floor-8,w,8,0,'#fff3e6');
 const sc=l.world.scale,cx=l.world.x+195*sc,my=Math.max(h<450?132:176,l.world.y+88*sc),mw=Math.min(w-34,360*sc+24),mh=h-my+22;
 c.save();c.shadowColor='#82647728';c.shadowBlur=24;c.shadowOffsetY=10;round(c,cx-mw/2,my,mw,mh,[mw/2,mw/2,22,22],'#ba969b');c.restore();
 round(c,cx-mw/2+6,my+6,mw-12,mh-12,[(mw-12)/2,(mw-12)/2,18,18],'#f9e5c6');
 const glass=c.createLinearGradient(cx-mw/2,my,cx+mw/2,h);glass.addColorStop(0,'#eef6f0');glass.addColorStop(.5,'#d9e9e3');glass.addColorStop(1,'#bfd8d2');
 round(c,cx-mw/2+15,my+15,mw-30,mh-30,[(mw-30)/2,(mw-30)/2,14,14],glass);
 c.save();c.beginPath();c.roundRect(cx-mw/2+15,my+15,mw-30,mh-30,[(mw-30)/2,(mw-30)/2,14,14]);c.clip();c.strokeStyle='#ffffff45';c.lineWidth=mw*.1;c.beginPath();c.moveTo(cx+mw*.15,my);c.lineTo(cx-mw*.4,h);c.stroke();c.lineWidth=7;c.beginPath();c.moveTo(cx+mw*.32,my);c.lineTo(cx-mw*.12,h);c.stroke();c.restore();
 if(w>680){
  const sx=cx+mw/2+30,sw=Math.min(142,w-sx-20);if(sw>64){
   for(const sy of (h<450?[h*.7]:[h*.43,h*.64])){round(c,sx,sy,sw,9,3,'#be9683');round(c,sx,sy+9,sw,4,2,'#947762');
    for(let i=0;i<3;i++){const bx=sx+14+i*(sw-25)/3,by=sy-53+i%2*11,col=['#c5acd6','#deb1c0','#9abdb3'][i];round(c,bx,by,20,sy-by,6,col);round(c,bx+5,by-6,10,8,2,'#c6a368');round(c,bx+4,by+15,12,16,3,'#fff8ee');}}
  }
  const px=cx-mw/2-65,py=floor+15;if(px>35){round(c,px-24,py-35,48,49,[4,4,17,17],'#e4b6a2');c.strokeStyle='#547f6a';c.lineWidth=3;c.beginPath();c.moveTo(px,py-31);c.lineTo(px,py-145);c.stroke();for(let i=0;i<6;i++){const side=i%2?1:-1;ellipse(c,px+side*14,py-50-i*16,22,9,i%2?'#7eaa8d':'#a8c4a2',side*-.65)}}
 }
}
export function drawBody(c,profile){
 const color={cocoa:['#b7a1d5','#806899'],honey:['#9fc9bb','#648f83'],peach:['#ecb3b8','#b47786']}[profile.id]||['#b7a1d5','#806899'];
 round(c,93,344,204,237,40,'#cc8e9f');round(c,103,352,184,211,32,'#e9b1bb');
 round(c,156,531,78,78,15,'#b17d86');ellipse(c,195,594,87,11,'#9d7c8333');
 c.fillStyle=profile.skin;c.beginPath();c.roundRect(178,327,46,68,16);c.fill();
 const g=c.createLinearGradient(90,365,290,585);g.addColorStop(0,color[0]);g.addColorStop(.6,color[0]);g.addColorStop(1,color[1]);
 c.fillStyle=g;c.beginPath();c.moveTo(173,370);c.quadraticCurveTo(130,372,112,407);c.lineTo(65,590);c.quadraticCurveTo(195,617,325,590);c.lineTo(278,407);c.quadraticCurveTo(255,373,227,370);c.quadraticCurveTo(201,391,173,370);c.fill();
 c.strokeStyle=color[1]+'77';c.lineWidth=2;for(const [x,y] of [[115,572],[151,589],[248,589],[282,572]]){c.beginPath();c.moveTo(x<195?173:227,387);c.quadraticCurveTo(x,447,x,y);c.stroke()}
 c.strokeStyle='#fff4f1bb';c.lineWidth=4;c.beginPath();c.moveTo(171,372);c.quadraticCurveTo(199,392,228,372);c.stroke();
 c.save();c.translate(195,441);c.fillStyle='#fff7e3';for(let i=0;i<5;i++){const a=i*TAU/5;ellipse(c,Math.cos(a)*8,Math.sin(a)*8,6,5,'#fff7e3',a)}ellipse(c,0,0,5,5,'#e4b76a');c.restore();
}
export function drawFallbackFace(c,profile,expression='normal',dx=0){
 c.save();c.translate(dx,0);ellipse(c,125,292,13,21,profile.skin);ellipse(c,265,292,13,21,profile.skin);
 const g=c.createRadialGradient(170,253,5,198,293,86);g.addColorStop(0,'#ffe2c5');g.addColorStop(1,profile.skin);ellipse(c,195,274,69,82,g);
 for(const x of [168,222]){ellipse(c,x,295,14,7,'#e9969170');if(expression==='blink'){c.strokeStyle='#775143';c.lineWidth=3;c.beginPath();c.arc(x,271,10,.2,Math.PI-.2);c.stroke()}else{ellipse(c,x,270,12,16,'#fff9ef');ellipse(c,x+1,272,8,12,'#654e43');ellipse(c,x+1,272,5,9,'#302f37');ellipse(c,x-2,267,3.5,4,'#fff');ellipse(c,x+4,276,1.5,2,'#fff')}}
 c.strokeStyle='#ae7167';c.lineWidth=2;c.lineCap='round';c.beginPath();c.moveTo(196,281);c.quadraticCurveTo(201,293,193,293);c.stroke();
 if(expression==='surprise')ellipse(c,196,318,6,9,'#a66263');else{c.beginPath();c.moveTo(183,312);c.quadraticCurveTo(197,326,211,312);c.strokeStyle='#b56570';c.lineWidth=3;c.stroke()}c.restore();
}
