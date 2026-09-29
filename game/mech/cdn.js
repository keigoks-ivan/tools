// 大型素材（貼圖、模型、HDR）改從 jsDelivr 下載：
//   網站主機（GitHub Pages）給大檔的速度很慢（實測約 0.1 MB/s），jsDelivr 直接提供同一個公開 repo 的檔案，快十倍以上。
//   版本釘在「game/ 資料夾最後一次改動的 commit」（向 GitHub API 查，30 分鐘內沿用）：網站其他地方（美髮師、首頁）更新不會換版本，
//   jsDelivr 的快取一直是熱的。
//   GitHub API 每個網路每小時只給 60 次，用完會查不到：這時改用上次查到的版本，再不行用下面寫死的版本（ASSET_SHA），
//   不再退回很慢的本站。只有 jsDelivr 本身連不上、本機開發（非正式網域）、網址帶 ?nocdn 才從本站下載。
//   ★ 新增或更換 game/ 裡的圖片、模型、HDR 之後，把 ASSET_SHA 改成那次 commit（或更新的）的 SHA。
const REPO = 'keigoks-ivan/tools';
const ASSET_SHA = '26bf439279a6ac3f065e978954144f953afa002b';   // 2026-09-29：最後一次改素材
const EXT = /\.(jpe?g|png|webp|hdr|glb|gltf|bin)$/i;

function timed(url, opt, ms) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opt, signal: ctl.signal }).finally(() => clearTimeout(tm));
}
const isSha = (s) => /^[0-9a-f]{40}$/.test(s || '');

// 回傳網址轉換函式（給 LoadingManager.setURLModifier 用），不能用 CDN 時回傳 null
export async function useCDN() {
  if (!/(^|\.)investmquest\.com$/.test(location.hostname) || new URLSearchParams(location.search).has('nocdn')) return null;
  let sha = null, known = null;
  try { const c = JSON.parse(localStorage.getItem('cdn.sha') || 'null'); if (c && isSha(c.sha)) { known = c.sha; if (Date.now() - c.t < 30 * 60e3) sha = c.sha; } } catch (e) {}
  try {
    if (!sha) {
      const r = await timed(`https://api.github.com/repos/${REPO}/commits?path=game&per_page=1`, {}, 2500).catch(() => null);
      const got = r && r.ok ? (await r.json().catch(() => null))?.[0]?.sha : null;
      if (isSha(got)) { sha = got; try { localStorage.setItem('cdn.sha', JSON.stringify({ sha, t: Date.now() })); } catch (e) {} }
      else sha = known || ASSET_SHA;   // 查不到（次數用完、網路慢）：用上次的或寫死的版本
    }
    // 探一下 jsDelivr 通不通（這個版本不行就換寫死的版本再試一次）
    const probe = (v) => timed(`https://cdn.jsdelivr.net/gh/${REPO}@${v}/game/mech/cdn.js`, { method: 'HEAD' }, 3000).then((r) => r.ok, () => false);
    if (!(await probe(sha))) { if (sha === ASSET_SHA || !(await probe(ASSET_SHA))) return null; sha = ASSET_SHA; }
    const base = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
    return (u) => {
      try {
        const url = new URL(u, location.href);
        if (url.origin !== location.origin || !EXT.test(url.pathname)) return u;
        return base + url.pathname.replace(/^\//, '');
      } catch (e) { return u; }
    };
  } catch (e) { return null; }
}
