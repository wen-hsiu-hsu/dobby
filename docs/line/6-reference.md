# 6. 快速參考表

### Webhook Event Types

| Event Type | 說明 | 可回覆 | 包含欄位 |
|-----------|------|--------|---------|
| `message` | 訊息事件 | ✅ | replyToken, message |
| `follow` | 關注事件 | ✅ | replyToken |
| `unfollow` | 取消關注事件 | ❌ | - |
| `join` | 加入群組/聊天室 | ✅ | replyToken |
| `leave` | 離開群組/聊天室 | ❌ | - |
| `postback` | 按鈕回傳事件 | ✅ | replyToken, postback |
| `beacon` | Beacon 事件 | ✅ | replyToken, beacon |
| `unsend` | 取消傳送事件 | ❌ | unsend |

### Message Types

| Message Type | 說明 | 可發送 | 可接收 |
|-------------|------|--------|--------|
| `text` | 文字訊息 | ✅ | ✅ |
| `image` | 圖片訊息 | ✅ | ✅ |
| `video` | 影片訊息 | ✅ | ✅ |
| `audio` | 音頻訊息 | ✅ | ✅ |
| `file` | 檔案訊息 | ❌ | ✅ |
| `location` | 位置訊息 | ✅ | ✅ |
| `sticker` | 貼圖訊息 | ✅ | ✅ |
| `template` | Template 訊息 | ✅ | ❌ |
| `flex` | Flex Message | ✅ | ❌ |

---

## 7. 常見錯誤處理

### 錯誤響應範例

```json
{
  "message": "Invalid reply token",
  "details": []
}
```

**常見錯誤碼**:
- `invalid_request_parameter`: 請求參數無效
- `message_validation_failed`: 訊息驗證失敗
- `invalid_access_token`: Access Token 無效
- `reach_rate_limit`: 超過速率限制

---

## 8. 最佳實踐

1. **立即回覆**: Reply Token 會在一段時間後失效，應在接收訊息後立即回覆
2. **使用 Reply 而非 Push**: 使用回覆而非主動推播，可節省配額
3. **驗證 Webhook 簽名**: 驗證 Webhook 的 `X-Line-Signature` 標頭確保安全
4. **處理重複 Webhook**: 檢查 `webhookEventId` 避免重複處理
5. **限制訊息數量**: 最多回覆 5 筆訊息，避免垃圾訊息
6. **適當使用 Quick Reply**: 在需要使用者快速選擇時使用 Quick Reply
7. **監測傳遞狀態**: 使用消息傳遞確認 API 監測訊息是否成功發送
