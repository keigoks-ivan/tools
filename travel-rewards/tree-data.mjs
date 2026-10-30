import {EXTRA_TREES,RESOURCE_BINDINGS,OP_BINDINGS} from './network-views.mjs?v=20261031-2';
import {PARTNER_TREES,STAY_BINDINGS} from './partner-views.mjs?v=20261031-2';
import {HOTEL_TREES,extendHotelViews} from './hotel-partners-views.mjs?v=20261031-2';
import {BANK_TREES} from './bank-entries-views.mjs?v=20261031-2';
import {IH_TREES,extendIhViews} from './ihg-hyatt-data.mjs?v=20261031-2';
const checked='2026-10-24';
const source=(id,publisher,url,access,note)=>({id,publisher,url,access,note,checked_on:checked,kind:'official',ownership_group:new URL(url).hostname});

export const TREE_SOURCES=[
  source('tree-visa-gha','Visa 台灣','https://www.visa.com.tw/zh_tw/visa-offers-and-perks/gha-discovery/173472?cardProduct=42&paymentType=9','live_browser_terms','即時頁面已讀：無限卡對應鈦金，御璽／白金對應白金；優惠至2027-12-31。仍需以合格卡片通過官方入口驗證。'),
  source('tree-mc-gha','Mastercard 亞太','https://origin-apac.mastercard.com/en-ap/offers/GHA_DISCOVERY?Oid=202111090004&issuerId=201808088888&productId=202004160026','live_browser_terms','完整活動本文與條款已讀：台灣指定卡可用，World Legend／世界之極對應鈦金，世界卡對應白金；活動至2026-12-31。實際卡片仍須驗證，入住與退房須出示合格同名卡。'),
  source('tree-mc-wyndham','Mastercard 亞太','https://origin-apac.mastercard.com/en-ap/offers/Wyndham_Hotels___Resorts_%28Wyndham_Rewards%29?Oid=201912180093&issuerId=201810190031&productId=201810200234','official_search_excerpt_only','官方索引列世界之極可申請鑽卡及台灣發卡市場；本文僅取得選卡外框。個別卡片、活動期限與核准條件待完整條款確認。'),
  source('bw-match','Best Western','https://www.bestwestern.com/en_US/best-western-rewards/status-match.html','page_body','官方配對頁已讀。北美以外會員列bwr.service@bestwestern.com；等級由品牌審核，不能保證GHA或Wyndham來源必配精選鑽石。'),
  source('tree-choice-status','Choice Privileges','https://www.choicehotels.com/en-uk/choice-privileges/benefits/status-match','page_body','公開活動列美國、加拿大、歐洲、加勒比海、拉丁美洲及墨西哥會員；台灣未列。頁面另列澳紐聯絡方式，不能據此推定台灣居民適用。'),
  source('tree-choice-rules','Choice Privileges','https://www.choicehotels.com/choice-privileges/rules-regulations','official_search_excerpt_only','規則的配對最高為白金，等級由品牌決定；尚未取得BW精選鑽石固定配至白金及台灣資格的官方確認。'),
  source('tree-sas-scandic','SAS 北歐航空','https://www.flysas.com/en/eurobonus/partners/hotels/scandic','page_body','已讀等級對應、帳戶及效期條款：至少一個帳戶成立30天；Scandic第5級對應SAS金卡，效期沿用Scandic來源等級。'),
  source('tree-scandic-sas','Scandic','https://www.scandichotels.com/en/scandic-friends/partners/sas-eurobonus','page_body','已讀雙方合作頁；合作存在不代表BW來源四晚挑戰已對所有台灣會員開放，該挑戰仍須書面核准。'),
  source('tree-tk-sas-history','土耳其航空','https://www.turkishairlines.com/en-my/miles-and-smiles/news/','page_body','找到SAS會籍配對的2024年8月官方新聞。此歷史公告不能確認2026年仍開放，四個月、首航及延長條件均待當期書面核准。'),
  source('tree-rj-faq','約旦航空配對活動／StatusMatch','https://rj.statusmatch.com/faq/','page_body','活動FAQ列可接受SAS及土航高階會籍，同時要求列名居住地與該國身分文件；台灣未列。'),
  source('tree-rj-terms','約旦航空配對活動／StatusMatch','https://rj.statusmatch.com/terms/','page_body','當期一般條款1.4(j)排除串接配對取得的來源會籍；另列國家證件、金卡申請費149美元、核准後12個月及每人一次。')
];

