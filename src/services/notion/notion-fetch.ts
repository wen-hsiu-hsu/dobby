import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

const NOTION_VERSION = '2022-06-28';
const BASE_URL = 'https://api.notion.com/v1';


function getDbName(path: string): string | undefined {
  const dbLabels: Record<string, string> = {
    [env.NOTION_DB_USERS]: 'users',
    [env.NOTION_DB_CALENDAR]: 'calendar',
    [env.NOTION_DB_PEOPLE]: 'people',
    [env.NOTION_DB_SEASON]: 'season',
    [env.NOTION_DB_ANNOUNCEMENT]: 'announcement',
  };
  for (const [id, name] of Object.entries(dbLabels)) {
    if (path.includes(id)) return name;
  }
  return undefined;
}

function notionHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${env.NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  };
}

async function assertOk(res: Response, method: string, path: string): Promise<void> {
  if (!res.ok) {
    const err = await res.json();
    logger.error({ method, path, status: res.status, err }, 'Notion API error');
    throw new Error(`Notion API error: ${JSON.stringify(err)}`);
  }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const db = getDbName(path);
  logger.debug({ method, path, db, ...(body !== undefined && { body }) }, 'Notion API request');
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: notionHeaders(),
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  await assertOk(res, method, path);
  const data = await res.json();
  logger.debug({ method, path, db, result: data }, 'Notion API response');
  return data;
}

export function notionGet(path: string): Promise<unknown> {
  return request('GET', path);
}

export function notionPost(path: string, body: unknown): Promise<unknown> {
  return request('POST', path, body);
}

export function notionPatch(path: string, body: unknown): Promise<unknown> {
  return request('PATCH', path, body);
}

export async function notionGetAllResults(path: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let cursor: string | undefined;
  do {
    const qs = new URLSearchParams({
      page_size: '100',
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    const page = (await request('GET', `${path}?${qs}`)) as {
      results: unknown[];
      has_more: boolean;
      next_cursor: string | null;
    };
    results.push(...page.results);
    cursor = page.has_more ? (page.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return results;
}
