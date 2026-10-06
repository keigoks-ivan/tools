import { regionalArt, gameIcon } from './ui-premium-art.js?v=22';
import { CITIES, CITY_REGIONS, AIRCRAFT, RIVALS } from './data.mjs?v=22';
import { readCareer, tierProgress, albums, ALBUM_GOAL } from './career.mjs?v=22';
import { tr, pick, esc, fmtNum, fmtUSD } from './ui-util.js?v=22';

export function missionTitle(m) {
  const city = pick(CITIES[m.city]);
  return m.kind === 'explore' ? tr(`${city}，準備首航！`, `First flights to ${city}!`)
    : m.kind === 'rival' ? tr(`${city}航線爭奪戰`, `Compete for ${city}`)
    : m.kind === 'network' ? tr('打造轉機小樞紐', 'Build a connecting hub') : m.kind === 'recovery' ? tr('守住現金，準備復航', 'Keep cash for the comeback') : tr('小機隊，大成績', 'Small fleet, big results');
}
export function missionGoals(m) {
  return m.kind === 'explore' ? [tr(`累計送達 ${fmtNum(m.targetPax)} 位旅客`, `Carry ${fmtNum(m.targetPax)} passengers`), tr('這條航線至少一期獲利', 'Make a route profit in at least one turn')]
    : m.kind === 'rival' ? [tr(`每週單程座位達 ${fmtNum(m.targetSeats)} 座`, `Schedule ${fmtNum(m.targetSeats)} one-way seats/week`), tr('同一期的這條航線獲利', 'Make a profit on this route in the same turn')]
    : m.kind === 'network' ? [tr(`同時營運 ${m.targetRoutes} 條航線`, `Fly ${m.targetRoutes} routes`), tr('目的地跨 2 個區域', 'Destinations in 2 regions'), tr('轉機旅客占 5%', '5% connecting passengers'), tr('公司本期獲利', 'A profitable company turn')]
    : m.kind === 'recovery' ? [tr(`本期虧損不超過 ${fmtUSD(m.targetLoss)}`, `Limit turn loss to ${fmtUSD(m.targetLoss)}`), tr('期末現金保持正值', 'Keep closing cash positive'), tr('沒有閒置飛機', 'No idle aircraft')]
    : [tr(`至少 ${m.targetRoutes} 條航線獲利`, `${m.targetRoutes} profitable routes`), tr('沒有閒置飛機', 'No idle aircraft'), tr('公司本期獲利', 'A profitable company turn')];
}
const missionLesson = m => m.kind === 'explore' ? tr('新航線需要累積客源。留意票價和班次，別急著把飛機塞滿。', 'New routes build demand over time. Balance fares and frequency as they grow.')
  : m.kind === 'rival' ? tr('以接任務時遊戲對手座位的 70% 為目標，也要賺錢。跟著降價，未必會贏。', 'Target 70% of the game rivals’ seats at acceptance and earn a profit. A fare war may not help.')
  : m.kind === 'network' ? tr('把不同區域連起來，讓轉機客補上空位。多開航線也會增加成本。', 'Connect regions so transfers fill spare seats. More routes also mean more costs.')
  : m.kind === 'recovery' ? tr('先縮減虧損航班、退租閒置飛機，留現金等客人回來。縮小規模也能是好決策。', 'Trim loss-making flights and return idle leases. Keeping cash for returning demand can be a good decision.')
  : tr('用合適的飛機與班次攤平固定成本。滿載和公司獲利要一起看。', 'Fit aircraft and schedules to cover fixed costs. Watch both load and company profit.');

