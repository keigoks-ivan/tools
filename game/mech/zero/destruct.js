// 破壞：所有道具都打得爛（木箱碎裂、紙箱塌、油桶爆炸會連鎖、車子起火再爆炸、護欄碎成塊、沙包一袋一袋被打掉）
//   碎片有簡單物理（重力、彈跳、翻滾、落地停住）；牆被打會噴碎屑、爆炸會噴大塊
import * as THREE from 'three';
import * as PR from './props.js';

const rr = (a, b) => a + Math.random() * (b - a);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// 模型 → 耐久與破法
export const BRK = {
  wooden_military_crate: { hp: 120, kind: 'wood' }, old_military_crate: { hp: 160, kind: 'wood' },
  cardboard_box_01: { hp: 15, kind: 'card' }, plastic_crate_02: { hp: 25, kind: 'plastic' }, trashbag: { hp: 10, kind: 'card' },
  Barrel_01: { hp: 45, kind: 'boom' }, barrel_03: { hp: 140, kind: 'metal' }, propane_tank: { hp: 30, kind: 'boom', small: true },
  metal_jerrycan_green: { hp: 20, kind: 'boom', small: true }, portable_generator: { hp: 160, kind: 'boom' },
  metal_trash_can: { hp: 260, kind: 'metal' }, tool_cart: { hp: 200, kind: 'metal' }, hand_truck: { hp: 90, kind: 'metal' },
  utility_box_02: { hp: 150, kind: 'metal' }, exterior_aircon_unit: { hp: 80, kind: 'metal' }, security_light: { hp: 15, kind: 'glass' },
  mounted_fluorescent_lights: { hp: 10, kind: 'glass' }, metal_office_desk: { hp: 180, kind: 'metal' }, sofa_03: { hp: 140, kind: 'card' },
  steel_frame_shelves_01: { hp: 220, kind: 'metal' }, old_tyre: { hp: 60, kind: 'card' },
  concrete_road_barrier_02: { hp: 480, kind: 'concrete' }, covered_car: { hp: 650, kind: 'car' },
  cement_bag: { hp: 35, kind: 'bag' },
};

class Debris {
  constructor(scene, max = 320) {
    this.max = max; this.list = [];
    const mk = (color, rough, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.mats = { concrete: mk(0x8f8a82, 0.95), wood: mk(0x6e5536, 0.85), metal: mk(0x5c6066, 0.45, 0.8), card: mk(0x8c7552, 0.95), plastic: mk(0x2f5d86, 0.6), dark: mk(0x201e1c, 0.9), brick: mk(0x7c4634, 0.95) };
    this.geo = { chunk: PR.chunk(0).clone().scale(0.5, 0.5, 0.5), plank: new THREE.BoxGeometry(0.06, 0.02, 0.4), plate: new THREE.BoxGeometry(0.18, 0.012, 0.14), shard: new THREE.TetrahedronGeometry(0.06) };
    this.im = {};
    for (const [k, m] of Object.entries(this.mats)) {
      const g = k === 'wood' ? this.geo.plank : k === 'metal' || k === 'plastic' || k === 'card' ? this.geo.plate : this.geo.chunk;
      const im = new THREE.InstancedMesh(g, m, max); im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.userData.noAO = true;
      scene.add(im); this.im[k] = im;
    }
  }
  spawn(p, v, mat, s = 1, life = 10) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ p: p.clone(), v: v.clone(), r: new THREE.Euler(rr(0, 6), rr(0, 6), rr(0, 6)), w: new THREE.Vector3(rr(-9, 9), rr(-9, 9), rr(-9, 9)), mat, s, t: 0, life, rest: false });
  }
  update(dt, solid) {
    const cnt = {};
    for (const k in this.im) cnt[k] = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i]; d.t += dt;
      if (d.t > d.life) { this.list.splice(i, 1); continue; }
      if (!d.rest) {
        d.v.y -= 9.8 * dt;
        d.p.addScaledVector(d.v, dt);
        d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; d.r.z += d.w.z * dt;
        const fl = solid.floorAt(d.p.x, d.p.z, d.p.y + 0.3) + 0.03 * d.s;
        if (d.p.y < fl) {
          d.p.y = fl;
          if (Math.abs(d.v.y) < 1.2) { d.v.set(0, 0, 0); d.rest = true; d.r.x = Math.round(d.r.x / Math.PI) * Math.PI; d.r.z = Math.round(d.r.z / Math.PI) * Math.PI; }
          else { d.v.y = -d.v.y * 0.3; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); }
        }
      }
      const k = d.mat, im = this.im[k]; if (!im) continue;
      const fade = d.t > d.life - 1 ? (d.life - d.t) : 1;
      _q.setFromEuler(d.r); _s.setScalar(d.s * fade);
      im.setMatrixAt(cnt[k]++, _m.compose(d.p, _q, _s));
    }
    for (const k in this.im) { this.im[k].count = cnt[k]; this.im[k].instanceMatrix.needsUpdate = true; }
  }
  clear() { this.list.length = 0; }
}

