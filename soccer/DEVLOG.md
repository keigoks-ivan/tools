# 世界盃 2026：阿根廷 vs 西班牙 — 開發交接

> 2026-07-19 首版。網址 tools.investmquest.com/soccer/，push main 自動部署。
> 本機測試：repo 根目錄 `python3 -m http.server 8931` → http://localhost:8931/soccer/
> **改 main.js 後必須 bump index.html 的 `main.js?v=` 版本參數**

## 架構（main.js 單檔）

- three.js 從 `../game/lib/three.module.js` 共用，無 addons、無後處理（renderer 原生 AA 直接生效）
- `TEAMS{ARG,ESP}` 資料驅動：真實名單（2026 世界盃實際 26 人名單的首發 XI，WebSearch 查證）＋
  pace/skill/shot 能力值；**之後選隊功能＝加名單資料＋選單**（jerseyStyle: stripes/solid）
- `XI_ANCHOR` 4-3-3 陣型錨點（依 team.dir 鏡射；半場交換=翻 dir）
- 球員＝程序生成小人（球衣 canvas 貼圖/短褲/膚色/頭髮/腿臂擺動）＋頭頂名牌 sprite＋blob 影子
- 球физ：重力/彈跳/滾動摩擦、owner 吸附帶球、kick 後 freeK 免疫 0.3s 防回黏
- 操控（p===controlled 才讀搖桿！AI 用自身朝向）：J 傳（方向選人+提前量）、E 直塞長傳、
  K 蓄力射門（power 條）、Shift 衝刺、Space 鏟球、Q 換人；傳球後自動切到接應者（pendingReceiver）
- AI：chasers 每幀預算（最近兩人壓迫）、其餘錨點+隨球偏移站位；持球 AI 每 0.45s 決策
  （射門距離+shot 加權/受壓傳球/帶球避人）；GK 站位跟球+撲救+持球 1s 後大腳
- 比賽流程：freeze 狀態機（開球/界外/角球/門球/進球/半場換邊/終場），HALF_LEN=180s×2
- 鏡頭：廣播式側視跟球；雷達 canvas；觀眾噪聲（激動度 AU.excite）+哨音+踢球聲全合成

## 獵魔女團教訓已套用

- 60fps 上限＋自適應 pixelRatio 降階（perfTick）＋全解析度起步（桌機 2x）
- iOS 音訊：ctx.resume + 靜音開關 workaround（無聲 audio 元素）+ pointerdown 喚醒
- 貼圖 anisotropy；無泛光後處理（GPU 涼）
- 版本參數防快取；只 add 自己的檔案；navbar 註冊在 js/navbar.js SECONDARY_TOOLS

## 2026-07-19 二輪：真人化

- 球員改 **Soldier.glb**（three.js 官方範例，Mixamo 真人模型＋Idle/Walk/Run 真動畫，MIT）：
  SkeletonUtils.clone ×22、素色隊服（去軍裝貼圖、color=隊色）、visor 隱藏
- **換頭術**：動畫的 Head.scale 軌 ×0.06 縮沒頭盔頭 → 自訂頭（膚色/髮型/鬍子依 22 人外觀資料）
  掛 mixamorig:Head，反向縮放 = 1/(頭骨世界縮放×0.06)（含 armature 0.01 層，要用 getWorldScale 實測！）
- Soldier 原生面向 -Z → root.rotation.y=π 修倒著跑
- 動畫：速度驅動 Idle/Walk/Run crossfade，timeScale 隨速度；freeze 期間也要 mixer.update
- 外觀資料欄位：sk 膚色 0-3／hr short|curly|long|bald／hc 髮色／bd 鬍子（Cucurella long、Yamal curly、
  Otamendi bald、Messi 鬍…）

## 待辦

1. 選隊畫面（TEAMS 擴充更多國家）
2. 越位、犯規/自由球、替補
3. 真實球員臉部/髮型特徵化（目前僅膚色/髮色隨機）
4. 手機實機測試；AI 難度分級
