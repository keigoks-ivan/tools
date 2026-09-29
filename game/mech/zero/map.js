// 地圖：城市中央廣場上的封閉街區（四周仍是鋼鐵黃昏的高樓天際線）
//   路線：A 公寓（起點）→ B 窄巷 → C 市場廣場 → 商店穿堂 → D 檢查哨街道 → E 貨櫃場 → F 基地走廊 → G 第七機庫（鋼彈）
//   座標：公尺；x 東、z 北；地面 y＝0
import * as THREE from 'three';
import { Builder } from './kit.js';
import * as PR from './props.js';
import { facade, FLOOR } from './models.js';

const H1 = 3.4;   // 一層樓高

export function buildMap(scene, mats, solid, PL = null) {
  // 額外的純色材質：玻璃、窗洞深處、燈、警示漆
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4, vertexColors: true });
  mats.void = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1, vertexColors: true });
  mats.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 2.0), vertexColors: true });
  mats.warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.2, 0.5), vertexColors: true });
  mats.hazard = hazardMat();
  mats.olive = new THREE.MeshStandardMaterial({ color: 0x4d5538, roughness: 0.7, metalness: 0.2, vertexColors: true });
  mats.canvas = new THREE.MeshStandardMaterial({ color: 0x6b5f48, roughness: 0.95, vertexColors: true, side: THREE.DoubleSide });
  mats.sand = new THREE.MeshStandardMaterial({ color: 0x7d6f55, roughness: 1, vertexColors: true, map: mats.floor.map, normalMap: mats.floor.normalMap });
  mats.paint = new THREE.MeshStandardMaterial({ color: 0x55655f, roughness: 0.55, metalness: 0.35, vertexColors: true, map: mats.rust.map, roughnessMap: mats.rust.roughnessMap });
  mats.paint2 = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.55, metalness: 0.3, vertexColors: true, map: mats.rust.map, roughnessMap: mats.rust.roughnessMap });
  mats.red = new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.45, metalness: 0.4, vertexColors: true });
  for (const k of ['glass', 'void', 'lamp', 'warm', 'olive', 'canvas', 'sand', 'paint', 'paint2', 'red']) mats[k].userData.tile = 2;
  // 貨櫃：真的波浪鐵皮貼圖，染三種常見顏色
  for (const [k, c] of [['cGreen', 0x8a9a74], ['cRed', 0xc27358], ['cBlue', 0x7d93a6]]) { const m = mats.corr.clone(); m.color.set(c); m.metalnessMap = null; m.metalness = 0.15; m.userData.tile = 2.2; m.onBeforeCompile = mats.corr.onBeforeCompile; mats[k] = m; }   // 烤漆：不是裸金屬
  mats.hazard.userData.tile = 1.6;
  // 外牆模組的貼圖做成一般材質（量體上方、牆角補縫用，顏色才接得起來）
  if (PL) {
    const km = (node) => { const p = PL.M.nodes[node]; return p && p[0].mat; };
    const mk = (src, tile) => { const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, aoMap: src.aoMap, roughness: 1, metalness: 0, vertexColors: true }); m.userData.tile = tile; return m; };
    const ap = km('facade_apartments:wall_standard_standard_01'), fb = km('facade_factory:wall_standard_standard_01');
    if (ap) mats.kplaster = mk(ap, 3); if (fb) mats.kbrick = mk(fb, 3);
  }
  const b = new Builder(mats, solid);
  const M = { b, lights: [], zones: {}, marks: {} };

  // ============================================================ 輔助
  // 建築量體（外圍、不進去）：四面牆＋窗；win＝哪幾面開窗 'nsew'
  const mass = (x0, x1, z0, z1, h, mat = 'wall', win = 'nsew', o = {}) => {
    if (o.kit && PL && win) return kitMass(x0, x1, z0, z1, h, win, o);
    const y0 = o.y0 || 0;
    b.block(mat, x0, x1, y0, h, z0, z1, { skip: 'ny', ground: y0 });
    const f0 = Math.max(o.shop ? 1 : 0, Math.ceil(y0 / H1));
    for (const s of win) windowsOn(s, x0, x1, z0, z1, h, f0, o);
    // 屋頂女兒牆
    if (!o.noParapet) {
      const t = 0.35;
      b.deco(mat, x0, x1, h, h + 0.9, z0, z0 + t); b.deco(mat, x0, x1, h, h + 0.9, z1 - t, z1);
      b.deco(mat, x0, x0 + t, h, h + 0.9, z0, z1); b.deco(mat, x1 - t, x1, h, h + 0.9, z0, z1);
    }
    // 每層樓的水平線腳
    for (let y = H1; y < h - 1; y += H1) {
      const tm = o.trim || 'concrete';
      if (win.includes('n')) b.deco(tm, x0, x1, y - 0.1, y + 0.06, z1, z1 + 0.08);
      if (win.includes('s')) b.deco(tm, x0, x1, y - 0.1, y + 0.06, z0 - 0.08, z0);
      if (win.includes('e')) b.deco(tm, x1, x1 + 0.08, y - 0.1, y + 0.06, z0, z1);
      if (win.includes('w')) b.deco(tm, x0 - 0.08, x0, y - 0.1, y + 0.06, z0, z1);
    }
  };
  // 用掃描外牆模組的建築：下面幾層是真的模組（窗戶凹進去、窗框、門、鐵捲門、線腳），更高的樓層用貼圖＋簡單窗
  function kitMass(x0, x1, z0, z1, h, win, o) {
    const kit = o.kit, km = kit === 'factory' ? 'kbrick' : 'kplaster';
    const kf = Math.max(1, Math.min(Math.floor(h / FLOOR), o.kitFloors ?? 3)), kTop = kf * FLOOR;
    const I = 0.34;
    const ix0 = x0 + (win.includes('w') ? I : 0), ix1 = x1 - (win.includes('e') ? I : 0), iz0 = z0 + (win.includes('s') ? I : 0), iz1 = z1 - (win.includes('n') ? I : 0);
    b.block(km, ix0, ix1, 0, Math.min(h, kTop), iz0, iz1, { skip: 'ny', solid: false });
    // 窗洞後面：暗的室內
    for (const sd of win) {
      if (sd === 'n') b.deco('void', ix0, ix1, 0, kTop, iz1, iz1 + 0.01); if (sd === 's') b.deco('void', ix0, ix1, 0, kTop, iz0 - 0.01, iz0);
      if (sd === 'e') b.deco('void', ix1, ix1 + 0.01, 0, kTop, iz0, iz1); if (sd === 'w') b.deco('void', ix0 - 0.01, ix0, 0, kTop, iz0, iz1);
    }
    if (h > kTop + 0.2) {
      b.block(km, x0, x1, kTop, h, z0, z1, { skip: 'ny', solid: false, ground: kTop });
      for (const sd of win) windowsOn(sd, x0, x1, z0, z1, h, Math.ceil((kTop + 0.3) / H1), { ...o, trim: km });
    }
    const t = 0.35;
    b.deco(km, x0, x1, h, h + 0.9, z0, z0 + t); b.deco(km, x0, x1, h, h + 0.9, z1 - t, z1); b.deco(km, x0, x0 + t, h, h + 0.9, z0, z1); b.deco(km, x1 - t, x1, h, h + 0.9, z0, z1);
    solid.add({ x0, x1, y0: 0, y1: h, z0, z1, mat: km });
    for (const sd of win) {
      const r = facade(PL, kit, sd, x0, x1, z0, z1, kf, rnd, { shutters: o.shop, noGround: o.noGround });
      // 兩端不滿 3 m 的地方：補實牆
      const along = sd === 'n' || sd === 's', m = r.margin;
      if (m > 0.01) for (const [a, bb] of [[along ? x0 : z0, (along ? x0 : z0) + m], [(along ? x1 : z1) - m, along ? x1 : z1]]) {
        if (sd === 'n') b.deco(km, a, bb, 0, kTop, iz1, z1); if (sd === 's') b.deco(km, a, bb, 0, kTop, z0, iz0);
        if (sd === 'e') b.deco(km, ix1, x1, 0, kTop, a, bb); if (sd === 'w') b.deco(km, x0, ix0, 0, kTop, a, bb);
      }
    }
    // 沒有模組的面，下半部也要補到原本的邊界
    for (const sd of 'nsew') if (!win.includes(sd)) continue;
  }
  // 立面上的窗：凹進去的深色洞＋玻璃（部分破掉）＋窗台＋偶爾亮燈
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function windowsOn(side, x0, x1, z0, z1, h, f0, o) {
    const along = side === 'n' || side === 's';
    const a0 = along ? x0 : z0, a1 = along ? x1 : z1;
    const fix = side === 'n' ? z1 : side === 's' ? z0 : side === 'e' ? x1 : x0;
    const out = side === 'n' || side === 'e' ? 1 : -1;
    const sp = o.spacing || 3.2, ww = o.ww || 1.4, wh = o.wh || 1.7;
    const n = Math.floor((a1 - a0 - 1) / sp);
    const start = a0 + (a1 - a0 - n * sp) / 2 + sp / 2;
    for (let f = f0; f * H1 + 2.6 < h; f++) {
      const y0 = f * H1 + 0.95, y1 = y0 + wh;
      for (let i = 0; i < n; i++) {
        const c = start + i * sp, lo = c - ww / 2, hi = c + ww / 2;
        const lit = rnd() < 0.05, broken = rnd() < 0.35;
        const face = (mat, d0, d1, yy0, yy1, l0 = lo, l1 = hi) => {
          const p0 = fix + out * d0, p1 = fix + out * d1;
          if (along) b.deco(mat, l0, l1, yy0, yy1, Math.min(p0, p1), Math.max(p0, p1));
          else b.deco(mat, Math.min(p0, p1), Math.max(p0, p1), yy0, yy1, l0, l1);
        };
        // 牆是實心的：玻璃貼在牆面外 1 cm，四周窗框凸出 10 cm，看起來像凹進去的窗
        face(lit ? 'warm' : broken ? 'void' : 'glass', 0.0, 0.015, y0, y1);
        const tm = o.trim || 'concrete';
        face(tm, 0, 0.14, y0 - 0.14, y0, lo - 0.14, hi + 0.14);   // 窗台
        face(tm, 0, 0.1, y1, y1 + 0.12, lo - 0.1, hi + 0.1);      // 窗楣
        // 三樓以上看不清楚：只留窗台、窗楣
        if (f < 3) {
          face(tm, 0, 0.1, y0, y1, lo - 0.1, lo);
          face(tm, 0, 0.1, y0, y1, hi, hi + 0.1);
          if (!broken && !lit) { face('rust', 0, 0.05, y0, y1, c - 0.03, c + 0.03); face('rust', 0, 0.05, y0 + wh * 0.62, y0 + wh * 0.62 + 0.05); }
        }
      }
    }
  }
  // 牆段（沿 x 或 z），openings＝[{a0,a1,y0,y1}]，會自動切開
  const wall = (mat, axis, fixed, t, a0, a1, y0, y1, openings = [], o = {}) => {
    const segs = [[a0, a1]];
    const ops = openings.slice().sort((p, q) => p.a0 - q.a0);
    const put = (s0, s1, yy0, yy1) => {
      if (s1 - s0 < 0.01 || yy1 - yy0 < 0.01) return;
      if (axis === 'x') b.block(mat, s0, s1, yy0, yy1, fixed - t / 2, fixed + t / 2, o);
      else b.block(mat, fixed - t / 2, fixed + t / 2, yy0, yy1, s0, s1, o);
    };
    let cur = a0;
    for (const op of ops) {
      put(cur, op.a0, y0, y1);
      put(op.a0, op.a1, y0, op.y0 ?? y0);       // 窗台以下
      put(op.a0, op.a1, op.y1 ?? y1, y1);       // 門楣以上
      cur = op.a1;
    }
    put(cur, a1, y0, y1);
    void segs;
  };
  // 室內空間：地板、天花板、四面牆（有門窗）、上方樓層量體
  const room = (x0, x1, z0, z1, o = {}) => {
    const h = o.h || H1, t = 0.3, wm = o.wall || 'plaster', ext = o.ext || wm;
    b.deco(o.floor || 'tile', x0, x1, 0, 0.03, z0, z1, { skip: 'ny', dim: 0.8 });
    if (!o.open) b.block(o.ceil || 'plaster', x0 - t, x1 + t, h, h + 0.3, z0 - t, z1 + t, { dim: 0.75 });
    const D = o.doors || {}, Wn = o.windows || {};
    const ops = (side) => [...(D[side] || []).map(([c, w = 1.4]) => ({ a0: c - w / 2, a1: c + w / 2, y0: 0, y1: 2.3 })),
      ...(Wn[side] || []).map(([c, w = 1.4]) => ({ a0: c - w / 2, a1: c + w / 2, y0: 0.95, y1: 2.3 }))];
    const sk = (s) => o.noWall && o.noWall.includes(s);
    // 外層＝外牆材質（有碰撞），內層＝室內粉刷（薄、只有外觀）
    const L = 0.02;
    if (!sk('s')) { wall(ext, 'x', z0 - t / 2, t, x0 - t, x1 + t, 0, h, ops('s'), { dim: 0.9 }); wall(wm, 'x', z0 + L / 2, L, x0, x1, 0, h, ops('s'), { dim: 0.85, solid: false }); }
    if (!sk('n')) { wall(ext, 'x', z1 + t / 2, t, x0 - t, x1 + t, 0, h, ops('n'), { dim: 0.9 }); wall(wm, 'x', z1 - L / 2, L, x0, x1, 0, h, ops('n'), { dim: 0.85, solid: false }); }
    if (!sk('w')) { wall(ext, 'z', x0 - t / 2, t, z0, z1, 0, h, ops('w'), { dim: 0.9 }); wall(wm, 'z', x0 + L / 2, L, z0, z1, 0, h, ops('w'), { dim: 0.85, solid: false }); }
    if (!sk('e')) { wall(ext, 'z', x1 + t / 2, t, z0, z1, 0, h, ops('e'), { dim: 0.85 }); wall(wm, 'z', x1 - L / 2, L, z0, z1, 0, h, ops('e'), { dim: 0.85, solid: false }); }
    if (o.upper) mass(x0 - t, x1 + t, z0 - t, z1 + t, o.upper, ext, o.upperWin || '', { y0: h + 0.3, trim: o.trim });
    // 日光燈
    if (o.lights !== false) for (let x = x0 + 3; x < x1 - 1; x += 6) for (let z = z0 + 3; z < z1 - 1; z += 6) if (rnd() < (o.lightP ?? 0.5)) b.deco('lamp', x - 0.6, x + 0.6, h - 0.05, h, z - 0.08, z + 0.08, { solid: false });
  };
  // 門框（深色洞口周圍）
  const doorFrame = (axis, fixed, c, w = 1.4, h = 2.3) => {
    if (axis === 'x') { b.deco('rust', c - w / 2 - 0.1, c - w / 2, 0, h + 0.1, fixed - 0.2, fixed + 0.2); b.deco('rust', c + w / 2, c + w / 2 + 0.1, 0, h + 0.1, fixed - 0.2, fixed + 0.2); b.deco('rust', c - w / 2 - 0.1, c + w / 2 + 0.1, h, h + 0.1, fixed - 0.2, fixed + 0.2); }
    else { b.deco('rust', fixed - 0.2, fixed + 0.2, 0, h + 0.1, c - w / 2 - 0.1, c - w / 2); b.deco('rust', fixed - 0.2, fixed + 0.2, 0, h + 0.1, c + w / 2, c + w / 2 + 0.1); b.deco('rust', fixed - 0.2, fixed + 0.2, h, h + 0.1, c - w / 2 - 0.1, c + w / 2 + 0.1); }
  };
  const ground = (mat, x0, x1, z0, z1) => b.deco(mat, x0, x1, 0, 0.02, z0, z1, { skip: 'ny nx px nz pz' });

  // ============================================================ 道具
  const P = {
    // 貨櫃 6.1 × 2.6 × 2.44，側面波浪板
    container(x, z, ry = 0, y = 0, mat = 'rust') {
      mat = mat === 'olive' ? 'cGreen' : rnd() < 0.5 ? 'cRed' : 'cBlue';
      b.obox(mat, x, y + 1.3, z, 3.05, 1.3, 1.22, ry, { hitMat: 'metal' });
      const c = Math.cos(ry), s = Math.sin(ry);
      // 上下框、四角柱
      for (const yy of [0.06, 2.54]) b.obox('rust', x, y + yy, z, 3.08, 0.07, 1.24, ry, { solid: false });
      for (const dx of [-3.02, 3.02]) for (const dz of [-1.19, 1.19]) b.obox('rust', x + dx * c + dz * s, y + 1.3, z - dx * s + dz * c, 0.07, 1.3, 0.07, ry, { solid: false });
      b.obox('metal', x + 3.07 * c, y + 1.3, z - 3.07 * s, 0.03, 1.28, 1.2, ry, { solid: false });
      b.obox('metal', x - 3.07 * c, y + 1.3, z + 3.07 * s, 0.03, 1.28, 1.2, ry, { solid: false });
    },
    // 紐澤西護欄（混凝土）
    jersey(x, z, ry = 0) {
      if (PL && PL.M.has('concrete_road_barrier_02')) {
        const c = Math.cos(ry), s = Math.sin(ry);
        for (const d of [-0.79, 0.79]) PL.add('concrete_road_barrier_02', x + d * c, 0, z - d * s, ry + (rnd() - 0.5) * 0.06, { solid: true, hit: 'concrete' });
        return;
      }
      b.obox('concrete', x, 0.3, z, 1.5, 0.3, 0.32, ry, { hitMat: 'concrete' });
      b.obox('concrete', x, 0.72, z, 1.5, 0.12, 0.14, ry, { solid: false });
      b.solid.add(aabb(x, 0.45, z, 1.5, 0.45, 0.3, ry, 'concrete'));
    },
    // 沙包牆
    sandbags(x, z, len, ry = 0, rows = 3) {
      const c = Math.cos(ry), s = Math.sin(ry);
      if (PL && PL.M.has('cement_bag')) {
        // 真的布袋一層一層交錯疊（每層高 0.17 m）
        const R = rows + 2, bags = [];
        for (let r = 0; r < R; r++) {
          const n = Math.floor(len / 0.68);
          for (let i = 0; i < n; i++) {
            const a = -len / 2 + 0.34 + i * 0.68 + (r % 2) * 0.34;
            if (a > len / 2 - 0.25) continue;
            for (const dd of r < 2 ? [-0.24, 0.24] : [0]) bags.push(PL.add('cement_bag', x + a * c + dd * s, r * 0.16, z - a * s + dd * c, ry + Math.PI / 2 + (rnd() - 0.5) * 0.25, { cast: r % 2 === 0, roll: (rnd() - 0.5) * 0.12, scale: [1, 1.05, 1], bag: true }));
          }
        }
        PL.bagWalls.push({ box: b.solid.add(aabb(x, R * 0.08, z, len / 2, R * 0.08, 0.45, ry, 'sand')), bags });
        return;
      }
      for (let r = 0; r < rows; r++) {
        const n = Math.floor(len / 0.62);
        for (let i = 0; i < n; i++) {
          const a = -len / 2 + 0.31 + i * 0.62 + (r % 2) * 0.31;
          if (a > len / 2 - 0.2) continue;
          b.obox('sand', x + a * c, 0.13 + r * 0.24, z - a * s, 0.3, 0.12, 0.22, ry + (rnd() - 0.5) * 0.12, { solid: false });
        }
      }
      b.solid.add(aabb(x, 0.4, z, len / 2, 0.4 + (rows - 3) * 0.12, 0.3, ry, 'sand'));
    },
    crate(x, z, s = 1.1, ry = 0, y = 0) {
      if (PL) {
        // 大的＝軍用木箱疊兩個；中的＝一個木箱；小的＝紙箱／塑膠箱
        if (s >= 1) { PL.add('wooden_military_crate', x, y, z, ry, { solid: true, hit: 'wood', scale: 1.2 }); PL.add('wooden_military_crate', x + (rnd() - 0.5) * 0.1, y + 0.55, z, ry + (rnd() - 0.5) * 0.3, { solid: true, hit: 'wood', scale: 1.2 }); if (rnd() < 0.5) PL.add('cardboard_box_01', x, y + 1.1, z, rnd() * 3, { scale: 1.3 }); return; }
        if (s >= 0.7) { PL.add('wooden_military_crate', x, y, z, ry, { solid: true, hit: 'wood' }); return; }
        PL.add(rnd() < 0.5 ? 'cardboard_box_01' : 'plastic_crate_02', x, y, z, ry, { scale: 1 + rnd() * 0.4 }); return;
      }
      b.obox('olive', x, y + s / 2, z, s / 2, s / 2, s / 2, ry);
      b.obox('metal', x, y + s / 2, z, s / 2 + 0.02, 0.05, s / 2 + 0.02, ry, { solid: false });
    },
    // 燒毀的車（三成還看得出原本的漆色）
    car(x, z, ry = 0) {
      if (PL && PL.M.has('covered_car') && rnd() < 0.55) { PL.add('covered_car', x, 0, z, ry, { solid: true, hit: 'metal', top: 1.3, inset: 0.1 }); return; }
      const g = PR.car(), r = rnd(), paint = r < 0.2 ? 'paint' : r < 0.35 ? 'paint2' : 'rust';
      b.mesh(paint, g.body, x, 0, z, ry, { solid: true, top: 1.2, hitMat: 'metal' });
      b.mesh('void', g.dark, x, 0, z, ry);
      b.mesh('metal', g.metal, x, 0, z, ry);
    },
    barrel(x, z, mat = 'olive') { if (PL) { PL.add(mat === 'rust' ? 'barrel_03' : 'Barrel_01', x, 0, z, rnd() * 6, { solid: true, hit: 'metal' }); return; } const g = PR.barrel(); b.mesh(mat, g.body, x, 0, z, rnd() * 3, { solid: true, hitMat: 'metal' }); b.mesh('metal', g.metal, x, 0, z, 0); },
    rack(x, z, ry = 0) { const g = PR.missileRack(); b.mesh('metal', g.metal, x, 0, z, ry); b.mesh('paint', g.body, x, 0, z, ry, { solid: true, hitMat: 'metal' }); b.mesh('void', g.dark, x, 0, z, ry); },
    cart(x, z, ry = 0) { const g = PR.toolCart(); b.mesh('red', g.red, x, 0, z, ry, { solid: true, hitMat: 'metal' }); b.mesh('metal', g.metal, x, 0, z, ry); b.mesh('void', g.dark, x, 0, z, ry); },
    puddle(x, z, w, d, ry = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), PR.puddleMat()); m.position.set(x, 0.035, z); m.rotation.y = ry; m.receiveShadow = true; m.userData.noAO = true; scene.add(m); },
    dumpster(x, z, ry = 0) {
      if (PL) {
        PL.add('metal_trash_can', x, 0, z, ry, { solid: true, hit: 'metal' });
        const c = Math.cos(ry), s = Math.sin(ry);
        for (let i = 0; i < 3; i++) { const a = (rnd() - 0.5) * 2.2, d = 0.6 + rnd() * 0.4; PL.add('trashbag', x + a * c + d * s, 0, z - a * s + d * c, rnd() * 6, { scale: 0.9 + rnd() * 0.4 }); }
        if (rnd() < 0.6) PL.add('cardboard_box_01', x + 1.3 * c, 0, z - 1.3 * s, rnd() * 6, { scale: 1.5 });
        return;
      }
      b.obox('olive', x, 0.65, z, 0.9, 0.65, 0.6, ry, { hitMat: 'metal' });
      b.obox('metal', x, 1.32, z, 0.95, 0.04, 0.65, ry, { solid: false });
    },
    // 碎石堆（斜坡感）
    rubble(x, z, r = 2, n = 10) {
      // 斷掉的水泥塊（不規則多面體）＋露出的鋼筋＋小碎石
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r, s = 0.2 + rnd() * 0.55 * (1 - d / r * 0.7);
        const g = PR.chunk(i + Math.floor(rnd() * 6)).clone().scale(s, s, s).rotateX((rnd() - 0.5) * 0.6).rotateZ((rnd() - 0.5) * 0.6);
        b.mesh(rnd() < 0.6 ? 'wall' : rnd() < 0.5 ? 'floor' : 'brick', g, x + Math.cos(a) * d, -0.05, z + Math.sin(a) * d, rnd() * 6.28, { shade: 0.85 });
        if (rnd() < 0.25) b.mesh('rust', PR.rebar(0.6 + rnd()).rotateZ((rnd() - 0.5) * 1.6).rotateX((rnd() - 0.5) * 1.2), x + Math.cos(a) * d, s * 0.3, z + Math.sin(a) * d, rnd() * 6, { shade: 0.8 });
      }
      if (PL) for (let i = 0; i < n * 0.8; i++) { const a = rnd() * 6.28, d = rnd() * r * 1.3; PL.add('cement_bag', x + Math.cos(a) * d, 0, z + Math.sin(a) * d, rnd() * 6, { scale: 0.7 + rnd() * 0.4, cast: false, roll: (rnd() - 0.5) * 0.5, noBreak: true }); }
      b.solid.add({ x0: x - r * 0.6, x1: x + r * 0.6, y0: 0, y1: 0.5, z0: z - r * 0.6, z1: z + r * 0.6, mat: 'concrete' });
    },
    // 市場攤位：桌子＋帆布頂
    stall(x, z, ry = 0) {
      b.obox('rust', x, 0.85, z, 1.2, 0.05, 0.6, ry);
      b.solid.add(aabb(x, 0.45, z, 1.2, 0.45, 0.6, ry, 'metal'));
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const [px, pz] of [[1.15, 0.55], [-1.15, 0.55], [1.15, -0.55], [-1.15, -0.55]]) b.obox('metal', x + px * c + pz * s, 1.2, z - px * s + pz * c, 0.03, 1.2, 0.03, ry, { solid: false });
      b.obox('canvas', x, 2.4, z, 1.35, 0.02, 0.8, ry, { solid: false });
      for (let i = 0; i < 4; i++) P.crate(x + (rnd() - 0.5) * 1.6 * c, z + (rnd() - 0.5) * 1.6 * s, 0.35 + rnd() * 0.2, rnd() * 2, 0.9);
    },
    // 管線沿牆
    pipe(axis, fixed, a0, a1, y, r = 0.12, mat = 'rust') {
      const g = PR.pipeGeo(a1 - a0, r);
      if (axis === 'x') { g.rotateZ(Math.PI / 2); b.mesh(mat, g, (a0 + a1) / 2, y, fixed, 0, { shade: 1 }); }
      else { g.rotateX(Math.PI / 2); b.mesh(mat, g, fixed, y, (a0 + a1) / 2, 0, { shade: 1 }); }
      // 管夾
      for (let a = a0 + 1; a < a1; a += 2.5) { if (axis === 'x') b.deco('metal', a - 0.04, a + 0.04, y - r - 0.02, y + r + 0.02, fixed - r - 0.02, fixed + r + 0.02); else b.deco('metal', fixed - r - 0.02, fixed + r + 0.02, y - r - 0.02, y + r + 0.02, a - 0.04, a + 0.04); }
    },
    // 冷氣室外機
    ac(x, y, z, ry = 0) { if (PL) { PL.add('exterior_aircon_unit', x, y - 0.45, z, ry, { scale: 0.6 }); return; } b.obox('metal', x, y, z, 0.45, 0.35, 0.3, ry, { solid: false }); b.obox('void', x, y, z, 0.3, 0.25, 0.31, ry, { solid: false }); },
    // 樓梯（視覺階梯＋斜坡碰撞）；axis＝往哪個方向爬，dir＝±1
    stairs(x0, x1, z0, z1, y0, y1, axis, dir, mat = 'metal') {
      const n = Math.max(3, Math.round((y1 - y0) / 0.19));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n, yy = y0 + (y1 - y0) * t1;
        if (axis === 'z') { const za = dir > 0 ? z0 + (z1 - z0) * t0 : z1 - (z1 - z0) * t1, zb = dir > 0 ? z0 + (z1 - z0) * t1 : z1 - (z1 - z0) * t0; b.deco(mat, x0, x1, yy - 0.06, yy, za, zb); }
        else { const xa = dir > 0 ? x0 + (x1 - x0) * t0 : x1 - (x1 - x0) * t1, xb = dir > 0 ? x0 + (x1 - x0) * t1 : x1 - (x1 - x0) * t0; b.deco(mat, xa, xb, yy - 0.06, yy, z0, z1); }
      }
      // 側邊樑
      if (axis === 'z') { rampBeam(x0, z0, z1, y0, y1, dir); rampBeam(x1, z0, z1, y0, y1, dir); }
      solid.add({ x0, x1, z0, z1, y0, y1, ramp: { axis, dir }, mat: 'metal' });
    },
    // 欄杆（視覺＋擋人）
    rail(axis, fixed, a0, a1, y) {
      if (axis === 'x') { b.deco('metal', a0, a1, y + 1.0, y + 1.06, fixed - 0.03, fixed + 0.03); b.deco('metal', a0, a1, y + 0.5, y + 0.54, fixed - 0.02, fixed + 0.02); for (let a = a0; a <= a1; a += 1.5) b.deco('metal', a - 0.03, a + 0.03, y, y + 1.06, fixed - 0.03, fixed + 0.03); solid.add({ x0: a0, x1: a1, z0: fixed - 0.05, z1: fixed + 0.05, y0: y, y1: y + 1.06, mat: 'metal', noRay: true }); }
      else { b.deco('metal', fixed - 0.03, fixed + 0.03, y + 1.0, y + 1.06, a0, a1); b.deco('metal', fixed - 0.02, fixed + 0.02, y + 0.5, y + 0.54, a0, a1); for (let a = a0; a <= a1; a += 1.5) b.deco('metal', fixed - 0.03, fixed + 0.03, y, y + 1.06, a - 0.03, a + 0.03); solid.add({ x0: fixed - 0.05, x1: fixed + 0.05, z0: a0, z1: a1, y0: y, y1: y + 1.06, mat: 'metal', noRay: true }); }
    },
    // 平台（走道／格柵）
    deck(x0, x1, z0, z1, y, mat = 'metal') { b.block(mat, x0, x1, y - 0.15, y, z0, z1); },
    // 柱子
    column(x, z, h, s = 0.4, mat = 'concrete') { b.block(mat, x - s, x + s, 0, h, z - s, z + s); },
    // 圍牆＋鐵絲網
    fence(axis, fixed, a0, a1, h = 3.2) {
      if (axis === 'x') b.block('concrete', a0, a1, 0, h, fixed - 0.2, fixed + 0.2); else b.block('concrete', fixed - 0.2, fixed + 0.2, 0, h, a0, a1);
      for (let a = a0; a < a1; a += 3) { if (axis === 'x') b.deco('metal', a - 0.03, a + 0.03, h, h + 0.9, fixed - 0.03, fixed + 0.03); else b.deco('metal', fixed - 0.03, fixed + 0.03, h, h + 0.9, a - 0.03, a + 0.03); }
      for (const dy of [0.3, 0.6, 0.85]) { if (axis === 'x') b.deco('metal', a0, a1, h + dy, h + dy + 0.02, fixed - 0.01, fixed + 0.01); else b.deco('metal', fixed - 0.01, fixed + 0.01, h + dy, h + dy + 0.02, a0, a1); }
    },
    stripe(x0, x1, z0, z1) { b.deco('hazard', x0, x1, 0.02, 0.035, z0, z1, { solid: false, skip: 'ny' }); },
  };
  function rampBeam(x, z0, z1, y0, y1, dir) {
    const L = z1 - z0, dy = y1 - y0, len = Math.hypot(L, dy), ang = Math.atan2(dy, L) * (dir > 0 ? 1 : -1);
    const g = new THREE.BoxGeometry(0.08, 0.25, len);
    const m = new THREE.Mesh(g, mats.metal);
    m.position.set(x, (y0 + y1) / 2 - 0.1, (z0 + z1) / 2); m.rotation.x = -ang;
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  function aabb(x, y, z, hx, hy, hz, ry, mat) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), ex = hx * c + hz * s, ez = hx * s + hz * c;
    return { x0: x - ex, x1: x + ex, y0: y - hy, y1: y + hy, z0: z - ez, z1: z + ez, mat, noRay: false };
  }
  M.P = P;

  // ============================================================ 外圍：整個街區四周用高樓圍起來
  mass(-122, 122, -128, -114, 34, 'wall', 'n');
  mass(-122, 122, 114, 128, 30, 'wall', 's');
  mass(-128, -114, -114, 114, 32, 'brick', 'e');
  mass(114, 128, -114, 114, 28, 'wall', 'w');

  // ============================================================ A 公寓（起點）
  // 兩個房間，北牆出門進窄巷；房間 2 天花板塌了一角，光從上面進來
  ground('floor', -114, 114, -114, 114);
  room(-112, -99, -112, -93, { h: 3.2, doors: { e: [[-100.5, 1.2]] }, windows: { s: [[-108], [-103]], w: [[-102.5]] }, upper: 13, upperWin: 'sw', floor: 'tile', lightP: 0.3 });
  room(-99, -82, -112, -93, { h: 3.2, doors: { n: [[-91.5, 1.4]], w: [[-100.5, 1.2], [-107, 3.2]] }, windows: { s: [[-95], [-87]], e: [[-104]] }, upper: 13, upperWin: 'se', open: true, lightP: 0 });
  // 兩房之間的牆被炸開一個大洞：洞口邊緣的碎塊、掉下來的磚
  P.rubble(-99, -107, 1.8, 18);
  for (const [y, z] of [[2.5, -108.7], [2.9, -106.8], [2.4, -105.3], [0.6, -108.8], [0.8, -105.2]]) b.mesh('brick', PR.chunk(Math.floor(y * 10)).clone().scale(0.35, 0.35, 0.35), -99, y, z, y * 3, { shade: 0.8 });
  // 房間 2 的天花板（留一個塌陷的洞）
  b.block('concrete', -99.3, -82, 3.2, 3.5, -112.3, -104, { dim: 0.7 });
  b.block('concrete', -99.3, -93, 3.2, 3.5, -104, -92.7, { dim: 0.7 });
  b.block('concrete', -88, -82, 3.2, 3.5, -98, -92.7, { dim: 0.7 });
  b.block('concrete', -93, -88, 3.2, 3.5, -104, -101, { dim: 0.7 });
  P.rubble(-90.5, -99.5, 2.6, 26);
  b.obox('concrete', -91, 1.3, -97.5, 2.6, 0.16, 1.4, 0.2, { solid: false });  // 塌下來斜靠的樓板
  doorFrame('x', -92.85, -91.5);
  // 家具：翻倒的桌子、倒下的鐵架、散落的東西（在 dress() 裡用掃描模型擺）
  if (!PL) { b.obox('olive', -106, 0.4, -108, 0.8, 0.4, 0.45, 0.3); b.obox('rust', -110.5, 1, -100, 0.3, 1, 1.2, 0); }
  P.crate(-85, -109.5, 1.0, 0.4); P.crate(-84.5, -108.3, 0.7, 0.9, 1.0);
  // 塌陷的洞灑下來的光（加法光錐）＋一盞暖色點光當反光
  M.marks.start = new THREE.Vector3(-91.6, 0, -91.6);   // 剛從公寓後門出來，站在巷口
  M.marks.startYaw = Math.PI / 2 * 0 + 0.9;

  // ============================================================ B 窄巷（x -95～-88，z -92～-58）
  mass(-114, -95, -92, -40, 14, 'brick', 'e', { trim: 'wall', kit: 'apt' });
  mass(-88, -66, -92, -62, 11, 'wall', 'wn', { kit: 'apt' });
  mass(-82, -60, -112, -92, 9, 'concrete', 'n');
  ground('floor', -95, -88, -92, -58);
  // 巷子兩側：管線、冷氣、垃圾子母車、木箱、電線
  P.pipe('z', -94.8, -92, -58, 3.2, 0.1); P.pipe('z', -94.8, -92, -58, 3.5, 0.06, 'metal');
  P.pipe('z', -88.2, -86, -62, 2.6, 0.12);
  for (let z = -88; z < -60; z += 5.5) P.ac(-94.55, 4.2 + (z % 2), z, Math.PI / 2);
  P.dumpster(-93.8, -80, Math.PI / 2); P.dumpster(-89.2, -71, Math.PI / 2 + 0.2);
  P.crate(-93.8, -74, 1.1, 0.3); P.crate(-93.5, -72.6, 0.9, 0.9); P.crate(-93.6, -73.4, 0.8, 0.2, 1.1);
  P.rubble(-90, -85, 1.6, 12);
  P.car(-91.2, -65, 0.12);
  // 巷口鐵門半開
  b.block('corr', -95, -93.6, 0, 3, -60.3, -60.1); b.block('corr', -89.2, -88, 0, 3, -60.3, -60.1);
  P.puddle(-91, -77, 2.5, 1.4, 0.2); P.puddle(-92.5, -68, 1.8, 1.2, 1);
  M.zones.B = { x0: -95, x1: -82, z0: -92, z1: -58 };

  // ============================================================ C 市場廣場（x -95～-60，z -58～-30）
  mass(-114, -95, -40, -8, 17, 'wall', 'e', { kit: 'apt' });
  mass(-95, -64, -30, -10, 12, 'brick', 's', { shop: true, kit: 'apt' });
  mass(-66, -60, -62, -52, 10, 'concrete', 'nw', { kit: 'factory' });
  ground('floor', -95, -60, -58, -30);
  // 店面鐵捲門（北側）
  for (const x of [-90, -83, -76, -69]) { b.deco('corr', x - 2.2, x + 2.2, 0, 2.8, -30.12, -30.02); b.deco('rust', x - 2.4, x + 2.4, 2.8, 3.3, -30.3, -30); }
  P.stall(-86, -48, 0.1); P.stall(-80, -50, -0.2); P.stall(-74, -46, 0.05); P.stall(-88, -39, 0.3); P.stall(-70, -38, -0.1);
  P.car(-79, -40, 1.2);
  P.sandbags(-66, -44, 4.5, Math.PI / 2); P.sandbags(-68, -48.2, 3, 0.3); P.sandbags(-68, -39.8, 3, -0.3);
  P.jersey(-90, -54, 0.4); P.jersey(-84, -34, 0); P.crate(-62.5, -33, 1.1); P.crate(-62, -31.8, 0.8, 0.5, 1.1);
  P.rubble(-92, -33, 2, 14);
  // 廣場中央枯死的噴水池
  b.block('concrete', -80, -76, 0, 0.6, -46, -42); b.deco('void', -79.6, -76.4, 0.3, 0.61, -45.6, -42.4);
  P.puddle(-82, -52, 3, 2, 0.5); P.puddle(-70, -34, 2.2, 1.5, 0); P.barrel(-93, -46); P.barrel(-92.4, -46.6, 'rust'); P.barrel(-61.5, -54);
  M.zones.C = { x0: -95, x1: -60, z0: -58, z1: -30 };

  // ============================================================ 商店穿堂（x -60～-44，z -50～-34）→ 第 2 章起點
  room(-60, -44, -50, -34, { h: 3.4, floor: 'tile', ext: PL ? 'kplaster' : 'plaster', doors: { w: [[-42, 1.8]], e: [[-42, 1.8]] }, windows: { n: [[-56], [-48]], w: [[-47.5, 2], [-37, 2]] }, upper: 15, upperWin: 'nw', lightP: 0.8, trim: PL ? 'kplaster' : null });
  doorFrame('z', -60.15, -42, 1.8); doorFrame('z', -43.85, -42, 1.8);
  // 貨架
  for (const z of [-47.5, -44.5, -39, -36.5]) { b.block('metal', -57, -50, 0, 1.8, z - 0.3, z + 0.3); for (const y of [0.6, 1.2]) b.deco('olive', -56.8, -50.2, y, y + 0.3, z - 0.28, z + 0.28, { solid: false }); }
  b.block('olive', -49, -46, 0, 1.05, -38.5, -37.5);   // 櫃台
  mass(-60, -36, -92, -50, 13, 'wall', 'nw', { kit: 'apt' });
  mass(-60, -36, -34, -8, 15, 'brick', 's');
  M.marks.ch2 = new THREE.Vector3(-52, 0, -42); M.marks.ch2Yaw = Math.PI / 2 * -1 * -1;

  // ============================================================ D 檢查哨街道（x -44～36，z -48～-34）
  mass(-36, 6, -34, -8, 20, 'wall', 's', { shop: true, kit: 'apt' });
  mass(-44, 48, -70, -48, 16, 'concrete', 'n', { shop: true, kit: 'factory' });
  ground('floor', -44, 48, -48, -34);
  // 人行道邊石
  b.deco('concrete', -44, 14, 0, 0.15, -48, -46.8); b.deco('concrete', -44, 6, 0, 0.15, -35.2, -34);
  // 路上：燒毀車輛、護欄
  P.car(-32, -44, 1.5); P.car(-20, -38, 1.9); P.jersey(-26, -41, 0.2); P.jersey(-14, -45, -0.3); P.rubble(-8, -37, 2, 12);
  // 檢查哨：兩排護欄＋沙包＋崗亭＋閘門
  P.jersey(-2, -45.5, Math.PI / 2); P.jersey(-2, -42, Math.PI / 2); P.jersey(2, -39, Math.PI / 2); P.jersey(2, -35.8, Math.PI / 2);
  P.sandbags(6, -44, 5, Math.PI / 2); P.sandbags(9, -37, 4, 0);
  room(10, 14, -47, -43, { h: 2.8, wall: 'metal', ext: 'metal', floor: 'metal', doors: { n: [[12, 1.1]] }, windows: { w: [[-45, 2.4]], s: [[12, 2.4]] }, lightP: 1 });
  b.deco('hazard', 0, 10, 1.05, 1.2, -43.1, -42.9);   // 閘門桿
  P.container(20, -44.5, 0); P.container(20, -44.5, 0, 2.6, 'olive'); P.container(26, -38, Math.PI / 2 + 0.05);
  // 高台（狙擊兵）：街尾貨櫃上
  P.container(33, -44, Math.PI / 2); P.stairs(29.2, 30.4, -38, -34.4, 0, 2.6, 'z', -1); P.deck(30.4, 35.6, -47, -38.5, 2.62, 'metal');
  P.rail('z', 35.6, -47, -38.5, 2.62);
  P.puddle(-24, -42, 3.5, 2.2, 0.3); P.puddle(-6, -46, 2.4, 1.6, 1.2); P.puddle(16, -40, 3, 2, 0.6);
  P.barrel(-10, -35.6); P.barrel(-9.4, -36.2, 'rust'); P.barrel(24, -47);
  M.zones.D = { x0: -44, x1: 36, z0: -48, z1: -34 };

  // ============================================================ E 貨櫃場（x 14～46，z -34～20）→ 第 3 章前
  mass(6, 14, -34, 22, 12, 'corr', 'e', { kit: 'factory' });
  // 圍牆外的空地（獵犬機會從這裡走過去）：低矮的破倉庫、廢車
  ground('floor', 48, 114, -114, 80);
  mass(58, 70, 0, 14, 5, 'corr', 'w', { noParapet: true }); mass(88, 104, -30, -14, 6, 'corr', 'nw', { noParapet: true });
  mass(60, 72, -80, -64, 7, 'concrete', 'nw');
  P.container(56, -20, 0.3); P.container(66, 30, 1.2, 0, 'olive'); P.car(54, 8, 0.8); P.rubble(95, 10, 3, 18); P.rubble(70, -40, 3, 16);
  M.marks.mechPath = [new THREE.Vector3(84, 0, -105), new THREE.Vector3(80, 0, -20), new THREE.Vector3(84, 0, 60)];
  mass(36, 48, -48, -34, 9, 'concrete', 'nw', { kit: 'factory' });
  if (PL && PL.M.has('modular_chainlink_fence')) {
    // 鐵絲網：看得到圍牆外（獵犬機會從外面走過）；擋人不擋子彈
    const L = PL.size('modular_chainlink_fence').x;
    for (let z = -34 + L / 2; z < 20; z += L) PL.add('modular_chainlink_fence', 47, 0, z, Math.PI / 2, { scale: [1, 1.3, 1] });
    solid.add({ x0: 46.8, x1: 47.2, y0: 0, y1: 3.3, z0: -34, z1: 20, mat: 'metal', noRay: true });
  } else P.fence('z', 47, -34, 20, 3.2);
  ground('floor', 14, 47, -34, 22);
  // 貨櫃迷宮（堆 1～2 層）
  const C = [[20, -28, 0], [26, -28, 0, 1], [36, -25, Math.PI / 2], [42, -30, 0], [18, -18, Math.PI / 2], [24, -16, 0], [30, -16, 0, 1], [41, -16, Math.PI / 2],
    [20, -5, 0, 1], [32, -4, Math.PI / 2], [38, -6, 0], [44, 4, Math.PI / 2], [22, 6, Math.PI / 2], [28, 10, 0, 1], [38, 12, 0]];
  C.forEach(([x, z, ry, two], i) => { P.container(x, z, ry, 0, i % 3 ? 'rust' : 'olive'); if (two) P.container(x, z, ry + 0.02, 2.6, i % 2 ? 'olive' : 'rust'); });
  P.crate(31, -9, 1.2); P.crate(32.2, -9.3, 1.0); P.crate(16.5, 0, 1.2); P.sandbags(30, 16, 4, 0); P.jersey(40, 17, 0);
  for (const [x, z] of [[33, 8], [33.6, 8.5], [45, -20], [45.5, -19.3], [16, -30]]) P.barrel(x, z, rnd() < 0.5 ? 'olive' : 'rust');
  P.puddle(26, -22, 3, 2, 0.2); P.puddle(35, 2, 2.5, 1.8, 1);
  M.zones.E = { x0: 14, x1: 47, z0: -34, z1: 22 };

  // ============================================================ F 基地走廊（x 14～50，z 22～52）
  // 圍牆＋大門（z 22）
  P.fence('x', 21.5, 14, 25); P.fence('x', 21.5, 31, 47);
  b.block('concrete', 23.5, 25, 0, 4.2, 20.8, 22.2); b.block('concrete', 31, 32.5, 0, 4.2, 20.8, 22.2);
  b.deco('hazard', 25, 31, 3.8, 4.2, 21.3, 21.7, { solid: false });
  M.marks.ch3 = new THREE.Vector3(28, 0, 14); M.marks.ch3Yaw = 0;
  ground('concrete', 14, 47, 22, 30);
  // 建築：入口大廳 → 中央走廊（北向）→ 兩側房間 → 機庫側門
  mass(14, 20, 22, 52, 8, 'concrete', 'e');
  mass(44, 48, 22, 52, 8, 'concrete', 'w');
  room(20, 44, 30, 36, { h: 3.6, wall: 'wall', ext: 'concrete', floor: 'floor', doors: { s: [[28, 3.2]], n: [[32, 2]] }, windows: { s: [[22], [38], [41]] }, upper: 8, lightP: 1 });
  room(30, 34, 36, 52, { h: 3.4, wall: 'wall', floor: 'floor', doors: { s: [[32, 2]], n: [[32, 2]], w: [[40, 1.2], [47, 1.2]], e: [[43, 1.2]] }, noWall: 'n', upper: 8, lightP: 1 });
  room(20, 29.7, 36.3, 43.5, { h: 3.4, wall: 'wall', floor: 'tile', doors: { e: [[40, 1.2]] }, noWall: 'es', upper: 8, lightP: 0.8 });
  room(20, 29.7, 43.8, 52, { h: 3.4, wall: 'wall', floor: 'floor', doors: { e: [[47, 1.2]] }, noWall: 'esn', upper: 8, lightP: 0.8 });
  room(34.3, 44, 36.3, 52, { h: 3.4, wall: 'wall', floor: 'metal', doors: { w: [[43, 1.2]] }, noWall: 'wsn', upper: 8, lightP: 1 });
  // 營房床架、控制台
  for (const z of [37.5, 40, 42.3]) { b.block('metal', 21, 23.5, 0, 0.55, z - 0.45, z + 0.45); b.block('metal', 21, 23.5, 1.2, 1.3, z - 0.45, z + 0.45, { solid: false }); }
  for (const z of [38, 42, 46, 50]) { b.block('dark' in mats ? 'dark' : 'olive', 42.3, 43.8, 0, 1.0, z - 1.2, z + 1.2); b.deco('lamp', 42.3, 42.35, 0.9, 1.3, z - 1, z + 1, { solid: false }); }
  P.crate(26, 47, 1.2); P.crate(24.5, 49, 1.0); P.crate(27.5, 50.5, 1.1, 0.4);
  doorFrame('x', 29.85, 28, 3.2);
  M.zones.F = { x0: 20, x1: 44, z0: 30, z1: 52 };

  // ============================================================ G 第七機庫（x 10～70，z 52～112）
  const HX0 = 10, HX1 = 70, HZ0 = 52, HZ1 = 112, HH = 28;
  ground('floor', HX0, HX1, HZ0, HZ1);
  // 外牆（波浪鋼板）＋屋頂；南牆開一個門（走廊接進來）；東牆大門半開（夕陽照進來）
  wall('corr', 'x', HZ0, 0.5, HX0, HX1, 0, HH, [{ a0: 31, a1: 33, y0: 0, y1: 3.2 }], { dim: 0.9 });
  wall('corr', 'x', HZ1, 0.5, HX0, HX1, 0, HH, [], { dim: 0.9 });
  wall('corr', 'z', HX0, 0.5, HZ0, HZ1, 0, HH, [], { dim: 0.9 });
  wall('corr', 'z', HX1, 0.5, HZ0, HZ1, 0, HH, [{ a0: 60, a1: 76, y0: 0, y1: 18 }], { dim: 0.9 });
  b.block('metal', HX1 - 0.3, HX1 + 1.5, 0, 18, 76, 88);  // 大門門片（拉開到一邊）
  // 屋頂：鋼樑＋天窗帶
  for (let z = HZ0; z < HZ1; z += 12) {
    b.block('corr', HX0, HX1, HH, HH + 0.4, z, z + 9, { dim: 0.8 });
    b.deco('glass', HX0, HX1, HH + 0.1, HH + 0.2, z + 9, z + 12);
    b.deco('metal', HX0, HX1, HH - 1.2, HH, z + 8.8, z + 9.3);
  }
  for (let x = HX0 + 6; x < HX1; x += 12) b.deco('metal', x - 0.25, x + 0.25, HH - 1.6, HH, HZ0, HZ1);
  // 柱子
  for (const x of [HX0 + 0.6, HX1 - 0.6]) for (let z = HZ0 + 6; z < HZ1; z += 12) b.block('metal', x - 0.35, x + 0.35, 0, HH, z - 0.35, z + 0.35);
  // 周邊走道（y 7）＋樓梯
  const CW = 7;
  P.deck(HX0, HX0 + 3, HZ0, HZ1, CW); P.rail('z', HX0 + 3, HZ0 + 4, 95, CW);
  P.deck(HX1 - 3, HX1, HZ0, 58, CW); P.deck(HX1 - 3, HX1, 90, HZ1, CW);
  P.deck(HX0, HX1, HZ1 - 3, HZ1, CW); P.rail('x', HZ1 - 3, HX0 + 3, 29, CW); P.rail('x', HZ1 - 3, 51, HX1 - 3, CW);
  P.stairs(HX0 + 3.2, HX0 + 5, HZ0 + 2, HZ0 + 14, 0, CW, 'z', -1);
  P.stairs(HX1 - 5, HX1 - 3.2, 96, 108, 0, CW, 'z', 1);
  // 鋼彈維修架：機體站在 (40, 104) 面南；胸口平台 y 12.4
  const MX = 40, MZ = 103;
  M.marks.mech = new THREE.Vector3(MX, 0, MZ);
  const GY = 12.4;
  P.deck(MX - 7, MX + 7, MZ - 6.5, MZ - 3.2, GY);     // 胸前平台
  P.rail('x', MZ - 6.5, MX - 7, MX - 1.2, GY); P.rail('x', MZ - 6.5, MX + 1.2, MX + 7, GY);
  P.deck(MX - 1.2, MX + 1.2, MZ - 9.5, MZ - 6.5, GY);   // 延伸橋
  P.rail('z', MX - 1.2, MZ - 9.5, MZ - 6.5, GY); P.rail('z', MX + 1.2, MZ - 9.5, MZ - 6.5, GY);
  P.deck(MX - 10, MX - 7, MZ - 6.5, HZ1, GY); P.deck(MX + 7, MX + 10, MZ - 6.5, HZ1, GY);   // 兩側高架
  P.deck(MX - 10, MX + 10, HZ1 - 3, HZ1, GY);
  P.rail('z', MX - 7, MZ - 3.2, HZ1 - 3, GY); P.rail('z', MX + 7, MZ - 3.2, HZ1 - 3, GY);
  // 從 7 m 走道上 12.4 m：北牆邊兩段樓梯
  P.stairs(HX0 + 3.2, HX0 + 5, HZ1 - 16, HZ1 - 4, CW, GY, 'z', 1);
  P.deck(HX0 + 3, MX - 10, HZ1 - 3, HZ1, GY);
  P.deck(HX0 + 3, HX0 + 5.2, HZ1 - 4, HZ1 - 3, GY);
  // 維修架的鋼骨
  for (const x of [MX - 10, MX - 7, MX + 7, MX + 10]) for (const z of [MZ - 6.3, MZ + 2, HZ1 - 0.5]) b.block('metal', x - 0.2, x + 0.2, 0, GY + 6, z - 0.2, z + 0.2);
  for (const y of [3.5, GY - 0.2, GY + 5.8]) { b.deco('metal', MX - 10.2, MX + 10.2, y - 0.2, y, MZ - 6.5, MZ - 6.1); }
  // 地面：警示線、吊車軌、油料桶、工具車、零件箱
  P.stripe(MX - 11, MX + 11, MZ - 12, MZ - 11.6); P.stripe(MX - 11, MX - 10.6, MZ - 12, HZ1); P.stripe(MX + 10.6, MX + 11, MZ - 12, HZ1);
  for (const [x, z] of [[18, 64], [19.5, 64.3], [18.6, 65.5], [60, 66], [61.2, 66.4]]) { b.obox('olive', x, 0.45, z, 0.3, 0.45, 0.3, 0); }
  P.crate(24, 72, 1.4); P.crate(25.5, 72.3, 1.1, 0.3); P.crate(24.6, 72.2, 1.0, 0.2, 1.4); P.crate(55, 74, 1.4, 0.2); P.crate(56.5, 75.6, 1.2, 0.8);
  P.container(20, 84, Math.PI / 2, 0, 'olive'); P.container(60, 86, Math.PI / 2, 0, 'rust');
  P.sandbags(40, 70, 6, 0); P.sandbags(30, 80, 4, 0.4); P.sandbags(50, 80, 4, -0.4);
  P.rack(35.5, 63, Math.PI / 2); P.rack(45, 63, Math.PI / 2); P.rack(58, 96, 0);
  P.cart(28, 93, 0.3); P.cart(52, 92, -0.4); P.cart(18, 76, 1.2);
  for (const [x, z] of [[16, 98], [16.7, 98.4], [16.2, 99.2], [64, 100], [63.4, 100.8]]) P.barrel(x, z, 'rust');
  // 天車：兩組大樑橫跨機庫
  for (const [z, off] of [[92, 0], [66, -14]]) {
    const g = PR.crane(HX1 - HX0 - 1.4);
    b.mesh('hazard', g.hazard, (HX0 + HX1) / 2, HH - 3.2, z, 0, { shade: 0.8 });
    b.mesh('metal', g.metal, (HX0 + HX1) / 2 + off, HH - 3.2, z, 0, { shade: 0.8 });
    b.mesh('olive', g.dark, (HX0 + HX1) / 2 + off, HH - 3.2, z, 0, { shade: 0.8 });
    b.deco('metal', HX0, HX0 + 1.2, HH - 3.9, HH - 3.4, HZ0, HZ1); b.deco('metal', HX1 - 1.2, HX1, HH - 3.9, HH - 3.4, HZ0, HZ1);
  }
  // 屋頂大燈往下的光束
  for (const [x, z] of [[22, 58], [46, 58], [22, 74], [58, 74], [34, 90], [46, 90]]) { const c = PR.lightCone(HH - 2, 0.9, 5.5, 0xffe2b8, 0.05); c.position.set(x, HH - 1.8, z); scene.add(c); }
  // 打在蒼焰身上的兩道光
  for (const [x, z] of [[MX - 8, MZ - 14], [MX + 8, MZ - 14]]) { const c = PR.lightCone(18, 0.5, 4.5, 0xcfe0ff, 0.06); c.position.set(x, 20, z); c.lookAt(MX, 8, MZ); c.rotateX(-Math.PI / 2); scene.add(c); }
  // 機庫燈：屋頂下的大燈（發光體）＋幾盞點光
  for (let x = HX0 + 12; x < HX1; x += 12) for (let z = HZ0 + 10; z < HZ1; z += 16) b.deco('lamp', x - 1.2, x + 1.2, HH - 1.8, HH - 1.7, z - 0.4, z + 0.4, { solid: false });
  M.lights.push({ p: new THREE.Vector3(MX, 20, MZ - 8), c: 0xbfd6ff, i: 260, d: 50 });
  M.lights.push({ p: new THREE.Vector3(24, 16, 70), c: 0xffd9a8, i: 160, d: 40 });
  M.lights.push({ p: new THREE.Vector3(56, 16, 70), c: 0xffd9a8, i: 160, d: 40 });
  M.zones.G = { x0: HX0, x1: HX1, z0: HZ0, z1: HZ1 };
  M.marks.hatch = new THREE.Vector3(MX, GY, MZ - 3.2);

  // ============================================================ 其他填空的建築量體（圍住路線以外的空地）
  mass(-60, 6, -8, 20, 14, 'wall', '');
  mass(-114, -60, -8, 114, 18, 'brick', 'e');
  mass(-60, 10, 20, 114, 16, 'concrete', 'e');
  mass(-36, 6, -92, -70, 12, 'wall', '');
  mass(6, 48, -114, -70, 12, 'concrete', '');
  mass(-82, -36, -114, -92, 10, 'wall', '');
  mass(-114, -95, -114, -112, 13, 'wall', '');
  mass(14, 20, 52, 54, 1, 'concrete', '', { noParapet: true });
  mass(70, 114, 80, 114, 10, 'corr', 'w');
  mass(10, 14, 22, 52, 8, 'concrete', '');
  mass(-64, -60, -30, -8, 12, 'wall', '');

  if (PL) dress(PL, P, rnd);
  M.meshes = b.build(scene);
  return M;
}

