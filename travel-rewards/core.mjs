export const DEFAULT_PROFILE = Object.freeze({ marriott:'unknown', krisflyer:'unknown', hilton:'unknown', provenance:'unknown', linked:'unknown', otherChallenge:'unknown', hiltonMatched:'unknown', card:'unknown', annualSpend:'', maxFee:'' });

export function nonNegative(value) {
  if(value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function evaluateRoute(route, profile, asOf = '2026-10-24') {
  const blockers = [], pending = [];
  const check = (value, allowed, zh, en) => {
    if(value === 'unknown' || value === undefined) pending.push(['待核對：'+zh,'To check: '+en]);
    else if(!allowed.includes(value)) blockers.push([zh,en]);
  };
  if(route.deadline && asOf > route.deadline) return { state:'closed', blockers:[[ '本梯次申請已截止。','Applications for this offer have closed.' ]], pending:[] };
  const spend = nonNegative(profile.annualSpend), budget = nonNegative(profile.maxFee);
  if(route.fee && budget !== null && route.fee > budget) blockers.push(['已知卡年費超過你的預算。','The known card annual fee exceeds your budget.']);
  if(route.id === 'P002') check(profile.card,['ci'], '需持有並綁定適用華航聯名卡。','An eligible linked China Airlines cobranded card is required.');
  if(route.id === 'P003') {
    if(spend === null) pending.push(['需核對前一年合格消費是否達120萬元。','Check whether prior-year qualifying spend reaches NT$1.2 million.']);
    else if(spend < 1200000) blockers.push(['已填年消費未達120萬元。','Entered annual spend is below NT$1.2 million.']);
    pending.push(['持卡第二年起、合格消費及續卡條件另核。','Card year two onward, qualifying spend and renewal conditions still need checking.']);
  }
  if(['P004','H001','H002'].includes(route.id)) check(profile.card,route.id==='P004'?['amex-plat','amex-eva-plat']:['amex-mr','amex-plat'],route.id==='P004'?'需適用運通簽帳白金卡；可另外評估申卡。':'需可轉點的台灣Amex MR；長榮聯名哩程不同。',route.id==='P004'?'An eligible Amex Platinum charge card is needed; applying is a separate option.':'Eligible Taiwan Amex MR points are needed; EVA cobranded miles are a different asset.');
  if(['P005','P012'].includes(route.id)) {
    check(profile.marriott,route.id==='P005'?['platinum']:['gold'],route.id==='P005'?'此分支需萬豪白金以上。':'此分支需萬豪金卡；白金以上可看四趟挑戰。',route.id==='P005'?'This branch requires Marriott Platinum or higher.':'This branch is for Marriott Gold; higher tiers can inspect the four-flight challenge.');
    check(profile.krisflyer,route.id==='P005'?['member','silver']:['member'],route.id==='P005'?'新航現有Gold／PPS不適用此升等分支。':'已有新航Silver以上不適用此Silver挑戰。',route.id==='P005'?'Existing KrisFlyer Gold/PPS does not qualify for this branch.':'Existing KrisFlyer Silver or higher cannot use this Silver accelerator.');
  }
  if(route.id === 'P006') {
    check(profile.krisflyer,['gold'],'需新航Gold或PPS等適格高階會員。','Eligible KrisFlyer Gold or PPS status is required.');
    check(profile.marriott,['none','silver','gold'],'萬豪已白金以上不能走此白金加速。','Existing Marriott Platinum or higher is not eligible for this Platinum accelerator.');
  }
  if(['P005','P006','P012'].includes(route.id)) {
    check(profile.linked,['no'],'需尚未使用萬豪×新航的一次性合作登錄。','You must not have used the one-time Marriott–KrisFlyer partnership registration.');
    check(profile.otherChallenge,['no'],'不能正在完成其他KrisFlyer配對挑戰。','Another KrisFlyer status-match challenge must not be in progress.');
    if(['P005','P012'].includes(route.id)) check(profile.provenance,['earned','card','matched'],'試用萬豪會籍不適用；其他來源仍需審核。','Trial Marriott status is excluded; other sources still require review.');
  }
  if(route.id === 'P007') {
    check(profile.hilton,['base','silver'],'公開FAQ要求Hilton一般／Silver；既有Gold／Diamond不受理。','The public FAQ requires Hilton Base/Silver; existing Gold/Diamond is excluded.');
    check(profile.hiltonMatched,['no'],'公開FAQ要求從未參加過此配對。','The public FAQ requires no previous participation.');
    pending.push(['其他品牌住宿證明、接受等級及B2B附註範圍待核。','Other-program stay proof, accepted tiers and the B2B wording need checking.']);
  }
  if(route.id === 'P009') pending.push(['每一跳都要確認接受上一步取得的會籍。','Every link must accept the status obtained in the preceding step.']);
  if(route.id === 'H003') pending.push(['銀行與ALL最低轉量的表述仍有差異。','The bank and ALL describe the minimum transfer differently.']);
  if(route.research === 'lead') pending.push(['關鍵規則尚未完成官方核實。','Key terms have not yet been verified with official sources.']);
  const state = blockers.length ? 'blocked' : route.research === 'conflict' ? 'conflict' : route.research === 'lead' ? 'lead' : pending.length ? 'unknown' : 'candidate';
  return {state,blockers,pending};
}

export function redemptionValue({cash,miles,taxes,extra}) {
  const a=nonNegative(cash), b=nonNegative(miles), c=nonNegative(taxes), d=nonNegative(extra);
  if([a,b,c,d].some(x=>x===null) || b===0) return null;
  const saving=a-c-d;
  return {saving, valuePerMile:saving/b};
}

export function challengeCost({nights,nightly,flights,transport,fees,benefit}) {
  const values=[nights,nightly,flights,transport,fees,benefit].map(nonNegative);
  if(values.some(x=>x===null) || !Number.isInteger(values[0])) return null;
  const [n,p,f,t,a,b]=values, total=n*p+f+t+a;
  return {total,net:b-total};
}

export function cardFee(card) {
  const f=card.fees;
  if(f.first_year_twd !== undefined) return {amount:f.first_year_twd,period:'first'};
  if(f.first_year_waived) return {amount:0,period:'first',renewal:f.annual_twd};
  if(f.annual_twd !== null && f.annual_twd !== undefined) return {amount:f.annual_twd,period:f.annual_fee_is_launch_promotion?'promotion':'annual'};
  return {amount:null,period:'unknown'};
}

export function eligibleTransfer(amount, rule) {
  const n=nonNegative(amount),v=rule.values;
  if(n===null || typeof v.input!=='number' || typeof v.output!=='number') return null;
  const minimum=v.minimum_input ?? v.bank_minimum_input ?? v.input;
  const increment=v.input_increment ?? v.bank_increment ?? v.input;
  if(n < minimum || (n-minimum)%increment!==0) return null;
  return n/v.input*v.output;
}
