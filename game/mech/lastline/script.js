// 續作港口撤離線：前三章有自己的地圖、觸發區與敵人，僅共用操作介面。
import * as THREE from 'three';
import { MECH6 as PREQUEL_CONTROLS } from '../zero/script.js';
const OP = '白鷺', ME = '零號', CIV = '車隊長・米拉', HQ = '聯邦指揮部', EN = '獵犬通訊';
const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
export const SAVE_KEY = 'lastline';
export const LAYOUT = 'harbor-v1';
export const FOOT_EXTENT = 320;
export const FIRST_MECH = 4;
export const INTRO = [
  '首都守住了，北濱港卻收到撤退命令。',
  '六十四名倖存者，兩輛醫療車。港口防波堤，是他們離開封鎖區的最後通道。',
  '蒼焰正在修船棚裡整備；海關與貨運站已落入獵犬手中。你必須徒步潛回去。',
  '白鷺截到另一份命令：天亮前，清除所有目擊者。簽章來自聯邦指揮部。',
];
export const CHAPTERS = [
  { n: 1, name: '海關裡的名字', en: 'CUSTOMS MANIFEST', start: 'start', yaw: 0, music: 1, end: { after: 'C3', at: p => Math.hypot(p.x + 105, p.z + 100) < 4 } },
  { n: 2, name: '冷藏站的假命令', en: 'COLD FREIGHT', start: 'ch2', yaw: Math.PI / 2, music: 3, end: { after: 'D3', at: p => Math.hypot(p.x, p.z - 5) < 4 } },
  { n: 3, name: '修船棚點火', en: 'DRYDOCK IGNITION', start: 'ch3', yaw: 0, music: 5 },
  { n: 4, name: '最後一班撤離車', en: 'LAST CONVOY', mech: true },
  { n: 5, name: '失落防線', en: 'LAST LINE', mech: true },
];
export const MECH_WALK = { ch: 3, after: 'F2', at: p => p.z > 44 };
export const HATCH_ROUTE = [[4, 60], [4, 74, 7], [4, 90, 7], [4, 102, 12.4], [4, 105, 12.4], [32, 105, 12.4], [32, 99.8, 12.4], [40, 99.8, 12.4]];
const soldier = (x, z, type = 'trooper', more = {}) => ({ type, x, z, yaw: Math.PI, ...more });
const drone = (x, z, y = 7) => ({ type: 'drone', x, z, y });
const encounter = (id, ch, obj, guide, enemies, more = {}) => ({ id, ch, obj, fight: obj, guide, enemies, trigger: p => Math.hypot(p.x - guide[0], p.z - guide[1]) < 4, lines: [], done: [], ...more });
export const ENCOUNTERS = [
  encounter('B', 1, '穿過貨運鐵道入口', [-180, -215], [soldier(-183, -207), soldier(-174, -210, 'trooper', { patrol: [[-174, -210], [-166, -219]] })], {
    lines: [[OP, '海關倉庫南門有兩個哨兵。貨運車和混凝土護欄能擋子彈。'], [OP, '衝鋒槍按 3，先避開探照方向。']], done: [[CIV, '名單留在海關通訊室。孩子們還在車上等。']] }),
  encounter('B2', 1, '潛入海關倉庫', [-180, -196], [soldier(-183, -181), soldier(-175, -168), soldier(-187, -155, 'officer')], {
    stealth: { reinforce: [soldier(-180, -139), soldier(-174, -143)], lines: [[EN, '海關倉庫有人！北門包過去！', true]] },
    lines: [[OP, '倉庫內有貨架，左側可以繞。軍官在最裡面。']], done: [[OP, '西翼拘留室裡有救援人員。先從鐵道側道找警報電源，之後再去東面的通訊室。']] }),
  encounter('C', 1, '清除海關裝卸坪', [-180, -125], [soldier(-169, -112), soldier(-157, -103, 'officer'), soldier(-184, -105), drone(-165, -112)], {
    response:{delay:7,enemies:[soldier(-169,-112), soldier(-184,-105)]},
    route: [[-180, -146]], lines: [[EN, '裝卸坪失聯。無人機低空搜索！', true]], done: [[OP, '往東走到通訊室，門口朝向裝卸坪。']] }),
  encounter('C2', 1, '取得撤離名單與命令', [-135, -100], [], {
    route: [[-151, -100]], pickups: [
      { id: 'radio', text: '按 E　接通撤離車', lines: [[CIV, '六十四個人，兩輛車。誰也不會被留下。']] },
      { id: 'codes', text: '按 E　取得命令密碼', lines: [[ME, '聯邦的簽章……為什麼在獵犬手上？']] },
      { id: 'smap', text: '按 E　記錄北濱港撤離路線', lines: [[OP, '通過貨櫃碼頭，再沿防波堤走。紙上那條近路是砲擊區。']] },
    ], itemName: '撤離情報', lines: [[OP, '桌上的三件情報都拿。進門後按 E。']], done: [[OP, '別關無線電。我要把簽章來源留下來。']] }),
  encounter('C3', 1, '守住海關通訊室', [-135, -100], [], {
    after: 'C2', wait: 2, hold: { t: 35, gap: 5, waves: [[soldier(-155, -100)], [soldier(-109, -100)], [drone(-107, -102)], [soldier(-155, -103, 'officer')], [soldier(-108, -95)], [soldier(-155, -97)]], done: [[OP, '簽章抓到了。']] },
    beats: [{ t: 22, lines: [[HQ, '北濱港已清空。停止救援。'], [CIV, '我們就在這裡！', true]] }],
    mark: V(-105, -100), next: '穿過東門，前往冷藏貨運站', nextRoute: [[-115, -100]],
    lines: [[OP, '守住兩端入口三十五秒。不要追進裝卸坪。']], done: [[OP, '原始簽章完整了。先把醫療隊與物資送上車，再破貨運站的封鎖。']] }),
  encounter('D0', 2, '穿過冷藏貨運站', [-85, -100], [soldier(-78, -107), soldier(-61, -98, 'officer'), soldier(-51, -108)], {
    lines: [[OP, '不要走正面的貨櫃巷。從冷藏站兩側的裝卸門穿過去。']], done: [[OP, '沿東門出去，再往南繞到干擾器後面。']] }),
  encounter('D', 2, '突破貨櫃檢查哨', [-31, -100], [soldier(-22, -96), soldier(-26, -86, 'heavy'), soldier(-12, -98), drone(-24, -89)], {
    response:{delay:7,enemies:[soldier(-22,-96), soldier(-12,-98)]},
    route: [[-44, -100]], lines: [[EN, '冷藏區突破！重裝隊守住出口！', true]], done: [[OP, '回到貨櫃南側。三台干擾器沿岸排開了。']] }),
  encounter('D1', 2, '摧毀封鎖鏈路', [-34, -65], [soldier(-56, -65), soldier(-17, -62), drone(-45, -60)], {
    response:{delay:7,enemies:[soldier(-56,-65), soldier(-17,-62)]},
    route: [[-31, -78]], targets: ['jam1', 'jam2', 'jam3'], tgName: '干擾器',
    lines: [[OP, '砲陣靠這三台干擾器遮蔽命令。先用貨櫃當掩護，再逐台打掉。']], done: [[CIV, '頻道回來了！我們往貨運站南出口移動。']] }),
  encounter('H2', 2, '進入港務醫療站', [23, -47], [soldier(18, -40), soldier(29, -35, 'officer')], {
    route: [[0, -64], [23, -57]], lines: [[OP, '隼的離線授權被送到港務醫療站。低屋頂，南門進。']], done: [[OP, '桌上有轉送名單和交班資料。']] }),
  encounter('I0', 2, '查找離線授權', [23, -37], [], {
    pickups: [{ id: 'rec_a', text: '按 E　翻轉送名單', lines: [[ME, '隼的物品被送到北濱港。']] }, { id: 'rec_b', text: '按 E　拿授權說明', lines: [[OP, '離線金鑰可以切斷指揮部的停機權限。']] }, { id: 'rec_c', text: '按 E　看交班記錄', lines: [[ME, '他最後留下的話：把人送出去。']] }], itemName: '授權資料' }),
  encounter('KEY', 2, '取得蒼焰離線金鑰', [25, -37], [], {
    pickup: { at: 'key', text: '按 E　拿起離線金鑰' }, trigger: () => true,
    lines: [[OP, '金屬卡就在桌邊。']], done: [[ME, '這一次，蒼焰只聽駕駛員的。']] }),
  encounter('D3', 2, '擊退醫療站追兵', [23, -37], [soldier(22, -53, 'heavy', { alert: true }), soldier(28, -59, 'officer', { alert: true }), drone(24, -58)], {
    response:{delay:7,enemies:[soldier(28,-59), soldier(22,-53)]},
    after: 'KEY', wait: 3, mark: V(0, 5), next: '從北門出去，前往修船棚', nextRoute: [[23, -21], [0, -15]],
    lines: [[EN, '金鑰在醫療站！封住南門！', true]], done: [[OP, '追兵被切斷。修船棚就在北邊，蒼焰還在裡面。']] }),
  encounter('F', 3, '清除修船裝卸場', [0, 24], [soldier(9, 36), soldier(18, 46, 'officer'), soldier(-9, 34), drone(15, 28)], {
    response:{delay:7,enemies:[soldier(9,36), soldier(-9,34)]},
    lines: [[OP, '他們把修船場當成機體回收站。起重架下有低掩體。']], done: [[OP, '工具箱裡有備用保險絲。先取回來。']] }),
  encounter('F2', 3, '拿回維修架保險絲', [19, 40], [soldier(30, 43), soldier(29, 49)], {
    pickups: [{ id: 'fuse', text: '按 E　拿保險絲', lines: [[ME, '拿到了。']] }], itemName: '保險絲',
    done: [[OP, '保險絲拿到了。先解除吊架制動，外側也有敵機巡邏，留意出口。']] }),
  encounter('G1', 3, '阻止拖走蒼焰', [40, 57], [soldier(28, 70), soldier(54, 73, 'officer'), soldier(46, 84), drone(35, 83, 10)], {
    response:{delay:7,enemies:[soldier(28,70), soldier(46,84)]},
    route: [[40, 45]], targets: ['tow1', 'tow2'], tgName: '拖吊發電機', alarm: true,
    lines: [[OP, '蒼焰在圓拱修船棚裡！兩台拖吊發電機先打掉。', true]], done: [[OP, '拖吊架停了。南側兩個配電箱接回去。']] }),
  encounter('G3', 3, '恢復修船棚電源', [18, 62], [soldier(58, 68, 'sniper', { post: true }), drone(52, 75, 9)], {
    pickups: [{ id: 'panel1', text: '按 E　裝回西側保險絲', lines: [[ME, '西側供電恢復。']] }, { id: 'panel2', text: '按 E　裝回東側保險絲', lines: [[ME, '東側供電恢復。']] }], itemName: '配電箱',
    lines: [[OP, '配電箱都在地面。東側有狙擊手，先清掉再過去。']], done: [[OP, '我開始切斷遠端權限。']] }),
  encounter('G4', 3, '守住修船棚，完成離線啟動', [40, 65], [], {
    after: 'G3', wait: 2, hold: { t: 40, gap: 5, waves: [[soldier(36, 48)], [drone(40, 42, 12)], [soldier(43, 48, 'officer')], [soldier(37, 116)], [drone(43, 108, 12)], [soldier(44, 48, 'heavy')], [soldier(40, 116)]] },
    lines: [[HQ, '停止啟動。你將被列為叛軍。', true], [ME, '車上六十四個人也算叛軍嗎？'], [OP, '先守住西側配電箱，再移動到東側冷卻回路。離開位置，作業就會停止。']], done: [[OP, '離線授權通過。最後一批重裝兵正在突入！', true]] }),
  encounter('G2', 3, '擊退修船棚增援', [40, 70], [soldier(37, 47, 'heavy', { alert: true }), soldier(43, 47, 'heavy', { alert: true }), soldier(40, 118, 'officer', { alert: true }), drone(40, 116, 12)], {
    response:{delay:7,enemies:[soldier(37,47), soldier(43,47)]},
    after: 'G4', wait: 2, done: [[OP, '修船棚安全。西側樓梯上維修架，進胸前艙門。'], [CIV, '我們在碼頭接應路。零號，別遲到。']] }),
];
export const LINES = {
  start: [[OP, '北濱港鐵道口，開始潛入。每清一區都會留下檢查點。'], [CIV, '海關的名單就是我們最後的證據。']],
  ch2: [[OP, '冷藏貨運站裡有兩個裝卸門。先繞過貨櫃檢查哨，再打干擾器。']],
  ch3: [[OP, '這次不是第七機庫。蒼焰藏在北濱港的修船棚，維修架在西側。'], [ME, '拿回機體，再把車隊送到防波堤。']],
  mech: [[EN, '修船場機動巡邏開始。'], [OP, '外側吊車軌道有敵機。藏在棚內，讓它過去。'], [OP, '它走遠了。繼續啟動。']],
  hatch: [[OP, '離線金鑰已辨識。胸前艙門開了，按 E 上機。']],
};
const keys = [['W A S D', '移動／滑鼠瞄準'], ['左鍵／右鍵', '40 發步槍／鎖定飛彈'], ['F／E', '光劍／光波砲'], ['Shift／空白', '噴射／跳躍'], ['R／V', '換彈／切換視角'], ['B', '按住接通現場設施'], ['Esc', '暫停／畫質設定']];
const touch = [...PREQUEL_CONTROLS.touch, ['tSupport','接通']];
const wave = (title, go, list, lines, more = {}) => ({ title, sub: '守住車隊，清除敵軍', go: [...go, 90], cp: [go[0] - 22, go[1], Math.PI / 2], list, lines, obj: title, music: 4, repair: 0.18, ...more });
const mission = new URL('./mission.js', import.meta.url).href;
const common = { mission, keys, touch, flee: { path: [], lines: [] }, down: [[OP, '回到上一個安全路口。車隊狀態也會恢復，重新組織防線。']], clear: ['路口安全', '車隊繼續前進'], bossDown: [[OP, '敵方指揮機失去戰力！', true]] };
export const MECH_CONFIGS = {
  4: { ...common, chapter: 4, name: CHAPTERS[3].name, en: CHAPTERS[3].en, label: 'CHAPTER 4　最後一班撤離車',
    start: { x: 170, z: -120, yaw: Math.PI / 2, lines: [[CIV, '你真的來了。兩輛車都還能跑。'], [OP, '先清路口。敵軍沒清完，車隊會停車等待。離開超過一百公尺，車隊也會等你。']] },
    restart: { x: 170, z: -120, yaw: Math.PI / 2 }, goal: ['保護撤離車隊', '沿貨運碼頭接應路前進'],
    route: [[192, -120], [360, -120], [360, 120], [600, 120]], choiceAt: 1,
    waves: [
      wave('碼頭接應', [192, -120], [['grunt', 270, -120], ['grunt', 320, -80], ['heli', 290, -180, 55]], [[OP, '三台機體，一架直升機。按住右鍵掃過目標，再鬆開發射飛彈。', true]]),
      wave('貨櫃場伏擊', [360, -120], [['heavy', 410, -100], ['grunt', 440, -150], ['tank', 480, -120]], [[EN, '車隊已確認。對醫療車開火。', true], [CIV, '前面轉角有重裝機！']]),
      wave('筒倉岸線', [360, 120], [['grunt', 400, 170], ['heli', 440, 220, 70], ['grunt', 300, 240]], [[OP, '沿筒倉岸線往北走，別讓敵人穿過車隊。', true]]),
      wave('防波堤入口', [600, 120], [['heavy', 650, 180], ['grunt', 650, 60], ['heli', 590, 260, 60]], [[CIV, '出口就在前面，但撤離閘門還沒開。'], [OP, '守住最後這個路口。閘門的電源在防波堤另一側。']]),
    ], end: [[CIV, '兩輛車都到了。孩子們在數你的腳步聲。'], [OP, '獵犬主力往防波堤集結。我們得在這裡擋住他們。']], fin: ['還差最後一道防線', '下一章　失落防線'] },
  5: { ...common, chapter: 5, name: CHAPTERS[4].name, en: CHAPTERS[4].en, label: 'CHAPTER 5　失落防線',
    start: { x: 580, z: 120, yaw: Math.PI, lines: [[HQ, '零號，閘門不會為你開。交出蒼焰，我們可以停止追擊。'], [CIV, '救援站接到訊號了。他們正在啟動外側閘門。'], [OP, '不要交機體。帶著證據和人活著出去。']] },
    restart: { x: 580, z: 120, yaw: Math.PI }, goal: ['守住最後防線', '護送車隊通過撤離閘門'],
    route: [[600, 120], [600, -120], [600, -360]],
    waves: [
      wave('救援站防禦', [600, 120], [['heavy', 650, 200], ['grunt', 510, 180], ['heli', 580, 280, 65]], [[OP, '重裝機從北側來。利用碼頭護柱擋砲線，近身用光劍。', true]], { music: 5 }),
      wave('最後廣播', [600, -120], [['grunt', 548, -150], ['heavy', 662, -200], ['heli', 590, -260, 70], ['grunt', 650, -40]], [[OP, '到這個路口，證據才能傳到城外。車隊到位就能繼續。'], [HQ, '切斷中繼。這份命令不准外流。', true]], { music: 5 }),
      wave('失落防線', [600, -360], [['ace', 600, -470], ['heavy', 642, -410], ['grunt', 500, -440]], [[EN, '王牌隊，封住防波堤。'], [ME, '從今天起，這裡不再是你們的靶場。', true]], { music: 6, boss: { ap: 1.5 }, repair: 0.25 }),
    ], end: [], fin: ['天亮之後，還有人記得', 'IRON DUSK · LAST LINE　全篇完'] },
};
export const MECH6 = MECH_CONFIGS[4];

