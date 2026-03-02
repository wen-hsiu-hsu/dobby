## 1. Fix HTTP Layer

- [x] 1.1 Replace `notion.dataSources.query` with native `fetch` to `/databases/{id}/query`
- [x] 1.2 Replace `notion.pages.create` with native `fetch` to `/pages` using `database_id` parent
- [x] 1.3 Replace `notion.pages.update` with native `fetch` PATCH to `/pages/{id}`
- [x] 1.4 Add error handling that throws with Notion error body on non-2xx responses

## 2. Fix Property Names

- [x] 2.1 Update `pageToUser` mapping: `User ID` → `user_id`, `Message Count` → `message_counts`, `Groups` → `groups`, `Multi Chats` → `multi-chat`
- [x] 2.2 Update filter in `findByUserId`: `User ID` → `user_id`
- [x] 2.3 Update `create` property keys: `User ID` → `user_id`, `Message Count` → `message_counts`
- [x] 2.4 Update `update` property keys: `Groups` → `groups`, `Multi Chats` → `multi-chat`
- [x] 2.5 Update `incrementMessageCount` property key: `Message Count` → `message_counts`

## 3. Verify

- [x] 3.1 Test: send a LINE message and confirm no Notion API errors in logs
- [x] 3.2 Test: confirm auto-reply works for non-admin users
