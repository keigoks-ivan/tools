// 神戶的沿海街廓、三宮商辦與北側山麓住宅。保留中央作戰街區，外圍只產生靜態遠景。
export const KOBE_CITY = { block: 120, half: 4680, north: -2640, south: 720, rail: -780, station: 0 };
const hash = (x,z) => { const n=Math.sin(x*12.9898+z*78.233)*43758.5453; return n-Math.floor(n); };

export function kobeCityBlocks(height, reserve = (x0,x1,z0,z1)=>x0<840&&x1>-840&&z0<840&&z1>-840) {
  const blocks=[];
  for(let z=KOBE_CITY.north;z<KOBE_CITY.south;z+=120)for(let x=-KOBE_CITY.half;x<KOBE_CITY.half;x+=120) {
    const x0=x+18,x1=x+102,z0=z+18,z1=z+102;
    if(reserve(x0,x1,z0,z1))continue;
    const samples=[[x0,z0],[x1,z0],[x0,z1],[x1,z1]].map(([a,b])=>height(a,b));
    const lo=Math.min(...samples),hi=Math.max(...samples),key=hash(x,z);
    if(hi>145||hi-lo>16||lo<-.5||key<.045)continue;
    const hillside=hi>35||z<-1440,commercial=!hillside&&x>-240&&x<1800&&z<240;
    const count=hillside?3:commercial?2:3,span=(x1-x0)/count,lots=[];
    for(let i=0;i<count;i++) {
      const a=x0+i*span+.7,c=x0+(i+1)*span-1.1;
      const rail=z===-840&&Math.abs(x)<2880;
      const d=rail?22:hillside?22+hash(x+i,z+3)*17:50+hash(x+i,z+3)*29;
      const b=rail?(i%2?z1-d:z0):z0+hash(x+i,z+4)*(z1-z0-d),e=b+d;
      const ground=Math.max(...[[a,b],[c,b],[a,e],[c,e]].map(([u,v])=>height(u,v)));
      const floors=hillside?2+Math.floor(hash(x+i,z+1)*3):commercial?5+Math.floor(hash(x+i,z+1)*14):3+Math.floor(hash(x+i,z+1)*7);
      const style=commercial&&floors>12?0:!hillside&&x< -240&&z> -1080&&z<360&&i===0?2:3+Math.floor(hash(x+i,z+5)*2);
      lots.push({x0:a,x1:c,z0:b,z1:e,ground,H:ground+floors*3.4,style,pitched:hillside,tint:.72+hash(x+i,z+8)*.25});
    }
    blocks.push({x0,x1,z0,z1,hillside,lots});
  }
  return blocks;
}

