import { Router, type Request, type Response } from 'express';
import { readRecentLogs, type LogEntry } from '../utils/log-reader.js';
import { getLogLevel } from '../utils/logger.js';
import { getR2SyncStatus, type R2SyncStatus } from '../utils/log-upload.js';
import { logsAuthMiddleware } from '../middleware/logs-auth.js';
import {
  groupPairedEntries,
  buildFlowGroups,
  representativeTime,
  type NotionCallRow,
  type LineSendRow,
  type FlowGroup,
  type DisplayRow,
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

const taipeiTimeOnlyFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei',
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
  warn: '#d3a35c',
  error: '#e0807f',
  fatal: '#c084fc',
};

type EventStatus = 'ok' | 'degraded' | 'warn' | 'error';

const STATUS_COLORS: Record<EventStatus, string> = {
  ok: '#7fb894',
  degraded: '#d3a35c',
  warn: '#d3a35c',
  error: '#e0807f',
};

const STATUS_LABELS: Record<EventStatus, string> = { ok: '完成', degraded: '完成（有降級）', warn: '警告', error: '失敗' };

type EventKind = 'command' | 'chat' | 'join' | 'schedule' | 'system';
type EventBucket = 'msg' | 'cron' | 'sys';

const KIND_META: Record<EventKind, { label: string; bucket: EventBucket; css: string }> = {
  command: { label: '指令', bucket: 'msg', css: 'color:#d2cefd;background:#201c33;border:1px solid #5d5294' },
  chat: { label: '對話', bucket: 'msg', css: 'color:#d2cefd;background:transparent;border:1px solid #5d5294' },
  join: { label: '加入', bucket: 'msg', css: 'color:#c6c9d6;background:transparent;border:1px solid #262835' },
  schedule: { label: '排程', bucket: 'cron', css: 'color:#b2b6ca;background:#1c1d29;border:1px solid #262835' },
  system: { label: '系統', bucket: 'sys', css: 'color:#8b8fa3;background:#1c1d29;border:1px dashed #262835' },
};

/**
 * 已知、預期會發生、且不影響最終結果的降級訊息——處理過程中出現這些訊息但
 * 流程仍然正常結束（有送出回覆、沒有真正的網域錯誤）時，狀態顯示「完成
 * （有降級）」而不是「失敗」，並在詳情頁上方顯示降級原因。跟一般的
 * error/warn 等級掃描分開處理，因為這些訊息的 log level 不代表使用者實際
 * 感受到的嚴重程度（例如 buildMemberJoinedWelcome 那筆是 logger.error，但
 * 歡迎訊息其實正常送出了，只是用了內建文案）。
 */
const DEGRADATION_EXPLANATIONS: Record<string, string> = {
  'Could not get user profile': 'LINE profile API 呼叫失敗，這筆只能用 userId 顯示，看不到顯示名稱。',
  'buildMemberJoinedWelcome error, using fallback': '從 Notion 讀取歡迎詞失敗，送出的是內建的備用文案，不是社團自訂內容。',
  'User tracking failed (non-blocking)': '使用者訊息計數/群組清單更新失敗，不影響這次回覆，但這位使用者的統計資料可能少算一筆。',
};

/** 伺服器生命週期訊息——沒有 reqId，且不代表任何一次事件處理，用來拼服務重啟的分隔線，不會被當成獨立事件列出。 */
const LIFECYCLE_MESSAGES = new Set([
  'Server started',
  'Received shutdown signal, closing server',
  'Graceful shutdown timed out, forcing exit',
  'Server closed, exiting',
]);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** LOG_LEVEL 徽章——`debug` 用跟 `#mask-btn` 相同的強調色，其餘等級用 `.tl-note-warn` 那組暖色，提醒管理者「有些細節區塊需要 LOG_LEVEL=debug 才看得到」。 */
function logLevelBadgeHtml(level: string): string {
  const isDebug = level === 'debug';
  const css = isDebug
    ? 'color:#d2cefd;background:#201c33;border:1px solid #5d5294'
    : 'color:#d3a35c;background:#2c2519;border:1px solid #5c4c2c';
  const dotColor = isDebug ? '#d2cefd' : '#d3a35c';
  return `<span class="level-badge" style="${css}"><span class="level-badge-dot" style="background:${dotColor}"></span>LOG_LEVEL=${escapeHtml(level)}</span>`;
}

/**
 * R2 同步狀態徽章——跟 `logLevelBadgeHtml` 同一種 `.level-badge` 外觀。顏色
 * 沿用既有的 `STATUS_COLORS`（綠 ok／琥珀 warn）；中性灰的色值跟
 * `KIND_META.system` 相同，但這裡是獨立字面值、border 用 solid（不是
 * `KIND_META.system.css` 的 dashed）——`.level-badge` 家族（跟
 * `logLevelBadgeHtml` 一樣）一律用 solid border，直接引用 `KIND_META.system`
 * 會混進不同視覺家族的 dashed 邊框，不是這裡要的效果。這是跨執行的全域狀
 * 態（哪一次 setInterval 執行成功/失敗），不屬於任何單一 reqId/事件，所以
 * 只放在 header，不進事件時間軸。
 */
function r2SyncBadgeHtml(status: R2SyncStatus): string {
  const NEUTRAL_CSS = 'color:#8b8fa3;background:#1c1d29;border:1px solid #262835';

  if (!status.enabled) {
    return `<span class="level-badge" style="${NEUTRAL_CSS}"><span class="level-badge-dot" style="background:#8b8fa3"></span>R2 備份：未啟用</span>`;
  }
  if (status.lastSuccessAt === null && status.lastFailureAt === null) {
    return `<span class="level-badge" style="${NEUTRAL_CSS}"><span class="level-badge-dot" style="background:#8b8fa3"></span>R2 備份：尚未同步</span>`;
  }

  const lastIsSuccess =
    status.lastFailureAt === null || (status.lastSuccessAt !== null && status.lastSuccessAt > status.lastFailureAt);

  if (lastIsSuccess) {
    const css = `color:${STATUS_COLORS.ok};background:transparent;border:1px solid ${STATUS_COLORS.ok}`;
    const time = escapeHtml(taipeiTimeOnlyFormatter.format(new Date(status.lastSuccessAt!)));
    return `<span class="level-badge" style="${css}"><span class="level-badge-dot" style="background:${STATUS_COLORS.ok}"></span>R2 備份 · ${time} 成功</span>`;
  }

  const css = `color:${STATUS_COLORS.warn};background:transparent;border:1px solid ${STATUS_COLORS.warn}`;
  const time = escapeHtml(taipeiTimeOnlyFormatter.format(new Date(status.lastFailureAt!)));
  const titleAttr = status.lastFailureMessage ? ` title="${escapeHtml(status.lastFailureMessage)}"` : '';
  return `<span class="level-badge" style="${css}"${titleAttr}><span class="level-badge-dot" style="background:${STATUS_COLORS.warn}"></span>R2 備份 · ${time} 失敗，等待下次重試</span>`;
}

/**
 * 遞迴把任意 JSON 值畫成可收合的 `<details>` 樹——depth < 2 預設展開，
 * depth >= 2 收合，避免深層巢狀物件一次全部攤開占滿畫面。用瀏覽器原生
 * `<details>`/`<summary>`，不用自己寫 toggle JS 或管理展開狀態。
 */
function jsonNodeHtml(value: unknown, keyLabel: string | null, depth: number): string {
  const keyHtml =
    keyLabel !== null
      ? `<span class="json-key">"${escapeHtml(keyLabel)}"</span><span class="json-colon">: </span>`
      : '';
  if (value !== null && typeof value === 'object') {
    const isArr = Array.isArray(value);
    const entries: [string, unknown][] = isArr
      ? (value as unknown[]).map((v, i): [string, unknown] => [String(i), v])
      : Object.entries(value as Record<string, unknown>);
    const bracketOpen = isArr ? '[' : '{';
    const bracketClose = isArr ? ']' : '}';
    const countLabel = isArr ? `${entries.length} 項` : `${entries.length} 個欄位`;
    const openAttr = depth < 2 ? ' open' : '';
    const childrenHtml = entries.map(([k, v]) => jsonNodeHtml(v, isArr ? null : k, depth + 1)).join('');
    return `<details class="json-node"${openAttr} style="--json-depth:${depth}">
      <summary>${keyHtml}<span class="json-bracket">${bracketOpen}</span><span class="json-collapsed-hint"> … ${countLabel}</span></summary>
      <div class="json-children">${childrenHtml}</div>
      <div class="json-close" style="--json-depth:${depth}">${bracketClose}</div>
    </details>`;
  }
  let valueHtml: string;
  if (value === null || value === undefined) valueHtml = '<span class="json-null">null</span>';
  else if (typeof value === 'string') valueHtml = `<span class="json-string">"${escapeHtml(value)}"</span>`;
  else if (typeof value === 'number') valueHtml = `<span class="json-number">${value}</span>`;
  else if (typeof value === 'boolean') valueHtml = `<span class="json-boolean">${value}</span>`;
  else valueHtml = `<span class="json-string">${escapeHtml(String(value))}</span>`;
  return `<div class="json-leaf" style="--json-depth:${depth}">${keyHtml}${valueHtml}</div>`;
}

