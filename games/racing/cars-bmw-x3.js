import * as THREE from './vendor/three.module.js';
import { mergeGeometries, mergeVertices } from './vendor/addons/utils/BufferGeometryUtils.js';

// Original G45 M50 game geometry, drawn from BMW's launch photographs and
// dimensional drawing. These surfaces do not reuse the generic SUV body.
export const BMW_X3_DIMENSIONS = Object.freeze({ length: 4.755, width: 1.920, height: 1.660, wheelbase: 2.865 });
export const BMW_X3_RUNNING_GEAR = Object.freeze({ frontZ: 1.4975, rearZ: -1.3675, frontTrack: 1.622, rearTrack: 1.623, frontRadius: .3687, rearRadius: .36645, rimRadius: .2667, frontWidth: .255, rearWidth: .285 });
const mix = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const baseY = .46;
const halfLength = BMW_X3_DIMENSIONS.length / 2;
const halfWidth = BMW_X3_DIMENSIONS.width / 2;
const smooth = t => { const v = clamp(t, 0, 1); return v * v * (3 - 2 * v); };
const gaussian = (x, mean, scale) => Math.exp(-(((x - mean) / scale) ** 2));
const V = (x, y, z) => new THREE.Vector3(x, y - baseY, z);

// Interpolated stations use physical metres; the side shoulder, waist and sill
// are independent bands, rather than one flat wall from tyre to window.
const sideStations = [
  [-2.3775,.928,1.255],[-2.18,.945,1.260],[-1.70,.960,1.260],
  [-1.3675,.960,1.248],[-.95,.935,1.232],[-.25,.922,1.215],
  [.50,.924,1.200],[.98,.942,1.190],[1.4975,.960,1.180],
  [1.92,.945,1.170],[2.18,.942,1.178],[2.3775,.940,1.167],
];
const roofStations = [[-2.295,1.270,.787],[-1.88,1.590,.710],[-1.67,1.623,.720],[-1.25,1.646,.721],[-.40,1.660,.723],[.27,1.639,.712],[.49,1.598,.687],[.99,1.190,.827]];
function stationValue(stations, z, column) {
  if (z <= stations[0][0]) return stations[0][column];
  for (let i = 1; i < stations.length; i++) if (z <= stations[i][0]) {
    const a = stations[i - 1], b = stations[i], t = (z - a[0]) / (b[0] - a[0]);
    const previous = stations[Math.max(0, i - 2)], next = stations[Math.min(stations.length - 1, i + 1)];
    const m0 = (b[column] - previous[column]) / (b[0] - previous[0]);
    const m1 = (next[column] - a[column]) / (next[0] - a[0]);
    const h = b[0] - a[0], t2 = t * t, t3 = t2 * t;
    return (2*t3-3*t2+1)*a[column] + (t3-2*t2+t)*h*m0 + (-2*t3+3*t2)*b[column] + (t3-t2)*h*m1;
  }
  return stations.at(-1)[column];
}
function beltHeight(z) { return stationValue(sideStations, z, 2); }
function sideX(z, y) {
  const shoulder = stationValue(sideStations, z, 1), belt = beltHeight(z);
  const wheelBulge = Math.max(gaussian(z, BMW_X3_RUNNING_GEAR.frontZ, .57), gaussian(z, BMW_X3_RUNNING_GEAR.rearZ, .61));
  const waist=.028+.075*gaussian(y,.75,.25)-.022*gaussian(y,1.06,.13);
  const shoulderT=clamp((y-belt+.125)/.125,0,1),shoulderRoll=.066*(1-Math.sqrt(Math.max(0,1-shoulderT*shoulderT)));
  const shell=shoulder-waist*(1-wheelBulge*.92)-shoulderRoll-.013*gaussian(z,-.05,.9)*gaussian(y,.72,.21)-.012*gaussian(z,-.05,.9)*gaussian(y,.52,.10);
  if(z>2.02){
    const frontWidth=stationValue([[.285,.802],[.322,.886],[.495,.935],[.910,.940],[1.167,.922]],y,1);
    return mix(shell,frontWidth,smooth((z-2.02)/.3575));
  }
  if(z< -2.01){
    return mix(shell,rearWidth(y),smooth((-z-2.01)/.3675));
  }
  return shell;
}
function archHeight(z, axle) {
  const r = axle > 0 ? BMW_X3_RUNNING_GEAR.frontRadius : BMW_X3_RUNNING_GEAR.rearRadius;
  const dz = Math.abs(z - axle), longitudinal = .445;
  if (dz >= longitudinal) return .285;
  return Math.max(.285, r + .445 * (1 - (dz / longitudinal) ** 2.55) ** (1 / 2.55));
}
function lowerSide(z) { return Math.max(.285, archHeight(z, BMW_X3_RUNNING_GEAR.frontZ), archHeight(z, BMW_X3_RUNNING_GEAR.rearZ)); }
function bonnetHeight(x, z) {
  const t = clamp((z - .96) / (halfLength - .96), 0, 1), u = Math.abs(x) / Math.max(.1, sideX(z, beltHeight(z)));
  const centre = mix(1.215, 1.125, smooth(t));
  const outer = beltHeight(z);
  const power = smooth(clamp((u - .45) / .55, 0, 1));
  const front=stationValue([[0,1.125],[.511,1.117],[.773,1.176],[.922,1.167]],Math.abs(x),1);
  return mix(mix(centre,outer,power)+.016*gaussian(u,.39,.11)*Math.sin(t*Math.PI),front,smooth((z-2.13)/.2475));
}
function bodyTop(x, z) {
  if (z >= .96) return bonnetHeight(x, z);
  const width = sideX(z, beltHeight(z)), u = Math.abs(x) / width;
  return beltHeight(z) - .025 * (1 - u * u);
}
function frontWidth(y) { return stationValue([[.285,.802],[.322,.886],[.495,.935],[.910,.940],[1.167,.922]],y,1); }
function rearWidth(y) { return stationValue([[.285,.843],[.357,.918],[.681,.954],[1.121,.960],[1.228,.950],[1.255,.895]],y,1); }
function roundCorner(x,width,radius,depth) {
  const t=clamp((Math.abs(x)-width+radius)/radius,0,1);
  return depth*(1-Math.sqrt(Math.max(0,1-t*t)));
}
function frontPoint(x, y, depth = 0) {
  const wrap=roundCorner(x,frontWidth(y),.235,.225);
  const profile = .022 * gaussian(y, .43, .17) - .031 * gaussian(y, .81, .18) - .018 * gaussian(y, 1.16, .10);
  return [x, y, halfLength - wrap + profile + depth];
}
function rearPoint(x, y, depth = 0) {
  const wrap=roundCorner(x,rearWidth(y),.265,.255);
  const shoulder = -.020 * gaussian(y, 1.11, .13);
  const lowerTaper = .092 * (1 - smooth((y - .53) / .41));
  const plateY=smooth((y-.548)/.064)*(1-smooth((y-.796)/.071)),plateX=1-smooth((Math.abs(x)-.28)/.28);
  const plateInset=.082*plateY*plateX;
  return [x, y, -halfLength + wrap + shoulder + lowerTaper + plateInset - depth];
}
function canopySide(z, y, side, offset = 0) {
  const top = stationValue(roofStations, z, 1), roofWidth = stationValue(roofStations, z, 2);
  const bottom = beltHeight(z), lowerWidth = sideX(z, bottom), t = clamp((y-bottom)/(top-bottom || .01), 0, 1);
  const x = mix(lowerWidth, roofWidth, t) + .009 * Math.sin(t * Math.PI);
  const rearWrap=smooth((-z-1.68)/.6975)*(rearPoint(rearWidth(y),y)[2]+halfLength)*(1-smooth(t));
  return [side * (x + offset), y, z+rearWrap];
}
function glassPlane(x, t, rear, offset = 0) {
  const u = Math.abs(x) / (rear ? mix(.700,.789,t) : mix(.673,.811,t));
  const y = rear ? mix(1.580,1.270,t) : mix(1.593,1.220,t);
  const z = rear ? mix(-1.889,-2.295,t) : mix(.495,.978,t);
  return [x, y + offset, z + (rear ? -1 : 1) * (.018 * (1-u*u) * Math.sin(t*Math.PI) + offset)];
}
function rounded(points, radius = .015, steps = 3) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i], before = points[(i+points.length-1)%points.length], after = points[(i+1)%points.length];
    const a = Math.hypot(before[0]-p[0], before[1]-p[1]), b = Math.hypot(after[0]-p[0],after[1]-p[1]);
    const k0 = Math.min(.24, radius / a), k1 = Math.min(.24, radius / b);
    const start = [mix(p[0],before[0],k0),mix(p[1],before[1],k0)], end = [mix(p[0],after[0],k1),mix(p[1],after[1],k1)];
    for (let j=0;j<=steps;j++) { const t=j/steps; out.push([(1-t)**2*start[0]+2*(1-t)*t*p[0]+t*t*end[0],(1-t)**2*start[1]+2*(1-t)*t*p[1]+t*t*end[1]]); }
  }
  return out;
}
function scaled(points, scale) {
  const centre = points.reduce((s,p)=>[s[0]+p[0]/points.length,s[1]+p[1]/points.length],[0,0]);
  return points.map(p=>[mix(centre[0],p[0],scale),mix(centre[1],p[1],scale)]);
}
function surfaceGeometry(outline, holes, project, edge, direction, matchBoundary=false) {
  const path = points => { const result = new THREE.Path(); result.moveTo(...points[0]); for(const p of points.slice(1))result.lineTo(...p); result.closePath(); return result; };
  const shape = new THREE.Shape(); shape.moveTo(...outline[0]); for(const p of outline.slice(1))shape.lineTo(...p); shape.closePath();
  for(const hole of holes)shape.holes.push(path(hole));
  const planar = new THREE.ShapeGeometry(shape), p=planar.getAttribute('position'), indexes=planar.index?.array||Array.from({length:p.count},(_,i)=>i), vertices=[],normals=[],faces=[];
  const point = i=>[p.getX(i),p.getY(i)];
  // End caps share the side/top grids' exact 3D edge. Projecting new points on
  // a curved 2D outline would bow the cap away from its neighbour and open a
  // visible triangular hole at a tightly rolled fender corner.
  const position = q => {
    if(matchBoundary)for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
      const t=((q[0]-a[0])*dx+(q[1]-a[1])*dy)/length2;
      if(t>=-.00001&&t<=1.00001&&Math.abs((q[0]-a[0])*dy-(q[1]-a[1])*dx)<.00000005){const pa=project(...a),pb=project(...b);return pa.map((v,j)=>mix(v,pb[j],clamp(t,0,1)));}
    }
    return project(...q);
  };
  function split(a,b,c,level) {
    const lengths=[Math.hypot(a[0]-b[0],a[1]-b[1]),Math.hypot(b[0]-c[0],b[1]-c[1]),Math.hypot(c[0]-a[0],c[1]-a[1])];
    const longest=Math.max(...lengths),target=typeof edge==='function'?edge((a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3):edge;
    if(longest>target&&level<12){
      const k=lengths.indexOf(longest), list=[a,b,c], first=list[k],second=list[(k+1)%3],third=list[(k+2)%3], middle=[(first[0]+second[0])/2,(first[1]+second[1])/2];
      split(first,middle,third,level+1);split(middle,second,third,level+1);return;
    }
    const params=[a,b,c],points=params.map(position);
    const va=new THREE.Vector3(...points[0]),vb=new THREE.Vector3(...points[1]),vc=new THREE.Vector3(...points[2]);
    if(vb.sub(va).cross(vc.sub(va)).dot(direction)<0){[points[1],points[2]]=[points[2],points[1]];[params[1],params[2]]=[params[2],params[1]];}
    const begin=vertices.length/3;for(let i=0;i<3;i++){
      const v=points[i],q=params[i],h=.0001;
      const du=new THREE.Vector3(...project(q[0]+h,q[1])).sub(new THREE.Vector3(...project(q[0]-h,q[1])));
      const dv=new THREE.Vector3(...project(q[0],q[1]+h)).sub(new THREE.Vector3(...project(q[0],q[1]-h)));
      const normal=du.cross(dv).normalize();if(normal.dot(direction)<0)normal.negate();
      vertices.push(v[0],v[1]-baseY,v[2]);normals.push(...normal.toArray());
    }faces.push(begin,begin+1,begin+2);
  }
  for(let i=0;i<indexes.length;i+=3)split(point(indexes[i]),point(indexes[i+1]),point(indexes[i+2]),0);
  planar.dispose();const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));raw.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));raw.setIndex(faces);
  const geometry=mergeVertices(raw,.000002);raw.dispose();return geometry;
}
function gridGeometry(columns,rows,project,direction) {
  const vertices=[],normals=[],faces=[];
  for(let j=0;j<=rows;j++)for(let i=0;i<=columns;i++){
    const u=i/columns,v=j/rows,p=project(u,v),h=.0001;
    const du=new THREE.Vector3(...project(u+h,v)).sub(new THREE.Vector3(...project(u-h,v)));
    const dv=new THREE.Vector3(...project(u,v+h)).sub(new THREE.Vector3(...project(u,v-h)));
    const normal=du.cross(dv).normalize();if(normal.dot(direction)<0)normal.negate();
    vertices.push(p[0],p[1]-baseY,p[2]);normals.push(...normal.toArray());
  }
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const a=j*(columns+1)+i,b=a+1,c=a+columns+1,d=c+1;
    const p=index=>new THREE.Vector3(...vertices.slice(index*3,index*3+3));
    const normal=p(b).sub(p(a)).cross(p(c).sub(p(a)));
    if(normal.dot(direction)>=0)faces.push(a,b,c,b,d,c);else faces.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setIndex(faces);return geometry;
}
function joinShoulderNormals(geometry, sidePanel) {
  const position=geometry.attributes.position,normals=geometry.attributes.normal;
  for(let i=0;i<position.count;i++){
    const z=position.getZ(i);if(Math.abs(z)>1.65)continue;
    const width=sideX(z,beltHeight(z)),distance=sidePanel?beltHeight(z)-(position.getY(i)+baseY):width-Math.abs(position.getX(i));
    if(distance<-.00001||distance>.045)continue;
    const slope=(beltHeight(z+.0001)-beltHeight(z-.0001))/.0002,target=new THREE.Vector3(0,1,-slope).normalize(),normal=new THREE.Vector3().fromBufferAttribute(normals,i).lerp(target,1-smooth(distance/.045)).normalize();
    normals.setXYZ(i,normal.x,normal.y,normal.z);
  }
  return geometry;
}

