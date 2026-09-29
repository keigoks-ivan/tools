import {guest} from './data.js?v=11';
import {HairGL,domeTris} from './hair-gl.js?v=11';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c,m=1)=>`rgb(${c.map(v=>Math.round(clamp(v*m,0,255))).join(',')})`;
let textureLight=null,hairTexture=null,hairPlate=null;
// 顯示卡畫法（沒有 WebGL 或出錯就用下面的 2D 畫法）
let glHair;
function gpu(){if(glHair===undefined){try{glHair=typeof document!=='undefined'?new HairGL():null;if(glHair&&!glHair.ok)glHair=null}catch(e){console.warn('[hair] WebGL 失敗，改用 2D：',e);glHair=null}}return glHair}
export function setHairPlate(image){hairPlate=image}
export function setHairTexture(image){hairTexture=image;const c=document.createElement('canvas');c.width=64;c.height=128;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0,64,128);const data=cx.getImageData(0,0,64,128).data;textureLight=Array.from({length:8192},(_,i)=>(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114)/96);}
const pt=(x,y,c)=>({x,y,px:x,py:y,homeX:x,homeY:y,paintX:x,paintY:y,c:[...c]});
function crossing(a,b,c,d){let ux=b.x-a.x,uy=b.y-a.y,vx=d.x-c.x,vy=d.y-c.y,z=ux*vy-uy*vx;if(Math.abs(z)<1e-6)return null;let wx=c.x-a.x,wy=c.y-a.y,t=(wx*vy-wy*vx)/z,u=(wx*uy-wy*ux)/z;return t>=0&&t<=1&&u>=0&&u<=1?{x:a.x+ux*t,y:a.y+uy*t,t}:null}
function sample(nodes){const out=[];for(let j=0;j<nodes.length-1;j++){const a=nodes[Math.max(0,j-1)],b=nodes[j],c=nodes[j+1],d=nodes[Math.min(nodes.length-1,j+2)];for(let k=0;k<4;k++){const t=k/4,t2=t*t,t3=t2*t;out.push({x:.5*((2*b.x)+(-a.x+c.x)*t+(2*a.x-5*b.x+4*c.x-d.x)*t2+(-a.x+3*b.x-3*c.x+d.x)*t3),y:b.y+(c.y-b.y)*t})}}out.push(nodes[nodes.length-1]);return out}
function textureStrip(s,nodes){
 if(s.texture&&!s.textureDirty)return s.texture;
 s.textureDirty=false;
 const signature=nodes.map(p=>p.c.map(v=>Math.round(v/3)).join(',')+':'+Math.round(p.homeY)).join(';')+'|'+nodes.length;
 if(s.texture&&s.textureKey===signature)return s.texture;
 const tile=s.texture||document.createElement('canvas');tile.width=24;tile.height=512;
 const c=tile.getContext('2d'),g=c.createLinearGradient(0,0,0,512);
 const first=nodes[0],span=Math.max(.01,nodes.at(-1).y-first.y);
 for(const n of nodes){const light=.9+.2*Math.pow(.5+.5*Math.sin(n.homeY*.043+(s.group||0)*.24),4);g.addColorStop(clamp((n.y-first.y)/span,0,1),css(n.c,s.shade*light));}
 c.fillStyle=g;c.fillRect(0,0,24,512);
 if(hairPlate){
  if(hairTexture){c.globalCompositeOperation='soft-light';c.globalAlpha=.55;c.drawImage(hairTexture,0,0,hairTexture.width,hairTexture.height,0,0,24,512);c.globalAlpha=1;c.globalCompositeOperation='source-over';}
  const syScale=s.bang?1.12:1.23,sw=hairPlate.width/390,sh=hairPlate.height/844;
  // Sample painted detail in the strand's original coordinates; each ribbon remains independently deformable and cuttable.
  for(let row=0;row<128;row++){const u=row/127*(nodes.length-1),j=Math.min(nodes.length-2,Math.floor(u)),t=u-j,a=nodes[j],b=nodes[j+1],x=(a.paintX??a.homeX)+((b.paintX??b.homeX)-(a.paintX??a.homeX))*t,y=(a.paintY??a.homeY)+((b.paintY??b.homeY)-(a.paintY??a.homeY))*t;
   const sx=195+(x-195)*1.17,sy=123+(y-123)*syScale;
   c.drawImage(hairPlate,(sx-s.width*.6)*sw,(sy-1.5)*sh,s.width*1.2*sw,3.2*sh,0,row*4,24,4.1);
  }
  c.globalCompositeOperation='color';c.fillStyle=g;c.fillRect(0,0,24,512);
  const glow=c.createLinearGradient(0,0,0,512);for(const n of nodes){let brightness=n.c[0]*.299+n.c[1]*.587+n.c[2]*.114;glow.addColorStop(clamp((n.y-first.y)/span,0,1),`rgba(${n.c.map(Math.round).join(',')},${clamp((brightness-98)/230,0,.35)})`)}c.globalCompositeOperation='screen';c.fillStyle=glow;c.fillRect(0,0,24,512);
 }else{
  c.globalCompositeOperation='soft-light';c.globalAlpha=.68;
  const lane=(s.lane??0),u=clamp((lane+1)/2*.84+(s.group%3)*.025,0,.89);
  c.drawImage(hairTexture,u*hairTexture.width,0,hairTexture.width*.11,hairTexture.height,0,0,24,512);
 }
 c.globalCompositeOperation='source-over';s.texture=tile;s.textureKey=signature;return tile;
}
// 綁髮的固定點：髮圈那一節、泡泡辮的每一道小髮圈、丸子頭整圈盤起來的髮尾。回傳每一節是不是固定的。
function pinFlags(s){const n=s.nodes,T=s.tie,f=new Uint8Array(n.length);f[0]=1;if(!T)return f;
 if(T.index<n.length)f[T.index]=1;
 if(T.extra)for(const e of T.extra)if(e.i<n.length)f[e.i]=1;
 if(T.fixed)for(let j=T.index+1;j<n.length;j++)if(n[j].bx!==undefined)f[j]=1;
 return f}
