import { Router, type Request, type Response } from 'express';
import { readRecentLogs, type LogEntry } from '../utils/log-reader.js';
import { logsAuthMiddleware } from '../middleware/logs-auth.js';
import {
  groupPairedEntries,
  buildFlowGroups,
  type DisplayRow,
  type NotionCallRow,
  type LineSendRow,
  type FlowGroup,
} from './log-grouping.js';

const taipeiFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const LEVEL_NAMES: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const LEVEL_COLORS: Record<string, string> = {
  trace: '#94a3b8',
  debug: '#60a5fa',
  info: '#34d399',
  warn: '#fbbf24',
  error: '#f87171',
  fatal: '#c084fc',
};

const METHOD_COLORS: Record<string, string> = {
  GET: '#34d399',
  POST: '#60a5fa',
  PATCH: '#fbbf24',
  DELETE: '#f87171',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(epochMs: number): string {
  return taipeiFormatter.format(new Date(epochMs));
}

function statusIcon(hasSuccess: boolean, hasFailure: boolean): string {
  if (hasFailure) return '✕';
  if (hasSuccess) return '✓';
  return '⏳';
}

function reqIdCellHtml(rawReqId: string): string {
  if (!rawReqId) return `<td class="reqid">—</td>`;
  return `<td class="reqid"><span class="reqid-link" onclick="filterByReqId(event,'${rawReqId}')">${escapeHtml(rawReqId)}</span></td>`;
}

const META_FIELDS = new Set(['level', 'time', 'msg', 'reqId', 'pid', 'hostname']);
const EXTRA_VALUE_MAX_LEN = 60;

function formatExtraValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(' / ');
  }
  if (typeof value === 'object') {
    // value !== null，因為 null 在呼叫端已經被過濾掉（見 renderExtraFieldsHtml）
    return JSON.stringify(value);
  }
  return String(value);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

/**
 * 通用 key-value 渲染器（決定 1）：把一筆 entry 排除後設欄位（META_FIELDS）
 * 後剩下的每個欄位渲染成一個小標籤，格式比照既有 .tag-purpose 的視覺風格。
 * 新增一個欄位或一種新的 log 訊息完全不需要碰這個函式——它不認識任何特定
 * 欄位名稱，純粹枚舉 Object.keys()。
 *
 * null/undefined 直接跳過該欄位（沒有值可顯示，顯示 "null" 標籤只會製造
 * 雜訊）。值一律截斷到 EXTRA_VALUE_MAX_LEN 字元，完整值放在 title 屬性
 * 供 hover 查看（跟決定 4 的 tooltip 手法一致，兩者共用同一個互動慣例）。
 */
function renderExtraFieldsHtml(entry: LogEntry): string {
  const tags = Object.entries(entry)
    .filter(([key, value]) => !META_FIELDS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => {
      const full = formatExtraValue(value);
      const shown = escapeHtml(truncate(full, EXTRA_VALUE_MAX_LEN));
      return `<span class="tag-field" title="${escapeHtml(full)}"><span class="tag-field-key">${escapeHtml(key)}</span>${shown}</span>`;
    });
  return tags.length > 0 ? `<div class="extra-tags">${tags.join('')}</div>` : '';
}

interface RowContent {
  levelName: string;
  color: string;
  time: number;
  reqId: string;
  /** 已經是完整 HTML 片段（icon + label + badges + content 或 msg + extra-tags），行內顯示用。 */
  msgHtml: string;
  /** 展開/detail 區塊要放進 <pre> 的純文字（已經過 escapeHtml），沒有 detail 就是空字串。 */
  detailText: string;
  /** applyFilters() 的 search 比對用，已轉小寫。 */
  searchableText: string;
  /** 複製功能（copyFiltered）用的原始 JSON，已 escapeHtml。 */
  rawJson: string;
}

// Notion API inline tags: method badge + db name. Under normal operation a
// Notion API log line is always absorbed into a merged notion-call row by
// groupPairedEntries() before reaching singleRowContent() — this branch only
// fires for the rare orphan case (a payload/response/error line whose
// matching request row wasn't found), so the badge still shows up even then.
const NOTION_API_MESSAGES = new Set([
  'Notion API request',
  'Notion API response',
  'Notion API request payload',
  'Notion API response payload',
  'Notion API error',
]);

