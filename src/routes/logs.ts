import { Router, type Request, type Response } from 'express';
import { readRecentLogs, type LogEntry } from '../utils/log-reader.js';
import { logsAuthMiddleware } from '../middleware/logs-auth.js';

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

function renderEntry(entry: LogEntry): string {
  const levelNum = entry.level ?? 30;
  const levelName = LEVEL_NAMES[levelNum] ?? String(levelNum);
  const color = LEVEL_COLORS[levelName] ?? '#94a3b8';
  const time = formatTime(entry.time ?? 0);
  const msg = escapeHtml(String(entry.msg ?? ''));
  const rawReqId = String(entry.reqId ?? '');
  const reqId = escapeHtml(rawReqId);

  const { level, time: _t, msg: _m, reqId: _r, pid, hostname, messages: msgList, ...extra } = entry;

  // Notion API inline tags: method badge + db name. Covers both the
  // lightweight info-level lines ('Notion API request'/'response') and the
  // debug-level full-payload lines (' ... payload'), so the flat table shows
  // badges regardless of which LOG_LEVEL produced the entry.
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

  // reqId cell: clickable if present
  const reqIdCell = rawReqId
    ? `<td class="reqid"><span class="reqid-link" onclick="filterByReqId(event,'${rawReqId}')">${reqId}</span></td>`
    : `<td class="reqid">—</td>`;

  // Full raw JSON for copy
  const rawJson = escapeHtml(JSON.stringify(entry));

  return `
  <tr class="log-row" data-level="${levelName}" data-time="${entry.time ?? 0}" data-msg="${escapeHtml(searchableText)}" data-reqid="${rawReqId}" data-raw="${rawJson}" onclick="toggleExtra(this)">
    <td class="time">${time}</td>
    <td><span class="badge" style="background:${color}">${levelName}</span></td>
    ${reqIdCell}
    <td class="msg">${msg}${notionTagsHtml}${purposeHtml}${messagesHtml}</td>
  </tr>
  ${extraJson ? `<tr class="extra-row hidden"><td colspan="4"><pre>${extraJson}</pre></td></tr>` : ''}`;
}

