/**
 * 三人頁：快捷喊話與結算成績（只有三人頁會載入）。
 * 喊話與成績都走 relay 的 x 訊息（每則十幾 bytes）；成績有變才送，最多每秒一次。
 */
export const PINGS = { 1: '救我！', 2: '這邊！', 3: '衝啊！' };
export const PING_SHOW_MS = 2600;
export const PING_COOLDOWN_MS = 900;
export const STATS_EVERY_MS = 1000;

/** MVP 分數：擊倒 1 分、救起隊友 5 分、最高連擊每 10 下 1 分 */
export function mvpScore(row) {
  return (row.kills | 0) + (row.revives | 0) * 5 + Math.floor((row.maxCombo | 0) / 10);
}

/** 回傳 MVP 的 id；沒人得分或只有一人時回 null；同分時擊倒多的勝，再同分就從缺 */
export function pickMvp(rows) {
  if (!rows || rows.length < 2) return null;
  const ranked = [...rows].map(row => ({ row, score: mvpScore(row) })).sort((a, b) => b.score - a.score || (b.row.kills | 0) - (a.row.kills | 0));
  const [first, second] = ranked;
  if (!first.score) return null;
  if (second && second.score === first.score && (second.row.kills | 0) === (first.row.kills | 0)) return null;
  return first.row.id;
}
