import {EXT_RESOURCES,EXT_FACTS,EXT_OPPORTUNITIES,EXT_SOURCES,EXT_RULES,EXT_COVERAGE} from './extensions-data.mjs?v=20261031-3';
import {HOTEL_RESOURCES,HOTEL_FACTS,HOTEL_OPPORTUNITIES,HOTEL_SOURCES,HOTEL_RULES,HOTEL_COVERAGE} from './hotel-partners-data.mjs?v=20261031-3';
import {BANK_RESOURCES,BANK_OPPORTUNITIES,BANK_SOURCES,BANK_RULES} from './bank-entries-data.mjs?v=20261031-3';
import {IH_SOURCES,IH_RESOURCES,IH_FACTS,IH_OPPORTUNITIES,IH_RULES,IH_COVERAGE,IH_COVERAGE_UPDATES} from './ihg-hyatt-data.mjs?v=20261031-3';
const resource=(id,label,group,extra={})=>({id,label,group,...extra});
export const RESOURCES=[
  resource('amex-platinum-charge','運通簽帳白金卡','信用卡'),resource('amex-eva-platinum-card','長榮運通簽帳白金卡','信用卡'),resource('amex-gold-current','運通耀金卡','信用卡'),resource('amex-eva-gold-card','長榮運通簽帳金卡','信用卡'),resource('amex-platinum-credit','運通信用白金卡','信用卡'),resource('amex-regent','運通晶華珍饌白金卡','信用卡'),resource('amex-charge','運通簽帳卡','信用卡'),
  resource('ctbc-ci-priority','華航鼎尊無限卡','信用卡'),resource('ctbc-ci-precious','華航璀璨無限卡','信用卡'),resource('ctbc-ci-signature','華航商務御璽卡','信用卡'),resource('ctbc-marriott-priority','萬豪鼎尊無限卡','信用卡'),resource('ctbc-marriott-infinite','萬豪無限卡','信用卡'),resource('ctbc-marriott-signature','萬豪御璽卡','信用卡'),resource('ctbc-marriott-priority-limited','萬豪鼎尊無限卡限量版','信用卡',{note:'原申請梯次已截止；原持卡者可選'}),resource('visa-infinite','其他 Visa 無限卡','信用卡'),resource('mc-elite','Mastercard 世界之極','信用卡'),
  resource('mb-base','萬豪一般會員','酒店會籍',{exclusive:'marriott'}),resource('mb-silver','萬豪銀卡','酒店會籍',{exclusive:'marriott'}),resource('mb-gold','萬豪金卡','酒店會籍',{exclusive:'marriott'}),resource('mb-platinum','萬豪白金以上','酒店會籍',{exclusive:'marriott'}),
  resource('hh-base','Hilton 一般會員','酒店會籍',{exclusive:'hilton'}),resource('hh-silver','Hilton 銀卡','酒店會籍',{exclusive:'hilton'}),resource('hh-gold','Hilton 金卡','酒店會籍',{exclusive:'hilton'}),resource('hh-diamond','Hilton 鑽卡','酒店會籍',{exclusive:'hilton'}),
  resource('gha-titanium','GHA 鈦金','酒店會籍'),resource('wyndham-diamond','Wyndham 鑽卡','酒店會籍'),resource('bw-diamond','BW 鑽石／精選鑽石','酒店會籍'),resource('scandic-five','Scandic 第5級','酒店會籍'),resource('radisson-premium','Radisson Premium','酒店會籍'),
  resource('sq-member','新航一般會員','航空會籍',{exclusive:'krisflyer'}),resource('sq-silver','新航菁英銀卡','航空會籍',{exclusive:'krisflyer'}),resource('sq-gold','新航菁英金卡／PPS','航空會籍',{exclusive:'krisflyer'}),resource('sas-gold','SAS 金卡','航空會籍'),resource('tk-elite','土航 Elite／Elite Plus','航空會籍'),resource('ci-gold','華夏金卡','航空會籍'),
  resource('amex-mr','台灣運通 MR 積分','點數與帳戶'),resource('hsbc-travel','滙豐旅人旅遊積分','點數與帳戶'),resource('dbs-fly','星展飛行積金','點數與帳戶'),resource('marriott-points','萬豪獎勵點數','點數與帳戶'),resource('hilton-points','Hilton 獎勵點數','點數與帳戶'),resource('all-account','ALL 帳戶','點數與帳戶'),resource('qatar-account','Qatar Privilege Club 帳戶','點數與帳戶'),resource('all-points','ALL 獎勵點數','點數與帳戶'),resource('avios','Qatar Avios','點數與帳戶'),resource('eva-miles','長榮可兌換哩程','點數與帳戶'),resource('ci-miles','華夏哩程','點數與帳戶')
];
export const FACTS=[
  {id:'marriottSource',label:'萬豪會籍如何取得',options:[['earned','正常累積／已完成挑戰'],['card','信用卡贈送'],['matched','其他配對'],['trial','試用／尚未完成挑戰']]},
  {id:'partnerUsed',label:'萬豪×新航合作是否已登錄過',options:[['no','尚未登錄'],['yes','已登錄過']]},
  {id:'otherSqChallenge',label:'是否正參加其他新航會籍挑戰',options:[['no','沒有'],['yes','有']]},
  {id:'hiltonUsed',label:'是否參加過 Hilton 公開配對',options:[['no','沒有'],['yes','有']]},
  {id:'competitorStay',label:'是否有其他酒店近24個月住宿證明',options:[['yes','有'],['no','沒有']]},
  {id:'allOtherLinked',label:'ALL 是否連結其他航空雙重累積',options:[['no','沒有'],['recent','有，距前次連結未滿12個月'],['old','有，已滿12個月']]},
  {id:'evaRenewal',label:'長榮運通白金是否已到續卡年度並繳費',options:[['yes','已確認'],['no','尚未符合']]},
  {id:'evaSpend',label:'前一年度長榮運通合格消費是否滿120萬',options:[['yes','已確認'],['no','尚未符合']]},
  {id:'mbSpend150',label:'萬豪鼎尊本信用卡年度合格消費滿150萬',options:[['yes','已確認'],['no','尚未符合']]},
  {id:'mbSpend100',label:'萬豪無限卡本信用卡年度合格消費滿100萬',options:[['yes','已確認'],['no','尚未符合']]}
];
const condition=(fact,allowed,label)=>({fact,allowed,label});
const sqConditions=[condition('partnerUsed',['no'],'尚未使用萬豪×新航一次性合作登錄'),condition('otherSqChallenge',['no'],'沒有其他新航配對挑戰進行中')];
const mrCards=['amex-platinum-charge','amex-gold-current','amex-platinum-credit','amex-regent','amex-charge','amex-mr'];
const hotels=['mb-gold','mb-platinum','gha-titanium','wyndham-diamond','bw-diamond'];
const op=(id,title,goal,tree,node,extra={})=>({id,title,goal,tree,node,any:[],all:[],conditions:[],research:'partial',...extra});
export const OPPORTUNITIES=[
  op('P001','可轉銀行點數 → 航空獎勵票','flight','points-air','airline-miles',{any:mrCards}),
  op('P002','華航卡 → 華夏哩程 → 獎勵票','flight','ci-card','ci-award',{any:['ctbc-ci-priority','ctbc-ci-precious','ctbc-ci-signature']}),
  op('P003','長榮運通白金 → 續卡升等券','flight','points-air','eva-upgrade',{all:['amex-eva-platinum-card'],conditions:[condition('evaRenewal',['yes'],'已到續卡年度並繳費'),condition('evaSpend',['yes'],'前一年度合格消費滿120萬元')]}),
  op('P004','運通簽帳白金 → 酒店會籍','status','amex-hotels','amex-mb-gold',{any:['amex-platinum-charge','amex-eva-platinum-card']}),
  op('P005','萬豪白金以上 → 新航金卡挑戰','status','marriott-sq','sq-gold',{all:['mb-platinum'],conditions:[...sqConditions,condition('marriottSource',['earned','card','matched'],'萬豪非試用會籍')],forbidden:['sq-gold'],warning:'信用卡或配對來源仍須個別核准；不把已獲白金當成新航必收。'}),
  op('P006','新航金卡／PPS → 萬豪白金挑戰','status','marriott-sq','mb-plat-target',{all:['sq-gold'],any:['mb-base','mb-silver','mb-gold'],forbidden:['mb-platinum'],conditions:sqConditions}),
  op('P007','其他酒店會籍＋住宿證明 → Hilton 挑戰','status','amex-hotels','hh-challenge',{any:hotels,allGroups:[['hh-base','hh-silver']],forbidden:['hh-gold','hh-diamond'],conditions:[condition('hiltonUsed',['no'],'未用過Hilton公開配對'),condition('competitorStay',['yes'],'其他酒店近24個月住宿證明')],research:'conflict',warning:'公開FAQ與B2B附註範圍不同；來源品牌接受清單及帳戶仍待核。'}),
  op('P008','一般萬豪金卡／白金客服挑戰','status','marriott-entry','mb-public',{research:'lead',warning:'八／十六晚僅是報導線索，先取得本人帳戶書面核准。'}),
  op('P009','卡組織 → 酒店配對 → SAS','status','sas-chain','sas',{any:['visa-infinite','mc-elite','gha-titanium','wyndham-diamond','bw-diamond','scandic-five','ctbc-ci-priority','ctbc-ci-precious'],research:'lead',warning:'BW至Scandic挑戰未核實；每一段須接受上段來源。'}),
  op('P010','中信萬豪限量白金版原梯次','status','marriott-card','mb-limited',{research:'closed',warning:'新件收件已於2026-10-15截止；已持卡者依原核准條件，不能當作現在仍可申請。'}),
  op('P011','ALL×Qatar 合格活動雙重累積','hotel','all-qatar','dual-rewards',{all:['all-account','qatar-account'],conditions:[condition('allOtherLinked',['no','old'],'ALL未受其他航空的12個月連結限制')],warning:'連結、合格住宿與合格飛行各有條件；既有連結滿12個月也須先核對解除與改連程序。'}),
  op('P012','萬豪金卡 → 新航銀卡挑戰','status','marriott-sq','sq-silver',{all:['mb-gold'],forbidden:['mb-platinum','sq-silver','sq-gold'],conditions:[...sqConditions,condition('marriottSource',['earned','card','matched'],'萬豪非試用會籍')],warning:'先用Gold分支會消耗合作登錄；不要假設日後白金可重登四趟分支。'}),
  op('P013','華航無限卡 → 首次華夏金卡','status','ci-card','ci-gold',{any:['ctbc-ci-priority','ctbc-ci-precious'],warning:'正附卡、首次、年費與首刷條件另核；華夏金卡不是新航金卡。'}),
  op('H001','台灣 MR → 萬豪點數','hotel','points-hotel','mr-marriott',{any:mrCards,warning:'轉點不產生會籍或資格房晚；台灣比例與海外不同。'}),
  op('H002','台灣 MR → Hilton 點數','hotel','points-hotel','mr-hilton',{any:mrCards}),
  op('H003','滙豐旅人積分 → ALL','hotel','points-hotel','hsbc-all',{all:['hsbc-travel'],research:'conflict',warning:'銀行操作最低3,000、500單位；ALL介紹文字仍有不同，不採1,000作可操作門檻。'}),
  op('N001','萬豪鼎尊 → 年消費150萬 → 白金','status','marriott-card','mb-spend-platinum',{any:['ctbc-marriott-priority','ctbc-marriott-priority-limited'],conditions:[condition('mbSpend150',['yes'],'本信用卡年度正卡合格消費滿150萬元')],warning:'信用卡年度不等於曆年；名下所有消費不可未經確認合併。'}),
  op('N002','萬豪無限 → 年消費100萬 → 金卡','status','marriott-card','mb-spend-gold',{all:['ctbc-marriott-infinite'],conditions:[condition('mbSpend100',['yes'],'本信用卡年度正卡合格消費滿100萬元')]}),
  op('N003','萬豪正常資格累積 → 金卡／白金','status','marriott-entry','mb-earned',{any:['mb-base','mb-silver','mb-gold'],forbidden:['mb-platinum'],warning:'Gold25、Platinum50資格房晚；每個實住晚不一定等於1資格房晚。'}),
  op('N004','萬豪企業／定向專案','status','marriott-entry','mb-corporate',{research:'lead',warning:'須真實僱用或定向邀請資格，公開連結不代表人人適用。'}),
  op('N005','運通簽帳白金 → Radisson Premium','status','amex-hotels','amex-radisson',{any:['amex-platinum-charge','amex-eva-platinum-card']}),
  op('N006','滙豐旅人積分 → 萬豪／IHG','hotel','points-hotel','hsbc-hotels',{all:['hsbc-travel']}),
  op('N007','萬豪點數 → 航空夥伴','flight','points-air','marriott-air',{all:['marriott-points'],warning:'多數3:1但有例外；最低量、加碼、每日上限及接收帳戶逐家核對。'}),
  op('N009','星展飛行積金 → 四家航空','flight','points-air','dbs-airlines',{all:['dbs-fly']}),
  op('N008','ALL與Avios雙向兌換','hotel','all-qatar','qatar-to-all',{any:['all-points','avios'],warning:'兩方向有不同損耗且各自不可逆；不能當作等值往返。'})
];
export const NETWORK_SOURCES=[
  {id:'network-radisson',publisher:'台灣美國運通',ownership_group:'amex',kind:'official',url:'https://www.americanexpress.com/zh-tw/benefits/travel/hotels/the-platinum-card/radisson-rewards/',access:'live_browser_expanded_terms',checked_on:'2026-10-24',note:'完整頁面及展開條款已讀。簽帳白金／長榮航空簽帳白金可另申請Premium；美國地址不受理，停卡或帳戶異常可取消。'},
  {id:'network-mb-spend',publisher:'中國信託',ownership_group:'ctbc',kind:'official',url:'https://mkt.ctbcbank.com/long/creditcard/Marriott/index.html',access:'live_browser_activity_modal',checked_on:'2026-10-24',note:'消費升等彈窗已讀：鼎尊正卡每信用卡年度150萬元升白金；一般無限卡100萬元升金卡。核卡起12個月、續卡重算；不是曆年。'},
  {id:'network-mb-terms',publisher:'Marriott Bonvoy',ownership_group:'marriott',kind:'official',url:'https://www.marriott.com/zh-hk/loyalty/terms/default.mi',access:'page_body',checked_on:'2026-10-24',note:'正常資格條款已讀：曆年25／50資格房晚對應金／白金；部分品牌每晚只計0.5資格房晚，StudioRes不計。獎勵住宿與挑戰認列須分開。'},
  {id:'network-all-hsbc-terms',publisher:'Accor ALL',ownership_group:'accor',kind:'official',url:'https://all.accor.com/a/en/loyalty-program/partners/conditions/hsbctaiwan.html',access:'page_body',checked_on:'2026-10-24',note:'合作條款已讀；銀行轉入是Reward points，不計升等／保級。銀行操作頁最低3,000、500單位，保留ALL介紹的不同文字。'},
  {id:'network-all-qatar-terms',publisher:'Qatar Airways',ownership_group:'qatar',kind:'official',url:'https://www.qatarairways.com/en/Privilege-Club/terms-and-conditions/accor-account-linking.html',access:'page_body',checked_on:'2026-10-24',note:'專屬條款已讀；ALL通常同時只能連一航空，改連須距前次連結12個月。合格活動、轉點兩方向比例與不可逆性各自適用。'},
  {id:'network-mb-air',publisher:'Marriott Bonvoy',ownership_group:'marriott',kind:'official',url:'https://www.marriott.com/loyalty/redeem/travel/points-to-miles.mi',access:'page_body',checked_on:'2026-10-24',note:'航空轉點入口及夥伴表已讀；多數3:1，紐航等例外，尚未逐家核對所有最低量、加碼、每日上限及入帳。'},
  {id:'network-sq-financial',publisher:'Singapore Airlines',ownership_group:'sia',kind:'official',url:'https://www.singaporeair.com/en_UK/tw/ppsclub-krisflyer/earn-miles/earn-on-the-ground/financial-services-partners/',access:'page_body',checked_on:'2026-10-24',note:'DBS台灣1飛行積金對1KrisFlyer及同名條件互核；Amex台灣適用市場亦列出，精確比例仍以台灣Amex為準。操作入口採銀行現頁。'},
  {id:'network-cathay-mr',publisher:'Cathay Pacific',ownership_group:'cathay',kind:'official',url:'https://www.cathaypacific.com/cx/en_US/our-partners/american-express-taiwan.html',access:'page_body',checked_on:'2026-10-24',note:'航空端台灣Amex夥伴頁確認1:1；不能據此把全部航空或酒店門檻都視為雙方完整互核。'}
];
const rule=(id,type,summary,source_ids,values,missing=[])=>({id,type,summary,source_ids,values,missing,evidence_status:'selected_primary_terms_verified_gaps_remain',checked_on:'2026-10-24',validity:{effective_from:null,effective_until:null},recommendation_ready:false});
export const NETWORK_RULES=[
  rule('R067','status_from_card','台灣兩張運通簽帳白金可另申請Radisson Premium。',['network-radisson'],{application_required:true,us_address_excluded:true},['帳戶核准、實際生效及其他地區條件仍需確認。']),
  rule('R068','card_status_spend','中信萬豪鼎尊每信用卡年度150萬元升白金；一般無限100萬元升金卡。',['network-mb-spend'],{priority_platinum_spend_twd:1500000,infinite_gold_spend_twd:1000000,calendar_year:false},['合格消費定義、個別信用卡年度與續年規則須核對。']),
  rule('R069','status_qualification','萬豪正常金／白金分別需曆年25／50資格房晚，實住晚認列依品牌。',['network-mb-terms'],{gold_enc:25,platinum_enc:50,all_brands_one_night_one_enc:false},['不能直接套作一次性合作或客服挑戰的合格實住晚數。']),
  rule('R070','partner_link_conflict','ALL改連Qatar雙重累積通常受12個月既有連結限制。',['network-all-qatar-terms'],{minimum_months_since_previous_link:12},['跨洲遷居例外及個別解除／重連程序需客服確認。']),
  rule('R071','reward_vs_status','銀行轉入ALL的Reward points不計升等或保級。',['network-all-hsbc-terms'],{bank_reward_points_are_status_points:false}),
  rule('R072','point_transfer','ALL與Qatar轉點兩方向比例不同且各自不可逆。',['network-all-qatar-terms'],{all_to_avios_in:2000,all_to_avios_out:1500,avios_to_all_in:3500,avios_to_all_out:1000,reverse_cancels_transfer:false},['最低量、帳戶資格、上限與個別入帳依合作條款。']),
  rule('R074','point_transfer','旅人旅遊積分現期可按1:1轉ALL、萬豪、IHG；卓越紅利另為2:1。',['hsbc-hotel'],{traveller_ratio:1,premier_ratio_in:2,minimum_traveller_input:3000,increment:500},['正卡同名及各酒店轉入限制另核；銀行與ALL介紹文字差異仍保留。']),
  rule('R073','point_transfer','萬豪點數可轉航空夥伴，多數3:1但有例外。',['network-mb-air'],{all_partners_same_ratio:false,all_partners_same_bonus:false},['逐航空最低量、加碼例外、每日上限及入帳未全核。'])
];

