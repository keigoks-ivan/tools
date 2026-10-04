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

// 玻璃、室內與框料的遮罩共用同一窗洞；紅色為局部遮蔽，綠色為粗糙度。
function facadeWindow(a, rough, normal, wx, wy, ww, wh, r, { historic = false, aluminum = false, mullion = true } = {}) {
  const room = r(), sky = 98 + r() * 22, warm = room > .79;
  a.fillStyle = historic ? '#73766c' : aluminum ? '#89928e' : '#414c4b';
  a.fillRect(wx - 1.6, wy - 1.6, ww + 3.2, wh + 3.2);
  rough.fillStyle = 'rgb(230,164,0)'; rough.fillRect(wx - 1.6, wy - 1.6, ww + 3.2, wh + 3.2);
  const glass = a.createLinearGradient(0, wy, 0, wy + wh);
  glass.addColorStop(0, `rgb(${sky},${sky + 15},${sky + 19})`);
  glass.addColorStop(.42, warm ? '#7b827a' : '#768991');
  glass.addColorStop(.66, warm ? '#57665f' : '#465b62');
  glass.addColorStop(1, room < .18 ? '#2a383a' : '#35494e');
  a.fillStyle = glass; a.fillRect(wx, wy, ww, wh);
  a.save(); a.beginPath(); a.rect(wx, wy, ww, wh); a.clip();
  // 玻璃後方可見頂板、側牆與退後的窗簾；反射只保留柔和天空與對街樓體的輪廓。
  if (room > .28) {
    a.fillStyle = 'rgba(211,210,186,.12)'; a.fillRect(wx, wy + wh * .1, ww, wh * .13);
    a.fillStyle = 'rgba(22,30,29,.16)'; a.fillRect(wx + ww * .12, wy + wh * .24, ww * .73, wh * .63);
    const side = a.createLinearGradient(wx, 0, wx + ww * .25, 0);
    side.addColorStop(0, 'rgba(34,39,34,.23)'); side.addColorStop(1, 'rgba(34,39,34,0)');
    a.fillStyle = side; a.fillRect(wx, wy + wh * .23, ww * .25, wh * .77);
  }
  const curtain = room > .58;
  if (curtain) {
    const side = r() < .5 ? 0 : .54, length = wh * (.48 + r() * .46);
    a.fillStyle = warm ? 'rgba(186,178,155,.7)' : 'rgba(149,154,143,.61)';
    a.fillRect(wx + ww * side + 1.5, wy + 1, ww * .44 - 2, length);
    a.strokeStyle = 'rgba(40,44,37,.15)'; a.lineWidth = .6;
    for (let u = wx + ww * side + 3; u < wx + ww * (side + .44) - 1; u += 2.8) {
      a.beginPath(); a.moveTo(u, wy + 1); a.lineTo(u, wy + length); a.stroke();
    }
  }
  const reflectedWall = a.createLinearGradient(wx, 0, wx + ww, 0);
  reflectedWall.addColorStop(0, 'rgba(176,180,172,.08)');
  reflectedWall.addColorStop(.46, 'rgba(176,180,172,.17)');
  reflectedWall.addColorStop(.51, 'rgba(39,56,62,.08)');
  reflectedWall.addColorStop(1, 'rgba(176,180,172,.02)');
  a.fillStyle = reflectedWall; a.fillRect(wx, wy + wh * .48, ww, wh * .52);
  a.fillStyle = 'rgba(203,213,211,.13)'; a.fillRect(wx, wy + wh * .32, ww, wh * .032);
  // 窗框附近的接觸陰影固定在窗內，玻璃中央仍接收環境光。
  const shade = a.createLinearGradient(0, wy, 0, wy + wh * .14);
  shade.addColorStop(0, 'rgba(15,20,18,.38)'); shade.addColorStop(1, 'rgba(15,20,18,0)');
  a.fillStyle = shade; a.fillRect(wx, wy, ww, wh * .14);
  a.strokeStyle = 'rgba(21,29,26,.27)'; a.lineWidth = 1.2; a.strokeRect(wx + .6, wy + .6, ww - 1.2, wh - 1.2);
  a.restore();
  rough.fillStyle = `rgb(239,${45 + Math.floor(r() * 13)},0)`; rough.fillRect(wx, wy, ww, wh);
  rough.fillStyle = 'rgb(190,54,0)'; rough.fillRect(wx, wy, ww, 1.2);
  normal.fillStyle = 'rgb(128,128,255)'; normal.fillRect(wx, wy, ww, wh);
  const frame = historic ? '#62685e' : aluminum ? '#adb5b1' : '#4f5c59';
  const line = (x, y, w, h) => {
    a.fillStyle = frame; a.fillRect(x, y, w, h);
    a.fillStyle = 'rgba(213,218,207,.28)'; a.fillRect(x, y, w > h ? w : .35, w > h ? .35 : h);
    rough.fillStyle = 'rgb(235,152,0)'; rough.fillRect(x, y, w, h);
    normal.fillStyle = w > h ? 'rgb(128,138,254)' : 'rgb(138,128,254)'; normal.fillRect(x, y, w, h);
  };
  if (mullion) line(wx + ww / 2 - .6, wy, 1.2, wh);
  if (historic) line(wx, wy + wh * .25 - .6, ww, 1.2);
  a.fillStyle = 'rgba(204,215,208,.42)'; a.fillRect(wx - 1.1, wy - 1.1, ww + 2.2, .55);
  normal.fillStyle = 'rgb(118,128,254)'; normal.fillRect(wx - 1.6, wy, 1.3, wh);
  normal.fillStyle = 'rgb(138,128,254)'; normal.fillRect(wx + ww + .3, wy, 1.3, wh);
  normal.fillStyle = 'rgb(128,138,254)'; normal.fillRect(wx - 1.6, wy - 1.6, ww + 3.2, 1.3);
  normal.fillStyle = 'rgb(128,118,254)'; normal.fillRect(wx - 1.6, wy + wh + .3, ww + 3.2, 1.3);
}

