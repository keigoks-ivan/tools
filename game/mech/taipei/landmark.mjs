// Visual proportions of the eight flared sections follow Taipei 101's published design.
// The tower, podium and spire are static scenery in the fictional mission district.
export const TAIPEI_101 = Object.freeze({x:-66,z:500,height:508});

export function buildTaipei101(world,{quad,glass,trim,piece,paint,glassUV,uv}) {
  const {x,z}=TAIPEI_101;
  const silver=paint(0xa9b7ae), dark=paint(0x375d62), jade=paint(0x80a79b);
  const panes=[.61,.85,.80],corners=(r)=>[[-r*.87,r],[r*.87,r],[r,r*.87],[r,-r*.87],[r*.87,-r],[-r*.87,-r],[-r,-r*.87],[-r,r*.87]];
  const point=(p,y)=>[x+p[0],y,z+p[1]];
  const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
  function segment(y,r,h,rt,glazed,color=dark){
    const lo=corners(r),hi=corners(rt);
    for(let i=0;i<8;i++){
      const k=(i+1)%8,n=glazed&&!(i%2)?6:1;
      for(let j=0;j<n;j++){
        const a=j/n,b=(j+1)/n;
        quad(glazed?glass:trim,[point(mix(lo[i],lo[k],a),y),point(mix(lo[i],lo[k],b),y),
          point(mix(hi[i],hi[k],b),y+h),point(mix(hi[i],hi[k],a),y+h)],glazed?glassUV:uv,glazed?panes:color);
      }
      quad(trim,[[x,y+h,z],point(hi[i],y+h),point(hi[k],y+h),[x,y+h,z]],uv,color);
    }
  }
  function solid(y,r,h){world.addCollider({x0:x-r,x1:x+r,z0:z-r,z1:z+r,bottom:y,top:y+h,landmark:'台北101'});}
  function shaft(y,lo,h,hi,floors){
    for(let j=0;j<floors;j++){
      const bottom=y+h*j/floors,step=h/floors,r=lo+(hi-lo)*j/floors,t=lo+(hi-lo)*(j+1)/floors;
      segment(bottom,r,step-.27,t,true);segment(bottom+step-.27,t+.06,.27,t+.06,false,silver);
      solid(bottom,(r+t)/2,step);
    }
  }
  // The shopping podium reaches north from the tower, with a glazed, ribbed barrel roof.
  const mallX=x-38,mallZ=z-67,hw=36,hd=43;
  piece(mallX,0,mallZ,hw*2,1,hd*2,silver);
  for(let floor=0;floor<5;floor++){
    const y=1+floor*5.1;
    piece(mallX,y,mallZ,hw*2,5.1,hd*2,dark);
    for(const side of [-1,1])for(let k=0;k<10;k++){
      const zz=mallZ+side*(hd-k*hd*.2),xx=mallX+side*(hw+.04);
      quad(glass,[[xx,y,zz],[xx,y,zz-side*hd*.2],[xx,y+4.78,zz-side*hd*.2],[xx,y+4.78,zz]],glassUV,panes);
    }
    piece(mallX,y+4.8,mallZ,hw*2+.6,.35,hd*2+.6,silver);
  }
  function vault(i,dz){
    const a=i*Math.PI/14;
    return [mallX+25*Math.cos(a),26.6+8.5*Math.sin(a),mallZ+dz];
  }
  for(let i=0;i<14;i++)for(let k=-36;k<36;k+=6){
    quad(glass,[vault(i,k),vault(i+1,k),vault(i+1,k+6),vault(i,k+6)],glassUV,panes);
    const rib=(j,d)=>{const p=vault(j,d);p[1]+=.10;return p;};
    quad(trim,[rib(i,k),rib(i+1,k),rib(i+1,k+.24),rib(i,k+.24)],uv,silver);
  }
  world.addCollider({x0:mallX-hw,x1:mallX+hw,z0:mallZ-hd,z1:mallZ+hd,top:26.5,landmark:'台北101'});
  for(let i=-2;i<=2;i++)world.addCollider({x0:mallX+i*10-5,x1:mallX+i*10+5,z0:mallZ-36,z1:mallZ+36,top:26.6+8.5*Math.sqrt(1-(i/2.5)**2),landmark:'台北101'});
  shaft(0,39.5,112,29.5,23);
  segment(112,29.5,3,30,true);solid(112,30,3);
  for(let i=0;i<8;i++){
    const y=115+i*34,bottom=27.3-i*.25,top=bottom+4.7;
    shaft(y,bottom,31.6,top,8);
    segment(y+31.6,top+.65,1.0,top+.65,false,silver);
    segment(y+32.6,top+.65,1.4,bottom-1,false,dark);solid(y+31.6,top,2.4);
    for(const sx of [-1,1])for(const sz of [-1,1]){
      const xx=x+sx*top*.94,zz=z+sz*top*.94;
      piece(xx,y+27.8,zz,1.7,5.4,1.7,jade);
      piece(xx+sx*.52,y+31.4,zz+sz*.52,2.15,2.7,2.15,silver);
    }
  }
  shaft(387,21,26,17,6);shaft(413,13.6,27,9.5,6);
  shaft(440,7.5,9,5.1,2);segment(449,4.4,18,2.45,false,silver);solid(449,3.6,18);
  segment(467,2.45,41,.13,false,silver);solid(467,1.25,41);
}
