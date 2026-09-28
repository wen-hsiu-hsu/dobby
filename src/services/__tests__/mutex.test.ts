import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withMutex, isLocked, MutexTimeoutError } from '../mutex.js';
import { logger } from '../../utils/logger.js';
import { runWithContext, getReqId } from '../../utils/request-context.js';

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('mutex', () => {
  it('acquires lock and runs fn', async () => {
    const result = await withMutex('key1', async () => 'done');
    expect(result).toBe('done');
  });

  it('releases lock after fn completes', async () => {
    await withMutex('key2', async () => 'x');
    expect(isLocked('key2')).toBe(false);
  });

  it('queues a second call for the same key instead of rejecting, running it after the first finishes', async () => {
    let resolveFirst!: () => void;
    // Created eagerly so resolveFirst is assigned synchronously, regardless of when withMutex invokes fn.
    const firstGate = new Promise<void>((r) => { resolveFirst = r; });
    const order: string[] = [];

    const first = withMutex('key3', async () => {
      await firstGate;
      order.push('first');
    });

    // Second call should not resolve/reject while the first is still holding the key.
    const second = withMutex('key3', async () => {
      order.push('second');
    });

    expect(isLocked('key3')).toBe(true);
    resolveFirst();
    await first;
    await second;

    expect(order).toEqual(['first', 'second']);
    expect(isLocked('key3')).toBe(false);
  });

  it('releases lock on error in fn, without blocking later queued calls', async () => {
    await expect(
      withMutex('key4', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');

    // A later call for the same key should still run normally.
    const result = await withMutex('key4', async () => 'ok');
    expect(result).toBe('ok');
    expect(isLocked('key4')).toBe(false);
  });

  it('does not start the next queued task until the timed-out task truly finishes running', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let resolveStuck!: () => void;

    const stuck = withMutex('key5', () => {
      order.push('first-start');
      return new Promise<void>((r) => { resolveStuck = r; });
    });
    // Attach the rejection assertion before advancing timers so the rejection is never unhandled.
    const stuckAssertion = expect(stuck).rejects.toThrow('Mutex timeout: key5');
    // withFreshCalendarEvent branches on this class to avoid telling users a write failed.
    const stuckTypeAssertion = expect(stuck).rejects.toBeInstanceOf(MutexTimeoutError);

    // Stagger the second call's own 10s timeout window so it starts strictly after
    // the first's — each call's timeout is armed at call time, independent of queue
    // position, so without staggering both would time out at the same instant.
    await vi.advanceTimersByTimeAsync(100);

    const next = withMutex('key5', async () => {
      order.push('second-start');
      return 'after-timeout';
    });

    expect(isLocked('key5')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000 - 100);
    await stuckAssertion;
    await stuckTypeAssertion;

    // The first caller has given up, but `next` is still queued/pending, so the key
    // is still considered locked from a caller's perspective.
    expect(isLocked('key5')).toBe(true);
    // Crucially: the second task must NOT have started yet — it has to wait for the
    // first task's real fn() to actually finish, not just for its caller to time out.
    expect(order).toEqual(['first-start']);

    resolveStuck();
    await vi.advanceTimersByTimeAsync(0);

    await expect(next).resolves.toBe('after-timeout');
    expect(order).toEqual(['first-start', 'second-start']);
    expect(isLocked('key5')).toBe(false);

    vi.useRealTimers();
  });

  it('does not produce an unhandled rejection when the timed-out background task eventually fails, and still runs the next task', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let rejectStuck!: (err: Error) => void;

    const stuck = withMutex('key6', () => new Promise<void>((_, rej) => { rejectStuck = rej; }));
    const stuckAssertion = expect(stuck).rejects.toThrow('Mutex timeout: key6');

    // Stagger the second call's timeout window; see the previous test for why.
    await vi.advanceTimersByTimeAsync(100);

    const next = withMutex('key6', async () => {
      order.push('next-start');
      return 'ok';
    });

    await vi.advanceTimersByTimeAsync(10_000 - 100);
    await stuckAssertion;

    expect(order).toEqual([]);

    // The background task itself finally fails, well after its caller already timed out.
    rejectStuck(new Error('background failure'));
    await vi.advanceTimersByTimeAsync(0);

    await expect(next).resolves.toBe('ok');
    expect(order).toEqual(['next-start']);

    vi.useRealTimers();
  });

  it('keeps FIFO execution order even when every queued call times out for its caller', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    const resolvers: Array<() => void> = [];

    function makeTask(label: string) {
      return () => new Promise<void>((r) => {
        resolvers.push(r);
        order.push(`${label}-start`);
      });
    }

    const a = withMutex('key7', makeTask('a'));
    const b = withMutex('key7', makeTask('b'));
    const c = withMutex('key7', makeTask('c'));

    const aAssertion = expect(a).rejects.toThrow('Mutex timeout: key7');
    const bAssertion = expect(b).rejects.toThrow('Mutex timeout: key7');
    const cAssertion = expect(c).rejects.toThrow('Mutex timeout: key7');

    // All three callers' 10s timeouts were armed at (essentially) the same instant,
    // so a single advance makes all three callers give up.
    await vi.advanceTimersByTimeAsync(10_000);
    await aAssertion;
    await bAssertion;
    await cAssertion;

    // Even though every caller has already timed out, b and c's real fn() must not
    // have started — they're still strictly behind a's real completion.
    expect(order).toEqual(['a-start']);

    resolvers[0](); // let a's real fn actually finish
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['a-start', 'b-start']);

    resolvers[1](); // let b's real fn actually finish
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['a-start', 'b-start', 'c-start']);

    resolvers[2](); // let c's real fn actually finish
    await vi.advanceTimersByTimeAsync(0);

    vi.useRealTimers();
  });

  it('keeps different keys fully independent', async () => {
    const order: string[] = [];
    let resolveA!: () => void;

    const a = withMutex('keyA', () => new Promise<void>((r) => { resolveA = r; })).then(() => {
      order.push('a');
    });
    const b = withMutex('keyB', async () => {
      order.push('b');
    });

    await b;
    expect(order).toEqual(['b']);
    expect(isLocked('keyB')).toBe(false);
    expect(isLocked('keyA')).toBe(true);

    resolveA();
    await a;
    expect(order).toEqual(['b', 'a']);
    expect(isLocked('keyA')).toBe(false);
  });

  it('does not let a fresh call jump ahead of a still-running timed-out task, even after pending drops to zero', async () => {
    vi.useFakeTimers();
    const order: string[] = [];
    let resolveStuck!: () => void;

    const a = withMutex('key8', () => new Promise<void>((r) => { resolveStuck = r; }));
    const aAssertion = expect(a).rejects.toThrow('Mutex timeout: key8');

    await vi.advanceTimersByTimeAsync(10_000);
    await aAssertion;

    // Nothing else is queued at this point, so pending truly drops to zero.
    expect(isLocked('key8')).toBe(false);

    // A brand-new call arrives after a's caller already gave up, but before a's real
    // fn() has resolved. This is the exact scenario the queues-cleanup-must-follow-tail
    // fix guards against: cleaning up the queue entry when pending hits zero (instead
    // of when the background task truly settles) would let this call skip the line.
    const c = withMutex('key8', async () => {
      order.push('c-start');
      return 'c-result';
    });

    // c must NOT start yet — it has to wait for a's real fn to finish.
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual([]);

    resolveStuck();
    await expect(c).resolves.toBe('c-result');
    expect(order).toEqual(['c-start']);

    vi.useRealTimers();
  });

  it('isLocked reflects whether a caller is still waiting for a response, not whether a background task is still running', async () => {
    vi.useFakeTimers();
    let resolveStuck!: () => void;

    const a = withMutex('key9', () => new Promise<void>((r) => { resolveStuck = r; }));
    expect(isLocked('key9')).toBe(true);

    const aAssertion = expect(a).rejects.toThrow('Mutex timeout: key9');
    await vi.advanceTimersByTimeAsync(10_000);
    await aAssertion;

    // The caller gave up, so isLocked is false even though the background task
    // (a's real fn) is still running.
    expect(isLocked('key9')).toBe(false);

    resolveStuck();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  describe('task summary log', () => {
    const SUMMARY = 'Mutex task finished';

    function summaryCalls(level: 'info' | 'debug') {
      return vi.mocked(logger[level]).mock.calls.filter(([, msg]) => msg === SUMMARY).map(([obj]) => obj);
    }

    beforeEach(() => {
      vi.clearAllMocks();
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('logs one info summary with the real hold time once fn settles', async () => {
      const p = withMutex('2026-10-03', async () => {
        await new Promise((r) => setTimeout(r, 300));
        return 'ok';
      });
      await vi.advanceTimersByTimeAsync(300);
      await expect(p).resolves.toBe('ok');

      expect(summaryCalls('info')).toEqual([
        { key: '2026-10-03', queuedAhead: 0, waitMs: 0, heldMs: 300, callerTimedOut: false, fnFailed: false },
      ]);
      expect(summaryCalls('debug')).toEqual([]);
    });

    it('reports how many tasks were ahead and how long the queued one waited', async () => {
      const first = withMutex('2026-10-04', () => new Promise<void>((r) => setTimeout(r, 500)));
      await vi.advanceTimersByTimeAsync(100);
      const second = withMutex('2026-10-04', () => new Promise<void>((r) => setTimeout(r, 200)));

      await vi.advanceTimersByTimeAsync(600);
      await first;
      await second;

      expect(summaryCalls('info')).toEqual([
        { key: '2026-10-04', queuedAhead: 0, waitMs: 0, heldMs: 500, callerTimedOut: false, fnFailed: false },
        // Arrived at t=100, started when the first finished at t=500.
        { key: '2026-10-04', queuedAhead: 1, waitMs: 400, heldMs: 200, callerTimedOut: false, fnFailed: false },
      ]);
    });

    it('marks fnFailed when fn rejects and the caller was still waiting', async () => {
      await expect(withMutex('2026-10-05', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
      await vi.advanceTimersByTimeAsync(0);

      expect(summaryCalls('info')).toEqual([
        expect.objectContaining({ key: '2026-10-05', callerTimedOut: false, fnFailed: true }),
      ]);
    });

    it('after a caller timeout, logs the summary only when the background fn really finishes, with the true hold time', async () => {
      let resolveStuck!: () => void;
      const a = withMutex('2026-10-06', () => new Promise<void>((r) => { resolveStuck = r; }));
      const aAssertion = expect(a).rejects.toBeInstanceOf(MutexTimeoutError);

      await vi.advanceTimersByTimeAsync(10_000);
      await aAssertion;
      expect(logger.warn).toHaveBeenCalledWith(
        { key: '2026-10-06', queuedAhead: 0 },
        expect.stringContaining('timed out')
      );
      // The caller has gone, but fn() is still running: no summary yet.
      expect(summaryCalls('info')).toEqual([]);

      await vi.advanceTimersByTimeAsync(5_000);
      resolveStuck();
      await vi.advanceTimersByTimeAsync(0);

      expect(summaryCalls('info')).toEqual([
        { key: '2026-10-06', queuedAhead: 0, waitMs: 0, heldMs: 15_000, callerTimedOut: true, fnFailed: false },
      ]);
    });

    it('records a background failure after a caller timeout, which is otherwise swallowed', async () => {
      let rejectStuck!: (err: Error) => void;
      const a = withMutex('2026-10-07', () => new Promise<void>((_, rej) => { rejectStuck = rej; }));
      const aAssertion = expect(a).rejects.toBeInstanceOf(MutexTimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await aAssertion;

      rejectStuck(new Error('background failure'));
      await vi.advanceTimersByTimeAsync(0);

      expect(summaryCalls('info')).toEqual([
        expect.objectContaining({ key: '2026-10-07', callerTimedOut: true, fnFailed: true }),
      ]);
    });

    it('counts a timed-out task that is still running in queuedAhead, without changing isLocked', async () => {
      let resolveStuck!: () => void;
      const a = withMutex('2026-10-08', () => new Promise<void>((r) => { resolveStuck = r; }));
      const aAssertion = expect(a).rejects.toBeInstanceOf(MutexTimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await aAssertion;

      // pending is back to zero, so isLocked keeps its caller-waiting semantics...
      expect(isLocked('2026-10-08')).toBe(false);

      const c = withMutex('2026-10-08', async () => 'c');
      await vi.advanceTimersByTimeAsync(1_000);
      resolveStuck();
      await expect(c).resolves.toBe('c');

      // ...but the new call still sees the background task ahead of it.
      const [, cSummary] = summaryCalls('info');
      expect(cSummary).toEqual({
        key: '2026-10-08', queuedAhead: 1, waitMs: 1_000, heldMs: 0, callerTimedOut: false, fnFailed: false,
      });
    });

    it('includes the timed-out task in queuedAhead on the next caller timeout warning', async () => {
      let resolveStuck!: () => void;
      const a = withMutex('2026-10-09', () => new Promise<void>((r) => { resolveStuck = r; }));
      const aAssertion = expect(a).rejects.toBeInstanceOf(MutexTimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await aAssertion;

      const b = withMutex('2026-10-09', async () => 'b');
      const bAssertion = expect(b).rejects.toBeInstanceOf(MutexTimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await bAssertion;

      expect(logger.warn).toHaveBeenLastCalledWith(
        { key: '2026-10-09', queuedAhead: 1 },
        expect.stringContaining('timed out')
      );

      resolveStuck();
      await vi.advanceTimersByTimeAsync(0);
    });

    it('keeps keys that are not a bare date (e.g. user-track-<userId>) out of info', async () => {
      await withMutex('user-track-U123', async () => undefined);
      await vi.advanceTimersByTimeAsync(0);

      expect(summaryCalls('info')).toEqual([]);
      expect(summaryCalls('debug')).toEqual([
        expect.objectContaining({ key: 'user-track-U123', queuedAhead: 0 }),
      ]);
    });

    it("keeps the caller's reqId on a summary written after the caller timed out, even when fn is finished from another context", async () => {
      // The real logger reads reqId from AsyncLocalStorage at call time; capture it the same way.
      const reqIds: Array<string | undefined> = [];
      vi.mocked(logger.info).mockImplementation(((_obj: unknown, msg?: string) => {
        if (msg === SUMMARY) reqIds.push(getReqId());
      }) as never);

      let resolveStuck!: () => void;
      let callerReqId: string | undefined;
      const caller = runWithContext(async () => {
        callerReqId = getReqId();
        await withMutex('2026-10-10', () => new Promise<void>((r) => { resolveStuck = r; }));
      });
      const callerAssertion = expect(caller).rejects.toBeInstanceOf(MutexTimeoutError);
      await vi.advanceTimersByTimeAsync(10_000);
      await callerAssertion;

      // Finish the background task from inside a different request's context.
      let otherReqId: string | undefined;
      await runWithContext(async () => {
        otherReqId = getReqId();
        resolveStuck();
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(callerReqId).toBeDefined();
      expect(otherReqId).not.toBe(callerReqId);
      expect(reqIds).toEqual([callerReqId]);
    });
  });
});
