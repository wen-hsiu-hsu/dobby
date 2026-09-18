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
  } as unknown as Response;
}

describe('notion-fetch', () => {
  beforeEach(() => {
    fetchMock.mockReset();
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
      expect.objectContaining({ method: 'GET', path: '/pages/missing', status: 400 }),
      'Notion API error',
    );
  });

  it('throws and logs an error on non-ok response for POST and PATCH too', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { message: 'server error' }));

    await expect(notionPost('/pages', {})).rejects.toThrow('Notion API error');
    await expect(notionPatch('/pages/x', {})).rejects.toThrow('Notion API error');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST', path: '/pages', status: 500 }),
      'Notion API error',
    );
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PATCH', path: '/pages/x', status: 500 }),
      'Notion API error',
    );
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
        expect.objectContaining({ method: 'GET', path: '/pages/abc', attempt: 1 }),
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
        { method: 'POST', path: '/pages', db: undefined },
        'Notion API request',
      );
      expect(logger.info).toHaveBeenCalledWith(
        { method: 'POST', path: '/pages', db: undefined },
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
