# 本地生成美術記錄

工具：內建 `image_gen.imagegen`，不是外部下載或 CLI / API。輸入編輯目標為既有的 `assets/art/scene.png`。兩張圖均為四格表情圖集，程式讀取後在 Canvas 中分成普通、眨眼、開心、驚訝四格。

## guest-honey.png

Prompt: Game production asset. Edit target is supplied salon illustration. Create a 2 by 2 expression atlas of FOUR complete exact copies of this portrait image, edge-to-edge equal cells, no gutters and no text. Total canvas portrait, ideally 1664 x 3584. Every cell must retain the reference exact composition and all coordinates: bald scalp, ears, face, neck, chair, cape and room. Replace the girl in ALL FOUR cells with the SAME new cute young girl with rich warm brown skin, deep brown luminous eyes, round cheeks and tiny nose, and change her cape to pale apricot. Keep precisely the same bald head silhouette and face size, no hair anywhere. Different expressions ONLY: top-left gentle neutral smile eyes open; top-right blink eyes fully closed with curved eyelashes; bottom-left delighted smile eyes open; bottom-right mild surprised small O mouth eyes open. Premium hand-painted glossy storybook salon art matching reference closely, soft rich shading, polished natural warm skin. All four identical full-scene framing, no borders, no letters, no numbers. We crop each quadrant as a full game scene, so coordinate alignment is absolutely critical.

## guest-peach.png

Same production specification, with this character replacement: light peach skin, small freckles on nose and cheeks, luminous jade green eyes, slightly rounder sweet face; cape seafoam green. Four matching expressions. The generated lower panels have a vertical framing difference, corrected in `looks.js` expression offsets. Final generated file is 855×1840; the larger requested resolution was not returned by the tool.

## Existing assets

`scene.png`, `blink.png`, `happy.png`, `surprise.png`: approved salon scene edited to remove hair and change facial expressions. `hair-texture.png`: full-frame vertical chestnut hair texture. `hair-plate.png`: transparent polished hair illustration sampled along actual strand coordinates. `cover.png`: existing catalog cover. These assets were generated with the same built-in ImageGen in the previous release.

## 2026-09-29 檔案格式

為了加快開啟速度，上面的 PNG 全部轉成 WebP（同名 `.webp`，總量 13.3 MB → 1.3 MB）；`cover.png` 維持 PNG（遊戲入口頁在用）。
