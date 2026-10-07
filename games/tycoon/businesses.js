// 新業態的金額、需求與產能都是遊戲設計假設，並非業界統計或創業報價。
import { P, unwrap } from './params.js';
const V = unwrap(P);
const item = (ref, cost, pop) => ({ ref, cost, pop });
const common = { renovationDays: V.startup.renovationDays, staff: V.capacity.defaultStaff, wageMult: 1, solo: V.capacity.soloCups, worker: V.capacity.workerCups, utility: V.fixedCost.utilityBase, utilityUnit: V.fixedCost.utilityPerCup, packaging: V.menu.packagingPerCup, waste: V.menu.wasteRate, delivery: true, warehouse: true, factory: true, rate: 1, delRate: 1, priceStep: V.menu.priceStep, priceMin: V.menu.priceMinOffset, priceMax: V.menu.priceMaxOffset, affinity: { 住宅: 1, 辦公: 1, 學校: 1, 捷運: 1, 商圈: 1 }, hours: null };
export const BUSINESSES = {
  tea: { ...common, name: '手搖飲店', unit: '杯', color: '#1f9d5c', renovation: V.startup.renovation, equipment: V.startup.equipment, firstStock: V.startup.firstStock, items: V.items, model: '現點現做', customer: '學生、通勤與住宅客群；夏季需求較高。', tradeoff: '原料等級、售價、尖峰排班和外送抽成，會一起影響毛利與口碑。', defaults: {} },
  cafe: { ...common, name: '咖啡店', unit: '份', color: '#a06b43', renovation: 800000, equipment: 350000, firstStock: 70000, solo: 12, worker: 22, utility: 12000, packaging: 4, rate: 0.7, delRate: 0.45, model: '座位周轉', customer: '辦公與商圈客群；平日下午與週末聚會。', tradeoff: '內用提高體驗，但座位周轉會限制成交。外帶模式能疏通尖峰，體驗分數較低。', affinity: { 住宅: 0.8, 辦公: 1.5, 學校: 0.6, 捷運: 1.2, 商圈: 1.4 }, defaults: { mode: 'balanced' }, items: { 美式咖啡: item(90, 20, 40), 拿鐵: item(130, 38, 45), 咖啡甜點組: item(200, 75, 15) } },
  bento: { ...common, name: '便當店', unit: '份', color: '#cf7835', renovation: 500000, equipment: 300000, firstStock: 70000, solo: 20, worker: 50, utility: 16000, packaging: 6, waste: 0, rate: 1.2, delRate: 1.4, priceMin: -20, priceMax: 40, model: '每日備餐', customer: '辦公與住宅客群；午餐和晚餐集中下單。', tradeoff: '備少會售罄，備多的生鮮成本在當天報廢。晚間折扣能清庫存，也會犧牲毛利。', affinity: { 住宅: 1.2, 辦公: 1.8, 學校: 0.9, 捷運: 0.6, 商圈: 0.7 }, hours: [3, 16, 24, 10, 2, 2, 4, 14, 18, 5, 1, 1], defaults: { prep: 160, markdown: 0 }, items: { 雞腿便當: item(120, 50, 45), 排骨便當: item(110, 45, 35), 蔬食便當: item(100, 38, 20) } },
  bakery: { ...common, name: '烘焙店', unit: '份', color: '#c39748', renovation: 650000, equipment: 450000, firstStock: 90000, solo: 20, worker: 45, utility: 20000, packaging: 3, waste: 0, rate: 0.9, delRate: 0.2, model: '每日烘焙', customer: '住宅與通勤客群；傍晚購買麵包和隔日早餐。', tradeoff: '每天先烤一批，售罄後不能補烤。晚間折扣與生產量決定報廢，烤箱水電是固定負擔。', affinity: { 住宅: 1.5, 辦公: 0.8, 學校: 0.9, 捷運: 1.4, 商圈: 1 }, hours: [5, 6, 7, 6, 6, 8, 12, 17, 16, 9, 5, 3], defaults: { prep: 180, markdown: 20 }, items: { 麵包組: item(80, 28, 55), 吐司: item(100, 35, 30), 小蛋糕: item(150, 60, 15) } },
  convenience: { ...common, name: '便利商店', unit: '筆', color: '#287bc1', renovation: 700000, equipment: 450000, firstStock: 300000, solo: 35, worker: 65, utility: 28000, utilityUnit: 1, packaging: 1, waste: 0.01, delivery: false, warehouse: false, factory: false, rate: 2.2, delRate: 0, priceMin: -5, priceMax: 15, model: '庫存周轉', customer: '住宅、辦公與捷運客群；購買頻繁，單筆毛利較薄。', tradeoff: '貨款先付。每日按目標庫存補貨，現金不足會缺貨；囤貨能減少缺貨，也會占住擴店資金。遊戲營業時間為 10–22 點。', affinity: { 住宅: 1.3, 辦公: 1.1, 學校: 1.2, 捷運: 1.5, 商圈: 0.9 }, defaults: { stockTarget: 100000, autoStock: true }, items: { 即食餐組: item(100, 68, 40), 飲料零食組: item(70, 48, 40), 日用品: item(130, 91, 20) } },
  salon: { ...common, name: '髮廊', unit: '人次', color: '#9064b5', renovation: 550000, equipment: 250000, firstStock: 30000, staff: [1, 1, 1], wageMult: 1.5, utility: 10000, utilityUnit: 3, packaging: 0, waste: 0.02, delivery: false, warehouse: false, factory: false, rate: 0.11, delRate: 0, priceStep: 50, priceMin: -100, priceMax: 200, model: '技術與工時', customer: '住宅與商圈客群；需求頻率低，良好服務能累積熟客。', tradeoff: '技術人員時薪較高，每位客人占用工作站。快剪提高周轉但降低體驗；精緻服務相反。熟客的記憶維持較久。', affinity: { 住宅: 1.6, 辦公: 0.6, 學校: 0.6, 捷運: 0.7, 商圈: 1.3 }, hours: [5, 7, 7, 7, 8, 9, 12, 13, 12, 9, 7, 4], defaults: { service: 'standard' }, items: { 洗剪: item(500, 45, 65), 染護: item(1500, 240, 25), 燙髮: item(2500, 400, 10) } },
};
export const businessOf = (id = 'tea') => BUSINESSES[id] || BUSINESSES.tea;
export const freshBusiness = (id) => id === 'bento' || id === 'bakery';
export function priceBounds(id, key) { const b = businessOf(id); return { min: b.items[key].ref + b.priceMin, max: b.items[key].ref + b.priceMax, step: b.priceStep }; }
export function initialOperations(id, ping) { return { ...businessOf(id).defaults, seats: Math.max(4, Math.floor(ping * 0.8)), stations: Math.max(1, Math.floor(ping / 5)) }; }
export function experience(s) { return s.businessId === 'cafe' ? { takeaway: -3, balanced: 0, dinein: 4 }[s.operations.mode] : s.businessId === 'salon' ? { quick: -6, standard: 0, premium: 6 }[s.operations.service] : 0; }
export function hourlyCapacity(s, n, speed) {
  const b = businessOf(s.businessId), op = s.operations;
  if (s.businessId === 'salon') {
    const minutes = { quick: 35, standard: 55, premium: 80 }[op.service];
    return Math.max(1, Math.floor(Math.min(n, op.stations) * 60 / minutes * speed));
  }
  const production = Math.floor((n === 1 ? b.solo : (n - 1) * b.worker) * speed + 1e-6);
  if (s.businessId !== 'cafe') return production;
  const dineShare = { takeaway: 0.15, balanced: 0.55, dinein: 0.85 }[op.mode];
  return Math.min(production, Math.floor(op.seats * 60 / 50 / dineShare));
}
