import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** 實體保留天數——`log-cleanup.ts` 直接 import 這個常數當它的刪除門檻（不是各自維護一份 `7`），`readRecentLogs` 的 `windowDays` 也不會被 clamp 超過這個值，因為超過保留期的檔案本來就不存在，讀了也拿不到更多資料。 */
export const MAX_WINDOW_DAYS = 7;
const DEFAULT_WINDOW_DAYS = 1;

export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  reqId?: string;
  [key: string]: unknown;
}

/**
 * 讀取最近 `windowDays` 天（預設 1 天＝24 小時，clamp 在 [1, MAX_WINDOW_DAYS]）
 * 的 log entries。`/logs` 頁面一次讀 7 天全部日誌、在伺服器端把每一筆事件完整
 * 展開內容都算好再送出，正式環境流量大時會拖慢頁面載入——縮小預設讀取範圍是
 * 這個問題的其中一半解法（另一半是 `routes/logs.ts` 把展開內容改成點擊時才
 * 用 `?detail=` 現組現拿，不是這裡的事）。
 *
 * 檔名只帶日期（`app.YYYY-MM-DD.N.log`），沒有精確時間，所以檔案篩選階段
 * 多抓一天當緩衝，再用 `time` 精確篩選一次——否則例如凌晨 00:30 查「最近
 * 24 小時」，會因為「昨天」那個檔案的日期早於 cutoff 一整天而被整批排除，
 * 即使它裡面大多數 entries 其實落在真正的最近 24 小時範圍內。
 */
export async function readRecentLogs(logDir: string, windowDays: number = DEFAULT_WINDOW_DAYS): Promise<LogEntry[]> {
  let files: string[];
  try {
    files = await readdir(logDir);
  } catch {
    return [];
  }

  const days = Math.min(Math.max(Math.trunc(windowDays) || DEFAULT_WINDOW_DAYS, 1), MAX_WINDOW_DAYS);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const fileSelectionCutoffMs = cutoffMs - 24 * 60 * 60 * 1000;

  const jsonFiles = files
    .filter((f) => f.endsWith('.log'))
    .filter((f) => {
      const match = f.match(/(\d{4}-\d{2}-\d{2})/);
      if (!match) return false;
      return new Date(match[1]).getTime() >= fileSelectionCutoffMs;
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

  return entries.filter((e) => (e.time ?? 0) >= cutoffMs).sort((a, b) => b.time - a.time);
}
