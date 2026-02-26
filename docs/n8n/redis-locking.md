# Redis 分散式鎖定機制

> **用途**：防止報名/請假操作的並發執行導致 Notion 資料覆蓋

**實現日期**：2026-01-25
**關鍵依賴**：Community Node `@codingfrog/n8n-nodes-redis-enhanced`

---

## 🎯 問題與解決方案

### 問題
不同用戶幾乎同時執行報名/請假操作時，可能同時更新同一個 Notion Event Page，導致：
- 後執行的請求覆蓋先執行的請求
- 資料不一致（例如：請假名單丟失、零打名額錯誤）

### 解決方案
使用 Redis 分散式鎖定機制，確保對同一個 Event Page 的操作**串行執行**。

---

## 📦 前置需求

### 1. 安裝 Community Node

**為什麼需要？**
- n8n 官方 Redis node **不支援 SET NX** 參數
- 無法實現原子性分散式鎖定

**安裝方式**：
```
n8n UI → Settings → Community Nodes → Install
→ 輸入: @codingfrog/n8n-nodes-redis-enhanced
→ Install → 重啟 n8n
```

### 2. Redis 設定
- Redis 已啟動：`redis-cli PING` 應返回 `PONG`
- n8n Credential：`Redis account (n8n)`

---

## 🏗️ 實現架構

### 節點流程（13 個新節點）

```
Command controller (報名請假)
  ↓
Get Event Date (Lock) - 計算下週六日期
  ↓
Query Event Page (Lock) - 查詢 Notion Event Page
  ↓
Extract Event Page ID - 提取 Event Page ID，準備 lockKey
  ↓
Redis Enhanced (Community Node) - 嘗試加鎖
  ↓
Verify Lock Acquired (Redis GET) - 驗證鎖是否成功
  ↓
Prepare Lock Check (Code) - 比對 lockValue === executionId
  ↓
Check Lock Success (IF)
  ├─ True → Restore Original Data → Registration Parser → ... → Update Notion
  │         ↓
  │         Merge All Branches (Lock)
  │         ↓
  │         Retrieve Lock Key
  │         ↓
  │         Release Lock (Redis DEL)
  │         ↓
  │         Registration Final Reply
  │
  └─ False → Lock Failed Error
             ↓
             Code in JavaScript (格式化錯誤訊息)
             ↓
             組起來 (回覆「系統繁忙」)
```

### 鎖定粒度
- **Event Page 級別**：`notion:event:{eventPageId}:lock`
- 同一日期的操作串行執行
- 不同日期的操作可以並行

### 鎖定參數
- **TTL**: 10 秒（自動過期，防止死鎖）
- **重試**: 無（立即回覆「系統繁忙」，用戶手動重試）

---

## ⚙️ 關鍵節點配置

### Redis Enhanced (加鎖)

```json
{
  "type": "@codingfrog/n8n-nodes-redis-enhanced.redisEnhanced",
  "name": "Redis Enhanced",
  "parameters": {
    "operation": "set",
    "key": "={{ $json.lockKey }}",
    "value": "={{ $json.executionId }}",
    "keyType": "string",
    "expire": true,      // 啟用 TTL
    "ttl": 10,           // 10 秒過期
    "setMode": "nx"      // 只在 key 不存在時設置
  }
}
```

**執行的 Redis 指令**：
```redis
SET notion:event:{eventPageId}:lock {executionId} NX EX 10
```

### Prepare Lock Check (驗證)

```javascript
// 從 Redis GET 讀取鎖的值
const redisResponse = $input.first().json;
const originalData = $('Extract Event Page ID').first().json;
const expectedExecutionId = String(originalData.executionId);

// n8n Redis GET 返回格式：{ propertyName: "value" }
let lockValue = null;
if (redisResponse && typeof redisResponse === 'object') {
  lockValue = redisResponse.propertyName || redisResponse.value || null;
} else if (typeof redisResponse === 'string') {
  lockValue = redisResponse;
}

lockValue = lockValue ? String(lockValue) : null;

// 比對是否為當前 execution 的鎖
const lockAcquired = (lockValue === expectedExecutionId);

return {
  lockAcquired,
  lockValue,
  expectedExecutionId,
  ...originalData
};
```

### Release Lock (釋放鎖)

