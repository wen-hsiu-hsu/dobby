import { describe, it, expect, vi } from 'vitest';
import * as mutexModule from '../../../services/mutex.js';
import { withCalendarMutex } from '../calendar-mutex.js';

vi.mock('../../../services/mutex.js');

describe('withCalendarMutex', () => {
  it('locks using the calendar page id as key', async () => {
    vi.mocked(mutexModule.withMutex).mockImplementation(async (_key, fn) => fn());

    await withCalendarMutex('evt1', async () => 'done');

    expect(mutexModule.withMutex).toHaveBeenCalledWith('evt1', expect.any(Function));
  });

  it('returns the wrapped function result', async () => {
    vi.mocked(mutexModule.withMutex).mockImplementation(async (_key, fn) => fn());

    const result = await withCalendarMutex('evt1', async () => 42);

    expect(result).toBe(42);
  });

  it('propagates errors from withMutex', async () => {
    vi.mocked(mutexModule.withMutex).mockRejectedValue(new Error('Mutex busy: evt1'));

    await expect(withCalendarMutex('evt1', async () => 'unreachable')).rejects.toThrow('Mutex busy: evt1');
  });
});
