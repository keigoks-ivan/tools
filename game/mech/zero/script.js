// 劇情與遭遇戰：章節、無線電對白、觸發區、敵人配置、目標點
//   區域座標見 map.js；敵人 type：trooper / officer / heavy / sniper / drone
//   trigger(p)＝玩家進到這裡就開打；after＋wait＝前一段清完幾秒後自動開打；guide＝開打前的導引點 [x, z]
//   mark＋next＝這一章最後一段清完後的目標點和文字；pickup＝不是打仗，是走到 map.marks[at] 按 E 撿東西
//   CHAPTERS[n].end＝這一章的終點（after 那段清完、玩家走到 at 裡面就進下一章）
//   guide／mark 一定要放在觸發範圍裡面（照著指示走到就會觸發，不會差一步）
//   route＝走到 guide 之前依序經過的轉彎點 [x, z, 高度?]（畫面上的指示會一段一段帶路，不會直接指穿牆）；nextRoute＝清完後走到 mark 的轉彎點
//   obj＝走過去時左上角的字；fight＝開打後的字（下面會再加一行「還剩幾個敵人」）
//   每個敵人都要站在玩家看得到、打得到的地方（這段的敵人全倒才算清完，漏一個就卡關）
import * as THREE from 'three';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const OP = '白鷺（指揮所）', ME = '零號', EN = '獵犬軍團通訊', DOG = '黑犬（獵犬軍團）', HAYA = '隼（錄音）', NOISE = '通訊';
// 對白第三格寫 NOW＝戰鬥喊話：馬上插播，不排在前面的劇情對白後面（見 hud.say）
const NOW = true;

export const INTRO = [
  '首都防線崩潰的第三個夜晚。',
  '獵犬軍團的機動裝甲踏平了半座城，步兵正挨家挨戶搜捕倖存者。',
  '聯邦只剩最後一台機體——XG-01「蒼焰」，藏在第七機庫。',
  '能開它的人，死的死、傷的傷。只剩你。',
];

export const CHAPTERS = [
  { n: 1, name: '陷落', en: 'FALLEN CITY', start: 'start', yaw: 0, music: 1, end: { after: 'C', at: (p) => p.x > -58 && p.z > -48 && p.z < -36 } },
  { n: 2, name: '封鎖線', en: 'THE CHECKPOINT', start: 'ch2', yaw: Math.PI / 2 * -1 + Math.PI, music: 3, end: { after: 'D2', at: (p) => p.z > -30 && p.x > -14 && p.x < -6 } },
  { n: 3, name: '北區', en: 'NORTH DISTRICT', start: 'ch3', yaw: 0, music: 2, end: { after: 'I2', at: (p) => p.x > -35.8 && p.z > 20 && p.z < 40 } },
  { n: 4, name: '高架道路', en: 'THE OVERPASS', start: 'ch4', yaw: 0.4, music: 4, end: { after: 'E', at: (p) => p.z > 20.5 && p.x > 24 && p.x < 32 } },
  { n: 5, name: '第七機庫', en: 'HANGAR 7', start: 'ch5', yaw: 0, music: 5 },
  { n: 6, name: '蒼焰', en: 'IGNITION', mech: true },   // 開蒼焰（見 MECH6、mech6.js）
];
// 獵犬機走過圍牆外：第 4 章、J2 清完、走進貨櫃場時
export const MECH_WALK = { ch: 4, after: 'J2', at: (p) => p.x > 14 && p.z > -34 };

