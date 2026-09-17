import { env } from '../../config/env.js';
import { notionPost, notionPatch, notionGet } from './notion-fetch.js';
import {
  getDate,
  getMultiSelect,
  getSelect,
  setRelation,
  setMultiSelect,
} from './property-helpers.js';
import { getFullRelation } from './paginated-relation.js';
import type { CalendarEvent } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

async function pageToEvent(page: PageObjectResponse): Promise<CalendarEvent> {
  const p = page.properties;
  return {
    pageId: page.id,
    date: getDate(p, '時間') ?? '',
    absentees: await getFullRelation(p, '請假人', page.id),
    guests: getMultiSelect(p, '零打'),
    isPaused: getSelect(p, '類型') === '打球暫停',
  };
}

export async function findByDate(date: string): Promise<CalendarEvent | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_CALENDAR}/query`, {
    filter: { property: '時間', date: { equals: date } },
  }) as any;
  if (response.results.length === 0) return null;
  return await pageToEvent(response.results[0] as PageObjectResponse);
}

export async function findByPageIds(pageIds: string[]): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  for (const [i, id] of pageIds.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 400));
    const page = await notionGet(`/pages/${id}`);
    events.push(await pageToEvent(page as PageObjectResponse));
  }
  return events;
}

// updateAbsentees 是整包覆寫（非增量 patch），呼叫端必須確保傳入完整的 absentees 清單
// （目前唯一來源是 pageToEvent()，它已處理 25 筆截斷；不要用其他管道拼湊這個陣列）
export async function updateAbsentees(pageId: string, absenteePageIds: string[]): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { 請假人: setRelation(absenteePageIds) },
  });
}

export async function updateGuests(pageId: string, guests: string[]): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { 零打: setMultiSelect(guests) },
  });
}
