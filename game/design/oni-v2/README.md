# 鬼兵第二版：小兵與頭目

2026-09-25。這一版鬼兵用程式直接建構幾何（不經 VRoid），小兵與頭目共用一副骨架、一張 1024 平方的貼圖圖集加一張自發光圖集，頭目是同一套模型放大 1.35 倍。設計對照圖在 [oni-3d-turnaround-v1.png](oni-3d-turnaround-v1.png)。

## 面數與模型

小兵 8,680 個三角面，頭目 9,244 個三角面，兩者共用同一張圖集材質，遊戲裡不會因為場上同時有小兵和頭目而多載一份貼圖。

## 動畫

從主角 Rumi 的 Mixamo 骨架重定向了 15 段動作，對應到遊戲的 15 個敵人狀態：idle、idle2（待機兩種）、walk、run（移動）、attack、attack2（一般攻擊兩種）、hit、hitbig（受擊兩種）、knockdown、getup（倒地與起身）、death、death2（死亡兩種），以及頭目專用的 roar（怒吼）、bossAttack、bossDeath。動作幀率 30 fps，手指擺成張開的鉤爪姿勢。

## 還沒過關的地方

眼睛的自發光強度不夠，暗場景裡看不出鬼兵眼睛在發光。揮擊動作攻擊瞬間身體會轉成側身，正面辨識度不夠。目前沒有側移（strafe）專用動作，側向移動時只能用 walk／run 硬轉。倒地（knockdown）動作偏長，會拖慢戰鬥節奏。

## 檔案位置

- GLB：`game/assets/enemies/oni-v2.glb`
- 腳本：`game/design/oni-v2/scripts/`（輸出預設寫到同目錄下的 `work/`，已加入 `.gitignore`，不進 repo）
- 貼圖：`game/design/oni-v2/textures/`（`oni_atlas.png` 底色圖集、`oni_emissive.png` 自發光圖集，皆為程式生成後導出的快照，重跑 build 會覆蓋）
- 精選渲染圖：`game/design/oni-v2/renders/`（三視圖、頭部表、遊戲內前後對照、動作接觸表）

## 重建方式

以下指令依序執行（都要在本機跑 Blender，這次驗收沒有重新跑）：

```
# 1. 建骨架、小兵與頭目網格、繪圖集，並重定向測試動作 → work/oni_project.blend
blender -b --python game/design/oni-v2/scripts/build_oni.py

# 2. 匯出成遊戲用 GLB，並重新匯入驗證骨架／貼圖／動畫
blender -b --python game/design/oni-v2/scripts/export_oni.py
cp game/design/oni-v2/work/oni.glb game/assets/enemies/oni-v2.glb

# 3. 審稿渲染：三視圖、頭部表、姿勢細節、遊戲內視角
blender -b --python game/design/oni-v2/scripts/render_oni.py -- all

# 4. 把渲染結果拼成對照表（讀 renders/turn_*.png，輸出 turnaround_*.png）
python3 game/design/oni-v2/scripts/composite.py grunt boss

# 5. 單一動作的姿勢接觸表（讀 renders/sheet/ 下的逐幀渲染）
python3 game/design/oni-v2/scripts/sheet.py <tag> <act>

# 6. 動作縮圖接觸表（讀 renders/clips/ 下的逐幀渲染）
python3 game/design/oni-v2/scripts/clipsheets.py idle,run,attack,hit,death
```

第 1 步預設會直接跑完整的 15 段動作重定向，來源是 Mixamo 下載的 .fbx，放在 `work/mixamo/` 下（依檔名前綴比對，例如 `idle__xxx.fbx`）。這批 .fbx 本 repo 不包含，要從頭重建動畫得自己去 Mixamo 下載對應片段。只想先確認幾何與圖集，跳過動畫，可以帶 `--no-anim`：

```
blender -b --python game/design/oni-v2/scripts/build_oni.py -- --no-anim
```

這些動作只透過 `oni-v2.glb` 這個遊戲資產發布，Mixamo 的授權條款不允許把動作單獨抽出來散布。
