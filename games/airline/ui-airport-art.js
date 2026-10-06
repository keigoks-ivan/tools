// Original miniature architecture, ground paint and aircraft; no downloaded assets.
// Shapes are shared and instanced by the world renderer. Textures are drawn once.
export function buildAirportArt(T, { scene, geometries, mat, cube, ball, cyl, part, rounded, batchGroup, hubId }) {
  const textures = [], plots = {}, sites = {}, facilities = {};
  function bevel(color,x,y,z,sx,sy,sz,r=.12,parent=null) {
    const key=`bevel/${sx}/${sy}/${sz}/${r}`;
    if(!geometries[key]) {
      const s=new T.Shape(),w=sx/2,h=sz/2;
      s.moveTo(-w+r,-h);s.lineTo(w-r,-h);s.quadraticCurveTo(w,-h,w,-h+r);s.lineTo(w,h-r);s.quadraticCurveTo(w,h,w-r,h);s.lineTo(-w+r,h);s.quadraticCurveTo(-w,h,-w,h-r);s.lineTo(-w,-h+r);s.quadraticCurveTo(-w,-h,-w+r,-h);
      const g=new T.ExtrudeGeometry(s,{depth:Math.max(.02,sy-r),bevelEnabled:true,bevelSize:r/2,bevelThickness:r/2,bevelSegments:innerWidth<900?1:2,curveSegments:innerWidth<900?3:4});g.rotateX(-Math.PI/2);g.translate(0,-sy/2+r/2,0);geometries[key]=g;
    }
    return part(key,color,x,y,z,1,1,1,0,0,parent);
  }
  function sign(text,x,y,z,w,h,{ground=false,color='#fff1c7',background='#245673',parent=scene,ry=0}={}) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=Math.round(512*h/w);
    const c=canvas.getContext('2d');c.fillStyle=background;c.fillRect(0,0,512,canvas.height);c.fillStyle=color;c.font=`bold ${canvas.height*.65}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,canvas.height*.54,480);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;textures.push(texture);
    const geometry=new T.PlaneGeometry(w,h);geometries['sign'+textures.length]=geometry;
    const material=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});mat.extra.push(material);
    const m=new T.Mesh(geometry,material);m.position.set(x,y,z);m.rotation.set(ground?-Math.PI/2:0,ry,0);parent.add(m);return m;
  }
  // Shared soft contact shadows keep tiny ground details legible, also on phones.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,2,32,32,32);
  gradient.addColorStop(0,'rgba(17,45,58,.36)');gradient.addColorStop(.5,'rgba(17,45,58,.17)');gradient.addColorStop(1,'rgba(17,45,58,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
  const shadowTexture=new T.CanvasTexture(canvas);textures.push(shadowTexture);
  const shadowMaterial=new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false});mat.extra.push(shadowMaterial);
  geometries.contact=new T.PlaneGeometry(1,1);geometries.contact.rotateX(-Math.PI/2);
  const contacts=[];
  function contact(x,z,w,d,parent=scene,y=.27) {const m=new T.Mesh(geometries.contact,shadowMaterial);m.position.set(x,y,z);m.scale.set(w,1,d);if(parent===scene){m.updateMatrix();contacts.push(m.matrix.clone());}else parent.add(m);return m;}
  rounded('#739caf',0,-.8,0,36,1.5,26,1.2);
  rounded('#8abc9d',0,.02,0,35.6,.2,25.6,1.05);
  rounded('#d3d1ba',-.4,.17,1.6,30,.1,12.5,.5);
  // Apron slabs, drainage strips, grass inlays, and contrasting runway shoulders.
  for(let x=-14;x<15;x+=2.4)for(let z=-.9;z<6.7;z+=2.4)cube('#c3cec5',x,.244,z,.022,.006,2.3);
  for(let z=-.9;z<6.7;z+=2.4)cube('#c3cec5',0,.247,z,29,.006,.022);
  cube('#879b94',0,.2,9.2,33.6,.06,4.55);cube('#324e60',0,.25,9.2,33,.08,3.8);
  cube('#627c83',0,.23,5.5,32,.07,1.25);
  for(let i=-14;i<=14;i+=2){cube('#f5eed8',i,.3,9.2,1,.012,.11);cube('#efc878',i,.278,5.5,.65,.012,.06);}
  for(const z of [7.45,10.95])cube('#d7e4dd',0,.298,z,32,.008,.025);
  for(const side of [-1,1])for(let i=0;i<6;i++)cube('#edf1e3',side*14,.302,7.98+i*.43,1.6,.014,.19);
  sign('09',-12,.303,9.2,1.5,1.25,{ground:true,background:'#324e60'});sign('27',12,.304,9.2,1.5,1.25,{ground:true,background:'#324e60'});
  for(let i=-16;i<=16;i+=1.25)for(const z of [7.2,11.25]){cyl('#426c82',i,.28,z,.1,.08,.1);ball('#97dbed',i,.34,z,.052,.055,.052);}
  for(const x of [-16.5,16.5])for(const z of [8,8.6,9.2,9.8,10.4])ball('#efbd76',x,.32,z,.065,.06,.065);
  for(const x of [-11,9]){cube('#77918d',x,.21,7,1.15,.04,2.3);cube('#efc878',x,.284,7,.05,.012,2.3);}
  for(let x=-11;x<14;x+=4){
    cube('#efbd68',x,.26,3.1,.07,.016,3.6);cube('#efbd68',x,.26,1.25,1.8,.016,.07);
    for(const side of [-1,1])cube('#dce6dc',x+side*1.4,.25,2.8,.035,.008,2.7);
    sign(`G${(x+11)/4+1}`,x,.264,3.1,.75,.32,{ground:true,color:'#efc878',background:'#d3d1ba'});
  }
  for(let x=-15;x<16;x+=1.6)for(const z of [-11.6,12.35]){cyl('#77949d',x,.66,z,.022,.8,.022);cube('#91acaa',x,.86,z,1.6,.03,.03);}
  cube('#536f80',0,.21,-9,33,.09,1.5);
  for(let i=-15;i<16;i+=2)cube('#ededd2',i,.268,-9,.8,.012,.055);
  for(let i=0;i<6;i++)cube('#ecedd8',-8.5+i*.2,.27,-9,.09,.016,1.5);
  bevel('#a9baad',-1,.34,-6.7,15,.25,1.1,.1);
  // Six vaulted roof bays sit above a deep, lit passenger concourse.
  contact(-1,-3.6,16,7);
  bevel('#91a8b0',-1,.42,-3.6,14,.35,5.9,.13);
  bevel('#e8dcc6',-1,1.4,-3.7,13.6,2.15,5.1,.2);
  cube('#304e65',-1,1.55,-.99,12.8,1.6,.13);
  cube('#7499a5',-1,.68,-.86,12.8,.16,.15);
  for(let x=-7;x<=5;x+=1){
    cube('#4c94a8',x+.46,1.67,-.89,.88,1.25,.11);cube('#aed4d3',x+.62,1.9,-.816,.018,.85,.015);
    cube('#b8dcd6',x+.85,1.7,-.813,.045,1.3,.025);cube('#a2bbc1',x,1.5,-.78,.08,1.8,.2);
    cube('#ead9a3',x+.35,1.05,-.802,.25,.13,.03);cube('#f3e7bd',x+.34,2.18,-.797,.45,.04,.02);
  }
  // Rounded roof strips have a shallow arch, with skylights and raised silver seams.
  const roof=new T.Shape();roof.moveTo(-2.95,0);roof.quadraticCurveTo(0,1.5,2.95,0);roof.lineTo(2.95,-.17);roof.quadraticCurveTo(0,1.31,-2.95,-.17);roof.closePath();
  geometries.vault=new T.ExtrudeGeometry(roof,{depth:2.23,bevelEnabled:true,bevelSize:.04,bevelThickness:.035,bevelSegments:2,curveSegments:12});geometries.vault.rotateY(-Math.PI/2);geometries.vault.translate(1.115,0,0);
  for(let i=0;i<6;i++){
    const x=-6.8+i*2.32;part('vault',i%2?'#80afbd':'#b5d8d9',x,2.71,-3.6,1,1,1);
    bevel('#497f97',x,3.61,-3.7,1.16,.085,2.4,.04);cube('#5c91ad',x+.06,3.666,-3.7,1,.028,2.18);
    for(const z of [-4.5,-3.7,-2.9])cube('#b9d4d6',x,3.687,z,1.12,.018,.025);
  }
  bevel('#d9ece7',-1,2.63,-.78,14,.26,.52,.08);cube('#76afbd',-1,2.69,-.492,13.6,.07,.035);
  sign('SKYGLAZE',-1,2.14,-.77,3.7,.55,{background:'#304e65'});
  // Curved landside canopy, automatic doors and decorative planting beds.
  bevel('#bdd8d7',-1,1.95,-6.7,13.8,.18,.8,.14);
  for(const x of [-6,-3,1,4]){cyl('#749dad',x,1.12,-6.92,.045,1.7,.045);cube('#4c839b',x,1.25,-6.27,.9,1.45,.06);cube('#d7e4dc',x,1.24,-6.32,.025,1.3,.02);}
  for(let x=-7;x<7;x+=1.8){bevel('#c9d6c1',x,.45,-7.4,1.5,.3,.45,.06);for(const dx of [-.5,0,.5])ball('#548d77',x+dx,.7,-7.4,.3,.3,.24);}
  // Glass-sided jet bridges, accordion docking heads, support legs and wheels.
  for(const x of [-5,-1,3]){
    cube('#749dad',x,.85,.4,.52,.12,2.7);cube('#c9e0dc',x,1.62,.4,.68,.1,2.7);
    for(const dx of [-.36,.36]){cube('#4d8c9e',x+dx,1.23,.4,.045,.62,2.65);for(let z=-.8;z<1.6;z+=.35)cube('#b7d9d7',x+dx,1.24,z,.045,.69,.035);}
    cube('#75959c',x,.7,.9,.15,.95,.15);
    bevel('#477289',x,1.15,1.77,1,.8,.62,.09);cube('#2d4b5e',x,1.1,2.08,.8,.5,.05);
    for(let z=1.51;z<1.99;z+=.08)cube('#8ba9b0',x,1.55,z,1.02,.045,.026);
    for(const dx of [-.31,.31])ball('#284958',x+dx,.35,1.76,.12,.12,.12);
    sign(`0${(x+5)/4+1}`,x,1.73,1.78,.55,.25,{background:'#477289'});
  }
  // Layered tower with an octagonal observation room and railings.
  contact(-10.8,-5.8,4,4);
  bevel('#b0c4bc',-10.8,.4,-5.8,2.6,.3,2.6,.15);
  bevel('#e7e4cf',-10.8,2.05,-5.8,1.5,3.3,1.5,.12);
  cube('#a3c8c9',-10.01,2.1,-5.8,.06,2.8,.35);
  cyl('#779ba8',-10.8,3.96,-5.8,1.5,.25,1.5);cyl('#365e77',-10.8,4.47,-5.8,1.25,.9,1.25);
  cyl('#9aced2',-10.8,4.48,-5.8,1.26,.4,1.26);cyl('#d5e7df',-10.8,5.01,-5.8,1.56,.17,1.56);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl('#d8e5d8',-10.8+Math.sin(a)*1.29,4.48,-5.8+Math.cos(a)*1.29,.026,.95,.026);}
  cyl('#5d8899',-10.8,5.45,-5.8,.043,.74,.043);ball('#f4bd6d',-10.8,5.85,-5.8,.1,.09,.1);
  cube('#5c90a4',-11.24,5.32,-5.8,.08,.4,.08);
  bevel('#c9dad1',-10.8,.92,-7.4,3.5,1.3,2,.15);bevel('#83b6be',-10.8,1.67,-7.4,3.8,.18,2.2,.1);
  for(let x=-12;x<=-9.5;x+=.6)cube('#578396',x,1.02,-8.42,.36,.5,.045);
  // Facility plots remain real sites rather than flattened finished buildings.
  function facility(id,x,z){
    const g=new T.Group();g.position.set(x,.2,z);g.userData.world=id;scene.add(g);facilities[id]=g;
    const plot=new T.Group();plot.position.copy(g.position);plot.userData.world=id;scene.add(plot);plots[id]=plot;
    bevel('#9cafa4',0,.08,0,4.55,.13,4.1,.14,plot);
    for(const dx of [-2.05,2.05])for(let dz=-1.8;dz<=1.8;dz+=.6){cyl('#7e9e9a',dx,.38,dz,.025,.6,.025,plot);cube('#aac0b1',dx,.45,dz,.025,.025,.6,0,plot);}
    for(const dx of [-1.65,-.9,.9,1.65])bevel('#d2b38a',dx,.3,-1.4,.52,.38,.5,.04,plot);
    sign(id==='depot'?'MRO':id==='lounge'?'VIP':'FUEL',0,.22,0,1.7,.5,{ground:true,color:'#6b8685',background:'#9cafa4',parent:plot});
    const site=new T.Group();site.position.copy(g.position);site.userData.world=id;scene.add(site);sites[id]=site;
    for(const dx of [-1.8,1.8])for(const dz of [-1.6,1.6]){cyl('#d6b567',dx,1.3,dz,.045,2.5,.045,site);}
    for(const y of [.6,1.5,2.4]){for(const dz of [-1.6,1.6])cube('#b8a77e',0,y,dz,3.7,.06,.06,0,site);for(const dx of [-1.8,1.8])cube('#b8a77e',dx,y,0,.06,.06,3.3,0,site);}
    cube('#dfbe6a',1.7,2,0,.12,3.8,.12,0,site);cube('#dfbe6a',.4,3.83,0,3,.12,.12,0,site);cube('#57757e',-.8,3.26,0,.035,1,.035,0,site);cube('#8cb3be',1.3,3.61,0,.45,.35,.4,0,site);
    bevel('#8ba6ad',0,.12,0,4.5,.2,4,.13,g);
    if(id==='depot'){
      bevel('#dce4db',0,1.33,-.1,4,2.4,3.5,.13,g);
      bevel('#729cae',0,2.62,-.1,4.6,.24,3.9,.12,g);
      for(let dx=-2;dx<=2;dx+=.5)cube('#6d9cac',dx,2.77,-.1,.035,.022,3.7,0,g);
      cube('#254659',0,1.18,1.68,3.2,1.86,.05,0,g);cube('#f2dca1',0,1.99,1.725,2.9,.11,.02,0,g);
      for(let dx=-1.5;dx<=1.5;dx+=.3)cube('#527986',dx,1.25,1.73,.065,1.38,.024,0,g);
      for(const dx of [-1.82,1.82]){cube('#e6b96e',dx,1.19,1.72,.15,1.9,.14,0,g);ball('#f1d593',dx,2.18,1.8,.095,.09,.05,g);}
      sign('SKY · MRO',0,2.34,1.73,1.7,.3,{parent:g});
      bevel('#aac1bd',-1.1,.34,2.2,.6,.44,.4,.05,g);
    }else if(id==='lounge'){
      bevel('#e6dec4',0,1.06,0,3.9,1.85,3.4,.2,g);
      cube('#315a6e',0,1.2,1.73,3.45,1.2,.055,0,g);
      for(let dx=-1.45;dx<1.5;dx+=.55){cube('#80b8b6',dx,1.27,1.77,.47,1,.055,0,g);cube('#dfe0bb',dx,1.34,1.804,.045,.93,.025,0,g);}
      bevel('#dedec4',0,2.06,0,4.45,.22,3.9,.2,g);bevel('#87b593',0,2.2,0,3.9,.1,3.35,.15,g);
      for(const dx of [-1.8,1.8])for(let dz=-1.3;dz<=1.3;dz+=.65)ball('#5f967a',dx,2.35,dz,.2,.24,.25,g);
      for(const dx of [-.85,.8]){cyl('#d7bf87',dx,2.45,.55,.38,.1,.38,g);cyl('#729795',dx,2.3,.55,.045,.25,.045,g);part('cone','#efe1b2',dx,2.93,.55,.7,.22,.7,0,0,g);cyl('#b4a680',dx,2.61,.55,.023,.62,.023,g);}
      sign('SKY LOUNGE',0,1.94,1.8,2,.28,{parent:g});
    }else{
      for(const dx of [-.95,.95]){
        cyl('#dee9db',dx,1,0,.8,1.65,.8,g);cyl('#83aeb9',dx,1.35,0,.808,.21,.808,g);ball('#c2d7d4',dx,1.84,0,.8,.17,.8,g);cyl('#88aab1',dx,1.96,0,.1,.15,.1,g);
        cube('#597c8b',dx+.65,1.1,.42,.038,1.65,.035,0,g);cube('#597c8b',dx+.45,1.1,.62,.035,1.65,.035,0,g);
        for(let y=.4;y<1.9;y+=.2)cube('#597c8b',dx+.56,y,.54,.28,.025,.03,-.7,g);
      }
      for(const dz of [1.3,1.55]){cube('#6996a1',0,.36,dz,3.2,.14,.14,0,g);for(const dx of [-1.4,1.4])cyl('#c6d4c4',dx,.25,dz,.12,.3,.12,g);}
      bevel('#719ca8',-1.65,.51,1.3,.7,.68,.7,.07,g);sign('FUEL',0,1.16,.84,1.05,.28,{parent:g});
    }
    contact(0,0,5.4,4.9,g,.04);
    [g,plot,site].forEach(batchGroup);
  }
  facility('depot',-12,-.5);facility('lounge',9,-3.1);facility('tank',13.8,-.8);
  // Pocket gardens, clipped hedges, ornamental trees and a landscaped entrance.
  for(const [x,z] of [[-16,-8],[-15,-6],[-16,-3],[-15,2],[14,-7],[16,-5],[15,-3],[10,-7],[8,-7],[-7,-10],[-4,-10],[3,-10],[6,-10]]){
    cyl('#c8d2b3',x,.23,z,.65,.16,.65);cyl('#9b8463',x,.83,z,.12,1.3,.12);
    ball('#4c977e',x,1.59,z,.66,.76,.66);ball('#78b38b',x-.24,1.98,z,.59,.63,.55);ball('#a0c597',x+.2,2.18,z,.33,.35,.35);
    contact(x,z,1.7,1.7);
  }
  for(const z of [-11.15,12])for(let x=-13;x<15;x+=1.3)bevel('#78a98b',x,.39,z,1.16,.35,.36,.1);
  for(const x of [-16,15.7])for(let z=-5;z<5;z+=2.4){bevel('#bacbb1',x,.25,z,.6,.18,1.5,.09);for(let i=0;i<4;i++)ball(i%2?'#e9c18b':'#d89683',x+(i%2)*.16-.08,.48,z-.45+i*.29,.09,.12,.09);}
  for(let x=-6;x<7;x+=1.4)for(const z of [-7.9,-10.5]){
    cube('#dce3d3',x-.5,.256,z,.025,.014,1.1);
    bevel(['#e4bb73','#78aaba','#e0e1d5'][Math.abs(Math.round(x))%3],x,.5,z,.58,.38,.99,.1);bevel('#31576d',x,.7,z-.03,.45,.14,.51,.04);
    for(const dx of [-.3,.3])for(const dz of [-.3,.3])ball('#385366',x+dx,.36,z+dz,.08,.08,.09);
  }
  for(const x of [-8,6,11,-13]){cyl('#648894',x,1.58,-1,.035,2.7,.035);cube('#648894',x+.21,2.9,-1,.47,.045,.07);bevel('#eddda4',x+.42,2.88,-1,.25,.08,.15,.025);}
  bevel('#93b4bd',6.7,.73,-7.35,1,.95,.8,.12);sign(hubId,6.7,1.12,-6.91,.78,.27);
  for(const [x,y,z] of [[-17,6,-11],[18,7,-9],[5,8,-16]]){ball('#e0eeea',x,y,z,2.1,.65,.8);ball('#f1f3e7',x+.2,y+.55,z,1.05,.95,.75);ball('#d2e6e2',x-1,y+.2,z,.9,.65,.7);}
  const contactBatch=new T.InstancedMesh(geometries.contact,shadowMaterial,contacts.length);contacts.forEach((m,i)=>contactBatch.setMatrixAt(i,m));scene.add(contactBatch);
  return {facilities,plots,sites,textures,bevel};
}

export function aircraftGeometry(T,geometries) {
  const wing=new T.Shape();wing.moveTo(0,-.3);wing.lineTo(1,-.04);wing.lineTo(1.12,.12);wing.lineTo(.98,.2);wing.lineTo(.14,.14);wing.lineTo(0,.35);wing.lineTo(-.14,.14);wing.lineTo(-.98,.2);wing.lineTo(-1.12,.12);wing.lineTo(-1,-.04);wing.closePath();
  geometries.wing=new T.ExtrudeGeometry(wing,{depth:.055,bevelEnabled:true,bevelSize:.02,bevelThickness:.02,bevelSegments:1});geometries.wing.rotateX(Math.PI/2);
  const tail=new T.Shape();tail.moveTo(-.2,0);tail.lineTo(.05,.85);tail.lineTo(.36,.84);tail.lineTo(.53,0);tail.closePath();
  geometries.fin=new T.ExtrudeGeometry(tail,{depth:.065,bevelEnabled:true,bevelSize:.02,bevelThickness:.01,bevelSegments:1});geometries.fin.rotateY(Math.PI/2);geometries.fin.translate(-.033,0,0);
}
