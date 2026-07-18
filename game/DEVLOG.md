# HUNTR/X：魂門之戰 — 開發交接文件

> 最後更新：2026-07-18（第二輪：選角/新招/地圖縮小/寫實背景）。給下一個 Claude session 的完整脈絡。
> 上線網址：https://tools.investmquest.com/game/（repo push main 即自動部署）
> 本機測試：`python3 -m http.server 8931`（repo 根目錄）→ http://localhost:8931/game/
> **改 main.js 後必須 bump index.html 裡的 `main.js?v=xxx` 版本參數（防快取）**

## 現況（全部已實裝並上線）

- **引擎**：Three.js r166（vendored 於 game/lib/），純前端零依賴，Canvas→WebGL
- **主角**：Mixamo「Maria W/Prop」真人比例女劍士（assets/maria.glb，17MB，13 個動作內嵌，
  瀏覽器內轉檔管線在 tmp-convert/convert.html，可為之後的 Mira/Zoey 重用）
- **戰鬥**：輕連段×4（可循環）＋重攻擊＋連段終結技、Q 切換近戰/魂力彈（遠程劍氣）、
  跳躍＋下墜斬、翻滾 i-frame、連段傷害遞增（75 hits 封頂 +60%）、
  無雙大絕（E，集氣 100 發動 4 秒亂舞＋八方劍氣＋終結大爆發）
- **關卡**：4 關開放戰場（124×124、街區有碰撞）。每關 4 目標（殲滅/據點制壓/敵將討伐
  混排）任意順序攻略＋敵襲事件，全清後 Boss 現身。過關升級（HP+30、攻擊+12%/關）
- **四個世界**（world1-4 Group 切換）：霓虹城區／魂界黑曜荒原／天界雲海聖域／虛空星境，
  各自天空貼圖（skyTex1-4）、配樂（MUSIC[0-3]）、Boss（KINDS.boss~boss4）
- **鏡頭**：真三式貼背旋轉鏡頭（camYaw 跟隨 player.yaw）＋建築遮擋自動淡化
  （updateOcclusion + blockersReg）＋鏡頭建築碰撞
- **音訊**：Web Audio 全合成（零音檔）——4 首 BGM（主旋律+鼓過門+延遲）＋11 種 SFX，M 靜音
- **手機**：虛擬搖桿（鏡頭相對移動）＋攻/重/跳/滾/換/絕 六鍵、效能降級、轉橫提示
- **UI**：HP/無雙量表/武器指示、方形小地圖（目標狀態/敵將/Boss/玩家朝向）、
  敵將頭頂名牌血條、劇情對話框（開場/Boss 叫陣/結局）、S~C 評價結算
- **美術素材**：Gemini 生成天空/標題畫（assets/gen/）＋KayKit CC0（骷髏敵人、城市道具）

## 架構速覽（main.js 單檔 ~2700 行）

- `STAGES[]`：關卡定義（objectives[{type,pos,need/officers,fast,ambush}], bossKind/bossPos）
- `OBSTACLES[]`＋`collideCircle()`：共用碰撞佈局，四世界各自「裝飾」同一組街區
- `blockersReg[]`＋`updateOcclusion()`：鏡頭遮擋淡化（每街區材質清單）
- `updateLevel()`：目標啟動（接近 26m）/增援/完成/巡遊敵/Boss phase
- `KINDS`：minion/runner/elite/boss1-4 敵種參數；`spawnEnemy(kind, x, z)`
- `AU`＋`MUSIC[]`＋`S.*`：音訊；`scheduleMusic()` 依 stageIdx 選曲
- `applyStageTint(i)`：世界可見性＋天空＋霧＋燈光切換
- Debug hooks（console）：`__dbg() __P __E __lvl __stage(i) __warp(k完成前k目標) __switch() __occ() __key(code) __cap()`

## 2026-07-18 第二輪更新（已上線）

- **地圖縮小 25%**：MAP_HALF 62→47（活動區 94×94），STAGES 目標/街區/裝飾/遠景全座標 ×0.75 連動，
  目標啟動半徑 26→20、增援/巡遊生成半徑同步縮
- **鏡頭拉近**：距離 8→6.5、高度 3.9→3.4（真三感、角色更大）
- **選角系統**：`CHARS{rumi,mira,zoey}`＋`buildHero()`；title→charsel overlay（index.html）→start。
  Mira（重刃：dmg×1.28/hp×1.18/spd5.9 藍）Zoey（疾風：dmg×0.82/hp×0.88/spd7.5 金）。
  目前用 Maria 模型＋tint 靈氣代身；`assets/mira.glb`/`zoey.glb` 若存在（tmp-convert 產出）自動採用（`tryLoad`）
- **新招式**：K 長按 0.5s 蓄力震地斬（CHARGE_ATK，光柱+三重衝擊波+閃白）；跑動中輕點 K＝衝刺斬（DASH_ATK，dash:19）；
  遠程重擊＝三連新月（RHEAVY fan:3）、遠程蓄力＝五連貫穿新月（RCHARGE fan:5）；
  完美閃避（翻滾 i-frame 內吃到判定）→ 子彈時間 1.6s（witchT，敵人 dt×0.22）+無雙氣+8
- **主角細緻化**：四階 toon 漸層（gradTex4）；劍身能量刃光（sword mesh 複製+法線外擴 additive）；
  揮劍軌跡帶（`setupSwordFx` 綁定姿勢算劍根/劍尖→掛 marker 於 mixamorigRightHand，`updateTrail` 帶狀淡出）；
  氣滿金環光環（heroAura）；攻擊特效色全部走 curChar.fx
- **劍氣新月化**：crescentTex（雙層新月）+ sprite rotation 對齊行進方向（螢幕空間）
- **背景寫實化**：窗戶貼圖 128×256（樓層帶/窗框/窗簾/污漬/AO 漸層）；world1 樓體改組合式
  （裙樓+退縮塔身×2+女兒牆+屋頂水塔/空調/天線紅燈+霓虹頂緣+斑馬線+直招支柱）；遠景樓加退縮層/尖塔；
  world2 岩石多峰傾斜不等比+熔岩光斑+黑曜碎晶+遠景火山；world3 金拱門×3+天光光柱（w3anim.shafts）；
  world4 能量巨環×3（w4anim.rings）+地表水晶簇
- flickers 支援 base 色（紅色警示燈不會閃成白色）

## 已知待辦/可改進

1. 開放地圖敵量/密度、蓄力/衝刺斬傷害數值需實玩回饋再平衡
2. Boss 現身時機、勝利/死亡流程未在縮小版地圖完整實玩驗證
3. Mira/Zoey 專屬模型：Mixamo 選角→tmp-convert 轉檔→丟 assets/mira.glb、zoey.glb 即自動生效（管線就緒）
4. 音量平衡未實聽調整；BGM 好聽度看用戶回饋
5. 手機實機未測（觸控/效能；蓄力=長按重鍵已支援）
6. 揮劍軌跡帶的劍尖偵測用 bounding box 長軸推斷，若視覺歪斜需微調 setupSwordFx 的 lerp 參數

## 部署習慣

- commit 訊息用 feat:/fix:/balance: 前綴（見 repo CLAUDE.md）
- 只 add game/ 下的檔案（repo 有其他 session 在動 _build/ 等目錄,勿碰）
- push 後 1-2 分鐘 Cloudflare Pages 生效
