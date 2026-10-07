// Responsive coordinates are CSS pixels. The simulation always keeps its 390px world.
export function createLayout(width, height, coarse = false) {
  const landscape = width > height * 1.12;
  let stage, dock, buttons, colors;
  if (landscape) {
    const compact = height < 360;
    const dockWidth = compact ? 296 : Math.min(340, Math.max(248, width * .25));
    dock = { x: width - dockWidth, y: 0, w: dockWidth, h: height };
    stage = { x: 0, y: 0, w: dock.x, h: height };
    const diameter = Math.min(100, (dockWidth - 108) / 2, Math.max(64, (height - 40) / 5.4));
    const gap = Math.min(18, Math.max(6, (height - diameter * 5 - 24) / 4));
    const span = diameter * 5 + gap * 4;
    buttons = Array.from({ length: 9 }, (_, i) => ({
      x: dock.x + 16 + diameter / 2 + (i % 2) * (diameter + 12), y: (height - span) / 2 + diameter / 2 + Math.floor(i / 2) * (diameter + gap), r: diameter / 2
    }));
    const r = 24;
    const colorGap = Math.min(18, Math.max(5, (height - 24 - r * 12) / 5));
    const colorSpan = r * 12 + colorGap * 5;
    colors = Array.from({ length: 6 }, (_, i) => ({
      x: width - 32, y: (height - colorSpan) / 2 + r + i * (r * 2 + colorGap), r
    }));
    if (compact) {
      buttons = Array.from({ length: 9 }, (_, i) => ({
        x: dock.x + 48 + (i % 3) * 72, y: height / 2 + (Math.floor(i / 3) - 1) * 72, r: 32
      }));
      const smallR = Math.min(21, (height - 28) / 12.6);
      const step = Math.min(49, (height - 20) / 6);
      colors = Array.from({ length: 6 }, (_, i) => ({x: dock.x + 268, y: height / 2 + (i - 2.5) * step, r: smallR}));
    }
  } else {
    const diameter = Math.min(104, Math.max(64, (width - 32) / 5.35));
    const r = Math.min(31, Math.max(23, (width - 30) / 14));
    const dockHeight = diameter * 2 + r * 2 + 48;
    dock = { x: 0, y: height - dockHeight, w: width, h: dockHeight };
    stage = { x: 0, y: 0, w: width, h: dock.y };
    const toolStep = Math.max(64, Math.min(diameter + 16, (width - 16) / 5));
    buttons = Array.from({ length: 9 }, (_, i) => ({ x: width / 2 + (i < 5 ? i - 2 : i - 6.5) * toolStep, y: dock.y + 12 + diameter / 2 + Math.floor(i / 5) * (diameter + 10), r: diameter / 2 }));
    const colorStep = Math.min(r * 2 + 20, (width - 20) / 6);
    colors = Array.from({ length: 6 }, (_, i) => ({ x: width / 2 + (i - 2.5) * colorStep, y: height - 20 - r, r }));
  }
  // Keep every hair tip above the tray and the crown below the top edge.
  const scale = Math.min(stage.w / 390, (stage.h - (height < 450 && landscape ? 148 : 196)) / 490);
  const world = { scale, x: stage.x + (stage.w - 390 * scale) / 2, y: stage.y + stage.h - 611 * scale };
  return { width, height, landscape, coarse, stage, dock, buttons, colors, world };
}
export function toWorld(point, layout) {
  return { x: (point.x - layout.world.x) / layout.world.scale, y: (point.y - layout.world.y) / layout.world.scale };
}
export function inStage(point, layout) {
  const r = layout.stage;
  return point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y < r.y + r.h;
}