export const NETWORK_COVERAGE=[
  {id:'marriott-card-spend-upgrades',name:'萬豪卡信用卡年度消費升等',category:'status_acquisition_opportunity',priority:'P0',scope:'已讀指定欄位；仍須個別卡片與消費資格',research_status:'selected_fields_verified_gaps_remain',source_ids:['network-mb-spend'],rule_ids:['R068'],note:'鼎尊150萬白金、一般無限100萬金卡；不套御璽、不用曆年代替。'},
  {id:'marriott-normal-enc',name:'萬豪正常資格房晚與各品牌認列',category:'status_acquisition_opportunity',priority:'P1',scope:'正常定級與一次性挑戰分開',research_status:'selected_fields_verified_gaps_remain',source_ids:['network-mb-terms'],rule_ids:['R069'],note:'25／50合格房晚額度；部分品牌非每實住晚計1。'},
  {id:'marriott-jal-partnership',name:'JAL×萬豪合作（新發現，待完整互核）',category:'status_acquisition_opportunity',priority:'P1',scope:'研究候選；不代表台灣帳戶已適格',research_status:'queued',source_ids:['network-jal-faq'],rule_ids:[],note:'已發現官方入口；JAL端、等級、來源、居住及一次性／年度條件未完整互核，不接成已確認路線。'}
];
NETWORK_SOURCES.push({id:'network-jal-faq',publisher:'Marriott Bonvoy',ownership_group:'marriott',kind:'official',url:'https://travel-partner.marriott.com/japan-airlines/en-gb/faqs',access:'official_indexed_lead',checked_on:'2026-10-24',note:'新發現的合作入口，尚未完成JAL端與來源／居住資格互核；僅列研究候選。'});

