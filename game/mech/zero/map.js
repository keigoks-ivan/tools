// 地圖：城市中央廣場上的封閉街區（四周仍是鋼鐵黃昏的高樓天際線）
//   路線：A 公寓（起點）→ B 窄巷 → C 市場廣場 → 商店穿堂 → D 檢查哨街道（街尾被貨櫃牆堵死）→ 北側商場走道
//         → H 北區住宅街 → I 市立醫院（大廳、病房）→ K 醫院後院 → J 高架道路 → 匝道 → L 倉庫空地 → 倉庫穿堂
//         → E 貨櫃場 → F 基地走廊 → G 第七機庫（鋼彈）
//   座標：公尺；x 東、z 北；地面 y＝0
import * as THREE from 'three';
import { Builder, grimeShader } from './kit.js';
import * as PR from './props.js';
import { facade, FLOOR } from './models.js';
import { shopMaterial, shopUV } from '../urban.js';
import { roofline } from '../roofline.js';

const H1 = 3.4;   // 一層樓高

export function buildMap(scene, mats, solid, PL = null, surfaces = null) {
  // 額外的純色材質：玻璃、窗洞深處、燈、警示漆
  mats.glass = new THREE.MeshStandardMaterial({ color: 0x334650, roughness: 0.18, metalness: 0.05, envMapIntensity: 1.35, vertexColors: true });
  mats.glass.onBeforeCompile=sh=>{
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWindowWorld;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWindowWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWindowWorld;').replace('#include <map_fragment>',`#include <map_fragment>
      float pane=fract(sin(dot(floor(vWindowWorld.xz/2.2)+floor(vWindowWorld.y/3.4),vec2(127.1,311.7)))*43758.5453);
      float curtain=step(.62,pane)*(1.0-smoothstep(.25,.8,fract(vWindowWorld.y/3.4)));
      diffuseColor.rgb*=.68+.32*pane;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.065,.06,.05)*(.8+.2*sin((vWindowWorld.x+vWindowWorld.z)*36.0)),curtain*.4);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor+=pane*.12;');
  };
  mats.glass.customProgramCacheKey=()=> 'street-glazing-v1';
  mats.void = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1, vertexColors: true });
  mats.lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.4, 2.0), vertexColors: true });
  mats.warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.2, 0.5), vertexColors: true });
  mats.hazard = hazardMat();
  mats.olive = new THREE.MeshStandardMaterial({ color: 0x4d5538, roughness: 0.7, metalness: 0.2, vertexColors: true });
  // 帆布、隔簾：拿掉格子花紋（只留布紋凹凸），顏色用頂點色（tint）各自染
  mats.canvas = mats.fabric.clone(); mats.canvas.map = null; mats.canvas.color.set(0xe8e2d6); mats.canvas.side = THREE.DoubleSide; mats.canvas.onBeforeCompile = mats.fabric.onBeforeCompile;
  mats.sand = new THREE.MeshStandardMaterial({ color: 0x7d6f55, roughness: 1, vertexColors: true, map: mats.floor.map, normalMap: mats.floor.normalMap });
  mats.paint = new THREE.MeshStandardMaterial({ color: 0x55655f, roughness: 0.55, metalness: 0.35, vertexColors: true, map: mats.rust.map, roughnessMap: mats.rust.roughnessMap });
  mats.paint2 = new THREE.MeshStandardMaterial({ color: 0x9a9384, roughness: 0.55, metalness: 0.3, vertexColors: true, map: mats.rust.map, roughnessMap: mats.rust.roughnessMap });
  mats.sign = shopMaterial();
  mats.red = new THREE.MeshStandardMaterial({ color: 0x8a1f1a, roughness: 0.45, metalness: 0.4, vertexColors: true });
  // 燒過的鐵皮（車、公車）：鏽鐵照片貼圖，不太反光；煙燻、灰燼用頂點色
  mats.burnt = new THREE.MeshStandardMaterial({ color: 0x9a938c, roughness: 0.9, metalness: 0.2, vertexColors: true, map: mats.rust.map, normalMap: mats.rust.normalMap, roughnessMap: mats.rust.roughnessMap });
  for (const k of ['glass', 'void', 'lamp', 'warm', 'olive', 'canvas', 'sand', 'paint', 'paint2', 'red', 'burnt']) mats[k].userData.tile = 2;
  // 烤漆類（綠灰漆、白漆、燒過的鐵皮、紅漆、軍綠）共用一個材質：同一張鏽鐵照片，顏色改用頂點色 → 五個 draw call 變一個
  mats.painted = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.25, vertexColors: true, map: mats.rust.map, normalMap: mats.rust.normalMap, roughnessMap: mats.rust.roughnessMap });
  mats.painted.userData.tile = 2;
  // 風化髒污（kit.js）：純色材質也套上，才不會一整片同一個顏色
  for (const [k, g] of [['sand', 0.6], ['painted', 0.65]]) { const m = mats[k]; m.userData.grime = g; m.onBeforeCompile = (sh) => grimeShader(sh, m); }
  const alias = (k, to, g = 1) => { const c = mats[k].color; mats[k].userData.alias = to; mats[k].userData.aliasTint = [c.r * g, c.g * g, c.b * g]; };
  for (const k of ['paint', 'paint2', 'burnt']) alias(k, 'painted');
  for (const k of ['red', 'olive']) alias(k, 'painted', 1.7);   // 原本沒貼圖的純色：乘上鏽鐵照片會變暗，補回來
  mats.warm.userData.alias = 'lamp'; mats.warm.userData.aliasTint = [2.2 / 2.6, 1.2 / 2.4, 0.5 / 2.0];   // 暖色窗燈＝日光燈的桶染橘
  for (const k of ['lamp', 'glass', 'hazard']) mats[k].userData.noCast = true;
  // 貨櫃：真的波浪鐵皮貼圖，染三種常見顏色
  for (const [k, c] of [['cGreen', 0x8a9a74], ['cRed', 0xc27358], ['cBlue', 0x7d93a6], ['cont', 0xffffff]]) { const m = mats.corr.clone(); m.color.set(c); m.metalnessMap = null; m.metalness = 0.15; m.userData.tile = 2.2; m.onBeforeCompile = mats.corr.onBeforeCompile; mats[k] = m; }   // 烤漆：不是裸金屬
  for (const k of ['cGreen', 'cRed', 'cBlue']) alias(k, 'cont');   // 三種貨櫃色共用一個桶
  mats.hazard.userData.tile = 1.6; mats.canvas.userData.tile = 0.9;
  // 外牆模組的貼圖做成一般材質（量體上方、牆角補縫用，顏色才接得起來）
  if (PL) {
    const km = (node) => { const p = PL.M.nodes[node]; return p && p[0].mat; };
    const mk = (src, tile) => { const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, aoMap: src.aoMap, roughness: 1, metalness: 0, vertexColors: true, color: src.color }); m.userData.tile = tile; return m; };
    const ap = km('facade_apartments:wall_standard_standard_01'), fb = km('facade_factory:wall_standard_standard_01');
    if (ap) mats.kplaster = mk(ap, 3); if (fb) mats.kbrick = mk(fb, 3);
    for (const k of ['kplaster', 'kbrick']) if (mats[k]) { const m = mats[k]; m.onBeforeCompile = (sh) => grimeShader(sh, m); }
  }
  if(surfaces)for(const key of ['concrete','wall','floor','corr','cont']) {
    const m=mats[key],prepare=m.onBeforeCompile;
    m.onBeforeCompile=(sh,renderer)=>{
      prepare(sh,renderer);Object.assign(sh.uniforms,{surfaceAtlas:surfaces.surfaceAtlas,surfaceReady:surfaces.surfaceReady});
      sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSurfaceWorld,vSurfaceNormal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSurfaceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vSurfaceNormal=normal;');
      sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D surfaceAtlas;uniform float surfaceReady;varying vec3 vSurfaceWorld,vSurfaceNormal;')
        .replace('#include <map_fragment>',`#include <map_fragment>
          if(surfaceReady>.5){vec2 uv=abs(vSurfaceNormal.y)>.5?vSurfaceWorld.xz:vec2(abs(vSurfaceNormal.x)>.5?vSurfaceWorld.z:vSurfaceWorld.x,vSurfaceWorld.y);
            vec3 scan=texture2D(surfaceAtlas,vec2(${key==='corr'||key==='cont'?'0.0,.5':'.5,.5'})+vec2(.008)+fract(uv/4.0)*.484).rgb;
            diffuseColor.rgb*=mix(vec3(1.0),scan*1.8,.45);}`);
    };
    m.customProgramCacheKey=()=> 'street-surface-'+key+'-v1';
  }
  const b = new Builder(mats, solid);
  const M = { b, lights: [], zones: {}, marks: {}, targets: {}, items: {} };
  // ---- 任務用（script.js 的 targets／pickups 用 id 找）
  // 要炸掉的目標：可破壞的道具（destruct.js 的 BRK 裡有的模型，例如 portable_generator、utility_box_02）；沒有模型就不放，那一段的「炸掉目標」自動算完成
  const target = (id, name, x, z, ry = 0, y = 0, o = {}) => { const h = PL && PL.M.has(name) ? PL.add(name, x, y, z, ry, { solid: true, hit: 'metal', ...o }) : null; if (h) M.targets[id] = { h, p: new THREE.Vector3(x, y + 0.9, z) }; };
  // 要撿的東西（情報、零件）：走近按 E；name＝擺在那裡的模型（可以是 null，只標位置）
  const item = (id, name, x, y, z, ry = 0, o = {}) => { const h = name && PL && PL.M.has(name) ? PL.add(name, x, y, z, ry, { cast: false, ...o }) : null; M.items[id] = { h, p: new THREE.Vector3(x, y, z) }; };
  // 固定雜湊（不動到地圖 rnd 的順序）、攤位帆布的幾種褪色
  const ph = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
  const TARP = [[0.36, 0.46, 0.6], [0.62, 0.3, 0.24], [0.44, 0.47, 0.34], [0.76, 0.72, 0.64], [0.72, 0.46, 0.24]];
  const GOODS = [[0.46, 0.36, 0.25], [0.46, 0.36, 0.25], [0.4, 0.32, 0.23], [0.62, 0.6, 0.56], [0.46, 0.2, 0.17], [0.24, 0.29, 0.4], [0.55, 0.45, 0.22], [0.3, 0.38, 0.26]];   // 褪色的包裝
  // 貼花：地上的燒焦、油漬，牆上的煙燻、水痕（全部合成一個網格，一次畫完）
  //   tile 0 燒焦、1 油漬、2 往上的煙燻、3 往下的水痕；u、v＝半寬、半高方向（世界）
  const DEC = [];
  const decal = (tile, cx, cy, cz, u, v) => DEC.push([tile, cx, cy, cz, u, v]);
  function scorch(x, y, z, r, ry = 0, tile = 0) { const c = Math.cos(ry), s = Math.sin(ry); decal(tile, x, y + 0.045, z, [r * 0.5 * c, 0, -r * 0.5 * s], [r * 0.85 * s, 0, r * 0.85 * c]); }
  // 牆上（side＝牆面朝向；a＝沿牆位置）
  function wallDecal(tile, side, fix, a, y, w, h) {
    const o = side === 'n' || side === 'e' ? 0.02 : -0.02, al = side === 'n' || side === 's';
    const u = al ? [w / 2 * (side === 'n' ? 1 : -1), 0, 0] : [0, 0, w / 2 * (side === 'e' ? -1 : 1)], v = [0, h / 2, 0];
    if (al) decal(tile, a, y, fix + o, u, v); else decal(tile, fix + o, y, a, u, v);
  }

  // ============================================================ 輔助
  // 建築量體（外圍、不進去）：四面牆＋窗；win＝哪幾面開窗 'nsew'
  const mass = (x0, x1, z0, z1, h, mat = 'wall', win = 'nsew', o = {}) => {
    if (o.kit && PL && win) return kitMass(x0, x1, z0, z1, h, win, o);
    const y0 = o.y0 || 0;
    const f0 = Math.max(o.shop ? 1 : 0, Math.ceil(y0 / H1));
    if (!win) b.block(mat, x0, x1, y0, h, z0, z1, { skip: 'ny', ground: y0 });
    else {
      // 碰撞仍是一整棟；外觀改成有厚度、真正開洞的外牆，玻璃退到牆裡。
      solid.add({ x0, x1, y0, y1: h, z0, z1, mat });
      b.deco(mat, x0, x1, h - 0.2, h, z0, z1, { skip: 'ny', ground: y0 });
      for (const sd of 'nsew') skin(sd, x0, x1, z0, z1, y0, h, mat, win.includes(sd), f0, o);
      for (const s of win) windowsOn(s, x0, x1, z0, z1, h, f0, { ...o, recess: true });
    }
    // 屋頂女兒牆
    if (!o.noParapet) {
      const t = 0.35;
      b.deco(mat, x0, x1, h, h + 0.9, z0, z0 + t); b.deco(mat, x0, x1, h, h + 0.9, z1 - t, z1);
      b.deco(mat, x0, x0 + t, h, h + 0.9, z0, z1); b.deco(mat, x1 - t, x1, h, h + 0.9, z0, z1);
    }
    // 每層樓的水平線腳（o.hide＝被隔壁房間貼住的那段不畫，不然會穿進室內）
    for (let y = H1; y < h - 1; y += H1) {
      const tm = o.trim || 'concrete';
      if (win.includes('n')) for (const [p, q] of span(o, 'n', x0, x1)) b.deco(tm, p, q, y - 0.1, y + 0.06, z1, z1 + 0.08);
      if (win.includes('s')) for (const [p, q] of span(o, 's', x0, x1)) b.deco(tm, p, q, y - 0.1, y + 0.06, z0 - 0.08, z0);
      if (win.includes('e')) for (const [p, q] of span(o, 'e', z0, z1)) b.deco(tm, x1, x1 + 0.08, y - 0.1, y + 0.06, p, q);
      if (win.includes('w')) for (const [p, q] of span(o, 'w', z0, z1)) b.deco(tm, x0 - 0.08, x0, y - 0.1, y + 0.06, p, q);
    }
    streetDetails(x0, x1, z0, z1, h, win, o);
  };
  function skin(side, x0, x1, z0, z1, y0, h, mat, windows, f0, o) {
    const along = side === 'n' || side === 's', out = side === 'n' || side === 'e' ? 1 : -1;
    const a0 = along ? x0 : z0, a1 = along ? x1 : z1, fix = side === 'n' ? z1 : side === 's' ? z0 : side === 'e' ? x1 : x0;
    const put = (lo, hi, bot, top) => {
      if (hi - lo < 0.01 || top - bot < 0.01) return;
      const p = fix - out * 0.28, q = fix, opt = { ground: y0 };
      if (along) b.deco(mat, lo, hi, bot, top, Math.min(p, q), Math.max(p, q), opt);
      else b.deco(mat, Math.min(p, q), Math.max(p, q), bot, top, lo, hi, opt);
    };
    const sp = o.spacing || 3.2, ww = o.ww || 1.4, wh = o.wh || 1.7, n = Math.floor((a1 - a0 - 1) / sp), start = a0 + (a1 - a0 - n * sp) / 2 + sp / 2;
    if (!windows || n <= 0) { put(a0, a1, y0, h); return; }
    let prev = y0;
    for (let f = f0; f * H1 + 2.6 < h; f++) {
      const bot = f * H1 + 0.95, top = Math.min(h, bot + wh);
      put(a0, a1, prev, bot); let cur = a0;
      for (let i = 0; i < n; i++) {
        const c = start + i * sp, lo = c - ww / 2, hi = c + ww / 2;
        if (o.hide && o.hide[side] && hi + 0.14 > o.hide[side][0] && lo - 0.14 < o.hide[side][1]) continue;
        put(cur, lo, bot, top); cur = hi;
      }
      put(cur, a1, bot, top); prev = top;
    }
    put(a0, a1, prev, h);
  }
  function streetDetails(x0, x1, z0, z1, h, win, o) {
    if (!win || o.y0 || h < 8 || Math.max(x1 - x0, z1 - z0) > 90) return;
    const asian = x0 > -36 && z0 < 35;
    const sd = [...win].find(s => !o.hide || !o.hide[s]); if (!sd) return;
    const along = sd === 'n' || sd === 's', out = sd === 'n' || sd === 'e' ? 1 : -1;
    const a0 = along ? x0 : z0, a1 = along ? x1 : z1, fix = sd === 'n' ? z1 : sd === 's' ? z0 : sd === 'e' ? x1 : x0;
    const at = (a, y, d) => along ? [a, y, fix + out * d] : [fix + out * d, y, a];
    const ry = sd === 'n' ? 0 : sd === 's' ? Math.PI : sd === 'e' ? Math.PI / 2 : -Math.PI / 2;
    const trim = (mat, lo, hi, y0, y1, d0, d1) => {
      const p = fix + out * d0, q = fix + out * d1;
      if (along) b.deco(mat, lo, hi, y0, y1, Math.min(p, q), Math.max(p, q));
      else b.deco(mat, Math.min(p, q), Math.max(p, q), y0, y1, lo, hi);
    };
    if (!asian && o.kit !== 'factory' && h < 24) {
      // 舊街的石材簷口、托座與三角山牆：只加在可見街面，共用原混凝土桶。
      for (const [y, d, t] of [[h - 0.2, 0.22, 0.14], [h + 0.02, 0.38, 0.16], [h + 0.25, 0.52, 0.18]]) trim('concrete', a0, a1, y, y + t, 0, d);
      for (let a = a0 + 1.2; a < a1 - 1; a += 3.2) trim('concrete', a - 0.13, a + 0.13, h - 0.5, h, 0, 0.3);
      if (ph(x0, z0) > 0.45) {
        const c = (a0 + a1) / 2, w = Math.min(3.4, (a1 - a0) / 4);
        const pts = [at(c - w, h + 0.45, 0.1), at(c + w, h + 0.45, 0.1), at(c, h + 1.9, 0.1), at(c, h + 1.9, 0.1)];
        if (along ? out < 0 : out > 0) pts.reverse();
        b.B.concrete.quad(...pts, along ? [0, 0, out] : [out, 0, 0], [0.85, 0.85, 1, 1]);
      }
    }
    // 不占用可行走的平台：外圍街屋用同一套城市冠頂，細節併入既有材質桶。
    if (h >= 12 && h <= 28 && !o.noParapet && !o.hide) {
      const kind = o.kit === 'factory' ? 'industrial' : asian ? 'east' : 'old';
      const material = col => col[4] === 4 ? 'glass' : col[4] === 2 ? 'rust' : 'concrete';
      roofline(x0, x1, z0, z1, h, kind, (a, c, d, e, col) => {
        const n = new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...d), new THREE.Vector3(...a))).normalize();
        b.B[material(col)].quad(a, c, d, e, n.toArray(), [1, 1, 1, 1], null, col.slice(0, 3));
      }, (a, c, d, e, f, g, col) => b.deco(material(col), a, c, d, e, f, g, { shade: () => 1, tint: col.slice(0, 3) }));
    }
    if (o.shop) {
      // 少量有弧度的布棚；紋理、材質及幾何桶都已載入，沒有額外燈光。
      const count = Math.min(2, Math.floor((a1 - a0) / 8));
      for (let i = 0; i < count; i++) {
        const c = a0 + (a1 - a0) * (i + 0.5) / count, w = 3.2;
        for (let j = 0; j < 8; j++) for (let k = 0; k < 3; k++) {
          const lo = c - w / 2 + w * j / 8, hi = lo + w / 8;
          const curve = t => [3.12 - 0.4 * t * t, 0.1 + t * 1.05];
          const [y0, d0] = curve(k / 3), [y1, d1] = curve((k + 1) / 3);
          const pts = [at(lo, y0, d0), at(hi, y0, d0), at(hi, y1, d1), at(lo, y1, d1)];
          const n = new THREE.Vector3().subVectors(new THREE.Vector3(...pts[1]), new THREE.Vector3(...pts[0])).cross(new THREE.Vector3().subVectors(new THREE.Vector3(...pts[2]), new THREE.Vector3(...pts[0]))).normalize();
          if (n.y < 0) { pts.reverse(); n.negate(); }
          b.B.fabric.quad(...pts, n.toArray(), [0.92, 0.92, 1, 1], null, j % 2 ? [0.9, 0.87, 0.78] : asian ? [0.5, 0.25, 0.2] : [0.22, 0.38, 0.3]);
        }
        trim('metal', c - w / 2, c + w / 2, 3.02, 3.08, 0.12, 0.17);
      }
    }
    // 已載入的掃描冷氣機，共用原有 instancing；不改路線和碰撞。
    if (PL && PL.M.has('exterior_aircon_unit')) for (let a = a0 + 3; a < a1 - 2; a += 12) {
      const p = at(a, 4.1, 0.18); PL.add('exterior_aircon_unit', ...p, ry, { cast: true });
    }
    const pipe = at(a0 + 0.35, 0, 0.12); b.mesh('rust', PR.pipeGeo(Math.min(h, 11), 0.055).translate(0, Math.min(h, 11) / 2, 0), ...pipe, 0, { solid: false });
    if (!o.shop && ph(x0, z0) < 0.4) return;
    const c = (a0 + a1) / 2, lo = asian ? c : c - 2.2, hi = asian ? c + 0.8 : c + 2.2, bot = asian ? 3.4 : 2.9, top = asian ? 6.4 : 3.8, d = asian ? 0.45 : 0.17;
    const pts = [at(lo, bot, d), at(hi, bot, d), at(hi, top, d), at(lo, top, d)];
    const uv = shopUV(asian ? 4 + Math.floor(ph(x0, z0) * 2) : Math.floor(ph(x0, z0) * 4));
    if (along ? out < 0 : out > 0) { pts.reverse(); uv.reverse(); }
    b.B.sign.quad(...pts, along ? [0, 0, out] : [out, 0, 0], [0.9, 0.9, 0.9, 0.9], uv);
  }
  // 沿牆 a0～a1 扣掉 o.hide[side] 那段
  const span = (o, s, a0, a1) => { const hd = o.hide && o.hide[s]; return !hd ? [[a0, a1]] : [[a0, Math.min(a1, hd[0])], [Math.max(a0, hd[1]), a1]].filter(([p, q]) => q - p > 0.01); };
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
      const f0 = Math.ceil((kTop + 0.3) / H1);
      b.deco(km, x0, x1, h - 0.2, h, z0, z1, { skip: 'ny', ground: kTop });
      for (const sd of 'nsew') skin(sd, x0, x1, z0, z1, kTop, h, km, win.includes(sd), f0, o);
      for (const sd of win) windowsOn(sd, x0, x1, z0, z1, h, f0, { ...o, trim: km, recess: true });
    }
    const t = 0.35;
    b.deco(km, x0, x1, h, h + 0.9, z0, z0 + t); b.deco(km, x0, x1, h, h + 0.9, z1 - t, z1); b.deco(km, x0, x0 + t, h, h + 0.9, z0, z1); b.deco(km, x1 - t, x1, h, h + 0.9, z0, z1);
    solid.add({ x0, x1, y0: 0, y1: h, z0, z1, mat: km });
    for (const sd of win) {
      const r = facade(PL, kit, sd, x0, x1, z0, z1, kf, rnd, { shutters: o.shop, noGround: o.noGround, hide: o.hide && o.hide[sd] });
      // 兩端不滿 3 m 的地方：補實牆
      const along = sd === 'n' || sd === 's', m = r.margin;
      if (m > 0.01) for (const [a, bb] of [[along ? x0 : z0, (along ? x0 : z0) + m], [(along ? x1 : z1) - m, along ? x1 : z1]]) {
        if (sd === 'n') b.deco(km, a, bb, 0, kTop, iz1, z1); if (sd === 's') b.deco(km, a, bb, 0, kTop, z0, iz0);
        if (sd === 'e') b.deco(km, ix1, x1, 0, kTop, a, bb); if (sd === 'w') b.deco(km, x0, ix0, 0, kTop, a, bb);
      }
    }
    // 沒有模組的面，下半部也要補到原本的邊界
    for (const sd of 'nsew') if (!win.includes(sd)) continue;
    streetDetails(x0, x1, z0, z1, h, win, o);
  }
  // 立面上的窗：凹進去的深色洞＋玻璃（部分破掉）＋窗台＋偶爾亮燈
  const IN = { n: 'nz', s: 'pz', e: 'nx', w: 'px' }, GL = { n: 'nz px nx py ny', s: 'pz px nx py ny', e: 'nx pz nz py ny', w: 'px pz nz py ny' };
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
        if (o.hide && o.hide[side] && hi + 0.14 > o.hide[side][0] && lo - 0.14 < o.hide[side][1]) continue;   // 被隔壁房間貼住：照樣抽亂數（別處的樣子不變），只是不畫
        // 省三角形：貼著牆的那面永遠看不到；8 m 以上的頂面從地面、高架橋都看不到
        const face = (mat, d0, d1, yy0, yy1, l0 = lo, l1 = hi, sk = IN[side] + (yy0 > 8 ? ' py' : '')) => {
          const p0 = fix + out * d0, p1 = fix + out * d1;
          if (along) b.deco(mat, l0, l1, yy0, yy1, Math.min(p0, p1), Math.max(p0, p1), { skip: sk });
          else b.deco(mat, Math.min(p0, p1), Math.max(p0, p1), yy0, yy1, l0, l1, { skip: sk });
        };
        // 有開洞的外牆：玻璃退入 16 cm，後方暗面表現室內深度。
        if (o.recess) face('void', -0.25, -0.24, y0, y1, lo, hi, GL[side]);
        face(lit ? 'warm' : broken ? 'void' : 'glass', o.recess ? -0.17 : 0.0, o.recess ? -0.16 : 0.015, y0, y1, lo, hi, GL[side]);
        const tm = o.trim || 'concrete';
        face(tm, 0, 0.14, y0 - 0.14, y0, lo - 0.14, hi + 0.14);   // 窗台
        { const hh = ph(c + f * 7.1, fix); if (broken && hh < 0.22) wallDecal(2, side, fix, c, y1 + 1.3, ww * 2.1, 2.8); else if (hh > 0.8) wallDecal(3, side, fix, c, y0 - 1.05, ww * 1.25, 1.9); }   // 燒過的窗上面一片黑；窗台下的水痕
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
      const opts = { ...o, breakable: yy1 - yy0 > 0.5 && /plaster|brick|concrete|wall/.test(mat) ? 'wall' : null };
      if (axis === 'x') b.block(mat, s0, s1, yy0, yy1, fixed - t / 2, fixed + t / 2, opts);
      else b.block(mat, fixed - t / 2, fixed + t / 2, yy0, yy1, s0, s1, opts);
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
    // o.skin：不蓋牆的那面（靠鄰房），鄰房外牆的外層材質會露進來：補一層室內粉刷
    const sn = (s) => sk(s) && o.skin && o.skin.includes(s);
    if (sn('s')) wall(wm, 'x', z0 + L / 2, L, x0, x1, 0, h, ops('s'), { dim: 0.85, solid: false });
    if (sn('n')) wall(wm, 'x', z1 - L / 2, L, x0, x1, 0, h, ops('n'), { dim: 0.85, solid: false });
    if (sn('w')) wall(wm, 'z', x0 + L / 2, L, z0, z1, 0, h, ops('w'), { dim: 0.85, solid: false });
    if (sn('e')) wall(wm, 'z', x1 - L / 2, L, z0, z1, 0, h, ops('e'), { dim: 0.85, solid: false });
    // 玻璃獨立記錄在合併網格中的範圍；破裂後移除射線碰撞。
    for (const side of ['s', 'n', 'w', 'e']) {
      if (sk(side)) continue;
      const along = side === 's' || side === 'n', fixed = side === 's' ? z0 - t / 2 : side === 'n' ? z1 + t / 2 : side === 'w' ? x0 - t / 2 : x1 + t / 2;
      for (const [c, w = 1.4] of Wn[side] || []) {
        const o = { breakable: 'glass', noMove: true, noFloor: true };
        if (along) b.block('glass', c - w / 2, c + w / 2, 0.97, 2.28, fixed - 0.012, fixed + 0.012, o);
        else b.block('glass', fixed - 0.012, fixed + 0.012, 0.97, 2.28, c - w / 2, c + w / 2, o);
      }
    }
    // 踢腳線、門楣和內側框，保持原來的通行洞口。
    for (const side of ['s', 'n', 'w', 'e']) {
      if (sk(side) && !sn(side)) continue;
      const axis = side === 's' || side === 'n' ? 'x' : 'z';
      const fixed = side === 's' ? z0 + 0.04 : side === 'n' ? z1 - 0.04 : side === 'w' ? x0 + 0.04 : x1 - 0.04;
      wall('concrete', axis, fixed, 0.055, axis === 'x' ? x0 : z0, axis === 'x' ? x1 : z1, 0.03, 0.15, ops(side), { solid: false, dim: 0.65 });
      for (const [c, w = 1.4] of D[side] || []) doorFrame(axis, fixed, c, w);
    }
    if (o.upper) mass(x0 - t, x1 + t, z0 - t, z1 + t, o.upper, ext, o.upperWin || '', { y0: h + 0.3, trim: o.trim });
    // 日光燈
    if (o.lights !== false) for (let x = x0 + 3; x < x1 - 1; x += 6) for (let z = z0 + 3; z < z1 - 1; z += 6) if (rnd() < (o.lightP ?? 0.5)) b.deco('lamp', x - 0.6, x + 0.6, h - 0.05, h, z - 0.08, z + 0.08, { solid: false });
  };
  // 門框（深色洞口周圍）
  const doorFrame = (axis, fixed, c, w = 1.4, h = 2.3) => {
    if (axis === 'x') { b.deco('rust', c - w / 2 - 0.1, c - w / 2, 0, h + 0.1, fixed - 0.2, fixed + 0.2); b.deco('rust', c + w / 2, c + w / 2 + 0.1, 0, h + 0.1, fixed - 0.2, fixed + 0.2); b.deco('rust', c - w / 2 - 0.1, c + w / 2 + 0.1, h, h + 0.1, fixed - 0.2, fixed + 0.2); }
    else { b.deco('rust', fixed - 0.2, fixed + 0.2, 0, h + 0.1, c - w / 2 - 0.1, c - w / 2); b.deco('rust', fixed - 0.2, fixed + 0.2, 0, h + 0.1, c + w / 2, c + w / 2 + 0.1); b.deco('rust', fixed - 0.2, fixed + 0.2, h, h + 0.1, c - w / 2 - 0.1, c + w / 2 + 0.1); }
  };
  // 整片底圖是 floor（頂面 y 0.02）；換別的材質的地面要高 1 cm，不然兩層貼在同一平面上會閃（z-fighting）
  const ground = (mat, x0, x1, z0, z1) => b.deco(mat, x0, x1, 0, mat === 'floor' ? 0.02 : 0.03, z0, z1, { skip: 'ny nx px nz pz' });

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
      for (const end of [-1, 1]) {
        const px = x + end * 3.075 * c, pz = z - end * 3.075 * s;
        b.obox(mat, px, y + 1.3, pz, 0.03, 1.23, 1.14, ry, { solid: false });
        // 雙扇門縫、四根鎖桿和鉸鏈。
        b.obox('void', px + end * 0.035 * c, y + 1.3, pz - end * 0.035 * s, 0.012, 1.2, 0.012, ry, { solid: false });
        for (const dz of [-0.85, -0.3, 0.3, 0.85]) {
          const rod = PR.pipeGeo(2.3, 0.023);
          b.mesh('metal', rod, px + end * 0.055 * c + dz * s, y + 1.3, pz - end * 0.055 * s + dz * c);
          for (const yy of [0.22, 1.15, 2.36]) b.obox('metal', px + end * 0.06 * c + dz * s, y + yy, pz - end * 0.06 * s + dz * c, 0.032, 0.035, 0.1, ry, { solid: false });
        }
      }
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
    car(x, z, ry = 0, y = 0) {
      if (PL && PL.M.has('covered_car') && rnd() < 0.55) { PL.add('covered_car', x, 0, z, ry, { solid: true, hit: 'metal', top: 1.3, inset: 0.1 }); return; }
      // 兩成是還沒燒的棄車（烤漆、玻璃），其他燒到只剩鐵殼；車型（三廂／掀背／車頭撞爛）也從同一個亂數取，不多抽
      const r = rnd(), burned = r >= 0.2, g = PR.car(Math.floor(r * 97) % 3, burned), paint = burned ? 'burnt' : r < 0.1 ? 'paint' : 'paint2';
      b.mesh(paint, g.body, x, y, z, ry, { shade: 1 }); carBoxes(g.body, x, y, z, ry, y + 1.2);
      b.mesh('void', g.dark, x, y, z, ry, { shade: 1 });
      b.mesh('metal', g.metal, x, y, z, ry, { shade: 1 });
      if (g.glass) b.mesh('glass', g.glass, x, y, z, ry, { shade: 0.8 });
      if (burned) scorch(x, y, z, 3.4, ry);
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
        b.mesh(rnd() < 0.6 ? 'concrete' : rnd() < 0.5 ? 'floor' : 'brick', g, x + Math.cos(a) * d, -0.05 - s * 0.12, z + Math.sin(a) * d, rnd() * 6.28, { shade: 0.52, tint: [0.92, 0.9, 0.86] });   // 灰色斷塊、半埋在土裡（原本米黃色、浮在地上像積木）
        if (rnd() < 0.25) b.mesh('rust', PR.rebar(0.6 + rnd()).rotateZ((rnd() - 0.5) * 1.6).rotateX((rnd() - 0.5) * 1.2), x + Math.cos(a) * d, s * 0.3, z + Math.sin(a) * d, rnd() * 6, { shade: 0.8 });
      }
      scorch(x, 0, z, r * 2.6, ph(x, z) * 6, 1);   // 碎石底下一片灰
      if (PL) for (let i = 0; i < n * 0.8; i++) { const a = rnd() * 6.28, d = rnd() * r * 1.3; PL.add('cement_bag', x + Math.cos(a) * d, 0, z + Math.sin(a) * d, rnd() * 6, { scale: 0.7 + rnd() * 0.4, cast: false, roll: (rnd() - 0.5) * 0.5, noBreak: true }); }
      b.solid.add({ x0: x - r * 0.6, x1: x + r * 0.6, y0: 0, y1: 0.5, z0: z - r * 0.6, z1: z + r * 0.6, mat: 'concrete' });
    },
    // 市場攤位：桌子＋帆布頂
    stall(x, z, ry = 0) {
      b.obox('rust', x, 0.85, z, 1.2, 0.05, 0.6, ry);
      b.solid.add(aabb(x, 0.45, z, 1.2, 0.45, 0.6, ry, 'metal'));
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const [px, pz] of [[1.15, 0.55], [-1.15, 0.55], [1.15, -0.55], [-1.15, -0.55]]) b.obox('metal', x + px * c + pz * s, 1.2, z - px * s + pz * c, 0.03, 1.2, 0.03, ry, { solid: false });
      b.mesh('canvas', PR.canopy(), x, 2.4, z, ry, { solid: false, shade: 0.9, tint: TARP[Math.floor(ph(x, z) * TARP.length)] });
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
      for (const [height, radius] of [[1.03, 0.03], [0.52, 0.022]]) {
        const g = PR.pipeGeo(a1 - a0, radius);
        if (axis === 'x') b.mesh('metal', g.rotateZ(Math.PI / 2), (a0 + a1) / 2, y + height, fixed);
        else b.mesh('metal', g.rotateX(Math.PI / 2), fixed, y + height, (a0 + a1) / 2);
      }
      for (let a = a0; a <= a1; a += 1.5) {
        const x = axis === 'x' ? a : fixed, z = axis === 'x' ? fixed : a;
        b.mesh('metal', PR.pipeGeo(1.06, 0.028), x, y + 0.53, z);
        b.deco('metal', x - 0.07, x + 0.07, y, y + 0.025, z - 0.07, z + 0.07);
      }
      solid.add(axis === 'x' ? { x0: a0, x1: a1, z0: fixed - 0.05, z1: fixed + 0.05, y0: y, y1: y + 1.06, mat: 'metal', noRay: true } : { x0: fixed - 0.05, x1: fixed + 0.05, z0: a0, z1: a1, y0: y, y1: y + 1.06, mat: 'metal', noRay: true });
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
    // 貨架：鐵架（底座、層板、兩端立柱、中間背板）＋層板上的貨（原本是實心鐵塊，貨被包在裡面看不到）；碰撞仍是整塊
    shelf(x0, x1, z0, z1, h, goods, ys) {
      const ax = x1 - x0 > z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      solid.add({ x0, x1, y0: 0, y1: h, z0, z1, mat: 'metal' });
      // 烤漆鐵架（原本是花紋鋼板）；貨是各色紙箱、包裝（帆布材質染色）
      b.deco('paint', x0, x1, 0, 0.1, z0, z1);
      for (const y of [...ys, h]) b.deco('paint', x0, x1, y - 0.04, y, z0, z1);
      if (ax) { b.deco('paint', x0, x0 + 0.05, 0, h, z0, z1); b.deco('paint', x1 - 0.05, x1, 0, h, z0, z1); b.deco('paint', x0, x1, 0, h, cz - 0.015, cz + 0.015); }
      else { b.deco('paint', x0, x1, 0, h, z0, z0 + 0.05); b.deco('paint', x0, x1, 0, h, z1 - 0.05, z1); b.deco('paint', cx - 0.015, cx + 0.015, 0, h, z0, z1); }
      // 貨沿長邊切成幾段、高低不一（用固定雜湊，不動到地圖 rnd 的順序）
      const a0 = (ax ? x0 : z0) + 0.1, a1 = (ax ? x1 : z1) - 0.1, d0 = (ax ? z0 : x0) + 0.04, d1 = (ax ? z1 : x1) - 0.04;
      for (const y of ys) for (let a = a0; a < a1 - 0.2;) {
        const L = Math.min(a1 - a, 0.4 + hr() * 0.6), hh = 0.14 + hr() * 0.2, i0 = d0 + hr() * 0.06, i1 = d1 - hr() * 0.06;
        // 一段貨再切成一到三件，高矮、顏色各不同
        if (hr() > 0.12) { const k = 1 + Math.floor(ph(a, y * 7 + cz) * 3), w = (L - 0.05) / k; for (let j = 0; j < k; j++) { const q = ph(a + j, y + cx), p0 = a + j * w, p1 = p0 + w - 0.02, yy = y + hh * (0.6 + q * 0.5), tn = { tint: GOODS[Math.floor(q * GOODS.length)] }; if (ax) b.deco('canvas', p0, p1, y, yy, i0, i1, tn); else b.deco('canvas', i0, i1, y, yy, p0, p1, tn); } }
        a += L;
      }
    },
  };
  let hk = 0;
  const hr = () => { const v = Math.sin(++hk * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
  function rampBeam(x, z0, z1, y0, y1, dir) {
    const L = z1 - z0, dy = y1 - y0, len = Math.hypot(L, dy), ang = Math.atan2(dy, L) * (dir > 0 ? 1 : -1);
    const g = new THREE.BoxGeometry(0.08, 0.25, len);
    b.mesh('metal', g.rotateX(-ang), x, (y0 + y1) / 2 - 0.1, (z0 + z1) / 2, 0, { shade: 0.85 });   // 預設明暗以放置點為地面，樑下半段會變全黑
  }
  // 病床：碰撞跟原本的方塊一樣；外觀是鐵床架、四腳、白床墊、枕頭
  function bed(x, z0, z1) {
    solid.add({ x0: x - 0.5, x1: x + 0.5, y0: 0, y1: 0.6, z0, z1, mat: 'metal' });
    b.deco('metal', x - 0.5, x + 0.5, 0.42, 0.52, z0, z1);
    for (const px of [x - 0.46, x + 0.42]) for (const pz of [z0 + 0.05, z1 - 0.1]) b.deco('metal', px, px + 0.04, 0, 0.42, pz, pz + 0.04);
    b.deco('canvas', x - 0.45, x + 0.45, 0.52, 0.75, z0 + 0.08, z1 - 0.1, { tint: [0.78, 0.78, 0.74] });
    b.deco('canvas', x - 0.3, x + 0.3, 0.75, 0.84, z1 - 0.48, z1 - 0.14, { tint: [0.85, 0.85, 0.82] });
  }
  // 車的碰撞盒：正放一個盒子；斜放切成沿車長的三段，各自取外接盒（原本一個大外接盒，斜的車四角會有看不見的牆）
  function carBoxes(g, x, y, z, ry, top) {
    g.computeBoundingBox(); const bb = g.boundingBox, c = Math.cos(ry), s = Math.sin(ry), off = Math.abs(Math.sin(2 * ry));
    const n = off < 0.25 ? 1 : 3, L = (bb.max.z - bb.min.z) / n;
    for (let i = 0; i < n; i++) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const lx of [bb.min.x, bb.max.x]) for (const lz of [bb.min.z + i * L, bb.min.z + (i + 1) * L]) { const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c; x0 = Math.min(x0, wx); x1 = Math.max(x1, wx); z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
      solid.add({ x0, x1, y0: y + bb.min.y, y1: top, z0, z1, mat: 'metal' });
    }
  }
  function aabb(x, y, z, hx, hy, hz, ry, mat) {
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)), ex = hx * c + hz * s, ez = hx * s + hz * c;
    return { x0: x - ex, x1: x + ex, y0: y - hy, y1: y + hy, z0: z - ez, z1: z + ez, mat, noRay: false, obb: Math.abs(Math.sin(2 * ry)) > 0.01 ? { cx: x, cz: z, hx, hz, ry } : undefined };   // obb：子彈用真正的斜方塊判斷
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
  room(-112, -99, -112, -93, { h: 3.2, doors: { e: [[-100.5, 1.2], [-107, 3.2]] }, windows: { s: [[-108], [-103]], w: [[-102.5]] }, upper: 13, upperWin: 'sw', floor: 'tile', lightP: 0.3 });
  room(-99, -82, -112, -93, { h: 3.2, doors: { n: [[-91.5, 1.4]], w: [[-100.5, 1.2], [-107, 3.2]] }, windows: { s: [[-95], [-87]], e: [[-104]] }, upper: 13, upperWin: 'se', open: true, lightP: 0 });
  // 兩房之間的牆被炸開一個大洞：洞口邊緣的碎塊、掉下來的磚
  P.rubble(-99, -107, 1.8, 18);
  for (const [y, z] of [[2.5, -108.7], [2.9, -106.8], [2.4, -105.3], [0.6, -108.8], [0.8, -105.2]]) b.mesh('brick', PR.chunk(Math.floor(y * 10)).clone().scale(0.35, 0.35, 0.35), -99, y, z, y * 3, { shade: 0.8 });
  // 房間 2 的天花板（留一個塌陷的洞）
  b.block('concrete', -99.3, -82, 3.2, 3.5, -112.3, -104, { dim: 0.7 });
  b.block('concrete', -99.3, -93, 3.2, 3.5, -104, -92.7, { dim: 0.7 });
  b.block('concrete', -88, -82, 3.2, 3.5, -98, -92.7, { dim: 0.7 });
  b.block('concrete', -93, -88, 3.2, 3.5, -104, -101, { dim: 0.7 });
  // 洞往上看：樓上也一路塌穿到屋頂（洞口四周補內牆），不然會看穿整棟樓、看到外面的天空和窗框背面
  for (const [x0, x1, z0, z1, y0] of [[-93.25, -93, -101.25, -92.75, 3.5], [-93.25, -88, -101.25, -101, 3.5], [-88.25, -88, -104.25, -101, 3.5], [-88.25, -81.75, -104.25, -104, 3.5],
    [-82, -81.75, -104, -97.75, 3.2], [-88, -81.75, -98, -97.75, 3.5], [-88, -87.75, -98, -92.75, 3.5], [-93, -87.75, -93, -92.75, 3.2]]) b.deco('wall', x0, x1, y0, 13, z0, z1, { dim: 0.55, ground: y0 });
  for (const y of [6.9, 10.3]) { b.deco('concrete', -93, -92.4, y - 0.3, y, -101, -93, { dim: 0.6 }); b.deco('concrete', -88, -82, y - 0.3, y, -104, -103.4, { dim: 0.6 }); }   // 各層斷掉的樓板
  P.rubble(-90.5, -99.5, 2.6, 26);
  b.mesh('concrete', new THREE.BoxGeometry(5.2, 0.32, 2.8).rotateZ(0.6), -90.1, 1.5, -97.3, 0.2, { shade: 0.75 });  // 塌下來斜靠的樓板：一頭著地、一頭靠在洞口邊（原本是水平的，浮在半空）
  solid.add({ x0: -92.4, x1: -89.3, y0: 0, y1: 1.8, z0: -98.9, z1: -95.8, mat: 'concrete' });
  doorFrame('x', -92.85, -91.5);
  // 家具：翻倒的桌子、倒下的鐵架、散落的東西（在 dress() 裡用掃描模型擺）
  if (!PL) { b.obox('olive', -106, 0.4, -108, 0.8, 0.4, 0.45, 0.3); b.obox('rust', -110.5, 1, -100, 0.3, 1, 1.2, 0); }
  P.crate(-85, -109.5, 1.0, 0.4); P.crate(-84.5, -108.3, 0.7, 0.9);   // 原本 y＝1：掃描木箱比較扁，疊不到上面，浮在半空
  // 塌陷的洞灑下來的光（加法光錐）＋一盞暖色點光當反光
  M.marks.start = new THREE.Vector3(-91.6, 0, -91.6);   // 剛從公寓後門出來，站在巷口
  M.marks.startYaw = Math.PI / 2 * 0 + 0.9;

  // ---- 打開原本的建築（第 1、2 章的修車行、據點、工廠）：一棟量體拆成房間＋剩下的量體。
  //   地圖的 rnd 是一條共用的亂數：拆完以後，照「原本那一棟」會抽的次數把亂數抽掉，下游（別處的窗、車、貨櫃）長得跟原本一模一樣；
  //   新蓋的東西在 keepRnd 裡面自己抽，抽完還原
  const DRY = { add: () => null, M: PL ? PL.M : null };
  function burnMass(x0, x1, z0, z1, h, win, o = {}) {
    const wins = (f0) => { for (const s of win) { const n = Math.floor(((s === 'n' || s === 's' ? x1 - x0 : z1 - z0) - 1) / (o.spacing || 3.2)); for (let f = f0; f * H1 + 2.6 < h; f++) for (let i = 0; i < n; i++) { rnd(); rnd(); } } };
    if (o.kit && PL && win) {
      const kf = Math.max(1, Math.min(Math.floor(h / FLOOR), o.kitFloors ?? 3)), kTop = kf * FLOOR;
      if (h > kTop + 0.2) wins(Math.ceil((kTop + 0.3) / H1));   // 跟 kitMass 一樣：先上層窗、再外牆模組
      for (const s of win) facade(DRY, o.kit, s, x0, x1, z0, z1, kf, rnd, {});
    } else wins(Math.max(o.shop ? 1 : 0, Math.ceil((o.y0 || 0) / H1)));
  }
  const keepRnd = (fn, was) => { const s0 = seed, h0 = hk; fn(); seed = s0; hk = h0; if (was) burnMass(...was); };

  // ============================================================ B 窄巷（x -95～-88，z -92～-58）
  mass(-114, -95, -92, -40, 14, 'brick', 'e', { trim: 'wall', kit: 'apt' });
  // 巷子東側那棟：北段一樓打通成修車行（第 1 章 B2：巷口鐵門鎖死，從修車行西門進、北邊鐵捲門出去到廣場）
  keepRnd(() => {
    mass(-88, -66, -92, -76.3, 11, 'wall', 'w', { kit: 'apt' });
    mass(-71.7, -66, -76.3, -62, 11, 'wall', 'n', { kit: 'apt' });
    room(-87.7, -72, -76, -62.3, { h: 3.8, floor: 'floor', wall: 'concrete', ext: PL ? 'kplaster' : 'plaster', doors: { w: [[-74.4, 1.6]], n: [[-77, 3.4]] }, windows: { n: [[-84, 1.6]] }, upper: 11, upperWin: 'wn', trim: PL ? 'kplaster' : null, lightP: 0.7 });
    b.deco('rust', -78.9, -75.1, 2.32, 2.75, -62.05, -61.7);   // 捲上去的鐵捲門外殼
    // 待修的車（沒燒過）、工作台、鐵架、輪胎、油桶
    { const g = PR.car(1, false); b.mesh('paint', g.body, -81.8, 0, -69.6, Math.PI / 2 + 0.06, { shade: 1 }); carBoxes(g.body, -81.8, 0, -69.6, Math.PI / 2 + 0.06, 1.2); b.mesh('void', g.dark, -81.8, 0, -69.6, Math.PI / 2 + 0.06, { shade: 1 }); b.mesh('metal', g.metal, -81.8, 0, -69.6, Math.PI / 2 + 0.06, { shade: 1 }); if (g.glass) b.mesh('glass', g.glass, -81.8, 0, -69.6, Math.PI / 2 + 0.06, { shade: 0.8 }); }
    P.crate(-73.3, -72.2, 1.1, 0.1); P.crate(-73, -74.6, 0.8, 0.4); P.barrel(-72.9, -64.3); P.barrel(-73.6, -65.1, 'rust');
    b.block('paint', -86.9, -84.4, 0, 0.9, -69.4, -68.6); b.deco('metal', -86.95, -84.35, 0.9, 0.95, -69.45, -68.55);   // 零件櫃（矮，當掩護）
    if (PL) {
      PL.add('metal_office_desk', -84.4, 0, -75.3, 0, { solid: true });
      for (const x of [-80.2, -77.2]) PL.add('steel_frame_shelves_01', x, 0, -75.45, 0, { scale: 0.1, solid: true });
      for (const [y, r] of [[0.08, 0], [0.3, 0.5], [0.52, 1.1]]) PL.add('old_tyre', -86.6, y, -64.3, r, { tilt: Math.PI / 2 });
      PL.add('old_tyre', -85.7, 0.08, -65.2, 0.4, { tilt: Math.PI / 2 });
      for (const [x, z] of [[-79.1, -71.3], [-78.8, -71.6]]) PL.add('metal_jerrycan_green', x, 0, z, x * 3);
      PL.add('hand_truck', -76.2, 0, -73.2, 0.3, { solid: true });
      // 北門口搬出來的東西（三個人擠在這裡）
      for (const [x, z, s] of [[-80.4, -62.95, 1.3], [-79.5, -63, 1.2], [-79.9, -62.95, 1.2]]) PL.add('cardboard_box_01', x, 0, z, x * 5, { scale: s });
      PL.add('cardboard_box_01', -80, 0.42, -62.95, 0.3, { scale: 1.1 });
      for (const x of [-78.5, -78.1]) PL.add('plastic_crate_02', x, 0, -63, x * 2);
      for (const [x, z] of [[-83, -66], [-78, -71]]) PL.add('mounted_fluorescent_lights', x, 3.78, z, 0, { cast: false, tilt: Math.PI });
    }
    M.lights.push({ p: new THREE.Vector3(-80, 3.3, -69), c: 0xe6ebff, i: 32, d: 16 });
  }, [-88, -66, -92, -62, 11, 'wn', { kit: 'apt' }]);
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
  for (const [x0, x1] of [[-95, -93.6], [-89.2, -88]]) b.block('cont', x0, x1, 0, 3, -60.3, -60.1, { tint: [1.5, 1.65, 1.4] });   // 淺綠烤漆鐵門（原本裸金屬，逆光時整片全黑）
  // 中間那扇拉上、鐵鍊鎖死（第 1 章從修車行繞進廣場）
  b.block('cont', -93.65, -89.15, 0, 2.95, -60.5, -60.34, { tint: [1.35, 1.5, 1.28] });
  b.deco('metal', -91.55, -91.45, 0.7, 1.5, -60.56, -60.5); b.deco('rust', -91.7, -91.3, 0.95, 1.2, -60.62, -60.56);
  P.puddle(-91, -77, 2.5, 1.4, 0.2); P.puddle(-92.5, -68, 1.8, 1.2, 1);
  M.zones.B = { x0: -95, x1: -82, z0: -92, z1: -58 };

  // ============================================================ C 市場廣場（x -95～-60，z -58～-30）
  mass(-114, -95, -40, -8, 17, 'wall', 'e', { kit: 'apt' });
  mass(-95, -64, -30, -10, 12, 'brick', 's', { shop: true, kit: 'apt' });
  // 東南角的小倉庫：打通成獵犬軍團的據點（第 1 章 C2 搜東西、C3 守點）；北門對廣場，西牆兩扇窗看得到修車行門口
  keepRnd(() => {
    room(-65.7, -60.3, -61.7, -52.3, { h: 3.4, floor: 'floor', wall: 'plaster', ext: PL ? 'kbrick' : 'brick', doors: { n: [[-63, 1.6]] }, windows: { w: [[-59.8, 1.4], [-55.4, 1.4]] }, upper: 10, upperWin: 'nw', trim: PL ? 'kbrick' : null, lights: false });
    b.deco('lamp', -63.6, -62.4, 3.35, 3.4, -57.2, -57.04, { solid: false });
    // 牆上的搜索地圖（紙＋紅筆圈）：拍下來就好，不拿走
    b.deco('canvas', -64.35, -61.65, 1.05, 2.15, -61.69, -61.67, { tint: [0.86, 0.82, 0.68] });
    for (const [x0, x1, y0, y1] of [[-63.4, -62.5, 1.75, 1.8], [-63.4, -62.5, 1.4, 1.45], [-63.45, -63.4, 1.4, 1.8], [-62.5, -62.45, 1.4, 1.8], [-64.1, -63.7, 1.3, 1.33]]) b.deco('red', x0, x1, y0, y1, -61.668, -61.66);
    b.deco('canvas', -65.6, -64.7, 1.2, 1.8, -61.69, -61.67, { tint: [0.72, 0.74, 0.7] });
    // 窗下的沙包、牆邊的木箱、行軍床
    P.sandbags(-65.15, -55.5, 1.7, Math.PI / 2, 2); P.crate(-65, -53.3, 1.0, 0.2); P.crate(-61.2, -60.7, 0.8, 1.2);
    b.block('olive', -65.4, -64.6, 0, 0.42, -61.4, -59.7); b.deco('canvas', -65.35, -64.65, 0.42, 0.5, -61.35, -59.75, { tint: [0.4, 0.44, 0.34] });
    if (PL) {
      PL.add('metal_office_desk', -61.05, 0, -57, Math.PI / 2, { solid: true });
      for (const [x, z] of [[-60.8, -59], [-60.9, -59.4]]) PL.add('metal_jerrycan_green', x, 0, z, z);
      PL.add('mounted_fluorescent_lights', -63, 3.38, -57.1, 0, { cast: false, tilt: Math.PI });
    }
    M.lights.push({ p: new THREE.Vector3(-63, 2.9, -57), c: 0xffe2c0, i: 22, d: 12 });
  }, [-66, -60, -62, -52, 10, 'nw', { kit: 'factory' }]);
  // 據點裡撿得起來的東西：桌上的無線電、密碼本（小網格，撿走就藏起來）；牆上的地圖只標位置
  {
    const put = (id, x, y, z, ry, parts) => {
      const g = new THREE.Group();
      for (const [w, h, d, px, py, pz, mat] of parts) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py + h / 2, pz); m.userData.noAO = true; g.add(m); }
      g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
      M.items[id] = { h: { hide() { g.visible = false; } }, p: new THREE.Vector3(x, y, z) };
    };
    const olive = new THREE.MeshStandardMaterial({ color: 0x3f4632, roughness: 0.7, metalness: 0.3 }), led = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.4, 0.6) });
    const book = new THREE.MeshStandardMaterial({ color: 0x5a1f1a, roughness: 0.8 });
    put('radio', -61.05, 0.76, -57.45, 0.2, [[0.34, 0.2, 0.22, 0, 0, 0, olive], [0.02, 0.36, 0.02, 0.12, 0.2, -0.06, olive], [0.05, 0.03, 0.012, -0.08, 0.14, 0.111, led]]);
    put('codes', -60.95, 0.76, -56.45, -0.35, [[0.22, 0.045, 0.3, 0, 0, 0, book]]);
    item('smap', null, -63, 1.1, -61.1);
  }
  ground('floor', -95, -60, -58, -30);
  // 店面鐵捲門（北側）
  for (const x of [-90, -83, -76, -69]) { b.deco('corr', x - 2.2, x + 2.2, 0, 2.8, -30.12, -30.02); b.deco('rust', x - 2.4, x + 2.4, 2.8, 3.3, -30.3, -30); }
  P.stall(-86, -48, 0.1); P.stall(-80, -50, -0.2); P.stall(-74, -46, 0.05); P.stall(-88, -39, 0.3); P.stall(-70, -38, -0.1);
  P.car(-79, -40, 1.2);
  P.sandbags(-66, -44, 4.5, Math.PI / 2); P.sandbags(-68, -48.2, 3, 0.3); P.sandbags(-68, -39.8, 3, -0.3);
  P.jersey(-90, -54, 0.4); P.jersey(-84, -34, 0); P.crate(-62.5, -33, 1.1); P.crate(-62, -31.8, 0.8, 0.5);   // 原本 y＝1.1，旁邊沒東西撐，浮在半空
  P.rubble(-92, -33, 2, 14);
  // 廣場中央枯死的噴水池
  b.block('concrete', -80, -76, 0, 0.6, -46, -42); b.deco('void', -79.6, -76.4, 0.3, 0.61, -45.6, -42.4);
  P.puddle(-82, -52, 3, 2, 0.5); P.puddle(-70, -34, 2.2, 1.5, 0); P.barrel(-93, -46); P.barrel(-92.4, -46.6, 'rust'); P.barrel(-61.5, -54);
  M.zones.C = { x0: -95, x1: -60, z0: -58, z1: -30 };

  // ============================================================ 商店穿堂（x -60～-44，z -50～-34）→ 第 2 章起點
  room(-60, -44, -50, -34, { h: 3.4, floor: 'tile', ext: PL ? 'kplaster' : 'plaster', doors: { w: [[-42, 1.8]], e: [[-42, 1.8]] }, windows: { n: [[-56], [-48]], w: [[-47.5, 2], [-37, 2]] }, upper: 15, upperWin: 'nw', lightP: 0.8, trim: PL ? 'kplaster' : null });
  doorFrame('z', -60.15, -42, 1.8); doorFrame('z', -43.85, -42, 1.8);
  // 貨架
  for (const z of [-47.5, -44.5, -39, -36.5]) P.shelf(-57, -50, z - 0.3, z + 0.3, 1.8, 'olive', [0.6, 1.2]);
  b.block('paint2', -49, -46, 0, 1.0, -38.5, -37.5); b.deco('metal', -49.05, -45.95, 1.0, 1.05, -38.55, -37.45);   // 櫃台（淺色烤漆＋鐵檯面）
  mass(-60, -36, -92, -50, 13, 'wall', 'nw', { kit: 'apt', hide: { n: [-60, -36] } });   // 北面整面被商店、D 街南側的樓擋住：窗框會穿進商店
  mass(-60, -36, -34, -8, 15, 'brick', 's', { hide: { s: [-60, -43.7] } });
  M.marks.ch2 = new THREE.Vector3(-52, 0, -42); M.marks.ch2Yaw = Math.PI / 2 * -1 * -1;

  // ============================================================ D 檢查哨街道（x -44～36，z -48～-34）
  // 北側店面中間有一條穿過街區的商場走道（第 2 章被貨櫃牆擋住後往北繞）
  mass(-36, -14.3, -34, -8, 20, 'wall', 'sn', { shop: true, kit: 'apt' });
  mass(-5.7, 6, -34, -8, 20, 'wall', 'sn', { shop: true, kit: 'apt' });
  room(-14, -6, -33.7, -8.3, { h: 3.6, floor: 'tile', ext: PL ? 'kplaster' : 'plaster', doors: { s: [[-10, 2.4]], n: [[-10, 2.4]] }, windows: { s: [[-12.6, 1.2], [-7.4, 1.2]] }, upper: 20, upperWin: 's', lightP: 0.6, trim: PL ? 'kplaster' : null });
  for (const z of [-30, -25, -20, -15]) { P.shelf(-13.7, -12.9, z - 1.5, z + 1.5, 1.9, 'olive', [0.6, 1.25]); P.shelf(-7.1, -6.3, z - 1.2, z + 1.2, 1.9, 'paint2', [0.6, 1.25]); }
  b.obox('red', -9.2, 0.45, -18.5, 0.45, 0.45, 1.0, 0.9);   // 倒下的販賣機：紅色機身、朝上的玻璃窗、投幣面板
  b.obox('glass', -9.2 + 0.05 * Math.cos(0.9), 0.905, -18.5 - 0.05 * Math.sin(0.9), 0.3, 0.01, 0.6, 0.9, { solid: false });
  b.obox('void', -9.2 - 0.33 * Math.cos(0.9), 0.905, -18.5 + 0.33 * Math.sin(0.9), 0.07, 0.01, 0.35, 0.9, { solid: false });
  P.rubble(-10.5, -12, 1.4, 8); P.crate(-8, -27, 0.9, 0.4); P.crate(-11.8, -22, 0.6, 1.1);
  M.marks.ch3 = new THREE.Vector3(-10, 0, -30); M.marks.ch3Yaw = 0;
  M.lights.push({ p: new THREE.Vector3(-10, 3, -20), c: 0xe8ecff, i: 30, d: 16 });
  // 街南側那排廠房：西段一樓打通成工廠（第 2 章 D0：西門進、東門出，繞到檢查哨側面）
  //   西端從 x -36 開始：再往西是商店南邊那棟（x -60～-36、z -92～-50）的量體，會凸進來
  keepRnd(() => {
    mass(-44, -36, -70, -48, 16, 'concrete', 'n', { shop: true, kit: 'factory' });
    mass(-5.7, 48, -70, -48, 16, 'concrete', 'n', { shop: true, kit: 'factory' });
    mass(-36, -5.7, -70, -60.3, 16, 'concrete', '');
    room(-35.7, -6, -60, -48.3, { h: 5.2, floor: 'floor', wall: 'concrete', ext: PL ? 'kbrick' : 'concrete', doors: { n: [[-33.3, 2.2], [-8.5, 2.2]] }, windows: { n: [[-28, 1.8], [-21.5, 1.8], [-15, 1.8]] }, upper: 16, upperWin: 'n', trim: PL ? 'kbrick' : null, lightP: 0.55 });
    // 柱子、機台（半人高，當掩護）
    for (const x of [-29, -21, -13]) P.column(x, -54.2, 5.2, 0.25);
    for (const [x0, x1, z0, z1, h] of [[-33.2, -31, -57.6, -55.6, 1.45], [-26.6, -24.2, -52.6, -50.9, 1.3], [-19.8, -17.4, -57.8, -55.8, 1.55], [-12.2, -10.2, -53.4, -51.6, 1.35]]) {
      b.block('paint', x0, x1, 0, h, z0, z1); b.deco('metal', x0 - 0.04, x1 + 0.04, h, h + 0.05, z0 - 0.04, z1 + 0.04);
      b.deco('void', x0 + 0.2, x0 + 0.7, h - 0.55, h - 0.15, z1, z1 + 0.02); b.deco('olive', x1 - 0.5, x1 - 0.1, h, h + 0.45, z0 + 0.2, z0 + 0.6);
    }
    P.shelf(-35.4, -32.4, -59.8, -59.2, 2.2, 'olive', [0.7, 1.45]); P.shelf(-14, -10.5, -59.8, -59.2, 2.2, 'paint2', [0.7, 1.45]);
    P.crate(-34.6, -52.8, 1.1, 0.2); P.crate(-9.3, -56.4, 1.1, 0.3); P.crate(-28.8, -58.9, 0.8, 1.1);
    P.barrel(-7.1, -58.9); P.barrel(-7.8, -59.4, 'rust');
    if (PL) {
      PL.add('metal_office_desk', -23, 0, -56.4, 0, { solid: true });
      PL.add('sofa_03', -26.4, 0, -59.25, 0, { solid: true, hit: 'wood' });
      for (const [x, z] of [[-21.5, -57.5], [-21.8, -58]]) PL.add('plastic_crate_02', x, 0, z, x);
      PL.add('hand_truck', -33.9, 0, -58.4, 1.1, { solid: true });
      for (const x of [-30, -21, -12]) PL.add('mounted_fluorescent_lights', x, 5.18, -54.2, Math.PI / 2, { cast: false, tilt: Math.PI });
    }
    M.lights.push({ p: new THREE.Vector3(-21, 4.6, -54), c: 0xe6ecff, i: 55, d: 22 });
  }, [-44, 48, -70, -48, 16, 'n', { shop: true, kit: 'factory' }]);
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
  P.barrel(-12.4, -35.6); P.barrel(-11.8, -36.2, 'rust'); P.barrel(24, -47);   // 前兩個油桶原本擋在商場走道門口正中間，往西挪到窗前
  // 封鎖線：獵犬軍團用兩層貨櫃把貨櫃場入口整排堵死
  for (const x of [17.05, 23.15, 29.25, 35.35]) { P.container(x, -33.9, 0, 0, 'olive'); P.container(x, -33.9, 0.01, 2.6); }
  P.sandbags(15, -38.5, 3.5, 0.2); P.sandbags(24, -41.5, 3, -0.1);
  // 第 2 章 D1：檢查哨的三台干擾器（發電機＋旁邊一支天線）：碎石堆旁、兩排護欄中間、東側護欄後面
  for (const [id, x, z, ry, mx, mz] of [['jam1', -5.2, -36.8, 0.4, -4.4, -36.2], ['jam2', 0.2, -45.3, 1.3, 0.9, -45.9], ['jam3', 4.6, -36.3, -0.3, 5.3, -35.6]]) {
    target(id, 'portable_generator', x, z, ry);
    b.deco('metal', mx - 0.025, mx + 0.025, 0, 2.6, mz - 0.025, mz + 0.025); b.deco('metal', mx - 0.35, mx + 0.35, 2.3, 2.33, mz - 0.015, mz + 0.015);
    b.deco('metal', mx - 0.25, mx + 0.25, 2.0, 2.03, mz - 0.015, mz + 0.015); b.deco('red', mx - 0.04, mx + 0.04, 2.6, 2.66, mz - 0.04, mz + 0.04);
  }
  M.zones.D = { x0: -44, x1: 36, z0: -48, z1: -34 };

  // ============================================================ E 貨櫃場（x 14～46，z -34～20）→ 第 3 章前
  // 西側倉庫：北段有一條穿堂（第 4 章從高架道路匝道下來，由這裡進貨櫃場）
  mass(6, 14, -34, 14, 12, 'corr', 'e', { kit: 'factory' });
  mass(6, 14, 19, 22, 12, 'corr', 'e');
  room(6.3, 13.7, 14.3, 18.7, { h: 3.4, wall: 'concrete', ext: 'corr', floor: 'floor', doors: { w: [[16.5, 2.4]], e: [[16.5, 2.4]] }, upper: 12, lightP: 1 });   // 室內原本是花紋鋼板牆＋地：改成混凝土
  P.crate(12.6, 15.2, 1.1, 0.2); P.barrel(7.2, 18, 'rust');
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
  M.marks.ch5 = new THREE.Vector3(28, 0, 14); M.marks.ch5Yaw = 0;
  ground('concrete', 14, 47, 22, 30);
  // 建築：入口大廳 → 中央走廊（北向）→ 兩側房間 → 機庫側門
  mass(14, 20, 22, 52, 8, 'concrete', 'e', { hide: { e: [29.7, 52] } });   // z 30 以北貼著室內：窗框不畫
  mass(44, 48, 22, 52, 8, 'concrete', 'w', { hide: { w: [29.7, 52] } });
  room(20, 44, 30, 36, { h: 3.6, wall: 'wall', ext: 'concrete', floor: 'floor', doors: { s: [[28, 3.2]], n: [[32, 2]] }, windows: { s: [[22], [38], [41]] }, upper: 8, lightP: 1 });
  // 北端到 51.75（機庫牆的外皮）：原本到 52，天花板和樓上量體會從機庫南牆凸出一片
  room(30, 34, 36, 51.75, { h: 3.4, wall: 'wall', floor: 'floor', doors: { s: [[32, 2]], n: [[32, 2]], w: [[40, 1.2], [47, 1.2]], e: [[43, 1.2]] }, noWall: 'n', upper: 8, lightP: 1 });
  room(20, 29.7, 36.3, 43.5, { h: 3.4, wall: 'wall', floor: 'tile', doors: { e: [[40, 1.2]] }, noWall: 'es', skin: 's', upper: 8, lightP: 0.8 });
  room(20, 29.7, 43.8, 51.75, { h: 3.4, wall: 'wall', floor: 'floor', doors: { e: [[47, 1.2]] }, noWall: 'esn', upper: 8, lightP: 0.8 });
  room(34.3, 44, 36.3, 51.75, { h: 3.4, wall: 'wall', floor: 'metal', doors: { w: [[43, 1.2]] }, noWall: 'wsn', skin: 's', upper: 8, lightP: 1 });
  // 營房床架、控制台
  for (const z of [37.5, 40, 42.3]) { b.block('metal', 21, 23.5, 0, 0.55, z - 0.45, z + 0.45); b.block('metal', 21, 23.5, 1.2, 1.3, z - 0.45, z + 0.45, { solid: false }); for (const [px, pz] of [[21, z - 0.45], [23.45, z - 0.45], [21, z + 0.4], [23.45, z + 0.4]]) b.deco('metal', px, px + 0.05, 0.55, 1.2, pz, pz + 0.05); }   // 上鋪加四根柱子（原本浮在半空）
  for (const z of [38, 42, 46, 50]) { b.block('dark' in mats ? 'dark' : 'olive', 42.3, 43.8, 0, 1.0, z - 1.2, z + 1.2); b.deco('lamp', 42.3, 42.35, 0.9, 1.3, z - 1, z + 1, { solid: false }); }
  P.crate(26, 47, 1.2); P.crate(24.5, 49, 1.0); P.crate(27.5, 50.5, 1.1, 0.4);
  doorFrame('x', 29.85, 28, 3.2);
  // 第 5 章 F2（潛行拿保險絲）：大廳原本空的，加櫃台、木箱、油桶當掩護；備用保險絲（紙箱）放在控制室的桌上
  //   這裡用到的亂數用完還原，後面整張地圖的樣子不變
  {
    const s0 = seed;
    if (PL) PL.add('metal_office_desk', 37, 0, 34.9, 0, { solid: true });   // 櫃台（大廳北牆邊）
    P.crate(42.6, 31.2, 1.1, 0.15); P.crate(21.3, 35.1, 1.0, 1.5);
    P.barrel(25.6, 35.3, 'rust'); P.barrel(26.3, 35.45, 'rust');
    item('fuse', 'cardboard_box_01', 38.3, 0.79, 45, 0.4, { noBreak: true });   // 控制室桌面 y 0.79
    seed = s0;
  }
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
  // 屋頂鋼桁架（上下弦＋斜撐），每 6 m 一榀
  for (let z = HZ0 + 3; z < HZ1; z += 6) {
    const yt = HH - 0.3, yb = HH - 3.2;
    b.deco('metal', HX0, HX1, yt - 0.25, yt, z - 0.12, z + 0.12, { dim: 0.7, ground: -99 });
    b.deco('metal', HX0, HX1, yb, yb + 0.25, z - 0.12, z + 0.12, { dim: 0.7, ground: -99 });
    for (let x = HX0 + 1.5; x < HX1 - 1; x += 3) {
      const g = new THREE.BoxGeometry(0.1, Math.hypot(3, 2.9), 0.1).rotateZ(((x - HX0) / 3) % 2 < 1 ? 0.8 : -0.8);
      b.mesh('metal', g, x, (yt + yb) / 2, z, 0, { shade: 0.7 });
      b.deco('metal', x - 0.05, x + 0.05, yb, yt, z - 0.05, z + 0.05, { dim: 0.7, ground: -99 });
    }
  }
  // 從天花板垂到機體背後的粗電纜
  for (const [dx, dz, r] of [[-2.5, 3, 0.09], [0, 3.5, 0.12], [2.5, 3, 0.09], [-1.2, 4, 0.07], [1.4, 4.2, 0.07]]) {
    const a0 = new THREE.Vector3(MX + dx * 2.2, HH - 3.3, MZ + dz + 3), a1 = new THREE.Vector3(MX + dx, 14, MZ + dz);
    const mid = a0.clone().lerp(a1, 0.5).add(new THREE.Vector3(0, -2.5, 1));
    const tube = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a0, mid, a1), 20, r, 8);
    b.mesh('void', tube, 0, 0, 0, 0, { shade: 0.6 });
  }
  // 地面：黃色走道線、油漬、機位編號
  for (const x of [HX0 + 6, HX1 - 6]) P.stripe(x - 0.08, x + 0.08, HZ0 + 2, HZ1 - 4);
  P.stripe(HX0 + 6, HX1 - 6, HZ0 + 8, HZ0 + 8.16);
  {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const x = cv.getContext('2d');
    x.fillStyle = 'rgba(210,170,40,0.85)'; x.font = '900 230px Rajdhani, Arial Black, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('07', 256, 138);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const mk = (w, h, px, py, pz, ry, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.position.set(px, py, pz); m.rotation.set(rx, ry, 0); m.receiveShadow = true; m.userData.noAO = true; scene.add(m); };
    mk(12, 6, MX, 0.04, MZ - 16, 0, -Math.PI / 2);          // 地上
    mk(16, 8, MX, 20, HZ1 - 0.3, Math.PI);                    // 後牆
    const oil = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, roughness: 0.15, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    for (const [ox, oz, r] of [[36, 90, 1.6], [45, 84, 1.1], [27, 70, 2], [55, 66, 1.4], [40, 76, 0.9]]) { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 20).rotateX(-Math.PI / 2), oil); m.scale.set(1, 1, 0.6 + rnd() * 0.5); m.position.set(ox, 0.03, oz); m.receiveShadow = true; m.userData.noAO = true; scene.add(m); }
  }
  // 第 5 章多出來的段落（script.js 的 G1 目標、G3 配電箱、G4 守點）；亂數用完還原，後面的樣子不變
  {
    const s0 = seed;
    // G1：獵犬軍團的拖吊機（東門內側）：絞盤＋兩台發電機（任務目標），兩條鋼纜拖在地上接到蒼焰腳邊
    target('tow1', 'portable_generator', 64.2, 65.3, 0.3);
    target('tow2', 'portable_generator', 64.6, 71.7, -0.25);
    if (PL) { PL.add('metal_jerrycan_green', 63.5, 0, 64.7, 0.5); PL.add('metal_jerrycan_green', 63.9, 0, 72.4, 2.1); }
    b.block('metal', 65.7, 67.1, 0, 0.12, 67.5, 69.5, { solid: false });
    b.block('paint', 65.8, 67.0, 0.12, 1.25, 67.55, 67.7, { solid: false }); b.block('paint', 65.8, 67.0, 0.12, 1.25, 69.3, 69.45, { solid: false });
    b.mesh('olive', new THREE.CylinderGeometry(0.42, 0.42, 1.56, 16).rotateX(Math.PI / 2), 66.4, 0.72, 68.5, 0, { shade: 0.85 });
    b.mesh('metal', new THREE.CylinderGeometry(0.47, 0.47, 1.2, 16).rotateX(Math.PI / 2), 66.4, 0.72, 68.5, 0, { shade: 0.75 });   // 捲在上面的鋼纜
    b.block('olive', 66.95, 67.55, 0.12, 0.85, 68.1, 68.9, { solid: false });   // 馬達箱
    solid.add({ x0: 65.7, x1: 67.6, y0: 0, y1: 1.25, z0: 67.5, z1: 69.5, mat: 'metal' });
    const cable = (x0, y0, z0, x1, y1, z1) => {
      const dx = x1 - x0, dz = z1 - z0, dh = Math.hypot(dx, dz), L = Math.hypot(dh, y1 - y0);
      b.mesh('metal', PR.pipeGeo(L, 0.035).rotateX(Math.PI / 2).rotateX(-Math.atan2(y1 - y0, dh)), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(dx, dz), { shade: 0.8 });
    };
    // 右腳踝 (42.5, 103.6)、左腳踝 (37.4, 101.8)；左邊那條繞過地上的發電機 (48, 88)
    cable(65.95, 0.3, 68.9, 42.6, 0.05, 101.2); cable(42.6, 0.05, 101.2, 42.55, 0.9, 103.1);
    cable(65.95, 0.3, 68.1, 50, 0.05, 89.5); cable(50, 0.05, 89.5, 37.6, 0.05, 99.5); cable(37.6, 0.05, 99.5, 37.45, 0.9, 101.4);
    // G3：維修架的兩個配電箱在西側走道（y 7）上，靠牆；走道內側加三片防彈鋼板當掩護（對面走道有狙擊手）
    //   配電箱本身只是擺設（item 不放模型：按 E 裝保險絲時配電箱不會跟著消失）；按 E 的點在箱子前面的走道上，沿走道直走就到（不會卡在柱子）
    for (const z of [76, 100.5]) if (PL) PL.add('utility_box_02', HX0 + 0.47, CW, z, Math.PI / 2, { solid: true, hit: 'metal', noBreak: true });
    item('panel1', null, HX0 + 1.3, CW, 76); item('panel2', null, HX0 + 1.3, CW, 100.5);
    for (const [z0, z1] of [[63, 64.6], [73.6, 75.2], [88, 89.6]]) {
      b.block('paint', HX0 + 2.5, HX0 + 2.68, CW, CW + 1.15, z0, z1);
      b.deco('metal', HX0 + 2.3, HX0 + 2.88, CW, CW + 0.05, z0 + 0.1, z0 + 0.3); b.deco('metal', HX0 + 2.3, HX0 + 2.88, CW, CW + 0.05, z1 - 0.3, z1 - 0.1);   // 兩隻腳
    }
    // 北側走道（y 7）和上層平台（y 12.4）的木箱：守在上面的敵人有東西躲
    P.crate(23, HZ1 - 1.3, 1.0, 0.1, CW); P.crate(18.3, HZ1 - 1.2, 0.8, 0.3, GY);
    seed = s0;
  }
  M.zones.G = { x0: HX0, x1: HX1, z0: HZ0, z1: HZ1 };
  M.marks.hatch = new THREE.Vector3(MX, GY, MZ - 3.2);

  // ============================================================ 北區（第 3、4 章）：H 住宅街、I 市立醫院、K 後院、J 高架道路、L 倉庫空地
  function northDistrict() {
    // ---- H 北區住宅街（x -60～-2，z -8～6）：商場走道北門出來，往西走到街底的醫院
    ground('floor', -60, -2, -8, 6);
    b.deco('concrete', -60, -2, 0, 0.15, 4.8, 6);
    mass(-36, -2, 6, 20, 16, 'brick', 's', { shop: true, kit: 'apt' });
    mass(-2, 6, -8, 14, 18, 'wall', 'w', { kit: 'apt' });
    P.deck(-26, -20, 4.6, 6, 3.6, 'concrete'); P.rail('x', 4.7, -26, -20, 3.6);   // 二樓陽台
    P.car(-44, -3, 0.3); P.car(-30, 2, 2.9); P.car(-16, -5, 1.4); P.car(-57, -4, 0.2);
    // 街底燒毀的公車（擋住東邊）
    { const g = PR.bus(); b.mesh('burnt', g.body, -4.5, 0, -1.5, 0.15, { shade: 1 }); b.mesh('void', g.dark, -4.5, 0, -1.5, 0.15, { shade: 1 }); b.mesh('metal', g.metal, -4.5, 0, -1.5, 0.15, { shade: 1 }); }
    solid.add(aabb(-4.5, 1.5, -1.5, 1.25, 1.5, 5.2, 0.15, 'metal')); scorch(-4.5, 0, -1.5, 7, 0.15);   // 碰撞盒跟原本一樣
    P.jersey(-38, -1, 1.2); P.jersey(-24, -4, 0.2); P.sandbags(-47, 1.5, 4, 0.1);
    P.dumpster(-9, 4.2, 0); P.rubble(-34, 3, 2.4, 16); P.rubble(-13, -6.2, 1.6, 10);
    P.crate(-20, -6.5, 1.1, 0.3); P.crate(-19, -6.9, 0.9, 1); P.barrel(-41, 4.5); P.barrel(-40.4, 4.1, 'rust');
    P.puddle(-28, -3, 3, 2, 0.4); P.puddle(-49, -5, 2.5, 1.6, 1);
    for (const x of [-30, -14]) P.ac(x, 4.5, 5.75, Math.PI);
    M.zones.H = { x0: -60, x1: -2, z0: -8, z1: 6 };

    // ---- I 市立醫院（x -60～-36，z 6～34）：南邊急診大門 → 大廳 → 北邊病房區 → 東門出後院
    // 大廳東牆開一個 7 m 寬的口，通到櫃台後面的病歷室（第 3 章 I0：找隼的病歷）
    room(-59.6, -44, 6.3, 18, { h: 4, floor: 'tile', wall: 'plaster', ext: 'concrete', doors: { s: [[-52, 3]], n: [[-48, 2]], e: [[12, 7]] }, windows: { s: [[-57.3, 2], [-46.7, 2]] }, upper: 16, upperWin: 's', lightP: 0.7 });
    room(-59.6, -36.3, 18.3, 34, { h: 3.6, floor: 'tile', wall: 'plaster', ext: 'concrete', doors: { e: [[28, 2]], s: [[-48, 2]] }, noWall: 's', skin: 's', windows: { e: [[22, 1.6], [32, 1.6]] }, upper: 16, lightP: 0.6 });
    // 病歷室（x -43.7～-36.3，z 6.3～17.7）：原本這裡是實心的樓（mass），外框跟原本一樣；西邊靠大廳的東牆（上面開的口），不另外蓋牆
    //   原本的 mass 抽了 16 次 rnd（窗戶亮不亮、破不破）：這裡蓋完把 rnd 接回原本的位置，後面的車、木箱、窗戶長相都不變
    {
      const s0 = seed, k0 = hk;
      room(-43.7, -36.3, 6.3, 17.7, { h: 3.6, floor: 'tile', wall: 'plaster', ext: 'concrete', doors: { w: [[12, 7]] }, noWall: 'w', skin: 'w', windows: { s: [[-41.45, 1.6], [-38.25, 1.6]] }, lightP: 1 });
      mass(-43.7, -36, 6, 18, 16, 'concrete', 's', { y0: 3.9 });
      // 病歷櫃兩排（東西向）、東牆的辦公桌、東南角的檔案櫃、東北角的矮櫃、一個倒下的櫃子、地上散落的病歷
      P.shelf(-43.3, -39.8, 7.5, 8.1, 2.1, 'paint', [0.45, 1.0, 1.55]); P.shelf(-43.3, -39.8, 9.3, 9.9, 2.1, 'paint', [0.45, 1.0, 1.55]);
      b.block('paint2', -37.25, -36.3, 0, 0.74, 10.3, 12.1); b.deco('metal', -37.3, -36.3, 0.74, 0.78, 10.25, 12.15, { solid: false });
      b.block('paint', -36.95, -36.3, 0, 1.3, 6.5, 9.6); for (const z of [7.53, 8.57]) b.deco('void', -36.97, -36.95, 0.05, 1.28, z - 0.01, z + 0.01, { solid: false });
      for (const y of [0.45, 0.88]) b.deco('void', -36.97, -36.95, y - 0.01, y + 0.01, 6.5, 9.6, { solid: false });
      b.block('paint', -38.6, -36.3, 0, 1.25, 17.05, 17.7); b.deco('metal', -38.62, -36.3, 1.25, 1.28, 17.03, 17.7, { solid: false });
      b.block('paint', -41.2, -39.6, 0, 0.55, 14.1, 14.7);   // 倒下的檔案櫃（矮掩體）
      for (const [x, z, ry] of [[-42.2, 12.4, 0.3], [-41.6, 11.2, 1.2], [-39.3, 13.1, 2.1], [-40.4, 15.8, 0.7], [-38.1, 10.4, 2.6], [-42.8, 14.9, 1.9], [-45.2, 13.3, 0.9], [-39.2, 7.0, 0.4]])
        b.obox('canvas', x, 0.034, z, 0.15, 0.004, 0.21, ry, { solid: false, tint: [0.86, 0.85, 0.8] });
      M.lights.push({ p: new THREE.Vector3(-40, 3.1, 12), c: 0xe4ecff, i: 28, d: 14 });
      // 三份病歷（走近按 E）：掛號櫃台上、東牆辦公桌上、東北角矮櫃上
      item('rec_a', 'cardboard_box_01', -46.2, 1.16, 12.1, 0.4, { scale: 0.75, noBreak: true });
      item('rec_b', 'cardboard_box_01', -36.8, 0.78, 11.2, 0.2, { scale: 0.7, noBreak: true });
      item('rec_c', 'cardboard_box_01', -37.4, 1.28, 17.35, -0.3, { scale: 0.7, noBreak: true });
      seed = s0; for (let i = 0; i < 16; i++) rnd();
      hk = k0;
    }
    b.block('concrete', -43.7, -36, 0, 3.6, 18, 18.3);   // 病房南邊、大廳東邊之間 30 cm 的縫補起來
    // 急診雨遮＋紅十字
    b.block('concrete', -55.5, -48.5, 3.9, 4.2, 2.8, 6); P.column(-55, 3.3, 3.9, 0.2); P.column(-49, 3.3, 3.9, 0.2);
    b.deco('red', -52.4, -51.6, 5.2, 7.6, 5.9, 6.0, { solid: false }); b.deco('red', -53.2, -50.8, 6.0, 6.8, 5.9, 6.0, { solid: false });
    // 急診門口的油桶陷阱（第 3 章 H3）：三堆，每堆一桶是任務目標、旁邊再放一桶（打爆會連鎖）；彼此隔 4.5 m 以上，不會一發全炸
    target('trapW', 'Barrel_01', -55.9, 5.3, 0.4); target('trapE', 'Barrel_01', -49.6, 5.3, 2.2); target('trapS', 'Barrel_01', -52.6, 1.6, 1.1);
    if (PL) for (const [x, z, ry] of [[-56.75, 5.4, 1.3], [-48.8, 5.5, 0.2], [-51.8, 1.3, 2.9]]) PL.add('Barrel_01', x, 0, z, ry, { solid: true, hit: 'metal' });
    for (const [x, z] of [[-55.9, 5.3], [-49.6, 5.3], [-52.6, 1.6]]) b.deco('void', x - 0.012, x + 0.012, 0.03, 0.045, z - 1.1, z - 0.36, { solid: false });   // 桶子接出來的引線
    // 大廳：掛號櫃台、候診椅、推床、敵人的沙包
    b.block('paint2', -50, -45.5, 0, 1.1, 11.6, 12.6); b.deco('metal', -50.1, -45.4, 1.1, 1.16, 11.5, 12.7, { solid: false });
    // 候診椅：一排五張（碰撞仍是一整條）
    for (const z of [8.5, 10.5]) {
      solid.add({ x0: -58.5, x1: -54, y0: 0, y1: 0.5, z0: z, z1: z + 0.6, mat: 'metal' });
      b.deco('metal', -58.5, -54, 0.36, 0.4, z + 0.05, z + 0.55);
      for (let i = 0; i < 5; i++) { const x = -58.5 + 0.1 + i * 0.88; b.deco('paint', x, x + 0.8, 0.4, 0.46, z + 0.04, z + 0.52, { tint: [0.5, 0.62, 0.75] }); b.deco('paint', x, x + 0.8, 0.5, 0.92, z + 0.52, z + 0.58, { tint: [0.5, 0.62, 0.75] }); }
      for (const x of [-58.3, -56.25, -54.2]) b.deco('metal', x - 0.03, x + 0.03, 0, 0.36, z + 0.25, z + 0.35);
    }
    b.block('metal', -46.5, -45, 0.6, 0.8, 7.5, 9.6); for (const [x, z] of [[-46.3, 7.7], [-45.2, 7.7], [-46.3, 9.4], [-45.2, 9.4]]) b.deco('metal', x - 0.03, x + 0.03, 0, 0.6, z - 0.03, z + 0.03, { solid: false });
    P.sandbags(-51, 15, 3, 0); P.crate(-57.5, 16.5, 1.0, 0.3);
    // 病房區：床、隔簾、半高隔牆（掩護）、護理站
    for (const x of [-57, -52, -47, -42]) {
      bed(x, 31.6, 33.6); b.deco('metal', x - 0.5, x + 0.5, 0.6, 1.3, 33.5, 33.6, { solid: false });
      b.mesh('canvas', PR.curtain(3.8, 2.3), x + 2.32, 0.2, 31.9, 0, { shade: 0.95, tint: [0.44, 0.54, 0.52] });   // 淡綠色病床隔簾（有皺褶）
      b.deco('metal', x + 2.29, x + 2.35, 2.5, 2.54, 29.95, 33.85); for (const rz of [30.4, 33.4]) b.deco('metal', x + 2.305, x + 2.335, 2.54, 3.6, rz, rz + 0.03);   // 隔簾的軌道和吊桿（原本簾子浮在半空）
    }
    for (const x of [-56, -45]) b.block('plaster', x - 1.8, x + 1.8, 0, 1.4, 25.8, 26.1);
    b.block('paint2', -51.5, -48.5, 0, 1.05, 21.5, 23);   // 護理站
    b.block('plaster', -41, -40.7, 0, 1.4, 19, 23);
    // 隼的病床（最東邊）：空的床、床單上的血、床邊桌上的啟動金鑰
    const kx = -38.6, kz = 32.4;
    bed(kx - 1.2, 31.6, 33.6);
    b.deco('red', kx - 1.5, kx - 0.95, 0.751, 0.76, 32.2, 33.1, { solid: false }); b.deco('red', kx - 2.2, kx - 1.2, 0.035, 0.04, 30.8, 31.6, { solid: false });
    b.block('metal', kx - 0.4, kx + 0.4, 0, 0.8, kz - 0.4, kz + 0.4);
    const key = new THREE.Group();
    key.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.035, 0.24), new THREE.MeshStandardMaterial({ color: 0x1e2227, roughness: 0.4, metalness: 0.8 })));
    const kl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.037, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.6, 2.6) })); kl.userData.noAO = true; key.add(kl);
    key.position.set(kx, 0.82, kz); key.rotation.y = 0.5; scene.add(key);
    M.keyMesh = key; M.marks.key = new THREE.Vector3(kx, 0, kz);
    M.lights.push({ p: new THREE.Vector3(-52, 3.4, 12), c: 0xe4ecff, i: 50, d: 20 }, { p: new THREE.Vector3(-46, 3, 28), c: 0xdfe6ff, i: 45, d: 22 });
    M.zones.I = { x0: -60, x1: -36, z0: 6, z1: 34 };

    // ---- K 醫院後院（x -36～-2，z 20～50）：逃生梯上高架道路
    ground('concrete', -36, -2, 20, 50);
    mass(-60, -36, 34.3, 50, 16, 'concrete', 'e');
    b.block('concrete', -2.3, -2, 0, 3, 20, 40); b.block('concrete', -2.3, -2, 0, 5.4, 40, 50);   // 東側擋土牆（匝道在牆後）
    P.stairs(-32, -29.5, 32, 40, 0, 6, 'z', 1);
    { const g = PR.van(); b.mesh('paint2', g.body, -14, 0, 30, 0.4, { shade: 1 }); b.mesh('void', g.dark, -14, 0, 30, 0.4, { shade: 1 }); b.mesh('metal', g.metal, -14, 0, 30, 0.4, { shade: 1 }); b.mesh('glass', g.glass, -14, 0, 30, 0.4, { shade: 0.8 }); }
    solid.add(aabb(-14, 1.3, 30, 1.2, 1.3, 3, 0.4, 'metal'));   // 救護車（碰撞盒跟原本的方塊一樣）
    P.car(-24, 24, 1.0); P.dumpster(-34.6, 22, Math.PI / 2); P.crate(-6, 36, 1.1); P.crate(-7.2, 35.3, 0.8, 0.6); P.barrel(-4, 23); P.barrel(-4.6, 22.5, 'rust');
    P.rubble(-20, 37, 2, 12); P.puddle(-26, 30, 3, 2, 0.3);
    M.marks.ch4 = new THREE.Vector3(-33, 0, 27); M.marks.ch4Yaw = 0.4;

    // ---- J 高架道路（橋面 y＝6，x -36～6，z 40～50）：路障、燒毀的車、翻倒的貨櫃
    const DY = 6;
    b.block('concrete', -36, 6, DY - 0.6, DY, 40, 50);
    for (const x of [-30, -18, -6]) for (const z of [41.5, 48.5]) P.column(x, z, DY - 0.6, 0.6);
    b.block('concrete', -36, -32.2, DY, DY + 1, 40, 40.4); b.block('concrete', -29.3, -2, DY, DY + 1, 40, 40.4);
    b.block('concrete', -36, 6, DY, DY + 1, 49.6, 50);
    b.deco('concrete', -36, 6, DY, DY + 0.02, 44.9, 45.1, { solid: false, skip: 'ny' });   // 中線
    const hulk = (x, z, ry) => { const r = rnd(), g = PR.car(Math.floor(r * 97) % 3, true); b.mesh('burnt', g.body, x, DY, z, ry, { shade: 1 }); carBoxes(g.body, x, DY, z, ry, DY + 1.2); b.mesh('void', g.dark, x, DY, z, ry, { shade: 1 }); b.mesh('metal', g.metal, x, DY, z, ry, { shade: 1 }); scorch(x, DY, z, 3.4, ry); };
    const barrier = (x, z, ry) => {
      if (!(PL && PL.M.has('concrete_road_barrier_02'))) return b.obox('concrete', x, DY + 0.45, z, 1.5, 0.45, 0.3, ry, { hitMat: 'concrete' });
      const c = Math.cos(ry), s = Math.sin(ry);   // 跟地面上一樣用掃描的紐澤西護欄，兩節一組（不抽 rnd，別處的樣子不變）
      for (const d of [-0.79, 0.79]) PL.add('concrete_road_barrier_02', x + d * c, DY, z - d * s, ry + (ph(x + d, z) - 0.5) * 0.08, { solid: true, hit: 'concrete', noBreak: true });   // 跟原本一樣打不爛（玩法不變）
    };
    hulk(-24, 43, 0.4); hulk(-12.2, 47, 1.62); hulk(1, 42.5, 1.3);   // 第二台原本斜放在 (-12, 47.5)、頂到北側護欄，北側車道走到這裡是死路；改順著車道停，北邊留 1.5 m 過得去
    P.container(-16, 44, 0.3, DY, 'olive'); P.container(-5, 46.6, 0, DY);   // 第二個貨櫃原本 (-5, 47) 斜放，北邊只剩 0.5 m 看起來能走其實卡住；擺正、往南一點，北側護欄邊留 1.8 m
    barrier(-20, 46, 1.4); barrier(-8, 43, 0.1); barrier(-1, 46.5, 1.6); barrier(3.5, 44.5, 0.2);
    P.crate(-27, 47.5, 1.1, 0.2, DY); P.crate(-34.4, 48.6, 0.9, 0.9, DY);   // 第二個木箱原本在 (-3, 41.5)，擋住南側車道往匝道的路，移到橋的西端
    // 干擾器（第 4 章 J3，指揮所斷訊的原因）：發電機＋旁邊一根天線桿。一台在護欄 (-8, 43) 南邊（不擋南側車道），
    //   一台在那道護欄和第二個貨櫃之間的凹處（從南側車道往北看得到），一台架在翻倒的貨櫃頂上；都不在匝道口（J4 守點）附近
    //   天線桿是固定的外觀，發電機炸掉後桿子留著
    for (const [id, x, y, z, ry] of [['jamA', -8.0, DY, 42.2, 0.05], ['jamB', -5.2, DY, 44.2, 0.05], ['jamC', -14.0, DY + 2.6, 44.0, 0.3]]) {
      target(id, 'portable_generator', x, z, ry, y);
      const ax = x + 0.62 * Math.cos(ry), az = z - 0.62 * Math.sin(ry);
      b.deco('metal', ax - 0.025, ax + 0.025, y, y + 2.1, az - 0.025, az + 0.025, { solid: false });
      for (const [h, w] of [[1.55, 0.32], [1.85, 0.22], [2.05, 0.14]]) b.deco('metal', ax - w, ax + w, y + h, y + h + 0.025, az - 0.012, az + 0.012, { solid: false });
      b.deco('rust', ax - 0.035, ax + 0.035, y + 2.1, y + 2.16, az - 0.035, az + 0.035, { solid: false });   // 桿頂（不放亮燈：炸掉後還亮著會像沒炸掉）
    }
    M.zones.J = { x0: -36, x1: 6, z0: 40, z1: 50 };

    // ---- 匝道（x -2～6，z 26～40，從橋面降到地面）＋底下的擋土塊（不讓人從下面鑽過去）
    const RA = Math.atan2(DY, 14), RL = Math.hypot(DY, 14);
    const rg = new THREE.BoxGeometry(8, 0.6, RL).rotateX(-RA);
    b.mesh('concrete', rg, 2, 3 - 0.3 * Math.cos(RA), 33 + 0.3 * Math.sin(RA), 0, { shade: 0.9 });   // 給定明暗：預設以中心當地面，下半段會變成全黑
    solid.add({ x0: -2, x1: 6, z0: 26, z1: 40, y0: 0, y1: DY, ramp: { axis: 'z', dir: 1 }, mat: 'concrete' });
    // 匝道西側矮牆（高出路面 1 m）：原本從 x < -2 踩出去會掉進後院
    { const wg = new THREE.BoxGeometry(0.3, 1, RL).rotateX(-RA); b.mesh('concrete', wg, -2.15, 3 + 0.5 * Math.cos(RA), 33 - 0.5 * Math.sin(RA), 0, { shade: 0.85 });
      for (let z = 26; z < 40; z++) solid.add({ x0: -2.3, x1: -2, y0: 0, y1: (DY * (z + 1 - 26)) / 14 + 1.05, z0: z, z1: z + 1, mat: 'concrete' }); }
    // 底下實心：碰撞照舊一公尺一格；外觀改成一整塊斜楔（原本一格格的台階從側面看是鋸齒、露縫）
    for (let z = 26; z < 40; z++) { const h = (DY * (z - 26)) / 14 - 0.35; if (h > 0.05) solid.add({ x0: -2, x1: 6, y0: 0, y1: h, z0: z, z1: z + 1, mat: 'concrete' }); }
    { const z0 = 26 + 0.3 * 14 / DY, wg = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(z0, 0), new THREE.Vector2(40, 0), new THREE.Vector2(40, DY - 0.3)]), { depth: 8, bevelEnabled: false }).rotateY(-Math.PI / 2); b.mesh('concrete', wg, 6, 0, 0, 0, { shade: 0.8 }); }
    // ---- L 倉庫空地（x -2～6，z 14～26）
    ground('concrete', -2, 6, 14, 26);
    mass(6, 10, 22, 50, 14, 'concrete', '');
    P.car(1.5, 18.5, 0.2); P.crate(4.6, 24.5, 1.1, 0.4); P.barrel(-1, 15); P.barrel(-0.4, 15.6, 'olive');
    M.zones.L = { x0: -2, x1: 6, z0: 14, z1: 26 };

    // ---- 北邊填空（橋面北側的樓，樓頂有狙擊手）
    mass(-60, 10, 50, 114, 16, 'concrete', 's');
  }

  // ============================================================ 其他填空的建築量體（圍住路線以外的空地）
  mass(-114, -60, -8, 114, 18, 'brick', 'e');
  northDistrict();
  mass(-36, 6, -92, -70, 12, 'wall', '');
  mass(6, 48, -114, -70, 12, 'concrete', '');
  mass(-82, -36, -114, -92, 10, 'wall', '');
  mass(-114, -95, -114, -112, 13, 'wall', '');
  mass(14, 20, 52, 54, 1, 'concrete', '', { noParapet: true });
  mass(70, 114, 80, 114, 10, 'corr', 'w');
  mass(10, 14, 22, 52, 8, 'concrete', '');
  mass(-64, -60, -30, -8, 12, 'wall', '');

  if (PL) dress(PL, P, rnd);
  // 街上的油漬、舊的爆炸燒痕（固定位置）
  for (const [x, z, r, t] of [[-24, -40, 3, 1], [-9, -43, 4.5, 0], [12, -38, 2.5, 1], [-36, -2, 4, 0], [-22, 1, 2.6, 1], [-52, -5, 3, 1], [-20, 28, 3.5, 0], [-28, 42, 2.4, 1], [-12, 45, 3.8, 0], [30, -10, 3, 1], [24, 4, 2.8, 1], [-78, -36, 3.2, 1], [-86, -44, 2.5, 0], [-91, -70, 1.8, 1], [40, 80, 3, 1]])
    scorch(x, x > -30 && x < 6 && z > 40 ? 6 : 0, z, r, ph(x, z) * 6, t);
  buildDecals(scene, DEC);
  // 遠方幾柱濃煙（在街區外、底部藏在外圍高樓後面）
  scene.add(PR.smokePlumes([[-60, 10, -240, 80, 280], [170, 10, -150, 110, 330], [230, 10, 110, 70, 240], [40, 10, 250, 120, 340], [-210, 10, 150, 90, 280], [-240, 10, -90, 60, 220]]));
  M.meshes = b.build(scene);
  return M;
}

