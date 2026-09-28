// 駕駛艙：全景螢幕艙——玩家坐在機體胸口的一顆球裡，整面內壁都是螢幕，映出外面的景色。
// 看得到：螢幕面板之間的細接縫與窄邊框、飄在周圍的全像多功能顯示頁（雷達、系統、武裝、電力、引擎…）、
//   兩側扶手台（烤漆掉漆、面板線、螺絲、背光按鍵、護蓋開關、旋鈕、彈射拉環、主注意／主警告燈）、兩支操縱桿（扳機、帽型開關）和戴手套的雙手。
// 全像顯示頁固定在眼前（跟著頭，不跟艙體晃），只留幾毫米的柔和延遲；實體零件、球幕、外面的景色照樣晃。
// 開機：面板從正前方往外一片片亮起來；中彈時有幾片面板閃雜訊；覺醒時接縫發紅光。
// 瞄準莢艙（TGP）：鎖定目標時，右邊的武裝頁換成彩色的目標特寫——鎖上瞬間推近、框從外面收進來咬住目標，
//   之後自動變焦跟著距離；看得到距離、接近率、種類、耐久、雷射測距；打中會閃白；擊毀時鏡頭停在爆炸上約一秒。
// 艙內光線＝螢幕映出的外面（天光＋太陽方向，看向亮處時艙內跟著亮）＋儀表背光（自動亮度）＋全像頁的青光＋警示燈＋開火閃光。
// 鏡頭：跟著胸口走；飛行員的頭坐在「彈簧」上——落腳、落地、中彈時頭晚一拍，整個艙在眼前晃。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), ORIGIN = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();
const pad = (n, k = 3) => String(Math.max(0, Math.round(n))).padStart(k, '0');

// 航電等寬字（B612 Mono）：沒載到就用系統等寬字；載到之後重畫靜態圖層
const MONO = '"B612 Mono", "Roboto Mono", Menlo, Consolas, monospace';
function monoFont(cb) {
  let l = document.getElementById('b612');
  if (!l) {
    l = document.createElement('link'); l.id = 'b612'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=B612+Mono:wght@400;700&display=swap';
    document.head.appendChild(l);
  }
  const go = () => Promise.all(['400', '700'].map((w) => document.fonts.load(`${w} 24px "B612 Mono"`))).then(cb, () => {});
  if (l.sheet) go(); else l.addEventListener('load', go);
}

// 方位角 a（往右為正）、仰角 e（往上為正）、距離 d → 座標（眼睛在原點、面向 −Z）
function sph(a, e, d, out = new THREE.Vector3()) {
  return out.set(d * Math.cos(e) * Math.sin(a), d * Math.sin(e), -d * Math.cos(e) * Math.cos(a));
}
// 朝向眼睛的座標系（+Z 指向眼睛）
function facing(a, e, d) {
  const c = sph(a, e, d);
  return new THREE.Matrix4().lookAt(ORIGIN, c, UP).setPosition(c);
}
const rb = (w, h, d, r = 0.004) => new RoundedBoxGeometry(w, h, d, 2, Math.max(1e-4, Math.min(r, w / 2, h / 2, d / 2) - 1e-4));
const cyl = (r, h, n = 14) => new THREE.CylinderGeometry(r, r, h, n);

// 零件收集：同材質合併成一個網格（少 draw call）
// 每個頂點多帶一個 edge 值（圓角盒的倒角處＝1、平面＝0），烤漆材質用它畫邊緣掉漆
class Parts {
  constructor() { this.by = new Map(); this.base = null; }
  addM(mat, g, m) {
    const box = g instanceof RoundedBoxGeometry;
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, ed = new Float32Array(n);
    if (box) { const nm = g.attributes.normal; for (let i = 0; i < n; i++) ed[i] = Math.min(1, (1 - Math.max(Math.abs(nm.getX(i)), Math.abs(nm.getY(i)), Math.abs(nm.getZ(i)))) * 3.4); }
    g.setAttribute('edge', new THREE.BufferAttribute(ed, 1));
    if (m) g.applyMatrix4(m);
    if (this.base) g.applyMatrix4(this.base);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(g);
    return g;
  }
  add(mat, g, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')), _s.set(scl[0], scl[1], scl[2]));
    return this.addM(mat, g, _m);
  }
  // 兩點之間的膠囊／錐管（手指、手腕、袖子）
  seg(mat, a, b, r, r2 = null) {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    const g = r2 === null ? new THREE.CapsuleGeometry(r, Math.max(1e-3, L), 4, 12) : new THREE.CylinderGeometry(r2, r, L, 14);
    _m.compose(_p.addVectors(a, b).multiplyScalar(0.5), _q.setFromUnitVectors(UP, d.divideScalar(L)), _s.set(1, 1, 1));
    return this.addM(mat, g, _m);
  }
  build(parent) {
    for (const [mat, list] of this.by) {
      const mesh = new THREE.Mesh(mergeGeometries(list), mat);
      mesh.castShadow = mesh.receiveShadow = !!mat.isMeshStandardMaterial && !mat.transparent;
      parent.add(mesh);
    }
    this.by.clear();
    return parent;
  }
}

// 烤漆邊緣掉漆：倒角處（edge）加上雜訊 → 露出底下的金屬（亮、金屬感），掉漆邊緣一圈暗色底漆
const WEAR_FN = `
  float wH(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float wN(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(wH(i), wH(i + vec3(1, 0, 0)), f.x), mix(wH(i + vec3(0, 1, 0)), wH(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(wH(i + vec3(0, 0, 1)), wH(i + vec3(1, 0, 1)), f.x), mix(wH(i + vec3(0, 1, 1)), wH(i + vec3(1, 1, 1)), f.x), f.y), f.z); }`;
function wear(mat, k, bare) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.wearK = { value: k }; sh.uniforms.bareC = { value: new THREE.Color(bare) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float edge; varying float vEdge; varying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = edge; vOP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float wearK; uniform vec3 bareC; varying float vEdge; varying vec3 vOP;' + WEAR_FN)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float wv = vEdge * wearK - (wN(vOP * 330.0) * 0.55 + wN(vOP * 70.0) * 0.45) * 0.95 + 0.1;
        float wr = smoothstep(0.34, 0.4, wv), wd = smoothstep(0.2, 0.34, wv) - wr;
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - wd * 0.45), bareC, wr);
        roughnessFactor = mix(roughnessFactor, 0.3, wr);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.92, wr);');
  };
  return mat;
}

// ---------------------------------------------------------------- 程序貼圖
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function ctex(c, rep = null, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 金屬／塗裝表面的細刮痕與髒污（粗糙度＋凹凸）
function grungeTex() {
  const S = 256, [c, x] = canvas(S, S), r = rng(11);
  const img = x.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const v = 150 + (r() - 0.5) * 34; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  for (let k = 0; k < 90; k++) {
    x.strokeStyle = `rgba(${r() < 0.5 ? 210 : 90},${r() < 0.5 ? 210 : 90},${r() < 0.5 ? 210 : 90},${0.15 + r() * 0.3})`;
    x.lineWidth = 0.5 + r();
    const x0 = r() * S, y0 = r() * S, a = r() * Math.PI, l = 8 + r() * 50;
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); x.stroke();
  }
  for (let k = 0; k < 25; k++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(60,60,60,0.35)'); g.addColorStop(1, 'rgba(60,60,60,0)');
    x.save(); x.translate(r() * S, r() * S); x.scale(10 + r() * 30, 10 + r() * 30); x.fillStyle = g; x.fillRect(-1, -1, 2, 2); x.restore();
  }
  return ctex(c, [1, 1]);
}
// 手套／布料的細紋
function fabricTex() {
  const S = 128, [c, x] = canvas(S, S), r = rng(5);
  const img = x.createImageData(S, S), d = img.data;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const v = 140 + 30 * Math.sin(i * 1.6) * Math.sin(j * 1.6) + (r() - 0.5) * 40;
    const p = (j * S + i) * 4; d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return ctex(c, [3, 3]);
}
// 握把橡膠的菱形防滑紋
function knurlTex() {
  const S = 64, [c, x] = canvas(S, S);
  x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, S, S);
  x.strokeStyle = '#303030'; x.lineWidth = 2.2;
  for (let i = -S; i < S * 2; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.moveTo(i, S); x.lineTo(i + S, 0); x.stroke(); }
  return ctex(c, [5, 7]);
}
// 彈射拉環的黃黑斜紋
function stripeTex() {
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#e3ad17'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#151515';
  for (let i = -64; i < 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 16, 0); x.lineTo(i + 80, 64); x.lineTo(i + 64, 64); x.closePath(); x.fill(); }
  return ctex(c, [5, 1], true);
}
// 噴漆標示字（印在面板上；原創字樣，帶一點噴漆顆粒）
const LABELS = ['RADAR', 'RNG 600', 'STATUS', 'ARMS', 'FCS', 'SPD', 'ALT', 'EN CELL', 'BALANCER', 'CAUTION', 'XG-01', 'MSL ARM', 'SYS 1', 'SYS 2', 'IFF', 'COMM', 'HOT', 'VENT', 'GEN', 'LINK',
  'EJECT', 'PULL', 'MASTER ARM', 'OVRD', 'BRT', 'NO STEP', 'SAFE', 'ARM', 'HYD', 'ELEC', 'DANGER'];
function labelTex() {
  const W = 1024, H = 512, [c, x] = canvas(W, H), r = rng(3);
  const rect = {};
  x.font = '700 30px Rajdhani, "Arial Narrow", sans-serif';
  x.textBaseline = 'middle';
  let px = 6, py = 4;
  for (const s of LABELS) {
    const w = Math.ceil(x.measureText(s).width) + 14;
    if (px + w > W) { px = 6; py += 42; }
    const warn = s === 'CAUTION' || s === 'HOT' || s === 'DANGER';
    if (warn) { x.fillStyle = '#d9a21a'; x.fillRect(px, py, w, 36); x.fillStyle = '#111'; }
    else x.fillStyle = s === 'XG-01' || s === 'EJECT' ? '#e8ecef' : '#b9c3c8';
    x.fillText(s, px + 7, py + 19);
    rect[s] = [px, py, w, 36];
    px += w + 8;
  }
  // 噴漆顆粒：字的透明度隨機少一點
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) d[i] *= 0.72 + r() * 0.28;
  x.putImageData(img, 0, 0);
  return { tex: ctex(c, null, true), rect, W, H };
}
// 背光按鍵的字樣（白字黑底；當顏色貼圖＝沒亮時的灰字，當自發光貼圖＝背光）＋主注意／主警告燈罩
const KEYS = ['RDR', 'NAV', 'HSI', 'FCS', 'IFF', 'COM', 'SMS', 'TGT', 'HUD', 'MAP', 'SYS', 'ENG', 'ELEC', 'HYD', 'DATA', 'LINK', 'CAM', 'VENT', 'BAL', 'AUX', 'MRK', 'RST', 'ECM', 'NVG'];
function legendTex() {
  const [c, x] = canvas(1024, 512), rect = {};
  const draw = () => {
    x.fillStyle = '#000'; x.fillRect(0, 0, 1024, 512);
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    KEYS.forEach((s, i) => {
      const X = (i % 8) * 128, Y = Math.floor(i / 8) * 96;
      x.font = `700 ${s.length > 3 ? 34 : 42}px ${MONO}`; x.fillText(s, X + 64, Y + 50);
      rect[s] = [X + 6, Y + 6, 116, 84];
    });
    [['MASTER', 'CAUTION', 'mc'], ['WARNING', '', 'wn']].forEach(([a, b, k], i) => {
      const X = i * 256, Y = 300;
      x.fillStyle = '#4a4a4a'; x.fillRect(X + 4, Y, 248, 124);
      x.fillStyle = '#fff'; x.font = `700 ${b ? 40 : 46}px ${MONO}`;
      if (b) { x.fillText(a, X + 128, Y + 40); x.fillText(b, X + 128, Y + 86); } else x.fillText(a, X + 128, Y + 64);
      rect[k] = [X + 4, Y, 248, 124];
    });
  };
  draw();
  return { tex: ctex(c, null, true), rect, draw };
}
function atlasPlane(w, h, r, W, H) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    uv.setXY(i, (r[0] + u * r[2]) / W, 1 - (r[1] + (1 - v) * r[3]) / H);
  }
  return g;
}

// 螢幕圖集（1024×1024）上的區域
const SCR = {
  radar: [0, 0, 512, 512], status: [512, 0, 512, 384], arms: [512, 384, 512, 384], spd: [0, 512, 256, 256], alt: [256, 512, 256, 256],
  sys: [0, 768, 256, 256], gauge: [256, 768, 256, 256], bars: [512, 768, 512, 128], wave: [512, 896, 512, 128],
};
const SOLID = new Set(['wave', 'bars']);   // 扶手前端的實體小螢幕；其他都是飄在空中的全像視窗
// 全像視窗：k＝圖集區域、a/e/d＝方位／仰角（度）／距離、w/h＝大小（公尺）、at＝開機進度到多少時跳出來
const HOLO = [
  { k: 'sys', a: -44, e: 20, d: 1.05, w: 0.15, h: 0.15, at: 0.14 },
  { k: 'gauge', a: 44, e: 20, d: 1.05, w: 0.15, h: 0.15, at: 0.17 },
  { k: 'status', a: -40, e: 4, d: 1.0, w: 0.25, h: 0.1875, at: 0.2 },
  { k: 'arms', a: 40, e: 4, d: 1.0, w: 0.25, h: 0.1875, at: 0.23 },
  { k: 'radar', a: -33, e: -15, d: 0.95, w: 0.21, h: 0.21, at: 0.26 },
  { k: 'spd', a: 29, e: -15, d: 0.95, w: 0.1, h: 0.1, at: 0.29 },
  { k: 'alt', a: 35.5, e: -15, d: 0.95, w: 0.1, h: 0.1, at: 0.31 },
];
// 多功能顯示頁：頁名＋四邊按鍵（OSB）標籤；t＝上排（第一個＝目前頁，反白）、b＝下排、l／r＝左右
const PAGE = {
  radar: { n: 'RDR', t: ['RDR', 'NAV', 'HSI'], b: ['TWS', 'DCLT', 'MENU'], l: ['RNG+', 'RNG-'], r: ['IFF', 'MRK'] },
  status: { n: 'SYS', t: ['SYS', 'DMG', 'BAL', 'COOL'], b: ['BIT', 'RST', 'LOG', 'MENU'] },
  arms: { n: 'SMS', t: ['SMS', 'GUN', 'MSL', 'SBR', 'CAN'], b: ['ARM', 'SEL', 'JETT', 'MENU'] },
  sys: { n: 'ELEC', t: ['ELEC', 'HYD'], b: ['BIT', 'MENU'] },
  gauge: { n: 'ENG', t: ['ENG', 'RCTR'], b: ['TRND', 'MENU'] },
  spd: { n: 'SPD', t: ['SPD'] },
  alt: { n: 'ALT', t: ['ALT'] },
  wave: { n: 'RCTR' }, bars: { n: 'THR' },
  tgp: { n: 'TGP', t: ['TGP', 'TV', 'ZOOM'], b: ['SMS', 'MRK', 'MENU'] },
};
const COL = { bg: '#02070a', grid: 'rgba(111,240,255,0.13)', line: 'rgba(111,240,255,0.06)', line2: 'rgba(111,240,255,0.11)', dim: '#4fb0bd', cy: '#6ff0ff', wh: '#e6f6f8', am: '#ffb347', rd: '#ff4a3a', pk: '#ff6fd0', gr: '#6dff9a' };

