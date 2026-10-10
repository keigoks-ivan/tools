import { serviceSummary } from './service-record.mjs';
import { REPLAY_CONDITIONS } from './replay.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels = {
  zh: {
    title:'灰線勤務簿',deck:'每一場出擊都有回聲，每一道防線都有下一個目標。',close:'返回・ESC',
    tabs:{overview:'勤務總覽',challenges:'打法挑戰',mastery:'戰場精通',daily:'每日挑戰'},
    local:'紀錄保存在此裝置。稱號與徽章只作紀念；不增加戰力。',
    next:'下一個可追求目標',sorties:'實際出擊',wins:'完成作戰',kills:'小隊擊倒累計',titles:'已得稱號',
    fields:'七場通關',plans:'三策精通',days:'每日完成',complete:'已完成',open:'待完成',
    history:'個人最佳',empty:'還沒有勝場紀錄。完成一次作戰，就能留下第一筆個人最佳。',
    bestHelp:'標準作戰、戰場變局與每日挑戰分開記錄。重播低分與失敗不會覆蓋已取得的最佳。',
    challengeHelp:'每項打法挑戰都要在真正完成作戰後成立。失敗仍保留出擊與小隊擊倒累計。',
    masteryHelp:'每個戰場的三個方案各通關一次即可精通。模式與難度可自由選擇；失敗不算通關。',
    dailyHelp:'每日只保留當日固定種子下的最佳勝場。相同日期的重試不會增加已完成天數。',
    dailyEmpty:'還沒有每日挑戰紀錄。選擇每日挑戰並部署，勝利後會在這裡保存當日最佳。',
    attempts:'出擊',clears:'勝場',points:'分',seed:'種子',noWin:'未通關',badge:'稱號',
    kinds:{normal:'標準作戰',remix:'戰場變局',daily:'每日挑戰'},
    medals:{gold:'金章',silver:'銀章',bronze:'銅章'},
    difficulty:'難度',plan:'方案',time:'時間',score:'分數',
    masteryBadge:'戰場精通',masteryProgress:'已通關方案',
  },
  en: {
    title:'Greyline service book',deck:'Every sortie leaves a record. Every line offers a next objective.',close:'Back · ESC',
    tabs:{overview:'Service',challenges:'Challenges',mastery:'Mastery',daily:'Daily challenges'},
    local:'Records stay on this device. Titles and badges are keepsakes; they add no combat power.',
    next:'Your next objective',sorties:'Actual sorties',wins:'Operations completed',kills:'Squad defeats',titles:'Titles earned',
    fields:'Battlefields cleared',plans:'Three-plan mastery',days:'Daily clears',complete:'Complete',open:'To earn',
    history:'Personal bests',empty:'No winning record yet. Complete an operation to establish your first personal best.',
    bestHelp:'Standard operations, battlefield remixes and daily challenges have separate records. Lower scores and failed retries never replace an earned best.',
    challengeHelp:'Each playstyle challenge must be earned in an actually completed operation. Failures still retain sorties and squad defeats.',
    masteryHelp:'Clear each of a battlefield’s three plans to master it. Choose any modes and difficulties; failures do not count as clears.',
    dailyHelp:'Each date retains one winning best with its fixed mission seed. Retrying a date does not add another completed day.',
    dailyEmpty:'No daily challenges recorded yet. Deploy in a daily challenge; victory will preserve that date’s best here.',
    attempts:'Sorties',clears:'Wins',points:'pts',seed:'Seed',noWin:'Not cleared',badge:'Title',
    kinds:{normal:'Standard operation',remix:'Battlefield remix',daily:'Daily challenge'},
    medals:{gold:'Gold',silver:'Silver',bronze:'Bronze'},
    difficulty:'Difficulty',plan:'Plan',time:'Time',score:'Score',
    masteryBadge:'Battlefield mastered',masteryProgress:'Plans cleared',
  },
};
const style = `
.cb-root{position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:26px;background:rgba(5,11,17,.9);backdrop-filter:blur(16px);color:#dce5e7;font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;isolation:isolate}
.cb-root[hidden]{display:none!important}.cb-root *{box-sizing:border-box}.cb-root button{font:inherit;cursor:pointer;color:inherit}.cb-root button:focus-visible,.cb-root [tabindex]:focus-visible{outline:2px solid #e0bf83;outline-offset:4px}
.cb-shell{width:min(1120px,100%);height:min(850px,calc(100dvh - 52px));display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;background:linear-gradient(145deg,#17232d,#101923 66%);border:1px solid #64717b70;box-shadow:0 28px 110px #000b;position:relative;overflow:hidden}
.cb-shell::before{content:'';position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0,transparent 79px,#ffffff02 79px,#ffffff02 80px);z-index:-1}
.cb-header{padding:28px 32px 23px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;border-bottom:1px solid #ffffff14;background:linear-gradient(115deg,#31424e60,#10192340)}
.cb-eyebrow{display:block;font-size:10px;letter-spacing:.22em;color:#bdcbd0;text-transform:uppercase;margin:0 0 10px}.cb-header h2{font-size:clamp(24px,3.2vw,35px);font-weight:650;letter-spacing:.04em;margin:0 0 8px;color:#f0e7d6}.cb-header p{font-size:13px;line-height:1.65;color:#aebfc7;max-width:700px;margin:0}
.cb-close{align-self:start;min-height:44px;white-space:nowrap;padding:10px 16px;border:1px solid #a9b4b54a;background:#0c141d77}.cb-close:hover{border-color:#d0b379;color:#f2d89d}
.cb-tabs{display:flex;gap:5px;overflow-x:auto;padding:8px 24px 0;border-bottom:1px solid #ffffff19;scrollbar-width:thin}.cb-tabs button{min-height:47px;padding:12px 17px;white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:#95a7b0;font-size:13px;letter-spacing:.04em}.cb-tabs button:hover{color:#e1ddd0;background:#ffffff04}.cb-tabs button[aria-selected=true]{color:#e5c68b;border-color:#d1af73;background:linear-gradient(0deg,#d1af7310,transparent)}
.cb-body{overflow-y:auto;overflow-x:hidden;padding:28px 32px 36px;scrollbar-width:thin;scrollbar-color:#57626c #15212a;overscroll-behavior:contain}.cb-footer{padding:14px 32px;font-size:11px;line-height:1.6;color:#869aa6;border-top:1px solid #ffffff12;background:#0c141d80}
.cb-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 24px}.cb-metric{padding:17px;border:1px solid #ffffff14;background:#ffffff03;min-width:0}.cb-metric span{display:block;font-size:11px;color:#9badb7;margin-bottom:9px}.cb-metric strong{font:500 clamp(24px,3vw,34px) ui-monospace,SFMono-Regular,monospace;color:#ecdec2;letter-spacing:.02em}
.cb-next{position:relative;border:1px solid #b197624d;border-left:3px solid #d2b27a;padding:23px 24px;margin:0 0 24px;background:linear-gradient(110deg,#b8955920,#b8955903)}.cb-next h3{font-size:22px;line-height:1.4;margin:0 0 8px;color:#edd7aa}.cb-next p{max-width:760px;margin:0 0 17px;font-size:13px;line-height:1.7;color:#c4cfd1}.cb-progress{height:4px;background:#080f16;overflow:hidden}.cb-progress span{display:block;height:100%;background:#c5ac75}.cb-progress-note{font:11px ui-monospace,SFMono-Regular,monospace;color:#acbbc3;display:block;margin-top:8px}
.cb-status-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:30px}.cb-status{border-top:1px solid #536674;padding-top:14px;font-size:12px;line-height:1.6;color:#9fb1bb}.cb-status strong{display:block;color:#dae3e6;font-size:19px;font-weight:500;margin-bottom:3px}
.cb-section-title{font-size:16px;font-weight:550;letter-spacing:.03em;margin:0 0 10px;color:#e1d7c5}.cb-help{font-size:12px;color:#9bb0bc;line-height:1.8;margin:0 0 22px;max-width:850px}.cb-empty{border:1px dashed #59677380;padding:28px;color:#9fafb9;font-size:13px;line-height:1.8}
.cb-challenges{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.cb-challenge{padding:21px;border:1px solid #ffffff18;background:#ffffff02;position:relative;min-width:0}.cb-challenge.is-complete{border-color:#a98e595e;background:linear-gradient(120deg,#d4b36f0c,transparent)}.cb-challenge .cb-eyebrow{display:flex;justify-content:space-between;gap:10px;letter-spacing:.1em}.cb-challenge.is-complete .cb-eyebrow{color:#d4ba83}.cb-challenge h3{font-size:17px;margin:0 0 9px;font-weight:550;line-height:1.4;color:#e0e5e6}.cb-challenge p{font-size:12px;line-height:1.75;color:#a9bac3;margin:0 0 18px;min-height:42px}.cb-title{font-size:11px;color:#d5bf91;display:block;margin-top:15px;line-height:1.6}
.cb-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.cb-field{border:1px solid #ffffff1c;background:#0d1822;overflow:hidden;min-width:0}.cb-field-header{height:155px;position:relative;padding:20px;display:flex;flex-direction:column;justify-content:flex-end;background:#263641;isolation:isolate}.cb-field-image{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;filter:saturate(.6)}.cb-field-header::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,#0d1822 0%,#0d182283 42%,#0d182219 100%);z-index:-1}.cb-field-header h3{font-size:21px;margin:0 0 7px;color:#f0e7d6;letter-spacing:.03em}.cb-field-meta{display:flex;justify-content:space-between;gap:12px;font-size:11px;color:#b7c4c9;line-height:1.5}.cb-field.is-complete{border-color:#b49a666e}.cb-field.is-complete .cb-field-meta strong{color:#e0c78e;font-weight:500}
.cb-plan-list{list-style:none;margin:0;padding:0 20px 16px}.cb-plan-list li{display:flex;justify-content:space-between;align-items:start;gap:18px;padding:13px 0;border-bottom:1px solid #ffffff0c;font-size:12px;line-height:1.6;color:#879eab}.cb-plan-list li:last-child{border:0}.cb-plan-list li.is-complete{color:#dcc698}.cb-plan-list small{white-space:nowrap;font:10px ui-monospace,SFMono-Regular,monospace;padding-top:3px}
.cb-best-list,.cb-daily-list{display:grid;gap:10px}.cb-best{border:1px solid #ffffff14;padding:17px 18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;background:#ffffff02}.cb-best h4{margin:5px 0;font-size:14px;font-weight:550;color:#dbe3e6;line-height:1.5}.cb-best p{margin:0;color:#96acb8;font-size:11px;line-height:1.8}.cb-best .cb-conditions{color:#c3b084}.cb-best .cb-eyebrow{font-size:9px;letter-spacing:.13em;margin-bottom:0}.cb-score{text-align:right;align-self:center;min-width:100px}.cb-score strong{display:block;font:500 22px ui-monospace,SFMono-Regular,monospace;color:#e2c991;margin-bottom:5px}.cb-score span{font-size:10px;color:#aab8c0;line-height:1.6}.cb-no-win{font-size:12px!important;color:#8aa0ad!important}
@media(max-width:720px){.cb-root{padding:12px}.cb-shell{height:calc(100dvh - 24px)}.cb-header{padding:22px 20px 19px;gap:14px}.cb-header h2{font-size:25px}.cb-header p{font-size:11px}.cb-close{padding:9px 11px;font-size:11px}.cb-tabs{padding-left:10px;padding-right:10px}.cb-tabs button{padding:12px;font-size:12px}.cb-body{padding:22px 20px 28px}.cb-footer{padding:12px 20px;font-size:10px}.cb-metrics{gap:9px;grid-template-columns:repeat(2,minmax(0,1fr))}.cb-metric{padding:14px}.cb-metric strong{font-size:28px}.cb-next{padding:20px 18px}.cb-next h3{font-size:19px}.cb-next p{font-size:12px}.cb-challenges,.cb-field-grid{grid-template-columns:minmax(0,1fr)}.cb-status-row{gap:10px}.cb-status{font-size:10px}.cb-status strong{font-size:17px}.cb-field-header{height:180px}.cb-best{padding:15px 13px;gap:12px}.cb-score{min-width:74px}.cb-score strong{font-size:18px}.cb-best h4{font-size:12px}.cb-best p{font-size:10px}}
@media(prefers-reduced-motion:no-preference){.cb-tabs button,.cb-close{transition:color .15s,border-color .15s,background .15s}.cb-progress span{transition:width .25s}}
`;

