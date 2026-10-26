const checked='2026-10-25';
const s=(id,publisher,ownership_group,url,note,access='page_body')=>({id,publisher,ownership_group,url,note,access,kind:'official',checked_on:checked});
export const HOTEL_SOURCES=[
  s('hotel-hsbc-q4','滙豐台灣','hsbc','https://shop.hsbc.com.tw/installments/creditcard/rewards/hotel.html','Q4完整飯店計劃已讀。旅人三家1:1、最低3,000／500單位；卓越2:1但門檻段混寫旅遊積分3,000／300單位，不能自行改成紅利門檻。萬豪單日跨卡750,000點。'),
  s('hotel-hsbc-general','滙豐台灣','hsbc','https://shop.hsbc.com.tw/installments/creditcard/rewards/info.html','Q4總辦法兌換與正附卡段已讀：正卡本人、同名有效酒店帳戶；提出兌換不能撤回。網路／Card+資料正確時即時，其他一般處理7–14工作天。費用及年度上限未列。'),
  s('hotel-all-hsbc','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/partners/conditions/hsbctaiwan.html','旅人1:1、同名及不計升等／保級已讀；沒有獨立互證卓越2:1或卓越最低量。介紹from1,000與銀行最低3,000的差異仍保留。'),
  s('hotel-all-use','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/legal/terms-and-conditions.html','2026/10/14起完整條款§10已讀：官網1,000點抵20歐元，2,000以上依2,000倍數；台灣等列名地區酒店櫃檯500點起。部分品牌、房價及預付款限制不同；正常資格晚與合作觸發分開。'),
  s('hotel-all-book','雅高 ALL','accor','https://all.accor.com/loyalty-program/use/booking-with-points/index.en.shtml','官方使用頁1,000點抵20歐元，餘款可另付；退款仍依原房價取消條件。'),
  s('hotel-mb-five','Marriott Bonvoy','marriott','https://www.marriott.com/loyalty/terms/default.mi','§3.3.d及免房券段已讀：同一訂單五個連續標準兌換晚，免最低點數一晚；免房券、點現及升等部分不能直接套用。正常ENC與合作挑戰分開。'),
  s('hotel-mb-five-faq','Marriott Bonvoy','marriott','https://help.marriott.com/s/article/stay-for-5-pay-for-4-benefit','2026/7/16官方FAQ索引：任何會員可用，10晚免全段最低兩晚；正文擷取CSS錯誤，未記為全文已讀。','official_search_excerpt_only'),
  s('hotel-hilton-five','Hilton Honors','hilton','https://www.hilton.com/en/hilton-honors/support-faq/','完整FAQ第五晚段已讀：銀卡以上、同酒店全點數標準房五晚以上、官方管道；20連續晚最多四個免費晚。Premium、Points & Money不能直接套用。'),
  s('hotel-hilton-terms','Hilton Honors','hilton','https://www.hilton.com/en/hilton-honors/terms/','完整會員條款第五晚與獎勵訂房段已讀；實際總點數與房型依官方報價，不把最後一晚點數自行扣除。'),
  s('hotel-ihg-faq','IHG','ihg','https://www.ihg.com/content/us/en/customer-care/frequently-asked-questions','完整Reward Nights FAQ已讀：動態點數按酒店、房型、日期；第四晚免費是合格Chase卡權益，不能只因IHG白金就套用。'),
  s('hotel-ihg-select','Chase','chase','https://creditcards.chase.com/travel-credit-cards/ihg-rewards-club/premier-select','Premier Select完整第四晚權益已讀：指定主卡帳戶、合格連續四晚全點數獎勵預訂。持有台灣銀行卡或IHG白金不能代替這張美國發行卡。'),
  s('hotel-ihg-2026','IHG集團','ihg','https://www.ihgplc.com/en/news-and-media/news-releases/2026/chase-introduces-new-ihg-one-rewards-premier-select-credit-card-and-portfolio','2026/10/1官方新版卡公告已讀，配合Chase互核。不同卡、既有持卡人及2027新門檻不同，不把免年費卡全部當作無條件第四晚免費。'),
  s('hotel-ihg-traveler-2027','Chase','chase','https://www.chase.com/personal/credit-cards/ihg/onerewards','官方免年費卡現頁明列2027起須曆年消費5,000美元才解鎖第四晚；僅作版本差異，未列為台灣可直接申辦。'),
  s('hotel-qatar-cross','雅高 ALL','accor','https://all.accor.com/loyalty-program/partners/qatarairways/terms-and-conditions.en.shtml','完整CrossRewards§2、5、6、8、9、13已讀。指定等級、首個合格活動、一次性快線、名額、本人連結及轉點；不把2022新聞Diamond→Qatar Platinum套到現期。'),
  s('hotel-qatar-air','Qatar Airways','qatar','https://www.qatarairways.com/en/Privilege-Club/terms-and-conditions/accor-account-linking.html','兩端專屬條款互核：ALL Gold→QR Silver；ALL Platinum／Diamond以上→QR Gold；反向QR Gold→ALL Silver、QR Platinum→ALL Gold。沒有明示所有卡送／配對／試用來源都接受。'),
  s('hotel-qatar-main','Qatar Airways','qatar','https://www.qatarairways.com/en/Privilege-Club/our-partners/accor.html','合作頁將反向觸發描述為首個國際住宿；兩端完整§8.4只寫Eligible Stay。保守呈現境外住宿，台灣境內觸發保留待核。'),
  s('hotel-qatar-base','Qatar Airways','qatar','https://www.qatarairways.com/en/Privilege-Club/terms-and-conditions.html','自營且QR班號及可累積票種須符合；獎勵票與現金票折抵Avios是不同產品，不能混算。'),
  s('hotel-all-air-general','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/partners/conditions/airlines.html','一般表仍有Qatar2,000→1,000，專屬連結合作則2,000→1,500。FB的2:1位在自動轉換章且章末又排除FB自動轉換，手動應讀專屬條款。'),
  s('hotel-fb-terms','雅高 ALL／Flying Blue','accor','https://all.accor.com/a/en/loyalty-program/partners/conditions/airfranceklm.html','完整專屬條款已讀：雙重累積、首住／首飛各1資格晚＋5XP、終身一次、改連12個月；手動ALL→FB 2,000:2,000及反向4,000:1,000。專屬條款明定優先。'),
  s('hotel-fb-main','雅高 ALL','accor','https://all.accor.com/loyalty-program/partners/airfranceklm/index.en.shtml','常設Miles+Points主頁已讀：各自正常累積外再賺另一計畫點數；首次獎勵是資格晚與XP，不是直接送高卡。'),
  s('hotel-fb-transfer-form','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/partners/airlines/airfranceklm/points-transfer.html','專屬表單列2,000→2,000，但模板另寫六週與自動轉換；專屬條款列10天且一般條款不支援FB自動轉換，因此只建立手動路線並保留入帳差異。'),
  s('hotel-all-exceptions','雅高 ALL','accor','https://all.accor.com/a/en/loyalty-program/hotels-exception.html','官方非參與物業／品牌清單已讀；hotelF1、多數ibis budget、部分Hoxton等例外，不能用頁尾品牌列保證接受。'),
  s('hotel-fb-rewards','Flying Blue','flyingblue','https://www.flyingblue.com/en/spend/flights/rewards?country=RS','航空側獎勵票不賺Miles／XP；AF Cash & Miles另有現金部分文字，混合支付觸發常設首次獎勵待核。'),
  s('hotel-fb-cash-miles','Air France','airfranceklm','https://wwws.airfrance.fr/en/information/flyingblue/utilisez-vos-miles/cash-et-miles','航空側Cash & Miles文字與FB獎勵票頁不同；不將混合支付直接判定可觸發合作獎勵。')
];
const r=(id,label,group,exclusive)=>({id,label,group,...(exclusive?{exclusive}:{})});
export const HOTEL_RESOURCES=[
  r('hsbc-premier-points','滙豐卓越紅利積分','點數與帳戶'),r('ihg-points','IHG獎勵點數','點數與帳戶'),r('chase-ihg-select','美國 Chase IHG Premier Select','信用卡'),
  ...[['all-silver','ALL銀卡'],['all-gold','ALL金卡'],['all-platinum','ALL白金'],['all-diamond','ALL鑽卡以上']].map(([id,label])=>r(id,label,'酒店會籍','all')),
  ...[['qr-silver','Qatar Silver'],['qr-gold','Qatar Gold'],['qr-platinum','Qatar Platinum']].map(([id,label])=>r(id,label,'航空會籍','qatar')),
  r('fb-account','Flying Blue帳戶','點數與帳戶'),r('fb-miles','Flying Blue可兌換哩程','點數與帳戶')
];
export const HOTEL_FACTS=[
  {id:'allPartner',label:'ALL目前實際連結哪一家航空合作',options:[['none','未連結'],['qatar','Qatar'],['flying-blue','Flying Blue'],['other','其他航空']]},
  {id:'allLinkAge',label:'若ALL已連其他航空，距前次連結多久',options:[['recent','未滿12個月'],['old','已滿12個月']]},
  {id:'qatarBoostUsed',label:'是否已使用ALL→Qatar一次性會籍快線',options:[['no','尚未使用'],['yes','已使用']]},
  {id:'allQatarBoostUsed',label:'是否已使用Qatar→ALL一次性會籍快線',options:[['no','尚未使用'],['yes','已使用']]},
  {id:'allStatusSource',label:'ALL來源會籍如何取得（往Qatar）',options:[['earned','正常累積'],['card','信用卡贈送（來源接受待核）'],['matched','其他配對（來源接受待核）'],['trial','試用（來源接受待核）'],['approved','本人特殊來源已獲官方確認']]},
  {id:'qatarStatusSource',label:'Qatar來源會籍如何取得（往ALL）',options:[['earned','正常累積'],['card','信用卡贈送（來源接受待核）'],['matched','其他配對（來源接受待核）'],['trial','試用（來源接受待核）'],['approved','本人特殊來源已獲官方確認']]},
  {id:'qatarBoostQuota',label:'本人往Qatar的快線名額',options:[['confirmed','本人名額已確認'],['exhausted','已確認用盡']]},
  {id:'allBoostQuota',label:'本人往ALL的快線名額',options:[['confirmed','本人名額已確認'],['exhausted','已確認用盡']]},
  {id:'qatarFirstFlight',label:'連結後首個QR活動是否已確認合格',options:[['yes','自營QR班號、合格付費票已確認'],['no','目前不符合']]},
  {id:'qatarFirstStay',label:'連結後首個ALL住宿的適用性',options:[['foreign','合格境外實住已確認'],['domestic','台灣境內住宿（官方文字有差異）'],['no','OTA、全點數或其他不合格住宿']]},
  {id:'fbFirstBonus',label:'ALL×FB首次活動獎勵已用哪些',options:[['none','兩種都未用'],['stay','首住已用，首飛未用'],['flight','首飛已用，首住未用'],['both','兩種均已用']]}
];
const c=(fact,allowed,label,extra={})=>({fact,allowed,label,...extra});
const o=(id,title,goal,tree,node,extra={})=>({id,title,goal,tree,node,any:[],all:[],conditions:[],research:'partial',...extra});
const link=partner=>({partner,required:true});
const boostConditions=(source,quota)=>[c(source,['earned','approved'],'此方向的來源為正常累積或本人已確認可接受',{reviewValues:['card','matched','trial']}),c(quota,['confirmed'],'此方向申請當下本人名額已確認')];
export const HOTEL_OPPORTUNITIES=[
  o('N026','萬豪點數→同訂單住五付四','hotel','hotel-use','use-marriott',{all:['marriott-points'],warning:'任何會員可用，但須五個連續全點數標準兌換晚；免最低點數晚，不是任意最後一晚。'}),
  o('N027','Hilton點數＋銀卡以上→第五晚免費','hotel','hotel-use','use-hilton',{all:['hilton-points'],any:['hh-silver','hh-gold','hh-diamond'],warning:'限全點數標準房五連晚以上；不把Points & Money或Premium當作同一優惠。'}),
  o('N028','ALL獎勵點數→合格房價折抵','hotel','hotel-use','use-all',{all:['all-points'],warning:'官網1,000點起；台灣等地櫃檯500點起。仍有參與酒店、房價與支付限制。'}),
  o('N029','指定Chase IHG卡＋點數→第四晚免費','hotel','hotel-use','use-ihg',{all:['ihg-points','chase-ihg-select'],warning:'本圖已核的是美國Premier Select主卡；台灣卡或IHG白金不能替代。其他卡及2027版本分開查。'}),
  o('N030','卓越紅利→ALL／萬豪／IHG','hotel','points-hotel','hsbc-premier',{all:['hsbc-premier-points'],research:'conflict',warning:'銀行2:1已列，但最低量段混用旅遊積分字樣與300單位，不能提供假定可操作的最低額。'}),
  o('N031','ALL高階→首個合格飛行→Qatar會籍','status','all-qatar-status','qatar-boost',{any:['all-gold','all-platinum','all-diamond'],all:['qatar-account'],link:link('qatar'),conditions:[...boostConditions('allStatusSource','qatarBoostQuota'),c('qatarBoostUsed',['no'],'未用過這一方向的一次性快線'),c('qatarFirstFlight',['yes'],'連結後首個QR自營、QR班號合格飛行')],valid_until:'2026-12-31',warning:'ALL Gold→QR Silver；ALL Platinum／Diamond以上→QR Gold，並不是QR Platinum。年度總名額不等於剩餘名額。'}),
  o('N032','Qatar高階→合格住宿→ALL會籍','status','all-qatar-status','all-boost',{any:['qr-gold','qr-platinum'],all:['all-account'],link:link('qatar'),conditions:[...boostConditions('qatarStatusSource','allBoostQuota'),c('allQatarBoostUsed',['no'],'未用過這一方向的一次性快線'),c('qatarFirstStay',['foreign'],'首個合格境外實住已確認',{reviewValues:['domestic']})],valid_until:'2026-12-31',research:'conflict',warning:'QR Gold→ALL Silver；QR Platinum→ALL Gold。行銷頁要求國際住宿，完整條款只寫合格住宿；境內觸發待核。'}),
  o('N033','ALL與Flying Blue同名帳戶連結','hotel','all-flyingblue','fb-link',{all:['all-account','fb-account'],link:{partner:'flying-blue',required:false},warning:'ALL不能同時掛多家航空合作；12個月屆滿也須先解舊連結，重連不重送首次獎勵。'}),
  o('N034','ALL×Flying Blue合格消費雙重累積','hotel','all-flyingblue','fb-dual',{all:['all-account','fb-account'],link:link('flying-blue'),warning:'合格住每€1額外1FB哩；AF／KLM合格飛行每€2額外1ALL點。先連結後完成活動，不泛化所有天合聯盟航班。'}),
  o('N035','ALL×FB首次活動→資格晚與XP','status','all-flyingblue','fb-first',{all:['all-account','fb-account'],link:link('flying-blue'),conditions:[c('fbFirstBonus',['none','stay','flight'],'至少尚有一種首次獎勵未用')],warning:'首住、首飛各1 ALL資格晚＋5XP，合計最多2晚＋10XP；並非直接送金卡。全點數房與混合票觸發仍待核。'}),
  o('N036','已連結ALL→Flying Blue手動轉點','flight','all-flyingblue','all-fb-transfer',{all:['all-points','fb-account'],link:link('flying-blue'),research:'conflict',warning:'專屬手動2,000→2,000；一般自動轉換章殘留2:1且又排除FB自動轉換。只建立手動路線；入帳10天／六週文字差異保留。'}),
  o('N037','Flying Blue→ALL手動轉點','hotel','all-flyingblue','fb-all-transfer',{all:['fb-miles','all-account'],link:link('flying-blue'),warning:'最低4,000FB→1,000ALL；增量與上限未明列，不自行當作可任意倍數或無上限。'})
];
const rule=(id,type,summary,source_ids,values,missing=[])=>({id,type,summary,source_ids,values,missing,checked_on:checked,evidence_status:'selected_primary_terms_verified_gaps_remain',validity:{effective_from:null,effective_until:null},recommendation_ready:false});
export const HOTEL_RULES=[
  rule('R090','point_transfer_conflict','滙豐旅人三家1:1、最低3,000／500；卓越2:1但門檻單位仍待銀行釐清。',['hotel-hsbc-q4','hotel-hsbc-general','hotel-all-hsbc'],{traveller_ratio:1,premier_ratio_in:2,minimum_traveller_input:3000,increment:500,marriott_daily_output_cap:750000,premier_verified_minimum:null},['卓越段混寫旅遊積分3,000／300；費用、年度總上限未列。兩家酒店端台灣HSBC精確比例未獨立互核。']),
  rule('R091','hotel_redemption','ALL官網1,000點抵20歐元，台灣等地櫃檯500點起；銀行轉入門檻與使用門檻不同。',['hotel-all-use','hotel-all-book'],{all_online_minimum:1000,all_online_eur:20,all_taiwan_desk_minimum:500,all_taiwan_desk_eur:10},['官網超過2,000後依2,000倍數；物業參與、部分稅款、預付及取消限制仍以預訂確認。']),
  rule('R092','hotel_redemption','萬豪同訂單五個連續全點數標準晚，免最低點數一晚；任何會員可用。',['hotel-mb-five','hotel-mb-five-faq'],{nights_per_free:5,free_night_is_lowest:true,certificate_counts:false},['免房券、點現與升等部分不套用；可訂房況、總點數與退改依實際訂單。']),
  rule('R093','hotel_redemption','Hilton銀卡以上全點數標準房五連晚，適用第五晚免費；20晚最多免四晚。',['hotel-hilton-five','hotel-hilton-terms'],{nights_per_free:5,maximum_free_nights:4,maximum_consecutive_nights:20,silver_or_above_required:true},['標準房與Premium、Points & Money分開；實際所需總點數以官方訂單為準。']),
  rule('R094','hotel_redemption','IHG第四晚免費屬指定Chase卡福利，不由台灣卡或IHG白金自動取得。',['hotel-ihg-faq','hotel-ihg-select','hotel-ihg-2026','hotel-ihg-traveler-2027'],{nights_per_free:4,taiwan_card_alone_eligible:false,ihg_platinum_alone_eligible:false},['本圖僅核Premier Select主卡；免年費卡2027起另有5,000美元年度消費條件，其他卡及本人生效版本另核。']),
  rule('R095','partner_status','ALL高階與Qatar高階有雙向一次性會籍加速，須先連結並完成首個合格活動。',['hotel-qatar-cross','hotel-qatar-air','hotel-qatar-main'],{all_gold_to_qr:'Silver',all_platinum_diamond_to_qr:'Gold',qr_gold_to_all:'Silver',qr_platinum_to_all:'Gold',qatar_status_months:12,silver_2026_quota:6600,gold_2026_quota:3100},['來源接受、剩餘名額、等級判定日及升等處理時間未全明示；反向境內住宿有官方文字差異。']),
  rule('R096','dual_earning','ALL×Qatar酒店額外Avios依品牌不同；合格QR飛行每2美元額外1ALL點。',['hotel-qatar-cross','hotel-qatar-air','hotel-qatar-base'],{hotel_avios_per_eur10:[10,5,4,2],flight_usd_per_all_point:2},['新加入QR會員的飯店Avios國際活動門檻，不移植成會籍快線一律須新會員。']),
  rule('R097','point_transfer_conflict','ALL×Qatar已連結專屬轉點採2,000→1,500，反向3,500→1,000；一般表仍有不同數字。',['hotel-qatar-cross','hotel-qatar-air','hotel-all-air-general'],{all_to_avios_in:2000,all_to_avios_out:1500,avios_to_all_in:3500,avios_to_all_out:1000},['只確認最低量；增量、單次／每日／年度上限未明列，兩向不可逆，點數入帳最多六週。']),
  rule('R098','dual_earning','ALL×Flying Blue合格住宿每歐元額外1哩；AF／KLM合格飛行每2歐元額外1ALL點。',['hotel-fb-terms','hotel-fb-main','hotel-all-exceptions'],{fb_miles_per_hotel_eur:1,flight_eur_per_all_point:2},['先連結後完成活動；OTA、特殊房價及非參與酒店排除，並非任意天合航班。']),
  rule('R099','status_qualification_bonus','ALL×FB首住、首飛各送1資格晚＋5XP，合計最多2晚＋10XP，重連不重送。',['hotel-fb-terms','hotel-fb-main','hotel-fb-rewards','hotel-fb-cash-miles'],{all_first_total_nights:2,fb_first_total_xp:10,guaranteed_gold_status:false},['全點數住宿及混合支付航班能否觸發首次獎勵待核；不用2024已截止加碼活動代替常設條款。']),
  rule('R100','point_transfer_conflict','ALL×FB專屬手動轉點2,000:2,000；反向FB4,000:ALL1,000，各自不可逆。',['hotel-fb-terms','hotel-fb-transfer-form','hotel-all-air-general'],{all_fb_input:2000,all_fb_output:2000,fb_all_input:4000,fb_all_output:1000,automatic_transfer_supported:false},['ALL→FB專屬10天、表單六週差異保留；FB→ALL專屬即時。最低量不代表已核增量或無上限。']),
  rule('R101','partner_link_conflict','ALL只能選一個航空雙重累積合作；滿12個月也要先解舊連結再改連，重連不重置首次福利。',['hotel-qatar-cross','hotel-fb-terms'],{minimum_months_since_previous_link:12,parallel_airline_links:false,relink_resets_first_bonus:false},['跨洲搬遷客服例外；未入帳前解綁可能影響追補，不自動執行解除或連結。'])
];
HOTEL_RULES.find(item=>item.id==='R090').validity={effective_from:'2026-10-01',effective_until:'2026-12-31'};
export const HOTEL_COVERAGE=[
  {id:'hotel-redemption-rules',name:'萬豪／Hilton連住獎勵、ALL折抵與IHG卡片條件',source_ids:['hotel-mb-five','hotel-hilton-five','hotel-all-use','hotel-ihg-select'],rule_ids:['R091','R092','R093','R094'],note:'已核各計畫核心使用限制，未連接即時房況、個人報價與實際申請。'},
  {id:'hsbc-six-hotel-edges',name:'滙豐兩種積分與三家酒店六條轉點關係',source_ids:['hotel-hsbc-q4','hotel-hsbc-general','hotel-all-hsbc'],rule_ids:['R090'],note:'旅人3,000／500已核；卓越門檻單位與兩家酒店端比例仍有缺口。'},
  {id:'all-qatar-status',name:'ALL×Qatar兩向一次性會籍快線',source_ids:['hotel-qatar-cross','hotel-qatar-air','hotel-qatar-main'],rule_ids:['R095','R096','R097','R101'],note:'雙方核心條款互核；剩餘名額、非正常來源及境內住宿觸發保留待核。'}
].map(item=>({category:'cross_program_rules',priority:'P1',scope:'2026-10-25選定欄位查核',research_status:'selected_fields_verified_gaps_remain',...item}));
