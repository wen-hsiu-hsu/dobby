import { env } from '../../config/env.js';
import { notionPost, notionPatch } from './notion-fetch.js';
import {
  getDate,
  getRelation,
  getMultiSelect,
  getNumber,
  getCheckbox,
  setRelation,
  setMultiSelect,
} from './property-helpers.js';
import type { CalendarEvent } from '../../types/notion-models.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

function pageToEvent(page: PageObjectResponse): CalendarEvent {
  const p = page.properties;
  return {
    pageId: page.id,
    date: getDate(p, 'Date') ?? '',
    absentees: getRelation(p, 'Absentees'),
    guests: getMultiSelect(p, 'Guests'),
    capacity: getNumber(p, 'Capacity'),
    isPaused: getCheckbox(p, 'Is Paused'),
  };
}

export async function findByDate(date: string): Promise<CalendarEvent | null> {
  const response = await notionPost(`/databases/${env.NOTION_DB_CALENDAR}/query`, {
    filter: { property: 'Date', date: { equals: date } },
  }) as any;
  if (response.results.length === 0) return null;
  return pageToEvent(response.results[0] as PageObjectResponse);
}

export async function updateAbsentees(pageId: string, absenteePageIds: string[]): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { Absentees: setRelation(absenteePageIds) },
  });
}

export async function updateGuests(pageId: string, guests: string[]): Promise<void> {
  await notionPatch(`/pages/${pageId}`, {
    properties: { Guests: setMultiSelect(guests) },
  });
}
