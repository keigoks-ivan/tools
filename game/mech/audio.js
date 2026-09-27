// 音效：全部用 Web Audio 即時合成（振盪器、雜訊、濾波、包絡、殘響），不需要任何音檔。
// 聲音分四條匯流排：
//   hull ：自機結構音（腳步、液壓、推進器、落地），在座艙裡聽到，低通＋低頻加強，悶而厚。
//   arm  ：自機武器（光束、飛彈、光劍），稍亮，帶一點城市回音。
//   cab  ：座艙內部（儀表嗶聲、警報、震動雜音），乾淨，只有極小的座艙殘響。
//   world：外界（敵機、爆炸、彈著），立體聲定位＋距離衰減＋距離低通＋座艙隔音低通＋城市回音；遠方爆炸有音速延遲。
// 全部 → 壓縮器 → 限幅器 → 軟削波 → 主音量 → 暫停閘 → 喇叭；大爆炸也不會爆音。
// 配樂（music）另走一條匯流排：曲目 → 閃避 → 危急低通 → 配樂音量 → 同一組壓縮／限幅；大撞擊時自動把配樂與環境音壓低。
// 配樂一樣全部即時合成（弦樂墊、銅管、合唱共振峰、FM 鐘琴、鼓組取樣都在第一次播放時用程式算出），原創旋律。

const SOS = 343;          // 音速（公尺／秒）
const MAX_DELAY = 1.5;    // 遠方爆炸最大延遲（秒）
const E = 0.0001;         // 包絡的「靜音」值（指數曲線不能到 0）
const BAR = [1, 2.756, 5.404, 8.933];    // 自由樑模態比例：金屬撞擊的不諧和泛音
const PLATE = [1, 1.59, 2.14, 2.83, 3.6]; // 厚板共振：裝甲被打中的沉重金屬聲
const MG_CAP = 24;        // 同時發聲超過這個數就丟掉機槍聲
const MINOR_CAP = 44;     // 次要聲音（腳步、彈著、碎片）上限
const HARD_CAP = 80;      // 絕對上限

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const num = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const rnd = (a, b) => a + Math.random() * (b - a);

// 城市殘響：開頭稀疏（大樓牆面的分離回音），之後才長出擴散尾巴，越晚越悶。
const CITY_IR = {
  sec: 2.4, pre: 0.018, rise: 0.16, diff: 0.35, decay: 3.1, fStart: 7000, fEnd: 800, dark: 1.8,
  taps: [[0.052, 0.8], [0.088, 1.0], [0.137, 0.7], [0.186, 0.8], [0.255, 0.5], [0.34, 0.4], [0.46, 0.28]],
};
// 座艙：小型金屬空間，極短。
const COCKPIT_IR = {
  sec: 0.25, pre: 0.002, rise: 0.004, diff: 1, decay: 30, fStart: 6000, fEnd: 2500, dark: 12,
  taps: [[0.0035, 0.5], [0.0081, 0.4], [0.0127, 0.3]],
};
// 配樂殘響：音樂廳式長尾（和城市回音分開；配樂不做 3D 定位）
const HALL_IR = {
  sec: 2.2, pre: 0.012, rise: 0.06, diff: 1, decay: 2.4, fStart: 5500, fEnd: 1400, dark: 1.1,
  taps: [[0.019, 0.35], [0.031, 0.3], [0.047, 0.25], [0.066, 0.2]],
};

// ───────────────────────── 配樂：常數與樂譜工具（全部原創） ─────────────────────────
const MUS_CAP = 48;       // 配樂同時發聲上限（獨立計數，不佔音效名額）
const MUS_K = 0.21;       // 配樂匯流排增益（setMusicVolume(1) 的實際倍率）
const MUS_LA = 0.25;      // 排程預看秒數（音訊時鐘）
const MUS_LA_BG = 1.2;    // 分頁在背景時計時器被節流，預看拉長
const VEH_CAP = 6;        // 同時運作的載具引擎聲上限（超過就保留最近的）
// 載具：ref＝參考距離（越大越遠都聽得到）、g＝音量、rv＝城市殘響、f＝引擎基頻、c0/c1＝履帶節奏、r0/r1＝旋翼葉片通過頻率
const VEH = {
  tank: { ref: 22, g: 0.55, rv: 0.25, f: 32, c0: 5, c1: 13 },
  apc: { ref: 20, g: 0.45, rv: 0.22, f: 44, c0: 7, c1: 16 },
  heli: { ref: 80, g: 0.9, rv: 0.35, r0: 13, r1: 4 },
  jet: { ref: 70, g: 0.7, rv: 0.4 },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// 和弦名稱 → { r: 根音音級, iv: 音程 }；支援 'Dm'、'Bb'、'C#'、'Asus'、'Dadd9'
function chordOf(name) {
  let r = PCS[name[0]], i = 1;
  if (name[i] === 'b') { r -= 1; i++; } else if (name[i] === '#') { r += 1; i++; }
  const rest = name.slice(i), minor = rest[0] === 'm';
  const iv = [0, rest.includes('sus') ? 5 : minor ? 3 : 4, 7];
  if (rest.includes('add9')) iv.push(2);
  return { r: (r + 12) % 12, iv };
}
// 把和弦音排進 [lo, lo+12) 的音域
const voiceIn = (ch, lo) => ch.iv.map((x) => lo + ((((ch.r + x - lo) % 12) + 12) % 12)).sort((a, b) => a - b);
const bassOf = (ch) => 33 + ((ch.r - 9 + 12) % 12);   // 貝斯根音落在 A1～G#2
const shift = (list, k) => list.map(([m, d]) => [m == null ? null : m + k, d]);

// 樂譜：一格＝十六分音符。事件 { k: 樂器, m: 音高, n: 和弦音, d: 拍數, v: 力度, min/max: 強度閘, pz: 只在奇/偶輪, p: 0＝可丟棄 }
class Score {
  constructor(bars, bpm) {
    this.bpm = bpm;
    this.len = Math.round(bars * 16);
    this.ev = Array.from({ length: this.len }, () => []);
    this.loop = false; this.from = 0; this.tr = 0; this.tail = 2.5; this.flat = false; this.padFc = 1900;
    this.padA = 0.35;            // 弦樂墊起音秒數上限
    this.rv = null;              // 殘響送出量（null＝循環曲 0.22／短曲 0.3）
    this.mix = {};               // 聲部音量倍率
    this.fin = false;
  }
  at(beat, e) { const s = Math.round(beat * 4); if (s >= 0 && s < this.len) this.ev[s].push(e); return this; }
  mel(beat, k, list, x) {
    for (const [m, d] of list) { if (m != null) this.at(beat, { k, m, d, ...x }); beat += d; }
    return beat;
  }
}

// 主題（D 小調）：戰鬥曲 B 段的英雄主旋律；標題曲用同一動機的鋼琴版。
const THEME_B1 = [
  [77, 1.5], [74, 0.5], [77, 1], [79, 1], [81, 2], [79, 1], [76, 1], [76, 3], [72, 0.5], [74, 0.5], [74, 3], [null, 0.5], [69, 0.5],
  [74, 1], [77, 1], [82, 2], [81, 1.5], [79, 0.5], [76, 1], [72, 1], [74, 2], [76, 1], [77, 1], [74, 4],
];
const THEME_END = [[82, 2], [81, 1], [79, 1], [81, 2], [76, 1], [73, 1], [74, 1], [77, 1], [76, 1], [79, 1], [81, 4]];
const THEME_B2 = [
  [77, 1.5], [74, 0.5], [77, 1], [79, 1], [81, 1], [82, 0.5], [81, 0.5], [79, 1], [76, 1],
  [76, 1.5], [77, 0.5], [76, 1], [72, 1], [74, 3], [69, 0.5], [74, 0.5], ...THEME_END,
];
const THEME = [...THEME_B1, ...THEME_B2];
// A2 段的法國號呼應句
const HORN_A2 = [[62, 2], [67, 2], [69, 2], [64, 2], [65, 2], [69, 2], [67, 2], [64, 2], [65, 2], [62, 2], [62, 2], [70, 2], [69, 4], [69, 2], [73, 2]];
const BATTLE_CH = [
  'Dm', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Bb', 'A',
  'Gm', 'A', 'Dm', 'C', 'Bb', 'Gm', 'A', 'A',
  'Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'Dm', 'Dm',
  'Bb', 'C', 'Am', 'Dm', 'Gm', 'A', ['Bb', 'C'], 'A',
];
// 標題曲各聲部音量（固定混音，不隨強度變化）
// 聲部音量倍率（以離線渲染逐聲部獨奏量測後定出：旋律與和聲聲部要和鼓、貝斯站在同一個量級）
const MUS_MIX = { pad: 7, str: 8, lead: 5.2, stab: 4.5, horn: 4.5, choir: 5.6, ost: 4.5, ctr: 4.5, brass: 4.5, bass: 0.9, bell: 2, dr: 0.8 };
// 標題曲各聲部音量（固定混音，不隨強度變化）
const TITLE_MIX = { pad: 8, str: 9.5, choir: 5.9, bell: 3, pno: 3, sub: 1.1, dr: 1.2 };
const TITLE_CH = ['Dm', 'Bb', 'Gm', ['Asus', 'A'], 'Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'Dm', 'Dm', 'Gm', 'A', ['Bb', 'C'], 'A'];

// 戰鬥曲：2 小節前奏＋32 小節循環（A1 推進 → A2 法國號 → B1/B2 英雄主旋律）。
// o = { tr: 移調半音, bpm, dense: 鼓更密, ctr: 對位旋律, bright: 弦樂墊更亮, taiko: B 段太鼓, fin: 終章（太鼓、合唱、雙踏、銅管齊奏）, lift: 最後段升調半音 }
// 強度分層（事件的 min 閘＋_mLayers 的聲部音量）：
//   低＝弦樂墊＋貝斯＋弦樂唱主題（鼓只剩小節第一拍）｜中＝＋完整鼓組＋十六分撥弦頑固音型＋法國號｜高＝＋銅管重音與主旋律＋鈸＋合唱
function battleScore(o) {
  const S = new Score(34, o.bpm), IN = 2;
  const CH = BATTLE_CH.slice();
  if (o.lift) CH[23] = ['Dm', 'B'];                   // 升調前的樞紐：新調的屬和弦
  const ch = (i, q) => { const c = CH[i]; return chordOf(Array.isArray(c) ? c[q < 2 ? 0 : 1] : c); };
  const TH = o.lift ? [...THEME_B1.slice(0, -1), [74, 2], [75, 2], ...THEME_B2] : THEME;
  // ── 前奏：小鼓（終章＝太鼓＋定音鼓）滾奏漸強、貝斯八分推進
  const iCh = [chordOf('Dm'), chordOf('A')];
  for (let b = 0; b < 2; b++) {
    S.at(b * 4, { k: 'pad', n: [48 + iCh[b].r, ...voiceIn(iCh[b], 55)], d: 4, v: 0.8 });
    if (o.fin) S.at(b * 4, { k: 'choir', n: voiceIn(iCh[b], 60), d: 4, v: 0.6 + 0.3 * b });
    for (let e = 0; e < 8; e++) S.at(b * 4 + e / 2, { k: 'bass', m: bassOf(iCh[b]) + (e % 2 ? 12 : 0), d: 0.42, v: 0.45 + 0.035 * (b * 8 + e) });
  }
  for (let s = 0; s < 32; s++) {
    const q = s / 4;
    if (s % 4 === 0 && s < 28) S.at(q, { k: o.fin ? 'b' : 'k', v: 0.6 + 0.3 * s / 32 });
    if (!o.fin) {
      if (s >= 8 && s < 16 && s % 2 === 0) S.at(q, { k: 's', v: 0.25 + 0.2 * (s - 8) / 8 });
      if (s >= 16 && s < 28) S.at(q, { k: 's', v: 0.35 + 0.55 * (s - 16) / 12 });
    } else if (s >= 16 && s < 28) {
      if (s % 2 === 0) S.at(q, { k: 'b', v: 0.4 + 0.5 * (s - 16) / 12 });
      S.at(q, { k: 'ti', m: 38, v: 0.3 + 0.5 * (s - 16) / 12 });
    }
    if (s >= 28) S.at(q, { k: 't', m: [0, 0, 1, 2][s - 28], v: 0.9 });
  }
  S.at(6, { k: 'sw', d: 2, v: 0.8 });
  for (const q of [4, 5.5, 7]) S.at(q, { k: 'stab', n: voiceIn(iCh[1], 57), v: 0.8 });

  // ── 主循環
  let cp = 65;
  for (let i = 0; i < 32; i++) {
    const B = (IN + i) * 4, A = i < 16, split = Array.isArray(CH[i]);
    const c0 = ch(i, 0), c2 = ch(i, 2);
    const fill = i === 15 || i === 31, small = i === 7 || i === 23;
    // 和聲墊（B 段高強度加合唱；終章全程合唱）
    for (const [q, c, d] of split ? [[0, c0, 2], [2, c2, 2]] : [[0, c0, 4]]) {
      S.at(B + q, { k: 'pad', n: [48 + c.r, ...voiceIn(c, 55)], d, v: 0.8 });
      if (o.fin) S.at(B + q, { k: 'choir', n: voiceIn(c, 60), d, v: 0.9 });
      else if (!A) S.at(B + q, { k: 'choir', n: voiceIn(c, 60), d, v: 0.8, min: 0.55 });
    }
    // 銅管短音：A 段 3-3-2 重音，B 段落在和弦起點
    if (A) for (const [q, v] of [[0, 1], [1.5, 0.8], [3, 0.9]]) S.at(B + q, { k: 'stab', n: voiceIn(ch(i, q), 57), v, min: 0.35 });
    else {
      S.at(B, { k: 'stab', n: voiceIn(c0, 57), v: 0.9, min: 0.35 });
      if (split) S.at(B + 2, { k: 'stab', n: voiceIn(c2, 57), v: 0.85, min: 0.35 });
      else S.at(B + 2.5, { k: 'stab', n: voiceIn(c0, 57), v: 0.6, min: 0.55 });
    }
    // 貝斯：八分音符八度跳（A 段 3-3-2 重音），高強度加十六分推進
    for (let e = 0; e < 8; e++) {
      const q = e / 2, r = bassOf(ch(i, q));
      const oct = A ? e % 2 === 1 : e === 3 || e === 7;
      const acc = A ? e === 0 || e === 3 || e === 6 : e % 2 === 0;
      S.at(B + q, { k: 'bass', m: r + (oct ? 12 : 0), d: 0.42, v: acc ? 1 : 0.72 });
    }
    S.at(B + 3.75, { k: 'bass', m: bassOf(ch(i, 3.75)) + 12, d: 0.2, v: 0.6, min: 0.6 });
    if (A) S.at(B + 1.75, { k: 'bass', m: bassOf(c0), d: 0.2, v: 0.55, min: 0.7 });
    // 十六分撥弦頑固音型（中強度起）
    const pat = A ? [0, 7, 12, 7, -1, 7, 12, 7] : [0, -1, 7, 12, -2, 12, 7, -1];
    for (let s = 0; s < 16; s++) {
      const q = s / 4, c = ch(i, q), base = 50 + ((c.r - 2 + 12) % 12), x = pat[s % 8];
      S.at(B + q, { k: 'ost', m: base + (x === -1 ? c.iv[1] : x === -2 ? c.iv[1] + 12 : x), v: s % 4 === 0 ? 0.85 : 0.6, min: 0.2, p: 0 });
    }
    // 鼓：過門小節的後段讓給過門
    const cut = fill ? 2 : small ? 3 : 4, fmin = fill ? 0.3 : 0.55;
    const g = (q, e) => { if (q >= cut) e.max = fmin; S.at(B + q, e); };
    if (i % 8 === 0) S.at(B, { k: 'c', v: i === 16 ? 1 : 0.8, min: i === 0 || i === 16 ? 0.35 : 0.5 });
    if (i % 8 === 7) S.at(B + 2, { k: 'sw', d: 2, v: i === 15 || i === 31 ? 1 : 0.75, min: 0.45 });   // 段落交界前的反向鈸
    if (o.fin && !A && i % 2 === 0 && i % 8) S.at(B, { k: 'c', v: 0.55, min: 0.6 });
    const KA = [[0, 1], [1.5, 0.85], [2.5, 0.8, 0.3], [3.5, 0.6, 0.7], [0.75, 0.5, 0.85]];
    const KB = [[0, 1], [2, 0.9], [2.5, 0.7, 0.45], [0.75, 0.5, 0.75], [3.5, 0.5, 0.8]];
    for (const [q, v, mn] of A ? KA : KB) g(q, { k: 'k', v, min: mn || (q ? 0.18 : 0) });
    g(1, { k: 's', v: 0.9, min: 0.18 }); g(3, { k: 's', v: 0.95, min: 0.18 });
    g(1.75, { k: 's', v: 0.22, min: 0.7 }); g(3.75, { k: 's', v: 0.18, min: 0.8 });
    for (let e = 0; e < 8; e++) g(e / 2, { k: e === 7 && A && i % 2 ? 'o' : 'h', v: e % 2 ? 0.7 : 0.9, min: 0.22, p: 0 });
    for (let e = 0; e < 8; e++) g(e / 2 + 0.25, { k: 'h', v: 0.45, min: o.dense ? 0.4 : 0.6, p: 0 });
    if (fill) {
      const T = [0, 0, 1, 1, 2, 2];
      for (let s = 0; s < 6; s++) S.at(B + 2 + s / 4, { k: 't', m: T[s], v: 0.75 + 0.04 * s, min: 0.3 });
      S.at(B + 3.5, { k: 's', v: 0.9, min: 0.3 }); S.at(B + 3.75, { k: 's', v: 1, min: 0.3 });
      S.at(B + 3.5, { k: 'k', v: 0.9, min: 0.3 });
    } else if (small) {
      for (let s = 0; s < 4; s++) S.at(B + 3 + s / 4, { k: 's', v: 0.45 + 0.15 * s, min: 0.55 });
    }
    if (o.fin) {
      for (const q of A ? [0, 1.5, 3] : [0, 2]) S.at(B + q, { k: 'b', v: 0.8, min: 0.25 });
      if (i >= 24 && !fill) for (let e = 0; e < 4; e++) S.at(B + 3 + e / 4, { k: 'k', v: 0.55, min: 0.7 });
    } else if (o.taiko && !A && i % 4 === 0) S.at(B, { k: 'b', v: 0.6, min: 0.6 });
    // 對位旋律（第 4 關起）：B 段每兩拍一個和弦音，就近進行但每小節至少動一次
    if (o.ctr && !A) {
      for (const q of [0, 2]) {
        const c = ch(i, q), cand = [];
        for (let m = 60; m <= 74; m++) if (c.iv.some((x) => (((m - c.r - x) % 12) + 12) % 12 === 0)) cand.push(m);
        let best = null;
        for (const m of cand) if ((q === 0 || m !== cp) && (best == null || Math.abs(m - cp) < Math.abs(best - cp))) best = m;
        S.at(B + q, { k: 'ctr', m: best, d: 2, v: 0.8, min: 0.5 });
        cp = best;
      }
    }
    if (i === 8) S.mel(B, 'horn', HORN_A2, { min: 0.3 });
    if (i === 16) {
      S.mel(B, 'lead', TH, { min: o.fin ? 0.25 : 0.4 });          // 銅管主旋律（高強度）
      S.mel(B, 'str', shift(TH, -12));                             // 弦樂低八度（任何強度都唱主題）
      if (o.fin) S.mel(B, 'horn', shift(TH, -12), { v: 0.7, min: 0.5 });   // 終章：法國號齊奏
    }
  }
  // 終章：第 24～30 小節整段升調（動畫高潮式的直接轉調），第 31 小節回到原調屬和弦接回循環
  if (o.lift) for (let s = (IN + 24) * 16; s < (IN + 31) * 16; s++) for (const e of S.ev[s]) e.tx = o.lift;
  Object.assign(S, { loop: true, from: IN, tr: o.tr, padFc: o.bright ? 2600 : 1900, fin: !!o.fin, mix: o.fin ? { dr: 0.65 } : {} });
  return S;
}

// 標題曲：76 BPM、16 小節（約 50.5 秒）無縫循環。廢墟上的黃昏：寬廣弦樂墊＋低音，稀疏鋼琴分解和弦；
// 第 5 小節起主題動機——偶數輪由 FM 鐘琴獨唱，奇數輪換成大提琴（弦樂低八度）＋鋼琴；合唱第 9 小節進（奇數輪全程）。
function titleScore() {
  const S = new Score(16, 76);
  for (let i = 0; i < 16; i++) {
    const B = i * 4, sp = Array.isArray(TITLE_CH[i]);
    const ch = (q) => chordOf(sp ? TITLE_CH[i][q < 2 ? 0 : 1] : TITLE_CH[i]);
    for (const [q, d] of sp ? [[0, 2], [2, 2]] : [[0, 4]]) {
      const c = ch(q);
      S.at(B + q, { k: 'pad', n: [41 + ((c.r - 5 + 12) % 12), ...voiceIn(c, 53)], d, v: 0.9 });
      S.at(B + q, { k: 'sub', m: bassOf(c), d, v: 0.8 });
      if (i >= 8) S.at(B + q, { k: 'choir', n: voiceIn(c, 60), d, v: 0.8 });
      else if (i >= 2) S.at(B + q, { k: 'choir', n: voiceIn(c, 60), d, v: 0.55, pz: 1 });
    }
    // 稀疏鋼琴：每小節四個音的分解和弦
    for (const [q, x, v] of [[0, 0, 0.5], [1, 7, 0.34], [1.5, 12, 0.3], [2.5, -1, 0.32]]) {
      const c = ch(q), r = 43 + ((c.r - 7 + 12) % 12);
      S.at(B + q, { k: 'pno', m: r + (x < 0 ? 12 + c.iv[1] : x), d: 2, v });
    }
    if (i >= 12) for (const q of [0, 2.5]) S.at(B + q, { k: 'b', v: q ? 0.35 : 0.5, pz: 1 });
  }
  S.mel(16, 'bell', THEME_B1, { v: 0.8, pz: 0 });
  S.mel(48, 'bell', THEME_END, { v: 0.8, pz: 0 });
  S.mel(16, 'str', shift(THEME_B1, -12), { v: 1, pz: 1 });
  S.mel(48, 'str', shift(THEME_END, -12), { v: 1, pz: 1 });
  S.mel(16, 'pno', THEME_B1, { v: 0.6, pz: 1 });
  S.mel(48, 'pno', THEME_END, { v: 0.6, pz: 1 });
  S.at(60, { k: 'sw', d: 4, v: 0.5, pz: 1 });
  Object.assign(S, { loop: true, from: 0, flat: true, padFc: 1500, padA: 1.2, rv: 0.34, mix: TITLE_MIX });
  return S;
}

// 過關：D 大調銅管號角（約 5 秒），之後安靜。
function clearScore() {
  const S = new Score(2, 112);
  const mel = [[69, 0.5], [74, 1], [76, 0.5], [78, 0.75], [76, 0.25], [78, 0.5], [79, 0.5], [81, 3]];
  S.mel(0, 'lead', mel, { v: 0.95 });
  S.mel(0, 'horn', shift(mel, -12), { v: 0.75 });
  S.mel(0, 'str', shift(mel, -12), { v: 0.8 });
  for (const [q, n, d] of [[0, 'D', 2], [2, 'G', 1], [3, 'A', 1], [4, 'Dadd9', 3.5]]) {
    const c = chordOf(n);
    S.at(q, { k: 'brass', n: voiceIn(c, 55), d: d - 0.05, v: q === 4 ? 1 : 0.85 });
    S.at(q, { k: 'bass', m: bassOf(c), d: d - 0.1, v: 0.9 });
    S.at(q, { k: 'pad', n: voiceIn(c, 60), d, v: 0.7 });
  }
  S.at(4, { k: 'choir', n: voiceIn(chordOf('D'), 62), d: 3.5, v: 0.7 });
  for (const [q, k, v, m] of [[0, 'c', 0.9], [0, 'k', 1], [0, 'ti', 1, 38], [3, 'ti', 0.7, 45], [3.5, 'ti', 0.6, 45], [3.75, 'ti', 0.75, 45],
    [3.5, 's', 0.5], [3.75, 's', 0.7], [4, 'c', 1], [4, 'k', 1], [4, 'ti', 1, 38]]) S.at(q, { k, v, m });
  Object.assign(S, { tail: 3, flat: true });
  return S;
}

// 全破：定音鼓滾奏＋合唱漸強 → 主題號角 → ♭VI–♭VII–I 上行分解和弦 → 大終止和弦（約 10 秒）。
function allclearScore() {
  const S = new Score(4.5, 120);
  for (let s = 0; s < 16; s++) S.at(s / 4, { k: 'ti', m: 38, v: 0.2 + 0.7 * s / 15 });
  S.at(0, { k: 'choir', n: voiceIn(chordOf('Dsus'), 60), d: 3.9, v: 0.8 });
  S.at(0, { k: 'pad', n: voiceIn(chordOf('D'), 55), d: 4, v: 0.6 });
  S.at(2, { k: 'sw', d: 2, v: 0.9 });
  const mel = [[69, 0.5], [78, 1], [74, 0.5], [78, 0.5], [79, 1], [81, 1], [83, 1.5], [81, 0.5], [79, 1], [76, 1], [77, 1], [79, 1], [86, 3.5]];
  S.mel(3.5, 'lead', mel, { v: 1 });
  S.mel(3.5, 'horn', shift(mel, -12), { v: 0.75 });
  S.mel(3.5, 'str', shift(mel, -12), { v: 0.8 });
  for (const [q, n, d] of [[4, 'D', 2], [6, 'G', 1], [7, 'A', 1], [8, 'Bm', 2], [10, 'G', 1], [11, 'A', 1], [12, 'Bb', 1], [13, 'C', 1], [14, 'Dadd9', 3.5]]) {
    const c = chordOf(n);
    S.at(q, { k: 'brass', n: voiceIn(c, 55), d: d - 0.05, v: q >= 14 ? 1 : 0.85 });
    S.at(q, { k: 'bass', m: bassOf(c), d: d - 0.1, v: 0.9 });
    S.at(q, { k: 'choir', n: voiceIn(c, 60), d, v: 0.8 });
    S.at(q, { k: 'ti', m: bassOf(c) + (bassOf(c) < 36 ? 12 : 0), v: q >= 14 ? 1 : 0.7 });
  }
  const arp = [[12, [58, 62, 65, 70]], [13, [60, 64, 67, 72]], [14, [62, 66, 69, 74]]];
  for (const [q, ns] of arp) ns.forEach((m, j) => S.at(q + j / 4, { k: 'ost', m, v: 0.7 + 0.08 * j }));
  S.mel(14, 'bell', [[74, 0.5], [78, 0.5], [81, 0.5], [86, 2]], { v: 0.7 });
  for (const q of [4, 8, 14]) S.at(q, { k: 'c', v: q === 14 ? 1 : 0.8 });
  for (const q of [4, 6, 8, 10, 12, 13, 14]) S.at(q, { k: 'k', v: 0.95 });
  for (const q of [5, 7, 9, 11, 13.5, 13.75]) S.at(q, { k: 's', v: q > 13 ? 0.7 : 0.8 });
  S.at(14, { k: 'b', v: 1 });
  Object.assign(S, { tail: 3.5, flat: true });
  return S;
}

// 失敗：低音弦樂（大提琴＋低音提琴八度齊奏）B♭ → Gm → A → Dm 下行，定音鼓一擊後淡出（約 5 秒）。
function failScore() {
  const S = new Score(1.5, 80);
  for (const [q, n, d] of [[0, 'Bb', 1], [1, 'Gm', 1], [2, 'A', 1], [3, 'Dm', 2.5]]) {
    const c = chordOf(n);
    S.at(q, { k: 'pad', n: voiceIn(c, 50), d, v: 0.8 });
    S.at(q, { k: 'sub', m: bassOf(c), d, v: 0.7 });
  }
  const line = [[62, 1], [60, 1], [58, 0.5], [57, 0.5], [50, 2.5]];
  S.mel(0, 'str', line, { v: 1 });
  S.mel(0, 'str', shift(line, -12), { v: 0.9 });
  S.at(3, { k: 'choir', n: voiceIn(chordOf('Dm'), 57), d: 2.5, v: 0.5 });
  S.at(3, { k: 'b', v: 0.9 }); S.at(3, { k: 'ti', m: 38, v: 0.8 });
  Object.assign(S, { tail: 2.6, flat: true, padFc: 1000, padA: 0.5 });
  return S;
}

// 各關同一主題，調性與速度逐關微升：1 D 小調 148｜2 E♭ 小調 150｜3 C 小調 153｜4 E 小調 156｜5 F 小調 160
const STAGES = [
  { tr: 0, bpm: 148 },
  { tr: 1, bpm: 150, taiko: true },
  { tr: -2, bpm: 153, dense: true, taiko: true },
  { tr: 2, bpm: 156, dense: true, ctr: true, bright: true, taiko: true },
  { tr: 3, bpm: 160, dense: true, ctr: true, bright: true, taiko: true },
];
const SCORES = {
  title: titleScore,
  battle1: () => battleScore(STAGES[0]), battle2: () => battleScore(STAGES[1]), battle3: () => battleScore(STAGES[2]),
  battle4: () => battleScore(STAGES[3]), battle5: () => battleScore(STAGES[4]),
  // 終章：E 小調 170 BPM，第 24～30 小節升到 F♯ 小調
  final: () => battleScore({ tr: 2, bpm: 170, dense: true, ctr: true, bright: true, taiko: true, fin: true, lift: 2 }),
  clear: clearScore, allclear: allclearScore, fail: failScore,
};
const SCORE_CACHE = {};
const scoreOf = (key) => SCORE_CACHE[key] || (SCORE_CACHE[key] = SCORES[key]());

// ───────────────────────── 配樂：預先合成的樂器取樣 ─────────────────────────
// 鼓組、鋼琴、撥弦、銅管短音在第一次放音樂時用 JS 算好（一次、數十毫秒），之後每個音只是一個 BufferSource＋增益。

// 以遞迴式疊加一個指數衰減的正弦分音（比逐點 Math.sin 便宜）
function addSine(a, sr, f, g, tau, att) {
  const w = 2 * Math.PI * f / sr;
  if (w >= Math.PI * 0.95 || g <= 0) return;
  const c2 = 2 * Math.cos(w), r = Math.exp(-1 / (tau * sr)), na = Math.max(1, Math.floor((att || 0.002) * sr));
  let y1 = -Math.sin(w), y0 = 0, e = g;
  for (let i = 0; i < a.length; i++) {
    a[i] += y0 * e * (i < na ? i / na : 1);
    const y = c2 * y0 - y1; y1 = y0; y0 = y;
    e *= r;
    if (e < 1e-5) break;
  }
}
function normPeak(a, pk) {
  let m = 0;
  for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i]); if (x > m) m = x; }
  if (m > 0) { const k = pk / m; for (let i = 0; i < a.length; i++) a[i] *= k; }
  const f = Math.min(a.length, 64);      // 尾端淡出，避免截斷喀聲
  for (let i = 0; i < f; i++) a[a.length - 1 - i] *= i / f;
  return a;
}