export function careerHeader(state) {
  const c = readCareer(state), t = tierProgress(c.xp);
  return `<div class="career-profile"><div class="career-emblem">${t.tier.icon}<small>${t.index + 1}</small></div><div><small>${tr('航空公司等級','AIRLINE LEVEL')} ${t.index + 1}</small><b>${esc(pick(t.tier))}</b><div class="career-meter"><i style="width:${t.progress * 100}%"></i></div><span>${t.next ? tr(`再 ${t.next.xp - c.xp} 成長值升級`, `${t.next.xp - c.xp} XP to next level`) : tr('最高等級達成！', 'Maximum level!')}</span></div><strong>${fmtNum(c.xp)}<small>${tr('成長值','XP')}</small></strong></div>`;
}
export function missionCard(m, state, active = false, running = false) {
  const checks = m.checks || [], left = active ? Math.max(0, m.deadline - state.turn) : m.turns;
  const tag = m.kind === 'explore' ? tr('探索','EXPLORE') : m.kind === 'rival' ? tr('對決','RIVALRY') : m.kind === 'network' ? tr('連線','CONNECT') : tr('經營','OPERATE');
  const progress = m.kind === 'explore' && active ? `<div class="delivery-meter"><div><span>${tr('已送達','DELIVERED')}</span><b>${fmtNum(m.pax)} / ${fmtNum(m.targetPax)}</b></div><div class="career-meter"><i style="width:${Math.min(100,m.pax/m.targetPax*100)}%"></i></div></div>` : '';
  return `<article class="dispatch-card ${m.kind} ${active?'accepted':''}"><div class="dispatch-top"><span>${active?'●':'✦'} ${tag}</span><small>${tr(`${left} 回合內`, `${left} turns left`)}</small></div><div class="dispatch-route"><b>${m.city || state.hub}</b><span>${m.city?'✈':'★'}</span>${m.city?postcard(CITIES[m.city].region):''}</div><h3>${esc(missionTitle(m))}</h3><ul class="dispatch-goals">${missionGoals(m).map((g,i)=>`<li class="${checks[i]?'met':''}"><i>${checks[i]?'✓':'○'}</i>${esc(g)}</li>`).join('')}</ul>${progress}<p class="dispatch-lesson">${esc(missionLesson(m))}</p><div class="dispatch-reward"><span>✦ <b>+${m.xp}</b> ${tr('成長值','XP')}</span><small>${tr('完成後領取','ON COMPLETION')}</small></div>${active?`<button type="button" class="btn block" data-mission-plan>${m.city?tr('規劃這條航線','Plan this route'):tr('回去調整航網','Adjust your network')} →</button><button type="button" class="link abandon-mission" data-mission-abandon ${running?'disabled':''}>${tr('放棄任務，重新選擇','Abandon and choose again')}</button>`:`<button type="button" class="btn block" data-mission-accept="${esc(m.id)}" ${running?'disabled':''}>${tr('接取任務','Accept mission')} →</button>`}</article>`;
}
export function dispatchView(state, offers, running = false) {
  const c = readCareer(state);
  return `${careerHeader(state)}<div class="dispatch-heading"><div><small>${tr('天青任務板','SKYGLAZE DISPATCH')}</small><h2>${c.active?tr('這次，向目標前進。','Your mission is underway.'):tr('下一趟，由你決定。','Choose your next adventure.')}</h2></div><img src="./art/v2/mascot.webp?v=22" width="76" height="76" alt=""></div><p class="hint">${running?tr('本期已出發；結算後可接新任務。','This turn has departed. Choose a new mission after settlement.'):c.active?tr('進度在結算後更新。可提前完成，不必等到期限。','Progress updates at settlement. Finish early whenever you reach the goal.'):tr('挑一項挑戰，在期限內完成。也可以自由經營。','Choose one timed challenge, or keep playing freely.')}</p><div class="dispatch-grid">${c.active?missionCard(c.active,state,true,running):offers.map(m=>missionCard(m,state,false,running)).join('') || `<p class="hint">${tr('本局任務已結束，城市收集仍會保留。','Missions have ended. Your city collection is kept.')}</p>`}</div><div class="dispatch-links"><button type="button" class="btn sec" data-passport>▣ ${tr('旅行手冊','Travel passport')}</button><button type="button" class="btn sec" data-rival-board>⚑ ${tr('對手雷達','Rival radar')}</button></div><p class="dispatch-note">${tr('成長值用來升級與收集。任務沒有現金補貼，航線仍要靠自己獲利。','XP builds levels and collections. Missions pay no cash; routes must earn their own profit.')}</p>`;
}
export function missionPin(state) {
  const c = readCareer(state), m = c.active, t = tierProgress(c.xp);
  return `<span class="pin-icon">${gameIcon(m?'missions':'xp')}</span><span><small>${m?tr('進行中任務','ACTIVE MISSION'):tr(`航空公司 Lv.${t.index+1}`, `AIRLINE Lv.${t.index+1}`)}</small><b>${m?esc(missionTitle(m)):tr('接任務，收集城市！','Missions & city stamps!')}</b><em>${m?tr(`剩 ${Math.max(0,m.deadline-state.turn)} 回合 · +${m.xp} 成長值`,`${Math.max(0,m.deadline-state.turn)} turns left · +${m.xp} XP`):tr('挑個任務，開始新挑戰 →','Choose your next challenge →')}</em>${m?.kind==='explore'?'<span class="pin-traffic" id="mission-delivery" hidden><em></em><span class="career-meter"><i></i></span></span>':''}</span>`;
}

