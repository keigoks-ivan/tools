import * as THREE from '../../lib/three.module.js';
import { beveledProfile, MeshBatch } from './mesh-batch.mjs';

const STEEL = 0x51595b, DARK = 0x20262b, METAL = 0x89969a, RUBBER = 0x14191d;
const GLASS = 0x152932, WHITE = 0xc9c8b7, WARNING = 0xda8248, SHELL = 0x39434a;
const glow = [0x63d7f2, 0xffa363], paint = [0x465d69, 0x6a5048], eye = 0xffb354;
const mainMaterial = new THREE.MeshStandardMaterial({roughness: .64, metalness: .21, vertexColors: true});
const lensMaterial = new THREE.MeshBasicMaterial({vertexColors: true, toneMapped: false});
const jointGlow = new THREE.MeshBasicMaterial({color:0x7de7ff, transparent:true, opacity:.41, depthWrite:false, blending:THREE.AdditiveBlending});
const jetGeometry = new THREE.ConeGeometry(.66, 3.9, 8).translate(0, 1.9, 0);
const nozzle = new THREE.RingGeometry(.4,.59,16);
const hullOutline = beveledProfile([[-2.75,-1.35],[-3.03,.05],[-2.64,.96],[-1.85,1.58],[1.8,1.62],[2.68,1.1],[3.03,.07],[2.41,-1.36],[1.08,-1.88],[-1.09,-1.88]], 3.77, .19);
const chest = beveledProfile([[-2.45,.6],[-1.24,1.05],[1.3,1.06],[2.43,.55],[1.96,-.12],[1.18,-.29],[.82,-1.35],[-.76,-1.38],[-1.19,-.41],[-1.97,-.17]], .81, .16);
const shoulderDeck = beveledProfile([[-1.56,-.22],[-1.44,.65],[-1.06,.91],[1.17,.85],[1.71,.33],[1.64,-.46],[.88,-.72],[-1.12,-.59]], 4.24, .17);
const turbine = beveledProfile([[-1.12,-3.02],[-1.23,3.12],[-.91,3.69],[.78,3.69],[1.21,3.21],[1.2,-2.81],[.88,-3.21],[-.83,-3.25]], 2.31, .17);
const opticHousing = beveledProfile([[-1.53,-.31],[-1.53,.23],[-1.26,.46],[1.26,.46],[1.5,.21],[1.49,-.3],[1.21,-.46],[-1.26,-.46]], 1.42, .10);
const legArmor = beveledProfile([[-1.17,.95],[-.79,1.42],[.72,1.27],[1.12,.66],[1,-1.1],[.59,-1.47],[-.72,-1.32],[-1.08,-.67]], .92, .13);
const footArmor = beveledProfile([[-1.61,-.3],[-1.25,.46],[1.24,.46],[1.61,-.3],[1.43,-.51],[-1.44,-.51]], 3.45, .15);

function install(group, name, batch, material = mainMaterial) {
  const mesh = batch.mesh(material);
  mesh.name = name;
  mesh.castShadow = material === mainMaterial;
  group.add(mesh);
}