// 七章戰役：用現場操作、移動救援與據點防守取代單純的清敵／等秒數。
const node=(x,z,label,seconds=3)=>Object.assign([x,z],{label,seconds});
const consoleOp=(points,reward=null,bypass=false)=>({kind:'console',points,radius:2.2,reward,bypass});
const escortOp=(route,reward)=>({kind:'escort',route,radius:14,speed:2.4,reward,success:'救援工程兵抵達安全區'});
const insertAfter=(id,...entries)=>ENCOUNTERS.splice(ENCOUNTERS.findIndex(e=>e.id===id)+1,0,...entries);
insertAfter('B2',
  encounter('B3',1,'切斷海關西翼警報',[-214,-184],[soldier(-217,-174,'officer'),soldier(-214,-161)],{
    route:[[-180,-125],[-214,-125]],operation:consoleOp([node(-214,-178,'拆開警報電源',3),node(-215,-166,'切斷追蹤回路',3)],'alarm'),
    lines:[[OP,'倉庫的軍官不是在守貨。他在替一批「不存在的人」銷毀登記。西翼警報先拆掉。']],done:[[ME,'這些名字都有年齡。最小的只有六歲。']]}),
  encounter('B4',1,'潛入拘留室，取得轉運授權',[-214,-165],[soldier(-220,-156,'trooper',{patrol:[[-220,-156],[-213,-146]]})],{
    operation:consoleOp([node(-214,-164,'解除拘留室門鎖',4)],'permit',true),stealth:{reinforce:[soldier(-216,-190),soldier(-219,-141,'officer')],lines:[[EN,'西翼拘留室失聯，封鎖鐵道出口！',true]]},
    lines:[['救援工程兵・楠','我們是港務救援隊。指揮部把我們登記成敵軍，連救護車也不准走。'],[OP,'能不開槍就不開。拿到授權，從北側離開，不必把巡邏隊全部打倒。']],done:[['楠','我帶著配電站的離線圖。讓我跟你走。']]}),
  encounter('B5',1,'護送救援工程兵穿過鐵道側道',[-214,-164],[soldier(-214,-136),soldier(-220,-119)],{
    response:{delay:7,enemies:[soldier(-214,-136), soldier(-220,-119)]},
    operation:escortOp([[-214,-164],[-214,-146],[-214,-125],[-180,-125]],'engineer'),
    lines:[[OP,'跟緊工程兵。他們遇到近處敵人會停下，離你太遠也不會往前走。']],done:[['楠','一號車的醫療艙缺氧氣。冷藏站旁邊還有物資，我們得拿到。']]}));
