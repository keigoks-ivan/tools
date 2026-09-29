// 關卡積木：材質（Poly Haven CC0 照片貼圖，世界座標貼 UV）、合併幾何、3D 碰撞盒（移動／子彈／視線）
//   所有同材質的東西合併成一個網格：整張地圖約 12 個 draw call
import * as THREE from 'three';

const ASSET = new URL('./assets/', import.meta.url).href;
export const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- 材質
// tile＝一張貼圖代表幾公尺
const SURF = {
  concrete: { tex: 'painted_concrete', tile: 3.2, color: 0xb9b4aa },
  wall: { tex: 'concrete_wall_008', tile: 3.0, color: 0xc4beb2 },
  brick: { tex: 'red_brick_03', tile: 2.4, color: 0xc9b5a5 },
  plaster: { tex: 'damaged_plaster', tile: 2.6, color: 0xd2cbc0 },
  floor: { tex: 'concrete_floor_02', tile: 4.0, color: 0xa39d95 },
  tile: { tex: 'floor_tiles_02', tile: 1.8, color: 0xb8b2a6 },
  metal: { tex: 'metal_plate', tile: 2.0, color: 0x9ca1a6, metal: true },
  rust: { tex: 'rusty_metal_02', tile: 2.5, color: 0xb0a090, metal: true },
  fabric: { tex: 'fabric_pattern_07', tile: 0.9, color: 0xb5aa92 },
  corr: { tex: 'corrugated_iron_02', tile: 2.2, color: 0xa7aca8, metal: true },
};
export const SURFACES = Object.keys(SURF);

export async function loadSurfaces(renderer, onStep = () => {}) {
  const tl = new THREE.TextureLoader();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const T = (n, srgb) => tl.loadAsync(ASSET + n).then((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    onStep(); return t;
  });
  const out = {};
  await Promise.all(Object.entries(SURF).map(async ([k, s]) => {
    const [map, normalMap, arm] = await Promise.all([T(s.tex + '_col.webp', true), T(s.tex + '_nor.webp'), T(s.tex + '_arm.webp')]);
    const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, aoMap: arm, metalnessMap: s.metal ? arm : null, metalness: s.metal ? 1 : 0, roughness: 1, color: s.color, vertexColors: true });
    // aoMap 預設吃第二組 UV：這裡直接用第一組（每個頂點都用同一套世界 UV）
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', AO_CHUNK); };
    m.userData.tile = s.tile;
    out[k] = m;
  }));
  return out;
}
const AO_CHUNK = `
#ifdef USE_AOMAP
  float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
  reflectedLight.indirectDiffuse *= ambientOcclusion;
  #if defined( USE_CLEARCOAT )
    clearcoatSpecularIndirect *= ambientOcclusion;
  #endif
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
  #endif
#endif`;

// ---------------------------------------------------------------- 合併幾何
class Bucket {
  constructor(tile) { this.tile = tile; this.p = []; this.n = []; this.u = []; this.c = []; }
  // 四邊形 a b c d（逆時針朝外），n＝法線，shade＝頂點亮度（暗角／室內）
  quad(a, b, c, d, n, shade = [1, 1, 1, 1], uvs = null) {
    const T = this.tile;
    const P = [a, b, c, d];
    const ax = Math.abs(n[0]) > 0.5 ? [2, 1] : Math.abs(n[1]) > 0.5 ? [0, 2] : [0, 1];
    const uv = uvs || P.map((p) => [p[ax[0]] / T * (n[0] < -0.5 || n[2] > 0.5 ? 1 : n[1] > 0.5 ? 1 : -1), p[ax[1]] / T]);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(n[0], n[1], n[2]);
      this.u.push(uv[i][0], uv[i][1]); const s = shade[i]; this.c.push(s, s, s);
    }
  }
  // 方塊；skip＝不畫的面 'px nx py ny pz nz'；shade(y)＝依高度的亮度（牆腳髒一點）
  box(x0, x1, y0, y1, z0, z1, o = {}) {
    const sk = o.skip || '', S = o.shade || shadeY;
    const sh = (ys) => ys.map((y) => S(y, o));
    if (!sk.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sh([y0, y0, y1, y1]));
    if (!sk.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sh([y0, y0, y1, y1]));
    if (!sk.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sh([y0, y0, y1, y1]));
    if (!sk.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sh([y0, y0, y1, y1]));
    if (!sk.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], sh([y1, y1, y1, y1]));
    if (!sk.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sh([y0, y0, y0, y0]));
  }
  // 任意朝向的方塊（中心、半尺寸、繞 Y 轉）：道具用
  obox(cx, cy, cz, hx, hy, hz, ry = 0, o = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const S = o.shade || shadeY;
    const f = (a, b, cc, d, n) => { const pts = [a, b, cc, d].map((q) => P(...q)); this.quad(pts[0], pts[1], pts[2], pts[3], N(...n), pts.map((q) => S(q[1], o))); };
    f([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]);
    f([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]);
    f([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]);
    f([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]);
    f([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]);
    if (!o.noBottom) f([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0]);
  }
  // 任意幾何（已套好世界矩陣）：依法線方向重新算世界 UV
  geo(g, M, shade = 1) {
    const G = g.index ? g.toNonIndexed() : g;
    const P = G.attributes.position, N = G.attributes.normal, T = this.tile;
    const nm = new THREE.Matrix3().getNormalMatrix(M);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ax >= ay && ax >= az) this.u.push(v.z / T, v.y / T); else if (ay >= az) this.u.push(v.x / T, v.z / T); else this.u.push(v.x / T, v.y / T);
      const s = typeof shade === 'function' ? shade(v.y) : shade; this.c.push(s, s, s);
    }
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}
// 牆腳 0.6 m 內變暗（髒污＋接地陰影），室內（o.dim）整體暗一點
function shadeY(y, o) { const base = o.dim ?? 1; const g = y - (o.ground ?? 0); return base * (g < 0.8 ? 0.62 + 0.38 * (g / 0.8) : 1); }

