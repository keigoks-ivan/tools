// 大型素材（貼圖、模型、HDR）改從 jsDelivr 下載：
//   網站主機（GitHub Pages）給大檔的速度很慢（實測約 0.1 MB/s），jsDelivr 直接提供同一個公開 repo 的檔案，快十倍以上。
//   版本釘在「素材資料夾（game/mech/assets、game/mech/zero/assets）最後一次改動的 commit」（向 GitHub API 查，30 分鐘內沿用）：
//   只改程式碼、或網站其他地方更新都不會換版本，jsDelivr 的快取一直是熱的（新版本第一次被抓時很慢，要避免常常換）。
//   GitHub API 每個網路每小時只給 60 次，用完會查不到：這時改用上次查到的版本，再不行用下面寫死的版本（ASSET_SHA），
//   不再退回很慢的本站。只有 jsDelivr 本身連不上、本機開發（非正式網域）、網址帶 ?nocdn 才從本站下載。
//   jsDelivr 同一個版本最多只給 50 MB，超過的檔案會回 403：單一檔案抓不到時，自動改從本站抓那一個檔案（其他照樣走 CDN）。
//   ★ 新增或更換這兩個資料夾裡的圖片、模型、HDR 之後，把 ASSET_SHA 改成那次 commit（或更新的）的 SHA。
import * as THREE from 'three';
const REPO = 'keigoks-ivan/tools';
const ASSET_SHA = 'b3e500d281997c7ece03be4296854603f417364c';   // 2026-10-01：共用城市立面、建材與壓縮枝葉
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
      // 兩個素材資料夾各問一次，取比較新的那個 commit（它一定同時包含兩邊最新的檔案）
      const ask = (path) => timed(`https://api.github.com/repos/${REPO}/commits?path=${path}&per_page=1`, {}, 2500)
        .then((r) => (r.ok ? r.json() : null)).then((j) => j && j[0] && { sha: j[0].sha, t: Date.parse(j[0].commit.committer.date) }).catch(() => null);
      const hits = (await Promise.all(['game/mech/assets', 'game/mech/zero/assets'].map(ask))).filter(Boolean);
      const got = hits.length === 2 ? hits.sort((a, b) => b.t - a.t)[0].sha : null;
      if (isSha(got)) { sha = got; try { localStorage.setItem('cdn.sha', JSON.stringify({ sha, t: Date.now() })); } catch (e) {} }
      else sha = known || ASSET_SHA;   // 查不到（次數用完、網路慢）：用上次的或寫死的版本
    }
    // 探一下 jsDelivr 通不通（這個版本不行就換寫死的版本再試一次）
    const probe = (v) => timed(`https://cdn.jsdelivr.net/gh/${REPO}@${v}/game/mech/cdn.js`, { method: 'HEAD' }, 6000).then((r) => r.ok, () => false);
    if (!(await probe(sha))) { if (sha === ASSET_SHA || !(await probe(ASSET_SHA))) return null; sha = ASSET_SHA; }
    const base = `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;
    retryFromSite();
    return (u) => {
      try {
        const url = new URL(u, location.href);
        if (url.origin !== location.origin || !EXT.test(url.pathname)) return u;
        const out = base + url.pathname.replace(/^\//, '');
        return failed.has(out) ? u : out;   // 這個檔案 CDN 抓不到過：改從本站
      } catch (e) { return u; }
    };
  } catch (e) { return null; }
}

// 單一檔案 CDN 失敗（403 超過 50 MB、404、逾時）：記下那個 CDN 網址，同一個 loader 再抓一次，這次網址轉換會回本站網址
const failed = new Set();
function retryFromSite() {
  for (const L of [THREE.FileLoader, THREE.ImageLoader, THREE.ImageBitmapLoader]) {
    const orig = L.prototype.load;
    if (!orig || orig.__cdnRetry) continue;
    const wrapped = function (url, onLoad, onProgress, onError) {
      const self = this, first = this.manager.resolveURL((this.path || '') + url);
      return orig.call(this, url, onLoad, onProgress, (err) => {
        if (first.startsWith('https://cdn.jsdelivr.net/') && !failed.has(first)) { failed.add(first); orig.call(self, url, onLoad, onProgress, onError); }
        else if (onError) onError(err);
      });
    };
    wrapped.__cdnRetry = true;
    L.prototype.load = wrapped;
  }
}
