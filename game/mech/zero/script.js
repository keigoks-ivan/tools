// 劇情與遭遇戰：章節、無線電對白、觸發區、敵人配置、目標點
//   區域座標見 map.js；敵人 type：trooper / officer / heavy / sniper / drone
//   trigger(p)＝玩家進到這裡就開打；after＋wait＝前一段清完幾秒後自動開打；guide＝開打前的導引點 [x, z]
//   mark＋next＝這一章最後一段清完後的目標點和文字；pickup＝不是打仗，是走到 map.marks[at] 按 E 撿東西
//   CHAPTERS[n].end＝這一章的終點（after 那段清完、玩家走到 at 裡面就進下一章）
//   guide／mark 一定要放在觸發範圍裡面（照著指示走到就會觸發，不會差一步）
//   route＝走到 guide 之前依序經過的轉彎點 [x, z, 高度?]（畫面上的指示會一段一段帶路，不會直接指穿牆）；nextRoute＝清完後走到 mark 的轉彎點
import * as THREE from 'three';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const OP = '白鷺（指揮所）', ME = '零號', EN = '獵犬軍團通訊', DOG = '黑犬（獵犬軍團）', HAYA = '隼（錄音）', NOISE = '通訊';

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
];
// 獵犬機走過圍牆外：第 4 章、J2 清完、走進貨櫃場時
export const MECH_WALK = { ch: 4, after: 'J2', at: (p) => p.x > 14 && p.z > -34 };

