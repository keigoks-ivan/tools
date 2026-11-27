// Shore-side structures share the street renderer's steel, glazing and concrete batches.
// The sights and the playable streets are compressed into separate districts.
const steel=0x758a8d, cream=0xd2d1c6, dark=0x424c52, oxide=0xa9513c, yellow=0xc69b4c;
const districts={
  lock:['扇橋閘門','小名木川'],tsukuda:['佃','隅田川'],toyosu:['豊洲','春海橋公園'],
  rail:['新木場','京葉線'],wakasu:['若洲海浜公園','東京ゲートブリッジ'],aomi:['青海','コンテナふ頭']
};

function tug(p,x,z,length) {
  const {box,beam}=p, w=length*.27;
  box(x,.72,z,length,1.45,w,0x354854);
  for(const side of [-1,1]) {
    beam([x+length*.48,1.15,z+side*w*.46],[x+length*.66,1.3,z],1.25,0x354854);
    box(x,1.62,z+side*w*.49,length,.28,.22,0xe1d7b8);
    for(let j=-2;j<3;j++)box(x+j*length*.17,.95,z+side*w*.51,.86,.8,.42,dark);
  }
  box(x-length*.12,2.8,z,length*.31,2.5,w*.78,cream);
  box(x-length*.11,4.25,z,length*.26,.91,w*.7,0x39505b);
  box(x-length*.11,4.83,z,length*.30,.21,w*.83,cream);
  box(x-length*.27,4.02,z+.7,.72,3.5,.72,oxide);
  beam([x,4.7,z],[x,7.4,z],.1,dark);
}

function lock(p) {
  const {box,beam,solid,sign}=p;
  // The operating gallery is glazed on both long faces above a steel vertical-lift gate.
  for(const [i,x] of [-128,53].entries()){
    const mid=143, shore=119, far=167;
    for(const z of [shore,far]){
      box(x,8.4,z,8.6,19.4,5.6,0x9da39c);solid(x,z,8.6,5.6,18.1);
      box(x,9.15,z+2.95,4.9,15.8,.29,0x66716f);
      box(x+3.27,9.15,z+2.98,.38,17.3,.36,steel);
      for(let k=0;k<19;k++)box(x+3.2,1+k*.86,z+3.12,.9,.1,.32,cream);
    }
    box(x,14.3,mid,5.3,2.2,far-shore,0xadb5ad);
    box(x,16.5,mid,4.05,2.35,40,0x50646a);
    for(let j=-19;j<=19;j+=3.35)box(x+2.05,16.55,mid+j,.19,2.4,.17,cream);
    box(x,17.94,mid,5.15,.52,43,0xc0c3b9);
    box(x,5.25,mid,1.0,7.6,42.5,0x8f9d99);
    for(const y of [2.5,5.5,8.5])box(x+.63,y,mid,.4,.33,41,steel);
    for(const dz of [-16,-8,0,8,16])beam([x+.85,2.5,mid+dz-4],[x+.85,8.4,mid+dz+4],.34,steel);
    if(!i)sign('扇橋閘門',x,15.2,shore-3.02,Math.PI,8.1);
  }
  // A small parallel towpath faces the residential blocks across the canal.
  box(0,.35,217,1550,2.8,96,0x96998a,'stone');
  box(0,1.48,171.5,1550,.52,5.2,cream);
  tug(p,248,145,17);
}

