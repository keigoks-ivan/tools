// 機體：硬表面零件（切角＋倒角裝甲、車床零件、蛇腹管、油壓桿）逐骨合併成一個網格。
// 單一材質：頂點色＋每頂點 PBR（金屬度、粗糙度、倒角邊、靜止高度）＋ dcl（噴漆標示 UV／顏色、噴口燻黑）；
// 掉漆、刮痕、雨痕、腳部沙塵都在 shader 裡用真實磨損貼圖（三面投影）算，標示字樣從共用圖集取。
// 主角機 XG-01「蒼焰」、敵機 AGX-9「獵犬」、指揮官機、重裝機。
// 每種（style, scheme）的幾何只建一次當樣板，之後 new Mech 只複製場景樹、共用幾何與材質（出場不卡頓、不漏顯示記憶體）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stencilAtlas, stencilUV, detailMaps } from './textures.js';
import { MechMotion, wrap, lerpAngle, damp } from './anim.js';

// ================================================================ 材質
const MATS = {};
const TPL = new Map();      // 'style|scheme' → 樣板（只建一次）
export function initMechMaterials(A) {
  MATS.clean = paintMaterial(A, 0.24, 0, 0.55, 0.4);
  MATS.dirty = paintMaterial(A, 0.58, 1, 1.0, 1.0);
  MATS.shadowOnly = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  TPL.clear();   // 材質換了，樣板要重建
}
// mil＝1：敵機軍用霧面漆（掉漆露出暗色底漆、多集中在邊角）；soot＝噴口燻黑強度。
// dcl.xy＝噴漆標示在圖集的 UV、dcl.z＝顏色編號（0＝沒有標示）、dcl.w＝1−燻黑量。
function paintMaterial(A, wear, mil, soot, bumpK) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wearMap = { value: A.wearM };
    sh.uniforms.paintMap = { value: detailMaps().paint };
    sh.uniforms.frameMap = { value: A.frameM };
    sh.uniforms.wearAmt = { value: wear };
    sh.uniforms.dclMap = { value: stencilAtlas() };
    sh.uniforms.milK = { value: mil };
    sh.uniforms.sootK = { value: soot };
    sh.uniforms.bumpK = { value: bumpK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 pbr; attribute vec4 dcl; varying vec4 vPbr; varying vec4 vDcl; varying vec3 vOP; varying vec3 vON;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPbr = pbr; vDcl = dcl; vOP = position; vON = normal;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D wearMap, frameMap, paintMap, dclMap; uniform float wearAmt, milK, sootK, bumpK;
        varying vec4 vPbr; varying vec4 vDcl; varying vec3 vOP; varying vec3 vON;
        vec4 wv_tri(sampler2D t, vec3 p, vec3 n, float s){
          vec3 a = pow(abs(n), vec3(4.0)); a /= (a.x + a.y + a.z + 1e-5);
          return texture2D(t, p.zy * s) * a.x + texture2D(t, p.xz * s + 0.31) * a.y + texture2D(t, p.xy * s + 0.67) * a.z;
        }
        float wv_h(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float wv_n(vec3 x){
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(wv_h(i), wv_h(i + vec3(1,0,0)), f.x), mix(wv_h(i + vec3(0,1,0)), wv_h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(wv_h(i + vec3(0,0,1)), wv_h(i + vec3(1,0,1)), f.x), mix(wv_h(i + vec3(0,1,1)), wv_h(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wv_nO = normalize(vON);
        // 噴漆標示：先蓋在底漆上，後面的掉漆、髒污、燻黑一起作用在字上
        float wv_ti = vDcl.z - 8.0 * floor(vDcl.z / 8.0 + 0.01);
        vec4 wv_dc = texture2D(dclMap, vDcl.xy);
        float wv_dA = wv_ti > 0.5 ? wv_dc.a * 0.92 : 0.0;
        vec3 wv_tc = wv_ti < 1.5 ? vec3(0.58, 0.56, 0.48) : wv_ti < 2.5 ? vec3(0.018) : wv_ti < 3.5 ? vec3(0.55, 0.36, 0.05) : wv_ti < 4.5 ? vec3(0.42, 0.03, 0.025) : wv_ti < 5.5 ? wv_dc.rgb : vec3(0.045, 0.05, 0.055);
        diffuseColor.rgb = mix(diffuseColor.rgb, wv_tc, wv_dA);
        vec4 wv_W = wv_tri(wearMap, vOP, wv_nO, 0.22);
        vec4 wv_W2 = wv_tri(paintMap, vOP, wv_nO, 0.5);    // 漆面照片細節（約 2 m 一張）
        vec4 wv_F = wv_tri(frameMap, vOP, wv_nO, 0.45);     // 骨架金屬細節
        float wv_S = wv_tri(wearMap, vOP * vec3(1.0, 0.1, 1.0), wv_nO, 0.32).b;
        float wv_nz = wv_n(vOP * 0.45);
        float wv_nz2 = wv_n(vOP * 1.9 + 7.0);
        float wv_paint = 1.0 - step(0.5, vPbr.x);
        float wv_edge = vPbr.z;
        float wv_chipN = (1.0 - wv_W.b) * 0.95 + wv_edge * (0.2 + 0.55 * wv_nz) + (wv_nz - 0.5) * 0.35 + milK * (wv_edge - 0.7) * 0.22 + (0.5 - wv_W2.r) * 0.12;
        float wv_th = 1.0 - wearAmt * 0.26;
        float wv_chip = wv_paint * smoothstep(wv_th, wv_th + 0.04, wv_chipN);
        float wv_halo = wv_paint * smoothstep(wv_th - 0.1, wv_th, wv_chipN) * (1.0 - wv_chip);
        vec3 wv_base = diffuseColor.rgb * (0.9 + wv_nz * 0.14 + (wv_nz2 - 0.5) * 0.06);
        // 照片細節：漆面的斑駁、刮痕、雨痕、鏽點；金屬件用磨損鋼板
        wv_base *= mix(0.85 + 0.3 * wv_F.b, 0.66 + 0.68 * wv_W2.r, wv_paint);
        wv_base = mix(wv_base, vec3(0.17, 0.075, 0.03), wv_W2.b * wv_paint * mix(0.12, 0.75, milK));
        wv_base = mix(wv_base, wv_base * 1.2 + 0.015, wv_edge * mix(0.3, 0.6, wv_paint));
        float wv_streak = smoothstep(0.3, 0.9, 1.0 - wv_S) * wv_paint * wearAmt;
        wv_base *= 1.0 - wv_streak * 0.35;
        float wv_dust = smoothstep(4.8, 0.0, vPbr.w) * (0.35 + 0.65 * wv_nz) * wearAmt;
        wv_base = mix(wv_base, vec3(0.32, 0.28, 0.23), wv_dust * 0.42);
        // 敵機：腳邊再多一層泥巴（斑駁、貼地最濃）
        float wv_mud = mix(0.35, 1.0, milK) * smoothstep(1.9, 0.0, vPbr.w) * smoothstep(0.35, 0.75, wv_nz2 + (1.0 - wv_W2.r) * 0.4);
        wv_base = mix(wv_base, vec3(0.16, 0.13, 0.1), wv_mud * 0.55);
        wv_base *= 1.0 - wv_halo * 0.45;
        // 掉漆：主角機露出亮金屬；敵機多半只掉到暗色底漆，只有最裡面才見金屬
        vec3 wv_chipC = mix(vec3(0.5, 0.5, 0.52) * (0.8 + wv_W.g), mix(vec3(0.13, 0.12, 0.11), vec3(0.3, 0.3, 0.31), smoothstep(0.03, 0.1, wv_chipN - wv_th)) * (0.75 + wv_W.g), milK);
        diffuseColor.rgb = mix(wv_base, wv_chipC, wv_chip);
        // 噴口燻黑
        float wv_soot = clamp((1.0 - vDcl.w) * sootK * (0.55 + 0.45 * wv_nz2 + 0.3 * (0.5 - wv_W2.r)), 0.0, 0.93);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.028, 0.025, 0.022), wv_soot);
        float wv_bump = wv_W.b * 0.3 - wv_chip * 0.5 + (1.0 - wv_paint) * wv_F.b * 0.5 + wv_paint * wv_W2.r * 0.35;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = clamp(mix(vPbr.y, wv_W2.g, 0.45 * wv_paint) + (wv_F.g - 0.65) * 0.6 * (1.0 - wv_paint) + (wv_W.g - 0.15) * 0.25 * wv_paint + wv_dust * 0.4 + wv_mud * 0.3 + wv_streak * 0.12 + wv_soot * 0.3 - wv_dA * 0.06, 0.06, 1.0);
        roughnessFactor = mix(roughnessFactor, mix(0.3, 0.5, milK) + wv_W.g * 0.3, wv_chip);`)
      .replace('#include <metalnessmap_fragment>', `float metalnessFactor = max(vPbr.x * (1.0 - wv_dA) * (1.0 - wv_soot * 0.6), wv_chip * mix(0.95, 0.6, milK));`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(wv_bump), hy = dFdy(wv_bump);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2);
          normal = normalize(abs(det) * normal - grad * 0.03 * bumpK);
        }`);
  };
  return m;
}
const glowCache = new Map();
function glow(r, g, b) {
  const k = [r, g, b].join();
  if (!glowCache.has(k)) glowCache.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) }));
  return glowCache.get(k);
}

// ================================================================ 零件工具
// 每個零件都轉成非索引幾何，只留 position/normal；userData.edge＝倒角面（給邊緣磨損）
function prep(g, edgeFn) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.attributes.normal, e = new Float32Array(n.count);
  if (edgeFn) for (let i = 0; i < n.count; i++) e[i] = edgeFn(n.getX(i), n.getY(i), n.getZ(i));
  g.userData.edge = e;
  return g;
}
const EXT_EDGE = (nx, ny, nz) => (Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97 ? 1 : 0);
const BOX_EDGE = (nx, ny, nz) => ((Math.abs(nz) > 0.12 && Math.abs(nz) < 0.97) || (Math.abs(nx) > 0.3 && Math.abs(ny) > 0.3 && Math.abs(nz) < 0.12) ? 1 : 0);
function extrude(pts, depth, bev) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  bev = Math.max(0.005, Math.min(bev, depth * 0.3));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, depth - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelOffset: -bev,
    bevelSegments: 1, curveSegments: 6,
  });
  g.translate(0, 0, -(depth - bev * 2) / 2);
  return g;
}
// 切角矩形外框
function oct(w, h, cut) {
  const x = w / 2, y = h / 2;
  cut = Math.min(cut, x * 0.45, y * 0.45);
  return cut > 0.004
    ? [[-x + cut, -y], [x - cut, -y], [x, -y + cut], [x, y - cut], [x - cut, y], [-x + cut, y], [-x, y - cut], [-x, -y + cut]]
    : [[-x, -y], [x, -y], [x, y], [-x, y]];
}
// 倒角方塊（正面外框切角 cut、前後倒角 c）
function blk(w, h, d, c = 0.1, cut = c) {
  return prep(extrude(oct(w, h, cut), d, Math.min(c, w * 0.2, h * 0.2)), BOX_EDGE);
}
// 側面輪廓 [[z,y]...] 沿 X 擠出 width
function prof(pts, width, c = 0.1) {
  const g = prep(extrude(pts, width, c), EXT_EDGE);
  g.rotateY(-Math.PI / 2);
  return g;
}
// 正面輪廓 [[x,y]...] 沿 Z 擠出 thick
function blade(pts, thick, c = 0.03) { return prep(extrude(pts, thick, c), EXT_EDGE); }
// 車床件：輪廓要由下往上才會法線朝外，給反了就自動倒過來
function lathe(pts, seg = 20) {
  if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();
  return prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
}
function cyl(rt, rb, h, seg = 18, open = false) { return prep(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)); }
function sph(r, ws = 18, hs = 12) { return prep(new THREE.SphereGeometry(r, ws, hs)); }
// 嵌入式螺栓：與所屬骨頭一起合併，毋須多一個 draw call。
function bolt(r = 0.1) { return cyl(r, r * 1.08, r * 0.42, 8); }
// 六角螺帽（軸沿 Y）
function nut(r = 0.08) { return cyl(r, r, r * 0.55, 6); }
// 噴射口鐘形（開口朝 -Y）
function bell(r, len) {
  return lathe([[r * 0.3, 0.05], [r * 0.5, 0], [r * 0.62, -len * 0.2], [r * 0.85, -len * 0.62], [r, -len], [r * 0.93, -len * 1.02], [r * 0.78, -len * 0.62], [r * 0.5, -len * 0.18], [r * 0.3, -len * 0.05]], 20);
}
// 沿 Y 漸縮
function taper(g, sxTop, szTop = 1, sxBot = 1, szBot = 1) {
  g.computeBoundingBox();
  const { min, max } = g.boundingBox, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y || 1);
    p.setX(i, p.getX(i) * THREE.MathUtils.lerp(sxBot, sxTop, t));
    p.setZ(i, p.getZ(i) * THREE.MathUtils.lerp(szBot, szTop, t));
  }
  g.computeVertexNormals();
  return g;
}
// 把「沿 Z 延伸、厚度在 X」的板子繞垂直軸彎：中間往 +X 鼓
function bendPlate(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), th = z / R;
    p.setX(i, (x + R) * Math.cos(th) - R);
    p.setZ(i, (x + R) * Math.sin(th));
  }
  g.computeVertexNormals();
  return g;
}
// 細分過的切角板（厚度 X、高 Y、長 Z），給 bendPlate 彎出真正的曲面（原本的擠出面只有外框頂點，彎不出弧度）
function gridPlate(t, h, len, cut, sy = 6, sz = 12) {
  const g = new THREE.BoxGeometry(t, h, len, 1, sy, sz), p = g.attributes.position, hy = h / 2, hz = len / 2;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), z = p.getZ(i), ex = (Math.abs(y) - (hy - cut)) + (Math.abs(z) - (hz - cut)) - cut;
    if (ex > 0) { p.setY(i, y - Math.sign(y) * ex / 2); p.setZ(i, z - Math.sign(z) * ex / 2); }
  }
  return prep(g, (nx) => (Math.abs(nx) < 0.5 ? 1 : 0));
}
// ---------------------------------------------------------------- 曲面裝甲板
// 凸多邊形外框（XY）往內縮 d（逆時針多邊形）
function insetPoly(P, d) {
  const n = P.length, L = [], out = [];
  for (let i = 0; i < n; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % n];
    let ex = x1 - x0, ey = y1 - y0;
    const l = Math.hypot(ex, ey) || 1; ex /= l; ey /= l;
    L.push([x0 - ey * d, y0 + ex * d, ex, ey]);
  }
  for (let i = 0; i < n; i++) {
    const [ax, ay, adx, ady] = L[(i + n - 1) % n], [bx, by, bdx, bdy] = L[i];
    const den = adx * bdy - ady * bdx;
    if (Math.abs(den) < 1e-6) { out.push([bx, by]); continue; }
    const s = ((bx - ax) * bdy - (by - ay) * bdx) / den;
    out.push([ax + adx * s, ay + ady * s]);
  }
  return out;
}
// 水平線與多邊形的左右交點
function span(P, y) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) {
    const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length];
    if ((y0 - y) * (y1 - y) > 0) continue;
    if (y0 === y1) { lo = Math.min(lo, x0, x1); hi = Math.max(hi, x0, x1); continue; }
    const x = x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    lo = Math.min(lo, x); hi = Math.max(hi, x);
  }
  return [lo, hi];
}
// 裝甲板：凸多邊形外框 [[x,y]...]、厚度 t（正面朝 +Z），正面四周切一道倒角 bev；
// 正面是細分網格＋平滑法線，可沿兩個方向彎：z −= (x−cx)²/(2·bx) + (y−cy)²/(2·by)（bx、by＝曲率半徑，0＝不彎）
function plate(outline, t, { bev = 0.06, nx = 6, ny = 6, bx = 0, by = 0, cx = 0, cy = 0 } = {}) {
  let P = outline.map((p) => p.slice());
  let a2 = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  if (a2 < 0) P.reverse();
  const Q = insetPoly(P, bev);
  let y0 = Infinity, y1 = -Infinity;
  for (const p of P) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  // 列：一定經過外框的轉角高度，中間再依 ny 細分
  const ys = [...new Set(P.map((p) => +p[1].toFixed(5)))].sort((a, b) => a - b), T = [0];
  for (let k = 0; k < ys.length - 1; k++) {
    const n = Math.max(1, Math.round((ny * (ys[k + 1] - ys[k])) / (y1 - y0)));
    for (let s = 1; s <= n; s++) T.push((ys[k] - y0 + ((ys[k + 1] - ys[k]) * s) / n) / (y1 - y0));
  }
  const mk = (poly) => {
    let a = Infinity, b = -Infinity;
    for (const p of poly) { a = Math.min(a, p[1]); b = Math.max(b, p[1]); }
    const e = (b - a) * 1e-4;
    return T.map((tt) => {
      const y = a + e + (b - a - 2 * e) * tt, [l, r] = span(poly, y);
      return Array.from({ length: nx + 1 }, (_, i) => [l + ((r - l) * i) / nx, y]);
    });
  };
  const GF = mk(Q), GB = mk(P), R = T.length - 1;
  const sag = (x, y) => (bx ? (x - cx) ** 2 / (2 * bx) : 0) + (by ? (y - cy) ** 2 / (2 * by) : 0);
  const fp = [], fi = [];
  for (let j = 0; j <= R; j++) for (let i = 0; i <= nx; i++) { const [x, y] = GF[j][i]; fp.push(x, y, t / 2 - sag(x, y)); }
  for (let j = 0; j < R; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i; fi.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1); }
  let front = new THREE.BufferGeometry();
  front.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
  front.setIndex(fi);
  front.computeVertexNormals();
  front = front.toNonIndexed();
  const rp = [], re = [];
  const V = (G, j, i, z) => { const [x, y] = G[j][i]; return [x, y, z - sag(x, y)]; };
  const quad = (a, b, c, d, e) => { rp.push(...a, ...b, ...c, ...a, ...c, ...d); for (let k = 0; k < 6; k++) re.push(e); };
  const loop = [];
  for (let i = 0; i <= nx; i++) loop.push([0, i]);
  for (let j = 1; j <= R; j++) loop.push([j, nx]);
  for (let i = nx - 1; i >= 0; i--) loop.push([R, i]);
  for (let j = R - 1; j >= 1; j--) loop.push([j, 0]);
  for (let k = 0; k < loop.length; k++) {
    const [ja, ia] = loop[k], [jb, ib] = loop[(k + 1) % loop.length];
    quad(V(GF, ja, ia, t / 2), V(GB, ja, ia, t / 2 - bev), V(GB, jb, ib, t / 2 - bev), V(GF, jb, ib, t / 2), 1);
    quad(V(GB, ja, ia, t / 2 - bev), V(GB, ja, ia, -t / 2), V(GB, jb, ib, -t / 2), V(GB, jb, ib, t / 2 - bev), 0.4);
  }
  for (let j = 0; j < R; j++) for (let i = 0; i < nx; i++) quad(V(GB, j, i, -t / 2), V(GB, j + 1, i, -t / 2), V(GB, j + 1, i + 1, -t / 2), V(GB, j, i + 1, -t / 2), 0);
  const ring = new THREE.BufferGeometry();
  ring.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
  ring.computeVertexNormals();
  const g = mergeGeometries([front, ring]);
  const e = new Float32Array(g.attributes.position.count);
  e.set(re, front.attributes.position.count);
  g.userData.edge = e;
  g.userData.sag = sag; g.userData.t = t;
  return g;
}
// 把平面（z＝0、朝 +Z）的標示片貼到 plate 正面：跟著曲面彎、浮起 off
function onPlate(g, pl, x, y, off = 0.014) {
  const sag = pl.userData.sag, t = pl.userData.t;
  g.translate(x, y, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + t / 2 + off - sag(p.getX(i), p.getY(i)));
  g.computeVertexNormals();
  return g;
}
// 方向：'y' 正面朝上（外框給 [x, z]）、'x'／'-x' 正面朝側面（外框給 [z, y]）、'-z' 正面朝後（外框給 [x, y]）
function orient(g, dir) {
  if (dir === 'y') g.rotateX(-Math.PI / 2);
  else if (dir === 'x') g.rotateY(Math.PI / 2);
  else if (dir === '-x') g.rotateY(-Math.PI / 2);
  else if (dir === '-z') g.rotateY(Math.PI);
  return g;
}
// 各方向外框座標換成 plate 自己的 XY
const toLocal = (dir, [u, v]) => (dir === 'y' ? [u, -v] : dir === 'x' ? [-u, v] : dir === '-z' ? [-u, v] : [u, v]);
// 一次做好：某方向的曲面板（外框用該方向的座標），回傳 { g, lab(g2, u, v) }
function panel(dir, outline, t, o = {}) {
  const lo = { ...o };
  if (o.cu !== undefined || o.cv !== undefined) { const [cx, cy] = toLocal(dir, [o.cu || 0, o.cv || 0]); lo.cx = cx; lo.cy = cy; }
  const g = plate(outline.map((p) => toLocal(dir, p)), t, lo);
  return { g: orient(g, dir), lab: (g2, u, v, off) => { const [x, y] = toLocal(dir, [u, v]); return orient(onPlate(g2, g, x, y, off), dir); } };
}
function noEdge(g) { g.userData.edge = new Float32Array(g.attributes.position.count); return g; }
// 把零件正面（z>0 那一半）沿 X 往後彎，讓核心箱體跟外面的曲面裝甲貼合
function bendFront(g, R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getZ(i) > 0) p.setZ(i, Math.max(0.05, p.getZ(i) - p.getX(i) ** 2 / (2 * R)));
  g.computeVertexNormals();
  return g;
}
// 合併幾個零件（保留倒角邊資訊）
function merge(list) {
  const g = mergeGeometries(list);
  const e = new Float32Array(g.attributes.position.count);
  let o = 0;
  for (const s of list) { if (s.userData.edge) e.set(s.userData.edge, o); o += s.attributes.position.count; }
  g.userData.edge = e;
  return g;
}
const _mt = new THREE.Matrix4(), _qt = new THREE.Quaternion(), _et = new THREE.Euler(), _vt = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
// 就地擺放零件（位置、XYZ 旋轉）
function at(g, pos = [0, 0, 0], rot = [0, 0, 0]) {
  return g.applyMatrix4(_mt.compose(_vt.set(...pos), _qt.setFromEuler(_et.set(rot[0], rot[1], rot[2], 'XYZ')), _one));
}
const _up = new THREE.Vector3(0, 1, 0);
// 兩點之間的圓柱（油壓桿、管線、天線）；r0 在 a 端
function rod(a, b, r0, r1 = r0, seg = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  const g = cyl(r1, r0, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(_up, d.divideScalar(len)));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g;
}
// 硬管（沒有蛇腹環）
function pipe(points, r, seg = 12, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return noEdge(prep(new THREE.TubeGeometry(curve, seg, r, radial, false)));
}
// ㄇ字扶手：桿沿 X、兩腳往 +Z 伸出 off
function handle(len, off, r = 0.045) {
  const x = len / 2;
  return noEdge(mergeGeometries([rod([-x, 0, 0], [-x, 0, off], r, r, 6), rod([x, 0, 0], [x, 0, off], r, r, 6), rod([-x - r, 0, off], [x + r, 0, off], r, r, 6)]));
}
// 蛇腹管（環數與面數已壓低：看起來一樣，三角形少四成）
function hose(points, r, rings = 12) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const parts = [prep(new THREE.TubeGeometry(curve, rings * 2, r * 0.72, 7, false))];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings, p = curve.getPoint(t), tg = curve.getTangent(t);
    const g = new THREE.TorusGeometry(r, r * 0.3, 5, 10);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg));
    g.translate(p.x, p.y, p.z);
    parts.push(prep(g));
  }
  return noEdge(mergeGeometries(parts));
}
// 一串水平環（關節護套）
function ribs(y0, y1, n, r, t, seg = 20) {
  const parts = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.TorusGeometry(r, t, 6, seg); g.rotateX(Math.PI / 2);
    g.translate(0, THREE.MathUtils.lerp(y0, y1, n > 1 ? k / (n - 1) : 0), 0);
    parts.push(prep(g));
  }
  return noEdge(mergeGeometries(parts));
}
// 前方弧形環（單眼滑軌上下緣）
function arcRing(r, t, arc) {
  const g = new THREE.TorusGeometry(r, t, 6, 28, arc);
  g.rotateZ(Math.PI / 2 - arc / 2); g.rotateX(Math.PI / 2);
  return prep(g);
}
// 噴漆標示片：面朝 face（'z' 預設、'-z'、'x'、'-x'、'y'），ox＝沿字的方向位移；tint：1 米白 2 黑 3 黃 4 紅 5 圖集原色 6 灰
// slot>0 表示「編號第幾位」，每台機體出場時改成自己的號碼
function sten(cell, w, h, { tint = 1, digit = 0, slot = 0, face = 'z', ox = 0, seg = 1 } = {}) {
  const g = new THREE.PlaneGeometry(w, h, seg, 1).toNonIndexed();
  const uv = g.attributes.uv, n = uv.count, d = new Float32Array(n * 4);
  const [u0, v0, u1, v1] = stencilUV(cell, digit);
  for (let i = 0; i < n; i++) {
    d[i * 4] = u0 + (u1 - u0) * uv.getX(i); d[i * 4 + 1] = v0 + (v1 - v0) * uv.getY(i);
    d[i * 4 + 2] = tint + slot * 8; d[i * 4 + 3] = 1;
  }
  g.deleteAttribute('uv');
  g.translate(ox, 0, 0);
  if (face === 'x') g.rotateY(Math.PI / 2); else if (face === '-x') g.rotateY(-Math.PI / 2);
  else if (face === '-z') g.rotateY(Math.PI); else if (face === 'y') g.rotateX(-Math.PI / 2);
  g.userData.edge = new Float32Array(n);
  g.userData.dcl = d;
  return g;
}
// 一串數字（每位一片）；variable＝出場時換成該機號碼
function digits(str, h, { tint = 1, face = 'z', variable = false } = {}) {
  const w = h * 0.5, gap = w * 0.95, list = [];
  for (let k = 0; k < str.length; k++) {
    list.push(sten('d0', w, h, { tint, face, digit: variable ? 0 : +str[k], slot: variable ? k + 1 : 0, ox: (k - (str.length - 1) / 2) * gap }));
  }
  const g = mergeGeometries(list);
  g.userData.edge = new Float32Array(g.attributes.position.count);
  const d = new Float32Array(g.attributes.position.count * 4);
  let o = 0;
  for (const s of list) { d.set(s.userData.dcl, o); o += s.userData.dcl.length; }
  g.userData.dcl = d;
  return g;
}

