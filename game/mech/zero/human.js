// 真人士兵：Mixamo 動作捕捉（站／走／跑）＋程序層（上身瞄準、雙手 IK 握槍、蹲姿、中彈晃動、布娃娃倒地）
//   同一個模型換塗裝：敵軍步兵（橄欖綠＋紅眼）、狙擊兵、指揮官（紅）、重裝兵（鐵灰）、自己的駕駛員（白＋深藍，只留手臂）
//   座標：root 的 +Z＝面向，+Y＝上，右手在 −X（和機體同一套）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

// ---------------------------------------------------------------- 塗裝
// armor＝硬甲、cloth＝布料、accent＝原本紅條紋、under＝黑色內襯的色偏、eye＝面罩發光（>1 會泛光）
export const LOOKS = {
  trooper: { armor: 0x77825a, cloth: 0x2d3226, accent: 0x7a2a22, under: 0x1b1d1a, eye: [3.2, 0.25, 0.15] },
  sniper: { armor: 0x4b4f4c, cloth: 0x3a3a33, accent: 0x6b5a3a, under: 0x19191a, eye: [5, 0.9, 0.2] },
  officer: { armor: 0x7d1e22, cloth: 0x2b1a1a, accent: 0x2a2a2e, under: 0x161515, eye: [6, 0.4, 0.3] },
  heavy: { armor: 0x4a4e53, cloth: 0x2c2f33, accent: 0xb85c18, under: 0x151617, eye: [6, 2.2, 0.3] },
  pilot: { armor: 0xdfe2de, cloth: 0x1c2f63, accent: 0xb6262e, under: 0x14161b, eye: [0.3, 2.2, 3] },
};

// ---------------------------------------------------------------- 資源
export class HumanKit {
  static async load(url) {
    const loader = new GLTFLoader();
    const [gltf, motion] = await Promise.all([loader.loadAsync(url), loader.loadAsync(new URL('./assets/soldier-motion.glb', import.meta.url).href)]);
    gltf.animations.push(...motion.animations);
    return new HumanKit(gltf);
  }
  constructor(gltf) {
    this.gltf = gltf;
    // 動作只留旋轉＋腰部位移（縮放、其他位移軌都是常數，拿掉省 mixer 工）
    this.clips = {};
    for (const c of gltf.animations) {
      c.tracks = c.tracks.filter((t) => t.name.endsWith('.quaternion') || /Hips\.position$/.test(t.name));
      this.clips[c.name] = c;
    }
    gltf.scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (/visor/i.test(o.name)) this.visor = o; else this.body = o;
    });
    this.baseMap = this.body.material.map;
    this.normalMap = this.body.material.normalMap;
    this._prepMasks();
    this.mats = {};
    this._calibrate();
  }

  // 貼圖分區（硬甲／布／紅條／金屬／黑內襯），每種塗裝都用同一份遮罩重新上色；另外做粗糙度＋金屬度貼圖
  _prepMasks() {
    const img = this.baseMap.image, W = img.width, H = img.height;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const src = cx.getImageData(0, 0, W, H).data;
    const n = W * H, M = new Float32Array(n * 5);
    const orm = new Uint8ClampedArray(n * 4);
    const s = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    for (let i = 0; i < n; i++) {
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      const L = 0.3 * r + 0.59 * g + 0.11 * b, mx = Math.max(g, b);
      const red = s(40, 90, r - mx) * s(70, 110, r);
      const tan = s(18, 45, r - b) * s(80, 140, L) * (1 - red);
      const green = s(2, 14, g - b) * s(-18, -4, g - r) * (1 - tan) * (1 - red);
      const metal = s(4, 16, b - r) * s(50, 90, L) * (1 - tan) * (1 - green);
      const dark = (1 - s(35, 70, L)) * (1 - red) * (1 - tan) * (1 - green) * (1 - metal);
      M[i * 5] = tan; M[i * 5 + 1] = green; M[i * 5 + 2] = red; M[i * 5 + 3] = metal; M[i * 5 + 4] = dark;
      // 粗糙度：甲 0.5、布 0.92、金屬 0.35、內襯 0.8；掉漆處（甲上暗點）更粗
      const rough = 0.5 * tan + 0.92 * green + 0.48 * red + 0.35 * metal + 0.8 * dark + 0.75 * (1 - tan - green - red - metal - dark);
      orm[i * 4] = 255; orm[i * 4 + 1] = clamp(rough, 0.05, 1) * 255; orm[i * 4 + 2] = clamp(metal * 0.85 + tan * 0.05, 0, 1) * 255; orm[i * 4 + 3] = 255;
    }
    this.src = src; this.masks = M; this.W = W; this.H = H;
    const ot = new THREE.DataTexture(orm, W, H, THREE.RGBAFormat);
    ot.flipY = this.baseMap.flipY; ot.wrapS = ot.wrapT = THREE.RepeatWrapping; ot.generateMipmaps = true;
    ot.minFilter = THREE.LinearMipmapLinearFilter; ot.magFilter = THREE.LinearFilter; ot.needsUpdate = true;
    this.orm = ot;
  }

  material(look) {
    if (this.mats[look]) return this.mats[look];
    const P = LOOKS[look], W = this.W, H = this.H, n = W * H, M = this.masks, src = this.src;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d');
    const id = cx.createImageData(W, H), o = id.data;
    const col = (hex) => { const c = new THREE.Color(hex); return [c.r * 255, c.g * 255, c.b * 255]; };
    // 新顏色 × (像素亮度 ÷ 該區平均亮度)：保留刮痕、掉漆、髒污
    const A = col(P.armor), C = col(P.cloth), R = col(P.accent), U = col(P.under);
    for (let i = 0; i < n; i++) {
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      const L = 0.3 * r + 0.59 * g + 0.11 * b;
      const tan = M[i * 5], green = M[i * 5 + 1], red = M[i * 5 + 2], dark = M[i * 5 + 4];
      const keep = Math.max(0, 1 - tan - green - red - dark * 0.6);
      const ka = Math.pow(L / 200, 1.25) * 1.2, kc = L / 72, kr = L / 70, ku = (L + 8) / 34;
      for (let k = 0; k < 3; k++) {
        const orig = src[i * 4 + k];
        o[i * 4 + k] = orig * keep + A[k] * ka * tan + C[k] * kc * green + R[k] * kr * red + U[k] * ku * dark * 0.6;
      }
      o[i * 4 + 3] = 255;
    }
    cx.putImageData(id, 0, 0);
    const map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace; map.flipY = this.baseMap.flipY; map.anisotropy = 4;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const body = new THREE.MeshStandardMaterial({ map, normalMap: this.normalMap, roughnessMap: this.orm, metalnessMap: this.orm, roughness: 1, metalness: 1, envMapIntensity: 1.0 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.12, metalness: 0.9, emissive: new THREE.Color(P.eye[0], P.eye[1], P.eye[2]).multiplyScalar(0.012), envMapIntensity: 1.6 });
    const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(P.eye[0], P.eye[1], P.eye[2]), toneMapped: true, fog: true });
    return (this.mats[look] = { body, visor, eye });
  }

  // 用 T 姿勢量測：手的指向／指節方向（算握槍手型）、手指彎曲軸、頭的前方、各段骨長、自然走跑速度
  _calibrate() {
    const m = SkeletonUtils.clone(this.gltf.scene);
    m.rotation.y = Math.PI;
    const g = new THREE.Group(); g.add(m);
    const B = boneMap(m);
    const mixer = new THREE.AnimationMixer(m);
    mixer.clipAction(this.clips.TPose).play(); mixer.update(0);
    g.updateMatrixWorld(true);
    const wp = (b, v = new THREE.Vector3()) => b.getWorldPosition(v);
    const wq = (b, q = new THREE.Quaternion()) => b.getWorldQuaternion(q);
    const cal = { hand: {}, finger: {} };
    for (const side of ['Left', 'Right']) {
      const hand = B[side + 'Hand'];
      const h = wp(hand), mid = wp(B[side + 'HandMiddle1']), idx = wp(B[side + 'HandIndex1']), pky = wp(B[side + 'HandPinky1']), th = wp(B[side + 'HandThumb2']);
      const D = mid.clone().sub(h).normalize();
      const S = pky.clone().sub(idx); S.addScaledVector(D, -S.dot(D)).normalize();
      // 掌心方向：拇指在掌心那一側
      const P = th.clone().sub(h); P.addScaledVector(D, -P.dot(D)); P.addScaledVector(S, -P.dot(S)).normalize();
      const Q = wq(hand);
      const basis = basisOf(D, S);
      cal.hand[side] = { Q, basis, D, S, P };
      // 手指彎曲：繞指節線轉，方向要讓指尖往掌心那側收
      const sign = Math.sign(_a.crossVectors(S, D).dot(P)) || 1;
      for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
        for (let k = 1; k <= 3; k++) {
          const fb = B[side + 'Hand' + f + k]; if (!fb) continue;
          let axis;
          if (f === 'Thumb') {
            const t0 = wp(B[side + 'Hand' + 'Thumb' + k]), t1 = wp(B[side + 'Hand' + 'Thumb' + (k + 1)]);
            const td = t1.sub(t0).normalize();
            axis = _b.crossVectors(td, P).normalize().multiplyScalar(-1).clone();
          } else axis = S.clone().multiplyScalar(sign);
          const inv = wq(fb).invert();
          cal.finger[side + f + k] = axis.applyQuaternion(inv).normalize();
        }
      }
    }
    const head = B.Head;
    cal.headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wq(head).invert());
    cal.chestFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(wq(B.Spine2).invert());
    cal.eye = wp(B.Head).add(new THREE.Vector3(0, 0.09, 0.11));
    cal.len = {
      armU: wp(B.RightArm).distanceTo(wp(B.RightForeArm)), armL: wp(B.RightForeArm).distanceTo(wp(B.RightHand)),
      legU: wp(B.RightUpLeg).distanceTo(wp(B.RightLeg)), legL: wp(B.RightLeg).distanceTo(wp(B.RightFoot)),
    };
    // 自然速度：支撐腳貼地時，腳相對身體往後滑的速度＝這個動作「應該」的前進速度
    cal.speed = {};
    for (const name of ['Walk', 'Run', 'CrouchWalk']) {
      mixer.stopAllAction();
      const act = mixer.clipAction(this.clips[name]); act.reset().play();
      const dur = this.clips[name].duration, N = 48, pts = [];
      for (let i = 0; i <= N; i++) { act.time = (i / N) * dur; mixer.update(0); g.updateMatrixWorld(true); pts.push(wp(B.LeftFoot).clone()); }
      const minY = Math.min(...pts.map((p) => p.y));
      let sum = 0, cnt = 0;
      for (let i = 1; i <= N; i++) if (pts[i].y < minY + 0.035 && pts[i - 1].y < minY + 0.035) { sum += Math.abs(pts[i].z - pts[i - 1].z); cnt++; }
      cal.speed[name] = cnt ? (sum / cnt) / (dur / N) : (name === 'Walk' ? 1.4 : 4);
      if (name === 'Walk') cal.footY = minY;
    }
    this.cal = cal;
  }
}

