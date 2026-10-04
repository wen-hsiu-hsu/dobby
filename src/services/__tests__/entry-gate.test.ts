import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withEntryTicket, enterInOrder } from '../entry-gate.js';
import { logger } from '../../utils/logger.js';

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

// The gate keeps per-key state at module level, so each test uses its own key.
let keySeq = 0;
function freshKey(): string {
  keySeq += 1;
  return `2026-01-${String(keySeq).padStart(2, '0')}`;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('entry gate', () => {
  it('just calls enter when there is no ticket in context', async () => {
    const enter = vi.fn().mockResolvedValue('done');

    await expect(enterInOrder(enter)).resolves.toBe('done');

    expect(enter).toHaveBeenCalledTimes(1);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('lets an earlier ticket enter first even when a later ticket finishes its lookups first', async () => {
    const key = freshKey();
    const entered: string[] = [];
    const lookupA = deferred();

    const a = withEntryTicket(key, 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => entered.push('A'));
    });
    const b = withEntryTicket(key, 2, () => enterInOrder(async () => entered.push('B')));

    await flushMicrotasks();
    expect(entered).toEqual([]);

    lookupA.resolve();
    await Promise.all([a, b]);
    expect(entered).toEqual(['A', 'B']);
  });

  it('starts every ticket holder right away, so lookups before the lock stay parallel', async () => {
    const key = freshKey();
    const lookupA = deferred();
    const startedB = vi.fn();

    const a = withEntryTicket(key, 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => undefined);
    });
    const b = withEntryTicket(key, 2, async () => {
      startedB();
      return enterInOrder(async () => undefined);
    });

    expect(startedB).toHaveBeenCalledTimes(1);
    lookupA.resolve();
    await Promise.all([a, b]);
  });

  it('lets the next ticket in as soon as enter() is called, not when the entered work settles', async () => {
    const key = freshKey();
    const workA = deferred();
    const enteredB = vi.fn();

    const a = withEntryTicket(key, 1, () => enterInOrder(() => workA.promise));
    const b = withEntryTicket(key, 2, () => enterInOrder(async () => enteredB()));

    await b;
    expect(enteredB).toHaveBeenCalledTimes(1);

    workA.resolve();
    await a;
  });

  it('frees the line when a ticket holder exits without entering', async () => {
    const key = freshKey();
    const entered = vi.fn();

    await withEntryTicket(key, 1, async () => 'parse error');
    await withEntryTicket(key, 2, () => enterInOrder(async () => entered()));

    expect(entered).toHaveBeenCalledTimes(1);
  });

  it('frees the line when a ticket holder throws before entering, and still rejects with its error', async () => {
    const key = freshKey();
    const entered = vi.fn();

    const a = withEntryTicket(key, 1, async () => {
      throw new Error('Notion down');
    });
    const b = withEntryTicket(key, 2, () => enterInOrder(async () => entered()));

    await expect(a).rejects.toThrow('Notion down');
    await b;
    expect(entered).toHaveBeenCalledTimes(1);
  });

  it('does not let a ticket that exits early open the line for tickets behind it while an earlier one is still out', async () => {
    const key = freshKey();
    const entered: string[] = [];
    const lookupA = deferred();

    const a = withEntryTicket(key, 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => entered.push('A'));
    });
    const b = withEntryTicket(key, 2, async () => 'not admin');
    const c = withEntryTicket(key, 3, () => enterInOrder(async () => entered.push('C')));

    await b;
    await flushMicrotasks();
    expect(entered).toEqual([]);

    lookupA.resolve();
    await Promise.all([a, c]);
    expect(entered).toEqual(['A', 'C']);
  });

  it('keeps different keys independent', async () => {
    const lookupA = deferred();
    const enteredB = vi.fn();

    const a = withEntryTicket(freshKey(), 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => undefined);
    });
    await withEntryTicket(freshKey(), 2, () => enterInOrder(async () => enteredB()));

    expect(enteredB).toHaveBeenCalledTimes(1);
    lookupA.resolve();
    await a;
  });

  it('logs each pass at info with the ticket number and LINE timestamp, and no user identity', async () => {
    const key = freshKey();

    await withEntryTicket(key, 1700000000000, () => enterInOrder(async () => undefined));

    expect(logger.info).toHaveBeenCalledWith(
      { key, ticket: 1, gateWaitMs: expect.any(Number), lineTimestamp: 1700000000000 },
      'Entry gate passed',
    );
  });

  it('logs a non-date key at debug and without the key, so a future user-scoped key cannot leak a userId', async () => {
    await withEntryTicket('user-track-U123', undefined, () => enterInOrder(async () => undefined));

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ key: undefined, ticket: 1 }), 'Entry gate passed');
  });

  it('enters out of order after the 5-second cap when an earlier ticket is stuck, and warns', async () => {
    vi.useFakeTimers();
    const key = freshKey();
    const lookupA = deferred();
    const enteredB = vi.fn();

    const a = withEntryTicket(key, 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => undefined);
    });
    const b = withEntryTicket(key, 2, () => enterInOrder(async () => enteredB()));

    await vi.advanceTimersByTimeAsync(4_999);
    expect(enteredB).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await b;
    expect(enteredB).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key, ticket: 2 }),
      'Entry gate wait capped; entering out of order',
    );

    lookupA.resolve();
    await a;
  });

  it('costs the line one cap for a stuck ticket, not one cap per ticket behind it', async () => {
    vi.useFakeTimers();
    const key = freshKey();
    const lookupA = deferred();
    const entered: string[] = [];

    const a = withEntryTicket(key, 1, async () => {
      await lookupA.promise;
      return enterInOrder(async () => undefined);
    });
    const b = withEntryTicket(key, 2, () => enterInOrder(async () => entered.push('B')));
    await vi.advanceTimersByTimeAsync(1_000);
    const c = withEntryTicket(key, 3, () => enterInOrder(async () => entered.push('C')));

    // B's cap fires 5s after it took its ticket; C right behind it, well before its own cap.
    await vi.advanceTimersByTimeAsync(4_000);
    await Promise.all([b, c]);
    expect(entered).toEqual(['B', 'C']);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ key, ticket: 3 }), 'Entry gate passed');

    lookupA.resolve();
    await a;
  });
});
