// 創業之城：路網（人行道、車道）、instancing 小人、排隊、外送機車
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------- 路網圖 ----------
export class Graph {
  constructor() { this.nodes = []; this.adj = []; this.edges = []; }
  addNode(x, z) { this.nodes.push({ x, z }); this.adj.push([]); return this.nodes.length - 1; }
  addEdge(a, b) {
    const len = Math.hypot(this.nodes[a].x - this.nodes[b].x, this.nodes[a].z - this.nodes[b].z);
    this.edges.push([a, b, len]); this.adj[a].push([b, len]); this.adj[b].push([a, len]);
  }
  // 找離點最近的邊，回傳投影點
  attach(x, z) {
    let best = null;
    this.edges.forEach((e, i) => {
      const A = this.nodes[e[0]], B = this.nodes[e[1]];
      const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz;
      const t = THREE.MathUtils.clamp(((x - A.x) * dx + (z - A.z) * dz) / l2, 0, 1);
      const qx = A.x + dx * t, qz = A.z + dz * t, d = Math.hypot(x - qx, z - qz);
      if (!best || d < best.d) best = { edge: i, q: [qx, qz], d, t };
    });
    return best;
  }
  // 回傳折線點 [[x,z],...]（含起終點）與總長
  route(P, Q) {
    const A = this.attach(P[0], P[1]), B = this.attach(Q[0], Q[1]);
    const pts = [P];
    if (A.edge === B.edge) { pts.push(A.q, B.q, Q); return finish(pts); }
    const n = this.nodes.length, dist = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
    const eA = this.edges[A.edge], eB = this.edges[B.edge];
    const dN = (i, q) => Math.hypot(this.nodes[i].x - q[0], this.nodes[i].z - q[1]);
    [eA[0], eA[1]].forEach(i => dist[i] = dN(i, A.q));
    for (;;) {
      let u = -1, bd = Infinity; for (let i = 0; i < n; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) break; done[u] = true;
      for (const [v, l] of this.adj[u]) if (dist[u] + l < dist[v]) { dist[v] = dist[u] + l; prev[v] = u; }
    }
    const endN = [eB[0], eB[1]].sort((a, b) => (dist[a] + dN(a, B.q)) - (dist[b] + dN(b, B.q)))[0];
    const path = []; for (let v = endN; v >= 0; v = prev[v]) path.unshift(v);
    // 起點若同時是 A 的另一端，要判斷從哪一端出發
    pts.push(A.q); path.forEach(i => pts.push([this.nodes[i].x, this.nodes[i].z])); pts.push(B.q, Q);
    return finish(pts);
  }
  length(P, Q) { return this.route(P, Q).len; }
}
function finish(pts) {
  const out = [pts[0]]; let len = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - out[out.length - 1][0], pts[i][1] - out[out.length - 1][1]); if (l > 1e-4) { out.push(pts[i]); len += l; } }
  // 去掉折返（A→B→A 的尖角）
  return { pts: out, len };
}

