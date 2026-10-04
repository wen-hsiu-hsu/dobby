import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReadCache, clearAllReadCaches } from '../read-cache.js';

interface Rec {
  id: string;
  version: string;
  name: string;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const rec = (name: string, version = 'page-1'): Rec => ({ id: 'k', version, name });

describe('ReadCache', () => {
  let cache: ReadCache<Rec>;

  beforeEach(() => {
    cache = new ReadCache<Rec>('test', 1000, (r) => r.version);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves a hit without loading again, as a copy the caller can mutate safely', async () => {
    const load = vi.fn().mockResolvedValue(rec('Alice'));

    const first = await cache.getOrLoad('k', load);
    first!.name = 'mutated';
    const second = await cache.getOrLoad('k', load);

    expect(load).toHaveBeenCalledTimes(1);
    expect(second).toEqual(rec('Alice'));
  });

  it('never stores null, so a record created later is found', async () => {
    const load = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(rec('Alice'));

    expect(await cache.getOrLoad('k', load)).toBeNull();
    expect(await cache.getOrLoad('k', load)).toEqual(rec('Alice'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('reloads once an entry is older than maxAgeMs', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValueOnce(rec('old')).mockResolvedValueOnce(rec('new'));

    await cache.getOrLoad('k', load);
    vi.advanceTimersByTime(1001);

    expect(await cache.getOrLoad('k', load)).toEqual(rec('new'));
  });

  it('shares one load between concurrent callers of the same key', async () => {
    const d = deferred<Rec | null>();
    const load = vi.fn().mockReturnValue(d.promise);

    const a = cache.getOrLoad('k', load);
    const b = cache.getOrLoad('k', load);
    d.resolve(rec('Alice'));

    expect(await a).toEqual(rec('Alice'));
    expect(await b).toEqual(rec('Alice'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not keep a failed load: the next call loads again', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Notion 502')).mockResolvedValueOnce(rec('Alice'));

    await expect(cache.getOrLoad('k', load)).rejects.toThrow('Notion 502');
    expect(await cache.getOrLoad('k', load)).toEqual(rec('Alice'));
  });

  it('drops the entry on invalidate, matching by versionKey rather than the lookup key', async () => {
    const load = vi.fn().mockResolvedValueOnce(rec('old')).mockResolvedValueOnce(rec('new'));
    await cache.getOrLoad('k', load);

    cache.invalidate('page-1');

    expect(await cache.getOrLoad('k', load)).toEqual(rec('new'));
  });

  it('does not store a load that started before a write finished (it may have read the old value)', async () => {
    const stale = deferred<Rec | null>();
    const load = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(rec('new'));

    const inFlight = cache.getOrLoad('k', load);
    cache.invalidate('page-1'); // before the PATCH
    cache.invalidate('page-1'); // after the PATCH
    stale.resolve(rec('old'));

    // The caller that started first still gets what it read, but it isn't cached.
    expect(await inFlight).toEqual(rec('old'));
    expect(await cache.getOrLoad('k', load)).toEqual(rec('new'));
  });

  it('does not let a caller arriving after a write join a load that started before it', async () => {
    const stale = deferred<Rec | null>();
    const load = vi.fn().mockReturnValueOnce(stale.promise).mockResolvedValueOnce(rec('new'));

    const first = cache.getOrLoad('k', load);
    cache.invalidate('page-1');
    const second = cache.getOrLoad('k', load);
    stale.resolve(rec('old'));

    expect(await first).toEqual(rec('old'));
    expect(await second).toEqual(rec('new'));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('put wins over a load that started before it, even if that load finishes later', async () => {
    const older = deferred<Rec | null>();
    const inFlight = cache.getOrLoad('k', () => older.promise);

    cache.put('k', rec('written'));
    older.resolve(rec('stale'));
    await inFlight;

    expect(await cache.getOrLoad('k', vi.fn())).toEqual(rec('written'));
  });

  describe('replaceAll', () => {
    it('serves every snapshot entry without loading', async () => {
      await cache.replaceAll(async () => [
        ['a', { id: 'a', version: 'pa', name: 'A' }],
        ['b', { id: 'b', version: 'pb', name: 'B' }],
      ]);
      const load = vi.fn();

      expect(await cache.getOrLoad('b', load)).toEqual({ id: 'b', version: 'pb', name: 'B' });
      expect(load).not.toHaveBeenCalled();
    });

    it('drops older entries missing from the snapshot (deleted in Notion)', async () => {
      await cache.getOrLoad('gone', async () => ({ id: 'gone', version: 'pg', name: 'G' }));

      await cache.replaceAll(async () => []);
      const load = vi.fn().mockResolvedValue(null);

      expect(await cache.getOrLoad('gone', load)).toBeNull();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it('keeps an entry loaded after the snapshot query started, and does not overwrite it', async () => {
      const snapshot = deferred<Array<[string, Rec]>>();
      const refreshing = cache.replaceAll(() => snapshot.promise);
      await cache.getOrLoad('k', async () => rec('newer'));

      snapshot.resolve([['k', rec('older')]]);
      await refreshing;

      expect(await cache.getOrLoad('k', vi.fn())).toEqual(rec('newer'));
    });

    it('skips snapshot entries written after the snapshot query started', async () => {
      const snapshot = deferred<Array<[string, Rec]>>();
      const refreshing = cache.replaceAll(() => snapshot.promise);
      cache.invalidate('page-1');

      snapshot.resolve([['k', rec('before-write')]]);
      await refreshing;
      const load = vi.fn().mockResolvedValue(rec('after-write'));

      expect(await cache.getOrLoad('k', load)).toEqual(rec('after-write'));
    });

    it('keeps the old entries when the snapshot query fails', async () => {
      await cache.getOrLoad('k', async () => rec('Alice'));

      await expect(cache.replaceAll(async () => { throw new Error('Notion 502'); })).rejects.toThrow();

      expect(await cache.getOrLoad('k', vi.fn())).toEqual(rec('Alice'));
    });
  });

  it('does not store a load or snapshot that started before clear (it may be pre-clear data)', async () => {
    const load = deferred<Rec | null>();
    const snapshot = deferred<Array<[string, Rec]>>();
    const loading = cache.getOrLoad('k', () => load.promise);
    const refreshing = cache.replaceAll(() => snapshot.promise);

    cache.clear();
    load.resolve(rec('stale'));
    snapshot.resolve([['k', rec('stale')], ['other', { id: 'o', version: 'po', name: 'O' }]]);
    await loading;
    await refreshing;
    const fresh = vi.fn().mockResolvedValue(rec('fresh'));

    expect(await cache.getOrLoad('k', fresh)).toEqual(rec('fresh'));
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('clearAllReadCaches empties every cache instance', async () => {
    await cache.getOrLoad('k', async () => rec('Alice'));

    clearAllReadCaches();
    const load = vi.fn().mockResolvedValue(rec('again'));

    expect(await cache.getOrLoad('k', load)).toEqual(rec('again'));
  });
});