insertAfter('C2',encounter('C4',1,'核對清除命令的原始紀錄',[-135,-100],[],{
  operation:consoleOp([node(-132,-112,'比對名單時間戳',3),node(-120,-110,'還原被刪除的簽章',4)],'evidence'),
  lines:[[ME,'命令說港區已清空，可這份名單是十分鐘前才更新的。'],[OP,'把原始簽章留下。單一張照片，他們可以說是偽造。']],done:[[HQ,'立即停止資料存取。零號，你沒有這個權限。'],[ME,'那就別再用我的名字簽命令。']]}));
insertAfter('C3',
  encounter('C5',1,'護送醫療工程兵到臨時救護站',[-135,-100],[soldier(-153,-68),drone(-149,-57)],{
    response:{delay:7,enemies:[soldier(-153,-68)]},
    operation:escortOp([[-135,-100],[-151,-100],[-151,-65],[-128,-65],[-128,-46]],'medics'),
    lines:[['楠','兩個醫療工程兵在這裡。我們帶的是氧氣，不是槍。'],[OP,'先從西門繞開封鎖，再進救護站。']],done:[[CIV,'一號車上的孩子開始喘不過氣。我不能再等一份批准。']]}),
  encounter('C6',1,'搶救救護車的氧氣與藥品',[-128,-46],[soldier(-119,-64,'officer'),soldier(-148,-35)],{
    operation:consoleOp([node(-135,-42,'接通氧氣供應',4),node(-122,-42,'整理止血與鎮痛物資',3)],'medicine'),
    lines:[['楠','保險封條都是新的。他們明明知道這裡有傷員，還把供應關掉。']],done:[[CIV,'氧氣回來了。謝謝，現在我能把他們送到港外。']]}),
  encounter('C7',1,'把醫療資料送到撤離車隊',[-128,-46],[],{
    operation:consoleOp([node(-128,-39,'確認六十四人的轉運分組',4)],'manifest'),mark:V(-105,-100),next:'回到冷藏貨運站入口',nextRoute:[[-128,-65],[-105,-65]],
    lines:[[OP,'不用再聽他們說港口沒有人。把每一輛車的名單都寫進離線授權。']],done:[[CIV,'六十四個名字，我都記住了。零號，接下來換我們相信你。']]}));
