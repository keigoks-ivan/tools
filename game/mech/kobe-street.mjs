// 神戶街層細節：公尺尺度的窗洞、石材路緣與排水設施，呼叫端合併進既有材質桶。
// 比例參考神戶觀光局明石町筋實景：https://www.feel-photo.info/a75/
import { gardenPlanting } from './kobe-autumn.js';
export function storefrontOpenings(length, style) {
  const count=style<2?(length>9?1:0):Math.min(3,Math.floor((length-2)/7)),radius=style<2?1.65:1.35;
  return Array.from({length:Math.max(0,count)},(_,i)=>({center:length*(i+.5)/count,radius,
    bottom:style<2?.08:.12,spring:style===2?1.75:style<2?3.12:2.8,arched:style===2}));
}

export function recessedFacade(out, { x0, x1, z0, z1, H, style, tint, phase = 0, exposed }, F) {
  const floor = F.h / F.rows, bay = F.w / F.cols, historic = style === 2;
  const sides = [[x0,z1,x1,z1,0], [x1,z1,x1,z0,2], [x1,z0,x0,z0,1], [x0,z0,x0,z1,3]];
  let u = phase;
  for (const [ax,az,bx,bz,side] of sides) {
    const length = Math.hypot(bx-ax,bz-az), dx=(bx-ax)/length, dz=(bz-az)/length, nx=-dz,nz=dx;
    const P = (a,y,depth=0) => [ax+dx*a+nx*depth,y,az+dz*a+nz*depth];
    const wall = (lo,hi,bot,top,depth=0) => {
      if(hi-lo<.001||top-bot<.001)return;
      out.wall(P(lo,bot,depth),P(hi,bot,depth),P(hi,top,depth),P(lo,top,depth),[nx,0,nz],
        [[u+lo/F.w,bot/F.h],[u+hi/F.w,bot/F.h],[u+hi/F.w,top/F.h],[u+lo/F.w,top/F.h]],tint);
    };
    if (!exposed[side]) wall(0,length,0,H);
    else {
      let prev=0;
      const shops=storefrontOpenings(length,style);
      if(shops.length) {
        const {bottom,spring,arched,radius}=shops[0],cap=spring+(arched?radius:0),depth=-.32;
        wall(0,length,0,bottom);let along=0;
        const reveal=[.43,.45,.42,0,1],shade=[.30,.33,.31,0,1];
        for(const {center}of shops) {
          const lo=center-radius,hi=center+radius;
          wall(along,lo,bottom,cap);along=hi;
          const edges=[[P(lo,bottom),P(hi,bottom),P(hi,bottom,depth),P(lo,bottom,depth)],
            [P(lo,bottom,depth),P(lo,spring,depth),P(lo,spring),P(lo,bottom)],
            [P(hi,bottom),P(hi,spring),P(hi,spring,depth),P(hi,bottom,depth)]];
          for(const [i,pts]of edges.entries())out.detail(...pts,i===2?shade:reveal);
          if(arched) {
            // 窗洞的弧頂和拱角都切成連續面；不留下矩形洞口的透明角落。
            for(let k=0;k<8;k++) {
              const t0=Math.PI-k*Math.PI/8,t1=Math.PI-(k+1)*Math.PI/8;
              const a=center+Math.cos(t0)*radius,b=center+Math.cos(t1)*radius,y0=spring+Math.sin(t0)*radius,y1=spring+Math.sin(t1)*radius;
              const pts=[P(a,y0),P(b,y1),P(b,cap),P(a,cap)];
              if(cap-y1<1e-5){pts[2]=P(a,cap);pts[3]=P(a,cap);}
              out.wall(...pts,[nx,0,nz],pts.map(p=>{
                const local=(p[0]-ax)*dx+(p[2]-az)*dz;return [u+local/F.w,p[1]/F.h];
              }),tint);
              out.detail(P(a,y0,depth),P(b,y1,depth),P(b,y1),P(a,y0),shade);
            }
          } else out.detail(P(lo,spring,depth),P(hi,spring,depth),P(hi,spring),P(lo,spring),shade);
        }
        wall(along,length,bottom,cap);prev=cap;
      }
      if(style<2||H>=45){wall(0,length,prev,H);u+=length/F.w;continue;}
      const first=bay*(Math.ceil(u*F.cols-.5)+.5-u*F.cols), ww=bay*(historic?.46:.64), wh=floor*(historic?.7:.6);
      const windows=[];
      for(let a=first;a<length;a+=bay)if(a-ww/2>.2&&a+ww/2<length-.2)windows.push([a-ww/2,a+ww/2]);
      for(let f=1;f<3&&f*floor+floor*.88<H;f++) {
        const bot=f*floor+floor*(historic?.18:.22),top=bot+wh;
        wall(0,length,prev,bot);let along=0;
        for(const [lo,hi] of windows) {
          wall(along,lo,bot,top);wall(lo,hi,bot,top,-.24);along=hi;
          const stone=historic?[.70,.68,.62,0,1]:[.57,.60,.59,0,1], dark=[.34,.37,.36,0,1];
          // 真正開洞：兩側、窗楣與窗台，玻璃退到牆內，所有面都朝向窗洞。
          for(const [a,b,c,d,col] of [
            [P(lo,bot),P(hi,bot),P(hi,bot,-.24),P(lo,bot,-.24),stone],
            [P(lo,top,-.24),P(hi,top,-.24),P(hi,top),P(lo,top),dark],
            [P(lo,bot,-.24),P(lo,top,-.24),P(lo,top),P(lo,bot),stone],
            [P(hi,bot),P(hi,top),P(hi,top,-.24),P(hi,bot,-.24),dark],
            [P(lo-.1,bot-.045,.17),P(hi+.1,bot-.045,.17),P(hi+.1,bot-.02),P(lo-.1,bot-.02),stone],
            [P(lo-.1,bot-.11,.17),P(hi+.1,bot-.11,.17),P(hi+.1,bot-.045,.17),P(lo-.1,bot-.045,.17),stone],
          ])out.detail(a,b,c,d,col);
        }
        wall(along,length,bot,top);prev=top;
      }
      wall(0,length,prev,H);
    }
    u+=length/F.w;
  }
}

