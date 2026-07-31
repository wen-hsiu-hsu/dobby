import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionGet, notionPost, notionPatch } from '../notion-fetch.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
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
});