// 512px 神戶立面：舊居留地石造商樓、混凝土住宅、磁磚公寓，共用六開間／六層 UV。
// 窗洞位置維持 recessedFacade 的 3.4m 開間；每層石材、框料、窗內遮蔽一同生成。
export function japaneseFacade(style, scan) {
  if(style<2)return officeFacade(style);
  const S = 512, cell = S / 6, r = rng(301 + style);
  const [c, a] = canvas(S, S), [rc, rough] = canvas(S, S), [nc, normal] = canvas(S, S);
  const historic = style === 2;
  a.fillStyle = ['#b4ae9f', '#b9beb9', '#aaa597'][style - 2]; a.fillRect(0, 0, S, S);
  if (scan) {
    a.globalAlpha = historic ? .1 : .045;
    for (let y = 0; y < S; y += 128) for (let x = 0; x < S; x += 128) a.drawImage(scan, 520, 8, 496, 496, x, y, 128, 128);
    a.globalAlpha = 1;
  }
  rough.fillStyle = style === 4 ? 'rgb(255,174,0)' : 'rgb(255,211,0)'; rough.fillRect(0, 0, S, S);
  normal.fillStyle = 'rgb(128,128,255)'; normal.fillRect(0, 0, S, S);
  if (historic || style === 4) {
    // 石材／磁磚接縫的陰影與法線一同繪製，不能沿用舊磚牆法線。
    const h = historic ? cell / 6 : 1.5, w = historic ? cell / 2 : 5.7;
    // 小口磁磚只畫 20×20 個，再以 Canvas pattern 鋪滿；不為 3 萬塊磁磚重複發出繪圖指令。
    const patches = historic ? null : [canvas(114,30),canvas(114,30),canvas(114,30)];
    const [stone, grit, relief] = patches ? patches.map(p=>p[1]) : [a,rough,normal];
    const width = historic ? S : 114, height = historic ? S : 30;
    if (patches) {
      grit.fillStyle='rgb(255,174,0)';grit.fillRect(0,0,width,height);
      relief.fillStyle='rgb(128,128,255)';relief.fillRect(0,0,width,height);
    }
    for (let j = 0; j * h < height; j++) for (let x = -w; x < width; x += w) {
      const u = x + (j % 2 ? w / 2 : 0), y = j * h;
      const tone = r();
      stone.fillStyle = `rgba(${tone < .5 ? '57,53,42' : '237,231,211'},${historic ? .025 + tone * .09 : .02 + tone * .08})`;
      stone.fillRect(u + .25, y + .25, w - .5, h - .5);
      stone.strokeStyle = historic ? 'rgba(67,64,52,.2)' : 'rgba(75,74,62,.32)';
      stone.lineWidth = historic ? .7 : .33; stone.strokeRect(u, y, w, h);
      stone.fillStyle = historic ? 'rgba(239,233,212,.21)' : 'rgba(239,235,218,.14)'; stone.fillRect(u + .45, y + .45, w - .9, historic ? .45 : .2);
      grit.fillStyle = `rgb(255,${Math.round(historic ? 203 + tone * 23 : 158 + tone * 32)},0)`;
      grit.fillRect(u + .3, y + .3, w - .6, h - .6);
      relief.fillStyle = 'rgb(128,134,254)'; relief.fillRect(u, y, w, historic ? .65 : .33);
      relief.fillStyle = 'rgb(134,128,254)'; relief.fillRect(u, y, historic ? .65 : .33, h);
    }
    if (patches) [a,rough,normal].forEach((ctx,i)=>{ctx.fillStyle=ctx.createPattern(patches[i][0],'repeat');ctx.fillRect(0,0,S,S);});
  }
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
    const x = i * cell, y = j * cell, ww = cell * (historic ? .46 : .64), wh = cell * (historic ? .7 : .6);
    const wx = x + (cell - ww) / 2, wy = y + cell * (historic ? .12 : .18);
    if (historic) {
      a.fillStyle = '#c7bfac'; a.fillRect(wx - 4.1, wy - 3.3, ww + 8.2, wh + 7.1);
      a.strokeStyle = 'rgba(61,60,48,.19)'; a.lineWidth = .6; a.strokeRect(wx - 4.1, wy - 3.3, ww + 8.2, wh + 7.1);
      a.fillStyle = 'rgba(240,232,211,.41)'; a.fillRect(wx - 3.5, wy - 2.8, ww + 7, .8);
      a.fillStyle = '#989481'; a.fillRect(wx - 4.7, wy + wh + 3.4, ww + 9.4, 1.3);
    }
    if(style===3) {
      a.fillStyle = `rgba(${r() < .5 ? '32,43,36' : '241,242,230'},${.01 + r() * .055})`; a.fillRect(x + 1, y + 1, cell - 2, cell - 2);
      a.strokeStyle = 'rgba(54,63,56,.24)'; a.lineWidth = .8; a.strokeRect(x + .4, y + .4, cell - .8, cell - .8);
      a.strokeStyle = 'rgba(231,235,225,.32)'; a.lineWidth = .6; a.strokeRect(x + 1.2, y + 1.2, cell - 2.4, cell - 2.4);
      normal.fillStyle = 'rgb(128,134,254)'; normal.fillRect(x, y, cell, .8);
      normal.fillStyle = 'rgb(134,128,254)'; normal.fillRect(x, y, .8, cell);
    }
    facadeWindow(a, rough, normal, wx, wy, ww, wh, r, { historic, aluminum: style === 4 });
    a.fillStyle = historic ? '#c9c1af' : '#b2b6ac'; a.fillRect(wx - 2.2, wy + wh + 1.7, ww + 4.4, 1.1);
    a.fillStyle = 'rgba(32,39,32,.21)'; a.fillRect(wx - 2, wy + wh + 2.8, ww + 4, .8);
    if (historic) {
      a.fillStyle = '#c7bfac'; a.fillRect(wx + ww / 2 - 2.6, wy - 4, 5.2, 3);
      a.fillStyle = 'rgba(69,66,53,.17)'; a.fillRect(x, y + cell - 2.3, cell, .8);
      a.fillStyle = 'rgba(226,218,196,.21)'; a.fillRect(x, y + cell - 1.5, cell, .65);
    }
  }
  // 雨水痕只從窗台下緣延伸，避免大片隨機污漬蓋過石材與玻璃。
  for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) if (r() < .46) {
    const y = j * cell + cell * (historic ? .85 : .80), x = (i + .22 + r() * .55) * cell;
    const wet = a.createLinearGradient(0, y, 0, y + cell * .16);
    wet.addColorStop(0, 'rgba(44,47,35,.07)'); wet.addColorStop(1, 'rgba(44,47,35,0)');
    a.fillStyle = wet; a.fillRect(x, y, .7 + r() * 1.5, cell * .16);
  }
  grain(a, S, S, historic ? 4 : 2, r);
  return [tex(c), tex(nc, false), tex(rc, false)].map((t, i) => { t.name = 'city-japanese-' + style + '-' + i; return t; });
}