export function kobeRailway(out,height) {
  const concrete=[.58,.6,.58,0,1],steel=[.22,.28,.28,0,2],silver=[.72,.75,.73,0,6],glass=[.065,.105,.12,0,4];
  const box=(...a)=>out.box(...a),face=(...a)=>out.face(...a),z=KOBE_CITY.rail;
  for(let x=-2880;x<2880;x+=120) {
    const a=height(x,z)+7,b=height(x+120,z)+7;
    if(Math.max(a,b)>27)continue;
    // 高架橋面隨平緩的沿海地勢延伸，軌道、立柱和架空電車線合併在同一個材質桶。
    for(const dz of [-9,9]) { const p=[[x,a,z+dz],[x+120,b,z+dz],[x+120,b-.9,z+dz],[x,a-.9,z+dz]];if(dz>0)p.reverse();face(...p,concrete); }
    face([x,a,z+9],[x+120,b,z+9],[x+120,b,z-9],[x,a,z-9],concrete);
    for(const dz of [-3,3])face([x,a+.025,z+dz+1.9],[x+120,b+.025,z+dz+1.9],[x+120,b+.025,z+dz-1.9],[x,a+.025,z+dz-1.9],[.23,.24,.22,0,1]);
    box(x-1,x+1,height(x,z),a-.9,z-4,z+4,concrete);
    for(const dz of [-3.55,-2.45,2.45,3.55])face([x,a+.15,z+dz+.035],[x+120,b+.15,z+dz+.035],[x+120,b+.15,z+dz-.035],[x,a+.15,z+dz-.035],steel);
    for(const dz of [-8.5,8.5])box(x-.065,x+.065,a,a+5.3,z+dz-.065,z+dz+.065,steel);
    box(x-.07,x+.07,a+5.15,a+5.3,z-8.5,z+8.5,steel);
    for(const dz of [-3,3])face([x,a+4.9,z+dz],[x+120,b+4.9,z+dz],[x+120,b+4.925,z+dz],[x,a+4.925,z+dz],steel);
  }
  const cx=KOBE_CITY.station,y=height(cx,z)+7;
  for(const dz of [-7,7]) {
    box(cx-105,cx+105,y+.2,y+1.05,z+dz-1.5,z+dz+1.5,concrete);
    for(let x=cx-100;x<=cx+100;x+=20)box(x-.08,x+.08,y+1.05,y+5.5,z+dz-.08,z+dz+.08,steel);
    face([cx-109,y+5.9,z+dz],[cx+109,y+5.9,z+dz],[cx+109,y+5.5,z+dz-2],[cx-109,y+5.5,z+dz-2],silver);
    face([cx-109,y+5.5,z+dz+2],[cx+109,y+5.5,z+dz+2],[cx+109,y+5.9,z+dz],[cx-109,y+5.9,z+dz],silver);
  }
  for(let i=0;i<6;i++) {
    const x=cx-58+i*20,top=y+3.8;
    box(x,x+19,y+.45,top-.35,z-4.4,z-1.6,silver);
    face([x,top,z-4.05],[x+19,top,z-4.05],[x+19,top-.35,z-4.4],[x,top-.35,z-4.4],silver);
    face([x,top,z-1.95],[x+19,top,z-1.95],[x+19,top,z-4.05],[x,top,z-4.05],silver);
    face([x,top-.35,z-1.6],[x+19,top-.35,z-1.6],[x+19,top,z-1.95],[x,top,z-1.95],silver);
    for(const [s,dz] of [[-1,-4.41],[1,-1.59]]) {
      const pane=(lo,hi,bot,hiY,col)=>{const p=[[lo,bot,z+dz],[hi,bot,z+dz],[hi,hiY,z+dz],[lo,hiY,z+dz]];if(s<0)p.reverse();face(...p,col);};
      pane(x+.15,x+18.85,y+1.2,y+1.38,[.12,.3,.28,0,6]);
      for(let j=0;j<8;j++)pane(x+.65+j*2.2,x+2.45+j*2.2,y+1.7,y+3.15,glass);
    }
  }
}

