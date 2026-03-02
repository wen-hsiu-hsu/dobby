import { env } from '../../config/env.js';
import { notionPost } from './notion-fetch.js';
import { getTitle, getRelation } from './property-helpers.js';
import type { SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): SeasonRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, '季租時段'),
    members: getRelation(p, '報名人'),
  };
}

export async function findByName(name: string): Promise<SeasonRecord | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {
    filter: { property: '季租時段', title: { equals: name } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToRecord(response.results[0] as PageObjectResponse);
}

export async function findAll(): Promise<SeasonRecord[]> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {}) as any;
  return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
}
