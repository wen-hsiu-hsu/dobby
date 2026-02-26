# Notion Block Base Object

All block objects contain the following keys:

- **object** (string): Always `"block"`.
- **id** (string): Identifier for the block.
- **parent** (object): Information about the block's parent.
  - `type` (string): e.g., `"page_id"`, `"block_id"`.
  - `page_id` or `block_id` (string): The ID of the parent.
- **type** (string): Type of block (e.g., `"paragraph"`, `"heading_1"`).
- **created_time** (string): ISO 8601 date time.
- **created_by** (object): User who created the block.
- **last_edited_time** (string): ISO 8601 date time.
- **last_edited_by** (object): User who updated the block.
- **archived** (boolean): Whether the block is archived.
- **in_trash** (boolean): Whether the block is in the trash.
- **has_children** (boolean): Whether the block has children blocks.
- **{type}** (object): An object with the same name as the `type`, containing block-specific data.

## Example JSON
```json
{
  "object": "block",
  "id": "c02fc1d3-db8b-45c5-a222-27595b15aea7",
  "parent": { "type": "page_id", "page_id": "..." },
  "created_time": "2022-03-01T19:05:00.000Z",
  "last_edited_time": "2022-07-06T19:41:00.000Z",
  "has_children": false,
  "archived": false,
  "in_trash": false,
  "type": "heading_2",
  "heading_2": {
    "rich_text": [ ... ],
    "color": "default",
    "is_toggleable": false
  }
}
```
