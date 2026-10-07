// Start a web server at the repo root, then run this with Node and Playwright.
// PLAYWRIGHT_MODULE may point to a Playwright installation outside this repo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8129';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}/games/tycoon/?q=high`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const frames = () => page.evaluate(() => window.__city.frames());
  await page.waitForTimeout(300);
  const idle = await frames(); await page.waitForTimeout(500); assert.equal(await frames(), idle);
  assert.equal(await page.evaluate(() => window.__city.getQuality()), 'high');
  console.log('PASS: paused high-quality scene stops drawing');

  const view = await page.evaluate(() => window.__city.getView());
  await page.mouse.move(620, 480); await page.mouse.down(); await page.mouse.move(760, 510, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(150);
  assert.notEqual(await page.evaluate(() => window.__city.getView().yaw), view.yaw);
  assert.ok(await frames() > idle);
  const still = await frames(); await page.waitForTimeout(400); assert.equal(await frames(), still);
  await page.mouse.wheel(0, -120); await page.waitForTimeout(100); assert.ok(await frames() > still);
  await page.keyboard.down('q'); await page.waitForTimeout(200); await page.keyboard.up('q');
  await page.waitForTimeout(150);
  const stopped = await frames(); await page.waitForTimeout(300); assert.equal(await frames(), stopped);
  console.log('PASS: mouse, zoom and held keys wake the scene and settle again');

  await page.evaluate(() => window.__game.setSpeed(1)); await page.waitForTimeout(300);
  const playing = await frames(); await page.waitForTimeout(300); assert.ok(await frames() > playing);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await page.evaluate(() => [window.__city.frames(), window.__game.world.t]);
  await page.waitForTimeout(600); assert.deepEqual(await page.evaluate(() => [window.__city.frames(), window.__game.world.t]), hidden);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(f => window.__city.frames() > f, hidden[0], { timeout: 10000 });
  await page.evaluate(() => window.__game.setSpeed(0)); await page.waitForTimeout(150);
  console.log('PASS: hidden page stops rendering and simulation; return resumes');

  const population = await page.evaluate(() => {
    const c = window.__city, lots = c.getMapData().lots, lot = lots.find(l => !l.owner), from = [lot.x, lot.z];
    let arrivals = 0; c.freeze(false); c.step(240);
    for (const l of lots) c.setQueue(l.id, 0);
    c.setWeather('rain', true);
    for (let i = 0; i < 300; i++) assertSpawn(c.spawnWalker(from, lot.id, { onArrive: () => arrivals++ }));
    for (let i = 0; i < 14; i++) assertSpawn(c.spawnScooter(lot.id, from, { onArrive: () => arrivals++ }));
    c.setQueue(lot.id, 20); c.step(0.2);
    const busy = c.stats();
    c.step(240); const drained = c.stats();
    c.setShop(lot.id, null); c.setQueue(lot.id, 20);
    const reopened = c.stats(); c.setQueue(lot.id, 0);
    // Reuse freed slots after every moving instance has left.
    assertSpawn(c.spawnWalker(from, lot.id, { onArrive: () => arrivals++ }));
    assertSpawn(c.spawnScooter(lot.id, from, { onArrive: () => arrivals++ }));
    c.step(240); c.setWeather('sunny', true); c.freeze(true);
    return { busy, drained, reopened, final: c.stats(), arrivals };
    function assertSpawn(id) { if (id == null) throw new Error('Visual population unexpectedly capped'); }
  });
  assert.equal(population.busy.walkers, 300); assert.equal(population.busy.scooters, 14); assert.equal(population.busy.queued, 12);
  assert.equal(population.drained.walkers, 0); assert.equal(population.drained.scooters, 0);
  assert.equal(population.reopened.queued, 12); assert.equal(population.final.queued, 0); assert.equal(population.arrivals, 316);
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__city.getQuality()), 'high');
  assert.deepEqual(errors, []);
  console.log('PASS: 300 walkers, queues, rain, 14 scooters, arrivals and slot reuse retain full capacity');
} finally { await browser.close(); }
