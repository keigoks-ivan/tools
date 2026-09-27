// 程序化貼圖：建築立面、機體面板線、煙霧、光暈、標誌。全部用 Canvas 畫，不需要下載。
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function grain(ctx, w, h, amount, r, alpha = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
    d[i + 3] = d[i + 3] * alpha;
  }
  ctx.putImageData(img, 0, 0);
}

// 雨水垂直污漬
function stains(ctx, w, h, r, count, color, maxA) {
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, sw = 2 + r() * 14, sh = 30 + r() * 200;
    const g = ctx.createLinearGradient(0, y, 0, y + sh);
    const a = (0.2 + r() * 0.8) * maxA;
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, sw, sh);
  }
}

// ---------- 建築立面：一張圖 = 8 開間 × 8 層（每開間 4m、每層 3.6m） ----------
export const FACADE_TILE = { w: 32, h: 28.8 };

export function makeFacade(style, seed = 1) {
  const S = 1024, bay = S / 8, fl = S / 8;
  const r = rng(seed * 97 + 13);
  const [cA, a] = canvas(S, S);   // albedo
  const [cE, e] = canvas(S, S);   // emissive
  const [cR, g] = canvas(S, S);   // roughness(G)
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);

  const warm = ['255,196,120', '255,214,150', '255,180,100', '220,235,255', '255,230,190'];
  const lit = (x, y, w, h, p) => {
    if (r() < p) {
      const c = warm[(r() * warm.length) | 0];
      const k = 0.45 + r() * 0.55;
      const gr = e.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, `rgba(${c},${k * 0.7})`);
      gr.addColorStop(1, `rgba(${c},${k})`);
      e.fillStyle = gr;
      e.fillRect(x, y, w, h);
      // 窗簾 / 室內剪影
      if (r() < 0.5) { e.fillStyle = 'rgba(0,0,0,0.55)'; e.fillRect(x + r() * w * 0.6, y, w * (0.2 + r() * 0.4), h); }
    }
  };

  if (style === 0) {
    // 玻璃帷幕辦公大樓
    a.fillStyle = '#39434f'; a.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(0,40,0)'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 16; i++) {
      const x = i * bay / 2, y = j * fl;
      const t = 40 + r() * 30;
      a.fillStyle = `rgb(${t * 0.8},${t * 0.95},${t * 1.15})`;
      a.fillRect(x + 3, y + 3, bay / 2 - 6, fl - 14);
      if (r() < 0.06) { a.fillStyle = '#0c0f13'; a.fillRect(x + 3, y + 3, bay / 2 - 6, fl - 14); g.fillStyle = 'rgb(0,230,0)'; g.fillRect(x + 3, y + 3, bay / 2 - 6, fl - 14); g.fillStyle = 'rgb(0,40,0)'; }
      lit(x + 3, y + 3, bay / 2 - 6, fl - 14, 0.16);
    }
    a.fillStyle = '#8b939b';
    for (let j = 0; j <= 8; j++) a.fillRect(0, j * fl - 6, S, 10);
    for (let i = 0; i <= 16; i++) a.fillRect(i * bay / 2 - 2, 0, 4, S);
    g.fillStyle = 'rgb(0,150,0)';
    for (let j = 0; j <= 8; j++) g.fillRect(0, j * fl - 6, S, 10);
    stains(a, S, S, r, 120, '20,22,24', 0.25);
  } else if (style === 1) {
    // 混凝土住宅（陽台橫帶）
    const base = 150 + r() * 40;
    a.fillStyle = `rgb(${base},${base * 0.96},${base * 0.9})`; a.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(0,225,0)'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < 8; j++) {
      const y = j * fl;
      a.fillStyle = `rgba(255,250,240,0.25)`; a.fillRect(0, y + fl - 22, S, 22);
      a.fillStyle = `rgba(0,0,0,0.35)`; a.fillRect(0, y + fl - 2, S, 4);
      for (let i = 0; i < 8; i++) {
        const x = i * bay;
        const ww = bay * (0.5 + r() * 0.2), wh = fl * 0.55;
        const wx = x + (bay - ww) / 2, wy = y + fl * 0.16;
        a.fillStyle = r() < 0.07 ? '#07080a' : `rgb(${30 + r() * 25},${34 + r() * 25},${40 + r() * 25})`;
        a.fillRect(wx, wy, ww, wh);
        a.fillStyle = 'rgba(210,210,200,0.9)'; a.fillRect(wx + ww / 2 - 2, wy, 4, wh);
        g.fillStyle = 'rgb(0,60,0)'; g.fillRect(wx, wy, ww, wh);
        lit(wx, wy, ww, wh, 0.22);
        // 冷氣機
        if (r() < 0.3) { a.fillStyle = '#b8b8b0'; a.fillRect(wx + ww + 4, wy + wh - 26, 30, 22); }
      }
    }
    stains(a, S, S, r, 260, '40,36,30', 0.3);
  } else if (style === 2) {
    // 老舊磚造
    a.fillStyle = '#6f4a3a'; a.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(0,235,0)'; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) for (let x = (y / 8) % 2 ? 0 : 10; x < S; x += 20) {
      const t = r() * 30 - 15;
      a.fillStyle = `rgb(${110 + t},${70 + t * 0.6},${55 + t * 0.5})`;
      a.fillRect(x, y, 18, 6);
    }
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const x = i * bay + bay * 0.28, y = j * fl + fl * 0.2, ww = bay * 0.44, wh = fl * 0.55;
      a.fillStyle = '#d8d0c0'; a.fillRect(x - 6, y - 8, ww + 12, wh + 16);
      a.fillStyle = r() < 0.12 ? '#060606' : '#23262b'; a.fillRect(x, y, ww, wh);
      a.fillStyle = '#d8d0c0'; a.fillRect(x + ww / 2 - 2, y, 4, wh); a.fillRect(x, y + wh / 2 - 2, ww, 4);
      g.fillStyle = 'rgb(0,70,0)'; g.fillRect(x, y, ww, wh);
      lit(x, y, ww, wh, 0.18);
    }
    stains(a, S, S, r, 200, '25,18,14', 0.35);
  } else {
    // 燒毀的工業建築
    a.fillStyle = '#6b6862'; a.fillRect(0, 0, S, S);
    g.fillStyle = 'rgb(0,240,0)'; g.fillRect(0, 0, S, S);
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
      const x = i * bay + 10, y = j * fl + 18, ww = bay - 20, wh = fl * 0.5;
      a.fillStyle = '#0a0a0a'; a.fillRect(x, y, ww, wh);
      if (r() < 0.04) { e.fillStyle = `rgba(255,${90 + r() * 60},20,${0.6 + r() * 0.4})`; e.fillRect(x, y + wh * 0.5, ww, wh * 0.5); }
    }
    // 焦黑
    for (let k = 0; k < 18; k++) {
      const x = r() * S, y = r() * S, rad = 60 + r() * 220;
      const gr = a.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(10,8,6,0.85)'); gr.addColorStop(1, 'rgba(10,8,6,0)');
      a.fillStyle = gr; a.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    stains(a, S, S, r, 300, '20,18,15', 0.4);
  }
  grain(a, S, S, 22, r);
  return { map: tex(cA), emissiveMap: tex(cE), roughnessMap: tex(cR, false) };
}

