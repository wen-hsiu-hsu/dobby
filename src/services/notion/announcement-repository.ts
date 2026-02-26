import { notion } from './notion-client.js';
import { env } from '../../config/env.js';
import { getTitle } from './property-helpers.js';
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
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_ANNOUNCEMENT,
    filter: { property: 'Name', title: { equals: name } },
  });
  if (response.results.length === 0) return null;
  return pageToRecord(response.results[0] as PageObjectResponse);
}

export async function getBlocks(pageId: string): Promise<BlockObjectResponse[]> {
  const response = await notion.blocks.children.list({ block_id: pageId });
  return response.results as BlockObjectResponse[];
}
