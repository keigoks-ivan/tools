// 空戰沿用現有機體與碰撞；數值以公尺／秒計，不擴大地圖或敵人池。
export const FLIGHT = { cruise: 28, boost: 78, rise: 24, descend: 22, ceiling: 260, pitch: 1.38, idleCost: 3, moveCost: 2, riseCost: 6, recovery: 7, restartEN: 12, enemies: 3 };
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function airInterceptHeight(ground, roof, targetY, side, now, ceiling = FLIGHT.ceiling) {
  const clear=Math.min(roof+22,ground+ceiling-10);
  return clamp(Math.max(clear,targetY+side*(12+Math.sin(now*.6)*8)),ground+28,ground+ceiling-10);
}

// 有限直立膠囊的完整三維求交，包含正上方／正下方射擊。
export function rayCapsule(o,d,cap,maxT) {
  const x=o.x-cap.x,z=o.z-cap.z,r2=cap.r*cap.r;
  if(x*x+z*z+(o.y-clamp(o.y,cap.y0,cap.y1))**2<=r2)return 0;
  let best=Infinity;
  const a=d.x*d.x+d.z*d.z,b=x*d.x+z*d.z,c=x*x+z*z-r2,disc=b*b-a*c;
  if(a>1e-9&&disc>=0)for(const t of [(-b-Math.sqrt(disc))/a,(-b+Math.sqrt(disc))/a]) {
    const y=o.y+d.y*t;if(t>=0&&t<=maxT&&y>=cap.y0&&y<=cap.y1)best=Math.min(best,t);
  }
  const length=d.x*d.x+d.y*d.y+d.z*d.z;
  for(const y of [cap.y0,cap.y1]) {
    const dy=o.y-y,b=x*d.x+dy*d.y+z*d.z,c=x*x+dy*dy+z*z-r2,disc=b*b-length*c;
    if(length<=1e-9||disc<0)continue;
    const t=(-b-Math.sqrt(disc))/length;
    if(t>=0&&t<=maxT)best=Math.min(best,t);
  }
  return Number.isFinite(best)?best:-1;
}