function hull(root, color, signal) {
  const group = new THREE.Group();
  group.name = 'Armored chassis';
  root.add(group);
  const b = new MeshBatch(), e = new MeshBatch(), jets=[];
  b.shape(hullOutline, SHELL, 0, 11.48, -.5);
  b.shape(chest, color, 0, 11.19, 1.65, 1, 1, 1, -.21);
  b.box(0, 7.73, -.11, 4.91, 1.58, 2.85, DARK);
  b.box(0, 8.32, 1.02, 4.75, .58, 1.2, STEEL);
  b.box(0, 8.12, 1.76, 1.52, 1.08, 1.12, color, -.22);
  b.box(0,9.13,.02,2.6,1.58,1.61,RUBBER);
  for(const side of [-1,1]) {
    b.beam([side*1.81,10.13,1.17],[side*1.27,8.38,1.04],.55,DARK,true);
    b.beam([side*1.64,9.91,1.44],[side*1.22,8.65,1.35],.24,METAL,true);
    b.beam([side*1.18,10.01,.92],[side*.68,8.49,.83],.25,STEEL,true);
  }
  b.shape(opticHousing, STEEL, 0, 13.16, 1.79,1,1,1,-.05);
  b.box(0,13.125,2.588,2.69,.55,.115,RUBBER);
  b.box(0,13.124,2.65,2.50,.435,.07,GLASS);
  b.cylinder(-.78,13.12,2.695,.465,.08,METAL,Math.PI/2);
  e.cylinder(-.78,13.12,2.744,.28,.052,eye,Math.PI/2);
  for(let i=0;i<3;i++) e.box(-.059+i*.336,13.13,2.700,.089,.266,.032,signal);

  b.box(0,11.69,-2.19,2.68,4.65,1.42,SHELL);
  b.box(0,11.14,-2.98,1.28,3.15,.73,DARK);
  for(let i=0;i<5;i++) b.box(0,10.12+i*.48,-3.43,1.09,.19,.23,STEEL);
  b.box(0,13.68,-2.98,1.04,1.38,.62,STEEL);
  e.box(0,13.66,-3.31,.46,.118,.07,signal);
  for(const side of [-1,1]) {
    const x=side*1.68, shoulder=side*3.63;
    b.beam([side*1.35,14.46,-2.24],[side*1.65,15.41,-3.15],.42,STEEL,true);
    b.shape(turbine, SHELL, x,12.76,-3.11);
    b.box(x,12.16,-4.425,1.96,3.07,.22,color);
    b.box(x,10.19,-4.409,1.99,1.13,.32,STEEL);
    b.box(x,15.38,-4.441,1.93,1.67,.25,RUBBER);
    b.box(x,15.42,-1.829,1.82,1.5,.185,RUBBER);
    for(let i=0;i<6;i++) {
      const y=14.77+i*.25;
      b.box(x,y,-4.599,1.71,.103,.162,STEEL,.12);
      b.box(x,y,-1.70,1.59,.103,.13,STEEL,-.12);
    }
    for(const edge of [-1,1]) {
      b.box(x+edge*1.12,12.21,-4.41,.14,4.59,.19,STEEL);
      b.box(x+edge*.94,12.39,-4.56,.10,2.18,.12,DARK);
    }
    b.box(x,13.31,-4.552,1.43,.108,.128,STEEL);
    e.box(x,13.22,-4.63,.54,.094,.049,signal);
    b.cylinder(x,9.31,-3.73,2.37,1.25,SHELL,-2.28);
    b.cylinder(x,8.83,-4.29,2.19,.44,DARK,-2.28);
    b.cylinder(x,8.63,-4.51,1.80,.21,METAL,-2.28);
    b.cylinder(x,8.542,-4.618,1.42,.107,RUBBER,-2.28);
    e.shape(nozzle,signal,x,8.508,-4.67,1,1,1,2.43);
    const jet = new THREE.Mesh(jetGeometry, jointGlow);
    jet.position.set(x,8.49,-4.71);
    jet.rotation.x = -2.28;
    jet.visible = false;
    group.add(jet); jets.push(jet);

    b.shape(shoulderDeck,SHELL,shoulder,13.74,.05,1,1,1,.26,0,side*-.067);
    b.box(shoulder+side*.14,14.37,.63,1.86,.17,1.86,STEEL,.258,0,side*-.087);
    b.box(shoulder+side*.28,14.324,.89,1.51,.119,1.4,WARNING,.26,0,side*-.087);
    b.box(shoulder+side*.28,14.346,.92,.13,.113,1.4,SHELL,.26,0,side*-.087);
    b.box(shoulder,13.223,1.996,1.95,.3,.26,DARK);
    b.box(shoulder+side*.78,13.276,2.156,.34,.08,.114,WARNING);
    b.cylinder(side*3.61,12.66,.09,1.89,1.62,DARK,0,0,Math.PI/2);
    b.box(side*3.91,11.85,.21,1.42,1.89,1.49,STEEL,-.09,0,side*.13);
    b.shape(legArmor,color,side*4.12,11.48,.63,.55,.58,.5,-.13,0,side*.12);
    b.cylinder(side*4.16,10.56,.44,1.35,1.17,DARK,0,0,Math.PI/2);
    b.cylinder(side*4.78,10.56,.44,.73,.16,METAL,0,0,Math.PI/2);
    b.box(side*4.24,9.69,.64,1.31,1.57,1.23,SHELL,-.16);
    b.shape(legArmor,color,side*4.26,9.39,1.18,.6,.58,.7,-.16);
    b.box(side*4.92,9.67,.68,.16,1.15,1.21,WARNING,-.16);
    b.box(side*4.23,8.49,.72,.95,.7,.94,DARK);
    b.box(side*4.25,8.09,.9,.9,.39,.64,STEEL);
    for(let i=0;i<3;i++) b.box(side*4.19-.34+i*.34,7.87,.99,.22,.62,.45,DARK,-.13);
    b.beam([side*3.45,11.58,-.47],[side*3.88,10.06,-.28],.21,METAL,true);
  }
  install(group, 'Shoulder decks, asymmetric optics and twin thrust nacelles',b);
  install(group, 'Visor and exhaust rings',e,lensMaterial);
  return {group,jets};
}