function singleRowContent(entry: LogEntry): RowContent {
  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const msg = escapeHtml(String(entry.msg ?? ''));
  const { level, time: _t, msg: _m, reqId: _r, pid, hostname, ...extra } = entry;

  let notionTagsHtml = '';
  if (entry.method && NOTION_API_MESSAGES.has(String(entry.msg))) {
    const method = String(entry.method);
    const db = entry.db ? String(entry.db) : null;
    const methodColor = METHOD_COLORS[method] ?? '#94a3b8';
    notionTagsHtml = ` <span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(method)}</span>`;
    if (db) notionTagsHtml += ` <span class="tag-db">${escapeHtml(db)}</span>`;
  }

  // Purpose tag: set by withPurpose() on repository entry points, shows up
  // on any log line emitted while that context is active — not just Notion
  // API lines — since the purpose describes the surrounding operation, not
  // the specific HTTP call.
  const purposeHtml = entry.purpose ? ` <span class="tag-purpose">${escapeHtml(String(entry.purpose))}</span>` : '';
  const extraTagsHtml = renderExtraFieldsHtml(entry); // 決定 1

  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    time: entry.time ?? 0,
    reqId: String(entry.reqId ?? ''),
    msgHtml: `${msg}${notionTagsHtml}${purposeHtml}${extraTagsHtml}`,
    detailText: '', // single 行沒有獨立 detail 區塊，extra-tags 已經在行內顯示完了，不需要再點開
    searchableText: (String(entry.msg ?? '') + ' ' + JSON.stringify(extra)).toLowerCase(),
    rawJson: escapeHtml(JSON.stringify(entry)),
  };
}

function notionCallDetail(row: NotionCallRow): string {
  const parts: string[] = [`${row.method} ${row.path}`];
  const durationMs = row.response?.['durationMs'];
  if (typeof durationMs === 'number') {
    parts.push(`耗時: ${durationMs}ms`);
  }
  const requestBody = row.requestPayload?.['body'];
  if (row.requestPayload && requestBody !== undefined) {
    parts.push(`請求內容:\n${JSON.stringify(requestBody, null, 2)}`);
  } else {
    parts.push('開 LOG_LEVEL=debug 才能看到完整請求內容');
  }
  if (row.error) {
    parts.push(`錯誤:\n${JSON.stringify(row.error, null, 2)}`);
  } else {
    const responseResult = row.responsePayload?.['result'];
    if (row.responsePayload && responseResult !== undefined) {
      parts.push(`回應內容:\n${JSON.stringify(responseResult, null, 2)}`);
    } else if (row.response) {
      parts.push('開 LOG_LEVEL=debug 才能看到完整回應內容');
    } else {
      parts.push('尚無回應記錄');
    }
  }
  return parts.join('\n\n');
}

function notionCallRowContent(row: NotionCallRow): RowContent {
  const levelNum = row.error?.level ?? row.response?.level ?? row.request.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';

  const methodColor = METHOD_COLORS[row.method] ?? '#94a3b8';
  const methodHtml = `<span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(row.method)}</span>`;
  const dbHtml = row.db ? `<span class="tag-db">${escapeHtml(row.db)}</span>` : '';
  // Not every call has a db tag — GET /pages/{id} calls carry no database ID
  // in their path at all (page IDs and database IDs are different things),
  // so getDbName() can't guess one. The path itself is the only way to tell
  // which endpoint was actually hit in that case.
  const pathHtml = `<span class="tag-path" title="${escapeHtml(row.path)}">${escapeHtml(row.path)}</span>`;
  const purposeHtml = row.purpose ? `<span class="tag-purpose">${escapeHtml(row.purpose)}</span>` : '';
  const retryHtml = row.attempts > 1
    ? `<span class="tag-method" style="color:#94a3b8;border-color:#94a3b8">重試 ${row.attempts - 1} 次</span>`
    : '';
  const icon = statusIcon(!!row.response, !!row.error);
  // fullContentText 是 purpose 全文，本來就不長，加 title 主要是保險（決定 4）。
  const fullContentText = row.purpose ?? '';
  const msgHtml = `<div class="action-row">` +
    `<span class="action-icon">${icon}</span>` +
    `<span class="action-label">Notion API 呼叫</span>` +
    `<span class="action-badges">${methodHtml}${dbHtml}${pathHtml}${retryHtml}</span>` +
    `<span class="action-content" title="${escapeHtml(fullContentText)}">${purposeHtml}</span>` +
    `</div>`;

  return {
    levelName,
    color,
    time: row.request.time ?? 0,
    reqId: String(row.request.reqId ?? ''),
    msgHtml,
    detailText: escapeHtml(notionCallDetail(row)),
    searchableText: JSON.stringify(row).toLowerCase(),
    rawJson: escapeHtml(JSON.stringify(row)),
  };
}

