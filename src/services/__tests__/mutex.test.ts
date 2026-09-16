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

    const first = withMutex('key3', () => firstGate).then(() => {
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

  it('times out a single task after 10 seconds without blocking the next queued task', async () => {
    vi.useFakeTimers();
    let resolveStuck!: () => void;

    const stuck = withMutex('key5', () => new Promise<void>((r) => { resolveStuck = r; }));
    // Attach the rejection assertion before advancing timers so the rejection is never unhandled.
    const stuckAssertion = expect(stuck).rejects.toThrow('Mutex timeout: key5');
    const next = withMutex('key5', async () => 'after-timeout');

    expect(isLocked('key5')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);

    await stuckAssertion;
    await expect(next).resolves.toBe('after-timeout');
    expect(isLocked('key5')).toBe(false);

    resolveStuck();
    vi.useRealTimers();
  });
});
