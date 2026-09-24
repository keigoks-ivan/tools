// Offline format packaging; requires sharp. No resizing or lossy processing.
import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const sharp = createRequire(import.meta.url)('sharp');
const checkOnly = process.argv.includes('--check');
let pngBytes = 0, webpBytes = 0;
for (const name of ['rumi-actions-v2', 'enemies-actions-v1', 'night-market-v1']) {
  const source = fileURLToPath(new URL(`../2d/assets/${name}.png`, import.meta.url));
  const target = fileURLToPath(new URL(`../2d/assets/${name}.webp`, import.meta.url));
  if (!checkOnly) await sharp(source).webp({ lossless: true, effort: 6 }).toFile(target);
  const before = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(before.info.width, after.info.width, `${name}: width`);
  assert.equal(before.info.height, after.info.height, `${name}: height`);
  assert.equal(before.data.length, after.data.length, `${name}: buffer length`);
  for (let i = 0; i < before.data.length; i += 4) {
    assert.equal(before.data[i + 3], after.data[i + 3], `${name}: alpha pixel ${i / 4}`);
    // WebP may clear RGB under fully transparent pixels; those values cannot
    // contribute to compositing. Every nonzero-alpha RGB channel must match.
    if (before.data[i + 3] > 0) for (let c = 0; c < 3; c++) {
      assert.equal(before.data[i + c], after.data[i + c], `${name}: channel ${i + c}`);
    }
  }
  pngBytes += (await stat(source)).size;
  webpBytes += (await stat(target)).size;
  console.log(`${name}: dimensions, alpha and every visible RGB pixel match`);
}
console.log(`Transfer: ${pngBytes} -> ${webpBytes} bytes (${(100 * (1 - webpBytes / pngBytes)).toFixed(1)}% smaller)`);
