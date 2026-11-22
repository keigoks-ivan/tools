import { shopUV } from './urban.js';
import { streetfront } from './streetfront.js';

// 住宅街沿商店街與兩翼排列。相鄰兩跨共用外觀，各自保有可破壞的外牆、樓板和碰撞。
const LOTS=[
  // 中心 x、z、寬、深、樓層、立面樣式
  [-291,174,31,21,4,3],[-229,179,34,22,3,2],[-173,167,29,21,4,4],
  [-262,-121,31,20,4,4],[-191,-130,43,23,5,3],[-150,-142,25,16,3,2],
  [-314,33,31,25,4,2],[-276,48,23,19,5,3],[-193,34,26,24,4,4],[-143,34,31,27,6,3],
  [-308,-29,38,24,5,3],[-258,-26,27,20,3,4],[-185,-30,24,21,5,3],[-138,-27,28,22,4,2],
];
const stone=[.65,.59,.50,0,1], ledge=[.78,.76,.70,0,1], steel=[.19,.23,.23,0,2], room=[.12,.11,.10,0,1];
const awnings=[[.27,.39,.35,0,6],[.43,.28,.23,0,6],[.28,.36,.42,0,6]];

// 四片樓板共用不規則斷面，完整時接縫密合；落地後各自旋轉、錯開。
function fractureSlab(out,rec,floor,y,terrain){
  const {x0,x1,z0,z1}=rec,w=x1-x0,d=z1-z0,seed=floor*2.47+x0*.13;
  const at=(u,v)=>[x0+w*u,z0+d*v];
  const corners=[at(0,1),at(1,1),at(1,0),at(0,0)];
  const ends=[at(.48+.15*Math.sin(seed),1),at(1,.57),at(.52,0),at(0,.41)];
  const mid=at(.52+.14*Math.cos(seed),.57+.12*Math.sin(seed));
  return corners.map((corner,i)=>{
    const shape=[corner,ends[i],mid,ends[(i+3)%4]],begin=out.p.length/3-rec.r0;
    const up=shape.map(([x,z])=>[x,y,z]),down=shape.map(([x,z])=>[x,y-.28,z]);
    const uv=shape.map(([x,z])=>[x/5,z/5]),normals=[[0,1,0],[0,-1,0]];
    out.quad(...up,[0,1,0],uv,stone);out.quad(...[...down].reverse(),[0,-1,0],[...uv].reverse(),stone);
    for(let j=0;j<4;j++){
      const n=(j+1)%4,dx=up[n][0]-up[j][0],dz=up[n][2]-up[j][2],len=Math.hypot(dx,dz);
      normals.push([-dz/len,0,dx/len]);
      out.quad(down[j],down[n],up[n],up[j],normals.at(-1),[[0,0],[len/5,0],[len/5,.12],[0,.12]],ledge);
    }
    const cx=shape.reduce((sum,v)=>sum+v[0]/4,0),cz=shape.reduce((sum,v)=>sum+v[1]/4,0);
    return {begin,end:out.p.length/3-rec.r0,cx,cz,normals,ground:terrain(cx,cz),
      leanX:.18+.28*Math.sin(seed+i*2.2),leanZ:.33*Math.cos(seed+i*1.7),yaw:.42*Math.sin(seed+i)};
  });
}

