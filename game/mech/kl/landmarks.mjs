// Scale the silhouettes to the mission streets; all dimensions here are game metres.
export function twinTowers(p,x,z,k=1,near=true){
  const {put,box,wall,beam}=p,steel=0xc3cbd0,glass=0x5d7885;
  const span=58*k;
  for(const side of [-1,1]){
    const cx=x-side*span*.34,cz=z+side*span*.5;
    // Eight pointed perimeter, setbacks and continuous stainless sunshades.
    const bands=[[0,144,21],[144,205,19.8],[205,249,17.6],[249,278,14.7],[278,301,11.8],[301,319,8.5],[319,331,5.3]];
    for(const [low,high,r] of bands){
      put('star',cx,(high+low)*.5*k,cz,r*k,(high-low)*k,r*k,glass);
      for(let y=low+2;y<high;y+=near?3.6:9)put('star',cx,y*k,cz,(r+.53)*k,(near?.88:1.3)*k,(r+.53)*k,steel);
      put('star',cx,high*k,cz,(r+.25)*k,1.1*k,(r+.25)*k,steel);
    }
    put('spire',cx,341*k,cz,5.6*k,21*k,5.6*k,steel);
    put('pole',cx,357*k,cz,.68*k,14*k,.68*k,steel);
    if(near)wall(cx,cz,36*k,38*k,330*k);
  }
  const ax=x+span*.34,az=z-span*.5,bx=x-span*.34,bz=z+span*.5;
  for(const y of [137,141,146])beam([ax,y*k,az],[bx,y*k,bz],(y===141?5.2:5.7)*k,(y===141?6:1.3)*k,y===141?glass:steel);
  for(const side of [-1,1])beam([x-side*span*.29,111*k,z+side*span*.42],[x,137*k,z],1.5*k,1.5*k,steel);
  if(near){
    box(x,7,z,104,14,113,0xc9c1ab);box(x,15,z,98,2.3,109,0x95a8aa);
    wall(x,z,104,113,16);
  }
}
export function districtLandmark(p,id){
  const {box,put,wall,sign,beam,ground}=p,ivory=0xe6d9ba;
  if(id==='klcc'){twinTowers(p,80,80);sign('SURIA KLCC',77,11,23.35,Math.PI,23);return;}
  if(id==='brickfields'){
    for(const side of [-1,1])for(let i=0;i<18;i++){
      const x=-362+i*13,z=-160+side*20,plum=i%3===0?0x943d55:0xa45249;
      for(const off of [-4.8,4.8]){
        box(x+off,2.25,z,.88,4.5,.98,0xddba67);box(x+off,.65,z,1.35,1.3,1.25,plum);
        box(x+off,4.15,z,1.43,.65,1.34,0x628e85);
      }
      put('arch',x,4.15,z,9.9,2.6,.80,plum);
      box(x,6.85,z,10.4,.36,1.19,0xe6b653);put('dome',x,7.05,z,1.45,1.35,.78,0x67877e);
    }
    sign('LITTLE INDIA',-195,5.9,-181,0,13);
  }else if(id==='market'){
    box(80,7,67,113,14,86,0x71acae);wall(80,67,113,86,14);
    box(80,9.2,23.1,112,.36,1.5,ivory);box(80,13.55,23.1,112,.42,1.5,ivory);
    for(let i=0;i<13;i++){
      const x=28+i*8.7;
      box(x,2.85,23.2,5.5,5.2,.37,0x364e51);
      box(x,5.55,22.85,6.1,.39,.80,ivory);
      box(x,2.85,22.98,.16,5.12,.4,0xa9b8a8);
    }
    for(const x of [29,48,66,94,112,131]){
      box(x,10.2,23.55,12.5,5.0,.5,0x568b97);
      for(let j=-2;j<=2;j++)box(x+j*2.18,10.2,23.1,.23,5.0,.5,ivory);
    }
    for(let i=0;i<3;i++)box(80,13.8+i*1.65,24.0,38-i*12,3.0,2.6,0x82bec0);
    for(let i=-2;i<=2;i++)box(80+i*3.1,10,22.3,.68,14-Math.abs(i)*1.15,.82,ivory);
    box(80,4.1,19.8,34,.65,7.6,ivory);sign('CENTRAL MARKET',80,12.4,21.35,Math.PI,26);
  }else if(id==='merdeka'){
    ground('grass',80,-80,137,131,.22,0xadb689,12);
    const z=38;
    box(80,7.4,z,128,14.8,28,0xb88162);wall(80,z,128,28,14.8);
    box(80,15.1,z,131,1.05,30,ivory);
    for(let i=0;i<20;i++){
      const x=21+i*6.2;
      for(const y of [0,6.8]){
        box(x,y+2.25,z-14.5,4.0,4.5,.28,0x393b36);
        put('arch',x,y+3.7,z-15,5.5,2.7,.9,ivory);
      }
    }
    for(const x of [25,135,80]){
      const center=x===80,h=center?32:20,r=center?4.8:3.9;
      box(x,h*.52,z-8,2.05*r,h,2.05*r,0xb78e71);
      for(const level of [h-.3,h*.74])box(x,level,z-8,r*2.35,.65,r*2.35,ivory);
      put('dome',x,h,z-8,r*1.32,r*1.9,r*1.32,0xa37454);
      put('pole',x,h+r*2.05,z-8,.17,r*.65,.17,ivory);
      if(center)for(const side of [-1,1]){
        put('dial',x,h-4,z-8+side*(r*1.04),2.8,2.8,.16,0xe9dec1);
        box(x,h-3.36,z-8+side*(r*1.07),.17,1.43,.12,0x39352e);
        box(x+.64,h-4.1,z-8+side*(r*1.07),1.48,.19,.12,0x39352e);
      }
    }
    put('pole',33,27,-39,.25,54,.25,0xb9bcbc);
    sign('DATARAN MERDEKA',55,3.1,-26,0,18);
  }else if(id==='bintang'){
    for(let x=-690;x<=690;x+=38){
      if(Math.abs(x-Math.round(x/160)*160)<15)continue;
      box(x,10.6,10,1.6,21.2,2.2,0xa39c88);
      box(x,20.2,10,2.6,1.4,4.5,0xb6ad9c);wall(x,10,1.6,2.2,21.2);
    }
    for(const z of [8.1,11.9]){
      box(0,22,z,1440,2.05,1.58,0xb6b2a7);
      wall(0,z,1440,1.58,23.03,20.97);
    }
    for(let i=0;i<4;i++){
      const x=62+i*12.2;
      box(x,24.7,8.1,11.8,2.9,2.72,0xdddcd1);
      box(x,25,8.1,11.58,1.26,2.84,0x395362);
      box(x,23.8,8.1,11.85,.24,2.83,0x9f4345);
      for(let j=-4;j<=4;j+=2)box(x+j,25,8.1,.14,1.3,2.89,0xc6c6b6);
    }
    p.facade(75,66,110,81,28,0,0xcfd3c7);box(75,28.5,66,111,1,82,0x9aa5a2);wall(75,66,110,81,28);
    for(let y=5;y<28;y+=4.6)box(75,y,24.7,110,.62,1.9,ivory);
    sign('BUKIT BINTANG',75,18,23.5,Math.PI,26);
  }else if(id==='titiwangsa'){
    const water=0x547e79;
    // The path follows a lobed shore. A single triangulated surface catches sky light across the whole lake.
    const outline=[];
    for(let i=0;i<80;i++){
      const a=i*Math.PI/40,r=1+.055*Math.sin(3*a+.4)+.04*Math.cos(5*a);
      outline.push([45+197*r*Math.cos(a),78+195*r*Math.sin(a)]);
    }
    p.lake(outline,water);
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length];
      beam([a[0],.45,a[1]],[b[0],.45,b[1]],4.1,.42,0xbba988);
    }
    box(-111,.9,172,37,1.1,6,0x957e5c);
    for(let i=0;i<outline.length;i+=2){
      const [a,b]=outline[i],x=45+(a-45)*1.10,z=78+(b-78)*1.10;
      p.tree(x,z,1.4+.43*Math.sin(i*2.43),i%6===0);
    }
    for(const [x,z] of [[-153,95],[48,299],[264,104]]){
      box(x,.70,z,10,1.4,8,0xb7ac91);
      for(const sx of [-1,1])for(const sz of [-1,1])box(x+sx*4,2.9,z+sz*3,.33,4.5,.33,0x716754);
      for(const side of [-1,1])box(x+side*2.9,6.0,z,6.7,.34,10.5,0x876052,0,0,-side*.36);
    }
    for(let j=0;j<5;j++)put('pole',-127+j*8,1.1,174.6,.14,2.2,.14,ivory);
    sign('TAMAN TASIK TITIWANGSA',-150,4,-74,Math.PI,21);
  }
}
