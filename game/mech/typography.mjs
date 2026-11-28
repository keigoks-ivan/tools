// Canvas font declarations cannot resolve the custom properties used by HTML.
export const BODY = '"Sortie Round","PingFang TC","Microsoft JhengHei",sans-serif';
export const DISPLAY = '"Sortie Display","Sortie Round","PingFang TC",sans-serif';
export const MONO = '"Sortie Mono","Sortie Round",monospace';

const coarsePointer = globalThis.matchMedia?.('(pointer: coarse)');
const words = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh-Hant', { granularity:'word' }) : null;
let fontRevision = 0;
globalThis.document?.fonts?.addEventListener('loadingdone', () => fontRevision++);

// Each HUD keeps only its current layout for each text slot.
export function layoutText(ctx, cache, slot, text, width) {
  const previous = cache[slot];
  if (previous && previous.text === text && previous.limit === width &&
      previous.font === ctx.font && previous.revision === fontRevision) return previous;
  const lines = [];
  let widest = 0;
  function finish(line) {
    const trimmed = line.trimEnd();
    lines.push(trimmed);
    widest = Math.max(widest, ctx.measureText(trimmed).width);
  }
  for (const paragraph of text.split('\n')) {
    let line = '';
    const segments = words ? Array.from(words.segment(paragraph), part => part.segment)
      : paragraph.match(/[a-zA-Z0-9]+|[^\s]|\s+/gu) || [];
    const tokens = [];
    for (const segment of segments) {
      if (tokens.length && /^[，。！？、；：）」』】]/u.test(segment)) tokens[tokens.length - 1] += segment;
      else tokens.push(segment);
    }
    for (const token of tokens) {
      if (/^\s+$/.test(token)) { if (line) line += ' '; continue; }
      if (ctx.measureText(line + token).width <= width) { line += token; continue; }
      if (line) { finish(line); line = ''; }
      if (ctx.measureText(token).width <= width) { line = token; continue; }
      for (const glyph of token) {
        if (line && ctx.measureText(line + glyph).width > width) { finish(line); line = ''; }
        line += glyph;
      }
    }
    finish(line);
  }
  return cache[slot] = { text, limit:width, font:ctx.font, revision:fontRevision, lines, widest };
}

export function drawCaption(ctx, cache, width, bottom, speaker, text, color) {
  const size = Math.max(18, Math.min(24, Math.round(width / 52)));
  const leading = Math.ceil(size * 1.38);
  // In landscape the left thumb pad and the right-hand action buttons flank the radio.
  const height = ctx.canvas.clientHeight;
  const touchLandscape = coarsePointer?.matches && width > height && width >= 650;
  const left = touchLandscape ? 165 : 14;
  const right = touchLandscape ? 284 : 14;
  const center = (left + width - right) / 2;
  if (touchLandscape && height <= 480) bottom = Math.max(bottom, height - 63);
  if (coarsePointer?.matches && width < height) bottom = Math.min(bottom, height - 290);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bodyFont = '400 ' + size + 'px ' + BODY;
  ctx.font = bodyFont;
  const copy = layoutText(ctx, cache, 'caption', text, Math.min(size * 36, width - left - right - 28));
  ctx.font = '700 ' + (size - 3) + 'px ' + DISPLAY;
  const boxWidth = Math.max(copy.widest, ctx.measureText(speaker).width) + 28;
  const top = bottom - 18 - leading * (1 + copy.lines.length);
  ctx.fillStyle = 'rgba(5,15,20,.86)';
  ctx.fillRect(center - boxWidth / 2, top, boxWidth, bottom - top);
  const start = top + 9 + leading / 2;
  ctx.fillStyle = color;
  ctx.fillText(speaker, center, start);
  ctx.font = bodyFont;
  ctx.fillStyle = '#f0f6f7';
  copy.lines.forEach((line, i) => ctx.fillText(line, center, start + (i + 1) * leading));
  ctx.restore();
}
