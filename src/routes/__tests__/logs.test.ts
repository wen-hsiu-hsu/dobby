import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const { getR2SyncStatusMock } = vi.hoisted(() => ({
  getR2SyncStatusMock: vi.fn().mockReturnValue({ enabled: false }),
}));

vi.mock('../../utils/log-upload.js', () => ({
  getR2SyncStatus: getR2SyncStatusMock,
}));

vi.mock('../../utils/log-reader.js', () => ({
  readRecentLogs: vi.fn().mockResolvedValue([
    {
      level: 30,
      // 2024-01-01T00:00:00Z -> Asia/Taipei is UTC+8, no DST
      time: Date.UTC(2024, 0, 1, 0, 0, 0),
      msg: 'hello world',
      reqId: 'req-1',
    },
    {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 1),
      msg: 'Notion API request',
      method: 'GET',
      path: '/pages/abc',
      db: 'people',
      purpose: '查詢成員姓名與繳費狀態',
      reqId: 'req-2',
    },
    {
      level: 20,
      time: Date.UTC(2024, 0, 1, 0, 0, 2),
      msg: 'Notion API request payload',
      method: 'GET',
      path: '/pages/abc',
      db: 'people',
      reqId: 'req-2',
    },
    // A fully paired LINE reply (start + debug payload + sent), simulating
    // LOG_LEVEL=debug capturing everything.
    {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 3),
      msg: 'LINE reply',
      method: 'POST',
      path: '/v2/bot/message/reply',
      sendId: 's-a',
      reqId: 'req-5',
    },
    {
      level: 20,
      time: Date.UTC(2024, 0, 1, 0, 0, 4),
      msg: 'LINE reply payload',
      sendId: 's-a',
      messages: ['測試訊息內容A'],
      reqId: 'req-5',
    },
    {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 5),
      msg: 'LINE reply sent',
      sendId: 's-a',
      reqId: 'req-5',
    },
    // A LINE reply with no debug payload line, simulating the default
    // LOG_LEVEL=info where the payload line was never captured.
    {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 6),
      msg: 'LINE reply',
      method: 'POST',
      path: '/v2/bot/message/reply',
      sendId: 's-b',
      reqId: 'req-6',
    },
    {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 7),
      msg: 'LINE reply sent',
      sendId: 's-b',
      reqId: 'req-6',
    },
  ]),
}));

import { readRecentLogs } from '../../utils/log-reader.js';
import { createLogsRouter } from '../logs.js';

async function getLogsHtml(): Promise<string> {
  const app = express();
  app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
  const res = await request(app).get('/logs').query({ token: process.env['LOGS_ACCESS_TOKEN'] });
  expect(res.status).toBe(200);
  return res.text;
}