function boneMap(root) {
  const B = {};
  root.traverse((o) => { if (o.isBone || /^mixamorig/.test(o.name)) B[o.name.replace(/^mixamorig:?/, '')] = o; });
  return B;
}
// 正交基底：X＝d，Y＝s（對 d 正交化），Z＝X×Y
function basisOf(d, s, out = new THREE.Matrix4()) {
  const x = _c.copy(d).normalize();
  const y = _d.copy(s).addScaledVector(x, -s.dot(x)).normalize();
  const z = _e.crossVectors(x, y);
  return out.makeBasis(x, y, z);
}

// 把骨頭在世界空間轉 q（左乘）
function rotW(bone, q) {
  bone.parent.getWorldQuaternion(_q2);
  bone.getWorldQuaternion(_q3);
  _q3.premultiply(q);
  bone.quaternion.copy(_q2.invert().multiply(_q3));
  bone.updateMatrixWorld(true);
}
// 設定骨頭的世界旋轉
function setW(bone, qw) {
  bone.parent.getWorldQuaternion(_q2);
  bone.quaternion.copy(_q2.invert().multiply(qw));
  bone.updateMatrixWorld(true);
}
// 旋轉 bone，讓它現在的 child 位置轉向 target（只擺動、不扭）
function aimChild(bone, child, target, k = 1) {
  const p = bone.getWorldPosition(_a), c = child.getWorldPosition(_b);
  const v0 = c.sub(p).normalize(), v1 = _c.copy(target).sub(p).normalize();
  _q.setFromUnitVectors(v0, v1);
  if (k < 1) _q.slerp(_q3.identity(), 1 - k);
  rotW(bone, _q);
}
// 兩節 IK：upper→lower→end 伸到 target，pole＝手肘／膝蓋要朝的點
function ik2(upper, lower, end, target, pole) {
  const a = upper.getWorldPosition(new THREE.Vector3());
  const lab = a.distanceTo(lower.getWorldPosition(_b)), lbc = _b.distanceTo(end.getWorldPosition(_c));
  const dir = _d.copy(target).sub(a);
  const d = clamp(dir.length(), 0.02, (lab + lbc) * 0.999);
  dir.normalize();
  const pv = _e.copy(pole).sub(a); pv.addScaledVector(dir, -pv.dot(dir));
  if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0); pv.normalize();
  const x = (lab * lab - lbc * lbc + d * d) / (2 * d), h = Math.sqrt(Math.max(0, lab * lab - x * x));
  const elbow = a.clone().addScaledVector(dir, x).addScaledVector(pv, h);
  const tgt = a.clone().addScaledVector(dir, d);
  aimChild(upper, lower, elbow);
  aimChild(lower, end, tgt);
}

