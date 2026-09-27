import type { MemberJoinEvent } from '@line/bot-sdk';
import { replyMessage } from '../services/line/reply-service.js';
import { buildMemberJoinedWelcome } from '../services/welcome-message.js';
import { getProfile } from '../services/line/profile-service.js';
import { trackJoinedMember } from '../services/user-management.js';
import { logger } from '../utils/logger.js';

export async function handleMemberJoined(event: MemberJoinEvent): Promise<void> {
  try {
    const members = event.joined.members;
    const groupId = event.source.type === 'group' ? event.source.groupId : undefined;
    const multiChatId = event.source.type === 'room' ? event.source.roomId : undefined;

    for (const member of members) {
      if (member.type !== 'user') continue;
      const userId = member.userId;

      const profile = await getProfile(userId, groupId);
      const displayName = profile?.displayName ?? userId;

      const message = await buildMemberJoinedWelcome(userId, displayName);
      await replyMessage(event.replyToken, [message]);

      // Awaited one member at a time (not fire-and-forget) so a bulk join doesn't
      // burst Notion's rate limit; the webhook already returned 200 before this runs.
      try {
        await trackJoinedMember(userId, { groupId, multiChatId }, profile?.displayName ?? null);
      } catch (err) {
        logger.warn({ err, userId }, 'Failed to record joined member (non-blocking)');
      }
    }
  } catch (err) {
    logger.error({ err }, 'MemberJoined handler error');
  }
}