function applyPins(s,dx=0){const n=s.nodes,T=s.tie;if(!T)return;
 const set=(p,x,y)=>{p.x=x+dx;p.y=y;p.px=p.x;p.py=p.y};
 if(T.index<n.length)set(n[T.index],T.x,T.y);
 if(T.extra)for(const e of T.extra)if(e.i<n.length)set(n[e.i],e.x,e.y);
 if(T.fixed)for(let j=T.index+1;j<n.length;j++){const p=n[j];if(p.bx!==undefined)set(p,p.bx,p.by)}}
// 綁法：band＝髮圈位置、via＝髮束先經過的點、front＝綁好後畫在臉前面、fan＝髮尾散開程度、sweep／out＝髮尾往側邊甩、
// pick＝哪些髮束要綁、bun＝盤成丸子、pinch＝泡泡辮每隔多長綁一道小髮圈、bow＝髮圈上的蝴蝶結大小
const TIE_STYLES={
 double:{band:side=>[195+side*96,357],via:side=>[[195+side*91,300],[195+side*86,341]],front:true,bow:29},
 high:{band:side=>[195+side*88,204],via:side=>[[195+side*74,172]],front:true,fan:.75,out:6,bow:27},
 braids:{band:side=>[195+side*90,286],via:side=>[[195+side*82,248]],front:true,fan:.35,pinch:40,bow:24},
 buns:{band:side=>[195+side*54,170],front:true,bun:{c:side=>[195+side*68,146],R:27},bow:22},
 single:{band:()=>[284,348],via:side=>side<0?[[150,232],[206,282]]:[[195+side*91,300]],front:false,bow:29},
 sideHigh:{band:()=>[272,184],via:side=>side<0?[[195,152]]:[[244,166]],front:true,out:14,fan:.85,bow:27},
 pony:{band:()=>[236,162],front:false,sweep:58,fan:.7,bow:30},
 half:{band:()=>[195,152],front:false,pick:s=>s.front&&!s.bang,bun:{c:()=>[195,176],R:17},bow:34},   // 公主頭：綁到後腦的那撮盤成小髻藏在頭後面
};
export const TIE_MODES=['double','high','braids','buns','single','sideHigh','pony','half','loose'];
let shadowLayer=null,capLayer=null,capKey='';
// 髮根底色用的貼圖：從畫好的頭髮圖左右兩側各切一塊側髮（有真的髮絲），拼成頭頂到太陽穴那一片，再換成目前髮色。顏色沒變就沿用。
const CAP={x:98,y:146,w:194,h:134,k:3};
function capTexture(cl,cr){
 const key=cl.concat(cr).map(v=>Math.round(v/4)).join(',')+(hairPlate?'p':'')+(hairTexture?'t':'');
 if(capLayer&&capKey===key)return capLayer;
 const c=capLayer||(capLayer=document.createElement('canvas'));c.width=CAP.w*CAP.k;c.height=CAP.h*CAP.k;capKey=key;
 const x=c.getContext('2d'),W=c.width,H=c.height,g=x.createLinearGradient(0,0,W,0);
 g.addColorStop(0,css(cl,.9));g.addColorStop(.5,css(mix(cl,cr,.5),.95));g.addColorStop(1,css(cr,.9));
 x.fillStyle=g;x.fillRect(0,0,W,H);
 if(hairPlate){
  // 畫好的頭髮圖（853×1844）裡，左右側髮靠上那一段：髮絲往下、往外
  const pw=hairPlate.width/853,ph=hairPlate.height/1844;
  x.drawImage(hairPlate,150*pw,420*ph,120*pw,190*ph,0,0,W/2+6,H);
  x.save();x.translate(W,0);x.scale(-1,1);x.drawImage(hairPlate,150*pw,420*ph,120*pw,190*ph,0,0,W/2+6,H);x.restore();
  x.globalCompositeOperation='destination-over';x.fillStyle=g;x.fillRect(0,0,W,H);
  x.globalCompositeOperation='color';x.fillStyle=g;x.fillRect(0,0,W,H);
  const b=(cl[0]+cr[0])*.15+(cl[1]+cr[1])*.29+(cl[2]+cr[2])*.057,glow=clamp((b-98)/230,0,.35);
  if(glow>0){x.globalCompositeOperation='screen';x.globalAlpha=glow;x.fillStyle=g;x.fillRect(0,0,W,H);x.globalAlpha=1}
 }else if(hairTexture){x.globalCompositeOperation='soft-light';x.globalAlpha=.7;x.drawImage(hairTexture,0,0,W,H);x.globalAlpha=1}
 x.globalCompositeOperation='source-over';return c;
}
// 一條髮束的外框（跟 ribbon 畫出來的形狀一樣：沿曲線、尾端收尖）
function outline(s,nodes){const pts=sample(nodes),left=[],right=[],len=pts.length;for(let i=0;i<len;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(len-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,t=i/(len-1),r=s.width*.5*(.96-.93*Math.pow(t,5));left.push({x:pts[i].x-dy/l*r,y:pts[i].y+dx/l*r});right.push({x:pts[i].x+dy/l*r,y:pts[i].y-dx/l*r})}return left.concat(right.reverse())}
function ribbon(ctx,s,nodes=s.nodes,alpha=1){if(nodes.length<2)return;const pts=sample(nodes),left=[],right=[],len=pts.length;for(let i=0;i<len;i++){const a=pts[Math.max(0,i-1)],b=pts[Math.min(len-1,i+1)],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,t=i/(len-1),r=s.width*.5*(.96-.93*Math.pow(t,5));left.push({x:pts[i].x-dy/l*r,y:pts[i].y+dx/l*r});right.push({x:pts[i].x+dy/l*r,y:pts[i].y-dx/l*r})}
 const first=nodes[0],last=nodes[nodes.length-1],span=Math.max(.01,last.y-first.y),grad=ctx.createLinearGradient(0,first.y,0,last.y+.01),shade=s.shade??1;
 for(let i=0;i<nodes.length;i++){const u=clamp((nodes[i].y-first.y)/span,0,1),tx=clamp(Math.round(((s.lane??0)+1)*27),0,63),ty=clamp(Math.round(u*127),0,127),light=textureLight?textureLight[ty*64+tx]:1;grad.addColorStop(u,css(nodes[i].c,shade*(.65+light*.35)));}
 ctx.globalAlpha=alpha;ctx.beginPath();ctx.moveTo(left[0].x,left[0].y);for(let p of left)ctx.lineTo(p.x,p.y);for(let i=len-1;i>=0;i--)ctx.lineTo(right[i].x,right[i].y);ctx.closePath();ctx.fillStyle=grad;ctx.fill();ctx.strokeStyle=css(first.c,.48);ctx.lineWidth=s.outline>.5?.65:.3;ctx.globalAlpha=alpha*(s.outline??.2);ctx.stroke();
 if(hairTexture&&s.age===undefined){
  const tile=textureStrip(s,nodes);ctx.save();ctx.clip();ctx.globalAlpha=alpha;
  for(let i=0;i<len-1;i+=2){
   const count=Math.min(2,len-1-i),a=pts[i],b=pts[i+count],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),t=i/(len-1),width=s.width*(.96-.93*Math.pow(t,5))+1;
   ctx.save();ctx.translate(a.x,a.y);ctx.rotate(Math.atan2(dy,dx)-Math.PI/2);
   ctx.drawImage(tile,0,t*510,24,Math.max(1,512*count/(len-1)), -width/2,-.6,width,length+1.2);ctx.restore();
  }ctx.restore();
 }
 ctx.globalAlpha=1;
}
export class HairSystem{
 constructor(profile=guest){this.profile=profile;this.reset()}
 reset(profile=this.profile){this.profile=profile;const guest=profile;this.strands=[];this.fallen=[];this.particles=[];this.cutCount=0;this.elapsed=0;this.ties=[];let id=0;
 const add=(nodes,front,bang,lane,group,side)=>{const rootY=nodes[0].y;for(let j=0;j<nodes.length;j++){let p=nodes[j];if(!bang)p.y=rootY+(p.y-rootY)*(guest.hair.length/390);p.x+=(guest.hair.part-.5)*60*(1-j/nodes.length);p.paintX=p.homeX=p.px=p.x;p.paintY=p.homeY=p.py=p.y;}let rest=[];for(let j=1;j<nodes.length;j++)rest.push(Math.hypot(nodes[j].x-nodes[j-1].x,nodes[j].y-nodes[j-1].y));this.strands.push({id:id++,nodes,rest,front,bang,side,lane,rootX:nodes[0].x,rootY:nodes[0].y,width:bang?9:9,shade:.92+.18*Math.cos(lane*1.65),shine:.10+.22*Math.cos(lane*1.5),outline:Math.abs(lane)>.9?.32:.035,maxNodes:16,growCredit:0,group})};
 // Layered locks: multiple fine ribbons share the same broad wave, making a full hairstyle.
 for(const side of [-1,1])for(let g=5;g>=0;g--)for(let l=0;l<8;l++){let u=g/5,lane=(l-3.5)/3.5,off=lane*7,n=[];for(let j=0;j<14;j++){let t=j/13,root=195+side*(2+u*38),spread=(64+u*21)*(1-Math.exp(-6*t)),wave=(Math.sin(t*Math.PI*3.4+u*1.7+side*.25)-Math.sin(u*1.7+side*.25))*13*(1-Math.exp(-10*t));n.push(pt(root+side*(spread+wave)+off*(.3+.7*t),128+u*u*20+(410+u*15-26*lane*lane)*t,guest.hair.color))}add(n,false,false,lane,g,side)}
 const yy=[126,136,162,206,269,316,354,395,436,478,519,550];
 for(const side of [-1,1])for(let g=3;g>=0;g--)for(let l=0;l<9;l++){let u=g/3,lane=(l-4)/4,off=lane*8,dist=[u*46,32+u*24,64+u*27,85+u*28,100+u*24,98+u*18,79+u*26,72+u*29,90+u*28,88+u*23,63+u*29,74+u*26],n=[];for(let j=0;j<12;j++){let t=j/11;n.push(pt(195+side*dist[j]+off*(.25+.75*Math.min(t*4,1))+(side>0?Math.sin(j*.8)*3:0),yy[j]+u*9+lane*2*t+(j>8?((j-8)/3)*(-12+u*22-28*lane*lane):0),guest.hair.color))}add(n,true,false,lane,g,side)}
 if(guest.hair.bangs)for(let i=0;i<40;i++){let q=i/39,lane=((i%8)-3.5)/3.5,n=[];for(let j=0;j<10;j++){let t=j/9,rx=130+q*130,ex=140+q*113,x=rx+(ex-rx)*(1-(1-t)*(1-t))+Math.sin(t*Math.PI)*(q-.5)*4,y=123+Math.pow(q-.5,2)*175+(118+Math.sin(q*Math.PI)*13-Math.pow(q-.5,2)*130+Math.sin(q*Math.PI*5)*2)*t*(1+((i*7)%5-2)*.028);n.push(pt(x,y,guest.hair.color))}add(n,true,true,lane,Math.floor(i/8),Math.sign(q-.5)||1)}
 // 沒有瀏海：前面的頭髮往後梳，髮尾沿圓弧排（真的髮際線是弧形，不是兩條斜線）
 if(!guest.hair.bangs)for(let i=0;i<40;i++){const q=i/39,lane=((i%8)-3.5)/3.5,n=[];for(let j=0;j<10;j++){const t=j/9,rootY=123+(q-.5)**2*175,endY=214+48*Math.pow(Math.abs(q-.5)*2,1.7)+((i*7)%5-2)*1.5;n.push(pt(130+q*130+(q-.5)*16*t*t,rootY+(endY-rootY)*t,guest.hair.color))}add(n,true,true,lane,Math.floor(i/8),Math.sign(q-.5)||1)}

 }
 step(dt,H=844,headDx=0){dt=Math.min(dt,.034);this.elapsed+=dt;const h=dt/2;
  for(let sub=0;sub<2;sub++)for(const s of this.strands){let n=s.nodes;if(n.length<2)continue;n[0].x=s.rootX+headDx;n[0].y=s.rootY;n[0].px=n[0].x;n[0].py=n[0].y;
   for(let j=1;j<n.length;j++){let p=n[j],vx=clamp((p.x-p.px)*.84,-2.1,2.1),vy=clamp((p.y-p.py)*.84,-2.1,2.1);p.px=p.x;p.py=p.y;p.x+=vx+(p.homeX+headDx-p.x)*.065;p.y+=vy+155*h*h+(p.homeY-p.y)*.052}
   const pin=pinFlags(s);if(s.tie)applyPins(s,headDx);
   for(let k=0;k<(s.tie?10:5);k++){for(let j=1;j<n.length;j++){if(pin[j-1]&&pin[j])continue;let a=n[j-1],b=n[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,diff=(len-s.rest[j-1])/len;const pinA=pin[j-1],pinB=pin[j];if(!pinA){a.x+=dx*diff*(pinB?1:.38);a.y+=dy*diff*(pinB?1:.38)}if(!pinB){b.x-=dx*diff*(pinA?1:.62);b.y-=dy*diff*(pinA?1:.62)}}
    // Downward ordering prevents flipping even after a large finger gesture.（盤起來的丸子頭例外）
    for(let j=1;j<n.length;j++){let a=n[j-1],b=n[j];if(pin[j]&&s.tie?.fixed&&j>s.tie.index)continue;b.y=Math.max(b.y,a.y+Math.min(1.5,s.rest[j-1]*.15));if(s.front&&!s.bang&&b.y>268&&b.y<355){const sd=s.tie?(Math.sign(s.tie.x-195)||s.side):s.side;let inner=195+sd*(66*Math.sqrt(Math.max(0,1-Math.pow((b.y-286)/80,2)))+6);if(sd<0)b.x=Math.min(b.x,inner);else b.x=Math.max(b.x,inner)}b.x=clamp(b.x,27,363);b.y=Math.min(b.y,603)}
    if(s.tie&&s.tie.index<n.length){applyPins(s,headDx);for(let j=s.tie.index-1;j>0;j--)n[j].y=Math.min(n[j].y,n[j+1].y-Math.min(.3,s.rest[j]*.15));}
   }
  }
  for(const f of this.fallen){f.age+=dt;for(const p of f.nodes){let vx=clamp((p.x-p.px)*.96,-4,4),vy=clamp((p.y-p.py)*.98,-4,7);p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy+360*dt*dt;}
   for(let k=0;k<3;k++){for(let j=1;j<f.nodes.length;j++){let a=f.nodes[j-1],b=f.nodes[j],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,d=(l-f.rest[j-1])/l*.5;a.x+=dx*d;a.y+=dy*d;b.x-=dx*d;b.y-=dy*d;}for(const p of f.nodes){p.x=clamp(p.x,18,372);if(p.y>603){p.y=603;p.px=p.x+(p.px-p.x)*.65;p.py=p.y}}}}
  for(let p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt;p.life-=dt}this.particles=this.particles.filter(p=>p.life>0).slice(-500);if(this.fallen.length>120)for(const f of this.fallen.slice(0,this.fallen.length-120))f.age=Math.max(f.age,32.8);this.fallen=this.fallen.filter(f=>f.age<34).slice(-240);
 }
 cut(a,b){let total=0;for(const s of this.strands){const n=s.nodes;if(n.length<2)continue;let hit=null,idx=-1;for(let j=1;j<n.length;j++){let q=crossing(n[j-1],n[j],a,b);if(q){hit=q;idx=j;break}}if(!hit)continue;let prev=n[idx-1],next=n[idx],color=mix(prev.c,next.c,hit.t),paint=q=>({x:q.paintX??q.homeX,y:q.paintY??q.homeY}),pa=paint(prev),pb=paint(next),cutPaint={x:pa.x+(pb.x-pa.x)*hit.t,y:pa.y+(pb.y-pa.y)*hit.t};
   // 剪下來的那段和留下的髮尾都記住自己在頭髮圖上的位置，花紋才接得上
   const keep=(q,src)=>{q.paintX=src.x;q.paintY=src.y;return q},tail=[keep(pt(hit.x,hit.y,color),cutPaint),...n.slice(idx).map(p=>keep(pt(p.x,p.y,p.c),paint(p)))];
   for(const p of tail){p.px=p.x-(Math.random()-.5)*.6;p.py=p.y-.3}this.fallen.push({age:0,nodes:tail,rest:tail.slice(1).map((p,i)=>Math.hypot(p.x-tail[i].x,p.y-tail[i].y)),width:s.width,shade:s.shade,shine:s.shine,lane:s.lane,group:s.group,bang:s.bang});
   const tip=keep(pt(hit.x,hit.y,color),cutPaint);tip.homeX=prev.homeX+(next.homeX-prev.homeX)*hit.t;tip.homeY=prev.homeY+(next.homeY-prev.homeY)*hit.t;n.splice(idx);n.push(tip);s.rest.splice(idx-1);s.rest.push(Math.max(.5,Math.hypot(tip.x-prev.x,tip.y-prev.y)));s.growCredit=0;s.extending=null;s.textureDirty=true;if(s.tie&&idx<=s.tie.index)s.tie=null;total++;
   if(total%3===0)for(let k=0;k<3;k++)this.particles.push({x:hit.x,y:hit.y,vx:(Math.random()-.5)*70,vy:-45-Math.random()*30,life:.5+Math.random()*.3,color:css(color),size:1.4,kind:'hair'})
  }this.cutCount+=total;return total}
 grow(x,y,dt){let amount=0;for(const s of this.strands){let n=s.nodes,last=n.at(-1);if(last.y>=(s.bang?266:580))continue;if(!n.some(p=>Math.hypot(p.x-x,p.y-y)<48))continue;
  s.textureDirty=true;const target=s.bang?9:22;
  if(!s.extending){if(n.length>=16)continue;let prev=n.at(-2),dx=clamp((last.x-prev.x)*.7,-8,8),p=pt(last.x+dx/target,last.y+1,last.c);n.push(p);s.rest.push(Math.hypot(p.x-last.x,p.y-last.y));s.extending={dx:dx/target};last=p;amount++;}
  const previous=n.at(-2),rate=Math.min(dt*42,target-(last.homeY-previous.homeY));last.homeY=Math.min(last.homeY+rate,s.bang?267:581);last.homeX=clamp(last.homeX+s.extending.dx*rate,38,352);last.x=last.homeX;last.y=last.homeY;last.px=last.x;last.py=last.y;s.rest[s.rest.length-1]=Math.hypot(last.homeX-previous.homeX,last.homeY-previous.homeY);
  if(last.homeY-previous.homeY>=target-.1)s.extending=null;
 }return amount}
 dye(x,y,rgb,dt){let changed=0;for(let s of this.strands)for(let p of s.nodes){let d=Math.hypot(p.x-x,p.y-y);if(d<37){let alpha=1-Math.exp(-dt*5*(1-d/37));p.c=mix(p.c,rgb,alpha);s.textureDirty=true;changed++}}return changed}
 comb(a,b){
  const distance=Math.hypot(b.x-a.x,b.y-a.y),steps=Math.max(1,Math.ceil(distance/8));let changed=0;
  for(let st=1;st<=steps;st++){const x=a.x+(b.x-a.x)*st/steps,y=a.y+(b.y-a.y)*st/steps,dx=(b.x-a.x)/steps,dy=(b.y-a.y)/steps;
   for(const s of this.strands){let touched=false;
    const pin=s.tie?pinFlags(s):null;for(let j=1;j<s.nodes.length;j++){const p=s.nodes[j],d=Math.hypot(p.x-x,p.y-y);if(d>=38||(s.tie&&(j<=s.tie.index||pin[j])))continue;
     const f=(1-d/38)*.65,moveX=clamp(dx*f+(x-p.x)*f*.16,-5,5),moveY=clamp(dy*f,-2,5);
     p.x+=moveX;p.y+=moveY;p.homeX=p.x;p.homeY=p.y;p.px=p.x;p.py=p.y;touched=true;changed++;
    }
    // Record the groomed strand shape. Gravity and constraints settle it without resetting the style.
    if(touched){this.relaxShape(s,8);s.textureDirty=true;}
   }
  }return changed;
 }
 relaxShape(s,iterations=20){
  const n=s.nodes;
  for(let k=0;k<iterations;k++){
   n[0].x=s.rootX;n[0].y=s.rootY;
   const pin=pinFlags(s);if(s.tie)applyPins(s);
   for(let j=1;j<n.length;j++){if(pin[j-1]&&pin[j])continue;const a=n[j-1],b=n[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,d=(len-s.rest[j-1])/len;
    const pinA=pin[j-1],pinB=pin[j];
    if(!pinA){a.x+=dx*d*(pinB?1:.4);a.y+=dy*d*(pinB?1:.4)}if(!pinB){b.x-=dx*d*(pinA?1:.6);b.y-=dy*d*(pinA?1:.6)}
   }
   for(let j=1;j<n.length;j++){const a=n[j-1],b=n[j];if(pin[j]&&s.tie?.fixed&&j>s.tie.index)continue;b.y=clamp(b.y,a.y+Math.min(.3,s.rest[j-1]*.15),603);b.x=clamp(b.x,27,363);if(s.front&&!s.bang&&b.y>260&&b.y<355){const sd=s.tie?(Math.sign(s.tie.x-195)||s.side):s.side,inner=195+sd*(66*Math.sqrt(Math.max(0,1-((b.y-286)/80)**2))+7);b.x=sd<0?Math.min(b.x,inner):Math.max(b.x,inner)}}
   if(s.tie&&s.tie.index<n.length){applyPins(s);for(let j=s.tie.index-1;j>0;j--)n[j].y=Math.min(n[j].y,n[j+1].y-Math.min(.3,s.rest[j]*.15));}
  }
  for(const p of n){p.homeX=p.px=p.x;p.homeY=p.py=p.y;}
 }
 tie(mode='double',color=0){
  this.untie();let count=0;const bands=[],bandAt=(b)=>{let i=bands.findIndex(q=>Math.abs(q.x-b.x)<1&&Math.abs(q.y-b.y)<1);if(i<0){bands.push(b);i=bands.length-1}return i};
  const S=TIE_STYLES[mode];if(!S)return 0;
  const perSide={'-1':0,'1':0};
  for(const s of this.strands){if(s.bang||s.nodes.length<6||(S.pick&&!S.pick(s)))continue;
   const n=s.nodes,side=s.side,[x,y]=S.band(side),via=S.via?S.via(side).map(([x,y])=>({x,y})):[];
   const f0=via.length?via[0]:{x,y},limit=Math.min(267,f0.y-6),reach=Math.abs(f0.x-195)-3;
   // 路線：髮根往下、還沒到第一個經過點以前、也還沒往外超過它的那一段照原樣，再經過 via 到髮圈（不會先往外再折回來）
   const pre=[];for(const p of n){if(p.y>=limit||(pre.length&&Math.abs(p.x-195)>reach))break;pre.push({x:p.x,y:p.y})}
   const route=[...pre,...via,{x,y}];if(route.length<2)continue;
   const lengths=route.slice(1).map((p,i)=>Math.hypot(p.x-route[i].x,p.y-route[i].y)),needed=lengths.reduce((a,b)=>a+b,0);
   let travel=0,k=-1;for(let j=1;j<n.length-1;j++){travel+=s.rest[j-1];if(travel>=needed+2){k=j;break}}
   if(k<0)continue;
   // Put the band at its actual arc-length along the hair, splitting a segment rather than shortening the strand.
   const oldLength=s.rest[k-1],firstLen=oldLength-(travel-needed-2),canSplit=n.length<16&&firstLen>=2&&oldLength-firstLen>=2;
   // 切不開（剛好落在交界、或已經 16 節）又多出一大截：改在前一節綁，不然多出來的長度會擠成一個尖角
   if(!canSplit&&k>1&&travel-needed>6&&travel-oldLength>=needed-6){travel-=oldLength;k--}
   if(canSplit){const t=firstLen/oldLength,a=n[k-1],b=n[k],p=pt(a.x+(b.x-a.x)*t,a.y+(b.y-a.y)*t,mix(a.c,b.c,t));p.paintX=(a.paintX??a.homeX)+((b.paintX??b.homeX)-(a.paintX??a.homeX))*t;p.paintY=(a.paintY??a.homeY)+((b.paintY??b.homeY)-(a.paintY??a.homeY))*t;n.splice(k,0,p);s.rest.splice(k-1,1,firstLen,oldLength-firstLen);travel=needed+2;}

   s.loose=n.map(p=>({x:p.homeX,y:p.homeY}));s.wasFront=s.front;s.front=S.front;
   // The root and band are both fixed; only strands with enough actual length can reach the band.
   const bx=x+s.lane*3,by=y+s.lane*.3;
   s.tie={index:k,x:bx,y:by,mode,band:bandAt({x,y,mode,color,size:S.bow})};let arc=0;
   for(let j=1;j<=k;j++){arc+=s.rest[j-1];let target=arc/travel*needed,segment=0;while(segment<lengths.length-1&&target>lengths[segment]){target-=lengths[segment];segment++}const t=target/lengths[segment];n[j].x=route[segment].x+(route[segment+1].x-route[segment].x)*t;n[j].y=route[segment].y+(route[segment+1].y-route[segment].y)*t;}
   const tailLen=s.rest.slice(k).reduce((a,b)=>a+b,0);
   if(S.bun){
    // 丸子頭：髮尾繞著中心一圈一圈往內盤，每一撮起點錯開，盤滿一整顆
    const [cx,cy]=S.bun.c(side),R=S.bun.R,q=perSide[side]++;let ang=Math.atan2(by-cy,bx-cx)+q*2.39996,cum=0;
    for(let j=k+1;j<n.length;j++){cum+=s.rest[j-1];const r=R*(1-.78*Math.min(1,cum/Math.max(40,tailLen)))+1.5;ang+=side*s.rest[j-1]/r;const p=n[j];p.x=cx+Math.cos(ang)*r;p.y=cy+Math.sin(ang)*r*.92;p.bx=p.x;p.by=p.y}
    s.tie.fixed=true;
   }else{
    let cum=0;const fan=S.fan??1,pinch=S.pinch;
    for(let j=k+1;j<n.length;j++){cum+=s.rest[j-1];const t=(j-k)/(n.length-1-k);
     const bulge=pinch?Math.abs(Math.sin(Math.PI*((cum%pinch)/pinch))):Math.sin(t*Math.PI*.75);
     const spread=(s.lane*19+side*(s.group-2.5)*3)*bulge*fan+(pinch?0:side*Math.sin(t*Math.PI)*12*fan);
     n[j].x=bx+spread+(S.sweep||0)*Math.sin(Math.min(1,t*1.5)*Math.PI/2)+(S.out||0)*(x>195?1:-1)*Math.sin(Math.min(1,t*2)*Math.PI/2);
     const dx=clamp(n[j].x-n[j-1].x,-s.rest[j-1]*.7,s.rest[j-1]*.7);n[j].x=n[j-1].x+dx;n[j].y=n[j-1].y+Math.sqrt(Math.max(0,s.rest[j-1]**2-dx**2));}
    if(pinch){
     // 泡泡辮：沿著髮尾每隔 pinch 長綁一道小髮圈，把髮束收回中線
     s.tie.extra=[];let at=0,m=1;cum=0;
     for(let j=k+1;j<n.length-1&&m<=4;j++){cum+=s.rest[j-1];if(cum>=m*pinch){const py=y+m*pinch*.92;n[j].x=bx+s.lane*1.5;n[j].y=py;
       s.tie.extra.push({i:j,x:n[j].x,y:py,band:bandAt({x,y:py,mode,color,ring:true,size:14})});m++}}
    }
   }
   this.relaxShape(s,80);s.textureDirty=true;count++;
  }this.ties=bands;return count;
 }
 untie(){for(const s of this.strands){for(const p of s.nodes){delete p.bx;delete p.by}if(!s.loose)continue;for(let j=0;j<s.nodes.length;j++){const p=s.nodes[j],q=s.loose[j];if(q){p.x=q.x;p.y=q.y;p.px=p.homeX=p.x;p.py=p.homeY=p.y}}s.tie=null;s.front=s.wasFront;delete s.loose;delete s.wasFront;this.relaxShape(s);s.textureDirty=true;}this.ties=[];}
 activeTies(){
  // 還有頭髮綁著的髮圈才畫（剪到髮圈上面，那撮就鬆開了）；舊存檔沒有 band 編號，照位置對
  const alive=new Set();for(const s of this.strands){const T=s.tie;if(!T||T.index>=s.nodes.length)continue;
   if(T.band===undefined){const i=this.ties.findIndex(b=>Math.abs(T.x-b.x)<5);if(i>=0)alive.add(i);continue}
   alive.add(T.band);if(T.extra)for(const e of T.extra)if(e.i<s.nodes.length)alive.add(e.band)}
  return this.ties.filter((b,i)=>alive.has(i));
 }
 tieMode(){return this.strands.find(s=>s.tie)?.tie.mode||'loose'}

 draw(ctx,front){
  const g=hairPlate&&gpu(),list=this.strands.filter(s=>s.front===front).map(s=>({s,nodes:s.nodes}));
  if(g&&g.draw(ctx,front?this.capStrands().concat(list):list,hairPlate,hairTexture))return;
  ctx.lineJoin='round';ctx.lineCap='round';for(let s of this.strands)if(s.front===front)ribbon(ctx,s)}
 // 頭頂的短髮（顯示卡畫法用）：從頭頂往下、往外梳到髮際線，一整圈蓋住頭皮；畫在前層頭髮底下，太陽穴、髮縫、綁起來後的兩側都不會露出頭皮。
 // 顏色取左右兩側髮根的平均（染色也會跟著變）。髮尾收尖，自然形成細碎的髮際線。
 capStrands(){
  const L=[],R=[];for(const s of this.strands){const c=s.nodes[0]?.c;if(c)(s.side<0?L:R).push(c)}
  if(!L.length&&!R.length)return [];
  const avg=a=>a.length?a.reduce((m,c)=>m.map((v,i)=>v+c[i]/a.length),[0,0,0]):null,cl=avg(L)||avg(R),cr=avg(R)||avg(L);
  // 髮際線：額頭那段是拱門形的圓弧（上面平、兩側往太陽穴陡下；中間 y 221、兩側 y 275），太陽穴外側再往耳朵上方收
  const line=[[104,266],[114,276]];for(let i=0;i<=24;i++){const x=126+138*i/24,u=Math.min(1,Math.abs(x-195)/69);line.push([x,221+54*(1-Math.sqrt(1-u*u))])}line.push([276,276],[286,266]);
  const seg=line.slice(1).map((q,i)=>Math.hypot(q[0]-line[i][0],q[1]-line[i][1])),total=seg.reduce((a,b)=>a+b,0),out=[],N=40;
  for(let k=0;k<N;k++){let d=(k+.5)/N*total,i=0;while(i<seg.length-1&&d>seg[i]){d-=seg[i];i++}const f=d/seg[i],ex=line[i][0]+(line[i+1][0]-line[i][0])*f,ey=line[i][1]+(line[i+1][1]-line[i][1])*f;
   const side=ex-195,col=mix(cl,cr,clamp((ex-104)/182,0,1)),x0=195+side*.06,y0=121,cx=195+side*1.08,cy=150,nodes=[];
   for(let j=0;j<7;j++){const t=j/6,u=1-t,x=u*u*x0+2*u*t*cx+t*t*ex,y=u*u*y0+2*u*t*cy+t*t*ey;nodes.push({x,y,c:col,paintX:x,paintY:y})}
   out.push({s:{width:12,bang:true},nodes});
  }
  // 最底下先鋪一片圓頂（上緣照頭形、下緣是髮際線），頭頂不會有尖角或階梯
  const top=[[104,266]];for(let i=0;i<=24;i++){const a=Math.PI*(1.06-1.12*i/24);top.push([195+93*Math.cos(a),232-116*Math.sin(a)])}top.push([286,266]);
  out.unshift({tris:domeTris(top,line,cl,cr)});
  return out;
 }
 // 頭髮落在臉上的影子：前層髮束的剪影縮到 1/8 畫、再放大（放大時自然變模糊），往下挪一點、只畫在臉的範圍裡。
 // 瀏海下緣、鬢角、髮際線有了影子，頭髮看起來才是「貼在頭上」，不是浮在臉前面的貼紙。
 drawShadow(ctx,clip,dx=0){
  const k=8,c=shadowLayer||(shadowLayer=document.createElement('canvas'));if(c.width!==49){c.width=49;c.height=106}
  const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,49,106);x.setTransform(1/k,0,0,1/k,0,0);x.fillStyle='rgb(150,82,64)';
  for(const s of this.strands){if(!s.front||s.nodes.length<2)continue;const o=outline(s,s.nodes);x.beginPath();x.moveTo(o[0].x,o[0].y);for(const q of o)x.lineTo(q.x,q.y);x.closePath();x.fill()}
  ctx.save();clip();ctx.globalCompositeOperation='multiply';ctx.globalAlpha=.55;ctx.imageSmoothingEnabled=true;
  ctx.drawImage(c,0,0,49,106,dx+1,5,392,848);ctx.globalAlpha=.25;ctx.drawImage(c,0,0,49,106,dx-2,9,396,852);ctx.restore();
 }
 // 頭頂：一片跟著頭形的圓頂，從髮色往下漸漸透明，把髮根排成階梯的頂端修成圓的，整頭頭髮看起來是一整片包著頭。
 drawCrown(ctx,dx=0){
  if(hairPlate&&gpu())return;
  const L=[],R=[];for(const s of this.strands){if(s.nodes.length<2)continue;const c=s.nodes[0].c;(s.side<0?L:R).push(c)}
  if(!L.length&&!R.length)return;
  const avg=a=>a.length?a.reduce((m,c)=>m.map((v,i)=>v+c[i]/a.length),[0,0,0]):null,cl=avg(L)||avg(R),cr=avg(R)||avg(L),cm=mix(cl,cr,.5);
  const rgba=(c,m,a)=>`rgba(${c.map(v=>Math.round(clamp(v*m,0,255))).join(',')},${a})`;
  ctx.save();ctx.translate(dx,0);ctx.beginPath();ctx.moveTo(112,204);ctx.bezierCurveTo(112,131,150,115,195,115);ctx.bezierCurveTo(240,115,278,131,278,204);ctx.closePath();
  const v=ctx.createLinearGradient(0,118,0,172);v.addColorStop(0,rgba(cm,1,1));v.addColorStop(.35,rgba(cm,1,.85));v.addColorStop(1,rgba(cm,1,0));
  ctx.fillStyle=v;ctx.fill();ctx.clip();
  // 從頭頂中心往下梳的髮流（跟著同樣的漸層淡掉）
  ctx.lineWidth=.8;for(let i=0;i<46;i++){const a=Math.PI*(.02+.96*i/45),ex=195-Math.cos(a)*92,ey=128+Math.sin(a)*70;
   ctx.strokeStyle=rgba(mix(cl,cr,i/45),i%3?.82:1.18,i%3?.35:.22);ctx.beginPath();ctx.moveTo(195-Math.cos(a)*6,121);ctx.quadraticCurveTo(195-Math.cos(a)*60,119+Math.sin(a)*6,ex,ey);ctx.stroke()}
  ctx.restore();
 }
 // 髮根底色：頭頂到髮際線先鋪一層頭髮（取自畫好的頭髮圖、重新上成目前髮色），髮束之間的縫、太陽穴、綁起來後的兩側就不會露出光頭。
 // 左右各取該側髮根的平均色（染色也會跟著變），畫在臉之後、前層頭髮之前；額頭和耳朵不蓋。
 drawCap(ctx,dx=0){
  if(hairPlate&&gpu())return;
  const L=[],R=[];for(const s of this.strands){const c=s.nodes[0]?.c;if(c)(s.side<0?L:R).push(c)}
  if(!L.length&&!R.length)return;
  const avg=a=>a.length?a.reduce((m,c)=>m.map((v,i)=>v+c[i]/a.length),[0,0,0]):null,cl=avg(L)||avg(R),cr=avg(R)||avg(L);
  const tex=capTexture(cl,cr);
  ctx.save();ctx.translate(dx,0);ctx.beginPath();
  // 外緣比頭形寬：往外一直補到側髮，頭和側髮之間不會透出背景；下緣停在耳朵上方
  // 耳朵上方那段下緣做成一撮一撮的髮尾，不是一刀切齊
  const tips=[[127,274],[123,283],[119,275],[115,285],[111,274],[107,281],[104,268]];
  ctx.moveTo(...tips[0]);for(const q of tips.slice(1))ctx.lineTo(...q);ctx.bezierCurveTo(96,205,132,150,195,150);ctx.bezierCurveTo(258,150,294,205,286,268);
  for(const [x,y] of tips.slice(0,-1).reverse())ctx.lineTo(390-x,y);
  ctx.bezierCurveTo(253,246,241,231,222,225);ctx.quadraticCurveTo(195,218,168,225);ctx.bezierCurveTo(149,231,137,246,127,274);ctx.closePath();
  ctx.clip();ctx.drawImage(tex,CAP.x,CAP.y,CAP.w,CAP.h);
  // 這一層在外層頭髮底下，本來就比較暗：整片壓暗，越往外側、越往下越暗
  const sh=ctx.createRadialGradient(195,196,30,195,214,104);sh.addColorStop(0,'rgba(60,30,20,.12)');sh.addColorStop(1,'rgba(40,18,10,.5)');
  ctx.globalCompositeOperation='multiply';ctx.fillStyle=sh;ctx.fillRect(CAP.x,CAP.y,CAP.w,CAP.h);ctx.globalCompositeOperation='source-over';
  ctx.restore();
 }
 drawFallen(ctx){const g=hairPlate&&gpu(),fade=f=>f.age>26?(34-f.age)/8:1;
  if(!(g&&this.fallen.length&&g.draw(ctx,this.fallen.map(f=>({s:f,nodes:f.nodes,alpha:fade(f)})),hairPlate,hairTexture)))for(let f of this.fallen)ribbon(ctx,f,f.nodes,fade(f));ctx.globalAlpha=1;
 for(let p of this.particles){ctx.globalAlpha=clamp(p.life*1.5,0,1);ctx.fillStyle=p.color;ctx.beginPath();if(p.color==='#fff4ab'){for(let j=0;j<8;j++){let r=j%2?p.size*.3:p.size,a=j*Math.PI/4;let x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y)}}else ctx.ellipse(p.x,p.y,p.size,p.size*(p.kind==='hair'?.3:1),.4,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
 snapshot(){return {version:1,strands:this.strands.map(({texture,textureKey,textureDirty,...s})=>structuredClone(s)),cutCount:this.cutCount,ties:structuredClone(this.ties)};}
 restore(saved){
  if(saved?.version!==1||!Array.isArray(saved.strands)||saved.strands.length<150||saved.strands.length>250)return false;
  const valid=saved.strands.every(s=>Array.isArray(s.nodes)&&s.nodes.length>=2&&s.nodes.length<=16&&Array.isArray(s.rest)&&s.rest.length===s.nodes.length-1&&s.rest.every(v=>Number.isFinite(v)&&v>=0)&&s.nodes.every(p=>['x','y','px','py','homeX','homeY'].every(k=>Number.isFinite(p[k])&&Math.abs(p[k])<2000)&&Array.isArray(p.c)&&p.c.length===3&&p.c.every(v=>Number.isFinite(v)&&v>=0&&v<=255))&&Number.isFinite(s.rootX)&&Number.isFinite(s.rootY));
  if(!valid)return false;
  this.strands=structuredClone(saved.strands);for(const s of this.strands){s.textureDirty=true;for(const p of s.nodes){p.px=p.x;p.py=p.y}}
  this.ties=structuredClone(saved.ties||[]);this.cutCount=saved.cutCount||0;this.fallen=[];this.particles=[];return true;
 }
 stats(){let max=0,up=0,finite=true,nodes=0;for(let s of this.strands){nodes+=s.nodes.length;for(let j=1;j<s.nodes.length;j++){let a=s.nodes[j-1],b=s.nodes[j];max=Math.max(max,Math.hypot(b.x-a.x,b.y-a.y));if(b.y<a.y-.01&&b.bx===undefined)up++;finite&&=Number.isFinite(b.x)&&Number.isFinite(b.y)}}return{strands:this.strands.length,nodes,maxSegment:max,upwardSegments:up,finite,fallen:this.fallen.length,cutCount:this.cutCount}}
}
