// 用 WebGL 畫頭髮：每一撮頭髮是一條細長網格，貼上畫好的頭髮圖（照這撮頭髮原本在圖上的位置取樣），再換成目前的髮色。
// 梳、剪、長、染的時候網格跟著變形，畫好的髮絲也跟著走；相鄰髮束取樣的位置是連續的，拼起來就是原本那張圖，不會一條一條的。
// 畫在一張離屏畫布上，再用 drawImage 貼回 2D 畫面（跟著 2D 的座標轉換，遊戲畫面、拍照、縮圖都能用）。
const VS = `attribute vec2 p;attribute vec2 uv;attribute vec3 c;attribute vec2 e;
uniform vec4 view;varying vec2 vUv;varying vec3 vC;varying vec2 vE;
void main(){vUv=uv;vC=c;vE=e;vec2 q=(p-view.xy)/view.zw;gl_Position=vec4(q.x*2.-1.,1.-q.y*2.,0.,1.);}`;
// e.x＝橫向位置（-1 左緣、1 右緣）；e.y＝透明度。頭髮圖的亮度對上「平均亮度」換算成倍數，乘上目前髮色。
// 頭髮圖沒畫到的地方（透明）改用細髮絲貼圖，頭髮長到圖外面也不會變成一片平色。
const FS = `precision mediump float;uniform sampler2D plate,detail;uniform float mean,dmean;varying vec2 vUv;varying vec3 vC;varying vec2 vE;
void main(){
 vec4 t=texture2D(plate,vUv);
 float lp=dot(t.rgb/max(t.a,.001),vec3(.299,.587,.114))/mean;
 float ld=dot(texture2D(detail,vec2(fract(vUv.x*5.3),fract(vUv.y*1.7))).rgb,vec3(.299,.587,.114))/dmean;
 float k=mix(ld,lp,smoothstep(.2,.75,t.a));
 k=k<1.?pow(k,1.12):1.+(k-1.)*.55;
 // 反光是髮色本身變亮（棕髮反出暖色的光），只有很亮的地方才稍微偏白
 vec3 col=vC*k*.97+(1.-vC)*max(k-1.35,0.)*.3;
 col*=.94+.06*(1.-vE.x*vE.x);
 float a=(1.-smoothstep(.5,1.,abs(vE.x)))*vE.y;
 gl_FragColor=vec4(col*a,a);
}`;
const VIEW = { x: 0, y: 60, w: 390, h: 610 };
const FLOATS = 9, MAXV = 60000;
const lum = (d, i) => (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;

export class HairGL {
  constructor() {
    this.canvas = document.createElement('canvas');
    const gl = this.gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: true, alpha: true });
    this.ok = !!gl;
    if (!gl) return;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = this.prog = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    this.loc = Object.fromEntries(['p', 'uv', 'c', 'e'].map((k) => [k, gl.getAttribLocation(pr, k)]));
    this.u = Object.fromEntries(['view', 'plate', 'detail', 'mean', 'dmean'].map((k) => [k, gl.getUniformLocation(pr, k)]));
    this.buf = gl.createBuffer();
    this.data = new Float32Array(MAXV * FLOATS);
    gl.uniform1i(this.u.plate, 0); gl.uniform1i(this.u.detail, 1);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.tex = {};
  }
  // 上傳貼圖（只做一次）；順便算平均亮度，換色時用
  texture(slot, img) {
    const gl = this.gl;
    if (this.tex[slot] && this.tex[slot].img === img) return this.tex[slot];
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + slot); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const c = document.createElement('canvas'); c.width = 96; c.height = 200;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 96, 200);
    const d = x.getImageData(0, 0, 96, 200).data; let s = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { s += lum(d, i); n++; }
    this.tex[slot] = { t, img, mean: n ? s / n : .45 };
    return this.tex[slot];
  }
  // items：[{ s（髮束）, nodes, alpha }]，照順序畫（後面的蓋前面的）
  draw(ctx, items, plate, detail) {
    const gl = this.gl;
    if (gl.isContextLost()) return false;
    const m = ctx.getTransform(), S = Math.min(3, Math.max(1.5, Math.round(Math.hypot(m.a, m.b) * 2) / 2));
    const W = Math.round(VIEW.w * S), H = Math.round(VIEW.h * S);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    const P = this.texture(0, plate), D = this.texture(1, detail || plate);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, P.t);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, D.t);
    gl.uniform4f(this.u.view, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    gl.uniform1f(this.u.mean, P.mean); gl.uniform1f(this.u.dmean, D.mean);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const st = FLOATS * 4;
    for (const [k, n, o] of [['p', 2, 0], ['uv', 2, 2], ['c', 3, 4], ['e', 2, 7]]) { gl.enableVertexAttribArray(this.loc[k]); gl.vertexAttribPointer(this.loc[k], n, gl.FLOAT, false, st, o * 4); }
    let v = 0;
    const flush = () => { if (!v) return; gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, v * FLOATS), gl.STREAM_DRAW); gl.drawArrays(gl.TRIANGLES, 0, v); v = 0; };
    for (const it of items) {
      // 已經算好的三角形（頭頂圓頂）：直接放進去
      if (it.tris) { if (v + it.tris.length / FLOATS > MAXV) flush(); this.data.set(it.tris, v * FLOATS); v += it.tris.length / FLOATS; continue; }
      const need = strandVerts(it.nodes);
      if (!need) continue;
      if (v + need > MAXV) flush();
      v = writeStrand(this.data, v, it.s, it.nodes, it.alpha ?? 1);
    }
    flush();
    ctx.drawImage(this.canvas, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    return true;
  }
}

