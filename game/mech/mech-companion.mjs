import * as THREE from 'three';
import { Mech } from './mechs.js';
import { damp, lerpAngle } from './anim.js';
import { createFootContactShadows } from './foot-contact.mjs?v=1';
import { rayCapsule } from './flight.mjs';
import { routeDirection, segmentBox, steer } from './tactics.js';

const RADIUS = 3.5;
const RANGE = 320;
const THINK = .28;
const clamp = THREE.MathUtils.clamp;
const point = () => new THREE.Vector3();

// 優先從側面加入編隊，窄街才退到玩家身後。沒有空位時下次再試。
export function companionSpawn(world, player, preferred = 1, occupied = null) {
  const { pos, yaw } = player;
  const sx = Math.sin(yaw), cz = Math.cos(yaw);
  const result = point();
  for (const [lateral, along] of [[20, 12], [-20, 12], [20, -18], [-20, -18], [0, -24], [0, 22]]) {
    const side=lateral*preferred;
    const x = clamp(pos.x + side * cz + along * sx, -697, 697);
    const z = clamp(pos.z - side * sx + along * cz, -697, 697);
    if (Math.hypot(x - pos.x, z - pos.z) < 13) continue;
    const ground = world.support(x, z, RADIUS, pos.y);
    const y = Math.max(ground, player.flying ? pos.y - 5 : ground);
    result.set(x, y, z);
    if(occupied && result.distanceToSquared(occupied)<15**2)continue;
    if (!world.collide(result, RADIUS, y)) return { position: result, side: Math.sign(side) || preferred };
  }
  return null;
}

export class MechCompanion {
  constructor(combat, order, spawn) {
    this.combat = combat;
    this.order = order;
    this.name = order.name || '斑鳩';
    this.mech = new Mech('grunt', 'ally');
    this.root = this.mech.root;
    this.root.name = '第三裝甲連・' + this.name;
    this.root.position.copy(spawn.position);
    this.root.updateMatrixWorld(true);
    this.mech.footContacts = createFootContactShadows(this.root, [this.mech.bones.ankleR, this.mech.bones.ankleL]);
    this.pos = this.root.position;
    this.heading = this.face = this.mech.legYaw = combat.player.yaw;
    this.side = spawn.side;
    this.vel = point();
    this.goal = point();
    this.move = point();
    this.from = point();
    this.aim = point();
    this.direction = point();
    this.hitNormal = point();
    this.path = {};
    this.boxes = [];
    this.candidates = [];
    this.target = null;
    this.thinkIn = 0;
    this.fireIn = .65;
    this.groundAt = (x, z) => combat.world.support(x, z, .45, this.pos.y);
    this.pose = { vel: this.vel, groundAt: this.groundAt, pitch: 0, lean: 0 };
    combat.scene.add(this.root);
  }

