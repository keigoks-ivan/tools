// 秋季神戶共用枝葉：程式生成 512 圖集，沒有下載、粒子、風場或額外照明。
import * as THREE from 'three';
import { fieldLeafMaterial } from './fieldart.js';

const palettes = [['#c14b29','#e7a044','#d8ba50','#7c8b47'],['#ae3c29','#d57835','#e1bd58','#748549']];
const siteNoise=(x,z,salt=0)=>{const n=Math.sin(x*12.9898+z*78.233+salt*37.719)*43758.5453;return n-Math.floor(n);};
export function autumnTreeTint(x,z,target=new THREE.Color()) {
  const patch=siteNoise(Math.floor(x/64),Math.floor(z/64),4),light=.88+siteNoise(x,z,8)*.20;
  const tone=patch<.28?[.79,1,.77]:patch<.64?[1,1,.80]:[1,.83,.72];
  return target.setRGB(tone[0]*light,tone[1]*light,tone[2]*light);
}
// 近景樹用連續主幹、二次分枝與小葉簇；每樹仍約330三角形，枝葉合在同一個實例網格。
export function autumnTreeGeometry(pine=false,variant=0) {
  const p=[],n=[],uv=[],color=[],leaf=[],index=[];
  const face=(pts,tint,foliage=false,tile=[0,0,1,1],center=null)=>{
    const first=p.length/3,corners=[[0,0],[1,0],[1,1],[0,1]];
    const normal=new THREE.Vector3(...pts[1]).sub(new THREE.Vector3(...pts[0])).cross(new THREE.Vector3(...pts[2]).sub(new THREE.Vector3(...pts[0]))).normalize();
    for(let i=0;i<4;i++) {
      const q=pts[i],shade=foliage?.88+.12*siteNoise(q[0],q[2],variant):.80+.20*siteNoise(q[0]*3,q[1],variant);
      p.push(...q);color.push(...tint.map(v=>v*shade));leaf.push(foliage?1:0);
      const soft=foliage?new THREE.Vector3((q[0]-(center?.[0]||0))*.24,.86,(q[2]-(center?.[2]||0))*.24).normalize():normal;
      n.push(soft.x,soft.y,soft.z);uv.push(tile[0]+corners[i][0]*tile[2],tile[1]+corners[i][1]*tile[3]);
    }
    index.push(first,first+1,first+2,first,first+2,first+3);
  };
  const beam=(a,b,r0,r1,sides=5)=>{
    const direction=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).normalize(),right=new THREE.Vector3().crossVectors(direction,Math.abs(direction.y)>.9?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0)).normalize(),up=new THREE.Vector3().crossVectors(direction,right);
    const at=(pt,r,t)=>pt.map((v,i)=>v+r*(right.getComponent(i)*Math.cos(t)+up.getComponent(i)*Math.sin(t)));
    for(let k=0;k<sides;k++){const a0=k/sides*Math.PI*2,a1=(k+1)/sides*Math.PI*2;face([at(a,r0,a0),at(a,r0,a1),at(b,r1,a1),at(b,r1,a0)],[.15,.115,.078]);}
  };
  const card=(c,w,h,a,tilt,tile,tint=[.96,.98,.88])=>{
    const cs=Math.cos(a),sn=Math.sin(a),U=[cs*w,.09*Math.sin(a*3+variant)*h,sn*w],V=[-sn*tilt*h,h,cs*tilt*h];
    const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v],i)=>c.map((q,k)=>q+U[k]*u+V[k]*v*(i===2?.88:i===3?1.08:1)));
    face(pts,tint,true,tile,c);
  };
  const lean=(variant-1)*.25,tall=(variant===1?.94:variant===2?1.08:1)*(pine?1.4:1);
  const stem=[[0,0,0],[.10,2.1,.02],[lean,4.1,-.07],[lean+.14,6.7,.16]].map(q=>[q[0],q[1]*tall,q[2]]),radii=[.36,.24,.14,.045];
  for(let i=0;i<3;i++)beam(stem[i],stem[i+1],radii[i],radii[i+1]);
  for(let k=0;k<3;k++){const a=k/3*Math.PI*2+variant;beam([0,.22,0],[Math.cos(a)*.58,.025,Math.sin(a)*.58],.16,.065,4);}
  if(pine) {
    // 松枝按枝序錯開與下垂，局部葉簇沒有整層錐殼。
    for(let i=0;i<8;i++) {
      const a=i*2.399+variant,level=2.2+i*.68,reach=(3.05-i*.29)*(1+.09*Math.sin(i*4.1));
      const start=[lean*level/7,level*tall,0],end=[Math.cos(a)*reach,(level-.32)*tall,Math.sin(a)*reach];
      beam(start,end,.10-.004*i,.025,4);
      for(let j=0;j<3;j++) {
        const t=.35+j*.28,c=start.map((v,k)=>v+(end[k]-v)*t);c[1]+=.15;
        card(c,.70-j*.07,.40,a+.35*Math.sin(i+j),.42,[.003,.753,.494,.244],[.76,.94,.73]);
      }
    }
  } else {
    const reach=variant===1?2.5:variant===2?1.95:2.2;
    for(let i=0;i<7;i++) {
      const a=i*2.399+variant+.14*Math.sin(i*3),y=(3.25+(i%3)*.52)*tall,dist=reach*(.69+.22*siteNoise(i,variant,3));
      const start=[lean*y/7,y,.04],end=[Math.cos(a)*dist+lean,(4.15+i*.36)*tall,Math.sin(a)*dist+.15];
      beam(start,end,.14-i*.008,.055);
      for(const side of [-1,1]) {
        const angle=a+side*(.48+.08*Math.sin(i)),tip=[end[0]+Math.cos(angle)*(.73+siteNoise(i,side,8)*.24),end[1]+(.50+.3*siteNoise(i,side,9))*tall,end[2]+Math.sin(angle)*.78];
        beam(end,tip,.053,.018,4);
        const width=1.11+.18*siteNoise(i,side,10),height=.86+.17*siteNoise(i,side,11);
        for(let axis=0;axis<3;axis++) {
          // 枝梢、枝中、冠內分開層疊，避免三片全堆在末端形成小刺球。
          const c=axis===0?[tip[0],tip[1]+.12,tip[2]]:axis===1?
            end.map((v,k)=>v*.76+tip[k]*.24+(k===1?.32:0)):
            start.map((v,k)=>v*.28+end[k]*.72+(k===1?.56:k===0?-Math.sin(a)*side*.33:Math.cos(a)*side*.33));
          const gold=variant===1,shade=axis===2?.79:axis===1?.85:.91;
          card(c,width*(axis===1?1.06:1),height*(axis===2?1.05:1),angle+axis*1.08+.15*Math.sin(i+axis),axis===2?.58:.25,
            [(gold?.5:0)+.003,.003,.494,.494],[shade,shade*.98,shade*.9]);
        }
      }
    }
  }
  const g=new THREE.BufferGeometry();
  for(const [key,data,size] of [['position',p,3],['normal',n,3],['uv',uv,2],['color',color,3],['leaf',leaf,1]])g.setAttribute(key,new THREE.Float32BufferAttribute(data,size));
  const positions=g.attributes.position;for(let i=0;i<positions.count;i++)positions.setY(i,Math.max(0,positions.getY(i)));
  g.setIndex(index);g.computeBoundingSphere();return g;
}
function maple(ctx,x,y,size,angle,color) {
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();
  const outline=[[-.09,.48],[-.48,.27],[-.30,.08],[-.62,-.23],[-.27,-.18],[-.32,-.64],[-.09,-.40],[0,-.87],[.10,-.4],[.32,-.64],[.27,-.18],[.62,-.23],[.30,.08],[.48,.27],[.09,.48]];
  outline.forEach(([a,b],i)=>i?ctx.lineTo(a*size,b*size):ctx.moveTo(a*size,b*size));ctx.closePath();ctx.fill();
  if(size>9){ctx.strokeStyle='rgba(76,42,20,.32)';ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(0,size*.52);ctx.lineTo(0,-size*.7);ctx.stroke();}
  ctx.restore();
}
let shared = null;
let canopy = null;
// 遠山林冠的高度、樹種與明暗共用一張 512 圖；樹冠約五公尺，不增加遠樹模型。
export function forestCanopy() {
  if(canopy)return canopy;
  const S=512,px=new Uint8Array(S*S*4),radii=[],random=(()=>{let seed=527;return()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);})();
  for(let i=0;i<640;i++) {
    const cx=random()*S,cy=random()*S,r=8+random()*12;
    const patch=.5+.22*Math.sin(cx/51+Math.sin(cy/79))+.19*Math.cos(cy/63-cx/108);
    radii.push([cx,cy,r*(.72+random()*.48),r*(.72+random()*.55),45+patch*185,112+random()*130]);
  }
  for(const [cx,cy,rx,ry,species,tone]of radii)for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++) {
    const d=((x-cx)/rx)**2+((y-cy)/ry)**2;if(d>=1)continue;
    const k=(((y+S)%S)*S+(x+S)%S)*4,h=44+Math.sqrt(1-d)*190;
    if(h>px[k]){px[k]=h;px[k+1]=species;px[k+2]=tone;}
  }
  for(let i=0;i<px.length;i+=4){if(!px[i]){px[i]=32;px[i+1]=100;px[i+2]=120;}px[i+3]=255;}
  canopy=new THREE.DataTexture(px,S,S);canopy.name='kobe-forest-canopy';canopy.wrapS=canopy.wrapT=THREE.RepeatWrapping;
  canopy.magFilter=THREE.LinearFilter;canopy.minFilter=THREE.LinearMipmapLinearFilter;canopy.generateMipmaps=true;canopy.anisotropy=4;canopy.needsUpdate=true;return canopy;
}
export function autumnFoliage() {
  if(shared)return shared;
  if(typeof document==='undefined')return {material:fieldLeafMaterial(null),depth:fieldLeafMaterial(null,true)};
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d');
  let seed=173;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
  // 上半圖集保留松針、細草與山茶花小叢；落葉獨立放在右上，不與樹冠共用巨大葉片。
  ctx.strokeStyle='#665039';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(14,100);ctx.lineTo(235,31);ctx.stroke();
  for(let i=0;i<22;i++) {
    const x=30+i*9,y=95-i*2.8,side=i%2?-1:1,tx=x+13,ty=y+side*(16+random()*13);
    ctx.strokeStyle='#6b5238';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(tx,ty);ctx.stroke();
    for(let k=0;k<12;k++) {
      const t=k/12,px=x+(tx-x)*t,py=y+(ty-y)*t;
      ctx.strokeStyle=k%3?'#587044':'#7c8852';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+7+random()*9,py+side*(7+random()*7));ctx.stroke();
    }
  }
  for(let i=0;i<20;i++) {
    const x=11+random()*103,end=134+random()*81;
    ctx.strokeStyle=i%4?'#6c7949':'#ab9f70';ctx.lineWidth=1+random();ctx.beginPath();ctx.moveTo(64,250);ctx.quadraticCurveTo(x,190,x+(x-64)*.17,end);ctx.stroke();
    if(i%5===0){ctx.strokeStyle='#c4b994';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x,end+15);ctx.lineTo(x+(x-64)*.17,end);ctx.stroke();}
  }
  for(let i=0;i<32;i++) {
    const x=147+random()*93,y=147+random()*86;
    ctx.save();ctx.translate(x,y);ctx.rotate(random()*6.28);ctx.fillStyle=i%3?'#506343':'#79824b';ctx.beginPath();ctx.ellipse(0,0,7+random()*3,3+random()*2,0,0,6.28);ctx.fill();ctx.restore();
  }
  for(const [x,y]of [[166,167],[209,190],[186,222]]) {
    for(let k=0;k<5;k++){const a=k/5*Math.PI*2;ctx.fillStyle=k%2?'#d2bcb6':'#eee2d5';ctx.beginPath();ctx.ellipse(x+Math.cos(a)*5,y+Math.sin(a)*5,5,3,a,0,6.28);ctx.fill();}
    ctx.fillStyle='#c5a55d';ctx.beginPath();ctx.arc(x,y,2.2,0,6.28);ctx.fill();
  }
  for(let i=0;i<6;i++)maple(ctx,256+52+i%3*73,72+Math.floor(i/3)*105,42+random()*18,random()*6.28,palettes[0][i%4]);
  for(let tile=2;tile<4;tile++) {
    const ox=tile%2*256,oy=Math.floor(tile/2)*256;
    ctx.save();ctx.beginPath();ctx.rect(ox+3,oy+3,250,250);ctx.clip();
    // 冠內細葉交疊，冠緣仍有透光缺口；大色塊由個別楓葉組成。
    for(let branch=0;branch<7;branch++) {
      const a=branch*2.399+tile*.32,reach=72+random()*34,end=[128+Math.cos(a)*reach,133+Math.sin(a)*reach*.86];
      ctx.strokeStyle='#866642';ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(ox+123,oy+165);ctx.quadraticCurveTo(ox+128,oy+125,ox+end[0],oy+end[1]);ctx.stroke();
    }
    for(let i=0;i<300;i++) {
      const a=random()*Math.PI*2,r=Math.sqrt(random()),edge=1+.07*Math.sin(a*5+tile)+.05*Math.cos(a*9);
      const x=128+Math.cos(a)*r*98*edge,y=128+Math.sin(a)*r*101*edge,patch=Math.sin(x/43+y/69)+Math.cos(y/37-x/57);
      const shade=tile===3?(i%41===0?'#788247':patch>.6?'#c5a044':patch<-.5?'#b27d2d':'#c08c36'):
        patch>.65?'#d27532':patch<-.45?'#b74727':'#c45b2d';
      maple(ctx,ox+x,oy+y,12+random()*9,a*.35+random()*1.7,shade);
    }
    ctx.restore();
  }
  const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;map.name='kobe-autumn-leaves';map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  shared={map,material:fieldLeafMaterial(map),depth:fieldLeafMaterial(map,true)};
  shared.material.alphaTest=shared.depth.alphaTest=.38;
  return shared;
}