function officeFacade(style) {
  const S=512,cols=style===0?16:12,rows=style===0?10:8,cw=S/cols,ch=S/rows,r=rng(823+style);
  const [c,a]=canvas(S,S),[rc,rough]=canvas(S,S),[nc,normal]=canvas(S,S);
  a.fillStyle=style===0?'#626e70':'#aaafa7';a.fillRect(0,0,S,S);
  rough.fillStyle=style===0?'rgb(255,148,0)':'rgb(255,206,0)';rough.fillRect(0,0,S,S);
  normal.fillStyle='rgb(128,128,255)';normal.fillRect(0,0,S,S);
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++) {
    const x=i*cw,y=j*ch,wx=x+cw*(style===0?.045:.12),wy=y+ch*(style===0?.035:.14),ww=cw*(style===0?.91:.76),wh=ch*(style===0?.73:.65);
    if(style===0) {
      // 幕牆樓板前的背漆玻璃比視窗粗糙；細金屬立梃保持 36m/16 開間尺度。
      const tone=86+Math.floor(r()*12);a.fillStyle=`rgb(${tone-3},${tone+8},${tone+10})`;a.fillRect(x+.5,y+ch*.80,cw-1,ch*.20);
      a.fillStyle='rgba(29,40,41,.3)';a.fillRect(x,y+ch*.79,cw,.7);
      a.fillStyle='#9aa4a0';a.fillRect(x,y,.65,ch);a.fillRect(x,y+ch-.8,cw,.55);
      rough.fillStyle='rgb(248,128,0)';rough.fillRect(x+.6,y+ch*.80,cw-1.2,ch*.18);
      normal.fillStyle='rgb(135,128,254)';normal.fillRect(x,y,.6,ch);
    } else {
      a.fillStyle=`rgba(${r()<.5?'37,43,37':'234,236,220'},${.02+r()*.055})`;a.fillRect(x+.7,y+.7,cw-1.4,ch-1.4);
      a.strokeStyle='rgba(48,58,52,.22)';a.lineWidth=.65;a.strokeRect(x+.3,y+.3,cw-.6,ch-.6);
      a.strokeStyle='rgba(219,224,208,.25)';a.lineWidth=.5;a.strokeRect(x+1.1,y+1.1,cw-2.2,ch-2.2);
      normal.fillStyle='rgb(128,135,254)';normal.fillRect(x,y,cw,.7);
      normal.fillStyle='rgb(135,128,254)';normal.fillRect(x,y,.7,ch);
    }
    facadeWindow(a,rough,normal,wx,wy,ww,wh,r,{aluminum:style===0,mullion:style!==0});
    if(style===1) {
      a.fillStyle='#b9bcb0';a.fillRect(wx-1.6,wy+wh+1.2,ww+3.2,1);
      a.fillStyle='rgba(36,44,38,.2)';a.fillRect(wx-1,wy+wh+2.2,ww+2,.7);
    }
  }
  grain(a,S,S,2,r);
  return [tex(c),tex(nc,false),tex(rc,false)].map((t,i)=>{t.name='city-japanese-'+style+'-'+i;return t;});
}

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

