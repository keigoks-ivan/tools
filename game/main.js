// HUNTR/X：魂門之戰 — Stage 1「首爾夜市・魂門裂縫」
// 3D 無雙式關卡：韓國街頭四區推進＋Boss 陰差隊長
// 資產：KayKit Character/City Packs（CC0，見 assets/LICENSE-*.txt）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MODEL_YAW = 0;              // glTF 標準：模型原生面向 +Z，rotation.y 直接用 yaw
const HALF_W = 13.5;              // 街道可走半寬
const NEON = [0xff4fd8, 0xff2fa0, 0x8a4fff, 0x4fd8ff, 0xff6ab0, 0xb47aff];
const IS_MOBILE = matchMedia('(pointer: coarse)').matches;
if (IS_MOBILE) document.body.classList.add('is-touch');

// 關卡（同一條街廊道，分區沿 -Z 推進；Stage 2 為血月變體）
const STAGES = [
  {
    name: '第一關　首爾夜市・魂門裂縫',
    zones: [
      { name: '夜市街口',  enterZ: 0,    boundZ: -48,  need: 14, cap: 9,  elites: 0 },
      { name: '夜市主街',  enterZ: -48,  boundZ: -96,  need: 28, cap: 14, elites: 0 },
      { name: '後巷亂戰',  enterZ: -96,  boundZ: -144, need: 24, cap: 13, elites: 1 },
      { name: '十字路口',  enterZ: -144, boundZ: -192, need: 20, cap: 11, elites: 3 },
      { name: '魂門裂縫',  enterZ: -192, boundZ: -240, boss: true },
    ],
  },
  {
    name: '第二關　血月大街・陰差軍團',
    zones: [
      { name: '血月街口',    enterZ: 0,    boundZ: -48,  need: 20, cap: 11, elites: 0, fast: 0.35 },
      { name: '亡者大街',    enterZ: -48,  boundZ: -96,  need: 34, cap: 16, elites: 1, fast: 0.5 },
      { name: '厲鬼後巷',    enterZ: -96,  boundZ: -144, need: 30, cap: 14, elites: 2, fast: 0.55 },
      { name: '修羅十字路',  enterZ: -144, boundZ: -192, need: 26, cap: 12, elites: 4, fast: 0.5 },
      { name: '魂門最終防線', enterZ: -192, boundZ: -240, boss: true, boss2: true },
    ],
  },
];
let stageIdx = 0;
let ZONES = STAGES[0].zones;

// ---------- 基本場景 ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_MOBILE ? 1.15 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x140f28, 26, 100);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.72, 0.55, 0.55));
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------- 燈光（夜街：冷月光主光＋暖鈉燈補光＋青色輪廓光） ----------
const hemi = new THREE.HemisphereLight(0x9a8aff, 0x201238, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xbfcaff, 1.35);
sun.position.set(8, 18, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0015;
scene.add(sun);
scene.add(sun.target);
const warmFill = new THREE.DirectionalLight(0xff4fd0, 0.35);
warmFill.position.set(-6, 8, 3);
scene.add(warmFill);
const rimLight = new THREE.DirectionalLight(0x4fd8ff, 0.55);
rimLight.position.set(-8, 6, -10);
scene.add(rimLight);
const heroLight = new THREE.PointLight(0xff4fa3, 1.4, 9, 1.6);
scene.add(heroLight);

// ---------- 天空（AI 生成全景） ----------
let skyMat = null;
(function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(290, 48, 24),
    new THREE.MeshBasicMaterial({ color: 0x0a0818, side: THREE.BackSide, fog: false })
  );
  sky.position.set(0, 0, -85);
  sky.rotation.y = Math.PI;
  skyMat = sky.material;
  scene.add(sky);
  new THREE.TextureLoader().load('assets/gen/sky.jpg', tex => {
    tex.colorSpace = THREE.SRGBColorSpace;
    sky.material.map = tex;
    sky.material.color.set(0xffffff);
    sky.material.needsUpdate = true;
  });
})();

