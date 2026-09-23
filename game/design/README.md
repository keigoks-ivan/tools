# 精緻動畫風方向稿

2026-09-23。使用者選擇精緻動畫風，要求大幅提高美術品質，同時維持速度與現有畫質；原先禁止瀏覽器測試，使用者後續已授權以 Chrome 靜音驗收。

`anime-direction-v2.png` 是美術概念稿，不是實機截圖、不表示模型或場景已經完成。遊戲不引用這張圖，因此不增加遊玩時的下載或 GPU 負擔。

製作方式：內建 image_gen 工具，無 CLI/API fallback。

## 最終生成提示

Create a premium anime action-game art-direction board for HUNTR/X, an existing browser-based Seoul neon demon-hunting game. This is a CONCEPT TARGET, not an actual game screenshot. Wide landscape 1536x1024 composition. Large central panel occupying the top 70%: believable stylized 3D gameplay concept, elevated third-person view, full-body adult female sword hunter with a long violet braid, graphite-violet outfit and small gold accents, facing readable small skeletal demon enemies in an open Korean night-market plaza. Crisp cel-shaded forms, elegant hand-painted storefront facades, restrained magenta/teal neon and warm shop windows. Navy shadows. Clear open combat floor, a distant distinct circular spirit gate. Hero silhouette easy to read; a single slim luminous lavender slash arc with a few sharply directional sparks. No glowing fog hiding the models. Create perceived detail with painted textures and strong silhouette design rather than tiny geometry, realistic ray tracing, dense particles or massive bloom. Bottom 30%: three well-composed detail panels, left a cropped hunter material/silhouette study, middle a front-facing painted neon storefront material study, right three clean slash/impact shape studies against navy. Small professional English labels only: top 'HUNTR/X — ART DIRECTION', directly beneath it 'CONCEPT TARGET • NOT IN-GAME'; bottom labels 'CHARACTER', 'NEON STREET', 'IMPACT'. No fake performance figures, no gameplay HUD, no photorealism, no chibi proportions, no watermark. Mature polished anime production art, coherent visual language, high contrast limited to the hero and attack.

## 實作限制

- 圖中的高密度店內陳設、遠景、招牌亮度與接觸陰影，以繪製貼圖、圖集及預先製作的陰影為優先；不直接照圖增加大量物件、燈光或即時反射。
- 角色面部、服裝與敵方造型需要新角色美術資產；概念圖不等於可直接使用的 3D 模型，不能只靠 CSS 或調色達成。
- 霓虹色與刀光形狀可以沿用既有材質及特效數量上限；不降低解析度、抗鋸齒、陰影或現有模型細節來抵銷新增成本。
- 效能控制是後續驗收目標，並非已驗證的效能承諾。本輪沒有開啟 Chrome、遊戲、WebGL 或任何渲染壓力測試。
