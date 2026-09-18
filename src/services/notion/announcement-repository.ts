import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle } from './property-helpers.js';
import { withPurpose } from '../../utils/request-context.js';
import type { AnnouncementRecord } from '../../types/notion-models.js';
import type {
  PageObjectResponse,
  BlockObjectResponse,
} from '@notionhq/client/build/src/api-endpoints.js';

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

export async function getBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  return withPurpose('查詢公告的內容區塊', async () => {
    const response = await notionGet(`/blocks/${pageId}/children`) as any;
    return response.results as BlockObjectResponse[];
  });
}
