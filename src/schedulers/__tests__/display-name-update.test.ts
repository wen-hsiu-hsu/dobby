import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateDisplayNames } from '../display-name-update.js';
import { notionPost } from '../../services/notion/notion-fetch.js';
import * as usersRepo from '../../services/notion/users-repository.js';
import { getProfile } from '../../services/line/profile-service.js';

vi.mock('../../services/notion/notion-fetch.js');
vi.mock('../../services/notion/users-repository.js');
vi.mock('../../services/line/profile-service.js');

const notionPostMock = vi.mocked(notionPost);
const updateMock = vi.mocked(usersRepo.update);
const getProfileMock = vi.mocked(getProfile);

function makeUserPage(opts: {
  id?: string;
  userId: string;
  customName?: string;
  groups?: string[];
}) {
  return {
    id: opts.id ?? `page-${opts.userId}`,
    properties: {
      user_id: { type: 'title', title: [{ plain_text: opts.userId }] },
      'Custom Name': {
        type: 'rich_text',
        rich_text: opts.customName ? [{ plain_text: opts.customName }] : [],
      },
      groups: {
        type: 'multi_select',
        multi_select: (opts.groups ?? []).map((name) => ({ name })),
      },
    },
  };
}

describe('updateDisplayNames', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    updateMock.mockResolvedValue(undefined);
  });

  it('updates the display name via the group member profile API using the user\'s group', async () => {
    notionPostMock.mockResolvedValue({
      results: [makeUserPage({ userId: 'user-alice', customName: 'OldAlice', groups: ['group-1'] })],
    });
    getProfileMock.mockResolvedValue({ userId: 'user-alice', displayName: 'Alice' });

    await updateDisplayNames();

    expect(getProfileMock).toHaveBeenCalledWith('user-alice', 'group-1');
    expect(updateMock).toHaveBeenCalledWith('page-user-alice', { customName: 'Alice' });
  });

  it('skips users with no known groups without calling the profile API or throwing', async () => {
    notionPostMock.mockResolvedValue({
      results: [makeUserPage({ userId: 'user-bob', customName: 'Bob', groups: [] })],
    });

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(getProfileMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('falls back to the next group when profile lookup fails for an earlier one (e.g. user left that group)', async () => {
    notionPostMock.mockResolvedValue({
      results: [
        makeUserPage({
          userId: 'user-carol',
          customName: 'OldCarol',
          groups: ['group-left', 'group-current'],
        }),
      ],
    });
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
    notionPostMock.mockResolvedValue({
      results: [
        makeUserPage({ userId: 'user-dave', customName: 'Dave', groups: ['group-a', 'group-b'] }),
      ],
    });
    getProfileMock.mockResolvedValue(null);

    await expect(updateDisplayNames()).resolves.toBeUndefined();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not write to Notion when the resolved display name matches the existing Custom Name', async () => {
    notionPostMock.mockResolvedValue({
      results: [makeUserPage({ userId: 'user-erin', customName: 'Erin', groups: ['group-1'] })],
    });
    getProfileMock.mockResolvedValue({ userId: 'user-erin', displayName: 'Erin' });

    await updateDisplayNames();

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('continues processing later users when an earlier user has no groups or a failed lookup', async () => {
    notionPostMock.mockResolvedValue({
      results: [
        makeUserPage({ userId: 'user-nogroup', customName: 'X', groups: [] }),
        makeUserPage({ userId: 'user-good', customName: 'OldGood', groups: ['group-1'] }),
      ],
    });
    getProfileMock.mockImplementation(async (userId) => {
      if (userId === 'user-good') return { userId, displayName: 'Good' };
      return null;
    });

    await updateDisplayNames();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledWith('page-user-good', { customName: 'Good' });
  });
});
