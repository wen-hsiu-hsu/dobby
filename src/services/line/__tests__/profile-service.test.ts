import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProfile } from '../profile-service.js';
import { lineClient } from '../../../config/line.js';
import { logger } from '../../../utils/logger.js';

vi.mock('../../../config/line.js', () => ({
  lineClient: { getProfile: vi.fn(), getGroupMemberProfile: vi.fn() },
}));

vi.mock('../../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetProfile = vi.mocked(lineClient.getProfile);
const mockGetGroupMemberProfile = vi.mocked(lineClient.getGroupMemberProfile);

beforeEach(() => {
  vi.resetAllMocks();
});

describe('getProfile', () => {
  it('logs an info-level summary with method/path but no userId/groupId on success (no groupId)', async () => {
    mockGetProfile.mockResolvedValue({ userId: 'u1', displayName: 'Alice', pictureUrl: undefined } as any);

    const result = await getProfile('u1');

    expect(result).toEqual({ userId: 'u1', displayName: 'Alice', pictureUrl: undefined });
    expect(logger.info).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/profile/{userId}' },
      'LINE get profile',
    );
    const infoCall = vi.mocked(logger.info).mock.calls[0]![0];
    expect(infoCall).not.toHaveProperty('userId');
    expect(infoCall).not.toHaveProperty('groupId');
  });

  it('uses the group member path and logs userId/groupId/displayName only at debug level (with groupId)', async () => {
    mockGetGroupMemberProfile.mockResolvedValue({ userId: 'u1', displayName: 'Bob', pictureUrl: undefined } as any);

    const result = await getProfile('u1', 'g1');

    expect(result).toEqual({ userId: 'u1', displayName: 'Bob', pictureUrl: undefined });
    expect(logger.info).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/group/{groupId}/member/{userId}' },
      'LINE get profile',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/group/{groupId}/member/{userId}', userId: 'u1', groupId: 'g1', displayName: 'Bob' },
      'LINE get profile detail',
    );
  });

  it('logs debug with userId/groupId/displayName for the no-groupId case too', async () => {
    mockGetProfile.mockResolvedValue({ userId: 'u1', displayName: 'Alice', pictureUrl: undefined } as any);

    await getProfile('u1');

    expect(logger.debug).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/profile/{userId}', userId: 'u1', groupId: undefined, displayName: 'Alice' },
      'LINE get profile detail',
    );
  });

  it('on failure (getProfile), warns without userId/groupId, debug-logs with them, and returns null', async () => {
    const err = new Error('boom');
    mockGetProfile.mockRejectedValue(err);

    const result = await getProfile('u1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      { err, method: 'GET', path: '/v2/bot/profile/{userId}' },
      'Could not get user profile',
    );
    const warnCall = vi.mocked(logger.warn).mock.calls[0]![0];
    expect(warnCall).not.toHaveProperty('userId');
    expect(warnCall).not.toHaveProperty('groupId');
    expect(logger.debug).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/profile/{userId}', userId: 'u1', groupId: undefined },
      'Could not get user profile detail',
    );
  });

  it('on failure (getGroupMemberProfile), warns without userId/groupId, debug-logs with them, and returns null', async () => {
    const err = new Error('boom');
    mockGetGroupMemberProfile.mockRejectedValue(err);

    const result = await getProfile('u1', 'g1');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      { err, method: 'GET', path: '/v2/bot/group/{groupId}/member/{userId}' },
      'Could not get user profile',
    );
    const warnCall = vi.mocked(logger.warn).mock.calls[0]![0];
    expect(warnCall).not.toHaveProperty('userId');
    expect(warnCall).not.toHaveProperty('groupId');
    expect(logger.debug).toHaveBeenCalledWith(
      { method: 'GET', path: '/v2/bot/group/{groupId}/member/{userId}', userId: 'u1', groupId: 'g1' },
      'Could not get user profile detail',
    );
  });
});
