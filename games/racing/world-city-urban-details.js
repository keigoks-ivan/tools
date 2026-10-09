import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js?v=city-drive-16';
import { cityDistrictAt } from './world-city-districts.mjs?v=city-drive-16';
import { clipGroundTriangle } from './world-city-ground.mjs?v=city-drive-16';

// Street furniture and activity follow local architectural families. All artwork
// is original geometry/canvas work; only the selected city allocates resources.
export const URBAN_PROFILES = Object.freeze({
  taipei: { color: '#527568', canopy: '#c16b4f', market: true, wires: true, hydrant: '#bb4034', bus: '#436d54' },
  kualalumpur: { color: '#517568', canopy: '#be934d', market: true, wires: false, hydrant: '#c14937', bus: '#54796b' },
  kobe: { color: '#496f80', canopy: '#cec8b2', market: false, wires: true, hydrant: '#a73e33', bus: '#718998' },
  london: { color: '#364d48', canopy: '#746d58', cafe: true, hydrant: null, bus: '#983d35' },
  sydney: { color: '#4f6e66', canopy: '#c4c0a4', cafe: true, hydrant: null, bus: '#528777' },
  goldcoast: { color: '#64878b', canopy: '#d4bc83', cafe: true, beach: true, hydrant: null, bus: '#5895a5' },
  melbourne: { color: '#496452', canopy: '#7b715b', cafe: true, hydrant: null, bus: '#4c7359' },
  paris: { color: '#485d4e', canopy: '#8e3f38', cafe: true, hydrant: null, bus: '#536f69' },
  prague: { color: '#6a5143', canopy: '#b08a62', cafe: true, hydrant: null, bus: '#8b4b40' },
  newcastle: { color: '#354f50', canopy: '#6e7869', cafe: true, hydrant: null, bus: '#716051' },
  bangkok: { color: '#658173', canopy: '#cb9360', market: true, wires: true, hydrant: '#b04832', bus: '#ab5443' },
  sanfrancisco: { color: '#4f7471', canopy: '#bbaa82', cafe: true, hydrant: '#b78f3e', bus: '#9b5a48' },
  newyork: { color: '#4a665d', canopy: '#66825f', cafe: true, hydrant: '#ad4034', bus: '#497c95' },
  vancouver: { color: '#4e7770', canopy: '#789082', cafe: true, hydrant: '#b85340', bus: '#477f8b' },
  hanoi: { color: '#737d52', canopy: '#b47d55', market: true, wires: true, hydrant: '#b54f38', bus: '#4d8060' },
  lisbon: { color: '#4c7976', canopy: '#ba9c63', cafe: true, wires: true, hydrant: null, bus: '#ba953f' },
  marseille: { color: '#637b7b', canopy: '#c2b190', cafe: true, hydrant: null, bus: '#607f9a' },
  nice: { color: '#487e9c', canopy: '#d8c09a', cafe: true, beach: true, hydrant: null, bus: '#427b9a' },
  warwick: { color: '#506347', canopy: '#84715a', cafe: true, hydrant: null, bus: '#746a54' },
});
const junctionCache = new WeakMap();
const lapDistance = (a, b, length) => Math.abs(((a - b + length / 2) % length + length) % length - length / 2);
export function getUrbanJunctions(track) {
  if (!URBAN_PROFILES[track.id] || track.id === 'taipei') return [];
  if (junctionCache.has(track)) return junctionCache.get(track);
  const junctions = [];
  for (const fraction of [.075, .18, .405, .56, .685, .92]) {
    let best;
    for (let delta = -30; delta <= 30; delta += 5) {
      const s = fraction * track.length + delta, p = track.sample(s);
      if (Math.abs(p.curvature) > .005 || junctions.some(j => lapDistance(j.s, s, track.length) < 95)) continue;
      const sides = [-1, 1].filter(side => cityDistrictAt(track, s, side)?.density > .4);
      if (sides.length && (!best || Math.abs(p.curvature) < Math.abs(best.center.curvature))) best = { s, center: p, sides, width: track.id === 'hanoi' ? 7 : track.id === 'newyork' ? 12 : 9, cross: sides.length === 2 };
    }
    if (best) junctions.push(best);
  }
  junctionCache.set(track, junctions); return junctions;
}
export function urbanJunctionAt(track, s, margin = 0) {
  return getUrbanJunctions(track).find(j => lapDistance(s, j.s, track.length) < j.width / 2 + margin) || null;
}

