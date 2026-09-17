import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const RETENTION_DAYS = 7;

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  reqId?: string;
  [key: string]: unknown;
}

export async function readRecentLogs(logDir: string): Promise<LogEntry[]> {
  let files: string[];
  try {
    files = await readdir(logDir);
  } catch {
    return [];
  }

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const jsonFiles = files
    .filter((f) => f.endsWith('.log'))
    .filter((f) => {
      const match = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!match) return false;
      return new Date(match[1]).getTime() >= cutoff;
    })
    .sort();

  const entries: LogEntry[] = [];

  for (const file of jsonFiles) {
    const content = await readFile(join(logDir, file), 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as LogEntry);
      } catch {
        // skip malformed lines
      }
    }
  }

  return entries.sort((a, b) => b.time - a.time);
}
