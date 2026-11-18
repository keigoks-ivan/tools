import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const AMBER = 0xffba58, GREEN = 0x7effc1, CYAN = 0x71e5ff;
const at = (world, x, z, h = 0) => new THREE.Vector3(x, world.height(x, z) + h, z);
const DEPOT_BOX = new WeakMap();
const clamp = THREE.MathUtils.clamp;

function disposeModel(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); materials.add(o.material); } });
  root.removeFromParent();
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

// 建物測試與命中仍使用原本的步槍射線。這裡只找準心先碰到的互動目標。
function aimAt(target, origin, dir, skip) {
  const { center, radius } = target;
  const x = center.x - origin.x, y = center.y - origin.y, z = center.z - origin.z;
  const distance = x * dir.x + y * dir.y + z * dir.z;
  if (distance < skip || distance >= 480) return null;
  return x * x + y * y + z * z - distance * distance <= radius * radius ? target : null;
}

function box(parent, geometry, material, w, h, d, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.scale.set(w, h, d); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m);
  return m;
}

function batch(parent) {
  const parts = new Map();
  for (const mesh of parent.children.slice()) {
    if (!mesh.isMesh) continue;
    mesh.updateMatrix();
    const p = parts.get(mesh.material) ?? [];
    p.push(mesh.geometry.clone().applyMatrix4(mesh.matrix));
    parts.set(mesh.material, p); mesh.removeFromParent();
  }
  for (const [material, p] of parts) {
    const m = new THREE.Mesh(mergeGeometries(p), material);
    m.castShadow = m.receiveShadow = true; parent.add(m);
    for (const g of p) g.dispose();
  }
}

function shellMaterials() {
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x354750, metalness: .55, roughness: .65 }),
    paint: new THREE.MeshStandardMaterial({ color: 0xd3a65e, metalness: .37, roughness: .66 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x19262d, metalness: .5, roughness: .72 }),
    lamp: new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false }),
  };
}

class ReflectorShot {
  constructor(C, data) {
    this.C = C;
    this.title = data.title;
    this.root = new THREE.Group(); this.root.name = '砲線導光陣列'; C.scene.add(this.root);
    const cube = new THREE.BoxGeometry(), { steel, dark, paint, lamp: amber } = shellMaterials();
    this.pairs = data.pairs.map(({ plate, cell }, i) => {
      const center = at(C.world, ...plate), receiver = at(C.world, ...cell);
      const face = new THREE.MeshBasicMaterial({ color: CYAN, toneMapped: false });
      const lamp = i === 0 ? amber : amber.clone();
      const model = new THREE.Group(); model.position.copy(center); model.rotation.y = Math.PI * .23; this.root.add(model);
      box(model,cube,dark,7,5.2,.7,0,0,0);
      for (const x of [-1.86, 0, 1.86]) for (const z of [-.41, .41]) box(model,cube,face,1.68,4.2,.1,x,0,z);
      box(model,cube,paint,7.5,.45,.8,0,-2.55,0);
      batch(model);
      const mast = new THREE.Group(); mast.position.copy(center); this.root.add(mast);
      box(mast,cube,steel,1.3,plate[2],1.3,0,-plate[2]/2,0);
      box(mast,cube,dark,3.5,.7,3.5,0,-plate[2],0);
      batch(mast);
      const shield = new THREE.Group(); shield.position.copy(receiver); this.root.add(shield);
      box(shield,cube,dark,5.4,5.2,5.0,0,0,-2.7);
      box(shield,cube,dark,5.8,5.5,.62,0,0,2.45);
      box(shield,cube,steel,1.6,cell[2],1.6,0,-cell[2]/2,-.45);
      box(shield,cube,lamp,3.4,2.8,.28,0,0,0);
      batch(shield);
      return { center, receiver, radius: 3.9, face, lamp };
    });
    cube.dispose();
    this.index = 0; this.state = 'active';
    this.marker = this.pairs[0].center;
  }
  update() {}
  aim(origin, dir, skip) { return aimAt(this.pairs[this.index], origin, dir, skip); }
  hit(target) {
    const { C } = this;
    C.fx.beam(target.center, target.receiver, 'player');
    C.fx.explosion(target.receiver, .62); C.audio.explosion(target.receiver, .65);
    target.face.color.setHex(0x243239);
    target.lamp.color.setHex(0x19262d);
    this.index++;
    if (this.index === this.pairs.length) this.state = 'done';
    else this.marker = this.pairs[this.index].center;
  }
  get hud() {
    return { title: `${this.title}　${this.index}/${this.pairs.length}`, hint: '射青色導光板，把光束轉向鋼板後的電源',
      value: this.index / this.pairs.length, color: 'cy' };
  }
  dispose() { disposeModel(this.root); }
}