const P = (hex, m = 0, r = 0.5) => ({ c: new THREE.Color(hex), m, r });
const CHROME = P(0xb4b9be, 0.95, 0.2);
const GLASS = P(0x0a0f13, 0.6, 0.06);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
// 可重現的亂數（每片零件漆色微差、敵機編號）
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const UNITS = ['12', '17', '23', '28', '34', '41', '46', '52', '58', '63', '67', '74', '81', '86'];

// ================================================================ 塗裝（m＝金屬度，r＝粗糙度）
const SCHEMES = {
  hero: {
    main: P(0x9fa29e, 0.05, 0.52), second: P(0x30353d, 0.1, 0.5), accent: P(0x8a3030, 0.04, 0.5), yellow: P(0xa88b45, 0.3, 0.42),
    frame: P(0x3b3f45, 0.85, 0.42), dark: P(0x14171b, 0.5, 0.62), weapon: P(0x303943, 0.55, 0.47), sole: P(0x17191a, 0.1, 0.85),
    eye: [0.12, 2.1, 0.95], wear: 'clean',
  },
  grunt: {
    main: P(0x4b5243, 0, 0.72), second: P(0x383d33, 0, 0.74), accent: P(0x5c6152, 0, 0.7), yellow: P(0x8f7433, 0, 0.62),
    frame: P(0x3c3f42, 0.75, 0.52), dark: P(0x18191a, 0.2, 0.7), weapon: P(0x2e3134, 0.45, 0.55), sole: P(0x131415, 0, 0.9),
    eye: [12, 0.6, 3], wear: 'dirty',
  },
  ace: {
    main: P(0x6c2a2a, 0, 0.66), second: P(0x3d1c1e, 0, 0.68), accent: P(0x2a2a2d, 0, 0.62), yellow: P(0x9a7a3a, 0, 0.55),
    frame: P(0x3c3e42, 0.8, 0.5), dark: P(0x171718, 0.2, 0.66), weapon: P(0x2b2c2f, 0.45, 0.5), sole: P(0x131415, 0, 0.9),
    eye: [12, 0.6, 3], wear: 'dirty',
  },
  heavy: {
    main: P(0x4a4d51, 0, 0.7), second: P(0x2d3034, 0, 0.72), accent: P(0x8c5428, 0, 0.62), yellow: P(0x8c5428, 0, 0.62),
    frame: P(0x3a3d41, 0.8, 0.5), dark: P(0x161617, 0.2, 0.7), weapon: P(0x2c2e32, 0.5, 0.5), sole: P(0x121314, 0, 0.9),
    eye: [12, 3, 0.5], wear: 'dirty',
  },
};

// ================================================================ 機體
export class Mech {
  constructor(style = 'hero', schemeKey = style) {
    const key = style + '|' + schemeKey;
    let T = TPL.get(key);
    if (!T) {
      T = Object.create(Mech.prototype);
      T.build(style, schemeKey);
      T.variants = new Map();
      TPL.set(key, T);
    }
    this.adopt(T);

    this.legYaw = 0; this.pose = { boost: 0, air: 0 };
    this.land = 0; this.landV = 0; this.thrust = 0; this.recoil = 0; this.swing = 0;
    this.motion = new MechMotion(this);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.copy(this.muzzleLocal);
    this.weapon.add(this.muzzle);
    this.root.traverse((o) => { if (o.isMesh || o.isSprite) o.userData.mech = this; });
  }

