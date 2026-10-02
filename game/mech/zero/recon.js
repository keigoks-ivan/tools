import * as THREE from 'three';
const clamp = THREE.MathUtils.clamp;
export class Contacts {
  constructor() { this.items = new Map(); this.search = []; this.clock = 0; this.now = 0; }
  reset() { this.items.clear(); this.search.length = 0; this.clock = 0; this.now = 0; }
  reveal(e, now) { if (!e.dead) this.items.set(e.id, { id: e.id, p: e.pos.clone(), t: now, type: e.type, fresh: true }); }
  searchAreas(enemies) {
    const areas = new Map();
    for (const e of enemies) {
      if (e.dead) continue;
      const x = Math.floor(e.pos.x / 20) * 20 + 10, z = Math.floor(e.pos.z / 20) * 20 + 10, y = Math.floor(e.pos.y / 3) * 3;
      areas.set(`${x}:${y}:${z}`, { p: new THREE.Vector3(x, y, z), radius: 15 });
    }
    this.search = [...areas.values()];
  }
  update(dt, G, camera) {
    this.now += dt; this.clock += dt;
    // 屍體與已清除的駐軍移除；暫時卸載的活人保留最後目擊位置。
    for (const [id, c] of this.items) {
      const e = G.enemies.find(e => e.id === id), r = !e && G.patrols?.records.find(r => r.data.id === id);
      if (e?.dead || r?.dead || !e && !r) this.items.delete(id);
      else c.fresh = this.now - c.t < 1;
    }
    if (this.clock < .25) return; this.clock = 0;
    camera.updateMatrixWorld();
    const origin = camera.position, point = new THREE.Vector3(), screen = new THREE.Vector3();
    const visible = p => {
      screen.copy(p).project(camera);
      return screen.z >= -1 && screen.z <= 1 && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && (G.reconSees ? G.reconSees(origin, p) : G.solid.sees(origin, p));
    };
    for (const e of G.enemies) {
      if (e.dead || e.pos.distanceTo(origin) > 95) continue;
      // 動畫骨架包含蹲姿與體型；頭或胸口露出才登記，完全遮蔽不穿牆標記。
      if (e.s) e.s.headPos(point); else point.copy(e.pos).y += e.type === 'drone' ? 0 : 1.4;
      let seen = visible(point);
      if (!seen && e.type !== 'drone') {
        if (e.s) e.s.chestPos(point); else point.copy(e.pos).y += .9;
        seen = visible(point);
      }
      if (seen) this.reveal(e, this.now);
    }
  }
}
export class Scout {
  constructor(G) { this.G = G; this.active = false; this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0; this.battery = 45; this.range = 85; this.cooldown = 0; this.reason = '';
    this.root = new THREE.Group(); this.root.visible = false; G.scene?.add(this.root);
    const metal = new THREE.MeshStandardMaterial({ color: 0x405560, roughness: .43, metalness: .65 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151e24, roughness: .7, metalness: .3 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(.21, .17, .14, 12), metal); this.root.add(hull);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(.065, 10, 6), new THREE.MeshStandardMaterial({ color: 0x73d9e6, roughness: .12, metalness: .6 })); lens.position.set(0, -.035, .21); this.root.add(lens);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(.36, .035, .04), metal, 4);
    const hubs = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .055, .08, 8), dark, 4);
    const blades = this.blades = new THREE.InstancedMesh(new THREE.BoxGeometry(.27, .008, .025), dark, 4);
    this.rotorT = 0; this.rotorPoints = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2, p = new THREE.Vector3(Math.cos(a) * .21, 0, Math.sin(a) * .21); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); arms.setMatrixAt(i, m.compose(p, q, scale)); p.multiplyScalar(1.8); hubs.setMatrixAt(i, m.compose(p, q, scale)); p.y = .055; this.rotorPoints.push(p.clone()); blades.setMatrixAt(i, m.compose(p, q, scale)); }
    this.root.add(arms, hubs, blades); this.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }
  reset() { this.active = false; this.root.visible = false; this.battery = 45; this.cooldown = 0; this.reason = ''; }
  return(reason = '') { if (!this.active) return; this.active = false; this.root.visible = false; this.reason = reason; this.cooldown = 2; if (reason) this.G.hud.note(reason); }
  toggle() {
    if (this.active) { this.return('切回主角'); return false; }
    if (this.G.player.dead || this.battery < 8 || this.cooldown > 0 || this.G.vm?.busy) { this.G.hud.note('無人機整備中，請稍候'); return false; }
    const P = this.G.player, p = P.pos.clone(); p.y += P.eyeH + .35;
    if (this.G.solid.pushOut(p.clone(), .4, p.y - .2, p.y + .2, 0)) { this.G.hud.note('上方空間不足，無法放飛'); return false; }
    this.pos.copy(p); this.yaw = P.yaw; this.pitch = -.15; this.active = true; this.reason = ''; P.vel.set(0, 0, 0); this.root.visible = true; this.root.position.copy(p); if (this.G.vm) { this.G.vm.ads = 0; this.G.vm.scoped = false; }
    this.G.hud.note('偵察無人機上線・主角留在原地'); return true;
  }
  update(dt, ctl = {}) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!this.active) { this.battery = Math.min(45, this.battery + dt * .6); return; }
    this.battery = Math.max(0, this.battery - dt * (ctl.sprint ? 1.4 : 1));
    if (this.G.player.dead || this.battery <= 0) { this.return('電量不足・切回主角'); return; }
    this.rotorT += dt * 55;
    const rotorMatrix = new THREE.Matrix4().makeRotationY(this.rotorT);
    for (let i = 0; i < 4; i++) { rotorMatrix.setPosition(this.rotorPoints[i]); this.blades.setMatrixAt(i, rotorMatrix); }
    this.blades.instanceMatrix.needsUpdate = true;
    this.yaw -= ctl.lookX || 0; this.pitch = clamp(this.pitch - (ctl.lookY || 0), -1.35, 1.2);
    const speed = ctl.sprint ? 11 : 7, sn = Math.sin(this.yaw), cs = Math.cos(this.yaw);
    const move = new THREE.Vector3(sn * (ctl.my || 0) - cs * (ctl.mx || 0), (ctl.up ? 1 : 0) - (ctl.down ? 1 : 0), cs * (ctl.my || 0) + sn * (ctl.mx || 0)).clampLength(0, 1).multiplyScalar(speed * dt);
    const L = move.length();
    if (L > 0) { const hit = this.G.solid.ray(this.pos, move.clone().normalize(), L + .4); if (hit) move.setLength(Math.max(0, hit.t - .4)); }
    const p = this.pos.clone().add(move), from = this.G.player.pos;
    const floor = this.G.solid.floorAt(p.x, p.z, p.y + .2);
    if (p.y < floor + .5 || p.y > from.y + 24 || p.distanceTo(from) > this.range || this.G.solid.pushOut(p.clone(), .4, p.y - .2, p.y + .2, 0)) return;
    this.pos.copy(p); this.root.position.copy(p); this.root.rotation.y = this.yaw;
  }
  camera(camera) { this.root.visible = false; camera.position.copy(this.pos).add(new THREE.Vector3(Math.sin(this.yaw) * .28, .02, Math.cos(this.yaw) * .28)); camera.rotation.set(this.pitch, this.yaw + Math.PI, 0); camera.fov = 72; camera.updateProjectionMatrix(); camera.updateMatrixWorld(); }
  attacked() { this.return('主角遭到攻擊・已切回主角'); }
}
