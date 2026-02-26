# Media Blocks

## Image
- **Type**: `image`
- **Properties**:
  - `type` (string): `"external"` or `"file"`.
  - `external` (object): `{ "url": "..." }`
  - `file` (object): `{ "url": "...", "expiry_time": "..." }`

```json
{
  "type": "image",
  "image": {
    "type": "external",
    "external": {
      "url": "https://website.domain/images/image.png"
    }
  }
}
```

## Video
- **Type**: `video`
- **Properties**: Similar to Image (external or file).

```json
{
  "type": "video",
  "video": {
    "type": "external",
    "external": {
      "url": "https://companywebsite.com/video.mp4"
    }
  }
}
```

## File / PDF
- **Type**: `file` or `pdf`
- **Properties**:
  - `caption` (array): Rich text caption.
  - `type`, `external`/`file` object.
  - `name` (string, optional): Display name for files.

```json
{
  "type": "file",
  "file": {
    "caption": [],
    "type": "external",
    "external": { "url": "..." },
    "name": "doc.txt"
  }
}
```

## Embed
- **Type**: `embed`
- **Properties**:
  - `url` (string)

```json
{
  "type": "embed",
  "embed": {
    "url": "https://companywebsite.com"
  }
}
```

## Bookmark
- **Type**: `bookmark`
- **Properties**:
  - `url` (string)
  - `caption` (array)

```json
{
  "type": "bookmark",
  "bookmark": {
    "url": "https://website.com",
    "caption": []
  }
}
```
