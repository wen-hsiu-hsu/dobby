## Context

The Notion SDK client (`@notionhq/client`) exposes a non-standard `dataSources.query` API that routes through Notion's internal data-source layer instead of the public `/databases/{id}/query` REST endpoint. This causes `object_not_found` 404 errors for database IDs that are valid on the public API. `users-repository.ts` was already migrated to use `fetch` directly; all other repositories still use the SDK.

Current SDK usage across the codebase:
- `dataSources.query` — people, calendar, announcement, season repositories; display-name-update scheduler
- `pages.update` — calendar repository (updateAbsentees, updateGuests)
- `pages.retrieve` — people repository (findByPageIds)
- `blocks.children.list` — announcement repository (getBlocks)

## Goals / Non-Goals

**Goals:**
- Migrate all SDK calls to direct REST API calls using native `fetch`
- Extract shared fetch helpers into a single `notion-fetch.ts` module (reusing the pattern from `users-repository.ts`)
- Update tests to mock `fetch` instead of SDK methods
- Remove `notion-client.ts` import from all repositories after migration

**Non-Goals:**
- Changing repository interfaces or business logic
- Adding pagination support (not needed for current data sizes)
- Modifying `users-repository.ts` (already correct)

## Decisions

### Extract shared fetch helpers into `notion-fetch.ts`

`users-repository.ts` already defines `notionPost`, `notionPatch`, and `notionHeaders`. Duplicating these in every file violates DRY and makes future changes (e.g., API key rotation, version bump) risky.

**Decision**: Create `src/services/notion/notion-fetch.ts` exporting `notionGet`, `notionPost`, `notionPatch`. All repositories import from this module. Remove the inline helpers from `users-repository.ts`.

Alternative considered: keep helpers in `users-repository.ts` and re-export — rejected because it creates an awkward cross-dependency between sibling modules.

### Map SDK operations to REST endpoints

| SDK call | REST equivalent |
|---|---|
| `dataSources.query({ data_source_id, filter })` | `POST /databases/{id}/query { filter }` |
| `pages.retrieve({ page_id })` | `GET /pages/{id}` |
| `pages.update({ page_id, properties })` | `PATCH /pages/{id} { properties }` |
| `blocks.children.list({ block_id })` | `GET /blocks/{id}/children` |

### Keep `PageObjectResponse` type annotation

The SDK type `PageObjectResponse` accurately describes the shape returned by the REST API. We keep using it as a type-only import to avoid writing a duplicate interface.

Alternative: define local plain types — rejected as unnecessary churn.

## Risks / Trade-offs

- **Tests use SDK mocks** → Tests must be updated to mock global `fetch`. Use `vi.stubGlobal('fetch', mockFn)` in Vitest.
- **`display-name-update.ts` reads raw page properties** → The scheduler accesses `page.properties['User ID']` (note: capital "U") which may differ from the property name `user_id` used in `users-repository.ts`. Verify property name during migration.