export function buildAlleyBuildings(world,{bucket,box,put,facades}){
  const shells=new Map(),details=bucket(),signs=bucket(),records=[];
  for(const [lot,[cx,cz,w,d,count,style]] of LOTS.entries()){
    if(!shells.has(style))shells.set(style,bucket());
    const wall=shells.get(style),F=facades[style],story=F.h/F.rows;
    const gy=world.height(cx,cz),front=cz<0?1:-1;
    for(let half=0;half<2;half++){
      const x0=cx+(half-1)*w/2,x1=x0+w/2,z0=cz-d/2,z1=cz+d/2;
      const mx=(x0+x1)/2,faces=[],floors=[];
      const tint=.83+(lot%4)*.05, col=[tint,tint*.99,tint*.96];
      const rec={x0,x1,z0,z1,H:count*story,fB:wall,rB:details,sB:signs,f0:wall.p.length/3,r0:details.p.length/3,s0:signs.p.length/3,lamp:-1};
      const detail=(a,b,c,e,f,g,color)=>box(details,a,b,gy+c,gy+e,f,g,color,4);
      for(let i=0;i<count;i++){
        const base=i*story,top=base+story,lo=i?base:-1.1;
        const f0=wall.p.length/3-rec.f0,r0=details.p.length/3-rec.r0;
        // 破口後面有地板和退縮的內牆；光從窗框的破邊照進來。
        const inset=half?x0+3.1:x1-3.1,seam=half?x0:x1;
        detail(half?inset:x0+.85,half?x1-.85:inset,lo,top-.24,z0+1.25,z1-1.25,room);
        // 交界是室內剖面。鄰跨倒下後會露出隔間、門框及混凝土樓板。
        const inner=[.55-i%2*.08,.46,.36,0,1];
        for(const z of [z0+.4,cz-.8,z1-.5])
          detail(Math.min(seam,inset),Math.max(seam,inset),lo,top-.2,z,z+.22,inner);
        for(const z of [z0+d*.27,z0+d*.75]){
          detail(inset-.12,inset+.12,base,top-.5,z-1.2,z+1.2,inner);
          detail(inset-.18,inset+.18,base,base+2.15,z-.51,z+.51,steel);
        }
        for(const [x,z,dx,dz,len] of [[x0,z1,1,0,w/2],[x1,z1,0,-1,d],[x1,z0,-1,0,w/2],[x0,z0,0,1,d]]){
          if(!dx&&x===seam)continue;
          const norm=[-dz,0,dx], bays=Math.max(1,Math.round(len/(F.w/F.cols)));
          for(let j=0;j<bays;j++){
            const a=len*j/bays,b=len*(j+1)/bays;
            const corners=[[a,lo],[b,lo],[b,top],[a,top]];
            // 保留四周不規則碎邊；打掉的只有命中這扇窗／牆板的中央面。
            const rim=[[a+(b-a)*.10,base+story*.20],[a+(b-a)*.76,base+story*.12],
              [a+(b-a)*.92,base+story*.75],[a+(b-a)*.24,base+story*.88]];
            const panel=pts=>wall.quad(...pts.map(([u,y])=>[x+dx*u,gy+y,z+dz*u]),norm,
              pts.map(([u,y])=>[(u/len*bays+half)/F.cols,y/F.h]),col);
            for(let k=0;k<4;k++){const n=(k+1)%4;panel([corners[k],corners[n],rim[n],rim[k]]);}
            faces.push({x:x+dx*(a+b)/2,z:z+dz*(a+b)/2,y:gy+base+story*.5,nx:norm[0],nz:norm[2],
              width:b-a,height:story,at:wall.p.length/3-rec.f0});
            panel(rim);
          }
        }
        const edge=front>0?z1:z0,over=edge+front*1.15,near=Math.min(edge,over),far=Math.max(edge,over);
        if(!i){
          detail(x0+.3,x1-.3,2.85,3.04,near,far,awnings[lot%3]);
          detail(x0+.3,x1-.3,2.5,2.87,over-.09,over+.09,awnings[lot%3]);
          const emit=(a,b,c,e,u,v,color)=>detail(a,b,c,e,Math.min(edge+front*u,edge+front*v),Math.max(edge+front*u,edge+front*v),color);
          streetfront(x0,x1,true,emit,{seed:lot*.74+half*.27});
          emit(x0+.5,x0+1.6,-.4,2.68,-.16,.16,steel);
          const sign=lot%8,sw=Math.min(5,(x1-x0)*.42),at=edge+front*1.16;
          const signPoint=(u,y)=>[mx+front*u,gy+y,at];
          signs.quad(signPoint(-sw/2,2.35),signPoint(sw/2,2.35),signPoint(sw/2,3.20),signPoint(-sw/2,3.20),
            [0,0,front],shopUV(sign,true),[.96,.96,.96]);
        }else if((lot+half)%3!==1){
          detail(x0+.55,x1-.55,base-.08,base+.18,near,far,ledge);
          detail(x0+.55,x1-.55,base+.94,base+1.04,over-.07,over+.07,steel);
          for(const u of [.09,.35,.64,.91])detail(x0+w/2*u-.045,x0+w/2*u+.045,base+.17,base+1,over-.05,over+.05,steel);
        }
        if(i===count-1){
          detail(x0+.12,x1-.12,top,top+.6,z0,z0+.32,ledge);
          detail(x0+.12,x1-.12,top,top+.6,z1-.32,z1,ledge);
          if(count<=4&&lot%2===0){
            const roof=[.29,.23,.19,0,2],ridge=gy+top+1.9;
            for(const side of [-1,1]){
              const e=side>0?z1+.32:z0-.32,pts=[[x0,gy+top+.36,e],[x1,gy+top+.36,e],[x1,ridge,cz],[x0,ridge,cz]];
              if(side<0)pts.reverse();
              details.quad(...pts,[0,.99,side*.14],pts.map(p=>[p[0]/3,p[2]/3]),roof);
            }
          }else if((half+lot)%2===0){
            detail(mx-1.7,mx+1.7,top,top+1.5,cz-1,cz+1,steel);
            for(let j=0;j<3;j++)detail(mx-1.4,mx+1.4,top+.4+j*.32,top+.51+j*.32,cz+1,cz+1.12,ledge);
          }
        }
        const slab=details.p.length/3-rec.r0;
        const pieces=fractureSlab(details,rec,i,gy+top,(x,z)=>world.height(x,z));
        floors.push({f0,f1:wall.p.length/3-rec.f0,r0,r1:details.p.length/3-rec.r0,slab,pieces,base,top});
      }
      rec.f1=wall.p.length/3;rec.r1=details.p.length/3;rec.s1=signs.p.length/3;
      rec.alley={faces,floors,gy,hand:half?1:-1};
      rec.box={x0,x1,z0,z1,top:gy+rec.H+.6};world.addCollider(rec.box);records.push(rec);
    }
  }
  for(const [style,wall] of shells)put(wall,world.cityFacadeMaterials[style]);
  put(details,world.fieldRoofMaterial);put(signs,world.citySignMaterial);
  return records;
}

