import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

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

describe('createLogsRouter', () => {
  it('renders log timestamps in Asia/Taipei time with a labeled column', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.status).toBe(200);
    expect(res.text).toContain('Time (台北時間)');
    expect(res.text).not.toContain('Time (UTC)');
    // 2024-01-01T00:00:00Z + 8h = 2024-01-01 08:00:00 Taipei time
    expect(res.text).toContain('2024-01-01 08:00:00');
  });

  it('shows method/db badges for both info-level and debug-payload Notion API log lines', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // both the light 'Notion API request' and the 'Notion API request payload'
    // lines should render a method badge + db tag, not just one of them
    expect(res.text.match(/tag-method/g)?.length).toBeGreaterThanOrEqual(2);
    expect(res.text.match(/tag-db/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the API endpoint path for a Notion API call, not just its method/db', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // GET /pages/{id} calls carry no database ID in their path, so db can be
    // absent — path is the only thing that identifies the actual endpoint.
    expect(res.text).toContain('tag-path');
    expect(res.text).toContain('/pages/abc');
  });

  it('shows a purpose tag when the entry carries one', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('tag-purpose');
    expect(res.text).toContain('查詢成員姓名與繳費狀態');
  });

  it('renders a view-mode toggle backed by fully server-rendered flow-table content', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('平面模式');
    expect(res.text).toContain('流程表模式');
    expect(res.text).toContain('id="flow-view"');

    // 決定 2：流程表模式現在是伺服器端一次算好的完整 HTML，不再是等瀏覽器執行
    // JS 才會有內容的空殼，也不再需要內嵌的 JSON script 標籤讓用戶端重新分組。
    expect(res.text).not.toContain('id="display-rows-data"');
    expect(res.text).toContain('class="flow-group"');
    expect(res.text).toContain('class="flow-step"'); // req-2 的 Notion call
    expect(res.text).toContain('class="flow-endpoint"'); // req-5/req-6 的 LINE reply 終點

    // req-2（Notion call）跟 req-5/req-6（LINE reply）應該各自落在獨立的
    // flow-group，不是全部混在一起——這個 fixture 有 4 個不同的 reqId
    // （req-1/req-2/req-5/req-6），應該產生 4 個獨立的 flow-group。
    const flowGroupCount = (res.text.match(/class="flow-group"/g) ?? []).length;
    expect(flowGroupCount).toBe(4);
  });

  it('shows method/path badges and the message content for a fully paired LINE reply', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('tag-method');
    expect(res.text).toContain('tag-path');
    expect(res.text).toContain('/v2/bot/message/reply');
    expect(res.text).toContain('測試訊息內容A');
  });

  it('lets the flow-table "終點" (LINE reply) be expanded to see the same detail flat mode shows', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // asFlowEndpoint() previously dropped RowContent.detailText entirely, so
    // the flow-table's 終點 for req-5 showed the method/path badge but none
    // of the expandable "訊息內容:" detail that flat mode's asTableRow()
    // shows for the exact same row. Flow-groups render newest-first (req-6
    // before req-5), so scan every 終點 block rather than assuming the first
    // one in the HTML is req-5's.
    const endpointBlocks = [...res.text.matchAll(/<div class="flow-endpoint"[^>]*>[\s\S]*?<\/div>\s*<\/div>/g)].map(
      (m) => m[0]
    );
    expect(endpointBlocks.length).toBeGreaterThan(0);
    const reqFiveEndpoint = endpointBlocks.find((html) => html.includes('測試訊息內容A'));
    expect(reqFiveEndpoint).toBeDefined();
    expect(reqFiveEndpoint).toContain('flow-step-detail');
  });

  it('shows the LOG_LEVEL=debug hint instead of message content for a LINE reply with no captured payload', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('開 LOG_LEVEL=debug 才能看到訊息內容');
  });

  // 決定 1：通用渲染器——「其他所有類型」的 log 行不再只顯示 msg 名稱，
  // 額外欄位不點開就看得到。
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

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('tag-field');
    expect(res.text).toContain('text'); // key 名稱
    expect(res.text).toContain('@Dobby +1'); // value，不用點開任何東西就看得到
  });

  it('does not render meta fields (level/time/msg/reqId/pid/hostname) as a tag-field', async () => {
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

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // 注意：CSS 裡的 `.tag-field { ... }` 規則本身一定會出現在 <style>，所以
    // 這裡要驗證的是「沒有任何一個 tag-field *元素*」，而不是裸字串 'tag-field'
    // 完全不出現。
    expect(res.text).not.toContain('class="tag-field"');
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

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('a / b');
    expect(res.text).toContain(JSON.stringify({ x: 1 }).replace(/"/g, '&quot;'));
  });

  it('skips null/undefined extra-field values entirely instead of rendering a "null" tag', async () => {
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

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // present 欄位仍然要顯示成 tag-field；maybeNull/maybeUndefined 完全不會有
    // 自己的 tag-field（雖然 raw JSON 的 copy 用途仍然會保留完整原始資料，
    // 所以這裡驗證的是「沒有以它們為 key 的 tag-field」而不是裸字串完全不出現）。
    expect(res.text).toContain('tag-field-key">present<');
    expect(res.text).not.toContain('tag-field-key">maybeNull<');
    expect(res.text).not.toContain('tag-field-key">maybeUndefined<');
  });

  // 決定 3：流程表模式的等級色標，來源同一份 LEVEL_COLORS。
  it('gives flow-table items different border-left-color values based on level', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      { level: 50, time: Date.UTC(2024, 0, 1, 0, 0, 0), msg: 'boom', reqId: 'req-err' },
      { level: 30, time: Date.UTC(2024, 0, 1, 0, 0, 1), msg: 'ok', reqId: 'req-info' },
    ]);

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    // error 跟 info 兩種等級的色碼不一樣，避免退化成「加了 style 屬性但值都一樣」的假通過
    expect(res.text).toContain('border-left-color:#f87171'); // error
    expect(res.text).toContain('border-left-color:#34d399'); // info
  });

  // 決定 4：長內容至少能透過 hover tooltip 看到完整內容。
  it('adds a title attribute with the full content text to action-content for both Notion calls and LINE sends', async () => {
    vi.mocked(readRecentLogs).mockResolvedValueOnce([
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 0),
        msg: 'Notion API request',
        method: 'GET',
        path: '/pages/abc',
        purpose: '查詢成員姓名與繳費狀態',
        reqId: 'req-1',
      },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 1),
        msg: 'Notion API response',
        method: 'GET',
        path: '/pages/abc',
        reqId: 'req-1',
      },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 2),
        msg: 'LINE reply',
        method: 'POST',
        path: '/v2/bot/message/reply',
        sendId: 's-a',
        reqId: 'req-2',
      },
      {
        level: 20,
        time: Date.UTC(2024, 0, 1, 0, 0, 3),
        msg: 'LINE reply payload',
        sendId: 's-a',
        messages: ['測試內容'],
        reqId: 'req-2',
      },
      {
        level: 30,
        time: Date.UTC(2024, 0, 1, 0, 0, 4),
        msg: 'LINE reply sent',
        sendId: 's-a',
        reqId: 'req-2',
      },
    ]);

    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));
    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('action-content" title="查詢成員姓名與繳費狀態"');
    expect(res.text).toContain('action-content" title="測試內容"');
  });
});
