# 1. Send Reply Message API

### 基本資訊
- **URL**: `https://api.line.me/v2/bot/message/reply`
- **HTTP Method**: `POST`
- **Content-Type**: `application/json`
- **Authorization**: `Bearer {Channel Access Token}`

### Request Body 參數

```json
{
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "messages": [
    {
      "type": "text",
      "text": "Hello, world"
    }
  ]
}
```

| 參數名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `replyToken` | String | ✅ | 從 webhook 接收到的 reply token，用於回覆訊息 |
| `messages` | Array | ✅ | 訊息物件的陣列，最多可傳送 5 筆訊息 |

### 回覆訊息的限制
- 一個 `replyToken` 只能使用一次
- 最多可回覆 5 筆訊息
- Reply Token 在一段時間後會失效，應立即回覆

### Response 範例 (成功)

```json
{}
```

HTTP Status Code: `200`
