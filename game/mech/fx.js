// 特效：光束、曳光彈、飛彈煙跡、爆炸（火球→濃煙）、火花、塵土、城市煙柱。全部用自訂 shader 的粒子池，少量 draw call。
//   draw call：體積粒子（煙／火／塵，依深度排序）1、線狀粒子（火花／光束／曳光／光暈／碎片）1、光劍殘影 1、飛彈彈體 1，共 4。
//   混色一律用預乘 alpha（ONE, ONE_MINUS_SRC_ALPHA）：輸出 alpha＝0 時等於相加發光，alpha＞0 時是一般遮蔽，火與煙能在同一個 pass 裡。
//   霧自己算（照 env.js 的高度霧公式），不走 three 的 fog chunk。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const VMAX = 3200;   // 體積粒子上限（≤4096，排序鍵用 12 bit 存索引）
const SMAX = 1700;   // 線狀粒子上限
const IMAX = 700;    // 每幀即時線段（彈頭、光束、尾焰、火光）
const MMAX = 48;     // 同時飛行的飛彈
const PMAX = 160;    // 光束／曳光彈
const EMAX = 32;     // 持續發射源（燃燒殘骸、爆炸後煙柱）
const QMAX = 48;     // 延遲事件（二次爆炸）
const LMAX = 2;      // 點光源（初始化時建好，之後只改強度）
const RIB = 4, RSAMP = 14, RSUB = 3, RSEC = (RSAMP - 1) * RSUB + 1;
const VS = 16, SS = 12; // 每個 instance 的 float 數

// 體積粒子旗標
const F_GROUND = 1, F_FIREBALL = 2, F_FLAME = 4, F_AMB = 8, F_TURB = 16;
// 線狀粒子旗標
const S_BOUNCE = 1, S_TRAIL = 2, S_EMBER = 4, S_FIXED = 8, S_HOT = 16, S_REST = 32, S_FIRETRAIL = 64, S_FLICK = 128;
const K_SPARK = 0, K_GLOW = 1, K_DEBRIS = 2, K_BEAM = 3;

const rr = (a, b) => a + (b - a) * Math.random();
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// 火花溫度色階（黑體近似）：T → 顏色 × 強度
const HOT_T = [0, 0.3, 0.6, 0.9, 1.2, 1.5];
const HOT_C = [0.35, 0.03, 0.0, 0, 1, 0.16, 0.02, 1.3, 1, 0.4, 0.09, 4.5, 1, 0.68, 0.32, 10, 1, 0.88, 0.7, 18, 1, 0.95, 0.9, 26];

// ---------------------------------------------------------------- 程序貼圖（4×2 格，每格 256²）
//   R＝密度，G/B＝由密度梯度算的法線 xy，A＝可平鋪的細節雜訊（給動態扭動與火焰溫度用）
//   0–3：煙團，4：翻滾火球團，5：火舌，6：塵土（軟），7：細碎蒸氣團
function buildAtlas() {
  const C = 256, W = C * 4, H = C * 2;
  const data = new Uint8Array(W * H * 4);
  const R = new Float32Array(65536);
  let s = 1234567;
  for (let i = 0; i < 65536; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; R[i] = s / 4294967296; }
  // 可平鋪的數值雜訊（週期 p 為 2 的次方）
  const vn = (x, y, p, o) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const m = p - 1, ox = (o * 59) & 255, oy = (o * 37) & 255;
    const x0 = ((xi & m) + ox) & 255, x1 = (((xi + 1) & m) + ox) & 255;
    const y0 = (((yi & m) + oy) & 255) << 8, y1 = ((((yi + 1) & m) + oy) & 255) << 8;
    const a = R[y0 + x0], b = R[y0 + x1], c = R[y1 + x0], d = R[y1 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  // 先算好四張 256² 可平鋪雜訊場，各格再用位移／倍頻取樣（比逐格重算快很多）
  const field = (oct, o, mode) => {
    const f = new Float32Array(C * C);
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const u = (i + 0.5) / C, v = (j + 0.5) / C;
      let sum = 0, amp = 1, norm = 0, p = 4;
      for (let k = 0; k < oct; k++) {
        let n = vn(u * p, v * p, p, o + k * 7);
        if (mode) n = Math.abs(n * 2 - 1);
        sum += n * amp; norm += amp; amp *= mode ? 0.5 : 0.55; p *= 2;
      }
      f[j * C + i] = sum / norm;
    }
    return f;
  };
  const FS = field(5, 13, 0), FB = field(4, 29, 1), WX = field(3, 41, 0), WY = field(3, 57, 0);
  // 雙線性取樣（座標以 texel 計，自動環繞）
  const samp = (f, x, y) => {
    x -= 0.5; y -= 0.5;
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const x0 = xi & 255, x1 = (xi + 1) & 255, y0 = (yi & 255) << 8, y1 = ((yi + 1) & 255) << 8;
    const a = f[y0 + x0], b = f[y0 + x1], c = f[y1 + x0], d = f[y1 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const A = new Float32Array(C * C);
  for (let k = 0; k < C * C; k++) A[k] = clamp((FS[k] - 0.5) * 2.2 + 0.5, 0, 1);
  const dens = new Float32Array(C * C), Hf = new Float32Array(C * C);
  // 法線用平滑的高度場（不是截斷後的密度）算，邊緣才不會出現硬邊與描邊
  const write = (cell, nk) => {
    const cx = cell & 3, cy = cell >> 2;
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const il = Math.max(0, i - 3), ir = Math.min(C - 1, i + 3), jd = Math.max(0, j - 3), ju = Math.min(C - 1, j + 3);
      const gx = Hf[j * C + ir] - Hf[j * C + il], gy = Hf[ju * C + i] - Hf[jd * C + i];
      const nx = clamp(-gx * nk, -1, 1), ny = clamp(-gy * nk, -1, 1);
      const p = ((cy * C + j) * W + cx * C + i) * 4;
      data[p] = dens[j * C + i] * 255;
      data[p + 1] = (nx * 0.5 + 0.5) * 255;
      data[p + 2] = (ny * 0.5 + 0.5) * 255;
      data[p + 3] = A[j * C + i] * 255;
    }
  };
  // 煙團：幾個大小不一的圓團當底形（先扭曲座標），再乘上翻騰雜訊，最後軟飽和成密度
  const puff = (seed, nb, rMin, rMax, spread, fm, amt, bias, gain, pw, warp) => {
    let s2 = seed >>> 0;
    const rnd = () => ((s2 = (Math.imul(s2, 1664525) + 1013904223) >>> 0) / 4294967296);
    const bx = [], by = [], br = [];
    for (let k = 0; k < nb; k++) {
      const a = rnd() * 6.2832, r = Math.sqrt(rnd()) * spread;
      bx.push(0.5 + Math.cos(a) * r); by.push(0.5 + Math.sin(a) * r * 0.9); br.push(rMin + (rMax - rMin) * rnd());
    }
    const ox = (seed * 53) & 255, oy = (seed * 97) & 255;
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      let u = (i + 0.5) / C, v = (j + 0.5) / C;
      const m = sstep(0.5, 0.37, Math.hypot(u - 0.5, v - 0.5));
      const px = i * fm + ox, py = j * fm + oy;
      const wx = (samp(WX, px, py) - 0.5) * warp, wy = (samp(WY, px, py) - 0.5) * warp;
      u += wx; v += wy;
      let b = 0;
      for (let k = 0; k < nb; k++) {
        const dx = (u - bx[k]) / br[k], dy = (v - by[k]) / br[k];
        const q = 1 - (dx * dx + dy * dy);
        if (q > 0) b += q * q;
      }
      b = Math.min(1.2, b);
      const qx = px + wx * C * fm, qy = py + wy * C * fm;
      const n = 0.5 * clamp((samp(FS, qx, qy) - 0.5) * 2.4 + 0.5, 0, 1) + 0.5 * clamp((samp(FB, qx, qy) - 0.12) * 1.9, 0, 1);
      const h = b * (1 - amt + amt * n) * m;
      Hf[j * C + i] = h;
      const d = 1 - Math.exp(-Math.max(0, h - bias) * gain);
      dens[j * C + i] = pw !== 1 ? Math.pow(d, pw) : d;
    }
  };
  // 花椰菜煙團：大球表面長中球、中球表面長小球，畫成「厚度＋表面高度」圖
  //   厚度＝各球弦長總和 → 密度；表面高度＝各球頂面的最大值 → 法線（一顆顆圓潤的凸起）
  const thick = new Float32Array(C * C);
  const sphPuff = (seed, n0, r0a, r0b, spread, n1, n2, dk, nAmt) => {
    let s2 = seed >>> 0;
    const rnd = () => ((s2 = (Math.imul(s2, 1664525) + 1013904223) >>> 0) / 4294967296);
    const S = [];
    for (let k = 0; k < n0; k++) {
      const a = rnd() * 6.2832, r = Math.sqrt(rnd()) * spread;
      S.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r * 0.85, (rnd() - 0.5) * 0.1, r0a + (r0b - r0a) * rnd()]);
    }
    const grow = (from, to, n, f0, f1) => {
      for (let k = 0; k < n; k++) {
        const P = S[from + ((rnd() * (to - from)) | 0)];
        let dx, dy, dz, l;
        do { dx = rnd() * 2 - 1; dy = rnd() * 2 - 1; dz = rnd() * 2 - 1; l = dx * dx + dy * dy + dz * dz; } while (l > 1 || l < 0.01);
        l = Math.sqrt(l);
        const rr2 = P[3] * (f0 + (f1 - f0) * rnd()), off = P[3] * 0.95 / l;
        S.push([P[0] + dx * off, P[1] + dy * off, P[2] + dz * off, rr2]);
      }
    };
    grow(0, n0, n1, 0.38, 0.6);
    grow(n0, n0 + n1, n2, 0.32, 0.5);
    // 縮放到格子內（半徑 0.45）
    let ext = 0;
    for (const q of S) ext = Math.max(ext, Math.hypot(q[0] - 0.5, q[1] - 0.5) + q[3]);
    const sc = Math.min(1, 0.45 / ext);
    Hf.fill(-0.05); thick.fill(0);
    for (const q of S) {
      const x = (0.5 + (q[0] - 0.5) * sc) * C, y = (0.5 + (q[1] - 0.5) * sc) * C, z = q[2] * sc * C, r = q[3] * sc * C;
      const i0 = Math.max(0, Math.floor(x - r)), i1 = Math.min(C - 1, Math.ceil(x + r));
      const j0 = Math.max(0, Math.floor(y - r)), j1 = Math.min(C - 1, Math.ceil(y + r));
      const ir2 = 1 / (r * r);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - x, dy = j + 0.5 - y, d2 = (dx * dx + dy * dy) * ir2;
        if (d2 >= 1) continue;
        const c = Math.sqrt(1 - d2) * r, k = j * C + i;
        thick[k] += 2 * c / C;
        const top = (z + c) / C;
        if (top > Hf[k]) Hf[k] = top;
      }
    }
    const ox = (seed * 53) & 255, oy = (seed * 97) & 255;
    for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
      const k = j * C + i;
      const n = clamp((samp(FS, i + ox, j + oy) - 0.5) * 2.4 + 0.5, 0, 1);
      dens[k] = (1 - Math.exp(-thick[k] * dk)) * (1 - nAmt + nAmt * n);
      Hf[k] += (n - 0.5) * 0.012;
    }
  };
  //       seed n0 r0a   r0b   spread n1  n2  dk   nAmt
  sphPuff(11, 6, 0.12, 0.19, 0.13, 22, 60, 3.2, 0.45); write(0, 30);
  sphPuff(23, 7, 0.1, 0.17, 0.15, 26, 70, 3.4, 0.5); write(1, 30);
  sphPuff(37, 5, 0.13, 0.2, 0.11, 18, 50, 3.0, 0.4); write(2, 30);
  sphPuff(41, 8, 0.09, 0.16, 0.16, 28, 80, 3.4, 0.5); write(3, 30);
  sphPuff(53, 9, 0.09, 0.15, 0.15, 34, 100, 3.6, 0.4); write(4, 30);
  // 火舌：下寬上尖，向上扭動
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) {
    const u = (i + 0.5) / C, v = (j + 0.5) / C;
    const n = samp(FS, i + 77, j + 31), n2 = 1 - samp(FB, i * 2 + 13, j * 2 + 101);
    const wob = (n - 0.5) * 0.3 * (0.25 + v);
    const x = Math.abs(u - 0.5 + wob);
    const wd = 0.3 * Math.pow(1 - v, 0.85) * sstep(0.0, 0.22, v) + 0.012;
    let d = sstep(wd, wd * 0.2, x) * (0.5 + 0.75 * n2) * sstep(0.0, 0.15, v) * sstep(0.99, 0.75, v);
    d *= sstep(0.495, 0.42, Math.abs(u - 0.5));
    dens[j * C + i] = clamp(d * 1.3, 0, 1);
    Hf[j * C + i] = dens[j * C + i] * 0.6;
  }
  write(5, 2.0);
  puff(67, 7, 0.2, 0.3, 0.14, 1, 0.5, 0.1, 1.8, 1.2, 0.16); write(6, 1.2);
  sphPuff(79, 14, 0.06, 0.11, 0.2, 40, 90, 3.6, 0.55); write(7, 30);

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 1;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------- shader
const FOG_GLSL = /* glsl */`
  uniform vec3 uFogCol, uSunFog, uFogSun; uniform float uFogD;
  // 與 env.js 高度霧同公式
  float fxFog(vec3 wp, out vec3 fc) {
    vec3 ray = wp - cameraPosition;
    float dist = length(ray);
    vec3 dir = ray / max(dist, 1e-3);
    float hf = 0.0045;
    float h0 = max(cameraPosition.y, -20.0);
    float dy = ray.y * hf;
    float t = abs(dy) > 1e-4 ? (1.0 - exp(-dy)) / dy : 1.0;
    float od = uFogD * exp(-hf * h0) * t * dist;
    float s = pow(max(dot(dir, uFogSun), 0.0), 7.0);
    fc = mix(uFogCol, uSunFog, s);
    return clamp(1.0 - exp(-od), 0.0, 1.0);
  }`;

const VOL_VS = /* glsl */`
  attribute vec4 iP; attribute vec4 iA; attribute vec4 iC; attribute vec4 iB;
  uniform float uTime; uniform vec3 uSunDir;
  ${FOG_GLSL}
  varying vec4 vUvs; varying vec4 vRC; varying vec4 vM; varying vec4 vAlb; varying vec4 vFogC;
  varying vec4 vL; varying vec4 vL2; varying vec3 vG;
  void main() {
    vec3 wp = iP.xyz; float size = iP.w;
    vec4 mv = viewMatrix * vec4(wp, 1.0);
    float depth = -mv.z;
    float asp = iB.z;
    vec2 cr = position.xy;
    vec2 off = cr * size * vec2(1.0, asp);
    off.y += (asp - 1.0) * size * 0.8;   // 拉長的火舌底部固定
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    float c = cos(iA.x), s = sin(iA.x);
    vec2 uv1 = vec2(c * cr.x - s * cr.y, s * cr.x + c * cr.y) * 0.5 + 0.5;
    float cellI = floor(iA.z + 0.001);
    float scroll = iA.z - cellI;
    vec2 uv2;
    if (scroll > 0.01) {
      uv2 = cr * vec2(0.42, 0.34) + vec2(iB.x * 3.7, iB.x * 5.1 - uTime * scroll * 1.6);
    } else {
      float a2 = iB.x * 6.2832 - iA.x * 0.6;
      float c2 = cos(a2), s2 = sin(a2);
      uv2 = vec2(c2 * cr.x - s2 * cr.y, s2 * cr.x + c2 * cr.y) * 0.6 + 0.5 + iB.x * 0.37;
    }
    vUvs = vec4(uv1, uv2);
    vRC = vec4(cr, c, s);
    // 靠近鏡頭淡出；太大（塞滿畫面）也淡出
    float nearF = smoothstep(size * 0.3, size * 1.2 + 1.5, depth);
    float proj = size * projectionMatrix[1][1] / max(depth, 0.1);
    float scrF = 1.0 - smoothstep(0.8, 2.0, proj);
    float fade = nearF * scrF;
    vM = vec4(iA.y * fade, iA.w, iB.y, iC.w * fade);
    vec3 fc;
    float f = fxFog(wp, fc);
    vAlb = vec4(iC.rgb, f);
    vFogC = vec4(fc, cellI);
    vL = vec4(normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz), 0.0);
    vec3 upV = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
    float fs = pow(max(dot(normalize(wp - cameraPosition), uFogSun), 0.0), 5.0);
    vL2 = vec4(upV, fs);
    vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float wy = wp.y + off.x * camR.y + off.y * camU.y;
    vG = vec3(wy - iB.w, max(0.5, size * 0.35), fade);
  }`;

