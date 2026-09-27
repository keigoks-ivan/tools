// 駕駛艙：全景螢幕艙——玩家坐在機體胸口的一顆球裡，整面內壁都是螢幕，映出外面的景色。
// 看得到：螢幕面板之間的細接縫、飄在周圍的半透明全像視窗（雷達、機體、武裝…）、兩側扶手台、兩支操縱桿和戴手套的雙手。
// 開機：面板從正前方往外一片片亮起來；中彈時有幾片面板閃雜訊；覺醒時接縫發紅光。
// 艙內光線＝螢幕映出的外面（天光＋太陽方向）＋扶手燈條＋警示燈＋開火閃光。
// 鏡頭：跟著胸口走；飛行員的頭坐在「彈簧」上——落腳、落地、中彈時頭晚一拍，整個艙在眼前晃。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0), ORIGIN = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _c = new THREE.Color();

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
class Parts {
  constructor() { this.by = new Map(); this.base = null; }
  addM(mat, g, m) {
    if (g.index) g = g.toNonIndexed();
    if (m) g.applyMatrix4(m);
    if (this.base) g.applyMatrix4(this.base);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
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

// ---------------------------------------------------------------- 程序貼圖
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

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
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
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
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
// 小標示字（印在面板上）
const LABELS = ['RADAR', 'RNG 600', 'STATUS', 'ARMS', 'FCS', 'SPD', 'ALT', 'EN CELL', 'BALANCER', 'CAUTION', 'XG-01', 'MSL ARM', 'SYS 1', 'SYS 2', 'IFF', 'COMM', 'HOT', 'VENT', 'GEN', 'LINK'];
function labelTex() {
  const W = 1024, H = 256, [c, x] = canvas(W, H);
  const rect = {};
  x.font = '700 30px Rajdhani, "Arial Narrow", sans-serif';
  x.textBaseline = 'middle';
  let px = 6, py = 4;
  for (const s of LABELS) {
    const w = Math.ceil(x.measureText(s).width) + 14;
    if (px + w > W) { px = 6; py += 42; }
    const warn = s === 'CAUTION' || s === 'HOT';
    if (warn) { x.fillStyle = '#d9a21a'; x.fillRect(px, py, w, 36); x.fillStyle = '#111'; }
    else x.fillStyle = s === 'XG-01' ? '#e8ecef' : '#b9c3c8';
    x.fillText(s, px + 7, py + 19);
    rect[s] = [px, py, w, 36];
    px += w + 8;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, rect, W, H };
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
  { k: 'sys', a: -44, e: 20, d: 1.05, w: 0.14, h: 0.14, at: 0.14 },
  { k: 'gauge', a: 44, e: 20, d: 1.05, w: 0.14, h: 0.14, at: 0.17 },
  { k: 'status', a: -40, e: 4, d: 1.0, w: 0.24, h: 0.18, at: 0.2 },
  { k: 'arms', a: 40, e: 4, d: 1.0, w: 0.24, h: 0.18, at: 0.23 },
  { k: 'radar', a: -33, e: -15, d: 0.95, w: 0.2, h: 0.2, at: 0.26 },
  { k: 'spd', a: 29, e: -15, d: 0.95, w: 0.1, h: 0.1, at: 0.29 },
  { k: 'alt', a: 35.5, e: -15, d: 0.95, w: 0.1, h: 0.1, at: 0.31 },
];
const COL = { bg: '#02070a', grid: 'rgba(111,240,255,0.13)', line: 'rgba(111,240,255,0.07)', dim: '#3f9fac', cy: '#6ff0ff', wh: '#e6f6f8', am: '#ffb347', rd: '#ff4a3a', pk: '#ff6fd0', gr: '#6dff9a' };

// 全景螢幕的球面：只負責「面板接縫、開機、中彈雜訊、覺醒紅光」——外面的景色是城市那一層早就畫好的，這裡不必再畫一次。
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
    float edge = 1.0 - smoothstep(0.0, 6.0, px);
    // 開機：從正前方往外，一片一片亮起來（亮起前邊緣會先閃）
    float ang = degrees(acos(clamp(-d.z, -1.0, 1.0)));
    float th = 0.5 + 0.24 * ang / 180.0 + 0.1 * hv;
    float on = clamp((boot - th) / 0.025, 0.0, 1.0);
    float pre = smoothstep(th - 0.12, th, boot) * (1.0 - on) * step(0.45, fract(time * 7.0 + hv * 5.0));
    float post = on * exp(-max(boot - th, 0.0) * 40.0);
    vec3 cy = vec3(0.3, 1.4, 2.0);
    float occ = max(max(1.0 - on, seam * 0.34), 0.03 * hv);
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
    this.odV = 0;

    this.makeMaterials();
    this.build();
    this.makeLights();
  }