function mirroredFrontGeometry(geometry) {
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),indices=geometry.index.array,vertices=[],normals=[];
  const vertex=i=>({p:[position.getX(i),position.getY(i),position.getZ(i)],n:[normal.getX(i),normal.getY(i),normal.getZ(i)]});
  for(let i=0;i<indices.length;i+=3){
    const input=[vertex(indices[i]),vertex(indices[i+1]),vertex(indices[i+2])],polygon=[];
    for(let j=0;j<3;j++){
      const a=input[j],b=input[(j+1)%3],inside=a.p[0]>=0,nextInside=b.p[0]>=0;
      if(inside)polygon.push(a);
      if(inside!==nextInside){const t=a.p[0]/(a.p[0]-b.p[0]),n=new THREE.Vector3(...a.n.map((v,k)=>mix(v,b.n[k],t))).normalize();polygon.push({p:[0,mix(a.p[1],b.p[1],t),mix(a.p[2],b.p[2],t)],n:n.toArray()});}
    }
    for(let j=1;j<polygon.length-1;j++){
      const triangle=[polygon[0],polygon[j],polygon[j+1]];
      for(const side of[1,-1])for(const v of side===1?triangle:[triangle[0],triangle[2],triangle[1]]){vertices.push(side*v.p[0],v.p[1],v.p[2]);normals.push(side*v.n[0],v.n[1],v.n[2]);}
    }
  }
  const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));raw.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));raw.setIndex(Array.from({length:vertices.length/3},(_,i)=>i));
  const result=mergeVertices(raw,.000002);raw.dispose();return result;
}