function weapon(root, color, signal) {
  const group = new THREE.Group();group.name = 'Gimballed pulse rifle';
  group.position.set(4.23,8.42,.93);root.add(group);
  const b = new MeshBatch(), e=new MeshBatch();
  b.box(0,-.05,.4,1.21,1.16,3.72,DARK);
  b.box(0,.39,.96,1.31,.6,4.36,SHELL);
  b.box(0,-.18,2.36,1.16,1.15,3.96,STEEL);
  b.box(0,.395,3.4,1.09,.16,3.0,DARK);
  b.box(0,-.65,2.72,.87,.26,3.46,SHELL);
  for(let i=0;i<8;i++) b.box(0,.502,1.48+i*.43,.81,.103,.178,METAL);
  b.box(.62,-.09,2.57,.087,.52,2.65,color);
  b.box(.69,-.13,2.56,.083,.275,2.2,RUBBER);
  e.box(.735,-.13,2.56,.04,.102,1.78,signal);
  b.box(0,-.43,.1,.79,.24,1.42,WARNING);
  b.box(0,-.17,4.51,1.31,1.37,.57,SHELL);
  b.box(0,-.17,4.82,1.05,1.05,.156,DARK);
  b.box(0,-.17,4.915,.56,.58,.072,RUBBER);
  install(group,'Long carbine shroud, receiver and muzzle',b);
  install(group,'Carbine feed indicator',e,lensMaterial);
  return group;
}

