# 紫刃劍士第三版：服裝與姿勢試件

2026-09-24。以[原創方向圖](vroid-swordswoman-direction-v1.png)為目標，第三版 VRoid 底模調整了眼睛縱長、嘴寬與唇形；在本機 Blender 為同一套骨架加上貼身立領背心、肩帶與腰帶、開衩腰片、護腕手套、長靴、刀與辮尾。方向圖和角色資料未上傳到第三方 3D 服務。

## 實際模型檢視

- [正面](vroid-swordswoman-costume-v3-front.png)
- [側面](vroid-swordswoman-costume-v3-side.png)
- [背面](vroid-swordswoman-costume-v3-back.png)
- [手臂放下的骨架姿勢](vroid-swordswoman-costume-v3-pose.png)

[可編輯 VRoid 工程](vroid-swordswoman-base-v3.vroid)和[VRM 匯出](vroid-swordswoman-base-v3.vrm)保留臉髮底模；[Blender 服裝工程](vroid-swordswoman-costume-prototype-v3.blend)保留分件網格及骨架。可用 `blender -b --python build-vroid-swordswoman-prototype.py` 重建服裝、工程與三視圖，`blender -b --python review-vroid-swordswoman-pose.py` 重現骨架姿勢檢視。這兩個腳本只用本機素材。

## 尚未通過的驗收

這仍是造型試件，不是正式遊戲角色。和方向圖相比，臉部表情偏平、髮辮厚度與質感不足、衣料與刀缺少手工貼圖細節。姿勢檢視可看到刀跟著右手骨架移動，但手指沒有握住刀柄；腰帶和腰片會剛性轉動，肩部及衣片仍有穿模。單張姿勢圖不表示攻擊動畫完成。

目前 VRoid 模型沒有戰鬥動畫；現行遊戲角色的 13 段 Mixamo 動作也無法僅改骨名就套用。正式替換前，需要校正骨架靜止姿、逐段重定向及烘焙動作、處理握刀與刀光掛點，再於 Chrome 與手機實機檢查外觀、操控和效能。此試件沒有加入遊戲入口，因此目前遊戲畫面和載入速度不會因此改變。
