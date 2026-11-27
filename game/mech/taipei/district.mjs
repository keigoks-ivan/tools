import * as THREE from 'three';
import {marketCourt,cityPlaza,parkScooters} from './streets.mjs';
import {buildXinyi} from './xinyi.mjs';
import {channelsAt,buildGuandu} from './rivers.mjs';
import {buildTaipei101,TAIPEI_101} from './landmark.mjs';
import {carGeometry} from '../env.js';
import {instancedCarMaterial} from '../car-material.js';

const WHITE = [1,1,1], uv = [[0,0],[1,0],[1,1],[0,1]];
const names = ['茶行','永安布莊','南北貨','蔘藥行','河濱步道','碼頭','信義商圈','連通空橋','淡水河','基隆河','關渡碼頭','河濱自行車道','迪化街','大稻埕','信義路','台北101'];
function signs(labels=names,commercial=false) {
  const c=document.createElement('canvas'); c.width=1024; c.height=512;
  const ctx=c.getContext('2d');
  labels.forEach((name,i)=>{
    const x=(i%4)*256, y=(i>>2)*128;
    ctx.fillStyle=['#593a2c','#294546','#733c30','#303c34','#315658','#334b61','#384952','#485256'][i%8];
    ctx.fillRect(x,y,256,128);ctx.strokeStyle='#c3ab78';ctx.lineWidth=2;ctx.strokeRect(x+7,y+7,242,114);
    if(commercial&&i>=7&&i<=9){
      const hue=['#173b47','#6b3b3c','#496454'][i-7];
      const tone=ctx.createLinearGradient(x,y,x+256,y+128);
      tone.addColorStop(0,hue);tone.addColorStop(1,'#d5b692');
      ctx.fillStyle=tone;ctx.fillRect(x,y,256,128);
      ctx.save();ctx.beginPath();ctx.rect(x,y,256,128);ctx.clip();
      ctx.strokeStyle='#edcf9b';ctx.lineWidth=3;
      for(let k=0;k<6;k++){ctx.beginPath();ctx.ellipse(x+174,y+53,26+k*3,41+k*4,-.46,0,Math.PI*2);ctx.stroke();}
      ctx.restore();ctx.fillStyle='#fbede1';ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.font='600 35px "PingFang TC",serif';ctx.fillText(name,x+15,y+67,112);
      return;
    }
    ctx.fillStyle='#f1e8ce';ctx.font='600 47px "PingFang TC","Noto Serif TC",serif';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(name,x+128,y+66,222);
  });
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
function tile(index,cols=3) {
  const rows=cols===4?4:2,x=index%cols/cols,y=1-(Math.floor(index/cols)+1)/rows,g=.003;
  return [[x+g,y+g],[x+1/cols-g,y+g],[x+1/cols-g,y+1/rows-g],[x+g,y+1/rows-g]];
}
function paint(hex) {return new THREE.Color(hex).toArray();}
function lit(options) {return new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,...options});}
function smokeDamage(mat) {
  mat.onBeforeCompile=s=>{
    s.vertexShader='attribute float burn;varying float facadeBurn;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfacadeBurn=burn;');
    s.fragmentShader='varying float facadeBurn;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= 1.0 - 0.78 * facadeBurn;');
  };return mat;
}
export async function prepareDistrict(A,heightSource) {
  const loader=new THREE.TextureLoader();
  const [map,bank,basinColor]=await Promise.all(['facades.webp','bank.webp','basin-color.webp'].map(name=>loader.loadAsync(new URL(name,import.meta.url).href)));
  basinColor.colorSpace=THREE.SRGBColorSpace;basinColor.anisotropy=4;
  bank.colorSpace=THREE.SRGBColorSpace;bank.wrapS=THREE.MirroredRepeatWrapping;bank.repeat.x=6;bank.anisotropy=4;
  const backdrop=new THREE.MeshBasicMaterial({map:bank,side:THREE.BackSide,alphaTest:.18,color:0xdddcd2});
  map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;
  const sharedMaterials={
    face:smokeDamage(lit({map,metalness:.07})), trim:lit({roughnessMap:A.wearM}),
    signs:lit({map:signs()}), glass:lit({map,metalness:.44,roughness:.27}),
    road:lit({map:A.asphD,normalMap:A.asphN,normalScale:new THREE.Vector2(.55,.55),roughnessMap:A.asphA,roughness:.69}),
    stone:lit({map:A.rockD,normalMap:A.rockN,normalScale:new THREE.Vector2(.22,.22)}),
    water:lit({color:0x466d68,metalness:.22,roughness:.39,normalMap:A.asphN,normalScale:new THREE.Vector2(.11,.05)}),

  };
  sharedMaterials.water.onBeforeCompile=s=>{
    s.uniforms.riverClock={value:0};sharedMaterials.water.userData.clock=s.uniforms.riverClock;
    s.fragmentShader='uniform float riverClock;\n'+s.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal.x += .017*sin(vNormalMapUv.y*5.0+riverClock+sin(vNormalMapUv.x*.81))+.011*sin(vNormalMapUv.x*14.0+riverClock*.65);normal=normalize(normal);');
  };
  let xinyiMaterials;
  function commercialMaterials(){
    if(xinyiMaterials)return xinyiMaterials;
    const face=smokeDamage(lit({map,metalness:.1})),glass=lit({map,metalness:.32,roughness:.25});
    const labels=['香堤大道','世貿一館','台北101／世貿','松高路','松壽路','市府路','信義商圈','秋日展','光之間','設計季',...names.slice(10)];
    xinyiMaterials={...sharedMaterials,face,glass,signs:lit({map:signs(labels,true)})};
    loader.load(new URL('./xinyi-facades.webp',import.meta.url).href,texture=>{
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
      face.map=glass.map=texture;
    });
    return xinyiMaterials;
  }
  const carFinish=instancedCarMaterial(A.wearM);
  return (w,group,{bucket,box,put})=>{
    const district=w.fieldRoute.district, river=district==='river', city=district==='skyline';
    const materials=city?commercialMaterials():sharedMaterials;
    w.terrainMesh.material.userData.setBasinView(district,basinColor);
    w.bearingOffset=city?180:0;
    w.scenicPoints=heightSource.peaks(district);
    const landmark=(name,x,y,z)=>w.scenicPoints.push({name,p:new THREE.Vector3(x,y,z)});
    if(river){landmark('關渡大橋',481,54,275);landmark('基隆河匯流口',-498,4,178);}
    if(city)landmark('台北 101',TAIPEI_101.x,TAIPEI_101.height,TAIPEI_101.z);
    const B=Object.fromEntries(Object.keys(materials).map(k=>[k,bucket()]));
    const records=[],count=b=>b.p.length/3;
    const horizon=new THREE.Mesh(new THREE.CylinderGeometry(1610,1610,130,80,1,true),backdrop);
    horizon.position.y=61;horizon.rotation.y=river?.38:city?2.16:.73;horizon.userData.fieldGeometry=true;
    group.add(horizon);
    let seed=river?175:city?839:47;
    const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
    const stone=paint(0xa79a86), light=paint(0xcbbca2), metal=paint(0x525951),dark=paint(0x323c3d), stripe=paint(0xdbba69);
    const block=(b,x,y,z,sx,sy,sz,c)=>box(b,x-sx/2,x+sx/2,y,y+sy,z-sz/2,z+sz/2,c);
    const piece=(...args)=>block(B.trim,...args);
    function quad(b,points,coords,color=WHITE){
      const a=new THREE.Vector3(...points[0]),n=new THREE.Vector3(...points[1]).sub(a).cross(new THREE.Vector3(...points[2]).sub(a)).normalize().toArray();
      b.quad(...points,n,coords,color);
    }
    function front(b,x,z,width,low,high,side,index,cols=3,tint=WHITE){
      quad(b,[[x,low,z+side*width/2],[x,low,z-side*width/2],[x,high,z-side*width/2],[x,high,z+side*width/2]],tile(index,cols),tint);
    }
    function skin(b,x,z,width,depth,lo,hi,index,nx=1,nz=1,tint=WHITE){
      const p=[[x-width/2,z+depth/2],[x+width/2,z+depth/2],[x+width/2,z-depth/2],[x-width/2,z-depth/2]];
      for(let i=0;i<4;i++){
        const a=p[i],end=p[(i+1)%4],n=i%2?nz:nx;
        for(let j=0;j<n;j++){
          const left=a.map((v,k)=>v+(end[k]-v)*j/n),right=a.map((v,k)=>v+(end[k]-v)*(j+1)/n);
          quad(b,[[left[0],lo,left[1]],[right[0],lo,right[1]],[right[0],hi,right[1]],[left[0],hi,left[1]]],tile(index),tint);
        }
      }
    }
    // Horizontal rings are wound from +z toward +x. Each course can taper or step out independently.
    function course(b,x,z,y,r,h,rt,color,n=12,stretch=1,theta=0){
      const ring=(rr,yy,i)=>[x+rr*Math.sin(i*2*Math.PI/n+theta),yy,z+rr*Math.cos(i*2*Math.PI/n+theta)*stretch];
      for(let i=0;i<n;i++){
        const a=ring(r,y,i),d=ring(rt,y+h,i),c=ring(rt,y+h,i+1);
        quad(b,[a,ring(r,y,i+1),c,d],uv,color);
        quad(b,[[x,y+h,z],d,c,[x,y+h,z]],uv,color);
      }
    }
    function pave(x,z,width,depth,y=.045){
      box(B.road,x-width/2,x+width/2,y-.05,y,z-depth/2,z+depth/2,[.87,.89,.9],9);
    }
    function street(x,z,len,alongX=false){
      const gauge=city||river?34:22;
      pave(x,z,alongX?len:gauge,alongX?gauge:len);
      for(let d=-len/2+4;d<len/2;d+=12){
        if(city ? (alongX?[-120,0,130,250]:[-65,110,278]).some(v=>Math.abs((alongX?x:z)+d-v)<22) : !alongX && (Math.abs(z+d+56)<16||Math.abs(z+d-100)<16)) continue;
        const line=(off,sz,c)=>piece(x+(alongX?d:off),.055,z+(alongX?off:d),alongX?sz:.13,.016,alongX?.13:sz,c);
        line(-.17,9,stripe);line(.17,9,stripe);if(city||river){line(-8,3,light);line(8,3,light);}
      }
    }
    function lamp(x,z,side){
      course(B.trim,x,z,.15,.19,6.6,.1,metal,8);
      piece(x+side*.82,6.64,z,1.85,.12,.13,metal);
      piece(x+side*1.68,6.59,z,.63,.17,.35,light);
    }
    const trees=[],scooters=[],cars=[[],[]];
    const tree=(x,z)=>trees.push([x,z,.73+rand()*.28,rand()*6.28]);
    function park(x,z,angle){
      const i=rand()<.61?0:1,c=[0xbac1bd,0x475b60,0x4e545e,0xdbb54e,0x8f4945][Math.floor(rand()*5)];
      cars[i].push([x,z,angle,c]);
    }
    function streetSignal(x,z,side){
      course(B.trim,x,z,.15,.18,6.8,.11,metal,9);
      piece(x+side*3.2,6.84,z,6.5,.13,.15,metal);
      piece(x+side*5.8,6.46,z,1.28,.51,.41,dark);
      for(let i=0;i<3;i++)piece(x+side*5.8+(i-1)*.38,6.56,z-.22,.23,.23,.12,i===2?paint(0x90b18c):metal);
    }
    function instanceStreetFurniture(){
      const d=new THREE.Object3D();
      if(trees.length){
        w.prepareFoliage();
        const mesh=new THREE.InstancedMesh(w.fieldTrees[3],w.fieldTreeMaterial,trees.length);
        trees.forEach(([x,z,scale,angle],i)=>{d.position.set(x,.11,z);d.rotation.y=angle;d.scale.setScalar(scale);d.updateMatrix();mesh.setMatrixAt(i,d.matrix);});
        mesh.customDepthMaterial=w.fieldTreeDepth;mesh.castShadow=mesh.receiveShadow=true;mesh.userData.fieldTree=true;group.add(mesh);
      }
      cars.forEach((list,i)=>{
        if(!list.length)return;
        const m=new THREE.InstancedMesh(carGeometry(i),carFinish,list.length);
        list.forEach(([x,z,angle,c],j)=>{d.position.set(x,.12,z);d.scale.setScalar(1);d.rotation.y=angle;d.updateMatrix();m.setMatrixAt(j,d.matrix);m.setColorAt(j,new THREE.Color(c));});
        m.receiveShadow=m.castShadow=true;group.add(m);
      });
    }
    function building(x,z,width,depth,height,body){
      const b={x0:x-width/2,x1:x+width/2,z0:z-depth/2,z1:z+depth/2,H:height,town:true,lamp:-1,fB:B.face,rB:B.trim,sB:B.signs,f0:count(B.face),r0:count(B.trim),s0:count(B.signs)};
      body();
      b.f1=count(B.face);b.r1=count(B.trim);b.s1=count(B.signs);
      b.box={x0:b.x0,x1:b.x1,z0:b.z0,z1:b.z1,top:height};w.addCollider(b.box);records.push(b);
    }
    function shophouse(road,side,z,width,style){
      const depth=13+rand()*5,face=road+side*15.6,x=face+side*depth/2,stories=rand()<.48?2:3,h=4.1+(stories-1)*4.35,kind=style%3;
      const tea=road===120&&side===-1&&Math.abs(z+83)<8;
      building(x,z,depth,width,h,()=>{
        piece(x,.02,z,depth,.24,width,stone);
        skin(B.face,x+side*1.45,z,depth-2.9,width,.24,4.15,3,1,1);
        for(const end of [-1,1]){
          piece(face+side*.25,.22,z+end*(width/2-.34),.66,3.95,.60,stone);
          piece(face+side*.25,3.57,z+end*(width/2-.34),.94,.49,.92,light);
        }
        for(let floor=1;floor<stories;floor++)skin(B.face,x,z,depth,width,4.1+(floor-1)*4.35,4.1+floor*4.35,kind,2,1,[.91,.89+rand()*.11,.85+rand()*.14]);
        for(const y of [3.94,h-.17])piece(x,y,z,depth+.42,.34,width+.16,light);
        piece(x,h+.05,z,depth,.29,width,stone);
        piece(face,h+.27,z,.44,.82,width,stone);
        if(kind!==2){
          for(let j=0;j<3;j++)piece(face,h+.72+j*.31,z,.50,.39,width*(.81-j*.19),light);
          course(B.trim,x+side*3,z+width*.23,h+.36,1.05,1.85,1.05,metal,14);
          course(B.trim,x+side*3,z+width*.23,h+2.21,1.05,.24,.19,stone,14);
        } else {
          piece(face-side*.57,7.8,z,1.35,.19,width-.38,stone);
          for(const dz of [-.36,0,.36])piece(face-side*1.16,8,z+dz*width,.07,.86,.08,metal);
          piece(face-side*1.16,8.8,z,.09,.09,width*.87,metal);
        }
        if(style%4!==1||tea){
          const canopy=tea?paint(0x477d91):paint([0x42645f,0x7a5244,0x556d79,0x817158][style%4]);
          piece(face-side*.95,3.41,z,1.95,.18,width*.94,canopy);
          piece(face-side*1.88,3.15,z,.13,.27,width*.94,canopy);
        }
        front(B.signs,face-side*.33,z,width*.58,4.10,5.01,-side,tea?0:style%4,4);
      });
    }
    function office(x,z,width,depth,h,modern=false,solid=false){
      if(city&&Math.abs(x-TAIPEI_101.x)<125&&Math.abs(z-TAIPEI_101.z)<70)return;
      const b=modern&&!solid?B.glass:B.face;
      const body=()=>{
        const bands=Math.max(1,Math.round(h/(modern?9:8))),variant=Math.floor(rand()*4);
        const index=modern?[3,4,5,1][variant]:2;
        let lastW=width,lastD=depth;
        const tint=modern?[[.72,.84,.83],[.80,.84,.88],[.69,.77,.83],[.81,.78,.74]][variant]:[.85,.85,.82];
        for(let j=0;j<bands;j++){
          const y=j*h/bands,f=j/bands,step=modern&&f>.66&&variant!==0?.83:modern&&f>.32&&variant===2?.93:1;
          const ww=width*step,dd=depth*(modern&&f>.52&&variant===1?.85:1);
          skin(b,x,z,ww,dd,y,y+h/bands,index,Math.max(1,Math.round(ww/(modern?11:9))),Math.max(1,Math.round(dd/11)),tint);
          if(j%2===0||ww!==lastW||dd!==lastD)piece(x,y,z,lastW+.26,.32,lastD+.26,modern?metal:stone);
          if(modern&&variant===3)for(const side of [-1,1])for(let k=-1;k<=1;k++)
            piece(x+side*ww*.502,y,z+k*dd*.3,.33,h/bands,.21,light);
          lastW=ww;lastD=dd;
        }
        piece(x,h,z,lastW,.45,lastD,metal);
        piece(x+lastW*.1,h+.4,z,lastW*.29,2.7,lastD*.32,stone);
        if(modern&&solid){
          const streetSide=x<0||x>65&&x<130?1:-1,door=x+streetSide*width*.5;
          front(B.face,door+streetSide*.04,z,depth*.76,.15,4.7,streetSide,3);
          piece(door+streetSide*1.1,4.75,z,2.7,.28,depth*.8,metal);
          for(const off of [-.33,.33])course(B.trim,door+streetSide*2.2,z+depth*off,.2,.23,4.55,.23,light,8);
        }
      };
      if(solid)building(x,z,width,depth,h,body);
      else {
        body();w.addCollider({x0:x-width/2,x1:x+width/2,z0:z-depth/2,z1:z+depth/2,top:h+.4});
      }
    }
    function skywalk(x,z,width,y=25){
      const depth=4.6;
      // Clear the mech below the enclosed walkway.
      w.addCollider({x0:x-width/2,x1:x+width/2,z0:z-depth/2,z1:z+depth/2,bottom:y,top:y+5.05});
      piece(x,y,z,width,1,depth,dark);skin(B.glass,x,z,width,depth,y+1,y+4.6,3,Math.ceil(width/8),1);
      piece(x,y+4.6,z,width,.45,depth+.4,metal);
      for(const side of [-1,1]){
        piece(x,y+.5,z+side*depth/2,width,.85,.25,paint(0xa44239));
        piece(x,y+4.18,z+side*depth/2,width,.50,.25,paint(0xb85642));
      }
      for(const side of [-1,1]){
        const xx=x+side*(width/2+1.5);
        skin(B.glass,xx,z,4,6,0,y+5,5,1,1);piece(xx,y+5,z,4.45,.33,6.45,metal);
        for(const k of [-1,1])piece(xx+k*1.98,0,z, .28,y+5,.35,stone);
        w.addCollider({x0:xx-2,x1:xx+2,z0:z-3,z1:z+3,top:y+5.33});
      }
      for(let k=-width/2+1;k<width/2;k+=4)for(const s of [-1,1])piece(x+k,y+1,z+s*depth/2,.14,3.7,.16,light);
    }
    function shelter(x,z,kind){
      const width=kind===0?9:12,depth=kind===0?4.6:6.2,h=kind===0?4.1:6.3;
      building(x,z,width,depth,h,()=>{
        skin(B.face,x,z,width,depth,.10,h,kind===0?3:4,2,1);
        piece(x,.05,z,width+.55,.23,depth+.50,stone);
        piece(x,h,z,width+.90,.27,depth+1.20,kind===0?metal:dark);
        for(const side of [-1,1])piece(x+side*(width/2-.24),.14,z-depth*.51,.25,h,.32,metal);
      });
    }
    const wharf=river?paint(0x928575):stone;
    if(!river){
      const offset=city?130:120, cross=city?[-65,110,278]:[-275,-55,90,278];
      pave(55,0,670,960,.012);
      for(const x of [-120,0,offset,offset+120])street(x,0,930);
      for(const z of cross){street(45,z,590,true);
        for(const x of [0,offset])for(const side of [-1,1])for(let i=-12;i<=12;i+=2.3)piece(x+i,.08,z+side*19,.97,.015,3.8,light);
      }
      if(city)for(const z of cross)for(const x of [0,offset])for(const side of [-1,1]){
        for(let k=-13;k<=13;k+=2.3)piece(x+side*20,.08,z+k,3.8,.015,.97,light);
        piece(x+side*25,.08,z+side*8,.46,.016,15,light);
        piece(x-side*8,.08,z+side*24,15,.016,.46,light);
      }
      for(const road of [0,offset])for(const side of [-1,1]){
        if(!city){
          let i=0;
          for(let z=-431;z<429;){
            const width=7.7+rand()*4.7,center=z+width/2;z+=width+.13;
            if(road===120&&side===-1&&Math.abs(center+275)<55||cross.some(c=>Math.abs(center-c)<20+width/2)||Math.abs(center-248)<24&&road===0&&side===1)continue;
            shophouse(road,side,center,width,(++i+Math.floor(rand()*5)));
          }
        }
        for(let z=-405;z<397;z+=27){
          if(cross.some(c=>Math.abs(z-c)<24))continue;
          const curb=city?19:13.1;
          piece(road+side*(city?22:curb),.045,z,city?10:3.5,.14,26.9,city?light:stone);lamp(road+side*(curb-.8),z,-side);
          if(!city&&rand()<.52)for(let k=0;k<4;k++)scooters.push([road+side*11.5,z+k*1.13,side*1.2]);
          if(rand()<.38)park(road+side*(city?14.8:9.9),z+5,side*Math.PI/2);
          if(city||Math.floor(z)%3===0)tree(road+side*curb,z+6);
        }
      }
      for(const road of [0,offset])for(const z of cross){streetSignal(road-16,z+16,1);streetSignal(road+16,z-16,-1);}
      for(const [x,z] of (city?[[14,-162],[106,-78],[147,116],[-18,233]]:[[13,-184],[103,-100],[135,77],[-14,190]]))shelter(x,z,0);
      for(const [x,z,name] of (city?[[-18,-85,3],[148,89,4],[-18,253,5]]:[[-12,-275,12],[132,98,13]])){
        piece(x,.1,z,.15,5.7,.15,metal);front(B.signs,x-.1,z,3.1,4.75,5.68,-1,name,4);
        front(B.signs,x+.1,z,3.1,4.75,5.68,1,name,4);
      }
      if(!city)marketCourt({x:87,z:-290,piece,course,trim:B.trim,quad,uv,paint});
      else cityPlaza({x:29,z:211,piece,trim:B.trim,course,paint,tree});
      if(city){
        buildXinyi({B,skin,quad,tile,uv,paint,piece,building,tree,front,world:w});
        skywalk(0,-142,60,19.7);skywalk(offset,-22,62);office(157,250,17,15,36,true,false);buildTaipei101(w,{quad,glass:B.glass,trim:B.trim,piece,paint,glassUV:tile(4),uv});}
      for(const s of [-1,1])for(let i=0;i<30;i++){
        const x=s<0?(city?-157:-84)-(i%3)*53:offset+(city?166:82)+(i%3)*49,z=-420+Math.floor(i/3)*94+rand()*33;
        if(city&&s<0&&z>335&&z<510)continue;
        office(x,z,24+rand()*12,19+rand()*15,city?34+rand()*117:12+rand()*29,city);
      }
      for(let i=-5;i<=5;i++)office(i*64,530+rand()*60,28,30,city?38+rand()*103:13+rand()*34,city);
    }else{
      pave(0,15,1190,178);
      street(0,8,1160,true);
      for(let x=-2304;x<2304;x+=24){
        const left=channelsAt(x),right=channelsAt(x+24);
        for(let i=0;i<2;i++){
          const [a,b]=left[i],[c,d]=right[i],pts=[[x,-1.65,b],[x+24,-1.65,d],[x+24,-1.65,c],[x,-1.65,a]];
          quad(B.water,pts,pts.map(v=>[v[0]/15,v[2]/12]),WHITE);
        }
        if(left[1][0]-left[0][1]>20){
          for(let j=0;j<4;j++){
            const z=left[0][1]+rand()*(left[1][0]-left[0][1]);
            tree(x+rand()*18,z);
          }
        }
      }
      box(B.stone,-900,900,-3,.25,87,104,wharf,8);
      for(let x=-580;x<=580;x+=30){
        piece(x,.26,98,.28,1.1,.28,dark);piece(x+15,1.18,98,30,.07,.08,metal);
        lamp(x,74,1);
        if(x%60===0){tree(x,34);park(x+4,-8,0);}
      }
      for(const [x,z] of [[-209,25],[-104,42],[67,42],[187,78],[374,42]])shelter(x,z,1);
      for(let i=0;i<17;i++){
        const x=-575+i*75,h=5+rand()*5;
        building(x,-49,35,23,h,()=>{skin(B.face,x,-49,35,23,0,h,4,4,2);piece(x,h,-49,36,.68,24,metal);});
        office(x+18,-130,28,27,21+rand()*41);if(x>120&&i%3===0)office(x,590,23,26,12+rand()*19);
      }
      // Low reed beds and a narrow tidal creek break up the green confluence point.
      for(let j=0;j<470;j++){
        const x=-908+rand()*590, ch=channelsAt(x),lo=ch[0][1]+4,hi=ch[1][0]-4;
        if(hi<lo)continue;
        const z=lo+rand()*(hi-lo),h=1+rand()*1.2,c=paint(j%3?0x7b855d:0xa19871);
        for(let k=0;k<3;k++){const d=(k-1)*.4;quad(B.trim,[[x+d-.08,0,z],[x+d+.08,0,z],[x+d*1.8+.05,h,z+.25],[x+d*1.8-.05,h,z+.25]],uv,c);}
      }
      for(let j=0;j<10;j++)tree(-480+j*56,-20-Math.sin(j*.9)*4);
      for(const [x,z,name] of [[-441,65,9],[-170,77,8],[275,78,10],[102,39,11]]){
        piece(x,.15,z,.18,4.8,.18,metal);front(B.signs,x-.12,z,4.8,3.25,4.8,-1,name,4);
        front(B.signs,x+.12,z,4.8,3.25,4.8,1,name,4);
      }
      buildGuandu({world:w,quad,trim:B.trim,piece,course,uv,paint});
      for(const x of [-275,-55,287,354]){
        piece(x,-.45,127,10,.48,37,wharf);piece(x,-.41,154,48,.55,7.4,wharf);
        for(let j=-18;j<=19;j+=9)course(B.trim,x+j,-.2,156,.32,1.2,.39,metal,10);
      }
    }
    w.scene.environmentIntensity=city?.68:river?.64:.60;w.hemi.intensity=city?.82:.72;
    w.scene.fog.density=city?.00029:river?.00021:.00027;
    for(const [k,b] of Object.entries(B))put(b,materials[k],!['road','water'].includes(k));
    instanceStreetFurniture();parkScooters(group,scooters);
    w.pickupVisuals=new Map();
    for(const {pickup} of w.fieldRoute.secs){
      if(!pickup)continue;
      const prop=new THREE.Group();prop.position.set(pickup.x,w.height(pickup.x,pickup.z)+(pickup.alt||0),pickup.z);group.add(prop);
      const add=(geom,color,px,py,pz)=>{
        const mesh=new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color,roughness:.55,metalness:.32}));
        mesh.position.set(px,py,pz);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;prop.add(mesh);return mesh;
      };
      const boxAt=(size,color,p)=>add(new THREE.BoxGeometry(...size),color,...p);
      boxAt(pickup.portable?[3.4,1.9,2.2]:[2.1,2.6,1.7],pickup.portable?0x885e3d:0x456467,[0,pickup.portable?.95:1.3,0]);
      for(const x of [-.77,.77])boxAt([.17,1.95,2.27],0x373f41,[x,1,0]);
      if(pickup.alt && !pickup.mount) {
        for(const x of [-.9,.9])for(const z of [-.62,.62])boxAt([.18,pickup.alt,.18],0x647473,[x,-pickup.alt/2,z]);
        for(let i=2;i<pickup.alt;i+=3.6)boxAt([1.85,.13,1.39],0x596664,[0,-i,0]);
      }
      if(pickup.mount==='roof'){
        for(const dx of [-.8,0,.8])boxAt([.42,.65,.44],0xe6be7a,[dx,3.1,.15]).material.emissive.setHex(0xffb242);
      }
      if(!pickup.portable){
        const dish=add(new THREE.SphereGeometry(1.26,16,6,0,Math.PI*2,0,.98),0xb4c3bd,0,3,0);
        dish.rotation.z=-.74;dish.scale.y=.46;
        boxAt([.12,2.4,.12],0x59645f,[.72,3.4,.1]);
      }
      const lamp=boxAt([1.08,.32,.28],0xffb85a,[0,1.56,1.13]);
      const set=done=>{prop.visible=!(pickup.portable&&done);lamp.material.emissive.set(done?0x17ba81:0xfb982c);};
      let searchArea;
      if(pickup.decoyX!==undefined){
        const other=prop.clone(true);other.position.set(pickup.decoyX,w.height(pickup.decoyX,pickup.decoyZ),pickup.decoyZ);
        other.traverse(o=>{o.userData.fieldGeometry=o.userData.fieldMaterial=false;});
        const signal=other.children[prop.children.indexOf(lamp)];signal.material=lamp.material.clone();signal.material.emissive.set(0xd18546);signal.userData.fieldMaterial=true;
        group.add(other);searchArea=prop.position.clone().lerp(other.position,.5);searchArea.y+=3;
      }
      set(false);w.pickupVisuals.set(pickup.name,{searchArea,marker:prop.position.clone().add(new THREE.Vector3(0,3,0)),complete:()=>set(true),reset:()=>set(false)});
    }
    if(river)installFerries(group,w,materials);
    else w.taipeiRiver=null;
    return records;
  };
}

