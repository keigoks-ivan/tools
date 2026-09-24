# HUNTR/X 3D 角色重製規格

2026-09-24。`game/3d-next/` 是可玩的技術樣板，**不是已通過美術驗收的遊戲版本**。目前 Rumi 的臉、髮型、衣裝細節與敵人的身形都未達 [主概念稿](anime-direction-v2.png)；不得以換色、提高燈光亮度或把插畫貼上模型當成完成。首頁只將 2.5D 版本列為正式試玩，舊 3D 收在歷史版本。

## 角色優先序

1. **Rumi 完整角色資產**：以 [正／側／背視圖](rumi-3d-turnaround-v1.png)為形體參考。保留成人身形比例、明確臉部結構、從頭頂延伸至小腿的厚紫色辮子、無袖黑色戰鬥服、金色扣件、分層開衩裙甲與高靴。視圖是建模參考，不是可直接匯入遊戲的模型；現有 `rumi-v2.glb` 僅供骨架與動作管線參考。
2. **雜兵與將領**：以 [鬼兵正／側／背視圖](oni-3d-turnaround-v1.png)為比例與材質參考。窄腰、較小的骨面、長前臂與爪、反曲小腿、分段暗甲；不得沿用目前大球肩、方盒胸甲和短腿的玩具輪廓。將領沿用同一設計語言，以頭冠、胸甲和體型差異表現級別。
3. **動作**：先完成待機、跑步、輕斬 1–3、重斬、閃避、受擊、死亡；每次揮刀必須有蓄力、刀刃通過、收勢，刀光要跟隨真正的刀尖。再補絕招與勝利動作。

## 遊戲資產交付條件

- 交付可直接載入 Three.js 的 GLB，含蒙皮、骨架、動畫與貼圖來源；原始工程檔另存，遊戲不下載原始工程檔。匯入必須保留現有 `Arena` 戰鬥判定及鍵盤／觸控操作。
- Rumi 參考上限：35,000 個三角形、4 張以內的主要材質貼圖、單角色傳輸量 5 MiB 以內。雜兵參考上限：10,000 個三角形、共享材質與貼圖、同時 8 名時不為每名敵人各載一套貼圖。這些是**製作預算**，品質與效能都要在實機測試後驗收，不能靠任意降解析度達標。
- 提供正面、背面、45 度、跑步與三段攻擊的模型檢查畫面；再提供遊戲第三人稱鏡頭的靜止與動作截圖。只看站姿或概念圖不能通過驗收。
- 正面與背面的髮型、裙甲、靴子要能與視圖逐項對照；敵兵在夜市暗背景下仍能辨識頭、雙臂和攻擊方向。不得用 2D 看板冒充 3D 角色。
- 用 Chrome 桌面與實際手機橫向進行靜音測試，包含冷啟動、連點防縮放、移動、普通／重攻、閃避、絕招、暫停、轉直向再轉回、兩波與首領結算。記錄 5 分鐘戰鬥的幀時間與記憶體；未實測時標示未驗證。

## 製作與替換次序

先用 Rumi 的灰模和一段真實揮刀動畫，在 `model-lab.html` 與追蹤鏡頭確認比例及動作。灰模不通過，停止製作貼圖和場景。Rumi 通過後製作敵兵灰模，再以同一材質語言完成貼圖。最後才處理夜市的建築輪廓、接觸陰影、刀光與 HUD。每階段皆保留現有 2.5D 正式入口，直到 3D 在畫面和手機效能上都通過驗收。

角色採 Blender 製作。`rumi-modeling.blend` 已放入正、側、背參考平面，分開 `REFERENCES`、`RUMI MESH`、`RUMI RIG AND ACTIONS`；可用 `create-rumi-blend.py` 重建空白建模工程。三視圖是生成的參考，局部衣裝與髮束並非完全一致，細節以主概念稿及遊戲鏡頭下的統一設計為準。先手工建出臉、辮子、身形、裙甲與靴子的輪廓，再做拓撲、材質、骨架和揮刀動作；自動圖轉 3D 只可用於初稿，不作美術驗收。匯出時排除參考平面，僅輸出角色網格與動作。

## 參考圖製作

以下視圖由內建 ImageGen 以 `anime-direction-v2.png` 為參考生成，目的是建立建模對照；生成圖的細節仍需建模時統一。未使用 CLI/API fallback。

Rumi 提示：Use case: stylized-concept. Asset type: production model sheet for a real-time 3D action-game character. Use the provided HUNTR/X art-direction image as the exact visual reference for Rumi (purple long braid, sleeveless black stagewear, asymmetrical split dark-purple waistcloth with gold insignia, high boots, long violet sword). Create a clean orthographic 3-view turnaround of the SAME character: full-body front, strict profile side, full-body back, neutral A-pose; each view matched in height, anatomy, outfit construction, braid length and accessories. Adult anime action-game proportions and professional character design detail. Isolated on a simple neutral charcoal background with even studio lighting so a 3D modeler can reproduce shape, materials and rig. No scene, no enemies, no dramatic pose, no labels, no lettering, no logos, no watermark. This is reference concept art, not a game screenshot.

鬼兵提示：Use case: stylized-concept. Asset type: orthographic production model sheet for a rigged 3D enemy in a third-person anime action game. Input image is the game's approved art direction; use only its lanky dark demonic foot-soldier enemies as visual reference, not the heroine. Show ONE identical enemy in full-body front, strict side, and back A-pose at matching scale on a flat neutral charcoal background. Adult, threatening, lean digitigrade humanoid proportions, long clawed forearms, sharp segmented charcoal armor over sinewy body, narrow horned bone mask and small violet eyes, subtle violet energy seams; no chunky toy or chibi proportions. Detailed yet optimized readable silhouette for a mobile real-time game. No scene, no weapon, no text, no labels, no logo, no watermark.
