import { Router, type Request, type Response } from 'express';
import { readRecentLogs, type LogEntry } from '../utils/log-reader.js';
import { logsAuthMiddleware } from '../middleware/logs-auth.js';
import { groupPairedEntries, type DisplayRow, type NotionCallRow, type LineSendRow } from './log-grouping.js';

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

function renderEntry(entry: LogEntry): string {
  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const time = formatTime(entry.time ?? 0);
  const msg = escapeHtml(String(entry.msg ?? ''));
  const rawReqId = String(entry.reqId ?? '');

  const { level, time: _t, msg: _m, reqId: _r, pid, hostname, messages: msgList, ...extra } = entry;

  // Notion API inline tags: method badge + db name. Under normal operation a
  // Notion API log line is always absorbed into a merged notion-call row by
  // groupPairedEntries() before reaching here — this branch only fires for
  // the rare orphan case (a payload/response/error line whose matching
  // request row wasn't found), so the badge still shows up even then.
  const NOTION_API_MESSAGES = new Set([
    'Notion API request',
    'Notion API response',
    'Notion API request payload',
    'Notion API response payload',
    'Notion API error',
  ]);
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
  const purposeHtml = entry.purpose
    ? ` <span class="tag-purpose">${escapeHtml(String(entry.purpose))}</span>`
    : '';

  // LINE message bubbles
  const messagesHtml = Array.isArray(msgList) && msgList.length > 0
    ? `<div class="msg-list">${(msgList as string[]).map((m) => `<span class="msg-bubble">${escapeHtml(m)}</span>`).join('')}</div>`
    : '';

  // Extra fields for expand (exclude fields already shown inline)
  const { method: _method, db: _db, purpose: _purpose, ...expandExtra } = extra;
  const extraJson = Object.keys(expandExtra).length > 0
    ? escapeHtml(JSON.stringify(expandExtra, null, 2))
    : '';

  const searchableText = (msg + ' ' + JSON.stringify(extra)).toLowerCase();

  // Full raw JSON for copy
  const rawJson = escapeHtml(JSON.stringify(entry));

  return `
  <tr class="log-row" data-level="${levelName}" data-time="${entry.time ?? 0}" data-msg="${escapeHtml(searchableText)}" data-reqid="${rawReqId}" data-raw="${rawJson}" onclick="toggleExtra(this)">
    <td class="time">${time}</td>
    <td><span class="badge" style="background:${color}">${levelName}</span></td>
    ${reqIdCellHtml(rawReqId)}
    <td class="msg">${msg}${notionTagsHtml}${purposeHtml}${messagesHtml}</td>
  </tr>
  ${extraJson ? `<tr class="extra-row hidden"><td colspan="4"><pre>${extraJson}</pre></td></tr>` : ''}`;
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

function renderNotionCallRow(row: NotionCallRow): string {
  const levelNum = row.error?.level ?? row.response?.level ?? row.request.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const time = formatTime(row.request.time ?? 0);
  const rawReqId = String(row.request.reqId ?? '');

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
  const msgHtml = `<div class="action-row">` +
    `<span class="action-icon">${icon}</span>` +
    `<span class="action-label">Notion API 呼叫</span>` +
    `<span class="action-badges">${methodHtml}${dbHtml}${pathHtml}${retryHtml}</span>` +
    `<span class="action-content">${purposeHtml}</span>` +
    `</div>`;

  const extraJson = escapeHtml(notionCallDetail(row));
  const searchableText = JSON.stringify(row).toLowerCase();
  const rawJson = escapeHtml(JSON.stringify(row));

  return `
  <tr class="log-row" data-level="${levelName}" data-time="${row.request.time ?? 0}" data-msg="${escapeHtml(searchableText)}" data-reqid="${rawReqId}" data-raw="${rawJson}" onclick="toggleExtra(this)">
    <td class="time">${time}</td>
    <td><span class="badge" style="background:${color}">${levelName}</span></td>
    ${reqIdCellHtml(rawReqId)}
    <td class="msg">${msgHtml}</td>
  </tr>
  <tr class="extra-row hidden"><td colspan="4"><pre>${extraJson}</pre></td></tr>`;
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

function renderLineSendRow(row: LineSendRow): string {
  const levelNum = row.failure?.level ?? row.sent?.level ?? row.start.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const time = formatTime(row.start.time ?? 0);
  const rawReqId = String(row.start.reqId ?? '');
  const label = row.kind === 'line-reply' ? 'LINE 回覆' : 'LINE 推播';

  const methodColor = METHOD_COLORS[row.method] ?? '#94a3b8';
  const methodHtml = `<span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(row.method)}</span>`;
  const pathHtml = `<span class="tag-path" title="${escapeHtml(row.path)}">${escapeHtml(row.path)}</span>`;

  const payloadMessages = row.payload?.['messages'];
  const messages = Array.isArray(payloadMessages) ? payloadMessages.map(String) : null;
  const contentHtml = messages
    ? escapeHtml(messages.join(' / ').slice(0, 80))
    : '<span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';

  const icon = statusIcon(!!row.sent, !!row.failure);
  const msgHtml = `<div class="action-row">` +
    `<span class="action-icon">${icon}</span>` +
    `<span class="action-label">${escapeHtml(label)}</span>` +
    `<span class="action-badges">${methodHtml}${pathHtml}</span>` +
    `<span class="action-content">${contentHtml}</span>` +
    `</div>`;

  const extraJson = escapeHtml(lineSendDetail(row));
  const searchableText = JSON.stringify(row).toLowerCase();
  const rawJson = escapeHtml(JSON.stringify(row));

  return `
  <tr class="log-row" data-level="${levelName}" data-time="${row.start.time ?? 0}" data-msg="${escapeHtml(searchableText)}" data-reqid="${rawReqId}" data-raw="${rawJson}" onclick="toggleExtra(this)">
    <td class="time">${time}</td>
    <td><span class="badge" style="background:${color}">${levelName}</span></td>
    ${reqIdCellHtml(rawReqId)}
    <td class="msg">${msgHtml}</td>
  </tr>
  <tr class="extra-row hidden"><td colspan="4"><pre>${extraJson}</pre></td></tr>`;
}

function renderDisplayRow(row: DisplayRow): string {
  switch (row.kind) {
    case 'single':
      return renderEntry(row.entry);
    case 'notion-call':
      return renderNotionCallRow(row);
    case 'line-reply':
    case 'line-push':
      return renderLineSendRow(row);
  }
}

function renderHtml(entries: LogEntry[]): string {
  // groupPairedEntries() merges request/payload/response/payload(/error) and
  // reply|push "about to send"/"sent" pairs into single rows so both the
  // flat table and the flow-table view show one item per logical action
  // instead of several disjoint log lines. It always returns rows sorted
  // ascending by representative time; the flat table reverses that to keep
  // its existing newest-first convention, the flow view (client-side) does
  // its own per-reqId grouping/sorting from the same data.
  const displayRows = groupPairedEntries(entries);
  const flatRows = [...displayRows].reverse();

  const rows = flatRows.length > 0
    ? flatRows.map(renderDisplayRow).join('')
    : '<tr><td colspan="4" class="empty">No log entries found</td></tr>';

  // Embedded as JSON rather than re-derived from the flat table's DOM so the
  // flow view consumes the exact same paired data (no second, drifting copy
  // of the pairing logic living in client-side JS). <\/script> guards against
  // log content containing a literal closing script tag.
  const displayRowsJson = JSON.stringify(displayRows).replace(/<\/script/gi, '<\\/script');

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
    .tag-path { display: inline-block; padding: 1px 6px; border-radius: 4px; background: #1e293b; border: 1px solid #334155; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: middle; }

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
    .msg-list { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
    .msg-bubble { display: inline-block; background: #1e3a5f; border: 1px solid #3b82f6; border-radius: 8px; padding: 3px 10px; font-size: 12px; color: #93c5fd; }

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
    .flow-endpoint { padding: 8px 14px 8px 32px; font-size: 13px; color: #e2e8f0; border-bottom: 1px solid #1e293b; background: #0f172a; }
    .flow-endpoint .flow-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; margin-right: 8px; }
    .flow-step { padding: 8px 14px 8px 32px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #1e293b; }
    .flow-step:hover { background: #1e293b; }
    .flow-step-purpose { color: #e2e8f0; }
    .flow-step-detail { display: none; padding: 8px 14px 8px 48px; background: #0f172a; font-size: 12px; color: #94a3b8; }
    .flow-step.expanded .flow-step-detail { display: block; }
    .flow-step-detail pre { white-space: pre-wrap; word-break: break-all; margin-top: 4px; }
    .hint { color: #64748b; font-style: italic; }
    .flow-misc { padding: 6px 14px 6px 32px; font-size: 12px; color: #64748b; border-bottom: 1px solid #1e293b; }
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

  <div id="flow-view"></div>

  <script type="application/json" id="display-rows-data">${displayRowsJson}</script>

  <script>
    let activeLevel = 'all';
    let activeRange = 7;
    let activeReqId = '';
    let viewMode = 'flat';
    let flowBuilt = false;

    function setViewMode(mode) {
      viewMode = mode;
      document.querySelectorAll('#view-mode-filters button').forEach(b => b.classList.toggle('active', b.dataset.view === mode));
      document.getElementById('table-wrap').classList.toggle('flow-hidden', mode === 'flow');
      document.getElementById('flow-view').classList.toggle('active', mode === 'flow');
      if (mode === 'flow' && !flowBuilt) {
        buildFlowView();
        flowBuilt = true;
      }
    }

    const METHOD_COLORS_JS = { GET: '#34d399', POST: '#60a5fa', PATCH: '#fbbf24', DELETE: '#f87171' };
    const MESSAGE_TYPE_LABELS_JS = { image: '圖片', video: '影片', audio: '語音', location: '位置資訊', file: '檔案', sticker: '貼圖' };

    function methodBadge(method, db, path) {
      const color = METHOD_COLORS_JS[method] || '#94a3b8';
      let html = '<span class="tag-method" style="color:' + color + ';border-color:' + color + '">' + escapeHtmlJs(method) + '</span>';
      if (db) html += ' <span class="tag-db">' + escapeHtmlJs(db) + '</span>';
      // GET /pages/{id} calls carry no database ID in their path at all, so
      // getDbName() can't tag a db for them — path is the only way to tell
      // which endpoint was actually hit in that case.
      if (path) html += ' <span class="tag-path" title="' + escapeHtmlJs(path) + '">' + escapeHtmlJs(path) + '</span>';
      return html;
    }

    function escapeHtmlJs(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    function formatFlowTime(epochMs) {
      try {
        return new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date(epochMs));
      } catch {
        return new Date(epochMs).toISOString();
      }
    }

    function messageLabel(message) {
      if (!message) return '';
      if (message.type === 'text') return message.text || '';
      if (message.type === 'location' && message.title) return MESSAGE_TYPE_LABELS_JS.location + '(' + message.title + ')';
      if (message.type === 'file' && message.fileName) return MESSAGE_TYPE_LABELS_JS.file + '(' + message.fileName + ')';
      return MESSAGE_TYPE_LABELS_JS[message.type] || message.type || '';
    }

    function rowReqId(row) {
      if (row.kind === 'single') return row.entry.reqId || '';
      if (row.kind === 'notion-call') return row.request.reqId || '';
      return row.start.reqId || '';
    }

    function rowTime(row) {
      if (row.kind === 'single') return row.entry.time || 0;
      if (row.kind === 'notion-call') return row.request.time || 0;
      return row.start.time || 0;
    }

    function renderFlowStepDetail(row) {
      const parts = [];
      if (row.requestPayload && row.requestPayload.body !== undefined) {
        parts.push('<div>請求內容:<pre>' + escapeHtmlJs(JSON.stringify(row.requestPayload.body, null, 2)) + '</pre></div>');
      } else {
        parts.push('<div class="hint">開 LOG_LEVEL=debug 才能看到完整請求內容</div>');
      }
      if (row.error) {
        parts.push('<div>錯誤:<pre>' + escapeHtmlJs(JSON.stringify(row.error, null, 2)) + '</pre></div>');
      } else if (row.responsePayload && row.responsePayload.result !== undefined) {
        parts.push('<div>回應內容:<pre>' + escapeHtmlJs(JSON.stringify(row.responsePayload.result, null, 2)) + '</pre></div>');
      } else if (row.response) {
        parts.push('<div class="hint">開 LOG_LEVEL=debug 才能看到完整回應內容</div>');
      } else {
        parts.push('<div class="hint">尚無回應記錄</div>');
      }
      return parts.join('');
    }

    function renderFlowStep(row) {
      const purpose = row.purpose ? escapeHtmlJs(row.purpose) : '(未標註目的)';
      const icon = row.error ? '✕' : (row.response ? '✓' : '⏳');
      const retryTag = row.attempts > 1
        ? ' <span class="tag-method" style="color:#94a3b8;border-color:#94a3b8">重試 ' + (row.attempts - 1) + ' 次</span>'
        : '';
      return '<div class="flow-step" onclick="event.stopPropagation(); this.classList.toggle(\\'expanded\\')">' +
        '<span class="flow-step-purpose">' + icon + ' ' + purpose + '</span> ' +
        methodBadge(row.method, row.db, row.path) + retryTag +
        '<div class="flow-step-detail">' + renderFlowStepDetail(row) + '</div>' +
        '</div>';
    }

    function renderFlowStartEndpoint(entry, detail, label) {
      // 'Processing event' (info) carries only type/sourceType — no PII.
      // The actual message content lives on the paired 'Processing event
      // detail' (debug) line, if LOG_LEVEL=debug captured one.
      const src = entry.sourceType || (detail && detail.source && detail.source.type) || '';
      const msgType = entry.type || '';
      let contentHtml = '';
      if (msgType === 'message') {
        const content = detail ? messageLabel(detail.message) : '';
        contentHtml = content
          ? ' · ' + escapeHtmlJs(content)
          : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到指令內容</span>';
      }
      return '<div class="flow-endpoint"><span class="flow-tag">' + label + '</span>' +
        '事件進來 · ' + escapeHtmlJs(msgType) + (src ? ' · ' + escapeHtmlJs(src) : '') +
        contentHtml + '</div>';
    }

    function renderFlowEndEndpoint(row, label) {
      const payloadMessages = row.payload && Array.isArray(row.payload.messages) ? row.payload.messages.join(' / ') : '';
      const icon = row.failure ? '✕' : (row.sent ? '✓' : '⏳');
      const contentHtml = payloadMessages
        ? ' · ' + escapeHtmlJs(payloadMessages.slice(0, 80))
        : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';
      return '<div class="flow-endpoint"><span class="flow-tag">' + label + '</span>' +
        icon + ' LINE 回覆 ' + methodBadge(row.method, null, row.path) + contentHtml + '</div>';
    }

    function renderFlowMisc(row) {
      if (row.kind === 'single') {
        return '<div class="flow-misc">' + escapeHtmlJs(row.entry.msg || '') + '</div>';
      }
      // kind === 'line-push': pushes carry no reqId, so a push that lands in
      // an event's group (or the shared '' bucket) is shown inline rather
      // than dropped.
      const payloadMessages = row.payload && Array.isArray(row.payload.messages) ? row.payload.messages.join(' / ') : '';
      const icon = row.failure ? '✕' : (row.sent ? '✓' : '⏳');
      const contentHtml = payloadMessages
        ? ' · ' + escapeHtmlJs(payloadMessages.slice(0, 80))
        : ' · <span class="hint">開 LOG_LEVEL=debug 才能看到訊息內容</span>';
      return '<div class="flow-misc">' + icon + ' LINE 推播 ' + methodBadge(row.method, null, row.path) + contentHtml + '</div>';
    }

    function renderFlowGroup(reqId, rows) {
      let start = null, startDetail = null, end = null;
      const steps = [];
      const misc = [];
      for (const row of rows) {
        if (row.kind === 'single' && row.entry.msg === 'Processing event') { start = row.entry; continue; }
        if (row.kind === 'single' && row.entry.msg === 'Processing event detail') { startDetail = row.entry; continue; }
        if (row.kind === 'line-reply') { end = row; continue; }
        if (row.kind === 'notion-call') { steps.push(row); continue; }
        misc.push(row);
      }

      const summary = (start ? '事件觸發' : (reqId ? '(無 Processing event 記錄)' : '背景/排程作業')) +
        ' → ' + steps.length + ' 次 API 呼叫 → ' + (end ? 'LINE reply' : '(無回覆記錄)');
      const firstTime = rows.length ? rowTime(rows[0]) : 0;
      const reqIdHtml = reqId
        ? '<span class="reqid-link" onclick="event.stopPropagation(); filterByReqId(event,\\'' + reqId + '\\'); setViewMode(\\'flat\\')">' + escapeHtmlJs(reqId) + '</span>'
        : '<span class="reqid-link" style="cursor:default;opacity:.6">(無 reqId)</span>';

      const stepsHtml = [
        start ? renderFlowStartEndpoint(start, startDetail, '起點') : '',
        ...steps.map(renderFlowStep),
        ...misc.map(renderFlowMisc),
        end ? renderFlowEndEndpoint(end, '終點') : '',
      ].join('');

      return '<div class="flow-group">' +
        '<div class="flow-header" onclick="this.parentElement.classList.toggle(\\'expanded\\')">' +
        '<span class="flow-caret">▸</span>' +
        '<span class="time">' + formatFlowTime(firstTime) + '</span>' +
        reqIdHtml +
        '<span class="flow-summary">' + summary + '</span>' +
        '</div>' +
        '<div class="flow-steps">' + stepsHtml + '</div>' +
        '</div>';
    }

    function buildFlowView() {
      const container = document.getElementById('flow-view');
      let displayRows = [];
      try {
        displayRows = JSON.parse(document.getElementById('display-rows-data').textContent);
      } catch {}

      if (displayRows.length === 0) {
        container.innerHTML = '<div class="flow-empty">No log entries found</div>';
        return;
      }

      const groups = new Map();
      for (const row of displayRows) {
        const reqId = rowReqId(row);
        if (!groups.has(reqId)) groups.set(reqId, []);
        groups.get(reqId).push(row);
      }

      const groupList = Array.from(groups.entries()).map(([reqId, rows]) => ({
        reqId, rows, firstTime: rows.length ? rowTime(rows[0]) : 0,
      }));
      groupList.sort((a, b) => b.firstTime - a.firstTime); // newest group first; within a group, rows stay chronological (narrative order)

      container.innerHTML = groupList.map(g => renderFlowGroup(g.reqId, g.rows)).join('');
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

      const rows = document.querySelectorAll('#log-body tr.log-row');
      let visible = 0;

      rows.forEach(row => {
        const level = row.dataset.level;
        const time = Number(row.dataset.time);
        const msg = row.dataset.msg;
        const rowReqId = row.dataset.reqid;
        const nextRow = row.nextElementSibling;
        const isExtra = nextRow && nextRow.classList.contains('extra-row');

        const levelMatch = activeLevel === 'all' || level === activeLevel;
        const timeMatch = time >= cutoff && time < endCutoff;
        const searchMatch = !search || msg.includes(search);
        const reqIdMatch = !activeReqId || rowReqId === activeReqId;
        const show = levelMatch && timeMatch && searchMatch && reqIdMatch;

        row.classList.toggle('hidden', !show);
        row.classList.toggle('reqid-highlight', show && !!activeReqId);
        if (isExtra && !show) nextRow.classList.add('hidden');
        if (show) visible++;
      });

      document.getElementById('count-label').textContent = visible + ' entries';
      document.getElementById('no-results').style.display = visible === 0 ? 'block' : 'none';
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