function synthKit(sr) {
  const mk = (sec) => new Float32Array(Math.floor(sr * sec)), R = () => Math.random() * 2 - 1, K = {};
  // 大鼓：正弦下墜＋起音喀＋飽和
  { const a = mk(0.5); let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr; ph += 2 * Math.PI * (46 + 120 * Math.exp(-t / 0.03)) / sr;
      const x = Math.sin(ph) * (0.9 * Math.exp(-t / 0.22) + 0.1 * Math.exp(-t / 0.05)) + R() * 0.35 * Math.exp(-t / 0.004);
      a[i] = Math.tanh(1.6 * x);
    }
    K.kick = normPeak(a, 0.95); }
  // 小鼓：高通雜訊（響線）＋兩個鼓皮音
  { const a = mk(0.4); let hp = 0, xp = 0, lp = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr, w = R();
      hp = 0.86 * (hp + w - xp); xp = w; lp += 0.55 * (hp - lp);
      const tone = (Math.sin(2 * Math.PI * 185 * t) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.35) * Math.exp(-t / 0.045);
      a[i] = lp * 0.9 * Math.exp(-t / 0.12) + tone * 0.7;
    }
    K.snare = normPeak(a, 0.9); }
  // 鈸類：雜訊＋六支不諧和方波（金屬感）→ 兩級高通
  const metal = (sec, tau, hpA, pk) => {
    const a = mk(sec), fr = [2.0, 3.0, 4.16, 5.43, 6.79, 8.21].map((r) => r * 390), ph = fr.map(() => Math.random());
    let h1 = 0, x1 = 0, h2 = 0, x2 = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr; let sq = 0;
      for (let k = 0; k < 6; k++) sq += (ph[k] + fr[k] * t) % 1 < 0.5 ? 1 : -1;
      const x = R() * 0.8 + sq * 0.12;
      h1 = hpA * (h1 + x - x1); x1 = x; h2 = hpA * (h2 + h1 - x2); x2 = h1;
      a[i] = h2 * Math.exp(-t / tau) * Math.min(1, t / 0.001);
    }
    return normPeak(a, pk);
  };
  K.hat = metal(0.09, 0.02, 0.6, 0.8);
  K.ohat = metal(0.5, 0.15, 0.6, 0.8);
  K.crash = metal(2.4, 0.85, 0.75, 0.9);
  // 通鼓（音高用播放速率調）
  { const a = mk(0.7); let ph = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr; ph += 2 * Math.PI * 98 * (1 + 0.45 * Math.exp(-t / 0.06)) / sr;
      a[i] = Math.sin(ph) * Math.exp(-t / 0.28) + R() * 0.25 * Math.exp(-t / 0.015);
    }
    K.tom = normPeak(a, 0.9); }
  // 太鼓：超低頻鼓身＋鼓皮拍擊
  { const a = mk(1.6); let ph = 0, lp = 0;
    for (let i = 0; i < a.length; i++) {
      const t = i / sr; ph += 2 * Math.PI * (40 + 45 * Math.exp(-t / 0.05)) / sr; lp += 0.02 * (R() - lp);
      a[i] = Math.tanh(1.8 * (Math.sin(ph) * Math.exp(-t / 0.5) + lp * 6 * Math.exp(-t / 0.09)));
    }
    K.boom = normPeak(a, 0.95); }
  // 定音鼓（根音 D2）：鼓膜的不諧和模態＋鼓槌
  { const a = mk(2.0), f0 = mtof(38);
    for (const [r, g, tau] of [[1, 1, 1.3], [1.504, 0.7, 0.9], [1.742, 0.45, 0.7], [2.0, 0.4, 0.6], [2.245, 0.25, 0.5], [2.494, 0.18, 0.4]]) addSine(a, sr, f0 * r, g, tau, 0.003);
    let lp = 0; const n = Math.floor(sr * 0.03);
    for (let i = 0; i < n; i++) { lp += 0.2 * (R() - lp); a[i] += lp * 1.2 * (1 - i / n); }
    K.timp = normPeak(a, 0.9); }
  return K;
}

// 柔音鋼琴：非諧和分音（琴弦剛性）＋雙弦微走音＋毛氈琴槌
function synthPiano(sr, root, sec) {
  const a = new Float32Array(Math.floor(sr * sec)), f0 = mtof(root), B = 0.0004;
  for (let k = 1; k <= 16; k++) {
    const fk = f0 * k * Math.sqrt(1 + B * k * k);
    if (fk > 9000) break;
    const g = (k === 1 ? 1 : 0.75 / Math.pow(k, 1.1)) / (1 + Math.pow(fk / 2200, 2));
    const tau = (f0 < 200 ? 2.6 : 1.8) / (1 + 0.55 * (k - 1));
    addSine(a, sr, fk, g * 0.6, tau * 0.2, 0.003);
    addSine(a, sr, fk * 1.0007, g * 0.4, tau, 0.004);
  }
  let lp = 0; const n = Math.floor(sr * 0.02);
  for (let i = 0; i < n; i++) { lp += 0.15 * ((Math.random() * 2 - 1) - lp); a[i] += lp * 0.5 * (1 - i / n); }
  return normPeak(a, 0.8);
}
// 撥弦（根音 D3）：高次泛音衰減較快＝濾波器關閉的撥弦感
function synthPluck(sr) {
  const a = new Float32Array(Math.floor(sr * 0.6)), f0 = mtof(50);
  for (let k = 1; k <= 24 && f0 * k < 12000; k++) addSine(a, sr, f0 * k, 0.9 / k, 0.28 / (1 + 0.3 * (k - 1)), 0.0015);
  return normPeak(a, 0.8);
}
// 銅管短音（根音 A3）：兩組微走音鋸齒，高次泛音起音較慢、衰減較快（「叭」的濾波掃動）
function synthStab(sr) {
  const a = new Float32Array(Math.floor(sr * 0.65)), f0 = mtof(57);
  for (const det of [1, 1.004]) {
    for (let k = 1; k <= 24 && f0 * k < 12000; k++) {
      addSine(a, sr, f0 * det * k, 0.8 / k, 0.2 / (1 + 0.12 * (k - 1)), 0.006 + 0.0025 * k);
    }
  }
  return normPeak(a, 0.8);
}
// FM 鐘琴（根音 C5）：兩算子 FM，調變比 1:4（諧和、像音樂盒）＋少量 1:3.5（不諧和的鐘聲泛光），調變指數隨時間衰減
function synthBell(sr) {
  const n = Math.floor(sr * 3), a = new Float32Array(n), w = 2 * Math.PI * mtof(72) / sr;
  for (let i = 0; i < n; i++) {
    const t = i / sr, I = 0.25 + 2.4 * Math.exp(-t / 0.3), I2 = 1.2 * Math.exp(-t / 0.12);
    a[i] = (Math.sin(w * i + I * Math.sin(4 * w * i)) * Math.exp(-t / 1.1)
      + 0.3 * Math.sin(w * i + I2 * Math.sin(3.5 * w * i)) * Math.exp(-t / 0.35)) * Math.min(1, t / 0.0015);
  }
  return normPeak(a, 0.8);
}
// ⟨取樣合成結束⟩

// 一次性聲音：追蹤所有節點，最後一個音源結束時全部斷開，並釋放同時發聲數。
class Voice {
  constructor(au, dest, key) {
    this.au = au;
    this.key = key || 'voices';  // 'voices'＝音效；'mv'＝配樂（分開計數，互不搶名額）
    this.nodes = [];
    this.last = null;
    this.end = 0;
    this.out = this.add(au.ctx.createGain());
    if (dest) this.out.connect(dest);
    au[this.key]++;
  }
  add(n) { this.nodes.push(n); return n; }
  play(s, t0, t1, off) {
    this.add(s);
    if (off) s.start(t0, off); else s.start(t0);
    s.stop(t1);
    if (t1 >= this.end) { this.end = t1; this.last = s; }
    return s;
  }
  done() {
    const nodes = this.nodes, au = this.au, key = this.key;
    const fin = () => {
      for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已斷開 */ } }
      au[key] = Math.max(0, au[key] - 1);
    };
    if (this.last) this.last.onended = fin; else fin();
  }
}

// 持續音（循環）：統一管理節點；kill() 排程停止，結束後斷開。
class Rig {
  constructor(c) { this.c = c; this.nodes = []; this.srcs = []; this.dead = false; }
  add(n) { this.nodes.push(n); return n; }
  gain(v, dest) { const g = this.add(this.c.createGain()); g.gain.value = v; if (dest) g.connect(dest); return g; }
  filt(type, f, q, dest) {
    const b = this.add(this.c.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q;
    if (dest) b.connect(dest);
    return b;
  }
  pan(dest) {
    const c = this.c;
    const p = this.add(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    if (dest) p.connect(dest);
    return p;
  }
  osc(type, f, dest, t) {
    const o = this.add(this.c.createOscillator());
    o.type = type; o.frequency.value = f;
    if (dest) o.connect(dest);
    o.start(t); this.srcs.push(o);
    return o;
  }
  noise(buf, dest, t) {
    const s = this.add(this.c.createBufferSource());
    s.buffer = buf; s.loop = true;
    if (dest) s.connect(dest);
    s.start(t, Math.random() * (buf.duration - 0.5)); this.srcs.push(s);
    return s;
  }
  kill(at) {
    if (this.dead) return;
    this.dead = true;
    const nodes = this.nodes, srcs = this.srcs;
    for (const s of srcs) { try { s.stop(at); } catch (e) { /* 已停止 */ } }
    const fin = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* 已斷開 */ } } };
    if (srcs.length) srcs[srcs.length - 1].onended = fin; else fin();
  }
}

