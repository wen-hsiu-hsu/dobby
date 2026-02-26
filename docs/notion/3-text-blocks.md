# Text Blocks

## Paragraph
- **Type**: `paragraph`
- **Properties**:
  - `rich_text` (array): Array of rich text objects.
  - `color` (string): Text color (e.g., "default", "blue", "blue_background").
  - `children` (array, optional): Nested blocks.

```json
{
  "type": "paragraph",
  "paragraph": {
    "rich_text": [{
      "type": "text",
      "text": { "content": "Hello world" }
    }],
    "color": "default"
  }
}
```

## Headings
- **Type**: `heading_1`, `heading_2`, `heading_3`
- **Properties**:
  - `rich_text` (array)
  - `color` (string)
  - `is_toggleable` (boolean)

```json
{
  "type": "heading_1",
  "heading_1": {
    "rich_text": [{ "text": { "content": "Header" } }],
    "color": "default",
    "is_toggleable": false
  }
}
```

## Callout
- **Type**: `callout`
- **Properties**:
  - `rich_text` (array)
  - `icon` (object): Emoji or file object.
  - `color` (string)
  - `children` (array, optional)

```json
{
  "type": "callout",
  "callout": {
    "rich_text": [{ "text": { "content": "Important" } }],
    "icon": { "emoji": "⭐" },
    "color": "default"
  }
}
```

## Quote
- **Type**: `quote`
- **Properties**:
  - `rich_text` (array)
  - `color` (string)
  - `children` (array, optional)

```json
{
  "type": "quote",
  "quote": {
    "rich_text": [{ "text": { "content": "To be or not to be" } }],
    "color": "default"
  }
}
```
