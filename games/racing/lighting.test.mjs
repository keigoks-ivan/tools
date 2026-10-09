import test from 'node:test';
import assert from 'node:assert/strict';
import { shadowFrame, sunlightProfile } from './lighting.mjs';
import { readFile } from 'node:fs/promises';
import { RGBELoader } from './vendor/addons/loaders/RGBELoader.js';
import { FloatType } from './vendor/three.module.js';

test('clear daylight shadows align with the sun in the shipped HDR pixels', async () => {
  for (const options of [{ city: true }, { canyon: true }, {}]) {
    const profile = sunlightProfile(options);
    const bytes = await readFile(new URL(`./assets/${profile.skyFile}`, import.meta.url));
    const hdr = new RGBELoader().setDataType(FloatType).parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    let peak = 0, pixel = 0;
    for (let i = 0; i < hdr.data.length; i += 4) {
      const luminance = hdr.data[i] * .2126 + hdr.data[i + 1] * .7152 + hdr.data[i + 2] * .0722;
      if (luminance > peak) { peak = luminance; pixel = i / 4; }
    }
    assert.ok(peak > 10000, 'the clear HDR includes a direct sun');
    const latitude = Math.PI / 2 - (Math.floor(pixel / hdr.width) + .5) / hdr.height * Math.PI;
    const longitude = (pixel % hdr.width + .5) / hdr.width * Math.PI * 2 - Math.PI - profile.skyRotation;
    const photographed = { x: Math.cos(latitude) * Math.cos(longitude), y: Math.sin(latitude), z: Math.cos(latitude) * Math.sin(longitude) };
    const length = Math.hypot(profile.sunOffset.x, profile.sunOffset.y, profile.sunOffset.z);
    const dot = Object.keys(photographed).reduce((sum, axis) => sum + photographed[axis] * profile.sunOffset[axis] / length, 0);
    assert.ok(Math.acos(Math.min(1, dot)) < Math.PI / 180, 'rendered sunlight differs from the sky by less than one degree');
  }
});

test('rainy cities and alpine seasons retain the overcast environment', () => {
  assert.equal(sunlightProfile({ city: true, cloudy: true }).skyFile, 'environment.hdr');
  assert.equal(sunlightProfile({ alpine: true }).skyFile, 'environment.hdr');
});

test('shadow window snaps in the light plane and retains the HDR sunlight direction', () => {
  for (const direction of [{ x: -26, y: 125, z: 22 }, { x: -93, y: 41, z: 81 }, { x: -82, y: 95, z: 58 }]) {
    const position = { x: 230.1, y: 24.8, z: -812.3, heading: 1.2 }, frame = shadowFrame(position, direction);
    const dot = a => frame.target.x * a.x + frame.target.y * a.y + frame.target.z * a.z;
    for (const basis of [frame.right, frame.up]) assert.ok(Math.abs(dot(basis) / frame.texel - Math.round(dot(basis) / frame.texel)) < 1e-8);
    const length = Math.hypot(direction.x, direction.y, direction.z);
    for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs((frame.light[axis] - frame.target[axis]) / 1200 - direction[axis] / length) < 1e-10);
    assert.ok(frame.light.y > position.y + 350, 'light depth covers tall city towers');
  }
});

test('sub-texel light-plane motion does not swim the shadow projection', () => {
  const direction = { x: -26, y: 125, z: 22 }, origin = { x: 0, y: 0, z: 0, heading: 0 };
  const a = shadowFrame(origin, direction, { lookAhead: 0 });
  const b = shadowFrame({ ...origin, x: a.right.x * a.texel * .2, z: a.right.z * a.texel * .2 }, direction, { lookAhead: 0 });
  assert.ok(Math.hypot(a.target.x - b.target.x, a.target.y - b.target.y, a.target.z - b.target.z) < 1e-9);
});
