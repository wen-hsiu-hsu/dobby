import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notionPost } from '../notion-fetch.js';
import { queryAlignedToIds } from '../reverse-relation-query.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../notion-fetch.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const notionPostMock = vi.mocked(notionPost);

function page(id: string) {
  return { id, properties: {} };
}

function run(ids: string[], fetchOne = vi.fn(async (id: string) => ({ pageId: id, via: 'get' }))) {
  return {
    fetchOne,
    promise: queryAlignedToIds({
      databaseId: 'db-1',
      filter: { property: 'x', relation: { contains: 'parent' } },
      ids,
      toRecord: (p) => ({ pageId: p.id, via: 'query' }),
      fetchOne,
    }),
  };
}

describe('queryAlignedToIds', () => {
  beforeEach(() => {
    notionPostMock.mockReset();
    vi.mocked(logger.warn).mockClear();
  });

  it('returns records in the order of ids, not the query order', async () => {
    notionPostMock.mockResolvedValue({ results: [page('b'), page('c'), page('a')], has_more: false, next_cursor: null });

    const { promise, fetchOne } = run(['a', 'b', 'c']);

    expect((await promise).map((r) => r.pageId)).toEqual(['a', 'b', 'c']);
    expect(fetchOne).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('drops pages the query returned that are not in ids', async () => {
    notionPostMock.mockResolvedValue({ results: [page('a'), page('stale')], has_more: false, next_cursor: null });

    const { promise } = run(['a']);

    expect((await promise).map((r) => r.pageId)).toEqual(['a']);
  });

  it('fetches pages the query missed one by one, 400ms apart, and logs a warning', async () => {
    notionPostMock.mockResolvedValue({ results: [page('b')], has_more: false, next_cursor: null });
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const { promise, fetchOne } = run(['a', 'b', 'c']);
      await vi.advanceTimersByTimeAsync(1000);
      const records = await promise;

      expect(records).toEqual([
        { pageId: 'a', via: 'get' },
        { pageId: 'b', via: 'query' },
        { pageId: 'c', via: 'get' },
      ]);
      expect(fetchOne.mock.calls.map(([id]) => id)).toEqual(['a', 'c']);
      expect(setTimeoutSpy.mock.calls.map((c) => c[1])).toEqual([400]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ missing: ['a', 'c'], queried: 1, expected: 3 }),
        expect.any(String),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('follows next_cursor across query pages', async () => {
    notionPostMock
      .mockResolvedValueOnce({ results: [page('a')], has_more: true, next_cursor: 'cursor-2' })
      .mockResolvedValueOnce({ results: [page('b')], has_more: false, next_cursor: null });
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const { promise, fetchOne } = run(['a', 'b']);
      await vi.advanceTimersByTimeAsync(1000);

      expect((await promise).map((r) => r.pageId)).toEqual(['a', 'b']);
      expect(fetchOne).not.toHaveBeenCalled();
      expect(notionPostMock).toHaveBeenCalledTimes(2);
      expect(notionPostMock.mock.calls[0]![1]).not.toHaveProperty('start_cursor');
      expect(notionPostMock.mock.calls[1]![1]).toMatchObject({ start_cursor: 'cursor-2' });
      // 頁與頁之間 400ms，第一頁之前不等
      expect(setTimeoutSpy.mock.calls.map((c) => c[1])).toEqual([400]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches a missing page only once even if ids repeats it', async () => {
    notionPostMock.mockResolvedValue({ results: [], has_more: false, next_cursor: null });

    const { promise, fetchOne } = run(['a', 'a']);

    expect((await promise).map((r) => r.pageId)).toEqual(['a', 'a']);
    expect(fetchOne).toHaveBeenCalledTimes(1);
  });

  it('makes no call when ids is empty', async () => {
    const { promise } = run([]);

    expect(await promise).toEqual([]);
    expect(notionPostMock).not.toHaveBeenCalled();
  });
});
