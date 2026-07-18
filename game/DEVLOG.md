# HUNTR/X：魂門之戰 — 開發交接文件

> 最後更新：2026-07-18。給下一個 Claude session 的完整脈絡。
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

## 已知待辦/可改進

1. 鏡頭距離 8（updateCamera）可再拉近至 ~6.5 讓角色更大（真三感更強）
2. 開放地圖的敵量/密度數值剛調過一輪，需實玩回饋再平衡
3. Boss 現身時機、勝利/死亡流程在開放地圖版只做過邏輯驗證（__warp），未實玩驗證
4. M3 計畫:Mira/Zoey 角色（Mixamo 選角→tmp-convert 轉檔→選角畫面）
5. 音量平衡未實聽調整;BGM 好聽度看用戶回饋
6. 手機實機未測（觸控/效能）
7. 劍氣彈視覺可升級成新月形（目前是壓扁光球）

## 部署習慣

- commit 訊息用 feat:/fix:/balance: 前綴（見 repo CLAUDE.md）
- 只 add game/ 下的檔案（repo 有其他 session 在動 _build/ 等目錄,勿碰）
- push 後 1-2 分鐘 Cloudflare Pages 生效
