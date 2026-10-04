import { notionPost } from './notion-fetch.js';
import { logger } from '../../utils/logger.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

// 跟 users-repository.ts 的 findAll、display-name-update.ts 一樣，連續呼叫之間間隔 400ms（Notion 約 3 req/s）
const THROTTLE_MS = 400;

/**
 * 用反向 relation 篩選一次查回整份名單，取代對 forward relation 的每個 pageId 逐筆 GET。
 * Notion query 沒辦法依 page ID 篩選，所以只能從另一端的 relation 欄位反查
 * （例如季租紀錄 `報名人` 的反向欄位是人員清單的 `報名季度`；配對見 docs/notion/schemas/）。
 *
 * forward relation（`ids`）才是名單的依據，query 結果只是批次取回的手段：
 * - 輸出照 `ids` 的順序。query 回傳的順序跟 relation 順序不同。
 * - `ids` 裡有、query 沒回傳的頁面逐筆 GET 補上（`fetchOne`），並記 warn。正常不會發生，
 *   保底是怕 Notion 的 query 結果比 relation 慢一步更新（管理員剛改完名單，或 bot 剛寫入
 *   forward relation 就立刻查詢時，例如請假／銷假後查請假人姓名）。
 * - query 多回傳、`ids` 裡沒有的頁面直接丟掉。
 *
 * `toRecord` 對每頁依序呼叫、中間不節流。如果它自己會打 API（例如 `pageToEvent` 遇到 25 筆截斷時），
 * 節流由呼叫端負責。
 */
export async function queryAlignedToIds<T extends { pageId: string }>(params: {
  databaseId: string;
  filter: unknown;
  ids: string[];
  toRecord: (page: PageObjectResponse) => T | Promise<T>;
  fetchOne: (pageId: string) => Promise<T>;
}): Promise<T[]> {
  const { databaseId, filter, ids, toRecord, fetchOne } = params;
  if (ids.length === 0) return [];

  const pages = await queryAllPages(databaseId, filter);
  const wanted = new Set(ids);
  const byId = new Map<string, T>();
  for (const page of pages) {
    if (!wanted.has(page.id)) continue;
    byId.set(page.id, await toRecord(page));
  }

  const missing = [...new Set(ids)].filter((id) => !byId.has(id));
  if (missing.length > 0) {
    logger.warn(
      { databaseId, missing, queried: pages.length, expected: ids.length },
      'Reverse-relation query missed pages listed in the forward relation; fetching them one by one',
    );
    for (const [i, id] of missing.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, THROTTLE_MS));
      byId.set(id, await fetchOne(id));
    }
  }

  return ids.map((id) => byId.get(id)!);
}

async function queryAllPages(databaseId: string, filter: unknown): Promise<PageObjectResponse[]> {
  const pages: PageObjectResponse[] = [];
  let cursor: string | undefined;
  do {
    if (cursor) await new Promise((r) => setTimeout(r, THROTTLE_MS));
    const response = await notionPost(`/databases/${databaseId}/query`, {
      filter,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    }) as { results: PageObjectResponse[]; has_more: boolean; next_cursor: string | null };
    pages.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return pages;
}
