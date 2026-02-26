# 3. Message Objects（訊息物件）

### 3.1 Text Message（文字訊息）

用於傳送和接收文字訊息。

#### 發送文字訊息

```json
{
  "type": "text",
  "text": "Hello, world"
}
```

| 欄位名稱 | 型別 | 必填 | 限制 | 說明 |
|---------|------|------|------|------|
| `type` | String | ✅ | - | 固定值 `text` |
| `text` | String | ✅ | Max: 2,000 字 | 訊息文字內容 |

#### 接收文字訊息（Webhook）

```json
{
  "type": "text",
  "id": "100001",
  "text": "Hello, world"
}
```

| 欄位名稱 | 型別 | 說明 |
|---------|------|------|
| `type` | String | 固定值 `text` |
| `id` | String | 訊息 ID |
| `text` | String | 訊息內容 |

---

### 3.2 Text Message (v2)（文字訊息 v2 版本）

支援更多功能的文字訊息版本，包括**表情符號、提及（Mention）**等功能。

> **⚠️ 重要提醒**
> - **Text Message v1** (`type: "text"`) **不支援 Mention 功能**
> - **必須使用 Text Message v2** (`type: "textV2"`) 才能使用 Mention
> - v2 使用 `substitution` 物件搭配 placeholder 來實現動態替換

#### 發送文字訊息 (v2)

```json
{
  "type": "textV2",
  "text": "Welcome, {user1}! {laugh}\n{everyone} There is a newcomer!",
  "substitution": {
    "user1": {
      "type": "mention",
      "mentionee": {
        "type": "user",
        "userId": "U49585cd0d5..."
      }
    },
    "laugh": {
      "type": "emoji",
      "productId": "5a8555cfe6256cc92ea23c2a",
      "emojiId": "002"
    },
    "everyone": {
      "type": "mention",
      "mentionee": {
        "type": "all"
      }
    }
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `type` | String | ✅ | 固定值 `textV2` |
| `text` | String | ✅ | 訊息文字內容，可包含 placeholder `{key}`（Max: 5,000 字） |
| `substitution` | Object | ❌ | 定義 placeholder 的替換內容（Max: 20 個 placeholder） |

#### Substitution 物件格式

**Mention 使用者**:
```json
{
  "key_name": {
    "type": "mention",
    "mentionee": {
      "type": "user",
      "userId": "U49585cd0d5..."
    }
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `type` | String | ✅ | 固定值 `mention` |
| `mentionee.type` | String | ✅ | `user`（提及使用者）或 `all`（提及全體） |
| `mentionee.userId` | String | ✅* | 使用者 ID（當 `type` 為 `user` 時必填） |

**Mention 全體成員**:
```json
{
  "key_name": {
    "type": "mention",
    "mentionee": {
      "type": "all"
    }
  }
}
```

**LINE 表情符號**:
```json
{
  "key_name": {
    "type": "emoji",
    "productId": "5a8555cfe6256cc92ea23c2a",
    "emojiId": "002"
  }
}
```

| 欄位名稱 | 型別 | 必填 | 說明 |
|---------|------|------|------|
| `type` | String | ✅ | 固定值 `emoji` |
| `productId` | String | ✅ | LINE 表情符號產品 ID |
| `emojiId` | String | ✅ | 表情符號 ID |

#### 文字訊息 v2 範例

**提及使用者**:
```json
{
  "type": "textV2",
  "text": "嗨 {newFriend}，歡迎加入！主揪是 {manager}",
  "substitution": {
    "newFriend": {
      "type": "mention",
      "mentionee": {
        "type": "user",
        "userId": "U1a65fcd10b7bc0f207cac34ae0f70546"
      }
    },
    "manager": {
      "type": "mention",
      "mentionee": {
        "type": "user",
        "userId": "U2a0a2c5054c4fa12b78a1d059411e39c"
      }
    }
  }
}
```

**混合使用 Mention 和 Emoji**:
```json
{
  "type": "textV2",
  "text": "Hello {user}! {wave}",
  "substitution": {
    "user": {
      "type": "mention",
      "mentionee": {
        "type": "user",
        "userId": "U4af4980629..."
      }
    },
    "wave": {
      "type": "emoji",
      "productId": "5ac1bfd5040ab15980c9b435",
      "emojiId": "001"
    }
  }
}
```

---

### 3.3 Image Message（圖片訊息）

用於傳送圖片訊息。

#### 發送圖片訊息

```json
{
  "type": "image",
  "originalContentUrl": "https://example.com/original.jpg",
  "previewImageUrl": "https://example.com/preview.jpg"
}
```

| 欄位名稱 | 型別 | 必填 | 限制 | 說明 |
|---------|------|------|------|------|
| `type` | String | ✅ | - | 固定值 `image` |
| `originalContentUrl` | String | ✅ | Max: 1,000 字, HTTPS | 原始圖片的 URL，支援 JPG/PNG |
| `previewImageUrl` | String | ✅ | Max: 1,000 字, HTTPS | 預覽圖片的 URL，支援 JPG/PNG |

#### 圖片規格限制

- **原始圖片**: Max 10 MB, JPG/PNG, HTTPS
- **預覽圖片**: Max 10 MB, JPG/PNG, HTTPS
- 建議解析度: 原始圖片 1040x1040px, 預覽圖片 240x240px

#### 接收圖片訊息（Webhook）

```json
{
  "type": "image",
  "id": "100001",
  "contentProvider": {
    "type": "line"
  }
}
```

| 欄位名稱 | 型別 | 說明 |
|---------|------|------|
| `type` | String | 固定值 `image` |
| `id` | String | 訊息 ID |
| `contentProvider.type` | String | 內容提供者，通常為 `line` |

#### 圖片訊息使用範例

```json
{
  "type": "image",
  "originalContentUrl": "https://example.com/images/original.jpg",
  "previewImageUrl": "https://example.com/images/preview.jpg"
}
```
