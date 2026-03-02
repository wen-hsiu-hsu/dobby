import { env } from '../../config/env.js';
import { notionPost } from './notion-fetch.js';
import { getTitle, getRelation, getDate } from './property-helpers.js';
import type { SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): SeasonRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, 'Name'),
    members: getRelation(p, 'Members'),
    startDate: getDate(p, 'Start Date'),
    endDate: getDate(p, 'End Date'),
  };
}

export async function findByName(name: string): Promise<SeasonRecord | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {
    filter: { property: 'Name', title: { equals: name } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToRecord(response.results[0] as PageObjectResponse);
}

export async function findAll(): Promise<SeasonRecord[]> {
  const response = await notionPost(`/databases/${env.NOTION_DB_SEASON}/query`, {}) as any;
  return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
}
