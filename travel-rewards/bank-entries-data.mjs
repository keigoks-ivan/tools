const checked='2026-10-27';
const source=(id,publisher,ownership_group,url,note)=>({id,publisher,ownership_group,url,note,kind:'official',access:'page_body',checked_on:checked});
export const BANK_SOURCES=[
  source('bank-hsbc-q4','滙豐台灣','hsbc','https://shop.hsbc.com.tw/installments/creditcard/rewards/info.html','Q4全文：三卡國內／海外基本比例、合格交易排除、36個月逐月效期、卡片效期較早時的例外。不同卡餘額不可自行合併。'),
  source('bank-hsbc-compare','滙豐台灣','hsbc','https://www.hsbc.com.tw/credit-cards/compare.travellers-signature-card.travellers-infinite-card/','現行官方比較頁：無限正卡8,000元、御璽2,500元。頁面轉向台灣英文版；未把同銀行多頁當成獨立機構互證。'),
  source('bank-hsbc-light','滙豐台灣','hsbc','https://www.hsbc.com.tw/en-tw/credit-cards/products/travelone/','輕旅正卡2,000元，新戶首年免。續年電子／行動帳單、前一年8萬元或12次擇一免年費。舊總覽未完整列帳單減免，採現行產品正文。'),
  source('bank-hsbc-welcome','滙豐台灣','hsbc','https://www.hsbc.com.tw/zh-tw/credit-cards/offers/acquisition-gift/terms-and-conditions/','2026/10/1–12/31迎新全文已讀；無限8,000／御璽3,000／輕旅1,000點有申辦、核卡、首刷、帳單、App及年費等條件，不能持卡即入帳。'),
  source('bank-hsbc-air','滙豐台灣','hsbc','https://shop.hsbc.com.tw/installments/creditcard/rewards/fly.html','Q4航空出口與旅人最低3,000點、500點單位。旅人及卓越積分分開；實際各夥伴比例、入帳和本人有效帳戶仍逐項核對。'),
  source('bank-dbs-cards','星展台灣','dbs','https://www.dbs.com.tw/personal-zh/cards/cardbook-travel.page','飛行系列卡名入口：世界之極、世界商務／世界、鈦金。此處只建立持卡入口，未宣稱完整年費及迎新比較。'),
  source('bank-dbs-transfer','星展台灣','dbs','https://www.dbs.com.tw/personal-zh/cards/rewards/fly_redeem_mileage','現行至2027/6/30；飛行積金三家1:1、華航2:1，最低輸出6,000哩及1,000哩單位，長榮每工作日一次。其他星展積分不可混用。'),
  source('bank-ana-cards','ANA','ana','https://www.ana.co.jp/zh/tw/amc/ctbc_anacard/','航空端列極緻、無限、晶緻、商務御璽、白金、御璽六卡；持卡、刷卡哩程、入會禮與ANA高階會籍分開。此處不提供未完成查核的獎勵票報價。')
];
export const HSBC_CARD_IDS=['hsbc-traveller-infinite','hsbc-traveller-signature','hsbc-traveller-light'];
export const DBS_CARD_IDS=['dbs-fly-elite','dbs-fly-business','dbs-fly-world','dbs-fly-titanium'];
export const ANA_CARD_IDS=['ctbc-ana-premium','ctbc-ana-infinite','ctbc-ana-precious','ctbc-ana-business','ctbc-ana-platinum','ctbc-ana-signature'];
const cardResource=(id,label,aliases,note)=>({id,label,group:'信用卡',aliases,note});
export const BANK_RESOURCES=[
  ...HSBC_CARD_IDS.map((id,i)=>cardResource(id,['滙豐旅人無限卡','滙豐旅人御璽卡','滙豐旅人輕旅卡'][i],'HSBC 匯豐 旅人 Traveller TravelOne','累積旅遊積分；餘額與會籍另填')),
  ...DBS_CARD_IDS.map((id,i)=>cardResource(id,['星展飛行世界之極卡','星展飛行世界商務卡','星展飛行世界卡','星展飛行鈦金卡'][i],'DBS 飛行積金','累積飛行積金；卡片比較條件待補')),
  ...ANA_CARD_IDS.map((id,i)=>cardResource(id,['中信 ANA 極緻卡','中信 ANA 無限卡','中信 ANA 晶緻卡','中信 ANA 商務御璽卡','中信 ANA 白金卡','中信 ANA 御璽卡'][i],'中國信託 全日空','累積 ANA 哩程；不代表星空聯盟高卡')),
  {id:'ana-miles',label:'ANA 可兌換哩程',group:'點數與帳戶',aliases:'全日空 AMC'},
  {id:'asia-miles',label:'亞洲萬里通里數',group:'點數與帳戶',aliases:'國泰航空 Cathay Asia Miles'},
  {id:'sq-miles',label:'新航 KrisFlyer 可兌換哩程',group:'點數與帳戶',aliases:'新加坡航空 Singapore Airlines'}
];
const rule=(id,summary,values,source_ids,missing,until='2026-12-31')=>({id,summary,values,source_ids,missing,type:'bank_card_entry',evidence_status:'selected_primary_fields_verified_gaps_remain',checked_on:checked,validity:{effective_from:until==='2026-12-31'?'2026-10-01':null,effective_until:until},recommendation_ready:false});
export const BANK_RULES=[
  rule('R102','滙豐旅人三卡的年費、基本累積與點數效期。',{cards:['無限：年費8,000元，國內18元／點、海外10元／點。','御璽：年費2,500元，國內18元／點、海外15元／點。','輕旅：標準年費2,000元，新戶首年免；國內外20元／點。續年電子／行動帳單、前一年8萬元或12次擇一免。'],months:36},['bank-hsbc-q4','bank-hsbc-compare','bank-hsbc-light'],['海外須台灣以外交易且帳單列國外交易手續費。稅、學費、年費、預借現金、公共事業及特店分期等排除，詳完整清單。','按獲點月份逐月到期，卡片效期較早時另受限制；各卡餘額不可自行合併。','財管減免與生日加碼未確認現行通用條款。']),
  rule('R103','Q4旅人迎新需核卡、首刷與指定帳單、App及年費條件。',{cards:['無限：核卡後30天一般新增消費1萬元，條件完成贈8,000點。','御璽：核卡後30天一般新增消費3,000元，條件完成贈3,000點。','輕旅：限線上申辦，核卡後30天一般新增消費3,000元，條件完成贈1,000點。']},['bank-hsbc-welcome'],['2026/10/1–12/31申辦、45天內核卡、30天內登入Card+及申請電子／行動帳單；無限、御璽另須60天內繳全額年費。','輕旅另限核卡前12個月未持本行正附卡且無未結清帳款；各卡適用對象、通路、次數、入帳及排除以完整條款為準。','數位開戶加辦卡2,000點為另一組條件，未自動加入餘額；不將迎新點數視為已入帳。']),
  rule('R104','星展飛行卡先累積飛行積金，再依航空別轉哩程。',{cards:['飛行世界之極卡','飛行世界商務卡','飛行世界卡','飛行鈦金卡'],minimum_output:6000,output_increment:1000},['bank-dbs-cards','bank-dbs-transfer'],['此處建立卡片入口；年費、迎新與逐卡基本累積尚未完整比較。','長榮／亞洲萬里通／新航1:1；華航2:1。其他活利、現金、PChome積分另有比例，不代用飛行積金。'],'2027-06-30'),
  rule('R105','中信ANA六種卡別與可兌換哩程、航空會籍分開設定。',{cards:['極緻','無限','晶緻','商務御璽','白金','御璽']},['bank-ana-cards'],['先建立持卡與累積入口。銀行端各卡當期排除、迎新、年費減免與哩程入帳仍須逐項核對。','獎勵票依ANA當期區域、艙等、日期、承運航空及空位另查，未提供即時報價。'],null),
  rule('R106','旅人積分的航空與飯店出口，須先有餘額及本人會員帳戶。',{minimum_input:3000,input_increment:500,reverse_allowed:false},['bank-hsbc-air','hotel-hsbc-q4'],['持卡只提供累積入口；餘額、正附卡、本人帳戶、逐家比例及實際入帳仍需確認。','酒店三家旅人1:1；卓越紅利另算。ALL最低量文字差異依R003保留。'])
];
const op=(id,title,goal,node,extra={})=>({id,title,goal,tree:'bank-cards',node,any:[],all:[],conditions:[],research:'partial',...extra});
export const BANK_OPPORTUNITIES=[
  op('B001','旅人卡 → 累積旅遊積分','flight','hsbc-earn',{any:HSBC_CARD_IDS,warning:'顯示可累積入口；點數餘額、迎新及會籍沒有自動取得。',valid_from:'2026-10-01',valid_until:'2026-12-31'}),
  op('B002','旅人積分 → 航空哩程','flight','hsbc-air',{all:['hsbc-travel'],warning:'最低3,000點、500點單位；先核對本人會員與選定航空條款。',valid_from:'2026-10-01',valid_until:'2026-12-31'}),
  op('B003','旅人卡與積分 → 飯店轉點','hotel','hsbc-hotel',{any:HSBC_CARD_IDS,all:['hsbc-travel'],warning:'只有卡片仍缺積分餘額；三家轉點及住宿用途另核。',valid_from:'2026-10-01',valid_until:'2026-12-31'}),
  op('B004','星展飛行卡 → 累積飛行積金','flight','dbs-earn',{any:DBS_CARD_IDS,warning:'各卡累積及排除另核；已有餘額請另填，未自動轉點。'}),
  op('B005','中信ANA卡 → 累積ANA哩程','flight','ana-earn',{any:ANA_CARD_IDS,warning:'依確切卡別核對累積；不因此取得ANA或星空聯盟高階會籍。'}),
  op('B006','已有航空哩程 → 查獎勵機票','flight','owned-award',{any:['ana-miles','asia-miles','sq-miles','eva-miles','ci-miles'],research:'lead',warning:'只建立查票起點；各計畫兌換表、航線、艙等、稅費與空位仍須查詢。'})
];
export const BANK_CARDS=HSBC_CARD_IDS.map((id,i)=>({
  id,name:BANK_RESOURCES[i].label,issuer:'滙豐台灣',issued_market:'TW',network:'Visa',asset:'HSBC_TW_TRAVELLER',availability:'public_product_page_present',
  fees:i===2?{annual_twd:2000,first_year_waived:true,waiver_note:'新戶首年免；續年電子／行動帳單、前一年消費8萬元或12次，擇一符合可免。'}:{annual_twd:[8000,2500][i]},
  earning:{base_twd_per_point:[18,18,20][i],overseas_twd_per_point:[10,15,20][i]},rule_ids:['R102','R103','R106'],source_ids:['bank-hsbc-q4','bank-hsbc-compare','bank-hsbc-light','bank-hsbc-welcome'],checked_on:checked,evidence_status:'selected_fields_verified_not_full_product_audit',recommendation_ready:false,
  gaps:['正卡、附卡及各卡積分分開核對；財管年費專案及生日加碼未確認。','迎新、續卡與基本刷卡累積分開，不把贈點自動算為可用餘額。']
}));
export function normalizeRewardSearch(value){return String(value??'').normalize('NFKC').toLocaleLowerCase().replaceAll('匯豐','滙豐').trim();}
export function resourceSearchText(item){return normalizeRewardSearch([item.label,item.aliases,item.note].filter(Boolean).join(' '));}