export class Destruct {
  constructor(G) {
    this.G = G; this.objs = []; this.burning = []; this.queue = [];
    this.debris = new Debris(G.scene);
    this.wrecks = [];
  }
  // Placer.add 之後呼叫：登記一個可破壞的道具（handle＝Placer 回傳的實例把手）
  register(name, handle, box) {
    const B = BRK[name]; if (!B || !handle) return null;
    const o = { name, kind: B.kind, hp: B.hp, hp0: B.hp, small: B.small, handle, box, alive: true, pos: new THREE.Vector3().setFromMatrixPosition(handle.mat) };
    if (box) box.obj = o;
    this.objs.push(o);
    return o;
  }
  // 沙包牆：一整面牆共用一個碰撞盒，打到哪裡掉哪幾袋
  bagWall(box, bags) {
    const w = { kind: 'bagwall', box, bags: bags.map((h) => ({ h, alive: true, pos: new THREE.Vector3().setFromMatrixPosition(h.mat) })), alive: true, hp: 1e9 };
    box.obj = w; this.objs.push(w); return w;
  }

  // 子彈／光束打到東西
  hit(obj, dmg, p, dir, from = 'player') {
    const G = this.G;
    if (!obj || !obj.alive) return;
    if (obj.kind === 'bagwall') {
      // 離命中點最近的 1～2 袋破掉
      let n = dmg > 80 ? 3 : dmg > 30 ? 2 : 1;
      const near = obj.bags.filter((b) => b.alive).sort((a, b) => a.pos.distanceToSquared(p) - b.pos.distanceToSquared(p));
      for (const b of near.slice(0, n)) if (b.pos.distanceTo(p) < 0.9) { b.alive = false; this._hide(b.h); this._sand(b.pos, dir); }
      const left = obj.bags.filter((b) => b.alive).length / obj.bags.length;
      if (left < 0.35) { obj.alive = false; this._unbox(obj); }
      else obj.box.y1 = Math.min(obj.box.y1, obj.box.y0 + (obj.box.y1 - obj.box.y0) * (0.4 + 0.6 * left));
      return;
    }
    obj.hp -= dmg;
    // 還沒破：小碎屑
    if (obj.kind === 'wood') for (let i = 0; i < 2; i++) this.debris.spawn(p, _v.copy(dir).multiplyScalar(-rr(1, 3)).add(new THREE.Vector3(rr(-1, 1), rr(1, 3), rr(-1, 1))), 'wood', 0.5, 5);
    if (obj.kind === 'concrete') for (let i = 0; i < 3; i++) this.debris.spawn(p, _v.copy(dir).multiplyScalar(-rr(1, 3)).add(new THREE.Vector3(rr(-1, 1), rr(1, 3), rr(-1, 1))), 'concrete', 0.18, 6);
    if (obj.kind === 'car' && obj.hp < obj.hp0 * 0.45 && !obj.fire) { obj.fire = true; this.burning.push({ o: obj, t: 0, p: obj.pos.clone().add(new THREE.Vector3(0, 1.1, 0)) }); G.audio.impact && G.audio.impact(obj.pos, 'beam'); }
    if (obj.hp <= 0) this.breakObj(obj, dir);
  }

