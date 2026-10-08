import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/addons/utils/BufferGeometryUtils.js';
import { VEHICLES, PRODUCTION_CAR_DIMENSIONS } from './vehicles.mjs';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
// Each model has its own longitudinal body sections, cabin placement and aero details.
// Sections are [fraction of half-length, fraction of half-width, shoulder height, hood height].
const profiles = {
  porsche911gt3rs: {
    body: [[-1,.90,.74,.76],[-.86,.98,.82,.85],[-.62,1,.88,.92],[-.34,.96,.86,.88],[0,.90,.84,.79],[.32,.94,.88,.77],[.57,.98,.91,.71],[.81,.92,.87,.63],[1,.73,.64,.58]],
    cabin: [[-.70,.39,.89],[-.43,.58,1.22],[-.08,.63,1.322],[.22,.61,1.29],[.50,.60,.89]],
    roof: [-.34,.23], frontOverhang: 1.03, radius: .353, wheelWidth: [.275,.335], spokes: 10, rounded: true, color: '#d9dadd',
  },
  lamborghiniRevuelto: {
    body: [[-1,.82,.84,.85],[-.82,.98,.85,.86],[-.59,1,.91,.88],[-.30,.88,.79,.78],[0,.83,.73,.74],[.32,.95,.83,.68],[.59,.99,.87,.57],[.84,.85,.63,.46],[1,.66,.46,.39]],
    cabin: [[-.44,.41,.87],[-.23,.60,1.13],[.10,.61,1.16],[.30,.60,1.08],[.57,.60,.72]],
    roof: [-.18,.26], frontOverhang: 1.105, radius: .359, wheelWidth: [.265,.345], spokes: 5, angular: true, color: '#e87722',
  },
  ferrari296Speciale: {
    body: [[-1,.78,.68,.72],[-.83,.93,.79,.82],[-.58,1,.88,.91],[-.32,.91,.80,.81],[0,.89,.78,.74],[.31,.94,.84,.65],[.59,.98,.86,.58],[.84,.88,.67,.48],[1,.68,.48,.40]],
    cabin: [[-.40,.40,.85],[-.24,.58,1.12],[.05,.63,1.181],[.24,.60,1.14],[.53,.60,.80]],
    roof: [-.20,.22], frontOverhang: 1.01, radius: .353, wheelWidth: [.245,.305], spokes: 5, rounded: true, color: '#c72d26',
  },
  mclaren750s: {
    body: [[-1,.73,.70,.77],[-.82,.94,.82,.84],[-.60,1,.87,.86],[-.32,.90,.77,.78],[0,.83,.75,.72],[.31,.94,.82,.66],[.59,.98,.89,.55],[.83,.88,.73,.44],[1,.66,.48,.38]],
    cabin: [[-.45,.35,.83],[-.22,.57,1.13],[.06,.61,1.196],[.25,.58,1.11],[.53,.59,.73]],
    roof: [-.18,.22], frontOverhang: .99, radius: .341, wheelWidth: [.245,.305], spokes: 10, rounded: true, color: '#ed8b28',
  },
  astonVantage: {
    body: [[-1,.74,.76,.78],[-.80,.95,.85,.88],[-.59,1,.91,.89],[-.32,.91,.85,.84],[0,.87,.84,.83],[.32,.95,.88,.77],[.58,1,.91,.72],[.84,.91,.73,.63],[1,.74,.57,.51]],
    cabin: [[-.66,.41,.88],[-.43,.58,1.20],[-.13,.63,1.275],[.06,.62,1.23],[.35,.65,.90]],
    roof: [-.38,.03], frontOverhang: .925, radius: .365, wheelWidth: [.275,.325], spokes: 5, rounded: true, color: '#285944',
  },
  corvetteZ06: {
    body: [[-1,.80,.74,.81],[-.82,.97,.85,.88],[-.60,1,.90,.91],[-.31,.90,.78,.83],[0,.86,.75,.74],[.31,.96,.85,.62],[.58,1,.92,.52],[.84,.90,.69,.43],[1,.66,.45,.36]],
    cabin: [[-.37,.40,.87],[-.21,.59,1.18],[.08,.63,1.235],[.25,.63,1.18],[.55,.65,.72]],
    roof: [-.18,.23], frontOverhang: 1.01, radius: .348, wheelWidth: [.275,.345], spokes: 5, angular: true, color: '#c1c3ca',
  },
  bmwM4: {
    body: [[-1,.78,.83,.91],[-.81,.95,.91,.97],[-.61,1,.98,1.00],[-.30,.96,.94,.94],[0,.94,.94,.91],[.31,.97,.96,.88],[.59,1,.97,.83],[.84,.94,.85,.77],[1,.78,.70,.65]],
    cabin: [[-.70,.51,.95],[-.46,.64,1.32],[-.15,.69,1.397],[.19,.69,1.38],[.45,.67,1.02]],
    roof: [-.40,.20], frontOverhang: .867, radius: .343, wheelWidth: [.275,.285], spokes: 10, color: '#879785',
  },
  nissanZ: {
    body: [[-1,.81,.78,.84],[-.81,.95,.87,.90],[-.59,1,.93,.92],[-.31,.93,.86,.85],[0,.92,.84,.82],[.32,.98,.88,.83],[.60,1,.91,.81],[.84,.90,.78,.74],[1,.71,.66,.63]],
    cabin: [[-.74,.34,.93],[-.51,.53,1.21],[-.21,.61,1.316],[.01,.62,1.27],[.29,.61,.97]],
    roof: [-.40,0], frontOverhang: .945, radius: .343, wheelWidth: [.255,.275], spokes: 5, rounded: true, color: '#d9b83c',
  },
  bmwX3: {
    body: [[-1,.82,1.03,1.10],[-.82,.96,1.14,1.18],[-.60,1,1.20,1.19],[-.30,.96,1.16,1.16],[0,.96,1.15,1.14],[.31,.98,1.17,1.13],[.61,1,1.16,1.11],[.84,.93,1.06,1.04],[1,.78,.92,.91]],
    cabin: [[-.94,.62,1.20],[-.79,.69,1.61],[-.24,.72,1.66],[.25,.73,1.63],[.49,.68,1.21]],
    roof: [-.78,.26], frontOverhang: .877, radius: .390, wheelWidth: [.255,.285], spokes: 10, floor: .43, mirrorHeight: 1.30, color: '#606b75',
  },
  amgGT63: {
    body: [[-1,.77,.82,.87],[-.82,.95,.91,.92],[-.60,1,.96,.93],[-.30,.90,.87,.87],[0,.89,.86,.87],[.31,.93,.91,.85],[.60,.98,.98,.80],[.84,.91,.83,.73],[1,.74,.63,.56]],
    cabin: [[-.72,.40,.93],[-.43,.57,1.26],[-.12,.65,1.354],[.13,.64,1.31],[.39,.66,.98]],
    roof: [-.37,.13], frontOverhang: .99, radius: .360, wheelWidth: [.295,.305], spokes: 10, rounded: true, color: '#446354',
  },
  mustangDarkHorse: {
    body: [[-1,.85,.83,.89],[-.81,.98,.93,.99],[-.60,1,.99,1.03],[-.30,.95,.94,.95],[0,.92,.93,.92],[.32,.97,.96,.91],[.61,1,.97,.88],[.84,.97,.86,.82],[1,.83,.75,.72]],
    cabin: [[-.70,.47,.99],[-.44,.62,1.32],[-.12,.67,1.402],[.12,.66,1.35],[.38,.66,1.02]],
    roof: [-.39,.12], frontOverhang: 1.01, radius: .352, wheelWidth: [.305,.315], spokes: 5, color: '#414f65',
  },
  lotusEmira: {
    body: [[-1,.76,.68,.72],[-.83,.94,.80,.82],[-.60,1,.89,.87],[-.32,.89,.78,.80],[0,.85,.75,.74],[.32,.92,.82,.67],[.60,1,.92,.60],[.84,.88,.75,.49],[1,.68,.49,.43]],
    cabin: [[-.43,.33,.83],[-.24,.54,1.16],[.03,.59,1.226],[.22,.58,1.16],[.49,.59,.79]],
    roof: [-.19,.20], frontOverhang: .97, radius: .350, wheelWidth: [.245,.295], spokes: 10, rounded: true, color: '#487264',
  },
  ferrari12cilindri: {
    body: [[-1,.80,.79,.85],[-.82,.96,.88,.94],[-.60,1,.92,.96],[-.31,.91,.85,.87],[0,.89,.85,.86],[.31,.95,.87,.85],[.61,1,.93,.82],[.84,.93,.79,.73],[1,.78,.65,.60]],
    cabin: [[-.71,.44,.89],[-.47,.60,1.22],[-.16,.65,1.292],[.06,.64,1.25],[.35,.66,.92]],
    roof: [-.40,.06], frontOverhang: 1.05, radius: .365, wheelWidth: [.275,.315], spokes: 5, bodyWidth: 1.980, rounded: true, color: '#d4d6d6',
  },
  lamborghiniTemerario: {
    body: [[-1,.79,.71,.78],[-.82,.96,.84,.87],[-.60,1,.90,.88],[-.31,.88,.77,.78],[0,.85,.74,.73],[.32,.95,.84,.65],[.60,.99,.88,.56],[.84,.88,.64,.47],[1,.73,.47,.41]],
    cabin: [[-.42,.39,.88],[-.22,.59,1.15],[.08,.62,1.201],[.28,.60,1.15],[.55,.61,.77]],
    roof: [-.18,.26], frontOverhang: 1.06, radius: .357, wheelWidth: [.255,.325], spokes: 5, angular: true, color: '#537ea4',
  },
  porsche911turboS: {
    body: [[-1,.80,.72,.75],[-.86,.95,.82,.86],[-.62,1,.90,.92],[-.34,.96,.87,.87],[0,.91,.84,.80],[.32,.94,.88,.77],[.59,.98,.91,.71],[.83,.91,.85,.64],[1,.75,.65,.58]],
    cabin: [[-.73,.39,.92],[-.45,.58,1.22],[-.09,.64,1.305],[.21,.61,1.27],[.49,.61,.91]],
    roof: [-.37,.23], frontOverhang: 1.016, radius: .36, wheelWidth: [.255,.325], spokes: 5, rounded: true, color: '#78806e',
  },
  amgSL63: {
    body: [[-1,.77,.81,.87],[-.82,.95,.90,.93],[-.60,1,.95,.95],[-.30,.92,.87,.89],[0,.88,.87,.87],[.31,.94,.92,.83],[.60,.99,.96,.77],[.84,.92,.79,.69],[1,.76,.61,.56]],
    cabin: [[.12,.57,1.359],[.25,.60,1.28],[.45,.65,.95]],
    roof: [.12,.25], open: true, opening: [-.60,.20], frontOverhang: 1.02, radius: .36, wheelWidth: [.275,.305], spokes: 10, rounded: true, color: '#d2c5b0',
  },
  hondaPrelude: {
    body: [[-1,.79,.83,.88],[-.83,.95,.88,.91],[-.59,1,.94,.96],[-.32,.95,.90,.90],[0,.93,.89,.86],[.31,.95,.90,.81],[.59,.99,.91,.75],[.84,.89,.72,.66],[1,.73,.57,.53]],
    cabin: [[-.76,.35,.93],[-.52,.55,1.19],[-.20,.65,1.356],[.11,.66,1.33],[.43,.66,.96]],
    roof: [-.37,.13], frontOverhang: .965, radius: .337, wheelWidth: [.235,.235], spokes: 10, rounded: true, color: '#4587b4',
  },
  toyotaGR86: {
    body: [[-1,.80,.79,.86],[-.82,.95,.86,.91],[-.60,1,.93,.93],[-.30,.94,.88,.86],[0,.92,.86,.84],[.31,.96,.91,.81],[.60,1,.95,.77],[.84,.90,.77,.67],[1,.72,.58,.52]],
    cabin: [[-.67,.37,.92],[-.43,.56,1.22],[-.15,.61,1.310],[.10,.62,1.27],[.37,.62,.94]],
    roof: [-.38,.09], frontOverhang: .82, radius: .314, wheelWidth: [.215,.215], spokes: 10, rounded: true, color: '#bd2f29',
  },
  mazdaMX5: {
    body: [[-1,.76,.71,.80],[-.82,.94,.81,.84],[-.60,1,.88,.88],[-.31,.90,.81,.80],[0,.86,.79,.78],[.32,.94,.87,.77],[.60,1,.91,.74],[.84,.85,.73,.62],[1,.63,.53,.47]],
    cabin: [[.07,.50,1.240],[.19,.53,1.19],[.40,.58,.92]],
    roof: [.07,.19], open: true, opening: [-.54,.16], frontOverhang: .84, radius: .308, wheelWidth: [.205,.205], spokes: 8, rounded: true, color: '#b72a2e',
  },
  bmwM2: {
    body: [[-1,.85,.84,.91],[-.82,.97,.91,.96],[-.60,1,.98,.99],[-.31,.95,.93,.92],[0,.92,.92,.90],[.31,.97,.95,.86],[.60,1,.98,.82],[.84,.96,.85,.78],[1,.83,.70,.67]],
    cabin: [[-.67,.48,.96],[-.43,.62,1.29],[-.12,.68,1.403],[.16,.68,1.37],[.42,.65,1.01]],
    roof: [-.38,.18], frontOverhang: .852, radius: .344, wheelWidth: [.275,.285], spokes: 10, color: '#5791ab',
  },
};

