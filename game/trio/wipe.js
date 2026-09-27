// 三人頁的全滅／重新集結轉場（純 DOM＋CSS，不動戰鬥程式）。
// wipe：畫面褪色、紅色斬痕劃過、「全軍覆沒」蓋章、三人名牌依序亮起再變灰，約 2 秒後才出現結算卡。
// regroup：任何人按了重來、新的一局開始時，三道代表色光帶掃過畫面、「再次出陣」，畫面恢復顏色。
import { cssColor } from '../3d-next/net/colors.js';

const WIPE_CARD_DELAY_MS = 2100;

export function setupWipeTransitions({ coop, client, doc = document }) {
  const layer = doc.createElement('div');
  layer.id = 'teamTransition';
  layer.className = 'team-transition';
  layer.setAttribute('aria-hidden', 'true');
  doc.querySelector('main')?.appendChild(layer) ?? doc.body.appendChild(layer);
  const result = doc.getElementById('result');
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clear = () => { for (const t of timers) clearTimeout(t); timers = []; };

  function roster() {
    const ids = client.members?.size ? [...client.members.keys()] : [client.you].filter(Boolean);
    return ids.map(id => ({ name: client.members?.get(id)?.name || '隊友', color: cssColor(coop.colorOf?.(id) ?? 0x9ad8ff) }));
  }
  function chips() {
    return roster().map((p, i) => `<span class="tt-chip" style="--c:${p.color};--i:${i}">${p.name.replace(/[<>&"]/g, '')}</span>`).join('');
  }

  function wipe() {
    clear();
    layer.innerHTML = `<i class="tt-vignette"></i><i class="tt-slash a"></i><i class="tt-slash b"></i>
      <div class="tt-center"><b class="tt-title">全軍覆沒</b><small class="tt-sub">ALL FALLEN</small><div class="tt-roster">${chips()}</div></div>`;
    layer.className = 'team-transition wipe';
    doc.body.classList.add('team-wiped');
    result?.classList.add('tt-hold');
    later(() => result?.classList.remove('tt-hold'), WIPE_CARD_DELAY_MS);
  }

  function regroup() {
    clear();
    result?.classList.remove('tt-hold');
    doc.body.classList.remove('team-wiped');
    const streaks = roster().map((p, i) => `<i class="tt-streak" style="--c:${p.color};--i:${i}"></i>`).join('');
    layer.innerHTML = `${streaks}<div class="tt-center"><b class="tt-title go">再次出陣</b><div class="tt-roster">${chips()}</div></div>`;
    layer.className = 'team-transition regroup';
    later(() => { layer.className = 'team-transition'; layer.innerHTML = ''; }, 1700);
  }

  const off = coop.onTeamEvent?.(event => {
    if (event.type === 'wipe') wipe();
    else if (event.type === 'regroup') regroup();
  });
  return { wipe, regroup, dispose() { off?.(); clear(); layer.remove(); } };
}
