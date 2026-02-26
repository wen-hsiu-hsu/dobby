# 4. Quick Reply（快速回覆）

### 概述

Quick Reply 允許使用者快速回覆預設選項，而無需手動輸入。最多可包含 **13 個快速回覆按鈕**。

### 在訊息中添加 Quick Reply

Quick Reply 可以附加到**任何訊息類型**（文字、圖片、Template Message 等）。

```json
{
  "type": "text",
  "text": "What's your favorite color?",
  "quickReply": {
    "items": [
      {
        "type": "action",
        "action": {
          "type": "message",
          "label": "Red",
          "text": "Red"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "message",
          "label": "Blue",
          "text": "Blue"
        }
      }
    ]
  }
}
```

### Quick Reply 結構

```json
{
  "quickReply": {
    "items": [
      {
        "type": "action",
        "action": {
          "type": "message",
          "label": "Button Label",
          "text": "Reply text"
        }
      }
    ]
  }
}
```

| 欄位名稱 | 型別 | 必填 | 限制 | 說明 |
|---------|------|------|------|------|
| `quickReply` | Object | ❌ | - | Quick Reply 物件 |
| `quickReply.items` | Array | ✅ | Max: 13 項 | 快速回覆項目陣列 |
| `items[].type` | String | ✅ | - | 固定值 `action` |
| `items[].action` | Object | ✅ | - | 操作物件 |

### Quick Reply 操作類型

#### 1. Message Action（訊息操作）

```json
{
  "type": "action",
  "action": {
    "type": "message",
    "label": "Yes",
    "text": "Yes, I agree"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 限制 | 說明 |
|---------|------|------|------|------|
| `action.type` | String | ✅ | - | 固定值 `message` |
| `action.label` | String | ✅ | Max: 20 字 | 按鈕顯示文字 |
| `action.text` | String | ✅ | Max: 300 字 | 使用者點擊時傳送的訊息文字 |

#### 2. Postback Action（回傳操作）

```json
{
  "type": "action",
  "action": {
    "type": "postback",
    "label": "Buy",
    "data": "action=buy&itemid=111",
    "text": "Buy item"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 限制 | 說明 |
|---------|------|------|------|------|
| `action.type` | String | ✅ | - | 固定值 `postback` |
| `action.label` | String | ✅ | Max: 20 字 | 按鈕顯示文字 |
| `action.data` | String | ✅ | Max: 2,500 字 | 回傳資料，會在 postback 事件中收到 |
| `action.text` | String | ❌ | Max: 300 字 | 在聊天畫面中顯示為用戶訊息的文字 |

#### 3. Camera Action（相機操作）

```json
{
  "type": "action",
  "action": {
    "type": "camera",
    "label": "Take Photo"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `action.type` | String | ✅ | 固定值 `camera` |
| `action.label` | String | ✅ | 按鈕顯示文字（Max: 20 字） |

#### 4. Camera Roll Action（相簿操作）

```json
{
  "type": "action",
  "action": {
    "type": "cameraRoll",
    "label": "Choose Photo"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `action.type` | String | ✅ | 固定值 `cameraRoll` |
| `action.label` | String | ✅ | 按鈕顯示文字（Max: 20 字） |

#### 5. Location Action（位置操作）

```json
{
  "type": "action",
  "action": {
    "type": "location",
    "label": "Send Location"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `action.type` | String | ✅ | 固定值 `location` |
| `action.label` | String | ✅ | 按鈕顯示文字（Max: 20 字） |

### Complete Quick Reply 範例

```json
{
  "type": "text",
  "text": "Choose an action:",
  "quickReply": {
    "items": [
      {
        "type": "action",
        "action": {
          "type": "message",
          "label": "Reply",
          "text": "Thank you"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "postback",
          "label": "Confirm",
          "data": "action=confirm&id=123",
          "text": "Item confirmed"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "camera",
          "label": "Take Photo"
        }
      },
      {
        "type": "action",
        "action": {
          "type": "location",
          "label": "Share Location"
        }
      }
    ]
  }
}
```
