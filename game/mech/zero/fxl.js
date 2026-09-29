// 人的尺度的特效：雷射光束、光彈、火花、煙、燒焦痕、閃光點光源、小爆炸
//   全部用實例化網格（instanced），每種一個 draw call；顏色 >1 會被後製泛光
import * as THREE from 'three';

const rr = (a, b) => a + Math.random() * (b - a);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

function softTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  if (kind === 'smoke') {
    for (let i = 0; i < 26; i++) {
      const px = 64 + (Math.random() - 0.5) * 50, py = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 26;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    const g = x.createRadialGradient(64, 64, 20, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  } else if (kind === 'scorch') {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 62);
    g.addColorStop(0, 'rgba(8,6,5,0.95)'); g.addColorStop(0.35, 'rgba(15,12,10,0.75)'); g.addColorStop(1, 'rgba(20,18,16,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, d = 20 + Math.random() * 38; x.fillStyle = `rgba(10,8,6,${Math.random() * 0.4})`; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 1 + Math.random() * 4, 0, 7); x.fill(); }
  } else {
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  }
  const t = new THREE.CanvasTexture(c); return t;
}

// ---------------------------------------------------------------- 拉長的發光線段（火花、光彈、光束）
//   每個實例：a、b 兩端點（世界）、寬度、顏色（HDR）；頂點著色器把四邊形轉成面向鏡頭
class Streaks {
  constructor(scene, max, blending = THREE.AdditiveBlending) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.A = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // a.xyz + 寬
    this.B = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // b.xyz + 尾端寬比例
    this.C = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // 顏色 + 透明度
    for (const at of [this.A, this.B, this.C]) at.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('ia', this.A); g.setAttribute('ib', this.B); g.setAttribute('ic', this.C);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending,
      uniforms: { tex: { value: softTex('glow') } },
      vertexShader: `
        attribute vec4 ia, ib, ic; varying vec4 vC; varying vec2 vUv;
        void main() {
          vec4 pa = viewMatrix * vec4(ia.xyz, 1.0), pb = viewMatrix * vec4(ib.xyz, 1.0);
          vec3 d = pb.xyz - pa.xyz; vec3 s = normalize(cross(d, pa.xyz + d * 0.5));
          if (length(d) < 1e-4) s = vec3(1.0, 0.0, 0.0);
          float w = ia.w * mix(1.0, ib.w, position.x);
          vec3 p = mix(pa.xyz, pb.xyz, position.x) + s * position.y * w;
          // 端點往外延伸半個寬度，圓頭
          p += normalize(d + 1e-6) * (position.x - 0.5) * 2.0 * w;
          vC = ic; vUv = vec2(position.x, position.y * 0.5 + 0.5);
          gl_Position = projectionMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec4 vC; varying vec2 vUv;
        void main() {
          float y = abs(vUv.y - 0.5) * 2.0, x = abs(vUv.x - 0.5) * 2.0;
          float core = exp(-y * y * 9.0) * (1.0 - smoothstep(0.7, 1.0, x));
          float halo = exp(-y * y * 2.5) * 0.35 * (1.0 - smoothstep(0.5, 1.0, x));
          gl_FragColor = vec4(vC.rgb * (core + halo) * vC.a, (core + halo) * vC.a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(a, b, w, r, g, bl, al, tail = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.A.setXYZW(i, a.x, a.y, a.z, w); this.B.setXYZW(i, b.x, b.y, b.z, tail); this.C.setXYZW(i, r, g, bl, al);
  }
  end() { const g = this.mesh.geometry; g.instanceCount = this.n; this.A.needsUpdate = this.B.needsUpdate = this.C.needsUpdate = true; }
}

// ---------------------------------------------------------------- 面向鏡頭的圓點（煙、閃光、火球）
class Puffs {
  constructor(scene, max, tex, additive) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.P = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // 位置＋大小
    this.C = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // 顏色＋透明度
    this.R = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);     // 旋轉
    g.setAttribute('ip', this.P); g.setAttribute('icol', this.C); g.setAttribute('irot', this.R);
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { tex: { value: tex }, fogColor: { value: new THREE.Color() }, fogD: { value: 0 } },
      vertexShader: `
        attribute vec4 ip, icol; attribute float irot; varying vec4 vC; varying vec2 vUv; varying float vD;
        void main() {
          vec4 v = viewMatrix * vec4(ip.xyz, 1.0);
          float c = cos(irot), s = sin(irot);
          vec2 q = mat2(c, -s, s, c) * position.xy;
          v.xy += q * ip.w;
          vC = icol; vUv = position.xy * 0.5 + 0.5; vD = -v.z;
          gl_Position = projectionMatrix * v;
        }`,
      fragmentShader: `
        uniform sampler2D tex; uniform vec3 fogColor; uniform float fogD; varying vec4 vC; varying vec2 vUv; varying float vD;
        void main() {
          vec4 t = texture2D(tex, vUv);
          float f = 1.0 - exp(-fogD * fogD * vD * vD);
          vec3 col = mix(vC.rgb, fogColor, ${additive ? '0.0' : 'f'});
          float a = t.a * vC.a * ${additive ? '(1.0 - f)' : '1.0'};
          ${additive ? 'gl_FragColor = vec4(col * t.rgb * a, a);' : 'gl_FragColor = vec4(col * t.rgb, a);'}
        }`,
    });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 6 : 4;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
    this.list = [];
  }
  add(o) { if (this.list.length >= this.max) this.list.shift(); this.list.push(o); }
  update(dt) {
    let n = 0;
    for (let k = this.list.length - 1; k >= 0; k--) {
      const o = this.list[k]; o.t += dt;
      if (o.t >= o.life) { this.list.splice(k, 1); continue; }
    }
    for (const o of this.list) {
      const u = o.t / o.life;
      o.p.addScaledVector(o.v, dt); o.v.multiplyScalar(Math.exp(-(o.drag ?? 1.5) * dt)); o.v.y += (o.rise ?? 0.4) * dt;
      const s = o.s0 + (o.s1 - o.s0) * (1 - (1 - u) * (1 - u));
      const a = o.a * (u < 0.1 ? u / 0.1 : 1) * (1 - u) * (1 - u * 0.3);
      this.P.setXYZW(n, o.p.x, o.p.y, o.p.z, s);
      const heat = o.heat ? Math.max(0, 1 - u * 3) : 0;
      this.C.setXYZW(n, o.c.r + heat * 3, o.c.g + heat * 1.2, o.c.b + heat * 0.3, a);
      this.R.setX(n, o.rot + o.t * (o.spin || 0.3));
      n++;
    }
    this.mesh.geometry.instanceCount = n;
    this.P.needsUpdate = this.C.needsUpdate = this.R.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 貼在牆上的燒焦痕
class Decals {
  constructor(scene, max) {
    this.max = max; this.i = 0;
    const m = new THREE.MeshStandardMaterial({ map: softTex('scorch'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), m, max);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.userData.noAO = true;
    scene.add(this.mesh);
    // 還在發紅的中心（慢慢冷卻）
    this.hot = [];
  }
  add(p, n, s) {
    _q.setFromUnitVectors(_v.set(0, 0, 1), n);
    _q.multiply(new THREE.Quaternion().setFromAxisAngle(_w.set(0, 0, 1), Math.random() * 6.28));
    _m.compose(_w.copy(p).addScaledVector(n, 0.01), _q, new THREE.Vector3(s, s, s));
    this.mesh.setMatrixAt(this.i, _m);
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, this.mesh.count + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  clear() { this.mesh.count = 0; this.i = 0; }
}

export class FXL {
  constructor(scene) {
    this.scene = scene;
    this.streak = new Streaks(scene, 900);
    this.smoke = new Puffs(scene, 220, softTex('smoke'), false);
    this.glow = new Puffs(scene, 160, softTex('glow'), true);
    this.decals = new Decals(scene, 120);
    this.sparks = [];   // {p, v, life, t, w, c:[r,g,b], grav}
    this.beams = [];    // {a, b, t, life, w, c}
    this.bolts = [];    // 由遊戲邏輯管理的光彈（這裡只畫）
    // 閃光用的點光源（兩盞輪流）：場景裡每多一盞點光，每個像素都要多算一次（沒在閃也算）；閃光只有 0.07～0.25 秒，兩盞就夠
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffffff, 0, 12, 2); l.castShadow = false; scene.add(l); this.lights.push({ l, t: 0, life: 1, I: 0 }); }
    this.li = 0;
    this.quality = 1;
  }
  setFog(color, d) { for (const p of [this.smoke, this.glow]) { p.mesh.material.uniforms.fogColor.value.copy(color); p.mesh.material.uniforms.fogD.value = d; } }

  flash(p, color, I = 40, dist = 10, life = 0.08) {
    const L = this.lights[this.li]; this.li = (this.li + 1) % this.lights.length;
    L.l.position.copy(p); L.l.color.set(color); L.l.distance = dist; L.I = I; L.t = 0; L.life = life; L.l.intensity = I;
  }
  // 玩家長槍：粗光束（核心白＋外圈青），尾巴留一條電離煙
  beam(a, b, kind = 'rifle') {
    const big = kind === 'rifle';
    this.beams.push({ a: a.clone(), b: b.clone(), t: 0, life: big ? 0.22 : 0.08, w: big ? 0.05 : 0.018, c: big ? [0.5, 2.6, 4.5] : [0.6, 2.2, 3.8] });
    if (big) {
      const d = _v.subVectors(b, a), L = d.length(); d.normalize();
      for (let s = 1.5; s < Math.min(L, 60); s += 1.3 + Math.random()) {
        this.smoke.add({ p: a.clone().addScaledVector(d, s), v: new THREE.Vector3(rr(-0.2, 0.2), rr(0, 0.3), rr(-0.2, 0.2)), t: 0, life: rr(0.8, 1.6), s0: 0.04, s1: 0.35, a: 0.16, c: new THREE.Color(0.75, 0.8, 0.85), rot: rr(0, 6), rise: 0.2 });
      }
    }
  }
  muzzle(p, dir, color, big = false) {
    this.glow.add({ p: p.clone(), v: new THREE.Vector3(), t: 0, life: 0.06, s0: big ? 0.35 : 0.18, s1: big ? 0.5 : 0.25, a: 1, c: new THREE.Color(...color), rot: rr(0, 6), rise: 0 });
    this.flash(p, new THREE.Color(color[0], color[1], color[2]).multiplyScalar(0.35), big ? 30 : 12, big ? 12 : 7, 0.07);
  }
  // 命中：kind 'armor' 'concrete' 'metal' 'glass' 'body'
  impact(p, n, kind, color = [3, 1.2, 0.35], scale = 1) {
    const cnt = Math.round((kind === 'armor' || kind === 'metal' ? 22 : 14) * scale * (0.6 + 0.4 * this.quality));
    for (let i = 0; i < cnt; i++) {
      const v = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize().add(_v.copy(n).multiplyScalar(1.3)).normalize().multiplyScalar(rr(2, 9) * scale);
      this.sparks.push({ p: p.clone(), v, t: 0, life: rr(0.15, 0.6), w: rr(0.006, 0.014), c: kind === 'body' ? [2.4, 1.0, 0.4] : color, grav: 9 });
    }
    this.glow.add({ p: p.clone().addScaledVector(n, 0.05), v: new THREE.Vector3(), t: 0, life: 0.12, s0: 0.25 * scale, s1: 0.45 * scale, a: 1, c: new THREE.Color(color[0] * 0.6, color[1] * 0.6, color[2] * 0.6), rot: 0, rise: 0 });
    const dust = kind === 'concrete' ? [0.55, 0.52, 0.48] : kind === 'body' || kind === 'armor' ? [0.25, 0.25, 0.25] : [0.4, 0.4, 0.42];
    for (let i = 0; i < 3 * scale; i++) this.smoke.add({ p: p.clone().addScaledVector(n, 0.1), v: n.clone().multiplyScalar(rr(0.5, 1.8)).add(new THREE.Vector3(rr(-0.4, 0.4), rr(0, 0.5), rr(-0.4, 0.4))), t: 0, life: rr(0.7, 1.6), s0: 0.1, s1: rr(0.5, 0.9) * scale, a: kind === 'concrete' ? 0.5 : 0.3, c: new THREE.Color(...dust), rot: rr(0, 6), rise: 0.25, heat: false });
    if (kind !== 'body' && kind !== 'armor' && kind !== 'glass') this.decals.add(p, n, rr(0.18, 0.28) * scale);
    this.flash(p.clone().addScaledVector(n, 0.3), new THREE.Color(color[0], color[1], color[2]).multiplyScalar(0.3), 6 * scale, 5, 0.1);
  }
  explode(p, s = 1) {
    this.flash(p, new THREE.Color(1, 0.55, 0.25), 120 * s, 18 * s, 0.35);
    for (let i = 0; i < 8; i++) this.glow.add({ p: p.clone().add(new THREE.Vector3(rr(-0.4, 0.4), rr(-0.3, 0.4), rr(-0.4, 0.4)).multiplyScalar(s)), v: new THREE.Vector3(rr(-2, 2), rr(0, 3), rr(-2, 2)), t: 0, life: rr(0.25, 0.5), s0: 0.5 * s, s1: 1.6 * s, a: 1, c: new THREE.Color(2.2, 0.9, 0.3), rot: rr(0, 6), rise: 1 });
    for (let i = 0; i < 12; i++) this.smoke.add({ p: p.clone(), v: new THREE.Vector3(rr(-3, 3), rr(0.5, 4), rr(-3, 3)).multiplyScalar(s), t: 0, life: rr(1.5, 3), s0: 0.4 * s, s1: rr(1.5, 2.6) * s, a: 0.6, c: new THREE.Color(0.18, 0.17, 0.16), rot: rr(0, 6), rise: 0.6, heat: true, drag: 2.2 });
    for (let i = 0; i < 50; i++) { const v = new THREE.Vector3(rr(-1, 1), rr(-0.3, 1), rr(-1, 1)).normalize().multiplyScalar(rr(4, 16) * s); this.sparks.push({ p: p.clone(), v, t: 0, life: rr(0.4, 1.4), w: rr(0.01, 0.025), c: [3, 1.3, 0.4], grav: 9 }); }
  }
  // 火花從某點噴出（電線走火、損壞的無人機）
  spray(p, dir, n = 6, c = [3, 1.6, 0.6]) {
    for (let i = 0; i < n; i++) this.sparks.push({ p: p.clone(), v: dir.clone().multiplyScalar(rr(1, 4)).add(new THREE.Vector3(rr(-1, 1), rr(0, 1), rr(-1, 1))), t: 0, life: rr(0.2, 0.7), w: 0.008, c, grav: 9 });
  }
  puff(p, color = [0.5, 0.48, 0.45], s = 1) {
    this.smoke.add({ p: p.clone(), v: new THREE.Vector3(rr(-0.5, 0.5), rr(0.2, 0.6), rr(-0.5, 0.5)), t: 0, life: rr(1, 2), s0: 0.2 * s, s1: rr(0.8, 1.3) * s, a: 0.4, c: new THREE.Color(...color), rot: rr(0, 6), rise: 0.2 });
  }
  clear() { this.sparks.length = 0; this.beams.length = 0; this.smoke.list.length = 0; this.glow.list.length = 0; this.decals.clear(); }

  update(dt, floorAt) {
    const S = this.streak; S.begin();
    // 光束
    for (let k = this.beams.length - 1; k >= 0; k--) {
      const b = this.beams[k]; b.t += dt;
      if (b.t >= b.life) { this.beams.splice(k, 1); continue; }
      const u = b.t / b.life, a = (1 - u) * (1 - u);
      S.push(b.a, b.b, b.w * (1 + u * 1.5), b.c[0], b.c[1], b.c[2], a);
      S.push(b.a, b.b, b.w * 0.35, 3, 3, 3, a);
    }
    // 光彈
    for (const o of this.bolts) {
      _v.copy(o.p).addScaledVector(o.dir, -o.len);
      S.push(_v, o.p, o.w, o.c[0], o.c[1], o.c[2], 1, 0.5);
      S.push(_v, o.p, o.w * 0.35, 3, 3, 3, 1, 0.5);
    }
    // 火花
    for (let k = this.sparks.length - 1; k >= 0; k--) {
      const s = this.sparks[k]; s.t += dt;
      if (s.t >= s.life) { this.sparks.splice(k, 1); continue; }
      s.v.y -= s.grav * dt;
      _w.copy(s.p);
      s.p.addScaledVector(s.v, dt);
      if (floorAt && s.p.y < 0.02) { s.p.y = 0.02; s.v.y = Math.abs(s.v.y) * 0.3; s.v.x *= 0.5; s.v.z *= 0.5; }
      const u = s.t / s.life, cool = 1 - u;
      _v.copy(s.p).addScaledVector(s.v, -0.018);
      S.push(_v, s.p, s.w, s.c[0] * cool, s.c[1] * cool * cool, s.c[2] * cool * cool, cool);
    }
    S.end();
    this.smoke.update(dt); this.glow.update(dt);
    for (const L of this.lights) { L.t += dt; L.l.intensity = L.t < L.life ? L.I * (1 - L.t / L.life) : 0; }
  }
}
