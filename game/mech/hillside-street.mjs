import { alleySkin, dressFloor, dressServiceWalls, stairLanding } from './hillside-architecture.mjs';
import { HILL_COVER } from './hillside-layout.mjs';

// 住宅街沿商店街與兩翼排列。相鄰兩跨共用外觀，各自保有可破壞的外牆、樓板和碰撞。
const LOTS=[
  // 中心 x、z、寬、深、樓層、立面樣式
  [-291,174,31,21,4,3],[-229,179,34,22,3,2],[-173,167,29,21,4,4],
  [-262,-121,31,20,4,4],[-191,-130,43,23,5,3],[-150,-142,25,16,3,2],
  [-314,33,31,25,4,2],[-276,48,23,19,5,3],[-193,34,26,24,4,4],[-143,34,31,27,6,3],
  [-308,-29,38,24,5,3],[-258,-26,27,20,3,4],[-185,-30,24,21,5,3],[-138,-27,28,22,4,2],
];
const stone=[.65,.59,.50,0,1], ledge=[.78,.76,.70,0,1], steel=[.19,.23,.23,0,2], room=[.12,.11,.10,0,1];


// 每個窗跨的八個扇區共用外圈；命中時只移動內緣，外牆貼圖仍然對齊。
const perimeter=[[0,0],[.43,0],[1,0],[1,.56],[1,1],[.59,1],[0,1],[0,.46]],center=[.5,.5];
const panelVertices=perimeter.length*2,edgeVertices=perimeter.length*4;
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));

// 共用兩圈頂點，完整時內圈重合。每次受擊仍只更新一個窗跨的範圍。
function windowPanel(wall,point,tex,normal,color){
  const first=wall.p.length/3,n=perimeter.length;
  for(let j=0;j<n*2;j++){
    const p=j<n?perimeter[j]:center;
    wall.p.push(...point(p));wall.n.push(...normal);wall.uv.push(...tex(p));
    wall.c.push(...color);wall.b.push(0);wall.s.push(0);
  }
  for(let k=0;k<n;k++){
    const a=first+k,b=first+(k+1)%n;
    wall.i.push(a,b,b+n,a,b+n,a+n);
  }
}

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
      leanX:.03+.17*Math.sin(seed+i*2.2),leanZ:.16*Math.cos(seed+i*1.7),yaw:.28*Math.sin(seed+i)};
  });
}