  // 建樣板（只在第一次遇到這種 style/scheme 時跑）
  build(style, schemeKey) {
    this.style = style;
    this.schemeKey = schemeKey;
    const S = (this.S = SCHEMES[schemeKey]);
    this.root = new THREE.Group();
    this.bones = {};
    this.parts = new Map();
    this.glows = [];
    this.nozzles = [];
    this.mat = MATS[S.wear];
    this.rnd = rng(style.length * 131 + schemeKey.length * 17 + 7);
    const hero = style === 'hero';
    const L = (this.L = hero
      ? { pelvis: 9.9, hip: [1.45, -0.5, 0], knee: [0, -4.25, 0.1], ankle: [0, -4.0, -0.1], torso: [0, 0.85, 0], head: [0, 4.95, 0.35], shoulder: [3.05, 3.95, -0.05], elbow: -2.85, hand: -3.05 }
      : { pelvis: 9.75, hip: [1.55, -0.55, 0], knee: [0, -4.15, 0.15], ankle: [0, -3.75, -0.1], torso: [0, 0.7, 0], head: [0, 5.15, 0.55], shoulder: [3.4, 3.95, 0.05], elbow: -2.9, hand: -3.0 });
    const b = this.bones;
    const bone = (name, parent, x, y, z) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); b[name] = o; return o; };
    bone('pelvis', this.root, 0, L.pelvis, 0);
    bone('torso', b.pelvis, ...L.torso).rotation.order = 'YXZ';
    bone('head', b.torso, ...L.head);
    bone('back', b.torso, 0, 0, 0);
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      bone('shoulder' + n, b.torso, sx * L.shoulder[0], L.shoulder[1], L.shoulder[2]).rotation.order = 'YXZ';
      bone('elbow' + n, b['shoulder' + n], 0, L.elbow, 0);
      bone('hand' + n, b['elbow' + n], 0, L.hand, 0);
      bone('hip' + n, b.pelvis, sx * L.hip[0], L.hip[1], L.hip[2]).rotation.order = 'YXZ';
      bone('knee' + n, b['hip' + n], ...L.knee);
      bone('ankle' + n, b['knee' + n], ...L.ankle);
    }
    if (hero) this.buildHero(S); else this.buildGrunt(S, style);
    this.buildFlames();
    this.finish();
  }

  // 從樣板複製：場景樹 clone（幾何、材質共用），再把欄位對應到新的物件
  adopt(T) {
    this.style = T.style; this.schemeKey = T.schemeKey; this.S = T.S; this.mat = T.mat; this.L = T.L;
    this.parts = new Map();
    this.root = T.root.clone();
    const map = new Map();
    const walk = (a, c) => { map.set(a, c); for (let i = 0; i < a.children.length; i++) walk(a.children[i], c.children[i]); };
    walk(T.root, this.root);
    const M = (o) => (o ? map.get(o) : o);
    this.bones = {};
    for (const k in T.bones) this.bones[k] = M(T.bones[k]);
    this.meshes = T.meshes.map(M);
    this.glows = T.glows.map(M);
    this.nozzles = T.nozzles.map((n) => ({ ...n, bone: M(n.bone) }));
    this.flames = T.flames.map((f) => ({ g: M(f.g), len: f.len }));
    this.eye = M(T.eye); this.eyeRail = T.eyeRail;
    this.weapon = M(T.weapon); this.muzzleLocal = T.muzzleLocal.clone();
    this.saber = M(T.saber);
    this.height = T.height;
    if (T.footToe) { this.footToe = T.footToe; this.footHeel = T.footHeel; }
    if (T.hatch) {
      this.hatch = M(T.hatch); this.cockpitGlow = M(T.cockpitGlow);
      this.cockpitLocal = T.cockpitLocal.clone(); this.hatchAxis = T.hatchAxis;
    }
    // 機號：肩甲／胸口上標了「變動位數」的噴漆字，換成這台自己的號碼（同號碼的幾何只做一次）
    if (T.unitMeshes && T.unitMeshes.length) {
      const pick = T.units[(Math.random() * T.units.length) | 0];
      this.unit = pick;
      for (const i of T.unitMeshes) {
        const k = i + ':' + pick;
        if (!T.variants.has(k)) T.variants.set(k, unitVariant(T.meshes[i].geometry, pick));
        this.meshes[i].geometry = T.variants.get(k);
      }
    }
  }

  // 零件放到某骨頭（骨頭座標）
  add(bone, g, paint, pos = [0, 0, 0], rot = [0, 0, 0], scl = null) {
    _m4.compose(_v.set(...pos), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'XYZ')), scl ? _s.set(...scl) : _s.set(1, 1, 1));
    g.applyMatrix4(_m4);
    const n = g.attributes.position.count, e = g.userData.edge, dsrc = g.userData.dcl;
    const col = new Float32Array(n * 3), pbr = new Float32Array(n * 4), dcl = new Float32Array(n * 4);
    // 每片零件的漆色有一點批次差（金屬件不變），整台看起來不是同一桶漆刷出來的
    const k = paint.m < 0.5 && !dsrc ? 1 + (this.rnd() - 0.5) * (this.style === 'hero' ? 0.035 : 0.09) : 1;
    for (let i = 0; i < n; i++) {
      col[i * 3] = paint.c.r * k; col[i * 3 + 1] = paint.c.g * k; col[i * 3 + 2] = paint.c.b * k;
      pbr[i * 4] = paint.m; pbr[i * 4 + 1] = paint.r; pbr[i * 4 + 2] = e ? e[i] : 0;
      dcl[i * 4 + 3] = 1;
    }
    if (dsrc) dcl.set(dsrc);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
    g.setAttribute('dcl', new THREE.BufferAttribute(dcl, 4));
    if (!this.parts.has(bone)) this.parts.set(bone, []);
    this.parts.get(bone).push(g);
    return g;
  }
  // 曲面板：做好就放上去，回傳 panel（p.put 把標示貼在同一片板上）；shift＝放置前先在板子自己的座標裡平移
  pl(bone, dir, outline, t, o, paint, pos = [0, 0, 0], rot = [0, 0, 0], shift = null) {
    const p = panel(dir, outline, t, o);
    if (shift) p.g.translate(...shift);
    this.add(bone, p.g, paint, pos, rot);
    p.put = (g, u, v, pt = paint, off) => { const q = p.lab(g, u, v, off); if (shift) q.translate(...shift); return this.label(bone, q, pt, pos, rot); };
    return p;
  }
  addGlow(bone, g, color, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const m = new THREE.Mesh(g, glow(...color));
    m.position.set(...pos); m.rotation.set(...rot);
    m.userData.noAO = true;
    bone.add(m);
    this.glows.push(m);
    return m;
  }
  // 噴漆標示：g 由 sten()/digits() 產生；paint＝底下那片裝甲的漆（標示以外的地方看起來就是同一片）
  label(bone, g, paint, pos, rot = [0, 0, 0]) { return this.add(bone, g, paint, pos, rot); }
  // 油壓缸：缸體＋防塵環＋鍍鉻活塞桿＋兩端耳座
  piston(bone, a, b, r, S, body = S.frame) {
    const L = (t) => a.map((v, i) => v + (b[i] - v) * t);
    this.add(bone, rod(a, L(0.58), r, r, 10), body);
    this.add(bone, rod(L(0.52), L(0.61), r * 1.2, r * 1.2, 10), S.dark);
    this.add(bone, rod(L(0.56), b, r * 0.55, r * 0.55, 8), CHROME);
    this.add(bone, sph(r * 1.15, 8, 5), S.frame, a);
    this.add(bone, sph(r * 0.85, 8, 5), S.frame, b);
  }
  // 百葉散熱口：暗色底板＋斜葉片（面朝 +Z，再用 pos/rot 擺）
  vent(bone, w, h, n, S, pos, rot = [0, 0, 0], slat = S.frame) {
    this.add(bone, blk(w, h, 0.06, 0.015), S.dark, pos, rot);
    const list = [];
    for (let k = 0; k < n; k++) list.push(at(blk(w * 0.94, (h / n) * 0.62, 0.05, 0.01), [0, -h / 2 + (k + 0.5) * (h / n), 0.05], [0.55, 0, 0]));
    this.add(bone, merge(list), slat, pos, rot);
  }
  // 一圈螺帽（圓心 c、半徑 r、軸向：'x' 或 'z'）
  nutRing(bone, c, r, n, S, axis = 'z', size = 0.06, a0 = 0) {
    const list = [];
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2, u = Math.cos(a) * r, v = Math.sin(a) * r;
      list.push(axis === 'z' ? at(nut(size), [c[0] + u, c[1] + v, c[2]], [Math.PI / 2, 0, 0]) : at(nut(size), [c[0], c[1] + v, c[2] + u], [0, 0, Math.PI / 2]));
    }
    this.add(bone, merge(list), S.frame);
  }

  // 每根骨頭合併成一個網格；pbr.w 記錄靜止時離地高度（腳部沙塵用）、dcl.w 記錄離噴口多近（燻黑）
  finish() {
    this.root.updateMatrixWorld(true);
    this.meshes = [];
    const src = this.nozzles.map((nz) => {
      const p = nz.bone.localToWorld(new THREE.Vector3(...nz.pos));
      return { p, R: nz.r * 4.0 + 1.4 };
    });
    this.unitMeshes = [];
    for (const [bone, list] of this.parts) {
      const g = mergeGeometries(list);
      const p = g.attributes.position, pbr = g.attributes.pbr, dcl = g.attributes.dcl;
      const w = new THREE.Vector3();
      let unit = false;
      for (let i = 0; i < p.count; i++) {
        w.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(bone.matrixWorld);
        pbr.setW(i, w.y);
        let s = 0;
        for (const q of src) {
          const d = w.distanceTo(q.p);
          if (d < q.R) s = Math.max(s, THREE.MathUtils.smoothstep(q.R - d, 0, q.R * 0.7));
        }
        dcl.setW(i, 1 - s);
        if (dcl.getZ(i) >= 8) unit = true;
      }
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      bone.add(mesh);
      if (unit) this.unitMeshes.push(this.meshes.length);
      this.meshes.push(mesh);
    }
    this.parts.clear();
  }

  // ======================= 主角機 XG-01「蒼焰」 =======================
  // 寫實重構：現役重型戰術機——曲面倒角裝甲層層相疊、外露油壓缸與骨架、胸口裝甲艙門（駕駛艙）。
  // 淺灰白主裝甲＋深藍次裝甲＋少量紅色識別線；頭部感測冠＋後掠雙刀型天線（金色）。
  buildHero(S) {
    const b = this.bones, A = this.add.bind(this);
    // 曲面板：做好就放上去，回傳 panel（p.lab 產生貼在同一片板上的標示）
    const PL = (bone, dir, outline, t, o, paint, pos = [0, 0, 0], rot = [0, 0, 0]) => {
      const p = panel(dir, outline, t, o);
      A(bone, p.g, paint, pos, rot);
      p.put = (g, u, v, pt = paint, off) => this.label(bone, p.lab(g, u, v, off), pt, pos, rot);
      return p;
    };
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const ank = b['ankle' + n], kn = b['knee' + n], hp = b['hip' + n];
      const fx = sx > 0 ? 'x' : '-x';
      // ================= 腳（腳踝在 y＝0、鞋底 y＝-1.15）
      const foot = [[-0.8, -1.72], [0.8, -1.72], [1.02, -1.2], [1.08, 1.3], [0.9, 2.4], [0.42, 2.68], [-0.42, 2.68], [-0.9, 2.4], [-1.08, 1.3], [-1.02, -1.2]];
      PL(ank, 'y', foot, 0.24, { bev: 0.05, nx: 4, ny: 8 }, S.sole, [0, -1.03, 0]);
      PL(ank, 'y', foot.map(([x, z]) => [x * 0.95, z * 0.97 + 0.03]), 0.1, { bev: 0.03, nx: 3, ny: 6 }, S.frame, [0, -0.86, 0]);
      const lugs = [];
      for (const side of [-1, 1]) for (let k = 0; k < 6; k++) lugs.push(at(blk(0.1, 0.12, 0.3, 0.025), [side * 1.05, -1.05, -1.3 + k * 0.52]));
      A(ank, merge(lugs), S.sole);
      // 鞋身（深藍）
      A(ank, prof([[-1.55, -0.82], [2.3, -0.82], [2.5, -0.58], [2.2, -0.32], [1.4, 0.0], [0.55, 0.35], [-0.65, 0.42], [-1.45, 0.12], [-1.72, -0.35]], 1.9, 0.12), S.second);
      A(ank, cyl(0.55, 0.55, 1.75, 16), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      // 腳尖護甲（雙向彎曲）＋ NO STEP
      const toe = PL(ank, 'y', [[-0.9, -0.82], [0.9, -0.82], [0.98, -0.02], [0.78, 0.58], [0.32, 0.83], [-0.32, 0.83], [-0.78, 0.58], [-0.98, -0.02]], 0.2, { bev: 0.05, nx: 6, ny: 6, bx: 1.3, by: 2.4 }, S.main, [0, -0.02, 1.77], [0.39, 0, 0]);
      toe.put(sten('nostep', 0.62, 0.16, { tint: 2, seg: 4 }), 0, 0.2);
      A(ank, merge([-0.6, 0.6].map((x) => at(nut(0.05), [x, 0.08, 1.3], [0.39, 0, 0]))), S.frame);
      // 腳尖防撞條＋警示條紋
      const bump = PL(ank, 'z', [[-0.82, -0.2], [0.82, -0.2], [0.92, 0.05], [0.72, 0.22], [-0.72, 0.22], [-0.92, 0.05]], 0.2, { bev: 0.04, nx: 6, ny: 2, bx: 1.1 }, S.second, [0, -0.62, 2.46], [-0.35, 0, 0]);
      bump.put(sten('hazard', 1.36, 0.22, { tint: 5, seg: 6 }), 0, 0);
      // 腳背護甲
      PL(ank, 'y', [[-0.62, -0.45], [0.62, -0.45], [0.68, 0.4], [0.5, 0.55], [-0.5, 0.55], [-0.68, 0.4]], 0.16, { bev: 0.04, nx: 4, ny: 4, bx: 1.1 }, S.main, [0, 0.43, 0.72], [0.3, 0, 0]);
      // 腳踝兩側護甲＋軸蓋；腳跟油壓緩衝
      for (const side of [-1, 1]) {
        const gd = PL(ank, side > 0 ? 'x' : '-x', [[-1.1, -0.7], [0.7, -0.7], [0.95, -0.1], [0.65, 0.55], [-0.75, 0.62], [-1.2, 0.0]], 0.22, { bev: 0.05, nx: 6, ny: 5, bx: 2.4, by: 3, cu: -0.1 }, S.main, [side * 1.08, 0, 0]);
        A(ank, cyl(0.38, 0.4, 0.1, 18), S.frame, [side * 1.23, 0, 0], [0, 0, Math.PI / 2]);
        this.nutRing(ank, [side * 1.29, 0, 0], 0.28, 6, S, 'x', 0.05);
        A(ank, cyl(0.15, 0.17, 0.1, 12), S.accent, [side * 1.31, 0, 0], [0, 0, Math.PI / 2]);
        if (side === sx) gd.put(sten('warn', 0.28, 0.28, { tint: 5 }), 0.55, -0.4);
        A(ank, blk(0.22, 0.3, 0.34, 0.05), S.frame, [side * 1.12, -0.6, -1.4]);
        this.piston(ank, [side * 1.25, 0.1, -0.9], [side * 1.25, -0.5, -1.45], 0.085, S);
      }
      // 腳跟護甲＋鞋跟刺
      const heel = PL(ank, '-z', [[-0.78, -0.42], [0.78, -0.42], [0.88, 0.2], [0.6, 0.62], [-0.6, 0.62], [-0.88, 0.2]], 0.24, { bev: 0.05, nx: 5, ny: 4, bx: 1.2 }, S.main, [0, -0.35, -1.7]);
      heel.put(sten('caution', 0.8, 0.2, { tint: 2, seg: 4 }), 0, -0.1);
      A(ank, prof([[-1.55, -0.95], [-2.0, -0.95], [-1.92, -0.72], [-1.6, -0.64]], 0.9, 0.05), S.frame);

      // ================= 小腿（膝關節 y＝0）
      A(kn, cyl(0.5, 0.55, 3.9), S.frame, [0, -2.0, 0]);
      for (const side of [-1, 1]) A(kn, cyl(0.13, 0.13, 3.3, 8), S.frame, [side * 0.45, -2.1, -0.3]);
      A(kn, taper(blk(1.4, 3.0, 1.5, 0.3, 0.4), 1.0, 1.0, 1.15, 1.1), S.dark, [0, -2.2, -0.5]);
      A(kn, cyl(0.68, 0.68, 1.8), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      // 前脛甲：一整片包覆的曲面板＋上段深藍疊板
      const shin = PL(kn, 'z', [[-0.9, -1.7], [0.9, -1.7], [1.08, -1.15], [1.05, 0.7], [0.82, 1.45], [-0.82, 1.45], [-1.05, 0.7], [-1.08, -1.15]], 0.32, { bev: 0.07, nx: 8, ny: 8, bx: 1.35, by: 9 }, S.main, [0, -2.25, 0.96]);
      shin.put(sten('caution', 0.8, 0.2, { tint: 4, seg: 4 }), 0, -0.2);
      shin.put(digits('01', 0.48, { tint: 2 }), 0, -0.95);
      PL(kn, 'z', [[-0.55, -0.6], [0.55, -0.6], [0.68, 0.05], [0.48, 0.35], [-0.48, 0.35], [-0.68, 0.05]], 0.12, { bev: 0.035, nx: 5, ny: 4, bx: 1.35, by: 9, cv: -1.05 }, S.second, [0, -1.2 + 0.0, 0.96 + 0.22]);
      // 膝蓋：圓頂護甲＋紅色識別條
      PL(kn, 'z', [[-0.7, -0.6], [0.7, -0.6], [0.82, 0.05], [0.55, 0.62], [-0.55, 0.62], [-0.82, 0.05]], 0.34, { bev: 0.07, nx: 6, ny: 6, bx: 0.95, by: 1.1 }, S.second, [0, -0.1, 1.2]);
      PL(kn, 'z', [[-0.34, -0.1], [0.34, -0.1], [0.38, 0.1], [-0.38, 0.1]], 0.08, { bev: 0.02, nx: 4, ny: 1, bx: 0.95, by: 1.1, cv: -0.25 }, S.accent, [0, 0.15, 1.2 + 0.21]);
      A(kn, merge([-0.45, 0.45].map((x) => at(nut(0.05), [x, -0.5, 1.3], [Math.PI / 2 - 0.3, 0, 0]))), S.frame);
      for (const side of [-1, 1]) {
        // 小腿側板
        const cs = PL(kn, side > 0 ? 'x' : '-x', [[-1.35, -3.55], [0.55, -3.6], [0.8, -2.2], [0.6, -0.7], [-0.85, -0.55], [-1.5, -1.9]], 0.24, { bev: 0.05, nx: 6, ny: 7, bx: 3.5, by: 6, cu: -0.4, cv: -2.1 }, S.main, [side * 1.06, 0, 0]);
        if (side === sx) {
          cs.put(sten('hyd', 1.1, 0.12, { tint: 2, seg: 3 }), -0.35, -3.05);
          PL(kn, fx, [[-0.9, -1.45], [0.4, -1.45], [0.45, -1.3], [-0.95, -1.3]], 0.08, { bev: 0.02, nx: 4, ny: 1, bx: 3.5, by: 6, cu: -0.4, cv: -2.1 }, S.accent, [side * (1.06 + 0.16), 0, 0]);
        }
        // 膝關節軸蓋
        A(kn, cyl(0.46, 0.48, 0.12, 18), S.frame, [side * 1.14, 0, 0], [0, 0, Math.PI / 2]);
        this.nutRing(kn, [side * 1.21, 0, 0], 0.33, 6, S, 'x', 0.055, 0.5);
        A(kn, cyl(0.15, 0.17, 0.1, 12), S.accent, [side * 1.22, 0, 0], [0, 0, Math.PI / 2]);
        // 膝後油壓缸＋管線
        this.piston(kn, [side * 0.5, -0.35, -0.85], [side * 0.55, -2.45, -1.22], 0.12, S);
        A(kn, hose([[side * 0.2, -0.3, -0.75], [side * 0.15, -1.3, -1.25], [side * 0.3, -2.4, -1.35]], 0.09, 7), S.dark);
      }
      // 小腿背後：上段護甲、推進器座、隔熱葉片、警告字、噴口
      PL(kn, '-z', [[-0.72, -0.62], [0.72, -0.62], [0.8, 0.5], [0.5, 0.78], [-0.5, 0.78], [-0.8, 0.5]], 0.22, { bev: 0.05, nx: 5, ny: 5, bx: 1.2 }, S.main, [0, -1.72, -1.36]);
      A(kn, blk(1.45, 1.7, 0.5, 0.1, 0.25), S.frame, [0, -3.15, -1.5]);
      this.label(kn, sten('danger', 1.05, 0.28, { face: '-z', tint: 3 }), S.frame, [0, -2.72, -1.765]);
      for (const dx of [-0.42, 0.42]) {
        A(kn, bell(0.36, 0.7), S.dark, [dx, -3.85, -1.55], [0.45, 0, 0]);
        A(kn, cyl(0.3, 0.3, 0.14, 14), S.frame, [dx, -3.82, -1.55], [0.45, 0, 0]);
        this.nozzles.push({ bone: kn, pos: [dx, -4.5, -1.85], rot: [0.45, 0, 0], r: 0.34, len: 3.2 });
      }

      // ================= 大腿（髖關節 y＝0）
      A(hp, cyl(0.62, 0.58, 4.2), S.frame, [0, -2.1, 0]);
      A(hp, taper(blk(1.5, 3.2, 1.6, 0.25, 0.4), 1.05, 1.05, 0.9, 0.9), S.frame, [0, -2.2, 0]);
      A(hp, ribs(-3.55, -3.85, 2, 0.66, 0.08, 16), S.dark);
      const th = PL(hp, 'z', [[-0.7, -1.6], [0.7, -1.6], [0.94, -0.7], [0.98, 1.0], [0.75, 1.55], [-0.75, 1.55], [-0.98, 1.0], [-0.94, -0.7]], 0.34, { bev: 0.07, nx: 7, ny: 8, bx: 1.25, by: 10 }, S.main, [0, -2.1, 0.97]);
      th.put(sten('lift', 0.34, 0.34, { tint: 2 }), 0.52, -1.2);
      PL(hp, 'z', [[-0.45, -0.35], [0.45, -0.35], [0.52, 0.35], [-0.52, 0.35]], 0.1, { bev: 0.03, nx: 4, ny: 3, bx: 1.25, by: 10, cv: -0.7 }, S.second, [0, -1.4, 0.97 + 0.22]);
      A(hp, merge([[-0.6, -1.3], [0.6, -1.3], [-0.55, -3.3], [0.55, -3.3]].map(([x, y]) => at(nut(0.05), [x, y, 1.18 - (x * x) / 2.5], [Math.PI / 2, Math.atan(x / 1.25), 0]))), S.frame);
      for (const side of [-1, 1]) {
        const ts = PL(hp, side > 0 ? 'x' : '-x', [[-0.85, -1.55], [0.9, -1.55], [1.0, 0.9], [0.7, 1.45], [-0.8, 1.45], [-0.95, 0.9]], 0.26, { bev: 0.06, nx: 6, ny: 7, bx: 2.5, by: 10, cu: 0.05 }, S.main, [side * 0.95, -2.1, 0]);
        if (side === sx) {
          ts.put(sten('xg01', 1.3, 0.16, { tint: 2, seg: 4 }), 0.05, -1.05);
          PL(hp, fx, [[-0.8, 1.0], [0.9, 1.0], [0.95, 1.12], [-0.85, 1.12]], 0.07, { bev: 0.02, nx: 4, ny: 1, bx: 2.5, by: 10, cu: 0.05 }, S.accent, [side * (0.95 + 0.165), -2.1, 0]);
        }
      }
      PL(hp, '-z', [[-0.75, -1.3], [0.75, -1.3], [0.82, 0.9], [-0.82, 0.9]], 0.24, { bev: 0.05, nx: 5, ny: 6, bx: 1.3 }, S.second, [0, -2.3, -0.95]);
      this.piston(hp, [sx * 1.2, -0.95, -0.7], [sx * 1.2, -3.55, -0.55], 0.12, S);
      A(hp, sph(0.85), S.frame);
    }
    // ================= 腰
    const pv = b.pelvis;
    A(pv, blk(3.0, 1.2, 2.3, 0.1), S.frame, [0, -0.1, 0]);
    A(pv, taper(blk(3.9, 0.9, 2.5, 0.2, 0.35), 1.02, 1.02, 0.95, 0.96), S.frame, [0, 0.35, 0]);
    A(pv, prof([[1.25, 0.1], [1.42, -0.55], [0.8, -1.45], [-0.6, -1.3], [-0.9, 0.1]], 1.35, 0.12), S.second);
    PL(pv, 'z', [[-0.35, -0.55], [0.35, -0.55], [0.42, 0.15], [-0.42, 0.15]], 0.16, { bev: 0.04, nx: 3, ny: 3, bx: 1.5 }, S.accent, [0, -0.45, 1.52], [-0.3, 0, 0]);
    // 腰帶：一片包覆的曲面板＋金色中央扣
    const belt = PL(pv, 'z', [[-2.0, -0.42], [2.0, -0.42], [2.1, 0.42], [-2.1, 0.42]], 0.3, { bev: 0.07, nx: 10, ny: 3, bx: 2.2 }, S.main, [0, 0.38, 1.5]);
    belt.put(sten('xg01', 1.5, 0.18, { tint: 2, seg: 6 }), -0.95, 0.05);
    PL(pv, 'z', [[-0.45, -0.28], [0.45, -0.28], [0.5, 0.28], [-0.5, 0.28]], 0.12, { bev: 0.03, nx: 4, ny: 2, bx: 2.2 }, S.yellow, [0, 0.38, 1.5 + 0.21]);
    A(pv, merge([-1.6, -1.05, 1.05, 1.6].map((x) => at(nut(0.055), [x, 0.6, 1.65 - (x * x) / 4.4 + 0.01], [Math.PI / 2, Math.atan(x / 2.2), 0]))), S.frame);
    for (const sx of [-1, 1]) {
      // 前裙甲（外層白、內層深藍）＋鉸鏈
      const fo = [[-0.8, -2.2], [0.7, -2.05], [0.88, 0.35], [-0.84, 0.42]].map(([x, y]) => [x * sx, y]);
      PL(pv, 'z', fo.map(([x, y]) => [x * 1.06, y - 0.04]), 0.18, { bev: 0.04, nx: 5, ny: 6, bx: 3.0, cu: -sx * 0.95 }, S.second, [sx * 0.95, -0.35, 1.5], [-0.1, 0, 0]);
      const fs = PL(pv, 'z', fo, 0.24, { bev: 0.06, nx: 5, ny: 6, bx: 3.0, cu: -sx * 0.95 }, S.main, [sx * 0.95, -0.35, 1.68], [-0.1, 0, 0]);
      fs.put(sten('hazard', 1.2, 0.14, { tint: 5, seg: 4 }), sx * -0.02, -1.95);
      A(pv, cyl(0.19, 0.19, 1.5, 12), S.frame, [sx * 0.95, 0.06, 1.55], [0, 0, Math.PI / 2]);
      // 側裙甲＋姿態噴嘴
      PL(pv, sx > 0 ? 'x' : '-x', [[-1.05, -1.95], [1.0, -1.95], [1.12, 0.35], [-1.15, 0.35]], 0.3, { bev: 0.07, nx: 6, ny: 6, bx: 4 }, S.main, [sx * 2.2, -0.15, 0], [0, 0, sx * 0.12]);
      A(pv, blk(1.2, 1.0, 1.2, 0.1), S.frame, [sx * 1.7, -0.1, 0]);
      for (const z of [-0.45, 0.45]) {
        A(pv, bell(0.17, 0.32), S.dark, [sx * 2.5, -2.0, z], [0, 0, sx * 0.12]);
        A(pv, cyl(0.14, 0.14, 0.12, 10), S.frame, [sx * 2.5, -1.96, z], [0, 0, sx * 0.12]);
      }
      A(pv, cyl(0.24, 0.24, 1.3, 12), S.frame, [sx * 2.2, 0.45, 0], [Math.PI / 2, 0, 0]);
    }
    const rs = PL(pv, '-z', [[-1.3, -1.8], [1.3, -1.8], [1.42, 0.4], [-1.42, 0.4]], 0.3, { bev: 0.07, nx: 6, ny: 6, bx: 3 }, S.main, [0, -0.05, -1.45]);
    rs.put(sten('caution', 1.0, 0.25, { tint: 2, seg: 4 }), 0, -1.35);
    this.vent(pv, 1.4, 0.45, 3, S, [0, -0.7, -1.66], [0, Math.PI, 0]);

    // ================= 胸：駕駛艙艙門在胸口正中（上緣鉸鏈往外上掀）
    const t = b.torso;
    const chestZ = (x, y) => 2.236 - (x * x) / 7 - ((y - 3.3) ** 2) / 12;   // 胸甲正面
    const onChest = (x, y, d = 0) => ({ pos: [x, y, chestZ(x, y) + d], rot: [(3.3 - y) / 6, Math.atan(x / 3.5), 0] });
    A(t, blk(2.6, 1.5, 2.3, 0.15), S.frame, [0, 0.6, 0]);
    A(t, ribs(0.25, 0.95, 3, 1.25, 0.12), S.dark);
    A(t, taper(blk(3.0, 1.3, 2.6, 0.2, 0.4), 1.08, 1.05), S.frame, [0, 1.35, 0.1]);
    // 胴體（深藍）：左右兩塊正面跟著胸甲彎，中間挖出駕駛艙凹槽（y 2.1～4.2、深到 z 0.45）
    const torsoOut = [[1.5, 0.35], [1.85, 2.4], [1.6, 3.25], [-1.3, 3.4], [-1.75, 1.9], [-1.5, 0.35]];
    for (const side of [-1, 1]) A(t, bendFront(taper(prof(torsoOut, 1.6, 0.22).translate(side * 1.6, 0, 0), 1.1, 1, 0.82, 1), 3.5), S.frame, [0, 1.5, 0]);
    A(t, taper(prof([[1.5, 0.35], [1.543, 0.6], [0.45, 0.6], [0.45, 2.7], [1.76, 2.7], [1.6, 3.25], [-1.3, 3.4], [-1.75, 1.9], [-1.5, 0.35]], 1.6, 0.12), 1.1, 1, 0.82, 1), S.frame, [0, 1.5, 0]);
    // 腹部分段裝甲（三片上下交疊）
    for (const [y, z] of [[1.86, 1.62], [1.42, 1.53], [0.98, 1.44]]) PL(t, 'z', [[-1.45, -0.24], [1.45, -0.24], [1.58, 0.24], [-1.58, 0.24]], 0.22, { bev: 0.05, nx: 8, ny: 2, bx: 2.4 }, S.second, [0, y, z], [-0.14, 0, 0]);
    // 左右胸甲＋上層深藍疊板＋紅色識別線
    for (const side of [-1, 1]) {
      const M = (pts) => pts.map(([x, y]) => [x * side, y]);
      const cp = PL(t, 'z', M([[0.9, 2.05], [1.9, 2.0], [2.45, 2.75], [2.52, 3.9], [2.2, 4.72], [0.95, 4.78]]), 0.34, { bev: 0.08, nx: 8, ny: 10, bx: 3.5, by: 6, cv: 3.3 }, S.main, [0, 0, 2.066]);
      PL(t, 'z', M([[1.08, 3.66], [2.12, 3.7], [2.32, 4.12], [2.05, 4.6], [1.08, 4.62]]), 0.14, { bev: 0.04, nx: 6, ny: 4, bx: 3.5, by: 6, cv: 3.3 }, S.main, [0, 0, 2.306]);
      PL(t, 'z', M([[1.08, 4.62], [2.05, 4.6], [2.02, 4.66], [1.08, 4.68]]), 0.14, { bev: 0.02, nx: 6, ny: 1, bx: 3.5, by: 6, cv: 3.3 }, S.second, [0, 0, 2.306]);
      PL(t, 'z', M([[1.1, 3.48], [2.2, 3.5], [2.24, 3.58], [1.1, 3.58]]), 0.07, { bev: 0.02, nx: 6, ny: 1, bx: 3.5, by: 6, cv: 3.3 }, S.accent, [0, 0, 2.271]);
      if (side < 0) {
        cp.put(sten('rescue', 0.5, 0.25, { tint: 4, seg: 3 }), -1.18, 2.25);
        // 緊急開艙拉桿：黃黑框凹槽＋T 字把手
        const e = onChest(-1.7, 2.25, 0.0);
        this.label(t, sten('hazard', 0.5, 0.38, { tint: 5 }), S.main, [e.pos[0], e.pos[1], e.pos[2] + 0.012], e.rot);
        A(t, blk(0.36, 0.26, 0.08, 0.02), S.dark, [e.pos[0], e.pos[1], e.pos[2] + 0.02], e.rot);
        A(t, at(handle(0.24, 0.1, 0.03), [0, 0, 0], [0, 0, 0]), S.yellow, [e.pos[0], e.pos[1], e.pos[2] + 0.04], e.rot);
      } else {
        cp.put(sten('caution', 0.7, 0.17, { tint: 2, seg: 3 }), 1.55, 2.35);
      }
      // 胸口進氣口（金色外框、暗底、葉片）
      const v = onChest(side * 1.62, 2.95, 0.08);
      A(t, merge([at(blk(1.0, 0.13, 0.26, 0.04), [0, 0.37, 0]), at(blk(1.0, 0.13, 0.26, 0.04), [0, -0.37, 0]), at(blk(0.13, 0.62, 0.26, 0.04), [0.44, 0, 0]), at(blk(0.13, 0.62, 0.26, 0.04), [-0.44, 0, 0])]), S.yellow, v.pos, v.rot);
      A(t, blk(0.78, 0.64, 0.1, 0.02), S.dark, v.pos, v.rot);
      A(t, merge(Array.from({ length: 5 }, (_, k) => at(blk(0.76, 0.05, 0.14, 0.01), [0, -0.26 + k * 0.13, 0.06], [-0.5, 0, 0]))), S.frame, v.pos, v.rot);
      // 螺帽、艙門旁的扶手
      A(t, merge([[1.25, 3.92, 0.15], [1.95, 3.95, 0.15], [1.25, 4.4, 0.15], [1.95, 4.38, 0.15], [2.36, 2.9, 0.01]].map(([x, y, d]) => { const q = onChest(side * x, y, d); return at(nut(0.055), q.pos, [q.rot[0] + Math.PI / 2, q.rot[1], 0]); })), S.frame);
      const hd = onChest(side * 1.0, 3.2, 0.0);
      A(t, at(handle(1.0, 0.14, 0.04), [0, 0, 0], [0, 0, Math.PI / 2]), S.frame, hd.pos, hd.rot);
      // 側胴裝甲＋散熱百葉；肩關節座
      const sp = PL(t, side > 0 ? 'x' : '-x', [[-1.25, 2.1], [1.05, 2.15], [1.25, 3.2], [1.0, 4.3], [-1.1, 4.35], [-1.4, 3.2]], 0.3, { bev: 0.07, nx: 7, ny: 7, bx: 3, by: 6, cu: -0.1, cv: 3.2 }, S.main, [side * 2.38, 0, 0]);
      sp.put(sten('lift', 0.4, 0.4, { tint: 2 }), 0.55, 3.75);
      this.vent(t, 1.2, 0.7, 5, S, [side * 2.53, 2.7, -0.35], [0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
      A(t, cyl(0.72, 0.78, 0.5, 18), S.frame, [side * 2.55, 3.95, -0.05], [0, 0, Math.PI / 2]);
    }
    // 艙內：暗色內襯、座椅（坐墊、椅背、頭枕、側翼）、操縱桿、側控台、踏板、骨架
    A(t, blk(1.5, 2.0, 0.08, 0.02), S.dark, [0, 3.15, 0.5]);
    A(t, blk(1.3, 0.1, 1.3, 0.03), S.frame, [0, 2.17, 1.15]);
    A(t, blk(1.45, 0.1, 1.3, 0.03), S.dark, [0, 4.12, 1.15]);
    A(t, blk(0.66, 0.9, 0.16, 0.07), S.dark, [0, 2.97, 0.68], [-0.18, 0, 0]);
    A(t, blk(0.4, 0.3, 0.14, 0.06), S.dark, [0, 3.62, 0.6], [-0.18, 0, 0]);
    A(t, blk(0.68, 0.14, 0.6, 0.05), S.dark, [0, 2.46, 1.0]);
    for (const side of [-1, 1]) {
      A(t, blk(0.1, 0.8, 0.3, 0.04), S.second, [side * 0.37, 2.95, 0.74], [-0.18, side * -0.35, 0]);
      A(t, blk(0.16, 0.42, 0.62, 0.03), S.frame, [side * 0.52, 2.62, 1.05]);
      A(t, rod([side * 0.52, 2.83, 1.2], [side * 0.5, 3.05, 1.26], 0.035, 0.035, 6), S.dark);
      A(t, blk(0.08, 0.14, 0.08, 0.02), S.dark, [side * 0.5, 3.1, 1.27]);
      A(t, sph(0.03, 6, 4), S.accent, [side * 0.5, 3.18, 1.29]);
      A(t, blk(0.06, 1.9, 0.1, 0.02), S.frame, [side * 0.72, 3.15, 0.55]);
      A(t, blk(0.2, 0.06, 0.34, 0.02), S.frame, [side * 0.22, 2.24, 1.5], [0.35, 0, 0]);
    }
    // 登艙踏板（防滑條）
    A(t, blk(1.2, 0.08, 0.38, 0.02), S.frame, [0, 2.04, 1.95]);
    this.label(t, sten('hazard', 1.1, 0.07, { tint: 5 }), S.frame, [0, 2.04, 2.145]);
    this.cockpitLocal = new THREE.Vector3(0, 3.15, 1.75);
    // 艙內螢幕光（艙門關著時隱藏）
    const scr = mergeGeometries([at(new THREE.PlaneGeometry(1.05, 0.32), [0, 3.72, 0.55]), at(new THREE.PlaneGeometry(0.22, 0.55), [-0.62, 3.25, 0.9], [0, 0.9, 0]), at(new THREE.PlaneGeometry(0.22, 0.55), [0.62, 3.25, 0.9], [0, -0.9, 0])]);
    this.cockpitGlow = new THREE.Mesh(scr, glow(0.22, 0.95, 1.35));
    this.cockpitGlow.userData.noAO = true;
    this.cockpitGlow.visible = false;
    t.add(this.cockpitGlow);
    // 艙門：pivot 在上緣鉸鏈 (0, 4.2, 1.95)；rotation.x 往負的方向＝往外上掀（-1.5 約水平）
    const H = new THREE.Group();
    H.name = 'hatch';
    H.position.set(0, 4.2, 1.95);
    t.add(H);
    this.hatch = H; this.hatchAxis = -1.5;
    const hc = { bx: 3.5, by: 6, cv: -0.9 };
    const hp0 = PL(H, 'z', [[-0.8, -2.1], [0.8, -2.1], [0.84, -0.3], [0.66, -0.02], [-0.66, -0.02], [-0.84, -0.3]], 0.3, { bev: 0.07, nx: 7, ny: 8, ...hc }, S.second, [0, 0, 0.1]);
    hp0.put(sten('xg01', 1.1, 0.13, { tint: 1, seg: 4 }), 0, -0.3);
    hp0.put(sten('caution', 0.5, 0.12, { tint: 3, seg: 2 }), -0.48, -1.72);
    hp0.put(sten('rescue', 0.44, 0.22, { tint: 4, seg: 2 }), 0.5, -1.7);
    PL(H, 'z', [[-0.28, -1.85], [0.28, -1.85], [0.36, -0.95], [0.16, -0.42], [-0.16, -0.42], [-0.36, -0.95]], 0.12, { bev: 0.03, nx: 3, ny: 5, ...hc }, S.accent, [0, 0, 0.1 + 0.21]);
    A(H, blk(1.5, 1.9, 0.06, 0.02), S.frame, [0, -1.06, -0.09]);
    A(H, at(handle(0.36, 0.12, 0.035), [0, -1.3, -0.12], [0, Math.PI, 0]), S.frame);
    for (const side of [-1, 1]) {
      A(H, cyl(0.12, 0.12, 0.34, 12), S.frame, [side * 0.55, 0.0, 0.0], [0, 0, Math.PI / 2]);
      // 鉸鏈臂：從鉸鏈沿艙門兩側往下的補強條
      A(H, blk(0.12, 1.2, 0.1, 0.03), S.frame, [side * 0.7, -0.55, 0.29 - 0.08], [0.1, 0, 0]);
      A(H, blk(0.26, 0.18, 0.12, 0.03), S.yellow, [side * 0.6, -1.95, 0.27]);
      A(H, merge([-0.35, -1.25].map((y) => at(nut(0.045), [side * 0.72, y, 0.26 - 0.1 * 0], [Math.PI / 2, 0, 0]))), S.frame);
    }
    A(H, cyl(0.12, 0.12, 0.4, 12), S.frame, [0, 0.0, 0.0], [0, 0, Math.PI / 2]);
    A(H, at(handle(0.34, 0.1, 0.03), [0, -1.98, 0.27]), S.frame);
    // 領口裝甲（深藍、往後傾）＋探照燈
    A(t, lathe([[0.72, 4.62], [1.02, 4.68], [1.14, 4.92], [1.02, 5.22], [0.74, 5.28]], 20), S.second, [0, 0, 0.2]);
    // 肩頸護甲（左右兩片往肩膀斜下的曲面板＋深藍疊板）
    for (const side of [-1, 1]) {
      const yk = PL(t, 'y', [[-0.82, -1.42], [0.68, -1.47], [0.83, 1.13], [-0.77, 1.48]].map(([x, z]) => [x * side, z]), 0.3, { bev: 0.07, nx: 7, ny: 7, bx: 2.5, by: 4 }, S.main, [side * 1.62, 5.1, 0.07], [0, 0, -side * 0.22]);
      yk.put(sten('lift', 0.36, 0.36, { tint: 2 }), side * 0.2, -0.9);
      PL(t, 'y', [[-0.5, -0.9], [0.4, -0.95], [0.5, 0.75], [-0.46, 0.95]].map(([x, z]) => [x * side, z]), 0.1, { bev: 0.03, nx: 4, ny: 4, bx: 2.5, by: 4 }, S.second, [side * 1.62, 5.1 + 0.19, 0.07], [0, 0, -side * 0.22]);
    }
    PL(t, 'z', [[-1.55, -0.3], [1.55, -0.3], [1.8, 0.3], [-1.8, 0.3]], 0.36, { bev: 0.08, nx: 8, ny: 2, bx: 2.3 }, S.second, [0, 4.78, 1.52], [-0.45, 0, 0]);
    for (const side of [-1, 1]) {
      A(t, cyl(0.17, 0.2, 0.22, 12), S.frame, [side * 1.1, 4.62, 1.8], [Math.PI / 2 - 0.45, 0, 0]);
      A(t, cyl(0.14, 0.14, 0.03, 12), GLASS, [side * 1.1, 4.67, 1.9], [Math.PI / 2 - 0.45, 0, 0]);
      this.vent(t, 0.9, 0.22, 3, S, [side * 1.5, 5.21, -0.3], [-Math.PI / 2, 0, 0]);
    }
    A(t, merge([-1.2, -0.6, 0.6, 1.2].map((x) => at(nut(0.05), [x, 4.9, 1.6], [Math.PI / 2 - 0.45, 0, 0]))), S.frame);
    A(t, cyl(0.6, 0.7, 0.6), S.frame, [0, 5.0, 0.3]);
    A(t, ribs(5.12, 5.3, 2, 0.7, 0.06), S.dark, [0, 0, 0.3]);
    for (const side of [-1, 1]) A(t, hose([[side * 0.5, 5.25, -0.25], [side * 0.62, 5.05, -0.7], [side * 0.9, 4.95, -1.3]], 0.1, 6), S.dark);

    // ================= 背包
    const bk = b.back;
    A(bk, prof([[-1.5, 1.2], [-2.95, 1.35], [-3.12, 2.4], [-3.05, 4.05], [-2.75, 4.55], [-1.5, 4.62]], 3.0, 0.22), S.main);
    const rc = PL(bk, '-z', [[-1.3, -1.1], [1.3, -1.1], [1.4, 0.85], [1.1, 1.25], [-1.1, 1.25], [-1.4, 0.85]], 0.2, { bev: 0.05, nx: 7, ny: 6, bx: 3, by: 5 }, S.second, [0, 2.95, -3.2]);
    rc.put(sten('danger', 1.3, 0.34, { tint: 4, seg: 4 }), 0, 0.55);
    rc.put(sten('fuel', 1.3, 0.1, { tint: 1, seg: 4 }), 0, 0.15);
    A(bk, merge([[-1.15, 2.1], [1.15, 2.1], [-1.1, 3.95], [1.1, 3.95]].map(([x, y]) => at(nut(0.06), [x, y, -3.31 + (x * x) / 6], [Math.PI / 2, 0, 0]))), S.frame);
    A(bk, blk(2.3, 1.1, 0.6, 0.1, 0.2), S.frame, [0, 1.5, -2.95]);
    const glowG = [];
    for (const sx of [-1, 1]) {
      A(bk, bell(0.95, 1.5), S.dark, [sx * 0.85, 1.55, -3.0], [0.35, 0, 0]);
      A(bk, cyl(0.62, 0.62, 0.25), S.frame, [sx * 0.85, 1.6, -2.98], [0.35, 0, 0]);
      glowG.push(at(new THREE.CylinderGeometry(0.48, 0.48, 0.06, 16), [sx * 0.85, 0.25, -3.43], [0.35, 0, 0]));
      this.nozzles.push({ bone: bk, pos: [sx * 0.85, 0.1, -3.55], rot: [0.35, 0, 0], r: 0.9, len: 7 });
      A(bk, cyl(0.2, 0.2, 1.9), S.main, [sx * 1.0, 4.6, -2.4], [-0.5, 0, -sx * 0.35]);
      A(bk, cyl(0.24, 0.24, 0.35), S.accent, [sx * 1.33, 5.35, -2.0], [-0.5, 0, -sx * 0.35]);
      // 側面散熱鰭片
      A(bk, merge(Array.from({ length: 6 }, (_, k) => at(blk(0.3, 1.3, 0.06, 0.012), [0, 0, -0.3 + k * 0.12]))), S.frame, [sx * 1.62, 2.8, -2.3]);
      A(bk, blk(0.12, 1.45, 0.8, 0.03), S.second, [sx * 1.5, 2.8, -2.3]);
      A(bk, pipe([[sx * 1.55, 1.9, -2.9], [sx * 1.4, 1.55, -3.1], [sx * 1.05, 1.6, -3.1]], 0.08), S.frame);
    }
    A(bk, cyl(0.06, 0.08, 0.2, 8), S.frame, [-1.2, 4.66, -2.0]);
    A(bk, rod([-1.2, 4.75, -2.0], [-1.35, 7.2, -2.6], 0.03, 0.012, 5), S.dark);
    this.addGlow(bk, mergeGeometries(glowG), [0.12, 1.6, 3.0]);

    // ================= 頭：圓頂頭盔＋護目鏡＋感測冠＋後掠雙刀型天線
    const h = b.head;
    A(h, cyl(0.45, 0.55, 0.7, 16), S.frame, [0, 0.25, 0]);
    A(h, ribs(-0.02, 0.3, 3, 0.6, 0.06, 16), S.dark);
    A(h, lathe([[0.001, 1.72], [0.35, 1.7], [0.6, 1.58], [0.76, 1.35], [0.82, 1.0], [0.78, 0.62], [0.6, 0.36], [0.001, 0.3]], 22), S.main, [0, 0, -0.05], [0, 0, 0], [1, 1, 1.15]);
    // 護目鏡：暗色玻璃帶＋上方眉甲
    A(h, prep(new THREE.CylinderGeometry(0.835, 0.83, 0.22, 24, 1, true, -1.15, 2.3)), GLASS, [0, 1.02, -0.05], [0, 0, 0], [1, 1, 1.15]);
    PL(h, 'z', [[-0.74, -0.13], [0.74, -0.13], [0.62, 0.18], [-0.62, 0.18]], 0.16, { bev: 0.04, nx: 6, ny: 2, bx: 0.95 }, S.main, [0, 1.24, 0.82], [-0.35, 0, 0]);
    // 面罩（下巴）＋散熱縫＋紅色下巴
    PL(h, 'z', [[-0.5, -0.42], [0.5, -0.42], [0.66, 0.05], [0.55, 0.2], [-0.55, 0.2], [-0.66, 0.05]], 0.2, { bev: 0.05, nx: 6, ny: 4, bx: 0.8 }, S.main, [0, 0.72, 0.84], [0.18, 0, 0]);
    for (const x of [-0.24, -0.12, 0.12, 0.24]) A(h, blk(0.05, 0.26, 0.05, 0.01), S.dark, [x, 0.68, 0.94], [0.18, 0, 0]);
    A(h, blk(0.4, 0.14, 0.2, 0.04), S.accent, [0, 0.36, 0.86], [0.3, 0, 0]);
    for (const sx of [-1, 1]) {
      // 頰甲（深藍）＋耳部感測器
      PL(h, sx > 0 ? 'x' : '-x', [[-0.5, 0.4], [0.55, 0.45], [0.7, 1.02], [0.2, 1.25], [-0.55, 1.2]], 0.14, { bev: 0.035, nx: 5, ny: 4, bx: 1.0 }, S.second, [sx * 0.8, 0, 0]);
      A(h, cyl(0.25, 0.27, 0.12, 16), S.frame, [sx * 0.92, 0.85, -0.05], [0, 0, Math.PI / 2]);
      A(h, cyl(0.14, 0.14, 0.06, 14), GLASS, [sx * 0.99, 0.85, -0.05], [0, 0, Math.PI / 2]);
      this.nutRing(h, [sx * 0.98, 0.85, -0.05], 0.2, 4, S, 'x', 0.03, Math.PI / 4);
      // 太陽穴火神砲
      A(h, cyl(0.075, 0.075, 0.34, 10), S.frame, [sx * 0.62, 1.25, 0.75], [Math.PI / 2, 0, 0]);
      A(h, cyl(0.045, 0.045, 0.04, 8), S.dark, [sx * 0.62, 1.25, 0.93], [Math.PI / 2, 0, 0]);
      // 後掠雙刀型天線（金色）
      A(h, blade([[0, 0], [0.12, 0.14], [1.5, 1.1], [1.62, 1.04], [0.3, -0.04]].map(([x, y]) => [x * sx, y]), 0.1, 0.02), S.yellow, [0, 1.42, 0.78], [-0.55, 0, 0]);
      A(h, blk(0.24, 0.14, 0.16, 0.03), S.yellow, [sx * 0.16, 1.44, 0.78]);
      for (let k = 0; k < 3; k++) A(h, blk(0.04, 0.025, 0.45, 0.006), S.dark, [sx * (0.3 + k * 0.09), 1.67, -0.25]);
    }
    // 感測冠（紅）＋主攝影機鏡頭；眼睛＋主鏡頭發光（同一個網格）
    A(h, prof([[0.2, 1.52], [0.95, 1.4], [1.02, 1.52], [0.6, 1.8], [0.0, 1.86]], 0.14, 0.03), S.accent);
    A(h, cyl(0.07, 0.07, 0.08, 12), S.frame, [0, 1.47, 0.98], [Math.PI / 2 - 0.2, 0, 0]);
    const eyeG = [-1, 1].map((sx) => blade([[0.05, -0.04], [0.36, -0.02], [0.33, 0.05], [0.04, 0.04]].map(([x, y]) => [x * sx, y]), 0.03, 0.01));
    eyeG.push(at(prep(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 12)), [0, 0.45, 0.065], [Math.PI / 2 - 0.2, 0, 0]));
    this.addGlow(h, mergeGeometries(eyeG), S.eye, [0, 1.02, 0.965]);
    A(h, blk(0.5, 0.34, 0.3, 0.06), S.second, [0, 1.2, -0.98]);
    A(h, cyl(0.07, 0.07, 0.05, 10), GLASS, [0, 1.2, -1.14], [Math.PI / 2, 0, 0]);
    for (const sx of [-1, 1]) A(h, rod([sx * 0.2, 1.35, -0.95], [sx * 0.32, 2.05, -1.35], 0.03, 0.012, 5), S.frame);

    // ================= 手臂
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const sh = b['shoulder' + n], el = b['elbow' + n];
      const dx = sx > 0 ? 'x' : '-x';
      A(sh, sph(0.9), S.frame);
      // 肩甲：外側主殼（前後、上下雙向彎）＋頂蓋往肩頸斜下＋下方兩片深藍疊片（lames）＋紅線
      const po = PL(sh, dx, [[-1.3, -0.55], [1.25, -0.55], [1.4, 0.55], [1.0, 1.3], [-1.0, 1.35], [-1.4, 0.55]], 0.34, { bev: 0.08, nx: 8, ny: 6, bx: 1.6, by: 2.0, cv: 0.35 }, S.main, [sx * 1.35, 0.25, 0]);
      po.put(digits('01', 0.46, { tint: 2 }), 0.4, 0.5);
      po.put(sten('xg01', 1.1, 0.14, { tint: 2, seg: 5 }), 0.1, 0.05);
      PL(sh, dx, [[-1.3, -0.52], [1.25, -0.52], [1.3, -0.38], [-1.32, -0.38]], 0.07, { bev: 0.02, nx: 8, ny: 1, bx: 1.6, by: 2.0, cv: 0.35 }, S.accent, [sx * (1.35 + 0.19), 0.25, 0]);
      PL(sh, 'y', [[-0.8, -1.25], [0.8, -1.3], [0.9, 1.25], [-0.85, 1.3]].map(([x, z]) => [x * sx, z]), 0.3, { bev: 0.07, nx: 6, ny: 6, bx: 2.0, by: 3 }, S.main, [sx * 0.62, 1.45, 0], [0, 0, -sx * 0.28]);
      PL(sh, 'y', [[-0.45, -0.9], [0.45, -0.95], [0.5, 0.9], [-0.47, 0.92]].map(([x, z]) => [x * sx, z]), 0.1, { bev: 0.03, nx: 4, ny: 4, bx: 2.0, by: 3 }, S.second, [sx * 0.62, 1.45 + 0.19, 0], [0, 0, -sx * 0.28]);
      for (const [y, x, w] of [[-0.62, 1.25, 1.15], [-1.12, 1.12, 1.05]]) PL(sh, dx, [[-w, -0.28], [w - 0.05, -0.28], [w + 0.05, 0.28], [-w - 0.05, 0.28]], 0.24, { bev: 0.06, nx: 6, ny: 2, bx: 1.3 }, S.second, [sx * x, y, 0], [0, 0, sx * 0.1]);
      A(sh, merge([[0.95, 1.0], [-0.95, 1.0], [0.95, -0.3], [-0.95, -0.3]].map(([z, y]) => at(nut(0.055), [sx * (1.52 + 0.01 - ((z * z) / 3.2 + ((y - 0.6) ** 2) / 4)), y, z], [0, 0, Math.PI / 2]))), S.frame);
      // 上臂：致動器核心＋外側包覆護甲＋前側油壓缸
      A(sh, cyl(0.55, 0.5, 2.2), S.frame, [0, -1.6, 0]);
      PL(sh, dx, [[-0.78, -2.55], [0.78, -2.55], [0.84, -1.0], [-0.84, -1.0]], 0.24, { bev: 0.06, nx: 6, ny: 4, bx: 0.95, cv: -1.8 }, S.main, [sx * 0.6, 0, 0]);
      this.piston(sh, [-sx * 0.25, -0.95, 0.62], [-sx * 0.25, -2.55, 0.6], 0.1, S);
      A(sh, ribs(-2.6, -2.75, 2, 0.58, 0.07, 16), S.dark);
      // 手肘＋前臂
      A(el, cyl(0.6, 0.6, 1.3), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const side of [-1, 1]) { A(el, cyl(0.38, 0.4, 0.1, 14), S.frame, [side * 0.7, 0, 0], [0, 0, Math.PI / 2]); this.nutRing(el, [side * 0.76, 0, 0], 0.27, 6, S, 'x', 0.045); }
      A(el, taper(cyl(0.55, 0.62, 2.6, 16), 0.9, 0.9, 1, 1), S.frame, [0, -1.6, 0]);
      PL(el, dx, [[-0.85, -2.75], [0.85, -2.75], [0.95, -1.2], [0.7, -0.35], [-0.7, -0.35], [-0.95, -1.2]], 0.3, { bev: 0.07, nx: 7, ny: 6, bx: 1.0, cv: -1.5 }, S.main, [sx * 0.62, 0, 0]);
      const fa = PL(el, 'z', [[-0.62, -2.75], [0.62, -2.75], [0.66, -0.55], [-0.66, -0.55]], 0.22, { bev: 0.05, nx: 5, ny: 5, bx: 1.1 }, S.main, [0, 0, 0.68]);
      fa.put(sten('hazard', 0.9, 0.12, { tint: 5, seg: 3 }), 0, -2.55);
      PL(el, 'z', [[-0.42, -1.2], [0.42, -1.2], [0.46, -0.7], [-0.46, -0.7]], 0.08, { bev: 0.02, nx: 4, ny: 2, bx: 1.1 }, S.accent, [0, 0, 0.68 + 0.15]);
      PL(el, '-z', [[-0.55, -2.6], [0.55, -2.6], [0.6, -0.6], [-0.6, -0.6]], 0.2, { bev: 0.05, nx: 5, ny: 5, bx: 1.1 }, S.second, [0, 0, -0.66]);
      this.piston(el, [-sx * 0.42, -0.35, -0.82], [-sx * 0.42, -2.45, -0.86], 0.1, S);
      A(el, cyl(0.62, 0.64, 0.24, 18), S.frame, [0, -2.9, 0]);
      A(el, blk(1.5, 0.36, 1.6, 0.12, 0.3), S.second, [0, -2.68, 0]);
      this.buildHand(b['hand' + n], S, sx);
    }
    // 步槍：主體、槍管護套（散熱孔）、瞄準鏡、彈匣、前握把、制退器
    const W = new THREE.Group();
    A(W, prof([[-0.3, 0.46], [3.0, 0.46], [3.2, 0.2], [3.1, -0.46], [-0.4, -0.46], [-0.55, 0.0]], 0.62, 0.1), S.weapon, [0, 0, 0]);
    A(W, blk(0.5, 0.5, 2.1, 0.1, 0.12), S.weapon, [0, 0.55, 0.9]);
    A(W, cyl(0.28, 0.3, 2.0, 16), S.weapon, [0, 0.05, 4.1], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 5; k++) A(W, blk(0.1, 0.05, 0.2, 0.01), S.dark, [0, 0.33, 3.35 + k * 0.33]);
    A(W, cyl(0.18, 0.2, 1.2), S.frame, [0, 0.05, 5.2], [Math.PI / 2, 0, 0]);
    A(W, blk(0.5, 0.5, 0.6, 0.08), S.weapon, [0, 0.05, 5.5]);
    for (const s of [-1, 1]) A(W, blk(0.04, 0.26, 0.1, 0.005), S.dark, [s * 0.255, 0.05, 5.5]);
    A(W, cyl(0.12, 0.12, 0.04, 12), S.dark, [0, 0.05, 5.81], [Math.PI / 2, 0, 0]);
    A(W, cyl(0.2, 0.2, 1.4, 14), S.frame, [0, 0.98, 1.4], [Math.PI / 2, 0, 0]);
    A(W, cyl(0.16, 0.16, 0.04, 12), GLASS, [0, 0.98, 2.11], [Math.PI / 2, 0, 0]);
    A(W, merge([at(blk(0.14, 0.24, 0.18, 0.02), [0, 0.78, 0.95]), at(blk(0.14, 0.24, 0.18, 0.02), [0, 0.78, 1.85])]), S.frame);
    A(W, blk(0.4, 1.3, 0.5, 0.06), S.frame, [0, -0.9, 0], [0.25, 0, 0]);
    A(W, blk(0.46, 1.0, 0.7, 0.08), S.weapon, [0, -0.85, 1.5], [0.12, 0, 0]);
    A(W, blk(0.3, 0.8, 0.3, 0.06), S.frame, [0, -0.7, 2.7], [-0.1, 0, 0]);
    A(W, prof([[0, 0.35], [-2.0, 0.2], [-2.2, -0.5], [-0.4, -0.45]], 0.5, 0.06), S.weapon, [0, 0, -1.6]);
    A(W, blk(0.08, 0.2, 1.6, 0.02), S.accent, [0.32, 0.18, 1.2]);
    this.label(W, sten('ammo', 0.9, 0.08, { face: 'x', tint: 1 }), S.weapon, [0.24, -0.85, 1.5], [0.12, 0, 0]);
    this.addGlow(W, cyl(0.12, 0.12, 0.06), [0.3, 4, 1.6], [0, 0.55, 1.97], [Math.PI / 2, 0, 0]);
    this.attachWeapon(W, new THREE.Vector3(0, 0.05, 5.7));
    // 盾（左前臂外側）：細分彎曲的主板＋深藍內層＋紅色識別＋螺帽
    const SH = new THREE.Group();
    A(SH, bendPlate(gridPlate(0.3, 6.6, 3.0, 0.9, 10, 6), 5), S.main);
    A(SH, bendPlate(gridPlate(0.2, 5.4, 2.4, 0.7, 8, 5), 5), S.second, [0.18, 0, 0]);
    A(SH, bendPlate(gridPlate(0.1, 0.35, 2.4, 0.08, 1, 5), 5), S.accent, [0.26, 1.9, 0]);
    const lb = sten('xg01', 2.2, 0.26, { face: 'x', tint: 1, seg: 6 });
    lb.translate(0.3, -1.2, 0);
    this.label(SH, bendPlate(lb, 5), S.second);
    const sn = [];
    for (const y of [-2.9, 2.9]) for (const z of [-0.9, 0, 0.9]) { const th = z / 5, r = 0.15 + 5; sn.push(at(nut(0.07), [r * Math.cos(th) - 5, y, r * Math.sin(th)], [0, -th, Math.PI / 2])); }
    A(SH, merge(sn), S.frame);
    A(SH, blk(0.5, 1.2, 0.8, 0.08), S.frame, [-0.35, 0, 0]);
    SH.position.set(1.05, -1.5, 0.3);
    b.elbowL.add(SH);
    // 光劍（揮砍時才出現）
    this.saber = new THREE.Group();
    A(this.saber, cyl(0.2, 0.2, 1.4), S.frame);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 11, 12).translate(0, 6.2, 0), glow(9, 2.2, 5.5));
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 11.6, 12, 1, true).translate(0, 6.2, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 1.8), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.userData.noAO = halo.userData.noAO = true;
    this.saber.add(core, halo);
    this.saber.position.set(0, -0.9, 0.35);
    this.saber.rotation.x = Math.PI / 2;
    this.saber.visible = false;
    b.handL.add(this.saber);
    this.height = 19;
  }

  // 手：掌心骨架＋手背護甲＋三節手指（指節圓軸）＋拇指（握持姿勢）
  buildHand(hd, S, sx, lite = false) {
    const A = this.add.bind(this);
    A(hd, blk(1.0, 1.05, 0.85, 0.16, 0.2), S.frame, [0, -0.55, 0.05]);
    A(hd, blk(1.1, 0.35, 0.95, 0.1, 0.16), S.main, [0, -0.28, 0.05]);
    A(hd, blk(0.12, 0.7, 0.8, 0.04, 0.12), S.main, [sx * 0.52, -0.62, 0.05]);
    A(hd, cyl(0.1, 0.1, 1.0, 10), S.frame, [0, -1.02, 0.12], [0, 0, Math.PI / 2]);
    for (let k = 0; k < 4; k++) {
      const x = -0.36 + k * 0.24;
      A(hd, blk(0.2, 0.42, 0.34, 0.07, 0.08), S.dark, [x, -1.22, 0.24], [0.55, 0, 0]);
      if (!lite) A(hd, cyl(0.085, 0.085, 0.2, 8), S.frame, [x, -1.4, 0.42], [0, 0, Math.PI / 2]);
      A(hd, blk(0.19, 0.34, 0.3, 0.06, 0.07), S.dark, [x, -1.45, 0.6], [1.35, 0, 0]);
      if (!lite) A(hd, blk(0.17, 0.24, 0.26, 0.06, 0.07), S.dark, [x, -1.35, 0.84], [2.2, 0, 0]);
    }
    A(hd, blk(0.28, 0.55, 0.36, 0.08, 0.1), S.dark, [-sx * 0.55, -0.75, 0.4], [0.5, 0, sx * 0.3]);
    A(hd, blk(0.24, 0.36, 0.3, 0.07, 0.08), S.dark, [-sx * 0.5, -1.08, 0.66], [1.2, 0, sx * 0.2]);
  }

  // 武器在自身座標沿 +Z 建模、握把在 (0,-0.8,0)；轉到手上沿手臂方向
  attachWeapon(W, muzzle) {
    W.position.set(0, -0.9, 0.95);
    W.rotation.x = Math.PI / 2;
    this.bones.handR.add(W);
    this.weapon = W;
    this.muzzleLocal = muzzle;
  }

  decal(bone, tex, pos, rot, size) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false }));
    m.position.set(...pos); m.rotation.set(...rot);
    m.userData.noAO = true; m.userData.decal = true;
    bone.add(m);
    return m;
  }

  // 駕駛艙艙門：t＝0 關、1 全開（繞上緣鉸鏈、rotation.x＝hatchAxis·t，往外上掀）
  hatchOpen(t) {
    if (!this.hatch) return;
    t = THREE.MathUtils.clamp(t, 0, 1);
    this.hatch.rotation.x = this.hatchAxis * t;
    if (this.cockpitGlow) this.cockpitGlow.visible = t > 0.02;
  }

  // ======================= 單眼敵機 AGX-9 =======================
  buildGrunt(S, style) {
    const b = this.bones, A = this.add.bind(this);
    const heavy = style === 'heavy', ace = this.schemeKey === 'ace';
    this.units = ace ? ['01'] : UNITS;
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const ank = b['ankle' + n], kn = b['knee' + n], hp = b['hip' + n];
      const fx = sx > 0 ? 'x' : '-x';
      // ---- 腳掌
      const fz = 0.95;
      A(ank, prof([[-1.95, -0.95], [2.6, -0.95], [2.7, -0.58], [1.8, -0.12], [0.8, 0.42], [-0.95, 0.5], [-2.0, -0.15]].map(([z, y]) => [z * fz, y]), 2.45, 0.16), S.main);
      A(ank, prof([[1.5, -0.95], [2.8, -0.95], [2.82, -0.62], [1.72, -0.2]].map(([z, y]) => [z * fz, y]), 2.6, 0.1), S.second);
      for (const side of [-1, 1]) {
        A(ank, prof([[0.35, 0.42], [1.45, 0.08], [2.26, -0.48], [1.4, -0.28], [0.42, 0.12]], 0.76, 0.055), S.main, [side * 0.68, 0.04, 0]);
        A(ank, blk(0.17, 0.12, 1.2, 0.025), S.frame, [side * 1.1, 0.23, 0.78]);
        A(ank, merge([at(nut(0.06), [side * 0.68, 0.43, 0.5], [0.3, 0, 0]), at(nut(0.06), [side * 0.68, 0.18, 1.3], [0.4, 0, 0])]), S.frame);
        // 腳側面板（凹一層）＋螺帽
        A(ank, blk(0.06, 0.5, 0.9, 0.02), S.second, [side * 1.24, -0.55, 1.2]);
        A(ank, merge([0.85, 1.55].map((z) => at(nut(0.05), [side * 1.28, -0.55, z], [0, 0, Math.PI / 2]))), S.frame);
      }
      A(ank, blk(2.6, 0.2, 4.7, 0.06), S.sole, [0, -1.06, 0.35]);
      const lugs = [];
      for (let k = 0; k < 6; k++) for (const side of [-1, 1]) lugs.push(at(blk(0.62, 0.16, 0.52, 0.04, 0), [side * 0.92, -1.22, -1.62 + k * 0.82]));
      for (let k = 0; k < 5; k++) lugs.push(at(blk(0.62, 0.16, 0.52, 0.04, 0), [0, -1.22, -1.2 + k * 0.82]));
      A(ank, merge(lugs), S.sole);
      A(ank, prof([[-2.15, -0.96], [-1.2, -0.96], [-1.2, -0.05], [-1.9, -0.3]], 1.5, 0.1), S.frame);
      A(ank, cyl(0.72, 0.72, 1.9), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const s of [-1, 1]) {
        A(ank, blk(0.28, 1.3, 1.7, 0.08, 0.3), S.second, [s * 1.22, -0.1, -0.15]);
        A(ank, cyl(0.38, 0.4, 0.1, 16), S.frame, [s * 1.4, 0, 0], [0, 0, Math.PI / 2]);
        this.nutRing(ank, [s * 1.46, 0, 0], 0.27, 6, S, 'x', 0.05);
      }
      A(ank, cyl(0.2, 0.2, 2.72, 12), S.frame, [0, -0.72, 1.55], [0, 0, Math.PI / 2]);
      this.label(ank, sten('hazard', 1.5, 0.26, { tint: 5 }), S.second, [0, -0.785, 2.495]);
      // ---- 小腿（下寬）
      A(kn, cyl(0.55, 0.62, 3.6), S.frame, [0, -1.8, 0]);
      A(kn, taper(prof([[0.95, 0.12], [1.2, -1.2], [1.5, -2.9], [1.56, -3.9], [-1.62, -3.9], [-1.56, -2.5], [-1.2, -0.9], [-0.85, 0.18]], 1.9, 0.16), 0.84, 1, 1.15, 1), S.main);
      const PL = this.pl.bind(this);
      // 前脛甲：包覆的曲面板（往前下方傾）
      const sg = PL(kn, 'z', [[-0.75, -1.42], [0.75, -1.42], [0.85, -0.6], [0.66, 1.4], [-0.66, 1.4], [-0.85, -0.6]], 0.3, { bev: 0.07, nx: 5, ny: 6, bx: 1.3 }, S.second, [0, -2.2, 1.42], [-0.24, 0, 0]);
      sg.put(sten('caution', 0.8, 0.2, { tint: 3, seg: 3 }), 0, 0.85);
      A(kn, blk(0.13, 1.6, 1.5, 0.04), S.second, [sx * 1.08, -2.45, -0.15], [0, 0, sx * 0.09]);
      A(kn, merge([[-0.55, -1.85], [0.4, -1.85], [-0.55, -3.05], [0.4, -3.05]].map(([z, y]) => at(nut(0.055), [sx * (1.08 + 0.075) + sx * (-2.45 - y) * 0.09, y, z - 0.15], [0, 0, Math.PI / 2 + sx * 0.09]))), S.frame);
      this.label(kn, sten('hyd', 1.2, 0.13, { face: fx, tint: 1 }), S.second, [sx * (1.08 + 0.075), -2.45, -0.15], [0, 0, sx * 0.09]);
      A(kn, blk(1.75, 1.3, 0.5, 0.1), S.frame, [0, -3.05, -1.62]);
      for (let k = 0; k < 3; k++) A(kn, blk(1.7, 0.1, 0.16, 0.02), S.dark, [0, -2.85 - k * 0.24, -1.9]);
      this.label(kn, sten('hazard', 1.6, 0.14, { face: '-z', tint: 5 }), S.frame, [0, -2.62, -1.885]);
      for (const dx of [-0.45, 0.45]) {
        A(kn, bell(0.34, 0.65), S.dark, [dx, -3.55, -1.72], [0.5, 0, 0]);
        A(kn, cyl(0.29, 0.29, 0.12, 14), S.frame, [dx, -3.52, -1.72], [0.5, 0, 0]);
        this.nozzles.push({ bone: kn, pos: [dx, -4.15, -2.05], rot: [0.5, 0, 0], r: 0.32, len: 3 });
      }
      // 小腿背後兩根油壓缸
      for (const x of [-0.55, 0.55]) this.piston(kn, [x, -0.45, -1.22], [x, -2.28, -1.7], 0.12, S);
      // 內側散熱口
      this.vent(kn, 0.9, 0.7, 4, S, [-sx * 1.02, -2.2, -0.2], [0, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 0]);
      // 膝蓋外側到小腿推進器的管線
      A(kn, hose([[sx * 0.95, -0.35, -0.75], [sx * 1.15, -1.3, -1.2], [sx * 1.0, -2.35, -1.55]], 0.13, 5), S.dark);
      A(kn, prof([[0.55, 0.95], [1.45, 0.45], [1.45, -0.75], [0.95, -1.15], [0.45, -0.3]], 1.75, 0.14), S.second);
      A(kn, blade([[-0.72, 0.26], [0.72, 0.26], [0.88, -0.44], [0.54, -0.95], [-0.54, -0.95], [-0.88, -0.44]], 0.18, 0.05), S.main, [0, 0, 1.5]);
      A(kn, merge([-0.45, 0.45].map((x) => at(nut(0.06), [x, 0.0, 1.62], [Math.PI / 2, 0, 0]))), S.frame);
      for (const side of [-1, 1]) {
        for (const yy of [-1.4, -2.1, -2.8]) A(kn, bolt(0.085), S.frame, [side * (0.92 + (-yy - 1.4) * 0.07), yy, 1.14 + (-yy - 1.4) * 0.12], [Math.PI / 2, 0, 0]);
        A(kn, cyl(0.46, 0.48, 0.12, 16), S.frame, [side * 1.1, 0, 0], [0, 0, Math.PI / 2]);
        this.nutRing(kn, [side * 1.17, 0, 0], 0.33, 6, S, 'x', 0.055, 0.5);
      }
      if (heavy) {
        // 重裝：前脛追加一層附加裝甲＋螺帽
        const ap = PL(kn, 'z', [[-0.62, -1.1], [0.62, -1.1], [0.72, 0.5], [0.5, 0.95], [-0.5, 0.95], [-0.72, 0.5]], 0.22, { bev: 0.06, nx: 5, ny: 5, bx: 1.3 }, S.main, [0, -2.2, 1.42], [-0.24, 0, 0], [0, 0, 0.26]);
        ap.put(sten('warn', 0.34, 0.34, { tint: 5 }), 0, 0.1);
        A(kn, merge([[-0.48, 0.7], [0.48, 0.7], [-0.5, -0.85], [0.5, -0.85]].map(([x, y]) => at(nut(0.065), [x, y, 0.26 + 0.12 - (x * x) / 2.6], [Math.PI / 2, Math.atan(x / 1.3), 0]))), S.frame, [0, -2.2, 1.42], [-0.24, 0, 0]);
      }
      A(kn, cyl(0.78, 0.78, 2.0), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      A(kn, cyl(0.16, 0.16, 2.2), S.frame, [-sx * 0.72, -1.25, -1.0], [0.15, 0, 0]);
      // 膝關節外露骨架：左右連桿板＋前方小油壓缸
      for (const side of [-1, 1]) A(kn, prof([[0.55, 0.55], [0.7, -0.2], [0.3, -1.1], [-0.6, -1.0], [-0.75, -0.1], [-0.4, 0.6]], 0.14, 0.03), S.frame, [side * 0.98, 0, 0]);
      this.piston(kn, [sx * 0.62, 0.55, 0.75], [sx * 0.55, -0.9, 1.05], 0.08, S);
      // ---- 大腿：蛇腹護套＋前裝甲
      A(hp, cyl(0.62, 0.58, 3.8), S.frame, [0, -2.0, 0]);
      A(hp, ribs(-0.7, -3.3, 7, 0.8, 0.17, 12), S.dark);
      for (const side of [-1, 1]) A(hp, blk(0.16, 3.4, 0.36, 0.04), S.frame, [side * 0.62, -2.3, -0.55]);
      PL(hp, 'z', [[-0.72, -1.55], [0.72, -1.55], [0.85, 1.1], [0.6, 1.45], [-0.6, 1.45], [-0.85, 1.1]], 0.32, { bev: 0.07, nx: 5, ny: 6, bx: 1.1, by: 12 }, S.main, [0, -1.85, 0.95]);
      PL(hp, 'z', [[-0.5, -1.0], [0.5, -1.0], [0.58, 0.8], [-0.58, 0.8]], 0.12, { bev: 0.035, nx: 4, ny: 3, bx: 1.1, by: 12, cv: 0.1 }, S.second, [0, -1.95, 0.95 + 0.22]);
      A(hp, merge([[-0.42, -1.4], [0.42, -1.4], [-0.42, -2.6], [0.42, -2.6]].map(([x, y]) => at(nut(0.055), [x, y, 1.24 - (x * x) / 2.2], [Math.PI / 2, Math.atan(x / 1.1), 0]))), S.frame);
      this.piston(hp, [sx * 0.92, -0.85, -0.62], [sx * 0.92, -3.25, -0.8], 0.14, S);
      A(hp, blk(0.2, 1.7, 1.1, 0.05, 0.2), S.main, [sx * 1.1, -1.95, 0.35]);
      A(hp, merge([[-0.05, -1.3], [0.75, -1.3], [-0.05, -2.6], [0.75, -2.6]].map(([z, y]) => at(nut(0.05), [sx * 1.21, y, z], [0, 0, Math.PI / 2]))), S.frame);
      this.label(hp, digits('00', 0.5, { face: fx, tint: 1, variable: true }), S.main, [sx * 1.212, -1.95, 0.35]);
      // 大腿背面維修踏階（人的尺度：一格 0.45 m）
      A(hp, merge([0, 1, 2, 3].map((k) => at(handle(0.5, 0.16, 0.035), [0, -1.0 - k * 0.45, -1.36], [0, Math.PI, 0]))), S.frame);
      A(hp, prof([[-0.9, -0.4], [-1.2, -0.8], [-1.22, -2.5], [-0.98, -2.75], [-0.9, -2.6]], 1.3, 0.07), S.second);
      A(hp, sph(0.9, 14, 10), S.frame);
    }
    // ---- 腰
    const pv = b.pelvis;
    A(pv, blk(3.2, 1.3, 2.4, 0.1), S.frame, [0, -0.1, 0]);
    A(pv, taper(blk(4.5, 0.95, 3.3, 0.18, 0.3), 1.0, 1.0, 0.94, 0.95), S.second, [0, 0.55, 0]);
    A(pv, merge([-1.7, -0.9, 0.9, 1.7].map((x) => at(nut(0.065), [x, 0.55, 1.64], [Math.PI / 2, 0, 0]))), S.frame);
    A(pv, prof([[1.3, 0.2], [1.45, -0.55], [0.85, -1.35], [-0.6, -1.25], [-0.95, 0.2]], 1.35, 0.12), S.second, [0, -0.2, 0]);
    for (const sx of [-1, 1]) {
      const fsk = this.pl(pv, 'z', [[-0.95, -2.45], [0.95, -2.45], [1.02, 0.35], [-1.02, 0.35]], 0.3, { bev: 0.07, nx: 5, ny: 6, bx: 3, cu: -sx * 1.3 }, S.main, [sx * 1.3, 0.1, 1.72], [-0.07, 0, sx * 0.1]);
      this.pl(pv, 'z', [[-0.88, -0.07], [0.88, -0.07], [0.9, 0.07], [-0.9, 0.07]], 0.08, { bev: 0.02, nx: 5, ny: 1, bx: 3, cu: -sx * 1.3 }, S.accent, [sx * 1.3, 0.1, 1.72], [-0.07, 0, sx * 0.1], [0, -1.75, 0.17]);
      fsk.put(sten('hazard', 1.6, 0.12, { tint: 5, seg: 4 }), 0, -2.3);
      A(pv, merge([-0.55, 0.55].map((x) => at(nut(0.06), [x, 0.12, 0.16 - (x + sx * 1.3) ** 2 / 6], [Math.PI / 2, 0, 0]))), S.frame, [sx * 1.3, 0.1, 1.72], [-0.07, 0, sx * 0.1]);
      A(pv, cyl(0.2, 0.2, 1.7, 12), S.frame, [sx * 1.3, 0.5, 1.5], [0, 0, Math.PI / 2]);
      this.pl(pv, sx > 0 ? 'x' : '-x', [[-1.4, -2.1], [1.4, -2.1], [1.5, 0.5], [-1.5, 0.5]], 0.45, { bev: 0.08, nx: 6, ny: 5, bx: 3.5 }, S.main, [sx * 2.5, 0, 0], [0, 0, sx * 0.18]);
      const ssk = this.pl(pv, sx > 0 ? 'x' : '-x', [[-0.95, -1.55], [0.95, -1.55], [0.95, -0.05], [-0.95, -0.05]], 0.12, { bev: 0.03, nx: 5, ny: 3, bx: 3.5 }, S.second, [sx * 2.5, 0, 0], [0, 0, sx * 0.18], [sx * 0.27, 0, 0]);
      ssk.put(sten(heavy ? 'agx9h' : ace ? 'agx9c' : 'agx9', 1.5, heavy || ace ? 0.2 : 0.38, { tint: 1, seg: 4 }), 0, -0.8);
      A(pv, cyl(0.26, 0.26, 1.6, 12), S.frame, [sx * 2.35, 0.55, 0], [Math.PI / 2, 0, 0]);
      A(pv, blk(1.3, 1.0, 1.3, 0.1), S.frame, [sx * 1.9, -0.1, 0]);
    }
    const rsk = this.pl(pv, '-z', [[-1.5, -2.0], [1.5, -2.0], [1.55, 0.45], [-1.55, 0.45]], 0.5, { bev: 0.09, nx: 6, ny: 5, bx: 3 }, S.main, [0, 0, -1.7]);
    rsk.put(sten('caution', 1.5, 0.38, { tint: 3, seg: 4 }), 0, -0.55);
    // ---- 胴體
    const t = b.torso;
    A(t, blk(2.9, 1.6, 2.5, 0.15), S.frame, [0, 0.75, 0]);
    A(t, ribs(0.3, 1.2, 3, 1.35, 0.14, 14), S.dark);
    A(t, bendFront(taper(blk(4.6, 3.4, 3.3, 0.4, 0.8), 1.06, 1.0, 0.84, 0.92), 4.5), S.second, [0, 3.15, 0]);
    // 胸前主裝甲：一整片左右、上下都彎的曲面板
    const tc = { bx: 4.5, by: 7, cv: 3.2 };
    const zf = (x, y) => 1.95 - (x * x) / 9 - ((y - 3.2) ** 2) / 14;
    const onG = (x, y, d = 0) => ({ pos: [x, y, zf(x, y) + d], rot: [(3.2 - y) / 7, Math.atan(x / 4.5), 0] });
    this.pl(t, 'z', [[-1.95, 1.45], [1.95, 1.45], [2.35, 2.2], [2.45, 4.0], [2.05, 4.85], [-2.05, 4.85], [-2.45, 4.0], [-2.35, 2.2]], 0.42, { bev: 0.09, nx: 8, ny: 7, ...tc }, S.main, [0, 0, 1.74]);
    // 厚胸甲上的左右裝甲與腹部凹槽，避免整片矩形正面。
    A(t, blade([[-0.73, 1.55], [0.73, 1.55], [0.6, 3.02], [0.34, 3.3], [-0.34, 3.3], [-0.6, 3.02]], 0.18, 0.045), S.dark, [0, 0, 2.04]);
    for (let k = 0; k < 4; k++) A(t, blk(0.9, 0.075, 0.12, 0.02), S.frame, [0, 1.8 + k * 0.28, 2.18]);
    for (const sx of [-1, 1]) {
      const up = this.pl(t, 'z', [[0.45, 3.25], [2.2, 3.22], [2.48, 3.8], [2.06, 4.65], [0.76, 4.52], [0.54, 4.04]].map(([x, y]) => [sx * x, y]), 0.4, { bev: 0.09, nx: 6, ny: 5, ...tc }, S.second, [0, 0, 2.15]);
      if (sx > 0) up.put(digits('00', 0.62, { tint: 1, variable: true }), 1.42, 3.88);
      else up.put(sten('hound', 1.1, 0.26, { tint: 1, seg: 4 }), -1.42, 3.9);
      { const q = onG(sx * 1.55, 3.43, 0.44); A(t, blk(1.45, 0.11, 0.12, 0.025), S.frame, q.pos, [q.rot[0], q.rot[1], sx * 0.08]); }
      A(t, merge([0.95, 1.55, 2.0].map((x) => { const q = onG(sx * x, 4.35, 0.41); return at(bolt(0.09), q.pos, [q.rot[0] + Math.PI / 2, q.rot[1], 0]); })), S.frame);
      { const q = onG(sx * 1.35, 2.15, 0.0); A(t, blk(0.95, 1.0, 0.3, 0.06), S.dark, q.pos, q.rot); A(t, merge(Array.from({ length: 4 }, (_, k) => at(blk(0.85, 0.08, 0.12, 0.02), [0, -0.35 + k * 0.23, 0.14]))), S.frame, q.pos, q.rot); }
      this.pl(t, sx > 0 ? 'x' : '-x', [[-1.5, 1.55], [1.45, 1.6], [1.55, 4.1], [-1.5, 4.25]], 0.45, { bev: 0.09, nx: 6, ny: 5, bx: 5 }, S.second, [sx * 2.62, 0, -0.05]);
      // 側胴散熱百葉
      this.vent(t, 1.5, 0.85, 5, S, [sx * 2.86, 2.25, -0.2], [0, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 0]);
      A(t, cyl(0.95, 1.0, 0.8), S.frame, [sx * 2.95, 3.95, -0.1], [0, 0, Math.PI / 2]);
      A(t, hose([[sx * 1.6, 3.8, 2.05], [sx * 1.95, 4.8, 2.35], [sx * 1.35, 5.6, 2.1], [sx * 0.6, 5.75, 1.6]], 0.24, 7), S.dark);
      A(t, hose([[sx * 1.6, 0.6, 1.1], [sx * 2.4, 0.9, 0.6], [sx * 2.5, 1.3, -1.1], [sx * 1.6, 1.8, -1.95]], 0.26, 6), S.dark);
      // 上胸角落的探照燈、扶手
      A(t, cyl(0.26, 0.3, 0.34, 14), S.frame, [sx * 2.2, 5.12, 1.3], [Math.PI / 2, 0, 0]);
      A(t, cyl(0.2, 0.2, 0.04, 14), GLASS, [sx * 2.2, 5.12, 1.48], [Math.PI / 2, 0, 0]);
      A(t, at(handle(0.8, 0.14, 0.045), [0, 0, 0], [0, 0, Math.PI / 2]), S.frame, [sx * 2.62, 2.3, 1.5]);
    }
    // 艙門：外框＋鉸鏈＋把手＋機號
    A(t, blk(1.08, 1.12, 0.2, 0.06, 0.18), S.main, [0, 3.98, 1.96]);
    A(t, merge([[-0.42, 4.42], [0.42, 4.42], [-0.42, 3.54], [0.42, 3.54]].map(([x, y]) => at(nut(0.05), [x, y, 2.07], [Math.PI / 2, 0, 0]))), S.frame);
    A(t, cyl(0.08, 0.08, 0.9, 10), S.frame, [0, 4.55, 1.98], [0, 0, Math.PI / 2]);
    A(t, at(handle(0.4, 0.1, 0.035), [0, 3.62, 2.06]), S.frame);
    A(t, blk(1.5, 1.35, 0.35, 0.1, 0.2), S.second, [0, 2.45, 1.92], [-0.1, 0, 0]);
    this.label(t, sten('emblem', 0.55, 0.55, { tint: 1 }).translate(0, 0, 0.19), S.second, [0, 2.45, 1.92], [-0.1, 0, 0]);
    A(t, blk(3.4, 0.8, 2.8, 0.2, 0.4), S.second, [0, 5.0, 0.1]);
    A(t, merge([-1.3, -0.65, 0.65, 1.3].map((x) => at(nut(0.06), [x, 5.02, 1.52], [Math.PI / 2, 0, 0]))), S.frame);
    // 左肩上方感測器組：三顆鏡頭
    A(t, blk(0.7, 0.36, 0.5, 0.06), S.second, [1.55, 5.52, 0.95]);
    for (const [x, r] of [[1.36, 0.1], [1.58, 0.07], [1.75, 0.07]]) A(t, cyl(r, r, 0.08, 10), GLASS, [x, 5.52, 1.22], [Math.PI / 2, 0, 0]);
    // ---- 背包
    const bk = b.back;
    // 背包：箱形核心＋後方一整片雙向彎曲的護甲
    A(bk, blk(3.5, 3.3, 1.5, 0.25, 0.5), S.second, [0, 3.0, -2.5]);
    const bz = (x, y) => -3.45 + (x * x) / 6.4 + ((y - 3.0) ** 2) / 18;   // 後護甲外表面
    this.pl(bk, '-z', [[-1.95, -1.7], [1.95, -1.7], [2.05, 1.3], [1.6, 1.8], [-1.6, 1.8], [-2.05, 1.3]], 0.4, { bev: 0.09, nx: 7, ny: 5, bx: 3.2, by: 9 }, S.second, [0, 3.0, -3.25]);
    const dp = this.pl(bk, '-z', [[-1.1, -0.3], [1.1, -0.3], [1.1, 0.3], [-1.1, 0.3]], 0.1, { bev: 0.025, nx: 5, ny: 2, bx: 3.2, by: 9, cv: -1.2 }, S.dark, [0, 4.2, -3.5]);
    dp.put(sten('danger', 1.9, 0.44, { tint: 3, seg: 4 }), 0, 0);
    // 背面散熱鰭片（貼著曲面）
    const fins = [];
    for (let k = 0; k < 9; k++) { const x = -1.2 + k * 0.3; fins.push(at(blk(0.08, 1.15, 0.28, 0.015), [x, 2.95, bz(x, 2.95) - 0.1])); }
    A(bk, merge(fins), S.frame);
    A(bk, pipe(Array.from({ length: 7 }, (_, k) => { const x = -1.35 + k * 0.45; return [x, 3.55, bz(x, 3.55) - 0.07]; }), 0.05, 12, 6), S.frame);
    A(bk, merge([[-1.7, 4.4], [1.7, 4.4], [-1.7, 1.6], [1.7, 1.6]].map(([x, y]) => at(nut(0.07), [x, y, bz(x, y) - 0.01], [Math.PI / 2, -Math.atan(x / 3.2), 0]))), S.frame);
    A(bk, at(handle(1.4, 0.2, 0.05), [0, 0, 0], [-Math.PI / 2, 0, 0]), S.frame, [0, 4.8, -2.4]);
    const glowG = [];
    for (const sx of [-1, 1]) {
      A(bk, bell(0.8, 1.3), S.dark, [sx * 1.1, 1.3, -3.0], [0.45, 0, 0]);
      A(bk, cyl(0.55, 0.55, 0.25), S.frame, [sx * 1.1, 1.32, -2.95], [0.45, 0, 0]);
      glowG.push(at(new THREE.CylinderGeometry(0.43, 0.43, 0.06, 14), [sx * 1.1, 0.18, -3.42], [0.45, 0, 0]));
      this.nozzles.push({ bone: bk, pos: [sx * 1.1, 0.05, -3.6], rot: [0.45, 0, 0], r: 0.75, len: 6 });
      A(bk, cyl(0.5, 0.5, 3.0), S.main, [sx * 2.25, 3.1, -2.6]);
      A(bk, sph(0.5, 16, 10), S.main, [sx * 2.25, 4.6, -2.6], [0, 0, 0], [1, 0.5, 1]);
      A(bk, sph(0.5, 16, 10), S.main, [sx * 2.25, 1.6, -2.6], [0, 0, 0], [1, 0.5, 1]);
      A(bk, cyl(0.38, 0.38, 2.35, 12), S.frame, [sx * 2.25, 3.1, -2.6]);
      // 推進劑槽的束帶與輸送管
      for (const y of [2.3, 3.9]) A(bk, cyl(0.53, 0.53, 0.14, 16), S.dark, [sx * 2.25, y, -2.6]);
      A(bk, pipe([[sx * 2.2, 1.5, -2.85], [sx * 1.9, 1.15, -3.0], [sx * 1.45, 1.35, -3.0]], 0.09), S.frame);
      this.label(bk, sten('fuel', 1.2, 0.14, { face: sx > 0 ? 'x' : '-x', tint: 1 }), S.main, [sx * 2.76, 3.1, -2.6], [Math.PI / 2, 0, 0]);
    }
    this.addGlow(bk, mergeGeometries(glowG), [0.14, 1.25, 2.3]);
    // 鞭狀天線（指揮官機兩根）
    for (const x of ace ? [-1.6, 1.6] : [-1.6]) {
      A(bk, cyl(0.1, 0.13, 0.25, 10), S.frame, [x, 4.9, -2.3]);
      A(bk, rod([x, 5.0, -2.3], [x * 1.1, 8.2, -3.4], 0.04, 0.012, 5), S.dark);
    }
    // ---- 頭：圓頂＋單眼滑軌
    const h = b.head;
    h.scale.setScalar(0.72);
    this.eyeRail = { r: 1.44, y: 1.05, sz: 1.08 };
    const hz = [1, 1, 1.08];
    A(h, cyl(0.55, 0.65, 0.8), S.frame, [0, 0.25, 0]);
    A(h, lathe([[0.001, 2.25], [0.6, 2.2], [1.05, 1.95], [1.3, 1.52], [1.38, 1.02], [1.32, 0.5], [1.1, 0.15], [0.001, 0.05]], 24), S.main, [0, 0, 0], [0, 0, 0], hz);
    A(h, prep(new THREE.CylinderGeometry(1.4, 1.4, 0.46, 22, 1, true, -1.3, 2.6)), S.dark, [0, 1.05, 0], [0, 0, 0], hz);
    A(h, arcRing(1.4, 0.07, 2.7), S.frame, [0, 1.29, 0], [0, 0, 0], hz);
    A(h, arcRing(1.39, 0.07, 2.7), S.frame, [0, 0.81, 0], [0, 0, 0], hz);
    A(h, prof([[1.05, 0.8], [1.45, 0.55], [1.32, 0.1], [0.55, 0.02]], 1.5, 0.08), S.second);
    for (let k = 0; k < 3; k++) A(h, blk(0.9, 0.07, 0.12, 0.02), S.dark, [0, 0.28 + k * 0.14, 1.42], [0.25, 0, 0]);
    // 頭頂脊線、後腦散熱口
    A(h, prof([[1.134, 2.05], [0.648, 2.3], [0, 2.35], [-0.648, 2.3], [-1.134, 2.05], [-1.134, 1.85], [-0.648, 2.1], [0, 2.15], [0.648, 2.1], [1.134, 1.85]], 0.16, 0.03), S.second);
    this.vent(h, 0.6, 0.4, 3, S, [0, 1.05, -1.53], [0, Math.PI, 0]);
    for (const sx of [-1, 1]) {
      A(h, cyl(0.3, 0.3, 0.45), S.frame, [sx * 1.3, 0.62, 0.55], [0, 0, Math.PI / 2]);
      A(h, cyl(0.19, 0.19, 0.05, 14), GLASS, [sx * 1.54, 0.62, 0.55], [0, 0, Math.PI / 2]);
      A(h, hose([[sx * 0.68, 0.25, 1.28], [sx * 0.82, -0.13, 1.22], [sx * 0.86, -0.24, 0.65]], 0.09, 6), S.dark);
      A(h, bolt(0.09), S.frame, [sx * 0.98, 1.78, 0.74], [Math.PI / 2, 0, 0]);
      A(h, merge([-0.2, 0.25].map((z) => at(nut(0.07), [sx * 1.38, 1.2, z], [0, 0, Math.PI / 2 - sx * 0.35]))), S.frame);
    }
    // 左側刀型天線（指揮官機另有頭角）
    A(h, blade([[0, 0], [0.12, 0.05], [0.05, 1.3], [-0.03, 1.28]], 0.07, 0.015), S.frame, [1.3, 1.1, -0.4], [0, Math.PI / 2, -0.35]);
    if (ace) A(h, blade([[0, 0], [0.18, 0.1], [0.05, 2.4], [-0.08, 0.1]], 0.14, 0.02), S.yellow, [0, 1.75, 0.95], [-0.35, 0, 0]);
    this.eye = this.addGlow(h, new THREE.SphereGeometry(0.2, 12, 8), S.eye, [0, 1.05, 1.5]);
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex(), color: new THREE.Color(...S.eye).multiplyScalar(0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    flare.scale.setScalar(2.4);
    flare.userData.noAO = true;
    this.eye.add(flare);
    // ---- 手臂
    for (const [n, sx] of [['R', -1], ['L', 1]]) {
      const sh = b['shoulder' + n], el = b['elbow' + n];
      A(sh, sph(0.95), S.frame);
      if (n === 'R') {
        // 右肩：弧形盾（細分後真的彎）＋外緣螺帽＋機號
        A(sh, bendPlate(gridPlate(0.42, 4.3, 4.0, 0.7, 6, 12), 2.8), S.main, [-1.95, -0.25, 0.1], [0, Math.PI, 0]);
        A(sh, bendPlate(gridPlate(0.3, 4.55, 4.3, 0.75, 4, 10), 2.8), S.second, [-1.72, -0.25, 0.1], [0, Math.PI, 0]);
        const nuts = [];
        for (const y of [-1.75, 1.75]) for (const z of [-1.3, -0.65, 0, 0.65, 1.3]) {
          const th = z / 2.8, r = 0.21 + 2.8;
          nuts.push(at(nut(0.08), [r * Math.cos(th) - 2.8, y, r * Math.sin(th)], [0, -th, Math.PI / 2]));
        }
        A(sh, merge(nuts), S.frame, [-1.95, -0.25, 0.1], [0, Math.PI, 0]);
        const dg = digits('00', 1.2, { face: 'x', tint: 1, variable: true });
        dg.translate(0.225, 0.35, 0);
        const lb = sten(heavy ? 'agx9h' : ace ? 'agx9c' : 'agx9', 1.9, heavy || ace ? 0.26 : 0.46, { face: 'x', tint: 1, seg: 6 });
        lb.translate(0.225, -0.75, 0);
        const st = sten('hazard', 3.2, 0.2, { face: 'x', tint: 5, seg: 10 });
        st.translate(0.225, -1.45, 0);
        for (const g of [dg, lb, st]) this.label(sh, bendPlate(g, 2.8), S.main, [-1.95, -0.25, 0.1], [0, Math.PI, 0]);
        A(sh, blk(0.8, 1.2, 1.2, 0.1), S.frame, [-1.2, 0, 0]);
      } else {
        // 左肩：尖刺護甲
        // 左肩：圓頂護甲殼（雙向彎）＋頂蓋＋深藍側板＋五根尖刺
        A(sh, taper(blk(1.8, 2.1, 2.6, 0.25, 0.6), 0.85, 0.9, 1, 1), S.frame, [0.85, 0.3, 0]);
        const sd = (z, y) => (z * z) / 4 + ((y - 0.45) ** 2) / 4.4;   // 外殼正面曲率
        this.pl(sh, 'x', [[-1.55, -0.95], [1.55, -0.95], [1.62, 0.6], [1.15, 1.55], [-1.15, 1.6], [-1.62, 0.6]], 0.42, { bev: 0.09, nx: 6, ny: 6, bx: 2.0, by: 2.2, cv: 0.1 }, S.main, [1.95, 0.35, 0]);
        this.pl(sh, 'y', [[-1.0, -1.45], [1.0, -1.5], [1.1, 1.45], [-1.05, 1.5]], 0.34, { bev: 0.08, nx: 5, ny: 5, bx: 2.2, by: 3 }, S.main, [0.95, 1.62, 0], [0, 0, -0.25]);
        const lp = this.pl(sh, 'x', [[-1.2, -0.62], [1.2, -0.62], [1.2, 0.5], [-1.2, 0.5]], 0.12, { bev: 0.03, nx: 5, ny: 3, bx: 2.0, by: 2.2, cv: 0.3 }, S.second, [1.95 + 0.26, 0.15, 0]);
        lp.put(digits('00', 0.6, { tint: 1, variable: true }), 0.25, -0.1);
        lp.put(ace ? sten('chev', 0.45, 0.45, { tint: 3 }) : sten('emblem', 0.45, 0.45, { tint: 1 }), -0.62, -0.1);
        lp.put(sten('hyd', 1.9, 0.12, { tint: 1, seg: 4 }), 0, -0.5);
        const spikes = [];
        for (const [y, z] of [[1.25, 0.85], [1.35, -0.6], [1.7, 0.12], [0.55, 1.15], [0.6, -1.1]]) {
          const tilt = 0.35 + (y - 0.5) * 0.25, x = 2.12 - sd(z, y);
          A(sh, lathe([[0.001, 1.25], [0.34, 0], [0.38, -0.1], [0.001, -0.12]], 10), S.frame, [x, y, z], [0, 0, -(Math.PI / 2 - tilt)]);
          spikes.push(cyl(0.44, 0.48, 0.1, 10).applyMatrix4(new THREE.Matrix4().makeRotationZ(-(Math.PI / 2 - tilt))).translate(x - 0.05, y, z));
        }
        A(sh, merge(spikes), S.dark);
        A(sh, blk(2.2, 0.16, 0.2, 0.04), S.frame, [0.95, -0.85, 1.56]);
      }
      A(sh, cyl(0.55, 0.5, 2.6), S.frame, [0, -1.5, 0]);
      A(sh, ribs(-0.8, -2.4, 4, 0.74, 0.17, 12), S.dark);
      A(el, cyl(0.62, 0.62, 1.4), S.frame, [0, 0, 0], [0, 0, Math.PI / 2]);
      for (const side of [-1, 1]) A(el, cyl(0.4, 0.42, 0.1, 14), S.frame, [side * 0.74, 0, 0], [0, 0, Math.PI / 2]);
      // 前臂：圓錐核心＋外側、前、後三片包覆的曲面板
      A(el, taper(cyl(0.78, 0.9, 2.9, 14), 0.9, 0.9, 1, 1), S.frame, [0, -1.55, 0]);
      this.pl(el, sx > 0 ? 'x' : '-x', [[-0.95, -2.95], [0.95, -2.95], [1.0, -1.0], [0.72, -0.25], [-0.72, -0.25], [-1.0, -1.0]], 0.34, { bev: 0.08, nx: 5, ny: 5, bx: 1.05 }, S.main, [sx * 0.7, 0, 0]);
      const ff = this.pl(el, 'z', [[-0.7, -2.95], [0.7, -2.95], [0.72, -0.5], [-0.72, -0.5]], 0.28, { bev: 0.07, nx: 5, ny: 4, bx: 1.1 }, S.second, [0, 0, 0.8]);
      ff.put(sten('hazard', 1.1, 0.16, { tint: 5, seg: 3 }), 0, -2.45);
      this.pl(el, '-z', [[-0.66, -2.85], [0.66, -2.85], [0.7, -0.6], [-0.7, -0.6]], 0.26, { bev: 0.06, nx: 5, ny: 4, bx: 1.1 }, S.main, [0, 0, -0.8]);
      A(el, merge([[0.5, -0.85], [-0.5, -0.85], [0.5, -2.25], [-0.5, -2.25]].map(([z, y]) => at(nut(0.055), [sx * (0.88 - (z * z) / 2.1), y, z], [0, -sx * Math.atan(z / 1.05), Math.PI / 2]))), S.frame);
      this.piston(el, [-sx * 0.42, -0.4, -0.98], [-sx * 0.42, -2.5, -1.02], 0.12, S);
      A(el, cyl(0.62, 0.64, 0.26, 16), S.frame, [0, -2.98, 0]);
      A(el, cyl(0.45, 0.45, 0.6), S.frame, [0, -3.0, 0]);
      this.buildHand(b['hand' + n], S, sx, true);
    }
    // ---- 武器
    const W = new THREE.Group();
    if (!heavy) {
      A(W, blk(0.75, 1.0, 3.6, 0.12), S.weapon, [0, 0, 0.4]);
      A(W, blk(0.56, 0.62, 1.6, 0.08), S.weapon, [0, 0.1, 2.9]);
      A(W, cyl(0.2, 0.2, 2.4), S.frame, [0, 0.1, 4.2], [Math.PI / 2, 0, 0]);
      // 散熱護套（上方開孔）
      A(W, cyl(0.28, 0.28, 1.3, 14), S.weapon, [0, 0.1, 4.0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 4; k++) A(W, blk(0.14, 0.05, 0.18, 0.01), S.dark, [0, 0.37, 3.55 + k * 0.3]);
      // 砲口制退器：兩側開槽
      A(W, blk(0.62, 0.5, 0.75, 0.06), S.weapon, [0, 0.1, 5.5]);
      for (const z of [5.35, 5.6]) for (const s of [-1, 1]) A(W, blk(0.04, 0.3, 0.12, 0.005), S.dark, [s * 0.315, 0.1, z]);
      A(W, cyl(0.2, 0.2, 0.04, 12), S.dark, [0, 0.1, 5.88], [Math.PI / 2, 0, 0]);
      // 彈鼓＋加強筋＋供彈管
      A(W, cyl(1.0, 1.0, 0.6, 24), S.weapon, [-0.7, 0.35, 0.3], [0, 0, Math.PI / 2]);
      A(W, cyl(0.35, 0.35, 0.65), S.frame, [-0.72, 0.35, 0.3], [0, 0, Math.PI / 2]);
      const ribsD = [];
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ribsD.push(at(blk(0.06, 0.6, 0.1, 0.01), [-1.02, 0.35 + Math.sin(a) * 0.62, 0.3 + Math.cos(a) * 0.62], [-a, 0, 0])); }
      A(W, merge(ribsD), S.frame);
      this.label(W, sten('ammo', 1.1, 0.1, { face: '-x', tint: 1 }), S.weapon, [-1.012, 0.35, 0.3]);
      A(W, pipe([[-0.45, 0.9, 0.9], [-0.25, 1.0, 1.2], [0, 0.55, 1.3]], 0.07), S.dark);
      A(W, blk(0.42, 1.2, 0.5, 0.06), S.frame, [0, -0.8, 0], [0.25, 0, 0]);
      A(W, prof([[0, 0.3], [-1.8, 0.2], [-1.9, -0.5], [-0.3, -0.35]], 0.55, 0.08), S.weapon, [0, 0, -1.3]);
      // 瞄具：鏡筒＋鏡片＋座
      A(W, cyl(0.2, 0.2, 1.0), S.frame, [0, 0.75, 0.6], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.15, 0.15, 0.04, 12), GLASS, [0, 0.75, 1.12], [Math.PI / 2, 0, 0]);
      A(W, merge([at(blk(0.16, 0.26, 0.16, 0.02), [0, 0.55, 0.25]), at(blk(0.16, 0.26, 0.16, 0.02), [0, 0.55, 0.95])]), S.frame);
      A(W, blk(0.05, 0.3, 0.9, 0.01), S.dark, [0.38, 0.12, 0.9]);
      this.attachWeapon(W, new THREE.Vector3(0, 0.1, 5.9));
    } else {
      A(W, blk(0.95, 1.25, 6.5, 0.15), S.weapon, [0, 0, 1.6]);
      A(W, cyl(0.45, 0.5, 3.4), S.frame, [0, 0.1, 6.0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 5; k++) A(W, cyl(0.54, 0.54, 0.1, 16), S.weapon, [0, 0.1, 4.7 + k * 0.5], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.62, 0.62, 0.7), S.accent, [0, 0.1, 7.7], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.42, 0.42, 0.04, 16), S.dark, [0, 0.1, 8.06], [Math.PI / 2, 0, 0]);
      // 後噴口
      A(W, bell(0.7, 0.8), S.dark, [0, 0.05, -1.62], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.55, 0.55, 0.14, 16), S.frame, [0, 0.05, -1.66], [Math.PI / 2, 0, 0]);
      A(W, blk(0.42, 1.2, 0.5, 0.06), S.frame, [0, -0.9, 0], [0.25, 0, 0]);
      A(W, blk(0.7, 0.9, 2.2, 0.1), S.second, [0, 0.9, 0.6]);
      A(W, cyl(0.2, 0.2, 1.2), S.frame, [-0.55, 1.05, 1.2], [Math.PI / 2, 0, 0]);
      A(W, cyl(0.15, 0.15, 0.04, 12), GLASS, [-0.55, 1.05, 1.82], [Math.PI / 2, 0, 0]);
      A(W, blk(0.2, 0.2, 0.3, 0.03), S.frame, [-0.4, 0.95, 1.2]);
      for (const s of [-1, 1]) {
        A(W, blk(0.04, 0.55, 5.4, 0.01), S.dark, [s * 0.485, -0.2, 1.8]);
        this.label(W, sten('danger', 1.7, 0.4, { face: s > 0 ? 'x' : '-x', tint: 3 }), S.weapon, [s * 0.49, 0.3, -0.6]);
      }
      this.attachWeapon(W, new THREE.Vector3(0, 0.1, 8.2));
      // 雙肩飛彈艙
      for (const sx of [-1, 1]) {
        A(t, blk(1.9, 1.7, 2.8, 0.2, 0.3), S.second, [sx * 3.0, 5.25, 0]);
        A(t, blk(1.76, 1.5, 0.12, 0.06), S.frame, [sx * 3.0, 5.25, 1.45]);
        const tubes = [], tips = [];
        for (let k = 0; k < 6; k++) {
          const x = sx * 3.0 + ((k % 3) - 1) * 0.5, y = 5.25 + ((k / 3) | 0) * 0.6 - 0.3;
          tubes.push(at(cyl(0.22, 0.22, 0.13, 8), [x, y, 1.55], [Math.PI / 2, 0, 0]), at(cyl(0.25, 0.25, 0.05, 8), [x, y, 1.6], [Math.PI / 2, 0, 0]));
          tips.push(at(cyl(0.11, 0.11, 0.14, 8), [x, y, 1.65], [Math.PI / 2, 0, 0]));
        }
        A(t, merge(tubes), S.dark);
        A(t, merge(tips), S.accent);
        // 艙蓋鉸鏈、側面裝甲、後方排焰口
        A(t, cyl(0.1, 0.1, 1.9, 10), S.frame, [sx * 3.0, 6.12, 1.35], [0, 0, Math.PI / 2]);
        A(t, blk(0.14, 1.4, 2.2, 0.04, 0.2), S.second, [sx * (3.0 + 1.02), 5.25, 0]);
        A(t, merge([[-0.8, 5.8], [0.8, 5.8], [-0.8, 4.7], [0.8, 4.7]].map(([z, y]) => at(nut(0.06), [sx * 4.1, y, z], [0, 0, Math.PI / 2]))), S.frame);
        this.label(t, sten('warn', 0.5, 0.5, { face: sx > 0 ? 'x' : '-x', tint: 5 }), S.second, [sx * 4.1, 5.3, 0.35]);
        this.label(t, sten('hazard', 1.9, 0.16, { face: sx > 0 ? 'x' : '-x', tint: 5 }), S.second, [sx * 4.1, 4.72, 0]);
        this.vent(t, 1.4, 0.9, 4, S, [sx * 3.0, 5.25, -1.44], [0, Math.PI, 0]);
        A(t, blk(0.5, 0.9, 1.5, 0.08), S.frame, [sx * 2.2, 4.75, -0.2]);
      }
    }
    this.height = 18;
    if (heavy) this.root.scale.setScalar(1.25);
  }

  // 推進器火焰：內焰（白藍、短）＋外焰（藍、長）
  buildFlames() {
    this.flames = [];
    const inner = prep(new THREE.CylinderGeometry(0.55, 0.05, 1, 14, 1, true).translate(0, -0.5, 0).scale(1, 0.45, 1));
    const outer = prep(new THREE.CylinderGeometry(1.0, 0.1, 1, 14, 1, true).translate(0, -0.5, 0));
    for (const [geo, rgb] of [[inner, [0.7, 1.7, 4.0]], [outer, [0.06, 0.22, 1.15]]]) {
      const c = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < c.length; i += 3) c.set(rgb, i);
      geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    const flameGeo = mergeGeometries([inner, outer]);
    const flameMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.62, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const nz of this.nozzles) {
      const g = new THREE.Group();
      g.position.set(...nz.pos); g.rotation.set(...nz.rot);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.userData.noAO = true;
      g.add(flame);
      g.scale.set(nz.r, 0.01, nz.r);
      g.visible = false;
      nz.bone.add(g);
      this.flames.push({ g, len: nz.len });
    }
  }

  get scale() { return this.root.scale.x; }

  // 第一人稱：只看得到手臂與武器，其他部位只投影子
  setFirstPerson(on) {
    const keep = new Set(['shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'].map((n) => this.bones[n]));
    const kept = (o) => keep.has(o.parent) || keep.has(o.parent.parent) || keep.has(o.parent.parent?.parent);
    for (const m of this.meshes) {
      if (!m.userData.origMat) m.userData.origMat = m.material;
      m.material = on && !kept(m) ? MATS.shadowOnly : m.userData.origMat;
    }
    for (const g of this.glows) g.visible = !on || kept(g);
    this.root.traverse((o) => { if (o.userData.decal) o.visible = !on || kept(o); });
  }

  // 動作全部在 anim.js（MechMotion）；st = { vel, grounded, boost, torsoYaw, pitch, thrust, aim(Vector3|null), lean }
  animate(dt, st) { this.motion.update(dt, st); }
  impact(s) { this.motion.impact(s); }

  capsule() {
    const p = this.root.position, k = this.scale;
    return { x: p.x, z: p.z, y0: p.y + 1 * k, y1: p.y + 17 * k, r: 3.2 * k };
  }

  // 拆成碎片（爆炸用）
  shatter() {
    this.root.updateMatrixWorld(true);
    return this.meshes.map((m) => {
      const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      m.matrixWorld.decompose(pos, q, sc);
      return { mesh: m, pos, q, sc };
    });
  }
}

// 換機號：複製那根骨頭的幾何，把「變動位數」的 UV 平移到對應數字格
function unitVariant(src, num) {
  const g = src.clone();
  const d = g.attributes.dcl;
  for (let i = 0; i < d.count; i++) {
    const z = d.getZ(i);
    if (z < 8) continue;
    const slot = Math.floor(z / 8 + 0.01), digit = +(num[slot - 1] || 0);
    d.setX(i, d.getX(i) + (digit * 96) / 1024);
  }
  d.needsUpdate = true;
  return g;
}

let _glow = null;
function glowTex() {
  if (_glow) return _glow;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(c);
  return _glow;
}

export { wrap, lerpAngle, damp };
