// 共用街邊招牌：日式街區用固定日文，其餘店面用繁體中文。
import * as THREE from 'three';
export const SHOP_LABELS = ['麵包坊', '咖啡館', '藥局', '雜貨店', '食堂', '薬局', 'さくら旅館', '自転車店'];

export const SHOP_SUBTITLES = ['每日手作', '手沖咖啡', '藥師諮詢', '生活用品', '', '', '素泊まり歓迎', '修理承ります'];
export const PORT_LABELS = ['北浜港', '避難経路', '税関倉庫・貨物埠頭・防波堤'];
export const JAPANESE_FONT = '"Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';

export function shopMaterial() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const colors = [['#3b4b42', '#ddd3b4'], ['#5f3430', '#e2d6b9'], ['#ddd8c9', '#34504a'], ['#39495a', '#d5d4c5'], ['#833b31', '#eee3c7'], ['#ddd4b4', '#2e443d'], ['#55504b', '#dfd4b7'], ['#3e4345', '#d8caa7']];
  const signs = SHOP_LABELS.map((label, i) => [label, ...colors[i]]);
  const chineseFont = '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const draw = () => {
    for (let i = 0; i < signs.length; i++) {
      const x = i % 4 * 256, y = Math.floor(i / 4) * 256, [label, bg, ink] = signs[i];
      ctx.fillStyle = bg; ctx.fillRect(x, y, 256, 256);
      ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(x + 9, y + 9, 238, 238);
      ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const font = i < 4 ? chineseFont : JAPANESE_FONT;
      if (i === 4 || i === 5) {
        ctx.font = 'bold 76px ' + font; [...label].forEach((s, j) => ctx.fillText(s, x + 128, y + 76 + j * 108));
      } else {
        ctx.font = 'bold 45px ' + font; ctx.fillText(label, x + 128, y + 110);
        ctx.font = '20px ' + font; ctx.fillText(SHOP_SUBTITLES[i], x + 128, y + 155);
      }
      // 漆面褪色與積灰，不用高解析素材。
      for (let k = 0; k < 100; k++) {
        const px = (k * 73 + i * 17) % 256, py = (k * 109 + i * 31) % 256;
        ctx.fillStyle = k % 2 ? 'rgba(26,24,20,.1)' : 'rgba(230,225,207,.13)'; ctx.fillRect(x + px, y + py, 3 + k % 7, 2);
      }
    }
  }; draw();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  if (document.fonts) Promise.all([
    document.fonts.load('bold 45px "Noto Sans JP"', SHOP_LABELS.slice(4).join('') + SHOP_SUBTITLES.slice(4).join('')),
    document.fonts.load('bold 45px "Noto Sans TC"', SHOP_LABELS.slice(0, 4).join('') + SHOP_SUBTITLES.slice(0, 4).join('')),
  ]).then(() => { draw(); map.needsUpdate = true; }).catch(() => {});
  return new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.12, vertexColors: true });
}
export function shopUV(i) {
  const x = i % 4 / 4, y = 1 - (Math.floor(i / 4) + 1) / 2, pad = 0.003;
  return [[x + pad, y + pad], [x + 0.25 - pad, y + pad], [x + 0.25 - pad, y + 0.5 - pad], [x + pad, y + 0.5 - pad]];
}
