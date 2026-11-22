import { routeDistance } from './battlefields.js';
import { HILL_ALLEY, HILL_COVER, HILL_EXIT, HILL_LINES, HILL_LOTS } from './hillside-layout.mjs';

// 巷道折線同時決定宅地的出入口及實際鋪設的路面。
export const RESIDENTIAL_LANES=[
  [[-588,-177],[-432,-187],[-298,-209],[-136,-193],[24,-213],[185,-228],[317,-217]],
  [[-561,-278],[-393,-267],[-217,-300],[-55,-285],[115,-311],[240,-307]],
  [[-350,-380],[-235,-396],[-114,-381],[38,-405],[137,-400]],
  [[-605,192],[-443,216],[-304,225],[-172,202],[-12,215],[144,242],[294,229],[452,227]],
  [[-424,303],[-263,282],[-105,301],[15,307],[157,339],[280,318]],
  [[-82,38],[-7,43],[63,38],[111,42]],
  [[-505,-21],[-421,-30],[-358,-28]],
  [[-83,-31],[-6,-45],[71,-36]],
  [[-337,61],[-300,67],[-265,71],[-231,63]],
  [[-208,60],[-166,65],[-119,59]],
  [[-337,-53],[-292,-61],[-251,-52]],
  [[-119,0],[-87,1],[-58,7],[-23,14],[13,17],[38,26],[63,38]],
  [[436,48],[503,40],[622,44],[719,69],[804,74]],
];
export const LOCAL_LINKS=[
  [[-337,-75],[-345,-159],[-326,-205],[-351,-270]],
  [[-119,-80],[-111,-150],[-136,-193],[-158,-244],[-164,-295],[-183,-389]],
  [[-337,89],[-351,157],[-365,217],[-387,251],[-372,297]],
  [[-119,104],[-94,156],[-102,208],[-76,257],[-62,303]],
  [[-78,38],[-95,21],[-119,0],[-91,-19],[-83,-31]],
  [[-358,-28],[-337,-17],[-337,0]],
  [[436,48],[435,84],[462,92]],
];
const sideRoads=[0,1].map(i=>[[-590,10],...HILL_LINES.map(l=>l.posts[i]),HILL_EXIT,[680,10]]);
export const BATTLE_ROADS=[...sideRoads,...HILL_LINES.map(l=>l.posts),HILL_ALLEY,[[-337,-75],[-337,89]],[[-119,-80],[-119,104]]];
const noise=(i,j,k)=>{const v=Math.sin(i*731.27+j*39.41+k*10.927)*45807.13;return v-Math.floor(v);};

export function townLots(){
  const lots=[];
  for(const [i,lane] of RESIDENTIAL_LANES.entries()){
    for(let j=1;j<lane.length;j++){
      const [ax,az]=lane[j-1],[bx,bz]=lane[j],len=Math.hypot(bx-ax,bz-az);
      for(const side of [-1,1]){
        for(let u=12+noise(i,j,side)*18;u<len-7;){
          const id=(i*101+j*23)*side+Math.round(u);
          const rand=k=>noise(id,j,k),t=u/len,kind=Math.floor(rand(3)*5);
          const w=kind===4?16+rand(5)*5:7.1+rand(5)*4.5,d=8+rand(6)*4;
          const z=az+(bz-az)*t+side*(d*.5+5+rand(7)*4),x=ax+(bx-ax)*t;
          u+=w+4+rand(8)*11;
          // 同一排數戶共用宅地，遇到山溝及庭園一起斷開，避免整面坡等距排屋。
          if(i<5&&noise(i,Math.floor(x/68),side)<(i===2?.58:.44))continue;
          const span=Math.hypot(w,d)*.5;
          if(BATTLE_ROADS.some(road=>routeDistance(x,z,road)<span+18)||
            LOCAL_LINKS.some(road=>routeDistance(x,z,road)<span+3.4)||
            RESIDENTIAL_LANES.some(other=>other!==lane&&routeDistance(x,z,other)<span+2.8)||
            HILL_LOTS.some(([cx,cz,W,D])=>Math.abs(x-cx)<(W+w)*.5+3&&Math.abs(z-cz)<(D+d)*.5+3)||
            HILL_COVER.some(c=>Math.abs(x-c.x)<(w+c.w)*.5+4&&Math.abs(z-c.z)<(d+c.d)*.5+4)||
            lots.some(p=>Math.abs(x-p.x)<(w+p.w)*.5+2.2&&Math.abs(z-p.z)<(d+p.d)*.5+2.2))continue;
          lots.push({x,z,w,d,id,side,kind,laneZ:az+(bz-az)*t,storeys:kind===4?3+(rand(12)>.52):kind===3?3:2});
        }
      }
    }
  }
  return lots;
}
const plaster=[.59,.55,.46,0,1],cap=[.63,.62,.57,0,1],iron=[.24,.26,.25,0,2];
const roofColors=[[.16,.19,.20],[.26,.22,.19],[.26,.20,.17],[.24,.26,.25],[.30,.28,.24]];

