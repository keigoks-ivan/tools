import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Role equipment is skinned into the existing body and cached per role. All pieces
// keep one body material and its outline; the body atlas and small gear atlas are shared.
export const ONI_LOOKS = {
  grunt: { name: '鐵面妖兵', armor: 0xc4c5d2, cloth: 0x8b4b56, trim: 0xc3a079, glow: 0xc7a5ff },
  runner: { name: '疾爪斥候', armor: 0x92aaa0, cloth: 0x557865, trim: 0xbaa97f, glow: 0x9ceac1 },
  elite: { name: '玄甲精兵', armor: 0xbda57d, cloth: 0x725485, trim: 0xe4c89a, glow: 0xc1a2ff },
  shield: { name: '銅獅盾衛', armor: 0xd5b479, cloth: 0x596e88, trim: 0xf0d29b, glow: 0xffcf84 },
  archer: { name: '翳羽弓兵', armor: 0x94baa3, cloth: 0x507c59, trim: 0xcebb82, glow: 0x91edc6 },
  bomber: { name: '赤焰爆破兵', armor: 0xb3a08d, cloth: 0x9a482e, trim: 0xd1a26e, glow: 0xff9752 },
  summoner: { name: '幽燈咒師', armor: 0xaaa6d6, cloth: 0x7d5899, trim: 0xd1b6ef, glow: 0xd2a3ff },
  captain: { name: '赤旗戰督', armor: 0xcf9c74, cloth: 0xa13d46, trim: 0xe7bc75, glow: 0xffb07c },
  boss: { name: '冥冠魔君', armor: 0xd4ccb9, cloth: 0x7c416c, trim: 0xe4c68b, glow: 0xdfa2ff },
  'officer-red': { name: '赤甲敵將', armor: 0xd7a186, cloth: 0xa4483d, trim: 0xe5bd84, glow: 0xffae85 },
  'officer-shadow': { name: '影爪敵將', armor: 0x9caecc, cloth: 0x566592, trim: 0xc3d4e7, glow: 0x9dcaff },
  'officer-chase': { name: '追魂魔將', armor: 0xb7d5d6, cloth: 0x527f8f, trim: 0xdbe6da, glow: 0x9ceaff },
};
const SURFACE = { wood: 1, iron: 2, leather: 3, bronze: 4 };
const REG = { steel: [512,704,576,768], cloth: [896,448,1024,576], dark: [832,512,896,576], bone: [832,448,896,512], glow: [960,640,1024,704], plate: [128,128,256,256] };

