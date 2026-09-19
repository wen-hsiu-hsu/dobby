import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export async function getProfile(userId: string, groupId?: string): Promise<LineProfile | null> {
  try {
    if (groupId) {
      const member = await lineClient.getGroupMemberProfile(groupId, userId);
      return { userId, displayName: member.displayName, pictureUrl: member.pictureUrl };
    }
    const profile = await lineClient.getProfile(userId);
    return { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch (err) {
    logger.warn({ err, userId }, 'Could not get user profile');
    return null;
  }
}
