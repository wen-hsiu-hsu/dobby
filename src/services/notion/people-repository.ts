import { env } from '../../config/env.js';
import { notionGet, notionPost } from './notion-fetch.js';
import { getTitle, getFormulaBoolean } from './property-helpers.js';
import { queryAlignedToIds } from './reverse-relation-query.js';
import { withPurpose } from '../../utils/request-context.js';
import { logger } from '../../utils/logger.js';
import type { CalendarEvent, PersonRecord, SeasonRecord } from '../../types/notion-models.js';
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

async function getPeopleOneByOne(pageIds: string[]): Promise<PersonRecord[]> {
  const records: PersonRecord[] = [];
  for (const [i, id] of pageIds.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    records.push(await getPerson(id));
  }
  return records;
}

// 逐筆 GET，每筆之間 400ms。整季名單請用 findMembersOfSeasons，活動請假人請用 findAbsenteesOfEvent（一次 query）。
export async function findByPageIds(pageIds: string[]): Promise<PersonRecord[]> {
  return withPurpose('查詢成員姓名與繳費狀態', () => getPeopleOneByOne(pageIds));
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

/**
 * 查一場活動的請假人（行事曆 `請假人`），輸出照 `absentees` 的順序。
 * 2 人以上用反向欄位 `📅 行事曆` 一次 query；只有 1 人時直接 GET，換成 query 一樣是一次呼叫，沒有好處。
 * 請假／銷假成功時是剛 PATCH 完 `請假人` 就查：2026-10-04 實測 8 次寫入後立刻 query 都已反映，
 * 萬一沒反映，漏掉的由 queryAlignedToIds 逐筆補查、多的丟掉，輸出仍以傳入的 `absentees` 為準。
 *
 * query 本身失敗時退回逐筆 GET。報名／請假是在寫完之後、放鎖之後才查姓名，這裡丟錯的話
 * `withFreshCalendarEvent` 會退回只回 headline 一句話，使用者看不到完整狀態卡。`📅 行事曆` 被改名、
 * 或 relation 被改成單向時，query 會 100% 失敗，所以不能讓 query 一失敗就降級。
 * catch 也涵蓋 queryAlignedToIds 內部補查 GET 或轉換資料的錯誤，這時會整份重新逐筆 GET；
 * 這要「query 沒反映寫入」又剛好「補查失敗」才會發生，很少見，接受這個成本，不為它細分錯誤來源。
 */
export async function findAbsenteesOfEvent(
  event: Pick<CalendarEvent, 'pageId' | 'absentees'>,
): Promise<PersonRecord[]> {
  return withPurpose('查詢活動請假人姓名', async () => {
    if (event.absentees.length <= 1) return getPeopleOneByOne(event.absentees);
    try {
      return await queryAlignedToIds({
        databaseId: env.NOTION_DB_PEOPLE,
        filter: { property: '📅 行事曆', relation: { contains: event.pageId } },
        ids: event.absentees,
        toRecord: pageToRecord,
        fetchOne: getPerson,
      });
    } catch (err) {
      logger.warn({ err, eventPageId: event.pageId }, 'Absentee reverse-relation lookup failed; falling back to per-page GETs');
      return getPeopleOneByOne(event.absentees);
    }
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
