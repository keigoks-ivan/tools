// Shared helpers: locale, formatting, glossary terms. Everything user-facing goes through tr(zh, en).
import { GLOSSARY } from './backend.mjs?v=19';

/** English brand name: the ONE place to change it (also: <title> in index.html, games/index.html card). */
export const BRAND_EN = 'SKYGLAZE';

export let locale = 'zh';
try { locale = localStorage.getItem('lang') === 'en' ? 'en' : 'zh'; } catch {}
export const setLocale = (l) => { locale = l; try { localStorage.setItem('lang', l); } catch {} document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; };
export const tr = (zh, en) => (locale === 'zh' ? zh : (en ?? zh));
/** Pick the field for the current locale from a data object: pick(o,'zh','en') or pick(o,'reasonZh','reasonEn'). */
export const pick = (o, zhKey = 'zh', enKey = 'en') => (o ? (locale === 'zh' ? (o[zhKey] ?? o[enKey]) : (o[enKey] ?? o[zhKey])) : '');

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const MINUS = '−';
export function fmtUSD(n) {
  if (!Number.isFinite(n)) return '—';
  const neg = n < 0, a = Math.abs(n), sign = neg ? MINUS : '';
  if (locale === 'zh') {
    if (a >= 1e8) return `${sign}US$ ${(a / 1e8).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, '')} 億`;
    if (a >= 1e6) return `${sign}US$ ${Math.round(a / 1e4).toLocaleString('en-US')} 萬`;
    if (a >= 1e4) return `${sign}US$ ${(a / 1e4).toFixed(1).replace(/\.0$/, '')} 萬`;
    return `${sign}US$ ${Math.round(a).toLocaleString('en-US')}`;
  }
  if (a >= 1e9) return `${sign}US$${(a / 1e9).toFixed(2).replace(/\.?0+$/, '')}B`;
  if (a >= 1e6) return `${sign}US$${(a / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (a >= 1e3) return `${sign}US$${Math.round(a / 1e3)}K`;
  return `${sign}US$${Math.round(a)}`;
}
export const fmtPct = (x, d = 1) => (Number.isFinite(x) ? `${x < 0 ? MINUS : ''}${Math.abs(x * 100).toFixed(d)}%` : '—');
export const fmtPctSigned = (x, d = 1) => (Number.isFinite(x) ? `${x < 0 ? MINUS : '+'}${Math.abs(x * 100).toFixed(d)}%` : '—');
export const fmtNum = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : '—');
export const fmtFare = (n) => `US$ ${Math.round(n).toLocaleString('en-US')}`;

/* ---------- glossary ---------- */
let seenTerms = new Set();
try { seenTerms = new Set(JSON.parse(localStorage.getItem('tq-terms') || '[]')); } catch {}
export const markTermSeen = (key) => { seenTerms.add(key); try { localStorage.setItem('tq-terms', JSON.stringify([...seenTerms])); } catch {} };
export const termKeys = () => Object.keys(GLOSSARY || {});
const termLabel = (key) => { const g = GLOSSARY[key]; return g ? pick(g) || key : key; };
/** A tappable term. label overrides the display text. */
const idx = {};
for (const [k, g] of Object.entries(GLOSSARY || {})) { idx[k] = k; if (g.zh) idx[g.zh] = k; if (g.en) idx[g.en] = k; }
export function term(key0, label) {
  const key = idx[key0] || key0;
  if (!GLOSSARY[key]) return esc(label || key0);
  const first = seenTerms.has(key) ? '' : ' is-new';
  return `<button type="button" class="term${first}" data-term="${esc(key)}">${esc(label || termLabel(key))}</button>`;
}
/** Escape plain text and wrap known glossary terms (current locale) in tappable buttons. */
export function withTerms(text) {
  let out = esc(text);
  const entries = termKeys().map((k) => [k, (pick(GLOSSARY[k]) || k)]).filter(([, w]) => w && w.length >= 2).sort((a, b) => b[1].length - a[1].length);
  const used = new Set();
  for (const [k, w] of entries) {
    const ew = esc(w);
    const idx = out.indexOf(ew);
    if (idx < 0 || used.has(k)) continue;
    // do not match inside an existing tag
    const before = out.slice(0, idx);
    if (before.lastIndexOf('<') > before.lastIndexOf('>')) continue;
    if (/<button[^>]*>[^<]*$/.test(before)) continue;
    used.add(k);
    out = before + term(k, w) + out.slice(idx + ew.length);
  }
  return out;
}