export function chipAlleyFace(b,p,n,damage){
  if(!n||Math.abs(n.y)>.6||damage<.48)return;
  const skin=b.seg[0];
  for(const face of b.alley.faces){
    if(face.savedPanel||face.nx*n.x+face.nz*n.z<.65)continue;
    const dx=p.x-face.x,dz=p.z-face.z;
    if(Math.abs(dx*face.nx+dz*face.nz)>1.6||Math.abs(dx*face.nz-dz*face.nx)>face.width*.5||Math.abs(p.y-face.y)>face.height*.5)continue;
    const offset=face.at*3;
    face.savedPanel=skin.o.slice(offset,offset+12);  // 僅備份實際打破的面板，晃動時也保留破口。
    for(let i=1;i<4;i++)skin.o.set(face.savedPanel.subarray(0,3),offset+i*3);
    skin.a.array.set(skin.o.subarray(offset,offset+12),skin.s*3+offset);
    skin.a.addUpdateRange(skin.s*3+offset,12);skin.a.needsUpdate=true;
    const burn=b.burn;
    burn.a.array.fill(.31,burn.s+face.at-16,burn.s+face.at);
    burn.a.addUpdateRange(burn.s+face.at-16,16);burn.a.needsUpdate=true;b.bl=.31;
    return;
  }
}

