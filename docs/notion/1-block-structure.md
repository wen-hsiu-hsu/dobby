# Notion Block Structure

此文件說明本專案中使⽤的 Notion Block 資料結構 (基於 n8n Notion Node Output)。

## 1. 核心結構 (Core Structure)

所有 Block 物件皆包含以下通用欄位：

- **object**: 固定為 `block`
- **id**: Block 的唯一識別碼 (UUID)
- **type**: Block 類型 (e.g., `paragraph`, `bulleted_list_item`, `divider`)
- **has_children**: Boolean, 是否包含子 Block
- **parent**: 父層資訊 (通常是 `page_id` 或 `block_id`)
- **last_edited_by**: 最後編輯者資訊

## 2. 簡化欄位 (Simplified Fields)

本專案中的 n8n 節點回傳資料包含以下簡化欄位，⽅便直接讀取內容 (非標準 Notion API，可能是 n8n 處理後的結果)：

- **content**: 該 Block 的純⽂字內容 (Plain Text)。
  - 若為 `paragraph`，即為段落文字。
  - 若為 `bulleted_list_item`，即為列表項目文字。

## 3. 支援的 Block 類型

### Paragraph (段落)
```json
{
    "object": "block",
    "id": "...",
    "type": "paragraph",
    "content": "#其他"
}
```

### Bulleted List Item (項目符號列表)
```json
{
    "object": "block",
    "id": "...",
    "type": "bulleted_list_item",
    "content": "列表內容範例"
}
```

### Divider (分隔線)
```json
{
    "object": "block",
    "id": "...",
    "type": "divider",
    "divider": {}
}
```

## 4. API Reference
- **Resource**: `block`
- **Operation**: `get children` (GetAll)
- **Nested Blocks**: 支援遞迴取得子 Block (fetchNestedBlocks: true)