// ---------------------------------------------------------------- 碰撞盒
// 每個盒子 {x0,x1,y0,y1,z0,z1, mat}；可選 ramp:{axis:'x'|'z', dir:±1}（樓梯：頂面沿軸線從 y0 升到 y1）
export class Solid {
  constructor(cell = 6) { this.list = []; this.cell = cell; this.grid = new Map(); this.stamp = 0; }
  add(b) {
    b.id = this.list.length; b.st = 0; this.list.push(b);
    const c = this.cell;
    for (let gx = Math.floor(b.x0 / c); gx <= Math.floor(b.x1 / c); gx++)
      for (let gz = Math.floor(b.z0 / c); gz <= Math.floor(b.z1 / c); gz++) {
        const k = gx * 73856 + gz;
        let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(b);
      }
    return b;
  }
  near(x, z, r, out) {
    out.length = 0; const c = this.cell, st = ++this.stamp;
    for (let gx = Math.floor((x - r) / c); gx <= Math.floor((x + r) / c); gx++)
      for (let gz = Math.floor((z - r) / c); gz <= Math.floor((z + r) / c); gz++) {
        const l = this.grid.get(gx * 73856 + gz); if (!l) continue;
        for (const b of l) if (b.st !== st) { b.st = st; if (!b.dead) out.push(b); }
      }
    return out;
  }
  // 頂面高度（樓梯是斜的）
  top(b, x, z) {
    if (!b.ramp) return b.y1;
    const t = b.ramp.axis === 'x' ? (x - b.x0) / (b.x1 - b.x0) : (z - b.z0) / (b.z1 - b.z0);
    return b.y0 + (b.y1 - b.y0) * clamp(b.ramp.dir > 0 ? t : 1 - t, 0, 1);
  }
  // 腳下最高的可站立面（不高於 yRef）
  floorAt(x, z, yRef, r = 0) {
    let h = 0;
    for (const b of this.near(x, z, r + 0.1, this._n1 || (this._n1 = []))) {
      if (b.noFloor || b.noMove || x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
      const t = this.top(b, clamp(x, b.x0, b.x1), clamp(z, b.z0, b.z1));
      if (t <= yRef + 1e-3 && t > h) h = t;
    }
    return h;
  }
  // 天花板（頭頂上方最近的底面）
  ceilAt(x, z, y, r = 0) {
    let h = 1e9;
    for (const b of this.near(x, z, r, this._n2 || (this._n2 = []))) {
      if (b.ramp || b.noMove || x < b.x0 - r || x > b.x1 + r || z < b.z0 - r || z > b.z1 + r) continue;
      if (b.y0 >= y - 1e-3 && b.y0 < h) h = b.y0;
    }
    return h;
  }
  // 直立圓柱（腳 y0～頭 y1）推出盒子；回傳是否碰到
  pushOut(p, r, y0 = p.y, y1 = p.y + 1.7, step = 0.45) {
    let hit = false;
    for (const b of this.near(p.x, p.z, r + 0.5, this._n3 || (this._n3 = []))) {
      if (b.noMove) continue;
      const top = b.ramp ? this.top(b, clamp(p.x, b.x0, b.x1), clamp(p.z, b.z0, b.z1)) : b.y1;
      if (top <= y0 + step || b.y0 >= y1) continue;
      if (b.ramp && top <= y0 + 0.9) continue;   // 樓梯：踩上去，不當牆
      const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
      const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 < 1e-8) {
        const l = p.x - b.x0, rr = b.x1 - p.x, f = p.z - b.z0, bk = b.z1 - p.z, m = Math.min(l, rr, f, bk);
        if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === f) p.z = b.z0 - r; else p.z = b.z1 + r;
      } else { const d = Math.sqrt(d2); p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
      hit = true;
    }
    return hit;
  }
  // 射線：o 起點、d 單位方向、maxT；回傳 {t, n, b} 或 null
  ray(o, d, maxT, skip = null) {
    const c = this.cell, st = ++this.stamp;
    let best = maxT, bn = -1, bs = 0, bb = null;
    // 沿射線走格子（DDA）
    let gx = Math.floor(o.x / c), gz = Math.floor(o.z / c);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = Math.abs(d.x) > 1e-9 ? c / Math.abs(d.x) : 1e9, tdz = Math.abs(d.z) > 1e-9 ? c / Math.abs(d.z) : 1e9;
    let tx = Math.abs(d.x) > 1e-9 ? ((sx > 0 ? (gx + 1) * c - o.x : o.x - gx * c) / Math.abs(d.x)) : 1e9;
    let tz = Math.abs(d.z) > 1e-9 ? ((sz > 0 ? (gz + 1) * c - o.z : o.z - gz * c) / Math.abs(d.z)) : 1e9;
    let t0 = 0;
    for (let guard = 0; guard < 400 && t0 <= best; guard++) {
      const l = this.grid.get(gx * 73856 + gz);
      if (l) for (const b of l) {
        if (b.st === st || b === skip || b.noRay || b.dead) continue; b.st = st;
        let lo = 0, hi = best, ax = -1, sg = 0;
        const L = [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.ramp ? (b.y0 + b.y1) / 2 : b.y1], [o.z, d.z, b.z0, b.z1]];
        let ok = true;
        for (let k = 0; k < 3; k++) {
          const [oo, dd, mn, mx] = L[k];
          if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
          let ta = (mn - oo) / dd, tb = (mx - oo) / dd;
          if (ta > tb) { const q = ta; ta = tb; tb = q; }
          if (ta > lo) { lo = ta; ax = k; sg = dd > 0 ? -1 : 1; }
          if (tb < hi) hi = tb;
          if (lo > hi) { ok = false; break; }
        }
        if (ok && lo < best && lo >= 0 && ax >= 0) { best = lo; bn = ax; bs = sg; bb = b; }
      }
      if (tx < tz) { t0 = tx; tx += tdx; gx += sx; } else { t0 = tz; tz += tdz; gz += sz; }
    }
    // 地面
    if (d.y < -1e-6) { const tg = -o.y / d.y; if (tg < best) { best = tg; bn = 1; bs = 1; bb = null; } }
    if (bn < 0 && best >= maxT) return null;
    const n = new THREE.Vector3(); n.setComponent(bn, bs);
    return { t: best, n, b: bb, mat: bb ? bb.mat : 'floor' };
  }
  // 視線（兩點之間有沒有擋）
  sees(a, b) {
    const d = _v.subVectors(b, a); const L = d.length(); d.divideScalar(L);
    const h = this.ray(a, d, L - 0.05);
    return !h;
  }
}
const _v = new THREE.Vector3();