function tiltSlabNormals(b,piece,cs,sn,slopeX,slopeZ){
  const attr=b.alley.normals,begin=b.seg[1].s+piece.begin;
  for(let i=0;i<piece.normals.length;i++){
    const [ox,ny,oz]=piece.normals[i],x=ox-ny*slopeX,z=oz-ny*slopeZ;
    const inv=1/Math.hypot(x,ny,z),nx=(cs*x-sn*z)*inv,nz=(sn*x+cs*z)*inv;
    for(let j=0;j<4;j++)attr.setXYZ(begin+i*4+j,nx,ny*inv,nz);
  }
}
export function resetAlleyFaces(b){
  if(b.st&&b.alley.normals){
    for(const f of b.alley.floors){
      for(const piece of f.pieces)tiltSlabNormals(b,piece,1,0,0,0);
      b.alley.normals.addUpdateRange((b.seg[1].s+f.slab)*3,(f.r1-f.slab)*3);
    }
    b.alley.normals.needsUpdate=true;
  }
  for(const f of b.alley.faces)if(f.savedPanel){b.seg[0].o.set(f.savedPanel,f.at*3);f.savedPanel=null;}
}

// 分層下墜，樓板先傾側，再落在前一層碎石上。落定的板片沿用原模型。
export function settleAlley(b,t,slabsOnly=false){
  const {floors,gy,hand}=b.alley;
  let highest=gy+1.4;
  for(const [i,f] of floors.entries()){
    const time=Math.max(0,t-.14-i*.075),rest=1.05+i*.43;
    const drop=Math.min(f.top-rest,12*time*time);
    const progress=drop/(f.top-rest),angle=hand*(i%2?.047:-.072)*progress;
    const sin=Math.sin(angle),cos=Math.cos(angle);
    for(let j=0;!slabsOnly&&j< (i===0?b.seg.length:2);j++){
      const g=b.seg[j],from=j===2?0:j?f.r0:f.f0,to=j===2?g.o.length/3:j?f.slab:f.f1;
      for(let k=from*3;k<to*3;k+=3){
        const x=g.o[k]-b.cx,y=g.o[k+1]-gy-f.top,z=g.o[k+2]-b.cz,offset=g.s*3+k;
        const edge=x*sin;
        const h=Math.max(-1.3+(rest+.95)*progress+edge,f.top+y*cos+edge-drop);
        g.a.array[offset]=b.cx+x*cos-y*sin+hand*.36*progress;
        g.a.array[offset+1]=gy+h;g.a.array[offset+2]=b.cz+z+progress*Math.sin(i*2)*.53;
        highest=Math.max(highest,gy+h);
      }
      g.a.addUpdateRange((g.s+from)*3,(to-from)*3);g.a.needsUpdate=true;
    }
    const slab=b.seg[1];
    for(const piece of f.pieces){
      const twist=piece.yaw*progress,cs=Math.cos(twist),sn=Math.sin(twist);
      const slopeX=piece.leanX*progress,slopeZ=piece.leanZ*progress;
      if(b.alley.normals)tiltSlabNormals(b,piece,cs,sn,slopeX,slopeZ);
      const landing=piece.ground+.46+i*.23;
      const centerY=gy+f.top-(gy+f.top-landing)*progress;
      for(let k=piece.begin*3;k<piece.end*3;k+=3){
        const x=slab.o[k]-piece.cx,z=slab.o[k+2]-piece.cz,offset=slab.s*3+k;
        const h=centerY+(slab.o[k+1]-gy-f.top)+x*slopeX+z*slopeZ;
        slab.a.array[offset]=piece.cx+x*cs-z*sn+piece.leanZ*progress*2;
        slab.a.array[offset+1]=h;slab.a.array[offset+2]=piece.cz+x*sn+z*cs+piece.leanX*progress*2;
        highest=Math.max(highest,h);
      }
    }
    const offset=(slab.s+f.slab)*3,length=(f.r1-f.slab)*3;
    slab.a.addUpdateRange(offset,length);slab.a.needsUpdate=true;
    if(b.alley.normals){b.alley.normals.addUpdateRange(offset,length);b.alley.normals.needsUpdate=true;}
  }
  if(!slabsOnly)b.box.top=Math.max(b.rh[0],Math.min(b.top0,highest));
}
