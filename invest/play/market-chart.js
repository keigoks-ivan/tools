export const colors = { mint: '#87e0cc', gold: '#ffce88', grid: '#233746', text: '#a9b9c7' };

export function pathChart(canvas, series, { guide, maximum, minimum, axis, point }) {
  const { width, height } = canvas.getBoundingClientRect();
  if (!width || !height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  const left = 40, right = width - 12, top = 10, bottom = height - 12;
  const number = series[0].values.length;
  const x = index => left + (right - left) * index / Math.max(1, number - 1);
  const y = value => bottom - (bottom - top) * (value - minimum) / (maximum - minimum);
  ctx.font = '600 10px "DM Sans", system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.text;
  for (let tick = 0; tick <= 3; tick++) {
    const value = minimum + tick / 3 * (maximum - minimum);
    ctx.beginPath();
    ctx.moveTo(left, y(value));
    ctx.lineTo(right, y(value));
    ctx.stroke();
    ctx.fillText(axis(value), left - 6, y(value));
  }
  if (guide !== undefined) {
    ctx.strokeStyle = '#a78b72';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(left, y(guide));
    ctx.lineTo(right, y(guide));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const s of series) {
    if (s.fill) {
      const fill = ctx.createLinearGradient(0, top, 0, bottom);
      fill.addColorStop(0, '#87e0cc22');
      fill.addColorStop(1, '#87e0cc00');
      ctx.fillStyle = fill;
      ctx.beginPath();
      s.values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
      ctx.lineTo(right, bottom);
      ctx.lineTo(left, bottom);
      ctx.closePath();
      ctx.fill();
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash ? [4, 4] : []);
    ctx.beginPath();
    s.values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (point !== undefined) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#536d7a';
    ctx.beginPath();
    ctx.moveTo(x(point), top);
    ctx.lineTo(x(point), bottom);
    ctx.stroke();
  }
  for (const s of series) {
    const index = point ?? number - 1;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(x(index), y(s.values[index]), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  return { left, right };
}
