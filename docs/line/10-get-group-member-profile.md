# Get Group Chat Member Profile API

## 概述
取得群組成員的個人資料，包含顯示名稱、用戶 ID 和頭像 URL。

**使用情境**: 批次更新 Notion 使用者資料庫的 displayName

## API 規格

### Endpoint
```
GET https://api.line.me/v2/bot/group/{groupId}/member/{userId}
```

### Request Headers
```
Authorization: Bearer {channel access token}
```

### Path Parameters
- `groupId` (Required): 群組 ID，可從 webhook event 的 `source.groupId` 取得
- `userId` (Required): 用戶 ID，可從 webhook event 的 `source.userId` 取得

**注意**: 不要使用 LINE ID，必須使用系統內部的 User ID

### Rate Limit
- **2,000 requests per second**

## Response

### Success (200)
```json
{
  "displayName": "LINE taro",
  "userId": "U4af4980629...",
  "pictureUrl": "https://sprofile.line-scdn.net/0hHkIRkHJF..."
}
```

#### Response Fields
| Field | Type | Description | Always Present |
|-------|------|-------------|----------------|
| `displayName` | String | 顯示名稱 | ✅ Yes |
| `userId` | String | 用戶 ID | ✅ Yes |
| `pictureUrl` | String | 頭像 URL | ❌ No (如果用戶沒有設定頭像則不包含) |

### Error Responses

#### 400 Bad Request
請求有問題，可能原因：
- 無效的 group ID
- 無效的 user ID

#### 404 Not Found
無法取得個人資料，可能原因：
- 群組不存在或 LINE Official Account 未加入該群組
- 用戶不存在或未加入該群組
- **用戶已離開群組**（常見情況）

```json
{
  "message": "Not found"
}
```

## n8n 實作範例

### 基本用法

```javascript
// HTTP Request Node 設定
{
  "method": "GET",
  "url": "=https://api.line.me/v2/bot/group/{{ $json.group_id }}/member/{{ $json.user_id }}",
  "authentication": "genericCredentialType",
  "genericAuthType": "httpHeaderAuth",
  "options": {},
  "continueOnFail": true  // 重要：處理 404 錯誤
}
```

### 批次處理範例

```javascript
// 合併 API 結果的 Code Node
const items = $input.all();
const originalItems = $('準備 API 資料').all();
const results = [];

for (let i = 0; i < items.length; i++) {
  const currentData = items[i].json;
  const originalData = originalItems[i].json;

  // 如果有 error，保留原始資料結構以便重試
  if (currentData.error) {
    results.push({
      json: {
        user_id: originalData.user_id,
        group_id: originalData.group_id,
        notion_page_id: originalData.notion_page_id,
        error: currentData.error
      }
    });
  } else {
    // 如果成功，提取 displayName
    results.push({
      json: {
        id: originalData.notion_page_id,
        display_name: currentData.displayName,
        user_id: originalData.user_id
      }
    });
  }
}

return results;
```

## 重要提示

### 權限範圍
此 API 可以取得**同群組內所有成員**的個人資料，無論該成員是否：
- 已加入你的 LINE Official Account 為好友
- 封鎖了你的 LINE Official Account

### 常見錯誤處理

1. **404 錯誤**: 用戶已離開群組
   - 解決方案：使用 `continueOnFail: true` 並在後續節點處理失敗項目
   - 可以嘗試使用另一個群組 ID 或另一個 bot 重試

2. **多個 Bot 策略**:
   - 如果用戶在多個群組中，可以使用不同的 bot credentials 提高成功率
   - 範例：先用 Bot A 嘗試，失敗的項目再用 Bot B 重試

3. **批次處理**:
   - 注意 Rate Limit (2,000/sec)
   - 使用 `$input.all()` 處理多個項目時，確保資料對應正確

## 參考資料
- [LINE Messaging API Reference - Get group chat member profile](https://developers.line.biz/en/reference/messaging-api/#get-group-member-profile)
