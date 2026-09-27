// 三人頁結算卡的隊伍成績：每人擊倒、救人、最高連擊，選出本場 MVP（純 DOM，不動戰鬥程式）。
// 結算卡（#result）一出現就畫，隊友的最後成績晚一點到也會即時更新。
import { cssColor } from '../3d-next/net/colors.js';
import { mvpScore, pickMvp } from '../3d-next/net/scores.js';

const esc = text => String(text).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

export function setupTeamResults({ coop, doc = document }) {
  const result = doc.getElementById('result');
  const card = result?.querySelector('.dialog-card');
  if (!card) return { dispose() {} };
  const board = doc.createElement('div');
  board.id = 'teamBoard';
  board.className = 'team-board';
  board.hidden = true;
  card.insertBefore(board, doc.getElementById('retry'));

  function render() {
    const rows = coop.scoreboard();
    if (result.hidden || rows.length < 2) { board.hidden = true; return; }
    const mvp = pickMvp(rows);
    board.hidden = false;
    board.innerHTML = `<div class="tb-head"><span>隊員</span><span>擊倒</span><span>救人</span><span>最高連擊</span></div>${rows.map(row => `
      <div class="tb-row${row.id === mvp ? ' mvp' : ''}" style="--c:${cssColor(row.color)}">
        <span class="tb-name"><i></i>${esc(row.name)}${row.you ? '<small>你</small>' : ''}${row.id === mvp ? '<b class="tb-mvp">MVP</b>' : ''}</span>
        <span>${row.kills}</span><span>${row.revives}</span><span>${row.maxCombo}</span>
      </div>`).join('')}
      <p class="tb-note">${mvp ? `本場 MVP：${esc(rows.find(r => r.id === mvp).name)}（${mvpScore(rows.find(r => r.id === mvp))} 分）` : '這場沒有 MVP'}・擊倒 1 分、救人 5 分、連擊每 10 下 1 分</p>`;
  }

  const observer = new MutationObserver(render);
  observer.observe(result, { attributes: true, attributeFilter: ['hidden'] });
  const off = coop.onScores(() => { if (!result.hidden) render(); });
  return { render, dispose() { observer.disconnect(); off?.(); board.remove(); } };
}
