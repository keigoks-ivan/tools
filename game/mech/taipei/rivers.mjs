const interp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
// Local mission coordinates. The upriver channels flank a wetland point before the
// confluence. Downstream the single Tamsui channel passes beneath Guandu Bridge.
export function channelsAt(x) {
  const fork=smooth((-165-x)/600), bend=Math.sin(x/305);
  const near=101+7*bend, far=453+32*bend+175*fork;
  const mid=interp(310,258,fork);
  return [[near,mid-64*fork],[mid+97*fork,far]];
}
export function riverDepth(x,z){
  let depth=0;
  const [[a,b],[c,d]]=channelsAt(x);
  for(const [lo,hi] of c-b<1?[[a,d]]:[[a,b],[c,d]]){
    depth=Math.max(depth,4.7*smooth((z-lo+14)/18)*smooth((hi-z+14)/18));
  }
  return depth;
}

export function buildGuandu({world,quad,trim,piece,course,uv,paint}){
  const red=paint(0xb84b39),shade=paint(0x863c34),conc=paint(0xb2a794),deck=paint(0x585d60);
  const x=481;
  function beam(a,b,r,color){
    const dy=b[1]-a[1],dz=b[2]-a[2],n=Math.hypot(dy,dz);
    const u=n?[r,0,0]:[0,r,0],v=n?[0,-dz*r/n,dy*r/n]:[0,0,r];
    const pt=(p,j)=>p.map((k,i)=>k+u[i]*[-1,1,1,-1][j]+v[i]*[-1,-1,1,1][j]);
    for(let j=0;j<4;j++)quad(trim,[pt(a,j),pt(b,j),pt(b,(j+1)%4),pt(a,(j+1)%4)],uv,color);
  }
  function span(start,length,rise) {
    const steps=16,h=t=>17+4*rise*t*(1-t);
    for(const side of [-1,1]){
      const xx=x+side*8.35;
      for(let i=0;i<steps;i++){
        const t=i/steps,u=(i+1)/steps,z=start+t*length,end=start+u*length;
        const p=[xx,h(t),z],q=[xx,h(u),end];
        beam(p,q,.61,red);beam([xx,h(t)+1.78,z],[xx,h(u)+1.78,end],.36,red);
        beam(p,[xx,h(u)+1.78,end],.19,shade);
        if(i%2===1){
          beam([xx,16.6,z],p,.135,shade);
          if(i>=3&&i<=13&&side===1)beam([x-8.35,h(t)+.48,z],[x+8.35,h(t)+.48,z],.30,red);
        }
      }
    }
  }
  // Three through arches with the higher central opening, then the two approach spans.
  for(const [start,len,rise] of [[104,96,25],[200,150,36],[350,101,26]])span(start,len,rise);
  for(const z of [56,104,200,350,451,500]){
    course(trim,x,z,-5,3.3,18,2.7,conc,12,1.55);
    piece(x,12,z,18,2.5,4.5,conc);
    world.addCollider({x0:x-3,x1:x+3,z0:z-4,z1:z+4,top:14.5});
  }
  piece(x,14.65,285,18.5,1.4,490,deck);
  for(const s of [-1,1]){
    piece(x+s*8.4,15.62,285,.8,1.24,490,red);
    piece(x+s*9.05,16.10,285,.12,.85,490,conc);
  }
  world.addCollider({x0:x-9.3,x1:x+9.3,z0:40,z1:530,bottom:14.6,top:16.16});
}
