// 神戶港的紅磚倉庫、舊信號所、客船與岸壁。實景參考：
// https://www.feel-photo.info/b47/ 、https://www.feel-photo.info/b56/
// 只輸出靜態面，呼叫端併入既有建材；沒有額外貼圖、燈光或逐格更新。
const brick=[.56,.29,.17,0,7],stone=[.62,.62,.56,0,1],roof=[.19,.23,.23,0,3];
const green=[.12,.28,.23,0,6],blue=[.065,.15,.25,0,6],white=[.8,.82,.77,0,6];
const steel=[.2,.25,.26,0,2],glass=[.075,.15,.18,0,4],rubber=[.055,.065,.065,0,6],wood=[.32,.24,.16,0,5];

function part(out,x,z,ry=0,scale=1,ground=0) {
  const c=Math.cos(ry),s=Math.sin(ry);
  const P=(u,y,v)=>[x+(u*c+v*s)*scale,ground+y*scale,z+(-u*s+v*c)*scale];
  const F=(a,b,c,d,col)=>out.face(...[a,b,c,d].map(p=>P(...p)),col);
  const B=(x0,x1,y0,y1,z0,z1,col)=>{
    F([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],col);
    F([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],col);
    F([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],col);
    F([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],col);
    F([x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0],col);
  };
  function beam(a,b,r,col,sides=4) {
    const d=b.map((v,i)=>v-a[i]),L=Math.hypot(...d);if(L<.001)return;
    const n=d.map(v=>v/L),ref=Math.abs(n[1])<.9?[0,1,0]:[1,0,0];
    const u=[n[1]*ref[2]-n[2]*ref[1],n[2]*ref[0]-n[0]*ref[2],n[0]*ref[1]-n[1]*ref[0]],ul=Math.hypot(...u);
    for(let i=0;i<3;i++)u[i]/=ul;
    const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    const at=(p,t)=>p.map((q,i)=>q+r*(u[i]*Math.cos(t)+v[i]*Math.sin(t)));
    for(let i=0;i<sides;i++)F(at(a,i/sides*Math.PI*2),at(a,(i+1)/sides*Math.PI*2),at(b,(i+1)/sides*Math.PI*2),at(b,i/sides*Math.PI*2),col);
  }
  function ring(cx,y,cz,r,t,col,sides=12) {
    for(let i=0;i<sides;i++) {
      const a=i/sides*Math.PI*2,b=(i+1)/sides*Math.PI*2;
      const p=(r,a)=>[cx+Math.cos(a)*r,y,cz+Math.sin(a)*r];
      F(p(r-t,a),p(r-t,b),p(r+t,b),p(r+t,a),col);
    }
  }
  return {P,F,B,beam,ring};
}

// 拱窗使用真正弧形窗頭、厚窗套與退後的玻璃；前景倉庫與遠景倉庫共用相同尺度。
export function harborWindow(out,x,z,{ry=0,base=.45,spring=2.9,radius=1.1,color=blue,detail=true}={}) {
  const {F,B}=part(out,x,z,ry),N=detail?8:6;
  F([-radius,base,.035],[radius,base,.035],[radius,spring,.035],[-radius,spring,.035],glass);
  for(let i=0;i<N;i++) {
    const a=i/N*Math.PI,b=(i+1)/N*Math.PI;
    const arc=(r,t,d)=>[Math.cos(t)*r,spring+Math.sin(t)*r,d];
    const p=arc(radius,a,.035),q=arc(radius,b,.035);
    F([0,spring,.035],p,q,q,glass);
    if(detail) {
      F(arc(radius,a,.2),arc(radius+.22,a,.2),arc(radius+.22,b,.2),arc(radius,b,.2),brick);
      F(arc(radius,a,.035),arc(radius,a,.2),arc(radius,b,.2),arc(radius,b,.035),color);
    }
    F(arc(radius-.1,a,.08),arc(radius,a,.08),arc(radius,b,.08),arc(radius-.1,b,.08),color);
  }
  const frame=(a,b,c,d,e,f,col)=>detail?B(a,b,c,d,e,f,col):F([a,c,f],[b,c,f],[b,d,f],[a,d,f],col);
  for(const u of [-radius,0,radius])frame(u-.045,u+.045,base,spring,.045,.16,color);
  for(const y of [base,spring,base+(spring-base)*.5])frame(-radius,radius,y-.04,y+.04,.045,.16,color);
  for(const u of [-radius-.18,radius+.04])frame(u,u+.14,base-.08,spring,.04,.2,brick);
  if(detail)B(-radius-.25,radius+.25,base-.16,base-.06,.01,.32,stone);
  else F([-radius-.25,base-.16,.32],[radius+.25,base-.16,.32],[radius+.25,base-.06,.32],[-radius-.25,base-.06,.32],stone);
  if(radius>1.3)B(.12,.15,1,1.35,.16,.24,steel);
}