function installFerries(group,world,materials){
  const boats=[];
  for(let i=0;i<2;i++){
    const boat=new THREE.Group(), shape=new THREE.Shape();
    shape.moveTo(-3,-10);shape.lineTo(3,-10);shape.lineTo(3.45,5);shape.quadraticCurveTo(3.3,9,0,12);shape.quadraticCurveTo(-3.3,9,-3.45,5);shape.closePath();
    const hull=new THREE.ExtrudeGeometry(shape,{depth:1.12,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.25,bevelThickness:.28});
    hull.rotateX(-Math.PI/2);
    function part(g,c,x,y,z){
      const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:c,metalness:.32,roughness:.42}));
      m.position.set(x,y,z);m.userData.fieldGeometry=m.userData.fieldMaterial=true;m.castShadow=m.receiveShadow=true;boat.add(m);
    }
    part(hull,0x364e50,0,0,0);part(new THREE.BoxGeometry(5.8,2.25,13.5),0xd1c8b3,0,2.2,.7);
    for(const side of [-1,1])for(let j=0;j<6;j++)part(new THREE.BoxGeometry(.08,1.23,1.6),0x425c65,side*2.93,2.55,-4.4+2*j);
    part(new THREE.BoxGeometry(6.55,.35,15),i?0x576575:0xa34f36,0,3.54,.5);
    boat.rotation.y=-Math.PI/2;group.add(boat);boats.push(boat);
  }
  let t=0,travel=0;
  function tick(dt,rescued){
    t+=dt;if(rescued)travel=Math.min(150,travel+dt*5.5);
    boats.forEach((boat,i)=>{boat.position.set(i?354:287+travel,-1.48+.12*Math.sin(t*.9+i),i?177:155);boat.rotation.z=.012*Math.sin(t+i);});
    if(materials.water.userData.clock)materials.water.userData.clock.value=t*.32;
  }
  world.taipeiRiver={tick,reset(done){travel=done?40:0;tick(0,false);}};tick(0,false);
}