/** Selected-car constructor; no image downloads, renderer or sound side effects. */
export function createBMWX3({ mobile=false, inspectParts=false }={}) {
  const group=new THREE.Group();group.name='BMW X3 M50 xDrive';
  const chassis=new THREE.Group();chassis.name='suspension-response';chassis.position.y=baseY;group.add(chassis);
  const resources={geometries:new Set(),materials:new Set(),textures:new Set()}, wheels=[];
  const material=(name,Type,values)=>{const m=new Type(values);m.name=name;resources.materials.add(m);return m;};
  const paint=material('body-paint',THREE.MeshPhysicalMaterial,{color:'#c7cac8',metalness:.10,roughness:.28,clearcoat:1,clearcoatRoughness:.055});
  const black=material('gloss-black-trim',THREE.MeshPhysicalMaterial,{color:'#101317',roughness:.21,metalness:.14,clearcoat:.7,clearcoatRoughness:.10});
  const dark=material('recessed-air-intake',THREE.MeshStandardMaterial,{color:'#090b0d',roughness:.85,metalness:.04});
  const rubber=material('tyre',THREE.MeshStandardMaterial,{color:'#131618',roughness:.96});
  const alloy=material('forged-alloy',THREE.MeshStandardMaterial,{color:'#242b31',metalness:.83,roughness:.24});
  const machined=material('1037m-machined-face',THREE.MeshStandardMaterial,{color:'#9babb4',metalness:.86,roughness:.20});
  const discMetal=material('ventilated-brake-steel',THREE.MeshStandardMaterial,{color:'#474c50',metalness:.72,roughness:.42});
  const lens=material('front-smoked-lens',THREE.MeshPhysicalMaterial,{color:'#121b24',metalness:.04,roughness:.09,clearcoat:1,clearcoatRoughness:.035});
  const glass=material('tinted-glass',THREE.MeshPhysicalMaterial,{color:'#24313a',roughness:.08,metalness:0,clearcoat:1,clearcoatRoughness:.025,depthWrite:true,side:THREE.DoubleSide,envMapIntensity:1.3});
  const rearGlass=material('privacy-glass',THREE.MeshPhysicalMaterial,{color:'#101b24',roughness:.07,metalness:0,clearcoat:1,clearcoatRoughness:.025,side:THREE.DoubleSide,envMapIntensity:1.15});
  const tailLens=material('moulded-red-tail-lens',THREE.MeshPhysicalMaterial,{color:'#401017',roughness:.14,metalness:.02,clearcoat:1,clearcoatRoughness:.035});
  const whiteLED=material('led-headlamp',THREE.MeshStandardMaterial,{color:'#f2f4ee',emissive:'#dcefff',emissiveIntensity:1.3,roughness:.28});
  const redLED=material('led-brakelamp',THREE.MeshStandardMaterial,{color:'#b60e1b',emissive:'#ea1420',emissiveIntensity:.5,roughness:.26});
  const caliper=material('m-sport-red-caliper',THREE.MeshStandardMaterial,{color:'#b51421',metalness:.35,roughness:.33});
  const plate=material('apex-plate',THREE.MeshStandardMaterial,{color:'#ebe9dc',roughness:.66});
  const blue=material('roundel-blue',THREE.MeshStandardMaterial,{color:'#258bcd',metalness:.2,roughness:.3});
  const cabin=material('dark-interior',THREE.MeshStandardMaterial,{color:'#161d24',roughness:.75});
  const mesh=(geometry,mat,parent=chassis,name='')=>{resources.geometries.add(geometry);const node=new THREE.Mesh(geometry,mat);node.name=name;node.castShadow=!(mat===whiteLED||mat===redLED||mat===tailLens||mat===lens);node.receiveShadow=true;parent.add(node);return node;};
  const edge=mobile?.073:.049;
  const surface=(outline,mat,project,name,holes=[],direction=new THREE.Vector3(0,0,1),detail=edge,matchBoundary=false)=>mesh(surfaceGeometry(outline,holes,project,typeof detail==='function'?(x,y)=>detail(x,y)*(mobile?2.70:2.05):detail*(mobile?2.70:2.05),direction,matchBoundary),mat,chassis,name);
  const box=(w,h,d,mat,x,y,z,name,parent=chassis)=>{const node=mesh(new THREE.BoxGeometry(w,h,d),mat,parent,name);node.position.set(x,y-(parent===chassis?baseY:0),z);return node;};
  function line(points,r,mat,name,parent=chassis,segments=mobile?4:6) {
    const vectors=points.map(p=>parent===chassis?V(...p):new THREE.Vector3(...p));
    const path=new THREE.CurvePath();for(let i=1;i<vectors.length;i++)path.add(new THREE.LineCurve3(vectors[i-1],vectors[i]));
    const node=mesh(new THREE.TubeGeometry(path,Math.max(2,points.length),r,segments,false),mat,parent,name);if(r<.010)node.castShadow=false;return node;
  }
  const frontDir=new THREE.Vector3(0,0,1),rearDir=new THREE.Vector3(0,0,-1);
  const kidney=rounded([[.018,1.049],[.114,1.105],[.400,1.102],[.511,1.031],[.512,.824],[.444,.706],[.126,.697],[.026,.775]],.035,4);
  const eyes=rounded([[.477,1.105],[.773,1.176],[.916,1.165],[.914,1.050],[.826,1.004],[.597,1.032]],.018,3);
  const intake=rounded([[-.765,.342],[.765,.342],[.817,.594],[.734,.694],[.502,.847],[-.502,.847],[-.734,.694],[-.817,.594]],.026,3);
  const curtain=rounded([[.803,.365],[.894,.386],[.887,.702],[.851,.754],[.795,.678]],.011,3);
  const frontOutline=[],sideRows=mobile?15:24,bonnetColumns=mobile?32:36;
  for(let i=0;i<=sideRows;i++){const y=mix(.285,1.167,Math.sin(i/sideRows*Math.PI/2));frontOutline.push([-frontWidth(y),y]);}
  for(let i=1;i<=bonnetColumns;i++){const x=mix(-.922,.922,i/bonnetColumns);frontOutline.push([x,bonnetHeight(x,halfLength)]);}
  for(let i=sideRows-1;i>=0;i--){const y=mix(.285,1.167,Math.sin(i/sideRows*Math.PI/2));frontOutline.push([frontWidth(y),y]);}
  // The kidneys and cooling mouth share one black surround. One union cutout
  // avoids overlapping holes, which would produce spurious painted triangles.
  const coolingCut=rounded([[-.765,.342],[.765,.342],[.817,.594],[.734,.694],[.512,.832],[.512,1.031],[.400,1.102],[.114,1.105],[.018,1.049],[-.018,1.049],[-.114,1.105],[-.400,1.102],[-.512,1.031],[-.512,.832],[-.734,.694],[-.817,.594]],.016,3);
  const frontHoles=[coolingCut];for(const s of[-1,1])for(const p of[eyes,curtain])frontHoles.push(p.map(([x,y])=>[s*x,y]));
  const frontCap=surface(frontOutline,paint,(x,y)=>frontPoint(x,y),'g45-sculpted-front-fascia',frontHoles,frontDir,edge,true);
  const symmetricFront=mirroredFrontGeometry(frontCap.geometry);resources.geometries.delete(frontCap.geometry);frontCap.geometry.dispose();frontCap.geometry=symmetricFront;resources.geometries.add(symmetricFront);
  // Matching front section is curved back around the fenders, including the
  // bonnet's raised inner creases and its rolled front corners.
  mesh(gridGeometry(mobile?32:36,mobile?30:40,(u,v)=>{
    const z=mix(.98,halfLength,v),w=sideX(z,beltHeight(z)),x=(u*2-1)*w;
    const endX=(u*2-1)*sideX(halfLength,beltHeight(halfLength)),endY=bonnetHeight(endX,halfLength),endpoint=frontPoint(endX,endY);
    return[x,bonnetHeight(x,z)+.004,z-(halfLength-endpoint[2])*smooth((z-1.62)/.7575)];
  },new THREE.Vector3(0,1,0)),paint,chassis,'g45-compound-bonnet');
  mesh(joinShoulderNormals(gridGeometry(mobile?12:18,mobile?20:32,(u,v)=>{const z=mix(-halfLength,.98,v),w=sideX(z,beltHeight(z)),across=Math.sin((u-.5)*Math.PI),x=across*w,y=bodyTop(x,z),endX=across*sideX(-halfLength,beltHeight(-halfLength)),endY=bodyTop(endX,-halfLength);return[x,y,z+smooth((-z-1.68)/.6975)*(rearPoint(endX,endY)[2]+halfLength)];},new THREE.Vector3(0,1,0)),false),paint,chassis,'g45-under-greenhouse-shoulder');
  for(const side of[-1,1]) {
    mesh(joinShoulderNormals(gridGeometry(mobile?80:112,mobile?15:24,(u,v)=>{const z=mix(-halfLength,halfLength,u),y=mix(lowerSide(z),beltHeight(z),Math.sin(v*Math.PI/2)),x=side*sideX(z,y),front=smooth((z-1.62)/.7575),rear=smooth((-z-1.68)/.6975);return[x,y,z-front*(halfLength-frontPoint(frontWidth(y),y)[2])+rear*(rearPoint(rearWidth(y),y)[2]+halfLength)];},new THREE.Vector3(side,0,0)),true),paint,chassis,`g45-${side>0?'right':'left'}-sculpted-body`);
    for(const [axle,r]of[[BMW_X3_RUNNING_GEAR.frontZ,BMW_X3_RUNNING_GEAR.frontRadius],[BMW_X3_RUNNING_GEAR.rearZ,BMW_X3_RUNNING_GEAR.rearRadius]]){
      const arch=[];for(let i=0;i<=56;i++){const z=axle+mix(-.445,.445,i/56),y=archHeight(z,axle);arch.push([z,y]);}
      mesh(gridGeometry(mobile?40:56,3,(u,v)=>{const z=axle+mix(-.445,.445,u),y=archHeight(z,axle);return[side*(sideX(z,y)-.008*v),y+v*.023,z];},new THREE.Vector3(side,0,0)),paint,chassis,'g45-rounded-square-arch-bevel');
      mesh(gridGeometry(mobile?40:56,4,(u,v)=>{const z=axle+mix(-.445,.445,u),y=archHeight(z,axle);return[side*mix(sideX(z,y)-.013,.59,v),y-.012*v,z];},new THREE.Vector3(0,-1,0)),dark,chassis,'closed-wheel-arch-liner');
      const backing=surfaceGeometry([[-.445,.275],[.445,.275],...arch.slice().reverse().map(([z,y])=>[z-axle,y])],[],(z,y)=>[side*.587,y,z+axle],mobile?.095:.075,new THREE.Vector3(side,0,0));
      mesh(backing,dark,chassis,'closed-wheel-well-back');
    }
    const outline=[[.991,1.190],[.498,1.598],[.27,1.625],[-.40,1.646],[-1.25,1.632],[-1.67,1.609],[-1.88,1.576],[-2.295,1.270]];
    for(let j=0;j<=18;j++){const z=mix(-2.295,.991,j/18);outline.push([z,beltHeight(z)]);}
    const frontWindow=rounded([[.904,1.229],[.463,1.569],[.252,1.604],[-.286,1.614],[-.329,1.248],[.722,1.225]],.020,4);
    const rearWindow=rounded([[-.369,1.615],[-1.334,1.608],[-1.377,1.282],[-.371,1.251]],.027,4);
    const quarterWindow=rounded([[-1.406,1.595],[-1.644,1.596],[-1.770,1.523],[-1.902,1.337],[-1.762,1.310],[-1.429,1.286]],.023,4);
    const windowHoles=[frontWindow,rearWindow,quarterWindow];
    surface(outline,paint,(z,y)=>canopySide(z,y,side),`g45-${side}-continuous-window-pillars`,windowHoles,new THREE.Vector3(side,0,0));
    for(const [i,window]of windowHoles.entries()){
      surface(scaled(window,1.024),black,(z,y)=>canopySide(z,y,side,.004),`g45-window-${side}-${i}-seal`,[scaled(window,.984)],new THREE.Vector3(side,0,0));
      surface(scaled(window,.998),i===0?glass:rearGlass,(z,y)=>canopySide(z,y,side,.003),`g45-window-${side}-${i}`,[],new THREE.Vector3(side,0,0));
    }
    const bPillar=[[-.343,1.246],[-.322,1.610],[-.281,1.612],[-.327,1.247]];
    surface(bPillar,black,(z,y)=>canopySide(z,y,side,.008),'g45-gloss-b-pillar',[],new THREE.Vector3(side,0,0));
    const cPillar=[[-1.420,1.285],[-1.402,1.602],[-1.351,1.608],[-1.376,1.287]];
    surface(cPillar,black,(z,y)=>canopySide(z,y,side,.007),'g45-gloss-c-pillar',[],new THREE.Vector3(side,0,0));
    const windowSill=[];for(let j=0;j<=44;j++){const z=mix(-1.887,.911,j/44),y=beltHeight(z)+.023;windowSill.push(canopySide(z,y,side,.008));}line(windowSill,.006,black,'g45-rising-window-sill');
    const seamPoints=[[[.995,1.181],[1.045,.990],[1.031,.508],[.938,.314],[-.25,.315],[-.319,.455],[-.320,1.242]],[[-.320,1.242],[-.319,.455],[-.377,.315],[-.966,.315],[-1.055,.490],[-1.27,.920],[-1.40,1.260]]];
    for(const [i,seam]of seamPoints.entries()){
      const samples=[];for(let j=1;j<seam.length;j++){const a=seam[j-1],b=seam[j],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.035);for(let k=j===1?0:1;k<=steps;k++){const z=mix(a[0],b[0],k/steps),y=mix(a[1],b[1],k/steps);samples.push([side*(sideX(z,Math.min(y,beltHeight(z)))+.0025),y,z]);}}
      line(samples,.0014,dark,`g45-${side}-${i}-door-shutline`,chassis,4);
    }
    for(const z of[.025,-.96]){
      const y=beltHeight(z)-.097,x=side*(sideX(z,y)+.018);
      const handle=box(.019,.032,.163,paint,x,y,z,'g45-sculpted-door-handle');handle.rotation.x=.016;
      box(.008,.011,.142,dark,x-side*.004,y-.018,z+.007,'g45-handle-recess');
    }
    const sill=[];for(let j=0;j<=40;j++){const z=mix(-.935,1.045,j/40);sill.push([side*(sideX(z,.332)+.003),.332,z]);}line(sill,.009,paint,'g45-body-colour-rocker');
    const mirrorPosition=[side*.955,1.262,.780];
    line([[side*.807,1.243,.806],[side*.923,1.250,.795]],.023,black,'g45-mirror-stem');
    const mirror=mesh(new THREE.SphereGeometry(1,mobile?12:24,mobile?8:14),black,chassis,'g45-mirror-cap');mirror.scale.set(.148,.079,.116);mirror.position.copy(V(...mirrorPosition));mirror.rotation.y=side*.17;
    const mirrorLower=mesh(new THREE.SphereGeometry(1,mobile?12:20,8,0,Math.PI*2,Math.PI/2,Math.PI/2),paint,chassis,'g45-mirror-lower-shell');mirrorLower.scale.set(.143,.068,.109);mirrorLower.position.copy(V(mirrorPosition[0],mirrorPosition[1]-.015,mirrorPosition[2]));
    const mirrorPane=mesh(new THREE.CircleGeometry(1,mobile?16:24),glass,chassis,'g45-mirror-glass');mirrorPane.scale.set(.118,.053,1);mirrorPane.rotation.y=Math.PI+side*.17;mirrorPane.position.copy(V(mirrorPosition[0],mirrorPosition[1]-.007,mirrorPosition[2]-.103));
  }
  // Roof and windscreen have their own bounded surfaces and share the sill
  // boundary with the painted pillars; no scaled hemispherical canopy.
  mesh(gridGeometry(mobile?26:34,mobile?28:32,(u,v)=>{const z=mix(-1.889,.495,v),w=stationValue(roofStations,z,2),x=(u*2-1)*w,y=stationValue(roofStations,z,1)-.014*(Math.abs(x)/w)**3;return[x,y,z];},new THREE.Vector3(0,1,0)),paint,chassis,'g45-gently-crowned-roof');
  for(const rear of[false,true]){
    const outline=rounded([[-.95,0],[.95,0],[1,.95],[.955,1],[-.955,1],[-1,.95]],.034,4);
    const project=(u,t,offset=0)=>glassPlane(u*(rear?mix(.700,.789,t):mix(.673,.811,t)),t,rear,offset);
    surface(outline,black,(u,t)=>project(u,t,.001),rear?'g45-rear-glass-surround':'g45-windscreen-surround',[scaled(outline,.944)],rear?rearDir:frontDir,mobile?.071:.048);
    surface(scaled(outline,.95),rear?rearGlass:glass,(u,t)=>project(u,t,.004),rear?'g45-rear-window':'g45-front-windscreen',[],rear?rearDir:frontDir,mobile?.071:.048);
  }
  mesh(gridGeometry(mobile?12:18,2,(u,v)=>{
    const across=Math.sin((u-.5)*Math.PI),x=across*.895,y=bodyTop(x,-halfLength),lower=rearPoint(x,y),upper=[across*.789,1.270,-2.295];
    return upper.map((value,i)=>mix(value,lower[i],v));
  },new THREE.Vector3(0,.6,-.7)),paint,chassis,'g45-continuous-rear-window-lower-sill');
  for(const side of[-1,1]){
    const rail=[];for(let j=0;j<=34;j++){const z=mix(-1.75,.32,j/34),w=stationValue(roofStations,z,2),y=stationValue(roofStations,z,1)-.014*(.690/w)**3+.010;rail.push([side*.690,y,z]);}line(rail,.011,black,'g45-low-roof-rail');
    const aSeal=[];for(let j=0;j<=18;j++){const t=j/18;const p=glassPlane(side*mix(.673,.811,t),t,false,.002);aSeal.push(p);}line(aSeal,.017,paint,'g45-painted-a-pillar-outer-edge');
  }
  const spoiler=mesh(gridGeometry(mobile?24:40,7,(u,v)=>{const x=(u*2-1)*.745,y=mix(1.602,1.569,v)-.018*(Math.abs(x)/.745)**3,z=mix(-1.867,-2.087,v);return[x,y,z];},new THREE.Vector3(0,1,0)),black,chassis,'g45-integrated-roof-spoiler');
  line([[-.703,1.547,-2.095],[0,1.563,-2.096],[.703,1.547,-2.095]],.013,black,'g45-spoiler-trailing-edge');
  line([[-.26,1.293,-2.212],[.34,1.286,-2.218]],.007,dark,'g45-rear-glass-wiper');
  const shark=mesh(new THREE.SphereGeometry(1,16,10),paint,chassis,'g45-shark-fin');shark.scale.set(.037,.038,.079);shark.position.copy(V(0,1.614,-1.510));
  // The rear hatch has a broad sculpted plate well and narrows into the lower
  // bumper. Tail lenses wrap around the shoulders and sit on that surface.
  const rearOutline=[],shoulderColumns=mobile?12:18;
  for(let i=0;i<=sideRows;i++){const y=mix(.285,1.255,Math.sin(i/sideRows*Math.PI/2));rearOutline.push([-rearWidth(y),y]);}
  for(let i=1;i<=shoulderColumns;i++){const x=Math.sin((i/shoulderColumns-.5)*Math.PI)*.895;rearOutline.push([x,bodyTop(x,-halfLength)]);}
  for(let i=sideRows-1;i>=0;i--){const y=mix(.285,1.255,Math.sin(i/sideRows*Math.PI/2));rearOutline.push([rearWidth(y),y]);}
  const lowerBumper=rounded([[-.731,.294],[.731,.294],[.879,.351],[.903,.408],[.884,.506],[.788,.566],[.658,.588],[.543,.533],[-.543,.533],[-.658,.588],[-.788,.566],[-.884,.506],[-.903,.408],[-.879,.351]],.017,3);
  const reflector=rounded([[.793,.609],[.863,.623],[.885,.881],[.849,.941],[.795,.871]],.012,3);
  const tail=rounded([[.252,1.066],[.266,1.131],[.622,1.142],[.729,1.233],[.904,1.224],[.939,1.197],[.941,1.034],[.898,1.017],[.744,1.033],[.613,1.085],[.285,1.088]],.014,3);
  const rearHoles=[lowerBumper];for(const side of[-1,1])for(const p of[tail,reflector])rearHoles.push(p.map(([x,y])=>[side*x,y]));
  surface(rearOutline,paint,(x,y)=>rearPoint(x,y),'g45-sculpted-hatch-and-bumper',rearHoles,rearDir,(x,y)=>Math.abs(x)<.66&&y>.52&&y<.93?(mobile?.023:.017):Math.abs(x)>.76&&y>1.00?(mobile?.033:.025):edge,true);
  surface(lowerBumper,black,(x,y)=>rearPoint(x,y,.011),'g45-lower-gloss-black-bumper',[],rearDir);
  for(const side of[-1,1]){
    const p=tail.map(([x,y])=>[side*x,y]);
    surface(p,black,(x,y)=>rearPoint(x,y,.004),'g45-tail-lamp-deep-smoked-housing',[],rearDir);
    surface(scaled(p,.94),tailLens,(x,y)=>rearPoint(x,y,.011),'g45-tail-lamp-moulded-lens',[],rearDir,.035);
    const ledShapes=[
      [[.282,1.109],[.615,1.120],[.735,1.210],[.903,1.198],[.900,1.175],[.745,1.188],[.622,1.098],[.285,1.089]],
      [[.285,1.077],[.617,1.094],[.748,1.057],[.908,1.064],[.906,1.039],[.744,1.034],[.614,1.072],[.286,1.057]],
      [[.697,1.129],[.756,1.170],[.785,1.166],[.740,1.133],[.776,1.079],[.747,1.066]],
    ];
    for(const shape of ledShapes)surface(rounded(shape,.003,2).map(([x,y])=>[side*x,y]),redLED,(x,y)=>rearPoint(x,y,.017),'g45-opposed-L-thick-light-guide',[],rearDir,.033);
    surface([[.791,1.113],[.905,1.112],[.905,1.131],[.791,1.131]].map(([x,y])=>[side*x,y]),machined,(x,y)=>rearPoint(x,y,.019),'g45-tail-clear-reverse-chamber',[],rearDir,.040);
    surface(reflector.map(([x,y])=>[side*x,y]),dark,(x,y)=>rearPoint(x,y,-.008),'g45-vertical-reflector-recess',[],rearDir);
    surface([[.842,.588],[.857,.598],[.870,.873],[.850,.903],[.832,.861]].map(([x,y])=>[side*x,y]),tailLens,(x,y)=>rearPoint(x,y,.004),'g45-bumper-red-reflector',[],rearDir);
    for(const x of[.562,.706]){
      const outlet=mesh(new THREE.CylinderGeometry(.047,.049,.110,mobile?20:28,1,true),alloy,chassis,'g45-black-quad-exhaust-tip');outlet.rotation.x=Math.PI/2;outlet.position.copy(V(side*x,.383,-2.315));
      const interior=mesh(new THREE.CircleGeometry(.042,mobile?20:28),dark,chassis,'g45-exhaust-dark-bore');interior.rotation.y=Math.PI;interior.position.copy(V(side*x,.383,-2.379));
    }
  }
  const plateBorder=rounded([[-.267,.768],[.267,.768],[.267,.643],[-.267,.643]],.010,3);
  surface(plateBorder,black,(x,y)=>rearPoint(x,y,.008),'g45-inset-plate-frame',[],rearDir);
  const platePixels=new Uint8Array(256*64*4);
  for(let i=0;i<platePixels.length;i+=4){platePixels[i]=235;platePixels[i+1]=234;platePixels[i+2]=222;platePixels[i+3]=255;}
  const glyphs={A:['01110','11011','10001','11111','10001','10001','10001'],P:['11110','10001','10001','11110','10000','10000','10000'],E:['11111','10000','10000','11110','10000','10000','11111'],X:['10001','01010','00100','00100','00100','01010','10001'],'0':['01110','10001','10011','10101','11001','10001','01110'],'4':['00010','00110','01010','10010','11111','00010','00010'],'5':['11111','10000','10000','11110','00001','00001','11110']};
  function lettering(text,y,size,colour){const start=(256-(text.length*6-1)*size)/2;for(let k=0;k<text.length;k++){const glyph=glyphs[text[k]];if(!glyph)continue;for(let row=0;row<7;row++)for(let col=0;col<5;col++)if(glyph[row][col]==='1')for(let dy=0;dy<size;dy++)for(let dx=0;dx<size;dx++){const x=Math.floor(start+k*6*size+col*size+dx),cy=y+(6-row)*size+dy,index=(cy*256+x)*4;platePixels.set([...colour,255],index);}}}
  lettering('APEX 045',21,4,[24,30,35]);lettering('APEX',53,1,[161,30,31]);
  const plateTexture=new THREE.DataTexture(platePixels,256,64);plateTexture.colorSpace=THREE.SRGBColorSpace;plateTexture.needsUpdate=true;plateTexture.magFilter=THREE.LinearFilter;plateTexture.minFilter=THREE.LinearFilter;resources.textures.add(plateTexture);
  const plateInk=material('rear-number-plate-artwork',THREE.MeshStandardMaterial,{map:plateTexture,roughness:.65,metalness:0});
  const plateNode=surface(scaled(plateBorder,.933),plateInk,(x,y)=>rearPoint(x,y,.018),'g45-inset-original-apex-plate',[],rearDir);
  const platePosition=plateNode.geometry.getAttribute('position'),plateUV=[];for(let i=0;i<platePosition.count;i++)plateUV.push(1-(platePosition.getX(i)+.2491)/.4982,(platePosition.getY(i)+baseY-.6472)/.1166);plateNode.geometry.setAttribute('uv',new THREE.Float32BufferAttribute(plateUV,2));plateNode.castShadow=false;
  line([[-.59,.883],[-.40,.883],[0,.868],[.40,.883],[.59,.883]].map(([x,y])=>rearPoint(x,y,.003)),.0016,dark,'g45-hatch-shoulder-fold');
  const hatchSeam=[[-.770,1.244],[-.780,1.023],[-.688,.919],[-.623,.587],[.623,.587],[.688,.919],[.780,1.023],[.770,1.244]];
  line(hatchSeam.map(([x,y])=>rearPoint(x,y,.004)),.0015,dark,'g45-tailgate-shutline');
  for(const x of[-.35,-.19,0,.19,.35])box(.022,.041,.142,dark,x,.297,-2.281,'g45-short-diffuser-vane');
  function frontRecess(points,name,depth=.032,frameMaterial=black) {
    surface(points,frameMaterial,(x,y)=>frontPoint(x,y,.004),name+'-outer-frame',[scaled(points,.94)],frontDir);
    surface(scaled(points,.94),dark,(x,y)=>frontPoint(x,y,-depth),name+'-deep-interior',[],frontDir);
    surface(points,black,(x,y)=>frontPoint(x,y,.006),name+'-bevel',[scaled(points,.91)],frontDir,.039);
  }
  frontRecess(intake,'g45-wide-front-cooling-aperture',.052);
  for(const side of[-1,1]){
    const p=kidney.map(([x,y])=>[side*x,y]);frontRecess(p,'g45-octagonal-kidney',.056);
    surface(scaled(p,.982),machined,(x,y)=>frontPoint(x,y,.013),'g45-kidney-polished-edge',[scaled(p,.953)],frontDir,.040);
    for(const y of[.793,.898,1.000]){
      const slat=rounded([[.100,y-.026],[.442,y-.026],[.474,y+.014],[.433,y+.024],[.124,y+.024],[.094,y+.006]],.012,3).map(([x,v])=>[side*x,v]);
      surface(slat,alloy,(x,v)=>frontPoint(x,v,.016),'g45-three-thick-horizontal-grille-bars',[],frontDir,.042);
      surface([[.125,y+.015],[.439,y+.015],[.443,y+.023],[.123,y+.023]].map(([x,v])=>[side*x,v]),machined,(x,v)=>frontPoint(x,v,.019),'g45-grille-slat-highlight',[],frontDir,.045);
    }
    const e=eyes.map(([x,y])=>[side*x,y]);frontRecess(e,'g45-encased-front-headlamp',.021);
    surface(scaled(e,.955),lens,(x,y)=>frontPoint(x,y,.010),'g45-front-headlamp-clear-lens',[],frontDir,.038);
    const guides=[[[.856,1.144],[.868,1.142],[.851,1.058],[.804,1.040],[.605,1.066],[.604,1.081],[.808,1.059],[.837,1.075]],[[.764,1.130],[.777,1.124],[.759,1.068],[.725,1.067],[.553,1.083],[.548,1.097],[.737,1.083]]];
    for(const guide of guides)surface(rounded(guide,.003,2).map(([x,y])=>[side*x,y]),whiteLED,(x,y)=>frontPoint(x,y,.018),'g45-double-L-front-light-guide',[],frontDir,.030);
    for(const[x,y]of[[.686,1.119],[.736,1.129]]){
      const optic=mesh(new THREE.CircleGeometry(.012,mobile?12:20),machined,chassis,'g45-headlamp-projector');optic.position.copy(V(...frontPoint(side*x,y,.019)));optic.rotation.y=-side*.25;
    }
    frontRecess(curtain.map(([x,y])=>[side*x,y]),'g45-swept-vertical-air-curtain',.03);
    for(const y of[.426,.502,.578])surface([[.055,y-.010],[.719,y-.010],[.741,y+.008],[.055,y+.008]].map(([x,v])=>[side*x,v]),alloy,(x,v)=>frontPoint(x,v,-.001),'g45-lower-cooling-horizontal-vane',[],frontDir,.060);
    for(const x of[.244,.491,.724])surface([[x,.378],[x+.013,.378],[x+.013,.599],[x,.605]].map(([u,y])=>[side*u,y]),dark,(u,y)=>frontPoint(u,y,.007),'g45-lower-cooling-divider',[],frontDir,.060);
  }
  surface([[-.033,.353],[.033,.353],[.027,.634],[-.027,.634]],paint,(x,y)=>frontPoint(x,y,.021),'g45-body-colour-lower-central-divider',[],frontDir);
  box(1.30,.014,.08,black,0,.307,2.337,'g45-front-lower-lip');
  function roundel(position,rotation) {
    const back=mesh(new THREE.CircleGeometry(.033,32),black,chassis,'g45-original-roundel-base');back.position.copy(V(...position));back.rotation.set(...rotation);
    for(let i=0;i<4;i++){
      const quadrant=mesh(new THREE.CircleGeometry(.026,8,i*Math.PI/2,Math.PI/2),i%2?plate:blue,chassis,'g45-original-roundel-quarter');quadrant.position.copy(back.position);quadrant.rotation.copy(back.rotation);quadrant.translateZ(.001);
    }
  }
  roundel([0,bonnetHeight(0,2.158)+.009,2.158],[-Math.PI/2+.11,0,0]);roundel(rearPoint(0,1.130,.023),[0,Math.PI,0]);
  // A shallow cabin volume prevents transparent gaps through the passenger
  // compartment while the real game cockpit remains a separate camera mesh.
  box(1.22,.42,2.20,cabin,0,.966,-.60,'g45-interior-occlusion');
  for(const side of[-1,1])for(const z of[.08,-.89]){
    const seat=mesh(new THREE.BoxGeometry(.39,.45,.23,1,1,1),cabin,chassis,'g45-visible-seat-back');seat.position.copy(V(side*.32,1.167,z));seat.rotation.x=-.10;
    const head=mesh(new THREE.SphereGeometry(1,12,8),cabin,chassis,'g45-visible-head-rest');head.scale.set(.137,.098,.055);head.position.copy(V(side*.32,1.426,z-.034));
  }
  box(1.40,.021,3.81,dark,0,.244,-.065,'g45-closed-underbody');
  for(const front of[true,false])for(const side of[-1,1]){
    const gear=BMW_X3_RUNNING_GEAR,r=front?gear.frontRadius:gear.rearRadius,w=front?gear.frontWidth:gear.rearWidth,track=front?gear.frontTrack:gear.rearTrack;
    const pivot=new THREE.Group();pivot.name=`${front?'front':'rear'}-${side<0?'left':'right'}-steer`;pivot.position.set(side*track/2,r,front?gear.frontZ:gear.rearZ);group.add(pivot);
    const spin=new THREE.Group();spin.name='wheel-spin';pivot.add(spin);wheels.push({pivot,spin,front,radius:r,angle:0});
    const radial=mobile?40:72;
    const tyreVertices=[],tyreFaces=[];
    const section=[[-w*.50,.280],[-w*.515,r-.033],[-w*.46,r-.005],[-w*.30,r],[w*.30,r],[w*.46,r-.005],[w*.515,r-.033],[w*.50,.280]];
    for(let i=0;i<=radial;i++)for(const[x,radius]of section){const a=i/radial*Math.PI*2;tyreVertices.push(x,Math.sin(a)*radius,Math.cos(a)*radius);}
    for(let i=1;i<=radial;i++)for(let j=1;j<section.length;j++){const a=i*section.length+j,b=a-1,c=a-section.length,d=c-1;tyreFaces.push(a,b,c,b,d,c);}
    const tyreGeometry=new THREE.BufferGeometry();tyreGeometry.setAttribute('position',new THREE.Float32BufferAttribute(tyreVertices,3));tyreGeometry.setIndex(tyreFaces);tyreGeometry.computeVertexNormals();mesh(tyreGeometry,rubber,spin,'g45-255-285-low-profile-tyre');
    const barrel=mesh(new THREE.CylinderGeometry(gear.rimRadius-.009,gear.rimRadius-.009,w*.81,radial,1,true),alloy,spin,'g45-21-inch-rim-barrel');barrel.rotation.z=Math.PI/2;
    const outer=side*w*.482;
    const ring=mesh(new THREE.TorusGeometry(gear.rimRadius-.008,.008,6,radial),alloy,spin,'g45-forged-rim-lip');ring.rotation.y=Math.PI/2;ring.position.x=outer;
    const disc=mesh(new THREE.CylinderGeometry(.222,.222,.015,radial,1),discMetal,pivot,'g45-brake-disc');disc.rotation.z=Math.PI/2;disc.position.x=side*w*.23;
    const brake=mesh(new THREE.BoxGeometry(.055,.119,.068),caliper,pivot,'g45-fixed-red-brake-caliper');brake.position.set(side*w*.28,.137,-.113);
    for(let i=0;i<5;i++)for(const branch of[-1,1]){
      const a=i/5*Math.PI*2,innerA=a+branch*.021,outerA=a+branch*.17;
      const point=(radius,angle,tangential)=>[Math.sin(angle)*radius+Math.cos(angle)*tangential,Math.cos(angle)*radius-Math.sin(angle)*tangential];
      const shape=[point(.052,innerA,-.019),point(.245,outerA,-.018),point(.251,outerA,.017),point(.063,innerA,.023)];
      const spoke=surfaceGeometry(shape,[],(y,z)=>[outer-side*.012,y+baseY,z],mobile?.090:.063,new THREE.Vector3(side,0,0));mesh(spoke,alloy,spin,'g45-1037m-split-spoke');
      const highlight=surfaceGeometry(scaled(shape,.55),[],(y,z)=>[outer+side*.003,y+baseY,z],.09,new THREE.Vector3(side,0,0));mesh(highlight,machined,spin,'g45-machined-spoke-face');
    }
    const hub=mesh(new THREE.CylinderGeometry(.048,.048,.038,24,1),alloy,spin,'g45-wheel-center');hub.rotation.z=Math.PI/2;hub.position.x=outer;
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const bolt=mesh(new THREE.CylinderGeometry(.006,.006,.009,8,1),machined,spin,'g45-wheel-bolt');bolt.rotation.z=Math.PI/2;bolt.position.set(outer+side*.023,Math.sin(a)*.033,Math.cos(a)*.033);}
  }
  // A small original soft-contact mask is generated only for this selected car.
  const shadowWidth=BMW_X3_DIMENSIONS.width*1.28,shadowLength=BMW_X3_DIMENSIONS.length*1.13,data=new Uint8Array(64*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<64;x++){
    const px=(x/63-.5)*shadowWidth,pz=(.5-y/127)*shadowLength,index=(y*64+x)*4;
    let darkness=.42*Math.exp(-((px/(BMW_X3_DIMENSIONS.width*.36))**4+(pz/(BMW_X3_DIMENSIONS.length*.41))**4)*1.5);
    for(const front of[true,false])for(const side of[-1,1]){
      const gear=BMW_X3_RUNNING_GEAR,z=front?gear.frontZ:gear.rearZ,width=front?gear.frontWidth:gear.rearWidth,radius=front?gear.frontRadius:gear.rearRadius,wheelX=side*(front?gear.frontTrack:gear.rearTrack)/2;
      const contact=.83*Math.exp(-(((px-wheelX)/(width*.70))**2+((pz-z)/(radius*.46))**2)*1.7);darkness=1-(1-darkness)*(1-contact);
    }
    data[index+3]=Math.round(darkness*clamp(Math.min(x,63-x,y,127-y)/3,0,1)*255);
  }
  const contactTexture=new THREE.DataTexture(data,64,128);contactTexture.needsUpdate=true;contactTexture.minFilter=contactTexture.magFilter=THREE.LinearFilter;resources.textures.add(contactTexture);
  const contactMaterial=material('contact-shadow',THREE.MeshBasicMaterial,{map:contactTexture,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const contact=mesh(new THREE.PlaneGeometry(shadowWidth,shadowLength),contactMaterial,group,'contact-shadow');contact.rotation.x=-Math.PI/2;contact.position.y=.008;contact.renderOrder=1;contact.castShadow=false;contact.receiveShadow=false;
  // Batch fixed parts by material; the four steering/spin hierarchies remain
  // separate. The inspection option preserves semantic names for geometry QA.
  if(!inspectParts){
    for(const parent of[chassis,...wheels.flatMap(w=>[w.pivot,w.spin])]){
      const batches=new Map();for(const child of parent.children)if(child.isMesh){const key=child.material;const list=batches.get(key)||[];list.push(child);batches.set(key,list);}
      for(const[mat,list]of batches)if(list.length>1){
        const geometries=list.map(child=>{child.updateMatrix();const clone=child.geometry.clone().applyMatrix4(child.matrix);if(!mat.map)clone.deleteAttribute('uv');return clone;});
        const combined=mergeGeometries(geometries,false);for(const geometry of geometries)geometry.dispose();if(!combined)throw new Error('X3 static geometry batching failed');
        const replacement=mesh(combined,mat,parent,`${parent.name}-${mat.name}`);replacement.castShadow=list.some(node=>node.castShadow);
        for(const child of list){parent.remove(child);resources.geometries.delete(child.geometry);child.geometry.dispose();}
      }
    }
  }
  let triangles=0,meshCount=0;group.traverse(node=>{if(node.isMesh){triangles+=(node.geometry.index?.count||node.geometry.attributes.position.count)/3;meshCount++;}});
  group.userData.model={name:group.name,vehicle:'bmwX3',author:'APEX project',license:'Original procedural game artwork',source:'https://www.press.bmwgroup.com/usa/photo/compilation/T0443207EN_US/the-all-new-2025-bmw-x3',...BMW_X3_DIMENSIONS,wheelRadius:BMW_X3_RUNNING_GEAR.frontRadius,openTop:false,triangles,meshes:meshCount,signatures:['g45-independent-compound-body','rising-window-beltline','narrow-swept-d-pillars','three-bar-octagonal-kidneys','thick-opposed-L-tail-lenses','deep-trapezoid-tailgate-plate-well','1037m-21-inch-split-spoke-wheels']};
  let disposed=false,steer=0,pitch=0,roll=0;
  return{group,dimensions:BMW_X3_DIMENSIONS,
    setPaint(color){paint.color.set(color);const luminance=paint.color.r*.2126+paint.color.g*.7152+paint.color.b*.0722;paint.metalness=luminance>.42?.08:.16;paint.roughness=luminance>.42?.29:.27;},
    update(state={},dt=1/60){
      const step=clamp(Number.isFinite(dt)?dt:0,0,.1),value=x=>Number.isFinite(x)?x:0;
      const actual=Number.isFinite(state.steeringAngle)?state.steeringAngle:state.steerAngle,target=Number.isFinite(actual)?clamp(actual,-.55,.55):clamp(value(state.steering),-1,1)*.42;
      steer=THREE.MathUtils.damp(steer,target,13,step);const speed=value(state.speed)*(state.reverse?-1:1);
      for(const wheel of wheels){wheel.pivot.rotation.y=wheel.front?steer:0;wheel.angle=(wheel.angle-speed*step/wheel.radius)%(Math.PI*2);wheel.spin.rotation.x=wheel.angle;}
      pitch=THREE.MathUtils.damp(pitch,clamp(-value(state.longitudinalAccel)*.0035,-.045,.045),7,step);roll=THREE.MathUtils.damp(roll,clamp(value(state.lateralAccel)*.0045,-.052,.052),7,step);chassis.rotation.x=pitch;chassis.rotation.z=roll;
      redLED.emissiveIntensity=.50+clamp(value(state.brake),0,1)*2.4;
    },
    dispose(){if(disposed)return;disposed=true;for(const geometry of resources.geometries)geometry.dispose();for(const mat of resources.materials)mat.dispose();for(const texture of resources.textures)texture.dispose();},
  };
}