export function createOniArt(T, templates) {
  const cache = new Map(), corpses = new Map();
  function build(style) {
    const look = ONI_LOOKS[style] || ONI_LOOKS.grunt;
    const heavy = style === 'boss' || style.startsWith('officer');
    const mesh = templates[heavy ? 'oni_boss' : 'oni_grunt'];
    if (!mesh) throw new Error('Missing oni body template');
    const skeleton = mesh.skeleton, bones = new Map(skeleton.bones.map((b,i) => [b.name,i]));
    const parts = [], features = [];
    const palette = Object.fromEntries(['armor','cloth','trim'].map(k => [k,new T.Color(look[k])]));
    palette.wood=new T.Color(0xb38151);palette.iron=new T.Color(0xb8c6d0);palette.leather=new T.Color(0x5a3b29);
    const base = mesh.geometry.clone();
    // Normalise source attribute storage before merging, retaining every bind weight.
    for (const name of ['position','normal','uv','skinIndex','skinWeight']) {
      const source = base.getAttribute(name), values = name === 'skinIndex' ? new Uint16Array(source.count*source.itemSize) : new Float32Array(source.count*source.itemSize);
      for(let i=0;i<source.count;i++) for(let k=0;k<source.itemSize;k++) values[i*source.itemSize+k]=source.getComponent(i,k);
      base.setAttribute(name,new T.BufferAttribute(values,source.itemSize));
    }
    const color = [];
    for(let i=0;i<base.attributes.uv.count;i++) {
      const u=base.attributes.uv.getX(i),v=base.attributes.uv.getY(i);
      const c=v>0.5625 ? palette.armor : u>0.875 && v>0.4375 && v<0.5625 ? palette.cloth : new T.Color(0xffffff);
      color.push(c.r,c.g,c.b);
    }
    base.setAttribute('color',new T.Float32BufferAttribute(color,3)); parts.push(base);
    function add(g, bone, position, scale=[1,1,1], rotation=[0,0,0], region='steel', tint='armor', name=region) {
      const joint=bones.get('mixamorig'+bone);
      if(joint===undefined) throw new Error(`Missing equipment bone ${bone}`);
      g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));
      const uv=g.attributes.uv, surface=SURFACE[region] || 0, rect=REG[region], n=g.attributes.position.count, c=palette[tint] || new T.Color(0xffffff), indices=new Uint16Array(n*4),weights=new Float32Array(n*4),colors=new Float32Array(n*3);
      for(let i=0;i<n;i++) {
        if(surface) uv.setXY(i,surface*2+.003+.994*Math.max(0,Math.min(1,uv.getX(i))),.003+.994*Math.max(0,Math.min(1,uv.getY(i))));
        else uv.setXY(i,(rect[0]+3+(rect[2]-rect[0]-6)*uv.getX(i))/1024,1-(rect[1]+3+(rect[3]-rect[1]-6)*uv.getY(i))/1024);
        indices[i*4]=joint; weights[i*4]=1; colors.set([c.r,c.g,c.b],i*3);
      }
      if(!g.index) g.setIndex(Array.from({length:n},(_,i)=>i));
      g.setAttribute('skinIndex',new T.BufferAttribute(indices,4)); g.setAttribute('skinWeight',new T.BufferAttribute(weights,4));g.setAttribute('color',new T.BufferAttribute(colors,3));
      const offset=parts.reduce((sum,p)=>sum+p.attributes.position.count,0);
      features.push({name,bone,offset,count:n,surface}); parts.push(g);
    }
    function plate(outline, depth=0.035) {
      const s=new T.Shape();s.moveTo(...outline[0]); for(const p of outline.slice(1)) s.lineTo(...p);s.closePath();
      // Extrusion uses non-indexed triangles; give every part an index for merging.
      const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:0.012,bevelThickness:0.009,bevelSegments:1,steps:1,curveSegments:3});
      g.computeBoundingBox();
      const bounds=g.boundingBox, uv=g.attributes.uv, pos=g.attributes.position;
      for(let i=0;i<uv.count;i++) uv.setXY(i,(pos.getX(i)-bounds.min.x)/(bounds.max.x-bounds.min.x),(pos.getY(i)-bounds.min.y)/(bounds.max.y-bounds.min.y));
      g.setIndex(Array.from({length:pos.count},(_,i)=>i));return g;
    }
    const box=(bone,pos,size,region='steel',tint='armor',rot=[0,0,0],name=region)=>add(new T.BoxGeometry(...size),bone,pos,[1,1,1],rot,region,tint,name);
    const tube=(points,radius,bone,region='steel',tint='trim',name=region)=>add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),Math.max(3,points.length*2),radius,5,false),bone,[0,0,0],[1,1,1],[0,0,0],region,tint,name);
    function cloth(bone,x,y,z,w,h,tilt=0) {
      const p=[],uv=[],ix=[];
      for(let j=0;j<=3;j++) for(let i=0;i<=3;i++) {
        const u=i/3,v=j/3;
        p.push((u-.5)*w*(1+v*.12),-v*h+Math.cos(u*Math.PI*2)*v*v*.035,Math.sin(u*Math.PI*3+v)*.035*v);
        uv.push(u,v);if(i<3&&j<3){const k=j*4+i;ix.push(k,k+4,k+1,k+1,k+4,k+5);}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();
      const back=g.clone();for(let i=0;i<back.index.count;i+=3){const a=back.index.getX(i);back.index.setX(i,back.index.getX(i+1));back.index.setX(i+1,a);}back.computeVertexNormals();
      add(g,bone,[x,y,z],[1,1,1],[0,0,tilt],'cloth','cloth','layered cloth');add(back,bone,[x,y,z],[1,1,1],[0,0,tilt],'cloth','cloth','cloth lining');
    }
    // Sculpted breast armour with a raised centre; lower lames stay on the hips.
    if(style!=='runner' && style!=='archer') {
      add(plate([[-.14,.12],[.14,.12],[.18,-.025],[.10,-.13],[0,-.19],[-.10,-.13],[-.18,-.025]]),'Spine2',[0,1.53,.155],[1,1,1],[.10,0,0],'plate','armor','breastplate');
      box('Spine2',[0,1.52,.202],[.018,.19,.015],'bone','trim',[0,0,0],'armour keel');
    }
    cloth('Hips',0,1.11,.16,heavy?.35:style==='summoner'?.33:.25,heavy?.47:style==='summoner'?.65:.35);
    for(const side of [-1,1]) {
      const arm=side>0?'LeftArm':'RightArm';
      if(style!=='runner' && style!=='archer') add(plate([[-.13,.045],[0,.09],[.15,.045],[.17,-.08],[.06,-.16],[-.13,-.10]]),arm,[side*.28,1.65,.03],[1,1,1],[.6,0,side*-.28],'plate','armor','layered pauldron');
      if(heavy || style==='elite' || style==='shield' || style==='captain') {
        for(let i=0;i<3;i++) add(plate([[-.10,.02],[.10,.02],[.12,-.04],[.07,-.075],[-.09,-.065]],.02),'Hips',[side*.18,1.10-i*.075,.12],[1,1,1],[0,side*.25,side*.14],'steel','armor','waist lame');
      }
    }
    if(style==='runner' || style==='archer') {
      cloth('Spine2',-.14,1.62,-.14,.27,.40,-.25);
      box('Spine2',[0,1.46,.145],[.34,.034,.03],'dark','trim',[0,0,-.4],'leather harness');
    }
    if(style==='shield') {
      const shape=[[-.31,.39],[.31,.39],[.365,.10],[.28,-.33],[0,-.53],[-.28,-.33],[-.365,.10]];
      const bow=u=>.045*(1-(u/.37)**2);
      const point=(u,v,offset=0)=>[.82+v,1.665-u,.225+bow(u)+offset];
      const panel=plate(shape,.055),pos=panel.attributes.position;
      for(let i=0;i<pos.count;i++) pos.setZ(i,pos.getZ(i)+bow(pos.getX(i)));
      panel.computeVertexNormals();
      add(panel,'LeftForeArm',[.82,1.665,.17],[1,1,1],[0,0,-Math.PI/2],'wood','wood','shield shell');
      tube([...shape,shape[0]].map(([u,v])=>point(u,v,.012)),.017,'LeftForeArm','bronze','trim','shield rim');
      for(const u of [-.24,-.12,.12,.24]) {
        const bottom=-.33-.20*(1-Math.abs(u)/.28);
        tube([point(u,bottom+.03,.003),point(u,0,.003),point(u,.37,.003)],.0035,'LeftForeArm','leather','leather','plank joint');
      }
      for(const [u,v] of [...shape,[0,.39]]) add(new T.SphereGeometry(.012,6,4),'LeftForeArm',point(u*.90,v*.93,.022),[1,1,.65],[0,0,0],'iron','iron','shield rivet');
      add(new T.SphereGeometry(.076,10,6),'LeftForeArm',[.82,1.665,.30],[1,1,.32],[0,0,0],'iron','iron','shield boss');
      add(new T.TorusGeometry(.083,.009,4,16),'LeftForeArm',[.82,1.665,.30],[1,1,1],[0,0,0],'bronze','trim','boss collar');
      add(plate([[-.06,.06],[-.04,.115],[.015,.13],[.065,.075],[.054,.01],[.07,-.015],[.04,-.078],[0,-.10],[-.045,-.068],[-.073,.015]],.012),'LeftForeArm',[.82,1.665,.331],[1,1,1],[0,0,-Math.PI/2],'bronze','trim','lion crest');
      for(const v of [.20,-.21]) tube([point(-.15,v+.045,.013),point(0,v-.025,.013),point(.15,v+.045,.013)],.007,'LeftForeArm','bronze','trim','shield chevron');
      for(const u of [-.13,.13]) tube([point(u,-.17,-.115),point(u,0,-.19),point(u,.17,-.115)],.023,'LeftForeArm','leather','leather','shield arm strap');
      cloth('Spine2',0,1.65,-.17,.36,.50);
    }
    if(style==='archer') {
      // Laminated limbs have a flattened cross-section and recurved tips, rather than a round stick.
      const curve=new T.CatmullRomCurve3([[.40,1.44,.09],[.49,1.36,.09],[.64,1.40,.09],[.81,1.57,.09],[.935,1.665,.09],[1.06,1.57,.09],[1.25,1.40,.09],[1.41,1.36,.09],[1.50,1.44,.09]].map(p=>new T.Vector3(...p)));
      const points=curve.getPoints(24),p=[],uv=[],ix=[],edges=[[],[]];
      for(let i=0;i<points.length;i++) {
        const t=i/24,c=points[i],tangent=curve.getTangent(t),normal=new T.Vector3(-tangent.y,tangent.x,0).normalize();
        const width=.013+.020*Math.sin(Math.PI*t),thick=.010+.006*Math.sin(Math.PI*t);
        for(const [side,front] of [[-1,1],[1,1],[-1,-1],[1,-1]]) {
          p.push(c.x+normal.x*width*side,c.y+normal.y*width*side,c.z+front*thick);uv.push((side+1)/2,t);
        }
        for(const [k,side] of [[0,-1],[1,1]]) edges[k].push([c.x+normal.x*width*side,c.y+normal.y*width*side,c.z+thick+.002]);
        if(i<24){const k=i*4;for(const [a,b] of [[0,1],[1,3],[3,2],[2,0]])ix.push(k+a,k+b,k+4+a,k+b,k+4+b,k+4+a);}
      }
      ix.push(0,2,1,1,2,3,96,97,98,97,99,98);
      for(let i=0;i<ix.length;i+=3){const b=ix[i+1];ix[i+1]=ix[i+2];ix[i+2]=b;}
      const limb=new T.BufferGeometry();limb.setAttribute('position',new T.Float32BufferAttribute(p,3));limb.setAttribute('uv',new T.Float32BufferAttribute(uv,2));limb.setIndex(ix);limb.computeVertexNormals();
      add(limb,'LeftHand',[0,0,0],[1,1,1],[0,0,0],'wood','wood','recurve bow');
      for(const edge of edges) tube(edge.filter((_,i)=>i%4===0),.0035,'LeftHand','bronze','trim','limb inlay');
      tube([[.40,1.44,.09],[.935,1.435,.09],[1.50,1.44,.09]],.003,'LeftHand','bone','trim','bow string');
      tube([[.88,1.655,.09],[.99,1.655,.09]],.026,'LeftHand','leather','leather','wrapped bow grip');
      for(const x of [.895,.920,.945,.970]) add(new T.TorusGeometry(.027,.0045,4,8),'LeftHand',[x,1.655,.09],[1,1,1],[0,Math.PI/2,0],'leather','trim','grip binding');
      for(const [x,y] of [[.40,1.44],[1.50,1.44]]) add(new T.CylinderGeometry(.017,.013,.04,6),'LeftHand',[x,y,.09],[1,1,1],[0,0,Math.PI/2],'bronze','trim','bow nock');
      add(new T.CylinderGeometry(.079,.065,.43,10,1,true),'Spine2',[-.15,1.41,-.24],[1,1,1],[0,0,-.28],'leather','leather','back quiver');
      for(const [x,y,r] of [[-.091,1.616,.080],[-.209,1.203,.066]]) add(new T.TorusGeometry(r,.012,4,12).rotateX(-Math.PI/2),'Spine2',[x,y,-.24],[1,1,1],[0,0,-.28],'bronze','trim','quiver rim');
      add(plate([[-.11,.12],[.07,.10],[.13,-.11],[.04,-.17],[-.12,-.08]],.018),'Spine2',[.06,1.52,.17],[1,1,1],[.10,0,-.20],'leather','leather','archer chest guard');
      for(let i=0;i<5;i++) {
        const x=-.134+i*.022,y=1.86+(i%2)*.025,z=-.26+(i%2)*.025;
        tube([[x-.073,1.35,z],[x+.095,y+.085,z]],.0055,'Spine2','wood','wood','arrow shaft');
        for(const angle of [0,Math.PI/2]) add(plate([[-.024,0],[0,.065],[.024,0],[0,-.025]],.005),'Spine2',[x+.073,y,z],[1,1,1],[0,angle,-.28],'cloth','cloth','arrow feather');
      }
    }
    if(style==='bomber') {
      add(new T.SphereGeometry(.22,10,7),'Spine2',[0,1.43,-.28],[1,.95,1],[0,0,0],'dark','armor','powder vessel');
      for(const r of [-.65,.65]) add(new T.TorusGeometry(.218,.016,4,12),'Spine2',[0,1.43,-.28],[1,1,1],[r,Math.PI/2,0],'steel','trim','powder cage');
      for(const y of [1.35,1.51]) add(new T.TorusGeometry(.203,.014,4,12),'Spine2',[0,y,-.28],[1,1,1],[Math.PI/2,0,0],'bone','trim','powder hoop');
      tube([[0,1.62,-.42],[.13,1.74,-.46],[.25,1.75,-.45]],.015,'Spine2','glow','white','lit fuse');
      for(const side of [-1,1]) box('Spine2',[side*.145,1.45,.12],[.035,.30,.025],'dark','trim',[0,0,side*-.2],'powder harness');
    }
    if(style==='summoner') {
      cloth('Spine2',-.13,1.63,-.12,.33,.68,.22);cloth('Spine2',.13,1.63,-.12,.33,.68,-.22);
      tube([[-.22,1.665,0],[-.66,1.665,.03],[-1.12,1.665,.05],[-1.48,1.665,.07]],.025,'RightHand','dark','trim','ritual staff');
      add(new T.TorusGeometry(.14,.019,4,16),'RightHand',[-.28,1.665,.07],[1,1,1],[0,0,Math.PI/2],'steel','trim','staff halo');
      add(new T.OctahedronGeometry(.088),'RightHand',[-.28,1.665,.07],[1,1,1],[0,0,0],'glow','white','soul crystal');
    }
    if(style==='captain' || heavy) {
      cloth('Spine2',0,1.68,-.16,heavy?.48:.36,heavy?.77:.57);
      // Pitched sashimono has folds and a frame, rather than a flat red rectangle.
      if(style==='captain') {
        tube([[0,1.25,-.25],[0,2.35,-.25]],.018,'Spine2','dark','trim','banner mast');
        cloth('Spine2',0,2.33,-.26,.46,.55);
        box('Spine2',[0,2.35,-.25],[.50,.025,.025],'steel','trim',[0,0,0],'banner crossbar');
        add(plate([[-.065,0],[0,.11],[.065,0],[0,-.11]],.008),'Spine2',[0,2.06,-.31],[1,1,1],[0,Math.PI,0],'bone','trim','banner sigil');
      }
      for(const side of [-1,1]) add(new T.ConeGeometry(.045,.18,5),'Head',[side*.15,2.07,-.01],[1,1,1],[0,0,side*-.38],'bone','trim','crown spear');
    }
    if(style==='captain' || style==='elite' || style==='grunt') {
      add(plate([[-.032,0],[.032,0],[.045,.60],[.09,.76],[.035,.88],[-.026,.78]],.025),'RightHand',[-1.02,1.665,.06],[1,1,1],[0,0,Math.PI/2],'steel','armor','forged sabre');
      tube([[-.89,1.665,.06],[-1.03,1.665,.06]],.022,'RightHand','dark','trim','wrapped sword grip');
      box('RightHand',[-1.01,1.665,.06],[.027,.18,.028],'bone','trim',[0,0,0],'sabre guard');
    }
    const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();
    geometry.userData.features=features;geometry.userData.style=style;
    return geometry;
  }
  return {
    geometry(style) { if(!cache.has(style)) cache.set(style,build(style));return cache.get(style); },
    corpseGeometry(style) {
      if(!corpses.has(style)) {
        const live=this.geometry(style),held=live.userData.features.filter(f=>/Hand|ForeArm/.test(f.bone));
        if(!held.length) return live;
        const g=new T.BufferGeometry(),retired=new Uint8Array(live.attributes.position.count);
        for(const f of held) retired.fill(1,f.offset,f.offset+f.count);
        // Share all vertex buffers; only the index list omits held equipment. Never mutate live clones.
        for(const [name,attr] of Object.entries(live.attributes)) g.setAttribute(name,attr);
        g.setIndex(new T.BufferAttribute(live.index.array.filter(i=>!retired[i]),1));
        g.boundingSphere=live.boundingSphere.clone();
        g.userData={style,features:live.userData.features.filter(f=>!held.includes(f)),corpse:true};
        corpses.set(style,g);
      }
      return corpses.get(style);
    },
    stats() {
      let bytes=0,triangles=0;const buffers=new Set();
      for(const g of [...cache.values(),...corpses.values()]) {
        triangles+=g.index.count/3;
        for(const a of [...Object.values(g.attributes),g.index]) if(!buffers.has(a.array)){buffers.add(a.array);bytes+=a.array.byteLength;}
      }
      return {variants:cache.size,corpses:corpses.size,bytes,triangles};
    },
    dispose() { for(const g of [...cache.values(),...corpses.values()]) g.dispose();cache.clear();corpses.clear(); },
  };
}

// Four 128px patches in one shared 256px texture. Grain, brushed steel and leather
// are generated once; alpha packs surface roughness. No new asset requests or shadow passes.
export function createOniGearTexture(T) {
  const data=new Uint8Array(256*256*4);
  for(let y=0;y<256;y++) for(let x=0;x<256;x++) {
    const px=x%128,py=y%128,id=(x>=128?1:0)+(y>=128?2:0);
    const noise=Math.sin(px*127.1+py*311.7)*43758.5453;
    const grain=Math.sin(px*.71+Math.sin(py*.045)*2.8+Math.sin(px*.13+py*.025));
    const n=noise-Math.floor(noise),scratch=Math.sin(py*3.7+px*.018);
    const shade=id===0?170+grain*18+n*8:id===2?136+n*26+Math.sin(px*2)*4:190+scratch*8+n*10;
    const k=(y*256+x)*4;
    data[k]=data[k+1]=data[k+2]=Math.round(shade);
    data[k+3]=id===0?178+Math.round(n*15):id===2?215:100+Math.round(n*18);
  }
  const texture=new T.DataTexture(data,256,256,T.RGBAFormat);
  texture.name='oni-gear-surfaces';texture.colorSpace=T.SRGBColorSpace;
  texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  return texture;
}