```json
{
  "type": "n8n-nodes-base.redis",
  "name": "Release Lock",
  "parameters": {
    "operation": "delete",
    "key": "={{ $json.lockKey }}"
  },
  "continueOnFail": true  // 確保即使失敗也不阻塞
}
```

---

## 🧪 測試與驗證

### 測試案例 1: 正常流程
```
執行: @Dobby +1
預期:
  - 成功加鎖
  - Notion 更新成功
  - 鎖被釋放
  - 收到成功回覆
```

### 測試案例 2: 並發衝突
```
執行: 兩個用戶幾乎同時發送 @Dobby +1
預期:
  - 第一個用戶：成功
  - 第二個用戶：收到「系統繁忙，請稍後再試 🔒」
  - Notion 只有第一個用戶的更新
```

### 驗證 Redis

```bash
# 執行期間檢查鎖
redis-cli GET "notion:event:{eventPageId}:lock"
# 應返回 execution ID

# 檢查 TTL
redis-cli TTL "notion:event:{eventPageId}:lock"
# 應返回 0-10 之間的數字

# 執行完成後
redis-cli GET "notion:event:{eventPageId}:lock"
# 應返回 (nil)，表示鎖已釋放
```

---

## 🐛 疑難排解

### 問題 1: 兩個請求都成功（鎖沒有作用）

**檢查清單**：
- [ ] 是否使用 Community Node `@codingfrog/n8n-nodes-redis-enhanced`
- [ ] `setMode` 是否為 `"nx"`
- [ ] `expire` 是否為 `true`
- [ ] Redis 是否正常運作：`redis-cli PING`

**手動測試**：
```bash
# 第一次 SET NX（應該成功）
redis-cli SET "test:lock" "value1" NX EX 10
# 返回: OK

# 第二次 SET NX（應該失敗）
redis-cli SET "test:lock" "value2" NX EX 10
# 返回: (nil)

# 驗證值沒有被覆蓋
redis-cli GET "test:lock"
# 返回: "value1"
```

### 問題 2: 鎖未釋放（殭屍鎖）

**症狀**：所有用戶都收到「系統繁忙」

**原因**：
- n8n execution 異常中斷
- Release Lock 節點失敗

**解決方式**：
```bash
# 列出所有鎖
redis-cli KEYS "notion:event:*:lock"

# 手動刪除特定鎖
redis-cli DEL "notion:event:{eventPageId}:lock"

# 清除所有鎖（緊急情況）
redis-cli KEYS "notion:event:*:lock" | xargs redis-cli DEL
```

**預防**：
- TTL 10 秒會自動過期
- `Release Lock` 設定 `continueOnFail: true`

### 問題 3: Prepare Lock Check 錯誤

**症狀**：`lockValue` 總是 `null`

**原因**：n8n Redis GET 返回 `{ propertyName: "value" }` 格式

**檢查**：確認 Prepare Lock Check 有讀取 `propertyName` 欄位
```javascript
lockValue = redisResponse.propertyName || redisResponse.value || null;
```

---

## 📊 監控指令

```bash
# 查看當前所有鎖
redis-cli KEYS "notion:event:*:lock"

# 查看特定鎖的值和 TTL
redis-cli GET "notion:event:{eventPageId}:lock"
redis-cli TTL "notion:event:{eventPageId}:lock"

# 監控 Redis 命令（即時）
redis-cli MONITOR
```

---

## 🔧 關鍵修正紀錄

### 修正 1: 使用 Community Node（2026-01-25）
- **問題**：官方 Redis node 不支援 SET NX
- **解決**：改用 `@codingfrog/n8n-nodes-redis-enhanced`
- **配置**：`setMode: "nx"`, `expire: true`, `ttl: 10`

### 修正 2: propertyName 欄位（2026-01-25）
- **問題**：Redis GET 返回 `{ propertyName: "value" }` 而不是字串
- **解決**：優先讀取 `propertyName` 欄位

### 修正 3: 重複使用回覆機制（2026-01-25）
- **問題**：重複實現 HTTP Request
- **解決**：Lock Failed Error → Code in JavaScript → 組起來

---

## 📚 相關文件

- **商業邏輯**：`docs/project/context.md` (Registration & Leave Redis Locking)
- **n8n 概念**：`docs/n8n/n8n-concepts.md`
- **常見錯誤**：`docs/n8n/common-errors.md`

---

**最後更新**：2026-01-25
