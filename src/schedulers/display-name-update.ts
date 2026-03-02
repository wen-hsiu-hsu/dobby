import cron from 'node-cron';
import * as usersRepo from '../services/notion/users-repository.js';
import { notionPost } from '../services/notion/notion-fetch.js';
import { getProfile } from '../services/line/profile-service.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

async function updateDisplayNames(): Promise<void> {
  logger.info('Starting display name batch update');
  try {
    const response = await notionPost(`/databases/${env.NOTION_DB_USERS}/query`, {}) as any;
    const pages = response.results as any[];

    let updated = 0;
    for (const page of pages) {
      const userId = page.properties?.['user_id']?.title?.[0]?.plain_text;
      if (!userId) continue;

      const profile = await getProfile(userId);
      if (!profile) continue;

      if (profile.displayName !== page.properties?.['Custom Name']?.rich_text?.[0]?.plain_text) {
        await usersRepo.update(page.id, { customName: profile.displayName });
        updated++;
      }

      // Small delay to avoid Notion rate limit
      await new Promise((r) => setTimeout(r, 400));
    }

    logger.info({ updated, total: pages.length }, 'Display name update complete');
  } catch (err) {
    logger.error({ err }, 'Display name update failed');
  }
}

export function startDisplayNameUpdate(): void {
  // Every Monday at 04:00 Asia/Taipei
  cron.schedule('0 4 * * 1', updateDisplayNames, { timezone: 'Asia/Taipei' });
  logger.info('Display name update scheduler started');
}
