// 關卡積木：材質（Poly Haven CC0 照片貼圖，世界座標貼 UV）、合併幾何、3D 碰撞盒（移動／子彈／視線）
//   所有同材質的東西合併成一個網格：整張地圖約 12 個 draw call
import * as THREE from 'three';

const ASSET = new URL('./assets/', import.meta.url).href;
export const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- 材質
// tile＝一張貼圖代表幾公尺
const SURF = {
  concrete: { tex: 'painted_concrete', col: 'concrete_grey', tile: 3.2, color: 0xb4b0a8 },   // 原本的綠漆混凝土像迷彩：換成同一張的灰階版（col）
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
    // s.col 的新貼圖萬一抓不到（CDN 還是舊版本），退回原本那張，遊戲照樣能進
    const col = s.col ? T(s.col + '_col.webp', true).catch(() => T(s.tex + '_col.webp', true)) : T(s.tex + '_col.webp', true);
    const [map, normalMap, arm] = await Promise.all([col, T(s.tex + '_nor.webp'), T(s.tex + '_arm.webp')]);
    const m = new THREE.MeshStandardMaterial({ map, normalMap, roughnessMap: arm, aoMap: arm, metalnessMap: s.metal ? arm : null, metalness: s.metal ? 1 : 0, roughness: 1, color: s.color, vertexColors: true });
    m.aoMapIntensity = .72;
    m.normalScale.setScalar(k === 'floor' || k === 'tile' ? .42 : s.metal ? .7 : .65);
    // aoMap 預設吃第二組 UV：這裡直接用第一組（每個頂點都用同一套世界 UV）
    m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', AO_CHUNK); grimeShader(sh, m); };
    m.userData.tile = s.tile; m.userData.grime = s.metal ? 0.6 : 1;
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

// ---------------------------------------------------------------- 風化：大範圍明暗（打破貼圖重複）、牆上往下流的水痕、成片的污漬
//   一張程式畫的 256² 雜訊圖（不用下載）；依世界座標取樣，所以合併網格、實例化模型都接得起來
let GRIME = null;
export function grimeTex() {
  if (GRIME) return GRIME;
  const N = 256, px = new Uint8Array(N * N * 4);
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  // 可循環的值雜訊：橫向 cx 格、縱向 cy 格
  const vn = (u, v, cx, cy, s) => {
    const x = u * cx, y = v * cy, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const h = (i, j) => hash((x0 + i) % cx, (y0 + j) % cy, s);
    return (h(0, 0) * (1 - sx) + h(1, 0) * sx) * (1 - sy) + (h(0, 1) * (1 - sx) + h(1, 1) * sx) * sy;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = i / N, v = j / N, k = (j * N + i) * 4;
    px[k] = 255 * (0.45 * vn(u, v, 4, 4, 1) + 0.28 * vn(u, v, 8, 8, 2) + 0.17 * vn(u, v, 16, 16, 3) + 0.1 * vn(u, v, 32, 32, 4));   // 大範圍明暗
    px[k + 1] = 255 * (0.55 * vn(u, v, 48, 3, 5) + 0.3 * vn(u, v, 96, 5, 6) + 0.15 * vn(u, v, 24, 2, 7));                           // 直向拉長：水痕
    px[k + 2] = 255 * (0.5 * vn(u, v, 24, 24, 8) + 0.3 * vn(u, v, 48, 48, 9) + 0.2 * vn(u, v, 96, 96, 10));                         // 污漬（跟大範圍明暗同一次取樣，頻率高一點）
    px[k + 3] = 255;
  }
  const t = new THREE.DataTexture(px, N, N); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return (GRIME = t);
}
// 插進任何 MeshStandardMaterial 的 shader（onBeforeCompile 裡呼叫）；m.userData.grime＝強度（0 關掉）
export function grimeShader(sh, m) {
  const k = m.userData.grime ?? 1; if (!k) return;
  sh.uniforms.grimeMap = { value: grimeTex() }; sh.uniforms.grimeK = { value: k };
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW; varying vec3 vGN;').replace('#include <begin_vertex>', `#include <begin_vertex>
    vec4 gw = vec4( transformed, 1.0 ); vec3 gn = objectNormal;
    #ifdef USE_INSTANCING
      gw = instanceMatrix * gw; gn = mat3( instanceMatrix ) * gn;
    #endif
    vGW = ( modelMatrix * gw ).xyz; vGN = mat3( modelMatrix ) * gn;`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D grimeMap; uniform float grimeK; varying vec3 vGW; varying vec3 vGN;').replace('#include <map_fragment>', `#include <map_fragment>
    float surfaceDirt = 0.0, surfaceWet = 0.0;
    {
      vec3 gn = normalize( vGN ); float wallK = 1.0 - abs( gn.y );
      float al = abs( gn.x ) > abs( gn.z ) ? vGW.z : vGW.x;
      vec2 gu = vGW.xz + vec2( al * wallK, vGW.y );
      vec4 gm = texture2D( grimeMap, gu * 0.011 ); float mac = gm.r, bl = gm.b;
      float st = texture2D( grimeMap, vec2( al * 0.035, vGW.y * 0.06 ) ).g;
      float d = ( 0.52 - mac ) * 0.55 + wallK * smoothstep( 0.52, 0.8, st ) * 0.42 + smoothstep( 0.56, 0.8, bl ) * 0.3;
      surfaceDirt = clamp(d * grimeK, 0.0, 0.65);
      // 掃描材質上的薄水膜與灰塵交錯，不將整片地面變成鏡子。
      surfaceWet = (1.0-wallK) * smoothstep(.54,.68,mac) * (1.0-smoothstep(.48,.62,bl));
      diffuseColor.rgb *= clamp( 1.0 - grimeK * d * vec3( 0.88, 1.0, 1.14 ), 0.25, 1.3 );
    }`).replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + surfaceDirt * 0.2, 0.08, 1.0);
      roughnessFactor = mix(roughnessFactor, max(.32,roughnessFactor*.55),surfaceWet*.55);`);
}