// ---------- 共用貼圖工具 ----------
function makeWindowTex(hue) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#0e0e20'; g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 10) {
    for (let x = 6; x < 58; x += 10) {
      if (Math.random() < 0.4) {
        g.fillStyle = Math.random() < 0.75 ? `hsl(${hue},70%,68%)` : '#fff2cc';
        g.fillRect(x, y, 5, 6);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 韓文招牌
const KR_WORDS = ['치킨', '노래방', 'PC방', '분식', '호프', '편의점', '미용실', '약국', '곱창', '떡볶이', '삼겹살', '카페', '만화방', '슈퍼', '세탁소', '핸드폰'];
const SIGN_NEON = ['#ff5fd0', '#5fe0ff', '#b47aff', '#ff8fe0', '#7a9fff', '#ff4fa8'];
const SIGN_STYLES = SIGN_NEON.map(c => ['#14101f', c]);
function makeSignTex(word, w = 256, h = 72) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const [bg, fg] = SIGN_STYLES[Math.floor(Math.random() * SIGN_STYLES.length)];
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3;
  g.shadowColor = fg; g.shadowBlur = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.globalAlpha = 1;
  g.font = `900 ${Math.floor(h * 0.6)}px "Apple SD Gothic Neo","Noto Sans KR",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowBlur = 18;
  g.fillStyle = fg;
  g.fillText(word, w / 2, h / 2 + 2);
  g.fillText(word, w / 2, h / 2 + 2);
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
  g.fillText(word, w / 2, h / 2 + 2);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function makeVSignTex(word) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  const [bg, fg] = SIGN_STYLES[Math.floor(Math.random() * SIGN_STYLES.length)];
  g.fillStyle = bg; g.fillRect(0, 0, 64, 256);
  g.strokeStyle = fg; g.globalAlpha = 0.5; g.lineWidth = 3;
  g.shadowColor = fg; g.shadowBlur = 8;
  g.strokeRect(4, 4, 56, 248);
  g.globalAlpha = 1;
  g.font = '900 38px "Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...word].slice(0, 4);
  const step = 256 / (chars.length + 1);
  g.shadowBlur = 14;
  g.fillStyle = fg;
  chars.forEach((ch, i) => { g.fillText(ch, 32, step * (i + 1) + 6); g.fillText(ch, 32, step * (i + 1) + 6); });
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff'; g.globalAlpha = 0.85;
  chars.forEach((ch, i) => g.fillText(ch, 32, step * (i + 1) + 6));
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// 一樓店面（發光玻璃＋門＋雨棚）
function makeStorefrontTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#191926'; g.fillRect(0, 0, 256, 128);
  const aw = ['#b02a8a', '#2a4fb0', '#6a2ab0', '#3a3a8a'][Math.floor(Math.random() * 4)];
  g.fillStyle = aw; g.fillRect(0, 0, 256, 18);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  for (let x = 0; x < 256; x += 24) g.fillRect(x, 0, 12, 18);
  const wg = g.createLinearGradient(0, 30, 0, 118);
  const cool = Math.random() < 0.5;
  wg.addColorStop(0, cool ? '#ffc8ee' : '#ffe9b8');
  wg.addColorStop(1, cool ? '#c878d8' : '#e8a95e');
  g.fillStyle = wg; g.fillRect(14, 30, 150, 88);
  g.fillStyle = 'rgba(30,20,10,0.35)';
  g.fillRect(14, 30, 150, 6);
  g.fillStyle = 'rgba(60,30,10,0.45)';
  for (let i = 0; i < 3; i++) g.fillRect(26 + i * 46, 66 - Math.random() * 14, 20, 52);
  g.fillStyle = '#241a2e'; g.fillRect(184, 34, 56, 84);
  g.fillStyle = '#ffd9a0'; g.fillRect(206, 70, 10, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 韓國街道 ----------
let lightPool = null;
const groundMats = [];
const flickers = [];
const ENV = { signs: [], fronts: [], wins: [], tentGlows: [] };
(function buildKoreanStreet() {
  // 柏油路面
  const ac = document.createElement('canvas');
  ac.width = ac.height = 256;
  const ag = ac.getContext('2d');
  ag.fillStyle = '#191922'; ag.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ag.fillStyle = `rgba(${120 + Math.random() * 60},${120 + Math.random() * 60},${130 + Math.random() * 60},${0.05 + Math.random() * 0.07})`;
    ag.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const asphalt = new THREE.CanvasTexture(ac);
  asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
  asphalt.repeat.set(3, 92);
  asphalt.colorSpace = THREE.SRGBColorSpace;
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.32, metalness: 0.62 });
  groundMats.push(roadMat);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11, 330), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -105);
  road.receiveShadow = true;
  scene.add(road);
  // 車道虛線＋邊線
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x8a8a80 });
  for (let z = 6; z > -244; z -= 4) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 1.6), dashMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.012, z);
    scene.add(dash);
  }
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x8a7228 });
  for (const side of [-1, 1]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 330), edgeMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(side * 5.1, 0.012, -105);
    scene.add(line);
  }
  // 人行道（磚格）
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const sg = sc.getContext('2d');
  sg.fillStyle = '#2b2836'; sg.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    for (let x = 0; x < 256; x += 32) {
      sg.fillStyle = Math.random() < 0.5 ? '#2e2a3a' : '#282433';
      sg.fillRect(x + 1, y + 1, 30, 30);
    }
  }
  sg.strokeStyle = 'rgba(10,10,18,0.6)'; sg.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    sg.beginPath(); sg.moveTo(i, 0); sg.lineTo(i, 256); sg.stroke();
    sg.beginPath(); sg.moveTo(0, i); sg.lineTo(256, i); sg.stroke();
  }
  const paveTex = new THREE.CanvasTexture(sc);
  paveTex.wrapS = paveTex.wrapT = THREE.RepeatWrapping;
  paveTex.repeat.set(4, 132);
  paveTex.colorSpace = THREE.SRGBColorSpace;
  const walkMat = new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.5, metalness: 0.4 });
  groundMats.push(walkMat);
  new THREE.TextureLoader().load('assets/gen/pavement.jpg', tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 106);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    walkMat.map = tex;
    walkMat.needsUpdate = true;
  });
  for (const side of [-1, 1]) {
    const walk = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 330), walkMat);
    walk.rotation.x = -Math.PI / 2;
    walk.position.set(side * 10.1, 0.03, -105);
    walk.receiveShadow = true;
    scene.add(walk);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 330), new THREE.MeshLambertMaterial({ color: 0x4a4658 }));
    curb.position.set(side * 5.35, 0.06, -105);
    curb.receiveShadow = true;
    scene.add(curb);
  }
  // 斑馬線（各區入口）
  const zebraMat = new THREE.MeshBasicMaterial({ color: 0x9a9a92 });
  for (const zz of [-1, ...ZONES.map(z => z.boundZ)]) {
    for (let x = -4.4; x <= 4.4; x += 1.25) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 3), zebraMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(x, 0.014, zz + 2.6);
      scene.add(stripe);
    }
  }

  // 兩側連棟街屋（店面＋韓文招牌＋樓上窗燈）
  const winTexs = [makeWindowTex(46), makeWindowTex(190), makeWindowTex(285)];
  const wallMats = [0x241f33, 0x2a2340, 0x1f1b2e, 0x2e2545].map(c => new THREE.MeshLambertMaterial({ color: c }));
  let wi = 0;
  for (const side of [-1, 1]) {
    let z = -2;
    while (z > -238) {
      const w = 7 + Math.random() * 3.5;
      const zc = z - w / 2;
      z -= w + 0.35;
      if (ZONES.some(zn => Math.abs(zc - zn.boundZ) < 4)) continue;
      const h = 7 + Math.random() * 8;
      const depth = 8;
      const bx = side * (14.9 + depth / 2);
      const body = new THREE.Mesh(new THREE.BoxGeometry(depth, h, w), wallMats[wi % wallMats.length]);
      body.position.set(bx, h / 2, zc);
      body.castShadow = true; body.receiveShadow = true;
      scene.add(body);
      const winMat = new THREE.MeshBasicMaterial({ map: winTexs[wi % 3] });
      ENV.wins.push(winMat);
      const win = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.8, h - 4.6),
        winMat
      );
      win.position.set(side * 14.88, (h + 4.2) / 2, zc);
      win.rotation.y = side * -Math.PI / 2;
      scene.add(win);
      const frontMat = new THREE.MeshBasicMaterial({ map: makeStorefrontTex() });
      ENV.fronts.push(frontMat);
      const front = new THREE.Mesh(
        new THREE.PlaneGeometry(w - 0.5, 3.1),
        frontMat
      );
      front.position.set(side * 14.87, 1.62, zc);
      front.rotation.y = side * -Math.PI / 2;
      scene.add(front);
      // 招牌（整面橫幅，韓國街屋經典）— BoxGeometry 面序：+x,-x,+y,-y,+z,-z
      const signTex = makeSignTex(KR_WORDS[Math.floor(Math.random() * KR_WORDS.length)]);
      const darkMat = new THREE.MeshLambertMaterial({ color: 0x1a1a26 });
      const signMats = [
        new THREE.MeshBasicMaterial({ map: signTex }),
        new THREE.MeshBasicMaterial({ map: signTex }),
        darkMat, darkMat, darkMat, darkMat,
      ];
      ENV.signs.push(signMats[0], signMats[1]);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.15, w - 0.4), signMats);
      sign.position.set(side * 14.7, 3.85, zc);
      scene.add(sign);
      if (Math.random() < 0.4) flickers.push({ mat: signMats[0], speed: 0.5 + Math.random(), phase: Math.random() * 10 });
      // 立式霓虹直招（隨機）
      if (Math.random() < 0.85) {
        const vTex = makeVSignTex(KR_WORDS[Math.floor(Math.random() * KR_WORDS.length)]);
        const vDark = new THREE.MeshLambertMaterial({ color: 0x14141f });
        const vMats = [
          new THREE.MeshBasicMaterial({ map: vTex }),
          new THREE.MeshBasicMaterial({ map: vTex }),
          vDark, vDark, vDark, vDark,
        ];
        ENV.signs.push(vMats[0], vMats[1]);
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.9), vMats);
        v.position.set(side * 14.35, 4.6 + Math.random() * 2, zc - w / 2 + 0.8);
        scene.add(v);
      }
      wi++;
    }
  }

  // 布帳馬車（橘色帳篷攤）
  const tentMats = [0x3a4a8a, 0x4a3a7a, 0x2e3a6e].map(c => new THREE.MeshLambertMaterial({ color: c }));
  const tentGlow = new THREE.MeshBasicMaterial({ color: 0xffa8d8 });
  ENV.tentGlows.push(tentGlow);
  const counterMat = new THREE.MeshLambertMaterial({ color: 0x3a3548 });
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x585868 });
  for (let i = 0; i < 13; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -12 - i * 17.5 - Math.random() * 6;
    if (ZONES.some(zn => Math.abs(z - zn.boundZ) < 5)) continue;
    const x = side * (10.8 + Math.random() * 1.6);
    const grp = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 1.5), counterMat);
    counter.position.y = 0.5;
    counter.castShadow = true;
    grp.add(counter);
    for (const [px, pz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 5), poleMat);
      pole.position.set(px, 1.15, pz);
      grp.add(pole);
    }
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 1.35), tentMats[i % 3]);
    roofL.position.set(0, 2.42, -0.62); roofL.rotation.x = 0.42;
    roofL.castShadow = true;
    const roofR = roofL.clone(); roofR.position.z = 0.62; roofR.rotation.x = -0.42;
    grp.add(roofL, roofR);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.1), tentGlow);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 2.1;
    grp.add(glow);
    grp.position.set(x, 0, z);
    grp.rotation.y = Math.random() * 0.4 - 0.2 + (side > 0 ? Math.PI : 0);
    scene.add(grp);
  }

  // 電線桿＋電線（韓國巷弄記憶點）
  const wireMat = new THREE.MeshBasicMaterial({ color: 0x08080e });
  const poleMat2 = new THREE.MeshLambertMaterial({ color: 0x2e2a38 });
  const polePts = [];
  for (let i = 0; i < 9; i++) {
    const z = -8 - i * 26;
    const side = i % 2 === 0 ? 1 : -1;
    const x = side * 13.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 7.4, 6), poleMat2);
    pole.position.set(x, 3.7, z);
    pole.castShadow = true;
    scene.add(pole);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.09, 0.09), poleMat2);
    cross.position.set(x, 6.6, z);
    scene.add(cross);
    polePts.push(new THREE.Vector3(x, 6.9, z));
    if (i > 0 && i % 2 === 1) {
      for (const dy of [0, 0.35]) {
        const from = new THREE.Vector3(x, 6.8 - dy, z);
        const to = new THREE.Vector3(-x, 6.5 - dy, z - 2);
        const mid = from.clone().lerp(to, 0.5); mid.y -= 1.1;
        const curve = new THREE.CatmullRomCurve3([from, mid, to]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.022, 4), wireMat);
        scene.add(tube);
      }
    }
  }
  for (let i = 0; i < polePts.length - 1; i++) {
    const from = polePts[i], to = polePts[i + 1];
    const mid = from.clone().lerp(to, 0.5); mid.y -= 1.4;
    const curve = new THREE.CatmullRomCurve3([from, mid, to]);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.022, 4), wireMat);
    scene.add(tube);
  }

  // 路燈地面光池
  const poolTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(255,214,150,0.5)');
    rg.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  lightPool = (x, z, s = 6) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({
      map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, z);
    scene.add(m);
  };
})();

// ---------- 遠景：城市天際線＋南山塔 ----------
(function buildBackdrop() {
  const mats = [46, 190, 285].map(h => new THREE.MeshBasicMaterial({ map: makeWindowTex(h) }));
  let i = 0;
  for (const side of [-1, 1]) {
    for (let z = 15; z > -262; z -= 10 + Math.random() * 6) {
      const w = 6 + Math.random() * 8;
      const h = 12 + Math.random() * 26;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mats[i++ % 3]);
      b.position.set(side * (34 + Math.random() * 20), h / 2 - 0.5, z);
      scene.add(b);
    }
  }
  for (let x = -60; x <= 60; x += 12) {
    const h = 16 + Math.random() * 22;
    const b = new THREE.Mesh(new THREE.BoxGeometry(9, h, 9), mats[i++ % 3]);
    b.position.set(x, h / 2, -275 - Math.random() * 10);
    scene.add(b);
  }
  // 南山塔（山丘剪影＋塔身＋觀景台）
  const hill = new THREE.Mesh(
    new THREE.ConeGeometry(30, 16, 6),
    new THREE.MeshBasicMaterial({ color: 0x0c0a18, fog: false })
  );
  hill.position.set(46, 7, -268);
  scene.add(hill);
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1.2, 20, 8),
    new THREE.MeshBasicMaterial({ color: 0x262040, fog: false })
  );
  tower.position.set(46, 25, -268);
  scene.add(tower);
  const deck = new THREE.Mesh(
    new THREE.CylinderGeometry(2.6, 2.2, 2.2, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: false })
  );
  deck.position.set(46, 36, -268);
  scene.add(deck);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.16, 7, 5),
    new THREE.MeshBasicMaterial({ color: 0x383050, fog: false })
  );
  antenna.position.set(46, 40.5, -268);
  scene.add(antenna);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.35, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff3a3a, fog: false })
  );
  beacon.position.set(46, 44, -268);
  scene.add(beacon);
})();

// ---------- 魂門巨環（關卡終點） ----------
const honmoon = new THREE.Group();
(function buildHonmoon() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(10, 0.55, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0xa04fff, fog: false })
  );
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(8, 0.2, 8, 64),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3, fog: false })
  );
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(9.6, 48),
    new THREE.MeshBasicMaterial({ color: 0x30104f, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: false })
  );
  // 旋渦漩流
  const sc = document.createElement('canvas');
  sc.width = sc.height = 256;
  const sg = sc.getContext('2d');
  sg.translate(128, 128);
  for (let arm = 0; arm < 3; arm++) {
    sg.rotate((Math.PI * 2) / 3);
    sg.beginPath();
    for (let t = 0; t < 6; t += 0.08) {
      const r = 6 + t * 19;
      sg.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    sg.strokeStyle = arm === 0 ? 'rgba(255,120,220,0.9)' : 'rgba(190,110,255,0.7)';
    sg.lineWidth = 10 - arm * 2;
    sg.shadowColor = '#ff5fd0'; sg.shadowBlur = 12;
    sg.stroke();
  }
  const swirlTex = new THREE.CanvasTexture(sc);
  const swirl = new THREE.Mesh(
    new THREE.CircleGeometry(8.8, 48),
    new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  );
  swirl.position.z = 0.1;
  honmoon.add(ring, ring2, disc, swirl);
  honmoon.userData.swirl = swirl;
  honmoon.position.set(0, 15, -254);
  scene.add(honmoon);
})();

// ---------- 區界拱門＋光牆 ----------
const barriers = [];
(function buildGates() {
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x221838 });
  for (let zi = 0; zi < ZONES.length; zi++) {
    const z = ZONES[zi].boundZ;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7.6, 0.9), pillarMat);
      p.position.set(side * 14.2, 3.8, z);
      p.castShadow = true;
      scene.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.5), pillarMat);
    bar.position.set(0, 7.6, z);
    scene.add(bar);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(30, 0.14, 0.56), new THREE.MeshBasicMaterial({ color: 0xa04fff }));
    trim.position.set(0, 7.35, z);
    scene.add(trim);
    if (zi === ZONES.length - 1) { barriers.push({ wall: null, open: false }); continue; }
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(28.5, 7.1),
      new THREE.MeshBasicMaterial({ color: 0x8a3fff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    wall.position.set(0, 3.55, z);
    scene.add(wall);
    barriers.push({ wall, open: false });
  }
})();

// ---------- 環境浮塵 ----------
const embers = (() => {
  const N = IS_MOBILE ? 350 : 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 20;
    pos[i * 3 + 1] = Math.random() * 9;
    pos[i * 3 + 2] = 8 - Math.random() * 258;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xff7ad0, size: 0.17, transparent: true, opacity: 0.75,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, N };
})();

// ---------- 雨 ----------
const rain = (() => {
  const N = IS_MOBILE ? 700 : 1400;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() * 2 - 1) * 30;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = 10 - Math.random() * 70;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9ab8ff, size: 0.07, transparent: true, opacity: 0.42, depthWrite: false,
  }));
  scene.add(pts);
  return { pts, pos, N };
})();

// ---------- 角色渲染工具 ----------
function makeOutlineMat(width = 0.028) {
  const m = new THREE.MeshBasicMaterial({ color: 0x0a0714, side: THREE.BackSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `transformed += normal * ${width.toFixed(4)};\n#include <project_vertex>`
    );
  };
  m.customProgramCacheKey = () => 'outline' + width.toFixed(4);
  return m;
}
function addOutline(root, matsArr, width = 0.028) {
  const targets = [];
  root.traverse(o => {
    if (o.isMesh && o.visible && o.material?.name !== 'Glow' && !o.userData.isOutline) targets.push(o);
  });
  const mat = makeOutlineMat(width);
  if (matsArr) matsArr.push(mat);
  for (const m of targets) {
    const oc = m.clone(false);
    oc.material = mat;
    oc.castShadow = false;
    oc.receiveShadow = false;
    oc.userData.isOutline = true;
    oc.raycast = () => {};
    m.parent.add(oc);
  }
}

const gradTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();
function toonify(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    const conv = m => {
      if (m.name === 'Glow') return new THREE.MeshBasicMaterial({ color: 0xff3a6a, name: 'Glow' });
      return new THREE.MeshToonMaterial({ map: m.map || null, color: m.color.clone(), gradientMap: gradTex, name: m.name });
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
}
const blobTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
function makeBlobShadow(r) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(r * 2, r * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0.5 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.04;
  scene.add(m);
  return m;
}
const sparkTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(220,180,255,0.9)');
  rg.addColorStop(1, 'rgba(160,79,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const sparks = [];
function spawnSpark(pos, scale = 1, color = 0xffffff, opts = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.position.copy(pos);
  s.scale.setScalar(0.4 * scale);
  s.userData = { t: 0, dur: opts.dur || 0.22, scale, rise: opts.rise || 0 };
  scene.add(s);
  sparks.push(s);
}
const shockwaves = [];
function spawnShockwave(x, z, { maxR = 4, dur = 0.35, color = 0xc9a4ff } = {}) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.06, z);
  m.userData = { t: 0, dur, maxR };
  scene.add(m);
  shockwaves.push(m);
}
function makeFanGeo(inner, outer, ang, segs = 24) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = -ang / 2 + (i / segs) * ang;
    pos.push(Math.sin(a) * inner, 0, Math.cos(a) * inner);
    pos.push(Math.sin(a) * outer, 0, Math.cos(a) * outer);
  }
  for (let i = 0; i < segs; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return geo;
}
const slashes = [];
function spawnSlash(x, z, yaw, { ang = 2.4, outer = 2.9, dur = 0.18, color = 0xc9a4ff, dir = 1 }) {
  const mk = (inner, out, col, op, spinMul, tilt) => {
    const m = new THREE.Mesh(makeFanGeo(inner, out, ang), new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: op, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.position.set(x, 1.15, z);
    m.rotation.y = yaw;
    m.rotation.x = tilt;
    m.userData = { t: 0, dur, dir: dir * spinMul };
    scene.add(m);
    slashes.push(m);
  };
  mk(0.7, outer, color, 0.7, 1, 0);               // 外圈色彩
  mk(0.9, outer * 0.82, 0xffffff, 0.9, 1.35, 0);  // 白熱核心（轉更快）
  mk(0.7, outer * 1.05, color, 0.35, 0.7, 0.18);  // 殘影層（微傾斜）
}
const drops = [];
function spawnDrop(x, z) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    new THREE.MeshBasicMaterial({ color: 0xff4fa3 })
  );
  m.position.set(x, 0.8, z);
  m.userData = { t: Math.random() * 6.28 };
  scene.add(m);
  drops.push(m);
}

// 動畫 rig
function makeRig(root, clips, names) {
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const n of names) {
    const c = THREE.AnimationClip.findByName(clips, n);
    if (c) actions[n] = mixer.clipAction(c);
  }
  return { mixer, actions, current: null, clips };
}
function play(rig, name, { once = false, ts = 1, fade = 0.12 } = {}) {
  const next = rig.actions[name];
  if (!next) return null;
  if (rig.current === next && !once) return next;
  next.reset();
  next.setEffectiveTimeScale(ts);
  next.setEffectiveWeight(1);
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  if (rig.current && rig.current !== next) next.crossFadeFrom(rig.current, fade, false);
  next.play();
  rig.current = next;
  return next;
}
function clipDur(rig, name, ts) {
  const c = THREE.AnimationClip.findByName(rig.clips, name);
  return c ? c.duration / ts : 0.5;
}
function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ---------- 音訊（Web Audio 全合成：BGM＋SFX，無外部音檔） ----------
const AU = { ctx: null, master: null, music: null, sfx: null, noise: null, muted: false, timer: null, nextBar: 0, bar: 0 };
function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }
function initAudio() {
  if (AU.ctx) { AU.ctx.resume(); return; }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  AU.ctx = ctx;
  AU.master = ctx.createGain(); AU.master.gain.value = 0.8; AU.master.connect(ctx.destination);
  AU.music = ctx.createGain(); AU.music.gain.value = 0.42; AU.music.connect(AU.master);
  AU.sfx = ctx.createGain(); AU.sfx.gain.value = 0.9; AU.sfx.connect(AU.master);
  const nb = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AU.noise = nb;
  // 主旋律匯流排＋節奏延遲（空間感）
  AU.lead = ctx.createGain(); AU.lead.gain.value = 1;
  AU.lead.connect(AU.music);
  const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.34;
  const fb = ctx.createGain(); fb.gain.value = 0.3;
  const wet = ctx.createGain(); wet.gain.value = 0.28;
  AU.lead.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(wet); wet.connect(AU.music);
  AU.nextBar = ctx.currentTime + 0.1;
  AU.timer = setInterval(scheduleMusic, 200);
}
const MUSIC = [
  { // 第一關：synthwave 夜街（Am–F–C–G，明快 hook）
    bpm: 126,
    prog: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 65]],
    lead: [
      [76, 0, 0.75], [74, 0.75, 0.25], [72, 1, 0.5], [74, 1.5, 0.5], [76, 2, 1], [79, 3, 0.5], [76, 3.5, 0.5],
      [74, 4, 0.75], [72, 4.75, 0.25], [69, 5, 1], [72, 6, 0.5], [74, 6.5, 0.5], [76, 7, 1],
      [72, 8, 0.75], [74, 8.75, 0.25], [76, 9, 0.5], [79, 9.5, 0.5], [81, 10, 1.25], [79, 11.25, 0.75],
      [76, 12, 0.75], [74, 12.75, 0.25], [72, 13, 1], [69, 14, 1.5], [64, 15.5, 0.5],
    ],
    hat16: true,
  },
  { // 第二關：血月暗黑小調（Am–G–F–E，沉重緩慢）
    bpm: 116,
    prog: [[57, 60, 64, 67], [55, 59, 62, 65], [53, 57, 60, 64], [52, 56, 59, 64]],
    lead: [
      [69, 0, 1.5], [72, 1.5, 0.5], [71, 2, 1], [69, 3, 1],
      [67, 4, 1.5], [69, 5.5, 0.5], [71, 6, 2],
      [74, 8, 1], [72, 9, 0.5], [71, 9.5, 0.5], [69, 10, 1.5], [64, 11.5, 0.5],
      [65, 12, 1], [64, 13, 1], [63, 14, 2],
    ],
    hat16: false,
  },
];
function tone(type, freq, t, dur, gain, dest, freqEnd) {
  const o = AU.ctx.createOscillator(), g = AU.ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
}
function noiseHit(t, dur, gain, filterType, freq, dest, q = 1) {
  const src = AU.ctx.createBufferSource(); src.buffer = AU.noise;
  const f = AU.ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
  const g = AU.ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t); src.stop(t + dur + 0.05);
}
function scheduleMusic() {
  const ctx = AU.ctx;
  if (!ctx || ctx.state !== 'running') return;
  const cfg = MUSIC[Math.min(stageIdx, MUSIC.length - 1)];
  const spb = 60 / cfg.bpm, barLen = spb * 4;
  while (AU.nextBar < ctx.currentTime + 0.8) {
    const t0 = AU.nextBar;
    const bi = AU.bar % 4;
    const ch = cfg.prog[bi];
    const root = midi(ch[0] - 24);
    for (let b = 0; b < 4; b++) {
      const bt = t0 + b * spb;
      tone('sine', 150, bt, 0.16, 0.5, AU.music, 44);                    // kick
      if (b === 1 || b === 3) noiseHit(bt, 0.13, 0.24, 'bandpass', 1900, AU.music, 0.9);
      noiseHit(bt + spb / 2, 0.045, 0.1, 'highpass', 8500, AU.music);
      if (cfg.hat16) noiseHit(bt + spb * 0.25, 0.03, 0.05, 'highpass', 9800, AU.music);
      tone('sawtooth', root, bt, spb * 0.46, 0.13, AU.music);            // bass
      tone('sawtooth', root * (b === 2 ? 1.5 : 2), bt + spb / 2, spb * 0.4, 0.08, AU.music);
    }
    if (bi === 3) {                                                      // 第4小節 snare 過門
      for (let i = 0; i < 4; i++) noiseHit(t0 + barLen - spb / 2 + i * spb / 8, 0.06, 0.1 + i * 0.04, 'bandpass', 2100, AU.music);
    }
    for (const n of ch) {                                                // 7th 和弦 pad
      tone('sawtooth', midi(n) * 0.998, t0, barLen * 0.95, 0.02, AU.music);
      tone('sawtooth', midi(n) * 1.004, t0, barLen * 0.95, 0.02, AU.music);
    }
    const arp = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[3] + 12];        // arp 8ths → 進延遲
    for (let i = 0; i < 8; i++) {
      tone('triangle', midi(arp[i % 4]), t0 + i * spb / 2, 0.13, 0.035, AU.lead);
    }
    if (bi === 0) {                                                      // 主旋律 hook（4 小節一循環）
      for (const [n, beat, len] of cfg.lead) {
        tone('square', midi(n), t0 + beat * spb, len * spb * 0.9, 0.075, AU.lead);
        tone('sawtooth', midi(n) * 1.004, t0 + beat * spb, len * spb * 0.9, 0.045, AU.lead);
      }
    }
    AU.nextBar += barLen;
    AU.bar++;
  }
}
const S = {
  slash() { if (AU.ctx) { const t = AU.ctx.currentTime; noiseHit(t, 0.12, 0.22, 'bandpass', 2600, AU.sfx, 2); tone('sawtooth', 900, t, 0.1, 0.05, AU.sfx, 240); } },
  hit(n = 1, heavy = false) {
    if (!AU.ctx) return;
    const t = AU.ctx.currentTime;
    tone('sine', heavy ? 150 : 190, t, 0.11, Math.min(0.5, 0.3 + n * 0.05), AU.sfx, 50);
    noiseHit(t, 0.07, 0.18, 'lowpass', 900, AU.sfx);
  },
  kill() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('square', 660, t, 0.16, 0.14, AU.sfx, 110); noiseHit(t, 0.14, 0.14, 'bandpass', 700, AU.sfx); } },
  hurt() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', 130, t, 0.2, 0.3, AU.sfx, 60); noiseHit(t, 0.1, 0.16, 'lowpass', 500, AU.sfx); } },
  jump() { if (AU.ctx) tone('sine', 320, AU.ctx.currentTime, 0.16, 0.16, AU.sfx, 620); },
  roll() { if (AU.ctx) noiseHit(AU.ctx.currentTime, 0.18, 0.14, 'lowpass', 1300, AU.sfx); },
  pickup() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(88), t, 0.1, 0.16, AU.sfx); tone('triangle', midi(93), t + 0.09, 0.16, 0.16, AU.sfx); } },
  zone() { if (AU.ctx) { const t = AU.ctx.currentTime; [76, 81, 85, 88].forEach((n, i) => tone('triangle', midi(n), t + i * 0.1, 0.22, 0.16, AU.sfx)); } },
  roar() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', 75, t, 0.7, 0.4, AU.sfx, 42); noiseHit(t, 0.55, 0.2, 'lowpass', 300, AU.sfx); } },
  boom() { if (AU.ctx) { const t = AU.ctx.currentTime; tone('sine', 120, t, 0.35, 0.5, AU.sfx, 34); noiseHit(t, 0.3, 0.3, 'lowpass', 600, AU.sfx); } },
  win() { if (AU.ctx) { const t = AU.ctx.currentTime; [69, 73, 76, 81, 88].forEach((n, i) => tone('square', midi(n), t + i * 0.13, 0.3, 0.13, AU.sfx)); } },
};
document.getElementById('mute').addEventListener('click', () => {
  AU.muted = !AU.muted;
  if (AU.master) AU.master.gain.value = AU.muted ? 0 : 0.8;
  document.getElementById('mute').textContent = AU.muted ? '🔇' : '🔊';
});
document.addEventListener('visibilitychange', () => {
  if (!AU.ctx) return;
  if (document.hidden) AU.ctx.suspend();
  else AU.ctx.resume();
});

