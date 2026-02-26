# LINE Webhook 範例：使用者傳送訊息事件

本文件提供使用者傳送訊息時的 webhook 輸出範例，包含**私訊**與**群組訊息**兩種情境。

## 使用時機

當需要開發與**使用者傳送訊息**相關的功能時，請先閱讀此範例以了解完整的 webhook 結構。

---

## 範例 1：私訊 (source.type = "user")

```json
[
  {
    "headers": {
      "host": "your-domain.zeabur.app",
      "user-agent": "LineBotWebhook/2.0",
      "content-length": "794",
      "content-type": "application/json; charset=utf-8",
      "x-forwarded-for": "XXX.XX.XXX.XXX",
      "x-forwarded-host": "your-domain.zeabur.app",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-line-signature": "REDACTED_SIGNATURE",
      "x-real-ip": "XXX.XX.XXX.XXX",
      "x-zeabur-container-port": "5678",
      "x-zeabur-ip-country": "JP",
      "x-zeabur-request-id": "hnd1::xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "accept-encoding": "gzip"
    },
    "params": {},
    "query": {},
    "body": {
      "destination": "UXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "events": [
        {
          "type": "message",
          "message": {
            "type": "text",
            "id": "595988571795226693",
            "quoteToken": "REDACTED_QUOTE_TOKEN",
            "markAsReadToken": "REDACTED_MARK_AS_READ_TOKEN",
            "text": "dgf"
          },
          "webhookEventId": "01KEMH6NRRRZ7E5JC5QTA9YRZE",
          "deliveryContext": {
            "isRedelivery": false
          },
          "timestamp": 1768068175131,
          "source": {
            "type": "user",
            "userId": "UXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          },
          "replyToken": "REDACTED_REPLY_TOKEN",
          "mode": "active"
        }
      ]
    },
    "webhookUrl": "https://your-domain.zeabur.app/webhook-test/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "executionMode": "test"
  }
]
```

---

## 範例 2：群組訊息 (source.type = "group")

```json
[
  {
    "headers": {
      "host": "hsiu-n8n.zeabur.app",
      "user-agent": "LineBotWebhook/2.0",
      "content-length": "841",
      "content-type": "application/json; charset=utf-8",
      "x-forwarded-for": "147.92.150.196, 147.92.150.196",
      "x-forwarded-host": "hsiu-n8n.zeabur.app",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
      "x-line-signature": "CPy0umoyKr7ST6AKeOOY51ujtPC8yiDhYHfCKtxY0/c=",
      "x-real-ip": "147.92.150.196",
      "x-zeabur-container-port": "5678",
      "x-zeabur-ip-country": "JP",
      "x-zeabur-request-id": "hnd1::375fce02-4ad3-488d-a3d7-8f5f3743ac6c",
      "accept-encoding": "gzip"
    },
    "params": {},
    "query": {},
    "body": {
      "destination": "U6d13ebf392bb4210e0c88103a198af8f",
      "events": [
        {
          "type": "message",
          "message": {
            "type": "text",
            "id": "595992385457750068",
            "quoteToken": "OQLRsEwffTFiUzxUjucejZXKCzEPwEXE4y24upt2qJTzwUbfd_XxrZdJJ4X4pD-csQWy_v0ehtkWIv9MVg3T-HbHJ9yIQxUjRALnCJFioaf-lSXoZ1tIPQb3wSOmePz_NLN-z7w411IEXJlbIEe_PQ",
            "markAsReadToken": "IViAKly3S3vQhmYK9kooXgeGSRZ9icTKmvJvMsUEwgTmyxcIqIg_J1QqmkmToxn8tNUND64rrq4QB0UK69d19_9kWOB2jIQSF8U8NBhk0oSAEs7uZMRfaOLvc6EEy3kBPW7GYcXarZov6ONIdWniyDvuC9BS2AKF4BSshcAIpjfzOqmdlIxWPFLH_5Zdfr8LMWJxjNlvKZSvErYeS2mCHw",
            "text": "sad"
          },
          "webhookEventId": "01KEMKC1KKBAXQCBNKCE5T4V00",
          "deliveryContext": {
            "isRedelivery": false
          },
          "timestamp": 1768070448250,
          "source": {
            "type": "group",
            "groupId": "Ca18e766e2730654fc1ca2573a14e01e2",
            "userId": "U2a0a2c5054c4fa12b78a1d059411e39c"
          },
          "replyToken": "aa1d71468ceb40aa82c041fa149a0378",
          "mode": "active"
        }
      ]
    },
    "webhookUrl": "https://hsiu-n8n.zeabur.app/webhook-test/6ffc18b9-7e3e-464a-9572-f35473e52d4d",
    "executionMode": "test"
  }
]
```

---

## 關鍵欄位說明

### Headers
- **x-line-signature**: LINE 平台的簽章驗證（已隱藏）
- **user-agent**: 固定為 `LineBotWebhook/2.0`
- **x-zeabur-ip-country**: 來源國家（此例為 JP）

### Body
- **destination**: Bot 的 User ID（目的地）
- **events[0].type**: 事件類型為 `"message"`
- **events[0].message.type**: 訊息類型為 `"text"`
- **events[0].message.text**: 使用者傳送的文字內容
- **events[0].message.quoteToken**: 用於引用訊息的 token
- **events[0].message.markAsReadToken**: 用於標記已讀的 token
- **events[0].source.type**: 來源類型，有兩種可能：
  - `"user"`: 私訊（1對1對話）
  - `"group"`: 群組訊息
- **events[0].source.userId**: 傳送訊息的使用者 ID
- **events[0].source.groupId**: 群組 ID（**僅群組訊息有此欄位**）
- **events[0].replyToken**: 用於回覆的 token（有效期限短，僅能使用一次）
- **events[0].timestamp**: 事件時間戳（Unix milliseconds）
- **events[0].mode**: 運作模式（`"active"` 表示正常模式）

### 其他
- **webhookUrl**: 此 webhook 的 URL
- **executionMode**: 執行模式（`"test"` 表示測試模式）

---

## 私訊 vs 群組訊息差異

| 項目 | 私訊 (user) | 群組訊息 (group) |
|------|-------------|-----------------|
| **source.type** | `"user"` | `"group"` |
| **source.userId** | 傳送者 ID | 傳送者 ID |
| **source.groupId** | ❌ 無此欄位 | ✅ 群組 ID |

---

## n8n 開發注意事項

1. **訊息內容取得**: 使用 `$json.body.events[0].message.text` 取得使用者傳送的文字
2. **回覆 Token**: 使用 `$json.body.events[0].replyToken` 進行回覆（一次性）
3. **使用者 ID**: 使用 `$json.body.events[0].source.userId` 識別使用者
4. **訊息類型判斷**: 先檢查 `$json.body.events[0].message.type` 是否為 `"text"`，再處理文字內容
5. **來源類型判斷**: 使用 `$json.body.events[0].source.type` 判斷是私訊還是群組訊息
   - 若為 `"group"`: 可使用 `$json.body.events[0].source.groupId` 取得群組 ID
   - 若為 `"user"`: 無 `groupId` 欄位

---

## 相關文件

- [Webhook Events](2-webhook-events.md) - 完整事件類型說明
- [Message Objects](3-message-objects.md) - 訊息物件格式
- [Reply API](1-reply-api.md) - 如何使用 replyToken 回覆
