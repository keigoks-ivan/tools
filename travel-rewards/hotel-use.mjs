import {redemptionValue,nonNegative} from './core.mjs?v=20261030-19';
import {CUBE_PARTNERS} from './cube-data.mjs?v=20261030-19';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(value);
export const HOTEL_PROGRAMS=[
  {id:'marriott',name:'萬豪',tag:'住五付四',intro:'任何會員；同一訂單五個連續全點數標準兌換晚，免全段最低點數的一晚。',rules:['免的不是任意最後一晚；10晚按整段最低兩晚處理。','免房券、點數＋現金與升等部分不能直接套用；用官方已含優惠的全段總點數試算，不再扣一次。','點數房是否計正常資格房晚，與新航／JAL等付費挑戰是否接受，是另外兩項規則。'],sources:['hotel-mb-five','hotel-mb-five-faq'],tree:'hotel-use',node:'use-marriott'},
  {id:'hilton',name:'Hilton',tag:'銀卡以上第五晚免費',intro:'限已核准銀卡以上、同酒店全點數標準房五連晚以上；最多20晚中的四個免費晚。',rules:['一般會員沒有這項第五晚權益；運通贈Gold仍要先完成申請。','Premium房、Points & Money及部分套裝／活動不能套用。依官方預訂的第5／10／15／20晚及總點數確認。','獎勵房可用於住宿，不代表Hilton公開會籍配對挑戰接受Reward Stays。'],sources:['hotel-hilton-five','hotel-hilton-terms'],tree:'hotel-use',node:'use-hilton'},
  {id:'all',name:'雅高 ALL',tag:'1,000點抵20歐元',intro:'官網1,000點起；2,000點以上依2,000倍數。台灣等列名地區酒店櫃檯另可500點起抵10歐元。',rules:['銀行轉入的最低量，和飯店可使用的最低量不同；例如旅人最低轉3,000，不代表一次可在線上用3,000。','IntercityHotel、Steigenberger、Steigenberger Icon、MAXX、Jaz in the City、Zleep等列名品牌不提供此住宿折抵；其他酒店仍要參與計畫。','部分稅款、Day Use、不可退預付房價有不同限制；預付價須有部分卡款。台幣折抵依Accor實際換匯，不預設固定匯率。'],sources:['hotel-all-use','hotel-all-book'],tree:'hotel-use',node:'use-all'},
  {id:'ihg',name:'IHG',tag:'第四晚須指定海外卡',intro:'本輪已核的第四晚免費入口是美國Chase IHG Premier Select主卡＋同酒店連續全點數標準獎勵住宿。',rules:['台灣滙豐或CUBE可轉IHG點數；IHG白金與這項Chase持卡權益分開。','第四晚免費不適用現金房或Points & Cash，仍須付適用雜費及度假村費。房價與點數均可能動態變動。','其他Chase卡與本人既有版本另核；免年費卡官方已公告2027起須曆年消費5,000美元。不能把所有卡當作同一方案。','Points & Cash是「現有點數加訂房時購買的點數」，不是折現金；每曆年最多購買200,000點，1,000為單位。','Platinum與Diamond有獎勵晚折扣，Club、Silver、Gold沒有；折扣比例條款未列。','點數：Elite不到期；Club會員12個月無活動到期。'],sources:['hotel-ihg-faq','hotel-ihg-select','hotel-ihg-2026','hotel-ihg-traveler-2027','ihg-member-tc-1030','ihg-faq-1030'],tree:'hotel-use',node:'use-ihg'},
  {id:'hyatt',name:'Hyatt',tag:'五級點數表，Points + Cash對半',intro:'獎勵住宿按酒店類別1–8與當晚五級（Lowest到Top）定價，標準房無停售日；Points + Cash為該晚點數的一半加現金。',rules:['2026年5月起每個類別分五級；同一家酒店不同日期的點數不同，先到Hyatt點數日曆查當晚等級。','Points + Cash：點數為免費晚的一半，現金為標準價的五至七折；標準房可線上訂，套房要打電話。','官方條款、FAQ、獎勵頁都沒查到連住優惠，不要套用萬豪或Hilton的第五晚規則。','Explorist、Globalist與Hyatt聯名卡主卡（美國發行）有獎勵晚提前訂房，天數條款沒寫。點數24個月無活動作廢。'],sources:['hyatt-free-nights-chart','hyatt-award-chart-news','hyatt-terms-1015','hyatt-faq-general'],tree:'hotel-use',node:'use-hyatt'}
];
export function hotelTransferRows(program){
  const rows=[];
  if(['marriott','hilton'].includes(program))rows.push({source:'台灣運通MR',ratio:'1,000 → '+(program==='marriott'?'900':'1,250'),minimum:'最低1,000；1,000單位',timing:'估2–3週',note:'有效至2027/6/30；不套海外運通比例',tree:'points-hotel',node:program==='marriott'?'mr-marriott':'mr-hilton'});
  if(['marriott','all','ihg'].includes(program)){
    rows.push({source:'滙豐旅人旅遊積分',ratio:'1:1',minimum:'最低3,000；500單位',timing:'網路／Card+資料正確時即時；一般7–14工作天',note:program==='marriott'?'萬豪跨卡每日轉入750,000點；費用與年度上限未列':program==='all'?'ALL介紹from1,000與銀行不同；操作採銀行3,000':'酒店端台灣HSBC精確比例未獨立互核',tree:'points-hotel',node:program==='all'?'hsbc-all':'hsbc-hotels'});
    rows.push({source:'滙豐卓越紅利積分',ratio:'2紅利 → 1酒店點',minimum:'最低／增量單位待銀行釐清',timing:'依銀行與酒店處理',note:'銀行門檻段混寫旅遊積分3,000／300；不自行當成可操作紅利額',tree:'points-hotel',node:'hsbc-premier'});
  }
  const cube=CUBE_PARTNERS.find(item=>item.id===program);
  if(cube)rows.push({source:'小樹點（信用卡）',ratio:cube.input+' → '+cube.output,minimum:'最低'+cube.input+'；同量為增加單位',timing:'原則即時；系統異常另計',note:'限2026表；限時加碼另看，不自動加進基本比例',tree:'cube-points',node:'cube-hotel'});
  if(program==='all'){
    rows.push({source:'已連結Qatar Avios',ratio:'3,500 → 1,000',minimum:'已確認最低；增量／上限未明列',timing:'最多六週',note:'ALL須選Qatar合作，不能同時掛FB；兩方向不可逆',tree:'all-qatar',node:'qatar-to-all'});
    rows.push({source:'已連結Flying Blue哩程',ratio:'4,000 → 1,000',minimum:'已確認最低；增量／上限未明列',timing:'專屬條款列即時',note:'ALL須選FB合作；不能把反向轉點當作取消原交易',tree:'all-flyingblue',node:'fb-all-transfer'});
  }
  if(program==='hyatt')rows.push({source:'台灣銀行點數（運通MR、星展飛行積金、滙豐、國泰世華）',ratio:'沒有轉入入口',minimum:'不適用',timing:'不適用',note:'四家頁面逐頁讀過都沒有Hyatt；可購買點數（2,000起、1,000為單位、每年自購上限55,000）或會員互贈',tree:'points-hotel',node:'hsbc-hotels'});
  return rows;
}
export function hotelValue(input){
  if(!Number.isInteger(nonNegative(input.points)))return null;
  const result=redemptionValue({cash:input.cash,miles:input.points,taxes:input.cashPart,extra:input.fees});
  if(!result)return null;
  const alternative=nonNegative(input.alternative);
  return {...result,versusAlternative:alternative===null?null:result.saving-alternative};
}
const sourceLinks=(ids,sources)=>ids.map(id=>sources.find(source=>source.id===id)).filter(Boolean).map(source=>'<a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a>').join(' · ');
function programMarkup(id,sources){
  const program=HOTEL_PROGRAMS.find(item=>item.id===id)||HOTEL_PROGRAMS[0];
  return '<div class="hotel-use-intro"><span>'+esc(program.tag)+'</span><h3>'+esc(program.intro)+'</h3><ul>'+program.rules.map(rule=>'<li>'+esc(rule)+'</li>').join('')+'</ul><p class="hotel-source-links">'+sourceLinks(program.sources,sources)+'</p><button type="button" class="text-button" data-open-tree="'+program.tree+'" data-open-node="'+program.node+'">看這段資格與來源 ↗</button></div><h3 class="hotel-section-label">轉進來有哪些入口</h3><p class="hotel-table-hint">左右滑動查看完整限制 →</p><div class="table-wrap"><table class="hotel-transfer-table"><thead><tr><th>來源資產</th><th>基本比例</th><th>最低量／增量</th><th>入帳與限制</th></tr></thead><tbody>'+hotelTransferRows(program.id).map(row=>'<tr><th>'+esc(row.source)+'<button type="button" data-open-tree="'+row.tree+'" data-open-node="'+row.node+'">看轉點條款 ↗</button></th><td>'+esc(row.ratio)+'</td><td>'+esc(row.minimum)+'</td><td>'+esc(row.timing)+'<small>'+esc(row.note)+'</small></td></tr>').join('')+'</tbody></table></div><p class="hotel-panel-note">這是已建檔入口，不是完整市場。轉點均需適用本人帳戶，且不可逆；沒有在這裡登入、申請、連結或實際轉點。</p>';
}
export function hotelPanel(sources=[]){
  return '<section class="hotel-panel" data-hotel-panel><div class="hotel-panel-heading"><p class="eyebrow">先決定怎麼住，再決定點數往哪裡轉</p><h2>轉成飯店點數之後，接著做什麼？</h2><p>銀行轉入、住宿折抵、連住優惠與會籍是不同關卡。選一家飯店計畫，查看可接的入口與使用限制。</p></div><div class="hotel-programs" role="group" aria-label="選擇飯店點數用途">'+HOTEL_PROGRAMS.map(program=>'<button type="button" data-hotel-program="'+program.id+'" aria-pressed="'+(program.id==='marriott')+'"><b>'+esc(program.name)+'</b><small>'+esc(program.tag)+'</small></button>').join('')+'</div><div data-hotel-program-content>'+programMarkup('marriott',sources)+'</div><section class="hotel-value"><h3>這次住宿，點數實際省多少？</h3><p>填入同日期、房型、人數、早餐與退改條件的實際報價；所需點數使用已含連住優惠的官方總額。</p><div class="hotel-value-fields"><label>同條件現金住宿總價（NT$）<input data-hotel-value="cash" type="number" min="0" inputmode="decimal" placeholder="填整段含稅報價"></label><label>這次實際需扣酒店點數<input data-hotel-value="points" type="number" min="1" step="1" inputmode="numeric" placeholder="填優惠後全段點數"></label><label>點數房仍須付現（NT$）<input data-hotel-value="cashPart" type="number" min="0" inputmode="decimal" value="0"></label><label>本次新增轉點等費用（NT$）<input data-hotel-value="fees" type="number" min="0" inputmode="decimal" value="0"></label><label>這批銀行點數原可實際抵用價值（NT$）<input data-hotel-value="alternative" type="number" min="0" inputmode="decimal" placeholder="可留空；填0表示沒有"></label></div><div data-hotel-value-result class="hotel-value-result" role="status" aria-live="polite">填入實際報價與點數後計算；未填不當作零。</div><p class="hotel-panel-note">沒有即時房況或點數房報價。此處比較金額，不判定能否訂房，也不把轉入獎勵點數當作挑戰完成或會籍升等。</p></section></section>';
}
export function hotelNodeSummary(id){
  if(id==='choose')return '<section class="tree-detail-section hotel-node-summary"><h3>先選要使用哪家的點數</h3><p>萬豪、Hilton、ALL與IHG的連住優惠及資格不同；銀行轉點入口相同，也不能互套飯店使用規則。</p><button type="button" class="button secondary" data-open-tree="hotel-use" data-hotel-focus-program="marriott">選飯店，並排看入口與使用限制 ↗</button></section>';
  const program=HOTEL_PROGRAMS.find(item=>item.id===id);if(!program)return '';
  return '<section class="tree-detail-section hotel-node-summary"><h3>轉成點數後，怎麼用？</h3><p>'+esc(program.intro)+'</p><button type="button" class="button secondary" data-open-tree="hotel-use" data-hotel-focus-program="'+program.id+'">比較入口、限制與這次住宿價值 ↗</button></section>';
}
export function selectHotelProgram(root,id,sources=[]){
  const program=HOTEL_PROGRAMS.find(item=>item.id===id);if(!program)return;
  const panel=root.querySelector('[data-hotel-panel]');if(!panel)return;
  panel.querySelectorAll('[data-hotel-program]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hotelProgram===id)));
  panel.querySelector('[data-hotel-program-content]').innerHTML=programMarkup(id,sources);
  panel.querySelectorAll('[data-hotel-value]').forEach(input=>input.value=['cashPart','fees'].includes(input.dataset.hotelValue)?'0':'');
  panel.querySelector('[data-hotel-value-result]').textContent='已切換飯店計畫，請填這一家的實際報價；不沿用上一家點數價格。';
}
export function wireHotelTools(root,sources=[]){
  root.addEventListener('click',event=>{const button=event.target.closest('[data-hotel-program]');if(button)selectHotelProgram(root,button.dataset.hotelProgram,sources);});
  root.addEventListener('input',event=>{
    if(!event.target.matches('[data-hotel-value]'))return;
    const panel=event.target.closest('[data-hotel-panel]'),values=Object.fromEntries([...panel.querySelectorAll('[data-hotel-value]')].map(input=>[input.dataset.hotelValue,input.value])),result=hotelValue(values),output=panel.querySelector('[data-hotel-value-result]');
    output.innerHTML=result?'<b>相較現金少付 NT$'+number(result.saving)+'；每酒店點抵用約 NT$'+number(result.valuePerMile)+'</b><p>'+(result.versusAlternative===null?'替代用途價值未填，先不判斷轉點是否勝過原用途。':'扣除你填入的銀行點數替代用途後，淨差額 NT$'+number(result.versusAlternative)+'。')+'</p><small>負數代表點數方案比比較基準多付。不同酒店每點價值與原銀行投入比例不同，不能只比較點數大小。</small>':'請完整填入非負金額及大於0的點數；未填不當作零。';
  });
}
