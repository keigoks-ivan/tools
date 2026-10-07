import { CARRIER } from './carrier.mjs?v=20261008';
import { kit, disposeTree } from './aircraft.fighter.js?v=20261008';
import { createHornetAircraft } from './aircraft.hornet.js?v=20261008';

export function createCarrierWorld(THREE, scene) {
  const group=new THREE.Group();group.name='Carrier recovery practice';group.visible=false;scene.add(group);
  const K=kit(THREE,group), deck=new THREE.MeshStandardMaterial({color:0x4a5358,roughness:.92,metalness:.12});
  const hull=new THREE.MeshStandardMaterial({color:0x78848b,roughness:.72,metalness:.33});
  const dark=new THREE.MeshStandardMaterial({color:0x252e33,roughness:.78}), white=new THREE.MeshStandardMaterial({color:0xd3d4c6,roughness:.82});
  const yellow=new THREE.MeshStandardMaterial({color:0xe7c34e,roughness:.8});
  const windows=new THREE.MeshStandardMaterial({color:0x284453,metalness:.60,roughness:.2});
  const body=new THREE.Group();body.rotation.y=CARRIER.shipYaw;group.add(body);
  const outline=CARRIER.deckOutline;
  const deckMesh=K.slab(outline,1.6,deck,body);deckMesh.position.y=-.85;
  const lower=K.slab(outline.map(([x,z])=>[x*.70,z*.96]),15,hull,body);lower.position.y=-9.1;
  K.box([49,7,310],dark,[0,-17.3,-3],body);
  // Angled landing area stays aligned with the local physics runway.
  K.box([24,.07,260],deck,[0,.03,0]);
  for(const sign of [-1,1]) K.box([.30,.018,260],white,[sign*12,.09,0]);
  for(let z=-124;z<125;z+=14) K.box([.23,.025,7],white,[0,.1,z]);
  K.box([23,.024,.6],white,[0,.10,130]);
  for(const x of [-2.1,2.1]) K.box([.35,.026,30],yellow,[x,.1,98]);
  // Two bow catapult tracks and elevator outlines are scenery for this recovery phase.
  for(const x of [-10,14]) for(const sign of [-1,1]) K.box([.12,.02,78],white,[x+sign*.45,.12,-106],body);
  for(const [x,z] of [[29,83],[29,-79],[-31,-44]]) {
    K.box([13,.08,20],dark,[x,.05,z],body);
    for(const dx of [-6.5,6.5]) K.box([.12,.025,20],yellow,[x+dx,.14,z],body);
  }
  // Tie-downs, deck seams, perimeter safety nets and gallery supports.
  for(let z=-145;z<146;z+=8) for(let x=-26;x<28;x+=6) {
    if(Math.abs(x)<13)continue;
    const ring=K.mesh(new THREE.TorusGeometry(.18,.035,6,10),dark,[x,.15,z],body);ring.rotation.x=Math.PI/2;
  }
  for(let z=-140;z<145;z+=18) {
    K.box([65,.02,.06],dark,[0,.11,z],body);
    for(const sign of [-1,1]) {K.box([2.5,.15,13],hull,[sign*36,-1.2,z],body);K.rod([sign*33,-5,z],[sign*37,-1.3,z],.13,hull,body);}
  }
  const island=new THREE.Group();island.position.set(27,0,-4);body.add(island);
  K.box([13,14,30],hull,[0,7,0],island);K.box([15,5,26],hull,[0,16.5,-1],island);
  K.box([16,3.5,18],windows,[0,20.8,-5],island);K.box([18,.8,20],hull,[0,23,-5],island);
  for(const x of [-7.9,7.9]) for(let z=-13;z<5;z+=3) K.box([.18,3.5,.18],hull,[x,20.8,z],island);
  K.box([5,12,5],hull,[2,28,4],island);
  const radar=new THREE.Group();radar.position.set(2,36,4);island.add(radar);K.box([10,4,.6],dark,[0,0,0],radar);
  for(const [x,z,h] of [[-4,8,19],[5,-9,15],[-3,-12,11]]) K.rod([x,23,z],[x,23+h,z],.13,hull,island);
  const parked=createHornetAircraft(THREE);parked.group.position.set(26,2.2,-102);parked.group.rotation.y=-.15;body.add(parked.group);
  const second=parked.group.clone();second.position.set(-25,2.2,-88);second.rotation.y=.25;body.add(second);
  // Deck crew and tow tractors remain outside the landing area.
  const crewColors=[0xf2bc32,0x4489b5,0x51a16a,0xdb6260];
  for(let i=0;i<8;i++) {
    const x=i<4?18:-19,z=-50+i*11,color=new THREE.MeshStandardMaterial({color:crewColors[i%4],roughness:.9});
    K.box([.42,.72,.25],color,[x,1.22,z],body);
    K.mesh(new THREE.SphereGeometry(.17,12,10),white,[x,1.75,z],body);
    for(const sign of [-1,1])K.rod([x+sign*.12,.86,z],[x+sign*.13,.10,z],.065,dark,body);
  }
  for(const x of [-22,22]){K.box([2.3,1.1,3.4],white,[x,.8,38],body);for(const sign of [-1,1])K.mesh(new THREE.SphereGeometry(.34,12,8),dark,[x+sign*1.1,.38,38],body);}
  const lampMaterial=color=>new THREE.MeshBasicMaterial({color,toneMapped:false});
  const green=lampMaterial(0x67ff97),amber=lampMaterial(0xffb541),red=lampMaterial(0xff342c),dim=lampMaterial(0x352f1d);
  for(let z=-126;z<=130;z+=12) for(const sign of [-1,1]) K.mesh(new THREE.SphereGeometry(.18,8,8),z>112?red:green,[sign*12,.4,z]);
  // Fresnel lens optical landing display: datum green lights and a moving amber ball.
  K.box([5,5,.9],dark,[-18,3.0,98]);const ball=[];
  for(let i=0;i<5;i++) ball.push(K.mesh(new THREE.SphereGeometry(.36,12,10),dim,[-18,2+(4-i)*.55,98.55]));
  for(const dx of [-2.0,-1.4,1.4,2.0]) K.mesh(new THREE.SphereGeometry(.25,10,8),green,[-18+dx,3.1,98.55]);
  const wireParts=[];
  for(const z of CARRIER.wires) {
    const parts=[K.rod([-12,.12,z],[0,.12,z],.07,dark),K.rod([0,.12,z],[12,.12,z],.07,dark)];wireParts.push(parts);
  }
  const time={value:0};
  const oceanMaterial=new THREE.ShaderMaterial({uniforms:{time},vertexShader:`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    #include <fog_pars_vertex>
    varying vec3 seaPosition;
    uniform float time;
    void main(){
      vec3 p=position;
      p.z+=sin(p.x*.028+time*.8)*.38+sin(p.y*.041-time*.65)*.24;
      vec4 world=modelMatrix*vec4(p,1.0);seaPosition=world.xyz;
      vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }`,fragmentShader:`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    #include <fog_pars_fragment>
    varying vec3 seaPosition;
    uniform float time;
    void main(){
      #include <logdepthbuf_fragment>
      vec2 p=seaPosition.xz;
      vec3 n=normalize(vec3(-.018*cos(p.x*.028+time*.8)-.022*cos(p.x*.22+time*1.4),1.0,-.018*cos(p.y*.041-time*.65)-.025*cos(p.y*.19-time*1.3)));
      vec3 v=normalize(cameraPosition-seaPosition),l=normalize(vec3(-.4,.72,-.32));
      float fresnel=pow(1.0-max(dot(n,v),0.0),4.0);
      float spec=pow(max(dot(n,normalize(v+l)),0.0),160.0);
      float ripples=sin(p.x*.16+p.y*.21+time)*sin(p.y*.28-time*.7)*.016;
      vec3 color=mix(vec3(.016,.085,.13)+ripples,vec3(.37,.53,.62),fresnel*.85)+spec*.70;
      gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,fog:true});
  // Fog uniforms are needed by custom shaders, even when the weather is clear.
  Object.assign(oceanMaterial.uniforms,THREE.UniformsUtils.clone(THREE.UniformsLib.fog));
  const ocean=K.mesh(new THREE.PlaneGeometry(160000,160000,180,180),oceanMaterial,[0,CARRIER.seaHeight,0]);ocean.rotation.x=-Math.PI/2;ocean.castShadow=false;ocean.receiveShadow=false;ocean.frustumCulled=false;
  function setRod(mesh,a,b){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);mesh.position.copy(av.add(bv).multiplyScalar(.5));mesh.scale.y=d.length()/12;mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
  function update(seconds,state,data){
    time.value=seconds;radar.rotation.y=seconds*.25;
    const deviation=data?.glideslopeDeviation||0,index=Math.max(0,Math.min(4,2-Math.round(deviation/.25)));
    ball.forEach((lamp,i)=>{lamp.material=i===index?(index===4?red:amber):dim;});
    wireParts.forEach((parts,i)=>{const z=CARRIER.wires[i],caught=state?.arrested?.wire===i+1;
      const hook=caught?[state.position.x,.18,state.position.z+CARRIER.hookAftM]:[0,.12,z];
      setRod(parts[0],[-12,.12,z],hook);setRod(parts[1],hook,[12,.12,z]);});
  }
  return {group,update,dispose(){scene.remove(group);parked.dispose();disposeTree(group);[green,amber,red,dim].forEach(m=>m.dispose());}};
}