export class Audio {
  constructor() {
    this.ctx = null;             // 等使用者第一次操作才建立（瀏覽器自動播放規則）
    this._ready = false;
    this.vol = 0.8;
    this.paused = false;
    this.voices = 0;
    this.lastError = null;
    this.lis = { x: 0, y: 0, z: 0 };
    this.fx = 0; this.fz = -1;   // 水平前方
    this.rx = 1; this.rz = 0;    // 水平右方＝cross(fwd, up)
    this.bus = null;
    this.bl = null;              // 自機推進器循環
    this.sb = null;              // 光劍嗡鳴循環
    this.dz = null;              // 低裝甲警報循環
    this.eb = new Map();         // 敵機推進器循環（id → Rig）
    this._dangerWant = false;
    this._servoT = -9;
    this.lockNext = 0; this.lockLast = -9; this.lockAlt = 0;
    this._pauseTok = 0;
    // 配樂
    this.mv = 0;                 // 配樂同時發聲數
    this.musVol = 0.7;           // setMusicVolume 的值
    this.musI = null;            // 平滑後的戰鬥強度（第一次 setIntensity 直接採用）
    this.musIT = 0.5;            // 強度目標
    this._musKey = null;         // 目前曲目的識別鍵
    this._musWant = null;        // 解鎖前要求的曲目
    this.mtr = null;             // 目前曲目
    this.mb = null;              // 預先合成的樂器取樣
    this._mIv = 0;               // 排程計時器
    this._live = false;
    this._duckT = 0; this._duckA = 1;
    this.vl = new Map();         // 載具引擎循環（id → Rig）
  }

  get ready() { return this._ready; }

  // ───────────────────────── 啟動與全域控制 ─────────────────────────

