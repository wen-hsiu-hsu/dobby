## Context

Dobby 羽球社 LINE Bot 目前以 4 個 n8n workflows 運行（Line bot、scheduled-message、update-display_name）。n8n 的節點式開發讓業務邏輯分散難讀，且不支援本地測試、無法版控 diff、依賴 n8n 平台持續付費運作。

核心業務邏輯：
- 雙 webhook（同一 Express server 接兩個 bot channel，共用邏輯）
- @Dobby mention 指令系統（11 種指令，含 admin-only）
- 報名/請假系統（mutex 保護並發）
- 自動回覆（494 筆關鍵字，JSON 資料源）
- 週日推播（node-cron）
- 使用者顯示名稱批次更新（週一凌晨）

## Goals / Non-Goals

**Goals:**
- 功能完整移植，使用者體驗零感知切換
- TypeScript 型別安全，可本地測試
- Docker 容器化部署至 Zeabur
- 單一 Express server 接管雙 bot webhook

**Non-Goals:**
- 新增 n8n 沒有的功能
- 改用 Redis（單 server in-process mutex 足夠）
- 多 instance 水平擴展
- 前端管理介面

## Decisions

### 1. 單一 webhook endpoint vs 雙 endpoint

**決定**: 兩個 bot 共用一個 Express server，各有獨立 route：
- `POST /webhook/dobby` → Dobby channel secret 驗證
- `POST /webhook/batting` → 球來就打 channel secret 驗證

**理由**: n8n 原本兩個 bot 共用同一個 workflow 邏輯，維持此架構最自然。分開 route 可獨立驗證 signature，避免 secret 混用。

### 2. Auto-reply 資料源

**決定**: `src/data/auto-reply.json` hardcode，啟動時載入記憶體。

**理由**: 494 筆規則來自 n8n Data Table（非 Notion），遷移後無對應儲存。規則變動頻率極低（全部建立於同一天），JSON 檔 git 可追蹤，零 latency，不需 API call。放棄 runtime 動態更新能力是可接受的 trade-off。

**否決方案**: Notion DB — 增加 API call overhead；環境變數 — 無法儲存結構化資料。

### 3. In-process Mutex vs Redis

**決定**: `Map<string, boolean>` + 10 秒 timeout 自動釋放。

**理由**: 單一 server 部署（Zeabur 單容器），n8n 原本的 Redis SET NX 也僅是序列化同一 workflow 的執行。Mutex key 為 `eventPageId`（週六活動頁面 ID），同一時間最多幾個用戶並發，in-process 完全足夠。

**風險**: server 重啟時 lock 消失 → 與原本 Redis TTL=10s 等價，可接受。

### 4. 排程執行

**決定**: `node-cron` with `NODE_ENV !== 'test'` guard，timezone `Asia/Taipei`。

- 週日 09:00 → 下次打球推播（Dobby 正式群組）
- 週一 04:00 → 顯示名稱批次更新

**理由**: `node-cron` 輕量，官方支援 timezone，與 n8n Schedule Trigger 行為一致。

### 5. Notion Repository 層

**決定**: 每個 Notion DB 對應一個 Repository class，集中 property read/write 轉換。

```
notion-client.ts        ← @notionhq/client singleton
property-helpers.ts     ← Notion property 格式轉換工具
*-repository.ts         ← 各 DB 的 CRUD methods
```

**理由**: Notion property 的讀取格式（`properties.X.rich_text[0].plain_text`）與寫入格式（`{ rich_text: [{ text: { content: "..." } }] }`）完全不同，集中處理避免散落各處的型別錯誤。

### 6. Fire-and-forget webhook 回應

**決定**: webhook route 立即回 200，事件處理 async 在背景執行：

```typescript
router.post('/webhook/:botId', lineSignature, (req, res) => {
  res.status(200).json({ status: 'ok' });
  processEvents(req.body.events, req.params.botId).catch(logger.error);
});
```

**理由**: LINE 要求 ~1 秒內收到 200，否則重試。Notion API 呼叫（200-500ms × 多次）可能超過此限制。

### 7. 測試策略

- **Unit**: command parser、mutex、capacity calculator、property helpers
- **Integration**: webhook endpoint（supertest + mock Notion/LINE）
- **E2E**: 報名/請假完整流程（mock 外部 API）
- **不做**: 直連真實 LINE/Notion 的 E2E（避免汙染正式資料）

## Risks / Trade-offs

| 風險 | 緩解 |
|------|------|
| Notion Rate Limit (3 req/s) | 非關鍵路徑使用 TTL cache；批次操作加 delay |
| Reply Token 過期（~1 分鐘） | 立即 200 + 背景處理；失敗 fallback Push API |
| Mutex 重啟遺失 | 10秒 TTL，與原 Redis 行為等價，可接受 |
| 切換期間漏事件 | 先部署新 server → 測試 → 一次性切換 webhook URL → 保留 n8n 備援 |
| textV2 mention 格式差異 | 對照 n8n 現有 Self Intro Parser 程式碼，確保格式一致 |
| `@Dobby next?-=N&c=N` query params | admin 功能，需在 command parser 保留此解析邏輯 |

## Migration Plan

1. **部署新 server**（不切換 webhook）：Zeabur 建新 project，設定環境變數，確認 `/health` 200
2. **shadow test**：臨時將新 server 設為 LINE webhook（測試群組），驗證所有指令
3. **一次性切換**：LINE Console 更新正式 webhook URL → 停用 n8n workflows
4. **保留 n8n 7 天**：觀察期，問題可立即回切

**Rollback**: LINE Console 改回 n8n webhook URL，< 1 分鐘完成。

## Open Questions

- n8n Data Table（auto-reply）的完整資料已匯出為 CSV（494 筆），轉換 script 需在 Phase 1 處理
- Dobby 正式群組 ID (`C9fb61df21d9118e77d6e3065716fc08a`) 已從 n8n workflow 取得，其餘 secrets 需從 n8n Credentials 手動複製