export function buildTownHouses(world,wall,roof,signs,box,yards){
  const records=[];
  for(const {x,z,w,d,id,kind,storeys,side,laneZ} of townLots()){
    const x0=x-w*.5,x1=x+w*.5,z0=z-d*.5,z1=z+d*.5;
    // 已有的隧道、候車棚及設備棟優先，斜坡上的基座落到各角實際地面。
    if(world.nearBoxes(x,z,Math.max(w,d)+3,[]).some(c=>c.x1>x0-1&&c.x0<x1+1&&c.z1>z0-1&&c.z0<z1+1))continue;
    const ground=[world.height(x0,z0),world.height(x1,z0),world.height(x1,z1),world.height(x0,z1)];
    const gy=world.height(x,z),floor=Math.max(...ground)+.13;
    if(floor-Math.min(...ground)>5.5)continue;
    const eave=floor+storeys*2.95,front=-side,edge=z+front*d*.5;
    const rec={x0,x1,z0,z1,H:eave-gy,fB:wall,rB:roof,sB:signs,f0:wall.p.length/3,r0:roof.p.length/3,s0:0,s1:0,lamp:-1,town:true};
    const block=(a,b,y0,y1,c,d,col)=>box(roof,a,b,y0,y1,c,d,col,3);
    block(x0+.035,x1-.035,Math.min(...ground)-.28,floor+.10,z0+.035,z1-.035,plaster);
    const walls=[[x0,z1,1,0,w],[x1,z1,0,-1,d],[x1,z0,-1,0,w],[x0,z0,0,1,d]];
    const tile=kind===2?2:kind===0?0:1,shade=.76+noise(id,1,2)*.22;
    for(const [X,Z,dx,dz,len] of walls){
      const n=[-dz,0,dx],bays=Math.max(1,Math.round(len/(kind===4?3.7:4.1)));
      for(let i=0;i<storeys;i++)for(let j=0;j<bays;j++){
        const isDoor=!i&&dx===front&&j===Math.floor(bays*.5);
        const uvCol=isDoor?0:tile,uvRow=isDoor?0:noise(id,j,i)>.55?3:1;
        const face=(u,v)=>[X+dx*len*(j+u)/bays,floor+(i+v)*2.95,Z+dz*len*(j+u)/bays];
        const pts=[[0,0],[1,0],[1,1],[0,1]];
        wall.quad(...pts.map(([u,v])=>face(u,v)),n,pts.map(([u,v])=>[(uvCol+.014+.972*u)/3,(uvRow+.014+.972*v)/4]),[shade,shade*.98,shade*.95]);
      }
    }
    const rc=[...roofColors[Math.abs(id)%roofColors.length],0,6];
    const pts=(coords,col)=>{
      const [a,b,c]=coords,ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,L=Math.hypot(nx,ny,nz);
      roof.quad(...coords,[nx/L,ny/L,nz/L],coords.map(p=>[p[0]/3,p[2]/3]),col);
    };
    if(kind<3){
      const alongZ=kind===1,hip=kind===0;
      const W=(alongZ?d:w)*.5+.53,D=(alongZ?w:d)*.5+.54,ridge=eave+Math.min(3.6,D*.49);
      const P=(a,b,y)=>alongZ?[x-b,y,z+a]:[x+a,y,z+b];
      const A=P(-W,D,eave),B=P(W,D,eave),C=P(W,-D,eave),E=P(-W,-D,eave);
      const left=P(-W+(hip?W*.43:0),0,ridge),right=P(W-(hip?W*.43:0),0,ridge);
      pts([A,B,right,left],rc);pts([C,E,left,right],rc);
      pts([B,C,right,right],hip?rc:plaster);pts([E,A,left,left],hip?rc:plaster);
      block(x0-.45,x1+.45,eave-.15,eave,z0-.45,z1+.45,iron);
    }else{
      block(x0-.26,x1+.26,eave-.10,eave+.21,z0-.26,z1+.26,cap);
      block(x-w*.31,x-w*.04,eave+.21,eave+1.58,z-.95,z+1.25,plaster);
      for(let i=1;i<storeys;i++){
        const y=floor+i*2.95,outer=edge+front*1.0,a=x0+.52,b=x+(kind===4?.41:.24)*w;
        block(a,b,y-.13,y+.05,Math.min(edge,outer),Math.max(edge,outer),cap);
        block(a,b,y+.05,y+.80,outer-.07,outer+.07,plaster);
      }
    }
    const awning=edge+front*.93;
    block(x-1.25,x+1.25,floor+2.16,floor+2.34,Math.min(edge,awning),Math.max(edge,awning),iron);
    rec.f1=wall.p.length/3;rec.r1=roof.p.length/3;
    rec.box={x0,x1,z0,z1,top:eave};world.addCollider(rec.box);records.push(rec);
    // 玄關小徑下接巷道，庭牆和地塊保留高差。
    const curb=laneZ+side*2.62;
    const terrace=(a,b,near,far,lift,col)=>{
      const corners=[[a,Math.max(near,far)],[b,Math.max(near,far)],[b,Math.min(near,far)],[a,Math.min(near,far)]];
      const p=corners.map(([X,Z])=>[X,world.height(X,Z)+lift,Z]);
      roof.quad(...p,[0,1,0],p.map(v=>[v[0]/5,v[2]/5]),col);
    };
    // 每戶的宅地都有邊界；車道與玄關跨過自家退縮處，牆外才是公共巷道。
    terrace(x0-1.0,x1+1.0,edge-front*.19,curb,.105,kind===4?cap:[.35,.33,.27,0,5]);
    terrace(x-.90,kind===4?x1-.27:x+.90,edge,curb,.127,cap);
    const landing=world.height(x,edge+front*.6)+.13,risers=Math.max(1,Math.ceil((floor-landing)/.22));
    for(let j=0;j<risers;j++){
      const near=edge+front*j*.31,far=edge+front*(j+1)*.31;
      block(x-.90,x+.90,landing-.23,Math.max(landing+.02,floor+.09-j*.22),Math.min(near,far),Math.max(near,far),cap);
    }
    const wallZ=edge+front*(2.3+noise(id,0,11));
    if(Math.abs(id)%3!==0){
      gardenWall(roof,world,x0+.1,x-.73,wallZ,front,.70+noise(id,5,1)*.55);
      if(Math.abs(id)%4!==0&&(Math.abs(z)<160||Math.abs(id)%7===1))yards.trees.push([x0+w*.20,wallZ-front*1.06,.74+noise(id,2,10)*.56]);
    }
  }
  return records;
}

