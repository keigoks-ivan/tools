// List data that needs re-checking: verified_at older than N days (default 60),
// dated sessions already over, and 2027 seasons still without a published date.
// Usage: node scripts/stale.mjs [days] [today YYYY-MM-DD]
import { readFileSync } from 'node:fs';

const L = (n) => JSON.parse(readFileSync(new URL(`../data/${n}.json`, import.meta.url)));
const sessions = L('sessions');
const programs = new Map(L('programs').map((x) => [x.id, x]));
const providers = new Map(L('providers').map((x) => [x.id, x]));

const days = Number(process.argv[2] || 60);
const today = process.argv[3] || new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
const prov = (s) => providers.get(programs.get(s.program_id)?.provider_id)?.name_en || s.program_id;

const old = sessions.filter((s) => s.verified_at < cutoff);
const over = sessions.filter((s) => s.date_status === 'confirmed_target_year' && (s.end_date || s.start_date) < today);
const waiting = new Map();
for (const s of sessions) {
  if (s.season === 'other' || s.date_status === 'confirmed_target_year') continue;
  const k = `${prov(s)}｜${s.season}`;
  waiting.set(k, (waiting.get(k) || 0) + 1);
}

console.log(`# 待複查清單（${today}，查證超過 ${days} 天＝${cutoff} 以前）\n`);
console.log(`## 查證過期：${old.length} 筆`);
const byProv = {};
for (const s of old) (byProv[prov(s)] ||= []).push(`${s.id}（${s.verified_at}）`);
for (const [p, list] of Object.entries(byProv).sort()) console.log(`- ${p}：${list.length} 筆，最舊 ${list.sort()[0]}`);
console.log(`\n## 已結束但仍標「已公布」的梯次：${over.length} 筆`);
for (const s of over) console.log(`- ${s.id}（${s.start_date}～${s.end_date || '?'}）`);
console.log(`\n## 2027 季別還沒有公布日期：${waiting.size} 組（機構｜季別）`);
for (const [k, n] of [...waiting].sort()) console.log(`- ${k}：${n} 筆推估／往年／未知`);
