import {guest} from './data.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const css=(c,m=1)=>`rgb(${c.map(v=>Math.round(clamp(v*m,0,255))).join(',')})`;
let textureLight=null,hairTexture=null,hairPlate=null;
export function setHairPlate(image){hairPlate=image}
export function setHairTexture(image){hairTexture=image;const c=document.createElement('canvas');c.width=64;c.height=128;const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(image,0,0,64,128);const data=cx.getImageData(0,0,64,128).data;textureLight=Array.from({length:8192},(_,i)=>(data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114)/96);}
const pt=(x,y,c)=>({x,y,px:x,py:y,homeX:x,homeY:y,c:[...c]});
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
  for(let row=0;row<128;row++){const u=row/127*(nodes.length-1),j=Math.min(nodes.length-2,Math.floor(u)),t=u-j,a=nodes[j],b=nodes[j+1],x=a.homeX+(b.homeX-a.homeX)*t,y=a.homeY+(b.homeY-a.homeY)*t;
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
 constructor(){this.reset()}
 reset(){this.strands=[];this.fallen=[];this.particles=[];this.cutCount=0;this.elapsed=0;let id=0;
 const add=(nodes,front,bang,lane,group,side)=>{const rootY=nodes[0].y;for(let j=0;j<nodes.length;j++){let p=nodes[j];if(!bang)p.y=rootY+(p.y-rootY)*(guest.hair.length/390);p.x+=(guest.hair.part-.5)*60*(1-j/nodes.length);p.homeX=p.px=p.x;p.homeY=p.py=p.y;}let rest=[];for(let j=1;j<nodes.length;j++)rest.push(Math.hypot(nodes[j].x-nodes[j-1].x,nodes[j].y-nodes[j-1].y));this.strands.push({id:id++,nodes,rest,front,bang,side,lane,rootX:nodes[0].x,rootY:nodes[0].y,width:bang?9:9,shade:.92+.18*Math.cos(lane*1.65),shine:.10+.22*Math.cos(lane*1.5),outline:Math.abs(lane)>.9?.32:.035,maxNodes:16,growCredit:0,group})};
 // Layered locks: multiple fine ribbons share the same broad wave, making a full hairstyle.
 for(const side of [-1,1])for(let g=5;g>=0;g--)for(let l=0;l<8;l++){let u=g/5,lane=(l-3.5)/3.5,off=lane*7,n=[];for(let j=0;j<14;j++){let t=j/13,root=195+side*(2+u*38),spread=(64+u*21)*(1-Math.exp(-6*t)),wave=(Math.sin(t*Math.PI*3.4+u*1.7+side*.25)-Math.sin(u*1.7+side*.25))*13*(1-Math.exp(-10*t));n.push(pt(root+side*(spread+wave)+off*(.3+.7*t),128+u*u*20+(410+u*15-26*lane*lane)*t,guest.hair.color))}add(n,false,false,lane,g,side)}
 const yy=[126,136,162,206,269,316,354,395,436,478,519,550];
 for(const side of [-1,1])for(let g=3;g>=0;g--)for(let l=0;l<9;l++){let u=g/3,lane=(l-4)/4,off=lane*8,dist=[u*46,32+u*24,64+u*27,85+u*28,100+u*24,98+u*18,79+u*26,72+u*29,90+u*28,88+u*23,63+u*29,74+u*26],n=[];for(let j=0;j<12;j++){let t=j/11;n.push(pt(195+side*dist[j]+off*(.25+.75*Math.min(t*4,1))+(side>0?Math.sin(j*.8)*3:0),yy[j]+u*9+lane*2*t+(j>8?((j-8)/3)*(-12+u*22-28*lane*lane):0),guest.hair.color))}add(n,true,false,lane,g,side)}
 if(guest.hair.bangs)for(let i=0;i<40;i++){let q=i/39,lane=((i%8)-3.5)/3.5,n=[];for(let j=0;j<10;j++){let t=j/9,rx=130+q*130,ex=140+q*113,x=rx+(ex-rx)*(1-(1-t)*(1-t))+Math.sin(t*Math.PI)*(q-.5)*4,y=123+Math.pow(q-.5,2)*175+(118+Math.sin(q*Math.PI)*13-Math.pow(q-.5,2)*130+Math.sin(q*Math.PI*5)*2)*t;n.push(pt(x,y,guest.hair.color))}add(n,true,true,lane,Math.floor(i/8),Math.sign(q-.5)||1)}

 }
 step(dt,H=844,headDx=0){dt=Math.min(dt,.034);this.elapsed+=dt;const h=dt/2;
  for(let sub=0;sub<2;sub++)for(const s of this.strands){let n=s.nodes;if(n.length<2)continue;n[0].x=s.rootX+headDx;n[0].y=s.rootY;n[0].px=n[0].x;n[0].py=n[0].y;
   for(let j=1;j<n.length;j++){let p=n[j],vx=clamp((p.x-p.px)*.84,-2.1,2.1),vy=clamp((p.y-p.py)*.84,-2.1,2.1);p.px=p.x;p.py=p.y;p.x+=vx+(p.homeX+headDx-p.x)*.065;p.y+=vy+155*h*h+(p.homeY-p.y)*.052}
   for(let k=0;k<5;k++){for(let j=1;j<n.length;j++){let a=n[j-1],b=n[j],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1,diff=(len-s.rest[j-1])/len;if(j===1){b.x-=dx*diff;b.y-=dy*diff}else{a.x+=dx*diff*.38;a.y+=dy*diff*.38;b.x-=dx*diff*.62;b.y-=dy*diff*.62}}
    // Downward ordering prevents flipping even after a large finger gesture.
    for(let j=1;j<n.length;j++){let a=n[j-1],b=n[j];b.y=Math.max(b.y,a.y+Math.min(1.5,s.rest[j-1]*.15));if(s.front&&!s.bang&&b.y>268&&b.y<355){let inner=195+s.side*(66*Math.sqrt(Math.max(0,1-Math.pow((b.y-286)/80,2)))+6);if(s.side<0)b.x=Math.min(b.x,inner);else b.x=Math.max(b.x,inner)}b.x=clamp(b.x,27,363);b.y=Math.min(b.y,603)}
   }
  }
  for(const f of this.fallen){f.age+=dt;for(const p of f.nodes){let vx=clamp((p.x-p.px)*.96,-4,4),vy=clamp((p.y-p.py)*.98,-4,7);p.px=p.x;p.py=p.y;p.x+=vx;p.y+=vy+360*dt*dt;}
   for(let k=0;k<3;k++){for(let j=1;j<f.nodes.length;j++){let a=f.nodes[j-1],b=f.nodes[j],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,d=(l-f.rest[j-1])/l*.5;a.x+=dx*d;a.y+=dy*d;b.x-=dx*d;b.y-=dy*d;}for(const p of f.nodes){p.x=clamp(p.x,18,372);if(p.y>603){p.y=603;p.px=p.x+(p.px-p.x)*.65;p.py=p.y}}}}
  for(let p of this.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=90*dt;p.life-=dt}this.particles=this.particles.filter(p=>p.life>0).slice(-500);if(this.fallen.length>120)for(const f of this.fallen.slice(0,this.fallen.length-120))f.age=Math.max(f.age,32.8);this.fallen=this.fallen.filter(f=>f.age<34).slice(-240);
 }
 cut(a,b){let total=0;for(const s of this.strands){const n=s.nodes;if(n.length<2)continue;let hit=null,idx=-1;for(let j=1;j<n.length;j++){let q=crossing(n[j-1],n[j],a,b);if(q){hit=q;idx=j;break}}if(!hit)continue;let prev=n[idx-1],next=n[idx],color=mix(prev.c,next.c,hit.t),tail=[pt(hit.x,hit.y,color),...n.slice(idx).map(p=>pt(p.x,p.y,p.c))];
   for(const p of tail){p.px=p.x-(Math.random()-.5)*.6;p.py=p.y-.3}this.fallen.push({age:0,nodes:tail,rest:tail.slice(1).map((p,i)=>Math.hypot(p.x-tail[i].x,p.y-tail[i].y)),width:s.width,shade:s.shade,shine:s.shine,lane:s.lane,group:s.group});
   const tip=pt(hit.x,hit.y,color);tip.homeX=prev.homeX+(next.homeX-prev.homeX)*hit.t;tip.homeY=prev.homeY+(next.homeY-prev.homeY)*hit.t;n.splice(idx);n.push(tip);s.rest.splice(idx-1);s.rest.push(Math.max(.5,Math.hypot(tip.x-prev.x,tip.y-prev.y)));s.growCredit=0;s.extending=null;s.textureDirty=true;total++;
   if(total%3===0)for(let k=0;k<3;k++)this.particles.push({x:hit.x,y:hit.y,vx:(Math.random()-.5)*70,vy:-45-Math.random()*30,life:.5+Math.random()*.3,color:css(color),size:1.4,kind:'hair'})
  }this.cutCount+=total;return total}
 grow(x,y,dt){let amount=0;for(const s of this.strands){let n=s.nodes,last=n.at(-1);if(last.y>=(s.bang?266:580))continue;if(!n.some(p=>Math.hypot(p.x-x,p.y-y)<48))continue;
  s.textureDirty=true;const target=s.bang?9:22;
  if(!s.extending){if(n.length>=16)continue;let prev=n.at(-2),dx=clamp((last.x-prev.x)*.7,-8,8),p=pt(last.x+dx/target,last.y+1,last.c);n.push(p);s.rest.push(Math.hypot(p.x-last.x,p.y-last.y));s.extending={dx:dx/target};last=p;amount++;}
  const previous=n.at(-2),rate=Math.min(dt*42,target-(last.homeY-previous.homeY));last.homeY=Math.min(last.homeY+rate,s.bang?267:581);last.homeX=clamp(last.homeX+s.extending.dx*rate,38,352);last.x=last.homeX;last.y=last.homeY;last.px=last.x;last.py=last.y;s.rest[s.rest.length-1]=Math.hypot(last.homeX-previous.homeX,last.homeY-previous.homeY);
  if(last.homeY-previous.homeY>=target-.1)s.extending=null;
 }return amount}
 dye(x,y,rgb,dt){let changed=0;for(let s of this.strands)for(let p of s.nodes){let d=Math.hypot(p.x-x,p.y-y);if(d<37){let alpha=1-Math.exp(-dt*5*(1-d/37));p.c=mix(p.c,rgb,alpha);s.textureDirty=true;changed++}}return changed}
 comb(a,b){const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/10));for(let st=1;st<=steps;st++){let x=a.x+(b.x-a.x)*st/steps,y=a.y+(b.y-a.y)*st/steps;for(let s of this.strands)for(let j=1;j<s.nodes.length;j++){let p=s.nodes[j],d=Math.hypot(p.x-x,p.y-y);if(d<36){let f=(1-d/36)*.45;p.x+=clamp((b.x-a.x)*f/steps,-6,6);p.y+=clamp((b.y-a.y)*f/steps,-1,3);p.px=p.x;p.py=p.y;}}}}
 draw(ctx,front){ctx.lineJoin='round';ctx.lineCap='round';for(let s of this.strands)if(s.front===front)ribbon(ctx,s)}
 drawFallen(ctx){for(let f of this.fallen){let alpha=f.age>26?(34-f.age)/8:1;ribbon(ctx,f,f.nodes,alpha)}ctx.globalAlpha=1;
 for(let p of this.particles){ctx.globalAlpha=clamp(p.life*1.5,0,1);ctx.fillStyle=p.color;ctx.beginPath();if(p.color==='#fff4ab'){for(let j=0;j<8;j++){let r=j%2?p.size*.3:p.size,a=j*Math.PI/4;let x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y)}}else ctx.ellipse(p.x,p.y,p.size,p.size*(p.kind==='hair'?.3:1),.4,0,Math.PI*2);ctx.fill()}ctx.globalAlpha=1}
 stats(){let max=0,up=0,finite=true,nodes=0;for(let s of this.strands){nodes+=s.nodes.length;for(let j=1;j<s.nodes.length;j++){let a=s.nodes[j-1],b=s.nodes[j];max=Math.max(max,Math.hypot(b.x-a.x,b.y-a.y));if(b.y<a.y-.01)up++;finite&&=Number.isFinite(b.x)&&Number.isFinite(b.y)}}return{strands:this.strands.length,nodes,maxSegment:max,upwardSegments:up,finite,fallen:this.fallen.length,cutCount:this.cutCount}}
}
