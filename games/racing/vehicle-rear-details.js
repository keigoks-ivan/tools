import * as THREE from './vendor/three.module.js';

// Photo-guided positions, in metres above the road. The plates are original
// closed-course artwork; manufacturer photographs are not game textures.
export const REAR_DETAIL_PROFILES = {
  porsche911gt3rs: { plate: [.515,.46,.112], badge: [.646,.40,.026,'PORSCHE'] },
  porsche911turboS: { plate: [.515,.46,.112], badge: [.651,.40,.026,'PORSCHE'] },
  lamborghiniRevuelto: { plate: [.405,.46,.112] },
  ferrari296Speciale: { plate: [.405,.43,.104] },
  mclaren750s: { plate: [.405,.46,.112] },
  astonVantage: { plate: [.478,.46,.112], badge: [.650,.40,.022,'ASTON MARTIN'] },
  corvetteZ06: { plate: [.445,.305,.152], badge: [.684,.37,.021,'CORVETTE'] },
  bmwM4: { plate: [.563,.46,.112], badge: [.806,.072,.072,'bmw'] },
  nissanZ: { plate: [.449,.305,.152], badge: [.720,.073,.073,'nissan'] },
  amgGT63: { plate: [.521,.46,.112], badge: [.738,.077,.077,'mercedes'] },
  mustangDarkHorse: { plate: [.522,.305,.152] },
  lotusEmira: { plate: [.436,.46,.112], badge: [.688,.38,.024,'LOTUS'] },
  ferrari12cilindri: { plate: [.466,.46,.112] },
  lamborghiniTemerario: { plate: [.432,.46,.112] },
  amgSL63: { plate: [.512,.46,.112], badge: [.746,.077,.077,'mercedes'] },
  hondaPrelude: { plate: [.563,.305,.152], badge: [.716,.34,.024,'HONDA'] },
  toyotaGR86: { plate: [.499,.305,.152], badge: [.699,.068,.048,'toyota'] },
  mazdaMX5: { plate: [.489,.305,.152], badge: [.670,.070,.048,'mazda'] },
  bmwM2: { plate: [.559,.46,.112], badge: [.791,.072,.072,'bmw'] },
};

