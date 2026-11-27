// The mission runs south through compressed shopping blocks toward the tower. The northern
// blocks keep the broad podiums and covered connections characteristic of the Xinyi malls.
export function buildXinyi({B,skin,quad,tile,uv,paint,piece,building,tree,front,world}) {
  const granite=paint(0xb4b1a5),bronze=paint(0x796b59),silver=paint(0xa6b5b5);
  const red=paint(0x9e483d),rose=paint(0xc08d81),slate=paint(0x445259);
  function podium(x,z,width,depth,h,style,side,label){
    const trim=style===2?rose:style===5?silver:granite;
    const door=x+side*width/2, bays=Math.max(2,Math.round(width/11)), runs=Math.round(depth/12);
    const body=()=>{
      skin(B.face,x,z,width,depth,.15,6,0,bays,runs);
      const upper=Math.round((h-6)/7);
      for(let j=0;j<upper;j++){
        const y=6+(h-6)*j/upper,top=6+(h-6)*(j+1)/upper;
        skin(B.face,x,z,width,depth,y,top,style,bays,runs);
        if(style!==2||j%2===0)piece(x,y,z,width+.35,.30,depth+.35,trim);
      }
      piece(x,h,z,width+.65,.55,depth+.65,trim);
      const mechanicalZ=z+depth*.24;
      piece(x,h+.56,mechanicalZ,width*.31,2.2,depth*.27,slate);
      for(let j=-1;j<=1;j++){
        const cx=x+j*width*.092;
        piece(cx,h+2.76,mechanicalZ,3.1,.88,4.6,silver);
        for(let i=-2;i<=2;i++)piece(cx,h+3.65,mechanicalZ+i*.7,2.54,.035,.22,slate);
      }
      if(style===1||style===2){
        for(let i=-1;i<=1;i++){
          const cx=x+i*width*.16,cz=z-depth*.18;
          piece(cx,h+.56,cz,width*.095,.8,depth*.29,silver);
          piece(cx,h+1.35,cz,width*.084,.12,depth*.28,paint(0x6e9697));
          for(let k=-1;k<=1;k++)piece(cx,h+1.48,cz+k*depth*.091,width*.085,.07,.18,silver);
        }
      }
      for(const end of [-1,1])piece(x,h+.5,z+end*(depth/2-.25),width,.95,.38,trim);
      const canopy=Math.min(42,depth*.74);
      piece(door+side*1.8,5.75,z,3.8,.34,canopy,bronze);
      for(let t=-canopy/2+1;t<canopy/2;t+=6)piece(door+side*3.4,.14,z+t,.22,5.62,.22,bronze);
      if(style===1&&depth>80){
        const ad=z-depth*.25,sw=Math.min(15,depth*.17);
        piece(door+side*.2,10,ad,.5,15.6,sw+.65,bronze);
        front(B.signs,door+side*.48,ad,sw,10.35,25.25,side,z>0?9:z< -225?7:8,4);
      }
      if(label!==undefined)front(B.signs,door+side*.24,z,16,8.0,11.2,side,label,4);
    };
    if(style===4){
      body();world.addCollider({x0:x-width/2,x1:x+width/2,z0:z-depth/2,z1:z+depth/2,top:h});
    }else building(x,z,width,depth,h,body);
  }
  // Pink-granite and light stone sidewalks run to the property line on each block.
  for(const [left,right] of [[-102,-18],[18,112],[148,232]]){
    for(const [lo,hi] of [[-458,-83],[-47,92],[128,260],[296,456]]){
      piece((left+right)/2,.055,(lo+hi)/2,right-left,.09,hi-lo,granite);
    }
  }
  // The public walks and bridge landings are aligned with the recessed storefronts.
  for(const [x,z,w,d,h,style,side,label] of [
    [-58,-345,61,123,36,5,1],[62,-342,70,139,44,1,-1],
    [193,-336,69,148,57,5,-1],[-62,-154,68,128,34,1,1],
    [64,-153,72,130,39,1,-1,0],[196,-153,70,125,32,5,-1],
    [-61,19,62,130,29,3,1],[67,-17,72,62,38,1,1,0],[193,-16,68,63,37,1,-1],
    [63,59,65,58,28,5,-1],[194,59,65,63,23,3,-1],
    [-67,186,70,104,33,5,1],[78,187,48,112,32,1,1],[193,178,63,86,31,3,-1],
    [-68,340,65,81,25,1,1],[198,367,68,116,31,1,-1],
    [-217,419,122,135,32,2,1,1]
  ])podium(x,z,w,d,h,style,side,label);
  // Pedestrian paving in the gap between the malls. Flush stone inlays and paired tree wells.
  piece(65,.065,-232,75,.13,32,granite);
  for(let x=32;x<=100;x+=4)piece(x,.199,-232,.23,.015,32,bronze);
  for(const z of [-244,-219])for(let x=36;x<103;x+=13){
    piece(x,.2,z,3.8,.24,3.8,slate);tree(x,z);
    piece(x+3.2,.4,z,2.5,.23,.8,bronze);
  }
  // Short perimeter blocks carry the skyline past the landmark to the foothills.
  // Only the block silhouette is modelled here; each strip of windows shares one quad.
  for(let row=0;row<5;row++){
    for(let col=-8;col<=8;col++){
      const seed=Math.abs(col*79+row*149+col*col*7),bx=col*65+(row%2)*19,bz=632+row*88+(seed%19);
      const w=28+seed%20,d=32+seed%17,h=19+(seed%41)+(row===0&&col%4===0?29:0);
      const base=world.height(bx,bz),facade=[5,1,3,5][seed%4];
      for(let j=0;j<3;j++)skin(B.face,bx,bz,w,d,base+h*j/3,base+h*(j+1)/3,facade,2,2);
      piece(bx,base+h,bz,w+.4,.42,d+.4,granite);
      piece(bx+w*.16,base+h+.42,bz,w*.29,2.5,d*.36,slate);
      world.addCollider({x0:bx-w/2,x1:bx+w/2,z0:bz-d/2,z1:bz+d/2,top:base+h+.42});
    }
  }
  // Faceted commercial tower above a retail base, with a split folded crown.
  const x=71,z=357;
  podium(x,z,76,100,24,4,-1);
  const ring=[[-21,16],[-15,22],[13,22],[21,14],[21,-16],[15,-22],[-14,-22],[-21,-14]];
  const point=(p,y,scale)=>[x+p[0]*scale,y,z+p[1]*scale];
  const crown=[207,216,208,189,199,218,208,187];
  for(let i=0;i<8;i++){
    const a=ring[i],j=(i+1)%8,b=ring[j];
    for(let floor=0;floor<24;floor++){
      const lo=24+floor*6.85,hi=lo+6.85;
      quad(B.glass,[point(a,lo,1),point(b,lo,1),point(b,hi,1),point(a,hi,1)],tile(3),[.8,.9,1]);
    }
    const lo=24+24*6.85;
    quad(B.glass,[point(a,lo,1),point(b,lo,1),point(b,crown[j],.96),point(a,crown[i],.96)],tile(3),[.72,.85,.96]);
    quad(B.trim,[point(a,crown[i],.96),point(b,crown[j],.96),[x,194,z],[x,194,z]],uv,silver);
  }
  world.addCollider({x0:x-21,x1:x+21,z0:z-22,z1:z+22,bottom:24,top:207});
  // Metro entrance along the 101 approach, with a glazed canopy and its red-line marker.
  const ex=-19,ez=405;
  piece(ex,.12,ez,8.4,.4,16,granite);
  for(let j=0;j<7;j++)piece(ex,.52,ez+5-j*1.1,6.2,.08+j*.15,1.13,slate);
  for(const dx of [-3.5,3.5])for(const dz of [-6,0,6])piece(ex+dx,.53,ez+dz,.28,4.4,.28,silver);
  skin(B.glass,ex,ez,8.2,15,4.84,5.27,3,2,2);
  piece(ex,5.28,ez,8.5,.25,15.4,silver);
  piece(ex+5,.1,ez-5,.72,5.05,1.2,red);
  front(B.signs,ex+5.44,ez-5,4.8,4.1,5.25,1,2,4);
}
