# 素材來源

2026-10-01 共用場景素材由 `imagegen` 內建工具生成，並以 WebP 編碼供三款遊戲使用。住宅立面取代既有色彩貼圖，GPU 上限為 512²；四種建材共用一張 1024² 圖集。這些是生成材質，並非實地攝影。

| 生成素材 | 完整提示詞 |
|---|---|
| [field-surfaces-v1.webp](field-surfaces-v1.webp) | [四種建材](field-surfaces-v1.prompt.txt) |
| [city-brick-v2.webp](city-brick-v2.webp) | [紅磚住宅](city-brick-v2.prompt.txt) |
| [city-piers-v2.webp](city-piers-v2.webp) | [灰磚與磚柱住宅](city-piers-v2.prompt.txt) |
| [city-stone-v2.webp](city-stone-v2.webp) | [石材住宅](city-stone-v2.prompt.txt) |

[field-foliage-v2.webp](field-foliage-v2.webp) 是既有 [field-foliage-v1.png](field-foliage-v1.png) 的 WebP 編碼版本，保留透明邊緣；[原生成提示詞](field-foliage-v1.prompt.txt)。

2026-10-04 [秋季六甲山林冠](kobe-autumn-forest-v1.webp) 由 `imagegen` 內建工具生成，並非實地航拍。[完整提示詞](kobe-autumn-forest-v1.prompt.txt)。供三款遊戲共用：512² WebP，RGB 為林冠色彩，A 為由明暗提取的細部高度，沒有另一張法線圖或遠山樹群。材質非同步載入，失敗時使用程序林冠。

| 檔案 | 來源 | 授權 |
|---|---|---|
| `mech_paint.jpg` | Poly Haven「Green Metal Rust」（Rob Tuytel）https://polyhaven.com/a/green_metal_rust ：1k diffuse／roughness／displacement 重新打包成一張（R 漆面明暗細節、G 粗糙度、B 鏽斑遮罩） | CC0 |
