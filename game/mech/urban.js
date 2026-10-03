// 共用日文招牌圖集；介面與劇情仍由各遊戲使用繁體中文。
import * as THREE from 'three';
export const SHOP_LABELS = ['パン屋', '喫茶店', '青果店', '理容室', '食堂', '薬局', 'さくら旅館', '自転車店'];

export const SHOP_SUBTITLES = ['焼きたてパン', '自家焙煎珈琲', '新鮮な野菜', 'カット・シェービング', '', '', '素泊まり歓迎', '修理承ります'];
export const PORT_LABELS = ['神戸港', '避難経路', '税関倉庫・貨物埠頭・防波堤'];
export const CIVIC_LABELS = ['止まれ', '三宮駅', '元町商店街', '稲荷神社', '神戸港', '避難場所', '30', '横断歩道'];
export const JAPANESE_FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

// 集合住宅的小口磁磚：接縫依世界公尺取樣，共用既有掃描圖，不新增下載或大貼圖。
export function japaneseWall(source) {
  const material=source.clone(),compile=source.onBeforeCompile;
  material.color.set(0xffffff);material.name='japanese-ceramic';
  material.onBeforeCompile=sh=>{
    compile(sh);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vJpWall,vJpNormal;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvJpWall=(modelMatrix*vec4(transformed,1.0)).xyz;vJpNormal=mat3(modelMatrix)*objectNormal;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vJpWall,vJpNormal;`)
      .replace('#include <map_fragment>',`#include <map_fragment>
        vec2 tileP=vec2(abs(vJpNormal.x)>.5?vJpWall.z:vJpWall.x,vJpWall.y);
        float row=floor(tileP.y/.06);tileP.x+=mod(row,2.0)*.1135;
        vec2 tileSize=vec2(.227,.06),within=mod(tileP,tileSize),dist=min(within,tileSize-within);
        vec2 aa=max(fwidth(tileP),vec2(.0001));
        float mortar=1.0-min(smoothstep(.001-aa.x,.001+aa.x,dist.x),smoothstep(.001-aa.y,.001+aa.y,dist.y));
        float tileTone=fract(sin(dot(floor(tileP/tileSize),vec2(127.1,311.7)))*43758.5453);
        vec3 ceramic=mix(vec3(.76,.72,.65),vec3(.9,.89,.84),tileTone*.45+.35);
        ceramic=mix(ceramic,vec3(.47,.48,.44),mortar*.42);
        diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb/max(sampledDiffuseColor.rgb,vec3(.01))*ceramic,.9);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.56,.88,mortar);');
  };
  material.customProgramCacheKey=()=> 'japanese-ceramic-v1';return material;
}

