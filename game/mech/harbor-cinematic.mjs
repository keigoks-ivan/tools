import * as THREE from 'three';

const DURATION = { intercept: 4, boss: 3.2, reveal: 4.4 };
const ease = (x) => x * x * (3 - 2 * x);

// 用同一台遊戲鏡頭拍現場機體。鏡頭以角色為基準，避免固定世界座標穿過高樓。
export class HarborCinematic {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.heroPoint = new THREE.Vector3();
    this.focusPoint = new THREE.Vector3();
    this.forward = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.want = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.actors = [];
    this.progress = 0;
    this.shot = -1;
  }

  start(kind, { hero, focus, player, actors = [] }) {
    this.finish();
    this.kind = kind;
    this.duration = DURATION[kind];
    this.hero = hero;
    this.focus = focus;
    this.player = player;
    this.time = 0;
    this.shot = -1;
    if (kind !== 'reveal') actors.forEach((enemy, i) => this.stageActor(enemy, i));
    this.update(0);
    return this.duration;
  }

  finish() {
    for (const { root, group, parent } of this.actors) {
      if (root.parent === group) parent.add(root);
      group.removeFromParent();
    }
    this.actors.length = 0;
    this.focusActor = null;
    this.kind = null;
    this.hero = this.focus = this.player = null;
  }

  stageActor(enemy, i) {
    const m = enemy?.m, root = m?.root, parent = root?.parent;
    if (!parent) return;
    const offset = new THREE.Vector3(0, 12 + 3 * i, this.kind === 'boss' ? 28 : 22 + 4 * i);
    // 只在入鏡時檢查通道；若前方有樓，就改成原地自上方下降。
    const from = this.heroPoint, to = this.want;
    let clearance = 1;
    for (const x of [0, -3 * m.scale, 3 * m.scale]) {
      from.copy(root.position); from.x += x;
      to.copy(from).add(offset);
      const hit = this.world.raycast(from, to, null);
      if (hit >= 0) clearance = Math.min(clearance, Math.max(0, hit - .12));
    }
    if (clearance < .5) offset.z = 0;
    else offset.multiplyScalar(clearance);
    // Enemy.pos 與 root.position 共用；位移掛在暫時的父節點，不碰戰鬥座標。
    const group = new THREE.Group();
    parent.add(group); group.add(root);
    const pose = { vel: new THREE.Vector3(), grounded: false, boost: 0, torsoYaw: enemy.face, pitch: -.12, thrust: .75, aim: null, lean: 0, flight: 1 };
    const actor = { m, root, group, parent, offset, pose, delay: .09 * i };
    this.actors.push(actor);
    if (enemy === this.focus) this.focusActor = actor;
  }

  updateActors(f, dt) {
    for (const { m, group, offset, pose, delay } of this.actors) {
      const span = .86 - delay;
      const u = THREE.MathUtils.clamp((f - delay) / span, 0, 1);
      const speed = 6 * u * (1 - u);
      group.position.copy(offset).multiplyScalar(1 - ease(u));
      pose.vel.copy(offset).multiplyScalar(-speed / (span * this.duration));
      pose.thrust = .68 + .21 * speed;
      pose.lean = .12 * speed;
      m.animate(dt, pose);
    }
  }

  update(dt) {
    if (!this.kind) return true;
    this.time = Math.min(this.duration, this.time + dt);
    const f = this.progress = this.time / this.duration;
    this.updateActors(f, dt);
    const h = this.heroPoint.copy(this.player.pos);
    h.y += 11 * this.hero.scale;
    const focus = this.focusPoint;
    if (this.focus?.chest) {
      this.focus.chest(focus);
      if (this.focusActor) focus.add(this.focusActor.group.position);
    }
    else if (this.focus) { focus.copy(this.focus); focus.y += 3; }
    else focus.set(h.x + 45 * Math.sin(this.player.yaw), h.y + 5, h.z + 45 * Math.cos(this.player.yaw));

    const forward = this.forward.subVectors(focus, h);
    forward.y = 0;
    if (forward.lengthSq() < 1) forward.set(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw));
    forward.normalize();
    const side = this.side.set(forward.z, 0, -forward.x);

    let anchor = h, across, back, above, shot = 0;
    if (this.kind === 'intercept' && f < .48) {
      const x = ease(f / .48);
      // 先看蒼焰轉向訊號，再切到對方的機體。
      across = 5 + 10 * x; back = -31 + 5 * x; above = 4 + 3 * x;
      this.look.copy(h).lerp(focus, .18 + .18 * x);
    } else if (this.kind === 'reveal') {
      const x = ease(f);
      across = 9 + 8 * x; back = -24 + 5 * x; above = 1 + 5 * x;
      this.look.copy(focus).lerp(h, .18 + .55 * x);
    } else {
      const x = this.kind === 'boss' ? ease(f) : ease((f - .48) / .52);
      const k = this.focus?.scale || 1;
      anchor = focus; shot = 1;
      across = (-15 + 24 * x) * k; back = (-29 + 6 * x) * k; above = (2 + 5 * x) * k;
      this.look.copy(focus);
    }

    this.want.copy(anchor).addScaledVector(forward, back).addScaledVector(side, across);
    this.want.y = Math.max(this.want.y + above, this.world.height(this.want.x, this.want.z) + 2);
    const hit = this.world.raycast(anchor, this.want, null);
    const arm = hit < 0 ? 1 : Math.max(.04, hit - .065);
    this.arm = this.shot !== shot ? arm : Math.min(arm, this.arm + dt * 1.8);
    this.shot = shot;
    this.camera.position.lerpVectors(anchor, this.want, this.arm);
    this.camera.lookAt(this.look);
    return f >= 1;
  }
}
