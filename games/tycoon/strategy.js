// 定位與委任均為遊戲假設；預設值完全沿用原本的經營模型。
export const PROFILES = {
  balanced: { name: '大眾市場', quality: 0, speed: 1, priceSensitivity: 1, income: 0, fit: { 住宅: 1, 辦公: 1, 學校: 1, 捷運: 1, 商圈: 1 } },
  value: { name: '平價快服務', quality: -2, speed: 1.08, priceSensitivity: 1.2, income: -0.45, fit: { 住宅: 1.02, 辦公: 1.08, 學校: 1.22, 捷運: 1.12, 商圈: 0.78 } },
  premium: { name: '品質與體驗', quality: 6, speed: 0.88, priceSensitivity: 0.8, income: 0.65, fit: { 住宅: 0.94, 辦公: 0.98, 學校: 0.7, 捷運: 0.82, 商圈: 1.2 } },
};
const PROFILE_FEES = { tea: 6000, cafe: 9000, bento: 6000, bakery: 9000, convenience: 8000, salon: 10000, restaurant: 18000, supermarket: 24000, fitness: 20000 };
export const MANAGERS = {
  none: { name: '自己管理', monthly: 0, hiring: 0, sample: 0 },
  assistant: { name: '值班主管', monthly: 18000, hiring: 12000, sample: 7 },
  experienced: { name: '資深店長', monthly: 32000, hiring: 30000, sample: 21 },
};
export function strategyOf(s) { return s.strategy || { profile: 'balanced', weights: {} }; }
export function managerOf(s) { return s.manager || { tier: 'none', goal: 'profit', reserveMonths: 1, staffing: true, purchasing: true, lastReviewT: null, note: '尚未委任' }; }
export function strategyEffects(s, strategy = strategyOf(s)) {
  const p = PROFILES[strategy.profile] || PROFILES.balanced;
  const weights = Object.values(strategy.weights || {}), total = Object.keys(s.prices || {}).length || weights.length || 1;
  const removed = weights.filter((n) => n === 0).length / total;
  const emphasis = weights.reduce((a, n) => a + Math.max(0, n - 1), 0);
  const fee = (PROFILE_FEES[s.businessId || 'tea'] || 6000) * (strategy.profile === 'premium' ? 1 : strategy.profile === 'value' ? 0.3 : 0);
  return { ...p, speed: p.speed * (1 + removed * 0.08) / (1 + emphasis * 0.025), variety: 1 - removed * 0.3, monthly: Math.round(fee + emphasis * 1200), removed, emphasis };
}
export function customerFit(s, key, income = 1, strategy = strategyOf(s), fx = strategyEffects(s, strategy)) {
  return (fx.fit[key] || 1) * Math.pow(income, fx.income) * fx.variety;
}
export function strategyValid(s, x) {
  const keys = Object.keys(s.prices || {});
  return !!x && Object.hasOwn(PROFILES, x.profile) && x.weights && typeof x.weights === 'object' && !Array.isArray(x.weights)
    && Object.keys(x.weights).every((k) => keys.includes(k) && Number.isInteger(x.weights[k]) && x.weights[k] >= 0 && x.weights[k] <= 3)
    && keys.some((k) => (x.weights[k] ?? 1) > 0);
}
export function managerValid(x) {
  return !!x && Object.hasOwn(MANAGERS, x.tier) && ['profit', 'service'].includes(x.goal) && [0, 1, 2].includes(x.reserveMonths)
    && typeof x.staffing === 'boolean' && typeof x.purchasing === 'boolean'
    && (x.lastReviewT == null || Number.isInteger(x.lastReviewT) && x.lastReviewT >= 0) && typeof x.note === 'string' && x.note.length <= 1000;
}
