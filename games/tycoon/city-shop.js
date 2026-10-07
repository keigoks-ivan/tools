// 創業之城：業態店面（一樓）。同種零件合併成 InstancedMesh，圖集共用材質。
// 店面局部座標：x = 沿街面（-0.39..0.39）、y = 向上、z = 向街（0 = 建築外牆）。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { businessOf } from './businesses.js';
import { drawBusinessMark } from './business-art.js';

const OWNER = { player: { ring: 0x3ddc84 }, rival: { ring: 0xff5a52 } };
const FONT = '700 {S}px "PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif';

const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cyl = (rt, rb, h, x, y, z, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z);
const merge = (arr) => mergeGeometries(arr);

function stripeTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 32, 8); g.fillStyle = '#000'; g.fillRect(32, 0, 32, 8);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; return t;
}
function shutterTex() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#8b8f98' : '#a3a7b0'; g.fillRect(0, i * 8, 32, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function queueTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(255,208,60,.95)'; g.lineWidth = 5; g.setLineDash([26, 16]); g.strokeRect(4, 6, 504, 52);
  g.setLineDash([]); g.fillStyle = 'rgba(255,208,60,.95)';
  for (let i = 0; i < 6; i++) { const x = 60 + i * 80; g.beginPath(); g.moveTo(x + 22, 32); g.lineTo(x, 18); g.lineTo(x, 46); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function radialTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); return t;
}

function patchTint(m, mode) {
  m.customProgramCacheKey = () => 'tycoon-tint-' + mode;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aTint; varying vec3 vTint;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <map_fragment>', mode === 'stripe' ? '#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(0.96,0.92,0.84), vTint, diffuseColor.r);' : '#include <map_fragment>\ndiffuseColor.rgb *= vTint;');
  };
}
function patchSign(m, glow) {
  m.customProgramCacheKey = () => 'tycoon-sign';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = glow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aRect;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = aRect.xy + vMapUv * aRect.zw;\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uGlow;');
  };
}

