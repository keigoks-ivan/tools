// 日本街景與地標的靜態幾何。呼叫端合併到既有材質桶；不建立燈光或逐格動畫。
const stone = [.64, .66, .62, 0, 1], steel = [.17, .21, .22, 0, 2];
const vermilion = [.63, .12, .045, 0, 6], ivory = [.78, .79, .72, 0, 6];
const wood = [.28, .21, .15, 0, 5], tile = [.16, .21, .23, 0, 3], glass = [.1, .19, .23, 0, 4];

export function japaneseScenery(out, { tower = null, shrine = null, streets = [], arcade = null, maritime = null } = {}) {
  const box = (...args) => out.box(...args);
  const face = (a, b, c, d, color) => out.face(a, b, c, d, color);
  function beam(a, b, r, color, sides = 6) {
    const d = b.map((v, i) => v - a[i]), length = Math.hypot(...d);
    if (length < .001) return;
    const n = d.map(v => v / length), ref = Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0];
    const u = [n[1] * ref[2] - n[2] * ref[1], n[2] * ref[0] - n[0] * ref[2], n[0] * ref[1] - n[1] * ref[0]];
    const ul = Math.hypot(...u); for (let i = 0; i < 3; i++) u[i] /= ul;
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const at = (p, t) => p.map((q, i) => q + r * (u[i] * Math.cos(t) + v[i] * Math.sin(t)));
    for (let i = 0; i < sides; i++) {
      const t = i / sides * Math.PI * 2, q = (i + 1) / sides * Math.PI * 2;
      face(at(a, t), at(a, q), at(b, q), at(b, t), color);
    }
  }
  function sign(x, y, z, w, h, id, ry = 0) {
    const at = (u, v) => [x + u * Math.cos(ry), y + v, z - u * Math.sin(ry)];
    out.sign([at(-w / 2, -h / 2), at(w / 2, -h / 2), at(w / 2, h / 2), at(-w / 2, h / 2)], id);
  }
  const solid = (x0, x1, y0, y1, z0, z1) => out.solid?.({ x0, x1, y0, y1, z0, z1 });

  if (tower) {
    const [x, z, scale = 1, ground = 0] = tower;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    const radius = y => 14 * Math.sqrt(1 - 3 * (y / 100) + 3 * (y / 100) ** 2);
    const red = [.62, .045, .028, 0, 6];
    // 神戶港塔：兩組各十六根直線鋼管構成鼓形曲面，而非堆疊圓筒。
    for (let i = 0; i < 16; i++) for (const dir of [-1, 1]) {
      const a = i / 16 * Math.PI * 2, t = a + dir * Math.PI * 2 / 3;
      beam(P(Math.cos(a) * 14, 0, Math.sin(a) * 14), P(Math.cos(t) * 14, 100, Math.sin(t) * 14), .22 * scale, red, 8);
    }
    for (let y = 8; y <= 100; y += 8) {
      const r = radius(y);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, t = (i + 1) / 16 * Math.PI * 2;
        beam(P(Math.cos(a) * r, y, Math.sin(a) * r), P(Math.cos(t) * r, y, Math.sin(t) * r), .10 * scale, red, 4);
      }
    }
    function drum(r, y0, y1, color, segments = 32) {
      for (let i = 0; i < segments; i++) {
        const a = i / segments * Math.PI * 2, t = (i + 1) / segments * Math.PI * 2;
        face(P(Math.cos(a) * r, y0, Math.sin(a) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), P(Math.cos(t) * r, y1, Math.sin(t) * r), P(Math.cos(t) * r, y0, Math.sin(t) * r), color);
        if (y1 === 11 || y1 === 100) face(P(0, y1, 0), P(Math.cos(t) * r, y1, Math.sin(t) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), P(Math.cos(a) * r, y1, Math.sin(a) * r), color);
      }
    }
    drum(3.1, 0, 74, ivory, 16);
    drum(12.2, 0, 11, ivory);
    for (const y of [0, 3.2, 6.5, 10.8]) drum(12.7, y, y + .28, stone);
    // 五層觀景台、窗框、樓板邊與屋頂玻璃欄杆。
    for (const y of [74, 79, 84, 89, 94]) {
      drum(12.2, y, y + .4, ivory); drum(11.9, y + .4, y + 4.2, glass); drum(12.2, y + 4.2, y + 4.6, ivory);
      for (let i = 0; i < 28; i++) {
        const a = i / 28 * Math.PI * 2;
        beam(P(Math.cos(a) * 12, y + .4, Math.sin(a) * 12), P(Math.cos(a) * 12, y + 4.2, Math.sin(a) * 12), .065 * scale, ivory, 4);
      }
    }
    drum(12.6, 99, 100, red); drum(11.8, 100, 102, glass); drum(12.1, 102, 102.2, steel);
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      beam(P(Math.cos(a) * 14, 100, Math.sin(a) * 14), P(Math.cos(a) * 13.5, 108, Math.sin(a) * 13.5), .16 * scale, red);
      const cx = x + Math.cos(a) * 14 * scale, cz = z + Math.sin(a) * 14 * scale;
      box(cx - .5 * scale, cx + .5 * scale, ground, ground + .6 * scale, cz - .5 * scale, cz + .5 * scale, stone);
    }
    solid(x - 12.7 * scale, x + 12.7 * scale, ground, ground + 11 * scale, z - 12.7 * scale, z + 12.7 * scale);
    sign(x, ground + 6 * scale, z - 12.73 * scale, 7 * scale, 1.8 * scale, 4, Math.PI);
  }

  if (arcade) {
    const [x0, x1, z, width = 8, ground = 0] = arcade;
    const P = (x, t) => [x, ground + 5.1 + Math.sin(t) * 1.5, z - Math.cos(t) * width / 2];
    for (let j = 0; j < 10; j++) {
      const a = j / 10 * Math.PI, c = (j + 1) / 10 * Math.PI;
      face(P(x0, a), P(x0, c), P(x1, c), P(x1, a), [.36, .43, .42, 0, 4]);
      beam(P(x0, a), P(x1, a), .045, ivory);
    }
    for (let x = x0; x <= x1 + .01; x += (x1 - x0) / 7) {
      for (let j = 0; j < 10; j++) beam(P(x, j / 10 * Math.PI), P(x, (j + 1) / 10 * Math.PI), .065, ivory);
      for (const side of [-1, 1]) { beam([x, ground, z + side * width / 2], [x, ground + 5.1, z + side * width / 2], .09, steel); solid(x - .09, x + .09, ground, ground + 5.1, z + side * width / 2 - .09, z + side * width / 2 + .09); }
    }
    sign(x0 - .04, ground + 5.4, z, 3.2, .75, 2, -Math.PI / 2);
    sign(x1 + .04, ground + 5.4, z, 3.2, .75, 2, Math.PI / 2);
  }

  if (maritime) {
    const [x, z, scale = 1, ground = 0] = maritime;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    box(x - 21 * scale, x + 21 * scale, ground, ground + 5 * scale, z - 15 * scale, z + 15 * scale, ivory);
    solid(x - 21 * scale, x + 21 * scale, ground, ground + 5 * scale, z - 15 * scale, z + 15 * scale);
    // 海洋博物館式的白色帆形空間桁架，稜線和橫向支撐均為實際鋼管。
    for (let i = 0; i <= 12; i++) {
      const v = -16 + i * 32 / 12, top = 7 + 22 * Math.sin((i / 12) * Math.PI * .75), apex = P(-8 + i * .85, top, v);
      const a = P(-24, 5.2, v), b = P(24, 5.2, v);
      beam(a, apex, .13 * scale, ivory); beam(apex, b, .13 * scale, ivory); beam(a, b, .09 * scale, ivory);
      if (i > 0) for (let j = 0; j <= 8; j++) {
        const t = j / 8, previousTop = 7 + 22 * Math.sin(((i - 1) / 12) * Math.PI * .75), previousX = -8 + (i - 1) * .85;
        for (const edge of [-24, 24]) beam(P(edge + (-8 + i * .85 - edge) * t, 5.2 + (top - 5.2) * t, v), P(edge + (previousX - edge) * t, 5.2 + (previousTop - 5.2) * t, v - 32 / 12), .065 * scale, ivory);
      }
    }
    for (let u = -18; u < 18; u += 4) {
      face(P(u, .8, -15.02), P(u, 4.2, -15.02), P(u + 3.6, 4.2, -15.02), P(u + 3.6, .8, -15.02), glass);
      beam(P(u, .8, -15.06), P(u, 4.3, -15.06), .08 * scale, steel);
    }
  }

  if (shrine) {
    const [x, z, scale = 1, ground = 0] = shrine;
    const P = (u, y, v) => [x + u * scale, ground + y * scale, z + v * scale];
    const B = (a, b, c, d, e, f, col) => box(x + a * scale, x + b * scale, ground + c * scale, ground + d * scale, z + e * scale, z + f * scale, col);
    for (const sx of [-1, 1]) {
      B(sx * 2.7 - .42, sx * 2.7 + .42, 0, .22, -.5, .5, stone);
      beam(P(sx * 2.7, .2, 0), P(sx * 2.45, 4.4, 0), .23 * scale, vermilion, 10);
      B(sx * 2.7 - .28, sx * 2.7 + .28, .2, .55, -.29, .29, tile);
    }
    B(-3.2, 3.2, 3.35, 3.58, -.15, .15, vermilion);
    B(-.12, .12, 3.58, 4.5, -.16, .16, vermilion);
    // 笠木向兩端微微上翹，避免鳥居變成兩根方柱加平板。
    for (let i = 0; i < 8; i++) {
      const a = -3.65 + i * .9125, b = a + .9125, ya = 4.45 + .3 * (a / 3.65) ** 2, yb = 4.45 + .3 * (b / 3.65) ** 2;
      const pts = [P(a, ya, -.28), P(b, yb, -.28), P(b, yb + .2, -.28), P(a, ya + .2, -.28)];
      face(...pts.slice().reverse(), vermilion); face(P(a, ya + .2, -.28), P(b, yb + .2, -.28), P(b, yb + .2, .28), P(a, ya + .2, .28), tile);
      face(P(a, ya, .28), P(b, yb, .28), P(b, yb + .2, .28), P(a, ya + .2, .28), vermilion);
    }
    sign(x, ground + 3.98 * scale, z - .19 * scale, .76 * scale, .6 * scale, 3, Math.PI);
    for (let v = 1; v < 8; v += .8) B(-1.3, 1.3, .005, .025, v, v + .74, stone);
    // 參道兩旁石燈籠：基座、細柱、透空燈室、檐蓋與頂飾。
    for (const sx of [-1, 1]) for (const v of [3.2, 6.5]) {
      const u = sx * 2.2;
      B(u - .44, u + .44, 0, .18, v - .44, v + .44, stone);
      B(u - .19, u + .19, .18, 1.06, v - .19, v + .19, stone);
      B(u - .36, u + .36, 1.06, 1.19, v - .36, v + .36, stone);
      for (const dx of [-.28, .28]) for (const dz of [-.28, .28]) B(u + dx - .06, u + dx + .06, 1.19, 1.63, v + dz - .06, v + dz + .06, stone);
      B(u - .46, u + .46, 1.63, 1.79, v - .46, v + .46, stone);
      B(u - .16, u + .16, 1.79, 1.96, v - .16, v + .16, stone);
    }
    B(-2.8, 2.8, 0, .35, 8.3, 12.3, stone);
    B(-2.5, 2.5, .35, 3.55, 8.6, 12, wood);
    solid(x - 2.8 * scale, x + 2.8 * scale, ground, ground + 3.55 * scale, z + 8.3 * scale, z + 12.3 * scale);
    B(-1.35, 1.35, .45, 3.2, 8.53, 8.58, tile);
    for (let u = -1.28; u <= 1.3; u += .2) B(u, u + .045, .45, 3.2, 8.46, 8.53, wood);
    for (const u of [-2.38, 2.38]) B(u - .14, u + .14, .35, 3.8, 8.4, 8.65, wood);
    B(-3.35, 3.35, 3.38, 3.53, 7.85, 12.75, wood);
    const profile = [[-3.4, 3.65], [-2.7, 3.57], [-1.5, 4.28], [0, 4.8], [1.5, 4.28], [2.7, 3.57], [3.4, 3.65]];
    for (let i = 1; i < profile.length; i++) {
      const [a, ya] = profile[i - 1], [b, yb] = profile[i];
      face(P(a, ya, 7.8), P(a, ya, 12.8), P(b, yb, 12.8), P(b, yb, 7.8), tile);
      // 瓦列與雨滴邊是幾何；遠距離只剩屋簷輪廓。
      for (let v = 7.8; v <= 12.8; v += .42) beam(P(a, ya + .025, v), P(b, yb + .025, v), .025 * scale, tile);
    }
    for (const v of [8.55, 12.02]) for (const side of [-1, 1]) face(P(0, 3.54, v), P(side * 2.7, 3.57, v), P(0, 4.8, v), P(0, 4.8, v), wood);
    beam(P(0, 4.85, 7.7), P(0, 4.85, 12.9), .11 * scale, tile);
    // 階段與賽錢箱，沒有額外互動或光源。
    for (let i = 0; i < 3; i++) B(-1.45, 1.45, 0, .12 * (i + 1), 7.5 + i * .24, 7.75 + i * .24, stone);
    B(-.55, .55, .36, .88, 8, 8.45, wood);
    for (let u = -.48; u < .5; u += .16) B(u, u + .07, .88, .93, 8, 8.45, tile);
  }

  for (let i = 0; i < streets.length; i++) {
    const [x, z, ry = 0, ground = 0, id = 0] = streets[i], P = (u, y, v = 0) => [x + u * Math.cos(ry) + v * Math.sin(ry), ground + y, z - u * Math.sin(ry) + v * Math.cos(ry)];
    beam(P(0, 0), P(0, 8.5), .115, stone, 8);
    beam(P(-1.15, 7.5), P(1.15, 7.5), .055, steel);
    for (const u of [-.9, 0, .9]) for (let y = 7.6; y < 7.93; y += .11) beam(P(u, y), P(u, y + .06), .095, ivory);
    beam(P(.34, 5.1), P(.34, 6.2), .3, ivory, 10);
    beam(P(.34, 6.2), P(.34, 6.35), .34, steel, 10);
    beam(P(.3, 4.2), P(.3, 5.1), .027, steel);
    for (let y = .2; y < 1.4; y += .2) beam(P(0, y), P(0, y + .08), .123, tile, 8);
    sign(...P(0, 2.8, .14), id === 1 || id === 4 ? 1.6 : .85, id === 1 || id === 4 ? 1.1 : .85, id, ry);
    solid(x - .14, x + .14, ground, ground + 8.5, z - .14, z + .14);
    const next = streets[i + 1];
    if (next && Math.hypot(next[0] - x, next[1] - z) < 85) for (const off of [-.8, 0, .8]) for (let j = 0; j < 6; j++) {
      const at = t => [x + (next[0] - x) * t + off * Math.cos(ry), ground + 8 - 1.2 * Math.sin(t * Math.PI), z + (next[1] - z) * t - off * Math.sin(ry)];
      beam(at(j / 6), at((j + 1) / 6), .015, steel, 4);
    }
  }
}

