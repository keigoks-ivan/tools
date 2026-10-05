// 寫死的假資料（樣張用）。所有公司、平台、品牌皆為虛構。
export const company = { name: '半糖日常飲品', city: '雲港市', date: '2026 年 10 月' };

export const hud = {
  cash: 1284500, netProfit: 86300, valuation: 14820000,
};

export const shops = {
  player: { name: '半糖日常', revenue: 282000 },
  rivalA: { name: '大吉茶行', revenue: 527000 },
  rivalB: { name: '青柚手作', revenue: 319000 },
};

export const worldEvent = {
  tag: '世界大事', when: '10 月 3 日',
  title: '進口茶葉關稅調高',
  body: '稅率由 8% 提高到 20%，下月起生效。原料成本預計上升 12%，三家對手同樣受影響。',
  effects: [['原料成本', '+12%', 'bad'], ['毛利率', '−4.3 點', 'bad']],
  choices: [
    { label: '每杯漲價 $5', note: '月銷量約 −6%，淨利約 −$1.1 萬', primary: true },
    { label: '自行吸收', note: '月淨利約 −$3.2 萬，口碑不變', primary: false },
  ],
  deadline: '7 天內決定',
};

export const ticker = [
  '購購通宣布下月起把賣家抽成調到 12%，中小賣家陸續轉向自家官網',
  '央行升息一碼，中小企業貸款利率升至 3.1%',
  '閃播平台舉辦「雙十飲料節」，手搖飲品類報名店家破兩千家',
  '晶片持續缺貨，點餐機器人交期拉長到 90 天',
  '大吉茶行宣布開第 12 家分店，鎖定車站商圈',
  'AI 點餐助理上線，連鎖店人力成本平均降 8%',
];

// 12 個月營收（單位：萬）。2025-11 ～ 2026-10
export const months = ['11', '12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
export const channels = [
  { key: 'store', name: '實體店', color: '#3987e5', data: [21.0, 22.0, 22.5, 23.0, 24.0, 23.5, 25.0, 26.0, 27.0, 27.4, 27.8, 28.2] },
  { key: 'site', name: '官網', color: '#d95926', data: [2.1, 2.4, 2.8, 3.3, 3.9, 4.6, 5.2, 5.9, 6.4, 7.0, 7.6, 8.1] },
  { key: 'market', name: '電商平台', color: '#199e70', data: [3.0, 3.6, 4.1, 4.4, 5.2, 5.9, 6.1, 6.8, 7.2, 7.5, 7.9, 8.4] },
  { key: 'live', name: '直播', color: '#c98500', data: [0.0, 0.0, 0.5, 1.2, 2.2, 1.6, 2.9, 3.8, 3.1, 4.2, 4.9, 5.3] },
];

// 市占率（%）
export const share = [
  { name: '半糖日常', me: true, color: '#199e70', data: [14.2, 14.9, 15.6, 16.1, 17.4, 18.2, 19.5, 20.8, 22.0, 23.1, 24.0, 24.8] },
  { name: '大吉茶行', color: '#e66767', data: [38.0, 37.6, 37.2, 36.9, 36.4, 36.0, 35.6, 35.2, 34.8, 34.5, 34.2, 33.9] },
  { name: '青柚手作', color: '#9085e9', data: [28.0, 27.6, 27.3, 26.8, 26.4, 26.1, 25.8, 25.5, 25.0, 24.6, 24.2, 24.0] },
];

export const tiles = [
  { label: '現金', value: '$128.4 萬', delta: '+3.2%', up: true, spark: [92, 96, 99, 101, 105, 108, 112, 115, 119, 122, 125, 128.4] },
  { label: '月營收', value: '$50.0 萬', delta: '+5.1%', up: true, spark: [26, 28, 30, 32, 35, 36, 39, 42, 44, 46, 47.6, 50.0] },
  { label: '毛利率', value: '61.1%', delta: '−0.8 點', up: false, spark: [58, 59, 60, 60.4, 61, 61.4, 62, 62.3, 62.4, 62.1, 61.9, 61.1] },
  { label: '市占率', value: '24.8%', delta: '+0.8 點', up: true, spark: share[0].data },
  { label: '口碑星等', value: '4.3', stars: 4.3, sub: '3,218 則評價', delta: '+0.1', up: true, spark: [3.8, 3.9, 3.9, 4.0, 4.0, 4.1, 4.1, 4.2, 4.2, 4.2, 4.2, 4.3] },
];

export const products = [
  { name: '招牌珍珠奶茶', price: 55, min: 35, max: 80, cost: 20.5, quality: 82, rating: 4.5, vol: 2380 },
  { name: '四季春青茶', price: 35, min: 20, max: 55, cost: 12.0, quality: 78, rating: 4.3, vol: 1980 },
  { name: '鮮榨柳丁綠茶', price: 65, min: 40, max: 90, cost: 26.5, quality: 85, rating: 4.4, vol: 1260 },
  { name: '手熬黑糖鮮奶', price: 70, min: 45, max: 95, cost: 30.5, quality: 88, rating: 4.6, vol: 1420 },
  { name: '氣泡水果茶', price: 75, min: 45, max: 95, cost: 28.0, quality: 74, rating: 3.9, vol: 770 },
  { name: '芝士奶蓋紅茶', price: 60, min: 35, max: 85, cost: 23.5, quality: 80, rating: 4.2, vol: 1020 },
];