CHAPTERS[0].end.after='C7';
insertAfter('D1',
  encounter('D2',2,'拆除冷藏站的封鎖電源',[-10,-43],[soldier(-16,-39),soldier(-4,-34,'officer')],{
    route:[[-31,-78],[-34,-45]],operation:consoleOp([node(-12,-43,'旁路冷藏站斷路器',3),node(-3,-40,'釋放貨運閘鎖',4)],'power'),
    lines:[['楠','正門已鎖死。我能旁路，前提是你把這兩個配電箱打開。']],done:[[OP,'追蹤鏈路少了一段。後面的車隊不會再每個路口都被標定。']]}),
  encounter('D2B',2,'把工程兵送到港務中繼站',[-34,-65],[soldier(-28,-48),drone(-19,-40)],{
    response:{delay:7,enemies:[soldier(-28,-48)]},
    operation:escortOp([[-34,-65],[-34,-45],[-18,-45],[0,-45]],'relay'),lines:[['楠','我會留在中繼站替車隊開路。你去醫療站拿金鑰，別把時間耗在這裡。']],done:[[OP,'楠留在港內。他在圖上標了砲陣的供電位置。']]}),
  encounter('D2C',2,'潛入中繼站，保留敵軍識別頻道',[0,-45],[soldier(-3,-29,'trooper',{patrol:[[-3,-29],[-16,-22]]})],{
    operation:consoleOp([node(0,-44,'複製敵軍識別頻道',4)],'frequency',true),stealth:{reinforce:[soldier(-27,-40,'heavy')],lines:[[EN,'頻道有人複製！切換備用識別！',true]]},
    lines:[[OP,'不要直接炸中繼站。留下識別頻道，之後能在砲陣開火前知道落點。']],done:[[ME,'這一次，先看見我們的不是他們。']]}));