function lineSendDetail(row: LineSendRow): string {
  const parts: string[] = [`${row.method} ${row.path}`];
  const payloadMessages = row.payload?.['messages'];
  if (row.payload && payloadMessages !== undefined) {
    parts.push(`訊息內容:\n${JSON.stringify(payloadMessages, null, 2)}`);
  } else {
    parts.push('開 LOG_LEVEL=debug 才能看到完整訊息內容');
  }
  if (row.failure) {
    parts.push(`失敗原因:\n${JSON.stringify(row.failure, null, 2)}`);
    const failureMessages = row.failurePayload?.['messages'];
    if (row.failurePayload && failureMessages !== undefined) {
      parts.push(`失敗時的訊息內容:\n${JSON.stringify(failureMessages, null, 2)}`);
    } else {
      parts.push('開 LOG_LEVEL=debug 才能看到失敗時的完整訊息內容');
    }
  } else if (!row.sent) {
    parts.push('尚無送出結果記錄');
  }
  return parts.join('\n\n');
}

// LINE 內容預覽長度（決定 4：80 → 160 字元，同時無論長度多少都加上完整內容
// 的 title，見下方 fullContentText）。
const LINE_CONTENT_PREVIEW_LEN = 160;

function lineSendRowContent(row: LineSendRow): RowContent {
  const levelNum = row.failure?.level ?? row.sent?.level ?? row.start.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const label = row.kind === 'line-reply' ? 'LINE 回覆' : 'LINE 推播';

  const methodColor = METHOD_COLORS[row.method] ?? '#94a3b8';
  const methodHtml = `<span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(row.method)}</span>`;
  const pathHtml = `<span class="tag-path" title="${escapeHtml(row.path)}">${escapeHtml(row.path)}</span>`;

  const payloadMessages = row.payload?.['messages'];
  const messages = Array.isArray(payloadMessages) ? payloadMessages.map(String) : null;
  const fullContentText = messages ? messages.join(' / ') : '';
  const contentHtml = messages
    ? escapeHtml(fullContentText.slice(0, LINE_CONTENT_PREVIEW_LEN))
    : '<span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';

  const icon = statusIcon(!!row.sent, !!row.failure);
  const msgHtml = `<div class="action-row">` +
    `<span class="action-icon">${icon}</span>` +
    `<span class="action-label">${escapeHtml(label)}</span>` +
    `<span class="action-badges">${methodHtml}${pathHtml}</span>` +
    `<span class="action-content" title="${escapeHtml(fullContentText)}">${contentHtml}</span>` +
    `</div>`;

  return {
    levelName,
    color,
    time: row.start.time ?? 0,
    reqId: String(row.start.reqId ?? ''),
    msgHtml,
    detailText: escapeHtml(lineSendDetail(row)),
    searchableText: JSON.stringify(row).toLowerCase(),
    rawJson: escapeHtml(JSON.stringify(row)),
  };
}

function rowContent(row: DisplayRow): RowContent {
  switch (row.kind) {
    case 'single':
      return singleRowContent(row.entry);
    case 'notion-call':
      return notionCallRowContent(row);
    case 'line-reply':
    case 'line-push':
      return lineSendRowContent(row);
  }
}

function asTableRow(c: RowContent): string {
  const extraRow = c.detailText
    ? `<tr class="extra-row hidden"><td colspan="4"><pre>${c.detailText}</pre></td></tr>`
    : '';
  return `
  <tr class="log-row" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}" data-raw="${c.rawJson}" onclick="toggleExtra(this)">
    <td class="time">${formatTime(c.time)}</td>
    <td><span class="badge" style="background:${c.color}">${c.levelName}</span></td>
    ${reqIdCellHtml(c.reqId)}
    <td class="msg">${c.msgHtml}</td>
  </tr>
  ${extraRow}`;
}

