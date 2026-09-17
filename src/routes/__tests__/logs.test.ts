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
});
