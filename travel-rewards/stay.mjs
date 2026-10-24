const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const item=(id,label,state,detail)=>({id,label,state,detail});
const yes=(id,label,detail='仍須本人入住、同名帳戶與合格房價。')=>item(id,label,'yes',detail);
const no=(id,label,detail)=>item(id,label,'no',detail);
const pending=(id,label,detail)=>item(id,label,'pending',detail);
const paid=yes('paid','已確認的合格付費房價');
const rewardNo=no('reward','全額點數獎勵住宿','此挑戰明文排除獎勵住宿。');
const cashNo=no('cash-points','點數＋現金獎勵房','此合作的獎勵住宿排除包括點數＋現金。');
const certNo=no('certificate','免費住宿券／免房券','此合作明文排除免費住宿獎勵。');
const otaNo=no('ota','一般OTA／未認可第三方房價','一般第三方管道不屬合格房價；特殊認可代理須個別確認。');
const direct=yes('direct','官方／已確認合格管道');
const actual=yes('actual','本人實住一間房的晚數');
const bonusNo=no('bonus','信用卡／活動贈送資格房晚','這裡要求實住，贈送ENC／TQN不能代替。');
const parallelNo=no('parallel','同日多間房重複計晚','本人同日多房不當作多個實住晚。');
const period=yes('within','登錄／核准後，完整在期限內完成');
const beforeNo=no('before','登錄／核准前已完成的住宿','不能追溯取代登錄／核准後的挑戰晚數。');
const crossPending=pending('cross','跨登錄日或截止日的連住','未取得明確拆晚條款；請拿實際入住／退房日期書面確認。');
const publicUnknown='未取得適用本人帳戶的完整挑戰條款，不能套用正常定級或別家合作的認列方式。';
const field=(id,label,options)=>({id,label,options});
const normalBrands=[yes('standard','已確認參與的一般品牌','一般每合格晚1 ENC；仍依該品牌與地區條款。'),yes('mea','萬豪行政公寓 MEA','2026/2/12起，每個合格晚1 ENC；與JAL挑戰不同。'),yes('apartments','Apartments by Marriott Bonvoy','此品牌與Marriott Executive Apartments不同，請核對酒店正式品牌。'),yes('half','City Express／Four Points Flex／Protea','每合格晚0.5 ENC，不能一晚當一ENC。'),no('studiores','StudioRes','目前不累積資格房晚。'),pending('series','Series by Marriott','美加及大中華區與其他市場的額度不同；先核對酒店所在地。'),no('nonparticipating','不參與會員計畫的酒店','非參與酒店不計。')];
const challengeBrands=[yes('standard','已確認參與的普通酒店'),pending('mea','萬豪行政公寓 MEA','新航完整合作條款未見明文排除，也不足以確認個別MEA住宿一定認列；先書面確認。'),pending('apartments','Apartments by Marriott Bonvoy','不要與MEA混為一談；仍核對該酒店的參與及合格房價。'),no('nonparticipating','不參與會員計畫的酒店','需為參與合作的酒店。')];
const jalBrands=[yes('standard','已確認參與的普通酒店'),no('mea','萬豪行政公寓 MEA','JAL×萬豪合作條款第5款明文排除。'),no('bulgari','Bulgari Hotels & Resorts','此合作明文排除。'),no('yacht','The Ritz-Carlton Yacht Collection','此合作明文排除。'),no('owner','列名度假品牌的業主自住','MVC、Grand Residences／Grand Residence Club、Sheraton／Westin Vacation Club、Ritz-Carlton Club、St. Regis／Luxury Collection Residence Club的業主自住排除；不是把所有現金住宿一概排除。'),pending('homes','Homes & Villas／其他特殊品牌','本次排除清單未逐一列出所有特殊產品；不擅自視為已接受或明文排除。'),no('nonparticipating','不參與會員計畫的酒店','非參與酒店不計。')];
const hotelBrands=[yes('participating','已確認本方案接受的參與酒店'),pending('unknown-brand','品牌／物業尚未確認','未找到逐品牌完整接受清單，不以集團名稱保證所有住宿都計入。')];
const rates=[paid,rewardNo,cashNo,certNo];
const channels=[direct,otaNo,pending('agent','旅行社／特殊公司管道','要確認實際房價是否合格，不只看訂房網站名稱。')];
const credits=[actual,bonusNo,parallelNo];
const times=[period,beforeNo,crossPending];
const baseFields=(brands=challengeBrands,rateOptions=rates,channelOptions=channels,creditOptions=credits,timeOptions=times)=>[field('brand','品牌／物業',brands),field('rate','房價種類',rateOptions),field('channel','訂房管道',channelOptions),field('credit','計入的是什麼',creditOptions),field('time','住宿時間',timeOptions)];
export const STAY_POLICIES=[
  {id:'mb-normal',name:'萬豪正常曆年定級',headline:'MEA：2026/2/12起，合格一晚計1 ENC',note:'金卡25／白金50個資格房晚。這是正常定級，不能拿來證明任何挑戰一定接受。舊品牌介紹仍有3晚計1的文字差異。',sources:['stay-mb-terms','stay-mb-enc','stay-mea-old'],matrix:['MEA 合格晚1 ENC','獎勵實住可計','依品牌／促銷條款','曆年累積'],fields:baseFields(normalBrands,[paid,yes('reward','合格全額點數獎勵住宿','一般合格獎勵實住可計正常ENC，StudioRes等例外仍適用。'),yes('cash-points','合格點數＋現金獎勵住宿'),yes('certificate','合格免房券實住')],channels,[actual,yes('bonus','信用卡／活動資格房晚','只有該卡／活動明確贈送的ENC按其條款計；獎勵點數不等於ENC。'),parallelNo],[yes('within','在目標曆年完成的合格住宿'),pending('cross','跨曆年連住','依會員條款、退房與實際入帳核對，不自行拆算。')])},
  {id:'mb-sq',name:'新航×萬豪3／10晚挑戰',headline:'MEA：尚待個別確認，不能套用JAL的排除',note:'新航銀卡3晚至萬豪銀卡；Gold／PPS等10晚至白金，均為登錄後六個月的合格付費實住。正常ENC與此晚數分開。',sources:['marriott-krisflyer-terms','stay-sq-faq','stay-sq-pdf'],matrix:['MEA 待書面確認','點數／點現／免房券排除','贈送ENC不能代替','登錄後6個月'],fields:baseFields()},
  {id:'mb-jal',name:'JAL×萬豪合作挑戰',headline:'MEA：明文排除；一般定級能計，不代表這裡能計',note:'Bulgari、麗思遊艇、不參與酒店及指定度假品牌業主自住亦排除。依JAL等級分別4／6／10晚；所有房晚仍須合格付費本人實住。',sources:['partner-jal-terms','partner-jal-main','network-jal-faq'],matrix:['MEA 明文排除','點數／點現／免房券排除','贈送ENC不能代替','登錄後6個月'],fields:baseFields(jalBrands)},
  {id:'mb-public',name:'萬豪一般客服挑戰',headline:'先拿到本人帳戶條款，再決定住哪一家',note:publicUnknown,sources:['marriott-challenge-tripplus','stay-mb-terms'],matrix:['MEA 待核准文件','房價待核准文件','不可套正常定級','本人核准起迄'],fields:baseFields([pending('mea','萬豪行政公寓 MEA',publicUnknown),pending('other','其他酒店品牌',publicUnknown)],[pending('paid','付費房價',publicUnknown),pending('reward','點數／點現／免房券',publicUnknown)],[pending('direct','官方或其他管道',publicUnknown)],[pending('actual','實住或贈送房晚',publicUnknown)],[pending('within','住宿與核准起迄',publicUnknown)])},
  {id:'mb-corporate',name:'萬豪企業／定向挑戰',headline:'公司與帳戶資格、品牌及房價以個別核准為準',note:publicUnknown,sources:['stay-mb-terms'],matrix:['MEA 待核准文件','房價待核准文件','不可套其他挑戰','本人核准起迄'],fields:baseFields([pending('mea','萬豪行政公寓 MEA',publicUnknown),pending('other','其他酒店品牌',publicUnknown)],[pending('paid','付費房價',publicUnknown),pending('reward','點數／點現／免房券',publicUnknown)],[pending('direct','官方或其他管道',publicUnknown)],[pending('actual','實住或贈送房晚',publicUnknown)],[pending('within','住宿與核准起迄',publicUnknown)])},
  {id:'hilton',name:'Hilton公開會籍配對挑戰',headline:'獎勵住宿排除；先核准，再開始90日計時',note:'6晚維持Gold、共12晚升Diamond。免房券、Points & Money及活動贈晚未在公開FAQ逐項說明，保持待核。',sources:['hilton-match-faq'],matrix:['完整品牌清單待核','Reward Stay排除；點現／券待核','活動贈晚未完整說明','核准後90日'],fields:baseFields(hotelBrands,[paid,rewardNo,pending('cash-points','Points & Money','公開挑戰FAQ未逐項說明此類住宿；先核對實際房價。'),pending('certificate','免房券','不能因正常定級可算，就直接認為挑戰可算。')],channels,[actual,pending('bonus','活動／其他贈送房晚','公開FAQ沒有逐項接受此來源，需以挑戰認列確認。'),parallelNo],times)},
  {id:'scandic',name:'Scandic四晚挑戰線索',headline:'四晚、房價及訂房條件尚缺完整當期核准',note:'目前查到一般Scandic Friends與SAS合作，未取得可證明台灣會員可用的BW四晚挑戰完整條款。',sources:['stay-scandic','tree-scandic-sas'],matrix:['品牌待本人核准','房價／點數住宿待核','實住規則待核','起迄／追溯待核'],fields:baseFields([pending('other','Scandic酒店',publicUnknown)],[pending('paid','現金付費',publicUnknown),pending('reward','點數或其他房價',publicUnknown)],[pending('direct','官方或其他管道',publicUnknown)],[pending('actual','實住或贈送房晚',publicUnknown)],[pending('within','登錄前後／跨期限住宿',publicUnknown)])},
  {id:'hyatt-ap',name:'Aeroplan→Hyatt住宿挑戰',headline:'90日4／10／20實住資格晚；整段住宿須於期限內退房',note:'包括參與Hyatt、Mr & Mrs Smith，及經Hyatt合格管道的Venetian。一般Aeroplan高階每曆年一次，指定高階主卡兩次；卡片贈TQN不算實住。',sources:['stay-hyatt-aeroplan','stay-hyatt-tqn'],matrix:['指定Hyatt／MMS／Venetian','獎勵實住依TQN定義，逐筆核對','卡片／促銷贈晚排除','整段須於90日內退房'],fields:baseFields([yes('hyatt','合格Hyatt參與酒店'),yes('mms','合格Mr & Mrs Smith住宿'),yes('venetian','經Hyatt合格管道的Venetian'),pending('other','其他物業','必須確認屬本活動接受的TQN。')],[paid,pending('reward','合格免費獎勵實住','活動引用一般TQN定義；官方索引包含免費獎勵實住，但定義正文擷取受限，個別預訂仍核對。'),pending('cash-points','點數＋現金／其他房價','先確認這筆住宿是否屬一般TQN，不套用萬豪的排除規則。')],channels,credits,[period,beforeNo,no('late-checkout','退房日在90日期限外','活動要求整段住宿於期限內退房；整段不計。'),crossPending])},
  {id:'hyatt-corporate',name:'Hyatt 2026企業試用／快軌',headline:'登錄前已訂住宿排除；需真實指定公司資格',note:'90日10晚保冒險家、20晚環球客；達標等級至2028/2/29。不能把Aeroplan的全部品牌條款套到此企業案。',sources:['stay-hyatt-corporate'],matrix:['個別參與酒店／房價另核','按此活動TQN定義核對','卡片／促銷贈晚排除','90日內退房；先訂後登排除'],fields:[...baseFields(hotelBrands,[paid,pending('reward','免費獎勵／特殊房價','先核對此企業案TQN及預訂本身；不直接套別家活動。')],channels,credits,[period,beforeNo,no('late-checkout','退房日在期限外','要求在優惠期間內完成退房。'),crossPending]),field('booking','預訂時間',[yes('after','登錄後才預訂'),no('before','登錄前已經預訂','本活動明文排除已預訂／保留的既有住宿。')])]},
  {id:'ihg-visa',name:'IHG×Visa指定海外發卡快軌',headline:'台灣發卡不在當期名單；不要先訂房才驗卡',note:'御璽2晚Gold、無限6晚Platinum。確認信起90日，最晚2027/4/10；房價至少每晚30美元且須指定訂房入口。',sources:['stay-ihg-visa'],matrix:['台灣發卡不適用此案','獎勵房／Points&Cash排除','同日多房只計本人一房','確認信起90日，另有最晚期限'],fields:[field('market','發卡市場',[no('tw','台灣發卡','當期列名亞太市場未含台灣，台灣Visa無限卡也不能替代。'),yes('listed','已確認指定海外市場及卡別','包括新、馬、泰、斯里蘭卡、韓、菲、越、緬、柬、澳、紐與指定南太平洋市場；仍須驗卡。')]),...baseFields(hotelBrands,[yes('paid','合格房價且每晚至少30美元'),no('low','每晚低於30美元','不符最低合格房價。'),rewardNo,cashNo,pending('certificate','免房券／特殊房價','以這次活動及指定入口是否接受為準。')],[yes('direct','經本活動指定訂房入口'),otaNo,pending('other','官網但非活動指定入口','本案要求指定入口，需核對是否可認列。')],credits,times)]}
];
export function evaluateStay(policyId,choices={}){
  const policy=STAY_POLICIES.find(item=>item.id===policyId);
  if(!policy)return {state:'pending',notes:['尚未選擇方案。']};
  const results=policy.fields.map(field=>({field,...(field.options.find(option=>option.id===choices[field.id])||{state:'pending',detail:'尚未選擇「'+field.label+'」。'})}));
  const state=results.some(item=>item.state==='no')?'excluded':results.some(item=>item.state==='pending')?'pending':'conditional';
  return {state,notes:results.filter(item=>item.state!=='yes').map(item=>item.field.label+'：'+item.detail),results};
}
const links=(ids,sources)=>ids.map(id=>sources.find(source=>source.id===id)).filter(Boolean).map(source=>'<a href="'+esc(source.url)+'" target="_blank" rel="noopener noreferrer">'+esc(source.publisher)+' ↗</a>').join(' · ');
function resultMarkup(result){
  return '<b class="stay-verdict '+result.state+'">'+({excluded:'所選情況有明確排除',pending:'還有條件待確認',conditional:'所選項目未見明確排除'}[result.state])+'</b><ul>'+result.notes.map(note=>'<li>'+esc(note)+'</li>').join('')+'</ul><p>只檢查此方案的住宿規則；不代表會員／卡片資格通過、官方核准或保證入帳。</p>';
}
export function stayChecker(policyId,sources=[],allowSwitch=true){
  const policy=STAY_POLICIES.find(item=>item.id===policyId)||STAY_POLICIES[0];
  return '<div class="stay-checker" data-stay-checker="'+policy.id+'">'+(allowSwitch?'<label class="stay-policy-label">要走哪一個方案<select data-stay-policy>'+STAY_POLICIES.map(item=>'<option value="'+item.id+'" '+(item.id===policy.id?'selected':'')+'>'+esc(item.name)+'</option>').join('')+'</select></label>':'')+'<div class="stay-callout"><b>'+esc(policy.headline)+'</b><p>'+esc(policy.note)+'</p></div><div class="stay-fields">'+policy.fields.map(field=>'<label>'+esc(field.label)+'<select data-stay-field="'+field.id+'"><option value="">不確定／尚未選擇</option>'+field.options.map(option=>'<option value="'+option.id+'">'+esc(option.label)+'</option>').join('')+'</select></label>').join('')+'</div><div class="stay-result" role="status" aria-live="polite">'+resultMarkup(evaluateStay(policy.id))+'</div><p class="stay-source-links">查核依據：'+links(policy.sources,sources)+'</p></div>';
}
export function stayNodeSummary(policyId,sources=[]){
  const policy=STAY_POLICIES.find(item=>item.id===policyId);if(!policy)return '';
  return '<section class="tree-detail-section stay-node"><h3>這一晚算不算？</h3><p><b>'+esc(policy.headline)+'</b></p><p>'+esc(policy.note)+'</p><details><summary>選品牌、房價與時間，檢查排除</summary>'+stayChecker(policy.id,sources,false)+'</details></section>';
}
export function stayHub(sources=[]){
  return '<details class="stay-hub" id="stay-rules"><summary><span>訂房前，先查這晚算不算</span><small>10種方案 · 品牌、獎勵房、贈送房晚與登錄時間</small></summary>'+stayChecker('mb-jal',sources)+'<details class="stay-matrix"><summary>並排比較10種認列規則</summary><div class="table-wrap"><table><thead><tr><th>方案</th><th>品牌限制</th><th>獎勵房</th><th>贈送／重複房晚</th><th>時間</th></tr></thead><tbody>'+STAY_POLICIES.map(item=>'<tr><th>'+esc(item.name)+'</th>'+item.matrix.map(text=>'<td>'+esc(text)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p>各格只表示其所屬方案；不同計畫不可互相套用。查核日2026/10/24，待核不視為接受。</p></details></details>';
}
export function wireStayTools(root,sources=[]){
  root.addEventListener('change',event=>{
    if(event.target.matches('[data-stay-policy]')){const holder=event.target.closest('[data-stay-checker]');holder.outerHTML=stayChecker(event.target.value,sources);}
    else if(event.target.matches('[data-stay-field]')){const holder=event.target.closest('[data-stay-checker]'),choices=Object.fromEntries([...holder.querySelectorAll('[data-stay-field]')].map(input=>[input.dataset.stayField,input.value]));holder.querySelector('.stay-result').innerHTML=resultMarkup(evaluateStay(holder.dataset.stayChecker,choices));}
  });
}
