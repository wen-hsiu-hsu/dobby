import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withFreshCalendarEvent } from '../with-fresh-calendar-event.js';
import * as mutex from '../../../services/mutex.js';
import { replyMessage } from '../../../services/line/reply-service.js';
import { logger } from '../../../utils/logger.js';
import { buildEventStatusReply, type EventStatusParams } from '../event-status-message.js';

// Keep the real MutexTimeoutError so the wrapper's instanceof check sees the same class.
vi.mock('../../../services/mutex.js', async (importOriginal) => ({
  ...(await importOriginal<typeof mutex>()),
  withMutex: vi.fn(),
}));
vi.mock('../../../services/line/reply-service.js');
vi.mock('../event-status-message.js');
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

const status: EventStatusParams = {
  date: '2026-05-09',
  headline: '報名成功 ✅',
  badgeColor: 'lime',
  badgeIcon: 'icon',
  title: '報名成功',
  subtitle: 'Alice 報名 1 位',
  guests: ['Alice'],
  totalSlots: 4,
  presentSeasonMembers: 8,
  guestFee: 200,
  eventPageId: 'evt-1',
  absenteePageIds: ['person-1'],
};
const card = { type: 'flex', altText: 'alt', contents: { type: 'bubble' } } as const;

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

  it('locks by date, never cancelling a queued task, and runs mutation with the refetched value', async () => {
    const fresh = { ...calEvent, guests: ['Alice'] };
    const mutation = vi.fn().mockResolvedValue(status);
    vi.mocked(buildEventStatusReply).mockResolvedValue(card);

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(fresh), mutation);

    // No cancelIfNotStarted: a skipped queued task would let the ones behind it go first (ADR 0002).
    expect(mutex.withMutex).toHaveBeenCalledWith('2026-05-09', expect.any(Function));
    expect(mutation).toHaveBeenCalledWith(fresh);
  });

  it("builds and sends the mutation's status card only after the lock is released", async () => {
    let lockHeld = false;
    vi.mocked(mutex.withMutex).mockImplementation(async (_key, fn) => {
      lockHeld = true;
      try {
        return await fn();
      } finally {
        lockHeld = false;
      }
    });
    const heldDuring: boolean[] = [];
    vi.mocked(buildEventStatusReply).mockImplementation(async () => {
      heldDuring.push(lockHeld);
      return card;
    });
    vi.mocked(replyMessage).mockImplementation(async () => {
      heldDuring.push(lockHeld);
    });

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), () => Promise.resolve(status));

    expect(buildEventStatusReply).toHaveBeenCalledWith(status);
    expect(replyMessage).toHaveBeenCalledWith('token', [card]);
    expect(heldDuring).toEqual([false, false]);
  });

  it('falls back to the headline, not "系統錯誤", when building the status card throws', async () => {
    vi.mocked(buildEventStatusReply).mockRejectedValue(new Error('Notion 502'));

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), () => Promise.resolve(status));

    expect(replyMessage).toHaveBeenCalledTimes(1);
    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '報名成功 ✅\n（名額狀態暫時無法顯示）' }]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'ctx status card failed; replied with the headline only',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('tells the user the result is unknown and not to retry when the mutex times out after the task started', async () => {
    vi.mocked(mutex.withMutex).mockRejectedValue(new mutex.MutexTimeoutError('2026-05-09', true, false));

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), vi.fn());

    expect(replyMessage).toHaveBeenCalledWith('token', [
      { type: 'text', text: '處理時間較長，這次操作可能已經完成，請勿重複操作。如需確認，請洽管理員。' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(mutex.MutexTimeoutError) }),
      'ctx timed out; result unknown to the user',
    );
    expect(logger.error).not.toHaveBeenCalled();
    // Only the timeout message: the background task's card would be rejected anyway.
    expect(replyMessage).toHaveBeenCalledTimes(1);
    expect(buildEventStatusReply).not.toHaveBeenCalled();
    // The warn already says what happened; the background task logs its own outcome later.
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'ctx outcome');
  });

  it('still tells the user not to retry when the mutex times out while the task is still queued', async () => {
    // Queued tasks aren't cancelled, so this one will run later and may still write.
    vi.mocked(mutex.withMutex).mockRejectedValue(new mutex.MutexTimeoutError('2026-05-09', false, false));

    await withFreshCalendarEvent('token', '2026-05-09', 'ctx', () => Promise.resolve(calEvent), vi.fn());

    expect(replyMessage).toHaveBeenCalledTimes(1);
    expect(replyMessage).toHaveBeenCalledWith('token', [
      { type: 'text', text: '處理時間較長，這次操作可能已經完成，請勿重複操作。如需確認，請洽管理員。' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(mutex.MutexTimeoutError) }),
      'ctx timed out; result unknown to the user',
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(buildEventStatusReply).not.toHaveBeenCalled();
  });

  it('replies with a generic error and logs when mutation throws', async () => {
    const mutation = vi.fn().mockRejectedValue(new Error('boom'));

    await withFreshCalendarEvent('token', '2026-05-09', 'my-context', () => Promise.resolve(calEvent), mutation);

    expect(replyMessage).toHaveBeenCalledWith('token', [{ type: 'text', text: '系統錯誤，請稍後再試' }]);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'my-context error');
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'my-context outcome');
  });
});
