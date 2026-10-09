import * as THREE from './vendor/three.module.js';
import { mergeGeometries, mergeVertices } from './vendor/addons/utils/BufferGeometryUtils.js';
import { VEHICLES, PRODUCTION_CAR_DIMENSIONS } from './vehicles.mjs?v=city-drive-13';
import { addVehicleTailLights } from './vehicle-taillights.js?v=city-drive-13';
import { addVehicleRearDetails, REAR_DETAIL_PROFILES } from './vehicle-rear-details.js?v=city-drive-13';
import { createBMWX3 } from './cars-bmw-x3.js?v=city-drive-13';

const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
// Each model has its own longitudinal body sections, cabin placement and aero details.
// Sections are [fraction of half-length, fraction of half-width, shoulder height, hood height].
const profiles = {
  porsche911gt3rs: {
    body: [[-1,.86,.76,.80],[-.86,.96,.85,.90],[-.55,1,.91,.94],[-.30,.92,.89,.87],[0,.86,.85,.81],[.32,.94,.88,.78],[.55,1,.96,.73],[.81,.96,.90,.66],[1,.84,.67,.61]],
    cabin: [[-.69,.44,.92],[-.50,.57,1.10],[-.29,.66,1.28],[-.07,.67,1.322],[.18,.65,1.30],[.34,.62,1.16],[.51,.60,.91]],
    roof: [-.32,.24], frontOverhang: 1.03, radius: .35025, radii: [.35025,.3672], rimRadii: [.254,.2667], track: [1.630,1.582], wheelWidth: [.275,.335], spokes: 10, rounded: true, doorSculpt: .072, rearPillar: .50, color: '#d9dadd',
  },
  lamborghiniRevuelto: {
    body: [[-1,.82,.84,.85],[-.82,.98,.85,.86],[-.59,1,.91,.88],[-.30,.88,.79,.78],[0,.83,.73,.74],[.32,.95,.83,.68],[.59,.99,.87,.57],[.84,.95,.66,.52],[1,.85,.51,.45]],
    cabin: [[-.51,.43,.875],[-.38,.53,1.01],[-.22,.59,1.135],[-.05,.625,1.158],[.14,.635,1.16],[.32,.615,1.085],[.57,.60,.72]],
    roof: [-.22,.23], frontOverhang: 1.105, radius: .34675, radii: [.34675,.3702], rimRadii: [.254,.2667], wheelWidth: [.265,.345], spokes: 5, splitAngle: .23, wheelColor: '#293239', angular: true, doorSculpt: .13, rearPillar: .68, color: '#e87722',
  },
  ferrari296Speciale: {
    body: [[-1,.78,.81,.84],[-.83,.96,.91,.95],[-.58,1,.90,.92],[-.32,.91,.80,.81],[0,.89,.78,.74],[.31,.94,.84,.65],[.59,.98,.86,.58],[.84,.95,.70,.54],[1,.83,.54,.46]],
    cabin: [[-.43,.38,.89],[-.28,.57,1.09],[-.13,.63,1.17],[.09,.64,1.181],[.26,.62,1.13],[.43,.60,.95],[.55,.60,.81]],
    roof: [-.21,.24], frontOverhang: 1.01, radius: .33975, radii: [.33975,.36075], rimRadii: [.254,.254], track: [1.665,1.632], wheelWidth: [.245,.305], spokes: 5, splitAngle: .16, rounded: true, doorSculpt: .125, rearPillar: .56, color: '#c72d26',
  },
  mclaren750s: {
    body: [[-1,.73,.85,.86],[-.82,.94,.88,.88],[-.60,1,.87,.86],[-.32,.90,.77,.78],[0,.83,.75,.72],[.31,.94,.82,.66],[.59,.98,.89,.55],[.83,.95,.74,.51],[1,.81,.56,.46]],
    cabin: [[-.48,.35,.86],[-.30,.51,1.04],[-.14,.61,1.18],[.07,.63,1.196],[.25,.61,1.12],[.41,.59,.94],[.56,.59,.78]],
    roof: [-.18,.22], frontOverhang: .99, radius: .32705, radii: [.32705,.3455], rimRadii: [.2413,.254], wheelWidth: [.245,.305], spokes: 10, wheelColor: '#46515a', rounded: true, doorSculpt: .12, rearPillar: .59, color: '#ed8b28',
  },
  astonVantage: {
    body: [[-1,.87,.80,.82],[-.80,.98,.87,.90],[-.59,1,.93,.91],[-.32,.91,.85,.84],[0,.87,.84,.83],[.32,.95,.88,.77],[.58,1,.91,.72],[.84,.97,.76,.66],[1,.88,.66,.59]],
    cabin: [[-.59,.41,.91],[-.39,.57,1.20],[-.12,.63,1.275],[.06,.62,1.23],[.35,.65,.90]],
    roof: [-.31,.03], frontOverhang: .925, radius: .36295, radii: [.36295,.3642], rimRadii: [.2667,.2667], wheelWidth: [.275,.325], spokes: 5, splitAngle: .12, rounded: true, doorSculpt: .085, rearPillar: .51, color: '#285944',
  },
  corvetteZ06: {
    body: [[-1,.89,.80,.83],[-.82,.99,.88,.91],[-.60,1,.94,.93],[-.31,.93,.80,.84],[0,.91,.78,.77],[.31,.97,.85,.67],[.58,1,.92,.59],[.84,.97,.73,.61],[1,.87,.56,.50]],
    cabin: [[-.41,.43,.91],[-.29,.54,1.10],[-.14,.62,1.225],[.08,.64,1.235],[.22,.63,1.19],[.49,.61,.78]],
    roof: [-.19,.21], frontOverhang: 1.01, radius: .3365, radii: [.3365,.35295], rimRadii: [.254,.2667], wheelWidth: [.275,.345], spokes: 5, singleSpokes: true, wheelColor: '#3b444d', angular: true, doorSculpt: .13, rearPillar: .66, color: '#c1c3ca',
  },
  bmwM4: {
    body: [[-1,.89,.87,.92],[-.81,.97,.94,.99],[-.61,1,.99,1.00],[-.30,.96,.94,.94],[0,.94,.94,.91],[.31,.97,.96,.88],[.59,1,.97,.83],[.84,.98,.87,.78],[1,.89,.76,.71]],
    cabin: [[-.59,.51,.985],[-.42,.64,1.30],[-.14,.69,1.397],[.19,.69,1.38],[.45,.67,1.02]],
    roof: [-.33,.20], frontOverhang: .867, radius: .33755, radii: [.33755,.3395], rimRadii: [.2413,.254], wheelWidth: [.275,.285], spokes: 10, wheelColor: '#293239', doorSculpt: .058, rearPillar: .57, color: '#879785',
  },
  nissanZ: {
    body: [[-1,.88,.81,.85],[-.81,.98,.88,.92],[-.59,1,.93,.92],[-.31,.93,.86,.85],[0,.92,.84,.82],[.32,.98,.88,.83],[.60,1,.91,.81],[.84,.96,.79,.76],[1,.86,.70,.67]],
    cabin: [[-.74,.34,.93],[-.51,.53,1.21],[-.21,.61,1.316],[.01,.62,1.27],[.29,.61,.97]],
    roof: [-.40,0], frontOverhang: .945, radius: .3433, radii: [.3433,.33755], rimRadii: [.2413,.2413], track: [1.55448,1.56464], wheelWidth: [.255,.275], spokes: 5, splitAngle: .14, rounded: true, doorSculpt: .06, rearPillar: .54, color: '#d9b83c',
  },
  bmwX3: {
    body: [[-1,.93,1.13,1.19],[-.86,.98,1.19,1.23],[-.60,1,1.20,1.22],[-.30,.945,1.17,1.19],[0,.955,1.16,1.17],[.31,.97,1.18,1.17],[.61,1,1.19,1.155],[.84,.975,1.18,1.145],[1,.94,1.13,1.12]],
    cabin: [[-.94,.75,1.23],[-.83,.71,1.55],[-.67,.735,1.625],[-.24,.745,1.66],[.16,.74,1.64],[.27,.71,1.53],[.42,.68,1.22]],
    roof: [-.79,.18], frontOverhang: .877, radius: .3687, radii: [.3687,.36645], rimRadius: .2667, track: [1.622,1.623], wheelWidth: [.255,.285], spokes: 5, floor: .27, mirrorHeight: 1.27, doorSculpt: .04, rearPillar: .91, color: '#606b75',
  },
  amgGT63: {
    body: [[-1,.87,.86,.90],[-.82,.98,.95,.96],[-.60,1,1.00,.96],[-.30,.93,.90,.89],[0,.91,.88,.89],[.31,.95,.93,.87],[.60,.99,.99,.81],[.84,.97,.85,.77],[1,.88,.68,.64]],
    cabin: [[-.63,.40,.97],[-.40,.57,1.26],[-.12,.65,1.354],[.13,.64,1.31],[.39,.66,.98]],
    roof: [-.31,.13], frontOverhang: .99, radius: .3425, radii: [.3425,.3455], rimRadii: [.254,.254], track: [1.68402,1.68656], wheelWidth: [.295,.305], spokes: 10, wheelColor: '#354049', rounded: true, doorSculpt: .075, rearPillar: .58, color: '#446354',
  },
  mustangDarkHorse: {
    body: [[-1,.92,.88,.93],[-.81,1,.96,1.00],[-.60,1,.99,1.03],[-.30,.95,.94,.95],[0,.92,.93,.92],[.32,.97,.96,.91],[.61,1,.97,.88],[.84,.99,.90,.86],[1,.93,.83,.82]],
    cabin: [[-.70,.47,.99],[-.44,.62,1.32],[-.12,.67,1.402],[.12,.66,1.35],[.38,.66,1.02]],
    roof: [-.39,.12], frontOverhang: 1.01, radius: .3328, radii: [.3328,.3358], rimRadii: [.2413,.2413], wheelWidth: [.305,.315], spokes: 10, splitSpokes: true, splitAngle: .16, wheelColor: '#20292e', caliperColor: '#232c31', doorSculpt: .045, rearPillar: .54, color: '#414f65',
  },
  lotusEmira: {
    body: [[-1,.85,.80,.84],[-.83,.98,.86,.87],[-.60,1,.89,.87],[-.32,.89,.78,.80],[0,.85,.75,.74],[.32,.94,.84,.69],[.60,1,.92,.63],[.84,.96,.78,.55],[1,.83,.58,.50]],
    cabin: [[-.43,.33,.83],[-.24,.54,1.16],[.03,.59,1.226],[.22,.58,1.16],[.49,.59,.79]],
    roof: [-.19,.20], frontOverhang: .97, radius: .33975, radii: [.33975,.3425], rimRadii: [.254,.254], track: [1.626,1.608], wheelWidth: [.245,.295], spokes: 10, rounded: true, doorSculpt: .11, rearPillar: .56, color: '#487264',
  },
  ferrari12cilindri: {
    body: [[-1,.89,.85,.89],[-.82,.98,.92,.97],[-.60,1,.95,.97],[-.31,.92,.87,.88],[0,.90,.86,.87],[.31,.96,.88,.87],[.61,1,.94,.85],[.84,.97,.83,.78],[1,.91,.72,.66]],
    cabin: [[-.71,.44,.89],[-.47,.60,1.22],[-.16,.65,1.292],[.06,.64,1.25],[.35,.66,.92]],
    roof: [-.40,.06], frontOverhang: 1.05, radius: .36295, radii: [.36295,.37695], rimRadii: [.2667,.2667], track: [1.686,1.645], wheelWidth: [.275,.315], spokes: 5, splitAngle: .15, bodyWidth: 1.980, rounded: true, doorSculpt: .065, rearPillar: .55, color: '#d4d6d6',
  },
  lamborghiniTemerario: {
    body: [[-1,.86,.80,.83],[-.82,.98,.87,.90],[-.60,1,.91,.90],[-.31,.91,.79,.81],[0,.89,.80,.78],[.32,.97,.86,.77],[.60,1,.90,.73],[.84,.98,.76,.67],[1,.91,.61,.58]],
    cabin: [[-.51,.43,.895],[-.39,.51,1.03],[-.24,.575,1.16],[-.08,.61,1.201],[.11,.625,1.201],[.28,.61,1.153],[.54,.61,.78]],
    roof: [-.23,.22], frontOverhang: 1.06, radius: .34325, radii: [.34325,.3642], rimRadii: [.254,.2667], track: [1.722,1.670], wheelWidth: [.255,.325], spokes: 5, splitAngle: .22, wheelColor: '#27313a', angular: true, doorSculpt: .095, rearPillar: .72, color: '#537ea4',
  },
  porsche911turboS: {
    body: [[-1,.84,.76,.80],[-.86,.96,.85,.90],[-.55,1,.93,.94],[-.34,.93,.90,.87],[0,.86,.85,.80],[.32,.94,.88,.77],[.56,1,.96,.72],[.83,.97,.90,.65],[1,.86,.68,.61]],
    cabin: [[-.70,.44,.92],[-.50,.57,1.09],[-.30,.65,1.25],[-.08,.67,1.305],[.20,.65,1.29],[.34,.62,1.14],[.50,.60,.91]],
    roof: [-.34,.23], frontOverhang: 1.016, radius: .34325, radii: [.34325,.3642], rimRadii: [.254,.2667], wheelWidth: [.255,.325], spokes: 5, splitAngle: .14, wheelColor: '#535951', rounded: true, doorSculpt: .072, rearPillar: .50, color: '#78806e',
  },
  amgSL63: {
    body: [[-1,.86,.84,.90],[-.82,.98,.92,.95],[-.60,1,.95,.95],[-.30,.92,.87,.89],[0,.88,.87,.87],[.31,.94,.92,.83],[.60,.99,.96,.77],[.84,.98,.82,.73],[1,.88,.66,.60]],
    cabin: [[.12,.57,1.359],[.25,.60,1.28],[.45,.65,.95]],
    roof: [.12,.25], open: true, opening: [-.60,.20], frontOverhang: 1.02, radius: .36, radii: [.36,.35725], rimRadii: [.254,.254], wheelWidth: [.265,.295], spokes: 10, rounded: true, doorSculpt: .075, color: '#d2c5b0',
  },
  hondaPrelude: {
    body: [[-1,.87,.84,.89],[-.83,.97,.89,.92],[-.59,1,.94,.96],[-.32,.95,.90,.90],[0,.93,.89,.86],[.31,.95,.90,.81],[.59,.99,.91,.75],[.84,.96,.76,.70],[1,.85,.64,.61]],
    cabin: [[-.76,.35,.93],[-.52,.55,1.19],[-.20,.65,1.356],[.11,.66,1.33],[.43,.66,.96]],
    roof: [-.37,.13], frontOverhang: .965, radius: .3353, radii: [.3353,.3353], rimRadii: [.2413,.2413], track: [1.6268,1.6149], wheelWidth: [.235,.235], spokes: 10, wheelColor: '#313b42', rounded: true, doorSculpt: .055, rearPillar: .52, color: '#4587b4',
  },
  toyotaGR86: {
    body: [[-1,.87,.80,.87],[-.82,.97,.87,.92],[-.60,1,.93,.93],[-.30,.94,.88,.86],[0,.92,.86,.84],[.31,.96,.91,.81],[.60,1,.95,.77],[.84,.97,.80,.71],[1,.85,.65,.57]],
    cabin: [[-.67,.37,.92],[-.43,.56,1.22],[-.15,.61,1.310],[.10,.62,1.27],[.37,.62,.94]],
    roof: [-.38,.09], frontOverhang: .82, radius: .3146, radii: [.3146,.3146], rimRadii: [.2286,.2286], wheelWidth: [.215,.215], spokes: 10, wheelColor: '#313a41', rounded: true, doorSculpt: .065, rearPillar: .53, color: '#bd2f29',
  },
  mazdaMX5: {
    body: [[-1,.84,.75,.82],[-.82,.97,.83,.86],[-.60,1,.88,.88],[-.31,.90,.81,.80],[0,.86,.79,.78],[.32,.94,.87,.77],[.60,1,.91,.74],[.84,.94,.76,.65],[1,.76,.59,.53]],
    cabin: [[.07,.50,1.240],[.19,.53,1.19],[.40,.58,.92]],
    roof: [.07,.19], open: true, opening: [-.54,.16], frontOverhang: .84, radius: .30815, radii: [.30815,.30815], rimRadii: [.2159,.2159], track: [1.49606,1.50368], wheelWidth: [.205,.205], spokes: 8, wheelColor: '#35414a', rounded: true, doorSculpt: .075, color: '#b72a2e',
  },
  bmwM2: {
    body: [[-1,.93,.89,.94],[-.82,.99,.94,.98],[-.60,1,.98,.99],[-.31,.95,.93,.92],[0,.92,.92,.90],[.31,.97,.95,.86],[.60,1,.98,.82],[.84,.99,.88,.81],[1,.92,.76,.73]],
    cabin: [[-.59,.48,.99],[-.41,.62,1.29],[-.12,.68,1.403],[.16,.68,1.37],[.42,.65,1.01]],
    roof: [-.32,.18], frontOverhang: .852, radius: .33755, radii: [.33755,.3395], rimRadii: [.2413,.254], wheelWidth: [.275,.285], spokes: 10, wheelColor: '#253038', doorSculpt: .052, rearPillar: .57, color: '#5791ab',
  },
};

