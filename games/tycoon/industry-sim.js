import { INDUSTRIES, INDUSTRY_EVENTS, industryId } from './industry-catalog.js';

const clamp = (n, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const known = id => typeof id === 'string' && Object.hasOwn(INDUSTRIES, id);
export function createIndustry(id) {
  if (!known(id)) throw new Error('未知業態劇本');
  const p = INDUSTRIES[id];
  return { v: 1, id, policies: Object.fromEntries(p.axes.map(a => [a.id, a.options[0].id])), resources: Object.fromEntries(p.resources.map(r => [r.id, r.initial])), work: null, situation: null, recovery: null, stats: { days: 0, volume: 0, spent: 0, investments: 0 }, milestones: [], history: [] };
}
export function enableIndustry(w) { if (!w.industry) w.industry = createIndustry(industryId(w)); return w; }
// 讀取、草稿與報表一律不補欄位、不推進工作、不產生經營效果。
export const industryState = w => w.industry || createIndustry(industryId(w));
export function industryValid(s, id) {
  if (s === undefined) return true;
  if (!known(id) || !s || s.v !== 1 || s.id !== id) return false;
  const p = INDUSTRIES[id], nn = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  if(s.situation && (s.situation.kind!=='industry'||!p.resources.some(r=>r.id===s.situation.resource)||!['title','text','protect','accept'].every(k=>typeof s.situation[k]==='string')||!nn(s.situation.cost)))return false;
  if(s.recovery && (!Number.isInteger(s.recovery.remaining)||s.recovery.remaining<1||s.recovery.remaining>7||!p.resources.some(r=>r.id===s.recovery.resource)))return false;
  return !!(s.policies && Object.keys(s.policies).length === p.axes.length && p.axes.every(a => typeof s.policies[a.id] === 'string' && a.options.some(o => o.id === s.policies[a.id])) && s.resources && Object.keys(s.resources).length === p.resources.length && p.resources.every(r => nn(s.resources[r.id]) && s.resources[r.id] <= 1) && s.stats && ['days', 'volume', 'spent', 'investments'].every(k => nn(s.stats[k])) && Number.isInteger(s.stats.days) && s.stats.days <= 1096 && Number.isInteger(s.stats.investments) && s.stats.investments <= 1096 && (!s.work || Number.isInteger(s.work.elapsed) && s.work.elapsed >= 0 && s.work.elapsed < p.investment.days && nn(s.work.cost)) && Array.isArray(s.milestones) && s.milestones.length <= 3 && new Set(s.milestones).size === s.milestones.length && s.milestones.every(n => [0, 1, 2].includes(n)) && Array.isArray(s.history) && s.history.length <= 60 && s.history.every(h => h && Number.isInteger(h.day) && h.day >= 0 && h.day <= 1096 && nn(h.volume) && nn(h.revenue) && (h.profit === null || typeof h.profit === 'number' && Number.isFinite(h.profit)) && p.resources.every(r => nn(h[r.id]) && h[r.id] <= 1)));
}
export function industryAction(w, data, context) {
  if (!known(industryId(w)) || !context.playing) return { ok: false, error: '結案或存檔問題處理完成後才能調整。' };
  const id = industryId(w), p = INDUSTRIES[id], current = industryState(w);
  if (data.kind === 'policy') {
    const a = p.axes.find(a => a.id === data.axis), o = a?.options.find(o => o.id === data.value);
    if (!o) return { ok: false, error: '這項決策不屬於此業態。' };
    enableIndustry(w); w.industry.policies[a.id] = o.id;
    context.note(`${p.name}：${a.name}改採「${o.name}」。${o.detail} 既有合約保持。`);
  } else if (data.kind === 'invest') {
    const cost = industryInvestmentCost(w);
    if (current.work) return { ok: false, error: '專屬改善仍在執行；不能重複支付。' };
    if (current.resources[p.investment.resource] >= .98) return { ok: false, error: '這項能力已接近上限，先觀察實際營運再投入。' };
    if (context.cash < cost) return { ok: false, error: `現金不足，需支付 $${cost.toLocaleString()}。` };
    enableIndustry(w); context.pay(cost); w.industry.stats.spent += cost; w.industry.work = { elapsed: 0, cost };
    context.note(`${p.investment.name}開始，支付 $${cost.toLocaleString()}，需 ${p.investment.days} 個營運日。${p.investment.text}`);
  } else if (data.kind === 'event') {
    const event=current.situation;
    if(!event || !['protect','buffer','accept'].includes(data.choice))return {ok:false,error:'沒有這個業態情境或選項。'};
    if(data.choice!=='accept' && context.cash<event.cost)return {ok:false,error:'現金不足支付改善費；仍可選擇保留現金並承擔後果。'};
    if(data.choice==='accept'){w.industry.resources[event.resource]=clamp(w.industry.resources[event.resource]-.15);context.note(event.accept+'，該能力下降 15 點，影響後續實際營運。');}
    else {context.pay(event.cost);w.industry.stats.spent+=event.cost;w.industry.recovery={remaining:7,resource:event.resource};context.note(event.protect+`，支付 $${event.cost.toLocaleString()}；七個營運日內能力保留 8%，完成後修復 18 點。`);}
    w.industry.situation=null;
  } else return { ok: false, error: '未知業態決策。' };
  return { ok: true };
}
export const industryInvestmentCost = w => Math.round(INDUSTRIES[industryId(w)].investment.cost * (1 + industryState(w).stats.investments * .15));
const neutral = () => ({ demand: 1, capacity: 1, cost: 1, defects: 0, conversion: 1, churn: 1, organic: 1, trades: 1, visits: 1, userCost: 0, monthly: 0, risk: 0, inspection: 0, bid: 0 });
export function industryEffects(w, day = w.day || 0) {
  const e = neutral();
  if (!w.industry) return e;
  const { id, policies: a, resources: r, work } = w.industry;
  switch (id) {
    case 'tea': e.demand = .82 + r.novelty * .22 + r.consistency * .18; e.capacity = a.menu === 'seasonal' ? .88 : 1.08; e.cost = a.menu === 'seasonal' ? 1.08 : .97; if (a.training === 'standard') { e.monthly = 6000; e.capacity *= .95; } e.risk = r.pressure * (1 - r.consistency) * .1; break;
    case 'cafe': e.demand = .8 + r.regulars * .35 + r.experience * .18; e.capacity = a.format === 'commuter' ? 1.12 : .82; e.capacity *= a.space === 'work' ? .85 : 1.08; e.cost = a.format === 'neighborhood' ? 1.06 : 1; e.risk = r.pressure * (1 - r.experience) * .08; break;
    case 'bento': e.demand = .85 + r.contracts * .25 + r.forecast * .18; e.capacity = a.batch === 'single' ? 1.1 : .9; e.monthly = a.batch === 'staged' ? 8000 : 0; e.cost = (a.customer === 'office' ? 1.05 : 1) * (1 + r.waste * .08); e.risk = r.waste * .03; break;
    case 'bakery': e.demand = .8 + r.craft * .24 + r.preorders * .3; e.capacity = a.range === 'staple' ? 1.1 : .8; e.cost = a.range === 'staple' ? .95 : 1.12; if (a.sale === 'preorder') { e.monthly = 5000; e.capacity *= .95; } e.risk = r.waste * .025; break;
    case 'convenience': e.demand = .85 + r.traffic * .35 + r.availability * .18 + (a.mix === 'fresh' ? .08 : 0); e.capacity = a.service === 'pickup' ? .85 : 1; e.monthly = a.service === 'pickup' ? 7000 : 0; e.cost = (a.mix === 'fresh' ? 1.06 : 1) * (1 + (1 - r.freshness) * .05); break;
    case 'salon': e.demand = .75 + r.loyalty * .4 + r.skill * .2; e.capacity = a.skill === 'quick' ? 1.18 : .78; e.cost = a.skill === 'specialist' ? 1.15 : 1; e.monthly = a.booking === 'deposit' ? 4000 : 0; e.risk = (1 - r.punctual) * .035; break;
    case 'restaurant': e.demand = (.8 + r.experience * .3 + r.coordination * .15) * (1 - r.noshow * .18) * (a.booking === 'confirmed' ? .95 : 1); e.capacity = (a.menu === 'focused' ? 1.15 : .75) * (.85 + r.coordination * .2); e.cost = a.menu === 'focused' ? .94 : 1.15; e.monthly = a.booking === 'confirmed' ? 10000 : 0; e.risk = (1 - r.coordination) * .05; break;
    case 'supermarket': e.demand = .82 + r.loyalty * .3 + r.availability * .2; e.capacity = a.supply === 'bulk' ? 1.05 : 1; e.cost = (a.mix === 'fresh' ? 1.08 : .96) * (a.supply === 'bulk' ? .94 : 1.04) * (1 + (1 - r.coldchain) * .09); e.monthly = a.supply === 'frequent' ? 18000 : 0; break;
    case 'fitness': e.demand = (.8 + r.outcomes * .2 + r.loyalty * .3) * (a.access === 'booked' ? .95 : 1); e.capacity = a.offer === 'open' ? 1.12 : .75; e.monthly = (a.offer === 'coaching' ? 30000 : 0) + (a.access === 'booked' ? 6000 : 0); e.risk = r.congestion * (1 - r.loyalty) * .05; break;
    case 'packaging': e.capacity = (a.spec === 'standard' ? 1.1 + r.repeat * .1 : .9) * (a.changeover === 'fast' ? 1.08 : .9); e.cost = (a.spec === 'standard' ? .96 : 1.08) * (1 + r.waste * .05); e.defects = (1 - r.setup) * .035 + r.waste * .02; e.monthly = a.changeover === 'verified' ? 10000 : 0; e.bid = a.spec === 'standard' ? -.04 : .04; break;
    case 'apparel': e.capacity = (a.collection === 'uniform' ? 1.08 : .85) * (a.sample === 'skip' ? 1.08 : .9) * (.8 + r.skill * .3); e.cost = a.collection === 'uniform' ? .96 : 1.1; e.defects = (1 - r.sizing) * .04 + r.season * .018; e.monthly = a.sample === 'approved' ? 12000 : 0; e.bid = a.collection === 'fashion' ? .04 : 0; break;
    case 'electronics': e.capacity = a.test === 'burnin' ? .8 : 1; e.cost = a.source === 'spot' ? .92 : 1.06; e.defects = (1 - r.coverage) * .035 + (1 - r.traceability) * .018 + r.escape * .015; e.monthly = (a.test === 'burnin' ? 22000 : 0) + (a.source === 'traceable' ? 8000 : 0); break;
    case 'saas': e.conversion = (.65 + r.activation * .6) * (a.scope === 'custom' ? 1.1 : .96); e.churn = 1.3 - r.success * .5; e.userCost = (a.onboarding === 'guided' ? 3 : 0) + (a.scope === 'custom' ? 4 : 0) + (1 - r.productization) * 3; e.monthly = a.onboarding === 'guided' ? 18000 : 0; break;
    case 'marketplace': e.trades = Math.max(.1, 1 - Math.abs(r.supply - .5) * 1.8) * (.6 + r.trust * .55) * (.8 + r.match * .3); e.churn = 1.3 - r.trust * .4; e.monthly = (a.side === 'sellers' ? 22000 : 0) + (a.trust === 'verified' ? 15000 : 0); e.userCost = (a.side === 'sellers' ? .5 : 0) + (a.trust === 'verified' ? .5 : 0); break;
    case 'content': e.organic = (.55 + r.library * 1.5) * (.6 + r.authority * .6) * (1-r.dependence*.2) * (a.editorial === 'trend' ? 1.15 : 1); e.visits = (.7 + r.authority * .45) * (a.review === 'volume' ? 1.1 : .92); e.churn = 1.3 - r.authority * .5; e.monthly = (a.editorial === 'evergreen' ? 18000 : 0) + (a.review === 'checked' ? 9000 : 0); break;
    case 'hotel': { const weekend = [0, 6].includes(new Date(Date.UTC(2026, 9, 1 + day)).getUTCDay()); e.demand = (.85 + r.repeat * .3) * (a.segment === 'leisure' ? weekend ? 1.35 : .85 : weekend ? .9 : 1.08) * (a.booking === 'safe' ? .96 : 1.1); e.capacity = .7 + r.rooms * .35; e.risk = a.booking === 'overbook' ? (1 - r.booking) * .12 : (1 - r.booking) * .015; break; }
    case 'ecommerce': e.demand = (.8 + r.repeat * .4 + r.supply * .15) * (a.assortment === 'wide' ? 1.12 : 1) * (a.retention === 'ads' ? 1.08 : .95); e.cost = a.assortment === 'wide' ? 1.1 : .96; e.capacity = .85 + r.supply * .2; e.defects = r.returns * .035 + (a.assortment === 'wide' ? .025 : 0); e.monthly = a.retention === 'crm' ? 12000 : 0; break;
    case 'equipment': e.capacity = (a.design === 'platform' ? 1.08 : .82) * (a.acceptance === 'fat' ? .85 : 1); e.cost = a.design === 'platform' ? .95 : 1.12; e.defects = (1 - r.acceptance) * .05 + (1 - r.design) * .02; e.inspection = Math.ceil((1 - r.acceptance) * 5); e.monthly = a.acceptance === 'fat' ? 45000 : 0; e.risk = r.warranty * .025; break;
    case 'ai': e.capacity = (a.data === 'quick' ? 1.08 : .82) * (a.model === 'large' ? 1.05 : .9) * (.8 + r.data * .25); e.cost = (a.model === 'large' ? 1.25 : .88) * (1 + r.drift * .18); e.inspection = Math.ceil((1 - r.data) * 3 + (1 - r.evaluation) * 4); e.monthly = (a.data === 'audit' ? 22000 : 0) + (a.model === 'evaluated' ? 18000 : 0); e.risk = r.drift * .02; break;
    case 'agency': e.capacity = (a.scope === 'signed' ? .9 : 1) * (a.portfolio === 'anchor' ? 1.08 : .92) * (1 - r.revisions * .25); e.monthly = (a.scope === 'signed' ? 9000 : 0) + (a.portfolio === 'diverse' ? 12000 : 0); e.bid = (a.scope === 'flexible' ? .05 : 0) - r.concentration * .06; e.inspection = Math.ceil((1 - r.brief) * 3); break;
    case 'security': e.capacity = (a.coverage === 'oncall' ? .85 : 1) * (a.alerts === 'triage' ? .92 : 1) * (1 - r.noise * .25); e.monthly = (a.coverage === 'oncall' ? 48000 : 0) + (a.alerts === 'triage' ? 16000 : 0); e.inspection = Math.ceil((1 - r.evidence) * 4); e.risk = (1 - r.coverage) * .08 + r.noise * .04; break;
  }
  if(w.industry.recovery){if(INDUSTRIES[id].mode==='technology')e.monthly+=6000;else e.capacity*=.92;}
  if (work) { if (INDUSTRIES[id].mode === 'technology') e.monthly += 6000; else e.capacity *= .85; }
  e.demand = clamp(e.demand, .55, 1.45); e.capacity = clamp(e.capacity, .55, 1.2); e.cost = clamp(e.cost, .85, 1.4);
  return e;
}
export function industryDay(w, day, actual, notify = () => {}, withEvents = true) {
  if (!w.industry) return;
  const s = w.industry, a = s.policies, r = s.resources, p = INDUSTRIES[s.id];
  const volume = Math.max(0, actual.volume || 0), miss = clamp((actual.lost || 0) / Math.max(1, volume + (actual.lost || 0))), waste = clamp((actual.unsold || 0) / Math.max(1, actual.prepared || 0)), bad = clamp((actual.defects || 0) / Math.max(1, (actual.produced || volume) + (s.id==='ecommerce'?0:(actual.defects || 0)))), load = clamp(actual.utilization || 0, 0, 2), orders = Math.min(8, actual.orders || 0), service = clamp(actual.serviceLoad || 0, 0, 2);
  const served = volume > 0 ? 1 : 0, demandObserved = volume + (actual.lost || 0) > 0;
  const add = (key, n) => { r[key] = clamp(r[key] + n); }, follow = (key, target, rate = .15) => { r[key] = clamp(r[key] * (1 - rate) + clamp(target) * rate); };
  switch (s.id) {
    case 'tea': add('novelty', a.menu === 'seasonal' ? .003 : -.003); add('consistency', (a.training === 'standard' ? .006 : .0005) - miss * .01 - Math.max(0, (actual.shops || 1) - 1) * .0007); follow('pressure', miss); break;
    case 'cafe': add('regulars', (a.format === 'neighborhood' ? .0035 * served : -.0008) + (a.space === 'work' ? .001 * served : -.0005) - miss * .008); add('experience', (a.format === 'neighborhood' ? .002 : -.001) - miss * .006); follow('pressure', miss * (a.space === 'work' ? 1.3 : 1)); break;
    case 'bento': add('contracts', (a.customer === 'office' ? .004 * served : -.001) - miss * .01); add('forecast', (a.batch === 'staged' ? .004 : .001) - (waste + miss) * .01); follow('waste', waste + miss * .4); break;
    case 'bakery': add('craft', a.range === 'artisan' ? .003 : -.001); add('preorders', (a.sale === 'preorder' ? .0035 * served : -.001) - miss * .009); follow('waste', waste); break;
    case 'convenience': add('traffic', (a.service === 'pickup' ? .004 * served : -.0015) - miss * .008); if (demandObserved) follow('availability', 1 - miss, .08); add('freshness', (a.mix === 'pantry' ? .002 : .0005) - miss * .006 - Math.max(0, load - .85) * .003); break;
    case 'salon': add('loyalty', .003 * r.skill * r.punctual * served - miss * .008); add('skill', a.skill === 'specialist' ? .003 : -.001); add('punctual', (a.booking === 'deposit' ? .004 : -.001) - miss * .008); break;
    case 'restaurant': add('experience', (a.menu === 'chef' ? .003 : -.001) - miss * .009); add('noshow', a.booking === 'confirmed' ? -.004 : .0015); add('coordination', (a.menu === 'focused' ? .002 : -.0008) - miss * .006); break;
    case 'supermarket': if (demandObserved) follow('availability', 1 - miss, .08); add('coldchain', (a.supply === 'frequent' ? .004 : -.001) - (a.mix === 'fresh' ? .0015 : 0) - miss * .003); add('loyalty', (.0025 * r.coldchain * r.availability + (a.mix === 'fresh' ? .001 : 0)) * served - miss * .006); break;
    case 'fitness': add('outcomes', a.offer === 'coaching' ? .003 : -.0008); add('loyalty', .003 * r.outcomes * served - r.congestion * .002 - miss * .006); follow('congestion', miss + (a.access === 'unlimited' ? .2 : .02)); break;
    case 'packaging': add('setup', (a.changeover === 'verified' ? .006 : -.002) - (a.spec === 'custom' ? orders * .0007 : 0)); follow('waste', bad * 2 + (1 - r.setup) * .15); add('repeat', a.spec === 'standard' ? .004 * (actual.revenue > 0 ? 1 : 0) : -.003); break;
    case 'apparel': add('skill', (volume ? .003 : -.0005) - (a.collection === 'fashion' ? .0018 : 0)); add('sizing', (a.sample === 'approved' ? .006 : -.002) - bad * .008); follow('season', (a.collection === 'fashion' ? .35 + .2 * Math.sin(day / 45) : .1) + orders * .03); break;
    case 'electronics': add('coverage', (a.test === 'burnin' ? .006 : -.002) - load * .0008); add('traceability', a.source === 'traceable' ? .004 : -.0025); follow('escape', bad * 2 + (1 - r.coverage) * .15 + (1 - r.traceability) * .1); break;
    case 'saas': add('activation', (a.onboarding === 'guided' ? .004 : -.001) - Math.max(0, load - 1) * .004); add('productization', a.scope === 'product' ? .003 : -.003); add('success', .003 * r.activation * r.productization - clamp((actual.churn || 0) / Math.max(1, actual.users || 0)) * .4); break;
    case 'marketplace': add('supply', (a.side === 'sellers' ? .004 : -.0025) - Math.min(.003, (actual.acquired || 0) / Math.max(1, actual.users || 0) * .02)); add('trust', (a.trust === 'verified' ? .004 : -.0015) - Math.max(0, load - 1) * .004); follow('match', (1 - Math.abs(r.supply - .5) * 1.8) * r.trust, .08); break;
    case 'content': add('library', a.editorial === 'evergreen' ? .003 : -.002); add('authority', (a.review === 'checked' ? .004 : -.002) - Math.max(0, (actual.price || 2) - 2) * .0007); follow('dependence', actual.paidFraction || 0, .08); break;
    case 'hotel': add('repeat', (a.segment === 'business' ? .003 : .0005) * served - miss * .006); add('rooms', -.0005 - load * .001); add('booking', a.booking === 'safe' ? .0035 : -.003); break;
    case 'ecommerce': add('repeat', (a.retention === 'crm' ? .0035 * served : -.001) - bad * .01); add('supply', (a.assortment === 'hero' ? .0025 : -.002) - miss * .006); if (volume > 0) follow('returns', bad); break;
    case 'equipment': add('design', (a.design === 'platform' ? .003 : -.002) - orders * .0005); add('acceptance', (a.acceptance === 'fat' ? .004 : -.0015) - bad * .004); follow('warranty', service * (1 - r.acceptance), .08); break;
    case 'ai': add('data', (a.data === 'audit' ? .004 : -.002) - orders * .0005); add('evaluation', a.model === 'evaluated' ? .004 : -.0015); follow('drift', .12 + service * (1 - r.evaluation) * .5, .04); break;
    case 'agency': add('brief', a.scope === 'signed' ? .004 : -.002); follow('revisions', (1 - r.brief) * .5 + orders * .035, .08); add('concentration', a.portfolio === 'anchor' ? .0025 : -.004); break;
    case 'security': add('coverage', (a.coverage === 'oncall' ? .004 : -.002) - service * .0015); add('noise', a.alerts === 'triage' ? -.004 : .0015 + service * .001); add('evidence', (a.alerts === 'triage' ? .003 : -.001) - (1 - r.coverage) * .002); break;
  }
  if (s.work && ++s.work.elapsed >= p.investment.days) { add(p.investment.resource, p.investment.gain); s.work = null; s.stats.investments++; notify(`${p.investment.name}完成；${p.resources.find(r => r.id === p.investment.resource).name}改善。`); }
  if(s.recovery && --s.recovery.remaining===0){add(s.recovery.resource,.18);s.recovery=null;notify('情境改善完成，專屬能力修復 18 點。');}
  s.stats.days++; s.stats.volume += volume;
  const done = [s.stats.days >= 7 && s.stats.volume > 0, r[p.target[0]] >= p.target[1] && s.stats.days >= 7 && s.stats.volume > 0, s.stats.volume >= p.target[2] && s.stats.investments > 0];
  done.forEach((yes, i) => { if (yes && !s.milestones.includes(i)) { s.milestones.push(i); notify(`${p.name}經營里程碑：${['完成一週營運驗證', '掌握專屬關鍵能力', '完成實際經營規模'][i]}。沒有額外現金獎勵。`); } });
  s.history.push({ day, volume, revenue: Math.max(0, actual.revenue || 0), profit: Number.isFinite(actual.profit) ? actual.profit : null, ...r }); s.history = s.history.slice(-60);
  if(withEvents && s.stats.days%30===0 && !s.situation){
    const [title,text,resource,protect,accept]=INDUSTRY_EVENTS[s.id];
    s.situation={kind:'industry',title,text,resource,protect,accept,cost:Math.round(p.investment.cost*.3*(1+s.stats.days/30*.03))};
    return {...s.situation};
  }
  return null;
}
