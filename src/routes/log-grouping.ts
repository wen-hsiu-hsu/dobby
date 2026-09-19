import type { LogEntry } from '../utils/log-reader.js';

export interface NotionCallRow {
  kind: 'notion-call';
  request: LogEntry;
  requestPayload?: LogEntry;
  response?: LogEntry;
  responsePayload?: LogEntry;
  error?: LogEntry;
  attempts: number;
  purpose?: string;
  method: string;
  path: string;
  db?: string;
}

export interface LineSendRow {
  kind: 'line-reply' | 'line-push';
  start: LogEntry;
  sent?: LogEntry;
  failure?: LogEntry;
}

export type DisplayRow = { kind: 'single'; entry: LogEntry } | NotionCallRow | LineSendRow;

const LINE_REPLY_FAILURE_MSG = 'Reply failed, no fallback available (no groupId for push)';
const LINE_PUSH_FAILURE_MSG = 'Push message failed';

function notionKey(e: LogEntry): string {
  return `${String(e['method'])} ${String(e['path'])}`;
}

function pushSignature(e: LogEntry): string {
  return JSON.stringify([e['to'], e['messages']]);
}

/**
 * A retried Notion call re-emits 'Notion API request' with the *same*
 * method+path as the attempt(s) before it (see notion-fetch.ts's recursive
 * retry-on-429). Keying purely on method+path — without checking whether the
 * previous call for that key already resolved — would misattribute a later
 * response to an earlier, still-open (never-resolved) attempt whenever a
 * call is retried. Each bucket below is processed as its own reqId scope
 * specifically to keep unrelated concurrent calls to the same path (e.g. two
 * different events fetching the same Notion page) from cross-pairing.
 */
function processBucket(bucketEntries: LogEntry[], output: DisplayRow[]): void {
  const sorted = [...bucketEntries].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  const openNotionByKey = new Map<string, NotionCallRow>();
  const lastResolvedNotionByKey = new Map<string, NotionCallRow>();
  const openReplies: LineSendRow[] = [];
  const openPushes: Array<{ row: LineSendRow; signature: string }> = [];

  for (const e of sorted) {
    switch (e.msg) {
      case 'Notion API request': {
        const key = notionKey(e);
        const existing = openNotionByKey.get(key);
        if (existing) {
          existing.attempts += 1;
        } else {
          const row: NotionCallRow = {
            kind: 'notion-call',
            request: e,
            attempts: 1,
            purpose: typeof e['purpose'] === 'string' ? (e['purpose'] as string) : undefined,
            method: String(e['method']),
            path: String(e['path']),
            db: e['db'] ? String(e['db']) : undefined,
          };
          openNotionByKey.set(key, row);
          output.push(row);
        }
        break;
      }
      case 'Notion API request payload': {
        const row = openNotionByKey.get(notionKey(e));
        if (row) row.requestPayload = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      case 'Notion API response': {
        const key = notionKey(e);
        const row = openNotionByKey.get(key);
        if (row) {
          row.response = e;
          lastResolvedNotionByKey.set(key, row);
          openNotionByKey.delete(key);
        } else {
          output.push({ kind: 'single', entry: e });
        }
        break;
      }
      case 'Notion API response payload': {
        const row = lastResolvedNotionByKey.get(notionKey(e));
        if (row && !row.responsePayload) row.responsePayload = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      case 'Notion API error': {
        const key = notionKey(e);
        const row = openNotionByKey.get(key);
        if (row) {
          row.error = e;
          openNotionByKey.delete(key);
        } else {
          output.push({ kind: 'single', entry: e });
        }
        break;
      }
      case 'LINE reply': {
        const row: LineSendRow = { kind: 'line-reply', start: e };
        openReplies.push(row);
        output.push(row);
        break;
      }
      case 'LINE reply sent': {
        const row = openReplies.shift();
        if (row) row.sent = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      case LINE_REPLY_FAILURE_MSG: {
        const row = openReplies.shift();
        if (row) row.failure = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      case 'LINE push': {
        const row: LineSendRow = { kind: 'line-push', start: e };
        openPushes.push({ row, signature: pushSignature(e) });
        output.push(row);
        break;
      }
      case 'LINE push sent':
      case LINE_PUSH_FAILURE_MSG: {
        const signature = pushSignature(e);
        const idx = openPushes.findIndex((p) => p.signature === signature);
        if (idx >= 0) {
          const { row } = openPushes[idx]!;
          if (e.msg === 'LINE push sent') row.sent = e;
          else row.failure = e;
          openPushes.splice(idx, 1);
        } else {
          output.push({ kind: 'single', entry: e });
        }
        break;
      }
      default:
        output.push({ kind: 'single', entry: e });
    }
  }
}

function representativeTime(row: DisplayRow): number {
  switch (row.kind) {
    case 'single':
      return row.entry.time ?? 0;
    case 'notion-call':
      return row.request.time ?? 0;
    case 'line-reply':
    case 'line-push':
      return row.start.time ?? 0;
  }
}

/**
 * Merges log lines that describe one logical action but were emitted as
 * multiple entries (a Notion API call's request/payload/response/payload/
 * error, or a LINE reply/push's "about to send" + "sent"/"failed" pair) into
 * single DisplayRows, so both the flat table and the flow-table view can
 * render one item per action instead of several disjoint lines.
 *
 * Entries are bucketed by reqId before pairing (falling back to a shared ''
 * bucket for entries with no reqId, e.g. scheduler-triggered Notion calls)
 * so two unrelated concurrent calls to the same Notion path never cross-pair.
 * Returned rows are always sorted ascending by representative time; callers
 * that want newest-first (the flat table's existing convention) should
 * reverse the result themselves.
 */
export function groupPairedEntries(entries: LogEntry[]): DisplayRow[] {
  const buckets = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = typeof e.reqId === 'string' ? e.reqId : '';
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(e);
  }

  const output: DisplayRow[] = [];
  for (const bucketEntries of buckets.values()) {
    processBucket(bucketEntries, output);
  }

  output.sort((a, b) => representativeTime(a) - representativeTime(b));
  return output;
}