export function addCityUrbanDetails({ scene, track, mobile = false, groundHeight, groundSurfaceHeight = groundHeight, materials, buildings = [], reserved = [], cityGroundLevel }) {
  const profile = URBAN_PROFILES[track.id]; if (!profile) return {};
  const kit = createCityBuilder({ scene, track, mobile, groundHeight, materials });
  kit.group.name = `${track.id}-street-life`;
  const { material, surface, box, cylinder, beam, bake, setFrame } = kit;
  function sphere(rx, ry, rz, mat, x, y, z) {
    const geometry = new THREE.SphereGeometry(1, mobile ? 7 : 14, mobile ? 5 : 9);
    geometry.scale(rx, ry, rz); bake(geometry, mat, x, y, z);
  }
  const metal = material('#3e4a4b', { roughness: .53, metalness: .46 });
  const silver = material('#a7afab', { roughness: .4, metalness: .67 });
  const wood = surface(materials.concrete, '#96765b', { roughness: .92 });
  const civic = material(profile.color, { roughness: .77 });
  const canopy = material(profile.canopy, { roughness: .93 });
  const skin = wood;
  const clothing = [material('#727f80'), material('#b5a692'), material('#647263')];
  const dark = material('#303a3c', { roughness: .94 });
  const rubber = material('#2f3231', { roughness: .96 });
  const stone = surface(materials.concrete, '#a5aaa0', { roughness: .98 });
  const glass = material('#71898a', { roughness: .18, metalness: 0 });
  const cream = stone;
  const red = material('#a34234');
  const leaf = material('#557248', { roughness: .98 }); leaf.name = 'city-evergreen-planter';
  const streetPaving = surface(materials.concrete, '#a5aaa0', { roughness: .98 }); streetPaving.userData.ground = true;
  const roadIron = material('#3e4a4b', { roughness: .72, metalness: .25, userData: { ground: true } });
  const asphalt = surface(materials.shoulder || materials.concrete, '#555b57', { roughness: .98 });
  asphalt.userData.surface = true; asphalt.userData.ground = true;
  const paint = material('#d1d0bc', { roughness: .97 }); paint.userData.ground = true;
  const props = [], junctions = getUrbanJunctions(track);
  const seed = [...track.id].reduce((n, c) => n * 31 + c.charCodeAt(0), 37) >>> 0;
  let rng = seed;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  function clear(x, z, radius = .7, allowGarden = true) {
    if (cityGroundLevel(track.id, x, z) < 4 || track.nearest(x, z).distance < track.wallOffset + 1) return false;
    if (reserved.some(r => Math.hypot(r.x - x, r.z - z) < r.radius + radius)) return false;
    if (buildings.some(b => {
      const dx = x - b.x, dz = z - b.z, c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      return Math.abs(dx * c - dz * s) < b.w / 2 + radius && Math.abs(dx * s + dz * c) < b.d / 2 + radius;
    })) return false;
    const nearest = track.nearest(x, z), district = cityDistrictAt(track, nearest.s, nearest.offset < 0 ? -1 : 1);
    if (!allowGarden && district.density === 0) return false;
    if (['woodland', 'cliff'].includes(district.frontage)) return false;
    const junction = urbanJunctionAt(track, nearest.s, radius + 1);
    return !junction || !junction.sides.includes(nearest.offset < 0 ? -1 : 1) || nearest.distance > 68;
  }
  function place(s, side, offset, radius, name, draw, allowGarden = true) {
    const p = track.sample(s), x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
    if (!clear(x, z, radius, allowGarden)) return false;
    const y = Math.max(groundSurfaceHeight(x, z), p.y - .15);
    setFrame(x, z, p.heading + (side < 0 ? Math.PI : 0), y);
    props.push({ name, x, y, z, radius }); draw(); return true;
  }
  function bench() {
    for (const xx of [-.85, .85]) { box(.10, .52, .72, metal, xx, .27, 0); box(.1, .64, .08, metal, xx, .7, .32, -.12); }
    for (const zz of [-.28, -.09, .1, .29]) box(2.05, .065, .15, wood, 0, .54, zz);
    for (const yy of [.74, .95, 1.15]) box(2.05, .15, .055, wood, 0, yy, .36, -.12);
  }
  function person(index) {
    const h = 1.55 + index % 4 * .065, shirt = clothing[index % clothing.length];
    cylinder(.12, .18, h * .35, shirt, 0, h * .60, 0, 8);
    sphere(.11, .14, .11, skin, 0, h * .88, 0);
    sphere(.113, .06, .115, dark, 0, h * .94, .01);
    for (const side of [-1, 1]) {
      beam([side * .08, h * .43, 0], [side * .10, .07, side * .06], .085, dark);
      box(.12, .07, .25, dark, side * .10, .05, side * .06 - .04);
      beam([side * .15, h * .72, 0], [side * .22, h * .44, -.04], .07, shirt);
      sphere(.04, .055, .04, skin, side * .22, h * .43, -.04);
    }
    if (index % 3 === 0) box(.22, .31, .16, canopy, .29, h * .43, .015);
  }
  function planter() {
    box(1.65, .56, .86, stone, 0, .28, 0); box(1.46, .04, .68, dark, 0, .57, 0);
    for (let i = 0; i < 5; i++) sphere(.27, .31 + i % 2 * .16, .29, leaf, -.60 + i * .30, .76, (i % 2 - .5) * .17);
  }
  function busStop() {
    for (const xx of [-2.1, 2.1]) for (const zz of [-.65, .65]) box(.065, 2.45, .065, metal, xx, 1.23, zz);
    box(4.65, .16, 1.82, civic, 0, 2.56, 0); box(4.2, 1.86, .035, glass, 0, 1.25, .66);
    box(.035, 1.86, 1.3, glass, 2.1, 1.25, 0);
    for (const yy of [.75, 1.5]) box(4.24, .035, .06, silver, 0, yy, .64);
    bench();
    box(.65, 1.12, .08, cream, -1.65, 1.44, .61);
    for (let line = 0; line < 9; line++) box(.46 - line % 3 * .08, .015, .025, civic, -1.65, 1.88 - line * .10, .56);
    cylinder(.045, .065, 2.6, metal, -2.68, 1.3, -.4, 7);
    box(.60, .48, .075, civic, -2.68, 2.37, -.4);
  }
  function cafe() {
    cylinder(.04, .045, 2.5, silver, 0, 1.25, 0, 8);
    cylinder(0, 1.9, .58, canopy, 0, 2.6, 0, mobile ? 8 : 12);
    cylinder(.58, .58, .055, wood, 0, .78, 0, 16); cylinder(.055, .07, .75, metal, 0, .38, 0, 8);
    for (const side of [-1, 1]) {
      box(.48, .06, .50, wood, side * .95, .46, 0); box(.48, .44, .065, wood, side * .95, .73, .22);
      for (const xx of [-.19, .19]) for (const zz of [-.19, .19]) box(.035, .43, .035, metal, side * .95 + xx, .22, zz);
    }
    cylinder(.045, .035, .09, cream, -.16, .86, -.06, 8);
  }
  function market() {
    box(2.3, .74, .92, wood, 0, .59, 0); box(2.55, .065, 1.15, stone, 0, .99, 0);
    for (const xx of [-1.16, 1.16]) cylinder(.025, .03, 2.7, metal, xx, 1.35, .4, 6);
    box(2.8, .08, 1.8, canopy, 0, 2.68, -.12, .12);
    for (let i = 0; i < 6; i++) cylinder(.12, .15, .23, i % 2 ? red : leaf, -.87 + i * .34, 1.13, -.15, 7);
    for (const xx of [-.83, .83]) cylinder(.14, .14, .07, rubber, xx, .16, .30, 10, 0, 0, Math.PI / 2);
  }
  function bicycle() {
    for (const zz of [-.68, .68]) bake(new THREE.TorusGeometry(.31, .028, 5, 16), rubber, 0, .34, zz, 0, Math.PI / 2);
    for (const [a, b] of [[[0,.35,-.68],[0,.79,-.34]],[[0,.79,-.34],[0,.35,0]],[[0,.35,0],[0,.35,-.68]],[[0,.35,0],[0,.82,.24]],[[0,.82,.24],[0,.35,.68]],[[0,.35,.68],[0,.35,0]],[[0,.79,-.34],[0,.82,.24]]]) beam(a,b,.04,civic);
    box(.19,.045,.30,dark,0,.86,-.34); beam([0,.82,.24],[0,1.04,.35],.035,silver); beam([-.20,1.04,.35],[.20,1.04,.35],.032,silver);
  }
  // Terrain-conforming side streets create real openings through the facade row.
  function streetSurface(j, side, width, from, to, mat, lift = .06) {
    const p = j.center, vertices = [], uv = [], indices = [];
    const at = (offset, along) => [p.x + p.nx * side * offset + Math.sin(p.heading) * along, p.z + p.nz * side * offset + Math.cos(p.heading) * along];
    const corners = [at(from,-width/2),at(to,-width/2),at(to,width/2),at(from,width/2)];
    for (const input of [[corners[0],corners[1],corners[2]],[corners[0],corners[2],corners[3]]]) for (const triangle of clipGroundTriangle(input, groundSurfaceHeight.grid)) {
      const start = vertices.length / 3;
      for (const [x,z] of triangle) { vertices.push(x, Math.max(groundSurfaceHeight(x,z), p.y + .04) + lift,z); uv.push(x/3,z/3); }
      const [a,b,c] = triangle;
      const winding=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
      indices.push(start, winding>0?start+2:start+1, winding>0?start+1:start+2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); geo.setIndex(indices); geo.computeVertexNormals();
    setFrame(0,0,0,0); bake(geo,mat);
  }
  for (const j of junctions) for (const side of j.sides) {
    const p = j.center, far = 63;
    const farX=p.x+p.nx*side*far, farZ=p.z+p.nz*side*far;
    if (cityGroundLevel(track.id,farX,farZ)<4 || reserved.some(r=>Math.hypot(r.x-farX,r.z-farZ)<r.radius+20)) continue;
    streetSurface(j,side,j.width+4.2,track.width/2+.1,far,streetPaving,.075);
    streetSurface(j,side,j.width,track.width/2+.05,far,asphalt,.09);
    for (const along of [-j.width/2-1.6,j.width/2+1.6]) {
      const offset=track.wallOffset+3,x=p.x+p.nx*side*offset+Math.sin(p.heading)*along,z=p.z+p.nz*side*offset+Math.cos(p.heading)*along;
      setFrame(x,z,p.heading,p.y+.15); cylinder(.06,.08,4.6,metal,0,2.3,0,8); box(.25,.77,.3,dark,0,4.14,0);
      for (let i=0;i<3;i++) cylinder(.065,.065,.025,i===2?civic:i===0?red:canopy,0,4.39-i*.23,-.16,10,Math.PI/2);
    }
  }
  for (let s = 32, index = 0; s < track.length; s += mobile ? 116 : 46, index++) for (const side of [-1,1]) {
    const district=cityDistrictAt(track,s,side), garden=district.density===0;
    const offset=track.wallOffset+3.7;
    if (index%3===0) place(s,side,offset,1.15,'bench',bench);
    else if (index%3===1) place(s,side,offset,.90,'planter',planter);
    else place(s,side,offset,.45,'street-bin',()=>{ cylinder(.23,.25,.86,civic,0,.43,0,10); cylinder(.28,.28,.09,metal,0,.9,0,10); for(let rib=0;rib<6;rib++)box(.025,.66,.03,silver,Math.sin(rib*Math.PI/3)*.253,.45,Math.cos(rib*Math.PI/3)*.253); });
    if (!mobile || index%2===0) place(s+9,side,offset+.15,.32,'pedestrian',()=>person(index));
    if (garden) continue;
    if (index%8===0) place(s+16,side,track.wallOffset+4.4,2.6,'bus-shelter',busStop,false);
    if (index%4===1) place(s+18,side,track.wallOffset+4.2,1.9,profile.market?'market-stall':'cafe-terrace',profile.market?market:cafe,false);
    if (index%5===2) place(s+24,side,track.wallOffset+3,.86,'bicycle',bicycle,false);
    if (profile.hydrant && index%7===3) place(s+15,side,track.wallOffset+1.7,.38,'hydrant',()=>{
      cylinder(.15,.18,.57,red,0,.30,0,10); sphere(.17,.12,.17,red,0,.66,0); cylinder(.095,.095,.48,silver,0,.44,0,8,0,0,Math.PI/2);
    },false);
  }
  // Utilities stay on the land side and clear of landmark sightlines.
  if (profile.wires) for (let s=140;s<track.length;s+=mobile?310:205) {
    const side=-1,district=cityDistrictAt(track,s,side); if (!district.density) continue;
    const p=track.sample(s),q=track.sample(s+38),offset=track.wallOffset+7.2;
    const a=[p.x+p.nx*side*offset,p.z+p.nz*side*offset],b=[q.x+q.nx*side*offset,q.z+q.nz*side*offset];
    if(!clear(...a,.35,false)||!clear(...b,.35,false))continue;
    const ya=p.y+8.2,yb=q.y+8.2;
    for(const [x,z,y] of [[...a,ya],[...b,yb]]){setFrame(x,z,0,groundHeight(x,z));cylinder(.10,.15,y-groundHeight(x,z),metal,0,(y-groundHeight(x,z))/2,0,8);box(1.6,.075,.1,wood,0,y-groundHeight(x,z)-.2,0);}
    setFrame(0,0,0,0);
    for(const wire of [-.55,0,.55]) for(let step=0;step<8;step++) {
      const at=t=>[a[0]+(b[0]-a[0])*t+wire,ya+(yb-ya)*t-Math.sin(t*Math.PI)*.6,a[1]+(b[1]-a[1])*t]; beam(at(step/8),at((step+1)/8),.018,dark);
    }
  }
  // Shared, feathered wear decals retain the city's lane markings and scale.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
  const gradient=c.createRadialGradient(128,128,8,128,128,122);gradient.addColorStop(0,'rgba(30,32,29,.32)');gradient.addColorStop(.6,'rgba(39,41,36,.16)');gradient.addColorStop(1,'rgba(39,41,36,0)');c.fillStyle=gradient;c.fillRect(0,0,256,256);
  for(let i=0;i<260;i++){c.fillStyle=`rgba(34,36,32,${rand()*.13})`;c.fillRect(rand()*256,rand()*256,rand()*3,rand()*9);}
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
  const wear=material('#ffffff',{map,transparent:true,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-1});wear.userData.ground=true;
  let wearCount=0;
  for(let s=18;s<track.length;s+=mobile?55:29){
    const p=track.sample(s),offset=(rand()-.5)*(track.width-2),x=p.x+p.nx*offset,z=p.z+p.nz*offset;
    setFrame(x,z,p.heading,p.y+.072);bake(new THREE.PlaneGeometry(1.2+rand()*2.8,3+rand()*5),wear,0,0,0,-Math.PI/2);wearCount++;
    if(Math.round(s)%3===0){
      setFrame(p.x+p.nx*(track.width/2-.48),p.z+p.nz*(track.width/2-.48),p.heading,p.y+.082);
      box(.34,.017,.64,roadIron,0,0,0);for(let slot=0;slot<6;slot++)box(.28,.006,.034,roadIron,0,.012,-.24+slot*.093);
    }
  }
  const result=kit.finish();result.group.userData.props=props;result.group.userData.junctions=junctions;result.group.userData.wearCount=wearCount;
  const quality=result.setQuality;
  result.setQuality=level=>{quality(level);for(const mesh of result.group.children)if(mesh.material.userData.ground)mesh.castShadow=false;};
  result.setQuality(mobile?'medium':'high'); return result;
}
