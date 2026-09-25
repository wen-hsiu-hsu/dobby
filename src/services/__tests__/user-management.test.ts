import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackUser } from '../user-management.js';
import * as usersRepo from '../notion/users-repository.js';
import type { NotionUser } from '../../types/notion-models.js';

vi.mock('../notion/users-repository.js');

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
});

describe('trackUser', () => {
  it('does not call update() when there is nothing new to merge (already-known group, no multiChat)', async () => {
    const existing = makeUser({ groups: ['group-1'] });

    trackUser('user-1', { groupId: 'group-1' }, existing);
    await flush();

    expect(usersRepo.update).not.toHaveBeenCalled();
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 3);
  });

  it('calls update() when a new group needs merging', async () => {
    const existing = makeUser({ groups: ['group-1'] });

    trackUser('user-1', { groupId: 'group-2' }, existing);
    await flush();

    expect(usersRepo.update).toHaveBeenCalledWith('page-1', { groups: ['group-1', 'group-2'] });
    expect(usersRepo.incrementMessageCount).toHaveBeenCalledWith('page-1', 3);
  });

  it('reuses a passed-in knownUser instead of querying findByUserId again', async () => {
    const existing = makeUser();

    trackUser('user-1', {}, existing);
    await flush();

    expect(usersRepo.findByUserId).not.toHaveBeenCalled();
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
    vi.mocked(usersRepo.findByUserId).mockImplementation(async () => ({ ...liveUser }));
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
    // First call trusts its snapshot (nothing else was in flight yet); the second
    // call queues behind it and must re-read fresh instead of trusting its own stale
    // snapshot.
    expect(usersRepo.findByUserId).toHaveBeenCalledTimes(1);
  });
});
