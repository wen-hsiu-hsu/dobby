import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';

const RETENTION_DAYS = 7;

export async function cleanOldLogs(logDir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(logDir);
  } catch {
    return; // logs/ doesn't exist yet
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);

  for (const file of files) {
    if (!file.endsWith('.log')) continue;

    // File name format: app.YYYY-MM-DD.json
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;

    const fileDate = new Date(match[1]);
    if (fileDate < cutoff) {
      const filePath = join(logDir, file);
      try {
        await unlink(filePath);
        logger.info({ file }, 'Deleted old log file');
      } catch (err) {
        logger.warn({ file, err }, 'Failed to delete old log file');
      }
    }
  }
}

export function startLogCleanup(logDir: string): void {
  cleanOldLogs(logDir).catch((err: unknown) => {
    logger.error({ err }, 'Log cleanup run failed');
  });

  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    cleanOldLogs(logDir).catch((err: unknown) => {
      logger.error({ err }, 'Log cleanup run failed');
    });
  }, INTERVAL_MS);
}
