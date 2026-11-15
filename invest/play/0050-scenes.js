import { benchmarks } from './0050-engine.js?v=1';

const options = {
  direct: ['每月全買', '每月的 1 萬元全部買進。'],
  month: ['全留，月底等兩成', '用收盤月資料算高點和跌幅。'],
  daily: ['全留，每天等兩成', '每天收盤確認是否跌兩成。'],
  month_daily_high: ['月底確認，用日線高點', '每月底才看，跌幅從最高單日收盤算。'],
  split_month: ['買一半，另一半月底看', '每月先投 5,000 元，其餘等月底跌兩成。'],
  split_daily: ['買一半，另一半每天看', '每月先投 5,000 元，其餘每天等跌兩成。'],
  split_month_cap: ['買一半，另一半最多等半年', '月底等跌。每筆預留金滿半年就買。'],
  split_daily_cap: ['半買半等，每天看，最多半年', '半筆先買，其餘每天看，滿半年就買。'],
  boost: ['現在動用預留金', '下一筆連同舊現金買進，這段之後每月全買。']
};

const scenes = {
  '2007-01': [
    { end: 12, prompt: '第一年的錢，要先買還是留著？', keys: ['direct', 'month', 'split_daily'] },
    { end: 19, prompt: '留給下跌的錢，這次要多久看一次？', keys: ['month', 'daily', 'direct'] },
    { end: 24, prompt: '用一筆買進，還是把決定分成兩半？', keys: ['boost', 'split_month', 'split_daily'] },
    { end: 38, prompt: '給預留金一個買進期限嗎？', keys: ['split_month', 'split_month_cap', 'direct'] },
    { end: 60, prompt: '最後一段，保留多少現金等跌？', keys: ['direct', 'split_daily_cap', 'month'] }
  ],
  '2019-01': [
    { end: 12, prompt: '每月這 1 萬元，要一開始就投入嗎？', keys: ['direct', 'month', 'daily'] },
    { end: 15, prompt: '接下來三筆錢，月底看還是每天看？', keys: ['month', 'month_daily_high', 'daily'] },
    { end: 24, prompt: '新的一筆錢，要不要留一半？', keys: ['boost', 'split_daily', 'split_month_cap'] },
    { end: 46, prompt: '這次願意等多久才進場？', keys: ['split_month', 'split_month_cap', 'direct'] },
    { end: 60, prompt: '最後一段，手上的現金要怎麼用？', keys: ['boost', 'split_daily_cap', 'month'] }
  ],
  '2012-01': [
    { end: 12, prompt: '先定一條規則。這一年的錢怎麼買？', keys: ['direct', 'month', 'split_month_cap'] },
    { end: 25, prompt: '還會繼續等同一個跌幅嗎？', keys: ['month', 'daily', 'direct'] },
    { end: 43, prompt: '現金繼續等，還是把一部分先投入？', keys: ['boost', 'split_month', 'split_daily'] },
    { end: 49, prompt: '接下來半年，給每筆錢一個期限嗎？', keys: ['split_month', 'split_daily_cap', 'direct'] },
    { end: 60, prompt: '剩下這段，還要留預留金嗎？', keys: ['direct', 'split_month_cap', 'month'] }
  ]
};

export const SCENE_COUNT = 5;

export function sceneAt(start, played, cash) {
  const script = scenes[start];
  const index = script.findIndex(scene => scene.end > played);
  if (index < 0) return null;
  const { end, prompt, keys } = script[index];
  return {
    index, end, prompt,
    keys: keys.map(key => key === 'boost' && cash < 0.5 ? 'direct' : key)
  };
}

export function optionFor(key) {
  return options[key];
}

export function movesFor(key, count) {
  if (!Object.hasOwn(options, key)) throw new Error('找不到這個做法');
  return Array.from({ length: count }, (_, index) => key === 'boost'
    ? { action: index === 0 ? 'boost' : 'buy', policy: 'manual' }
    : { action: benchmarks[key].action, policy: benchmarks[key].policy });
}