export function buildAlleyBuildings(world,{bucket,box,put,facades}){
  const wall=bucket(),details=bucket(),signs=bucket(),records=[];
  for(const [lot,[cx,cz,w,d,count,style]] of LOTS.entries()){
    const F=facades[style],story=F.h/F.rows;
    const gy=world.height(cx,cz),front=cz<0?1:-1;
    for(let half=0;half<2;half++){
      const x0=cx+(half-1)*w/2,x1=x0+w/2,z0=cz-d/2,z1=cz+d/2;
      const faces=[],floors=[],lotBounds={x0,x1,z0,z1};
      const stories=count-(lot%4===0&&half?1:0),shop=(lot+half)%3;
      const tint=.83+(lot%4)*.05, col=[tint,tint*.99,tint*.96];
      const rec={x0,x1,z0,z1,H:stories*story,fB:wall,rB:details,sB:signs,f0:wall.p.length/3,r0:details.p.length/3,s0:signs.p.length/3,lamp:-1};
      const detail=(a,b,c,e,f,g,color)=>box(details,a,b,gy+c,gy+e,f,g,color,4);
      for(let i=0;i<stories;i++){
        const stepBack=i===stories-1&&((lot+half)%3===0||stories>=5);
        const insetX=stepBack&&(lot+half)%3!==2?1.15:0,insetZ=stepBack?1.65:0;
        const x0=lotBounds.x0+(half?0:insetX),x1=lotBounds.x1-(half?insetX:0);
        const z0=lotBounds.z0+insetZ,z1=lotBounds.z1-insetZ,mx=(x0+x1)/2;
        const remnants=[];
        const base=i*story,top=base+story,lo=i?base:-1.1;
        const f0=wall.p.length/3-rec.f0,r0=details.p.length/3-rec.r0;
        // 破口後面有地板和退縮的內牆；光從窗框的破邊照進來。
        const inset=half?x0+3.1:x1-3.1,seam=half?x0:x1;
        detail(half?inset:x0+.85,half?x1-.85:inset,lo,top-.24,z0+1.25,z1-1.25,room);
        // 交界是室內剖面。鄰跨倒下後會露出隔間、門框及混凝土樓板。
        const inner=[[.66,.56,.39,0,1],[.46,.57,.53,0,1],[.60,.48,.43,0,1]][(i+lot)%3];
        for(const z of [z0+(i?.40:1.02),cz-.8,z1-(i?.50:1.28)])
          detail(Math.min(seam,inset),Math.max(seam,inset),lo,top-.2,z,z+.22,inner);
        const interiorSide=half?-1:1,ix=inset+interiorSide*.035;
        for(const [j,z] of [z0+d*.27,z0+d*.75].entries()){
          const halfRoom=d*.215;
          const P=(u,y)=>[ix,gy+y,z-interiorSide*u];
          const cell=i?0:shop,row=i?0:2;
          wall.quad(P(-halfRoom,base+.09),P(halfRoom,base+.09),P(halfRoom,top-.24),P(-halfRoom,top-.24),
            [interiorSide,0,0],[[.016,.018],[.984,.018],[.984,.982],[.016,.982]].map(([u,v])=>[(cell+u)/3,(row+v)/4]),[.80,.73,.62]);
          detail(ix-.08,ix+.08,base+.08,base+.22,z-halfRoom,z+halfRoom,ledge);
          if(i){
            const q=ix+interiorSide*.39,Z=z+halfRoom*.66;
            detail(q-.37,q+.37,base+.20,base+1.02,Z-1.0,Z+1.0,[.48,.33,.20,0,5]);
            detail(q-.43,q+.43,base+1.02,base+1.10,Z-1.06,Z+1.06,ledge);
            if((j+i)%2)detail(q-.17,q+.17,base+1.10,base+1.55,Z-.26,Z+.26,inner);
          }
        }
        const sides=[[x0,z1,1,0,x1-x0],[x1,z1,0,-1,z1-z0],[x1,z0,-1,0,x1-x0],[x0,z0,0,1,z1-z0]];
        const otherStories=count-(lot%4===0&&!half?1:0);
        for(const [x,z,dx,dz,len] of sides){
          if(!dx&&x===seam&&i<otherStories)continue;
          const nx=-dz,nz=dx,norm=[nx,0,nz],bays=Math.max(1,Math.round(len/(F.w/F.cols)));
          const retail=!i&&nz===front;
          for(let j=0;j<bays;j++){
            const width=len/bays,a=j*width;
            const centerZ=z+dz*(a+width*.5);
            const laneDoor=!nz&&(lot+half)%3===2&&Math.abs(centerZ-stairLanding(z0,z1,i))<width*.5;
            const low=retail||laneDoor?base+.16:lo,height=top-low;
            const service=!nz&&!laneDoor&&(j===0||(j+lot)%4===2);
            const door=(dx>0)===!!half?bays-1:0;
            const shutter=retail&&(lot+half)%4===1&&j===(door===0?1:0);
            const depth=retail?(shutter?.31:.67):laneDoor?.12:0;
            const px=x+dx*a-nx*depth,pz=z+dz*a-nz*depth;
            let tile=style-2,row=(j+i*2+lot)%5<2?1:3;
            if(retail){tile=shop;row=2;}
            if(laneDoor||service||shutter){tile=shutter?2:laneDoor?0:1;row=0;}
            // 同一個店內全景分給相鄰櫥窗，門扇取邊緣的一小段。
            const mirror=!retail&&!laneDoor&&(j+i+lot)%3===0;
            const left=retail&&!shutter&&j!==door?(j-(door===0?1:0))/(bays-1):mirror?1:0;
            const right=retail&&!shutter?(j===door?.28:left+1/(bays-1)):mirror?0:1;
            const pu=(tile+.012+.976*left)/3,du=.976*(right-left)/3;
            const pv=(row+.012)/4,dv=.976/4;
            if(laneDoor){
              // 嵌入牆面的門框各有門楣和平台；只包樓梯的實際落腳處。
              const X=x+nx*.13;
              for(const offset of [-.64,.64])detail(X-.11,X+.11,base+.16,base+2.50,centerZ+offset-.045,centerZ+offset+.045,steel);
              detail(X-.17,X+.17,base+2.5,base+2.62,centerZ-.73,centerZ+.73,ledge);
            }
            if(i&&nz===front&&(lot+j)%3===0){
              const l=Math.min(px,px+dx*width),r=l+width;
              detail(l+.26,r-.26,base+.64,base+.73,pz-.24,pz+.24,ledge);
            }
            const point=([u,v])=>[px+dx*u*width,gy+low+height*v,pz+dz*u*width];
            const tex=([u,v])=>[pu+du*u,pv+dv*v];
            const face={x:px+dx*width*.5,z:pz+dz*width*.5,y:gy+low+height*.5,nx,nz,
              width,height,at:wall.p.length/3-rec.f0,pu,du,pv,dv,seed:lot*2.7+j*1.8+i*.75};
            faces.push(face);
            if(i>0&&j===(i+half+lot)%bays&&(nz===front||(!nz&&x!==seam))){
              remnants.push(face);face.edgeAt=details.p.length/3-rec.r0;face.edgeNormals=[];
              // 斷面與窗牆取自同一組周界，翻落後可看見砂漿厚度。
              for(let k=0;k<perimeter.length;k++){
                const l=point(perimeter[k]),r=point(perimeter[(k+1)%perimeter.length]);
                const inside=v=>[v[0]-nx*.24,v[1],v[2]-nz*.24];
                const rise=r[1]-l[1],run=(r[0]-l[0])*dx+(r[2]-l[2])*dz,dist=Math.hypot(rise,run);
                const edgeNormal=[dx*rise/dist,-run/dist,dz*rise/dist];face.edgeNormals.push(edgeNormal);
                details.quad(r,l,inside(l),inside(r),edgeNormal,[[0,0],[dist,0],[dist,.24],[0,.24]],stone);
              }
            }
            windowPanel(wall,point,tex,norm,col);
          }
        }
        dressFloor({detail,out:details,signs,x0,x1,z0,z1,gy,front,lot,half,i,count:stories,base,top,shop,stepBack});
        if(i===stories-1){
          if(stories<=4&&lot%2===0){
            const roof=[.29,.23,.19,0,2],ridge=gy+top+2.48;
            for(const side of [-1,1]){
              const e=side>0?z1+.32:z0-.32,pts=[[x0,gy+top+.36,e],[x1,gy+top+.36,e],[x1,ridge,cz],[x0,ridge,cz]];
              detail(x0-.14,x1+.14,top-.03,top+.36,e-.12,e+.12,roof);
              if(side<0)pts.reverse();
              details.quad(...pts,[0,.99,side*.14],pts.map(p=>[p[0]/3,p[2]/3]),roof);
              for(let X=x0+.85;X<x1-.25;X+=1.42){
                const seam=[[X,gy+top+.38,e],[X+.075,gy+top+.44,e],[X+.075,ridge+.07,cz],[X,ridge+.01,cz]];
                if(side<0)seam.reverse();
                details.quad(...seam,[-.48,.86,.12*side],[[0,0],[.04,0],[.04,4],[0,4]],steel);
              }
            }
            for(const outer of [x0+.012,x1-.012]){
              const nx=outer<mx?-1:1;
              const a=[outer,gy+top+.36,z0-.32],b=[outer,gy+top+.36,z1+.32],c=[outer,ridge,cz];
            details.quad(...(nx>0?[b,a,c,c]:[a,b,c,c]),[nx,0,0],[[0,0],[4,0],[2,1],[2,1]],ledge);
              detail(outer-.06,outer+.06,top-.04,top+.37,z0-.32,z1+.32,ledge);
              if(nx===(half?1:-1)){
                const X=outer+nx*.098;
                detail(X-.045,X+.045,top+.56,top+1.39,cz-1.12,cz+1.12,steel);
                for(let j=0;j<4;j++)detail(X-.095,X+.095,top+.68+j*.17,top+.745+j*.17,cz-1.04,cz+1.04,ledge);
              }
            }
            detail(x0-.08,x1+.08,top+2.43,top+2.56,cz-.12,cz+.12,roof);
          }else{
            detail(x0+.12,x1-.12,top,top+.46,z0,z0+.26,ledge);
            detail(x0+.12,x1-.12,top,top+.46,z1-.26,z1,ledge);
            const outer=half?x1:x0;
            detail(outer-.12,outer+.12,top,top+.46,z0,z1,ledge);
            if((half+lot)%2===0){
              detail(mx-1.7,mx+1.7,top,top+1.5,cz-1,cz+1,steel);
              for(let j=0;j<3;j++)detail(mx-1.4,mx+1.4,top+.4+j*.32,top+.51+j*.32,cz+1,cz+1.12,ledge);
            }
          }
        }
        const footing=details.p.length/3-rec.r0;
        if(!i){
          // 牆腳藏在外皮之後。倒下後仍能看見帶厚度的砌體及高低不齊的斷口。
          const edge=front>0?z1:z0,start=x0+.32+(lot%3)*.18;
          const pts=[0,.24,.39,.54,.78,1],heights=[.63,1.10,1.02,.54,.72,.31];
          for(let k=0;k<pts.length-1;k++){
            const a=start+pts[k]*(x1-start-.7),b=start+pts[k+1]*(x1-start-.7);
            const at=(x,h,d)=>[x,gy+h,edge-front*d],ha=heights[k],hb=heights[k+1];
            let face=[at(a,-.65,.82),at(b,-.65,.82),at(b,hb,.82),at(a,ha,.82)];
            if(front<0)face.reverse();
            details.quad(...face,[0,0,front],[[0,0],[1,0],[1,1],[0,1]],[.47,.32,.25,0,7]);
            let cap=[at(a,ha,.82),at(b,hb,.82),at(b,hb,1.22),at(a,ha,1.22)];
            if(front<0)cap.reverse();
            details.quad(...cap,[(ha-hb)/(b-a),1,0],[[0,0],[1,0],[1,1],[0,1]],stone);
          }
        }
        const slab=details.p.length/3-rec.r0;
        const pieces=fractureSlab(details,{...rec,x0:x0+.085,x1:x1-.085,z0:z0+.085,z1:z1-.085},i,gy+top,(x,z)=>world.height(x,z));
        floors.push({f0,f1:wall.p.length/3-rec.f0,r0,r1:details.p.length/3-rec.r0,slab,footing,pieces,remnants,base,top});
      }
      rec.f1=wall.p.length/3;rec.r1=details.p.length/3;rec.s1=signs.p.length/3;
      rec.alley={faces,floors,gy,hand:half?1:-1};
      rec.box={x0,x1,z0,z1,top:gy+rec.H+.6};world.addCollider(rec.box);records.push(rec);
    }
  }
  for(const site of HILL_COVER){
    if(site.x>=-340&&site.x<=-115)dressServiceWalls(site,world.height(site.x,site.z),wall,details,box);
  }
  put(wall,alleySkin(world));
  put(details,world.fieldRoofMaterial);put(signs,world.citySignMaterial);
  return records;
}

