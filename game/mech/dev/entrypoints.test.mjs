import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the three campaign pages each point to a shipped module entry', async () => {
  for (const page of ['../index.html', '../zero/index.html', '../lastline/index.html']) {
    const url = new URL(page, import.meta.url);
    const html = await readFile(url, 'utf8');
    const entry = html.match(/<script type="module" src="([^"]+)"><\/script>/)?.[1];
    assert(entry, `missing entry in ${page}`);
    const module = new URL(entry, url);
    await assert.doesNotReject(readFile(module), `${page} points to missing ${module.pathname}`);
  }
});

test('Last Line has one import-map version per module path', async () => {
  const url = new URL('../lastline/index.html', import.meta.url);
  const html = await readFile(url, 'utf8');
  const { imports } = JSON.parse(html.match(/<script type="importmap">([^<]+)<\/script>/)[1]);
  const paths = Object.keys(imports).map(path => new URL(path, url).href);
  assert.equal(new Set(paths).size, paths.length);
});
