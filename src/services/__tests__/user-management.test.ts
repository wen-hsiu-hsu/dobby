import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackUser, trackJoinedMember } from '../user-management.js';
import * as usersRepo from '../notion/users-repository.js';
import * as peopleRepo from '../notion/people-repository.js';
import { getProfile } from '../line/profile-service.js';
import { logger } from '../../utils/logger.js';
import type { NotionUser } from '../../types/notion-models.js';

vi.mock('../notion/users-repository.js');
vi.mock('../notion/people-repository.js');
vi.mock('../line/profile-service.js');
vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeUser(overrides: Partial<NotionUser> = {}): NotionUser {
  return {
    pageId: 'page-1',
    userId: 'user-1',
    customName: 'Test User',
    registeredPersonPageId: '',
    isAdmin: false,
    messageCount: 3,
    groups: ['group-1'],
    multiChats: [],
    ...overrides,
  };
}

// trackUser is fire-and-forget; flush the microtask queue so its internal
// async work has settled before asserting.
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(peopleRepo.findByName).mockResolvedValue(null);
  vi.mocked(peopleRepo.create).mockImplementation(async (name) => ({ pageId: 'person-new', name, hasPaid: true }));
});

describe('trackUser', () => {
  it('does not call update() when there is nothing new to merge (already-known group, no multiChat)', async () => {
    const existing = makeUser({ groups: ['group-1'] });
    vi.mocked(usersRepo.findByPageId).mockResolvedValue({ ...existing });

    trackUser('user-1', { groupId: 'group-1' }, existing);
    await flush();

    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 3);
  });

  it('calls update() when a new group needs merging', async () => {
    const existing = makeUser({ groups: ['group-1'] });
    vi.mocked(usersRepo.findByPageId).mockResolvedValue({ ...existing });

    trackUser('user-1', { groupId: 'group-2' }, existing);
    await flush();

    expect(usersRepo.update).toHaveBeenCalledWith('page-1', { groups: ['group-1', 'group-2'] });
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 3);
  });

  it('re-reads a known user by page ID inside the lock and computes the update from that, not the snapshot', async () => {
    const snapshot = makeUser({ groups: ['group-1'], messageCount: 3 });
    vi.mocked(usersRepo.findByPageId).mockResolvedValue(makeUser({ groups: ['group-1', 'group-9'], messageCount: 7 }));

    trackUser('user-1', { groupId: 'group-2' }, snapshot);
    await flush();

    expect(usersRepo.findByPageId).toHaveBeenCalledWith('page-1');
    expect(usersRepo.findByUserId).not.toHaveBeenCalled();
    expect(usersRepo.update).toHaveBeenCalledWith('page-1', { groups: ['group-1', 'group-9', 'group-2'] });
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 7);
  });

  it('falls back to looking the user up by userId when the known page has been trashed', async () => {
    vi.mocked(usersRepo.findByPageId).mockResolvedValue(null);
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser({ pageId: 'page-2', messageCount: 10 }));

    trackUser('user-1', {}, makeUser());
    await flush();

    expect(usersRepo.findByUserId).toHaveBeenCalledWith('user-1', 'track-user');
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-2', 10);
    expect(usersRepo.create).not.toHaveBeenCalled();
  });
});

describe('trackUser new user creation', () => {
  beforeEach(() => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);
    vi.mocked(usersRepo.create).mockResolvedValue(makeUser({ pageId: 'page-new' }));
  });

  it('creates the user with their current LINE display name when seen in a group', async () => {
    vi.mocked(getProfile).mockResolvedValue({ userId: 'user-1', displayName: 'Alice' });

    trackUser('user-1', { groupId: 'group-1' });
    await flush();

    expect(getProfile).toHaveBeenCalledWith('user-1', 'group-1');
    expect(usersRepo.create).toHaveBeenCalledWith('user-1', 'Alice', 1);
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'], registeredPersonPageId: 'person-new' });
  });

  it('falls back to the userId as customName when the profile lookup fails', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);

    trackUser('user-1', { groupId: 'group-1' });
    await flush();

    expect(usersRepo.create).toHaveBeenCalledWith('user-1', 'user-1', 1);
  });

  it('falls back to the friend profile lookup when only seen in a multi-person chat room', async () => {
    vi.mocked(getProfile).mockResolvedValue({ userId: 'user-1', displayName: 'Bob' });

    trackUser('user-1', { multiChatId: 'room-1' });
    await flush();

    expect(getProfile).toHaveBeenCalledWith('user-1', undefined);
    expect(usersRepo.create).toHaveBeenCalledWith('user-1', 'Bob', 1);
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { multiChats: ['room-1'], registeredPersonPageId: 'person-new' });
  });

  it('re-reads instead of trusting a null snapshot, so a page created in the meantime is not duplicated', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser({ groups: ['group-1'] }));

    // Caller's lookup returned null, but another call already created the page and released the lock.
    trackUser('user-1', { groupId: 'group-1' }, null);
    await flush();

    expect(usersRepo.findByUserId).toHaveBeenCalledWith('user-1', 'track-user');
    expect(usersRepo.create).not.toHaveBeenCalled();
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 3);
  });
});

