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

  it('renders a view-mode toggle for the flat/flow table views', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('平面模式');
    expect(res.text).toContain('流程表模式');
    expect(res.text).toContain('id="flow-view"');
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

  it('shows the LOG_LEVEL=debug hint instead of message content for a LINE reply with no captured payload', async () => {
    const app = express();
    app.use('/logs', createLogsRouter('/unused/because/reader/is/mocked'));

    const res = await request(app)
      .get('/logs')
      .query({ token: process.env['LOGS_ACCESS_TOKEN'] });

    expect(res.text).toContain('開 LOG_LEVEL=debug 才能看到訊息內容');
  });
});
