// 靜態場景圖，依螢幕挑選大小；狀態與操作由 HTML 標記呈現。
const WORLDS = {
  stores: '港邊門店街區，顧客、外送與不同業態的生活圈',
  manufacturing: '工廠剖面，原料倉、產線、品管、工人與交貨碼頭',
  technology: '產品工作室，工程團隊、客服、研發與伺服器機房',
};
export function routeArt(mode, compact = false) {
  const id = Object.hasOwn(WORLDS, mode) ? mode : 'technology';
  return `<img class="route-scene-image" src="assets/worlds/${id}-v1${compact ? '-small' : ''}.webp" ${compact ? '' : `srcset="assets/worlds/${id}-v1-small.webp 640w, assets/worlds/${id}-v1.webp 1440w" sizes="(max-width:780px) calc(100vw - 24px), (max-width:1150px) calc(100vw - 330px), 1040px"`} width="1440" height="720" alt="${WORLDS[id]}" loading="${compact ? 'lazy' : 'eager'}" decoding="async">`;
}
