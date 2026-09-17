import cron from 'node-cron';
import * as usersRepo from '../services/notion/users-repository.js';
import { notionPost } from '../services/notion/notion-fetch.js';
import { getProfile } from '../services/line/profile-service.js';
import { getTitle, getRichText, getMultiSelect } from '../services/notion/property-helpers.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

// Try every group the user has ever been seen in (they may have left some of them,
// which makes that group's profile lookup 404), stopping at the first one that
// resolves. Returns null when none of the user's groups yield a profile.
async function resolveDisplayName(userId: string, groups: string[]): Promise<string | null> {
  for (const groupId of groups) {
    const profile = await getProfile(userId, groupId);
    if (profile) return profile.displayName;
  }
  return null;
}

export async function updateDisplayNames(): Promise<void> {
  logger.info('Starting display name batch update');
  try {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {}) as any;
    const pages = response.results as any[];

    let updated = 0;
    let skipped = 0;
    for (const page of pages) {
      const userId = getTitle(page.properties, 'user_id');
      if (!userId) continue;

      const groups = getMultiSelect(page.properties, 'groups');
      if (groups.length === 0) {
        logger.info({ userId }, 'Skipping display name update: user has no known groups');
        skipped++;
        continue;
      }

      const displayName = await resolveDisplayName(userId, groups);
      if (displayName === null) {
        logger.warn({ userId, groups }, 'Could not resolve profile for user in any known group');
        skipped++;
        continue;
      }

      if (displayName !== getRichText(page.properties, 'Custom Name')) {
        await usersRepo.update(page.id, { customName: displayName });
        updated++;
      }

      // Small delay to avoid Notion rate limit
      await new Promise((r) => setTimeout(r, 400));
    }

    logger.info({ updated, skipped, total: pages.length }, 'Display name update complete');
  } catch (err) {
    logger.error({ err }, 'Display name update failed');
  }
}

export function startDisplayNameUpdate(): void {
  // Every Monday at 04:00 Asia/Taipei
  cron.schedule('0 4 * * 1', updateDisplayNames, { timezone: 'Asia/Taipei' });
  logger.info('Display name update scheduler started');
}