// 每段遭遇：id、屬於哪章、觸發條件、敵人、開打時的對白、清完後的目標
export const ENCOUNTERS = [
  // ---------------- 第 1 章
  {
    id: 'B', ch: 1, obj: '穿過後巷', fight: '解決巡邏兵', mark: V(-91.5, -62), guide: [-91.5, -80],
    trigger: (p) => p.z > -86 && p.x > -96 && p.x < -87,
    enemies: [
      { type: 'trooper', x: -92, z: -64, yaw: Math.PI, patrol: [[-92.5, -64], [-90, -75], [-91, -66]] },
      { type: 'trooper', x: -89.6, z: -61, yaw: Math.PI + 0.3 },
    ],
    lines: [[OP, '前面有兩個巡邏兵。長槍打頭一發就倒，打身體要兩發——右鍵瞄準。'], [OP, '蹲下（C）他們比較不容易發現你。']],
    done: [[OP, '乾淨俐落。穿過前面的市場廣場。']],
  },
  {
    id: 'C', ch: 1, obj: '清除市場廣場', fight: '清除市場廣場', mark: V(-52, -42), next: '穿過東邊的商店', guide: [-91.5, -56], nextRoute: [[-78, -40], [-71, -37], [-64, -37.5], [-61, -42]],
    trigger: (p) => p.z > -60 && p.x < -58,
    enemies: [
      { type: 'trooper', x: -84, z: -45, yaw: Math.PI },
      { type: 'trooper', x: -72, z: -50, yaw: Math.PI, patrol: [[-72, -50], [-78, -54], [-70, -40]] },
      { type: 'trooper', x: -67, z: -44, yaw: -Math.PI / 2 * 1 + Math.PI, post: true },
      { type: 'officer', x: -74, z: -36, yaw: Math.PI },
      { type: 'trooper', x: -88, z: -36, yaw: Math.PI * 0.8 },
      { type: 'drone', x: -76, z: -40, y: 6 },
    ],
    lines: [[EN, '……第三小隊，廣場清查完畢，沒有發現……'], [OP, '廣場上有一整班人，還有一台無人機。利用攤位當掩護。'], [OP, '他們擠在一起的時候，丟手榴彈（G）。']],
    done: [[OP, '廣場清空了。從東邊那間商店穿過去。'], [ME, '收到。']],
  },
  // ---------------- 第 2 章
  {
    id: 'D', ch: 2, obj: '突破街道檢查哨', fight: '突破檢查哨', guide: [-43, -42],
    trigger: (p) => p.x > -46 && p.z < -33,
    enemies: [
      { type: 'trooper', x: -28, z: -40, yaw: -Math.PI / 2 },
      { type: 'trooper', x: -18, z: -45, yaw: -Math.PI / 2, patrol: [[-18, -45], [-24, -36], [-12, -40]] },
      { type: 'officer', x: 5, z: -40, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 8, z: -46, yaw: -Math.PI / 2, post: true },
      { type: 'trooper', x: 12, z: -38, yaw: -Math.PI / 2 },
      { type: 'sniper', x: 33.5, z: -42.5, y: 2.62, yaw: -Math.PI / 2, post: true },
      { type: 'drone', x: -5, z: -41, y: 7 },
    ],
    lines: [[OP, '這條街是他們的檢查哨。街尾貨櫃上有狙擊手。', NOW], [OP, '看到紅色雷射線就是被他瞄準了——馬上躲。', NOW]],
    done: [[OP, '檢查哨解決了。貨櫃場入口在街尾，基地大門就在貨櫃場後面。']],
  },
  {
    id: 'D2', ch: 2, obj: '前往貨櫃場入口', fight: '擊退封鎖線的敵人', mark: V(-10, -27), next: '從北邊的商場繞過去', guide: [14, -40], nextRoute: [[8, -40.5], [0, -41], [-4, -38.5], [-10, -37.5]],
    trigger: (p) => p.x > 8 && p.z > -46,
    enemies: [
      { type: 'trooper', x: 20, z: -33.9, y: 5.2, yaw: Math.PI, post: true },
      { type: 'trooper', x: 31, z: -33.9, y: 5.2, yaw: Math.PI, post: true },
      { type: 'officer', x: 22, z: -41, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 16, z: -38, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 27, z: -44, yaw: -Math.PI / 2, patrol: [[27, -44], [20, -45], [30, -40]] },
      { type: 'drone', x: 18, z: -40, y: 7 },
    ],
    lines: [[EN, '有人突破檢查哨！封鎖線上面的，開火！', NOW], [OP, '貨櫃牆上面有人——找掩護！', NOW]],
    done: [[OP, '……入口被貨櫃牆堵死了，過不去。'], [OP, '零號，有件事我一直沒說。'], [OP, '蒼焰的啟動金鑰不在機庫，在隼身上——它原本的駕駛員。'],
      [OP, '他昨天重傷，被送到北區的市立醫院。沒有金鑰，你進了駕駛艙也發動不了。'], [ME, '……醫院怎麼走？'], [OP, '從北邊那間商場穿過去。醫院在住宅街的街底。']],
  },
  // ---------------- 第 3 章：北區（找隼、拿金鑰）
  {
    id: 'H1', ch: 3, obj: '沿著住宅街往西走', fight: '清除住宅街', route: [[-10, -27], [-11.3, -21], [-11.3, -16], [-10, -11]], guide: [-10, -6],
    trigger: (p) => p.z > -8.5 && p.x > -16 && p.x < -2,
    enemies: [
      { type: 'trooper', x: -19, z: -5.5, yaw: Math.PI / 2 },
      { type: 'trooper', x: -25, z: -2, yaw: Math.PI / 2 },
      { type: 'trooper', x: -23, z: 5.3, y: 3.6, yaw: Math.PI, post: true },
      { type: 'trooper', x: -31, z: 3, yaw: Math.PI / 2, patrol: [[-31, 3], [-24, -4], [-35, -2]] },
      { type: 'officer', x: -40, z: -1, yaw: Math.PI / 2 },
      { type: 'trooper', x: -46, z: 3, yaw: Math.PI / 2 },
      { type: 'drone', x: -28, z: -2, y: 7 },
    ],
    lines: [[EN, '……這一排搜完了，下一棟。', NOW], [OP, '街上有一整隊人在挨家搜。二樓陽台上還有一個。', NOW]],
    done: [[OP, '街道清了。醫院在西邊街底，門口有紅十字那棟。']],
  },
  {
    id: 'H2', ch: 3, obj: '進入醫院', fight: '清除醫院大廳', route: [[-30, -3], [-47, -1]], guide: [-52, 3],
    trigger: (p) => p.x < -46 && p.z > 1.5,
    enemies: [
      { type: 'trooper', x: -50.5, z: 16.4, yaw: Math.PI, post: true },
      { type: 'trooper', x: -56, z: 10, yaw: Math.PI },
      { type: 'officer', x: -47.5, z: 13.4, yaw: Math.PI },
      { type: 'trooper', x: -57.5, z: 15, yaw: Math.PI * 0.8 },
    ],
    lines: [[EN, '醫院大廳，有動靜！', NOW], [OP, '他們把大廳當成據點了。', NOW]],
    done: [[OP, '病房區在大廳北邊。隼應該在裡面。']],
  },
  {
    id: 'I1', ch: 3, obj: '找到隼的病床', fight: '清除病房區', route: [[-52, 8], [-49, 13]], guide: [-48, 20.5],
    trigger: (p) => p.z > 18.6 && p.x < -36,
    enemies: [
      { type: 'trooper', x: -44, z: 27, yaw: Math.PI },
      { type: 'trooper', x: -52, z: 30, yaw: Math.PI },
      { type: 'officer', x: -40, z: 24, yaw: Math.PI },
      { type: 'trooper', x: -57.5, z: 24, yaw: Math.PI / 2 },
      { type: 'trooper', x: -38.5, z: 29.5, yaw: -Math.PI / 2, post: true },
    ],
    lines: [[EN, '病房區有人闖進來！', NOW], [OP, '走廊很窄，手槍比較好用（按 2）。', NOW]],
    done: [[OP, '……隼在最東邊那張床。']],
  },
  {
    id: 'KEY', ch: 3, obj: '拿起床邊的啟動金鑰', route: [[-47, 21], [-42, 23.5], [-41.8, 28.5]], guide: [-38.5, 31], pickup: { at: 'key', text: '按 E　拿起啟動金鑰' },
    trigger: () => true,
    enemies: [],
    lines: [[ME, '……床是空的。'], [OP, '……床邊桌上，有沒有一張金屬卡？']],
    done: [[HAYA, '……如果你聽到這段，代表我沒撐過去。'], [HAYA, '你就是零號吧。白鷺說過你，修機體比開機體在行。'], [HAYA, '沒關係。蒼焰比你想的還聽話。'],
      [HAYA, '金鑰插在右手邊，轉到底。然後……別回頭。'], [ME, '……謝了，隼。']],
  },
  {
    id: 'I2', ch: 3, obj: '擊退追兵', fight: '擊退追兵', mark: V(-33, 28), next: '從病房東門出去，到後院', guide: [-48, 20], nextRoute: [[-42, 22.5], [-41.8, 28], [-37.5, 28]],
    after: 'KEY', wait: 17,
    enemies: [
      { type: 'trooper', x: -48, z: 12, yaw: 0, alert: true },
      { type: 'trooper', x: -51, z: 9, yaw: 0, alert: true },
      { type: 'heavy', x: -46, z: 15, yaw: 0, alert: true },
      { type: 'officer', x: -54, z: 11, yaw: 0, alert: true },
      { type: 'trooper', x: -57, z: 8, yaw: 0, alert: true },
    ],
    lines: [[EN, '金鑰的定位訊號在病房區！全員過去！', NOW], [OP, '零號，他們聽到了——從大廳過來了！', NOW]],
    done: [[OP, '清掉了。從病房東門出去，後院有逃生梯通到高架道路。']],
  },
  // ---------------- 第 4 章：高架道路（指揮所失聯）
  {
    id: 'J1', ch: 4, obj: '爬上高架道路', fight: '清除高架道路', route: [[-30.75, 30]], guide: [-30.75, 41, 6],
    trigger: (p) => p.y > 4 && p.z > 39,
    enemies: [
      { type: 'trooper', x: -15.3, z: 47.8, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: -9, z: 42.2, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: -3, z: 48.7, y: 6, yaw: -Math.PI / 2, patrol: [[-3, 48.7], [-10, 45], [2, 44]] },
      { type: 'heavy', x: -6, z: 44.6, y: 6, yaw: -Math.PI / 2 },
      { type: 'officer', x: 1, z: 45.5, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 4, z: 48.5, y: 6, yaw: -Math.PI / 2 },
      { type: 'sniper', x: -24, z: 50.7, y: 16, yaw: Math.PI, post: true },   // 站在女兒牆邊：橋面、後院都看得到（原本在樓頂往內 5 m，被屋頂邊緣擋住，打不到，這段永遠清不完）
      { type: 'drone', x: -16, z: 45, y: 12 },
      { type: 'drone', x: -4, z: 43, y: 11 },
    ],
    lines: [[DOG, '（公開頻道）聯邦的殘兵，聽好。你們的指揮所已經淪陷。'], [DOG, '交出蒼焰的駕駛員，其他人可以活命。'], [ME, '……北邊樓頂有紅光，狙擊手。', NOW]],
    done: [[ME, '……匝道下去，就是基地西側。']],
  },
  {
    // 橋面的路：樓梯口往北繞過第一台燒毀的車 → 從車和貨櫃中間的縫往南 → 沿南側護欄往東 → 繞過木箱北邊 → 匝道正中間往下
    //（北側車道也走得通：沿北側護欄過第二台車，再從車和貨櫃中間往南）；開頭多一個樓梯下的點：人在後院時先帶回樓梯
    id: 'J2', ch: 4, obj: '走匝道下去', fight: '清除匝道下的敵人', mark: V(10, 16.5), next: '穿過倉庫，進貨櫃場',
    route: [[-30.75, 30], [-30.75, 41, 6], [-27, 46.1, 6], [-21.35, 46.2, 6], [-21.3, 43.2, 6], [-19.5, 41.3, 6], [-4.4, 41.3, 6], [-2.9, 42.7, 6], [-1.95, 41.2, 6], [1, 38, 5.1]], guide: [2, 25], nextRoute: [[2, 18], [6, 16.5]],
    trigger: (p) => p.z < 27 && p.x > -2.5 && p.y < 2.5,
    enemies: [
      { type: 'trooper', x: 1, z: 16, yaw: 0, alert: true },
      { type: 'trooper', x: 4.5, z: 20.5, yaw: 0, alert: true },
      { type: 'officer', x: -0.8, z: 15.2, yaw: 0, alert: true },
      { type: 'trooper', x: 10, z: 16.5, yaw: -Math.PI / 2, alert: true },
      { type: 'heavy', x: 12, z: 17.5, yaw: -Math.PI / 2, alert: true },
    ],
    lines: [[EN, '西側匝道，目標出現！', NOW]],
    done: [[OP, '……零號？零號，聽得到嗎？'], [ME, '白鷺！'], [OP, '指揮所沒了。我換到機庫的備用線路……受了點傷，死不了。'], [OP, '金鑰拿到了？'], [ME, '拿到了。隼他……'],
      [OP, '……我知道。走吧，穿過倉庫就是貨櫃場。']],
  },
  {
    id: 'E', ch: 4, obj: '穿過倉庫，進貨櫃場', fight: '清除貨櫃場', mark: V(28, 23), next: '進入基地大門', route: [[4, 16.5], [10, 16.5]], guide: [16, 16.5], nextRoute: [[21, 18.5], [28, 18.5]],
    trigger: (p) => p.z > -24 && p.x > 13,
    enemies: [
      { type: 'trooper', x: 24, z: -10, yaw: Math.PI },
      { type: 'trooper', x: 36, z: -12, yaw: Math.PI, patrol: [[36, -12], [36, 0], [44, -8]] },
      { type: 'heavy', x: 30, z: 4, yaw: Math.PI },
      { type: 'trooper', x: 18, z: 12, yaw: Math.PI },
      { type: 'trooper', x: 42, z: 10, yaw: Math.PI },
      { type: 'officer', x: 28, z: 16, yaw: Math.PI },
      { type: 'drone', x: 30, z: -4, y: 7 },
      { type: 'drone', x: 20, z: 6, y: 6 },
    ],
    lines: [[OP, '有重裝兵，他的護甲很厚——瞄準頭。', NOW], [EN, '入侵者在貨櫃區！全員就位！', NOW]],
    done: [[OP, '大門就在前面。進了門就是第七機庫的地面設施。']],
  },
  // ---------------- 第 5 章：第七機庫
  {
    id: 'F', ch: 5, fight: '清除地面設施', route: [[28, 19]], guide: [28, 28.5], obj: '穿過地面設施', mark: V(32, 53.5),
    trigger: (p) => p.z > 26,
    enemies: [
      { type: 'trooper', x: 23, z: 33, yaw: Math.PI },
      { type: 'trooper', x: 40, z: 33.5, yaw: Math.PI },
      { type: 'officer', x: 39, z: 44, yaw: -Math.PI / 2 * -1 },
      { type: 'trooper', x: 25, z: 40, yaw: Math.PI / 2 },
      { type: 'heavy', x: 32, z: 49, yaw: Math.PI },
      { type: 'trooper', x: 24, z: 48, yaw: Math.PI / 2 },
    ],
    lines: [[OP, '他們已經攻進設施了。走廊很窄——手槍比較好用（按 2）。', NOW]],
    done: [[OP, '機庫門就在走廊盡頭。']],
  },
  {
    id: 'G1', ch: 5, fight: '清除機庫裡的敵人', route: [[28, 29], [28, 33], [32, 37], [32, 47]], guide: [32, 56], obj: '奪回第七機庫', mark: null,
    trigger: (p) => p.z > 53.5,
    alarm: true,
    enemies: [
      { type: 'trooper', x: 26, z: 70, yaw: Math.PI },
      { type: 'trooper', x: 40, z: 72, yaw: Math.PI },
      { type: 'trooper', x: 54, z: 76, yaw: Math.PI },
      { type: 'officer', x: 40, z: 84, yaw: Math.PI },
      { type: 'trooper', x: 22, z: 86, yaw: Math.PI },
      { type: 'sniper', x: 11.5, z: 96, y: 7, yaw: Math.PI * 0.75, post: true },
      { type: 'drone', x: 30, z: 80, y: 9 },
      { type: 'drone', x: 50, z: 80, y: 10 },
    ],
    lines: [[OP, '那就是蒼焰……他們想把它拖走！', NOW], [OP, '把機庫裡的敵人清乾淨，然後上維修架。', NOW]],
    done: [[EN, '所有單位，第七機庫，東門突入！', NOW], [OP, '東邊大門還有增援——撐住！', NOW]],
  },
  {
    id: 'G2', ch: 5, guide: [40, 70], obj: '擊退增援', fight: '擊退東門的增援', mark: null,
    after: 'G1',
    enemies: [
      { type: 'heavy', x: 80, z: 64, yaw: -Math.PI / 2, alert: true },
      { type: 'heavy', x: 82, z: 72, yaw: -Math.PI / 2, alert: true },
      { type: 'officer', x: 86, z: 68, yaw: -Math.PI / 2, alert: true },
      { type: 'trooper', x: 78, z: 60, yaw: -Math.PI / 2, alert: true },
      { type: 'trooper', x: 78, z: 76, yaw: -Math.PI / 2, alert: true },
      { type: 'trooper', x: 90, z: 70, yaw: -Math.PI / 2, alert: true },
    ],
    lines: [],
    done: [[OP, '做得好，零號……機庫是你的了。'], [OP, '爬上維修架——駕駛艙在胸口。插上金鑰，蒼焰就是你的。']],
  },
];

