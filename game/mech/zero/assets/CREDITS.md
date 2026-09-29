# 素材來源

## soldier.glb
- 來源：three.js 官方範例資產 `examples/models/gltf/Soldier.glb`（github.com/mrdoob/three.js，MIT License）
- 原始模型／動作：Mixamo（Adobe）「Vanguard」角色與 Idle/Walk/Run 動作，經 three.js 專案打包散布
- 本遊戲用途：敵兵與駕駛員手臂；貼圖在執行時重新上色

## 牆面／地板貼圖（Poly Haven，CC0）
全部來自 https://polyhaven.com ，CC0 授權。原始 1K JPG，轉成 WebP（色彩／法線 1024、ARM 512）。
- concrete_wall_008
- damaged_plaster
- red_brick_03
- concrete_floor_02
- corrugated_iron_02
- rusty_metal_02
- metal_plate
- floor_tiles_02
- painted_concrete

## 掃描模型（assets/models/，Poly Haven CC0）
外牆模組 modular_urban_apartments_facade、modular_factory_facade，以及道具（油桶、紙箱、水泥袋、護欄、蓋布車、冷氣機、推車、垃圾桶、鐵絲網、防火梯、日光燈、軍用木箱、輪胎、發電機、瓦斯桶、鐵捲門、保全燈、沙發、鐵架、工具車、垃圾袋、電箱、人孔蓋、辦公桌、風管）。
全部來自 https://polyhaven.com ，CC0。用 gltf-transform 簡化、貼圖轉 WebP。

## assets/env/
本篇 game/mech/assets/ 的天空、地形、立面貼圖縮小轉 WebP 的副本（前傳用，來源見本篇 CREDITS）。

## 本次美術與動作補充（2026-09-29）

### soldier-motion.glb（337,188 bytes）
- 作者：Quaternius，Universal Animation Library Standard；CC0 1.0。
- 原始發佈：https://quaternius.itch.io/universal-animation-library
- glTF 鏡像：https://github.com/J-Ponzo/gltf-universal-animation-library
- 授權：https://github.com/J-Ponzo/gltf-universal-animation-library/blob/main/LICENSE
- 取用：Crouch_Idle_Loop、Crouch_Fwd_Loop、Hit_Chest、Hit_Head、Death01、Pistol_Reload。
- 處理：以 A_TPose / TPose 的世界旋轉消除骨軸與朝向差，按腿長縮放髖部高度，30 Hz 重取樣；去除水平 root motion、模型、貼圖，輸出 Mixamo 骨名的動畫專用 GLB。
- 重建腳本：`../dev/retarget_motion.py`（離線需要 Python、NumPy、SciPy；遊戲沒有新增 npm 或 CDN 相依）。
- 免費庫只有一個 Death01，遊戲依中彈部位使用不同過渡時間後接布娃娃；側移、倒退、轉身是步幅方向補正，沒有宣稱來源提供這些獨立片段。

### fabric_pattern_07_{col,nor,arm}.webp（271,592 bytes）
- 作者：Rob Tuytel；Poly Haven「Fabric Pattern 07」，CC0。
- 來源：https://polyhaven.com/a/fabric_pattern_07
- 下載資訊：https://api.polyhaven.com/files/fabric_pattern_07
- 原始 1K `col_1`、`nor_gl`、`arm`，LANCZOS 縮成 512 × 512、WebP quality 85；用於市場攤位的帆布照片 PBR。
- 槍械三面投影重用 `../assets/mech_paint.webp`，來源與授權見本篇 `assets/CREDITS.md`；沒有新增槍械貼圖或外部依賴。
