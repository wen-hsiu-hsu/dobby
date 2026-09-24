# 專案概覽

## 用途

Dobby 是羽球社的 LINE 機器人，負責：

- 管理每週打球的零打（補位）報名與取消
- 處理季租球員的請假與銷假
- 發送每週打球資訊推播
- 回應 @Dobby 指令（查詢欠費、公告、付款資訊等）
- 自動回覆設定的關鍵字訊息

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
| `POST /webhook` | LINE webhook |
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

### 對外曝露與自動部署

正式環境跑在自架的 Raspberry Pi 上（上面的 Docker Compose 方式不變），對外曝露跟自動部署都不是這個 repo 自己管的，而是 Pi 上兩個獨立於任何專案 repo 之外的**共用基礎設施**，之後 Pi 上新增其他專案時也共用同一套，不用每個專案各自處理一份：

- **Cloudflare Tunnel**：outbound-only 連線，Pi 不用在路由器開任何 inbound port，家用（浮動）IP 不會曝光。同一個 tunnel 下用多條 Public Hostname 規則分流到 Pi 上不同的服務，dobby 分到的 hostname 導到 `localhost:<PORT>`（實際 port 看 Pi 上那份 `.env` 的 `PORT` 值，見下方）。`/webhook`、`/health`、`/logs` 三個端點都走同一個 hostname，沒有分開設定。
- **pi-deployer**：Pi 上自架的通用 webhook 部署服務（不是 dobby 的一部分），GitHub push 新 commit 到這個 repo 時觸發自動 `git pull` + `docker compose up -d --build`，取代手動 SSH 上去部署。

**`/logs` 沒有額外套 Cloudflare Access 保護**——這是討論過的既定決定，維持現有的 `LOGS_ACCESS_TOKEN` 機制即可，不是遺漏。`/webhook` 的安全性一樣不靠曝露方式本身，靠的是 `@line/bot-sdk` 內建的 signature 驗證（見上方「Webhook 端點」）；Tunnel 只是換掉封包怎麼送到 Pi，不影響、也不能取代這層驗證。

`docker-compose.yml` 的 `ports: "${PORT:-3000}:${PORT:-3000}"` 是特意保留給 Pi host 上的 Cloudflare Tunnel / pi-deployer 用的，不要因為「反正走 tunnel 不需要開 port」而誤刪——host 上這兩個服務都是透過這個對外的 port mapping 打到 container 裡的 app，不是走 docker network 內部解析。這裡的 `${PORT}` 是 Compose 在解析這份 YAML 時，從專案根目錄的 `.env` 讀值替換（跟同一個 `.env` 透過 `env_file:` 注入到容器內部是兩個不同機制，只是剛好共用同一份檔案），沒設的話 fallback 回 `3000`，跟 `src/config/env.ts` 的 zod schema 預設值一致。要換 port 只需要改 `.env` 的 `PORT`，不用再動這個檔案；但如果啟動 `docker compose` 的 shell 本身也 export 了 `PORT`，會蓋過 `.env` 裡的值，要注意這個優先順序。

`docker-compose.dev.yml`（本地開發用）**刻意**維持 `"3000:3000"` 寫死，不吃這個機制——本地開發不需要換 port 的彈性，且裡面 ngrok tunnel 那行 `command` 也寫死指向 `app:3000`，兩處要嘛一起吃變數、要嘛都不動，目前選擇都不動，不是漏改。

### 監控

Pi 上另外跑了一套通用的監控 stack（跟 Cloudflare Tunnel、pi-deployer 一樣，不屬於這個 repo，是 Pi 上所有專案共用的基礎設施）：**Grafana**（UI，data source 只接了 Prometheus）+ **Prometheus**（`http://localhost:9090`，Pi 上本機存取）+ **node-exporter**（host 層級指標）+ **cAdvisor**（per-container 指標）。dobby 的 container 不需要另外設定什麼就會被 cAdvisor 自動抓到，Prometheus 對應的 job 名稱是 `cadvisor`，container 名稱是 `dobby-app-1`（沿用 docker-compose 的 project 名稱 `dobby` + service 名稱 `app`）。

