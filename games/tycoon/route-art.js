// 靜態場景圖，依螢幕挑選大小；只載入玩家目前經營的業態。
const WORLDS = {
  stores: '港邊門店街區，顧客、外送與不同業態的生活圈',
  manufacturing: '包材工廠，紙材原料、成型機、品管與裝貨碼頭',
  technology: '訂閱軟體工作室，客服、產品團隊與伺服器機房',
};
const SCENES = {
  manufacturing: {
    packaging: '包材工廠，紙材原料、成型機、品管與裝貨碼頭',
    apparel: '服飾代工工坊，布料倉、裁剪縫紉、整燙品管與交貨',
    electronics: '電子組裝工廠，元件倉、貼片焊接設備、測試品管與交貨',
  },
  technology: {
    saas: '訂閱軟體工作室，客服、新客引導、產品開發與伺服器維運',
    marketplace: '媒合平台營運中心，商家進駐、交易調度、信任審查與維運',
    content: '內容平台工作室，錄音拍攝、編輯製作、社群客服與伺服器維運',
  },
};
export function routeArt(mode, compact = false, businessId = '') {
  const id = Object.hasOwn(WORLDS, mode) ? mode : 'technology';
  const scenes = SCENES[id], scene = scenes && (Object.hasOwn(scenes, businessId) ? businessId : id === 'manufacturing' ? 'packaging' : 'saas');
  const asset = scene ? `${scene}-v2` : `${id}-v1`, alt = scene ? scenes[scene] : WORLDS[id], height = scene ? 810 : 720;
  return `<img class="route-scene-image" src="assets/worlds/${asset}${compact ? '-small' : ''}.webp" ${compact ? '' : `srcset="assets/worlds/${asset}-small.webp 640w, assets/worlds/${asset}.webp 1440w" sizes="(max-width:780px) calc(100vw - 24px), (max-width:1150px) calc(100vw - 330px), 1040px"`} width="1440" height="${height}" alt="${alt}" loading="${compact ? 'lazy' : 'eager'}" decoding="async">`;
}
