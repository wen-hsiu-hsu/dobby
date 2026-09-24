import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRegistration } from '../registration-handler.js';
import * as calendarRepo from '../../../services/notion/calendar-repository.js';
import * as seasonRepo from '../../../services/notion/season-repository.js';
import * as dateUtils from '../../../utils/date-utils.js';
import { resolveTarget } from '../target-resolver.js';
import { getCurrentSeasonName } from '../../../utils/date-utils.js';

// Deliberately do NOT `vi.mock('../../../services/mutex.js')` here. Every other
// registration/leave test (registration-handler.test.ts, leave-handler.test.ts,
// with-fresh-calendar-event.test.ts, and createTestBot itself) mocks withMutex as a
// no-op that just runs the callback immediately — that's the right simplification
// for testing business logic, but it means none of those tests ever exercise the
// actual queueing behaviour. This file drives handleRegistration with the REAL
// withMutex so we can verify the full command-handler flow genuinely depends on it
// to serialize same-day writes and lets different-day writes run independently.
// See TODO.md: "withMutex 鎖跟報名/請假的完整 command handler 流程沒有整合測試驗證併發情境".
vi.mock('../../../services/notion/calendar-repository.js');
vi.mock('../../../services/notion/season-repository.js');
vi.mock('../../../services/notion/people-repository.js');
vi.mock('../target-resolver.js');
vi.mock('../../../services/line/reply-service.js');
vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// Keep the real date-utils implementations (so getCurrentSeasonName / formatDate
// behave normally), but wrap getNextSaturday in a spy so the "independent keys"
// test can force two different event dates without depending on real wall-clock
// timing (there's exactly one real "next Saturday" at any given instant).
vi.mock('../../../utils/date-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/date-utils.js')>();
  return { ...actual, getNextSaturday: vi.fn(actual.getNextSaturday) };
});

function makeEvent(userId: string) {
  return {
    replyToken: `token-${userId}`,
    message: { text: '@Dobby +1', mention: { mentionees: [] } },
    source: { userId },
  };
}

function baseSeason(overrides: Partial<Awaited<ReturnType<typeof seasonRepo.findByName>>> = {}) {
  return {
    pageId: 'season-1',
    name: getCurrentSeasonName(),
    members: ['person-1', 'person-2'],
    courts: 5,
    guestFee: 200,
    location: '',
    weekCounts: 0,
    pricePerPersonForSeason: null,
    pricePerPersonOverride: null,
    totalPrice: null,
    playDatePageIds: [],
    ...overrides,
  } as any;
}

/**
 * Flushes a fixed, generous number of microtask ticks. Everything standing between
 * calling handleRegistration and it reaching `withMutex` (resolveTarget,
 * seasonRepo.findByName) is a mocked, already-resolved promise — a fixed small
 * number of hops determined by the current code path, not by real time — so this is
 * deterministic across runs, unlike a real `setTimeout`-based wait.
 */
async function flushMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveTarget).mockImplementation(async (_target, actorUserId) =>
    actorUserId === 'user-alice'
      ? { personPageId: 'person-1', displayName: 'Alice' }
      : { personPageId: 'person-2', displayName: 'Bob' },
  );
  vi.mocked(seasonRepo.findByName).mockResolvedValue(baseSeason());
});