export const TREE_STATUS={
  scheduled:{label:'已公告，尚未生效',short:'未來版本',tone:'scheduled'},
  start:{label:'先確認資源',short:'起點',tone:'start'},
  verified:{label:'這一段規則已查',short:'官方規則',tone:'verified'},
  pending:{label:'規則已查，須申請或核准',short:'須申請',tone:'pending'},
  unverified:{label:'條款還沒查實',short:'條款待核',tone:'unverified'},
  blocked:{label:'台灣未列適用地區',short:'地區限制',tone:'blocked'},
  excluded:{label:'串接來源遭條款排除',short:'來源排除',tone:'blocked'},
  closed:{label:'本梯次新件已截止',short:'新件截止',tone:'historical'},
  historical:{label:'只有歷史公告',short:'當期待核',tone:'historical'}
};

const BASE_TREES=[
  {
    id:'sas-chain',name:'從信用卡到 SAS',description:'卡組織禮遇 → 酒店會籍 → 航空會籍；保留 Choice、土航與約旦分支。',width:1280,height:670,
    note:'依社群文章摘錄整理，原文網址與發表日期待補。箭頭表示候選串接；每一段須各自符合條件；約旦現行條款排除串接配對來源，不能把整串當作三大聯盟保證路線。',
    nodes:[
      {id:'visa',x:24,y:90,title:'Visa 無限卡',subtitle:'先確認實際卡等',kind:'信用卡',status:'start',outcome:'可檢查 Visa 的 GHA 會籍禮遇',requirements:['不是所有Visa卡都配鈦金；無限卡與御璽／白金卡的目標等級不同。','華航聯名卡也要再確認卡別，不能只看聯名品牌。'],cost:'依原信用卡年費；不要把既有年費重算成這次新增支出。',timing:'先通過Visa官方卡片資格驗證，再登錄會籍。',source_ids:['tree-visa-gha']},
      {id:'mastercard',x:24,y:290,title:'Mastercard',subtitle:'世界之極等指定卡等',kind:'信用卡',status:'start',outcome:'GHA指定卡等規則已讀，Wyndham分支仍待核',requirements:['GHA當期活動列台灣指定卡：World Legend／世界之極配鈦金，世界卡配白金，白金／鈦金卡配金卡。','實際卡片須通過入口驗證；Wyndham分支尚未取得完整卡別條款。'],cost:'GHA會籍配對列免費；信用卡年費與Wyndham方案另外核對。',timing:'GHA活動至2026-12-31；Wyndham個別方案與期限待核。',source_ids:['tree-mc-gha','tree-mc-wyndham']},
      {id:'gha',x:260,y:110,title:'GHA 鈦金',subtitle:'由合格卡片申請',kind:'酒店會籍',status:'pending',outcome:'取得正式核准的GHA會籍後，才有後續配對來源',claim:'文章提到經由Visa白金秘書取得GHA鈦金。',verdict:'秘書服務名稱不能用來判定卡等。目前Visa台灣頁列無限卡配鈦金、御璽／白金卡配白金，須看實際卡片。',requirements:['Visa無限卡規則已讀；仍須卡片驗證並完成官方登錄。','Mastercard世界之極等合格卡對應鈦金；入住與退房須出示合格同名Mastercard。'],cost:'Visa及Mastercard頁均列免費會籍配對；信用卡年費另按實際卡別。',timing:'Visa優惠至2027-12-31，Mastercard至2026-12-31；會籍效期依加入年及後一曆年規則。',source_ids:['tree-visa-gha','tree-mc-gha']},
      {id:'wyndham',x:260,y:340,title:'Wyndham 鑽卡',subtitle:'Mastercard 候選分支',kind:'酒店會籍',status:'unverified',outcome:'須先確認實際獲發鑽卡，才能當作下一段來源',requirements:['官方索引列世界之極及台灣發卡市場，但未取得個別卡號的完整活動條款。','活動次數、期限、既有會籍與實際核准結果待驗。'],cost:'索引描述為贈送快升；完整費用及限制待核。',timing:'以實際當期入口及核准通知為準。',source_ids:['tree-mc-wyndham']},
      {id:'bw',x:496,y:210,title:'Best Western',subtitle:'目標：鑽石／精選鑽石',kind:'酒店配對',status:'pending',outcome:'BW核准的等級，不保證一定為精選鑽石',claim:'文章以GHA鈦金或Wyndham鑽卡配對BW黑鑽／鑽卡。',verdict:'官方有免費配對機制，但對應等級由BW審核；下一段若要求精選鑽石，拿到較低等級不能視為同樣接通。',requirements:['提出其他酒店高階會籍與姓名一致的有效證明。','台灣屬北美以外，官方頁列聯絡信箱為 bwr.service@bestwestern.com。','取得書面核准與實際等級，再評估Choice或Scandic。'],cost:'官方配對程序免費；不代送申請或個人證件。',timing:'依品牌審核；來源及BW會籍效期須分別保存。',source_ids:['bw-match']},
      {id:'choice',x:732,y:20,title:'Choice 白金',subtitle:'BW 旁支，非必經',kind:'額外酒店會籍',status:'blocked',outcome:'保留文章中的支線，不列為台灣居民可直接使用',requirements:['公開活動適用地區未列台灣。','即使住在其他適用地區，是否接受BW來源、配對到哪級仍由品牌核准。','Choice分支不是接到SAS的必要步驟。'],cost:'不在台灣適用性未明時安排額外住宿或申請費。',timing:'公開配對有終身次數與效期規則；當期適用性先核對。',source_ids:['tree-choice-status','tree-choice-rules']},
      {id:'scandic',x:732,y:210,title:'Scandic 第 5 級',subtitle:'四晚挑戰：先取得核准',kind:'酒店挑戰',status:'unverified',outcome:'完成帳戶適用挑戰後，才可能取得第5級',claim:'文章描述用BW精選鑽石開啟四晚挑戰，今年免D-Number。',verdict:'未取得2026年對台灣會員普遍開放的四晚挑戰正式條款；四晚與免D-Number均保留為待核線索。',requirements:['先向Scandic確認是否接受你的BW等級及取得來源。','取得書面核准、合格房晚、起迄、效期及D-Number要求。','不要把SAS合作存在，當成四晚挑戰也一定存在。'],cost:'取得核准後才計算新增合格住宿、交通及其他支出。',timing:'依個別核准；不預設人人四晚都能升等。',source_ids:['tree-scandic-sas'],route_id:'P009'},
      {id:'sas',x:968,y:210,title:'SAS 金卡',subtitle:'天合聯盟高階會籍',kind:'航空配對',status:'verified',outcome:'適格Scandic第5級可對應EuroBonus金卡',claim:'文章寫兩個帳戶都須滿30天，並可取得固定12個月SAS金卡。',verdict:'官方目前要求至少一個帳戶成立30天；SAS配對後效期跟隨Scandic來源等級，不能一律寫12個月。',requirements:['至少一個計畫帳戶成立30天，且年滿18歲。','兩邊姓名、電郵、電話及生日等會員資料須一致。','確認Scandic實際等級、來源效期及帳戶是否符合配對資格。'],cost:'這一段以官方帳戶連結與配對為主；前段挑戰住宿成本仍另計。',timing:'至少一帳成立30天；金卡到期日沿用Scandic來源等級。',source_ids:['tree-sas-scandic','tree-scandic-sas'],rule_ids:['R016','R017','R018']},
      {id:'turkish',x:968,y:370,title:'土耳其航空 Elite',subtitle:'星空聯盟候選分支',kind:'航空挑戰',status:'historical',outcome:'需取得目前有效的土航配對或挑戰核准',claim:'文章描述四個月挑戰、先飛一次，再延長金卡。',verdict:'查到的官方SAS專案公告為2024年8月，不能據此確認2026年仍可申請；本文的四個月與延長條件尚待當期書面核准。',requirements:['確認目前是否接受SAS金卡及配對取得的會籍來源。','先取得帳戶適用的核准，再確認首航、航段、艙等、里程與期限。','未核准前，不把任何土航機票當作必然可完成挑戰。'],cost:'新增合格付費機票與定位費另計，未確認前不報固定總價。',timing:'目前只確認歷史公告存在；2026方案待核。',source_ids:['tree-tk-sas-history']},
      {id:'royal',x:968,y:530,title:'約旦航空金卡',subtitle:'串接來源排除＋地區限制',kind:'付費航空配對',status:'excluded',outcome:'這條串接配對來源不符合當期約旦條款',claim:'文章以土航金卡申請約旦航空，並提醒可能驗證身分。',verdict:'現行一般條款1.4(j)排除串接配對取得的來源會籍，因此本圖經Scandic取得SAS、再配土航的來源不能直接接到約旦。另有居住地與證件限制，台灣未列。',requirements:['來源會籍若經其他計畫串接配對取得，現行條款明列拒絕；臨時或挑戰會籍亦可能不被接受。','即使另有實際飛行取得的SAS或土航會籍，也須符合列名居住地及相應國家身分文件；台灣未列。','FAQ列SAS與土航來源不代表所有取得方式均適用；本人帳戶、同名證明與每人一次等條件另核。'],cost:'當期金卡申請費牌告149美元；其他方案、稅費及退款依條款。',timing:'核准後12個月；活動可變更或提前結束。',source_ids:['tree-rj-faq','tree-rj-terms']}
    ],
    edges:[
      {id:'visa-gha',from:'visa',to:'gha',status:'verified',label:'卡等驗證＋登錄'},
      {id:'mc-gha',from:'mastercard',to:'gha',status:'verified',label:'指定卡等＋驗證'},
      {id:'mc-wyndham',from:'mastercard',to:'wyndham',status:'pending',label:'贈卡資格待驗'},
      {id:'gha-bw',from:'gha',to:'bw',status:'pending',label:'等級須核准'},
      {id:'wyndham-bw',from:'wyndham',to:'bw',status:'pending',label:'等級須核准'},
      {id:'bw-choice',from:'bw',to:'choice',status:'blocked',label:'旁支／地區限制'},
      {id:'bw-scandic',from:'bw',to:'scandic',status:'pending',label:'四晚方案待核'},
      {id:'scandic-sas',from:'scandic',to:'sas',status:'verified',label:'帳齡＋等級連結'},
      {id:'sas-tk',from:'sas',to:'turkish',status:'historical',label:'2026是否受理？'},
      {id:'tk-rj',from:'turkish',to:'royal',status:'excluded',label:'串接來源排除'},
      {id:'sas-rj',from:'sas',to:'royal',status:'excluded',label:'串接來源排除',side:'right'}
    ]
  },
  {
    id:'marriott-sq',name:'萬豪與新航互接',description:'從實際已有的會籍選分支，不把華航卡當作新航金卡。',width:800,height:650,note:'每人一次性合作登錄；贈送會籍、試用會籍、既有等級與合格航班／住宿仍須逐項核對。',
    nodes:[
      {id:'mb-gold',x:40,y:60,title:'萬豪金卡',subtitle:'已有的會籍起點',kind:'酒店會籍',status:'start',outcome:'可檢查新航銀卡挑戰',requirements:['先確認已持有正式萬豪金卡及取得來源。'],cost:'不預設需要額外付費取得會籍。',timing:'使用一次性合作前，先比較其他分支。',rule_ids:['R060','R061','R063']},
      {id:'sq-silver',x:400,y:60,title:'新航菁英銀卡',subtitle:'六個月內兩趟合格飛行',kind:'航空挑戰',status:'verified',outcome:'萬豪金卡對應的銀卡挑戰',requirements:['需先登錄，限合格付費新航航班；G團體票、獎勵票及共掛班號排除。','既有新航銀卡以上不適用此銀卡分支，且不能正在參加其他配對挑戰。'],cost:'兩趟合格航班的新增成本，依實際票價。',timing:'登錄後六個月；里程須於規定期間入帳。',rule_ids:['R060','R061','R063'],route_id:'P012'},
      {id:'mb-plat',x:40,y:270,title:'萬豪白金以上',subtitle:'白金／鈦金／大使',kind:'酒店會籍',status:'start',outcome:'可檢查新航金卡加速',requirements:['需適格正式會籍；試用來源不適用，其他來源仍須審核。'],cost:'已有會籍不重複計入取得成本。',timing:'登錄會使用一次性合作機會。',rule_ids:['R060','R062','R063']},
      {id:'sq-gold',x:400,y:270,title:'新航菁英金卡',subtitle:'六個月內四趟合格飛行',kind:'航空挑戰',status:'verified',outcome:'先取得適格銀卡，再完成金卡加速',requirements:['先登錄萬豪與新航合作；核對既有等級及其他挑戰。','四趟合格付費新航；哩程依限期累積至新航帳戶。'],cost:'四趟合格飛行的增量成本另算。',timing:'登錄後六個月。',rule_ids:['R060','R062','R063'],route_id:'P005'},
      {id:'sq-elite-source',x:40,y:480,title:'新航金卡／PPS',subtitle:'必須另有此會籍',kind:'航空會籍',status:'start',outcome:'可檢查萬豪白金十晚加速',requirements:['華航聯名卡或華航金卡不能直接替代新航會籍。'],cost:'不把其他航空的金卡視作已取得新航金卡。',timing:'先核對帳戶資格，再登錄。',rule_ids:['R033','R060']},
      {id:'mb-plat-target',x:400,y:480,title:'萬豪白金',subtitle:'六個月內十晚合格實住',kind:'酒店挑戰',status:'verified',outcome:'新航高階會員專屬加速分支',requirements:['新航Gold／PPS等適格會員，且萬豪尚未白金以上。','限合格房價住宿；獎勵住宿及贈送房晚不計入此十晚。'],cost:'只計為挑戰新增的合格住宿及交通費。',timing:'登錄後六個月。',rule_ids:['R033','R060'],route_id:'P006'}
    ],
    edges:[{id:'mbg-sqs',from:'mb-gold',to:'sq-silver',label:'兩趟合格飛行',status:'verified'},{id:'mbp-sqg',from:'mb-plat',to:'sq-gold',label:'四趟合格飛行',status:'verified'},{id:'sqg-mbp',from:'sq-elite-source',to:'mb-plat-target',label:'十晚合格實住',status:'verified'}]
  },
  {
    id:'ci-card',name:'華航卡可以接什麼',description:'先辨認卡別：累哩兌票與贈送金卡是兩種不同分支。',width:1100,height:650,note:'華航哩程、華航金卡、卡片貴賓室與聯盟權益各有條件，不互相視為已取得。',
    nodes:[
      {id:'ci-priority',x:40,y:70,title:'鼎尊無限卡',subtitle:'中信華航聯名卡',kind:'信用卡',status:'start',outcome:'華夏哩程及首次金卡禮遇的候選起點',requirements:['確認實際卡別及本人正附卡資格。'],cost:'主卡牌告年費22,000元。',timing:'迎新、續卡與會籍的條件分開核對。',rule_ids:['R026','R027']},
      {id:'ci-precious',x:40,y:280,title:'璀璨無限卡',subtitle:'中信華航聯名卡',kind:'信用卡',status:'start',outcome:'華夏哩程及首次金卡禮遇的候選起點',requirements:['確認實際卡別；贈金卡分支限正卡。'],cost:'主卡牌告年費8,000元。',timing:'迎新、續卡與會籍的條件分開核對。',rule_ids:['R026','R027']},
      {id:'ci-signature',x:40,y:490,title:'商務御璽卡',subtitle:'沒有這項贈金卡禮遇',kind:'信用卡',status:'start',outcome:'華夏哩程累積分支',requirements:['不能因同屬華航聯名卡就套用無限卡贈金卡。'],cost:'主卡牌告年費1,800元，首年免年費與續年條件另核。',timing:'依一般消費及自動轉哩規定。',rule_ids:['R026','R051','R052']},
      {id:'ci-miles',x:440,y:370,title:'華夏哩程',subtitle:'每500點自動轉哩',kind:'航空里程',status:'verified',outcome:'累積華航獎勵哩程，與新航里程不同',requirements:['基本累積依卡別為18／20／30元一點；生日及指定消費加碼有上限。','逐筆計算與點數效期、綁定會員、自動轉換規則另核。'],cost:'實際刷卡金額、年費及放棄的現金回饋都要納入。',timing:'每500點自動轉換，實際入帳仍依銀行。',rule_ids:['R026','R051','R052'],route_id:'P002'},
      {id:'ci-gold',x:440,y:100,title:'華夏金卡',subtitle:'首次禮遇，非新航金卡',kind:'航空會籍',status:'pending',outcome:'鼎尊／璀璨合資格首次會員才可申請',requirements:['每人一次；鼎尊正卡及首張附卡、璀璨正卡。','首次申辦、綁定、首刷、年費入帳及有效持卡需核實。','原已有華航金卡以上不再延長；不等同天合聯盟超級菁英。'],cost:'依已持卡別費用，不視作可免費取得其他航空金卡。',timing:'當期活動至2026-12-31；鼎尊最優二年、璀璨一年。',rule_ids:['R027','R053'],route_id:'P013'},
      {id:'ci-award',x:840,y:370,title:'華航獎勵機票',subtitle:'依航線、艙等與供給級距',kind:'旅行目標',status:'pending',outcome:'先查實際空位與稅費，再計算兌票價值',requirements:['經濟艙與商務艙、日期、人數需分別查詢。','最低哩數不代表當天有空位；持卡人專屬獎項另核對。'],cost:'哩程、稅費、定位航班及現金替代價一起比較。',timing:'本工具未連接即時機位與票務。',rule_ids:['R015','R055'],route_id:'P002'}
    ],
    edges:[{id:'cip-miles',from:'ci-priority',to:'ci-miles',label:'基本18元／點',status:'verified'},{id:'cic-miles',from:'ci-precious',to:'ci-miles',label:'基本20元／點',status:'verified'},{id:'cis-miles',from:'ci-signature',to:'ci-miles',label:'基本30元／點',status:'verified'},{id:'cip-gold',from:'ci-priority',to:'ci-gold',label:'首次資格另核',status:'pending'},{id:'cic-gold',from:'ci-precious',to:'ci-gold',label:'首次資格另核',status:'pending'},{id:'miles-award',from:'ci-miles',to:'ci-award',label:'查空位＋稅費',status:'pending'}]
  }
];