/** wrapperClass 是 'flow-step' | 'flow-misc'；決定 3 的等級色標用 inline style 的
 * border-left-color 實作（顏色是每一列各自的 LEVEL_COLORS 值，不是靜態 CSS class
 * 能表達的，所以用 inline style，class 本身只負責排版）。 */
function asFlowItem(c: RowContent, wrapperClass: 'flow-step' | 'flow-misc'): string {
  const detail = c.detailText ? `<div class="flow-step-detail"><pre>${c.detailText}</pre></div>` : '';
  const clickable = c.detailText ? ` onclick="event.stopPropagation(); this.classList.toggle('expanded')"` : '';
  return `<div class="${wrapperClass}" style="border-left-color:${c.color}" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}"${clickable}>${c.msgHtml}${detail}</div>`;
}

/** 起點/終點用專屬 wrapper（見下方流程表渲染），一樣加上等級色標跟 data-* 篩選屬性。
 * 「起點」的 detailText 永遠是空字串（見 renderFlowStartEndpointHtml），但「終點」
 * 帶的是 lineSendRowContent() 算出的 LINE 回覆失敗原因/完整內容——跟 asFlowItem
 * 一樣要能展開看到，否則平面模式點得開的東西，流程表的終點卻整段看不到。 */
function asFlowEndpoint(c: RowContent, label: string): string {
  const detail = c.detailText ? `<div class="flow-step-detail"><pre>${c.detailText}</pre></div>` : '';
  const clickable = c.detailText ? ` onclick="event.stopPropagation(); this.classList.toggle('expanded')"` : '';
  return `<div class="flow-endpoint" style="border-left-color:${c.color}" data-level="${c.levelName}" data-time="${c.time}" data-msg="${escapeHtml(c.searchableText)}" data-reqid="${c.reqId}"${clickable}><span class="flow-tag">${label}</span>${c.msgHtml}${detail}</div>`;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  image: '圖片',
  video: '影片',
  audio: '語音',
  location: '位置資訊',
  file: '檔案',
  sticker: '貼圖',
};

/** 'Processing event detail' 的 message 欄位摘要成一行文字。與舊版用戶端
 * messageLabel() 邏輯相同，只是搬到伺服器端、輸入型別改成 unknown。 */
function messageLabel(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as Record<string, unknown>;
  if (m['type'] === 'text') return typeof m['text'] === 'string' ? m['text'] : '';
  if (m['type'] === 'location' && m['title']) return `${MESSAGE_TYPE_LABELS['location']}(${String(m['title'])})`;
  if (m['type'] === 'file' && m['fileName']) return `${MESSAGE_TYPE_LABELS['file']}(${String(m['fileName'])})`;
  const type = m['type'];
  return (typeof type === 'string' && MESSAGE_TYPE_LABELS[type]) || (typeof type === 'string' ? type : '');
}

function renderFlowStartEndpointHtml(entry: LogEntry, detail: LogEntry | undefined): string {
  // 'Processing event' (info) carries only type/sourceType — no PII. The
  // actual message content lives on the paired 'Processing event detail'
  // (debug) line, if LOG_LEVEL=debug captured one.
  const detailSource = detail && typeof detail['source'] === 'object' && detail['source'] !== null
    ? (detail['source'] as Record<string, unknown>)['type']
    : undefined;
  const src = (typeof entry.sourceType === 'string' && entry.sourceType) || (typeof detailSource === 'string' && detailSource) || '';
  const msgType = String(entry['type'] ?? '');
  let contentHtml = '';
  if (msgType === 'message') {
    const content = detail ? messageLabel(detail['message']) : '';
    contentHtml = content
      ? ` · ${escapeHtml(content)}`
      : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到指令內容</span>';
  }

  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const c: RowContent = {
    levelName,
    color,
    time: entry.time ?? 0,
    reqId: String(entry.reqId ?? ''),
    msgHtml: `事件進來 · ${escapeHtml(msgType)}${src ? ` · ${escapeHtml(src)}` : ''}${contentHtml}`,
    detailText: '',
    searchableText: String(entry.msg ?? '').toLowerCase(),
    rawJson: '',
  };
  return asFlowEndpoint(c, '起點');
}

function renderFlowEndEndpointHtml(row: LineSendRow): string {
  // row 一定是 kind === 'line-reply'（FlowGroup.end 的型別已經是 LineSendRow，
  // 但實務上只會塞 line-reply，line-push 一律進 misc）。
  return asFlowEndpoint(lineSendRowContent(row), '終點');
}

