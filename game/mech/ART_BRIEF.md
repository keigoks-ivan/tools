# 美術任務單：《鋼鐵黃昏 IRON DUSK》機體外型做到「擬真、很強」

## 背景
- 瀏覽器 3D 第一人稱機器人遊戲。three.js r166（本地 `game/lib/three.module.js`，addons 在 `game/lib/addons/`），純 ES module，沒有 build、沒有 npm、不可加 CDN。
- 本機預覽：在 repo 根目錄跑 `python3 -m http.server 8944`，開 `http://localhost:8944/game/mech/?show=all`（也可 `?show=hero`、`grunt`、`ace`、`heavy`）。
  - 滑鼠拖曳＝旋轉、滾輪＝縮放。
  - 數字鍵切換動作：1 站、2 走、3 跑、4 衝刺、5 空中、6 原地轉、7 倒退、8 側走。
- 用戶對現況的評語：「像玩具」「完全不行」。現在是方塊拼的，比例不對，沒有細節，看起來像塑膠。
- 參考方向：
  - 現代鋼彈設計的英雄比例：小頭、寬胸寬肩、細腰、長腿、大腳。主角機配色是白＋深藍＋藍＋紅＋金色 V 字天線。
  - 高階模型（MG／PG 等級）的分件方式與細節密度。
  - 擬真硬表面質感參考《Armored Core 6》《Titanfall 2》《鋼彈 EVOLUTION》。
- **必須是原創設計**：不能出現 Gundam、鋼彈、Bandai 等字樣或 Logo，也不能拿別人做好的鋼彈模型檔。

## 你只改這些檔
- `game/mech/mechs.js`：機體外型、材質、塗裝。**這是主要工作。**
- `game/mech/textures.js`、`game/mech/assets/`：貼圖。
  - 只能用 CC0 素材（例如 ambientCG、Poly Haven）。
  - 來源寫進 `assets/CREDITS.md`。
  - 新增的檔案加起來 ≤ 8 MB。

**不要動**這些檔（另一個 AI 同時在改，會打架）：
- `anim.js`（動作）
- `main.js`、`post.js`、`env.js`、`index.html`
- 之後會出現的 `cockpit.js`、`combat.js`、`fx.js`、`hud.js`、`audio.js`

不要 git commit，也不要 push。

## 必須保留的介面
動作系統（`anim.js`）和遊戲邏輯靠這些運作，名字和意思都不能變。

1. **匯出與建構子**
   - `export function initMechMaterials(A)`：`A` 是 `env.js` 的 `loadAssets()` 回傳值，已經有 `A.wearM`、`A.wearN`、`A.frameM`、`A.frameN`。
   - `export class Mech`，`constructor(style, schemeKey)`：
     - `style` ＝ `'hero'`、`'grunt'`、`'heavy'`
     - `schemeKey` ＝ `'hero'`、`'grunt'`、`'ace'`、`'heavy'`
   - `export { wrap, lerpAngle, damp }` 要保留。
2. **骨架名稱與階層不能改**
   - `root → pelvis → torso → { head, back, shoulderR → elbowR → handR, shoulderL → elbowL → handL }`
   - `pelvis → hipR → kneeR → ankleR`，以及 `hipL → kneeL → ankleL`
   - 座標單位是公尺：+Y 朝上、+Z 朝前、右邊（R）在 −X。
   - 每個零件都要掛在對應的骨頭底下，才會跟著動。
3. **比例由 `this.L` 決定**
   - 數值可以改，但要符合：
     - 所有旋轉歸零時，腳底剛好在 y＝0。
     - 大腿長＝`kneeX.position` 的長度，小腿長＝`ankleX.position` 的長度。IK 會自己讀這兩個值。
   - 可以另外設 `this.footToe`、`this.footHeel`：腳踝到腳尖、腳踝到腳跟的水平距離，踮腳動作會用到。