// 每段遭遇：id、屬於哪章、觸發條件、敵人、開打時的對白、清完後的目標
export const ENCOUNTERS = [
  // ---------------- 第 1 章
  {
    id: 'B', ch: 1, obj: '穿過後巷', mark: V(-91.5, -62), guide: [-91.5, -80],
    trigger: (p) => p.z > -86 && p.x > -96 && p.x < -87,
    enemies: [
      { type: 'trooper', x: -92, z: -64, yaw: Math.PI, patrol: [[-92.5, -64], [-90, -75], [-91, -66]] },
      { type: 'trooper', x: -89.6, z: -61, yaw: Math.PI + 0.3 },
    ],
    lines: [[OP, '前面有兩個巡邏兵。長槍打身體一發就倒——右鍵瞄準。'], [OP, '蹲下（C）他們比較不容易發現你。']],
    done: [[OP, '乾淨俐落。穿過前面的市場廣場。']],
  },
  {
    id: 'C', ch: 1, obj: '清除市場廣場', mark: V(-52, -42), next: '穿過東邊的商店', guide: [-91.5, -56], nextRoute: [[-78, -40], [-71, -37], [-64, -37.5], [-61, -42]],
    trigger: (p) => p.z > -60 && p.x < -58,
    enemies: [
      { type: 'trooper', x: -84, z: -45, yaw: Math.PI },
      { type: 'trooper', x: -72, z: -50, yaw: Math.PI, patrol: [[-72, -50], [-78, -54], [-70, -40]] },
      { type: 'trooper', x: -67, z: -44, yaw: -Math.PI / 2 * 1 + Math.PI, post: true },
      { type: 'officer', x: -74, z: -36, yaw: Math.PI },
      { type: 'trooper', x: -88, z: -36, yaw: Math.PI * 0.8 },
      { type: 'drone', x: -76, z: -40, y: 6 },
    ],
    lines: [[EN, '……第三小隊，廣場清查完畢，沒有發現……'], [OP, '廣場上有一整班人，還有一台無人機。利用攤位當掩護。']],
    done: [[OP, '廣場清空了。從東邊那間商店穿過去。'], [ME, '收到。']],
  },
  // ---------------- 第 2 章
  {
    id: 'D', ch: 2, obj: '突破街道檢查哨', guide: [-43, -42],
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
    lines: [[OP, '這條街是他們的檢查哨。街尾貨櫃上有狙擊手。'], [OP, '看到紅色雷射線就是被他瞄準了——馬上躲。']],
    done: [[OP, '檢查哨解決了。貨櫃場入口在街尾，基地大門就在貨櫃場後面。']],
  },
  {
    id: 'D2', ch: 2, obj: '前往貨櫃場入口', mark: V(-10, -27), next: '從北邊的商場繞過去', guide: [14, -40], nextRoute: [[8, -40.5], [0, -41], [-4, -38.5], [-10, -37.5]],
    trigger: (p) => p.x > 8 && p.z > -46,
    enemies: [
      { type: 'trooper', x: 20, z: -33.9, y: 5.2, yaw: Math.PI, post: true },
      { type: 'trooper', x: 31, z: -33.9, y: 5.2, yaw: Math.PI, post: true },
      { type: 'officer', x: 22, z: -41, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 16, z: -38, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 27, z: -44, yaw: -Math.PI / 2, patrol: [[27, -44], [20, -45], [30, -40]] },
      { type: 'drone', x: 18, z: -40, y: 7 },
    ],
    lines: [[EN, '有人突破檢查哨！封鎖線上面的，開火！'], [OP, '貨櫃牆上面有人——找掩護！']],
    done: [[OP, '……入口被貨櫃牆堵死了，過不去。'], [OP, '零號，有件事我一直沒說。'], [OP, '蒼焰的啟動金鑰不在機庫，在隼身上——它原本的駕駛員。'],
      [OP, '他昨天重傷，被送到北區的市立醫院。沒有金鑰，你進了駕駛艙也發動不了。'], [ME, '……醫院怎麼走？'], [OP, '從北邊那間商場穿過去。醫院在住宅街的街底。']],
  },
  // ---------------- 第 3 章：北區（找隼、拿金鑰）
  {
    id: 'H1', ch: 3, obj: '沿著住宅街往西走', route: [[-10, -27], [-11.3, -21], [-11.3, -16], [-10, -11]], guide: [-10, -6],
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
    lines: [[EN, '……這一排搜完了，下一棟。'], [OP, '街上有一整隊人在挨家搜。二樓陽台上還有一個。']],
    done: [[OP, '街道清了。醫院在西邊街底，門口有紅十字那棟。']],
  },
  {
    id: 'H2', ch: 3, obj: '進入醫院', route: [[-30, -3], [-47, -1]], guide: [-52, 3],
    trigger: (p) => p.x < -46 && p.z > 1.5,
    enemies: [
      { type: 'trooper', x: -50.5, z: 16.4, yaw: Math.PI, post: true },
      { type: 'trooper', x: -56, z: 10, yaw: Math.PI },
      { type: 'officer', x: -47.5, z: 13.4, yaw: Math.PI },
      { type: 'trooper', x: -57.5, z: 15, yaw: Math.PI * 0.8 },
    ],
    lines: [[EN, '醫院大廳，有動靜！'], [OP, '他們把大廳當成據點了。']],
    done: [[OP, '病房區在大廳北邊。隼應該在裡面。']],
  },
  {
    id: 'I1', ch: 3, obj: '找到隼的病床', route: [[-52, 8], [-49, 13]], guide: [-48, 20.5],
    trigger: (p) => p.z > 18.6 && p.x < -36,
    enemies: [
      { type: 'trooper', x: -44, z: 27, yaw: Math.PI },
      { type: 'trooper', x: -52, z: 30, yaw: Math.PI },
      { type: 'officer', x: -40, z: 24, yaw: Math.PI },
      { type: 'trooper', x: -57.5, z: 24, yaw: Math.PI / 2 },
      { type: 'trooper', x: -38.5, z: 29.5, yaw: -Math.PI / 2, post: true },
    ],
    lines: [[EN, '病房區有人闖進來！'], [OP, '走廊很窄，手槍比較好用（按 2）。']],
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
    id: 'I2', ch: 3, obj: '擊退追兵', mark: V(-33, 28), next: '從病房東門出去，到後院', guide: [-48, 20], nextRoute: [[-42, 22.5], [-41.8, 28], [-37.5, 28]],
    after: 'KEY', wait: 17,
    enemies: [
      { type: 'trooper', x: -48, z: 12, yaw: 0, alert: true },
      { type: 'trooper', x: -51, z: 9, yaw: 0, alert: true },
      { type: 'heavy', x: -46, z: 15, yaw: 0, alert: true },
      { type: 'officer', x: -54, z: 11, yaw: 0, alert: true },
      { type: 'trooper', x: -57, z: 8, yaw: 0, alert: true },
    ],
    lines: [[EN, '金鑰的定位訊號在病房區！全員過去！'], [OP, '零號，他們聽到了——從大廳過來了！']],
    done: [[OP, '清掉了。從病房東門出去，後院有逃生梯通到高架道路。']],
  },
  // ---------------- 第 4 章：高架道路（指揮所失聯）
  {
    id: 'J1', ch: 4, obj: '爬上高架道路', route: [[-30.75, 30]], guide: [-30.75, 41, 6],
    trigger: (p) => p.y > 4 && p.z > 39,
    enemies: [
      { type: 'trooper', x: -14, z: 47.5, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: -9, z: 42.2, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: -3, z: 48, y: 6, yaw: -Math.PI / 2, patrol: [[-3, 48], [-10, 45], [2, 44]] },
      { type: 'heavy', x: -6, z: 44.6, y: 6, yaw: -Math.PI / 2 },
      { type: 'officer', x: 1, z: 45.5, y: 6, yaw: -Math.PI / 2 },
      { type: 'trooper', x: 4, z: 48.5, y: 6, yaw: -Math.PI / 2 },
      { type: 'sniper', x: -24, z: 55, y: 16, yaw: Math.PI, post: true },
      { type: 'drone', x: -16, z: 45, y: 12 },
      { type: 'drone', x: -4, z: 43, y: 11 },
    ],
    lines: [[DOG, '（公開頻道）聯邦的殘兵，聽好。你們的指揮所已經淪陷。'], [DOG, '交出蒼焰的駕駛員，其他人可以活命。'], [ME, '……北邊樓頂有紅光，狙擊手。']],
    done: [[ME, '……匝道下去，就是基地西側。']],
  },
  {
    id: 'J2', ch: 4, obj: '走匝道下去', mark: V(10, 16.5), next: '穿過倉庫，進貨櫃場', route: [[-27, 47.5, 6], [-20, 48.5, 6], [-9, 45, 6], [-2, 45, 6], [2, 39, 6]], guide: [2, 25], nextRoute: [[2, 18], [6, 16.5]],
    trigger: (p) => p.z < 27 && p.x > -2.5 && p.y < 2.5,
    enemies: [
      { type: 'trooper', x: 1, z: 16, yaw: 0, alert: true },
      { type: 'trooper', x: 4.5, z: 20.5, yaw: 0, alert: true },
      { type: 'officer', x: -0.8, z: 15.2, yaw: 0, alert: true },
      { type: 'trooper', x: 10, z: 16.5, yaw: -Math.PI / 2, alert: true },
      { type: 'heavy', x: 12, z: 17.5, yaw: -Math.PI / 2, alert: true },
    ],
    lines: [[EN, '西側匝道，目標出現！']],
    done: [[OP, '……零號？零號，聽得到嗎？'], [ME, '白鷺！'], [OP, '指揮所沒了。我換到機庫的備用線路……受了點傷，死不了。'], [OP, '金鑰拿到了？'], [ME, '拿到了。隼他……'],
      [OP, '……我知道。走吧，穿過倉庫就是貨櫃場。']],
  },
  {
    id: 'E', ch: 4, obj: '穿過貨櫃場，到基地大門', mark: V(28, 23), next: '進入基地大門', guide: [16, 16.5], nextRoute: [[21, 18.5], [28, 18.5]],
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
    lines: [[OP, '有重裝兵，他的護甲很厚——瞄準頭。'], [EN, '入侵者在貨櫃區！全員就位！']],
    done: [[OP, '大門就在前面。進了門就是第七機庫的地面設施。']],
  },
  // ---------------- 第 5 章：第七機庫
  {
    id: 'F', ch: 5, route: [[28, 19]], guide: [28, 28.5], obj: '穿過地面設施', mark: V(32, 53.5),
    trigger: (p) => p.z > 26,
    enemies: [
      { type: 'trooper', x: 23, z: 33, yaw: Math.PI },
      { type: 'trooper', x: 40, z: 33.5, yaw: Math.PI },
      { type: 'officer', x: 39, z: 44, yaw: -Math.PI / 2 * -1 },
      { type: 'trooper', x: 25, z: 40, yaw: Math.PI / 2 },
      { type: 'heavy', x: 32, z: 49, yaw: Math.PI },
      { type: 'trooper', x: 24, z: 48, yaw: Math.PI / 2 },
    ],
    lines: [[OP, '他們已經攻進設施了。走廊很窄——手槍比較好用（按 2）。']],
    done: [[OP, '機庫門就在走廊盡頭。']],
  },
  {
    id: 'G1', ch: 5, route: [[28, 29], [28, 33], [32, 37], [32, 47]], guide: [32, 56], obj: '奪回第七機庫', mark: null,
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
    lines: [[OP, '那就是蒼焰……他們想把它拖走！'], [OP, '把機庫裡的敵人清乾淨，然後上維修架。']],
    done: [[EN, '所有單位，第七機庫，東門突入！'], [OP, '東邊大門還有增援——撐住！']],
  },
  {
    id: 'G2', ch: 5, guide: [40, 70], obj: '擊退增援', mark: null,
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

export const LINES = {
  start: [[OP, '零號，聽得到嗎？這裡是白鷺。'], [OP, '首都防線昨晚全垮了。獵犬軍團在城裡到處搜人。'], [OP, '第七機庫還在我們手上，蒼焰在那裡。沿著這條後巷往北走。']],
  ch2: [[OP, '零號，前面就是他們的封鎖線。'], [OP, '你只有一把長槍一把手槍，別跟他們硬拚。']],
  ch3: [[OP, '這裡是北區住宅，昨晚被炸得最慘。'], [EN, '……各小隊注意，目標是聯邦試驗機的駕駛員，人在北區。'], [EN, '找到他。上面要活的。'], [OP, '……他們也在找隼。快，零號。']],
  ch4: [[OP, '逃生梯上去就是高架道路，一路通到基地西側。'], [OP, '上面很空曠，他們看得到你，你也看得到——'], [OP, '……等等，指揮所外面有——'], [NOISE, '（雜訊）……訊號中斷……'], [ME, '白鷺？……白鷺！']],
  ch5: [[OP, '大門後面就是第七機庫。'], [OP, '他們已經打進去了……快，零號。'], [OP, '金鑰收好。那是隼交給你的。']],
  mech: [[OP, '……停下。別動。'], [OP, '圍牆外面，那是獵犬機。它的感測器掃過來了。'], [OP, '……它往北走了。繼續前進。']],
  hatch: [[OP, '駕駛艙開了。金鑰插右手邊，轉到底——進去吧，零號。']],
};
