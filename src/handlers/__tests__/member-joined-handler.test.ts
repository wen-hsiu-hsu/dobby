import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MemberJoinEvent } from '@line/bot-sdk';
import { handleMemberJoined } from '../member-joined-handler.js';
import { getProfile } from '../../services/line/profile-service.js';
import { buildMemberJoinedWelcome } from '../../services/welcome-message.js';
import { replyMessage } from '../../services/line/reply-service.js';

vi.mock('../../services/line/profile-service.js');
vi.mock('../../services/welcome-message.js');
vi.mock('../../services/line/reply-service.js');

vi.mock('../../utils/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function memberJoinEvent(source: MemberJoinEvent['source']): MemberJoinEvent {
  return {
    type: 'memberJoined',
    replyToken: 'reply-token-1',
    source,
    joined: { members: [{ type: 'user', userId: 'user-1' }] },
    deliveryContext: { isRedelivery: false },
  } as unknown as MemberJoinEvent;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(buildMemberJoinedWelcome).mockResolvedValue({ type: 'text', text: 'welcome' } as any);
});

describe('handleMemberJoined', () => {
  it('looks up the group member profile (with groupId) when the source is a group', async () => {
    vi.mocked(getProfile).mockResolvedValue({ userId: 'user-1', displayName: 'Alice' });

    await handleMemberJoined(memberJoinEvent({ type: 'group', groupId: 'group-1' } as any));

    expect(getProfile).toHaveBeenCalledWith('user-1', 'group-1');
    expect(buildMemberJoinedWelcome).toHaveBeenCalledWith('user-1', 'Alice');
  });

  it('still looks up the user profile (without groupId) when the source is a room', async () => {
    vi.mocked(getProfile).mockResolvedValue({ userId: 'user-1', displayName: 'Bob' });

    await handleMemberJoined(memberJoinEvent({ type: 'room', roomId: 'room-1' } as any));

    expect(getProfile).toHaveBeenCalledWith('user-1', undefined);
    expect(buildMemberJoinedWelcome).toHaveBeenCalledWith('user-1', 'Bob');
  });

  it('falls back to userId as displayName when getProfile returns null', async () => {
    vi.mocked(getProfile).mockResolvedValue(null);

    await handleMemberJoined(memberJoinEvent({ type: 'room', roomId: 'room-1' } as any));

    expect(buildMemberJoinedWelcome).toHaveBeenCalledWith('user-1', 'user-1');
  });

  it('replies with the built welcome message', async () => {
    vi.mocked(getProfile).mockResolvedValue({ userId: 'user-1', displayName: 'Alice' });
    const welcomeMessage = { type: 'text', text: 'hi Alice' };
    vi.mocked(buildMemberJoinedWelcome).mockResolvedValue(welcomeMessage as any);

    await handleMemberJoined(memberJoinEvent({ type: 'group', groupId: 'group-1' } as any));

    expect(replyMessage).toHaveBeenCalledWith('reply-token-1', [welcomeMessage]);
  });
});
