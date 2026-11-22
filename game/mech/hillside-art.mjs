import * as THREE from 'three';
import { PropBatch, fieldMaterial, signAtlas } from './front-scenery.mjs';
import { HILL_LINES, HILL_EXIT, HILL_COVER, HILL_ALLEY } from './hillside-layout.mjs';

export function buildHillside(world,root) {
  const materials={
    concrete:fieldMaterial(world,0xaaa391,.86,.06,'precast'),stone:fieldMaterial(world,0x706a5e,.94,.02,'concrete'),
    asphalt:fieldMaterial(world,0x565756,.87,.08,'asphalt'),paint:fieldMaterial(world,0xffffff,.71,.22,'paint',true),
    glass:fieldMaterial(world,0x345560,.33,.41),steel:fieldMaterial(world,0x525e5b,.59,.48,'paint'),
    white:fieldMaterial(world,0xe4dfc9,.74,.12),mark:fieldMaterial(world,0xc29652,.76,.1),
  };
  const b=new PropBatch(materials),height=(x,z)=>world.height(x,z);
  const box=(k,x,z,y,w,h,d,rx=0,ry=0,rz=0,color=0xffffff)=>b.box(k,x,height(x,z)+y,z,w,h,d,rx,ry,rz,color);
  function solid(x,z,w,d,h) {world.addCollider({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top:height(x,z)+h});}
  const paint=(x,z,y,w,h,d,tint)=>box('paint',x,z,y,w,h,d,0,0,0,tint);
  const cyl=new THREE.CylinderGeometry(1,1,1,14),tire=new THREE.CylinderGeometry(1,1,1,10).rotateX(Math.PI/2);
  const road=(a,c,width,frontage=false)=>{
    const [ax,az]=a,[cx,cz]=c,len=Math.hypot(cx-ax,cz-az);
    const dx=(cx-ax)/len,dz=(cz-az)/len;
    const n=Math.ceil(len/12),v=new THREE.Vector3();
    function stripe(t0,t1,left,right,k,lift){
      const xyz=[],uv=[],normal=[];
      for(const [t,offset] of [[t0,left],[t1,left],[t0,right],[t1,left],[t1,right],[t0,right]]){
        const x=ax+dx*t-dz*offset,z=az+dz*t+dx*offset;
        v.set(x,height(x,z)+lift,z);xyz.push(v.x,v.y,v.z);uv.push(t/7,offset/7);normal.push(0,1,0);
      }
      const g=new THREE.BufferGeometry();g.setIndex([0,2,1,3,5,4]);
      g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));b.collect(k,g,0xffffff);
    }
    for(let i=0;i<n;i++){
      const t=i*len/n,end=(i+1)*len/n;
      if(frontage){
        stripe(t,end,-34,-width*.5,'concrete',.085);
        stripe(t,end,width*.5,34,'concrete',.085);
      }
      stripe(t,end,-width*.5,width*.5,'asphalt',.16);
      for(const side of [-1,1])stripe(t,end,side*width*.46-.14,side*width*.46+.14,'white',.24);
      if(i%2===0)stripe(t+.4,end-.8,-.17,.17,'mark',.26);
    }
  };
  const roads=[0,1].map(i=>[[-590,10],...HILL_LINES.map(l=>l.posts[i]),HILL_EXIT,[680,10]]);
  for(const r of roads)for(let i=1;i<r.length;i++)road(r[i-1],r[i],i===1?24:20);
  for(const {posts} of HILL_LINES)road(posts[0],posts[1],15);
  road(HILL_ALLEY[0],HILL_ALLEY[2],14,true);
  road([-337,0],[-337,-75],13);road([-337,0],[-337,89],13);
  road([-119,-80],[-119,0],14);road([-119,0],[-119,104],14);
  for(const side of [-1,1])for(let x=-328;x<-118;x+=12){
    // 十字路口保留轉彎和穿越空間；路緣與側溝沿坡逐段取高。
    if(Math.abs(x+222)<15)continue;
    box('concrete',x,side*8.65,.16,11.96,.36,3.05);
    box('stone',x,side*7.13,.10,11.96,.22,.25);
    box('mark',x,side*8.20,.36,11.93,.025,.37);
    for(const dx of [-4,0,4])box('stone',x+dx,side*8.65,.35,.05,.018,2.96);
  }
  for(const x of [-335,-232,-211,-120])for(let k=-2;k<=2;k++)
    box('white',x,k*2.3,.25,2.6,.035,1.05);
  // 架空配線只在電桿間垂落，行進及交火高度保持淨空。
  for(const [i,x] of [-329,-281,-233,-185,-137].entries()){
    const z=-10.4,y=height(x,z);
    b.add('concrete',cyl,x,y+10,z,.30,20,.30);solid(x,z,.62,.62,20);
    box('steel',x,z,19.1,.25,.34,3.6);
    if(i%2===0)b.add('steel',cyl,x+.44,y+15.6,z,.64,1.45,.64);
    for(const off of [-1.35,0,1.35]){
      box('white',x,z+off,19.48,.2,.48,.2);
      if(i===4)continue;
      for(let k=0;k<4;k++){
        const at=t=>y+(height(x+48,z)-y)*t+19.7-4*.95*t*(1-t);
        const y0=at(k/4),y1=at((k+1)/4);
        b.box('steel',x+k*12+6,(y0+y1)/2,z+off,Math.hypot(12,y1-y0),.055,.055,0,0,Math.atan2(y1-y0,12));
      }
    }
  }
  const roofs=[0x645448,0x706d63,0x526468,0x736457];
  function building(x,z,w,d,h,i=0) {
    box('concrete',x,z,h/2-1,w,h+2,d);solid(x,z,w,d,h);
    for(const sign of [-1,1]){
      box('paint',x,z+sign*d*.25,h+1.6,w+1.8,.76,d*.54+.9,sign*.21,0,0,roofs[i%4]);
      for(let u=-w/2+4;u<w*.48;u+=6)for(let y=3.5;y<h-1;y+=4.4){
        box('glass',x+u,z+sign*(d*.5+.12),y,3,2.35,.2);
        box('white',x+u,z+sign*(d*.5+.27),y-1.22,3.45,.18,.46);
      }
    }
    box('steel',x+w*.32,z+d*.15,h+2.1,2.3,3.4,2);
  }
  function bus(x,z,color) {
    paint(x,z,2.3,14.5,3.9,4.5,color);
    box('glass',x,z,3,13,2,4.61);box('white',x,z,4.4,14.4,.44,4.6);
    for(const side of [-1,1]){
      for(let dx=-6;dx<=6;dx+=2.6)box('steel',x+dx,z+side*2.34,3,.15,2,.12);
      for(const dx of [-4.6,4.7])b.add('steel',tire,x+dx,height(x,z)+1,z+side*2.27,1,.98,.48);
    }
    solid(x,z,14.5,4.5,4.3);
  }
  for(const [x,z] of [[-504,103],[-481,103],[-458,103],[-506,-94]])bus(x,z,0xa5b5a1);
  for(const [x,z] of [[-490,80],[-391,-104],[-230,150]]){
    box('paint',x,z,8,48,.7,9,0,0,0,0x737e72);
    for(const dx of [-20,0,20]){box('steel',x+dx,z+3,4,.67,8,.67);solid(x+dx,z+3,1,1,8);}
    for(const dx of [-12,12])box('paint',x+dx,z,1.45,5.8,.4,1.2,0,0,0,0x845e48);
  }
  for(const [x,z,w,d,h,i] of [
    [-458,-147,45,22,12,1],
    [99,150,30,17,14,2],[220,-187,38,23,9,1],[315,161,39,23,15,1],[372,-159,42,28,17,3],
    [463,142,35,22,11,1],[593,-132,28,18,12,2]])building(x,z,w,d,h,i);
  // 山溪兩側的護岸和橋欄。路面的行人道和排水槽沿坡取高。
  for(const z of [-99,96])for(const s of [-1,1]) {
    for(let x=-99;x<-51;x+=8) {
      box('concrete',x,z+s*17,1.15,8.05,2.2,2);
      box('steel',x,z+s*17,3.65,8.05,.35,.38);box('steel',x+3,z+s*17,2.7,.36,2.2,.36);
    }
  }
  for(const [x,z] of [[103,-187],[153,-190],[204,-190]]) {
    const y=height(x,z);
    b.add('concrete',cyl,x,y+9,z,17,18,17);
    b.add('paint',cyl,x,y+18.4,z,17.5,1.2,17.5,0,0,0,0x8b9e9a);
    for(const dy of [3,8,13])b.add('steel',cyl,x,y+dy,z,17.1,.28,17.1);
    solid(x,z,27,27,18.5);
  }
  for(const [x,z] of [[285,-166],[390,-180],[486,-205]]){
    for(const s of [-1,1])box('steel',x,z+s*4,12,.7,24,.8,s*.1);
    box('steel',x,z,23,2,2,14);
    box('steel',x+44,z-7,22,91,.21,.21,0,.14,0);
  }
  // 各翼據點有識別桿、L 形低牆和錯開的高掩體。中間保留車隊通行空間。
  const signs=[];
  for(const [i,line] of HILL_LINES.entries())for(const [j,[x,z]] of line.posts.entries()){
    const side=j?-1:1;
    for(const off of [-24,24]){
      box('stone',x+off,z+side*25,2,16,4,4);solid(x+off,z+side*25,16,4,4);
      box('concrete',x+off,z+side*25,4.1,16.6,.5,4.7);
    }
    const bx=x+8,bz=z+side*33;
    box('concrete',bx,bz,6.5,13,13,12);solid(bx,bz,13,12,13);
    box('stone',bx,bz,13.4,15.5,1.45,14.7);
    box('steel',bx-6.58,bz,9.7,.22,1.25,8);
    box('steel',bx,bz-side*6.09,9.7,8,1.25,.2);
    box('stone',bx-6.85,bz,8.8,.9,.4,9.2);
    box('paint',bx,bz+side*6.2,3,2.9,6,.29,0,0,0,0x6c786a);
    box('steel',x-13,z+side*17,6,.7,12,.7);
    box('steel',x-13,z+side*17,12,1.2,4.6,4.6);
    if(!j){
      const jp=['バスターミナル','山手診療所','渓谷橋','配水池','林道入口','避難トンネル'][i];
      box('steel',x-19,z+24,8.8,.7,17,.7);
      signs.push([jp,x-18.7,height(x-19,z+24)+16,z+24,-Math.PI/2,21]);
    }
  }
  for(const {x,z,w,d,h,type} of HILL_COVER){
    // 擋土牆、設備間及橋墩的主體就是碰撞體；護角、洩水孔和檢修門併入靜態場景。
    const skin=type===0?'stone':'concrete';
    box(skin,x,z,h/2-1,w,h+2,d);solid(x,z,w,d,h);
    box('stone',x,z,h-.35,w+.3,.7,d+.3);
    if(type===0){
      for(const dz of [-.39,.39])box('concrete',x-w/2-.7,z+dz*d,h*.46,1.7,h*.91,1.4,0,0,-.065);
      for(const y of [h*.34,h*.67])box('concrete',x-w/2-.06,z,y,.14,.22,d);
      for(const dz of [-.32,0,.32])for(const y of [3.8,9.4])
        box('steel',x-w/2-.06,z+dz*d,y,.14,.48,.74);
    }else if(type===1){
      box('steel',x+w*.15,z,h+.56,w*.39,1.12,d*.32);
      paint(x-w/2-.08,z,h*.25,.18,h*.49,d*.34,0x627374);
      for(let n=0;n<4;n++)box('steel',x-w/2-.16,z,h*.70+n*.46,.34,.25,d*.48);
    }else{
      box('steel',x,z,h+.52,w+.65,.55,d+1.2,.06);
      for(const dz of [-.22,.22])paint(x-w/2-.12,z+dz*d,4.6,.26,9.2,d*.34,0x586567);
      for(const side of [-1,1]){
        box('stone',x-w/2-.17,z+side*d*.43,h*.5,.4,h,.84);
        paint(x-w/2-.41,z+side*d*.43,3.5,.13,1.2,.85,0xd3a959);
      }
    }
  }
  // 雙洞口保留實際可通過的淨空；隧道內的頂燈沿拱圈延伸。
  for(const z of [10,66]){
    for(let i=0;i<9;i++){
      const a=(i+.5)*Math.PI/9,zz=z+19*Math.cos(a),h=6+19*Math.sin(a);
      box('stone',653,zz,h,53,3.1,7.6,-a+Math.PI/2);
    }
    for(const s of [-1,1]){box('concrete',653,z+s*20,4,54,8,3.8);solid(653,z+s*20,54,3.8,8);}
    for(const x of [632,644,657,670])box('white',x,z,24,.8,.28,2.6);
  }
  for(const [z,d] of [[-13,7],[39,12],[90,9]]){
    box('stone',651,z,12,55,24,d);solid(651,z,55,d,25);
  }
  const ambulance=new THREE.Group();root.add(ambulance);
  const cars=new PropBatch(materials);
  for(const dx of [0,-15,-30]){
    cars.box('white',dx,2,0,9,3.5,3.8);
    cars.box('glass',dx+2.8,3.3,0,2.6,1.6,3.9,0,0,-.12);
    cars.box('paint',dx,1.9,0,9.1,.39,3.86,0,0,0,0xad4a40);
    cars.box('paint',dx+.7,4.1,0,2,.43,3,0,0,0,0xb94d46);
    for(const s of [-1,1])for(const a of [-2.9,2.8])cars.add('steel',tire,dx+a,.8,s*1.88,.8,.8,.43);
  }
  cars.finish(ambulance);b.finish(root);cyl.dispose();tire.dispose();
  const atlas=signAtlas(root,signs);
  const flags=new THREE.InstancedMesh(new THREE.BoxGeometry(1.3,2.5,3.7),new THREE.MeshBasicMaterial({color:0xffffff}),12);
  flags.userData.fieldGeometry=true;root.add(flags);
  const matrix=new THREE.Matrix4(),color=new THREE.Color();
  for(const [i,line] of HILL_LINES.entries())for(const [j,[x,z]] of line.posts.entries()){
    const zz=z+(j?-17:17);
    flags.setMatrixAt(i*2+j,matrix.makeTranslation(x-13.65,height(x-13,zz)+12,zz));
    flags.setColorAt(i*2+j,color.setHex(0x586462));
  }
  const escapeRoad=[[-577,10],...HILL_LINES.map(line=>line.posts[0]),[627,10],[688,10]];
  let section=0,travel=0,destination=0;
  function park() {
    const [x,z]=escapeRoad[section],[gx,gz]=escapeRoad[Math.min(escapeRoad.length-1,section+1)];
    const length=Math.max(1,Math.hypot(gx-x,gz-z));
    const t=Math.min(1,travel/length),px=x+(gx-x)*t,pz=z+(gz-z)*t;
    ambulance.position.set(px,height(px,pz),pz);
    if(section<escapeRoad.length-1)ambulance.rotation.y=-Math.atan2(gz-z,gx-x);
    ambulance.visible=section<escapeRoad.length-1;
  }
  return {
    signal(i,j,owned){flags.setColorAt(i*2+j,color.setHex(owned?0x3bd5c4:0xfb6947));flags.instanceColor.needsUpdate=true;},
    reset(sec){section=destination=sec;travel=0;park();},
    advance(sec){destination=sec;},
    update(dt){
      if(section>=destination)return;
      const [x,z]=escapeRoad[section],[gx,gz]=escapeRoad[section+1];
      travel+=dt*30;
      if(travel>=Math.hypot(gx-x,gz-z)){section++;travel=0;}
      park();
    },
    get convoyPosition(){return ambulance.position;},
    get evacuated(){return section===escapeRoad.length-1;},
    dispose(){flags.material.dispose();atlas?.dispose();Object.values(materials).forEach(m=>m.dispose());},
  };
}
