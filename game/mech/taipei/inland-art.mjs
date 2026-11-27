import {creekX} from './inland.mjs';

// All surfaces below are submitted to the district's existing static geometry batches.
export function buildInland({w,B,quad,tile,uv,paint,piece,skin,course,tree,rand,landmark}){
  const h=(x,z)=>w.height(x,z);
  const timber=paint(0x594a39),iron=paint(0x53635b),ash=paint(0x898277),eaves=paint(0x474943),chalk=paint(0xd5c5a8);
  const collide=(x,z,width,depth,top,base)=>w.addCollider({x0:x-width/2,x1:x+width/2,z0:z-depth/2,z1:z+depth/2,top,...(base===undefined?{}:{bottom:base})});
  function ribbon(points,width,b,color,lift=.1){
    let distance=0;
    for(let i=1;i<points.length;i++){
      const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),nx=-dz/len*width/2,nz=dx/len*width/2;
      const steps=Math.ceil(len/8);
      for(let j=0;j<steps;j++){
        const p=(s,side)=>{const x=ax+dx*s+nx*side,z=az+dz*s+nz*side;return [x,h(x,z)+lift,z];};
        const v=(distance+j*len/steps)/6;
        quad(b,[p(j/steps,1),p((j+1)/steps,1),p((j+1)/steps,-1),p(j/steps,-1)],[[0,v],[0,v+len/steps/6],[width/6,v+len/steps/6],[width/6,v]],color);
      }
      distance+=len;
    }
  }
  function house(x,z,width,depth,wall,style,bath=false){
    const y=h(x,z),peak=Math.min(width*.33,7),lo=y+wall,a=width/2+1.1,d=depth/2+1.2;
    piece(x,y-.6,z,width+.6,.9,depth+.6,ash);
    if(bath){skin(B.face,x,z,width,depth,y+.3,y+wall*.49,0,3,5);skin(B.face,x,z,width,depth,y+wall*.49,lo,1,3,5);}
    else skin(B.face,x,z,width,depth,y+.3,lo,style,Math.ceil(width/9),Math.ceil(depth/10));
    for(const side of [-1,1]){
      const edge=x+side*a;
      const p=[[edge,lo,z-d],[edge,lo,z+d],[x,lo+peak,z+d],[x,lo+peak,z-d]];
      if(side>0)p.reverse();
      // Keep the rows of clay tiles at architectural scale along the length of each pitch.
      for(let k=0,n=Math.ceil(depth/9);k<n;k++){
        const t=p.map(([px,py,pz])=>[px,py,z-d+2*d*(k+(pz>z?1:0))/n]);quad(B.face,t,tile(2),[.8,.84,.84]);
      }
      piece(edge,lo-.22,z,.32,.42,depth+2.4,eaves);
      const zz=z+side*depth/2;
      let end=[[x-width/2,lo,zz],[x+width/2,lo,zz],[x,lo+peak,zz],[x,lo+peak,zz]];
      if(side<0)end=[end[1],end[0],end[2],end[3]];
      quad(B.trim,end,uv,bath?chalk:ash);
    }
    piece(x,lo+peak-.15,z,.48,.35,depth+2.6,eaves);
    collide(x,z,width,depth,lo+peak);
  }
  function fence(a,b,spacing,color){
    const dx=b[0]-a[0],dz=b[1]-a[1],steps=Math.ceil(Math.hypot(dx,dz)/spacing);
    for(let k=0;k<=steps;k++){
      const x=a[0]+dx*k/steps,z=a[1]+dz*k/steps,y=h(x,z);
      piece(x,y-.1,z,.42,1.95,.42,color);
      if(k===steps)continue;
      const xx=x+dx/steps,zz=z+dz/steps,yy=h(xx,zz);
      for(const top of [.78,1.48]){
        const p=[[x,y+top,z],[xx,yy+top,zz],[xx,yy+top+.14,zz],[x,y+top+.14,z]];
        quad(B.trim,p,uv,color);quad(B.trim,p.slice().reverse(),uv,color);
      }
    }
  }
  function trailSign(x,z,index,width){
    const y=h(x,z),top=y+3.7,low=top-width*.38;
    for(const dx of [-width*.34,width*.34])piece(x+dx,y-.1,z,.18,3.65,.2,timber);
    piece(x,low-.09,z,width+.2,top-low+.18,.26,eaves);
    for(const side of [-1,1]){
      const zz=z+.14*side,a=x-width*side/2,b=x+width*side/2;
      quad(B.signs,[[a,low,zz],[b,low,zz],[b,top,zz],[a,top,zz]],tile(index,4));
    }
  }
  const route=w.fieldRoute,scene=route.district;
  if(scene==='beitou'){
    for(let z=-870;z<870;z+=6){
      const a=creekX(z),b=creekX(z+6);
      const pts=[[a-16,-.45,z],[b-16,-.45,z+6],[b+16,-.45,z+6],[a+16,-.45,z]];
      quad(B.water,pts,pts.map(([x,y,zz])=>[x/13,zz/13]),[.83,1,.94]);
      for(const s of [-1,1]){
        const x=a+s*(22+rand()*5),zz=z+rand()*5;
        course(B.stone,x,zz,h(x,zz)-.7,1.9+rand()*2,1.6,1.4,ash,7,.76,rand()*3);
        if(z%18===0)tree(a+s*(34+rand()*12),z);
      }
    }
    for(const s of [-1,1]){
      const bank=[];for(let z=-570;z<=570;z+=12)bank.push([creekX(z)+s*71,z]);
      ribbon(bank,24,B.road,[.8,.8,.75]);
      for(let z=-520;z<520;z+=40){
        if(s<0&&Math.abs(z+325)<44)continue;
        const x=creekX(z)+s*(125+rand()*17);house(x,z,13+rand()*8,17+rand()*9,5+rand()*5,1);
        for(let j=0;j<5;j++)tree(x+s*(18+rand()*88),z+rand()*40);
      }
    }
    for(const z of [-242,63,362]){
      const x=creekX(z);piece(x,-.3,z,160,.65,15,ash);
      collide(x,z,160,15,.35,-.3);
      for(const side of [-1,1]){
        for(let k=-76;k<=76;k+=8)piece(x+k,.34,z+side*7.3,.52,1.35,.55,chalk);
        piece(x,1.54,z+side*7.3,157,.25,.35,chalk);
      }
    }
    house(-118,-325,32,58,12,0,true);
    for(let k=-24;k<=24;k+=6){
      piece(-98,.2,-325+k,.5,6.4,.5,timber);
      piece(-98,6.8,-325+k,.25,4.7,.25,timber);
    }
    piece(-98,7.7,-325,.15,.2,57,timber);piece(-100,11.4,-325,6,.45,59,eaves);
    piece(-100,6.4,-325,6,.4,58,timber);
    for(const [x,z,i] of [[-63,-446,1],[-95,-348,2],[82,-240,0],[-57,71,3]])trailSign(x,z,i,5);
    // Trees cluster on the outer slopes, leaving clear sightlines at the crossings.
    for(let j=0;j<390;j++){
      const z=rand()*1360-680,s=j%2?1:-1,x=creekX(z)+s*(168+rand()*205);
      tree(x,z);
    }
    landmark('溫泉浴場',-118,18,-325);
  }else if(scene==='songyan'){
    const lot=(x,z,width,depth,material,color,y=.03)=>{
      const p=[[x-width/2,y,z-depth/2],[x-width/2,y,z+depth/2],[x+width/2,y,z+depth/2],[x+width/2,y,z-depth/2]];
      quad(material,p,p.map(([px,py,pz])=>[px/10,pz/10]),color);
    };
    lot(-20,-68,1000,155,B.road,[.72,.7,.64]);
    lot(-213,-187,125,90,B.road,[.69,.68,.61]);
    for(const s of [-1,1])for(let i=0;i<16;i++){
      const x=-568+i*76+rand()*22,z=s*(324+rand()*42),y=h(x,z),width=19+rand()*18,depth=22+rand()*15,stories=3+Math.floor(rand()*7);
      for(let floor=0;floor<stories;floor++){
        const yy=y+floor*3.4;
        skin(B.face,x,z,width,depth,yy,yy+3.4,3,Math.ceil(width/5),Math.ceil(depth/5),[.82,.86,.81]);
        piece(x,yy+3.13,z,width+.6,.27,depth+.6,ash);
      }
      piece(x,y+stories*3.4,z,width+.55,.5,depth+.55,chalk);
      collide(x,z,width,depth,y+stories*3.4+.5);
    }
    ribbon(route.pts,25,B.road,[.91,.86,.75]);
    // Five separated warehouse roofs leave the old loading lanes open.
    for(const [x,z] of [[-384,-61],[-246,-61],[-81,-61],[65,-61],[242,-61]]){
      house(x,z,34,76,9,4);
      piece(x+19,3.7,z,5.2,.28,75,iron);
      for(let j=-33;j<=33;j+=11)piece(x+21,.2,z+j,.28,3.6,.28,iron);
    }
    house(-225,-189,40,52,13,3);
    course(B.trim,-195,-187,0,4.1,49,2.3,paint(0x916958),16);
    for(let j=5;j<49;j+=6)course(B.trim,-195,-187,j,4.2-j*.037,.28,4.2-j*.037,iron,16);
    landmark('鍋爐房',-195,50,-187);
    for(const [x,z,ww,dd] of [[-42,180,34,156],[92,180,34,156],[25,240,101,26],[25,120,101,26],[416,-112,58,92]])house(x,z,ww,dd,11,3);
    lot(26,180,100,85,B.stone,[.88,.84,.74]);
    for(const xx of [4,47])for(const zz of [163,197]){
      const green=paint(0x586a45);
      for(const s of [-1,1]){
        piece(xx+s*13,.1,zz,2.2,1.15,21,green);
        piece(xx,.1,zz+s*9.5,26,1.15,2.2,green);
      }
      tree(xx,zz);
    }
    course(B.stone,26,180,.04,6.5,.65,6.8,ash,24);
    course(B.water,26,180,.68,6.15,.02,6.15,iron,24);
    for(let x=-74;x<222;x+=6){
      piece(x,.15,74,2.5,.17,5.8,timber);
    }
    for(const z of [72,76])piece(74,.32,z,296,.2,.22,iron);
    const pond=[[202,.18,113],[202,.18,205],[292,.18,218],[299,.18,120]];
    quad(B.water,pond,pond.map(([x,y,z])=>[x/11,z/11]),[.76,.92,.77]);
    for(let k=0;k<50;k++){const x=201+rand()*94;tree(x,218+rand()*18);if(k%3===0)tree(195-rand()*12,122+rand()*80);}
    for(let x=-530;x<=503;x+=22)tree(x,-246+rand()*4);
    for(const x of [-132,-102,-72,205,235,265])for(let z=-15;z<=47;z+=16)tree(x,z);
    for(const [x,z,i] of [[-476,-134,4],[-359,-98,5],[-214,-158,6],[210,106,7]])trailSign(x,z,i,6);
    landmark('生態景觀池',245,2,160);
  }else{
    ribbon(route.pts,5.6,B.stone,[.87,.84,.71],.17);
    for(let i=1;i<route.pts.length;i++){
      const [a,b]=route.pts[i-1],[x,z]=route.pts[i];
      fence([a-7,b+7],[x-7,z+7],7.5,timber);
    }
    const gx=-168,gz=-286,y=h(gx,gz);
    for(const s of [-1,1]){
      const x=gx+s*4.5;
      skin(B.face,x,gz,3.7,4,y-.6,y+4.3,5);collide(x,gz,3.7,4,y+4.3);
      piece(x,y+4.3,gz,4.15,.45,4.45,ash);
    }
    skin(B.face,gx,gz,12.7,4,y+4.1,y+6.5,5);piece(gx,y+6.5,gz,13.4,.5,4.7,ash);
    collide(gx,gz,12.7,4,y+7,y+4.1);landmark('金包里大路城門',gx,y+7,gz);
    for(let i=0;i<270;i++){
      const x=rand()*1240-620,z=rand()*1240-620,r=.8+rand()*3;
      course(B.stone,x,z,h(x,z)-r*.4,r,r*1.1,r*.61,ash,6,.7+rand()*.5,rand()*6);
    }
    for(let i=0;i<2650;i++){
      const x=(rand()-.5)*1180,z=(rand()-.5)*1240,y=h(x,z),height=.7+rand()*1.2;
      const c=paint(i%4?0x88915e:0xc0aa75);
      for(let j=0;j<3;j++){
        const off=j*.42;
        quad(B.trim,[[x+off-.14,y,z],[x+off+.14,y,z+.05],[x+off+.45,height+y,z+.3],[x+off+.39,height+y,z+.3]],uv,c);
      }
    }
    for(const [x,z,i] of [[-365,-402,8],[-157,-281,9],[118,-77,10],[228,276,11]])trailSign(x,z,i,4.4);
    house(247,279,13,15,4,1);
  }
}