export const NETWORK_COVERAGE_UPDATES={
  'network-benefits':{research_status:'partial_sources_found',source_ids:['tree-visa-gha','tree-mc-gha','tree-mc-wyndham'],note:'已查Visa台灣GHA及Mastercard指定卡等；其他卡組織、全部卡片與Wyndham完整條件未全核。'},
  'status-matching':{research_status:'partial_sources_found',source_ids:['bw-match','hilton-match-faq','marriott-krisflyer-terms'],rule_ids:['R019','R034','R060','R063'],note:'已有部分酒店及合作配對條件，尚未完成全部航空、來源及一次性活動普查。'},
  'air-krisflyer':{research_status:'partial_sources_found',source_ids:['network-sq-financial','marriott-krisflyer-terms'],rule_ids:['R060','R061','R062'],note:'本輪有金融夥伴與會籍合作資料；完整兌票、改退與路線仍待查。'},
  'air-cathay':{research_status:'partial_sources_found',source_ids:['network-cathay-mr'],note:'僅補到台灣Amex轉點航空端互核；完整亞洲萬里通兌票與其他入口仍待查。'},
  'other-hotel-challenges':{research_status:'partial_sources_found',source_ids:['tree-sas-scandic','tree-scandic-sas','tree-choice-status','tree-rj-terms'],note:'SAS範例逐段保留待核與來源排除；不代表所有品牌挑戰已普查。'}
};
RESOURCES.find(item=>item.id==='mb-platinum').label='萬豪白金以上（尚未細分）';
RESOURCES.push(...EXT_RESOURCES);
FACTS.push(...EXT_FACTS);
OPPORTUNITIES.push(...EXT_OPPORTUNITIES);
for(const source of EXT_SOURCES){
  const index=NETWORK_SOURCES.findIndex(item=>item.id===source.id);
  if(index<0)NETWORK_SOURCES.push(source);else NETWORK_SOURCES[index]=source;
}
NETWORK_RULES.push(...EXT_RULES);
NETWORK_COVERAGE.push(...EXT_COVERAGE);
Object.assign(NETWORK_COVERAGE.find(item=>item.id==='marriott-jal-partnership'),{name:'JAL×萬豪分級會籍合作',research_status:'selected_fields_verified_gaps_remain',source_ids:['partner-jal-main','partner-jal-terms','network-jal-faq'],rule_ids:['R077','R075'],note:'JAL及萬豪兩側條款已讀，海外會員可參與；MEA等排除與各等級年度次數已列。仍須同名帳戶核准，來源接受及本人年度權益另核。'});
Object.assign(NETWORK_RULES.find(item=>item.id==='R069'),{source_ids:['network-mb-terms','stay-mb-enc','stay-mea-old'],missing:['MEA正常ENC採2026/2/12起1晚1 ENC；舊品牌頁仍有差異。不能套作特定挑戰認列。']});
Object.assign(NETWORK_COVERAGE_UPDATES,{
  'hyatt-corporate-challenge':{research_status:'selected_fields_verified_gaps_remain',source_ids:['stay-hyatt-corporate'],rule_ids:['R084'],note:'2026完整企業優惠已讀，真實公司及本人資格未驗。'},
  'hyatt-partner-challenge':{research_status:'partial_sources_found',source_ids:['stay-hyatt-aeroplan','partner-ap-hyatt'],rule_ids:['R083','R085'],note:'Hyatt×Aeroplan雙向挑戰已補；其他合作仍待查。'},
  'ihg-visa-challenge':{research_status:'selected_fields_verified_gaps_remain',source_ids:['stay-ihg-visa'],rule_ids:['R086'],note:'已讀完整五頁PDF；現期市場未含台灣，其他活動不可泛化。'},
  'cube-family':{research_status:'selected_fields_verified_gaps_remain',source_ids:['cube-details','cube-2027-full'],rule_ids:['R078','R079'],note:'已補18出口、卡別／年度及單位，夥伴端未全部互核。'}
});
RESOURCES.push(...HOTEL_RESOURCES);FACTS.push(...HOTEL_FACTS);
FACTS.splice(FACTS.findIndex(item=>item.id==='allOtherLinked'),1);
OPPORTUNITIES.push(...HOTEL_OPPORTUNITIES);
NETWORK_SOURCES.push(...HOTEL_SOURCES);NETWORK_RULES.push(...HOTEL_RULES);NETWORK_COVERAGE.push(...HOTEL_COVERAGE);
for(const id of ['P011','N008']){
  const item=OPPORTUNITIES.find(op=>op.id===id);item.link={partner:'qatar',required:true};item.conditions=[];
  if(id==='N008')item.all=['all-account','qatar-account'];
}
Object.assign(NETWORK_RULES.find(item=>item.id==='R074'),{source_ids:['hotel-hsbc-q4','hotel-hsbc-general','hotel-all-hsbc'],missing:['卓越紅利最低量段混寫旅遊積分與300單位，最低可操作紅利尚未確認。費用與年度總上限未列，萬豪／IHG端台灣HSBC比例未獨立互核。']});
Object.assign(NETWORK_COVERAGE.find(item=>item.id==='all-flyingblue-partnership'),{name:'ALL×Flying Blue常設合作',research_status:'selected_fields_verified_gaps_remain',source_ids:['hotel-fb-terms','hotel-fb-main','hotel-fb-transfer-form','hotel-all-air-general'],rule_ids:['R098','R099','R100','R101'],note:'專屬手動1:1、首次資格晚／XP與12月改連規則已補；自動轉換章殘留數字、入帳模板差異與混合支付觸發仍保留。'});