// 神戶秋季花槽與庭園：芒草細葉、疏花穗、山茶花灌木，使用既有啞光桶的6號表面。
// sites的ground是土面高度；全為靜態小面，不新增材質、碰撞、燈光或逐幀更新。
export function gardenPlanting(out,{sites=[]}={}) {
  let faces=0,plants=0;
  const emit=(pts,col)=>{out.face(...pts,col);out.face(...[...pts].reverse(),col);faces+=2;};
  for(const site of sites) {
    const {x,z,ry=0,ground=0,length=1.8,width=.44,height=.38,kind='mixed'}=site;
    if(length<=0||width<=0||height<=0)continue;
    const P=(u,y,v)=>[x+u*Math.cos(ry)+v*Math.sin(ry),ground+y,z-u*Math.sin(ry)+v*Math.cos(ry)];
    const count=Math.min(10,Math.max(3,Math.ceil(length*width*1.35))),cols=Math.min(count,Math.max(1,Math.ceil(Math.sqrt(count*length/width)))),rows=Math.ceil(count/cols),radius=Math.min(.24,width*.34,length*.12);
    for(let i=0;i<count;i++) {
      const seed=x*.07+z*.11+i*4.73,u=-length/2+radius+(length-radius*2)*((i%cols)+.18+siteNoise(seed,z,1)*.64)/cols;
      const v=-width/2+radius+(width-radius*2)*(Math.floor(i/cols)+.18+siteNoise(x,seed,2)*.64)/rows,H=height*(.54+siteNoise(seed,z,3)*.42),angle=siteNoise(x,seed,4)*Math.PI*2;
      const grass=kind==='grass'||kind!=='shrub'&&i%3!==1,green=[.27,.36,.18,0,6],straw=[.52,.48,.29,0,6];plants++;
      if(grass) {
        for(let blade=0;blade<6;blade++) {
          const a=angle+blade*2.399,reach=radius*(.56+siteNoise(seed,blade,5)*.40),h=H*(.59+siteNoise(blade,seed,6)*.39),r=.012+siteNoise(seed,blade,7)*.008;
          const at=(t,side)=>P(u+Math.cos(a)*reach*t*t-Math.sin(a)*r*side*(1-t*.84),h*t,v+Math.sin(a)*reach*t*t+Math.cos(a)*r*side*(1-t*.84));
          const tint=blade%4===0?straw:green;
          for(let segment=0;segment<2;segment++){const a0=segment/2,a1=(segment+1)/2;emit([at(a0,-1),at(a0,1),at(a1,1),at(a1,-1)],tint);}
        }
        if(i%3===0) {
          const dx=Math.cos(angle)*radius*.55,dz=Math.sin(angle)*radius*.55;
          emit([P(u-.006,0,v),P(u+.006,0,v),P(u+dx+.004,H*1.14,v+dz),P(u+dx-.004,H*1.14,v+dz)],straw);
          for(let k=0;k<4;k++) {
            const a=angle+k*2.4,c=[u+dx,H*(.85+k*.07),v+dz],r=.025+k*.002;
            emit([P(c[0],c[1],c[2]),P(c[0]+Math.cos(a)*r,c[1]+.04,c[2]+Math.sin(a)*r),P(c[0]+Math.cos(a+.9)*r,c[1]+.055,c[2]+Math.sin(a+.9)*r),P(c[0],c[1],c[2])],[.63,.59,.43,0,6]);
          }
        }
      } else {
        for(let stem=0;stem<3;stem++) {
          const a=angle+stem*2.1,dx=Math.cos(a)*radius*.59,dz=Math.sin(a)*radius*.59,top=H*(.66+stem*.14);
          emit([P(u-.009,0,v),P(u+.009,0,v),P(u+dx+.005,top,v+dz),P(u+dx-.005,top,v+dz)],[.20,.25,.14,0,6]);
          for(let k=0;k<3;k++) {
            const t=.4+k*.24,side=k%2?-1:1,c=[u+dx*t,top*t,v+dz*t],w=radius*.23,tip=[c[0]+Math.cos(a+side*.8)*radius*.40,c[1]+.025,c[2]+Math.sin(a+side*.8)*radius*.40];
            emit([P(c[0],c[1],c[2]),P((c[0]+tip[0])/2-Math.sin(a)*w,c[1]+.016,(c[2]+tip[2])/2+Math.cos(a)*w),P(...tip),P((c[0]+tip[0])/2+Math.sin(a)*w,c[1]-.006,(c[2]+tip[2])/2-Math.cos(a)*w)],
              k===2&&i%4===1?[.45,.28,.17,0,6]:stem%2?[.31,.39,.21,0,6]:green);
          }
        }
        if(i%2===1)for(let petal=0;petal<5;petal++) {
          const a=angle+petal/5*Math.PI*2,r=Math.min(.042,radius*.28),y=H*.87;
          emit([P(u,y,v),P(u+Math.cos(a)*r,y+.012,v+Math.sin(a)*r),P(u+Math.cos(a+.7)*r,y+.02,v+Math.sin(a+.7)*r),P(u,y,v)],[.77,.65,.61,0,6]);
        }
      }
    }
  }
  return {plants,triangles:faces*2};
}

