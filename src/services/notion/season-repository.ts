import { notion } from './notion-client.js';
import { env } from '../../config/env.js';
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
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_SEASON,
    filter: { property: 'Name', title: { equals: name } },
  });
  if (response.results.length === 0) return null;
  return pageToRecord(response.results[0] as PageObjectResponse);
}

export async function findAll(): Promise<SeasonRecord[]> {
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_SEASON,
  });
  return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
}
