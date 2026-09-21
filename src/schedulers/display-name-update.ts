import cron from 'node-cron';
import * as usersRepo from '../services/notion/users-repository.js';
import { getProfile } from '../services/line/profile-service.js';
import { logger } from '../utils/logger.js';
import { runWithContext } from '../utils/request-context.js';

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

/**
 * Wrapped in runWithContext so each cron run gets its own reqId — the /logs
 * 頁面把「排程」事件當成一個 reqId 分組來顯示，沒有 reqId 每次執行都會被
 * 併成同一組，看不出這是哪一次跑的。
 */
export async function updateDisplayNames(): Promise<void> {
  return runWithContext(() => doUpdateDisplayNames());
}

async function doUpdateDisplayNames(): Promise<void> {
  logger.info('Starting display name batch update');
  try {
    const users = await usersRepo.findAll();

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    for (const user of users) {
      if (!user.userId) continue;

      try {
        if (user.groups.length === 0) {
          logger.info({ userId: user.userId }, 'Skipping display name update: user has no known groups');
          skipped++;
          continue;
        }

        const displayName = await resolveDisplayName(user.userId, user.groups);
        if (displayName === null) {
          logger.warn({ userId: user.userId, groups: user.groups }, 'Could not resolve profile for user in any known group');
          skipped++;
          continue;
        }

        if (displayName !== user.customName) {
          await usersRepo.update(user.pageId, { customName: displayName });
          updated++;
        }
      } catch (err) {
        // Isolate per-user failures so one bad record doesn't stop the rest of the batch.
        logger.error({ err, userId: user.userId, pageId: user.pageId }, 'Failed to update display name for user, skipping');
        failed++;
      }

      // Small delay to avoid Notion rate limit
      await new Promise((r) => setTimeout(r, 400));
    }

    logger.info({ updated, skipped, failed, total: users.length }, 'Display name update complete');
  } catch (err) {
    logger.error({ err }, 'Display name update failed');
  }
}

export function startDisplayNameUpdate(): void {
  // Every Monday at 04:00 Asia/Taipei
  cron.schedule('0 4 * * 1', updateDisplayNames, { timezone: 'Asia/Taipei' });
  logger.info('Display name update scheduler started');
}