class FreightShot {
  constructor(C, data) {
    this.C = C;
    this.title = data.title;
    const panel = at(C.world, ...data.panel), gate = at(C.world, ...data.gate), core = at(C.world, ...data.core);
    this.panel = { center: panel, radius: 3.5 }; this.core = { center: core, radius: 3.9 };
    this.marker = panel;
    this.remaining = 0; this.lift = 0; this.hits = 0; this.window = data.seconds; this.state = 'active';
    this.gate = gate;
    this.root = new THREE.Group(); this.root.name = '彈藥庫散熱閘'; C.scene.add(this.root);
    const { steel, paint, dark, lamp } = shellMaterials(), cube = new THREE.BoxGeometry();
    this.lamp = lamp;
    const station = new THREE.Group(); station.position.copy(panel); this.root.add(station);
    box(station,cube,steel,3.3,6.5,5.8,0,-.8,0);
    box(station,cube,dark,.28,3.4,4.9,-1.64,.3,0);
    box(station,cube,lamp,.2,1.45,2.55,-1.83,.55,0);
    box(station,cube,paint,3.4,.4,6,0,-2.7,0);
    batch(station);
    const tower = new THREE.Group(); tower.position.copy(gate); this.root.add(tower);
    this.shutter = new THREE.Group(); tower.add(this.shutter);
    for (const z of [-17, 17]) {
      box(tower,cube,steel,3.1,39,2.65,0,19.5,z);
      box(tower,cube,paint,3.28,2.2,2.8,0,5.2,z);
      box(tower,cube,lamp,3.2,.31,1,-.12,25,z);
      box(tower,cube,steel,20,12,2.8,10,6,z);
      box(tower,cube,dark,20,1.15,3,10,11.6,z);
      for (const x of [3, 11, 18]) box(tower,cube,dark,1.25,12.4,2.95,x,6,z);
    }
    box(tower,cube,dark,3.9,2.4,36.4,0,39.3,0);
    box(this.shutter,cube,steel,1.35,18.4,32,0,9.2,0);
    box(this.shutter,cube,paint,1.43,1.2,32,0,1.5,0);
    for (const y of [3.5, 7.5, 11.5, 15.5]) box(this.shutter,cube,dark,1.5,.32,32.2,0,y,0);
    batch(tower); batch(this.shutter);
    this.machine = new THREE.Group(); this.machine.position.copy(core); this.root.add(this.machine);
    box(this.machine,cube,dark,14,1,19,1,-10,0);
    box(this.machine,cube,steel,6,8,10,1,0,0);
    box(this.machine,cube,dark,.36,6,8,-2.15,0,0);
    box(this.machine,cube,lamp,.14,3.7,5.2,-2.41,0,0);
    box(this.machine,cube,paint,4,.52,10.5,0,-3.75,0);
    for (const z of [-4.9, 4.9]) box(this.machine,cube,steel,7,7,1.6,1,-4.5,z);
    batch(this.machine); cube.dispose();
    let collider = DEPOT_BOX.get(C.world);
    if (!collider) { collider = {}; DEPOT_BOX.set(C.world, collider); }
    Object.assign(collider, { x0:gate.x-.9, x1:gate.x+.9, z0:gate.z-16, z1:gate.z+16, top:gate.y+18.4 });
    if (!C.world.boxes.includes(collider)) C.world.addCollider(collider);
    this.collider = collider;
  }
  update(dt) {
    this.remaining = Math.max(0, this.remaining - dt);
    const opening = this.remaining > 0;
    const p = this.C.player.pos, gate = this.gate;
    const under = Math.abs(p.x - gate.x) < 7 && Math.abs(p.z - gate.z) < 20;
    this.lift = clamp(this.lift + (opening || under && this.lift > .8 ? dt : -dt) * 1.7, 0, 1);
    this.shutter.position.y = 20 * this.lift;
    this.collider.top = this.lift >= .82 ? -1e4 : gate.y + 18.4;
    if (!opening && this.hits) this.hits = 0;
    this.marker = opening && this.lift >= .82 ? this.core.center : this.panel.center;
    this.lamp.color.setHex(opening ? GREEN : AMBER);
  }
  aim(origin, dir, skip) {
    if (!this.remaining) return aimAt(this.panel, origin, dir, skip);
    return this.lift >= .82 ? aimAt(this.core, origin, dir, skip) : null;
  }
  hit(target) {
    const C = this.C;
    if (target === this.panel) {
      this.remaining = this.window; this.hits = 0; C.audio.ui('confirm');
    } else {
      this.hits++;
      C.audio.ui('confirm');
      if (this.hits === 3) {
        C.fx.explosion(this.core.center, 1.2); C.audio.explosion(this.core.center, 1.2);
        this.machine.visible = false; this.shutter.position.y = 20; this.collider.top = -1e4; this.state = 'done';
      }
    }
  }
  get hud() {
    return { title: this.title, hint: this.remaining ? (this.lift < .82 ? '閘門上升，準備瞄準裡面的核心'
      : `核心露出 ${Math.ceil(this.remaining)} 秒 · 步槍命中 ${this.hits}/3`) : '先射路旁琥珀色的開閘控制箱',
      value: this.remaining ? this.remaining / this.window : null, color: this.remaining ? 'gr' : 'am' };
  }
  dispose() { this.collider.top = -1e4; disposeModel(this.root); }
}

