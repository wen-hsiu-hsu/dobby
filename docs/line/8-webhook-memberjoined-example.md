# LINE Webhook 範例：成員加入群組事件 (memberJoined)

本文件提供成員加入群組時的 webhook 輸出範例。

## 使用時機

當需要開發與**成員加入群組**相關的功能時（例如歡迎訊息），請先閱讀此範例以了解完整的 webhook 結構。

---

## 完整 Webhook 輸出範例

```json
[
  {
    "headers": {
      "host": "your-domain.zeabur.app",
      "user-agent": "LineBotWebhook/2.0",
      "content-length": "419",
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
          "type": "memberJoined",
          "joined": {
            "members": [
              {
                "type": "user",
                "userId": "UXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              }
            ]
          },
          "webhookEventId": "01KEKFHHK2JJJ1P80BTS95EQEH",
          "deliveryContext": {
            "isRedelivery": false
          },
          "timestamp": 1768032880107,
          "source": {
            "type": "group",
            "groupId": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
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

## 關鍵欄位說明

### Headers
- **x-line-signature**: LINE 平台的簽章驗證（已隱藏）
- **user-agent**: 固定為 `LineBotWebhook/2.0`
- **x-zeabur-ip-country**: 來源國家（此例為 JP）

### Body
- **destination**: Bot 的 User ID（目的地）
- **events[0].type**: 事件類型為 `"memberJoined"`
- **events[0].joined.members**: 加入的成員陣列
  - **type**: 成員類型（通常為 `"user"`）
  - **userId**: 加入成員的 User ID
- **events[0].source.type**: 來源類型為 `"group"`（群組）
- **events[0].source.groupId**: 群組 ID
- **events[0].replyToken**: 用於回覆的 token（有效期限短，僅能使用一次）
- **events[0].timestamp**: 事件時間戳（Unix milliseconds）
- **events[0].mode**: 運作模式（`"active"` 表示正常模式）

### 其他
- **webhookUrl**: 此 webhook 的 URL
- **executionMode**: 執行模式（`"test"` 表示測試模式）

---

## n8n 開發注意事項

1. **事件類型判斷**: 使用 `$json.body.events[0].type === 'memberJoined'` 判斷是否為成員加入事件
2. **加入成員 ID**: 使用 `$json.body.events[0].joined.members[0].userId` 取得新成員的 User ID
3. **群組 ID**: 使用 `$json.body.events[0].source.groupId` 取得群組 ID
4. **回覆 Token**: 使用 `$json.body.events[0].replyToken` 進行回覆（例如傳送歡迎訊息）
5. **多成員加入**: `joined.members` 是陣列，理論上可能有多個成員同時加入，需使用迴圈處理

---

## 常見應用場景

### 1. 歡迎新成員
當新成員加入群組時，自動傳送歡迎訊息並 mention 該成員。

### 2. 自動註冊
將新成員的 User ID 記錄到資料庫，建立使用者資料。

### 3. 群組管理
通知管理員有新成員加入，或執行群組規則驗證。

---

## 與其他事件的差異

| 欄位 | memberJoined | 一般訊息事件 |
|------|--------------|--------------|
| `type` | `"memberJoined"` | `"message"` |
| `source.type` | `"group"` | `"user"` 或 `"group"` |
| 特殊欄位 | `joined.members[]` | `message.text` |
| 是否有訊息內容 | ❌ 否 | ✅ 是 |

---

## 相關文件

- [Webhook Events](2-webhook-events.md) - 完整事件類型說明
- [Webhook Message Example](7-webhook-message-example.md) - 使用者傳送訊息範例
- [Reply API](1-reply-api.md) - 如何使用 replyToken 回覆