insertAfter('KEY',encounter('KEY2',2,'解除金鑰上的遠端停機限制',[23,-37],[soldier(19,-55,'officer')],{
  operation:consoleOp([node(30,-32,'讀取離線授權',3),node(20,-32,'清除遠端停機簽章',5)],'auth'),
  lines:[[HQ,'那把金鑰附有追蹤。把機體交出來，車隊就會安全。'],[OP,'他們在說謊。授權最後一頁藏了停機命令，別直接插進蒼焰。']],done:[[ME,'金鑰只剩一個持有人。是我。']]}));
insertAfter('F2',encounter('F3',3,'讓修船吊架恢復手動控制',[8,43],[soldier(13,44),soldier(3,48,'officer')],{
  operation:consoleOp([node(5,40,'釋放吊架制動',3),node(8,47,'切換手動起重控制',4)],'crane'),
  lines:[['楠','他們不是在維修蒼焰。吊架夾具一收，你的駕駛艙會被直接扯開。']],done:[[ME,'先解除制動，再拿回機體。']]}));
const powerMission=ENCOUNTERS.find(e=>e.id==='G3');delete powerMission.pickups;
powerMission.operation=consoleOp([node(18,62,'接通西側保險絲',3),node(62,62,'接通東側保險絲',3),node(63,88,'讓冷卻泵重新循環',4)],'cooling');
insertAfter('G3',encounter('G3B',3,'清除最後的遠端控制器',[60,83],[soldier(57,91,'officer'),drone(55,84,8)],{
  targets:['override'],tgName:'控制器',lines:[[OP,'供電回來了，但遠端控制器還在發信號。打掉機體右側的設備，我才能替你開艙門。']],done:[[HQ,'零號，我們會用你救下來的車隊定位你。'],[ME,'你們已經說得夠多了。']]}));