// 小幅交叉波紋與岸邊碎浪，共用天空反射；不建立反射攝影機或水面模擬。
export function harborWater(axis, shore) {
  const material = new THREE.MeshStandardMaterial({ color: 0x294958, roughness: .38, metalness: .06, envMapIntensity: .9 });
  const time = { value: 0 }; material.userData.seaTime = time;
  material.onBeforeCompile = sh => {
    sh.uniforms.seaTime = time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vSea;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSea=(modelMatrix*vec4(transformed,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vSea; uniform float seaTime;
      float seaNoise(vec2 p){return sin(p.x*1.731+cos(p.y*.713))*sin(p.y*1.137+sin(p.x*.519));}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float a=dot(vSea,vec2(.21,.12))+seaTime*.6+seaNoise(vSea*.017+seaTime*.01)*5.0;
        float b=dot(vSea,vec2(-.11,.34))-seaTime*.43+seaNoise(vSea*.023+16.0)*3.0;
        vec2 slope=vec2(.21,.12)*cos(a)*.14+vec2(-.11,.34)*cos(b)*.045;
        slope+=vec2(.8,.4)*cos(dot(vSea,vec2(.8,.4))+seaTime)*.006;
        normal=normalize(mat3(viewMatrix)*vec3(-slope.x,1.0,-slope.y));`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float bank=1.0-smoothstep(.1,2.2,abs(vSea.${axis === 'x' ? 'x' : 'y'}-${shore.toFixed(1)}));
        float foam=bank*smoothstep(.55,.92,sin(vSea.x*1.7+vSea.y*2.3+seaTime*.7)*.5+.5);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.38,.44,.43),foam*.24);`);
  };
  material.customProgramCacheKey = () => 'kobe-water-' + axis + '-' + shore;
  return material;
}

export function shopMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: .7, metalness: .12, vertexColors: true });
  if (typeof document === 'undefined') return material;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const colors = [['#3b4b42', '#ddd3b4'], ['#5f3430', '#e2d6b9'], ['#ddd8c9', '#34504a'], ['#39495a', '#d5d4c5'], ['#833b31', '#eee3c7'], ['#ddd4b4', '#2e443d'], ['#55504b', '#dfd4b7'], ['#3e4345', '#d8caa7']];
  const signs = SHOP_LABELS.map((label, i) => [label, ...colors[i]]);
  const draw = () => {
    for (let i = 0; i < signs.length; i++) {
      const x = i % 4 * 256, y = Math.floor(i / 4) * 256, [label, bg, ink] = signs[i];
      ctx.fillStyle = bg; ctx.fillRect(x, y, 256, 256);
      const vertical = i === 4 || i === 5;
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(x + 9, y + (vertical ? 9 : 99), 238, vertical ? 238 : 55);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const font = JAPANESE_FONT;
      if (i === 4 || i === 5) {
        ctx.font = 'bold 76px ' + font; [...label].forEach((s, j) => ctx.fillText(s, x + 128, y + 76 + j * 108));
      } else {
        ctx.font = 'bold 34px ' + font; ctx.fillText(label, x + 128, y + 117);
        ctx.font = '14px ' + font; ctx.fillText(SHOP_SUBTITLES[i], x + 128, y + 144);
      }
      // 漆面褪色與積灰，不用高解析素材。
      for (let k = 0; k < 100; k++) {
        const px = (k * 73 + i * 17) % 256, py = (k * 109 + i * 31) % 256;
        ctx.fillStyle = k % 2 ? 'rgba(26,24,20,.1)' : 'rgba(230,225,207,.13)'; ctx.fillRect(x + px, y + py, 3 + k % 7, 2);
      }
    }
  }; draw();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.name = 'shop-signs';
  if (document.fonts) Promise.all([
    document.fonts.load('bold 45px "Noto Sans JP"', SHOP_LABELS.join('') + SHOP_SUBTITLES.join('')),
  ]).then(() => { draw(); map.needsUpdate = true; }).catch(() => {});
  material.map = map; return material;
}
export function civicMaterial() {
  const material = new THREE.MeshStandardMaterial({ roughness: .78, metalness: .02, vertexColors: true, alphaTest: .5 });
  material.userData.noCast = true;
  if (typeof document === 'undefined') return material;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const draw = () => {
    ctx.clearRect(0, 0, 1024, 512);
    CIVIC_LABELS.forEach((label, i) => {
      ctx.save(); ctx.translate(i % 4 * 256, Math.floor(i / 4) * 256);
      ctx.fillStyle = i === 3 ? '#4b3830' : i === 5 ? '#285845' : '#21456a'; ctx.fillRect(0, 0, 256, 256);
      if (i === 0) {
        ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = '#eee9df';
        ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(248, 8); ctx.lineTo(128, 248); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a73028'; ctx.beginPath(); ctx.moveTo(21, 16); ctx.lineTo(235, 16); ctx.lineTo(128, 230); ctx.closePath(); ctx.fill();
      } else if (i === 6) {
        ctx.clearRect(0, 0, 256, 256); ctx.fillStyle = '#a73028';
        ctx.beginPath(); ctx.arc(128, 128, 116, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#eee9df'; ctx.beginPath(); ctx.arc(128, 128, 92, 0, Math.PI * 2); ctx.fill();
      } else { ctx.strokeStyle = '#d9dedb'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, 236, 236); }
      if (i === 7) {
        // 横断歩道（407-A）：白い三角形と歩行者の図柄。案内板の矢印に置き換えない。
        ctx.fillStyle = '#eee9df';ctx.beginPath();ctx.moveTo(128,20);ctx.lineTo(232,218);ctx.lineTo(24,218);ctx.closePath();ctx.fill();
        ctx.fillStyle = '#21456a';
        for(let x=53;x<209;x+=30)ctx.fillRect(x,191,19,17);
        ctx.fillStyle = '#152638';ctx.beginPath();ctx.arc(134,85,12,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle = '#152638';ctx.lineWidth = 14;ctx.lineCap = 'round';
        for(const pts of [[[132,106],[116,137],[92,151]],[[125,123],[155,139],[171,133]],[[116,139],[139,161],[150,187]],[[118,138],[98,165],[86,184]]]) {
          ctx.beginPath();ctx.moveTo(...pts[0]);ctx.lineTo(...pts[1]);ctx.lineTo(...pts[2]);ctx.stroke();
        }
        ctx.restore();return;
      }
      ctx.fillStyle = i === 6 ? '#233342' : '#eee9df'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (i === 0 ? 51 : i === 2 ? 35 : i === 6 ? 92 : 42) + 'px ' + JAPANESE_FONT;
      ctx.fillText(label, 128, i === 0 ? 72 : i === 2 ? 128 : i === 6 ? 130 : 99);
      if (i !== 0 && i !== 3 && i !== 6) {
        const dy=i===2?18:0;
        ctx.beginPath(); ctx.moveTo(70, 158+dy); ctx.lineTo(160, 158+dy); ctx.lineTo(160, 145+dy); ctx.lineTo(187, 171+dy); ctx.lineTo(160, 197+dy); ctx.lineTo(160, 184+dy); ctx.lineTo(70, 184+dy); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    });
  }; draw();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; map.name = 'civic-signs';
  document.fonts?.load('bold 42px "Noto Sans JP"', CIVIC_LABELS.join('')).then(() => { draw(); map.needsUpdate = true; }).catch(() => {});
  material.map = map; return material;
}
export function shopUV(i) {
  const uv = civicUV(i);
  if (i !== 4 && i !== 5) {
    const y = 1 - (Math.floor(i / 4) + 1) / 2;
    uv[0][1] = uv[1][1] = y + (1 - 154 / 256) / 2;
    uv[2][1] = uv[3][1] = y + (1 - 99 / 256) / 2;
  }
  return uv;
}
export function civicUV(i, banner = false) {
  const x = i % 4 / 4, y = 1 - (Math.floor(i / 4) + 1) / 2, pad = 0.003;
  if(banner)return [[x+pad,y+(1-154/256)/2],[x+.25-pad,y+(1-154/256)/2],[x+.25-pad,y+(1-99/256)/2],[x+pad,y+(1-99/256)/2]];
  return [[x + pad, y + pad], [x + 0.25 - pad, y + pad], [x + 0.25 - pad, y + 0.5 - pad], [x + pad, y + 0.5 - pad]];
}
