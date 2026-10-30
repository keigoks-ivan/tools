const checked='2026-10-24';
const source=(id,publisher,group,url,note,access='page_body')=>({id,publisher,ownership_group:group,url,note,access,kind:'official',checked_on:checked});
export const EXT_SOURCES=[
  source('cube-details','國泰世華銀行','cathay-united','https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/bonus/point-exchange/airmiles/','已讀2026完整轉點表與注意事項。18個出口的最低量及單位逐項入表；世界卡優惠只有指定三家，亞洲萬里通世界卡不適用。其餘11個出口尚未完成夥伴端精確數值互核。'),
  source('cube-2026-full','國泰世華銀行','cathay-united','https://www.cathaybk.com.tw/cathaybk/promo/event/credit-card/discount/2026/pointannounceInfo05/index.html','2026年度公告已讀；排除自有回饋聯名卡的刷卡積點、正卡兌換、一般點數效期及兌換表。不能因持卡可兌既有餘額，就宣稱該卡刷卡產生小樹點。'),
  source('cube-2027-full','國泰世華銀行','cathay-united','https://www.cathaybk.com.tw/cathaybk/promo/event/credit-card/discount/2027/pointannounceInfo/index.html','2027/1/1–12/31公告已讀。表格標為兌換調整項目，只列9家；其他夥伴及世界卡專屬比例不能擅自沿用或宣告取消。'),
  source('cube-card-level','國泰世華銀行','cathay-united','https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/cube','Level為刷卡累點條件，與世界卡轉點優惠不同。2026指定方案Level1/2/3為2%/3%/3.3%，另有資格、切換及月消費上限；不是全通路回饋。'),
  source('cube-credit-life','國泰世華銀行','cathay-united','https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/bonus/rule/faq','FAQ與年度公告對信用卡點／生活點轉換方向有不同文字。未確認生活點可轉為信用卡點，不建立生活點直接轉航空或飯店的路線。'),
  source('cube-ihg-promo','國泰世華銀行','cathay-united','https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/travel/202609/miles20251011','2026/10/1–11/30 IHG轉點活動完整銀行條款已讀：250轉1,000並加500；會籍看基本轉入累計「超過」40,000／60,000，不含加碼。IHG端本次活動未獨立互核；新獲會籍到期日未明列。'),
  source('cube-eva','長榮航空','eva','https://www.evaair.com/zh-tw/infinity-mileagelands/mileage-award-program/earning-mileage/award-miles-from-other-partners/credit-card/','航空端360／300小樹點轉1,000哩與世界卡排除亞洲萬里通世界卡的條件互核。'),
  source('cube-ci','中華航空','chinaairlines','https://www.china-airlines.com/tw/zh/member/miles/earning/credit-card','確認國泰世華合作，精確比例採銀行當期表；不是數值雙方互核。'),
  source('cube-emirates','阿聯酋航空','emirates','https://www.emirates.com/tw/english/skywards/partners/cathay-united-bank/','確認國泰世華合作；18家全部數值並未因本頁而完成互證。'),
  source('cube-aeroplan','加拿大航空 Aeroplan','aircanada','https://www.aircanada.com/us/en/aco/home/aeroplan/your-aeroplan/conversion-programs.html','510小樹點轉1,000 Aeroplan點與最低1,000點數值互核。轉入可兌換點數不等於Aeroplan高階會籍。'),
  source('cube-all','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/partners/credit-card-rewards/cathayunitedbank.html','酒店端600小樹點轉1,000 ALL獎勵點數互核。'),
  source('cube-all-terms','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/partners/conditions/cathayunitedbanktaiwan.html','同名會員、不可撤銷等合作條款已讀。'),
  source('cube-jal-current','日本航空','jal','https://www.jal.co.jp/myl/en/sr/jalmile/partner/point/','較新官方夥伴列表列480轉1,000；仍保留舊頁670比例衝突。','official_search_excerpt_only'),
  source('cube-jal-old','日本航空','jal','https://www.jal.co.jp/world/en/world/jalmile/partner/point/cathaybk.html','舊合作頁仍列670轉1,000及較長入帳時間，與銀行2026完整表不同；本工具按有年度的銀行當期表顯示並揭露差異。'),
  source('stay-mb-terms','Marriott Bonvoy','marriott','https://www.marriott.com/loyalty/terms/default.mi','正常資格條款2.1與4.2已讀：品牌房晚額度不同；正常ENC、本人實住與特定合作挑戰晚數分開。'),
  source('stay-mb-enc','Marriott Bonvoy','marriott','https://help.marriott.com/s/article/marriott-elite-night-credit','2026/6/24標示的FAQ已於瀏覽器讀取：2026/2/12起MEA每個合格晚計1 ENC；部分輕量品牌0.5，StudioRes不計。網頁文字擷取可能只得CSS錯誤。','live_browser_terms'),
  source('stay-mea-old','Marriott Executive Apartments','marriott','https://www.marriott.com/brands/executive-apartments/locations.mi','品牌舊頁仍有住三晚計一ENC文字，與有日期的現行FAQ不同。採現行FAQ／會員條款，保留官方頁面差異。'),
  source('stay-sq-faq','Marriott Bonvoy','marriott','https://travel-partner.marriott.com/singapore/en-gb/faqs','新航合作完整FAQ已讀；此方案與JAL的品牌排除不能混用。'),
  source('stay-sq-pdf','新加坡航空','sia','https://www.singaporeair.com/content/dam/sia/web-assets/pdfs/plan-travel/promotions/global/KrisFlyer_MarriottBonvoy_TnCs_18Aug2025.pdf','新航側合作條款Part D/E已讀：合格付費本人實住、3／10晚、六個月；未見MEA明文排除，仍不能直接認定一定計入。','pdf_text_full'),
  source('network-jal-faq','Marriott Bonvoy','marriott','https://travel-partner.marriott.com/japan-airlines/en-gb/faqs','已補讀完整FAQ：海外會員可參與，等級各有不同實住門檻、一次連結與年度權益；與JAL側互核。'),
  source('partner-jal-terms','Marriott Bonvoy','marriott','https://travel-partner.marriott.com/japan-airlines/en-gb/terms','合作完整條款已讀。MEA、Bulgari、麗思遊艇與列名度假品牌業主自住排除；獎勵住宿不計挑戰。FOP是資格點，並非可兌換哩程。'),
  source('partner-jal-main','日本航空','jal','https://www.jal.co.jp/jp/en/jmb/marriott-status/','JAL側完整等級表及FAQ已讀：Diamond與Diamond Metal白金挑戰的年度次數不同，全球居住地可參與。'),
  source('partner-ua-terms','Marriott Bonvoy','marriott','https://travel-partner.marriott.com/united/en-us/terms','RewardsPlus完整條款已讀：萬豪Ti／Amb才有UA Silver，UA Gold／Plat／1K才有萬豪Gold；試用會籍排除、須審核，不保證12個月。'),
  source('partner-ua-faq','Marriott Bonvoy','marriott','https://travel-partner.marriott.com/united/en-us/faqs','完整FAQ已讀：海外會員可參與；UA高階會員可1:1轉入萬豪獎勵點數，最低500、每曆年最多100,000哩，約6–8週；不能升萬豪會籍。'),
  source('partner-ua-side','聯合航空','united','https://marriottbonvoy.unitedmileageplus.com/home','航空側合作入口僅取得JS外框與官方索引；精確條款以已讀的萬豪合作完整文件為主，未宣稱兩邊全文均已取得。','official_search_excerpt_only'),
  source('stay-hyatt-corporate','World of Hyatt','hyatt','https://world.hyatt.com/content/gp/en/offers/2026-elite-tier-offer.html','2026企業優惠完整條款已讀：真實適格公司資格，90日10／20實住資格晚；排除登錄前已訂住宿、卡片及活動贈送房晚。挑戰達標效期至2028/2/29。'),
  source('stay-hyatt-aeroplan','World of Hyatt','hyatt','https://world.hyatt.com/content/gp/en/offers/air-canada-status-challenge.html','完整條款已讀：指定Aeroplan高階或指定高階主卡，連結後登錄；90日4／10／20資格實住晚。MMS與合格Hyatt管道Venetian可計；整段住宿必須於期限內退房。'),
  source('stay-hyatt-tqn','World of Hyatt','hyatt','https://www.hyatt.com/help/terms/world-of-hyatt?cat_id=90000789&content_id=90005278','官方索引的Tier Qualifying Night定義包含合格免費獎勵實住；完整條款本文擷取受限。Aeroplan活動引用此定義；個別獎勵與品牌仍須核對。','official_search_excerpt_only'),
  source('partner-ap-hyatt','加拿大航空 Aeroplan','aircanada','https://www.aircanada.com/ca/en/aco/home/aeroplan/status-challenge.html','完整FAQ與條款已讀：Hyatt Explorist／Globalist可啟用90日飛行挑戰；Explorist8,000合格SQC至25K。基本經濟、獎勵票及非飛行SQC排除；登錄時Hyatt等級決定本次可挑戰上限。'),
  source('stay-ihg-visa','Visa／IHG','visa-ihg','https://www.myvisacardportal.com/content/dam/vpp/visaap/TermsandConditions_IHGFastTrack.pdf','完整五頁PDF已讀。現期指定亞太發卡市場不含台灣；合格房價至少30美元，獎勵房、Points&Cash及OTA排除。日本舊段已截止，不混用。','pdf_text_full'),
  source('stay-scandic','Scandic','scandic','https://www.scandichotels.com/en/scandic-friends','已查當期會員入口，未找到可確認BW四晚挑戰品牌／房價／時間的完整公開條款；一般積點規則不能替代個別挑戰核准。'),
  source('cube-ihg-general','IHG','ihg','https://www.ihg.com/content/us/en/customer-care/member-tc','一般轉入點數不計資格，但特定活動另有例外；不能把銀行本次活動推廣成所有轉點都升等。'),
  source('lead-didi','Marriott Bonvoy','marriott','https://www.marriott.com/loyalty/partners/didi-marriott-bonvoy.mi','另發現DiDi合作入口，尚未確認台灣帳戶、區域與完整條件；只列待研究。','official_indexed_lead'),
  source('lead-all-fb','雅高 ALL','accor','https://all.accor.com/loyalty-program/partners/airfranceklm/index.en.shtml','另發現Flying Blue雙重累積／加速入口；一般條款與專屬轉點頁比例有差異，尚未完整核對，不接成確定可走路線。','official_indexed_lead')
];
const res=(id,label,group,exclusive)=>({id,label,group,...(exclusive?{exclusive}: {})});
export const EXT_RESOURCES=[
  ...[['ihg-club','IHG Club會員'],['ihg-silver','IHG銀卡 Silver Elite'],['ihg-gold','IHG金卡 Gold Elite'],['ihg-platinum','IHG白金 Platinum Elite'],['ihg-diamond','IHG鑽石 Diamond Elite']].map(([id,label])=>res(id,label,'酒店會籍','ihg')),
  res('cube-card','國泰世華 CUBE 卡','信用卡'),res('cube-world','國泰世華世界卡（非亞洲萬里通世界卡）','信用卡'),res('cube-asia-world','國泰世華亞洲萬里通世界卡','信用卡'),res('cube-credit','小樹點（信用卡）餘額','點數與帳戶'),res('cube-life','小樹點（生活）餘額','點數與帳戶'),
  res('mb-platinum-exact','萬豪白金（確切等級）','酒店會籍','marriott'),res('mb-titanium','萬豪鈦金','酒店會籍','marriott'),res('mb-ambassador','萬豪大使','酒店會籍','marriott'),
  ...[['jal-base','JAL一般會員'],['jal-crystal','JAL Crystal'],['jal-sapphire','JAL Sapphire'],['jal-premier','JGC Premier'],['jal-diamond','JAL Diamond'],['jal-metal','JAL Diamond Metal']].map(([id,label])=>res(id,label,'航空會籍','jal')),
  res('jal-account','JAL Mileage Bank帳戶','點數與帳戶'),res('ua-silver','聯航 Premier Silver','航空會籍','united'),res('ua-gold','聯航 Premier Gold','航空會籍','united'),res('ua-platinum','聯航 Premier Platinum','航空會籍','united'),res('ua-1k','聯航 Premier 1K','航空會籍','united'),res('ua-miles','聯航可兌換哩程','點數與帳戶'),
  res('ap-account','Aeroplan帳戶','點數與帳戶'),res('ap-elite','Aeroplan 25K以上正式會籍','航空會籍'),res('ap-premium-card','活動列名的Aeroplan高階主卡','信用卡'),res('hyatt-account','World of Hyatt帳戶','點數與帳戶'),res('hyatt-discoverist','Hyatt探索者 Discoverist','酒店會籍','hyatt'),res('hyatt-explorist','Hyatt冒險家 Explorist','酒店會籍','hyatt'),res('hyatt-globalist','Hyatt環球客 Globalist','酒店會籍','hyatt'),res('ihg-account','IHG帳戶','點數與帳戶'),res('visa-overseas','指定海外市場發行Visa御璽／無限卡','信用卡')
];
export const EXT_FACTS=[
  {id:'jalLinked',label:'JAL×萬豪是否尚未使用帳戶連結',options:[['no','尚未連結'],['yes','已連結，年度資格未確認'],['annual','已確認本人當年度可再領取']]},
  {id:'uaSource',label:'聯航會籍是否為正式、非試用等級',options:[['formal','已確認正式等級'],['trial','試用／配對挑戰期間']]},
  {id:'hyattApLinked',label:'Hyatt與Aeroplan是否已連結同名帳戶',options:[['yes','已完成'],['no','尚未完成']]},
  {id:'hyattApUsed',label:'本曆年Hyatt×Aeroplan住宿挑戰已用幾次',options:[['no','0次'],['one','1次'],['two','2次或以上']]},
  {id:'apHyattUsed',label:'今年是否已使用Hyatt→Aeroplan飛行挑戰',options:[['no','尚未使用'],['yes','已使用']]},
  {id:'hyattEmployer',label:'Hyatt企業挑戰是否有真實適格公司資格',options:[['yes','公司及本人資格已確認'],['no','沒有適格資格']]},
  {id:'hyattCorpUsed',label:'Hyatt企業方案近三年是否已用過試用',options:[['no','尚未使用'],['yes','已使用']]},
  {id:'ihgVisaMarket',label:'IHG×Visa卡片發卡市場是否在當期名單',options:[['listed','已核對指定市場與卡別'],['taiwan','台灣發卡'],['other','其他未列市場']]}
];
const c=(fact,allowed,label,extra={})=>({fact,allowed,label,...extra});
const op=(id,title,goal,tree,node,extra={})=>({id,title,goal,tree,node,any:[],all:[],conditions:[],research:'partial',...extra});
const mbUnderPlat=['mb-base','mb-silver','mb-gold'];
export const EXT_OPPORTUNITIES=[
  op('N010','小樹點（信用卡）→14個航空出口','flight','cube-points','cube-air',{any:['cube-credit'],valid_from:'2026-01-01',valid_until:'2026-12-31'}),
  op('N011','小樹點（信用卡）→4個飯店出口','hotel','cube-points','cube-hotel',{any:['cube-credit'],valid_from:'2026-01-01',valid_until:'2026-12-31'}),
  op('N012','小樹點→IHG加50%與限時會籍門檻','status','cube-points','cube-ihg-offer',{all:['cube-credit'],valid_from:'2026-10-01',valid_until:'2026-11-30',warning:'僅銀行活動全文確認；會籍門檻看基本轉入「超過」4萬／6萬，加碼不計。新獲會籍到期日待核。'}),
  op('N013','JAL Diamond／Metal→萬豪10晚白金','status','jal-marriott','jal-platinum',{any:['jal-diamond','jal-metal'],allGroups:[mbUnderPlat],forbidden:['mb-platinum'],conditions:[c('jalLinked',['no','annual'],'先核對首次連結與年度福利資格')],warning:'Diamond限合作首年；Diamond Metal可每合作年。已連結者需核對本人的年度權益，不假設永久失效。'}),
  op('N014','JAL Sapphire→萬豪銀卡＋10晚金卡','status','jal-marriott','jal-gold-challenge',{all:['jal-sapphire'],allGroups:[['mb-base','mb-silver']],forbidden:['mb-gold','mb-platinum'],conditions:[c('jalLinked',['no','annual'],'尚未連結，或另核對年度權益')]}),
  op('N015','JAL一般／Crystal→萬豪6／4晚銀卡','status','jal-marriott','jal-silver-challenge',{any:['jal-base','jal-crystal'],all:['mb-base'],conditions:[c('jalLinked',['no','annual'],'尚未連結，或另核對年度權益')]}),
  op('N016','JAL高階→申請萬豪金卡','status','jal-marriott','jal-gold',{any:['jal-premier','jal-diamond','jal-metal'],allGroups:[mbUnderPlat],forbidden:['mb-platinum'],conditions:[c('jalLinked',['no','annual'],'先核對帳戶連結與既有等級')]}),
  op('N017','萬豪等級→JAL年度資格點FOP','status','jal-marriott','jal-fop',{any:['mb-base','mb-silver','mb-gold','mb-platinum-exact','mb-titanium','mb-ambassador'],all:['jal-account'],warning:'每年2,000–40,000資格點依確切等級；不能兌票。白金以上但未細分者，先確認等級。'}),
  op('N018','萬豪鈦金／大使→聯航銀卡','status','united-marriott','ua-silver-target',{any:['mb-titanium','mb-ambassador'],forbidden:['ua-silver','ua-gold','ua-platinum','ua-1k'],conditions:[c('marriottSource',['earned','card','matched'],'萬豪為正式非試用會籍')],warning:'萬豪白金不適用；UA Silver不是星空聯盟金卡。'}),
  op('N019','聯航Gold以上→萬豪金卡','status','united-marriott','ua-mb-gold',{any:['ua-gold','ua-platinum','ua-1k'],allGroups:[['mb-base','mb-silver']],forbidden:['mb-gold','mb-platinum'],conditions:[c('uaSource',['formal'],'聯航非試用／配對挑戰中會籍')]}),
  op('N020','聯航高階會員哩程→萬豪獎勵點數','hotel','united-marriott','ua-mb-points',{any:['ua-silver','ua-gold','ua-platinum','ua-1k'],all:['ua-miles'],warning:'1:1但用途價值不同；轉入獎勵點數不計萬豪會籍。'}),
  op('N021','Aeroplan高階／指定主卡→Hyatt住宿挑戰','status','hyatt-aeroplan','hyatt-stay',{any:['ap-elite','ap-premium-card'],all:['hyatt-account'],conditions:[c('hyattApLinked',['yes'],'先完成Hyatt與Aeroplan同名連結'),c('hyattApUsed',['no'],'一般高階會員本曆年尚未用過挑戰',{unlessAny:['ap-premium-card']}),c('hyattApUsed',['no','one'],'指定高階主卡本曆年尚未用滿兩次挑戰',{whenAny:['ap-premium-card']})],valid_until:'2026-12-31'}),
  op('N022','真實公司資格→Hyatt企業10／20晚挑戰','status','hyatt-aeroplan','hyatt-corporate',{all:['hyatt-account'],conditions:[c('hyattEmployer',['yes'],'本人與公司均符合指定企業優惠'),c('hyattCorpUsed',['no'],'近三年未用過企業試用')],valid_until:'2026-12-31',warning:'登錄前已預訂住宿排除；公開連結不是所有人適用。'}),
  op('N023','Hyatt冒險家／環球客→Aeroplan飛行挑戰','status','hyatt-aeroplan','ap-flight',{any:['hyatt-explorist','hyatt-globalist'],all:['ap-account'],conditions:[c('hyattApLinked',['yes'],'先完成同名連結'),c('apHyattUsed',['no'],'今年尚未使用此飛行挑戰')],warning:'90日實際合格飛行；登錄時Hyatt等級決定挑戰上限，不能中途升等後改分支。'}),
  op('N024','指定海外Visa→IHG 2／6晚快軌','status','ihg-visa','ihg-visa-stay',{all:['visa-overseas','ihg-account'],conditions:[c('ihgVisaMarket',['listed'],'卡片為當期指定發卡市場與卡別')],valid_until:'2026-12-31',warning:'當期市場未含台灣；台灣Visa無限卡不能直接套用。'}),
  op('N025','新航銀卡→萬豪3晚銀卡','status','marriott-sq','sq-silver-mb',{all:['sq-silver','mb-base'],forbidden:['mb-silver','mb-gold','mb-platinum'],conditions:[c('partnerUsed',['no'],'尚未使用萬豪×新航合作登錄')],warning:'需六個月內3個合格付費實住晚；先核對是否會消耗未來較高階合作機會。'})
];
const rule=(id,type,summary,source_ids,values,missing=[])=>({id,type,summary,source_ids,values,missing,checked_on:checked,evidence_status:'selected_primary_terms_verified_gaps_remain',validity:{effective_from:null,effective_until:null},recommendation_ready:false});
export const EXT_RULES=[
  rule('R075','stay_eligibility','MEA正常定級與特定挑戰須分開：2026/2/12起正常每晚1 ENC；JAL合作明文排除。',['stay-mb-terms','stay-mb-enc','stay-mea-old','partner-jal-terms'],{mea_normal_enc:1,mea_normal_from:'2026-02-12',mea_jal_challenge:false},['新航合作未見MEA明文排除，但個別住宿認列仍待書面確認。']),
  rule('R076','stay_eligibility','新航合作萬豪3／10晚只看合格付費實住；獎勵房、點現與免房券排除。',['marriott-krisflyer-terms','stay-sq-faq','stay-sq-pdf'],{sq_silver_nights:3,sq_gold_nights:10,months:6,award_redemption_stays_count:false},['跨起迄連住的拆算與MEA個別認列未明確，不套JAL排除。']),
  rule('R077','partner_status','JAL與萬豪提供分級的6／4／10晚挑戰及年度FOP；FOP不是可兌換哩程。',['partner-jal-main','partner-jal-terms','network-jal-faq'],{jal_silver_base_nights:6,jal_silver_crystal_nights:4,jal_gold_sapphire_nights:10,jal_platinum_diamond_nights:10,months:6,fop_redeemable:false},['Diamond白金加速限合作首年；Metal每合作年，不能混用。']),
  rule('R078','point_transfer','小樹點（信用卡）2026有14航空、4飯店出口；最低量與增量逐家不同。',['cube-details','cube-2026-full','cube-eva','cube-aeroplan','cube-all','cube-all-terms'],{airline_outlets:14,hotel_outlets:4,life_points_supported:false,world_asia_card_excluded:true},['其他夥伴端尚未全部互核；一般轉點費與總上限未在完整頁明列。']),
  rule('R079','future_point_transfer','2027小樹點調整表只列9家，自2027/1/1起；世界卡專屬比例尚待確認。',['cube-2027-full'],{effective_from:'2027-01-01',effective_until:'2027-12-31',announced_partners:9,unlisted_partner_terminated:null},['未列不代表終止，也不能保證沿用2026比例。']),
  rule('R080','limited_transfer_status','小樹點轉IHG限時加50%；會籍看基本轉入累計超過4萬／6萬，不含加碼。',['cube-ihg-promo','cube-ihg-general'],{effective_from:'2026-10-01',effective_until:'2026-11-30',bonus_percent:50,gold_base_exclusive:40000,platinum_base_exclusive:60000},['依1,000點單位推算保守門檻為41,000／61,000基本點；這是推算。新獲會籍效期、IHG側本次活動尚未確認。']),
  rule('R081','partner_status','萬豪鈦金／大使可申請聯航銀卡；聯航Gold以上可申請萬豪Gold，均排除試用來源。',['partner-ua-terms','partner-ua-faq','partner-ua-side'],{mb_platinum_eligible_for_ua:false,trial_status_excluded:true,guaranteed_twelve_months:false},['航空側僅取得入口索引，不宣稱兩邊全文互核；核准與效期仍以帳戶為準。']),
  rule('R082','point_transfer','聯航高階會員可1:1將哩程轉萬豪獎勵點數，最低500、曆年最多100,000。',['partner-ua-terms','partner-ua-faq'],{minimum_input:500,annual_max_input:100000,posting_weeks_up_to:8,counts_for_elite_status:false}),
  rule('R083','stay_eligibility','Hyatt×Aeroplan 90日4／10／20資格實住晚；整段住宿須在期內退房，卡贈房晚不計。',['stay-hyatt-aeroplan','stay-hyatt-tqn'],{days:90,hyatt_nights:[4,10,20],entire_stay_checkout_required:true,bonus_nights_count:false},['獎勵實住依一般TQN定義；該定義完整本文擷取受限，個別房價仍核對。']),
  rule('R084','stay_eligibility','Hyatt企業試用須真實適格公司；90日10／20實住晚，登錄前已訂住宿排除。',['stay-hyatt-corporate'],{days:90,hyatt_nights:[10,20],prebooked_stays_count:false,status_valid_until:'2028-02-29'},['公司名單與本人帳戶資格須驗證；不得借用不屬於自己的公司資格。']),
  rule('R085','flight_status_challenge','Hyatt→Aeroplan為90日飛行挑戰；一般點數轉入或獎勵票不替代飛行資格。',['partner-ap-hyatt'],{days:90,explorist_25k_sqc:8000,award_flights_count:false},['Globalist各上限分支需依帳戶顯示與官方級距；不推算未核實的門檻。']),
  rule('R086','stay_eligibility','IHG×Visa現期指定發卡市場不含台灣；2／6晚須合格至少30美元房價，獎勵房及OTA排除。',['stay-ihg-visa'],{taiwan_issued_eligible:false,minimum_rate_usd:30,signature_nights:2,infinite_nights:6,days:90},['每人90日且最晚2027/4/10；跨期範例文字不精確，不製造自動拆晚結論。']),
  rule('R087','stay_eligibility','Hilton公開挑戰核准後90日6／12晚；獎勵住宿不計，未核准前不追溯。',['hilton-match-faq'],{days:90,gold_total_nights:6,diamond_total_nights:12,award_redemption_stays_count:false},['免房券、點現、活動贈晚及完整品牌清單未在公開FAQ逐一列清；不得當作已接受。']),
  rule('R088','stay_eligibility','Scandic四晚挑戰仍缺本人可用的完整核准條款。',['stay-scandic','tree-scandic-sas'],{challenge_nights_verified:null},['品牌、房價、點數住宿、訂房管道、起迄與追溯均須書面核對。'])
];
EXT_RULES.push(rule('R089','limited_transfer_bonus','小樹點另有JAL30%、Flying Blue20%與亞洲萬里通定額加碼；期限及登錄不同。',['cube-ihg-promo'],{partner_promotions:['JAL：2026/10/1–11/30，480轉1,000並加30%，不設加碼上限。','Flying Blue：2026/10/1 07:00–11/1 07:59，340轉1,000並加20%，不設加碼上限。','亞洲萬里通：10/1–10/31轉點滿10,000／20,000加800／1,600；10/28 16:00至10/30 23:59另登錄、限2,000正卡戶。']},['銀行全文已讀，各夥伴側本次活動未全部互核；亞洲萬里通登錄尚未開始，剩餘名額未查。']));
for(const entry of EXT_RULES){
  if(entry.values.effective_from)entry.validity.effective_from=entry.values.effective_from;
  if(entry.values.effective_until)entry.validity.effective_until=entry.values.effective_until;
  if(entry.id==='R078')entry.validity={effective_from:'2026-01-01',effective_until:'2026-12-31'};
  if(entry.id==='R086')entry.validity={effective_from:null,effective_until:'2026-12-31',travel_deadline:'2027-04-10'};
}
export const EXT_COVERAGE=[
  {id:'cube-18-transfers',name:'小樹點18出口與2027年度版本',source_ids:['cube-details','cube-2027-full'],rule_ids:['R078','R079'],research_status:'selected_fields_verified_gaps_remain',note:'數值與最低單位已逐項建表；夥伴端未全互核、世界卡2027比例與費用上限仍有缺口。'},
  {id:'cube-ihg-campaign',name:'小樹點×IHG 2026秋季限時活動',source_ids:['cube-ihg-promo'],rule_ids:['R080'],research_status:'selected_fields_verified_gaps_remain',note:'銀行全文確認；IHG端及新會籍效期仍待核。'},
  {id:'united-marriott-partnership',name:'聯合航空×萬豪RewardsPlus',source_ids:['partner-ua-terms','partner-ua-faq','partner-ua-side'],rule_ids:['R081','R082'],research_status:'selected_fields_verified_gaps_remain',note:'主要完整條款已讀，UA入口本文受限；確切等級與試用排除獨立判斷。'},
  {id:'hyatt-aeroplan-partnership',name:'Hyatt×Aeroplan雙向挑戰',source_ids:['stay-hyatt-aeroplan','partner-ap-hyatt','stay-hyatt-tqn'],rule_ids:['R083','R085'],research_status:'selected_fields_verified_gaps_remain',note:'雙方活動全文已讀；一般TQN定義正文擷取受限。登錄順序、實住與實飛分開。'},
  {id:'hyatt-corporate-2026',name:'Hyatt 2026企業試用與快軌',source_ids:['stay-hyatt-corporate'],rule_ids:['R084'],research_status:'selected_fields_verified_gaps_remain',note:'完整活動已讀，真實公司名單及帳戶資格未驗。'},
  {id:'scandic-four-night-detail',name:'Scandic四晚挑戰本人核准與認列規則',source_ids:['stay-scandic'],rule_ids:['R088'],research_status:'queued',note:'一般會員條款不足以證明四晚挑戰可用，仍待本人書面活動條款。'},
  {id:'marriott-didi-partnership',name:'DiDi×萬豪合作及台灣資格',source_ids:['lead-didi'],rule_ids:[],research_status:'queued',note:'新發現入口，區域、來源及完整條件待查；尚未畫成可執行路線。'},
  {id:'all-flyingblue-partnership',name:'ALL×Flying Blue雙重累積與會籍加速',source_ids:['lead-all-fb'],rule_ids:[],research_status:'queued',note:'一般與專屬頁轉點比例不同，先解決官方差異與連結限制。'}
].map(item=>({category:'status_acquisition_opportunity',priority:'P1',scope:'2026-10-24當期選定欄位研究',...item}));