function bridge(p,x,z,length,gate) {
  const {box,beam,solid}=p, w=gate?16:8.5, deck=gate?31:9, bays=gate?26:12;
  const start=x-length/2, step=length/bays;
  box(x,deck,z,length,2.45,w*2,steel);solid(x,z,length,w*2,deck+1.25,deck-1.22);
  for(const side of [-1,1]){
    const zz=z+side*w;
    // Paired cantilevers have two high points, with a shallow suspended centre span.
    function top(t){if(!gate)return deck+2+9*Math.sin(t*Math.PI);
      const u=t<=.5?t:1-t;
      return deck+(u<.19?4+u/.19*27:u<.34?31-(u-.19)/.15*7:24-(u-.34)/.16*14);
    }
    for(let j=0;j<bays;j++){
      const a=start+j*step,b=a+step, ya=top(j/bays), yb=top((j+1)/bays);
      beam([a,ya,zz],[b,yb,zz],gate?1.75:.7,cream);
      beam([a,deck+1.3,zz],[b,yb,zz],gate?1.15:.5,cream);
      beam([a,ya,zz],[b,deck+1.3,zz],gate?.93:.38,cream);
      if(gate&&j%2===0)beam([a,ya,zz],[a,ya,z-side*w],.92,cream);
    }
    box(x,deck+2.6,zz,length,.32,.30,cream);
  }
  if(gate){
    // Continuous approaches carry the deck back to the land. The east approach turns
    // into the quay, the western one meets the offshore reclaimed breakwater.
    for(const dir of [-1,1]){
      let ax=x+dir*length/2,az=z,ay=deck;
      const route=dir<0?[[-545,369,29],[-664,367,25],[-785,369,20],[-909,378,12],[-1044,397,4]]
        :[[325,363,30],[462,338,26],[581,297,22],[681,235,17],[758,150,11],[824,58,4]];
      for(const [bx,bz,by] of route){
        const dx=bx-ax,dz=bz-az,span=Math.hypot(dx,dz);
        const nx=-dz/span,nz=dx/span;
        // Longitudinal box girders define the apron. Thin crossbeams are visible below.
        for(let side=-3;side<=3;side++){
          const ofs=side*(w*2/7);
          const a=[ax+nx*ofs,ay,az+nz*ofs], b=[bx+nx*ofs,by,bz+nz*ofs];
          // Rectangular beam orientation preserves width and shallow deck profile.
          p.deck(a,b,w*2/7+.08,1.75,0x89969b);
        }
        for(const s of [-1,1])beam([ax+nx*s*w,ay+1.55,az+nz*s*w],[bx+nx*s*w,by+1.55,bz+nz*s*w],.37,cream);
        const px=(ax+bx)/2, py=(ay+by)/2, pz=(az+bz)/2;
        box(px,py*.45,pz,4.2,py*.96,11,0xa4aaa4,'stone');
        box(px,py-1.82,pz,6.5,2.45,w*2,0xb0b4ac,'stone');
        box(px,.66,pz,9.6,2.65,16.8,0x8b9995,'stone');
        ax=bx;az=bz;ay=by;
      }
    }
    box(-1093,.25,398,215,3.4,115,0x87978b,'stone');
    box(-1075,1.55,398,211,.6,27,0x8b9790);
  }
  for(const t of [.18,.82]) {
    const px=start+t*length;
    box(px,deck*.44,z,gate?10:4,deck*.99,2*w*.83,0xa6aca5,'stone');
    if(gate){
      box(px,.75,z,22,3.7,2*w+9,0x939e97,'stone');
      box(px,.48,z,22.12,1.00,2*w+9.14,0x77877f);
      box(px,2.5,z,21.6,.28,2*w+8.8,0xa6afa8);
      for(const sx of [-1,1]){
        box(px+sx*4.87,15.4,z,1.15,22,1.6,0xa3a8a1);
        box(px+sx*4.90,17.4,z+1.0,.55,18.7,.33,0x8e9992);
      }
      for(const side of [-1,1])beam([px,2,z+side*(w*.84)],[px,deck-3,z+side*(w*.64)],2.6,0xadada5);
    }
    box(px,deck-2.33,z,gate?17:7,3.8,2*w+1.75,0xb7b9b0,'stone');
  }
}

// A floating work platform is part of the fictional recovery operation. It is low
// enough to walk under the actual bridge deck without treating the truss as a floor.
function serviceFloats({box,solid}){
  for(const x of [28,160]){
    for(let j=0;j<9;j++){
      const z=132+j*27;
      box(x,.28,z,20,1.25,26.9,0x5e7376);
      box(x,.94,z,20,.12,26.4,0x9a9c8f);
      for(const s of [-1,1]){
        box(x+s*9.76,1.015,z,.24,.06,23,yellow);
        box(x+s*10.05,.25,z+8,.45,.85,2.4,dark);
      }
    }
    // Keep the landward ramp on the flat sampled terrain, even on the coarse mesh.
    box(x,.23,105,20,.34,12,0x87908a);
    box(x,.65,115,20,.46,8.4,0x87908a);
    solid(x,105,20,12,.4,-.5);
    solid(x,237.25,20,252.5,1,-.5);
  }
  for(let j=0;j<6;j++){
    const x=26+j*26;
    box(x,.24,370,25.9,1.35,25,0x566a6c);
    box(x,.95,370,25.6,.10,25,0xa1a193);
    for(const s of [-1,1])box(x+s*8,1.02,381.9,7.5,.08,.38,yellow);
  }
  solid(91,370,156,25,1,-.5);
}