export function kobeHarborScenery(out,{warehouses=[],signal=null,launches=[],quays=[],moorings=[]}={}) {
  for(const [x,z,length=88,depth=16,ry=0,h=6.7] of warehouses) {
    const {F,B,beam}=part(out,x,z,ry),lo=-length/2,hi=length/2,d=depth/2,top=h+2.4;
    B(lo,hi,0,h,-d,d,brick);
    // 黑灰色雙坡屋面、山牆、棟瓦與外伸檐口；不是無細節的平頂紅盒。
    for(const side of [-1,1]) {
      const pts=[[lo-.35,h,side*(d+.45)],[hi+.35,h,side*(d+.45)],[hi+.35,top,0],[lo-.35,top,0]];
      if(side<0)pts.reverse();F(...pts,roof);
      B(lo-.4,hi+.4,h-.18,h,side*d-.12,side*d+.12,green);
      B(lo-.15,hi+.15,.02,.32,side*d-.12,side*d+.12,stone);
      B(lo-.18,hi+.18,h-.75,h-.57,side*d-.08,side*d+.12,brick);
      const seam=[[lo,h-.57,side*(d+.125)],[hi,h-.57,side*(d+.125)],[hi,h-.51,side*(d+.125)],[lo,h-.51,side*(d+.125)]];
      if(side<0)seam.reverse();F(...seam,steel);
      const deck=[[lo,.08,side*d],[hi,.08,side*d],[hi,.08,side*(d+3)],[lo,.08,side*(d+3)]];
      if(side>0)deck.reverse();F(...deck,wood);
      for(let u=lo+12;u<hi-5;u+=26) {
        const v=side*(d+1.5);
        B(u-1.2,u+1.2,.08,.52,v-.4,v+.4,wood);
        F([u-1.1,.54,v+.3],[u+1.1,.54,v+.3],[u+1.1,.54,v-.3],[u-1.1,.54,v-.3],[.12,.105,.065,0,5]);
        for(const a of [-.65,0,.65]) {
          const leaf=[[u+a-.33,.53,v],[u+a,.98,v-.2],[u+a+.33,.53,v],[u+a+.33,.53,v]];
          F(...leaf,[.12,.21,.085,0,6]);F(leaf[2],leaf[1],leaf[0],leaf[0],[.17,.26,.095,0,6]);
        }
      }
      for(let u=lo+5.5;u<hi-4;u+=11.5) {
        const center=part(out,x,z,ry).P(u,0,side*d);
        harborWindow(out,center[0],center[2],{ry:ry+(side<0?Math.PI:0),color:side<0?blue:green,detail:false});
        B(u-1.8,u+1.8,h-.55,h-.25,side*d-.05,side*d+.05,brick);
        B(u+3.7,u+4.06,.32,h-.25,side*d-.08,side*d+.1,brick);
      }
      // 支撐雨棚的三角鋼架、綠漆排水管與牆面燈罩。
      for(let u=lo+2;u<hi;u+=13) {
        beam([u,h-.12,side*d],[u,h-.12,side*(d+1.8)],.055,green);
        beam([u,h-1.4,side*d],[u,h-.12,side*(d+1.8)],.055,green);
        beam([u,.1,side*(d+.13)],[u,h-.12,side*(d+.13)],.065,green,6);
        beam([u+2,3.8,side*(d+.2)],[u+2,3.8,side*(d+.85)],.035,steel);
        B(u+1.8,u+2.2,3.57,3.72,side*(d+.75)-.15,side*(d+.75)+.15,steel);
      }
      const canopy=[[lo,h-.05,side*(d+.12)],[hi,h-.05,side*(d+.12)],[hi,h-.48,side*(d+1.85)],[lo,h-.48,side*(d+1.85)]];
      if(side>0)canopy.reverse();F(...canopy,[.59,.55,.36,0,6]);F(...canopy.slice().reverse(),[.42,.4,.27,0,6]);
      beam([lo,h-.48,side*(d+1.85)],[hi,h-.48,side*(d+1.85)],.08,green);
    }
    for(const u of [lo,hi]) {
      if(u===lo)F([u,h,d],[u,top,0],[u,h,-d],[u,h,-d],brick);
      else F([u,h,-d],[u,top,0],[u,h,d],[u,h,d],brick);
      beam([u,h,-d],[u,top,0],.13,stone);beam([u,top,0],[u,h,d],.13,stone);
      const p=part(out,x,z,ry).P(u,0,0);harborWindow(out,p[0],p[2],{ry:ry+(u===hi?Math.PI/2:-Math.PI/2),base:.1,spring:3,radius:1.6,color:green,detail:false});
      for(let i=0;i<8;i++) {
        const a=i/8*Math.PI*2,b=(i+1)/8*Math.PI*2,at=(r,t)=>[u+(u===hi?.025:-.025),h+.45+Math.sin(t)*r,Math.cos(t)*r];
        const pts=[at(.36,a),at(.36,b),at(.58,b),at(.58,a)];if(u===lo)pts.reverse();F(...pts,stone);
        const disk=[[u+(u===hi?.018:-.018),h+.45,0],at(.35,a),at(.35,b),at(.35,b)];
        if(u===hi)F(disk[0],disk[2],disk[1],disk[1],glass);else F(...disk,glass);
      }
    }
    beam([lo-.4,top,0],[hi+.4,top,0],.15,roof,6);
    for(let u=lo;u<hi;u+=4)for(const side of [-1,1])beam([u,top+.025,0],[u,h+.025,side*d],.018,steel);
  }

  if(signal) {
    const [x,z,scale=1,ground=0]=signal,{F,B,beam,ring}=part(out,x,z,0,scale,ground);
    // 舊神戶港信號所的石造下部、開放鋼格構、八角值班室與兩道橫桁。
    const R=(r,y,i)=>[Math.cos(i/8*Math.PI*2)*r,y,Math.sin(i/8*Math.PI*2)*r];
    for(let i=0;i<8;i++) {
      F(R(2.7,0,i),R(2,5.4,i),R(2,5.4,i+1),R(2.7,0,i+1),stone);
      F(R(1.5,13.3,i),R(1.5,15.1,i),R(1.5,15.1,i+1),R(1.5,13.3,i+1),glass);
      beam(R(1.52,13.3,i),R(1.52,15.1,i),.055,white);
      F(R(1.65,15.1,i),R(.8,17.3,i),R(.8,17.3,i+1),R(1.65,15.1,i+1),green);
    }
    for(const side of [-1,1])for(const v of [-1,1]) {
      beam([side*1.35,5.4,v*1.35],[side*1.35,13,v*1.35],.065,green);
      for(let y=5.4;y<12.5;y+=2.5) {
        beam([side*1.35,y,v*1.35],[-side*1.35,y+2.5,v*1.35],.045,green);
        beam([side*1.35,y,v*1.35],[side*1.35,y+2.5,-v*1.35],.045,green);
      }
    }
    for(const y of [5.4,8,10.6,13])ring(0,y,0,1.9,.06,green,8);
    B(-.9,.9,5.4,13,-.9,.9,white);ring(0,13,0,2.12,.22,green,8);ring(0,15.15,0,1.63,.08,green,8);
    for(let i=0;i<8;i++)beam(R(2.15,13,i),R(2.15,13.8,i),.03,green);
    ring(0,13.8,0,2.15,.045,green,8);
    for(const side of [-1,1]) {
      beam([side*.7,17.1,0],[side*.15,29.8,0],.055,green);
      for(let y=18;y<29;y+=1)beam([side*.6*(30-y)/12,y,0],[-side*.6*(29-y)/12,y+1,0],.03,green);
    }
    for(const [y,w] of [[22.2,3.8],[27.2,2]]) {
      beam([-w,y,0],[w,y,0],.055,green);beam([-w,y+.42,0],[w,y+.42,0],.035,green);
      for(let u=-w;u<w;u+=.7)beam([u,y,0],[Math.min(u+.7,w),y+.42,0],.025,green);
      for(const side of [-1,1])beam([side*w,y,0],[side*w,14.4,0],.009,steel);
    }
    for(const y of [28,28.7,29.4])ring(0,y,0,.4,.025,green,8);
    beam([0,29.6,0],[0,31,0],.035,green);
    for(const side of [-1,1])B(side*2.14-.42,side*2.14+.42,.6,3.9,-1.67,-1.61,glass);
  }

  for(const [x,z,ry=0,scale=1] of launches) {
    const {F,B,beam,ring}=part(out,x,z,ry,scale,-1),N=20;
    // 水線以下收窄、圓弧船首與方艉；上層不是疊放在方盒船殼上的白積木。
    const hull=(i,r,y)=>{const t=i/N*Math.PI*2;return [Math.cos(t)*r,y,Math.sin(t)*(Math.sin(t)>0?19:14)];};
    for(let i=0;i<N;i++) {
      F(hull(i,3.2,-1.8),hull(i,4.7,2.3),hull(i+1,4.7,2.3),hull(i+1,3.2,-1.8),[.15,.22,.24,0,6]);
      F(hull(i,4.72,1.6),hull(i,4.72,2),hull(i+1,4.72,2),hull(i+1,4.72,1.6),white);
      const p=hull(i,4.7,2.35),q=hull(i+1,4.7,2.35);F([0,2.35,0],q,p,p,wood);
      beam(hull(i,4.6,2.35),hull(i,4.6,3.25),.032,white);beam(hull(i,4.6,3.25),hull(i+1,4.6,3.25),.025,white);
    }
    for(const [y,xw,z0,z1] of [[2.4,3.6,-9,9],[5.1,3.05,-7,6]]) {
      B(-xw,xw,y,y+2.25,z0,z1,white);B(-xw-.22,xw+.22,y+2.25,y+2.42,z0-.3,z1+.35,white);
      for(const side of [-1,1]) {
        for(let v=z0+.5;v<z1-1;v+=1.8) {
          const xx=side*(xw+.012),pts=[[xx,y+.6,v],[xx,y+.6,v+1.3],[xx,y+1.85,v+1.3],[xx,y+1.85,v]];
          if(side>0)pts.reverse();F(...pts,glass);
        }
        beam([side*(xw+.3),y+2.42,z0],[side*(xw+.3),y+3.2,z0],.03,white);
        beam([side*(xw+.3),y+3.2,z0],[side*(xw+.3),y+3.2,z1],.03,white);
        for(const v of [-5,-1,3])B(side*xw-.11,side*xw+.11,y+2.45,y+3.08,v,v+.16,white);
      }
      F([-xw,y+.5,z1+.016],[xw,y+.5,z1+.016],[xw,y+1.9,z1+.016],[-xw,y+1.9,z1+.016],glass);
      for(let u=-xw;u<xw;u+=1.2)B(u,u+.045,y+.5,y+1.9,z1+.02,z1+.09,white);
    }
    B(-.75,.75,7.55,9.8,-4,-2,[.59,.17,.1,0,6]);B(-.78,.78,9.8,10.05,-4.1,-1.9,steel);
    beam([0,7.5,3],[0,12,3],.065,white,6);beam([-1.8,11.1,3],[1.8,11.1,3],.04,white);
    B(-1.6,1.6,7.55,7.9,4,5,white);beam([-1.5,7.9,4.5],[1.5,7.9,4.5],.1,white,6);
    for(const side of [-1,1])for(const v of [-7,-3,1,5]) {
      const pts=(t,r)=>[side*4.76,1.1+Math.sin(t)*r,v+Math.cos(t)*r];
      for(let i=0;i<8;i++) {
        const a=i/8*Math.PI*2,b=(i+1)/8*Math.PI*2,p=[pts(a,.33),pts(b,.33),pts(b,.52),pts(a,.52)];
        if(side<0)p.reverse();F(...p,rubber);
      }
    }
    for(const v of [-11,12])for(const u of [-2.5,2.5]) {beam([u,2.35,v],[u,2.9,v],.09,steel,6);ring(u,2.9,v,.15,.09,steel,8);}
  }

  for(const [x,z,length=180,ry=0,ground=0] of quays) {
    const {F,B,beam}=part(out,x,z,ry,1,ground),lo=-length/2,hi=length/2;
    B(lo,hi,-3,.15,-2,0,stone);
    for(let u=lo;u<hi;u+=16) {
      B(u,Math.min(u+15.9,hi),.15,.33,-.7,.16,stone);
      F([u,-1.8,.012],[Math.min(u+15.9,hi),-1.8,.012],[Math.min(u+15.9,hi),-.55,.012],[u,-.55,.012],[.23,.3,.25,0,1]);
      B(u+3.2,u+4.8,-1.6,.08,.03,.36,rubber);
      B(u+3.4,u+4.6,-1.48,-.1,.36,.46,steel);
      beam([u+3.4,-1.2,.49],[u+3.4,-.35,.49],.027,steel);
      beam([u+4.6,-1.2,.49],[u+4.6,-.35,.49],.027,steel);
      beam([u+1,.25,-1.4],[u+1,.85,-1.4],.14,steel,8);
      beam([u+.72,.84,-1.4],[u+1.28,.84,-1.4],.12,steel,8);
      if(Math.round(u-lo)%64===0) {
        for(const d of [-.45,.45])beam([u+4+d,-2,.52],[u+4+d,.4,.52],.035,steel);
        for(let y=-2;y<.4;y+=.32)beam([u+3.55,y,.52],[u+4.45,y,.52],.025,steel);
      }
    }
    // ハーバーウォーク的木板分格與黑色港燈，沿用實景的細長尺度。
    F([lo,.16,-5],[hi,.16,-5],[hi,.16,-2],[lo,.16,-2],wood);
    for(let u=lo;u<hi;u+=.8)F([u,.17,-5],[u,.17,-2],[u+.015,.17,-2],[u+.015,.17,-5],steel);
    for(let u=lo+6;u<hi;u+=32) {
      beam([u,.15,-4.6],[u,4.4,-4.6],.065,steel,6);
      beam([u,4.1,-4.6],[u+.55,4.1,-4.6],.035,steel);
      B(u+.35,u+.75,3.7,4.18,-4.8,-4.4,[.59,.5,.3,0,6]);
      B(u+.28,u+.82,4.18,4.3,-4.85,-4.35,steel);
      for(const a of [.35,.75])beam([u+a,3.7,-4.4],[u+a,4.18,-4.4],.028,steel);
    }
  }
  const {beam}=part(out,0,0);
  for(const [a,b] of moorings)beam(a,b,.035,wood);
}
