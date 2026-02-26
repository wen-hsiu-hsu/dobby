import { notion } from './notion-client.js';
import { env } from '../../config/env.js';
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
  const response = await notion.dataSources.query({
    data_source_id: env.NOTION_DB_CALENDAR,
    filter: { property: 'Date', date: { equals: date } },
  });
  if (response.results.length === 0) return null;
  return pageToEvent(response.results[0] as PageObjectResponse);
}

export async function updateAbsentees(pageId: string, absenteePageIds: string[]): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Absentees: setRelation(absenteePageIds) } as any,
  });
}

export async function updateGuests(pageId: string, guests: string[]): Promise<void> {
  await notion.pages.update({
    page_id: pageId,
    properties: { Guests: setMultiSelect(guests) } as any,
  });
}