describe('registration concurrency (real withMutex)', () => {
  it('serializes two near-simultaneous +1 requests for the same event date so neither write clobbers the other', async () => {
    let guestsState: string[] = [];
    const order: string[] = [];
    let findByDateCallCount = 0;
    let resolveFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((r) => {
      resolveFetchStarted = r;
    });
    let releaseFirstFetch!: () => void;
    const firstFetchGate = new Promise<void>((r) => {
      releaseFirstFetch = r;
    });

    vi.mocked(calendarRepo.findByDate).mockImplementation(async (date: string) => {
      findByDateCallCount++;
      // Snapshot captured at CALL time, before any artificial delay — this simulates
      // a query whose result is already determined but slow to come back, which is
      // what makes this test able to catch a real lost-update bug: if withMutex ever
      // failed to serialize these two calls, the second call's snapshot would still
      // be the stale pre-write ([]) one, and its write would silently clobber the
      // first call's, instead of building on top of it.
      const snapshot = [...guestsState];
      order.push(`findByDate-${findByDateCallCount}`);
      if (findByDateCallCount === 1) {
        resolveFetchStarted();
        await firstFetchGate;
      }
      return { pageId: 'evt-1', date, absentees: [], guests: snapshot, isPaused: false, courts: null };
    });

    vi.mocked(calendarRepo.updateGuests).mockImplementation(async (_pageId: string, newGuests: string[]) => {
      guestsState = newGuests;
      order.push(`updateGuests:${newGuests.join(',')}`);
    });

    const callA = handleRegistration(makeEvent('user-alice'), 1, false);

    // Wait until A has genuinely entered its withMutex-protected fn and is blocked
    // inside the (gated) first findByDate call — not just "been called".
    await fetchStarted;

    const callB = handleRegistration(makeEvent('user-bob'), 1, false);

    // Give B's own chain (resolveTarget -> seasonRepo.findByName -> withMutex(date))
    // plenty of microtask ticks to run and reach withMutex.
    await flushMicrotasks();

    // B must still be queued behind A at this point: its own findByDate must not
    // have run yet. If this ever becomes 2 here, either the handler stopped wrapping
    // the read-modify-write in withMutex, or something changed the lock key so the
    // two calls no longer share it.
    expect(findByDateCallCount).toBe(1);

    releaseFirstFetch();
    await callA;
    await callB;

    expect(calendarRepo.updateGuests).toHaveBeenCalledTimes(2);
    expect(order).toEqual([
      'findByDate-1',
      'updateGuests:Alice的朋友',
      'findByDate-2',
      'updateGuests:Alice的朋友,Bob的朋友',
    ]);
    expect(guestsState).toEqual(['Alice的朋友', 'Bob的朋友']);
  });

  it('does not block a request for a different event date behind one still in flight', async () => {
    const DATE_A = '2026-05-09';
    const DATE_B = '2026-05-16';

    let resolveFetchStartedA!: () => void;
    const fetchStartedA = new Promise<void>((r) => {
      resolveFetchStartedA = r;
    });
    let releaseGateA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseGateA = r;
    });

    vi.mocked(dateUtils.getNextSaturday)
      .mockReturnValueOnce(new Date(Date.UTC(2026, 4, 9)))
      .mockReturnValueOnce(new Date(Date.UTC(2026, 4, 16)));

    vi.mocked(calendarRepo.findByDate).mockImplementation(async (date: string) => {
      if (date === DATE_A) {
        resolveFetchStartedA();
        await gateA;
        return { pageId: 'evt-A', date, absentees: [], guests: [], isPaused: false, courts: null };
      }
      return { pageId: 'evt-B', date, absentees: [], guests: [], isPaused: false, courts: null };
    });
    vi.mocked(calendarRepo.updateGuests).mockResolvedValue(undefined);

    let aSettled = false;
    const callA = handleRegistration(makeEvent('user-alice'), 1, false);
    void callA.finally(() => {
      aSettled = true;
    });

    // Wait until A is genuinely blocked mid-flight on DATE_A's (gated) findByDate call.
    await fetchStartedA;

    const callB = handleRegistration(makeEvent('user-bob'), 1, false);
    await callB;

    // B targets a different event date and must complete while A is still stuck —
    // proving the two dates don't share a lock. If someone ever changed the lock key
    // to something coarser than the event date, this would start failing (B would
    // hang until A's gate is released).
    expect(aSettled).toBe(false);
    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-B', ['Bob的朋友']);

    releaseGateA();
    await callA;
    expect(calendarRepo.updateGuests).toHaveBeenCalledWith('evt-A', ['Alice的朋友']);
  });
});