// ---------------------------------------------------------------- 士兵（敵人）
// 每幀：先設 this.move（世界速度）、this.aimYaw/aimPitch、this.mode，再呼叫 update(dt)
export class Soldier {
  constructor(kit, look = 'trooper', o = {}) {
    this.kit = kit; this.look = look; this.cal = kit.cal;
    this.root = new THREE.Group();
    const m = (this.model = SkeletonUtils.clone(kit.gltf.scene));
    m.rotation.y = Math.PI;   // 原模型面向 −Z
    this.root.add(m);
    const S = o.scale || 1;
    this.root.scale.setScalar(S);
    const mats = kit.material(look);
    this.meshes = [];
    m.traverse((x) => {
      if (!x.isSkinnedMesh) return;
      x.material = /visor/i.test(x.name) ? mats.visor : mats.body;
      x.castShadow = true; x.receiveShadow = true;
      x.frustumCulled = false;   // 骨架動畫會超出原本的包圍盒；由 AI 距離自己剔除
      this.meshes.push(x);
    });
    this.B = boneMap(m);
    // 面罩上的單眼（和獵犬機體同一套設計語言）
    const eye = (this.eye = new THREE.Mesh(EYE_GEO, mats.eye));
    eye.position.set(0, 9.2, 12.4); eye.scale.set(1, 1, 1);   // 頭骨座標（公分）
    this.B.Head.add(eye);
    // 動作
    this.mixer = new THREE.AnimationMixer(m);
    this.act = {};
    for (const k of ['Idle', 'Walk', 'Run', 'CrouchIdle', 'CrouchWalk']) { const a = this.mixer.clipAction(kit.clips[k]); a.play(); a.setEffectiveWeight(0); this.act[k] = a; }
    this.act.Idle.setEffectiveWeight(1);
    this.hitAct = {};
    for (const name of ['HitChest', 'HitHead']) {
      const clip = kit.clips[name].clone();
      clip.tracks = clip.tracks.filter((t) => /Spine|Neck|Head/.test(t.name));
      THREE.AnimationUtils.makeClipAdditive(clip, 0, kit.clips[name]);
      this.hitAct[name] = this.mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      this.hitAct[name].clampWhenFinished = true;
    }
    this.world = o.world || null;
    this.feet = Object.fromEntries(['Left', 'Right'].map((side) => [side, { lock: new THREE.Vector3(), planted: false, ground: 0 }]));
    this.phase = Math.random(); this.idleT = Math.random() * 2;
    // 狀態
    this.pos = this.root.position;
    this.vel = new THREE.Vector3();         // 實際位移速度（由 AI 算好給這裡）
    this.yaw = 0; this.bodyYaw = 0;         // 目標面向、腳的面向
    this.aimYaw = 0; this.aimPitch = 0;     // 上身瞄準
    this.mode = 'patrol';                   // patrol（低姿持槍）、aim（舉槍）、run（跑步持槍）
    this.aimW = 0; this.runW = 0; this.crouch = 0; this.crouchT = 0;
    this.hit = new THREE.Vector3(); this.hitV = new THREE.Vector3();  // 中彈晃動（彈簧）
    this.recoil = 0; this.reloadT = -1;
    this.dead = false; this.rag = null;
    this.weapon = o.weapon || null;         // 自己的座標：原點＝槍托，+Z＝槍口方向
    this.grip = o.grip || new THREE.Vector3(0, -0.07, 0.27);
    this.fore = o.fore || new THREE.Vector3(-0.005, -0.045, 0.56);
    this._wq = new THREE.Quaternion(); this._wp = new THREE.Vector3();
    this.lod = 0;
  }

  // 世界座標的槍口位置（AI 開槍用）
  muzzle(out = new THREE.Vector3()) {
    if (!this.weapon) return this.B.Head.getWorldPosition(out);
    return this.weapon.localToWorld(out.copy(this.weapon.userData.muzzle || _a.set(0, 0, 1.1)));
  }
  headPos(out = new THREE.Vector3()) { return this.B.Head.getWorldPosition(out).add(_a.set(0, 0.08 * this.root.scale.y, 0)); }
  chestPos(out = new THREE.Vector3()) { return this.B.Spine2.getWorldPosition(out); }

  // 中彈晃動：dir＝子彈方向（世界），k＝力道
  impact(dir, k = 1, head = false) {
    this.hitV.addScaledVector(dir, (head ? 5 : 3.2) * k);
    this.headSnap = head ? 1 : 0.35;
    for (const a of Object.values(this.hitAct)) a.stop();
    this.hitAction = this.hitAct[head ? 'HitHead' : 'HitChest'];
    this.hitAction.reset().setEffectiveWeight(0).play(); this.hitT = 0;
  }