查 dobby 資源用量時，container 記憶體要查 `container_memory_working_set_bytes{name="dobby-app-1"}`，不要用 `container_memory_usage_bytes`——後者在 cgroup v2 下常常讀不到值。

**Pi 韌體預設關閉了 memory cgroup controller，會讓 `docker stats`／cAdvisor 的記憶體用量全部顯示 `0`（2026-09-24 已修復）。** 根因是 Raspberry Pi 的 bootloader 組出最終 `/proc/cmdline` 時，會在使用者可編輯的 `/boot/firmware/cmdline.txt`（Bookworm 之後的路徑；`/boot/cmdline.txt` 只是提示已搬家的殘留檔，編輯無效）**前面**自動注入板卡專屬參數，其中包含 `cgroup_disable=memory`，導致 `/sys/fs/cgroup/cgroup.controllers` 裡沒有 `memory` 這個 controller。這跟 dobby 本身無關，是**整台 Pi 系統層級**的問題，會影響 Pi 上所有 container 的記憶體監控。修法是在 `/boot/firmware/cmdline.txt` 檔案最後面（維持整份檔案單行）加上 `cgroup_enable=memory cgroup_memory=1` 後重開機——kernel 對 cgroup 相關參數是後面設定覆蓋前面，所以即使前面已經有 `cgroup_disable=memory`，後面再補一次 `cgroup_enable=memory` 一樣會生效。如果之後系統更新後又發現記憶體全是 `0`，優先懷疑 `cmdline.txt` 被覆蓋、這個參數又不見了。

### Zeabur

專案使用 Docker multi-stage build，理論上可以直接部署至 Zeabur（把 `.env` 的變數設成 Zeabur 的環境變數即可），但**目前實際上沒有這樣用**——如果之後改用 Zeabur 或其他 PaaS，切記那類平台通常沒有持久化本機磁碟，`docker-compose.yml` 宣告的 volume 不會被沿用，需要另外在平台上設定持久化儲存，否則容器重啟會讓 `logs/` 整批消失。

### 日誌

啟動後日誌會寫入 `logs/` 資料夾，每日輪替，自動保留最近 7 天（cutoff 以 UTC 為基準計算，不受容器時區設定影響——即使之後把 TZ 設成 Asia/Taipei 也不會偏移刪除邊界）。開發模式下同時輸出至 console（pino-pretty 格式）。`logs/` 的實際路徑固定錨定在專案根目錄（`src/index.ts` 用 `process.argv[1]` 算出，往下傳給需要的模組），不會受到啟動當下的工作目錄影響，見 `docs/adr/0003-log-dir-anchored-via-argv.md`。`/logs` 這個路由（見上方端點表）需要 `LOGS_ACCESS_TOKEN` 驗證，頁面顯示時間是台北時間，不是 UTC。

上述 7 天保留只管得到 app 自己寫進 `logs/` 的檔案。`logger.ts` 同時用 `multistream` 把同一份 log 輸出到 `process.stdout`，這份輸出會被 Docker 的 `json-file` log driver 另外存一份，**預設沒有大小上限**，配合 `restart: unless-stopped` 長期常駐不重啟，理論上會在 host 磁碟上無限長大——尤其是在 Pi 這類儲存空間有限的機器上風險較高。`docker-compose.yml` 已加上 `logging.options`（`max-size: 10m` / `max-file: 3`，共上限約 30MB）避免這個問題，這層限制跟 app 自己的 7 天保留機制是分開的兩件事，改動其中一邊不會影響另一邊。

