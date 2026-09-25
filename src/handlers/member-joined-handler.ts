import type { MemberJoinEvent } from '@line/bot-sdk';
import { replyMessage } from '../services/line/reply-service.js';
import { buildMemberJoinedWelcome } from '../services/welcome-message.js';
import { getProfile } from '../services/line/profile-service.js';
import { logger } from '../utils/logger.js';

export async function handleMemberJoined(event: MemberJoinEvent): Promise<void> {
  try {
    const members = event.joined.members;
    const groupId = event.source.type === 'group' ? event.source.groupId : undefined;

    for (const member of members) {
      if (member.type !== 'user') continue;
      const userId = member.userId;

      const profile = await getProfile(userId, groupId);
      const displayName = profile?.displayName ?? userId;

      const message = await buildMemberJoinedWelcome(userId, displayName);
      await replyMessage(event.replyToken, [message]);
    }
  } catch (err) {
    logger.error({ err }, 'MemberJoined handler error');
  }
}
