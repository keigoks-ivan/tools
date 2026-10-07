// Start a web server at the repo root, then run this with Node and Playwright.
// PLAYWRIGHT_MODULE may point to a Playwright installation outside this repo.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:8129';
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const routes = [
  ['', 'routes'],
  ['?mode=manufacturing&business=packaging', 'manufacturing'],
  ['?mode=manufacturing&business=apparel', 'manufacturing'],
  ['?mode=manufacturing&business=electronics', 'manufacturing'],
  ['?mode=technology&business=saas', 'technology'],
  ['?mode=technology&business=marketplace', 'technology'],
  ['?mode=technology&business=content', 'technology'],
];
const footerVisible = () => {
  const r = document.querySelector('.venture-footer,.route-foot').getBoundingClientRect();
  return r.top >= 0 && r.bottom <= innerHeight + 2;
};
async function key(page, value) {
  await page.keyboard.press(value);
  await page.waitForTimeout(300);
}
async function swipe(page, session, direction) {
  const { width, height } = page.viewportSize(), x = Math.round(width / 2);
  const start = height * (direction > 0 ? .8 : .25), distance = height * .55 * direction;
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
  for (let i = 1; i <= 8; i++) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - distance * i / 8 }] });
    await page.waitForTimeout(25);
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
}
try {
  for (const [query, view] of routes) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/games/tycoon/${query}`);
    await page.waitForFunction(() => window.__ready);
    const world = await page.evaluate(() => window.__venture ? JSON.stringify(window.__venture.world) : null);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'auto');
    await page.mouse.move(450, 750); await page.mouse.wheel(0, 650);
    await page.waitForFunction(() => scrollY > 100, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    await key(page, 'Home'); await page.waitForFunction(() => scrollY === 0);
    await key(page, 'PageDown'); await page.waitForFunction(() => scrollY > 100);
    await key(page, 'End'); await page.waitForFunction(footerVisible);
    if (view !== 'routes') {
      await key(page, 'Home'); await page.waitForFunction(() => scrollY === 0);
      await page.locator('.venture-nav [data-tab=report]').click();
      await page.mouse.move(450, 750); await page.mouse.wheel(0, 650);
      await page.waitForFunction(() => scrollY > 100);
      await key(page, 'End'); await page.waitForFunction(footerVisible);
      assert.equal(await page.evaluate(() => JSON.stringify(window.__venture.world)), world);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log(`PASS desktop ${query || 'route selection'}: wheel, PageDown, End, bottom content and report`);
    await context.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await mobile.newPage(), phoneErrors = [];
    phone.on('pageerror', e => phoneErrors.push(e.message));
    await phone.goto(`${base}/games/tycoon/${query}`);
    await phone.waitForFunction(() => window.__ready);
    const phoneWorld = await phone.evaluate(() => window.__venture ? JSON.stringify(window.__venture.world) : null);
    const session = await mobile.newCDPSession(phone);
    await swipe(phone, session, 1);
    assert.ok(await phone.evaluate(() => scrollY) > 100, 'native touch must move the page');
    for (let i = 0; i < 35 && !await phone.evaluate(footerVisible); i++) await swipe(phone, session, 1);
    assert.equal(await phone.evaluate(footerVisible), true, 'touch must reach the bottom');
    for (let i = 0; i < 35 && await phone.evaluate(() => scrollY > 0); i++) await swipe(phone, session, -1);
    assert.equal(await phone.evaluate(() => scrollY), 0, 'touch must return to the top');
    if (view !== 'routes') {
      await phone.locator('.venture-nav [data-tab=report]').click();
      await swipe(phone, session, 1);
      assert.ok(await phone.evaluate(() => scrollY) > 100);
      for (let i = 0; i < 35 && !await phone.evaluate(footerVisible); i++) await swipe(phone, session, 1);
      assert.equal(await phone.evaluate(footerVisible), true, 'touch must reach the report bottom');
      assert.equal(await phone.evaluate(() => JSON.stringify(window.__venture.world)), phoneWorld);
    }
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(phoneErrors, []);
    console.log(`PASS mobile ${query || 'route selection'}: native swipes, bottom content, return to top and report`);
    await mobile.close();
  }

  const city = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await city.newPage();
  await page.goto(`${base}/games/tycoon/?mode=stores`);
  await page.waitForFunction(() => window.__game && window.__city, null, { timeout: 120000 });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overflowY), 'hidden');
  const distance = await page.evaluate(() => window.__city.getView().dist);
  await page.mouse.move(760, 500); await page.mouse.wheel(0, -120);
  await page.waitForFunction(d => window.__city.getView().dist !== d, distance);
  assert.equal(await page.evaluate(() => scrollY), 0);
  console.log('PASS city: viewport remains fixed and wheel still zooms the map');
  await city.close();
} finally { await browser.close(); }