describe('trackJoinedMember', () => {
  it('creates a new user with the pre-fetched display name without looking up the profile again', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);
    vi.mocked(usersRepo.create).mockResolvedValue(makeUser({ pageId: 'page-new' }));

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(getProfile).not.toHaveBeenCalled();
    expect(usersRepo.create).toHaveBeenCalledWith('user-1', 'Alice', 0);
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'], registeredPersonPageId: 'person-new' });
  });

  it('falls back to userId without retrying the lookup when the caller already found no profile', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);
    vi.mocked(usersRepo.create).mockResolvedValue(makeUser({ pageId: 'page-new' }));

    await trackJoinedMember('user-1', { groupId: 'group-1' }, null);

    expect(getProfile).not.toHaveBeenCalled();
    expect(usersRepo.create).toHaveBeenCalledWith('user-1', 'user-1', 0);
  });

  it('merges the new group into an existing user without counting it as a message', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser({ groups: ['group-1'] }));

    await trackJoinedMember('user-1', { groupId: 'group-2' }, 'Alice');

    expect(usersRepo.create).not.toHaveBeenCalled();
    expect(usersRepo.update).toHaveBeenCalledWith('page-1', { groups: ['group-1', 'group-2'] });
    expect(usersRepo.incrementMessageCount).not.toHaveBeenCalled();
  });

  it('propagates Notion failures to the caller', async () => {
    vi.mocked(usersRepo.findByUserId).mockRejectedValue(new Error('notion down'));

    await expect(trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice')).rejects.toThrow('notion down');
  });
});