export function chipAlleyFace(b,p,n,damage){
  if(!n||Math.abs(n.y)>.6||damage<.48)return;
  const skin=b.seg[0],uv=b.alley.uv,burn=b.burn;
  for(const face of b.alley.faces){
    if(face.nx*n.x+face.nz*n.z<.65)continue;
    const dx=p.x-face.x,dz=p.z-face.z;
    const u=.5+(dx*face.nz-dz*face.nx)/face.width,v=.5+(p.y-face.y)/face.height;
    if(Math.abs(dx*face.nx+dz*face.nz)>2.55||u<0||u>1||v<0||v>1)continue;
    const start=face.at*3;
    if(!face.savedPanel){
      face.savedPanel=skin.o.slice(start,start+panelVertices*3);
      face.hitU=clamp(u,.025,.975);face.hitV=clamp(v,.025,.975);face.damage=0;
    }
    face.damage+=damage;
    const radius=.98*(1-Math.exp(-.31*face.damage));
    for(let edge=0;edge<perimeter.length;edge++){
      const [eu,ev]=perimeter[edge];
      const t=radius*(.82+.15*Math.sin(face.seed+edge*2.33));
      const U=face.hitU+(eu-face.hitU)*t,V=face.hitV+(ev-face.hitV)*t;
      const idx=face.at+perimeter.length+edge,along=(U-.5)*face.width;
      skin.o[idx*3]=face.x+face.nz*along;skin.o[idx*3+1]=face.y+(V-.5)*face.height;
      skin.o[idx*3+2]=face.z-face.nx*along;
      uv.setXY(skin.s+idx,face.pu+U*face.du,face.pv+V*face.dv);
      burn.a.setX(burn.s+idx,.99);
    }
    skin.a.array.set(skin.o.subarray(start,start+panelVertices*3),skin.s*3+start);
    skin.a.addUpdateRange((skin.s+face.at)*3,panelVertices*3);skin.a.needsUpdate=true;
    uv.addUpdateRange((skin.s+face.at)*2,panelVertices*2);uv.needsUpdate=true;
    burn.a.addUpdateRange(burn.s+face.at,panelVertices);burn.a.needsUpdate=true;b.bl=1;
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
// 一層最多留下兩塊可辨識的窗牆，繞下緣翻入原有建地，露出原本朝街的那一面。
function foldWall(b,f,face,progress){
  const skin=b.seg[0],norm=b.alley.wallNormals,base=face.y-face.height*.5;
  const angle=progress*(1.08+.33*Math.sin(face.seed)),sn=Math.sin(angle),cs=Math.cos(angle);
  const ground=b.gy+.36+f.base*.042;
  const pivot=base+(ground-base)*progress;
  const edgeSeg=b.seg[1],edgeNorm=b.alley.normals;
  const point=(g,index,clipped)=>{
    const j=index*3,offset=g.s*3+j,dx=g.o[j]-face.x,dz=g.o[j+2]-face.z;
    const h=g.o[j+1]-base,nick=clipped?progress*.47:0;
    const along=(dx*face.nz-dz*face.nx)*(1-nick),thick=dx*face.nx+dz*face.nz;
    const y=h*(1-nick)+face.height*.35*nick,depth=y*sn+progress*.18-thick*cs;
    g.a.array[offset]=face.x+face.nz*along-face.nx*depth;
    g.a.array[offset+1]=pivot+y*cs+thick*sn;
    g.a.array[offset+2]=face.z-face.nx*along-face.nz*depth;
  };
  for(let k=0;k<panelVertices;k++){
    const idx=face.at+k;
    point(skin,idx,k<perimeter.length&&k%4===0);
    norm.setXYZ(skin.s+idx,face.nx*cs,sn,face.nz*cs);
    b.burn.a.setX(b.burn.s+idx,face.savedPanel&&k>=perimeter.length?.99:progress*.66);
  }
  for(let k=0;k<edgeVertices;k++){
    const edge=Math.floor(k/4),corner=k%4;
    const edgeIdx=face.edgeAt+k;
    point(edgeSeg,edgeIdx,(edge+(corner===0||corner===3?1:0))%4===0);
    const [nx,ny,nz]=face.edgeNormals[edge],depth=nx*face.nx+nz*face.nz;
    edgeNorm.setXYZ(edgeSeg.s+edgeIdx,nx+face.nx*(depth*(cs-1)-ny*sn),ny*cs+depth*sn,nz+face.nz*(depth*(cs-1)-ny*sn));
  }
  const at=(skin.s+face.at)*3,edgeAt=(edgeSeg.s+face.edgeAt)*3;
  skin.a.addUpdateRange(at,panelVertices*3);skin.a.needsUpdate=true;
  norm.addUpdateRange(at,panelVertices*3);norm.needsUpdate=true;
  edgeSeg.a.addUpdateRange(edgeAt,edgeVertices*3);edgeSeg.a.needsUpdate=true;
  edgeNorm.addUpdateRange(edgeAt,edgeVertices*3);edgeNorm.needsUpdate=true;
  b.burn.a.addUpdateRange(b.burn.s+face.at,panelVertices);b.burn.a.needsUpdate=true;b.bl=1;
}
export function resetAlleyFaces(b){
  if(b.st&&b.alley.normals){
    for(const f of b.alley.floors){
      for(const face of f.remnants){
        const at=b.seg[0].s+face.at,norm=b.alley.wallNormals;
        for(let k=0;k<panelVertices;k++)norm.setXYZ(at+k,face.nx,0,face.nz);
        for(let k=0;k<edgeVertices;k++)b.alley.normals.setXYZ(b.seg[1].s+face.edgeAt+k,...face.edgeNormals[Math.floor(k/4)]);
        b.alley.normals.addUpdateRange((b.seg[1].s+face.edgeAt)*3,edgeVertices*3);
        norm.addUpdateRange(at*3,panelVertices*3);norm.needsUpdate=true;
      }
      for(const piece of f.pieces)tiltSlabNormals(b,piece,1,0,0,0);
      b.alley.normals.addUpdateRange((b.seg[1].s+f.slab)*3,(f.r1-f.slab)*3);
    }
    b.alley.normals.needsUpdate=true;
  }
  const skin=b.seg[0],uv=b.alley.uv;
  for(const f of b.alley.faces)if(f.savedPanel){
    skin.o.set(f.savedPanel,f.at*3);f.savedPanel=null;f.damage=0;
    for(let k=perimeter.length;k<panelVertices;k++)uv.setXY(skin.s+f.at+k,f.pu+f.du*.5,f.pv+f.dv*.5);
    uv.addUpdateRange((skin.s+f.at)*2,panelVertices*2);uv.needsUpdate=true;
  }
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
      const g=b.seg[j],from=j===2?0:j?f.r0:f.f0,to=j===2?g.o.length/3:j?f.footing:f.f1;
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
    for(const face of f.remnants)foldWall(b,f,face,progress);
    const slab=b.seg[1];
    if(f.footing<f.slab){
      const begin=f.footing*3,end=f.slab*3,offset=slab.s*3+begin;
      slab.a.array.set(slab.o.subarray(begin,end),offset);
      slab.a.addUpdateRange(offset,end-begin);slab.a.needsUpdate=true;
    }
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