function renderFlowGroupHtml(group: FlowGroup): string {
  const summary = (group.start ? '事件觸發' : (group.reqId ? '(無 Processing event 記錄)' : '背景/排程作業')) +
    ' → ' + group.steps.length + ' 次 API 呼叫 → ' + (group.end ? 'LINE reply' : '(無回覆記錄)');
  const reqIdHtml = group.reqId
    ? `<span class="reqid-link" onclick="event.stopPropagation(); filterByReqId(event,'${group.reqId}'); setViewMode('flat')">${escapeHtml(group.reqId)}</span>`
    : `<span class="reqid-link" style="cursor:default;opacity:.6">(無 reqId)</span>`;

  const stepsHtml = [
    group.start ? renderFlowStartEndpointHtml(group.start, group.startDetail) : '',
    ...group.steps.map((row) => asFlowItem(notionCallRowContent(row), 'flow-step')),
    ...group.misc.map((row) => asFlowItem(rowContent(row), 'flow-misc')),
    group.end ? renderFlowEndEndpointHtml(group.end) : '',
  ].join('');

  return `<div class="flow-group">` +
    `<div class="flow-header" onclick="this.parentElement.classList.toggle('expanded')">` +
    `<span class="flow-caret">▸</span>` +
    `<span class="time">${formatTime(group.firstTime)}</span>` +
    reqIdHtml +
    `<span class="flow-summary">${escapeHtml(summary)}</span>` +
    `</div>` +
    `<div class="flow-steps">${stepsHtml}</div>` +
    `</div>`;
}

function renderFlowView(displayRows: DisplayRow[]): string {
  const groups = buildFlowGroups(displayRows);
  if (groups.length === 0) return '<div class="flow-empty">No log entries found</div>';
  return groups.map(renderFlowGroupHtml).join('');
}

