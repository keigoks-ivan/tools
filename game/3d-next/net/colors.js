/**
 * 三人版的玩家代表色：刀光、殘影、名牌、腳下光圈、救起光柱都用同一個顏色，一眼認得誰是誰。
 * 依顯示名稱（PLAYER_CODES 裡的名字）固定配色，不因進房順序改變；名單外的名字退回依座位輪色。
 * 三色刻意避開敵人的紫、倒地的紅與救援進度的金。
 */
export const PLAYER_COLORS = { matt: 0x3fb4ff, myles: 0xff9f2e, mike: 0x4dff88 };
export const SLOT_COLORS = [0x7fd6ff, 0xffc36b, 0x8dff9e];

export function playerColor(name, slot = 0) {
  return PLAYER_COLORS[String(name ?? '').trim().toLowerCase()] ?? SLOT_COLORS[((slot % SLOT_COLORS.length) + SLOT_COLORS.length) % SLOT_COLORS.length];
}

export const cssColor = hex => `#${(hex >>> 0).toString(16).padStart(6, '0')}`;
