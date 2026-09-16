import { env } from '../../config/env.js';
import { notionPost, notionPatch, notionGet } from './notion-fetch.js';
import {
  getDate,
  getRelation,
  getMultiSelect,
  getSelect,
  setRelation,
  setMultiSelect,
} from './property-helpers.js';
import type { CalendarEvent } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToEvent(page: PageObjectResponse): CalendarEvent {
  const p = page.properties;
  return {
    pageId: page.id,
    date: getDate(p, '時間') ?? '',
    absentees: getRelation(p, '請假人'),
    guests: getMultiSelect(p, '零打'),
    isPaused: getSelect(p, '類型') === '打球暫停',
  };
}

export async function findByDate(date: string): Promise<CalendarEvent | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_CALENDAR}/query`, {
    filter: { property: '時間', date: { equals: date } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToEvent(response.results[0] as PageObjectResponse);
}

export async function findByPageIds(pageIds: string[]): Promise<CalendarEvent[]> {
  const results = await Promise.all(
    pageIds.map((id) => notionGet(`/pages/${id}`)),
  );
  return results.map((r) => pageToEvent(r as PageObjectResponse));
}

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