function leg(root, side, color) {
  const upper = new THREE.Group(); upper.name = side < 0 ? 'Left hip' : 'Right hip';
  upper.position.set(side*2.04,7.58,.02);
  root.add(upper);
  const lower = new THREE.Group(); lower.name = 'Knee'; lower.position.set(side*.14,-3.49,.26);
  upper.add(lower);
  const foot = new THREE.Group(); foot.name = 'Ankle'; foot.position.set(0,-3.42,-.33);
  lower.add(foot);
  const a = new MeshBatch(), b = new MeshBatch(), c = new MeshBatch();
  a.cylinder(0,-.04,0,2.5,1.85,DARK,0,0,Math.PI/2);
  a.box(0,-1.55,.02,1.44,2.88,1.34,STEEL,-.08);
  a.shape(legArmor,color,0,-1.37,.85,1.0,.91,1.12,-.14);
  a.box(side*1.07,-.75,.47,.22,1.28,1.19,WARNING,0,0,side*.20);
  a.beam([side*.86,-.75,-.62],[side*.86,-3.09,-.32],.41,DARK,true);
  a.beam([side*.94,-1.19,-.68],[side*.94,-3.02,-.23],.246,METAL,true);
  a.beam([side*1.05,-2.04,-.47],[side*1.05,-3.16,-.02],.24,METAL,true);
  b.cylinder(0,-.05,0,2.1,2.02,DARK,0,0,Math.PI/2);
  b.cylinder(side*1.06,-.05,0,1.21,.36,STEEL,0,0,Math.PI/2);
  b.cylinder(side*1.26,-.05,0,.63,.11,METAL,0,0,Math.PI/2);
  b.box(0,-1.64,-.15,1.38,2.89,1.57,SHELL,.12);
  b.shape(legArmor,color,0,-1.73,.89,.91,.84,1.20,.12);
  for (const reach of [-.57,.48]) {
    b.beam([side*.87,-.29,reach-.31],[side*.77,-2.84,reach-.12],.39,DARK,true);
    b.beam([side*.92,-.51,reach-.33],[side*.82,-2.65,reach-.10],.20,METAL,true);
    b.beam([side*.91,-1.28,reach-.24],[side*.83,-2.08,reach-.15],.32,STEEL,true);
  }
  b.box(side*.97,-2.56,.35,.26,1.04,1.19,WARNING,.12);
  b.box(0,-.77,1.12,.85,.64,.47,STEEL,.13);
  c.shape(footArmor,STEEL,0,-.04,.59);
  c.box(0,-.4,.65,2.99,.37,3.68,RUBBER);
  c.box(0,.17,1.64,2.62,.48,1.71,color,-.15);
  c.box(0,.405,1.71,1.52,.07,1.18,WARNING,-.15);
  c.box(0,.17,-.65,2.41,.47,1.01,DARK);
  c.box(0,.03,2.427,1.47,.15,.09,WHITE);
  for(let i=0;i<4;i++) c.box(-1.16+i*.78,-.58,.64,.42,.12,3.36,DARK);
  install(upper,'Upper leg armor',a);
  install(lower,'Lower leg and exposed actuators',b);
  install(foot,'Tread and armored toe',c);
  return {upper,lower,foot,side};
}

/** Original model; no browser/renderer needed to create or export the group. */
export function createDuelMech(slot = 0) {
  const root = new THREE.Group(), color = paint[slot] ?? paint[0], signal = glow[slot] ?? glow[0];
  const body = new THREE.Group();
  root.name = 'M-07 鹽隼'; root.add(body);
  const {group:upper,jets} = hull(body,color,signal);
  const gun = weapon(upper,color,signal);
  const legs = [-1,1].map(side=>leg(body,side,color));
  let cycle = 0, stride = 0;
  function pose(p, dt) {
    root.position.set(p.x,p.y,p.z);
    root.rotation.y=p.yaw;
    const speed=Math.hypot(p.vx||0,p.vz||0), flying=!!p.flying, walking=flying?0:Math.min(1,speed/19);
    stride += (walking-stride)*(1-Math.exp(-8*dt));
    cycle += dt*(2.8+speed*.14);
    body.position.y = flying ? .2*Math.sin(cycle) : Math.abs(Math.sin(cycle))*stride*.3;
    upper.rotation.x = Math.max(-.36,Math.min(.36,-p.pitch*.26+(flying&&p.boosting?.1:0)));
    upper.rotation.z = flying ? Math.sin(cycle*.42)*.042 : stride*Math.sin(cycle)*.034;
    gun.rotation.x = (p.preview ? .93 : -.59*p.pitch);
    for (const {upper:thigh, lower, foot, side} of legs) {
      const step = Math.sin(cycle)*side*stride;
      thigh.rotation.x = flying ? .29+(side<0?.07:0) : -.42*step;
      lower.rotation.x = flying ? .38 : Math.max(0,step)*.6;
      foot.rotation.x = flying ? .23 : -thigh.rotation.x-lower.rotation.x;
    }
    for(const jet of jets) {
      jet.visible = flying;
      if(flying)jet.scale.set(1,p.boosting?1.45: .69 + Math.sin(cycle*3)*.12,1);
    }
  }
  return {root,pose};
}

export function disposeMech(root) {
  root.traverse(part => {
    if (part.isMesh && part.geometry!==jetGeometry) part.geometry.dispose();
  });
}
