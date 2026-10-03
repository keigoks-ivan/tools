import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Role equipment is skinned into the existing body and cached per role. All pieces
// use the original atlas, skeleton and one body material, including the outline.
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
const REG = { steel: [512,704,576,768], cloth: [896,448,1024,576], dark: [832,512,896,576], bone: [832,448,896,512], glow: [960,640,1024,704], plate: [128,128,256,256] };

export function createOniArt(T, templates) {
  const cache = new Map();
  function build(style) {
    const look = ONI_LOOKS[style] || ONI_LOOKS.grunt;
    const heavy = style === 'boss' || style.startsWith('officer');
    const mesh = templates[heavy ? 'oni_boss' : 'oni_grunt'];
    if (!mesh) throw new Error('Missing oni body template');
    const skeleton = mesh.skeleton, bones = new Map(skeleton.bones.map((b,i) => [b.name,i]));
    const parts = [], features = [];
    const palette = Object.fromEntries(['armor','cloth','trim'].map(k => [k,new T.Color(look[k])]));
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
      const uv=g.attributes.uv, rect=REG[region], n=g.attributes.position.count, c=palette[tint] || new T.Color(0xffffff), indices=new Uint16Array(n*4),weights=new Float32Array(n*4),colors=new Float32Array(n*3);
      for(let i=0;i<n;i++) {
        uv.setXY(i,(rect[0]+3+(rect[2]-rect[0]-6)*uv.getX(i))/1024,1-(rect[1]+3+(rect[3]-rect[1]-6)*uv.getY(i))/1024);
        indices[i*4]=joint; weights[i*4]=1; colors.set([c.r,c.g,c.b],i*3);
      }
      if(!g.index) g.setIndex(Array.from({length:n},(_,i)=>i));
      g.setAttribute('skinIndex',new T.BufferAttribute(indices,4)); g.setAttribute('skinWeight',new T.BufferAttribute(weights,4));g.setAttribute('color',new T.BufferAttribute(colors,3));
      const offset=parts.reduce((sum,p)=>sum+p.attributes.position.count,0);
      features.push({name,bone,offset,count:n}); parts.push(g);
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
      const shape=[[-.32,.42],[.32,.42],[.37,.12],[.29,-.35],[0,-.52],[-.29,-.35],[-.37,.12]];
      add(plate(shape,.055),'LeftForeArm',[.82,1.665,.18],[1,1,1],[0,0,-Math.PI/2],'plate','armor','shield shell');
      add(new T.SphereGeometry(.1,8,6),'LeftForeArm',[.82,1.665,.28],[1,1,.35],[0,0,0],'bone','trim','shield boss');
      tube([...shape,shape[0]].map(([x,y])=>[.82+y,1.665-x,.25]),.014,'LeftForeArm','steel','trim','shield rim');
      box('LeftForeArm',[.8,1.665,.29],[.45,.023,.015],'bone','trim',[0,0,0],'shield crest');
    }
    if(style==='archer') {
      tube([[.48,1.395,.08],[.65,1.585,.08],[.95,1.665,.08],[1.23,1.565,.08],[1.40,1.385,.08]],.027,'LeftHand','dark','trim','recurve bow');
      tube([[.48,1.395,.08],[.95,1.345,.08],[1.40,1.385,.08]],.006,'LeftHand','bone','trim','bow string');
      add(new T.CylinderGeometry(.075,.06,.43,8),'Spine2',[-.15,1.41,-.23],[1,1,1],[0,0,-.28],'dark','cloth','back quiver');
      for(let i=0;i<3;i++) {
        tube([[-.19+i*.05,1.55,-.22],[-.19+i*.05,1.91,-.22]],.007,'Spine2','steel','trim','arrow shaft');
        add(plate([[-.025,0],[0,.07],[.025,0]],.008),'Spine2',[-.19+i*.05,1.82,-.22],[1,1,1],[0,i*.6,0],'cloth','cloth','arrow feather');
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
    stats() { let bytes=0,triangles=0;for(const g of cache.values()){triangles+=g.index.count/3;for(const a of Object.values(g.attributes)) bytes+=a.array.byteLength;bytes+=g.index.array.byteLength;}return { variants:cache.size,bytes,triangles }; },
    dispose() { for(const g of cache.values()) g.dispose();cache.clear(); },
  };
}
