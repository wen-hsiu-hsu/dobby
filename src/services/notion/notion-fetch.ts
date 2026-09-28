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

// 錯誤回應的原文（非 JSON 時）最多保留這麼多字元。502/503 常是 proxy 回的整頁
// HTML，全文記下來只會塞爆 log，開頭幾百字就足以看出是誰回的、回了什麼。
const ERROR_BODY_MAX_LEN = 500;

function truncate(text: string): string {
  return text.length > ERROR_BODY_MAX_LEN ? `${text.slice(0, ERROR_BODY_MAX_LEN)}…（共 ${text.length} 字）` : text;
}

/**
 * 非 2xx 時記 `Notion API error` 再丟出。先讀 text 再試 JSON.parse，不直接
 * `res.json()`：Notion 前面的 proxy 回 502/503 時 body 常是 HTML／純文字，
 * `res.json()` 會丟 SyntaxError，錯誤 log 跟 HTTP status 都會一起消失
 * （`/logs` 那一步就只剩「尚無回應記錄」，事件也不會被判成失敗）。
 */
async function assertOk(res: Response, method: string, path: string, db: string | undefined, durationMs: number): Promise<void> {
  if (res.ok) return;
  let err: unknown;
  let detail: string;
  try {
    const text = await res.text();
    try {
      err = JSON.parse(text);
      detail = JSON.stringify(err);
    } catch {
      err = truncate(text);
      detail = err as string;
    }
  } catch (readErr) {
    // 讀 body 途中連線斷掉：status 已經拿到了，照樣記下來。
    err = readErr;
    detail = `(failed to read error body: ${readErr instanceof Error ? readErr.message : String(readErr)})`;
  }
  logger.error({ method, path, db, status: res.status, err, durationMs }, 'Notion API error');
  throw new Error(`Notion API error: HTTP ${res.status} ${detail}`);
}

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function retryDelayMs(res: Response): number {
  const retryAfter = Number(res.headers.get('Retry-After'));
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : DEFAULT_RETRY_DELAY_MS;
}

async function request(method: string, path: string, body?: unknown, attempt = 0): Promise<unknown> {
  const db = getDbName(path);
  // Split into a lightweight info-level line (method/path/db/purpose — always
  // visible, this is what the /logs flow-table view groups on) and a
  // debug-level line carrying the full body/result. Keeping them as two log
  // calls rather than one at a variable level means the flow view still has
  // *something* to show (that a call happened, and why) even when LOG_LEVEL
  // is 'info' and the full Notion payload isn't being captured.
  logger.info({ method, path, db }, 'Notion API request');
  logger.debug({ method, path, db, ...(body !== undefined && { body }) }, 'Notion API request payload');
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: notionHeaders(),
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (err) {
    // DNS 失敗、連線中斷、undici 預設逾時。訊息字串必須跟 HTTP 錯誤同一個
    // 'Notion API error'，`routes/log-grouping.ts` 靠它把這一步標成失敗。
    // 原樣丟出（不包新 Error），pino 的 err serializer 才會把
    // `cause`（例如 getaddrinfo ENOTFOUND）串進呼叫端記的錯誤訊息。
    logger.error({ method, path, db, durationMs: Date.now() - startedAt, err }, 'Notion API error');
    throw err;
  }
  const durationMs = Date.now() - startedAt;
  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delayMs = retryDelayMs(res);
    logger.warn({ method, path, db, attempt: attempt + 1, delayMs, durationMs }, 'Notion API rate limited, retrying');
    await new Promise((r) => setTimeout(r, delayMs));
    return request(method, path, body, attempt + 1);
  }
  await assertOk(res, method, path, db, durationMs);
  let data: unknown;
  try {
    data = await res.json();
  } catch (err) {
    // 2xx 但 body 讀到一半斷線或不是 JSON。跟上面一樣要留 'Notion API error'，
    // 否則這一步在 /logs 只會顯示「尚無回應記錄」。
    logger.error({ method, path, db, status: res.status, durationMs, err }, 'Notion API error');
    throw err;
  }
  logger.info({ method, path, db, durationMs }, 'Notion API response');
  logger.debug({ method, path, db, result: data }, 'Notion API response payload');
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