4. **欄位與方法要保留**
   - 欄位：`root`、`bones`、`meshes`（所有會投影子的機體網格）、`glows`、`nozzles`、`height`、`scale`（getter）、`pose`、`legYaw`、`land`、`landV`、`thrust`、`recoil`、`swing`、`motion`。
   - `weapon`：右手武器的 Group。武器在自己的座標裡沿 +Z 建模。
   - `muzzleLocal`：槍口位置（武器座標）。`muzzle` 也要留。
   - `saber`：左手光劍的 Group，平常 `visible = false`。
   - `eye`：單眼機的眼睛 Mesh，會沿頭部滑軌左右移動。如果改了頭型，請設定 `this.eyeRail = { r, y, sz }`（滑軌半徑、高度、前後拉伸倍數）。
   - `flames`：推進器火焰，格式是 `{ g, len }`。`g` 是 Group，它的 `scale.y` 會被拿來伸縮火焰長度。
   - 方法：`animate(dt, st)`、`impact(s)`、`setFirstPerson(on)`、`capsule()`、`shatter()`。
5. **第一人稱**
   - `setFirstPerson(true)` 會讓手臂以外的部位只投影子、不顯示，因為玩家坐在駕駛艙裡，只看得到自己的手和武器。
   - 請維持「每根骨頭合併成一個網格」或同等的做法。

## 效能預算
- 同一個畫面最多 8 台。
- 三角形：主角機 ≤ 80k，敵機 ≤ 50k。
- 每台的 draw call ≤ 30：同材質零件要合併。
- 目標：M1／M2 等級的 GPU、1080p 跑 60 fps。
- 盡量不要加燈光：每台最多 1 盞 PointLight，最好 0 盞。
- 數字可以在 console 看：`__renderer.info.render.triangles`、`__renderer.info.render.calls`。

## 美術要求（照重要度排）
1. **比例與輪廓**
   - 英雄比例，剪影要一眼認得出來。
   - 主角機 XG-01「蒼焰」（2026-09 依用戶參考圖重做，要像鋼彈）：金色 V 字天線、雙眼＋面罩＋紅下巴、深藍胸甲＋黃色進氣口、細腰、紅色腹甲、大而有稜角的白色肩甲、長腿、往下外擴的小腿、大腳、背包雙推進器＋光劍柄＋收合翼板、紅框白底星徽盾。站姿參數 `this.stance`（兩腳張開、挺胸）由 anim.js 讀。胸口艙門與 `cockpitLocal` 位置不能動（前傳結尾要對上維修架）。
   - 敵機 AGX-9「獵犬」：單眼、圓頂頭、臉部管線、左肩尖刺護甲、右肩弧形肩盾。指揮官機是紅色加頭上一支角；重裝機是鐵灰色，比例放大 1.25 倍，肩上有飛彈艙。
   - 站姿要帥：腳微開、重心在中間。
2. **分層結構**
   - 外裝甲底下要看得到深色內骨架（frame），還有油壓桿、關節軸、蛇腹管、螺栓、散熱格柵、推進器噴口的內層。
   - 裝甲板要有厚度、倒角、分件縫。分件縫用幾何縫隙或法線做，**不要用格子貼圖**。
3. **材質**：要像 1:1 的真實機械，不像塑膠。
   - 敵機用霧面軍用漆，主角機用半光澤漆。
   - 邊緣磨亮、掉漆露出金屬、雨痕、腳部泥土沙塵、噴口燒焦變色。
   - 各部位粗糙度要不同。
   - 零件沒有 UV，要用貼圖就用三面投影（triplanar）。
   - 現在的做法：每個頂點帶一個 `pbr` 屬性，內容是金屬度、粗糙度、是否倒角邊、靜止時離地高度，shader 用它算磨損。可以沿用，也可以換更好的做法。
4. **貼花**
   - 警示條紋、機體編號、小字警告標示。
   - 文字自己編，用英文，例如 "CAUTION"、"NO STEP"、"XG-01"。
5. **發光件**
   - 眼睛、感應器、推進器要會泛光（bloom）。
   - 用顏色值大於 1 的 `MeshBasicMaterial`，後製會自動讓它發光。

## 驗收
- 用 `?show=all` 截四台的正面、側面、背面。
- 用 `?show=hero` 拉近看胸口和腳。
- 按數字鍵 2、3、4 看走、跑、衝刺：
  - 零件不能嚴重穿模。
  - 腳底不能浮空，也不能陷進地面。
- 瀏覽器 console 不能有錯誤。

## 回報
- 改了什麼。
- 每台的三角形數和 draw call 數。
- 截圖存放的路徑。