describe('new user people list linking', () => {
  beforeEach(() => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);
    vi.mocked(usersRepo.create).mockResolvedValue(makeUser({ pageId: 'page-new' }));
  });

  it('creates a people page named after the custom name and links it via Registered name', async () => {
    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(peopleRepo.findByName).toHaveBeenCalledWith('Alice');
    expect(peopleRepo.create).toHaveBeenCalledWith('Alice');
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'], registeredPersonPageId: 'person-new' });
  });

  it('uses the userId as the people page name when no display name was found', async () => {
    await trackJoinedMember('user-1', { groupId: 'group-1' }, null);

    expect(peopleRepo.create).toHaveBeenCalledWith('user-1');
  });

  it('skips creating and linking when the people list already has that name', async () => {
    vi.mocked(peopleRepo.findByName).mockResolvedValue({ pageId: 'person-existing', name: 'Alice', hasPaid: true });

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(peopleRepo.create).not.toHaveBeenCalled();
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'] });
    expect(logger.warn).toHaveBeenCalledWith(
      { userId: 'user-1', personPageId: 'person-existing' },
      'People list already has this name, skipped auto-link'
    );
  });

  it('still records groups on the new user when creating the people page fails', async () => {
    vi.mocked(peopleRepo.create).mockRejectedValue(new Error('notion down'));

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'] });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'Failed to create people record for new user (non-blocking)'
    );
  });

  it('still records groups on the new user when the same-name lookup fails', async () => {
    vi.mocked(peopleRepo.findByName).mockRejectedValue(new Error('notion down'));

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(peopleRepo.create).not.toHaveBeenCalled();
    expect(usersRepo.update).toHaveBeenCalledWith('page-new', { groups: ['group-1'] });
  });

  it('logs a new-user summary with personLink=created once the link is written', async () => {
    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(logger.info).toHaveBeenCalledWith({ usersPageId: 'page-new', personLink: 'created' }, 'New user created');
    // userId 是身分識別資訊，只在 debug
    expect(logger.debug).toHaveBeenCalledWith(
      { userId: 'user-1', usersPageId: 'page-new', personPageId: 'person-new' },
      'New user created detail'
    );
  });

  it('logs personLink=same-name-skipped when the people list already has that name', async () => {
    vi.mocked(peopleRepo.findByName).mockResolvedValue({ pageId: 'person-existing', name: 'Alice', hasPaid: true });

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(logger.info).toHaveBeenCalledWith(
      { usersPageId: 'page-new', personLink: 'same-name-skipped' },
      'New user created'
    );
    expect(logger.debug).toHaveBeenCalledWith({ userId: 'user-1', usersPageId: 'page-new' }, 'New user created detail');
  });

  it('logs personLink=failed when creating the people page fails', async () => {
    vi.mocked(peopleRepo.create).mockRejectedValue(new Error('notion down'));

    await trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');

    expect(logger.info).toHaveBeenCalledWith({ usersPageId: 'page-new', personLink: 'failed' }, 'New user created');
  });

  it('does not log the new-user summary when writing the link fails', async () => {
    vi.mocked(usersRepo.update).mockRejectedValue(new Error('notion down'));

    await expect(trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice')).rejects.toThrow('notion down');

    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'New user created');
  });

  it('does not touch the people list for an existing user', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser());

    await trackJoinedMember('user-1', { groupId: 'group-2' }, 'Alice');

    expect(peopleRepo.findByName).not.toHaveBeenCalled();
    expect(peopleRepo.create).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), 'New user created');
  });
});