// ---------- 輸入 ----------
const keys = new Set();
let atkPressed = false, heavyPressed = false, jumpPressed = false, dodgePressed = false, musouPressed = false;
addEventListener('keydown', e => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  if (typeof dlg !== 'undefined' && dlg.active) {
    if (e.code === 'KeyJ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyZ') nextDialog();
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyJ' || e.code === 'KeyZ') atkPressed = true;
  if (e.code === 'KeyK' || e.code === 'KeyX') heavyPressed = true;
  if (e.code === 'Space') jumpPressed = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyL') dodgePressed = true;
  if (e.code === 'KeyM') document.getElementById('mute').click();
  if (e.code === 'KeyQ' && state === 'play') switchWeapon();
  if (e.code === 'KeyE') musouPressed = true;
  if (e.code === 'KeyR' && state === 'dead') restart();
  if (state === 'title' && ready && (e.code === 'Enter' || e.code === 'KeyJ')) start();
});
addEventListener('keyup', e => keys.delete(e.code));

// 觸控：左半螢幕虛擬搖桿＋右側按鍵
const touchMove = { active: false, mx: 0, mz: 0 };
(function setupTouch() {
  const zone = document.getElementById('stickZone');
  const base = document.getElementById('stickBase');
  const knob = document.getElementById('stickKnob');
  if (!zone) return;
  let pid = null, cx = 0, cy = 0;
  const R = 55;
  zone.addEventListener('pointerdown', e => {
    pid = e.pointerId; cx = e.clientX; cy = e.clientY;
    base.style.left = knob.style.left = cx + 'px';
    base.style.top = knob.style.top = cy + 'px';
    base.style.display = knob.style.display = 'block';
    touchMove.active = true;
    zone.setPointerCapture(pid);
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - cx, dy = e.clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = dx / d * R; dy = dy / d * R; }
    knob.style.left = (cx + dx) + 'px';
    knob.style.top = (cy + dy) + 'px';
    touchMove.mx = dx / R;
    touchMove.mz = dy / R;
  });
  const end = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    touchMove.active = false; touchMove.mx = 0; touchMove.mz = 0;
    base.style.display = knob.style.display = 'none';
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
  const bind = (id, fn) => {
    const el2 = document.getElementById(id);
    el2.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  };
  bind('btnA', () => { atkPressed = true; });
  bind('btnB', () => { heavyPressed = true; });
  bind('btnJ', () => { jumpPressed = true; });
  bind('btnR', () => { dodgePressed = true; });
  bind('btnW', () => { if (state === 'play') switchWeapon(); });
  bind('btnU', () => { musouPressed = true; });
})();

// ---------- HUD ----------
const el = id => document.getElementById(id);
const hud = {
  hp: el('hpfill'), kills: el('kills'), combo: el('combo'),
  objective: el('objective'), toast: el('toast'),
  bosswrap: el('bosswrap'), bossfill: el('bossfill'),
  title: el('title'), dead: el('dead'), deadStats: el('deadStats'),
  win: el('win'), winStats: el('winStats'), grade: el('grade'),
  load: el('loadtext'),
};
el('startBtn').addEventListener('click', () => ready && start());
el('retryBtn').addEventListener('click', () => restart());
el('againBtn').addEventListener('click', () => restart());
el('nextBtn').addEventListener('click', () => {
  hud.win.classList.add('hidden');
  loadStage(stageIdx + 1);
});
function showToastMini(text) { showToast(text); }
function showToast(text) {
  hud.toast.textContent = text;
  hud.toast.classList.remove('show');
  void hud.toast.offsetWidth;
  hud.toast.classList.add('show');
}

// ---------- 遊戲狀態 ----------
let state = 'title';               // title | play | dead | win
let ready = false;
let kills = 0, combo = 0, comboTimer = 0, maxCombo = 0;
let hitStopT = 0, shakeT = 0, shakeAmp = 0;
let musou = 0;                      // 無雙集氣 0~100
let worldT = 0, runStartT = 0, runTime = 0;

const level = { zi: 0, phase: 'fight', zoneKills: 0, spawned: 0, boss: null };

// 攻擊表（Rumi／Knight，1H 劍）
const LIGHT = [
  { clip: 'slash1', ts: 1.85, range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.36, dir: 1 },
  { clip: 'slash2', ts: 1.85, range: 2.9, ang: 2.6, dmg: 1, kb: 7,  hitAt: 0.36, dir: -1 },
  { clip: 'slash3', ts: 1.8,  range: 3.0, ang: 2.2, dmg: 1, kb: 9,  hitAt: 0.38, dir: 1 },
  { clip: 'slash4', ts: 1.7,  range: 3.4, ang: 2.4, dmg: 2, kb: 12, hitAt: 0.40, dir: 1, shake: 0.3 },
];
const HEAVY_SOLO   = { clip: 'heavy',    ts: 1.55, range: 3.3, ang: 2.5, dmg: 3, kb: 13, hitAt: 0.44, dir: 1,  shake: 0.45 };
const HEAVY_FINISH = { clip: 'heavyfin', ts: 1.55, range: 3.7, ang: 6.3, dmg: 2, kb: 15, hitAt: 0.46, dir: 1,  shake: 0.55 };
const PLUNGE       = { range: 4.0, ang: 6.3, dmg: 2, kb: 14, shake: 0.6 };
// 魂力彈（遠程）：揮劍射出劍氣
const RLIGHT = [
  { clip: 'slash1', ts: 2.3, hitAt: 0.33, dir: 1,  bolt: { dmg: 1, speed: 24, pierce: 2, size: 1.6 } },
  { clip: 'slash2', ts: 2.3, hitAt: 0.33, dir: -1, bolt: { dmg: 1, speed: 24, pierce: 2, size: 1.6 } },
];
const RHEAVY = { clip: 'heavy', ts: 1.6, hitAt: 0.44, dir: 1, shake: 0.3, bolt: { dmg: 3, speed: 27, pierce: 99, size: 2.6 } };
let weapon = 'melee';
const curLight = () => weapon === 'melee' ? LIGHT : RLIGHT;
function switchWeapon() {
  if (player.st === 'atk' || player.st === 'dead') return;
  weapon = weapon === 'melee' ? 'ranged' : 'melee';
  document.getElementById('wpn').textContent = weapon === 'melee' ? '⚔ 近戰' : '✦ 魂力彈';
  if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(weapon === 'melee' ? 76 : 83), t, 0.12, 0.15, AU.sfx); }
  spawnSpark(new THREE.Vector3(player.x, 1.4, player.z), 1.6, weapon === 'melee' ? 0xc9a4ff : 0x6ae0ff);
}
// 劍氣彈
const bolts = [];
function spawnBolt(cfg) {
  const p = player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color: cfg.size > 1.2 ? 0xa8f0ff : 0x7ad0ff,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  spr.position.set(p.x + fx * 0.9, 1.3, p.z + fz * 0.9);
  spr.scale.set(1.1 * cfg.size, 0.62 * cfg.size, 1);
  scene.add(spr);
  bolts.push({ spr, x: p.x + fx * 0.9, z: p.z + fz * 0.9, dx: fx, dz: fz, traveled: 0, pierce: cfg.pierce, dmg: cfg.dmg, size: cfg.size, hitSet: new Set() });
}
function updateBolts(dt) {
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    const step = 24 * dt * (b.size > 1.2 ? 1.12 : 1);
    b.x += b.dx * step; b.z += b.dz * step;
    b.traveled += step;
    if (Math.floor(b.traveled / 1.2) !== Math.floor((b.traveled - step) / 1.2)) {
      spawnSpark(new THREE.Vector3(b.x, 1.3, b.z), 0.55 * b.size, 0x6ac0ff, { dur: 0.16 });
    }
    b.spr.position.set(b.x, 1.3, b.z);
    const pulse = 1 + Math.sin(b.traveled * 6) * 0.12;
    b.spr.scale.set(1.1 * b.size * pulse, 0.62 * b.size * pulse, 1);
    let dead = b.traveled > 20 || Math.abs(b.x) > HALF_W + 1;
    for (const e of enemies) {
      if (dead) break;
      if (e.st === 'dead' || e.st === 'spawn' || b.hitSet.has(e)) continue;
      if (Math.hypot(e.x - b.x, e.z - b.z) < 0.95 * b.size + (e.kind.scale - 1) * 0.5) {
        b.hitSet.add(e);
        hitEnemy(e, b.dmg, 8, b.dx, b.dz, 1.2 + b.dmg * 0.3);
        S.hit(1, b.dmg > 1);
        b.pierce--;
        if (b.pierce <= 0) dead = true;
      }
    }
    if (dead) {
      spawnSpark(new THREE.Vector3(b.x, 1.3, b.z), 0.9, 0x7ad0ff);
      scene.remove(b.spr); b.spr.material.dispose();
      bolts.splice(i, 1);
    }
  }
}

const player = {
  root: null, rig: null, shadow: null,
  x: 0, y: 0, z: 0, vy: 0, yaw: Math.PI,
  hp: 100, hpMax: 100, spd: 6.5,
  st: 'idle',
  curAtk: null, atkStage: -1, atkT: 0, atkDur: 0, didHit: false, queuedLight: false, queuedHeavy: false,
  dodgeT: 0, dodgeDur: 0, dodgeDx: 0, dodgeDz: 0,
  hurtT: 0, invuln: 0,
};

const enemies = [];
let assets = null;

const KINDS = {
  minion: {
    file: 'minion', scale: 1, hp: 2, spdBase: 2.4, spdVar: 1.1, dmg: 5,
    atkRange: 2.3, hitRange: 2.4, atkTs: 0.8, kbMul: 1, shadowR: 0.9,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
    dropRate: 0.10,
  },
  elite: {
    file: 'warrior', scale: 1.2, hp: 9, spdBase: 2.2, spdVar: 0.5, dmg: 11,
    atkRange: 2.7, hitRange: 3.0, atkTs: 0.8, kbMul: 0.35, shadowR: 1.15,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 1,
  },
  runner: {
    file: 'minion', scale: 0.92, hp: 1, spdBase: 4.1, spdVar: 0.8, dmg: 4,
    atkRange: 2.1, hitRange: 2.2, atkTs: 0.95, kbMul: 1.2, shadowR: 0.8,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B'],
    dropRate: 0.07, tint: 0xff4040,
  },
  boss: {
    file: 'warrior', scale: 1.6, hp: 70, spdBase: 2.7, spdVar: 0, dmg: 14,
    atkRange: 3.2, hitRange: 3.6, atkTs: 0.85, kbMul: 0.12, shadowR: 1.5,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0,
  },
  boss2: {
    file: 'warrior', scale: 1.8, hp: 130, spdBase: 3.0, spdVar: 0, dmg: 17,
    atkRange: 3.4, hitRange: 3.8, atkTs: 0.9, kbMul: 0.08, shadowR: 1.7,
    atks: ['Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Kick'],
    dropRate: 0, tint: 0xff5050,
  },
};

