# coop-relay：紫刃夜行三人連線的轉送伺服器

三兄弟各自在不同裝置、不同網路，進同一個房間，看到彼此的角色在同一個關卡裡移動。
第一階段只同步角色位置與動作；敵人與戰鬥各自獨立。

- 前端頁面：`game/trio/index.html`（單人版 `game/3d-next/` 完全不載入連線程式）
- 客戶端模組：`game/3d-next/net/`（三人頁 import，引擎本體沿用 `game/3d-next/`）
- 伺服器：本資料夾。Cloudflare Worker＋Durable Object（每個房間一個 DO，Hibernation API），免費方案可跑。

## 運作方式

1. 三人頁顯示「輸入你的代號」。代號送到 `POST /auth`。
2. Worker 用 constant-time 比對 secret `PLAYER_CODES`。對了就發一張 HMAC 憑證（`TOKEN_SECRET` 簽章，內含顯示名稱與 30 天到期），存在瀏覽器 localStorage。
3. 錯的代號只回「代號不正確。」。同一個 IP 10 分鐘內錯 5 次就擋，直到最舊那次過期。
4. 開房或加入房間走 WebSocket `/ws?room=NEW|房號&token=…`。顯示名稱取自憑證，不信任客戶端輸入。
5. 房間最多 3 人。第一個進來的是房主；房主離開時，最早進來的人接手，全員收到通知。
6. 伺服器只轉送與管理名單：單則訊息上限 512 bytes，每個連線每秒超過 20 則就丟，持續濫發就斷線。

## 上線步驟

以下都在 `workers/coop-relay/` 執行。

```sh
npm install
npx wrangler login
```

### 1. 設定兩個 secret（代號永遠不進 repo、不進前端程式）

```sh
npx wrangler secret put PLAYER_CODES
# 貼上 JSON，最多 3 筆，例：{"自己想的長代號-1":"大哥","另一個長代號-2":"二哥","第三個長代號-3":"小弟"}

npx wrangler secret put TOKEN_SECRET
# 貼上至少 32 字元的亂數，例如 `openssl rand -base64 48` 的輸出
```

- `PLAYER_CODES` 超過 3 筆、不是 JSON、代號短於 4 字元、名稱重複，Worker 一律拒絕服務（登入回 500，WebSocket 以 4010 關閉），不會默默放行。
- 代號建議 12 字元以上、不要用生日或名字。

### 2. 決定伺服器網址

建議與三人頁同一個網域，Cloudflare Access 才能用同一個 cookie 保護兩者：

- 在 `wrangler.toml` 取消註解：
  ```toml
  routes = [{ pattern = "tools.investmquest.com/coop-relay/*", zone_name = "investmquest.com" }]
  ```
  Worker 會自動去掉 `/coop-relay` 前綴。Worker route 比 Pages 優先，這條路徑不會被 Pages 接走。
- 或者不設 route，直接用 `https://coop-relay.<帳號>.workers.dev`。這樣三人頁要改 `PRODUCTION_RELAY`，而且日後開 Cloudflare Access 時，Access cookie 不會帶到另一個網域的 WebSocket。

### 3. 部署

```sh
npx wrangler deploy
curl https://tools.investmquest.com/coop-relay/health   # 應回 ok
```

### 4. 前端指向伺服器

`game/3d-next/net/protocol.js` 的 `PRODUCTION_RELAY` 預設是 `https://tools.investmquest.com/coop-relay`。用 workers.dev 就改成那個網址。
臨時測試可以在網址加 `?relay=https://…`，不用改程式。

### 5. Origin 白名單

`wrangler.toml` 的 `ALLOWED_ORIGINS` 預設只收 `https://tools.investmquest.com` 與本機（`localhost`／`127.0.0.1` 任意 port）。
要從 Pages 預覽網址測，加上 `https://*.<pages 專案名>.pages.dev`。

## 管理代號

| 想做的事 | 怎麼做 |
|---|---|
| 新增一位兄弟 | 重新 `npx wrangler secret put PLAYER_CODES`，貼上加了一筆的完整 JSON（總數仍不得超過 3） |
| 撤銷一位兄弟 | 同上，把他那一筆拿掉。他的舊憑證立即失效：每次連線都會檢查憑證上的名稱還在不在 `PLAYER_CODES` |
| 換某人的代號 | 同上，改他那筆的代號（名稱不變）。他已登入的裝置照常能用；要強制重登就同時輪換 `TOKEN_SECRET` |
| 撤銷所有人 | 重新 `npx wrangler secret put TOKEN_SECRET` 換新亂數。所有憑證立即失效，三人都要重新輸入代號 |

秘密改完立即生效，不需要重新部署。

## 選用：Cloudflare Access（多一層門）

三人頁的 HTML 本身可以公開，代號＋憑證才是門。要再加一層：

1. Cloudflare Zero Trust → Access → Applications → Add → Self-hosted。
2. Application domain 加兩條路徑：
   - `tools.investmquest.com/game/trio/*`
   - `tools.investmquest.com/coop-relay/*`
3. Policy：Allow，Include → Emails，填三兄弟的 email（免費方案 50 人以內免費）。
4. 伺服器端若要再驗 Access JWT：設 `ACCESS_AUD` 變數。目前 `src/index.js` 的 `accessIdentity()` 只留了接點，設了 `ACCESS_AUD` 但尚未實作 JWT 驗證時會一律拒絕，避免誤以為有保護。

## 本機開發與測試

```sh
cp .dev.vars.example .dev.vars        # 假的測試代號，.dev.vars 已被 .gitignore
npx wrangler dev                       # http://localhost:8787
# 另一個終端，在 repo 根目錄：
python3 -m http.server 8931
# 開 http://localhost:8931/game/trio/ （localhost 自動連 localhost:8787）
```

- 端對端煙霧測試：`npm run smoke`（自己起 `wrangler dev`，用 3 個 WebSocket 客戶端跑登入、轉送、限速、房主轉移、滿房拒絕、錯誤設定，結束後關掉伺服器）。
- 純邏輯單元測試在 `game/tests/coop-relay.test.mjs`、`game/tests/coop-net.test.mjs`，跟全部遊戲測試一起跑：
  `node --loader ./game/tests/three-loader.mjs --test game/tests/*.test.mjs`
- 同一台電腦開兩個分頁測試時要並排兩個視窗：被切到背景的分頁瀏覽器會停止繪製。

## 免費額度估算（3 人玩 1 小時）

以下是依 2026 年 Cloudflare Workers Free 方案條款估算，上線前請以官方文件現值再核一次。

- **Durable Object 請求**（免費每日 100,000）：每人 12 Hz 送出，3 人約 129,600 則／小時；Hibernation 下 WebSocket 進站訊息以 20:1 計費，約 6,500 請求／小時。站著不動時降到 2 Hz，實際更少。每天約可玩 15 小時。
- **Durable Object 時長**（免費每日 13,000 GB-s）：遊戲中房間不會休眠，128 MB × 3,600 秒 ≈ 460 GB-s／小時，每天約 28 小時。
- **Worker 請求**（免費每日 100,000）：只有登入與每次連線各算一次，可忽略。
- 房間清空 5 分鐘後刪除儲存；沒有人在房間時不耗時長。
