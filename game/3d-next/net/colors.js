/**
 * 連線版的玩家代表色：刀光、殘影、名牌、腳下光圈、救起光柱都用同一個顏色，一眼認得誰是誰。
 * 依顯示名稱（PLAYER_CODES 裡的名字）固定配色，不因進房順序改變。
 * 名單外的名字（例如第四位兄弟）用名字算出 EXTRA_COLORS 裡的一色：每台畫面算出來都一樣；沒有名字才依座位輪色。
 * 全部刻意避開敵人的紫、倒地的紅與救援進度的金。
 */
export const PLAYER_COLORS = { matt: 0x3fb4ff, myles: 0xff9f2e, mike: 0x4dff88 };
export const EXTRA_COLORS = [0xff7ad9, 0xf2f4ff, 0x2fe0d0, 0xc8ff4d];   // 粉、白、青、黃綠：跟上面三色都分得開
export const SLOT_COLORS = EXTRA_COLORS;

const pick = (list, i) => list[((i % list.length) + list.length) % list.length];

export function playerColor(name, slot = 0) {
  const key = String(name ?? '').trim().toLowerCase();
  if (PLAYER_COLORS[key] != null) return PLAYER_COLORS[key];
  if (!key) return pick(SLOT_COLORS, slot);
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return pick(EXTRA_COLORS, hash);
}

export const cssColor = hex => `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
