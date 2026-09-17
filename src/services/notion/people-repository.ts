import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle, getRichText, getFormulaBoolean } from './property-helpers.js';
import type { PersonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): PersonRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, 'Name'),
    hasPaid: getFormulaBoolean(p, '結清'),
    lineUserId: getRichText(p, 'Line User ID'),
  };
}

export async function findByPageIds(pageIds: string[]): Promise<PersonRecord[]> {
  const records: PersonRecord[] = [];
  for (const [i, id] of pageIds.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    const page = await notionGet(`/pages/${id}`);
    records.push(pageToRecord(page as PageObjectResponse));
  }
  return records;
}

export async function findByName(name: string): Promise<PersonRecord | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_PEOPLE}/query`, {
    filter: { property: 'Name', title: { equals: name } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToRecord(response.results[0] as PageObjectResponse);
}

export async function findAllUnpaid(): Promise<PersonRecord[]> {
  const response = await notionPost(`/databases/${env.NOTION_DB_PEOPLE}/query`, {
    filter: { property: '結清', formula: { checkbox: { equals: false } } },
  }) as any;
  return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
}
