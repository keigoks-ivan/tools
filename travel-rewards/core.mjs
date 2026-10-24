export const DEFAULT_PROFILE = Object.freeze({ marriott:'unknown', krisflyer:'unknown', hilton:'unknown', provenance:'unknown', linked:'unknown', otherChallenge:'unknown', hiltonMatched:'unknown', card:'unknown', ciTier:'unknown', ciRole:'unknown', ciGoldUsed:'unknown', annualSpend:'', maxFee:'' });

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
  if(route.id === 'P001') {
    if(profile.card==='other') pending.push(['需確認實際銀行點數及可轉航空，不能只按「其他卡片」推定。','The actual bank currency and airline partners need checking.']);
    else check(profile.card,['amex-mr','amex-plat'],'需可轉多家航空的銀行點數；華航／長榮聯名哩程不能直接當作運通積分。','Transferable bank points are required; cobranded airline miles are a different currency.');
  }
  if(route.id === 'P002') check(profile.card,['ci'], '需持有並綁定適用華航聯名卡。','An eligible linked China Airlines cobranded card is required.');
  if(route.id === 'P003') {
    check(profile.card,['amex-eva-plat'],'需持有長榮運通簽帳白金卡，其他卡片不能取得此續卡券。','The EVA Amex Platinum charge card is required for these renewal certificates.');
    if(spend === null) pending.push(['需核對前一年合格消費是否達120萬元。','Check whether prior-year qualifying spend reaches NT$1.2 million.']);
    else if(spend < 1200000) blockers.push(['已填年消費未達120萬元。','Entered annual spend is below NT$1.2 million.']);
    pending.push(['持卡第二年起、合格消費及續卡條件另核。','Card year two onward, qualifying spend and renewal conditions still need checking.']);
  }
  if(route.id === 'P013') {
    check(profile.card,['ci'],'需適用中信華航聯名卡。','An eligible CTBC China Airlines card is required.');
    check(profile.ciTier,['priority','precious'],'限鼎尊／璀璨無限卡；商務御璽沒有這項贈金卡禮遇。','Only Priority or Precious Infinite cards have this status benefit.');
    check(profile.ciRole,profile.ciTier==='precious'?['primary']:['primary','first-supplementary'],'鼎尊適用正卡及第一張附卡；璀璨限正卡。','Priority allows the primary and first supplementary card; Precious requires the primary card.');
    check(profile.ciGoldUsed,['no'],'每人僅能使用一次華夏金卡晉升禮遇。','This Dynasty Gold status benefit is once per person.');
    pending.push(['尚須銀行確認首次申辦、綁定華夏會員、首刷、年費入帳、有效持卡及目前華航等級；既有金卡以上不延長。','The issuer must confirm first application, linkage, first spend, paid fees, active card and current Dynasty tier; existing Gold+ is not extended.']);
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
  if(route.id === 'P011') pending.push(['尚未確認你的雅高與卡達航空帳戶連結，以及這次消費是否合格。','Your linked ALL/Qatar accounts and qualifying activity have not been confirmed.']);
  if(route.id === 'H003') {
    if(['unknown','other',undefined].includes(profile.card)) pending.push(['需另確認持有滙豐旅人積分，現有選項尚未確認此起點。','HSBC Traveller points have not been confirmed from these inputs.']);
    else blockers.push(['這條路線需滙豐旅人積分，已選卡片的點數不能直接代用。','This route requires HSBC Traveller points, not the selected card currency.']);
    pending.push(['銀行與ALL最低轉量的表述仍有差異。','The bank and ALL describe the minimum transfer differently.']);
  }
  if(route.research === 'lead') pending.push(['關鍵規則尚未完成官方核實。','Key terms have not yet been verified with official sources.']);
  const state = blockers.length ? 'blocked' : route.research === 'conflict' ? 'conflict' : route.research === 'lead' ? 'lead' : pending.length ? 'unknown' : 'candidate';
  return {state,blockers,pending};
}

export function routeStartingPoint(route,profile) {
  const source={
    P001:[['amex-mr','amex-plat'].includes(profile.card),'需先有可轉航空的銀行點數；華航卡點數不能當作新航里程。'],
    P002:[profile.card==='ci','需先持有適用的華航聯名卡。'],
    P003:[profile.card==='amex-eva-plat','需先持有長榮運通簽帳白金卡。'],
    P004:[['amex-plat','amex-eva-plat'].includes(profile.card),'需先持有適用運通簽帳白金卡。'],
    P005:[profile.marriott==='platinum','需先持有萬豪白金以上會籍；華航聯名卡不提供這項起點。'],
    P006:[profile.krisflyer==='gold','需先持有新航菁英金卡或PPS會籍；華航金卡不能直接替代。'],
    P007:[['gold','platinum'].includes(profile.marriott),'需另有飯店品牌會籍、合格住宿證明，並確認希爾頓接受資格。'],
    P008:[false,'須另取得個別帳戶適用的萬豪挑戰核准，尚未確認。'],
    P009:[false,'來源酒店會籍與每一段配對尚未全部核實，不能從現有卡片推定已接通。'],
    P010:[false,'這是另外申辦萬豪聯名卡的限量活動，原收件期已過。'],
    P011:[false,'須另確認雅高與卡達航空帳戶、連結及合格消費。'],
    P012:[profile.marriott==='gold','需先持有萬豪金卡；華航金卡是不同計畫。'],
    P013:[profile.card==='ci','需先持有適用的華航聯名卡。'],
    H001:[['amex-mr','amex-plat'].includes(profile.card),'需先持有可轉點的台灣運通會員酬賓積分。'],
    H002:[['amex-mr','amex-plat'].includes(profile.card),'需先持有可轉點的台灣運通會員酬賓積分。'],
    H003:[false,'需先確認持有滙豐旅人積分，不能用其他卡片的點數替代。']
  }[route.id];
  const label={P001:'可轉點的台灣運通積分',P002:'華航聯名卡',P003:'長榮運通簽帳白金卡',P004:'運通簽帳白金卡',P005:'萬豪白金以上會籍',P006:'新航菁英金卡／PPS會籍',P007:'萬豪高階會籍（接受資格另核）',P012:'萬豪金卡',P013:'華航聯名卡（卡別與個別資格另核）',H001:'可轉點的台灣運通積分',H002:'可轉點的台灣運通積分'}[route.id];
  return {connected:source?.[0]===true,reason:source?.[1]||'這條路線的起點尚未確認。',label:label||''};
}

export function partitionPlanRoutes(routes,profile,asOf='2026-10-24') {
  const groups={ready:[],pending:[],other:[]};
  for(const route of routes){
    const evaluation=evaluateRoute(route,profile,asOf);
    const connected=routeStartingPoint(route,profile).connected;
    const group=connected&&evaluation.state==='candidate'?'ready':connected&&evaluation.state==='unknown'?'pending':'other';
    groups[group].push(route);
  }
  return groups;
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