class FlightShot {
  constructor(C, data) {
    this.C = C; this.title = data.title; this.index = 0; this.state = 'active'; this.elapsed = 0;
    this.root = new THREE.Group(); this.root.name = '敵方空中干擾器'; C.scene.add(this.root);
    const ring = new THREE.TorusGeometry(4.7, .21, 5, 32);
    const casing = new THREE.IcosahedronGeometry(2.1, 0), cube = new THREE.BoxGeometry();
    const metal = new THREE.MeshStandardMaterial({ color: 0x53646c, roughness: .5, metalness: .6 });
    this.lamp = new THREE.MeshBasicMaterial({ color: AMBER, toneMapped: false });
    this.nodes = data.nodes.map(coords => {
      const center = at(C.world, ...coords), pivot = new THREE.Group();
      pivot.position.copy(center); pivot.visible = false; this.root.add(pivot);
      pivot.add(new THREE.Mesh(casing, metal), new THREE.Mesh(ring, this.lamp));
      const housing = new THREE.Group(); pivot.add(housing);
      for (const x of [-2.45, 2.45]) {
        box(housing,cube,metal,2.55,.6,1.8,x,0,0).rotation.z = Math.sign(x) * .24;
        box(housing,cube,this.lamp,1.2,.3,.24,x,0,.94);
      }
      batch(housing);
      return { center, base: center.clone(), radius: 4.7, pivot };
    });
    cube.dispose();
    this.marker = this.nodes[0].center;
    this.nodes[0].pivot.visible = true;
  }
  get verticalError() { return this.marker.y - this.C.player.pos.y - 11; }
  get ready() { return this.C.player.flying && Math.abs(this.verticalError) <= 12; }
  update(dt) {
    const node = this.nodes[this.index];
    this.elapsed += dt;
    const t = this.elapsed, span = 7 + 3 * this.index;
    node.center.set(node.base.x + Math.sin(t * .76) * span, node.base.y + Math.sin(t * 1.3) * 1.8, node.base.z);
    node.pivot.position.copy(node.center);
    node.pivot.rotation.y = Math.sin(t) * .38;
    this.lamp.color.setHex(this.ready ? CYAN : AMBER);
  }
  aim(origin, dir, skip) { return aimAt(this.nodes[this.index], origin, dir, skip); }
  hit(node) {
    const C = this.C;
    if (!this.ready) { C.note('調整飛行高度，等光環轉青再射', 'am'); return false; }
    C.fx.explosion(node.center, .75); C.audio.explosion(node.center, .75);
    node.pivot.visible = false;
    this.index++;
    if (this.index >= this.nodes.length) this.state = 'done';
    else {
      const next = this.nodes[this.index];
      next.pivot.visible = true; this.marker = next.center; this.elapsed = 0;
    }
    return true;
  }
  get hud() {
    const dy = Math.round(this.verticalError);
    return { title: `${this.title}　${this.index}/${this.nodes.length}`,
      hint: !this.C.player.flying ? '先起飛，再和干擾器對準高度'
        : this.ready ? '光環已轉青，用步槍打掉干擾器' : `${dy > 0 ? '上升' : '下降'}約 ${Math.abs(dy)} 公尺，再瞄準射擊`,
      value: this.index / this.nodes.length, color: this.ready ? 'cy' : 'am' };
  }
  dispose() { disposeModel(this.root); }
}

export function createCampaignSetpiece(combat, data) {
  if (data.type === 'reflect') return new ReflectorShot(combat, data);
  if (data.type === 'freight') return new FreightShot(combat, data);
  if (data.type === 'flightShot') return new FlightShot(combat, data);
  throw new Error(`Unknown campaign objective: ${data.type}`);
}
