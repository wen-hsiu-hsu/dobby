import { dobbyClient, battingClient } from '../../config/line.js';
import { logger } from '../../utils/logger.js';

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export async function getProfile(userId: string, groupId?: string): Promise<LineProfile | null> {
  // Try Dobby client first (with group context if available)
  try {
    if (groupId) {
      const member = await dobbyClient.getGroupMemberProfile(groupId, userId);
      return { userId, displayName: member.displayName, pictureUrl: member.pictureUrl };
    }
    const profile = await dobbyClient.getProfile(userId);
    return { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch {
    // fallback to batting client
  }

  try {
    const profile = await battingClient.getProfile(userId);
    return { userId, displayName: profile.displayName, pictureUrl: profile.pictureUrl };
  } catch (err) {
    logger.warn({ err, userId }, 'Could not get user profile from either client');
    return null;
  }
}
