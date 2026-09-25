import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';
import { MAX_WINDOW_DAYS as RETENTION_DAYS } from './log-reader.js';

export async function cleanOldLogs(logDir: string): Promise<void> {
  let files: string[];
  try {
    files = await readdir(logDir);
  } catch {
    return; // logs/ doesn't exist yet
  }

  // UTC-anchored cutoff: file dates come from `new Date('YYYY-MM-DD')`, which
  // parses date-only ISO strings as UTC midnight. Computing cutoff via
  // setDate()/setHours() would anchor it to the server's local timezone
  // instead — harmless today since the container runs with no TZ set (UTC),
  // but would silently shift the deletion boundary (by an amount that varies
  // with time-of-day, up to ~1 day) if TZ were ever set to Asia/Taipei,
  // including deleting a file before it's actually past retention.
  const now = new Date();
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - RETENTION_DAYS);

  for (const file of files) {
    if (!file.endsWith('.log')) continue;

    // File name format: app.YYYY-MM-DD.json
    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) continue;

    const fileDate = new Date(match[1]);
    if (fileDate.getTime() < cutoff) {
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