// 最後一段：從機庫地面爬到胸口平台（兩段樓梯＋走道），終點是駕駛艙前面
export const HATCH_ROUTE = [[14, 68], [14.1, 55.2, 7], [11.3, 54.6, 7], [11.4, 94.6, 7], [14.1, 97, 7.2], [14.1, 107.5, 12.4], [14.2, 110.4, 12.4], [20, 110.5, 12.4], [31.5, 110.5, 12.4], [31.5, 98.3, 12.4], [38, 98.3, 12.4]];

// ---------------- 第 6 章：開蒼焰（mech6.js）
// 前半在基地裡打四波；第四波的黑犬打到剩四成就飛過東牆逃進市區，後半在市區追他（再四波，最後一波跟他單挑）
// waves：一波打完才來下一波；list 每一項 [種類, x, z, 高度]（沒給位置＝本篇的預設出場：前方 240～400 m 外空降）
//   機體從指定點上方 150 m 空降（高度＝落地的地面／樓頂高）；直升機從指定點、指定高度飛進來；戰機一律從遠方掠過
//   戰車只在市區出場：吸到最近的道路上，朝這一波的 go 開過去（基地周圍那九個路口不走，見 mech6.js 的 BLOCK）
//   外圍高樓的樓頂：東 x 114～128 高 28、南 z -128～-114 高 34、北 z 114～128 高 30
// 市區那幾波多了這些欄位：
//   go＝[x, z, 半徑]：上一波打完先出現目標點，玩家走進這個圈才開打；obj＝目標點旁邊的字；hint＝還在基地裡時多一行提示
//   clear＝上一波打完時的大字；talk＝目標點出現時的對白；cp＝[x, z, 朝向]：這一波大破時從這裡重來（要在 go 的圈裡）
//   repair＝目標點出現時補多少 AP（整章只有一條 AP，大破重來才會補滿）
//   boss＝這一波的 ace 是黑犬：ap＝耐久倍率；flee＝打到剩幾成就撤退（撤退中打不到、鎖不到，飛遠了就消失）
// 市區的街道（本篇城市，道路每 120 m 一條）：東牆外 x 138～222、z -102～-18 是空地；再往東南 x 254～346、z -226～-134 也是空地；
//   x 360～480、z -240～-120 和 z -360～-240 是兩座公園
export const MECH6 = {
  name: '蒼焰', en: 'IGNITION', label: 'CHAPTER 6　蒼焰',
  start: { x: 36, z: 68, yaw: Math.PI / 2, lines: [[OP, '……蒼焰，系統全綠。零號，聽得到嗎？'], [ME, '聽得到。……它真的在動。'], [OP, '東邊大門外面，獵犬軍團正在集結。'], [OP, '你不用再躲了。出去，把他們趕出基地。']] },
  restart: { x: 82, z: 66, yaw: Math.PI / 2 },
  goal: ['走出機庫', '東邊大門　LEAVE THE HANGAR'],
  waves: [
    { title: '獵犬先遣隊', sub: '敵機 ×3　直升機 ×3', music: 4, lines: [[EN, '機庫東門有動靜……那是聯邦的試驗機！', NOW], [DOG, '慌什麼。獵犬隊，把它圍起來。']],
      list: [['grunt', 96, 28], ['grunt', 100, -40], ['grunt', 121, 10, 28], ['heli', 105, -90, 45], ['heli', 30, -70, 45], ['heli', 90, 100, 55]] },
    { title: '空中增援', sub: '敵機 ×3　直升機 ×2　戰機 ×2', music: 5, lines: [[DOG, '一台而已。直升機、戰機，一起上。', NOW], [OP, '天上也有。右鍵按住掃過去，一次鎖好幾台。']],
      list: [['grunt', 121, -70, 28], ['grunt', 80, -5], ['grunt', 70, -100], ['heli', 110, 60, 50], ['heli', 40, -100, 45], ['jet'], ['jet']] },
    { title: '重裝部隊', sub: '重裝機 ×1　敵機 ×3　直升機 ×2', music: 5, lines: [[EN, '重裝機到位，從南邊樓頂壓制！', NOW], [OP, '重裝機很硬。貼近，用光劍（F）。']],
      list: [['heavy', 60, -121, 34], ['grunt', 96, 50], ['grunt', 86, -62], ['grunt', 121, 50, 28], ['heli', 70, -105, 45], ['heli', 115, 95, 60]] },
    { title: '黑犬', sub: 'BLACK DOG　王牌機', music: 6, boss: { ap: 1.8, flee: 0.4 }, lines: [[DOG, '……夠了。我親自來。', NOW], [DOG, '零號，是吧。隼把金鑰交給了一個修理工。'], [ME, '他交給了我。這就夠了。']],
      list: [['ace', 92, 10], ['grunt', 121, 60, 28], ['grunt', 121, -60, 28], ['heli', 60, -100, 45], ['heli', 110, 90, 55]] },
    // ---- 市區：飛過東牆 → 牆外的空地（戰車隊）→ 東南的空地（空襲）→ 東邊的公園（伏擊）→ 南邊的公園（黑犬）
    { go: [175, -55, 55], cp: [168, -52, Math.PI / 2], repair: 0.6, obj: '追擊黑犬', hint: '按住空白鍵往上飛，越過東側外牆',
      clear: ['基地奪回', 'HANGAR 7 SECURED'],
      talk: [[OP, '基地清空了。零號，黑犬往東邊逃了。'], [OP, '城裡還有他的部隊，放他回去就會再來。'], [ME, '我去追。'], [OP, '東牆二十八公尺。按住空白鍵，飛過去。']],
      title: '裝甲車隊', sub: '戰車 ×6　敵機 ×2　直升機 ×1', music: 5,
      lines: [[EN, '聯邦機越過外牆了！戰車隊，攔住它！', NOW], [OP, '大道上一整排戰車。別站在路中間。', NOW]],
      list: [['tank', 310, 0], ['tank', 345, 0], ['tank', 380, 0], ['tank', 415, 0], ['tank', 240, -190], ['tank', 240, -225],
        ['grunt', 200, 60, 40], ['grunt', 161, -158, 61], ['heli', 330, -150, 60]] },
    { go: [300, -180, 48], cp: [274, -154, Math.PI * 0.75], repair: 0.35, obj: '追擊黑犬',
      clear: ['車隊擊破', 'ARMOR COLUMN DOWN'],
      talk: [[OP, '車隊解決了。黑犬的訊號往東南走。'], [OP, '前面是一大片空地，小心頭頂。']],
      title: '空襲', sub: '直升機 ×4　戰機 ×3　敵機 ×2', music: 5,
      lines: [[EN, '目標進入空地。空中部隊，開火！', NOW], [OP, '直升機先打，戰機繞回來再打。', NOW]],
      list: [['heli', 480, -60, 70], ['heli', 480, -300, 65], ['heli', 180, -300, 72], ['heli', 300, -360, 75], ['jet'], ['jet'], ['jet'],
        ['grunt', 398, -41, 47], ['grunt', 240, -255, 0]] },
    { go: [415, -175, 48], cp: [380, -176, Math.PI / 2], repair: 0.35, obj: '前往東邊的公園',
      clear: ['制空權奪回', 'AIRSPACE CLEAR'],
      talk: [[OP, '天上清乾淨了。訊號停在東邊的公園。'], [ME, '他停下來了？'], [OP, '……不太對勁。靠近的時候小心。']],
      title: '伏擊', sub: '敵機 ×3　重裝機 ×1　戰車 ×2　直升機 ×1', music: 6,
      lines: [[EN, '目標進了公園。各機，現在出來！', NOW], [OP, '是埋伏！四面都有敵機！', NOW]],
      list: [['grunt', 360, -210, 0], ['grunt', 470, -150, 0], ['grunt', 430, -238, 0], ['heavy', 515, -180, 33],
        ['tank', 480, -290], ['tank', 560, -240], ['heli', 300, -250, 60]] },
    { go: [420, -290, 42], cp: [420, -258, Math.PI], repair: 0.5, obj: '與黑犬決戰',
      clear: ['伏兵擊退', 'AMBUSH REPELLED'],
      talk: [[DOG, '（公開頻道）零號，到南邊的公園來。'], [DOG, '這筆帳，就在那裡算清楚。'], [OP, '他在等你。……機體撐得住嗎？'], [ME, '撐得住。']],
      title: '黑犬', sub: 'BLACK DOG　最後一戰', music: 6, boss: { ap: 2.6 },
      lines: [[DOG, '隼的機體、隼的金鑰。你憑什麼坐在裡面？', NOW], [ME, '隼說過，它比我想的還聽話。'], [DOG, '……那就讓我看看。']],
      list: [['ace', 420, -335, 0], ['grunt', 362, -330, 0], ['grunt', 478, -330, 0]] },
  ],
  // 黑犬撤退（第四波打到剩四成）：路線＝[x, z, 離地高度]，飛過東牆、往東南的公園去
  flee: { path: [[180, -45, 62], [430, -310, 58]], lines: [[DOG, '……嘖。零號，這筆帳到城裡再算。', NOW], [EN, '隊長撤退了！掩護隊長！', NOW]] },
  bossDown: [[EN, '黑犬隊長彈射脫離了！全員撤退！'], [DOG, '……零號，我記住你了。']],
  clear: ['黑犬擊退', 'BLACK DOG REPELLED'],
  end: [[OP, '……他們撤了。零號，第七機庫守住了。'], [ME, '白鷺，你的傷……'], [OP, '死不了。倒是你——'], [OP, '從今天起，你就是蒼焰的駕駛員。']],
  fin: ['鋼鐵黃昏　零　完', '接續本篇《鋼鐵黃昏》'],
  down: [[OP, '零號！……備用系統接上了，從這一波再來一次。']],   // 大破後重來時講
  keys: [['左鍵', '光束步槍'], ['右鍵按住', '掃過敵人上鎖，放開射飛彈'], ['F', '光劍'], ['E', '光波砲'], ['Q', '覺醒（量表滿了才能用）'], ['Tab', '換鎖定目標'],
    ['Shift', '點一下閃避，按住衝刺'], ['空白鍵', '跳，按住往上飛'], ['R', '換彈匣'], ['V', '換視角（背後／駕駛艙）'], ['滾輪', '鏡頭遠近']],
  touch: [['tMsl', '飛彈'], ['tSaber', '光劍'], ['tCannon', '光波砲'], ['tOd', '覺醒'], ['tLock', '換目標']],
};

