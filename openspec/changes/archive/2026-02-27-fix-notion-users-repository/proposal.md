## Why

The `users-repository` service was using Notion SDK v5.9.0's internal `dataSources.query` API (which calls `/data_sources/{id}/query`) instead of the standard `/databases/{id}/query` endpoint. This caused all user lookups to fail with a 404 error, breaking auto-reply and command routing for all LINE messages.

## What Changes

- **BREAKING**: Replace all `notion.dataSources.query()` calls with direct `fetch` calls to the standard Notion REST API (`/databases/{id}/query`)
- Replace `notion.pages.create()` with direct `fetch` to `/pages` using `database_id` parent
- Correct Notion USERS database property names to match actual schema:
  - `User ID` → `user_id`
  - `Message Count` → `message_counts`
  - `Groups` → `groups`
  - `Multi Chats` → `multi-chat`
- Remove dependency on Notion SDK for `users-repository` (use native `fetch` instead)

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `notion-repositories`: The USERS repository query and write operations now use the standard Notion REST API instead of the SDK's internal `dataSources` API. Property names are corrected to match the actual database schema.

## Impact

- `src/services/notion/users-repository.ts`: Full rewrite of HTTP layer
- Notion SDK (`@notionhq/client`) is no longer used in `users-repository.ts`
- All callers of `findByUserId`, `findAdmin`, `findByCustomName`, `create`, `update`, `incrementMessageCount` are unaffected (same interface)