  breakObj(o, dir = new THREE.Vector3(0, -1, 0)) {
    if (!o.alive) return;
    o.alive = false;
    const G = this.G, p = o.pos.clone(), up = new THREE.Vector3(0, 1, 0);
    this._hide(o.handle); this._unbox(o);
    const burst = (mat, n, sp, s, y = 0.4) => { for (let i = 0; i < n; i++) this.debris.spawn(p.clone().add(new THREE.Vector3(rr(-0.4, 0.4), y + rr(0, 0.5), rr(-0.4, 0.4))), new THREE.Vector3(rr(-1, 1), rr(0.5, 1.6), rr(-1, 1)).multiplyScalar(sp).addScaledVector(dir, 2), mat, s * rr(0.6, 1.3), rr(8, 14)); };
    switch (o.kind) {
      case 'wood': burst('wood', 16, 3, 1); G.fx.puff(p.clone().add(up), [0.45, 0.4, 0.33], 1); G.audio.debris && G.audio.debris(p); break;
      case 'card': burst('card', 10, 2, 0.9, 0.2); G.fx.puff(p.clone().add(up.clone().multiplyScalar(0.3)), [0.5, 0.45, 0.38], 0.7); break;
      case 'plastic': burst('plastic', 8, 2.5, 0.8, 0.1); break;
      case 'glass': G.fx.spray(p, dir.clone().negate(), 10, [2, 2.2, 2.4]); G.audio.hit && G.audio.hit(p, 'glass'); break;
      case 'metal': burst('metal', 10, 3, 1); G.fx.spray(p.clone().add(up.clone().multiplyScalar(0.5)), up, 14); G.audio.debris && G.audio.debris(p); break;
      case 'concrete': burst('concrete', 12, 2.5, 0.8, 0.3); G.fx.puff(p.clone().add(up.clone().multiplyScalar(0.5)), [0.55, 0.53, 0.5], 1.6); G.audio.debris && G.audio.debris(p);
        // 留下一小堆碎塊當矮掩體
        this.G.solid.add({ x0: p.x - 0.7, x1: p.x + 0.7, y0: 0, y1: 0.35, z0: p.z - 0.4, z1: p.z + 0.4, mat: 'concrete' }); break;
      case 'boom': this.explode(p.clone().add(new THREE.Vector3(0, 0.5, 0)), o.small ? 0.7 : 1.1); burst('metal', 8, 6, 1); break;
      case 'car': this.explode(p.clone().add(new THREE.Vector3(0, 1, 0)), 1.6); burst('metal', 14, 7, 1.3); this._wreck(o); break;
    }
  }

  // 爆炸：傷害範圍內的敵人、玩家、其他道具（油桶會連鎖，稍微延遲比較好看）
  explode(p, s = 1) {
    const G = this.G, r = 4.5 * s;
    G.fx.explode(p, s); G.audio.explosion(p, 0.7 * s);
    G.splash(p, r, 110 * s);
    for (const o of this.objs) {
      if (!o.alive) continue;
      const c = o.kind === 'bagwall' ? o.box && _v.set((o.box.x0 + o.box.x1) / 2, 0.4, (o.box.z0 + o.box.z1) / 2) : o.pos;
      const d = c.distanceTo(p); if (d > r) continue;
      const dmg = 260 * s * (1 - d / r);
      const dir = _v.subVectors(c, p).normalize().clone();
      if (o.kind === 'boom') this.queue.push({ t: rr(0.12, 0.3), o, dmg, dir }); else this.hit(o, dmg, c.clone(), dir);
    }
    // 牆面也噴出大塊碎石
    for (let i = 0; i < 14 * s; i++) this.debris.spawn(p, new THREE.Vector3(rr(-1, 1), rr(0.3, 1.5), rr(-1, 1)).multiplyScalar(rr(3, 9)), Math.random() < 0.5 ? 'concrete' : 'dark', rr(0.3, 0.8), rr(8, 14));
  }

