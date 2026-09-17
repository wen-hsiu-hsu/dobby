import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withFreshCalendarEvent } from '../with-fresh-calendar-event.js';
import * as mutex from '../../../services/mutex.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../services/mutex.js');
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), error: vi.fn() },
}));

const calEvent = {
  pageId: 'evt-1',
  date: '2026-05-09',
  absentees: [],
  guests: [],
  isPaused: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mutex.withMutex).mockImplementation(async (_key, fn) => fn());
});

describe('withFreshCalendarEvent', () => {
  it('replies with "not found" when refetch finds nothing, without logging an error', async () => {
    const mutation = vi.fn();

    await withFreshCalendarEvent('token', 'dobby', '2026-05-09', 'ctx', () => Promise.resolve(null), mutation);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 2026-05-09 的活動' }], 'dobby');
    expect(mutation).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('locks by date and runs mutation with the refetched value', async () => {
    const fresh = { ...calEvent, guests: ['Alice'] };
    const mutation = vi.fn();

    await withFreshCalendarEvent('token', 'dobby', '2026-05-09', 'ctx', () => Promise.resolve(fresh), mutation);

    expect(mutex.withMutex).toHaveBeenCalledWith('2026-05-09', expect.any(Function));
    expect(mutation).toHaveBeenCalledWith(fresh);
  });

  it('replies with a generic error when the queued mutex task times out', async () => {
    vi.mocked(mutex.withMutex).mockRejectedValue(new Error('Mutex timeout: 2026-05-09'));

    await withFreshCalendarEvent('token', 'dobby', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), vi.fn());

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '系統錯誤，請稍後再試' }], 'dobby');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'ctx error');
  });

  it('replies with a generic error and logs when mutation throws', async () => {
    const mutation = vi.fn().mockRejectedValue(new Error('boom'));

    await withFreshCalendarEvent('token', 'dobby', '2026-05-09', 'my-context', () => Promise.resolve(calEvent), mutation);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '系統錯誤，請稍後再試' }], 'dobby');
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'my-context error');
  });
});