// ---------- 載入 ----------
const loader = new GLTFLoader();
const CITY_PROPS = ['car_sedan', 'car_taxi', 'car_hatchback', 'streetlight', 'trafficlight_A', 'dumpster', 'bench', 'firehydrant'];
Promise.all([
  loader.loadAsync('assets/maria.glb'),
  loader.loadAsync('assets/Skeleton_Minion.glb'),
  loader.loadAsync('assets/Skeleton_Warrior.glb'),
  ...CITY_PROPS.map(n => loader.loadAsync(`assets/city/${n}.gltf`)),
]).then(([maria, minion, warrior, ...city]) => {
  // Mixamo 動作自帶前進位移，鎖定 Hips 水平位移（保留 Y 起伏），移動交給遊戲邏輯
  for (const clip of maria.animations) {
    for (const tr of clip.tracks) {
      if (/Hips\.position$/.test(tr.name)) {
        const v = tr.values;
        const x0 = v[0], z0 = v[2];
        for (let i = 0; i < v.length; i += 3) { v[i] = x0; v[i + 2] = z0; }
      }
    }
  }
  const heroRoot = maria.scene;
  toonify(heroRoot);
  heroRoot.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  // 依模型實際身高標定為 1.78m（Mixamo FBX 單位是公分）
  const bbox = new THREE.Box3().setFromObject(heroRoot);
  const hScale = 1.78 / (bbox.max.y - bbox.min.y);
  heroRoot.scale.setScalar(hScale);
  player.root = heroRoot;
  scene.add(player.root);
  player.rig = makeRig(player.root, maria.animations, [
    'idle', 'run', 'roll', 'hurt', 'death', 'win', 'jump',
    ...LIGHT.map(c => c.clip), HEAVY_SOLO.clip, HEAVY_FINISH.clip,
  ]);
  addOutline(heroRoot, null, 0.028 / hScale);
  play(player.rig, 'idle');
  player.shadow = makeBlobShadow(1.1);

  toonify(minion.scene);
  toonify(warrior.scene);
  assets = {
    minion: { scene: minion.scene, clips: minion.animations },
    warrior: { scene: warrior.scene, clips: warrior.animations },
  };

  placeCityProps(Object.fromEntries(CITY_PROPS.map((n, i) => [n, city[i].scene])));

  // 濕地面反射：對街景烘一次靜態 cubemap
  const cubeRT = new THREE.WebGLCubeRenderTarget(256);
  const cubeCam = new THREE.CubeCamera(0.5, 250, cubeRT);
  cubeCam.position.set(0, 1.6, -55);
  cubeCam.update(renderer, scene);
  for (const m of groundMats) {
    m.envMap = cubeRT.texture;
    m.envMapIntensity = m.roughness < 0.4 ? 1.25 : 0.65;
    m.needsUpdate = true;
  }

  ready = true;
  hud.load.textContent = '載入完成';
}).catch(err => {
  hud.load.textContent = '載入失敗：' + err.message;
  console.error(err);
});

// ---------- 城市道具擺設 ----------
function placeCityProps(props) {
  const put = (name, x, z, rotY = 0, scale = 1) => {
    const src = props[name];
    if (!src) return null;
    const m = src.clone(true);
    toonify(m);
    m.position.set(x, 0.03, z);
    m.rotation.y = rotY;
    m.scale.setScalar(scale);
    scene.add(m);
    return m;
  };
  // 路邊停車（貼路緣、順著街道）
  const carTypes = ['car_sedan', 'car_taxi', 'car_hatchback'];
  for (let i = 0; i < 15; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const z = -9 - i * 15 - Math.random() * 5;
    if (ZONES.some(zn => Math.abs(z - zn.boundZ) < 4.5)) continue;
    put(carTypes[i % 3], side * 3.9, z, side > 0 ? 0 : Math.PI, 1.05);
  }
  // 路燈＋地面光池
  for (let i = 0; i < 11; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -16 - i * 21;
    put('streetlight', side * 5.9, z, side > 0 ? Math.PI : 0, 1.35);
    lightPool?.(side * 4.6, z, 7);
  }
  // 紅綠燈（區界斑馬線旁）
  for (let zi = 0; zi < ZONES.length - 1; zi++) {
    const z = ZONES[zi].boundZ;
    put('trafficlight_A', 5.9, z + 4.6, Math.PI, 1.3);
    put('trafficlight_A', -5.9, z - 1.2, 0, 1.3);
  }
  // 人行道雜物
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    put('dumpster', side * 12.4, -22 - i * 27, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2);
  }
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    put('bench', side * 11.8, -14 - i * 32, side > 0 ? -Math.PI / 2 : Math.PI / 2, 1.2);
  }
  for (let i = 0; i < 6; i++) {
    put('firehydrant', (i % 2 ? 1 : -1) * 6.1, -30 - i * 38, 0, 1.2);
  }
}

// ---------- 敵人 ----------
const E_ANIMS = [
  'Spawn_Ground', 'Running_A', 'Hit_A', 'Death_A', 'Idle',
  'Unarmed_Melee_Attack_Punch_A', 'Unarmed_Melee_Attack_Punch_B', 'Unarmed_Melee_Attack_Kick',
  'Spellcast_Long', 'Spellcast_Summon', 'Taunt',
];
const MAX_ATTACKERS = 3;

function spawnEnemy(kindName, fx, fz) {
  const kind = KINDS[kindName];
  const zone = ZONES[level.zi];
  let x, z;
  if (fx !== undefined) { x = fx; z = fz; }
  else {
    for (let tries = 0; tries < 12; tries++) {
      x = (Math.random() * 2 - 1) * (HALF_W - 1.5);
      z = Math.max(zone.boundZ + 3, Math.min(zone.enterZ - 2, player.z - 6 - Math.random() * 20));
      if (Math.hypot(x - player.x, z - player.z) > 5) break;
    }
  }
  const src = assets[kind.file];
  const root = SkeletonUtils.clone(src.scene);
  const mats = [];
  root.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) mats.push(m);
    }
  });
  addOutline(root, mats);
  if (kind.tint) {
    const tc = new THREE.Color(kind.tint);
    for (const m of mats) {
      if (m.color && m.name !== 'Glow') m.color.lerp(tc, 0.4);
    }
  }
  root.scale.setScalar(kind.scale);
  root.position.set(x, 0, z);
  scene.add(root);
  const rig = makeRig(root, src.clips, E_ANIMS);
  const e = {
    kind, kindName, root, rig, mats,
    shadow: makeBlobShadow(kind.shadowR),
    x, z, yaw: 0, vx: 0, vz: 0,
    hp: kind.hp, hpMax: kind.hp,
    spd: kind.spdBase + Math.random() * kind.spdVar,
    st: 'spawn', t: clipDur(rig, 'Spawn_Ground', 1.4),
    atkCd: 0.6 + Math.random() * 1.8, flash: 0, hitT: 0, deadT: 0, hitAppl: false,
    aoeCd: 6, summonCd: 3, castT: 0, castKind: null,
  };
  play(rig, 'Spawn_Ground', { once: true, ts: 1.4, fade: 0 });
  spawnSpark(new THREE.Vector3(x, 0.6, z), kindName === 'boss' ? 3 : 1.3, 0xa04fff);
  enemies.push(e);
  return e;
}

function killEnemy(e) {
  S.kill();
  musou = Math.min(100, musou + 3);
  spawnSpark(new THREE.Vector3(e.x, 1.6, e.z), 1.3, 0xb07aff, { dur: 0.7, rise: 2.6 });
  e.st = 'dead'; e.deadT = 0;
  play(e.rig, 'Death_A', { once: true, ts: 1.3 });
  kills++;
  spawnSpark(new THREE.Vector3(e.x, 1.0, e.z), e.kindName === 'boss' ? 4 : 2.2, 0xa04fff);
  if (!ZONES[level.zi].boss || e.kindName.startsWith('boss')) level.zoneKills++;
  if (Math.random() < e.kind.dropRate) spawnDrop(e.x, e.z);
  if (e.kindName.startsWith('boss')) onBossDown();
}

function updateEnemies(dt) {
  const p = player;
  let attackers = enemies.filter(e => e.st === 'attack').length;
  for (const e of enemies) {
    e.rig.mixer.update(dt);
    e.flash = Math.max(0, e.flash - dt);
    for (const m of e.mats) {
      if (m.emissive) m.emissive.setScalar(e.flash > 0 ? 1 : 0);
    }
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.vx *= Math.pow(0.002, dt); e.vz *= Math.pow(0.002, dt);

    const dx = p.x - e.x, dz = p.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    const targetYaw = Math.atan2(dx, dz);
    const isBoss = e.kindName.startsWith('boss');

    if (e.st === 'spawn') {
      e.t -= dt;
      if (e.t <= 0) { e.st = 'chase'; play(e.rig, 'Running_A', { ts: 1.2 }); }
    } else if (e.st === 'chase') {
      e.yaw += angDiff(e.yaw, targetYaw) * Math.min(1, dt * 8);
      if (d > e.kind.atkRange - 0.2) {
        e.x += (dx / d) * e.spd * dt;
        e.z += (dz / d) * e.spd * dt;
      }
      e.atkCd -= dt;
      if (isBoss) {
        e.aoeCd -= dt; e.summonCd -= dt;
        if (e.summonCd <= 0 && enemies.filter(x => (x.kindName === 'minion' || x.kindName === 'runner') && x.st !== 'dead').length < 9) {
          e.st = 'cast'; e.castKind = 'summon'; e.castT = 0;
          e.castDur = clipDur(e.rig, 'Spellcast_Summon', 1.1);
          play(e.rig, 'Spellcast_Summon', { once: true, ts: 1.1 });
          continue;
        }
        if (e.aoeCd <= 0 && d < 7) {
          e.st = 'cast'; e.castKind = 'aoe'; e.castT = 0;
          e.castDur = clipDur(e.rig, 'Spellcast_Long', 1.15);
          play(e.rig, 'Spellcast_Long', { once: true, ts: 1.15 });
          spawnShockwave(e.x, e.z, { maxR: 6.5, dur: e.castDur * 0.75, color: 0xff3a5a });
          continue;
        }
      }
      if (d < e.kind.atkRange && e.atkCd <= 0 && (isBoss || attackers < MAX_ATTACKERS) && p.st !== 'dead') {
        if (!isBoss) attackers++;
        e.st = 'attack';
        const clip = e.kind.atks[Math.floor(Math.random() * e.kind.atks.length)];
        e.t = 0; e.hitAppl = false;
        e.atkDur = clipDur(e.rig, clip, e.kind.atkTs);
        play(e.rig, clip, { once: true, ts: e.kind.atkTs });
        spawnShockwave(e.x, e.z, { maxR: e.kind.hitRange * 0.55, dur: e.atkDur * 0.45, color: 0xff3a5a });
      }
    } else if (e.st === 'attack') {
      e.yaw += angDiff(e.yaw, targetYaw) * Math.min(1, dt * 4);
      e.t += dt;
      if (!e.hitAppl && e.t >= e.atkDur * 0.45) {
        e.hitAppl = true;
        if (d < e.kind.hitRange && p.y < 1.2 && p.invuln <= 0 && p.st !== 'dead') damagePlayer(e.kind.dmg, e);
      }
      if (e.t >= e.atkDur * 0.95) {
        e.st = 'chase';
        e.atkCd = (isBoss ? 1.1 : 1.7) + Math.random() * 1.5;
        play(e.rig, 'Running_A', { ts: 1.2 });
      }
    } else if (e.st === 'cast') {
      e.castT += dt;
      if (e.castKind === 'aoe' && !e.hitAppl && e.castT >= e.castDur * 0.72) {
        e.hitAppl = true;
        S.boom();
        spawnSpark(new THREE.Vector3(e.x, 1.5, e.z), 3.5, 0xff3a5a);
        spawnShockwave(e.x, e.z, { maxR: 7, dur: 0.3, color: 0xff5a7a });
        shakeT = 0.3; shakeAmp = 0.4;
        if (d < 6.5 && p.y < 1.6 && p.invuln <= 0 && p.st !== 'dead') damagePlayer(16, e);
      }
      if (e.castKind === 'summon' && !e.hitAppl && e.castT >= e.castDur * 0.6) {
        e.hitAppl = true;
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * 6.28, r = 3 + Math.random() * 2;
          spawnEnemy('minion',
            Math.max(-HALF_W + 1, Math.min(HALF_W - 1, e.x + Math.cos(a) * r)),
            Math.max(ZONES[level.zi].boundZ + 2, e.z + Math.sin(a) * r));
        }
      }
      if (e.castT >= e.castDur) {
        e.st = 'chase'; e.hitAppl = false;
        if (e.castKind === 'aoe') e.aoeCd = 7 + Math.random() * 3;
        else e.summonCd = 14;
        play(e.rig, 'Running_A', { ts: 1.2 });
      }
    } else if (e.st === 'hit') {
      e.hitT -= dt;
      if (e.hitT <= 0) { e.st = 'chase'; play(e.rig, 'Running_A', { ts: 1.2 }); }
    } else if (e.st === 'dead') {
      e.deadT += dt;
      if (e.deadT > 0.7) {
        e.root.position.y = -(e.deadT - 0.7) * 1.6;
        for (const m of e.mats) { m.transparent = true; m.opacity = Math.max(0, 1 - (e.deadT - 0.7) / 0.7); }
      }
      continue;
    }
    e.x = Math.max(-HALF_W + 0.8, Math.min(HALF_W - 0.8, e.x));
    e.z = Math.max(ZONES[level.zi].boundZ + 1, Math.min(1.5, e.z));
  }
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (a.st === 'dead') continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (b.st === 'dead') continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = 1.35 * Math.max(a.kind.scale, b.kind.scale);
      if (d > 0 && d < min) {
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        a.x -= ux * push; a.z -= uz * push;
        b.x += ux * push; b.z += uz * push;
      }
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.root.position.x = e.x; e.root.position.z = e.z;
    e.root.rotation.y = e.yaw + MODEL_YAW;
    e.shadow.position.set(e.x, 0.04, e.z);
    e.shadow.material.opacity = (e.st === 'dead' ? Math.max(0, 1 - e.deadT) : 1) * 0.5;
    if (e.st === 'dead' && e.deadT > 1.5) {
      scene.remove(e.root); scene.remove(e.shadow);
      e.rig.mixer.stopAllAction();
      enemies.splice(i, 1);
    }
  }
}

