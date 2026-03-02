## 1. Create shared fetch helpers

- [x] 1.1 Create `src/services/notion/notion-fetch.ts` with `notionGet`, `notionPost`, `notionPatch` helpers (extracted from `users-repository.ts`)
- [x] 1.2 Update `users-repository.ts` to import helpers from `notion-fetch.ts` instead of defining them inline

## 2. Migrate repositories to REST API

- [x] 2.1 Migrate `people-repository.ts`: replace `dataSources.query` with `notionPost /databases/{id}/query`, replace `pages.retrieve` with `notionGet /pages/{id}`
- [x] 2.2 Migrate `calendar-repository.ts`: replace `dataSources.query` with `notionPost`, replace `pages.update` with `notionPatch /pages/{id}`
- [x] 2.3 Migrate `announcement-repository.ts`: replace `dataSources.query` with `notionPost`, replace `blocks.children.list` with `notionGet /blocks/{id}/children`
- [x] 2.4 Migrate `season-repository.ts`: replace both `dataSources.query` calls with `notionPost /databases/{id}/query`

## 3. Migrate scheduler

- [x] 3.1 Migrate `display-name-update.ts`: replace `notion.dataSources.query` with `notionPost` from `notion-fetch.ts`; verify correct property name for `user_id`

## 4. Update tests

- [x] 4.1 Update `registration-flow.test.ts`: replace `notion.dataSources.query` and `notion.pages.retrieve` mocks with `fetch` stubs using `vi.stubGlobal`
- [x] 4.2 Update `command-integration.test.ts`: replace `notion.dataSources.query` mock with `fetch` stub

## 5. Verify

- [x] 5.1 Run `npm test` — all tests pass
- [ ] 5.2 Manual smoke test: send `@Dobby +1` and confirm no `object_not_found` error