// 貼花網格：一張程式畫的 2×2 圖集，相乘混色（只會把底下變暗），不投影子、不寫深度
function buildDecals(scene, list) {
  if (!list.length) return;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const x = cv.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
  let sd = 3; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const blob = (cx, cy, rad, a, col = '20,17,15') => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); };
  x.save(); x.beginPath(); x.rect(0, 0, 256, 256); x.clip();
  // 0 燒焦：不規則的一片焦黑，邊緣碎斑
  for (let i = 0; i < 120; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.6) * 100; blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 8 + r() * 30, 0.1 + r() * 0.22); }
  blob(128, 128, 80, 0.45);
  x.restore(); x.save(); x.beginPath(); x.rect(256, 0, 256, 256); x.clip();
  // 1 油漬／濕的地面
  for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.7) * 85; blob(384 + Math.cos(a) * d, 128 + Math.sin(a) * d * 0.7, 8 + r() * 24, 0.06 + r() * 0.12, '34,31,28'); }
  x.restore(); x.save(); x.beginPath(); x.rect(0, 256, 256, 256); x.clip();
  // 2 窗戶冒出來的煙燻：貼著窗楣一整條黑，往上像火舌一樣散開變淡
  for (let i = 0; i < 200; i++) { const t = Math.pow(r(), 0.8), rad = 10 + t * 26, y = 504 - t * 200, w = 70 + t * 110; blob(Math.min(236 - rad, Math.max(20 + rad, 128 + (r() - 0.5) * w)), y, rad, (1 - t) * 0.16 + 0.02, '12,11,10'); }
  for (let i = 0; i < 14; i++) blob(50 + i * 12, 506, 18, 0.3, '8,7,6');
  x.restore(); x.save(); x.beginPath(); x.rect(256, 256, 256, 256); x.clip();
  // 3 窗台下往下流的水痕
  for (let i = 0; i < 46; i++) { const px = 270 + r() * 228, len = 60 + r() * 180, g = x.createLinearGradient(0, 262, 0, 262 + len); g.addColorStop(0, `rgba(38,34,30,${0.18 + r() * 0.3})`); g.addColorStop(1, 'rgba(38,34,30,0)'); x.fillStyle = g; x.fillRect(px, 262, 2 + r() * 7, len); }
  x.restore();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const P = [], U = [], I = [];
  for (const [t, cx, cy, cz, u, v] of list) {
    const u0 = (t % 2) * 0.5 + 0.004, v0 = t < 2 ? 0.504 : 0.004, s = 0.492, k = P.length / 3;
    for (const [a, bb, uu, vv] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) { P.push(cx + u[0] * a + v[0] * bb, cy + u[1] * a + v[1] * bb, cz + u[2] * a + v[2] * bb); U.push(u0 + uu * s, v0 + vv * s); }
    I.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere();
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor }));
  m.material.forceSinglePass = true; m.userData.noAO = true; m.renderOrder = 1; m.name = 'decals'; scene.add(m);
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
  for (const [x, z] of [[-93.9, -84], [-89.3, -77.8], [-93.6, -66.2]]) A('old_tyre', x, 0.28, z, rnd() * 6, { tilt: 1.4 + rnd() * 0.3 });   // 第二個原本在 (-89, -74.5)，擋在修車行西門口
  A('water_manhole_cover', -91.5, 0.01, -78, 0, { cast: false });
  for (let i = 0; i < 6; i++) A('trashbag', -93.8 + rnd() * 0.6, 0, -88 + rnd() * 3, rnd() * 6, { scale: 0.9 + rnd() * 0.4 });
  // 市場廣場：塑膠箱、油桶、推車、發電機
  for (const [x, z] of [[-86.8, -49.4], [-85.7, -49.1], [-80.5, -51.3], [-74, -47.4], [-88.8, -40.3], [-70.5, -39.3]]) { A('plastic_crate_02', x, 0, z, rnd() * 3); A('plastic_crate_02', x + 0.05, 0.25, z, rnd() * 3); }
  A('hand_truck', -63, 0, -46, 1.2, { solid: true });
  A('portable_generator', -64, 0, -35, 0.4, { solid: true });
  A('metal_jerrycan_green', -63.2, 0, -34.4, 1.2); A('metal_jerrycan_green', -63.5, 0, -34.1, 1.3);
  A('propane_tank', -93.5, 0, -52, 0); A('propane_tank', -93.1, 0, -51.6, 0);
  for (const x of [-84.5, -78.5, -69.5]) A('exterior_aircon_unit', x, 4.3, -61.8, 0, { scale: 0.6 });   // 掛在廣場南側樓的外牆（z -62）兩窗之間；原本在 z -58.5 半空中（一台還在巷口正上方）
  // 檢查哨街道：電箱、人孔蓋、輪胎、軍用木箱、探照燈用的發電機
  for (const [x, z] of [[-30, -34.4], [-3.5, -34.4], [8, -47.6]]) A('utility_box_02', x, 0, z, x > 0 ? 0 : Math.PI, { solid: true });   // 中間那個原本擋在商場走道門口，移到東邊牆邊
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
