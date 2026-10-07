import { createAviationSurfaceKit } from './aviation-materials.js?v=20261005';
import { kit, disposeTree, createFighterCockpit } from './aircraft.fighter.js?v=20261008';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Original F/A-18C mesh, metres, nose -Z. Separate twin-engine body and naval gear.
export function createHornetAircraft(THREE) {
  const group = new THREE.Group(); group.name = 'F/A-18C Hornet';
  const K = kit(THREE, group), finish = createAviationSurfaceKit(THREE), textures = [];
  const paint = finish.apply(new THREE.MeshStandardMaterial({ color: 0x969fa3, roughness: .59, metalness: .31 }), 'paint', { repeat: [3, 6], bumpScale: .009 });
  const light = paint.clone(); light.color.setHex(0xb7bec0);
  const dark = new THREE.MeshStandardMaterial({ color: 0x242d31, roughness: .73, metalness: .2 });
  const metal = finish.apply(new THREE.MeshStandardMaterial({ color: 0x768087, roughness: .33, metalness: .85 }), 'brushed');
  const rubber = new THREE.MeshStandardMaterial({ color: 0x101416, roughness: .95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7c948b, transparent: true, opacity: .30, roughness: .07, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  K.loft([[-8.53,.018,.018,0],[-7.7,.25,.30,0],[-6.7,.48,.47,0],[-5.5,.65,.57,0]], dark);
  K.loft([[-5.5,.65,.57,0],[-4.1,.75,.70,0],[-2.5,1.05,.71,-.04],[0,1.28,.64,-.04],[3,1.22,.61,0],[5.3,1.02,.53,0],[7.0,.91,.46,0]], paint);
  K.rod([0,0,-8.53],[0,0,-8.75],.014,metal);
  const canopy = K.mesh(new THREE.SphereGeometry(1,40,24), glass, [0,.77,-4.0]); canopy.scale.set(.60,.66,1.62);
  for(const z of [-5.5,-3.1]) { const frame=K.mesh(new THREE.TorusGeometry(.58,.03,8,32,Math.PI),dark,[0,.7,z]);frame.scale.y=1.1; }
  for(const sign of [-1,1]) K.rod([sign*.58,.7,-5.5],[sign*.58,.7,-2.7],.025,dark);
  K.box([.42,.70,.45],dark,[0,.6,-3.6]);
  const suit=finish.apply(new THREE.MeshStandardMaterial({color:0x4e5948,roughness:.94}),'fabric');
  const torso=K.mesh(new THREE.SphereGeometry(1,18,14),suit,[0,.73,-4.04]);torso.scale.set(.24,.32,.20);
  const helmet=K.mesh(new THREE.SphereGeometry(1,24,18),light,[0,1.13,-4.12]);helmet.scale.set(.17,.19,.17);
  const visor=K.mesh(new THREE.SphereGeometry(1,24,14),dark,[0,1.16,-4.25]);visor.scale.set(.14,.08,.065);
  for(const sign of [-1,1]) K.rod([sign*.11,.92,-4.24],[sign*.1,.48,-4.22],.020,dark);
  const ailerons=[], tails=[], rudders=[], flames=[], cores=[], gears=[];
  for(const sign of [-1,1]) {
    // Large leading-edge root extensions and swept mid-wing. Hornet has two side intakes.
    K.slab([[sign*.60,-5.5],[sign*1.60,-2.9],[sign*1.86,-.4],[sign*.82,.3]],.09,paint).position.y=.1;
    K.slab([[sign*1.05,-1.2],[sign*5.68,.85],[sign*5.68,2.65],[sign*1.06,3.15]],.13,paint);
    const inlet=K.mesh(new THREE.TorusGeometry(.49,.085,12,32),light,[sign*.95,-.45,-2.08]);inlet.scale.set(.92,.86,1);
    const throat=K.mesh(new THREE.CircleGeometry(.47,32),dark,[sign*.95,-.45,-2.04]);throat.rotation.y=Math.PI;
    K.box([.75,.42,3.7],paint,[sign*.86,-.49,.0]);
    const hinge=new THREE.Group();hinge.position.set(sign*3.7,0,2.5);group.add(hinge);
    K.slab([[sign*-1.35,-.05],[sign*1.6,-.05],[sign*1.5,.5],[sign*-1.3,.65]],.07,light,hinge);ailerons.push({hinge,sign});
    const tail=new THREE.Group();tail.position.set(sign*.9,.12,6.2);group.add(tail);
    K.slab([[0,-1.6],[sign*2.7,-.2],[sign*2.4,1.8],[0,1.5]],.1,paint,tail);tails.push({tail,sign});
    // Twin outward-canted fins are a distinct Hornet silhouette.
    const fin=new THREE.Group();fin.position.set(sign*.95,.35,3.6);fin.rotation.z=-sign*.23;group.add(fin);
    const surface=K.slab([[0,0],[2.65,.75],[2.5,2.6],[0,3.0]],.12,paint,fin);surface.rotation.z=Math.PI/2;
    const rudder=K.box([.1,1.55,.32],light,[0,1.35,2.65],fin);rudders.push(rudder);
    K.rod([sign*5.71,.01,.6],[sign*5.71,.01,3.05],.065,dark);
    K.mesh(new THREE.SphereGeometry(.06,10,8),new THREE.MeshBasicMaterial({color:sign<0?0xff3830:0x43ffa0,toneMapped:false}),[sign*5.73,.09,2.4]);
    K.rod([sign*1.65,.105,-.7],[sign*5.3,.105,1.4],.009,dark);
    K.rod([sign*1.65,.105,2.6],[sign*5.3,.105,2.4],.009,dark);
    for(let i=0;i<5;i++) K.box([.16,.19,.75],light,[sign*(1.8+i*.62),-.18,1.8]);
    const nozzle=K.mesh(new THREE.CylinderGeometry(.46,.54,.75,40,1,true),metal,[sign*.62,0,7.35]);nozzle.rotation.x=Math.PI/2;
    K.mesh(new THREE.CircleGeometry(.44,32),dark,[sign*.62,0,7.02]);
    for(let i=0;i<16;i++){const t=i/16*Math.PI*2;const petal=K.box([.06,.027,.7],metal,[sign*.62+Math.sin(t)*.49,Math.cos(t)*.49,7.3]);petal.rotation.z=-t;}
    const flameMaterial=new THREE.MeshBasicMaterial({color:0xff943d,transparent:true,opacity:.4,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
    const flame=K.mesh(new THREE.ConeGeometry(.38,2.8,28,1,true),flameMaterial,[sign*.62,0,9]);flame.rotation.x=Math.PI/2;flame.castShadow=false;flames.push(flame);
    const coreMaterial=flameMaterial.clone();coreMaterial.color.setHex(0xb8cfff);
    const core=K.mesh(new THREE.ConeGeometry(.23,1.7,24,1,true),coreMaterial,[sign*.62,0,8.4]);core.rotation.x=Math.PI/2;core.castShadow=false;cores.push(core);
    if(typeof document!=='undefined') {
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=384;const c=canvas.getContext('2d');
      if(c){c.fillStyle='#27343a';c.textAlign='center';c.font='bold 64px monospace';c.fillText('FA-18C',128,100);c.fillText('018',128,186);c.font='30px monospace';c.fillText('NAVY',128,265);
        const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;textures.push(texture);
        const decal=K.mesh(new THREE.PlaneGeometry(1.25,1.5),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),[sign*.08,1.55,1.8],fin);decal.rotation.y=sign*Math.PI/2;decal.castShadow=false;}
    }
  }
  for(const [x,z,r] of [[0,-4.2,.27],[-1.48,1.0,.39],[1.48,1.0,.39]]) {
    const leg=new THREE.Group();group.add(leg);gears.push(leg);
    K.rod([x*.4,-.45,z],[x,-1.81,z+.18],.08,metal,leg);K.rod([x*.4,-.7,z+.75],[x,-1.78,z+.18],.045,metal,leg);
    const wheels=x===0?[-.16,.16]:[0];
    for(const dx of wheels){const wheel=K.mesh(new THREE.CylinderGeometry(r,r,.20,24),rubber,[x+dx,-2.2+r,z+.18],leg);wheel.rotation.z=Math.PI/2;
      const hub=K.mesh(new THREE.CylinderGeometry(r*.42,r*.42,.215,16),metal,[x+dx,-2.2+r,z+.18],leg);hub.rotation.z=Math.PI/2;}
    K.box([.32,.75,.045],light,[x,-.94,z+.2],leg);
  }
  const hook=new THREE.Group();hook.position.set(0,-.5,4.3);group.add(hook);
  K.rod([0,0,0],[0,-1.7,1.2],.055,metal,hook);K.rod([0,-1.7,1.2],[0,-1.7,1.45],.085,dark,hook);
  for(let i=0;i<6;i++) K.box([.115,.09,.08],i%2?dark:light,[0,-.2-i*.23,.14+i*.16],hook);
  const brake=new THREE.Group();brake.position.set(0,.67,1.9);group.add(brake);K.box([.8,.07,1.5],light,[0,0,.65],brake);
  function update(state={}) {
    const gear=clamp(state.gearPosition??1,0,1);gears.forEach(g=>{g.visible=gear>.02;g.scale.y=Math.max(.03,gear);});
    const roll=state.angularVelocity?.z||0,pitch=state.angularVelocity?.x||0;
    ailerons.forEach(({hinge,sign})=>{hinge.rotation.x=clamp(sign*roll*.2+(state.flapPosition||0)*.08,-.5,.5);});
    tails.forEach(({tail,sign})=>{tail.rotation.x=clamp(-pitch*.5+sign*roll*.07,-.4,.4);});
    rudders.forEach(r=>{r.rotation.y=clamp((state.angularVelocity?.y||0)*.7,-.35,.35);});
    brake.rotation.x=state.spoilers?-.7:0;
    hook.rotation.x=-(1-clamp(state.hookPosition??0,0,1))*1.02;
    const ab=state.afterburnerLevel||0,flicker=.96+.04*Math.sin((state.elapsed||0)*41);
    [...flames,...cores].forEach(f=>{f.visible=ab>.03;f.scale.y=Math.max(.03,ab*flicker);f.material.opacity=.45*ab;});
  }
  update();return {group,update,dispose:()=>{disposeTree(group,textures);finish.dispose();}};
}
export const createHornetCockpit = (THREE, options={}) => createFighterCockpit(THREE, {...options,hornet:true});
