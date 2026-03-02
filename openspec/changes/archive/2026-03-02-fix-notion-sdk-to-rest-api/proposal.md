## Why

The Notion SDK's `dataSources.query` and `pages.update/retrieve` methods fail with `object_not_found` errors for certain database IDs, as seen when users send `@Dobby +1`. The `users-repository.ts` was already fixed to use the standard REST API via `fetch`; the same fix must be applied to all remaining repositories and schedulers.

## What Changes

- Replace all `notion.dataSources.query(...)` calls with direct REST API calls using `fetch` to `/databases/{id}/query`
- Replace all `notion.pages.update(...)` calls with `fetch` PATCH to `/pages/{id}`
- Replace all `notion.pages.retrieve(...)` calls with `fetch` GET to `/pages/{id}`
- Update test mocks from SDK method mocks to `fetch` mocks

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `notion-repositories`: Extend the "use REST API fetch, not SDK" requirement from USERS repository to ALL repositories (people, calendar, announcement, season) and the display-name-updater scheduler

## Impact

- `src/services/notion/people-repository.ts`
- `src/services/notion/calendar-repository.ts`
- `src/services/notion/announcement-repository.ts`
- `src/services/notion/season-repository.ts`
- `src/schedulers/display-name-update.ts`
- `src/__tests__/registration-flow.test.ts`
- `src/__tests__/command-integration.test.ts`