const VOL_FS = /* glsl */`
  uniform sampler2D uAtlas; uniform vec3 uSunCol, uAmbSky, uAmbGnd; uniform float uTime;
  varying vec4 vUvs; varying vec4 vRC; varying vec4 vM; varying vec4 vAlb; varying vec4 vFogC;
  varying vec4 vL; varying vec4 vL2; varying vec3 vG;
  // 溫度 → 發光（HDR 黑體色階）
  vec3 bb(float t) {
    vec3 c = vec3(0.0);
    c = mix(c, vec3(0.5, 0.06, 0.012) * 0.8, smoothstep(0.1, 0.3, t));
    c = mix(c, vec3(1.0, 0.2, 0.03) * 1.8, smoothstep(0.3, 0.5, t));
    c = mix(c, vec3(1.0, 0.42, 0.09) * 4.5, smoothstep(0.5, 0.7, t));
    c = mix(c, vec3(1.0, 0.7, 0.32) * 9.0, smoothstep(0.7, 0.9, t));
    c = mix(c, vec3(1.0, 0.9, 0.72) * 16.0, smoothstep(0.9, 1.2, t));
    return c;
  }
  void main() {
    vec2 cr = vRC.xy;
    float r2 = dot(cr, cr);
    if (r2 >= 1.0) discard;
    float cell = vFogC.w;
    vec2 co = vec2(mod(cell, 4.0), floor(cell * 0.25 + 0.01));
    vec4 t1 = texture2D(uAtlas, (co + clamp(vUvs.xy, 0.003, 0.997)) * vec2(0.25, 0.5));
    vec2 u2 = vUvs.zw;
    float n2 = textureGrad(uAtlas, (co + fract(u2)) * vec2(0.25, 0.5), dFdx(u2) * vec2(0.25, 0.5), dFdy(u2) * vec2(0.25, 0.5)).a;
    float dens = clamp(t1.r * (0.6 + 0.8 * n2), 0.0, 1.0);
    // 侵蝕：老的煙團是破碎散開，不是整片變淡
    float e = vM.z;
    float cov = smoothstep(e, min(1.0, e + 0.5), dens);
    float a = cov * vM.x * smoothstep(0.0, vG.y, vG.x);
    // 光照：球形假法線＋貼圖梯度法線（貼圖跟著粒子旋轉，法線轉回來）
    vec2 tn = t1.gb * 2.0 - 1.0;
    tn = vec2(vRC.z * tn.x + vRC.w * tn.y, -vRC.w * tn.x + vRC.z * tn.y);
    vec3 N = normalize(vec3(cr * 0.45 + tn * 0.9, 0.85));
    float ndl = dot(N, vL.xyz);
    float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
    float sh = mix(1.0, wrap, 0.6 * dens);           // 厚處背光面較暗
    float up = dot(N, vL2.xyz) * 0.5 + 0.5;
    vec3 amb = mix(uAmbGnd, uAmbSky, up);
    vec3 alb = vAlb.rgb;
    vec3 lit = alb * (uSunCol * (wrap * sh) + amb);
    // 逆光時薄邊透亮
    lit += uSunCol * (alb + 0.02) * vL2.w * (1.0 - dens) * 1.2;
    // 火光從下方照亮煙底
    float below = clamp(0.5 - dot(N, vL2.xyz) * 0.6, 0.0, 1.0);
    lit += vec3(1.0, 0.33, 0.08) * vM.w * below * (0.3 + 0.7 * dens) * 0.5;
    // 發光：中心熱、邊緣冷
    float T = vM.y * (0.3 + 0.85 * dens + (n2 - 0.5) * 0.5);
    vec3 em = bb(T) * cov * vG.z;
    float f = vAlb.w;
    vec3 col = lit * a * (1.0 - f) + vFogC.rgb * (a * f) + em * (1.0 - f);
    if (a < 0.002 && em.r < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }`;

const STK_VS = /* glsl */`
  attribute vec4 iH; attribute vec4 iT; attribute vec4 iC;
  uniform vec2 uRes;
  ${FOG_GLSL}
  varying vec4 vUV; varying float vWW; varying vec4 vCol; varying vec4 vK;
  void main() {
    vec4 h = viewMatrix * vec4(iH.xyz, 1.0);
    vec4 t = viewMatrix * vec4(iT.xyz, 1.0);
    const float NZ = -1.02;
    if (h.z > NZ && t.z > NZ) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); vCol = vec4(0.0); return; }
    if (h.z > NZ) h = mix(t, h, (t.z - NZ) / (t.z - h.z));
    else if (t.z > NZ) t = mix(h, t, (h.z - NZ) / (h.z - t.z));
    vec4 ch = projectionMatrix * h, ct = projectionMatrix * t;
    vec2 hr = uRes * 0.5;
    vec2 sh = ch.xy / ch.w * hr, st = ct.xy / ct.w * hr;
    vec2 dv = sh - st; float L = length(dv);
    vec2 dir = L > 1e-3 ? dv / L : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float py = projectionMatrix[1][1] * hr.y;
    float wh = iH.w * py / ch.w, wt = iH.w * py / ct.w;
    float eh = max(wh, 0.9), et = max(wt, 0.9);
    float energy = (wh + wt) / (eh + et);         // 細於一像素時變暗，不閃
    energy /= 1.0 + max(0.0, max(eh, et) / hr.y - 0.3) * 2.5;
    bool isH = position.x > 0.5;
    vec4 cp = isH ? ch : ct;
    float e = isH ? eh : et;
    vec2 sp = (isH ? sh : st) + dir * e * (isH ? 1.0 : -1.0) + nrm * e * position.y;
    gl_Position = vec4(sp / hr * cp.w, cp.z, cp.w);
    float Ls = max(L, 1e-3);
    float u = isH ? 1.0 + eh / Ls : -et / Ls;
    vUV = vec4(u, position.y, et / Ls, eh / Ls) * cp.w;   // 螢幕線性內插
    vWW = cp.w;
    vec3 fc;
    float f = fxFog(iH.xyz, fc);
    float k = iT.w;
    vCol = (k > 1.5 && k < 2.5) ? vec4(iC.rgb, iC.a * min(1.0, energy)) : vec4(iC.rgb * energy, iC.a);
    vK = vec4(fc, k + f * 0.5 * 0.999 + 0.0);  // 整數部＝種類，小數×2＝霧
  }`;

const STK_FS = /* glsl */`
  varying vec4 vUV; varying float vWW; varying vec4 vCol; varying vec4 vK;
  void main() {
    float iw = 1.0 / vWW;
    float u = vUV.x * iw, v = vUV.y * iw, cT = vUV.z * iw, cH = vUV.w * iw;
    float dx = u < 0.0 ? -u / max(cT, 1e-4) : (u > 1.0 ? (u - 1.0) / max(cH, 1e-4) : 0.0);
    float d = length(vec2(dx, v));
    if (d >= 1.0) discard;
    float k = floor(vK.w);
    float f = (vK.w - k) * 2.0;
    vec3 col;
    if (k < 0.5) {            // 火花／曳光：高斯核心，尾端較暗
      float prof = exp(-d * d * 4.5) - 0.011;
      col = vCol.rgb * prof * mix(vCol.a, 1.0, clamp(u, 0.0, 1.0));
    } else if (k < 1.5) {     // 光暈
      float prof = exp(-d * 3.8) * (1.0 - d) + smoothstep(0.22, 0.0, d) * 1.2;
      col = vCol.rgb * prof;
    } else if (k < 2.5) {     // 碎片（不透明）
      float a = smoothstep(1.0, 0.6, d) * vCol.a;
      gl_FragColor = vec4(mix(vCol.rgb, vK.rgb, f) * a, a);
      return;
    } else {                  // 光束：白熱核心＋外暈
      float prof = exp(-d * d * 5.0) * 0.75 + smoothstep(0.3, 0.0, d) * 0.9 - 0.005;
      col = vCol.rgb * max(prof, 0.0);
    }
    gl_FragColor = vec4(col * (1.0 - f), 0.0);
  }`;

const RIB_VS = /* glsl */`
  attribute vec2 aInfo; attribute vec3 aCol;
  ${FOG_GLSL}
  varying vec2 vI; varying vec3 vC; varying float vF;
  void main() {
    vI = aInfo; vC = aCol;
    vec3 fc;
    vF = fxFog(position, fc);
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }`;
const RIB_FS = /* glsl */`
  varying vec2 vI; varying vec3 vC; varying float vF;
  void main() {
    float side = vI.x, age = clamp(vI.y, 0.0, 1.0);
    float fa = 1.0 - age; fa *= fa;
    // 外緣柔化，最亮的線落在刀尖內側一點；越靠劍柄越淡
    float rim = 1.0 - smoothstep(0.93, 1.0, side);
    float edge = side * side * side * side;
    vec3 c = vC * (0.035 + 1.0 * edge) * fa * rim;
    c += vec3(1.0) * smoothstep(0.84, 0.96, side) * rim * fa * fa * fa * (vC.r + vC.g + vC.b) * 0.3;
    gl_FragColor = vec4(c * (1.0 - vF), 0.0);
  }`;