// ---------------------------------------------------------------- 合併幾何
class Bucket {
  constructor(tile) { this.tile = tile; this.p = []; this.n = []; this.u = []; this.c = []; }
  // 四邊形 a b c d（逆時針朝外），n＝法線，shade＝頂點亮度（暗角／室內）
  quad(a, b, c, d, n, shade = [1, 1, 1, 1], uvs = null, tint = null) {
    const T = this.tile, t = tint || ONE;
    const P = [a, b, c, d];
    const ax = Math.abs(n[0]) > 0.5 ? [2, 1] : Math.abs(n[1]) > 0.5 ? [0, 2] : [0, 1];
    const uv = uvs || P.map((p) => [p[ax[0]] / T * (n[0] < -0.5 || n[2] > 0.5 ? 1 : n[1] > 0.5 ? 1 : -1), p[ax[1]] / T]);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.p.push(P[i][0], P[i][1], P[i][2]); this.n.push(n[0], n[1], n[2]);
      this.u.push(uv[i][0], uv[i][1]); const s = shade[i]; this.c.push(s * t[0], s * t[1], s * t[2]);
    }
  }
  // 方塊；skip＝不畫的面 'px nx py ny pz nz'；shade(y)＝依高度的亮度（牆腳髒一點）
  box(x0, x1, y0, y1, z0, z1, o = {}) {
    const sk = o.skip || '', S = o.shade || shadeY;
    const sh = (ys) => ys.map((y) => S(y, o)), t = o.tint;
    if (!sk.includes('px')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sh([y0, y0, y1, y1]), null, t);
    if (!sk.includes('nx')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sh([y0, y0, y1, y1]), null, t);
    if (!sk.includes('pz')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], sh([y0, y0, y1, y1]), null, t);
    if (!sk.includes('nz')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], sh([y0, y0, y1, y1]), null, t);
    if (!sk.includes('py')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], sh([y1, y1, y1, y1]), null, t);
    if (!sk.includes('ny')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], sh([y0, y0, y0, y0]), null, t);
  }
  // 任意朝向的方塊（中心、半尺寸、繞 Y 轉）：道具用
  obox(cx, cy, cz, hx, hy, hz, ry = 0, o = {}) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const P = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const N = (x, y, z) => [x * c + z * s, y, -x * s + z * c];
    const S = o.shade || shadeY;
    const f = (a, b, cc, d, n) => { const pts = [a, b, cc, d].map((q) => P(...q)); this.quad(pts[0], pts[1], pts[2], pts[3], N(...n), pts.map((q) => S(q[1], o)), null, o.tint); };
    f([hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [1, 0, 0]);
    f([-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-1, 0, 0]);
    f([-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [0, 0, 1]);
    f([hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [0, 0, -1]);
    f([-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz], [0, 1, 0]);
    if (!o.noBottom) f([-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [0, -1, 0]);
  }
  // 任意幾何（已套好世界矩陣）：依法線方向重新算世界 UV
  geo(g, M, shade = 1, tint = null) {
    const G = g.index ? g.toNonIndexed() : g;
    const P = G.attributes.position, N = G.attributes.normal, T = this.tile, C = G.attributes.color, t = tint || ONE;   // C：幾何自帶的頂點色（煙燻、鏽）
    const nm = new THREE.Matrix3().getNormalMatrix(M);
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(M); n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      this.p.push(v.x, v.y, v.z); this.n.push(n.x, n.y, n.z);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      if (ax >= ay && ax >= az) this.u.push(v.z / T, v.y / T); else if (ay >= az) this.u.push(v.x / T, v.z / T); else this.u.push(v.x / T, v.y / T);
      const s = typeof shade === 'function' ? shade(v.y) : shade; if (C) this.c.push(s * t[0] * C.getX(i), s * t[1] * C.getY(i), s * t[2] * C.getZ(i)); else this.c.push(s * t[0], s * t[1], s * t[2]);
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
const ONE = [1, 1, 1];
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
    this.B = {}; this.T = {};
    for (const k of Object.keys(mats)) if (!mats[k].userData.alias) this.B[k] = new Bucket(mats[k].userData.tile || 3);
    // 別名：只差顏色的材質共用同一個桶（同一個 draw call），顏色改寫進頂點色（aliasTint）
    for (const k of Object.keys(mats)) { const u = mats[k].userData; if (u.alias) { this.B[k] = this.B[u.alias]; this.T[k] = u.aliasTint; } }
    this.breakables = [];
    this.extra = [];   // 其他網格（窗戶玻璃、燈）
  }
  // 實心方塊＋碰撞
  // 別名材質的顏色乘進 tint
  _t(mat, o) { const a = this.T[mat]; if (!a) return o; const t = o.tint || ONE; return { ...o, tint: [a[0] * t[0], a[1] * t[1], a[2] * t[2]] }; }
  block(mat, x0, x1, y0, y1, z0, z1, o = {}) {
    o = this._t(mat, o);
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    const bucket = this.B[mat], start = bucket.p.length;
    bucket.box(x0, x1, y0, y1, z0, z1, o);
    const bounds = { x0, x1, y0, y1, z0, z1, mat: o.hitMat || mat, noFloor: o.noFloor, noMove: o.noMove, ramp: o.ramp };
    const box = o.solid !== false ? this.solid.add(bounds) : null;
    if (o.breakable) {
      const count = bucket.p.length - start;
      this.breakables.push({ bounds, box, mat: this.mats[mat], tile: bucket.tile, kind: o.breakable, options: o,
        hide() { const a = bucket.mesh.geometry.attributes.position; a.array.fill(0, start, start + count); a.needsUpdate = true; } });
    }
  }
  // 只有外觀
  deco(mat, x0, x1, y0, y1, z0, z1, o = {}) { this.block(mat, x0, x1, y0, y1, z0, z1, { ...o, solid: false }); }
  obox(mat, cx, cy, cz, hx, hy, hz, ry = 0, o = {}) {
    this.B[mat].obox(cx, cy, cz, hx, hy, hz, ry, this._t(mat, o));
    if (o.solid !== false) {
      // 碰撞用外接 AABB
      const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry));
      const ex = hx * c + hz * s, ez = hx * s + hz * c;
      // 斜放的另外記下真正的斜方塊（obb）：玩家的子彈用它判斷，外接盒多出來的四角不會擋子彈
      this.solid.add({ x0: cx - ex, x1: cx + ex, y0: cy - hy, y1: cy + hy, z0: cz - ez, z1: cz + ez, mat: o.hitMat || mat, obb: Math.abs(Math.sin(2 * ry)) > 0.01 ? { cx, cz, hx, hz, ry } : undefined });
    }
  }
  // 任意幾何放到 (x,y,z)、繞 Y 轉 ry；solid＝要不要加外接碰撞盒
  mesh(mat, g, x, y, z, ry = 0, o = {}) {
    const M = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1).multiplyScalar(o.scale || 1));
    this.B[mat].geo(g, M, o.shade ?? ((yy) => (yy - y < 0.5 ? 0.7 + 0.6 * (yy - y) : 1)), this._t(mat, o).tint);
    if (o.solid) { g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(M); this.solid.add({ x0: bb.min.x, x1: bb.max.x, y0: bb.min.y, y1: o.top ?? bb.max.y, z0: bb.min.z, z1: bb.max.z, mat: o.hitMat || mat }); }
  }
  build(scene) {
    const out = [];
    for (const [k, b] of Object.entries(this.B)) {
      if (this.T[k]) continue;   // 別名：跟本尊同一個桶，不要畫兩次
      const g = b.geometry(); if (!g) continue;
      const m = new THREE.Mesh(g, this.mats[k]);
      m.castShadow = !this.mats[k].userData.noCast; m.receiveShadow = true;   // noCast：燈片、玻璃、地上的警示線投影子沒意義，省影子那一趟
      m.name = 'lvl-' + k; b.mesh = m;
      scene.add(m); out.push(m);
    }
    return out;
  }
}

// 崩落後的牆段沿用原材質與世界 UV，同材質一次合併。
export function surfaceGeometry(parts, tile) {
  const b = new Bucket(tile);
  for (const p of parts) b.box(p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, p.options || {});
  return b.geometry();
}
