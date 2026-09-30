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
  '天亮以前，獵犬就會找到它。你是修理工，還沒真正開過機體。',
];

export const CHAPTERS = [
  { n: 1, name: '陷落', en: 'FALLEN CITY', start: 'start', yaw: 0, music: 1, end: { after: 'C3', at: (p) => p.x > -58 && p.z > -48 && p.z < -36 } },
  { n: 2, name: '封鎖線', en: 'THE CHECKPOINT', start: 'ch2', yaw: Math.PI / 2 * -1 + Math.PI, music: 3, end: { after: 'D3', at: (p) => p.z > -30 && p.x > -14 && p.x < -6 } },
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
    done: [[OP, '乾淨俐落。穿過前面的市場廣場。'], [OP, '巷口鐵門鎖死了。從修車行的後門繞過去。']],
  },
  {
    // 潛行：巷子東側的修車行（map.js），三個人擠在北門口搬東西、背對西門；被發現就從廣場叫兩個人進來
    id: 'B2', ch: 1, obj: '穿過修車行', fight: '解決修車行裡的人', route: [[-90.3, -74.4]], guide: [-85.8, -74.4],
    trigger: (p) => p.x > -87.7 && p.x < -72 && p.z > -76 && p.z < -62.3,
    enemies: [
      { type: 'trooper', x: -81, z: -64.1, yaw: 0.25 },
      { type: 'trooper', x: -79.3, z: -63.9, yaw: 0 },
      { type: 'trooper', x: -77.7, z: -64.4, yaw: -0.2 },
    ],
    // 開槍打倒一個，其他兩個會被槍聲驚動（叫增援）；一顆手榴彈丟進三人中間才不會被發現
    stealth: { reinforce: [{ type: 'trooper', x: -77.8, z: -60.4, yaw: Math.PI }, { type: 'trooper', x: -76, z: -60.6, yaw: Math.PI }], lines: [[EN, '修車行有人！'], [OP, '被發現了。廣場那邊有人過來！']] },
    lines: [[OP, '裡面三個人，擠在鐵捲門口搬東西。'], [OP, '還沒發現你。別讓他們叫人。']],
    done: [[OP, '好。北邊的鐵捲門出去，就是廣場。']],
  },
  {
    id: 'C', ch: 1, obj: '清除市場廣場', fight: '清除市場廣場', route: [[-77, -64]], guide: [-77, -58.6],
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
    done: [[OP, '廣場清空了。從東邊那間商店穿過去。'], [ME, '收到。'], [OP, '……等等。角落那間倉庫，是他們的據點。']],
  },
  {
    // 撿東西：廣場東南角的倉庫（map.js 的據點），桌上無線電、密碼本，牆上搜索地圖
    id: 'C2', ch: 1, obj: '搜查他們的據點', route: [[-68, -50], [-63, -49.5]], guide: [-63, -53.6],
    trigger: (p) => p.x > -65.7 && p.x < -60.3 && p.z > -61.7 && p.z < -52.3,
    enemies: [],
    pickups: [
      { id: 'radio', text: '按 E　拿無線電', lines: [[ME, '無線電還開著。']] },
      { id: 'codes', text: '按 E　拿密碼本', lines: [[OP, '那是他們的密碼本，收好。']] },
      { id: 'smap', text: '按 E　拍下地圖', lines: [[ME, '搜索地圖。北區整片都圈起來了。']] },
    ], itemName: '情報',
    lines: [[OP, '無線電、文件，能拿的都拿走。']],
    done: [[OP, '都拿到了。無線電先別關。']],
  },
  {
    // 守點：白鷺用密碼本對頻率，撐 40 秒；增援從東邊商店、修車行、北邊店面進廣場
    id: 'C3', ch: 1, obj: '守住據點', fight: '守住據點', mark: V(-52, -42), next: '穿過東邊的商店', guide: [-63, -53.6], nextRoute: [[-63, -49.3], [-61, -47], [-61, -42.5]],
    after: 'C2', wait: 2,
    beats: [{ t: 18, lines: [[EN, '密碼本不見了。切換頻率，把據點包住！'], [OP, '別關無線電。切換的時候，我才能抓到新頻率。']] },
      { t: 32, lines: [[OP, '抓到了……還差八秒。零號，守住門口！']] }],
    enemies: [],
    // 每 4.5 秒一波（自動試玩每 3 秒檢查一次有沒有敵人或目標：間隔 5 秒會連續四次都剛好沒人，被當成「沒有指示」）
    hold: {
      t: 40, gap: 4.5,
      waves: [
        [{ type: 'trooper', x: -58.8, z: -42.6, yaw: -Math.PI / 2 }, { type: 'trooper', x: -58.6, z: -41.2, yaw: -Math.PI / 2 }],
        [{ type: 'drone', x: -82, z: -36, y: 9 }],
        [{ type: 'trooper', x: -77.8, z: -60.4, yaw: Math.PI / 2 }, { type: 'trooper', x: -80.5, z: -60.5, yaw: Math.PI / 2 }],
        [{ type: 'officer', x: -58.7, z: -41.6, yaw: -Math.PI / 2 }, { type: 'trooper', x: -58.3, z: -43.4, yaw: -Math.PI / 2 }],
        [{ type: 'trooper', x: -86, z: -32.5, yaw: Math.PI }],
        [{ type: 'drone', x: -84, z: -60, y: 9 }],   // 修車行北邊那條窄空地的上空（別生在樓裡：無人機出不來）
        [{ type: 'trooper', x: -58.8, z: -42, yaw: -Math.PI / 2 }],
        [{ type: 'trooper', x: -79, z: -60.5, yaw: Math.PI / 2 }],
      ],
      lines: [[[OP, '東邊商店，兩個。', NOW]], [[OP, '無人機。', NOW]], [[OP, '修車行那邊也有。', NOW]], [[EN, '據點裡有人！包圍！', NOW]], [[OP, '北邊店面，一個。', NOW]], [[OP, '又一台無人機。', NOW]], [], [[OP, '快好了，再撐一下。', NOW]]],
      done: [[OP, '頻率對上了。把剩下的清掉。']],
    },
    lines: [[EN, '第三小隊，回報。……第三小隊？', NOW], [OP, '他們起疑了。我需要四十秒接入頻道。'], [EN, '廣場失聯。兩邊的街口一起進！'], [OP, '別被他們夾住，門口一次只露一邊。']],
    done: [[OP, '從現在起，他們的無線電我們也聽得到。'], [OP, '好了，走吧。穿過東邊那間商店。']],
  },
  // ---------------- 第 2 章
  {
    // 對面工廠（map.js 的廠房）：從西門進、東門出，繞到檢查哨側面；裡面是他們休息的地方
    id: 'D0', ch: 2, obj: '穿過對面的工廠', fight: '清除工廠裡的敵人', route: [[-45.5, -42], [-42.3, -42], [-33.3, -46.3]], guide: [-33.3, -50.5],
    trigger: (p) => p.z < -48.6 && p.z > -60 && p.x > -35.7 && p.x < -6,
    enemies: [
      { type: 'trooper', x: -29.8, z: -50.3, yaw: Math.PI / 2 },
      { type: 'trooper', x: -24, z: -55.3, yaw: Math.PI / 2 + 0.3 },
      { type: 'trooper', x: -21.9, z: -55.1, yaw: -Math.PI / 2 - 0.3 },
      { type: 'officer', x: -15.5, z: -58.4, yaw: Math.PI },
      { type: 'trooper', x: -13.5, z: -50, yaw: -Math.PI / 2, patrol: [[-13.5, -50], [-21.5, -50]] },
    ],
    lines: [[EN, '……換班還要多久？'], [OP, '裡面五個人在休息。機台後面可以躲。']],
    done: [[OP, '東邊那扇門出去，就是檢查哨的側面。']],
  },
  {
    // 觸發改成走到街上才開打（從工廠東門或西門出來都算）
    id: 'D', ch: 2, obj: '突破街道檢查哨', fight: '突破檢查哨', route: [[-28, -49.8], [-8.5, -49.8]], guide: [-8.5, -46.3],
    trigger: (p) => p.x > -46 && p.z < -33 && p.z > -48,
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
    // 炸目標：檢查哨的三台干擾器（map.js 的 jam1～3），東邊有人過來守
    id: 'D1', ch: 2, obj: '炸掉干擾器', fight: '炸掉干擾器', guide: [-4, -40],
    after: 'D', wait: 2,
    targets: ['jam1', 'jam2', 'jam3'], tgName: '干擾器',
    enemies: [
      { type: 'drone', x: 16, z: -41, y: 8, alert: true },
      { type: 'trooper', x: 21, z: -39.5, yaw: -Math.PI / 2, alert: true },
      { type: 'trooper', x: 25, z: -45, yaw: -Math.PI / 2, alert: true },
    ],
    lines: [[OP, '零號，我這邊的畫面全是雜訊。'], [OP, '檢查哨架了三台干擾器，找到就打爛。']],
    done: [[OP, '畫面回來了。……貨櫃場入口前面，好像堆了東西。']],
  },
  {
    // route：炸完干擾器人常在兩排護欄中間，照 S 形穿過去（西排護欄北端、東排護欄南端）
    id: 'D2', ch: 2, obj: '前往貨櫃場入口', fight: '擊退封鎖線的敵人', route: [[-1, -39.6], [0.5, -42.3], [4.5, -42.3], [7, -40.8]], guide: [14, -40],
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
  {
    // 回頭走到商場門口：追兵從街口、工廠東門包過來
    id: 'D3', ch: 2, obj: '從北邊的商場繞過去', fight: '擊退追兵', mark: V(-10, -27), next: '進商場，往北走', route: [[8, -40.5], [0, -41], [-4, -38.5]], guide: [-10, -37.5], nextRoute: [[-10, -37.5]],
    trigger: (p) => p.x > -17 && p.x < -3 && p.z > -41,
    enemies: [
      { type: 'trooper', x: -40, z: -44.5, yaw: Math.PI / 2, alert: true },
      { type: 'trooper', x: -38.5, z: -38.5, yaw: Math.PI / 2, alert: true },
      { type: 'officer', x: -33, z: -41, yaw: Math.PI / 2, alert: true },
      { type: 'trooper', x: -9, z: -51, yaw: 0, alert: true },
      { type: 'drone', x: -28, z: -41, y: 8, alert: true },
    ],
    lines: [[EN, '檢查哨那邊有人！第四小隊，包過去！', NOW], [OP, '後面有追兵，先解決他們！', NOW]],
    done: [[OP, '甩掉了。快進商場。']],
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
    // 醫院門口的油桶陷阱（map.js 的 trapW／trapE／trapS）：三個守門的站在桶子旁邊，打爆桶子連人一起炸掉；雨遮上的軍官和一台無人機要另外打
    id: 'H3', ch: 3, obj: '往醫院走', fight: '引爆門口的陷阱', route: [[-30, -3]], guide: [-36.5, 0.8],
    trigger: (p) => p.x < -34,
    targets: ['trapW', 'trapE', 'trapS'], tgName: '油桶陷阱',
    enemies: [
      { type: 'trooper', x: -55.1, z: 4.9, yaw: Math.PI, post: true },
      { type: 'trooper', x: -50.3, z: 4.6, yaw: Math.PI, post: true },
      { type: 'trooper', x: -52.4, z: 2.6, yaw: Math.PI, post: true },
      { type: 'officer', x: -52, z: 5.2, y: 4.2, yaw: Math.PI, post: true },
      { type: 'drone', x: -47, z: 0, y: 7 },
    ],
    lines: [[OP, '等等，先別靠近醫院大門。'], [OP, '門口那幾桶油接了引線。他們在等人來救隼。'], [OP, '從遠處打爆，連守門的一起。']],
    done: [[OP, '陷阱沒了。從正門進去。']],
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
    // 掛號櫃台後面的病歷室（大廳東牆的大開口進去）：三份病歷走近按 E（map.js 的 rec_a／rec_b／rec_c），裡面三個人也在翻
    id: 'I0', ch: 3, obj: '查隼的病歷', fight: '查隼的病歷', route: [[-52, 3], [-52, 8.5]], guide: [-49, 10.5],
    trigger: (p) => p.x > -59.6 && p.x < -44 && p.z > 7.2 && p.z < 18,
    pickups: [
      { id: 'rec_a', text: '按 E　翻住院名單', lines: [[ME, '昨晚的住院名單……沒有隼的名字。']] },
      { id: 'rec_b', text: '按 E　拿病歷', lines: [[ME, '無名氏，穿著駕駛服，全身燒傷。'], [OP, '是他。']] },
      { id: 'rec_c', text: '按 E　看交班本', lines: [[ME, '交班本寫著：北棟病房，最東邊那床。'], [ME, '這頁被人翻過。他們也在找。']] },
    ],
    itemName: '病歷',
    enemies: [
      { type: 'trooper', x: -41, z: 12.8, yaw: 0 },
      { type: 'trooper', x: -38.4, z: 8.8, yaw: Math.PI / 2 },
      { type: 'trooper', x: -39.8, z: 16.2, yaw: 0.3 },
    ],
    lines: [[OP, '等等。病房區有三十幾張床。'], [OP, '他不會用本名住院。櫃台跟後面的病歷室找找。'], [ME, '……病歷室裡有人在翻東西。']],
    done: [[OP, '床位對上了。從大廳北門進病房區。']],
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
    beats: [{ t: 10, lines: [[EN, '指揮官壓住病房，其他人分開找！'], [OP, '他們在換位置。守住掩體，別追出去。']] }],
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
    // 橋面上的干擾器（map.js 的 jamA／jamB／jamC；指揮所斷訊就是它們）：零號是修機體的，一看就認得。打掉三台＋兩台守著的無人機
    //   繞過第一台燒毀的車、到南側車道（跟 J2 同一條路）才開始；三台都在這裡往東 15 m 內，一台架在翻倒的貨櫃頂上，一台躲在護欄和第二個貨櫃中間
    id: 'J3', ch: 4, obj: '往匝道走', fight: '炸掉干擾器',
    route: [[-30.75, 30], [-30.75, 41, 6], [-27, 46.1, 6], [-21.35, 46.2, 6], [-21.3, 43.2, 6]], guide: [-19.5, 41.3, 6],
    trigger: (p) => p.y > 4 && p.x > -22.1 && p.z < 43.3,
    targets: ['jamA', 'jamB', 'jamC'], tgName: '干擾器',
    enemies: [
      { type: 'drone', x: -6, z: 45, y: 10 },
      { type: 'drone', x: -11, z: 47.5, y: 11 },
    ],
    lines: [[ME, '……等等。這幾台箱子在發訊號。'], [ME, '是干擾器。難怪頻道全是雜訊。'], [ME, '打掉它們，也許接得回白鷺。']],
    done: [[NOISE, '（雜訊）……零……號……聽……', NOW], [ME, '白鷺？……訊號太弱了。', NOW]],
  },
  {
    // 干擾器一斷，他們就知道橋上有人：從匝道下面一波波上來，守住匝道口 38 秒（每 4 秒一波，從空地、倉庫穿堂出來）
    //   守點＝匝道頂端往下看（路線跟 J2 同一段：從第三台燒毀的車西邊繞到匝道）
    id: 'J4', ch: 4, obj: '守住匝道口', fight: '守住匝道口', route: [[-4.4, 41.3, 6], [-2.9, 42.7, 6], [-1.95, 41.2, 6]], guide: [1, 38.6, 5.4],
    after: 'J3', wait: 2,
    enemies: [
      { type: 'trooper', x: 4.5, z: 15.2, yaw: 0, alert: true },
      { type: 'trooper', x: -1.2, z: 18.5, yaw: 0, alert: true },
    ],
    hold: {
      t: 38, gap: 4,
      waves: [
        [{ type: 'trooper', x: 4.6, z: 20.2 }],
        [{ type: 'trooper', x: 9.5, z: 16.5 }],
        [{ type: 'drone', x: 2, z: 22, y: 9 }],
        [{ type: 'trooper', x: 3.5, z: 22.5 }],
        [{ type: 'officer', x: 11, z: 17.2 }],
        [{ type: 'trooper', x: -1.2, z: 18.5 }],
        [{ type: 'drone', x: 5, z: 18, y: 10 }],
        [{ type: 'heavy', x: 9.5, z: 16.5 }],
        [{ type: 'trooper', x: 4.5, z: 15.2 }, { type: 'trooper', x: 3.5, z: 22.5 }],
      ],
      lines: [null, null, [[EN, '無人機，從上面包過去！', NOW]], null, null, null, null, [[EN, '重裝兵上去，把他壓在橋上！', NOW]]],
      done: [[ME, '後面沒人再上來了。', NOW]],
    },
    lines: [[EN, '干擾器全斷了！橋上有人！', NOW], [EN, '匝道下面的，上去堵他！', NOW], [ME, '……從匝道上來了。守住這裡。', NOW]],
    done: [[ME, '……清掉了。下去。']],
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
    // 貨櫃場的三個哨兵（還沒發現你）：獵犬機正從圍牆外走過（MECH_WALK，x > 14 就開始走，這段 x > 15.2 才開始，對白排在它後面）
    //   三個人彼此隔 28 m 以上：一次打一個、離其他人 32 m 外開槍就不會驚動別人（巡邏的走到南邊時再打東北角那個）；被發現就叫增援
    id: 'E0', ch: 4, obj: '穿過倉庫，進貨櫃場', fight: '摸掉哨兵', route: [[2, 18], [4, 16.5], [10, 16.5]], guide: [16.5, 16.5],
    trigger: (p) => p.x > 15.2 && p.z > -34,
    enemies: [
      { type: 'trooper', x: 40, z: 15.4, yaw: Math.PI / 2 },
      { type: 'trooper', x: 15.6, z: -4, yaw: Math.PI, patrol: [[15.6, -4], [15.6, -20]] },
      { type: 'trooper', x: 44, z: -22, yaw: Math.PI / 2 },
    ],
    stealth: {
      reinforce: [{ type: 'trooper', x: 26, z: -31 }, { type: 'trooper', x: 33, z: -31 }, { type: 'officer', x: 36, z: 1 }],
      lines: [[EN, '貨櫃場有入侵者！全員過來！', NOW], [OP, '被發現了！先收拾趕過來的人。', NOW]],
    },
    lines: [[OP, '貨櫃場裡還有三個哨兵，都還沒發現你。', NOW], [OP, '他們一叫，增援就會過來。一個一個摸掉。', NOW]],
    done: [[OP, '三個都倒了。', NOW], [OP, '……他們的回報斷了，會有人來查。', NOW]],
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
    done: [[OP, '設施清掉了。……等等，維修架沒電。'], [OP, '他們把配電箱的保險絲拔了。沒電，艙門打不開。'], [ME, '控制室有備用的。我去拿。']],
  },
  {
    // 潛行：機庫派三個人過來查看（從機庫南門進走廊，巡控制室、倉庫、營房）；被看到就叫增援。保險絲在控制室桌上
    id: 'F2', ch: 5, obj: '去控制室拿保險絲', fight: '拿保險絲，別被發現', route: [[28, 29], [28, 33], [32, 35], [32, 43]], guide: [36, 43],
    trigger: (p) => p.x > 34.6 && p.x < 44 && p.z > 36.5 && p.z < 51.6,
    enemies: [
      { type: 'trooper', x: 32, z: 55.5, yaw: Math.PI, patrol: [[32, 50.5], [32, 37.5]] },
      { type: 'officer', x: 31.2, z: 57.2, yaw: Math.PI, patrol: [[32, 44], [36, 43], [40.5, 41.5], [40.5, 49.5], [40.5, 41.5], [36, 43], [32, 44], [32, 50.5]] },
      { type: 'trooper', x: 32.8, z: 56.8, yaw: Math.PI, patrol: [[32, 47], [28.2, 47], [28.2, 45], [22.5, 45], [28.2, 45], [28.2, 47], [32, 47], [32, 40], [26.5, 40], [32, 40], [32, 50.5]] },
    ],
    stealth: {
      // 增援直接出在走廊北端（出在機庫裡的話，隔著牆走不進設施）
      reinforce: [{ type: 'trooper', x: 32, z: 50.8, yaw: Math.PI }, { type: 'trooper', x: 31.1, z: 49.4, yaw: Math.PI }, { type: 'trooper', x: 32.9, z: 49.4, yaw: Math.PI }],
      lines: [[EN, '設施裡有人！全員過來！'], [OP, '被發現了……打吧，零號！']],
    },
    pickups: [{ id: 'fuse', text: '按 E　拿保險絲', lines: [[ME, '拿到了。']] }], itemName: '保險絲',
    lines: [[EN, '第二小隊，去設施看一下。剛才有槍聲。', NOW], [OP, '機庫那邊有人過來了。躲好，別讓他們叫人。', NOW]],
    done: [[OP, '好。機庫門在走廊盡頭。']],
  },
  {
    id: 'G1', ch: 5, fight: '阻止他們拖走蒼焰', route: [[32, 43], [32, 50]], guide: [32, 56], obj: '奪回第七機庫', mark: null,
    trigger: (p) => p.z > 53.5,
    alarm: true,
    beats: [{ t: 14, lines: [[EN, '修理工進機庫了！守住發電機，別讓他碰機體！'], [OP, '他們知道你要做什麼。先斷拖吊機的電，再清守衛。']] }],
    targets: ['tow1', 'tow2'], tgName: '發電機',
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
    lines: [[OP, '那就是蒼焰……他們想把它拖走！', NOW], [OP, '拖吊機靠東門那兩台發電機。打爆它們！', NOW]],
    done: [[OP, '拖吊機停了。'], [OP, '配電箱在西側走道，保險絲裝回去就有電。']],
  },
  {
    // 走道：西側走道（y 7）上的兩個配電箱裝回保險絲；對面東側走道有狙擊手，北側走道和上層平台有人守
    id: 'G3', ch: 5, obj: '上西側走道', fight: '裝回保險絲', route: [[14, 68], [14.1, 55.2, 7]], guide: [11.3, 54.6, 7],
    trigger: (p) => p.y > 6 && p.x < 13,
    enemies: [
      { type: 'sniper', x: 68.5, z: 99, y: 7, yaw: -Math.PI / 2, post: true },
      { type: 'officer', x: 27, z: 110.5, y: 12.4, yaw: -Math.PI * 0.75, post: true },
      { type: 'trooper', x: 25, z: 110.4, y: 7, yaw: -Math.PI / 2, post: true },
      { type: 'trooper', x: 21, z: 110.6, y: 12.4, yaw: -Math.PI * 0.8, post: true },
      { type: 'drone', x: 34, z: 86, y: 10 },
    ],
    pickups: [{ id: 'panel1', text: '按 E　裝上保險絲', lines: [[ME, '南邊這個裝好了。']] }, { id: 'panel2', text: '按 E　裝上保險絲', lines: [[ME, '北邊這個裝好了。']] }], itemName: '配電箱',
    lines: [[EN, '走道上有人！', NOW], [OP, '對面走道有狙擊手。看到紅線就蹲低。', NOW]],
    done: [[OP, '電來了……維修架有反應了。'], [OP, '我開始跑開機檢查。']],
  },
  {
    // 守點：開機檢查 40 秒，每 4 秒一波：東門進來的步兵，無人機，還有爬上對面走道（東南角平台、東側、北側走道、維修架東側）守著打的
    //   地面的步兵找不到人會躲到西側走道底下（從上面打不到）、從南門進來的會退回設施走廊，所以一半的增援放在對面的走道上、地面的都從東門進來
    id: 'G4', ch: 5, obj: '守住機庫', fight: '撐到開機檢查完成', guide: [11.8, 90, 7],
    after: 'G3', wait: 3,
    enemies: [
      { type: 'trooper', x: 73, z: 66, yaw: -Math.PI / 2, alert: true },
      { type: 'trooper', x: 73, z: 71, yaw: -Math.PI / 2, alert: true },
      { type: 'drone', x: 72, z: 68, y: 9, alert: true },
    ],
    hold: {
      t: 40, gap: 4,
      waves: [
        [{ type: 'trooper', x: 73, z: 63, yaw: -Math.PI / 2 }],
        [{ type: 'sniper', x: 68.6, z: 54.5, y: 7, yaw: -Math.PI / 2, post: true }],
        [{ type: 'drone', x: 74, z: 70, y: 9 }],
        [{ type: 'trooper', x: 73, z: 73, yaw: -Math.PI / 2 }],
        [{ type: 'trooper', x: 60, z: 110.5, y: 7, yaw: -Math.PI * 0.75, post: true }, { type: 'trooper', x: 64, z: 110.6, y: 7, yaw: -Math.PI * 0.75, post: true }],
        [{ type: 'drone', x: 74, z: 62, y: 10 }],
        [{ type: 'officer', x: 74, z: 66, yaw: -Math.PI / 2 }],
        [{ type: 'trooper', x: 48.6, z: 107, y: 12.4, yaw: -Math.PI / 2, post: true }, { type: 'trooper', x: 68.5, z: 93, y: 7, yaw: -Math.PI / 2, post: true }],
        [{ type: 'drone', x: 73, z: 72, y: 9 }],
      ],
      lines: [[], [[OP, '東南角的平台上有狙擊手！', NOW]], [], [[EN, '第二隊，從東門進去！', NOW]], [[EN, '北側走道就位！', NOW]], [], [], [[OP, '快好了……再撐一下！', NOW]], []],
      done: [[OP, '檢查完成，艙門解鎖了！', NOW]],
    },
    lines: [[EN, '機庫的電恢復了！他們要啟動那台機體！', NOW], [DOG, '別讓它開機。全員進機庫。', NOW], [OP, '檢查要四十秒。撐住，零號！', NOW]],
    done: [[EN, '重裝部隊，東門突入！', NOW], [OP, '重裝兵……最後一波了，撐住！', NOW]],
  },
  {
    id: 'G2', ch: 5, guide: [40, 70], obj: '擊退增援', fight: '擊退東門的增援', mark: null,
    after: 'G4', wait: 2,
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
  start: [[OP, '零號，聽得到嗎？先別出巷子。'], [EN, '南區清查完畢。各隊往北推，逐戶搜。'], [OP, '他們正在掃街。第七機庫還沒失守，沿後巷往北走。']],
  ch2: [[OP, '零號，前面就是他們的封鎖線。'], [OP, '你只有一把長槍一把手槍，別跟他們硬拚。'], [OP, '走對面那間工廠，從裡面繞到檢查哨旁邊。']],
  ch3: [[OP, '這裡是北區住宅，昨晚被炸得最慘。'], [EN, '……各小隊注意，目標是聯邦試驗機的駕駛員，人在北區。'], [EN, '找到他。上面要活的。'], [OP, '……他們也在找隼。快，零號。']],
  ch4: [[OP, '逃生梯上去是高架道路。先看樓頂，再出去。'], [EN, '找到聯邦指揮所了。突入！'], [OP, '零號，別回頭。把金鑰帶到機庫——'], [NOISE, '（槍聲、雜訊）……訊號中斷……'], [ME, '白鷺？……白鷺！']],
  ch5: [[OP, '大門後面就是第七機庫。'], [OP, '他們已經打進去了……快，零號。'], [OP, '金鑰收好。那是隼交給你的。']],
  mech: [[OP, '……停下。別動。', NOW], [OP, '圍牆外面，那是獵犬機。它的感測器掃過來了。', NOW], [OP, '……它往北走了。繼續前進。', NOW]],
  hatch: [[OP, '駕駛艙開了。金鑰插右手邊，轉到底——進去吧，零號。']],
};