// 瞄準莢艙（TGP）：鎖定目標時，右邊的武裝頁換成目標特寫——窄視角彩色攝影機追著目標，
// 畫進 320×240 小畫面（每秒 30 張、只在有目標時畫、不做後製、沿用主畫面的影子）；面板放大 1.15 倍
const TGP = { w: 320, h: 240, hz: 20, big: 1.15 };
const TAN35 = Math.tan(35 * D);
const tgFov = (z) => 2 * Math.atan(TAN35 / z) / D;   // 放大 z 倍（相對主視角 70°）的垂直視角
const _tr = new THREE.Vector3(), _tu = new THREE.Vector3();
const TG_FRAG = `
  uniform sampler2D vid, ovl; uniform float op, br, live, hurt, time, mono, fl;
  varying vec2 vUv;
  float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    // 外形：左上、右下切角（跟其他全像頁同一個外形）
    vec2 p = vec2(vUv.x * 512.0, (1.0 - vUv.y) * 384.0);
    float s = p.x + p.y;
    if (p.x < 3.0 || p.x > 509.0 || p.y < 3.0 || p.y > 381.0 || s < 44.4 || s > 851.6) discard;
    // 中彈：幾條橫帶左右撕開
    float fr = floor(time * 24.0), bd = floor(vUv.y * 30.0);
    vec2 uv = vUv;
    uv.x += hurt * step(0.75, h1(vec2(bd, fr))) * (h1(vec2(fr, bd + 7.0)) - 0.5) * 0.16;
    // 彩色畫面：自動曝光（中央加權測光，用 mip 取平均；只追一半，保留明暗感）→ 銳化（減掉周圍平均）→ 飽和度微調 → 亮部柔和壓縮（不被 Bloom 暈開）
    const vec3 LW = vec3(0.2126, 0.7152, 0.0722);
    float avg = mix(dot(textureLod(vid, vec2(0.5), 12.0).rgb, LW), dot(textureLod(vid, vec2(0.5), 5.0).rgb, LW), 0.6);
    float gn = clamp(pow(0.2 / max(avg, 1e-4), 0.6), 0.6, 3.0);
    vec3 c0 = texture2D(vid, uv).rgb, cb = textureLod(vid, uv, 1.5).rgb;
    vec3 v = max(c0 + (c0 - cb) * 0.8, 0.0) * gn, mc = textureLod(vid, vec2(0.5), 12.0).rgb * gn;
    v = max(mc + (v - mc) * 1.35, 0.0);   // 去霧：以整張的平均色為中心拉開對比，遠處不會灰濛濛
    float l = dot(v, LW);
    v = max(mix(vec3(l), v, 1.3), 0.0);
    v = mix(v, 0.6 + 0.3 * (1.0 - exp((0.6 - v) / 0.3)), step(0.6, v));
    // 開機、換目標：先閃一下黑白熱像，再轉成彩色
    v = mix(v, vec3(pow(clamp(l * 1.6, 0.0, 1.0), 0.8)) * vec3(0.72, 0.86, 0.88), mono);
    v *= 1.0 + (h1(floor(uv * vec2(320.0, 240.0)) + fract(time * 7.13)) - 0.5) * (0.04 + 0.2 * mono);
    v *= 1.0 - 0.45 * dot(vUv - 0.5, vUv - 0.5);
    v += fl * vec3(0.5, 0.48, 0.42);   // 命中閃光
    // 沒目標：暗底＋淡淡的雜訊
    vec3 bg = vec3(0.012, 0.075, 0.1) * (0.8 + 0.4 * h1(floor(p / 3.0) + fract(time * 3.1)));
    vec3 c = mix(bg, v, live);
    vec4 o = texture2D(ovl, vUv);
    c = mix(c, o.rgb * br, o.a);
    gl_FragColor = vec4(c, op * max(mix(0.6, 0.97, live), o.a));
  }`;

// 全景螢幕的球面：只負責「面板接縫與窄邊框、邊緣暗角、開機、中彈雜訊、覺醒紅光」——外面的景色是城市那一層早就畫好的，這裡不必再畫一次。
// 輸出＝預先乘好透明度的顏色：alpha＝把外面蓋暗多少，rgb＝額外加上去的光。
const DOME_FRAG = `
  uniform float boot, time, hurt, od, alert; varying vec3 vP;
  float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vP);
    float lat = degrees(asin(clamp(d.y, -1.0, 1.0)));
    float lon = degrees(atan(d.x, -d.z));
    // 面板：每排高 12°，每排片數依緯度調整（每片差不多大），上下排錯開半片；
    // 正前方剛好是一片面板的正中央——準心附近不會有接縫
    float rv = (lat + 6.0) / 12.0 + 8.0, row = floor(rv);
    float n = max(6.0, floor(30.0 * cos(radians(row * 12.0 - 96.0)) + 0.5));
    float cu = lon / 360.0 * n + 0.5 + 0.5 * mod(row, 2.0);
    vec2 id = vec2(row, mod(floor(cu), n));
    float hv = h1(id);
    // 離最近的接縫幾個像素（線條永遠約 1 像素寬，不會鋸齒）
    float fr = fwidth(rv), fu = min(fwidth(lon) / 360.0 * n, 0.25);
    float px = min(min(fract(rv), 1.0 - fract(rv)) / max(fr, 1e-5), min(fract(cu), 1.0 - fract(cu)) / max(fu, 1e-5));
    float seam = 1.0 - smoothstep(0.3, 1.2, px);
    float bez = 1.0 - smoothstep(1.2, 3.4, px);   // 接縫兩側 2～3 像素的深色窄邊框
    float edge = 1.0 - smoothstep(0.0, 6.0, px);
    // 面板邊緣暗角：離接縫 1.5° 以內稍微暗一點（面板中間完全乾淨）
    float dg = min(min(fract(rv), 1.0 - fract(rv)) * 12.0, min(fract(cu), 1.0 - fract(cu)) * 360.0 / n * cos(radians(lat)));
    float vig = 0.07 * (1.0 - smoothstep(0.0, 1.5, dg));
    // 開機：從正前方往外，一片一片亮起來（亮起前邊緣會先閃）
    float ang = degrees(acos(clamp(-d.z, -1.0, 1.0)));
    float th = 0.5 + 0.24 * ang / 180.0 + 0.1 * hv;
    float on = clamp((boot - th) / 0.025, 0.0, 1.0);
    float pre = smoothstep(th - 0.12, th, boot) * (1.0 - on) * step(0.45, fract(time * 7.0 + hv * 5.0));
    float post = on * exp(-max(boot - th, 0.0) * 40.0);
    vec3 cy = vec3(0.3, 1.4, 2.0);
    float occ = max(max(1.0 - on, seam * 0.38), max(bez * 0.14, 0.03 * hv));
    occ += (1.0 - occ) * vig * on;
    vec3 emit = cy * (edge * (pre * 0.3 + post * 1.4) + post * 0.1);
    // 中彈：幾片面板閃雜訊
    float g = hurt > 0.001 ? step(h1(id + mod(floor(time * 20.0), 61.0) * 1.37), hurt * 0.55) : 0.0;
    float ln = step(0.5, fract(gl_FragCoord.y * 0.2 + time * 37.0));
    occ = max(occ, g * (0.4 + 0.35 * ln));
    emit += g * ln * vec3(0.2, 0.45, 0.6) * 0.3;
    // 覺醒：接縫發紅光；耐久低：接縫紅色脈動
    emit += vec3(2.2, 0.16, 0.1) * (seam + edge * 0.1) * (od * 0.6 + alert);
    gl_FragColor = vec4(emit, occ);
  }`;

// ---------------------------------------------------------------- 駕駛艙
export class Cockpit {
  constructor(world, camera, scene, cam) {
    this.world = world; this.camera = camera; this.scene = scene; this.cam = cam;
    this.root = new THREE.Group();
    scene.add(this.root);
    // 全像頁的底座：掛在艙體底下（跟著艙體一起顯示／隱藏），但每幀抵銷艙體的晃動＝固定在眼前
    this.holoRoot = new THREE.Group();
    this.holoRoot.matrixAutoUpdate = false;
    this.root.add(this.holoRoot);
    this.hLag = new THREE.Vector3();
    scene.environment = world.envMap;
    scene.environmentIntensity = 0.15;
    this.t = 0;
    this.baseFov = camera.fov;
    this.eyeLocal = new THREE.Vector3(0, 2.75, 1.25);   // 胸口（軀幹骨頭座標）
    this.off = new THREE.Vector3(); this.offV = new THREE.Vector3();
    this.prevEye = new THREE.Vector3(); this.prevVel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.inited = false;
    this.sp = { p: 0, pv: 0, r: 0, rv: 0, y: 0, yv: 0 };   // 旋轉晃動彈簧
    this.vib = 0; this.fovKick = 0;
    this.flash = { c: new THREE.Color(), i: 0 };
    this.hurtT = 0;
    this.screenT = 0;
    this.win = 1;      // 全景螢幕亮了多少（開機時 0→1）
    this.domeB = 1;    // 球幕映進艙內的亮度（看向太陽那邊比較亮）
    this.bl = 1;       // 儀表背光（自動亮度）
    this.odV = 0;

    this.makeMaterials();
    this.build();
    this.makeLights();
    this.buildLayers();
    monoFont(() => { this.legend.draw(); this.legend.tex.needsUpdate = true; this.buildLayers(); });
  }

