# 紫刃劍士第四版：定裝與動作驗收

2026-09-25。第四版把第三版的 VRoid 底模帶進 Blender 精修：重做臉部與眼睛比例、加粗馬尾辮、換上立領背心加開衩腰片的正式服裝、補上長靴與護腕手套，刀改為固定握在右手，腿部整體拉長 12%。渲染用的是審稿專用的二階調色調＋墨線外框（toon review look），不是遊戲實際使用的著色器，僅供對照造型細節。

## 和方向圖的落差

臉部五官仍偏年輕，和方向圖設定的成熟劍士臉型有落差。靴跟做得太低，方向圖裡的高跟長靴輪廓沒有做出來。模型面數 53.6k 個三角面，超出第三版設定的 35k 預算，需要在下一輪做減面。受傷（hurt）與待機（idle）兩個動作的骨架姿勢下，大腿內側有穿模，收腿幅度大時看得出來。

以上四點是這一版還沒過關的地方，其餘造型（辮子、腰片、靴、護腕、握刀）已經對齊方向圖。

## 動畫

骨架套了 13 段從 Mixamo 重定向來的基本動作：idle、run、slash1-4、heavy、heavyfin、hurt、death、jump、win、roll。無雙技能另外做了 combo1 到 combo5、charge、musou 七段連段，加上 jump、airSlash、plunge、musouFlurry、musouFinish 五段空中與終結技，動作全部由 Mixamo 的重劍／太刀原始片段裁切拼接而成。每段動作都跑過髮辮的彈簧模擬（spring bake），馬尾和辮尾會依動作甩動，不是死綁在頭上。

GLB 位置在 `game/assets/heroes/swordswoman-v4.glb`，約 2.9 MB（匯出後經 `optimize_glb.mjs` 壓縮，原始匯出約 5.2 MB）。

## 重建方式

以下指令依序執行（都要在本機跑 Blender，實際重建耗時較長，這次驗收沒有重新跑）：

```
# 1. 建服裝、貼圖與基本三視圖 → work/v4_project.blend、work/v4_wip.blend
blender -b --python game/design/vroid-v4/scripts/build_v4.py

# 2. 讀 v4_wip.blend，量面數、渲染姿勢檢視圖
blender -b --python game/design/vroid-v4/scripts/review_v4.py

# 3. 重定向 13 段基本動作、烘焙髮辮彈簧 → work/v4_animated.blend
blender -b --python game/design/vroid-v4/scripts/animate_v4.py

# 4. 額外的重劍／太刀 Mixamo 片段先用 retarget_fbx.py 轉成候選動作
#    （這一步需要自行準備 Mixamo 下載的 .fbx，本 repo 不包含）
blender -b --python game/design/vroid-v4/scripts/retarget_fbx.py -- work/v4_project.blend work/v4_candidates.blend gs_slash1=path/to/clip.fbx ...

# 5. 無雙連段（combo1-5、charge、musou）→ work/v4_musou.blend
blender -b --python game/design/vroid-v4/scripts/musou_actions.py

# 6. 空中與終結技（jump、airSlash、plunge、musouFlurry、musouFinish）→ work/v4_moves.blend
blender -b --python game/design/vroid-v4/scripts/moves_actions.py

# 7. 匯出成遊戲用 GLB
blender -b --python game/design/vroid-v4/scripts/export_v4.py -- work/v4_moves.blend game/assets/heroes/swordswoman-v4.glb

# 7b. 壓縮動畫與頂點格式（5.2 MB → 2.9 MB，不需要解碼器）
node game/scripts/optimize_glb.mjs hero game/assets/heroes/swordswoman-v4.glb game/assets/heroes/swordswoman-v4.glb

# 8. 驗證 GLB（骨架、動畫、貼圖是否正常）
node game/design/vroid-v4/scripts/check_glb.mjs game/assets/heroes/swordswoman-v4.glb
```

第 4 步用到的重劍／太刀候選片段（`v4_candidates.blend`、`v4_cand3.blend`）沒有隨 repo 附上，因為它們是 Mixamo 動作重定向後的中間檔；要從頭重建無雙連段，得先自己去 Mixamo 下載對應的 .fbx 再跑第 4 步。這些動作只透過 `swordswoman-v4.glb` 這個遊戲資產發布，Mixamo 的授權條款不允許把動作單獨抽出來散布。

## 渲染圖

- [三視圖（正／側／背）](vroid-v4/renders/v4-front-side-back.webp)
- [臉部特寫](vroid-v4/renders/r_face.webp)
- [無雙連段動作表](vroid-v4/renders/musou_sheet.webp)
- [基本動作表 A](vroid-v4/renders/anim_sheet_a.webp)
- [基本動作表 B](vroid-v4/renders/anim_sheet_b.webp)
- [服裝近拍](vroid-v4/renders/close.webp)
- [靴子細節](vroid-v4/renders/boot.webp)
- [新舊版對照](vroid-v4/renders/compare.webp)
- [站姿檢視](vroid-v4/renders/pose.webp)

## 檔案位置

- 腳本：`game/design/vroid-v4/scripts/`（輸出預設寫到同目錄下的 `work/`，已加入 `.gitignore`，不進 repo）
- 貼圖：`game/design/vroid-v4/textures/`
- 可編輯工程：[vroid-swordswoman-v4.blend](vroid-swordswoman-v4.blend)（僅到服裝定裝階段，不含動畫）