// 白色波浪露台旅館與港邊觀覽車，參照メリケンパーク／ハーバーランド的海岸輪廓。
export function kobeWaterfront(out, shoreOffset = 0) {
  const white=[.85,.85,.8,0,6],stone=[.56,.58,.55,0,1],steel=[.27,.32,.32,0,2],glass=[.085,.13,.15,0,4];
  const box=(x0,x1,y0,y1,z0,z1,col)=>out.box(x0,x1,y0,y1,z0+shoreOffset,z1+shoreOffset,col);
  const face=(a,b,c,d,col)=>out.face(...[a,b,c,d].map(p=>[p[0],p[1],p[2]+shoreOffset]),col),cx=-80,cz=980,N=32;
  const curve=(a,b,c,d,col)=>face(d,c,b,a,col);
  box(cx-125,cx+125,-3,2,818,1090,stone);
  box(cx-112,cx+112,2,7,cz-42,cz+1,white);
  for(let i=0;i<N;i++) {
    const a=i/N*Math.PI,b=(i+1)/N*Math.PI;
    curve([cx+Math.cos(a)*112,2,cz+Math.sin(a)*68],[cx+Math.cos(b)*112,2,cz+Math.sin(b)*68],[cx+Math.cos(b)*112,7,cz+Math.sin(b)*68],[cx+Math.cos(a)*112,7,cz+Math.sin(a)*68],glass);
    if(i%2===0)box(cx+Math.cos(a)*112-.13,cx+Math.cos(a)*112+.13,2,7,cz+Math.sin(a)*68-.13,cz+Math.sin(a)*68+.13,white);
  }
  for(let f=0;f<14;f++) {
    const y=7+f*3.6,rx=112-f*3.1,rz=68-f*1.2;
    const P=(i,h,r=rx,d=rz)=>[cx+Math.cos(i/N*Math.PI)*r,h,cz+Math.sin(i/N*Math.PI)*d];
    for(let i=0;i<N;i++) {
      curve(P(i,y),P(i+1,y),P(i+1,y+.22),P(i,y+.22),white);
      curve(P(i,y+.22),P(i+1,y+.22),P(i+1,y+.22,rx-2.6,rz-2.6),P(i,y+.22,rx-2.6,rz-2.6),stone);
      curve(P(i,y+.35,rx-2.6,rz-2.6),P(i+1,y+.35,rx-2.6,rz-2.6),P(i+1,y+3.5,rx-2.6,rz-2.6),P(i,y+3.5,rx-2.6,rz-2.6),glass);
      curve(P(i,y+.65),P(i+1,y+.65),P(i+1,y+1.5),P(i,y+1.5),white);
      const mid=(i+.5)/N*Math.PI,a=[cx+Math.cos(mid)*(rx-2.5),y+.3,cz+Math.sin(mid)*(rz-2.5)];
      if(i%2===0)box(a[0]-.06,a[0]+.06,y+.3,y+3.5,a[2]-.06,a[2]+.06,white);
    }
    box(cx-rx,cx+rx,y,y+.28,cz-42,cz,white);
    face([cx-rx,y+.3,cz-42.02],[cx-rx,y+3.5,cz-42.02],[cx+rx,y+3.5,cz-42.02],[cx+rx,y+.3,cz-42.02],glass);
  }
  const top=57.4,rx=71.7,rz=52.4;
  face([cx-rx,top,cz],[cx+rx,top,cz],[cx+rx,top,cz-42],[cx-rx,top,cz-42],white);
  for(let i=0;i<N;i++) {
    const a=i/N*Math.PI,b=(i+1)/N*Math.PI;
    face([cx,top,cz],[cx+Math.cos(b)*rx,top,cz+Math.sin(b)*rz],[cx+Math.cos(a)*rx,top,cz+Math.sin(a)*rz],[cx+Math.cos(a)*rx,top,cz+Math.sin(a)*rz],white);
  }
  // 細長船舷、護欄和靠泊柱，使旅館底座呈現碼頭而非漂浮的建築。
  for(let z=830;z<1090;z+=14)for(const x of [cx-124,cx+124]) {
    box(x-.08,x+.08,2,3.1,z-.08,z+.08,steel);
    box(x-.06,x+.06,3.04,3.1,z,z+14,steel);
  }
  const wx=-660,wz=788,wy=29,r=24;
  const beam=(a,b,w,col)=>{
    const d=b.map((v,i)=>v-a[i]),len=Math.hypot(...d),n=d.map(v=>v/len),ref=Math.abs(n[2])<.9?[0,0,1]:[0,1,0];
    const u=[n[1]*ref[2]-n[2]*ref[1],n[2]*ref[0]-n[0]*ref[2],n[0]*ref[1]-n[1]*ref[0]],ul=Math.hypot(...u);for(let i=0;i<3;i++)u[i]*=w/ul;
    const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
    const corners=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([s,t])=>p.map((q,i)=>q+u[i]*s+v[i]*t));
    const p=corners(a),q=corners(b);for(let j=0;j<4;j++)face(p[j],p[(j+1)%4],q[(j+1)%4],q[j],col);
  };
  for(const dz of [-1.5,1.5])for(let i=0;i<40;i++) {
    const a=i/40*Math.PI*2,b=(i+1)/40*Math.PI*2,p=[wx+Math.cos(a)*r,wy+Math.sin(a)*r,wz+dz],q=[wx+Math.cos(b)*r,wy+Math.sin(b)*r,wz+dz];
    beam(p,q,.15,white);if(i%2===0)beam([wx,wy,wz+dz],p,.045,steel);
  }
  for(const dz of [-5,5])for(const x of [wx-9,wx+9])beam([x,.3,wz+dz],[wx,wy,wz],.4,white);
  for(let i=0;i<20;i++) {
    const a=i/20*Math.PI*2,x=wx+Math.cos(a)*r,y=wy+Math.sin(a)*r;
    beam([x,y,wz-1.5],[x,y,wz+1.5],.06,steel);
    box(x-.85,x+.85,y-2.1,y-.2,wz-1.1,wz+1.1,[.48,.15,.1,0,6]);
    for(const z of [wz-1.12,wz+1.12]) {
      const p=[[x-.7,y-1.6,z],[x+.7,y-1.6,z],[x+.7,y-.4,z],[x-.7,y-.4,z]];if(z<wz)p.reverse();face(...p,glass);
    }
  }
}