const MSL_VS = /* glsl */`
  attribute vec3 aCol;
  varying vec3 vN; varying vec3 vW; varying vec3 vCol;
  void main() {
    mat4 m = modelMatrix * instanceMatrix;
    vec4 wp = m * vec4(position, 1.0);
    vW = wp.xyz; vN = normalize(mat3(m) * normal); vCol = aCol;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const MSL_FS = /* glsl */`
  uniform vec3 uSunDir, uSunCol, uAmbSky, uAmbGnd;
  ${FOG_GLSL}
  varying vec3 vN; varying vec3 vW; varying vec3 vCol;
  void main() {
    vec3 n = normalize(vN);
    float ndl = max(dot(n, uSunDir), 0.0);
    vec3 V = normalize(cameraPosition - vW);
    vec3 H = normalize(V + uSunDir);
    float spec = pow(max(dot(n, H), 0.0), 48.0) * 0.5;
    vec3 amb = mix(uAmbGnd, uAmbSky, n.y * 0.5 + 0.5);
    vec3 c = vCol * (uSunCol * ndl + amb * 1.4) + uSunCol * spec * ndl;
    vec3 fc; float f = fxFog(vW, fc);
    gl_FragColor = vec4(mix(c, fc, f), 1.0);
  }`;

function pmaMaterial(uniforms, vs, fs, extra) {
  return new THREE.ShaderMaterial(Object.assign({
    uniforms, vertexShader: vs, fragmentShader: fs,
    transparent: true, depthWrite: false, depthTest: true, fog: false, lights: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  }, extra || {}));
}

// ---------------------------------------------------------------- 主類別
export class FX {
  constructor(scene, camera, world) {
    this.scene = scene; this.camera = camera; this.world = world;
    this.time = 0; this.dtLast = 1 / 60;
    this.q = 2; this.qn = 1;
    this.amb = false;
    this.wind = new THREE.Vector3(2.6, 0, 1.2);
    this.camPos = new THREE.Vector3(); this.camFwd = new THREE.Vector3(0, 0, -1);
    this._v0 = new THREE.Vector3(); this._v1 = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._m4 = new THREE.Matrix4(); this._one = new THREE.Vector3(1, 1, 1);
    this._zAxis = new THREE.Vector3(0, 0, 1);
    this._d = [0, 0, 0];
    this._cr = 0; this._cg = 0; this._cb = 0;
    this._res = new THREE.Vector2();
    const t0 = performance.now();
    this.atlas = buildAtlas();
    this.buildMs = performance.now() - t0;
    this._uniforms();
    this._buildVolume();
    this._buildStreaks();
    this._buildRibbons();
    this._buildMissiles();
    this._buildLights();
    this._buildState();
  }

  // ---------------------------------------------------------------- 初始化
  _uniforms() {
    const w = this.world;
    const sunI = w.sun ? w.sun.intensity : 6;
    const sunC = (w.sun ? w.sun.color.clone() : new THREE.Color(1, 0.7, 0.45)).multiplyScalar(sunI / Math.PI);
    const fog = w.fogColor ? w.fogColor.clone() : new THREE.Color(0.45, 0.42, 0.42);
    this.u = {
      uTime: { value: 0 },
      uAtlas: { value: this.atlas },
      uSunDir: { value: (w.lightDir ? w.lightDir.clone() : new THREE.Vector3(0.6, 0.2, 0.4)).normalize() },
      uSunCol: { value: sunC },
      uAmbSky: { value: fog.clone().multiplyScalar(0.75) },
      uAmbGnd: { value: fog.clone().multiplyScalar(0.28).multiply(new THREE.Color(1.0, 0.82, 0.62)) },
      uFogCol: { value: fog },
      uSunFog: { value: w.sunFogColor ? w.sunFogColor.clone() : fog.clone() },
      uFogSun: { value: (w.sunDir ? w.sunDir.clone() : new THREE.Vector3(0.6, 0.1, 0.4)).normalize() },
      uFogD: { value: this.scene.fog && this.scene.fog.density ? this.scene.fog.density : 0.00042 },
      uRes: { value: new THREE.Vector2(1920, 1080) },
    };
    // 碎片的固定光照（CPU 端）
    const a = this.u.uAmbSky.value;
    this.debL = [sunC.r * 0.55 + a.r * 1.2, sunC.g * 0.55 + a.g * 1.2, sunC.b * 0.55 + a.b * 1.2];
  }

  _mesh(geo, mat, order) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.renderOrder = order;
    m.matrixAutoUpdate = false;
    m.userData.noAO = true;
    m.visible = false;
    this.scene.add(m);
    return m;
  }

  _buildVolume() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.vBuf = new Float32Array(VMAX * VS);
    const ib = this.vIB = new THREE.InstancedInterleavedBuffer(this.vBuf, VS);
    ib.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iP', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    g.setAttribute('iA', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(ib, 4, 8));
    g.setAttribute('iB', new THREE.InterleavedBufferAttribute(ib, 4, 12));
    g.instanceCount = 0;
    this.vGeo = g;
    this.vRange = { start: 0, count: 0 };
    const u = this.u;
    this.vMat = pmaMaterial({
      uTime: u.uTime, uAtlas: u.uAtlas, uSunDir: u.uSunDir, uSunCol: u.uSunCol, uAmbSky: u.uAmbSky, uAmbGnd: u.uAmbGnd,
      uFogCol: u.uFogCol, uSunFog: u.uSunFog, uFogSun: u.uFogSun, uFogD: u.uFogD,
    }, VOL_VS, VOL_FS);
    this.vMesh = this._mesh(g, this.vMat, 10);
  }

  _buildStreaks() {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.sBuf = new Float32Array((SMAX + IMAX) * SS);
    const ib = this.sIB = new THREE.InstancedInterleavedBuffer(this.sBuf, SS);
    ib.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iH', new THREE.InterleavedBufferAttribute(ib, 4, 0));
    g.setAttribute('iT', new THREE.InterleavedBufferAttribute(ib, 4, 4));
    g.setAttribute('iC', new THREE.InterleavedBufferAttribute(ib, 4, 8));
    g.instanceCount = 0;
    this.sGeo = g;
    this.sRange = { start: 0, count: 0 };
    const u = this.u;
    this.sMat = pmaMaterial({ uRes: u.uRes, uFogCol: u.uFogCol, uSunFog: u.uSunFog, uFogSun: u.uFogSun, uFogD: u.uFogD }, STK_VS, STK_FS);
    this.sMesh = this._mesh(g, this.sMat, 11);
    const res = u.uRes.value;
    this.sMesh.onBeforeRender = (renderer) => {
      const rt = renderer.getRenderTarget();
      if (rt) res.set(rt.width, rt.height); else renderer.getDrawingBufferSize(res);
    };
  }

  _buildRibbons() {
    const nv = RIB * RSEC * 2;
    const g = new THREE.BufferGeometry();
    this.rPos = new Float32Array(nv * 3);
    this.rInfo = new Float32Array(nv * 2);
    this.rCol = new Float32Array(nv * 3);
    const pa = new THREE.BufferAttribute(this.rPos, 3).setUsage(THREE.DynamicDrawUsage);
    const ia = new THREE.BufferAttribute(this.rInfo, 2).setUsage(THREE.DynamicDrawUsage);
    const ca = new THREE.BufferAttribute(this.rCol, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pa); g.setAttribute('aInfo', ia); g.setAttribute('aCol', ca);
    const idx = [];
    for (let r = 0; r < RIB; r++) for (let k = 0; k < RSEC - 1; k++) {
      const a = (r * RSEC + k) * 2, b = a + 2;
      idx.push(a, a + 1, b + 1, a, b + 1, b);
    }
    g.setIndex(idx);
    this.rGeo = g;
    this.rMesh = this._mesh(g, pmaMaterial({ uFogCol: this.u.uFogCol, uSunFog: this.u.uSunFog, uFogSun: this.u.uFogSun, uFogD: this.u.uFogD },
      RIB_VS, RIB_FS, { side: THREE.DoubleSide }), 12);
    // 每條殘影：取樣時間與握柄／刀尖座標
    this.rib = [];
    for (let r = 0; r < RIB; r++) {
      this.rib.push({ n: 0, last: -99, t: new Float32Array(RSAMP), a: new Float32Array(RSAMP * 3), b: new Float32Array(RSAMP * 3), col: new THREE.Color() });
    }
  }

  _buildMissiles() {
    const parts = [];
    const add = (g, c) => {
      const n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
      g.setAttribute('aCol', new THREE.BufferAttribute(a, 3));
      if (!g.index) g = g.toNonIndexed();
      parts.push(g);
    };
    const body = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 12, 1); body.rotateX(Math.PI / 2); add(body, [0.12, 0.12, 0.125]);
    const nose = new THREE.ConeGeometry(0.3, 0.55, 12, 1); nose.rotateX(Math.PI / 2); nose.translate(0, 0, 1.175); add(nose, [0.5, 0.49, 0.46]);
    const band = new THREE.CylinderGeometry(0.305, 0.305, 0.12, 12, 1, true); band.rotateX(Math.PI / 2); band.translate(0, 0, 0.6); add(band, [0.55, 0.42, 0.08]);
    const noz = new THREE.CylinderGeometry(0.3, 0.22, 0.25, 12, 1, true); noz.rotateX(Math.PI / 2); noz.translate(0, 0, -1.02); add(noz, [0.04, 0.04, 0.04]);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.BoxGeometry(0.03, 0.36, 0.45);
      fin.translate(0, 0.44, -0.62); fin.rotateZ(k * Math.PI / 2 + Math.PI / 4);
      add(fin, [0.09, 0.09, 0.095]);
    }
    const geo = mergeGeometries(parts);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSunDir: this.u.uSunDir, uSunCol: this.u.uSunCol, uAmbSky: this.u.uAmbSky, uAmbGnd: this.u.uAmbGnd,
        uFogCol: this.u.uFogCol, uSunFog: this.u.uSunFog, uFogSun: this.u.uFogSun, uFogD: this.u.uFogD,
      },
      vertexShader: MSL_VS, fragmentShader: MSL_FS, fog: false, lights: false,
    });
    const m = new THREE.InstancedMesh(geo, mat, MMAX);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    m.userData.noAO = true;
    m.visible = false;
    this.scene.add(m);
    this.mMesh = m;
    this.mList = [];
    for (let i = 0; i < MMAX; i++) this.mList.push(null);
    this.mN = 0;
  }

  _buildLights() {
    this.lights = [];
    for (let i = 0; i < LMAX; i++) {
      const l = new THREE.PointLight(0xffa060, 0, 120, 2);
      l.castShadow = false;
      l.userData.noAO = true;
      this.scene.add(l);
      this.lights.push({ l, age: 99, peak: 0, dur: 1, cur: 0 });
    }
  }

  _buildState() {
    const f = (n) => new Float32Array(n);
    // 體積粒子
    const N = VMAX;
    this.V = {
      x: f(N), y: f(N), z: f(N), vx: f(N), vy: f(N), vz: f(N), age: f(N), life: f(N),
      s0: f(N), s1: f(N), sk: f(N), grow: f(N), rot: f(N), rotV: f(N), a0: f(N), fin: f(N), fout: f(N),
      r: f(N), g: f(N), b: f(N), lit: f(N), temp: f(N), cool: f(N), hold: f(N), drag: f(N), dragB: f(N),
      rise: f(N), buoy: f(N), wf: f(N), grav: f(N), glow: f(N), glowK: f(N), cell: f(N), asp: f(N), gy: f(N),
      erode: f(N), seed: f(N), turb: f(N),
      // 每幀快取
      sz: f(N), ao: f(N), to: f(N), eo: f(N), lf: f(N),
      flags: new Uint8Array(N), alive: new Uint8Array(N),
    };
    this.vFree = new Int32Array(N); this.vFreeN = N;
    for (let i = 0; i < N; i++) this.vFree[i] = N - 1 - i;
    this.vCount = 0; this.vAmbN = 0;
    this.vKeys = new Uint32Array(N).fill(0xFFFFFFFF);
    this.vPrevN = 0;
    // 線狀粒子
    const M = SMAX;
    this.S = {
      x: f(M), y: f(M), z: f(M), vx: f(M), vy: f(M), vz: f(M), age: f(M), life: f(M), w: f(M), st: f(M),
      temp: f(M), cool: f(M), grav: f(M), drag: f(M), r: f(M), g: f(M), b: f(M), a: f(M), fp: f(M), seed: f(M), tacc: f(M),
      kind: new Uint8Array(M), flags: new Uint8Array(M), bn: new Uint8Array(M), alive: new Uint8Array(M),
    };
    this.sFree = new Int32Array(M); this.sFreeN = M;
    for (let i = 0; i < M; i++) this.sFree[i] = M - 1 - i;
    this.sCount = 0;
    this.sN = 0; // 本幀寫入 GPU 的線段數
    // 光束／曳光彈
    const P = PMAX;
    this.P = {
      fx: f(P), fy: f(P), fz: f(P), dx: f(P), dy: f(P), dz: f(P), len: f(P), trav: f(P), speed: f(P), blen: f(P),
      age: f(P), kind: new Uint8Array(P), alive: new Uint8Array(P),
    };
    // 持續發射源
    const E = EMAX;
    this.E = {
      x: f(E), y: f(E), z: f(E), t: f(E), dur: f(E), sc: f(E), accS: f(E), accF: f(E), accE: f(E),
      type: new Uint8Array(E), alive: new Uint8Array(E),
    };
    // 延遲事件
    this.Q = { t: f(QMAX), x: f(QMAX), y: f(QMAX), z: f(QMAX), s: f(QMAX), alive: new Uint8Array(QMAX) };
    // 城市環境：煙柱與火點
    const w = this.world;
    const sN = (w.smokeSites || []).length, fN = (w.fireSites || []).length;
    this.ss = { act: new Uint8Array(sN), acc: new Float32Array(sN), rate: f(sN), scl: f(sN), rise: f(sN), fire: new Uint8Array(sN), far: new Uint8Array(sN) };
    for (let i = 0; i < sN; i++) {
      this.ss.rate[i] = rr(0.8, 1.25); this.ss.scl[i] = rr(0.8, 1.3); this.ss.rise[i] = rr(4.8, 7.6);
      const p = w.smokeSites[i];
      for (let k = 0; k < fN; k++) { const q = w.fireSites[k]; if (Math.abs(q.x - p.x) < 1 && Math.abs(q.z - p.z) < 1) this.ss.fire[i] = 1; }
    }
    this.fs = { act: new Uint8Array(fN), accF: new Float32Array(fN), accE: new Float32Array(fN), ph: f(fN) };
    for (let i = 0; i < fN; i++) this.fs.ph[i] = Math.random() * 100;
    this.kIdx = new Int32Array(16); this.kD = new Float32Array(16);
    this.sSel = new Int32Array(16); this.sSelN = 0;
    this.fSel = new Int32Array(16); this.fSelN = 0;
    this.siteT = 0;
    this.skidAcc = 0; this.skidSpk = 0; this.washAcc = 0;
    // 光波砲（每幀由 combat 設定，update 時畫出來）
    this.cn = { fresh: false, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 1, tx: 0, ty: 0, tz: 0, on: false, charge: 0, I: 0, hit: false, lt: 0 };
    this._u = new Float32Array(3); this._v = new Float32Array(3);
  }

  // ---------------------------------------------------------------- 公開 API
  setQuality(q) {
    this.q = clamp(q | 0, 0, 2);
    this.qn = [0.45, 0.72, 1.0][this.q];
    this.siteT = 0;
  }

  ambient(on) {
    this.amb = !!on;
    this.siteT = 0;
    if (!this.amb) { this.ss.act.fill(0); this.fs.act.fill(0); this.sSelN = 0; this.fSelN = 0; }
  }

  beam(from, to, kind) {
    const en = kind === 'enemy' ? 1 : 0;
    const j = this._pa(from, to, en, 1200, 20);
    const P = this.P;
    if (j >= 0) this._beamFlare(from.x, from.y, from.z, P.dx[j], P.dy[j], P.dz[j], en);
  }

  tracer(from, to) { this._pa(from, to, 2, 900, 7); }

  // 戰車砲彈：慢速粗曳光，回傳槽位（可用 projEnd 提前結束）
  shellTracer(from, to, speed) { return this._pa(from, to, 4, speed || 260, 6); }

  projEnd(j) { if (j >= 0 && j < PMAX) this.P.alive[j] = 0; }

  // 履帶揚塵：往後方低低散開的小塵團，amount 0..1
  trackDust(pos, dir, amount) {
    const am = clamp(amount === undefined ? 1 : amount, 0, 1);
    if (am < 0.02) return;
    let dx = dir.x, dz = dir.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const V = this.V, gy = pos.y;
    const n = Math.random() < am * this.qn ? 1 : 0;
    for (let k = 0; k < n; k++) {
      const side = rr(-2, 2), sp = rr(2, 5) * am, br = rr(0.85, 1.1);
      const i = this._smoke(pos.x - dx * 4 + dz * side, gy + 0.4, pos.z - dz * 4 - dx * side, -dx * sp + rr(-0.6, 0.6), rr(0.3, 1.1), -dz * sp + rr(-0.6, 0.6),
        rr(1.6, 2.6), rr(0.7, 1.1), rr(3, 4.6), 0.1 + 0.14 * am, 0.32 * br, 0.27 * br, 0.22 * br);
      if (i >= 0) { V.drag[i] = 1.6; V.rise[i] = 0.3; V.cell[i] = Math.random() < 0.5 ? 6 : 7; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.fout[i] = 0.35; V.erode[i] = 0.4; }
    }
  }

  muzzle(pos, dir, kind) {
    const x = pos.x, y = pos.y, z = pos.z;
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    const qn = this.qn;
    if (kind === 'beam') {
      this._beamFlare(x, y, z, dx, dy, dz, 0);
    } else if (kind === 'mg') {
      this._glow(x, y, z, 1.1, 1, 0.62, 0.26, 9, 0.05, 1.5);
      this._glow(x, y, z, 0.4, 1, 0.9, 0.7, 18, 0.035, 1);
      for (let k = 0; k < 4; k++) {
        this._cone(dx, dy, dz, 0.35);
        const l = rr(1.2, 2.6), d = this._d;
        this._spike(x, y, z, d[0] * l, d[1] * l, d[2] * l, 0.22, 1, 0.62, 0.25, 10, 0.04);
      }
      if (Math.random() < 0.7) {
        const i = this._smoke(x + dx, y + dy, z + dz, dx * rr(4, 8) + rr(-0.5, 0.5), dy * 5 + 0.6, dz * rr(4, 8) + rr(-0.5, 0.5), rr(0.8, 1.2), 0.45, rr(1.8, 2.6), 0.28, 0.42, 0.41, 0.4);
        if (i >= 0) { this.V.drag[i] = 3; this.V.rise[i] = 0.8; this.V.cell[i] = 7; }
      }
    } else if (kind === 'cannon') {
      // 大口徑砲：短促火球＋放射火舌＋砲口制退器往兩側噴出的煙
      this._glow(x, y, z, 2.6, 1, 0.6, 0.26, 8, 0.07, 1.5);
      this._glow(x, y, z, 0.9, 1, 0.9, 0.75, 16, 0.045, 1);
      for (let k = 0; k < 6; k++) {
        this._cone(dx, dy, dz, 0.3);
        const l = rr(3, 7), d = this._d;
        this._spike(x, y, z, d[0] * l, d[1] * l, d[2] * l, 0.55, 1, 0.55, 0.2, 9, 0.06);
      }
      for (let k = 0; k < 7; k++) {
        const sp = rr(12, 36);
        const i = this._flame(x, y, z, dx * sp + rr(-2, 2), dy * sp + rr(-2, 2), dz * sp + rr(-2, 2), rr(0.7, 1.2), 1.0, rr(0.14, 0.22));
        if (i >= 0) { this.V.dragB[i] = 8; this.V.cell[i] = 4.5; this.V.asp[i] = 1; this.V.fin[i] = 0; this.V.fout[i] = 0.2; }
      }
      const n = Math.round(12 * (0.5 + 0.5 * qn));
      for (let k = 0; k < n; k++) {
        let vx, vy, vz;
        if (k & 1) { this._cone(dx, dy, dz, 0.35); const sp = rr(8, 30), d = this._d; vx = d[0] * sp; vy = d[1] * sp; vz = d[2] * sp; }
        else { // 側噴
          const sgn = (k & 2) ? 1 : -1, sx = -dz * sgn, sz = dx * sgn, sp = rr(6, 14);
          vx = sx * sp + dx * 3; vy = rr(0, 2); vz = sz * sp + dz * 3;
        }
        const br = rr(0.9, 1.05);
        const i = this._smoke(x, y, z, vx, vy, vz, rr(2.2, 3.8), rr(0.8, 1.2), rr(3.5, 6), 0.42, 0.44 * br, 0.43 * br, 0.41 * br);
        if (i >= 0) { const V = this.V; V.dragB[i] = 3; V.drag[i] = 0.8; V.rise[i] = 0.8; V.glow[i] = 2; V.glowK[i] = 8; V.cell[i] = (k % 3 === 0) ? 7 : (Math.random() * 4) | 0; V.erode[i] = 0.6; }
      }
      this._flash(x + dx * 3, y + dy * 3, z + dz * 3, 0.45);
    } else { // missile
      this._glow(x, y, z, 2.2, 1, 0.7, 0.4, 8, 0.1, 1.5);
      const n = Math.round(8 * (0.5 + 0.5 * qn));
      for (let k = 0; k < n; k++) {
        const sp = rr(6, 20);
        const i = this._smoke(x, y, z, -dx * sp + rr(-3, 3), -dy * sp + rr(-2, 3), -dz * sp + rr(-3, 3), rr(1.8, 3), rr(0.8, 1.2), rr(4, 6.5), 0.5, 0.55, 0.55, 0.53);
        if (i >= 0) { this.V.dragB[i] = 2.5; this.V.drag[i] = 0.9; this.V.rise[i] = 0.7; this.V.glow[i] = 2.5; this.V.glowK[i] = 6; }
      }
      for (let k = 0; k < 3; k++) {
        const sp = rr(8, 16);
        const i = this._flame(x, y, z, -dx * sp, -dy * sp, -dz * sp, rr(0.7, 1.1), 1.05, 0.3);
        if (i >= 0) { this.V.dragB[i] = 6; this.V.cell[i] = 4.5; this.V.asp[i] = 1; }
      }
    }
  }

  impact(pos, normal, kind) {
    const x = pos.x, y = pos.y, z = pos.z;
    let nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
    const L = Math.hypot(nx, ny, nz);
    if (L < 1e-5) { nx = 0; ny = 1; nz = 0; } else { nx /= L; ny /= L; nz /= L; }
    const qn = this.qn, V = this.V, d = this._d;
    const gy = this.world.height(x, z);
    if (kind === 'armor') {
      this._glow(x, y, z, 3.2, 1, 0.72, 0.4, 16, 0.07, 1.5);
      this._glow(x, y, z, 0.9, 1, 0.95, 0.85, 40, 0.04, 1);
      const n = Math.round(34 * qn) + 8;
      for (let k = 0; k < n; k++) {
        this._cone(nx, ny, nz, 0.95);
        const sp = rr(16, 64);
        this._spark(x, y, z, d[0] * sp, d[1] * sp + rr(0, 4), d[2] * sp, rr(0.35, 1.1), rr(0.028, 0.055), rr(1.0, 1.4), rr(1.3, 2.5));
      }
      for (let k = 0; k < 3; k++) {
        const i = this._flame(x + nx * 0.5, y + ny * 0.5, z + nz * 0.5, nx * rr(2, 6) + rr(-1, 1), ny * rr(2, 6) + rr(0, 2), nz * rr(2, 6) + rr(-1, 1), rr(0.5, 0.8), 1.05, rr(0.25, 0.4));
        if (i >= 0) { V.cell[i] = 4.5; V.asp[i] = 1; V.s1[i] = rr(1.6, 2.2); V.dragB[i] = 4; }
      }
      for (let k = 0; k < 2; k++) {
        const i = this._smoke(x + nx * 0.6, y + ny * 0.6, z + nz * 0.6, nx * 2 + rr(-0.6, 0.6), ny * 2 + 1.2, nz * 2 + rr(-0.6, 0.6), rr(1.6, 2.6), rr(0.5, 0.8), rr(3, 4.5), 0.5, 0.07, 0.065, 0.06);
        if (i >= 0) { V.rise[i] = 1.8; V.drag[i] = 1.5; V.glow[i] = 1.5; V.glowK[i] = 4; V.erode[i] = 0.65; }
      }
    } else if (kind === 'ground') {
      const n = Math.round(9 * qn) + 4;
      for (let k = 0; k < n; k++) {
        this._cone(nx * 0.7, ny * 0.7 + 0.5, nz * 0.7, 0.55);
        const sp = rr(6, 20);
        const br = rr(0.8, 1.2);
        const i = this._smoke(x + rr(-0.5, 0.5), y + 0.3, z + rr(-0.5, 0.5), d[0] * sp, d[1] * sp, d[2] * sp, rr(1.3, 2.4), rr(0.6, 1.1), rr(3, 5.5), 0.75, 0.2 * br, 0.16 * br, 0.12 * br);
        if (i >= 0) { V.grav[i] = 6; V.drag[i] = 1.2; V.rise[i] = 0; V.cell[i] = Math.random() < 0.5 ? 7 : 6; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.erode[i] = 0.6; V.fout[i] = 0.35; }
      }
      for (let k = 0; k < 4; k++) {
        const a = Math.random() * 6.283, sp = rr(1.5, 4);
        const i = this._smoke(x, gy + 0.6, z, Math.cos(a) * sp, rr(0.5, 1.5), Math.sin(a) * sp, rr(3, 5), rr(1.2, 2), rr(5, 8), 0.34, 0.3, 0.26, 0.21);
        if (i >= 0) { V.rise[i] = 0.3; V.drag[i] = 1.4; V.cell[i] = 6; V.gy[i] = gy; V.flags[i] |= F_GROUND; }
      }
      const m = Math.round(18 * qn) + 5;
      for (let k = 0; k < m; k++) {
        this._cone(nx * 0.6, ny * 0.6 + 0.6, nz * 0.6, 0.6);
        const sp = rr(7, 24);
        this._debris(x, y + 0.2, z, d[0] * sp, d[1] * sp, d[2] * sp, rr(1.2, 2.2), rr(0.05, 0.14), 0.13, 0.105, 0.08, 0);
      }
    } else if (kind === 'building') {
      const n = Math.round(8 * qn) + 4;
      for (let k = 0; k < n; k++) {
        this._cone(nx, ny, nz, 0.7);
        const sp = rr(2.5, 10);
        const br = rr(0.9, 1.1);
        const i = this._smoke(x + nx * 0.5, y + ny * 0.5, z + nz * 0.5, d[0] * sp, d[1] * sp + 0.5, d[2] * sp, rr(2.5, 4.5), rr(0.9, 1.5), rr(5, 9), 0.6, 0.42 * br, 0.4 * br, 0.37 * br);
        if (i >= 0) { V.drag[i] = 1.6; V.grav[i] = 0.6; V.rise[i] = -0.3; V.cell[i] = [6, 7, 0, 2][k & 3]; V.gy[i] = gy; V.erode[i] = 0.55; }
      }
      const m = Math.round(12 * qn) + 4;
      for (let k = 0; k < m; k++) {
        this._cone(nx, ny + 0.25, nz, 0.8);
        const sp = rr(5, 20);
        this._debris(x, y, z, d[0] * sp, d[1] * sp, d[2] * sp, rr(1.5, 3), rr(0.1, 0.34), 0.36, 0.34, 0.31, S_BOUNCE);
      }
      for (let k = 0; k < 5; k++) {
        this._cone(nx, ny, nz, 0.9);
        const sp = rr(15, 40);
        this._spark(x, y, z, d[0] * sp, d[1] * sp, d[2] * sp, rr(0.3, 0.7), 0.03, rr(0.9, 1.2), 2.2);
      }
    } else { // beam
      this._glow(x, y, z, 4.5, 1, 0.58, 0.28, 20, 0.11, 1.5);
      this._glow(x, y, z, 1.3, 1, 0.94, 0.85, 36, 0.06, 1);
      this._glow(x + nx * 0.2, y + ny * 0.2, z + nz * 0.2, 1.8, 1, 0.42, 0.1, 7, 0.9, 1.4);
      const n = Math.round(22 * qn) + 8;
      for (let k = 0; k < n; k++) {
        this._cone(nx, ny, nz, 1.0);
        const sp = rr(7, 30);
        const i = this._spark(x, y, z, d[0] * sp, d[1] * sp + rr(0, 3), d[2] * sp, rr(0.7, 1.8), rr(0.06, 0.13), rr(0.9, 1.2), rr(0.7, 1.3));
        if (i >= 0) this.S.st[i] = 0.03;
      }
      const m = Math.round(14 * qn) + 4;
      for (let k = 0; k < m; k++) {
        this._cone(nx, ny, nz, 0.8);
        const sp = rr(30, 75);
        this._spark(x, y, z, d[0] * sp, d[1] * sp, d[2] * sp, rr(0.25, 0.55), 0.03, 1.35, 2.6);
      }
      for (let k = 0; k < 3; k++) {
        const i = this._flame(x + nx * 0.4, y + ny * 0.4, z + nz * 0.4, nx * 3 + rr(-1, 1), ny * 3 + 1, nz * 3 + rr(-1, 1), rr(0.5, 0.9), 1.1, rr(0.25, 0.4));
        if (i >= 0) { V.cell[i] = 4.5; V.asp[i] = 1; V.s1[i] = 2; }
      }
      for (let k = 0; k < 5; k++) {
        const i = this._smoke(x + nx * 0.5, y + ny * 0.5, z + nz * 0.5, nx * rr(1, 4) + rr(-1, 1), ny * 2 + rr(3, 5), nz * rr(1, 4) + rr(-1, 1), rr(1.2, 2.2), rr(0.5, 0.9), rr(3.5, 6), 0.32, 0.7, 0.7, 0.69);
        if (i >= 0) { V.rise[i] = 3.5; V.drag[i] = 1.2; V.cell[i] = 7; V.erode[i] = 0.7; V.glow[i] = 1.8; V.glowK[i] = 3; }
      }
    }
  }

  explosion(pos, size) { this._explode(pos.x, pos.y, pos.z, size === undefined ? 1 : size, false); }

  smokeColumn(pos, seconds) {
    const j = this._ea(0, pos.x, pos.y, pos.z, seconds === undefined ? 60 : seconds, 1);
    return j;
  }

  missile(kind) {
    const h = { pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1), alive: true, _en: kind === 'enemy' ? 1 : 0, _last: new THREE.Vector3(), _init: false, _age: 0, _ph: Math.random() * 10 };
    if (this.mN >= MMAX) { h.alive = false; return h; }
    this.mList[this.mN++] = h;
    return h;
  }

  missileEnd(handle) {
    if (!handle) return;
    handle.alive = false;
    for (let k = 0; k < this.mN; k++) if (this.mList[k] === handle) {
      this.mList[k] = this.mList[this.mN - 1]; this.mList[this.mN - 1] = null; this.mN--; break;
    }
  }

  dust(pos, size) {
    const s = size === undefined ? 1 : size;
    const V = this.V, gy = pos.y;
    const n = Math.round((12 + 10 * s) * (0.5 + 0.5 * this.qn));
    const sp0 = Math.pow(s, 0.6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.2832 + rr(-0.2, 0.2), ca = Math.cos(a), sa = Math.sin(a);
      const r0 = 1.1 * s + rr(0, 1), sp = rr(6, 11) * sp0, br = rr(0.85, 1.1);
      const i = this._smoke(pos.x + ca * r0, gy + 0.3 * s, pos.z + sa * r0, ca * sp, rr(0.3, 1.2), sa * sp,
        rr(1.6, 2.6) * (0.8 + 0.2 * s), rr(0.8, 1.4) * s, rr(3.5, 5) * s, 0.16, 0.32 * br, 0.27 * br, 0.22 * br);
      if (i >= 0) { V.drag[i] = 2.6; V.rise[i] = 0.25; V.wf[i] = 0.3; V.sk[i] = 1.5; V.grow[i] = 0.15 * s; V.cell[i] = k & 1 ? 6 : 7; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.fout[i] = 0.3; V.erode[i] = 0.35; }
    }
  }

  // 牆面被打：碎塊沿牆往下掉＋一團往下滑的粉塵（k：1＝步槍、2～3＝飛彈／光劍）
  crumble(pos, normal, k) {
    const s = clamp(k === undefined ? 1 : k, 0.3, 3), V = this.V, qn = this.qn;
    let nx = normal ? normal.x : 0, nz = normal ? normal.z : 0;
    const up = normal && normal.y > 0.7;
    if (up) { nx = 0; nz = 0; }
    const x = pos.x + nx * 0.6, y = pos.y, z = pos.z + nz * 0.6;
    const nP = Math.round((1 + 1 * s) * (0.5 + 0.5 * qn));
    for (let i = 0; i < nP; i++) {
      const br = rr(0.9, 1.1);
      const j = this._smoke(x + rr(-1, 1), y + rr(-1, 0.5), z + rr(-1, 1), nx * rr(1, 3.5) + rr(-0.8, 0.8), rr(-4, -1) * (up ? 0 : 1), nz * rr(1, 3.5) + rr(-0.8, 0.8),
        rr(2.5, 4.5), rr(1, 1.8), rr(4, 7) * Math.sqrt(s), 0.42, 0.44 * br, 0.41 * br, 0.37 * br);
      if (j >= 0) { V.grav[j] = 1.5; V.drag[j] = 1.4; V.rise[j] = 0.2; V.cell[j] = i & 1 ? 6 : 7; V.erode[j] = 0.5; V.fout[j] = 0.4; }
    }
    const nD = Math.round((5 + 7 * s) * qn) + 2;
    for (let i = 0; i < nD; i++) {
      const sp = rr(1, 5);
      this._debris(x + rr(-0.8, 0.8), y + rr(-0.5, 0.5), z + rr(-0.8, 0.8), nx * sp + rr(-2, 2), rr(-1, 4), nz * sp + rr(-2, 2), rr(2.5, 4), rr(0.12, 0.4) * (0.8 + 0.2 * s), 0.37, 0.35, 0.32, 0);
    }
  }

  // 建築持續冒煙：s＝{x,y,z,nx,nz,lv,r,acc,accF,t,dur,fire}（由 world 每幀呼叫最近的幾個）
  // lv1 傷口灰煙；lv2 傷口起火＋黑煙；lv3 倒塌後的瓦礫堆餘煙（慢慢變少）
  bldSmoke(s, dt) {
    const V = this.V, qn = this.qn, busy = this.vCount > VMAX * 0.75 ? 0.4 : 1;
    const q = (0.55 + 0.45 * qn) * busy;
    if (s.lv === 3) {
      const k = Math.max(0, 1 - s.t / s.dur), R = s.r;
      s.acc += (0.6 + 0.9 * R) * q * k * dt;
      while (s.acc >= 1) {
        s.acc -= 1;
        const a = Math.random() * 6.2832, rd = Math.sqrt(Math.random()) * 6 * R, br = rr(0.85, 1.1);
        const j = this._smoke(s.x + Math.cos(a) * rd, s.y + rr(-1, 1), s.z + Math.sin(a) * rd, rr(-1, 1), rr(1.5, 3), rr(-1, 1),
          rr(7, 11), rr(3, 5) * R, rr(10, 15) * R, 0.35 + 0.2 * k, 0.26 * br, 0.24 * br, 0.21 * br);
        if (j >= 0) { V.rise[j] = rr(2, 3.5); V.drag[j] = 0.5; V.sk[j] = 0.2; V.grow[j] = 0.4; V.wf[j] = 1; V.erode[j] = 0.55; V.fin[j] = 0.1; V.fout[j] = 0.5; V.flags[j] |= F_TURB; V.turb[j] = 0.6; V.cell[j] = (Math.random() * 4) | 0; }
      }
      if (s.fire && s.t < s.dur * 0.6) {
        s.accF += 5 * qn * busy * dt;
        while (s.accF >= 1) {
          s.accF -= 1;
          const a = Math.random() * 6.2832, rd = Math.sqrt(Math.random()) * 3 * R;
          this._flame(s.x + Math.cos(a) * rd, s.y + rr(-0.5, 0.5), s.z + Math.sin(a) * rd, rr(-0.4, 0.4), rr(1.5, 3), rr(-0.4, 0.4), rr(1.4, 2.4), rr(0.7, 0.85), rr(0.5, 0.9));
        }
      }
      return;
    }
    const fire = s.lv >= 2;
    const x = s.x + s.nx * 1.2, z = s.z + s.nz * 1.2;
    const fade = Math.min(1, Math.max(0, (s.dur - s.t) / (s.dur * 0.3)));
    s.acc += (fire ? 1.8 : 1.1) * q * fade * dt;
    while (s.acc >= 1) {
      s.acc -= 1;
      const br = rr(0.85, 1.1), c = fire ? 0.06 : 0.2;
      const j = this._smoke(x + rr(-0.8, 0.8), s.y + rr(-0.5, 0.8), z + rr(-0.8, 0.8), s.nx * rr(1, 3) + rr(-0.5, 0.5), rr(2, 4), s.nz * rr(1, 3) + rr(-0.5, 0.5),
        rr(6, 9), rr(2, 3), fire ? rr(10, 16) : rr(7, 11), fire ? 0.75 : 0.5, c * br, c * 0.95 * br, c * 0.9 * br);
      if (j >= 0) {
        V.rise[j] = rr(4, 6); V.drag[j] = 0.35; V.sk[j] = 0.18; V.grow[j] = 0.35; V.erode[j] = 0.55; V.fout[j] = 0.5; V.flags[j] |= F_TURB; V.turb[j] = 0.5;
        if (fire) { V.glow[j] = rr(1.5, 2.3); V.glowK[j] = 1; V.lit[j] = 1.2; }
      }
    }
    if (fire) {
      s.accF += 8 * qn * busy * fade * dt;
      while (s.accF >= 1) {
        s.accF -= 1;
        this._flame(x + rr(-1, 1), s.y + rr(-0.8, 0.5), z + rr(-1, 1), s.nx * rr(0.5, 2), rr(1.5, 3), s.nz * rr(0.5, 2), rr(1.5, 2.6), rr(0.75, 0.9), rr(0.5, 0.9));
        if (Math.random() < 0.25) {
          const i = this._spark(x, s.y + 1, z, rr(-1, 1) + s.nx, rr(3, 6), rr(-1, 1) + s.nz, rr(2, 4), rr(0.04, 0.07), rr(0.75, 0.95), 0.15);
          if (i >= 0) { const S = this.S; S.flags[i] = S_HOT | S_EMBER | S_FLICK; S.grav[i] = -0.4; S.drag[i] = 0.8; S.st[i] = 0.1; }
        }
      }
    }
  }

  // 大樓倒塌：b＝{x0,x1,z0,z1,w,d,top,gy,u}；ph 0＝開始（底層爆開）、1＝倒塌中（每幀）、2＝落地
  // 底部往外湧的貼地塵雲停留幾秒就散；n＝同時倒塌的棟數（多棟時每棟少噴一點）
  collapse(b, ph, u, dt, n) {
    const V = this.V, S = this.S, qn = this.qn, gy = b.gy;
    const K = 0.5 * (0.5 + 0.5 * qn) / Math.max(1, (n || 1) * 0.6) * (this.vCount > VMAX * 0.8 ? 0.35 : 1);
    const size = Math.min(1.6, 0.75 + b.top / 200);
    const per = (m, o) => {   // 牆腳上的隨機點 → o[0..3]＝x、z、外法線 nx、nz
      const side = (Math.random() * 4) | 0, v = Math.random();
      o[0] = side === 0 ? b.x0 - m : side === 1 ? b.x1 + m : b.x0 + (b.x1 - b.x0) * v;
      o[1] = side === 2 ? b.z0 - m : side === 3 ? b.z1 + m : b.z0 + (b.z1 - b.z0) * v;
      o[2] = side === 0 ? -1 : side === 1 ? 1 : 0; o[3] = side === 2 ? -1 : side === 3 ? 1 : 0;
      return o;
    };
    const o = this._co || (this._co = [0, 0, 0, 0]);
    const surge = (cnt, sp0, sp1, life0, life1, big) => {
      for (let k = 0; k < cnt; k++) {
        per(1, o);
        const sp = rr(sp0, sp1), br = rr(0.85, 1.08), tg = rr(-4, 4);
        const i = this._smoke(o[0], gy + rr(1, 5), o[1], o[2] * sp - o[3] * tg, rr(0.5, 3), o[3] * sp + o[2] * tg,
          rr(life0, life1), rr(4, 7) * size, rr(16, 26) * size * big, rr(0.5, 0.62), 0.37 * br, 0.34 * br, 0.3 * br);
        if (i >= 0) { V.drag[i] = rr(0.7, 1.1); V.rise[i] = 0.35; V.wf[i] = 0.5; V.sk[i] = 0.3; V.grow[i] = 0.45 * size; V.cell[i] = k & 1 ? 6 : 7; V.gy[i] = gy; V.flags[i] |= F_GROUND | F_TURB; V.turb[i] = 0.4; V.fin[i] = 0.04; V.fout[i] = 0.55; V.erode[i] = 0.4; }
      }
    };
    if (ph === 0) {
      // 底層爆開：一圈粉塵＋玻璃、混凝土碎片往外噴
      surge(Math.round(22 * K), 6, 14, 5, 8, 0.6);
      const nD = Math.round(40 * K) + 6;
      for (let k = 0; k < nD; k++) {
        per(0.5, o);
        const sp = rr(4, 14), hy = gy + rr(2, Math.min(b.top * 0.5, 40));
        this._debris(o[0], hy, o[1], o[2] * sp + rr(-2, 2), rr(-2, 5), o[3] * sp + rr(-2, 2), rr(3, 5), rr(0.15, 0.55), 0.36, 0.34, 0.31, 0);
      }
      for (let k = 0; k < 14; k++) {
        per(0.5, o);
        const sp = rr(12, 30);
        this._spark(o[0], gy + rr(2, 10), o[1], o[2] * sp, rr(2, 10), o[3] * sp, rr(0.4, 0.9), 0.035, rr(0.9, 1.2), 2);
      }
      return;
    }
    if (ph === 2) {
      // 落地：塵浪衝出去，中間冒起一大團
      surge(Math.round(36 * K), 20, 34, 5, 8, 1);
      const nB = Math.round(10 * K);
      for (let k = 0; k < nB; k++) {
        const x = b.x0 + b.w * rr(0.15, 0.85), z = b.z0 + b.d * rr(0.15, 0.85), br = rr(0.85, 1.05);
        const i = this._smoke(x, gy + rr(3, 10), z, rr(-3, 3), rr(8, 16), rr(-3, 3), rr(6, 9), rr(8, 12) * size, rr(22, 32) * size, 0.5, 0.31 * br, 0.29 * br, 0.26 * br);
        if (i >= 0) { V.rise[i] = rr(2.5, 4); V.drag[i] = 0.8; V.sk[i] = 0.3; V.grow[i] = 0.5; V.wf[i] = 0.7; V.flags[i] |= F_TURB; V.turb[i] = 0.7; V.erode[i] = 0.5; V.fout[i] = 0.5; V.cell[i] = (Math.random() * 4) | 0; }
      }
      return;
    }
    // 倒塌中
    const roof = gy + Math.max(2, b.top * (1 - u * u));
    const perim = 2 * (b.w + b.d);
    const rate = Math.min(80, 16 + perim * 0.3) * (0.25 + 1.1 * u) * K;
    b.accD = (b.accD || 0) + rate * dt;
    const nS = Math.floor(b.accD); b.accD -= nS;
    surge(nS, 10 * (0.6 + 0.4 * u), 24 * (0.6 + 0.4 * u), 5, 9, 1);
    // 往上翻的塵團
    b.accB = (b.accB || 0) + rate * 0.3 * dt;
    while (b.accB >= 1) {
      b.accB -= 1;
      const x = b.x0 + b.w * rr(0, 1), z = b.z0 + b.d * rr(0, 1), br = rr(0.85, 1.05);
      const i = this._smoke(x, gy + rr(2, Math.max(4, (roof - gy) * 0.5)), z, rr(-3, 3), rr(6, 14), rr(-3, 3), rr(5, 8), rr(5, 8) * size, rr(18, 28) * size, 0.45, 0.33 * br, 0.31 * br, 0.28 * br);
      if (i >= 0) { V.rise[i] = rr(2, 3.5); V.drag[i] = 0.7; V.sk[i] = 0.3; V.grow[i] = 0.5; V.wf[i] = 0.7; V.flags[i] |= F_TURB; V.turb[i] = 0.7; V.erode[i] = 0.5; V.fout[i] = 0.5; V.cell[i] = (Math.random() * 4) | 0; }
    }
    // 屋頂邊緣往下灑的粉塵與碎片
    b.accF = (b.accF || 0) + 36 * K * dt;
    while (b.accF >= 1) {
      b.accF -= 1;
      per(0.3, o);
      const sp = rr(1, 6);
      this._debris(o[0], roof - rr(0, 6), o[1], o[2] * sp + rr(-1.5, 1.5), rr(-3, 2), o[3] * sp + rr(-1.5, 1.5), rr(3, 5), rr(0.2, 0.7), 0.35, 0.33, 0.3, 0);
      if (Math.random() < 0.35) {
        const br = rr(0.9, 1.05);
        const i = this._smoke(o[0] + o[2] * 1.5, roof - rr(0, 4), o[1] + o[3] * 1.5, o[2] * rr(1, 3), rr(-7, -2), o[3] * rr(1, 3), rr(4, 7), rr(2, 3), rr(9, 14) * size, 0.45, 0.4 * br, 0.37 * br, 0.33 * br);
        if (i >= 0) { V.grav[i] = 2; V.drag[i] = 1; V.rise[i] = 0.5; V.cell[i] = 6; V.erode[i] = 0.5; V.fout[i] = 0.45; }
      }
    }
  }

  skid(pos, dir, amount) {
    const am = clamp(amount === undefined ? 1 : amount, 0, 1);
    if (am < 0.01) return;
    let dx = dir.x, dz = dir.z;
    const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const V = this.V, dt = this.dtLast, gy = pos.y;
    this.skidAcc += 26 * am * this.qn * dt;
    while (this.skidAcc >= 1) {
      this.skidAcc -= 1;
      const sp = rr(4, 11) * am, side = rr(-3, 3), br = rr(0.85, 1.1);
      const i = this._smoke(pos.x - dx * 1.5 + rr(-1, 1), gy + 0.5, pos.z - dz * 1.5 + rr(-1, 1), -dx * sp - dz * side, rr(1, 3), -dz * sp + dx * side,
        rr(1.2, 2.0), rr(0.8, 1.3), rr(4, 7), 0.12 + 0.2 * am, 0.32 * br, 0.27 * br, 0.22 * br);
      if (i >= 0) { V.drag[i] = 2; V.rise[i] = 0.4; V.cell[i] = Math.random() < 0.5 ? 6 : 7; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.fout[i] = 0.3; }
    }
    this.skidSpk += 12 * am * dt;
    while (this.skidSpk >= 1) {
      this.skidSpk -= 1;
      const n = 1 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) {
        const sp = rr(8, 20), side = rr(-4, 4);
        this._spark(pos.x + rr(-1, 1), gy + 0.2, pos.z + rr(-1, 1), -dx * sp - dz * side, rr(2, 6), -dz * sp + dx * side, rr(0.3, 0.6), 0.035, 1.1, 2.2);
      }
    }
  }

  thrusterWash(pos, amount) {
    const am = clamp(amount === undefined ? 1 : amount, 0, 1);
    const gy = this.world.height(pos.x, pos.z);
    const h = pos.y - gy;
    if (h > 28 || am < 0.01) return;
    const st = am * (1 - Math.max(0, h) / 28);
    const V = this.V;
    this.washAcc += 48 * st * this.qn * this.dtLast;
    while (this.washAcc >= 1) {
      this.washAcc -= 1;
      const a = Math.random() * 6.2832, ca = Math.cos(a), sa = Math.sin(a), r0 = rr(1, 4), sp = rr(12, 22) * (0.4 + 0.6 * st), br = rr(0.85, 1.1);
      const i = this._smoke(pos.x + ca * r0, gy + 0.5, pos.z + sa * r0, ca * sp, rr(0.3, 1), sa * sp, rr(1.2, 2), rr(1.5, 2.2), rr(6, 10), 0.04 + 0.15 * st, 0.32 * br, 0.27 * br, 0.22 * br);
      if (i >= 0) { V.drag[i] = 2; V.rise[i] = 0.3; V.cell[i] = Math.random() < 0.5 ? 6 : 7; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.fin[i] = 0.08; V.fout[i] = 0.35; V.erode[i] = 0.3; }
    }
  }

  trail(pos) {
    const V = this.V;
    const i = this._smoke(pos.x + rr(-0.3, 0.3), pos.y + rr(-0.3, 0.3), pos.z + rr(-0.3, 0.3), rr(-0.5, 0.5), 1, rr(-0.5, 0.5), rr(1.8, 2.8), rr(0.8, 1.4), rr(3.5, 5.5), 0.55, 0.08, 0.075, 0.07);
    if (i >= 0) { V.rise[i] = 1.8; V.drag[i] = 1.2; V.wf[i] = 0.8; V.erode[i] = 0.6; }
  }

  saberArc(a, b, color) {
    const now = this.time;
    let best = -1, bd = 1e9;
    for (let r = 0; r < RIB; r++) {
      const R = this.rib[r];
      if (R.n === 0 || now - R.last > 0.1) continue;
      const k = (R.n - 1) * 3;
      const d = Math.hypot(R.a[k] - a.x, R.a[k + 1] - a.y, R.a[k + 2] - a.z);
      if (d < 14 && d < bd) { bd = d; best = r; }
    }
    if (best < 0) { // 找最久沒用的
      let old = 1e9;
      for (let r = 0; r < RIB; r++) if (this.rib[r].last < old) { old = this.rib[r].last; best = r; }
    }
    const R = this.rib[best];
    if (now - R.last > 0.1) R.n = 0;
    if (R.n === RSAMP) { R.t.copyWithin(0, 1); R.a.copyWithin(0, 3); R.b.copyWithin(0, 3); R.n--; }
    // 同一幀重複呼叫：覆蓋最後一筆
    if (R.n > 0 && R.t[R.n - 1] === now) R.n--;
    const k = R.n;
    R.t[k] = now;
    R.a[k * 3] = a.x; R.a[k * 3 + 1] = a.y; R.a[k * 3 + 2] = a.z;
    R.b[k * 3] = b.x; R.b[k * 3 + 1] = b.y; R.b[k * 3 + 2] = b.z;
    R.n++;
    R.last = now;
    if (color) R.col.copy(color); else R.col.setRGB(2, 6, 12);
  }

  // 光波砲：combat 每幀呼叫一次。charge＝充能 0..1；to＝光束終點（null＝還在充能）；I＝光束強度 0..1；hit＝終點打到東西
  cannon(from, dir, to, charge, I, hit) {
    const c = this.cn;
    c.fresh = true; c.x = from.x; c.y = from.y; c.z = from.z;
    c.dx = dir.x; c.dy = dir.y; c.dz = dir.z;
    c.charge = charge; c.I = I; c.on = !!to; c.hit = !!hit;
    if (to) { c.tx = to.x; c.ty = to.y; c.tz = to.z; }
  }

  // 光波砲開火的瞬間：槍口爆閃＋往前噴的光芒＋一圈往外散的震波
  cannonBurst(from, dir) {
    const x = from.x, y = from.y, z = from.z, dx = dir.x, dy = dir.y, dz = dir.z;
    this._glow(x, y, z, 3, 0.35, 0.65, 1, 6, 0.3, 1.5);
    this._glow(x, y, z, 0.9, 1, 1, 1, 20, 0.12, 1);
    for (let k = 0; k < 10; k++) {
      this._cone(dx, dy, dz, 0.5);
      const l = rr(4, 10), d = this._d;
      this._spike(x, y, z, d[0] * l, d[1] * l, d[2] * l, 0.3, 0.5, 0.8, 1, 14, 0.12);
    }
    this._perp(dx, dy, dz);
    const U = this._u, Vv = this._v, n = 12 + Math.round(10 * this.qn);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, ca = Math.cos(a) * 42, sa = Math.sin(a) * 42;
      this._mote(x + dx * 3, y + dy * 3, z + dz * 3, U[0] * ca + Vv[0] * sa + dx * 10, U[1] * ca + Vv[1] * sa + dy * 10, U[2] * ca + Vv[2] * sa + dz * 10, 0.35, 0.16, 0.4, 0.75, 1, 9);
    }
    this._flash(x + dx * 4, y + dy * 4, z + dz * 4, 0.8);
  }

  clear() {
    const V = this.V, S = this.S;
    V.alive.fill(0); this.vFreeN = VMAX; for (let i = 0; i < VMAX; i++) this.vFree[i] = VMAX - 1 - i;
    this.vCount = 0; this.vAmbN = 0;
    S.alive.fill(0); this.sFreeN = SMAX; for (let i = 0; i < SMAX; i++) this.sFree[i] = SMAX - 1 - i;
    this.sCount = 0;
    this.P.alive.fill(0); this.E.alive.fill(0); this.Q.alive.fill(0);
    for (let k = 0; k < this.mN; k++) { this.mList[k].alive = false; this.mList[k] = null; }
    this.mN = 0;
    for (const R of this.rib) { R.n = 0; R.last = -99; }
    for (const L of this.lights) { L.age = 99; L.cur = 0; L.l.intensity = 0; }
    this.cn.fresh = false;
    this.ss.act.fill(0); this.fs.act.fill(0); this.sSelN = 0; this.fSelN = 0; this.siteT = 0;
    this.vMesh.visible = this.sMesh.visible = this.rMesh.visible = this.mMesh.visible = false;
  }

  // ---------------------------------------------------------------- 每幀
  update(dt) {
    dt = clamp(dt || 0, 0, 0.1);
    this.dtLast = dt > 0 ? dt : this.dtLast;
    this.time += dt;
    this.u.uTime.value = this.time;
    const cam = this.camera;
    cam.updateMatrixWorld();
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    const e = cam.matrixWorld.elements;
    this.camFwd.set(-e[8], -e[9], -e[10]).normalize();

    if (this.amb) {
      this.siteT -= dt;
      if (this.siteT <= 0) { this.siteT = 0.5; this._selectSites(); }
      this._ambient(dt);
    }
    this.sN = 0;
    this._emitters(dt);
    this._queue(dt);
    this._missiles(dt);
    this._simVolume(dt);
    this._simStreaks(dt);
    this._projectiles(dt);
    this._cannon(dt);
    this._fireGlows();
    this._lights(dt);
    this._ribbons();
    this._writeVolume();
    this._flushStreaks();
  }

  // ---------------------------------------------------------------- 配置
  _va() {
    if (this.vFreeN === 0) return -1;
    const i = this.vFree[--this.vFreeN];
    const V = this.V;
    V.alive[i] = 1; this.vCount++;
    V.vx[i] = V.vy[i] = V.vz[i] = 0; V.age[i] = 0; V.life[i] = 1;
    V.s0[i] = 1; V.s1[i] = 2; V.sk[i] = 1; V.grow[i] = 0; V.rot[i] = Math.random() * 6.2832; V.rotV[i] = rr(-0.3, 0.3);
    V.a0[i] = 0.5; V.fin[i] = 0.06; V.fout[i] = 0.45; V.r[i] = V.g[i] = V.b[i] = 0.1; V.lit[i] = 0;
    V.temp[i] = 0; V.cool[i] = 0; V.hold[i] = 0; V.drag[i] = 1; V.dragB[i] = 0; V.rise[i] = 1; V.buoy[i] = 0; V.wf[i] = 1; V.grav[i] = 0;
    V.glow[i] = 0; V.glowK[i] = 1; V.cell[i] = (Math.random() * 4) | 0; V.asp[i] = 1; V.gy[i] = -1e5; V.erode[i] = 0.5; V.seed[i] = Math.random(); V.turb[i] = 0;
    V.flags[i] = 0;
    return i;
  }
  _vfree(i) { const V = this.V; V.alive[i] = 0; this.vFree[this.vFreeN++] = i; this.vCount--; if (V.flags[i] & F_AMB) this.vAmbN--; }

  // 一般煙團
  _smoke(x, y, z, vx, vy, vz, life, s0, s1, a0, r, g, b) {
    const i = this._va();
    if (i < 0) return -1;
    const V = this.V;
    V.x[i] = x; V.y[i] = y; V.z[i] = z; V.vx[i] = vx; V.vy[i] = vy; V.vz[i] = vz;
    V.life[i] = life; V.s0[i] = s0; V.s1[i] = s1; V.sk[i] = 1.4 / life + 0.3; V.a0[i] = a0;
    V.r[i] = r; V.g[i] = g; V.b[i] = b; V.gy[i] = this.world.height(x, z);
    return i;
  }

  // 火焰（發光為主，微量煙）
  _flame(x, y, z, vx, vy, vz, s, temp, life) {
    const i = this._va();
    if (i < 0) return -1;
    const V = this.V;
    V.x[i] = x; V.y[i] = y; V.z[i] = z; V.vx[i] = vx; V.vy[i] = vy; V.vz[i] = vz;
    V.life[i] = life; V.s0[i] = s * rr(0.7, 0.9); V.s1[i] = s * rr(1.5, 2.1); V.sk[i] = 3;
    V.temp[i] = temp * rr(0.9, 1.05); V.cool[i] = V.temp[i] * 0.55 / life;
    V.a0[i] = 0.14; V.r[i] = 0.05; V.g[i] = 0.045; V.b[i] = 0.04;
    V.drag[i] = 1.6; V.rise[i] = rr(4, 7); V.wf[i] = 0.3; V.fin[i] = 0.1; V.fout[i] = 0.4; V.erode[i] = 0.3;
    const tongue = Math.random() < 0.6;
    V.cell[i] = tongue ? 5.6 : 4.4; V.asp[i] = tongue ? rr(1.3, 1.8) : 1.1;
    if (tongue) { V.rot[i] = rr(-0.15, 0.15); V.rotV[i] = 0; } else V.rotV[i] = rr(-1, 1);
    V.flags[i] = F_FLAME;
    V.gy[i] = -1e5;
    return i;
  }

  _sa() {
    if (this.sFreeN === 0) return -1;
    const i = this.sFree[--this.sFreeN];
    const S = this.S;
    S.alive[i] = 1; this.sCount++;
    S.vx[i] = S.vy[i] = S.vz[i] = 0; S.age[i] = 0; S.life[i] = 1; S.w[i] = 0.05; S.st[i] = 0.04;
    S.temp[i] = 0; S.cool[i] = 0; S.grav[i] = 0; S.drag[i] = 0; S.r[i] = S.g[i] = S.b[i] = 1; S.a[i] = 0.15; S.fp[i] = 1;
    S.seed[i] = Math.random(); S.tacc[i] = 0; S.kind[i] = K_SPARK; S.flags[i] = 0; S.bn[i] = 0;
    return i;
  }
  _sfree(i) { this.S.alive[i] = 0; this.sFree[this.sFreeN++] = i; this.sCount--; }

  // 熾熱火花：會拉長、受重力、落地彈一次
  _spark(x, y, z, vx, vy, vz, life, w, temp, cool) {
    const i = this._sa();
    if (i < 0) return -1;
    const S = this.S;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
    S.life[i] = life; S.w[i] = w; S.st[i] = 0.045; S.temp[i] = temp; S.cool[i] = cool;
    S.grav[i] = 9.8; S.drag[i] = 0.5; S.flags[i] = S_HOT | S_BOUNCE; S.a[i] = 0.1;
    return i;
  }

  // 碎片／土塊（不透明）
  _debris(x, y, z, vx, vy, vz, life, w, r, g, b, extra) {
    const i = this._sa();
    if (i < 0) return -1;
    const S = this.S, L = this.debL;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
    S.life[i] = life; S.w[i] = w; S.st[i] = 0.012; S.grav[i] = 9.8; S.drag[i] = 0.25;
    S.kind[i] = K_DEBRIS; S.flags[i] = S_BOUNCE | (extra || 0); S.a[i] = 1;
    S.r[i] = r * L[0]; S.g[i] = g * L[1]; S.b[i] = b * L[2];
    return i;
  }

  // 固定位置的光暈（閃光、槍口焰）
  _glow(x, y, z, w, r, g, b, I, life, fp) {
    const i = this._sa();
    if (i < 0) return -1;
    const S = this.S;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.life[i] = life; S.w[i] = w; S.st[i] = 0;
    S.r[i] = r * I; S.g[i] = g * I; S.b[i] = b * I; S.fp[i] = fp; S.kind[i] = K_GLOW; S.flags[i] = S_FIXED;
    return i;
  }

  // 固定的放射狀火舌（槍口焰芒）：從 (x,y,z) 往 (dx,dy,dz) 伸出
  _spike(x, y, z, dx, dy, dz, w, r, g, b, I, life) {
    const i = this._sa();
    if (i < 0) return -1;
    const S = this.S;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = -dx; S.vy[i] = -dy; S.vz[i] = -dz; S.st[i] = 1;
    S.life[i] = life; S.w[i] = w; S.r[i] = r * I; S.g[i] = g * I; S.b[i] = b * I; S.fp[i] = 1.5; S.a[i] = 0.05;
    S.kind[i] = K_SPARK; S.flags[i] = S_FIXED;
    return i;
  }

  // 會動的彩色光點（不受重力、不發熱，越飛越暗）
  _mote(x, y, z, vx, vy, vz, life, w, r, g, b, I) {
    const i = this._sa();
    if (i < 0) return -1;
    const S = this.S;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz; S.drag[i] = 2;
    S.life[i] = life; S.w[i] = w; S.st[i] = 0.03; S.r[i] = r * I; S.g[i] = g * I; S.b[i] = b * I; S.fp[i] = 1.5; S.a[i] = 0.1;
    return i;
  }

  // 和 (dx,dy,dz) 垂直的兩個單位向量 → this._u、this._v
  _perp(dx, dy, dz) {
    const U = this._u, Vv = this._v;
    let ux, uy, uz;
    if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 0; uy = dz; uz = -dy; }
    const L = Math.hypot(ux, uy, uz) || 1; ux /= L; uy /= L; uz /= L;
    U[0] = ux; U[1] = uy; U[2] = uz;
    Vv[0] = dy * uz - dz * uy; Vv[1] = dz * ux - dx * uz; Vv[2] = dx * uy - dy * ux;
  }

  // 隨機錐形方向 → this._d
  _cone(nx, ny, nz, spread) {
    let x, y, z, l2;
    do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l2 = x * x + y * y + z * z; } while (l2 > 1 || l2 < 1e-4);
    const k = spread / Math.sqrt(l2);
    x = nx + x * k; y = ny + y * k; z = nz + z * k;
    const L = Math.hypot(x, y, z) || 1;
    this._d[0] = x / L; this._d[1] = y / L; this._d[2] = z / L;
  }

  _pa(from, to, kind, speed, blen) {
    const P = this.P;
    let j = -1;
    for (let k = 0; k < PMAX; k++) if (!P.alive[k]) { j = k; break; }
    if (j < 0) return -1;
    let dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const L = Math.hypot(dx, dy, dz);
    if (L < 0.01) return -1;
    dx /= L; dy /= L; dz /= L;
    P.alive[j] = 1; P.kind[j] = kind;
    P.fx[j] = from.x; P.fy[j] = from.y; P.fz[j] = from.z; P.dx[j] = dx; P.dy[j] = dy; P.dz[j] = dz;
    P.len[j] = L; P.trav[j] = 0; P.speed[j] = speed; P.blen[j] = Math.min(blen, L); P.age[j] = 0;
    return j;
  }

  _ea(type, x, y, z, dur, sc) {
    const E = this.E;
    for (let j = 0; j < EMAX; j++) if (!E.alive[j]) {
      E.alive[j] = 1; E.type[j] = type; E.x[j] = x; E.y[j] = y; E.z[j] = z; E.t[j] = 0; E.dur[j] = dur; E.sc[j] = sc;
      E.accS[j] = E.accF[j] = E.accE[j] = 0;
      return j;
    }
    return -1;
  }

  _flash(x, y, z, s) {
    let best = this.lights[0];
    for (const L of this.lights) if (L.cur < best.cur) best = L;
    const peak = 1500 * Math.pow(s, 2.3);
    if (best.cur > peak * 0.8 && best.age < 0.3) return;
    best.age = 0; best.peak = peak; best.dur = 0.25 + 0.35 * s;
    best.l.position.set(x, y, z);
    best.l.distance = 40 + 55 * s;
  }

  _beamFlare(x, y, z, dx, dy, dz, en) {
    const cr = en ? 1 : 1, cg = en ? 0.32 : 0.2, cb = en ? 0.07 : 0.62;
    this._glow(x, y, z, 2.2, cr, cg, cb, 9, 0.09, 1.5);
    this._glow(x, y, z, 0.7, 1, en ? 0.85 : 0.82, en ? 0.6 : 0.95, 20, 0.06, 1);
    for (let k = 0; k < 4; k++) {
      this._cone(dx, dy, dz, 0.45);
      const l = rr(2, 4.5), d = this._d;
      this._spike(x, y, z, d[0] * l, d[1] * l, d[2] * l, 0.22, cr, cg, cb, 10, 0.05);
    }
  }

  // ---------------------------------------------------------------- 爆炸
  _explode(x, y, z, s, secondary) {
    const qn = this.qn, V = this.V, S = this.S, d = this._d;
    const D = 8 * Math.pow(s, 1.37), R = D * 0.5;
    const gy = this.world.height(x, z);
    const hA = y - gy;
    const nearG = hA < D * 0.9;
    // 閃光
    this._glow(x, y, z, R * 0.8, 1, 0.84, 0.6, secondary ? 6 : 8, 0.1, 2);
    this._glow(x, y + R * 0.3, z, D * 1.5, 1, 0.52, 0.22, secondary ? 0.4 : 0.7, 0.3, 1.5);
    this._flash(x, y + R * 0.7 + 2, z, secondary ? s * 0.8 : s);
    // 火球：一開始白熱、急速膨脹，冷卻後變成翻滾上升的黑煙
    const nF = Math.round((10 + 12 * s) * (0.55 + 0.45 * qn));
    for (let k = 0; k < nF; k++) {
      this._cone(0, 0, 0, 1);
      let dx = d[0], dy = d[1], dz = d[2];
      if (nearG) { dy = Math.abs(dy) * 0.85 + 0.12; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l; }
      const off = R * 0.3 * Math.pow(Math.random(), 0.7);
      const i = this._va();
      if (i < 0) break;
      const sp = R * rr(4, 8);
      V.x[i] = x + dx * off; V.y[i] = Math.max(y + dy * off, gy + R * 0.25); V.z[i] = z + dz * off;
      V.vx[i] = dx * sp; V.vy[i] = dy * sp; V.vz[i] = dz * sp;
      V.life[i] = (2.5 + 3.5 * s) * rr(0.8, 1.25);
      V.s0[i] = R * rr(0.3, 0.45); V.s1[i] = R * rr(0.75, 1.1); V.sk[i] = rr(5, 8); V.grow[i] = R * rr(0.05, 0.1);
      const inner = 1 - off / (R * 0.3);
      V.temp[i] = rr(0.85, 1.0) + 0.1 * inner; V.hold[i] = rr(0.03, 0.1) * Math.sqrt(s);
      V.cool[i] = rr(1.4, 2.0) / (0.3 + 0.3 * s) * (1.2 - 0.4 * inner);
      V.drag[i] = rr(0.5, 0.9); V.dragB[i] = 9; V.rise[i] = rr(1, 2.5) + 0.8 * s; V.buoy[i] = 1.5 * s; V.wf[i] = 0.6;
      V.a0[i] = rr(0.8, 0.95); V.fin[i] = 0; V.fout[i] = 0.5; V.erode[i] = 0.7;
      const c = rr(0.03, 0.05);
      V.r[i] = c * 1.1; V.g[i] = c; V.b[i] = c * 0.9; V.lit[i] = 1.5;
      V.glow[i] = 2; V.glowK[i] = 2 / Math.sqrt(s);
      V.cell[i] = Math.random() < 0.6 ? 4.3 : (Math.random() * 4) | 0;
      V.rotV[i] = (dx > 0 ? 1 : -1) * rr(0.15, 0.5);
      V.turb[i] = 1;
      V.flags[i] = F_FIREBALL | F_TURB | (nearG ? F_GROUND : 0);
      V.gy[i] = gy;
    }
    // 地面衝擊波塵環
    if (nearG && s >= 0.8) {
      const nR = Math.round((12 + 14 * s) * (0.5 + 0.5 * qn));
      const sp = 16 + 16 * s;
      for (let k = 0; k < nR; k++) {
        const a = (k / nR) * 6.2832 + rr(-0.12, 0.12), ca = Math.cos(a), sa = Math.sin(a);
        const br = rr(0.85, 1.1);
        const i = this._smoke(x + ca * R * 0.4, gy + 0.5, z + sa * R * 0.4, ca * sp * rr(0.7, 1.1), rr(0.5, 2), sa * sp * rr(0.7, 1.1),
          rr(2.5, 4) * (0.7 + 0.3 * s), 1.5 * s + 1, (5 + 4 * s) * rr(0.8, 1.2), Math.min(0.38, 0.22 + 0.06 * s), 0.3 * br, 0.25 * br, 0.2 * br);
        if (i >= 0) { V.drag[i] = 1.8; V.rise[i] = 0.4; V.wf[i] = 0.4; V.sk[i] = 1.2; V.grow[i] = 0.4 * s; V.cell[i] = 6; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.fout[i] = 0.35; V.fin[i] = 0.03; }
      }
      // 噴起的土
      const nD = Math.round(5 * s * (0.5 + 0.5 * qn));
      for (let k = 0; k < nD; k++) {
        this._cone(0, 1, 0, 0.6);
        const sp2 = rr(10, 22) * Math.sqrt(s), br = rr(0.8, 1.1);
        const i = this._smoke(x, gy + 1, z, d[0] * sp2, d[1] * sp2, d[2] * sp2, rr(2, 3.5), R * 0.25, R * rr(0.6, 0.9), 0.7, 0.18 * br, 0.14 * br, 0.1 * br);
        if (i >= 0) { V.grav[i] = 7; V.drag[i] = 0.9; V.rise[i] = 0; V.cell[i] = 7; V.gy[i] = gy; V.flags[i] |= F_GROUND; V.erode[i] = 0.6; }
      }
    }
    // 火花與餘燼
    const nS = Math.round((25 + 60 * s) * qn) + 10;
    for (let k = 0; k < nS; k++) {
      this._cone(0, nearG ? 0.6 : 0, 0, 1);
      const sp = rr(14, 55) * Math.pow(s, 0.4);
      this._spark(x + d[0] * R * 0.2, y + d[1] * R * 0.2, z + d[2] * R * 0.2, d[0] * sp, d[1] * sp, d[2] * sp, rr(0.8, 2.2), rr(0.04, 0.09) * Math.pow(s, 0.3), rr(0.95, 1.35), rr(0.6, 1.3));
    }
    const nE = Math.round(10 * s * qn);
    for (let k = 0; k < nE; k++) {
      this._cone(0, 0.8, 0, 1);
      const sp = rr(4, 14) * Math.sqrt(s);
      const i = this._spark(x, y + R * 0.3, z, d[0] * sp, d[1] * sp, d[2] * sp, rr(2.5, 5), 0.08, rr(0.8, 1.0), 0.2);
      if (i >= 0) { S.flags[i] = S_HOT | S_EMBER | S_FLICK; S.grav[i] = -0.6; S.drag[i] = 0.9; S.st[i] = 0.08; }
    }
    // 碎片（部分燃燒，拖著煙）
    const nD = secondary ? 0 : (s >= 1.5 ? Math.round((3 + 2.5 * s) * (0.5 + 0.5 * qn)) : 2);
    for (let k = 0; k < nD; k++) {
      const a = Math.random() * 6.2832, el = rr(0.35, 1.25);
      const sp = rr(16, 34) * Math.pow(s, 0.35);
      const vx = Math.cos(a) * Math.cos(el) * sp, vy = Math.sin(el) * sp, vz = Math.sin(a) * Math.cos(el) * sp;
      let i;
      if (Math.random() < 0.65) {
        i = this._spark(x, y + R * 0.2, z, vx, vy, vz, rr(3, 5.5), rr(0.18, 0.35), 1.15, 0.16);
        if (i >= 0) { S.flags[i] = S_HOT | S_BOUNCE | S_TRAIL | S_FIRETRAIL; S.st[i] = 0.02; S.drag[i] = 0.08; }
      } else {
        i = this._debris(x, y + R * 0.2, z, vx, vy, vz, rr(3, 5.5), rr(0.3, 0.6), 0.1, 0.09, 0.085, S_TRAIL);
        if (i >= 0) S.drag[i] = 0.08;
      }
    }
    // 之後持續冒出的濃煙
    if (!secondary && s >= 1.5) this._ea(1, x, Math.max(y, gy + R * 0.5), z, 3 + 3 * s, R);
    // 二次爆炸
    if (!secondary && s >= 2) {
      const nQ = s >= 3 ? 5 : 2;
      const Q = this.Q;
      for (let k = 0; k < nQ; k++) for (let j = 0; j < QMAX; j++) if (!Q.alive[j]) {
        this._cone(0, 0.5, 0, 1);
        Q.alive[j] = 1; Q.t[j] = rr(0.15, 1.5);
        Q.x[j] = x + d[0] * R * 0.7; Q.y[j] = Math.max(gy + 2, y + d[1] * R * 0.6); Q.z[j] = z + d[2] * R * 0.7;
        Q.s[j] = s * rr(0.28, 0.4);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- 城市環境
  _selectSites() {
    const w = this.world, cx = this.camPos.x, cz = this.camPos.z;
    const capS = [5, 8, 12][this.q], capF = [5, 8, 12][this.q];
    const pick = (sites, act, R, cap, out) => {
      let n = 0;
      const kI = this.kIdx, kD = this.kD;
      for (let i = 0; i < sites.length; i++) {
        const p = sites[i];
        const dx = p.x - cx, dz = p.z - cz;
        let d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        if (act[i]) d2 *= 0.7; // 滯後，避免在邊界來回切換
        if (n < cap) { kI[n] = i; kD[n] = d2; n++; }
        else if (d2 < kD[n - 1]) { kI[n - 1] = i; kD[n - 1] = d2; }
        else continue;
        for (let m = n - 1; m > 0 && kD[m] < kD[m - 1]; m--) {
          const t = kD[m]; kD[m] = kD[m - 1]; kD[m - 1] = t;
          const u = kI[m]; kI[m] = kI[m - 1]; kI[m - 1] = u;
        }
      }
      for (let k = 0; k < n; k++) out[k] = kI[k];
      return n;
    };
    const SS = w.smokeSites || [], FS = w.fireSites || [];
    const ns = pick(SS, this.ss.act, 1000, capS, this.sSel);
    // 新進入範圍的煙柱：直接預先長好
    const act = this.ss.act;
    for (let i = 0; i < SS.length; i++) if (act[i] === 1) act[i] = 2; // 2＝上一輪有
    for (let k = 0; k < ns; k++) {
      const i = this.sSel[k];
      const p = SS[i];
      this.ss.far[i] = Math.hypot(p.x - cx, p.z - cz) > 480 ? 1 : 0;
      if (act[i] !== 2) this._prewarm(i);
      act[i] = 1;
    }
    for (let i = 0; i < SS.length; i++) if (act[i] === 2) act[i] = 0;
    this.sSelN = ns;
    const nf = pick(FS, this.fs.act, 620, capF, this.fSel);
    this.fs.act.fill(0);
    for (let k = 0; k < nf; k++) this.fs.act[this.fSel[k]] = 1;
    this.fSelN = nf;
  }

  _colRate(i) { return (this.ss.far[i] ? 1.5 : 2.4) * this.ss.rate[i] * (0.55 + 0.45 * this.qn); }

  _prewarm(i) {
    const rate = this._colRate(i);
    const n = Math.floor(rate * 28);
    for (let k = 0; k < n; k++) this._colPuff(i, (k + Math.random()) / rate);
  }

  // 城市煙柱的一團（age＞0 時直接用解析解算到那個時間點）
  _colPuff(site, age) {
    if (this.vCount > VMAX * 0.6) return;
    const i = this._va();
    if (i < 0) return;
    const V = this.V, p = this.world.smokeSites[site], ss = this.ss;
    const far = ss.far[site];
    const sc = ss.scl[site] * (far ? 1.35 : 1);
    const life = rr(24, 32);
    if (age >= life * 0.98) { this._vfree(i); return; }
    const x0 = p.x + rr(-3, 3) * sc, y0 = p.y + rr(-1, 2), z0 = p.z + rr(-3, 3) * sc;
    const v0x = rr(-0.8, 0.8), v0y = rr(6, 9), v0z = rr(-0.8, 0.8);
    const k = 0.2, tx = this.wind.x, ty = ss.rise[site] * rr(0.85, 1.1), tz = this.wind.z;
    const ek = Math.exp(-k * age), e = (1 - ek) / k;
    V.x[i] = x0 + tx * age + (v0x - tx) * e; V.y[i] = y0 + ty * age + (v0y - ty) * e; V.z[i] = z0 + tz * age + (v0z - tz) * e;
    V.vx[i] = tx + (v0x - tx) * ek; V.vy[i] = ty + (v0y - ty) * ek; V.vz[i] = tz + (v0z - tz) * ek;
    V.age[i] = age; V.life[i] = life; V.drag[i] = k; V.rise[i] = ty; V.wf[i] = 1;
    V.s0[i] = rr(5, 7.5) * sc; V.s1[i] = rr(36, 52) * sc; V.sk[i] = 0.085; V.grow[i] = 0.5 * sc;
    V.a0[i] = 0.82; V.fin[i] = 0.05; V.fout[i] = 0.5; V.erode[i] = 0.55;
    const c = rr(0.07, 0.1);
    V.r[i] = c * 1.1; V.g[i] = c; V.b[i] = c * 0.88; V.lit[i] = 0.9;
    V.glow[i] = ss.fire[site] ? rr(1.4, 2.4) * Math.exp(-0.9 * age) : 0; V.glowK[i] = 0.9;
    V.rot[i] += V.rotV[i] * age; V.rotV[i] = rr(-0.1, 0.1);
    V.turb[i] = 0.5;
    V.flags[i] = F_AMB | F_TURB;
    V.gy[i] = -1e5;
    this.vAmbN++;
  }

  _ambient(dt) {
    const w = this.world, ss = this.ss, fs = this.fs;
    for (let k = 0; k < this.sSelN; k++) {
      const i = this.sSel[k];
      ss.acc[i] += this._colRate(i) * dt;
      while (ss.acc[i] >= 1) { ss.acc[i] -= 1; this._colPuff(i, 0); }
    }
    const qn = this.qn;
    for (let k = 0; k < this.fSelN; k++) {
      const i = this.fSel[k], p = w.fireSites[i];
      const dist = Math.hypot(p.x - this.camPos.x, p.z - this.camPos.z);
      const far = dist > 300;
      fs.accF[i] += (far ? 4 : 9) * qn * dt;
      while (fs.accF[i] >= 1) {
        fs.accF[i] -= 1;
        if (this.vCount > VMAX * 0.7) break;
        const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * 3.5;
        const idx = this._flame(p.x + Math.cos(a) * r, p.y + rr(-0.5, 0.8), p.z + Math.sin(a) * r, rr(-0.5, 0.5), rr(1.5, 3), rr(-0.5, 0.5), (far ? 3.2 : 2.2) * rr(0.8, 1.2), rr(0.7, 0.9), rr(0.55, 1.0));
        if (idx >= 0) { this.V.flags[idx] |= F_AMB; this.vAmbN++; }
      }
      if (!far) {
        fs.accE[i] += 3 * qn * dt;
        while (fs.accE[i] >= 1) {
          fs.accE[i] -= 1;
          const j = this._spark(p.x + rr(-3, 3), p.y + rr(1, 4), p.z + rr(-3, 3), rr(-1, 1), rr(3, 7), rr(-1, 1), rr(2, 4.5), rr(0.04, 0.07), rr(0.75, 0.95), 0.15);
          if (j >= 0) { const S = this.S; S.flags[j] = S_HOT | S_EMBER | S_FLICK; S.grav[j] = -0.4; S.drag[j] = 0.8; S.st[j] = 0.1; }
        }
      }
    }
  }

  _fireGlows() {
    if (this.amb) {
      const w = this.world, t = this.time;
      for (let k = 0; k < this.fSelN; k++) {
        const i = this.fSel[k], p = w.fireSites[i], ph = this.fs.ph[i];
        const fl = 0.75 + 0.15 * Math.sin(t * 11 + ph) + 0.1 * Math.sin(t * 23.7 + ph * 3);
        this._imm(p.x, p.y + 2.5, p.z, p.x, p.y + 2.5, p.z, 9, K_GLOW, 1 * 0.5 * fl, 0.4 * 0.5 * fl, 0.12 * 0.5 * fl, 0);
      }
    }
    const E = this.E;
    for (let j = 0; j < EMAX; j++) if (E.alive[j] && E.type[j] === 0) {
      const fade = 1 - sstep(0.8, 1, E.t[j] / E.dur[j]), t = this.time;
      const fl = (0.75 + 0.15 * Math.sin(t * 12 + j) + 0.1 * Math.sin(t * 25 + j * 3)) * fade;
      this._imm(E.x[j], E.y[j] + 3, E.z[j], E.x[j], E.y[j] + 3, E.z[j], 11, K_GLOW, 0.7 * fl, 0.28 * fl, 0.08 * fl, 0);
    }
  }

  // ---------------------------------------------------------------- 發射源、延遲事件
  _emitters(dt) {
    const E = this.E, V = this.V, qn = this.qn;
    for (let j = 0; j < EMAX; j++) {
      if (!E.alive[j]) continue;
      E.t[j] += dt;
      const t = E.t[j], dur = E.dur[j];
      if (t >= dur) { E.alive[j] = 0; continue; }
      const x = E.x[j], y = E.y[j], z = E.z[j];
      if (E.type[j] === 0) {
        // 燃燒殘骸：火＋濃煙柱
        const fade = 1 - sstep(0.75, 1, t / dur);
        E.accS[j] += 3.2 * (0.55 + 0.45 * qn) * fade * dt;
        while (E.accS[j] >= 1) {
          E.accS[j] -= 1;
          const i = this._smoke(x + rr(-2, 2), y + rr(1, 3), z + rr(-2, 2), rr(-0.6, 0.6), rr(6, 9), rr(-0.6, 0.6), rr(14, 20), rr(3, 5), rr(28, 42), 0.85, 0.06, 0.055, 0.05);
          if (i >= 0) { V.drag[i] = 0.25; V.rise[i] = rr(5, 7); V.sk[i] = 0.12; V.grow[i] = 0.4; V.glow[i] = rr(1.8, 2.6); V.glowK[i] = 0.9; V.lit[i] = 1.2; V.erode[i] = 0.55; V.fout[i] = 0.5; V.flags[i] |= F_TURB; V.turb[i] = 0.5; }
        }
        E.accF[j] += 10 * qn * fade * dt;
        while (E.accF[j] >= 1) {
          E.accF[j] -= 1;
          const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * 2.8;
          this._flame(x + Math.cos(a) * r, y + rr(-0.3, 1), z + Math.sin(a) * r, rr(-0.5, 0.5), rr(1.5, 3), rr(-0.5, 0.5), rr(1.8, 2.8), rr(0.7, 0.9), rr(0.5, 0.95));
        }
        E.accE[j] += 3 * qn * fade * dt;
        while (E.accE[j] >= 1) {
          E.accE[j] -= 1;
          const i = this._spark(x + rr(-2, 2), y + rr(1, 3), z + rr(-2, 2), rr(-1, 1), rr(3, 7), rr(-1, 1), rr(2, 4), rr(0.04, 0.07), rr(0.75, 0.95), 0.15);
          if (i >= 0) { const S = this.S; S.flags[i] = S_HOT | S_EMBER | S_FLICK; S.grav[i] = -0.4; S.drag[i] = 0.8; S.st[i] = 0.1; }
        }
      } else {
        // 爆炸後：從火球位置持續冒出上升的黑煙，越來越少
        const R = E.sc[j], k01 = t / dur;
        E.accS[j] += 7 * (0.55 + 0.45 * qn) * (1 - k01) * dt;
        while (E.accS[j] >= 1) {
          E.accS[j] -= 1;
          const i = this._smoke(x + rr(-0.4, 0.4) * R, y + rr(0, 0.5) * R, z + rr(-0.4, 0.4) * R, rr(-2, 2), rr(5, 9), rr(-2, 2), rr(14, 22), R * rr(0.4, 0.6), R * rr(1.8, 2.6), 0.85, 0.04, 0.036, 0.032);
          if (i >= 0) { V.drag[i] = 0.3; V.rise[i] = rr(3, 5); V.sk[i] = 0.18; V.grow[i] = R * 0.04; V.glow[i] = 2.5 * (1 - k01); V.glowK[i] = 0.8; V.lit[i] = 1.5; V.cell[i] = Math.random() < 0.5 ? 4 : (Math.random() * 4) | 0; V.erode[i] = 0.6; V.flags[i] |= F_TURB; V.turb[i] = 0.8; V.fout[i] = 0.5; }
        }
        E.accF[j] += 6 * qn * (1 - k01) * dt;
        while (E.accF[j] >= 1) {
          E.accF[j] -= 1;
          const a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * R * 0.5;
          const gy = this.world.height(x + Math.cos(a) * r, z + Math.sin(a) * r);
          this._flame(x + Math.cos(a) * r, gy + rr(0, 1), z + Math.sin(a) * r, 0, rr(1.5, 3), 0, rr(1.5, 2.8) * Math.sqrt(R / 8), rr(0.65, 0.85), rr(0.5, 0.9));
        }
      }
    }
  }

  _queue(dt) {
    const Q = this.Q;
    for (let j = 0; j < QMAX; j++) {
      if (!Q.alive[j]) continue;
      Q.t[j] -= dt;
      if (Q.t[j] <= 0) { Q.alive[j] = 0; this._explode(Q.x[j], Q.y[j], Q.z[j], Q.s[j], true); }
    }
  }

  // ---------------------------------------------------------------- 飛彈
  _missiles(dt) {
    const m = this.mMesh, V = this.V;
    let n = 0;
    for (let k = 0; k < this.mN; k++) {
      const h = this.mList[k];
      if (!h.alive) { this.mList[k] = this.mList[this.mN - 1]; this.mList[this.mN - 1] = null; this.mN--; k--; continue; }
      const p = h.pos;
      let dx = h.dir.x, dy = h.dir.y, dz = h.dir.z;
      const L = Math.hypot(dx, dy, dz);
      if (L < 1e-6) { dx = 0; dy = 0; dz = 1; } else { dx /= L; dy /= L; dz /= L; }
      h._age += dt;
      if (!h._init || h._last.distanceToSquared(p) > 3600) { h._last.copy(p); h._init = true; }
      // 彈體
      this._v0.set(dx, dy, dz);
      this._q.setFromUnitVectors(this._zAxis, this._v0);
      this._m4.compose(p, this._q, this._one);
      m.setMatrixAt(n++, this._m4);
      // 尾焰
      const tx = p.x - dx * 1.2, ty = p.y - dy * 1.2, tz = p.z - dz * 1.2;
      const fl = 0.8 + 0.2 * Math.sin(this.time * 60 + h._ph) * Math.sin(this.time * 37 + h._ph * 2);
      const eg = h._en ? 0.5 : 0.72, eb = h._en ? 0.2 : 0.42;
      this._imm(tx, ty, tz, tx, ty, tz, 1.4, K_GLOW, 14 * fl, 14 * eg * fl, 14 * eb * fl, 0);
      this._imm(tx, ty, tz, tx, ty, tz, 4.5, K_GLOW, 1.4 * fl, 1.4 * eg * 0.8, 1.4 * eb * 0.6, 0);
      const fL = rr(2.5, 3.8);
      this._imm(tx, ty, tz, tx - dx * fL, ty - dy * fL, tz - dz * fL, 0.42, K_SPARK, 10 * fl, 10 * eg * 0.8 * fl, 10 * eb * 0.6 * fl, 0.05);
      // 煙跡：每隔一段距離放一團（遠處、粒子多時放寬間距）
      const cd = Math.hypot(p.x - this.camPos.x, p.y - this.camPos.y, p.z - this.camPos.z);
      let spacing = 1.1 * Math.max(1, cd / 150) / (0.5 + 0.5 * this.qn);
      if (this.vCount > VMAX * 0.6) spacing *= 2;
      if (this.vCount > VMAX * 0.85) spacing *= 3;
      let lx = h._last.x, ly = h._last.y, lz = h._last.z;
      let sx = p.x - lx, sy = p.y - ly, sz = p.z - lz;
      let seg = Math.hypot(sx, sy, sz);
      if (seg >= spacing) {
        sx /= seg; sy /= seg; sz /= seg;
        let guard = 0;
        while (seg >= spacing && guard++ < 40) {
          lx += sx * spacing; ly += sy * spacing; lz += sz * spacing; seg -= spacing;
          const br = rr(0.9, 1.05);
          const i = this._smoke(lx, ly, lz, -dx * rr(2, 5) + rr(-1, 1), -dy * rr(2, 5) + rr(-0.6, 1), -dz * rr(2, 5) + rr(-1, 1), rr(2.2, 3.2), 1.0, rr(3.5, 5) * Math.max(1, spacing / 1.6), 0.4, 0.6 * br, 0.6 * br, 0.58 * br);
          if (i >= 0) { V.drag[i] = 1.2; V.rise[i] = 0.6; V.wf[i] = 0.6; V.sk[i] = 1.3; V.grow[i] = 0.3; V.glow[i] = 2.5; V.glowK[i] = 8; V.erode[i] = 0.4; V.fin[i] = 0.02; V.fout[i] = 0.45; V.cell[i] = Math.random() < 0.3 ? 7 : (Math.random() * 4) | 0; }
        }
        h._last.set(lx, ly, lz);
      }
    }
    m.count = n;
    m.visible = n > 0;
    if (n > 0) m.instanceMatrix.needsUpdate = true;
  }

  // ---------------------------------------------------------------- 模擬
  _simVolume(dt) {
    const V = this.V, wx = this.wind.x, wz = this.wind.z, t = this.time;
    const W = this.world;
    for (let i = 0; i < VMAX; i++) {
      if (!V.alive[i]) continue;
      const age = (V.age[i] += dt);
      const life = V.life[i];
      if (age >= life) { this._vfree(i); continue; }
      const fl = V.flags[i];
      // 速度：往目標速度（風＋上升）收斂；爆炸初速另有一段快速衰減的阻力
      let dk = V.drag[i];
      if (V.dragB[i] > 0) dk += V.dragB[i] * Math.exp(-age * 3);
      const k = 1 - Math.exp(-dk * dt);
      const T = V.temp[i];
      const ty = V.rise[i] + V.buoy[i] * (T > 1 ? 1 : T);
      let vx = V.vx[i], vy = V.vy[i], vz = V.vz[i];
      vx += (wx * V.wf[i] - vx) * k; vy += (ty - vy) * k - V.grav[i] * dt; vz += (wz * V.wf[i] - vz) * k;
      if (fl & F_TURB) {
        const tb = V.turb[i] * dt, sd = V.seed[i] * 40;
        vx += Math.sin(t * 0.7 + sd + V.y[i] * 0.05) * tb;
        vz += Math.cos(t * 0.6 + sd * 1.3 + V.y[i] * 0.045) * tb;
      }
      V.vx[i] = vx; V.vy[i] = vy; V.vz[i] = vz;
      V.x[i] += vx * dt; V.y[i] += vy * dt; V.z[i] += vz * dt;
      const size = V.s0[i] + (V.s1[i] - V.s0[i]) * (1 - Math.exp(-age * V.sk[i])) + V.grow[i] * age;
      if (fl & F_GROUND) {
        const my = V.gy[i] + size * 0.22;
        if (V.y[i] < my) { V.y[i] = my; if (V.vy[i] < 0) V.vy[i] = 0; }
      } else if (V.grav[i] > 0) {
        const g = W.height(V.x[i], V.z[i]);
        if (V.y[i] < g + size * 0.2) { V.y[i] = g + size * 0.2; V.vy[i] = 0; V.vx[i] *= 0.9; V.vz[i] *= 0.9; }
      }
      V.rot[i] += V.rotV[i] * dt;
      // 溫度
      if (age > V.hold[i]) V.temp[i] = Math.max(0, T - V.cool[i] * dt);
      V.glow[i] *= Math.exp(-V.glowK[i] * dt);
      const lt = age / life;
      const env = sstep(0, V.fin[i] + 1e-4, lt) * (1 - sstep(V.fout[i], 1, lt));
      let a = V.a0[i] * env;
      let to = V.temp[i];
      if (fl & F_FIREBALL) { const c = to > 1 ? 1 : to; a *= 0.8 + 0.2 * (1 - c); }
      if (fl & F_FLAME) to *= env;
      V.sz[i] = size; V.ao[i] = a; V.to[i] = to; V.lf[i] = lt;
      V.eo[i] = V.erode[i] * sstep(0.25, 1, lt);
    }
  }

  _simStreaks(dt) {
    const S = this.S, W = this.world, V = this.V;
    for (let i = 0; i < SMAX; i++) {
      if (!S.alive[i]) continue;
      const age = (S.age[i] += dt);
      if (age >= S.life[i]) { this._sfree(i); continue; }
      const fl = S.flags[i];
      if (!(fl & (S_FIXED | S_REST))) {
        const dr = Math.exp(-S.drag[i] * dt);
        S.vx[i] *= dr; S.vy[i] *= dr; S.vz[i] *= dr;
        S.vy[i] -= S.grav[i] * dt;
        if (fl & S_EMBER) {
          const sd = S.seed[i] * 30;
          S.vx[i] += Math.sin(age * 2.3 + sd) * 5 * dt;
          S.vz[i] += Math.cos(age * 1.9 + sd * 1.7) * 5 * dt;
        }
        S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt; S.z[i] += S.vz[i] * dt;
        if (S.grav[i] > 0) {
          const g = W.height(S.x[i], S.z[i]);
          if (S.y[i] < g) {
            const big = S.kind[i] === K_DEBRIS || (fl & S_TRAIL);
            // 火花只彈一次；大塊碎片一直彈到速度夠小才停住
            if ((fl & S_BOUNCE) && (S.bn[i] === 0 || big) && S.vy[i] < -2.5) {
              S.y[i] = g + 0.02; S.vy[i] = -S.vy[i] * rr(0.25, 0.42); S.vx[i] *= 0.55; S.vz[i] *= 0.55; S.bn[i]++;
            } else if (big) {
              S.flags[i] |= S_REST; S.y[i] = g + S.w[i] * 0.5; S.vx[i] = S.vy[i] = S.vz[i] = 0;
            } else { this._sfree(i); continue; }
          }
        }
      }
      if (fl & S_HOT) S.temp[i] = Math.max(0, S.temp[i] - S.cool[i] * dt);
      // 碎片拖煙
      if ((fl & S_TRAIL) && !(S.flags[i] & S_REST)) {
        S.tacc[i] += dt;
        const cd = Math.hypot(S.x[i] - this.camPos.x, S.z[i] - this.camPos.z);
        const iv = 0.03 * Math.max(1, cd / 150) / (0.5 + 0.5 * this.qn);
        while (S.tacc[i] >= iv) {
          S.tacc[i] -= iv;
          if (this.vCount > VMAX * 0.9) break;
          if ((fl & S_FIRETRAIL) && age < 0.7) {
            const j = this._flame(S.x[i], S.y[i], S.z[i], S.vx[i] * 0.1, S.vy[i] * 0.1, S.vz[i] * 0.1, rr(0.6, 1.0), 1.0 - age * 0.5, rr(0.25, 0.45));
            if (j >= 0) { V.cell[j] = 4.5; V.asp[j] = 1; V.a0[j] = 0.3; }
          } else {
            const hot = fl & S_FIRETRAIL ? 1 : 0;
            const j = this._smoke(S.x[i], S.y[i], S.z[i], S.vx[i] * 0.08 + rr(-0.3, 0.3), S.vy[i] * 0.08 + 0.5, S.vz[i] * 0.08 + rr(-0.3, 0.3), rr(1.8, 2.8), rr(1.6, 2.2), rr(4.5, 6.5), 0.4, 0.04, 0.036, 0.032);
            if (j >= 0) { V.rise[j] = 1.2; V.drag[j] = 1.2; V.glow[j] = hot * 2; V.glowK[j] = 4; V.erode[j] = 0.6; V.fin[j] = 0.03; V.sk[j] = 1.2; }
          }
        }
      }
    }
  }

  _projectiles(dt) {
    const P = this.P;
    for (let j = 0; j < PMAX; j++) {
      if (!P.alive[j]) continue;
      P.age[j] += dt;
      P.trav[j] += P.speed[j] * dt;
      const len = P.len[j], trav = P.trav[j], bl = P.blen[j], kind = P.kind[j];
      const fx = P.fx[j], fy = P.fy[j], fz = P.fz[j], dx = P.dx[j], dy = P.dy[j], dz = P.dz[j];
      const flight = len / P.speed[j];
      const boltOn = trav - bl < len;
      if (!boltOn && (kind === 2 || P.age[j] > flight + 0.32)) { P.alive[j] = 0; continue; }
      const hd = Math.min(trav, len), td = Math.max(0, Math.min(trav - bl, len));
      const hx = fx + dx * hd, hy = fy + dy * hd, hz = fz + dz * hd;
      const tx = fx + dx * td, ty = fy + dy * td, tz = fz + dz * td;
      if (kind === 4) { // 戰車砲彈曳光（較粗、較亮、較慢）
        if (!boltOn) { P.alive[j] = 0; continue; }
        this._imm(hx, hy, hz, tx, ty, tz, 0.34, K_SPARK, 16, 8, 2.4, 0.25);
        this._imm(hx, hy, hz, hx, hy, hz, 1.9, K_GLOW, 3, 1.5, 0.45, 0);
        continue;
      }
      if (kind === 2) {
        this._imm(hx, hy, hz, tx, ty, tz, 0.16, K_SPARK, 12, 7, 2.2, 0.25);
        this._imm(hx, hy, hz, hx, hy, hz, 0.7, K_GLOW, 2, 1.1, 0.35, 0);
        continue;
      }
      const en = kind === 1;
      const gr = 1, gg = en ? 0.3 : 0.16, gb = en ? 0.06 : 0.58;
      if (boltOn) {
        this._imm(hx, hy, hz, tx, ty, tz, 1.1, K_BEAM, gr * 9, gg * 9, gb * 9, 0);
        this._imm(hx, hy, hz, tx, ty, tz, 0.26, K_BEAM, 30, en ? 24 : 22, en ? 16 : 27, 0);
        this._imm(hx, hy, hz, hx, hy, hz, 3.2, K_GLOW, gr * 3.5, gg * 3.5, gb * 3.5, 0);
      }
      // 殘留的電離軌跡
      const f = 1 - sstep(0, flight + 0.3, P.age[j]);
      if (f > 0.01 && td > 0.5) {
        const I = 2.6 * f * f;
        this._imm(tx, ty, tz, fx, fy, fz, 0.12, K_BEAM, gr * I, gg * I, gb * I, 0);
        this._imm(tx, ty, tz, fx, fy, fz, 0.6, K_BEAM, gr * I * 0.18, gg * I * 0.18, gb * I * 0.18, 0);
      }
    }
  }

  // 光波砲：充能時槍口的光球＋往裡吸的光絲；發射時一條白熱核心、青藍外暈的粗光束，外面繞兩條螺旋
  _cannon(dt) {
    const c = this.cn;
    if (!c.fresh) return;
    c.fresh = false;
    const x = c.x, y = c.y, z = c.z, t = this.time;
    if (!c.on) {
      const k = c.charge, fl = 0.85 + 0.15 * Math.sin(t * 70);
      this._imm(x, y, z, x, y, z, 0.4 + 1.8 * k * k, K_GLOW, 0.8 * k * fl, 1.6 * k * fl, 3.2 * k * fl, 0);
      this._imm(x, y, z, x, y, z, 0.15 + 0.6 * k, K_GLOW, 6 * k, 7 * k, 8 * k, 0);
      this._perp(c.dx, c.dy, c.dz);
      const U = this._u, Vv = this._v;
      for (let j = 0; j < 8; j++) {
        const ph = (t * 2.4 + j * 0.37) % 1, a = j * 2.39996 + t * 1.5, el = Math.sin(j * 1.7) * 0.9;
        const ca = Math.cos(a), sa = Math.sin(a);
        let ox = U[0] * ca + Vv[0] * sa + c.dx * el, oy = U[1] * ca + Vv[1] * sa + c.dy * el, oz = U[2] * ca + Vv[2] * sa + c.dz * el;
        const L = Math.hypot(ox, oy, oz) || 1; ox /= L; oy /= L; oz /= L;
        const r0 = 0.4 + 2.6 * (1 - ph), r1 = r0 + 0.5 + 1.1 * (1 - ph), I = 4 * k * ph;
        this._imm(x + ox * r0, y + oy * r0, z + oz * r0, x + ox * r1, y + oy * r1, z + oz * r1, 0.045, K_SPARK, 0.6 * I, 1.2 * I, 2.4 * I, 0.2);
      }
      return;
    }
    const I = c.I;
    if (I <= 0.001) return;
    const tx = c.tx, ty = c.ty, tz = c.tz;
    let dx = tx - x, dy = ty - y, dz = tz - z;
    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
    // 光束本體：近處切短段、而且槍口那一段比較細（離鏡頭才 9 公尺，太粗會整個畫面一片白），表面有往前跑的脈動
    let px = x, py = y, pz = z, s0 = 0;
    for (let i = 1; i <= 12; i++) {
      const f = i / 12, s = L * f * f;
      const hx = x + dx * s, hy = y + dy * s, hz = z + dz * s;
      const w = I * (1 + 0.14 * Math.sin(t * 50 - s * 0.06)) * Math.min(1, 0.08 + s0 / 160);
      s0 = s;
      this._imm(hx, hy, hz, px, py, pz, 7 * w, K_BEAM, 0.2 * I, 0.5 * I, 1.3 * I, 0);
      this._imm(hx, hy, hz, px, py, pz, 2.6 * w, K_BEAM, 1.4 * I, 4 * I, 9 * I, 0);
      this._imm(hx, hy, hz, px, py, pz, 0.9 * w, K_BEAM, 15 * I, 18 * I, 23 * I, 0);
      px = hx; py = hy; pz = hz;
    }
    // 兩條螺旋
    this._perp(dx, dy, dz);
    const U = this._u, Vv = this._v, HL = Math.min(L, 260);
    if (HL > 30) for (let h = 0; h < 2; h++) {
      let qx = 0, qy = 0, qz = 0;
      for (let i = 0; i <= 20; i++) {
        const s = 20 + (HL - 20) * Math.pow(i / 20, 1.5), a = s * 0.09 - t * 16 + h * Math.PI, R = Math.min(1, s / 70) * (2.6 + 0.8 * Math.sin(t * 9 + s * 0.05));
        const ca = Math.cos(a) * R, sa = Math.sin(a) * R;
        const hx = x + dx * s + U[0] * ca + Vv[0] * sa, hy = y + dy * s + U[1] * ca + Vv[1] * sa, hz = z + dz * s + U[2] * ca + Vv[2] * sa;
        if (i > 0) this._imm(hx, hy, hz, qx, qy, qz, 0.2 * I, K_BEAM, 1.4 * I, 3.4 * I, 7 * I, 0);
        qx = hx; qy = hy; qz = hz;
      }
    }
    // 槍口
    const fl = 0.85 + 0.15 * Math.sin(t * 90);
    this._imm(x, y, z, x, y, z, 1.1 * I, K_GLOW, 0.6 * I * fl, 1.3 * I * fl, 2.8 * I * fl, 0);
    this._imm(x, y, z, x, y, z, 0.35 * I, K_GLOW, 6 * I, 7 * I, 8 * I, 0);
    // 終點：大光團＋往回噴的火花＋照亮四周
    if (c.hit) {
      this._imm(tx, ty, tz, tx, ty, tz, 14 * I * fl, K_GLOW, 1.2 * I, 1.6 * I, 2.6 * I, 0);
      this._imm(tx, ty, tz, tx, ty, tz, 4.5 * I, K_GLOW, 10 * I, 10 * I, 10 * I, 0);
      const n = Math.random() < this.qn ? 3 : 1;
      for (let k = 0; k < n; k++) {
        this._cone(-dx, -dy + 0.6, -dz, 0.9);
        const sp = rr(20, 60), d = this._d;
        this._spark(tx, ty, tz, d[0] * sp, d[1] * sp, d[2] * sp, rr(0.4, 0.9), rr(0.05, 0.1), 1.3, 1.6);
      }
      c.lt -= dt;
      if (c.lt <= 0) { c.lt = 0.14; this._flash(tx - dx * 3, ty - dy * 3 + 2, tz - dz * 3, 0.9); }
    }
  }

  _lights(dt) {
    for (const L of this.lights) {
      L.age += dt;
      if (L.age > L.dur * 5) { if (L.cur !== 0) { L.cur = 0; L.l.intensity = 0; } continue; }
      const fl = 0.85 + 0.15 * Math.sin(L.age * 50) * Math.sin(L.age * 31);
      L.cur = L.peak * (0.7 * Math.exp(-L.age / 0.07) + 0.3 * Math.exp(-L.age / L.dur)) * fl;
      L.l.intensity = L.cur;
    }
  }

  _ribbons() {
    const now = this.time;
    const P = this.rPos, I = this.rInfo, C = this.rCol;
    let any = false;
    for (let r = 0; r < RIB; r++) {
      const R = this.rib[r];
      const base = r * RSEC * 2;
      const live = R.n >= 2 && now - R.last < 0.2;
      if (!live) {
        // 收起來（零面積）
        for (let v = 0; v < RSEC * 2; v++) { const o = (base + v) * 3; P[o] = P[o + 1] = P[o + 2] = 0; I[(base + v) * 2 + 1] = 2; }
        continue;
      }
      any = true;
      const n = R.n, segs = n - 1;
      const cr = R.col.r, cg = R.col.g, cb = R.col.b;
      let v = 0;
      for (let s = 0; s < segs; s++) {
        const s0 = Math.max(0, s - 1), s2 = Math.min(n - 1, s + 1), s3 = Math.min(n - 1, s + 2);
        const steps = s === segs - 1 ? RSUB + 1 : RSUB;
        for (let q = 0; q < steps; q++) {
          if (v >= RSEC) break;
          const tt = q / RSUB;
          // Catmull-Rom
          const t2 = tt * tt, t3 = t2 * tt;
          const c0 = -0.5 * t3 + t2 - 0.5 * tt, c1 = 1.5 * t3 - 2.5 * t2 + 1, c2 = -1.5 * t3 + 2 * t2 + 0.5 * tt, c3 = 0.5 * t3 - 0.5 * t2;
          const oA = (base + v * 2) * 3, oB = oA + 3;
          for (let ax = 0; ax < 3; ax++) {
            P[oA + ax] = c0 * R.a[s0 * 3 + ax] + c1 * R.a[s * 3 + ax] + c2 * R.a[s2 * 3 + ax] + c3 * R.a[s3 * 3 + ax];
            P[oB + ax] = c0 * R.b[s0 * 3 + ax] + c1 * R.b[s * 3 + ax] + c2 * R.b[s2 * 3 + ax] + c3 * R.b[s3 * 3 + ax];
          }
          const ts = R.t[s] + (R.t[s2] - R.t[s]) * tt;
          const age = (now - ts) / 0.15;
          const iA = (base + v * 2) * 2;
          I[iA] = 0; I[iA + 1] = age; I[iA + 2] = 1; I[iA + 3] = age;
          C[oA] = cr; C[oA + 1] = cg; C[oA + 2] = cb; C[oB] = cr; C[oB + 1] = cg; C[oB + 2] = cb;
          v++;
        }
      }
      // 剩下的頂點疊在最後一點
      const lA = (base + (v - 1) * 2) * 3;
      for (; v < RSEC; v++) {
        const oA = (base + v * 2) * 3;
        for (let ax = 0; ax < 6; ax++) P[oA + ax] = P[lA + ax];
        const iA = (base + v * 2) * 2;
        I[iA] = 0; I[iA + 1] = 2; I[iA + 2] = 1; I[iA + 3] = 2;
      }
    }
    this.rMesh.visible = any;
    if (any) {
      const g = this.rGeo;
      g.attributes.position.needsUpdate = true;
      g.attributes.aInfo.needsUpdate = true;
      g.attributes.aCol.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- 寫入 GPU
  _writeVolume() {
    const V = this.V, keys = this.vKeys, buf = this.vBuf;
    const cx = this.camPos.x, cy = this.camPos.y, cz = this.camPos.z;
    const fx = this.camFwd.x, fy = this.camFwd.y, fz = this.camFwd.z;
    let n = 0;
    for (let i = 0; i < VMAX; i++) {
      if (!V.alive[i]) continue;
      const depth = (V.x[i] - cx) * fx + (V.y[i] - cy) * fy + (V.z[i] - cz) * fz;
      const sz = V.sz[i];
      if (depth < -sz * 1.5) continue;
      if (V.ao[i] < 0.003 && V.to[i] < 0.05 && V.glow[i] < 0.01) continue;
      const q = depth < 0 ? 0 : depth > 4095 ? 4095 : depth;
      keys[n++] = Math.floor((4095.99 - q) * 256) * 4096 + i;
    }
    for (let k = n; k < this.vPrevN; k++) keys[k] = 0xFFFFFFFF;
    this.vPrevN = n;
    keys.sort();
    for (let k = 0; k < n; k++) {
      const i = keys[k] & 4095;
      const o = k * VS;
      const lt = V.lf[i], lit = 1 + V.lit[i] * lt;
      buf[o] = V.x[i]; buf[o + 1] = V.y[i]; buf[o + 2] = V.z[i]; buf[o + 3] = V.sz[i];
      buf[o + 4] = V.rot[i]; buf[o + 5] = V.ao[i]; buf[o + 6] = V.cell[i]; buf[o + 7] = V.to[i];
      buf[o + 8] = V.r[i] * lit; buf[o + 9] = V.g[i] * lit; buf[o + 10] = V.b[i] * lit; buf[o + 11] = V.glow[i];
      buf[o + 12] = V.seed[i]; buf[o + 13] = V.eo[i]; buf[o + 14] = V.asp[i]; buf[o + 15] = V.gy[i];
    }
    this.vGeo.instanceCount = n;
    this.vMesh.visible = n > 0;
    if (n > 0) {
      const ib = this.vIB;
      this.vRange.count = n * VS;
      ib.updateRanges.length = 0;
      ib.updateRanges.push(this.vRange);
      ib.needsUpdate = true;
    }
  }

  // 即時線段（本幀有效）
  _imm(hx, hy, hz, tx, ty, tz, w, kind, r, g, b, a) {
    if (this.sN >= SMAX + IMAX) return;
    const o = this.sN++ * SS, B = this.sBuf;
    B[o] = hx; B[o + 1] = hy; B[o + 2] = hz; B[o + 3] = w;
    B[o + 4] = tx; B[o + 5] = ty; B[o + 6] = tz; B[o + 7] = kind;
    B[o + 8] = r; B[o + 9] = g; B[o + 10] = b; B[o + 11] = a;
  }

  _hot(T) {
    T = clamp(T, 0, 1.5);
    let k = 0;
    while (k < HOT_T.length - 2 && T > HOT_T[k + 1]) k++;
    const f = (T - HOT_T[k]) / (HOT_T[k + 1] - HOT_T[k]);
    const a = k * 4, b = a + 4;
    const I = HOT_C[a + 3] + (HOT_C[b + 3] - HOT_C[a + 3]) * f;
    this._cr = (HOT_C[a] + (HOT_C[b] - HOT_C[a]) * f) * I;
    this._cg = (HOT_C[a + 1] + (HOT_C[b + 1] - HOT_C[a + 1]) * f) * I;
    this._cb = (HOT_C[a + 2] + (HOT_C[b + 2] - HOT_C[a + 2]) * f) * I;
  }

  _flushStreaks() {
    const S = this.S;
    // 粒子寫在即時線段之後（即時線段在 update 過程中已寫入 0..sN）
    for (let i = 0; i < SMAX; i++) {
      if (!S.alive[i]) continue;
      if (this.sN >= SMAX + IMAX) break;
      const lt = S.age[i] / S.life[i];
      const kind = S.kind[i], fl = S.flags[i];
      let r, g, b, a = S.a[i];
      if (fl & S_HOT) {
        this._hot(S.temp[i]);
        const e = 1 - sstep(0.75, 1, lt);
        r = this._cr * e; g = this._cg * e; b = this._cb * e;
        if (fl & S_FLICK) { const f = 0.55 + 0.45 * Math.sin(S.age[i] * 17 + S.seed[i] * 50); r *= f; g *= f; b *= f; }
      } else if (kind === K_DEBRIS) {
        r = S.r[i]; g = S.g[i]; b = S.b[i]; a = 1 - sstep(0.85, 1, lt);
      } else {
        const e = Math.pow(1 - lt, S.fp[i]);
        r = S.r[i] * e; g = S.g[i] * e; b = S.b[i] * e;
      }
      const st = S.st[i];
      const hx = S.x[i], hy = S.y[i], hz = S.z[i];
      let tx = hx - S.vx[i] * st, ty = hy - S.vy[i] * st, tz = hz - S.vz[i] * st;
      if (fl & S_REST) { tx = hx; ty = hy; tz = hz; }
      this._imm(hx, hy, hz, tx, ty, tz, S.w[i], kind, r, g, b, a);
    }
    const n = this.sN;
    this.sGeo.instanceCount = n;
    this.sMesh.visible = n > 0;
    if (n > 0) {
      const ib = this.sIB;
      this.sRange.count = n * SS;
      ib.updateRanges.length = 0;
      ib.updateRanges.push(this.sRange);
      ib.needsUpdate = true;
    }
  }
}
