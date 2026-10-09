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
  'lighting.mjs',
  'tyre-marks.js',
  'world.js',
  'world-terrain.mjs',
  'world-city-backdrop.js',
  'world-materials.js',
  'road-surface.mjs',
  'world-vegetation.js',
  'world-landmarks.js',
  'world-road.js',
  'world-cities.js',
  'world-city-districts.mjs',
  'world-city-ground.mjs',
  'world-city-taipei-facades.js',
  'world-city-facade-depth.js',
  'world-city-taipei-streets.js',
  'world-city-roadmarkings.js',
  'world-city-streetfronts.js',
  'world-city-kobe-streets.js',
  'world-cities-extra.js',
  'world-city-kit.js',
  'world-city-australia.js',
  'world-city-america.js',
  'world-city-europe.js',
  'car.js',
  'cars-extra.js',
  'cars-production.js',
  'vehicle-body-surfaces.js',
  'cars-bmw-x3.js',
  'vehicle-taillights.js',
  'vehicle-rear-details.js',
  'vehicles.mjs',
  'records.mjs',
  'track.mjs',
  'physics.mjs',
  'road-pose.mjs',
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
