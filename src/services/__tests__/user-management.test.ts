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
