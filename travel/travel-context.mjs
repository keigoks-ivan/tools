// Climate normals and public service information checked on 2026-10-12; not bookings.
export const CONTEXT_DATE='2026-10-12';
export const CLIMATE_URL='https://www.met.gov.my/en/pendidikan/iklim-malaysia/';
export const cityContext={
 kl:{season:'全年濕熱；2 月通常比雨量高峰少雨，1 月仍需留午後雷雨備案。',infrastructure:'KLCC 一帶可用商場、軌道交通與叫車；營隊接送以實際校區為準，雨天不把地圖上的步行距離當成舒適動線。',decision:'第一週固定，部分路線 2/4 起再回來住；優先兩房、洗衣與室內休息空間。營隊選定後再查尖峰接送。'},
 ipoh:{season:'半島內陸，比東岸少受東北季風直接影響；戶外樂園仍受雷雨與炎熱影響。',infrastructure:'ETS 可進出城市；飯店、Tambun 樂園與自然景點分散，適合把 Alphard 集中用在轉移與樂園日。',decision:'短住 3 晚較合適。市區品牌飯店提供生活便利，度假設施與房間空間須另查。'},
 pen:{season:'半島西北部 1～2 月通常是全年雨量較低時段；仍是熱帶氣候，並非每天晴天。',infrastructure:'Gurney 一帶有商場、餐飲與醫療資源；島上景點以公路接送為主，沒有可串起主要景點的現成軌道路線。',decision:'對這次長住最有利：公寓廚房、洗衣與生活機能一起滿足。Entopia／ESCAPE 在 Teluk Bahang 一帶，住渡假村段時離得最近。'},
 penres:{season:'與檳城同屬半島西北部，1～2 月通常是全年雨量較低時段；海灘有水母與水質負評，玩水以泳池為主。',infrastructure:'Teluk Bahang 偏遠，離喬治市約 30 分鐘、檳城機場約 1 小時，外出多半要叫車或包車，餐飲以館內為主。Entopia、ESCAPE 都在附近。InterContinental Penang Resort 預定 2026/12 在同區開幕，尚無評價且曾延期，1 月入住風險高，這次不列入。',decision:'渡假村段 4 晚住 Angsana：泳池與兒童俱樂部為主，Entopia 半天、ESCAPE 一整天。想要更強的滑水道可比較 Hard Rock Hotel Penang，但它的整修期要先確認。'},
 kk:{season:'亞庇屬沙巴西北岸，2 月通常是雨量低谷；與東北岸的季風雨勢不同。雨量較低仍不保證出海海況。',infrastructure:'市區商場、外食與叫車較集中；海島仍須先到碼頭，再接船。飯店海景不代表有沙灘。',decision:'適合把採買、文化村與出海安排集中在市區住宿段。出海留一個可替換日。'},
 resort:{season:'亞庇周邊沿用西北岸季節判讀；泳池、沙灘、船班各自看當日天氣與開放狀態。',infrastructure:'Sutera Harbour 靠近市區、園區有碼頭；只比 Sutera Harbour 與丹絨亞路，市區採買與餐飲用短程接送，不延伸 Tuaran。',decision:'先選便利或園區環境，再決定飯店。泳池與兒童活動為主要需求，連住減少搬行李；實際開放設施先確認。'},
};
export const hotelContext={
 'kl-mea':{tier:'高階服務式公寓；先比較兩房',hardware:'小廚房、洗烘衣機、獨立客廳；官方列室內泳池與室內兒童空間。',surroundings:'Jalan Kia Peng／KLCC 公園周邊，官方列 Conlay MRT。採買、營隊與晚餐動線需分開查。',tradeoff:'適合固定一週；不是海灘度假型住宿。',url:'https://www.marriott.com/en-us/hotels/kulea-marriott-executive-apartments-kuala-lumpur/overview/'},
 'kl-ppss':{tier:'高階服務式公寓；GHA 體系（Pan Pacific）',hardware:'兩房 80 平方米；小廚房（微波爐、烤箱、洗碗機）、洗烘衣機。頂樓無邊際池，沒有兒童俱樂部。',surroundings:'Bukit Bintang，Jalan Sultan Ismail；購物與餐飲集中，跟 PARKROYAL COLLECTION Kuala Lumpur 相連。',tradeoff:'GHA 福利要直訂才有；兒童設施比萬豪行政公寓少，爐具未確認。',rating:'Trip.com 9.3（1,418 則）；2026/10/14 快照，非即時分數。',ratingUrl:'https://ph.trip.com/hotels/kuala-lumpur-hotel-detail-100031047/pan-pacific-serviced-suite-kuala-lumpur',url:'https://www.panpacific.com/en/serviced-suites/pp-ss-kuala-lumpur.html'},
 'pen-parkroyal':{tier:'海灘渡假村；GHA 體系（PARKROYAL）',hardware:'家庭房與套房 62 平方米，沒有房內廚房；Trip.com 列兒童俱樂部、兒童池、滑水道。',surroundings:'Batu Ferringhi 海灘渡假區；到 Entopia、ESCAPE 的車程未逐一核對。',tradeoff:'用得到 GHA 福利；沒廚房，房間是 2018 年整修，評論說設備偏舊。',rating:'Trip.com 9.3（2,204 則）；2026/10/14 快照，非即時分數。',ratingUrl:'https://sg.trip.com/hotels/batu-ferringhi-hotel-detail-992284/parkroyal-penang-resort/review.html',url:'https://www.mynewsdesk.com/sg/pan-pacific-hotels-group/pressreleases/a-refreshed-stay-experience-at-penang-beachs-leading-resort-2428934'},
 'kl-element':{tier:'長住型市區飯店；套房備選',hardware:'官方列室內泳池；廚房須依實際房型確認。不要用微波爐取代開火條件。',surroundings:'Ilham Tower／Jalan Binjai，官方列 Ampang Park LRT 與 Persiaran KLCC MRT。',tradeoff:'軌道交通可比較，但是否比 Kia Peng 更省營隊接送，取決於校區。',url:'https://www.marriott.com/en-us/hotels/kulel-element-kuala-lumpur/overview/'},
 'pen-mea':{tier:'官網稱五星行政公寓；非一般萬豪客房',hardware:'一房／兩房、完整廚房與房內洗衣；戶外泳池受天氣影響。',surroundings:'Gurney Drive 生活圈，有商場、餐飲及醫療資源；去老城、升旗山、西北端樂園仍需交通。',tradeoff:'長住便利最完整；海濱位置不等於可游泳沙灘，挑高樓安靜房仍需飯店確認。',url:'https://www.marriott.com/en-us/hotels/pener-marriott-executive-apartments-penang/overview/'},
 'pen-angsana':{tier:'Angsana 品牌渡假村；非萬豪',hardware:'三座池：無邊際池、附滑水道的家庭池、有倒水桶與噴泉的兒童池；Rangers’ Club 適用 4–12 歲。兩房海景套房 90 平方米，無房內廚房。',surroundings:'Teluk Bahang，國家公園入口約 270 米；到喬治市約 30 分鐘、檳城機場約 1 小時，ESCAPE 約 10 分鐘、Entopia 約 15 分鐘。',tradeoff:'玩水與兒童活動優先；外出要叫車，旺季泳池擁擠，海灘有水母與水質負評，10 歲可能覺得兒童俱樂部偏小。',rating:'Trip.com 9.0（1,274 則）、Booking 8.8；2026/10/12 快照，非即時分數。',ratingUrl:'https://uk.trip.com/hotels/southwest-penang-island-hotel-detail-57056790/hotel',url:'https://www.tatlerasia.com/lifestyle/travel/celebrate-festivities-angsana-teluk-bahang-penang'},
 'pen-hardrock':{tier:'娛樂風格渡假飯店；非萬豪',hardware:'泳池 26,000 平方呎，三座池、三條滑水道；官方 Kids Suite 是 1 king＋1 拖床，只睡 2 大 1 小。',surroundings:'檳城北岸渡假區；與 Angsana 的車程及周邊餐飲未逐一核對。',tradeoff:'玩水設施最強；整修第二階段 2027/2/15 起，整新房保證、提前施工與滑水道身高限制待確認。',url:'https://hotel.hardrock.com/penang/renovation-notice.aspx'},
 'ipoh-ac':{tier:'市區商務飯店；品牌精選服務定位',hardware:'泳池、兒童池及遊戲室；家庭床位、相連房與近期房況待確認。',surroundings:'Jalan Sultan Abdul Jalil 市區，官方列周邊餐飲；與老城、火車站、Tambun 分開確認車程。',tradeoff:'適合 3 晚短住；不是萬豪行政公寓，長住下廚條件未滿足。',url:'https://www.marriott.com/en-us/hotels/iphac-ac-hotel-ipoh/overview/'},
 'kk-hyatt-centric':{tier:'官網稱五星生活型城市飯店；非沙灘渡假村',hardware:'2022/10 開幕；23 樓無邊際戶外池、健身房、陽台與相連房。房型依家庭入住上限確認。',surroundings:'Jalan Haji Saman 市區，靠近 Gaya Street 與 Jesselton Point；採買、外食與碼頭方便。',tradeoff:'重視外食與市區生活時可比；沒有沙灘，屋頂池也不能當兒童戲水樂園。一房 2 大 2 小限小孩 5 歲以下，全家要訂兩間或套房。',water:'屋頂泳池玩水；兒童池／滑梯未查得官方證據，池深、救生員與兩位孩子使用條件先問。',beach:'市區館不提供沙灘度假環境；去丹絨亞路安排短程接送。',rating:'Expedia 搜尋頁查見 9.2/10、218 則；房況與設施項 9.6/10。樣本與 Agoda 不同，不直接排名。',ratingUrl:'https://www.expedia.com/Kota-Kinabalu-Hotels-Hyatt-Centric-Kota-Kinabalu.h83107453.Hotel-Information',url:'https://www.hyatt.com/hyatt-centric/en-US/bkict-hyatt-centric-kota-kinabalu/faqs'},
 'kk-sheraton':{tier:'官網稱五星城市飯店',hardware:'2025/12 底開幕，307 間；頂樓無邊際池，Trip.com 對泳池是否限成人說法矛盾。房內廚房未確認。',surroundings:'亞庇市中心高樓，官方列商場與市區景點；Tanjung Aru Beach 須搭車。',tradeoff:'亞庇最新的萬豪體系，但不能當玩水據點；先電話確認小孩能否下池，再看兒童活動與入住日期設施。',url:'https://www.marriott.com/en-us/hotels/bkisi-sheraton-kota-kinabalu/overview/'},
 'kk-marriott':{tier:'官網稱五星城市飯店',hardware:'海景房、戶外無邊際泳池與獨立兒童池、館內餐飲；洗衣服務不等於房內洗衣機。',surroundings:'Jalan Tun Fuad Stephens 海濱市區，外食與市區活動便利；碼頭接送另排。',tradeoff:'海景與市區生活的平衡；海灘與兒童俱樂部不可由星級推定。',url:'https://www.marriott.com/en-us/hotels/bkikk-kota-kinabalu-marriott-hotel/overview/'},
 'kk-magellan':{rating:'Agoda 搜尋頁查見 8.7/10、約 1.79 萬則，設施 8.9/10；頁面快照，非即時分數。',ratingUrl:'https://www.agoda.com/the-magellan-sutera-resort/reviews-page-58/kota-kinabalu-my.html',beach:'2026/7 乘客回饋及飯店回覆確認有私人沙灘，但非長段海岸線；適合泳池為主、短程玩沙，海泳區與當日水況另查。',tier:'官網稱五星海濱度假村',hardware:'戶外泳池與 Little Magellan 兒童活動；房間翻新年份、床型與近期照片待補。',water:'泳池玩水優先。園區另列 Marina Pool 水滑梯，入住方案權限、限制、維護與步行動線先查；不預設海灘可下水。',waterUrl:'https://www.suteraharbour.com/hotels/the-pacific-sutera-hotel/experiences/facilities/',surroundings:'Sutera Harbour 園區有碼頭；外出吃飯採買仍要離開園區，採買與外食可安排短程接送。',tradeoff:'便利與度假環境平衡；先取得房況再決定，不能用五星保證硬體新。',url:'https://www.suteraharbour.com/hotels/the-magellan-sutera-resort/'},
 'kk-pacific':{rating:'Agoda 搜尋頁查見 8.6/10、約 1.84 萬則，設施 8.9/10；頁面快照，非即時分數。',ratingUrl:'https://www.agoda.com/the-pacific-sutera-hotel_11/hotel/kota-kinabalu-my.html',beach:'海濱位置與泳池已列；連續沙灘、沙質與可海泳條件另查。想玩沙可短程接送丹絨亞路公眾海灘。',tier:'官網稱五星海濱飯店；Sutera Harbour 園區',hardware:'館內戶外泳池與家庭房；園區設施頁列 Marina Pool 水滑梯與兒童俱樂部。',surroundings:'同在亞庇 Sutera Harbour；跨館與 Marina 設施的步行、接駁及住客權限先查。',tradeoff:'近市區玩水比價候選；房況、家庭床位與共享設施費用另核對。',water:'以館內泳池為基礎；Marina 水滑梯使用權限、身高限制、兒童池深度與當期維護須書面確認。',url:'https://www.suteraharbour.com/hotels/the-pacific-sutera-hotel/experiences/facilities/'},
 'kk-tanjung':{tier:'高階海濱度假村；本次工程期備選',hardware:'官方第二期圖列 Kinabalu 客房、大廳及兒童／休閒區至 2027/5；原有親子池與戲水區至 2027/7。日間工程 09:00–18:00。',water:'2026/11 預定開放的新 Tanjung Wing 池水深 1.2 米；原無邊際／家庭／嬰兒池與戲水區列 2026/12～2027/7 施工，與 FAQ 營運清單衝突，須逐項確認。',beach:'官方 FAQ 列 Sunset Beach 營運；沙灘動線與噪音按入住日期再確認，營運中不等於可海泳。',surroundings:'Tanjung Aru 位置便於機場與市區往返，但動線、景觀與噪音可能受工程影響。',tradeoff:'想飯店旁沙灘可比較，但這次不能當完整親子玩水首選。以官方分區圖較具體時程規劃；公開資料未公布完成比例。',url:'https://www.shangri-la.com/en/landing/tanjungaru-updates/'}
};
const ETS='https://www.ktmb.com.my/ETS.html',FERRY='https://www.penangport.com.my/services/ferry-services';
const car=(detail,time,url='https://www.vmaxtransport.com.my/')=>({id:'alphard',label:'Toyota Alphard＋中文司機',time,detail,url});
const rail=(detail,time)=>({id:'rail',label:'ETS＋兩端接送',time,detail,url:ETS});
const flight=(detail,url,time='約半天門到門；需核對班次')=>({id:'flight',label:'直飛＋兩端接送',time,detail,url});
const coach={id:'coach',label:'長途巴士＋兩端接送',time:'另核對當日班表與上下車站',detail:'可比價，但上下車、行李搬運與停靠時間較多；這趟以舒適為優先時，排在 Alphard／ETS 後面。',url:'https://www.tbsbts.com.my/'};
export function transportOptions(from,to){
 const sab=c=>['kk','resort'].includes(c),n=c=>c==='penres'?'pen':c,res=from==='penres'||to==='penres';
 if(from===to)return [car('同區換飯店；先按實際飯店地址報價，入住前留行李與午餐時間。','按兩館位置確認')];
 if(sab(from)&&sab(to))return [car('亞庇市區、Sutera Harbour 與丹絨亞路間接送；按實際飯店地址確認路程，行李與孩子座椅一起報。','短程接送；依飯店地址與路況確認','https://www.atvborneoadventure.com/tour/vvip-tour-with-luxury-car/')];
 if(sab(from)||sab(to)){
  const mainland=n(sab(from)?to:from);
  if(mainland==='ipoh')return [{id:'via-kl',label:'Alphard／ETS 回吉隆坡＋飛亞庇',time:'完整移動日；同日銜接待核實',detail:'不假設有怡保直飛亞庇。需將火車站、KLIA 航廈與航班一起核對；拆票可用吉隆坡緩衝一晚。',url:ETS}];
  return [flight(mainland==='pen'?`優先查檳城↔亞庇直飛（以 AirAsia 為主）；若目的地是亞庇近郊度假村，抵達 BKI 後仍須陸路接送。${res?'檳城渡假村到檳城機場約 1 小時，飛的話要多轉一次車。':''}`:'吉隆坡↔亞庇以境內航班移動，建議馬航；Alphard 只用於兩端，不能跨海直達。',mainland==='pen'?'https://www.airasia.com/flights/from-penang-pen-to-kota-kinabalu-bki/':'https://www.malaysiaairlines.com/'),{id:'connection',label:'轉機＋兩端接送',time:'比直飛多一次候機；保留完整移動日',detail:'直飛時間不合時再比較轉機。分開買票須另留延誤與行李重掛緩衝。',url:'https://www.malaysiaairlines.com/'}];
 }
 if(n(from)===n(to))return [car('同島換館（檳城公寓與 Teluk Bahang 渡假村）；行李與孩子座椅一起報價。','約 30–40 分鐘；規劃估計')];
 const pair=[n(from),n(to)].sort().join('-');
 if(pair==='ipoh-kl')return [car('飯店到飯店，行李只搬一次；途中安排一次休息。先取得跨城總價與中文司機確認。','約 3～4 小時；規劃估計含休息'),rail('KL Sentral↔Ipoh；列車不受公路塞車影響，但兩端還要接送。指定班次與四個相鄰座位待查。','約 3.5～5 小時門到門；規劃估計'),coach];
 if(pair==='ipoh-pen')return [car('怡保與檳島飯店間直接接送，經大橋往返；省去 Butterworth 換乘。','約 2.5～4 小時；規劃估計含休息'),rail('ETS 到／從 Butterworth，另預約 Alphard 經大橋接檳島飯店；不要把火車到站視為到館。','約 3～4.5 小時門到門；規劃估計'),{id:'ferry',label:'ETS＋渡輪＋檳島接送',time:'渡輪約 20 分鐘，另加等船、步行及接送',detail:'適合想體驗渡輪且行李少時；攜大箱與兩個孩子須多次搬運。渡輪不是直達 Gurney。',url:FERRY},coach];
 if(pair==='kl-pen')return [car(res?'建議：Alphard 在吉隆坡公寓與 Angsana 之間直達，行李只搬一次、不用換乘，途中休息一次。':'建議：Alphard 飯店到飯店，行李只搬一次、不用換乘，途中休息一次。','約 4.5 小時飯店到飯店；規劃估計含休息'),flight(`馬航班機約 1 小時，加上報到、領行李和兩端接送，門到門和 Alphard 差不多。馬航與華航同在 KLIA 第一航廈，AirAsia 在第二航廈。${res?'Angsana 到檳城機場約 1 小時，飛的話要多轉一次車。':''}`,'https://www.malaysiaairlines.com/','約 4～6 小時門到門；規劃估計'),rail('KL Sentral↔Butterworth，加兩端接送；檳島段可預約 Alphard 經大橋，減少搬運。','約 5～7 小時門到門；規劃估計'),coach];
 return [];
}
export function suggestedTransfers(legs){
 const out={},sab=c=>['kk','resort'].includes(c),pen=c=>['pen','penres'].includes(c);
 for(let i=1;i<legs.length;i++){const a=legs[i-1].city,b=legs[i].city;const id=sab(a)&&b==='kl'||a==='kl'&&sab(b)?'flight':pen(a)&&b==='kl'||a==='kl'&&pen(b)||pen(a)&&pen(b)&&a!==b?'alphard':'';if(id)out[`${a}:${b}:${legs[i].id}`]=id;}
 return out;
}
export function transferKey(previous,leg){return `${previous.city}:${leg.city}:${leg.id}`;}
export function chosenTransport(previous,leg,choices={}){const options=transportOptions(previous.city,leg.city);return options.find(o=>o.id===choices[transferKey(previous,leg)])||null;}
export function routeAssessment(legs){
 const notes=[];
 if(legs.some(l=>['kk','resort'].includes(l.city)))notes.push('沙巴限定亞庇市區、Sutera Harbour 與丹絨亞路。1 月下旬～2 月上旬仍溫暖，2 月季節雨量較低；泳池日可安排，出海則另看風浪。保留一個可替換日與室內備案。');
 else notes.push('這條路線集中半島西岸，較容易用公寓、商場與陸路接送維持生活節奏。'+(legs.some(l=>['pen','penres'].includes(l.city))?'檳城 1～2 月季節條件也有利。':''));
 if(legs.some(l=>l.city==='penres'))notes.push('檳城渡假村段在 Teluk Bahang：離喬治市約 30 分鐘、檳城機場約 1 小時，外出多半要叫車。Entopia 與 ESCAPE 就在附近，泳池為主要玩水地點，海灘有水母與水質負評。');
 if(legs.some(l=>l.hotel==='pen-hardrock'))notes.push('已選 Hard Rock Hotel Penang：泳池與滑水道最強，但整修第二階段 2027/2/15 起；先確認能否保證整新房、2/15 前是否提前施工，Kids Suite 只睡 2 大 1 小。');
 if(legs.some(l=>['kk-magellan','kk-pacific'].includes(l.hotel)))notes.push('已選 Sutera Harbour：泳池與兒童活動優先，出海可選但不必每天排。先取得兒童池／滑梯使用條件、維護日與近期房況。');
 if(legs.some(l=>l.hotel==='kk-tanjung'))notes.push('已選丹絨亞路：官方第二期圖把親子池與戲水區列為 2026/12～2027/7 施工，涵蓋本次日期。Sunset Beach 列營運，但完整玩水設施不保證；先取得開放清單與安靜房位置，否則改比 Magellan／Pacific。');
 if(legs.filter(l=>l.city==='resort').some(l=>l.nights>=8))notes.push('度假村連住 8 晚以上：確認全家用餐成本與室內活動是否足夠；想常外食可把前段拆 2～3 晚市區，但會多搬一次行李。');
 return notes;
}
export const charterCandidates=[
 {id:'vmax',name:'VMAX Transport Service',region:'吉隆坡／怡保／檳城跨城',status:'優先詢價',vehicle:'官方有 Alphard／Vellfire 車隊；訂單須鎖定 Alphard。',language:'官方明列中文與廣東話司機，跨城服務涵蓋西馬。',rating:'官網 Google 評價嵌入顯示 5.0／225 則（2026/10/12 查見；非本頁直接取得的即時 Google 分數）。',driver:'可見乘客提到 Alphard 乾淨、司機準時、禮貌與平穩；Poon Jxiong、Whitney Tan 等是評論者姓名，不能當成司機姓名。',limit:'公司評價不能保證實際派車司機；請提供將派司機姓名及近期乘客評價。檳城當地日租須另問是否有調車費。',url:'https://www.vmaxtransport.com.my/gallery/group/3536/cat/11122/',review:'https://www.vmaxtransport.com.my/google-review/',contact:'https://wa.me/60185705618'},
 {id:'levince',name:'LeVince Chauffeur',region:'吉隆坡機場／市區／西馬跨城',status:'第二家比價；中文待確認',vehicle:'官方列 Toyota Alphard 豪華 MPV。',language:'本次未取得保證中文司機的官方條款，須指定普通話，不以中文客服代替。',rating:'第三方 touragency.my 摘錄 Google 4.9／605 則，頁面標示資料日期 2026/9/15；需回 Google 再核對。',driver:'評價摘要提到準時、乾淨、平穩；點名 Johnson 提供交通更新與細心服務，可詢問是否能指定同名司機。',limit:'Johnson 是否會說中文、當日能否服務、指定 Alphard 均待確認；不是已核實的三條件全符合方案。',url:'https://le-vince.com/',review:'https://touragency.my/listing/le-vince-chauffeur-award-winning-chauffeur-7c22ee/',contact:'https://le-vince.com/'},
 {id:'top-leisure',name:'Top Leisure',region:'檳城在地／怡保跨城',status:'車型與中文符合；司機評價待補',vehicle:'官方包車頁列 7 座 Alphard，仍須確認實際派車。',language:'官方服務頁明列中文、英文與廣東話包車。',rating:'本次查看 Tripadvisor 尚無評論；不標成「評價好」的推薦。',driver:'可作檳城在地調車比價候選；目前缺少能證明實際 Alphard 司機表現的公開評價。',limit:'詢價時要求近期同路段評論、司機姓名與車照；取得證據前不優先於已有司機乘客回饋的方案。',url:'https://topleisuremy.com/en/product/private-car-from-penang-cruise/',review:'https://www.tripadvisor.com.au/Attraction_Review-g660694-d27742918-Reviews-Top_Leisure-Penang_Island_Penang.html',contact:'https://topleisuremy.com/'},
 {id:'atv-borneo',name:'ATV Borneo Adventure · VVIP Alphard',region:'亞庇市區／Sutera Harbour／丹絨亞路',status:'沙巴備選；Alphard 司機評價待補',vehicle:'官方 VVIP 頁明列 Toyota Alphard 配私人司機。',language:'官方套裝列中文導遊；需問是否為同一位中文司機，或需額外安排導遊。',rating:'VVIP 商品頁顯示尚無評分。SabahTravel 有其他行程乘客回饋，不能當成 Alphard 司機評價。',driver:'其他行程評論提到 Dan Dan、Raymond 導遊服務；只證明那些導覽體驗，不保證這次包車駕駛。',limit:'本次尚未找到沙巴同時確證「指定 Alphard＋中文司機＋該司機良好近期評價」的選項。僅詢亞庇市區、Sutera Harbour 與丹絨亞路接送。',url:'https://www.atvborneoadventure.com/tour/vvip-tour-with-luxury-car/',review:'https://www.sabahtravel.com/p/atv-borneo-adventure',contact:'https://wa.me/60108258306'}
];