// 石砌矮牆採錯縫花崗岩，每塊石面略有收分。沿坡逐段取高，入口留在石牆兩段之間。
function gardenWall(out,world,a,b,z,side,tall){
  if(b-a<.9)return;
  const layers=3,stoneShade=[[.42,.40,.35],[.51,.48,.41],[.39,.40,.36],[.53,.49,.43]];
  const P=(x,y,offset)=>[x,world.height(x,z)+y,z+side*offset];
  function panel(points,n,col){
    out.quad(...points,n,points.map(p=>[p[0]/2,p[1]/2]),col);
  }
  const face=(x0,x1,y0,y1,depth,col)=>{
    let pts=[P(x0,y0,depth),P(x1,y0,depth),P(x1,y1,depth),P(x0,y1,depth)];
    if(side<0)pts.reverse();panel(pts,[0,0,side],col);
  };
  face(a,b,-.06,tall,.0,[.26,.26,.24,0,1]);
  for(let row=0;row<layers;row++){
    let x=a;
    for(let j=0;x<b-.04;j++){
      const k=noise(Math.floor(a),row,j),next=Math.min(b,x+(j===0&&row%2?.46:1)*(.60+.48*k));
      const y0=tall*row/layers+.008,y1=tall*(row+1)/layers-.012;
      let pts=[P(x+.012,y0,.04+.02*k),P(next-.014,y0+.025*k,.045),P(next-.024,y1,.07),P(x+.024,y1-.018*k,.078)];
      if(side<0)pts.reverse();panel(pts,[0,.12,side],[...stoneShade[(j+row*3)%4],0,1]);x=next;
    }
  }
  let top=[P(a,tall+.02,.10),P(b,tall+.02,.10),P(b,tall+.02,-.40),P(a,tall+.02,-.40)];
  if(side<0)top.reverse();panel(top,[0,1,0],cap);
  for(const X of [a,b]){
    const points=[P(X,0,-.40),P(X,0,.08),P(X,tall,.08),P(X,tall,-.40)];
    if((X===b)=== (side>0))points.reverse();
    panel(points,[X===a?-1:1,0,0],plaster);
  }
}
export function buildShopYards(world,roof,box){
  const trees=[],shrubs=[],cars=[];
  const patch=(a,b,c,d,dy,col)=>{
    const p=[[a,d],[b,d],[b,c],[a,c]].map(([x,z])=>[x,world.height(x,z)+dy,z]);
    roof.quad(...p,[0,1,0],p.map(v=>[v[0]/4,v[2]/4]),col);
  };
  for(const [i,[x,z,w,d]] of HILL_LOTS.entries()){
    if(Math.abs(z)>60)continue;
    const side=Math.sign(z),front=Math.abs(z)-d/2,a=x-w*.5,b=x+w*.5,curb=10.44;
    const pave=(l,r,n,f,lift,col)=>patch(l,r,Math.min(n*side,f*side),Math.max(n*side,f*side),lift,col);
    pave(a-.4,b+.4,curb,front+1,.105,[.51,.50,.46,0,1]);
    const start=a+1,end=x-.76,back=front-1.1;
    pave(start-.20,end+.23,curb+.25,back,.128,[.33,.34,.33,0,1]);
    for(let X=start+.3;X<end-2.2;X+=2.78){
      const stop=back-1.0; // 車頭前方是止輪塊，外側留機甲行進的車道。
      if(stop-curb<4.9)continue;
      pave(X,X+.085,stop-4.75,stop+.42,.148,[.68,.66,.55,0,6]);
      const cz=(stop-.23)*side,cy=world.height(X+1.32,cz)+.14;
      box(roof,X+.65,X+2.0,cy,cy+.16,cz-.12,cz+.12,cap,2);
      if((Math.round((X-start)/2.78)+i)%3!==1)cars.push([X+1.34,(stop-2.5)*side,side*1.57+(i%3-1)*.045]);
    }
    const l=x+w*.16,r=b-.65,n=curb+1.48,f=Math.min(front-2.6,n+3.15);
    if(f>n+1.0){
      pave(l,r,n,f,.15,[.28,.25,.19,0,5]);
      gardenWall(roof,world,l,r,n*side,-side,.72+(i%3)*.13);
      for(let X=l+.85;X<r-.1;X+=1.6)shrubs.push([X,(n+.76)*side,.58+noise(i,X,3)*.18]);
      trees.push([l+(r-l)*.58,(f-.45)*side,1.0+noise(i,4,0)*.40]);
      if(i%3===1)trees.push([a+.60,(front-1.23)*side,.75]);
    }
    for(let X=x-.68;X<x+w*.15;X+=1.25)pave(X,X+.035,curb+.18,front-.4,.129,[.36,.35,.31,0,1]);
  }
  return {trees,shrubs,cars};
}