  makeMaterials() {
    const grunge = grungeTex(), fab = fabricTex(), knurl = knurlTex();
    const std = (c, m, r, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, side: THREE.DoubleSide, ...o });
    this.M = {
      frame: wear(std(0x3b4247, 0.8, 0.42, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.4 }), 0.8, 0xa9aeb2),
      panel: wear(std(0x272d32, 0.45, 0.6, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.35 }), 1.0, 0x9ca2a7),   // 深灰烤漆
      shell: wear(std(0xcfd4d7, 0.06, 0.38, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.15 }), 1.1, 0x878e93),  // 白色烤漆外殼
      matte: std(0x0f1113, 0.1, 0.82),
      white: wear(std(0xb4babe, 0.05, 0.45, { roughnessMap: grunge }), 0.9, 0x5f666b),
      orange: wear(std(0xd4661c, 0.05, 0.5), 1.0, 0x8e959a),
      rubber: std(0x0d0d0e, 0.0, 0.88, { bumpMap: knurl, bumpScale: 0.9 }),   // 防滑橡膠
      chrome: std(0xa0a6ac, 1.0, 0.22),
      anod: std(0x1b1f24, 0.85, 0.36, { roughnessMap: grunge }),              // 黑色陽極處理（旋鈕、握把頭、按鍵框）
      anodB: std(0x2f5474, 0.9, 0.32),                                         // 藍色陽極（螺絲）
      guard: wear(std(0xb3261a, 0.25, 0.42, { roughnessMap: grunge }), 1.3, 0xd2d2d2),   // 紅色護蓋
      stripe: std(0xffffff, 0.1, 0.55, { map: stripeTex() }),                 // 黃黑條紋
      glove: std(0x2d2a27, 0.0, 0.6, { bumpMap: fab, bumpScale: 0.6 }),       // 皮革手套
      sleeve: std(0x1b2740, 0.0, 0.78, { bumpMap: fab, bumpScale: 0.8 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x000000 }),   // 扶手燈條（顏色每幀依狀態變）
    };
    const L = labelTex();
    this.labels = L;
    this.M.label = new THREE.MeshStandardMaterial({ map: L.tex, transparent: true, alphaTest: 0.2, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    // 背光按鍵：沒亮＝灰字；背光＝字發淡青白光（亮度每幀依儀表電源與外面亮度調）
    this.legend = legendTex();
    this.M.key = new THREE.MeshStandardMaterial({ color: 0x3c4146, map: this.legend.tex, emissive: 0xc8f2ff, emissiveMap: this.legend.tex, emissiveIntensity: 0, roughness: 0.45, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 });
    // 儀表畫面（畫在 canvas 上，每秒更新 15 次）：全像視窗的背景是半透明的
    const [sc, sx] = canvas(1024, 1024);
    this.sc = sc; this.sx = sx;
    this.screenTex = new THREE.CanvasTexture(sc);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    this.M.screen = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.45, 1.45, 1.45) });
  }

  build() {
    const M = this.M, P = new Parts(), S = new Parts(), GL = new Parts(), Lb = new Parts(), KY = new Parts(), r = rng(7);
    this.lampDefs = [];
    this.maskBoxes = [];
    this.ann = [];
    const lamp = (base, pos, kind, rot = null) => {
      const m = new THREE.Matrix4().compose(_p.set(...pos), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')) : _q.identity(), _s.set(1, 1, 1));
      if (base) m.premultiply(base);
      this.lampDefs.push({ m, kind, ph: Math.random() * 10 });
    };
    const label = (base, name, pos, h = 0.011, rot = [-Math.PI / 2, 0, 0]) => {
      const rc = this.labels.rect[name];
      const g = atlasPlane(h * rc[2] / rc[3], h, rc, this.labels.W, this.labels.H);
      Lb.base = base; Lb.add(M.label, g, pos, rot); Lb.base = null;
    };
    // 背光按鍵字樣（貼在鍵帽頂面）
    const key = (base, name, pos) => { KY.base = base; KY.add(M.key, atlasPlane(0.0155, 0.0112, this.legend.rect[name], 1024, 512), pos, [-Math.PI / 2, 0, 0]); KY.base = null; };
    // 螺絲：藍色陽極圓頭＋一字槽（跟著 P 目前的底座座標）
    const screw = (pos) => { P.add(M.anodB, cyl(0.0023, 0.0012, 8), pos); P.add(M.matte, new THREE.BoxGeometry(0.0034, 0.0005, 0.0007), [pos[0], pos[1] + 0.0006, pos[2]], [0, r() * 3, 0]); };
    // 深度遮罩用的盒子（比實體小一圈，保證藏在實體裡面）
    const mask = (base, w, h, d, pos) => {
      const g = new THREE.BoxGeometry(w, h, d).translate(...pos);
      if (base) g.applyMatrix4(base);
      this.maskBoxes.push(g);
    };

    // ---- 全景螢幕：包住飛行員的一顆球
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 96, 48), new THREE.ShaderMaterial({
      uniforms: { boot: { value: 1 }, time: { value: 0 }, hurt: { value: 0 }, od: { value: 0 }, alert: { value: 0 } },
      vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: DOME_FRAG,
      transparent: true, premultipliedAlpha: true, depthWrite: false, side: THREE.BackSide,
    }));
    dome.renderOrder = -1;
    dome.frustumCulled = false;
    this.dome = dome;
    this.root.add(dome);

    // ---- 扶手台：後段讓手臂靠（白色外殼、深色底座、內緣藍色燈條），中間是操縱桿座，
    //      前段往外斜、朝向飛行員的小控制台（小螢幕、背光按鍵、指示燈、旋鈕、護蓋開關、彈射拉環／警示燈、全像投影鏡頭）
    for (const sx of [-1, 1]) {
      const X = sx * 0.3;
      P.add(M.panel, rb(0.14, 0.08, 0.5, 0.03), [X, -0.52, -0.36]);
      mask(null, 0.11, 0.05, 0.44, [X, -0.52, -0.36]);
      P.add(M.shell, rb(0.15, 0.018, 0.46, 0.008), [X, -0.475, -0.35]);
      P.add(M.shell, rb(0.016, 0.06, 0.44, 0.007), [X + sx * 0.074, -0.515, -0.34]);
      P.add(M.orange, rb(0.003, 0.01, 0.3, 0.0015), [X + sx * 0.0825, -0.5, -0.33]);
      GL.add(M.glow, rb(0.005, 0.004, 0.4, 0.0018), [X - sx * 0.068, -0.4655, -0.34]);
      // 上蓋分段的面板線＋固定螺絲＋噴漆字
      for (const z of [-0.2, -0.44]) P.add(M.matte, rb(0.128, 0.0014, 0.002, 0.0006), [X + sx * 0.006, -0.4658, z]);
      for (const z of [-0.15, -0.26, -0.39]) for (const dd of [-0.052, 0.058]) screw([X + sx * dd, -0.4654, z]);
      label(null, sx < 0 ? 'NO STEP' : 'XG-01', [X + sx * 0.012, -0.4655, -0.31], 0.0085);
      // 操縱桿座：底盤＋陽極飾圈＋六顆螺絲＋發光環
      P.add(M.matte, cyl(0.046, 0.014, 28), [X, -0.461, -0.51]);
      P.add(M.anod, cyl(0.042, 0.002, 32), [X, -0.4532, -0.51]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; screw([X + Math.cos(a) * 0.037, -0.4518, -0.51 + Math.sin(a) * 0.037]); }
      GL.add(M.glow, new THREE.TorusGeometry(0.048, 0.0022, 6, 48), [X, -0.4545, -0.51], [Math.PI / 2, 0, 0]);
      // 前段小控制台（自己的座標：頂面＝+Y、前方＝−Z、+Z＝靠飛行員）；稍微抬高、往外、朝飛行員傾斜，才不會躲在手後面
      const base = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.4, -0.49, -0.74), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.28, -sx * 0.45, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      P.base = S.base = GL.base = base;
      P.add(M.panel, rb(0.16, 0.05, 0.25, 0.018), [0, -0.026, 0]);
      mask(base, 0.13, 0.03, 0.21, [0, -0.026, 0]);
      P.add(M.panel, rb(0.15, 0.012, 0.24, 0.006), [0, 0.0, 0.0]);
      P.add(M.shell, rb(0.014, 0.034, 0.25, 0.006), [sx * 0.08, -0.008, 0.0]);
      P.add(M.shell, rb(0.14, 0.03, 0.016, 0.006), [0, -0.01, -0.12]);
      P.add(M.orange, rb(0.13, 0.0012, 0.003, 0.0005), [0, 0.0056, -0.1155]);
      // 面板線、四角螺絲
      for (const z of [-0.087, 0.05]) P.add(M.matte, rb(0.14, 0.0012, 0.0016, 0.0005), [0, 0.0062, z]);
      for (const zz of [-0.108, 0.108]) for (const xx of [-0.066, 0.066]) screw([xx, 0.0066, zz]);
      // 小螢幕（頂面、偏前）＋螢幕下緣四顆小按鍵
      P.add(M.matte, rb(0.136, 0.006, 0.048, 0.003), [0, 0.006, -0.06]);
      S.add(M.screen, atlasPlane(0.12, 0.03, SCR[sx < 0 ? 'wave' : 'bars'], 1024, 1024), [0, 0.0095, -0.06], [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) P.add(M.anod, rb(0.011, 0.004, 0.005, 0.0015), [-0.045 + i * 0.03, 0.0075, -0.03]);
      // 背光按鍵 6×2：陽極框＋鍵帽＋字樣
      const names = sx < 0 ? KEYS.slice(0, 12) : KEYS.slice(12);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) {
        const kx = -0.056 + i * 0.0224, kz = -0.008 + j * 0.022;
        P.add(M.anod, rb(0.0198, 0.003, 0.0168, 0.0012), [kx, 0.0072, kz]);
        P.add(M.matte, rb(0.017, 0.008, 0.014, 0.003), [kx, 0.009, kz]);
        key(base, names[i + j * 6], [kx, 0.01305, kz]);
      }
      // 指示燈一排
      for (let i = 0; i < 5; i++) lamp(base, [-0.032 + i * 0.016, 0.0072, 0.036], ['ok', 'sys', 'idle', 'ok', 'warn'][(i + (sx > 0 ? 2 : 0)) % 5], [-Math.PI / 2, 0, 0]);
      label(base, sx < 0 ? 'SYS 1' : 'FCS', [0, 0.0068, -0.1], 0.0105);
      // 旋鈕（內側遠端）：鍍鉻底圈＋黑色陽極旋鈕＋白色指示線
      const kx = -sx * 0.042;
      P.add(M.chrome, cyl(0.0115, 0.002, 28), [kx, 0.007, -0.1]);
      P.add(M.anod, cyl(0.0085, 0.01, 24), [kx, 0.013, -0.1]);
      P.add(M.anod, cyl(0.0068, 0.003, 24), [kx, 0.0195, -0.1]);
      P.add(M.white, rb(0.0014, 0.0008, 0.006, 0.0003), [kx, 0.0212, -0.1025], [0, sx * 0.6, 0]);
      label(base, 'BRT', [kx - sx * 0.02, 0.0068, -0.1], 0.006);
      // 全像投影鏡頭（外側遠端）
      P.add(M.chrome, cyl(0.014, 0.012, 20), [sx * 0.045, 0.005, -0.1]);
      GL.add(M.glow, cyl(0.009, 0.013, 20), [sx * 0.045, 0.006, -0.1]);
      // 靠飛行員那一段：左＝主武裝保險（掀蓋開關，已掀開）＋彈射拉環；右＝主注意／主警告燈＋覺醒保險（覺醒時自己掀開）
      const ix = -sx * 0.034, ox = sx * 0.036;
      if (sx < 0) {
        P.add(M.matte, rb(0.034, 0.004, 0.026, 0.002), [ix, 0.0065, 0.078]);
        P.add(M.stripe, new THREE.TorusGeometry(0.012, 0.0032, 8, 20, Math.PI), [ix, 0.0085, 0.08], [-1.0, 0, 0]);
        label(base, 'EJECT', [ix, 0.0068, 0.1], 0.0075);
        this.toggle(base, [ox, 0.006, 0.076], true);
        label(base, 'MASTER ARM', [ox, 0.0068, 0.102], 0.0055);
      } else {
        P.add(M.anod, rb(0.036, 0.004, 0.042, 0.0015), [ix, 0.0075, 0.08]);
        for (const [k, z] of [['mc', 0.07], ['wn', 0.09]]) {
          P.add(M.matte, rb(0.032, 0.004, 0.016, 0.0015), [ix, 0.0095, z]);
          const mat = new THREE.MeshBasicMaterial({ map: this.legend.tex, color: 0x000000, polygonOffset: true, polygonOffsetFactor: -2 });
          const m = new THREE.Mesh(atlasPlane(0.03, 0.0145, this.legend.rect[k], 1024, 512), mat);
          m.matrixAutoUpdate = false;
          m.matrix.compose(_p.set(ix, 0.01155, z), _q.setFromEuler(_e.set(-Math.PI / 2, 0, 0)), _s.set(1, 1, 1)).premultiply(base);
          this.root.add(m);
          this.ann.push({ k, mat });
        }
        this.ovrd = this.toggle(base, [ox, 0.006, 0.076], false);
        label(base, 'OVRD', [ox, 0.0068, 0.102], 0.0065);
      }
      P.base = S.base = GL.base = null;
    }

    P.build(this.root); S.build(this.root); GL.build(this.root); Lb.build(this.root); KY.build(this.root);

    // ---- 指示燈（同一個 InstancedMesh，每盞顏色各自變）
    const lg = rb(0.011, 0.0065, 0.004, 0.0015);
    this.lamps = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lampDefs.length);
    this.lampDefs.forEach((d, i) => { this.lamps.setMatrixAt(i, d.m); this.lamps.setColorAt(i, _c.setRGB(0, 0, 0)); });
    this.root.add(this.lamps);

    // ---- 全像視窗：飄在周圍，面向飛行員；每片自己一個材質（才能各自閃、各自跳出來）；掛在 holoRoot（固定在眼前）
    this.holos = HOLO.map((o) => {
      const mat = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.5, 1.5, 1.5), transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(atlasPlane(o.w, o.h, SCR[o.k], 1024, 1024), mat);
      const g = new THREE.Group();
      facing(o.a * D, o.e * D, o.d).decompose(g.position, g.quaternion, g.scale);
      g.add(mesh);
      mesh.renderOrder = 1;
      this.holoRoot.add(g);
      return { ...o, mesh, gl: 0, ph: Math.random() * 10 };
    });
    this.buildTgp();

    // ---- 兩支操縱桿＋手
    this.sticks = [this.buildStick(1), this.buildStick(-1)];
  }

  // 掀蓋開關：底板＋六角螺帽＋撥桿＋紅色護蓋（open＝掀開、撥桿推上＝ARM）；回傳可動的護蓋與撥桿
  toggle(base, pos, open) {
    const M = this.M, G = new THREE.Group(), T = new THREE.Group();
    base.decompose(G.position, G.quaternion, G.scale);
    T.position.set(...pos); G.add(T);
    const fx = new Parts(), lv = new Parts(), gd = new Parts();
    fx.add(M.anod, rb(0.024, 0.003, 0.032, 0.0012), [0, 0.0015, 0]);
    fx.add(M.chrome, cyl(0.0042, 0.003, 6), [0, 0.0045, 0]);
    fx.build(T);
    const lever = new THREE.Group(); lever.position.y = 0.005; T.add(lever);
    lv.add(M.chrome, new THREE.CylinderGeometry(0.001, 0.0016, 0.012, 10), [0, 0.006, 0]);
    lv.add(M.chrome, new THREE.SphereGeometry(0.002, 10, 8), [0, 0.0125, 0]);
    lv.build(lever);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.003, -0.014); T.add(hinge);
    gd.add(M.guard, rb(0.019, 0.0016, 0.026, 0.0007), [0, 0.0172, 0.013]);
    for (const k of [-1, 1]) gd.add(M.guard, rb(0.0016, 0.017, 0.026, 0.0007), [k * 0.0087, 0.0088, 0.013]);
    gd.add(M.guard, rb(0.019, 0.017, 0.0016, 0.0007), [0, 0.0088, 0.0254]);
    gd.build(hinge);
    this.root.add(G);
    const o = { hinge, lever, k: open ? 1 : 0 };
    this.setToggle(o, o.k);
    return o;
  }
  setToggle(o, k) { o.hinge.rotation.x = -1.95 * k; o.lever.rotation.x = k > 0.7 ? -0.45 : 0.45; }

  // 操縱桿與戴手套的手（右手；左手鏡像）；握把頭有帽型開關、武器釋放鈕（紅）、扳機
  buildStick(side) {
    const M = this.M, P = new Parts(), V = (x, y, z) => new THREE.Vector3(x, y, z);
    const base = new THREE.Group();
    base.position.set(side * 0.3, -0.455, -0.51);
    base.scale.x = side;
    const pivot = new THREE.Group();
    pivot.rotation.set(-0.22, 0, 0.24, 'YXZ');
    base.add(pivot);
    this.root.add(base);
    // 蛇腹護套、桿身
    const pts = [];
    for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector2(0.03 + (i % 2) * 0.006 - i * 0.0012, i * 0.0038));
    P.add(M.rubber, new THREE.LatheGeometry(pts, 16));
    P.add(M.chrome, cyl(0.011, 0.05), [0, 0.06, 0]);
    // 握把座標：握把軸＝+Y，從桿頂 y＝0.075 開始
    const gp = new Parts();
    gp.add(M.anod, cyl(0.017, 0.012), [0, 0.006, 0]);
    gp.add(M.chrome, cyl(0.0175, 0.002, 20), [0, 0.0125, 0]);
    gp.add(M.rubber, new THREE.CapsuleGeometry(0.021, 0.075, 4, 16), [0, 0.07, 0], [0, 0, 0], [1, 1, 1.12]);
    gp.add(M.anod, rb(0.046, 0.028, 0.058, 0.01), [0, 0.135, -0.006], [-0.15, 0, 0]);
    gp.add(M.panel, rb(0.04, 0.004, 0.05, 0.002), [0, 0.1495, -0.004], [-0.15, 0, 0]);   // 頂蓋（烤漆，邊緣掉漆）
    gp.add(M.rubber, cyl(0.0065, 0.009, 10), [-0.008, 0.152, -0.02]);
    // 帽型開關（四向）：底座＋十字鍵帽
    gp.add(M.anod, cyl(0.0058, 0.004, 12), [0.012, 0.1535, -0.022]);
    gp.add(M.rubber, rb(0.0105, 0.003, 0.0034, 0.001), [0.012, 0.1565, -0.022]);
    gp.add(M.rubber, rb(0.0034, 0.003, 0.0105, 0.001), [0.012, 0.1565, -0.022]);
    // 武器釋放鈕（紅）＋防誤觸護圈
    gp.add(M.guard, cyl(0.0048, 0.005, 14), [0.013, 0.153, 0.007]);
    gp.add(M.anod, new THREE.TorusGeometry(0.0064, 0.0013, 6, 18), [0.013, 0.1545, 0.007], [Math.PI / 2, 0, 0]);
    // 扳機（兩段式金屬扳機）
    gp.add(M.chrome, rb(0.009, 0.026, 0.006, 0.0025), [0, 0.104, -0.031], [0.25, 0, 0]);
    gp.add(M.anod, rb(0.012, 0.004, 0.016, 0.0015), [0, 0.119, -0.028], [0.1, 0, 0]);
    // 手掌（在握把右側，掌心朝握把）
    gp.add(M.glove, rb(0.026, 0.09, 0.085, 0.012), [0.035, 0.072, 0.03]);
    // 手指：從指根繞過握把前方到左側
    const finger = (y, r, k, idx = false) => {
      const P0 = V(0.034, y, -0.014);
      const path = idx
        ? [P0, V(0.018 * k, y, -0.045 * k), V(-0.004, y - 0.004, -0.05 * k), V(-0.017, y - 0.008, -0.042 * k)]
        : [P0, V(0.016 * k, y - 0.002, -0.042 * k), V(-0.016 * k, y - 0.004, -0.034 * k), V(-0.03 * k, y - 0.006, -0.011 * k), V(-0.026 * k, y - 0.007, 0.006 * k)];
      for (let i = 0; i < path.length - 1; i++) gp.seg(M.glove, path[i], path[i + 1], r * (1 - i * 0.06));
      gp.add(M.glove, new THREE.SphereGeometry(r * 1.2, 12, 8), [P0.x, P0.y, P0.z]);
    };
    finger(0.11, 0.0092, 1, true);
    finger(0.088, 0.0096, 0.92);
    finger(0.066, 0.0092, 0.9);
    finger(0.046, 0.0082, 0.86);
    // 拇指（壓在頂部按鈕上）
    gp.add(M.glove, new THREE.SphereGeometry(0.017, 12, 10), [0.03, 0.1, 0.03], [0, 0, 0], [0.8, 1, 1.1]);
    gp.seg(M.glove, V(0.028, 0.105, 0.034), V(0.018, 0.13, 0.016), 0.012);
    gp.seg(M.glove, V(0.018, 0.13, 0.016), V(0.004, 0.146, -0.002), 0.011);
    gp.seg(M.glove, V(0.004, 0.146, -0.002), V(-0.005, 0.152, -0.012), 0.0102);
    // 手背護板、指節護板（淺灰複合材料，邊緣磨損）
    gp.add(M.white, rb(0.008, 0.07, 0.062, 0.004), [0.0505, 0.075, 0.032]);
    gp.add(M.orange, rb(0.009, 0.011, 0.064, 0.003), [0.051, 0.1, 0.032]);
    gp.add(M.white, rb(0.012, 0.082, 0.022, 0.005), [0.043, 0.078, -0.012], [0, -0.3, 0]);
    // 手腕、護腕、袖子（往後下方出畫面）
    gp.seg(M.glove, V(0.035, 0.066, 0.07), V(0.04, 0.052, 0.11), 0.026);
    gp.seg(M.white, V(0.04, 0.052, 0.105), V(0.045, 0.043, 0.15), 0.033, 0.034);
    gp.seg(M.orange, V(0.045, 0.043, 0.15), V(0.046, 0.041, 0.158), 0.0345, 0.0345);
    gp.seg(M.sleeve, V(0.046, 0.041, 0.155), V(0.08, -0.09, 0.46), 0.036, 0.047);
    const grip = new THREE.Group();
    grip.position.y = 0.075;
    gp.build(grip);
    pivot.add(grip);
    P.build(pivot);
    return { base, pivot, grip, side, tx: 0, tz: 0, rec: 0 };
  }

  makeLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x050608, 0.6);   // 螢幕映出的天光
    this.key = new THREE.DirectionalLight(0xffffff, 0);             // 艙內反射回來的補光（從背後打）
    this.key.position.set(0.2, 0.5, 1);
    this.sunL = new THREE.DirectionalLight(0xffc890, 0);            // 太陽（螢幕上的太陽照進艙內，有影子）
    this.sunL.castShadow = true;
    this.sunL.shadow.mapSize.set(1024, 1024);
    const c = this.sunL.shadow.camera;
    c.left = -1.4; c.right = 1.4; c.top = 1.4; c.bottom = -1.4; c.near = 0.1; c.far = 8;
    this.sunL.shadow.bias = -0.0004; this.sunL.shadow.normalBias = 0.003;
    this.sunL.target.position.set(0, -0.1, -0.4);
    this.conL = new THREE.PointLight(0x7fe8ff, 0, 1.4, 2);          // 儀表光
    this.conL.position.set(0, -0.36, -0.7);
    this.holoL = [-1, 1].map((k) => {                                // 全像頁映在手和扶手上的青光
      const l = new THREE.PointLight(0x6fe6ff, 0, 1.3, 2);
      l.position.set(k * 0.5, -0.12, -0.72);
      return l;
    });
    this.warnL = new THREE.PointLight(0xff2412, 0, 2.5, 2);         // 警示紅燈
    this.warnL.position.set(0, 0.35, -0.2);
    this.flashL = new THREE.PointLight(0xffffff, 0, 3, 2);          // 開火／爆炸閃光
    this.flashL.position.set(0.3, 0.1, -1.2);
    s.add(this.hemi, this.key, this.key.target, this.sunL, this.sunL.target, this.conL, ...this.holoL, this.warnL, this.flashL);
  }

  // 撞擊晃動：kind＝step（落腳）／land（落地）／hit（中彈）／fire（開火）／qb（快速閃避）
  kick(kind, s = 1, dir = 0) {
    const sp = this.sp;
    if (kind === 'step') { sp.pv -= 0.35 * s; sp.rv += dir * 0.16 * s; this.vib = Math.max(this.vib, 0.35 * s); }
    else if (kind === 'land') { sp.pv -= 1.1 * s; this.offV.y -= 1.2 * s; this.vib = Math.max(this.vib, 0.8 * s); }
    else if (kind === 'hit') {
      sp.pv += (Math.random() - 0.6) * 1.4 * s; sp.rv += (dir || (Math.random() - 0.5)) * 1.2 * s; sp.yv += (dir || (Math.random() - 0.5)) * 0.5 * s;
      this.offV.x += (Math.random() - 0.5) * 1.5 * s; this.vib = Math.max(this.vib, 1.2 * s); this.hurtT = 0.35 * s;
    } else if (kind === 'fire') { sp.pv += 0.25 * s; this.vib = Math.max(this.vib, 0.25 * s); this.sticks[0].rec = 1; }
    else if (kind === 'qb') { this.fovKick = Math.max(this.fovKick, 7 * s); this.vib = Math.max(this.vib, 0.7 * s); }
  }
  // 閃光（開火、爆炸）：c＝THREE.Color，i＝強度，pos＝方向（艙內座標，可省略）
  flashAt(c, i, x = 0.3, y = 0.1, z = -1.2) {
    if (i < this.flash.i) return;
    this.flash.c.copy(c); this.flash.i = i;
    this.flashL.position.set(x, y, z);
  }

  // 深度遮罩（放進城市那一層先畫）：扶手台擋住的畫面先填「最近」的深度，
  // 後面的城市、天空、煙在那些像素直接被顯卡跳過——看不到的地方就不算，畫面完全不變。
  // 形狀＝比扶手台實體小一圈的盒子（寧可少遮一點，也不能在邊緣露出一塊黑）。
  depthMask() {
    const g = mergeGeometries(this.maskBoxes.map((b) => b.index ? b.toNonIndexed() : b));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      uniforms: { pm: { value: this.cam.projectionMatrix }, mm: { value: this.root.matrixWorld } },
      // 用駕駛艙鏡頭投影＋艙體晃動，跟扶手台在畫面上的位置一模一樣；深度壓在最前面
      vertexShader: 'uniform mat4 pm, mm; void main() { vec4 p = pm * mm * vec4(position, 1.0); gl_Position = vec4(p.xy, -0.99999 * p.w, p.w); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
      colorWrite: false, depthWrite: true, depthTest: true, depthFunc: THREE.AlwaysDepth,
    }));
    m.frustumCulled = false;
    m.renderOrder = -1e6;
    m.userData.noAO = true;
    m.onBeforeRender = () => this.root.updateMatrixWorld();
    this.dmask = m;   // 瞄準莢艙畫面要暫時關掉（它是貼在主鏡頭上的）
    return m;
  }

  // 每幀：擺鏡頭、擺駕駛艙、更新燈光與儀表
  // ui：{ yaw, pitch（瞄準，機體朝向慣例）, boot, move:{x,y}, turn:{x,y}, boost, hover, speed, alt, vs, ap, apMax, en, parts, rifle, msl, saber, cannon, od, lockAlert, danger, radar, px, pz, route?, wp? }
  update(dt, mech, ui) {
    this.t += dt;
    const cam = this.camera, b = mech.bones;
    // ---- 眼睛位置＋頭部彈簧
    b.torso.updateWorldMatrix(true, false);
    const eye = _v.copy(this.eyeLocal).applyMatrix4(b.torso.matrixWorld);
    const idt = 1 / Math.max(dt, 1e-3);
    if (!this.inited || eye.distanceTo(this.prevEye) > 30) { this.prevEye.copy(eye); this.prevVel.set(0, 0, 0); this.inited = true; }
    const vel = _v2.subVectors(eye, this.prevEye).multiplyScalar(idt);
    this.acc.subVectors(vel, this.prevVel).multiplyScalar(idt).clampLength(0, 160);
    this.prevEye.copy(eye); this.prevVel.copy(vel);
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, W = 13, Z = 0.5;
    for (let i = 0; i < n; i++) {
      for (const k of ['x', 'y', 'z']) {
        const g = k === 'y' ? 0.5 : 0.22;
        this.offV[k] += (-W * W * this.off[k] - 2 * Z * W * this.offV[k] - this.acc[k] * g) * h;
        this.off[k] += this.offV[k] * h;
      }
      const sp = this.sp, w = 17, z = 0.42;
      sp.pv += (-w * w * sp.p - 2 * z * w * sp.pv) * h; sp.p += sp.pv * h;
      sp.rv += (-w * w * sp.r - 2 * z * w * sp.rv) * h; sp.r += sp.rv * h;
      sp.yv += (-w * w * sp.y - 2 * z * w * sp.yv) * h; sp.y += sp.yv * h;
    }
    this.off.x = clamp(this.off.x, -0.12, 0.12); this.off.y = clamp(this.off.y, -0.2, 0.2); this.off.z = clamp(this.off.z, -0.12, 0.12);
    cam.position.copy(eye).add(this.off);

    // ---- 視線：瞄準方向＋一半的機身前傾／側傾＋晃動
    this.vib = Math.max(this.vib * Math.exp(-dt * 7), (ui.boost || 0) * 0.3 + (ui.hover || 0) * 0.15);
    const t = this.t, vb = this.vib;
    const jx = (Math.sin(t * 57) + Math.sin(t * 91) * 0.5) * 0.0035 * vb, jy = (Math.sin(t * 63) + Math.sin(t * 83) * 0.5) * 0.0025 * vb;
    const tX = b.torso.rotation.x + b.pelvis.rotation.x, tZ = b.torso.rotation.z + b.pelvis.rotation.z;
    const tY = mech.legYaw + b.pelvis.rotation.y + b.torso.rotation.y;
    const vp = ui.pitch - 0.5 * tX + this.sp.p * 0.1 + jx;
    const vy = ui.yaw + Math.PI + this.sp.y * 0.08 + jy;
    const vr = -0.5 * tZ + this.sp.r * 0.1;
    cam.quaternion.setFromEuler(_e.set(vp, vy, vr, 'YXZ'));
    this.fovKick = damp(this.fovKick, 0, 4, dt);
    const fov = this.baseFov + (ui.boost || 0) * 5 + this.fovKick;
    if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

    // ---- 駕駛艙相對視線：機身慢半拍（扭轉）、頭部彈簧位移、推進器高頻震
    const rY = clamp(wrap(tY - ui.yaw) * 0.5, -0.07, 0.07);
    const rP = clamp(-0.12 * ui.pitch - 0.5 * tX, -0.12, 0.12) + jx * 1.5;
    const rR = -0.5 * tZ + jy;
    this.root.quaternion.setFromEuler(_e.set(rP, rY, rR, 'YXZ'));
    _q.copy(cam.quaternion).invert();
    this.root.position.copy(this.off).negate().applyQuaternion(_q);
    this.scene.environmentRotation.set(0, -vy, 0);
    // ---- 全像頁：抵銷艙體晃動（固定在眼前），只留頭部晃動造成的幾毫米柔和延遲
    this.hLag.lerp(_v2.copy(this.offV).multiplyScalar(-0.004).clampLength(0, 0.004), 1 - Math.exp(-dt * 8));
    this.root.updateMatrix();
    this.holoRoot.matrix.copy(this.root.matrix).invert().multiply(_m2.makeTranslation(this.hLag.x, this.hLag.y, this.hLag.z));
    this.holoRoot.matrixWorldNeedsUpdate = true;

    // 開機：全景螢幕從正前方往外一片片亮起來
    const bt = ui.boot ?? 1, du = this.dome.material.uniforms;
    this.win = clamp((bt - 0.5) / 0.36, 0, 1);
    this.odV = damp(this.odV, ui.od && ui.od.active ? 1 : 0, 4, dt);
    du.boot.value = bt; du.time.value = this.t; du.hurt.value = this.hurtT; du.od.value = this.odV;
    du.alert.value = ui.danger ? 0.15 + 0.15 * Math.sin(this.t * 7) : 0;
    this.updateLights(dt, ui, _q);
    this.updateHolos(dt, ui);
    this.updateSticks(dt, ui);
    this.updateLamps(dt, ui);
    this.screenT -= dt;
    if (this.screenT <= 0) { this.screenT = 1 / 15; this.drawScreens(ui); }
  }

  // 全像視窗：開機時一條橫線往上下展開（稍微超過再彈回來）；偶爾閃一下，中彈時閃得更兇；外面越亮顯示越亮（自動亮度）
  updateHolos(dt, ui) {
    const bt = ui.boot ?? 1, t = this.t, br = 1.3 + 0.35 * this.domeB;
    let vis = 0;
    const g = this.tg;
    for (const h of this.holos) {
      let k = clamp((bt - h.at) / 0.05, 0, 1);
      if (g && h.k === 'arms') k = Math.min(k, clamp(1 - g.sw * 2, 0, 1));   // 換頁：武裝頁先收成一條線，瞄準莢艙頁再展開
      const u = k - 1;
      h.mesh.visible = k > 0;
      if (!h.mesh.visible) continue;
      vis += k / this.holos.length;
      h.mesh.scale.y = k < 1 ? Math.max(0.03, 1 + 2.70158 * u * u * u + 1.70158 * u * u) : 1;
      if (Math.random() < dt * (0.2 + this.hurtT * 40)) h.gl = 0.05 + Math.random() * 0.08;
      h.gl = Math.max(0, h.gl - dt);
      h.mesh.material.opacity = h.gl > 0 ? 0.3 + Math.random() * 0.35 : 0.9 + 0.06 * Math.sin(t * 11 + h.ph);
      h.mesh.material.color.setScalar(br);
      h.mesh.position.x = h.gl > 0 ? (Math.random() - 0.5) * 0.006 : 0;
    }
    for (const l of this.holoL) l.intensity = 0.07 * vis * (1 - this.hurtT);
    // 瞄準莢艙頁：有目標就換頁（0.32 秒）；跟其他全像頁一樣會閃、中彈時畫面撕裂
    if (!g) return;
    g.sw = clamp(g.sw + (g.want && bt >= 1 ? dt : -dt) / 0.32, 0, 1);
    const k = clamp(g.sw * 2 - 1, 0, 1), u = k - 1, m = g.mesh, U = g.mat.uniforms, S = TGP.big;
    m.visible = k > 0;
    if (!m.visible) return;
    m.scale.set(S, S * (k < 1 ? Math.max(0.03, 1 + 2.70158 * u * u * u + 1.70158 * u * u) : 1), 1);
    if (Math.random() < dt * (0.2 + this.hurtT * 40)) g.gl = 0.05 + Math.random() * 0.08;
    g.gl = Math.max(0, g.gl - dt);
    g.live = damp(g.live, g.T || g.dead > 0 ? 1 : 0, 12, dt);
    U.op.value = g.gl > 0 ? 0.35 + Math.random() * 0.35 : 1;
    U.br.value = br; U.live.value = g.live; U.hurt.value = Math.min(1, this.hurtT * 2.5); U.time.value = t;
    U.mono.value = g.mono; U.fl.value = g.hit * 0.4;
    m.position.x = g.gl > 0 ? (Math.random() - 0.5) * 0.006 : 0;
  }

  // ---------------------------------------------------------------- 瞄準莢艙（TGP）
  // 小畫面（HDR、4× MSAA、帶 mip 給自動曝光與銳化用）＋窄視角彩色攝影機＋符號層（canvas）；面板跟武裝頁同一個位置
  buildTgp() {
    const A = this.holos.find((h) => h.k === 'arms');
    if (!A) return;
    const rt = new THREE.WebGLRenderTarget(TGP.w, TGP.h, { type: THREE.HalfFloatType, samples: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const [oc, ox] = canvas(512, 384), ot = ctex(oc, null, true);
    const mat = new THREE.ShaderMaterial({
      uniforms: { vid: { value: rt.texture }, ovl: { value: ot }, op: { value: 1 }, br: { value: 1.5 }, live: { value: 0 }, hurt: { value: 0 }, time: { value: 0 }, mono: { value: 0 }, fl: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: TG_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(A.w, A.h), mat);
    mesh.renderOrder = 1; mesh.visible = false;
    A.mesh.parent.add(mesh);
    this.tg = {
      rt, cam: new THREE.PerspectiveCamera(30, TGP.w / TGP.h, 2, 8000), oc, ox, ot, mat, mesh, lay: null,
      T: null, at: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), size: 10, veh: false, z: 8, fov: 30,
      dead: 0, none: 9, acq: 0, acc: 0, tt: 0, want: 0, sw: 0, live: 0, gl: 0, lbl: '', cls: '', dist: 0, lk: 0, ap: -1, drawn: '',
      mask: false, mono: 0, hit: 0, pap: -1, pd: 0, vc: 0, rng: 0, lrf: 0, lp: 0, px: 256, py: 192,
    };
  }

  // 主迴圈每幀呼叫一次：targetView(renderer, 世界場景, 鎖定目標或 null)。沒人呼叫＝武裝頁照舊，不會換頁。
  // 目標要有 pos（或 position），可選 chest(v)、kind、label、vehicle、size、dead、locks、ap／apMax、los。
  targetView(renderer, scene, target) {
    const g = this.tg;
    if (!g) return;
    const dt = clamp(this.t - g.tt, 0, 0.1); g.tt = this.t;
    const T = target && !target.dead ? target : null;
    // 目標被擊毀：鏡頭停在殘骸上，等它爆開後再看 1.1 秒（擊殺鏡頭，慢慢拉遠）→ NO TGT → 0.8 秒後換回武裝頁
    if (g.T && g.T !== T) { if (g.T.dead) { g.dead = (g.T.dying || 0) + 1.1; g.hit = 0.4; } g.T = null; }
    if (g.dead > 0) g.dead -= dt;
    else if (T && T !== g.T) {
      g.T = T; g.acq = 0; g.acc = 1; g.pap = -1; g.pd = 0; g.vc = 0; g.lrf = 0.2; g.rng = 0;
      // 開頁：從準心方向、廣角開始，轉過去再推近；換目標：先拉遠再推近
      if (g.sw <= 0) { this.camera.getWorldDirection(g.dir); g.fov = tgFov(1.5); } else g.fov = Math.min(tgFov(1.5), g.fov * 3);
      g.lbl = T.label || { ace: 'ACE', heavy: 'HVY', grunt: 'GNT' }[T.kind] || String(T.kind || 'UNK').toUpperCase().slice(0, 4);
      g.veh = !!T.vehicle;
      g.cls = g.veh ? { tank: 'ARMOR', heli: 'ROTARY', jet: 'FIXED WING' }[T.kind] || 'VEHICLE' : 'MECH';
      g.size = T.size || (g.veh ? ((T.K && T.K.hitR) || 6) * 2 : 21 * (T.scale || 1));
    }
    const on = !!g.T || g.dead > 0;
    g.none = on ? 0 : g.none + dt;
    g.want = on || g.none < 0.8 ? 1 : 0;
    g.hit = Math.max(0, g.hit - dt); g.lp = Math.max(0, g.lp - dt);
    if (!on) { g.mono = 0; g.acc += dt; if (g.want && (g.drawn !== 'none' || g.acc > 0.1)) { g.acc = 0; this.drawTgp(); g.drawn = 'none'; } return; }
    const E = this.camera.position;
    if (g.T) {
      if (g.T.chest) g.T.chest(g.at); else g.at.copy(g.T.pos || g.T.position);
      const am = g.T.apMax || (g.T.K && g.T.K.ap), ap = am ? clamp(g.T.ap / am, 0, 1) : -1;
      if (g.pap >= 0 && ap < g.pap - 1e-4) g.hit = 0.3;   // 打中了：框閃白＋HIT
      g.pap = g.ap = ap; g.lk = g.T.locks || 0; g.mask = g.T.los === false;
    }
    g.acq += dt;
    g.mono = g.T ? clamp(1 - g.acq / 0.35, 0, 1) : 0;
    const d = Math.max(1, g.at.distanceTo(E)); g.dist = d;
    // 接近率（km/h，正＝越來越近）；雷射測距每 0.5 秒打一發，距離讀數跟著更新
    if (dt > 0) { if (g.pd) g.vc = damp(g.vc, (g.pd - d) / dt * 3.6, 3, dt); g.pd = d; }
    g.lrf -= dt;
    if (g.lrf <= 0 && g.T) { g.lrf = 0.5; g.rng = d; g.lp = 0.12; }
    // 自動變焦（連續）：機體佔畫面高、車輛（扁長）佔畫面寬約 45%；擷取時快速推近，之後平順跟著距離；擊殺鏡頭慢慢拉遠
    const zt = clamp(0.9 * d * TAN35 * (g.veh ? 4 / 3 : 1) / g.size / (g.dead > 0 ? 2 : 1), 1.5, 64);
    g.fov = Math.exp(damp(Math.log(g.fov), Math.log(tgFov(zt)), g.dead > 0 ? 1.2 : g.acq < 0.8 ? 7 : 3, dt));
    g.z = TAN35 / Math.tan(g.fov * D / 2);
    g.dir.lerp(_v.copy(g.at).sub(E).normalize(), 1 - Math.exp(-dt * 16)).normalize();
    g.acc += dt;
    if (g.acc < 1 / TGP.hz - 1e-4) return;   // 留一點誤差：60 幀時剛好隔一幀畫一張，不會被浮點數吃掉
    g.acc = Math.min(g.acc - 1 / TGP.hz, 1 / TGP.hz);
    const cam = g.cam, t = this.t, j = g.fov * D * 0.004;
    // 穩定器：畫面幾乎不動，只留一點點自然晃動（跟視角成比例，放大多少倍看起來都一樣輕）
    _tr.crossVectors(g.dir, UP).normalize(); _tu.crossVectors(_tr, g.dir);
    _v.copy(g.dir).addScaledVector(_tr, j * (Math.sin(t * 5.3) + 0.5 * Math.sin(t * 11.7 + 2))).addScaledVector(_tu, j * (Math.sin(t * 4.1 + 1) + 0.5 * Math.sin(t * 9.3)));
    cam.position.copy(E); cam.lookAt(_v.add(E));
    // 近端裁掉自己機體的槍管、手臂（莢艙裝在機體外，本來就看不到）
    cam.fov = g.fov; cam.near = clamp(d * 0.3, 2, 30); cam.far = Math.min(12000, d + 3000); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // 太陽影子沿用主畫面算好的（不重畫影子圖）；不做 AO、Bloom 等後製；駕駛艙深度遮罩貼在主鏡頭上，先關掉
    const pt = renderer.getRenderTarget(), au = renderer.shadowMap.autoUpdate, ac = renderer.autoClear, mk = this.dmask, mv = mk && mk.visible;
    renderer.shadowMap.autoUpdate = false; renderer.autoClear = true; if (mk) mk.visible = false;
    renderer.setRenderTarget(g.rt); renderer.render(scene, cam);
    renderer.setRenderTarget(pt); renderer.shadowMap.autoUpdate = au; renderer.autoClear = ac; if (mk) mk.visible = mv;
    // 目標在小畫面上的位置：框跟著目標走（不是死釘在正中間）
    _v.copy(g.at).project(cam); g.px = (_v.x * 0.5 + 0.5) * 512; g.py = (0.5 - _v.y * 0.5) * 384;
    this.drawTgp(); g.drawn = 'live';
  }

  // 靜態圖層：上下兩條暗帶（按鍵標籤看得清楚）＋按鍵標籤＋外框
  tgpLayer() {
    const W = 512, H = 384, [c, x] = canvas(W, H);
    x.save(); this.panelPath(x, W, H); x.clip();
    for (const [y0, y1] of [[0, 40], [H, H - 40]]) {
      const gr = x.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, 'rgba(2,14,20,0.72)'); gr.addColorStop(1, 'rgba(2,14,20,0)');
      x.fillStyle = gr; x.fillRect(0, Math.min(y0, y1), W, 40);
    }
    x.restore();
    this.osb(x, W, H, PAGE.tgp);
    this.panelFrame(x, W, H);
    return c;
  }
  // 疊字（黑邊，壓在影像上也看得清楚）
  tq(x, s, px, py, col, sz, b = false, al = 'left') {
    x.font = `${b ? 700 : 400} ${sz}px ${MONO}`; x.textAlign = al; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 5; x.strokeStyle = 'rgba(0,10,14,0.7)'; x.strokeText(s, px, py);
    x.fillStyle = col; x.fillText(s, px, py);
  }
  // 疊字＋暗底小框（壓在很亮的影像上也看得清楚）
  tb(x, s, px, py, col, sz, b = false, al = 'left') {
    x.font = `${b ? 700 : 400} ${sz}px ${MONO}`;
    const w = x.measureText(s).width, x0 = al === 'right' ? px - w : al === 'center' ? px - w / 2 : px;
    x.fillStyle = 'rgba(2,14,20,0.78)'; x.fillRect(x0 - 5, py - sz * 0.62, w + 10, sz * 1.24);
    this.tq(x, s, px, py, col, sz, b, al);
  }
  // 符號層：中央十字線、目標框（跟著目標走；擷取時從外面收進來、咬住時縮一下再彈回）、種類與耐久、倍率、雷射測距、接近率、方位／仰角、追蹤狀態；
  // 打中＝框閃白＋HIT；擊毀＝DESTROYED（畫面停在爆炸上）；沒目標＝NO TGT
  drawTgp() {
    const g = this.tg, x = g.ox, W = 512, H = 384, cx = W / 2, cy = H / 2, t = this.t;
    const live = !!g.T || g.dead > 0, dead = !g.T && g.dead > 0, acq = !!g.T && g.acq < 0.45, lock = !!g.T && g.lk > 0;
    x.clearRect(0, 0, W, H);
    if (!g.lay) g.lay = this.tgpLayer();
    x.drawImage(g.lay, 0, 0);
    x.lineCap = 'butt'; x.lineJoin = 'miter';
    const stroke = (path, col, w = 2) => { x.beginPath(); path(); x.lineWidth = w + 3; x.strokeStyle = 'rgba(0,10,14,0.5)'; x.stroke(); x.lineWidth = w; x.strokeStyle = col; x.stroke(); };
    // 中央十字線（莢艙光軸，中間留空）＋每 36 像素一個刻度
    stroke(() => {
      x.moveTo(14, cy); x.lineTo(cx - 34, cy); x.moveTo(cx + 34, cy); x.lineTo(W - 14, cy);
      x.moveTo(cx, 44); x.lineTo(cx, cy - 34); x.moveTo(cx, cy + 34); x.lineTo(cx, H - 44);
      for (let i = 1; i <= 6; i++) {
        const o = 34 + i * 36;
        if (cx + o < W - 20) { x.moveTo(cx - o, cy - 4); x.lineTo(cx - o, cy + 4); x.moveTo(cx + o, cy - 4); x.lineTo(cx + o, cy + 4); }
        if (cy + o < H - 50) { x.moveTo(cx - 4, cy - o); x.lineTo(cx + 4, cy - o); x.moveTo(cx - 4, cy + o); x.lineTo(cx + 4, cy + o); }
      }
    }, live ? 'rgba(230,246,248,0.6)' : 'rgba(111,240,255,0.3)', 1.5);
    if (!live) {
      if (Math.sin(t * 5) > -0.4) this.tq(x, 'NO TGT', cx, cy + 58, COL.dim, 30, true, 'center');
    } else {
      if (!dead) {
        // 目標框：大小跟著目標在畫面上的大小（車輛扁長、機體高瘦）
        const f = g.size / (2 * g.dist * Math.tan(g.fov * D / 2)), a = g.acq / 0.45;
        let bh = Math.max(16, f * H * (g.veh ? 0.18 : 0.5));
        bh *= a < 1 ? 1 + 1.6 * (1 - a) ** 2 : a < 1.45 ? 1 - 0.12 * Math.sin((a - 1) / 0.45 * Math.PI) : 1;
        bh = Math.min(bh, cy - 50);
        const bw = Math.min(bh * (g.veh ? 2.6 : 0.75), cx - 24), L = Math.min(bw, bh) * 0.4;
        const px = clamp(g.px, bw + 8, W - bw - 8), py = clamp(g.py, bh + 44, H - bh - 44);
        const hot = g.hit > 0.12 || (a >= 1 && a < 1.45), col = hot ? '#ffffff' : lock ? COL.am : acq ? COL.cy : g.mask ? COL.rd : COL.wh;
        x.globalAlpha = 0.4; stroke(() => x.rect(px - bw, py - bh, bw * 2, bh * 2), col, 1); x.globalAlpha = 1;
        stroke(() => {
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            x.moveTo(px + sx * bw, py + sy * (bh - L)); x.lineTo(px + sx * bw, py + sy * bh); x.lineTo(px + sx * (bw - L), py + sy * bh);
          }
        }, col, hot ? 4 : 3);
        // 雷射光點：每次測距閃一下
        if (g.lp > 0) stroke(() => { x.moveTo(g.px, g.py - 7); x.lineTo(g.px + 7, g.py); x.lineTo(g.px, g.py + 7); x.lineTo(g.px - 7, g.py); x.closePath(); }, COL.gr, 2);
        if (g.hit > 0) this.tb(x, 'HIT', px, Math.max(58, py - bh - 16), COL.am, 18, true, 'center');
      } else if (Math.sin(t * 14) > -0.3) {
        x.fillStyle = 'rgba(40,4,2,0.6)'; x.fillRect(cx - 118, H - 140, 236, 46);
        stroke(() => x.rect(cx - 118, H - 140, 236, 46), COL.rd, 2);
        this.tq(x, 'DESTROYED', cx, H - 116, COL.rd, 30, true, 'center');
      }
      // 左上：目標種類＋類別＋耐久（％）；右上：倍率
      this.tb(x, g.lbl, 18, 62, dead ? COL.rd : COL.wh, 28, true);
      x.font = `700 28px ${MONO}`;
      this.tb(x, g.cls, 36 + x.measureText(g.lbl).width, 62, COL.cy, 15);
      if (g.ap >= 0) {
        const ap = dead ? 0 : g.ap, ac = ap > 0.3 ? COL.cy : COL.rd;
        x.fillStyle = 'rgba(2,14,20,0.78)'; x.fillRect(13, 79, 170, 17);
        this.hb(x, 18, 84, 110, 7, ap, ac); this.tq(x, `${pad(ap * 100)}%`, 178, 88, ap > 0.3 ? COL.wh : COL.rd, 15, true, 'right');
      }
      this.tb(x, `×${g.z < 10 ? g.z.toFixed(1) : Math.round(g.z)}`, W - 18, 62, COL.wh, 28, true, 'right');
      this.tb(x, 'AUTO', W - 18, 90, COL.cy, 15, false, 'right');
      // 下排：雷射測距（L 亮＝剛打一發）、接近率、方位／仰角、追蹤狀態（ACQ 擷取中、TRK 追蹤中、MASK 被建築擋住、LOCK 飛彈已鎖定）
      const b = ((-Math.atan2(g.dir.x, g.dir.z) / D) % 360 + 360) % 360, el = Math.asin(clamp(g.dir.y, -1, 1)) / D;
      this.tb(x, `RNG ${g.rng ? pad(g.rng, 4) : '----'}`, 18, H - 56, COL.wh, 20, true);
      const lx = 30 + x.measureText('RNG 0000').width;
      if (g.lp > 0) { x.fillStyle = COL.gr; x.fillRect(lx, H - 67, 20, 22); this.tx(x, 'L', lx + 10, H - 55, COL.bg, 16, true, 'center'); }
      else { x.fillStyle = 'rgba(2,14,20,0.6)'; x.fillRect(lx, H - 67, 20, 22); stroke(() => x.rect(lx, H - 67, 20, 22), COL.gr, 1.5); this.tq(x, 'L', lx + 10, H - 55, COL.gr, 16, true, 'center'); }
      if (!dead) this.tb(x, `VC ${g.vc < 0 ? '-' : '+'}${pad(Math.abs(g.vc))}`, 18, H - 84, COL.cy, 16);
      this.tb(x, `B${pad(b % 360)} E${el < 0 ? '-' : '+'}${pad(Math.abs(el), 2)}`, cx + 40, H - 56, COL.cy, 16, false, 'center');
      if (!dead) {
        const st = lock ? 'LOCK' : acq ? 'ACQ' : g.mask ? 'MASK' : 'TRK', sc = lock ? COL.am : acq ? COL.cy : g.mask ? COL.rd : COL.gr;
        const bx = W - 16 - 76, by = H - 70;
        if (lock) { x.fillStyle = sc; x.fillRect(bx, by, 76, 28); this.tx(x, st, bx + 38, by + 15, COL.bg, 20, true, 'center'); }
        else if (!acq || Math.sin(t * 20) > 0) { x.fillStyle = 'rgba(2,14,20,0.6)'; x.fillRect(bx, by, 76, 28); stroke(() => x.rect(bx, by, 76, 28), sc, 2); this.tq(x, st, bx + 38, by + 15, sc, 20, true, 'center'); }
      }
    }
    // 中彈雜訊
    if (this.hurtT > 0.05) {
      for (let k = 0; k < 8; k++) {
        x.fillStyle = `rgba(${150 + Math.random() * 100},${200 + Math.random() * 55},255,${Math.random() * 0.5 * this.hurtT * 3})`;
        x.fillRect(0, Math.random() * H, W, 2 + Math.random() * 10);
      }
    }
    g.ot.needsUpdate = true;
  }

  updateSticks(dt, ui) {
    const mv = ui.move || { x: 0, y: 0 }, tn = ui.turn || { x: 0, y: 0 };
    for (const s of this.sticks) {
      // 左桿＝移動；右桿＝轉向（跟著滑鼠）
      const tx = s.side < 0 ? mv.y * 0.22 + (ui.boost || 0) * 0.1 : -clamp(tn.y, -1, 1) * 0.16;
      const tz = s.side < 0 ? -mv.x * 0.2 * s.side : -clamp(tn.x, -1, 1) * 0.2;
      s.tx = damp(s.tx, tx, 10, dt); s.tz = damp(s.tz, tz, 10, dt);
      s.rec = Math.max(0, s.rec - dt * 7);
      s.pivot.rotation.x = -0.22 - s.tx + s.rec * 0.04;
      s.pivot.rotation.z = 0.24 + s.tz;
      s.grip.position.z = s.rec * 0.006;
    }
    // 覺醒保險：覺醒時護蓋掀開、撥桿推上
    if (this.ovrd) { const o = this.ovrd; o.k = damp(o.k, ui.od && ui.od.active ? 1 : 0, 9, dt); this.setToggle(o, o.k); }
  }

  updateLights(dt, ui, qInv) {
    const w = this.world, boot = ui.boot ?? 1;
    const win = this.win;                                   // 全景螢幕亮了多少
    const ins = clamp((boot - 0.12) / 0.2, 0, 1);          // 儀表電源
    // 球幕映進艙內的亮度：看向太陽那邊比較亮、中彈雜訊時暗一點
    const sd = _v.copy(w.lightDir).applyQuaternion(qInv);   // 太陽方向（艙內座標）
    const sf = Math.max(0, -sd.z);
    this.domeB = damp(this.domeB, win * (0.82 + 0.4 * sf * sf) * (1 - Math.min(0.45, this.hurtT)), 3, dt);
    const B = this.domeB;
    // 螢幕映出的天光
    this.hemi.color.copy(w.fogColor).multiplyScalar(1.3);
    this.hemi.groundColor.setRGB(0.015, 0.016, 0.018);
    this.hemi.intensity = 0.5 * B + 0.015;
    this.key.color.copy(w.fogColor).lerp(_c.setRGB(1, 0.85, 0.7), 0.4);
    this.key.intensity = 0.35 * B;
    this.scene.environmentIntensity = 0.04 + 0.18 * B;
    // 太陽：整圈都是螢幕，從哪邊都照得進來
    this.sunL.position.copy(this.sunL.target.position).addScaledVector(sd, 4);
    this.sunL.color.copy(w.sun.color);
    this.sunL.intensity = 2.6 * win;
    // 儀表背光（自動亮度）：外面越亮開越大，暗的時候收小不刺眼
    this.bl = ins * (0.6 + 0.45 * B);
    this.conL.intensity = 0.05 * ins + 0.03 * this.bl;
    this.M.key.emissiveIntensity = 1.15 * this.bl;
    this.M.screen.color.setScalar(1.1 + 0.45 * B);
    // 扶手燈條：平常藍色；耐久低時紅色閃；覺醒時變紅
    const dgB = ui.danger ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
    this.M.glow.color.setRGB(0.25, 1.3, 2.0).lerp(_c.setRGB(2.4, 0.15, 0.1), Math.max(dgB, this.odV * 0.85)).multiplyScalar(ins * (0.75 + 0.3 * B));
    // 警示燈：被鎖定慢閃、危險快閃
    const la = ui.lockAlert || 0, dg = ui.danger ? 1 : 0;
    const blink = dg ? (Math.sin(this.t * 14) > 0 ? 1 : 0.1) : la > 0.01 ? (Math.sin(this.t * (la > 0.7 ? 22 : 9)) > 0 ? 1 : 0) : 0;
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.warnL.intensity = (0.25 * blink * Math.max(dg, la) + this.hurtT * 0.8) + (boot < 0.15 ? 0.06 : 0);
    // 閃光
    this.flash.i = Math.max(0, this.flash.i - dt * this.flash.i * 9 - dt * 2);
    this.flashL.color.copy(this.flash.c);
    this.flashL.intensity = this.flash.i;
  }

  updateLamps(dt, ui) {
    const boot = ui.boot ?? 1, t = this.t, g = 0.75 + 0.35 * this.domeB;
    const on = clamp((boot - 0.3) / 0.15, 0, 1);
    const la = ui.lockAlert || 0, dg = !!ui.danger;
    this.lampDefs.forEach((d, i) => {
      let r = 0, gg = 0, b = 0;
      const k = (Math.sin(t * 2.3 + d.ph * 7) > 0.2) ? 1 : 0.25;
      switch (d.kind) {
        case 'ok': r = 0.15; gg = 1.9; b = 0.5; break;
        case 'idle': r = 2.2; gg = 1.1; b = 0.1; if (k < 1) { r *= 0.2; gg *= 0.2; b *= 0.2; } break;
        case 'sys': r = 0.3; gg = 1.6; b = 2.4; if (Math.sin(t * 5 + d.ph * 3) > 0.85) { r *= 0.2; gg *= 0.2; b *= 0.2; } break;
        case 'boost': { const v = (ui.boost || 0) + (ui.hover || 0); r = 0.4 * v + 0.05; gg = 1.8 * v + 0.1; b = 3 * v + 0.15; break; }
        case 'warn': { const on2 = dg || la > 0.01 ? (Math.sin(t * (dg ? 14 : 9)) > 0 ? 1 : 0.08) : 0.04; r = 3.2 * on2; gg = 0.18 * on2; b = 0.08 * on2; break; }
      }
      const f = d.kind === 'warn' ? 1 : on * g;
      this.lamps.setColorAt(i, _c.setRGB(r * f, gg * f, b * f));
    });
    this.lamps.instanceColor.needsUpdate = true;
    // 主注意（琥珀、常亮）／主警告（紅、閃）：沒亮時燈罩是暗的，字隱約看得到
    const rf = ui.rifle || {}, pc = ui.parts || {}, apR = (ui.ap ?? 1) / (ui.apMax || 1);
    const caut = la > 0.3 || rf.reload >= 0 || (rf.ammo ?? 9) <= 3 || apR < 0.55 || Object.values(pc).some((v) => v < 0.3);
    const warn = dg || la > 0.85;
    for (const a of this.ann) {
      const lit = on > 0 && (a.k === 'mc' ? caut : warn && Math.sin(t * 12) > -0.3);
      if (a.k === 'mc') a.mat.color.setRGB(2.2, 1.35, 0.25).multiplyScalar(lit ? 1 : 0.05 * on + 0.02);
      else a.mat.color.setRGB(2.6, 0.2, 0.12).multiplyScalar(lit ? 1 : 0.05 * on + 0.02);
    }
  }

  // ---------------------------------------------------------------- 儀表畫面
  // 靜態圖層（底色、細格線、按鍵標籤、頁名、外框、掃描線）先畫好，每次更新只貼上去再畫會變的內容
  buildLayers() {
    this.lay = {};
    for (const k of Object.keys(SCR)) {
      const W = SCR[k][2], H = SCR[k][3], solid = SOLID.has(k);
      const [bc, bx] = canvas(W, H), [fc, fx] = canvas(W, H);
      bx.save();
      if (solid) { bx.fillStyle = COL.bg; bx.fillRect(0, 0, W, H); }
      else {
        this.panelPath(bx, W, H); bx.clip();
        const g = bx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(6,30,40,0.66)'); g.addColorStop(1, 'rgba(2,14,20,0.54)');
        bx.fillStyle = g; bx.fillRect(0, 0, W, H);
        // 邊緣微亮（全像投影的邊光）
        const e = bx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        e.addColorStop(0, 'rgba(111,240,255,0)'); e.addColorStop(1, 'rgba(111,240,255,0.08)');
        bx.fillStyle = e; bx.fillRect(0, 0, W, H);
      }
      this.grid(bx, W, H);
      bx.restore();
      if (!solid) this.osb(bx, W, H, PAGE[k]);
      // 掃描線（全像頁要切在外形裡）＋外框
      fx.save();
      if (!solid) { this.panelPath(fx, W, H); fx.clip(); }
      fx.fillStyle = solid ? 'rgba(0,0,0,0.2)' : 'rgba(140,240,255,0.045)';
      for (let y = 0; y < H; y += 3) fx.fillRect(0, y, W, 1);
      fx.restore();
      if (solid) { fx.strokeStyle = 'rgba(0,0,0,0.6)'; fx.lineWidth = 6; fx.strokeRect(0, 0, W, H); }
      else this.panelFrame(fx, W, H);
      this.lay[k] = { bg: bc, fg: fc };
    }
    if (this.tg) this.tg.lay = null;   // 瞄準莢艙的靜態圖層下次畫的時候重做（字型載好了）
  }

  drawScreens(ui) {
    const x = this.sx, boot = ui.boot ?? 1;
    x.clearRect(0, 0, 1024, 1024);
    const on = (at) => clamp((boot - at) / 0.06, 0, 1);
    const scr = [['wave', 0.1], ['bars', 0.12], ...HOLO.map((o) => [o.k, o.at])];
    for (const [k, at] of scr) {
      const r = SCR[k], o = on(at), W = r[2], H = r[3], solid = SOLID.has(k), L = this.lay[k];
      if (o <= 0 || (k === 'arms' && this.tg && this.tg.sw >= 0.5)) continue;   // 換成瞄準莢艙頁時武裝頁不用畫
      x.save();
      x.translate(r[0], r[1]);
      x.drawImage(L.bg, 0, 0);
      x.save();
      if (solid) { x.beginPath(); x.rect(0, 0, W, H); } else this.panelPath(x, W, H);
      x.clip();
      x.lineCap = 'butt'; x.lineJoin = 'miter';
      if (o < 1) this.drawBoot(x, W, H, o, k);
      else this['draw' + k[0].toUpperCase() + k.slice(1)](x, W, H, ui);
      // 中彈雜訊
      if (this.hurtT > 0.05) {
        for (let k2 = 0; k2 < 10; k2++) {
          x.fillStyle = `rgba(${150 + Math.random() * 100},${200 + Math.random() * 55},255,${Math.random() * 0.5 * this.hurtT * 3})`;
          x.fillRect(0, Math.random() * H, W, 2 + Math.random() * 10);
        }
      }
      x.restore();
      x.drawImage(L.fg, 0, 0);
      x.restore();
    }
    this.screenTex.needsUpdate = true;
  }
  // 全像視窗外形：左上、右下切角
  panelPath(x, w, h) {
    const c = Math.min(w, h) * 0.1, i = 3;
    x.beginPath();
    x.moveTo(i + c, i); x.lineTo(w - i, i); x.lineTo(w - i, h - i - c); x.lineTo(w - i - c, h - i); x.lineTo(i, h - i); x.lineTo(i, i + c); x.closePath();
  }
  // 細外框＋四個角的亮框線
  panelFrame(x, w, h) {
    const c = Math.min(w, h) * 0.1, L = Math.min(w, h) * 0.12, i = 4;
    x.strokeStyle = 'rgba(111,240,255,0.5)'; x.lineWidth = 2;
    this.panelPath(x, w, h); x.stroke();
    x.strokeStyle = COL.cy; x.lineWidth = 4; x.lineJoin = 'miter';
    x.beginPath();
    x.moveTo(i, i + c + L); x.lineTo(i, i + c); x.lineTo(i + c, i); x.lineTo(i + c + L, i);
    x.moveTo(w - i - L, i); x.lineTo(w - i, i); x.lineTo(w - i, i + L);
    x.moveTo(w - i, h - i - c - L); x.lineTo(w - i, h - i - c); x.lineTo(w - i - c, h - i); x.lineTo(w - i - c - L, h - i);
    x.moveTo(i + L, h - i); x.lineTo(i, h - i); x.lineTo(i, h - i - L);
    x.stroke();
  }
  // 細格線：16 像素小格、64 像素大格
  grid(x, w, h) {
    x.lineWidth = 1;
    for (const [s, c] of [[16, COL.line], [64, COL.line2]]) {
      x.strokeStyle = c; x.beginPath();
      for (let i = s; i < w; i += s) { x.moveTo(i + 0.5, 0); x.lineTo(i + 0.5, h); }
      for (let j = s; j < h; j += s) { x.moveTo(0, j + 0.5); x.lineTo(w, j + 0.5); }
      x.stroke();
    }
  }
  // 按鍵標籤（OSB）：邊上的小刻線＝按鍵位置，旁邊是功能名；上排第一個＝目前頁（反白框）
  osb(x, W, H, pg) {
    if (!pg || !pg.t) return;
    const sz = W >= 512 ? 20 : 17;
    const row = (list, top) => list.forEach((s, i) => {
      const px = W * (i + 1) / (list.length + 1), py = top ? 24 : H - 22;
      x.fillStyle = COL.dim; x.fillRect(px - 1, top ? 5 : H - 12, 2, 7);
      x.font = `700 ${sz}px ${MONO}`;
      if (top && i === 0) {
        const tw = x.measureText(s).width + 12;
        x.fillStyle = 'rgba(111,240,255,0.85)'; x.fillRect(px - tw / 2, py - sz * 0.62, tw, sz * 1.24);
        this.tx(x, s, px, py + 1, COL.bg, sz, true, 'center');
      } else this.tx(x, s, px, py + 1, COL.dim, sz, false, 'center');
    });
    row(pg.t, true);
    if (pg.b) row(pg.b, false);
    const side = (list, right) => list.forEach((s, i) => {
      const py = H * (i + 1) / (list.length + 1);
      x.fillStyle = COL.dim; x.fillRect(right ? W - 12 : 5, py - 1, 7, 2);
      this.tx(x, s, right ? W - 16 : 16, py, COL.dim, 16, false, right ? 'right' : 'left');
    });
    if (pg.l) side(pg.l, false);
    if (pg.r) side(pg.r, true);
  }
  // 螢幕文字（等寬航電字）
  tx(x, s, px, py, col, sz, b = false, al = 'left') {
    x.font = `${b ? 700 : 400} ${sz}px ${MONO}`; x.textAlign = al; x.textBaseline = 'middle'; x.fillStyle = col; x.fillText(s, px, py);
  }
  // 橫條：底色＋填色＋四分刻度
  hb(x, px, py, w, h, v, col) {
    x.fillStyle = COL.grid; x.fillRect(px, py, w, h);
    x.fillStyle = col; x.fillRect(px, py, w * clamp(v, 0, 1), h);
    x.fillStyle = COL.bg; for (let i = 1; i < 4; i++) x.fillRect(px + w * i / 4 - 1, py, 2, h);
  }

  // 開機自我檢測（BIT）：頁名＋進度條
  drawBoot(x, w, h, o, name) {
    const pg = PAGE[name] || {}, big = w >= 512;
    x.globalAlpha = Math.random() < 0.3 ? 0.45 : 1;
    this.tx(x, 'BIT  ' + (pg.n || name.toUpperCase()), w * 0.08, h * 0.4, COL.cy, big ? 30 : 20, true);
    x.strokeStyle = COL.cy; x.lineWidth = 2; x.strokeRect(w * 0.08, h * 0.52, w * 0.84, h * 0.06);
    x.fillStyle = COL.cy; x.fillRect(w * 0.08, h * 0.52, w * 0.84 * o, h * 0.06);
    this.tx(x, `IN PROG  ${pad(o * 100)}%`, w * 0.08, h * 0.68, COL.dim, big ? 20 : 15);
    x.globalAlpha = 1;
  }

  // 雷達／導航頁（機頭朝上）：距離環、羅盤、掃描、光點（機甲／載具／殘骸／飛彈）、鎖定框、前進路線與目標點、航向框
  drawRadar(x, w, h, ui) {
    const cx = w / 2, cy = h / 2 + 14, R = 186, range = 600, k = R / range, t = this.t;
    const yaw = ui.yaw || 0, sa = Math.sin(yaw), ca = Math.cos(yaw);
    x.lineWidth = 2;
    // 距離環（內兩圈虛線）
    x.strokeStyle = COL.grid; x.setLineDash([8, 10]); x.beginPath();
    for (const r of [200, 400]) { x.moveTo(cx + r * k, cy); x.arc(cx, cy, r * k, 0, Math.PI * 2); }
    x.stroke(); x.setLineDash([]);
    x.strokeStyle = COL.dim; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
    this.tx(x, '200', cx + 200 * k * 0.72 + 6, cy - 200 * k * 0.72, COL.dim, 15);
    this.tx(x, '400', cx + 400 * k * 0.72 + 6, cy - 400 * k * 0.72, COL.dim, 15);
    // 視野扇形
    x.strokeStyle = COL.grid; x.beginPath();
    for (const s of [-1, 1]) { x.moveTo(cx, cy); x.lineTo(cx + Math.sin(s * 50 * D) * R, cy - Math.cos(50 * D) * R); }
    x.stroke();
    // 羅盤刻度：每 10° 一格、30° 長格；北方跟著機頭轉
    x.strokeStyle = COL.dim; x.beginPath();
    for (let d = 0; d < 360; d += 10) {
      const a = d * D + yaw, r0 = d % 30 === 0 ? R + 12 : R + 6;
      x.moveTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); x.lineTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
    }
    x.stroke();
    for (let d = 0; d < 360; d += 90) { const a = d * D + yaw; this.tx(x, 'NESW'[d / 90], cx + Math.sin(a) * (R - 18), cy - Math.cos(a) * (R - 18), d === 0 ? COL.am : COL.dim, 22, true, 'center'); }
    // 掃描線
    const sw = (t * 2.4) % (Math.PI * 2);
    if (x.createConicGradient) {
      const g = x.createConicGradient(sw - Math.PI / 2 - 1.2, cx, cy);
      g.addColorStop(0, 'rgba(111,240,255,0)'); g.addColorStop(0.19, 'rgba(111,240,255,0.22)'); g.addColorStop(0.191, 'rgba(111,240,255,0)'); g.addColorStop(1, 'rgba(111,240,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    }
    // 光點
    x.lineWidth = 2;
    for (const o of ui.radar || []) {
      const dx = o.x - (ui.px || 0), dz = o.z - (ui.pz || 0);
      const f = dx * sa + dz * ca, r = -dx * ca + dz * sa;
      let px = cx + r * k, py = cy - f * k;
      const dist = Math.hypot(px - cx, py - cy);
      const edge = dist > R - 6;
      if (edge) { px = cx + (px - cx) / dist * (R - 6); py = cy + (py - cy) / dist * (R - 6); }
      const ang = Math.atan2(px - cx, -(py - cy));
      const age = ((sw - ang) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      x.globalAlpha = edge ? 0.6 : 1 - age / (Math.PI * 2) * 0.65;
      if (o.kind === 'missile') { x.fillStyle = COL.am; x.beginPath(); x.arc(px, py, 5, 0, Math.PI * 2); x.fill(); }
      else if (o.kind === 'wreck') { x.strokeStyle = '#5a6a70'; x.beginPath(); x.moveTo(px - 6, py - 6); x.lineTo(px + 6, py + 6); x.moveTo(px + 6, py - 6); x.lineTo(px - 6, py + 6); x.stroke(); }
      else if (o.kind === 'tank' || o.kind === 'apc' || o.kind === 'heli' || o.kind === 'jet') {
        // 載具：小一號（戰車／裝甲車＝方塊、直升機＝圓點、戰鬥機＝三角形）
        x.fillStyle = '#ff8a6a';
        if (o.kind === 'heli') { x.beginPath(); x.arc(px, py, 5.5, 0, Math.PI * 2); x.fill(); }
        else if (o.kind === 'jet') { x.beginPath(); x.moveTo(px, py - 8); x.lineTo(px + 6, py + 6); x.lineTo(px - 6, py + 6); x.closePath(); x.fill(); }
        else x.fillRect(px - 5, py - 5, 10, 10);
        if (o.locked) { x.strokeStyle = COL.wh; x.strokeRect(px - 10, py - 10, 20, 20); }
      } else {
        const s = o.kind === 'heavy' ? 13 : o.kind === 'ace' ? 12 : 10;
        x.fillStyle = o.kind === 'ace' ? '#ff7b3a' : COL.rd;
        x.beginPath(); x.moveTo(px, py - s); x.lineTo(px + s, py); x.lineTo(px, py + s); x.lineTo(px - s, py); x.closePath(); x.fill();
        if (o.locked) { x.strokeStyle = COL.wh; x.strokeRect(px - s - 6, py - s - 6, (s + 6) * 2, (s + 6) * 2); }
      }
      x.globalAlpha = 1;
    }
    // 遭遇戰：前進路線（流動虛線）＋目標點（菱形，超出範圍就貼在圈邊）
    const tr = (X, Z) => { const dx = X - (ui.px || 0), dz = Z - (ui.pz || 0); return [cx + (-dx * ca + dz * sa) * k, cy - (dx * sa + dz * ca) * k]; };
    if (ui.route && ui.route.length > 3) {
      x.save(); x.beginPath(); x.arc(cx, cy, R - 4, 0, Math.PI * 2); x.clip();
      x.strokeStyle = 'rgba(111,240,255,0.5)'; x.lineWidth = 6; x.setLineDash([16, 12]); x.lineDashOffset = -t * 40;
      x.beginPath();
      for (let i = 0; i < ui.route.length; i += 2) { const [X, Y] = tr(ui.route[i], ui.route[i + 1]); if (i) x.lineTo(X, Y); else x.moveTo(X, Y); }
      x.stroke(); x.restore();
    }
    if (ui.wp) {
      let [X, Y] = tr(ui.wp.x, ui.wp.z);
      const d = Math.hypot(X - cx, Y - cy);
      if (d > R - 14) { X = cx + (X - cx) / d * (R - 14); Y = cy + (Y - cy) / d * (R - 14); }
      const s = 13 + Math.sin(t * 5) * 2;
      x.strokeStyle = COL.cy; x.lineWidth = 3; x.fillStyle = 'rgba(111,240,255,0.3)';
      x.beginPath(); x.moveTo(X, Y - s); x.lineTo(X + s, Y); x.lineTo(X, Y + s); x.lineTo(X - s, Y); x.closePath(); x.fill(); x.stroke();
    }
    // 自機
    x.fillStyle = COL.cy; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 8, cy + 8); x.lineTo(cx, cy + 4); x.lineTo(cx - 8, cy + 8); x.closePath(); x.fill();
    // 航向框（框下緣對準羅盤正上方）：往右轉數字變大
    const hdg = Math.round(((-yaw / D) % 360 + 360) % 360) % 360;
    x.fillStyle = COL.bg; x.fillRect(cx - 36, cy - R - 44, 72, 30);
    x.strokeStyle = COL.cy; x.lineWidth = 2; x.strokeRect(cx - 36, cy - R - 44, 72, 30);
    this.tx(x, pad(hdg), cx, cy - R - 28, COL.wh, 24, true, 'center');
    const ne = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    this.tx(x, `HOSTILE ${ne}`, 18, h - 58, ne ? COL.rd : COL.dim, 20, true);
    this.tx(x, 'RNG 600', w - 18, h - 58, COL.dim, 18, false, 'right');
  }

  // 系統頁：機體損傷圖（各部位完整度）、裝甲、能量、平衡、冷卻、射控
  drawStatus(x, w, h, ui) {
    const pc = ui.parts || {}, t = this.t;
    const col = (v) => (v === undefined || v > 0.6) ? COL.cy : v > 0.3 ? COL.am : (Math.sin(t * 10) > 0 ? COL.rd : '#5a1410');
    // 機體剪影（正面）：半透明填色＋外框
    const ox = 116, oy = 66;
    const part = (v, pts) => {
      x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(ox + a, oy + b) : x.moveTo(ox + a, oy + b))); x.closePath();
      x.globalAlpha = 0.32; x.fillStyle = col(v); x.fill(); x.globalAlpha = 1; x.strokeStyle = col(v); x.lineWidth = 2.5; x.stroke();
    };
    part(pc.head, [[-12, 0], [12, 0], [15, 22], [-15, 22]]);
    part(pc.torso, [[-44, 28], [44, 28], [36, 92], [22, 118], [-22, 118], [-36, 92]]);
    part(pc.armR, [[-50, 28], [-88, 34], [-92, 128], [-66, 132], [-56, 60]]);
    part(pc.armL, [[50, 28], [88, 34], [92, 128], [66, 132], [56, 60]]);
    part(pc.legR, [[-24, 124], [-4, 124], [-8, 226], [-40, 232], [-36, 180]]);
    part(pc.legL, [[24, 124], [4, 124], [8, 226], [40, 232], [36, 180]]);
    this.tx(x, 'XG-01', 20, 56, COL.wh, 20, true);
    // 右半：裝甲、能量、各部位、狀態
    const ap = ui.ap ?? 1, apMax = ui.apMax ?? 1, en = ui.en ?? 1, f = clamp(ap / apMax, 0, 1), X0 = 236, WW = 258;
    this.tx(x, 'ARMOR', X0, 58, COL.dim, 19);
    this.tx(x, `${Math.round(f * 100)}%`, X0 + WW, 58, f > 0.3 ? COL.cy : COL.rd, 20, true, 'right');
    this.tx(x, Math.round(ap).toLocaleString('en-US'), X0, 94, f > 0.3 ? COL.wh : COL.rd, 48, true);
    this.hb(x, X0, 122, WW, 10, f, f > 0.3 ? COL.cy : COL.rd);
    this.tx(x, 'EN CELL', X0, 150, COL.dim, 19);
    this.tx(x, `${Math.round(en * 100)}%`, X0 + WW, 150, en > 0.25 ? COL.cy : COL.am, 20, true, 'right');
    this.hb(x, X0, 164, WW, 6, en, en > 0.25 ? COL.cy : COL.am);
    const rows = [['HEAD', pc.head], ['TRSO', pc.torso], ['ARM L', pc.armL], ['ARM R', pc.armR], ['LEG L', pc.legL], ['LEG R', pc.legR]];
    rows.forEach(([n, v], i) => {
      const px = X0 + (i % 2) * 136, py = 194 + Math.floor(i / 2) * 26;
      this.tx(x, n, px, py, COL.dim, 17);
      this.tx(x, pad((v ?? 1) * 100), px + 118, py, col(v), 18, true, 'right');
    });
    const air = ui.hover || (ui.alt || 0) > 3;
    this.tx(x, 'BAL', X0, 284, COL.dim, 17); this.tx(x, air ? 'AIR' : 'OK', X0 + 118, 284, air ? COL.am : COL.gr, 18, true, 'right');
    this.tx(x, 'FCS', X0 + 136, 284, COL.dim, 17); this.tx(x, 'LINK', X0 + 254, 284, COL.gr, 18, true, 'right');
    this.tx(x, 'COOL', X0, 310, COL.dim, 17); this.tx(x, `${Math.round(62 + (1 - en) * 30 + (ui.boost || 0) * 8)}°C`, X0 + 118, 310, COL.wh, 18, true, 'right');
    this.tx(x, 'GEN', X0 + 136, 310, COL.dim, 17); this.tx(x, 'ON', X0 + 254, 310, COL.gr, 18, true, 'right');
  }

  // 武裝頁（存量管理）：主武裝保險、光束步槍（彈匣格、換彈）、飛彈莢艙（鎖定／冷卻）、光劍、覺醒
  drawArms(x, w, h, ui) {
    const t = this.t, L = 16, Rr = w - 16;
    this.tx(x, 'MSTR ARM', L, 56, COL.dim, 17); this.tx(x, 'ARM', L + 104, 56, COL.gr, 18, true);
    // 右手：光束步槍
    const rf = ui.rifle || { ammo: 12, mag: 12, reload: -1 };
    this.tx(x, 'GUN', L, 88, COL.dim, 18); this.tx(x, 'BEAM RIFLE', L + 50, 88, COL.wh, 19);
    this.tx(x, pad(rf.ammo, 2), Rr - 46, 82, rf.ammo > 0 ? COL.wh : COL.rd, 42, true, 'right');
    this.tx(x, `/${rf.mag}`, Rr, 88, COL.dim, 18, false, 'right');
    const cw = (w - 32 + 6) / rf.mag;
    for (let i = 0; i < rf.mag; i++) { x.fillStyle = i < rf.ammo ? COL.pk : COL.grid; x.fillRect(L + i * cw, 110, cw - 6, 14); }
    if (rf.reload >= 0) { this.hb(x, L, 130, w - 32 - 60, 6, rf.reload, COL.am); this.tx(x, 'RLD', Rr, 133, COL.am, 16, true, 'right'); }
    // 左肩：飛彈莢艙
    const ms = ui.msl || { ready: 6, max: 6, cd: 1, locks: 0 };
    this.tx(x, 'MSL', L, 158, COL.dim, 18); this.tx(x, `MISSILE ×${ms.max}`, L + 50, 158, COL.wh, 19);
    this.tx(x, ms.locks ? `LOCK ${ms.locks}` : ms.cd >= 1 ? 'READY' : 'LOAD', Rr, 158, ms.locks ? COL.rd : ms.cd >= 1 ? COL.gr : COL.am, 22, true, 'right');
    const pw = (w - 32 + 8) / ms.max;
    for (let i = 0; i < ms.max; i++) {
      const px = L + i * pw, c = i < ms.locks ? COL.rd : ms.cd >= 1 ? COL.cy : COL.grid;
      x.fillStyle = c; x.beginPath(); x.moveTo(px, 180); x.lineTo(px + pw - 22, 180); x.lineTo(px + pw - 8, 190); x.lineTo(px + pw - 22, 200); x.lineTo(px, 200); x.closePath(); x.fill();
    }
    if (ms.cd < 1) this.hb(x, L, 208, w - 32, 5, ms.cd, COL.am);
    // 光劍
    const sb = ui.saber ?? 1;
    this.tx(x, 'SBR', L, 230, COL.dim, 18); this.tx(x, 'BEAM SABER', L + 50, 230, COL.wh, 19);
    this.tx(x, sb >= 1 ? 'READY' : `${Math.round(sb * 100)}%`, Rr, 230, sb >= 1 ? COL.gr : COL.am, 20, true, 'right');
    // 光波砲：充能中閃、冷卻中顯示百分比
    const cn = ui.cannon || { cd: 1, phase: null };
    this.tx(x, 'CAN', L, 260, COL.dim, 18); this.tx(x, 'BEAM CANNON', L + 50, 260, COL.wh, 19);
    const cs = cn.phase === 'charge' ? 'CHARGE' : cn.phase === 'fire' ? 'FIRE' : cn.cd >= 1 ? 'READY [E]' : `${Math.round(cn.cd * 100)}%`;
    this.tx(x, cs, Rr, 260, cn.phase ? (Math.sin(t * 20) > 0 ? COL.cy : COL.wh) : cn.cd >= 1 ? COL.gr : COL.am, 20, true, 'right');
    if (cn.cd < 1 && !cn.phase) this.hb(x, L, 274, w - 32, 5, cn.cd, COL.am);
    // 覺醒
    const od = ui.od || { gauge: 0, active: false }, full = od.gauge >= 1;
    this.tx(x, 'OD', L, 298, COL.dim, 18); this.tx(x, 'OVERDRIVE', L + 50, 298, COL.wh, 19);
    this.tx(x, od.active ? 'ACTIVE' : full ? 'READY [Q]' : `${Math.floor(od.gauge * 100)}%`, Rr, 298, od.active ? COL.rd : full ? COL.am : COL.dim, 20, true, 'right');
    x.fillStyle = COL.grid; x.fillRect(L, 312, w - 32, 20);
    x.fillStyle = od.active ? COL.rd : full ? (Math.sin(t * 8) > 0 ? COL.am : '#8a5a1a') : COL.am;
    x.fillRect(L, 312, (w - 32) * clamp(od.gauge, 0, 1), 20);
    x.fillStyle = COL.bg; for (let i = 1; i < 10; i++) x.fillRect(L + (w - 32) * i / 10 - 1, 312, 2, 20);
  }

  // 電力／液壓頁（左上）：匯流排電壓、電池、液壓、發電機負載
  drawSys(x, w, h, ui) {
    const t = this.t, b = ui.boost || 0, en = ui.en ?? 1, pc = ui.parts || {};
    const leg = Math.min(pc.legL ?? 1, pc.legR ?? 1);
    const va = 271 - b * 6 - (1 - en) * 5 + Math.sin(t * 1.3) * 0.6, vb = va - 1.6 + Math.sin(t * 0.9 + 1) * 0.5;
    const ha = 3010 - b * 140 - (1 - leg) * 900 + Math.sin(t * 2.1) * 12, hB = ha - 25 + Math.sin(t * 1.7) * 10;
    const gen = clamp(0.62 + b * 0.3 + (ui.hover || 0) * 0.15 + Math.sin(t * 0.8) * 0.02, 0, 1);
    const rows = [['BUS A', va.toFixed(0), 'V', va < 262], ['BUS B', vb.toFixed(0), 'V', vb < 262], ['BATT', (28.4 - b * 0.3).toFixed(1), 'V', false],
      ['HYD A', Math.round(ha), 'PSI', ha < 2400], ['HYD B', Math.round(hB), 'PSI', hB < 2400], ['GEN', Math.round(gen * 100), '%', gen > 0.95]];
    rows.forEach(([n, v, u, bad], i) => {
      const y = 54 + i * 26;
      this.tx(x, n, 14, y, COL.dim, 17);
      this.tx(x, String(v), 184, y, bad ? COL.am : COL.wh, 19, true, 'right');
      this.tx(x, u, 190, y, COL.dim, 14);
    });
    this.hb(x, 14, 206, w - 28, 6, gen, gen > 0.95 ? COL.am : COL.cy);
  }
  // 引擎頁（右上）：敵數與威脅狀態、反應爐溫度錶、能量錶、熱量、推力
  drawGauge(x, w, h, ui) {
    const t = this.t, n = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    this.tx(x, 'TGT', 14, 52, COL.dim, 17); this.tx(x, pad(n, 2), 58, 52, n ? COL.am : COL.cy, 22, true);
    const lk = ui.lockAlert > 0.01;
    this.tx(x, lk ? 'LOCK!' : 'CLEAR', w - 14, 52, lk ? (Math.sin(t * 16) > 0 ? COL.rd : '#5a1410') : COL.gr, 20, true, 'right');
    const en = ui.en ?? 1, b = ui.boost || 0, od = ui.od && ui.od.active ? 1 : 0;
    const temp = 620 + (1 - en) * 160 + b * 90 + od * 110 + Math.sin(t * 1.1) * 3;
    const dial = (cx, cy, r, v, bands, name, val, c) => {
      const a0 = Math.PI * 0.75, sp = Math.PI * 1.5;
      x.lineWidth = 3; x.strokeStyle = COL.grid; x.beginPath(); x.arc(cx, cy, r, a0, a0 + sp); x.stroke();
      x.lineWidth = 4;
      for (const [f0, f1, bc] of bands) { x.strokeStyle = bc; x.beginPath(); x.arc(cx, cy, r + 5, a0 + sp * f0, a0 + sp * f1); x.stroke(); }
      x.strokeStyle = COL.dim; x.lineWidth = 2; x.beginPath();
      for (let i = 0; i <= 10; i++) { const a = a0 + sp * i / 10, r0 = i % 5 ? r - 5 : r - 9; x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      x.stroke();
      const a = a0 + sp * clamp(v, 0, 1);
      x.strokeStyle = COL.wh; x.lineWidth = 3; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6)); x.stroke();
      x.fillStyle = COL.wh; x.beginPath(); x.arc(cx, cy, 4, 0, Math.PI * 2); x.fill();
      this.tx(x, val, cx, cy + r * 0.52, c, 20, true, 'center');
      this.tx(x, name, cx, cy + r + 16, COL.dim, 14, false, 'center');
    };
    const tv = (temp - 400) / 600;
    dial(66, 124, 42, tv, [[0, 0.62, 'rgba(109,255,154,0.5)'], [0.62, 0.8, 'rgba(255,179,71,0.7)'], [0.8, 1, 'rgba(255,74,58,0.8)']], 'RCTR °C', String(Math.round(temp)), tv > 0.8 ? COL.rd : tv > 0.62 ? COL.am : COL.wh);
    dial(190, 124, 42, en, [[0, 0.25, 'rgba(255,179,71,0.7)'], [0.25, 1, 'rgba(111,240,255,0.35)']], 'EN %', pad(en * 100), en > 0.25 ? COL.wh : COL.am);
    const heat = clamp(0.35 + (1 - en) * 0.4 + b * 0.25, 0, 1), thr = clamp(0.22 + b * 0.7 + (ui.hover || 0) * 0.35, 0, 1);
    this.tx(x, 'HEAT', 14, 206, COL.dim, 15); this.tx(x, `${Math.round(heat * 100)}%`, 112, 206, heat > 0.8 ? COL.rd : COL.wh, 17, true, 'right');
    this.tx(x, 'THR', 136, 206, COL.dim, 15); this.tx(x, `${Math.round(thr * 100)}%`, w - 14, 206, COL.wh, 17, true, 'right');
  }
  // 推進器輸出直條（右扶手小螢幕）
  drawBars(x, w, h, ui) {
    const t = this.t, b = (ui.boost || 0) + (ui.hover || 0) * 0.7;
    this.tx(x, 'THR', 8, 16, COL.dim, 16, true);
    for (let i = 0; i < 12; i++) {
      const v = clamp(0.25 + b * 0.6 + 0.12 * Math.sin(t * (3 + i * 0.7) + i * 1.3) + (Math.random() - 0.5) * 0.08 * (1 + b), 0.05, 1);
      const bx = 58 + i * 37, bh = (h - 24) * v;
      x.fillStyle = COL.grid; x.fillRect(bx, 12, 26, h - 24);
      x.fillStyle = v > 0.85 ? COL.am : COL.gr; x.fillRect(bx, h - 12 - bh, 26, bh);
    }
  }
  // 反應爐波形（左扶手小螢幕）
  drawWave(x, w, h, ui) {
    const t = this.t, amp = 18 + (ui.boost || 0) * 24 + (ui.hover || 0) * 12;
    x.strokeStyle = COL.cy; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= w; i += 4) {
      const y = h / 2 + 8 + Math.sin(i * 0.045 + t * 7) * amp * 0.6 + Math.sin(i * 0.13 - t * 11) * amp * 0.3;
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
    this.tx(x, 'RCTR FLUX', 10, 16, COL.dim, 16, true);
    this.tx(x, `${(98 + Math.sin(t) * 1.5).toFixed(1)}%`, w - 10, 17, COL.wh, 20, true, 'right');
  }

  // 對地速度（右下小窗）：大數字＋弧形錶＋推進狀態
  drawSpd(x, w, h, ui) {
    const sp = Math.round((ui.speed || 0) * 3.6), bo = (ui.boost || 0) > 0.5;
    x.lineWidth = 10; x.strokeStyle = COL.grid; x.beginPath(); x.arc(w / 2, 138, 92, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
    x.strokeStyle = bo ? COL.cy : COL.dim; x.beginPath(); x.arc(w / 2, 138, 92, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(sp / 200, 0, 1))); x.stroke();
    x.strokeStyle = COL.bg; x.lineWidth = 12; x.beginPath();
    for (let i = 1; i < 10; i++) { const a = Math.PI * (0.8 + 0.14 * i); x.moveTo(w / 2 + Math.cos(a) * 86, 138 + Math.sin(a) * 86); x.lineTo(w / 2 + Math.cos(a) * 98, 138 + Math.sin(a) * 98); }
    x.lineWidth = 2; x.stroke();
    this.tx(x, pad(sp), w / 2, 132, bo ? COL.cy : COL.wh, 62, true, 'center');
    this.tx(x, 'GS  KM/H', w / 2, 180, COL.dim, 17, false, 'center');
    if (bo) { x.strokeStyle = COL.cy; x.lineWidth = 2; x.strokeRect(w / 2 - 50, 208, 100, 28); this.tx(x, 'BOOST', w / 2, 223, COL.cy, 20, true, 'center'); }
  }
  // 離地高度（右下小窗）：大數字＋升降速度條
  drawAlt(x, w, h, ui) {
    const alt = Math.max(0, Math.round(ui.alt || 0)), vs = ui.vs || 0;
    this.tx(x, pad(alt), 112, 124, COL.wh, 62, true, 'center');
    this.tx(x, 'M  AGL', 112, 172, COL.dim, 17, false, 'center');
    // 升降速度條（中線以上＝爬升）
    const cx = 226, c0 = 128;
    x.fillStyle = COL.grid; x.fillRect(cx - 5, 56, 10, 144);
    x.fillStyle = COL.dim; for (let i = 0; i <= 6; i++) x.fillRect(cx - 10, 56 + i * 24 - 1, 5, 2);
    const vh = clamp(vs, -12, 12) * 6;
    x.fillStyle = vs > 1 ? COL.gr : vs < -1 ? COL.am : COL.dim;
    x.fillRect(cx - 5, vh > 0 ? c0 - vh : c0, 10, Math.max(2, Math.abs(vh)));
    this.tx(x, 'VS', cx, 44, COL.dim, 14, false, 'center');
    if (ui.hover) { x.strokeStyle = COL.cy; x.lineWidth = 2; x.strokeRect(62, 208, 100, 28); this.tx(x, 'HOVER', 112, 223, COL.cy, 20, true, 'center'); }
    else this.tx(x, `VS ${vs >= 0 ? '+' : '-'}${Math.abs(vs).toFixed(1)}`, 112, 222, COL.dim, 17, false, 'center');
  }
}
