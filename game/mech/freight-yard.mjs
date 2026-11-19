import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FREIGHT_ROUTE = {
  cp: [1], arena: 145, fin: 85, par: 510, over: 1,
  pts: [[-460, 4], [-152, 4], [182, 4]],
  secs: [
    { at: 1, amb: 'heavy@out grunt@out tank@out brawler@side grunt@side' },
    { at: 2, amb: 'grunt@side heavy@out tank@out' },
  ],
};

const signs = new WeakMap();
function stationSign(world) {
  if (typeof document === 'undefined') return null;
  if (!signs.has(world)) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#213f49'; ctx.fillRect(0,0,512,96);
    ctx.strokeStyle = '#b0c9c8'; ctx.lineWidth = 4; ctx.strokeRect(6,6,500,84);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e5eee8'; ctx.font = '700 45px sans-serif';
    ctx.fillText('神戸貨物駅',256,48);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    signs.set(world, new THREE.MeshStandardMaterial({ map, roughness:.76 }));
  }
  return signs.get(world);
}

export function buildFreightYard(world, group) {
  const root = new THREE.Group(); root.name = '神戸貨物駅・荷役場'; group.add(root);
  const colors = [0x564f47,0x756d5c,0x454d4d,0x829090,0x364b53,0x7e4534,0x416052,0xaaa08a,0xc28b42];
  const bucket = colors.map(() => []);
  const unit = new THREE.BoxGeometry(), flat=new THREE.PlaneGeometry().rotateX(-Math.PI/2);
  const wheel=new THREE.CylinderGeometry(.53,.53,.27,10).rotateX(Math.PI/2);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const sourceUV = (g,k) => {
    const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
    const repeat=k===0?3.4:k===1||k===7?5.2:4.1;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
      if(Math.abs(n.getY(i))>.73)uv.setXY(i,x/repeat,z/repeat);
      else if(Math.abs(n.getX(i))>.73)uv.setXY(i,z/repeat,y/repeat);
      else uv.setXY(i,x/repeat,y/repeat);
    }
    return g;
  };
  const part = (k,g,m) => bucket[k].push(sourceUV(g.clone().applyMatrix4(m),k));
  const box = (k,x,y,z,w,h,d,tilt=0) => {
    part(k,unit,matrix.makeRotationX(tilt).scale(scale.set(w,h,d)).setPosition(x,y,z));
  };
  const solid = (x,z,w,d,h,y=0) => world.addCollider({x0:x-w/2,x1:x+w/2,z0:z-d/2,z1:z+d/2,top:y+h});
  const cover = (x,z,w,d,h) => {
    const y=Math.min(0,world.height(x,z));
    box(1,x,y+h/2,z,w,h,d); box(7,x,y+h-.23,z,w+.18,.45,d+.18);
    solid(x,z,w,d,h,y);
  };
  const container = (x,z,k,y=0) => {
    const w=23, h=5.4, d=6.5;
    box(k,x,y+h/2,z,w,h,d);
    for (const dx of [-11,-8.4,-5.6,-2.8,0,2.8,5.6,8.4,11])
      for (const side of [-1,1]) box(k,x+dx,y+h/2,z+side*3.28,.35,5.0,.35);
    for (const side of [-1,1]) {
      box(2,x,y+.25,z+side*3.25,23.4,.38,.33);
      box(3,x,y+5.2,z+side*3.25,23.4,.31,.33);
    }
    box(7,x+8.7,y+3.9,z-3.47,2.7,.7,.03);
    solid(x,z,w,d,h,y);
  };

  // 道碴、鋼軌、枕木依序疊高，近距離仍看得到枕木間距。
  for (const z of [24,49,76,91]) {
    box(0,-52,.04,z,820,.08,7.2);
    for (const side of [-1,1]) {
      box(2,-52,.27,z+1.06*side,820,.24,.13);
      box(3,-52,.405,z+1.06*side,820,.11,.14);
    }
    for (let x=-450;x<=350;x+=1.6) part(1,flat,matrix.makeScale(.36,1,3.55).setPosition(x,.13,z));
  }
  for(const [x,z,w] of [[-386,-98,74],[-236,-98,230],[-57,-95,99]]){
    const y=world.height(x,z)+.07;
    box(0,x,y-.06,z,w,.12,8.5);
  }
  for (const [x,z,w,d] of [[-262,36,318,10],[-55,61,330,9],[192,37,230,11]]) {
    cover(x,z,w,d,2.15); box(8,x,2.41,z-d/2+.35,w,.11,.48);
  }
  // 站外的維修通路與車棚裝卸線，以不同的地面標線接起兩條動線。
  for (const [x,z,w] of [[-257,-96,296],[-23,-91,170],[122,-81,107]]) {
    for (const side of [-1,1]) {
      part(7,flat,matrix.makeScale(w,1,.27).setPosition(x,world.height(x,z+side*4)+.14,z+side*4));
    }
  }
  for (const [x,z,w] of [[-138,10,105],[39,9,183],[176,12,74]]) {
    part(0,flat,matrix.makeScale(w,1,11).setPosition(x,world.height(x,z)+.09,z));
    for (let dx=-w/2+6;dx<w/2;dx+=14) {
      part(8,flat,matrix.makeScale(6,1,.27).setPosition(x+dx,world.height(x+dx,z)+.14,z));
    }
  }
  // 發車區兩側的混凝土壓邊與貨車。中線保持視野，北側則由箱體隔出較窄的低地通路。
  for (const [x,z,w,d,h] of [
    [-415,17,5,36,5],[-365,65,5,18,4],[-324,-34,53,8,10],[-256,-41,54,8,13],
    [-154,-33,43,7,11],[-90,-48,33,8,11],[-46,-90,30,11,6],
    [101,-41,35,9,10],[178,-74,42,7,12],[238,14,14,28,9],
  ]) cover(x,z,w,d,h);
  for (const [x,z,k] of [[-344,91,4],[-317,91,5],[-288,91,6],[-248,87,4],[-126,93,5],
    [-102,93,6],[-73,93,4],[68,91,6],[93,91,5],[119,91,4],[230,84,6],[260,84,5],[291,84,4],
    [-379,-54,6],[-351,-62,5],[-293,-49,4],[-214,-50,5],[-182,-51,6]]) {
    const onRail=z===91;
    const deck=onRail?1.45:0;
    container(x,z,k,deck);
    if (x % 3 === 0) container(x,z,k,deck+5.4);
    if (onRail) {
      box(2,x,1.24,z,25,.49,6.7);
      for (const dx of [-8,8]) {
        box(0,x+dx,.83,z,3.1,.44,2.7);
        for(const ax of [-.78,.78])for(const side of [-1,1])
          part(2,wheel,matrix.makeTranslation(x+dx+ax,.83,z+side*1.05));
      }
    }
  }

  // 貨站主棚採挑高鋼骨、起伏屋面與分段天窗，正面留出機甲可通過的兩個開口。
  const x0=134, x1=292, z0=-23, z1=97, w=x1-x0, d=z1-z0;
  for (const z of [z0,z1]) for (let x=x0;x<=x1;x+=26) {
    box(3,x,15,z,2.3,30,2.7);
    box(1,x,2,z,4.4,4,5);
    solid(x,z,3.1,3.2,30);
  }
  box(4,(x0+x1)/2,27.0,z1,w,5.0,1.5);
  box(4,(x0+x1)/2,27.0,z0,w,5.0,1.5);
  for (let i=0;i<15;i++) {
    const z=z0+(i+.5)*d/15, a=(z-z0)*Math.PI/d;
    const roof=30+Math.sin(a)*10, pitch=-Math.atan(Math.cos(a)*10*Math.PI/d);
    box(i%4===1?3:4,(x0+x1)/2,roof,z,w+4,1.05,d/15+.24,pitch);
  }
  for (const x of [134,188,242,292]) box(7,x,29.9,(z0+z1)/2,1.6,.72,d+2);
  for (const x of [149,214,272]) {
    for (const z of [-22,96]) {
      box(3,x,22.5,z,15,.46,.87);
      box(8,x-4.7,21.9,z,4.8,.29,.76);
      box(2,x+5,19.8,z,.32,5.2,.58);
    }
  }
  for (const z of [-18,45,94]) box(8,x0-.45,12,z,1.3,.75,3.8);
  const sign=stationSign(world);
  if(sign){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(36,6.75),sign);
    m.position.set(x0-1.4,24,14);m.rotation.y=-Math.PI/2;
    m.userData.fieldGeometry=true; root.add(m);
    box(2,x0-.45,24,14,1.1,7.1,36.6);
  }
  // 門型起重機、號誌桿與橫跨裝卸線的維修平台。
  for (const x of [-276,21,315]) {
    for (const z of [16,104]) {
      box(4,x,17,z,3.8,34,4);
      box(8,x,4,z,4,4.2,4.2);
      solid(x,z,4.2,4.2,34);
    }
    box(4,x,33,60,6.5,4.4,92);
    for(const z of [19,39,59,79,99]) {
      box(2,x,37,z,5.7,.55,20);
      box(3,x,35,z+7,3.3,.45,15,1/3);
      box(7,x-2.8,38,z,.14,1.05,19.5);
    }
    box(3,x-2.9,35.5,60,.4,.45,90);
    box(3,x+2.9,35.5,60,.4,.45,90);
    box(8,x,30,46,6,3,7.3);
    box(2,x,25,46,.6,8,.6);
  }
  for(const [x,z] of [[-426,-12],[-296,6],[-151,8],[20,6],[113,11],[328,8]]) {
    box(2,x,5.2,z,.48,10.4,.48);box(4,x,9.6,z,1.8,2.2,.86);box(8,x-.94,10.05,z,.2,.59,.62);
  }
  // 站後的辦公樓、維修庫與天台排氣設備讓地平線有明確的貨站輪廓。
  for(const [x,z,w,h,d] of [[337,-17,48,20,33],[324,58,34,23,32],[365,111,53,16,30]]) {
    box(4,x,h/2,z,w,h,d);box(3,x,h+.55,z,w+1,1.1,d+.7);solid(x,z,w,d,h);
    for(let y=5;y<h-1;y+=5)for(let u=-d/2+3;u<d/2-1;u+=4.2){
      box(2,x-w/2-.08,y,z+u,.16,2.35,2.5);
      box(3,x-w/2-.18,y-.85,z+u,.29,.14,2.75);
    }
    for(const u of [-7,7])box(2,x+4,h+1.3,z+u,8,2.4,4);
  }
  for (const [k, parts] of bucket.entries()) {
    if (!parts.length) continue;
    const geometry=mergeGeometries(parts);
    for(const g of parts){
      g.dispose();
    }
    const mats = world.freightMaterials ??= [];
    const A=world.A;
    const map=k===0?A?.rockD:k===1||k===7?A?.rubD:undefined;
    const normalMap=k===0?A?.rockN:k===1||k===7?A?.rubN:k!==8?A?.wearN:undefined;
    const material = mats[k] ??= new THREE.MeshStandardMaterial({color:colors[k],map,normalMap,
      normalScale:new THREE.Vector2(k<=1?.29:.12,k<=1?.29:.12),roughness:k===3?.43:.81,metalness:k>=2&&k<=6?.43:.07});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.userData.fieldGeometry=true;mesh.castShadow=k!==0;mesh.receiveShadow=true;root.add(mesh);
  }
  unit.dispose();flat.dispose();wheel.dispose();
  return root;
}
