// Check every source / review / booking URL in camps/data and write
// reports/links-<date>.md. Blocked (403/429) is reported separately from dead (404/410/DNS).
// Usage: node scripts/check-links.mjs [concurrency]
import { readFileSync, writeFileSync } from 'node:fs';

const L = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const urls = new Map(); // url -> set of ids using it
const add = (u, id) => {
  if (!u || !/^https?:\/\//.test(u)) return;
  if (!urls.has(u)) urls.set(u, new Set());
  urls.get(u).add(id);
};
for (const n of ['providers', 'programs', 'locations', 'sessions']) {
  for (const x of L(n)) {
    add(x.source_url, x.id);
    add(x.website, x.id);
    add(x.booking?.url, x.id);
    for (const s of x.sources || []) add(s.url, x.id);
  }
}
for (const r of L('reviews')) {
  add(r.url, r.id);
  for (const h of [...(r.highlights_pos || []), ...(r.highlights_neg || [])]) add(h.url, r.id);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function probe(u) {
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(u, { method, redirect: 'follow', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status >= 500)) continue;
      return { status: res.status, final: res.url !== u ? res.url : null };
    } catch (e) {
      if (method === 'GET') return { status: 0, error: e.cause?.code || e.name };
    }
  }
  return { status: 0, error: 'unknown' };
}

const list = [...urls.keys()];
const out = new Map();
const conc = Number(process.argv[2] || 8);
let i = 0;
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < list.length) {
    const u = list[i++];
    out.set(u, await probe(u));
  }
}));

const today = new Date().toISOString().slice(0, 10);
const bucket = (r) => (r.status >= 200 && r.status < 400 ? 'ok' : [401, 403, 429, 999].includes(r.status) ? 'blocked' : 'dead');
const groups = { dead: [], blocked: [], ok: [] };
for (const [u, r] of out) groups[bucket(r)].push([u, r]);
const line = ([u, r]) => `- ${r.status || r.error} ${u}${r.final ? ` → ${r.final}` : ''}（${[...urls.get(u)].slice(0, 4).join('、')}）`;
const md = `# 連結檢查 ${today}\n\n共 ${list.length} 個網址：正常 ${groups.ok.length}、擋爬蟲 ${groups.blocked.length}、失效 ${groups.dead.length}。\n` +
  `擋爬蟲（403／429）不代表失效，要用瀏覽器確認。\n\n## 失效\n${groups.dead.map(line).join('\n') || '（無）'}\n\n## 擋爬蟲\n${groups.blocked.map(line).join('\n') || '（無）'}\n`;
const file = new URL(`../reports/links-${today}.md`, import.meta.url);
writeFileSync(file, md);
console.log(`ok ${groups.ok.length} · blocked ${groups.blocked.length} · dead ${groups.dead.length} → ${file.pathname}`);
