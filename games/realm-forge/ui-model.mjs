import { BUILDINGS } from './core.mjs?v=20261009h';
import { CIVILIZATION, TECHNOLOGIES } from './civilization.mjs?v=20261009h';

export const RESOURCE_NAMES = { wood:'木材', food:'食物', gold:'黃金', stone:'石材' };
export function resourceShortage(stocks, cost) {
  return Object.entries(cost || {}).filter(([r,n])=>n > (stocks[r] || 0)).map(([r,n])=>`${RESOURCE_NAMES[r]}還差 ${Math.ceil(n-(stocks[r]||0))}`).join('、');
}
export function buildReason(world, type) {
  const spec = BUILDINGS[type];
  if ((spec.age || 0) > world.age(0)) return `需要${CIVILIZATION.ages[spec.age]}`;
  if (!world.buildRequirements(0,type)) return `先完成${BUILDINGS[spec.requires].name}`;
  return resourceShortage(world.stocks[0],spec.cost);
}
export function actionReason(world, action, selected) {
  const [kind,id] = action.id.split(':');
  if (kind === 'build') return buildReason(world,id);
  if (kind === 'train') {
    const bp = world.effectiveBlueprint(id,0), buildings = selected.filter(b=>b.kind==='building'&&b.progress===1&&world.availableUnits(0,b.type).some(u=>u.id===id));
    if (bp.hero && (world.units.some(u=>u.team===0&&u.blueprint.id===id)||world.buildings.some(b=>b.team===0&&b.queue.some(q=>q.unitId===id)))) return '這位英雄已在戰場或訓練中';
    if (!buildings.some(b=>b.queue.length<30)) return '訓練佇列已滿';
    return resourceShortage(world.stocks[0],{food:bp.food,gold:bp.gold,wood:bp.wood||0});
  }
  if (kind === 'research') {
    const tech = TECHNOLOGIES.find(t=>t.id===id);
    if (!selected.some(b=>b.kind==='building'&&b.type===tech.building&&b.progress===1&&!b.research)) return '這棟建築正在研發其他科技';
    if (!world.ageRequirements(0,id)) return '先完成兩種當前時代建築；帝王時代也可使用城堡';
    return resourceShortage(world.stocks[0],tech.cost);
  }
  if (action.id==='ungarrison' && !selected.some(b=>b.garrisoned?.length)) return '建築內沒有駐軍';
  if (action.id==='dropoff') {
    const carrying=selected.filter(u=>u.blueprint?.role==='worker'&&u.carried>0);
    if(!carrying.length)return '村民目前沒有攜帶資源';
    if(!carrying.some(u=>world.buildings.some(b=>b.team===0&&b.hp>0&&b.progress===1&&BUILDINGS[b.type].dropoff?.includes(u.carrying))))return '先完成能收取這種資源的建築';
  }
  if(action.id==='shelter'&&!world.shelterBuildings(0).length)return '沒有已完成且有空位的庇護建築';
  if(action.id==='repair'&&!world.buildings.some(b=>b.team===0&&b.hp>0&&b.progress===1&&b.hp<b.maxHp))return '目前沒有受損的我方建築';
  return '';
}
export function placementFeedback(world, type, point) {
  const reason = buildReason(world,type);
  if (reason) return { valid:false, reason };
  if (!point) return { valid:true, reason:'移到空地，左鍵放置' };
  if (!world.canPlaceBuilding(type,point.x,point.y)) return { valid:false, reason:'占地被擋住，請移到空地' };
  return { valid:true, reason:'左鍵放置 · Shift 連續建造' };
}
export function productionStatus(world, building, item, research=false) {
  const percent = Math.max(0,Math.min(100,Math.round((1-item.left/item.time)*100)));
  if (!research && building.research) return {percent,blocked:true,label:'等待研發完成'};
  if (!research && world.population(building.team)>=world.capacity(building.team)) return {percent,blocked:true,label:world.capacity(building.team)>=world.project.rules.population?'已達人口上限':'人口不足 · 先蓋住宅'};
  if (!research && item.left<=0) return {percent,blocked:true,label:'出口被擋住'};
  return {percent,blocked:false,label:`${percent}% · 剩 ${Math.ceil(item.left)} 秒`};
}
export function selectionGroups(entities) {
  const groups = new Map();
  for (const e of entities) {
    const key = `${e.team}:${e.kind}:${e.kind==='building'?e.type:e.blueprint.id}`;
    if (!groups.has(key)) groups.set(key,{key,name:e.kind==='building'?BUILDINGS[e.type].name:e.blueprint.name,ids:[]});
    groups.get(key).ids.push(e.id);
  }
  return [...groups.values()];
}
export const COMMAND_DESCRIPTIONS = {
  'build-menu':'開啟經濟建築；按 Q 再按 Q 建住宅。', 'military-menu':'開啟軍事建築；先蓋兵營，再建馬廄或射箭場。',
  stop:'停止目前工作並清除排程。', patrol:'左鍵指定巡邏終點，沿途迎擊敵人。', guard:'左鍵選擇要保護的我方單位。', follow:'左鍵選擇跟隨的單位。',
  'attack-move':'左鍵指定目的地，沿途自動迎擊。', garrison:'左鍵選擇可進駐的我方建築。', repair:'左鍵選擇受損的我方建築；修理會消耗資源。',
  dropoff:'將攜帶的資源送回最近的收集建築。', shelter:'尋找附近的我方建築避難。', 'auto-scout':'自動探索未知區域。', convert:'左鍵選擇敵方單位進行招降。',
  heal:'左鍵選擇受傷的我方單位。', rally:'左鍵點地面或資源；新訓練的單位會前往這裡。', 'attack-ground':'左鍵指定砲擊位置；範圍攻擊也會傷到友軍。',
  pack:'打包後可移動，展開後可攻擊。', ungarrison:'派出目前選取建築內的駐軍。', 'town-bell':'召回村民避難；再次按下恢復工作。'
};
export function actionDescription(world, action) {
  const [kind,id] = action.id.split(':');
  if (kind==='build') { const b=BUILDINGS[id]; return `${b.footprint.join(' × ')} 格 · 建造 ${b.time} 秒${b.pop?` · 提供 ${b.pop} 人口`:''}。Shift 可連續放置。`; }
  if (kind==='train') return `訓練 ${world.effectiveBlueprint(id,0).time} 秒。Shift＋點擊或快捷鍵，一次排入 5 名。`;
  if (kind==='research') { const t=TECHNOLOGIES.find(t=>t.id===id); return `${t.description || t.name} · 研發 ${t.time} 秒。`; }
  if (kind==='formation') return '調整隊形；部隊移動時依隊形排列。';
  if (kind==='stance') return '設定部隊自動迎敵與追擊的方式。';
  if (kind==='trade') return '交易每次 100 資源；Shift 一次交易 5 次。';
  return COMMAND_DESCRIPTIONS[action.id] || '';
}