  plan() {
    const { player, world, stats } = this.combat;
    const { pos, goal, side } = this;
    const pace = Math.hypot(player.vel.x, player.vel.z);
    if (pace > 6) this.heading = lerpAngle(this.heading, Math.atan2(player.vel.x, player.vel.z), .38);
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    for (const [lateral, behind] of [[18 * side, 14], [-18 * side, 14], [0, 21], [0, 0]]) {
      goal.set(clamp(player.pos.x + c * lateral - s * behind, -697, 697), pos.y,
        clamp(player.pos.z - s * lateral - c * behind, -697, 697));
      if (!world.collide(goal, RADIUS, pos.y)) break;
    }
    this.lag = Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z);
    this.flightY = player.pos.y - world.height(player.pos.x, player.pos.z) > 5 ? player.pos.y - 5 : null;
    const distance = Math.hypot(goal.x - pos.x, goal.z - pos.z);
    this.move.set(0, 0, 0);
    if (distance > 5) {
      world.nearBoxes(pos.x, pos.z, 160, this.boxes);
      const clear = (ax, az, bx, bz) => !this.boxes.some(box => box.top > pos.y + 1.5 && segmentBox(ax, az, bx, bz, box, RADIUS));
      const nav = routeDirection(this.path, pos, goal, clear, stats.time, 14)
        || steer(goal.x - pos.x, goal.z - pos.z, (x, z) => !clear(pos.x, pos.z, pos.x + x * 9, pos.z + z * 9), side);
      const speed = Math.min(distance * 1.75, this.lag > 66 ? 53 : pace > 20 ? 39 : 23);
      this.move.set(nav.x * speed, 0, nav.z * speed);
    }
    this.target = this.lag < 85 ? this.pickTarget() : null;
  }

  canSupport(enemy) {
    return enemy && !enemy.dead && !enemy.gone && !enemy.dropping && enemy.ap > Math.ceil(enemy.apMax * .25)
      && !enemy.bossName && !enemy.fleeAt && enemy !== this.combat.boss;
  }

  pickTarget() {
    const C = this.combat, list = this.candidates;
    list.length = 0;
    for (const enemy of C.enemies) {
      if (!this.canSupport(enemy)) continue;
      const distance = enemy.chest(this.aim).distanceTo(this.pos);
      if (distance > RANGE) continue;
      const score = distance - (enemy === C.lockTarget ? 65 : 0) - (enemy.warn > .6 ? 34 : 0)
        - (this.order.tanks && enemy.kind === 'tank' ? 76 : 0)
        - (this.order.aggressors && (enemy.kind === 'brawler' || enemy.kind === 'ace') ? 82 : 0);
      list.push({ enemy, score });
    }
    list.sort((a, b) => a.score - b.score);
    for (let i = 0; i < Math.min(list.length, 3); i++) {
      const { enemy } = list[i];
      this.from.copy(this.pos); this.from.y += 11;
      if (C.world.raycast(this.from, enemy.chest(this.aim), null) < 0) return enemy;
    }
    return null;
  }

  update(dt) {
    const C = this.combat, { pos, vel, move, mech, pose, aim } = this;
    this.thinkIn -= dt; this.fireIn -= dt;
    if (this.thinkIn <= 0) { this.plan(); this.thinkIn = THINK; }
    vel.x = damp(vel.x, move.x, 5, dt);
    vel.z = damp(vel.z, move.z, 5, dt);
    pos.x = clamp(pos.x + vel.x * dt, -700, 700);
    pos.z = clamp(pos.z + vel.z * dt, -700, 700);
    C.world.collide(pos, RADIUS, pos.y);
    const ground = C.world.support(pos.x, pos.z, RADIUS, pos.y);
    const desiredY = Math.max(ground, this.flightY ?? ground);
    vel.y = clamp((desiredY - pos.y) * 3, -22, 28);
    pos.y = desiredY - ground < .05 && pos.y - ground < .3 ? ground : Math.max(ground, pos.y + vel.y * dt);
    const grounded = pos.y === ground;
    const target = this.canSupport(this.target) ? this.target : null;
    const speed = Math.hypot(vel.x, vel.z);
    if (target) target.chest(aim);
    const face = target ? Math.atan2(aim.x - pos.x, aim.z - pos.z) : speed > 1.5 ? Math.atan2(vel.x, vel.z) : this.heading;
    this.face = lerpAngle(this.face, face, 1 - Math.exp(-dt * 6));
    pose.grounded = grounded;
    pose.boost = grounded && speed > 26 ? 1 : 0;
    pose.thrust = grounded ? pose.boost * .6 : .62;
    pose.flight = grounded ? 0 : 1;
    pose.torsoYaw = this.face;
    pose.aim = target ? aim : null;
    mech.animate(dt, pose);
    if (target && this.fireIn <= 0 && Math.cos(this.face - face) > .97) this.fire(target);
    if (mech.footfall) C.audio.enemyStep(pos, .55);
  }

  fire(target) {
    const C = this.combat, { from, aim, direction, mech } = this;
    mech.muzzle.getWorldPosition(from);
    direction.subVectors(aim, from);
    const distance = direction.length();
    this.fireIn = .24;
    if (distance < 1 || distance > RANGE || C.world.raycast(from, aim, null) >= 0) return;
    direction.divideScalar(distance);
    if (rayCapsule(from, direction, C.hero.capsule(), distance) >= 0) return;
    this.fireIn = 1.28;
    mech.recoil = .72;
    C.fx.tracer(from, aim);
    C.fx.muzzle(from, direction, 'mg');
    C.fx.impact(aim, this.hitNormal.copy(direction).negate(), 'armor');
    C.audio.mg(from);
    C.damageEnemy(target, target.vehicle ? 72 : 260, 34, aim, direction, false, true);
  }

  dispose() {
    this.root.removeFromParent();
    this.mech.footContacts.mesh.geometry.dispose();
  }
}