// Deliberately do NOT mock '../mutex.js' here — these tests drive trackUser() with
// the REAL withMutex so they exercise the actual serialization, not a no-op stub.
// See registration-concurrency.test.ts for the same rationale applied to
// registration/leave.
describe('trackUser concurrency', () => {
  it('does not lose an update when two calls for the same userId race (fire-and-forget from two quick messages)', async () => {
    // Both callers "look up" the user before either call reaches the lock — this
    // mirrors message-handler.ts, which does its own findByUserId() for the admin
    // check and passes the result in as knownUser. Both snapshots are identical and
    // pre-date either write.
    let liveUser = makeUser({ groups: ['group-1'], multiChats: [], messageCount: 3 });
    const snapshotA = { ...liveUser };
    const snapshotB = { ...liveUser };

    const incrementCallArgs: number[] = [];
    vi.mocked(usersRepo.findByPageId).mockImplementation(async () => ({ ...liveUser }));
    vi.mocked(usersRepo.update).mockImplementation(async (_pageId, updates) => {
      liveUser = { ...liveUser, ...updates };
    });
    vi.mocked(usersRepo.incrementMessageCount).mockImplementation(async (_pageId, currentCount) => {
      incrementCallArgs.push(currentCount);
      liveUser = { ...liveUser, messageCount: currentCount + 1 };
    });

    // Fired synchronously back-to-back, exactly like two trackUser() calls from two
    // separate handleMessage() invocations that both happen to be in flight together.
    trackUser('user-1', { groupId: 'group-2' }, snapshotA);
    trackUser('user-1', { groupId: 'group-3' }, snapshotB);

    await flush();
    await flush();

    // If the second call had trusted its stale snapshot instead of re-reading inside
    // the lock, it would have recomputed groups from ['group-1'] + 'group-3' and
    // overwritten the first call's 'group-2' addition, and both calls would have
    // incremented from the same messageCount (3), losing one increment.
    expect(liveUser.groups.sort()).toEqual(['group-1', 'group-2', 'group-3']);
    expect(liveUser.messageCount).toBe(5);
    expect(incrementCallArgs).toEqual([3, 4]);
    // Both calls re-read the page inside the lock; neither trusts its snapshot.
    expect(usersRepo.findByPageId).toHaveBeenCalledTimes(2);
    expect(usersRepo.findByUserId).not.toHaveBeenCalled();
  });

  it('does not trust a snapshot taken before an earlier call for the same user finished writing', async () => {
    // message-handler read the snapshot while the previous message's trackUser() was still
    // writing, but that call has finished by the time this one starts — nothing is locked,
    // yet the snapshot is stale. No timeout needed.
    let liveUser = makeUser({ groups: ['group-1'], multiChats: [], messageCount: 3 });
    const staleSnapshot = { ...liveUser };
    vi.mocked(usersRepo.findByPageId).mockImplementation(async () => ({ ...liveUser }));
    vi.mocked(usersRepo.update).mockImplementation(async (_pageId, updates) => {
      liveUser = { ...liveUser, ...updates };
    });
    vi.mocked(usersRepo.incrementMessageCount).mockImplementation(async (_pageId, currentCount) => {
      liveUser = { ...liveUser, messageCount: currentCount + 1 };
    });

    await trackUser('user-1', { groupId: 'group-2' }, staleSnapshot);
    await trackUser('user-1', { groupId: 'group-3' }, staleSnapshot);

    expect(liveUser.groups.sort()).toEqual(['group-1', 'group-2', 'group-3']);
    expect(liveUser.messageCount).toBe(5);
  });

  it('does not trust the snapshot while an earlier call is still writing after its caller timed out', async () => {
    // Only fake setTimeout: flush() relies on a real setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Also released in `finally`: if this test fails midway, a write left blocked would
    // stall the module-level mutex queue for this userId and fail the later tests too.
    let releaseFirstWrite!: () => void;
    const firstWriteBlocked = new Promise<void>((resolve) => { releaseFirstWrite = resolve; });
    try {
      let liveUser = makeUser({ groups: ['group-1'], multiChats: [], messageCount: 3 });
      const snapshot = { ...liveUser };
      vi.mocked(usersRepo.findByPageId).mockImplementation(async () => ({ ...liveUser }));
      vi.mocked(usersRepo.update)
        .mockImplementationOnce(async (_pageId, updates) => {
          await firstWriteBlocked;
          liveUser = { ...liveUser, ...updates };
        })
        .mockImplementation(async (_pageId, updates) => {
          liveUser = { ...liveUser, ...updates };
        });
      vi.mocked(usersRepo.incrementMessageCount).mockImplementation(async (_pageId, currentCount) => {
        liveUser = { ...liveUser, messageCount: currentCount + 1 };
      });

      const first = trackUser('user-1', { groupId: 'group-2' }, snapshot);
      await flush();
      // The first caller gives up after 10s; its write keeps running in the background
      // (ADR 0002), so no caller is waiting on the lock any more.
      await vi.advanceTimersByTimeAsync(10_000);
      await first;
      const second = trackUser('user-1', { groupId: 'group-3' }, snapshot);
      releaseFirstWrite();
      await second;

      expect(liveUser.groups.sort()).toEqual(['group-1', 'group-2', 'group-3']);
      expect(liveUser.messageCount).toBe(5);
    } finally {
      releaseFirstWrite();
      vi.useRealTimers();
    }
  });

  it('creates only one page when a brand-new member joins and immediately sends a message', async () => {
    let liveUser: NotionUser | null = null;
    vi.mocked(usersRepo.findByUserId).mockImplementation(async () => (liveUser ? { ...liveUser } : null));
    vi.mocked(usersRepo.create).mockImplementation(async (userId, customName, messageCount) => {
      liveUser = makeUser({ pageId: 'page-new', userId, customName, groups: [], messageCount });
      return { ...liveUser };
    });
    vi.mocked(usersRepo.update).mockImplementation(async (_pageId, updates) => {
      liveUser = { ...liveUser!, ...updates };
    });
    vi.mocked(usersRepo.incrementMessageCount).mockImplementation(async (_pageId, currentCount) => {
      liveUser = { ...liveUser!, messageCount: currentCount + 1 };
    });

    const join = trackJoinedMember('user-1', { groupId: 'group-1' }, 'Alice');
    // message-handler looked the user up before the join's create landed.
    trackUser('user-1', { groupId: 'group-1' }, null);

    await join;
    await flush();
    await flush();

    expect(usersRepo.create).toHaveBeenCalledTimes(1);
    expect(liveUser).toMatchObject({ customName: 'Alice', groups: ['group-1'], messageCount: 1 });
  });
});
