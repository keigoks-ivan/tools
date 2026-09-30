// 共用街邊招牌圖集：離線生成，兩個遊戲不用再下載店面貼圖。
import * as THREE from 'three';

export function shopMaterial() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  const signs = [['BAKERY', '#3b4b42', '#ddd3b4'], ['CAFÉ', '#5f3430', '#e2d6b9'], ['PHARMACY', '#ddd8c9', '#34504a'], ['MARKET', '#39495a', '#d5d4c5'], ['麵館', '#833b31', '#eee3c7'], ['商店', '#ddd4b4', '#2e443d'], ['HOTEL', '#55504b', '#dfd4b7'], ['REPAIRS', '#3e4345', '#d8caa7']];
  for (let i = 0; i < signs.length; i++) {
    const x = i % 4 * 256, y = Math.floor(i / 4) * 256, [label, bg, ink] = signs[i];
    ctx.fillStyle = bg; ctx.fillRect(x, y, 256, 256);
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(x + 9, y + 9, 238, 238);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (i === 4 || i === 5) {
      ctx.font = 'bold 76px serif'; [...label].forEach((s, j) => ctx.fillText(s, x + 128, y + 76 + j * 108));
    } else {
      ctx.font = `${i === 1 ? 'italic ' : ''}bold ${label.length > 6 ? 32 : 42}px serif`; ctx.fillText(label, x + 128, y + 110);
      ctx.font = '16px sans-serif'; ctx.fillText(i < 2 ? 'EST. 1948' : 'CENTRAL DISTRICT', x + 128, y + 155);
    }
    // 漆面褪色與積灰，不用高解析素材。
    for (let k = 0; k < 100; k++) {
      const px = (k * 73 + i * 17) % 256, py = (k * 109 + i * 31) % 256;
      ctx.fillStyle = k % 2 ? 'rgba(26,24,20,.1)' : 'rgba(230,225,207,.13)'; ctx.fillRect(x + px, y + py, 3 + k % 7, 2);
    }
  }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map, roughness: 0.7, metalness: 0.12, vertexColors: true });
}
export function shopUV(i) {
  const x = i % 4 / 4, y = 1 - (Math.floor(i / 4) + 1) / 2, pad = 0.003;
  return [[x + pad, y + pad], [x + 0.25 - pad, y + pad], [x + 0.25 - pad, y + 0.5 - pad], [x + pad, y + 0.5 - pad]];
}