// ---------- 關卡進度 ----------
function startZone(zi) {
  level.zi = zi;
  level.phase = 'fight';
  level.zoneKills = 0;
  level.spawned = 0;
  const zone = ZONES[zi];
  showToast(zone.name);
  if (zone.boss) {
    hud.bosswrap.style.display = 'block';
    S.roar();
    level.boss = spawnEnemy(zone.boss2 ? 'boss2' : 'boss', 0, zone.enterZ - 22);
    for (let i = 0; i < 3; i++) spawnEnemy('minion');
    showDialog(zone.boss2 ? STORY.s2boss : STORY.s1boss);
  } else {
    const elites = zone.elites || 0;
    for (let i = 0; i < elites; i++) { spawnEnemy('elite'); level.spawned++; }
    const first = Math.min(zone.cap - elites, zone.need - elites, 8);
    for (let i = 0; i < first; i++) {
      spawnEnemy(Math.random() < (zone.fast || 0) ? 'runner' : 'minion');
      level.spawned++;
    }
  }
}

function updateLevel(dt) {
  const zone = ZONES[level.zi];
  const alive = enemies.filter(e => e.st !== 'dead').length;
  if (level.phase === 'fight') {
    if (zone.boss) {
      hud.objective.textContent = '擊破 陰差隊長';
      if (level.boss) hud.bossfill.style.width = Math.max(0, level.boss.hp / level.boss.hpMax * 100) + '%';
    } else {
      hud.objective.textContent = `肅清區域 ${Math.min(level.zoneKills, zone.need)}／${zone.need}`;
      hud.objective.classList.remove('go');
      if (level.spawned < zone.need && alive < zone.cap && Math.random() < 0.45) {
        spawnEnemy(Math.random() < (zone.fast || 0) ? 'runner' : 'minion');
        level.spawned++;
      }
      if (level.zoneKills >= zone.need && alive === 0) {
        level.phase = 'advance';
        barriers[level.zi].open = true;
        S.zone();
        showToast('區域肅清！');
      }
    }
  } else if (level.phase === 'advance') {
    hud.objective.textContent = '▲ 前進';
    hud.objective.classList.add('go');
    const next = ZONES[level.zi + 1];
    if (next && player.z < next.enterZ - 4) startZone(level.zi + 1);
  }
  for (const b of barriers) {
    if (b.open && b.wall && b.wall.material.opacity > 0) {
      b.wall.material.opacity = Math.max(0, b.wall.material.opacity - dt * 0.5);
      if (b.wall.material.opacity === 0) b.wall.visible = false;
    }
  }
}

function playerMinZ() {
  const zone = ZONES[level.zi];
  if (level.phase === 'advance') {
    const next = ZONES[level.zi + 1];
    return next ? next.boundZ + 1 : zone.boundZ + 1;
  }
  return zone.boundZ + 1;
}

function onBossDown() {
  S.win();
  state = 'win';
  runTime = (performance.now() - runStartT) / 1000;
  hud.bosswrap.style.display = 'none';
  for (const e of enemies) {
    if (e.st !== 'dead' && !e.kindName.startsWith('boss')) {
      e.st = 'dead'; e.deadT = 0;
      play(e.rig, 'Death_A', { once: true, ts: 1.3 });
    }
  }
  spawnShockwave(player.x, player.z, { maxR: 14, dur: 0.7 });
  shakeT = 0.4; shakeAmp = 0.5;
  if (player.rig) play(player.rig, 'win', { once: true, ts: 1 });
  const showWin = () => {
    const m = Math.floor(runTime / 60), s = Math.round(runTime % 60);
    let score = 0;
    if (player.hp >= 50) score++;
    if (runTime <= 480) score += 2; else if (runTime <= 660) score++;
    if (maxCombo >= 35) score++;
    const grade = score >= 3 ? 'S' : score === 2 ? 'A' : score === 1 ? 'B' : 'C';
    hud.grade.textContent = grade;
    const isLast = stageIdx >= STAGES.length - 1;
    document.getElementById('winTitle').textContent = isLast ? '魂門守住了' : '關卡突破！';
    document.getElementById('nextBtn').style.display = isLast ? 'none' : '';
    hud.winStats.textContent = `通關時間 ${m}:${String(s).padStart(2, '0')} · 擊殺 ${kills} · 最大連段 ${maxCombo} · 剩餘 HP ${Math.round(player.hp)}`;
    hud.win.classList.remove('hidden');
  };
  setTimeout(() => {
    if (stageIdx >= STAGES.length - 1) showDialog(STORY.ending, showWin);
    else showWin();
  }, 1400);
}

// ---------- 戰鬥 ----------
function hitEnemy(e, dmg, kb, ux, uz, sparkScale = 1.4) {
  e.hp -= dmg;
  e.flash = 0.13;
  e.vx += ux * kb * e.kind.kbMul;
  e.vz += uz * kb * e.kind.kbMul;
  spawnSpark(new THREE.Vector3(e.x, 1.2, e.z), sparkScale * 1.25);
  musou = Math.min(100, musou + 2);
  if (dmg >= 2 || Math.random() < 0.4) spawnShockwave(e.x, e.z, { maxR: 1.3, dur: 0.16, color: 0xffffff });
  combo++; comboTimer = 2.2;
  if (combo > maxCombo) maxCombo = combo;
  if (combo > 0 && combo % 15 === 0) {   // 連段里程碑：紫色新星
    spawnSpark(new THREE.Vector3(player.x, 1.4, player.z), 3.4, 0xc06aff, { dur: 0.35 });
    spawnShockwave(player.x, player.z, { maxR: 5, dur: 0.4, color: 0xc06aff });
    if (AU.ctx) { const t = AU.ctx.currentTime; tone('triangle', midi(88 + Math.min(12, combo / 15)), t, 0.2, 0.18, AU.sfx); }
  }
  if (e.hp <= 0) killEnemy(e);
  else if (e.st !== 'attack' && e.st !== 'cast' && (e.kindName === 'minion' || e.kindName === 'runner')) {
    e.st = 'hit'; e.hitT = 0.3;
    play(e.rig, 'Hit_A', { once: true, ts: 1.6 });
  }
}
function meleeSweep(a) {
  const p = player;
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  let hits = 0;
  for (const e of enemies) {
    if (e.st === 'dead' || e.st === 'spawn') continue;
    const dx = e.x - p.x, dz = e.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > a.range + (e.kind.scale - 1)) continue;
    if (a.ang < 6) {
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (d > 1.0 && dot < Math.cos(a.ang / 2)) continue;
    }
    hits++;
    const kd = d || 1;
    hitEnemy(e, a.dmg, a.kb, dx / kd, dz / kd, 1.2 + a.dmg * 0.25);
  }
  if (hits > 0) {
    S.hit(hits, !!a.shake);
    hitStopT = Math.min(0.13, 0.045 + hits * 0.008 + (a.shake ? 0.035 : 0));
    shakeT = 0.18; shakeAmp = (a.shake || 0.12) + hits * 0.01;
  }
  return hits;
}
function applyPlayerHit(a) {
  if (a.bolt) {
    if (AU.ctx) { const t = AU.ctx.currentTime; tone('sawtooth', a.bolt.size > 1.2 ? 500 : 780, t, 0.14, 0.14, AU.sfx, 190); }
    spawnBolt(a.bolt);
    if (a.shake) { shakeT = 0.12; shakeAmp = 0.2; }
    return 1;
  }
  S.slash();
  const hits = meleeSweep(a);
  spawnSlash(player.x, player.z, player.yaw, {
    ang: Math.min(a.ang, 6.3), outer: a.range, dir: a.dir,
    color: a.dmg > 1 ? 0xd9b4ff : 0xc9a4ff, dur: a.dmg > 1 ? 0.28 : 0.18,
  });
  if (a === HEAVY_SOLO || a === HEAVY_FINISH) spawnShockwave(player.x, player.z, { maxR: a.range + 0.6 });
  return hits;
}
function damagePlayer(dmg, from) {
  S.hurt();
  musou = Math.min(100, musou + 8);
  const p = player;
  p.hp -= dmg;
  p.invuln = 0.8;
  combo = 0;
  shakeT = 0.25; shakeAmp = 0.3;
  spawnSpark(new THREE.Vector3(p.x, 1.3, p.z), 1.6, 0xff5a5a);
  const dx = p.x - from.x, dz = p.z - from.z;
  const d = Math.hypot(dx, dz) || 1;
  p.x += (dx / d) * 0.7; p.z += (dz / d) * 0.7;
  if (p.hp <= 0) {
    p.hp = 0; p.st = 'dead';
    play(p.rig, 'death', { once: true, ts: 1.1 });
    state = 'dead';
    setTimeout(() => {
      hud.deadStats.textContent = `推進到 ${ZONES[level.zi].name} · 擊殺 ${kills} · 最大連段 ${maxCombo}`;
      hud.dead.classList.remove('hidden');
    }, 900);
  } else if (dmg >= 10 && (p.st === 'idle' || p.st === 'run')) {
    // 只有重擊會打出硬直，小兵攻擊不打斷 Rumi 的動作
    play(p.rig, 'hurt', { once: true, ts: 1.5 });
    p.st = 'hurt'; p.hurtT = clipDur(p.rig, 'hurt', 1.5) * 0.8;
  }
}