RESOURCES.push(...BANK_RESOURCES);OPPORTUNITIES.push(...BANK_OPPORTUNITIES);NETWORK_SOURCES.push(...BANK_SOURCES);NETWORK_RULES.push(...BANK_RULES);
for(const id of ['hsbc-traveller-infinite','hsbc-traveller-signature','hsbc-traveller-light'])NETWORK_COVERAGE_UPDATES[id]={research_status:'selected_fields_verified_gaps_remain',source_ids:['bank-hsbc-q4','bank-hsbc-compare','bank-hsbc-light','bank-hsbc-welcome'],rule_ids:['R102','R103','R106'],note:'2026/10/27補上三卡年費、Q4基本累積、條件迎新、逐月效期及轉點入口；財管與生日加碼仍待核。R005保留過期Q3歷史，當期迎新改見R103。'};
NETWORK_COVERAGE_UPDATES['dbs-flying-family']={research_status:'partial_sources_found',source_ids:['bank-dbs-cards','bank-dbs-transfer'],rule_ids:['R104'],note:'已補四種持卡入口與飛行積金路線；逐卡年費、基本累積、迎新及排除仍待完整比較。'};
NETWORK_COVERAGE_UPDATES['ctbc-ana-family']={research_status:'partial_sources_found',source_ids:['bank-ana-cards'],rule_ids:['R105'],note:'已補六種持卡入口及獨立ANA哩程餘額；銀行逐卡當期條款與獎勵票規則仍待完整查核。'};
// IHG與Hyatt 2026-10-30 官方條款
RESOURCES.push(...IH_RESOURCES);FACTS.push(...IH_FACTS);OPPORTUNITIES.push(...IH_OPPORTUNITIES);NETWORK_SOURCES.push(...IH_SOURCES);NETWORK_RULES.push(...IH_RULES);NETWORK_COVERAGE.push(...IH_COVERAGE);
Object.assign(NETWORK_COVERAGE_UPDATES,IH_COVERAGE_UPDATES);
// 其他台灣銀行點數：2026-10-30 讀各行官方兌換頁，只用在「出去玩」的轉點計算（比例在 trip-data.mjs）
RESOURCES.push(...[['esun-epoint','玉山 e point'],['taishin-points','台新 Point'],['ctbc-points','中信紅利點數'],['fubon-points','富邦紅利點數'],['fubon-miles','富邦 a miles 卡哩程'],['firstbank-points','第一銀行紅利點數'],['kgi-points','凱基紅利點數'],['kgi-cash-points','凱基現金點'],['kgi-mile-points','凱基哩程點'],['ba-avios','英航 Avios']].map(([id,label])=>({id,label,group:'點數與帳戶'})));