function sectionAt(sections, q) {
  let index = sections.findIndex(section => section[0] >= q);
  if (index < 1) index = q < sections[0][0] ? 1 : sections.length - 1;
  const a = sections[index - 1], b = sections[index];
  const t = clamp((q - a[0]) / (b[0] - a[0]), 0, 1), smooth = t * t * (3 - 2 * t);
  return a.slice(1).map((value, i) => mix(value, b[i + 1], smooth));
}

function geometryFrom(vertices, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

function batchStatic(parent) {
  const batches = new Map();
  for (const node of parent.children.filter(item => item.isMesh)) {
    node.updateMatrix();
    const geometry = node.geometry.clone().applyMatrix4(node.matrix);
    geometry.deleteAttribute('uv');
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    if (!batches.has(node.material)) batches.set(node.material, []);
    batches.get(node.material).push({ node, geometry });
  }
  for (const [material, parts] of batches) {
    if (parts.length > 1) {
      const geometry = mergeGeometries(parts.map(item => item.geometry));
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${parent.name}-${material.name}`;
        mesh.castShadow = !material.transparent; mesh.receiveShadow = !material.transparent;
        parent.add(mesh);
        for (const item of parts) { parent.remove(item.node); item.node.geometry.dispose(); }
      }
    }
    for (const item of parts) item.geometry.dispose();
  }
}

export function createProductionCar({ mobile = false, vehicle = 'porsche911gt3rs' } = {}) {
  const shape = profiles[vehicle], spec = PRODUCTION_CAR_DIMENSIONS[vehicle], preset = VEHICLES[vehicle];
  if (!shape || !spec) throw new RangeError(`Unknown production car: ${vehicle}`);
  const { length, width, height, wheelbase } = spec;
  const halfLength = length / 2, halfWidth = (shape.bodyWidth||width) / 2, baseY = .46;
  const frontZ = halfLength - shape.frontOverhang, rearZ = frontZ - wheelbase;
  const group = new THREE.Group(); group.name = preset.name;
  const chassis = new THREE.Group(); chassis.name = 'suspension-response'; chassis.position.y = baseY; group.add(chassis);
  const materials = new Set(), textures = new Set(), signatures = [];
  function material(name, Type, options) { const m = new Type(options); m.name = name; materials.add(m); return m; }
  const paint = material('body-paint', THREE.MeshPhysicalMaterial, { color: shape.color, roughness: .24, metalness: .48, clearcoat: 1, clearcoatRoughness: .085, envMapIntensity: 1.08, side: THREE.DoubleSide });
  const carbon = material('carbon-aero', THREE.MeshStandardMaterial, { color: '#151d20', metalness: .28, roughness: .38, side: THREE.DoubleSide });
  const black = material('intake-mesh', THREE.MeshStandardMaterial, { color: '#080b0d', roughness: .8, metalness: .12, side: THREE.DoubleSide });
  const rubber = material('tyre-rubber', THREE.MeshStandardMaterial, { color: '#111416', roughness: .86 });
  const alloy = material('forged-alloy', THREE.MeshStandardMaterial, { color: '#626c74', metalness: 1, roughness: .26 });
  const polished = material('machined-rim-edge', THREE.MeshStandardMaterial, { color: '#adb6bd', metalness: 1, roughness: .18 });
  const brake = material('brake-disc', THREE.MeshStandardMaterial, { color: '#596268', metalness: .8, roughness: .48 });
  const caliper = material('brake-caliper', THREE.MeshStandardMaterial, { color: vehicle === 'porsche911gt3rs' ? '#c72a20' : '#ddb729', metalness: .4, roughness: .32 });
  const glass = material('tinted-glass', THREE.MeshPhysicalMaterial, { color: '#17242b', metalness: .35, roughness: .095, clearcoat: 1, clearcoatRoughness: .04, envMapIntensity: .8, side: THREE.DoubleSide });
  const frontLight = material('led-headlamp', THREE.MeshStandardMaterial, { color: '#e4eef0', emissive: '#d5ebf4', emissiveIntensity: 1.2, metalness: .22, roughness: .18 });
  const rearLight = material('led-brakelamp', THREE.MeshPhysicalMaterial, { color: '#a0100b', emissive: '#f52d16', emissiveIntensity: .35, roughness: .21, clearcoat: 1 });
  function mesh(geometry, mat, parent = chassis, name = '') {
    const item = new THREE.Mesh(geometry, mat); item.name = name;
    item.castShadow = !mat.transparent; item.receiveShadow = !mat.transparent;
    parent.add(item); return item;
  }
  function box(w, h, l, mat, x, y, z, name = '', parent = chassis) {
    const item = mesh(new THREE.BoxGeometry(w, h, l), mat, parent, name);
    item.position.set(x, y - (parent === chassis ? baseY : 0), z); return item;
  }
  function line(points, radius, mat, name = '', parent = chassis) {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y - (parent === chassis ? baseY : 0), z)), false, 'centripetal');
    return mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * (mobile ? 3 : 5)), radius, mobile ? 5 : 7, false), mat, parent, name);
  }
  function panel(points, mat, name = '') {
    const vertices = points.flatMap(([x,y,z]) => [x,y-baseY,z]), indices = [];
    for (let i = 1; i < points.length - 1; i++) indices.push(0,i,i+1);
    return mesh(geometryFrom(vertices,indices), mat, chassis, name);
  }
  function ellipsoid(x,y,z,rx,ry,rz,mat,name = '') {
    const item = mesh(new THREE.SphereGeometry(1,mobile ? 16 : 24,12),mat,chassis,name);
    item.position.set(x,y-baseY,z); item.scale.set(rx,ry,rz); return item;
  }
  function exhaust(x,y,z,radius = .047, hexagonal = false) {
    const outer = mesh(new THREE.CylinderGeometry(radius,radius,.10,hexagonal ? 6 : 16,1,true),alloy);
    outer.rotation.x = Math.PI/2; outer.position.set(x,y-baseY,z);
    const lip = mesh(new THREE.RingGeometry(radius*.86,radius,hexagonal ? 6 : 16),alloy);
    lip.rotation.y = Math.PI; lip.position.set(x,y-baseY,z-.057);
    const inner = mesh(new THREE.CircleGeometry(radius*.86,hexagonal ? 6 : 16),black);
    inner.rotation.y = Math.PI; inner.position.set(x,y-baseY,z-.055);
  }
  const shoulder = z => sectionAt(shape.body,z/halfLength)[1];
  const floor = shape.floor || .23;
  const bumperFloor = direction => floor + (direction < 0 && shape.rounded ? .085 : 0);
  const bumperTuck = (direction,u,t) => (shape.rounded ? .13 : .055)*Math.abs(u)**2*Math.sin(Math.PI*t) + (direction < 0 ? .075 : .035)*t*t;
  const cabinPoint = (q,u,offset=0) => {
    const z=q*halfLength,[w,peak]=sectionAt(shape.cabin,q),bottom=shoulder(z)+.018;
    // A gently crowned roof rolls into steep side windows. The previous half
    // ellipse made every windscreen look like a continuous bubble canopy.
    const crown=(1-Math.abs(u)**(vehicle==='bmwX3'?8:shape.angular?4:5))**(vehicle==='bmwX3'?.32:.42);
    const doubleBubble=vehicle==='lamborghiniRevuelto'?.012*Math.sin(u*Math.PI)**2:0;
    return [u*w,bottom+(peak-bottom)*crown+doubleBubble+offset,z];
  };
  // Flowing fenders and hood are lofted independently from the cabin. Real arches
  // leave empty space above tyres instead of painting dark circles onto a box.
  const vertices = [], indices = [], rows = mobile ? 25 : 41, stations = mobile ? 80 : 128;
  for (let i = 0; i <= stations; i++) {
    const z = -halfLength + i/stations*length, [w,edge,center] = sectionAt(shape.body,z/halfLength);
    for (let j = 0; j < rows; j++) {
      const u = j/(rows-1)*2-1, bulge = shape.rounded ? .024*Math.exp(-(((Math.abs(u)-.79)/.13)**2)) : 0;
      vertices.push(u*w*halfWidth, mix(center,edge,Math.abs(u)**(shape.angular ? 1.15 : 2.2)) + bulge - baseY, z);
      const cabinOpening=shape.open&&z>shape.opening[0]*halfLength&&z<shape.opening[1]*halfLength&&Math.abs(u)<.64;
      if (i && j && !cabinOpening) { const a=i*rows+j,b=a-1,c=a-rows,d=c-1; indices.push(a,c,b,b,c,d); }
    }
  }
  mesh(geometryFrom(vertices,indices),paint,chassis,`${vehicle}-body-sculpture`);
  for (const side of [-1,1]) {
    const verts = [], face = [], sideRows=mobile?7:8;
    for (let i=0;i<=stations*2;i++) {
      const z=-halfLength+i/(stations*2)*length, [w,top]=sectionAt(shape.body,z/halfLength);
      const endWeight=clamp((Math.abs(z/halfLength)-.86)/.14,0,1)**2;
      let lower=mix(floor,bumperFloor(Math.sign(z)),endWeight);
      for (const axle of [frontZ,rearZ]) {
        const d=Math.abs(z-axle), r=shape.radius+.047;
        if(d<r) lower=Math.max(lower,shape.radius+Math.sqrt(r*r-d*d));
      }
      lower=Math.min(top-.004,lower);
      for(let j=0;j<=sideRows;j++){
        const t=j/sideRows,roll=shape.rounded?.038*Math.sin(Math.PI*t):.012*Math.sin(Math.PI*t);
        const x=w*halfWidth+roll-.035*t*t;
        const endZ=z-Math.sign(z)*bumperTuck(Math.sign(z),1,t)*endWeight;
        verts.push(side*x,mix(top,lower,t)-baseY,endZ);
        if(i&&j){const a=i*(sideRows+1)+j,b=a-1,c=a-sideRows-1,d=c-1;face.push(a,c,b,b,c,d);}
      }
    }
    mesh(geometryFrom(verts,side<0?face:face.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[])),paint,chassis,'wheel-arch-side');
    box(.065,.065,wheelbase-.68,carbon,side*(halfWidth*.94),(shape.floor||.23)-.005,(frontZ+rearZ)/2,'lower-side-skirt');
    const mirrorZ=shape.cabin.at(-1)[0]*halfLength-.10;
    const mirrorHeight=shape.mirrorHeight||1.015;
    line([[side*halfWidth*.72,mirrorHeight-.025,mirrorZ],[side*halfWidth*.98,mirrorHeight-.005,mirrorZ-.02]],.018,carbon);
    ellipsoid(side*(halfWidth+.055),mirrorHeight,mirrorZ-.04,.13,.065,.085,paint,'side-mirror');
    const doorFront=shape.cabin.at(-1)[0]*halfLength-.05, doorRear=vehicle==='bmwM4'?-.93:-.63;
    const doorWidth=sectionAt(shape.body,doorRear/halfLength)[0]*halfWidth+.005;
    line([[side*doorWidth,.82,doorRear],[side*doorWidth,.46,doorRear],[side*halfWidth*.89,.39,doorFront],[side*halfWidth*.91,.78,doorFront]],.0035,carbon,'door-shut-line');
    box(.012,.016,.11,carbon,side*doorWidth,.84,doorRear+.18,'flush-door-handle');
  }
  // Rounded shoulders wrap into a recessed lower bumper instead of ending in a
  // vertical painted slab. Angular supercars retain their sharper creases.
  for (const direction of [-1,1]) {
    const z=direction*halfLength,[w,edge,center]=sectionAt(shape.body,direction),verts=[],face=[],bands=mobile?10:16;
    for(let i=0;i<=bands;i++)for(let j=0;j<rows;j++){
      const u=j/(rows-1)*2-1,t=i/bands,top=mix(center,edge,Math.abs(u)**(shape.angular?1.15:2.2));
      const lower=bumperFloor(direction)+.025*(1-u*u),roll=shape.rounded?.038*Math.sin(Math.PI*t):.012*Math.sin(Math.PI*t);
      verts.push(u*(w*halfWidth+roll-.035*t*t),mix(top,lower,t)-baseY,z-direction*bumperTuck(direction,u,t));
      if(i&&j){const a=i*rows+j,b=a-1,c=a-rows,d=c-1;face.push(a,c,b,b,c,d);}
    }
    mesh(geometryFrom(verts,face),paint,chassis,direction>0?'front-fascia':'rear-fascia');
    const lip=[];
    for(let i=0;i<=12;i++){const u=i/6-1;lip.push([u*(w*halfWidth-.025),bumperFloor(direction)+.012,z-direction*(direction<0?.09:.04)]);}
    line(lip,.023,carbon,'bumper-lower-aero');
    if(direction<0)panel([[-w*halfWidth*.91,floor+.014,z+.075],[w*halfWidth*.91,floor+.014,z+.075],[w*halfWidth*.86,bumperFloor(-1)+.032,z+.08],[-w*halfWidth*.86,bumperFloor(-1)+.032,z+.08]],carbon,'sculpted-diffuser-base');
  }
  // Curved windscreens, framed side glass and separate opaque roof retain the
  // rear engine deck or long hood specific to each layout.
  const cabinVertices=[],cabinIndices=[],cabinRows=shape.angular?12:24,cabinSteps=mobile?32:52;
  const cabinMin=shape.cabin[0][0],cabinMax=shape.cabin.at(-1)[0];
  for(let i=0;i<=cabinSteps;i++){
    const q=mix(cabinMin,cabinMax,i/cabinSteps);
    for(let j=0;j<=cabinRows;j++){
      const [x,y,z]=cabinPoint(q,j/cabinRows*2-1);
      cabinVertices.push(x,y-baseY,z);
      if(i&&j){const a=i*(cabinRows+1)+j,b=a-1,c=a-cabinRows-1,d=c-1;cabinIndices.push(a,c,b,b,c,d);}
    }
  }
  mesh(geometryFrom(cabinVertices,cabinIndices),glass,chassis,'model-specific-greenhouse');
  const roofVerts=[],roofIndices=[],roofSteps=24,roofRows=16,roofEdge=vehicle==='bmwX3'?.91:.74;
  for(let i=0;i<=roofSteps;i++){
    const q=mix(...shape.roof,i/roofSteps);
    for(let j=0;j<=roofRows;j++){
      const [x,y,z]=cabinPoint(q,(j/roofRows*2-1)*roofEdge,.009);
      roofVerts.push(x,y-baseY,z);
      if(i&&j){const a=i*(roofRows+1)+j,b=a-1,c=a-roofRows-1,d=c-1;roofIndices.push(a,c,b,b,c,d);}
    }
  }
  if(!shape.open)mesh(geometryFrom(roofVerts,roofIndices),vehicle==='bmwM4'||vehicle==='nissanZ'||vehicle==='hondaPrelude'?carbon:paint,chassis,'opaque-coupe-roof');
  for(const side of [-1,1]){
    const lower=shape.cabin.map(([q,w])=>[side*w,shoulder(q*halfLength)+.028,q*halfLength]);
    line(lower,.012,carbon,'window-sill');
    for(const q of shape.open?[shape.cabin[0][0]]:[shape.roof[0]-.055,shape.roof[1]+.04]){
      const arc=[];
      for(let i=0;i<=8;i++)arc.push(cabinPoint(q,side*(1-i/8),.015));
      line(arc,.024,paint,'window-pillar');
    }
    if(!shape.open){
      const edge=[];
      for(let i=0;i<=12;i++)edge.push(cabinPoint(mix(...shape.roof,i/12),side*(roofEdge+.015),.008));
      line(edge,.009,carbon,'roof-window-gasket');
      const dividerQ=vehicle==='bmwX3'?-.18:mix(...shape.roof,.37);
      line([cabinPoint(dividerQ,side,.018),cabinPoint(dividerQ,side*(roofEdge+1)/2,.018),cabinPoint(dividerQ,side*roofEdge,.018)],.013,carbon,'side-window-divider');
    }
  }
  if(shape.open){
    const leather=material('open-cabin-leather',THREE.MeshStandardMaterial,{color:vehicle==='amgSL63'?'#594332':'#252a2b',roughness:.74});
    const cabinRear=shape.opening[0]*halfLength,cabinFront=shape.opening[1]*halfLength;
    box(1.13,.045,cabinFront-cabinRear,black,0,.51,(cabinFront+cabinRear)/2,'open-cockpit-floor');
    const seatZ=vehicle==='amgSL63'?-.19:-.13;
    for(const side of [-1,1]){
      box(.39,.10,.44,leather,side*.32,.59,seatZ,'open-seat-cushion');
      const back=box(.36,.42,.10,leather,side*.32,.83,seatZ-.22,'open-seat-back');back.rotation.x=-.14;
      ellipsoid(side*.32,1.09,seatZ-.25,.128,.11,.06,leather,'open-seat-headrest');
      line([[side*.48,.93,seatZ-.39],[side*.48,1.10,seatZ-.39],[side*.20,1.10,seatZ-.39],[side*.20,.94,seatZ-.39]],.024,carbon,'roll-over-hoop');
      if(vehicle==='amgSL63'){
        box(.34,.10,.27,leather,side*.30,.62,-.75,'rear-seat-cushion');
        box(.34,.30,.075,leather,side*.30,.79,-.97,'rear-seat-back');
      }
    }
    box(1.07,.13,.22,black,0,.84,cabinFront-.005,'open-dashboard');
    box(.20,.25,.81,black,0,.65,(cabinFront+cabinRear)/2,'center-console');
    const steering=mesh(new THREE.TorusGeometry(.14,.017,7,32),leather);steering.position.set(-.32,.88-baseY,cabinFront-.22);steering.rotation.x=-.24;
    box(.07,.07,.055,carbon,-.32,.88,cabinFront-.215,'steering-center');
    box(1.15,.04,.16,paint,0,.92,cabinRear-.04,'folded-soft-top-deck');
  }
  const front=halfLength-.006,rear=-halfLength-.006;
  // Model signatures use genuine layouts: round Porsche optics, Lamborghini Y,
  // Ferrari gamma aero, McLaren sockets, Aston grille, Corvette and BMW quads.
  if(vehicle==='porsche911gt3rs'){
    signatures.push('round-headlamps','double-swan-neck-wing','hood-s-ducts','full-width-rear-light');
    for(const side of [-1,1]){
      const lamp=ellipsoid(side*.67,.865,front-.29,.171,.207,.06,black,'911-headlamp-housing');lamp.rotation.x=-.34;
      const lens=ellipsoid(side*.67,.868,front-.249,.143,.180,.028,frontLight,'911-round-headlight');lens.rotation.x=-.34;
      const ring=mesh(new THREE.TorusGeometry(.146,.012,6,40),frontLight);ring.scale.y=1.2;ring.position.set(side*.67,.87-baseY,front-.215);ring.rotation.x=-.34;
      box(.43,.14,.04,black,side*.56,.41,front+.005,'front-cooling-intake');
      panel([[side*.14,.79,.71],[side*.31,.75,1.40],[side*.56,.80,1.37],[side*.45,.89,.76]],carbon,'hood-air-exit');
      for(let i=0;i<5;i++)box(.18,.012,.032,carbon,side*.76,.93,rearZ-.18+i*.067,'fender-louvre');
      line([[side*.62,.91,rearZ-.24],[side*.63,1.40,rearZ-.01],[side*.63,1.48,rearZ-.35]],.027,carbon,'swan-neck-wing-support');
      box(.023,.22,.48,carbon,side*.95,1.42,rearZ-.38,'wing-endplate');
      exhaust(side*.085,.39,rear-.015,.049);
      panel([[side*.28,.59,rear-.012],[side*.69,.57,rear+.012],[side*.78,.42,rear+.032],[side*.30,.43,rear+.018]],black,'911-recessed-bumper-vent');
      line([[side*.31,.46,rear-.055],[side*.57,.455,rear-.049],[side*.70,.46,rear-.040]],.009,rearLight,'911-lower-reflector');
      line([[side*.69,.77,rear+.12],[side*.84,.80,rear+.25],[side*.91,.87,rear+.43]],.010,carbon,'911-rear-fender-blade');
    }
    box(1.86,.045,.47,carbon,0,1.42,rearZ-.39,'gt3-rs-upper-wing');
    box(1.78,.035,.29,carbon,0,1.30,rearZ-.33,'gt3-rs-lower-wing');
    const tail=[[-.84,.735,rear+.050],[-.43,.757,rear-.017],[0,.765,rear-.024],[.43,.757,rear-.017],[.84,.735,rear+.050]];
    line(tail,.036,black,'911-recessed-lamp-housing');
    line(tail.map(([x,y,z])=>[x,y+.007,z-.047]),.010,rearLight,'911-light-bar');
    panel([[-.76,.29,rear-.022],[.76,.29,rear-.022],[.73,.53,rear-.032],[.65,.585,rear-.038],[-.65,.585,rear-.038],[-.73,.53,rear-.032]],black,'911-wide-recessed-lower-bumper');
    box(.50,.145,.016,black,0,.515,rear-.044,'911-number-plate-recess');
    box(.43,.095,.012,polished,0,.525,rear-.058,'911-rear-number-plate');
    for(let i=-6;i<=6;i++)box(.025,.012,.23,black,i*.063,.858,-1.59,'911-engine-deck-louvre');
  }else if(vehicle==='lamborghiniRevuelto'){
    signatures.push('y-shaped-lights','hexagonal-high-exhaust','open-v12-engine-bay','triangular-side-intakes');
    for(const side of [-1,1]){
      panel([[side*.25,.51,front+.01],[side*.83,.60,front-.35],[side*.78,.38,front+.018],[side*.30,.35,front+.024]],black,'angular-front-intake');
      line([[side*.35,.55,front-.08],[side*.58,.63,front-.29],[side*.85,.74,front-.54]],.018,frontLight,'y-led-upper');
      line([[side*.58,.63,front-.29],[side*.81,.60,front-.45]],.018,frontLight,'y-led-lower');
      line([[side*.30,.79,rear+.05],[side*.57,.79,rear+.065],[side*.84,.90,rear+.255]],.042,black,'revuelto-rear-y-lamp-socket');
      line([[side*.57,.79,rear+.065],[side*.83,.64,rear+.13]],.040,black,'revuelto-rear-y-lower-socket');
      line([[side*.30,.79,rear-.025],[side*.57,.79,rear-.01],[side*.84,.90,rear+.18]],.017,rearLight,'rear-y-upper');
      line([[side*.57,.79,rear-.01],[side*.83,.64,rear+.055]],.017,rearLight,'rear-y-lower');
      panel([[side*.96,.30,-.20],[side*.97,.74,-.66],[side*.85,.80,-1.10],[side*.86,.30,-1.05]],black,'revuelto-triangle-side-intake');
      line([[side*.88,.31,-.14],[side*.96,.72,-.67],[side*.87,.80,-1.16]],.025,carbon,'intake-flying-edge');
      exhaust(side*.126,.78,rear-.025,.096,true);
      box(.28,.016,.46,carbon,side*.73,.90,-1.10,'rear-buttress');
    }
    panel([[-.39,.84,-.82],[.39,.84,-.82],[.39,.89,-1.62],[-.39,.89,-1.62]],black,'open-engine-deck');
    for(let i=0;i<6;i++)box(.30,.023,.045,alloy,0,.912,-.94-i*.10,'exposed-v12-plenum');
    box(1.36,.035,.21,paint,0,.91,rear+.16,'active-rear-spoiler');
    ellipsoid(0,.785,rear+.008,.32,.135,.035,black,'revuelto-high-exhaust-surround');
    panel([[-.80,.25,rear-.019],[.80,.25,rear-.019],[.83,.46,rear-.026],[.52,.50,rear-.032],[.32,.56,rear-.028],[-.32,.56,rear-.028],[-.52,.50,rear-.032],[-.83,.46,rear-.026]],carbon,'revuelto-deep-rear-diffuser');
    box(.42,.12,.020,black,0,.405,rear-.056,'revuelto-number-plate-recess');
  }else if(vehicle==='ferrari296Speciale'){
    signatures.push('gamma-rear-wings','suspended-front-splitter','high-central-exhaust','ferrari-bridge-tail-lights');
    for(const side of [-1,1]){
      line([[side*.37,.64,front-.20],[side*.66,.73,front-.43],[side*.79,.78,front-.65]],.018,frontLight,'296-led-blade');
      panel([[side*.16,.31,front+.005],[side*.77,.35,front-.10],[side*.63,.49,front-.07],[side*.22,.44,front+.015]],black,'296-front-intake');
      box(.58,.026,.24,carbon,side*.45,.27,front-.10,'suspended-splitter');
      box(.028,.09,.05,carbon,side*.58,.34,front-.11,'splitter-support');
      panel([[side*.89,.42,-.25],[side*.93,.80,-.75],[side*.86,.84,-1.10],[side*.79,.50,-1.05]],black,'296-side-scoop');
      line([[side*.42,.76,rear-.018],[side*.68,.77,rear+.04],[side*.75,.78,rear+.11]],.019,rearLight,'296-rear-lamp');
      const wing=box(.50,.035,.28,carbon,side*.71,.95,rear+.38,'gamma-wing');wing.rotation.z=side*-.10;
      box(.025,.11,.28,carbon,side*.93,.91,rear+.38,'gamma-wing-tip');
    }
    exhaust(0,.69,rear-.04,.085);
    panel([[-.48,.83,-.63],[.48,.83,-.63],[.47,.91,-1.40],[-.47,.91,-1.40]],glass,'296-rear-engine-glass');
    for(let i=0;i<4;i++)box(.48,.018,.04,alloy,0,.85,-.80-i*.10,'engine-cover-detail');
  }else if(vehicle==='mclaren750s'){
    signatures.push('deep-eye-socket-headlamps','teardrop-greenhouse','center-high-twin-exhaust','active-airbrake');
    for(const side of [-1,1]){
      ellipsoid(side*.67,.62,front-.17,.205,.13,.14,black,'750s-eye-socket');
      line([[side*.48,.65,front-.09],[side*.58,.71,front-.22],[side*.80,.73,front-.35],[side*.85,.63,front-.20]],.017,frontLight,'750s-orbit-led');
      panel([[side*.91,.44,-.13],[side*.94,.79,-.65],[side*.81,.87,-1.13],[side*.84,.47,-1.05]],black,'750s-side-air-channel');
      line([[side*.80,.84,-.31],[side*.89,.87,-.68],[side*.82,.93,-1.27]],.043,paint,'750s-flying-buttress');
      line([[side*.42,.80,rear-.014],[side*.64,.80,rear+.04],[side*.79,.79,rear+.15]],.016,rearLight,'750s-slim-rear-led');
      exhaust(side*.07,.75,rear-.025,.055);
    }
    box(1.58,.031,.40,carbon,0,.98,rear+.31,'750s-active-airbrake');
    for(const x of [-.37,.37])box(.037,.19,.09,carbon,x,.85,rear+.33,'airbrake-strut');
    panel([[-.33,.82,-.72],[.33,.82,-.72],[.38,.85,-1.38],[-.38,.85,-1.38]],glass,'750s-engine-glass');
  }else if(vehicle==='astonVantage'){
    signatures.push('wide-vane-grille','long-front-engine-hood','side-strake','continuous-rear-light');
    panel([[-.73,.31,front+.018],[.73,.31,front+.018],[.63,.53,front+.022],[-.63,.53,front+.022]],black,'vantage-wide-mouth');
    for(let i=0;i<5;i++)box(1.25+i*.025,.008,.018,alloy,0,.35+i*.035,front+.035,'vantage-grille-vane');
    for(const side of [-1,1]){
      ellipsoid(side*.68,.74,front-.20,.15,.065,.11,black,'vantage-headlight-housing');
      line([[side*.55,.78,front-.12],[side*.70,.81,front-.22],[side*.81,.77,front-.36]],.017,frontLight,'vantage-headlight-signature');
      line([[side*.61,.75,front-.13],[side*.78,.73,front-.29]],.011,frontLight,'vantage-led-lower');
      line([[side*.97,.80,.88],[side*.93,.80,.36]],.010,alloy,'vantage-side-strake');
      box(.025,.085,.38,black,side*.955,.77,.72,'vantage-side-vent');
      for(const x of [.51,.64])exhaust(side*x,.38,rear-.03,.047);
      const vent=box(.17,.008,.36,black,side*.29,.85,.82,'vantage-hood-vent');vent.rotation.x=-.06;
    }
    line([[-.85,.79,rear+.095],[-.68,.82,rear-.015],[0,.82,rear-.024],[.68,.82,rear-.015],[.85,.79,rear+.095]],.015,rearLight,'vantage-full-rear-led');
    box(1.24,.037,.15,paint,0,.90,rear+.17,'vantage-ducktail');
  }else if(vehicle==='corvetteZ06'){
    signatures.push('angular-side-blades','four-central-exhausts','dual-trapezoid-tail-lights','transparent-engine-cover');
    for(const side of [-1,1]){
      line([[side*.36,.54,front-.12],[side*.63,.66,front-.44],[side*.82,.82,front-.72]],.019,frontLight,'z06-swept-headlight');
      panel([[side*.91,.32,-.11],[side*.97,.78,-.62],[side*.85,.88,-1.22],[side*.88,.38,-1.10]],black,'z06-side-intake');
      line([[side*.87,.37,-.02],[side*.95,.78,-.61],[side*.86,.89,-1.22]],.035,carbon,'z06-side-blade');
      for(const x of [.45,.73]){
        line([[side*(x-.09),.75,rear-.022],[side*(x+.085),.76,rear-.01],[side*(x+.072),.67,rear-.012],[side*(x-.075),.67,rear-.025],[side*(x-.09),.75,rear-.022]],.017,rearLight,'z06-trapezoid-tail-light');
      }
      for(const x of [.075,.20])exhaust(side*x,.39,rear-.035,.049);
    }
    panel([[-.40,.83,-.74],[.40,.83,-.74],[.43,.93,-1.45],[-.43,.93,-1.45]],glass,'z06-engine-glass');
    for(const side of [-1,1])box(.15,.017,.51,paint,side*.18,.88,-1.08,'z06-engine-cam-cover');
    box(1.48,.03,.23,carbon,0,.97,rear+.18,'z06-rear-spoiler');
  }else if(vehicle==='bmwM4'){
    signatures.push('vertical-twin-kidney-grille','carbon-four-seat-roof','double-led-optics','quad-outboard-exhausts');
    for(const side of [-1,1]){
      panel([[side*.06,.30,front+.035],[side*.34,.32,front+.03],[side*.36,.65,front+.02],[side*.095,.67,front+.026]],black,'m4-tall-kidney');
      for(let i=0;i<5;i++)box(.24,.012,.013,carbon,side*.205,.36+i*.052,front+.043,'kidney-grille-bar');
      line([[side*.45,.71,front-.012],[side*.65,.75,front-.10],[side*.82,.73,front-.24]],.015,frontLight,'m4-led-upper');
      for(const x of [.51,.72])line([[side*(x-.06),.70,front-.01],[side*x,.67,front-.018],[side*(x+.055),.71,front-.045]],.016,frontLight,'m4-double-led');
      line([[side*.42,.84,rear-.014],[side*.73,.86,rear+.03],[side*.85,.82,rear+.12],[side*.73,.76,rear+.015]],.020,rearLight,'m4-laser-tail-light');
      for(const x of [.54,.67])exhaust(side*x,.34,rear-.035,.047);
      box(.018,.075,.25,black,side*.94,.83,.83,'m4-side-gill');
    }
    box(1.22,.032,.11,carbon,0,.96,rear+.16,'m4-carbon-trunk-lip');
  }else if(vehicle==='bmwX3'){
    signatures.push('tall-suv-cabin','g45-kidney-grille','roof-rails','twin-l-shaped-tail-lights','quad-outboard-exhausts');
    for(const side of [-1,1]){
      panel([[side*.025,.68,front+.02],[side*.43,.71,front+.022],[side*.39,.99,front+.016],[side*.06,1.015,front+.019]],black,'x3-wide-kidney');
      for(let i=0;i<6;i++)box(.027,.23,.014,carbon,side*(.10+i*.052),.845,front+.035,'x3-kidney-vertical-bar');
      line([[side*.49,1.01,front-.01],[side*.66,1.045,front-.10],[side*.81,1.005,front-.21]],.019,frontLight,'x3-upper-led');
      for(const x of [.56,.73])line([[side*(x-.05),1.015,front-.03],[side*x,.96,front-.03],[side*(x+.045),.98,front-.045]],.015,frontLight,'x3-double-led');
      line([[side*.28,1.04,rear+.040],[side*.62,1.05,rear+.040],[side*.84,1.15,rear+.18]],.041,black,'x3-dark-tail-light-socket');
      line([[side*.28,1.065,rear-.01],[side*.61,1.07,rear-.015],[side*.84,1.18,rear+.12]],.021,rearLight,'x3-upper-rear-led');
      line([[side*.29,1.00,rear-.015],[side*.63,1.015,rear-.015],[side*.83,1.115,rear+.10]],.019,rearLight,'x3-lower-rear-led');
      for(const x of [.55,.69])exhaust(side*x,.50,rear-.026,.048);
      line([[side*.60,1.64,-1.77],[side*.64,1.69,-.68],[side*.66,1.70,.16],[side*.63,1.64,.66]],.018,carbon,'x3-roof-rail');
      const frontDoor=-.17,rearDoor=-1.17;
      line([[side*.91,1.11,frontDoor],[side*.92,.65,frontDoor]],.005,carbon,'x3-front-door-seam');
      line([[side*.93,1.13,rearDoor],[side*.92,.68,rearDoor]],.005,carbon,'x3-rear-door-seam');
      for(const z of [.34,-.72])box(.018,.025,.13,carbon,side*.925,1.12,z,'x3-door-handle');
      line([[side*.68,1.18,-.53],[side*.49,1.50,-.53],[side*.12,1.66,-.53]],.029,carbon,'x3-b-pillar');
    }
    box(1.31,.038,.22,carbon,0,1.635,rear+.47,'x3-roof-spoiler');
    line([[-.35,1.295,rear+.19],[.09,1.305,rear+.19]],.010,black,'rear-window-wiper');
    panel([[-.77,.45,rear-.020],[.77,.45,rear-.020],[.75,.64,rear-.024],[.51,.68,rear-.029],[-.51,.68,rear-.029],[-.75,.64,rear-.024]],carbon,'x3-lower-bumper-insert');
    box(.49,.14,.020,black,0,.79,rear-.038,'rear-number-plate-recess');
    box(.43,.095,.012,polished,0,.795,rear-.055,'rear-number-plate');
  }else if(vehicle==='amgGT63'){
    signatures.push('panamericana-vertical-grille','long-hood-fastback','twin-dot-rear-lights','quad-square-exhausts');
    panel([[-.66,.32,front+.019],[.66,.32,front+.019],[.57,.62,front+.020],[-.57,.62,front+.020]],black,'amg-panamericana-mouth');
    for(let i=-8;i<=8;i++)box(.012,.23,.018,alloy,i*.066,.46,front+.038,'panamericana-vane');
    const emblem=mesh(new THREE.TorusGeometry(.064,.008,5,28),alloy);emblem.position.set(0,.49-baseY,front+.045);
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;line([[0,.49,front+.048],[Math.sin(a)*.060,.49+Math.cos(a)*.060,front+.048]],.007,alloy,'amg-star-spoke');}
    for(const side of [-1,1]){
      ellipsoid(side*.67,.78,front-.22,.151,.058,.12,black,'amg-headlight-socket');
      line([[side*.54,.82,front-.13],[side*.68,.85,front-.25],[side*.79,.81,front-.35]],.016,frontLight,'amg-top-led');
      line([[side*.57,.75,front-.14],[side*.74,.74,front-.24]],.011,frontLight,'amg-bottom-led');
      line([[side*.42,.84,rear-.025],[side*.72,.85,rear+.018],[side*.84,.78,rear+.12]],.015,rearLight,'amg-rear-led');
      for(const x of [.54,.67]){
        const z=rear-.034;line([[side*(x-.042),.32,z],[side*(x+.042),.32,z],[side*(x+.042),.395,z],[side*(x-.042),.395,z],[side*(x-.042),.32,z]],.012,alloy,'amg-square-exhaust');
        box(.065,.06,.013,black,side*x,.36,z-.004,'square-exhaust-dark-center');
      }
      for(let i=0;i<4;i++)box(.015,.10,.034,carbon,side*.92,.82,.91+i*.04,'amg-side-gill');
      const vent=box(.15,.008,.43,carbon,side*.34,.86,1.01,'amg-hood-vent');vent.rotation.x=-.065;
    }
    box(1.35,.035,.20,carbon,0,.98,rear+.23,'amg-active-rear-spoiler');
  }else if(vehicle==='mustangDarkHorse'){
    signatures.push('triple-vertical-tail-lights','three-module-headlamps','dark-hood-vent','muscle-coupe-shoulders');
    panel([[-.67,.44,front+.027],[.67,.44,front+.027],[.61,.70,front+.022],[-.61,.70,front+.022]],black,'dark-horse-grille');
    for(const side of [-1,1]){
      box(.46,.13,.033,black,side*.64,.76,front-.001,'mustang-lamp-socket');
      for(let i=0;i<3;i++)box(.063,.047,.018,frontLight,side*(.49+i*.135),.77,front+.025,'three-module-front-led');
      for(let i=0;i<3;i++){
        const x=side*(.43+i*.17),tail=box(.046,.20,.031,rearLight,x,.84,rear-.029,'mustang-triple-tail-led');tail.rotation.z=-side*.17;
      }
      for(const x of [.53,.68])exhaust(side*x,.36,rear-.045,.049);
      box(.34,.012,.53,carbon,side*.23,.92,1.19,'mustang-hood-vent');
      for(let i=0;i<5;i++)box(.30,.016,.025,black,side*.23,.94,1.02+i*.078,'hood-vent-louvre');
      box(.043,.18,.10,carbon,side*.56,1.02,rear+.30,'rear-wing-upright');
    }
    box(1.54,.041,.32,carbon,0,1.11,rear+.27,'dark-horse-rear-wing');
    box(.29,.015,.13,carbon,0,.74,front+.025,'dark-grille-center');
  }else if(vehicle==='lotusEmira'){
    signatures.push('vertical-led-headlamps','round-rear-lights','sculpted-side-intake','short-mid-engine-cabin');
    for(const side of [-1,1]){
      const optic=ellipsoid(side*.66,.83,front-.28,.115,.063,.20,black,'emira-vertical-optic');optic.rotation.x=-.23;
      line([[side*.58,.82,front-.10],[side*.59,.87,front-.32],[side*.70,.91,front-.51]],.014,frontLight,'emira-upper-led');
      line([[side*.64,.79,front-.10],[side*.69,.83,front-.30],[side*.73,.90,front-.49]],.012,frontLight,'emira-lower-led');
      panel([[side*.82,.41,-.15],[side*.93,.77,-.57],[side*.82,.86,-1.00],[side*.76,.46,-.94]],black,'emira-sculpted-scoop');
      line([[side*.79,.42,-.12],[side*.91,.79,-.61],[side*.82,.89,-1.03]],.027,paint,'emira-intake-edge');
      const circle=mesh(new THREE.TorusGeometry(.082,.015,6,32),rearLight);circle.position.set(side*.60,.73-baseY,rear-.022);circle.rotation.y=Math.PI;
      exhaust(side*.48,.38,rear-.025,.055);
    }
    panel([[-.33,.84,-.69],[.33,.84,-.69],[.34,.87,-1.30],[-.34,.87,-1.30]],glass,'emira-engine-window');
    box(1.17,.034,.14,paint,0,.87,rear+.15,'emira-integrated-ducktail');
  }else if(vehicle==='ferrari12cilindri'){
    signatures.push('front-black-daytona-band','long-v12-hood','separate-rear-aero-flaps','slim-horizontal-tail-lights');
    box(1.57,.105,.029,black,0,.675,front+.015,'12cilindri-daytona-front-band');
    for(const side of [-1,1]){
      line([[side*.49,.685,front+.036],[side*.68,.688,front+.018],[side*.85,.704,front-.085]],.010,frontLight,'12cilindri-slim-led');
      box(.21,.01,.36,black,side*.40,.84,1.15,'12cilindri-hood-air-exit');
      for(let i=0;i<5;i++)box(.18,.010,.026,carbon,side*.40,.849,1.03+i*.060,'12cilindri-hood-vane');
      line([[side*.35,.77,rear-.03],[side*.65,.79,rear+.01],[side*.80,.80,rear+.08]],.013,rearLight,'12cilindri-rear-light-blade');
      const flap=box(.41,.038,.33,carbon,side*.69,1.00,rear+.39,'independent-active-rear-flap');flap.rotation.z=side*.10;
      for(const x of [.51,.64])exhaust(side*x,.40,rear-.03,.047);
    }
    panel([[-.47,.91,-.71],[.47,.91,-.71],[.38,.92,-1.46],[-.38,.92,-1.46]],black,'12cilindri-black-rear-deck');
    box(1.35,.12,.025,black,0,.49,front+.015,'12cilindri-front-cooling');
  }else if(vehicle==='lamborghiniTemerario'){
    signatures.push('hexagonal-daytime-lights','slender-front-lamps','hexagonal-high-exhaust','hexagonal-rear-light-signature');
    for(const side of [-1,1]){
      line([[side*.45,.65,front-.18],[side*.64,.70,front-.36],[side*.82,.75,front-.54]],.013,frontLight,'temerario-thin-headlight');
      const hex=[];
      for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;hex.push([side*.61+Math.cos(a)*.12,.405+Math.sin(a)*.069,front+.037]);}
      line(hex,.014,frontLight,'hexagonal-drl');
      const rearHex=[];
      for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;rearHex.push([side*.59+Math.cos(a)*.14,.77+Math.sin(a)*.055,rear-.028]);}
      line(rearHex,.013,rearLight,'hexagonal-rear-led');
      panel([[side*.87,.34,-.15],[side*.96,.75,-.55],[side*.85,.86,-1.16],[side*.84,.34,-1.15]],black,'temerario-wide-side-inlet');
      line([[side*.85,.34,-.12],[side*.95,.78,-.54],[side*.86,.88,-1.22]],.031,carbon,'temerario-intake-edge');
      box(.10,.03,.46,carbon,side*.48,.89,-1.08,'temerario-engine-cover-fin');
    }
    exhaust(0,.74,rear-.05,.104,true);
    panel([[-.42,.83,-.65],[.42,.83,-.65],[.35,.92,-1.44],[-.35,.92,-1.44]],black,'temerario-engine-exposure');
    box(1.40,.030,.25,carbon,0,.99,rear+.30,'temerario-rear-spoiler');
  }else if(vehicle==='porsche911turboS'){
    signatures.push('round-matrix-headlamps','turbo-side-inlets','active-rear-wing','992-light-bar');
    for(const side of [-1,1]){
      const optic=ellipsoid(side*.66,.87,front-.29,.17,.20,.065,black,'turbo-s-round-optic');optic.rotation.x=-.30;
      const lamp=ellipsoid(side*.66,.875,front-.242,.140,.172,.023,frontLight,'turbo-s-round-lens');lamp.rotation.x=-.30;
      for(const x of [-.058,.058])for(const y of [-.065,.065])ellipsoid(side*.66+x,.875+y,front-.211,.025,.025,.013,frontLight,'four-point-porsche-optic');
      panel([[side*.91,.52,-.38],[side*.96,.80,-.73],[side*.88,.87,-1.15],[side*.80,.59,-1.07]],black,'turbo-s-side-air-inlet');
      line([[side*.92,.53,-.36],[side*.97,.80,-.71],[side*.89,.89,-1.16]],.019,paint,'turbo-s-intake-rim');
      box(.43,.14,.03,black,side*.53,.41,front+.023,'turbo-s-front-air-inlet');
      for(const x of [.45,.58])exhaust(side*x,.37,rear-.03,.048);
      box(.037,.15,.12,black,side*.48,.93,rear+.32,'active-wing-support');
    }
    box(1.50,.035,.30,paint,0,1.025,rear+.30,'turbo-s-active-wing');
    line([[-.81,.74,rear+.075],[-.49,.76,rear-.02],[0,.765,rear-.035],[.49,.76,rear-.02],[.81,.74,rear+.075]],.014,rearLight,'992-turbo-s-rear-light-bar');
    for(let i=-7;i<=7;i++)box(.022,.015,.23,black,i*.071,.90,-1.47,'911-rear-engine-louvre');
  }else if(vehicle==='amgSL63'){
    signatures.push('open-four-seat-roadster','panamericana-grille','triangular-front-led','quad-square-exhausts');
    panel([[-.61,.33,front+.028],[.61,.33,front+.028],[.50,.63,front+.025],[-.50,.63,front+.025]],black,'sl-panamericana-grille');
    for(let i=-8;i<=8;i++)box(.013,.24,.019,alloy,i*.060,.475,front+.046,'sl-vertical-grille-vane');
    for(const side of [-1,1]){
      line([[side*.49,.72,front-.12],[side*.69,.84,front-.32],[side*.79,.78,front-.42],[side*.75,.69,front-.28]],.014,frontLight,'sl-triangular-optic');
      line([[side*.44,.84,rear-.028],[side*.70,.87,rear+.012],[side*.82,.79,rear+.105],[side*.64,.77,rear-.010]],.015,rearLight,'sl-triangular-tail-led');
      for(const x of [.51,.65]){
        const z=rear-.03;line([[side*(x-.04),.33,z],[side*(x+.04),.33,z],[side*(x+.04),.40,z],[side*(x-.04),.40,z],[side*(x-.04),.33,z]],.012,alloy,'sl-square-exhaust');
        box(.06,.047,.02,black,side*x,.365,z-.01,'sl-exhaust-interior');
      }
      for(let i=0;i<4;i++)box(.018,.09,.028,carbon,side*.91,.80,.94+i*.04,'sl-side-gill');
    }
    const badge=mesh(new THREE.TorusGeometry(.064,.008,5,24),alloy);badge.position.set(0,.48-baseY,front+.057);
    box(1.23,.03,.13,paint,0,.97,rear+.17,'sl-trunk-lip');
  }else if(vehicle==='hondaPrelude'){
    signatures.push('slender-connected-front-led','long-hatchback-glass','full-width-rear-led','two-tone-roof');
    line([[-.83,.65,front-.16],[-.52,.65,front+.01],[0,.63,front+.025],[.52,.65,front+.01],[.83,.65,front-.16]],.010,frontLight,'prelude-front-light-line');
    for(const side of [-1,1]){
      box(.20,.045,.018,frontLight,side*.67,.60,front-.015,'prelude-lower-projector');
      panel([[side*.25,.31,front+.018],[side*.73,.32,front-.08],[side*.65,.45,front-.03],[side*.24,.45,front+.022]],black,'prelude-front-aero-intake');
      line([[side*.38,.85,rear-.032],[side*.72,.85,rear+.01],[side*.83,.82,rear+.10]],.016,rearLight,'prelude-rear-corner-lamp');
      exhaust(side*.47,.32,rear-.015,.042);
    }
    box(1.11,.018,.026,rearLight,0,.85,rear-.035,'prelude-rear-connecting-led');
    box(.34,.13,.020,black,0,.61,rear-.032,'prelude-number-plate');
    box(1.21,.027,.15,carbon,0,.925,rear+.14,'prelude-hatch-lip');
  }else if(vehicle==='toyotaGR86'){
    signatures.push('gr86-c-shaped-headlamps','fender-air-outlets','duckbill-rear-spoiler','bracket-rear-leds');
    panel([[-.58,.28,front+.029],[.58,.28,front+.029],[.50,.46,front+.024],[-.50,.46,front+.024]],black,'gr86-front-mouth');
    for(const side of [-1,1]){
      line([[side*.47,.70,front-.07],[side*.62,.78,front-.26],[side*.77,.80,front-.43],[side*.78,.71,front-.33]],.015,frontLight,'gr86-front-led-bracket');
      box(.029,.16,.30,black,side*.88,.72,.64,'gr86-front-fender-outlet');
      line([[side*.29,.76,rear-.025],[side*.61,.78,rear-.012],[side*.77,.73,rear+.10],[side*.63,.67,rear-.018]],.016,rearLight,'gr86-tail-light-bracket');
      exhaust(side*.53,.34,rear-.028,.053);
    }
    box(1.09,.04,.19,paint,0,.96,rear+.17,'gr86-duckbill');
    box(1.01,.013,.017,black,0,.78,rear-.04,'gr86-dark-lamp-bridge');
  }else if(vehicle==='mazdaMX5'){
    signatures.push('open-two-seat-roadster','small-almond-headlamps','round-tail-lights','short-kodo-hood');
    panel([[-.47,.27,front+.018],[.47,.27,front+.018],[.54,.45,front+.020],[0,.51,front+.022],[-.54,.45,front+.020]],black,'mx5-front-smile-grille');
    for(const side of [-1,1]){
      ellipsoid(side*.58,.72,front-.23,.128,.044,.11,black,'mx5-almond-headlamp');
      line([[side*.48,.73,front-.12],[side*.59,.77,front-.23],[side*.71,.77,front-.38]],.009,frontLight,'mx5-narrow-led');
      ellipsoid(side*.57,.73,front-.18,.035,.032,.018,frontLight,'mx5-projector');
      const ring=mesh(new THREE.TorusGeometry(.061,.014,6,28),rearLight);ring.position.set(side*.56,.74-baseY,rear-.024);ring.rotation.y=Math.PI;
      line([[side*.59,.75,rear-.027],[side*.73,.75,rear+.053]],.014,rearLight,'mx5-tail-light-outboard-blade');
      if(side>0)for(const x of [.46,.56])exhaust(x,.30,rear-.028,.037);
    }
    box(.33,.11,.019,black,0,.54,rear-.027,'mx5-rear-number-plate');
  }else if(vehicle==='bmwM2'){
    signatures.push('horizontal-double-kidney','square-outboard-intakes','box-flared-wheel-arches','quad-rear-exhausts');
    for(const side of [-1,1]){
      box(.36,.145,.040,black,side*.21,.61,front+.015,'m2-horizontal-kidney');
      for(let i=0;i<3;i++)box(.30,.013,.015,carbon,side*.21,.57+i*.040,front+.041,'m2-kidney-vane');
      box(.27,.22,.029,black,side*.64,.43,front+.019,'m2-square-bumper-intake');
      line([[side*.49,.77,front-.025],[side*.65,.80,front-.12],[side*.81,.77,front-.24]],.016,frontLight,'m2-optic-upper');
      line([[side*.52,.745,front-.018],[side*.64,.71,front-.04],[side*.73,.75,front-.09]],.014,frontLight,'m2-led-bottom');
      line([[side*.34,.87,rear-.023],[side*.66,.89,rear+.008],[side*.82,.81,rear+.10],[side*.70,.75,rear+.015]],.019,rearLight,'m2-bold-tail-light');
      for(const x of [.54,.68])exhaust(side*x,.36,rear-.03,.048);
      for(const z of [frontZ,rearZ]){
        const fender=box(.08,.045,.52,paint,side*.935,.94,z,'m2-square-fender-shoulder');fender.rotation.y=side*.04;
      }
    }
    box(1.20,.034,.12,carbon,0,.97,rear+.17,'m2-trunk-spoiler');
  }else if(vehicle==='nissanZ'){
    signatures.push('240z-half-moon-headlamps','300zx-horizontal-tail-lights','rectangular-front-grille','contrasting-fastback-roof');
    box(1.17,.245,.037,black,0,.44,front+.02,'z-rectangular-grille');
    for(let i=0;i<6;i++)box(1.08,.009,.012,carbon,0,.335+i*.04,front+.048,'z-grille-horizontal');
    for(const side of [-1,1]){
      ellipsoid(side*.65,.77,front-.18,.14,.096,.076,black,'z-headlamp-housing');
      line([[side*.53,.77,front-.14],[side*.55,.82,front-.22],[side*.67,.85,front-.26],[side*.77,.81,front-.22]],.013,frontLight,'240z-led-semicircle-upper');
      line([[side*.55,.73,front-.13],[side*.65,.70,front-.11],[side*.75,.74,front-.14]],.012,frontLight,'240z-led-semicircle-lower');
      box(.56,.148,.025,black,side*.43,.78,rear-.017,'z32-tail-panel');
      for(let i=0;i<4;i++)box(.097,.030,.014,rearLight,side*(.225+i*.135),.81,rear-.035,'z32-horizontal-upper-led');
      for(let i=0;i<4;i++)box(.097,.026,.014,rearLight,side*(.225+i*.135),.75,rear-.035,'z32-horizontal-lower-led');
      exhaust(side*.55,.34,rear-.035,.053);
    }
    box(1.14,.030,.12,paint,0,.925,rear+.17,'z-ducktail');
  }
  // Grille depth, perforation and diffuser channels read at the driving camera.
  for(const direction of [-1,1]){
    const z=direction*halfLength+direction*.009;
    for(let row=0;row<3;row++)for(let column=0;column<17;column++){
      const x=(column-8)*.063;
      if(direction>0 && (vehicle==='nissanZ'||vehicle==='bmwM4'||vehicle==='astonVantage'))continue;
      box(.027,.016,.008,brake,x,.38+row*.025+(shape.floor||.23)-.23,z,'grille-perforation');
    }
  }
  for(let i=-3;i<=3;i++){
    const fin=box(.018,.085,.30,carbon,i*.20,floor+.035,rear+.18,'rear-diffuser-fin');fin.rotation.x=-.08;
  }
  // Four independently steered/spinning wheel assemblies. Disc and caliper stay
  // attached to the upright while the tyre, spokes and rim rotate around x.
  const wheels=[];
  for(const [z,frontAxle] of [[frontZ,true],[rearZ,false]])for(const side of [-1,1]){
    const tyreWidth=shape.wheelWidth[frontAxle?0:1],radius=shape.radius,rimRadius=radius-.083;
    const wheelX=side*(halfWidth-tyreWidth*.5+.006),pivot=new THREE.Group(),spin=new THREE.Group();
    pivot.name=`${frontAxle?'front':'rear'}-${side<0?'left':'right'}-steer`;pivot.position.set(wheelX,radius,z);group.add(pivot);
    spin.name='wheel-spin';pivot.add(spin);
    const cross=[new THREE.Vector2(rimRadius-.012,-tyreWidth*.50),new THREE.Vector2(radius-.038,-tyreWidth*.51),new THREE.Vector2(radius-.008,-tyreWidth*.39),new THREE.Vector2(radius,-tyreWidth*.25),new THREE.Vector2(radius,tyreWidth*.25),new THREE.Vector2(radius-.008,tyreWidth*.39),new THREE.Vector2(radius-.038,tyreWidth*.51),new THREE.Vector2(rimRadius-.012,tyreWidth*.50)];
    const tyre=mesh(new THREE.LatheGeometry(cross,mobile?36:52),rubber,spin,'tyre');tyre.rotation.z=Math.PI/2;
    const rimCross=[new THREE.Vector2(rimRadius-.023,-tyreWidth*.43),new THREE.Vector2(rimRadius-.006,-tyreWidth*.44),new THREE.Vector2(rimRadius,-tyreWidth*.40),new THREE.Vector2(rimRadius,tyreWidth*.40),new THREE.Vector2(rimRadius-.006,tyreWidth*.44),new THREE.Vector2(rimRadius-.023,tyreWidth*.43)];
    const rim=mesh(new THREE.LatheGeometry(rimCross,mobile?24:40),alloy,spin,'bevelled-rim-barrel');rim.rotation.z=Math.PI/2;
    for(const ringX of [-tyreWidth*.42,tyreWidth*.42]){
      const ring=mesh(new THREE.TorusGeometry(rimRadius-.007,.0055,5,mobile?28:40),polished,spin,'machined-rim-lip');ring.rotation.y=Math.PI/2;ring.position.x=ringX;
    }
    for(let i=0;i<shape.spokes;i++){
      const angle=i/shape.spokes*Math.PI*2,split=shape.spokes===5;
      for(const offset of split?[-.065,.065]:[0]){
        const a=angle+offset,spokeVerts=[],spokeFaces=[];
        const sections=[[.045,.035,.30],[.10,.027,.31],[rimRadius*.72,.021,.37],[rimRadius-.012,.027,.43]];
        for(const [r,w,depth] of sections){
          // Chamfered octagonal cross-sections catch a narrow highlight, while
          // the centre sits behind the outer lip like a real dished forging.
          const cross=[[-.010,-w*.32],[-.006,-w*.50],[.006,-w*.50],[.010,-w*.32],[.010,w*.32],[.006,w*.50],[-.006,w*.50],[-.010,w*.32]];
          for(const [x,y] of cross)spokeVerts.push(side*(tyreWidth*depth+x),y*Math.cos(a)+r*Math.sin(a),r*Math.cos(a)-y*Math.sin(a));
        }
        for(let k=1;k<sections.length;k++)for(let j=0;j<8;j++){const b=k*8+j,c=k*8+(j+1)%8,d=b-8,e=c-8;spokeFaces.push(b,d,c,c,d,e);}
        for(let j=1;j<7;j++)spokeFaces.push(0,j+1,j,24,24+j,24+j+1);
        const winding=side>0?spokeFaces:spokeFaces.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]);
        mesh(geometryFrom(spokeVerts,winding),alloy,spin,'dished-chamfered-forged-spoke');
      }
    }
    const disc=mesh(new THREE.CylinderGeometry(rimRadius*.81,rimRadius*.81,.014,36),brake,pivot,'brake-rotor');disc.rotation.z=Math.PI/2;disc.position.x=side*tyreWidth*.31;
    const pad=mesh(new THREE.BoxGeometry(.075,.128,.07),caliper,pivot,'fixed-brake-caliper');pad.position.set(side*tyreWidth*.33,.075,-rimRadius*.70);
    const hubX=side*tyreWidth*.31;
    const hub=mesh(new THREE.CylinderGeometry(.047,.052,.027,20),carbon,spin,'recessed-wheel-hub');hub.rotation.z=Math.PI/2;hub.position.x=hubX;
    const hubRing=mesh(new THREE.TorusGeometry(.047,.004,5,24),polished,spin,'wheel-hub-machining');hubRing.rotation.y=Math.PI/2;hubRing.position.x=hubX+side*.015;
    if(vehicle!=='porsche911gt3rs')for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2,bolt=mesh(new THREE.CylinderGeometry(.007,.007,.012,6),polished,spin,'wheel-lug');bolt.rotation.z=Math.PI/2;bolt.position.set(hubX+side*.015,Math.sin(a)*.029,Math.cos(a)*.029);
    }
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2,hole=mesh(new THREE.CircleGeometry(.006,5),black,pivot,'drilled-disc');hole.rotation.y=side*Math.PI/2;hole.position.set(side*tyreWidth*.319,Math.sin(a)*rimRadius*.68,Math.cos(a)*rimRadius*.68);
    }
    for(let i=0;i<(mobile?20:32);i++){
      const a=i/(mobile?20:32)*Math.PI*2;
      for(const x of [-tyreWidth*.24,tyreWidth*.24]){
        const groove=mesh(new THREE.BoxGeometry(.004,.0015,.042),black,spin,'tread-groove');groove.position.set(x,Math.sin(a)*(radius+.0005),Math.cos(a)*(radius+.0005));groove.rotation.x=-a-Math.PI/2;
      }
    }
    batchStatic(spin);batchStatic(pivot);
    wheels.push({pivot,spin,front:frontAxle});
  }
  // A generated soft shadow needs no image download, so every car works offline.
  const data=new Uint8Array(64*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<64;x++){
    const r=Math.hypot((x-31.5)/31.5,(y-63.5)/63.5),index=(y*64+x)*4;
    data[index+3]=Math.round(clamp(1-r,0,1)**.8*165);
  }
  const shadowTexture=new THREE.DataTexture(data,64,128);shadowTexture.needsUpdate=true;shadowTexture.magFilter=THREE.LinearFilter;textures.add(shadowTexture);
  const shadowMat=material('contact-shadow',THREE.MeshBasicMaterial,{map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const shadow=mesh(new THREE.PlaneGeometry(width*1.28,length*1.13),shadowMat,group,'contact-shadow');shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;shadow.castShadow=shadow.receiveShadow=false;
  batchStatic(chassis);
  let triangles=0;group.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});
  group.userData.model={name:preset.name,author:'APEX project',license:'Original procedural game artwork',source:preset.source,...spec,openTop:!!shape.open,wheelRadius:shape.radius,triangles:Math.round(triangles),signatures};
  let steer=0,spinAngle=0,pitch=0,roll=0,disposed=false;
  return{
    group,dimensions:spec,
    setPaint(color){paint.color.set(color);paint.clearcoat=1;paint.clearcoatRoughness=.085;},
    update(state={},dt=1/60){
      const step=clamp(Number.isFinite(dt)?dt:0,0,.1),speed=Number.isFinite(state.speed)?state.speed:0;
      const actual=Number.isFinite(state.steeringAngle)?state.steeringAngle:state.steerAngle;
      const target=Number.isFinite(actual)?clamp(actual,-.55,.55):clamp(state.steering||0,-1,1)*.42;
      steer=THREE.MathUtils.damp(steer,target,13,step);spinAngle=(spinAngle-speed*step/shape.radius)%(Math.PI*2);
      for(const wheel of wheels){wheel.pivot.rotation.y=wheel.front?steer:0;wheel.spin.rotation.x=spinAngle;}
      pitch=THREE.MathUtils.damp(pitch,clamp(-(Number.isFinite(state.longitudinalAccel)?state.longitudinalAccel:0)*.0035,-.045,.045),7,step);
      roll=THREE.MathUtils.damp(roll,clamp((Number.isFinite(state.lateralAccel)?state.lateralAccel:0)*.0045,-.052,.052),7,step);
      chassis.rotation.x=pitch;chassis.rotation.z=roll;rearLight.emissiveIntensity=.35+clamp(state.brake||0,0,1)*2.4;
    },
    dispose(){
      if(disposed)return;disposed=true;const geometries=new Set();
      group.traverse(node=>{if(node.geometry)geometries.add(node.geometry);});
      geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());
    },
  };
}
