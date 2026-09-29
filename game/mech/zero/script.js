// 劇情與遭遇戰：章節、無線電對白、觸發區、敵人配置、目標點
//   區域座標見 map.js；敵人 type：trooper / officer / heavy / sniper / drone
//   trigger(p)＝玩家進到這裡就開打；next＝這一段清完後的目標
import * as THREE from 'three';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const OP = '白鷺（指揮所）', ME = '零號', EN = '獵犬軍團通訊';

export const INTRO = [
  '首都防線崩潰的第三個夜晚。',
  '獵犬軍團的機動裝甲踏平了半座城，步兵正挨家挨戶搜捕倖存者。',
  '聯邦只剩最後一台機體——XG-01「蒼焰」，藏在第七機庫。',
  '它的駕駛員全都陣亡了。只剩你。',
];

export const CHAPTERS = [
  { n: 1, name: '陷落', en: 'FALLEN CITY', start: 'start', yaw: 0, music: 1 },
  { n: 2, name: '封鎖線', en: 'THE CHECKPOINT', start: 'ch2', yaw: Math.PI / 2 * -1 + Math.PI, music: 3 },
  { n: 3, name: '第七機庫', en: 'HANGAR 7', start: 'ch3', yaw: 0, music: 5 },
];

// 每段遭遇：id、屬於哪章、觸發條件、敵人、開打時的對白、清完後的目標
export const ENCOUNTERS = [
  // ---------------- 第 1 章
  {
    id: 'B', ch: 1, obj: '穿過後巷', mark: V(-91.5, -62),
    trigger: (p) => p.z > -86 && p.x > -96 && p.x < -87,
    enemies: [
      { type: 'trooper', x: -92, z: -64, yaw: Math.PI, patrol: [[-92.5, -64], [-90, -75], [-91, -66]] },
      { type: 'trooper', x: -89.6, z: -61, yaw: Math.PI + 0.3 },
    ],
    lines: [[OP, '前面有兩個巡邏兵。長槍打身體一發就倒——右鍵瞄準。'], [OP, '蹲下（C）他們比較不容易發現你。']],
    done: [[OP, '乾淨俐落。穿過前面的市場廣場。']],
  },
  {
    id: 'C', ch: 1, obj: '清除市場廣場', mark: V(-52, -42),
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
    id: 'D', ch: 2, obj: '突破街道檢查哨', mark: V(28, -30),
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
    done: [[OP, '檢查哨解決了。北邊是貨櫃場，基地大門就在後面。']],
  },
  {
    id: 'E', ch: 2, obj: '穿過貨櫃場，到基地大門', mark: V(28, 19),
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
  // ---------------- 第 3 章
  {
    id: 'F', ch: 3, obj: '穿過地面設施', mark: V(32, 53.5),
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
    id: 'G1', ch: 3, obj: '奪回第七機庫', mark: null,
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
    id: 'G2', ch: 3, obj: '擊退增援', mark: null,
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
    done: [[OP, '做得好，零號……機庫是你的了。'], [OP, '爬上維修架——駕駛艙在胸口。蒼焰等你很久了。']],
  },
];

export const LINES = {
  start: [[OP, '零號，聽得到嗎？這裡是白鷺。'], [OP, '首都防線昨晚全垮了。獵犬軍團在城裡到處搜人。'], [OP, '第七機庫還在我們手上，蒼焰在那裡。沿著這條後巷往北走。']],
  ch2: [[OP, '零號，前面就是他們的封鎖線。'], [OP, '你只有一把長槍一把手槍，別跟他們硬拚。']],
  ch3: [[OP, '大門後面就是第七機庫。'], [OP, '他們已經打進去了……快，零號。']],
  mech: [[OP, '……停下。別動。'], [OP, '圍牆外面，那是獵犬機。它的感測器掃過來了。'], [OP, '……它往北走了。繼續前進。']],
  hatch: [[OP, '駕駛艙開了。進去吧，零號。']],
};
