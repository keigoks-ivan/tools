// 大型素材（貼圖、模型、HDR）改從 jsDelivr 下載：
//   網站主機（GitHub Pages）給大檔的速度很慢（實測約 0.1 MB/s），jsDelivr 直接提供同一個公開 repo 的檔案，快十倍以上。
//   版本釘在 main 最新的 commit（向 GitHub API 查，10 分鐘內沿用），所以跟網站是同一份檔案、可以放心長期快取。
//   查不到版本、jsDelivr 連不上、本機開發（非正式網域）、網址帶 ?nocdn：一律照舊從本站下載。
const REPO = 'keigoks-ivan/tools';
const EXT = /\.(jpe?g|png|webp|hdr|glb|gltf|bin)$/i;

function timed(url, opt, ms) {
  const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opt, signal: ctl.signal }).finally(() => clearTimeout(tm));
}

// 回傳網址轉換函式（給 LoadingManager.setURLModifier 用），不能用 CDN 時回傳 null
export async function useCDN() {
  if (!/(^|\.)investmquest\.com$/.test(location.hostname) || new URLSearchParams(location.search).has('nocdn')) return null;
  let sha = null;
  try { const c = JSON.parse(localStorage.getItem('cdn.sha') || 'null'); if (c && Date.now() - c.t < 10 * 60e3) sha = c.sha; } catch (e) {}
  try {
    if (!sha) {
      const r = await timed(`https://api.github.com/repos/${REPO}/commits/main`, { headers: { Accept: 'application/vnd.github.sha' } }, 2500);
      sha = r.ok ? (await r.text()).trim() : null;
      if (!/^[0-9a-f]{40}$/.test(sha || '')) return null;
      try { localStorage.setItem('cdn.sha', JSON.stringify({ sha, t: Date.now() })); } catch (e) {}
    }
    const base = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
    // 探一下 jsDelivr 通不通
    const ok = await timed(base + 'game/mech/cdn.js', { method: 'HEAD' }, 3000).then((r) => r.ok, () => false);
    if (!ok) return null;
    return (u) => {
      try {
        const url = new URL(u, location.href);
        if (url.origin !== location.origin || !EXT.test(url.pathname)) return u;
        return base + url.pathname.replace(/^\//, '');
      } catch (e) { return u; }
    };
  } catch (e) { return null; }
}