預設 log level 是 `info`；`notion-fetch.ts` 打 Notion API 的完整 request/response（含成員姓名、LINE user_id 等 PII）只在 `debug` level 才會被記錄。要臨時診斷正式環境問題時，把 `LOG_LEVEL` 環境變數改成 `debug` 並重啟服務即可看到完整內容，不用改程式碼重新部署；**診斷完務必改回 `info`**，否則這些 PII 會持續寫進 `/logs` 可查到的檔案。為什麼要拆成 info/debug 兩個 level 記、而不是把整行都升到 info，見 `docs/adr/0005-purpose-context-layered-on-reqid.md`。

**千萬不要對正在跑的容器直接 `rm` log 檔案。** `pino-roll` 在 `initLogger()`（`app.listen()` 之前就跑）就已經開好檔案控制代碼在寫入；在 Linux 上刪除一個程式還握著在寫的檔案，只會拿掉目錄裡的檔名，process 完全不知道、還是會繼續往那個已經沒有名字的 inode 寫下去。結果是：`docker compose logs app` 明明看得到 bot 還在正常處理流量，但 `logs/` 資料夾用 `ls` 看是空的，`/logs` 頁面也是空的——因為它是靠掃檔名找資料，掃到的是空資料夾。想確認是不是踩到這個雷，進容器看一下 process 手上還握著哪些檔案：

```bash
docker exec dobby-app-1 ls -la /proc/1/fd/
# 看到類似這行就是了：
# l-wx------ 1 root root 64 ... 19 -> /app/logs/app.2026-09-21.1.log (deleted)
```

要清空 log 的正確做法是「清空內容、留著檔名」，而不是刪檔名：

```bash
# 對還在跑的容器安全清空單個檔案（保留檔名，process 繼續寫進同一個檔案沒問題）
docker exec dobby-app-1 sh -c ': > logs/app.2026-09-21.1.log'
```

如果真的要整批刪除檔名本身（例如要連檔案輪替的編號一起重置），刪完一定要接著明確重啟這個 service，不要刪了就走：

```bash
docker exec dobby-app-1 rm -f logs/app.*.log
docker compose restart app   # 這一步不能省
```

完成輪替（或仍在寫入中）的 log 檔案，會另外週期性（預設 15 分鐘，見 `R2_LOG_SYNC_INTERVAL_MINUTES`）整份同步一份到 Cloudflare R2（S3 相容物件儲存）做異地備份（只傳跟上次成功上傳時相比 mtime／大小有變動的檔案，沒變動的舊檔會跳過；服務重啟後第一輪會全部重傳一次），跟上面講的本機 7 天保留機制是分開的兩件事——R2 上的備份不受 7 天保留限制，也不會因為容器重啟／重新部署（例如部署到 Zeabur 這類檔案系統是 ephemeral 的平台）而消失。服務正常關閉（graceful shutdown）時，也會在 `server.close()` 之前額外多同步一次。沒設定 R2 時完全不排程，只在啟動時記一行 debug（`R2 not configured, log sync disabled`），graceful shutdown 時也不會寫任何 log。要不要啟用這個功能、同步邏輯為什麼是「全目錄週期性重傳」而不是掛 `pino-roll` 的輪替事件，見 `docs/adr/0006-log-r2-sync-is-periodic-full-directory-not-rotation-hook.md`；環境變數見 `docs/development.md` 的環境變數表。

**`docker compose up -d --build` 不保證會重啟 process。** `--build`只決定要不要重新打包 image；如果這次 build 的每一層都命中快取（沒有任何原始碼變動），打出來的 image 會跟現在正在跑的完全一樣，Compose 判斷「沒有變化」就不會重建容器、process 也不會重啟——上面提到的那個握著已刪除檔案的 process 就會繼續原封不動地跑下去。要在不管有沒有原始碼變動的情況下強制重啟，用 `docker compose restart app`（不用重新打包）或 `docker compose up -d --build --force-recreate`（連 image 沒變也強制重建容器）。