describe('createLogsRouter', () => {
  it('renders each reqId as its own event card, in Asia/Taipei time', async () => {
    const html = await getLogsHtml();

    // 4 個不同的 reqId（req-1/req-2/req-5/req-6）應該各自變成獨立的事件卡片。
    const itemCount = (html.match(/class="ev-item"/g) ?? []).length;
    expect(itemCount).toBe(4);

    // 2024-01-01T00:00:00Z + 8h = 2024-01-01 08:00:00 Taipei time
    expect(html).toContain('2024-01-01 08:00:00');
  });

  it('uses the Notion call purpose as the timeline step title and shows the endpoint path', async () => {
    const html = await getLogsHtml();

    expect(html).toContain('查詢成員姓名與繳費狀態');
    // GET /pages/{id} calls carry no database ID in their path, so path is
    // the only thing that identifies the actual endpoint hit.
    expect(html).toContain('<span class="tl-path">GET /pages/abc</span>');
  });

  it('shows a "尚無回應記錄" note for a Notion call with no captured response', async () => {
    const html = await getLogsHtml();
    expect(html).toContain('尚無回應記錄');
  });

  it('shows the LINE reply message content for a fully paired reply', async () => {
    const html = await getLogsHtml();

    expect(html).toContain('POST /v2/bot/message/reply');
    expect(html).toContain('測試訊息內容A');
    expect(html).toContain('Dobby 送給使用者的訊息');
  });

  it('shows the LOG_LEVEL=debug hint instead of message content for a LINE reply with no captured payload', async () => {
    const html = await getLogsHtml();
    expect(html).toContain('開 LOG_LEVEL=debug 才能看到訊息內容');
  });

  it('lets a timeline step with detail be expanded via a click handler', async () => {
    const html = await getLogsHtml();
    expect(html).toContain('tl-expandable');
    expect(html).toContain("this.classList.toggle('expanded')");
    expect(html).toContain('class="tl-detail"');
  });

  // 決定 1（沿用）：通用渲染器——不認識的 log 訊息不需要程式碼另外處理，
  // 額外欄位還是會顯示出來，不用點開任何東西。
  it('shows non-meta fields on an unrecognized log line without needing to expand it (generic renderer)', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'handleMessage',
        reqId: 'req-1',
        userId: 'u1',
        text: '@Dobby +1',
        isAdmin: false,
        sourceType: 'group',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('handleMessage');
    expect(html).toContain('text: @Dobby +1');
  });

  it('does not render meta fields (level/time/msg/reqId/pid/hostname) in the generic note', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'plain event with no extra fields',
        reqId: 'req-1',
        pid: 123,
        hostname: 'host-a',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('plain event with no extra fields');
    expect(html).not.toContain('pid:');
    expect(html).not.toContain('hostname:');
  });

  it('formats an array extra-field value as "a / b" and an object value as its JSON string', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'multi-value event',
        reqId: 'req-1',
        tags: ['a', 'b'],
        meta: { x: 1 },
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('tags: a / b');
    expect(html).toContain(JSON.stringify({ x: 1 }).replace(/"/g, '&quot;'));
  });

  it('skips null/undefined extra-field values entirely instead of rendering a "null" note', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'nullable-fields event',
        reqId: 'req-1',
        maybeNull: null,
        maybeUndefined: undefined,
        present: 'yes',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('present: yes');
    // maybeNull/maybeUndefined 完全不會出現在通用渲染器的 note 裡（格式是
    // "key: value"）——雖然「看原始 log」的完整 JSON 傾印仍然會保留
    // maybeNull（值是 null），所以驗證的是沒有以它為 key 的 note，而不是
    // 裸字串完全不出現。
    expect(html).not.toContain('maybeNull:');
    expect(html).not.toContain('maybeUndefined:');
  });

  // 決定 3（沿用）：時間軸每一步的等級色標，來源同一份 LEVEL_COLORS。
  it('gives timeline dots different colors based on level', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 50, time: Date.UTC(2024, 0, 1, 0, 0, 0), msg: 'boom', reqId: 'req-err' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 1), msg: 'ok', reqId: 'req-info' },
    ]);

    const html = await getLogsHtml();

    // error 跟 info 兩種等級的色碼不一樣，避免退化成「加了 style 屬性但值都一樣」的假通過
    expect(html).toContain('background:#e0807f'); // error
    expect(html).toContain('background:#34d399'); // info

    // 兩個獨立 reqId 應該各自的狀態圓點顏色也對應到同一組 STATUS_COLORS
    expect(html).toContain('data-status="error"');
    expect(html).toContain('data-status="ok"');
  });

  it('treats a failed LINE reply as an "error" status event even though the underlying log level is warn', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-fail', msg: 'Processing event' },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        msg: 'LINE reply',
        method: 'POST',
        path: '/v2/bot/message/reply',
        sendId: 's-fail',
        reqId: 'req-fail',
      },
      {
        level: 40, // logged at warn, not error
        time: Date.UTC(2024, 0, 1, 0, 0, 2),
        msg: 'Reply failed, no fallback available (no groupId for push)',
        err: { message: 'no fallback available (no groupId for push)' },
        sendId: 's-fail',
        reqId: 'req-fail',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('data-status="error"');
    expect(html).toContain('LINE 回覆失敗');
    expect(html).toContain('no fallback available (no groupId for push)');
  });

  it('marks an event with no "Processing event" start as scheduled (排程), and keeps distinct reqIds as separate events', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 4, 0, 0), msg: 'Starting display name batch update', reqId: 'sched-1' },
      { level: 30, time: Date.UTC(2024, 0, 1, 4, 0, 5), msg: 'Display name update complete', updated: 2, reqId: 'sched-1' },
      { level: 30, time: Date.UTC(2024, 1, 1, 4, 0, 0), msg: 'Starting display name batch update', reqId: 'sched-2' },
    ]);

    const html = await getLogsHtml();

    expect((html.match(/data-bucket="cron"/g) ?? []).length).toBe(2);
    expect(html).toContain('Display name update complete');
    expect(html).toContain('updated: 2');
  });

  it('renders a mask toggle that swaps the raw userId for a masked version (both rendered, CSS-toggled)', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'user', reqId: 'req-u', msg: 'Processing event' },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        msg: 'handleMessage',
        userId: 'U1234567890abcdef1234567890abcdef',
        reqId: 'req-u',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('class="masked"'); // body starts masked
    expect(html).toContain('U1234●●●●●●def'); // masked span
    expect(html).toContain('U1234567890abcdef1234567890abcdef'); // plain span (still present, CSS-hidden)
    expect(html).toContain('toggleMask()');
  });

  // 決定：groupId 跟 userId 一樣是 PII，套用同一套遮蔽機制（id-masked/
  // id-plain 由全域 toggleMask() 控制），不因為設計稿 mockup 明碼顯示就
  // 跳過遮蔽。
  it('shows a masked/plain 群組 ID field when "Processing event detail" carries source.groupId', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-group', msg: 'Processing event' },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        reqId: 'req-group',
        msg: 'Processing event detail',
        source: { type: 'group', groupId: 'C1234567890abcdef1234567890abcdef' },
        message: { type: 'text', text: '報名' },
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('群組 ID');
    // 遮蔽規則跟 userId 一樣：開頭 5 碼 + 6 個● + 結尾 3 碼
    expect(html).toContain('<span class="id-masked">C1234●●●●●●def</span>');
    expect(html).toContain('<span class="id-plain">C1234567890abcdef1234567890abcdef</span>');
  });

  it('does not render a 群組 ID field at all when there is no groupId info (LOG_LEVEL=info, no detail line)', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-nogroup', msg: 'Processing event' },
    ]);

    const html = await getLogsHtml();

    expect(html).not.toContain('群組 ID');
  });

  it('renders a footer with real "raw log" / "copy JSON" actions wired to that event\'s own raw entries', async () => {
    const html = await getLogsHtml();

    expect(html).toContain('看這筆的原始 log');
    expect(html).toContain('複製 JSON');
    expect(html).toContain('copyRawJson(');
    expect(html).toContain('class="raw-json hidden" id="raw-req-5"');
    expect(html).toContain('測試訊息內容A'); // raw JSON for req-5 includes its own payload
  });

  it('renders search input and the five tabs (全部/需要注意/訊息/排程/系統)', async () => {
    const html = await getLogsHtml();

    expect(html).toContain('id="search"');
    expect(html).toContain('全部');
    expect(html).toContain('需要注意');
    expect(html).toContain('訊息');
    expect(html).toContain('排程');
    expect(html).toContain('系統');
  });

  it('classifies a command-shaped message (Routing command) as kind=command, and a non-command message as kind=chat', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-cmd', msg: 'Processing event' },
      { level: 20, time: Date.UTC(2024, 0, 1, 0, 0, 1), reqId: 'req-cmd', msg: 'Routing command', command: { type: 'registration' }, isAdmin: false },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 2), type: 'message', sourceType: 'group', reqId: 'req-chat', msg: 'Processing event' },
      { level: 20, time: Date.UTC(2024, 0, 1, 0, 0, 3), reqId: 'req-chat', msg: 'Auto-reply lookup', text: 'hi', matched: false, reply: null },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('data-key="req-cmd"');
    expect(html).toMatch(/data-key="req-cmd"[^>]*>[\s\S]*?指令/);
    expect(html).toContain('data-key="req-chat"');
    expect(html).toMatch(/data-key="req-chat"[^>]*>[\s\S]*?對話/);
  });

  it('treats a command-shaped message that never sent a reply as "warn" (沒看懂)', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-parsefail', msg: 'Processing event' },
      { level: 20, time: Date.UTC(2024, 0, 1, 0, 0, 1), reqId: 'req-parsefail', msg: 'Message looks like command but failed to parse', text: '@Dobby 報名下禮拜三' },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('data-key="req-parsefail" data-status="warn"');
  });

  it('downgrades a known non-fatal fallback (profile lookup failure) to "degraded" instead of "error", with an explanation banner', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'memberJoined', sourceType: 'group', reqId: 'req-degraded', msg: 'Processing event' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 1), reqId: 'req-degraded', msg: 'Could not get user profile', method: 'GET', path: '/v2/bot/group/{groupId}/member/{userId}' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 2), reqId: 'req-degraded', msg: 'LINE reply', method: 'POST', path: '/v2/bot/message/reply', sendId: 's-d' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 3), reqId: 'req-degraded', msg: 'LINE reply sent', sendId: 's-d' },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('data-key="req-degraded" data-status="degraded"');
    expect(html).toContain('完成（有降級）');
    expect(html).toContain('degraded-banner');
    expect(html).toContain('Could not get user profile —');
  });

  it('renders a proportional batch-result chart for a scheduled job summary with 2+ numeric fields, excluding "total"', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 4, 0, 0), reqId: 'sched-batch', msg: 'Starting display name batch update' },
      { level: 30, time: Date.UTC(2024, 0, 1, 4, 0, 5), reqId: 'sched-batch', msg: 'Display name update complete', updated: 24, skipped: 3, failed: 2, total: 29 },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('class="batch-section"');
    expect(html).toContain('batch-stat-label">updated<');
    expect(html).toContain('24 / 29');
    // total 本身不是一根獨立的比例條
    expect(html).not.toContain('batch-stat-label">total<');
  });

  it('does not render a batch chart when the summary log only has one numeric field', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 4, 0, 0), reqId: 'sched-single', msg: 'Weekly push aborted: DOBBY_GROUP_IDS is not set' },
    ]);

    const html = await getLogsHtml();

    expect(html).not.toContain('class="batch-section"');
  });

  it('classifies a reqId-less HTTP-layer failure (e.g. webhook signature validation) as its own "system" event, separate from server lifecycle logs', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), msg: 'Server started', port: 3000 },
      { level: 40, time: Date.UTC(2024, 0, 1, 1, 0, 0), msg: 'LINE signature validation failed', err: { message: 'bad signature' }, path: '/webhook', method: 'POST' },
      { level: 40, time: Date.UTC(2024, 0, 1, 2, 0, 0), msg: 'LINE signature validation failed', err: { message: 'bad signature' }, path: '/webhook', method: 'POST' },
    ]);

    const html = await getLogsHtml();

    // 兩筆各自獨立成一個系統事件，不會因為都沒有 reqId 而被合併成一筆
    expect((html.match(/data-bucket="sys"/g) ?? []).length).toBe(2);
    // 伺服器啟動訊息不會被當成獨立事件列出（會變成分隔線，不是 ev-item）
    expect(html).not.toContain('Server started<');
    // 簽章驗證失敗確實發生在 HTTP 層，「來源」維持 POST /webhook
    expect(html).toContain('HTTP · POST /webhook');
  });

  it('gives each known "system" message its own accurate 來自/stepsHeading instead of a shared "index.ts 錯誤處理" label for everything', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 40, time: Date.UTC(2024, 0, 1, 1, 0, 0), msg: 'LINE signature validation failed', err: { message: 'bad signature' }, path: '/webhook', method: 'POST' },
      { level: 30, time: Date.UTC(2024, 0, 1, 2, 0, 0), msg: 'Webhook received multiple events', eventCount: 2 },
      { level: 30, time: Date.UTC(2024, 0, 1, 3, 0, 0), msg: 'Some future system-level message nobody wrote a rule for yet' },
    ]);

    const html = await getLogsHtml();

    // 簽章驗證失敗維持原本的「index.ts 錯誤處理」文案
    expect(html).toContain('index.ts 錯誤處理');
    // 一次收到多筆事件是正常情況，不該被貼上「錯誤處理」標籤
    expect(html).toContain('webhook.ts');
    expect(html).not.toMatch(/webhook\.ts[^<]*錯誤處理/);
    // 完全沒對到規則的訊息，退回通用 fallback，不是憑空掉進某個已知文案
    expect(html).toContain('（未知系統來源）');
  });

  it('shows the one-time "R2 not configured" startup hint as a system event with the log-upload.ts origin', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 20, time: Date.UTC(2024, 0, 1, 1, 0, 0), msg: 'R2 not configured, log sync disabled' },
    ]);

    const html = await getLogsHtml();

    expect((html.match(/data-bucket="sys"/g) ?? []).length).toBe(1);
    expect(html).toContain('log-upload.ts（R2 未設定，啟動時提示一次，非錯誤）');
    expect(html).not.toContain('（未知系統來源）');
    // 「來源」要跟「來自：log-upload.ts」一致，是啟動時記的，不是 webhook 進來的
    expect(html).toContain('啟動 · log-upload.ts');
    expect(html).not.toContain('POST /webhook');
  });

  // 之前只驗證過 event-router.ts 有沒有把 webhookEventId/isRedelivery 記
  // 進 log（見 event-router.test.ts），沒有驗證 /logs 頁面實際渲染出來的
  // HTML 裡看不看得到——這裡才是這兩個欄位真正「顯示給人看」的地方。
  it('shows webhookEventId on the 起點 step, and only shows the isRedelivery marker when it is actually true', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        type: 'message',
        sourceType: 'group',
        reqId: 'req-redelivered',
        webhookEventId: '01M31BEND6EPJ7FSWMDHC7BGRQ',
        isRedelivery: true,
        msg: 'Processing event',
      },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 1, 0, 0),
        type: 'message',
        sourceType: 'group',
        reqId: 'req-normal',
        webhookEventId: '01M31XXXXXXXXXXXXXXXXXXXXX',
        isRedelivery: false,
        msg: 'Processing event',
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('webhookEventId: 01M31BEND6EPJ7FSWMDHC7BGRQ');
    expect(html).toContain('webhookEventId: 01M31XXXXXXXXXXXXXXXXXXXXX');
    // 只有真的被重送的那一筆才看得到重送標記，且用跟其他「值得注意」欄位
    // 一致的 warn 色塊，不是每一筆都印一次「isRedelivery: false」的雜訊
    expect(html).toContain('LINE 重送這筆事件');
    expect((html.match(/LINE 重送這筆事件/g) ?? []).length).toBe(1);
    expect(html).not.toContain('isRedelivery: false');
    expect(html).toContain('tl-note-warn');
  });

  // 回歸測試：startStepTimeline() 組的 note 曾經漏了 escapeHtml()，讓使用
  // 者傳的訊息內容跟 webhookEventId 原封不動塞進 HTML（XSS）。這裡故意用
  // 含有 <script>/雙引號 的字串驗證輸出裡看到的是跳脫過的實體，不是原始
  // 字元，以後這裡再退步會被這個測試抓到。
  it('escapes HTML-special characters in the 起點 step\'s note (message content and webhookEventId), not just other steps', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-xss', webhookEventId: '<img src=x onerror=alert(1)>', msg: 'Processing event' },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        reqId: 'req-xss',
        msg: 'Processing event detail',
        source: { type: 'group' },
        message: { type: 'text', text: '<script>alert("xss")</script>' },
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(html).toContain('webhookEventId: &lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    // 起點 step 的展開內容（tl-detail）現在也帶了 group.startDetail 的完整
    // source/message 物件，同一組 XSS payload 也要在那裡被跳脫過，不是只
    // 有 note 欄位被顧到。JSON 內容現在是可收合的 json-tree，字串葉節點是
    // 直接對原始值呼叫 escapeHtml()（不再先 JSON.stringify），所以跟 note
    // 欄位的跳脫結果一致，沒有反斜線。
    expect(html).toContain('tl-expandable');
    expect(html).toContain('<span class="json-string">"&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"</span>');
  });

  // 起點 step 的「收到訊息」以前完全不能展開（detailText 固定是空字串），
  // 看不到 webhook event 的完整原始內容。這裡驗證補上的展開內容：有
  // Processing event detail（debug 等級）時能看到完整 source/message；只有
  // Processing event（模擬 LOG_LEVEL=info）時退回提示文字，不是顯示空白或
  // 讓整個 step 變成不能點開。
  it('makes the 起點 step expandable with the full source/message when "Processing event detail" (debug) is present', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        type: 'message',
        sourceType: 'user',
        reqId: 'req-detail',
        webhookEventId: '01M31DETAILDETAILDETAILDET',
        msg: 'Processing event',
      },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        reqId: 'req-detail',
        msg: 'Processing event detail',
        source: { type: 'user', userId: 'Uabc123' },
        message: { type: 'text', text: '報名' },
      },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('tl-expandable');
    expect(html).toContain('Processing event detail（來源與訊息內容）');
    expect(html).toContain('<span class="json-string">"Uabc123"</span>');
    expect(html).toContain('<span class="json-string">"報名"</span>');
    // JSON 內容現在是可收合的 json-tree，不再是一整段 pretty-printed 純文字。
    expect(html).toContain('class="json-node"');
  });

  it('falls back to a LOG_LEVEL=debug hint in the 起點 step detail when only "Processing event" (no detail) exists', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        type: 'message',
        sourceType: 'user',
        reqId: 'req-no-detail',
        webhookEventId: '01M31NODETAILNODETAILNODET',
        msg: 'Processing event',
      },
    ]);

    const html = await getLogsHtml();

    // 沒有 Processing event detail 也還是能點開（group.start 一定存在），
    // 只是展開內容裡看到的是提示文字，不是完整 source/message。
    expect(html).toContain('tl-expandable');
    expect(html).toContain('開 LOG_LEVEL=debug 才能看到完整 webhook event 內容');
    expect(html).not.toContain('Processing event detail');
  });

  // 舊格式的 Processing event（這次改動之前寫的）沒有這兩個欄位——確認
  // 不會因為缺欄位而顯示空白或壞掉，單純不顯示這兩項。
  it('renders the 起點 step normally for an old-format "Processing event" line missing webhookEventId/isRedelivery', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), type: 'message', sourceType: 'group', reqId: 'req-old', msg: 'Processing event' },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('收到訊息');
    expect(html).not.toContain('webhookEventId:');
    expect(html).not.toContain('LINE 重送這筆事件');
  });

  it('renders a service-restart boundary marker from shutdown+startup lifecycle logs, positioned by time, not as a selectable event', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 0), msg: 'Received shutdown signal, closing server', signal: 'SIGTERM' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 1), msg: 'Server closed, exiting' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 5), msg: 'Server started', port: 3000 },
    ]);

    const html = await getLogsHtml();

    expect(html).toContain('class="ev-boundary"');
    expect(html).toContain('服務重新啟動');
    expect(html).toContain('SIGTERM');
    expect(html).toContain('port 3000');
    expect(html).not.toContain('class="ev-item"'); // 沒有其他真正的事件，只有分隔線
  });

  it('shows the effective LOG_LEVEL as a badge in the header', async () => {
    const html = await getLogsHtml();

    // NODE_ENV 在測試環境不是 'production'，logger.ts 的 isDev 為 true，建構
    // pino 時傳的是寫死的 'debug'，跟 env.LOG_LEVEL 設定值無關——所以這裡斷
    // 言的是「實際生效」的等級。
    expect(html).toContain('LOG_LEVEL=debug');
    expect(html).toContain('level-badge');
  });

  it('renders JSON request/response payload content as a collapsible json-tree instead of one pretty-printed block', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'Notion API request',
        method: 'PATCH',
        path: '/pages/xyz',
        purpose: '更新繳費狀態',
        reqId: 'req-json',
      },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        msg: 'Notion API request payload',
        method: 'PATCH',
        path: '/pages/xyz',
        body: { properties: { Paid: { checkbox: true } } },
        reqId: 'req-json',
      },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 2),
        msg: 'Notion API response',
        method: 'PATCH',
        path: '/pages/xyz',
        durationMs: 120,
        reqId: 'req-json',
      },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 3),
        msg: 'Notion API response payload',
        method: 'PATCH',
        path: '/pages/xyz',
        result: { id: 'page-xyz', archived: false },
        reqId: 'req-json',
      },
    ]);

    const html = await getLogsHtml();

    // 收合樹的容器/節點 class 存在，取代舊的一整段 pretty JSON 純文字。
    expect(html).toContain('class="json-tree"');
    expect(html).toContain('class="json-node"');
    // 個別欄位值仍然看得到，只是被拆成一堆 span。
    expect(html).toContain('<span class="json-key">"checkbox"</span>');
    expect(html).toContain('<span class="json-boolean">true</span>');
    expect(html).toContain('<span class="json-string">"page-xyz"</span>');
  });

  it('keeps a hidden raw-json-copy-source <pre> with the full pretty-printed rawEntries JSON, unaffected by json-tree collapsing', async () => {
    const rawEntry = {
      level: 30,
      time: Date.UTC(2024, 0, 1, 0, 0, 0),
      msg: 'copy source check',
      reqId: 'req-copy',
      extra: { nested: { deep: 'value' } },
    };
    vi.mocked(readRecentLogs).mockResolvedValueOnce([rawEntry]);

    const html = await getLogsHtml();

    // 收合節點的「… N 個欄位」提示文字只是用 CSS 藏起來，不是真的從 DOM
    // 移除——複製功能改讀這個永遠隱藏、內容不受收合影響的 <pre>，這裡驗證
    // 它的內容仍然是完整、跟原本行為一致的 JSON.stringify(rawEntries, null, 2)。
    const expectedJson = JSON.stringify([rawEntry], null, 2)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    expect(html).toContain(`<pre class="raw-json-copy-source" style="display:none">${expectedJson}</pre>`);
  });

  describe('R2 sync status badge', () => {
    it('shows a neutral "未啟用" badge when R2 is not configured', async () => {
      getR2SyncStatusMock.mockReturnValueOnce({ enabled: false });

      const html = await getLogsHtml();

      expect(html).toContain('R2 備份：未啟用');
      expect(html).toContain('color:#8b8fa3');
    });

    it('shows a neutral "尚未同步" badge when enabled but never run', async () => {
      getR2SyncStatusMock.mockReturnValueOnce({
        enabled: true,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastFailureMessage: null,
      });

      const html = await getLogsHtml();

      expect(html).toContain('R2 備份：尚未同步');
      expect(html).toContain('color:#8b8fa3');
    });

    it('shows a green "成功" badge with Taipei time when the last run succeeded', async () => {
      getR2SyncStatusMock.mockReturnValueOnce({
        enabled: true,
        // 2024-01-01T00:00:00Z -> Asia/Taipei is UTC+8
        lastSuccessAt: Date.UTC(2024, 0, 1, 0, 0, 0),
        lastFailureAt: null,
        lastFailureMessage: null,
      });

      const html = await getLogsHtml();

      expect(html).toContain('R2 備份 · 08:00:00 成功');
      expect(html).toContain('color:#7fb894'); // STATUS_COLORS.ok
    });

    it('shows an amber "失敗，等待下次重試" badge with the failure message in title when the last run failed', async () => {
      getR2SyncStatusMock.mockReturnValueOnce({
        enabled: true,
        lastSuccessAt: Date.UTC(2024, 0, 1, 0, 0, 0),
        lastFailureAt: Date.UTC(2024, 0, 1, 1, 0, 0), // later than lastSuccessAt
        lastFailureMessage: '2/3 個檔案上傳失敗',
      });

      const html = await getLogsHtml();

      expect(html).toContain('R2 備份 · 09:00:00 失敗，等待下次重試');
      expect(html).toContain('color:#d3a35c'); // STATUS_COLORS.warn
      expect(html).toContain('title="2/3 個檔案上傳失敗"');
    });
  });
});
