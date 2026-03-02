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

export async function notionGet(path: string): Promise<unknown> {
  logger.debug({ method: 'GET', path, db: getDbName(path) }, 'Notion API request');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    headers: notionHeaders(),
  });
  await assertOk(res, 'GET', path);
  const data = await res.json();
  logger.debug({ method: 'GET', path, db: getDbName(path), result: data }, 'Notion API response');
  return data;
}

export async function notionPost(path: string, body: unknown): Promise<unknown> {
  logger.debug({ method: 'POST', path, db: getDbName(path), body }, 'Notion API request');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });
  await assertOk(res, 'POST', path);
  const data = await res.json();
  logger.debug({ method: 'POST', path, db: getDbName(path), result: data }, 'Notion API response');
  return data;
}

export async function notionPatch(path: string, body: unknown): Promise<unknown> {
  logger.debug({ method: 'PATCH', path, db: getDbName(path), body }, 'Notion API request');
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: notionHeaders(),
    body: JSON.stringify(body),
  });
  await assertOk(res, 'PATCH', path);
  const data = await res.json();
  logger.debug({ method: 'PATCH', path, db: getDbName(path), result: data }, 'Notion API response');
  return data;
}