const bootDefense=ENCOUNTERS.find(e=>e.id==='G4');delete bootDefense.hold;
bootDefense.operation={kind:'defend',radius:12,points:[node(18,64,'守住西側配電箱',18),node(61,66,'守住東側冷卻回路',18)],reward:'boot'};
bootDefense.enemies=[soldier(36,48),soldier(37,116),drone(43,108,12)];
bootDefense.pressure={gap:8,list:[soldier(36,48),soldier(37,116),drone(43,108,12),soldier(43,48),soldier(40,116)]};
bootDefense.beats=[{t:12,lines:[['楠','西側已穩定，東側還在過載。別讓他們靠近配電箱！',true]]}];
bootDefense.stealth={reinforce:[soldier(43,48,'officer'),soldier(40,116,'heavy')],lines:[[EN,'啟動信號確認，前後門突入！',true]]};
insertAfter('G4',encounter('G4B',3,'護送工程兵離開修船棚',[61,66],[soldier(67,48)],{
    response:{delay:7,enemies:[soldier(67,48)]},
  operation:escortOp([[61,66],[40,66],[40,57],[40,45]],'crew'),lines:[['楠','我不進駕駛艙。有人得在地面替車隊開門。把我送出棚，再上機。']],done:[[OP,'地面隊會替你接通中繼。蒼焰不再是一個人在打。']]}));

