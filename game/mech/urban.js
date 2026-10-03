// 共用日文招牌圖集；介面與劇情仍由各遊戲使用繁體中文。
import * as THREE from 'three';
export const SHOP_LABELS = ['パン屋', '喫茶店', '青果店', '理容室', '食堂', '薬局', 'さくら旅館', '自転車店'];

export const SHOP_SUBTITLES = ['焼きたてパン', '自家焙煎珈琲', '新鮮な野菜', 'カット・シェービング', '', '', '素泊まり歓迎', '修理承ります'];
export const PORT_LABELS = ['神戸港', '避難経路', '税関倉庫・貨物埠頭・防波堤'];
export const CIVIC_LABELS = ['止まれ', '三宮駅', '元町商店街', '稲荷神社', '神戸港', '避難場所', '30', '横断歩道'];
export const JAPANESE_FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

export function shopMaterial() {
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
  return new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.12, vertexColors: true });
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
      ctx.fillStyle = i === 6 ? '#233342' : '#eee9df'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold ' + (i === 0 ? 51 : i === 6 ? 92 : 42) + 'px ' + JAPANESE_FONT;
      ctx.fillText(label, 128, i === 0 ? 72 : i === 6 ? 130 : 99);
      if (i !== 0 && i !== 3 && i !== 6) {
        ctx.beginPath(); ctx.moveTo(70, 158); ctx.lineTo(160, 158); ctx.lineTo(160, 145); ctx.lineTo(187, 171); ctx.lineTo(160, 197); ctx.lineTo(160, 184); ctx.lineTo(70, 184); ctx.closePath(); ctx.fill();
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
export function civicUV(i) {
  const x = i % 4 / 4, y = 1 - (Math.floor(i / 4) + 1) / 2, pad = 0.003;
  return [[x + pad, y + pad], [x + 0.25 - pad, y + pad], [x + 0.25 - pad, y + 0.5 - pad], [x + pad, y + 0.5 - pad]];
}