const K = 5;   // 每一節切幾段（越多越圓順）
const strandVerts = (n) => (n.length < 2 ? 0 : ((n.length - 1) * K) * 6);
// Catmull-Rom：同時算現在的位置和它在頭髮圖上的位置
function cr(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
const _pts = [];
function writeStrand(out, v, s, n, alpha) {
  const syScale = s.bang ? 1.12 : 1.23;
  // 頭髮圖上的位置：用原本畫的位置；長出來的新節（圖上沒有）順著現在的方向往下延伸
  const pp = [];
  for (let j = 0; j < n.length; j++) {
    const q = n[j]; let px = q.paintX ?? q.homeX ?? q.x, py = q.paintY ?? q.homeY ?? q.y;
    if (j > 0) {
      const a = n[j - 1], seg = Math.hypot(q.x - a.x, q.y - a.y), prev = pp[j - 1];
      if (py - prev.py < seg * .5) { px = prev.px + (q.x - a.x); py = prev.py + Math.max(q.y - a.y, seg * .7); }
    }
    pp.push({ px, py });
  }
  const pts = _pts; pts.length = 0;
  const L = n.length;
  for (let j = 0; j < L - 1; j++) {
    const a = Math.max(0, j - 1), b = j, c = j + 1, d = Math.min(L - 1, j + 2);
    for (let k = 0; k < K; k++) {
      const t = k / K;
      pts.push({
        x: cr(n[a].x, n[b].x, n[c].x, n[d].x, t), y: cr(n[a].y, n[b].y, n[c].y, n[d].y, t),
        u: cr(pp[a].px, pp[b].px, pp[c].px, pp[d].px, t), w: cr(pp[a].py, pp[b].py, pp[c].py, pp[d].py, t),
        c0: n[b].c, c1: n[c].c, f: t,
      });
    }
  }
  const e = n[L - 1], ep = pp[L - 1];
  pts.push({ x: e.x, y: e.y, u: ep.px, w: ep.py, c0: e.c, c1: e.c, f: 0 });
  const len = pts.length, V = [];
  for (let i = 0; i < len; i++) {
    const A = pts[Math.max(0, i - 1)], B = pts[Math.min(len - 1, i + 1)], P = pts[i];
    let dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    let du = B.u - A.u, dw = B.w - A.w, m = Math.hypot(du, dw) || 1; du /= m; dw /= m;
    const t = i / (len - 1), r = s.width * .5 * 1.25 * (.97 - .92 * Math.pow(t, 4)), fa = alpha * Math.min(1, .15 + t * 16);   // 髮根淡入：頂端不會一格一格
    const sx = 195 + (P.u - 195) * 1.17, sy = 123 + (P.w - 123) * syScale, ru = r * 1.17;
    const col = [0, 1, 2].map((k) => (P.c0[k] + (P.c1[k] - P.c0[k]) * P.f) / 255);
    // 左、右兩個點：位置沿法線、頭髮圖上的位置也沿圖上的法線
    V.push([P.x - dy * r, P.y + dx * r, (sx - dw * ru) / 390, (sy + du * ru) / 844, col, -1, fa],
      [P.x + dy * r, P.y - dx * r, (sx + dw * ru) / 390, (sy - du * ru) / 844, col, 1, fa]);
  }
  const put = (q) => { const o = v * FLOATS; out[o] = q[0]; out[o + 1] = q[1]; out[o + 2] = q[2]; out[o + 3] = q[3]; out[o + 4] = q[4][0]; out[o + 5] = q[4][1]; out[o + 6] = q[4][2]; out[o + 7] = q[5]; out[o + 8] = q[6]; v++; };
  for (let i = 0; i < len - 1; i++) {
    const a = V[i * 2], b = V[i * 2 + 1], c = V[i * 2 + 2], d = V[i * 2 + 3];
    put(a); put(b); put(c); put(b); put(d); put(c);
  }
  return v;
}

// 頭頂圓頂：上緣是圓的頭形、下緣是髮際線，整片貼頭髮圖（瀏海那一區畫好的髮根），邊緣淡出。
// top、bottom：[[x,y]...] 由左到右；cl、cr：左右髮色（0–255）。回傳三角形頂點（跟髮束同一種格式）。
export function domeTris(top, bottom, cl, cr) {
  const out = [], cx = 195, cy = 196;
  const vtx = (x, y, e) => { const f = Math.min(1, Math.max(0, (x - 104) / 182)), sx = 195 + (x - 195) * 1.17, sy = 123 + (y - 123) * 1.12;
    return [x, y, sx / 390, sy / 844, ...[0, 1, 2].map((k) => (cl[k] + (cr[k] - cl[k]) * f) / 255), e, 1]; };
  const rim = top.concat(bottom.slice().reverse());
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i], b = rim[(i + 1) % rim.length];
    const ia = [cx + (a[0] - cx) * .9, cy + (a[1] - cy) * .9], ib = [cx + (b[0] - cx) * .9, cy + (b[1] - cy) * .9];
    const C = vtx(cx, cy, 0), IA = vtx(...ia, 0), IB = vtx(...ib, 0), A = vtx(...a, 1), B = vtx(...b, 1);
    out.push(...C, ...IA, ...IB, ...IA, ...A, ...B, ...IA, ...B, ...IB);
  }
  return new Float32Array(out);
}
