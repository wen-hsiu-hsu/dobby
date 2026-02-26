# List Blocks

## Bulleted List Item
- **Type**: `bulleted_list_item`
- **Properties**:
  - `rich_text` (array)
  - `color` (string)
  - `children` (array, optional)

```json
{
  "type": "bulleted_list_item",
  "bulleted_list_item": {
    "rich_text": [{ "text": { "content": "List item" } }],
    "color": "default"
  }
}
```

## To Do
- **Type**: `to_do`
- **Properties**:
  - `rich_text` (array)
  - `checked` (boolean): Whether the checkbox is checked.
  - `color` (string)
  - `children` (array, optional)

```json
{
  "type": "to_do",
  "to_do": {
    "rich_text": [{ "text": { "content": "Finish task" } }],
    "checked": false,
    "color": "default"
  }
}
```

## Toggle
- **Type**: `toggle`
- **Properties**:
  - `rich_text` (array)
  - `color` (string)
  - `children` (array, optional)

```json
{
  "type": "toggle",
  "toggle": {
    "rich_text": [{ "text": { "content": "Click to expand" } }],
    "color": "default",
    "children": []
  }
}
```
