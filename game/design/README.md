# 精緻動畫風方向稿

2026-09-23。使用者選擇精緻動畫風，要求大幅提高美術品質，同時維持速度與現有畫質；原先禁止瀏覽器測試，使用者後續已授權以 Chrome 靜音驗收。

`anime-direction-v2.png` 是美術概念稿，不是實機截圖、不表示模型或場景已經完成。遊戲不引用這張圖，因此不增加遊玩時的下載或 GPU 負擔。

2026-09-24 的 3D 試作未通過使用者美術驗收。後續角色與敵人製作以 [3D 角色重製規格](3d-rebuild-brief.md)、[Rumi 三視圖](rumi-3d-turnaround-v1.png)與[鬼兵三視圖](oni-3d-turnaround-v1.png)為對照；這些圖只供建模參考，不在遊戲中載入。

[Rumi Blender 建模工程](rumi-modeling.blend)已放入三視圖參考，尚未製作角色網格；建模工程不會由遊戲下載。

使用者後續允許脫離獵魔女團題材，改以本機 VRoid 底模重設角色。新的[紫刃劍士方向圖](vroid-swordswoman-direction-v1.png)與[製作要點及提示](vroid-swordswoman-direction-v1.md)是候選方向；[可編輯 VRoid 工程](vroid-swordswoman-base.vroid)和[匯出 VRM](vroid-swordswoman-base.vrm)保留了目前的臉、髮和基本身形。服裝、武器及動畫尚未達到方向圖的完成度，尚未替換正式遊戲角色；[離線轉換與骨架限制](vroid-offline-pipeline-notes.md)另有記錄。

[第二版可編輯工程](vroid-swordswoman-base-v2.vroid)與[第二版 VRM](vroid-swordswoman-base-v2.vrm)調整了虹膜、眼尾、側分瀏海與高馬尾，並改用無袖上衣底層。正面、側面與背面的實際模型檢視見[第二版落差紀錄](vroid-swordswoman-v2-review.md)。這仍是建模底模，並非完成角色，也沒有替換正式遊戲素材。

[第三版服裝與姿勢試件](vroid-swordswoman-v3-review.md)加入可編輯的本機 Blender 服裝、刀與三視圖，並明列和方向圖及正式遊戲角色之間的落差。第三版尚未接入遊戲。

[第四版定裝與動作驗收](vroid-swordswoman-v4-review.md)在 Blender 精修臉部與眼睛、加上完整服裝與可握刀的右手，腿部拉長 12%，並套上 13 段基本動作加無雙連段，髮辮全程做了彈簧模擬；面數超出預算、臉部仍偏年輕等落差列在文中。GLB 在 `game/assets/heroes/swordswoman-v4.glb`。

[鬼兵第二版](oni-v2/README.md)用程式直接建構小兵與頭目共用一副骨架的網格，兩者共用同一張貼圖圖集，接了 15 段對應遊戲狀態的重定向動作；GLB 在 `game/assets/enemies/oni-v2.glb`，眼睛發光不夠、揮擊轉側身等落差列在文中。

[3D 第一關：夜市大街到魂門](level-night-market-march.md)沿一條夜市大街分四段推進到魂門，最後在魂門頂端單挑守將；設計稿待使用者確認，尚未實作。

製作方式：內建 image_gen 工具，無 CLI/API fallback。

## 最終生成提示

Create a premium anime action-game art-direction board for HUNTR/X, an existing browser-based Seoul neon demon-hunting game. This is a CONCEPT TARGET, not an actual game screenshot. Wide landscape 1536x1024 composition. Large central panel occupying the top 70%: believable stylized 3D gameplay concept, elevated third-person view, full-body adult female sword hunter with a long violet braid, graphite-violet outfit and small gold accents, facing readable small skeletal demon enemies in an open Korean night-market plaza. Crisp cel-shaded forms, elegant hand-painted storefront facades, restrained magenta/teal neon and warm shop windows. Navy shadows. Clear open combat floor, a distant distinct circular spirit gate. Hero silhouette easy to read; a single slim luminous lavender slash arc with a few sharply directional sparks. No glowing fog hiding the models. Create perceived detail with painted textures and strong silhouette design rather than tiny geometry, realistic ray tracing, dense particles or massive bloom. Bottom 30%: three well-composed detail panels, left a cropped hunter material/silhouette study, middle a front-facing painted neon storefront material study, right three clean slash/impact shape studies against navy. Small professional English labels only: top 'HUNTR/X — ART DIRECTION', directly beneath it 'CONCEPT TARGET • NOT IN-GAME'; bottom labels 'CHARACTER', 'NEON STREET', 'IMPACT'. No fake performance figures, no gameplay HUD, no photorealism, no chibi proportions, no watermark. Mature polished anime production art, coherent visual language, high contrast limited to the hero and attack.

## 實作限制

- 圖中的高密度店內陳設、遠景、招牌亮度與接觸陰影，以繪製貼圖、圖集及預先製作的陰影為優先；不直接照圖增加大量物件、燈光或即時反射。
- 角色面部、服裝與敵方造型需要新角色美術資產；概念圖不等於可直接使用的 3D 模型，不能只靠 CSS 或調色達成。
- 霓虹色與刀光形狀可以沿用既有材質及特效數量上限；不降低解析度、抗鋸齒、陰影或現有模型細節來抵銷新增成本。
- 效能控制是後續驗收目標，並非已驗證的效能承諾。本輪沒有開啟 Chrome、遊戲、WebGL 或任何渲染壓力測試。
