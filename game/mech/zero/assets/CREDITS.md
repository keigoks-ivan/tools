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

### soldier-motion.glb（上一輪 337,188 bytes）
- 作者：Quaternius，Universal Animation Library Standard；CC0 1.0。
- 原始發佈：https://quaternius.itch.io/universal-animation-library
- glTF 鏡像：https://github.com/J-Ponzo/gltf-universal-animation-library
- 授權：https://github.com/J-Ponzo/gltf-universal-animation-library/blob/main/LICENSE
- 取用：Crouch_Idle_Loop、Crouch_Fwd_Loop、Hit_Chest、Hit_Head、Death01、Pistol_Reload。
- 處理：以 A_TPose / TPose 的世界旋轉消除骨軸與朝向差，按腿長縮放髖部高度，30 Hz 重取樣；去除水平 root motion、模型、貼圖，輸出 Mixamo 骨名的動畫專用 GLB。
- 重建腳本：`../dev/retarget_motion.py`（離線需要 Python、NumPy、SciPy；遊戲沒有新增 npm 或 CDN 相依）。
- 上一輪包含一個 Death01；本輪另補上方向移動與兩種死亡片段，見下方。

### fabric_pattern_07_{col,nor,arm}.webp（271,592 bytes）
- 作者：Rob Tuytel；Poly Haven「Fabric Pattern 07」，CC0。
- 來源：https://polyhaven.com/a/fabric_pattern_07
- 下載資訊：https://api.polyhaven.com/files/fabric_pattern_07
- 原始 1K `col_1`、`nor_gl`、`arm`，LANCZOS 縮成 512 × 512、WebP quality 85；用於市場攤位的帆布照片 PBR。
- 槍械三面投影重用 `../assets/mech_paint.jpg`，來源與授權見本篇 `assets/CREDITS.md`；沒有新增槍械貼圖或外部依賴。

## 第二輪：方向移動與死亡片段（2026-09-29）

- 合併後 `soldier-motion.glb` 為 422,012 bytes，比上一輪增加 84,824 bytes；沒有新增貼圖。
- 作者：Kay Lousberg，KayKit Character Animations；CC0。
- 原始發佈：https://kaylousberg.itch.io/kaykit-character-animations
- GLB 鏡像：https://github.com/sketchpunklabs/kaykit_char/tree/main/res/anim
- 授權：https://github.com/sketchpunklabs/kaykit_char/blob/main/LICENSE
- `Med_MovementAdvanced.glb`：Walking_Backwards、Running_Strafe_Left、Running_Strafe_Right。
- `Med_General.glb`：Death_A、Death_B。
- 處理：用 T-Pose 校正骨軸、朝向與腿長，30 Hz 重取樣到 Mixamo 骨架，只保留動畫；再用 `../dev/merge_motion.py` 與上一輪 Quaternius 片段合併。
- 重建：`retarget_motion.py source.glb soldier.glb output.glb`；`merge_motion.py original-motion.glb directions.glb deaths.glb merged.glb`。
- 本輪機體裝甲分件、步態與玻璃／薄牆破壞程式為專案原創，重用現有材質。

## 第三輪：場景美術（2026-09-29）

### concrete_grey_col.webp（257,742 bytes）
- 來源：Poly Haven「Painted Concrete」（https://polyhaven.com/a/painted_concrete ），CC0。同一組貼圖的法線、ARM 照舊使用 `painted_concrete_nor/arm.webp`。
- 處理：原本的綠漆色彩圖看起來像迷彩。轉成灰階，減掉 48 px 高斯模糊（去掉大塊漆斑、保留裂痕和刮痕），亮處壓低，再染一點暖灰，1024 px、WebP quality 82。遊戲不再下載 `painted_concrete_col.webp`。

### 沒有新增下載的部分
- 燒毀的轎車（三種車型）、公車、救護車：程式產生的車殼（props.js），用現有的鏽鐵照片貼圖，煙燻、灰燼、鏽色寫在頂點色。
- 牆面髒污、水痕、大範圍明暗：程式畫的 256² 雜訊圖（kit.js），不用下載。
- 地上的燒焦、油漬，牆上的煙燻、水痕：程式畫的 512² 圖集（map.js）。
- 遠方煙柱：同一張雜訊圖做的 shader（props.js）。