function dockCrane(p,x,z,scale,gantry) {
  const {box,beam,solid}=p;
  const place=(a,b,c)=>[x+a*scale,b*scale,z+c*scale];
  const bar=(a,b,t,c)=>beam(place(...a),place(...b),t*scale,c);
  const part=(a,b,c,w,h,d,col)=>box(...place(a,b,c),w*scale,h*scale,d*scale,col);
  if(gantry){
    for(const side of [-1,1]){
      for(const k of [-1,1]){
        part(side*13,1.3,k*13,3.5,2.6,5,dark);
        bar([side*13,2.5,k*13],[side*10,33,k*9],2.1,oxide);
        solid(x+side*13*scale,z+k*13*scale,3.6*scale,5*scale,32*scale);
      }
      bar([side*12.7,4,-12],[side*10.5,28,10],.75,cream);
      bar([side*12.7,4,12],[side*10.5,28,-10],.75,cream);
      bar([side*10,31,-20],[side*10,31,48],1.75,oxide);
      for(let j=-19;j<47;j+=5.6) {
        bar([side*10,31,j],[side*10,34,j+2.8],.57,cream);
        bar([side*10,34,j+2.8],[side*10,31,j+5.6],.57,cream);
      }
      bar([side*10,34,-18],[side*10,34,48],.9,oxide);
      bar([side*10,33,0],[side*10,52,4],1.3,oxide);
      bar([side*10,52,4],[side*10,34,41],.35,dark);
      bar([side*10,52,4],[side*10,34,-16],.35,dark);
    }
    part(0,31.7,5,21,2.5,15,oxide);part(0,35,-13,19,5,12,cream);
    part(0,29,20,13,3.3,4.2,yellow);
    for(const sx of [-5,5])bar([sx,28,20],[sx,13,20],.16,dark);
    part(0,12.8,20,13.8,.8,2.1,yellow);
  }else{
    for(const s of [-1,1])for(const t of [-1,1])bar([s*7,0,t*6],[s*4,14,t*3],1.7,oxide);
    part(0,14,0,13,2.1,10,oxide);part(0,17,0,8.5,5,7.2,oxide);
    part(-1.7,19.8,-1.6,6,2.1,5.6,0xbeb8a7);part(-1.7,19.9,-4.45,5.45,.93,.14,dark);
    for(const s of [-1,1]){
      bar([s*2,17,2],[s*.8,42,20],1.1,oxide);
      bar([s*1.9,24,-5],[s*.8,42,20],.35,steel);
      bar([s*2,17,2],[s*1.9,24,-5],1.25,oxide);
    }
    for(let i=0;i<7;i++)bar([-1.8+i*.14,18+i*3.3,3+i*2.42],[1.72-i*.14,21.3+i*3.3,5.42+i*2.42],.32,oxide);
    bar([0,42,20],[0,14,20],.12,dark);part(0,13,20,1.25,1.4,1.05,yellow);
    solid(x,z,13*scale,11*scale,14*scale);
  }
}

function toyosu(p){
  dockCrane(p,74,102,1.25,false);dockCrane(p,136,102,.97,false);
  const {box,beam}=p;
  // Sloped dock edges and paired bascule leaves beside the old shipyard promenade.
  for(const side of [-1,1]){
    const x=side*17-76;
    box(x,1.8,159,6.5,4.6,79,0x828e89,'stone');
    for(const dz of [-5,5]){
      beam([x,4.5,161+dz],[x-side*6.5,19.4,161+dz],1.0,cream);
      beam([x,7,161+dz],[x-side*6.3,19.8,161+dz],.41,cream);
    }
    for(let k=0;k<7;k++)box(x-side*k*.93,4.8+k*2.1,161,1.6,.9,10.5,0xc8c8bc);
  }
  tug(p,-38,178,19);tug(p,-114,159,23);
}

function railway(p){
  const {box,beam,deck,solid,clearLot}=p, z=-33,top=23.8;
  // The main line sweeps in from the northern lumber yards, then straightens at the waterfront.
  const line=[[-1040,z],[-302,z],[-201,-40],[-97,-82],[57,-179],[203,-305],[296,-363],[381,-394],[1060,-394]];
  for(let k=1;k<line.length;k++){
    const [ax,az]=line[k-1],[bx,bz]=line[k],dx=bx-ax,dz=bz-az,span=Math.hypot(dx,dz),nx=-dz/span,nz=dx/span;
    deck([ax,top,az],[bx,top,bz],14,1.9,0x9b9f9b);
    for(const ofs of [-6.85,6.85]){
      deck([ax+nx*ofs,top+1.6,az+nz*ofs],[bx+nx*ofs,top+1.6,bz+nz*ofs],.45,2.2,0xb4b8b1);
    }
    const spans=Math.ceil(span/51);
    for(let j=0;j<spans;j++){
      const t=(j+.5)/spans,x=ax+dx*t,cz=az+dz*t;
      if(!clearLot(x,cz,10,13))continue;
      for(const side of [-1,1]){
        const xx=x+side*5*nx,zz=cz+side*5*nz;
        box(xx,11.55,zz,3.4,23.15,2.7,0xa4a6a1,'stone');solid(xx,zz,3.4,2.7,23.2);
      }
      deck([x+nx*7.8,22,cz+nz*7.8],[x-nx*7.8,22,cz-nz*7.8],4.4,2.35,0xb2b6ae);
      beam([x+5.75*nx,26,cz+5.75*nz],[x+5.75*nx,31.7,cz+5.75*nz],.24,steel);
      beam([x+5.75*nx,31.7,cz+5.75*nz],[x-4.5*nx,31.7,cz-4.5*nz],.17,steel);
    }
    // Short boxes approximate the overhead curved collision without filling the area below the deck.
    const pieces=Math.ceil(span/8);
    for(let j=0;j<pieces;j++)solid(ax+dx*(j+.5)/pieces,az+dz*(j+.5)/pieces,Math.abs(dx)/pieces+14*Math.abs(nx),Math.abs(dz)/pieces+14*Math.abs(nz),top+1,top-1);
  }
  const start=-529;
  for(let i=0;i<6;i++){
    const x=start+i*20.4;
    box(x,27.0,z+2.7,19.6,3.35,3,0xc6ccca);
    box(x,26.54,z+4.25,19.6,.29,.1,0x913f4a);
    for(let j=0;j<8;j++)box(x-8+j*2.26,27.55,z+4.24,1.43,.94,.11,0x43535c);
    box(x,28.84,z+2.7,8,.44,1.45,0x9ba6a7);
  }
}

