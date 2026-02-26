import cron from 'node-cron';
import * as usersRepo from '../services/notion/users-repository.js';
import { getProfile } from '../services/line/profile-service.js';
import { logger } from '../utils/logger.js';

async function updateDisplayNames(): Promise<void> {
  logger.info('Starting display name batch update');
  try {
    // Get all users - we need to fetch all pages
    // For now, query all users (no filter)
    const { notion } = await import('../services/notion/notion-client.js');
    const { env } = await import('../config/env.js');

    const response = await notion.dataSources.query({ data_source_id: env.NOTION_DB_USERS });
    const pages = response.results as any[];

    let updated = 0;
    for (const page of pages) {
      const userId = page.properties?.['User ID']?.title?.[0]?.plain_text;
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
