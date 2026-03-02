import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger.js';

const LOG_DIR = 'logs';
const RETENTION_DAYS = 7;

export async function cleanOldLogs(): Promise<void> {
  let files: string[];
  try {
    files = await readdir(LOG_DIR);
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
      const filePath = join(LOG_DIR, file);
      await unlink(filePath);
      logger.info({ file }, 'Deleted old log file');
    }
  }
}

export function startLogCleanup(): void {
  void cleanOldLogs();
  const INTERVAL_MS = 24 * 60 * 60 * 1000;
  setInterval(() => { void cleanOldLogs(); }, INTERVAL_MS);
}