  update(dt, far = false) {
    if (this.rag) { this.rag.step(dt); return; }
    if (this.death) {
      const d = this.death; d.t += dt;
      const w = clamp(d.t / 0.16, 0, 1);
      for (const [key, a] of Object.entries(this.act)) a.setEffectiveWeight(d.weights[key] * (1 - w));
      d.action.setEffectiveWeight(w); this.mixer.update(dt); this.root.updateMatrixWorld(true);
      if (d.t >= d.duration) {
        this.rag = new Ragdoll(this, d.dir, d.k, d.part, d.world);
        this.mixer.stopAllAction(); this.death = null;
        if (this.weapon) this.weapon.userData.drop = true;
      }
      return;
    }
    const cal = this.cal, sc = this.root.scale.x;
    // ---- 腳：瞄準時維持朝向，步幅方向由腳部 IK 轉到移動方向
    let sp = Math.hypot(this.vel.x, this.vel.z) / sc;
    let legYaw = this.yaw;
    if (sp > 0.3) {
      const mv = Math.atan2(this.vel.x, this.vel.z);
      const d = wrap(mv - this.aimYaw);
      if (this.mode === 'aim' || Math.abs(d) > 1.95) { legYaw = this.aimYaw; }   // 退著走：身體面向敵人
      else legYaw = mv;
    } else legYaw = this.aimYaw;
    // 身體轉向：站著時只有差超過 40° 才轉腳（像真人一樣先扭上身，再踏步轉過去）
    const dYaw = wrap(legYaw - this.bodyYaw);
    if (sp > 0.3 || Math.abs(dYaw) > 0.7 || this.turning) {
      this.turning = sp <= 0.3 && Math.abs(dYaw) > 0.08;
      const prev = this.bodyYaw;
      this.bodyYaw = lerpAngle(this.bodyYaw, legYaw, 1 - Math.exp(-dt * (sp > 0.3 ? 9 : 4)));
      this.turnSp = Math.abs(wrap(this.bodyYaw - prev)) / Math.max(dt, 1e-4);
    } else this.turnSp = 0;
    this.root.rotation.y = this.bodyYaw;
    // 換彈計時（左手去彈匣）
    if (this.reloadT >= 0) { this.reloadT += dt; if (this.reloadT > 1.6) this.reloadT = -1; }
    // ---- 走跑混合（相位同步：走和跑用同一個步伐相位）
    // 原地轉身：用慢步的腳步（轉得越快踏得越快）
    if (sp < 0.3 && this.turnSp > 0.4) sp = Math.min(cal.speed.Walk * 0.7, this.turnSp * 0.55);
    this.crouch = damp(this.crouch, this.crouchT, 8, dt);
    const vW = lerp(cal.speed.Walk, cal.speed.CrouchWalk, this.crouch), vR = cal.speed.Run;
    const wIdle = 1 - clamp(sp / (vW * 0.6), 0, 1);
    const wRun = clamp((sp - vW) / (vR - vW), 0, 1);
    const wWalk = (1 - wIdle) * (1 - wRun), wR = (1 - wIdle) * wRun;
    const dW = this.act.Walk.getClip().duration, dR = this.act.Run.getClip().duration;
    const stride = lerp(lerp(cal.speed.Walk * dW, cal.speed.CrouchWalk * this.act.CrouchWalk.getClip().duration, this.crouch), vR * dR, wRun);   // 一個循環走多遠
    this.phase = (this.phase + dt * Math.max(sp, 0.001) / stride + 1) % 1;
    this.idleT += dt;
    this.act.Idle.time = this.idleT % this.act.Idle.getClip().duration;
    this.act.Walk.time = this.phase * dW; this.act.Run.time = this.phase * dR;
    this.act.Idle.setEffectiveWeight(wIdle * (1 - this.crouch));
    this.act.Walk.setEffectiveWeight(wWalk * (1 - this.crouch)); this.act.Run.setEffectiveWeight(wR * (1 - this.crouch));
    this.act.CrouchIdle.time = this.idleT % this.act.CrouchIdle.getClip().duration;
    this.act.CrouchWalk.time = this.phase * this.act.CrouchWalk.getClip().duration;
    this.act.CrouchIdle.setEffectiveWeight(wIdle * this.crouch);
    this.act.CrouchWalk.setEffectiveWeight((1 - wIdle) * this.crouch);
    if (this.hitAction) {
      this.hitT += dt; const duration = this.hitAction.getClip().duration;
      this.hitAction.time = Math.min(this.hitT, duration);
      this.hitAction.setEffectiveWeight(Math.sin(Math.PI * clamp(this.hitT / duration, 0, 1)) * 0.8);
      if (this.hitT >= duration) { this.hitAction.stop(); this.hitAction = null; }
    }
    this.mixer.update(0);
    this.root.updateMatrixWorld(true);
    if (far) { this._placeWeaponSimple(); return; }   // 遠處：只播動作，不做程序層

    const B = this.B;
    this._feet(dt, sp);
    // ---- 姿勢權重
    const wantAim = this.mode === 'aim' ? 1 : 0, wantRun = this.mode === 'run' || wRun > 0.5 ? 1 : 0;
    this.aimW = damp(this.aimW, wantAim, 7, dt);
    this.runW = damp(this.runW, wantRun * (1 - wantAim), 6, dt);
    // ---- 上身扭向瞄準方向（三節脊椎平分）＋俯仰
    const tw = clamp(wrap(this.aimYaw - this.bodyYaw), -1.4, 1.4) * (0.35 + 0.65 * (1 - this.runW));
    const pitch = clamp(this.aimPitch, -0.9, 0.9) * (0.4 + 0.6 * this.aimW);
    for (const bn of ['Spine', 'Spine1', 'Spine2']) {
      _q.setFromAxisAngle(UP, tw / 3);
      rotW(B[bn], _q);
      const right = _b.set(-Math.cos(this.aimYaw), 0, Math.sin(this.aimYaw));
      _q.setFromAxisAngle(right, pitch / 3 * 0.8);
      rotW(B[bn], _q);
    }
    // ---- 中彈：彈簧（往子彈方向彎）
    this.hitV.addScaledVector(this.hit, -60 * dt);
    this.hitV.multiplyScalar(Math.exp(-9 * dt));
    this.hit.addScaledVector(this.hitV, dt);
    const hl = this.hit.length();
    if (hl > 1e-3) {
      const ax = _b.crossVectors(UP, this.hit).normalize();
      _q.setFromAxisAngle(ax, clamp(hl, 0, 0.7) * 0.6); rotW(B.Spine1, _q);
      _q.setFromAxisAngle(ax, clamp(hl, 0, 0.7) * 0.5 * (this.headSnap || 0.3)); rotW(B.Head, _q);
    }
    // ---- 槍與雙手
    if (this.weapon) this._placeWeapon(dt);
    // ---- 頭看向瞄準方向
    // 探頭：身體往側邊傾（lean －1 左、＋1 右）
    this.leanK = damp(this.leanK || 0, this.lean || 0, 6, dt);
    if (Math.abs(this.leanK) > 0.01) { _q.setFromAxisAngle(_d.set(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw)), this.leanK * 0.32); rotW(B.Spine1, _q); }
    const ad = _d.set(Math.sin(this.aimYaw) * Math.cos(this.aimPitch), Math.sin(this.aimPitch), Math.cos(this.aimYaw) * Math.cos(this.aimPitch));
    const hf = _e.copy(cal.headFwd).applyQuaternion(B.Head.getWorldQuaternion(_q3)).normalize();
    _q.setFromUnitVectors(hf, ad); _q.slerp(_q2.identity(), 0.3);
    rotW(B.Head, _q);
  }

  // 槍的位置：以胸口為基準，依姿勢（低姿／舉槍／跑步斜抱）混合
  _weaponFrame(outP, outQ) {
    const B = this.B, sc = this.root.scale.x;
    const chest = B.Spine2.getWorldPosition(_a);
    const yaw = this.aimYaw, pitch = this.aimPitch * (0.4 + 0.6 * this.aimW);
    const F = _b.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const R = _c.crossVectors(F, UP).normalize();
    const U = _d.crossVectors(R, F).normalize();
    const aw = this.aimW, rw = this.runW, pw = 1 - aw - rw;
    // 舉槍：槍托頂右肩窩
    const aimP = _e.copy(chest).addScaledVector(R, 0.16 * sc).addScaledVector(U, 0.13 * sc).addScaledVector(F, 0.0);
    outP.copy(aimP).multiplyScalar(aw);
    // 低姿：槍托在右腰上方，槍口朝下前方
    outP.addScaledVector(_e.copy(chest).addScaledVector(R, 0.19 * sc).addScaledVector(U, -0.02 * sc).addScaledVector(F, 0.02 * sc), Math.max(0, pw));
    // 跑步：槍斜抱胸前
    outP.addScaledVector(_e.copy(chest).addScaledVector(R, 0.2 * sc).addScaledVector(U, -0.16 * sc).addScaledVector(F, 0.1 * sc), rw);
    const recoil = this.recoil;
    outP.addScaledVector(F, -0.05 * recoil * sc);
    _m.makeBasis(_a.copy(R).negate(), U, F);   // 槍的 +X 在左（和身體座標一致：右在 −X）
    outQ.setFromRotationMatrix(_m);
    // 低姿：往下 34°、往內 10°；跑步：槍口朝左上
    if (pw > 0.001) { _q.setFromAxisAngle(_a.set(1, 0, 0), 0.6 * pw); _q2.setFromAxisAngle(_b.set(0, 1, 0), 0.18 * pw); outQ.multiply(_q2).multiply(_q); }
    if (rw > 0.001) { _q.setFromAxisAngle(_a.set(0, 1, 0), 0.95 * rw); _q2.setFromAxisAngle(_b.set(1, 0, 0), -0.45 * rw); outQ.multiply(_q).multiply(_q2); _q.setFromAxisAngle(_a.set(0, 0, 1), 0.5 * rw); outQ.multiply(_q); }
    if (recoil > 0) { _q.setFromAxisAngle(_a.set(1, 0, 0), -0.12 * recoil); outQ.multiply(_q); }
  }

  // 腳掌接地：保留捕捉的抬腳弧線，支撐期鎖在世界座標；坡面只修正接地腳。
  _feet(dt, speed) {
    const B = this.B, sc = this.root.scale.x, W = this.world;
    const travel = speed > 0.3 ? wrap(Math.atan2(this.vel.x, this.vel.z) - this.bodyYaw) : 0;
    for (const side of ['Left', 'Right']) {
      const foot = B[side + 'Foot'], state = this.feet[side];
      const p = foot.getWorldPosition(new THREE.Vector3()), fq = foot.getWorldQuaternion(new THREE.Quaternion());
      const local = this.root.worldToLocal(p.clone());
      const ankleX = side === 'Left' ? 0.1 : -0.1;
      if (speed > 0.3 && Math.abs(travel) > 0.15) {
        const stride = local.z; local.x = ankleX + Math.sin(travel) * stride; local.z = Math.cos(travel) * stride;
        p.copy(this.root.localToWorld(local));
      }
      const lift = Math.max(0, p.y - this.pos.y - this.cal.footY * sc);
      const ground = W ? W.floorAt(p.x, p.z, this.pos.y + 0.48 * sc) : this.pos.y;
      state.ground = damp(state.ground, ground - this.pos.y, 20, dt);
      const support = lift < 0.045 * sc;
      if (support && state.planted && state.lock.distanceTo(p) < 0.28 * sc) {
        p.x = state.lock.x; p.z = state.lock.z;
      } else { state.lock.copy(p); state.planted = support; }
      p.y = this.pos.y + state.ground + this.cal.footY * sc + lift;
      const pole = B[side + 'Leg'].getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(Math.sin(this.bodyYaw), 0, Math.cos(this.bodyYaw)).multiplyScalar(sc));
      ik2(B[side + 'UpLeg'], B[side + 'Leg'], foot, p, pole);
      if (W && support) {
        const d = 0.12 * sc, ref = this.pos.y + 0.48 * sc;
        const dx = clamp((W.floorAt(p.x + d, p.z, ref) - W.floorAt(p.x - d, p.z, ref)) / (2 * d), -0.65, 0.65);
        const dz = clamp((W.floorAt(p.x, p.z + d, ref) - W.floorAt(p.x, p.z - d, ref)) / (2 * d), -0.65, 0.65);
        fq.premultiply(new THREE.Quaternion().setFromUnitVectors(UP, new THREE.Vector3(-dx, 1, -dz).normalize()));
      }
      setW(foot, fq);
    }
  }

  _placeWeaponSimple() {
    if (!this.weapon) return;
    this._weaponFrame(this._wp, this._wq);
    this.weapon.position.copy(this._wp); this.weapon.quaternion.copy(this._wq);
  }

  _placeWeapon(dt) {
    const B = this.B, w = this.weapon, sc = this.root.scale.x;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this._weaponFrame(this._wp, this._wq);
    w.position.copy(this._wp); w.quaternion.copy(this._wq); w.scale.setScalar(sc);
    w.updateMatrixWorld(true);
    // 右手握把、左手護木（換彈時左手去彈匣）
    const gR = w.localToWorld(_a.copy(this.grip));
    let fore = this.fore;
    if (this.reloadT >= 0) {
      const t = this.reloadT;
      const k = t < 0.3 ? t / 0.3 : t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.35);
      fore = _e.copy(this.fore).lerp(_d.set(0, -0.2 - 0.12 * Math.sin(clamp((t - 0.3) / 0.8, 0, 1) * Math.PI), 0.33), k);
    }
    const gL = w.localToWorld(_b.copy(fore)).clone();
    const gRc = gR.clone();
    const Rw = new THREE.Vector3(-1, 0, 0).applyQuaternion(this._wq);
    const pR = gRc.clone().add(DOWN).addScaledVector(Rw, 1.2 * sc), pL = gL.clone().add(DOWN).addScaledVector(Rw, -0.6 * sc);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, gRc, pR);
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, gL, pL);
    // 手型：握把（右）／托護木（左）
    const F = new THREE.Vector3(0, 0, 1).applyQuaternion(this._wq), U = new THREE.Vector3(0, 1, 0).applyQuaternion(this._wq);
    const L = Rw.clone().negate();
    this._hand('Right', F.clone().addScaledVector(U, -0.45), U.clone().negate().addScaledVector(F, 0.35), 1.0);
    this._hand('Left', Rw.clone().addScaledVector(F, 0.45).addScaledVector(U, 0.2), F.clone().negate(), 0.75);
  }

  // 手的世界朝向：D＝手指方向、S＝食指→小指方向；curl＝握拳程度
  _hand(side, D, S, curl) {
    const c = this.kit.cal.hand[side];
    const hand = this.B[side + 'Hand'];
    basisOf(D, S, _m); basisOf(c.D, c.S, _m2); _m2.invert();
    _q.setFromRotationMatrix(_m.multiply(_m2));
    // 標定時 root 沒轉，這裡的 Q 已是世界朝向，所以直接乘標定的手朝向
    _q.multiply(c.Q);
    setW(hand, _q);
    curlFingers(this.B, this.kit.cal, side, curl);
  }

  // ---- 死亡：切成布娃娃
  die(dir, k = 1, hitPart = 'chest', world = null) {
    if (this.dead) return;
    this.dead = true;
    for (const a of Object.values(this.hitAct)) a.stop();
    const action = this.mixer.clipAction(this.kit.clips.Death).reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true; action.setEffectiveWeight(0).play();
    this.death = { action, weights: Object.fromEntries(Object.entries(this.act).map(([n, a]) => [n, a.getEffectiveWeight()])), t: 0,
      duration: hitPart === 'head' ? 0.22 : hitPart === 'legs' ? 0.48 : 0.36, dir: dir.clone(), k, part: hitPart, world };
  }
}