export function kobeStreetDetails(out, segments) {
  const stone=[.67,.65,.60,0,1],steel=[.11,.15,.15,0,2],green=[.12,.26,.22,0,6];
  for(const [x,z,ry,length,width,ground=0,curbs=true] of segments) {
    const P=(u,y,v)=>[x+u*Math.cos(ry)+v*Math.sin(ry),ground+y,z-u*Math.sin(ry)+v*Math.cos(ry)];
    const plane=(lo,hi,y,a,b,col)=>{if(a>b)[a,b]=[b,a];out.face(P(lo,y,b),P(hi,y,b),P(hi,y,a),P(lo,y,a),col);};
    const block=(lo,hi,y0,y1,a,b,col)=>{
      const p=[P(lo,y0,a),P(hi,y0,a),P(hi,y0,b),P(lo,y0,b)], q=p.map(v=>[v[0],ground+y1,v[2]]);
      out.face(q[3],q[2],q[1],q[0],col);
      for(let i=0;i<4;i++){const j=(i+1)%4;out.face(p[j],p[i],q[i],q[j],col);}
    };
    const start=-length/2,end=length/2;
    for(const side of [-1,1]) {
      const edge=side*width/2;
      if(curbs)block(start,end,0,.13,edge-.13,edge+.13,stone);
      // 側溝底、鋼格柵與間隔設置的防護樁，留足通道和路口開口。
      plane(start,end,.017,edge-side*.4,edge-side*.14,[.21,.23,.22,0,1]);
      for(const u of [start+2,end-2]) {
        plane(u-.45,u+.45,.026,edge-side*.38,edge-side*.16,steel);
        for(let k=0;k<7;k++)plane(u-.4+k*.12,u-.36+k*.12,.031,edge-side*.38,edge-side*.16,[.45,.48,.46,0,2]);
      }
      for(const u of [start+3,end-3])block(u-.055,u+.055,.13,.92,edge+side*.7-.055,edge+side*.7+.055,green);
    }
    const center=[length*.16,0,-width*.17],r=.36;
    for(let i=0;i<12;i++) {
      const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;
      const A=P(center[0]+Math.cos(a)*r,.025,center[2]+Math.sin(a)*r),B=P(center[0]+Math.cos(b)*r,.025,center[2]+Math.sin(b)*r),C=P(center[0],.025,center[2]);
      out.face(C,B,A,A,[.24,.27,.27,0,2]);
    }
  }
}

