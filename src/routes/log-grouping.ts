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
  method: string;
  path: string;
  start: LogEntry;
  payload?: LogEntry;
  sent?: LogEntry;
  failure?: LogEntry;
  failurePayload?: LogEntry;
}

export type DisplayRow = { kind: 'single'; entry: LogEntry } | NotionCallRow | LineSendRow;

const LINE_REPLY_FAILURE_MSG = 'Reply failed, no fallback available (no groupId for push)';
const LINE_PUSH_FAILURE_MSG = 'Push message failed';
const LINE_REPLY_FAILURE_PAYLOAD_MSG = 'Reply failed payload';
const LINE_PUSH_FAILURE_PAYLOAD_MSG = 'Push message failed payload';

function notionKey(e: LogEntry): string {
  return `${String(e['method'])} ${String(e['path'])}`;
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
  const openLineSendBySendId = new Map<string, LineSendRow>();
  const lastResolvedLineSendBySendId = new Map<string, LineSendRow>();

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
      case 'LINE reply':
      case 'LINE push': {
        const sendId = String(e['sendId']);
        const row: LineSendRow = {
          kind: e.msg === 'LINE reply' ? 'line-reply' : 'line-push',
          method: String(e['method']),
          path: String(e['path']),
          start: e,
        };
        openLineSendBySendId.set(sendId, row);
        output.push(row);
        break;
      }
      case 'LINE reply payload':
      case 'LINE push payload': {
        const sendId = String(e['sendId']);
        const row = openLineSendBySendId.get(sendId);
        if (row) row.payload = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      case 'LINE reply sent':
      case 'LINE push sent': {
        const sendId = String(e['sendId']);
        const row = openLineSendBySendId.get(sendId);
        if (row) {
          row.sent = e;
          lastResolvedLineSendBySendId.set(sendId, row);
          openLineSendBySendId.delete(sendId);
        } else {
          output.push({ kind: 'single', entry: e });
        }
        break;
      }
      case LINE_REPLY_FAILURE_MSG:
      case LINE_PUSH_FAILURE_MSG: {
        const sendId = String(e['sendId']);
        const row = openLineSendBySendId.get(sendId);
        if (row) {
          row.failure = e;
          lastResolvedLineSendBySendId.set(sendId, row);
          openLineSendBySendId.delete(sendId);
        } else {
          output.push({ kind: 'single', entry: e });
        }
        break;
      }
      case LINE_REPLY_FAILURE_PAYLOAD_MSG:
      case LINE_PUSH_FAILURE_PAYLOAD_MSG: {
        const sendId = String(e['sendId']);
        const row = lastResolvedLineSendBySendId.get(sendId);
        if (row && !row.failurePayload) row.failurePayload = e;
        else output.push({ kind: 'single', entry: e });
        break;
      }
      default:
        output.push({ kind: 'single', entry: e });
    }
  }
}

export function representativeTime(row: DisplayRow): number {
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
 * single DisplayRows, so the /logs event timeline can render one item per
 * action instead of several disjoint lines.
 *
 * Entries are bucketed by reqId before pairing (falling back to a shared ''
 * bucket for entries with no reqId — schedulers now get their own reqId via
 * runWithContext(), so this fallback bucket is really only webhook-layer
 * failures like a signature-validation error, which happen before any reqId
 * exists) so two unrelated concurrent calls to the same Notion path never
 * cross-pair. Returned rows are always sorted ascending by representative
 * time; callers that want newest-first (routes/logs.ts's event-list
 * convention) should reverse the result themselves.
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

export interface FlowGroup {
  reqId: string;
  firstTime: number;
  /** 'Processing event'（info）——事件觸發的起點。背景/排程觸發的呼叫沒有這個。 */
  start?: LogEntry;
  /** 'Processing event detail'（debug）——起點的配對明細，可能不存在（LOG_LEVEL=info 時不會捕捉到）。 */
  startDetail?: LogEntry;
  /** 這個 reqId 流程裡的 LINE reply（回覆），一個流程最多一筆。line-push 不算終點，見下方 misc 的說明。 */
  end?: LineSendRow;
  /** 這個 reqId 流程裡依序發生的 Notion API 呼叫。 */
  steps: NotionCallRow[];
  /** 除了 start/startDetail/end/steps 以外的所有東西，依原順序（時間升冪）保留，包含 line-push（背景推播沒有終點的敘事位置，跟現有 renderFlowMisc 的處理方式一致）跟通用渲染器要處理的 single 行。 */
  misc: DisplayRow[];
}

function flowRowReqId(row: DisplayRow): string {
  switch (row.kind) {
    case 'single':
      return typeof row.entry.reqId === 'string' ? row.entry.reqId : '';
    case 'notion-call':
      return typeof row.request.reqId === 'string' ? row.request.reqId : '';
    case 'line-reply':
    case 'line-push':
      return typeof row.start.reqId === 'string' ? row.start.reqId : '';
  }
}

/**
 * 把 groupPairedEntries() 的扁平結果依 reqId 分組，並在組內分類成事件時間軸
 * 敘事需要的四個角色（起點/終點/步驟/雜項，見 `routes/logs.ts` 的
 * `buildTimeline()`）。這是原本活在 buildFlowView()/renderFlowGroup() 用戶端
 * JS 裡的邏輯，搬到伺服器端讓 renderHtml() 可以直接算出完整 HTML，不再需要
 * 瀏覽器重新分組。
 *
 * 輸入必須是 groupPairedEntries() 的輸出（已依 time 升冪排序）——因為組內
 * 順序仰賴這個前提來決定 firstTime 跟敘事順序，不會在這裡重新排序組內項目。
 * 組跟組之間依 firstTime 由新到舊排序（跟原本 buildFlowView() 的
 * `groupList.sort((a, b) => b.firstTime - a.firstTime)` 行為一致）。
 */
export function buildFlowGroups(displayRows: DisplayRow[]): FlowGroup[] {
  const buckets = new Map<string, DisplayRow[]>();
  for (const row of displayRows) {
    const reqId = flowRowReqId(row);
    let bucket = buckets.get(reqId);
    if (!bucket) {
      bucket = [];
      buckets.set(reqId, bucket);
    }
    bucket.push(row);
  }

  const groups: FlowGroup[] = [];
  for (const [reqId, rows] of buckets) {
    const group: FlowGroup = { reqId, firstTime: rows.length > 0 ? representativeTime(rows[0]) : 0, steps: [], misc: [] };
    for (const row of rows) {
      if (row.kind === 'single' && row.entry.msg === 'Processing event') { group.start = row.entry; continue; }
      if (row.kind === 'single' && row.entry.msg === 'Processing event detail') { group.startDetail = row.entry; continue; }
      if (row.kind === 'line-reply') { group.end = row; continue; }
      if (row.kind === 'notion-call') { group.steps.push(row); continue; }
      group.misc.push(row);
    }
    groups.push(group);
  }

  groups.sort((a, b) => b.firstTime - a.firstTime);
  return groups;
}