// ---------------------------------------------------------------- 建造器：把積木寫進材質桶＋碰撞
export class Builder {
  constructor(mats, solid) {
    this.mats = mats; this.solid = solid;
    this.B = {};
    for (const k of Object.keys(mats)) this.B[k] = new Bucket(mats[k].userData.tile || 3);
    this.extra = [];   // 其他網格（窗戶玻璃、燈）
  }
  // 實心方塊＋碰撞
  block(mat, x0, x1, y0, y1, z0, z1, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    this.B[mat].box(x0, x1, y0, y1, z0, z1, o);
    if (o.solid !== false) this.solid.add({ x0, x1, y0, y1, z0, z1, mat: o.hitMat || mat, noFloor: o.noFloor, ramp: o.ramp });
  }
  // 只有外觀
  deco(mat, x0, x1, y0, y1, z0, z1, o = {}) { this.block(mat, x0, x1, y0, y1, z0, z1, { ...o, solid: false }); }
  obox(mat, cx, cy, cz, hx, hy, hz, ry = 0, o = {}) {
    this.B[mat].obox(cx, cy, cz, hx, hy, hz, ry, o);
    if (o.solid !== false) {
      // 碰撞用外接 AABB
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const ex = hx * c + hz * s, ez = hx * s + hz * c;
      this.solid.add({ x0: cx - ex, x1: cx + ex, y0: cy - hy, y1: cy + hy, z0: cz - ez, z1: cz + ez, mat: o.hitMat || mat });
    }
  }
  // 任意幾何放到 (x,y,z)、繞 Y 轉 ry；solid＝要不要加外接碰撞盒
  mesh(mat, g, x, y, z, ry = 0, o = {}) {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1).multiplyScalar(o.scale || 1));
    this.B[mat].geo(g, M, o.shade ?? ((yy) => (yy - y < 0.5 ? 0.7 + 0.6 * (yy - y) : 1)));
    if (o.solid) { g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(M); this.solid.add({ x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: o.top ?? bb.max.y, z0: bb.min.z, z1: bb.max.z, mat: o.hitMat || mat }); }
  }
  build(scene) {
    const out = [];
    for (const [k, b] of Object.entries(this.B)) {
      const g = b.geometry(); if (!g) continue;
      const m = new THREE.Mesh(g, this.mats[k]);
      m.castShadow = true; m.receiveShadow = true;
      m.name = 'lvl-' + k;
      scene.add(m); out.push(m);
    }
    return out;
  }
}
