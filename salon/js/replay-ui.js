import {accessories,wishes,rgb} from './looks.js?v=14';
import {ornament} from './ornaments.js?v=14';
import {TIE_MODES} from './hair.js?v=14';
const TAU=Math.PI*2;
const labels={camera:'拍照',album:'作品集',guests:'選客人',close:'關閉',next:'下一頁',back:'上一頁',undo:'撤銷',edit:'繼續編輯',download:'下載照片',trash:'刪除照片'};
const tieNames={double:'雙馬尾',high:'高雙馬尾',braids:'泡泡辮',buns:'丸子頭',single:'低側馬尾',sideHigh:'側邊高馬尾',pony:'高馬尾',half:'公主頭',loose:'放下頭髮'};
const accessoryNames={bow:'蝴蝶結',flower:'花朵',star:'星星',butterfly:'蝴蝶',heart:'愛心',moon:'月亮',crown:'皇冠',pearls:'珍珠'};
const guestNames={cocoa:'可可',honey:'蜜糖',peach:'蜜桃'};
const wishNames=['玫瑰派對','海洋精靈','陽光花園','彩虹夢想','月光仙子','蜜桃蝴蝶'];
function caption(c,text,x,y,size=14){c.save();c.font=`600 ${size}px system-ui, sans-serif`;c.fillStyle='#715971';c.textAlign='center';c.textBaseline='middle';c.fillText(text,x,y);c.restore()}

