import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle, getRichText, getCheckbox } from './property-helpers.js';
import type { PersonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): PersonRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, 'Name'),
    hasPaid: getCheckbox(p, 'Has Paid'),
    lineUserId: getRichText(p, 'Line User ID'),
  };
}

export async function findByPageIds(pageIds: string[]): Promise<PersonRecord[]> {
  const results = await Promise.all(
    pageIds.map((id) => notionGet(`/pages/${id}`)),
  );
  return results.map((r) => pageToRecord(r as PageObjectResponse));
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
    filter: { property: 'Has Paid', checkbox: { equals: false } },
  }) as any;
  return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
}
