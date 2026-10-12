// Climate normals and public service information checked on 2026-10-12; not bookings.
export const CONTEXT_DATE='2026-10-12';
export const CLIMATE_URL='https://www.met.gov.my/en/pendidikan/iklim-malaysia/';
export const cityContext={
 kl:{season:'全年濕熱；2 月通常比雨量高峰少雨，1 月仍需留午後雷雨備案。',infrastructure:'KLCC 一帶可用商場、軌道交通與叫車；營隊接送以實際校區為準，雨天不把地圖上的步行距離當成舒適動線。',decision:'固定第一週，優先兩房、洗衣與室內休息空間。營隊選定後再查尖峰接送。'},
 ipoh:{season:'半島內陸，比東岸少受東北季風直接影響；戶外樂園仍受雷雨與炎熱影響。',infrastructure:'ETS 可進出城市；飯店、Tambun 樂園與自然景點分散，適合把 Alphard 集中用在轉移與樂園日。',decision:'短住 3 晚較合適。市區品牌飯店提供生活便利，度假設施與房間空間須另查。'},
 pen:{season:'半島西北部 1～2 月通常是全年雨量較低時段；仍是熱帶氣候，並非每天晴天。',infrastructure:'Gurney 一帶有商場、餐飲與醫療資源；島上景點以公路接送為主，沒有可串起主要景點的現成軌道路線。',decision:'對這次長住最有利：公寓廚房、洗衣與生活機能一起滿足。Entopia／ESCAPE 日再用包車。'},
 kk:{season:'亞庇屬沙巴西北岸，2 月通常是雨量低谷；與東北岸的季風雨勢不同。雨量較低仍不保證出海海況。',infrastructure:'市區商場、外食與叫車較集中；海島仍須先到碼頭，再接船。飯店海景不代表有沙灘。',decision:'適合把採買、文化村與出海安排集中在市區住宿段。出海留一個可替換日。'},
 resort:{season:'亞庇周邊沿用西北岸季節判讀；泳池、沙灘、船班各自看當日天氣與開放狀態。',infrastructure:'Sutera Harbour 靠近市區、園區有碼頭；Rasa Ria 在 Tuaran，外食採買與回市區須另安排接送。',decision:'先選便利或園區環境，再決定飯店。遠郊度假村集中連住，減少每天往返市區。'},
 mountain:{season:'昆達山因海拔較高較涼，霧雨會影響視野與山路；沿海的雨量低谷不能直接當作山區晴天預報。',infrastructure:'山區住宿與景點靠公路串接；不以叫車隨叫隨到為前提。網路、熱水、房間保暖與雨天室內空間逐館確認。',decision:'願意多一次搬行李才加兩晚；安排白天 Alphard 接送與休息站，避免同日往返趕路。'}
};
export const hotelContext={
 'kl-mea':{tier:'高階服務式公寓；先比較兩房',hardware:'小廚房、洗烘衣機、獨立客廳；官方列室內泳池與室內兒童空間。',surroundings:'Jalan Kia Peng／KLCC 公園周邊，官方列 Conlay MRT。採買、營隊與晚餐動線需分開查。',tradeoff:'適合固定一週；不是海灘度假型住宿。',url:'https://www.marriott.com/en-us/hotels/kulea-marriott-executive-apartments-kuala-lumpur/overview/'},
 'kl-element':{tier:'長住型市區飯店；套房備選',hardware:'官方列室內泳池；廚房須依實際房型確認。不要用微波爐取代開火條件。',surroundings:'Ilham Tower／Jalan Binjai，官方列 Ampang Park LRT 與 Persiaran KLCC MRT。',tradeoff:'軌道交通可比較，但是否比 Kia Peng 更省營隊接送，取決於校區。',url:'https://www.marriott.com/en-us/hotels/kulel-element-kuala-lumpur/overview/'},
 'pen-mea':{tier:'官網稱五星行政公寓；非一般萬豪客房',hardware:'一房／兩房、完整廚房與房內洗衣；戶外泳池受天氣影響。',surroundings:'Gurney Drive 生活圈，有商場、餐飲及醫療資源；去老城、升旗山、西北端樂園仍需交通。',tradeoff:'長住便利最完整；海濱位置不等於可游泳沙灘，挑高樓安靜房仍需飯店確認。',url:'https://www.marriott.com/en-us/hotels/pener-marriott-executive-apartments-penang/overview/'},
 'ipoh-ac':{tier:'市區商務飯店；品牌精選服務定位',hardware:'泳池、兒童池及遊戲室；家庭床位、相連房與近期房況待確認。',surroundings:'Jalan Sultan Abdul Jalil 市區，官方列周邊餐飲；與老城、火車站、Tambun 分開確認車程。',tradeoff:'適合 3 晚短住；不是萬豪行政公寓，長住下廚條件未滿足。',url:'https://www.marriott.com/en-us/hotels/iphac-ac-hotel-ipoh/overview/'},
 'kk-sheraton':{tier:'官網稱五星城市飯店',hardware:'官方列戶外泳池、餐廳與洗衣服務；房內廚房未確認。',surroundings:'亞庇市中心高樓，官方列商場與市區景點；Tanjung Aru Beach 須搭車。',tradeoff:'品牌與市區便利優先；兒童活動、安靜樓層與入住日期設施仍須確認。',url:'https://www.marriott.com/en-us/hotels/bkisi-sheraton-kota-kinabalu/overview/'},
 'kk-marriott':{tier:'官網稱五星城市飯店',hardware:'海景房、戶外無邊際泳池及館內餐飲；洗衣服務不等於房內洗衣機。',surroundings:'Jalan Tun Fuad Stephens 海濱市區，外食與市區活動便利；碼頭接送另排。',tradeoff:'海景與市區生活的平衡；海灘與兒童俱樂部不可由星級推定。',url:'https://www.marriott.com/en-us/hotels/bkikk-kota-kinabalu-marriott-hotel/overview/'},
 'kk-magellan':{tier:'官網稱五星海濱度假村',hardware:'泳池、園區活動及兒童俱樂部；房間翻新年份、床型與近期照片待補。',surroundings:'Sutera Harbour 園區有碼頭；外出吃飯採買仍要離開園區，便利程度介於市區飯店與 Tuaran 之間。',tradeoff:'便利與度假環境平衡；先取得房況再決定，不能用五星保證硬體新。',url:'https://www.suteraharbour.com/hotels/the-magellan-sutera-resort/'},
 'kk-rasa':{tier:'高階海灘度假村；Ocean Wing 大房型',hardware:'官方 Ocean Wing Junior Suite 約 90 平方公尺；泳池、床位及兒童活動依房型與日期確認。',surroundings:'Tuaran／Pantai Dalit，沙灘與自然園區優先；官方機場車程約 45 分鐘，市區接駁要查班表。',tradeoff:'環境與空間優先；連住較合適，餐飲與接送支出要一起比。',url:'https://www.shangri-la.com/kotakinabalu/rasariaresort/about/map-directions/'},
 'kk-tanjung':{tier:'高階海濱度假村；本次工程期備選',hardware:'官方英語公告工程至 2027 Q2，日間工程 09:00–18:00；Tanjung Wing 新池預計 2026/11 開放。',surroundings:'Tanjung Aru 位置便於機場與市區往返，但動線、景觀與噪音可能受工程影響。',tradeoff:'先取得入住翼別、開放設施與噪音書面說明；各語言公告有時程差異，本頁採英語版較晚完工日期。',url:'https://www.shangri-la.com/en/landing/tanjungaru-updates/'}
};
const ETS='https://www.ktmb.com.my/ETS.html',FERRY='https://www.penangport.com.my/services/ferry-services';
const car=(detail,time,url='https://www.vmaxtransport.com.my/')=>({id:'alphard',label:'Toyota Alphard＋中文司機',time,detail,url});
const rail=(detail,time)=>({id:'rail',label:'ETS＋兩端接送',time,detail,url:ETS});
const flight=(detail,url,time='約半天門到門；需核對班次')=>({id:'flight',label:'直飛＋兩端接送',time,detail,url});
const coach={id:'coach',label:'長途巴士＋兩端接送',time:'另核對當日班表與上下車站',detail:'可比價，但上下車、行李搬運與停靠時間較多；這趟以舒適為優先時，排在 Alphard／ETS 後面。',url:'https://www.tbsbts.com.my/'};
export function transportOptions(from,to){
 const sab=c=>['kk','resort','mountain'].includes(c),pair=[from,to].sort().join('-');
 if(from===to)return [car('同區換飯店；先按實際飯店地址報價，入住前留行李與午餐時間。','按兩館位置確認')];
 if(sab(from)&&sab(to))return [car(from==='mountain'||to==='mountain'?'白天走山路，安排休息與行李空間；昆達山過夜另問司機住宿及回送費。':'按實際飯店報價；Magellan 與 Rasa Ria 距市區不同，不用同一個接送時間套全部。',from==='mountain'||to==='mountain'?'亞庇→昆達山官方約 2 小時；規劃另留緩衝':'Tuaran 機場接送官方約 45 分鐘；其他路段另查',from==='mountain'||to==='mountain'?'https://sabahtourism.com/destination/desa-cattle-dairy-farm/':'https://www.shangri-la.com/kotakinabalu/rasariaresort/about/map-directions/')];
 if(sab(from)||sab(to)){
  const mainland=sab(from)?to:from;
  if(mainland==='ipoh')return [{id:'via-kl',label:'Alphard／ETS 回吉隆坡＋飛亞庇',time:'完整移動日；同日銜接待核實',detail:'不假設有怡保直飛亞庇。需將火車站、KLIA 航廈與航班一起核對；拆票可用吉隆坡緩衝一晚。',url:ETS}];
  return [flight(mainland==='pen'?'優先查檳城↔亞庇直飛；若目的地是度假村／昆達山，抵達 BKI 後仍須陸路接送。':'吉隆坡↔亞庇以境內航班移動；Alphard 只用於兩端，不能跨海直達。',mainland==='pen'?'https://www.airasia.com/flights/from-penang-pen-to-kota-kinabalu-bki/':'https://www.airasia.com/flights/from-kuala-lumpur-kul-to-kota-kinabalu-bki/'),{id:'connection',label:'轉機＋兩端接送',time:'比直飛多一次候機；保留完整移動日',detail:'直飛時間不合時再比較轉機。分開買票須另留延誤與行李重掛緩衝。',url:'https://www.malaysiaairlines.com/'}];
 }
 if(pair==='ipoh-kl')return [car('飯店到飯店，行李只搬一次；途中安排一次休息。先取得跨城總價與中文司機確認。','約 3～4 小時；規劃估計含休息'),rail('KL Sentral↔Ipoh；列車不受公路塞車影響，但兩端還要接送。指定班次與四個相鄰座位待查。','約 3.5～5 小時門到門；規劃估計'),coach];
 if(pair==='ipoh-pen')return [car('怡保與檳島飯店間直接接送，經大橋往返；省去 Butterworth 換乘。','約 2.5～4 小時；規劃估計含休息'),rail('ETS 到／從 Butterworth，另預約 Alphard 經大橋接檳島飯店；不要把火車到站視為到館。','約 3～4.5 小時門到門；規劃估計'),{id:'ferry',label:'ETS＋渡輪＋檳島接送',time:'渡輪約 20 分鐘，另加等船、步行及接送',detail:'適合想體驗渡輪且行李少時；攜大箱與兩個孩子須多次搬運。渡輪不是直達 Gurney。',url:FERRY},coach];
 if(pair==='kl-pen')return [flight('純為移動時優先比較直飛；兩端機場接送、報到、行李與候機加起來，不只空中約一小時。','https://www.malaysiaairlines.com/','約 4～6 小時門到門；規劃估計'),rail('KL Sentral↔Butterworth，加兩端接送；檳島段可預約 Alphard 經大橋，減少搬運。','約 5～7 小時門到門；規劃估計'),car('適合途中要停怡保、或行李多不想換乘；純移動會坐車較久，舒適車型仍不能消除長途疲勞。','約 5～7 小時；規劃估計含休息'),coach];
 return [];
}
export function transferKey(previous,leg){return `${previous.city}:${leg.city}:${leg.id}`;}
export function chosenTransport(previous,leg,choices={}){const options=transportOptions(previous.city,leg.city);return options.find(o=>o.id===choices[transferKey(previous,leg)])||null;}
export function routeAssessment(legs){
 const notes=[];
 if(legs.some(l=>['kk','resort'].includes(l.city)))notes.push('亞庇放在 1 月底～2 月仍有季節上的理由；保留出海替換日，以園區休息與市區活動補海況變動。');
 else notes.push('這條路線集中半島西岸，較容易用公寓、商場與陸路接送維持生活節奏。'+(legs.some(l=>l.city==='pen')?'檳城 1～2 月季節條件也有利。':''));
 if(legs.some(l=>l.city==='mountain'))notes.push('加昆達山會多出山路與住宿基地；如果房況與交通舒適最重要，山區是最先可刪的一段。');
 if(legs.some(l=>l.hotel==='kk-rasa'))notes.push('已選 Rasa Ria：先完成市區與出海活動，再進 Tuaran 連住；餐飲與 Alphard 接送一起納入預算。');
 if(legs.some(l=>l.hotel==='kk-tanjung'))notes.push('已選丹絨亞路：工程涵蓋旅行日期，須確認安靜房、翼別與設施，否則改比 Magellan／Rasa Ria。');
 if(legs.filter(l=>l.city==='resort').some(l=>l.nights>=8))notes.push('度假村連住 8 晚以上：確認全家用餐成本與室內活動是否足夠；想常外食可把前段拆 2～3 晚市區，但會多搬一次行李。');
 return notes;
}
export const charterCandidates=[
 {id:'vmax',name:'VMAX Transport Service',region:'吉隆坡／怡保／檳城跨城',status:'優先詢價',vehicle:'官方有 Alphard／Vellfire 車隊；訂單須鎖定 Alphard。',language:'官方明列中文與廣東話司機，跨城服務涵蓋西馬。',rating:'官網 Google 評價嵌入顯示 5.0／225 則（2026/10/12 查見；非本頁直接取得的即時 Google 分數）。',driver:'可見乘客提到 Alphard 乾淨、司機準時、禮貌與平穩；Poon Jxiong、Whitney Tan 等是評論者姓名，不能當成司機姓名。',limit:'公司評價不能保證實際派車司機；請提供將派司機姓名及近期乘客評價。檳城當地日租須另問是否有調車費。',url:'https://www.vmaxtransport.com.my/gallery/group/3536/cat/11122/',review:'https://www.vmaxtransport.com.my/google-review/',contact:'https://wa.me/60185705618'},
 {id:'levince',name:'LeVince Chauffeur',region:'吉隆坡機場／市區／西馬跨城',status:'第二家比價；中文待確認',vehicle:'官方列 Toyota Alphard 豪華 MPV。',language:'本次未取得保證中文司機的官方條款，須指定普通話，不以中文客服代替。',rating:'第三方 touragency.my 摘錄 Google 4.9／605 則，頁面標示資料日期 2026/9/15；需回 Google 再核對。',driver:'評價摘要提到準時、乾淨、平穩；點名 Johnson 提供交通更新與細心服務，可詢問是否能指定同名司機。',limit:'Johnson 是否會說中文、當日能否服務、指定 Alphard 均待確認；不是已核實的三條件全符合方案。',url:'https://le-vince.com/',review:'https://touragency.my/listing/le-vince-chauffeur-award-winning-chauffeur-7c22ee/',contact:'https://le-vince.com/'},
 {id:'top-leisure',name:'Top Leisure',region:'檳城在地／怡保跨城',status:'車型與中文符合；司機評價待補',vehicle:'官方包車頁列 7 座 Alphard，仍須確認實際派車。',language:'官方服務頁明列中文、英文與廣東話包車。',rating:'本次查看 Tripadvisor 尚無評論；不標成「評價好」的推薦。',driver:'可作檳城在地調車比價候選；目前缺少能證明實際 Alphard 司機表現的公開評價。',limit:'詢價時要求近期同路段評論、司機姓名與車照；取得證據前不優先於已有司機乘客回饋的方案。',url:'https://topleisuremy.com/en/product/private-car-from-penang-cruise/',review:'https://www.tripadvisor.com.au/Attraction_Review-g660694-d27742918-Reviews-Top_Leisure-Penang_Island_Penang.html',contact:'https://topleisuremy.com/'},
 {id:'atv-borneo',name:'ATV Borneo Adventure · VVIP Alphard',region:'亞庇市區；度假村／昆達山另詢',status:'沙巴備選；Alphard 司機評價待補',vehicle:'官方 VVIP 頁明列 Toyota Alphard 配私人司機。',language:'官方套裝列中文導遊；需問是否為同一位中文司機，或需額外安排導遊。',rating:'VVIP 商品頁顯示尚無評分。SabahTravel 有其他行程乘客回饋，不能當成 Alphard 司機評價。',driver:'其他行程評論提到 Dan Dan、Raymond 導遊服務；只證明那些導覽體驗，不保證這次包車駕駛。',limit:'本次尚未找到沙巴同時確證「指定 Alphard＋中文司機＋該司機良好近期評價」的選項。昆達山過夜與 Tuaran 接送要獨立確認。',url:'https://www.atvborneoadventure.com/tour/vvip-tour-with-luxury-car/',review:'https://www.sabahtravel.com/p/atv-borneo-adventure',contact:'https://wa.me/60108258306'}
];
