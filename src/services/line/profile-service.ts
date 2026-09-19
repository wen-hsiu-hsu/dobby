import { lineClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

// 實際打的 endpoint（見 node_modules/@line/bot-sdk 的 messagingApiClient.js）：
// getGroupMemberProfile -> GET /v2/bot/group/{groupId}/member/{userId}
// getProfile            -> GET /v2/bot/profile/{userId}
const GROUP_MEMBER_PATH = '/v2/bot/group/{groupId}/member/{userId}';
const USER_PROFILE_PATH = '/v2/bot/profile/{userId}';

export async function getProfile(userId: string, groupId?: string): Promise<LineProfile | null> {
  const method = 'GET';
  const path = groupId ? GROUP_MEMBER_PATH : USER_PROFILE_PATH;
  try {
    let result: LineProfile;
    if (groupId) {
      const member = await lineClient.getGroupMemberProfile(groupId, userId);
      result = { userId, displayName: member.displayName, pictureUrl: member.pictureUrl };
    } else {
      const profile = await lineClient.getProfile(userId);
      result = { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
    }
    logger.info({ method, path }, 'LINE get profile');
    logger.debug({ method, path, userId, groupId, displayName: result.displayName }, 'LINE get profile detail');
    return result;
  } catch (err) {
    logger.warn({ err, method, path }, 'Could not get user profile');
    logger.debug({ method, path, userId, groupId }, 'Could not get user profile detail');
    return null;
  }
}
