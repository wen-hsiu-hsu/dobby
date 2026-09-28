import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTarget } from '../target-resolver.js';
import * as usersRepo from '../../../services/notion/users-repository.js';
import * as peopleRepo from '../../../services/notion/people-repository.js';
import type { NotionUser } from '../../../types/notion-models.js';

vi.mock('../../../services/notion/users-repository.js');
vi.mock('../../../services/notion/people-repository.js');

const selfTarget = { isSelf: true } as any;

function makeUser(overrides: Partial<NotionUser> = {}): NotionUser {
  return {
    pageId: 'user-page-1',
    userId: 'user-alice',
    customName: 'alice-line',
    registeredPersonPageId: 'person-1',
    isAdmin: false,
    messageCount: 0,
    groups: [],
    multiChats: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(peopleRepo.findByPageIds).mockResolvedValue([{ pageId: 'person-1', name: 'Alice', hasPaid: true }]);
});

describe('resolveTarget (self)', () => {
  it('uses a non-null actor snapshot without querying USERS again', async () => {
    const result = await resolveTarget(selfTarget, 'user-alice', makeUser());

    expect(usersRepo.findByUserId).not.toHaveBeenCalled();
    expect(result).toEqual({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
  });

  it('re-queries USERS when the snapshot is null (a brand-new group user was just created by trackUser)', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser());

    const result = await resolveTarget(selfTarget, 'user-alice', null);

    expect(usersRepo.findByUserId).toHaveBeenCalledWith('user-alice');
    expect(result).toEqual({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'self' });
  });

  it('re-queries USERS when no snapshot is passed', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);

    const result = await resolveTarget(selfTarget, 'user-alice');

    expect(usersRepo.findByUserId).toHaveBeenCalledWith('user-alice');
    expect(result).toBeNull();
  });

  it('falls back to the LINE custom name when the user has no People page', async () => {
    const result = await resolveTarget(selfTarget, 'user-alice', makeUser({ registeredPersonPageId: '' }));

    expect(peopleRepo.findByPageIds).not.toHaveBeenCalled();
    expect(result).toEqual({ personPageId: '', displayName: 'alice-line', resolvedVia: 'self' });
  });
});

describe('resolveTarget (someone else)', () => {
  it('ignores the actor snapshot and looks up the mentioned user', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser({ userId: 'u-bob', registeredPersonPageId: 'person-1' }));

    await resolveTarget({ isSelf: false, targetUserId: 'u-bob' } as any, 'user-alice', makeUser());

    expect(usersRepo.findByUserId).toHaveBeenCalledWith('u-bob', 'mention-target');
  });

  it('reports resolvedVia "mention" when the mentioned userId has a USERS record', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(makeUser({ userId: 'u-bob', registeredPersonPageId: 'person-1' }));

    const result = await resolveTarget({ isSelf: false, targetUserId: 'u-bob', targetName: 'Bob' }, 'user-alice');

    expect(result).toEqual({ personPageId: 'person-1', displayName: 'Alice', resolvedVia: 'mention' });
    expect(peopleRepo.findByName).not.toHaveBeenCalled();
  });

  it('reports resolvedVia "mention-name-fallback" when the mentioned userId is not in USERS and the name is looked up instead', async () => {
    vi.mocked(usersRepo.findByUserId).mockResolvedValue(null);
    vi.mocked(peopleRepo.findByName).mockResolvedValue({ pageId: 'person-2', name: 'Bob', hasPaid: true });

    const result = await resolveTarget({ isSelf: false, targetUserId: 'u-bob', targetName: 'Bob' }, 'user-alice');

    expect(peopleRepo.findByName).toHaveBeenCalledWith('Bob');
    expect(result).toEqual({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'mention-name-fallback' });
  });

  it('reports resolvedVia "name" for a mention without a userId (LINE PC version)', async () => {
    vi.mocked(peopleRepo.findByName).mockResolvedValue({ pageId: 'person-2', name: 'Bob', hasPaid: true });

    const result = await resolveTarget({ isSelf: false, targetName: 'Bob' }, 'user-alice');

    expect(usersRepo.findByUserId).not.toHaveBeenCalled();
    expect(result).toEqual({ personPageId: 'person-2', displayName: 'Bob', resolvedVia: 'name' });
  });
});