CHAPTERS[4].name='封鎖線上的廣播';CHAPTERS[4].en='THE FORBIDDEN SIGNAL';
CHAPTERS.push({n:6,name:'沉默砲陣',en:'SILENCE THE BATTERY',mech:true},{n:7,name:'破曉閘門',en:'GATE AT DAWN',mech:true});
const originalFinal=MECH_CONFIGS[5];
MECH_CONFIGS[4].next=5;
MECH_CONFIGS[4].waves[0].operation={kind:'console',radius:16,points:[node(200,-145,'重啟救援車供電',4)]};
MECH_CONFIGS[4].waves[2].operation={kind:'defend',radius:45,points:[node(360,120,'掩護傷員轉車',22)]};
MECH_CONFIGS[5]={...originalFinal,name:CHAPTERS[4].name,en:CHAPTERS[4].en,label:'CHAPTER 5　封鎖線上的廣播',next:6,
  goal:['把清除命令傳到城外','接通港區中繼，保護廣播鏈路'],
  start:{x:580,z:120,yaw:Math.PI,lines:[[HQ,'零號，解除武裝。我們會重新審查這份醫療名單。'],[ME,'你們把名字從系統刪掉，不代表人不存在。'],[OP,'到兩座現場控制站，把原始簽章和名單一起送到城外。']]},
  end:[[OP,'原始命令已經傳出，但出口的電源還在砲陣手裡。'],['楠','我找到了旁路。進貨運場切斷三個控制站，外面的救援隊才能開門。']],fin:['證據到了，人還沒有','下一章　沉默砲陣']};
MECH_CONFIGS[5].waves=originalFinal.waves.map((w,i)=>({...w,boss:null,title:i===2?'廣播鏈路防禦':w.title,obj:i===2?'廣播鏈路防禦':w.obj,lines:i===2?[[HQ,'把這段廣播切掉。不得留下副本。'],[ME,'每一份原始命令，都會留下你們的簽章。',true]]:w.lines,list:i===2?[['heavy',642,-410],['grunt',500,-440],['heli',580,-470,65]]:w.list,
  operation:i===1?{kind:'console',radius:16,points:[node(620,-132,'上傳清除命令原始檔',6),node(577,-142,'建立城外備援頻道',4)]}:i===2?{kind:'defend',radius:50,points:[node(600,-360,'守住廣播，不讓信號中斷',24)]}:null}));
