'use strict';
// Facial art lives on a small transparent layer; the Mixamo head and helmet stay intact.
window.BaseballFaces=(()=>{
  const T=window.THREE, W=512, H=384, limit=(v,a,b)=>Math.max(a,Math.min(b,v));
  let geometry=null;
  const moods={
    focus:{open:.94,brow:.65,smile:.12,mouth:0},
    confident:{open:1,brow:.1,smile:.64,mouth:.12},
    effort:{open:.72,brow:1,smile:-.15,mouth:.35},
    joy:{open:.86,brow:-.35,smile:1,mouth:.7},
    frustrated:{open:.79,brow:.85,smile:-.65,mouth:.08},
    concern:{open:1.13,brow:-.55,smile:-.2,mouth:.42}
  };
  function ellipse(g,x,y,rx,ry,color){g.fillStyle=color;g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fill();}
  function eye(g,o,s,x,y,a){
    const wide=46+(o.eye||.5)*6, tall=52+(o.sharp?-5:3), openness=Math.max(.02,a.open*(1-a.blink));
    g.save();g.translate(x,y);g.scale(1,openness);
    // Almond silhouette, shaded sclera, a luminous iris and a thick upper lid.
    g.beginPath();g.moveTo(-wide,0);g.bezierCurveTo(-wide+4,-tall,wide-8,-tall-6,wide,-3);
    g.bezierCurveTo(wide-4,tall-3,-wide+10,tall+4,-wide,0);g.closePath();
    g.fillStyle='#281c19';g.fill();g.save();g.clip();
    const white=g.createLinearGradient(0,-tall,0,tall);white.addColorStop(0,'#9eaebd');white.addColorStop(.27,'#fffdf5');white.addColorStop(.8,'#fffef7');white.addColorStop(1,'#d8c4b1');
    g.fillStyle=white;g.fillRect(-wide+4,-tall+5,wide*2-8,tall*2-10);
    const ix=a.gazeX*15+s*2, iy=a.gazeY*-13+3, ir=31+(o.eye||.5)*3;
    const iris=g.createRadialGradient(ix-8,iy-13,3,ix,iy,ir+5);
    iris.addColorStop(0,'#d7b96c');iris.addColorStop(.34,o.iris);iris.addColorStop(.76,o.iris);iris.addColorStop(1,'#151e28');
    ellipse(g,ix,iy,ir,42,iris);
    g.strokeStyle='rgba(246,220,158,.36)';g.lineWidth=1.5;
    for(let i=0;i<28;i++){const r=i*Math.PI/14;g.beginPath();g.moveTo(ix+Math.cos(r)*19,iy+Math.sin(r)*25);g.lineTo(ix+Math.cos(r)*29,iy+Math.sin(r)*38);g.stroke();}
    ellipse(g,ix,iy-1,15,24,'#10131b');
    ellipse(g,ix-10,iy-20,9,12,'#fff');ellipse(g,ix+12,iy+18,4,5,'rgba(255,246,216,.92)');
    g.strokeStyle='rgba(255,255,255,.34)';g.lineWidth=2;g.beginPath();g.ellipse(ix+1,iy+2,ir-3,39,0,.15,1.4);g.stroke();
    g.restore();
    g.strokeStyle='#261a17';g.lineWidth=7;g.lineCap='round';g.beginPath();g.moveTo(-wide,0);g.bezierCurveTo(-wide+4,-tall,wide-8,-tall-6,wide,-3);g.stroke();
    g.strokeStyle='rgba(130,67,46,.5)';g.lineWidth=3;g.beginPath();g.moveTo(-wide+7,16);g.quadraticCurveTo(0,tall+2,wide-8,13);g.stroke();
    g.restore();
    if(a.blink>.88){g.strokeStyle='#35251f';g.lineWidth=5;g.lineCap='round';g.beginPath();g.moveTo(x-wide,y);g.quadraticCurveTo(x,y+8,x+wide,y-3);g.stroke();}
    const arch=a.brow*17, lift=(s<0?o.brow||.5:1-(o.brow||.5))*7;
    const inner=x-s*39, outer=x+s*43, by=y-67-lift;
    g.fillStyle=o.hair;g.beginPath();g.moveTo(inner,by+arch);g.quadraticCurveTo(x,by-19,outer,by-arch*.55);
    g.lineTo(outer+s*2,by+9-arch*.55);g.quadraticCurveTo(x,by-7,inner,by+arch+11);g.closePath();g.fill();
    g.strokeStyle='rgba(255,236,196,.22)';g.lineWidth=1.5;g.beginPath();g.moveTo(inner,by+arch+3);g.quadraticCurveTo(x,by-14,outer,by-arch*.55+2);g.stroke();
  }
  function draw(g,o,a){
    g.clearRect(0,0,W,H);
    eye(g,o,-1,162,137,a);eye(g,o,1,350,137,a);
    // Warm lower lids and a small philtrum keep the face from looking like a decal.
    g.strokeStyle='rgba(123,62,43,.28)';g.lineWidth=2.5;g.lineCap='round';
    for(const s of [-1,1]){g.beginPath();g.moveTo(256+s*82,196);g.quadraticCurveTo(256+s*93,201,256+s*114,195);g.stroke();}
    g.beginPath();g.moveTo(255,225);g.quadraticCurveTo(252,233,258,236);g.stroke();
    const cx=256, y=272, width=35+Math.max(0,a.smile)*33+(o.smile||.5)*7;
    const curve=a.smile*24, skew=(o.smile||.5)*7-3.5, opening=a.mouth*42;
    if(opening>5){
      g.beginPath();g.moveTo(cx-width,y-curve*.45-skew);g.quadraticCurveTo(cx,y+curve*.6,cx+width,y-curve*.45+skew);
      g.quadraticCurveTo(cx+width*.8,y+opening+curve,cx,y+opening+curve*.6);g.quadraticCurveTo(cx-width*.8,y+opening+curve,cx-width,y-curve*.45-skew);g.closePath();
      g.fillStyle='#48252c';g.fill();g.save();g.clip();
      if(a.smile>0){g.fillStyle='#fff9e8';g.beginPath();g.moveTo(cx-width-2,y-curve*.5-2);g.quadraticCurveTo(cx,y+curve*.6-2,cx+width+2,y-curve*.5-2);g.lineTo(cx+width+2,y+10-curve*.5);g.quadraticCurveTo(cx,y+curve*.6+11,cx-width-2,y+10-curve*.5);g.closePath();g.fill();}
      ellipse(g,cx+5,y+opening+curve*.6,opening*.8,opening*.35,'#c46771');g.restore();
      g.strokeStyle='#6c3c31';g.lineWidth=3;g.beginPath();g.moveTo(cx-width,y-curve*.45-skew);g.quadraticCurveTo(cx,y+curve*.6,cx+width,y-curve*.45+skew);g.stroke();
    } else {
      g.strokeStyle='#794338';g.lineWidth=4.5;g.beginPath();g.moveTo(cx-width,y-curve*.4-skew);g.quadraticCurveTo(cx,y+curve,cx+width,y-curve*.4+skew);g.stroke();
    }
    g.strokeStyle='rgba(255,233,204,.75)';g.lineWidth=3;g.beginPath();g.moveTo(cx-20,y+Math.max(opening+curve*.6,curve*.7)+9);g.quadraticCurveTo(cx+3,y+Math.max(opening+curve*.6,curve*.7)+13,cx+23,y+Math.max(opening+curve*.6,curve*.7)+8);g.stroke();
    if(a.smile>.45){
      g.strokeStyle='rgba(130,68,45,.38)';g.lineWidth=2;
      for(const s of [-1,1]){g.beginPath();g.moveTo(cx+s*(width+4),y-curve*.4-5);g.quadraticCurveTo(cx+s*(width+10),y-11,cx+s*(width+9),y+3);g.stroke();}
    }
  }
  function layer(o){
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
    const ctx=canvas.getContext('2d'), a={...moods.confident,blink:0,gazeX:0,gazeY:0};draw(ctx,o,a);
    return {canvas,ctx,a};
  }
  function create(head,base,o){
    if(!geometry){
      geometry=base.geometry.clone();const uv=geometry.attributes.uv;
      for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-.34)/.32,(uv.getY(i)-.42)/.4);
    }
    const art=layer(o), texture=new T.CanvasTexture(art.canvas);
    texture.colorSpace=T.SRGBColorSpace;texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=T.LinearFilter;
    const material=new T.MeshPhysicalMaterial({map:texture,transparent:true,alphaTest:.02,depthWrite:false,roughness:.43,clearcoat:.28,clearcoatRoughness:.25,polygonOffset:true,polygonOffsetFactor:-2});
    const mesh=new T.Mesh(geometry,material);mesh.scale.setScalar(1.003);mesh.receiveShadow=true;head.add(mesh);
    const phase=((o.seed||1)*.61803398875)%1;
    return {...art,o,texture,mesh,look:new T.Vector3(),nextFrame:0,nextBlink:null,blinkAt:-100,phase,reaction:null};
  }
  function react(c,name,t,duration=1.1){if(c?.face)c.face.reaction={name,until:t+duration};}
  function update(c,t,dt,target,mood='focus',effort=0,lock=false){
    const f=c?.face;if(!f||!c.root.visible)return;
    const name=f.reaction&&t<f.reaction.until?f.reaction.name:mood, desired=moods[name]||moods.focus, a=f.a;
    c.head.updateWorldMatrix(true,false);f.look.copy(target);c.head.worldToLocal(f.look);
    const depth=Math.max(3,Math.abs(f.look.z)), blend=1-Math.exp(-dt*12);
    a.gazeX+=(limit(f.look.x/depth,-1,1)*.85-a.gazeX)*blend;
    a.gazeY+=(limit(f.look.y/depth,-.7,.7)-a.gazeY)*blend;
    for(const k of ['open','brow','smile','mouth'])a[k]+=(desired[k]-a[k])*blend;
    a.brow+=(effort*.18)*blend;a.open-=effort*.08*blend;
    if(f.nextBlink===null)f.nextBlink=t+1.7+f.phase*3.1;
    if(t>=f.nextBlink&&!lock){f.blinkAt=t;f.nextBlink=t+2.8+((f.phase+t*.137)%1)*2.7;}
    a.blink=lock?0:Math.max(0,1-Math.abs((t-f.blinkAt)/.085-1));
    if(t<f.nextFrame)return;f.nextFrame=t+1/24;
    draw(f.ctx,f.o,a);f.texture.needsUpdate=true;
  }
  function portrait(o,base){
    const p=document.createElement('canvas');p.width=p.height=256;const g=p.getContext('2d'), art=layer(o.face);
    const bg=g.createLinearGradient(0,0,256,256);bg.addColorStop(0,'#96cee4');bg.addColorStop(.5,'#437ba2');bg.addColorStop(1,'#142b4a');g.fillStyle=bg;g.fillRect(0,0,256,256);
    g.fillStyle=o.uni.base;g.beginPath();g.ellipse(128,273,101,67,0,0,Math.PI*2);g.fill();
    g.fillStyle=o.face.skin;for(const x of [42,214])ellipse(g,x,150,15,26,o.face.skin);
    g.save();g.beginPath();g.roundRect(50,60,156,170,50);g.clip();g.drawImage(base.image,700,290,650,660,50,60,156,170);
    g.drawImage(art.canvas,49,96,157,105.5);g.restore();
    const cap=g.createLinearGradient(0,16,0,110);cap.addColorStop(0,o.cap.color);cap.addColorStop(1,'#10263e');g.fillStyle=cap;
    g.beginPath();g.moveTo(42,98);g.quadraticCurveTo(35,14,128,14);g.quadraticCurveTo(222,14,214,98);g.closePath();g.fill();
    g.strokeStyle='rgba(255,255,255,.2)';g.lineWidth=2;g.beginPath();g.moveTo(127,18);g.quadraticCurveTo(137,55,128,92);g.stroke();
    ellipse(g,128,96,97,16,o.cap.color);g.strokeStyle='rgba(8,19,34,.5)';g.beginPath();g.ellipse(128,96,97,16,0,0,Math.PI);g.stroke();
    g.fillStyle=o.cap.ink||'#fff';g.font='italic 900 44px Rubik,Arial';g.textAlign='center';g.fillText(o.cap.logo||'',128,73);
    g.strokeStyle='rgba(255,255,255,.42)';g.lineWidth=4;g.beginPath();g.moveTo(60,50);g.quadraticCurveTo(85,27,113,28);g.stroke();
    return p.toDataURL('image/png');
  }
  return {create,update,react,portrait};
})();
