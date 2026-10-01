// 續作共用前傳已驗證的實體街區與通行路線；任務、存檔及結局獨立。
import * as Z from '../zero/script.js';
const OP = '白鷺', ME = '零號', CIV = '車隊長・米拉', HQ = '聯邦指揮部', EN = '獵犬通訊';
export const SAVE_KEY = 'lastline';
export const FIRST_MECH = 4;
export const INTRO = [
  '蒼焰守住首都，卻沒能讓戰爭停下。',
  '三天後，聯邦宣布放棄北區。最後兩輛撤離車，還有六十四個人沒有離開。',
  '獵犬切斷通訊，蒼焰的維修基地再次失守。你只能先徒步潛回去。',
  '白鷺收到一份撤離命令。最底下一行卻寫著：天亮前，清除所有目擊者。',
];
export const CHAPTERS = [
  { ...Z.CHAPTERS[0], name: '剩下的人', en: 'REMAINING NAMES' },
  { ...Z.CHAPTERS[1], name: '封鎖頻道', en: 'FALSE ORDERS' },
  { ...Z.CHAPTERS[2], name: '奪回蒼焰', en: 'RETAKE AZURE FLAME', end: undefined },
  { n: 4, name: '最後一班撤離車', en: 'LAST CONVOY', mech: true },
  { n: 5, name: '失落防線', en: 'LAST LINE', mech: true },
];
export const MECH_WALK = { ...Z.MECH_WALK, ch: 3 };
export const HATCH_ROUTE = Z.HATCH_ROUTE;
const rewrite = {
  B: { lines: [[OP, '維修基地又被占領了。蒼焰還在裡面，但先找撤離車的名單。'], [OP, '後巷兩個巡邏兵。右鍵瞄準，C 蹲下；衝鋒槍按 3。']] },
  B2: { lines: [[CIV, '我們在城東等你。醫院的孩子也在車上。'], [OP, '修車行有三個人，北門通往廣場。別讓他們叫增援。']] },
  C: { lines: [[EN, '封鎖市場，不准任何車輛離開。', true], [ME, '撤離令不是已經通過了？'], [OP, '先活著找到那份命令。攤位可以擋子彈，G 丟手榴彈。']] },
  C2: { obj: '取得撤離名單與命令', itemName: '撤離情報', lines: [[OP, '據點有無線電、密碼本和搜索地圖。靠近按 E，三件都要拿。']],
    pickups: [
      { id: 'radio', text: '按 E　接通撤離車', lines: [[CIV, '六十四個人，兩輛車。我們不會丟下任何一個。']] },
      { id: 'codes', text: '按 E　取得命令密碼', lines: [[ME, '聯邦的密碼……為什麼在獵犬的桌上？']] },
      { id: 'smap', text: '按 E　記錄撤離路線', lines: [[OP, '路線被改過。這一條把車隊送進交叉火網。']] },
    ], done: [[OP, '我用密碼追查簽發來源。先守住據點。']] },
  C3: { lines: [[HQ, '北區平民已撤離。停止一切救援。'], [CIV, '我們就在這裡！別讓他們把我們抹掉！', true], [OP, '給我四十秒，留下他們親口下令的證據。守住兩側門口。']], done: [[OP, '簽章是真的。清除命令來自我們自己的指揮部。'], [ME, '那就把人帶出去，讓他們自己作證。'], [OP, '穿過東側商店。下一步，打掉通訊封鎖。']] },
  D0: { lines: [[OP, '工廠通往檢查哨側面。五個人；機台後面可以躲。'], [HQ, '零號，交還資料。你的救援資格已撤銷。']] },
  D1: { obj: '摧毀封鎖鏈路', fight: '摧毀三台通訊干擾器', lines: [[OP, '他們在切斷車隊的頻道。三台干擾器都打掉，才能對外求救。']], done: [[CIV, '收到你們的訊號了！'], [OP, '證據上傳到我的中繼站。離城前還要送出去。']] },
  D2: { done: [[OP, '貨櫃封住了近路。去北區醫院找隼。'], [OP, '他的金鑰能解除蒼焰的遠端停機令；少了它，指揮部隨時能讓你趴下。'], [ME, '他還活著？'], [OP, '最後的病歷在那裡。從北邊商場繞過去。']] },
  KEY: { lines: [[ME, '隼……他把金鑰留下了。'], [OP, '上面有離線授權。這一次，蒼焰只聽駕駛員的。']], done: [[ME, '我會把他們送出去。'], [OP, '往東穿過地下通道，再上高架回機庫。']] },
  G1: { lines: [[OP, '他們在拆蒼焰的控制系統！打掉兩台拖吊發電機。', true]], done: [[OP, '控制艙保住了。上西側走道，把配電箱接回去。']] },
  G4: { lines: [[HQ, '立即停止啟動。你將被列為叛軍。', true], [ME, '車上六十四個人也算叛軍嗎？'], [OP, '別回他。四十秒，我切掉他們的遠端權限。']], done: [[OP, '離線授權通過。最後一批重裝兵從東門來！', true]] },
  G2: { done: [[OP, '機庫安全。上維修架，插入隼留下的金鑰。'], [CIV, '我們在城東大道。零號……別遲到。']] },
};
export const ENCOUNTERS = Z.ENCOUNTERS.map(e => ({ ...e, ch: Math.min(e.ch, 3), ...rewrite[e.id] }));
export const LINES = {
  start: [[OP, '我們沒有援軍了。每清一區會留下檢查點，倒下可以重來。'], [CIV, '車隊等你。先找出真正的撤離路線。']],
  ch2: [[OP, '指揮部在追蹤這支無線電。幹掉檢查哨，恢復車隊通訊。']],
  ch3: [[OP, '從住宅街去醫院拿金鑰，再經高架道路回第七機庫。'], [ME, '拿回蒼焰。我們自己送他們離開。']],
  mech: [[EN, '機庫區機動巡邏開始。'], [OP, '獵犬走過外牆了，先躲在貨櫃後面。'], [OP, '它往北去了。繼續走。']],
  hatch: [[OP, '蒼焰識別到離線金鑰。靠近胸前艙門，按 E 上機。']],
};
const keys = [['W A S D', '移動／滑鼠瞄準'], ['左鍵／右鍵', '40 發步槍／鎖定飛彈'], ['F／E', '光劍／光波砲'], ['Shift／空白', '噴射／跳躍'], ['R／V', '換彈／切換視角'], ['Esc', '暫停／畫質設定']];
const touch = Z.MECH6.touch;
const wave = (title, go, list, lines, more = {}) => ({ title, sub: '守住車隊，清除敵軍', go: [...go, 90], cp: [go[0] - 22, go[1], Math.PI / 2], list, lines, obj: title, music: 4, repair: 0.18, ...more });
const mission = new URL('./mission.js', import.meta.url).href;
const common = { mission, keys, touch, flee: { path: [], lines: [] }, down: [[OP, '回到上一個安全路口。車隊狀態也會恢復，重新組織防線。']], clear: ['路口安全', '車隊繼續前進'], bossDown: [[OP, '敵方指揮機失去戰力！', true]] };
export const MECH_CONFIGS = {
  4: { ...common, chapter: 4, name: CHAPTERS[3].name, en: CHAPTERS[3].en, label: 'CHAPTER 4　最後一班撤離車',
    start: { x: 170, z: -120, yaw: Math.PI / 2, lines: [[CIV, '你真的來了。兩輛車都還能跑。'], [OP, '先清路口。敵軍沒清完，車隊會停車等待。離開超過一百公尺，車隊也會等你。']] },
    restart: { x: 170, z: -120, yaw: Math.PI / 2 }, goal: ['保護撤離車隊', '沿城東大道前進'],
    route: [[192, -120], [360, -120], [360, 120], [600, 120]], choiceAt: 1,
    waves: [
      wave('東城接應', [192, -120], [['grunt', 270, -120], ['grunt', 320, -80], ['heli', 290, -180, 55]], [[OP, '兩台機體，一架直升機。按住右鍵掃過目標，再鬆開發射飛彈。', true]]),
      wave('大道伏擊', [360, -120], [['heavy', 410, -100], ['grunt', 440, -180], ['tank', 480, -120]], [[EN, '車隊已確認。對醫療車開火。', true], [CIV, '前面轉角有重裝機！']]),
      wave('北上撤離', [360, 120], [['grunt', 400, 170], ['heli', 440, 220, 70], ['grunt', 300, 240]], [[OP, '沿大道往北走，別讓敵人穿過車隊。', true]]),
      wave('城東出口', [600, 120], [['heavy', 650, 180], ['grunt', 650, 60], ['heli', 590, 260, 60]], [[CIV, '出口就在前面，但撤離閘門還沒開。'], [OP, '守住最後這個路口。閘門的電源在城門另一側。']]),
    ], end: [[CIV, '兩輛車都到了。孩子們在數你的腳步聲。'], [OP, '獵犬主力往城門集結。我們得在這裡擋住他們。']], fin: ['還差最後一道防線', '下一章　失落防線'] },
  5: { ...common, chapter: 5, name: CHAPTERS[4].name, en: CHAPTERS[4].en, label: 'CHAPTER 5　失落防線',
    start: { x: 580, z: 120, yaw: Math.PI, lines: [[HQ, '零號，閘門不會為你開。交出蒼焰，我們可以停止追擊。'], [CIV, '救援站接到訊號了。他們正在啟動外側閘門。'], [OP, '不要交機體。帶著證據和人活著出去。']] },
    restart: { x: 580, z: 120, yaw: Math.PI }, goal: ['守住最後防線', '護送車隊通過撤離閘門'],
    route: [[600, 120], [600, -120], [600, -360]],
    waves: [
      wave('救援站防禦', [600, 120], [['heavy', 650, 200], ['grunt', 510, 180], ['heli', 580, 280, 65]], [[OP, '重裝機從北側來。利用建築擋砲線，近身用光劍。', true]], { music: 5 }),
      wave('最後廣播', [600, -120], [['grunt', 520, -180], ['heavy', 670, -220], ['heli', 590, -260, 70], ['grunt', 650, -40]], [[OP, '到這個路口，證據才能傳到城外。車隊到位就能繼續。'], [HQ, '切斷中繼。這份命令不准外流。', true]], { music: 5 }),
      wave('失落防線', [600, -360], [['ace', 600, -470], ['heavy', 680, -410], ['grunt', 500, -440]], [[EN, '王牌隊，封住城門。'], [ME, '從今天起，這裡不再是你們的靶場。', true]], { music: 6, boss: { ap: 1.5 }, repair: 0.25 }),
    ], end: [], fin: ['天亮之後，還有人記得', 'IRON DUSK · LAST LINE　全篇完'] },
};
export const MECH6 = MECH_CONFIGS[4];
