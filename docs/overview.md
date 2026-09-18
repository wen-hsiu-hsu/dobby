# 專案概覽

## 用途

Dobby 是羽球社的 LINE 機器人，負責：

- 管理每週打球的零打（補位）報名與取消
- 處理季租球員的請假與銷假
- 發送每週打球資訊推播
- 回應 @Dobby 指令（查詢欠費、公告、付款資訊等）
- 自動回覆設定的關鍵字訊息

系統支援兩個 LINE bot（Dobby、球來就打），共用同一套邏輯。**球來就打是測試用 bot**，不是對等的第二個正式產品——程式碼層面兩者的路由/client 是對稱設計（見 `docs/architecture.md`「雙 Bot 支援」），容易誤以為兩個都是正式環境，但實際定位不是這樣。

## 技術棧

| 類別 | 選擇 | 說明 |
|------|------|------|
| Runtime | Node.js 22 LTS | |
| 語言 | TypeScript 5.x（strict mode） | |
| 框架 | Express 5.x | |
| LINE SDK | `@line/bot-sdk` 10.x | 官方 SDK，含 signature 驗證 |
| 資料庫 | Notion（`@notionhq/client`） | 透過 REST API 操作 |
| 排程 | `node-cron` | cron 表達式 |
| 日誌 | `pino` + `pino-roll` | JSON 日誌，每日輪替 |
| 環境驗證 | `zod` | 啟動時 fail-fast 驗證 |
| 測試 | Vitest + supertest | |
| 容器 | Docker multi-stage build | |

## 系統常數

| 常數 | 值 | 說明 |
|------|----|------|
| `COURTS_DENSITY` | 7 | 每場地最多人數 |
| `MAX_GUESTS_PER_MEMBER` | 1 | 每位季租成員最多帶幾位朋友（預留，目前未強制限制） |

## Webhook 端點

| 路徑 | 用途 |
|------|------|
| `POST /webhook/dobby` | Dobby bot 的 LINE webhook |
| `POST /webhook/batting` | 球來就打 bot 的 LINE webhook |
| `GET /health` | 健康檢查 |
| `GET /logs` | 日誌查看器，需要 `LOGS_ACCESS_TOKEN`（`Authorization: Bearer <token>` 或 `?token=`） |

## 部署

### Docker Compose（目前實際使用的方式）

```bash
# 建置並在背景啟動
docker compose up -d --build

# 看 container log（跟應用自己的 /logs 頁面是兩回事，這是整個 container 的 stdout）
docker compose logs -f app

# 停止（不會刪掉 logs volume；千萬不要加 -v，會把 log 歷史一起清掉）
docker compose down
```

`docker-compose.yml` 有設 `restart: unless-stopped`，process 若因為未預期的例外 crash 會自動重啟，不需要額外裝 pm2/systemd。2026-09 以前是用手動 `node` + screen/tmux 跑，沒有任何自動重啟機制，process crash 後會直接停擺到有人發現為止；改用 Docker Compose 就是為了解決這個問題，見下方「日誌」一節的相關背景。

`logs` 是具名 volume（`docker-compose.yml` 裡的 `volumes: logs:`），log 檔案會持久化在這個 volume 裡，容器重啟或重新部署都不會遺失。

### Zeabur

專案使用 Docker multi-stage build，理論上可以直接部署至 Zeabur（把 `.env` 的變數設成 Zeabur 的環境變數即可），但**目前實際上沒有這樣用**——如果之後改用 Zeabur 或其他 PaaS，切記那類平台通常沒有持久化本機磁碟，`docker-compose.yml` 宣告的 volume 不會被沿用，需要另外在平台上設定持久化儲存，否則容器重啟會讓 `logs/` 整批消失。

### 日誌

啟動後日誌會寫入 `logs/` 資料夾，每日輪替，自動保留最近 7 天（cutoff 以 UTC 為基準計算，不受容器時區設定影響——即使之後把 TZ 設成 Asia/Taipei 也不會偏移刪除邊界）。開發模式下同時輸出至 console（pino-pretty 格式）。`logs/` 的實際路徑固定錨定在專案根目錄（`src/index.ts` 用 `process.argv[1]` 算出，往下傳給需要的模組），不會受到啟動當下的工作目錄影響，見 `docs/adr/0003-log-dir-anchored-via-argv.md`。`/logs` 這個路由（見上方端點表）需要 `LOGS_ACCESS_TOKEN` 驗證，頁面顯示時間是台北時間，不是 UTC。

上述 7 天保留只管得到 app 自己寫進 `logs/` 的檔案。`logger.ts` 同時用 `multistream` 把同一份 log 輸出到 `process.stdout`，這份輸出會被 Docker 的 `json-file` log driver 另外存一份，**預設沒有大小上限**，配合 `restart: unless-stopped` 長期常駐不重啟，理論上會在 host 磁碟上無限長大——尤其是在 Pi 這類儲存空間有限的機器上風險較高。`docker-compose.yml` 已加上 `logging.options`（`max-size: 10m` / `max-file: 3`，共上限約 30MB）避免這個問題，這層限制跟 app 自己的 7 天保留機制是分開的兩件事，改動其中一邊不會影響另一邊。

預設 log level 是 `info`；`notion-fetch.ts` 打 Notion API 的完整 request/response（含成員姓名、LINE user_id 等 PII）只在 `debug` level 才會被記錄。要臨時診斷正式環境問題時，把 `LOG_LEVEL` 環境變數改成 `debug` 並重啟服務即可看到完整內容，不用改程式碼重新部署；**診斷完務必改回 `info`**，否則這些 PII 會持續寫進 `/logs` 可查到的檔案。為什麼要拆成 info/debug 兩個 level 記、而不是把整行都升到 info，見 `docs/adr/0005-purpose-context-layered-on-reqid.md`。