// ---------- 軍用噴漆標示圖集（敵機、載具共用；一張 1024² 只畫一次）----------
// 白字（顏色在 shader 裡依 tint 決定）＋少數預先上色的條紋／警告三角。cells：[x, y, w, h]（像素，原點左上）。
export const STENCIL = {
  size: 1024,
  cells: {
    agx9: [0, 0, 512, 128], hound: [512, 0, 512, 128], caution: [0, 128, 512, 128], nostep: [512, 128, 512, 128],
    danger: [0, 256, 512, 128], hyd: [512, 256, 512, 64], fuel: [512, 320, 512, 64],
    d0: [0, 384, 96, 192],   // 數字 0–9 橫排，每格 96 寬
    hazard: [0, 576, 512, 64], redwhite: [0, 640, 512, 64], warn: [512, 576, 128, 128], lift: [640, 576, 128, 128], rescue: [768, 576, 256, 128],
    star: [0, 704, 128, 128], chev: [128, 704, 128, 128], emblem: [256, 704, 128, 128], roundel: [384, 704, 128, 128],
    ammo: [512, 704, 512, 64], intake: [512, 768, 512, 64], rotor: [0, 832, 512, 64], ground: [512, 832, 512, 64],
    xg01: [0, 896, 512, 64], tow: [512, 896, 512, 64], agx9c: [0, 960, 512, 64], agx9h: [512, 960, 512, 64],
  },
};
let _stencil = null;
export function stencilAtlas() {
  if (_stencil) return _stencil;
  const S = STENCIL.size, C = STENCIL.cells;
  const r = rng(909);
  const [c, x] = canvas(S, S);
  x.clearRect(0, 0, S, S);
  const FONT = '"Arial Narrow","Roboto Condensed","Helvetica Neue",Arial,sans-serif';
  // 置中單行字：量寬度後水平壓縮塞進格子
  const text = (cell, str, px, y = 0.5, pad = 0.06) => {
    const [cx, cy, cw, ch] = C[cell];
    x.save();
    x.font = `700 ${px}px ${FONT}`;
    x.textBaseline = 'middle'; x.textAlign = 'center';
    const w = x.measureText(str).width, k = Math.min(1, (cw * (1 - pad * 2)) / w);
    x.translate(cx + cw / 2, cy + ch * y);
    x.scale(k, 1);
    x.fillStyle = '#fff';
    x.fillText(str, 0, 0);
    x.restore();
  };
  text('agx9', 'AGX-9', 118);
  text('hound', 'HOUND', 112);
  text('caution', 'CAUTION', 92, 0.42);
  { const [cx, cy, cw] = C.caution; x.fillStyle = '#fff'; x.fillRect(cx + 40, cy + 100, cw - 80, 10); }
  { const [cx, cy, cw, ch] = C.nostep; x.strokeStyle = '#fff'; x.lineWidth = 7; x.strokeRect(cx + 10, cy + 10, cw - 20, ch - 20); }
  text('nostep', 'NO STEP', 86, 0.52, 0.12);
  text('danger', 'DANGER', 80, 0.36); text('danger', 'EXHAUST BLAST AREA', 34, 0.8);
  text('hyd', 'HYD 21 MPa  -  INSPECT BEFORE SORTIE', 40);
  text('fuel', 'FUEL  JP-8  -  NO SMOKING', 40);
  for (let i = 0; i < 10; i++) {
    const [, cy] = C.d0;
    x.save();
    x.font = `700 176px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'center';
    const k = Math.min(1, 84 / x.measureText(String(i)).width);
    x.translate(i * 96 + 48, cy + 100); x.scale(k, 1);
    x.fillStyle = '#fff'; x.fillText(String(i), 0, 0);
    x.restore();
  }
  // 預先上色：黃黑警示條紋、紅白條紋
  const stripes = (cell, a, b, n) => {
    const [cx, cy, cw, ch] = C[cell];
    x.save(); x.beginPath(); x.rect(cx, cy, cw, ch); x.clip();
    x.fillStyle = a; x.fillRect(cx, cy, cw, ch);
    x.fillStyle = b;
    const step = cw / n;
    for (let i = -2; i < n + 2; i++) { x.beginPath(); x.moveTo(cx + i * step, cy + ch); x.lineTo(cx + i * step + step / 2, cy + ch); x.lineTo(cx + i * step + step / 2 + ch, cy); x.lineTo(cx + i * step + ch, cy); x.fill(); }
    x.restore();
  };
  stripes('hazard', '#c99a1c', '#141414', 9);
  stripes('redwhite', '#d8d4c8', '#9a1c18', 9);
  { // 警告三角（黃底黑框驚嘆號）
    const [cx, cy] = C.warn;
    x.fillStyle = '#c99a1c'; x.strokeStyle = '#141414'; x.lineWidth = 9;
    x.beginPath(); x.moveTo(cx + 64, cy + 12); x.lineTo(cx + 118, cy + 112); x.lineTo(cx + 10, cy + 112); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#141414'; x.fillRect(cx + 58, cy + 44, 12, 38); x.fillRect(cx + 58, cy + 90, 12, 12);
  }
  { // 吊掛點：圓環＋箭頭
    const [cx, cy] = C.lift;
    x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.arc(cx + 64, cy + 48, 26, 0, 7); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx + 40, cy + 84); x.lineTo(cx + 88, cy + 84); x.lineTo(cx + 64, cy + 120); x.fill();
  }
  { // RESCUE 箭頭（字挖空）
    const [cx, cy, cw, ch] = C.rescue;
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(cx + 20, cy + 64); x.lineTo(cx + 70, cy + 20); x.lineTo(cx + 70, cy + 40); x.lineTo(cx + 240, cy + 40); x.lineTo(cx + 240, cy + 88); x.lineTo(cx + 70, cy + 88); x.lineTo(cx + 70, cy + 108); x.fill();
    x.globalCompositeOperation = 'destination-out';
    x.save(); x.font = `700 38px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText('RESCUE', cx + cw * 0.6, cy + ch / 2 + 1); x.restore();
    x.globalCompositeOperation = 'source-over';
  }
  { // 星徽（圓環內五角星）
    const [cx, cy] = C.star;
    x.strokeStyle = '#fff'; x.lineWidth = 8; x.beginPath(); x.arc(cx + 64, cy + 64, 54, 0, 7); x.stroke();
    x.fillStyle = '#fff'; x.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 18 : 44; x.lineTo(cx + 64 + Math.cos(a) * rr, cy + 64 + Math.sin(a) * rr); }
    x.fill();
  }
  { // 雙 V 階級章
    const [cx, cy] = C.chev;
    x.fillStyle = '#fff';
    for (const dy of [18, 60]) { x.beginPath(); x.moveTo(cx + 10, cy + dy); x.lineTo(cx + 64, cy + dy + 32); x.lineTo(cx + 118, cy + dy); x.lineTo(cx + 118, cy + dy + 20); x.lineTo(cx + 64, cy + dy + 52); x.lineTo(cx + 10, cy + dy + 20); x.fill(); }
  }
  { // 部隊徽：盾形外框＋獵犬牙 V
    const [cx, cy] = C.emblem;
    const shield = (i) => { x.beginPath(); x.moveTo(cx + 14 + i, cy + 10 + i); x.lineTo(cx + 114 - i, cy + 10 + i); x.lineTo(cx + 114 - i, cy + 70); x.quadraticCurveTo(cx + 110 - i, cy + 106 - i * 0.5, cx + 64, cy + 122 - i); x.quadraticCurveTo(cx + 18 + i, cy + 106 - i * 0.5, cx + 14 + i, cy + 70); x.closePath(); x.fill(); };
    x.fillStyle = '#fff'; shield(0);
    x.globalCompositeOperation = 'destination-out'; shield(10);
    x.globalCompositeOperation = 'source-over';
    x.beginPath(); x.moveTo(cx + 30, cy + 32); x.lineTo(cx + 64, cy + 92); x.lineTo(cx + 98, cy + 32); x.lineTo(cx + 83, cy + 32); x.lineTo(cx + 64, cy + 66); x.lineTo(cx + 45, cy + 32); x.fill();
  }
  { // 圓形國籍標誌（外環＋實心圓心）
    const [cx, cy] = C.roundel;
    x.strokeStyle = '#fff'; x.lineWidth = 14; x.beginPath(); x.arc(cx + 64, cy + 64, 50, 0, 7); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(cx + 64, cy + 64, 20, 0, 7); x.fill();
  }
  text('ammo', 'AMMO  20 MM  HE-I  -  HANDLE WITH CARE', 38);
  text('intake', 'DANGER  -  INTAKE  -  KEEP CLEAR', 44);
  text('rotor', 'DANGER  -  KEEP CLEAR OF ROTOR', 42);
  text('ground', 'GROUND HERE  -  STATIC', 40);
  text('xg01', 'XG-01  AZURE FLAME', 44);
  text('tow', 'TOW  -  MAX 60 t', 42);
  text('agx9c', 'AGX-9C  COMMAND  UNIT', 42);
  text('agx9h', 'AGX-9H  HEAVY  ASSAULT', 42);
  // 噴漆磨損：隨機小孔只降 alpha，字與條紋一起斑駁
  const img = x.getImageData(0, 0, S, S), d = img.data;
  for (let k = 0; k < 9000; k++) {
    const px = (r() * S) | 0, py = (r() * S) | 0, rad = 1 + ((r() * r() * 5) | 0);
    for (let j = -rad; j <= rad; j++) for (let i = -rad; i <= rad; i++) {
      if (i * i + j * j > rad * rad) continue;
      const X = px + i, Y = py + j;
      if (X < 0 || Y < 0 || X >= S || Y >= S) continue;
      const p = (Y * S + X) * 4 + 3;
      d[p] = d[p] * (0.15 + r() * 0.5);
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  _stencil = t;
  return t;
}
// 圖集格子 → UV 矩形 [u0, v0, u1, v1]（CanvasTexture 預設 flipY，所以 v 從下往上）；digit＝數字格往右第幾格
export function stencilUV(cell, digit = 0) {
  const [cx, cy, cw, ch] = STENCIL.cells[cell], S = STENCIL.size, ox = digit * 96;
  return [(cx + ox) / S, 1 - (cy + ch) / S, (cx + ox + cw) / S, 1 - cy / S];
}

// ---------- 真實照片細節貼圖（CC0，Poly Haven；來源見 assets/CREDITS.md），給機體與載具的三面投影用 ----------
//   mech_paint：R 漆面明暗細節、G 粗糙度、B 鏽斑遮罩
//   路徑相對於本模組，別的頁面匯入 mechs.js 也找得到。
let _det = null;
export function detailMaps() {
  if (_det) return _det;
  const L = new THREE.TextureLoader();
  const ld = (n) => {
    const t = L.load(new URL('./assets/' + n, import.meta.url).href);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  _det = { paint: ld('mech_paint.jpg') };
  return _det;
}
