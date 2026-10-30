import {networkNode as n,networkEdge as e} from './network-views.mjs?v=20261030-17';
const note='轉點、實際兌房、資格點與會籍分開。先看每一段的必要條件；亮線不代表帳戶核准或房況可訂。';
export const HOTEL_TREES=[
  {id:'hotel-use',name:'飯店點數怎麼用',goals:['hotel'],width:1100,height:690,description:'先選要住哪一家，再看連住優惠、房型與會員條件，最後用同日期、同房型現金價試算。',note,nodes:[
    n('use-mb-source',20,20,'萬豪獎勵點數','持有點數不代表有房',['marriott-points'],null,['R092'],['用實際可訂的全段點數與現金房價比較。'],'點數與原銀行積分的替代用途。','預訂前先看房況與取消條件。','start',{kind:'酒店點數'}),
    n('use-marriott',390,20,'萬豪住五付四','免全段最低點數晚',[],'N026',['R092'],['任何會員；同一訂單五個連續標準兌換晚。','免房券、點現與升等部分不能直接套用。'],'不要假設免最後一晚，也不要再從已優惠的官方總點數扣一次。','以實際全段預訂報價為準。','verified',{kind:'旅行目標',hotel_program:'marriott'}),
    n('use-hh-source',20,185,'Hilton獎勵點數','還要銀卡以上會員',['hilton-points'],null,['R093'],['全點數標準房；Premium與Points & Money不同。'],'依原點數機會成本。','先核對實際會員等級。','start',{kind:'酒店點數'}),
    n('use-hilton',390,185,'Hilton第五晚免費','銀卡以上＋全點數標準房',[],'N027',['R093'],['同一酒店五連晚以上；20晚最多四個免費晚。','需已核准Silver以上；持卡禮遇未啟用不當作已有Gold。'],'使用官方總點數，不自行重複扣免費晚。','房型、日期及官方預訂價格為準。','verified',{kind:'旅行目標',hotel_program:'hilton'}),
    n('use-all-source',20,350,'ALL獎勵點數','不是Status points',['all-points'],null,['R091'],['先查酒店與房價可用點數折抵。'],'每1,000點標示20歐元，不是固定台幣價值。','匯率與適用方式依實際付款。','start',{kind:'酒店點數'}),
    n('use-all',390,350,'ALL住宿折抵','台灣櫃檯500點起',[],'N028',['R091'],['官網1,000點起，2,000以上依2,000倍數；櫃檯另有地區規則。','台灣等地500點起抵10歐元；不代表所有品牌與房價適用。'],'預付不可退價須有部分卡款，部分稅款不能用點數。','取消及點數退還依房價與使用方式。','verified',{kind:'旅行目標',hotel_program:'all'}),
    n('use-ihg-source',20,515,'IHG點數＋指定卡','不由白金等級自動取得',['ihg-points','chase-ihg-select'],null,['R094'],['本圖已核美國Chase Premier Select主卡；不是台灣可普遍申辦。'],'年費與真實持卡資格另計。','其他卡及2027版本分開核對。','start',{kind:'酒店點數'}),
    n('use-ihg',390,515,'IHG第四晚免費','指定Chase卡＋四連晚',[],'N029',['R094'],['同酒店連續全點數標準獎勵住宿四晚以上。','Points & Cash、現金房及單有IHG白金均不能代替。'],'仍須付雜費及適用度假村費。','本人卡與會員帳戶均須有效。','verified',{kind:'旅行目標',hotel_program:'ihg'}),
    n('use-compare',790,265,'同條件比較現金價','帶入實際報價才算價值',[],null,['R091','R092','R093','R094'],['同日期、房型、人數、早餐及退改條件。','比較整段所需點數、仍付現金、轉點費與銀行積分替代價值。'],'下方提供四計畫比較與淨節省試算。','沒有即時房況、價格或保證訂房。','pending',{kind:'旅行目標',hotel_program:'choose'})
  ],edges:[e('use-mb','use-mb-source','use-marriott','verified'),e('use-hh','use-hh-source','use-hilton','verified'),e('use-all-e','use-all-source','use-all','verified'),e('use-ihg-e','use-ihg-source','use-ihg','verified'),e('mb-compare','use-marriott','use-compare'),e('hh-compare','use-hilton','use-compare'),e('all-compare','use-all','use-compare'),e('ihg-compare','use-ihg','use-compare')]},
  {id:'all-qatar-status',name:'ALL與Qatar會籍快線',goals:['status'],width:1100,height:650,description:'指定高階會籍，先連結，再完成第一個合格飛行或住宿；兩方向一次性與效期不同。',note:'2026年度名額：每方向Silver 6,600、Gold 3,100，剩餘名額未知。非正常累積來源、境內住宿與本人核准仍待確認。',nodes:[
    n('all-high-source',20,40,'ALL指定高階','Gold／Platinum／Diamond',['all-gold','all-platinum','all-diamond'],null,['R095','R101'],['先確認目前ALL的航空連結；不能同時連Qatar與FB。','卡送、配對與試用來源未明示一概接受。'],'只計為這條路新增的消費。','來源與當前名額另核。','start'),
    n('qatar-first-flight',370,40,'首個合格QR飛行','先連結，再自營QR班號',[],null,['R095','R096'],['必須符合Privilege Club累積定義，獎勵票與不合格票不當作付費票。','新加入QR的飯店Avios國際活動條件，不移植成快線都須新會員。'],'新增合格機票與交通。','依首個合格活動及帳戶審核。','pending',{kind:'航空挑戰'}),
    n('qatar-boost',770,40,'Qatar銀卡／金卡','ALL鑽卡也不是QR白金',['qr-silver','qr-gold'],'N031',['R095','R101'],['ALL Gold→QR Silver；ALL Platinum／Diamond以上→QR Gold。','一次性、年度名額；解綁重連不能重領。'],'不把名額總數當作今天仍有名額。','Qatar快線等級12個月，處理時間未明列。','verified',{kind:'航空會籍'}),
    n('qatar-high-source',20,350,'Qatar指定高階','Gold／Platinum',['qr-gold','qr-platinum'],null,['R095'],['這是高階會籍來源，不是持有Avios即可。','目前會籍、來源及同名帳戶需核對。'],'依原有資源。','先看一次性機會是否已使用。','start',{kind:'航空會籍'}),
    n('all-first-stay',370,350,'合格境外實住','台灣境內觸發仍待核',[],null,['R095','R096'],['Qatar行銷頁寫國際住宿，完整合作條款只寫合格住宿。','需本人合格房價與管道；OTA、全點數住宿及日間房不能套用。'],'新增境外住宿及交通，不為未確認的境內觸發湊晚。','正常ALL資格晚可計，不代表此合作能觸發。','pending',{kind:'酒店挑戰',stay_policy:'all-qatar'}),
    n('all-boost',770,350,'ALL銀卡／金卡','QR Gold／Platinum對應不同',['all-silver','all-gold'],'N032',['R095'],['QR Gold→ALL Silver；QR Platinum→ALL Gold。','既有目標會籍能否延長與非正常來源仍個別核對。'],'不把已持同級會籍當作一定能延長。','取得當年餘期＋次一曆年；一次性不續送。','verified')
  ],edges:[e('all-flight','all-high-source','qatar-first-flight','pending','同名連結＋來源＋名額'),e('flight-qr','qatar-first-flight','qatar-boost','verified','依來源等級對應'),e('qr-stay','qatar-high-source','all-first-stay','pending','同名連結＋來源＋名額'),e('stay-all','all-first-stay','all-boost','verified','依來源等級對應')]},
  {id:'all-flyingblue',name:'ALL與Flying Blue',goals:['hotel','flight','status'],width:1100,height:690,description:'雙重累積、首次活動資格獎勵、兩向手動轉點是三件事。首次獎勵最多2晚＋10XP，不是直接送高卡。',note:'專屬手動條款優先；一般自動轉換章的殘留比例與表單入帳差異仍保留。沒有自動連結、轉點或登錄功能。',nodes:[
    n('fb-all-account',20,20,'ALL帳戶','先看是否連著其他航空',['all-account'],null,['R101'],['通常須距前次航空連結12個月，且先解除舊連結。'],'既有帳戶。','跨洲搬遷例外須官方處理。','start',{kind:'會員帳戶'}),
    n('fb-account-source',20,180,'Flying Blue帳戶','本人姓名須一致',['fb-account'],null,['R098','R101'],['名與姓一致；未見專屬條款排除台灣，實際帳戶未登入驗證。'],'既有帳戶。','先連結再完成活動。','start',{kind:'會員帳戶'}),
    n('fb-link',390,80,'同名帳戶連結','ALL只能選一家航空',[],'N033',['R101'],['不能假設同時連Qatar及FB。','既有訂單可用，但活動需在連結後完成；未入帳前解除可能影響追補。'],'不因連結就假設有額外機票或住宿費。','重連不重送首次獎勵。','verified',{kind:'會員帳戶',join:'all'}),
    n('fb-dual',780,80,'合格消費雙重累積','住宿賺FB；飛行賺ALL',[],'N034',['R098'],['住宿每€1合格消費額外1FB哩。','AF／KLM合格飛行每€2額外1ALL點，不是所有天合聯盟航班。','OTA、非參與酒店與特殊房價要排除。'],'正常累積外另給合作點數，不是複製同一份餘額。','連結後完成合格活動。','verified',{kind:'雙重累積',stay_policy:'all-fb'}),
    n('fb-first',780,260,'首次活動資格獎勵','最多2資格晚＋10XP',[],'N035',['R099'],['首住與首飛各1 ALL資格晚＋5 XP；終身各一次。','全點數房與混合支付航班觸發尚待核。','不是直接取得ALL Gold或Flying Blue高階。'],'以原本就有的合格活動比較新增效益。','重連帳戶不重置。','verified',{kind:'航空資格點'}),
    n('fb-all-points',20,360,'ALL獎勵點數','須已連結FB',['all-points'],null,['R100'],['最低量不是已確認增加單位。'],'放棄原有住宿折抵價值。','轉點不可撤回。','start',{kind:'酒店點數'}),
    n('all-fb-transfer',390,360,'手動轉FB哩程','2,000 ALL→2,000 FB',['fb-miles'],'N036',['R100'],['採專屬手動1:1；一般2:1殘留位於自動轉換章，並非兩種手動比例可任選。','增量與上限未明列，不建立自動轉換。'],'先比較ALL住宿抵用與FB實際可換票價值。','專屬10天；表單模板另列六週，保留差異。','verified',{kind:'航空里程'}),
    n('fb-miles-source',20,540,'Flying Blue哩程','反向用途另比較',['fb-miles'],null,['R100'],['最低4,000哩；不可把轉回當作撤銷原交易。'],'原有兌票用途。','轉點不可撤回。','start',{kind:'航空里程'}),
    n('fb-all-transfer',780,540,'手動轉ALL點數','4,000 FB→1,000 ALL',['all-points'],'N037',['R100'],['本人同名已連結；增量與單次／年度上限未明列。','兩方向不對稱，來回會損耗。'],'轉回獎勵點數不等於取得資格晚。','專屬條款列即時；仍須帳戶及系統正常。','verified',{kind:'酒店點數'})
  ],edges:[e('fb-all-link','fb-all-account','fb-link','verified'),e('fb-account-link','fb-account-source','fb-link','verified'),e('fb-link-dual','fb-link','fb-dual','verified'),e('fb-dual-first','fb-dual','fb-first','pending','各自首次且合格才送'),e('fb-manual-out','fb-all-points','all-fb-transfer','verified'),e('fb-manual-back','fb-miles-source','fb-all-transfer','verified')]}
];
export function extendHotelViews(trees){
  const hotel=trees.find(item=>item.id==='points-hotel');
  hotel.nodes.push(n('hsbc-premier',20,650,'滙豐卓越紅利','2:1；最低單位有疑義',['hsbc-premier-points'],'N030',['R090'],['不是旅人旅遊積分，不能套旅人3,000／500單位。','銀行卓越段用詞混寫，最低可操作紅利數尚未確認。'],'轉點費與年度總上限未列。','Q4：2026/10/1–12/31。','unverified',{kind:'銀行點數',hotel_program:'choose'}));
  hotel.nodes.push(n('premier-check',390,650,'先釐清紅利門檻','不要套旅人3,000／500',[],null,['R090'],['卓越是紅利積分2:1，不是旅人旅遊積分1:1。','銀行最低單位用詞混寫，未釐清前不提供假定可操作的最低數。'],'費用與年度上限未明列。','完整Q4條款與本人操作需核對。','unverified',{kind:'申請條件',hotel_program:'choose'}));
  hotel.height=805;
  hotel.nodes.find(item=>item.id==='mr-marriott').hotel_program='marriott';
  hotel.nodes.find(item=>item.id==='mr-hilton').hotel_program='hilton';
  hotel.nodes.find(item=>item.id==='hsbc-all').hotel_program='all';
  const hsbc=hotel.nodes.find(item=>item.id==='hsbc-hotels');hsbc.hotel_program='choose';hsbc.bridge_resources=['marriott-points','ihg-points'];hsbc.rule_ids.push('R090');delete hsbc.source_ids;
  const goal=hotel.nodes.find(item=>item.id==='hotel-award');goal.hotel_program='choose';goal.rule_ids=['R091','R092','R093','R094'];goal.subtitle='比較四家使用規則與實際報價';
  hotel.edges.push(e('hsbc-hotel-use','hsbc-hotels','hotel-award','pending','轉入後再選兌房用途',{side:'right'}),e('all-hotel-use','hsbc-all','hotel-award','pending','合格住宿折抵'),e('premier-hotels','hsbc-premier','premier-check','pending','先釐清紅利門檻'));
  const qatar=trees.find(item=>item.id==='all-qatar');qatar.name='ALL與Qatar累積／轉點';qatar.note='一次性會籍快線另有獨立子圖。雙重累積、轉點與會籍的資格及首次活動不能互相套用。';
  for(const id of ['all-member','qatar-member','dual-rewards'])qatar.nodes.find(item=>item.id===id).rule_ids.push('R095','R096','R101');
  for(const id of ['all-to-qatar','qatar-to-all'])qatar.nodes.find(item=>item.id===id).rule_ids.push('R097');
}