// ---------- 小人幾何與材質 ----------
function personGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, part) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); g.deleteAttribute('uv');
    const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(part), 1));
    parts.push(g.toNonIndexed());
  };
  add(0.03, 0.078, 0.036, 0.02, 0.039, 0, 2); add(0.03, 0.078, 0.036, -0.02, 0.039, 0, 3);   // 腿
  add(0.078, 0.082, 0.044, 0, 0.118, 0, 0);                                                  // 軀幹
  add(0.022, 0.07, 0.028, 0.05, 0.12, 0, 5); add(0.022, 0.07, 0.028, -0.05, 0.12, 0, 6);     // 手
  add(0.054, 0.054, 0.054, 0, 0.18, 0, 1);                                                   // 頭
  add(0.058, 0.02, 0.058, 0, 0.202, -0.002, 4);                                              // 頭髮
  return mergeGeometries(parts);
}
const PERSON_VERT = `
attribute float aPart; attribute vec3 aShirt; attribute vec2 aMo; uniform float uTime;
varying vec3 vPC;
vec3 pickPants(float r){ return r < 0.25 ? vec3(0.10,0.12,0.2) : r < 0.5 ? vec3(0.2,0.2,0.22) : r < 0.75 ? vec3(0.28,0.22,0.16) : vec3(0.12,0.2,0.3); }
vec3 pickSkin(float r){ return r < 0.34 ? vec3(0.96,0.78,0.64) : r < 0.67 ? vec3(0.86,0.66,0.5) : vec3(0.72,0.52,0.38); }
vec3 pickHair(float r){ return r < 0.5 ? vec3(0.06,0.05,0.05) : r < 0.8 ? vec3(0.2,0.12,0.07) : vec3(0.45,0.35,0.2); }
`;
function personMaterial(uTime) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  m.customProgramCacheKey = () => 'tycoon-person';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + PERSON_VERT)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        float sw = sin(uTime * 13.0 + aMo.x) * aMo.y;
        if (aPart > 1.5 && aPart < 3.5) { float a = sw * (aPart < 2.5 ? 1.0 : -1.0); float yy = transformed.y - 0.078, zz = transformed.z; transformed.y = 0.078 + yy * cos(a) - zz * sin(a); transformed.z = yy * sin(a) + zz * cos(a); }
        if (aPart > 4.5) { float a = -sw * (aPart < 5.5 ? 1.0 : -1.0) * 0.8; float yy = transformed.y - 0.15, zz = transformed.z; transformed.y = 0.15 + yy * cos(a) - zz * sin(a); transformed.z = yy * sin(a) + zz * cos(a); }
        float r1 = fract(aMo.x * 7.31), r2 = fract(aMo.x * 3.77), r3 = fract(aMo.x * 11.13);
        vPC = aPart < 0.5 ? aShirt : aPart < 1.5 ? pickSkin(r1) : aPart < 3.5 ? pickPants(r2) : aPart < 4.5 ? pickHair(r3) : (aPart < 5.5 || aPart < 6.5) ? aShirt * 0.92 : aShirt;
      `);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPC;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vPC;');
  };
  return m;
}
const SHIRTS = ['#e8564c', '#f2b84b', '#4fa3e8', '#58c08a', '#c58be8', '#f28fb0', '#f4f0e6', '#2f3b52', '#ee8a3a', '#69c7c4', '#9aa7b8', '#d84a6a'].map(c => new THREE.Color(c));

export function createPeople(root, { sidewalk, roads, uTime, doorOf, lotNrm, laneOff = 0.19, qCap }) {
  const CAP = 700, QCAP = qCap;
  const geo = personGeometry();
  const mat = personMaterial(uTime);

  function makePool(cap) {
    const g = geo.clone();
    const shirt = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3), mo = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    shirt.setUsage(THREE.DynamicDrawUsage); mo.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aShirt', shirt); g.setAttribute('aMo', mo);
    const im = new THREE.InstancedMesh(g, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < cap; i++) im.setMatrixAt(i, z);
    root.add(im); return { im, shirt, mo, cap };
  }
  const W = makePool(CAP), Q = makePool(QCAP);

  // 雨傘
  const uGeo = (() => {
    const c = new THREE.ConeGeometry(0.1, 0.045, 10, 1, true).translate(0, 0.28, 0);
    const h = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4).translate(0, 0.21, 0);
    const col = (g, v) => { const n = g.attributes.position.count, a = new Float32Array(n * 3).fill(v); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g.toNonIndexed(); };
    return mergeGeometries([col(c, 1), col(h, 0.12)]);
  })();
  const uMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  const umbW = new THREE.InstancedMesh(uGeo, uMat, CAP), umbQ = new THREE.InstancedMesh(uGeo, uMat, QCAP);
  [umbW, umbQ].forEach(u => { u.frustumCulled = false; u.castShadow = true; u.visible = false; u.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(u); });
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAP; i++) { umbW.setMatrixAt(i, ZERO); umbW.setColorAt(i, SHIRTS[i % SHIRTS.length]); }
  for (let i = 0; i < QCAP; i++) { umbQ.setMatrixAt(i, ZERO); umbQ.setColorAt(i, SHIRTS[(i * 5) % SHIRTS.length]); }

  // ---- 步行者 ----
  const walkers = [], free = []; for (let i = CAP - 1; i >= 0; i--) free.push(i);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  let nextId = 1, rainy = false;
  function spawnWalker(from, lotId, opts = {}) {
    if (!free.length) return null;
    const door = doorOf(lotId); if (!door) return null;
    const r = sidewalk.route([from[0], from[1]], [door.x, door.z]);
    // 起點：人從建築出入口出現在人行道上（略過建築內部的直線）
    const pts = r.pts.slice(1);
    if (pts.length < 2) pts.unshift([from[0], from[1]]);
    const slot = free.pop(), id = nextId++;
    const w = { id, slot, pts, seg: 0, s: 0, speed: (opts.speed || 0.55) * (0.88 + Math.random() * 0.24), phase: Math.random() * 6.28, state: 0, t: 0, lot: lotId, cb: opts.onArrive, nrm: lotNrm(lotId), grow: 0 };
    const col = opts.color ? new THREE.Color(opts.color) : SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
    W.shirt.setXYZ(slot, col.r, col.g, col.b); W.mo.setXY(slot, w.phase, 0.62); W.shirt.needsUpdate = true; W.mo.needsUpdate = true;
    umbW.setColorAt(slot, new THREE.Color().setHSL(Math.random(), 0.55, 0.55)); if (umbW.instanceColor) umbW.instanceColor.needsUpdate = true;
    walkers.push(w); return id;
  }
  function stepWalkers(dt, t) {
    for (let k = walkers.length - 1; k >= 0; k--) {
      const w = walkers[k]; let x, z, hd, sc = 1, yb = 0;
      if (w.state === 0) {
        w.grow = Math.min(1, w.grow + dt * 4);
        let rem = w.speed * dt;
        while (rem > 0 && w.seg < w.pts.length - 1) {
          const a = w.pts[w.seg], b = w.pts[w.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (w.s + rem >= L) { rem -= L - w.s; w.seg++; w.s = 0; } else { w.s += rem; rem = 0; }
        }
        if (w.seg >= w.pts.length - 1) { w.state = 1; w.t = 0; }
        const i = Math.min(w.seg, w.pts.length - 2), a = w.pts[i], b = w.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = w.s / L;
        x = a[0] + (b[0] - a[0]) * f; z = a[1] + (b[1] - a[1]) * f; hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
        w.hd = hd; sc = w.grow;
        yb = Math.abs(Math.sin(t * 13 + w.phase)) * 0.008;
      } else {
        w.t += dt * 3.5; const e = Math.min(1, w.t);
        const b = w.pts[w.pts.length - 1];
        // 轉向店面、走進門
        hd = Math.atan2(-w.nrm[0], -w.nrm[1]);
        x = b[0] - w.nrm[0] * 0.07 * e; z = b[1] - w.nrm[1] * 0.07 * e; sc = Math.max(0.001, 1 - e);
        W.mo.setY(w.slot, 0); W.mo.needsUpdate = true;
        if (w.t >= 1) { free.push(w.slot); _m.copy(ZERO); W.im.setMatrixAt(w.slot, _m); umbW.setMatrixAt(w.slot, ZERO); walkers.splice(k, 1); w.cb && w.cb(w.lot); continue; }
      }
      _q.setFromAxisAngle(UP, hd); _p.set(x, 0.03 + yb, z); _s.setScalar(sc); _m.compose(_p, _q, _s);
      W.im.setMatrixAt(w.slot, _m);
      if (rainy) { _p.set(x, 0.03 + yb, z); umbW.setMatrixAt(w.slot, _m); }
    }
    W.im.instanceMatrix.needsUpdate = true; W.im.visible = true;
    if (rainy) umbW.instanceMatrix.needsUpdate = true;
  }

  // ---- 排隊 ----
  const qState = new Map();   // lotId -> {slots, n}
  const sprites = new Map();
  function qTex(n) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = 'rgba(20,20,30,.82)'; g.beginPath(); g.roundRect(4, 4, 120, 56, 22); g.fill();
    g.fillStyle = '#fff'; g.font = '700 38px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('+' + n, 64, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const lotIndex = new Map();
  function setQueue(lotId, n, anchor) {
    // anchor: { x, z, nx, nz, tx, tz, sx }（店面本地座標系：窗前起點、法線、切線）
    if (!lotIndex.has(lotId)) lotIndex.set(lotId, lotIndex.size);
    const li = lotIndex.get(lotId), base = li * 12;
    n = Math.max(0, Math.floor(n)); const show = Math.min(12, n);
    for (let k = 0; k < 12; k++) {
      const slot = base + k;
      if (k < show) {
        const off = 0.0 + k * 0.105;
        const x = anchor.x + anchor.tx * (anchor.sx - off) + anchor.nx * 0.085, z = anchor.z + anchor.tz * (anchor.sx - off) + anchor.nz * 0.085;
        _q.setFromAxisAngle(UP, Math.atan2(-anchor.nx, -anchor.nz) + (k > 0 ? (((k * 7) % 5) - 2) * 0.12 : 0));
        _p.set(x, 0.03, z); _s.setScalar(1); _m.compose(_p, _q, _s);
        Q.im.setMatrixAt(slot, _m); umbQ.setMatrixAt(slot, _m);
        const col = SHIRTS[(slot * 7 + 3) % SHIRTS.length]; Q.shirt.setXYZ(slot, col.r, col.g, col.b); Q.mo.setXY(slot, slot * 1.7, 0);
      } else { Q.im.setMatrixAt(slot, ZERO); umbQ.setMatrixAt(slot, ZERO); }
    }
    Q.im.instanceMatrix.needsUpdate = true; Q.shirt.needsUpdate = true; Q.mo.needsUpdate = true; umbQ.instanceMatrix.needsUpdate = true;
    // +N 標示
    let sp = sprites.get(lotId);
    if (n > 12) {
      const k = show - 1, off = k * 0.105;
      const x = anchor.x + anchor.tx * (anchor.sx - off) + anchor.nx * 0.085, z = anchor.z + anchor.tz * (anchor.sx - off) + anchor.nz * 0.085;
      if (!sp) { sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: qTex(n - 12), transparent: true, depthWrite: false, toneMapped: false })); sp.scale.set(0.2, 0.1, 1); root.add(sp); sprites.set(lotId, sp); sp.userData.n = n - 12; }
      else if (sp.userData.n !== n - 12) { sp.material.map.dispose(); sp.material.map = qTex(n - 12); sp.material.needsUpdate = true; sp.userData.n = n - 12; }
      sp.position.set(x - anchor.tx * 0.12, 0.3, z - anchor.tz * 0.12); sp.visible = true;
    } else if (sp) sp.visible = false;
    qState.set(lotId, n);
  }

  // ---- 外送機車 ----
  const SC_CAP = 60;
  const scGeo = (() => {
    const L = [];
    const add = (g, c) => { g.deleteAttribute('uv'); const ng = g.toNonIndexed(); const n = ng.attributes.position.count, a = new Float32Array(n * 3); const cc = new THREE.Color(c); for (let i = 0; i < n; i++) { a[i * 3] = cc.r; a[i * 3 + 1] = cc.g; a[i * 3 + 2] = cc.b; } ng.setAttribute('color', new THREE.BufferAttribute(a, 3)); L.push(ng); };
    const bx = (w, h, d, x, y, z, c) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);
    const cy = (r, h, x, y, z, c) => add(new THREE.CylinderGeometry(r, r, h, 10).rotateZ(Math.PI / 2).translate(x, y, z), c);
    cy(0.032, 0.024, 0, 0.032, 0.1, '#1b1b22'); cy(0.032, 0.024, 0, 0.032, -0.1, '#1b1b22');     // 輪
    bx(0.05, 0.03, 0.2, 0, 0.065, 0, '#ffffff');                                                // 車身
    bx(0.05, 0.075, 0.03, 0, 0.1, 0.095, '#ffffff');                                            // 前擋
    bx(0.015, 0.04, 0.015, 0, 0.14, 0.1, '#222');                                               // 龍頭
    bx(0.045, 0.02, 0.09, 0, 0.095, -0.035, '#2a2a30');                                         // 座墊
    bx(0.085, 0.085, 0.085, 0, 0.16, -0.105, '#ffffff');                                        // 外送箱
    bx(0.05, 0.075, 0.035, 0, 0.165, -0.02, '#ffffff');                                         // 騎士身
    bx(0.04, 0.055, 0.06, 0.0, 0.12, 0.035, '#2b2e3a');                                         // 腿
    add(new THREE.BoxGeometry(0.052, 0.05, 0.052).translate(0, 0.235, -0.01), '#ffffff');        // 安全帽
    add(new THREE.BoxGeometry(0.04, 0.02, 0.01).translate(0, 0.225, 0.017), '#26303f');         // 護目
    return mergeGeometries(L);
  })();
  const scMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
  const SC = new THREE.InstancedMesh(scGeo, scMat, SC_CAP);
  SC.instanceMatrix.setUsage(THREE.DynamicDrawUsage); SC.frustumCulled = false; SC.castShadow = true;
  for (let i = 0; i < SC_CAP; i++) { SC.setMatrixAt(i, ZERO); SC.setColorAt(i, new THREE.Color(1, 1, 1)); }
  root.add(SC);
  const scooters = [], scFree = []; for (let i = SC_CAP - 1; i >= 0; i--) scFree.push(i);
  function laneRoute(door, nrm, toXZ) {
    // 從店門到最近車道中心線，沿道路圖走，最後離開車道到 toXZ
    const S = [door.x + nrm[0] * 0.5, door.z + nrm[1] * 0.5];
    const r = roads.route(S, toXZ);
    // r.pts: [S, A.q, nodes..., B.q, toXZ]；路段部分是 pts[1..n-2]
    const c = r.pts.slice(1, -1), out = [];
    if (c.length < 2) return [[door.x, door.z], [toXZ[0], toXZ[1]]];
    const dirs = []; for (let i = 0; i < c.length - 1; i++) { const dx = c[i + 1][0] - c[i][0], dz = c[i + 1][1] - c[i][1], l = Math.hypot(dx, dz) || 1; dirs.push([dx / l, dz / l]); }
    const right = (d) => [-d[1], d[0]];
    for (let i = 0; i < c.length; i++) {
      let ox = 0, oz = 0;
      if (i === 0) { const r0 = right(dirs[0]); ox = r0[0]; oz = r0[1]; }
      else if (i === c.length - 1) { const r0 = right(dirs[i - 1]); ox = r0[0]; oz = r0[1]; }
      else { const a = right(dirs[i - 1]), b = right(dirs[i]); if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) { ox = a[0]; oz = a[1]; } else { ox = a[0] + b[0]; oz = a[1] + b[1]; } }
      out.push([c[i][0] + ox * laneOff, c[i][1] + oz * laneOff]);
    }
    return [[door.x + nrm[0] * 0.12, door.z + nrm[1] * 0.12], ...out, [toXZ[0], toXZ[1]]];
  }
  function spawnScooter(lotId, toXZ, opts = {}) {
    if (!scFree.length) return null;
    const door = doorOf(lotId); if (!door) return null;
    const pts = laneRoute(door, lotNrm(lotId), toXZ);
    const slot = scFree.pop(), id = nextId++;
    SC.setColorAt(slot, new THREE.Color(opts.color || '#2fbf7a').lerp(new THREE.Color(1, 1, 1), 0.15));
    SC.instanceColor.needsUpdate = true;
    scooters.push({ id, slot, pts, seg: 0, s: 0, speed: opts.speed || 1.5, state: 0, t: 0, cb: opts.onArrive, lot: lotId, hd: 0 });
    return id;
  }
  function stepScooters(dt) {
    for (let k = scooters.length - 1; k >= 0; k--) {
      const w = scooters[k];
      let rem = w.speed * dt;
      while (rem > 0 && w.seg < w.pts.length - 1) {
        const a = w.pts[w.seg], b = w.pts[w.seg + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (w.s + rem >= L) { rem -= L - w.s; w.seg++; w.s = 0; } else { w.s += rem; rem = 0; }
      }
      const done = w.seg >= w.pts.length - 1;
      const i = Math.min(w.seg, w.pts.length - 2), a = w.pts[i], b = w.pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, f = done ? 1 : w.s / L;
      const x = a[0] + (b[0] - a[0]) * f, z = a[1] + (b[1] - a[1]) * f;
      if (L > 1e-3) w.hd = Math.atan2(b[0] - a[0], b[1] - a[1]);
      let sc = 1; if (done) { w.t += dt * 2; sc = Math.max(0.001, 1 - w.t); }
      // 出發時淡入
      const born = Math.min(1, (w.seg === 0 ? w.s : 1) / 0.05 + 0.15); sc = Math.min(sc, born);
      _q.setFromAxisAngle(UP, w.hd); _p.set(x, 0.01, z); _s.setScalar(sc * 1.15); _m.compose(_p, _q, _s);
      SC.setMatrixAt(w.slot, _m);
      if (done && w.t >= 1) { SC.setMatrixAt(w.slot, ZERO); scFree.push(w.slot); scooters.splice(k, 1); w.cb && w.cb(w.lot); }
    }
    SC.instanceMatrix.needsUpdate = true;
  }

  return {
    spawnWalker, spawnScooter, setQueue,
    update(dt, t) { stepWalkers(dt, t); stepScooters(dt); },
    setRain(r) { rainy = r; umbW.visible = r; umbQ.visible = r; },
    counts: () => ({ walkers: walkers.length, scooters: scooters.length, queued: [...qState.values()].reduce((a, b) => a + Math.min(12, b), 0) }),
    clear() { walkers.splice(0).forEach(w => { W.im.setMatrixAt(w.slot, ZERO); umbW.setMatrixAt(w.slot, ZERO); free.push(w.slot); }); W.im.instanceMatrix.needsUpdate = true; },
  };
}
