import { Router, type Request, type Response } from 'express';
import { readRecentLogs, type LogEntry } from '../utils/log-reader.js';

export const logsRouter = Router();

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
  return new Date(epochMs).toISOString().replace('T', ' ').replace('Z', '');
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

  // Notion API inline tags: method badge + db name
  let notionTagsHtml = '';
  if (entry.method && (entry.msg === 'Notion API request' || entry.msg === 'Notion API response' || entry.msg === 'Notion API error')) {
    const method = String(entry.method);
    const db = entry.db ? String(entry.db) : null;
    const methodColor = METHOD_COLORS[method] ?? '#94a3b8';
    notionTagsHtml = ` <span class="tag-method" style="color:${methodColor};border-color:${methodColor}">${escapeHtml(method)}</span>`;
    if (db) notionTagsHtml += ` <span class="tag-db">${escapeHtml(db)}</span>`;
  }

  // LINE message bubbles
  const messagesHtml = Array.isArray(msgList) && msgList.length > 0
    ? `<div class="msg-list">${(msgList as string[]).map((m) => `<span class="msg-bubble">${escapeHtml(m)}</span>`).join('')}</div>`
    : '';

  // Extra fields for expand (exclude fields already shown inline)
  const { method: _method, db: _db, ...expandExtra } = extra;
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
    <td class="msg">${msg}${notionTagsHtml}${messagesHtml}</td>
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
    tr.extra-row td { background: #1e293b; padding: 0; }
    tr.extra-row pre { padding: 10px 16px; font-size: 12px; color: #94a3b8; white-space: pre-wrap; word-break: break-all; }
    .hidden { display: none; }
    #no-results { display: none; text-align: center; padding: 40px; color: #475569; }
    .msg-list { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
    .msg-bubble { display: inline-block; background: #1e3a5f; border: 1px solid #3b82f6; border-radius: 8px; padding: 3px 10px; font-size: 12px; color: #93c5fd; }
  </style>
</head>
<body>
  <header>
    <h1>🐶 Dobby Logs</h1>
    <span class="count" id="count-label">${entries.length} entries</span>
  </header>

  <div class="toolbar">
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

  <div class="table-wrap">
    <table>
      <thead><tr><th>Time (UTC)</th><th>Level</th><th>reqId</th><th>Message</th></tr></thead>
      <tbody id="log-body">${rows}</tbody>
    </table>
    <div id="no-results">No matching log entries</div>
  </div>

  <script>
    let activeLevel = 'all';
    let activeRange = 7;
    let activeReqId = '';

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

logsRouter.get('/', async (_req: Request, res: Response) => {
  const entries = await readRecentLogs();
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderHtml(entries));
});
