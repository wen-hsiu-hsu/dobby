import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withFreshCalendarEvent } from '../with-fresh-calendar-event.js';
import * as mutex from '../../../services/mutex.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';

// Keep the real MutexTimeoutError so the wrapper's instanceof check sees the same class.
vi.mock('../../../services/mutex.js', async (importOriginal) => ({
  ...(await importOriginal<typeof mutex>()),
  withMutex: vi.fn(),
}));
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const calEvent = {
  pageId: 'evt-1',
  date: '2026-05-09',
  absentees: [],
  guests: [],
  isPaused: false,
  courts: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mutex.withMutex).mockImplementation(async (_key, fn) => fn());
});

describe('withFreshCalendarEvent', () => {
  it('replies with "not found" when refetch finds nothing, without logging an error', async () => {
    const mutation = vi.fn();

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(null), mutation);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '找不到 2026-05-09 的活動' }]);
    expect(mutation).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    // An expected outcome, not a problem: info (not warn), under the caller's context.
    expect(logger.info).toHaveBeenCalledWith({ outcome: 'event-not-found', date: '2026-05-09' }, 'ctx outcome');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('locks by date and runs mutation with the refetched value', async () => {
    const fresh = { ...calEvent, guests: ['Alice'] };
    const mutation = vi.fn();

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(fresh), mutation);

    expect(mutex.withMutex).toHaveBeenCalledWith('2026-05-09', expect.any(Function));
    expect(mutation).toHaveBeenCalledWith(fresh);
  });

  it('tells the user the result is unknown and not to retry when the mutex times out', async () => {
    vi.mocked(mutex.withMutex).mockRejectedValue(new mutex.MutexTimeoutError('2026-05-09'));

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), vi.fn());

    expect(replyMessage).toHaveBeenCalledWith('token', [
      { type: 'text', text: '處理時間較長，這次操作可能已經完成，請勿重複操作。如需確認，請洽管理員。' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(mutex.MutexTimeoutError) }),
      'ctx timed out; result unknown to the user',
    );
    expect(logger.error).not.toHaveBeenCalled();
    // The warn already says what happened; the background task logs its own outcome later.
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'ctx outcome');
  });

  it('replies with a generic error and logs when mutation throws', async () => {
    const mutation = vi.fn().mockRejectedValue(new Error('boom'));

    await withFreshCalendarEvent('token', '2026-05-09', 'my-context', () => Promise.resolve(calEvent), mutation);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'my-context error');
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'my-context outcome');
  });
});