const EYE_GEO = new THREE.SphereGeometry(1, 12, 8).scale(1.5, 0.45, 0.5);

function curlFingers(B, cal, side, curl) {
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) {
    for (let k = 1; k <= 3; k++) {
      const fb = B[side + 'Hand' + f + k]; if (!fb) continue;
      const ax = cal.finger[side + f + k];
      const ang = f === 'Thumb' ? curl * (k === 1 ? 0.25 : 0.45) : curl * (f === 'Index' && side === 'Right' ? [0.9, 0.8, 0.5][k - 1] : [1.05, 1.1, 0.75][k - 1]);
      _q.setFromAxisAngle(ax, ang);
      fb.quaternion.multiply(_q);
    }
  }
}

// ---------------------------------------------------------------- 布娃娃（Verlet 質點＋距離約束，再把骨頭轉回去對齊質點）
const RAG = ['Hips', 'Spine2', 'HeadTop_End', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftToeBase', 'RightToeBase'];
const I = Object.fromEntries(RAG.map((n, i) => [n, i]));
const RIGID = ['Hips', 'Spine2', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg'];
const LINKS = [['Spine2', 'HeadTop_End'], ['LeftArm', 'HeadTop_End'], ['RightArm', 'HeadTop_End'],
  ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'],
  ['LeftFoot', 'LeftToeBase'], ['RightFoot', 'RightToeBase'], ['LeftLeg', 'LeftToeBase'], ['RightLeg', 'RightToeBase']];
// 不能折太緊（膝、肘最多彎到這個距離比例）
const MINL = [['LeftUpLeg', 'LeftFoot', 0.42], ['RightUpLeg', 'RightFoot', 0.42], ['LeftArm', 'LeftHand', 0.3], ['RightArm', 'RightHand', 0.3],
  ['Hips', 'HeadTop_End', 0.8], ['LeftHand', 'RightHand', 0.12], ['LeftFoot', 'RightFoot', 0.1], ['LeftHand', 'Hips', 0.15], ['RightHand', 'Hips', 0.15]];
const RAD = { HeadTop_End: 0.12, Hips: 0.13, Spine2: 0.14, LeftArm: 0.08, RightArm: 0.08, LeftHand: 0.05, RightHand: 0.05, LeftForeArm: 0.06, RightForeArm: 0.06,
  LeftUpLeg: 0.1, RightUpLeg: 0.1, LeftLeg: 0.08, RightLeg: 0.08, LeftFoot: 0.07, RightFoot: 0.07, LeftToeBase: 0.04, RightToeBase: 0.04 };

class Ragdoll {
  constructor(s, dir, k, hitPart, world) {
    this.s = s; this.world = world; this.t = 0; this.sleep = false;
    const B = s.B, n = RAG.length;
    s.root.updateMatrixWorld(true);
    this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3);
    const sc = s.root.scale.x;
    const hitI = I[hitPart === 'head' ? 'HeadTop_End' : hitPart === 'legs' ? 'LeftLeg' : 'Spine2'];
    const push = _a.copy(dir).setY(Math.max(dir.y, 0) * 0.3).normalize();
    for (let i = 0; i < n; i++) {
      const p = B[RAG[i]].getWorldPosition(_b);
      this.p[i * 3] = p.x; this.p[i * 3 + 1] = p.y; this.p[i * 3 + 2] = p.z;
      // 初速：身體原本的移動＋中彈點附近被推開（越靠近中彈點越大），往前倒時膝蓋先軟
      const hp = B[RAG[hitI]].getWorldPosition(_c);
      const near = Math.exp(-p.distanceTo(hp) * 2.2);
      const v = _d.copy(s.vel).multiplyScalar(0.9).addScaledVector(push, (0.6 + 3.4 * near) * k);
      if (RAG[i].includes('Leg') || RAG[i].includes('Foot') || RAG[i].includes('Toe')) v.addScaledVector(push, -0.35 * k);
      const dt = 1 / 60;
      this.o[i * 3] = p.x - v.x * dt; this.o[i * 3 + 1] = p.y - v.y * dt; this.o[i * 3 + 2] = p.z - v.z * dt;
    }
    // 約束長度
    const d = (a, b) => { const i = I[a] * 3, j = I[b] * 3; return Math.hypot(this.p[i] - this.p[j], this.p[i + 1] - this.p[j + 1], this.p[i + 2] - this.p[j + 2]); };
    this.C = [];
    for (let i = 0; i < RIGID.length; i++) for (let j = i + 1; j < RIGID.length; j++) this.C.push([I[RIGID[i]], I[RIGID[j]], d(RIGID[i], RIGID[j]), 1]);
    for (const [a, b] of LINKS) this.C.push([I[a], I[b], d(a, b), 1]);
    this.M = MINL.map(([a, b, f]) => [I[a], I[b], (a === 'Hips' ? d(a, b) : d(a, b)) * f]);
    this.rad = RAG.map((nm) => RAD[nm] * sc);
    // 死亡當下的骨頭朝向（之後以「擺動」修正，保留原本的扭轉）
    this.q0 = {}; this.dir0 = {};
    for (const nm of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftShoulder', 'RightShoulder'])
      this.q0[nm] = B[nm].getWorldQuaternion(new THREE.Quaternion());
    this.f0 = { hips: this._frame('Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine2', new THREE.Matrix4()), chest: this._frame('Hips', 'LeftArm', 'RightArm', 'Spine2', new THREE.Matrix4()) };
    this.seg = [['Spine2', 'HeadTop_End', 'Neck'], ['LeftArm', 'LeftForeArm', 'LeftArm'], ['LeftForeArm', 'LeftHand', 'LeftForeArm'], ['RightArm', 'RightForeArm', 'RightArm'], ['RightForeArm', 'RightHand', 'RightForeArm'],
      ['LeftUpLeg', 'LeftLeg', 'LeftUpLeg'], ['LeftLeg', 'LeftFoot', 'LeftLeg'], ['RightUpLeg', 'RightLeg', 'RightUpLeg'], ['RightLeg', 'RightFoot', 'RightLeg'], ['LeftFoot', 'LeftToeBase', 'LeftFoot'], ['RightFoot', 'RightToeBase', 'RightFoot']];
    for (const [a, b] of this.seg) this.dir0[a + b] = this._dir(a, b, new THREE.Vector3());
    this.acc = 0;
    this.fwd0 = new THREE.Vector3(Math.sin(s.bodyYaw), 0, Math.cos(s.bodyYaw));
  }
  _pt(nm, v) { const i = I[nm] * 3; return v.set(this.p[i], this.p[i + 1], this.p[i + 2]); }
  _dir(a, b, v) { return this._pt(b, v).sub(this._pt(a, _e)).normalize(); }
  _frame(o, l, r, u, M) {
    const po = this._pt(o, new THREE.Vector3());
    const up = this._pt(u, new THREE.Vector3()).sub(po).normalize();
    const ac = this._pt(l, new THREE.Vector3()).sub(this._pt(r, new THREE.Vector3()));
    ac.addScaledVector(up, -ac.dot(up)).normalize();
    const f = new THREE.Vector3().crossVectors(ac, up);
    return M.makeBasis(ac, up, f);
  }

  step(dt) {
    this.t += dt;
    if (this.sleep) return;
    this.acc = Math.min(this.acc + dt, 0.05);
    const h = 1 / 60;
    while (this.acc >= h) { this.acc -= h; this._sim(h); }
    this._pose();
  }

  _sim(h) {
    const p = this.p, o = this.o, n = RAG.length, W = this.world;
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      const vx = (p[j] - o[j]) * 0.995, vy = (p[j + 1] - o[j + 1]) * 0.995, vz = (p[j + 2] - o[j + 2]) * 0.995;
      o[j] = p[j]; o[j + 1] = p[j + 1]; o[j + 2] = p[j + 2];
      p[j] += vx; p[j + 1] += vy - 9.8 * h * h; p[j + 2] += vz;
      moved = Math.max(moved, Math.abs(vx) + Math.abs(vy) + Math.abs(vz));
    }
    for (let it = 0; it < 8; it++) {
      for (const [a, b, L] of this.C) this._link(a, b, L, 1);
      for (const [a, b, L] of this.M) this._min(a, b, L);
      this._joints();
      // 地面、牆
      for (let i = 0; i < n; i++) {
        const j = i * 3, r = this.rad[i];
        const gy = (W ? W.floorAt(p[j], p[j + 2], p[j + 1] + 0.3) : 0) + r;
        if (p[j + 1] < gy) {
          p[j + 1] = gy;
          // 地面摩擦
          o[j] = p[j] - (p[j] - o[j]) * 0.55; o[j + 2] = p[j + 2] - (p[j + 2] - o[j + 2]) * 0.55;
          if (o[j + 1] < p[j + 1] - 0.0001) o[j + 1] = p[j + 1] + (p[j + 1] - o[j + 1]) * 0.1;
        }
        if (W) {
          // 質點是球，不是 1.7 m 高的人；從盒內沿最近面推出，包含上下方向。
          for (const box of W.near(p[j], p[j + 2], r + 0.1, this.near || (this.near = []))) {
            if (box.noMove || box.ramp) continue;
            const lo = [box.x0 - r, box.y0 - r, box.z0 - r], hi = [box.x1 + r, box.y1 + r, box.z1 + r];
            if ([0, 1, 2].some((a) => p[j + a] <= lo[a] || p[j + a] >= hi[a])) continue;
            let axis = 0, target = lo[0], dist = Infinity;
            for (let a = 0; a < 3; a++) for (const face of [lo[a], hi[a]]) if (Math.abs(face - p[j + a]) < dist) { dist = Math.abs(face - p[j + a]); axis = a; target = face; }
            p[j + axis] = o[j + axis] = target;
          }
        }
      }
    }
    if (this.t > 1.2 && moved < 0.0006) { this.still = (this.still || 0) + h; if (this.still > 0.5) this.sleep = true; } else this.still = 0;
    if (this.t > 8) this.sleep = true;
  }
  _link(a, b, L, k) {
    const p = this.p, i = a * 3, j = b * 3;
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6, f = (d - L) / d * 0.5 * k;
    p[i] += dx * f; p[i + 1] += dy * f; p[i + 2] += dz * f;
    p[j] -= dx * f; p[j + 1] -= dy * f; p[j + 2] -= dz * f;
  }
  _min(a, b, L) {
    const p = this.p, i = a * 3, j = b * 3;
    const dx = p[j] - p[i], dy = p[j + 1] - p[i + 1], dz = p[j + 2] - p[i + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d >= L || d < 1e-6) return;
    const f = (d - L) / d * 0.5;
    p[i] += dx * f; p[i + 1] += dy * f; p[i + 2] += dz * f;
    p[j] -= dx * f; p[j + 1] -= dy * f; p[j + 2] -= dz * f;
  }
  // 膝蓋只能往前彎、手肘只能往後彎（相對軀幹的前方）
  _joints() {
    this._frame('Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine2', _m);
    const F = _c.setFromMatrixColumn(_m, 2);
    const fix = (a, k, e, s) => {
      const A = this._pt(a, new THREE.Vector3()), K = this._pt(k, new THREE.Vector3()), E = this._pt(e, new THREE.Vector3());
      const mid = A.clone().add(E).multiplyScalar(0.5);
      const off = K.clone().sub(mid).dot(F) * s;
      if (off < 0.02) {
        const j = I[k] * 3, push = (0.02 - off) * 0.5 * s;
        this.p[j] += F.x * push; this.p[j + 1] += F.y * push; this.p[j + 2] += F.z * push;
      }
    };
    fix('LeftUpLeg', 'LeftLeg', 'LeftFoot', 1); fix('RightUpLeg', 'RightLeg', 'RightFoot', 1);
    fix('LeftArm', 'LeftForeArm', 'LeftHand', -1); fix('RightArm', 'RightForeArm', 'RightHand', -1);
    const down = new THREE.Vector3().setFromMatrixColumn(_m, 1).negate();
    for (const side of ['Left', 'Right']) {
      this._cone(side + 'UpLeg', side + 'Leg', down, 1.55);
      this._cone(side + 'Arm', side + 'ForeArm', down, 2.55);
      for (const limb of ['Hand', 'ForeArm', 'Leg']) {
        const i = I[side + limb], a = this._pt('Hips', new THREE.Vector3()), b = this._pt('Spine2', new THREE.Vector3());
        const v = this._pt(side + limb, new THREE.Vector3()), ab = b.sub(a), t = clamp(v.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
        const closest = a.addScaledVector(ab, t), delta = v.sub(closest), min = this.rad[i] + 0.12 * this.s.root.scale.x;
        if (delta.lengthSq() < min * min && delta.lengthSq() > 1e-8) {
          delta.setLength(min).add(closest); delta.toArray(this.p, i * 3);
        }
      }
    }
  }

  _cone(a, b, axis, angle) {
    const A = this._pt(a, new THREE.Vector3()), delta = this._pt(b, new THREE.Vector3()).sub(A), len = delta.length();
    if (len < 1e-6) return;
    delta.divideScalar(len); const dot = clamp(delta.dot(axis), -1, 1);
    if (dot >= Math.cos(angle)) return;
    const tangent = delta.addScaledVector(axis, -dot);
    if (tangent.lengthSq() < 1e-8) tangent.set(1, 0, 0).addScaledVector(axis, -axis.x);
    tangent.normalize().multiplyScalar(Math.sin(angle)).addScaledVector(axis, Math.cos(angle));
    tangent.multiplyScalar(len).add(A).toArray(this.p, I[b] * 3);
  }

  // 骨頭對齊質點
  _pose() {
    const s = this.s, B = s.B;
    const Mh = this._frame('Hips', 'LeftUpLeg', 'RightUpLeg', 'Spine2', new THREE.Matrix4());
    const Mc = this._frame('Hips', 'LeftArm', 'RightArm', 'Spine2', new THREE.Matrix4());
    const Rh = new THREE.Quaternion().setFromRotationMatrix(Mh.clone().multiply(this.f0.hips.clone().invert()));
    const Rc = new THREE.Quaternion().setFromRotationMatrix(Mc.clone().multiply(this.f0.chest.clone().invert()));
    // 脊椎旋轉不得超過髖部 28°。
    const twist = Rh.angleTo(Rc); if (twist > 0.49) Rc.copy(Rh.clone().slerp(Rc, 0.49 / twist));
    // 腰：位置＋旋轉
    const hp = this._pt('Hips', new THREE.Vector3());
    B.Hips.parent.updateMatrixWorld(true);
    B.Hips.position.copy(B.Hips.parent.worldToLocal(hp));
    setW(B.Hips, Rh.clone().multiply(this.q0.Hips));
    setW(B.Spine, _q.copy(Rh).slerp(Rc, 0.33).multiply(this.q0.Spine));
    setW(B.Spine1, _q.copy(Rh).slerp(Rc, 0.66).multiply(this.q0.Spine1));
    setW(B.Spine2, _q.copy(Rc).multiply(this.q0.Spine2));
    setW(B.LeftShoulder, _q.copy(Rc).multiply(this.q0.LeftShoulder));
    setW(B.RightShoulder, _q.copy(Rc).multiply(this.q0.RightShoulder));
    for (const [a, b, bone] of this.seg) {
      const d1 = this._dir(a, b, new THREE.Vector3());
      // 死亡當下的方向先跟著父段轉，再擺到新方向
      const parentR = bone === 'Neck' ? Rc : (bone.includes('UpLeg') ? Rh : (bone === 'LeftArm' || bone === 'RightArm') ? Rc : null);
      const d0 = this.dir0[a + b].clone();
      let base = this.q0[bone].clone();
      if (parentR) { d0.applyQuaternion(parentR); base.premultiply(parentR); }
      else {
        // 子段：以父段現在的轉動量為基準
        const pb = B[bone].parent; const pq = pb.getWorldQuaternion(new THREE.Quaternion());
        const pq0 = this.q0[pb.name.replace(/^mixamorig:?/, '')];
        if (pq0) { const R = pq.multiply(pq0.clone().invert()); d0.applyQuaternion(R); base.premultiply(R); }
      }
      _q.setFromUnitVectors(d0.normalize(), d1);
      setW(B[bone], _q.multiply(base));
    }
    // 頭跟著脖子
    if (s.weapon && s.weapon.userData.drop) this._dropWeapon();
  }
  // 槍掉地上：跟著右手一段時間，之後放在地上
  _dropWeapon() {
    const w = this.s.weapon;
    if (!this.wv) { this.wv = new THREE.Vector3(0, 1.2, 0).add(this.s.vel); this.wr = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6); }
    const dt = 1 / 60;
    if (this.wrest) return;
    this.wv.y -= 9.8 * dt;
    w.position.addScaledVector(this.wv, dt);
    w.rotation.x += this.wr.x * dt; w.rotation.y += this.wr.y * dt; w.rotation.z += this.wr.z * dt;
    const gy = (this.world ? this.world.floorAt(w.position.x, w.position.z, w.position.y + 0.3) : 0) + 0.04;
    if (w.position.y < gy) {
      w.position.y = gy; this.wv.multiplyScalar(0.3); this.wv.y = Math.abs(this.wv.y) * 0.2; this.wr.multiplyScalar(0.4);
      if (this.wv.length() < 0.2) { this.wrest = true; w.rotation.x = 0; w.rotation.z = Math.PI / 2 * Math.sign(w.rotation.z || 1); }
    }
  }
}

// ---------------------------------------------------------------- 第一人稱手臂（駕駛員）
// 從同一個模型只取出前臂＋手＋上臂三角形，綁同一副骨架，放在視角場景（camera 空間：−Z 前方）
export class Arms {
  constructor(kit) {
    this.kit = kit;
    const m = (this.model = SkeletonUtils.clone(kit.gltf.scene));
    this.root = new THREE.Group();
    this.root.add(m);
    const mats = kit.material('pilot');
    this.B = boneMap(m);
    let body = null;
    m.traverse((x) => { if (x.isSkinnedMesh) { if (/visor/i.test(x.name)) x.visible = false; else body = x; } });
    const keep = new Set();
    body.skeleton.bones.forEach((b, i) => { if (/(Arm|ForeArm|Hand)/.test(b.name) && !/Shoulder/.test(b.name)) keep.add(i); });
    const g = body.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index.array;
    const dom = (v) => { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; bi = si.getComponent(v, k); } } return bi; };
    const out = [];
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (keep.has(dom(a)) && keep.has(dom(b)) && keep.has(dom(c))) out.push(a, b, c);
    }
    const ng = g.clone(); ng.setIndex(out);
    body.geometry = ng; body.material = mats.body;
    body.frustumCulled = false; body.castShadow = false;
    this.mesh = body;
    // 用 T 姿勢放好：眼睛＝原點
    this.mixer = new THREE.AnimationMixer(m);
    this.mixer.clipAction(kit.clips.Idle).play(); this.mixer.update(0.4);
    this.root.updateMatrixWorld(true);
    const eye = this.B.Head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.09, -0.09));
    m.position.sub(eye);
    this.root.updateMatrixWorld(true);
    this.rest = [];
    m.traverse((x) => { if (x.isBone) this.rest.push([x, x.quaternion.clone()]); });
    this.grip = { R: new THREE.Vector3(), L: new THREE.Vector3(), RD: new THREE.Vector3(), RS: new THREE.Vector3(), LD: new THREE.Vector3(), LS: new THREE.Vector3(), curlR: 1, curlL: 0.8 };
    this.rPole = new THREE.Vector3(-0.8, -0.9, 0.35); this.lPole = new THREE.Vector3(0.6, -1, 0.3);
  }
  // 目標（camera 空間）：R/L＝手腕位置，RD/RS、LD/LS＝手指方向／食指→小指方向
  update() {
    const B = this.B;
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    this.root.updateMatrixWorld(true);
    const G = this.grip;
    ik2(B.RightArm, B.RightForeArm, B.RightHand, G.R, _e.copy(G.R).add(this.rPole));
    ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, G.L, _e.copy(G.L).add(this.lPole));
    this._hand('Right', G.RD, G.RS, G.curlR);
    this._hand('Left', G.LD, G.LS, G.curlL);
  }
  _hand(side, D, S, curl) {
    const c = this.kit.cal.hand[side];
    basisOf(D, S, _m); basisOf(c.D, c.S, _m2); _m2.invert();
    _q.setFromRotationMatrix(_m.multiply(_m2));
    // 標定時模型轉了 180°、這裡沒轉：基底和手朝向都差同一個轉動，互相抵消
    _q.multiply(c.Q);
    setW(this.B[side + 'Hand'], _q);
    curlFingers(this.B, this.kit.cal, side, curl);
  }
}

// ---------------------------------------------------------------- 小工具
export function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export function lerpAngle(a, b, t) { return a + wrap(b - a) * t; }
export function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