function ship(p,x,z){
  const {box,beam}=p;
  const section=[[-102,3],[-92,11],[-67,15],[69,15],[94,10],[105,0]];
  for(let i=1;i<section.length;i++){
    const [a,w]=section[i-1],[b,v]=section[i];
    for(const s of [-1,1]){
      beam([x+a,2,z+s*w],[x+b,2,z+s*v],3.8,0x6b423e);
      beam([x+a,6,z+s*w],[x+b,6,z+s*v],5.2,0x354957);
    }
    box(x+(a+b)/2,8.1,z,b-a,1.55,Math.max(4,Math.min(w,v)*2),0x655f58);
  }
  for(let j=0;j<3;j++)box(x-73+j*1.4,11+j*4,z,19-j*2,4.9,26-j*2.6,0xd4d3c5);
  box(x-70,21.5,z,12,2.3,28,dark);box(x-70,22.8,z,14,.62,29,cream);
  for(let row=0;row<8;row++)for(const side of [-1,1])
    for(let k=0;k<(row%3===1?2:3);k++)p.container(x-48+row*15.3,9+k*3.65,z+side*5.9,14.7,3.55,9.3,(row+k+(side>0?2:0)),false);
}

export function waterfront(p,district){
  const {box,beam,solid,sign,tree}=p;
  const labels=districts[district];
  sign(labels[0],-247,6.3,83,Math.PI,13.5);
  for(const x of [-253,-241])box(x,3.2,83,.22,6.3,.27,steel);
  if(district==='lock')lock(p);
  if(district==='tsukuda'){
    bridge(p,-25,261,271,false);tug(p,123,155,21);tug(p,-205,181,17);
  }
  if(district==='toyosu')toyosu(p);
  if(district==='rail')railway(p);
  if(district==='wakasu'){
    bridge(p,-120,370,620,true);serviceFloats(p);
    const x=218,z=19;
    beam([x,0,z],[x,53,z],2.1,cream);
    box(x,54,z,3.3,3.1,5.5,cream);solid(x,z,2.4,2.4,52);
    for(let i=0;i<3;i++){
      const a=i*2*Math.PI/3+.18;
      beam([x,54,z+2.9],[x+Math.sin(a)*20,54+Math.cos(a)*20,z+3.3],.85,cream);
    }
    for(let k=0;k<6;k++){
      const xx=-402+150*k;
      for(const s of [-1,1])for(const t of [-1,1])box(xx+s*4,2.2,90+t*2.2,.32,4.4,.32,dark);
      box(xx,4.55,90,10,.41,6.2,0x768b7a);
      tree(xx-8,83,1.2,k);
    }
  }
  if(district==='aomi'){
    for(const x of [-607,-370,-116,153,404,625])dockCrane(p,x,103,1.42,true);
    ship(p,-92,196);ship(p,443,221);
    for(const x of [-442,303])tug(p,x,180,18);
  }
  const xs=district==='lock'?[-90,9,346]:[-444,-252,-36,244,474];
  for(const x of xs){
    box(x,.65,114,2.4,1.25,1.3,0x3e4543);box(x,1.3,114,3,.34,1.35,yellow);
    for(const z of [118.4,119.1])beam([x+3,-1.8,z],[x+3,1.4,z],.12,steel);
    for(let j=0;j<6;j++)beam([x+3,-1.2+j*.45,118.4],[x+3,-1.2+j*.45,119.1],.12,steel);
  }
}
