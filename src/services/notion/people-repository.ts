import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle, getFormulaBoolean } from './property-helpers.js';
import { queryAlignedToIds } from './reverse-relation-query.js';
import { withPurpose } from '../../utils/request-context.js';
import type { PersonRecord, SeasonRecord } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToRecord(page: PageObjectResponse): PersonRecord {
  const p = page.properties;
  return {
    pageId: page.id,
    name: getTitle(p, 'Name'),
    hasPaid: getFormulaBoolean(p, '結清'),
  };
}

async function getPerson(pageId: string): Promise<PersonRecord> {
  return pageToRecord(await notionGet(`/pages/${pageId}`) as PageObjectResponse);
}

// 逐筆 GET，每筆之間 400ms。整季名單請用 findMembersOfSeasons（一次 query）。
export async function findByPageIds(pageIds: string[]): Promise<PersonRecord[]> {
  return withPurpose('查詢成員姓名與繳費狀態', async () => {
    const records: PersonRecord[] = [];
    for (const [i, id] of pageIds.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      records.push(await getPerson(id));
    }
    return records;
  });
}

/**
 * 查一或多季的季租成員（季租紀錄 `報名人`），用反向欄位 `報名季度` 一次 query 取回。
 * 輸出照各季 `members` 串接後去重的順序（多季時依傳入順序，前面的季優先）。
 */
export async function findMembersOfSeasons(
  seasons: Array<Pick<SeasonRecord, 'pageId' | 'members'>>,
): Promise<PersonRecord[]> {
  return withPurpose('查詢季租成員姓名與繳費狀態', async () => {
    const filters = seasons.map((s) => ({ property: '報名季度', relation: { contains: s.pageId } }));
    return queryAlignedToIds({
      databaseId: env.NOTION_DB_PEOPLE,
      filter: filters.length === 1 ? filters[0] : { or: filters },
      ids: [...new Set(seasons.flatMap((s) => s.members))],
      toRecord: pageToRecord,
      fetchOne: getPerson,
    });
  });
}

export async function findByName(name: string): Promise<PersonRecord | null> {
  return withPurpose('依姓名查詢成員資料', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_PEOPLE}/query`, {
      filter: { property: 'Name', title: { equals: name } },
    }) as any;
    if (response.results.length === 0) return null;
    return pageToRecord(response.results[0] as PageObjectResponse);
  });
}

export async function create(name: string): Promise<PersonRecord> {
  return withPurpose('建立新的成員資料', async () => {
    const page = await notionPost('/pages', {
      parent: { database_id: env.NOTION_DB_PEOPLE },
      properties: {
        Name: { title: [{ text: { content: name } }] },
      },
    });
    return pageToRecord(page as PageObjectResponse);
  });
}

export async function findAllUnpaid(): Promise<PersonRecord[]> {
  return withPurpose('查詢所有未結清費用的成員', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_PEOPLE}/query`, {
      filter: { property: '結清', formula: { checkbox: { equals: false } } },
    }) as any;
    return response.results.map((r: unknown) => pageToRecord(r as PageObjectResponse));
  });
}
