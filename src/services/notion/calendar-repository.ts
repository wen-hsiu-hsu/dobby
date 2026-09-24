import { env } from '../../config/env.js';
import { notionPost, notionPatch, notionGet } from './notion-fetch.js';
import {
  getDate,
  getMultiSelect,
  getNumber,
  getSelect,
  setRelation,
  setMultiSelect,
} from './property-helpers.js';
import { getFullRelation } from './paginated-relation.js';
import { withPurpose } from '../../utils/request-context.js';
import { logger } from '../../utils/logger.js';
import type { CalendarEvent } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

// 場地數只接受正整數；0／負數／小數視為未填（null），讓容量計算 fallback 到當季預設。
// 「本週不打」應該用 類型=打球暫停 表示，不是場地數填 0。
function readCourts(page: PageObjectResponse): number | null {
  const p = page.properties;
  const courts = getNumber(p, '場地數');
  if (courts === null) return null;
  if (!Number.isInteger(courts) || courts <= 0) {
    logger.warn(
      { calendarPageId: page.id, date: getDate(p, '時間'), field: '場地數', value: courts },
      '行事曆場地數不是正整數，改用當季預設場地數',
    );
    return null;
  }
  return courts;
}

async function pageToEvent(page: PageObjectResponse): Promise<CalendarEvent> {
  const p = page.properties;
  return {
    pageId: page.id,
    date: getDate(p, '時間') ?? '',
    absentees: await getFullRelation(p, '請假人', page.id),
    guests: getMultiSelect(p, '零打'),
    isPaused: getSelect(p, '類型') === '打球暫停',
    courts: readCourts(page),
  };
}

export async function findByDate(date: string): Promise<CalendarEvent | null> {
  return withPurpose('查詢指定日期的活動資料', async () => {
    const response = await notionPost(`/databases/${env.NOTION_DB_CALENDAR}/query`, {
      filter: { property: '時間', date: { equals: date } },
    }) as any;
    if (response.results.length === 0) return null;
    return await pageToEvent(response.results[0] as PageObjectResponse);
  });
}

export async function findByPageIds(pageIds: string[]): Promise<CalendarEvent[]> {
  return withPurpose('依 page ID 查詢活動資料', async () => {
    const events: CalendarEvent[] = [];
    for (const [i, id] of pageIds.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      const page = await notionGet(`/pages/${id}`);
      events.push(await pageToEvent(page as PageObjectResponse));
    }
    return events;
  });
}

// updateAbsentees 是整包覆寫（非增量 patch），呼叫端必須確保傳入完整的 absentees 清單
// （目前唯一來源是 pageToEvent()，它已處理 25 筆截斷；不要用其他管道拼湊這個陣列）
export async function updateAbsentees(pageId: string, absenteePageIds: string[]): Promise<void> {
  return withPurpose('寫入活動的請假名單', async () => {
    await notionPatch(`/pages/${pageId}`, {
      properties: { 請假人: setRelation(absenteePageIds) },
    });
  });
}

export async function updateGuests(pageId: string, guests: string[]): Promise<void> {
  return withPurpose('寫入活動的零打(guest)名單', async () => {
    await notionPatch(`/pages/${pageId}`, {
      properties: { 零打: setMultiSelect(guests) },
    });
  });
}