const sqTree=BASE_TREES.find(item=>item.id==='marriott-sq');
sqTree.height=850;
sqTree.nodes.push({id:'sq-silver-source',x:40,y:690,title:'新航菁英銀卡',subtitle:'萬豪目前須無高階會籍',kind:'航空會籍',status:'start',outcome:'可檢查3晚萬豪銀卡分支',resources:['sq-silver'],requirements:['萬豪目前無任何Elite等級；先比較未來一次性合作的啟用順序。'],cost:'已持有新航銀卡；新增住宿另計。',timing:'登錄後六個月。',rule_ids:['R076']},{id:'sq-silver-mb',x:400,y:690,title:'萬豪銀卡挑戰',subtitle:'六個月內3晚合格付費實住',kind:'酒店挑戰',status:'verified',outcome:'依合作取得萬豪Silver，不是Gold或Platinum',resources:['mb-silver'],opportunity_id:'N025',requirements:['新航正式Elite Silver及萬豪無Elite；本人付費合格實住。','點數、點現、免費住宿獎勵排除；MEA仍待個別確認。'],cost:'只計新增合格住宿與交通。',timing:'登錄六個月，核發效期依合作條款。',rule_ids:['R076']});
sqTree.edges.push({id:'sqs-mbs',from:'sq-silver-source',to:'sq-silver-mb',label:'3晚合格付費實住',status:'verified'});
export const TREES=[...BASE_TREES,...EXTRA_TREES,...PARTNER_TREES,...HOTEL_TREES,...BANK_TREES,...IH_TREES];
extendHotelViews(TREES);
extendIhViews(TREES);
for(const graph of TREES){
  graph.goals??=graph.id==='ci-card'?['status','flight']:['status'];
  for(const item of graph.nodes){
    item.resources??=RESOURCE_BINDINGS[graph.id]?.[item.id]||[];
    item.opportunity_id??=OP_BINDINGS[graph.id]?.[item.id]||null;
    item.stay_policy??=STAY_BINDINGS[graph.id]?.[item.id];
    if(item.resources.some(id=>['mb-platinum-exact','mb-titanium','mb-ambassador'].includes(id)))item.bridge_resources=[...new Set([...(item.bridge_resources||[]),'mb-platinum'])];
    if(graph.id==='ci-card'&&['ci-priority','ci-precious'].includes(item.id))item.bridge_resources=['visa-infinite'];
  }
}