// Decorative regional illustrations; the city catalog and stamp totals stay exact.
export function postcard(region) { return regionalArt(region, 'postcard-art'); }
export function passportView(stamps, current = {}) {
  return `<div class="passport-heading"><div><small>${tr('天青旅行手冊','SKYGLAZE PASSPORT')}</small><h2>${tr('把世界，一站一站收起來。','Collect your world, one city at a time.')}</h2><p class="hint">${tr('有旅客抵達才會蓋章，換基地或重玩也會保留。每區集滿 3 城，本局可獲 100 成長值。','Stamps require actual passengers. They carry across games and hubs. Three cities in a region award 100 XP in that game.')}</p></div><b>${Object.keys(stamps).length}<small>/ ${Object.keys(CITIES).length} ${tr('城市','cities')}</small></b></div><div class="passport-grid">${albums(stamps).map(a=>`<article class="passport-album ${a.complete?'complete':''}">${postcard(a.id)}<div class="album-title"><h3>${esc(pick(a))}</h3><span>${a.complete?'★':`${Math.min(a.cities.length,ALBUM_GOAL)}/${ALBUM_GOAL}`}</span></div><p>${a.complete?tr('區域收藏完成','Regional collection complete'):tr('再收集','Collect')} ${a.complete?`${a.cities.length} ${tr('座城市','cities')}`:`${ALBUM_GOAL-a.cities.length} ${tr('個城市章','more city stamps')}`}</p><details><summary>${tr('查看城市章','View city stamps')} <b>${a.cities.length}</b></summary><div class="city-stamps">${Object.keys(CITIES).filter(id=>CITIES[id].region===a.id).map(id=>`<span class="city-stamp ${stamps[id]?'collected':''} ${current[id]?'this-game':''}" title="${esc(pick(CITIES[id]))}"><b>${id}</b><small>${stamps[id]?'✓': '·'}</small></span>`).join('')}</div></details></article>`).join('')}</div>`;
}
export function rivalView(state, routes) {
  return `<div class="rival-heading"><small>${tr('競爭會隨供需變動','COMPETITION EVOLVES')}</small><h2>${tr('看看誰和你飛同一條線。','Who is flying alongside you?')}</h2><p class="hint">${tr('比較你的規劃與遊戲對手目前班表。以下是座位供給，並非實際載客量，也不含市場其他航空公司。','Compare your plan with the game rivals’ current schedules. These are offered seats, not passenger counts, and exclude other market airlines.')}</p></div><div class="rival-grid">${state.rivals.map(rv=>`<article class="rival-card"><div class="rival-name"><span>${rv.kind==='lcc'?'ϟ':'♧'}</span><div><small>${rv.kind==='lcc'?tr('廉價航空','LOW-COST'):tr('全服務航空','FULL-SERVICE')}</small><h3>${esc(pick(RIVALS[rv.id]))}</h3></div><b>${Object.keys(rv.routes).length}<small>${tr('航線','routes')}</small></b></div>${Object.entries(rv.routes).map(([city,x])=>{
    const mine=routes.find(r=>r.city===city),own=mine?mine.weekly*2*AIRCRAFT[mine.type].seats[state.model]:0,other=x.weekly*2*(rv.kind==='lcc'?186:168),share=own/(own+other);
    return `<button type="button" class="rival-route" data-rival-city="${city}"><div><b>${state.hub} → ${city}</b><span>${esc(pick(CITIES[city]))} ↗</span></div><div class="race-track"><i style="width:${share*100}%"></i></div><small>${tr('你','YOU')} <strong>${fmtNum(own)}</strong> / ${tr('對手','RIVAL')} <strong>${fmtNum(other)}</strong> ${tr('座／週','seats/wk')}</small><em>${tr('對手票價基準','Rival fare factor')} ×${x.fare.toFixed(2)}${mine?' · '+tr('航線重疊','OVERLAP'):''}</em></button>`;
  }).join('')}<p class="hint">${tr('別只為了搶客人而降價，先確認航線仍能獲利。','Before matching a fare cut, check that your route can still earn a profit.')}</p></article>`).join('')}</div>`;
}
export function careerResult(state, report) {
  const result=report.career;if(!result)return '';
  const c=readCareer(state),m=result.mission;
  const title=m?.success?tr('任務完成！','Mission complete!'):result.levelUp?tr('你的航空公司升級了！','Your airline leveled up!'):result.newStamps.length?tr('新的城市章，收到了！','New city stamps!'):m?tr('這次任務到期了','Mission expired'):tr('航網成長中','Growing your airline');
  return `<section class="career-settlement ${m?.success||result.levelUp?'celebrate':''}"><div class="reward-heading"><span>${m?.success?'★':result.levelUp?'♛':'✦'}</span><div><small>${tr('本期成長','TURN PROGRESS')}</small><h2>${title}</h2></div><b>+${result.xp}<small>${tr('成長值','XP')}</small></b></div>${m?`<p>${esc(missionTitle(m))} · ${m.success?tr('挑戰達成，獎勵已入帳。','Goal reached. XP awarded.'):tr('沒有完成，沒有現金罰款。下一回合可以再挑戰。','Unfinished, with no cash penalty. Try another challenge next turn.')}</p>`:''}${result.newStamps.length?`<div class="earned-stamps">${result.newStamps.map(city=>`<span><b>${city}</b><small>${esc(pick(CITIES[city]))}</small><i>✓</i></span>`).join('')}</div>`:''}${result.newAlbums.length?`<p>★ ${result.newAlbums.map(id=>esc(pick(CITY_REGIONS[id]))).join(' · ')} ${tr('區域收藏完成！','regional collection complete!')}</p>`:''}${careerHeader(state)}<div class="career-result-foot"><span>${tr(`任務完成 ${c.completed.length} 次 · 最長連續獲利 ${c.bestStreak} 期`,`${c.completed.length} missions · best profit streak ${c.bestStreak} turns`)}</span><button type="button" class="link" data-passport>${tr('打開旅行手冊','Open passport')} ↗</button></div></section>`;
}