// ---------- 機體面板線（三面投影用，1 張 = 4m） ----------
export function makePanelTexture(seed = 3) {
  const S = 1024;
  const r = rng(seed);
  const [c, x] = canvas(S, S);
  x.fillStyle = 'rgb(128,128,0)'; x.fillRect(0, 0, S, S);
  // R：面板線（255 = 線）；G：細緻髒污
  const img = x.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 0; d[i + 1] = 110 + (r() - 0.5) * 60; d[i + 2] = 0; d[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  // 大塊髒污
  for (let k = 0; k < 60; k++) {
    const px = r() * S, py = r() * S, rad = 30 + r() * 160;
    const gr = x.createRadialGradient(px, py, 0, px, py, rad);
    const v = r() < 0.5 ? 0 : 255;
    gr.addColorStop(0, `rgba(0,${v},0,${0.15 + r() * 0.2})`); gr.addColorStop(1, `rgba(0,${v},0,0)`);
    x.fillStyle = gr; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  x.globalCompositeOperation = 'lighter';
  x.strokeStyle = 'rgb(255,0,0)';
  const split = (x0, y0, w, h, depth) => {
    if (depth > 4 || (depth > 1 && r() < 0.25) || w < 60 || h < 60) {
      x.lineWidth = 2.2;
      x.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
      if (r() < 0.3) { // 小細節：維修口、螺絲
        const bw = w * 0.3, bh = h * 0.25;
        x.lineWidth = 1.5; x.strokeRect(x0 + w * 0.1, y0 + h * 0.1, bw, bh);
      }
      if (r() < 0.35) {
        x.fillStyle = 'rgb(160,0,0)';
        for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(x0 + (k < 2 ? 8 : w - 8), y0 + (k % 2 ? 8 : h - 8), 2.2, 0, 7); x.fill(); }
      }
      return;
    }
    if (w > h ? r() < 0.8 : r() < 0.2) {
      const s = w * (0.3 + r() * 0.4);
      split(x0, y0, s, h, depth + 1); split(x0 + s, y0, w - s, h, depth + 1);
    } else {
      const s = h * (0.3 + r() * 0.4);
      split(x0, y0, w, s, depth + 1); split(x0, y0 + s, w, h - s, depth + 1);
    }
  };
  split(0, 0, S, S, 0);
  const t = tex(c, false);
  return t;
}

// ---------- 煙霧粒子圖集（2×2 變化） ----------
export function makeSmokeAtlas() {
  const S = 512, H = 256;
  const r = rng(77);
  const [c, x] = canvas(S, S);
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * H, oy = ((v / 2) | 0) * H;
    const img = x.createImageData(H, H);
    const d = img.data;
    // 疊幾層隨機圓點 → 蓬鬆
    const blobs = [];
    for (let k = 0; k < 26; k++) {
      const a = r() * Math.PI * 2, rr = r() * 0.42;
      blobs.push([0.5 + Math.cos(a) * rr * 0.8, 0.5 + Math.sin(a) * rr * 0.8, 0.12 + r() * 0.2, 0.4 + r() * 0.6]);
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < H; i++) {
      const u = i / H, w = j / H;
      let dens = 0;
      for (const [bx, by, br, bs] of blobs) {
        const dx = u - bx, dy = w - by;
        const q = 1 - Math.sqrt(dx * dx + dy * dy) / br;
        if (q > 0) dens += q * q * bs;
      }
      const edge = Math.max(0, 1 - Math.hypot(u - 0.5, w - 0.5) / 0.5);
      dens = Math.min(1, dens * 0.9) * Math.min(1, edge * 2.2);
      const n = 0.75 + (r() - 0.5) * 0.25;
      const p = (j * H + i) * 4;
      d[p] = d[p + 1] = d[p + 2] = 255 * n;
      d[p + 3] = 255 * dens;
    }
    x.putImageData(img, ox, oy);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

// 圓形光暈（加法混合用）
export function makeGlowTexture() {
  const S = 128;
  const [c, x] = canvas(S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// 機體標誌貼紙
export function makeDecal(text, sub, color = '#1a1f2a', accent = '#c8202a') {
  const [c, x] = canvas(512, 256);
  x.clearRect(0, 0, 512, 256);
  x.fillStyle = color;
  x.font = '900 150px "Rajdhani","Arial Black",sans-serif';
  x.textBaseline = 'middle';
  x.fillText(text, 14, 110);
  x.fillStyle = accent; x.fillRect(16, 196, 300, 16);
  x.fillStyle = color;
  x.font = '700 34px "Rajdhani",Arial,sans-serif';
  x.fillText(sub, 16, 236);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makeCautionStripe() {
  const [c, x] = canvas(256, 64);
  x.fillStyle = '#d8a820'; x.fillRect(0, 0, 256, 64);
  x.fillStyle = '#16161a';
  for (let i = -64; i < 320; i += 40) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 20, 64); x.lineTo(i + 84, 0); x.lineTo(i + 64, 0); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 車道標線用小圖
export function makeRoadLineTexture() {
  const [c, x] = canvas(64, 256);
  x.fillStyle = '#000'; x.fillRect(0, 0, 64, 256);
  x.fillStyle = '#fff'; x.fillRect(8, 0, 48, 150);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