function renderHtml(entries: LogEntry[]): string {
  const rows = entries.length > 0
    ? entries.map(renderEntry).join('')
    : '<tr><td colspan="4" class="empty">No log entries found</td></tr>';

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
    .flow-step-detail .hint { color: #64748b; font-style: italic; }
    .flow-misc { padding: 6px 14px 6px 32px; font-size: 12px; color: #64748b; border-bottom: 1px solid #1e293b; }
    .flow-empty { text-align: center; padding: 40px; color: #475569; }
  </style>
</head>
<body>
  <header>
    <h1>🐶 Dobby Logs</h1>
    <span class="count" id="count-label">${entries.length} entries</span>
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

  <script>
    let activeLevel = 'all';
    let activeRange = 7;
    let activeReqId = '';
    let viewMode = 'flat';
    let flowBuilt = false;

    function unescapeHtml(str) {
      return str.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');
    }

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

    function methodBadge(method, db) {
      const color = METHOD_COLORS_JS[method] || '#94a3b8';
      let html = '<span class="tag-method" style="color:' + color + ';border-color:' + color + '">' + escapeHtmlJs(method) + '</span>';
      if (db) html += ' <span class="tag-db">' + escapeHtmlJs(db) + '</span>';
      return html;
    }

    function escapeHtmlJs(str) {
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    function formatFlowTime(epochMs) {
      const row = document.querySelector('tr.log-row[data-time="' + epochMs + '"]');
      return row ? row.querySelector('td.time').textContent : new Date(epochMs).toISOString();
    }

    // Groups all loaded entries by reqId, pairing each Notion API request/
    // response (and their debug-level payload siblings, if present) into a
    // single step so the flow view can show "purpose → method/db" per call
    // instead of four separate log lines. Entries without a reqId, or that
    // don't fit the request/response/processing/reply shape, are kept as
    // standalone rows so nothing silently disappears from the flow view.
    function groupEntriesForFlow() {
      const rows = Array.from(document.querySelectorAll('#log-body tr.log-row'));
      const entries = rows.map(r => {
        try { return JSON.parse(unescapeHtml(r.dataset.raw)); } catch { return null; }
      }).filter(Boolean);
      entries.sort((a, b) => (a.time || 0) - (b.time || 0)); // chronological for narrative order

      const groups = new Map();
      const loose = [];
      for (const e of entries) {
        if (e.reqId) {
          if (!groups.has(e.reqId)) groups.set(e.reqId, []);
          groups.get(e.reqId).push(e);
        } else {
          loose.push(e);
        }
      }
      return { groups, loose };
    }

    function buildSteps(groupEntries) {
      let start = null, end = null;
      const steps = [];
      const pending = {};
      const misc = [];

      function keyOf(e) { return e.method + ' ' + e.path; }

      for (const e of groupEntries) {
        if (e.msg === 'Processing event') { start = e; continue; }
        if (e.msg === 'LINE reply') { end = e; continue; }
        if (e.msg === 'Notion API request') {
          const key = keyOf(e);
          const step = { method: e.method, path: e.path, db: e.db, purpose: e.purpose, request: e, requestPayload: null, response: null, responsePayload: null, error: null };
          steps.push(step);
          (pending[key] = pending[key] || []).push(step);
          continue;
        }
        if (e.msg === 'Notion API request payload') {
          const key = keyOf(e);
          const step = (pending[key] || []).find(s => !s.requestPayload);
          if (step) step.requestPayload = e; else misc.push(e);
          continue;
        }
        if (e.msg === 'Notion API response') {
          const key = keyOf(e);
          const step = (pending[key] || []).find(s => !s.response);
          if (step) step.response = e; else misc.push(e);
          continue;
        }
        if (e.msg === 'Notion API response payload') {
          const key = keyOf(e);
          const step = (pending[key] || []).slice().reverse().find(s => s.response && !s.responsePayload);
          if (step) step.responsePayload = e; else misc.push(e);
          continue;
        }
        if (e.msg === 'Notion API error') {
          const key = keyOf(e);
          const step = (pending[key] || []).find(s => !s.response && !s.error);
          if (step) step.error = e; else misc.push(e);
          continue;
        }
        misc.push(e);
      }
      return { start, end, steps, misc };
    }

    function renderFlowStepDetail(step) {
      const parts = [];
      if (step.requestPayload && step.requestPayload.body !== undefined) {
        parts.push('<div>請求內容:<pre>' + escapeHtmlJs(JSON.stringify(step.requestPayload.body, null, 2)) + '</pre></div>');
      } else if (step.request) {
        parts.push('<div class="hint">開 LOG_LEVEL=debug 才能看到完整請求內容</div>');
      }
      if (step.responsePayload && step.responsePayload.result !== undefined) {
        parts.push('<div>回應內容:<pre>' + escapeHtmlJs(JSON.stringify(step.responsePayload.result, null, 2)) + '</pre></div>');
      } else if (step.error) {
        parts.push('<div>錯誤:<pre>' + escapeHtmlJs(JSON.stringify(step.error, null, 2)) + '</pre></div>');
      } else if (step.response) {
        parts.push('<div class="hint">開 LOG_LEVEL=debug 才能看到完整回應內容</div>');
      } else {
        parts.push('<div class="hint">尚無回應記錄</div>');
      }
      return parts.join('');
    }

    function renderFlowStep(step) {
      const purpose = step.purpose ? escapeHtmlJs(step.purpose) : '(未標註目的)';
      const errorTag = step.error ? ' <span class="tag-method" style="color:#f87171;border-color:#f87171">錯誤</span>' : '';
      return '<div class="flow-step" onclick="event.stopPropagation(); this.classList.toggle(\\'expanded\\')">' +
        '<span class="flow-step-purpose">' + purpose + '</span> ' +
        methodBadge(step.method, step.db) + errorTag +
        '<div class="flow-step-detail">' + renderFlowStepDetail(step) + '</div>' +
        '</div>';
    }

    function renderFlowEndpoint(entry, label) {
      if (entry.msg === 'Processing event') {
        const src = entry.source && entry.source.type ? entry.source.type : '';
        const msgType = entry.type || '';
        return '<div class="flow-endpoint"><span class="flow-tag">' + label + '</span>' +
          '事件進來 · ' + escapeHtmlJs(msgType) + (src ? ' · ' + escapeHtmlJs(src) : '') + '</div>';
      }
      if (entry.msg === 'LINE reply') {
        const messages = Array.isArray(entry.messages) ? entry.messages.join(' / ') : '';
        return '<div class="flow-endpoint"><span class="flow-tag">' + label + '</span>' +
          'LINE 回覆' + (messages ? ' · ' + escapeHtmlJs(messages.slice(0, 80)) : '') + '</div>';
      }
      return '';
    }

    function renderFlowGroup(reqId, groupEntries) {
      const { start, end, steps, misc } = buildSteps(groupEntries);
      const firstTime = groupEntries[0] ? groupEntries[0].time : 0;
      const summary = (start ? '事件觸發' : '(無 Processing event 記錄)') +
        ' → ' + steps.length + ' 次 API 呼叫 → ' + (end ? 'LINE reply' : '(無回覆記錄)');

      const stepsHtml = [
        start ? renderFlowEndpoint(start, '起點') : '',
        ...steps.map(renderFlowStep),
        ...misc.map(m => '<div class="flow-misc">' + escapeHtmlJs(m.msg || '') + '</div>'),
        end ? renderFlowEndpoint(end, '終點') : '',
      ].join('');

      return '<div class="flow-group">' +
        '<div class="flow-header" onclick="this.parentElement.classList.toggle(\\'expanded\\')">' +
        '<span class="flow-caret">▸</span>' +
        '<span class="time">' + formatFlowTime(firstTime) + '</span>' +
        '<span class="reqid-link" onclick="event.stopPropagation(); filterByReqId(event,\\'' + reqId + '\\'); setViewMode(\\'flat\\')">' + escapeHtmlJs(reqId) + '</span>' +
        '<span class="flow-summary">' + summary + '</span>' +
        '</div>' +
        '<div class="flow-steps">' + stepsHtml + '</div>' +
        '</div>';
    }

    function buildFlowView() {
      const { groups, loose } = groupEntriesForFlow();
      const container = document.getElementById('flow-view');
      if (groups.size === 0 && loose.length === 0) {
        container.innerHTML = '<div class="flow-empty">No log entries found</div>';
        return;
      }

      const groupEntriesList = Array.from(groups.entries()).map(([reqId, entries]) => ({
        reqId, entries, firstTime: entries[0] ? entries[0].time : 0,
      }));
      const looseItems = loose.map(e => ({ loose: e, firstTime: e.time || 0 }));
      const combined = [...groupEntriesList, ...looseItems].sort((a, b) => a.firstTime - b.firstTime);

      container.innerHTML = combined.map(item => {
        if (item.loose) {
          return '<div class="flow-misc">' + formatFlowTime(item.firstTime) + ' · ' + escapeHtmlJs(item.loose.msg || '') + '</div>';
        }
        return renderFlowGroup(item.reqId, item.entries);
      }).join('');
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