function drawBadge(ctx, word) {
  const cx=384,cy=72,r=45;
  ctx.strokeStyle='#c1c7ca'; ctx.fillStyle='#c1c7ca'; ctx.lineWidth=5;
  if(word==='bmw'){
    ctx.fillStyle='#111820';ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
    for(let i=0;i<4;i++){
      ctx.fillStyle=i%2?'#ededdf':'#2677b0';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,30,i*Math.PI/2,(i+1)*Math.PI/2);ctx.closePath();ctx.fill();
    }
    ctx.fillStyle='#e4e6e1';ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillText('BMW',cx,cy-33);
  }else if(word==='nissan'){
    ctx.beginPath();ctx.arc(cx,cy,r*.77,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#172025';ctx.fillRect(cx-48,cy-10,96,20);
    ctx.fillStyle='#bfc7ca';ctx.font='bold 18px sans-serif';ctx.textAlign='center';ctx.fillText('NISSAN',cx,cy+6);
  }else if(word==='mercedes'){
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
    for(let i=0;i<3;i++){
      const a=-Math.PI/2+i*Math.PI*2/3,b=a+Math.PI/2;
      ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r);ctx.lineTo(cx+Math.cos(b)*5,cy+Math.sin(b)*5);ctx.lineTo(cx-Math.cos(b)*5,cy-Math.sin(b)*5);ctx.closePath();ctx.fill();
    }
  }else if(word==='toyota'){
    ctx.beginPath();ctx.ellipse(cx,cy,49,34,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy,20,34,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.ellipse(cx,cy-13,40,17,0,0,Math.PI*2);ctx.stroke();
  }else if(word==='mazda'){
    ctx.beginPath();ctx.ellipse(cx,cy,49,32,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(cx-40,cy-15);ctx.quadraticCurveTo(cx-20,cy-16,cx,cy+17);ctx.quadraticCurveTo(cx+20,cy-16,cx+40,cy-15);ctx.stroke();
  }else{
    ctx.font=`600 ${word.length>9?17:24}px sans-serif`;ctx.textAlign='center';
    for(let i=0;i<word.length;i++)ctx.fillText(word[i],cx-94+i/(word.length-1)*188,cy);
  }
}

function createAtlas(mobile, badge) {
  const canvas=document.createElement('canvas');canvas.width=mobile?256:512;canvas.height=mobile?128:256;
  const ctx=canvas.getContext('2d');ctx.scale(canvas.width/512,canvas.height/256);
  ctx.clearRect(0,0,512,256);ctx.fillStyle='#e4e3d8';ctx.fillRect(4,52,248,112);
  ctx.fillStyle='#12354a';ctx.fillRect(8,56,18,104);ctx.fillStyle='#c4d2d6';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText('AP',17,144);
  ctx.fillStyle='#172127';ctx.font='bold 57px sans-serif';ctx.fillText('APEX',138,128);
  ctx.fillStyle='#6c7474';ctx.font='9px sans-serif';ctx.fillText('CLOSED COURSE',139,150);
  if(badge)drawBadge(ctx,badge);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;
  texture.anisotropy=mobile?1:2;return texture;
}

export function addVehicleRearDetails({vehicle,mobile=false,baseY,chassis,mesh,material,black,fasciaPoint,registerTexture}) {
  const profile=REAR_DETAIL_PROFILES[vehicle];
  if(!profile)return {meshes:0,triangles:0,texturePixels:0,fitQueries:0};
  const texture=createAtlas(mobile,profile.badge?.[3]);registerTexture(texture);
  const ink=material('rear-plate-and-badge-artwork',THREE.MeshStandardMaterial,{map:texture,color:'#ffffff',roughness:.39,metalness:.18,transparent:true,alphaTest:.06,side:THREE.DoubleSide});
  const [y,w,h]=profile.plate,grid=[],nx=7,ny=5;
  const maxX=Math.max(w/2+.035,(profile.badge?.[1]||0)/2),minY=y-h/2-.025,maxY=Math.max(y+h/2+.025,(profile.badge?.[0]||0)+(profile.badge?.[2]||0)/2);
  for(let iy=0;iy<ny;iy++)for(let ix=0;ix<nx;ix++){
    const p=fasciaPoint(-maxX+ix/(nx-1)*maxX*2,minY+iy/(ny-1)*(maxY-minY),0);grid.push(Array.isArray(p)?p[2]:p.z);
  }
  const depth=(x,py)=>{
    const gx=THREE.MathUtils.clamp((x+maxX)/(2*maxX)*(nx-1),0,nx-1),gy=THREE.MathUtils.clamp((py-minY)/(maxY-minY)*(ny-1),0,ny-1),ix=Math.min(nx-2,Math.floor(gx)),iy=Math.min(ny-2,Math.floor(gy));
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(grid[iy*nx+ix],grid[iy*nx+ix+1],gx-ix),THREE.MathUtils.lerp(grid[(iy+1)*nx+ix],grid[(iy+1)*nx+ix+1],gx-ix),gy-iy);
  };
  let triangles=0,meshes=0;
  function patch(cy,width,height,mat,offset,uv,name){
    const vertices=[],coords=[],faces=[],cols=mobile?6:10,rows=mobile?3:4;
    for(let iy=0;iy<=rows;iy++)for(let ix=0;ix<=cols;ix++){
      const u=ix/cols,v=iy/rows,x=(u-.5)*width,py=cy+(v-.5)*height;
      vertices.push(x,py-baseY,depth(x,py)-offset);coords.push(uv[0]+(uv[2]-uv[0])*(1-u),uv[1]+(uv[3]-uv[1])*v);
      if(ix&&iy){const a=iy*(cols+1)+ix,b=a-1,c=a-cols-1,d=c-1;faces.push(a,b,c,b,d,c);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));geometry.setIndex(faces);geometry.computeVertexNormals();
    const item=mesh(geometry,mat,chassis,name);item.castShadow=false;triangles+=faces.length/3;meshes++;
  }
  patch(y,w+.036,h+.024,black,.008,[0,0,1,1],'rear-number-plate-recess');
  patch(y,w,h,ink,.014,[4/512,92/256,252/512,204/256],'rear-number-plate-artwork');
  if(profile.badge){const [by,bw,bh,word]=profile.badge,uv=['bmw','nissan','mercedes','toyota','mazda'].includes(word)?[328/512,128/256,440/512,240/256]:[272/512,160/256,496/512,208/256];patch(by,bw,bh,ink,.018,uv,'rear-manufacturer-badge');}
  return {meshes,triangles,texturePixels:texture.image.width*texture.image.height,fitQueries:nx*ny};
}
