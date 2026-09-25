import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle } from './property-helpers.js';
import { withPurpose } from '../../utils/request-context.js';
import type { NestedBlock } from './blocks-to-text.js';
import type { AnnouncementRecord } from '../../types/notion-models.js';
import type { PageObjectResponse, BlockObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): AnnouncementRecord {
  return {
    pageId: page.id,
    name: getTitle(page.properties, 'Name'),
  };
}

export async function findByName(name: string): Promise<AnnouncementRecord | null> {
  return withPurpose('查詢指定名稱的公告', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_ANNOUNCEMENT}/query`, {
      filter: { property: 'Name', title: { equals: name } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToRecord(response.results[0] as PageObjectResponse);
  });
}

/**
 * Recursively resolves `has_children` blocks (toggles, nested lists, …) into a
 * shared counter tracking how many `/blocks/*\/children` calls have been made
 * across the whole recursion, so every call after the first is throttled —
 * matches the 400ms delay pattern in schedulers/display-name-update.ts.
 */
async function fetchBlocksRecursive(
  blockId: string,
  callCount: { current: number },
): Promise<NestedBlock[]> {
  if (callCount.current > 0) await new Promise((r) => setTimeout(r, 400)); // Notion rate limit
  callCount.current++;

  const response = await notionGet(`/blocks/${blockId}/children`) as any;
  const blocks = response.results as BlockObjectResponse[];

  const result: NestedBlock[] = [];
  for (const block of blocks) {
    if (block.has_children) {
      const children = await fetchBlocksRecursive(block.id, callCount);
      result.push({ ...block, children });
    } else {
      result.push(block);
    }
  }
  return result;
}

export async function getBlocks(pageId: string): Promise<NestedBlock[]> {
  return withPurpose('查詢公告的內容區塊', async () => {
    return await fetchBlocksRecursive(pageId, { current: 0 });
  });
}