function renderHtml(entries: LogEntry[]): string {
  // groupPairedEntries() merges request/payload/response/payload(/error) and
  // reply|push "about to send"/"sent" pairs into single rows so both the
  // flat table and the flow-table view show one item per logical action
  // instead of several disjoint log lines. It always returns rows sorted
  // ascending by representative time; the flat table reverses that to keep
  // its existing newest-first convention. buildFlowGroups() derives the
  // flow-table view's per-reqId grouping from the same paired data, so both
  // views are rendered server-side from one shared data structure.
  const displayRows = groupPairedEntries(entries);
  const flatRows = [...displayRows].reverse();

  const rows = flatRows.length > 0
    ? flatRows.map((row) => asTableRow(rowContent(row))).join('')
    : '<tr><td colspan="4" class="empty">No log entries found</td></tr>';

  const flowHtml = renderFlowView(displayRows);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dobby — Logs</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    header { padding: 16px 24px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 18px; font-weight: 600; color: #f1f5f9; }
    header .count { font-size: 13px; color: #94a3b8; margin-left: auto; }
    .toolbar { padding: 12px 24px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .filter-group { display: flex; gap: 6px; align-items: center; }
    .filter-label { font-size: 12px; color: #64748b; }
    button { cursor: pointer; padding: 5px 12px; border-radius: 6px; border: 1px solid #475569; background: #1e293b; color: #cbd5e1; font-size: 13px; transition: all .15s; }
    button:hover { background: #334155; }
    button.active { border-color: #60a5fa; color: #60a5fa; background: #1e3a5f; }
    button[data-level="error"].active { border-color: #f87171; color: #f87171; background: #450a0a; }
    button[data-level="warn"].active  { border-color: #fbbf24; color: #fbbf24; background: #451a03; }
    button[data-level="info"].active  { border-color: #34d399; color: #34d399; background: #022c22; }
    button[data-level="debug"].active { border-color: #60a5fa; color: #60a5fa; background: #1e3a5f; }
    button.copy-btn { background: #1e3a5f; border-color: #3b82f6; color: #93c5fd; }
    button.copy-btn:hover { background: #1d4ed8; color: #fff; }
    button.copy-btn.copied { background: #022c22; border-color: #34d399; color: #34d399; }
    input[type="text"] { background: #0f172a; border: 1px solid #475569; color: #e2e8f0; border-radius: 6px; padding: 5px 10px; font-size: 13px; width: 200px; outline: none; }
    input[type="text"]:focus { border-color: #60a5fa; }
    #reqid-filter-bar { display: none; padding: 8px 24px; background: #1a2744; border-bottom: 1px solid #3b82f6; font-size: 13px; align-items: center; gap: 10px; }
    #reqid-filter-bar.active { display: flex; }
    #reqid-filter-bar span { color: #93c5fd; font-family: monospace; }
    #reqid-filter-bar button { padding: 3px 10px; font-size: 12px; }
    .divider { width: 1px; height: 24px; background: #334155; }
    .table-wrap { padding: 16px 24px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; padding: 8px 10px; color: #64748b; font-weight: 500; border-bottom: 1px solid #334155; white-space: nowrap; }
    tr.log-row { cursor: pointer; }
    tr.log-row:hover td { background: #1e293b; }
    tr.log-row.reqid-highlight td { background: #1a2744; }
    td { padding: 7px 10px; border-bottom: 1px solid #1e293b; vertical-align: top; }
    td.time { color: #64748b; white-space: nowrap; font-variant-numeric: tabular-nums; }
    td.reqid { font-family: monospace; color: #94a3b8; white-space: nowrap; }
    td.msg { word-break: break-word; max-width: 600px; }
    td.empty { text-align: center; padding: 40px; color: #475569; }
    .badge { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #0f172a; }
    .reqid-link { cursor: pointer; border-bottom: 1px dashed #475569; }
    .reqid-link:hover { color: #60a5fa; border-color: #60a5fa; }
    .tag-method { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 4px; border: 1px solid; font-size: 11px; font-weight: 700; }
    .tag-db { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; background: #334155; color: #cbd5e1; font-size: 11px; }
    .tag-purpose { display: inline-block; margin-left: 4px; padding: 1px 6px; border-radius: 4px; background: #312e81; color: #c7d2fe; font-size: 11px; }
    .tag-path { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #1e293b; border: 1px solid #334155; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
    .tag-field { display: inline-block; margin: 2px 4px 2px 0; padding: 1px 6px; border-radius: 4px; background: #1e293b; border: 1px solid #334155; color: #cbd5e1; font-size: 11px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }
    .tag-field-key { color: #64748b; margin-right: 4px; }
    .extra-tags { margin-top: 2px; display: flex; flex-wrap: wrap; }

    /* Merged action rows (Notion API calls, LINE reply/push) in the flat
       table — a shared 4-column grid so the badges/content of unrelated row
       kinds (e.g. a long "LINE 回覆: 報名成功..." row next to a short
       "Notion API 呼叫" row) line up in the same vertical position instead
       of drifting based on each row's own label length. */
    .action-row { display: grid; grid-template-columns: 18px 118px 300px 1fr; column-gap: 6px; align-items: center; }
    .action-icon { text-align: center; }
    .action-label { color: #e2e8f0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .action-badges { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; row-gap: 2px; }
    .action-content { color: #cbd5e1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    tr.extra-row td { background: #1e293b; padding: 0; }
    tr.extra-row pre { padding: 10px 16px; font-size: 12px; color: #94a3b8; white-space: pre-wrap; word-break: break-all; }
    .hidden { display: none; }
    #no-results { display: none; text-align: center; padding: 40px; color: #475569; }
    #flow-no-results { display: none; text-align: center; padding: 40px; color: #475569; }

    /* Flow-table view */
    #flow-view { padding: 16px 24px; display: none; flex-direction: column; gap: 10px; }
    #flow-view.active { display: flex; }
    .table-wrap.flow-hidden { display: none; }
    .flow-group { border: 1px solid #334155; border-radius: 8px; overflow: hidden; background: #16213a; }
    .flow-header { padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .flow-header:hover { background: #1e293b; }
    .flow-header .reqid-link { font-family: monospace; color: #93c5fd; }
    .flow-summary { color: #cbd5e1; font-size: 13px; }
    .flow-caret { color: #64748b; font-size: 11px; transition: transform .15s; }
    .flow-group.expanded .flow-caret { transform: rotate(90deg); }
    .flow-steps { display: none; flex-direction: column; gap: 0; border-top: 1px solid #334155; }
    .flow-group.expanded .flow-steps { display: flex; }
    /* 決定 3：等級色標，左側色條。預設灰色，實際顏色由 inline style 的
       border-left-color 覆蓋（每列各自的 LEVEL_COLORS 值，見 asFlowItem/asFlowEndpoint）。 */
    .flow-step, .flow-misc, .flow-endpoint { border-left: 3px solid #64748b; }
    .flow-endpoint { padding: 8px 14px 8px 32px; font-size: 13px; color: #e2e8f0; border-bottom: 1px solid #1e293b; background: #0f172a; }
    .flow-endpoint[onclick] { cursor: pointer; }
    .flow-endpoint .flow-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-right: 8px; }
    .flow-step { padding: 8px 14px 8px 32px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #1e293b; }
    .flow-step:hover { background: #1e293b; }
    .flow-step-detail { display: none; padding: 8px 14px 8px 48px; background: #0f172a; font-size: 12px; color: #94a3b8; }
    .flow-step.expanded .flow-step-detail, .flow-misc.expanded .flow-step-detail, .flow-endpoint.expanded .flow-step-detail { display: block; }
    .flow-step-detail pre { white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
    .hint { color: #64748b; font-style: italic; }
    /* flow-misc 項目不一定可展開（single 行的通用渲染器沒有獨立 detail，
       line-push 有——見 asFlowItem 的 clickable 判斷），只有帶 onclick 的
       才顯示手型游標，避免暗示不可互動的項目可以點開。 */
    .flow-misc { padding: 6px 14px 6px 32px; font-size: 12px; color: #64748b; border-bottom: 1px solid #1e293b; }
    .flow-misc[onclick] { cursor: pointer; }
    .flow-empty { text-align: center; padding: 40px; color: #475569; }
  </style>
</head>
<body>
  <header>
    <h1>🐶 Dobby Logs</h1>
    <span class="count" id="count-label">${flatRows.length} entries</span>
  </header>

  <div class="toolbar">
    <div class="filter-group">
      <span class="filter-label">View</span>
      <div id="view-mode-filters" style="display:flex;gap:6px">
        <button data-view="flat" class="active" onclick="setViewMode('flat')">平面模式</button>
        <button data-view="flow" onclick="setViewMode('flow')">流程表模式</button>
      </div>
    </div>
    <div class="divider"></div>
    <div class="filter-group">
      <span class="filter-label">Level</span>
      <div id="level-filters" style="display:flex;gap:6px">
        <button data-level="all" class="active" onclick="filterLevel('all')">All</button>
        <button data-level="error" onclick="filterLevel('error')">Error</button>
        <button data-level="warn"  onclick="filterLevel('warn')">Warn</button>
        <button data-level="info"  onclick="filterLevel('info')">Info</button>
        <button data-level="debug" onclick="filterLevel('debug')">Debug</button>
      </div>
    </div>
    <div class="divider"></div>
    <div class="filter-group">
      <span class="filter-label">Time</span>
      <div id="time-filters" style="display:flex;gap:6px">
        <button data-range="7" class="active" onclick="filterTime(7)">Last 7 days</button>
        <button data-range="1" onclick="filterTime(1)">Today</button>
        <button data-range="2" onclick="filterTime(2)">Yesterday</button>
      </div>
    </div>
    <div class="divider"></div>
    <input type="text" id="search" placeholder="Search…" oninput="applyFilters()">
    <div class="divider"></div>
    <button class="copy-btn" id="copy-btn" onclick="copyFiltered()">⎘ Copy filtered logs</button>
    <button onclick="document.location.reload()">↻ Refresh</button>
  </div>

  <div id="reqid-filter-bar">
    Filtering by reqId: <span id="reqid-filter-value"></span>
    <button onclick="clearReqIdFilter()">✕ Clear</button>
  </div>

  <div class="table-wrap" id="table-wrap">
    <table>
      <thead><tr><th>Time (台北時間)</th><th>Level</th><th>reqId</th><th>Message</th></tr></thead>
      <tbody id="log-body">${rows}</tbody>
    </table>
    <div id="no-results">No matching log entries</div>
  </div>

  <div id="flow-view">${flowHtml}<div id="flow-no-results">No matching log entries</div></div>

  <script>
    let activeLevel = 'all';
    let activeRange = 7;
    let activeReqId = '';
    let viewMode = 'flat';

    function setViewMode(mode) {
      viewMode = mode;
      document.querySelectorAll('#view-mode-filters button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
      document.getElementById('table-wrap').classList.toggle('flow-hidden', mode === 'flow');
      document.getElementById('flow-view').classList.toggle('active', mode === 'flow');
    }

    function filterLevel(level) {
      activeLevel = level;
      document.querySelectorAll('#level-filters button').forEach(b => b.classList.toggle('active', b.dataset.level === level));
      applyFilters();
    }

    function filterTime(days) {
      activeRange = days;
      document.querySelectorAll('#time-filters button').forEach(b => b.classList.toggle('active', Number(b.dataset.range) === days));
      applyFilters();
    }

    function filterByReqId(evt, reqId) {
      evt.stopPropagation();
      activeReqId = reqId;
      document.getElementById('reqid-filter-bar').classList.add('active');
      document.getElementById('reqid-filter-value').textContent = reqId;
      applyFilters();
    }

    function clearReqIdFilter() {
      activeReqId = '';
      document.getElementById('reqid-filter-bar').classList.remove('active');
      applyFilters();
    }

    function matchesFilters(el, cutoff, endCutoff, search) {
      const level = el.dataset.level;
      const time = Number(el.dataset.time);
      const msg = el.dataset.msg;
      const reqId = el.dataset.reqid;
      const levelMatch = activeLevel === 'all' || level === activeLevel;
      const timeMatch = time >= cutoff && time < endCutoff;
      const searchMatch = !search || msg.includes(search);
      const reqIdMatch = !activeReqId || reqId === activeReqId;
      return levelMatch && timeMatch && searchMatch && reqIdMatch;
    }

    function applyFilters() {
      const search = document.getElementById('search').value.toLowerCase();
      const now = Date.now();

      let cutoff;
      if (activeRange === 1) {
        const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime();
      } else if (activeRange === 2) {
        const d = new Date(); d.setHours(0,0,0,0); cutoff = d.getTime() - 86400000;
      } else {
        cutoff = now - activeRange * 86400000;
      }
      let endCutoff = Infinity;
      if (activeRange === 2) {
        const d = new Date(); d.setHours(0,0,0,0); endCutoff = d.getTime();
      }

      // 平面模式（邏輯不變，只是改用共用的 matchesFilters）
      let visible = 0;
      document.querySelectorAll('#log-body tr.log-row').forEach(row => {
        const show = matchesFilters(row, cutoff, endCutoff, search);
        const nextRow = row.nextElementSibling;
        const isExtra = nextRow && nextRow.classList.contains('extra-row');
        row.classList.toggle('hidden', !show);
        row.classList.toggle('reqid-highlight', show && !!activeReqId);
        if (isExtra && !show) nextRow.classList.add('hidden');
        if (show) visible++;
      });
      document.getElementById('count-label').textContent = visible + ' entries';
      document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';

      // 流程表模式：先逐項篩選，再依 flow-group 做 rollup
      document.querySelectorAll('#flow-view [data-level]').forEach(el => {
        el.classList.toggle('hidden', !matchesFilters(el, cutoff, endCutoff, search));
      });
      let visibleGroups = 0;
      document.querySelectorAll('#flow-view .flow-group').forEach(group => {
        const hasVisibleItem = group.querySelector('[data-level]:not(.hidden)') !== null;
        group.classList.toggle('hidden', !hasVisibleItem);
        if (hasVisibleItem) visibleGroups++;
      });
      const flowNoResults = document.getElementById('flow-no-results');
      if (flowNoResults) flowNoResults.style.display = visibleGroups === 0 ? 'block' : 'none';
    }

    function toggleExtra(row) {
      const next = row.nextElementSibling;
      if (next && next.classList.contains('extra-row')) {
        next.classList.toggle('hidden');
      }
    }

    function copyFiltered() {
      const rows = document.querySelectorAll('#log-body tr.log-row:not(.hidden)');
      const lines = [];
      rows.forEach(row => {
        try {
          const raw = JSON.parse(row.dataset.raw.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
          lines.push(JSON.stringify(raw, null, 2));
        } catch {}
      });
      const text = lines.join('\\n---\\n');
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-btn');
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '⎘ Copy filtered logs'; btn.classList.remove('copied'); }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

export function createLogsRouter(logDir: string): Router {
  const router = Router();

  router.get('/', logsAuthMiddleware, async (_req: Request, res: Response) => {
    const entries = await readRecentLogs(logDir);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderHtml(entries));
  });

  return router;
}