// ---------- 玩家 ----------
const GRAV = 26, JUMP_V = 9.5;
function updatePlayer(dt) {
  const p = player;
  if (!p.root) return;
  p.rig.mixer.update(dt);
  if (p.st === 'dead' || state === 'win') { syncPlayer(); return; }
  p.invuln = Math.max(0, p.invuln - dt);

  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (touchMove.active) { mx = touchMove.mx; mz = touchMove.mz; }
  let ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; ml = 1; }
  else if (ml > 0 && !touchMove.active) { mx /= ml; mz /= ml; ml = 1; }
  if (ml < 0.25) { mx = 0; mz = 0; ml = 0; }

  if (p.st === 'hurt') {
    p.hurtT -= dt;
    if (p.hurtT <= 0) { p.st = 'idle'; play(p.rig, 'idle'); }
  } else if (p.st === 'dodge') {
    p.dodgeT += dt;
    const k = Math.max(0.2, 1 - p.dodgeT / p.dodgeDur);
    p.x += p.dodgeDx * 10 * k * dt;
    p.z += p.dodgeDz * 10 * k * dt;
    if (p.dodgeT >= p.dodgeDur) { p.st = 'idle'; play(p.rig, 'idle'); }
  } else if (p.st === 'jump' || p.st === 'plunge') {
    if (ml > 0) {
      p.x += mx * p.spd * 0.85 * dt;
      p.z += mz * p.spd * 0.85 * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 8);
    }
    if (p.st === 'jump') {
      p.vy -= GRAV * dt;
      if (atkPressed) {
        atkPressed = false;
        p.st = 'plunge'; p.vy = -22;
        play(p.rig, 'slash4', { once: true, ts: 1.3, fade: 0.06 });
      }
    } else {
      p.vy = -22;
    }
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      if (p.st === 'plunge') {
        const hits = meleeSweep(PLUNGE);
        spawnShockwave(p.x, p.z, { maxR: PLUNGE.range + 0.8, dur: 0.4 });
        spawnSpark(new THREE.Vector3(p.x, 0.5, p.z), 2.6, 0xd9b4ff);
        shakeT = 0.25; shakeAmp = 0.5;
        if (hits === 0) hitStopT = 0.04;
      }
      p.st = 'idle';
      play(p.rig, 'idle', { fade: 0.14 });
    }
  } else if (p.st === 'musou') {
    p.musouT += dt;
    if (ml > 0) {
      p.x += mx * 3.2 * dt;
      p.z += mz * 3.2 * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 5);
    }
    p.musouTick -= dt;
    if (p.musouTick <= 0) {
      p.musouTick = 0.22;
      for (const e of enemies) {
        if (e.st === 'dead' || e.st === 'spawn') continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 5.5) { const kd = d || 1; hitEnemy(e, 2, 7, dx / kd, dz / kd, 1.6); }
      }
      spawnSlash(p.x, p.z, Math.random() * 6.28, { ang: 6.3, outer: 5.4, dir: Math.random() < 0.5 ? 1 : -1, color: Math.random() < 0.5 ? 0xd07aff : 0xff7ac8, dur: 0.28 });
      spawnShockwave(p.x, p.z, { maxR: 5.4, dur: 0.3, color: 0xd07aff });
      S.slash();
      shakeT = 0.15; shakeAmp = 0.25;
    }
    if (p.musouT >= 2.4) {
      for (const e of enemies) {
        if (e.st === 'dead' || e.st === 'spawn') continue;
        const dx = e.x - p.x, dz = e.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d < 8.5) { const kd = d || 1; hitEnemy(e, 6, 22, dx / kd, dz / kd, 2.2); }
      }
      spawnShockwave(p.x, p.z, { maxR: 9, dur: 0.55, color: 0xffd84f });
      spawnShockwave(p.x, p.z, { maxR: 7, dur: 0.45, color: 0xff7ac8 });
      spawnSpark(new THREE.Vector3(p.x, 1.5, p.z), 5.5, 0xffe8b0, { dur: 0.45 });
      S.boom(); S.roar();
      hitStopT = 0.15; shakeT = 0.5; shakeAmp = 0.8;
      p.st = 'idle';
      play(p.rig, 'idle', { fade: 0.2 });
    }
  } else if (p.st === 'atk') {
    const a = p.curAtk;
    p.atkT += dt;
    const k = Math.max(0, 1 - p.atkT / (p.atkDur * 0.6));
    p.x += Math.sin(p.yaw) * 4.6 * k * dt;
    p.z += Math.cos(p.yaw) * 4.6 * k * dt;
    if (ml > 0) p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 4);
    if (!p.didHit && p.atkT >= p.atkDur * a.hitAt) { p.didHit = true; applyPlayerHit(a); }
    if (musouPressed && musou >= 100) { musouPressed = false; startMusou(); return; }
    if (atkPressed) { p.queuedLight = true; atkPressed = false; }
    if (heavyPressed) { p.queuedHeavy = true; heavyPressed = false; }
    if (dodgePressed && p.didHit) { dodgePressed = false; startDodge(mx, mz, ml); }
    else if (p.atkT >= p.atkDur * 0.5 && p.queuedHeavy) {
      startAttack(weapon === 'melee' ? (p.atkStage >= 1 ? HEAVY_FINISH : HEAVY_SOLO) : RHEAVY, -1, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.5 && p.queuedLight && p.atkStage >= 0) {
      const lt = curLight();
      startAttack(lt[(p.atkStage + 1) % lt.length], (p.atkStage + 1) % lt.length, mx, mz, ml);
    } else if (p.atkT >= p.atkDur * 0.86) {
      p.st = 'idle';
      play(p.rig, ml > 0 ? 'run' : 'idle', { ts: ml > 0 ? 1.15 : 1 });
    }
  } else {
    if (ml > 0) {
      p.x += mx * p.spd * dt;
      p.z += mz * p.spd * dt;
      p.yaw += angDiff(p.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 12);
      if (p.st !== 'run') { p.st = 'run'; play(p.rig, 'run', { ts: 1.15 }); }
    } else if (p.st !== 'idle') { p.st = 'idle'; play(p.rig, 'idle'); }
    if (musouPressed && musou >= 100) { musouPressed = false; startMusou(); }
    else if (atkPressed) { atkPressed = false; startAttack(curLight()[0], 0, mx, mz, ml); }
    else if (heavyPressed) { heavyPressed = false; startAttack(weapon === 'melee' ? HEAVY_SOLO : RHEAVY, -1, mx, mz, ml); }
    else if (jumpPressed) {
      jumpPressed = false;
      p.st = 'jump'; p.vy = JUMP_V;
      S.jump();
      play(p.rig, 'jump', { once: true, ts: 1.15, fade: 0.06 });
    }
    else if (dodgePressed) { dodgePressed = false; startDodge(mx, mz, ml); }
  }
  atkPressed = heavyPressed = jumpPressed = dodgePressed = musouPressed = false;

  p.x = Math.max(-HALF_W, Math.min(HALF_W, p.x));
  p.z = Math.max(playerMinZ(), Math.min(1.5, p.z));
  syncPlayer();

  for (let i = drops.length - 1; i >= 0; i--) {
    const dr = drops[i];
    if (Math.hypot(dr.position.x - p.x, dr.position.z - p.z) < 1.3) {
      p.hp = Math.min(p.hpMax, p.hp + 14);
      S.pickup();
      spawnSpark(new THREE.Vector3(p.x, 1.2, p.z), 1.4, 0x8fffbf);
      scene.remove(dr); drops.splice(i, 1);
    }
  }
}
function syncPlayer() {
  const p = player;
  p.root.position.set(p.x, p.y, p.z);
  p.root.rotation.y = p.yaw + MODEL_YAW;
  p.shadow.position.set(p.x, 0.04, p.z);
  const sk = 1 / (1 + p.y * 0.18);
  p.shadow.scale.setScalar(sk);
  heroLight.position.set(p.x, p.y + 2.2, p.z + 0.5);
}
function startAttack(a, stage, mx, mz, ml) {
  const p = player;
  if (ml > 0) p.yaw = Math.atan2(mx, mz);
  p.st = 'atk'; p.curAtk = a; p.atkStage = stage;
  p.atkT = 0; p.didHit = false; p.queuedLight = false; p.queuedHeavy = false;
  p.atkDur = clipDur(p.rig, a.clip, a.ts);
  play(p.rig, a.clip, { once: true, ts: a.ts, fade: 0.07 });
}
function startMusou() {
  const p = player;
  p.st = 'musou'; p.musouT = 0; p.musouTick = 0;
  p.invuln = 2.8;
  musou = 0;
  play(p.rig, 'heavyfin', { ts: 1.75 });
  spawnShockwave(p.x, p.z, { maxR: 6, dur: 0.5, color: 0xffd84f });
  spawnSpark(new THREE.Vector3(p.x, 1.5, p.z), 4, 0xffd84f, { dur: 0.4 });
  if (AU.ctx) {
    const t = AU.ctx.currentTime;
    tone('sawtooth', 180, t, 0.5, 0.3, AU.sfx, 900);
    S.roar();
  }
  showToastMini?.('魂門亂舞！');
  hitStopT = 0.1; shakeT = 0.3; shakeAmp = 0.5;
}
function startDodge(mx, mz, ml) {
  const p = player;
  if (ml > 0) { p.dodgeDx = mx; p.dodgeDz = mz; p.yaw = Math.atan2(mx, mz); }
  else { p.dodgeDx = Math.sin(p.yaw); p.dodgeDz = Math.cos(p.yaw); }
  p.st = 'dodge'; p.dodgeT = 0;
  S.roll();
  p.dodgeDur = Math.min(0.55, clipDur(p.rig, 'roll', 1.9));
  p.invuln = Math.max(p.invuln, 0.45);
  play(p.rig, 'roll', { once: true, ts: 1.9, fade: 0.06 });
}

// ---------- 特效更新 ----------
function updateFx(dt) {
  comboTimer -= dt;
  if (comboTimer <= 0) combo = 0;
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.userData.t += dt;
    const k = s.userData.t / s.userData.dur;
    if (k >= 1) { scene.remove(s); s.material.dispose(); sparks.splice(i, 1); continue; }
    s.scale.setScalar((0.4 + k * 1.8) * s.userData.scale);
    s.material.opacity = 1 - k;
    if (s.userData.rise) s.position.y += s.userData.rise * dt;
  }
  for (let i = slashes.length - 1; i >= 0; i--) {
    const m = slashes[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); slashes.splice(i, 1); continue; }
    m.rotation.y += m.userData.dir * dt * 6;
    m.material.opacity = 0.85 * (1 - k);
    const s = 1 + k * 0.25;
    m.scale.set(s, 1, s);
  }
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const m = shockwaves[i];
    m.userData.t += dt;
    const k = m.userData.t / m.userData.dur;
    if (k >= 1) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); shockwaves.splice(i, 1); continue; }
    const r = 1 + k * m.userData.maxR;
    m.scale.set(r, r, 1);
    m.material.opacity = 0.9 * (1 - k);
  }
  updateBolts(dt);
  for (const dr of drops) {
    dr.userData.t += dt;
    dr.position.y = 0.8 + Math.sin(dr.userData.t * 3) * 0.15;
    dr.rotation.y += dt * 2.5;
  }
}

