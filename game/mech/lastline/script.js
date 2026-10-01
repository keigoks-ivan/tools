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
    lines: [[OP, '倉庫內有貨架，左側可以繞。軍官在最裡面。']], done: [[OP, '從北門出去。通訊室在右邊的低屋頂建築。']] }),
  encounter('C', 1, '清除海關裝卸坪', [-180, -125], [soldier(-169, -112), soldier(-157, -103, 'officer'), soldier(-184, -105), drone(-165, -112)], {
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
    lines: [[OP, '守住兩端入口三十五秒。不要追進裝卸坪。']], done: [[OP, '命令是真的。下一步，打掉貨運站的封鎖鏈路。']] }),
  encounter('D0', 2, '穿過冷藏貨運站', [-85, -100], [soldier(-78, -107), soldier(-61, -98, 'officer'), soldier(-51, -108)], {
    lines: [[OP, '不要走正面的貨櫃巷。從冷藏站兩側的裝卸門穿過去。']], done: [[OP, '沿東門出去，再往南繞到干擾器後面。']] }),
  encounter('D', 2, '突破貨櫃檢查哨', [-31, -100], [soldier(-22, -96), soldier(-26, -86, 'heavy'), soldier(-12, -98), drone(-24, -89)], {
    route: [[-44, -100]], lines: [[EN, '冷藏區突破！重裝隊守住出口！', true]], done: [[OP, '回到貨櫃南側。三台干擾器沿岸排開了。']] }),
  encounter('D1', 2, '摧毀封鎖鏈路', [-34, -65], [soldier(-56, -65), soldier(-17, -62), drone(-45, -60)], {
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
    after: 'KEY', wait: 3, mark: V(0, 5), next: '從北門出去，前往修船棚', nextRoute: [[23, -21], [0, -15]],
    lines: [[EN, '金鑰在醫療站！封住南門！', true]], done: [[OP, '追兵被切斷。修船棚就在北邊，蒼焰還在裡面。']] }),
  encounter('F', 3, '清除修船裝卸場', [0, 24], [soldier(9, 36), soldier(18, 46, 'officer'), soldier(-9, 34), drone(15, 28)], {
    lines: [[OP, '他們把修船場當成機體回收站。起重架下有低掩體。']], done: [[OP, '工具箱裡有備用保險絲。先取回來。']] }),
  encounter('F2', 3, '拿回維修架保險絲', [19, 40], [soldier(30, 43), soldier(29, 49)], {
    pickups: [{ id: 'fuse', text: '按 E　拿保險絲', lines: [[ME, '拿到了。']] }], itemName: '保險絲',
    done: [[OP, '修船棚正門在北邊。外側有敵機巡邏，先讓它走過。']] }),
  encounter('G1', 3, '阻止拖走蒼焰', [40, 57], [soldier(28, 70), soldier(54, 73, 'officer'), soldier(46, 84), drone(35, 83, 10)], {
    route: [[40, 45]], targets: ['tow1', 'tow2'], tgName: '拖吊發電機', alarm: true,
    lines: [[OP, '蒼焰在圓拱修船棚裡！兩台拖吊發電機先打掉。', true]], done: [[OP, '拖吊架停了。南側兩個配電箱接回去。']] }),
  encounter('G3', 3, '恢復修船棚電源', [18, 62], [soldier(58, 68, 'sniper', { post: true }), drone(52, 75, 9)], {
    pickups: [{ id: 'panel1', text: '按 E　裝回西側保險絲', lines: [[ME, '西側供電恢復。']] }, { id: 'panel2', text: '按 E　裝回東側保險絲', lines: [[ME, '東側供電恢復。']] }], itemName: '配電箱',
    lines: [[OP, '配電箱都在地面。東側有狙擊手，先清掉再過去。']], done: [[OP, '我開始切斷遠端權限。']] }),
  encounter('G4', 3, '守住修船棚，完成離線啟動', [40, 65], [], {
    after: 'G3', wait: 2, hold: { t: 40, gap: 5, waves: [[soldier(36, 48)], [drone(40, 42, 12)], [soldier(43, 48, 'officer')], [soldier(37, 116)], [drone(43, 108, 12)], [soldier(44, 48, 'heavy')], [soldier(40, 116)]] },
    lines: [[HQ, '停止啟動。你將被列為叛軍。', true], [ME, '車上六十四個人也算叛軍嗎？'], [OP, '四十秒。守住修船棚前後的裝卸門。']], done: [[OP, '離線授權通過。最後一批重裝兵正在突入！', true]] }),
  encounter('G2', 3, '擊退修船棚增援', [40, 70], [soldier(37, 47, 'heavy', { alert: true }), soldier(43, 47, 'heavy', { alert: true }), soldier(40, 118, 'officer', { alert: true }), drone(40, 116, 12)], {
    after: 'G4', wait: 2, done: [[OP, '修船棚安全。西側樓梯上維修架，進胸前艙門。'], [CIV, '我們在碼頭接應路。零號，別遲到。']] }),
];
export const LINES = {
  start: [[OP, '北濱港鐵道口，開始潛入。每清一區都會留下檢查點。'], [CIV, '海關的名單就是我們最後的證據。']],
  ch2: [[OP, '冷藏貨運站裡有兩個裝卸門。先繞過貨櫃檢查哨，再打干擾器。']],
  ch3: [[OP, '這次不是第七機庫。蒼焰藏在北濱港的修船棚，維修架在西側。'], [ME, '拿回機體，再把車隊送到防波堤。']],
  mech: [[EN, '修船場機動巡邏開始。'], [OP, '外側吊車軌道有敵機。藏在棚內，讓它過去。'], [OP, '它走遠了。繼續啟動。']],
  hatch: [[OP, '離線金鑰已辨識。胸前艙門開了，按 E 上機。']],
};
const keys = [['W A S D', '移動／滑鼠瞄準'], ['左鍵／右鍵', '40 發步槍／鎖定飛彈'], ['F／E', '光劍／光波砲'], ['Shift／空白', '噴射／跳躍'], ['R／V', '換彈／切換視角'], ['Esc', '暫停／畫質設定']];
const touch = PREQUEL_CONTROLS.touch;
const wave = (title, go, list, lines, more = {}) => ({ title, sub: '守住車隊，清除敵軍', go: [...go, 90], cp: [go[0] - 22, go[1], Math.PI / 2], list, lines, obj: title, music: 4, repair: 0.18, ...more });
const mission = new URL('./mission.js', import.meta.url).href;
const common = { mission, keys, touch, flee: { path: [], lines: [] }, down: [[OP, '回到上一個安全路口。車隊狀態也會恢復，重新組織防線。']], clear: ['路口安全', '車隊繼續前進'], bossDown: [[OP, '敵方指揮機失去戰力！', true]] };
export const MECH_CONFIGS = {
  4: { ...common, chapter: 4, name: CHAPTERS[3].name, en: CHAPTERS[3].en, label: 'CHAPTER 4　最後一班撤離車',
    start: { x: 170, z: -120, yaw: Math.PI / 2, lines: [[CIV, '你真的來了。兩輛車都還能跑。'], [OP, '先清路口。敵軍沒清完，車隊會停車等待。離開超過一百公尺，車隊也會等你。']] },
    restart: { x: 170, z: -120, yaw: Math.PI / 2 }, goal: ['保護撤離車隊', '沿貨運碼頭接應路前進'],
    route: [[192, -120], [360, -120], [360, 120], [600, 120]], choiceAt: 1,
    waves: [
      wave('碼頭接應', [192, -120], [['grunt', 270, -120], ['grunt', 320, -80], ['heli', 290, -180, 55]], [[OP, '兩台機體，一架直升機。按住右鍵掃過目標，再鬆開發射飛彈。', true]]),
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
