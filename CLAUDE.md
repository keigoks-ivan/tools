# CLAUDE.md — Property Monitor 開發規範
# 讀這個檔案後不需要再問結構問題，直接執行任務

## ⚠️ 關鍵禁止事項
- **絕對不能執行 build.py** — 會覆蓋所有手工 HTML，回復 commit: 39543e8
- **不能直接編輯 templates/ 或 market_data/** — 僅供參考
- 所有修改直接編輯 HTML 檔案

## 部署
- Repo: github.com/keigoks-ivan/malaysia-property
- 網站: myproperty.investmquest.com（Cloudflare Pages 自動 deploy）
- Push 到 main 後約 1-2 分鐘生效

## 目錄結構
```
/                    ← Malaysia (MY) 頁面
/tw/                 ← Taiwan
/au/                 ← Australia
/jp/                 ← Japan
/nz/                 ← New Zealand
/uk/                 ← United Kingdom
/docs/dd/            ← 深度研究報告（獨立 HTML）
/css/style.css       ← 主樣式（所有頁面共用）
/tw/tw.css           ← 補丁 CSS（所有子目錄頁面都引用）
/_headers            ← Cloudflare Pages security headers
```

## 每個市場的標準頁面
- index.html（市場總覽 Dashboard）
- supply.html（供給分析）
- demand.html（需求分析）
- valuation.html（估值監測）
- risk.html（風險監測）
- report.html（深度報告）
- [city].html（城市深度分析，例如 sydney.html、taipei.html）

## ECharts 設計系統

寫圖表 / 改 chart 程式碼時 Read `.claude/notes/echarts-spec.md`。內含：色彩變數 `C`、`baseText/baseGrid/baseTooltip/baseLegend/mkAxis`、格式化函數（fmtAUD / fmtPrice / fmtNum）、必須遵守的模式（allCharts / setLang / resize handler）、Chart ID 命名規則、圖表標準規格（高度 220px、bar border radius、axis color 等）。

## 雙語系統
所有文字必須提供中英文版本：
```html
<span class="lang-en">English text</span>
<span class="lang-zh" style="display:none">中文文字</span>
```

## Navbar 結構
每個頁面的 navbar 包含：
1. Logo → 連回該市場 index.html
2. Market selector dropdown → 各市場的 report.html（不是 index.html）
3. 市場內頁面導覽 nav links
4. 語言切換按鈕（EN / 中文）
5. 利率 badge（`opr-badge`）
6. 漢堡選單（mobile）

## 各市場現行利率 badge
- Malaysia：`OPR: 3.00%`
- Taiwan：`CBC: 2.00%`
- Australia：`RBA: 4.10% ▲`
- Japan：`BOJ: 0.50%`
- New Zealand：`OCR: 4.25%`
- UK：`BOE: 4.75%`

## KPI Card 顏色類別
```html
<div class="kpi-card blue|green|orange|red">
  <div class="kpi-label">...</div>
  <div class="kpi-value">...</div>
  <span class="kpi-badge badge-blue|badge-green|badge-orange|badge-red">...</span>
</div>
```

## 版面元素
- `section-label`：大寫 section 標題
- `insight-box`：重點洞察文字框（深藍左邊框）
- `summary-card`：總結卡片（帶顏色左邊框）
- `micro-card`：三欄小型資訊卡
- `chart-card`：圖表容器
- `source-footer`：資料來源頁腳
- `page-header`：頁面標題區（含 updated 日期）

## Git 工作流程
```bash
# Mac Mini (主要工作機)
git add -A
git commit -m "feat/fix/update: 描述"
git push origin main

# MacBook Pro (第二台)
git pull --rebase origin main  # 先同步再工作
git push origin main
```

## 常用 commit 前綴
- `feat:` 新功能或新頁面
- `fix:` 修復問題
- `update:` 更新數據或文字
- `security:` 安全性相關
- `refactor:` 重構（不改功能）
