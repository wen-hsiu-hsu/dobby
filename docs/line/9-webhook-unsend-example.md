# LINE Webhook 範例：訊息收回事件 (unsend)

本文件提供使用者收回訊息時的 webhook 輸出範例。

## 使用時機

當需要開發與**訊息收回**相關的功能時（例如刪除已儲存的訊息、記錄收回行為），請先閱讀此範例以了解完整的 webhook 結構。

---

## 完整 Webhook 輸出範例

```json
[
  {
    "headers": {
      "host": "your-domain.zeabur.app",
      "user-agent": "LineBotWebhook/2.0",
      "content-length": "370",
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
          "type": "unsend",
          "unsend": {
            "messageId": "595934733574865731"
          },
          "webhookEventId": "01KEKJKHFVP55ZZ4MEK2HE4SYB",
          "deliveryContext": {
            "isRedelivery": false
          },
          "timestamp": 1768036090874,
          "source": {
            "type": "group",
            "groupId": "CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            "userId": "UXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          },
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
- **events[0].type**: 事件類型為 `"unsend"`
- **events[0].unsend.messageId**: 被收回的訊息 ID
- **events[0].source.type**: 來源類型（`"group"` 或 `"user"`）
- **events[0].source.groupId**: 群組 ID（若在群組中收回）
- **events[0].source.userId**: 收回訊息的使用者 ID
- **events[0].timestamp**: 事件時間戳（Unix milliseconds）
- **events[0].mode**: 運作模式（`"active"` 表示正常模式）
- **⚠️ 注意**: unsend 事件**沒有 replyToken**，無法直接回覆

### 其他
- **webhookUrl**: 此 webhook 的 URL
- **executionMode**: 執行模式（`"test"` 表示測試模式）

---

## n8n 開發注意事項

1. **事件類型判斷**: 使用 `$json.body.events[0].type === 'unsend'` 判斷是否為訊息收回事件
2. **訊息 ID**: 使用 `$json.body.events[0].unsend.messageId` 取得被收回的訊息 ID
3. **收回者 ID**: 使用 `$json.body.events[0].source.userId` 取得收回訊息的使用者 ID
4. **群組 ID**: 若在群組中，使用 `$json.body.events[0].source.groupId` 取得群組 ID
5. **⚠️ 無法回覆**: unsend 事件沒有 `replyToken`，無法使用 Reply API，需使用 Push API 或不回應

---

## 常見應用場景

### 1. 刪除已儲存的訊息
當使用者收回訊息時，從資料庫中刪除該訊息的記錄。

```javascript
// 範例：從資料庫刪除訊息
const messageId = $json.body.events[0].unsend.messageId;
// 執行 DELETE 操作...
```

### 2. 記錄收回行為
記錄誰在什麼時間收回了哪則訊息（用於審計或統計）。

```javascript
// 範例：記錄收回行為
const logData = {
  messageId: $json.body.events[0].unsend.messageId,
  userId: $json.body.events[0].source.userId,
  groupId: $json.body.events[0].source.groupId,
  timestamp: $json.body.events[0].timestamp
};
```

### 3. 觸發特殊回應
雖然無法直接回覆，但可以使用 Push API 傳送訊息（例如提醒管理員有訊息被收回）。

---

## 與其他事件的差異

| 欄位 | unsend | message | memberJoined |
|------|--------|---------|--------------|
| `type` | `"unsend"` | `"message"` | `"memberJoined"` |
| 特殊欄位 | `unsend.messageId` | `message.text` | `joined.members[]` |
| 是否有 replyToken | ❌ 否 | ✅ 是 | ✅ 是 |
| `source.userId` | ✅ 是 | ✅ 是（一對一） | ❌ 否 |

---

## 重要限制

### ⚠️ 無法直接回覆
unsend 事件**沒有 replyToken**，因此：
- ❌ 無法使用 Reply API
- ✅ 可使用 Push API（需要目標 userId 或 groupId）
- ✅ 可執行資料庫操作（刪除、更新）
- ✅ 可觸發其他 workflow

### 訊息 ID 對應
- 需要在收到原始訊息時就記錄 `message.id`，才能在 unsend 事件中找到對應的訊息進行刪除
- 建議在資料庫中建立 `line_message_id` 欄位來追蹤

---

## 相關文件

- [Webhook Events](2-webhook-events.md) - 完整事件類型說明
- [Webhook Message Example](7-webhook-message-example.md) - 使用者傳送訊息範例
- [Reply API](1-reply-api.md) - Reply API 說明（unsend 事件無法使用）
