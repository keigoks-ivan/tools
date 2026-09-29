import path from 'node:path';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
let repo=process.cwd();
while(!fs.existsSync(path.join(repo,'game/mech/anim.js'))) {const up=path.dirname(repo);if(up===repo)throw new Error('Run from the repository');repo=up;}
const threeURL=pathToFileURL(path.join(repo,'game/lib/three.module.js')).href;
const THREE=await import(threeURL);
const file=process.argv[2] || path.join(repo,'game/mech/anim.js');
const source=fs.readFileSync(file,'utf8').replace("from 'three'", "from '"+threeURL+"'");
const {MechMotion}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const results=[];
for(const hz of [30,60,120]) for(const direction of ['forward','back','side','turn','stop','boost','air']) {
 const root=new THREE.Group(), bones={};
 const bone=(n,p,pos)=>{const b=new THREE.Group();b.position.set(...pos);p.add(b);bones[n]=b;return b;};
 const L={pelvis:9.9};const pelvis=bone('pelvis',root,[0,9.9,0]),torso=bone('torso',pelvis,[0,.85,0]);bone('head',torso,[0,4.95,.35]);
 for(const [s,x] of [['R',-1],['L',1]]){const hip=bone('hip'+s,pelvis,[1.45*x,-.5,0]),knee=bone('knee'+s,hip,[0,-4.25,.1]);bone('ankle'+s,knee,[0,-4,-.1]);const sh=bone('shoulder'+s,torso,[x*3.05,3.95,-.05]);bone('elbow'+s,sh,[0,-2.85,0]);}
 const m={root,bones,L,scale:1,pose:{boost:0,air:0},legYaw:0,land:0,landV:0,thrust:0,recoil:0,swing:0,flames:[],footToe:2.44,footHeel:1.82};const motion=new MechMotion(m);let maxDrift=0,maxError=0,maxLift=0,finite=true,plantedSamples=0;const previous={};
 for(let i=0;i<hz*6;i++) {const t=i/hz,v=new THREE.Vector3(direction==='side'?8:0,0,['forward','stop','boost','air'].includes(direction)?9:direction==='back'?-7:0);if(direction==='stop'&&t>3)v.set(0,0,0);root.position.addScaledVector(v,1/hz);motion.update(1/hz,{vel:v,grounded:!(direction==='air'&&t>2&&t<3.5),boost:direction==='boost'&&t>2&&t<3.5?1:0,torsoYaw:direction==='turn'?t*1.1:0,thrust:0,aim:null});root.updateMatrixWorld(true);
  for(const s of ['R','L']) {const p=bones['ankle'+s].getWorldPosition(new THREE.Vector3()),f=motion.feet?.[s];finite&&=p.toArray().every(Number.isFinite);if(t>1 && (!['boost','air'].includes(direction) || t>5)){ maxLift=Math.max(maxLift,p.y-motion.ankleY);if(f?.stance&&previous[s]?.stance){maxDrift=Math.max(maxDrift,p.distanceTo(previous[s].p));maxError=Math.max(maxError,p.distanceTo(f.anchor));plantedSamples++;}}previous[s]={p,stance:f?.stance};}
 }
 results.push({hz,direction,maxDrift,maxError,maxLift,finite,plantedSamples,steps:m.stepCount});
}
console.log(JSON.stringify(results,null,2));
if(results.some(r=>!r.finite||r.maxError>.15||r.maxDrift>.15))process.exitCode=1;