export function japaneseBuilder(b, sites) {
  const mat = col => col[4] === 4 ? (b.B.portGlass ? 'portGlass' : 'glass') : col[4] === 1 ? 'concrete' : col[4] === 6 && b.B.landmarkPaint ? 'landmarkPaint' : col[4] === 6 && b.B.painted ? 'painted' : col[4] === 2 || col[4] === 6 ? 'metal' : 'rust';
  japaneseScenery({
    box: (a,c,d,e,f,g,col) => b.deco(mat(col),a,c,d,e,f,g,{tint:col.slice(0,3),shade:()=>1}),
    face: (a,c,d,e,col) => b.B[mat(col)].quad(a,c,d,e,faceNormal(a,c,d),[1,1,1,1],null,col.slice(0,3)),
    sign: (points,id) => b.B.civic.quad(...points,faceNormal(...points),[1,1,1,1],civicUV(id)),
    solid: bounds => b.solid.add({...bounds,mat:'concrete'}),
  },sites);
}

// 符合 urban.js 的四欄／兩列招牌 UV，不依賴 DOM，幾何測試可直接執行。
function civicUV(id) {
  const x=id%4/4,y=1-(Math.floor(id/4)+1)/2,p=.003;
  return [[x+p,y+p],[x+.25-p,y+p],[x+.25-p,y+.5-p],[x+p,y+.5-p]];
}
function faceNormal(a,b,c) {
  const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
  return n.map(x=>x/(length||1));
}