export const LINES = {
  start: [[OP, '零號，聽得到嗎？這裡是白鷺。'], [OP, '首都防線昨晚全垮了。獵犬軍團在城裡到處搜人。'], [OP, '第七機庫還在我們手上，蒼焰在那裡。沿著這條後巷往北走。']],
  ch2: [[OP, '零號，前面就是他們的封鎖線。'], [OP, '你只有一把長槍一把手槍，別跟他們硬拚。']],
  ch3: [[OP, '這裡是北區住宅，昨晚被炸得最慘。'], [EN, '……各小隊注意，目標是聯邦試驗機的駕駛員，人在北區。'], [EN, '找到他。上面要活的。'], [OP, '……他們也在找隼。快，零號。']],
  ch4: [[OP, '逃生梯上去就是高架道路，一路通到基地西側。'], [OP, '上面很空曠，他們看得到你，你也看得到——'], [OP, '……等等，指揮所外面有——'], [NOISE, '（雜訊）……訊號中斷……'], [ME, '白鷺？……白鷺！']],
  ch5: [[OP, '大門後面就是第七機庫。'], [OP, '他們已經打進去了……快，零號。'], [OP, '金鑰收好。那是隼交給你的。']],
  mech: [[OP, '……停下。別動。', NOW], [OP, '圍牆外面，那是獵犬機。它的感測器掃過來了。', NOW], [OP, '……它往北走了。繼續前進。', NOW]],
  hatch: [[OP, '駕駛艙開了。金鑰插右手邊，轉到底——進去吧，零號。']],
};