  unlock() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      let ctx;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      this._attach(ctx, true);
    }
    if (this.ctx.state === 'suspended' && !this.paused && this.ctx.resume) {
      const p = this.ctx.resume();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // 接上任一 BaseAudioContext（測試頁可接 OfflineAudioContext 量音量）。
  _attach(ctx, live) {
    this.ctx = ctx;
    this._makeNoise();
    this._makeCurves();
    this._buildGraph();
    this._ready = true;
    this._live = !!live;
    if (live) {
      this._startAmbience();
      if (this._dangerWant) this.setDanger(true);
    }
    if (this._musWant) { const k = this._musWant; this._musWant = null; this._musStart(k); }
  }

  setVolume(v) {
    this.vol = clamp(num(v, this.vol), 0, 1);
    if (this._ready) this.masterG.gain.setTargetAtTime(this.vol, this.ctx.currentTime, 0.04);
  }

  setPaused(on) {
    on = !!on;
    if (on === this.paused) return;
    this.paused = on;
    if (!this._ready) return;
    const c = this.ctx, now = c.currentTime, g = this.pauseG.gain, tok = ++this._pauseTok;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    if (on) {
      // 先淡出，再暫停整個音訊時鐘（循環音一起凍結）
      g.linearRampToValueAtTime(0, now + 0.25);
      setTimeout(() => {
        if (this._pauseTok === tok && this.paused && c.suspend) c.suspend().catch(() => {});
      }, 320);
    } else {
      if (c.state === 'suspended' && c.resume) c.resume().catch(() => {});
      g.linearRampToValueAtTime(1, now + 0.3);
    }
  }

  setListener(pos, fwd) {
    const L = this.lis;
    if (pos) { L.x = num(pos.x, L.x); L.y = num(pos.y, L.y); L.z = num(pos.z, L.z); }
    if (fwd) {
      const fx = num(fwd.x, 0), fz = num(fwd.z, 0), l = Math.sqrt(fx * fx + fz * fz);
      if (l > 1e-4) { this.fx = fx / l; this.fz = fz / l; this.rx = -this.fz; this.rz = this.fx; }
    }
    if (this._ok()) this._tick();
  }

  // ───────────────────────── 自機（座艙內，不定位） ─────────────────────────

  // 腳步：鋼腳掌砸混凝土。三層＝次低頻下墜／中頻本體（過飽和）＋鋼板撞擊／觸地喀＋混凝土碎粒；之後液壓洩氣與伺服回正
  footstep(strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 1.6);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, p = rnd(0.93, 1.07);
    const body = this._sat(v, o, 1.8, 0.42);
    // ① 次低頻：座椅感受到的「咚」
    this._thump(v, o, t, rnd(55, 66), rnd(28, 34), 0.3 * s, 0.45 + 0.15 * s, 1.8);
    // ② 中頻本體＋鋼板撞擊
    this._N(v, body, { t, b: 'b', a: 0.003, d: 0.34, g: 0.5 * s, ft: 'lowpass', f: 260, f1: 90, gl: 0.3, q: 0.9 });
    this._T(v, body, { t, f: 110 * p, f1: 48, gl: 0.12, a: 0.002, d: 0.22, g: 0.12 * s });
    this._clank(v, o, t + 0.004, rnd(170, 230) * p, 0.06 * s, rnd(0.3, 0.5), PLATE);
    // ③ 觸地瞬態＋混凝土碎粒
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.2 * s, ft: 'bandpass', f: rnd(280, 400), q: 1.2 });
    this._gran(v, this.bus.arm, { t: t + 0.005, dur: 0.12 + 0.06 * s, b: 'w', ft: 'bandpass', fr: [1400, 3800], q: 2, g: 0.035 * s, gd: [0.002, 0.008], gap: [0.002, 0.014], fade: true });
    // 懸吊回彈
    this._thump(v, o, t + rnd(0.08, 0.11), rnd(44, 52), 30, 0.1 * s, 0.25, 1.2);
    // 液壓洩氣「噓」＋伺服馬達回正的嗚聲
    this._N(v, o, { t: t + rnd(0.1, 0.16), b: 'w', a: 0.015, h: 0.03, d: 0.22, g: 0.03 + 0.02 * s, ft: 'bandpass', f: rnd(2400, 3300), f1: 1500, q: 1.4 });
    const sw = rnd(170, 210);
    this._T(v, o, { t: t + rnd(0.14, 0.2), type: 'sawtooth', f: sw, f1: sw * 1.6, gl: 0.16, a: 0.03, h: 0.05, d: 0.12, g: 0.02 + 0.012 * s, ft: 'bandpass', ff: 700, ff1: 1300, fgl: 0.2, fq: 3 });
    if (Math.random() < 0.45) this._creak(v, o, t + rnd(0.06, 0.14), rnd(0.2, 0.35), 0.03 * s);
    v.done();
  }

  servo(amount) {
    if (!this._ok()) return;
    const now = this.ctx.currentTime;
    if (now - this._servoT < 0.12) return;
    this._servoT = now;
    const a = clamp(num(amount, 0.5), 0, 1);
    const v = this._voice(this.bus.hull, 1); if (!v) return;
    const t = this._now(), o = v.out, dur = 0.14 + 0.28 * a;
    const f0 = rnd(130, 170) * (1 + 0.5 * a), g = 0.05 + 0.1 * a;
    // 馬達嗚聲：音高先衝上去再回落
    const m = this._T(v, o, { t, type: 'sawtooth', f: f0, a: 0.03, h: dur * 0.5, d: dur * 0.6, g, ft: 'bandpass', ff: 900, ff1: 1700, fgl: dur * 0.6, fq: 4 });
    m.frequency.exponentialRampToValueAtTime(f0 * rnd(1.4, 1.8), t + dur * 0.6);
    m.frequency.exponentialRampToValueAtTime(f0 * 1.1, t + dur * 1.1);
    // 齒輪低嗡
    this._T(v, o, { t, type: 'square', f: f0 * 0.5, a: 0.03, h: dur * 0.5, d: dur * 0.5, g: g * 0.5, ft: 'lowpass', ff: 420, fq: 1 });
    // 液壓嘶聲
    this._N(v, o, { t, b: 'w', a: 0.02, d: dur, g: 0.025 + 0.05 * a, ft: 'bandpass', f: rnd(2300, 3000), q: 2 });
    // 到位「喀」
    this._clank(v, o, t + dur * 0.9, rnd(300, 420), 0.03 + 0.05 * a, 0.2);
    v.done();
  }

  boost(level) {
    if (!this._ok()) return;
    this._boostSet(clamp(num(level, 0), 0, 1));
  }

  // 急速推進：短促猛烈的爆發。次低頻衝擊／低頻氣團（過飽和）＋噴流轟聲掃頻／點火裂擊＋左右散開的噴流尾
  quickBoost() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, p = rnd(0.92, 1.08), A = this.bus.arm;
    const body = this._sat(v, o, 2.5, 0.5);
    // ① 次低頻衝擊
    this._thump(v, o, t, 95 * p, 30, 0.5, 0.55, 2);
    // ② 爆發本體
    this._N(v, body, { t, b: 'b', a: 0.006, d: 0.6, g: 0.7, ft: 'lowpass', f: 600, f1: 110, q: 0.8 });
    this._N(v, o, { t, b: 'p', a: 0.003, h: 0.05, d: 0.5, g: 0.6, ft: 'bandpass', f: 2600 * p, f1: 420, gl: 0.4, q: 0.8 });
    // ③ 點火裂擊、閥門金屬喀、左右散開的噴流尾
    this._N(v, A, { t, b: 'w', a: 0.0006, d: 0.05, g: 0.3, ft: 'highpass', f: 2000 });
    this._clank(v, o, t + 0.01, 520 * p, 0.04, 0.15);
    for (const sd of [-0.7, 0.7]) this._N(v, this._pan(v, sd, A), { t: t + 0.03, b: 'w', a: 0.01, d: 0.45, g: 0.07, ft: 'bandpass', f: 3200 * p, f1: 900, gl: 0.45, q: 0.9 });
    this._duck(2.5, t, 0.12);
    v.done();
  }

  jump() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out;
    // 液壓頂升
    this._T(v, o, { t, type: 'sawtooth', f: rnd(66, 76), f1: 44, gl: 0.25, a: 0.02, d: 0.35, g: 0.2, ft: 'lowpass', ff: 320, fq: 1.5 });
    this._thump(v, o, t, 62, 30, 0.45, 0.4, 1.5);
    this._N(v, o, { t, b: 'w', a: 0.02, d: 0.35, g: 0.07, ft: 'bandpass', f: 1900, f1: 900, q: 1.5 });
    // 推進器點火膨脹
    const ti = t + 0.05;
    this._N(v, o, { t: ti, b: 'w', a: 0.001, d: 0.04, g: 0.25, ft: 'highpass', f: 2000 });
    this._N(v, o, { t: ti, b: 'p', a: 0.08, h: 0.15, d: 0.7, g: 0.6, ft: 'bandpass', f: 350, f1: 1400, gl: 0.3, q: 0.9 });
    this._N(v, o, { t: ti, b: 'b', a: 0.06, h: 0.1, d: 0.8, g: 0.55, ft: 'lowpass', f: 260, q: 0.8 });
    v.done();
  }

  // 著陸：巨大的砸地。次低頻長下墜／低頻本體（過飽和）＋深沉鋼板「匡」／觸地爆裂＋混凝土碎塊與碎石落下；之後懸吊嘶聲與結構呻吟
  land(strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 2.2), k = Math.min(s, 1.4);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, A = this.bus.arm, p = rnd(0.94, 1.06);
    const body = this._sat(v, o, 2.2, 0.55);
    // ① 次低頻
    this._thump(v, o, t, rnd(72, 82), 22, 0.48 * k, 0.7 + 0.35 * s, 2.2);
    // ② 本體＋鋼板
    this._T(v, body, { t, f: 125 * p, f1: 45, gl: 0.2, a: 0.002, d: 0.3, g: 0.16 * k });
    this._N(v, body, { t, b: 'b', a: 0.003, d: 0.6 + 0.25 * s, g: 0.55 * k, ft: 'lowpass', f: 340, f1: 90, q: 0.9 });
    this._clank(v, o, t + 0.01, rnd(105, 125), 0.12 * k, 0.8, PLATE);
    this._clank(v, o, t + rnd(0.07, 0.11), rnd(240, 290), 0.05 * k, 0.35);
    // ③ 觸地爆裂＋碎塊飛濺＋碎石落下
    this._N(v, A, { t, b: 'p', a: 0.001, d: 0.1, g: 0.2 * k, ft: 'bandpass', f: 600 * p, q: 0.9 });
    this._gran(v, A, { t: t + 0.01, dur: 0.35 + 0.15 * s, b: 'w', ft: 'bandpass', fr: [900, 3200], q: 1.5, g: 0.06 * k, gd: [0.003, 0.012], gap: [0.002, 0.015], fade: true });
    this._gran(v, A, { t: t + 0.25, dur: 0.5 + 0.2 * s, b: 'p', ft: 'bandpass', fr: [1800, 4200], q: 2, g: 0.03 * k, gd: [0.004, 0.01], gap: [0.02, 0.07], fade: true });
    // 懸吊壓縮嘶聲
    this._N(v, o, { t: t + 0.04, b: 'w', a: 0.03, h: 0.1, d: 0.5, g: 0.08 * k, ft: 'bandpass', f: 2600, f1: 1300, q: 1.2 });
    // 金屬呻吟（結構受力）
    const gf = rnd(48, 60);
    const gr = this._T(v, o, { t: t + 0.12, type: 'sawtooth', f: gf, a: 0.08, h: 0.3, d: 0.6, g: 0.1 * k, ft: 'bandpass', ff: 520, ff1: 300, fgl: 0.9, fq: 6 });
    gr.frequency.linearRampToValueAtTime(gf * 1.25, t + 0.4);
    gr.frequency.linearRampToValueAtTime(gf * 0.8, t + 1.0);
    if (s >= 0.7) this._duck(1.5 + 2.5 * Math.min(1, s / 1.5), t, 0.15);
    v.done();
  }

  // 光束步槍「BZZ-KRAAANG」：短促上升充能嗚聲 → 起音裂擊 → 走音失真鋸齒爆發（音高下墜）＋電漿 FM 掃頻＋次低頻重拳
  // → 滋滋電流 → 金屬餘振與長回音尾巴（左右不同長度的回音＋城市殘響）
  beam() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const c = this.ctx, t = this._now(), o = v.out, p = rnd(0.94, 1.06), tb = t + 0.028;
    const tail = this._sub(v, o, this.echoIn, 0.6);          // 送回音的層
    const body = this._sat(v, tail, 3, 0.3);                  // 失真爆發
    // 充能嗚聲（BZZ）
    this._T(v, o, { t, type: 'sawtooth', f: 700 * p, f1: 3400 * p, gl: 0.045, a: 0.004, h: 0.02, d: 0.03, g: 0.05, ft: 'bandpass', ff: 2200, fq: 1.2 });
    this._N(v, o, { t, b: 'w', a: 0.01, h: 0.015, d: 0.02, g: 0.12, ft: 'bandpass', f: 3000, q: 2, am: 110, amd: 0.7 });
    // ③ 亮部：起音裂擊
    this._N(v, o, { t: tb, b: 'w', a: 0.0004, d: 0.035, g: 0.5, ft: 'highpass', f: 2800 });
    this._T(v, o, { t: tb, type: 'square', f: 3600 * p, f1: 1300, gl: 0.025, a: 0.0005, d: 0.035, g: 0.07 });
    // ② 中頻本體（KRAAANG）：三支走音鋸齒一起下墜，經失真與逐漸關閉的低通
    for (const [m, det] of [[1, -16], [1, 14], [2, 5]]) {
      this._T(v, body, { t: tb, type: 'sawtooth', f: 170 * m * p, f1: 62 * m * p, gl: 0.4, det, a: 0.002, h: 0.04, d: 0.38, g: 0.16, ft: 'lowpass', ff: 6000, ff1: 700, fgl: 0.4, fq: 1.2 });
    }
    // 電漿掃頻：FM 鋸齒由高往低掃（光束槍的招牌聲）
    const car = this._T(v, o, { t: tb, type: 'sawtooth', f: 2400 * p, f1: 130, gl: 0.24, a: 0.001, h: 0.02, d: 0.3, g: 0.12, ft: 'lowpass', ff: 7000, ff1: 900, fgl: 0.3, fq: 2 });
    const mod = c.createOscillator();
    mod.frequency.setValueAtTime(930 * p, tb);
    mod.frequency.exponentialRampToValueAtTime(55, tb + 0.25);
    const md = v.add(c.createGain());
    md.gain.setValueAtTime(1400, tb);
    md.gain.exponentialRampToValueAtTime(40, tb + 0.25);
    mod.connect(md); md.connect(car.frequency);
    v.play(mod, tb, tb + 0.36);
    // ① 次低頻重拳（座艙也感受到後座）
    this._thump(v, o, tb, 120 * p, 36, 0.55, 0.38, 2);
    this._thump(v, this.bus.hull, tb, 70, 34, 0.2, 0.25, 1.4);
    // 滋滋電流
    this._N(v, o, { t: tb, b: 'w', a: 0.002, h: 0.05, d: 0.32, g: 0.16, ft: 'highpass', f: 4200, am: rnd(70, 95), amd: 0.5 });
    // 金屬餘振（ANG）＋粉紅雜訊尾，送進回音
    this._N(v, tail, { t: tb, b: 'p', a: 0.002, d: 0.6, g: 0.3, ft: 'bandpass', f: 1300 * p, f1: 380, gl: 0.6, q: 0.9 });
    for (const [f, g] of [[430, 0.035], [652, 0.025], [1190, 0.012]]) this._T(v, tail, { t: tb, f: f * p, a: 0.002, d: 0.75, g });
    this._T(v, o, { t: tb + 0.01, f: 5400 * p, f1: 2600, a: 0.004, d: 0.35, g: 0.015 });
    v.done();
  }

  // 飛彈發射（肩部莢艙，左右交替）：管口「砰」（次低頻＋爆裂）→ 火箭嘶吼：由肩膀掃向前方中央、越飛越遠越悶，推進劑劈啪
  missileLaunch(i) {
    if (!this._ok()) return;
    const n = Math.abs(num(i, 0) | 0);
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now(), side = n % 2 ? 1 : -1;
    const p = (1 + 0.045 * ((n % 4) - 1.5)) * rnd(0.97, 1.03);
    const o = this._pan(v, side * rnd(0.25, 0.4), v.out);
    // ① 次低頻＋② 發射蓋爆裂＋③ 裂擊
    this._thump(v, o, t, 105 * p, 40, 0.48, 0.25, 2);
    this._N(v, this._sat(v, o, 2, 0.5), { t, b: 'p', a: 0.001, d: 0.08, g: 0.6, ft: 'bandpass', f: 1100 * p, q: 1.3 });
    this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.03, g: 0.3, ft: 'highpass', f: 2500 });
    // 火箭嘶吼：聲像掃動＋距離低通逐漸關閉＋帶通下滑（遠去的都卜勒）
    const rp = this._pan(v, side * 0.45, v.out);
    if (rp.pan) { rp.pan.setValueAtTime(side * 0.45, t); rp.pan.linearRampToValueAtTime(side * rnd(-0.2, 0.1), t + 1.1); }
    const rl = this._filt(v, 'lowpass', 9000, 0.6); rl.connect(rp);
    rl.frequency.setValueAtTime(9000, t + 0.05);
    rl.frequency.exponentialRampToValueAtTime(1100, t + 1.25);
    const tr = t + 0.02;
    this._N(v, rl, { t: tr, b: 'w', a: 0.02, h: 0.12, d: 1.0, g: 0.3, ft: 'bandpass', f: 1600 * p, f1: 750 * p, gl: 1.1, q: 0.8 });
    this._N(v, rl, { t: tr, b: 'p', a: 0.015, h: 0.1, d: 0.9, g: 0.42, ft: 'lowpass', f: 1400, f1: 320, q: 0.7 });
    this._gran(v, rl, { t: tr + 0.01, dur: 0.6, b: 'w', ft: 'bandpass', fr: [2000, 5000], q: 1.5, g: 0.07, gd: [0.002, 0.006], gap: [0.003, 0.015], fade: true });
    v.done();
  }

  reload() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now(), o = v.out, H = this.bus.hull;
    // 退出彈匣
    this._clank(v, o, t, rnd(850, 950), 0.1, 0.12, [1, 1.8, 3.1, 4.7]);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.03, g: 0.18, ft: 'bandpass', f: 2500, q: 2 });
    this._thump(v, H, t + 0.02, 180, 90, 0.12, 0.1, 1);
    // 滑軌摩擦
    this._N(v, o, { t: t + 0.08, b: 'p', a: 0.02, d: 0.15, g: 0.08, ft: 'bandpass', f: 1400, f1: 800, q: 3 });
    // 插入新彈匣
    const ti = t + 0.38;
    this._clank(v, o, ti, rnd(650, 750), 0.12, 0.15);
    this._thump(v, H, ti, 150, 80, 0.16, 0.12, 1);
    // 充能嗚聲
    const tc = t + 0.46;
    this._T(v, o, { t: tc, type: 'sawtooth', f: 180, f1: 1600, gl: 0.55, a: 0.1, h: 0.35, d: 0.12, g: 0.04, ft: 'lowpass', ff: 3000 });
    this._T(v, o, { t: tc, f: 360, f1: 3200, gl: 0.55, a: 0.1, h: 0.35, d: 0.12, g: 0.03 });
    // 座艙就緒提示
    this._T(v, this.bus.cab, { t: t + 1.02, type: 'triangle', f: 2350, a: 0.002, d: 0.14, g: 0.06 });
    v.done();
  }

  saberOn() {
    if (!this._ready || (this.sb && !this.sb.dead)) return;
    const c = this.ctx, t = this._now(), A = this.bus.arm;
    // 點燃：兩支走音鋸齒一起往上掃＋嘶聲＋次低頻「嗡」地一聲
    const v = this._voice(A, 2);
    if (v) {
      const body = this._sat(v, v.out, 2, 0.4);
      for (const det of [-12, 10]) this._T(v, body, { t, type: 'sawtooth', f: 70, f1: 520, gl: 0.16, det, a: 0.005, d: 0.35, g: 0.12, ft: 'lowpass', ff: 2200, fq: 1.5 });
      this._N(v, v.out, { t, b: 'w', a: 0.003, d: 0.25, g: 0.13, ft: 'bandpass', f: 1200, f1: 3000, q: 2 });
      this._thump(v, v.out, t, 140, 50, 0.25, 0.25, 1.5);
      v.done();
    }
    // 持續嗡鳴：兩支略微走音的鋸齒（拍頻）＋五度鋸齒＋八度正弦＋次八度正弦（厚度）＋電嘶，緩慢起伏
    const R = new Rig(c);
    const out = R.gain(0, A);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.09, t + 0.25);
    const lp = R.filt('lowpass', 1100, 3, out);
    const o1 = R.osc('sawtooth', 92, lp, t);
    const o2 = R.osc('sawtooth', 93.4, lp, t);
    const o3 = R.osc('sawtooth', 138.3, R.gain(0.3, lp), t);
    R.osc('sine', 184, R.gain(0.5, out), t);
    R.osc('sine', 46, R.gain(0.45, out), t);
    const lfo = R.osc('sine', 6.3, null, t);
    const lg = R.gain(2.2);
    lfo.connect(lg); lg.connect(o1.frequency); lg.connect(o2.frequency);
    const th = R.osc('sine', 0.9, null, t), tg = R.gain(0.012);
    th.connect(tg); tg.connect(out.gain);
    R.noise(this.nb.w, R.filt('bandpass', 3200, 3, R.gain(0.25, out)), t);
    R.out = out; R.o1 = o1; R.o2 = o2; R.o3 = o3;
    this.sb = R;
  }

  saberOff() {
    if (!this._ready || !this.sb) return;
    const R = this.sb, t = this._now(), A = this.bus.arm;
    this.sb = null;
    const g = R.out.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + 0.25);
    R.o1.frequency.setValueAtTime(92, t); R.o1.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    R.o2.frequency.setValueAtTime(93.4, t); R.o2.frequency.exponentialRampToValueAtTime(41, t + 0.25);
    R.kill(t + 0.32);
    // 熄滅音
    const v = this._voice(A, 2); if (!v) return;
    this._T(v, v.out, { t, type: 'sawtooth', f: 400, f1: 60, gl: 0.25, a: 0.004, d: 0.3, g: 0.1, ft: 'lowpass', ff: 1500 });
    this._N(v, v.out, { t, b: 'w', a: 0.003, d: 0.2, g: 0.07, ft: 'bandpass', f: 2500, f1: 600, q: 2 });
    v.done();
  }

  // 揮劍：風切「咻」＋光刃嗡鳴的都卜勒（音高先衝上再掉下）＋低頻氣流，聲像由左掃到右
  saberSwing() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.arm, 2); if (!v) return;
    const t = this._now(), p = rnd(0.9, 1.1), dir = Math.random() < 0.5 ? 1 : -1;
    const o = this._pan(v, -0.6 * dir, v.out);
    if (o.pan) { o.pan.setValueAtTime(-0.6 * dir, t); o.pan.linearRampToValueAtTime(0.6 * dir, t + 0.32); }
    // 風切
    this._N(v, o, { t, b: 'p', a: 0.07, h: 0.03, d: 0.3, g: 0.45, ft: 'bandpass', f: 350 * p, f1: 1800 * p, gl: 0.12, q: 2.2 });
    this._N(v, o, { t, b: 'w', a: 0.06, d: 0.28, g: 0.07, ft: 'bandpass', f: 2500 * p, f1: 5000, gl: 0.1, q: 3 });
    // 低頻氣流（重量感）
    this._N(v, o, { t, b: 'b', a: 0.08, d: 0.3, g: 0.35, ft: 'lowpass', f: 320, q: 0.8 });
    // 光刃嗡鳴的都卜勒：兩支走音鋸齒
    for (const det of [-10, 10]) {
      const h = this._T(v, o, { t, type: 'sawtooth', f: 105 * p, f1: 290 * p, gl: 0.12, det, a: 0.05, h: 0.05, d: 0.3, g: 0.06, ft: 'lowpass', ff: 1100, fq: 2.5 });
      h.frequency.exponentialRampToValueAtTime(80 * p, t + 0.42);
    }
    // 若光劍開著：嗡鳴本體也彎音
    if (this.sb) {
      for (const os of [this.sb.o1, this.sb.o2, this.sb.o3]) {
        if (!os) continue;
        const dt = os.detune;
        dt.cancelScheduledValues(t);
        dt.setValueAtTime(0, t);
        dt.linearRampToValueAtTime(800, t + 0.12);
        dt.linearRampToValueAtTime(-300, t + 0.3);
        dt.linearRampToValueAtTime(0, t + 0.45);
      }
    }
    v.done();
  }

  lockTick() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const t = this._now(), o = v.out;
    this._T(v, o, { t, f: 2100, f1: 2900, gl: 0.03, a: 0.002, d: 0.08, g: 0.15 });
    this._T(v, o, { t, f: 4200, f1: 5800, gl: 0.03, a: 0.002, d: 0.05, g: 0.04 });
    v.done();
  }

  lockMulti(n) {
    if (!this._ok()) return;
    const k = clamp(num(n, 1) | 0, 1, 8);
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const t = this._now(), o = v.out, f = 780 * Math.pow(1.19, k - 1);
    this._T(v, o, { t, type: 'triangle', f, f1: f * 1.12, gl: 0.05, a: 0.002, h: 0.03, d: 0.07, g: 0.11 });
    this._T(v, o, { t, type: 'square', f: f * 2, a: 0.002, d: 0.05, g: 0.02, ft: 'lowpass', ff: 4000 });
    if (k >= 6) this._T(v, o, { t: t + 0.09, f: f * 1.5, a: 0.003, h: 0.05, d: 0.12, g: 0.09 });   // 滿鎖定
    v.done();
  }

  hitmarker() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.cab, 1); if (!v) return;
    const t = this._now(), o = v.out;
    this._N(v, o, { t, b: 'w', a: 0.0003, d: 0.02, g: 0.42, ft: 'highpass', f: 4000 });
    this._T(v, o, { t, f: rnd(3300, 3500), a: 0.0005, d: 0.04, g: 0.1 });
    this._T(v, o, { t, type: 'triangle', f: 1700, a: 0.0005, d: 0.03, g: 0.055 });
    v.done();
  }

  // 被擊中：次低頻悶「咚」／厚裝甲板「鏘」（過飽和、長金屬餘振）／座艙儀表與螺絲亂響＋電路爆裂；重傷（strength ≥ 0.9）加兩聲短促警示嗶
  hurt(strength, dir) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.1, 2), k = Math.min(s, 1.4), pd = clamp(num(dir, 0), -1, 1);
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), p = rnd(0.92, 1.08);
    const o = this._pan(v, pd * 0.75, v.out);            // 結構傳來的撞擊
    const oc = this._pan(v, pd * 0.6, this.bus.cab);     // 座艙內的震動雜音
    const oa = this._pan(v, pd * 0.7, this.bus.arm);     // 亮部（不經機體低通）
    const body = this._sat(v, o, 2.2, 0.5);
    // ① 次低頻＋悶響
    this._thump(v, o, t, 95 * p, 34, 0.48 * k, 0.4, 1.8);
    this._N(v, body, { t, b: 'b', a: 0.002, d: 0.4, g: 0.5 * k, ft: 'lowpass', f: 320, q: 0.8 });
    // ② 金屬「鏘」
    this._clank(v, body, t, rnd(240, 380) * p, 0.24 * k, 0.9, PLATE);
    this._clank(v, oa, t + 0.004, rnd(620, 900) * p, 0.07 * k, 0.55);
    this._N(v, oa, { t, b: 'p', a: 0.0008, d: 0.12, g: 0.35 * k, ft: 'bandpass', f: 1500 * p, q: 0.9 });
    // ③ 座艙震動：儀表、螺絲、面板亂響＋電路爆裂
    this._gran(v, oc, { t: t + 0.01, dur: 0.3 + 0.2 * s, b: 'w', ft: 'bandpass', fr: [2000, 4500], q: 6, g: 0.1 * k, gd: [0.006, 0.02], gap: [0.004, 0.03], fade: true });
    this._gran(v, oc, { t: t + 0.03, dur: 0.4, b: 'w', ft: 'highpass', f: 3000, q: 0.7, g: 0.07 * k, gd: [0.002, 0.008], gap: [0.01, 0.06], fade: true });
    if (s >= 0.9) {
      for (const dt of [0.14, 0.27]) this._T(v, this.bus.cab, { t: t + dt, type: 'square', f: 1450, f1: 1750, gl: 0.06, a: 0.002, h: 0.05, d: 0.03, g: 0.03, ft: 'lowpass', ff: 3500 });
    }
    this._duck(2 + 2.5 * k, t, 0.1 + 0.1 * k);
    v.done();
  }

  alert(kind) {
    if (!this._ok()) return;
    const t = this._now();
    if (kind === 'lock') { this._lockBeep(t, false); this._lockBeep(t + 0.16, false); }
    else if (kind === 'missile') { for (let i = 0; i < 3; i++) this._lockBeep(t + i * 0.1, true); this._duck(2, t, 0.3); }
    else if (kind === 'danger') {
      this._duck(4, t, 0.9);
      const v = this._voice(this.bus.cab, 2); if (!v) return;
      for (const dt of [0, 0.5]) {
        this._T(v, v.out, { t: t + dt, type: 'sawtooth', f: 320, f1: 380, gl: 0.35, a: 0.03, h: 0.3, d: 0.1, g: 0.13, ft: 'lowpass', ff: 1900 });
      }
      v.done();
    }
  }

  setLockAlert(level) {
    if (!this._ok()) return;
    const lv = clamp(num(level, 0), 0, 1);
    if (lv < 0.05) { this.lockNext = 0; return; }
    const now = this.ctx.currentTime, missile = lv >= 0.75;
    // 瞄準中：慢嗶；飛彈來襲：急促交替嗶
    const iv = missile ? 0.16 - 0.07 * (lv - 0.75) / 0.25 : 0.62 - 0.25 * (lv / 0.75);
    if (this.lockNext) this.lockNext = Math.min(this.lockNext, this.lockLast + iv);
    if (this.lockNext < now + 0.005) this.lockNext = Math.max(now + 0.01, this.lockLast + iv * 0.5);
    let guard = 0;
    while (this.lockNext < now + 0.1 && guard++ < 4) {
      this._lockBeep(this.lockNext, missile);
      this.lockLast = this.lockNext;
      this.lockNext += iv;
    }
  }

  setDanger(on) {
    on = !!on;
    const was = this._dangerWant;
    this._dangerWant = on;
    // 配樂：危急時蓋上低通（悶、緊張），排程器另外加心跳脈動
    if (this._ready && was !== on) this.musLP.frequency.setTargetAtTime(on ? 1500 : 20000, this.ctx.currentTime, on ? 0.5 : 0.8);
    if (!this._ready || on === !!this.dz) return;
    if (on) this._duck(3, this._now(), 0.3);
    if (on) { this.dz = this._klaxon(); return; }
    const K = this.dz, t = this.ctx.currentTime;
    this.dz = null;
    K.out.gain.cancelScheduledValues(t);
    K.out.gain.setValueAtTime(K.out.gain.value, t);
    K.out.gain.linearRampToValueAtTime(0, t + 0.2);
    K.kill(t + 0.25);
  }

  overdrive() {
    if (!this._ok()) return;
    const v = this._voice(this.bus.hull, 2); if (!v) return;
    const t = this._now(), o = v.out, C = this.bus.cab, rise = 1.4;
    // 能量湧升：三層走音鋸齒一路往上，濾波同步打開
    for (const det of [-9, 0, 7]) {
      this._T(v, o, { t, type: 'sawtooth', f: 55, f1: 440, gl: rise, det, a: rise * 0.75, h: rise * 0.25, d: 0.35, g: 0.06, ft: 'lowpass', ff: 200, ff1: 4000, fgl: rise, fq: 4 });
    }
    this._T(v, o, { t, f: 32, f1: 64, gl: rise, a: rise * 0.85, h: 0.15, d: 0.45, g: 0.3 });
    this._N(v, o, { t, b: 'p', a: rise * 0.9, h: 0.1, d: 0.35, g: 0.22, ft: 'highpass', f: 400, f1: 3000, gl: rise, q: 0.7 });
    // 上升期間的電弧劈啪
    this._gran(v, C, { t: t + 0.3, dur: rise - 0.3, b: 'w', ft: 'highpass', f: 3500, q: 0.7, g: 0.05, gd: [0.002, 0.007], gap: [0.01, 0.07] });
    // 釋放衝擊
    const tr = t + rise + 0.05;
    this._duck(5, tr, 0.5);
    this._thump(v, o, tr, 110, 34, 0.65, 0.9, 2);
    this._N(v, o, { t: tr, b: 'b', a: 0.005, d: 1.2, g: 0.9, ft: 'lowpass', f: 650, f1: 120, q: 0.8 });
    this._N(v, o, { t: tr, b: 'w', a: 0.001, d: 0.07, g: 0.35, ft: 'highpass', f: 1500 });
    // 高頻光暈（座艙儀表共鳴）
    for (const [f, g] of [[1320, 0.035], [1326, 0.03], [1980, 0.025], [2640, 0.018]]) {
      this._T(v, C, { t: tr, f, a: 0.01, d: 1.3, g });
    }
    v.done();
  }

  ui(kind) {
    if (!this._ok()) return;
    const t = this._now();
    if (kind === 'boot') return this._boot(t);
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out, H = this.bus.hull;
    if (kind === 'confirm') {
      this._T(v, o, { t, type: 'triangle', f: 1200, a: 0.002, d: 0.06, g: 0.09 });
      this._T(v, o, { t: t + 0.06, type: 'triangle', f: 1800, a: 0.002, d: 0.1, g: 0.09 });
    } else if (kind === 'wave') {
      // 戰鬥號角：兩聲低沉銅管
      const send = v.add(this.ctx.createGain()); send.gain.value = 0.6;
      o.connect(send); send.connect(this.rvbIn);
      for (const dt of [0, 0.9]) {
        const tt = t + dt;
        [[110, 0, 0.05], [110, 9, 0.05], [165, -5, 0.035], [220, 4, 0.03]].forEach(([f, det, g]) => {
          this._T(v, o, { t: tt, type: 'sawtooth', f, det, a: 0.1, h: 0.45, d: 0.35, g, ft: 'lowpass', ff: 280, ff1: 1300, fgl: 0.2, fq: 1.8 });
        });
        this._T(v, H, { t: tt, f: 55, a: 0.1, h: 0.45, d: 0.35, g: 0.16 });
      }
    } else if (kind === 'clear') {
      // 任務完成：大調琶音＋和聲墊
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        const tt = t + i * 0.11;
        this._T(v, o, { t: tt, type: 'triangle', f, a: 0.005, d: 0.9, g: 0.16 });
        this._T(v, o, { t: tt, f: f * 2, a: 0.005, d: 0.5, g: 0.04 });
      });
      for (const f of [261.63, 392, 329.63]) {
        this._T(v, o, { t: t + 0.36, type: 'sawtooth', f, a: 0.3, h: 0.8, d: 1.2, g: 0.045, ft: 'lowpass', ff: 1200 });
      }
    } else if (kind === 'fail') {
      // 任務失敗：小調下行＋斷電
      [[392, 0], [349.23, 0.28], [311.13, 0.56], [261.63, 0.9]].forEach(([f, dt], i) => {
        this._T(v, o, { t: t + dt, type: 'sawtooth', f, a: 0.01, h: 0.12, d: i === 3 ? 1.4 : 0.4, g: 0.055, ft: 'lowpass', ff: 1400 });
        this._T(v, o, { t: t + dt, f: f / 2, a: 0.01, h: 0.12, d: i === 3 ? 1.4 : 0.4, g: 0.05 });
      });
      this._T(v, H, { t, f: 180, f1: 30, gl: 1.6, a: 0.05, h: 0.3, d: 1.3, g: 0.12 });
    } else if (kind === 'hover') {
      // 游標移過：極輕的細點
      this._T(v, o, { t, type: 'triangle', f: 2600 * rnd(0.98, 1.02), a: 0.001, d: 0.025, g: 0.025 });
    } else if (kind === 'click') {
      // 按下：清脆的機械按鍵
      this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.012, g: 0.12, ft: 'bandpass', f: 3200, q: 1.5 });
      this._T(v, o, { t, type: 'triangle', f: 1500, f1: 1100, gl: 0.04, a: 0.001, d: 0.05, g: 0.08 });
      this._thump(v, H, t, 140, 80, 0.06, 0.08, 1);
    } else if (kind === 'stage') {
      // 選定關卡：機械鎖扣「喀鏘」＋低頻衝擊＋氣流上掃＋上行兩音
      this._clank(v, H, t, 180, 0.08, 0.3, PLATE);
      this._thump(v, H, t, 80, 36, 0.2, 0.4, 1.6);
      this._N(v, o, { t, b: 'p', a: 0.002, d: 0.3, g: 0.12, ft: 'bandpass', f: 600, f1: 2400, gl: 0.25, q: 1 });
      for (const [dt, f] of [[0.08, 880], [0.2, 1318.5]]) {
        this._T(v, o, { t: t + dt, type: 'triangle', f, a: 0.003, d: 0.35, g: 0.08 });
        this._T(v, o, { t: t + dt, f: f * 2, a: 0.003, d: 0.2, g: 0.02 });
      }
    } else {
      this._T(v, o, { t, type: 'triangle', f: 1000, a: 0.002, d: 0.05, g: 0.06 });
    }
    v.done();
  }

  // ───────────────────────── 外界（立體聲定位） ─────────────────────────

  enemyStep(pos, strength) {
    if (!this._ok()) return;
    const s = clamp(num(strength, 1), 0.2, 2);
    const S = this._spat(pos, { ref: 18, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t, d } = S;
    this._thump(v, o, t, rnd(48, 58), 28, 0.4 * s, 0.45, 1.8);
    this._N(v, o, { t, b: 'b', a: 0.003, d: 0.4, g: 0.42 * s, ft: 'lowpass', f: 260, f1: 100, q: 0.8 });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.22 * s, ft: 'bandpass', f: rnd(280, 360), q: 1 });
    this._clank(v, o, t + rnd(0.02, 0.06), rnd(160, 230), 0.06 * s, 0.3);
    if (d < 60 && Math.random() < 0.4) this._creak(v, o, t + 0.08, 0.25, 0.04 * s);
    // 很近：地面傳進座艙的震動
    if (d < 45) this._thump(v, this.bus.hull, t, 50, 30, 0.22 * s * (1 - d / 45), 0.35, 1.3);
    v.done();
  }

  enemyBoost(id, pos, level) {
    if (!this._ok()) return;
    const lv = clamp(num(level, 0), 0, 1), now = this.ctx.currentTime;
    let e = this.eb.get(id);
    if (!e) {
      if (lv < 0.01 || this.eb.size >= 8) return;
      e = this._ebLoop();
      this.eb.set(id, e);
    }
    e.seen = now;
    const G = this._geo(pos, 25);
    this._st(e.g.gain, 0.45 * lv * G.att, now, 0.08);
    this._st(e.sg.gain, 0.2 * lv * Math.min(1, Math.sqrt(G.att) * 1.25), now, 0.08);
    if (e.pn.pan) this._st(e.pn.pan, G.pan, now, 0.08);
    this._st(e.lp.frequency, G.fc, now, 0.08);
    this._st(e.bp.frequency, 500 + 1100 * lv, now, 0.1);
    if (lv >= 0.01) e.on = now;
    else if (now - e.on > 0.6) this._ebKill(id, e);
  }

  // 載具引擎循環（每幀每台呼叫）：kind＝'tank'|'apc'|'heli'|'jet'，level＝油門 0..1。
  // 定位同 enemyBoost；0.5 秒沒更新自動收掉；最多 6 台同時發聲（新的比最遠的近才替換）。
  vehicleLoop(id, pos, kind, level) {
    if (!this._ok()) return;
    const K = VEH[kind] ? kind : 'tank', P = VEH[K];
    const lv = clamp(num(level, 0.5), 0, 1), now = this.ctx.currentTime;
    const G = this._geo(pos, P.ref);
    let e = this.vl.get(id);
    if (e && e.kind !== K) { this._vlKill(id, e); e = null; }
    if (!e) {
      if (G.att < 0.02) return;
      if (this.vl.size >= VEH_CAP) {
        let fk = null, fe = null;
        for (const [k, x] of this.vl) if (!fe || x.d > fe.d) { fk = k; fe = x; }
        if (!fe || fe.d <= G.d) return;
        this._vlKill(fk, fe);
      }
      e = this._vlLoop(K);
      this.vl.set(id, e);
      e.dp = G.d;
    }
    // 都卜勒：用前後兩幀的距離變化算徑向速度（靠近＝音高上揚，遠離＝下降）
    const dt = now - e.tp;
    if (dt > 0.004 && dt < 0.5) {
      const vr = clamp((G.d - e.dp) / dt, -300, 300);
      e.vr += (vr - e.vr) * Math.min(1, dt / 0.12);
    }
    e.dp = G.d; e.tp = now; e.d = G.d; e.seen = now;
    const dop = clamp(SOS / (SOS + e.vr), 0.6, 1.6);
    this._vlSet(e, P, G, lv, dop, now);
  }

  vehicleStop(id) {
    if (!this._ready) return;
    const e = this.vl.get(id);
    if (e) this._vlKill(id, e, true);
  }

  enemyBeam(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 18, rv: 0.3, prio: 1 }); if (!S) return;
    const { v, o, t } = S, p = rnd(0.9, 1.1);
    this._N(v, o, { t, b: 'w', a: 0.0004, d: 0.03, g: 0.4, ft: 'highpass', f: 2500 });
    this._T(v, o, { t, type: 'sawtooth', f: 2600 * p, f1: 280, gl: 0.2, a: 0.001, d: 0.25, g: 0.14, ft: 'lowpass', ff: 6000, ff1: 1000, fq: 1.5 });
    this._N(v, o, { t, b: 'w', a: 0.002, h: 0.03, d: 0.25, g: 0.14, ft: 'highpass', f: 3800, am: rnd(60, 90) });
    this._thump(v, o, t, 110 * p, 45, 0.3, 0.22, 1.4);
    v.done();
  }

  mg(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 20, rv: 0.35, prio: 0, min: 0.006 }); if (!S) return;
    const { v, o, t } = S;
    // 槍口爆裂（重口徑的尖銳裂聲）
    this._N(v, o, { t, b: 'w', a: 0.0004, d: rnd(0.025, 0.04), g: 0.7, ft: 'highpass', f: rnd(1500, 2200) });
    // 本體「砰」
    this._N(v, o, { t, b: 'p', a: 0.0008, d: rnd(0.07, 0.1), g: 0.78, ft: 'bandpass', f: rnd(500, 750), q: 1.1 });
    // 低頻
    this._thump(v, o, t, rnd(140, 170), 60, 0.42, 0.09, 1.4);
    v.done();
  }

  cannon(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 40, rv: 0.5, prio: 2, delay: true, min: 0.002 }); if (!S) return;
    const { v, o, t, d } = S, p = rnd(0.92, 1.08);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05, g: 0.7, ft: 'highpass', f: 1200 });
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.35, g: 0.8, ft: 'bandpass', f: 700 * p, f1: 300, q: 0.8 });
    this._thump(v, o, t, 75 * p, 28, 0.8, 1.1, 2.2);
    this._N(v, o, { t, b: 'b', a: 0.004, d: 1.4, g: 1.0, ft: 'lowpass', f: 500, f1: 120, q: 0.8 });
    this._N(v, o, { t: t + 0.05, b: 'b', a: 0.1, d: 1.8, g: 0.35, ft: 'lowpass', f: 150, q: 0.7 });
    if (d < 60) this._thump(v, this.bus.hull, t, 60, 30, 0.25 * (1 - d / 60), 0.4, 1.3);
    v.done();
  }

  missileLaunch3d(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 20, rv: 0.3, prio: 1 }); if (!S) return;
    const { v, o, t } = S, p = rnd(0.92, 1.08);
    this._N(v, o, { t, b: 'p', a: 0.001, d: 0.06, g: 0.62, ft: 'bandpass', f: 1000 * p, q: 1.3 });
    this._thump(v, o, t, 100 * p, 50, 0.35, 0.15, 1.3);
    this._N(v, o, { t, b: 'w', a: 0.02, h: 0.1, d: 0.6, g: 0.48, ft: 'bandpass', f: 700 * p, f1: 2600 * p, gl: 0.5, q: 1.2 });
    this._N(v, o, { t, b: 'p', a: 0.01, d: 0.5, g: 0.45, ft: 'lowpass', f: 900, f1: 300, q: 0.7 });
    v.done();
  }

  whiz(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 12, rv: 0.08, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    // 超音速彈頭的 N 波「啪」
    this._N(v, o, { t, b: 'w', a: 0.0002, d: 0.012, g: 1.1, ft: 'highpass', f: 2500 });
    // 掠過的「咻」：都卜勒下滑
    this._N(v, o, { t, b: 'w', a: 0.008, d: 0.18, g: 0.65, ft: 'bandpass', f: rnd(3500, 4500), f1: rnd(900, 1400), gl: 0.15, q: 3.5 });
    v.done();
  }

  impact(pos, kind) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.25, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    if (kind === 'armor') {
      // 金屬「鏘」＋火花劈啪
      this._clank(v, o, t, rnd(420, 650), 0.22, 0.5, PLATE);
      this._clank(v, o, t, rnd(1100, 1500), 0.09, 0.2);
      this._thump(v, o, t, 130, 60, 0.28, 0.15, 1.3);
      this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05, g: 0.3, ft: 'highpass', f: 3500 });
      this._gran(v, o, { t: t + 0.01, dur: 0.2, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.11, gd: [0.002, 0.006], gap: [0.005, 0.03], fade: true });
    } else if (kind === 'building') {
      // 混凝土碎裂
      this._thump(v, o, t, 95, 45, 0.38, 0.25, 1.5);
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.12, g: 0.5, ft: 'bandpass', f: 1500, q: 0.9 });
      this._gran(v, o, { t, dur: 0.35, b: 'w', ft: 'bandpass', fr: [900, 2600], q: 1.5, g: 0.28, gd: [0.004, 0.015], gap: [0.002, 0.02], fade: true });
      this._N(v, o, { t, b: 'b', a: 0.003, d: 0.4, g: 0.45, ft: 'lowpass', f: 350, q: 0.8 });
      this._gran(v, o, { t: t + 0.12, dur: 0.5, b: 'p', ft: 'bandpass', fr: [2000, 4000], q: 2, g: 0.1, gd: [0.005, 0.015], gap: [0.02, 0.08], fade: true });
    } else if (kind === 'saber') {
      // 光劍命中：沉重撞擊（次低頻＋過飽和悶響＋鋼板）＋電漿灼燒「滋——」＋下滑電弧＋熔融金屬噴濺
      const body = this._sat(v, o, 2.2, 0.5);
      this._thump(v, o, t, 110, 36, 0.55, 0.35, 2);
      this._N(v, body, { t, b: 'b', a: 0.002, d: 0.35, g: 0.6, ft: 'lowpass', f: 450, q: 0.8 });
      this._clank(v, body, t, rnd(300, 420), 0.2, 0.6, PLATE);
      this._N(v, o, { t, b: 'w', a: 0.001, h: 0.12, d: 0.45, g: 0.4, ft: 'highpass', f: 2800, am: rnd(70, 110), amd: 0.6 });
      this._T(v, o, { t, type: 'sawtooth', f: 900, f1: 140, gl: 0.3, a: 0.001, d: 0.35, g: 0.14, ft: 'bandpass', ff: 1400, fq: 2 });
      this._gran(v, o, { t: t + 0.02, dur: 0.5, b: 'w', ft: 'highpass', f: 4000, q: 0.7, g: 0.11, gd: [0.002, 0.006], gap: [0.004, 0.025], fade: true });
      this._duck(3, t, 0.12);
    } else if (kind === 'beam') {
      // 光束灼燒：滋滋聲＋下滑電弧
      this._N(v, o, { t, b: 'w', a: 0.001, h: 0.08, d: 0.35, g: 0.5, ft: 'highpass', f: 3000, am: rnd(55, 80) });
      this._T(v, o, { t, type: 'sawtooth', f: 1400, f1: 200, gl: 0.2, a: 0.001, d: 0.25, g: 0.18, ft: 'bandpass', ff: 1200, fq: 2 });
      this._N(v, o, { t, b: 'p', a: 0.002, d: 0.2, g: 0.5, ft: 'lowpass', f: 800, q: 0.7 });
    } else {
      // 地面：泥土悶響＋噴濺＋碎石
      this._thump(v, o, t, 80, 38, 0.42, 0.3, 1.5);
      this._N(v, o, { t, b: 'b', a: 0.003, d: 0.35, g: 0.6, ft: 'lowpass', f: 400, f1: 150, q: 0.8 });
      this._N(v, o, { t: t + 0.01, b: 'p', a: 0.004, d: 0.25, g: 0.3, ft: 'bandpass', f: 900, q: 0.8 });
      this._gran(v, o, { t: t + 0.05, dur: 0.35, b: 'p', ft: 'bandpass', fr: [1500, 3500], q: 2, g: 0.11, gd: [0.004, 0.012], gap: [0.01, 0.05], fade: true });
    }
    v.done();
  }

  // 爆炸（size 0.5～3.5；機體擊毀＝3）：
  //  ① 次低頻：正弦快速下墜（越大越低越長），1.5 起再加超低頻長尾
  //  ② 中頻本體：低通雜訊「轟」＋粉紅中頻（過飽和），滾動尾音左右各一條（寬）
  //  ③ 亮部：起爆裂擊（遠處被空氣吃掉）＋火焰劈啪；1.2 起碎塊落下
  //  遠方（>150 m）：延遲、濾波的回音隆隆（城市建築間來回反射）；機體殉爆：二次三次爆炸、金屬呻吟、碎片雨
  explosion(pos, size) {
    if (!this._ok()) return;
    const k = clamp(num(size, 1), 0.5, 3.5);
    const S = this._spat(pos, { ref: 25 + 22 * k, rv: 0.4 + 0.12 * k, delay: true, prio: 2, min: 0.0015 }); if (!S) return;
    const { v, o, t, d } = S, p = rnd(0.9, 1.1), att = v.out.gain.value;
    const far = clamp((d - 120) / 300, 0, 1), near = 1 - far;
    const body = this._sat(v, o, 2 + 0.4 * k, 0.45 + 0.1 * k);
    // ①
    this._thump(v, o, t, (78 - 8 * k) * p, 22, 0.5 + 0.2 * k, 0.8 + 0.6 * k, 2.4);
    if (k >= 1.5) this._T(v, o, { t, f: 50 * p, f1: 19, gl: 1 + 0.5 * k, a: 0.008, d: 1.2 + 0.6 * k, g: 0.12 + 0.08 * k });
    // ②
    this._N(v, body, { t, b: 'b', a: 0.004, d: 1.0 + 0.8 * k, g: 0.8 + 0.3 * k, ft: 'lowpass', f: 900 * p, f1: 130, gl: 0.5 + 0.5 * k, q: 0.8 });
    this._N(v, body, { t, b: 'p', a: 0.002, d: 0.25 + 0.12 * k, g: 0.6, ft: 'bandpass', f: 1400 * p, f1: 350, q: 0.7 });
    this._N(v, o, { t, b: 'p', a: 0.002, d: 0.5 + 0.3 * k, g: 0.35, ft: 'lowpass', f: 2600, f1: 450, q: 0.6 });
    for (const sd of [-0.6, 0.6]) {
      this._N(v, this._pan(v, sd, o), { t: t + 0.06 + rnd(0, 0.04), b: 'b', a: 0.2, h: 0.12 * k, d: 1.4 + 1.3 * k, g: 0.22 + 0.11 * k, ft: 'lowpass', f: rnd(170, 230), q: 0.7 });
    }
    // ③
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.05 + 0.03 * k, g: 0.6 * (0.3 + 0.7 * near), ft: 'highpass', f: 900 * p });
    this._gran(v, o, { t: t + 0.08, dur: 0.5 + 0.35 * k, b: 'w', ft: 'bandpass', fr: [1800, 5200], q: 1.2, g: (0.05 + 0.025 * k) * (0.4 + 0.6 * near), gd: [0.001, 0.005], gap: [0.004, 0.03], fade: true });
    if (k >= 1.2) {
      this._gran(v, o, { t: t + 0.15, dur: 0.6 + 0.4 * k, b: 'p', ft: 'bandpass', fr: [700, 2500], q: 1.2, g: 0.05 + 0.05 * k, gd: [0.006, 0.02], gap: [0.01, 0.06], fade: true });
    }
    // 遠方回音隆隆
    if (d > 150) {
      const fr = clamp((d - 150) / 300, 0, 1);
      for (const [dt, g] of [[0.28, 0.5], [0.65, 0.34]]) {
        this._N(v, o, { t: t + dt * rnd(0.8, 1.25), b: 'b', a: 0.12, h: 0.2, d: 1.6 + 0.6 * k, g: g * (0.4 + 0.25 * k) * fr, ft: 'lowpass', f: 260, f1: 110, q: 0.8 });
      }
    }
    // 機體殉爆
    if (k >= 2.5) {
      for (const [dt, g] of [[0.18, 0.55], [0.47, 0.45]]) {
        const ts = t + dt * rnd(0.85, 1.15);
        this._thump(v, o, ts, 62, 22, g, 1.2, 2.2);
        this._N(v, body, { t: ts, b: 'b', a: 0.005, d: 1.5, g: g * 1.1, ft: 'lowpass', f: 550, f1: 140, q: 0.8 });
        this._N(v, o, { t: ts, b: 'w', a: 0.0005, d: 0.04, g: g * 0.7 * (0.3 + 0.7 * near), ft: 'highpass', f: 1500 });
      }
      this._T(v, o, { t, f: 42, f1: 18, gl: 2.5, a: 0.01, d: 3.0, g: 0.5 });
      this._N(v, o, { t: t + 0.1, b: 'p', a: 0.3, h: 0.4, d: 1.8, g: 0.3, ft: 'bandpass', f: 500, f1: 250, q: 0.6 });
      const gf = rnd(50, 62);
      const gr = this._T(v, o, { t: t + 0.3, type: 'sawtooth', f: gf, a: 0.1, h: 0.4, d: 0.9, g: 0.08, ft: 'bandpass', ff: 420, ff1: 260, fgl: 1.3, fq: 6 });
      gr.frequency.linearRampToValueAtTime(gf * 0.7, t + 1.6);
      this._gran(v, o, { t: t + 0.5, dur: 2.2, b: 'w', ft: 'bandpass', fr: [1500, 5000], q: 6, g: 0.11, gd: [0.008, 0.03], gap: [0.02, 0.12], fade: true });
      for (let i = 0; i < 6; i++) this._clank(v, o, t + rnd(0.5, 2.5), rnd(300, 1200), rnd(0.03, 0.08), 0.3);
    }
    // 近距離：衝擊波震動座艙
    if (d < 100) {
      const nr = (1 - d / 100) * Math.min(1, k / 2);
      this._thump(v, this.bus.hull, t, 48, 24, 0.5 * nr, 0.7 + 0.3 * k, 1.5);
      this._gran(v, this.bus.cab, { t: t + 0.02, dur: 0.3 + 0.15 * k, b: 'w', ft: 'bandpass', fr: [1800, 4500], q: 5, g: 0.09 * nr, gd: [0.004, 0.015], gap: [0.004, 0.03], fade: true });
    }
    // 閃避：越近越大越深（最多 8 dB）
    const db = 8 * Math.sqrt(att) * Math.min(1, k / 2);
    if (db > 1) this._duck(db, t, 0.12 + 0.12 * k);
    v.done();
  }

  debris(pos) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.25, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    this._thump(v, o, t, 90, 45, 0.22, 0.2, 1.3);
    this._gran(v, o, { t, dur: rnd(0.6, 1.0), b: 'w', ft: 'bandpass', fr: [800, 4000], q: 4, g: 0.22, gd: [0.006, 0.025], gap: [0.015, 0.09], fade: true });
    this._gran(v, o, { t, dur: 0.5, b: 'p', ft: 'bandpass', fr: [300, 900], q: 1.5, g: 0.28, gd: [0.01, 0.04], gap: [0.03, 0.12], fade: true });
    for (let i = 0; i < 3; i++) this._clank(v, o, t + rnd(0, 0.7), rnd(400, 1400), rnd(0.03, 0.07), rnd(0.15, 0.35));
    v.done();
  }

  trample(pos, kind) {
    if (!this._ok()) return;
    const S = this._spat(pos, { ref: 15, rv: 0.2, prio: 1 }); if (!S) return;
    const { v, o, t } = S;
    if (kind === 'tree') {
      // 樹幹折斷「啪」＋木頭撕裂＋枝葉沙沙
      this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.04, g: 0.5, ft: 'bandpass', f: 2500, q: 0.8 });
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.12, g: 0.32, ft: 'bandpass', f: 900, q: 1.2 });
      this._gran(v, o, { t: t + 0.02, dur: 0.25, b: 'p', ft: 'bandpass', fr: [400, 1400], q: 3, g: 0.22, gd: [0.01, 0.03], gap: [0.005, 0.03], fade: true });
      this._gran(v, o, { t: t + 0.05, dur: 0.8, b: 'w', ft: 'highpass', fr: [2500, 5000], q: 0.7, g: 0.05, gd: [0.01, 0.04], gap: [0.001, 0.01], fade: true });
      this._thump(v, o, t + 0.35, 70, 40, 0.18, 0.3, 1.2);
    } else if (kind === 'lamp') {
      // 金屬桿被壓彎：撞擊、呻吟、倒地
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.08, g: 0.28, ft: 'bandpass', f: 1500, q: 1 });
      this._clank(v, o, t, rnd(600, 800), 0.16, 0.9);
      this._T(v, o, { t: t + 0.03, type: 'sawtooth', f: 85, f1: 55, gl: 0.6, a: 0.05, h: 0.2, d: 0.4, g: 0.1, ft: 'bandpass', ff: 600, fq: 7 });
      this._thump(v, o, t + 0.5, 80, 40, 0.18, 0.25, 1.2);
      this._clank(v, o, t + 0.5, rnd(380, 440), 0.08, 0.5);
    } else {
      // 汽車被踩扁：鈑金擠壓＋玻璃碎裂
      this._N(v, o, { t, b: 'p', a: 0.001, d: 0.15, g: 0.45, ft: 'bandpass', f: 700, q: 0.8 });
      this._thump(v, o, t, 70, 35, 0.32, 0.3, 1.4);
      this._gran(v, o, { t, dur: 0.35, b: 'w', ft: 'bandpass', fr: [600, 2200], q: 2.5, g: 0.3, gd: [0.005, 0.02], gap: [0.003, 0.02], fade: true });
      this._T(v, o, { t, type: 'sawtooth', f: 70, f1: 45, gl: 0.4, a: 0.02, d: 0.4, g: 0.12, ft: 'bandpass', ff: 500, fq: 5 });
      for (let i = 0; i < 6; i++) this._T(v, o, { t: t + rnd(0.01, 0.25), f: rnd(2800, 6500), a: 0.0005, d: rnd(0.05, 0.15), g: rnd(0.02, 0.045) });
      this._gran(v, o, { t: t + 0.02, dur: 0.3, b: 'w', ft: 'highpass', f: 5000, q: 0.7, g: 0.1, gd: [0.002, 0.008], gap: [0.005, 0.03], fade: true });
    }
    v.done();
  }

  // ───────────────────────── 配樂 ─────────────────────────
  // music('title' | 'battle' {stage 1..6} | 'final' | 'clear' | 'allclear' | 'fail' | 'off')
  // 同一首（同一個識別鍵）重複呼叫不做任何事；循環曲之間交叉淡化約 1 秒；進短曲時舊曲 0.35 秒淡出。
  music(name, opts) {
    let n = String(name || 'off');
    const st = clamp(num(opts && opts.stage, 1) | 0, 1, 6);
    if (n === 'battle' && st >= 6) n = 'final';
    const key = n === 'battle' ? 'battle' + st : n;
    if (key !== 'off' && !SCORES[key]) return;
    if (key === this._musKey) return;
    this._musKey = key;
    if (!this._ready) { this._musWant = key === 'off' ? null : key; return; }
    this._musStart(key);
  }

  // 戰鬥強度 0..1（每幀呼叫）；內部以約 2.5 秒時間常數平滑
  setIntensity(x) {
    const v = clamp(num(x, 0.5), 0, 1);
    this.musIT = v;
    if (this.musI == null) this.musI = v;
  }

  // 配樂音量 0..1（預設 0.7，明顯壓在音效底下）
  setMusicVolume(v) {
    this.musVol = clamp(num(v, this.musVol), 0, 1);
    if (this._ready) this.musVolG.gain.setTargetAtTime(this.musVol * MUS_K, this.ctx.currentTime, 0.05);
  }

  _musStart(key) {
    const c = this.ctx, now = c.currentTime, old = this.mtr;
    const S = key === 'off' ? null : scoreOf(key);
    if (old) {
      this._mFade(old, now, S && !S.loop ? 0.35 : 1.0);
      this.mtr = null;
    }
    if (!S) return;
    this._mBuf();
    const t0 = now + 0.06, tr = this._mTrack(S, t0);
    const g = tr.out.gain;
    g.setValueAtTime(0, now);
    g.linearRampToValueAtTime(1, t0 + (old && S.loop ? 0.6 : 0.03));
    this.musDly.delayTime.setTargetAtTime(0.75 * 60 / S.bpm, now, 0.05);
    this.mtr = tr;
    if (this._live && !this._mIv) {
      this._mIv = setInterval(() => {
        try { if (this._ok()) { this._musTick(); this._tick(); } } catch (e) { this.lastError = e; }
      }, 40);
    }
    this._musTick();
  }

  _mFade(tr, now, sec) {
    const g = tr.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + sec);
    tr.done = true;
    tr.R.kill(now + sec + 0.1);
  }

  // 排程器：音訊時鐘預看 0.25 秒，一格一格（十六分音符）排事件。暫停時不排。
  _musTick() {
    if (!this._ok()) return;
    const now = this.ctx.currentTime;
    if (this.musI == null) this.musI = this.musIT;
    const dt = clamp(now - (this._mT ?? now), 0, 1);
    this._mT = now;
    this.musI += (this.musIT - this.musI) * (1 - Math.exp(-dt / 2.5));
    const tr = this.mtr;
    if (!tr || tr.done) return;
    this._mLayers(tr, now);
    const la = typeof document !== 'undefined' && document.hidden ? MUS_LA_BG : MUS_LA;
    // 卡頓或暫停後：整條時間軸往後挪，不補播過去的音
    if (tr.nextT < now - 0.02) { const lag = now + 0.03 - tr.nextT; tr.t0 += lag; tr.nextT += lag; }
    let guard = 0;
    while (tr.nextT < now + la && guard++ < 128 && !tr.done) {
      this._mStep(tr, tr.step, tr.nextT);
      tr.step++;
      tr.nextT = tr.t0 + tr.step * tr.sps;
    }
  }

  _mStep(tr, gs, t) {
    const S = tr.S, n = S.len;
    let s = gs, pass = 0;
    if (s >= n) {
      if (!S.loop) {
        // 短曲結束：留尾音後收掉
        tr.done = true;
        tr.out.gain.setTargetAtTime(0, t + S.tail - 0.8, 0.2);
        tr.R.kill(t + S.tail);
        return;
      }
      const L = n - S.from * 16;
      pass = 1 + Math.floor((s - n) / L);
      s = S.from * 16 + ((s - n) % L);
    }
    const I = S.flat ? 1 : this.musI;
    for (const e of S.ev[s]) {
      if (I < (e.min || 0) || I >= (e.max ?? 9)) continue;
      if (e.pz !== undefined && (pass & 1) !== e.pz) continue;
      this._mPlay(tr, e, t);
    }
    // 危急：低頻心跳（咚—咚），繞過危急低通
    if (this._dangerWant && S.loop && (s % 16 === 0 || s % 16 === 3)) this._mPulse(t, s % 16 === 0 ? 1 : 0.6);
  }

  // 強度 → 各聲部音量。低（<0.2）＝弦樂墊＋貝斯＋弦樂主題；中（0.2～0.5）＝＋鼓組、撥弦頑固音型、法國號；
  // 高（>0.5）＝＋銅管重音、銅管主旋律、鈸、合唱。事件本身也有 min 閘，兩者一起讓聲部平順進出。
  _mLayers(tr, now) {
    if (tr.S.flat) return;
    const I = this.musI, L = tr.L, mid = sstep(0.12, 0.42, I), hi = sstep(0.4, 0.75, I);
    const set = (k, v) => this._st(L[k].gain, v * (tr.mix[k] ?? 1), now, 0.4);
    set('pad', 1 - 0.3 * hi);
    set('bass', 0.8 + 0.2 * I);
    set('str', 1 - 0.45 * hi);
    set('dr', 0.3 + 0.7 * mid);
    set('ost', mid);
    set('horn', sstep(0.25, 0.55, I));
    set('stab', hi);
    set('lead', hi);
    set('ctr', sstep(0.5, 0.85, I));
    set('choir', tr.S.fin ? 0.7 + 0.3 * I : hi);
  }

  // 閃避：大爆炸、受傷、警報時把配樂與環境音壓低 db（快速壓下、約 0.4 秒回來）；較深的閃避優先
  _duck(db, t, hold) {
    if (!this._ready) return;
    const a = Math.pow(10, -clamp(db, 0, 12) / 20), h = hold ?? 0.05;
    if (t < this._duckT && a >= this._duckA) return;
    for (const g of [this.musDuck.gain, this.ambDuck.gain]) {
      g.cancelScheduledValues(t);
      g.setTargetAtTime(a, t, 0.008);
      g.setTargetAtTime(1, t + 0.03 + h, 0.13);
    }
    this._duckT = t + 0.03 + h + 0.15; this._duckA = a;
  }

  // 第一次放音樂時合成全部樂器取樣
  _mBuf() {
    if (this.mb) return;
    const c = this.ctx, sr = c.sampleRate;
    const B = (a) => { const b = c.createBuffer(1, a.length, sr); b.getChannelData(0).set(a); return b; };
    const K = synthKit(sr), mb = {};
    for (const k in K) mb[k] = B(K[k]);
    mb.pno = [[48, B(synthPiano(sr, 48, 3))], [60, B(synthPiano(sr, 60, 2.5))], [72, B(synthPiano(sr, 72, 2))]];
    mb.pluck = B(synthPluck(sr));
    mb.stab = B(synthStab(sr));
    mb.bell = B(synthBell(sr));
    const rv = K.crash.slice().reverse();          // 反向鈸：段落交界前的吸氣聲
    mb.rev = B(rv);
    this.mb = mb;
  }

  // 建立一首曲目的聲部匯流排與常駐合成器（貝斯、主旋律為單音常駐振盪器，只改音高與包絡）
  _mTrack(S, t0) {
    const c = this.ctx, R = new Rig(c), spb = 60 / S.bpm;
    const out = R.gain(0, this.musIn);
    out.connect(R.gain(S.rv ?? (S.loop ? 0.22 : 0.3), this.musRvb));
    // 合奏效果（兩支緩慢調變的延遲，左右各一）：弦樂墊與弦樂共用
    const ens = R.gain(0.75, out);
    for (const [dt, lf, dp, pn] of [[0.013, 0.33, 0.0025, -0.6], [0.021, 0.51, 0.003, 0.6]]) {
      const dl = R.add(c.createDelay(0.05)); dl.delayTime.value = dt;
      ens.connect(dl);
      const p = R.pan(out); if (p.pan) p.pan.value = pn;
      dl.connect(R.gain(0.5, p));
      const l = R.osc('sine', lf, null, t0), lg = R.gain(dp); l.connect(lg); lg.connect(dl.delayTime);
    }
    const L = {};
    for (const k of ['dr', 'bass', 'ost', 'stab', 'lead', 'horn', 'ctr', 'choir', 'pno', 'brass', 'sub', 'bell']) L[k] = R.gain(1, out);
    L.pad = R.gain(1, ens); L.str = R.gain(1, ens);
    const tr = { S, R, out, L, t0, step: 0, nextT: t0, spb, sps: spb / 4, done: false, cr: 0 };
    tr.mix = { dr: 1, bass: 1, ost: 1, stab: 1, lead: 1, horn: 1, ctr: 1, choir: 1, pad: 1, str: 1, ...MUS_MIX, ...S.mix };
    tr.padIn = R.filt('lowpass', S.padFc, 0.6, L.pad);
    // 弦樂墊左右各一組走音鋸齒（每個和弦音在兩邊各有一支、走音方向相反）＝寬廣立體聲
    tr.padL = R.pan(tr.padIn); if (tr.padL.pan) tr.padL.pan.value = -0.7;
    tr.padR = R.pan(tr.padIn); if (tr.padR.pan) tr.padR.pan.value = 0.7;
    tr.strIn = R.filt('lowpass', 2600, 0.5, L.str);
    tr.ctrIn = R.filt('lowpass', 4200, 0.6, L.ctr);
    tr.pl = R.pan(L.dr); if (tr.pl.pan) tr.pl.pan.value = -0.35;
    tr.pr = R.pan(L.dr); if (tr.pr.pan) tr.pr.pan.value = 0.35;
    L.lead.connect(R.gain(0.22, this.musDlyIn));
    L.pno.connect(R.gain(0.12, this.musDlyIn));
    L.bell.connect(R.gain(0.2, this.musDlyIn));
    const uses = new Set();
    for (const row of S.ev) for (const e of row) uses.add(e.k);
    if (uses.has('bass')) {
      const vca = R.gain(0, L.bass);
      const lp = R.filt('lowpass', 300, 2.2, vca);
      const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.soft; sh.connect(lp);
      const o = R.osc('sawtooth', 55, R.gain(0.7, sh), t0);
      const s = R.osc('sine', 55, R.gain(0.55, vca), t0);
      tr.bass = { o, s, lp, vca };
    }
    if (uses.has('lead')) {
      const vca = R.gain(0, L.lead);
      const lp = R.filt('lowpass', 1800, 1.1, vca);
      const o1 = R.osc('sawtooth', 440, R.gain(0.5, lp), t0);
      const o2 = R.osc('sawtooth', 440, R.gain(0.5, lp), t0); o2.detune.value = 9;
      const o3 = R.osc('square', 220, R.gain(0.22, lp), t0);
      const vib = R.osc('sine', 5.6, null, t0), vg = R.gain(0);
      vib.connect(vg); vg.connect(o1.detune); vg.connect(o2.detune); vg.connect(o3.detune);
      tr.lead = { o1, o2, o3, lp, vca, vg };
    }
    if (uses.has('choir')) {
      tr.choirIn = R.gain(1);
      for (const [f, q, g] of [[700, 5, 1], [1150, 6, 0.7], [2600, 8, 0.35]]) tr.choirIn.connect(R.filt('bandpass', f, q, R.gain(g, L.choir)));
      tr.choirIn.connect(R.filt('lowpass', 500, 0.7, R.gain(0.35, L.choir)));
    }
    if (S.flat) for (const k in L) L[k].gain.value = tr.mix[k] ?? 1;
    else { this._mLayers(tr, t0); for (const k in L) if (L[k].gain._tgt !== undefined) L[k].gain.value = L[k].gain._tgt; }
    return tr;
  }

  _mv(dest, prio) {
    if (this.mv >= MUS_CAP) return null;
    if (prio === 0 && (this.mv >= MUS_CAP - 8 || this.voices > MINOR_CAP)) return null;
    return new Voice(this, dest, 'mv');
  }

  _mPlay(tr, e, t) {
    const T = (tr.S.tr || 0) + (e.tx || 0), v = e.v ?? 1, mb = this.mb, beat = tr.spb;
    switch (e.k) {
      case 'k': return this._mSamp(mb.kick, 0, t, v * 0.9, tr.L.dr, 1);
      case 's': return this._mSamp(mb.snare, 0, t, v * 0.55, tr.L.dr, 1);
      case 'h': return this._mSamp(mb.hat, 0, t, v * 0.16, tr.pr, 0);
      case 'o': return this._mSamp(mb.ohat, 0, t, v * 0.14, tr.pr, 0);
      case 't': return this._mSamp(mb.tom, [5, 0, -5][e.m] || 0, t, v * 0.5, e.m === 0 ? tr.pl : e.m === 2 ? tr.pr : tr.L.dr, 1);
      case 'c': tr.cr ^= 1; return this._mSamp(mb.crash, 0, t, v * 0.3, tr.cr ? tr.pl : tr.pr, 1);
      case 'b': return this._mSamp(mb.boom, 0, t, v * 0.5, tr.L.dr, 1);
      case 'sw': {  // 反向鈸：在 d 拍後的強拍剛好到頂
        const vc = this._mv(tr.cr ? tr.pl : tr.pr, 1); if (!vc) return;
        const b = mb.rev, len = Math.min(b.duration, e.d * beat), s = this.ctx.createBufferSource();
        s.buffer = b; s.connect(vc.out); vc.out.gain.value = v * 0.2;
        vc.play(s, t, t + len, b.duration - len + 1e-4);
        vc.done(); return;
      }
      case 'bell': return this._mSamp(mb.bell, e.m + T - 72, t, v * 0.3, tr.L.bell, 1);
      case 'ti': return this._mSamp(mb.timp, e.m + T - 38, t, v * 0.6, tr.L.dr, 1);
      case 'bass': return this._mBass(tr, t, e.m + T, e.d * beat, v);
      case 'lead': return this._mLead(tr, t, e.m + T, e.d * beat, v);
      case 'ost': return this._mSamp(mb.pluck, e.m + T - 50, t, v * 0.16, tr.L.ost, e.p ?? 1, 0.2, 0.05);
      case 'stab': for (const m of e.n) this._mSamp(mb.stab, m + T - 57, t, v * 0.13, tr.L.stab, 1); return;
      case 'pno': {
        const m = e.m + T;
        let best = mb.pno[0];
        for (const p of mb.pno) if (Math.abs(p[0] - m) < Math.abs(best[0] - m)) best = p;
        return this._mSamp(best[1], m - best[0], t, v * 0.32, tr.L.pno, 1, e.d * beat, 0.35);
      }
      case 'pad': return this._mPad(tr, t, e.n.map((m) => m + T), e.d * beat, v);
      case 'str': return this._mStr(tr.strIn, t, e.m + T, e.d * beat, v * 0.8, 0.09);
      case 'ctr': return this._mStr(tr.ctrIn, t, e.m + T, e.d * beat, v, 0.3);
      case 'horn': return this._mBrass(tr.L.horn, t, [e.m + T], e.d * beat, v * 0.8);
      case 'brass': return this._mBrass(tr.L.brass, t, e.n.map((m) => m + T), e.d * beat, v);
      case 'choir': return this._mChoir(tr, t, e.n.map((m) => m + T), e.d * beat, v);
      case 'sub': return this._mSub(tr.L.sub, t, e.m + T, e.d * beat, v);
    }
  }

  // 取樣播放：semi＝相對根音的半音；dur 有給就在 dur 後以 rel 時間常數收掉
  _mSamp(buf, semi, t, vel, dest, prio, dur, rel) {
    const v = this._mv(dest, prio); if (!v) return;
    const s = this.ctx.createBufferSource(), rate = Math.pow(2, semi / 12);
    s.buffer = buf; s.playbackRate.value = rate;
    const g = v.out.gain; g.value = vel;
    s.connect(v.out);
    let end = t + buf.duration / rate;
    if (dur != null && t + dur + rel * 5 < end) {
      g.setValueAtTime(vel, t + dur);
      g.setTargetAtTime(0, t + dur, rel);
      end = t + dur + rel * 5;
    }
    v.play(s, t, end);
    v.done();
  }

  // 貝斯（常駐單音）：鋸齒經飽和與低通包絡＋正弦補底
  _mBass(tr, t, m, dur, vel) {
    const B = tr.bass; if (!B) return;
    const f = mtof(m), g = B.vca.gain, lp = B.lp.frequency;
    B.o.frequency.setValueAtTime(f, t); B.s.frequency.setValueAtTime(f, t);
    g.setTargetAtTime(0.5 * vel, t, 0.003);
    g.setTargetAtTime(0.32 * vel, t + 0.03, 0.12);
    g.setTargetAtTime(0, t + Math.max(0.04, dur - 0.02), 0.014);
    lp.setTargetAtTime(350 + 2300 * vel, t, 0.002);
    lp.setTargetAtTime(240 + 320 * vel, t + 0.012, 0.07);
  }

  // 主旋律（常駐單音）：兩支走音鋸齒＋低八度方波；每音有濾波起伏、延遲顫音、微滑音
  _mLead(tr, t, m, dur, vel) {
    const P = tr.lead; if (!P) return;
    // 銅管式起音：音高從下方約 70 音分（短音 25 音分）滑進、濾波器從悶到亮「叭」地打開
    const f = mtof(m), g = P.vca.gain, sc = dur > 0.3 ? 0.96 : 0.986;
    for (const [o, k] of [[P.o1, 1], [P.o2, 1], [P.o3, 0.5]]) {
      o.frequency.setValueAtTime(f * k * sc, t);
      o.frequency.setTargetAtTime(f * k, t, 0.025);
    }
    g.setTargetAtTime(0.16 * vel, t, 0.008);
    g.setTargetAtTime(0.13 * vel, t + 0.1, 0.3);
    g.setTargetAtTime(0, t + Math.max(0.05, dur - 0.03), 0.03);
    P.lp.frequency.setValueAtTime(600, t);
    P.lp.frequency.setTargetAtTime(1400 + 2600 * vel, t, 0.015);
    P.lp.frequency.setTargetAtTime(1500 + 700 * vel, t + 0.12, 0.3);
    P.vg.gain.setTargetAtTime(0, t, 0.02);
    if (dur > 0.45) P.vg.gain.setTargetAtTime(13, t + 0.25, 0.25);
  }

  // 弦樂墊：每個和弦音兩支走音鋸齒（左邊偏低、右邊偏高），慢起音，共用低通＋合奏效果
  _mPad(tr, t, notes, dur, vel) {
    const v = this._mv(tr.padL, 1); if (!v) return;
    const c = this.ctx, g2 = v.add(c.createGain()), a = Math.min(tr.S.padA, dur * 0.4), end = t + dur, pk = 0.034 * vel;
    g2.connect(tr.padR);
    for (const g of [v.out.gain, g2.gain]) {
      g.setValueAtTime(0, t);
      g.linearRampToValueAtTime(pk, t + a);
      g.setValueAtTime(pk, end);
      g.setTargetAtTime(0, end, 0.28);
    }
    notes.forEach((m, i) => {
      const f = mtof(m), d = 7 + 4 * (i % 2);
      for (const [det, dst] of [[-d, v.out], [d, g2]]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        o.connect(dst); v.play(o, t, end + 1.5);
      }
    });
    v.done();
  }

  // 弦樂／對位：兩支微走音鋸齒，柔和起音
  _mStr(dest, t, m, dur, vel, att) {
    const v = this._mv(dest, 1); if (!v) return;
    const c = this.ctx, g = v.out.gain, end = t + Math.max(0.1, dur - 0.02), f = mtof(m);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.06 * vel, t + Math.min(att, dur * 0.4));
    g.setValueAtTime(0.06 * vel, end);
    g.setTargetAtTime(0, end, 0.18);
    for (const det of [-9, 9]) {
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = f; o.detune.value = det;
      o.connect(v.out); v.play(o, t, end + 1.0);
    }
    v.done();
  }

  // 銅管（法國號／號角和弦）：每音兩支鋸齒，濾波器「叭」地打開再收回
  _mBrass(dest, t, notes, dur, vel) {
    const v = this._mv(dest, 1); if (!v) return;
    const c = this.ctx, end = t + Math.max(0.1, dur);
    const lp = this._filt(v, 'lowpass', 300, 1.4); lp.connect(v.out);
    const f = lp.frequency;
    f.setValueAtTime(300, t);
    f.setTargetAtTime(900 + 2400 * vel, t, 0.04);
    f.setTargetAtTime(700 + 1000 * vel, t + 0.18, 0.35);
    f.setTargetAtTime(280, end, 0.1);
    const g = v.out.gain, pk = 0.1 * vel / Math.sqrt(notes.length);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(pk, t + 0.05);
    g.setTargetAtTime(pk * 0.75, t + 0.08, 0.3);
    g.setTargetAtTime(0, end, 0.09);
    for (const m of notes) {
      const fm = mtof(m);
      for (const det of [-6, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(fm * 0.965, t);        // 起音從下方滑進（銅管的「嘴唇」）
        o.frequency.setTargetAtTime(fm, t, 0.03);
        o.detune.value = det;
        o.connect(lp); v.play(o, t, end + 0.6);
      }
    }
    v.done();
  }

  // 合唱：鋸齒經三組共振峰帶通（「啊」母音），慢起音
  _mChoir(tr, t, notes, dur, vel) {
    if (!tr.choirIn) return;
    const v = this._mv(tr.choirIn, 1); if (!v) return;
    const c = this.ctx, g = v.out.gain, end = t + dur;
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.11 * vel, t + Math.min(0.5, dur * 0.4));
    g.setValueAtTime(0.11 * vel, end);
    g.setTargetAtTime(0, end, 0.3);
    notes.forEach((m) => {
      for (const det of [-8, 8]) {                       // 每個聲部兩位歌者，略走音＝合唱團
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = mtof(m); o.detune.value = det + rnd(-2, 2);
        o.connect(v.out); v.play(o, t, end + 1.6);
      }
    });
    v.done();
  }

  // 標題曲的柔和低音（正弦）
  _mSub(dest, t, m, dur, vel) {
    const v = this._mv(dest, 1); if (!v) return;
    const o = this.ctx.createOscillator(), g = v.out.gain, end = t + dur;
    o.frequency.value = mtof(m);
    g.setValueAtTime(0, t);
    g.linearRampToValueAtTime(0.2 * vel, t + 0.25);
    g.setValueAtTime(0.2 * vel, end);
    g.setTargetAtTime(0, end, 0.3);
    o.connect(v.out); v.play(o, t, end + 1.6);
    v.done();
  }

  // 危急心跳：低頻正弦下墜，直接進配樂音量（不被低通悶掉）
  _mPulse(t, k) {
    const v = this._mv(this.musPulse, 1); if (!v) return;
    this._T(v, v.out, { t, f: 70, f1: 40, gl: 0.18, a: 0.006, d: 0.25, g: 0.22 * k });
    this._N(v, v.out, { t, b: 'b', a: 0.004, d: 0.12, g: 0.25 * k, ft: 'lowpass', f: 180, q: 0.7 });
    v.done();
  }
  // ⟨樂器結束⟩

  // ───────────────────────── 內部：每幀維護 ─────────────────────────

  _ok() { return this._ready && !this.paused; }
  _now() { return this.ctx.currentTime + 0.005; }

  _tick() {
    const now = this.ctx.currentTime;
    // 主程式停止呼叫 boost() 時自動收掉推進器
    if (this.bl && now - this.bl.call > 0.3) this._boostSet(0);
    // 沒有更新的敵機推進器（被擊毀、離開）淡出
    for (const [id, e] of this.eb) if (now - e.seen > 0.5) this._ebKill(id, e);
    for (const [id, e] of this.vl) if (now - e.seen > 0.5) this._vlKill(id, e);
  }

  _voice(dest, prio) {
    const cap = prio === 0 ? MG_CAP : prio === 1 ? MINOR_CAP : HARD_CAP;
    if (this.voices >= cap) return null;
    return new Voice(this, dest);
  }

  // 參數平滑追蹤；目標沒變就不重複排程（避免每幀堆積自動化事件）
  _st(param, v, now, tc) {
    const last = param._tgt;
    if (last !== undefined && Math.abs(last - v) <= Math.max(1e-4, Math.abs(v) * 0.02)) return;
    param.setTargetAtTime(v, now, tc);
    param._tgt = v;
  }

  // 聽者相對幾何：距離、衰減、左右聲像、距離低通（越遠越悶，背後再悶一點）
  _geo(pos, ref) {
    const L = this.lis;
    let dx = 0, dy = 0, dz = 0;
    if (pos) { dx = num(pos.x, L.x) - L.x; dy = num(pos.y, L.y) - L.y; dz = num(pos.z, L.z) - L.z; }
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const att = ref / (ref + Math.max(0, d - ref));
    const hz = Math.sqrt(dx * dx + dz * dz);
    let pan = 0, front = 1;
    if (hz > 0.01) {
      pan = (dx * this.rx + dz * this.rz) / hz;
      front = (dx * this.fx + dz * this.fz) / hz;
    }
    pan = clamp(pan * 0.85 * Math.min(1, hz / 8), -0.9, 0.9);
    let fc = 20000 / (1 + d / 90);
    if (front < 0) fc *= 1 + front * 0.35;
    return { d, att, pan, fc: clamp(fc, 450, 18000) };
  }

  // 建立一個定位聲音：來源 → 距離低通 → 聲像 → 衰減 → world；聲像後另送城市殘響（遠處殘響比例較高）
  _spat(pos, o) {
    const G = this._geo(pos, o.ref);
    if (G.att < (o.min ?? 0.004)) return null;
    const v = this._voice(this.bus.world, o.prio ?? 1); if (!v) return null;
    const c = this.ctx;
    const lp = this._filt(v, 'lowpass', G.fc, 0.5);
    const pn = this._pan(v, G.pan, v.out);
    lp.connect(pn);
    v.out.gain.value = G.att;
    const sg = v.add(c.createGain());
    sg.gain.value = (o.rv ?? 0.25) * Math.min(1, Math.sqrt(G.att) * 1.25);
    pn.connect(sg); sg.connect(this.rvbIn);
    let t = this._now();
    if (o.delay && G.d > 35) t += Math.min(MAX_DELAY, G.d / SOS);
    return { v, o: lp, t, d: G.d };
  }

  // ───────────────────────── 內部：合成積木 ─────────────────────────

  // 包絡：線性起音 → 保持 → 指數衰減；回傳結束時間
  _env(p, t, a, g, h, d) {
    g = Math.max(g, E * 2);
    p.setValueAtTime(E, t);
    p.linearRampToValueAtTime(g, t + a);
    if (h > 0) p.setValueAtTime(g, t + a + h);
    p.exponentialRampToValueAtTime(E, t + a + h + d);
    return t + a + h + d;
  }

  _filt(v, type, f, q) {
    const b = v.add(this.ctx.createBiquadFilter());
    b.type = type; b.frequency.value = f; b.Q.value = q ?? 0.707;
    return b;
  }

  _pan(v, val, dest) {
    const c = this.ctx;
    const p = v.add(c.createStereoPanner ? c.createStereoPanner() : c.createGain());
    if (p.pan) p.pan.value = clamp(val, -1, 1);
    if (dest) p.connect(dest);
    return p;
  }

  // 音調層：o = { t, type, f, f1, gl, det, a, h, d, g, ft, ff, ff1, fgl, fq }
  _T(v, dest, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.003, h = o.h ?? 0, d = o.d ?? 0.2;
    const osc = c.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.gl ?? a + h + d));
    if (o.det) osc.detune.value = o.det;
    let n = osc;
    if (o.ft) {
      const b = this._filt(v, o.ft, o.ff, o.fq);
      b.frequency.setValueAtTime(o.ff, t);
      if (o.ff1) b.frequency.exponentialRampToValueAtTime(o.ff1, t + (o.fgl ?? a + h + d));
      n.connect(b); n = b;
    }
    const g = v.add(c.createGain());
    const end = this._env(g.gain, t, a, o.g, h, d);
    n.connect(g); g.connect(dest);
    v.play(osc, t, end + 0.03);
    return osc;
  }

  // 雜訊層：o = { t, b:'w'|'p'|'b', rate, a, h, d, g, ft, f, f1, gl, q, am, amd }
  _N(v, dest, o) {
    const c = this.ctx, t = o.t, a = o.a ?? 0.002, h = o.h ?? 0, d = o.d ?? 0.2;
    const buf = this.nb[o.b || 'w'];
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    if (o.rate) s.playbackRate.value = o.rate;
    let n = s;
    if (o.ft) {
      const b = this._filt(v, o.ft, o.f, o.q);
      b.frequency.setValueAtTime(o.f, t);
      if (o.f1) b.frequency.exponentialRampToValueAtTime(o.f1, t + (o.gl ?? a + h + d));
      n.connect(b); n = b;
    }
    const end = t + a + h + d;
    if (o.am) {
      // 方波調幅：電弧的「滋滋」顆粒感
      const depth = o.amd ?? 0.5;
      const m = v.add(c.createGain()); m.gain.value = 1 - depth;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = o.am;
      const lg = v.add(c.createGain()); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(m.gain);
      v.play(lfo, t, end + 0.03);
      n.connect(m); n = m;
    }
    const g = v.add(c.createGain());
    this._env(g.gain, t, a, o.g, h, d);
    n.connect(g); g.connect(dest);
    v.play(s, t, end + 0.03, Math.random() * (buf.duration - 0.5));
    return s;
  }

  // 飽和：大型撞擊的本體先過 tanh（增加諧波密度，小喇叭也聽得出「厚」）；回傳輸入節點
  _sat(v, dest, drive, out) {
    const c = this.ctx, pre = v.add(c.createGain()), sh = v.add(c.createWaveShaper()), post = v.add(c.createGain());
    pre.gain.value = drive; sh.curve = this.curves.soft; post.gain.value = out;
    pre.connect(sh); sh.connect(post); post.connect(dest);
    return pre;
  }

  // 子匯流排：回傳一個增益節點（→ dest），另外以 sg 送進 send（回音／殘響）
  _sub(v, dest, send, sg) {
    const c = this.ctx, g = v.add(c.createGain());
    g.connect(dest);
    if (send) { const x = v.add(c.createGain()); x.gain.value = sg; g.connect(x); x.connect(send); }
    return g;
  }

  // 次低頻下墜：正弦往下滑＋飽和（小喇叭也聽得到諧波）
  _thump(v, dest, t, f0, f1, g, d, drive) {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + d * 0.6);
    const pre = v.add(c.createGain()); pre.gain.value = drive || 1;
    const sh = v.add(c.createWaveShaper()); sh.curve = this.curves.soft;
    const eg = v.add(c.createGain());
    const end = this._env(eg.gain, t, 0.004, g, 0, d);
    osc.connect(pre); pre.connect(sh); sh.connect(eg); eg.connect(dest);
    v.play(osc, t, end + 0.03);
  }

  // 金屬撞擊：不諧和泛音（高頻衰減較快）＋短促雜訊瞬態
  _clank(v, dest, t, f, g, d, ratios) {
    const R = ratios || BAR;
    for (let i = 0; i < R.length; i++) {
      const fi = f * R[i] * rnd(0.985, 1.015);
      if (fi > 16000) break;
      this._T(v, dest, { t, f: fi, a: 0.0015, d: d * rnd(0.7, 1) / (1 + i * 0.6), g: g / (1 + i * 0.7) });
    }
    this._N(v, dest, { t, b: 'w', a: 0.0005, d: 0.025, g: g * 1.2, ft: 'bandpass', f: Math.min(f * 4, 9000), q: 1.5 });
  }

  // 關節嘎吱：低頻鋸齒脈衝串通過共振帶通（摩擦黏滑）
  _creak(v, dest, t, dur, g) {
    const f = rnd(38, 70);
    const osc = this._T(v, dest, { t, type: 'sawtooth', f, a: dur * 0.25, h: dur * 0.35, d: dur * 0.4, g, ft: 'bandpass', ff: rnd(650, 1300), fq: 8 });
    osc.frequency.linearRampToValueAtTime(f * rnd(1.2, 1.6), t + dur * 0.5);
    osc.frequency.linearRampToValueAtTime(f * rnd(0.7, 0.95), t + dur);
  }

  // 顆粒層：同一條雜訊用一串短包絡切成碎響（碎裂、礫石、電弧、震動雜音）
  // o = { t, dur, b, ft, f, fr:[lo,hi], q, g, gd:[lo,hi], gap:[lo,hi], fade }
  _gran(v, dest, o) {
    const c = this.ctx, buf = this.nb[o.b || 'w'];
    const s = c.createBufferSource();
    s.buffer = buf; s.loop = true;
    const b = this._filt(v, o.ft || 'bandpass', o.f || (o.fr ? o.fr[0] : 2000), o.q ?? 1);
    const g = v.add(c.createGain());
    const p = g.gain, t0 = o.t, t1 = o.t + o.dur;
    p.setValueAtTime(E, t0);
    let tk = t0 + rnd(0, o.gap[0]), n = 0;
    while (tk < t1 && n < 64) {
      const gd = rnd(o.gd[0], o.gd[1]);
      const k = o.fade ? 1 - 0.85 * (tk - t0) / o.dur : 1;
      if (o.fr) b.frequency.setValueAtTime(rnd(o.fr[0], o.fr[1]), tk);
      p.setValueAtTime(E, tk);
      p.linearRampToValueAtTime(Math.max(E * 2, o.g * k * rnd(0.35, 1)), tk + 0.0008);
      p.exponentialRampToValueAtTime(E, tk + 0.0008 + gd);
      tk += 0.0008 + gd + rnd(o.gap[0], o.gap[1]);
      n++;
    }
    s.connect(b); b.connect(g); g.connect(dest);
    v.play(s, t0, tk + 0.03, Math.random() * (buf.duration - 0.5));
  }

  // ───────────────────────── 內部：循環音 ─────────────────────────

  // 自機推進器：低頻轟鳴＋噴流吼聲＋高頻嘶聲＋次低頻＋渦輪鳴，燃燒抖動
  _boostLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const out = R.gain(0, this.bus.hull);
    const fl = R.gain(1, out);                 // 燃燒抖動
    const flo = R.osc('sine', 11.3, null, t);
    const flg = R.gain(0.12); flo.connect(flg); flg.connect(fl.gain);
    const lp = R.filt('lowpass', 150, 0.9, R.gain(1.1, fl));
    R.noise(nb.b, lp, t);
    const bp = R.filt('bandpass', 700, 0.9, R.gain(0.9, fl));
    R.noise(nb.p, bp, t);
    R.noise(nb.w, R.filt('highpass', 2600, 0.7, R.gain(0.16, fl)), t);
    R.osc('sine', 44, R.gain(0.22, fl), t);
    const tw = R.osc('sine', 700, R.gain(0.018, fl), t);
    // 噴流「呼——」：較高頻段的白噪帶通，出力越高越亮
    const js = R.filt('bandpass', 2000, 0.8, R.gain(0.3, fl));
    R.noise(nb.w, js, t);
    Object.assign(R, { out, lp, bp, tw, js, call: t, on: t });
    return R;
  }

  // 推進器點火：次低頻「轟」＋噴流「呼——」（帶通由低掃高）＋點火劈啪
  _boostIgnite(lv) {
    const v = this._voice(this.bus.hull, 1); if (!v) return;
    const t = this._now(), o = v.out, k = 0.5 + 0.5 * lv;
    this._thump(v, o, t, 72, 30, 0.32 * k, 0.5, 1.8);
    this._N(v, o, { t, b: 'p', a: 0.05, h: 0.08, d: 0.45, g: 0.45 * k, ft: 'bandpass', f: 380, f1: 1800, gl: 0.35, q: 0.9 });
    this._N(v, this.bus.arm, { t, b: 'w', a: 0.001, d: 0.05, g: 0.15 * k, ft: 'highpass', f: 2500 });
    v.done();
  }

  _boostSet(lv) {
    const now = this.ctx.currentTime;
    if (!this.bl) {
      if (lv < 0.005) return;
      this.bl = this._boostLoop();
      this.bl.lv = 0;
    }
    const B = this.bl;
    // 從幾乎熄火推到高出力：點火「轟——呼」
    if (lv > 0.35 && B.lv < 0.08) this._boostIgnite(lv);
    B.lv = lv;
    B.call = now;
    this._st(B.out.gain, 0.38 * Math.pow(lv, 0.8), now, 0.07);
    this._st(B.bp.frequency, 420 + 1200 * lv, now, 0.12);
    this._st(B.lp.frequency, 110 + 200 * lv, now, 0.12);
    this._st(B.tw.frequency, 700 + 900 * lv, now, 0.2);
    this._st(B.js.frequency, 1300 + 1900 * lv, now, 0.15);
    if (lv >= 0.005) B.on = now;
    else if (now - B.on > 1.0) { B.kill(now + 0.05); this.bl = null; }
  }

  // 敵機推進器：粉紅噪帶通＋棕噪低頻，外接距離低通、聲像、衰減、殘響
  _ebLoop() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c);
    const g = R.gain(0, this.bus.world);
    const sg = R.gain(0, this.rvbIn);
    const pn = R.pan(g); pn.connect(sg);
    const lp = R.filt('lowpass', 8000, 0.5, pn);
    const bp = R.filt('bandpass', 900, 0.8, lp);
    R.noise(this.nb.p, bp, t);
    R.noise(this.nb.b, R.filt('lowpass', 200, 0.8, R.gain(1.2, lp)), t);
    Object.assign(R, { g, sg, pn, lp, bp, seen: t, on: t });
    return R;
  }

  _ebKill(id, e) {
    const now = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, now, 0.06);
    e.sg.gain.setTargetAtTime(0, now, 0.06);
    e.kill(now + 0.4);
    this.eb.delete(id);
  }

  // 載具引擎：共用 距離低通 → 聲像 → 衰減（world）＋城市殘響；各車種的聲源接在 lp 前
  _vlLoop(kind) {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb, P = VEH[kind];
    const g = R.gain(0, this.bus.world), sg = R.gain(0, this.rvbIn);
    const pn = R.pan(g); pn.connect(sg);
    const lp = R.filt('lowpass', 8000, 0.5, pn);
    Object.assign(R, { kind, g, sg, pn, lp, seen: t, tp: t, vr: 0, d: 0, dp: 0 });
    if (kind === 'tank' || kind === 'apc') {
      // 柴油引擎：低頻鋸齒＋次八度方波，棕噪以點火頻率調幅（突突突）
      const eng = R.osc('sawtooth', P.f, R.filt('lowpass', 160, 1.2, R.gain(0.5, lp)), t);
      const sub = R.osc('square', P.f / 2, R.filt('lowpass', 90, 0.8, R.gain(0.3, lp)), t);
      const rum = R.gain(0.6, lp);
      R.noise(nb.b, R.filt('lowpass', 260, 0.7, rum), t);
      const fire = R.osc('sine', P.f / 2, null, t), fg = R.gain(0.4);
      fire.connect(fg); fg.connect(rum.gain);
      // 履帶：粉紅噪帶通＋鏈節金屬鳴，被方波閘門切成喀啦喀啦（速率跟油門）
      const cg = R.gain(0.3, lp), clat = R.gain(0.5, cg);
      R.noise(nb.p, R.filt('bandpass', 1500, 1.4, clat), t);
      R.osc('square', 190, R.filt('bandpass', 850, 7, R.gain(0.12, clat)), t);
      const clk = R.osc('square', P.c0, null, t), kg = R.gain(0.5);
      clk.connect(kg); kg.connect(clat.gain);
      Object.assign(R, { eng, sub, fire, clk, cg });
    } else if (kind === 'heli') {
      // 旋翼：正弦 LFO 經窄脈衝曲線 → 切碎低頻雜訊＋低頻「砰」；渦輪高頻鳴＋嘶聲
      const rot = R.osc('sine', P.r0, null, t);
      const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.chop;
      const chop = R.gain(0, lp);
      rot.connect(sh); sh.connect(chop.gain);
      R.noise(nb.p, R.filt('lowpass', 700, 0.8, R.gain(1.4, chop)), t);
      R.osc('sine', 62, R.gain(0.8, chop), t);
      const wh = R.osc('sine', 3200, R.gain(0.025, lp), t);
      R.noise(nb.w, R.filt('bandpass', 2600, 1.5, R.gain(0.06, lp)), t);
      R.noise(nb.b, R.filt('lowpass', 160, 0.7, R.gain(0.35, lp)), t);
      Object.assign(R, { rot, wh });
    } else {
      // 噴射機：粉紅噪帶通（呼嘯）＋高頻嘶＋低頻轟＋渦輪鋸齒鳴
      const bp = R.filt('bandpass', 900, 0.7, R.gain(1.0, lp));
      R.noise(nb.p, bp, t);
      R.noise(nb.w, R.filt('highpass', 3000, 0.7, R.gain(0.25, lp)), t);
      R.noise(nb.b, R.filt('lowpass', 220, 0.7, R.gain(0.7, lp)), t);
      const wh = R.osc('sawtooth', 2000, R.filt('lowpass', 4000, 1, R.gain(0.05, lp)), t);
      Object.assign(R, { bp, wh });
    }
    return R;
  }

  _vlSet(e, P, G, lv, dop, now) {
    let lvl = P.g * (0.55 + 0.45 * lv) * G.att;
    if (e.kind === 'jet') lvl *= clamp(dop * dop, 0.5, 2);    // 迎面而來特別響
    this._st(e.g.gain, lvl, now, 0.08);
    this._st(e.sg.gain, P.rv * Math.min(1, Math.sqrt(G.att) * 1.25) * (0.5 + 0.5 * lv), now, 0.1);
    if (e.pn.pan) this._st(e.pn.pan, G.pan, now, 0.08);
    this._st(e.lp.frequency, G.fc, now, 0.08);
    if (e.eng) {
      const f = P.f * (1 + 0.7 * lv) * dop;
      this._st(e.eng.frequency, f, now, 0.2);
      this._st(e.sub.frequency, f / 2, now, 0.2);
      this._st(e.fire.frequency, f / 2, now, 0.2);
      this._st(e.clk.frequency, P.c0 + P.c1 * lv, now, 0.2);
      this._st(e.cg.gain, 0.12 + 0.88 * lv, now, 0.15);
    } else if (e.rot) {
      this._st(e.rot.frequency, (P.r0 + P.r1 * lv) * dop, now, 0.3);
      this._st(e.wh.frequency, (3000 + 700 * lv) * dop, now, 0.2);
    } else {
      this._st(e.wh.frequency, (1500 + 900 * lv) * dop, now, 0.06);
      this._st(e.bp.frequency, (700 + 600 * lv) * dop, now, 0.06);
    }
  }

  _vlKill(id, e, fast) {
    const now = this.ctx.currentTime, tc = fast ? 0.03 : 0.08;
    e.g.gain.cancelScheduledValues(now); e.g.gain.setTargetAtTime(0, now, tc);
    e.sg.gain.cancelScheduledValues(now); e.sg.gain.setTargetAtTime(0, now, tc);
    e.kill(now + tc * 6);
    this.vl.delete(id);
  }

  // 低裝甲警報：同一支 LFO 同時控制「開關閘門」與「音高上揚」，完全在音訊圖內自走
  _klaxon() {
    const c = this.ctx, t = this._now(), R = new Rig(c);
    const out = R.gain(0, this.bus.cab);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.17, t + 0.15);
    const lp = R.filt('lowpass', 2000, 1, out);
    const amp = R.gain(0, lp);
    const o1 = R.osc('sawtooth', 330, amp, t);
    const o2 = R.osc('square', 495, R.gain(0.35, amp), t);
    const lfo = R.osc('sine', 1.3, null, t);
    const sh = R.add(c.createWaveShaper()); sh.curve = this.curves.gate;
    lfo.connect(sh); sh.connect(amp.gain);
    const p1 = R.gain(28), p2 = R.gain(42);
    lfo.connect(p1); p1.connect(o1.frequency);
    lfo.connect(p2); p2.connect(o2.frequency);
    R.out = out;
    return R;
  }

  _lockBeep(t, missile) {
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out;
    if (missile) {
      this.lockAlt ^= 1;
      const f = this.lockAlt ? 2280 : 1860;
      this._T(v, o, { t, type: 'square', f, a: 0.002, h: 0.035, d: 0.03, g: 0.08, ft: 'lowpass', ff: 5000 });
      this._T(v, o, { t, f: f / 2, a: 0.002, h: 0.035, d: 0.03, g: 0.09 });
    } else {
      this._T(v, o, { t, type: 'triangle', f: 1180, a: 0.004, h: 0.05, d: 0.06, g: 0.16 });
      this._T(v, o, { t, f: 2360, a: 0.004, h: 0.05, d: 0.04, g: 0.032 });
    }
    v.done();
  }

  // 開機：繼電器、發電機起轉、自檢嗶聲、資料吱吱、完成和弦（約 2.5 秒）
  _boot(t) {
    const v = this._voice(this.bus.cab, 2); if (!v) return;
    const o = v.out, H = this.bus.hull;
    this._clank(v, H, t, 150, 0.1, 0.25, PLATE);
    this._thump(v, H, t, 70, 40, 0.28, 0.3, 1.5);
    this._N(v, o, { t, b: 'w', a: 0.0005, d: 0.02, g: 0.22, ft: 'bandpass', f: 1800, q: 2 });
    this._N(v, o, { t: t + 0.13, b: 'w', a: 0.0005, d: 0.02, g: 0.16, ft: 'bandpass', f: 2400, q: 2 });
    this._T(v, H, { t: t + 0.1, type: 'sawtooth', f: 28, f1: 220, gl: 2.0, a: 0.6, h: 1.2, d: 0.6, g: 0.09, ft: 'lowpass', ff: 160, ff1: 1400, fgl: 2.0, fq: 2.5 });
    this._T(v, H, { t: t + 0.1, f: 36, f1: 72, gl: 2.0, a: 0.8, h: 1.0, d: 0.6, g: 0.16 });
    this._T(v, o, { t: t + 0.2, f: 700, f1: 3100, gl: 1.9, a: 0.7, h: 1.0, d: 0.5, g: 0.012 });
    [0.42, 0.58, 0.74, 0.9, 1.06, 1.22, 1.38].forEach((dt, i) => {
      this._T(v, o, { t: t + dt, type: 'triangle', f: 520 * Math.pow(2, i / 6), a: 0.003, h: 0.035, d: 0.06, g: 0.065 });
    });
    let tc = t + 1.5;
    for (let i = 0; i < 10; i++) {
      this._T(v, o, { t: tc, type: 'square', f: rnd(1400, 3600), a: 0.001, h: 0.012, d: 0.015, g: 0.018, ft: 'lowpass', ff: 6000 });
      tc += rnd(0.04, 0.07);
    }
    const tf = t + 2.2;
    for (const [f, g, type] of [[440, 0.05, 'triangle'], [880, 0.055, 'sine'], [1318.5, 0.04, 'sine'], [1760, 0.03, 'sine']]) {
      this._T(v, o, { t: tf, type, f, a: 0.008, d: 0.8, g });
    }
    v.done();
  }

  // 常駐環境音：座艙電氣嗡聲、反應爐低頻脈動、渦輪細鳴、空調氣流、外面的風
  _startAmbience() {
    const c = this.ctx, t = c.currentTime, R = new Rig(c), nb = this.nb;
    const g = this.ambG;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.65, t + 2.5);
    // 電氣嗡聲
    const hum = R.gain(0.01, g);
    R.osc('sawtooth', 59.7, R.filt('lowpass', 380, 0.8, hum), t);
    R.osc('sine', 119.6, R.gain(0.4, hum), t);
    // 反應爐：低頻雜訊＋41 Hz，0.37 Hz 緩慢脈動
    const rx = R.gain(0.1, g);
    R.noise(nb.b, R.filt('lowpass', 95, 1.2, rx), t);
    R.osc('sine', 41, R.gain(0.35, rx), t);
    const th = R.osc('sine', 0.37, null, t), thg = R.gain(0.035);
    th.connect(thg); thg.connect(rx.gain);
    // 渦輪細鳴
    const wo = R.osc('sine', 2330, R.gain(0.0022, g), t);
    const vib = R.osc('sine', 0.23, null, t), vg = R.gain(6);
    vib.connect(vg); vg.connect(wo.frequency);
    // 空調氣流
    R.noise(nb.p, R.filt('bandpass', 1300, 0.6, R.gain(0.018, g)), t);
    // 外面的風：走 world 匯流排（被座艙隔音悶掉），兩支慢 LFO 做陣風
    const wf = R.gain(0, this.bus.world);
    wf.gain.setValueAtTime(0, t);
    wf.gain.linearRampToValueAtTime(1, t + 4);
    const wind = R.gain(0.05, wf);
    const wbp = R.filt('bandpass', 420, 0.9, wind);
    R.noise(nb.p, wbp, t);
    for (const [f, dpt] of [[0.071, 0.03], [0.13, 0.015]]) {
      const l = R.osc('sine', f, null, t), lg = R.gain(dpt);
      l.connect(lg); lg.connect(wind.gain);
    }
    const wl = R.osc('sine', 0.053, null, t), wlg = R.gain(160);
    wl.connect(wlg); wlg.connect(wbp.frequency);
    this.amb = R;
  }

  // ───────────────────────── 內部：建構 ─────────────────────────

  // 預先產生雜訊（白、粉紅、棕），各 2～3 秒，循環接縫交叉淡化，均方根統一為 0.3
  _makeNoise() {
    const c = this.ctx, sr = c.sampleRate, X = 2048;
    const mk = (sec, fill) => {
      const n = Math.floor(sr * sec), tmp = new Float32Array(n + X);
      fill(tmp);
      for (let i = 0; i < X; i++) { const w = i / X; tmp[i] = tmp[i] * w + tmp[n + i] * (1 - w); }
      let mean = 0; for (let i = 0; i < n; i++) mean += tmp[i];
      mean /= n;
      let ss = 0; for (let i = 0; i < n; i++) { const x = tmp[i] - mean; ss += x * x; }
      const k = 0.3 / Math.sqrt(ss / n || 1);
      const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (tmp[i] - mean) * k;
      return b;
    };
    const white = (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1; };
    const pink = (a) => {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < a.length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        a[i] = b0 + b1 + b2 + w * 0.1848;
      }
    };
    const brown = (a) => {
      let y = 0;
      for (let i = 0; i < a.length; i++) { y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02; a[i] = y; }
    };
    this.nb = { w: mk(2, white), p: mk(3, pink), b: mk(3, brown) };
  }

  _makeCurves() {
    const N = 1024;
    const soft = new Float32Array(N), clip = new Float32Array(2048), gate = new Float32Array(N), chop = new Float32Array(N);
    const k = 1.6, tk = Math.tanh(k);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      soft[i] = Math.tanh(k * x) / tk;
      chop[i] = Math.pow((x + 1) / 2, 10);   // 旋翼：每週期一個窄脈衝
      // 閘門：LFO 過了 -0.1 才開，平滑過渡（無爆音）
      const u = clamp((x + 0.1) / 0.4, 0, 1);
      gate[i] = u * u * (3 - 2 * u);
    }
    for (let i = 0; i < 2048; i++) {
      // 軟削波：0.8 以內完全線性，超過才柔和壓到 0.95 以內
      const x = (i / 2047) * 2 - 1, ax = Math.abs(x);
      const y = ax <= 0.8 ? ax : 0.8 + 0.2 * Math.tanh((ax - 0.8) / 0.2);
      clip[i] = x < 0 ? -y : y;
    }
    this.curves = { soft, clip, gate, chop };
  }

  // 產生殘響脈衝響應：擴散尾巴（越晚越悶）＋離散早期反射
  _makeIR(P) {
    const c = this.ctx, sr = c.sampleRate, n = Math.floor(sr * P.sec);
    const ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fc = P.fEnd + (P.fStart - P.fEnd) * Math.exp(-t * P.dark);
        const a = Math.exp(-2 * Math.PI * fc / sr);
        y = (1 - a) * (Math.random() * 2 - 1) + a * y;
        const on = t < P.pre ? 0 : Math.min(1, (t - P.pre) / P.rise);
        d[i] = y * on * P.diff * Math.exp(-t * P.decay);
      }
      for (const [tt, amp] of P.taps) {
        const i0 = Math.floor((tt * rnd(0.92, 1.08) + ch * rnd(0.002, 0.009)) * sr);
        const len = Math.floor(sr * 0.006);
        let z = 0;
        for (let j = 0; j < len && i0 + j < n; j++) {
          z = 0.55 * z + 0.45 * (Math.random() * 2 - 1);
          d[i0 + j] += amp * z * Math.exp(-j / (sr * 0.002));
        }
      }
    }
    return ir;
  }

  _buildGraph() {
    const c = this.ctx;
    const G = (v, dest) => { const g = c.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; };
    const F = (type, f, q, dest) => {
      const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
      if (dest) b.connect(dest);
      return b;
    };
    // 輸出段：混音 → 壓縮 → 限幅 → 軟削波 → 主音量 → 暫停閘 → 喇叭
    this.pauseG = G(this.paused ? 0 : 1, c.destination);
    this.masterG = G(this.vol, this.pauseG);
    const clip = c.createWaveShaper(); clip.curve = this.curves.clip; clip.connect(this.masterG);
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    lim.connect(clip);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.3;
    comp.connect(lim);
    this.mix = G(0.8, comp);

    // 城市殘響（world 與 arm 的回音），回授進座艙隔音低通
    const wLP = F('lowpass', 7600, 0.55, this.mix);
    this.rvbIn = G(1);
    const rv = c.createConvolver(); rv.normalize = true; rv.buffer = this._makeIR(CITY_IR);
    this.rvbIn.connect(F('highpass', 160, 0.7, rv));
    rv.connect(G(0.5, wLP));
    // 座艙小空間殘響
    const cv = c.createConvolver(); cv.normalize = true; cv.buffer = this._makeIR(COCKPIT_IR);
    this.cabVerb = G(1, cv);
    cv.connect(G(0.3, this.mix));

    const hShelf = F('lowshelf', 110, 0.7, F('lowpass', 4200, 0.6, this.mix));
    hShelf.gain.value = 5;
    this.bus = {
      hull: G(1, hShelf),                                  // 自機結構音：低通＋低頻加強
      arm: G(1, F('lowpass', 11000, 0.5, this.mix)),       // 自機武器
      cab: G(1, F('highpass', 130, 0.7, this.mix)),        // 座艙內部（小喇叭質感）
      world: G(1, wLP),                                    // 外界：座艙隔音低通
    };
    this.bus.hull.connect(G(0.1, this.cabVerb));
    this.bus.cab.connect(G(0.15, this.cabVerb));
    this.bus.arm.connect(G(0.3, this.rvbIn));
    this.ambDuck = G(1, this.mix);
    this.ambG = G(0, this.ambDuck);
    // 音效回音（光束等的長尾巴）：左右兩條不同長度的延遲，回授經低通＋高通越回越暗越薄，另送一點進城市殘響
    this.echoIn = G(1);
    for (const [dt, pn] of [[0.19, -0.55], [0.27, 0.55]]) {
      const dl = c.createDelay(1); dl.delayTime.value = dt;
      const hp = F('highpass', 180, 0.6), lp = F('lowpass', 2400, 0.5, hp);
      this.echoIn.connect(dl); dl.connect(lp);
      hp.connect(G(0.42, dl));
      const pp = c.createStereoPanner ? c.createStereoPanner() : c.createGain();
      if (pp.pan) pp.pan.value = pn;
      hp.connect(pp); pp.connect(G(0.5, this.mix));
    }
    this.echoIn.connect(G(0.35, this.rvbIn));

    // 配樂：各曲目 → musIn → 閃避 → 危急低通 → 配樂音量 → mix（一樣經過壓縮、限幅、主音量、暫停閘）
    this.musVolG = G(this.musVol * MUS_K, this.mix);
    this.musPulse = G(1, this.musVolG);
    this.musLP = F('lowpass', this._dangerWant ? 1500 : 20000, 0.6, this.musVolG);
    this.musDuck = G(1, this.musLP);
    this.musIn = G(1, this.musDuck);
    const hv = c.createConvolver(); hv.normalize = true; hv.buffer = this._makeIR(HALL_IR);
    this.musRvb = G(1, F('highpass', 220, 0.7, hv));
    hv.connect(G(0.55, this.musIn));
    // 主旋律／鋼琴的附點八分延遲（回授經低通，越回越暗）
    const dl = c.createDelay(2); dl.delayTime.value = 0.29;
    const dlp = F('lowpass', 2800, 0.5);
    dl.connect(dlp); dlp.connect(G(0.3, dl)); dlp.connect(G(0.45, this.musIn));
    this.musDly = dl;
    this.musDlyIn = G(1, dl);
  }
}

// 任何音效錯誤都不能拖垮遊戲迴圈：公開方法一律包 try／catch，只警告一次。
for (const k of [
  'unlock', 'setVolume', 'setPaused', 'setListener', 'footstep', 'servo', 'boost', 'quickBoost', 'jump', 'land',
  'beam', 'missileLaunch', 'reload', 'saberOn', 'saberOff', 'saberSwing', 'lockTick', 'lockMulti', 'hitmarker',
  'hurt', 'alert', 'setLockAlert', 'setDanger', 'overdrive', 'ui', 'enemyStep', 'enemyBoost', 'enemyBeam', 'mg',
  'cannon', 'missileLaunch3d', 'whiz', 'impact', 'explosion', 'debris', 'trample',
  'music', 'setIntensity', 'setMusicVolume', 'vehicleLoop', 'vehicleStop',
]) {
  const f = Audio.prototype[k];
  Audio.prototype[k] = function (...args) {
    try { return f.apply(this, args); } catch (e) {
      this.lastError = e;
      if (!this._warned) { this._warned = true; console.warn('[audio] ' + k + ' 失敗：', e); }
    }
  };
}
