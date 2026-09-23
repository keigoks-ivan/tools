// Map each existing storefront plane to one of eight painted atlas panels.
export function mapStorefrontPanel(geometry, index, width, height) {
  const panel = ((index % 8) + 8) % 8;
  const col = panel % 2, row = Math.floor(panel / 2);
  const padX = 2 / width, padY = 2 / height;
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i,
      col / 2 + padX + uv.getX(i) * (0.5 - 2 * padX),
      1 - (row + 1) / 4 + padY + uv.getY(i) * (0.25 - 2 * padY));
  }
  uv.needsUpdate = true;
  return geometry;
}