function jsonTreeHtml(value: unknown): string {
  return `<div class="json-tree">${jsonNodeHtml(value, null, 0)}</div>`;
}

/** detail 區塊裡的一行純文字說明（例如 fallback 提示、`${method} ${path}`）。 */
function detailTextLine(text: string): string {
  return `<div class="tl-detail-text">${escapeHtml(text)}</div>`;
}

/** detail 區塊裡一段有標籤的可收合 JSON（例如「請求內容」「錯誤」）。 */
function detailJsonSection(label: string, value: unknown): string {
  return `<div class="tl-detail-section"><div class="tl-detail-label">${escapeHtml(label)}</div>${jsonTreeHtml(value)}</div>`;
}

function formatTime(epochMs: number): string {
  return taipeiFormatter.format(new Date(epochMs));
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}

function levelNameOf(entry: LogEntry): string {
  return LEVEL_NAMES[entry.level ?? 30] ?? String(entry.level ?? 30);
}

const META_FIELDS = new Set(['level', 'time', 'msg', 'reqId', 'pid', 'hostname']);
const EXTRA_VALUE_MAX_LEN = 60;

function formatExtraValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(' / ');
  }
  if (typeof value === 'object') {
    // value !== null，因為 null 在呼叫端已經被過濾掉
    return JSON.stringify(value);
  }
  return String(value);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '…' : str;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  image: '圖片',
  video: '影片',
  audio: '語音',
  location: '位置資訊',
  file: '檔案',
  sticker: '貼圖',
};

/** 'Processing event detail' 的 message 欄位摘要成一行文字。 */
function messageLabel(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const m = message as Record<string, unknown>;
  if (m['type'] === 'text') return typeof m['text'] === 'string' ? m['text'] : '';
  if (m['type'] === 'location' && m['title']) return `${MESSAGE_TYPE_LABELS['location']}(${String(m['title'])})`;
  if (m['type'] === 'file' && m['fileName']) return `${MESSAGE_TYPE_LABELS['file']}(${String(m['fileName'])})`;
  const type = m['type'];
  return (typeof type === 'string' && MESSAGE_TYPE_LABELS[type]) || (typeof type === 'string' ? type : '');
}

function notionCallDetail(row: NotionCallRow): string {
  const parts: string[] = [detailTextLine(`${row.method} ${row.path}`)];
  const durationMs = row.response?.['durationMs'] ?? row.error?.['durationMs'];
  if (typeof durationMs === 'number') {
    parts.push(detailTextLine(`耗時: ${durationMs}ms`));
  }
  const requestBody = row.requestPayload?.['body'];
  if (row.requestPayload && requestBody !== undefined) {
    parts.push(detailJsonSection('請求內容', requestBody));
  } else {
    parts.push(detailTextLine('開 LOG_LEVEL=debug 才能看到完整請求內容'));
  }
  if (row.error) {
    parts.push(detailJsonSection('錯誤', row.error));
  } else {
    const responseResult = row.responsePayload?.['result'];
    if (row.responsePayload && responseResult !== undefined) {
      parts.push(detailJsonSection('回應內容', responseResult));
    } else if (row.response) {
      parts.push(detailTextLine('開 LOG_LEVEL=debug 才能看到完整回應內容'));
    } else {
      parts.push(detailTextLine('尚無回應記錄'));
    }
  }
  return parts.join('');
}

function lineSendDetail(row: LineSendRow): string {
  const parts: string[] = [detailTextLine(`${row.method} ${row.path}`)];
  const payloadMessages = row.payload?.['messages'];
  if (row.payload && payloadMessages !== undefined) {
    parts.push(detailJsonSection('訊息內容', payloadMessages));
  } else {
    parts.push(detailTextLine('開 LOG_LEVEL=debug 才能看到完整訊息內容'));
  }
  if (row.failure) {
    parts.push(detailJsonSection('失敗原因', row.failure));
    const failureMessages = row.failurePayload?.['messages'];
    if (row.failurePayload && failureMessages !== undefined) {
      parts.push(detailJsonSection('失敗時的訊息內容', failureMessages));
    } else {
      parts.push(detailTextLine('開 LOG_LEVEL=debug 才能看到失敗時的完整訊息內容'));
    }
  } else if (!row.sent) {
    parts.push(detailTextLine('尚無送出結果記錄'));
  }
  return parts.join('');
}

function errorMessageOf(entry: LogEntry | undefined): string | undefined {
  const err = entry?.['err'];
  if (err && typeof err === 'object' && typeof (err as Record<string, unknown>)['message'] === 'string') {
    return (err as Record<string, unknown>)['message'] as string;
  }
  return undefined;
}

/**
 * 把一個 FlowGroup 底下所有原始 LogEntry 攤平回一個陣列——包含尚未配對成功
 * 的 request/response/payload 等每個片段。用來通用地掃描 userId/displayName/
 * command 這類「不是所有 log 都有、也不值得為每個訊息類型寫專屬解析」的欄
 * 位，以及計算整個流程實際耗時的時間範圍。新增一種 log 訊息、多帶一個欄位
 * 都不需要碰這裡。
 */
function flattenEntries(group: FlowGroup): LogEntry[] {
  const out: LogEntry[] = [];
  if (group.start) out.push(group.start);
  if (group.startDetail) out.push(group.startDetail);
  for (const s of group.steps) {
    out.push(s.request);
    if (s.requestPayload) out.push(s.requestPayload);
    if (s.response) out.push(s.response);
    if (s.responsePayload) out.push(s.responsePayload);
    if (s.error) out.push(s.error);
  }
  for (const m of group.misc) {
    if (m.kind === 'single') {
      out.push(m.entry);
    } else if (m.kind === 'notion-call') {
      out.push(m.request);
      if (m.requestPayload) out.push(m.requestPayload);
      if (m.response) out.push(m.response);
      if (m.responsePayload) out.push(m.responsePayload);
      if (m.error) out.push(m.error);
    } else {
      out.push(m.start);
      if (m.payload) out.push(m.payload);
      if (m.sent) out.push(m.sent);
      if (m.failure) out.push(m.failure);
      if (m.failurePayload) out.push(m.failurePayload);
    }
  }
  if (group.end) {
    out.push(group.end.start);
    if (group.end.payload) out.push(group.end.payload);
    if (group.end.sent) out.push(group.end.sent);
    if (group.end.failure) out.push(group.end.failure);
    if (group.end.failurePayload) out.push(group.end.failurePayload);
  }
  return out;
}

const SOURCE_LABELS: Record<string, string> = { group: '群組', room: '多人聊天室', user: '1 對 1' };
const EVENT_TYPE_LABELS: Record<string, string> = {
  join: '加入群組事件',
  memberJoined: '成員加入事件',
  leave: '離開群組事件',
  follow: '加好友事件',
  unfollow: '封鎖事件',
  postback: 'Postback 事件',
};

function groupSourceType(group: FlowGroup): string {
  if (!group.start) return '';
  const detailSource =
    group.startDetail && typeof group.startDetail['source'] === 'object' && group.startDetail['source'] !== null
      ? (group.startDetail['source'] as Record<string, unknown>)['type']
      : undefined;
  return (typeof group.start['sourceType'] === 'string' && group.start['sourceType']) ||
    (typeof detailSource === 'string' && detailSource) ||
    '';
}

function groupSource(group: FlowGroup, kind: EventKind): string {
  if (group.start) {
    const srcType = groupSourceType(group);
    return SOURCE_LABELS[srcType] ?? (srcType || '未知來源');
  }
  if (kind === 'schedule') return '排程 · cron';
  return 'HTTP · POST /webhook';
}

/**
 * 訊息事件是不是指令（`@Dobby +1` 這類）還是普通對話（走自動回覆），
 * 只有 `Routing command`/`Auto-reply lookup`（都是 debug 層）能明確分辨；
 * `LOG_LEVEL=info` 下這兩行都不存在，退而用「這個流程有沒有 Notion 呼叫」
 * 當猜測依據（指令通常會查/寫 Notion，單純聊天不會）。
 */
function groupKind(group: FlowGroup): EventKind {
  if (!group.start) return 'schedule';
  const msgType = String(group.start['type'] ?? '');
  if (msgType === 'join' || msgType === 'memberJoined') return 'join';
  if (msgType === 'message') {
    const flat = flattenEntries(group);
    // 'Routing command'／'Message looks like command but failed to parse'
    // 都只會從 message-handler.ts 的 isCommand(text) 分支裡發出，即使後者
    // 代表解析失敗，也一樣是「這被判定為指令」的證據。
    if (flat.some((e) => e.msg === 'Routing command' || e.msg === 'Message looks like command but failed to parse')) {
      return 'command';
    }
    if (flat.some((e) => e.msg === 'Auto-reply lookup' || e.msg === 'Skipping auto-reply for admin')) return 'chat';
    return group.steps.length > 0 ? 'command' : 'chat';
  }
  return 'chat';
}