export function icon(c,kind,x,y,s=32){
 c.save();c.translate(x,y);c.scale(s/32,s/32);c.strokeStyle='#9c687b';c.fillStyle='#f5b7c7';c.lineWidth=2.6;c.lineCap='round';c.lineJoin='round';
 const path=(pts)=>{c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke()};
 if(kind==='camera'){c.beginPath();c.roundRect(-18,-11,36,25,5);c.fill();c.stroke();c.fillStyle='#fff5e6';c.beginPath();c.arc(0,1,8,0,TAU);c.fill();c.stroke();path([[-10,-12],[-7,-17],[5,-17],[9,-12]]);c.fillStyle='#fff';c.beginPath();c.arc(-2,-2,2,0,TAU);c.fill()}
 if(kind==='album'){for(const a of [-.18,.12]){c.save();c.rotate(a);c.fillStyle='#fff8ea';c.fillRect(-14,-18,28,36);c.strokeRect(-14,-18,28,36);c.fillStyle='#b5d8c9';c.fillRect(-10,-14,20,23);c.restore()}ornament(c,'heart',0,-1,17,0)}
 if(kind==='guests'){c.fillStyle='#c48b70';c.beginPath();c.arc(-7,-7,8,0,TAU);c.fill();c.fillStyle='#f7ceb0';c.beginPath();c.arc(9,-3,8,0,TAU);c.fill();c.fillStyle='#b89fd9';c.beginPath();c.ellipse(-7,13,12,9,0,Math.PI,TAU);c.fill();c.fillStyle='#edb7b7';c.beginPath();c.ellipse(9,17,12,11,0,Math.PI,TAU);c.fill()}
 if(kind==='close')path([[-10,-10],[10,10]]),path([[-10,10],[10,-10]]);
 if(kind==='next'||kind==='back'){const d=kind==='next'?1:-1;path([[-12*d,0],[12*d,0],[3*d,-9]]);path([[12*d,0],[3*d,9]])}
 if(kind==='undo'){path([[12,12],[12,-2],[8,-9],[-4,-11],[-14,-4]]);path([[-14,-13],[-14,-4],[-4,-4]])}
 if(kind==='edit'){c.rotate(.7);c.fillStyle='#edbf67';c.fillRect(-5,-19,10,29);c.strokeRect(-5,-19,10,29);c.beginPath();c.moveTo(-5,10);c.lineTo(0,18);c.lineTo(5,10);c.fillStyle='#916e63';c.fill()}
 if(kind==='download'){path([[0,-16],[0,7],[-8,-1]]);path([[0,7],[8,-1]]);path([[-15,9],[-15,17],[15,17],[15,9]])}
 if(kind==='trash'){c.strokeRect(-10,-9,20,26);path([[-15,-13],[15,-13]]);path([[-5,-13],[-5,-18],[5,-18],[5,-13]]);path([[-4,-4],[-4,11]]);path([[4,-4],[4,11]])}
 if(kind==='warning'){c.fillStyle='#f6c46e';c.beginPath();c.moveTo(0,-17);c.lineTo(19,16);c.lineTo(-19,16);c.closePath();c.fill();path([[0,-6],[0,4]]);c.beginPath();c.arc(0,10,1,0,TAU);c.stroke()}
 c.restore();
}
// 選到的功能後面的愛心：比按鈕大一圈，左右上角和下面的尖端從按鈕後面露出來，輕輕跳動
export function selHeart(c,x,y,r,now=0){
 const s=r*3.7/54*(1+.05*Math.sin(now*.006));c.save();c.translate(x,y-r*.02);c.scale(s,s);
 c.beginPath();c.moveTo(0,22);c.bezierCurveTo(-37,-1,-16,-31,0,-12);c.bezierCurveTo(16,-31,37,-1,0,22);c.closePath();
 const g=c.createLinearGradient(0,-26,0,22);g.addColorStop(0,'#ff9cc0');g.addColorStop(1,'#e24f86');
 c.shadowColor='#a8335f55';c.shadowBlur=6;c.shadowOffsetY=2;c.fillStyle=g;c.fill();c.shadowBlur=0;c.lineWidth=2.4/s*r/30;c.strokeStyle='#fff7fb';c.stroke();c.restore();
}
export function circleButton(c,x,y,kind,{active=false,size=32,color='#fff4df'}={}){
 c.save();c.shadowColor='#68473430';c.shadowBlur=10;c.shadowOffsetY=3;const g=c.createLinearGradient(x,y-size,x,y+size);g.addColorStop(0,'#fffdf2');g.addColorStop(1,color);c.fillStyle=g;c.beginPath();c.arc(x,y,size,0,TAU);c.fill();c.shadowBlur=0;c.strokeStyle=active?'#d29b67':'#ffffffcc';c.lineWidth=active?3:2;c.stroke();icon(c,kind,x,y,size*1.5);c.restore();
}
export function wishIcon(c,w,x,y,size){
 c.save();c.translate(x,y);c.scale(size/70,size/70);c.fillStyle=w.paper;c.beginPath();c.roundRect(-32,-32,64,64,19);c.fill();
 for(let i=0;i<w.colors.length;i++){c.fillStyle=rgb(w.colors[i]);c.beginPath();c.roundRect(-25+i*50/w.colors.length,-21,50/w.colors.length+1,22+w.length*30,8);c.fill()}
 c.fillStyle='#ffe0c3';c.beginPath();c.ellipse(0,-2,14,18,0,0,TAU);c.fill();c.fillStyle='#705448';for(const x of [-5,5]){c.beginPath();c.arc(x,-3,1.8,0,TAU);c.fill()}c.strokeStyle='#ac7167';c.lineWidth=1.5;c.beginPath();c.arc(0,3,5,.2,Math.PI-.2);c.stroke();ornament(c,w.accessory,18,-15,23,w.colors[0]);c.restore();
}
// 綁髮小圖示（預覽還沒做好時、以及上排按鈕用）：一顆頭＋頭髮綁起來的樣子
function tieIcon(c,mode,x,y,size=72){
 c.save();c.translate(x,y);c.scale(size/72,size/72);const hair='#8a5540',tail='#9a6246';
 const E=(x,y,rx,ry,a=0,col=tail)=>{c.fillStyle=col;c.beginPath();c.ellipse(x,y,rx,ry,a,0,TAU);c.fill()};
 // 在頭後面的：馬尾、公主頭
 if(mode==='single')E(24,20,8,19,-.18);
 if(mode==='pony')E(22,6,9,24,-.35);
 if(mode==='sideHigh')E(26,6,8,21,-.25);
 E(0,-6,19,24,0,hair);E(0,-1,12,15,0,'#ffe0bd');E(0,-16,12,6,0,hair);
 if(mode==='double'||mode==='high'||mode==='braids')for(const side of [-1,1]){const hi=mode==='high',py=hi?-8:9;
  if(mode==='braids'){for(let k=0;k<3;k++)E(side*23,py+6+k*11,6.5,6,0);for(let k=0;k<3;k++){c.fillStyle='#e58aa6';c.fillRect(side*23-5,py+k*11,10,2.4)}}
  else E(side*(hi?24:23),py+15,8.5,18,side*-.16);}
 if(mode==='buns')for(const side of [-1,1]){E(side*15,-27,10,9.5);c.strokeStyle='#6e4232';c.lineWidth=1.5;c.beginPath();c.arc(side*15,-27,5.5,0,5);c.stroke()}
 if(mode==='loose'){E(-17,12,6,18,.1);E(17,12,6,18,-.1)}
 const bows={double:[[-23,9],[23,9]],high:[[-24,-8],[24,-8]],braids:[[-23,5],[23,5]],buns:[[-10,-19],[10,-19]],single:[[21,4]],sideHigh:[[20,-12]],pony:[[14,-17]],half:[[0,-27]]}[mode]||[];
 for(const [bx,by] of bows)ornament(c,'bow',bx,by,mode==='half'?22:16,0);
 c.restore();
}
export class ReplayUI {
 constructor(api){this.api=api;this.mode=null;this.hits=[];this.page=0;this.photo=null;this.confirmDelete=false;this.images=new Map();this.flash=0;this.busy=false;}
 open(mode){this.mode=mode;this.page=0;this.confirmDelete=false;this.api.stop();if(mode==='ties')this.api.clearTiePreviews?.();}
 hit(p){for(const h of [...this.hits].reverse()){if(p.x>=h.x&&p.x<=h.x+h.w&&p.y>=h.y&&p.y<=h.y+h.h){if(!this.busy)h.run();return true}}return !!this.mode}
 region(x,y,w,h,run,label='選擇'){this.hits.push({x,y,w,h,run,label})}
 button(c,x,y,kind,run,opts){circleButton(c,x,y,kind,opts);const r=opts?.size||32;this.region(x-r,y-r,r*2,r*2,run,opts?.label||(kind==='next'&&this.mode==='photo'?'換客人':labels[kind]||'選擇'))}
 image(url){if(!this.images.has(url)){const im=new Image();im.src=url;this.images.set(url,im)}return this.images.get(url)}
 async snap(){if(this.busy)return;this.busy=true;this.api.stop();try{this.api.react('happy');const photo=this.api.capture();const ok=await this.api.memory.add(photo);if(!ok){this.open('album');return}this.photo=photo;this.mode='photo';this.flash=performance.now();this.api.save()}catch{this.api.memory.problem=true}finally{this.busy=false}}
 draw(c,l,now){this.hits=[];const a=this.api;
  if(!this.mode)return;
  c.save();c.fillStyle='#65526ca8';c.fillRect(0,0,l.width,l.height);
  const w=Math.min(l.width-16,900),h=Math.min(l.height-16,1000),x=(l.width-w)/2,y=(l.height-h)/2;
  const g=c.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#fff8e9');g.addColorStop(1,'#f5e3d3');c.fillStyle=g;c.beginPath();c.roundRect(x,y,w,h,26);c.fill();
  c.strokeStyle='#ffffffc9';c.lineWidth=3;c.stroke();
  const title={guests:'guests',wishes:'',accessories:'',album:'album',photo:'camera',ties:''}[this.mode];icon(c,title,x+w/2,y+40,37);
  if(this.mode==='wishes')wishIcon(c,wishes[a.wish()],x+w/2,y+40,52);
  if(this.mode==='ties')tieIcon(c,'double',x+w/2,y+40,51);
  if(this.mode==='accessories'||this.mode==='ties'){this.button(c,x+40,y+40,'',()=>this.open(this.mode==='ties'?'accessories':'ties'),{label:this.mode==='ties'?'切換到髮飾':'切換到綁髮'});if(this.mode==='accessories')tieIcon(c,'double',x+40,y+40,47);else ornament(c,'bow',x+40,y+40,35,a.color())}
  if(this.mode==='accessories')ornament(c,'bow',x+w/2,y+40,44,a.color());
  this.button(c,x+w-40,y+40,'close',()=>{this.mode=null;this.confirmDelete=false});
  const panelTitles={guests:'今天幫誰換造型？',wishes:'挑一個造型靈感',ties:'把頭髮綁起來',accessories:'加一點可愛',album:'我的作品集',photo:'新造型完成！',reset:'重新開始？'};
  caption(c,panelTitles[this.mode]||'',x+w/2,y+72,14);
  if(this.mode==='album')caption(c,`${a.memory.photos.length} / 48 張・只保存在這台裝置`,x+w/2,y+h-42,11);
  const body={x:x+16,y:y+96,w:w-32,h:h-120};
  if(this.mode==='reset'){
   caption(c,'目前的造型會重設，可以用撤銷找回。',x+w/2,y+h*.44,13);
   const bw=Math.min(210,w-48),by=y+h*.58;c.fillStyle='#896995';c.beginPath();c.roundRect(x+(w-bw)/2,by,bw,50,15);c.fill();c.save();c.font='600 16px system-ui';c.fillStyle='#fff';c.textAlign='center';c.fillText('↻',x+w/2-58,by+34);c.fillText('重新開始',x+w/2+9,by+31);c.restore();this.region(x+(w-bw)/2,by,bw,50,()=>{a.reset();this.mode=null},'確認重新開始');
  }else if(this.mode==='photo'&&this.photo){
   const controlsY=y+h-52,areaH=Math.max(65,h-199),ratio=320/430,ph=Math.min(areaH,(w-50)/ratio),pw=ph*ratio;
   const px=x+(w-pw)/2,py=body.y+(areaH-ph)/2;this.polaroid(c,this.photo.image,px,py,pw,ph);
   const icons=['edit','download','trash','next'],step=Math.min(88,(w-20)/4);
   icons.forEach((kind,i)=>this.button(c,x+w/2+(i-1.5)*step,controlsY,kind,async()=>{
    if(kind==='edit'){a.restore(this.photo.state);this.mode=null}
    if(kind==='download'){const link=document.createElement('a');link.href=this.photo.image;link.download='little-salon-'+this.photo.id+'.jpg';link.click()}
    if(kind==='next')this.open('guests');
    if(kind==='trash'){if(!this.confirmDelete){this.confirmDelete=true;return}if(await a.memory.remove(this.photo.id)){this.photo=null;this.open('album')}}
   },{color:kind==='trash'&&this.confirmDelete?'#f0a1a1':'#f7e7d7',active:kind==='trash'&&this.confirmDelete}));
   icons.forEach((kind,i)=>caption(c,kind==='trash'&&this.confirmDelete?'再按一次刪除':kind==='next'?'換客人':labels[kind],x+w/2+(i-1.5)*step,controlsY+39,10));
  }else{
   let entries,columns,rows;
   if(this.mode==='guests'){entries=a.guests;columns=w>600?3:2;rows=Math.ceil(entries.length/columns)}
   if(this.mode==='ties'){entries=TIE_MODES;columns=3;rows=Math.ceil(entries.length/columns)}
   if(this.mode==='wishes'){entries=wishes;columns=w>600?3:2;rows=Math.ceil(entries.length/columns)}
   if(this.mode==='accessories'){entries=accessories;columns=w>600?4:2;rows=Math.ceil(entries.length/columns)}
   if(this.mode==='album'){columns=w>600?3:2;rows=h<480?1:2;const count=columns*rows;this.page=Math.min(this.page,Math.max(0,Math.ceil(a.memory.photos.length/count)-1));entries=a.memory.photos.slice(this.page*count,(this.page+1)*count);body.h-=68;
    this.button(c,x+42,y+h-43,'back',()=>{this.page=Math.max(0,this.page-1)});
    this.button(c,x+w-42,y+h-43,'next',()=>{this.page=Math.min(Math.max(0,Math.ceil(a.memory.photos.length/count)-1),this.page+1)});
    if(a.memory.problem)icon(c,'warning',x+w/2,y+h-43,30);
    if(!entries.length){icon(c,'camera',x+w/2,y+h*.45,85);ornament(c,'heart',x+w/2+43,y+h*.45-40,32,0);this.button(c,x+w/2,y+h*.7,'back',()=>this.mode=null)}
   }
   const gap=12,cw=(body.w-gap*(columns-1))/columns,ch=(body.h-gap*(rows-1))/rows;
   entries?.forEach((entry,i)=>{const bx=body.x+(i%columns)*(cw+gap),by=body.y+Math.floor(i/columns)*(ch+gap);
    c.save();c.fillStyle='#fffdf3';c.shadowColor='#966a5930';c.shadowBlur=8;c.shadowOffsetY=3;c.beginPath();c.roundRect(bx,by,cw,ch,17);c.fill();c.restore();
    if(this.mode==='guests'){const im=a.preview(entry.id);if(im){const scale=Math.min((cw-12)/im.width,(ch-35)/im.height);c.drawImage(im,bx+(cw-im.width*scale)/2,by+(ch-25-im.height*scale)/2,im.width*scale,im.height*scale)}caption(c,guestNames[entry.id],bx+cw/2,by+ch-15,12);if(a.guestId()===entry.id){c.strokeStyle='#dbb071';c.lineWidth=3;c.beginPath();c.roundRect(bx+2,by+2,cw-4,ch-4,15);c.stroke()}this.region(bx,by,cw,ch,()=>{a.chooseGuest(entry.id);this.mode=null},guestNames[entry.id])}
    if(this.mode==='ties'){const im=a.tiePreview(entry);
     if(im){const sc=Math.min((cw-10)/im.width,(ch-34)/im.height),iw=im.width*sc,ih=im.height*sc;c.save();c.beginPath();c.roundRect(bx+(cw-iw)/2,by+(ch-24-ih)/2,iw,ih,12);c.clip();c.drawImage(im,bx+(cw-iw)/2,by+(ch-24-ih)/2,iw,ih);c.restore()}
     else tieIcon(c,entry,bx+cw/2,by+(ch-24)/2,Math.min(cw-20,ch-34,110));
     caption(c,tieNames[entry],bx+cw/2,by+ch-13,11);
     if(entry==='loose'){c.save();c.strokeStyle='#cc728dcc';c.lineWidth=4;c.lineCap='round';const r=Math.min(cw,ch)*.13;c.beginPath();c.arc(bx+cw-r-10,by+r+10,r,0,TAU);c.moveTo(bx+cw-r-10-r*.7,by+r+10+r*.7);c.lineTo(bx+cw-r-10+r*.7,by+r+10-r*.7);c.stroke();c.restore()}
     if(a.tieMode()===entry){c.strokeStyle='#dbb071';c.lineWidth=3;c.beginPath();c.roundRect(bx+2,by+2,cw-4,ch-4,15);c.stroke()}
     this.region(bx,by,cw,ch,()=>{a.tie(entry);this.mode=null},tieNames[entry])}
    if(this.mode==='wishes'){wishIcon(c,entry,bx+cw/2,by+(ch-24)/2,Math.min(cw-15,ch-34,160));caption(c,wishNames[wishes.indexOf(entry)],bx+cw/2,by+ch-14,12);this.region(bx,by,cw,ch,()=>{a.chooseWish(wishes.indexOf(entry));this.mode=null},wishNames[wishes.indexOf(entry)])}
    if(this.mode==='accessories'){ornament(c,entry,bx+cw/2,by+(ch-24)/2,Math.min(120,cw*.62,(ch-34)*.75),a.color());caption(c,accessoryNames[entry],bx+cw/2,by+ch-13,12);this.region(bx,by,cw,ch,()=>{a.chooseOrnament(entry);this.mode=null},accessoryNames[entry])}
    if(this.mode==='album'){const ph=Math.min(ch-12,(cw-12)*430/320),pw=ph*320/430;this.polaroid(c,entry.image,bx+(cw-pw)/2,by+(ch-ph)/2,pw,ph);this.region(bx,by,cw,ch,()=>{this.photo=entry;this.confirmDelete=false;this.mode='photo'},'開啟作品照片')}
   });
  }
  c.restore();if(now-this.flash<400){c.fillStyle=`rgba(255,250,230,${.7*(1-(now-this.flash)/400)})`;c.fillRect(0,0,l.width,l.height)}
 }
 polaroid(c,url,x,y,w,h){const im=this.image(url);c.save();c.fillStyle='#fffdf5';c.fillRect(x,y,w,h);if(im.complete&&im.naturalWidth)c.drawImage(im,x+5,y+5,w-10,h-20);ornament(c,'heart',x+w/2,y+h-8,10,0);c.restore()}
}