function hazardMat() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#c9951f'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#17181a';
  for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, 64); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 40, 0); x.lineTo(i * 32 + 24, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, vertexColors: true });
}

// ---------------------------------------------------------------- 真實道具點綴（全部用掃描模型）
function dress(PL, P, rnd) {
  const A = (n, x, y, z, ry = 0, o = {}) => PL.add(n, x, y, z, ry, o);
  // 公寓（起點）：沙發、辦公桌、鐵架、紙箱、日光燈
  A('sofa_03', -110.4, 0, -109, Math.PI / 2 + 0.2, { solid: true, hit: 'wood' });
  A('metal_office_desk', -104, 0, -96, Math.PI, { solid: true });
  A('metal_office_desk', -95, 0.45, -108.6, 1.2, { roll: Math.PI / 2, solid: true });   // 翻倒的桌子
  A('steel_frame_shelves_01', -88, 0.25, -110.2, 0.1, { scale: 0.1, tilt: -1.35 });        // 倒下的鐵架
  for (let i = 0; i < 7; i++) A(rnd() < 0.5 ? 'cardboard_box_01' : 'plastic_crate_02', -88 + rnd() * 3, 0, -108.5 + rnd() * 2, rnd() * 6, { scale: 1 + rnd() * 0.4, roll: rnd() < 0.3 ? 1.5 : 0 });
  for (let i = 0; i < 4; i++) A('trashbag', -110.8 + rnd() * 1.2, 0, -94.4 + rnd() * 0.6, rnd() * 6);
  A('old_tyre', -97, 0.08, -95, 0, { tilt: Math.PI / 2 });
  A('metal_jerrycan_green', -103.2, 0, -111.2, 0.3);
  A('steel_frame_shelves_01', -111.3, 0, -97.5, Math.PI / 2, { scale: 0.1, solid: true });
  A('steel_frame_shelves_01', -83.3, 0, -104, -Math.PI / 2, { scale: 0.1, solid: true });
  for (const [x, z] of [[-108.5, -94], [-107.9, -94.3], [-86, -95], [-96, -110.5]]) A('cardboard_box_01', x, 0, z, rnd() * 6, { scale: 1.3 + rnd() * 0.5 });
  A('cardboard_box_01', -107.9, 0.45, -94.2, 0.3, { scale: 1.3 });
  for (const [x, z] of [[-105, -103], [-94, -108]]) A('mounted_fluorescent_lights', x, 3.18, z, 0, { cast: false, tilt: Math.PI });
  // 後巷：防火梯、冷氣、電箱、輪胎、垃圾
  A('modular_fire_escape', -94.3, 3.2, -80, Math.PI / 2, { scale: 0.95 });
  A('modular_fire_escape', -88.6, 3.4, -70, -Math.PI / 2, { scale: 0.95 });
  A('utility_box_02', -94.75, 0.6, -86, Math.PI / 2, { scale: 0.9 });
  A('security_light', -94.7, 3.2, -64, Math.PI / 2);
  for (const [x, z] of [[-93.9, -84], [-89, -74.5], [-93.6, -66.2]]) A('old_tyre', x, 0.28, z, rnd() * 6, { tilt: 1.4 + rnd() * 0.3 });
  A('water_manhole_cover', -91.5, 0.01, -78, 0, { cast: false });
  for (let i = 0; i < 6; i++) A('trashbag', -93.8 + rnd() * 0.6, 0, -88 + rnd() * 3, rnd() * 6, { scale: 0.9 + rnd() * 0.4 });
  // 市場廣場：塑膠箱、油桶、推車、發電機
  for (const [x, z] of [[-86.8, -49.4], [-85.7, -49.1], [-80.5, -51.3], [-74, -47.4], [-88.8, -40.3], [-70.5, -39.3]]) { A('plastic_crate_02', x, 0, z, rnd() * 3); A('plastic_crate_02', x + 0.05, 0.25, z, rnd() * 3); }
  A('hand_truck', -63, 0, -46, 1.2, { solid: true });
  A('portable_generator', -64, 0, -35, 0.4, { solid: true });
  A('metal_jerrycan_green', -63.2, 0, -34.4, 1.2); A('metal_jerrycan_green', -63.5, 0, -34.1, 1.3);
  A('propane_tank', -93.5, 0, -52, 0); A('propane_tank', -93.1, 0, -51.6, 0);
  for (const [x, z] of [[-90, -58.5], [-77, -58.5], [-68, -58.5]]) A('exterior_aircon_unit', x, 4.3, z, Math.PI, { scale: 0.6 });
  // 檢查哨街道：電箱、人孔蓋、輪胎、軍用木箱、探照燈用的發電機
  for (const [x, z] of [[-30, -34.4], [-10, -34.4], [8, -47.6]]) A('utility_box_02', x, 0, z, x > 0 ? 0 : Math.PI, { solid: true });
  for (const x of [-28, -2, 22]) A('water_manhole_cover', x, 0.01, -41, 0, { cast: false });
  A('old_military_crate', 9, 0, -40, 0.3, { solid: true }); A('old_military_crate', 9.1, 0.3, -40, 0.25, { solid: true });
  A('portable_generator', 14.6, 0, -48, 0.2, { solid: true });
  for (const [x, z] of [[-18, -35], [-17.4, -35.4], [3, -47]]) A('old_tyre', x, 0.28, z, rnd() * 6, { tilt: 1.5 });
  // 貨櫃場：油桶、木箱、推車
  for (const [x, z] of [[17, -24], [34, 13], [44, -2]]) { A('wooden_military_crate', x, 0, z, rnd() * 3, { solid: true }); A('wooden_military_crate', x + 0.1, 0.46, z, rnd() * 3, { solid: true }); }
  A('hand_truck', 25, 0, -20, 0.5);
  // 基地走廊：日光燈、辦公桌、鐵架
  for (let z = 38; z < 52; z += 4) A('mounted_fluorescent_lights', 32, 3.38, z, Math.PI / 2, { cast: false, tilt: Math.PI });
  for (const [x, z] of [[24, 32], [36, 32], [40, 32]]) A('mounted_fluorescent_lights', x, 3.58, z, 0, { cast: false, tilt: Math.PI });
  A('metal_office_desk', 38, 0, 38.5, 0, { solid: true }); A('metal_office_desk', 38, 0, 45, 0, { solid: true });
  A('steel_frame_shelves_01', 21, 0, 50.5, 0, { scale: 0.1, solid: true }); A('steel_frame_shelves_01', 24, 0, 50.5, 0, { scale: 0.1, solid: true });
  // 機庫：工具車、推車、發電機、油罐、瓦斯桶、鐵架
  A('tool_cart', 27, 0, 92, 0.3, { solid: true }); A('tool_cart', 53, 0, 91, -0.5, { solid: true }); A('tool_cart', 19, 0, 75, 1.4, { solid: true });
  A('hand_truck', 30, 0, 88, 0.6); A('portable_generator', 48, 0, 88, 0.2, { solid: true }); A('portable_generator', 20, 0, 60, 1.1, { solid: true });
  for (let i = 0; i < 5; i++) A('propane_tank', 62 + i * 0.4, 0, 102 + (i % 2) * 0.35, 0);
  for (let i = 0; i < 4; i++) A('metal_jerrycan_green', 17 + i * 0.4, 0, 100, 0.1 * i);
  for (const z of [64, 72, 80]) A('steel_frame_shelves_01', 11.2, 0, z, Math.PI / 2, { scale: 0.1, solid: true });
  A('modular_airduct_circular_01', 12, 20, 70, 0, { scale: 1.5 }); A('modular_airduct_circular_01', 12, 20, 76.2, 0, { scale: 1.5 });
  for (const [x, z] of [[20, 110], [60, 110]]) A('security_light', x, 6, z, Math.PI);
}
