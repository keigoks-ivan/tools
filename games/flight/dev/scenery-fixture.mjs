// Test-only canvas/Image adapters decode the shipped DEM PNGs without a browser.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const directory = new URL('../', import.meta.url);
function decodePNG(bytes) {
  let width, height, channels, compressed = [];
  for (let at = 8; at < bytes.length;) {
    const size = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + size);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw new Error('Fixture requires non-interlaced RGB8 DEM');
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') compressed.push(data);
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * channels, decoded = new Uint8Array(stride * height), rgba = new Uint8ClampedArray(width * height * 4);
  const paeth = (a, b, c) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    for (let col = 0; col < stride; col++) {
      const index = row * stride + col, a = col >= channels ? decoded[index - channels] : 0, b = row ? decoded[index - stride] : 0, c = row && col >= channels ? decoded[index - stride - channels] : 0;
      const prediction = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      if (prediction === undefined) throw new Error('Invalid fixture PNG filter');
      decoded[index] = (raw[row * (stride + 1) + col + 1] + prediction) & 255;
    }
  }
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = decoded[i * channels]; rgba[i * 4 + 1] = decoded[i * channels + 1]; rgba[i * 4 + 2] = decoded[i * channels + 2]; rgba[i * 4 + 3] = channels === 4 ? decoded[i * channels + 3] : 255; }
  return { width, height, rgba };
}
export function installSceneryFixtures() {
  const previous = { document: globalThis.document, Image: globalThis.Image, fetch: globalThis.fetch, requestAnimationFrame: globalThis.requestAnimationFrame };
  function element(tag) {
    const node = { style: {}, append() {}, appendChild() {}, remove() {} };
    if (tag === 'canvas') node.getContext = () => {
      let image;
      return { drawImage(value) { image = value; }, getImageData(x, y, width, height) { return { data: image?.rgba && image.naturalWidth === width && image.naturalHeight === height ? image.rgba : new Uint8ClampedArray(width * height * 4) }; } };
    };
    return node;
  }
  globalThis.document = { createElement: element, body: element('div') };
  globalThis.Image = class {
    naturalWidth = 4; naturalHeight = 4;
    set src(path) {
      if (!path) return;
      try {
        if (String(path).endsWith('.png')) { const decoded = decodePNG(readFileSync(new URL(path, directory))); this.naturalWidth = decoded.width; this.naturalHeight = decoded.height; this.rgba = decoded.rgba; }
        queueMicrotask(() => this.onload?.());
      } catch (error) { queueMicrotask(() => this.onerror?.(error)); }
    }
  };
  globalThis.fetch = async path => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(path, directory), 'utf8')) });
  globalThis.requestAnimationFrame = callback => queueMicrotask(callback);
  return () => Object.assign(globalThis, previous);
}
