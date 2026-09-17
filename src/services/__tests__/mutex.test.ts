import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withMutex, isLocked } from '../mutex.js';

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
});