  makeMaterials() {
    const grunge = grungeTex(), fab = fabricTex();
    const std = (c, m, r, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, side: THREE.DoubleSide, ...o });
    this.M = {
      frame: std(0x3b4247, 0.85, 0.42, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.4 }),
      panel: std(0x2a3136, 0.55, 0.55, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.35 }),
      shell: std(0xd3d8db, 0.08, 0.36, { roughnessMap: grunge, bumpMap: grunge, bumpScale: 0.15 }),
      matte: std(0x0f1113, 0.1, 0.82),
      white: std(0xc4c9cd, 0.05, 0.42, { roughnessMap: grunge }),
      orange: std(0xd4661c, 0.05, 0.5),
      rubber: std(0x0c0c0d, 0.0, 0.92, { bumpMap: fab, bumpScale: 0.5 }),
      chrome: std(0xa0a6ac, 1.0, 0.2),
      glove: std(0x2b2e34, 0.0, 0.62, { bumpMap: fab, bumpScale: 0.6 }),
      sleeve: std(0x1b2740, 0.0, 0.78, { bumpMap: fab, bumpScale: 0.8 }),
      glow: new THREE.MeshBasicMaterial({ color: 0x000000 }),   // 扶手燈條（顏色每幀依狀態變）
    };
    const L = labelTex();
    this.labels = L;
    this.M.label = new THREE.MeshStandardMaterial({ map: L.tex, transparent: true, alphaTest: 0.2, roughness: 0.6, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    // 儀表畫面（畫在 canvas 上，每秒更新 15 次）：全像視窗的背景是半透明的
    const [sc, sx] = canvas(1024, 1024);
    this.sc = sc; this.sx = sx;
    this.screenTex = new THREE.CanvasTexture(sc);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    this.M.screen = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.45, 1.45, 1.45) });
  }

  build() {
    const M = this.M, P = new Parts(), S = new Parts(), GL = new Parts(), Lb = new Parts();
    this.lampDefs = [];
    this.maskBoxes = [];
    const lamp = (base, pos, kind, rot = null) => {
      const m = new THREE.Matrix4().compose(_p.set(...pos), rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')) : _q.identity(), _s.set(1, 1, 1));
      if (base) m.premultiply(base);
      this.lampDefs.push({ m, kind, ph: Math.random() * 10 });
    };
    const label = (base, name, pos, h = 0.011, rot = [0, 0, 0]) => {
      const r = this.labels.rect[name];
      const g = atlasPlane(h * r[2] / r[3], h, r, this.labels.W, this.labels.H);
      Lb.base = base; Lb.add(M.label, g, pos, rot); Lb.base = null;
    };
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
    //      前段往外斜、朝向飛行員的小控制台（小螢幕、按鍵、指示燈、全像投影鏡頭）
    for (const sx of [-1, 1]) {
      const X = sx * 0.3;
      P.add(M.panel, rb(0.14, 0.08, 0.5, 0.03), [X, -0.52, -0.36]);
      mask(null, 0.11, 0.05, 0.44, [X, -0.52, -0.36]);
      P.add(M.shell, rb(0.15, 0.018, 0.46, 0.008), [X, -0.475, -0.35]);
      P.add(M.shell, rb(0.016, 0.06, 0.44, 0.007), [X + sx * 0.074, -0.515, -0.34]);
      P.add(M.orange, rb(0.003, 0.01, 0.3, 0.0015), [X + sx * 0.0825, -0.5, -0.33]);
      GL.add(M.glow, rb(0.005, 0.004, 0.4, 0.0018), [X - sx * 0.068, -0.4655, -0.34]);
      // 操縱桿座
      P.add(M.matte, cyl(0.046, 0.014, 28), [X, -0.461, -0.51]);
      GL.add(M.glow, new THREE.TorusGeometry(0.048, 0.0022, 6, 48), [X, -0.4545, -0.51], [Math.PI / 2, 0, 0]);
      // 前段小控制台（自己的座標：頂面＝+Y、前方＝−Z）
      const base = new THREE.Matrix4().compose(new THREE.Vector3(sx * 0.38, -0.5, -0.74), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -sx * 0.45, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
      P.base = S.base = GL.base = base;
      P.add(M.panel, rb(0.16, 0.05, 0.25, 0.018), [0, -0.026, 0]);
      mask(base, 0.13, 0.03, 0.21, [0, -0.026, 0]);
      P.add(M.panel, rb(0.15, 0.012, 0.24, 0.006), [0, 0.0, 0.0]);
      P.add(M.shell, rb(0.014, 0.034, 0.25, 0.006), [sx * 0.08, -0.008, 0.0]);
      P.add(M.shell, rb(0.14, 0.03, 0.016, 0.006), [0, -0.01, -0.12]);
      P.add(M.orange, rb(0.168, 0.004, 0.012, 0.0015), [0, 0.0045, 0.105]);
      // 小螢幕（頂面、偏前）
      P.add(M.matte, rb(0.136, 0.006, 0.048, 0.003), [0, 0.006, -0.06]);
      S.add(M.screen, atlasPlane(0.12, 0.03, SCR[sx < 0 ? 'wave' : 'bars'], 1024, 1024), [0, 0.0095, -0.06], [-Math.PI / 2, 0, 0]);
      // 按鍵 6×2（靠飛行員這邊）
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) P.add((i + j * 3) % 5 === 2 ? M.orange : M.matte, rb(0.017, 0.008, 0.014, 0.003), [-0.056 + i * 0.0224, 0.006, 0.02 + j * 0.022]);
      // 指示燈一排
      for (let i = 0; i < 5; i++) lamp(base, [-0.05 + i * 0.016, 0.0072, 0.078], ['ok', 'sys', 'idle', 'ok', 'warn'][(i + (sx > 0 ? 2 : 0)) % 5], [-Math.PI / 2, 0, 0]);
      label(base, sx < 0 ? 'SYS 1' : 'FCS', [-0.052, 0.0068, -0.1], 0.012, [-Math.PI / 2, 0, 0]);
      // 全像投影鏡頭（前端外側）
      P.add(M.chrome, cyl(0.014, 0.012, 20), [sx * 0.045, 0.005, -0.105]);
      GL.add(M.glow, cyl(0.009, 0.013, 20), [sx * 0.045, 0.006, -0.105]);
      P.base = S.base = GL.base = null;
    }

    P.build(this.root); S.build(this.root); GL.build(this.root); Lb.build(this.root);

    // ---- 指示燈（同一個 InstancedMesh，每盞顏色各自變）
    const lg = rb(0.011, 0.0065, 0.004, 0.0015);
    this.lamps = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), this.lampDefs.length);
    this.lampDefs.forEach((d, i) => { this.lamps.setMatrixAt(i, d.m); this.lamps.setColorAt(i, _c.setRGB(0, 0, 0)); });
    this.root.add(this.lamps);

    // ---- 全像視窗：飄在周圍，面向飛行員；每片自己一個材質（才能各自閃、各自跳出來）
    this.holos = HOLO.map((o) => {
      const mat = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.5, 1.5, 1.5), transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(atlasPlane(o.w, o.h, SCR[o.k], 1024, 1024), mat);
      const g = new THREE.Group();
      facing(o.a * D, o.e * D, o.d).decompose(g.position, g.quaternion, g.scale);
      g.add(mesh);
      mesh.renderOrder = 1;
      this.root.add(g);
      return { ...o, mesh, gl: 0, ph: Math.random() * 10 };
    });

    // ---- 兩支操縱桿＋手
    this.sticks = [this.buildStick(1), this.buildStick(-1)];
  }

  // 操縱桿與戴手套的手（右手；左手鏡像）
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
    gp.add(M.frame, cyl(0.017, 0.012), [0, 0.006, 0]);
    gp.add(M.rubber, new THREE.CapsuleGeometry(0.021, 0.075, 4, 16), [0, 0.07, 0], [0, 0, 0], [1, 1, 1.12]);
    gp.add(M.panel, rb(0.046, 0.028, 0.058, 0.01), [0, 0.135, -0.006], [-0.15, 0, 0]);
    gp.add(M.rubber, cyl(0.0065, 0.009, 10), [-0.008, 0.152, -0.02]);
    gp.add(M.orange, cyl(0.0055, 0.006, 10), [0.012, 0.15, 0.006]);
    gp.add(M.frame, rb(0.011, 0.024, 0.012, 0.003), [0, 0.104, -0.03], [0.25, 0, 0]);
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
    // 手背護甲、指節護板
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
    this.warnL = new THREE.PointLight(0xff2412, 0, 2.5, 2);         // 警示紅燈
    this.warnL.position.set(0, 0.35, -0.2);
    this.flashL = new THREE.PointLight(0xffffff, 0, 3, 2);          // 開火／爆炸閃光
    this.flashL.position.set(0.3, 0.1, -1.2);
    s.add(this.hemi, this.key, this.key.target, this.sunL, this.sunL.target, this.conL, this.warnL, this.flashL);
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

  // 每幀：擺鏡頭、擺駕駛艙、更新燈光與儀表
  // ui：{ yaw, pitch（瞄準，機體朝向慣例）, boot, move:{x,y}, turn:{x,y}, boost, hover, speed, alt, vs, ap, apMax, en, parts, rifle, msl, saber, od, lockAlert, danger, radar, fire }
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
    return m;
  }

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

    // 開機：全景螢幕從正前方往外一片片亮起來
    const bt = ui.boot ?? 1, du = this.dome.material.uniforms;
    this.win = clamp((bt - 0.5) / 0.36, 0, 1);
    this.odV = damp(this.odV, ui.od && ui.od.active ? 1 : 0, 4, dt);
    du.boot.value = bt; du.time.value = this.t; du.hurt.value = this.hurtT; du.od.value = this.odV;
    du.alert.value = ui.danger ? 0.15 + 0.15 * Math.sin(this.t * 7) : 0;
    this.updateHolos(dt, ui);
    this.updateSticks(dt, ui);
    this.updateLights(dt, ui, _q);
    this.updateLamps(ui);
    this.screenT -= dt;
    if (this.screenT <= 0) { this.screenT = 1 / 15; this.drawScreens(ui); }
  }

  // 全像視窗：開機時一條橫線往上下展開（稍微超過再彈回來）；偶爾閃一下，中彈時閃得更兇
  updateHolos(dt, ui) {
    const bt = ui.boot ?? 1, t = this.t;
    for (const h of this.holos) {
      const k = clamp((bt - h.at) / 0.05, 0, 1), u = k - 1;
      h.mesh.visible = k > 0;
      if (!h.mesh.visible) continue;
      h.mesh.scale.y = k < 1 ? Math.max(0.03, 1 + 2.70158 * u * u * u + 1.70158 * u * u) : 1;
      if (Math.random() < dt * (0.2 + this.hurtT * 40)) h.gl = 0.05 + Math.random() * 0.08;
      h.gl = Math.max(0, h.gl - dt);
      h.mesh.material.opacity = h.gl > 0 ? 0.3 + Math.random() * 0.35 : 0.9 + 0.06 * Math.sin(t * 11 + h.ph);
      h.mesh.position.x = h.gl > 0 ? (Math.random() - 0.5) * 0.006 : 0;
    }
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
  }

  updateLights(dt, ui, qInv) {
    const w = this.world, boot = ui.boot ?? 1;
    const win = this.win;                                   // 全景螢幕亮了多少
    const ins = clamp((boot - 0.12) / 0.2, 0, 1);          // 儀表亮度
    // 螢幕映出的天光
    this.hemi.color.copy(w.fogColor).multiplyScalar(1.3);
    this.hemi.groundColor.setRGB(0.015, 0.016, 0.018);
    this.hemi.intensity = 0.5 * win + 0.015;
    this.key.color.copy(w.fogColor).lerp(_c.setRGB(1, 0.85, 0.7), 0.4);
    this.key.intensity = 0.35 * win;
    this.scene.environmentIntensity = 0.04 + 0.16 * win;
    // 太陽方向（轉到艙內座標）：整圈都是螢幕，從哪邊都照得進來
    const sd = _v.copy(w.lightDir).applyQuaternion(qInv);
    this.sunL.position.copy(this.sunL.target.position).addScaledVector(sd, 4);
    this.sunL.color.copy(w.sun.color);
    this.sunL.intensity = 2.6 * win;
    this.conL.intensity = 0.06 * ins;
    // 扶手燈條：平常藍色；耐久低時紅色閃；覺醒時變紅
    const dgB = ui.danger ? 0.5 + 0.5 * Math.sin(this.t * 7) : 0;
    this.M.glow.color.setRGB(0.25, 1.3, 2.0).lerp(_c.setRGB(2.4, 0.15, 0.1), Math.max(dgB, this.odV * 0.85)).multiplyScalar(ins);
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

  updateLamps(ui) {
    const boot = ui.boot ?? 1, t = this.t;
    const on = clamp((boot - 0.3) / 0.15, 0, 1);
    const la = ui.lockAlert || 0, dg = !!ui.danger;
    this.lampDefs.forEach((d, i) => {
      let r = 0, g = 0, b = 0;
      const k = (Math.sin(t * 2.3 + d.ph * 7) > 0.2) ? 1 : 0.25;
      switch (d.kind) {
        case 'ok': r = 0.15; g = 1.9; b = 0.5; break;
        case 'idle': r = 2.2; g = 1.1; b = 0.1; if (k < 1) { r *= 0.2; g *= 0.2; b *= 0.2; } break;
        case 'sys': r = 0.3; g = 1.6; b = 2.4; if (Math.sin(t * 5 + d.ph * 3) > 0.85) { r *= 0.2; g *= 0.2; b *= 0.2; } break;
        case 'boost': { const v = (ui.boost || 0) + (ui.hover || 0); r = 0.4 * v + 0.05; g = 1.8 * v + 0.1; b = 3 * v + 0.15; break; }
        case 'warn': { const on2 = dg || la > 0.01 ? (Math.sin(t * (dg ? 14 : 9)) > 0 ? 1 : 0.08) : 0.04; r = 3.2 * on2; g = 0.18 * on2; b = 0.08 * on2; break; }
      }
      const f = d.kind === 'warn' ? 1 : on;
      this.lamps.setColorAt(i, _c.setRGB(r * f, g * f, b * f));
    });
    this.lamps.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- 儀表畫面
  drawScreens(ui) {
    const x = this.sx, boot = ui.boot ?? 1;
    x.clearRect(0, 0, 1024, 1024);
    const on = (at) => clamp((boot - at) / 0.06, 0, 1);
    const scr = [['wave', 0.1, this.drawWave], ['bars', 0.12, this.drawBars], ...HOLO.map((o) => [o.k, o.at, this['draw' + o.k[0].toUpperCase() + o.k.slice(1)]])];
    for (const [k, at, fn] of scr) {
      const r = SCR[k], o = on(at), W = r[2], H = r[3], solid = SOLID.has(k);
      if (o <= 0) continue;
      x.save();
      x.translate(r[0], r[1]);
      x.save();
      if (solid) { x.beginPath(); x.rect(0, 0, W, H); x.clip(); x.fillStyle = COL.bg; x.fillRect(0, 0, W, H); }
      else {
        this.panelPath(x, W, H); x.clip();
        const g = x.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, 'rgba(6,30,40,0.62)'); g.addColorStop(1, 'rgba(2,14,20,0.5)');
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
      if (o < 1) this.drawBoot(x, W, H, o, k);
      else fn.call(this, x, W, H, ui);
      // 掃描線＋中彈雜訊
      x.fillStyle = solid ? 'rgba(0,0,0,0.18)' : 'rgba(120,240,255,0.05)';
      for (let y = 0; y < H; y += 4) x.fillRect(0, y, W, 1);
      if (this.hurtT > 0.05) {
        for (let k2 = 0; k2 < 10; k2++) {
          x.fillStyle = `rgba(${150 + Math.random() * 100},${200 + Math.random() * 55},255,${Math.random() * 0.5 * this.hurtT * 3})`;
          x.fillRect(0, Math.random() * H, W, 2 + Math.random() * 10);
        }
      }
      x.restore();
      if (!solid) this.panelFrame(x, W, H);
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
    const c = Math.min(w, h) * 0.1, L = Math.min(w, h) * 0.16, i = 4;
    x.strokeStyle = 'rgba(111,240,255,0.45)'; x.lineWidth = 2;
    this.panelPath(x, w, h); x.stroke();
    x.strokeStyle = COL.cy; x.lineWidth = 5; x.lineJoin = 'miter';
    x.beginPath();
    x.moveTo(i, i + c + L); x.lineTo(i, i + c); x.lineTo(i + c, i); x.lineTo(i + c + L, i);
    x.moveTo(w - i - L, i); x.lineTo(w - i, i); x.lineTo(w - i, i + L);
    x.moveTo(w - i, h - i - c - L); x.lineTo(w - i, h - i - c); x.lineTo(w - i - c, h - i); x.lineTo(w - i - c - L, h - i);
    x.moveTo(i + L, h - i); x.lineTo(i, h - i); x.lineTo(i, h - i - L);
    x.stroke();
  }

  drawBoot(x, w, h, o, name) {
    x.strokeStyle = COL.cy; x.fillStyle = COL.cy;
    x.globalAlpha = Math.random() < 0.3 ? 0.4 : 1;
    x.font = `600 ${Math.round(w * 0.07)}px Rajdhani, sans-serif`;
    x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillText('BOOT ' + name.toUpperCase(), w * 0.08, h * 0.35);
    x.strokeRect(w * 0.08, h * 0.55, w * 0.84, h * 0.06);
    x.fillRect(w * 0.08, h * 0.55, w * 0.84 * o, h * 0.06);
    x.globalAlpha = 1;
  }

  grid(x, w, h, s) {
    x.strokeStyle = COL.line; x.lineWidth = 1;
    x.beginPath();
    for (let i = s; i < w; i += s) { x.moveTo(i, 0); x.lineTo(i, h); }
    for (let j = s; j < h; j += s) { x.moveTo(0, j); x.lineTo(w, j); }
    x.stroke();
  }

  drawRadar(x, w, h, ui) {
    const cx = w / 2, cy = h / 2 + 8, R = 222, range = 600, k = R / range, t = this.t;
    const yaw = ui.yaw || 0, sa = Math.sin(yaw), ca = Math.cos(yaw);
    x.lineWidth = 2;
    // 距離環
    for (const r of [200, 400, 600]) { x.strokeStyle = r === 600 ? COL.dim : COL.grid; x.beginPath(); x.arc(cx, cy, r * k, 0, Math.PI * 2); x.stroke(); }
    x.strokeStyle = COL.grid; x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.moveTo(cx, cy - R); x.lineTo(cx, cy + R); x.stroke();
    // 視野扇形
    x.strokeStyle = COL.dim; x.beginPath();
    for (const s of [-1, 1]) { x.moveTo(cx, cy); x.lineTo(cx + Math.sin(s * 50 * D) * R, cy - Math.cos(50 * D) * R); }
    x.stroke();
    // 方位刻度（機頭朝上，北方跟著轉）
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 10) {
      const a = d * D - yaw;
      const r0 = d % 30 === 0 ? R - 14 : R - 7;
      x.strokeStyle = COL.dim; x.beginPath();
      x.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0); x.lineTo(cx + Math.sin(a) * R, cy - Math.cos(a) * R); x.stroke();
      if (d % 90 === 0) { x.fillStyle = d === 0 ? COL.am : COL.dim; x.fillText('NESW'[d / 90], cx + Math.sin(a) * (R - 30), cy - Math.cos(a) * (R - 30)); }
    }
    // 掃描線
    const sw = (t * 2.4) % (Math.PI * 2);
    if (x.createConicGradient) {
      const g = x.createConicGradient(sw - Math.PI / 2 - 1.2, cx, cy);
      g.addColorStop(0, 'rgba(111,240,255,0)'); g.addColorStop(0.19, 'rgba(111,240,255,0.22)'); g.addColorStop(0.191, 'rgba(111,240,255,0)'); g.addColorStop(1, 'rgba(111,240,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    }
    // 光點
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
        if (o.locked) { x.strokeStyle = COL.wh; x.lineWidth = 2; x.strokeRect(px - 10, py - 10, 20, 20); }
      } else {
        const s = o.kind === 'heavy' ? 13 : o.kind === 'ace' ? 12 : 10;
        x.fillStyle = o.kind === 'ace' ? '#ff7b3a' : COL.rd;
        x.beginPath(); x.moveTo(px, py - s); x.lineTo(px + s, py); x.lineTo(px, py + s); x.lineTo(px - s, py); x.closePath(); x.fill();
        if (o.locked) { x.strokeStyle = COL.wh; x.lineWidth = 2; x.strokeRect(px - s - 6, py - s - 6, (s + 6) * 2, (s + 6) * 2); }
      }
      x.globalAlpha = 1;
    }
    // 自機
    x.fillStyle = COL.cy; x.beginPath(); x.moveTo(cx, cy - 12); x.lineTo(cx + 8, cy + 8); x.lineTo(cx, cy + 4); x.lineTo(cx - 8, cy + 8); x.closePath(); x.fill();
    x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = COL.cy; x.font = '600 26px Rajdhani, sans-serif';
    x.fillText('RNG 600', 58, 14);
    x.textAlign = 'right';
    const hdg = Math.round(((yaw / D) % 360 + 360) % 360);
    x.fillText('HDG ' + String(hdg).padStart(3, '0'), w - 14, 10);
    const ne = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    x.textBaseline = 'bottom'; x.fillStyle = ne ? COL.rd : COL.dim;
    x.fillText('HOSTILE ' + ne, w - 60, h - 12);
  }

  drawStatus(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const pc = ui.parts || {};
    const col = (v) => (v === undefined || v > 0.6) ? COL.cy : v > 0.3 ? COL.am : (Math.sin(this.t * 10) > 0 ? COL.rd : '#5a1410');
    // 機體剪影（正面）
    const ox = 118, oy = 60;
    const part = (v, pts) => { x.fillStyle = col(v); x.globalAlpha = 0.85; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(ox + a, oy + b) : x.moveTo(ox + a, oy + b))); x.closePath(); x.fill(); x.globalAlpha = 1; };
    part(pc.head, [[-12, 0], [12, 0], [15, 22], [-15, 22]]);
    part(pc.torso, [[-44, 28], [44, 28], [36, 92], [22, 118], [-22, 118], [-36, 92]]);
    part(pc.armR, [[-50, 28], [-88, 34], [-92, 128], [-66, 132], [-56, 60]]);
    part(pc.armL, [[50, 28], [88, 34], [92, 128], [66, 132], [56, 60]]);
    part(pc.legR, [[-24, 124], [-4, 124], [-8, 226], [-40, 232], [-36, 180]]);
    part(pc.legL, [[24, 124], [4, 124], [8, 226], [40, 232], [36, 180]]);
    x.strokeStyle = COL.bg; x.lineWidth = 3;
    x.font = '700 30px Rajdhani, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillStyle = COL.wh; x.fillText('XG-01', 46, 12);
    // 右半：耐久、能量
    const ap = ui.ap ?? 1, apMax = ui.apMax ?? 1, en = ui.en ?? 1;
    const f = clamp(ap / apMax, 0, 1);
    const X0 = 250;
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.fillText('ARMOR', X0, 40);
    x.fillStyle = f > 0.3 ? COL.wh : COL.rd; x.font = '700 70px Rajdhani, sans-serif';
    x.fillText(Math.round(ap).toLocaleString('en-US'), X0, 64);
    x.fillStyle = COL.grid; x.fillRect(X0, 142, 230, 14);
    x.fillStyle = f > 0.3 ? COL.cy : COL.rd; x.fillRect(X0, 142, 230 * f, 14);
    x.fillStyle = COL.dim; x.font = '600 26px Rajdhani, sans-serif'; x.fillText('EN', X0, 176);
    x.fillStyle = COL.grid; x.fillRect(X0 + 44, 184, 186, 14);
    x.fillStyle = en > 0.25 ? COL.cy : COL.am; x.fillRect(X0 + 44, 184, 186 * clamp(en, 0, 1), 14);
    x.fillStyle = COL.dim; x.fillText('GEN', X0, 226); x.fillText('BAL', X0, 262); x.fillText('FCS', X0, 298);
    x.fillStyle = COL.wh;
    x.fillText(`${Math.round(62 + (1 - en) * 30 + (ui.boost || 0) * 8)}°C`, X0 + 70, 226);
    x.fillStyle = ui.hover || (ui.alt || 0) > 3 ? COL.am : COL.gr; x.fillText(ui.hover || (ui.alt || 0) > 3 ? 'AIR' : 'OK', X0 + 70, 262);
    x.fillStyle = COL.gr; x.fillText('LINK', X0 + 70, 298);
  }

  drawArms(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t;
    x.textAlign = 'left'; x.textBaseline = 'top';
    // 右手：光束步槍
    const rf = ui.rifle || { ammo: 12, mag: 12, reload: -1 };
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('R  BEAM RIFLE', 46, 12);
    x.fillStyle = rf.ammo > 0 ? COL.wh : COL.rd; x.font = '700 54px Rajdhani, sans-serif';
    x.textAlign = 'right'; x.fillText(String(rf.ammo).padStart(2, '0'), w - 16, 4); x.textAlign = 'left';
    for (let i = 0; i < rf.mag; i++) { x.fillStyle = i < rf.ammo ? COL.pk : COL.grid; x.fillRect(16 + i * 24, 46, 18, 16); }
    if (rf.reload >= 0) {
      x.fillStyle = COL.grid; x.fillRect(16, 68, w - 32, 10);
      x.fillStyle = COL.am; x.fillRect(16, 68, (w - 32) * rf.reload, 10);
    }
    // 左肩：飛彈
    const ms = ui.msl || { ready: 6, max: 6, cd: 1, locks: 0 };
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('L  MISSILE', 16, 102);
    for (let i = 0; i < ms.max; i++) {
      x.fillStyle = i < ms.locks ? COL.rd : ms.cd >= 1 ? COL.cy : COL.grid;
      x.fillRect(16 + i * 42, 134, 34, 22);
    }
    if (ms.cd < 1) { x.fillStyle = COL.am; x.fillRect(16, 162, (ms.max * 42 - 8) * ms.cd, 6); }
    x.fillStyle = ms.locks ? COL.rd : COL.dim; x.textAlign = 'right'; x.font = '700 30px Rajdhani, sans-serif';
    x.fillText(ms.locks ? `LOCK ${ms.locks}` : ms.cd >= 1 ? 'READY' : 'LOAD', w - 16, 128); x.textAlign = 'left';
    // 光劍
    const sb = ui.saber ?? 1;
    x.fillStyle = COL.dim; x.font = '600 24px Rajdhani, sans-serif'; x.fillText('S  BEAM SABER', 16, 190);
    x.textAlign = 'right'; x.fillStyle = sb >= 1 ? COL.gr : COL.am; x.fillText(sb >= 1 ? 'READY' : `${Math.round(sb * 100)}%`, w - 16, 190); x.textAlign = 'left';
    // 覺醒
    const od = ui.od || { gauge: 0, active: false };
    x.fillStyle = COL.dim; x.fillText('OVERDRIVE', 16, 262);
    x.fillStyle = COL.grid; x.fillRect(16, 294, w - 32, 26);
    const full = od.gauge >= 1;
    x.fillStyle = od.active ? COL.rd : full ? (Math.sin(t * 8) > 0 ? COL.am : '#8a5a1a') : COL.am;
    x.fillRect(16, 294, (w - 32) * clamp(od.gauge, 0, 1), 26);
    if (full || od.active) { x.fillStyle = COL.bg; x.font = '700 24px Rajdhani, sans-serif'; x.fillText(od.active ? 'ACTIVE' : 'READY  [Q]', 26, 294); }
  }

  // 系統檢查清單（左上）
  drawSys(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t, rows = ['GEN', 'CELL', 'COOL', 'FCS', 'IFF', 'LINK', 'BAL'];
    x.font = '600 22px Rajdhani, sans-serif'; x.textBaseline = 'top';
    rows.forEach((n, i) => {
      const y = 20 + i * 32;
      x.textAlign = 'left'; x.fillStyle = COL.dim; x.fillText(n, 20, y);
      const v = n === 'CELL' ? (ui.en ?? 1) : n === 'COOL' ? 1 - (ui.boost || 0) * 0.35 : 0.8 + 0.15 * Math.sin(t * (0.7 + i * 0.3) + i);
      x.fillStyle = COL.grid; x.fillRect(80, y + 6, 120, 10);
      x.fillStyle = v < 0.3 ? COL.am : COL.cy; x.fillRect(80, y + 6, 120 * clamp(v, 0, 1), 10);
      x.textAlign = 'right'; x.fillStyle = COL.wh; x.fillText(String(Math.round(v * 100)), w - 16, y);
    });
  }
  // 大數字＋兩個圓環（右上，參考圖那塊「03」）：剩下幾台敵機、能量、溫度
  drawGauge(x, w, h, ui) {
    const n = (ui.radar || []).filter((o) => o.kind !== 'missile' && o.kind !== 'wreck').length;
    x.textAlign = 'left'; x.textBaseline = 'top';
    x.fillStyle = COL.dim; x.font = '600 22px Rajdhani, sans-serif'; x.fillText('HOSTILE', 34, 10);
    x.fillStyle = n ? COL.am : COL.cy; x.font = '700 76px Rajdhani, sans-serif'; x.fillText(String(n).padStart(2, '0'), 12, 30);
    const ring = (cx, cy, r, v, c, name) => {
      x.lineWidth = 9; x.strokeStyle = COL.grid; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = c; x.beginPath(); x.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(v, 0, 1)); x.stroke();
      x.fillStyle = COL.wh; x.font = '700 24px Rajdhani, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(String(Math.round(v * 100)), cx, cy);
      x.fillStyle = COL.dim; x.font = '600 18px Rajdhani, sans-serif'; x.fillText(name, cx, cy + r + 18);
    };
    const en = ui.en ?? 1, heat = clamp(0.35 + (1 - en) * 0.4 + (ui.boost || 0) * 0.25, 0, 1);
    ring(70, 170, 38, en, en > 0.25 ? COL.cy : COL.am, 'EN');
    ring(180, 170, 38, heat, heat > 0.8 ? COL.rd : COL.am, 'HEAT');
    x.textAlign = 'right'; x.textBaseline = 'top'; x.font = '700 26px Rajdhani, sans-serif';
    x.fillStyle = ui.lockAlert > 0.01 ? (Math.sin(this.t * 16) > 0 ? COL.rd : COL.bg) : COL.gr;
    x.fillText(ui.lockAlert > 0.01 ? 'LOCK!' : 'CLEAR', w - 12, 14);
  }
  // 推進器輸出直條（頭頂，參考圖綠色那排）
  drawBars(x, w, h, ui) {
    const t = this.t, b = (ui.boost || 0) + (ui.hover || 0) * 0.7;
    for (let i = 0; i < 14; i++) {
      const v = clamp(0.25 + b * 0.6 + 0.12 * Math.sin(t * (3 + i * 0.7) + i * 1.3) + (Math.random() - 0.5) * 0.08 * (1 + b), 0.05, 1);
      const bx = 10 + i * 35, bh = (h - 24) * v;
      x.fillStyle = COL.grid; x.fillRect(bx, 12, 24, h - 24);
      x.fillStyle = v > 0.85 ? COL.am : COL.gr; x.fillRect(bx, h - 12 - bh, 24, bh);
    }
  }
  // 反應爐波形（頭頂）
  drawWave(x, w, h, ui) {
    this.grid(x, w, h, 32);
    const t = this.t, amp = 18 + (ui.boost || 0) * 24 + (ui.hover || 0) * 12;
    x.strokeStyle = COL.cy; x.lineWidth = 3; x.beginPath();
    for (let i = 0; i <= w; i += 4) {
      const y = h / 2 + Math.sin(i * 0.045 + t * 7) * amp * 0.6 + Math.sin(i * 0.13 - t * 11) * amp * 0.3;
      if (i) x.lineTo(i, y); else x.moveTo(i, y);
    }
    x.stroke();
    x.fillStyle = COL.wh; x.font = '700 24px Rajdhani, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'top';
    x.fillText(`${(98 + Math.sin(t) * 1.5).toFixed(1)}%`, w - 10, 6);
  }

  drawSpd(x, w, h, ui) {
    const sp = Math.round((ui.speed || 0) * 3.6);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = COL.dim; x.font = '600 30px Rajdhani, sans-serif'; x.fillText('km/h', w / 2, 200);
    x.fillStyle = (ui.boost || 0) > 0.5 ? COL.cy : COL.wh; x.font = '700 92px Rajdhani, sans-serif'; x.fillText(String(sp), w / 2, 120);
    // 速度弧
    x.lineWidth = 10; x.strokeStyle = COL.grid; x.beginPath(); x.arc(w / 2, 130, 110, Math.PI * 0.8, Math.PI * 2.2); x.stroke();
    x.strokeStyle = (ui.boost || 0) > 0.5 ? COL.cy : COL.dim; x.beginPath(); x.arc(w / 2, 130, 110, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * clamp(sp / 200, 0, 1))); x.stroke();
    if ((ui.boost || 0) > 0.5) { x.fillStyle = COL.cy; x.font = '700 30px Rajdhani, sans-serif'; x.fillText('BOOST', w / 2, 36); }
  }

  drawAlt(x, w, h, ui) {
    const alt = Math.max(0, Math.round(ui.alt || 0)), vs = ui.vs || 0;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = COL.dim; x.font = '600 30px Rajdhani, sans-serif'; x.fillText('m', w / 2, 200);
    x.fillStyle = COL.wh; x.font = '700 92px Rajdhani, sans-serif'; x.fillText(String(alt), w / 2, 120);
    // 升降箭頭
    x.fillStyle = vs > 1 ? COL.gr : vs < -1 ? COL.am : COL.grid;
    const up = vs >= 0 ? -1 : 1;
    x.beginPath(); x.moveTo(w - 36, 128 + up * 30); x.lineTo(w - 20, 128); x.lineTo(w - 52, 128); x.closePath(); x.fill();
    if (ui.hover) { x.fillStyle = COL.cy; x.font = '700 30px Rajdhani, sans-serif'; x.fillText('HOVER', w / 2, 36); }
  }
}