// 街區前緣以 +Z 朝向道路；各項只輸出靜態面，路線、碰撞與地圖亂數由呼叫端保留。
export function kobeBlockStreets(out, { frontages = [], parking = [], service = [], bicycles = [], planters = [], utilities = [] } = {}) {
  const stone=[.59,.58,.54,0,8],kerb=[.66,.65,.59,0,1],dark=[.13,.16,.16,0,2],steel=[.43,.47,.45,0,2];
  const paint=[.67,.68,.61,0,6],ochre=[.66,.48,.16,0,6],green=[.15,.24,.18,0,6];
  let faces=0;
  const face=(a,b,c,d,col)=>{out.face(a,b,c,d,col);faces++;};
  const local=({x,z,ry=0,ground=.025})=>(u,y,v)=>[x+u*Math.cos(ry)+v*Math.sin(ry),ground+y,z-u*Math.sin(ry)+v*Math.cos(ry)];
  const plane=(P,a,b,y,c,d,col)=>face(P(a,y,d),P(b,y,d),P(b,y,c),P(a,y,c),col);
  function block(P,a,b,y0,y1,c,d,col) {
    const p=[P(a,y0,c),P(b,y0,c),P(b,y0,d),P(a,y0,d)],q=p.map(v=>[v[0],v[1]+y1-y0,v[2]]);
    face(q[3],q[2],q[1],q[0],col);
    for(let i=0;i<4;i++){const j=(i+1)%4;face(p[j],p[i],q[i],q[j],col);}
  }
  function beam(a,b,r,col,sides=4) {
    const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d);if(len<.0001)return;
    const n=d.map(v=>v/len),ref=Math.abs(n[1])<.9?[0,1,0]:[1,0,0];
    const u=[n[1]*ref[2]-n[2]*ref[1],n[2]*ref[0]-n[0]*ref[2],n[0]*ref[1]-n[1]*ref[0]],ul=Math.hypot(...u);
    for(let i=0;i<3;i++)u[i]/=ul;
    const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    const at=(p,t)=>p.map((q,i)=>q+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
    for(let i=0;i<sides;i++){const a0=i/sides*Math.PI*2,a1=(i+1)/sides*Math.PI*2;face(at(a,a0),at(a,a1),at(b,a1),at(b,a0),col);}
  }
  function drain(P,u,v,y=0) {
    plane(P,u-.43,u+.43,y+.026,v-.15,v+.15,dark);
    for(let k=0;k<7;k++)plane(P,u-.39+k*.12,u-.355+k*.12,y+.03,v-.13,v+.13,steel);
    for(const d of [-.15,.13])plane(P,u-.43,u+.43,y+.031,v+d,v+d+.02,steel);
  }
  for(const site of frontages) {
    const {length,depth=1.4,kind='shopping',gaps=[],curb=true}=site,P=local(site),a=-length/2,b=length/2;
    const spans=[];let from=a;
    for(const [lo,hi]of [...gaps].sort((p,q)=>p[0]-q[0])){if(lo>from)spans.push([from,Math.min(b,lo)]);from=Math.max(from,hi);}
    if(from<b)spans.push([from,b]);
    const tone=kind==='service'?[.44,.46,.44,0,8]:kind==='residential'?[.55,.55,.51,0,8]:stone;
    plane(P,a,b,.019,0,depth,tone);
    // 鋪面尺寸與牆腳接觸帶，避免步道是一大片沒有尺度的底色。
    plane(P,a,b,.023,0,.065,[.29,.32,.3,0,1]);
    const spacing=kind==='service'?3:kind==='residential'?2.4:1.5;
    for(let u=a+spacing;u<b-.1;u+=spacing)plane(P,u,u+.012,.024,.08,depth-.08,[.40,.41,.38,0,8]);
    for(const [lo,hi]of spans) {
      if(hi-lo<.2)continue;
      if(curb)block(P,lo,hi,-.12,.018,depth-.1,depth+.08,kerb);
      plane(P,lo,hi,.018,depth+.08,depth+.37,[.28,.30,.29,0,1]);
      for(let u=lo+1.6;u<hi-.3;u+=2.4)plane(P,u,u+.015,.023,depth-.09,depth+.35,[.36,.38,.35,0,1]);
      for(let u=lo+2;u<hi-1;u+=11)drain(P,u,depth+.22);
      if(kind!=='service')for(let u=lo+4;u<hi-2;u+=13) {
        plane(P,u-.2,u+.2,.026,.48,.86,dark);
        for(const d of [.5,.82])plane(P,u-.18,u+.18,.029,d,d+.02,steel);
      }
    }
  }
  for(const site of parking) {
    const {stalls=3,bayWidth=2.5,bayDepth=5}=site,P=local(site),w=stalls*bayWidth;
    plane(P,-.15,w+.15,.021,-.15,bayDepth+.45,[.26,.28,.28,0,6]);
    for(let i=0;i<=stalls;i++)plane(P,i*bayWidth-.035,i*bayWidth+.035,.028,0,bayDepth,paint);
    plane(P,0,w,.028,bayDepth-.07,bayDepth,paint);
    for(let i=0;i<stalls;i++) {
      const u=(i+.5)*bayWidth;
      block(P,u-.48,u+.48,.024,.14,bayDepth-.68,bayDepth-.5,kerb);
      plane(P,u-.36,u+.36,.029,.1,.23,paint);
    }
    drain(P,w+.08,bayDepth-.2);
  }
  for(const site of service) {
    const {length,width=3.2}=site,P=local(site),a=-length/2,b=length/2;
    plane(P,a,b,.022,0,width,[.40,.42,.40,0,8]);
    for(const v of [.15,width-.15])plane(P,a,b,.028,v,v+.08,ochre);
    for(let u=a+.7;u<b;u+=1.4)plane(P,u,u+.07,.028,.15,Math.min(width-.15,1.0),ochre);
    for(let u=a+3;u<b;u+=12)drain(P,u,width-.42);
  }
  for(const site of utilities) {
    const P=local(site),col=site.kind==='power'?[.49,.53,.49,0,6]:[.56,.57,.52,0,6];
    block(P,-.37,.37,.05,1.25,-.12,.25,col);
    block(P,-.41,.41,1.25,1.32,-.16,.28,steel);
    for(const u of [-.31,.0,.31])beam(P(u,.15,.257),P(u,1.17,.257),.008,dark);
    block(P,.2,.23,.65,.83,.252,.29,steel);
    for(let y=.24;y<.51;y+=.08)planePanel(P,-.26,.26,y,y+.016,.259,dark);
    beam(P(-.27,1.28,-.08),P(-.27,1.8,-.08),.02,steel);
  }
  function planePanel(P,a,b,y0,y1,v,col){face(P(a,y0,v),P(b,y0,v),P(b,y1,v),P(a,y1,v),col);}
  for(const site of planters) {
    const {length=1.8}=site,P=local(site),a=-length/2,b=length/2;
    block(P,a,b,.02,.44,-.3,.3,[.48,.48,.43,0,1]);
    plane(P,a+.08,b-.08,.445,-.22,.22,[.18,.17,.13,0,6]);
    for(const v of [-.3,.23])block(P,a-.035,b+.035,.43,.49,v,v+.07,kerb);
    gardenPlanting({face},{sites:[{...site,ground:(site.ground??.025)+.445,length:Math.max(.1,length-.16),width:.44,height:.38}]});
  }
  for(const site of bicycles) {
    const {count=2}=site,P=local(site);
    for(let i=0;i<count;i++) {
      const v=i*.58,frame=i%2?[.30,.36,.34,0,2]:[.47,.33,.25,0,6];
      for(const u of [-.60,.60]) {
        for(let k=0;k<12;k++) {
          const a=k/12*Math.PI*2,b=(k+1)/12*Math.PI*2;
          const at=(t,r,d)=>P(u+Math.cos(t)*r,.36+Math.sin(t)*r,v+d);
          for(const d of [-.025,.025]) {
            const pts=[at(a,.35,d),at(b,.35,d),at(b,.31,d),at(a,.31,d)];if(d<0)pts.reverse();face(...pts,dark);
          }
          face(at(a,.35,-.025),at(b,.35,-.025),at(b,.35,.025),at(a,.35,.025),dark);
          beam(P(u,.36,v),at(a,.3,0),.005,steel,3);
        }
      }
      const points=[[-.6,.36],[-.28,.77],[.16,.36],[.39,.83],[.6,.36]];
      for(const [a,b]of [[0,1],[1,2],[2,0],[1,3],[3,2],[3,4]])beam(P(points[a][0],points[a][1],v),P(points[b][0],points[b][1],v),.021,frame);
      beam(P(-.28,.70,v),P(-.28,.92,v),.023,steel);
      block(P,-.43,-.13,.90,.95,v-.075,v+.075,dark);
      beam(P(.39,.83,v),P(.43,1.03,v),.021,steel);
      beam(P(.43,1.03,v-.20),P(.43,1.03,v+.20),.018,steel);
      beam(P(.16,.36,v-.12),P(.16,.36,v+.12),.014,steel);
    }
    for(const u of [-.85,.85]) {
      beam(P(u,0,-.24),P(u,.55,-.24),.026,steel);
      beam(P(u,.55,-.24),P(u,.64,-.1),.026,steel);
      beam(P(u,.64,-.1),P(u,.55,.1),.026,steel);
      beam(P(u,.55,.1),P(u,0,.1),.026,steel);
    }
  }
  return {frontages:frontages.length,parking:parking.length,service:service.length,bicycles:bicycles.reduce((n,s)=>n+(s.count??2),0),planters:planters.length,utilities:utilities.length,triangles:faces*2};
}
