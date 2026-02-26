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

  it('throws when lock is busy', async () => {
    let resolve!: () => void;
    const promise = withMutex('key3', () => new Promise<void>((r) => { resolve = r; }));

    await expect(withMutex('key3', async () => {})).rejects.toThrow('Mutex busy: key3');
    resolve();
    await promise;
  });

  it('releases lock on error in fn (finally)', async () => {
    await expect(
      withMutex('key4', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    expect(isLocked('key4')).toBe(false);
  });

  it('auto-releases after 10 second timeout', async () => {
    vi.useFakeTimers();
    let resolve!: () => void;
    const promise = withMutex('key5', () => new Promise<void>((r) => { resolve = r; }));

    expect(isLocked('key5')).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(isLocked('key5')).toBe(false);

    resolve();
    await promise;
    vi.useRealTimers();
  });
});