// ---------- 環境動態 ----------
function updateAmbient(dt) {
  worldT += dt;
  honmoon.rotation.z += dt * 0.15;
  honmoon.children[1].rotation.z -= dt * 0.4;
  const pos = embers.pos;
  for (let i = 0; i < embers.N; i++) {
    pos[i * 3 + 1] += dt * (0.25 + (i % 5) * 0.1);
    pos[i * 3] += Math.sin(worldT * 0.6 + i) * dt * 0.15;
    if (pos[i * 3 + 1] > 9) pos[i * 3 + 1] = 0;
  }
  embers.pts.geometry.attributes.position.needsUpdate = true;
  // 雨
  const rp = rain.pos;
  for (let i = 0; i < rain.N; i++) {
    rp[i * 3 + 1] -= 24 * dt;
    if (rp[i * 3 + 1] < 0) {
      rp[i * 3 + 1] = 13 + Math.random() * 2;
      rp[i * 3] = player.x + (Math.random() * 2 - 1) * 30;
      rp[i * 3 + 2] = player.z + (Math.random() * 2 - 1) * 38 - 4;
    }
  }
  rain.pts.geometry.attributes.position.needsUpdate = true;
  // 魂門旋渦
  if (honmoon.userData.swirl) honmoon.userData.swirl.rotation.z -= dt * 1.3;
  // 招牌閃爍
  for (const f of flickers) {
    const t = worldT * f.speed + f.phase;
    const v = Math.sin(t * 7) * Math.sin(t * 13 + 1.7);
    f.mat.color.setScalar(v > 0.9 ? 0.3 : 1);
  }
  // 陰影相機跟著玩家
  sun.position.set(player.x + 8, 18, player.z + 6);
  sun.target.position.set(player.x, 0, player.z);
  sun.target.updateMatrixWorld();
}

// ---------- 鏡頭 ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const p = player;
  camTarget.set(p.x * 0.7, 0, p.z);
  const want = new THREE.Vector3(p.x * 0.7, 10.5, p.z + 13.2);
  camera.position.lerp(want, Math.min(1, dt * 5));
  let ox = 0, oy = 0;
  if (shakeT > 0) {
    shakeT -= dt;
    ox = (Math.random() * 2 - 1) * shakeAmp;
    oy = (Math.random() * 2 - 1) * shakeAmp;
  }
  camera.position.x += ox; camera.position.y += oy;
  camera.lookAt(camTarget.x, 1.5, camTarget.z - 4);
}

// ---------- HUD ----------
let lastCombo = -1, lastKills = -1, lastHp = -1, lastMusou = -1;
const musouBarEl = document.getElementById('musoubar');
const musouFillEl = document.getElementById('musoufill');
const btnUEl = document.getElementById('btnU');
function updateHUD() {
  if (player.hp !== lastHp) { lastHp = player.hp; hud.hp.style.width = (player.hp / player.hpMax * 100) + '%'; }
  if (musou !== lastMusou) {
    lastMusou = musou;
    musouFillEl.style.width = musou + '%';
    musouBarEl.classList.toggle('full', musou >= 100);
    btnUEl?.classList.toggle('ready', musou >= 100);
  }
  if (kills !== lastKills) { lastKills = kills; hud.kills.textContent = `擊殺 ${kills}`; }
  if (combo !== lastCombo) {
    lastCombo = combo;
    if (combo >= 3) {
      hud.combo.textContent = `${combo} HITS`;
      hud.combo.style.opacity = 1;
      hud.combo.classList.toggle('hot', combo >= 30);
    } else hud.combo.style.opacity = 0;
  }
}

// ---------- 劇情對話 ----------
const dlg = { queue: [], active: false, onDone: null };
const dlgBox = document.getElementById('dialog');
function showDialog(lines, onDone) {
  dlg.queue = [...lines];
  dlg.onDone = onDone || null;
  dlg.active = true;
  nextDialog(true);
}
function nextDialog(first = false) {
  if (!first && !dlg.active) return;
  const line = dlg.queue.shift();
  if (!line) {
    dlg.active = false;
    dlgBox.style.display = 'none';
    const cb = dlg.onDone; dlg.onDone = null;
    if (cb) cb();
    return;
  }
  const [who, text] = line;
  const nameEl = document.getElementById('dlgName');
  nameEl.textContent = who;
  nameEl.classList.toggle('enemy', who !== 'RUMI');
  document.getElementById('dlgText').textContent = text;
  dlgBox.style.display = 'block';
  if (AU.ctx) tone('triangle', midi(81), AU.ctx.currentTime, 0.06, 0.08, AU.sfx);
}
dlgBox.addEventListener('pointerdown', e => { e.stopPropagation(); nextDialog(); });
const STORY = {
  s1open: [
    ['RUMI', '魂門出現裂縫了……整條街都是陰差的氣味。'],
    ['RUMI', '開工吧。今晚的舞台——首爾夜市大街。'],
  ],
  s1boss: [
    ['陰差隊長', '渺小的獵魔士……魂門將為吾等而開！'],
    ['RUMI', '守門是我的工作。你，回地府重新排隊。'],
  ],
  s2open: [
    ['RUMI', '血月……裂縫比想像的還深，陰差傾巢而出了。'],
    ['RUMI', 'Mira、Zoey，抱歉——這條街我先清完。'],
  ],
  s2boss: [
    ['陰差大隊長', '吾乃陰差大隊長！汝之魂，今夜歸吾！'],
    ['RUMI', '……來取啊。'],
  ],
  ending: [
    ['RUMI', '魂門，守住了。'],
    ['RUMI', '但裂縫的另一端……還有更深的東西在看著我們。'],
    ['RUMI', '下次，三個人一起來。'],
  ],
};

// ---------- 流程 ----------
function applyStageTint(i) {
  if (i === 1) {
    // 血月煉獄：霓虹半熄、店面熄燈、雨停、血色餘燼、濃霧
    scene.fog.color.set(0x1c0a12);
    scene.fog.near = 20; scene.fog.far = 78;
    hemi.color.set(0xff8a7a); hemi.groundColor.set(0x2a0d14); hemi.intensity = 0.85;
    sun.color.set(0xff9a88); sun.intensity = 1.1;
    warmFill.color.set(0xff3020); warmFill.intensity = 0.5;
    if (skyMat) skyMat.color.set(0xff8878);
    honmoon.children[0].material.color.set(0xff3050);
    honmoon.children[1].material.color.set(0xffa040);
    for (const m of ENV.signs) m.color.setScalar(0.22);
    for (const m of ENV.fronts) m.color.setScalar(0.3);
    for (const m of ENV.wins) m.color.setScalar(0.35);
    for (const m of ENV.tentGlows) m.color.set(0x662418);
    rain.pts.visible = false;
    embers.pts.material.color.set(0xff5030);
    embers.pts.material.size = 0.22;
    heroLight.color.set(0xff6040);
  } else {
    scene.fog.color.set(0x140f28);
    scene.fog.near = 26; scene.fog.far = 100;
    hemi.color.set(0x9a8aff); hemi.groundColor.set(0x201238); hemi.intensity = 1.1;
    sun.color.set(0xbfcaff); sun.intensity = 1.35;
    warmFill.color.set(0xff4fd0); warmFill.intensity = 0.35;
    if (skyMat) skyMat.color.set(0xffffff);
    honmoon.children[0].material.color.set(0xa04fff);
    honmoon.children[1].material.color.set(0xff4fa3);
    for (const m of ENV.signs) m.color.setScalar(1);
    for (const m of ENV.fronts) m.color.setScalar(1);
    for (const m of ENV.wins) m.color.setScalar(1);
    for (const m of ENV.tentGlows) m.color.set(0xffa8d8);
    rain.pts.visible = true;
    embers.pts.material.color.set(0xff7ad0);
    embers.pts.material.size = 0.17;
    heroLight.color.set(0xff4fa3);
  }
}
function loadStage(i) {
  stageIdx = i;
  ZONES = STAGES[i].zones;
  applyStageTint(i);
  for (const e of enemies) { scene.remove(e.root); scene.remove(e.shadow); e.rig.mixer.stopAllAction(); }
  enemies.length = 0;
  for (const dr of drops) scene.remove(dr);
  drops.length = 0;
  for (const b of bolts) scene.remove(b.spr);
  bolts.length = 0;
  for (const b of barriers) {
    b.open = false;
    if (b.wall) { b.wall.visible = true; b.wall.material.opacity = 0.3; }
  }
  const p = player;
  p.x = 0; p.y = 0; p.z = 0; p.vy = 0; p.yaw = Math.PI;
  p.hp = p.hpMax; p.invuln = 0; p.st = 'idle';
  if (p.rig) play(p.rig, 'idle', { fade: 0 });
  level.boss = null;
  musou = 0;
  if (AU.ctx) { AU.nextBar = AU.ctx.currentTime + 0.15; AU.bar = 0; }
  hud.bosswrap.style.display = 'none';
  state = 'play';
  runStartT = performance.now();
  showToast(STAGES[i].name);
  startZone(0);
  showDialog(i === 0 ? STORY.s1open : STORY.s2open);
}
function start() {
  initAudio();
  hud.title.classList.add('hidden');
  kills = 0; combo = 0; maxCombo = 0;
  loadStage(0);
}
function restart() {
  initAudio();
  hud.dead.classList.add('hidden');
  hud.win.classList.add('hidden');
  kills = 0; combo = 0; maxCombo = 0;
  loadStage(stageIdx);
}

// 開發用 debug hook
window.__dbg = () => ({ state, stageIdx, weapon, musou, kills, combo, level: { zi: level.zi, phase: level.phase, zoneKills: level.zoneKills, spawned: level.spawned, bossHp: level.boss?.hp }, player, enemies: enemies.length, alive: enemies.filter(e => e.st !== 'dead').length });
window.__lvl = level;
window.__stage = loadStage;
window.__switch = switchWeapon;
window.__E = enemies;
window.__P = player;
window.__warp = zi => {
  for (const e of enemies) { scene.remove(e.root); scene.remove(e.shadow); e.rig.mixer.stopAllAction(); }
  enemies.length = 0;
  for (let i = 0; i < zi; i++) barriers[i].open = true;
  player.x = 0; player.z = ZONES[zi].enterZ - 6;
  startZone(zi);
};
window.__gl = { renderer, composer, scene, camera };
window.__cap = (mode = 'composer') => {   // 手動渲染一幀並回傳像素統計（隱藏分頁時驗證用）
  updateCamera(0.016);
  if (mode === 'direct') renderer.render(scene, camera);
  else composer.render();
  const c2 = document.createElement('canvas');
  c2.width = 120; c2.height = 68;
  const g = c2.getContext('2d');
  g.drawImage(renderer.domElement, 0, 0, 120, 68);
  const d = g.getImageData(0, 0, 120, 68).data;
  let sum = 0, mx = 0, bright = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
    sum += l; if (l > mx) mx = l; if (l > 60) bright++;
  }
  return { avg: +(sum / (d.length / 4)).toFixed(1), max: mx, brightPx: bright, url: c2.toDataURL() };
};
window.__key = (code, downMs = 60) => {
  dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  setTimeout(() => dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })), downMs);
};

// ---------- 主迴圈 ----------
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  const raw = Math.min(clock.getDelta(), 0.05);
  let dt = raw;
  if (hitStopT > 0) { hitStopT -= raw; dt = raw * 0.06; }

  if (dlg.active && state === 'play') {
    if (player.root) player.rig.mixer.update(raw);
  } else if (state === 'play' || state === 'dead' || state === 'win') {
    updatePlayer(dt);
    updateEnemies(dt);
    if (state === 'play') updateLevel(dt);
    updateFx(dt);
  } else if (player.root) {
    player.rig.mixer.update(raw);
    player.root.rotation.y += raw * 0.4;
  }
  updateAmbient(raw);
  updateCamera(raw);
  updateHUD();
  composer.render();
}
loop();
