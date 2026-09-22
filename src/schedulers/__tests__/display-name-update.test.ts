import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateDisplayNames } from '../display-name-update.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import { getProfile } from '../../services/line/profile-service.js';
import type { NotionUser } from '../../types/notion-models.js';

vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/profile-service.js');

const findAllMock = vi.mocked(usersRepo.findAll);
const updateMock = vi.mocked(usersRepo.update);
const getProfileMock = vi.mocked(getProfile);

function makeUser(opts: {
  pageId?: string;
  userId: string;
  customName?: string;
  groups?: string[];
}): NotionUser {
  return {
    pageId: opts.pageId ?? `page-${opts.userId}`,
    userId: opts.userId,
    customName: opts.customName ?? '',
    registeredPersonPageId: '',
    isAdmin: false,
    messageCount: 0,
    groups: opts.groups ?? [],
    multiChats: [],
  };
}

describe('updateDisplayNames', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it('updates the display name via the group member profile API using the user\'s group', async () => {
    findAllMock.mockResolvedValue([makeUser({ userId: 'user-alice', customName: 'OldAlice', groups: ['group-1'] })]);
    getProfileMock.mockResolvedValue({ userId: 'user-alice', displayName: 'Alice' });

    await updateDisplayNames();

    expect(getProfileMock).toHaveBeenCalledWith('user-alice', 'group-1');
    expect(updateMock).toHaveBeenCalledWith('page-user-alice', { customName: 'Alice' });
  });

  it('skips users with no known groups without calling the profile API or throwing', async () => {
    findAllMock.mockResolvedValue([makeUser({ userId: 'user-bob', customName: 'Bob', groups: [] })]);

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(getProfileMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('falls back to the next group when profile lookup fails for an earlier one (e.g. user left that group)', async () => {
    findAllMock.mockResolvedValue([
      makeUser({ userId: 'user-carol', customName: 'OldCarol', groups: ['group-left', 'group-current'] }),
    ]);
    getProfileMock.mockImplementation(async (_userId, groupId) => {
      if (groupId === 'group-left') return null; // e.g. 404, user left this group
      return { userId: 'user-carol', displayName: 'Carol' };
    });

    await updateDisplayNames();

    expect(getProfileMock).toHaveBeenNthCalledWith(1, 'user-carol', 'group-left');
    expect(getProfileMock).toHaveBeenNthCalledWith(2, 'user-carol', 'group-current');
    expect(updateMock).toHaveBeenCalledWith('page-user-carol', { customName: 'Carol' });
  });

  it('skips the user without throwing when every known group fails to resolve a profile', async () => {
    findAllMock.mockResolvedValue([
      makeUser({ userId: 'user-dave', customName: 'Dave', groups: ['group-a', 'group-b'] }),
    ]);
    getProfileMock.mockResolvedValue(null);

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not write to Notion when the resolved display name matches the existing Custom Name', async () => {
    findAllMock.mockResolvedValue([makeUser({ userId: 'user-erin', customName: 'Erin', groups: ['group-1'] })]);
    getProfileMock.mockResolvedValue({ userId: 'user-erin', displayName: 'Erin' });

    await updateDisplayNames();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('continues processing later users when an earlier user has no groups or a failed lookup', async () => {
    findAllMock.mockResolvedValue([
      makeUser({ userId: 'user-nogroup', customName: 'X', groups: [] }),
      makeUser({ userId: 'user-good', customName: 'OldGood', groups: ['group-1'] }),
    ]);
    getProfileMock.mockImplementation(async (userId) => {
      if (userId === 'user-good') return { userId, displayName: 'Good' };
      return null;
    });

    await updateDisplayNames();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('page-user-good', { customName: 'Good' });
  });

  it('continues processing later users when an earlier user throws (single-user failure does not abort the batch)', async () => {
    findAllMock.mockResolvedValue([
      makeUser({ userId: 'user-broken', customName: 'Old', groups: ['group-1'] }),
      makeUser({ userId: 'user-good', customName: 'OldGood', groups: ['group-1'] }),
    ]);
    getProfileMock.mockImplementation(async (userId) => {
      if (userId === 'user-broken') throw new Error('Notion 429');
      return { userId, displayName: 'Good' };
    });

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('page-user-good', { customName: 'Good' });
  });

  it('does not abort the batch when a single Notion write fails', async () => {
    findAllMock.mockResolvedValue([
      makeUser({ userId: 'user-write-fails', customName: 'Old', groups: ['group-1'] }),
      makeUser({ userId: 'user-good', customName: 'OldGood', groups: ['group-1'] }),
    ]);
    getProfileMock.mockImplementation(async (userId) => ({ userId, displayName: `New-${userId}` }));
    updateMock.mockImplementation(async (pageId) => {
      if (pageId === 'page-user-write-fails') throw new Error('Notion API error');
    });

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(updateMock).toHaveBeenCalledWith('page-user-good', { customName: 'New-user-good' });
  });

  it('waits 400ms after processing each user to respect the Notion rate limit', async () => {
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      findAllMock.mockResolvedValue([
        makeUser({ userId: 'user-1', customName: 'Old1', groups: ['group-1'] }),
        makeUser({ userId: 'user-2', customName: 'Old2', groups: ['group-1'] }),
        makeUser({ userId: 'user-3', customName: 'Old3', groups: ['group-1'] }),
      ]);
      getProfileMock.mockImplementation(async (userId: string) => ({ userId, displayName: `New-${userId}` }));

      const promise = updateDisplayNames();
      // Generously covers the 3 * 400ms of throttling this run should perform.
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      // Unlike calendar-repository's findByPageIds (which skips the delay before the
      // first item), this loop's delay sits after the try/catch and runs once per
      // user that isn't skipped by an earlier `continue` — including the very first
      // one — so 3 processed users means 3 delays, not 2.
      expect(setTimeoutSpy).toHaveBeenCalledTimes(3);
      for (const call of setTimeoutSpy.mock.calls) {
        expect(call[1]).toBe(400);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not delay for users skipped via `continue` (no known groups)', async () => {
    vi.useFakeTimers();
    try {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      findAllMock.mockResolvedValue([
        makeUser({ userId: 'user-nogroup', customName: 'X', groups: [] }),
      ]);

      const promise = updateDisplayNames();
      await vi.advanceTimersByTimeAsync(0);
      await promise;

      expect(setTimeoutSpy).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