function groupTitle(group: FlowGroup, kind: EventKind): string {
  if (group.start) {
    const msgType = String(group.start['type'] ?? '');
    if (msgType === 'message') {
      const content = group.startDetail ? messageLabel(group.startDetail['message']) : '';
      return content ? `「${content}」` : '訊息事件（開 LOG_LEVEL=debug 才能看到指令內容）';
    }
    return EVENT_TYPE_LABELS[msgType] ?? (msgType ? `${msgType} 事件` : '未知事件');
  }
  if (group.end) {
    const label = group.end.kind === 'line-reply' ? 'LINE 回覆' : 'LINE 推播';
    return group.end.failure ? `${label}失敗` : `${label}記錄`;
  }
  const firstSingle = group.misc.find((r): r is { kind: 'single'; entry: LogEntry } => r.kind === 'single');
  if (firstSingle) return String(firstSingle.entry.msg ?? '背景作業');
  if (group.steps.length > 0) return 'Notion API 批次作業';
  if (group.misc.some((r) => r.kind === 'line-push')) return 'LINE 推播作業';
  return kind === 'system' ? '系統事件' : group.reqId ? '背景作業' : '背景/未關聯事件';
}

function groupUserId(group: FlowGroup): string {
  for (const e of flattenEntries(group)) {
    if (typeof e['userId'] === 'string' && e['userId']) return e['userId'] as string;
  }
  return '';
}

function groupDisplayName(group: FlowGroup): string | null {
  for (const e of flattenEntries(group)) {
    const name = e['targetDisplayName'] ?? e['displayName'];
    if (typeof name === 'string' && name) return name;
  }
  return null;
}

/**
 * 群組 ID——只有 `LOG_LEVEL=debug` 才看得到，來源有兩種：
 * `profile-service.ts` 的除錯訊息直接帶 top-level `groupId`欄位，或是
 * `Processing event detail` 裡完整的 `source` 物件（LINE 的
 * `source.type === 'group'` 時會帶 `groupId`）。`LOG_LEVEL=info` 時兩者都
 * 不存在，回傳空字串是預期行為，不是 bug。
 */
function groupGroupId(group: FlowGroup): string {
  for (const e of flattenEntries(group)) {
    if (typeof e['groupId'] === 'string' && e['groupId']) return e['groupId'] as string;
    const source = e['source'];
    if (source && typeof source === 'object') {
      const gid = (source as Record<string, unknown>)['groupId'];
      if (typeof gid === 'string' && gid) return gid;
    }
  }
  return '';
}

const SCHEDULE_ORIGIN_MARKERS: Array<[string, string]> = [
  ['Starting display name batch update', 'display-name-update'],
  ['Display name update complete', 'display-name-update'],
  ['Display name update failed', 'display-name-update'],
  ['Weekly push complete', 'weekly-push'],
  ['Weekly push aborted', 'weekly-push'],
  ['Weekly push failed', 'weekly-push'],
];

/** 「來自」欄位——訊息事件是指令類型，排程事件是排程檔案名稱，其餘退回一個通用標籤。 */
function groupOrigin(group: FlowGroup, kind: EventKind): string {
  if (kind === 'command') {
    for (const e of flattenEntries(group)) {
      if (e.msg === 'Routing command' && e['command'] && typeof e['command'] === 'object') {
        const type = (e['command'] as Record<string, unknown>)['type'];
        if (typeof type === 'string') return type;
      }
    }
    return '（未知，需要 LOG_LEVEL=debug）';
  }
  if (kind === 'chat') return '自動回覆（非指令）';
  if (kind === 'join') return String(group.start?.['type'] ?? 'memberJoined');
  if (kind === 'system') return 'index.ts 錯誤處理';
  // schedule
  const msgs = new Set(flattenEntries(group).map((e) => String(e.msg ?? '')));
  for (const [marker, slug] of SCHEDULE_ORIGIN_MARKERS) {
    if (msgs.has(marker)) return slug;
  }
  return '排程作業';
}

function groupStatus(group: FlowGroup, kind: EventKind): EventStatus {
  const hasDomainError =
    group.steps.some((s) => !!s.error) ||
    !!group.end?.failure ||
    group.misc.some((m) => m.kind === 'line-push' && !!m.failure);
  if (hasDomainError) return 'error';
  // 看起來像指令、但整個流程從頭到尾沒有送出任何 LINE 回覆——通常代表指令
  // 解析失敗（例如日期格式不符），使用者完全沒收到反應。這種「安靜的
  // 失敗」值得跟真正的錯誤分開標示，方便定期檢查是不是指令說明不夠清楚。
  if (kind === 'command' && !group.end) return 'warn';
  const flat = flattenEntries(group);
  const degradedMsgs = flat.map((e) => String(e.msg ?? '')).filter((m) => m in DEGRADATION_EXPLANATIONS);
  if (degradedMsgs.length > 0) return 'degraded';
  const levels = flat.map(levelNameOf);
  if (levels.some((l) => l === 'error' || l === 'fatal')) return 'error';
  if (levels.some((l) => l === 'warn')) return 'warn';
  return 'ok';
}

/** groupStatus() 判定為 degraded 時，組出詳情頁上方的降級原因說明。 */
function groupDegradedText(group: FlowGroup): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const e of flattenEntries(group)) {
    const msg = String(e.msg ?? '');
    const explanation = DEGRADATION_EXPLANATIONS[msg];
    if (explanation && !seen.has(msg)) {
      seen.add(msg);
      parts.push(`${msg} — ${explanation}`);
    }
  }
  return parts.join('；');
}

function groupFlag(group: FlowGroup): string | null {
  if (group.end?.failure) return 'LINE 回覆失敗';
  if (group.misc.some((m) => m.kind === 'line-push' && m.failure)) return 'LINE 推播失敗';
  if (group.steps.some((s) => !!s.error)) return 'Notion API 失敗';
  const totalRetries = group.steps.reduce((sum, s) => sum + (s.attempts > 1 ? s.attempts - 1 : 0), 0);
  return totalRetries > 0 ? `重試 ${totalRetries} 次` : null;
}

function lineMessagesOf(entry: LogEntry | undefined): string[] | null {
  const messages = entry?.['messages'];
  return Array.isArray(messages) ? messages.map(String) : null;
}