function sectionAt(sections, q) {
  let index = sections.findIndex(section => section[0] >= q);
  if (index < 1) index = q <= sections[0][0] ? 1 : sections.length - 1;
  const a = sections[index - 1], b = sections[index];
  const span=b[0]-a[0],t=clamp((q-a[0])/span,0,1),before=sections[Math.max(0,index-2)],after=sections[Math.min(sections.length-1,index+1)];
  // Shape-preserving cubic tangents flow through each measured section. A
  // smoothstep at every station flattened the bonnet and shoulder into terraces.
  return a.slice(1).map((value,i)=>{
    const key=i+1,delta=(b[key]-value)/span;
    const left=before===a?delta:(value-before[key])/(a[0]-before[0]),right=after===b?delta:(after[key]-b[key])/(after[0]-b[0]);
    const tangent=(other)=>delta*other<=0?0:Math.sign(delta)*Math.min(Math.abs((delta+other)*.5),3*Math.abs(delta));
    return (2*t**3-3*t*t+1)*value+(t**3-2*t*t+t)*span*tangent(left)+(-2*t**3+3*t*t)*b[key]+(t**3-t*t)*span*tangent(right);
  });
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
    if(!node.material.map)geometry.deleteAttribute('uv');
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

export function createProductionCar({ mobile = false, vehicle = 'porsche911gt3rs', inspectParts = false } = {}) {
  if (vehicle === 'bmwX3') return createBMWX3({ mobile, inspectParts });
  const shape = profiles[vehicle], spec = PRODUCTION_CAR_DIMENSIONS[vehicle], preset = VEHICLES[vehicle];
  if (!shape || !spec) throw new RangeError(`Unknown production car: ${vehicle}`);
  const { length, width, height, wheelbase } = spec;
  const halfLength = length / 2, halfWidth = (shape.bodyWidth||width) / 2, baseY = .46;
  const frontZ = halfLength - shape.frontOverhang, rearZ = frontZ - wheelbase;
  const quarterWindow=['porsche911gt3rs','porsche911turboS','astonVantage','bmwM4','nissanZ','amgGT63','mustangDarkHorse','ferrari12cilindri','hondaPrelude','toyotaGR86','bmwM2'].includes(vehicle);
  const group = new THREE.Group(); group.name = preset.name;
  const chassis = new THREE.Group(); chassis.name = 'suspension-response'; chassis.position.y = baseY; group.add(chassis);
  const materials = new Set(), textures = new Set(), signatures = [];
  function material(name, Type, options) { const m = new Type(options); m.name = name; materials.add(m); return m; }
  const paint = material('body-paint', THREE.MeshPhysicalMaterial, { color: shape.color, roughness: .27, metalness: .16, clearcoat: 1, clearcoatRoughness: .065, ior: 1.5, envMapIntensity: 1.16, side: THREE.DoubleSide });
  const carbon = material('carbon-aero', THREE.MeshStandardMaterial, { color: '#151d20', metalness: .28, roughness: .38, side: THREE.DoubleSide });
  const black = material('intake-mesh', THREE.MeshStandardMaterial, { color: '#080b0d', roughness: .8, metalness: .12, side: THREE.DoubleSide });
  const rubber = material('tyre-rubber', THREE.MeshStandardMaterial, { color: '#111416', roughness: .86 });
  const alloy = material('forged-alloy', THREE.MeshStandardMaterial, { color: shape.wheelColor||(vehicle==='bmwX3'?'#1d252d':'#59636b'), metalness: 1, roughness: vehicle==='bmwX3'?.23:.32, envMapIntensity: .92 });
  const polished = material('machined-rim-edge', THREE.MeshStandardMaterial, { color: vehicle==='bmwX3'?'#89959d':'#adb6bd', metalness: 1, roughness: vehicle==='bmwX3'?.21:.13, envMapIntensity: 1.18 });
  const brake = material('brake-disc', THREE.MeshStandardMaterial, { color: '#596268', metalness: .8, roughness: .48 });
  const caliper = material('brake-caliper', THREE.MeshStandardMaterial, { color: shape.caliperColor||(['porsche911gt3rs','bmwX3'].includes(vehicle) ? '#c72a20' : '#ddb729'), metalness: .4, roughness: .32 });
  const glass = material('tinted-glass', THREE.MeshPhysicalMaterial, { color: '#5a7079', metalness: 0, roughness: .055, ior: 1.52, clearcoat: .4, clearcoatRoughness: .025, envMapIntensity: 1.15, transparent: true, opacity: .72, depthWrite: true, side: THREE.DoubleSide });
  const frontLight = material('led-headlamp', THREE.MeshStandardMaterial, { color: '#e4eef0', emissive: '#d5ebf4', emissiveIntensity: .55, metalness: .22, roughness: .18 });
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
  function linearLine(points,radius,mat,name){
    const path=new THREE.CurvePath();
    for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(new THREE.Vector3(points[i-1][0],points[i-1][1]-baseY,points[i-1][2]),new THREE.Vector3(points[i][0],points[i][1]-baseY,points[i][2])));
    return mesh(new THREE.TubeGeometry(path,(points.length-1)*(mobile?2:3),radius,mobile?5:7),mat,chassis,name);
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
  function exhaust(x,y,z,radius = .047, hexagonal = false, aspect = [1,1]) {
    z=shellDepth(x,y,-1,-.020);
    const outer = mesh(new THREE.CylinderGeometry(radius,radius,.10,hexagonal ? 6 : 16,1,true),alloy);
    outer.rotation.x = Math.PI/2; outer.position.set(x,y-baseY,z);
    outer.scale.set(aspect[0],1,aspect[1]);
    const lip = mesh(new THREE.RingGeometry(radius*.86,radius,hexagonal ? 6 : 16),alloy);
    lip.rotation.y = Math.PI; lip.position.set(x,y-baseY,z-.057);
    lip.scale.set(aspect[0],aspect[1],1);
    const inner = mesh(new THREE.CircleGeometry(radius*.86,hexagonal ? 6 : 16),black);
    inner.rotation.y = Math.PI; inner.position.set(x,y-baseY,z-.055);
    inner.scale.set(aspect[0],aspect[1],1);
  }
  const shoulder = z => sectionAt(shape.body,z/halfLength)[1];
  const midEngine=['lamborghiniRevuelto','ferrari296Speciale','mclaren750s','corvetteZ06','lotusEmira','lamborghiniTemerario'].includes(vehicle);
  const floor = shape.floor || (midEngine?.155:shape.open?.16:.18);
  const axleRadius=axle=>shape.radii?.[axle===frontZ?0:1]||shape.radius;
  const porscheOptics=vehicle==='porsche911gt3rs'||vehicle==='porsche911turboS';
  const cornerRadius=shape.angular?.10:vehicle==='bmwX3'?.09:.19;
  const endWeight = z => clamp((Math.abs(z/halfLength)-.82)/.18,0,1)**2;
  const shoulderInset=z=>vehicle==='bmwX3'?.045*Math.sin(clamp((z+halfLength)/length,0,1)*Math.PI)**2:0;
  const bonnetHeight = (x,z) => {
    const [w,edge,center]=sectionAt(shape.body,z/halfLength),u=clamp(x/(w*halfWidth),-1,1);
    const bulge=shape.rounded?Math.max(0,.024*(Math.exp(-(((Math.abs(u)-.79)/.13)**2))-Math.exp(-((.21/.13)**2)))):0;
    const eye=vehicle==='mclaren750s'?clamp(1-((Math.abs(x)-.67)/.22)**2-((z-(halfLength-.43))/.29)**2,0,1)*.047:0;
    const surface=mix(center,edge,Math.abs(u)**(shape.angular?1.15:2.2))+bulge-eye;
    if(!porscheOptics)return surface;
    // The round lenses look forwards from a flattened fender pad. Following
    // the full transverse fender bank turned the near lens away from the driver.
    const lensBank=clamp(1-(Math.abs(Math.abs(x)-.66)/.30)**4,0,1)*clamp(1-(Math.abs(z-(halfLength-.376))/.35)**4,0,1);
    const ref=clamp(.66/(w*halfWidth),0,1),refBulge=shape.rounded?Math.max(0,.024*(Math.exp(-(((ref-.79)/.13)**2))-Math.exp(-((.21/.13)**2)))):0;
    return mix(surface,mix(center,edge,ref**(shape.angular?1.15:2.2))+refBulge,lensBank);
  };
  const sideSurfaceX = (side,z,y) => {
    const [w,rawTop]=sectionAt(shape.body,z/halfLength),top=porscheOptics||vehicle==='bmwX3'?bonnetHeight(w*halfWidth-shoulderInset(z),z):rawTop,t=clamp((top-y)/(top-floor),0,1),waist=Math.sin(clamp((z-rearZ)/(frontZ-rearZ),0,1)*Math.PI)**2;
    const folds=vehicle==='bmwX3'?(.25+.75*waist)*(-.047*Math.exp(-(((y-.91)/.17)**2))+.021*Math.exp(-(((y-.57)/.10)**2))):0;
    const shoulderRoll=-shoulderInset(z)*Math.exp(-(((top-y)/.105)**2));
    return side*(w*halfWidth+(shape.rounded?.038:.012)*Math.sin(Math.PI*t)-.035*t*t-shape.doorSculpt*waist*Math.sin(Math.PI*t)**1.5+folds+shoulderRoll+.005);
  };
  function surfaceOptic(x,z,rx,rz,mat,name,offset=.014) {
    const verts=[],face=[],segments=mobile?16:24,rings=3;
    for(let i=0;i<=rings;i++)for(let j=0;j<=segments;j++){
      const angle=j/segments*Math.PI*2,px=x+Math.cos(angle)*rx*i/rings,pz=z+Math.sin(angle)*rz*i/rings;
      verts.push(px,bonnetHeight(px,pz)+offset+.018*(1-(i/rings)**2)-baseY,pz);
      if(i&&j){const a=i*(segments+1)+j,b=a-1,c=a-segments-1,d=c-1;face.push(a,c,b,b,c,d);}
    }
    return mesh(geometryFrom(verts,face.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[])),mat,chassis,name);
  }
  function surfaceLine(points,radius,mat,name) {
    const segments=Math.max(8,points.length*(mobile?3:5)),plan=new THREE.CatmullRomCurve3(points.map(([x,,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
    const curve=new THREE.CatmullRomCurve3(plan.getPoints(segments).map(({x,z})=>new THREE.Vector3(x,bonnetHeight(x,z)+.034-baseY,z)),false,'centripetal');
    return mesh(new THREE.TubeGeometry(curve,segments,radius,mobile?5:7,false),mat,chassis,name);
  }
  function refineSurfaceGeometry(flat,edge){
    const positions=Array.from(flat.attributes.position.array);let indices=Array.from(flat.index.array);
    const limit=edge*edge;
    for(let pass=0;pass<7;pass++){
      const next=[],midpoints=new Map();let changed=false;
      const midpoint=(a,b)=>{
        if((positions[a*3]-positions[b*3])**2+(positions[a*3+1]-positions[b*3+1])**2<=limit)return -1;
        const key=`${Math.min(a,b)}:${Math.max(a,b)}`;if(midpoints.has(key))return midpoints.get(key);
        changed=true;const n=positions.length/3;positions.push(...[0,1,2].map(axis=>mix(positions[a*3+axis],positions[b*3+axis],.5)));midpoints.set(key,n);return n;
      };
      for(let i=0;i<indices.length;i+=3){
        const[a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a),flags=(ab>=0?1:0)+(bc>=0?2:0)+(ca>=0?4:0);
        if(flags===7)next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
        else if(flags===3)next.push(b,bc,ab,ab,bc,c,a,ab,c);
        else if(flags===5)next.push(a,ab,ca,ab,b,c,ca,ab,c);
        else if(flags===6)next.push(c,ca,bc,a,b,bc,a,bc,ca);
        else if(flags===1)next.push(a,ab,c,ab,b,c);
        else if(flags===2)next.push(a,b,bc,a,bc,c);
        else if(flags===4)next.push(a,b,ca,b,c,ca);
        else next.push(a,b,c);
      }
      indices=next;if(!changed)break;
    }
    flat.dispose();return geometryFrom(positions,indices);
  }
  function curvedPatchGeometry(outline,name){
    return refineSurfaceGeometry(new THREE.ShapeGeometry(outline),/optic|headlamp|eye-socket|lens/.test(name)?(mobile?.055:.045):(mobile?.095:.065));
  }
  function surfaceOutline(points,mat,name,offset=.020){
    const outline=new THREE.Shape(),last=points.at(-1),first=points[0];outline.moveTo(mix(last[0],first[0],.5),mix(last[1],first[1],.5));
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];outline.quadraticCurveTo(a[0],a[1],mix(a[0],b[0],.5),mix(a[1],b[1],.5));}
    outline.closePath();const geometry=curvedPatchGeometry(outline,name),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){const x=position.getX(i),z=position.getY(i);position.setXYZ(i,x,bonnetHeight(x,z)+offset-baseY,z);}
    const indices=Array.from(geometry.index.array);geometry.setIndex(indices.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]));
    geometry.computeVertexNormals();return mesh(geometry,mat,chassis,name);
  }
  function bodyPatch(points,mat,name,offset=.016){
    const outline=new THREE.Shape();outline.moveTo(...points[0]);for(const p of points.slice(1))outline.lineTo(...p);outline.closePath();
    const geometry=curvedPatchGeometry(outline,name),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){const x=position.getX(i),z=position.getY(i);position.setXYZ(i,x,bonnetHeight(x,z)+offset-baseY,z);}
    const indices=Array.from(geometry.index.array);geometry.setIndex(indices.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]));geometry.computeVertexNormals();
    return mesh(geometry,mat,chassis,name);
  }
  function frontOutline(points,mat,name,round=true){
    const outline=new THREE.Shape(),last=points.at(-1),first=points[0],cut=name==='x3-wide-kidney'?.045:.5;
    outline.moveTo(round?mix(last[0],first[0],1-cut):first[0],round?mix(last[1],first[1],1-cut):first[1]);
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if(round){outline.quadraticCurveTo(a[0],a[1],mix(a[0],b[0],cut),mix(a[1],b[1],cut));if(cut<.5)outline.lineTo(mix(a[0],b[0],1-cut),mix(a[1],b[1],1-cut));}else outline.lineTo(a[0],a[1]);}
    outline.closePath();const geometry=new THREE.ShapeGeometry(outline,mobile?3:5),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i),position.getY(i)-baseY,halfLength+.01);
    geometry.computeVertexNormals();return mesh(geometry,mat,chassis,name);
  }
  function frontRing(points,mat,name){
    const cx=points.reduce((s,p)=>s+p[0],0)/points.length,cy=points.reduce((s,p)=>s+p[1],0)/points.length,verts=[],face=[];
    for(const [x,y]of points)verts.push(x,y-baseY,halfLength,mix(cx,x,.87),mix(cy,y,.87)-baseY,halfLength);
    for(let i=0;i<points.length;i++){const a=i*2,b=a+1,c=((i+1)%points.length)*2,d=c+1;face.push(a,c,b,b,c,d);}
    const item=mesh(geometryFrom(verts,face),mat,chassis,name);item.userData.fasciaSubdivisions=2;return item;
  }
  function sideOutline(points,side,mat,name){
    const outline=new THREE.Shape(),last=points.at(-1),first=points[0];outline.moveTo(mix(last[0],first[0],.5),mix(last[1],first[1],.5));
    for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];outline.quadraticCurveTo(a[0],a[1],mix(a[0],b[0],.5),mix(a[1],b[1],.5));}
    outline.closePath();const geometry=new THREE.ShapeGeometry(outline,mobile?4:7),position=geometry.attributes.position;
    for(let i=0;i<position.count;i++){const z=position.getX(i),y=position.getY(i);position.setXYZ(i,sideSurfaceX(side,z,y)+side*.009,y-baseY,z);}
    geometry.computeVertexNormals();return mesh(geometry,mat,chassis,name);
  }
  function ovalExhaust(y,z,rx,ry,name){
    const lip=mesh(new THREE.TorusGeometry(1,.095,7,32),alloy,chassis,name);lip.scale.set(rx,ry,ry);lip.position.set(0,y-baseY,z-.022);lip.rotation.y=Math.PI;
    ellipsoid(0,y,z-.005,rx*.88,ry*.77,.025,black,`${name}-interior`);
  }
  const bumperFloor = direction => vehicle==='bmwX3'?(direction<0?.31:.34):floor + (direction < 0 && shape.rounded ? .085 : 0);
  const bumperTuck = (direction,u,t) => (shape.rounded ? .13 : .055)*Math.abs(u)**2*Math.sin(Math.PI*t) + (direction < 0 ? .075 : .035)*t*t;
  const cabinPoint = (q,u,offset=0) => {
    const z=q*halfLength,[w,peak]=sectionAt(shape.cabin,q),x=u*w,bottom=vehicle==='bmwX3'?shoulder(z)+.018:bonnetHeight(x,z)+.018;
    // A gently crowned roof rolls into steep side windows. The previous half
    // ellipse made every windscreen look like a continuous bubble canopy.
    const crown=(1-Math.abs(u)**(vehicle==='bmwX3'?8:shape.angular?8:midEngine?8:5))**(vehicle==='bmwX3'?.32:shape.angular?.48:midEngine?.48:.42);
    const doubleBubble=vehicle==='lamborghiniRevuelto'?.012*Math.sin(u*Math.PI)**2:0;
    const closure=vehicle==='bmwX3'?0:Math.max(clamp(1-(q-shape.cabin[0][0])/.055,0,1),clamp(1-(shape.cabin.at(-1)[0]-q)/.055,0,1))**2;
    return [x,mix(bottom+(Math.max(peak,bottom+.006)-bottom)*crown+doubleBubble,bonnetHeight(x,z)+.010,closure)+offset,z];
  };
  // Flowing fenders and hood are lofted independently from the cabin. Real arches
  // leave empty space above tyres instead of painting dark circles onto a box.
  const vertices = [], indices = [], rows = vehicle==='bmwX3'?(mobile?15:27):(mobile?23:39), stations = mobile ? 80 : 128;
  for (let i = 0; i <= stations; i++) {
    const z = -halfLength + i/stations*length, [w] = sectionAt(shape.body,z/halfLength);
    for (let j = 0; j < rows; j++) {
      const u = j/(rows-1)*2-1;
      const x=u*(w*halfWidth-shoulderInset(z));
      vertices.push(x, bonnetHeight(x,z)-baseY, z-Math.sign(z)*cornerRadius*Math.abs(u)**3*endWeight(z));
      const cabinOpening=shape.open&&z>shape.opening[0]*halfLength&&z<shape.opening[1]*halfLength&&Math.abs(u)<.64;
      if (i && j && !cabinOpening) { const a=i*rows+j,b=a-1,c=a-rows,d=c-1; indices.push(a,c,b,b,c,d); }
    }
  }
  mesh(geometryFrom(vertices,indices),paint,chassis,`${vehicle}-body-sculpture`);
  for (const side of [-1,1]) {
    const verts = [], face = [], sideRows=vehicle==='bmwX3'?(mobile?10:12):(mobile?7:8);
    for (let i=0;i<=stations;i++) {
      const z=-halfLength+i/stations*length, [w,rawTop]=sectionAt(shape.body,z/halfLength),top=porscheOptics||vehicle==='bmwX3'?bonnetHeight(w*halfWidth-shoulderInset(z),z):rawTop;
      const end=endWeight(z);
      let lower=mix(floor,bumperFloor(Math.sign(z)),end);
      for (const axle of [frontZ,rearZ]) {
        const radius=axleRadius(axle),d=Math.abs(z-axle),r=radius+.047;
        if(d<r) lower=Math.max(lower,radius+(vehicle==='bmwX3'?r*(1-(d/r)**2.35)**(1/2.35):Math.sqrt(r*r-d*d)));
      }
      lower=Math.min(top-.004,lower);
      for(let j=0;j<=sideRows;j++){
        const t=j/sideRows,roll=shape.rounded?.038*Math.sin(Math.PI*t):.012*Math.sin(Math.PI*t);
        const waist=Math.sin(clamp((z-rearZ)/(frontZ-rearZ),0,1)*Math.PI)**2;
        const x=j===0?w*halfWidth-shoulderInset(z):sideSurfaceX(1,z,mix(top,lower,t))-.005;
        const endZ=z-Math.sign(z)*(cornerRadius+bumperTuck(Math.sign(z),1,t))*end;
        verts.push(side*x,mix(top,lower,t)-baseY,endZ);
        if(i&&j){const a=i*(sideRows+1)+j,b=a-1,c=a-sideRows-1,d=c-1;face.push(a,c,b,b,c,d);}
      }
    }
    mesh(geometryFrom(verts,side>0?face:face.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[])),paint,chassis,'wheel-arch-side');
    box(.065,.045,wheelbase-2*(shape.radius+.047)-.08,carbon,side*(halfWidth*.94),floor+.008,(frontZ+rearZ)/2,'lower-side-skirt');
    const mirrorZ=shape.cabin.at(-1)[0]*halfLength-.10;
    const mirrorHeight=shape.mirrorHeight||1.015;
    line([[side*halfWidth*.72,mirrorHeight-.025,mirrorZ],[side*halfWidth*.98,mirrorHeight-.005,mirrorZ-.02]],.018,carbon);
    if(vehicle!=='bmwX3'){
      const mx=side*(halfWidth+.035),mz=mirrorZ-.035,outline=[[-.065,-.100],[.065,-.100],[.090,-.075],[.095,.055],[.055,.110],[-.065,.105],[-.090,.060],[-.090,-.065]],mirrorVertices=[],mirrorFaces=[];
      for(const [scale,y]of [[.86,-.026],[1,.012],[.76,.041]])for(const [x,z]of outline)mirrorVertices.push(mx+side*x*scale,mirrorHeight+y-baseY,mz+z*scale);
      for(let k=1;k<3;k++)for(let i=0;i<8;i++){const a=k*8+i,b=k*8+(i+1)%8,c=a-8,d=b-8;mirrorFaces.push(a,c,b,b,c,d);}
      for(let i=1;i<7;i++)mirrorFaces.push(0,i+1,i,16,16+i,17+i);
      mesh(geometryFrom(mirrorVertices,mirrorFaces),paint,chassis,'sculpted-side-mirror');
      panel([[mx-side*.061,mirrorHeight-.018,mz-.087],[mx+side*.061,mirrorHeight-.018,mz-.087],[mx+side*.060,mirrorHeight+.008,mz-.102],[mx-side*.060,mirrorHeight+.008,mz-.102]],glass,'rear-view-mirror-lens');
    }
    const doorFront=shape.cabin.at(-1)[0]*halfLength-.08, doorRear=vehicle==='bmwX3'?-1.35:vehicle==='bmwM4'?-.93:-.67;
    const doorTop=shoulder(doorRear)-.085,doorBottom=floor+.14;
    const shutLine=[[doorRear,doorTop],[doorRear,doorBottom+.03],[(doorRear+doorFront)/2,doorBottom],[doorFront,doorBottom+.05],[doorFront,shoulder(doorFront)-.075]];
    if(vehicle!=='bmwX3')line(shutLine.map(([z,y])=>[sideSurfaceX(side,z,y),y,z]),.0025,carbon,'door-shut-line');
    if(vehicle!=='bmwX3')box(.012,.014,.105,carbon,sideSurfaceX(side,doorRear+.18,doorTop),doorTop,doorRear+.18,'flush-door-handle');
  }
  // Rounded shoulders wrap into a recessed lower bumper instead of ending in a
  // vertical painted slab. Angular supercars retain their sharper creases.
  for (const direction of [-1,1]) {
    const z=direction*halfLength,[w,edge,center]=sectionAt(shape.body,direction),verts=[],face=[],bands=mobile?10:16;
    for(let i=0;i<=bands;i++)for(let j=0;j<rows;j++){
      const u=j/(rows-1)*2-1,t=i/bands,top=bonnetHeight(u*w*halfWidth,z);
      const lower=bumperFloor(direction)+.025*(1-u*u),roll=shape.rounded?.038*Math.sin(Math.PI*t):.012*Math.sin(Math.PI*t);
      const y=mix(top,lower,t),plate=REAR_DETAIL_PROFILES[vehicle]?.plate;
      const plateInset=direction>0?0:vehicle==='bmwX3'?.055*clamp(1-(Math.abs(u*w*halfWidth)/.63)**6,0,1)*clamp(1-(Math.abs(y-.725)/.165)**4,0,1):plate?.026*clamp(1-(Math.abs(u*w*halfWidth)/(plate[1]/2+.07))**6,0,1)*clamp(1-(Math.abs(y-plate[0])/(plate[2]/2+.055))**4,0,1):0;
      verts.push(u*(w*halfWidth+roll-.035*t*t),y-baseY,z-direction*(cornerRadius*Math.abs(u)**3+bumperTuck(direction,u,t)+plateInset));
      if(i&&j){const a=i*rows+j,b=a-1,c=a-rows,d=c-1;face.push(a,c,b,b,c,d);}
    }
    mesh(geometryFrom(verts,direction>0?face:face.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[])),paint,chassis,direction>0?'front-fascia':'rear-fascia');
    const lip=[];
    for(let i=0;i<=12;i++){const u=i/6-1;lip.push([u*(w*halfWidth-.040),bumperFloor(direction)+.025*(1-u*u)+.008,z-direction*(cornerRadius*Math.abs(u)**3+bumperTuck(direction,u,.98)-.012)]);}
    line(lip,.023,carbon,'bumper-lower-aero');
    if(direction<0)panel([[-w*halfWidth*.91,floor+.014,z+.075],[w*halfWidth*.91,floor+.014,z+.075],[w*halfWidth*.86,bumperFloor(-1)+.032,z+.08],[-w*halfWidth*.86,bumperFloor(-1)+.032,z+.08]],carbon,'sculpted-diffuser-base');
  }
  // Weld only the continuous shell. Separate body panels previously carried
  // incompatible shoulder normals, so even rounded cars shaded like a box.
  const shellParts=chassis.children.filter(node=>node.name.endsWith('-body-sculpture')||['wheel-arch-side','front-fascia','rear-fascia'].includes(node.name));
  const shellSources=shellParts.map(node=>{const geometry=node.geometry.clone();geometry.deleteAttribute('normal');return geometry;});
  const joined=mergeGeometries(shellSources),shell=mergeVertices(joined,.005);shell.computeVertexNormals();
  const bodyShell=mesh(shell,paint,chassis,`${vehicle}-continuous-body-shell`);
  const attachmentSurfaces=new Map(),attachmentRay=new THREE.Raycaster(),attachmentDirection=new THREE.Vector3();
  for(const direction of [-1,1]){
    const source=bodyShell.geometry,position=source.attributes.position,index=source.index,subset=[];
    for(let i=0;i<index.count;i+=3){
      const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
      if(Math.max(position.getZ(a)*direction,position.getZ(b)*direction,position.getZ(c)*direction)>halfLength*.52)subset.push(a,b,c);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',position);geometry.setIndex(subset);
    attachmentSurfaces.set(direction,new THREE.Mesh(geometry,paint));
  }
  const shellDepth=(x,y,direction,offset=.015)=>{
    attachmentRay.set(new THREE.Vector3(x,y-baseY,direction*(halfLength+1)),attachmentDirection.set(0,0,-direction));
    const hit=attachmentRay.intersectObject(attachmentSurfaces.get(direction),false)[0];
    if(hit)return hit.point.z+direction*offset;
    const [w]=sectionAt(shape.body,direction),u=clamp(x/(w*halfWidth),-1,1),top=bonnetHeight(x,direction*halfLength),t=clamp((top-y)/(top-bumperFloor(direction)),0,1);
    return direction*(halfLength-cornerRadius*Math.abs(u)**3-bumperTuck(direction,u,t)+offset);
  };
  for(const node of shellParts){chassis.remove(node);node.geometry.dispose();}
  shellSources.forEach(geometry=>geometry.dispose());joined.dispose();
  if(vehicle!=='bmwX3'){
    for(const axle of [frontZ,rearZ])for(const side of [-1,1]){
      const radius=axleRadius(axle),r=radius+.047,axleIndex=axle===frontZ?0:1,tyreWidth=shape.wheelWidth[axleIndex],wheelCenter=shape.track?shape.track[axleIndex]/2:halfWidth-tyreWidth*.5+.006,innerX=wheelCenter-tyreWidth*.5-.028,verts=[],faces=[],wall=[],wallFaces=[],lip=[],lipFaces=[];
      for(let i=0;i<=28;i++){
        const a=i/28*Math.PI,z=axle+Math.cos(a)*r,arcY=Math.max(floor,radius+Math.sin(a)*r),y=Math.min(arcY,shoulder(z)-.016),x=sideSurfaceX(side,z,y),innerY=Math.min(y-.006,bonnetHeight(innerX,z)-.024);
        verts.push(x,y-baseY,z,side*innerX,innerY-baseY,z);
        wall.push(side*innerX,innerY-baseY,z,side*innerX,floor-baseY,z);
        for(const [dy,dx]of [[0,0],[.010,.002],[.018,-.008]])lip.push(x+side*dx,y+dy-baseY,z);
        if(i){const b=i*2;faces.push(b,b-2,b+1,b+1,b-2,b-1);wallFaces.push(b,b-2,b+1,b+1,b-2,b-1);}
        if(i)for(let j=1;j<=2;j++){const a=i*3+j,b=a-1,c=a-3,d=c-1;lipFaces.push(a,c,b,b,c,d);}
      }
      mesh(geometryFrom(verts,faces),black,chassis,'closed-wheel-arch-liner');
      mesh(geometryFrom(wall,wallFaces),black,chassis,'closed-wheel-well-back-wall');
      mesh(geometryFrom(lip,lipFaces),paint,chassis,'painted-wheel-arch-bevel');
    }
    box(1.04,.028,length-.50,black,0,floor-.012,0,'opaque-underbody');
  }
  // Curved windscreens, framed side glass and separate opaque roof retain the
  // rear engine deck or long hood specific to each layout.
  const cabinVertices=[],cabinIndices=[],privacyIndices=[],sideFrameIndices=[],cabinRows=shape.angular?(mobile?16:20):24,cabinSteps=mobile?32:52;
  const cabinMin=shape.cabin[0][0],cabinMax=shape.cabin.at(-1)[0];
  for(let i=0;i<=cabinSteps;i++){
    const q=mix(cabinMin,cabinMax,i/cabinSteps);
    for(let j=0;j<=cabinRows;j++){
      const [x,y,z]=cabinPoint(q,j/cabinRows*2-1);
      cabinVertices.push(x,y-baseY,z);
      if(i&&j){const a=i*(cabinRows+1)+j,b=a-1,c=a-cabinRows-1,d=c-1;
        const sideFrame=vehicle==='bmwX3'&&q>-.835&&Math.abs((j-.5)/cabinRows*2-1)>.89;
        (sideFrame?sideFrameIndices:vehicle==='bmwX3'?q<-.035?privacyIndices:cabinIndices:!shape.open&&q<shape.roof[0]?privacyIndices:cabinIndices).push(a,c,b,b,c,d);
      }
    }
  }
  const x3ExteriorGlass=vehicle==='bmwX3'?material('x3-front-exterior-glass',THREE.MeshPhysicalMaterial,{color:'#344650',metalness:0,roughness:.07,clearcoat:1,clearcoatRoughness:.025,ior:1.52,envMapIntensity:1.25,side:THREE.DoubleSide}):null;
  const exteriorGlass=vehicle==='bmwX3'?x3ExteriorGlass:material('coupe-exterior-glass',THREE.MeshPhysicalMaterial,{color:'#354a55',metalness:0,roughness:.06,ior:1.52,clearcoat:1,clearcoatRoughness:.025,envMapIntensity:1.2,transparent:true,opacity:.89,depthWrite:true,side:THREE.DoubleSide});
  mesh(geometryFrom(cabinVertices,cabinIndices),exteriorGlass,chassis,'model-specific-greenhouse');
  if(sideFrameIndices.length)mesh(geometryFrom(cabinVertices,sideFrameIndices),paint,chassis,'x3-shaped-window-surround');
  let x3PrivacyGlass;
  if(privacyIndices.length){
    x3PrivacyGlass=material(vehicle==='bmwX3'?'x3-rear-privacy-glass':'coupe-rear-privacy-glass',THREE.MeshPhysicalMaterial,{color:vehicle==='bmwX3'?'#11191d':'#1c2c34',metalness:0,roughness:.07,clearcoat:1,clearcoatRoughness:.025,ior:1.52,envMapIntensity:1.2,side:THREE.DoubleSide});
    mesh(geometryFrom(cabinVertices,privacyIndices),x3PrivacyGlass,chassis,vehicle==='bmwX3'?'x3-rear-privacy-glazing':'coupe-rear-privacy-glazing');
  }
  const roofVerts=[],roofIndices=[],roofSteps=24,roofRows=16,roofEdge=vehicle==='bmwX3'?.91:shape.angular?.78:.74;
  for(let i=0;i<=roofSteps;i++){
    const q=mix(...shape.roof,i/roofSteps);
    for(let j=0;j<=roofRows;j++){
      const [x,y,z]=cabinPoint(q,(j/roofRows*2-1)*roofEdge,.009);
      roofVerts.push(x,y-baseY,z);
      if(i&&j){const a=i*(roofRows+1)+j,b=a-1,c=a-roofRows-1,d=c-1;roofIndices.push(a,c,b,b,c,d);}
    }
  }
  if(!shape.open)mesh(geometryFrom(roofVerts,roofIndices),['bmwM4','nissanZ','hondaPrelude','mclaren750s'].includes(vehicle)?carbon:paint,chassis,'opaque-coupe-roof');
  if(!shape.open){
    const cabinTrim=material('visible-cabin-trim',THREE.MeshStandardMaterial,{color:'#171c1f',roughness:.91});
    const seatY=vehicle==='bmwX3'?1.30:height-.26,seatZ=mix(shape.roof[0],shape.roof[1],.46)*halfLength;
    for(const side of [-1,1]){
      if(vehicle==='bmwX3'){
        const seat=box(.32,.33,.09,cabinTrim,side*.30,seatY-.14,seatZ-.16,'seat-through-glazing');seat.rotation.x=-.10;
        box(.19,.12,.07,cabinTrim,side*.30,seatY+.075,seatZ-.18,'headrest-through-glazing');
      }else{
        const verts=[],faces=[];
        for(const [y,w,d,z]of [[seatY-.31,.145,.040,seatZ-.14],[seatY-.11,.170,.045,seatZ-.17],[seatY+.005,.116,.027,seatZ-.19],[seatY+.026,.085,.024,seatZ-.19]]){
          for(let i=0;i<8;i++){const a=i/8*Math.PI*2;verts.push(side*.30+Math.cos(a)*w,y-baseY,z+Math.sin(a)*d);}
        }
        for(let j=1;j<4;j++)for(let i=0;i<8;i++){const a=j*8+i,b=j*8+(i+1)%8,c=a-8,d=b-8;faces.push(a,c,b,b,c,d);}
        for(let i=1;i<7;i++)faces.push(0,i+1,i,24,24+i,25+i);
        mesh(geometryFrom(verts,faces),cabinTrim,chassis,'sculpted-seat-through-glazing');
        const headrest=mesh(new THREE.CylinderGeometry(.075,.088,.115,10),cabinTrim,chassis,'rounded-headrest-through-glazing');headrest.position.set(side*.30,seatY+.075-baseY,seatZ-.20);headrest.scale.z=.43;
      }
    }
    const dashZ=shape.cabin.at(-1)[0]*halfLength-.21;
    box(1.05,.045,.22,cabinTrim,0,bonnetHeight(0,dashZ)+.015,dashZ,'dashboard-through-glazing');
    box(.12,.24,.42,cabinTrim,0,shoulder(seatZ)-.045,seatZ+.22,'cabin-console');
  }
  // A real painted C-pillar separates side glass from the tapered rear window.
  // Tube-only pillars left a single wide black canopy on every coupe.
  if(!shape.open)for(const side of [-1,1]){
    const verts=[],face=[],steps=mobile?10:16,columns=8;
    for(let i=0;i<=steps;i++){
      const t=i/steps,q=mix(cabinMin,shape.roof[0]+.035,t),inner=mix(shape.rearPillar,roofEdge,t);
      const outer=quarterWindow&&t>.35?mix(inner,1,1-(t-.35)/.65*.78):1;
      for(let j=0;j<=columns;j++){
        const [x,y,z]=cabinPoint(q,side*mix(inner,outer,j/columns),.014);
        verts.push(x,y-baseY,z);
        if(i&&j){const a=i*(columns+1)+j,b=a-1,c=a-columns-1,d=c-1;face.push(a,c,b,b,c,d);}
      }
    }
    mesh(geometryFrom(verts,face),paint,chassis,'swept-painted-c-pillar');
  }
  for(const side of [-1,1]){
    const lower=shape.cabin.map(([q])=>cabinPoint(q,side,.006));
    if(vehicle!=='bmwX3')line(lower,.0065,carbon,'window-sill');
    for(const q of shape.open?[shape.cabin[0][0]]:[]){
      const arc=[];
      const sideExtent=quarterWindow&&q<0?roofEdge:1;
      for(let i=0;i<=8;i++)arc.push(cabinPoint(q,side*sideExtent*(1-i/8),.015));
      line(arc,.024,paint,'window-pillar');
    }
    if(!shape.open&&vehicle!=='bmwX3'){
      const pillar=[];for(let i=0;i<=7;i++)pillar.push(cabinPoint(mix(shape.roof[1],cabinMax,i/7),side*mix(roofEdge,1,i/7),.018));
      line(pillar,shape.angular?.011:.016,paint,'swept-windscreen-a-pillar');
    }
    if(!shape.open){
      const edge=[];
      for(let i=0;i<=12;i++)edge.push(cabinPoint(mix(...shape.roof,i/12),side*(roofEdge+.015),.008));
      if(vehicle==='bmwX3')line(edge,.0045,carbon,'roof-window-gasket');
      const dividerQ=vehicle==='bmwX3'?-.18:quarterWindow?shape.roof[0]+.065:mix(...shape.roof,.37);
      if(vehicle!=='bmwX3'&&quarterWindow)line([cabinPoint(dividerQ,side,.018),cabinPoint(dividerQ,side*(roofEdge+1)/2,.018),cabinPoint(dividerQ,side*roofEdge,.018)],.008,carbon,'side-window-divider');
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
      surfaceOptic(side*.66,front-.37,.165,.225,black,'911-headlamp-housing');
      surfaceOptic(side*.66,front-.37,.145,.202,glass,'911-clear-headlamp-lens',.018);
      const ring=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI*2;ring.push([side*.66+Math.cos(a)*.143,0,front-.37+Math.sin(a)*.195]);}
      surfaceLine(ring,.008,frontLight,'911-round-headlight');
      for(const x of [-.047,.047])for(const z of [-.067,.067])surfaceOptic(side*.66+x,front-.37+z,.021,.028,frontLight,'911-four-led-projector',.039);
      box(.43,.14,.04,black,side*.56,.41,front+.005,'front-cooling-intake');
      panel([[side*.14,bonnetHeight(side*.14,.71)+.01,.71],[side*.31,bonnetHeight(side*.31,1.40)+.01,1.40],[side*.56,bonnetHeight(side*.56,1.37)+.01,1.37],[side*.45,bonnetHeight(side*.45,.76)+.01,.76]],carbon,'hood-air-exit');
      for(let i=0;i<5;i++){const z=frontZ-.18+i*.067;box(.18,.012,.032,carbon,side*.76,bonnetHeight(side*.76,z)+.012,z,'front-fender-louvre');}
      panel([[side*.80,.40,frontZ-.37],[side*.84,.78,frontZ-.47],[side*.79,.79,frontZ-.65],[side*.77,.40,frontZ-.54]],black,'gt3-front-wheel-air-exit');
      line([[side*.77,.39,frontZ-.36],[side*.84,.78,frontZ-.46]],.022,carbon,'gt3-front-wheel-air-blade');
      line([[side*.62,.91,rearZ-.24],[side*.63,1.40,rearZ-.01],[side*.63,1.48,rearZ-.35]],.027,carbon,'swan-neck-wing-support');
      box(.023,.22,.48,carbon,side*.95,1.42,rearZ-.38,'wing-endplate');
      exhaust(side*.085,.39,rear-.015,.049);
      panel([[side*.28,.59,rear-.012],[side*.69,.57,rear+.012],[side*.78,.42,rear+.032],[side*.30,.43,rear+.018]],black,'911-recessed-bumper-vent');
      line([[side*.31,.46,rear-.055],[side*.57,.455,rear-.049],[side*.70,.46,rear-.040]],.009,rearLight,'911-lower-reflector');
      panel([[side*.88,.54,rearZ+.31],[side*.91,.82,rearZ+.44],[side*.88,.88,rearZ+.57],[side*.80,.56,rearZ+.47]],black,'gt3-rear-quarter-air-exit');
    }
    box(1.86,.045,.47,carbon,0,1.42,rearZ-.39,'gt3-rs-upper-wing');
    box(1.78,.035,.29,carbon,0,1.30,rearZ-.33,'gt3-rs-lower-wing');
    const tail=[[-.79,.785,rear+.235],[-.43,.757,rear-.017],[0,.765,rear-.024],[.43,.757,rear-.017],[.79,.785,rear+.235]];
    line(tail,.036,black,'911-recessed-lamp-housing');
    line(tail.map(([x,y,z])=>[x,y+.007,z-.047]),.010,rearLight,'911-light-bar');
    panel([[-.76,.29,rear-.022],[.76,.29,rear-.022],[.73,.53,rear-.032],[.65,.585,rear-.038],[-.65,.585,rear-.038],[-.73,.53,rear-.032]],black,'911-wide-recessed-lower-bumper');
    box(.50,.145,.016,black,0,.515,rear-.044,'911-number-plate-recess');
    box(.43,.095,.012,polished,0,.525,rear-.058,'911-rear-number-plate');
    for(let i=-6;i<=6;i++)box(.025,.012,.23,black,i*.063,bonnetHeight(i*.063,-1.73)+.008,-1.73,'911-engine-deck-louvre');
    for(const side of [-1,1])line([cabinPoint(-.20,side*.69,.022),cabinPoint(.07,side*.72,.022)],.010,carbon,'gt3-roof-air-guide');
  }else if(vehicle==='lamborghiniRevuelto'){
    signatures.push('y-shaped-lights','hexagonal-high-exhaust','open-v12-engine-bay','triangular-side-intakes');
    for(const side of [-1,1]){
      panel([[side*.25,.35,front+.01],[side*.83,.425,front-.01],[side*.78,.255,front+.018],[side*.30,.265,front+.024]],black,'angular-front-intake');
      bodyPatch([[side*.29,front-.08],[side*.57,front-.25],[side*.86,front-.65],[side*.89,front-.53],[side*.61,front-.26],[side*.83,front-.43],[side*.84,front-.38],[side*.58,front-.20]],black,'revuelto-y-headlamp-recess',.014);
      surfaceLine([[side*.35,0,front-.13],[side*.58,0,front-.30],[side*.84,0,front-.57]],.009,frontLight,'y-led-upper');
      surfaceLine([[side*.58,0,front-.30],[side*.81,0,front-.43]],.009,frontLight,'y-led-lower');
      line([[side*.30,.79,rear+.05],[side*.57,.79,rear+.065],[side*.84,.90,rear+.255]],.042,black,'revuelto-rear-y-lamp-socket');
      line([[side*.57,.79,rear+.065],[side*.83,.64,rear+.13]],.040,black,'revuelto-rear-y-lower-socket');
      line([[side*.30,.79,rear-.025],[side*.57,.79,rear-.01],[side*.84,.90,rear+.18]],.017,rearLight,'rear-y-upper');
      line([[side*.57,.79,rear-.01],[side*.83,.64,rear+.055]],.017,rearLight,'rear-y-lower');
      panel([[side*.96,.30,-.20],[side*.97,.74,-.66],[side*.85,.80,-1.10],[side*.86,.30,-1.05]],black,'revuelto-triangle-side-intake');
      line([[side*.88,.31,-.14],[side*.96,.72,-.67],[side*.87,.80,-1.16]],.025,carbon,'intake-flying-edge');
      exhaust(side*.17,.798,rear-.025,.096,true,[1.3,.74]);
      bodyPatch([[side*.59,-.70],[side*.74,-.94],[side*.79,-1.54],[side*.63,-1.46]],carbon,'rear-buttress',.024);
    }
    bodyPatch([[-.39,-.77],[.39,-.77],[.50,-1.42],[.37,-1.94],[-.37,-1.94],[-.50,-1.42]],black,'open-engine-deck',.008);
    for(let i=0;i<6;i++){const z=-.98-i*.11;box(.30,.023,.045,alloy,0,bonnetHeight(0,z)+.036,z,'exposed-v12-plenum');}
    bodyPatch([[-.70,rear+.13],[.70,rear+.13],[.73,rear+.33],[-.73,rear+.33]],paint,'active-rear-spoiler',.032);
    ellipsoid(0,.785,rear+.008,.32,.135,.035,black,'revuelto-high-exhaust-surround');
    panel([[-.80,.25,rear-.019],[.80,.25,rear-.019],[.83,.46,rear-.026],[.52,.50,rear-.032],[.32,.56,rear-.028],[-.32,.56,rear-.028],[-.52,.50,rear-.032],[-.83,.46,rear-.026]],carbon,'revuelto-deep-rear-diffuser');
    box(.42,.12,.020,black,0,.405,rear-.056,'revuelto-number-plate-recess');
  }else if(vehicle==='ferrari296Speciale'){
    signatures.push('gamma-rear-wings','suspended-front-splitter','high-central-exhaust','ferrari-bridge-tail-lights');
    panel([[-.80,.64,rear+.10],[.80,.64,rear+.10],[.81,.84,rear+.12],[-.81,.84,rear+.12]],black,'296-rear-recessed-lamp-band');
    panel([[-.77,.29,rear+.09],[.77,.29,rear+.09],[.71,.58,rear+.07],[-.71,.58,rear+.07]],carbon,'296-deep-rear-diffuser');
    for(const side of [-1,1]){
      surfaceOutline([[side*.40,front-.17],[side*.69,front-.54],[side*.81,front-.62],[side*.78,front-.42],[side*.57,front-.17]],black,'296-swept-headlamp-housing');
      surfaceLine([[side*.42,0,front-.24],[side*.66,0,front-.43],[side*.79,0,front-.60]],.008,frontLight,'296-led-blade');
      for(const x of [.60,.70])surfaceOptic(side*x,front-.31-(x-.60)*.9,.016,.020,frontLight,'296-optical-projector',.034);
      panel([[side*.16,.31,front+.005],[side*.77,.35,front-.10],[side*.63,.49,front-.07],[side*.22,.44,front+.015]],black,'296-front-intake');
      box(.58,.026,.24,carbon,side*.45,.27,front-.10,'suspended-splitter');
      box(.028,.09,.05,carbon,side*.58,.34,front-.11,'splitter-support');
      sideOutline([[-.32,.53],[-.67,.60],[-.85,.81],[-.61,.85],[-.40,.68]],side,black,'296-compact-oval-inlet');
      for(const x of [.49,.72])ellipsoid(side*x,.798,rear-.025+cornerRadius*(x/.77)**3,.112,.032,.022,rearLight,'296-paired-capsule-tail-light');
      const wing=box(.35,.037,.24,paint,side*.71,.985,rear+.25,'gamma-wing');wing.rotation.z=side*-.09;
      box(.022,.069,.24,paint,side*.88,.965,rear+.25,'gamma-wing-tip');
      for(let i=0;i<3;i++)surfaceOutline([[side*.48,front-.82-i*.12],[side*.68,front-.82-i*.12],[side*.68,front-.87-i*.12],[side*.48,front-.87-i*.12]],black,'296-bonnet-air-exit');
    }
    ovalExhaust(.575,rear-.025,.180,.056,'296-central-oval-exhaust');
    const engineWindow=[[-.40,-.65],[-.59,-1.03],[-.53,-1.60],[-.30,-1.91],[0,-1.97],[.30,-1.91],[.53,-1.60],[.59,-1.03],[.40,-.65]];
    surfaceOutline(engineWindow,black,'296-engine-bay-recess',.009);
    for(let i=0;i<4;i++){const z=-1.06-i*.12;box(.40,.017,.045,alloy,0,bonnetHeight(0,z)+.023,z,'engine-cover-detail');}
    surfaceOutline(engineWindow,glass,'296-rear-engine-glass',.049);
    box(.39,.10,.017,black,0,.405,rear-.027,'296-rear-number-plate');
  }else if(vehicle==='mclaren750s'){
    signatures.push('deep-eye-socket-headlamps','teardrop-greenhouse','single-oval-high-exhaust','active-airbrake');
    for(const side of [-1,1]){
      const eye=[[side*.44,front-.18],[side*.57,front-.54],[side*.82,front-.72],[side*.88,front-.49],[side*.80,front-.19]];
      surfaceOutline(eye,black,'750s-eye-socket');surfaceOutline(eye,glass,'750s-headlamp-lens',.026);
      surfaceLine([[side*.48,0,front-.24],[side*.60,0,front-.55],[side*.80,0,front-.65]],.008,frontLight,'750s-orbit-led');
      for(let i=0;i<4;i++)surfaceOptic(side*(.71+i*.027),front-.60-i*.016,.010,.018,frontLight,'750s-matrix-projector',.042);
      panel([[side*.89,.32,-.39],[side*.91,.35,-.66],[side*.88,.405,-.86],[side*.87,.37,-.67]],black,'750s-low-side-air-channel');
      panel([[side*.88,.79,-.89],[side*.92,.86,-1.04],[side*.85,.89,-1.34],[side*.83,.83,-1.20]],black,'750s-upper-side-air-channel');
      line([[side*.80,.81,-.36],[side*.89,.84,-.80],[side*.82,.91,-1.35]],.022,paint,'750s-flying-buttress');
      line([[side*.42,.80,rear-.014],[side*.64,.80,rear+.04],[side*.79,.79,rear+.15]],.016,rearLight,'750s-slim-rear-led');
      surfaceOutline([[side*.32,front-.73],[side*.41,front-1.06],[side*.48,front-.98],[side*.42,front-.69]],carbon,'750s-bonnet-air-exit');
      panel([[side*.28,.255,front+.015],[side*.69,.265,front-.08],[side*.75,.365,front-.16],[side*.40,.325,front+.015]],black,'750s-front-cooling-intake');
    }
    ovalExhaust(.785,rear+.002,.143,.073,'750s-single-oval-exhaust');
    const airbrakeHeight=bonnetHeight(0,rear+.25)+.016;
    box(1.58,.027,.31,paint,0,airbrakeHeight,rear+.25,'750s-active-airbrake');
    for(const x of [-.37,.37])box(.037,.023,.09,carbon,x,airbrakeHeight-.024,rear+.27,'airbrake-strut');
    panel([[-.33,.82,-.72],[.33,.82,-.72],[.38,.85,-1.38],[-.38,.85,-1.38]],glass,'750s-engine-glass');
  }else if(vehicle==='astonVantage'){
    signatures.push('wide-vane-grille','long-front-engine-hood','side-strake','continuous-rear-light');
    frontOutline([[-.82,.32],[-.75,.49],[-.57,.60],[0,.585],[.57,.60],[.75,.49],[.82,.32],[.51,.25],[-.51,.25]],black,'vantage-wide-mouth');
    for(let i=0;i<5;i++)box(1.33-i*.036,.013,.018,carbon,0,.29+i*.06,front+.035,'vantage-grille-vane');
    for(const side of [-1,1]){
      const eye=[[side*.53,front-.08],[side*.59,front-.52],[side*.74,front-.68],[side*.83,front-.50],[side*.81,front-.13],[side*.70,front-.05]];
      surfaceOutline(eye,black,'vantage-swept-optic-recess',.012);surfaceOutline(eye,glass,'vantage-swept-optic-lens',.021);
      surfaceLine([[side*.59,0,front-.31],[side*.70,0,front-.33],[side*.80,0,front-.33]],.008,frontLight,'vantage-headlight-signature');
      for(const x of [.62,.69,.76])surfaceOptic(side*x,front-.48,.011,.018,frontLight,'vantage-upper-optical-cell',.029);
      surfaceOptic(side*.70,front-.20,.030,.035,frontLight,'vantage-projector',.029);
      frontOutline([[.78,.38],[.88,.39],[.90,.59],[.85,.65],[.81,.57]].map(([x,y])=>[side*x,y]),black,'vantage-front-outboard-air',false);
      line([[side*.97,.80,.88],[side*.93,.80,.36]],.010,alloy,'vantage-side-strake');
      box(.025,.085,.38,black,side*.955,.77,.72,'vantage-side-vent');
      for(const x of [.51,.64])exhaust(side*x,.38,rear-.03,.047,false,[1.25,.83]);
      bodyPatch([[side*.21,.66],[side*.21,1.07],[side*.40,1.12],[side*.39,.65]],black,'vantage-hood-vent',.009);
    }
    line([[-.85,.79,rear+.095],[-.68,.82,rear-.015],[0,.82,rear-.024],[.68,.82,rear-.015],[.85,.79,rear+.095]],.015,rearLight,'vantage-full-rear-led');
    bodyPatch([[-.80,rear+.12],[.80,rear+.12],[.77,rear+.28],[-.77,rear+.28]],paint,'vantage-sculpted-ducktail',.028);
    panel([[-.82,.22,rear],[.82,.22,rear],[.79,.46,rear],[.60,.54,rear],[.31,.51,rear],[-.31,.51,rear],[-.60,.54,rear],[-.79,.46,rear]],carbon,'vantage-lower-bumper-insert');
  }else if(vehicle==='corvetteZ06'){
    signatures.push('angular-side-blades','four-central-exhausts','dual-trapezoid-tail-lights','transparent-engine-cover');
    for(const side of [-1,1]){
      const eye=[[side*.34,front-.12],[side*.80,front-.71],[side*.88,front-.88],[side*.89,front-.53],[side*.76,front-.22]];
      bodyPatch(eye,black,'z06-angular-optic-recess',.012);bodyPatch(eye,glass,'z06-angular-optic-lens',.022);
      surfaceLine([[side*.40,0,front-.18],[side*.65,0,front-.47],[side*.83,0,front-.74],[side*.85,0,front-.57]],.007,frontLight,'z06-swept-headlight');
      for(const x of [.62,.72])surfaceOptic(side*x,front-.33-(x-.62)*1.2,.021,.027,frontLight,'z06-projector',.030);
      panel([[side*.95,.35,-.36],[side*.97,.73,-.60],[side*.93,.83,-.84],[side*.93,.69,-.78],[side*.94,.36,-.60]],black,'z06-side-intake');
      line([[side*.91,.79,-.24],[side*.97,.78,-.60],[side*.89,.83,-.99]],.021,carbon,'z06-side-blade');
      panel([[side*.53,.24,front],[side*.87,.27,front],[side*.89,.55,front],[side*.53,.48,front]],black,'z06-front-outboard-air');
      panel([[side*.36,.49,rear],[side*.82,.49,rear],[side*.80,.64,rear],[side*.42,.64,rear]],black,'z06-rear-ventilated-fascia');
      for(const x of [.45,.73]){
        line([[side*(x-.09),.75,rear-.022],[side*(x+.085),.76,rear-.01],[side*(x+.072),.67,rear-.012],[side*(x-.075),.67,rear-.025],[side*(x-.09),.75,rear-.022]],.017,rearLight,'z06-trapezoid-tail-light');
      }
      for(const x of [.075,.20])exhaust(side*x,.39,rear-.035,.049);
    }
    panel([[-.47,.19,front],[.47,.19,front],[.50,.46,front],[0,.42,front],[-.50,.46,front]],black,'z06-front-cooling-intake');
    const engine=[[-.36,-.77],[.36,-.77],[.46,-1.45],[.35,-1.69],[-.35,-1.69],[-.46,-1.45]];
    bodyPatch(engine,black,'z06-engine-bay-recess',.009);bodyPatch(engine,glass,'z06-engine-glass',.038);
    for(const side of [-1,1])box(.15,.017,.44,paint,side*.18,bonnetHeight(side*.18,-1.13)+.022,-1.13,'z06-engine-cam-cover');
    bodyPatch([[-.83,rear+.14],[.83,rear+.14],[.86,rear+.35],[-.86,rear+.35]],carbon,'z06-integrated-low-spoiler',.037);
    panel([[-.81,.18,rear],[.81,.18,rear],[.73,.42,rear],[.45,.46,rear],[-.45,.46,rear],[-.73,.42,rear]],carbon,'z06-deep-rear-diffuser');
  }else if(vehicle==='bmwM4'){
    signatures.push('vertical-twin-kidney-grille','carbon-four-seat-roof','double-led-optics','quad-outboard-exhausts');
    for(const side of [-1,1]){
      panel([[side*.06,.30,front+.035],[side*.34,.32,front+.03],[side*.36,.65,front+.02],[side*.095,.67,front+.026]],black,'m4-tall-kidney');
      for(let i=0;i<5;i++)box(.24,.012,.013,carbon,side*.205,.36+i*.052,front+.043,'kidney-grille-bar');
      const eye=[[.415,.787],[.59,.835],[.85,.834],[.866,.754],[.66,.733],[.454,.749]];
      frontOutline(eye.map(([x,y])=>[side*x,y]),black,'m4-front-headlamp-housing',false);
      frontOutline(eye.map(([x,y])=>[side*x,y]),glass,'m4-front-headlamp-housing-lens',false);
      for(const x of [.51,.70])frontOutline([[x-.028,.805],[x-.022,.765],[x+.084,.762],[x+.100,.781],[x+.003,.779],[x-.005,.808]].map(([px,y])=>[side*px,y]),frontLight,'m4-front-headlamp-housing-double-l',false);
      panel([[side*.43,.28,front],[side*.83,.30,front],[side*.87,.60,front],[side*.59,.56,front]],black,'m4-front-outboard-air');
      line([[side*.42,.84,rear-.014],[side*.73,.86,rear+.03],[side*.85,.82,rear+.12],[side*.73,.76,rear+.015]],.020,rearLight,'m4-laser-tail-light');
      for(const x of [.54,.67])exhaust(side*x,.34,rear-.035,.047);
      box(.018,.075,.25,black,side*.94,.83,.83,'m4-side-gill');
    }
    bodyPatch([[-.73,rear+.10],[.73,rear+.10],[.72,rear+.23],[-.72,rear+.23]],carbon,'m4-carbon-trunk-lip',.021);
    panel([[-.82,.22,rear],[.82,.22,rear],[.78,.48,rear],[.50,.55,rear],[-.50,.55,rear],[-.78,.48,rear]],carbon,'m4-lower-bumper-insert');
  }else if(vehicle==='bmwX3'){
    signatures.push('tall-suv-cabin','g45-kidney-grille','roof-rails','opposed-l-smoked-tail-lights','quad-outboard-exhausts');
    const headlampLens=material('x3-front-smoked-optic',THREE.MeshPhysicalMaterial,{color:'#222c32',roughness:.14,metalness:0,clearcoat:1,clearcoatRoughness:.035,ior:1.49,envMapIntensity:1.3,side:THREE.DoubleSide});
    const grilleSlat=material('x3-gloss-grille-slat',THREE.MeshPhysicalMaterial,{color:'#303940',roughness:.23,metalness:.4,clearcoat:1,clearcoatRoughness:.07});
    const mirrorCap=material('x3-gloss-mirror-cap',THREE.MeshPhysicalMaterial,{color:'#101b23',roughness:.2,metalness:.08,clearcoat:1,clearcoatRoughness:.055});
    const windowPoint=(side,z,y,offset=.008)=>{
      const [w,peak]=sectionAt(shape.cabin,z/halfLength),bottom=shoulder(z)+.018,t=clamp((y-bottom)/(peak-bottom||1),0,1),u=(1-t**(1/.32))**(1/8);
      return[side*(u*w+offset),y,z];
    };
    function windowPane(side,points,mat,name){
      const outline=new THREE.Shape();outline.moveTo(...points[0]);for(const p of points.slice(1))outline.lineTo(...p);outline.closePath();
      const flat=new THREE.ShapeGeometry(outline),positions=Array.from(flat.attributes.position.array);let indices=Array.from(flat.index.array);
      for(let pass=0;pass<2;pass++){
        const next=[],midpoints=new Map(),midpoint=(a,b)=>{const key=`${Math.min(a,b)}:${Math.max(a,b)}`;if(midpoints.has(key))return midpoints.get(key);const n=positions.length/3;positions.push(...[0,1,2].map(axis=>mix(positions[a*3+axis],positions[b*3+axis],.5)));midpoints.set(key,n);return n;};
        for(let i=0;i<indices.length;i+=3){const[a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}indices=next;
      }
      for(let i=0;i<positions.length;i+=3){const [x,y,z]=windowPoint(side,positions[i],positions[i+1],mat===carbon?.010:.008);positions[i]=x;positions[i+1]=y-baseY;positions[i+2]=z;}
      flat.dispose();mesh(geometryFrom(positions,indices),mat,chassis,name);
      if(mat===carbon)return;
      const path=new THREE.CurvePath(),border=points.map(([z,y])=>{const[x,py,pz]=windowPoint(side,z,y,.012);return new THREE.Vector3(x,py-baseY,pz);});
      for(let i=0;i<border.length;i++)path.add(new THREE.LineCurve3(border[i],border[(i+1)%border.length]));
      mesh(new THREE.TubeGeometry(path,points.length*5,.004,4),carbon,chassis,'x3-thin-window-seal');
    }
    panel([[-.67,.35,front],[.67,.35,front],[.73,.56,front],[.61,.67,front],[-.61,.67,front],[-.73,.56,front]],black,'x3-front-lower-cooling-intake');
    frontOutline([[-.045,.765],[-.045,1.047],[.045,1.047],[.045,.765]],black,'x3-kidney-central-bridge',false);
    box(.035,.21,.025,paint,0,.455,front,'x3-front-lower-cooling-divider');
    for(const side of [-1,1]){
      windowPane(side,[[.98,1.207],[.47,1.546],[-.20,1.571],[-.21,1.202]],x3ExteriorGlass,'x3-tapered-front-side-glass');
      windowPane(side,[[-.255,1.203],[-.255,1.571],[-1.15,1.515],[-1.245,1.213]],x3PrivacyGlass,'x3-tapered-rear-door-glass');
      windowPane(side,[[-1.283,1.217],[-1.20,1.50],[-1.72,1.472],[-1.835,1.278],[-1.721,1.218]],x3PrivacyGlass,'x3-hofmeister-quarter-glass');
      windowPane(side,[[-.19,1.199],[-.194,1.571],[-.267,1.571],[-.27,1.201]],carbon,'x3-flat-b-pillar');
      windowPane(side,[[-1.19,1.508],[-1.25,1.214],[-1.30,1.217],[-1.225,1.499]],carbon,'x3-swept-c-pillar');
      line([[.98,1.207],[.79,1.351],[.47,1.546]].map(([z,y])=>windowPoint(side,z,y,.016)),.017,paint,'x3-swept-a-pillar');
      const mz=.884,mx=side*1.013,my=1.272;
      const cap=[[-.07,-.024,-.099],[.07,-.016,-.093],[.073,.028,-.061],[.025,.037,.087],[-.063,.029,.074],[-.08,-.006,.014]];
      const mirrorVertices=[...cap,...cap.map(([x,y,z])=>[x,y-.044,z])].flatMap(([x,y,z])=>[mx+side*x,my+y-baseY,mz+z]);
      const mirrorFaces=[0,1,2,0,2,3,0,3,4,0,4,5,6,8,7,6,9,8,6,10,9,6,11,10];
      for(let i=0;i<6;i++){const n=(i+1)%6;mirrorFaces.push(i,n,i+6,n,n+6,i+6);}
      mesh(geometryFrom(mirrorVertices,mirrorFaces),mirrorCap,chassis,'x3-angular-mirror-cap');
      panel([[mx-side*.062,my-.024,mz-.091],[mx+side*.067,my-.016,mz-.086],[mx+side*.065,my+.020,mz-.084],[mx-side*.055,my+.020,mz-.090]],x3ExteriorGlass,'x3-mirror-glass');
      const kidney=[[.015,1.025],[.10,1.058],[.42,1.054],[.52,1.014],[.515,.826],[.46,.726],[.10,.722],[.013,.794]];
      frontOutline(kidney.map(([x,y])=>[side*x,y]),black,'x3-wide-kidney');
      linearLine([...kidney,kidney[0]].map(([x,y])=>[side*x,y,front+.02]),.0045,polished,'x3-kidney-machined-frame');
      for(let i=0;i<3;i++)box(.43,.043,.035,grilleSlat,side*.271,.801+i*.09,front+.035,'x3-kidney-horizontal-slat');
      const eye=[[.475,1.065],[.775,1.130],[.919,1.128],[.899,1.025],[.807,1.010],[.595,1.027]];
      const lamp=frontOutline(eye.map(([x,y])=>[side*x,y]),headlampLens,'x3-front-headlamp-housing',false);lamp.userData.fasciaOffset=.021;
      frontOutline([[.66,.37],[.88,.39],[.90,.70],[.82,.77],[.73,.63]].map(([x,y])=>[side*x,y]),black,'x3-front-outboard-air-intake',false);
      frontOutline([[.859,1.109],[.872,1.108],[.855,1.053],[.666,1.033],[.664,1.046],[.843,1.064]].map(([x,y])=>[side*x,y]),frontLight,'x3-outboard-flat-L-drl',false);
      frontOutline([[.774,1.103],[.787,1.100],[.775,1.062],[.567,1.061],[.567,1.074],[.762,1.075]].map(([x,y])=>[side*x,y]),frontLight,'x3-inboard-flat-L-drl',false);
      for(let i=0;i<3;i++)box(.53,.013,.017,grilleSlat,side*.34,.405+i*.063,front,'x3-front-lower-cooling-slat');
      for(const x of [.18,.44])box(.009,.17,.014,carbon,side*x,.462,front,'x3-front-lower-cooling-slat');
      for(const x of [.55,.69])exhaust(side*x,.365,shellDepth(side*x,.365,-1,.040)+.045,.051);
      const rail=[];for(let i=0;i<=12;i++)rail.push(cabinPoint(mix(-.70,.23,i/12),side*.83,.031));
      line(rail,.016,carbon,'x3-roof-rail');
      const frontDoor=-.23,rearDoor=-1.20;
      for(const [name,points]of [['front',[[.93,1.15],[.95,.40],[.89,.33],[frontDoor+.06,.33],[frontDoor,.38],[frontDoor,1.16]]],['rear',[[frontDoor,1.16],[frontDoor,.38],[frontDoor-.06,.33],[-.89,.33],[-1.07,.53],[rearDoor,.93],[rearDoor,1.18]]]]){
        const seam=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/(mobile?.085:.055));for(let j=i===1?0:1;j<=steps;j++){const z=mix(a[0],b[0],j/steps),y=mix(a[1],b[1],j/steps);seam.push([sideSurfaceX(side,z,y)+side*.004,y,z]);}}
        const path=new THREE.CurvePath();for(let i=1;i<seam.length;i++)path.add(new THREE.LineCurve3(new THREE.Vector3(seam[i-1][0],seam[i-1][1]-baseY,seam[i-1][2]),new THREE.Vector3(seam[i][0],seam[i][1]-baseY,seam[i][2])));
        mesh(new THREE.TubeGeometry(path,seam.length,.0014,4),carbon,chassis,`x3-${name}-door-seam`);
      }
      for(const z of [.06,-.90]){const handle=box(.013,.030,.14,paint,sideSurfaceX(side,z,1.115)+side*.006,1.115,z,'x3-body-door-handle');line([[handle.position.x+side*.008,1.100,z-.055],[handle.position.x+side*.008,1.100,z+.055]],.002,black,'x3-door-handle-shadow');}
      surfaceLine([[side*.26,0,.78],[side*.31,0,1.42],[side*.32,0,front-.12]],.004,paint,'x3-bonnet-character-crease');
      panel([[side*.755,.48,rear],[side*.855,.47,rear],[side*.86,.79,rear],[side*.81,.84,rear]],black,'x3-rear-outboard-reflector-surround');
      line([[side*.824,.60,shellDepth(side*.824,.60,-1,.021)],[side*.832,.77,shellDepth(side*.832,.77,-1,.021)]],.009,rearLight,'x3-bumper-reflector');
    }
    const spoilerVertices=[],spoilerFaces=[];
    for(let i=0;i<=4;i++)for(let j=0;j<=16;j++){
      const [x,y,z]=cabinPoint(-.765,(j/16*2-1)*.91,.014),t=i/4;
      spoilerVertices.push(x*(1+t*.025),y-.017*t-baseY,z-.23*t);
      if(i&&j){const a=i*17+j,b=a-1,c=a-17,d=c-1;spoilerFaces.push(a,c,b,b,c,d);}
    }
    mesh(geometryFrom(spoilerVertices,spoilerFaces),paint,chassis,'x3-integrated-roof-spoiler');
    const spoilerLip=[];for(let j=0;j<=16;j++){const[x,y,z]=cabinPoint(-.765,(j/16*2-1)*.91,.014);spoilerLip.push([x*1.025,y-.031,z-.23]);}
    line(spoilerLip,.011,carbon,'x3-roof-spoiler-trailing-edge');
    const wiperLeft=cabinPoint(-.896,-.42,.029),wiperRight=cabinPoint(-.896,.10,.029);
    line([wiperLeft,wiperRight],.007,black,'rear-window-wiper');
    panel([[-.79,.31,rear],[.79,.31,rear],[.77,.46,rear],[.52,.515,rear],[-.52,.515,rear],[-.77,.46,rear]],carbon,'x3-lower-bumper-insert');
    const plateWhite=material('x3-number-plate-white',THREE.MeshStandardMaterial,{color:'#efece0',roughness:.7,emissive:'#efece0',emissiveIntensity:.18});
    box(.46,.112,.008,plateWhite,0,.705,rear-.055,'rear-number-plate');
    const hatch=[[-.77,1.13],[-.79,.95],[-.69,.84],[-.64,.58],[.64,.58],[.69,.84],[.79,.95],[.77,1.13]];
    line(hatch.map(([x,y])=>[x,y,shellDepth(x,y,-1,.006)]),.0021,carbon,'x3-tailgate-panel-seam');
    line([[-.63,.866],[0,.856],[.63,.866]].map(([x,y])=>[x,y,shellDepth(x,y,-1,.008)]),.0028,paint,'x3-tailgate-shoulder-fold');
    const badge=mesh(new THREE.CircleGeometry(.042,24),black,chassis,'x3-rear-roundel-base');badge.rotation.y=Math.PI;badge.position.set(0,.997-baseY,shellDepth(0,.997,-1,.020));
    const badgeBlue=material('x3-roundel-blue',THREE.MeshStandardMaterial,{color:'#398aca',metalness:.2,roughness:.22});
    for(let i=0;i<4;i++){const disc=mesh(new THREE.CircleGeometry(.032,8,i*Math.PI/2,Math.PI/2),i%2?polished:badgeBlue,chassis,'x3-rear-roundel-quadrant');disc.rotation.y=Math.PI;disc.position.copy(badge.position);disc.position.z-=.001;}
    surfaceOptic(0,halfLength-.19,.039,.049,black,'x3-bonnet-roundel');
    for(let i=0;i<4;i++){
      const disc=mesh(new THREE.CircleGeometry(.030,8,i*Math.PI/2,Math.PI/2),i%2?polished:badgeBlue,chassis,'x3-bonnet-roundel-quadrant');
      disc.rotation.x=-Math.PI/2;disc.position.set(0,bonnetHeight(0,halfLength-.19)+.032-baseY,halfLength-.19);
    }
    for(const axle of [frontZ,rearZ])for(const side of [-1,1]){
      const verts=[],face=[],lipVertices=[],lipFaces=[],innerWall=[],wallFaces=[];
      for(let i=0;i<=40;i++){
        const a=i/40*Math.PI,radius=axleRadius(axle),r=radius+.047,z=axle+Math.cos(a)*r,y=Math.max(floor,radius+r*(1-Math.abs(Math.cos(a))**2.35)**(1/2.35)),x=sideSurfaceX(side,z,y)+side*.003;
        verts.push(x,y-baseY,z,side*.45,y-.008-baseY,z);
        innerWall.push(side*.45,y-.008-baseY,z,side*.45,floor-.035-baseY,z);
        for(const [dy,dx]of [[0,.002],[.012,.006],[.024,-.004]])lipVertices.push(x+side*dx,y+dy-baseY,z);
        if(i){const b=i*2;face.push(b,b-2,b+1,b+1,b-2,b-1);}
        if(i){const b=i*2;wallFaces.push(b,b-2,b+1,b+1,b-2,b-1);}
        if(i)for(let j=1;j<=2;j++){const a=i*3+j,b=a-1,c=a-3,d=c-1;lipFaces.push(a,c,b,b,c,d);}
      }
      mesh(geometryFrom(verts,face),black,chassis,'x3-inner-wheel-arch-liner');
      mesh(geometryFrom(innerWall,wallFaces),black,chassis,'x3-closed-wheel-well-back-wall');
      mesh(geometryFrom(lipVertices,lipFaces),paint,chassis,'x3-painted-wheel-arch-lip');
    }
    box(1.12,.032,3.82,black,0,.235,0,'x3-opaque-underbody');
  }else if(vehicle==='amgGT63'){
    signatures.push('panamericana-vertical-grille','long-hood-fastback','twin-dot-rear-lights','quad-square-exhausts');
    panel([[-.66,.32,front+.019],[.66,.32,front+.019],[.57,.62,front+.020],[-.57,.62,front+.020]],black,'amg-panamericana-mouth');
    for(let i=-8;i<=8;i++)box(.012,.23,.018,alloy,i*.066,.46,front+.038,'panamericana-vane');
    const emblem=mesh(new THREE.TorusGeometry(.064,.008,5,28),alloy);emblem.position.set(0,.49-baseY,front+.045);
    for(let i=0;i<3;i++){const a=i/3*Math.PI*2;line([[0,.49,front+.048],[Math.sin(a)*.060,.49+Math.cos(a)*.060,front+.048]],.007,alloy,'amg-star-spoke');}
    for(const side of [-1,1]){
      const eye=[[side*.48,front-.11],[side*.64,front-.41],[side*.86,front-.55],[side*.88,front-.28],[side*.74,front-.10]];
      surfaceOutline(eye,black,'amg-swept-optic-recess',.014);surfaceOutline(eye,glass,'amg-swept-optic-lens',.022);
      surfaceLine([[side*.52,0,front-.15],[side*.67,0,front-.36],[side*.83,0,front-.43]],.007,frontLight,'amg-top-led');
      surfaceLine([[side*.55,0,front-.11],[side*.72,0,front-.22],[side*.81,0,front-.25]],.006,frontLight,'amg-bottom-led');
      for(const x of [.64,.74])surfaceOptic(side*x,front-.26-(x-.64)*.6,.022,.027,frontLight,'amg-projector',.030);
      panel([[side*.67,.29,front],[side*.89,.31,front],[side*.88,.58,front],[side*.73,.55,front]],black,'amg-front-outboard-air');
      line([[side*.42,.84,rear-.025],[side*.72,.85,rear+.018],[side*.84,.78,rear+.12]],.015,rearLight,'amg-rear-led');
      for(const x of [.54,.67]){
        const z=shellDepth(side*x,.36,-1,.029);line([[side*(x-.042),.32,z],[side*(x+.042),.32,z],[side*(x+.042),.395,z],[side*(x-.042),.395,z],[side*(x-.042),.32,z]],.012,alloy,'amg-square-exhaust');
        box(.065,.06,.013,black,side*x,.36,z-.004,'square-exhaust-dark-center');
      }
      for(let i=0;i<4;i++)box(.015,.10,.034,carbon,side*.92,.82,.91+i*.04,'amg-side-gill');
      bodyPatch([[side*.26,.79],[side*.27,1.22],[side*.41,1.29],[side*.42,.80]],carbon,'amg-hood-vent',.009);
    }
    bodyPatch([[-.77,rear+.11],[.77,rear+.11],[.75,rear+.32],[-.75,rear+.32]],carbon,'amg-active-rear-spoiler',.026);
    panel([[-.83,.20,rear],[.83,.20,rear],[.78,.43,rear],[.52,.50,rear],[-.52,.50,rear],[-.78,.43,rear]],carbon,'amg-lower-bumper-insert');
  }else if(vehicle==='mustangDarkHorse'){
    signatures.push('triple-vertical-tail-lights','three-module-headlamps','dark-hood-vent','muscle-coupe-shoulders');
    panel([[-.67,.44,front+.027],[.67,.44,front+.027],[.61,.70,front+.022],[-.61,.70,front+.022]],black,'dark-horse-grille');
    for(const side of [-1,1]){
      const eye=[[.39,.815],[.53,.875],[.90,.87],[.91,.744],[.80,.727],[.41,.758]];
      frontOutline(eye.map(([x,y])=>[side*x,y]),black,'mustang-front-headlamp-housing',false);
      frontOutline(eye.map(([x,y])=>[side*x,y]),glass,'mustang-front-headlamp-housing-lens',false);
      for(let i=0;i<3;i++)frontOutline([[.45+i*.13,.814],[.53+i*.13,.811],[.53+i*.13,.772],[.45+i*.13,.774]].map(([x,y])=>[side*x,y]),frontLight,'mustang-front-headlamp-housing-three-projectors',false);
      panel([[side*.60,.23,front],[side*.88,.25,front],[side*.91,.57,front],[side*.72,.55,front]],black,'mustang-front-outboard-air');
      for(let i=0;i<3;i++){
        const x=side*(.43+i*.17),tail=box(.046,.20,.031,rearLight,x,.84,rear-.029,'mustang-triple-tail-led');tail.rotation.z=-side*.17;
      }
      for(const x of [.53,.68])exhaust(side*x,.36,rear-.045,.049);
      bodyPatch([[side*.10,.98],[side*.11,1.57],[side*.43,1.64],[side*.46,1.02]],carbon,'mustang-hood-vent',.009);
      for(let i=0;i<5;i++)bodyPatch([[side*.12,1.02+i*.10],[side*.42,1.05+i*.10],[side*.42,1.067+i*.10],[side*.12,1.037+i*.10]],black,'hood-vent-louvre',.022);
      box(.037,.075,.08,carbon,side*.56,bonnetHeight(side*.56,rear+.30)+.065,rear+.30,'rear-wing-upright');
    }
    bodyPatch([[-.80,rear+.12],[.80,rear+.12],[.82,rear+.39],[-.82,rear+.39]],carbon,'dark-horse-rear-wing',.102);
    panel([[-.87,.22,rear],[.87,.22,rear],[.84,.48,rear],[.64,.52,rear],[-.64,.52,rear],[-.84,.48,rear]],carbon,'mustang-lower-bumper-insert');
    box(.29,.015,.13,carbon,0,.74,front+.025,'dark-grille-center');
  }else if(vehicle==='lotusEmira'){
    signatures.push('vertical-led-headlamps','curved-capsule-rear-lights','sculpted-side-intake','short-mid-engine-cabin');
    for(const side of [-1,1]){
      const eye=[[side*.48,front-.13],[side*.54,front-.47],[side*.68,front-.72],[side*.79,front-.65],[side*.78,front-.29],[side*.67,front-.12]];
      surfaceOutline(eye,black,'emira-vertical-optic-recess',.013);surfaceOutline(eye,glass,'emira-vertical-optic-lens',.021);
      surfaceLine([[side*.54,0,front-.17],[side*.59,0,front-.41],[side*.70,0,front-.61]],.007,frontLight,'emira-upper-led');
      surfaceLine([[side*.64,0,front-.17],[side*.71,0,front-.39],[side*.74,0,front-.59]],.006,frontLight,'emira-lower-led');
      surfaceOptic(side*.65,front-.35,.022,.026,frontLight,'emira-projector',.030);
      panel([[side*.43,.24,front],[side*.82,.28,front],[side*.81,.48,front],[side*.52,.43,front]],black,'emira-front-outboard-air');
      panel([[side*.82,.41,-.15],[side*.93,.77,-.57],[side*.82,.86,-1.00],[side*.76,.46,-.94]],black,'emira-sculpted-scoop');
      line([[side*.79,.42,-.12],[side*.91,.79,-.61],[side*.82,.89,-1.03]],.027,paint,'emira-intake-edge');
      const circle=mesh(new THREE.TorusGeometry(.082,.015,6,32),rearLight);circle.position.set(side*.60,.73-baseY,rear-.022);circle.rotation.y=Math.PI;
      exhaust(side*.48,.38,rear-.025,.055);
    }
    const engine=[[-.31,-.64],[.31,-.64],[.37,-1.36],[.26,-1.53],[-.26,-1.53],[-.37,-1.36]];
    bodyPatch(engine,black,'emira-engine-bay-recess',.009);bodyPatch(engine,glass,'emira-engine-window',.033);
    bodyPatch([[-.73,rear+.10],[.73,rear+.10],[.70,rear+.25],[-.70,rear+.25]],paint,'emira-integrated-ducktail',.023);
    panel([[-.74,.19,rear],[.74,.19,rear],[.68,.45,rear],[.49,.49,rear],[-.49,.49,rear],[-.68,.45,rear]],carbon,'emira-deep-rear-diffuser');
  }else if(vehicle==='ferrari12cilindri'){
    signatures.push('front-black-daytona-band','long-v12-hood','separate-rear-aero-flaps','slim-horizontal-tail-lights');
    frontOutline([[-.88,.65],[-.88,.72],[.88,.72],[.88,.65],[.45,.634],[-.45,.634]],black,'12cilindri-front-headlamp-housing-daytona-band',false);
    for(const side of [-1,1]){
      frontOutline([[.44,.692],[.85,.705],[.85,.696],[.44,.683]].map(([x,y])=>[side*x,y]),frontLight,'12cilindri-front-headlamp-housing-slim-led',false);
      bodyPatch([[side*.30,.95],[side*.32,1.47],[side*.51,1.52],[side*.51,.97]],black,'12cilindri-hood-air-exit',.010);
      for(let i=0;i<5;i++)bodyPatch([[side*.33,1.03+i*.078],[side*.49,1.05+i*.078],[side*.49,1.068+i*.078],[side*.33,1.048+i*.078]],carbon,'12cilindri-hood-vane',.021);
      line([[side*.35,.77,rear-.03],[side*.65,.79,rear+.01],[side*.80,.80,rear+.08]],.013,rearLight,'12cilindri-rear-light-blade');
      bodyPatch([[side*.47,rear+.16],[side*.88,rear+.18],[side*.84,rear+.50],[side*.44,rear+.47]],carbon,'independent-active-rear-flap',.027);
      for(const x of [.51,.64])exhaust(side*x,.40,rear-.03,.047);
    }
    bodyPatch([[-.47,-.71],[.47,-.71],[.38,-1.46],[-.38,-1.46]],black,'12cilindri-black-rear-deck',.014);
    box(1.35,.12,.025,black,0,.49,front+.015,'12cilindri-front-cooling');
  }else if(vehicle==='lamborghiniTemerario'){
    signatures.push('hexagonal-daytime-lights','slender-front-lamps','hexagonal-high-exhaust','hexagonal-rear-light-signature');
    for(const side of [-1,1]){
      bodyPatch([[side*.40,front-.14],[side*.71,front-.43],[side*.85,front-.54],[side*.83,front-.35],[side*.57,front-.15]],black,'temerario-front-slim-optic-recess',.018);
      surfaceLine([[side*.45,0,front-.18],[side*.65,0,front-.35],[side*.81,0,front-.49]],.005,frontLight,'temerario-thin-headlight');
      for(const x of [.66,.74])surfaceOptic(side*x,front-.35-(x-.66)*1.5,.012,.020,frontLight,'temerario-front-projector',.043);
      const hex=[];
      for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;hex.push([side*.61+Math.cos(a)*.12,.405+Math.sin(a)*.069,front+.037]);}
      frontOutline(hex.slice(0,6).map(([x,y])=>[side*.61+(x-side*.61)*1.20,.405+(y-.405)*1.25]),black,'temerario-front-intake-drl-socket',false);
      frontRing(hex.slice(0,6).map(([x,y])=>[x,y]),frontLight,'hexagonal-drl');
      const rearHex=[];
      for(let i=0;i<=6;i++){const a=i/6*Math.PI*2;rearHex.push([side*.59+Math.cos(a)*.14,.77+Math.sin(a)*.055,rear-.028]);}
      line(rearHex,.013,rearLight,'hexagonal-rear-led');
      panel([[side*.91,.42,-.46],[side*.93,.73,-.61],[side*.91,.84,-.99],[side*.91,.72,-1.04],[side*.90,.38,-.92],[side*.90,.33,-.70]],black,'temerario-wide-side-inlet');
      line([[side*.90,.40,-.46],[side*.93,.73,-.61],[side*.91,.84,-.99]],.015,paint,'temerario-intake-edge');
      bodyPatch([[side*.42,-.83],[side*.51,-.88],[side*.58,-1.67],[side*.47,-1.72]],carbon,'temerario-engine-cover-fin',.024);
    }
    exhaust(0,.74,rear-.05,.104,true,[1.7,.65]);
    bodyPatch([[-.42,-.70],[.42,-.70],[.56,-1.31],[.34,-1.99],[-.34,-1.99],[-.56,-1.31]],black,'temerario-engine-exposure',.010);
    bodyPatch([[-.75,rear+.15],[.75,rear+.15],[.79,rear+.38],[-.79,rear+.38]],paint,'temerario-integrated-rear-spoiler',.026);
    panel([[-.80,.27,rear],[.80,.27,rear],[.79,.71,rear],[.53,.77,rear],[.20,.74,rear],[-.20,.74,rear],[-.53,.77,rear],[-.79,.71,rear]],black,'temerario-rear-ventilated-fascia');
    for(const side of [-1,1]){
      const frame=panel([[side*.26,.71,rear],[side*.37,.67,rear],[side*.66,.37,rear],[side*.82,.30,rear],[side*.64,.31,rear],[side*.42,.54,rear]],paint,'temerario-lower-bumper-insert');
      frame.userData.fasciaOffset=.023;
    }
    panel([[-.79,.24,front],[.79,.24,front],[.75,.52,front],[.35,.55,front],[-.35,.55,front],[-.75,.52,front]],black,'temerario-front-intake');
    for(const x of [-.32,.32])box(.032,.29,.05,paint,x,.386,front,'temerario-front-intake-divider');
  }else if(vehicle==='porsche911turboS'){
    signatures.push('round-matrix-headlamps','turbo-side-inlets','active-rear-wing','992-light-bar');
    for(const side of [-1,1]){
      surfaceOptic(side*.66,front-.37,.165,.225,black,'turbo-s-round-optic');
      surfaceOptic(side*.66,front-.37,.145,.202,glass,'turbo-s-round-lens',.019);
      for(const x of [-.049,.049])for(const z of [-.072,.072])surfaceOptic(side*.66+x,front-.37+z,.023,.030,frontLight,'four-point-porsche-optic',.040);
      panel([[side*.91,.52,-.38],[side*.96,.80,-.73],[side*.88,.87,-1.15],[side*.80,.59,-1.07]],black,'turbo-s-side-air-inlet');
      line([[side*.92,.53,-.36],[side*.97,.80,-.71],[side*.89,.89,-1.16]],.019,paint,'turbo-s-intake-rim');
      box(.43,.14,.03,black,side*.53,.41,front+.023,'turbo-s-front-air-inlet');
      for(const x of [.45,.58])exhaust(side*x,.37,rear-.03,.048);
      box(.037,.070,.12,black,side*.48,bonnetHeight(side*.48,rear+.32)+.065,rear+.32,'active-wing-support');
    }
    bodyPatch([[-.75,rear+.15],[.75,rear+.15],[.76,rear+.43],[-.76,rear+.43]],paint,'turbo-s-active-wing',.102);
    line([[-.81,.74,rear+.075],[-.49,.76,rear-.02],[0,.765,rear-.035],[.49,.76,rear-.02],[.81,.74,rear+.075]],.014,rearLight,'992-turbo-s-rear-light-bar');
    for(let i=-7;i<=7;i++)bodyPatch([[i*.071-.011,-1.35],[i*.071+.011,-1.35],[i*.071+.011,-1.58],[i*.071-.011,-1.58]],black,'911-rear-engine-louvre',.014);
  }else if(vehicle==='amgSL63'){
    signatures.push('open-four-seat-roadster','panamericana-grille','triangular-front-led','quad-square-exhausts');
    panel([[-.61,.33,front+.028],[.61,.33,front+.028],[.50,.63,front+.025],[-.50,.63,front+.025]],black,'sl-panamericana-grille');
    for(let i=-8;i<=8;i++)box(.013,.24,.019,alloy,i*.060,.475,front+.046,'sl-vertical-grille-vane');
    for(const side of [-1,1]){
      const eye=[[side*.42,front-.12],[side*.70,front-.55],[side*.86,front-.58],[side*.84,front-.24],[side*.66,front-.11]];
      surfaceOutline(eye,black,'sl-triangular-optic-recess',.012);surfaceOutline(eye,glass,'sl-triangular-optic-lens',.020);
      surfaceLine([[side*.48,0,front-.17],[side*.70,0,front-.48],[side*.81,0,front-.46],[side*.76,0,front-.24]],.007,frontLight,'sl-triangular-optic');
      surfaceOptic(side*.66,front-.29,.024,.028,frontLight,'sl-projector',.030);
      panel([[side*.61,.27,front],[side*.86,.29,front],[side*.87,.52,front],[side*.67,.50,front]],black,'sl-front-outboard-air');
      line([[side*.44,.84,rear-.028],[side*.70,.87,rear+.012],[side*.82,.79,rear+.105],[side*.64,.77,rear-.010]],.015,rearLight,'sl-triangular-tail-led');
      for(const x of [.51,.65]){
        const z=shellDepth(side*x,.365,-1,.029);line([[side*(x-.04),.33,z],[side*(x+.04),.33,z],[side*(x+.04),.40,z],[side*(x-.04),.40,z],[side*(x-.04),.33,z]],.012,alloy,'sl-square-exhaust');
        box(.06,.047,.02,black,side*x,.365,z-.01,'sl-exhaust-interior');
      }
      for(let i=0;i<4;i++)box(.018,.09,.028,carbon,side*.91,.80,.94+i*.04,'sl-side-gill');
    }
    const badge=mesh(new THREE.TorusGeometry(.064,.008,5,24),alloy);badge.position.set(0,.48-baseY,front+.057);
    bodyPatch([[-.72,rear+.10],[.72,rear+.10],[.71,rear+.23],[-.71,rear+.23]],paint,'sl-trunk-lip',.022);
    panel([[-.82,.20,rear],[.82,.20,rear],[.79,.46,rear],[.53,.50,rear],[-.53,.50,rear],[-.79,.46,rear]],carbon,'sl-lower-bumper-insert');
  }else if(vehicle==='hondaPrelude'){
    signatures.push('slender-connected-front-led','long-hatchback-glass','full-width-rear-led','two-tone-roof');
    frontOutline([[-.82,.586],[-.82,.665],[.82,.665],[.82,.586]],black,'prelude-front-headlamp-housing-black-band',false);
    frontOutline([[-.80,.653],[.80,.653],[.80,.641],[-.80,.641]],frontLight,'prelude-front-headlamp-housing-light-line',false);
    for(const side of [-1,1]){
      frontOutline([[.54,.614],[.76,.618],[.76,.595],[.54,.591]].map(([x,y])=>[side*x,y]),frontLight,'prelude-front-headlamp-housing-projector',false);
      panel([[side*.25,.31,front+.018],[side*.73,.32,front-.08],[side*.65,.45,front-.03],[side*.24,.45,front+.022]],black,'prelude-front-aero-intake');
      line([[side*.38,.85,rear-.032],[side*.72,.85,rear+.01],[side*.83,.82,rear+.10]],.016,rearLight,'prelude-rear-corner-lamp');
      exhaust(side*.47,.32,rear-.015,.042);
    }
    box(1.11,.018,.026,rearLight,0,.85,rear-.035,'prelude-rear-connecting-led');
    box(.34,.13,.020,black,0,.61,rear-.032,'prelude-number-plate');
    bodyPatch([[-.70,rear+.10],[.70,rear+.10],[.68,rear+.25],[-.68,rear+.25]],carbon,'prelude-hatch-lip',.020);
    panel([[-.74,.22,rear],[.74,.22,rear],[.69,.43,rear],[.44,.46,rear],[-.44,.46,rear],[-.69,.43,rear]],black,'prelude-lower-bumper-insert');
  }else if(vehicle==='toyotaGR86'){
    signatures.push('gr86-c-shaped-headlamps','fender-air-outlets','duckbill-rear-spoiler','bracket-rear-leds');
    panel([[-.58,.28,front+.029],[.58,.28,front+.029],[.50,.46,front+.024],[-.50,.46,front+.024]],black,'gr86-front-mouth');
    for(const side of [-1,1]){
      const eye=[[side*.39,front-.12],[side*.63,front-.46],[side*.79,front-.56],[side*.83,front-.30],[side*.70,front-.12]];
      surfaceOutline(eye,black,'gr86-front-optic-recess',.013);surfaceOutline(eye,glass,'gr86-front-optic-lens',.022);
      surfaceLine([[side*.46,0,front-.17],[side*.66,0,front-.39],[side*.76,0,front-.45],[side*.77,0,front-.28]],.007,frontLight,'gr86-front-led-bracket');
      surfaceOptic(side*.66,front-.28,.026,.030,frontLight,'gr86-projector',.031);
      box(.029,.16,.30,black,side*.88,.72,.64,'gr86-front-fender-outlet');
      line([[side*.29,.76,rear-.025],[side*.61,.78,rear-.012],[side*.77,.73,rear+.10],[side*.63,.67,rear-.018]],.016,rearLight,'gr86-tail-light-bracket');
      exhaust(side*.53,.34,rear-.028,.053);
    }
    bodyPatch([[-.65,rear+.10],[.65,rear+.10],[.64,rear+.27],[-.64,rear+.27]],paint,'gr86-duckbill',.035);
    panel([[-.72,.19,rear],[.72,.19,rear],[.66,.42,rear],[.45,.46,rear],[-.45,.46,rear],[-.66,.42,rear]],carbon,'gr86-lower-bumper-insert');
    box(1.01,.013,.017,black,0,.78,rear-.04,'gr86-dark-lamp-bridge');
  }else if(vehicle==='mazdaMX5'){
    signatures.push('open-two-seat-roadster','small-almond-headlamps','round-tail-lights','short-kodo-hood');
    panel([[-.47,.27,front+.018],[.47,.27,front+.018],[.54,.45,front+.020],[0,.51,front+.022],[-.54,.45,front+.020]],black,'mx5-front-smile-grille');
    for(const side of [-1,1]){
      const eye=[[side*.40,front-.10],[side*.64,front-.35],[side*.75,front-.45],[side*.76,front-.29],[side*.58,front-.11]];
      surfaceOutline(eye,black,'mx5-almond-optic-recess',.012);surfaceOutline(eye,glass,'mx5-almond-optic-lens',.021);
      surfaceLine([[side*.45,0,front-.14],[side*.61,0,front-.28],[side*.71,0,front-.34]],.005,frontLight,'mx5-narrow-led');
      surfaceOptic(side*.56,front-.20,.028,.030,frontLight,'mx5-projector',.031);
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
      const eye=[[.43,.786],[.58,.835],[.85,.830],[.858,.744],[.63,.724],[.445,.747]];
      frontOutline(eye.map(([x,y])=>[side*x,y]),black,'m2-front-headlamp-housing',false);
      frontOutline(eye.map(([x,y])=>[side*x,y]),glass,'m2-front-headlamp-housing-lens',false);
      frontOutline([[.55,.799],[.565,.752],[.70,.752],[.735,.778],[.691,.769],[.584,.769],[.577,.800]].map(([x,y])=>[side*x,y]),frontLight,'m2-front-headlamp-housing-led',false);
      const projector=[];for(let i=0;i<12;i++){const a=i/12*Math.PI*2;projector.push([side*(.666+Math.cos(a)*.029),.783+Math.sin(a)*.026]);}
      frontOutline(projector,frontLight,'m2-front-headlamp-housing-projector',false);
      line([[side*.34,.87,rear-.023],[side*.66,.89,rear+.008],[side*.82,.81,rear+.10],[side*.70,.75,rear+.015]],.019,rearLight,'m2-bold-tail-light');
      for(const x of [.54,.68])exhaust(side*x,.36,rear-.03,.048);
      panel([[side*.74,.43,rear],[side*.87,.42,rear],[side*.87,.66,rear],[side*.77,.70,rear]],black,'m2-rear-outboard-reflector-surround');
    }
    bodyPatch([[-.72,rear+.10],[.72,rear+.10],[.70,rear+.23],[-.70,rear+.23]],carbon,'m2-trunk-spoiler',.025);
    panel([[-.85,.21,rear],[.85,.21,rear],[.80,.42,rear],[.52,.50,rear],[-.52,.50,rear],[-.80,.42,rear]],carbon,'m2-lower-bumper-insert');
  }else if(vehicle==='nissanZ'){
    signatures.push('240z-half-moon-headlamps','300zx-horizontal-tail-lights','rectangular-front-grille','contrasting-fastback-roof');
    box(1.17,.245,.037,black,0,.44,front+.02,'z-rectangular-grille');
    for(let i=0;i<6;i++)box(1.08,.009,.012,carbon,0,.335+i*.04,front+.048,'z-grille-horizontal');
    for(const side of [-1,1]){
      const eye=[[side*.44,front-.10],[side*.54,front-.38],[side*.73,front-.50],[side*.84,front-.35],[side*.77,front-.12]];
      surfaceOutline(eye,black,'z-240z-optic-recess',.013);surfaceOutline(eye,glass,'z-240z-optic-lens',.021);
      surfaceLine([[side*.50,0,front-.18],[side*.55,0,front-.32],[side*.67,0,front-.38],[side*.77,0,front-.32]],.007,frontLight,'240z-led-semicircle-upper');
      surfaceLine([[side*.52,0,front-.13],[side*.62,0,front-.19],[side*.75,0,front-.18]],.006,frontLight,'240z-led-semicircle-lower');
      surfaceOptic(side*.65,front-.27,.026,.030,frontLight,'240z-projector',.030);
      box(.56,.148,.025,black,side*.43,.78,rear-.017,'z32-tail-panel');
      for(let i=0;i<4;i++)box(.097,.030,.014,rearLight,side*(.225+i*.135),.81,rear-.035,'z32-horizontal-upper-led');
      for(let i=0;i<4;i++)box(.097,.026,.014,rearLight,side*(.225+i*.135),.75,rear-.035,'z32-horizontal-lower-led');
      exhaust(side*.55,.34,rear-.035,.053);
    }
    bodyPatch([[-.68,rear+.10],[.68,rear+.10],[.67,rear+.23],[-.67,rear+.23]],paint,'z-ducktail',.025);
    panel([[-.76,.20,rear],[.76,.20,rear],[.74,.42,rear],[.55,.53,rear],[.31,.52,rear],[-.31,.52,rear],[-.55,.53,rear],[-.74,.42,rear]],black,'z-lower-bumper-insert');
  }
  // Attach fascia details to the curved bumper rather than leaving rectangular
  // grille and vent cards floating in front of the rounded nose.
  for(const item of chassis.children.filter(node=>node.isMesh)){
    const sideDetail=/side-(?:intake|air|scoop|gill|strake|vent|blade)|sculpted-scoop|rear-quarter-air|front-wheel-air|flying-buttress|intake-(?:edge|flying|rim)|wide-side-inlet|fender-outlet|triangle-side/.test(item.name);
    const frontDetail=/front-(?:cooling|intake|air-inlet|mouth|aero|lower-cooling|headlamp-housing|outboard-air)|wide-mouth|panamericana|kidney|grille|square-bumper-intake|mustang-lamp-socket|three-module-front-led|mx5-front-smile|hexagonal-drl/.test(item.name)||(vehicle==='bmwX3'&&item.material===frontLight);
    const rearDetail=/number-plate|lower-bumper-insert|wide-recessed-lower-bumper|deep-rear-diffuser|recessed-lamp-band|recessed-bumper-vent|rear-outboard-reflector-surround|sculpted-diffuser-base|rear-ventilated-fascia/.test(item.name);
    if(!frontDetail&&!rearDetail&&!sideDetail)continue;
    if((item.geometry.type==='BufferGeometry'&&item.geometry.attributes.position.count<40)||item.geometry.type==='ShapeGeometry'){
      let positions=Array.from(item.geometry.attributes.position.array),indices=Array.from(item.geometry.index.array);
      const smallGrille=/vane|grille-bar|cooling-slat|horizontal-slat/.test(item.name);
      const passes=item.userData.fasciaSubdivisions??(item.geometry.type==='ShapeGeometry'?(item.name.includes('headlamp-housing')||item.material===frontLight?2:1):smallGrille?(mobile?1:2):(mobile&&vehicle==='bmwX3'?2:3));
      for(let pass=0;pass<passes;pass++){
        const next=[],midpoints=new Map();
        const midpoint=(a,b)=>{const key=`${Math.min(a,b)}:${Math.max(a,b)}`;if(midpoints.has(key))return midpoints.get(key);const index=positions.length/3;positions.push(...[0,1,2].map(axis=>mix(positions[a*3+axis],positions[b*3+axis],.5)));midpoints.set(key,index);return index;};
        for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);}
        indices=next;
      }
      const original=item.geometry;item.geometry=geometryFrom(positions,indices);original.dispose();
    }
    const direction=frontDetail?1:-1;
    item.geometry.computeBoundingBox();
    const attachmentWidth=item.geometry.boundingBox.max.x-item.geometry.boundingBox.min.x;
    if(!sideDetail&&!(mobile&&vehicle==='bmwX3')&&item.material!==paint&&!/vane|grille-bar|cooling-slat|horizontal-slat|divider/.test(item.name)&&(attachmentWidth>.65||(frontDetail&&item.material===black&&item.geometry.type==='BoxGeometry'&&attachmentWidth>.30)))item.geometry=refineSurfaceGeometry(item.geometry,mobile?.14:.105);
    const position=item.geometry.attributes.position;
    if(porscheOptics&&/911-wide-recessed-lower-bumper|911-recessed-bumper-vent/.test(item.name)){
      const [w]=sectionAt(shape.body,-1);
      for(let i=0;i<position.count;i++){const y=Math.max(position.getY(i)+baseY,bumperFloor(-1)+.012),t=clamp((bonnetHeight(position.getX(i),-halfLength)-y)/(bonnetHeight(position.getX(i),-halfLength)-bumperFloor(-1)),0,1),extent=w*halfWidth+.038*Math.sin(Math.PI*t)-.035*t*t-.018;position.setXYZ(i,clamp(position.getX(i),-extent,extent),y-baseY,position.getZ(i));}
    }
    item.updateMatrix();item.geometry.computeBoundingBox();const bounds=item.geometry.boundingBox.clone().applyMatrix4(item.matrix),transformed=new THREE.Vector3(),center=bounds.getCenter(new THREE.Vector3());
    const grid=[],headlamp=item.name.includes('headlamp-housing')||(vehicle==='bmwX3'&&item.material===frontLight),wide=bounds.max.x-bounds.min.x>.65,nx=wide?15:headlamp?11:7,ny=wide?9:headlamp?7:5;
    const fittedOffset=item.userData.fasciaOffset??(item.name.includes('kidney')?(item.material===black?.010:.032):/front-lower-cooling-(?:slat|divider)/.test(item.name)?.032:item.material===frontLight?.030:item.material===glass?.024:.017);
    if(!sideDetail)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)grid.push(shellDepth(mix(bounds.min.x,bounds.max.x,x/(nx-1)),mix(bounds.min.y,bounds.max.y,y/(ny-1))+baseY,direction,fittedOffset));
    const depth=(x,y)=>{
      const u=clamp((x-bounds.min.x)/(bounds.max.x-bounds.min.x||1),0,1)*(nx-1),v=clamp((y-bounds.min.y)/(bounds.max.y-bounds.min.y||1),0,1)*(ny-1),i=Math.min(nx-2,Math.floor(u)),j=Math.min(ny-2,Math.floor(v));
      return mix(mix(grid[j*nx+i],grid[j*nx+i+1],u-i),mix(grid[(j+1)*nx+i],grid[(j+1)*nx+i+1],u-i),v-j);
    };
    for(let i=0;i<position.count;i++){
      transformed.fromBufferAttribute(position,i).applyMatrix4(item.matrix);
      if(sideDetail){
        const side=Math.sign(center.x)||1;
        transformed.x=sideSurfaceX(side,transformed.z,transformed.y+baseY)+side*.008+(transformed.x-center.x)*.14;
        position.setXYZ(i,transformed.x,transformed.y,transformed.z);continue;
      }
      transformed.z=depth(transformed.x,transformed.y)+(transformed.z-center.z)*.08;
      position.setXYZ(i,transformed.x,transformed.y,transformed.z);
    }
    position.needsUpdate=true;item.geometry.computeVertexNormals();item.position.set(0,0,0);item.rotation.set(0,0,0);item.scale.set(1,1,1);
  }
  const finCount=midEngine||porscheOptics?7:['bmwX3','amgSL63','hondaPrelude','mazdaMX5','nissanZ','toyotaGR86'].includes(vehicle)?0:4;
  for(let i=0;i<finCount;i++){
    const x=(i-(finCount-1)/2)*.19,z=shellDepth(x,floor+.045,-1,-.072);
    const fin=box(.018,midEngine||porscheOptics?.065:.035,midEngine||porscheOptics?.15:.09,carbon,x,floor+.025,z,'rear-diffuser-fin');fin.rotation.x=-.08;
  }
  const oldTailParts=chassis.children.filter(node=>node.isMesh&&((node.material===rearLight&&!node.name.includes('bumper-reflector'))||['911-recessed-lamp-housing','revuelto-rear-y-lamp-socket','revuelto-rear-y-lower-socket','z32-tail-panel','gr86-dark-lamp-bridge'].includes(node.name)));
  const tailKit=addVehicleTailLights({vehicle,mobile,halfLength,halfWidth,baseY,chassis,mesh,material,rearLight,black,glass,paint,fasciaPoint:(x,y,offset=.014)=>[x,y-baseY,shellDepth(x,y,-1,offset)]});
  if(tailKit.lights)for(const item of oldTailParts){chassis.remove(item);item.geometry.dispose();}
  if(vehicle!=='bmwX3'){
    const oldPlates=chassis.children.filter(node=>node.isMesh&&/number-plate/.test(node.name));
    const rearPanels=chassis.children.filter(node=>node.isMesh&&/deep-rear-diffuser|rear-ventilated-fascia|lower-bumper-insert|wide-recessed-lower-bumper|sculpted-diffuser-base/.test(node.name)).map(node=>{
      node.updateMatrix();const view=new THREE.Mesh(node.geometry,node.material);
      view.matrix.copy(node.matrix);view.matrixAutoUpdate=false;view.updateMatrixWorld(true);return view;
    });
    const rearDetailPoint=(x,y,offset=0)=>{
      attachmentRay.set(new THREE.Vector3(x,y-baseY,-halfLength-1),attachmentDirection.set(0,0,1));
      const hit=attachmentRay.intersectObjects(rearPanels,false)[0];
      // Lettering and the plate belong on the outer bumper insert when that
      // insert covers the painted shell, rather than disappearing behind it.
      const z=Math.min(shellDepth(x,y,-1,0),hit?.point.z??Infinity);
      return[x,y-baseY,z-offset];
    };
    addVehicleRearDetails({vehicle,mobile,baseY,chassis,mesh,material,black,fasciaPoint:rearDetailPoint,registerTexture:texture=>textures.add(texture)});
    for(const item of oldPlates){chassis.remove(item);item.geometry.dispose();}
  }
  for(const surface of attachmentSurfaces.values())surface.geometry.dispose();
  // Four independently steered/spinning wheel assemblies. Disc and caliper stay
  // attached to the upright while the tyre, spokes and rim rotate around x.
  const wheels=[];
  for(const [z,frontAxle] of [[frontZ,true],[rearZ,false]])for(const side of [-1,1]){
    const tyreWidth=shape.wheelWidth[frontAxle?0:1],radius=axleRadius(z),rimRadius=shape.rimRadii?.[frontAxle?0:1]||shape.rimRadius||radius-.083;
    const wheelX=side*(shape.track?shape.track[frontAxle?0:1]/2:halfWidth-tyreWidth*.5+.006),pivot=new THREE.Group(),spin=new THREE.Group();
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
      const angle=i/shape.spokes*Math.PI*2,split=(shape.spokes===5&&!shape.singleSpokes)||shape.splitSpokes;
      for(const offset of split?[-.065,.065]:[0]){
        const a=angle+offset,spokeVerts=[],spokeFaces=[];
        const sections=vehicle==='bmwX3'?[[.045,.046,.30],[.12,.033,.32],[rimRadius*.75,.027,.37],[rimRadius-.012,.036,.43]]:[[.045,.035,.30],[.10,.027,.31],[rimRadius*.72,.021,.37],[rimRadius-.012,.027,.43]];
        for(const [r,w,depth] of sections){
          // Chamfered octagonal cross-sections catch a narrow highlight, while
          // the centre sits behind the outer lip like a real dished forging.
          const cross=[[-.010,-w*.32],[-.006,-w*.50],[.006,-w*.50],[.010,-w*.32],[.010,w*.32],[.006,w*.50],[-.006,w*.50],[-.010,w*.32]];
          const spokeAngle=split?angle+Math.sign(offset)*mix(.005,vehicle==='bmwX3'?.19:shape.splitAngle||.14,clamp((r-.045)/(rimRadius-.057),0,1)):a;
          for(const [x,y] of cross)spokeVerts.push(side*(tyreWidth*depth+x),y*Math.cos(spokeAngle)+r*Math.sin(spokeAngle),r*Math.cos(spokeAngle)-y*Math.sin(spokeAngle));
        }
        for(let k=1;k<sections.length;k++)for(let j=0;j<8;j++){const b=k*8+j,c=k*8+(j+1)%8,d=b-8,e=c-8;spokeFaces.push(b,d,c,c,d,e);}
        for(let j=1;j<7;j++)spokeFaces.push(0,j+1,j,24,24+j,24+j+1);
        const winding=side>0?spokeFaces:spokeFaces.flatMap((_,i,a)=>i%3===0?[a[i],a[i+2],a[i+1]]:[]);
        mesh(geometryFrom(spokeVerts,winding),alloy,spin,'dished-chamfered-forged-spoke');
        if(vehicle==='bmwX3'){
          const face=[];for(const [r,depth]of [[rimRadius*.59,.35],[rimRadius-.014,.43]])for(const edge of [-1,1]){const theta=angle+Math.sign(offset)*mix(.005,.19,clamp((r-.045)/(rimRadius-.057),0,1));face.push(side*(tyreWidth*depth+.011),r*Math.sin(theta)+edge*.004*Math.cos(theta),r*Math.cos(theta)-edge*.004*Math.sin(theta));}
          mesh(geometryFrom(face,side>0?[0,2,1,1,2,3]:[0,1,2,1,3,2]),polished,spin,'x3-machined-split-spoke-face');
        }
      }
    }
    const discRadius=vehicle==='bmwX3'?(frontAxle?.20:.185):rimRadius*.81,discDepth=vehicle==='bmwX3'?.20:.31;
    const disc=mesh(new THREE.CylinderGeometry(discRadius,discRadius,.014,36),brake,pivot,'brake-rotor');disc.rotation.z=Math.PI/2;disc.position.x=side*tyreWidth*discDepth;
    const pad=mesh(new THREE.BoxGeometry(.075,.128,.07),caliper,pivot,'fixed-brake-caliper');pad.position.set(side*tyreWidth*.33,.075,-rimRadius*.70);
    const hubX=side*tyreWidth*.31;
    const hub=mesh(new THREE.CylinderGeometry(.047,.052,.027,20),carbon,spin,'recessed-wheel-hub');hub.rotation.z=Math.PI/2;hub.position.x=hubX;
    const hubRing=mesh(new THREE.TorusGeometry(.047,.004,5,24),polished,spin,'wheel-hub-machining');hubRing.rotation.y=Math.PI/2;hubRing.position.x=hubX+side*.015;
    if(vehicle!=='porsche911gt3rs')for(let i=0;i<5;i++){
      const a=i/5*Math.PI*2,bolt=mesh(new THREE.CylinderGeometry(.007,.007,.012,6),polished,spin,'wheel-lug');bolt.rotation.z=Math.PI/2;bolt.position.set(hubX+side*.015,Math.sin(a)*.029,Math.cos(a)*.029);
    }
    for(let i=0;i<24;i++){
      const a=i/24*Math.PI*2,hole=mesh(new THREE.CircleGeometry(.006,5),black,pivot,'drilled-disc');hole.rotation.y=side*Math.PI/2;hole.position.set(side*tyreWidth*(discDepth+.009),Math.sin(a)*rimRadius*.68,Math.cos(a)*rimRadius*.68);
    }
    for(let i=0;i<(mobile?20:32);i++){
      const a=i/(mobile?20:32)*Math.PI*2;
      for(const x of [-tyreWidth*.24,tyreWidth*.24]){
        const groove=mesh(new THREE.BoxGeometry(.004,.0015,.042),black,spin,'tread-groove');groove.position.set(x,Math.sin(a)*(radius+.0005),Math.cos(a)*(radius+.0005));groove.rotation.x=-a-Math.PI/2;
      }
    }
    batchStatic(spin);batchStatic(pivot);
    wheels.push({pivot,spin,front:frontAxle,radius,spinAngle:0});
  }
  // Body occlusion is soft; the four tyre patches stay darker at the road.
  // This single generated texture also grounds the car when sun shadows are off.
  const shadowWidth=width*1.28,shadowLength=length*1.13;
  const data=new Uint8Array(64*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<64;x++){
    const px=(x/63-.5)*shadowWidth,pz=(.5-y/127)*shadowLength,index=(y*64+x)*4;
    const body=.42*Math.exp(-((px/(width*.36))**4+(pz/(length*.41))**4)*1.5);
    let darkness=body;
    for(const [z,frontAxle] of [[frontZ,true],[rearZ,false]])for(const side of [-1,1]){
      const tyreWidth=shape.wheelWidth[frontAxle?0:1],wheelX=side*(shape.track?shape.track[frontAxle?0:1]/2:halfWidth-tyreWidth*.5+.006);
      const contact=.83*Math.exp(-(((px-wheelX)/(tyreWidth*.70))**2+((pz-z)/(axleRadius(z)*.46))**2)*1.7);
      darkness=1-(1-darkness)*(1-contact);
    }
    const edge=clamp(Math.min(x,63-x,y,127-y)/3,0,1);
    data[index+3]=Math.round(darkness*edge*255);
  }
  const shadowTexture=new THREE.DataTexture(data,64,128);shadowTexture.needsUpdate=true;shadowTexture.minFilter=shadowTexture.magFilter=THREE.LinearFilter;textures.add(shadowTexture);
  const shadowMat=material('contact-shadow',THREE.MeshBasicMaterial,{map:shadowTexture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const shadow=mesh(new THREE.PlaneGeometry(shadowWidth,shadowLength),shadowMat,group,'contact-shadow');shadow.rotation.x=-Math.PI/2;shadow.position.y=.008;shadow.renderOrder=1;shadow.castShadow=shadow.receiveShadow=false;
  if(!inspectParts)batchStatic(chassis);
  let triangles=0;group.traverse(node=>{if(node.isMesh)triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;});
  group.userData.model={name:preset.name,author:'APEX project',license:'Original procedural game artwork',source:preset.source,...spec,openTop:!!shape.open,wheelRadius:shape.radius,triangles:Math.round(triangles),signatures};
  let steer=0,pitch=0,roll=0,disposed=false;
  return{
    group,dimensions:spec,
    setPaint(color){
      paint.color.set(color);
      const luminance=paint.color.r*.2126+paint.color.g*.7152+paint.color.b*.0722;
      paint.metalness=luminance>.5?.08:.16;paint.roughness=luminance>.5?.30:.27;
      paint.clearcoat=1;paint.clearcoatRoughness=.065;
    },
    update(state={},dt=1/60){
      const step=clamp(Number.isFinite(dt)?dt:0,0,.1),speed=(Number.isFinite(state.speed)?state.speed:0)*(state.reverse?-1:1);
      const actual=Number.isFinite(state.steeringAngle)?state.steeringAngle:state.steerAngle;
      const target=Number.isFinite(actual)?clamp(actual,-.55,.55):clamp(state.steering||0,-1,1)*.42;
      steer=THREE.MathUtils.damp(steer,target,13,step);
      for(const wheel of wheels){wheel.pivot.rotation.y=wheel.front?steer:0;wheel.spinAngle=(wheel.spinAngle-speed*step/wheel.radius)%(Math.PI*2);wheel.spin.rotation.x=wheel.spinAngle;}
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
