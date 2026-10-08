// 有限客群下的廣告觸及，以及售價超出可感知價值時的成交反應；皆為只讀估算。
export const advertisingReach = (budget, unitCost, limit) => budget / (unitCost + budget / limit);
export const priceAcceptance = (price, reference, valuePrice) => (reference / price) ** .6 * Math.exp(-2.5 * Math.max(0, price / valuePrice - 1) ** 1.3);