// 固定位置、兩個實例批次；不參與 AI、碰撞或每幀更新。
export function buildAutumnTrees(scene, points, height = () => 0) {
  const {material,depth}=autumnFoliage(),meshes=[],dummy=new THREE.Object3D();
  for(let variant=0;variant<2;variant++) {
    const sites=points.filter((p,i)=>i%2===variant);if(!sites.length)continue;
    const mesh=new THREE.InstancedMesh(autumnTreeGeometry(false,variant),material,sites.length);
    mesh.name='kobe-autumn-trees';mesh.castShadow=mesh.receiveShadow=true;mesh.customDepthMaterial=depth;mesh.userData.noAO=true;
    sites.forEach(([x,z,scale=.7],i)=>{
      const spread=.86+siteNoise(x,z,1)*.29,tall=.82+siteNoise(x,z,2)*.34;
      dummy.position.set(x,height(x,z)-.04,z);dummy.rotation.set(0,siteNoise(x,z,3)*Math.PI*2,0);
      dummy.scale.set(scale*spread,scale*tall,scale*(.84+siteNoise(x,z,5)*.28));dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,autumnTreeTint(x,z));
    });
    mesh.computeBoundingSphere();scene.add(mesh);meshes.push(mesh);
  }
  // 零動畫落葉：葉片沿樹穴與路緣堆積，單一小網格；沒有每片葉子的物件。
  const pos=[],uv=[],col=[],normal=[];
  points.forEach(([x,z,scale=.7],i)=>{
    const wind=siteNoise(x,z,11)*Math.PI*2;
    for(let k=0;k<16;k++) {
      const group=Math.floor(k/6),a=wind+group*1.37,r=(.64+group*.47)*scale;
      const along=(siteNoise(x+k,z,12)-.5)*.72*scale,across=(siteNoise(x,z+k,13)-.5)*.38*scale;
      const cx=x+Math.cos(a)*(r+along)-Math.sin(a)*across,cz=z+Math.sin(a)*(r+along)+Math.cos(a)*across;
      const size=(.23+siteNoise(x+k,z-k,14)*.19)*scale,turn=siteNoise(x-k,z+k,15)*Math.PI*2,cs=Math.cos(turn),sn=Math.sin(turn);
      const pts=[[-1,1],[1,1],[1,-1],[-1,-1]].map(([dx,dz])=>{
        const px=cx+(dx*cs-dz*sn)*size,pz=cz+(dx*sn+dz*cs)*size;return [px,height(px,pz)+.022+k*.0001,pz];
      }),u=.5,v=.5;
      for(const n of [0,1,2,0,2,3]) {
        pos.push(...pts[n]);normal.push(0,1,0);uv.push(u+.003+(n===1||n===2?.494:0),v+.003+(n>=2?.494:0));col.push(.78,.74,.60);
      }
    }
  });
  if(pos.length) {
    const g=new THREE.BufferGeometry();
    for(const [name,array,size] of [['position',pos,3],['normal',normal,3],['uv',uv,2],['color',col,3]])g.setAttribute(name,new THREE.Float32BufferAttribute(array,size));
    g.setAttribute('leaf',new THREE.Float32BufferAttribute(new Float32Array(pos.length/3).fill(1),1));
    const leaves=new THREE.Mesh(g,material);leaves.name='kobe-autumn-litter';leaves.receiveShadow=true;leaves.userData.noAO=true;scene.add(leaves);meshes.push(leaves);
  }
  return {meshes,count:points.length};
}