const progress = (value, target, label) => {
  const percent = Math.max(0,Math.min(100,target > 0 ? value/target*100 : 0));
  return `<div class="cb-progress" role="progressbar" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.min(value,target)}"><span style="width:${percent}%"></span></div><span class="cb-progress-note">${value} / ${target}</span>`;
};
const duration = seconds => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
const conditionNames = (remixId,language) => String(remixId??'').split('.').map(id=>REPLAY_CONDITIONS.find(condition=>condition.id===id)?.name[language]).filter(Boolean).join(' + ');

/** Self-contained overlay. The host creates only <section id="career" hidden>.
 * close() restores focus/inert state; user-close buttons additionally call onClose.
 */
export class CareerBook {
  constructor(root,{onClose}={}) {
    this.root=root;this.onClose=onClose;this.active='overview';this.options={records:{},language:'zh'};this.opened=false;
    root.classList.add('cb-root');root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');
    this.prefix=`${root.id||'career'}-book`;
    root.setAttribute('aria-labelledby',`${this.prefix}-title`);
    root.innerHTML=`<style>${style}</style><div class="cb-shell"><header class="cb-header"><div><span class="cb-eyebrow">GREYLINE / LOCAL SERVICE RECORD</span><h2 id="${this.prefix}-title"></h2><p data-cb-deck></p></div><button class="cb-close" type="button" data-cb-close></button></header><nav class="cb-tabs" role="tablist" data-cb-tabs></nav><div class="cb-body" role="tabpanel" tabindex="0" id="${this.prefix}-panel" data-cb-body></div><footer class="cb-footer" data-cb-footer></footer></div>`;
    const closeByUser=()=>{this.close();this.onClose?.();};
    root.querySelector('[data-cb-close]').onclick=closeByUser;
    root.querySelector('[data-cb-tabs]').onclick=event=>{const tab=event.target.closest('[data-cb-tab]');if(tab&&root.contains(tab))this.select(tab.dataset.cbTab);};
    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeByUser();return;}
      const tab=event.target.closest('[data-cb-tab]');
      if(tab){const ids=Object.keys(labels.zh.tabs),index=ids.indexOf(tab.dataset.cbTab),next={ArrowRight:(index+1)%ids.length,ArrowLeft:(index+ids.length-1)%ids.length,Home:0,End:ids.length-1}[event.key];
        if(next!==undefined){event.preventDefault();this.select(ids[next]);return;}}
      if(event.key!=='Tab')return;
      const items=[...root.querySelectorAll('button,[tabindex="0"]')].filter(item=>!item.disabled&&!item.hidden&&item.tabIndex>=0),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    });
  }
  open({records={},language='zh',tab='overview'}={}) {
    this.options={records,language};this.active=Object.hasOwn(labels.zh.tabs,tab)?tab:'overview';
    if(!this.opened){this.focusBefore=document.activeElement;
      this.inertBefore=[...(this.root.parentElement?.children||[])].filter(node=>node!==this.root&&!['SCRIPT','STYLE'].includes(node.tagName)).map(node=>[node,node.inert]);
      for(const [node] of this.inertBefore)node.inert=true;}
    this.opened=true;this.root.hidden=false;this.render();this.root.querySelector('[data-cb-close]').focus({preventScroll:true});
  }
  close() {
    this.root.hidden=true;
    if(!this.opened)return;
    this.opened=false;for(const [node,inert] of this.inertBefore||[])node.inert=inert;
    if(this.focusBefore?.isConnected)this.focusBefore.focus?.({preventScroll:true});
    this.inertBefore=[];
  }
  select(tab) {this.active=tab;this.render();this.root.querySelector(`[data-cb-tab="${tab}"]`).focus({preventScroll:true});}
  render(options={}) {
    this.options={...this.options,...options};const summary=serviceSummary(this.options.records,this.options.language),l=labels[summary.language],body=this.root.querySelector('[data-cb-body]');
    this.root.querySelector('h2').textContent=l.title;this.root.querySelector('[data-cb-deck]').textContent=l.deck;
    this.root.querySelector('[data-cb-close]').textContent=l.close;this.root.querySelector('[data-cb-footer]').textContent=l.local;
    this.root.querySelector('[data-cb-tabs]').setAttribute('aria-label',l.title);
    this.root.querySelector('[data-cb-tabs]').innerHTML=Object.entries(l.tabs).map(([id,name])=>`<button type="button" id="${this.prefix}-${id}" role="tab" aria-selected="${this.active===id}" aria-controls="${this.prefix}-panel" tabindex="${this.active===id?0:-1}" data-cb-tab="${id}">${escape(name)}</button>`).join('');
    body.setAttribute('aria-labelledby',`${this.prefix}-${this.active}`);
    const number=value=>value.toLocaleString(summary.language==='zh'?'zh-TW':'en-US');
    const next=summary.nextGoal;
    const nextCard=`<section class="cb-next"><span class="cb-eyebrow">${escape(l.next)}</span><h3>${escape(next.name)}</h3><p>${escape(next.detail)}</p>${progress(next.progress,next.target,next.name)}</section>`;
    const bestRow=entry=>{
      const conditions=entry.kind==='remix'?conditionNames(entry.remixId,summary.language):'';
      return `<article class="cb-best"><div><span class="cb-eyebrow">${escape(l.kinds[entry.kind])}</span><h4>${escape(entry.sceneName)} · ${escape(entry.planName)}</h4>${conditions?`<p class="cb-conditions">${escape(conditions)}</p>`:''}<p>${escape(entry.modeName)} · ${escape(entry.difficultyName)} · ${escape(l.time)} ${duration(entry.best.time)} · ${entry.wins} ${escape(l.clears)}</p></div><div class="cb-score"><strong>${number(entry.best.score)}</strong><span>${escape(entry.best.medal?l.medals[entry.best.medal]:l.points)}</span></div></article>`;
    };
    if(this.active==='overview') {
      body.innerHTML=`<div class="cb-metrics">${[[l.sorties,summary.totals.sorties],[l.wins,summary.totals.wins],[l.kills,summary.totals.kills],[l.titles,summary.earnedCount]].map(([label,value])=>`<div class="cb-metric"><span>${escape(label)}</span><strong>${number(value)}</strong></div>`).join('')}</div>${nextCard}<div class="cb-status-row">${[[l.fields,`${summary.clearedFields} / 7`],[l.plans,`${summary.masteredFields} / 7`],[l.days,number(summary.completedDays)]].map(([label,value])=>`<div class="cb-status"><strong>${value}</strong>${escape(label)}</div>`).join('')}</div><h3 class="cb-section-title">${escape(l.history)}</h3><p class="cb-help">${escape(l.bestHelp)}</p>${summary.bests.length?`<div class="cb-best-list">${summary.bests.slice().sort((a,b)=>b.best.score-a.best.score).slice(0,8).map(bestRow).join('')}</div>`:`<div class="cb-empty">${escape(l.empty)}</div>`}`;
    } else if(this.active==='challenges') {
      body.innerHTML=`<p class="cb-help">${escape(l.challengeHelp)} · ${summary.earnedCount} / ${summary.totalChallenges}</p><div class="cb-challenges">${summary.challenges.map((challenge,index)=>`<article class="cb-challenge ${challenge.complete?'is-complete':''}"><span class="cb-eyebrow"><span>${String(index+1).padStart(2,'0')} / SERVICE</span><span>${escape(challenge.complete?l.complete:l.open)}</span></span><h3>${escape(challenge.name)}</h3><p>${escape(challenge.detail)}</p>${progress(challenge.progress,challenge.target,challenge.name)}<span class="cb-title">${escape(l.badge)} · ${escape(challenge.title)}</span></article>`).join('')}</div>`;
    } else if(this.active==='mastery') {
      body.innerHTML=`<p class="cb-help">${escape(l.masteryHelp)}</p><div class="cb-field-grid">${summary.battlefields.map((field,index)=>`<article class="cb-field ${field.complete?'is-complete':''}"><header class="cb-field-header"><img class="cb-field-image" src="./assets/briefing/${field.sceneId}.webp?v=2" alt="" loading="lazy"><span class="cb-eyebrow">0${index+1} / GREYLINE</span><h3>${escape(field.name)}</h3><div class="cb-field-meta"><span>${field.wins} ${escape(l.clears)}</span><strong>${escape(field.complete?l.masteryBadge:l.masteryProgress)} ${field.progress} / 3</strong></div></header><ul class="cb-plan-list">${field.plans.map(plan=>`<li class="${plan.complete?'is-complete':''}"><span>${String(plan.variantIndex+1).padStart(2,'0')} · ${escape(plan.name)}</span><small>${escape(plan.complete?l.complete:l.open)}</small></li>`).join('')}</ul></article>`).join('')}</div>`;
    } else {
      body.innerHTML=`<p class="cb-help">${escape(l.dailyHelp)}</p>${summary.daily.length?`<div class="cb-daily-list">${summary.daily.map(day=>`<article class="cb-best"><div><span class="cb-eyebrow">${escape(day.dailyKey)} / ${escape(l.kinds.daily)}</span><h4>${escape(day.sceneName)}</h4><p>${escape(l.seed)} ${day.seed} · ${escape(day.completed?l.complete:l.noWin)}${day.best?` · ${escape(l.time)} ${duration(day.best.time)}`:''}</p></div><div class="cb-score">${day.best?`<strong>${number(day.best.score)}</strong><span>${escape(day.best.medal?l.medals[day.best.medal]:l.points)}</span>`:`<strong class="cb-no-win">${escape(l.noWin)}</strong>`}</div></article>`).join('')}</div>`:`<div class="cb-empty">${escape(l.dailyEmpty)}</div>`}`;
    }
    body.scrollTop=0;
  }
}
