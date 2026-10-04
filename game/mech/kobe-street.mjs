// 神戶街層細節：公尺尺度的窗洞、石材路緣與排水設施，呼叫端合併進既有材質桶。
// 比例參考神戶觀光局明石町筋實景：https://www.feel-photo.info/a75/
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
    if (style<2 || H>=45 || !exposed[side]) wall(0,length,0,H);
    else {
      const first=bay*(Math.ceil(u*F.cols-.5)+.5-u*F.cols), ww=bay*(historic?.46:.64), wh=floor*(historic?.7:.6);
      const windows=[];
      for(let a=first;a<length;a+=bay)if(a-ww/2>.2&&a+ww/2<length-.2)windows.push([a-ww/2,a+ww/2]);
      let prev=0;
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