MECH_CONFIGS[6]={...common,chapter:6,name:CHAPTERS[5].name,en:CHAPTERS[5].en,label:'CHAPTER 6　沉默砲陣',next:7,bombardment:true,goal:['截斷敵方砲擊指令','突破供電場，解除出口封鎖'],
  start:{x:580,z:-360,yaw:-Math.PI/2,lines:[[CIV,'二號車懸吊受損，我們會沿貨運場外圈跟著你。'],[OP,'砲陣有預警。看到落點就離開；切斷控制站之後才算真正安全。']]},restart:{x:580,z:-360,yaw:-Math.PI/2},
  route:[[600,-360],[360,-360],[360,-120],[600,-120]],waves:[
    wave('岸線砲擊',[600,-360],[['heavy',650,-335],['grunt',540,-375],['heli',600,-480,65]],[[OP,'一號追蹤站在道路東側。按住 B 接通旁路，受到命中會中斷。',true]],{operation:{kind:'console',radius:16,points:[node(620,-350,'切斷岸線追蹤站',5)]}}),
    wave('彈藥場突擊',[360,-360],[['tank',410,-345],['grunt',320,-340],['grunt',380,-320]],[['楠','這裡的供電表有兩個迴路，先打開旁路，再解除主砲鎖。']],{operation:{kind:'console',radius:16,points:[node(330,-342,'開啟供電旁路',4),node(390,-335,'解除主砲控制鎖',5)]}}),
    wave('工程兵穿越',[360,-120],[['heavy',395,-140],['heli',360,-200,60],['grunt',340,-165]],[[CIV,'工程兵正在穿越裝卸場。別離開他們太遠！',true]],{operation:{kind:'defend',radius:48,points:[node(360,-120,'保護地面維修隊',26)]}}),
    wave('切斷最後砲令',[600,-120],[['ace',650,-100],['grunt',550,-145],['heli',610,-220,65]],[['楠','最後一個控制站就在出口接應路。再多十秒，我就能把砲令鎖死。']],{operation:{kind:'console',radius:16,points:[node(621,-101,'封鎖砲陣遠端指令',7)]}})],
  end:[['楠','所有砲令停止。救援隊已經看見你們了。'],[HQ,'這不代表你們能離開。獵犬主力，進港。'],[ME,'那就到閘門前見。']],fin:['砲陣沉默了','下一章　破曉閘門']};
MECH_CONFIGS[7]={...originalFinal,chapter:7,name:CHAPTERS[6].name,en:CHAPTERS[6].en,label:'CHAPTER 7　破曉閘門',final:true,
  start:{x:580,z:-120,yaw:Math.PI,lines:[[CIV,'城外救援隊就在另一側。零號，這次換我們替你留位置。'],[OP,'閘門需要兩個現場授權，不能再靠一份無線電命令。']]},restart:{x:580,z:-120,yaw:Math.PI},
  route:[[600,-120],[600,-260],[600,-360]],waves:[
    wave('救援站接通',[600,-120],[['heavy',650,-40],['grunt',550,-145],['heli',610,-220,65]],[[OP,'先到兩側控制站，按住 B。醫療車等你解除最後的封鎖。',true]],{operation:{kind:'console',radius:16,points:[node(573,-132,'救援站西側授權',4),node(622,-130,'救援站東側授權',4)]}}),
    wave('最後一班傷員',[600,-260],[['heavy',650,-280],['grunt',550,-275],['heli',620,-350,60]],[[CIV,'兩輛車正在轉移最重的傷員。請守住這段路，不要追著直升機離開。',true]],{operation:{kind:'defend',radius:48,points:[node(600,-260,'保護傷員通過隔離區',30)]}}),
    wave('獵犬隊長',[600,-360],[['ace',600,-470],['heavy',642,-410],['grunt',500,-440]],[[EN,'交出機體。指揮部會替這些人重新登記。'],[ME,'他們有名字。你們沒有權力把它擦掉。',true]],{music:6,boss:{ap:1.7},operation:{kind:'console',radius:16,points:[node(600,-383,'開啟城外撤離閘門',6)]}})],
  end:[],fin:['破曉之後，仍有名字','IRON DUSK · LAST LINE　全篇完']};

// 支援縱隊七秒後抵達已確認的作戰入口，隊列滿員時在場外等待。
const supportColumns = {
  4: [[['grunt',270,-120]], [['grunt',440,-150],['grunt',410,-100]], [['grunt',400,170]], [['grunt',650,60],['grunt',650,180]]],
  5: [[['grunt',510,180],['grunt',650,200]], [['grunt',548,-150]], [['grunt',500,-440],['grunt',642,-410]]],
  6: [[['grunt',540,-375],['grunt',650,-335]], [['grunt',320,-340]], [['grunt',340,-165],['grunt',395,-140]], [['grunt',550,-145]]],
  7: [[['grunt',550,-145],['grunt',650,-40]], [['grunt',550,-275]], [['grunt',500,-440],['grunt',642,-410]]],
};
for (const [chapter, lists] of Object.entries(supportColumns)) MECH_CONFIGS[chapter].waves.forEach((w, i) => { w.reinforce = lists[i]; });
