import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as usersRepo from '../../services/notion/users-repository.js';
import * as peopleRepo from '../../services/notion/people-repository.js';
import { logger } from '../../utils/logger.js';
import { getReqId } from '../../utils/request-context.js';
import { clearAllReadCaches } from '../../services/notion/read-cache.js';
import { refreshReadCaches, clearAndReloadReadCaches } from '../read-cache-refresh.js';

vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/notion/people-repository.js');
vi.mock('../../services/notion/read-cache.js');
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('refreshReadCaches', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('refreshes both caches under one reqId and logs the entry counts nested (not as top-level numbers)', async () => {
    const reqIds: Array<string | undefined> = [];
    vi.mocked(usersRepo.refreshCache).mockImplementation(async () => (reqIds.push(getReqId()), 40));
    vi.mocked(peopleRepo.refreshCache).mockImplementation(async () => (reqIds.push(getReqId()), 60));

    await refreshReadCaches();

    expect(reqIds[0]).toBeTruthy();
    expect(reqIds[1]).toBe(reqIds[0]);
    expect(logger.info).toHaveBeenCalledWith({ entries: { users: 40, people: 60 } }, 'Read cache refresh complete');
  });

  it('still refreshes People when USERS fails, and warns instead of logging completion', async () => {
    vi.mocked(usersRepo.refreshCache).mockRejectedValue(new Error('Notion 502'));
    vi.mocked(peopleRepo.refreshCache).mockResolvedValue(60);

    await refreshReadCaches();

    expect(peopleRepo.refreshCache).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), 'Read cache refresh failed: users');
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'Read cache refresh complete');
  });

  it('skips a run while the previous one is still going', async () => {
    let finish!: (n: number) => void;
    vi.mocked(usersRepo.refreshCache).mockReturnValue(new Promise((r) => { finish = r; }));
    vi.mocked(peopleRepo.refreshCache).mockResolvedValue(0);

    const first = refreshReadCaches();
    await refreshReadCaches();
    finish(0);
    await first;

    expect(usersRepo.refreshCache).toHaveBeenCalledTimes(1);
  });

  describe('clearAndReloadReadCaches (the /logs button)', () => {
    it('clears every cache, then reloads and returns the counts', async () => {
      vi.mocked(usersRepo.refreshCache).mockResolvedValue(33);
      vi.mocked(peopleRepo.refreshCache).mockResolvedValue(41);

      const result = await clearAndReloadReadCaches();

      expect(clearAllReadCaches).toHaveBeenCalledTimes(1);
      expect(vi.mocked(clearAllReadCaches).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(usersRepo.refreshCache).mock.invocationCallOrder[0]!,
      );
      expect(result).toEqual({ users: 33, people: 41 });
      expect(logger.info).toHaveBeenCalledWith('Read cache cleared from /logs');
    });

    it('waits for a refresh already running (its pre-clear result gets discarded) and then reloads again', async () => {
      let finishFirst!: (n: number) => void;
      vi.mocked(usersRepo.refreshCache)
        .mockReturnValueOnce(new Promise((r) => { finishFirst = r; }))
        .mockResolvedValueOnce(33);
      vi.mocked(peopleRepo.refreshCache).mockResolvedValue(41);

      const scheduled = refreshReadCaches();
      const clearing = clearAndReloadReadCaches();
      finishFirst(30);
      await scheduled;

      expect(await clearing).toEqual({ users: 33, people: 41 });
      expect(usersRepo.refreshCache).toHaveBeenCalledTimes(2);
    });

    it('shares one clear-and-reload between two quick clicks', async () => {
      vi.mocked(usersRepo.refreshCache).mockResolvedValue(33);
      vi.mocked(peopleRepo.refreshCache).mockResolvedValue(41);

      const [a, b] = await Promise.all([clearAndReloadReadCaches(), clearAndReloadReadCaches()]);

      expect(a).toEqual({ users: 33, people: 41 });
      expect(b).toEqual(a);
      expect(clearAllReadCaches).toHaveBeenCalledTimes(1);
      expect(usersRepo.refreshCache).toHaveBeenCalledTimes(1);
    });

    it('reports a table whose reload failed as null instead of throwing', async () => {
      vi.mocked(usersRepo.refreshCache).mockResolvedValue(33);
      vi.mocked(peopleRepo.refreshCache).mockRejectedValue(new Error('Notion 502'));

      expect(await clearAndReloadReadCaches()).toEqual({ users: 33, people: null });
    });
  });
});