  // 牆被打：碎屑＋灰；大威力打出一片崩落
  wall(p, n, mat, dmg) {
    const k = mat === 'brick' || mat === 'kbrick' ? 'brick' : /metal|rust|corr|olive/.test(mat) ? 'metal' : 'concrete';
    const cnt = dmg > 100 ? 5 : 2;
    for (let i = 0; i < cnt; i++) this.debris.spawn(p.clone().addScaledVector(n, 0.05), n.clone().multiplyScalar(rr(1.5, 4)).add(new THREE.Vector3(rr(-1, 1), rr(0, 2), rr(-1, 1))), k, k === 'metal' ? 0.4 : rr(0.1, 0.25), rr(5, 9));
  }

  _hide(h) { if (h && h.hide) h.hide(); }
  _unbox(o) { if (o.box) { o.box.dead = true; } }
  _sand(p, dir) { this.G.fx.puff(p, [0.55, 0.5, 0.42], 0.8); for (let i = 0; i < 3; i++) this.debris.spawn(p, new THREE.Vector3(rr(-1, 1), rr(0.5, 2), rr(-1, 1)).addScaledVector(dir, 1.5), 'card', 0.6, 6); }
  // 燒完的車架（深色、冒煙）
  _wreck(o) {
    const g = PR.car(), m = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d1a18, roughness: 0.9, metalness: 0.4 });
    for (const k of ['body', 'dark', 'metal']) { const mesh = new THREE.Mesh(g[k], mat); mesh.castShadow = mesh.receiveShadow = true; m.add(mesh); }
    _e.setFromRotationMatrix(o.handle.mat); m.rotation.y = _e.y;
    m.position.copy(o.pos); m.scale.set(1, 0.92, 1);
    this.G.scene.add(m); this.wrecks.push(m);
    this.G.solid.add({ x0: o.pos.x - 1.1, x1: o.pos.x + 1.1, y0: 0, y1: 1.1, z0: o.pos.z - 1.1, z1: o.pos.z + 1.1, mat: 'metal' });
    this.burning.push({ o: null, t: 0, p: o.pos.clone().add(new THREE.Vector3(0, 1, 0)), smoke: 25 });
  }

  update(dt) {
    const G = this.G;
    for (let i = this.queue.length - 1; i >= 0; i--) { const q = this.queue[i]; q.t -= dt; if (q.t <= 0) { this.queue.splice(i, 1); this.hit(q.o, q.dmg, q.o.pos.clone(), q.dir); } }
    // 燃燒：火焰＋濃煙；車子燒一陣子會自己爆
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i]; b.t += dt;
      if (Math.random() < dt * 14) G.fx.glow.add({ p: b.p.clone().add(new THREE.Vector3(rr(-0.6, 0.6), rr(-0.2, 0.3), rr(-0.9, 0.9))), v: new THREE.Vector3(rr(-0.2, 0.2), rr(0.8, 1.6), rr(-0.2, 0.2)), t: 0, life: rr(0.4, 0.8), s0: 0.25, s1: 0.6, a: 0.9, c: new THREE.Color(2.4, 0.9, 0.25), rot: rr(0, 6), rise: 1.5 });
      if (Math.random() < dt * 5) G.fx.smoke.add({ p: b.p.clone().add(new THREE.Vector3(rr(-0.4, 0.4), 0.5, rr(-0.4, 0.4))), v: new THREE.Vector3(rr(-0.3, 0.3), rr(1, 2), rr(-0.3, 0.3)), t: 0, life: rr(3, 5), s0: 0.4, s1: rr(2, 3), a: 0.45, c: new THREE.Color(0.12, 0.11, 0.1), rot: rr(0, 6), rise: 0.5 });
      if (Math.random() < dt * 3) G.fx.flash(b.p, new THREE.Color(1, 0.5, 0.2), 8, 8, 0.25);
      if (b.o && b.o.alive && b.t > 7) this.breakObj(b.o);
      if (!b.o || !b.o.alive) { if (b.t > (b.smoke || 0) + (b.o ? 7 : 0)) this.burning.splice(i, 1); }
    }
    this.debris.update(dt, G.solid);
  }
  clear() { this.debris.clear(); this.burning.length = 0; this.queue.length = 0; }
}
