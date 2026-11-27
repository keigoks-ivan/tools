import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

let scooter;
function scooterGeometry(){
  if(scooter)return scooter;
  const parts=[];
  function add(g,hex){
    if(g.index)g=g.toNonIndexed();
    g.deleteAttribute('uv');const c=new THREE.Color(hex),a=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<a.length;i+=3)c.toArray(a,i);
    g.setAttribute('color',new THREE.BufferAttribute(a,3));parts.push(g);
  }
  const rubber=0x313638,silver=0xa3aaa3,body=0x7c9398;
  for(const z of [-.61,.61]){
    add(new THREE.TorusGeometry(.238,.07,5,14).rotateY(Math.PI/2).translate(0,.315,z),rubber);
    add(new THREE.CylinderGeometry(.16,.16,.105,12).rotateZ(Math.PI/2).translate(0,.315,z),silver);
  }
  const shell=(x,y,z,w,h,d,c)=>add(new THREE.SphereGeometry(1,10,6).scale(w,h,d).translate(x,y,z),c);
  shell(0,.52,-.37,.29,.26,.51,body);shell(0,.79,-.30,.265,.105,.45,rubber);
  add(new THREE.BoxGeometry(.4,.095,.69).translate(0,.34,.10),rubber);
  add(new THREE.BoxGeometry(.32,.59,.13).rotateX(-.25).translate(0,.64,.46),body);
  add(new THREE.CylinderGeometry(.025,.033,.80,6).rotateX(-.25).translate(0,.66,.54),silver);
  shell(0,1,.49,.19,.115,.14,body);shell(0,1.01,.59,.133,.069,.067,0xddd7ad);
  add(new THREE.CylinderGeometry(.032,.032,.59,6).rotateZ(Math.PI/2).translate(0,1,.44),rubber);
  for(const s of [-1,1]){
    add(new THREE.CylinderGeometry(.012,.012,.23,5).rotateZ(-s*.29).translate(s*.235,1.12,.43),silver);
    shell(s*.266,1.23,.43,.079,.051,.028,rubber);
  }
  scooter=mergeGeometries(parts);return scooter;
}
const finish=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.27});
export function parkScooters(group,sites){
  if(!sites.length)return;
  const m=new THREE.InstancedMesh(scooterGeometry(),finish,sites.length),d=new THREE.Object3D();
  sites.forEach(([x,z,angle],i)=>{d.position.set(x,.16,z);d.rotation.set(0,angle,-.075);d.updateMatrix();m.setMatrixAt(i,d.matrix);});
  m.castShadow=m.receiveShadow=true;group.add(m);
}

export function marketCourt({x,z,piece,course,trim,quad,uv,paint}){
  const brick=paint(0x92634a),cream=paint(0xc9b99e),wall=paint(0x656a5c),tile=paint(0x59706b);
  for(let n=0;n<5;n++){
    const xx=x+(n-2)*5.5,top=4-(n%2)*.4;
    const canvas=paint([0xa66c4c,0x627c74,0xb89b77,0x786f62,0x658397][n]);
    for(const dx of [-2.2,2.2])for(const dz of [-1.75,1.75])piece(xx+dx,.15,z+dz,.10,top,.10,wall);
    for(const side of [-1,1]){
      const a=z+side*2.4,edge=top-.55,p=[[xx-2.55,edge,a],[xx+2.55,edge,a],[xx+2.55,top,z],[xx-2.55,top,z]];
      quad(trim,side===1?p:p.reverse(),uv,canvas);
      piece(xx,edge-.30,a,5.1,.30,.04,canvas);
    }
    piece(xx,.72,z+.55,3.7,.19,1.3,wall);
    for(const s of [-1,1]){
      course(trim,xx+s,.92,z+.5,.42,.42,.47,brick,10);
      for(let k=0;k<4;k++)course(trim,xx+s,.99+k*.08,z+.5,.455,.025,.455,cream,10);
    }
  }
  for(const s of [-1,1]){piece(x+s*15,0,z,1.15,4.2,1.15,brick);piece(x+s*15,4.08,z,1.45,.45,1.45,cream);}
  piece(x,4.22,z,31.5,.53,1.14,cream);piece(x,4.75,z,32.4,.22,1.67,tile);
}
export function cityPlaza({x,z,piece,trim,course,paint,tree}){
  const pale=paint(0xb4aca0),stone=paint(0x8d9999),bronze=paint(0x6d6a53);
  piece(x,.05,z,37,.17,43,pale);
  for(let j=-18;j<=18;j+=3)piece(x,.23,z+j,36.8,.012,.09,stone);
  for(const s of [-1,1]){
    piece(x+s*12,.24,z,3.5,.49,26,stone);
    for(let j=-9;j<=9;j+=9)tree(x+s*12,z+j);
    piece(x+s*9.7,.59,z,1.25,.18,16,bronze);
  }
  course(trim,x,z+6,.25,3.45,.48,3.3,stone,24);
  for(let i=0;i<5;i++)course(trim,x+Math.sin(i*.48)*1.05,z+6,.73+i*.89,1.2-i*.13,1.1,.96-i*.12,bronze,5,.54,i*.2);
}
