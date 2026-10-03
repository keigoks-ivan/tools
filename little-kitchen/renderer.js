import {foodDrawing,utensil} from './art.js?v=5';
const palette={carrot:'#ec923f',broccoli:'#60984e',rice:'#e9d3a1',seaweed:'#507854',bread:'#d6a163',tomato:'#e87659',flour:'#ead2a4',milk:'#d6e4da',strawberry:'#d96070',fish:'#95b8be'};
function loadSVG(body,viewBox='0 0 200 200'){
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`);});
}
export async function createRenderer(canvas){
  const ctx=canvas.getContext('2d'),images={},pouredImages={},tools={};
  ctx.setTransform(2,0,0,2,0,0);
  await Promise.all(Object.keys(palette).map(async id=>{
    const base=palette[id],gradient=`<defs><radialGradient id="food"><stop stop-color="${base}"/><stop offset="1" stop-color="${base}" stop-opacity=".82"/></radialGradient></defs>`;
    images[id]=await loadSVG(gradient+foodDrawing(id).replaceAll(`fill="${base}"`,'fill="url(#food)"'));
    if(['milk','flour','rice'].includes(id))pouredImages[id]=await loadSVG(foodDrawing(id,{piece:true}));
  }));
  await Promise.all(['knife','spatula','spoon','ladle'].map(async id=>{const svg=utensil(id);tools[id]=await loadSVG(svg.slice(svg.indexOf('>')+1,svg.lastIndexOf('</svg>')),'0 0 210 200');}));
  const round=(x,y,w,h,r,fill,stroke=null,line=3)=>{ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else{ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}};
  const ellipse=(x,y,rx,ry,fill,stroke=null,line=3)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}};
  function piece(p,blend=0){
    ctx.save();ctx.globalAlpha=1-blend*.95;ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.scale(p.scale*(1-blend*.85),p.scale*(1-blend*.85));
    ctx.beginPath();p.poly.forEach((v,i)=>i?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.closePath();
    ctx.save();ctx.shadowColor='#68492d28';ctx.shadowBlur=9;ctx.shadowOffsetY=6;ctx.fillStyle='#7358310a';ctx.fill();ctx.restore();ctx.clip();
    if(p.pancake){ellipse(0,0,68,48,p.cooked>.5?'#dfaa58':'#f3ddb0','#ba894b',5);ctx.beginPath();ctx.moveTo(-37,-12);ctx.quadraticCurveTo(-15,-25,12,-16);ctx.strokeStyle=p.cooked>.5?'#f8d48c':'#fff0ce';ctx.lineWidth=7;ctx.lineCap='round';ctx.stroke();ctx.restore();return;}
    const browning=['fish','bread','rice','flour'].includes(p.id)?.6:.06;
    ctx.filter=p.cooked?`sepia(${p.cooked*browning}) saturate(${1-p.cooked*.08}) brightness(${1-p.cooked*.06})`:'none';ctx.drawImage(p.poured?pouredImages[p.id]:images[p.id],p.tex.x,p.tex.y,200,200);ctx.filter='none';
    for(const edge of p.edges||[]){ctx.beginPath();ctx.moveTo(edge.a.x,edge.a.y);ctx.lineTo(edge.b.x,edge.b.y);ctx.lineWidth=18;ctx.strokeStyle=p.id==='carrot'?'#f6b15d':p.id==='tomato'?'#ffb080':p.id==='strawberry'?'#f1baa2':p.id==='fish'?'#f9c4a7':p.id==='broccoli'?'#a5be74':'#f5d9a4';ctx.stroke();
      if(['tomato','strawberry','bread'].includes(p.id)){const dx=edge.b.x-edge.a.x,dy=edge.b.y-edge.a.y,len=Math.hypot(dx,dy)||1;ctx.strokeStyle=p.id==='bread'?'#cda779':'#ffe5a2';ctx.lineWidth=4;for(let i=1;i<6;i++){const x=edge.a.x+dx*i/6,y=edge.a.y+dy*i/6;ctx.beginPath();ctx.moveTo(x-dy/len*4,y+dx/len*4);ctx.lineTo(x+dy/len*4,y-dx/len*4);ctx.stroke();}}
    }
    ctx.restore();
  }
  function surface(height){
    const grad=ctx.createLinearGradient(0,0,0,height);grad.addColorStop(0,'#ebd0a5');grad.addColorStop(1,'#ddba85');ctx.fillStyle=grad;ctx.fillRect(0,0,720,height);
    ctx.strokeStyle='#b48a5920';ctx.lineWidth=2;for(let y=35;y<height;y+=66){ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(200,y-8,500,y+8,720,y);ctx.stroke();}
  }
  function board(s,time,offset,height){
    const top=64-offset,h=height-128;
    ctx.save();ctx.shadowColor='#75523638';ctx.shadowBlur=22;ctx.shadowOffsetY=12;
    round(47,top,626,h+13,37,'#d09b58','#ab763f',5);ctx.restore();
    const wood=ctx.createLinearGradient(50,top,640,top+h);wood.addColorStop(0,'#f8dfaa');wood.addColorStop(.5,'#efd09a');wood.addColorStop(1,'#e6bd80');round(56,top+6,608,h-6,30,wood,'#f5deae',4);
    ctx.save();ctx.strokeStyle='#bd8a4940';ctx.lineWidth=2;for(let y=top+39;y<top+h-20;y+=38){ctx.beginPath();ctx.moveTo(80,y);ctx.bezierCurveTo(200,y+7,480,y-9,640,y);ctx.stroke();}ctx.restore();
    ellipse(630,top+34,10,10,'#9b6b3e');for(const p of s.board)piece(p);
    if(!s.board.length){ctx.save();ctx.setLineDash([9,10]);round(230,179,260,155,30,'#ffffff10','#b4916466',4);ctx.restore();ctx.drawImage(images.carrot,288,170,155,155);ctx.fillStyle='#eed3a1';ctx.globalAlpha=.6;ctx.fillRect(280,169,165,158);ctx.globalAlpha=1;}
    if(s.effect?.kind==='wash'){ctx.save();ctx.strokeStyle='#83c7dcbb';ctx.lineWidth=9;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(245+i*35,60);ctx.lineTo(242+i*35,210+(time*200+i*30)%120);ctx.stroke();}ctx.restore();}
  }
  function fire(s,time){
    const heat=s.heat[s.method]||0;if(!heat)return;
    for(let i=0;i<9;i++){const x=230+i*28,h=32+heat*35+Math.sin(time*8+i)*10;ctx.beginPath();ctx.moveTo(x,425);ctx.quadraticCurveTo(x-22,400,x+5,425-h);ctx.quadraticCurveTo(x+8,407,x+21,425);ctx.fillStyle=i%2?'#f4a947':'#f7cc6b';ctx.fill();}
  }
  function steam(s,time){
    if(!s.heat[s.method]||!s.vessels[s.method].length)return;
    ctx.save();ctx.strokeStyle='#fff8e1';ctx.lineWidth=9;ctx.lineCap='round';for(let i=0;i<4;i++){ctx.globalAlpha=.18+(Math.sin(time*2+i)+1)*.14;const y=95-((time*30+i*35)%65);ctx.beginPath();ctx.moveTo(235+i*70,y);ctx.bezierCurveTo(205+i*70,y-30,260+i*70,y-45,234+i*70,y-65);ctx.stroke();}ctx.restore();
  }
  function stove(s,time){
    ctx.save();ctx.shadowColor='#644d3930';ctx.shadowBlur=15;ctx.shadowOffsetY=10;round(99,86,521,399,34,'#c7d4cf','#8da9a2',5);ctx.restore();
    round(113,96,492,373,25,'#e9eddd','#fcf7e2',3);ellipse(350,245,204,191,'#6d7d78');ellipse(350,245,186,177,'#405553');
    fire(s,time);
    if(s.method==='pan'){
      ctx.save();ctx.translate(507,312);ctx.rotate(.35);round(0,-24,170,49,18,'#586c68','#304a48',7);round(38,-17,120,33,10,'#c99a6f','#e4b888',3);ctx.restore();
      ellipse(350,245,190,166,'#334b4c','#253a3b',7);
      const pan=ctx.createRadialGradient(315,200,15,350,245,174);pan.addColorStop(0,'#718382');pan.addColorStop(1,'#4f6565');ellipse(350,240,174,149,pan,'#829693',6);
      if(s.liquid.pan)ellipse(350,255,145,110,'#eed18844');
    }else{
      round(94,210,80,59,19,'#a9d3c3','#648f85',6);round(526,210,82,59,19,'#a9d3c3','#648f85',6);
      ellipse(350,248,192,168,'#72a79a','#4e8579',8);ellipse(350,235,174,146,'#e8e5cf','#c5e2ce',9);
      if(s.liquid.pot){const broth=ctx.createRadialGradient(300,200,20,350,245,170);broth.addColorStop(0,'#f5d796');broth.addColorStop(1,'#dcaf65');ellipse(350,240,164,134,broth);}
    }
    ctx.save();ctx.beginPath();ctx.ellipse(350,240,164,134,0,0,Math.PI*2);ctx.clip();
    const pieces=s.vessels[s.method];for(const p of pieces)piece(p);
    if(s.heat[s.method])for(let i=0;i<12;i++){const x=220+(i*53)%260,y=145+(i*71)%195,r=3+(Math.sin(time*4+i)+1)*4;ellipse(x,y,r,r,'#fff3c82a','#fff2ca66',2);}
    ctx.restore();
    ellipse(563,446,25,25,'#91a69a','#61796b',4);ctx.save();ctx.translate(563,446);ctx.rotate((s.heat[s.method]||0)*Math.PI*1.4);round(-3,-19,6,22,3,'#fff4d7');ctx.restore();steam(s,time);
  }
  function blender(s,time){
    ctx.save();ctx.shadowColor='#895d4330';ctx.shadowOffsetY=9;ctx.shadowBlur=20;round(216,374,280,105,35,'#d99288','#b96b68',6);ctx.restore();round(232,384,247,79,24,'#edb6a0');
    ctx.beginPath();ctx.moveTo(224,94);ctx.lineTo(480,94);ctx.lineTo(454,371);ctx.lineTo(250,371);ctx.closePath();ctx.fillStyle='#e6f0dfbb';ctx.fill();ctx.lineWidth=9;ctx.strokeStyle='#77aaa5';ctx.stroke();
    ctx.beginPath();ctx.moveTo(486,124);ctx.bezierCurveTo(581,111,588,307,466,302);ctx.lineWidth=22;ctx.strokeStyle='#77aaa5';ctx.stroke();
    round(209,64,289,43,16,'#95beb0','#669790',5);
    ctx.save();ctx.beginPath();ctx.moveTo(234,109);ctx.lineTo(469,109);ctx.lineTo(445,360);ctx.lineTo(258,360);ctx.closePath();ctx.clip();
    if(s.vessels.blender.length){const berry=s.vessels.blender.some(p=>p.id==='strawberry');ctx.fillStyle=berry?'#ea98a0':'#eac786';ctx.globalAlpha=.15+s.blend*.8;ctx.fillRect(240,220-s.liquid.blender*45,226,155+s.liquid.blender*45);ctx.globalAlpha=1;for(const p of s.vessels.blender)piece(p,p.blended);}
    ctx.restore();ctx.beginPath();ctx.moveTo(257,121);ctx.lineTo(271,288);ctx.strokeStyle='#fffef399';ctx.lineWidth=12;ctx.lineCap='round';ctx.stroke();
    ellipse(356,423,34,34,s.blending?'#819f63':'#a96a67','#fff0d8',5);ctx.fillStyle='#fff2d6';ctx.beginPath();ctx.moveTo(347,409);ctx.lineTo(347,437);ctx.lineTo(371,423);ctx.closePath();ctx.fill();
  }
  function plate(s){
    ctx.save();if(s.plateOffset)ctx.translate(s.plateOffset.x,s.plateOffset.y);
    const x=310;ellipse(x,311,235,152,'#bf915b25');ellipse(x,290,222,151,'#fbf6e8','#cebd9d',7);ellipse(x,278,190,122,'#f2e8ce','#e3d4b1',4);
    if(s.plateMethod==='blender'&&s.plateBlend>.5){round(223,131,178,274,14,'#d4e5d9aa','#8aaea0',6);round(230,185,164,211,9,s.plate.some(p=>p.id==='strawberry')?'#e89ca3':'#e5c185');ctx.strokeStyle='#c7858b';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(309,326);ctx.lineTo(369,110);ctx.lineTo(418,110);ctx.stroke();}
    else{if(s.plateMethod==='pot'&&s.plateLiquid)ellipse(x,279,181,112,'#edc981');for(const p of s.plate)piece({...p,x:p.x-40});}
    ctx.restore();
  }
  function draw(s,time,pointer,activeTool,height=540){
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,720,height);surface(height);const offset=(height-540)/2;ctx.save();ctx.translate(0,offset);if(s.station==='stove'){ctx.translate(360,270);ctx.scale(1.25,1.25);ctx.translate(-360,-270);}
    if(s.station==='board')board(s,time,offset,height);else if(s.station==='stove')s.method==='blender'?blender(s,time):stove(s,time);else if(s.station==='serve')plate(s);
    if(s.effect&&time<s.effect.until){
      if(s.effect.kind==='salt'){ctx.fillStyle='#fff9e8';for(let i=0;i<28;i++){const x=250+(i*47)%220,y=100+(time*140+i*23)%250;ctx.fillRect(x,y,4,5);}}
      if(s.effect.kind==='pour'){ctx.save();ctx.strokeStyle=s.method==='pan'?'#e8bf56':'#8ccbd5';ctx.lineWidth=13;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(250,100);ctx.lineTo(330,245);ctx.stroke();ctx.restore();}
    }
    if(s.station==='board'&&activeTool==='knife'){
      const p=pointer||{x:515,y:175};ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.2);ctx.drawImage(tools.knife,-80,-65,190,150);ctx.restore();
      if(pointer?.trail?.length){ctx.save();ctx.strokeStyle='#fff9d9cc';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();pointer.trail.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}
    }else if(s.station==='stove'&&s.method!=='blender'){
      const p=pointer||{x:470,y:283};ctx.save();ctx.translate(p.x,p.y);ctx.rotate(-.15);ctx.drawImage(tools[s.method==='pot'?'spoon':'spatula'],-85,-85,190,175);ctx.restore();
    }
    ctx.restore();
  }
  return {draw};
}
