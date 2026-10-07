// 階段目標來自營運紀錄，不發放收入或限制經營選項。
const step = (id, title, detail, value, target, unit) => ({ id, title, detail, value: Math.max(0, value), target, unit, progress: Math.max(0, Math.min(1, value / target)), complete: value >= target });
export function ventureJourney(w, metrics = {}) {
  const profitable = w.co.history.filter(r => r.revenue > 0 && r.net > 0).length;
  let steps;
  if (w.mode === 'manufacturing') {
    steps = [
      step('contract', '接下第一張單', '比較交期、訂金與報價，再承諾交貨。', w.orders.length + w.stats.delivered + w.stats.late, 1, '張'),
      step('delivery', '完成第一次履約', '完成生產與驗收，交貨才認列營收。', w.stats.delivered, 1, '張'),
      step('repeat', '建立履約節奏', '累積五張交貨；也要查看逾期與驗收支出。', w.stats.delivered, 5, '張'),
      step('profit', '做出獲利月結', '含薪資、折舊、利息與稅的已結月淨利為正。', profitable, 1, '個月'),
    ];
  } else {
    const target = { saas: 100, marketplace: 1500, content: 5000 }[w.modelId];
    steps = [
      step('release', '完成第一次迭代', '選擇專案與發布方式，等待工程團隊完成。', w.stats.projectsCompleted ?? w.capabilities?.length ?? 0, 1, '次'),
      step('customers', w.modelId === 'saas' ? '找到付費客群' : w.modelId === 'marketplace' ? '形成交易密度' : '建立回訪流量', w.modelId === 'saas' ? '累積一百位付費客戶，再檢查轉換與流失。' : w.modelId === 'marketplace' ? '達到一千五百位活躍者；仍須看實際成交。' : '達到五千位活躍者；廣告收入與體驗一起看。', w.modelId === 'saas' ? w.paying : w.users, target, '人'),
      step('service', '接住成長', '完成十四個營運日；近十四日可用率至少 98%。', w.co.daily.length >= 14 && w.co.daily.slice(-14).every(d => d.uptime >= .98) && (metrics.supportLoad ?? 0) <= 1 ? 1 : 0, 1, '達標'),
      step('profit', '做出獲利月結', '含獲客、團隊、雲端與稅的已結月淨利為正。', profitable, 1, '個月'),
    ];
  }
  const current = steps.findIndex(s => !s.complete);
  return { steps, current, completed: steps.filter(s => s.complete).length };
}
