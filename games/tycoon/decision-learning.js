// 決策快照只保存少量指標；完整營業日才進入事後觀察。
const finite = n => typeof n === 'number' && Number.isFinite(n);
const text = (s, max = 400) => typeof s === 'string' && s.length <= max;
export function observation(rows, mode, { unit = '筆', businessId } = {}) {
  const sample = rows.slice(-7), days = sample.length;
  if (!days) return { days: 0, metrics: [] };
  const sum = key => sample.every(r => finite(r[key])) ? sample.reduce((n, r) => n + r[key], 0) : null;
  const mean = key => sum(key) == null ? null : sum(key) / days;
  const metric = (id, label, value, unit) => ({ id, label, value, unit });
  let metrics;
  if (mode === 'stores') {
    const volume = sum('cups'), lost = sum('lost');
    metrics = [metric('volume', '每日成交', mean('cups'), unit + '／天'), metric('receipts', '每日入帳（已扣平台抽成）', mean('rev'), '$／天'), metric('lost', '排隊／供給流失率', volume == null || lost == null ? null : volume + lost ? lost / (volume + lost) * 100 : 0, '%'), ...(['bento', 'bakery'].includes(businessId) || !businessId && sample.some(r=>r.prepared > 0) ? [metric('unsold', '每日剩貨報廢', mean('unsold'), unit + '／天')] : [])];
  } else if (mode === 'manufacturing') {
    const made = sum('produced'), bad = sum('defects'), attempts = made == null || bad == null ? null : made + bad;
    metrics = [metric('produced', '每日良品產出', mean('produced'), '件／天'), metric('defects', '實際瑕疵率', attempts > 0 ? bad / attempts * 100 : null, '%'), metric('utilization', '平均產能利用率', mean('utilization') == null ? null : mean('utilization') * 100, '%')];
  } else {
    metrics = [metric('acquired', '每日新使用者', mean('acquired'), '人／天'), ...(businessId === 'saas' ? [metric('converted', '每日新增付費', mean('converted'), '人／天')] : businessId === 'marketplace' ? [metric('transactions', '每日成功交易', mean('transactions'), '筆／天')] : [metric('visits', '每日瀏覽', mean('visits'), '次／天')]), metric('churned', '每日流失（所有客群）', mean('churned'), '人／天'), metric('revenue', '每日營收', mean('revenue'), '$／天'), metric('uptime', '平均服務可用率', mean('uptime') == null ? null : mean('uptime') * 100, '%')];
  }
  return { days, metrics };
}
export function decisionSnapshot(coach, cash, settings) {
  return { cash, settings, drivers: coach.drivers.filter(d => ['estimate', 'state'].includes(d.type) && finite(d.value)).map(({ id, label, value, unit }) => ({ id, label, value, unit })) };
}
export function recordDecision(records, { scope, title, day, fromDay, mode, unit, businessId, before, after, rows }) {
  const changes = after.drivers.flatMap(d => {
    const old = before.drivers.find(x => x.id === d.id);
    return old && Math.abs(old.value - d.value) > 1e-8 ? [{ id: d.id, label: d.label, unit: d.unit, before: old.value, after: d.value }] : [];
  }).slice(0, 12);
  const cashChange = after.cash - before.cash;
  if (before.settings === after.settings && Math.abs(cashChange) < .001 && !changes.length) return records || [];
  return [...(records || []), { scope, title, day, fromDay, mode, ...(unit ? { unit } : {}), ...(businessId ? { businessId } : {}), cashChange, beforeSettings: before.settings, afterSettings: after.settings, changes, baseline: observation(rows, mode, { unit, businessId }) }].slice(-30);
}
export function decisionReviews(records, scope, rows) {
  return (records || []).filter(r => r.scope === scope).slice(-3).reverse().map(r => {
    const following = rows.filter(d => Number.isInteger(d.day) && d.day >= r.fromDay).slice(0, 7);
    return { ...r, after: r.completed || observation(following, r.mode, r), overlap: (records || []).some(x => x !== r && x.scope === scope && x.day >= r.day && x.day < r.fromDay + 7) };
  });
}
export function completeDecisions(records, rowsForScope) {
  return (records || []).map(r => {
    if (r.completed) return r;
    const rows = rowsForScope(r.scope).filter(d => Number.isInteger(d.day) && d.day >= r.fromDay).slice(0, 7);
    return rows.length === 7 ? { ...r, completed: observation(rows, r.mode, r) } : r;
  });
}
export function learningValid(records) {
  const metric = m => m && text(m.id, 80) && text(m.label, 160) && text(m.unit, 64) && (m.value === null || finite(m.value));
  const sample = s => s && Number.isInteger(s.days) && s.days >= 0 && s.days <= 7 && Array.isArray(s.metrics) && s.metrics.length <= 6 && s.metrics.every(metric);
  return Array.isArray(records) && records.length <= 30 && records.every(r => r && text(r.scope, 128) && text(r.title, 160) && Number.isInteger(r.day) && r.day >= 0 && Number.isInteger(r.fromDay) && r.fromDay >= r.day && ['stores', 'manufacturing', 'technology'].includes(r.mode) && (r.unit == null || text(r.unit, 16)) && (r.businessId == null || text(r.businessId, 80)) && finite(r.cashChange) && text(r.beforeSettings, 1000) && text(r.afterSettings, 1000) && Array.isArray(r.changes) && r.changes.length <= 12 && r.changes.every(c => metric({ ...c, value: c.before }) && finite(c.before) && finite(c.after)) && sample(r.baseline) && (r.completed == null || sample(r.completed) && r.completed.days === 7));
}
