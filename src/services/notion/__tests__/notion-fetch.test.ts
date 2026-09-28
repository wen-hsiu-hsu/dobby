import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost, notionPatch, notionGetAllResults } from '../notion-fetch.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(status: number, text: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => JSON.parse(text),
    text: async () => text,
  } as unknown as Response;
}

describe('notion-fetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.clearAllMocks();
  });

  it('notionGet sends GET with auth headers and no body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    const result = await notionGet('/pages/abc');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/pages/abc',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer '),
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body');
  });

  it('notionPost sends POST with JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'page-1' }));

    const result = await notionPost('/pages', { parent: { database_id: 'db-1' } });

    expect(result).toEqual({ id: 'page-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/pages',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ parent: { database_id: 'db-1' } }),
      }),
    );
  });

  it('notionPatch sends PATCH with JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'page-1', updated: true }));

    const result = await notionPatch('/pages/page-1', { properties: {} });

    expect(result).toEqual({ id: 'page-1', updated: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/pages/page-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ properties: {} }),
      }),
    );
  });

  it('throws and logs an error on non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(400, { message: 'bad request' }));

    await expect(notionGet('/pages/missing')).rejects.toThrow('Notion API error');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/pages/missing', status: 400, durationMs: expect.any(Number) }),
      'Notion API error',
    );
  });

  it('throws and logs an error on non-ok response for POST and PATCH too', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'server error' }));

    await expect(notionPost('/pages', {})).rejects.toThrow('Notion API error');
    await expect(notionPatch('/pages/x', {})).rejects.toThrow('Notion API error');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/pages', status: 500, durationMs: expect.any(Number) }),
      'Notion API error',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PATCH', path: '/pages/x', status: 500, durationMs: expect.any(Number) }),
      'Notion API error',
    );
  });

  it('logs "Notion API error" with status and the raw (truncated) body when an error response is not JSON', async () => {
    const html = `<html><body>502 Bad Gateway</body></html>${'x'.repeat(1000)}`;
    fetchMock.mockResolvedValue(textResponse(502, html));

    const thrown = await notionGet('/pages/abc').catch((e: unknown) => e);

    // 丟出的錯誤訊息要可讀，不是 JSON.parse 的 SyntaxError
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/^Notion API error: HTTP 502 <html><body>502 Bad Gateway/);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: '/pages/abc',
        status: 502,
        durationMs: expect.any(Number),
        err: expect.stringMatching(/^<html><body>502 Bad Gateway/),
      }),
      'Notion API error',
    );
    const loggedErr = vi.mocked(logger.error).mock.calls[0]![0] as { err: string };
    expect(loggedErr.err.length).toBeLessThan(html.length);
  });

  it('logs "Notion API error" (no status) and rethrows the original error on a network failure', async () => {
    const networkErr = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.notion.com') });
    fetchMock.mockRejectedValue(networkErr);

    // 原樣丟出，cause 才保得住
    await expect(notionPost('/pages', { a: 1 })).rejects.toBe(networkErr);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [fields, msg] = vi.mocked(logger.error).mock.calls[0]!;
    expect(msg).toBe('Notion API error');
    expect(fields).toEqual(
      expect.objectContaining({ method: 'POST', path: '/pages', durationMs: expect.any(Number), err: networkErr }),
    );
    expect(fields).not.toHaveProperty('status');
  });

  it('logs "Notion API error" when a 2xx response body cannot be parsed', async () => {
    fetchMock.mockResolvedValue(textResponse(200, '<html>truncated'));

    await expect(notionGet('/pages/abc')).rejects.toThrow(SyntaxError);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', path: '/pages/abc', status: 200 }),
      'Notion API error',
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Notion API response');
  });

  describe('429 retry', () => {
    it('retries after Retry-After seconds and succeeds', async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(429, { message: 'rate limited' }, { 'Retry-After': '0' }))
        .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const result = await notionGet('/pages/abc');

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'GET', path: '/pages/abc', attempt: 1, durationMs: expect.any(Number) }),
        'Notion API rate limited, retrying',
      );
    });

    it('throws after exceeding the retry limit', async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { message: 'rate limited' }, { 'Retry-After': '0' }));

      await expect(notionGet('/pages/abc')).rejects.toThrow('Notion API error');
      expect(fetchMock).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
    });
  });

  describe('split-level Notion API logging', () => {
    it('logs a lightweight info line with method/path/db but no body/result', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { secret: 'should not be here' }));

      await notionPost('/pages', { sensitive: 'payload' });

      expect(logger.info).toHaveBeenCalledWith(
        { method: 'POST', path: '/pages', db: undefined, callId: expect.any(String) },
        'Notion API request',
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/pages', db: undefined, durationMs: expect.any(Number) }),
        'Notion API response',
      );
      for (const call of vi.mocked(logger.info).mock.calls) {
        expect(call[0]).not.toHaveProperty('body');
        expect(call[0]).not.toHaveProperty('result');
      }
    });

    it('logs the full body/result only at debug level, under distinct message names', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { id: 'page-1' }));

      await notionPost('/pages', { parent: { database_id: 'db-1' } });

      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/pages', body: { parent: { database_id: 'db-1' } } }),
        'Notion API request payload',
      );
      expect(logger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/pages', result: { id: 'page-1' } }),
        'Notion API response payload',
      );
    });
  });

  describe('callId', () => {
    function callIdsOf(mock: ReturnType<typeof vi.fn>, msg: string): unknown[] {
      return mock.mock.calls.filter((c) => c[1] === msg).map((c) => (c[0] as { callId?: unknown }).callId);
    }

    it('tags every log line of one call with the same callId, and gives separate calls different callIds', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

      await notionPost('/databases/x/query', { filter: 1 });
      await notionPost('/databases/x/query', { filter: 2 });

      const requestIds = callIdsOf(vi.mocked(logger.info), 'Notion API request');
      expect(requestIds).toHaveLength(2);
      expect(requestIds[0]).toMatch(/^[0-9a-f]{6}$/);
      expect(requestIds[0]).not.toBe(requestIds[1]);
      expect(callIdsOf(vi.mocked(logger.debug), 'Notion API request payload')).toEqual(requestIds);
      expect(callIdsOf(vi.mocked(logger.info), 'Notion API response')).toEqual(requestIds);
      expect(callIdsOf(vi.mocked(logger.debug), 'Notion API response payload')).toEqual(requestIds);
    });

    it('keeps the same callId across 429 retries (including the rate-limited warn and the final error)', async () => {
      fetchMock.mockResolvedValue(jsonResponse(429, { message: 'rate limited' }, { 'Retry-After': '0' }));
      vi.useFakeTimers();
      try {
        const p = notionGet('/pages/abc').catch((e: unknown) => e);
        await vi.runAllTimersAsync();
        await p;
      } finally {
        vi.useRealTimers();
      }

      const requestIds = callIdsOf(vi.mocked(logger.info), 'Notion API request');
      expect(requestIds).toHaveLength(4);
      expect(new Set(requestIds).size).toBe(1);
      const [id] = requestIds;
      expect(callIdsOf(vi.mocked(logger.warn), 'Notion API rate limited, retrying')).toEqual([id, id, id]);
      expect(callIdsOf(vi.mocked(logger.error), 'Notion API error')).toEqual([id]);
    });

    it('tags the network-error line with the callId of its request', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(notionGet('/pages/abc')).rejects.toThrow('fetch failed');

      const [id] = callIdsOf(vi.mocked(logger.info), 'Notion API request');
      expect(id).toEqual(expect.any(String));
      expect(callIdsOf(vi.mocked(logger.error), 'Notion API error')).toEqual([id]);
    });
  });

  describe('notionGetAllResults', () => {
    it('returns results directly when there is only one page', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { results: [{ id: 'a' }, { id: 'b' }], has_more: false, next_cursor: null }),
      );

      const results = await notionGetAllResults('/pages/page-1/properties/prop-1');

      expect(results).toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('follows cursor across multiple pages and merges results', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { results: [{ id: 'a' }], has_more: true, next_cursor: 'cursor-1' }),
        )
        .mockResolvedValueOnce(
          jsonResponse(200, { results: [{ id: 'b' }], has_more: false, next_cursor: null }),
        );

      const results = await notionGetAllResults('/pages/page-1/properties/prop-1');

      expect(results).toEqual([{ id: 'a' }, { id: 'b' }]);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const firstUrl = fetchMock.mock.calls[0][0] as string;
      const secondUrl = fetchMock.mock.calls[1][0] as string;
      expect(firstUrl).toBe('https://api.notion.com/v1/pages/page-1/properties/prop-1?page_size=100');
      expect(secondUrl).toBe(
        'https://api.notion.com/v1/pages/page-1/properties/prop-1?page_size=100&start_cursor=cursor-1',
      );
    });
  });
});