function groupPreview(group: FlowGroup): string {
  if (group.end) {
    if (group.end.failure) {
      return `回覆失敗\n${errorMessageOf(group.end.failure) ?? String(group.end.failure.msg ?? '傳送失敗')}`;
    }
    const messages = lineMessagesOf(group.end.payload);
    if (messages) return messages.join('\n');
    if (group.end.sent) return '回覆已送出（開 LOG_LEVEL=debug 才能看到訊息內容）';
    return '尚無回覆結果記錄';
  }
  const push = group.misc.find((m) => m.kind === 'line-push');
  if (push && push.kind === 'line-push') {
    if (push.failure) {
      return `推播失敗\n${errorMessageOf(push.failure) ?? String(push.failure.msg ?? '傳送失敗')}`;
    }
    const messages = lineMessagesOf(push.payload);
    if (messages) return messages.join('\n');
    if (push.sent) return '推播已送出（開 LOG_LEVEL=debug 才能看到訊息內容）';
  }
  // 沒有 LINE 回覆/推播可用時，用這個流程裡最後一筆通用單行 log（例如排程
  // 作業結束時的摘要 log）當預覽，比固定公式更能反映實際發生了什麼——不用
  // 為新的摘要 log 訊息另外寫規則，通用渲染器的欄位一樣會自動出現。
  const singles = group.misc.filter((r): r is { kind: 'single'; entry: LogEntry } => r.kind === 'single');
  const lastSingle = singles.at(-1)?.entry;
  if (lastSingle) {
    const { level: _level, time: _time, msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } = lastSingle;
    const extraText = Object.entries(extra)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${formatExtraValue(v)}`)
      .join(' · ');
    return extraText ? `${String(msg ?? '')}\n${extraText}` : String(msg ?? '');
  }
  return (
    (group.start ? '事件觸發' : group.reqId ? '(無 Processing event 記錄)' : '背景/未關聯事件') +
    ' → ' +
    group.steps.length +
    ' 次 API 呼叫 → ' +
    (group.end ? 'LINE 回覆' : '(無回覆記錄)')
  );
}

interface BatchStat {
  label: string;
  value: number;
  color: string;
}

/**
 * 排程事件結束時的摘要 log（例如 `Display name update complete` 的
 * `{updated, skipped, failed, total}`、`Weekly push complete` 的
 * `{succeeded, failed, total}`）通用地抓出數字欄位畫成比例條——不特別認識
 * 任何排程的欄位名稱，只要是數字就收，`total` 排除掉（它是其他欄位加總，
 * 畫進去會讓比例條變成一半是重複的），依欄位名稱的關鍵字猜顏色。新增一種
 * 排程摘要 log 不需要改這裡。
 */
function computeBatch(group: FlowGroup, kind: EventKind): BatchStat[] | null {
  if (kind !== 'schedule') return null;
  const singles = group.misc.filter((r): r is { kind: 'single'; entry: LogEntry } => r.kind === 'single');
  const lastSingle = singles.at(-1)?.entry;
  if (!lastSingle) return null;
  const { level: _level, time: _time, msg: _msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } =
    lastSingle;
  const stats: BatchStat[] = [];
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || key.toLowerCase() === 'total') continue;
    const color = /fail|error/i.test(key) ? '#e0807f' : /success|succeed|updated|sent|complete/i.test(key) ? '#7fb894' : '#595d6c';
    stats.push({ label: key, value, color });
  }
  return stats.length >= 2 ? stats : null;
}

// 每個字串欄位都會被直接塞進 HTML，產生這個物件的函式自己要先呼叫
// escapeHtml()——這裡不會再做一次跳脫。
interface TimelineStep {
  levelName: string;
  color: string;
  endpointLabel: string;
  title: string;
  path: string;
  duration: string;
  note: string;
  noteTitle: string;
  noteTone?: 'warn' | 'error';
  detailText: string;
  body: string;
  bodyLabel: string;
}

/**
 * 起點 step（「收到訊息」）的展開內容——跟 note 欄位只挑幾個欄位摘要不同，
 * 這裡把 group.start（Processing event）/group.startDetail（Processing event
 * detail，debug 等級才有）的完整原始內容都印出來，尤其是 note 沒有顯示的
 * source/message 完整物件。level/time/msg/reqId/pid/hostname 這些欄位在其他
 * 地方（timestamp、log level 顏色等）已經看得到，這裡剔除掉避免重複雜訊。
 */
function startEventDetail(group: FlowGroup): string {
  const parts: string[] = [];
  if (group.start) {
    const { level: _level, time: _time, msg: _msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } = group.start;
    parts.push(detailJsonSection('Processing event', extra));
  }
  if (group.startDetail) {
    const { level: _level, time: _time, msg: _msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } = group.startDetail;
    parts.push(detailJsonSection('Processing event detail（來源與訊息內容）', extra));
  } else {
    parts.push(detailTextLine('開 LOG_LEVEL=debug 才能看到完整 webhook event 內容（來源與訊息內容）'));
  }
  return parts.join('');
}

function startStepTimeline(group: FlowGroup): TimelineStep {
  const entry = group.start!;
  const levelName = levelNameOf(entry);
  const msgType = String(entry['type'] ?? '');
  const srcType = groupSourceType(group);
  const content = msgType === 'message' && group.startDetail ? messageLabel(group.startDetail['message']) : '';
  const parts: string[] = [];
  if (msgType === 'message') {
    parts.push(content ? `「${content}」` : '開 LOG_LEVEL=debug 才能看到指令內容');
  }
  if (msgType) parts.push(msgType);
  if (srcType) parts.push(SOURCE_LABELS[srcType] ?? srcType);
  // webhookEventId 只是拿去跟 LINE 後台/客服對照用的識別碼，沒有語意，跟
  // 其他描述性資訊放在同一行、不特別強調；舊格式的 log（這次改動之前寫的）
  // 沒有這個欄位，就單純不顯示，不是解析失敗。
  const webhookEventId = entry['webhookEventId'];
  if (typeof webhookEventId === 'string' && webhookEventId) {
    parts.push(`webhookEventId: ${webhookEventId}`);
  }
  // isRedelivery 平常幾乎都是 false，沒有資訊價值；只有 true（LINE 重送了
  // 同一筆事件）才值得跳出來讓人注意，所以只在這個情況才加進 note，並且
  // 把整行提升成跟「尚無回應記錄」同一種 warn 色塊，跟這個頁面其他「只在
  // 異常時才顯示」的慣例（flag／degraded 那些欄位）一致。
  const isRedelivery = entry['isRedelivery'] === true;
  if (isRedelivery) {
    parts.push('LINE 重送這筆事件（isRedelivery）');
  }
  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    endpointLabel: '起點',
    title: '收到訊息',
    path: '',
    duration: '',
    note: escapeHtml(parts.join(' · ')),
    noteTitle: '',
    noteTone: isRedelivery ? 'warn' : undefined,
    detailText: startEventDetail(group),
    body: '',
    bodyLabel: '',
  };
}

function notionStepTimeline(row: NotionCallRow): TimelineStep {
  const levelName = LEVEL_NAMES[row.error?.level ?? row.response?.level ?? row.request.level ?? 30] ?? 'info';
  const retrySuffix = row.attempts > 1 ? ` · 重試 ${row.attempts - 1} 次` : '';
  const durationMs = row.response?.['durationMs'] ?? row.error?.['durationMs'];
  let note = '';
  let noteTone: 'warn' | 'error' | undefined;
  if (row.error) {
    const status = row.error['status'];
    note = 'Notion API 呼叫失敗' + (typeof status === 'number' ? ` · HTTP ${status}` : '');
    noteTone = 'error';
  } else if (!row.response) {
    note = '尚無回應記錄';
    noteTone = 'warn';
  }
  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    endpointLabel: '',
    title: (row.purpose ? escapeHtml(row.purpose) : 'Notion API 呼叫') + retrySuffix,
    path: escapeHtml(`${row.method} ${row.path}`),
    duration: typeof durationMs === 'number' ? formatDuration(durationMs) : '',
    note,
    noteTitle: '',
    noteTone,
    detailText: notionCallDetail(row),
    body: '',
    bodyLabel: '',
  };
}

function lineStepTimeline(row: LineSendRow, isEndpoint: boolean): TimelineStep {
  const levelName = LEVEL_NAMES[row.failure?.level ?? row.sent?.level ?? row.start.level ?? 30] ?? 'info';
  const kindLabel = row.kind === 'line-reply' ? 'LINE 回覆' : 'LINE 推播';
  const messages = lineMessagesOf(row.payload);
  const endTime = row.failure?.time ?? row.sent?.time;
  const duration =
    typeof endTime === 'number' && typeof row.start.time === 'number' ? formatDuration(endTime - row.start.time) : '';

  let title: string;
  let note = '';
  let noteTone: 'error' | undefined;
  let body = '';
  let bodyLabel = '';
  if (row.failure) {
    title = `${kindLabel}失敗`;
    note = errorMessageOf(row.failure) ?? String(row.failure['msg'] ?? '傳送失敗');
    noteTone = 'error';
    bodyLabel = '這則訊息沒有送出';
    if (messages) body = messages.join('\n');
  } else if (row.sent) {
    title = `${kindLabel}已送出`;
    if (messages) {
      bodyLabel = row.kind === 'line-reply' ? 'Dobby 送給使用者的訊息' : 'Dobby 推播的訊息';
      body = messages.join('\n');
    } else {
      note = '開 LOG_LEVEL=debug 才能看到訊息內容';
    }
  } else {
    title = `${kindLabel}處理中`;
    note = '尚無送出結果記錄';
  }

  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    endpointLabel: isEndpoint ? '終點' : '',
    title,
    path: escapeHtml(`${row.method} ${row.path}`),
    duration,
    note: escapeHtml(note),
    noteTitle: '',
    noteTone,
    detailText: lineSendDetail(row),
    body: escapeHtml(body),
    bodyLabel,
  };
}

function singleStepTimeline(entry: LogEntry): TimelineStep {
  const levelName = levelNameOf(entry);
  const { level: _level, time: _time, msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } = entry;
  const pairs = Object.entries(extra).filter(([, v]) => v !== null && v !== undefined);
  const fullNote = pairs.map(([k, v]) => `${k}: ${formatExtraValue(v)}`).join(' · ');
  const shownNote = pairs.map(([k, v]) => `${k}: ${truncate(formatExtraValue(v), EXTRA_VALUE_MAX_LEN)}`).join(' · ');
  return {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    endpointLabel: '',
    title: escapeHtml(String(msg ?? '')),
    path: '',
    duration: '',
    note: escapeHtml(shownNote),
    noteTitle: escapeHtml(fullNote),
    detailText: '',
    body: '',
    bodyLabel: '',
  };
}

function buildTimeline(group: FlowGroup): TimelineStep[] {
  const middleRows: DisplayRow[] = [...group.steps, ...group.misc]
    .map((row) => ({ row, t: representativeTime(row) }))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.row);

  const steps: TimelineStep[] = [];
  if (group.start) steps.push(startStepTimeline(group));
  for (const row of middleRows) {
    switch (row.kind) {
      case 'notion-call':
        steps.push(notionStepTimeline(row));
        break;
      case 'line-reply':
      case 'line-push':
        steps.push(lineStepTimeline(row, false));
        break;
      case 'single':
        steps.push(singleStepTimeline(row.entry));
        break;
    }
  }
  if (group.end) steps.push(lineStepTimeline(group.end, true));
  return steps;
}

function maskId(id: string): string {
  if (!id) return '';
  if (id.length <= 9) return '●'.repeat(id.length);
  return `${id.slice(0, 5)}●●●●●●${id.slice(-3)}`;
}

interface EventView {
  key: string;
  reqId: string;
  timeMs: number;
  time: string;
  stamp: string;
  kind: EventKind;
  kindLabel: string;
  kindCss: string;
  title: string;
  hasWho: boolean;
  name: string | null;
  userIdRaw: string;
  groupIdRaw: string;
  source: string;
  origin: string;
  status: EventStatus;
  statusLabel: string;
  flag: string | null;
  preview: string;
  degradedText: string;
  batch: BatchStat[] | null;
  stepsHeading: string;
  durationText: string;
  searchText: string;
  rawEntries: LogEntry[];
  steps: TimelineStep[];
}

const STEPS_HEADING_BY_KIND: Partial<Record<EventKind, string>> = { schedule: '執行過程', system: '發生了什麼' };

function buildEventView(group: FlowGroup, rawEntries: LogEntry[]): EventView {
  const times = flattenEntries(group)
    .map((e) => e.time ?? 0)
    .filter((t) => t > 0);
  const first = times.length > 0 ? Math.min(...times) : group.firstTime;
  const last = times.length > 0 ? Math.max(...times) : group.firstTime;
  const kind = groupKind(group);
  const status = groupStatus(group, kind);
  const title = groupTitle(group, kind);
  const preview = groupPreview(group);
  const name = groupDisplayName(group);
  const userIdRaw = groupUserId(group);
  const groupIdRaw = groupGroupId(group);
  const origin = groupOrigin(group, kind);
  const source = groupSource(group, kind);

  return {
    key: group.reqId || 'noreq',
    reqId: group.reqId,
    timeMs: first,
    time: taipeiTimeOnlyFormatter.format(new Date(first)),
    stamp: formatTime(first),
    kind,
    kindLabel: KIND_META[kind].label,
    kindCss: KIND_META[kind].css,
    title,
    hasWho: !!userIdRaw,
    name,
    userIdRaw,
    groupIdRaw,
    source,
    origin,
    status,
    statusLabel: STATUS_LABELS[status],
    flag: groupFlag(group),
    preview,
    degradedText: status === 'degraded' ? groupDegradedText(group) : '',
    batch: computeBatch(group, kind),
    stepsHeading: STEPS_HEADING_BY_KIND[kind] ?? '處理過程',
    durationText: formatDuration(last - first),
    searchText: [title, preview, group.reqId, name ?? '', userIdRaw, origin]
      .join(' ')
      .toLowerCase(),
    rawEntries,
    steps: buildTimeline(group),
  };
}

/**
 * 已知、會落進「系統」分類（沒有 reqId、非伺服器生命週期訊息）的具體訊息
 * 對照表——跟 `SCHEDULE_ORIGIN_MARKERS` 同一套「已知訊息對照表＋通用
 * fallback」模式。不要假設掉進這個分類的訊息一定是錯誤：webhook 一次收到
 * 多筆事件是正常、預期內的情況，只是少見；簽章驗證失敗才是真正的異常。
 *
 * `source`（列表卡片跟詳情頁的「來源」）也要逐筆寫：不是每一筆系統事件都
 * 來自 HTTP 層，例如 R2 未設定的提示是啟動時記的，寫死成 `POST /webhook`
 * 會跟「來自：log-upload.ts」互相矛盾。
 */
type SystemEventInfo = { origin: string; source: string; stepsHeading: string };
const SYSTEM_EVENT_INFO: Record<string, SystemEventInfo> = {
  'LINE signature validation failed': { origin: 'index.ts 錯誤處理', source: 'HTTP · POST /webhook', stepsHeading: '發生了什麼' },
  'Webhook received multiple events': { origin: 'webhook.ts（事件批次提示，非錯誤）', source: 'HTTP · POST /webhook', stepsHeading: '說明' },
  'R2 not configured, log sync disabled': { origin: 'log-upload.ts（R2 未設定，啟動時提示一次，非錯誤）', source: '啟動 · log-upload.ts', stepsHeading: '說明' },
};
// fallback 的 source 維持原本的 `HTTP · POST /webhook`：沒有 reqId 的訊息
// 目前多半來自 HTTP 層（reqId 在 webhook 事件處理時才產生，比它早發生的
// 錯誤都沒有 reqId），而且這就是加上逐筆 source 之前的既有行為，未知訊息
// 不因這次修改而改變顯示。「來自」已經標成「（未知系統來源）」，看得出
// 這是猜測。
const SYSTEM_EVENT_FALLBACK: SystemEventInfo = { origin: '（未知系統來源）', source: 'HTTP · POST /webhook', stepsHeading: '發生了什麼' };

/** 沒有配對到任何 reqId、也不是伺服器生命週期訊息的單行 log（例如 LINE 簽章驗證失敗、webhook 一次收到多筆事件）——每一筆各自變成一個獨立的「系統」事件，不跟別的無 reqId 訊息合併。 */
function buildSystemEventView(entry: LogEntry, index: number): EventView {
  const levelName = levelNameOf(entry);
  const msg = String(entry.msg ?? '系統事件');
  const { origin, source, stepsHeading } = SYSTEM_EVENT_INFO[msg] ?? SYSTEM_EVENT_FALLBACK;
  const { level: _level, time: _time, msg: _msg, reqId: _reqId, pid: _pid, hostname: _hostname, ...extra } = entry;
  const pairs = Object.entries(extra).filter(([, v]) => v !== null && v !== undefined);
  const noteText = pairs.map(([k, v]) => `${k}: ${formatExtraValue(v)}`).join(' · ');
  const status: EventStatus = levelName === 'error' || levelName === 'fatal' ? 'error' : levelName === 'warn' ? 'warn' : 'ok';
  const step: TimelineStep = {
    levelName,
    color: LEVEL_COLORS[levelName] ?? '#94a3b8',
    endpointLabel: '',
    title: escapeHtml(msg),
    path: '',
    duration: '',
    note: escapeHtml(noteText),
    noteTitle: '',
    noteTone: status === 'error' ? 'error' : status === 'warn' ? 'warn' : undefined,
    detailText: '',
    body: '',
    bodyLabel: '',
  };
  return {
    key: `sys-${index}`,
    reqId: '',
    timeMs: entry.time ?? 0,
    time: taipeiTimeOnlyFormatter.format(new Date(entry.time ?? 0)),
    stamp: formatTime(entry.time ?? 0),
    kind: 'system',
    kindLabel: KIND_META.system.label,
    kindCss: KIND_META.system.css,
    title: msg,
    hasWho: false,
    name: null,
    userIdRaw: '',
    groupIdRaw: '',
    source,
    origin,
    status,
    statusLabel: STATUS_LABELS[status],
    flag: null,
    preview: noteText || msg,
    degradedText: '',
    batch: null,
    stepsHeading,
    durationText: '—',
    searchText: `${msg} ${noteText}`.toLowerCase(),
    rawEntries: [entry],
    steps: [step],
  };
}

interface BoundaryMarker {
  timeMs: number;
  label: string;
  meta: string;
  time: string;
}

/**
 * 伺服器重啟的分隔線——用「Server started」往回找最近一次的關閉訊號
 * （signal），拼成「SIGTERM · port 3000」這種摘要。找不到對應的關閉訊號
 * 就只顯示 port（例如這是這批日誌裡第一次看到的啟動，關閉訊號在保留期
 * 外）。這些訊息完全沒有 reqId，純粹是時間軸上的參考點，不是可以點開的
 * 事件，所以不會變成 EventView。
 */
function buildBoundaryMarkers(lifecycleEntries: LogEntry[]): BoundaryMarker[] {
  const sorted = [...lifecycleEntries].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  const markers: BoundaryMarker[] = [];
  let lastSignal = '';
  for (const e of sorted) {
    if (e.msg === 'Received shutdown signal, closing server' && typeof e['signal'] === 'string') {
      lastSignal = e['signal'];
    } else if (e.msg === 'Server started') {
      const port = e['port'];
      const meta = [lastSignal, typeof port !== 'undefined' ? `port ${String(port)}` : ''].filter(Boolean).join(' · ');
      markers.push({ timeMs: e.time ?? 0, label: '服務重新啟動', meta, time: taipeiTimeOnlyFormatter.format(new Date(e.time ?? 0)) });
      lastSignal = '';
    }
  }
  return markers;
}

function eventListItemHtml(ev: EventView, boundary: BoundaryMarker | undefined): string {
  const boundaryHtml = boundary
    ? `<div class="ev-boundary"><span class="ev-boundary-icon">⏻</span><span class="ev-boundary-label">${escapeHtml(boundary.label)}</span><span class="ev-boundary-meta">${escapeHtml(boundary.meta)}</span><span class="ev-boundary-time">${escapeHtml(boundary.time)}</span></div>`
    : '';
  const whoHtml = ev.hasWho
    ? `<div class="ev-item-meta">${ev.name ? `<span class="ev-name">${escapeHtml(ev.name)}</span>` : ''}<span class="ev-userid"><span class="id-masked">${escapeHtml(maskId(ev.userIdRaw))}</span><span class="id-plain">${escapeHtml(ev.userIdRaw)}</span></span></div>`
    : '';
  const flagHtml = ev.flag
    ? `<span class="ev-flag ev-flag-${ev.status}">${escapeHtml(ev.flag)}</span>`
    : '';
  const previewLine = escapeHtml(ev.preview.split('\n').filter(Boolean).join(' · '));

  return `${boundaryHtml}
  <div class="ev-item" data-key="${escapeHtml(ev.key)}" data-status="${ev.status}" data-bucket="${KIND_META[ev.kind].bucket}" data-search="${escapeHtml(ev.searchText)}" onclick="selectEvent('${escapeHtml(ev.key)}')">
    <div class="ev-item-top">
      <span class="ev-dot" style="background:${STATUS_COLORS[ev.status]}"></span>
      <span class="ev-kind" style="${ev.kindCss}">${escapeHtml(ev.kindLabel)}</span>
      <span class="ev-title">${escapeHtml(ev.title)}</span>
      <span class="ev-time">${escapeHtml(ev.time)}</span>
    </div>
    <div class="ev-item-body">
      ${whoHtml}
      <div class="ev-preview ev-preview-${ev.status}">${previewLine}</div>
      <div class="ev-item-tags">
        <span class="ev-source">${escapeHtml(ev.source)}</span>
        <span class="ev-duration">${escapeHtml(ev.durationText)}</span>
        ${flagHtml}
      </div>
    </div>
  </div>`;
}

function timelineStepHtml(step: TimelineStep, isLast: boolean): string {
  const endpointTag = step.endpointLabel
    ? `<span class="tl-endpoint-tag">${escapeHtml(step.endpointLabel)}</span>`
    : '';
  const pathHtml = step.path ? `<span class="tl-path">${step.path}</span>` : '';
  const durationHtml = step.duration ? `<span class="tl-duration">${escapeHtml(step.duration)}</span>` : '';
  const noteClass = step.noteTone ? ` tl-note-${step.noteTone}` : '';
  const noteTitleAttr = step.noteTitle ? ` title="${step.noteTitle}"` : '';
  const noteHtml = step.note ? `<div class="tl-note${noteClass}"${noteTitleAttr}>${step.note}</div>` : '';
  const bodyHtml = step.body
    ? `<div class="tl-body-wrap"><span class="tl-body-label">${escapeHtml(step.bodyLabel)}</span><div class="tl-body">${step.body}</div></div>`
    : '';
  const detailHtml = step.detailText
    ? `<div class="tl-detail" onclick="event.stopPropagation()">${step.detailText}</div>`
    : '';
  const clickable = step.detailText ? ` onclick="this.classList.toggle('expanded')"` : '';
  const titleStyleAttr =
    step.levelName === 'error' || step.levelName === 'fatal' ? ` style="color:${LEVEL_COLORS[step.levelName]}"` : '';

  return `
    <div class="tl-row">
      <div class="tl-rail"><span class="tl-dot" style="background:${step.color}"></span>${isLast ? '' : '<span class="tl-line"></span>'}</div>
      <div class="tl-content${step.detailText ? ' tl-expandable' : ''}"${clickable}>
        <div class="tl-headline">
          ${endpointTag}
          <span class="tl-title"${titleStyleAttr}>${step.title}</span>
          ${pathHtml}
          ${durationHtml}
        </div>
        ${noteHtml}
        ${bodyHtml}
        ${detailHtml}
      </div>
    </div>`;
}

function eventDetailHtml(ev: EventView, active: boolean): string {
  const whoHtml = ev.hasWho
    ? `<div class="detail-field">
          <span class="detail-field-label">使用者</span>
          <span class="detail-field-value">${ev.name ? `<span class="sel-name">${escapeHtml(ev.name)}</span>` : ''}<span class="detail-userid"><span class="id-masked">${escapeHtml(maskId(ev.userIdRaw))}</span><span class="id-plain">${escapeHtml(ev.userIdRaw)}</span></span> <span class="reveal-link" onclick="toggleMask()"><span class="id-masked">顯示</span><span class="id-plain">遮蔽</span></span></span>
        </div>`
    : '';
  const groupHtml = ev.groupIdRaw
    ? `<div class="detail-field"><span class="detail-field-label">群組 ID</span><span class="detail-field-value"><span class="detail-userid"><span class="id-masked">${escapeHtml(maskId(ev.groupIdRaw))}</span><span class="id-plain">${escapeHtml(ev.groupIdRaw)}</span></span></span></div>`
    : '';
  const degradedHtml = ev.degradedText
    ? `<div class="degraded-banner"><span class="degraded-banner-label">仍有回覆，但過程降級</span><span class="degraded-banner-text">${escapeHtml(ev.degradedText)}</span></div>`
    : '';
  const batchHtml = ev.batch
    ? (() => {
        const total = ev.batch!.reduce((a, b) => a + b.value, 0);
        const bars = ev.batch!.map((b) => `<span style="height:7px;border-radius:2px;flex:${Math.max(b.value, 0)} 1 0;background:${b.color}"></span>`).join('');
        const stats = ev.batch!
          .map(
            (b) =>
              `<span class="batch-stat"><span class="batch-swatch" style="background:${b.color}"></span><span class="batch-stat-label">${escapeHtml(b.label)}</span><span class="batch-stat-value">${b.value} / ${total}</span></span>`
          )
          .join('');
        return `<div class="batch-section"><div class="detail-section-label">批次結果</div><div class="batch-bars">${bars}</div><div class="batch-stats">${stats}</div></div>`;
      })()
    : '';
  const stepsHtml = ev.steps.length > 0
    ? ev.steps.map((s, i) => timelineStepHtml(s, i === ev.steps.length - 1)).join('')
    : '<div class="tl-empty">沒有可顯示的處理步驟</div>';
  const rawJsonText = escapeHtml(JSON.stringify(ev.rawEntries, null, 2));

  return `
  <div class="ev-detail${active ? ' active' : ''}" id="detail-${escapeHtml(ev.key)}">
    <div class="detail-header">
      <div class="detail-title-row">
        <span class="ev-kind" style="${ev.kindCss}">${escapeHtml(ev.kindLabel)}</span>
        <span class="detail-title">${escapeHtml(ev.title)}</span>
        <span class="detail-status" style="color:${STATUS_COLORS[ev.status]};border-color:${STATUS_COLORS[ev.status]}">${escapeHtml(ev.statusLabel)}</span>
        <span class="detail-reqid">${escapeHtml(ev.reqId || '（無 reqId）')}</span>
      </div>
      ${degradedHtml}
      <div class="detail-fields-rows">
        <div class="detail-fields">
          <div class="detail-field"><span class="detail-field-label">時間</span><span class="detail-field-value">${escapeHtml(ev.stamp)}</span></div>
          <div class="detail-field"><span class="detail-field-label">總耗時</span><span class="detail-field-value">${escapeHtml(ev.durationText)}</span></div>
          <div class="detail-field"><span class="detail-field-label">來自</span><span class="detail-field-value">${escapeHtml(ev.origin)}</span></div>
        </div>
        <div class="detail-fields">
          <div class="detail-field"><span class="detail-field-label">來源</span><span class="detail-field-value">${escapeHtml(ev.source)}</span></div>
          ${groupHtml}
          ${whoHtml}
        </div>
      </div>
    </div>
    ${batchHtml}
    <div class="detail-body">
      <div class="detail-section-label">${escapeHtml(ev.stepsHeading)}</div>
      <div class="timeline">${stepsHtml}</div>
    </div>
    <div class="detail-footer">
      <button onclick="document.getElementById('raw-${escapeHtml(ev.key)}').classList.toggle('hidden')">看這筆的原始 log</button>
      <button onclick="copyRawJson('${escapeHtml(ev.key)}', this)">複製 JSON</button>
    </div>
    <div class="raw-json hidden" id="raw-${escapeHtml(ev.key)}">
      <!-- json-tree 收合節點的「… N 個欄位」提示文字只是 CSS display:none 藏起來，不是真的
           從 DOM 移除，複製功能需要一份不受收合影響、乾淨的原始文字來源，所以另外保留這個
           永遠隱藏的 pre。 -->
      <pre class="raw-json-copy-source" style="display:none">${rawJsonText}</pre>
      ${jsonTreeHtml(ev.rawEntries)}
    </div>
  </div>`;
}

function bucketRawEntries(entries: LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const key = typeof e.reqId === 'string' ? e.reqId : '';
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(e);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
  return map;
}

function renderHtml(entries: LogEntry[]): string {
  const levelBadgeHtml = logLevelBadgeHtml(getLogLevel());
  const r2BadgeHtml = r2SyncBadgeHtml(getR2SyncStatus());
  // 排程（weekly-push/display-name-update）現在也各自用 runWithContext 包住整
  // 次執行，所以真的完全沒有 reqId 的只剩伺服器生命週期訊息跟少數 HTTP 層級
  // 的錯誤（例如 LINE 簽章驗證失敗，在 webhook 事件處理、也就是 reqId 產生
  // 之前就發生）。這兩種不能沿用 groupPairedEntries 的「沒有 reqId 就併成同
  // 一組」規則——生命週期訊息要配對成分隔線，其餘的每一筆各自是獨立事件。
  const reqIdEntries = entries.filter((e) => typeof e.reqId === 'string' && e.reqId);
  const noReqIdEntries = entries.filter((e) => !(typeof e.reqId === 'string' && e.reqId));
  const lifecycleEntries = noReqIdEntries.filter((e) => LIFECYCLE_MESSAGES.has(String(e.msg ?? '')));
  const systemEntries = noReqIdEntries.filter((e) => !LIFECYCLE_MESSAGES.has(String(e.msg ?? '')));

  const displayRows = groupPairedEntries(reqIdEntries);
  const groups = buildFlowGroups(displayRows);
  const rawByReqId = bucketRawEntries(reqIdEntries);

  const events = [
    ...groups.map((g) => buildEventView(g, rawByReqId.get(g.reqId) ?? [])),
    ...systemEntries.map((e, i) => buildSystemEventView(e, i)),
  ].sort((a, b) => b.timeMs - a.timeMs);
  // 由新到舊排序，跟 events 的排序方向一致，才能一起往下掃描配對。
  const boundaries = buildBoundaryMarkers(lifecycleEntries).sort((a, b) => b.timeMs - a.timeMs);

  const totalCount = events.length;
  const errorCount = events.filter((e) => e.status !== 'ok').length;

  // 分隔線依時間插在正確位置——比它晚的事件顯示在它上面，第一個比它舊的
  // 事件顯示在它下面。同一個空隙裡有兩個以上分隔線只顯示最新的一個（連續
  // 重啟很少見，不值得為這個邊角案例加複雜度）；比目前列出的所有事件都舊
  // 的分隔線，顯示在列表最後面。
  let boundaryIdx = 0;
  const listHtml = events
    .map((ev) => {
      let boundary: BoundaryMarker | undefined;
      while (boundaryIdx < boundaries.length && boundaries[boundaryIdx]!.timeMs >= ev.timeMs) {
        boundary ??= boundaries[boundaryIdx];
        boundaryIdx++;
      }
      return eventListItemHtml(ev, boundary);
    })
    .join('');
  const trailingBoundary = boundaries[boundaryIdx];
  const trailingBoundaryHtml = trailingBoundary
    ? `<div class="ev-boundary"><span class="ev-boundary-icon">⏻</span><span class="ev-boundary-label">${escapeHtml(trailingBoundary.label)}</span><span class="ev-boundary-meta">${escapeHtml(trailingBoundary.meta)}</span><span class="ev-boundary-time">${escapeHtml(trailingBoundary.time)}</span></div>`
    : '';
  const detailHtml = events.map((ev, i) => eventDetailHtml(ev, i === 0)).join('');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dobby — Logs</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body { font-family: -apple-system, 'Segoe UI', system-ui, sans-serif; background: #14151f; color: #e7e7ee; }
    body.masked .id-plain { display: none; }
    body:not(.masked) .id-masked { display: none; }

    #app { display: flex; flex-direction: column; height: 100vh; min-height: 620px; }

    header { display: flex; align-items: center; gap: 14px; padding: 12px 24px; border-bottom: 1px solid #262835; flex: none; }
    header h1 { font-size: 14px; font-weight: 500; }
    .divider { width: 1px; height: 16px; background: #262835; }
    .count { font-size: 12px; color: #8b8fa3; }
    .count-err { font-size: 12px; font-weight: 500; color: #e0807f; }
    #search { margin-left: auto; background: #0e0f18; border: 1px solid #262835; border-radius: 8px; color: #e7e7ee; font-size: 12px; padding: 7px 11px; width: 250px; outline: none; }
    #search:focus { border-color: #7c72c4; }
    button { cursor: pointer; font-family: inherit; }
    #mask-btn { font-size: 12px; font-weight: 500; border-radius: 8px; padding: 7px 12px; color: #d2cefd; border: 1px solid #5d5294; background: #201c33; }
    #refresh-btn { font-size: 12px; color: #8b8fa3; background: transparent; border: 1px solid #262835; border-radius: 8px; padding: 7px 12px; }
    .level-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500; font-family: ui-monospace, monospace; border-radius: 4px; padding: 5px 9px; flex: none; }
    .level-badge-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }

    main { display: grid; grid-template-columns: 400px 1fr; flex: 1 1 auto; min-height: 0; }

    #ev-list-pane { border-right: 1px solid #262835; display: flex; flex-direction: column; min-height: 0; }
    .tabs { display: flex; gap: 6px; padding: 8px 24px; border-bottom: 1px solid #1c1d29; flex: none; }
    .tab-btn { font-size: 11.5px; background: transparent; border: 1px solid #262835; border-radius: 4px; padding: 6px 11px; color: #8b8fa3; }
    .tab-btn.active { background: #b5abfc; border-color: #b5abfc; color: #14151f; font-weight: 500; }

    #ev-list { overflow-y: auto; flex: 1 1 auto; min-height: 0; }
    .ev-item { cursor: pointer; padding: 13px 16px; border-bottom: 1px solid #1c1d29; border-left: 3px solid transparent; }
    .ev-item.active { border-left-color: #b5abfc; background: #1c1c2c; }
    .ev-item.hidden { display: none; }
    .ev-item-top { display: flex; align-items: baseline; gap: 8px; margin-bottom: 5px; }
    .ev-dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
    .ev-kind { flex: none; font-size: 10px; font-weight: 500; letter-spacing: .06em; border-radius: 4px; padding: 4px 6px; }
    .ev-title { font-size: 13px; font-weight: 500; flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ev-time { flex: none; font: 11px ui-monospace, monospace; color: #8b8fa3; font-variant-numeric: tabular-nums; }
    .ev-item-body { padding-left: 14px; display: flex; flex-direction: column; gap: 5px; }
    .ev-item-meta { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
    .ev-name { font-size: 11.5px; font-weight: 500; color: #c6c9d6; }
    .ev-userid { font: 11px ui-monospace, monospace; color: #8b8fa3; word-break: break-all; }
    .ev-preview { font-size: 12px; color: #8b8fa3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ev-preview-degraded { color: #d3a35c; }
    .ev-preview-warn { color: #d3a35c; }
    .ev-preview-error { color: #e0807f; }
    .ev-item-tags { display: flex; gap: 9px; flex-wrap: wrap; align-items: center; }
    .ev-source { font-size: 11px; color: #8b8fa3; }
    .ev-duration { font: 11px ui-monospace, monospace; color: #8b8fa3; }
    .ev-flag { font-size: 11px; font-weight: 500; }
    .ev-flag-warn { color: #d3a35c; }
    .ev-flag-error { color: #e0807f; }
    #ev-list-empty { display: none; padding: 40px 20px; text-align: center; font-size: 12.5px; color: #595d6c; }

    .ev-boundary { display: flex; align-items: center; gap: 9px; padding: 12px 16px; background: #12131d; border-top: 1px solid #262835; border-bottom: 1px solid #262835; }
    .ev-boundary-icon { font-size: 12px; color: #d2cefd; }
    .ev-boundary-label { flex: none; font-size: 11.5px; font-weight: 500; color: #d2cefd; letter-spacing: .04em; white-space: nowrap; }
    .ev-boundary-meta { flex: 1 1 auto; min-width: 0; font: 11px ui-monospace, monospace; color: #8b8fa3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ev-boundary-time { font: 11px ui-monospace, monospace; color: #8b8fa3; font-variant-numeric: tabular-nums; }

    #detail-pane { display: flex; flex-direction: column; min-height: 0; overflow-y: auto; }
    .ev-detail { display: none; flex-direction: column; min-height: 0; }
    .ev-detail.active { display: flex; }

    .detail-header { padding: 22px 22px 14px; border-bottom: 1px solid #1c1d29; flex: none; }
    .detail-title-row { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
    .detail-title { font-size: 17px; font-weight: 500; }
    .detail-status { font-size: 11px; font-weight: 500; border-radius: 4px; padding: 5px 9px; border: 1px solid; }
    .detail-reqid { margin-left: auto; font: 11.5px ui-monospace, monospace; color: #8b8fa3; }
    .degraded-banner { margin-bottom: 13px; display: flex; align-items: flex-start; gap: 9px; background: #2c2519; border: 1px solid #5c4c2c; border-radius: 8px; padding: 10px 13px; }
    .degraded-banner-label { font-size: 11px; font-weight: 500; color: #d3a35c; flex: none; }
    .degraded-banner-text { font-size: 12px; color: #c6c9d6; line-height: 1.5; }
    .detail-fields-rows { display: flex; flex-direction: column; gap: 12px; }
    .detail-fields { display: flex; flex-wrap: wrap; gap: 12px 28px; }
    .detail-field { display: flex; flex-direction: column; gap: 4px; }
    .detail-field-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #8b8fa3; }
    .detail-field-value { font-size: 12.5px; color: #c6c9d6; }
    .detail-userid { font: 12.5px ui-monospace, monospace; color: #b2b6ca; margin-left: 7px; }
    .sel-name { font-weight: 500; }
    .reveal-link { margin-left: 7px; font-size: 11.5px; color: #d2cefd; cursor: pointer; }

    .detail-body { padding: 22px; flex: 1 1 auto; }
    .detail-section-label { font-size: 10px; font-weight: 500; letter-spacing: .12em; text-transform: uppercase; color: #8b8fa3; margin-bottom: 16px; }

    .batch-section { padding: 22px 22px 0; }
    .batch-bars { display: flex; gap: 3px; margin-bottom: 11px; max-width: 560px; }
    .batch-stats { display: flex; gap: 22px; flex-wrap: wrap; }
    .batch-stat { display: flex; align-items: baseline; gap: 7px; }
    .batch-swatch { width: 8px; height: 8px; border-radius: 2px; flex: none; }
    .batch-stat-label { font-size: 12px; color: #b2b6ca; }
    .batch-stat-value { font: 500 13px ui-monospace, monospace; color: #c6c9d6; font-variant-numeric: tabular-nums; }

    .timeline { display: flex; flex-direction: column; }
    .tl-row { display: grid; grid-template-columns: 14px 1fr; column-gap: 14px; }
    .tl-rail { display: flex; flex-direction: column; align-items: center; }
    .tl-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; }
    .tl-line { width: 1px; flex: 1 1 auto; background: #1c1d29; }
    .tl-content { padding-bottom: 18px; min-width: 0; }
    .tl-expandable { cursor: pointer; }
    .tl-headline { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .tl-endpoint-tag { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #8b8fa3; }
    .tl-title { font-size: 13px; color: #c6c9d6; }
    .tl-path { font: 11px ui-monospace, monospace; color: #8b8fa3; word-break: break-all; }
    .tl-duration { margin-left: auto; font: 11.5px ui-monospace, monospace; color: #8b8fa3; font-variant-numeric: tabular-nums; flex: none; }
    .tl-note { margin-top: 4px; font-size: 12.5px; color: #8b8fa3; }
    .tl-note-warn { margin-top: 8px; background: #2c2519; border: 1px solid #5c4c2c; border-radius: 8px; padding: 9px 12px; color: #d3a35c; }
    .tl-note-error { margin-top: 8px; background: #2c1d20; border: 1px solid #6b3a3a; border-radius: 8px; padding: 9px 12px; color: #e0807f; }
    .tl-body-wrap { margin-top: 11px; display: flex; flex-direction: column; gap: 6px; max-width: 560px; }
    .tl-body-label { font-size: 10.5px; font-weight: 500; letter-spacing: .08em; color: #d2cefd; }
    .tl-body { background: #201c33; border: 1px solid #5d5294; border-radius: 4px 14px 14px 14px; padding: 13px 16px; font-size: 13px; line-height: 1.8; color: #e4e4ea; white-space: pre-line; }
    .tl-detail { display: none; margin-top: 8px; padding: 10px 14px; background: #0e0f18; border-radius: 8px; font-size: 12px; }
    .tl-content.expanded .tl-detail { display: block; }
    .tl-detail-text, .tl-detail-section { margin-top: 8px; }
    .tl-detail-text:first-child, .tl-detail-section:first-child { margin-top: 0; }
    .tl-detail-text { color: #8b8fa3; white-space: pre-wrap; word-break: break-all; }
    .tl-detail-label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #8b8fa3; margin-bottom: 6px; }
    .tl-empty { font-size: 12.5px; color: #595d6c; }

    .detail-footer { border-top: 1px solid #1c1d29; padding: 10px 22px; display: flex; gap: 8px; flex: none; }
    .detail-footer button { font-size: 12px; color: #8b8fa3; background: transparent; border: 1px solid #262835; border-radius: 8px; padding: 8px 13px; }
    .raw-json { margin: 0 22px 16px; padding: 12px 14px; background: #0e0f18; border-radius: 8px; max-height: 320px; overflow-y: auto; }
    .raw-json.hidden { display: none; }

    .json-tree { font: 12.5px/1.7 ui-monospace, monospace; }
    .json-node > summary { list-style: none; cursor: pointer; user-select: none; padding-left: calc(var(--json-depth) * 14px); }
    .json-node > summary::-webkit-details-marker { display: none; }
    .json-node > summary::before { content: '▶'; display: inline-block; width: 12px; color: #595d6c; }
    .json-node[open] > summary::before { content: '▼'; }
    .json-node[open] > summary .json-collapsed-hint { display: none; }
    .json-node:not([open]) .json-close { display: none; }
    .json-close { padding-left: calc(var(--json-depth) * 14px); color: #b2b6ca; }
    .json-leaf { padding-left: calc(var(--json-depth) * 14px + 14px); }
    .json-key { color: #d2cefd; }
    .json-colon { color: #8b8fa3; }
    .json-string { color: #c6c9d6; }
    .json-number { color: #e7e5fe; }
    .json-boolean { color: #d2cefd; }
    .json-null { color: #595d6c; font-style: italic; }
    .json-collapsed-hint { color: #8b8fa3; }

    #no-events { display: none; padding: 60px 20px; text-align: center; color: #595d6c; }
  </style>
</head>
<body class="masked">
  <div id="app">
    <header>
      <h1>🐶 Dobby Logs</h1>
      <span class="divider"></span>
      ${levelBadgeHtml}
      ${r2BadgeHtml}
      <span class="count" id="count-label">共 ${totalCount} 筆</span>
      <span class="count-err" id="count-err-label">${errorCount} 筆需要注意</span>
      <input type="text" id="search" placeholder="搜尋指令、回覆、reqId、使用者…" oninput="applyFilters()">
      <button id="mask-btn" onclick="toggleMask()"><span class="id-masked">遮蔽 ID ●</span><span class="id-plain">顯示 ID ○</span></button>
      <button id="refresh-btn" onclick="document.location.reload()">↻ 重新整理</button>
    </header>

    <main>
      <div id="ev-list-pane">
        <div class="tabs">
          <button class="tab-btn active" data-tab="all" onclick="setTab('all')">全部</button>
          <button class="tab-btn" data-tab="att" onclick="setTab('att')">需要注意</button>
          <button class="tab-btn" data-tab="msg" onclick="setTab('msg')">訊息</button>
          <button class="tab-btn" data-tab="cron" onclick="setTab('cron')">排程</button>
          <button class="tab-btn" data-tab="sys" onclick="setTab('sys')">系統</button>
        </div>
        <div id="ev-list">${listHtml}${trailingBoundaryHtml}<div id="ev-list-empty">沒有符合的事件</div></div>
      </div>
      <div id="detail-pane">${detailHtml || '<div id="no-events">目前沒有日誌記錄</div>'}</div>
    </main>
  </div>

  <script>
    let activeTab = 'all';

    function setTab(tab) {
      activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
      applyFilters();
    }

    function applyFilters() {
      const search = document.getElementById('search').value.trim().toLowerCase();
      let visible = 0;
      document.querySelectorAll('.ev-item').forEach((item) => {
        const tabMatch = activeTab === 'all' || (activeTab === 'att' && item.dataset.status !== 'ok') || item.dataset.bucket === activeTab;
        const searchMatch = !search || item.dataset.search.includes(search);
        const show = tabMatch && searchMatch;
        item.classList.toggle('hidden', !show);
        if (show) visible++;
      });
      document.getElementById('ev-list-empty').style.display = visible === 0 ? 'block' : 'none';
    }

    function selectEvent(key) {
      document.querySelectorAll('.ev-item').forEach((item) => item.classList.toggle('active', item.dataset.key === key));
      document.querySelectorAll('.ev-detail').forEach((d) => d.classList.toggle('active', d.id === 'detail-' + key));
    }

    function toggleMask() {
      document.body.classList.toggle('masked');
    }

    function copyRawJson(key, btn) {
      const el = document.getElementById('raw-' + key);
      if (!el) return;
      const source = el.querySelector('.raw-json-copy-source');
      const text = source ? source.textContent : el.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = '✓ 已複製';
        setTimeout(() => { btn.textContent = original; }, 2000);
      });
    }

    (function initSelection() {
      const first = document.querySelector('.ev-item');
      if (first) first.classList.add('active');
    })();
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
