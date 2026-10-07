// 同一組業態圖形用於地圖標籤、選店與立體招牌，避免外觀與經營類型不一致。
const marks = {
  tea: 'M6 8h12l-2 13H8L6 8ZM5 5h14M13 5l2-4M8 13h8',
  cafe: 'M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8ZM16 9h2a3 3 0 0 1 0 6h-2M7 4V2M12 4V2M3 22h15',
  bento: 'M4 5h16v15H4V5ZM4 11h16M12 5v15M7 8h2M7 15h2M15 15h2',
  bakery: 'M5 10a4 4 0 0 1-1-7 4 4 0 0 1 6-1 4 4 0 0 1 6 0 4 4 0 0 1 4 7v12H5V10ZM8 12v5M12 11v6M16 12v5',
  convenience: 'M4 7h16l-1 14H5L4 7ZM8 7V5a4 4 0 0 1 8 0v2M8 11v2M16 11v2',
  salon: 'M7 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM7 9l14 12M7 18 21 2',
  restaurant: 'M2 2v6a3 3 0 0 0 6 0V2M5 2v20M19 2c-4 3-4 7 0 9v11M12 7a6 6 0 0 1 0 12',
  supermarket: 'M1 3h3l3 13h12l3-10H5M9 9v4M14 9v4M19 9v4M9 20h.01M18 20h.01',
  fitness: 'M8 12h8M5 5v14M8 7v10M16 7v10M19 5v14M2 9v6M22 9v6',
};
export function businessIcon(id) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${marks[id] || marks.tea}"/></svg>`;
}
export function drawBusinessMark(g, id, x, y, size) {
  g.save(); g.translate(x, y); g.scale(size / 24, size / 24);
  g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = g.lineJoin = 'round';
  g.stroke(new Path2D(marks[id] || marks.tea)); g.restore();
}
