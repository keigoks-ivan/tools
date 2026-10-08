import { access, cp, mkdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('..', import.meta.url));
const output = join(source, 'dist');
const entries = [
  'index.html',
  'style.css',
  'main.js',
  'audio.mjs',
  'cockpit.js',
  'seasons.mjs',
  'weather.js',
  'world.js',
  'world-materials.js',
  'world-vegetation.js',
  'world-landmarks.js',
  'world-road.js',
  'world-cities.js',
  'world-cities-extra.js',
  'world-city-kit.js',
  'world-city-australia.js',
  'world-city-america.js',
  'world-city-europe.js',
  'car.js',
  'cars-extra.js',
  'cars-production.js',
  'vehicles.mjs',
  'records.mjs',
  'track.mjs',
  'physics.mjs',
  'touch-controls.mjs',
  'tilt-steering.mjs',
  'vendor',
  'assets',
];

await Promise.all(entries.map(entry => access(join(source, entry))));
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const entry of entries) {
  await cp(join(source, entry), join(output, entry), { recursive: true });
}
console.log(`Static game built: ${relative(process.cwd(), output) || 'dist'}`);