export function createShops(root, specs, { wetStd }) {
  const N = specs.length;
  const glowSign = { value: 0.3 }, glowMenu = { value: 0.3 };
  // ---- 招牌貼圖圖集（每家一格 512×128）----
  const TW = 512, TH = 128, COLS = N > 64 ? 8 : 4, ROWS = Math.ceil(N / COLS);
  const atlas = document.createElement('canvas'); atlas.width = TW * COLS; atlas.height = TH * ROWS;
  const actx = atlas.getContext('2d');
  const atlasTex = new THREE.CanvasTexture(atlas); atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 8;
  function drawSign(i, st) {
    const x0 = (i % COLS) * TW, y0 = Math.floor(i / COLS) * TH, g = actx;
    g.save(); g.translate(x0, y0); g.clearRect(0, 0, TW, TH);
    if (st.owner) {
      const c = new THREE.Color(st.color || '#1f9d5c');
      const css = (k) => '#' + c.clone().multiplyScalar(k).getHexString();
      const gr = g.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, css(1.18)); gr.addColorStop(1, css(0.82));
      g.fillStyle = gr; g.fillRect(0, 0, TW, TH);
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.strokeRect(8, 8, TW - 16, TH - 16);
      drawBusinessMark(g, st.businessId, 25, 27, 72);
      // 店名
      let s = 66; const name = st.name || '';
      g.font = FONT.replace('{S}', s); while (g.measureText(name).width > 360 && s > 30) { s -= 3; g.font = FONT.replace('{S}', s); }
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 4; g.shadowOffsetY = 2;
      g.fillText(name, 288, 52);
      g.shadowBlur = 0; g.font = FONT.replace('{S}', 24); g.fillStyle = '#fff0d2';
      g.fillText(st.status === 'renovating' ? '裝修中・即將開幕' : `${businessOf(st.businessId).name}${st.assetLevel ? '・設備 ' + st.assetLevel + ' 級' : ''}`, 288, 99);
    } else {
      g.fillStyle = '#f1ede2'; g.fillRect(0, 0, TW, TH);
      g.strokeStyle = '#d33a2e'; g.lineWidth = 6; g.strokeRect(8, 8, TW - 16, TH - 16);
      g.fillStyle = '#d33a2e'; g.font = FONT.replace('{S}', 84); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('招租', 150, 66);
      g.font = FONT.replace('{S}', 30); g.fillStyle = '#3a3a44'; g.fillText('店面出租', 370, 44); g.font = FONT.replace('{S}', 26); g.fillText('FOR RENT', 370, 88);
    }
    g.restore(); atlasTex.needsUpdate = true;
  }
  const MW = 256, MH = 384;
  const MENU_COLS = N > 64 ? 12 : COLS, MENU_ROWS = Math.ceil(N / MENU_COLS);
  const menuAtlas = document.createElement('canvas'); menuAtlas.width = MW * MENU_COLS; menuAtlas.height = MH * MENU_ROWS;
  const mctx = menuAtlas.getContext('2d'), menuT = new THREE.CanvasTexture(menuAtlas);
  menuT.colorSpace = THREE.SRGBColorSpace; menuT.anisotropy = 4;
  function drawMenu(l) {
    const g = mctx, b = businessOf(l.businessId), items = Object.entries(b.items);
    g.save(); g.translate((l.i % MENU_COLS) * MW, Math.floor(l.i / MENU_COLS) * MH);
    g.fillStyle = '#20332f'; g.fillRect(0, 0, MW, MH); g.strokeStyle = '#d5b480'; g.lineWidth = 8; g.strokeRect(4, 4, MW - 8, MH - 8);
    drawBusinessMark(g, l.businessId, 104, 20, 48);
    g.fillStyle = '#fff0d2'; g.font = FONT.replace('{S}', 25); g.textAlign = 'center'; g.fillText(b.name, MW / 2, 105);
    g.fillStyle = '#d5b480'; g.fillRect(20, 123, MW - 40, 2);
    const dy = Math.min(62, 215 / items.length);
    items.forEach(([name, v], j) => {
      g.textAlign = 'left'; let size = 23; g.font = FONT.replace('{S}', size);
      while (g.measureText(name).width > 142 && size > 16) { g.font = FONT.replace('{S}', --size); }
      g.fillStyle = '#fff6e0'; g.fillText(name, 18, 162 + j * dy);
      g.font = FONT.replace('{S}', 24); g.textAlign = 'right'; g.fillStyle = '#ffd36b'; g.fillText(String(l.prices?.[name] ?? v.ref), MW - 18, 162 + j * dy);
    });
    g.restore(); menuT.needsUpdate = true;
  }

  // ---- 零件幾何 ----
  const tintAttr = () => new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  const defs = {};
  const mk = (name, geo, mat, { occOnly = false, vacOnly = false, tint = false, shadow = true, business = null } = {}) => {
    const im = new THREE.InstancedMesh(geo, mat, N);
    im.name = 'shop-' + name;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true;
    if (tint) { geo.setAttribute('aTint', tintAttr()); }
    root.add(im); defs[name] = { im, occOnly, vacOnly, tint, business, slots: new Set() }; return im;
  };
  // 牆面、柱、招牌背板（依店色上色）
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }); patchTint(wallMat, 'mul');
  mk('wall', merge([box(0.78, 0.30, 0.05, 0, 0.15, 0.025), box(0.035, 0.37, 0.07, 0.3975, 0.185, 0.035), box(0.035, 0.37, 0.07, -0.3975, 0.185, 0.035),
    box(0.8, 0.17, 0.07, 0, 0.445, 0.035), box(0.86, 0.022, 0.1, 0, 0.545, 0.05)]), wallMat, { tint: true });
  // 深色飾條：窗框、門、菜單燈箱框
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b2a33, roughness: 0.55 });
  mk('trim', merge([box(0.43, 0.016, 0.018, -0.13, 0.272, 0.058), box(0.43, 0.016, 0.018, -0.13, 0.098, 0.058), box(0.016, 0.18, 0.018, -0.345, 0.185, 0.058), box(0.016, 0.18, 0.018, 0.085, 0.185, 0.058),
    box(0.105, 0.245, 0.014, 0.315, 0.1225, 0.056), box(0.135, 0.19, 0.012, 0.185, 0.185, 0.056)]), trimMat);
  // 玻璃（半透明）＋室內暖光
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x20303c, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.38, depthWrite: false });
  mk('glass', box(0.41, 0.17, 0.004, -0.13, 0.185, 0.061), glassMat, { occOnly: true, shadow: false });
  const inMat = new THREE.MeshStandardMaterial({ color: 0xffd9a0, roughness: 0.9, emissive: 0xffc27a, emissiveIntensity: 0.5 });
  const inGeo = new THREE.PlaneGeometry(0.4, 0.17).translate(-0.13, 0.185, 0.0515);
  mk('inside', inGeo, inMat, { occOnly: true, shadow: false });
  // 櫃檯（木）與 A 字黑板腳
  const woodMat = new THREE.MeshStandardMaterial({ color: 0xc79a62, roughness: 0.7 });
  mk('counter', merge([box(0.46, 0.02, 0.1, -0.13, 0.097, 0.1), box(0.44, 0.09, 0.012, -0.13, 0.046, 0.142), box(0.012, 0.18, 0.012, 0.442, 0.09, 0.155), box(0.012, 0.18, 0.012, 0.552, 0.09, 0.155)]), woodMat, { occOnly: true });
  // 杯子（白，固定色）：櫃檯小杯＋招牌上的大杯造型
  const cupW = [cyl(0.05, 0.036, 0.15, 0.0, 0.615, 0.04, 14), new THREE.SphereGeometry(0.053, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0.0, 0.69, 0.04),
    cyl(0.006, 0.006, 0.13, 0.012, 0.76, 0.04, 6).rotateZ(-0.12), cyl(0.012, 0.01, 0.03, -0.26, 0.122, 0.1, 8), cyl(0.012, 0.01, 0.03, -0.2, 0.122, 0.1, 8), cyl(0.012, 0.01, 0.03, -0.14, 0.122, 0.1, 8), box(0.05, 0.04, 0.04, -0.03, 0.12, 0.1)];
  const cupMat = new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.4 });
  mk('cupw', merge(cupW.map(g => g.index ? g : g.toNonIndexed()).map(g => g.index ? g : g)), cupMat, { occOnly: true });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }); patchTint(bandMat, 'mul');
  mk('cupb', cyl(0.0455, 0.0405, 0.05, 0.0, 0.6, 0.04, 14), bandMat, { occOnly: true, tint: true });
  const torus = (r, tube, x, y, z) => new THREE.TorusGeometry(r, tube, 6, 16).translate(x, y, z);
  // 各業態的屋頂立體標誌與窗邊陳設，共用材質及實例化繪製。
  mk('cafe', merge([cyl(0.066, 0.055, 0.12, 0, 0.62, 0.05), torus(0.043, 0.012, 0.074, 0.63, 0.05), cyl(0.087, 0.087, 0.012, 0, 0.555, 0.05), box(0.065, 0.063, 0.045, -0.21, 0.14, 0.092), cyl(0.015, 0.012, 0.025, -0.08, 0.121, 0.12)]), cupMat, { occOnly: true, business: 'cafe' });
  mk('bento', merge([box(0.2, 0.055, 0.13, 0, 0.59, 0.05), box(0.018, 0.025, 0.13, 0, 0.63, 0.05), box(0.2, 0.025, 0.016, 0, 0.63, 0.05), box(0.065, 0.025, 0.045, -0.23, 0.119, 0.1), box(0.065, 0.025, 0.045, -0.13, 0.119, 0.1)]), cupMat, { occOnly: true, business: 'bento' });
  const loaf = (x, y, z, scale) => new THREE.SphereGeometry(1, 12, 8).scale(0.1 * scale, 0.05 * scale, 0.065 * scale).translate(x, y, z);
  mk('bakery', merge([loaf(0, 0.6, 0.05, 1), loaf(-0.25, 0.12, 0.1, 0.22), loaf(-0.18, 0.12, 0.1, 0.22), loaf(-0.11, 0.12, 0.1, 0.22), box(0.3, 0.009, 0.05, -0.17, 0.165, 0.09)]), woodMat, { occOnly: true, business: 'bakery' });
  mk('convenience', merge([box(0.13, 0.12, 0.06, 0, 0.62, 0.05), torus(0.038, 0.009, 0, 0.695, 0.05), box(0.28, 0.009, 0.035, -0.15, 0.16, 0.09), ...[-0.25, -0.19, -0.13, -0.07].map(x => box(0.032, 0.04, 0.02, x, 0.185, 0.09))]), cupMat, { occOnly: true, business: 'convenience' });
  mk('salon', merge([torus(0.034, 0.01, -0.05, 0.59, 0.05), torus(0.034, 0.01, 0.05, 0.59, 0.05), box(0.016, 0.17, 0.022, 0, 0, 0).rotateZ(-0.6).translate(-0.008, 0.68, 0.05), box(0.016, 0.17, 0.022, 0, 0, 0).rotateZ(0.6).translate(0.008, 0.68, 0.05), box(0.06, 0.07, 0.016, -0.25, 0.18, 0.077), box(0.06, 0.07, 0.016, -0.11, 0.18, 0.077), box(0.065, 0.045, 0.055, -0.25, 0.12, 0.12), box(0.065, 0.045, 0.055, -0.11, 0.12, 0.12)]), cupMat, { occOnly: true, business: 'salon' });
  mk('restaurant', merge([cyl(0.079, 0.079, 0.015, 0, 0, 0).rotateX(Math.PI / 2).translate(0, 0.63, 0.06), box(0.012, 0.16, 0.014, -0.11, 0.635, 0.06), ...[-0.13, -0.11, -0.09].map(x => box(0.008, 0.04, 0.014, x, 0.72, 0.06)), box(0.018, 0.18, 0.014, 0.11, 0.64, 0.06), cyl(0.046, 0.046, 0.013, -0.24, 0.125, 0.11), cyl(0.046, 0.046, 0.013, -0.08, 0.125, 0.11)]), cupMat, { occOnly: true, business: 'restaurant' });
  mk('supermarket', merge([box(0.15, 0.065, 0.09, 0, 0.63, 0.05), box(0.012, 0.12, 0.014, -0.08, 0.625, 0.05), box(0.07, 0.014, 0.014, -0.108, 0.68, 0.05), torus(0.014, 0.007, -0.05, 0.575, 0.05), torus(0.014, 0.007, 0.05, 0.575, 0.05), ...[0.14, 0.21].flatMap(y => [box(0.3, 0.009, 0.04, -0.16, y, 0.09), ...[-0.26, -0.2, -0.14, -0.08].map(x => box(0.035, 0.04, 0.024, x, y + 0.025, 0.09))])]), cupMat, { occOnly: true, business: 'supermarket' });
  mk('fitness', merge([box(0.21, 0.018, 0.024, 0, 0.64, 0.05), ...[-0.085, 0.085].map(x => cyl(0.05, 0.05, 0.04, 0, 0, 0).rotateZ(Math.PI / 2).translate(x, 0.64, 0.05)), ...[-0.25, -0.1].flatMap(x => [box(0.07, 0.02, 0.08, x, 0.12, 0.11), box(0.01, 0.065, 0.01, x, 0.155, 0.08), box(0.055, 0.022, 0.02, x, 0.19, 0.08)])]), cupMat, { occOnly: true, business: 'fitness' });
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x658c5b, roughness: 0.9 });
  mk('plants', merge([new THREE.IcosahedronGeometry(0.05, 0).scale(0.7, 1.2, 0.7).translate(-0.43, 0.105, 0.13), new THREE.IcosahedronGeometry(0.05, 0).scale(0.7, 1.2, 0.7).translate(0.43, 0.105, 0.13)]), plantMat, { occOnly: true });
  mk('planters', merge([cyl(0.035, 0.026, 0.06, -0.43, 0.03, 0.13), cyl(0.035, 0.026, 0.06, 0.43, 0.03, 0.13)]), woodMat, { occOnly: true });
  const worksMat = new THREE.MeshStandardMaterial({ color: 0xe6ab4c, roughness: 0.65 });
  mk('works', merge([box(0.026, 0.57, 0.026, -0.43, 0.285, 0.21), box(0.026, 0.57, 0.026, 0.43, 0.285, 0.21), box(0.88, 0.025, 0.025, 0, 0.37, 0.21), box(0.88, 0.025, 0.025, 0, 0.56, 0.21), cyl(0.006, 0.035, 0.09, -0.36, 0.045, 0.34), cyl(0.006, 0.035, 0.09, 0.36, 0.045, 0.34)]), worksMat);
  // 每家店的實際價目表，燈箱與街邊立牌共用圖集。
  const menuMat = new THREE.MeshStandardMaterial({ map: menuT, emissive: 0x000000, roughness: 0.6, side: THREE.DoubleSide }); patchSign(menuMat, glowMenu);
  const menuRect = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const menuGeo = new THREE.PlaneGeometry(0.115, 0.17).translate(0.185, 0.185, 0.0635); menuGeo.setAttribute('aRect', menuRect);
  mk('menu', menuGeo, menuMat, { occOnly: true, shadow: false });
  // 遮陽棚（條紋，染店色）
  const stripeT = stripeTex();
  const awMat = new THREE.MeshStandardMaterial({ map: stripeT, roughness: 0.85, side: THREE.DoubleSide }); patchTint(awMat, 'stripe');
  const slope = new THREE.PlaneGeometry(0.86, 0.16).rotateX(-1.079).translate(0, 0.3075, 0.13);
  const val = new THREE.PlaneGeometry(0.86, 0.034).translate(0, 0.253, 0.2);
  [slope, val].forEach(g => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 6); });
  mk('awning', merge([slope, val]), awMat, { occOnly: true, tint: true });
  const frameGeo = new THREE.PlaneGeometry(0.11, 0.17).rotateX(-0.2).translate(0.497, 0.093, 0.15); frameGeo.setAttribute('aRect', menuRect);
  mk('aframe', frameGeo, menuMat, { occOnly: true });
  // 排隊動線貼地
  const qMat = new THREE.MeshBasicMaterial({ map: queueTex(), transparent: true, depthWrite: false, toneMapped: true, polygonOffset: true, polygonOffsetFactor: -2 });
  mk('queue', new THREE.PlaneGeometry(1.0, 0.125).rotateX(-Math.PI / 2).translate(-0.12, 0.036, 0.1), qMat, { occOnly: true, shadow: false });
  // 夜間門口光暈
  const spillMat = new THREE.MeshBasicMaterial({ map: radialTex(), color: 0xffb870, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  mk('spill', new THREE.PlaneGeometry(1.5, 0.9).rotateX(-Math.PI / 2).translate(-0.05, 0.04, 0.35), spillMat, { occOnly: true, shadow: false });
  // 空店面：捲門
  const shMat = new THREE.MeshStandardMaterial({ map: shutterTex(), roughness: 0.6, metalness: 0.2 });
  mk('shutter', box(0.74, 0.27, 0.012, 0, 0.135, 0.064), shMat, { vacOnly: true });
  // 招牌（圖集）
  const signMat = new THREE.MeshStandardMaterial({ map: atlasTex, emissive: 0x000000, roughness: 0.5 }); patchSign(signMat, glowSign);
  const signGeo = new THREE.PlaneGeometry(0.74, 0.158).translate(0, 0.445, 0.0725);
  const rect = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); signGeo.setAttribute('aRect', rect);
  mk('sign', signGeo, signMat, { shadow: false });
  // 地面光圈（建築中心）
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, toneMapped: false }); patchTint(ringMat, 'mul');
  const ringGeo = new THREE.RingGeometry(0.78, 0.9, 64).rotateX(-Math.PI / 2); ringGeo.setAttribute('aTint', tintAttr());
  const ringIm = new THREE.InstancedMesh(ringGeo, ringMat, N); ringIm.frustumCulled = false; root.add(ringIm);
  const discMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, toneMapped: false, depthWrite: false }); patchTint(discMat, 'mul');
  const discGeo = new THREE.CircleGeometry(0.78, 48).rotateX(-Math.PI / 2); discGeo.setAttribute('aTint', tintAttr());
  const discIm = new THREE.InstancedMesh(discGeo, discMat, N); discIm.frustumCulled = false; root.add(discIm);

  // ---- 每家店的狀態與矩陣 ----
  const lots = specs.map((s, i) => {
    const rot = Math.atan2(s.nx, s.nz);
    const B = new THREE.Matrix4().compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(1, 1, 1));
    const lot = { ...s, i, rot, B, owner: null, name: '', color: null, label: null, queue: 0 };
    lot.door = new THREE.Vector3(0.315, 0, 0.1).applyMatrix4(B);
    lot.qStart = new THREE.Vector3(-0.13, 0, 0).applyMatrix4(B);
    lot.tangent = new THREE.Vector3(1, 0, 0).transformDirection(B);
    // 滑鼠命中盒（局部座標 → 世界）
    lot.inv = B.clone().invert();
    lot.box = new THREE.Box3(new THREE.Vector3(-0.44, 0, -0.02), new THREE.Vector3(0.44, 0.7, 0.3));
    return lot;
  });
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const _m = new THREE.Matrix4(), _c = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  const byId = new Map(lots.map(l => [l.id, l]));
  function refresh(l) {
    const occ = !!l.owner, open = occ && l.status !== 'renovating';
    for (const k in defs) {
      const d = defs[k];
      let vis = d.occOnly ? open : d.vacOnly ? !open : true;
      if (d.business && d.business !== l.businessId) vis = false;
      if (l.businessId !== 'tea' && ['cupw', 'cupb'].includes(k)) vis = false;
      if (k === 'works') vis = occ && !open;
      if (vis) d.slots.add(l.i); else d.slots.delete(l.i);
      d.im.count = d.slots.size ? Math.max(...d.slots) + 1 : 0;
      d.im.visible = d.slots.size > 0;
      d.im.setMatrixAt(l.i, vis ? l.B : ZERO); d.im.instanceMatrix.needsUpdate = true;
    }
    // 染色
    if (occ) _c.set(l.color || '#1f9d5c'); else _c.setRGB(0.55, 0.56, 0.6);
    const wall = occ ? _c.clone().lerp(WHITE, 0.58) : _c;
    const setT = (d, c) => { const a = d.im.geometry.attributes.aTint; a.setXYZ(l.i, c.r, c.g, c.b); a.needsUpdate = true; };
    setT(defs.wall, wall); setT(defs.awning, occ ? _c : WHITE); setT(defs.cupb, _c);
    // 光圈
    _m.makeTranslation(l.bx, 0.075, l.bz); if (!occ) _m.multiply(new THREE.Matrix4().makeScale(0, 0, 0));
    ringIm.setMatrixAt(l.i, _m); discIm.setMatrixAt(l.i, _m); ringIm.instanceMatrix.needsUpdate = discIm.instanceMatrix.needsUpdate = true;
    const count = lots.reduce((n, lot) => lot.owner ? Math.max(n, lot.i + 1) : n, 0);
    ringIm.count = discIm.count = count;
    const rc = new THREE.Color(occ ? OWNER[l.owner]?.ring ?? 0xff5a52 : 0);
    [ringGeo, discGeo].forEach(g => { const a = g.attributes.aTint; a.setXYZ(l.i, rc.r, rc.g, rc.b); a.needsUpdate = true; });
    // 招牌圖集
    const u0 = (l.i % COLS) / COLS, v0 = 1 - (Math.floor(l.i / COLS) + 1) / ROWS;
    rect.setXYZW(l.i, u0, v0, 1 / COLS, 1 / ROWS); rect.needsUpdate = true;
    menuRect.setXYZW(l.i, (l.i % MENU_COLS) / MENU_COLS, 1 - (Math.floor(l.i / MENU_COLS) + 1) / MENU_ROWS, 1 / MENU_COLS, 1 / MENU_ROWS); menuRect.needsUpdate = true;
    drawSign(l.i, l); if (occ) drawMenu(l);
  }
  lots.forEach(refresh);

  return {
    lots, byId,
    setShop(id, cfg) {
      const l = byId.get(id); if (!l) return false;
      if (cfg) { l.owner = cfg.owner === 'player' ? 'player' : 'rival'; l.name = cfg.name ?? l.name ?? ''; l.businessId = cfg.businessId || 'tea'; l.color = cfg.color ?? businessOf(l.businessId).color; l.status = cfg.status || 'open'; l.prices = { ...cfg.prices }; l.assetLevel = cfg.assetLevel || 0; }
      else { l.owner = null; l.name = ''; l.color = null; l.businessId = null; l.status = null; l.prices = {}; l.assetLevel = 0; }
      refresh(l); return true;
    },
    // 0 = 白天、1 = 夜晚：招牌與菜單燈箱加亮、門口光暈
    setNight(n, rainy) {
      glowSign.value = 0.28 + 1.5 * n; glowMenu.value = 0.35 + 1.4 * n;
      inMat.emissiveIntensity = 0.45 + 1.5 * n;
      spillMat.color.setRGB(1, 0.72, 0.44).multiplyScalar(0.02 + 0.55 * n);
      ringMat.opacity = 0.9; discMat.opacity = 0.16 + 0.1 * n;
    },
  };
}
